// 仕分けテスト。
// 一番大事なのは「未成年だから全部止める」にしないこと（要件 §6）と、
// 危ない話は必ず止めること（要件 §23）。

import { triageInquiry } from "./triage.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// ---- 未成年の通常質問は下書きを作ってよい ----
const kidsOk = [
  "小学3年生でも通えますか",
  "何歳から参加できますか",
  "キッズクラスは何曜日ですか",
  "子どもが体験できますか",
  "子どもの持ち物は何ですか",
  "キッズの料金はいくらですか",
];
for (const message of kidsOk) {
  const result = triageInquiry(message);
  assert(result.aboutMinor, `未成年の話と判定される: ${message}`);
  assert(!result.escalate, `通常のキッズ問い合わせは止めない: ${message}`);
}

// ---- 未成年のセンシティブ案件は止める ----
const kidsEscalate = [
  "子どもが怪我をしているのですが参加できますか",
  "息子が喘息の持病があります",
  "娘が学校でいじめにあっていて相談したいです",
  "子どもの発達のことで相談があります",
  "小学生の息子への特別な配慮をお願いできますか",
  "子どもの料金の件でクレームがあります",
];
for (const message of kidsEscalate) {
  const result = triageInquiry(message);
  assert(result.escalate, `未成年センシティブは止める: ${message}`);
  assert(result.priority === "ESCALATE", `優先度はESCALATE: ${message}`);
}

// ---- 大人でも危ない話は止める（要件 §23）----
const escalateCases: Array<[string, string]> = [
  ["対応が最悪でした。責任者を出してください", "complaint"],
  ["持病があるのですが参加できますか", "medical"],
  ["肩を痛めていて痛みがあります", "injury"],
  ["弁護士に相談しようと思っています", "legal"],
  ["会費が二重に引き落とされています", "money_trouble"],
  ["返金してほしいのですが", "refund"],
  ["退会したいのですが違約金はかかりますか", "membership_trouble"],
  ["休会したいです", "membership_trouble"],
  ["練習中に暴力を受けました", "violence"],
  ["練習中に事故がありました", "accident"],
  ["特別に値引きしてもらえませんか", "special_request"],
];
for (const [message, reason] of escalateCases) {
  const result = triageInquiry(message);
  assert(result.escalate, `止めるべき: ${message}`);
  assert(result.reasons.includes(reason as never), `理由に ${reason} が入る: ${message}`);
}

// ---- 正本に無いサービスは推測で答えない（要件 §26）----
const outsideCanon = [
  "パーソナルレッスンの料金を教えてください",
  "マンツーマンで見てもらえますか",
  "出張指導はやっていますか",
  "法人研修をお願いできますか",
  "プロテインの物販はありますか",
  "取材をお願いしたいのですが",
];
for (const message of outsideCanon) {
  const result = triageInquiry(message);
  assert(result.escalate, `正本に無い話は止める: ${message}`);
  assert(result.reasons.includes("outside_canon"), `理由は outside_canon: ${message}`);
}

// 情報が無さすぎる問い合わせも止める。
assert(triageInquiry("？").escalate, "情報不足は止める");
assert(triageInquiry("").escalate, "空文は止める");

// ---- 分類と優先度（要件 §21 / §22）----
const classified: Array<[string, string, string]> = [
  ["体験したいです", "trial", "A"],
  ["見学だけでも大丈夫ですか", "tour", "A"],
  ["入会したいのですが", "join", "A"],
  ["月会費はいくらですか", "price", "B"],
  ["キッズクラスはありますか", "kids", "B"],
  ["レディースクラスの時間を教えてください", "ladies", "B"],
  ["柔術のクラスはありますか", "class", "B"],
  ["営業時間を教えてください", "hours", "B"],
  ["持ち物は何ですか", "bring", "C"],
  ["場所はどこですか", "access", "C"],
  ["駐車場はありますか", "parking", "C"],
  ["こんにちは", "other", "C"],
];
for (const [message, category, priority] of classified) {
  const result = triageInquiry(message);
  assert(result.category === category, `${message} は ${category}（実際: ${result.category}）`);
  assert(result.priority === priority, `${message} は優先度 ${priority}（実際: ${result.priority}）`);
}

console.log("reply_drafts triage tests passed");
