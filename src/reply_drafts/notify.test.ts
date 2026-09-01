// 通知テスト。
// 「送り先はJINだけ」「静音時間は即時通知しない」「翌朝は1回だけ」
// 「1通知は最大5件、載らない分も保存済み」「送信失敗で下書きを失わない」を固定する。

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadReplyDraftConfig } from "./config.js";
import {
  deliverDrafts,
  flushPendingNotifications,
  pendingPath,
  renderNotification,
} from "./notify.js";
import { loadDraft, saveDraft, type ReplyDraftRecord } from "./store.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "reply-drafts-notify-"));
const config = { ...loadReplyDraftConfig({ REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" }), root };

function record(id: string, overrides: Partial<ReplyDraftRecord> = {}): ReplyDraftRecord {
  return {
    id,
    source: "line",
    eventKey: `line:${id}`,
    dateJst: "2026-09-02",
    receivedAt: "2026-09-02T00:12:00.000Z",
    senderPseudonym: "u_abcdef12",
    maskedMessage: "小学3年生でも体験できますか？",
    category: "trial",
    priority: "A",
    escalate: false,
    reasons: [],
    aboutMinor: true,
    body: "お問い合わせありがとうございます。初回体験500円でご案内できます。",
    qualityTotal: 100,
    needsRevision: false,
    notes: [],
    ...overrides,
  };
}

/** 送信の記録を取るだけの偽 push。宛先を渡されていないことも確認する。 */
function fakePush(ok = true) {
  const calls: string[] = [];
  const push = async (text: string, ...rest: unknown[]) => {
    assert(rest.length === 0, "通知は宛先を渡さない（既定のJIN宛のみ）");
    calls.push(text);
    return { ok, mode: ok ? "sent" : "sent", error: ok ? undefined : "LINE push 500" };
  };
  return { push, calls };
}

// ---- 本文の形（要件 §35）----
const rendered = renderNotification([record("d1"), record("d2", { source: "gmail" })], new Date("2026-09-02T00:12:00Z"), 5, root);
assert(rendered.startsWith("openQLOW"), "見出しは openQLOW");
assert(rendered.includes("【返信の下書き】"), "件名がある");
assert(rendered.includes("2026-09-02 09:12"), "日本時間の時刻が入る");
assert(rendered.includes("新着 2件"), "件数が入る");
assert(rendered.includes("LINE 1") && rendered.includes("Gmail 1"), "送信元ごとの件数が入る");
assert(rendered.includes("※AIはお客様へ送信していません。"), "送信していないことを明記");
assert(rendered.includes("※最終確認・送信はJINが行います。"), "最終判断はJINと明記");

// JIN確認の件は下書き本文を出さない。
const escalatedText = renderNotification(
  [record("d9", { escalate: true, priority: "ESCALATE", reasons: ["complaint"], body: undefined })],
  new Date("2026-09-02T00:12:00Z"),
  5,
  root,
);
assert(escalatedText.includes("JIN確認"), "JIN確認と表示する");
assert(escalatedText.includes("クレーム"), "理由を表示する");
assert(!escalatedText.includes("下書き:"), "JIN確認の件に下書きは出さない");

// ---- 1通知は最大5件、6件目以降は「ほか◯件」（要件 §36）----
const many = Array.from({ length: 8 }, (_, index) => record(`m${index}`));
const manyText = renderNotification(many, new Date("2026-09-02T00:12:00Z"), 5, root);
assert(manyText.includes("新着 8件"), "総件数は8件");
assert(manyText.includes("ほか3件"), "6件目以降はほか3件");
assert(manyText.includes("⑤") && !manyText.includes("⑥"), "本文に載るのは5件まで");

// ---- 昼間はその場で通知する ----
const day = new Date("2026-09-02T00:12:00Z"); // JST 09:12
const daytime = fakePush();
const saved = record("day1");
await saveDraft(root, saved);
const delivered = await deliverDrafts(root, [saved], day, config, { push: daytime.push });
assert(delivered.notified && delivered.notifiedCount === 1, "昼間は即時通知");
assert(daytime.calls.length === 1, "通知は1回");
assert((await loadDraft(root, saved.dateJst, saved.id))?.notifiedAt, "通知済みが記録される");

// ---- 静音時間は即時通知しない（要件 §37）----
const night = new Date("2026-09-01T14:30:00Z"); // JST 23:30
const nightPush = fakePush();
const nightRecords = [record("n1"), record("n2"), record("n3")];
for (const item of nightRecords) await saveDraft(root, item);
const nightResult = await deliverDrafts(root, nightRecords, night, config, { push: nightPush.push });
assert(!nightResult.notified, "静音時間は通知しない");
assert(nightResult.reason === "quiet_hours", "理由は静音時間");
assert(nightPush.calls.length === 0, "LINEへは1通も送らない");
assert(nightResult.queuedCount === 3, "保留へ積む（下書きは消えない）");
for (const item of nightRecords) {
  assert(await loadDraft(root, item.dateJst, item.id), "静音時間でも保存はされている");
}

// 静音時間中は保留を流そうとしても何も送らない。
const stillNight = await flushPendingNotifications(root, new Date("2026-09-01T20:59:00Z"), config, { push: nightPush.push });
assert(!stillNight.notified && nightPush.calls.length === 0, "6:59はまだ静音時間");

// ---- 翌7:00にまとめて1回だけ（要件 §38）----
const morningPush = fakePush();
const morning = new Date("2026-09-01T22:00:00Z"); // JST 翌07:00
const flushed = await flushPendingNotifications(root, morning, config, { push: morningPush.push });
assert(flushed.notified && flushed.notifiedCount === 3, "保留3件をまとめて通知");
assert(morningPush.calls.length === 1, "通知は1回だけ");
assert(morningPush.calls[0].includes("新着 3件"), "3件ぶんが1通に入る");

const again = await flushPendingNotifications(root, morning, config, { push: morningPush.push });
assert(!again.notified && morningPush.calls.length === 1, "2回目は送らない（二重通知しない）");

// ---- 通知に載らない6件目以降も、保存はされている（要件 §36）----
{
  const overnight = Array.from({ length: 8 }, (_, index) => record(`o${index}`, { dateJst: "2026-09-03" }));
  for (const item of overnight) await saveDraft(root, item);
  const quiet = new Date("2026-09-02T15:00:00Z"); // JST 翌00:00
  const queued = await deliverDrafts(root, overnight, quiet, config, { push: fakePush().push });
  assert(queued.queuedCount === 8, "8件とも保留へ");

  const batchPush = fakePush();
  const batch = await flushPendingNotifications(root, new Date("2026-09-02T22:00:00Z"), config, { push: batchPush.push });
  assert(batch.notifiedCount === 8, "8件ぶんをまとめて通知");
  assert(batchPush.calls[0].includes("ほか3件"), "本文に載るのは5件、残りはほか3件");
  for (const item of overnight) {
    assert(await loadDraft(root, item.dateJst, item.id), `通知に載らない件も保存されている: ${item.id}`);
  }
}

// ---- 通知に失敗しても下書きは消えない（要件 §32）----
const failing = fakePush(false);
const failed = record("f1");
await saveDraft(root, failed);
const failedResult = await deliverDrafts(root, [failed], day, config, { push: failing.push });
assert(!failedResult.notified && failedResult.reason === "push_failed", "失敗を成功にしない");
assert(await loadDraft(root, failed.dateJst, failed.id), "下書きは残っている");
const pending = JSON.parse(await fs.readFile(pendingPath(root), "utf8")) as { items: Array<{ id: string }> };
assert(pending.items.some(item => item.id === "f1"), "失敗した通知は保留へ戻る");

// 復旧後に流せば届く。
const retry = fakePush();
const retried = await flushPendingNotifications(root, day, config, { push: retry.push });
assert(retried.notified && retry.calls.length === 1, "復旧後に1回だけ届く");

await fs.rm(root, { recursive: true, force: true });
console.log("reply_drafts notify tests passed");
