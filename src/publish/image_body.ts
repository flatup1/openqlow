import { generateRefinedPostBody } from "../llm/generate.js";
import { checkDraftSafety } from "../safety/check.js";
import { loadRecord, saveRecord } from "../state/file_store.js";
import { formatDateInTimeZone } from "../utils/date.js";

export type ImageBodyResult =
  | { kind: "updated"; body: string }
  | { kind: "kept"; reason: string };

/**
 * 選んだ写真を見て、Threads本文を作り直す（写真の内容に合わせる）。
 * 失敗・安全チェックNGのときは今の本文をそのまま使う（変な本文を出さない）。
 */
export async function rewriteBodyForImage(
  root: string,
  id: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch,
): Promise<ImageBodyResult> {
  const record = await loadRecord(root, id);
  const imagePath = record?.mediaFiles?.[0];
  if (!record || !imagePath) return { kind: "kept", reason: "写真なし" };

  const generated = await generateRefinedPostBody({
    dateJst: formatDateInTimeZone(new Date(), "Asia/Tokyo"),
    imagePath,
    env,
    fetchImpl,
  });
  if (!generated.ok) return { kind: "kept", reason: `写真に合わせた作り直しに失敗: ${generated.reason}` };

  const safety = checkDraftSafety(generated.body);
  if (!safety.ok) return { kind: "kept", reason: "作り直した本文が安全チェックに引っかかったため、元の本文を使いました" };

  const drafts = record.drafts.map((draft) =>
    draft.platform === "threads" ? { ...draft, body: generated.body } : draft,
  );
  await saveRecord(root, { ...record, drafts, updatedAt: new Date().toISOString() });
  return { kind: "updated", body: generated.body };
}
