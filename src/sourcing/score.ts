// 採点 — 100点満点で候補を並べる。
//
//   納期確実性 35 / 品質 25 / 総額 20 / デザイン再現性 10 / 業者信頼度 10
//
// 一貫した原則: **未確認は0点**。聞いていないことを「たぶん大丈夫」で加点しない。
// これにより「調べていない業者ほど高得点になる」という逆転が起きない。
//
// 総額点だけは候補どうしの相対評価なので、1社では決まらない（集合で採点する）。

import { daysBetween } from "./requirement.js";
import type { SourcingRequirement } from "./requirement.js";
import { landedCost, type ImportAssumption, type LandedCost } from "./cost.js";
import type { Candidate } from "./candidate.js";

export const WEIGHTS = {
  delivery: 35,
  quality: 25,
  price: 20,
  design: 10,
  trust: 10,
} as const;

/**
 * 納期点（35点満点）。
 * 必着日からの余裕日数で決める。早いほど高く、当日はぎりぎり、遅れは0。
 * 保証がない回答は0点。「たぶん届く」を点にしない。
 */
export function deliveryScore(candidate: Candidate, requirement: SourcingRequirement): number {
  const { guaranteedArrivalDate, guaranteedHalf, isGuaranteed } = candidate.delivery;
  if (!guaranteedArrivalDate) return 0;
  if (isGuaranteed !== true) return 0;

  const margin = daysBetween(guaranteedArrivalDate, requirement.arrivalDeadline);
  if (margin < 0) return 0;
  if (margin === 0) {
    // 必着日当日。午前必着の案件で午前の明言がなければ、大きく落とす。
    if (requirement.deadlineHalf === "AM" && guaranteedHalf !== "AM") return 10;
    return 23;
  }
  if (margin === 1) return 27;
  if (margin === 2) return 30;
  if (margin === 3) return 33;
  return WEIGHTS.delivery;
}

/** 品質点（25点満点）。確認できた項目だけ加点する。 */
const QUALITY_POINTS = {
  materialOk: 4,
  constructionOk: 4,
  finishOk: 4,
  platingOk: 3,
  substanceOk: 4,
  accessoryOk: 3,
  evidencePhotos: 3,
} as const;

export function qualityScore(candidate: Candidate): number {
  let total = 0;
  for (const [key, points] of Object.entries(QUALITY_POINTS) as [keyof typeof QUALITY_POINTS, number][]) {
    if (candidate.quality[key] === true) total += points;
  }
  return total;
}

/** デザイン再現性（10点満点）。未評価は0点。 */
export function designScore(candidate: Candidate): number {
  const pct = candidate.designMatchPercent;
  if (pct === undefined) return 0;
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.round((clamped / 100) * WEIGHTS.design * 10) / 10;
}

/** 業者信頼度（10点満点）。公開情報で確認できたものだけ加点する。 */
export function trustScore(candidate: Candidate): number {
  const t = candidate.trust;
  let total = 0;
  if (t.tradeAssurance === true) total += 2;
  if (t.verifiedSupplier === true) total += 2;
  if (t.ratingOutOf5 !== undefined) {
    if (t.ratingOutOf5 >= 4.5) total += 2;
    else if (t.ratingOutOf5 >= 4.0) total += 1;
  }
  if (t.reviewCount !== undefined) {
    if (t.reviewCount >= 50) total += 2;
    else if (t.reviewCount >= 10) total += 1;
  }
  if (t.onTimeDeliveryPercent !== undefined && t.onTimeDeliveryPercent >= 95) total += 1;
  if (t.sameCategoryTrackRecord === true) total += 1;
  return Math.min(total, WEIGHTS.trust);
}

/** 1社分の採点結果。 */
export type Scored = {
  readonly candidate: Candidate;
  readonly cost?: LandedCost;
  readonly delivery: number;
  readonly quality: number;
  readonly price: number;
  readonly design: number;
  readonly trust: number;
  readonly total: number;
};

/**
 * 候補一式を採点する。
 * 総額点は「その中で最も安い実質単価」を基準にした相対評価。
 * 見積が無い、または許容上限を超えた候補は総額0点（除外はしない＝交渉余地があるため）。
 */
export function scoreAll(
  candidates: readonly Candidate[],
  requirement: SourcingRequirement,
  assumption: ImportAssumption,
): readonly Scored[] {
  const costs = new Map<string, LandedCost>();
  for (const c of candidates) {
    if (c.quote) costs.set(c.id, landedCost(c.quote, assumption));
  }

  const unitPrices = [...costs.values()].map(c => c.effectiveUnitPriceJpy).filter(n => n > 0);
  const cheapest = unitPrices.length > 0 ? Math.min(...unitPrices) : undefined;

  const scored = candidates.map<Scored>(candidate => {
    const cost = costs.get(candidate.id);
    let price = 0;
    if (cost && cheapest !== undefined) {
      const overBudget =
        requirement.maxUnitPriceJpy !== undefined && cost.effectiveUnitPriceJpy > requirement.maxUnitPriceJpy;
      price = overBudget ? 0 : Math.round((cheapest / cost.effectiveUnitPriceJpy) * WEIGHTS.price * 10) / 10;
    }

    const delivery = deliveryScore(candidate, requirement);
    const quality = qualityScore(candidate);
    const design = designScore(candidate);
    const trust = trustScore(candidate);

    return {
      candidate,
      cost,
      delivery,
      quality,
      price,
      design,
      trust,
      total: Math.round((delivery + quality + price + design + trust) * 10) / 10,
    };
  });

  // 同点は納期の強い順、それも同じなら実質単価の安い順で決める（優先順位に合わせる）。
  return [...scored].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.delivery !== a.delivery) return b.delivery - a.delivery;
    const ua = a.cost?.effectiveUnitPriceJpy ?? Number.POSITIVE_INFINITY;
    const ub = b.cost?.effectiveUnitPriceJpy ?? Number.POSITIVE_INFINITY;
    return ua - ub;
  });
}
