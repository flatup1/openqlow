// 下書き作成テスト。
// 「正本の事実しか出さない」「危ない話には本文を作らない」「個人情報を残さない」を固定する。

import { FLATUP_CANON } from "../shared/canon.js";
import { buildReplyDraft, nonCanonAmounts } from "./draft.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// ---- 通常の問い合わせは下書きができる ----
const normal = [
  "小学3年生でも体験できますか？",
  "料金はいくらですか",
  "女性ですが初心者でも大丈夫ですか？体験したいです",
  "駐車場はありますか",
  "持ち物を教えてください",
  "何歳から通えますか",
  "キッズクラスは何曜日ですか",
];
for (const message of normal) {
  const draft = buildReplyDraft(message);
  assert(!draft.escalate, `下書きを作る: ${message}`);
  assert(!!draft.body && draft.body.length > 20, `本文がある: ${message}`);
  assert(typeof draft.qualityTotal === "number", `採点が付く: ${message}`);
  // 正本に無い金額を作文しない（要件 §26）。
  assert(nonCanonAmounts(draft.body ?? "").length === 0, `正本外の金額を出さない: ${message}`);
}

// ---- 危ない話には本文を作らない（要件 §23）----
const escalated = [
  "先日の対応が最悪でした。責任者を出してください",
  "持病があるのですが大丈夫でしょうか",
  "肩を痛めていて痛みがあります",
  "退会したいのですが違約金は？",
  "返金してもらえますか",
  "弁護士に相談します",
  "子どもが怪我をしています",
];
for (const message of escalated) {
  const draft = buildReplyDraft(message);
  assert(draft.escalate, `止める: ${message}`);
  assert(draft.body === undefined, `本文を作らない: ${message}`);
  assert(draft.priority === "ESCALATE", `優先度はESCALATE: ${message}`);
  assert(draft.notes.length > 0, `理由の説明がある: ${message}`);
}

// ---- 個人情報は伏字にしてから扱う（要件 §28 / §33）----
const withPii = buildReplyDraft("電話番号は090-1234-5678、メールは taro@example.com です。体験希望です");
assert(!/090-1234-5678/.test(withPii.maskedMessage), "電話番号を残さない");
assert(!/taro@example\.com/.test(withPii.maskedMessage), "メールを残さない");
assert(/████/.test(withPii.maskedMessage), "伏字になっている");
assert(!!withPii.body, "伏字にしたうえで下書きは作る");
assert(!/090-1234-5678/.test(withPii.body ?? ""), "下書きにも電話番号を出さない");

// ---- 料金は正本の値だけ（要件 §25 / §26）----
const price = buildReplyDraft("料金を教えてください");
assert((price.body ?? "").includes(FLATUP_CANON.trialFirst), "初回体験の金額は正本の表記");
assert((price.body ?? "").includes("入会金10,000円"), "入会金は正本の値");

// 正本にない金額は検出できる（ガードそのもののテスト）。
assert(nonCanonAmounts("月会費は12,345円です").length === 1, "正本外の金額を検出する");
assert(nonCanonAmounts("初回体験500円です").length === 0, "正本の金額は通す");

// 空の問い合わせは推測で埋めずJIN確認へ。
const empty = buildReplyDraft("   ");
assert(empty.escalate && empty.body === undefined, "空文は本文を作らない");

console.log("reply_drafts draft tests passed");
