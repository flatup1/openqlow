// Integration Test: Owner Input → Brief → PromptIR → Final Prompt
//
// 責務: "Women audience, this photo, 15 seconds, drive trial booking"
// から完全な Creative Brief と Final Prompt を生成し、
// routing、objective、emotion、story、CTA、duration を検証する。

import {
  route,
  queryKnowledge,
  buildBrief,
  composePromptIR,
  renderFinalPrompt,
  createRegistry,
  buildVersionBundle,
  explainKnowledgeResult,
} from "./index.js";
import type {
  CreativeInput,
  RouteDecision,
  KnowledgeRegistry,
  CreativeBrief,
  PromptIR,
} from "./index.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// ========================================
// Integration Test: Full Pipeline
// ========================================

{
  console.log("🚀 Integration Test 2: Brief & Prompt Generation Pipeline\n");

  // Step 1: Owner Input
  const ownerRequest: CreativeInput = {
    request_id: "req_test_001",
    raw_text: "女性向け。このジム写真。15秒。体験につなげたい。",
    input_channel: "web",
    assets: [
      {
        asset_id: "asset_photo_001",
        uri: "https://example.com/photo.jpg",
        sha256: "abc123def456",
        media_type: "image",
        source_type: "gym_photo",
        contains_person: true,
        contains_minor: false,
        consent_status: "confirmed",
        consent_reference: null,
        retention_class: "session",
      },
    ],
    requested_at: "2026-08-16T00:00:00Z",
  };

  console.log("✅ Step 1: Owner Input");
  console.log(`   Request: "${ownerRequest.raw_text}"`);
  console.log(`   Assets: image (confirmed consent)`);

  // Step 2: Route Decision (Phase 1)
  const decision: RouteDecision = route(ownerRequest);
  console.log("\n✅ Step 2: Route Decision");
  console.log(`   Target: ${decision.target_primary}`);
  console.log(`   Objective: ${decision.objective}`);
  console.log(`   Duration: ${decision.requested_duration_seconds}s`);

  // Verify routing
  assert(decision.target_primary === "women_beginners", "Target routed to women_beginners");
  assert(decision.objective === "trial", "Objective set to trial");
  assert(decision.requested_duration_seconds === 15, "Duration set to 15 seconds");

  // Step 3: Knowledge Registry (synthetic fixture)
  const syntheticRegistry: KnowledgeRegistry = {
    entries: [
      {
        id: "kn_constitution",
        title: "Brand Constitution",
        category: "constitution",
        tags: ["brand:constitution"],
        authority: "owner_canon",
        status: "active",
        source_path: "fixture://constitution",
        source_hash: "fix_const_001",
        version: "2026.1",
        reviewed_at: "2026-08-01T00:00:00Z",
        review_due: null,
        token_cost: 300,
        evidence_confidence: 1,
        contains_secrets: false,
        contains_pii: false,
        location: "local",
        conflicts_with: [],
      },
      {
        id: "kn_women_beginners",
        title: "Women Beginners Target",
        category: "target",
        tags: ["target:women_beginners"],
        authority: "owner_canon",
        status: "active",
        source_path: "fixture://target_women",
        source_hash: "fix_tgt_women_001",
        version: "1",
        reviewed_at: "2026-08-01T00:00:00Z",
        review_due: null,
        token_cost: 100,
        evidence_confidence: 1,
        contains_secrets: false,
        contains_pii: false,
        location: "local",
        conflicts_with: [],
      },
      {
        id: "kn_safety_emotion",
        title: "Safety Emotional Arc",
        category: "dictionary",
        tags: ["emotion:safety"],
        authority: "owner_canon",
        status: "active",
        source_path: "fixture://emotion_safety",
        source_hash: "fix_emo_safety_001",
        version: "1",
        reviewed_at: "2026-08-01T00:00:00Z",
        review_due: null,
        token_cost: 50,
        evidence_confidence: 1,
        contains_secrets: false,
        contains_pii: false,
        location: "local",
        conflicts_with: [],
      },
      {
        id: "kn_trial_cta",
        title: "Trial CTA Policy",
        category: "policy",
        tags: ["cta:trial"],
        authority: "owner_canon",
        status: "active",
        source_path: "fixture://cta_trial",
        source_hash: "fix_cta_trial_001",
        version: "1",
        reviewed_at: "2026-08-01T00:00:00Z",
        review_due: null,
        token_cost: 50,
        evidence_confidence: 1,
        contains_secrets: false,
        contains_pii: false,
        location: "local",
        conflicts_with: [],
      },
    ],
    registry_version: "test-1.0.0",
  };

  console.log("\n✅ Step 3: Knowledge Registry (synthetic)");
  console.log(`   Entries: Constitution, Target, Emotion, CTA all available`);

  // Step 4: Query Knowledge
  const knowledge_query = {
    target: decision.target_primary,
    content_mode: decision.content_mode,
    objective: decision.objective,
    platform: decision.platforms ? decision.platforms[0]?.platform : null,
    facts_needed: false,
    required_tags: ["emotion:safety", "cta:trial"],
    max_entries: 10,
    token_budget: 1000,
  };

  const knowledge_result = queryKnowledge(syntheticRegistry, knowledge_query);
  console.log("\n✅ Step 4: Query Knowledge");
  console.log(`   Selected: ${knowledge_result.selected.length} entries`);
  console.log(`   Withheld: ${knowledge_result.withheld.length} entries`);
  console.log(`   Blocked: ${knowledge_result.blocked}`);

  // Verify knowledge selection
  assert(!knowledge_result.blocked, "Knowledge query not blocked");
  assert(knowledge_result.selected.length > 0, "Knowledge selected for query");
  const hasTarget = knowledge_result.selected.some(k => k.category === "target");
  assert(hasTarget, "Target knowledge selected");

  // Step 5: Build Brief
  const versions = buildVersionBundle({
    knowledge_registry_version: syntheticRegistry.registry_version,
    constitution_version: "test",
    dictionary_version: "test",
    target_knowledge_version: "test",
    router_version: decision.router_version,
  });
  const brief_result = buildBrief(decision, knowledge_result, versions);

  if (brief_result.blocked) {
    console.log(`❌ Brief blocked: ${brief_result.block_reason}`);
    console.log(`   Warnings: ${brief_result.warnings.join(", ")}`);
    assert(false, `Brief generation blocked: ${brief_result.block_reason}`);
  }

  const brief: CreativeBrief = brief_result.brief!;
  console.log("\n✅ Step 5: Build Brief");
  console.log(`   Objective: ${brief.objective}`);
  console.log(`   Target: ${brief.target}`);
  console.log(`   Emotion: ${brief.emotional_goal_one}`);

  // Verify brief structure
  assert(brief.objective === "trial", "Brief objective is trial");
  assert(brief.target === "women_beginners", "Brief target is women_beginners");
  assert(
    brief.emotional_goal_one === "safety" || brief.emotional_goal_one === "confidence",
    "Brief has safety or confidence emotion"
  );

  // Step 6: Compose PromptIR
  const negativeInput = {
    content_mode: decision.content_mode,
    target: decision.target_primary,
    has_person_reference: ownerRequest.assets.some(a => a.contains_person),
    has_character_reference: ownerRequest.assets.some(a => a.media_type === "character_sheet"),
    is_empty_facility: !ownerRequest.assets.some(a => a.contains_person),
    is_still_image: ownerRequest.assets.every(a => a.media_type !== "video"),
  };

  const composeInput = {
    brief,
    decision,
    negatives: negativeInput,
    style_replacement_attributes: [],
  };

  const prompt_ir = composePromptIR(composeInput);

  console.log("\n✅ Step 6: Compose PromptIR");
  console.log(`   Subject preservation: ${prompt_ir.subject_preservation.length > 0 ? "yes" : "no"}`);
  console.log(`   Negative categories: ${prompt_ir.negative_categories.length}`);

  // Verify PromptIR
  assert(prompt_ir.subject_preservation.length > 0, "Subject preservation included");
  assert(prompt_ir.negative_categories.length > 0, "Negative categories composed");
  assert(prompt_ir.cta_editing_note?.includes("体験の空き状況"), "Trial CTA editing note included");

  // Step 7: Render Final Prompt
  const final_prompt = renderFinalPrompt(prompt_ir);

  console.log("\n✅ Step 7: Render Final Prompt");
  console.log(`   Length: ${final_prompt.length} chars`);
  console.log(`   Contains "women" or "beginner": ${
    final_prompt.toLowerCase().includes("women") ||
    final_prompt.toLowerCase().includes("beginner")
      ? "yes"
      : "no"
  }`);
  console.log(`   Contains "trial" or "booking": ${
    final_prompt.toLowerCase().includes("trial") ||
    final_prompt.toLowerCase().includes("booking")
      ? "yes"
      : "no"
  }`);
  console.log(`   Contains "15" or "second": ${
    final_prompt.includes("15") || final_prompt.toLowerCase().includes("second")
      ? "yes"
      : "no"
  }`);

  // Verify final prompt quality
  assert(final_prompt.length > 100, "Prompt has content");
  assert(
    final_prompt.toLowerCase().includes("women") ||
      final_prompt.toLowerCase().includes("beginner"),
    "Prompt includes target demographic"
  );
  assert(final_prompt.includes("Objective: trial."), "Prompt includes the trial objective");
  assert(final_prompt.includes("CTA / editing note:"), "Prompt includes a separate CTA editing note");
  assert(final_prompt.includes("体験の空き状況"), "Prompt includes the non-urgent trial CTA draft");
  assert(final_prompt.includes("after human approval"), "Prompt preserves the human approval gate");
  assert(final_prompt.includes("Human context:"), "Prompt includes the audience's human context");
  assert(final_prompt.includes(`Key moment: ${prompt_ir.hero_moment}.`), "Prompt includes one hero moment");
  assert(final_prompt.includes("Sound:") && final_prompt.includes("Music:"), "Prompt includes sound and music");
  assert(final_prompt.includes("Avoid ->"), "Prompt includes selected failure-prevention rules");
  assert(final_prompt.includes("Duration: 15 seconds."), "Prompt includes the requested duration");

  console.log("\n" + "=".repeat(60));
  console.log("✅ Integration Test 2: PASSED");
  console.log("=".repeat(60));
  console.log("\nPipeline Summary:");
  console.log("  ✅ Owner Input → Route Decision");
  console.log("  ✅ Route Decision → Knowledge Query");
  console.log("  ✅ Knowledge Query → Brief");
  console.log("  ✅ Brief → PromptIR");
  console.log("  ✅ PromptIR → Final Prompt");
}

console.log("\nintegration_pipeline tests passed");
