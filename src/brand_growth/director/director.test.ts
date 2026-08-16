// Brand Growth Phase 3 受入試験: Director。
//
// 思考の順番（人の状況 → 感情ひとつ → 物語 → 見せ場ひとつ → 画）が守られているか、
// 子ども系の二層が必ずあるか、知識が使えないときに作らないかを見る。
//
// 外部アクセスなし。実データなし。

import { FIXTURE_REGISTRY } from "../fixtures/knowledge_fixtures.js";
import {
  AT001_WOMEN_REEL,
  AT002_KIDS_ANIME,
  AT004_PARENT_AND_CHILD,
  AT006_WEBSITE_HERO,
  AT025_MINOR_CONSENT,
} from "../fixtures/acceptance_inputs.js";
import { createManifestRegistry } from "../knowledge/manifest.js";
import { queryKnowledge } from "../knowledge/query.js";
import type { KnowledgeQuery } from "../contracts/knowledge.js";
import { route } from "../router/route.js";
import { buildBrief, DIRECTOR_VERSION } from "./build_brief.js";
import { arcFor } from "./emotional_arc.js";
import { heroMomentFor } from "./hero_moment.js";
import { childSurfaceIsClean, requiresTwoLayer, twoLayerFor } from "./two_layer.js";
import { buildVersionBundle } from "../prompts/prompt_ir.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const BUNDLE = buildVersionBundle({
  knowledge_registry_version: "fixture-registry-1.0.0",
  constitution_version: "fixture-constitution-1.0.0",
  dictionary_version: "fixture-dictionary-1.0.0",
  target_knowledge_version: "fixture-target-women-1.0.0",
  router_version: "1.2.0",
});

function knowledgeFor(target: string, mode: string, overrides: Partial<KnowledgeQuery> = {}) {
  const query: KnowledgeQuery = {
    required_tags: ["brand:constitution"],
    target,
    objective: null,
    platform: null,
    content_mode: mode,
    max_entries: 10,
    token_budget: 5000,
    facts_needed: false,
    ...overrides,
  };
  return queryKnowledge(FIXTURE_REGISTRY, query);
}

// --- 思考の順番が守られている ---------------------------------------------------------

{
  const decision = route(AT001_WOMEN_REEL);
  const knowledge = knowledgeFor("women_beginners", "image_to_video");
  const result = buildBrief(decision, knowledge, BUNDLE);

  assert(!result.blocked, `brief should be built: ${result.block_reason}`);
  const brief = result.brief;
  assert(brief !== null, "brief exists");
  if (brief === null) throw new Error("unreachable");

  // 人の状況が先にある。
  assert(brief.person_context.fear.length > 0, "fear is described");
  assert(brief.person_context.frustration.length > 0, "frustration is described");
  assert(brief.person_context.desire.length > 0, "desire is described");
  assert(brief.person_context.barrier.length > 0, "barrier is described");

  // 感情はちょうど1つで、Router の判断と一致する。
  assert(brief.emotional_goal_one === decision.emotional_goal, "emotional goal comes from the route");
  assert(typeof brief.emotional_goal_one === "string", "exactly one emotional goal");

  // 物語 → 見せ場ひとつ。
  assert(brief.story_beats.length >= 3, `story beats: ${brief.story_beats.length}`);
  assert(brief.story_beats[0]?.order === 1, "beats are ordered");
  assert(brief.hero_moment.moment.length > 0, "one hero moment");
  assert(brief.hero_moment.readable_without_explanation, "hero moment needs no explanation");

  // 画は最後。1本の主要動作はひとつ。
  assert(brief.shot_plan.primary_action.length > 0, "one primary action");
  assert(brief.visual_mode === decision.content_mode, "visual mode follows the route");

  // FLATUP は主人公ではない。
  assert(
    ["safe_place", "companions", "guide", "stage_for_challenge"].includes(brief.story_role_of_flatup),
    `flatup plays a supporting role: ${brief.story_role_of_flatup}`,
  );

  // 女性初心者の土台: safety と 緊張→一歩→初ミット→笑顔。
  assert(brief.emotional_goal_one === "safety", `women beginners goal: ${brief.emotional_goal_one}`);
  assert(brief.emotional_arc.join("→").includes("笑顔"), "arc ends in a positive beat");

  // 使った知識の id が残る。中身は持たない。
  assert(brief.knowledge_references.includes("kn_fx_constitution"), "constitution is referenced");
  assert(!JSON.stringify(brief).includes("fixture://kn_fx_constitution\","), "brief does not embed content");
}

// --- 子ども系は二層が必須 ---------------------------------------------------------------

{
  const decision = route(AT002_KIDS_ANIME);
  const knowledge = knowledgeFor("kids", "animation");
  const result = buildBrief(decision, knowledge, BUNDLE);
  const brief = result.brief;
  assert(brief !== null, "kids brief exists");
  if (brief === null) throw new Error("unreachable");

  assert(brief.two_layer !== null, "kids content must have two layers");
  assert((brief.two_layer?.child_surface.length ?? 0) > 0, "child surface exists");
  assert((brief.two_layer?.parent_deep_layer.length ?? 0) > 0, "parent layer exists");
  assert(brief.emotional_goal_one === "fun", `kids surface emotion: ${brief.emotional_goal_one}`);

  // 親向けの言葉を子どもの層へ詰め込まない。
  assert(childSurfaceIsClean(brief.two_layer!), "parent wording must not leak into the child layer");
  for (const word of ["保護者", "月謝", "入会"]) {
    assert(!brief.two_layer!.child_surface.includes(word), `child layer must not contain ${word}`);
  }
}

{
  const decision = route(AT004_PARENT_AND_CHILD);
  const knowledge = knowledgeFor("kids_parents", "image_to_video");
  const brief = buildBrief(decision, knowledge, BUNDLE).brief;
  assert(brief !== null, "kids_parents brief exists");
  if (brief === null) throw new Error("unreachable");

  assert(brief.two_layer !== null, "kids_parents also needs two layers");
  // 見せ場は親子で共有する動作。
  assert(
    brief.hero_moment.moment.includes("ハイタッチ") || brief.hero_moment.moment.includes("グローブ"),
    `shared action hero moment: ${brief.hero_moment.moment}`,
  );
}

{
  // 二層が要らない Target には付けない。
  assert(!requiresTwoLayer("women_beginners"), "adults do not need two layers");
  assert(twoLayerFor("women_beginners") === null, "no two layer for adults");
  assert(requiresTwoLayer("kids"), "kids need two layers");
}

// --- 施設は人物なしでも成立する -----------------------------------------------------------

{
  const decision = route(AT006_WEBSITE_HERO);
  const knowledge = knowledgeFor("facility", "image_to_video");
  const brief = buildBrief(decision, knowledge, BUNDLE).brief;
  assert(brief !== null, "facility brief exists");
  if (brief === null) throw new Error("unreachable");

  assert(brief.target === "facility", `facility target: ${brief.target}`);
  assert(brief.two_layer === null, "facility has no child layer");
  assert(brief.hero_moment.moment.length > 0, "facility still has one hero moment");
}

// --- 知識が使えないなら作らない -----------------------------------------------------------

{
  // 宣言だけの台帳は実体未確認なので blocked になる。
  const manifestKnowledge = queryKnowledge(createManifestRegistry(), {
    required_tags: ["brand:constitution"],
    target: "women_beginners",
    objective: "trial",
    platform: null,
    content_mode: "image_to_video",
    max_entries: 10,
    token_budget: 5000,
    facts_needed: false,
  });
  assert(manifestKnowledge.blocked, "manifest knowledge is blocked");

  const decision = route(AT001_WOMEN_REEL);
  const result = buildBrief(decision, manifestKnowledge, BUNDLE);
  assert(result.blocked, "blocked knowledge must block the brief");
  assert(result.brief === null, "no brief is created without knowledge");
  assert(result.block_reason?.startsWith("knowledge_blocked:"), `block reason: ${result.block_reason}`);
}

{
  // 人間の確認が必要なら作らない（未成年の同意が未確認）。
  const decision = route(AT025_MINOR_CONSENT);
  assert(decision.clarification_required, "minor consent requires confirmation");
  const knowledge = knowledgeFor("kids", "image_to_video");
  const result = buildBrief(decision, knowledge, BUNDLE);
  assert(result.blocked, "clarification required must block the brief");
  assert(result.brief === null, "no brief while confirmation is pending");
  assert(result.block_reason?.startsWith("clarification_required:"), `block reason: ${result.block_reason}`);
}

// --- 決定性と凍結 -----------------------------------------------------------------------------

{
  const decision = route(AT001_WOMEN_REEL);
  const knowledge = knowledgeFor("women_beginners", "image_to_video");
  const a = buildBrief(decision, knowledge, BUNDLE);
  const b = buildBrief(decision, knowledge, BUNDLE);
  assert(JSON.stringify(a) === JSON.stringify(b), "director must be deterministic");

  assert(Object.isFrozen(a), "brief result is frozen");
  assert(Object.isFrozen(a.brief), "brief is frozen");
  const before = a.brief?.emotional_goal_one;
  try {
    (a.brief as unknown as { emotional_goal_one: string }).emotional_goal_one = "aspiration";
  } catch {
    // strict mode では例外。
  }
  assert(a.brief?.emotional_goal_one === before, "brief must be immutable");
}

// --- 土台の表が全 Target を網羅している -------------------------------------------------------

{
  for (const target of [
    "kids",
    "kids_parents",
    "women_beginners",
    "women_30_40",
    "men_beginners",
    "inactive_men",
    "senior",
    "parents",
    "family",
    "sparring_fans",
    "competition",
    "event",
    "facility",
    "instructor",
    "member_story",
    "general_beginner",
  ] as const) {
    const baseline = arcFor(target);
    assert(baseline.arc.length >= 3, `${target} needs an arc`);
    assert(baseline.person_context.fear.length > 0, `${target} needs a person context`);
    const hero = heroMomentFor(target);
    assert(hero.moment.length > 0, `${target} needs a hero moment`);
    assert(hero.readable_without_explanation, `${target} hero moment must be readable`);
  }
  assert(DIRECTOR_VERSION === "3.0.0", "director version is recorded");
}

console.log("brand_growth director tests passed");
