import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import type { PlatformDraft } from "../types.js";
import { slugify } from "../utils/slug.js";
import { dateForDraftFile } from "../utils/draft_date.js";

export async function saveXDraftOnly(root: string, draft: PlatformDraft): Promise<string> {
  const dir = path.join(root, "drafts", "x");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${dateForDraftFile(draft)}-${slugify(draft.id)}.md`);
  const text = [
    `# X Draft`,
    "",
    `- id: ${draft.id}`,
    `- platform: x`,
    `- typefully_mode: draft_only`,
    "",
    draft.body,
    "",
    draft.hashtags.map(tag => `#${tag}`).join(" "),
    "",
    draft.cta ? `CTA: ${draft.cta}` : "",
    `approval_id: ${draft.approvalId}`,
    `publication_level: ${draft.publicationLevel}`,
  ].filter(Boolean).join("\n");
  await writeFile(file, `${text}\n`, "utf8");
  await appendFile(path.join(dir, "index.jsonl"), `${JSON.stringify({ id: draft.id, file, createdAt: draft.createdAt, mode: "draft_only" })}\n`, "utf8");
  return file;
}
