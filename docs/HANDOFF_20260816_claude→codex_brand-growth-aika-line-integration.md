# HANDOFF: Brand Growth → AIKA/LINE Integration

**From**: Claude Code (Brand Growth Phase 1-3)  
**To**: Codex (AIKA/LINE integration)  
**Date**: 2026-08-16  
**Status**: Ready for handoff

---

## 📋 Current State

### ✅ Completed (Claude)

**Brand Growth Phase 1-3: 100% Complete**
- ✅ Router: User input → Target/Objective classification (women_beginners, trial, 15s)
- ✅ Knowledge Registry: Design Pack verification + SHA-256 hashing
- ✅ Brief Generator: Emotional goal + story + hero moment
- ✅ Prompt IR: Provider-neutral prompt composition
- ✅ Final Prompt: 2164-char natural language prompt

**Test Status**
- ✅ Integration tests: PASS (Knowledge verification + Full pipeline)
- ✅ Router tests: PASS (all 7 input patterns)
- ✅ Knowledge registry: PASS (7 entry types)
- ✅ Director tests: PASS (brief generation)
- ✅ Prompts tests: PASS (IR composition + rendering)
- ✅ Full npm test: 103/103 suites PASS

**Package.json**
- ✅ test:brand-growth script added
- ✅ test:run-tests preserved
- ✅ All existing tests preserved

**Commit**: a7cdbf1 (merge: Brand Growth Phase 1-3 into main)

---

## 🎯 What's Needed: AIKA/LINE Integration

### Current Gap
```
Brand Growth (complete, standalone)
    ↓
❌ NO connection to AIKA/LINE yet
    ↓
src/line_bot/webhook.ts processes:
  - CRM intake
  - Approval dispatch
  - Withdrawal intake
  ❌ BUT NOT Brand Growth routing
```

### What Codex Needs to Add

**1. LINE Webhook Handler** (src/line_bot/webhook.ts)
```typescript
// Pseudocode - actual implementation in Codex's hands

async function executeBrandGrowthRouting(event: ExtractedEvent) {
  // 1. Extract text from LINE message
  const text = event.text;
  
  // 2. Call Brand Growth router
  import { route, queryKnowledge, buildBrief, composePromptIR, renderFinalPrompt } 
    from "../brand_growth/index.js";
  
  const decision = route({
    request_id: `req_${Date.now()}`,
    raw_text: text,
    input_channel: "line",
    assets: [], // Handle media separately if needed
    requested_at: new Date().toISOString(),
  });
  
  // 3. Query knowledge + build brief
  const knowledge = queryKnowledge(...);
  const brief = buildBrief(decision, knowledge, ...);
  const ir = composePromptIR({brief, decision, negatives, style_replacement_attributes});
  const prompt = renderFinalPrompt(ir);
  
  // 4. Return brief + prompt to LINE as draft message
  return {
    target: decision.target_primary,
    objective: decision.objective,
    brief: brief,
    final_prompt: prompt,
  };
}
```

**2. Integration Points**
- `src/line_bot/webhook.ts`: Add Brand Growth routing case
- `src/line_bot/reply.ts`: Format brief + prompt for LINE display
- Error handling for incomplete inputs (missing assets, unclear intent)

**3. Test Case**
Input (LINE): "女性向け。このジム写真。15秒。体験につなげたい。"
Output (LINE): 
```
📋 Creative Brief Generated

Target: Women Beginners
Objective: Trial Booking
Emotion: Safety
Duration: 15 seconds

🎬 Final Prompt:
[2164-char prompt]
```

---

## 📦 Deliverables from Claude

**Code Ready to Use**
```
src/brand_growth/
  ├─ router/route.ts          (entry point: route())
  ├─ knowledge/query.ts       (queryKnowledge())
  ├─ director/build_brief.ts  (buildBrief())
  ├─ prompts/compose.ts       (composePromptIR())
  ├─ prompts/render_preview.ts (renderFinalPrompt())
  └─ index.ts                 (all exports)

src/brand_growth/contracts/
  ├─ creative_input.ts        (CreativeInput type)
  ├─ route_decision.ts        (RouteDecision, EmotionalGoal, etc)
  ├─ creative_brief.ts        (CreativeBrief)
  ├─ knowledge.ts             (KnowledgeRegistry, KnowledgeResult)
  └─ version_bundle.ts        (VersionBundle)
```

**Test Evidence**
```
npm run test:brand-growth → All PASS ✅
npm test → 103/103 PASS ✅

Specific tests for LINE integration:
  - Router accuracy: women_beginners ✅
  - Brief generation: emotion/story/cta ✅
  - Prompt quality: 2164 chars, target demographic included ✅
  - Knowledge verification: 2 active, 5 protected (zero I/O) ✅
```

---

## ⚠️ Constraints & Decisions

### AIKA/LINE Responsibility
- **Codex (AIKA/LINE)** adds the webhookrecipient handler and reply formatting
- **Claude (Brand Growth)** stays pure, no external I/O
- **Separation**: Brand Growth routing ≠ AIKA conversation logic

### What NOT to Change
- ❌ Do NOT modify Brand Growth source code (Phase 1-3 complete)
- ❌ Do NOT change router/knowledge/brief/prompt logic
- ❌ Do NOT add Provider-specific syntax to PromptIR
- ✅ DO call Brand Growth functions as-is

### Knowledge Registry State
- ✅ Design Pack entries are verified (SHA-256)
- ✅ Protected entries (secret/PII/quarantined) marked missing with zero I/O
- ✅ Only active+verified entries sent to queryKnowledge()

---

## 🎬 Next Steps (Codex)

1. **Read** Brand Growth index.ts exports
2. **Integrate** route() call in LINE webhook handler
3. **Format** brief + prompt for LINE text reply
4. **Test** with LINE test bot:
   - Input: "女性向け。このジム写真。15秒。体験につなげたい。"
   - Expected output: women_beginners routing + 2164-char prompt
5. **Report** test results to JIN

---

## 📞 Contact

If questions on Brand Growth logic:
- Read src/brand_growth/index.ts exports
- Check src/brand_growth/integration_pipeline.test.ts for usage example
- All functions are type-safe, pure functions (no side effects)

**Claude is on standby for clarification.**

---

**Status**: ✅ Claude work complete. Awaiting Codex for AIKA/LINE handoff.
