import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { attachMediaToLatestPending, latestPendingRecord, mediaDirectoryForEnv } from "./media_library.js";

export type LineMediaMessageType = "image" | "video";

export interface SaveLineMessageMediaInput {
  root: string;
  messageId: string;
  messageType: LineMediaMessageType;
  token: string;
  mediaDir?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  maxBytes?: number;
}

export interface SaveLineMessageMediaResult {
  ok: boolean;
  id?: string;
  message: string;
}

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const LINE_CONTENT_BASE = "https://api-data.line.me/v2/bot/message";

function timestampForFile(now: Date): string {
  return now.toISOString().replace(/[-:T]/g, "").replace(/\.\d{3}Z$/, "");
}

function extensionForContentType(contentType: string, messageType: LineMediaMessageType): string | undefined {
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  if (messageType === "image") {
    if (normalized === "image/jpeg" || normalized === "image/jpg") return ".jpg";
    if (normalized === "image/png") return ".png";
    if (normalized === "image/webp") return ".webp";
    if (normalized === "image/heic" || normalized === "image/heif") return ".heic";
    return undefined;
  }
  if (normalized === "video/mp4") return ".mp4";
  if (normalized === "video/quicktime") return ".mov";
  return undefined;
}

function parseContentLength(response: Response): number | undefined {
  const raw = response.headers.get("content-length");
  if (!raw) return undefined;
  const bytes = Number.parseInt(raw, 10);
  return Number.isFinite(bytes) ? bytes : undefined;
}

async function writeUniqueFile(mediaDir: string, baseName: string, ext: string, bytes: Uint8Array): Promise<string> {
  for (let index = 1; index <= 100; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const file = path.join(mediaDir, `${baseName}${suffix}${ext}`);
    try {
      await writeFile(file, bytes, { flag: "wx" });
      return file;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("LINEメディアの保存ファイル名を作成できませんでした。");
}

export async function saveLineMessageMediaAndAttach(
  input: SaveLineMessageMediaInput,
): Promise<SaveLineMessageMediaResult> {
  if (!input.token) {
    return {
      ok: false,
      message: "LINEメディア取得用トークンが未設定のため、添付できません。",
    };
  }

  const record = await latestPendingRecord(input.root);
  if (!record) return { ok: false, message: "添付できる承認待ち下書きがありません。" };

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${LINE_CONTENT_BASE}/${encodeURIComponent(input.messageId)}/content`, {
    headers: { Authorization: `Bearer ${input.token}` },
  });

  if (!response.ok) {
    return {
      ok: false,
      message: "LINEからメディアを取得できませんでした。もう一度送ってください。",
    };
  }

  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const contentLength = parseContentLength(response);
  if (contentLength !== undefined && contentLength > maxBytes) {
    return {
      ok: false,
      message: `メディアがサイズ上限を超えています。上限は ${Math.floor(maxBytes / 1024 / 1024)}MB です。`,
    };
  }

  const ext = extensionForContentType(response.headers.get("content-type") ?? "", input.messageType);
  if (!ext) {
    return {
      ok: false,
      message: "未対応のメディア形式です。対応: jpg/jpeg/png/webp/heic/mp4/mov",
    };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    return {
      ok: false,
      message: `メディアがサイズ上限を超えています。上限は ${Math.floor(maxBytes / 1024 / 1024)}MB です。`,
    };
  }

  const mediaDir = input.mediaDir ?? mediaDirectoryForEnv();
  await mkdir(mediaDir, { recursive: true });
  const file = await writeUniqueFile(mediaDir, `${record.id}-${timestampForFile(input.now ?? new Date())}`, ext, bytes);

  return attachMediaToLatestPending(input.root, file);
}
