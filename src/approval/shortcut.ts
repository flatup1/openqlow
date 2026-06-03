import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DraftRecord } from "../types.js";

interface LastApprovalCandidate {
  id: string;
  recordedAt: string;
}

function isOkOnly(text: string): boolean {
  return text.normalize("NFKC").trim().toLowerCase() === "ok";
}

async function loadStateRecords(root: string): Promise<DraftRecord[]> {
  const dir = path.join(root, "state");
  const files = await readdir(dir).catch(() => []);
  const records: DraftRecord[] = [];

  for (const file of files) {
    if (!/^FG-\d{8}-\d{3}\.json$/.test(file)) continue;
    const text = await readFile(path.join(dir, file), "utf8").catch(() => "");
    if (!text) continue;
    try {
      records.push(JSON.parse(text) as DraftRecord);
    } catch {
      // Ignore malformed state files; approval shortcuts must fail closed.
    }
  }

  return records;
}

async function loadRecord(root: string, id: string): Promise<DraftRecord | undefined> {
  const text = await readFile(path.join(root, "state", `${id}.json`), "utf8").catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as DraftRecord;
  } catch {
    return undefined;
  }
}

async function loadLastApprovalCandidate(root: string): Promise<LastApprovalCandidate | undefined> {
  const text = await readFile(path.join(root, "state", "last_approval_candidate.json"), "utf8").catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as LastApprovalCandidate;
  } catch {
    return undefined;
  }
}

export async function rememberApprovalCandidate(root: string, id: string, now = new Date()): Promise<void> {
  const dir = path.join(root, "state");
  await mkdir(dir, { recursive: true });
  const marker: LastApprovalCandidate = {
    id,
    recordedAt: now.toISOString(),
  };
  await writeFile(path.join(dir, "last_approval_candidate.json"), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
}

export async function expandApprovalShortcut(text: string, root: string): Promise<string | undefined> {
  if (!isOkOnly(text)) return undefined;

  const last = await loadLastApprovalCandidate(root);
  if (last) {
    const lastRecord = await loadRecord(root, last.id);
    if (lastRecord?.status === "pending_approval") {
      return `OK ${lastRecord.id} all`;
    }
  }

  const latest = (await loadStateRecords(root))
    .filter((record) => record.status === "pending_approval")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  if (!latest) return undefined;
  return `OK ${latest.id} all`;
}
