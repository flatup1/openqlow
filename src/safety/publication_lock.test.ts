import assert from "node:assert/strict";
import type { PlatformDraft } from "../types.js";
import { assertNoPublishRuntimeEnabled, assertPhase1DraftOnly } from "./publication_lock.js";

function draft(publicationLevel: PlatformDraft["publicationLevel"]): PlatformDraft {
  return {
    id: `draft-${publicationLevel}`,
    ideaId: "idea-1",
    approvalId: "FG-20260520-001",
    platform: "x",
    publicationLevel,
    body: "FLATUP GYMは世界一やさしい格闘技ジムです。",
    hashtags: ["FLATUPGYM"],
    cta: "",
    safetyNotes: [],
    createdAt: "2026-05-20T00:00:00.000Z",
  };
}

assert.doesNotThrow(() => assertPhase1DraftOnly([draft("level_1_idea"), draft("level_2_draft")]));
assert.throws(
  () => assertPhase1DraftOnly([draft("level_3_scheduled")]),
  /physical publish lock blocked/
);
assert.throws(
  () => assertPhase1DraftOnly([draft("level_4_publish")]),
  /physical publish lock blocked/
);

// 投稿ランタイム(runFinalPublish)が実装されたため、フラグが立っていても停止しない。
const previous = process.env.OPENQLOW_ENABLE_PUBLIC_POSTING;
process.env.OPENQLOW_ENABLE_PUBLIC_POSTING = "true";
assert.doesNotThrow(() => assertNoPublishRuntimeEnabled());

if (previous === undefined) {
  delete process.env.OPENQLOW_ENABLE_PUBLIC_POSTING;
} else {
  process.env.OPENQLOW_ENABLE_PUBLIC_POSTING = previous;
}
assert.doesNotThrow(() => assertNoPublishRuntimeEnabled());

console.log("publication lock tests passed");
