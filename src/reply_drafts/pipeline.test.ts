// 入口テスト。
// 「OFFなら何も起きない」「お試し実行で外部も状態も変わらない」
// 「同じイベントは1件」「同じ日の別件は別通知」「保存できなければ成功にしない」を固定する。

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadReplyDraftConfig, replyDraftStateDir } from "./config.js";
import { captureLineInquiryDraft } from "./line_intake.js";
import { processInquiryEvent } from "./pipeline.js";
import { jsonlPath, runLogPath } from "./store.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "reply-drafts-pipeline-"));
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter(entry => entry.isFile()).map(entry => entry.name);
}

function fakePush(ok = true) {
  const calls: string[] = [];
  return {
    calls,
    push: async (text: string) => {
      calls.push(text);
      return { ok, mode: "sent", error: ok ? undefined : "LINE push 500" };
    },
  };
}

function configFor(root: string, env: NodeJS.ProcessEnv): ReturnType<typeof loadReplyDraftConfig> {
  return { ...loadReplyDraftConfig(env), root };
}

const now = new Date("2026-09-02T00:12:00Z"); // JST 09:12（静音時間外）
const event = {
  source: "line" as const,
  text: "小学3年生でも体験できますか？",
  senderId: "U-customer",
  eventId: "evt-1",
  timestamp: 1_756_000_000_000,
};

// ---- OFF（未設定）なら何も起きない ----
{
  const root = await tempRoot();
  const push = fakePush();
  const result = await processInquiryEvent(event, { now, config: configFor(root, {}), push: push.push });
  assert(result.outcome === "off", "未設定では動かない");
  assert((await listFiles(root)).length === 0, "ファイルを1つも作らない");
  assert(push.calls.length === 0, "通知もしない");
  await fs.rm(root, { recursive: true, force: true });
}

// ---- Kill Switch は他の設定に関係なく止める（要件 §44）----
{
  const root = await tempRoot();
  const push = fakePush();
  const config = configFor(root, {
    REPLY_DRAFT_DISABLED: "true",
    REPLY_DRAFT_ENABLED: "true",
    OPENQLOW_DRY_RUN: "false",
  });
  const result = await processInquiryEvent(event, { now, config, push: push.push });
  assert(result.outcome === "disabled", "Kill Switch で停止");
  assert((await listFiles(root)).length === 0, "ファイルを1つも作らない");
  assert(push.calls.length === 0, "通知もしない");
  await fs.rm(root, { recursive: true, force: true });
}

// ---- お試し実行では外部も状態も変わらない（要件 §45）----
{
  const root = await tempRoot();
  const push = fakePush();
  const config = configFor(root, { REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "true" });
  const result = await processInquiryEvent(event, { now, config, push: push.push });
  assert(result.outcome === "dry_run", "お試し実行");
  assert(result.escalated === false, "判定だけは行う");
  assert((await listFiles(root)).length === 0, "保存も状態変更もしない");
  assert(push.calls.length === 0, "JINへも送らない");
  await fs.rm(root, { recursive: true, force: true });
}

// ---- 本番: 保存して通知する ----
{
  const root = await tempRoot();
  const push = fakePush();
  const config = configFor(root, { REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" });

  const first = await processInquiryEvent(event, { now, config, push: push.push });
  assert(first.ok && first.outcome === "saved", "保存できた");
  assert(first.notified === true, "JINへ通知した");
  assert(push.calls.length === 1, "通知は1回");
  assert(push.calls[0].includes("体験問い合わせ"), "分類が通知に出る");

  const drafts = await listFiles(path.join(replyDraftStateDir(root), "2026-09-02"));
  assert(drafts.length === 1, `下書きは1件（実際: ${drafts.length}）`);
  const jsonl = (await fs.readFile(jsonlPath(root), "utf8")).trim().split("\n");
  assert(jsonl.length === 1, "JSONLも1行");
  assert(await fs.readFile(runLogPath(root, "2026-09-02"), "utf8"), "実行ログが残る");

  // 同じイベントを2回受けても1件のまま（要件 §17）。
  const second = await processInquiryEvent(event, { now, config, push: push.push });
  assert(second.outcome === "duplicate", "2回目は重複");
  assert(push.calls.length === 1, "2回目は通知しない");
  assert((await listFiles(path.join(replyDraftStateDir(root), "2026-09-02"))).length === 1, "下書きは1件のまま");

  // 同じ日に別の問い合わせが来たら別件として通知する（要件 §20）。
  const other = await processInquiryEvent(
    { ...event, eventId: "evt-2", text: "料金はいくらですか" },
    { now, config, push: push.push },
  );
  assert(other.outcome === "saved", "別の問い合わせは保存される");
  assert(push.calls.length === 2, "同じ日でも別件は通知する");
  assert(push.calls[1].includes("料金問い合わせ"), "2件目の分類が出る");

  // JIN確認の件は本文を作らずに通知する。
  const escalated = await processInquiryEvent(
    { ...event, eventId: "evt-3", text: "先日の対応が最悪でした。責任者を出してください" },
    { now, config, push: push.push },
  );
  assert(escalated.escalated === true, "クレームはJIN確認");
  assert(push.calls[2].includes("JIN確認"), "JIN確認として通知する");
  assert(!push.calls[2].includes("下書き:"), "返信案は作らない");

  // 通知に載る本文に、生の連絡先が出ない（要件 §33）。
  await processInquiryEvent(
    { ...event, eventId: "evt-4", text: "体験希望です。電話は090-1234-5678、メールは taro@example.com です" },
    { now, config, push: push.push },
  );
  const withPii = push.calls[3];
  assert(!/090-1234-5678/.test(withPii), "電話番号が通知に出ない");
  assert(!/taro@example\.com/.test(withPii), "メールが通知に出ない");
  assert(!withPii.includes("U-customer"), "LINE の userId が通知に出ない");

  await fs.rm(root, { recursive: true, force: true });
}

// ---- 夜のうちに届いた分は、朝の実行でまとめて流れる（要件 §37-38）----
{
  const root = await tempRoot();
  const push = fakePush();
  const config = configFor(root, { REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" });
  const night = new Date("2026-09-01T14:30:00Z"); // JST 23:30

  const nightly = await processInquiryEvent({ ...event, eventId: "night-1" }, { now: night, config, push: push.push });
  assert(nightly.outcome === "saved", "夜でも保存はする");
  assert(nightly.notified === false && nightly.queued === true, "夜は通知せず保留へ");
  assert(push.calls.length === 0, "静音時間はLINEへ1通も送らない");

  const morning = new Date("2026-09-01T22:10:00Z"); // JST 翌07:10
  await processInquiryEvent({ ...event, eventId: "morning-1", text: "料金はいくらですか" }, { now: morning, config, push: push.push });
  assert(push.calls.length === 2, "朝は保留分と新着の2通が届く");
  assert(push.calls[0].includes("体験問い合わせ"), "1通目は夜の保留分");
  assert(push.calls[1].includes("料金問い合わせ"), "2通目は朝の新着");

  // もう一度朝に処理しても、保留分が二度届くことはない。
  await processInquiryEvent({ ...event, eventId: "morning-2", text: "駐車場はありますか" }, { now: morning, config, push: push.push });
  assert(push.calls.length === 3, "保留分の再送は起きない");

  await fs.rm(root, { recursive: true, force: true });
}

// ---- 保存できなければ成功扱いにしない（要件 §32）----
{
  const root = await tempRoot();
  const blocked = path.join(root, "blocked");
  await fs.writeFile(blocked, "not a directory", "utf8");
  const push = fakePush();
  const config = configFor(blocked, { REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" });
  const result = await processInquiryEvent(event, { now, config, push: push.push });
  assert(!result.ok && result.outcome === "save_failed", "保存失敗は成功にしない");
  assert(push.calls.length === 0, "保存できていないのに通知はしない");
  await fs.rm(root, { recursive: true, force: true });
}

// ---- 通知が失敗しても下書きは残る（要件 §32）----
{
  const root = await tempRoot();
  const push = fakePush(false);
  const config = configFor(root, { REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" });
  const result = await processInquiryEvent(event, { now, config, push: push.push });
  assert(result.ok && result.outcome === "saved", "保存は成功している");
  assert(result.notified === false && result.queued === true, "通知は保留へ回る");
  assert((await listFiles(path.join(replyDraftStateDir(root), "2026-09-02"))).length === 1, "下書きは残っている");
  await fs.rm(root, { recursive: true, force: true });
}

// ---- LINEの受け口は、どんな結果でもお客様へ返信しない ----
{
  const root = await tempRoot();
  const push = fakePush();
  for (const env of [
    {},
    { REPLY_DRAFT_DISABLED: "true", REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" },
    { REPLY_DRAFT_ENABLED: "true" },
    { REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" },
  ]) {
    const result = await captureLineInquiryDraft(
      { text: "体験したいです", lineUserId: "U-customer", webhookEventId: `evt-${Math.random()}` },
      { now, config: configFor(root, env), push: push.push },
    );
    assert(result.replyToSender === false, "お客様へは返信しない");
  }
  // 本文が空のイベントは何もしない。
  const empty = await captureLineInquiryDraft({ text: "   " }, { now, config: configFor(root, {}) });
  assert(!empty.handled && empty.replyToSender === false, "空文は拾わない");
  await fs.rm(root, { recursive: true, force: true });
}

console.log("reply_drafts pipeline tests passed");
