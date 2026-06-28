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

function isRejectOnly(text: string): boolean {
  const normalized = text.normalize("NFKC").trim().toLowerCase();
  return ["no", "n", "やめる", "キャンセル", "x", "×", "✕"].includes(normalized);
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
    // 直近に提示した候補は既に承認/却下済み。ここで古い別の保留下書きを
    // 勝手に承認しない（「ok」二度押しで意図しない過去の下書きが通るのを防ぐ）。
    return undefined;
  }

  // marker が一度も無い時だけ、最新の保留下書きにフォールバックする。
  const latest = (await loadStateRecords(root))
    .filter((record) => record.status === "pending_approval")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  if (!latest) return undefined;
  return `OK ${latest.id} all`;
}

function handledStatusLabel(status: DraftRecord["status"]): string {
  switch (status) {
    case "saved":
      return "承認済み（投稿準備OK）";
    case "rejected":
      return "却下済み";
    case "needs_revision":
      return "修正待ち";
    default:
      return "処理済み";
  }
}

// bare「ok / やめる」を送ったのに、直近に提示した候補がもう処理済み（承認/却下/修正待ち）
// だった場合に「もう処理済みだよ」と優しく明示する説明文を返す。該当しなければ undefined。
// 「ok を送ったのに無反応（汎用fallback）に見える」混乱を防ぐ。二重投稿はしない。
export async function describeHandledApprovalCandidate(
  text: string,
  root: string,
): Promise<string | undefined> {
  if (!isOkOnly(text) && !isRejectOnly(text)) return undefined;
  const last = await loadLastApprovalCandidate(root);
  if (!last) return undefined;
  const record = await loadRecord(root, last.id);
  if (!record || record.status === "pending_approval") return undefined;
  return [
    `「${last.id}」はもう${handledStatusLabel(record.status)}です。`,
    "もう一度「ok」を送っても、同じものを二重に投稿することはありません🙆",
    "",
    "・新しい投稿候補を作る → 「投稿」",
    "・本文を直す → 「修正 新しい本文」",
  ].join("\n");
}

export async function expandRejectionShortcut(text: string, root: string): Promise<string | undefined> {
  if (!isRejectOnly(text)) return undefined;

  const last = await loadLastApprovalCandidate(root);
  if (last) {
    const lastRecord = await loadRecord(root, last.id);
    if (lastRecord?.status === "pending_approval") {
      return `NO ${lastRecord.id}`;
    }
  }

  const latest = (await loadStateRecords(root))
    .filter((record) => record.status === "pending_approval")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  if (!latest) return undefined;
  return `NO ${latest.id}`;
}
