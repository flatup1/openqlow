// Brand Growth Phase 4 結合試験: 1本の動画が生まれてから数字が出るまで。
//
// 参照: IMPLEMENTATION_BOOK §6「生成前検査と Content lifecycle を保存する」。
//
// ここまでの Phase 4 テストは、部品を1つずつ確かめるものだった。
// この試験は「部品どうしが本当につながるか」を確かめる。
//
// 追う道すじ（docs/BRAND_GROWTH_METRIC_INPUT_SHEET.md の①〜⑤と同じ順番）:
//
//   ① 作る前   → 生成前検査（止まらないこと）＋ 予測点
//   ② 作った後 → 品質判定 → 費用集計 → 台帳
//   ③ 投稿     → 出したことの記録（下書きと区別する）
//   ④ 24時間後 → 実測値の手入力（空欄は空欄のまま）
//   ⑤ 答え     → 使える1本あたり／予測と実測を並べる
//   ⑥ 保存     → 追記して、読み戻して、同じものが返ること
//
// 書き込みは一時ディレクトリだけ。外部送信・課金・生成は一切しない。

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AttemptCostRecord, MetricSnapshot } from "./contracts/growth.js";
import type { KnowledgeQuery } from "./contracts/knowledge.js";
import type { QualityAssessment } from "./contracts/quality.js";
import { BLOCKING_CHECK_NAMES } from "./contracts/quality.js";
import { RecordRuleError } from "./contracts/record_rules.js";
import { FIXTURE_REGISTRY } from "./fixtures/knowledge_fixtures.js";
import { queryKnowledge } from "./knowledge/query.js";
import { route } from "./router/route.js";
import { renderCreativePackage } from "./prompts/render_preview.js";
import { runPreflight } from "./quality/preflight.js";
import { assessQuality, countUsable } from "./quality/post_qa.js";
import { summarizeCost } from "./growth/cost.js";
import {
  advanceLifecycle,
  buildContentRecord,
  explainContentRecord,
  isAwaitingMetrics,
  recordPublication,
} from "./growth/content_record.js";
import { buildOutcomeView, importMetricSnapshot, recordPredictedScore } from "./growth/metrics.js";
import { appendEvent, makeEvent, readEvents } from "./storage/event_store.js";
import type { AssetRef, CreativeInput } from "./contracts/creative_input.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function throws(fn: () => unknown, expectedCode: string, message: string): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof RecordRuleError) {
      assert(error.code === expectedCode, `${message}: expected ${expectedCode}, got ${error.code}`);
      return;
    }
    throw new Error(`${message}: unexpected error ${String(error)}`);
  }
  throw new Error(`${message}: expected a failure but nothing was thrown`);
}

const T0 = "2026-08-16T00:00:00Z"; // 作る日
const T1 = "2026-08-16T02:00:00Z"; // 判定した時刻
const T2 = "2026-08-16T03:00:00Z"; // 出した時刻
const T3 = "2026-08-17T03:00:00Z"; // 24時間後

// =====================================================================================
// ① 作る前
// =====================================================================================

const PHOTO: AssetRef = {
  asset_id: "ast_e2e_member",
  uri: "fixture://ast_e2e_member",
  sha256: "fixture-only-not-a-real-hash",
  media_type: "image",
  source_type: "member_photo",
  contains_person: true,
  contains_minor: false,
  consent_status: "confirmed",
  consent_reference: "fixture-consent-e2e",
  retention_class: "project",
};

const INPUT: CreativeInput = {
  request_id: "req_e2e_01",
  raw_text: "女性向け。この写真をリールに。体験につなげたい。",
  input_channel: "fixture",
  assets: [PHOTO],
  requested_at: T0,
};

const decision = route(INPUT);
const knowledgeQuery: KnowledgeQuery = {
  required_tags: ["brand:constitution"],
  target: decision.target_primary,
  objective: null,
  platform: null,
  content_mode: decision.content_mode,
  max_entries: 10,
  token_budget: 5000,
  facts_needed: false,
};
const knowledge = queryKnowledge(FIXTURE_REGISTRY, knowledgeQuery);
const pkg = renderCreativePackage(INPUT, decision, knowledge);
assert(!pkg.blocked && pkg.prompt_ir !== null, `phase 3 must produce a prompt: ${pkg.block_reason}`);

const preflight = runPreflight({ input: INPUT, decision, prompt_ir: pkg.prompt_ir });
assert(preflight.passed, `① preflight must pass: ${preflight.blockers.join(",")}`);
assert(preflight.provider_request_allowed, "① generation may proceed");

// シート①の「予測点」。これは勘であって事実ではない。
const predicted = recordPredictedScore({
  content_id: "cnt_e2e_01",
  model_or_rule_version: "director-3.0.0",
  scored_at: T0,
  total_100: 82,
  axes: { safety: 90, trial_intent: 70 },
  confidence: 0.5,
});
assert(predicted.kind === "ai_prediction", "① predicted score is labelled as a prediction");

// =====================================================================================
// ② 作った後: 判定 → 費用 → 台帳
// =====================================================================================

// 10本つくって、人の目で2本だけ採用した（シート②）。
const assessments: QualityAssessment[] = [];
for (let i = 0; i < 10; i++) {
  const usable = i < 2;
  assessments.push(
    assessQuality({
      assessment_id: `qa_e2e_${i}`,
      asset_id: `ast_e2e_out_${i}`,
      assessed_by: "human",
      assessed_at: T1,
      human_reviewer: "owner",
      blocking: Object.fromEntries(
        BLOCKING_CHECK_NAMES.map(name => [
          name,
          usable ? { outcome: "pass" as const } : name === "anatomy"
            ? { outcome: "fail" as const, reason: "hand shape broke" }
            : { outcome: "pass" as const },
        ]),
      ),
      scored: usable ? { motion: 80, technical: 78 } : { motion: 30 },
    }),
  );
}

assert(countUsable(assessments) === 2, `② usable count: ${countUsable(assessments)}`);

// 判定結果から、そのまま費用計算の入力を作る（人が数え直さない）。
const attempts: AttemptCostRecord[] = assessments.map((assessment, i) => ({
  attempt_id: `gen_e2e_${i}`,
  status: assessment.passed ? "succeeded" : "failed",
  provider_cost: { currency: "JPY", amount_minor: 100 },
  usability: assessment.usability,
  assessed_by: assessment.assessed_by,
}));

const cost = summarizeCost({ attempts });
assert(cost.provider_cost_total?.amount_minor === 1000, `② total: ${cost.provider_cost_total?.amount_minor}`);
assert(cost.usable_count === 2, `② usable: ${cost.usable_count}`);
assert(cost.effective_cost_per_usable?.amount_minor === 500, `② per usable: ${cost.effective_cost_per_usable?.amount_minor}`);

// 台帳を作る。費用はこの中で集計される。
let content = buildContentRecord({
  content_id: "cnt_e2e_01",
  request_id: INPUT.request_id,
  brief_id: "brf_e2e_01",
  target: decision.target_primary,
  objective: decision.objective,
  lifecycle_status: "assessed",
  created_at: T0,
  attempts,
  master_asset_ids: ["ast_e2e_out_0"],
  variant_asset_ids: ["ast_e2e_out_1"],
  source_asset_ids: [PHOTO.asset_id],
  platforms: ["instagram_reel"],
  hook: "hook_question",
  hero_moment: pkg.prompt_ir?.hero_moment ?? null,
  emotional_hypothesis: "安心感が伝われば体験につながる",
  version_bundle: pkg.version_bundle,
});

assert(content.cost_summary.effective_cost_per_usable?.amount_minor === 500, "② ledger carries the cost");
assert(content.lifecycle_status === "assessed", "② lifecycle is assessed");
assert(explainContentRecord(content).includes("500"), "② summary is readable");

// =====================================================================================
// ③ 投稿: 下書きと「出した」を混ぜない
// =====================================================================================

const draft = recordPublication({
  publication_id: "pub_e2e_draft",
  content_id: "cnt_e2e_01",
  platform: "instagram_reel",
  status: "draft_saved",
});
assert(draft.posted_at === null, "③ a draft has no posted time");
assert(!isAwaitingMetrics(draft), "③ a draft is not awaiting metrics");

// 反証: 証跡なしで posted にはできない（SCHEMA_CATALOG §13）。
throws(
  () =>
    recordPublication({
      publication_id: "pub_e2e_bad",
      content_id: "cnt_e2e_01",
      platform: "instagram_reel",
      status: "posted",
      posted_at: T2,
    }),
  "posted_without_evidence",
  "③ posted without external evidence",
);

// 反証: 日時なしでも posted にできない。
throws(
  () =>
    recordPublication({
      publication_id: "pub_e2e_bad2",
      content_id: "cnt_e2e_01",
      platform: "instagram_reel",
      status: "posted",
      platform_content_reference: "fixture-post-ref",
    }),
  "posted_without_time",
  "③ posted without a time",
);

// 反証: 出していないのに出した日時が入っているのは取り違え。
throws(
  () =>
    recordPublication({
      publication_id: "pub_e2e_bad3",
      content_id: "cnt_e2e_01",
      platform: "instagram_reel",
      status: "draft_saved",
      posted_at: T2,
    }),
  "unposted_has_posted_at",
  "③ draft carrying a posted time",
);

const published = recordPublication({
  publication_id: "pub_e2e_01",
  content_id: "cnt_e2e_01",
  platform: "instagram_reel",
  status: "posted",
  platform_content_reference: "fixture-post-ref",
  posted_at: T2,
  hook_variant: "hook_question",
  cta_variant: "soft_trial",
  duration_seconds: 15,
});
assert(isAwaitingMetrics(published), "③ a posted item awaits metrics");

content = advanceLifecycle(content, "published");
assert(content.lifecycle_status === "published", "③ lifecycle advanced");

// 反証: 一生は巻き戻せない。
throws(
  () => advanceLifecycle(content, "drafted"),
  "lifecycle_cannot_go_backwards",
  "③ lifecycle going backwards",
);

// =====================================================================================
// ④ 24時間後: 分かるものだけ入れる
// =====================================================================================

const measured: MetricSnapshot = importMetricSnapshot({
  metric_snapshot_id: "met_e2e_01",
  publication_id: published.publication_id,
  captured_at: T3,
  window: "24h",
  source: "manual",
  source_reference: "insight-2026-08-17",
  manual_entry: {
    entered_by: "owner",
    entered_at: T3,
    evidence_reference: "insight-2026-08-17",
    evidence_note: "インサイト画面の保存名のみ",
  },
  // 再生数と完視聴率は分かった。保存数は見つからなかった。
  values: { views: 1200, three_second_views: 800, completion_rate: 0.21 },
});

assert(measured.values.views === 1200, "④ views recorded");
assert(measured.values.completion_rate === 0.21, "④ 21% is stored as 0.21");
assert(measured.values.saves === null, "④ an unfound metric stays null");
assert((measured.values.saves as number | null) !== 0, "④ an unfound metric must not become zero");
assert(measured.publication_id === published.publication_id, "④ metrics point at a real publication");

content = advanceLifecycle(content, "measured");

// =====================================================================================
// ⑤ 答え: 予測と実測を並べる。混ぜない
// =====================================================================================

const outcome = buildOutcomeView({ content_id: "cnt_e2e_01", predicted, measured });
assert(outcome.predicted?.total_100 === 82, "⑤ prediction preserved");
assert(outcome.measured?.snapshot.values.completion_rate === 0.21, "⑤ measurement preserved");
assert(outcome.averaging_allowed === false, "⑤ averaging is refused");
assert(!JSON.stringify(outcome).includes("51.5"), "⑤ no averaged value exists");

// =====================================================================================
// ⑥ 保存: 追記して、読み戻して、同じものが返る
// =====================================================================================

const root = await mkdtemp(path.join(tmpdir(), "brand-growth-e2e-"));

try {
  const stream = "content_lifecycle";

  await appendEvent(root, stream, makeEvent({
    event_id: "evt_e2e_content",
    event_type: "content_recorded",
    created_at: T1,
    created_by: "phase4_integration_test",
    payload: content,
  }));

  await appendEvent(root, stream, makeEvent({
    event_id: "evt_e2e_publication",
    event_type: "publication_recorded",
    created_at: T2,
    created_by: "phase4_integration_test",
    payload: published,
  }));

  await appendEvent(root, stream, makeEvent({
    event_id: "evt_e2e_metrics",
    event_type: "metrics_imported",
    created_at: T3,
    created_by: "phase4_integration_test",
    payload: measured,
  }));

  await appendEvent(root, stream, makeEvent({
    event_id: "evt_e2e_outcome",
    event_type: "outcome_viewed",
    created_at: T3,
    created_by: "phase4_integration_test",
    payload: outcome,
  }));

  const back = await readEvents(root, stream);
  assert(back.malformed_lines === 0, `⑥ no malformed lines: ${back.malformed_lines}`);
  assert(back.events.length === 4, `⑥ all four records stored: ${back.events.length}`);
  assert(
    back.events.map(e => e.event_type).join(",") ===
      "content_recorded,publication_recorded,metrics_imported,outcome_viewed",
    "⑥ the lifecycle order is preserved on disk",
  );

  // 読み戻したものが、書いたものと同じであること（往復して壊れない）。
  const storedContent = back.events[0]?.payload as typeof content;
  assert(
    storedContent.cost_summary.effective_cost_per_usable?.amount_minor === 500,
    "⑥ the cost survives the round trip",
  );
  const storedMetrics = back.events[2]?.payload as MetricSnapshot;
  assert(storedMetrics.values.saves === null, "⑥ null survives the round trip as null, not 0");
  assert(storedMetrics.values.completion_rate === 0.21, "⑥ the ratio survives the round trip");

  // 予測と実測は、保存したあとも別の場所に居ること。
  const storedOutcome = back.events[3]?.payload as typeof outcome;
  assert(storedOutcome.predicted?.label === "predicted_emotional_score", "⑥ prediction keeps its label");
  assert(storedOutcome.measured?.label === "measured_metrics", "⑥ measurement keeps its label");
  assert(storedOutcome.averaging_allowed === false, "⑥ the no-averaging rule survives storage");

  // 全ての記録が schema_version を持っていること。
  for (const event of back.events) {
    assert(typeof event.schema_version === "string" && event.schema_version.length > 0,
      `⑥ every record carries a schema_version: ${event.event_id}`);
  }

  assert(root.startsWith(tmpdir()), `⑥ tests write only under the temp dir: ${root}`);
} finally {
  await rm(root, { recursive: true, force: true });
}

// =====================================================================================
// 反証: 未成年の同意が未確認なら、この道すじは①で止まる
// =====================================================================================

{
  const minorInput: CreativeInput = {
    ...INPUT,
    request_id: "req_e2e_minor",
    assets: [{ ...PHOTO, asset_id: "ast_e2e_minor", contains_minor: true, consent_status: "unknown" }],
  };
  const minorDecision = route(minorInput);
  const blocked = runPreflight({ input: minorInput, decision: minorDecision, prompt_ir: null });

  assert(!blocked.passed, "AT-025: the pipeline must stop at step ①");
  assert(!blocked.provider_request_allowed, "AT-025: nothing may be sent to a provider");
  assert(blocked.clarification_required, "AT-025: a human must be asked");
  // ここで止まるので、費用も実測もそもそも発生しない。
}

// =====================================================================================
// 回帰テスト: 台帳と投稿記録の不具合が戻らないようにする
// =====================================================================================

// --- #5 状態を進めたら、食い違いの警告も数え直す ------------------------------------
{
  const drafted = buildContentRecord({
    content_id: "cnt_reg_life",
    request_id: "req_reg_life",
    target: "women_beginners",
    objective: "trial",
    lifecycle_status: "drafted",
    created_at: T0,
  });
  assert(drafted.warnings.length === 0, `drafted はまだ食い違わない: ${drafted.warnings.join(",")}`);

  const jumped = advanceLifecycle(drafted, "measured");
  assert(jumped.lifecycle_status === "measured", "状態は進む");
  assert(
    jumped.warnings.includes("published_without_platform"),
    `配信面なしの measured を見逃さない: ${jumped.warnings.join(",")}`,
  );
  assert(
    jumped.warnings.includes("measured_without_usable_output"),
    `使えた本数0の measured を見逃さない: ${jumped.warnings.join(",")}`,
  );

  const healthy = advanceLifecycle(content, "archived");
  assert(healthy.lifecycle_status === "archived", "終わりの状態へは進める");
  assert(
    !healthy.warnings.includes("published_without_platform"),
    `そろっている記録に余計な警告を付けない: ${healthy.warnings.join(",")}`,
  );
}

// --- #10 hook が null でも「記録されていない」として警告する ------------------------
{
  const withNullHook = buildContentRecord({
    content_id: "cnt_reg_hook",
    request_id: "req_reg_hook",
    target: "women_beginners",
    objective: "trial",
    lifecycle_status: "assessed",
    created_at: T0,
    experiment_id: "exp_reg_hook",
    hook: null,
  });
  assert(
    withNullHook.warnings.includes("experiment_without_recorded_hook"),
    `hook: null も未記録として扱う: ${withNullHook.warnings.join(",")}`,
  );

  const withHook = buildContentRecord({
    content_id: "cnt_reg_hook2",
    request_id: "req_reg_hook2",
    target: "women_beginners",
    objective: "trial",
    lifecycle_status: "assessed",
    created_at: T0,
    experiment_id: "exp_reg_hook",
    hook: "hook_question",
  });
  assert(
    !withHook.warnings.includes("experiment_without_recorded_hook"),
    "hook があれば警告しない",
  );
}

// --- #9 並びの中身にも個人情報を入れさせない ----------------------------------------
{
  const phone = ["090", "-", "1234", "-", "5678"].join("");
  const email = ["member", "@", "example", ".com"].join("");

  throws(
    () =>
      buildContentRecord({
        content_id: "cnt_reg_arr",
        request_id: "req_reg_arr",
        target: "women_beginners",
        objective: "trial",
        lifecycle_status: "drafted",
        created_at: T0,
        master_asset_ids: [`ast_${phone}`],
      }),
    "pii_in_record",
    "個人情報が入った master_asset_ids",
  );

  throws(
    () =>
      buildContentRecord({
        content_id: "cnt_reg_arr2",
        request_id: "req_reg_arr2",
        target: "women_beginners",
        objective: "trial",
        lifecycle_status: "drafted",
        created_at: T0,
        platforms: [email],
      }),
    "pii_in_record",
    "個人情報が入った platforms",
  );

  throws(
    () =>
      buildContentRecord({
        content_id: "cnt_reg_arr3",
        request_id: "req_reg_arr3",
        target: "women_beginners",
        objective: "trial",
        lifecycle_status: "drafted",
        created_at: T0,
        hook: `連絡先は ${email}`,
      }),
    "pii_in_record",
    "個人情報が入った hook",
  );

  throws(
    () =>
      recordPublication({
        publication_id: "pub_reg_tags",
        content_id: "cnt_reg_ok",
        platform: "instagram_reel",
        status: "draft_saved",
        attribution_tags: [`tag_${phone}`],
      }),
    "pii_in_record",
    "個人情報が入った attribution_tags",
  );
}

// --- #14 尺に負の値や NaN を入れさせない --------------------------------------------
{
  for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
    throws(
      () =>
        recordPublication({
          publication_id: "pub_reg_dur",
          content_id: "cnt_reg_ok",
          platform: "instagram_reel",
          status: "draft_saved",
          duration_seconds: bad,
        }),
      "invalid_duration",
      `使えない尺 ${String(bad)}`,
    );
  }
  const ok = recordPublication({
    publication_id: "pub_reg_dur_ok",
    content_id: "cnt_reg_ok",
    platform: "instagram_reel",
    status: "draft_saved",
    duration_seconds: 15.5,
  });
  assert(ok.duration_seconds === 15.5, "小数の尺は保持する");
}

// --- #4 取り下げた投稿は「出した記録」を失わない ------------------------------------
{
  const removed = recordPublication({
    publication_id: "pub_reg_removed",
    content_id: "cnt_reg_ok",
    platform: "instagram_reel",
    status: "removed",
    platform_content_reference: "fixture-post-ref",
    posted_at: T2,
  });
  assert(removed.posted_at === T2, "出した日時は消さない");
  assert(removed.platform_content_reference === "fixture-post-ref", "証跡も残す");
  assert(!isAwaitingMetrics(removed), "取り下げた投稿の新しい数字は待たない");

  const neverPosted = recordPublication({
    publication_id: "pub_reg_removed2",
    content_id: "cnt_reg_ok",
    platform: "instagram_reel",
    status: "removed",
  });
  assert(
    neverPosted.warnings.includes("removed_without_posted_record"),
    `出す前の取り下げは印を残す: ${neverPosted.warnings.join(",")}`,
  );

  throws(
    () =>
      recordPublication({
        publication_id: "pub_reg_removed3",
        content_id: "cnt_reg_ok",
        platform: "instagram_reel",
        status: "removed",
        posted_at: T2,
      }),
    "removed_without_evidence",
    "証跡なしで posted_at を持つ removed",
  );
}

console.log("brand_growth integration (phase 4) tests passed");
