import { readFileSync } from "node:fs";
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
  "trialFirst", "visitorSecond", "visitorPass5", "visitorPass10", "priceKids", "priceWomen", "priceMen", "joinFee",
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
// オーナー確定 2026-08-07（お客様への案内）。館内ボードの表示が最新・正しい料金。
assert(FLATUP_CANON.visitorPass5.includes("5回券14,000円"), "5-visit pass must be 14,000円 (owner-confirmed 2026-08-07)");
assert(FLATUP_CANON.visitorPass10.includes("10回券24,000円"), "10-visit pass must be 24,000円 (owner-confirmed 2026-08-07)");
// 有効期限はオーナー確認済み（2026-08-15）。案内から抜けないよう固定する。
assert(FLATUP_CANON.visitorPass5.includes("1年有効"), "5-visit pass validity must stay 1年有効");
assert(FLATUP_CANON.visitorPass10.includes("1年有効"), "10-visit pass validity must stay 1年有効");
// 旧値（6回券15,000円 / 12回券30,000円）が復活しないこと。
const canonAll = Object.values(FLATUP_CANON).join("\n");
for (const stale of ["6回券", "12回券", "15,000円", "30,000円"]) {
  assert(!canonAll.includes(stale), `stale ticket pricing must not return to canon: ${stale}`);
}
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

// 出典台帳の網羅性。
//
// 2026-08-15、回数券の料金が実際と違っていた（公式サイト由来の値が実運用と不一致）。
// ドリフト検出は canon.ts と同期ビューの内部一貫性しか見ないため、両方が揃って
// 同じ誤りを持つと永久に気づけない。外部との突合は人間にしかできない以上、
// せめて「どの値がどこ由来か」を機械可読にしておき、出典不明の値が
// 黙って増えないようにする。
const ledger = readFileSync(new URL("../../docs/ai-os/canon/VERIFICATION_LEDGER.md", import.meta.url), "utf8");
for (const key of Object.keys(FLATUP_CANON)) {
  assert(
    ledger.includes(`\`${key}\``),
    `canon field is missing from VERIFICATION_LEDGER.md: ${key} — 追加した値の出典（オーナー確認/一次資料/公式サイト/不明）を台帳へ記録してください`,
  );
}

console.log("shared canon tests passed");
