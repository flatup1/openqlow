import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DraftRecord } from "../types.js";

export async function saveRecord(root: string, record: DraftRecord): Promise<string> {
  const dir = path.join(root, "state");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${record.id}.json`);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return file;
}

export async function loadRecord(root: string, id: string): Promise<DraftRecord | undefined> {
  const file = path.join(root, "state", `${id}.json`);
  const text = await readFile(file, "utf8").catch(() => "");
  if (!text) return undefined;
  return JSON.parse(text) as DraftRecord;
}
