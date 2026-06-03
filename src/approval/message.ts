import type { ContentIdea, PlatformDraft, SafetyResult } from "../types.js";

function formatPublicationLevel(level: PlatformDraft["publicationLevel"]): string {
  if (level === "level_1_idea") return "Level 1: idea only";
  if (level === "level_2_draft") return "Level 2: draft package";
  if (level === "level_3_scheduled") return "Level 3: staged/scheduled";
  return "Level 4: explicit-approved public posting";
}

function formatCanonReferences(idea: ContentIdea): string {
  const references = idea.canonReferences ?? [];
  if (references.length === 0) return "正本参照: 未設定";
  return [
    "正本参照:",
    ...references.map(ref => `- ${ref.layer}: ${ref.canonPath} (${ref.description})`),
  ].join("\n");
}

export function formatApprovalMessage(
  idea: ContentIdea,
  drafts: PlatformDraft[],
  safety: SafetyResult
): string {
  const approvalId = drafts[0]?.approvalId ?? idea.id;
  const platforms = drafts.map(draft => draft.platform).join(" / ");
  const publicationLevel = drafts[0]?.publicationLevel ?? "level_2_draft";
  const safetyText = safety.ok
    ? "安全チェック: OK"
    : [
        "安全チェック: 要確認",
        ...safety.issues.map(issue => `- [${issue.severity}] ${issue.code}: ${issue.message}`),
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
    "投稿候補です。",
    `投稿ID: ${approvalId}`,
    `目的: ${idea.valueConnection}`,
    formatCanonReferences(idea),
    `媒体: ${platforms}`,
    `公開レベル: ${formatPublicationLevel(publicationLevel)}`,
    `内容: ${idea.theme} - ${idea.angle}`,
    `優しさスコア: ${safety.kindnessScore.total}/25 (${safety.kindnessScore.decision})`,
    `ひっかかる点: ${safety.issues.length ? safety.issues.map(issue => issue.message).join(" / ") : "なし"}`,
    "",
    safetyText,
    "",
    draftText,
    "",
    "これ投稿する？",
    "かんたん投稿準備: ok",
    `下書き保存だけ: OK ${approvalId}`,
    `投稿準備まで: OK ${approvalId} all`,
    `Threadsのみ: OK ${approvalId} threads`,
    `Googleビジネスプロフィールのみ: OK ${approvalId} google`,
    `LINE VOOMのみ: OK ${approvalId} voom`,
    `修正する場合: 修正 ${approvalId}: 直したい内容`,
    `やめる場合: NO ${approvalId}`,
  ].join("\n");
}
