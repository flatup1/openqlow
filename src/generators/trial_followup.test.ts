import { generateTrialFollowup, FLATUP_INFO } from "./trial_followup.js";
import { FLATUP_INFO as INFO_FROM_INQUIRY } from "./inquiry_reply.js";
import { parseArgs, renderResult } from "./trial_followup_cli.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- FLATUP_INFO は inquiry_reply の正本を再利用している（二重管理しない） ----
assert(FLATUP_INFO === INFO_FROM_INQUIRY, "trial_followup reuses inquiry_reply FLATUP_INFO (single source)");

// --- 検討中の30代女性：入会案内に女性料金＋入会金、全文 AIKA 締め -------------
const considering = generateTrialFollowup({
  gender: "female",
  ageBand: "30代",
  reaction: "ミット打ちが楽しそうでした",
  concern: "料金",
  enrollmentStatus: "検討中",
});
assert(considering.attribute === "women", `attribute=women, got ${considering.attribute}`);
assert(considering.temperature === "mid", `検討中 => mid temperature, got ${considering.temperature}`);
assert(considering.messages.sameDayThanks.includes("ミット打ち"), "same-day thanks weaves the reaction");
assert(considering.messages.nextDayFollow.includes("料金面"), "concern=料金 => price reassurance in next-day follow");
assert(considering.messages.enrollmentInfo.includes(FLATUP_INFO.priceWomen), "women enrollment info uses women price");
assert(considering.messages.enrollmentInfo.includes(FLATUP_INFO.joinFee), "enrollment info mentions join fee");
for (const msg of Object.values(considering.messages)) {
  assert(msg.trimEnd().endsWith("AIKA"), "every follow-up message is signed AIKA");
}

// --- キッズ：入会案内にキッズ料金 --------------------------------------------
const kids = generateTrialFollowup({ ageBand: "キッズ", enrollmentStatus: "保留" });
assert(kids.attribute === "kids", `attribute=kids, got ${kids.attribute}`);
assert(kids.messages.enrollmentInfo.includes(FLATUP_INFO.priceKids), "kids enrollment info uses kids price");

// --- 入会済み（高温度）：当日お礼が入会お礼版になる --------------------------
const enrolled = generateTrialFollowup({ gender: "male", enrollmentStatus: "はい" });
assert(enrolled.temperature === "high", "はい => high temperature");
assert(enrolled.messages.sameDayThanks.includes("ご入会"), "enrolled same-day thanks references ご入会");

// --- 見送り（低温度）：入会案内が押し込まない表現になる ----------------------
const declined = generateTrialFollowup({ gender: "female", enrollmentStatus: "いいえ" });
assert(declined.temperature === "low", "いいえ => low temperature");
assert(!declined.messages.enrollmentInfo.includes(FLATUP_INFO.joinFee), "declined enrollment info does not push join fee");
assert(declined.messages.enrollmentInfo.includes(FLATUP_INFO.trialFirst), "declined info gently mentions trial price for later");

// --- 不安点なし：汎用の安心材料にフォールバック ------------------------------
const noConcern = generateTrialFollowup({ gender: "male", concern: "なし" });
assert(noConcern.messages.nextDayFollow.includes("ご自分のペース"), "no concern => generic reassurance");

// --- 口コミ依頼は常に生成され、Google口コミに言及 ---------------------------
assert(considering.messages.reviewRequest.includes("Google口コミ"), "review request mentions Google review");

// --- 安全：注意書きに自動送信禁止が必ず入る ----------------------------------
assert(
  considering.notes.some(n => n.includes("自動送信はしません")),
  "notes must warn that auto-send is disabled",
);

// --- 引数なしでも生成できる（既定: beginner / mid） --------------------------
const empty = generateTrialFollowup();
assert(empty.attribute === "beginner", "default attribute is beginner");
assert(empty.temperature === "mid", "default temperature is mid");

// --- CLI 引数パース ----------------------------------------------------------
const parsed = parseArgs(["--gender", "female", "--age", "30代", "--concern", "時間", "--status", "検討中"]);
assert(parsed.gender === "female", "parses --gender");
assert(parsed.ageBand === "30代", "parses --age into ageBand");
assert(parsed.concern === "時間", "parses --concern");
assert(parsed.enrollmentStatus === "検討中", "parses --status into enrollmentStatus");

// --- CLI レンダリングが4文を含む --------------------------------------------
const rendered = renderResult({ gender: "female", reaction: "笑顔が多かった" });
assert(rendered.includes("① 当日お礼文"), "rendered output includes same-day thanks");
assert(rendered.includes("④ Google口コミ依頼文"), "rendered output includes review request");

console.log("trial followup tests passed");
