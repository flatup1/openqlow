import type { PlatformDraft } from "../types.js";

export function dateForDraftFile(draft: PlatformDraft): string {
  const fromApproval = draft.approvalId.match(/^FG-(\d{4})(\d{2})(\d{2})-/);
  if (fromApproval) return `${fromApproval[1]}-${fromApproval[2]}-${fromApproval[3]}`;

  return draft.createdAt.slice(0, 10);
}
