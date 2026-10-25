// 納期逆算のテスト。日付の足し算が1日ずれるだけで大会に間に合わなくなるため、境界を厳しく見る。

import { addDays, daysBetween, isIsoDate, searchKeywords, validateRequirement, type SourcingRequirement } from "./requirement.js";
import {
  EXPRESS_LEAD_TIME,
  assessFeasibility,
  estimatedArrival,
  formatLeadTime,
  latestOrderDate,
  totalLeadDays,
  type LeadTime,
} from "./schedule.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const requirement: SourcingRequirement = {
  id: "test-medal",
  item: "メダル",
  quantity: 50,
  arrivalDeadline: "2026-09-22",
  deadlineHalf: "AM",
  destination: "千葉県成田市",
  destinationEnglish: "Narita, Chiba, Japan",
  useDate: "2026-09-23",
  targetUnitPriceJpy: 400,
  maxUnitPriceJpy: 500,
  mustHaves: ["金属製"],
  mustHavesEnglish: ["Metal medal (zinc alloy)"],
  priorities: ["納期", "品質", "総額", "デザイン"],
};

// 日付ユーティリティ
assert(isIsoDate("2026-09-22"), "正しい日付は通る");
assert(!isIsoDate("2026-09-31"), "9月31日は存在しない");
assert(!isIsoDate("2026/09/22"), "スラッシュ区切りは受け付けない");
assert(addDays("2026-09-22", -18) === "2026-09-04", "18日前は9/4");
assert(addDays("2026-02-28", 1) === "2026-03-01", "2026年は閏年ではない");
assert(daysBetween("2026-09-20", "2026-09-22") === 2, "9/20から9/22は2日");
assert(daysBetween("2026-09-23", "2026-09-22") === -1, "過ぎていればマイナス");

// 要件の検証
assert(validateRequirement(requirement).length === 0, "正しい要件はエラーなし");
assert(
  validateRequirement({ ...requirement, destinationEnglish: "" }).some(e => e.includes("destinationEnglish")),
  "英語の届け先が無ければ弾く（海外業者に日本語住所は読めない）",
);
assert(
  validateRequirement({ ...requirement, mustHavesEnglish: [] }).some(e => e.includes("mustHavesEnglish")),
  "仕様の英訳が無ければ弾く",
);
assert(
  validateRequirement({ ...requirement, quantity: 0 }).some(e => e.includes("quantity")),
  "数量0は弾く",
);
assert(
  validateRequirement({ ...requirement, useDate: "2026-09-21" }).some(e => e.includes("useDate")),
  "使用日が必着日より前なのは矛盾",
);
assert(
  validateRequirement({ ...requirement, targetUnitPriceJpy: 600 }).some(e => e.includes("targetUnitPriceJpy")),
  "目標単価が上限を超えるのは矛盾",
);

// 逆算
assert(totalLeadDays(EXPRESS_LEAD_TIME) === 19, "急ぎ既定値の合計は19日");
assert(latestOrderDate(requirement, EXPRESS_LEAD_TIME) === "2026-09-03", "必着9/22の最終発注期限は9/3");
assert(estimatedArrival("2026-09-03", EXPRESS_LEAD_TIME) === "2026-09-22", "9/3発注なら9/22到着");

// 判定の境界
const onTime = assessFeasibility(requirement, EXPRESS_LEAD_TIME, "2026-09-03");
assert(onTime.verdict === "危険" && onTime.marginDays === 0, "ちょうど間に合う日は「危険」");

const late = assessFeasibility(requirement, EXPRESS_LEAD_TIME, "2026-09-05");
assert(late.verdict === "不可能", "最終発注期限を過ぎたら不可能");
assert(late.marginDays === -2, "9/5発注は2日遅れる");
assert(late.reason.includes("2日遅れる"), "理由に遅れ日数を出す");

const tight = assessFeasibility(requirement, EXPRESS_LEAD_TIME, "2026-09-02");
assert(tight.verdict === "ぎりぎり", "1日余裕は「ぎりぎり」");

const roomy = assessFeasibility(requirement, EXPRESS_LEAD_TIME, "2026-08-25");
assert(roomy.verdict === "余裕あり", "9日余裕は「余裕あり」");
assert(roomy.daysToOrderDeadline === 9, "最終発注期限まで9日");

// 速い業者なら成立する、という逆算もできること
const fast: LeadTime = { productionDays: 5, shippingDays: 3, customsBufferDays: 1, domesticBufferDays: 1, safetyBufferDays: 1 };
const withFast = assessFeasibility(requirement, fast, "2026-09-05");
assert(withFast.verdict === "余裕あり" && withFast.marginDays === 6, "短納期の業者なら6日余る");

assert(formatLeadTime(fast).includes("合計 11日"), "内訳の表示に合計が入る");

// 検索語
const keywords = searchKeywords(requirement, "award medal");
assert(keywords.includes("custom award medal 50 pcs"), "数量入りの検索語を作る");
assert(keywords.some(k => k.includes("Japan shipping")), "日本向け配送の検索語を作る");

console.log(`sourcing schedule tests passed`);
