import assert from "node:assert/strict";
import { buildReplyDraft, draftIdFor, type InboundMessage } from "./draft.js";

const NOW = new Date("2026-09-02T09:12:00+09:00");

function inbound(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    source: "line",
    externalId: "msg-0001",
    text: "体験に興味があります。土曜の昼は空いていますか？",
    senderId: "U1234567890abcdef",
    receivedAt: "2026-09-02T00:10:00.000Z",
    ...overrides,
  };
}

// 同じ受信からは、いつも同じIDになる（二重に下書きを作らないための鍵）。
{
  assert.equal(draftIdFor("line", "msg-0001"), draftIdFor("line", "msg-0001"));
  assert.notEqual(draftIdFor("line", "msg-0001"), draftIdFor("line", "msg-0002"));
  assert.notEqual(draftIdFor("line", "msg-0001"), draftIdFor("gmail", "msg-0001"));
}

// 普通の問い合わせ: 下書きが出る。状態は必ず「未送信」。
{
  const draft = buildReplyDraft(inbound(), NOW);
  assert.equal(draft.needsHuman, false);
  assert.equal(draft.status, "draft_only");
  assert.equal(draft.notifiedAt, undefined, "作った時点では未通知");
  assert.ok((draft.draftText ?? "").length > 0, "そのまま送れる文がある");
  assert.ok((draft.shortDraftText ?? "").length > 0);
  assert.ok(draft.classification, "仕分け結果が付く");
  assert.ok((draft.qualityScore ?? 0) >= 70, "品質の下限を満たす");
}

// 送信者IDはそのまま残さない。伏せた形だけを持つ。
{
  const draft = buildReplyDraft(inbound(), NOW);
  assert.notEqual(draft.maskedSender, "U1234567890abcdef");
  assert.ok(draft.maskedSender.length > 0);
  assert.equal(JSON.stringify(draft).includes("U1234567890abcdef"), false, "元のIDがどこにも残らない");
}

// 本文の電話番号・メールは伏字にしてから持つ。
{
  const draft = buildReplyDraft(
    inbound({ text: "体験を希望します。090-1234-5678 か test@example.com へ連絡ください。" }),
    NOW,
  );
  assert.doesNotMatch(draft.inboundText, /090-1234-5678/);
  assert.doesNotMatch(draft.inboundText, /test@example\.com/);
  assert.doesNotMatch(JSON.stringify(draft), /090-1234-5678/);
}

// クレーム・健康・退会などは、下書きを作らずJIN確認に回す。
{
  for (const text of [
    "先日の対応が最悪でした。責任者をお願いします。",
    "肩に持病があり通院しています。参加できますか。",
    "来月で退会したいです。",
  ]) {
    const draft = buildReplyDraft(inbound({ text }), NOW);
    assert.equal(draft.needsHuman, true, text);
    assert.equal(draft.draftText, undefined, "文案は出さない");
    assert.ok((draft.humanReason ?? "").length > 0, "理由が入る");
  }
}

// 受信の原文は要約も書き換えもしない（伏字を除いてそのまま）。
{
  const text = "見学だけでもできますか？平日の夜だと助かります。";
  const draft = buildReplyDraft(inbound({ text }), NOW);
  assert.equal(draft.inboundText, text);
}

console.log("reply draft build tests passed");
