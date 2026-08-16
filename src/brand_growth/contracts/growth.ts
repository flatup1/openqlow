// Brand Growth Phase 4 契約: 費用・実測値・実験。
//
// 参照: SCHEMA_CATALOG §6（PredictedEmotionalScore）、§10（GenerationAttempt）、
//       §12（ContentRecord / CostSummary）、§14（MetricSnapshot）、
//       §15（Experiment）、§20（Effective Cost）。
//
// この Phase の一番大事な約束は3つ:
//   1. 分からない値は null。0 で埋めない。
//   2. AI の予測値と、実際に測った値を、同じ入れ物へ入れない。
//   3. 使えた本数が0なら、1本あたりの費用は「0円」ではなく「計算できない」。
//
// 料金・住所・時間などの事実（正本 src/shared/canon.ts）はここに複製しない。
// ここで扱う金額は「生成にかかった費用」であって、会員料金ではない。

import type { AssessedBy, Usability } from "./quality.js";

// --- お金 -------------------------------------------------------------------

/**
 * 金額。通貨と最小単位で持つ（SCHEMA_CATALOG §1）。
 * amount_minor はその通貨の最小単位の整数。日本円なら 1 = 1円。
 */
export interface Money {
  readonly currency: string;
  readonly amount_minor: number;
}

// --- 生成の試行（費用の集計に必要な分だけ）-------------------------------------

export type AttemptStatus = "succeeded" | "failed" | "cancelled";

/**
 * 費用集計のために見る、試行1回ぶんの記録。
 * SCHEMA_CATALOG §10 の GenerationAttempt から、集計に要る項目だけを写したもの。
 */
export interface AttemptCostRecord {
  readonly attempt_id: string;
  readonly status: AttemptStatus;
  /** 課金額。まだ分からないなら null（0 ではない）。 */
  readonly provider_cost: Money | null;
  readonly usability: Usability;
  /** 誰が品質を見たか。まだ見ていなければ null。 */
  readonly assessed_by: AssessedBy | null;
}

/** 1本あたりの費用を出せなかった理由。 */
export type EffectiveCostReason =
  | "computed"
  | "no_usable_output"
  | "no_cost_recorded"
  | "mixed_currency"
  | "no_attempts";

export const COST_SCHEMA_VERSION = "brand_growth.cost_summary.4.0.0";

/** SCHEMA_CATALOG §12 CostSummary。 */
export interface CostSummary {
  readonly schema_version: string;
  readonly currency: string | null;
  /** 記録できた課金額の合計。1件も記録が無ければ null。 */
  readonly provider_cost_total: Money | null;
  /** 全試行の費用がそろっているか。1件でも不明なら false。 */
  readonly provider_cost_complete: boolean;
  readonly generation_count: number;
  readonly failure_count: number;
  readonly rejected_count: number;
  /** human または hybrid の品質判定で usable になった件数だけを数える。 */
  readonly usable_count: number;
  /** usable が0なら null。0円としない。 */
  readonly effective_cost_per_usable: Money | null;
  /** 割り切れず丸めたか。 */
  readonly effective_cost_rounded: boolean;
  readonly effective_cost_reason: EffectiveCostReason;
  /** 人が見るべき赤信号。 */
  readonly health_warnings: readonly string[];
}

// --- 実測値（手入力）---------------------------------------------------------

export type MetricWindow = "24h" | "72h" | "7d" | "28d" | "custom";

export type MetricSource = "manual" | "csv_import" | "platform_api" | "crm_aggregate";

/** SCHEMA_CATALOG §14 の指標名。個人を特定する項目は持たない。 */
export const METRIC_FIELD_NAMES = Object.freeze([
  "impressions",
  "views",
  "three_second_views",
  "average_watch_seconds",
  "completion_rate",
  "saves",
  "shares",
  "comments",
  "profile_visits",
  "web_visits",
  "line_adds",
  "trial_inquiries",
  "trial_bookings",
  "trial_attendance",
  "enrollments",
] as const);

export type MetricFieldName = (typeof METRIC_FIELD_NAMES)[number];

/** 0〜1 の割合で持つ指標。パーセントの数字をそのまま入れない。 */
export const RATE_METRIC_NAMES: readonly MetricFieldName[] = Object.freeze(["completion_rate"] as const);

/** 秒で持つ指標。小数でよい。 */
export const DURATION_METRIC_NAMES: readonly MetricFieldName[] = Object.freeze([
  "average_watch_seconds",
] as const);

/** 手入力の出どころ。誰が・いつ・何を見て入れたかを必ず残す。 */
export interface ManualEntry {
  readonly entered_by: string;
  /** UTC ISO 8601。 */
  readonly entered_at: string;
  /** 何を見て入れたか（画面の保存名など）。個人情報は書かない。 */
  readonly evidence_reference: string;
  readonly evidence_note: string | null;
}

/** どこまで埋まっているか。埋まっていない項目を隠さない。 */
export interface MetricCompleteness {
  readonly known_fields: readonly MetricFieldName[];
  readonly unknown_fields: readonly MetricFieldName[];
  readonly known_count: number;
  readonly unknown_count: number;
}

export const METRIC_SCHEMA_VERSION = "brand_growth.metric_snapshot.4.0.0";

/** SCHEMA_CATALOG §14 MetricSnapshot。未取得の項目は null。 */
export interface MetricSnapshot {
  readonly schema_version: string;
  readonly metric_snapshot_id: string;
  readonly publication_id: string;
  /** UTC ISO 8601。 */
  readonly captured_at: string;
  readonly window: MetricWindow;
  readonly custom_window_note: string | null;
  readonly source: MetricSource;
  readonly source_reference: string | null;
  /** source が manual のときは必須。 */
  readonly manual_entry: ManualEntry | null;
  readonly completeness: MetricCompleteness;
  /** 未取得は null。0 に丸めない（AT-019）。 */
  readonly values: Readonly<Record<MetricFieldName, number | null>>;
  readonly notes: readonly string[];
}

// --- 予測値（AI）------------------------------------------------------------

/** SCHEMA_CATALOG §6 の評価軸。 */
export const PREDICTED_AXIS_NAMES = Object.freeze([
  "safety",
  "joy",
  "empathy",
  "hope",
  "brand_fit",
  "memorability",
  "action_motivation",
  "child_retention",
  "parent_trust",
  "trial_intent",
] as const);

export type PredictedAxisName = (typeof PREDICTED_AXIS_NAMES)[number];

export const PREDICTED_SCHEMA_VERSION = "brand_growth.predicted_emotional_score.4.0.0";

/**
 * 作る前の見込み点。実測値ではない。
 * kind と label に predicted を残し、measured 側と取り違えられないようにする。
 */
export interface PredictedEmotionalScore {
  readonly schema_version: string;
  readonly kind: "ai_prediction";
  readonly label: "predicted_emotional_score";
  readonly content_id: string;
  readonly model_or_rule_version: string;
  /** UTC ISO 8601。 */
  readonly scored_at: string;
  readonly confidence: number | null;
  readonly axes: Readonly<Partial<Record<PredictedAxisName, number | null>>>;
  readonly total_100: number | null;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
}

/** 実測側の包み。予測と同じ形にしないため、明示的に別の型にする。 */
export interface MeasuredMetricsView {
  readonly kind: "observed_metric";
  readonly label: "measured_metrics";
  readonly snapshot: MetricSnapshot;
}

export const OUTCOME_SCHEMA_VERSION = "brand_growth.content_outcome_view.4.0.0";

/**
 * 予測と実測を「並べて見る」ための入れ物（AT-020）。
 * 平均は取らない。合成した数字はこの型のどこにも存在しない。
 */
export interface ContentOutcomeView {
  readonly schema_version: string;
  readonly content_id: string;
  readonly predicted: PredictedEmotionalScore | null;
  readonly measured: MeasuredMetricsView | null;
  /** 常に false。予測と実測を混ぜた数字は作らない。 */
  readonly averaging_allowed: false;
  readonly comparison_note: string;
  readonly warnings: readonly string[];
}

// --- 実験 -------------------------------------------------------------------

/** A と B で変えうるもの。SCHEMA_CATALOG §15 の changed_variable。 */
export const EXPERIMENT_VARIABLE_NAMES = Object.freeze([
  "hook",
  "duration_seconds",
  "cta_variant",
  "target",
  "asset_id",
  "platform",
  "emotional_goal",
  "story_type",
] as const);

export type ExperimentVariableName = (typeof EXPERIMENT_VARIABLE_NAMES)[number];

export interface ExperimentArm {
  readonly content_id: string;
  /** 分からない項目は null。空文字で埋めない。 */
  readonly variables: Readonly<Partial<Record<ExperimentVariableName, string | null>>>;
}

/**
 * one_variable: 違いが1つだけ。学びの候補にしてよい。
 * exploratory : 違いが複数。原因は言えない。
 * invalid     : 違いが無い、または比較の前提が壊れている。
 */
export type ExperimentDesign = "one_variable" | "exploratory" | "invalid";

export type ExperimentStatus = "designed" | "running" | "measured" | "abandoned";

export type ExperimentDirection = "up" | "down" | "flat" | "unknown";

export interface ExperimentResult {
  readonly metric_definition: string;
  readonly control_value: number | null;
  readonly treatment_value: number | null;
  readonly direction: ExperimentDirection;
  readonly confidence_note: string;
  /** 常に false。この Phase は因果を主張しない（SCHEMA_CATALOG §15）。 */
  readonly causal_claim_allowed: false;
  /** capture window がそろっていて比べられたか。 */
  readonly comparable: boolean;
}

export const EXPERIMENT_SCHEMA_VERSION = "brand_growth.experiment.4.0.0";

/** SCHEMA_CATALOG §15 Experiment。 */
export interface Experiment {
  readonly schema_version: string;
  readonly experiment_id: string;
  readonly hypothesis: string;
  readonly target: string;
  readonly primary_metric: MetricFieldName;
  readonly guardrail_metrics: readonly MetricFieldName[];
  readonly control_content_id: string;
  readonly treatment_content_ids: readonly string[];
  /** 違いが1つのときだけ名前が入る。複数なら null。 */
  readonly changed_variable_one: ExperimentVariableName | null;
  readonly changed_variables: readonly ExperimentVariableName[];
  /** そろえた項目。AT-021 はここに target / cta_variant / duration_seconds / asset_id が要る。 */
  readonly constants: readonly ExperimentVariableName[];
  readonly design: ExperimentDesign;
  /** UTC ISO 8601。 */
  readonly start_at: string;
  readonly end_condition: string;
  readonly minimum_sample_guidance: string;
  readonly status: ExperimentStatus;
  readonly result: ExperimentResult | null;
  /** 違いが1つのときだけ true。学びの「候補」まで（承認は Phase 5）。 */
  readonly learning_candidate_allowed: boolean;
  /** この Phase では常に false。Validated Learning は Phase 5 とオーナー承認が要る。 */
  readonly validated_learning_allowed: false;
  readonly limitations: readonly string[];
  readonly next_action: string;
  readonly warnings: readonly string[];
}
