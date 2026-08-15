import { FLATUP_CANON } from "./canon.js";
import { FLATUP_INFO } from "../generators/shared.js";
import { generateInquiryReply } from "../generators/inquiry_reply.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 単一正本: FLATUP_INFO は FLATUP_CANON の再エクスポート（同一オブジェクト）であること。
assert(FLATUP_INFO === FLATUP_CANON, "FLATUP_INFO must be the single source FLATUP_CANON");

// 重要フィールドが欠けていないこと（再エクスポートで取りこぼしが無いか）。
const requiredKeys = [
  "trialFirst", "visitorSecond", "visitorPass6", "visitorPass12", "priceKids", "priceWomen", "priceMen", "joinFee",
  "bring", "parking", "gloveSet", "address", "nearestStation", "access",
  "scheduleKids", "scheduleLadies", "bookingMen", "bookingWomen", "noBooking",
  "businessHours", "classes", "parentDiscount", "referralBenefit", "cardKeyReturn",
] as const;
for (const k of requiredKeys) {
  assert(typeof (FLATUP_CANON as Record<string, unknown>)[k] === "string", `canon missing key: ${k}`);
}

// オーナー確定値の代表チェック（回帰防止）。
assert(FLATUP_CANON.gloveSet.includes("11,000"), "glove set price must be 11,000");
assert(FLATUP_CANON.nearestStation === "成田駅", "nearest station must be 成田駅");
assert(FLATUP_CANON.classes.includes("ムエタイ"), "classes must include ムエタイ");
assert(FLATUP_CANON.visitorPass6 === "6回券15,000円（1年有効）", "6-visit pass must match current pricing");
assert(FLATUP_CANON.visitorPass12 === "12回券30,000円（1年有効）", "12-visit pass must match current pricing");
assert(FLATUP_CANON.scheduleLadies === "土曜14:30〜15:30", "ladies class must be 14:30-15:30");
assert(FLATUP_CANON.businessHours.includes("18:00〜21:00"), "weekday evening staff hours must end at 21:00");
assert(FLATUP_CANON.cardKeyReturn.includes("1,000円"), "card key penalty must be 1,000円");

// 単一正本との一貫性: 顧客返信の料金が canon と一致（直書きドリフト検出 = R2ガード）
const trialDigits = FLATUP_CANON.trialFirst.replace(/[^0-9]/g, "");
const womenReply = generateInquiryReply({ message: "料金を教えてください", gender: "female" }).replies.polite;
assert(womenReply.includes(trialDigits), "inquiry reply trial price stays consistent with canon");
assert(womenReply.includes(FLATUP_CANON.priceWomen), "inquiry reply women monthly price comes from canon");

// 逆方向ガード: 生成した返信が、正本に無い金額を作り出していないこと。
//
// 上の検査は「正本の値が返信に入っているか」しか見ていない。お客様に実害が出るのは
// その逆で、正本のどこにも無い金額を返信が語ってしまう場合（料金の捏造・誤案内）。
// 部分一致では "1,000円" が正本の "11,000円" に一致して見逃すため、
// 前後が数字・カンマでないことまで確認する。
const canonText = Object.values(FLATUP_CANON).join("\n");
function canonHasAmount(amount: string): boolean {
  const escaped = amount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^0-9,])${escaped}([^0-9]|$)`).test(canonText);
}

const sampleMessages = [
  "料金を教えてください",
  "はじめてで不安ですが女性でも大丈夫ですか",
  "子どもを通わせたいのですが",
  "体験を予約したいです",
  "退会したい場合はどうすればよいですか",
];
for (const message of sampleMessages) {
  for (const gender of ["female", "male", undefined] as const) {
    const result = generateInquiryReply(gender ? { message, gender } : { message });
    for (const [variant, reply] of Object.entries(result.replies)) {
      // obstacleConsult / membershipConsult は該当する問い合わせの時だけ生成される任意項目。
      if (typeof reply !== "string") continue;
      for (const amount of reply.match(/[0-9][0-9,]*円/g) ?? []) {
        assert(
          canonHasAmount(amount),
          `inquiry reply invented an amount absent from canon: ${amount} (message="${message}", variant=${variant})`,
        );
      }
    }
  }
}

console.log("shared canon tests passed");
