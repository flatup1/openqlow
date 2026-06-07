import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { loadRecord, saveRecord } from "../state/file_store.js";
import type { DraftRecord } from "../types.js";

export interface MediaCandidate {
  index: number;
  name: string;
  path: string;
  sizeBytes: number;
  kind: "image" | "video";
}

export type InsertMediaCommand =
  | { kind: "list" }
  | { kind: "select"; index: number };

export type ImageChoiceCommand =
  | { kind: "none" }
  | { kind: "select"; index: number };

export interface AttachMediaResult {
  ok: boolean;
  id?: string;
  message: string;
}

export const SUPPORTED_MEDIA_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".mp4", ".mov"]);

export function mediaDirectoryForEnv(env: Record<string, string | undefined> = process.env): string {
  return env.OPENQLOW_MEDIA_DIR || path.join(env.HOME || "/Users/jin", "openqlow", "media");
}

export function parseInsertMediaCommand(text: string): InsertMediaCommand | undefined {
  const normalized = text.normalize("NFKC").trim();
  if (normalized === "挿入") return { kind: "list" };
  const selected = normalized.match(/^挿入\s+(\d+)$/);
  if (selected) return { kind: "select", index: Number(selected[1]) };
  return undefined;
}

export function parseImageChoiceCommand(text: string): ImageChoiceCommand | undefined {
  const normalized = text.normalize("NFKC").trim();
  if (normalized === "画像なし") return { kind: "none" };
  const selected = normalized.match(/^画像\s+(\d+)$/);
  if (selected) return { kind: "select", index: Number(selected[1]) };
  return undefined;
}

function kindForExtension(ext: string): MediaCandidate["kind"] | undefined {
  if ([".jpg", ".jpeg", ".png", ".webp", ".heic"].includes(ext)) return "image";
  if ([".mp4", ".mov"].includes(ext)) return "video";
  return undefined;
}

export async function listMediaCandidates(mediaDir = mediaDirectoryForEnv()): Promise<MediaCandidate[]> {
  const names = await readdir(mediaDir).catch(() => []);
  const candidates: MediaCandidate[] = [];
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    const ext = path.extname(name).toLowerCase();
    if (!SUPPORTED_MEDIA_EXTENSIONS.has(ext)) continue;
    const kind = kindForExtension(ext);
    if (!kind) continue;
    const file = path.join(mediaDir, name);
    const info = await stat(file).catch(() => undefined);
    if (!info?.isFile()) continue;
    candidates.push({
      index: candidates.length + 1,
      name,
      path: file,
      sizeBytes: info.size,
      kind,
    });
  }
  return candidates;
}

export async function latestPendingRecord(root: string): Promise<DraftRecord | undefined> {
  const dir = path.join(root, "state");
  const files = await readdir(dir).catch(() => []);
  const records: DraftRecord[] = [];
  for (const file of files) {
    if (!/^FG-\d{8}-\d{3}\.json$/.test(file)) continue;
    const record = await loadRecord(root, file.replace(/\.json$/, ""));
    if (record?.status === "pending_approval") records.push(record);
  }
  return records.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

function formatCandidateList(candidates: MediaCandidate[]): string {
  return candidates.map(candidate => `${candidate.index}. ${candidate.name} (${candidate.kind})`).join("\n");
}

export function formatMediaCandidatesForLine(candidates: MediaCandidate[], limit = candidates.length): string {
  const visible = candidates.slice(0, limit);
  if (visible.length === 0) {
    return "画像候補: なし\nLINEに画像/動画を直接送るか、`画像なし` で進められます。";
  }
  return [
    "画像候補:",
    ...visible.map(candidate => `${candidate.index}. ${candidate.name} (${candidate.kind})`),
    "",
    "選ぶ: 画像 1",
    "使わない: 画像なし",
  ].join("\n");
}

function visualConfirmMessage(record: DraftRecord, fileName: string): string {
  return [
    "OPENQLOW: メディアを添付しました。まだ投稿しません。",
    `ID: ${record.id}`,
    `添付: ${fileName}`,
    "",
    "本文とメディアを目視確認してください。",
    "お客様・子ども・女性・会員の映り込みがないか確認してから OK してください。",
    "",
    record.approvalMessage,
  ].join("\n");
}

export async function attachMediaToLatestPending(root: string, mediaFile: string): Promise<AttachMediaResult> {
  const record = await latestPendingRecord(root);
  if (!record) return { ok: false, message: "添付できる承認待ち下書きがありません。" };

  const updated: DraftRecord = {
    ...record,
    mediaFiles: [...(record.mediaFiles ?? []), mediaFile],
    updatedAt: new Date().toISOString(),
  };
  await saveRecord(root, updated);

  return {
    ok: true,
    id: updated.id,
    message: visualConfirmMessage(updated, path.basename(mediaFile)),
  };
}

export async function attachMediaSelectionCommand(
  root: string,
  text: string,
  opts: { mediaDir?: string } = {},
): Promise<AttachMediaResult> {
  const command = parseInsertMediaCommand(text);
  if (!command) return { ok: false, message: "挿入は `挿入` または `挿入 2` の形で送ってください。" };

  const mediaDir = opts.mediaDir ?? mediaDirectoryForEnv();
  const candidates = await listMediaCandidates(mediaDir);
  if (candidates.length === 0) {
    return {
      ok: false,
      message: `OPENQLOW: 挿入できるメディア候補がありません。\n保存先: OPENQLOW_MEDIA_DIR\n対応: jpg/jpeg/png/webp/heic/mp4/mov`,
    };
  }

  if (command.kind === "list") {
    return {
      ok: true,
      message: [
        "OPENQLOW: 挿入するメディア番号を選んでください。",
        formatCandidateList(candidates),
        "",
        "例: 挿入 2",
      ].join("\n"),
    };
  }

  const selected = candidates[command.index - 1];
  if (!selected) {
    return { ok: false, message: `OPENQLOW: ${command.index} 番のメディア候補はありません。` };
  }

  return attachMediaToLatestPending(root, selected.path);
}

export async function applyImageChoiceCommand(
  root: string,
  text: string,
  opts: { mediaDir?: string; limit?: number } = {},
): Promise<AttachMediaResult> {
  const command = parseImageChoiceCommand(text);
  if (!command) return { ok: false, message: "画像は `画像 1` または `画像なし` の形で送ってください。" };

  const record = await latestPendingRecord(root);
  if (!record) return { ok: false, message: "画像を選べる承認待ち下書きがありません。" };

  if (command.kind === "none") {
    const updated: DraftRecord = {
      ...record,
      mediaFiles: [],
      updatedAt: new Date().toISOString(),
    };
    await saveRecord(root, updated);
    return {
      ok: true,
      id: updated.id,
      message: [
        "OPENQLOW: 画像なしで進めます。まだ投稿しません。",
        `ID: ${updated.id}`,
        "",
        "本文を再確認してください。",
        "",
        updated.approvalMessage,
      ].join("\n"),
    };
  }

  const candidates = (await listMediaCandidates(opts.mediaDir ?? mediaDirectoryForEnv())).slice(0, opts.limit ?? 5);
  const selected = candidates[command.index - 1];
  if (!selected) return { ok: false, message: `OPENQLOW: ${command.index} 番の画像候補はありません。` };
  return attachMediaToLatestPending(root, selected.path);
}
