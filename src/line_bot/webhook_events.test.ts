import assert from "node:assert/strict";
import { extractLineEvents } from "./webhook_events.js";

const JIN = "U_jin";
const APPROVERS = new Set([JIN]);
const NO_GATE = new Set<string>();

function batch(...events: unknown[]): string {
  return JSON.stringify({ events });
}

function textEvent(userId: string, text: string, replyToken: string) {
  return { type: "message", replyToken, source: { userId }, message: { type: "text", text } };
}

function mediaEvent(userId: string, id: string, replyToken: string) {
  return { type: "message", replyToken, source: { userId }, message: { type: "image", id } };
}

// 本命の回帰テスト。以前は非承認者が1件混ざるとバッチ全体を捨てていたため、
// 同じバッチに入っていた承認者の指示まで消えていた。
{
  const extracted = extractLineEvents(
    batch(textEvent("U_guest", "体験の予約をしたいです", "tok_guest"), textEvent(JIN, "承認", "tok_jin")),
    APPROVERS,
  );
  // 会員のイベントも捨てずに返す。退会相談の受付に必要なため。
  // どの経路へ流すかは webhook.ts が isApprover で振り分ける
  // （会員は executeApprovalText へ渡さない）。
  assert.equal(extracted.events.length, 2, "承認者と会員の両方が残る");
  const jinEvent = extracted.events.find(event => event.userId === JIN);
  const guestEvent = extracted.events.find(event => event.userId === "U_guest");
  assert.equal(jinEvent?.text, "承認", "承認者の指示が取りこぼされない");
  assert.equal(jinEvent?.isApprover, true);
  assert.equal(guestEvent?.text, "体験の予約をしたいです", "会員のメッセージも残る");
  assert.equal(guestEvent?.isApprover, false, "会員は承認者として扱わない");
  assert.equal(extracted.ignored, undefined, "承認者のイベントが残る場合は ignored にしない");
  assert.equal(extracted.replyToken, "tok_jin", "返信先は承認者のイベントからだけ拾う");
}

// 承認者が先、非承認者が後でも取りこぼさない。
{
  const extracted = extractLineEvents(
    batch(textEvent(JIN, "承認", "tok_jin"), textEvent("U_guest", "こんにちは", "tok_guest")),
    APPROVERS,
  );
  assert.equal(extracted.events.length, 2);
  assert.equal(extracted.events.find(event => event.userId === JIN)?.isApprover, true);
  assert.equal(extracted.events.find(event => event.userId === "U_guest")?.isApprover, false);
  assert.equal(extracted.replyToken, "tok_jin");
}

// 会員だけのバッチも、退会相談として受けられるよう本文を残す。
// 返信トークンは承認者のイベントからしか取らないので、会員へ内部結果は返らない。
{
  const extracted = extractLineEvents(batch(textEvent("U_guest", "こんにちは", "tok_guest")), APPROVERS);
  assert.equal(extracted.events.length, 1);
  assert.equal(extracted.events[0].isApprover, false);
  assert.equal(extracted.replyToken, undefined, "会員へは返信しない");
}

// 非承認者のメディアは取り込まない。
{
  const extracted = extractLineEvents(
    batch(mediaEvent("U_guest", "mid_guest", "tok_guest"), mediaEvent(JIN, "mid_jin", "tok_jin")),
    APPROVERS,
  );
  assert.equal(extracted.events.length, 1);
  assert.equal(extracted.events[0].kind, "media");
  assert.equal(extracted.events[0].messageId, "mid_jin");
}

// 承認者IDが未設定のときは、これまでどおり全員を通す。
{
  const extracted = extractLineEvents(
    batch(textEvent("U_guest", "こんにちは", "tok_guest"), textEvent(JIN, "承認", "tok_jin")),
    NO_GATE,
  );
  assert.equal(extracted.events.length, 2);
  assert.equal(extracted.replyToken, "tok_guest");
}

// message 以外のイベントしか無い場合は、これまでどおり空で返す。
{
  const extracted = extractLineEvents(batch({ type: "follow", source: { userId: JIN } }), APPROVERS);
  assert.deepEqual(extracted, { events: [], linePayload: true, replyToken: undefined });
}

// LINE以外の本文（JSONでない／events配列が無い）はフォールバック経路に流す。
{
  const plain = extractLineEvents("おはよう", APPROVERS);
  assert.equal(plain.linePayload, false);
  assert.equal(plain.events[0].text, "おはよう");

  const noEvents = extractLineEvents(JSON.stringify({ hello: "world" }), APPROVERS);
  assert.equal(noEvents.linePayload, false);
}

console.log("line webhook events tests passed");
