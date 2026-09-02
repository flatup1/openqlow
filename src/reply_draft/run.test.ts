import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { pushLineMessage } from "../line_bot/notifier.js";
import { loadReplyDraftConfig, type ReplyDraftConfig } from "./config.js";
import type { InboundMessage } from "./draft.js";
import { captureInboundForDraft } from "./intake.js";
import { appendInbound, readInbox } from "./store.js";
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

// CLI エントリ判定。
{
  assert.equal(isReplyDraftCliEntry("file:///app/src/reply_draft/run.ts", "/app/src/reply_draft/run.ts"), true);
  assert.equal(isReplyDraftCliEntry("file:///app/dist/reply_draft/run.js", "/app/dist/reply_draft/run.js"), true);
  assert.equal(isReplyDraftCliEntry("file:///app/src/reply_draft/run.ts", "/app/src/index.ts"), false);
  assert.equal(isReplyDraftCliEntry("file:///app/src/reply_draft/run.ts", undefined), false);
}

console.log("reply draft run tests passed");
