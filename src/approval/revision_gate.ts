import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 「修正」だけ送られて、次に直す指示を待っている状態を1件だけ覚えるゲート。
 *
 * 狙い（実ログの最大の不具合の解消）:
 *   修正 → ボット「何をどう直しますか？」→ ユーザーが指示を別メッセージで送る
 *   …が今は拾われず日報フォールバックに落ちていた。
 * 「修正待ち」を立て、直後の一言を修正指示として拾えるようにする。
 * 古い状態を誤って拾わないよう、有効期限（既定15分）を持つ。
 */

interface AwaitingRevision {
  id: string;
  at: string;
}

const FRESH_MS = 15 * 60 * 1000;

function markerPath(root: string): string {
  return path.join(root, "state", "awaiting_revision.json");
}

export async function setAwaitingRevision(root: string, id: string, now = new Date()): Promise<void> {
  const dir = path.join(root, "state");
  await mkdir(dir, { recursive: true });
  const marker: AwaitingRevision = { id, at: now.toISOString() };
  await writeFile(markerPath(root), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
}

export async function loadAwaitingRevision(root: string, now = new Date()): Promise<AwaitingRevision | undefined> {
  const text = await readFile(markerPath(root), "utf8").catch(() => "");
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as AwaitingRevision;
    if (!parsed.id) return undefined;
    // 古すぎる「修正待ち」は無視（日報等を誤って指示扱いしない）。
    if (now.getTime() - Date.parse(parsed.at) > FRESH_MS) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function clearAwaitingRevision(root: string): Promise<void> {
  await rm(markerPath(root), { force: true }).catch(() => undefined);
}

/**
 * 「修正待ち」のとき、その一言を修正指示として拾ってよいか。
 * 他のコマンド（投稿/日報/画像/メモ/ok/no/スラッシュ等）は拾わない。
 */
export function looksLikeRevisionInstruction(text: string): boolean {
  const t = text.normalize("NFKC").trim();
  if (!t) return false;
  if (t.startsWith("/")) return false;
  const reserved = ["投稿", "日報", "おはよう", "画像", "挿入", "メモ", "中止", "保存", "終わ", "ok", "no", "やめる", "キャンセル", "修正"];
  const lower = t.toLowerCase();
  if (reserved.some(word => lower === word.toLowerCase() || t.startsWith(word))) return false;
  return true;
}
