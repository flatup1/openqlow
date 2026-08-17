// Brand Growth Phase 4 受入試験: 費用・実測値・実験。
//
// 対応する受入条件: AT-017、AT-018、AT-019、AT-020、AT-021、AT-022。
//
// 反証テスト（negative control）を必ず添える。
// 「守っているつもりの規則」が本当に働いているかを、わざと壊して確かめる。
//
// 外部アクセスなし。実データなし。時計も読まない（日時は全て固定値）。

import type { AttemptCostRecord, ExperimentArm, MetricSnapshot } from "../contracts/growth.js";
import { RecordRuleError } from "../contracts/record_rules.js";
import { summarizeCost, explainCost } from "./cost.js";
import {
  buildOutcomeView,
  explainOutcome,
  importMetricSnapshot,
  isAveragingAllowed,
  recordPredictedScore,
} from "./metrics.js";
import {
  designExperiment,
  diffVariables,
  explainExperiment,
  recordExperimentResult,
} from "./experiment.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

/** 「これは失敗するはず」を確かめる。失敗しなければテストが落ちる。 */
function throws(fn: () => unknown, expectedCode: string, message: string): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof RecordRuleError) {
      assert(error.code === expectedCode, `${message}: expected code ${expectedCode}, got ${error.code}`);
      return;
    }
    throw new Error(`${message}: unexpected error type ${String(error)}`);
  }
  throw new Error(`${message}: expected a failure but nothing was thrown`);
}

const AT = "2026-08-16T00:00:00Z";

function attempt(
  id: string,
  overrides: Partial<AttemptCostRecord> = {},
): AttemptCostRecord {
  return {
    attempt_id: id,
    status: "succeeded",
    provider_cost: { currency: "JPY", amount_minor: 100 },
    usability: "rejected",
    assessed_by: "human",
    ...overrides,
  };
}

// =====================================================================================
// AT-017 Cost per Usable
// GIVEN: 10 attempts, total cost 1000 JPY, 2 usable
// THEN: effective cost per usable is 500 JPY
// =====================================================================================

{
  const attempts: AttemptCostRecord[] = [];
  for (let i = 0; i < 10; i++) {
    // 10回 × 100円 = 1000円。うち2本だけ人の目で usable。
    attempts.push(attempt(`gen_${i}`, { usability: i < 2 ? "usable" : "rejected" }));
  }

  const summary = summarizeCost({ attempts });

  assert(summary.generation_count === 10, `generation_count: ${summary.generation_count}`);
  assert(summary.provider_cost_total?.amount_minor === 1000, `total: ${summary.provider_cost_total?.amount_minor}`);
  assert(summary.provider_cost_total?.currency === "JPY", "currency is JPY");
  assert(summary.usable_count === 2, `usable_count: ${summary.usable_count}`);
  assert(summary.rejected_count === 8, `rejected_count: ${summary.rejected_count}`);
  assert(summary.effective_cost_per_usable !== null, "effective cost exists");
  assert(
    summary.effective_cost_per_usable?.amount_minor === 500,
    `AT-017: expected 500, got ${summary.effective_cost_per_usable?.amount_minor}`,
  );
  assert(summary.effective_cost_per_usable?.currency === "JPY", "effective cost keeps currency");
  assert(summary.effective_cost_reason === "computed", `reason: ${summary.effective_cost_reason}`);
  assert(summary.effective_cost_rounded === false, "1000 / 2 is exact");
  assert(summary.provider_cost_complete, "all 10 attempts had a recorded cost");
  assert(explainCost(summary).includes("500"), "explanation shows the number");
}

// --- AT-017 反証: 人が見ていない judgment は usable に数えない ------------------------
{
  const attempts = Array.from({ length: 10 }, (_, i) =>
    attempt(`gen_auto_${i}`, {
      usability: i < 2 ? "usable" : "rejected",
      // 自動判定だけ。SCHEMA_CATALOG §20 は human / hybrid のみを usable と数える。
      assessed_by: "automated",
    }),
  );

  const summary = summarizeCost({ attempts });
  assert(summary.usable_count === 0, `automated usable must not count: ${summary.usable_count}`);
  assert(summary.effective_cost_per_usable === null, "no human review means no effective cost");
  assert(summary.effective_cost_reason === "no_usable_output", `reason: ${summary.effective_cost_reason}`);
}

// --- AT-017 反証: 未判定（assessed_by null）も数えない --------------------------------
{
  const attempts = [
    attempt("gen_x1", { usability: "usable", assessed_by: null }),
    attempt("gen_x2", { usability: "usable", assessed_by: null }),
  ];
  const summary = summarizeCost({ attempts });
  assert(summary.usable_count === 0, "unassessed output is not usable");
}

// --- AT-017 変異テスト: 使えた本数が変われば答えも変わる（式が生きている）--------------
{
  const base = Array.from({ length: 10 }, (_, i) =>
    attempt(`gen_m${i}`, { usability: i < 2 ? "usable" : "rejected" }),
  );
  const four = Array.from({ length: 10 }, (_, i) =>
    attempt(`gen_m${i}`, { usability: i < 4 ? "usable" : "rejected" }),
  );
  const a = summarizeCost({ attempts: base }).effective_cost_per_usable?.amount_minor;
  const b = summarizeCost({ attempts: four }).effective_cost_per_usable?.amount_minor;
  assert(a === 500 && b === 250, `mutation must change the result: ${a} vs ${b}`);
}

// =====================================================================================
// AT-018 Zero Usable
// GIVEN: 5 attempts, cost greater than zero, 0 usable
// THEN: effective cost value null / reason no_usable_output / health warning
// MUST NOT: report 0 JPY
// =====================================================================================

{
  const attempts = Array.from({ length: 5 }, (_, i) =>
    attempt(`gen_zero_${i}`, {
      provider_cost: { currency: "JPY", amount_minor: 120 },
      usability: i === 4 ? "unknown" : "rejected",
    }),
  );

  const summary = summarizeCost({ attempts });

  assert(summary.generation_count === 5, `generation_count: ${summary.generation_count}`);
  assert((summary.provider_cost_total?.amount_minor ?? 0) > 0, "cost was actually spent");
  assert(summary.usable_count === 0, `usable_count: ${summary.usable_count}`);

  // 「値なし」であること。0円ではない。
  assert(summary.effective_cost_per_usable === null, "AT-018: effective cost must be null");
  assert(
    summary.effective_cost_reason === "no_usable_output",
    `AT-018: reason must be no_usable_output, got ${summary.effective_cost_reason}`,
  );
  assert(summary.health_warnings.length > 0, "AT-018: a health warning is required");
  assert(
    summary.health_warnings.some(w => w.startsWith("no_usable_output")),
    `AT-018: warning must name the cause: ${summary.health_warnings.join(",")}`,
  );

  // 0円と誤読されないこと。文字列にも「0」だけの費用が現れない。
  const asJson = JSON.stringify(summary);
  assert(
    !asJson.includes('"effective_cost_per_usable":{"currency":"JPY","amount_minor":0}'),
    "AT-018 MUST NOT: effective cost must never be reported as 0",
  );
  assert(explainCost(summary).includes("出せません"), "explanation says it cannot be computed");
}

// --- AT-018 反証: 費用が未記録でも 0円 にしない ---------------------------------------
{
  const attempts = [
    attempt("gen_nc1", { provider_cost: null, usability: "usable" }),
    attempt("gen_nc2", { provider_cost: null, usability: "usable" }),
  ];
  const summary = summarizeCost({ attempts });
  assert(summary.usable_count === 2, "usable counted");
  assert(summary.provider_cost_total === null, "unknown cost must not become 0");
  assert(summary.effective_cost_per_usable === null, "cannot divide an unknown total");
  assert(summary.effective_cost_reason === "no_cost_recorded", `reason: ${summary.effective_cost_reason}`);
}

// --- 反証: 一部だけ費用不明なら「そろっていない」と印を付ける -------------------------
{
  const attempts = [
    attempt("gen_p1", { usability: "usable" }),
    attempt("gen_p2", { provider_cost: null }),
  ];
  const summary = summarizeCost({ attempts });
  assert(summary.provider_cost_complete === false, "partial cost data must be flagged");
  assert(
    summary.health_warnings.some(w => w.startsWith("cost_unknown_attempts:")),
    `warning missing: ${summary.health_warnings.join(",")}`,
  );
  // 不明を 0 として足していないので、合計は記録できた分だけ。
  assert(summary.provider_cost_total?.amount_minor === 100, "only recorded costs are summed");
}

// --- 反証: 通貨が混ざったら足さない ---------------------------------------------------
{
  const attempts = [
    attempt("gen_c1", { usability: "usable" }),
    attempt("gen_c2", { provider_cost: { currency: "USD", amount_minor: 100 } }),
  ];
  const summary = summarizeCost({ attempts });
  assert(summary.effective_cost_per_usable === null, "mixed currency cannot be divided");
  assert(summary.effective_cost_reason === "mixed_currency", `reason: ${summary.effective_cost_reason}`);
  assert(summary.provider_cost_total === null, "mixed currency cannot be totalled");
}

// --- 反証: 割り切れないときは丸めたことを隠さない -------------------------------------
{
  const attempts = Array.from({ length: 3 }, (_, i) =>
    attempt(`gen_r${i}`, { usability: "usable", provider_cost: { currency: "JPY", amount_minor: 1000 } }),
  );
  const summary = summarizeCost({ attempts });
  assert(summary.effective_cost_per_usable?.amount_minor === 1000, "3000 / 3 = 1000");
  assert(summary.effective_cost_rounded === false, "exact division is not rounded");

  const odd = summarizeCost({
    attempts: [
      attempt("gen_o1", { usability: "usable", provider_cost: { currency: "JPY", amount_minor: 1000 } }),
      attempt("gen_o2", { usability: "usable", provider_cost: { currency: "JPY", amount_minor: 1 } }),
      attempt("gen_o3", { usability: "usable", provider_cost: { currency: "JPY", amount_minor: 0 } }),
    ],
  });
  // 1001 / 3 = 333.67 → 334（丸めた事実を残す）
  assert(odd.effective_cost_per_usable?.amount_minor === 334, `rounded: ${odd.effective_cost_per_usable?.amount_minor}`);
  assert(odd.effective_cost_rounded === true, "rounding must be disclosed");
}

// --- 反証: 試行が0件でも 0円 にしない -------------------------------------------------
{
  const summary = summarizeCost({ attempts: [] });
  assert(summary.effective_cost_per_usable === null, "no attempts means no number");
  assert(summary.effective_cost_reason === "no_attempts", `reason: ${summary.effective_cost_reason}`);
}

// =====================================================================================
// AT-019 Missing Metrics
// GIVEN: views known, saves unknown
// THEN: saves null
// MUST NOT: coerce to zero
// =====================================================================================

const AT019_SNAPSHOT: MetricSnapshot = importMetricSnapshot({
  metric_snapshot_id: "met_at019",
  publication_id: "pub_at019",
  captured_at: AT,
  window: "24h",
  source: "manual",
  source_reference: "screenshot-2026-08-16-reel",
  manual_entry: {
    entered_by: "owner",
    entered_at: AT,
    evidence_reference: "screenshot-2026-08-16-reel",
    evidence_note: "インサイト画面の保存名のみ",
  },
  values: { views: 1200 },
});

{
  assert(AT019_SNAPSHOT.values.views === 1200, `views: ${AT019_SNAPSHOT.values.views}`);
  assert(AT019_SNAPSHOT.values.saves === null, "AT-019: saves must be null");
  // 0 と null を取り違えていないこと。
  assert(
    (AT019_SNAPSHOT.values.saves as number | null) !== 0,
    "AT-019 MUST NOT: saves must not be coerced to zero",
  );
  assert(AT019_SNAPSHOT.completeness.known_fields.includes("views"), "views is known");
  assert(AT019_SNAPSHOT.completeness.unknown_fields.includes("saves"), "saves is unknown");
  assert(AT019_SNAPSHOT.completeness.known_count === 1, `known_count: ${AT019_SNAPSHOT.completeness.known_count}`);

  // 手入力には「誰が・いつ・何を見て」が残る。
  assert(AT019_SNAPSHOT.manual_entry?.entered_by === "owner", "author recorded");
  assert(AT019_SNAPSHOT.manual_entry?.entered_at === AT, "time recorded");
  assert(
    (AT019_SNAPSHOT.manual_entry?.evidence_reference ?? "").length > 0,
    "evidence recorded",
  );

  // 未取得の項目が JSON でも null であること（0 に化けていない）。
  const json = JSON.parse(JSON.stringify(AT019_SNAPSHOT)) as { values: Record<string, unknown> };
  assert(json.values.saves === null, "serialized saves stays null");
  assert(json.values.shares === null, "serialized shares stays null");
}

// --- AT-019 変異テスト: 本当に 0 を入れたら 0 のまま残る（null と区別できている）------
{
  const withZero = importMetricSnapshot({
    metric_snapshot_id: "met_zero",
    publication_id: "pub_at019",
    captured_at: AT,
    window: "24h",
    source: "manual",
    manual_entry: {
      entered_by: "owner",
      entered_at: AT,
      evidence_reference: "screenshot-2026-08-16-reel",
      evidence_note: null,
    },
    values: { views: 1200, saves: 0 },
  });
  assert(withZero.values.saves === 0, "an actual zero must survive as zero");
  assert(withZero.completeness.known_fields.includes("saves"), "an actual zero counts as known");
  assert(!withZero.completeness.unknown_fields.includes("saves"), "an actual zero is not unknown");
}

// --- 反証: 手入力なのに入力者・日時・根拠が無ければ受け付けない -----------------------
{
  throws(
    () =>
      importMetricSnapshot({
        metric_snapshot_id: "met_bad",
        publication_id: "pub_at019",
        captured_at: AT,
        window: "24h",
        source: "manual",
        values: { views: 10 },
      }),
    "missing_manual_entry",
    "manual import without provenance",
  );
}

// --- 反証: 割合をパーセントの数字で入れたら止める（21 は 0.21 ではない）--------------
{
  throws(
    () =>
      importMetricSnapshot({
        metric_snapshot_id: "met_rate",
        publication_id: "pub_at019",
        captured_at: AT,
        window: "24h",
        source: "csv_import",
        values: { completion_rate: 21 },
      }),
    "invalid_metric",
    "completion_rate as a percentage number",
  );
}

// --- 反証: 負の値・小数の件数・ローカル時刻・個人情報を弾く ---------------------------
{
  throws(
    () =>
      importMetricSnapshot({
        metric_snapshot_id: "met_neg",
        publication_id: "pub_x",
        captured_at: AT,
        window: "24h",
        source: "csv_import",
        values: { views: -1 },
      }),
    "invalid_metric",
    "negative metric",
  );

  throws(
    () =>
      importMetricSnapshot({
        metric_snapshot_id: "met_frac",
        publication_id: "pub_x",
        captured_at: AT,
        window: "24h",
        source: "csv_import",
        values: { saves: 1.5 },
      }),
    "invalid_metric",
    "fractional count",
  );

  throws(
    () =>
      importMetricSnapshot({
        metric_snapshot_id: "met_tz",
        publication_id: "pub_x",
        captured_at: "2026-08-16T09:00:00+09:00",
        window: "24h",
        source: "csv_import",
      }),
    "invalid_timestamp",
    "non-UTC timestamp",
  );

  throws(
    () =>
      importMetricSnapshot({
        metric_snapshot_id: "met_pii",
        publication_id: "pub_x",
        captured_at: AT,
        window: "24h",
        source: "manual",
        manual_entry: {
          entered_by: "owner",
          entered_at: AT,
          // 連絡先を根拠欄へ書いてしまった場合。保存させない。
          evidence_reference: "owner@example.com からの転記",
          evidence_note: null,
        },
      }),
    "pii_in_record",
    "personal data in evidence",
  );

  throws(
    () =>
      importMetricSnapshot({
        metric_snapshot_id: "met_custom",
        publication_id: "pub_x",
        captured_at: AT,
        window: "custom",
        source: "csv_import",
      }),
    "missing_window_note",
    "custom window without a note",
  );
}

// =====================================================================================
// AT-020 Predicted vs Measured
// GIVEN: predicted Emotional Score 82 and measured completion 21 percent
// THEN: stored in separate structures with separate labels
// MUST NOT: average them
// =====================================================================================

{
  const predicted = recordPredictedScore({
    content_id: "cnt_at020",
    model_or_rule_version: "director-3.0.0",
    scored_at: AT,
    total_100: 82,
    axes: { safety: 90, trial_intent: 70 },
    confidence: 0.6,
    reasons: ["安心感の演出が主軸のため"],
  });

  const measured = importMetricSnapshot({
    metric_snapshot_id: "met_at020",
    publication_id: "pub_at020",
    captured_at: AT,
    window: "7d",
    source: "manual",
    source_reference: "insight-2026-08-16",
    manual_entry: {
      entered_by: "owner",
      entered_at: AT,
      evidence_reference: "insight-2026-08-16",
      evidence_note: null,
    },
    // 21パーセント = 0.21。
    values: { completion_rate: 0.21, views: 1200 },
  });

  const view = buildOutcomeView({ content_id: "cnt_at020", predicted, measured });

  // 別の構造に入っていること。
  assert(view.predicted !== null && view.measured !== null, "both sides exist");
  assert(view.predicted?.total_100 === 82, `predicted: ${view.predicted?.total_100}`);
  assert(
    view.measured?.snapshot.values.completion_rate === 0.21,
    `measured: ${view.measured?.snapshot.values.completion_rate}`,
  );

  // 別のラベルが付いていること。
  assert(view.predicted?.kind === "ai_prediction", `predicted kind: ${view.predicted?.kind}`);
  assert(view.predicted?.label === "predicted_emotional_score", "predicted label");
  assert(view.measured?.kind === "observed_metric", `measured kind: ${view.measured?.kind}`);
  assert(view.measured?.label === "measured_metrics", "measured label");
  assert(view.predicted?.kind !== view.measured?.kind, "labels must differ");

  // 予測の入れ物に実測が入っていない（逆も同じ）。
  assert(
    !Object.prototype.hasOwnProperty.call(view.predicted ?? {}, "completion_rate"),
    "predicted must not carry measured fields",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(view.measured?.snapshot.values ?? {}, "total_100"),
    "measured must not carry predicted fields",
  );

  // 平均しないこと。(82 + 21) / 2 = 51.5、(82 + 0.21) / 2 = 41.105 のどちらも作らない。
  const json = JSON.stringify(view);
  assert(!json.includes("51.5"), "AT-020 MUST NOT: averaged value 51.5 must not exist");
  assert(!json.includes("41.1"), "AT-020 MUST NOT: averaged value must not exist");
  assert(view.averaging_allowed === false, "averaging is structurally disallowed");
  assert(isAveragingAllowed() === false, "averaging helper always says no");
  assert(explainOutcome(view).includes("平均しません"), "explanation states the rule");
}

// --- AT-020 反証: 別 content の予測を混ぜようとしたら止める ---------------------------
{
  const other = recordPredictedScore({
    content_id: "cnt_other",
    model_or_rule_version: "director-3.0.0",
    scored_at: AT,
    total_100: 82,
  });
  throws(
    () => buildOutcomeView({ content_id: "cnt_at020", predicted: other }),
    "content_id_mismatch",
    "predicted score from a different content",
  );
}

// --- 反証: 予測点も 0〜100 の外は受け付けない -----------------------------------------
{
  throws(
    () =>
      recordPredictedScore({
        content_id: "cnt_bad",
        model_or_rule_version: "director-3.0.0",
        scored_at: AT,
        total_100: 120,
      }),
    "invalid_score",
    "predicted score above 100",
  );
}

// --- 反証: 片側しか無いときは「無い」と言う（0 で埋めない）---------------------------
{
  const onlyPredicted = buildOutcomeView({
    content_id: "cnt_solo",
    predicted: recordPredictedScore({
      content_id: "cnt_solo",
      model_or_rule_version: "director-3.0.0",
      scored_at: AT,
      total_100: 55,
    }),
  });
  assert(onlyPredicted.measured === null, "missing measurement stays null");
  assert(onlyPredicted.warnings.includes("measured_missing"), "missing side is announced");
}

// =====================================================================================
// AT-021 One-variable Experiment
// GIVEN: A and B differ only in Hook
// THEN: changed_variable_one hook / same target, CTA, duration and asset recorded
//       / valid for learning candidate
// =====================================================================================

const CONTROL_ARM: ExperimentArm = {
  content_id: "cnt_a",
  variables: {
    hook: "hook_question",
    duration_seconds: "15",
    cta_variant: "soft_trial",
    target: "women_beginners",
    asset_id: "ast_1",
    platform: "instagram_reel",
  },
};

const HOOK_ONLY_ARM: ExperimentArm = {
  content_id: "cnt_b",
  variables: {
    // ここだけが違う。
    hook: "hook_statement",
    duration_seconds: "15",
    cta_variant: "soft_trial",
    target: "women_beginners",
    asset_id: "ast_1",
    platform: "instagram_reel",
  },
};

const AT021 = designExperiment({
  experiment_id: "exp_at021",
  hypothesis: "問いかけ型より断言型の方が最初の3秒で残る",
  target: "women_beginners",
  primary_metric: "three_second_views",
  guardrail_metrics: ["saves"],
  control: CONTROL_ARM,
  treatment: HOOK_ONLY_ARM,
  start_at: AT,
  end_condition: "同じ取得期間の実測値が両方そろうまで",
});

{
  assert(AT021.design === "one_variable", `AT-021: design is ${AT021.design}`);
  assert(AT021.changed_variable_one === "hook", `AT-021: changed_variable_one is ${AT021.changed_variable_one}`);
  assert(AT021.changed_variables.length === 1, `only one change: ${AT021.changed_variables.join(",")}`);

  // そろえた項目が記録に残ること。
  for (const constant of ["target", "cta_variant", "duration_seconds", "asset_id"] as const) {
    assert(AT021.constants.includes(constant), `AT-021: ${constant} must be recorded as constant`);
  }

  // 学びの「候補」にはできる。ただし因果は言えないし、承認済みでもない。
  assert(AT021.learning_candidate_allowed === true, "AT-021: valid for learning candidate");
  assert(AT021.validated_learning_allowed === false, "promotion still needs Phase 5 and owner approval");
  assert(
    AT021.warnings.every(w => !w.startsWith("constants_not_recorded")),
    `constants should be complete: ${AT021.warnings.join(",")}`,
  );
  assert(explainExperiment(AT021).includes("違いは1つ"), "explanation says one variable");
}

// --- AT-021 変異テスト: 尺も変えたら one-variable ではなくなる -------------------------
{
  const mutated = designExperiment({
    experiment_id: "exp_mutation",
    hypothesis: "同上",
    target: "women_beginners",
    primary_metric: "three_second_views",
    control: CONTROL_ARM,
    treatment: {
      ...HOOK_ONLY_ARM,
      variables: { ...HOOK_ONLY_ARM.variables, duration_seconds: "30" },
    },
    start_at: AT,
    end_condition: "同上",
  });
  assert(mutated.design === "exploratory", "one extra change must flip the design");
  assert(mutated.changed_variable_one === null, "no single variable can be named");
  assert(mutated.learning_candidate_allowed === false, "mutation must remove the learning candidate flag");
}

// --- AT-021 反証: そろえたはずの項目が記録されていなければ警告する ---------------------
{
  const sloppy = designExperiment({
    experiment_id: "exp_sloppy",
    hypothesis: "同上",
    target: "women_beginners",
    primary_metric: "three_second_views",
    control: { content_id: "cnt_s1", variables: { hook: "a" } },
    treatment: { content_id: "cnt_s2", variables: { hook: "b" } },
    start_at: AT,
    end_condition: "同上",
  });
  assert(sloppy.design === "one_variable", "still one variable");
  assert(
    sloppy.warnings.some(w => w.startsWith("constants_not_recorded:")),
    `unrecorded constants must be warned: ${sloppy.warnings.join(",")}`,
  );
}

// --- AT-021 反証: 違いが無ければ比較として成立しない ---------------------------------
{
  const same = designExperiment({
    experiment_id: "exp_same",
    hypothesis: "同上",
    target: "women_beginners",
    primary_metric: "views",
    control: { content_id: "cnt_z1", variables: { hook: "a" } },
    treatment: { content_id: "cnt_z2", variables: { hook: "a" } },
    start_at: AT,
    end_condition: "同上",
  });
  assert(same.design === "invalid", `identical arms: ${same.design}`);
  assert(same.learning_candidate_allowed === false, "invalid design is not a learning candidate");
}

// --- diffVariables 単体の反証: 片側 null も違いとして数える --------------------------
{
  const changed = diffVariables(
    { content_id: "cnt_d1", variables: { hook: "a", cta_variant: null } },
    { content_id: "cnt_d2", variables: { hook: "a", cta_variant: "soft_trial" } },
  );
  assert(changed.length === 1 && changed[0] === "cta_variant", `diff: ${changed.join(",")}`);

  const bothUnknown = diffVariables(
    { content_id: "cnt_d3", variables: { hook: "a" } },
    { content_id: "cnt_d4", variables: { hook: "a" } },
  );
  assert(bothUnknown.length === 0, "both unknown is not a difference");
}

// =====================================================================================
// AT-022 Multi-variable Experiment
// GIVEN: A and B differ in Hook, duration and CTA
// THEN: marked exploratory / causal claim disabled / cannot promote to validated learning
// =====================================================================================

const AT022 = designExperiment({
  experiment_id: "exp_at022",
  hypothesis: "まとめて変えれば伸びるはず",
  target: "women_beginners",
  primary_metric: "three_second_views",
  control: CONTROL_ARM,
  treatment: {
    content_id: "cnt_c",
    variables: {
      hook: "hook_statement",
      duration_seconds: "30",
      cta_variant: "explicit_trial",
      target: "women_beginners",
      asset_id: "ast_1",
      platform: "instagram_reel",
    },
  },
  start_at: AT,
  end_condition: "同上",
});

{
  assert(AT022.design === "exploratory", `AT-022: design is ${AT022.design}`);
  assert(AT022.changed_variables.length === 3, `AT-022: ${AT022.changed_variables.join(",")}`);
  for (const name of ["hook", "duration_seconds", "cta_variant"] as const) {
    assert(AT022.changed_variables.includes(name), `AT-022: ${name} must be listed as changed`);
  }
  assert(AT022.changed_variable_one === null, "AT-022: no single variable may be claimed");
  assert(AT022.learning_candidate_allowed === false, "AT-022: cannot become a learning candidate");
  assert(AT022.validated_learning_allowed === false, "AT-022: cannot promote to validated learning");
  assert(AT022.limitations.length > 0, "AT-022: limitation must be written down");
  assert(
    AT022.warnings.some(w => w.startsWith("multi_variable:")),
    `AT-022: warning must name the variables: ${AT022.warnings.join(",")}`,
  );
  assert(explainExperiment(AT022).includes("探索のみ"), "explanation refuses a causal claim");
}

// --- 結果を入れても因果は主張しない（AT-021 / AT-022 共通）---------------------------

function snapshot(id: string, window: "24h" | "7d", value: number | null): MetricSnapshot {
  return importMetricSnapshot({
    metric_snapshot_id: id,
    publication_id: `pub_${id}`,
    captured_at: AT,
    window,
    source: "manual",
    manual_entry: {
      entered_by: "owner",
      entered_at: AT,
      evidence_reference: `insight-${id}`,
      evidence_note: null,
    },
    values: value === null ? {} : { three_second_views: value },
  });
}

{
  const measured = recordExperimentResult({
    experiment: AT021,
    control_snapshot: snapshot("a", "7d", 100),
    treatment_snapshot: snapshot("b", "7d", 140),
  });
  assert(measured.result?.direction === "up", `direction: ${measured.result?.direction}`);
  assert(measured.result?.causal_claim_allowed === false, "causal claim is always false");
  assert(measured.result?.comparable === true, "same window is comparable");
  assert(measured.learning_candidate_allowed === true, "one-variable with a valid comparison stays a candidate");
  assert(measured.validated_learning_allowed === false, "never auto-promoted");

  const exploratory = recordExperimentResult({
    experiment: AT022,
    control_snapshot: snapshot("c", "7d", 100),
    treatment_snapshot: snapshot("d", "7d", 200),
  });
  // 2倍に伸びていても、原因は言えない。
  assert(exploratory.result?.direction === "up", "the number went up");
  assert(exploratory.result?.causal_claim_allowed === false, "AT-022: causal claim stays disabled");
  assert(exploratory.learning_candidate_allowed === false, "AT-022: still not a candidate");
}

// --- 反証: 取得期間が違う数字は比べない ----------------------------------------------
{
  const mismatched = recordExperimentResult({
    experiment: AT021,
    control_snapshot: snapshot("e", "24h", 100),
    treatment_snapshot: snapshot("f", "7d", 400),
  });
  assert(mismatched.result?.comparable === false, "different windows are not comparable");
  assert(mismatched.result?.direction === "unknown", `direction: ${mismatched.result?.direction}`);
  assert(mismatched.learning_candidate_allowed === false, "an invalid comparison cannot feed learning");
  assert(
    mismatched.warnings.some(w => w.startsWith("window_mismatch:")),
    `warning missing: ${mismatched.warnings.join(",")}`,
  );
}

// --- 反証: 主要指標が未取得なら比べない（0 として扱わない）---------------------------
{
  const missing = recordExperimentResult({
    experiment: AT021,
    control_snapshot: snapshot("g", "7d", 100),
    treatment_snapshot: snapshot("h", "7d", null),
  });
  assert(missing.result?.treatment_value === null, "unknown stays null");
  assert(missing.result?.direction === "unknown", "unknown metric cannot show a direction");
  assert(missing.result?.comparable === false, "cannot compare against an unknown");
  assert(missing.learning_candidate_allowed === false, "no learning from an unknown");
}

// --- 反証: 同じ content 同士は実験にしない -------------------------------------------
{
  throws(
    () =>
      designExperiment({
        experiment_id: "exp_dup",
        hypothesis: "同上",
        target: "women_beginners",
        primary_metric: "views",
        control: { content_id: "cnt_same", variables: { hook: "a" } },
        treatment: { content_id: "cnt_same", variables: { hook: "b" } },
        start_at: AT,
        end_condition: "同上",
      }),
    "same_content",
    "control equals treatment",
  );
}

// =====================================================================================
// 決定性: 同じ入力なら同じ結果になる
// =====================================================================================

{
  const a = JSON.stringify(summarizeCost({ attempts: [attempt("gen_1", { usability: "usable" })] }));
  const b = JSON.stringify(summarizeCost({ attempts: [attempt("gen_1", { usability: "usable" })] }));
  assert(a === b, "cost summary is deterministic");

  const e1 = JSON.stringify(
    designExperiment({
      experiment_id: "exp_det",
      hypothesis: "同上",
      target: "women_beginners",
      primary_metric: "views",
      control: CONTROL_ARM,
      treatment: HOOK_ONLY_ARM,
      start_at: AT,
      end_condition: "同上",
    }),
  );
  const e2 = JSON.stringify(
    designExperiment({
      experiment_id: "exp_det",
      hypothesis: "同上",
      target: "women_beginners",
      primary_metric: "views",
      control: CONTROL_ARM,
      treatment: HOOK_ONLY_ARM,
      start_at: AT,
      end_condition: "同上",
    }),
  );
  assert(e1 === e2, "experiment design is deterministic");
}

// =====================================================================================
// 変更できないこと（記録は後から書き換えない）
// =====================================================================================

{
  assert(Object.isFrozen(AT021), "experiment is frozen");
  assert(Object.isFrozen(AT019_SNAPSHOT.values), "metric values are frozen");
  const summary = summarizeCost({ attempts: [attempt("gen_f", { usability: "usable" })] });
  assert(Object.isFrozen(summary), "cost summary is frozen");
}

// =====================================================================================
// 回帰テスト: コードレビューで見つかった不具合が戻らないようにする
//
// どれも「テストが通っているのに壊れていた」箇所。
// 既存のテストが1つも捕まえられなかったので、ここで固定する。
// =====================================================================================

// --- #8 失敗した試行を「使えた1本」に数えない ---------------------------------------
{
  const attempts: AttemptCostRecord[] = [
    attempt("gen_f1", { status: "failed", usability: "usable", provider_cost: { currency: "JPY", amount_minor: 300 } }),
    attempt("gen_f2", { status: "cancelled", usability: "usable", provider_cost: { currency: "JPY", amount_minor: 300 } }),
  ];
  const summary = summarizeCost({ attempts });

  assert(summary.usable_count === 0, `failed/cancelled attempts must not count as usable: ${summary.usable_count}`);
  assert(summary.effective_cost_per_usable === null, "no usable output means no per-usable cost");
  assert(summary.effective_cost_reason === "no_usable_output", `reason: ${summary.effective_cost_reason}`);
  assert(
    summary.health_warnings.some(w => w.startsWith("usable_but_not_succeeded:")),
    `the contradiction must be surfaced: ${summary.health_warnings.join(",")}`,
  );

  const mixed = summarizeCost({
    attempts: [
      attempt("gen_ok", { status: "succeeded", usability: "usable", provider_cost: { currency: "JPY", amount_minor: 300 } }),
      attempt("gen_bad", { status: "failed", usability: "usable", provider_cost: { currency: "JPY", amount_minor: 300 } }),
    ],
  });
  assert(mixed.usable_count === 1, `only the succeeded one counts: ${mixed.usable_count}`);
  assert(mixed.effective_cost_per_usable?.amount_minor === 600, `600 / 1 = 600: ${mixed.effective_cost_per_usable?.amount_minor}`);
}

// --- #2 manual_entry は source の種類に関わらず検査する ------------------------------
{
  throws(
    () =>
      importMetricSnapshot({
        metric_snapshot_id: "met_reg_tz",
        publication_id: "pub_reg",
        captured_at: AT,
        window: "24h",
        source: "csv_import",
        manual_entry: {
          entered_by: "owner",
          entered_at: "2026-08-16T09:00:00+09:00",
          evidence_reference: "csv-export",
          evidence_note: null,
        },
      }),
    "invalid_timestamp",
    "non-UTC entered_at on a csv_import snapshot",
  );

  throws(
    () =>
      importMetricSnapshot({
        metric_snapshot_id: "met_reg_pii",
        publication_id: "pub_reg",
        captured_at: AT,
        window: "24h",
        source: "platform_api",
        manual_entry: {
          entered_by: ["owner", " ", "090", "-", "1234", "-", "5678"].join(""),
          entered_at: AT,
          evidence_reference: "api-export",
          evidence_note: null,
        },
      }),
    "pii_in_record",
    "personal data in entered_by on a platform_api snapshot",
  );
}

// --- #13 表示のときだけ丸める（保存値は丸めない）------------------------------------
{
  const snap = importMetricSnapshot({
    metric_snapshot_id: "met_reg_round",
    publication_id: "pub_reg",
    captured_at: AT,
    window: "24h",
    source: "csv_import",
    values: { completion_rate: 0.07 },
  });
  const view = buildOutcomeView({ content_id: "cnt_reg_round", measured: snap });
  const text = explainOutcome(view);

  assert(!text.includes("7.000000000000001"), `floating point noise must not be shown: ${text}`);
  assert(text.includes("7%"), `the rounded value is shown: ${text}`);
  assert(snap.values.completion_rate === 0.07, "the stored value stays exact");
}

// --- #6 設計が成立していない実験は、数字がそろっても比べない ------------------------
{
  const invalid = designExperiment({
    experiment_id: "exp_reg_invalid",
    hypothesis: "同上",
    target: "women_beginners",
    primary_metric: "three_second_views",
    control: { content_id: "cnt_reg_i1", variables: { hook: "same" } },
    treatment: { content_id: "cnt_reg_i2", variables: { hook: "same" } },
    start_at: AT,
    end_condition: "同上",
  });
  assert(invalid.design === "invalid", "identical arms are invalid");

  const measured = recordExperimentResult({
    experiment: invalid,
    control_snapshot: snapshot("reg_i_a", "7d", 100),
    treatment_snapshot: snapshot("reg_i_b", "7d", 200),
  });
  assert(measured.result?.comparable === false, "an invalid design is never comparable");
  assert(measured.result?.direction === "unknown", `direction must stay unknown: ${measured.result?.direction}`);
  assert(measured.learning_candidate_allowed === false, "an invalid design cannot feed learning");
  assert(
    measured.warnings.some(w => w === "invalid_design:not_comparable"),
    `the reason must be recorded: ${measured.warnings.join(",")}`,
  );
  assert(
    !(measured.result?.confidence_note ?? "").includes("複数"),
    `must not claim multiple variables: ${measured.result?.confidence_note}`,
  );
}

// --- #7 同じ記録を両側に渡せない ----------------------------------------------------
{
  const same = snapshot("reg_same", "7d", 100);
  throws(
    () => recordExperimentResult({ experiment: AT021, control_snapshot: same, treatment_snapshot: same }),
    "same_snapshot_for_both_arms",
    "the same snapshot on both arms",
  );
}

// --- #12 測り終わった実験へ二重に書き込めない ---------------------------------------
{
  const once = recordExperimentResult({
    experiment: AT021,
    control_snapshot: snapshot("reg_d_a", "7d", 100),
    treatment_snapshot: snapshot("reg_d_b", "7d", 140),
  });
  assert(once.status === "measured", "recorded once");

  throws(
    () =>
      recordExperimentResult({
        experiment: once,
        control_snapshot: snapshot("reg_d_c", "7d", 100),
        treatment_snapshot: snapshot("reg_d_d", "7d", 140),
      }),
    "experiment_already_recorded",
    "recording over a measured experiment",
  );

  const mismatched = recordExperimentResult({
    experiment: AT022,
    control_snapshot: snapshot("reg_d_e", "24h", 100),
    treatment_snapshot: snapshot("reg_d_f", "7d", 140),
  });
  assert(
    new Set(mismatched.warnings).size === mismatched.warnings.length,
    `warnings must not duplicate: ${mismatched.warnings.join(",")}`,
  );
  assert(
    new Set(mismatched.limitations).size === mismatched.limitations.length,
    "limitations must not duplicate",
  );
}

// --- #11 取得期間が違うときは、どちらの窓かを両方書く -------------------------------
{
  const mismatched = recordExperimentResult({
    experiment: AT021,
    control_snapshot: snapshot("reg_w_a", "24h", 100),
    treatment_snapshot: snapshot("reg_w_b", "7d", 400),
  });
  const definition = mismatched.result?.metric_definition ?? "";
  assert(definition.includes("24h") && definition.includes("7d"), `both windows must be labelled: ${definition}`);
}

console.log("brand_growth growth (phase 4) tests passed");
