import { buildProspectFromInquiry } from "./intake.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const fixedNow = () => new Date("2026-06-11T09:00:00.000Z");

// --- キッズ・中温度: 分類→台帳の下書きにマッピングされる --------------------
const kids = buildProspectFromInquiry(
  { message: "小学生の子供に習わせたいのですが、初心者でも大丈夫ですか？" },
  { name: "田中", contactSource: "LINE", now: fixedNow },
);
assert(kids.prospect.category === "kids", `kids => category kids, got ${kids.prospect.category}`);
assert(kids.prospect.temperature === "B", `mid => B, got ${kids.prospect.temperature}`);
assert(kids.prospect.status === "new_inquiry", "status defaults to new_inquiry");
assert(kids.prospect.name === "田中", "name passed through");
assert(kids.prospect.contactSource === "LINE", "contact source passed through");
assert(kids.prospect.inquiryText?.includes("小学生"), "inquiry text stored");
assert(kids.prospect.aiReply?.trimEnd().endsWith("AIKA"), "AI reply draft stored and signed");
assert(kids.replyDraft === kids.prospect.aiReply, "replyDraft mirrors stored aiReply");
assert(kids.prospect.lastContactAt === "2026-06-11T09:00:00.000Z", "lastContactAt uses injected now");
assert(kids.prospect.nextAction === "返信して様子を見る", `await_reply label, got ${kids.prospect.nextAction}`);

// --- 女性・高温度（体験予約）: A / female / 体験日程提案 ---------------------
const woman = buildProspectFromInquiry({ message: "体験予約したい女性です。" });
assert(woman.prospect.category === "female", "女性 => female");
assert(woman.prospect.temperature === "A", "予約 => high => A");
assert(woman.prospect.gender === "female", "gender inferred female");
assert(woman.prospect.nextAction === "体験日程を提案する", "high temp => propose schedule");

// --- 男性指定: gender 明示を優先 --------------------------------------------
const man = buildProspectFromInquiry({ message: "運動不足を解消したいです", gender: "male" });
assert(man.prospect.category === "male", "gender male => category male");
assert(man.prospect.gender === "male", "explicit gender kept");

// --- 低温度（検討中・料金だけ）: C ------------------------------------------
const cool = buildProspectFromInquiry({ message: "まだ迷っています。とりあえず料金だけ教えてください。" });
assert(cool.prospect.temperature === "C", `low => C, got ${cool.prospect.temperature}`);

// --- 目的が拾われる ----------------------------------------------------------
const diet = buildProspectFromInquiry({ message: "ダイエット目的で通いたいです" });
assert(diet.prospect.purpose === "ダイエット", `purpose=ダイエット, got ${diet.prospect.purpose}`);

console.log("crm intake tests passed");
