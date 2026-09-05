// 総額（TOTAL LANDED COST）の計算 — 商品単価だけで比べない。
//
// 海外調達で一番多い間違いが「1個◯◯ドル、安い！」で決めること。
// 型代・デザイン費・付属品・送料・関税・消費税・通関手数料まで足して、
// はじめて「1個あたり実質いくらか」が出る。ここはその足し算だけを行う。
//
// 単位は円の整数で持つ（小数を持つと見積書と1円ずれて話が噛み合わなくなる）。
// 関税率・消費税率・為替は**必ず呼び出し側が明示する**。ここで既定値を勝手に決めない。
// 税と通関は最終的に通関業者・税関の判断であり、この計算は「概算」であって確定額ではない。

/** 見積の通貨。 */
export type Currency = "USD" | "CNY" | "JPY";

/** 業者から取った見積の生データ。すべて見積通貨のまま持つ。 */
export type Quote = {
  readonly currency: Currency;
  /** 商品1個あたりの単価。 */
  readonly unitPrice: number;
  /** 数量。 */
  readonly quantity: number;
  /** 型代・セットアップ費（1回きり）。 */
  readonly moldFee: number;
  /** デザイン費・製版費（1回きり）。 */
  readonly designFee: number;
  /** リボン等の付属品の1個あたり追加費。単価に含まれるなら0。 */
  readonly accessoryUnitPrice: number;
  /** サンプル費（有償サンプルを取る場合のみ）。 */
  readonly sampleFee: number;
  /** 日本までの送料。 */
  readonly shippingFee: number;
  /** その他手数料（送金手数料・検品費など）。 */
  readonly otherFees: number;
};

/** 為替と税の前提。すべて「今この時点の想定」であり、確定値ではない。 */
export type ImportAssumption = {
  /** 見積通貨1単位あたりの円。JPY見積なら1。 */
  readonly fxRateToJpy: number;
  /** 関税率（%）。品目のHSコードで変わるため、必ず調べた値を入れる。 */
  readonly dutyRatePercent: number;
  /** 輸入消費税率（%）。 */
  readonly consumptionTaxRatePercent: number;
  /** 通関手数料・国内配送料など、日本側で円建てにかかる固定費。 */
  readonly domesticFeesJpy: number;
};

/** 総額の内訳。すべて円の整数。 */
export type LandedCost = {
  /** 商品代（単価＋付属品単価）×数量。 */
  readonly goodsJpy: number;
  /** 型代・デザイン費・サンプル費・その他手数料。 */
  readonly setupJpy: number;
  /** 国際送料。 */
  readonly freightJpy: number;
  /** 課税価格（商品代＋型代等＋送料）。関税・消費税の土台。 */
  readonly dutiableValueJpy: number;
  /** 関税（概算）。 */
  readonly dutyJpy: number;
  /** 輸入消費税（概算）。 */
  readonly consumptionTaxJpy: number;
  /** 日本側の固定費。 */
  readonly domesticFeesJpy: number;
  /** 総支払額。 */
  readonly totalJpy: number;
  /** 1個あたり実質単価（総額÷数量、円未満切り上げ）。 */
  readonly effectiveUnitPriceJpy: number;
};

/** 見積の入力チェック。マイナスや0個は計算する前に落とす。 */
export function validateQuote(quote: Quote): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(quote.quantity) || quote.quantity <= 0) {
    errors.push("quantity は1以上の整数にしてください");
  }
  const nonNegative: ReadonlyArray<readonly [string, number]> = [
    ["unitPrice", quote.unitPrice],
    ["moldFee", quote.moldFee],
    ["designFee", quote.designFee],
    ["accessoryUnitPrice", quote.accessoryUnitPrice],
    ["sampleFee", quote.sampleFee],
    ["shippingFee", quote.shippingFee],
    ["otherFees", quote.otherFees],
  ];
  for (const [name, value] of nonNegative) {
    if (!Number.isFinite(value) || value < 0) errors.push(`${name} は0以上の数値にしてください`);
  }
  return errors;
}

/** 前提の入力チェック。為替や税率が抜けたまま計算させない。 */
export function validateAssumption(assumption: ImportAssumption): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(assumption.fxRateToJpy) || assumption.fxRateToJpy <= 0) {
    errors.push("fxRateToJpy は正の数にしてください");
  }
  for (const name of ["dutyRatePercent", "consumptionTaxRatePercent"] as const) {
    const value = assumption[name];
    if (!Number.isFinite(value) || value < 0) errors.push(`${name} は0以上の数値にしてください`);
  }
  if (!Number.isFinite(assumption.domesticFeesJpy) || assumption.domesticFeesJpy < 0) {
    errors.push("domesticFeesJpy は0以上の数値にしてください");
  }
  return errors;
}

/**
 * 総額を計算する。
 * 関税は課税価格（商品＋諸費用＋送料）に、消費税は課税価格＋関税に、それぞれ掛ける。
 * 実務では税関の評価と端数処理で数百円ずれる。ここで出るのは判断用の概算。
 */
export function landedCost(quote: Quote, assumption: ImportAssumption): LandedCost {
  const errors = [...validateQuote(quote), ...validateAssumption(assumption)];
  if (errors.length > 0) throw new Error(`見積の前提が不正です: ${errors.join(" / ")}`);

  const fx = assumption.fxRateToJpy;
  const toJpy = (amount: number): number => Math.round(amount * fx);

  const goodsJpy = toJpy((quote.unitPrice + quote.accessoryUnitPrice) * quote.quantity);
  const setupJpy = toJpy(quote.moldFee + quote.designFee + quote.sampleFee + quote.otherFees);
  const freightJpy = toJpy(quote.shippingFee);

  const dutiableValueJpy = goodsJpy + setupJpy + freightJpy;
  const dutyJpy = Math.round((dutiableValueJpy * assumption.dutyRatePercent) / 100);
  const consumptionTaxJpy = Math.round(
    ((dutiableValueJpy + dutyJpy) * assumption.consumptionTaxRatePercent) / 100,
  );

  const totalJpy = dutiableValueJpy + dutyJpy + consumptionTaxJpy + Math.round(assumption.domesticFeesJpy);

  return {
    goodsJpy,
    setupJpy,
    freightJpy,
    dutiableValueJpy,
    dutyJpy,
    consumptionTaxJpy,
    domesticFeesJpy: Math.round(assumption.domesticFeesJpy),
    totalJpy,
    // 実質単価は切り上げる。「1個あたり◯◯円まで」の判断で、切り捨てて予算内に見せない。
    effectiveUnitPriceJpy: Math.ceil(totalJpy / quote.quantity),
  };
}

/** 値下げ交渉の目標額。単価と型代だけを下げ、送料と税は動かさない。 */
export function targetAfterDiscount(quote: Quote, discountPercent: number): Quote {
  const keep = (value: number): number => Math.round(value * (100 - discountPercent)) / 100;
  return {
    ...quote,
    unitPrice: keep(quote.unitPrice),
    accessoryUnitPrice: keep(quote.accessoryUnitPrice),
    moldFee: keep(quote.moldFee),
    designFee: keep(quote.designFee),
  };
}

/** 内訳を人間向けの表にする。 */
export function formatLandedCost(cost: LandedCost, quantity: number): string {
  const yen = (n: number): string => `${n.toLocaleString("ja-JP")}円`;
  return [
    `商品代      ${yen(cost.goodsJpy)}`,
    `型代・諸費用 ${yen(cost.setupJpy)}`,
    `国際送料    ${yen(cost.freightJpy)}`,
    `関税(概算)  ${yen(cost.dutyJpy)}`,
    `消費税(概算) ${yen(cost.consumptionTaxJpy)}`,
    `国内諸費用  ${yen(cost.domesticFeesJpy)}`,
    `― 総額     ${yen(cost.totalJpy)}`,
    `― 実質単価  ${yen(cost.effectiveUnitPriceJpy)} × ${quantity}個`,
  ].join("\n");
}
