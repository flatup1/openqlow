// Brand Growth Phase 4 受入試験: 生成前の見張り役と、生成後の品質判定。
//
// 対応する受入条件: AT-025（未成年同意）の Phase 4 部分、SCHEMA_CATALOG §11 / §20。
//
// 反証テスト（negative control）を必ず添える。
// 検査を1つずつわざと壊し、そのたびに「本当に止まる」ことを確かめる。
// 全部通る入力しか試さないテストは、何も守っていないのと同じ。
//
// 外部アクセスなし。生成も課金もしない。時計も読まない。
//
// 注意: このファイルは src/shared/secret_guard.test.ts のリポジトリ走査対象に入る。
// 偽の鍵はソース上の文字列としては成立させず、実行時に組み立てる。

import type { AssetRef, CreativeInput } from "../contracts/creative_input.js";
import type { KnowledgeQuery } from "../contracts/knowledge.js";
import type { RouteDecision } from "../contracts/route_decision.js";
import { BLOCKING_CHECK_NAMES, SCORED_CHECK_NAMES } from "../contracts/quality.js";
import { RecordRuleError } from "../contracts/record_rules.js";
import { FIXTURE_REGISTRY } from "../fixtures/knowledge_fixtures.js";
import { queryKnowledge } from "../knowledge/query.js";
import { route } from "../router/route.js";
import type { NegativeCategory, PromptIR } from "../prompts/prompt_ir.js";
import { renderCreativePackage } from "../prompts/render_preview.js";
import { explainPreflight, runPreflight } from "./preflight.js";
import { assessQuality, countUsable, explainAssessment } from "./post_qa.js";

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

const AT = "2026-08-16T00:00:00Z";

// --- 試験用の入力（実データは使わない）------------------------------------------------

function asset(overrides: Partial<AssetRef> & Pick<AssetRef, "asset_id">): AssetRef {
  return {
    uri: `fixture://${overrides.asset_id}`,
    sha256: "fixture-only-not-a-real-hash",
    media_type: "image",
    source_type: "gym_photo",
    contains_person: false,
    contains_minor: false,
    consent_status: "not_required",
    consent_reference: null,
    retention_class: "session",
    ...overrides,
  };
}

const CONSENTED_ADULT = asset({
  asset_id: "ast_fx_adult",
  source_type: "member_photo",
  contains_person: true,
  consent_status: "confirmed",
  consent_reference: "fixture-consent-p4",
});

const MINOR_UNKNOWN_CONSENT = asset({
  asset_id: "ast_fx_minor",
  source_type: "member_photo",
  contains_person: true,
  contains_minor: true,
  consent_status: "unknown",
});

const PERSON_CONSENT_MISSING = asset({
  asset_id: "ast_fx_missing",
  source_type: "member_photo",
  contains_person: true,
  consent_status: "missing",
});

function input(id: string, rawText: string, assets: readonly AssetRef[]): CreativeInput {
  return {
    request_id: `req_${id}`,
    raw_text: rawText,
    input_channel: "fixture",
    assets,
    requested_at: AT,
  };
}

function knowledgeFor(target: string, mode: string) {
  const query: KnowledgeQuery = {
    required_tags: ["brand:constitution"],
    target,
    objective: null,
    platform: null,
    content_mode: mode,
    max_entries: 10,
    token_budget: 5000,
    facts_needed: false,
  };
  return queryKnowledge(FIXTURE_REGISTRY, query);
}

/** Phase 3 の実物を通して PromptIR を作る（作りものの IR では検査を試さない）。 */
function pipeline(creative: CreativeInput): { decision: RouteDecision; ir: PromptIR } {
  const decision = route(creative);
  const knowledge = knowledgeFor(decision.target_primary, decision.content_mode);
  const pkg = renderCreativePackage(creative, decision, knowledge);
  assert(!pkg.blocked, `phase 3 pipeline should produce a prompt: ${pkg.block_reason}`);
  assert(pkg.prompt_ir !== null, "prompt_ir exists");
  return { decision, ir: pkg.prompt_ir as PromptIR };
}

/** IR から分類を1つだけ抜いた複製を作る（変異テスト用）。 */
function without(ir: PromptIR, category: NegativeCategory): PromptIR {
  return { ...ir, negative_categories: ir.negative_categories.filter(b => b.category !== category) };
}

// =====================================================================================
// 正常系: そろっていれば通る
// =====================================================================================

const WOMEN_I2V = input("p4_women", "女性向け。この写真をリールに。体験につなげたい。", [CONSENTED_ADULT]);
const BASE = pipeline(WOMEN_I2V);

{
  const result = runPreflight({ input: WOMEN_I2V, decision: BASE.decision, prompt_ir: BASE.ir });

  assert(result.passed, `baseline should pass: ${JSON.stringify(result.blockers)} / ${JSON.stringify(result.warnings)}`);
  assert(result.provider_request_allowed, "a clean piece may be sent to a provider");
  assert(result.blockers.length === 0, `no blockers: ${result.blockers.join(",")}`);

  // SCHEMA_CATALOG §11 の7項目が、順番どおりに漏れなく並ぶ。
  assert(result.checks.length === BLOCKING_CHECK_NAMES.length, `check count: ${result.checks.length}`);
  assert(
    result.checks.map(c => c.name).join(",") === BLOCKING_CHECK_NAMES.join(","),
    "checks follow the schema order",
  );
  assert(explainPreflight(result).includes("通過"), "explanation says it passed");
}

// --- 決定性: 同じ入力なら同じ結果 -----------------------------------------------------
{
  const a = JSON.stringify(runPreflight({ input: WOMEN_I2V, decision: BASE.decision, prompt_ir: BASE.ir }));
  const b = JSON.stringify(runPreflight({ input: WOMEN_I2V, decision: BASE.decision, prompt_ir: BASE.ir }));
  assert(a === b, "preflight is deterministic");
}

// =====================================================================================
// 反証: 検査を1つずつ壊すと、その検査だけが落ちる
// （「いつも通る」テストになっていないことの証明）
// =====================================================================================

{
  // identity: 同一性の守りを外す。
  const noIdentity = runPreflight({
    input: WOMEN_I2V,
    decision: BASE.decision,
    prompt_ir: without(BASE.ir, "identity"),
  });
  assert(!noIdentity.passed, "removing identity negatives must fail preflight");
  assert(
    noIdentity.blockers.some(b => b.startsWith("identity:")),
    `identity must be the failing check: ${noIdentity.blockers.join(",")}`,
  );
  assert(!noIdentity.provider_request_allowed, "a failed piece must not go to a provider");
}

{
  // anatomy
  const broken = runPreflight({
    input: WOMEN_I2V,
    decision: BASE.decision,
    prompt_ir: without(BASE.ir, "anatomy"),
  });
  assert(!broken.passed && broken.blockers.some(b => b.startsWith("anatomy:")), `anatomy: ${broken.blockers.join(",")}`);
}

{
  // temporal
  const broken = runPreflight({
    input: WOMEN_I2V,
    decision: BASE.decision,
    prompt_ir: without(BASE.ir, "temporal"),
  });
  assert(!broken.passed && broken.blockers.some(b => b.startsWith("temporal:")), `temporal: ${broken.blockers.join(",")}`);
}

{
  // brand
  const broken = runPreflight({
    input: WOMEN_I2V,
    decision: BASE.decision,
    prompt_ir: without(BASE.ir, "brand"),
  });
  assert(!broken.passed && broken.blockers.some(b => b.startsWith("brand:")), `brand: ${broken.blockers.join(",")}`);
}

{
  // identity: 守るべきものの一覧が空になった場合。
  const broken = runPreflight({
    input: WOMEN_I2V,
    decision: BASE.decision,
    prompt_ir: { ...BASE.ir, subject_preservation: [] },
  });
  assert(
    !broken.passed && broken.blockers.some(b => b.includes("subject_preservation_missing")),
    `subject preservation: ${broken.blockers.join(",")}`,
  );
}

// --- environment は「実在の場所を写すとき」だけ効く（過剰にも過少にもならない）--------
{
  const facility = input("p4_facility", "このジム写真をWebサイトのヒーロー動画に。", [
    asset({ asset_id: "ast_fx_gym", source_type: "facility_photo" }),
  ]);
  const built = pipeline(facility);
  const ok = runPreflight({ input: facility, decision: built.decision, prompt_ir: built.ir });
  assert(ok.passed, `facility baseline should pass: ${ok.blockers.join(",")}`);

  const broken = runPreflight({
    input: facility,
    decision: built.decision,
    prompt_ir: without(built.ir, "environment"),
  });
  assert(
    !broken.passed && broken.blockers.some(b => b.startsWith("environment:")),
    `environment: ${broken.blockers.join(",")}`,
  );

  // 実在の場所を写さないなら、この検査は「関係なし」であって「合格」ではない。
  const noPlace = runPreflight({ input: WOMEN_I2V, decision: BASE.decision, prompt_ir: BASE.ir });
  const envCheck = noPlace.checks.find(c => c.name === "environment");
  assert(envCheck?.outcome === "not_applicable", `environment should be n/a here: ${envCheck?.outcome}`);
}

// =====================================================================================
// AT-025 の Phase 4 側: 未成年の同意が未確認なら、生成前に止まる
// =====================================================================================

{
  const minor = input("p4_minor", "この写真を動かして。", [MINOR_UNKNOWN_CONSENT]);
  const decision = route(minor);
  const result = runPreflight({ input: minor, decision, prompt_ir: null });

  assert(!result.passed, "AT-025: unconfirmed minor consent must fail");
  assert(
    result.blockers.some(b => b.startsWith("consent:minor_consent_unconfirmed")),
    `AT-025: consent must be the blocker: ${result.blockers.join(",")}`,
  );
  assert(!result.provider_request_allowed, "AT-025: no provider request");
  assert(result.clarification_required, "AT-025: a human must be asked");

  // 素材の ID や中身を漏らさない（件数だけ）。
  const asJson = JSON.stringify(result);
  assert(!asJson.includes("ast_fx_minor"), "the asset id must not leak into the result");
}

// --- 大人でも同意が「無い」なら止める -------------------------------------------------
{
  const missing = input("p4_missing", "この写真を動かして。", [PERSON_CONSENT_MISSING]);
  const decision = route(missing);
  const result = runPreflight({ input: missing, decision, prompt_ir: null });
  assert(
    result.blockers.some(b => b.startsWith("consent:person_consent_missing")),
    `missing consent must block: ${result.blockers.join(",")}`,
  );
}

// --- 回帰: 大人でも同意が「不明」なら合格にしない（fail closed）----------------------
//
// 見つかった不具合: consent_status が "missing" のときだけ fail にしていたため、
// "unknown"（未確認）の大人が pass になり、provider_request_allowed=true になっていた。
// 「不明」は「同意あり」ではない。
{
  const unknownConsent = input("p4_unknown_consent", "この写真を動かして。", [
    asset({
      asset_id: "ast_fx_unknown",
      source_type: "member_photo",
      contains_person: true,
      consent_status: "unknown",
    }),
  ]);
  const decision = route(unknownConsent);
  const result = runPreflight({ input: unknownConsent, decision, prompt_ir: null });

  const consent = result.checks.find(c => c.name === "consent");
  assert(consent?.outcome !== "pass", `unknown consent must never pass: ${consent?.outcome}`);
  assert(consent?.outcome === "unknown", `unknown consent stays unknown: ${consent?.outcome}`);
  assert(
    (consent?.reason ?? "").startsWith("person_consent_unknown"),
    `reason must name the cause: ${consent?.reason}`,
  );
  assert(!result.passed, "unverified consent must not pass preflight");
  assert(!result.provider_request_allowed, "unverified consent must not reach a provider");
  assert(result.clarification_required, "unverified consent must be raised to a human");
}

// --- confirmed と not_required は通る（過剰に止めない）-------------------------------
{
  for (const status of ["confirmed", "not_required"] as const) {
    const ok = input(`p4_consent_${status}`, "この写真を動かして。", [
      asset({
        asset_id: `ast_fx_${status}`,
        source_type: "member_photo",
        contains_person: true,
        consent_status: status,
        consent_reference: status === "confirmed" ? "fixture-consent" : null,
      }),
    ]);
    const decision = route(ok);
    const result = runPreflight({ input: ok, decision, prompt_ir: null });
    const consent = result.checks.find(c => c.name === "consent");
    assert(consent?.outcome === "pass", `${status} should pass consent: ${consent?.outcome}`);
  }
}

// --- 人物がいなければ consent は「関係なし」 -----------------------------------------
{
  const noPerson = input("p4_noperson", "館内の設備を見せたい。", [
    asset({ asset_id: "ast_fx_room", source_type: "facility_photo" }),
  ]);
  const decision = route(noPerson);
  const result = runPreflight({ input: noPerson, decision, prompt_ir: null });
  const consent = result.checks.find(c => c.name === "consent");
  assert(consent?.outcome === "not_applicable", `consent should be n/a: ${consent?.outcome}`);
}

// =====================================================================================
// 反証: 秘密情報・個人情報・ブランド違反は生成前に止まる
// =====================================================================================

{
  // ソース上に本物の形を残さないため、実行時に組み立てる。
  const fakeKey = ["sk", "-", "0".repeat(32)].join("");
  const leaky = input("p4_secret", `この写真を動かして。api key は ${fakeKey}`, [CONSENTED_ADULT]);
  const decision = route(leaky);
  const result = runPreflight({ input: leaky, decision, prompt_ir: null });

  assert(
    result.blockers.some(b => b.startsWith("secret_or_pii:secret:")),
    `credential must block: ${result.blockers.join(",")}`,
  );
  // 値そのものは結果に出さない。
  assert(!JSON.stringify(result).includes(fakeKey), "the credential must never appear in the result");
}

{
  const fakeEmail = ["member", "@", "example", ".com"].join("");
  const leaky = input("p4_pii", `この写真を動かして。連絡先 ${fakeEmail}`, [CONSENTED_ADULT]);
  const decision = route(leaky);
  const result = runPreflight({ input: leaky, decision, prompt_ir: null });
  assert(
    result.blockers.some(b => b.startsWith("secret_or_pii:pii:")),
    `personal data must block: ${result.blockers.join(",")}`,
  );
  assert(!JSON.stringify(result).includes(fakeEmail), "personal data must not appear in the result");
}

// --- 反証: 区切り記号の直後に隠したPII / secretも止める -------------------
{
  const prefixedPhone = ["ref_", "090", "-", "1234", "-", "5678"].join("");
  const leaky = input("p4_pii_prefixed", `女性向け。この写真をリールに。${prefixedPhone}`, [CONSENTED_ADULT]);
  const built = pipeline(leaky);
  const result = runPreflight({ input: leaky, decision: built.decision, prompt_ir: built.ir });

  assert(!result.passed, "prefixed personal data must fail preflight");
  assert(!result.provider_request_allowed, "prefixed personal data must never reach a provider");
  assert(
    result.blockers.some(b => b.startsWith("secret_or_pii:pii:phone")),
    `prefixed phone must be named by kind only: ${result.blockers.join(",")}`,
  );
  assert(!JSON.stringify(result).includes(prefixedPhone), "the prefixed phone must not leak into the result");
}

{
  const prefixedKey = ["ref_", "sk", "-", "0".repeat(32)].join("");
  const leaky = input("p4_secret_prefixed", `女性向け。この写真をリールに。${prefixedKey}`, [CONSENTED_ADULT]);
  const built = pipeline(leaky);
  const result = runPreflight({ input: leaky, decision: built.decision, prompt_ir: built.ir });

  assert(!result.passed, "prefixed credential must fail preflight");
  assert(!result.provider_request_allowed, "prefixed credential must never reach a provider");
  assert(
    result.blockers.some(b => b.startsWith("secret_or_pii:secret:")),
    `prefixed credential must be named by kind only: ${result.blockers.join(",")}`,
  );
  assert(!JSON.stringify(result).includes(prefixedKey), "the prefixed credential must not leak into the result");
}

{
  // GitHub形式は秘密本体にも`_`を含むため、区切りを全部消す実装への反証になる。
  const prefixedKey = ["ref_", "gh", "p", "_", "0".repeat(30)].join("");
  const leaky = input("p4_secret_prefixed_internal_separator", `女性向け。${prefixedKey}`, [CONSENTED_ADULT]);
  const built = pipeline(leaky);
  const result = runPreflight({ input: leaky, decision: built.decision, prompt_ir: built.ir });

  assert(!result.passed, "prefixed credential containing an internal separator must fail preflight");
  assert(!result.provider_request_allowed, "the credential must never reach a provider");
  assert(
    result.blockers.some(b => b.startsWith("secret_or_pii:secret:github_token")),
    `GitHub credential must be named by kind only: ${result.blockers.join(",")}`,
  );
  assert(!JSON.stringify(result).includes(prefixedKey), "the credential must not leak into the result");
}

{
  const brutal = input("p4_brand", "流血するくらい激しい試合の動画にして。", [CONSENTED_ADULT]);
  const decision = route(brutal);
  const result = runPreflight({ input: brutal, decision, prompt_ir: null });
  assert(
    result.blockers.some(b => b.startsWith("brand:brand_forbidden_expression")),
    `brand violation must block: ${result.blockers.join(",")}`,
  );
}

// --- 反証: 英語大文字・全角でもブランド禁止語は止める -------------------
{
  for (const word of ["BLOOD", "ＨＯＲＲＯＲ"]) {
    const brutal = input(`p4_brand_case_${word.length}`, `この写真を${word}演出にして。`, [CONSENTED_ADULT]);
    const built = pipeline(brutal);
    const result = runPreflight({ input: brutal, decision: built.decision, prompt_ir: built.ir });
    assert(!result.passed, `${word}: normalized brand violation must fail`);
    assert(!result.provider_request_allowed, `${word}: brand violation must not reach a provider`);
    assert(
      result.blockers.some(b => b.startsWith("brand:brand_forbidden_expression")),
      `${word}: brand blocker is required: ${result.blockers.join(",")}`,
    );
  }
}

// --- Knowledge が止まっているなら、こちらも止まる -------------------------------------
{
  const result = runPreflight({
    input: WOMEN_I2V,
    decision: BASE.decision,
    prompt_ir: BASE.ir,
    knowledge_blocked: true,
    knowledge_block_reason: "constitution_unavailable",
  });
  assert(!result.passed, "blocked knowledge must block generation");
  assert(
    result.blockers.some(b => b === "knowledge:constitution_unavailable"),
    `knowledge blocker: ${result.blockers.join(",")}`,
  );
}

// --- Prompt がまだ無い段階は「合格」にしない（未確認のまま止める）--------------------
{
  const result = runPreflight({ input: WOMEN_I2V, decision: BASE.decision, prompt_ir: null });
  assert(!result.passed, "an unverified piece is never passed");
  assert(result.warnings.length > 0, "unverified checks are reported");
  assert(
    result.checks.some(c => c.outcome === "unknown"),
    "prompt-derived checks stay unknown until a prompt exists",
  );
}

// =====================================================================================
// post-QA: blocking が1つでも fail なら passed=false
// =====================================================================================

const ALL_PASS = Object.fromEntries(
  BLOCKING_CHECK_NAMES.map(name => [name, { outcome: "pass" as const }]),
);

{
  const assessment = assessQuality({
    assessment_id: "qa_ok",
    asset_id: "ast_out_1",
    assessed_by: "human",
    assessed_at: AT,
    human_reviewer: "owner",
    blocking: ALL_PASS,
    scored: { motion: 80, technical: 75, story_readability: 90, emotional_goal: 85, hero_moment: 88 },
  });

  assert(assessment.passed, "all blocking checks pass");
  assert(assessment.usability === "usable", `usability: ${assessment.usability}`);
  assert(assessment.rejection_reasons.length === 0, "nothing to reject");
  assert(assessment.blocking_checks.length === BLOCKING_CHECK_NAMES.length, "all blocking checks recorded");
  assert(assessment.scored_checks.length === SCORED_CHECK_NAMES.length, "all scored checks recorded");
  assert(Object.isFrozen(assessment), "assessment is frozen");
  assert(explainAssessment(assessment).includes("合格"), "explanation says it passed");
}

// --- 反証: 検査を1つずつ fail にすると、必ず不合格になる ------------------------------
{
  for (const name of BLOCKING_CHECK_NAMES) {
    const assessment = assessQuality({
      assessment_id: `qa_fail_${name}`,
      asset_id: "ast_out_1",
      assessed_by: "human",
      assessed_at: AT,
      human_reviewer: "owner",
      blocking: { ...ALL_PASS, [name]: { outcome: "fail", reason: "test" } },
      // 点数は満点。点では取り返せないことを示す。
      scored: { motion: 100, technical: 100, story_readability: 100, emotional_goal: 100, hero_moment: 100 },
    });
    assert(!assessment.passed, `${name}: a single blocking failure must fail the whole assessment`);
    assert(assessment.usability === "rejected", `${name}: usability must be rejected`);
    assert(
      assessment.rejection_reasons.some(r => r.startsWith(`${name}:`)),
      `${name}: the reason must name the check`,
    );
  }
}

// --- 反証: 書かなかった検査は合格にならない（fail closed）----------------------------
{
  const partial = assessQuality({
    assessment_id: "qa_partial",
    asset_id: "ast_out_2",
    assessed_by: "human",
    assessed_at: AT,
    human_reviewer: "owner",
    blocking: { consent: { outcome: "pass" } },
  });
  assert(!partial.passed, "unassessed blocking checks must not pass");
  assert(partial.usability === "unknown", `usability: ${partial.usability}`);
  assert(partial.warnings.some(w => w === "unverified:brand"), "unverified checks are listed");
}

// --- not_applicable は合格として扱ってよい -------------------------------------------
{
  const na = assessQuality({
    assessment_id: "qa_na",
    asset_id: "ast_out_3",
    assessed_by: "hybrid",
    assessed_at: AT,
    human_reviewer: "owner",
    blocking: Object.fromEntries(
      BLOCKING_CHECK_NAMES.map(name => [name, { outcome: name === "identity" ? "not_applicable" : "pass" }]),
    ) as Record<string, { outcome: "pass" | "not_applicable" }>,
  });
  assert(na.passed, "not_applicable is not a failure");
  assert(na.usability === "usable", "hybrid review may mark usable");
}

// --- 反証: 自動判定だけでは usable にしない（SCHEMA_CATALOG §20）---------------------
{
  const automated = assessQuality({
    assessment_id: "qa_auto",
    asset_id: "ast_out_4",
    assessed_by: "automated",
    assessed_at: AT,
    blocking: ALL_PASS,
  });
  assert(automated.passed, "the checks themselves passed");
  assert(automated.usability === "unknown", `automated must not be usable: ${automated.usability}`);
  assert(
    automated.warnings.some(w => w.startsWith("automated_only:")),
    "the reason must be visible",
  );

  // 費用計算にも数えない。
  assert(countUsable([automated]) === 0, "automated results are not counted as usable");
}

// --- countUsable は人の判定だけを数える ----------------------------------------------
{
  const human = assessQuality({
    assessment_id: "qa_h",
    asset_id: "ast_out_5",
    assessed_by: "human",
    assessed_at: AT,
    human_reviewer: "owner",
    blocking: ALL_PASS,
  });
  const hybrid = assessQuality({
    assessment_id: "qa_hy",
    asset_id: "ast_out_6",
    assessed_by: "hybrid",
    assessed_at: AT,
    human_reviewer: "owner",
    blocking: ALL_PASS,
  });
  const automated = assessQuality({
    assessment_id: "qa_a",
    asset_id: "ast_out_7",
    assessed_by: "automated",
    assessed_at: AT,
    blocking: ALL_PASS,
  });
  assert(countUsable([human, hybrid, automated]) === 2, "only human and hybrid count");
}

// --- 反証: 点数は 0〜100 の外を受け付けない -------------------------------------------
{
  throws(
    () =>
      assessQuality({
        assessment_id: "qa_bad_score",
        asset_id: "ast_out_8",
        assessed_by: "human",
        assessed_at: AT,
        human_reviewer: "owner",
        blocking: ALL_PASS,
        scored: { motion: 101 },
      }),
    "invalid_score",
    "score above 100",
  );
}

// --- 反証: 点けていない点数は 0 ではなく null ----------------------------------------
{
  const assessment = assessQuality({
    assessment_id: "qa_unscored",
    asset_id: "ast_out_9",
    assessed_by: "human",
    assessed_at: AT,
    human_reviewer: "owner",
    blocking: ALL_PASS,
    scored: { motion: 70 },
  });
  const technical = assessment.scored_checks.find(c => c.name === "technical");
  assert(technical?.score === null, "an unscored check stays null");
  assert((technical?.score as number | null) !== 0, "an unscored check must not become zero");
}

// --- 反証: 人の判定なのに担当が空、日時が UTC でない、ID に個人情報 -------------------
{
  throws(
    () =>
      assessQuality({
        assessment_id: "qa_noreviewer",
        asset_id: "ast_out_10",
        assessed_by: "human",
        assessed_at: AT,
        blocking: ALL_PASS,
      }),
    "missing_reviewer",
    "human review without a reviewer",
  );

  throws(
    () =>
      assessQuality({
        assessment_id: "qa_tz",
        asset_id: "ast_out_11",
        assessed_by: "automated",
        assessed_at: "2026-08-16T09:00:00+09:00",
        blocking: ALL_PASS,
      }),
    "invalid_timestamp",
    "non-UTC assessed_at",
  );

  const idWithPhone = ["ast_", "090", "-", "1234", "-", "5678"].join("");
  throws(
    () =>
      assessQuality({
        assessment_id: "qa_pii_id",
        asset_id: idWithPhone,
        assessed_by: "automated",
        assessed_at: AT,
        blocking: ALL_PASS,
      }),
    "pii_in_id",
    "phone number inside an asset id",
  );
}

// --- 反証: メモに秘密情報・個人情報を残させない ---------------------------------------
{
  const fakeKey = ["sk", "-", "0".repeat(32)].join("");
  throws(
    () =>
      assessQuality({
        assessment_id: "qa_secret_note",
        asset_id: "ast_out_12",
        assessed_by: "automated",
        assessed_at: AT,
        blocking: ALL_PASS,
        notes: [`provider key ${fakeKey}`],
      }),
    "secret_in_record",
    "credential in notes",
  );

  const fakePhone = ["090", "-", "1234", "-", "5678"].join("");
  throws(
    () =>
      assessQuality({
        assessment_id: "qa_pii_note",
        asset_id: "ast_out_13",
        assessed_by: "automated",
        assessed_at: AT,
        blocking: ALL_PASS,
        notes: [`本人確認は ${fakePhone}`],
      }),
    "pii_in_record",
    "personal data in notes",
  );
}

// --- 反証: post-QAの担当名に隠したPIIも受け付けない -----------------------
{
  const prefixedPhone = ["owner_", "090", "-", "1234", "-", "5678"].join("");
  throws(
    () =>
      assessQuality({
        assessment_id: "qa_pii_prefixed_reviewer",
        asset_id: "ast_out_prefixed_reviewer",
        assessed_by: "human",
        assessed_at: AT,
        human_reviewer: prefixedPhone,
        blocking: ALL_PASS,
      }),
    "pii_in_record",
    "prefixed personal data in human_reviewer",
  );
}

// --- 決定性 ---------------------------------------------------------------------------
{
  const make = () =>
    JSON.stringify(
      assessQuality({
        assessment_id: "qa_det",
        asset_id: "ast_out_14",
        assessed_by: "human",
        assessed_at: AT,
        human_reviewer: "owner",
        blocking: ALL_PASS,
        scored: { motion: 70 },
      }),
    );
  assert(make() === make(), "assessment is deterministic");
}

console.log("brand_growth quality (phase 4) tests passed");
