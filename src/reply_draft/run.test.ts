import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { pushLineMessage } from "../line_bot/notifier.js";
import { loadReplyDraftConfig, type ReplyDraftConfig } from "./config.js";
import { buildReplyDraft, type InboundMessage } from "./draft.js";
import { captureInboundForDraft } from "./intake.js";
import { appendInbound, claimPath, readInbox } from "./store.js";
import { hourInJst, isReplyDraftCliEntry, runReplyDraft } from "./run.js";

const NOW = new Date("2026-09-02T09:12:00+09:00");
const NIGHT = new Date("2026-09-02T23:30:00+09:00");

function stubPush(mode: "sent" | "dry_run" | "skipped" = "sent"): { push: typeof pushLineMessage; sent: string[] } {
  const sent: string[] = [];
  const push: typeof pushLineMessage = async text => {
    sent.push(text);
    return { ok: true, mode };
  };
  return { push, sent };
}

async function freshRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "openqlow-reply-run-"));
}

function configFor(overrides: Partial<ReplyDraftConfig> = {}): ReplyDraftConfig {
  return {
    ...loadReplyDraftConfig({ OPENQLOW_REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" }),
    ...overrides,
  };
}

function inbound(externalId: string, text: string): InboundMessage {
  return {
    source: "line",
    externalId,
    text,
    senderId: `U-${externalId}`,
    receivedAt: "2026-09-02T00:10:00.000Z",
  };
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.lstat(file);
    return true;
  } catch {
    return false;
  }
}

// JSTの「時」を正しく取る（静音時間の判定の土台）。
{
  assert.equal(hourInJst(new Date("2026-09-02T09:12:00+09:00")), 9);
  assert.equal(hourInJst(new Date("2026-09-02T23:30:00+09:00")), 23);
  assert.equal(hourInJst(new Date("2026-09-01T15:30:00Z")), 0, "UTC15:30はJSTでは翌0時");
}

// スイッチを入れないと1件も動かない。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");
  await appendInbound(stateDir, inbound("msg-01", "体験に興味があります。土曜は空いていますか？"));

  const { push, sent } = stubPush();
  const result = await runReplyDraft({
    config: loadReplyDraftConfig({}),
    now: NOW,
    stateDir,
    logDir: path.join(root, "logs"),
    vaultRoot: path.join(root, "vault"),
    pushFn: push,
  });

  assert.equal(result.mode, "not_enabled");
  assert.equal(result.created, 0);
  assert.equal(sent.length, 0);
  assert.equal((await readInbox(stateDir)).length, 1, "待ち行列も消さない");
}

// 緊急停止。
{
  const root = await freshRoot();
  const { push, sent } = stubPush();
  const result = await runReplyDraft({
    config: configFor({ disabled: true }),
    now: NOW,
    stateDir: path.join(root, "state"),
    logDir: path.join(root, "logs"),
    pushFn: push,
  });
  assert.equal(result.mode, "disabled");
  assert.equal(sent.length, 0);
}

// お試し実行: 下書きは組み立てるが、保存も通知もしない。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");
  await appendInbound(stateDir, inbound("msg-01", "体験に興味があります。土曜は空いていますか？"));

  const { push, sent } = stubPush();
  const result = await runReplyDraft({
    config: configFor({ dryRun: true }),
    now: NOW,
    stateDir,
    logDir: path.join(root, "logs"),
    vaultRoot: path.join(root, "vault"),
    pushFn: push,
  });

  assert.equal(result.mode, "drafted");
  assert.equal(result.created, 1);
  assert.equal(result.notified, "dry_run");
  assert.equal(sent.length, 0, "お試し実行では送らない");
  assert.equal(await exists(path.join(stateDir, "records")), false, "保存もしない");
  assert.equal((await readInbox(stateDir)).length, 1, "待ち行列はそのまま");
  assert.ok(result.message?.includes("送るのはJIN"), "本文は確認できる");
}

// 本番実行: 保存し、ログを書き、Vaultにも書き、JINへ1通送る。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");
  const vaultRoot = path.join(root, "vault");
  await fs.mkdir(vaultRoot, { recursive: true });
  await appendInbound(stateDir, inbound("msg-01", "体験に興味があります。土曜の昼は空いていますか？"));
  await appendInbound(stateDir, inbound("msg-02", "来月で退会したいです。手続きを教えてください。"));

  const { push, sent } = stubPush();
  const result = await runReplyDraft({
    config: configFor(),
    now: NOW,
    stateDir,
    logDir: path.join(root, "logs"),
    vaultRoot,
    pushFn: push,
  });

  assert.equal(result.mode, "drafted");
  assert.equal(result.created, 2);
  assert.equal(result.notified, "sent");
  assert.equal(sent.length, 1, "1通にまとめて送る");
  assert.match(sent[0], /新着 2件（そのまま送れる 1件 \/ JIN確認 1件）/);

  assert.equal((await fs.readdir(path.join(stateDir, "records"))).length, 2);
  assert.equal(await exists(path.join(root, "logs", "2026-09-02.md")), true);
  assert.equal(
    await exists(path.join(vaultRoot, "30_INBOX/openqlow/reply_drafts", "2026-09-02.md")),
    true,
  );
  assert.deepEqual(await readInbox(stateDir), [], "処理した受信は待ち行列から消える");
}

// 同じ受信が2回入っても、下書きは1つだけ。通知も繰り返さない。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");
  const shared = { now: NOW, stateDir, logDir: path.join(root, "logs"), vaultRoot: path.join(root, "vault") };

  await appendInbound(stateDir, inbound("msg-01", "体験に興味があります。土曜は空いていますか？"));
  const first = stubPush();
  const firstRun = await runReplyDraft({ ...shared, config: configFor(), pushFn: first.push });
  assert.equal(firstRun.created, 1);

  await appendInbound(stateDir, inbound("msg-01", "体験に興味があります。土曜は空いていますか？"));
  const second = stubPush();
  const secondRun = await runReplyDraft({ ...shared, config: configFor(), pushFn: second.push });

  assert.equal(secondRun.created, 0);
  assert.equal(secondRun.skipped, 1);
  assert.equal(secondRun.mode, "no_inbound");
  assert.equal(second.sent.length, 0, "同じ内容を2回送らない");
  assert.equal((await fs.readdir(path.join(stateDir, "records"))).length, 1);
}

// 静音時間: 下書きは作るが送らない。翌朝の実行で送る。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");
  const shared = { stateDir, logDir: path.join(root, "logs"), vaultRoot: path.join(root, "vault") };
  await appendInbound(stateDir, inbound("msg-01", "体験に興味があります。土曜は空いていますか？"));

  const night = stubPush();
  const nightRun = await runReplyDraft({ ...shared, config: configFor(), now: NIGHT, pushFn: night.push });
  assert.equal(nightRun.notified, "quiet_hours");
  assert.equal(night.sent.length, 0, "夜中は送らない");
  assert.equal(nightRun.created, 1, "下書き自体は作ってある");

  const morning = stubPush();
  const morningRun = await runReplyDraft({
    ...shared,
    config: configFor(),
    now: new Date("2026-09-03T07:05:00+09:00"),
    pushFn: morning.push,
  });
  assert.equal(morningRun.notified, "sent");
  assert.equal(morning.sent.length, 1, "翌朝にまとめて届く");
  assert.equal(morningRun.created, 0, "作り直さない");
}

// 送れなかったときは未通知のまま残し、次の実行でやり直す。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");
  const shared = { stateDir, logDir: path.join(root, "logs"), vaultRoot: path.join(root, "vault"), now: NOW };
  await appendInbound(stateDir, inbound("msg-01", "体験に興味があります。土曜は空いていますか？"));

  const skipped = stubPush("skipped");
  const firstRun = await runReplyDraft({ ...shared, config: configFor(), pushFn: skipped.push });
  assert.equal(firstRun.notified, "skipped");

  const retry = stubPush("sent");
  const secondRun = await runReplyDraft({ ...shared, config: configFor(), pushFn: retry.push });
  assert.equal(secondRun.notified, "sent");
  assert.equal(retry.sent.length, 1, "届かなかったぶんはやり直せる");
}

// Vaultが無い日でも、ローカルには残り、通知も届く。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");
  await appendInbound(stateDir, inbound("msg-01", "体験に興味があります。土曜は空いていますか？"));

  const { push, sent } = stubPush();
  const result = await runReplyDraft({
    config: configFor(),
    now: NOW,
    stateDir,
    logDir: path.join(root, "logs"),
    vaultRoot: path.join(root, "存在しないVault"),
    pushFn: push,
  });

  assert.equal(result.vaultPath, undefined);
  assert.equal(await exists(path.join(root, "logs", "2026-09-02.md")), true);
  assert.equal(sent.length, 1);
}

// webhook の受け口: 無効なら何も記録しない。お客様へは常に返さない。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");

  const off = await captureInboundForDraft(
    { text: "体験できますか？", lineUserId: "U-1", messageId: "m-1" },
    { config: loadReplyDraftConfig({}), stateDir },
  );
  assert.equal(off.captured, false);
  assert.equal(off.replyToSender, false);
  assert.equal((await readInbox(stateDir)).length, 0);

  const on = await captureInboundForDraft(
    { text: "体験できますか？", lineUserId: "U-1", messageId: "m-1" },
    { config: configFor(), stateDir, now: NOW },
  );
  assert.equal(on.captured, true);
  assert.equal(on.replyToSender, false, "お客様へは1文字も返さない");
  assert.equal((await readInbox(stateDir)).length, 1);

  // messageId が無いものは受け取らない（二重に下書きを作らないため）。
  const noId = await captureInboundForDraft(
    { text: "体験できますか？", lineUserId: "U-1" },
    { config: configFor(), stateDir },
  );
  assert.equal(noId.captured, false);
  assert.equal((await readInbox(stateDir)).length, 1);

  // 空の本文も受け取らない。
  const empty = await captureInboundForDraft(
    { text: "   ", lineUserId: "U-1", messageId: "m-2" },
    { config: configFor(), stateDir },
  );
  assert.equal(empty.captured, false);
}

// 1回に作る下書きは上限まで。あふれた分は待ち行列に残り、次の実行で作る。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");
  const shared = { stateDir, logDir: path.join(root, "logs"), vaultRoot: path.join(root, "vault"), now: NOW };

  for (let i = 1; i <= 7; i += 1) {
    await appendInbound(stateDir, inbound(`msg-0${i}`, "体験に興味があります。土曜は空いていますか？"));
  }

  const first = stubPush();
  const firstRun = await runReplyDraft({ ...shared, config: configFor({ maxPerRun: 3 }), pushFn: first.push });
  assert.equal(firstRun.created, 3, "上限まで");
  assert.equal(firstRun.deferred, 4, "残りは次回へ");
  assert.equal((await readInbox(stateDir)).length, 4, "待ち行列に残る");
  assert.match(first.sent[0], /新着 3件/);

  const second = stubPush();
  const secondRun = await runReplyDraft({ ...shared, config: configFor({ maxPerRun: 3 }), pushFn: second.push });
  assert.equal(secondRun.created, 3);
  assert.equal((await readInbox(stateDir)).length, 1);

  const third = stubPush();
  const thirdRun = await runReplyDraft({ ...shared, config: configFor({ maxPerRun: 3 }), pushFn: third.push });
  assert.equal(thirdRun.created, 1);
  assert.equal((await readInbox(stateDir)).length, 0, "最後まで作りきる");
  assert.equal((await fs.readdir(path.join(stateDir, "records"))).length, 7, "7件すべてが下書きになる");
}

// 実行中に webhook が受け取ったメッセージを取りこぼさない。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");
  const shared = { stateDir, logDir: path.join(root, "logs"), vaultRoot: path.join(root, "vault"), now: NOW };

  await appendInbound(stateDir, inbound("msg-01", "体験に興味があります。土曜は空いていますか？"));

  // 通知の最中に新しい受信が届く状況を作る。
  const sent: string[] = [];
  const pushDuringRun: typeof pushLineMessage = async text => {
    sent.push(text);
    await captureInboundForDraft(
      { text: "見学はできますか？", lineUserId: "U-9", messageId: "msg-99" },
      { config: configFor(), stateDir, now: NOW },
    );
    return { ok: true, mode: "sent" };
  };

  const result = await runReplyDraft({ ...shared, config: configFor(), pushFn: pushDuringRun });
  assert.equal(result.created, 1);
  assert.equal(sent.length, 1);
  assert.deepEqual(
    (await readInbox(stateDir)).map(item => item.externalId),
    ["msg-99"],
    "実行中に届いた分は消えない",
  );

  const next = stubPush();
  const nextRun = await runReplyDraft({ ...shared, config: configFor(), pushFn: next.push });
  assert.equal(nextRun.created, 1, "次の実行で下書きになる");
}

// 実行が途中で落ちても受信は失わない。次の実行で拾う。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");
  const shared = { stateDir, logDir: path.join(root, "logs"), vaultRoot: path.join(root, "vault"), now: NOW };

  await appendInbound(stateDir, inbound("msg-01", "体験に興味があります。土曜は空いていますか？"));

  const crashing: typeof pushLineMessage = async () => {
    throw new Error("通知の途中で落ちた");
  };
  await assert.rejects(runReplyDraft({ ...shared, config: configFor(), pushFn: crashing }));
  assert.equal(await exists(claimPath(stateDir)), false, "受信は待ち行列から切り離され、下書きは保存済み");

  // 下書きは残っているので、次の実行で通知だけやり直せる。
  const retry = stubPush();
  const retryRun = await runReplyDraft({ ...shared, config: configFor(), pushFn: retry.push });
  assert.equal(retryRun.created, 0);
  assert.equal(retry.sent.length, 1, "作った下書きは失われない");
}

// 1件の下書きが作れなくても、実行は止まらず、残りは作られる。
// 止めてしまうと、その受信が待ち行列に残り続けて、次の実行も同じ場所で落ちる。
{
  const root = await freshRoot();
  const stateDir = path.join(root, "state");
  await appendInbound(stateDir, inbound("msg-01", "体験に興味があります。土曜は空いていますか？"));
  await appendInbound(stateDir, inbound("msg-bad", "壊れた入力"));
  await appendInbound(stateDir, inbound("msg-03", "見学だけでもできますか？"));

  const { push, sent } = stubPush();
  const result = await runReplyDraft({
    config: configFor(),
    now: NOW,
    stateDir,
    logDir: path.join(root, "logs"),
    vaultRoot: path.join(root, "vault"),
    pushFn: push,
    draftBuilder: (message, when) => {
      if (message.externalId === "msg-bad") throw new Error("解析できない中身");
      return buildReplyDraft(message, when);
    },
  });

  assert.equal(result.created, 3, "3件とも記録する");
  assert.equal((await readInbox(stateDir)).length, 0, "待ち行列に詰まりを残さない");

  const failed = result.drafts.find(draft => draft.externalId === "msg-bad");
  assert.equal(failed?.needsHuman, true);
  assert.match(failed?.humanReason ?? "", /下書きの作成に失敗/);
  assert.match(sent[0], /JIN確認 1件/, "作れなかったこともJINに伝わる");
}

// CLI エントリ判定。
{
  assert.equal(isReplyDraftCliEntry("file:///app/src/reply_draft/run.ts", "/app/src/reply_draft/run.ts"), true);
  assert.equal(isReplyDraftCliEntry("file:///app/dist/reply_draft/run.js", "/app/dist/reply_draft/run.js"), true);
  assert.equal(isReplyDraftCliEntry("file:///app/src/reply_draft/run.ts", "/app/src/index.ts"), false);
  assert.equal(isReplyDraftCliEntry("file:///app/src/reply_draft/run.ts", undefined), false);
}

console.log("reply draft run tests passed");
