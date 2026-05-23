import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import type { PlatformDraft } from "../types.js";
import { slugify } from "../utils/slug.js";
import { dateForDraftFile } from "../utils/draft_date.js";

export async function saveThreadsDraft(root: string, draft: PlatformDraft): Promise<string> {
  const dir = path.join(root, "drafts", "threads");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${dateForDraftFile(draft)}-${slugify(draft.id)}.md`);
  const body = [
    `# Threads Draft`,
    "",
    `- id: ${draft.id}`,
    `- approval_id: ${draft.approvalId}`,
    `- platform: threads`,
    `- publication_level: ${draft.publicationLevel}`,
    draft.cta ? `- cta: ${draft.cta}` : "",
    "",
    draft.body,
    "",
    draft.hashtags.map(tag => `#${tag}`).join(" "),
  ].filter(Boolean).join("\n");
  await writeFile(file, `${body}\n`, "utf8");
  await appendFile(path.join(dir, "index.jsonl"), `${JSON.stringify({ id: draft.id, file, createdAt: draft.createdAt })}\n`, "utf8");
  return file;
}
