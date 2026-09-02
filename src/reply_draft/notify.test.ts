import assert from "node:assert/strict";
import { buildReplyDraft, type InboundMessage } from "./draft.js";
import { buildDraftLog, buildDraftNotification } from "./notify.js";

const NOW = new Date("2026-09-02T09:12:00+09:00");
const OPTIONS = {
  maxPerRun: 5,
  detailPath: "30_INBOX/openqlow/reply_drafts/2026-09-02.md",
  dateJst: "2026-09-02",
  timeJst: "09:12",
};

function inbound(externalId: string, text: string): InboundMessage {
  return {
    source: "line",
    externalId,
    text,
    senderId: `U-${externalId}`,
    receivedAt: "2026-09-02T00:10:00.000Z",
  };
}

const normal = buildReplyDraft(inbound("msg-01", "体験に興味があります。土曜の昼は空いていますか？"), NOW);
const human = buildReplyDraft(inbound("msg-02", "来月で退会したいです。手続きを教えてください。"), NOW);

// 通知は結論から。件数、内訳、全文の場所、そして「送るのはJIN」。
{
  const message = buildDraftNotification([normal, human], OPTIONS);
  assert.match(message, /【返信の下書き】2026-09-02 09:12/);
  assert.match(message, /新着 2件（そのまま送れる 1件 \/ JIN確認 1件）/);
  assert.match(message, /下書き:/);
  assert.match(message, /JIN確認（退会・休会の手続き）。下書きは作っていません。/);
  assert.match(message, /全文: 30_INBOX\/openqlow\/reply_drafts\/2026-09-02\.md/);
  assert.match(message, /※ AIは送っていません。送るのはJINです。/);
  assert.ok(message.length <= 5000, "LINEの上限に収まる");
}

// 上限を超えたぶんは件数だけ出す。通知で埋め尽くさない。
{
  const many = Array.from({ length: 8 }, (_, index) =>
    buildReplyDraft(inbound(`msg-1${index}`, "体験を希望します。平日の夜は空いていますか？"), NOW),
  );
  const message = buildDraftNotification(many, { ...OPTIONS, maxPerRun: 3 });
  assert.match(message, /新着 8件/);
  assert.match(message, /ほか 5件/);
  assert.equal(message.includes("4. LINE"), false, "4件目は載せない");
}

// 連絡先は通知にもログにも出さない。
{
  const withPii = buildReplyDraft(
    inbound("msg-03", "体験希望です。090-1234-5678 か test@example.com へ連絡ください。"),
    NOW,
  );
  const message = buildDraftNotification([withPii], OPTIONS);
  const log = buildDraftLog([withPii], "2026-09-02");
  for (const text of [message, log]) {
    assert.doesNotMatch(text, /090-1234-5678/);
    assert.doesNotMatch(text, /test@example\.com/);
  }
}

// ログは1件ずつ。原文と下書きをそのまま残す。
{
  const log = buildDraftLog([normal, human], "2026-09-02");
  assert.match(log, /# 返信の下書き 2026-09-02/);
  assert.match(log, /状態: \*\*未送信\*\*/);
  assert.match(log, /### もらった内容（原文）/);
  assert.match(log, /土曜の昼は空いていますか？/);
  assert.match(log, /（作っていません。理由: 退会・休会の手続き）/);
  assert.match(log, /送るのはJIN。/);
}

// 新着ゼロでもログは壊れない。
{
  const log = buildDraftLog([], "2026-09-02");
  assert.match(log, /今日はまだ新着がありません。/);
}

console.log("reply draft notify tests passed");
