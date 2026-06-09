import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DraftRecord } from "../types.js";

// NOTE: これは暫定の再構築版です（git に本物が未コミットだったため Claude が
// 既存の使われ方から最小再構築）。Mac/VPS の本物が git に上がったら差し替えてください。
// 仕様：record は <root>/state/<id>.json に1ファイル1レコードで保存する。

function recordPath(root: string, id: string): string {
  return path.join(root, "state", `${id}.json`);
}

export async function saveRecord(root: string, record: DraftRecord): Promise<void> {
  const dir = path.join(root, "state");
  await mkdir(dir, { recursive: true });
  await writeFile(recordPath(root, record.id), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function loadRecord(root: string, id: string): Promise<DraftRecord | undefined> {
  const text = await readFile(recordPath(root, id), "utf8").catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as DraftRecord;
  } catch {
    // 壊れた state ファイルは「無い」扱い（承認系は fail closed）。
    return undefined;
  }
}
