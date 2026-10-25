// 総額計算のテスト。1個あたりの見た目の安さで判断を誤らないことを固定する。

import {
  formatLandedCost,
  landedCost,
  targetAfterDiscount,
  validateAssumption,
  validateQuote,
  type ImportAssumption,
  type Quote,
} from "./cost.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

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

const assumption: ImportAssumption = {
  fxRateToJpy: 150,
  dutyRatePercent: 0,
  consumptionTaxRatePercent: 10,
  domesticFeesJpy: 0,
};

const cost = landedCost(quote, assumption);
// 商品代 (1.2 + 0.3) * 50 = 75ドル → 11,250円
assert(cost.goodsJpy === 11_250, `商品代の換算: ${cost.goodsJpy}`);
assert(cost.setupJpy === 6_000, `型代の換算: ${cost.setupJpy}`);
assert(cost.freightJpy === 9_000, `送料の換算: ${cost.freightJpy}`);
assert(cost.dutiableValueJpy === 26_250, `課税価格: ${cost.dutiableValueJpy}`);
assert(cost.dutyJpy === 0, "関税率0%なら関税は0");
assert(cost.consumptionTaxJpy === 2_625, `消費税10%: ${cost.consumptionTaxJpy}`);
assert(cost.totalJpy === 28_875, `総額: ${cost.totalJpy}`);
assert(cost.effectiveUnitPriceJpy === 578, `実質単価は切り上げ: ${cost.effectiveUnitPriceJpy}`);

// 型代と送料を無視すると単価を大きく見誤る、という関係を明示的に固定しておく。
const goodsOnlyUnit = Math.ceil(cost.goodsJpy / quote.quantity);
assert(goodsOnlyUnit === 225, "商品代だけなら225円に見える");
assert(cost.effectiveUnitPriceJpy > goodsOnlyUnit * 2, "実際は倍以上になる");

// 関税がかかる場合、消費税は関税を含んだ額に乗る
const withDuty = landedCost(quote, { ...assumption, dutyRatePercent: 5 });
assert(withDuty.dutyJpy === 1_313, `関税5%: ${withDuty.dutyJpy}`);
assert(withDuty.consumptionTaxJpy === 2_756, `消費税は課税価格＋関税に乗る: ${withDuty.consumptionTaxJpy}`);

// 国内諸費用は円建てのまま足される（為替をかけない）
const withDomestic = landedCost(quote, { ...assumption, domesticFeesJpy: 5_000 });
assert(withDomestic.totalJpy === cost.totalJpy + 5_000, "国内諸費用はそのまま加算");

// 円建て見積は為替1で扱える
const jpyQuote: Quote = { ...quote, currency: "JPY", unitPrice: 300, accessoryUnitPrice: 0, moldFee: 0, shippingFee: 0 };
const jpyCost = landedCost(jpyQuote, { ...assumption, fxRateToJpy: 1, consumptionTaxRatePercent: 0 });
assert(jpyCost.totalJpy === 15_000 && jpyCost.effectiveUnitPriceJpy === 300, "円建てはそのまま");

// 入力チェック
assert(validateQuote({ ...quote, quantity: 0 }).length > 0, "数量0は弾く");
assert(validateQuote({ ...quote, shippingFee: -1 }).length > 0, "マイナスの費用は弾く");
assert(validateAssumption({ ...assumption, fxRateToJpy: 0 }).length > 0, "為替0は弾く");
let threw = false;
try {
  landedCost({ ...quote, quantity: -5 }, assumption);
} catch {
  threw = true;
}
assert(threw, "不正な見積では計算せず例外にする");

// 値引き交渉の目標額は、単価と型代だけを下げる（送料・税は動かさない）
const discounted = targetAfterDiscount(quote, 10);
assert(discounted.unitPrice === 1.08, `単価10%引き: ${discounted.unitPrice}`);
assert(discounted.moldFee === 36, `型代10%引き: ${discounted.moldFee}`);
assert(discounted.shippingFee === quote.shippingFee, "送料は交渉対象に含めない");

const text = formatLandedCost(cost, quote.quantity);
assert(text.includes("総額") && text.includes("実質単価"), "内訳表示に総額と実質単価が出る");

console.log("sourcing cost tests passed");
