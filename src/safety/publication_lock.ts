import type { PlatformDraft } from "../types.js";

const ALLOWED_PHASE_1_LEVELS = new Set(["level_1_idea", "level_2_draft"]);

export function assertPhase1DraftOnly(drafts: PlatformDraft[]): void {
  const blocked = drafts.filter(draft => !ALLOWED_PHASE_1_LEVELS.has(draft.publicationLevel));
  if (blocked.length === 0) return;

  const details = blocked.map(draft => `${draft.id}:${draft.publicationLevel}`).join(", ");
  throw new Error(`Phase 1 physical publish lock blocked non-draft publication levels: ${details}`);
}

export function assertNoPublishRuntimeEnabled(): void {
  const requestedPublish = process.env.OPENQLOW_ENABLE_PUBLIC_POSTING === "true";
  if (!requestedPublish) return;

  throw new Error("OPENQLOW Phase 1 physical lock: public posting runtime is not implemented.");
}
