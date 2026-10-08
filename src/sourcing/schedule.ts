// 納期の逆算 — 「いつまでに発注すれば、必着日に間に合うか」を出す。
//
// 海外調達で落ちる原因のほぼ全部が、この足し算を省いたことによる。
//   製作日数 ＋ 国際輸送日数 ＋ 通関バッファ ＋ 国内配送バッファ ＋ 安全バッファ
// 「たぶん届く」は禁止。業者の Guaranteed arrival date が無い候補は納期0点にする。
//
// ここは日付の足し算しかしない。業者の言い値を信じるかどうかは採点側（score.ts）が決める。

import { addDays, daysBetween, type SourcingRequirement } from "./requirement.js";

/** 所要日数の内訳。すべて暦日（営業日ではない）で持つ。 */
export type LeadTime = {
  /** 型作成・サンプル確認・量産までの製作日数。 */
  readonly productionDays: number;
  /** 国際輸送日数（DHL/FedEx/UPS の集荷から日本到着まで）。 */
  readonly shippingDays: number;
  /** 通関で止まる想定日数。 */
  readonly customsBufferDays: number;
  /** 通関後、届け先までの国内配送日数。 */
  readonly domesticBufferDays: number;
  /** 事故・連休・再制作に備える安全バッファ。最低1〜2日は取る。 */
  readonly safetyBufferDays: number;
};

/** 急ぎ案件の既定値。速い側に寄せすぎず、業者回答が来たら必ず上書きする。 */
export const EXPRESS_LEAD_TIME: LeadTime = {
  productionDays: 10,
  shippingDays: 4,
  customsBufferDays: 2,
  domesticBufferDays: 1,
  safetyBufferDays: 2,
};

/** 所要日数の合計。 */
export function totalLeadDays(lead: LeadTime): number {
  return (
    lead.productionDays +
    lead.shippingDays +
    lead.customsBufferDays +
    lead.domesticBufferDays +
    lead.safetyBufferDays
  );
}

/** 必着日から逆算した「最終発注期限」。この日を過ぎたら、その所要日数では間に合わない。 */
export function latestOrderDate(requirement: SourcingRequirement, lead: LeadTime): string {
  return addDays(requirement.arrivalDeadline, -totalLeadDays(lead));
}

/** 発注日から見た到着予定日。 */
export function estimatedArrival(orderDate: string, lead: LeadTime): string {
  return addDays(orderDate, totalLeadDays(lead));
}

/** 逆算の判定。 */
export type FeasibilityVerdict = "余裕あり" | "ぎりぎり" | "危険" | "不可能";

export type Feasibility = {
  readonly verdict: FeasibilityVerdict;
  /** 逆算した最終発注期限。 */
  readonly latestOrderDate: string;
  /** 今日から最終発注期限までの残り日数。マイナスなら既に過ぎている。 */
  readonly daysToOrderDeadline: number;
  /** 今日発注した場合の到着予定日。 */
  readonly arrivalIfOrderedToday: string;
  /** 必着日に対する余裕日数。マイナスなら間に合わない。 */
  readonly marginDays: number;
  /** 人間が読む理由。 */
  readonly reason: string;
};

/**
 * 「今日発注して間に合うか」を判定する。
 * today は呼び出し側から必ず渡す（この関数は時計を読まない＝テストが固定できる）。
 */
export function assessFeasibility(
  requirement: SourcingRequirement,
  lead: LeadTime,
  today: string,
): Feasibility {
  const deadline = latestOrderDate(requirement, lead);
  const daysToOrderDeadline = daysBetween(today, deadline);
  const arrival = estimatedArrival(today, lead);
  const marginDays = daysBetween(arrival, requirement.arrivalDeadline);

  let verdict: FeasibilityVerdict;
  if (marginDays < 0) verdict = "不可能";
  else if (marginDays === 0) verdict = "危険";
  else if (marginDays <= 2) verdict = "ぎりぎり";
  else verdict = "余裕あり";

  const reason =
    verdict === "不可能"
      ? `今日発注しても到着は${arrival}で、必着${requirement.arrivalDeadline}に${-marginDays}日遅れる。所要日数を縮めるか、調達先を国内に切り替える必要がある。`
      : verdict === "危険"
        ? `今日発注してちょうど必着日。遅れる余地がない。安全バッファを積み増すか、より速い業者を探す。`
        : `最終発注期限は${deadline}。残り${daysToOrderDeadline}日。`;

  return { verdict, latestOrderDate: deadline, daysToOrderDeadline, arrivalIfOrderedToday: arrival, marginDays, reason };
}

/** 逆算の内訳を人間向けに1本の文字列にする。 */
export function formatLeadTime(lead: LeadTime): string {
  return [
    `製作 ${lead.productionDays}日`,
    `国際輸送 ${lead.shippingDays}日`,
    `通関 ${lead.customsBufferDays}日`,
    `国内配送 ${lead.domesticBufferDays}日`,
    `安全バッファ ${lead.safetyBufferDays}日`,
    `= 合計 ${totalLeadDays(lead)}日`,
  ].join(" ＋ ").replace(" ＋ = ", " = ");
}
