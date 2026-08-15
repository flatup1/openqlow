// Brand Growth Phase 3 受入試験: Prompt IR と Negative と Style Guard。
//
// 対応: AT-010 / AT-011 / AT-012 / AT-013 / AT-014 / AT-015 / AT-016 / AT-037 /
//       AT-046 の Phase 3 部分。
//
// 外部アクセスなし。Provider へは接続しない。生成も課金もしない。

import type { AssetRef, CreativeInput } from "../contracts/creative_input.js";
import type { KnowledgeQuery } from "../contracts/knowledge.js";
import { FIXTURE_REGISTRY } from "../fixtures/knowledge_fixtures.js";
import { queryKnowledge } from "../knowledge/query.js";
import { createManifestRegistry } from "../knowledge/manifest.js";
import { route } from "../router/route.js";
import { selectNegativeCategories } from "./negative_compose.js";
import { buildVersionBundle, NEGATIVE_RULES_VERSION, PROMPT_ENGINE_VERSION } from "./prompt_ir.js";
import { renderCreativePackage } from "./render_preview.js";
import { guardStyleNames, isFreeOfStyleNames } from "./style_name_guard.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 試験用の入力 ---------------------------------------------------------------------

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
  consent_reference: "fixture-consent-p3",
});

const EMPTY_FACILITY = asset({ asset_id: "ast_fx_facility", source_type: "facility_photo" });

const CHARACTER_SHEET = asset({
  asset_id: "ast_fx_character",
  media_type: "character_sheet",
  source_type: "character_sheet",
});

function input(id: string, rawText: string, assets: readonly AssetRef[]): CreativeInput {
  return {
    request_id: `req_${id}`,
    raw_text: rawText,
    input_channel: "fixture",
    assets,
    requested_at: "2026-08-15T00:00:00Z",
  };
}

function knowledgeFor(target: string, mode: string, objective: string | null = null) {
  const query: KnowledgeQuery = {
    required_tags: ["brand:constitution"],
    target,
    objective,
    platform: null,
    content_mode: mode,
    max_entries: 10,
    token_budget: 5000,
    facts_needed: false,
  };
  return queryKnowledge(FIXTURE_REGISTRY, query);
}

function packageFor(creativeInput: CreativeInput, target: string, mode: string, objective: string | null = null) {
  const decision = route(creativeInput);
  return renderCreativePackage(creativeInput, decision, knowledgeFor(target, mode, objective));
}

// --- AT-010 実在人物の同一性 -------------------------------------------------------------

{
  const pkg = packageFor(
    input("at010", "女性向け。このジム写真を動かして。Instagram Reel。", [CONSENTED_ADULT]),
    "women_beginners",
    "image_to_video",
  );
  assert(!pkg.blocked, `AT-010 should produce a prompt: ${pkg.block_reason}`);
  const ir = pkg.prompt_ir;
  assert(ir !== null, "AT-010 prompt ir exists");
  if (ir === null) throw new Error("unreachable");

  // 6分類すべてが付く。
  const categories = ir.negative_categories.map(block => block.category);
  for (const required of ["identity", "anatomy", "motion", "temporal", "environment", "brand"]) {
    assert(categories.includes(required as never), `AT-010 needs ${required} negatives`);
  }

  // 守るもの: 顔・年齢・髪・体型・服・グローブ・人数・ジム・背景・時間の一貫性。
  const preservation = ir.subject_preservation.join(" ");
  for (const keyword of ["face", "age", "hair", "body type", "clothing", "gloves", "number of people", "gym", "temporal"]) {
    assert(preservation.includes(keyword), `AT-010 must preserve ${keyword}`);
  }
  assert(preservation.includes("breathing"), "AT-010 allows natural breathing");
  assert(preservation.includes("weight transfer"), "AT-010 keeps believable weight transfer");

  // 動作はひとつ。
  assert(ir.action.length > 0, "AT-010 has one action");
  assert(preservation.includes("exactly one action"), "AT-010 states exactly one action");
}

// --- AT-011 必要な分類だけ選ぶ -------------------------------------------------------------

{
  const pkg = packageFor(
    input("at011", "このジム写真をWebサイトのヒーロー動画に。", [EMPTY_FACILITY]),
    "facility",
    "image_to_video",
  );
  const ir = pkg.prompt_ir;
  assert(ir !== null, "AT-011 prompt ir exists");
  if (ir === null) throw new Error("unreachable");

  const categories = ir.negative_categories.map(block => block.category);
  assert(categories.includes("temporal"), "AT-011 keeps temporal");
  assert(categories.includes("environment"), "AT-011 keeps environment");
  assert(categories.includes("brand"), "AT-011 keeps brand");
  // 人がいないので身体の注意は付けない。
  assert(!categories.includes("identity"), "AT-011 must not add identity rules to an empty facility");
  assert(!categories.includes("anatomy"), "AT-011 must not add anatomy rules to an empty facility");
  assert(categories.length === 3, `AT-011 exactly three categories, got ${categories.join(",")}`);
}

// --- AT-012 オリジナルキャラクター -----------------------------------------------------------

{
  const pkg = packageFor(
    input("at012", "子ども向け。これをアニメで動かしたい。", [CHARACTER_SHEET]),
    "kids",
    "animation",
  );
  const ir = pkg.prompt_ir;
  assert(ir !== null, "AT-012 prompt ir exists");
  if (ir === null) throw new Error("unreachable");

  const categories = ir.negative_categories.map(block => block.category);
  for (const required of ["character_consistency", "anatomy", "motion", "temporal", "environment", "brand"]) {
    assert(categories.includes(required as never), `AT-012 needs ${required}`);
  }
  // 実在人物の identity ではなく、キャラクターの一貫性を使う。
  assert(!categories.includes("identity"), "AT-012 uses character consistency, not identity");

  const preservation = ir.subject_preservation.join(" ");
  assert(preservation.includes("silhouette"), "AT-012 keeps silhouette");
  assert(preservation.includes("palette"), "AT-012 keeps palette");
  assert(preservation.includes("costume"), "AT-012 keeps costume");
  assert(preservation.includes("proportions"), "AT-012 keeps proportions");

  // 既存作品への寄せは禁止。
  const consistency = ir.negative_categories.find(b => b.category === "character_consistency");
  assert(
    consistency?.rules.some(rule => rule.includes("existing published character")),
    "AT-012 forbids resembling existing characters",
  );
}

// --- AT-013 純粋なブランド映像は CTA なし ------------------------------------------------------

{
  const pkg = packageFor(
    input("at013", "このジム写真をWebサイトのヒーロー動画に。", [EMPTY_FACILITY]),
    "facility",
    "image_to_video",
  );
  const ir = pkg.prompt_ir;
  assert(ir !== null, "AT-013 prompt ir exists");
  if (ir === null) throw new Error("unreachable");

  assert(ir.cta_editing_note === null, "AT-013 pure brand has no CTA note");
  assert(pkg.editing_note === null, "AT-013 package has no editing note");

  const everything = JSON.stringify(pkg);
  for (const word of ["LINE", "体験予約", "来てください"]) {
    assert(!everything.includes(word), `AT-013 must not contain ${word}`);
  }
}

// --- AT-014 体験へつなげる CTA は承認待ちで、余韻の後 ---------------------------------------------

{
  const pkg = packageFor(
    input("at014", "女性向け。このジム写真。Instagram Reel。体験につなげたい。", [CONSENTED_ADULT]),
    "women_beginners",
    "image_to_video",
    "trial",
  );
  const ir = pkg.prompt_ir;
  assert(ir !== null, "AT-014 prompt ir exists");
  if (ir === null) throw new Error("unreachable");

  assert(ir.cta_editing_note !== null, "AT-014 has a CTA editing note");
  assert(ir.cta_editing_note?.includes("余韻"), "AT-014 CTA comes after the emotional ending");
  assert(ir.cta_editing_note?.includes("承認後"), "AT-014 CTA waits for human approval");
  assert(pkg.approval.cta_approval_required, "AT-014 flags CTA approval");

  // 煽らない。
  for (const word of ["今だけ", "限定", "急いで", "残りわずか"]) {
    assert(!JSON.stringify(pkg).includes(word), `AT-014 must not use urgency: ${word}`);
  }
}

// --- AT-015 固有のスタジオ名・作家名を残さない ------------------------------------------------------

{
  // 架空の名前を使う。実在の会社名は試験にも書かない。
  const styled = input("at015", "スタジオノヴァ風のアニメにして。style of Nova Illustrator も参考に。", [
    CHARACTER_SHEET,
  ]);
  const guard = guardStyleNames(styled.raw_text, "fun");
  assert(guard.flagged, "AT-015 flags a direct style dependency");
  assert(guard.removed_reference_count >= 2, `AT-015 counts removals: ${guard.removed_reference_count}`);
  assert(guard.visual_attributes.length > 0, "AT-015 replaces the name with visual attributes");

  // 返り値に名前を持たない。
  const guardText = JSON.stringify(guard);
  for (const name of ["スタジオノヴァ", "Nova"]) {
    assert(!guardText.includes(name), `AT-015 guard must not keep the name: ${name}`);
  }

  const pkg = packageFor(styled, "kids", "animation");
  const packageText = JSON.stringify(pkg);
  for (const name of ["スタジオノヴァ", "Nova", "style of"]) {
    assert(!packageText.includes(name), `AT-015 output must not leak the name: ${name}`);
  }
  assert(isFreeOfStyleNames(pkg.final_prompt ?? ""), "AT-015 final prompt is free of style names");
  // 件数だけが残る。
  assert(
    pkg.warnings.some(w => w.startsWith("style_name_removed:")),
    "AT-015 records how many references were removed",
  );

  // 一般的な様式語は誤検知しない。
  const generic = guardStyleNames("和風の落ち着いた雰囲気で", "trust");
  assert(!generic.flagged, "generic style words are not flagged");
}

// --- AT-016 Provider に依存しない ----------------------------------------------------------------

{
  const pkg = packageFor(
    input("at016", "女性向け。この写真を動かして。", [CONSENTED_ADULT]),
    "women_beginners",
    "image_to_video",
  );
  const ir = pkg.prompt_ir;
  assert(ir !== null, "AT-016 prompt ir exists");
  if (ir === null) throw new Error("unreachable");

  const text = JSON.stringify(ir).toLowerCase();
  for (const banned of [
    "http://",
    "https://",
    "endpoint",
    "api_key",
    "api key",
    "model:",
    "veo",
    "seedance",
    "byteplus",
    "fal.ai",
    "runway",
    "--ar",
    "--seed",
    "request_body",
  ]) {
    assert(!text.includes(banned), `AT-016 IR must not contain provider detail: ${banned}`);
  }

  // 費用は分からない。課金には承認が要る。
  assert(ir.estimated_cost === null, "AT-016 estimated cost stays null");
  assert(ir.paid_generation_approval_required === true, "AT-016 paid generation needs approval");
  // 互換メモは一般的な内容にとどめる。
  assert(pkg.provider_compatibility_notes.length > 0, "AT-016 has generic compatibility notes");
  for (const note of pkg.provider_compatibility_notes) {
    assert(isFreeOfStyleNames(note), "AT-016 notes carry no style names");
  }
}

// --- AT-037 版の記録 ----------------------------------------------------------------------------

{
  const pkg = packageFor(
    input("at037", "女性向け。この写真を動かして。", [CONSENTED_ADULT]),
    "women_beginners",
    "image_to_video",
  );
  const bundle = pkg.version_bundle;

  assert(bundle.router_version === "1.2.0", `AT-037 router version: ${bundle.router_version}`);
  assert(bundle.knowledge_registry_version === "fixture-registry-1.0.0", "AT-037 registry version recorded");
  assert(bundle.constitution_version === "fixture-constitution-1.0.0", "AT-037 constitution version recorded");
  assert(bundle.dictionary_version === "fixture-dictionary-1.0.0", "AT-037 dictionary version recorded");
  assert(bundle.target_knowledge_version === "fixture-target-women-1.0.0", "AT-037 target version recorded");
  assert(bundle.prompt_engine_version === PROMPT_ENGINE_VERSION, "AT-037 prompt engine version recorded");
  assert(bundle.negative_rules_version === NEGATIVE_RULES_VERSION, "AT-037 negative rules version recorded");
  assert(bundle.provider_adapter_id === null, "AT-037 no provider adapter yet");

  // 後から新しい版を作っても、古い記録は変わらない。
  const later = buildVersionBundle({
    knowledge_registry_version: "later-9.9.9",
    constitution_version: "later-9.9.9",
    dictionary_version: "later-9.9.9",
    target_knowledge_version: "later-9.9.9",
    router_version: "9.9.9",
  });
  assert(later.router_version === "9.9.9", "a new bundle has the new version");
  assert(pkg.version_bundle.router_version === "1.2.0", "AT-037 old record is unchanged");
  assert(Object.isFrozen(pkg.version_bundle), "AT-037 version bundle is frozen");
}

// --- AT-046 Phase 3 部分: オーナーへ余計な質問をしない ---------------------------------------------

{
  const pkg = packageFor(
    input("at046p3", "この写真をリールにして。", [CONSENTED_ADULT]),
    "general_beginner",
    "image_to_video",
  );
  assert(!pkg.blocked, "AT-046 standard request produces a package");
  const ir = pkg.prompt_ir;
  assert(ir !== null, "AT-046 prompt ir exists");
  if (ir === null) throw new Error("unreachable");

  // カメラ・光・音・比率はこちらで決めており、質問として返していない。
  assert(ir.camera.length > 0, "camera decided without asking");
  assert(ir.lighting.length > 0, "lighting decided without asking");
  assert(ir.music.length > 0, "music decided without asking");
  assert(ir.negative_categories.length > 0, "negatives decided without asking");
  assert(pkg.assumptions.length > 0, "assumptions are visible instead of questions");
}

// --- 知識が使えないならプロンプトを作らない -------------------------------------------------------------

{
  const creativeInput = input("blocked", "女性向けに動かして。", [CONSENTED_ADULT]);
  const decision = route(creativeInput);
  const blockedKnowledge = queryKnowledge(createManifestRegistry(), {
    required_tags: ["brand:constitution"],
    target: "women_beginners",
    objective: null,
    platform: null,
    content_mode: "image_to_video",
    max_entries: 10,
    token_budget: 5000,
    facts_needed: false,
  });
  assert(blockedKnowledge.blocked, "manifest knowledge is blocked");

  const pkg = renderCreativePackage(creativeInput, decision, blockedKnowledge);
  assert(pkg.blocked, "blocked knowledge blocks the package");
  assert(pkg.prompt_ir === null, "no prompt ir when knowledge is blocked");
  assert(pkg.final_prompt === null, "no final prompt when knowledge is blocked");
  assert(pkg.negative_categories.length === 0, "no negatives when blocked");
  assert(pkg.summary_ja.includes("止めました"), "blocked package explains itself");
}

// --- 出力10点がそろう ---------------------------------------------------------------------------------

{
  const pkg = packageFor(
    input("full", "女性向け。このジム写真。Instagram Reel。体験につなげたい。", [CONSENTED_ADULT]),
    "women_beginners",
    "image_to_video",
    "trial",
  );
  assert(pkg.summary_ja.includes("見せ場"), "1 japanese summary");
  assert(pkg.prompt_ir !== null, "2 prompt ir");
  assert(pkg.negative_categories.length > 0, "3 negative categories");
  assert((pkg.final_prompt?.length ?? 0) > 0, "4 final prompt");
  assert(pkg.provider_compatibility_notes.length > 0, "5 provider notes");
  assert(pkg.editing_note !== null, "6 editing note");
  assert(pkg.assumptions.length > 0, "7 assumptions");
  assert(pkg.knowledge_references.length > 0, "8 knowledge references");
  assert(pkg.version_bundle.prompt_engine_version !== null, "9 version bundle");
  assert(pkg.approval.paid_generation_approval_required === true, "10 approval requirement");

  // 同じ入力からは同じ結果。
  const again = packageFor(
    input("full", "女性向け。このジム写真。Instagram Reel。体験につなげたい。", [CONSENTED_ADULT]),
    "women_beginners",
    "image_to_video",
    "trial",
  );
  assert(JSON.stringify(pkg) === JSON.stringify(again), "package must be deterministic");

  // 凍結されている。
  assert(Object.isFrozen(pkg.prompt_ir), "prompt ir is frozen");
  assert(Object.isFrozen(pkg.prompt_ir?.negative_categories), "negatives are frozen");
  const before = pkg.prompt_ir?.camera;
  try {
    (pkg.prompt_ir as unknown as { camera: string }).camera = "hacked";
  } catch {
    // strict mode では例外。
  }
  assert(pkg.prompt_ir?.camera === before, "prompt ir must be immutable");

  // 事実・秘密・個人情報を持たない。
  const text = JSON.stringify(pkg);
  for (const banned of ["7,700", "8,800", "9,900", "成田市土屋", "@817nsdhr", "@jfl0054o"]) {
    assert(!text.includes(banned), `package must not contain ${banned}`);
  }
}

// --- 分類選択の単体確認 ---------------------------------------------------------------------------------

{
  const still = selectNegativeCategories({
    content_mode: "image_to_video",
    target: "women_beginners",
    has_person_reference: true,
    has_character_reference: false,
    is_empty_facility: false,
    is_still_image: true,
  });
  assert(still.includes("identity") && still.includes("anatomy"), "still image keeps identity and anatomy");
  assert(!still.includes("motion"), "still image drops motion");
  assert(!still.includes("temporal"), "still image drops temporal");

  const combat = selectNegativeCategories({
    content_mode: "text_to_video",
    target: "competition",
    has_person_reference: false,
    has_character_reference: false,
    is_empty_facility: false,
    is_still_image: false,
  });
  assert(!combat.includes("identity"), "combat without reference has no identity rules");
  assert(combat.includes("motion") && combat.includes("anatomy"), "combat keeps motion and anatomy");

  const combatWithReference = selectNegativeCategories({
    content_mode: "image_to_video",
    target: "competition",
    has_person_reference: true,
    has_character_reference: false,
    is_empty_facility: false,
    is_still_image: false,
  });
  assert(combatWithReference.includes("identity"), "combat with a person reference keeps identity");
}

console.log("brand_growth prompts tests passed");
