// 承認レコードのファイル永続化
//
// DraftRecord を ${root}/state/${id}.json として1件1ファイルで保存・読込する。
// 保存レイアウトは src/approval/shortcut.ts の loadRecord / loadStateRecords が
// 期待する形（state ディレクトリ配下の `${id}.json`）に合わせている。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DraftRecord } from "../types.js";

function stateDir(root: string): string {
  return path.join(root, "state");
}

function recordPath(root: string, id: string): string {
  return path.join(stateDir(root), `${id}.json`);
}

/**
 * DraftRecord を ${root}/state/${record.id}.json に保存する。
 * 同じ id を渡せば上書き更新になる（承認・修正・却下で状態を進める用途）。
 * 保存したファイルの絶対パスを返す。
 */
export async function saveRecord(root: string, record: DraftRecord): Promise<string> {
  const dir = stateDir(root);
  await mkdir(dir, { recursive: true });
  const file = recordPath(root, record.id);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return file;
}

/**
 * ${root}/state/${id}.json を読み込んで DraftRecord を返す。
 * ファイルが無い・空・壊れている場合は undefined（呼び出し側は fail closed）。
 */
export async function loadRecord(root: string, id: string): Promise<DraftRecord | undefined> {
  const text = await readFile(recordPath(root, id), "utf8").catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as DraftRecord;
  } catch {
    return undefined;
  }
}
