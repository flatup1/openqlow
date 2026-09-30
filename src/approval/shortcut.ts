import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "../state/atomic_json.js";
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

type CandidateMarker =
  | { status: "none" }
  | { status: "ok"; candidate: LastApprovalCandidate }
  | { status: "unreadable" };

/**
 * 目印を読む。「無い」と「読めなかった」を分ける。
 *
 * 同じ扱いにすると、目印が読めないだけなのに「目印なし」と見なして、
 * JINが見ていない下書きを「OK」で承認してしまう。
 */
async function loadLastApprovalCandidate(root: string): Promise<CandidateMarker> {
  let text: string;
  try {
    text = await readFile(path.join(root, "state", "last_approval_candidate.json"), "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? { status: "none" } : { status: "unreadable" };
  }
  try {
    const parsed = JSON.parse(text) as Partial<LastApprovalCandidate>;
    return typeof parsed.id === "string" && parsed.id ? { status: "ok", candidate: parsed as LastApprovalCandidate } : { status: "unreadable" };
  } catch {
    return { status: "unreadable" };
  }
}

export async function rememberApprovalCandidate(root: string, id: string, now = new Date()): Promise<void> {
  const dir = path.join(root, "state");
  await mkdir(dir, { recursive: true });
  const marker: LastApprovalCandidate = {
    id,
    recordedAt: now.toISOString(),
  };
  // 途中で落ちても壊れた目印が残らないよう、置き換え方式で書く。
  await writeJsonAtomic(path.join(dir, "last_approval_candidate.json"), marker);
}

/** 並べ替えの基準。日付が読めない記録を「いちばん新しい」にしない。 */
function createdAtValue(record: DraftRecord): number {
  const at = Date.parse(record.createdAt);
  return Number.isNaN(at) ? 0 : at;
}

/**
 * 「OK」「NO」だけの返事が、どの下書きを指しているかを決める。
 *
 * 目印（last_approval_candidate）は「JINへ最後に見せたもの」。
 * これがあるなら、それだけを見る。読めなかったり、もう保留でなかったりしても、
 * 「いちばん新しいもの」へ落としてはいけない。実際に試すと:
 *
 *   JINが見ているのは A (FG-20260101-001)
 *   通常時に "OK" → OK FG-20260101-001 all
 *   Aが壊れた状態で "OK" → OK FG-20260101-002 all  ← 見ていない B が承認される
 *
 * 画面で見たものと、承認されるものが違う。AIKA側で直した「番号ずれ」と同じ形。
 * 分からないときは何も指さない（返事はそのままの文として扱われ、何も承認されない）。
 */
export async function resolveCurrentDraftId(root: string): Promise<string | undefined> {
  const marker = await loadLastApprovalCandidate(root);
  // 目印が読めないときは、何も指さない（最新の保留へ落とさない）。
  if (marker.status === "unreadable") return undefined;
  if (marker.status === "ok") {
    const lastRecord = await loadRecord(root, marker.candidate.id);
    return lastRecord?.status === "pending_approval" ? lastRecord.id : undefined;
  }

  // 目印がまだ無いときだけ、いちばん新しい保留を指す。
  const latest = (await loadStateRecords(root))
    .filter((record) => record.status === "pending_approval")
    .sort((a, b) => createdAtValue(b) - createdAtValue(a))[0];
  return latest?.id;
}

export async function expandApprovalShortcut(text: string, root: string): Promise<string | undefined> {
  if (!isOkOnly(text)) return undefined;
  const id = await resolveCurrentDraftId(root);
  return id ? `OK ${id} all` : undefined;
}

export async function expandRejectionShortcut(text: string, root: string): Promise<string | undefined> {
  if (!isRejectOnly(text)) return undefined;
  const id = await resolveCurrentDraftId(root);
  return id ? `NO ${id}` : undefined;
}
