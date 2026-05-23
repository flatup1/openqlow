import assert from "node:assert/strict";
import type { PlatformDraft } from "../types.js";
import { dateForDraftFile } from "./draft_date.js";

const draft: PlatformDraft = {
  id: "draft-1",
  ideaId: "idea-1",
  approvalId: "FG-20260521-001",
  platform: "x",
  publicationLevel: "level_2_draft",
  body: "FLATUP GYM",
  hashtags: [],
  cta: "",
  safetyNotes: [],
  createdAt: "2026-05-20T19:30:00.000Z",
};

assert.equal(dateForDraftFile(draft), "2026-05-21");
assert.equal(dateForDraftFile({ ...draft, approvalId: "manual" }), "2026-05-20");

console.log("draft date tests passed");
