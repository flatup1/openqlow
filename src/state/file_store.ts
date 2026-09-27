import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DraftRecord } from "../types.js";

export async function saveRecord(root: string, record: DraftRecord): Promise<string> {
  const dir = path.join(root, "state");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${record.id}.json`);
  // いったん隣へ書いてから置き換える。writeFile は途中で止まると書きかけの
  // ファイルを残すので、そのあと読むと JSON として壊れている（実際に
  // 「修正 FG-…」が SyntaxError で落ちることを確認済み）。
  // 一時ファイル名は毎回変える（同時に書いたとき互いの一時ファイルを奪い合わない）。
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(temporary, file);
  return file;
}

/**
 * 下書きを読んだ結果。「無い」と「読めなかった」を区別する。
 *
 * 同じ扱いにすると、読めなかっただけの下書きに対して
 * 「該当がありません」と答えてしまい、JINはIDを間違えたと思ってしまう。
 */
export type RecordReadResult =
  | { status: "ok"; record: DraftRecord }
  | { status: "missing" }
  | { status: "unreadable"; reason: string };

export async function readRecord(root: string, id: string): Promise<RecordReadResult> {
  const file = path.join(root, "state", `${id}.json`);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { status: "missing" };
    return { status: "unreadable", reason: code ?? String(error) };
  }
  try {
    return { status: "ok", record: JSON.parse(text) as DraftRecord };
  } catch {
    // 中身が壊れている。呼び出し側へ例外を投げると、LINEのコマンドが
    // 何も返さずに落ちる（JINには理由が分からない）。
    return { status: "unreadable", reason: "JSONとして読めない" };
  }
}

export async function loadRecord(root: string, id: string): Promise<DraftRecord | undefined> {
  const result = await readRecord(root, id);
  return result.status === "ok" ? result.record : undefined;
}
