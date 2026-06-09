import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { resolveLatestPendingId } from "../approval/shortcut.js";
import { loadRecord, saveRecord } from "../state/file_store.js";

// 機能⑤：LINE に直接送られた画像/動画を取得して下書きに添付する。
// 候補に良い画像が無いとき、JIN がその場で送った写真をそのまま使えるようにする。
// 秘密情報（トークン・取得URL・バイナリ）はログ・返信に出さない。最後は必ず目視確認。

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25MB

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "image/heif": ".heic",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};

export interface LineMediaResult {
  ok: boolean;
  action?: string;
  id?: string;
  message: string;
}

interface FetchedContent {
  bytes: Uint8Array;
  contentType: string;
}

/** content-type（無ければメッセージ種別）から保存拡張子を決める。 */
export function extFromContentType(contentType: string | null | undefined, messageType: string): string {
  const key = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (EXT_BY_CONTENT_TYPE[key]) return EXT_BY_CONTENT_TYPE[key];
  return messageType === "video" ? ".mp4" : ".jpg";
}

function contentEndpoint(messageId: string): string {
  return `https://api-data.line.me/v2/bot/message/${messageId}/content`;
}

/** LINE のメッセージ実体（画像/動画バイナリ）を取得する。トークン・URLはログに出さない。 */
export async function fetchLineContent(
  messageId: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedContent> {
  const res = await fetchImpl(contentEndpoint(messageId), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // ステータスのみ。応答本文は秘密が混じりうるので出さない。
    throw new Error(`LINE content fetch failed: ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType: res.headers.get("content-type") ?? "" };
}

export interface ApplyLineMediaOptions {
  root: string;
  mediaDir: string;
  messageId: string;
  messageType: string; // "image" | "video"
  token: string;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  now?: Date;
}

/** LINE 直送メディアを取得・保存し、直近の承認待ち候補に添付する。 */
export async function applyLineMedia(opts: ApplyLineMediaOptions): Promise<LineMediaResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!opts.token) {
    return { ok: false, message: "画像を受け取れる設定になっていません（管理者に連絡してください）。" };
  }

  const id = await resolveLatestPendingId(opts.root);
  if (!id) {
    return { ok: false, message: "添付先の投稿候補がありません。先に「投稿」で候補を作ってください。" };
  }
  const record = await loadRecord(opts.root, id);
  if (!record) {
    return { ok: false, message: `投稿候補が見つかりませんでした: ${id}` };
  }

  let content: FetchedContent;
  try {
    content = await fetchLineContent(opts.messageId, opts.token, opts.fetchImpl);
  } catch {
    return { ok: false, message: "画像・動画の取り込みに失敗しました。もう一度送ってください。" };
  }

  if (content.bytes.byteLength > maxBytes) {
    const limitMb = Math.floor(maxBytes / (1024 * 1024));
    return { ok: false, message: `ファイルが大きすぎて受け取れませんでした（上限 ${limitMb}MB）。小さいサイズで送り直してください。` };
  }

  const ext = extFromContentType(content.contentType, opts.messageType);
  const now = opts.now ?? new Date();
  const fileName = `${id}-${now.getTime()}${ext}`;
  const absolutePath = path.join(opts.mediaDir, fileName);
  await mkdir(opts.mediaDir, { recursive: true });
  await writeFile(absolutePath, content.bytes);

  const mediaFiles = Array.from(new Set([...(record.mediaFiles ?? []), absolutePath]));
  const updated: DraftRecord = { ...record, mediaFiles, updatedAt: now.toISOString() };
  await saveRecord(opts.root, updated);

  return {
    ok: true,
    action: "line_media_attached",
    id,
    message: [
      "受け取りました。これを使いますか？（お客様・お子さんの映り込みに注意）",
      `ID: ${id}`,
      `保存: ${fileName}`,
      `添付ファイル数: ${mediaFiles.length}`,
      "",
      "OK / 修正 〇〇 / NO",
    ].join("\n"),
  };
}
