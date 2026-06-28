import { readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

interface UploadedMediaMarker {
  path: string;
  uploadedAt: string;
}

function markerPath(root: string): string {
  return path.join(root, "state", "last_uploaded_media.json");
}

// 直近30分以内に送られた写真だけを引き継ぐ（古い写真が次の投稿に紛れ込まないように）。
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

// 直近にLINEで受け取った写真を「次の投稿候補へ引き継ぐ候補」として覚えておく。
// 「写真→投稿」「投稿→写真」どちらの順番でも投稿に画像が付くようにするための土台。
export async function rememberUploadedMedia(
  root: string,
  mediaFile: string,
  now: Date = new Date(),
): Promise<void> {
  const marker: UploadedMediaMarker = { path: mediaFile, uploadedAt: now.toISOString() };
  await writeFile(markerPath(root), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
}

// 直近に覚えた写真を1回だけ取り出す（取り出したらマーカーを削除＝消費）。
// 古すぎる(既定30分超)・未来日時・ファイルが消えている場合は undefined を返す。
export async function consumeRecentUploadedMedia(
  root: string,
  opts: { maxAgeMs?: number; now?: Date } = {},
): Promise<string | undefined> {
  const file = markerPath(root);
  const text = await readFile(file, "utf8").catch(() => undefined);
  if (text === undefined) return undefined;
  await rm(file, { force: true }); // 一度きりで消費する
  let marker: UploadedMediaMarker;
  try {
    marker = JSON.parse(text) as UploadedMediaMarker;
  } catch {
    return undefined;
  }
  if (!marker.path || !marker.uploadedAt) return undefined;

  const now = opts.now ?? new Date();
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const age = now.getTime() - new Date(marker.uploadedAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > maxAge) return undefined;

  const info = await stat(marker.path).catch(() => undefined);
  if (!info?.isFile()) return undefined;
  return marker.path;
}
