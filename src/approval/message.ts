import type { ContentIdea, PlatformDraft, SafetyResult } from "../types.js";

export function formatApprovalMessage(
  idea: ContentIdea,
  drafts: PlatformDraft[],
  safety: SafetyResult
): string {
  const approvalId = drafts[0]?.approvalId ?? idea.id;
  const platforms = drafts.map(draft => draft.platform).join(" / ");
  const safetyText = safety.ok
    ? "✓ チェック済み。安心して投稿できます😊"
    : [
        "⚠ 確認してください（投稿・確定はしていません）:",
        ...safety.issues.map(issue => `- ${issue.message}`),
      ].join("\n");

  const draftText = drafts
    .map(draft => [
      `--- ${draft.platform.toUpperCase()} ---`,
      draft.title ? `Title: ${draft.title}` : "",
      draft.body,
      draft.hashtags.length ? `#${draft.hashtags.join(" #")}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");

  return [
    "🌱 投稿候補ができました",
    `ID: ${approvalId} ／ 媒体: ${platforms}`,
    "",
    draftText,
    "",
    "────────",
    safetyText,
    "",
    "そのまま投稿準備するなら → OK",
    "直すなら → 修正 新しい本文",
    "やめるなら → NO",
    "",
    `（細かく指定: OK ${approvalId} all / threads / google / voom ／ 下書きだけ: OK ${approvalId}）`,
  ].join("\n");
}
