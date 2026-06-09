import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { resolveLatestPendingId } from "../approval/shortcut.js";
import { loadRecord, saveRecord } from "../state/file_store.js";

// 機能③「挿入」：OPENQLOW_MEDIA_DIR の画像/動画を一覧 → 番号選択で下書きに添付する。
// 対応拡張子はホワイトリスト。最後は必ず JIN の目視確認を挟む（自動投稿しない）。

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".mp4", ".mov"]);

export type InsertCommand = { kind: "list" } | { kind: "pick"; index: number };

export interface InsertResult {
  ok: boolean;
  action?: string;
  id?: string;
  message: string;
}

/** 拡張子ホワイトリストで画像/動画かを判定（純粋関数）。 */
export function isAllowedMedia(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return ALLOWED_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/** 「挿入」「挿入 2」を解釈する（全角数字は NFKC で半角化）。該当しなければ undefined。 */
export function parseInsertCommand(text: string): InsertCommand | undefined {
  const normalized = text.normalize("NFKC").trim();
  const match = normalized.match(/^挿入(?:[\s:：]*(\d+))?$/);
  if (!match) return undefined;
  if (match[1] === undefined) return { kind: "list" };
  return { kind: "pick", index: Number(match[1]) };
}

export type ImageCommand = { kind: "pick"; index: number } | { kind: "none" };

/** 朝フロー（④）の「画像 2」「画像なし」を解釈する。該当しなければ undefined。 */
export function parseImageCommand(text: string): ImageCommand | undefined {
  const normalized = text.normalize("NFKC").trim();
  if (/^画像\s*(なし|無し)$/.test(normalized)) return { kind: "none" };
  const match = normalized.match(/^画像[\s:：]*(\d+)$/);
  if (match) return { kind: "pick", index: Number(match[1]) };
  return undefined;
}

/** OPENQLOW_MEDIA_DIR を解決（未設定なら ~/openqlow/media）。先頭 ~ は HOME に展開。 */
export function resolveMediaDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME || os.homedir() || "/Users/jin";
  const raw = env.OPENQLOW_MEDIA_DIR || path.join(home, "openqlow", "media");
  if (raw === "~") return home;
  if (raw.startsWith("~/")) return path.join(home, raw.slice(2));
  return raw;
}

/** メディアフォルダの候補（許可拡張子のみ、ファイル名昇順で安定）。 */
export async function listMediaCandidates(dir: string): Promise<string[]> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  return entries.filter(isAllowedMedia).sort((a, b) => a.localeCompare(b));
}

/** 「挿入」/「挿入 N」を処理して LINE 返信用の結果を返す。 */
export async function applyInsert(
  root: string,
  mediaDir: string,
  command: InsertCommand,
): Promise<InsertResult> {
  const files = await listMediaCandidates(mediaDir);

  if (command.kind === "list") {
    if (files.length === 0) {
      return {
        ok: false,
        message: [
          `${mediaDir} に使える画像・動画が見つかりませんでした。`,
          "フォルダに入れるか、写真や動画をこのままLINEに送ってください。",
        ].join("\n"),
      };
    }
    const list = files.map((file, index) => `${index + 1}. ${file}`).join("\n");
    return {
      ok: true,
      action: "insert_list",
      message: ["挿入できる画像・動画はこちらです。", list, "使うものの番号を送ってください（例: 挿入 2）。"].join("\n"),
    };
  }

  // pick
  if (files.length === 0) {
    return { ok: false, message: `${mediaDir} に使える画像・動画が見つかりませんでした。` };
  }
  const index = command.index - 1;
  if (index < 0 || index >= files.length) {
    return { ok: false, message: `その番号は見つかりませんでした。1〜${files.length} で選んでください。` };
  }

  const id = await resolveLatestPendingId(root);
  if (!id) {
    return { ok: false, message: "添付先の投稿候補がありません。先に「投稿」で候補を作ってください。" };
  }
  const record = await loadRecord(root, id);
  if (!record) {
    return { ok: false, message: `投稿候補が見つかりませんでした: ${id}` };
  }

  const file = files[index];
  const absolutePath = path.join(mediaDir, file);
  const mediaFiles = Array.from(new Set([...(record.mediaFiles ?? []), absolutePath]));
  const updated: DraftRecord = { ...record, mediaFiles, updatedAt: new Date().toISOString() };
  await saveRecord(root, updated);

  return {
    ok: true,
    action: "inserted",
    id,
    message: [
      "添付しました。中身を確認してください（映り込みに注意）。",
      `ID: ${id}`,
      `画像: ${file}`,
      `添付ファイル数: ${mediaFiles.length}`,
      "",
      "OK / 修正 〇〇 / NO",
    ].join("\n"),
  };
}

/** 「画像なし」：直近候補の添付メディアを空にする（④用）。 */
export async function clearMedia(root: string): Promise<InsertResult> {
  const id = await resolveLatestPendingId(root);
  if (!id) {
    return { ok: false, message: "対象の投稿候補がありません。先に「投稿」で候補を作ってください。" };
  }
  const record = await loadRecord(root, id);
  if (!record) {
    return { ok: false, message: `投稿候補が見つかりませんでした: ${id}` };
  }
  await saveRecord(root, { ...record, mediaFiles: [], updatedAt: new Date().toISOString() });
  return {
    ok: true,
    action: "image_none",
    id,
    message: ["画像なしで進めます。", `ID: ${id}`, "", "OK / 修正 〇〇 / 挿入 / NO"].join("\n"),
  };
}

/** 朝フロー（④）で本文の下に出す「画像の候補」ブロックを組み立てる。 */
export async function buildImageCandidateBlock(mediaDir: string): Promise<string> {
  const files = await listMediaCandidates(mediaDir);
  if (files.length === 0) {
    return ["画像の候補: フォルダに画像がありません。", "使いたい写真や動画は、このままLINEに送ってください。"].join("\n");
  }
  const list = files.map((file, index) => `${index + 1}. ${file}`).join("\n");
  return ["画像の候補:", list, "→ 使う画像は「画像 1」、画像なしは「画像なし」。別の写真はLINEに直接送ってください。"].join("\n");
}
