import { FLATUP_CANON } from "./canon.js";
import { FLATUP_INFO } from "../generators/shared.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 単一正本: FLATUP_INFO は FLATUP_CANON の再エクスポート（同一オブジェクト）であること。
assert(FLATUP_INFO === FLATUP_CANON, "FLATUP_INFO must be the single source FLATUP_CANON");

// 重要フィールドが欠けていないこと（再エクスポートで取りこぼしが無いか）。
const requiredKeys = [
  "trialFirst", "visitorSecond", "priceKids", "priceWomen", "priceMen", "joinFee",
  "bring", "parking", "gloveSet", "address", "nearestStation", "access",
  "scheduleKids", "scheduleLadies", "bookingMen", "bookingWomen", "noBooking",
  "businessHours", "classes", "parentDiscount", "referralBenefit",
] as const;
for (const k of requiredKeys) {
  assert(typeof (FLATUP_CANON as Record<string, unknown>)[k] === "string", `canon missing key: ${k}`);
}

// オーナー確定値の代表チェック（回帰防止）。
assert(FLATUP_CANON.gloveSet.includes("11,000"), "glove set price must be 11,000");
assert(FLATUP_CANON.nearestStation === "成田駅", "nearest station must be 成田駅");
assert(FLATUP_CANON.classes.includes("ムエタイ"), "classes must include ムエタイ");

console.log("shared canon tests passed");
