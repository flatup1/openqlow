// 候補業者 — ブラウザ調査で集めた1社分のデータと、足切り判定。
//
// 設計の要は「未確認を未確認のまま持つ」こと。
// undefined は「まだ聞いていない」であって「0」でも「無い」でもない。
// 埋まっていない項目は加点されず、納期のように重い項目は未確認だと足切りになる。
//
// ここは候補を落とすだけで、順位はつけない（順位は score.ts）。

import { daysBetween, isIsoDate, type DeadlineHalf, type SourcingRequirement } from "./requirement.js";
import type { Quote } from "./cost.js";

/** 調査元。どこで見つけたかは信頼度の判断材料になる。 */
export type Marketplace = "Alibaba" | "Made-in-China" | "AliExpress" | "1688" | "DHgate" | "国内OEM" | "その他";

/** 使える配送手段。 */
export type Courier = "DHL" | "FedEx" | "UPS" | "EMS" | "航空便" | "船便" | "国内宅配";

/** 業者の信頼度に関わる公開情報。すべて任意＝見ていなければ空のままにする。 */
export type SupplierTrust = {
  readonly ratingOutOf5?: number;
  readonly reviewCount?: number;
  readonly yearsOnPlatform?: number;
  readonly responseRatePercent?: number;
  readonly onTimeDeliveryPercent?: number;
  readonly tradeAssurance?: boolean;
  readonly verifiedSupplier?: boolean;
  /** 同種商品の製作実績を写真・動画で確認できたか。 */
  readonly sameCategoryTrackRecord?: boolean;
};

/** 品質に関わる確認項目。true=確認できた / false=確認して駄目だった / undefined=未確認。 */
export type QualitySignals = {
  /** 素材が要件を満たすか（例: 亜鉛合金）。 */
  readonly materialOk?: boolean;
  /** 製法が要件を満たすか（例: ダイキャスト）。 */
  readonly constructionOk?: boolean;
  /** 表面加工・発色（例: エナメル、フルカラー、UV印刷）。 */
  readonly finishOk?: boolean;
  /** メッキ・エッジ処理。 */
  readonly platingOk?: boolean;
  /** 厚み・重量が安っぽくない水準か。 */
  readonly substanceOk?: boolean;
  /** 付属品（リボン等）の品質。 */
  readonly accessoryOk?: boolean;
  /** 実物写真・動画を受け取ったか。 */
  readonly evidencePhotos?: boolean;
};

/** 業者の納期回答。 */
export type DeliveryAnswer = {
  /** 業者が保証した日本到着日（YYYY-MM-DD）。無ければ未回答。 */
  readonly guaranteedArrivalDate?: string;
  /** その日のうち、午前中までに着くと明言したか。 */
  readonly guaranteedHalf?: DeadlineHalf;
  /** 保証と言えるか（"届くと思う" レベルなら false）。 */
  readonly isGuaranteed?: boolean;
  /** 使える配送手段。 */
  readonly couriers: readonly Courier[];
  /** 製作日数の回答。 */
  readonly productionDays?: number;
};

/** 候補業者1社。 */
export type Candidate = {
  readonly id: string;
  readonly supplier: string;
  readonly marketplace: Marketplace;
  /** 商品ページURL。記録用。 */
  readonly url?: string;
  /** 最小ロット。 */
  readonly moq?: number;
  /** 見積。まだ取っていなければ undefined。 */
  readonly quote?: Quote;
  /** 見積の内訳を項目ごとに出してきたか。「一式◯◯ドル」だけなら false。 */
  readonly itemizedQuote?: boolean;
  readonly delivery: DeliveryAnswer;
  readonly quality: QualitySignals;
  readonly trust: SupplierTrust;
  /** デザイン再現度（0〜100）。見本と突き合わせて人間が入れる。 */
  readonly designMatchPercent?: number;
  /** 調査メモ。 */
  readonly note?: string;
};

/** 足切り判定の結果。 */
export type Screening = {
  readonly candidateId: string;
  /** 除外なら true。除外は「条件を満たさないことが確定した」ときだけ。 */
  readonly excluded: boolean;
  /** 除外の理由。 */
  readonly exclusions: readonly string[];
  /** 除外はしないが減点・確認が要る点。 */
  readonly warnings: readonly string[];
  /** まだ聞けていない項目。問い合わせ文に載せる。 */
  readonly unknowns: readonly string[];
};

/**
 * 足切り。
 * 「確定した不適合」だけを除外にする。未確認は除外せず unknowns に落とす。
 * ただし納期だけは別で、必着日を過ぎる回答・保証なしは、この案件では使えないので除外する。
 */
export function screen(candidate: Candidate, requirement: SourcingRequirement): Screening {
  const exclusions: string[] = [];
  const warnings: string[] = [];
  const unknowns: string[] = [];

  // 数量
  if (candidate.moq === undefined) unknowns.push("MOQ（最小ロット）が未確認");
  else if (candidate.moq > requirement.quantity) {
    exclusions.push(`MOQ ${candidate.moq}個 > 必要数 ${requirement.quantity}個`);
  }

  // 納期。この案件で一番重い。
  const arrival = candidate.delivery.guaranteedArrivalDate;
  if (!arrival) {
    unknowns.push("日本到着の保証日が未回答");
  } else if (!isIsoDate(arrival)) {
    warnings.push(`到着保証日の形式が不正: ${arrival}`);
  } else {
    const margin = daysBetween(arrival, requirement.arrivalDeadline);
    if (margin < 0) exclusions.push(`到着 ${arrival} は必着 ${requirement.arrivalDeadline} に間に合わない`);
    else if (margin === 0 && requirement.deadlineHalf === "AM" && candidate.delivery.guaranteedHalf !== "AM") {
      warnings.push(`必着日当日の到着で、午前中着の明言がない（${arrival}）`);
    }
    if (candidate.delivery.isGuaranteed === false) {
      exclusions.push("到着日が「保証」ではなく見込み回答");
    } else if (candidate.delivery.isGuaranteed === undefined) {
      unknowns.push("到着日が保証なのか見込みなのか未確認");
    }
  }

  // 配送手段。追跡できて日付が読める便が使えないと、この納期は詰む。
  const express: readonly Courier[] = ["DHL", "FedEx", "UPS"];
  if (candidate.delivery.couriers.length === 0) {
    unknowns.push("使える配送手段が未確認");
  } else if (!candidate.delivery.couriers.some(c => express.includes(c))) {
    exclusions.push("DHL / FedEx / UPS のいずれも使えない");
  }

  // 見積
  if (!candidate.quote) unknowns.push("見積が未取得");
  else if (candidate.itemizedQuote === false) warnings.push("見積の内訳を出していない（総額だけ）");

  // 信頼度
  const trust = candidate.trust;
  if (trust.tradeAssurance === false) warnings.push("Trade Assurance なし");
  if (trust.reviewCount !== undefined && trust.reviewCount < 5) warnings.push(`レビュー数が少ない（${trust.reviewCount}件）`);
  if (trust.ratingOutOf5 !== undefined && trust.ratingOutOf5 < 4.0) warnings.push(`評価が低い（${trust.ratingOutOf5}/5）`);
  if (trust.responseRatePercent !== undefined && trust.responseRatePercent < 80) {
    warnings.push(`返信率が低い（${trust.responseRatePercent}%）`);
  }
  if (trust.onTimeDeliveryPercent !== undefined && trust.onTimeDeliveryPercent < 90) {
    warnings.push(`納期遵守率が低い（${trust.onTimeDeliveryPercent}%）`);
  }
  if (trust.verifiedSupplier === undefined) unknowns.push("認証業者かどうか未確認");
  if (trust.sameCategoryTrackRecord === undefined) unknowns.push("同種商品の製作実績が未確認");

  // 品質。確認して駄目だったものは除外、未確認は unknowns。
  const qualityChecks: ReadonlyArray<readonly [keyof QualitySignals, string]> = [
    ["materialOk", "素材"],
    ["constructionOk", "製法"],
    ["finishOk", "表面加工・発色"],
    ["platingOk", "メッキ・エッジ処理"],
    ["substanceOk", "厚み・重量"],
    ["accessoryOk", "付属品の品質"],
    ["evidencePhotos", "実物写真・動画"],
  ];
  for (const [key, label] of qualityChecks) {
    const value = candidate.quality[key];
    if (value === undefined) unknowns.push(`${label}が未確認`);
    else if (value === false) warnings.push(`${label}が要件を満たさない`);
  }

  if (candidate.designMatchPercent === undefined) unknowns.push("デザイン再現度が未評価");

  return {
    candidateId: candidate.id,
    excluded: exclusions.length > 0,
    exclusions,
    warnings,
    unknowns,
  };
}

/** 候補一覧を足切りし、残ったものと落ちたものに分ける。 */
export function screenAll(
  candidates: readonly Candidate[],
  requirement: SourcingRequirement,
): { readonly kept: readonly Candidate[]; readonly dropped: readonly Candidate[]; readonly screenings: readonly Screening[] } {
  const screenings = candidates.map(c => screen(c, requirement));
  const excludedIds = new Set(screenings.filter(s => s.excluded).map(s => s.candidateId));
  return {
    kept: candidates.filter(c => !excludedIds.has(c.id)),
    dropped: candidates.filter(c => excludedIds.has(c.id)),
    screenings,
  };
}
