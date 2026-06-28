import type { PlatformDraft } from "../types.js";

const ALLOWED_PHASE_1_LEVELS = new Set(["level_1_idea", "level_2_draft"]);

export function assertPhase1DraftOnly(drafts: PlatformDraft[]): void {
  const blocked = drafts.filter(draft => !ALLOWED_PHASE_1_LEVELS.has(draft.publicationLevel));
  if (blocked.length === 0) return;

  const details = blocked.map(draft => `${draft.id}:${draft.publicationLevel}`).join(", ");
  throw new Error(`Phase 1 physical publish lock blocked non-draft publication levels: ${details}`);
}

// 公開投稿ランタイム(runFinalPublish)は実装済み。実際に投稿するかは承認フローで
// OPENQLOW_ENABLE_PUBLIC_POSTING により明示制御する。
// （以前はランタイム未実装のため、このフラグが立つと fail-closed で停止していた名残）
export function assertNoPublishRuntimeEnabled(): void {
  // no-op: 投稿ランタイムは実装済みのため、ここでは停止しない。
}
