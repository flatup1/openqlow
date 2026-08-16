// Brand Growth Phase 4: 実測値の手入力と、予測値との切り分け。
//
// 参照: SCHEMA_CATALOG §6、§14、ACCEPTANCE_TESTS AT-019 / AT-020。
//
// 守ること:
//   - 取れていない指標は null。0 にしない（AT-019）。
//   - 手入力には「誰が・いつ・何を見て」を必ず残す。
//   - AI の予測点と、実際に測った数字を、同じ入れ物へ入れない（AT-020）。
//     両方を平均した数字は、どこにも作らない。
//
// 自動取得はしない。SNS API も外部 analytics も呼ばない（Phase 10 の話）。
// 時計は読まない。captured_at と entered_at は呼び出し側が渡す。

import type {
  ContentOutcomeView,
  ManualEntry,
  MeasuredMetricsView,
  MetricCompleteness,
  MetricFieldName,
  MetricSnapshot,
  MetricSource,
  MetricWindow,
  PredictedAxisName,
  PredictedEmotionalScore,
} from "../contracts/growth.js";
import {
  DURATION_METRIC_NAMES,
  METRIC_FIELD_NAMES,
  METRIC_SCHEMA_VERSION,
  OUTCOME_SCHEMA_VERSION,
  PREDICTED_AXIS_NAMES,
  PREDICTED_SCHEMA_VERSION,
  RATE_METRIC_NAMES,
} from "../contracts/growth.js";
import {
  assertNonEmpty,
  assertSafeId,
  assertUtcIso8601,
  deepFreeze,
  RecordRuleError,
} from "../contracts/record_rules.js";
import { scanPii } from "../../shared/pii_guard.js";
import { hasSecret } from "../../shared/secret_guard.js";

function assertCleanText(field: string, text: string): void {
  if (hasSecret(text)) {
    throw new RecordRuleError("secret_in_record", `${field} must not contain credentials`);
  }
  const pii = scanPii(text);
  if (pii.length > 0) {
    throw new RecordRuleError("pii_in_record", `${field} must not contain personal data (${pii.map(f => f.kind).join(",")})`);
  }
}

function validateMetricValue(name: MetricFieldName, value: number): number {
  if (!Number.isFinite(value)) {
    throw new RecordRuleError("invalid_metric", `${name} must be a finite number or null`);
  }
  if (value < 0) {
    throw new RecordRuleError("invalid_metric", `${name} must not be negative`);
  }
  if (RATE_METRIC_NAMES.includes(name)) {
    // 割合は 0〜1。21% は 21 ではなく 0.21。
    if (value > 1) {
      throw new RecordRuleError("invalid_metric", `${name} is a ratio and must be between 0 and 1`);
    }
    return value;
  }
  if (DURATION_METRIC_NAMES.includes(name)) return value;
  if (!Number.isInteger(value)) {
    throw new RecordRuleError("invalid_metric", `${name} is a count and must be an integer`);
  }
  return value;
}

export interface ImportSnapshotParams {
  readonly metric_snapshot_id: string;
  readonly publication_id: string;
  /** UTC ISO 8601。 */
  readonly captured_at: string;
  readonly window: MetricWindow;
  readonly custom_window_note?: string | null;
  readonly source: MetricSource;
  readonly source_reference?: string | null;
  /** source が manual のときは必須。 */
  readonly manual_entry?: ManualEntry | null;
  /**
   * 分かっている指標だけを書く。
   * 書かなかった項目、undefined、null はすべて「未取得（null）」になる。
   */
  readonly values?: Readonly<Partial<Record<MetricFieldName, number | null>>>;
  readonly notes?: readonly string[];
}

/**
 * 手入力（または CSV 取り込み）の実測値を1件つくる。
 *
 * 書かれなかった指標は null のまま残る。0 で埋めることは構造上できない。
 */
export function importMetricSnapshot(params: ImportSnapshotParams): MetricSnapshot {
  assertSafeId("metric_snapshot_id", params.metric_snapshot_id);
  assertSafeId("publication_id", params.publication_id);
  assertUtcIso8601("captured_at", params.captured_at);

  if (params.window === "custom" && (params.custom_window_note ?? "").trim() === "") {
    throw new RecordRuleError("missing_window_note", "custom window requires custom_window_note");
  }

  const manual = params.manual_entry ?? null;
  if (params.source === "manual") {
    if (manual === null) {
      throw new RecordRuleError("missing_manual_entry", "manual source requires manual_entry (who, when, evidence)");
    }
    assertNonEmpty("manual_entry.entered_by", manual.entered_by);
    assertUtcIso8601("manual_entry.entered_at", manual.entered_at);
    assertNonEmpty("manual_entry.evidence_reference", manual.evidence_reference);
    assertCleanText("manual_entry.entered_by", manual.entered_by);
    assertCleanText("manual_entry.evidence_reference", manual.evidence_reference);
    if (manual.evidence_note !== null) assertCleanText("manual_entry.evidence_note", manual.evidence_note);
  }

  const notes = params.notes ?? [];
  for (const note of notes) assertCleanText("notes", note);
  if (params.source_reference !== null && params.source_reference !== undefined) {
    assertCleanText("source_reference", params.source_reference);
  }

  const given = params.values ?? {};
  const values: Record<MetricFieldName, number | null> = {} as Record<MetricFieldName, number | null>;
  const known: MetricFieldName[] = [];
  const unknown: MetricFieldName[] = [];

  for (const name of METRIC_FIELD_NAMES) {
    const raw = given[name];
    if (raw === undefined || raw === null) {
      values[name] = null;
      unknown.push(name);
      continue;
    }
    values[name] = validateMetricValue(name, raw);
    known.push(name);
  }

  const completeness: MetricCompleteness = {
    known_fields: known,
    unknown_fields: unknown,
    known_count: known.length,
    unknown_count: unknown.length,
  };

  return deepFreeze({
    schema_version: METRIC_SCHEMA_VERSION,
    metric_snapshot_id: params.metric_snapshot_id,
    publication_id: params.publication_id,
    captured_at: params.captured_at,
    window: params.window,
    custom_window_note: params.custom_window_note ?? null,
    source: params.source,
    source_reference: params.source_reference ?? null,
    manual_entry: manual,
    completeness,
    values,
    notes,
  }) as MetricSnapshot;
}

export interface PredictedScoreParams {
  readonly content_id: string;
  readonly model_or_rule_version: string;
  /** UTC ISO 8601。 */
  readonly scored_at: string;
  readonly confidence?: number | null;
  readonly axes?: Readonly<Partial<Record<PredictedAxisName, number | null>>>;
  readonly total_100?: number | null;
  readonly reasons?: readonly string[];
  readonly warnings?: readonly string[];
}

/**
 * 予測点を1件つくる。
 * kind と label に predicted を残すので、実測値と取り違えられない。
 */
export function recordPredictedScore(params: PredictedScoreParams): PredictedEmotionalScore {
  assertSafeId("content_id", params.content_id);
  assertNonEmpty("model_or_rule_version", params.model_or_rule_version);
  assertUtcIso8601("scored_at", params.scored_at);

  const total = params.total_100 ?? null;
  if (total !== null && (!Number.isFinite(total) || total < 0 || total > 100)) {
    throw new RecordRuleError("invalid_score", "total_100 must be between 0 and 100 or null");
  }

  const axes: Partial<Record<PredictedAxisName, number | null>> = {};
  for (const axis of PREDICTED_AXIS_NAMES) {
    const raw = params.axes?.[axis];
    if (raw === undefined || raw === null) {
      axes[axis] = null;
      continue;
    }
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
      throw new RecordRuleError("invalid_score", `axes.${axis} must be between 0 and 100 or null`);
    }
    axes[axis] = raw;
  }

  return deepFreeze({
    schema_version: PREDICTED_SCHEMA_VERSION,
    kind: "ai_prediction",
    label: "predicted_emotional_score",
    content_id: params.content_id,
    model_or_rule_version: params.model_or_rule_version,
    scored_at: params.scored_at,
    confidence: params.confidence ?? null,
    axes,
    total_100: total,
    reasons: params.reasons ?? [],
    warnings: params.warnings ?? [],
  }) as PredictedEmotionalScore;
}

export interface OutcomeViewParams {
  readonly content_id: string;
  readonly predicted?: PredictedEmotionalScore | null;
  readonly measured?: MetricSnapshot | null;
}

/**
 * 予測と実測を「並べて見る」ための入れ物を作る（AT-020）。
 *
 * 平均はしない。合成した数字はこの返り値のどこにも入らない。
 * 予測は predicted、実測は measured。名前も型も別のままにする。
 */
export function buildOutcomeView(params: OutcomeViewParams): ContentOutcomeView {
  assertSafeId("content_id", params.content_id);

  const predicted = params.predicted ?? null;
  const snapshot = params.measured ?? null;
  const warnings: string[] = [];

  if (predicted !== null && predicted.content_id !== params.content_id) {
    throw new RecordRuleError("content_id_mismatch", "predicted score belongs to a different content_id");
  }

  const measured: MeasuredMetricsView | null =
    snapshot === null
      ? null
      : { kind: "observed_metric", label: "measured_metrics", snapshot };

  if (predicted === null) warnings.push("predicted_missing");
  if (measured === null) warnings.push("measured_missing");
  if (predicted !== null && measured !== null) {
    warnings.push("predicted_and_measured_are_different_kinds:do_not_average");
  }

  return deepFreeze({
    schema_version: OUTCOME_SCHEMA_VERSION,
    content_id: params.content_id,
    predicted,
    measured,
    averaging_allowed: false,
    comparison_note:
      "予測点（AI）と実測値（SNS 手入力）は別の記録です。並べて見るだけで、平均や合算はしません。",
    warnings,
  }) as ContentOutcomeView;
}

/**
 * 予測と実測を混ぜてよいかを一言で返す。常に false。
 * 「後で誰かが平均したくなったとき」に、ここで止まるようにしておく。
 */
export function isAveragingAllowed(): false {
  return false;
}

/** 人が読む一行説明。両方あっても、必ず別の行に書く。 */
export function explainOutcome(view: ContentOutcomeView): string {
  const lines: string[] = [`content: ${view.content_id}`];
  lines.push(
    view.predicted === null
      ? "予測（AI）: まだありません"
      : `予測（AI）: ${view.predicted.total_100 ?? "不明"} / 100`,
  );
  if (view.measured === null) {
    lines.push("実測（SNS 手入力）: まだありません");
  } else {
    const rate = view.measured.snapshot.values.completion_rate;
    lines.push(`実測（SNS 手入力）: 完視聴率 ${rate === null ? "不明" : `${rate * 100}%`}`);
  }
  lines.push("この2つは平均しません。別々の意味の数字です。");
  return lines.join("\n");
}
