// Brand Growth Phase 4: A と B の比べ方。
//
// 参照: SCHEMA_CATALOG §14 / §15、ACCEPTANCE_TESTS AT-021 / AT-022。
//
// 決めごと:
//   - 違いが1つだけなら one_variable。学びの「候補」にしてよい（AT-021）。
//   - 違いが複数なら exploratory。どれが効いたかは言えない（AT-022）。
//   - causal_claim_allowed はいつも false。この Phase は因果を主張しない。
//   - Validated Learning への昇格は、この Phase では常に不可（Phase 5 とオーナー承認が要る）。
//   - 取得期間（capture window）が違う数字は、そのまま比べない。
//
// 時計は読まない。start_at は呼び出し側が渡す。

import type {
  Experiment,
  ExperimentArm,
  ExperimentDesign,
  ExperimentDirection,
  ExperimentResult,
  ExperimentVariableName,
  MetricFieldName,
  MetricSnapshot,
} from "../contracts/growth.js";
import { EXPERIMENT_SCHEMA_VERSION, EXPERIMENT_VARIABLE_NAMES } from "../contracts/growth.js";
import {
  assertNonEmpty,
  assertSafeId,
  assertUtcIso8601,
  deepFreeze,
  RecordRuleError,
} from "../contracts/record_rules.js";

/**
 * 2つの案で、どの項目が違うかを出す。
 *
 * 片方だけに値がある（もう片方が null）場合も「違う」と数える。
 * 両方 null（どちらも不明）は、違いとは数えない。
 */
export function diffVariables(
  control: ExperimentArm,
  treatment: ExperimentArm,
): readonly ExperimentVariableName[] {
  const changed: ExperimentVariableName[] = [];
  for (const name of EXPERIMENT_VARIABLE_NAMES) {
    const a = control.variables[name] ?? null;
    const b = treatment.variables[name] ?? null;
    if (a === null && b === null) continue;
    if (a !== b) changed.push(name);
  }
  return changed;
}

/** 両方に同じ値が入っていて、そろえられている項目。 */
export function constantVariables(
  control: ExperimentArm,
  treatment: ExperimentArm,
): readonly ExperimentVariableName[] {
  const constants: ExperimentVariableName[] = [];
  for (const name of EXPERIMENT_VARIABLE_NAMES) {
    const a = control.variables[name] ?? null;
    const b = treatment.variables[name] ?? null;
    if (a !== null && a === b) constants.push(name);
  }
  return constants;
}

export interface DesignExperimentParams {
  readonly experiment_id: string;
  readonly hypothesis: string;
  readonly target: string;
  readonly primary_metric: MetricFieldName;
  readonly guardrail_metrics?: readonly MetricFieldName[];
  readonly control: ExperimentArm;
  readonly treatment: ExperimentArm;
  /** UTC ISO 8601。 */
  readonly start_at: string;
  readonly end_condition: string;
  readonly minimum_sample_guidance?: string;
  readonly limitations?: readonly string[];
}

/**
 * 実験を1つ設計する。
 *
 * 違いの数を数えて、one_variable か exploratory かをここで確定させる。
 * あとから「本当は1変数だった」と言い換えられないように、記録に残す。
 */
export function designExperiment(params: DesignExperimentParams): Experiment {
  assertSafeId("experiment_id", params.experiment_id);
  assertSafeId("control.content_id", params.control.content_id);
  assertSafeId("treatment.content_id", params.treatment.content_id);
  assertNonEmpty("hypothesis", params.hypothesis);
  assertNonEmpty("target", params.target);
  assertNonEmpty("end_condition", params.end_condition);
  assertUtcIso8601("start_at", params.start_at);

  if (params.control.content_id === params.treatment.content_id) {
    throw new RecordRuleError("same_content", "control and treatment must be different content");
  }

  const changed = diffVariables(params.control, params.treatment);
  const constants = constantVariables(params.control, params.treatment);

  const warnings: string[] = [];
  const limitations: string[] = [...(params.limitations ?? [])];

  let design: ExperimentDesign;
  let changedOne: ExperimentVariableName | null;

  if (changed.length === 1) {
    design = "one_variable";
    changedOne = changed[0] ?? null;
  } else if (changed.length === 0) {
    design = "invalid";
    changedOne = null;
    warnings.push("no_difference_between_arms");
    limitations.push("2つの案に違いがありません。比較として成立しません。");
  } else {
    design = "exploratory";
    changedOne = null;
    warnings.push(`multi_variable:${changed.join(",")}`);
    limitations.push(
      `${changed.length}個の項目を同時に変えています。どれが効いたかは言えません（探索のみ）。`,
    );
  }

  // 学びの候補にしてよいのは、違いが1つのときだけ。
  const learningCandidateAllowed = design === "one_variable";

  if (design === "one_variable") {
    // そろえたはずの項目が本当にそろっているか、読む人に見せる。
    const expected: ExperimentVariableName[] = ["target", "cta_variant", "duration_seconds", "asset_id"];
    const missing = expected.filter(name => !constants.includes(name) && name !== changedOne);
    if (missing.length > 0) warnings.push(`constants_not_recorded:${missing.join(",")}`);
  }

  return deepFreeze({
    schema_version: EXPERIMENT_SCHEMA_VERSION,
    experiment_id: params.experiment_id,
    hypothesis: params.hypothesis,
    target: params.target,
    primary_metric: params.primary_metric,
    guardrail_metrics: params.guardrail_metrics ?? [],
    control_content_id: params.control.content_id,
    treatment_content_ids: [params.treatment.content_id],
    changed_variable_one: changedOne,
    changed_variables: changed,
    constants,
    design,
    start_at: params.start_at,
    end_condition: params.end_condition,
    minimum_sample_guidance:
      params.minimum_sample_guidance ??
      "件数が少ないうちは差を結論にしない。同じ取得期間で複数回そろってから見る。",
    status: "designed",
    result: null,
    learning_candidate_allowed: learningCandidateAllowed,
    // Phase 4 では常に false。昇格は Phase 5 とオーナー承認が要る。
    validated_learning_allowed: false,
    limitations,
    next_action:
      design === "one_variable"
        ? "同じ取得期間の実測値をそろえてから比べる。"
        : "変える項目を1つに絞って設計し直す。",
    warnings,
  }) as Experiment;
}

export interface RecordResultParams {
  readonly experiment: Experiment;
  readonly control_snapshot: MetricSnapshot;
  readonly treatment_snapshot: MetricSnapshot;
  /** 差が小さいうちは flat とみなす幅。既定は 0（完全一致のみ flat）。 */
  readonly flat_tolerance?: number;
}

/**
 * 実測値を当てはめて結果を記録する。
 *
 * 取得期間が違う、または値が未取得のときは、方向を unknown にして比べない。
 * どの場合でも causal_claim_allowed は false のまま。
 */
export function recordExperimentResult(params: RecordResultParams): Experiment {
  const { experiment, control_snapshot: control, treatment_snapshot: treatment } = params;
  const metric = experiment.primary_metric;
  const tolerance = params.flat_tolerance ?? 0;

  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RecordRuleError(
      "invalid_tolerance",
      "flat_tolerance must be a finite number of 0 or more",
    );
  }

  // 測り終わったものへ二重に書き込ませない。訂正したいときは新しい記録を作る。
  if (experiment.status === "measured" || experiment.status === "abandoned") {
    throw new RecordRuleError(
      "experiment_already_recorded",
      `experiment is already ${experiment.status}; create a new record instead of overwriting`,
    );
  }

  // 同じ記録を2回渡していないか。両側が同じなら、それは比較ではない。
  if (control.metric_snapshot_id === treatment.metric_snapshot_id) {
    throw new RecordRuleError(
      "same_snapshot_for_both_arms",
      "control and treatment must be different metric snapshots",
    );
  }

  const warnings = [...experiment.warnings];
  const limitations = [...experiment.limitations];

  // 同じ投稿の数字を両側に置いていたら、対応がずれている可能性が高い。
  if (control.publication_id === treatment.publication_id) {
    warnings.push("same_publication_for_both_arms");
  }

  const sameWindow =
    control.window === treatment.window &&
    (control.window !== "custom" || control.custom_window_note === treatment.custom_window_note);

  const controlValue = control.values[metric];
  const treatmentValue = treatment.values[metric];

  let comparable = true;
  let direction: ExperimentDirection = "unknown";
  let confidenceNote: string;

  // 設計そのものが成立していないなら、数字がそろっていても比べない。
  // ここを見落とすと、同一案どうしの比較が direction=up として記録されてしまう。
  if (experiment.design === "invalid") {
    comparable = false;
    warnings.push("invalid_design:not_comparable");
    limitations.push("比較として成立していない設計です。結果は参考にしません。");
    confidenceNote = "設計が成立していないため比較不可。";
  } else if (!sameWindow) {
    comparable = false;
    warnings.push(`window_mismatch:${control.window}_vs_${treatment.window}`);
    limitations.push("取得期間が違う数字なので、そのまま比べません。");
    confidenceNote = "取得期間が違うため比較不可。";
  } else if (controlValue === null || treatmentValue === null) {
    comparable = false;
    warnings.push(`metric_unknown:${metric}`);
    limitations.push("主要指標が未取得です。0 として扱わず、比較しません。");
    confidenceNote = "主要指標が未取得のため比較不可。";
  } else {
    const delta = treatmentValue - controlValue;
    direction = Math.abs(delta) <= tolerance ? "flat" : delta > 0 ? "up" : "down";
    confidenceNote =
      experiment.design === "one_variable"
        ? "違いは1つ。学びの候補にできますが、因果はまだ言えません。"
        : "違いが複数あるため、原因は特定できません（探索のみ）。";
  }

  // 取得期間が違うときは、片方だけの窓を書かない（どちらの値の窓か分からなくなる）。
  const windowLabel = sameWindow
    ? `window=${control.window}`
    : `control_window=${control.window}, treatment_window=${treatment.window}`;

  const result: ExperimentResult = {
    metric_definition: `${metric} (${windowLabel})`,
    control_value: controlValue,
    treatment_value: treatmentValue,
    direction,
    confidence_note: confidenceNote,
    causal_claim_allowed: false,
    comparable,
  };

  return deepFreeze({
    ...experiment,
    status: "measured",
    result,
    // 比べられなかったなら、学びの候補にもしない。
    learning_candidate_allowed: experiment.learning_candidate_allowed && comparable,
    validated_learning_allowed: false,
    // 同じ注意書きを二重に並べない。
    limitations: [...new Set(limitations)],
    warnings: [...new Set(warnings)],
    next_action: comparable
      ? "同じ設計でもう一度試し、独立した再現があるかを見る（昇格は Phase 5 とオーナー承認）。"
      : "比較の前提をそろえてから測り直す。",
  }) as Experiment;
}

/** 人が読む一行説明。言い過ぎないように、必ず限界も書く。 */
export function explainExperiment(experiment: Experiment): string {
  const lines: string[] = [];
  if (experiment.design === "one_variable") {
    lines.push(`違いは1つ: ${experiment.changed_variable_one}`);
    lines.push(`そろえた項目: ${experiment.constants.join(", ") || "記録なし"}`);
    lines.push("学びの候補にできます（承認は Phase 5）。");
  } else if (experiment.design === "exploratory") {
    lines.push(`違いが複数: ${experiment.changed_variables.join(", ")}`);
    lines.push("探索のみ。どれが効いたかは言えません。Validated Learning へは上げられません。");
  } else {
    lines.push("比較として成立していません。");
  }
  if (experiment.result !== null) {
    lines.push(`結果: ${experiment.result.direction}（${experiment.result.confidence_note}）`);
  }
  lines.push("因果は主張しません。");
  return lines.join("\n");
}
