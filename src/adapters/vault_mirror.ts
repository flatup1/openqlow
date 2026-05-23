import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { slugify } from "../utils/slug.js";
import type { PlatformDraft } from "../types.js";
import { dateForDraftFile } from "../utils/draft_date.js";

function vaultDraftDir(platform: "x" | "instagram" | "threads"): string {
  const config = loadConfig();
  return path.join(config.obsidianVaultRoot, "6_システム", "openqlow_drafts", platform);
}

function renderDraft(draft: PlatformDraft): string {
  const lines = [
    `# ${draft.title ?? `${draft.platform.toUpperCase()} Draft`}`,
    "",
    `- approval_id: ${draft.approvalId}`,
    `- draft_id: ${draft.id}`,
    `- idea_id: ${draft.ideaId}`,
    `- platform: ${draft.platform}`,
    `- publication_level: ${draft.publicationLevel}`,
    `- created_at: ${draft.createdAt}`,
    "",
    "## 本文",
    "",
    draft.body,
    "",
  ];
  if (draft.hashtags.length) {
    lines.push("## ハッシュタグ");
    lines.push("");
    lines.push(draft.hashtags.map(t => `#${t}`).join(" "));
    lines.push("");
  }
  if (draft.cta) {
    lines.push("## CTA");
    lines.push("");
    lines.push(draft.cta);
    lines.push("");
  }
  if (draft.safetyNotes.length) {
    lines.push("## 安全メモ");
    lines.push("");
    for (const note of draft.safetyNotes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export async function mirrorDraftToVault(draft: PlatformDraft): Promise<string> {
  if (draft.platform !== "x" && draft.platform !== "instagram" && draft.platform !== "threads") {
    return "";
  }
  const dir = vaultDraftDir(draft.platform);
  await mkdir(dir, { recursive: true });
  const slug = slugify(draft.title || draft.id);
  const file = path.join(dir, `${dateForDraftFile(draft)}-${slug}.md`);
  await writeFile(file, renderDraft(draft), "utf8");
  await appendFile(
    path.join(dir, "index.jsonl"),
    `${JSON.stringify({ approvalId: draft.approvalId, draftId: draft.id, platform: draft.platform, file, createdAt: draft.createdAt })}\n`,
    "utf8",
  );
  return file;
}
