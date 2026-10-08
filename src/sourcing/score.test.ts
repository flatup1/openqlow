// 足切りと採点のテスト。
// 一番大事な性質は「未確認は加点されない」こと。調べていない業者が上に来たら設計が壊れている。

import type { SourcingRequirement } from "./requirement.js";
import type { ImportAssumption, Quote } from "./cost.js";
import { screen, screenAll, type Candidate } from "./candidate.js";
import { deliveryScore, qualityScore, scoreAll, trustScore } from "./score.js";

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
  mustHaves: [],
  mustHavesEnglish: [],
  maxUnitPriceJpy: 500,
  priorities: ["納期", "品質", "総額", "デザイン"],
};

const assumption: ImportAssumption = {
  fxRateToJpy: 150,
  dutyRatePercent: 0,
  consumptionTaxRatePercent: 10,
  domesticFeesJpy: 0,
};

const quote: Quote = {
  currency: "USD",
  unitPrice: 1.2,
  quantity: 50,
  moldFee: 40,
  designFee: 0,
  accessoryUnitPrice: 0.3,
  sampleFee: 0,
  shippingFee: 60,
  otherFees: 0,
};

function candidate(patch: Partial<Candidate> = {}): Candidate {
  return {
    id: "c1",
    supplier: "テスト業者",
    marketplace: "Alibaba",
    moq: 50,
    quote,
    itemizedQuote: true,
    delivery: { guaranteedArrivalDate: "2026-09-20", guaranteedHalf: "AM", isGuaranteed: true, couriers: ["DHL"] },
    quality: {
      materialOk: true,
      constructionOk: true,
      finishOk: true,
      platingOk: true,
      substanceOk: true,
      accessoryOk: true,
      evidencePhotos: true,
    },
    trust: {
      ratingOutOf5: 4.8,
      reviewCount: 120,
      tradeAssurance: true,
      verifiedSupplier: true,
      onTimeDeliveryPercent: 98,
      sameCategoryTrackRecord: true,
    },
    designMatchPercent: 90,
    ...patch,
  };
}

// --- 納期点。仕様の配点表をそのまま固定する ---
const deliveryCases: ReadonlyArray<readonly [string, number]> = [
  ["2026-09-18", 35],
  ["2026-09-19", 33],
  ["2026-09-20", 30],
  ["2026-09-21", 27],
  ["2026-09-22", 23],
];
for (const [date, expected] of deliveryCases) {
  const score = deliveryScore(candidate({ delivery: { guaranteedArrivalDate: date, guaranteedHalf: "AM", isGuaranteed: true, couriers: ["DHL"] } }), requirement);
  assert(score === expected, `${date} の納期点は${expected}点（実際 ${score}）`);
}
assert(
  deliveryScore(candidate({ delivery: { guaranteedArrivalDate: "2026-09-17", guaranteedHalf: "AM", isGuaranteed: true, couriers: ["DHL"] } }), requirement) === 35,
  "4日以上早くても上限は35点",
);
assert(
  deliveryScore(candidate({ delivery: { guaranteedArrivalDate: "2026-09-22", guaranteedHalf: "PM", isGuaranteed: true, couriers: ["DHL"] } }), requirement) === 10,
  "午前必着の案件で当日午後着は大きく減点",
);
assert(
  deliveryScore(candidate({ delivery: { guaranteedArrivalDate: "2026-09-23", guaranteedHalf: "AM", isGuaranteed: true, couriers: ["DHL"] } }), requirement) === 0,
  "必着日を過ぎたら0点",
);
assert(
  deliveryScore(candidate({ delivery: { guaranteedArrivalDate: "2026-09-18", isGuaranteed: false, couriers: ["DHL"] } }), requirement) === 0,
  "保証でない見込み回答は0点",
);
assert(
  deliveryScore(candidate({ delivery: { couriers: ["DHL"] } }), requirement) === 0,
  "到着日の回答が無ければ0点",
);

// --- 品質点・信頼度点は「確認できたものだけ」 ---
assert(qualityScore(candidate()) === 25, "全部確認できていれば満点");
assert(qualityScore(candidate({ quality: {} })) === 0, "未確認は0点");
assert(qualityScore(candidate({ quality: { materialOk: false } })) === 0, "確認して駄目なら加点しない");
assert(trustScore(candidate()) === 10, "信頼度が揃えば満点");
assert(trustScore(candidate({ trust: {} })) === 0, "信頼度も未確認は0点");
assert(trustScore(candidate({ trust: { ratingOutOf5: 4.1, reviewCount: 12 } })) === 2, "評価4.1とレビュー12件で2点");

// --- 足切り ---
const moqNg = screen(candidate({ moq: 100 }), requirement);
assert(moqNg.excluded && moqNg.exclusions.some(e => e.includes("MOQ")), "MOQ超過は除外");

const lateNg = screen(candidate({ delivery: { guaranteedArrivalDate: "2026-09-25", isGuaranteed: true, couriers: ["DHL"] } }), requirement);
assert(lateNg.excluded, "必着日に間に合わない回答は除外");

const courierNg = screen(candidate({ delivery: { guaranteedArrivalDate: "2026-09-20", isGuaranteed: true, couriers: ["船便"] } }), requirement);
assert(courierNg.excluded && courierNg.exclusions.some(e => e.includes("DHL")), "速い便が使えないなら除外");

const guessNg = screen(candidate({ delivery: { guaranteedArrivalDate: "2026-09-20", isGuaranteed: false, couriers: ["DHL"] } }), requirement);
assert(guessNg.excluded, "「たぶん届く」は除外");

// 未確認は除外にせず、聞くべきこととして残す
const unknown = screen(
  { id: "c2", supplier: "未調査", marketplace: "Alibaba", delivery: { couriers: [] }, quality: {}, trust: {} },
  requirement,
);
assert(!unknown.excluded, "未確認だけでは除外しない");
assert(unknown.unknowns.some(u => u.includes("到着")), "到着日が未確認として残る");
assert(unknown.unknowns.some(u => u.includes("見積")), "見積未取得として残る");

// 当日着で午前の明言が無い場合は、除外ではなく警告
const halfWarn = screen(candidate({ delivery: { guaranteedArrivalDate: "2026-09-22", isGuaranteed: true, couriers: ["DHL"] } }), requirement);
assert(!halfWarn.excluded && halfWarn.warnings.some(w => w.includes("午前")), "当日着は警告で残す");

const { kept, dropped } = screenAll([candidate(), candidate({ id: "c9", moq: 500 })], requirement);
assert(kept.length === 1 && dropped.length === 1, "足切りで候補が分かれる");

// --- 総額点は相対評価 ---
// 許容単価の影響を切り離して、相対評価そのものを確かめる。
const noCap: SourcingRequirement = { ...requirement, maxUnitPriceJpy: undefined };
const cheap = candidate({ id: "cheap", supplier: "安い", quote: { ...quote, unitPrice: 0.6 } });
const pricey = candidate({ id: "pricey", supplier: "高い", quote: { ...quote, unitPrice: 2.4 } });
const ranked = scoreAll([pricey, cheap], noCap, assumption);
assert(ranked[0].candidate.id === "cheap", "同条件なら安い方が上位");
assert(ranked[0].price === 20, "最安が総額満点");
assert(ranked[1].price < 20 && ranked[1].price > 0, "高い方は比例で減点");

// 許容単価を超えたら総額0点
const overBudget = scoreAll([candidate({ id: "over", quote: { ...quote, unitPrice: 10 } })], requirement, assumption);
assert(overBudget[0].price === 0, "許容単価を超えたら総額は0点");

// 見積が無い候補は総額0点だが、除外はされない
const noQuote = scoreAll([candidate({ id: "nq", quote: undefined })], noCap, assumption);
assert(noQuote[0].price === 0 && noQuote[0].cost === undefined, "見積が無ければ総額0点");

// 「何も調べていない業者」が「全部確認済みの業者」に勝たないこと
const blank: Candidate = { id: "blank", supplier: "未調査", marketplace: "その他", delivery: { couriers: [] }, quality: {}, trust: {} };
const both = scoreAll([blank, candidate()], noCap, assumption);
assert(both[0].candidate.id === "c1", "確認済みの業者が上に来る");
assert(both[1].total === 0, "未確認だけの業者は0点");

// 満点の内訳が100点になること
const perfect = scoreAll([candidate({ delivery: { guaranteedArrivalDate: "2026-09-18", guaranteedHalf: "AM", isGuaranteed: true, couriers: ["DHL"] }, designMatchPercent: 100 })], noCap, assumption);
assert(perfect[0].total === 100, `満点は100点（実際 ${perfect[0].total}）`);

console.log("sourcing score tests passed");
