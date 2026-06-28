import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { consumeRecentUploadedMedia, rememberUploadedMedia } from "./pending_media.js";

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-pending-media-"));
  await mkdir(path.join(root, "state"), { recursive: true });
  return root;
}

async function makeMediaFile(root: string, name: string): Promise<string> {
  const dir = path.join(root, "state", "media");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  await writeFile(file, "image-bytes");
  return file;
}

// 1. 覚えた写真を取り出せる（直近アップ）。
{
  const root = await makeRoot();
  const file = await makeMediaFile(root, "FG-1.jpg");
  const now = new Date("2026-06-28T13:00:00.000Z");
  await rememberUploadedMedia(root, file, now);
  const got = await consumeRecentUploadedMedia(root, { now: new Date("2026-06-28T13:05:00.000Z") });
  assert.equal(got, file, "5分後なら引き継げる");
}

// 2. 一度取り出したら消費される（二重添付しない）。
{
  const root = await makeRoot();
  const file = await makeMediaFile(root, "FG-2.jpg");
  await rememberUploadedMedia(root, file);
  assert.ok(await consumeRecentUploadedMedia(root), "1回目は取り出せる");
  assert.equal(await consumeRecentUploadedMedia(root), undefined, "2回目は消費済みでundefined");
}

// 3. 古すぎる写真は引き継がない（30分超）。
{
  const root = await makeRoot();
  const file = await makeMediaFile(root, "FG-3.jpg");
  await rememberUploadedMedia(root, file, new Date("2026-06-28T13:00:00.000Z"));
  const got = await consumeRecentUploadedMedia(root, { now: new Date("2026-06-28T14:00:00.000Z") });
  assert.equal(got, undefined, "1時間後は古すぎて引き継がない");
}

// 4. マーカーが無ければ undefined。
{
  const root = await makeRoot();
  assert.equal(await consumeRecentUploadedMedia(root), undefined, "マーカー無しはundefined");
}

// 5. ファイルが消えていれば引き継がない。
{
  const root = await makeRoot();
  await rememberUploadedMedia(root, path.join(root, "state", "media", "missing.jpg"));
  assert.equal(await consumeRecentUploadedMedia(root), undefined, "実ファイルが無ければ引き継がない");
}

console.log("pending media tests passed");
