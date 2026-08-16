// Brand Growth Phase 4: 生成にかかった費用と「使える1本あたりの費用」。
//
// 参照: SCHEMA_CATALOG §12、§20、ACCEPTANCE_TESTS AT-017 / AT-018。
//
// 一番大事な約束:
//   使えた本数が0のとき、1本あたりの費用は「0円」ではない。「計算できない」。
//   0円と書くと、失敗したのに安く済んだように見えてしまう。
//
// 数えるときの線引き:
//   - usable と数えるのは、人が見た判定（human / hybrid）だけ。
//   - 費用が未記録の試行は 0円 として足さない。「不明あり」として印を付ける。
//
// ここで扱うのは生成費用であって、会員料金ではない（料金の正本は src/shared/canon.ts）。

import type {
  AttemptCostRecord,
  CostSummary,
  EffectiveCostReason,
  Money,
} from "../contracts/growth.js";
import { COST_SCHEMA_VERSION } from "../contracts/growth.js";
import { deepFreeze, RecordRuleError } from "../contracts/record_rules.js";

function assertMoney(field: string, money: Money): void {
  if (typeof money.currency !== "string" || money.currency.trim() === "") {
    throw new RecordRuleError("invalid_currency", `${field}.currency must be a non-empty string`);
  }
  if (!Number.isInteger(money.amount_minor) || money.amount_minor < 0) {
    throw new RecordRuleError("invalid_amount", `${field}.amount_minor must be an integer of 0 or more`);
  }
}

/** 使えた本数として数えてよい試行か。人が見た判定だけを数える。 */
function countsAsUsable(attempt: AttemptCostRecord): boolean {
  return (
    attempt.usability === "usable" &&
    (attempt.assessed_by === "human" || attempt.assessed_by === "hybrid")
  );
}

export interface SummarizeCostParams {
  readonly attempts: readonly AttemptCostRecord[];
  /**
   * 1件も費用記録が無いときに使う通貨。
   * 記録があるときは、記録側の通貨が正。
   */
  readonly fallback_currency?: string | null;
}

/**
 * 費用をまとめる。
 *
 * 返り値の effective_cost_per_usable が null のときは、必ず理由が付く。
 * null を 0 として扱ってはいけない。
 */
export function summarizeCost(params: SummarizeCostParams): CostSummary {
  const attempts = params.attempts;

  const generationCount = attempts.length;
  const failureCount = attempts.filter(a => a.status === "failed").length;
  const rejectedCount = attempts.filter(a => a.usability === "rejected").length;
  const usableCount = attempts.filter(countsAsUsable).length;

  const withCost = attempts.filter(a => a.provider_cost !== null);
  for (const attempt of withCost) assertMoney(`attempt(${attempt.attempt_id}).provider_cost`, attempt.provider_cost as Money);

  const currencies = new Set(withCost.map(a => (a.provider_cost as Money).currency));
  const healthWarnings: string[] = [];

  // 通貨が混ざっていたら足さない。合計してから割ると意味の無い数字になる。
  if (currencies.size > 1) {
    healthWarnings.push("mixed_currency:cannot_total_provider_cost");
    return deepFreeze({
      schema_version: COST_SCHEMA_VERSION,
      currency: null,
      provider_cost_total: null,
      provider_cost_complete: false,
      generation_count: generationCount,
      failure_count: failureCount,
      rejected_count: rejectedCount,
      usable_count: usableCount,
      effective_cost_per_usable: null,
      effective_cost_rounded: false,
      effective_cost_reason: "mixed_currency" as EffectiveCostReason,
      health_warnings: healthWarnings,
    }) as CostSummary;
  }

  const currency = currencies.size === 1 ? [...currencies][0] ?? null : (params.fallback_currency ?? null);
  const costComplete = generationCount > 0 && withCost.length === generationCount;
  const unknownCostCount = generationCount - withCost.length;

  if (unknownCostCount > 0 && generationCount > 0) {
    // 「不明」を 0円 として足していないことを、読む人にも見せる。
    healthWarnings.push(`cost_unknown_attempts:${unknownCostCount}`);
  }

  const totalMinor = withCost.reduce((sum, a) => sum + (a.provider_cost as Money).amount_minor, 0);
  const total: Money | null =
    withCost.length === 0 || currency === null ? null : { currency, amount_minor: totalMinor };

  if (generationCount === 0) {
    return deepFreeze({
      schema_version: COST_SCHEMA_VERSION,
      currency,
      provider_cost_total: total,
      provider_cost_complete: false,
      generation_count: 0,
      failure_count: 0,
      rejected_count: 0,
      usable_count: 0,
      effective_cost_per_usable: null,
      effective_cost_rounded: false,
      effective_cost_reason: "no_attempts" as EffectiveCostReason,
      health_warnings: healthWarnings,
    }) as CostSummary;
  }

  // 使えた本数が0。ここが AT-018。0円にしない。
  if (usableCount === 0) {
    if (total !== null && total.amount_minor > 0) {
      healthWarnings.push("no_usable_output:cost_spent_without_usable_clip");
    } else {
      healthWarnings.push("no_usable_output");
    }
    return deepFreeze({
      schema_version: COST_SCHEMA_VERSION,
      currency,
      provider_cost_total: total,
      provider_cost_complete: costComplete,
      generation_count: generationCount,
      failure_count: failureCount,
      rejected_count: rejectedCount,
      usable_count: 0,
      effective_cost_per_usable: null,
      effective_cost_rounded: false,
      effective_cost_reason: "no_usable_output" as EffectiveCostReason,
      health_warnings: healthWarnings,
    }) as CostSummary;
  }

  // 使えた本数はあるが、費用が1件も記録されていない。これも 0円ではない。
  if (total === null) {
    healthWarnings.push("no_cost_recorded:effective_cost_unavailable");
    return deepFreeze({
      schema_version: COST_SCHEMA_VERSION,
      currency,
      provider_cost_total: null,
      provider_cost_complete: false,
      generation_count: generationCount,
      failure_count: failureCount,
      rejected_count: rejectedCount,
      usable_count: usableCount,
      effective_cost_per_usable: null,
      effective_cost_rounded: false,
      effective_cost_reason: "no_cost_recorded" as EffectiveCostReason,
      health_warnings: healthWarnings,
    }) as CostSummary;
  }

  const exact = total.amount_minor / usableCount;
  const rounded = Math.round(exact);
  const wasRounded = !Number.isInteger(exact);
  if (wasRounded) healthWarnings.push("effective_cost_rounded_to_minor_unit");
  if (!costComplete) healthWarnings.push("effective_cost_based_on_partial_cost_data");

  return deepFreeze({
    schema_version: COST_SCHEMA_VERSION,
    currency,
    provider_cost_total: total,
    provider_cost_complete: costComplete,
    generation_count: generationCount,
    failure_count: failureCount,
    rejected_count: rejectedCount,
    usable_count: usableCount,
    effective_cost_per_usable: { currency: total.currency, amount_minor: rounded },
    effective_cost_rounded: wasRounded,
    effective_cost_reason: "computed" as EffectiveCostReason,
    health_warnings: healthWarnings,
  }) as CostSummary;
}

/** 人が読む一行説明。数字が出せないときは、出せない理由をそのまま書く。 */
export function explainCost(summary: CostSummary): string {
  if (summary.effective_cost_per_usable === null) {
    return [
      `使える1本あたりの費用: 出せません（理由: ${summary.effective_cost_reason}）`,
      `試行 ${summary.generation_count}件 / 使えた ${summary.usable_count}件`,
      summary.health_warnings.length > 0 ? `注意: ${summary.health_warnings.join(" / ")}` : "",
    ]
      .filter(line => line !== "")
      .join("\n");
  }
  const cost = summary.effective_cost_per_usable;
  return `使える1本あたりの費用: ${cost.amount_minor} ${cost.currency}（試行 ${summary.generation_count}件 / 使えた ${summary.usable_count}件）`;
}
