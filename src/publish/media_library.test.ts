import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveRecord } from "../state/file_store.js";
import {
  attachMediaSelectionCommand,
  attachMediaToLatestPending,
  listMediaCandidates,
  mediaDirectoryForEnv,
  parseInsertMediaCommand,
} from "./media_library.js";
import type { DraftRecord } from "../types.js";
import { expandApprovalShortcut, rememberApprovalCandidate } from "../approval/shortcut.js";

function record(id: string): DraftRecord {
  return {
    id,
    idea: {
      id,
      date: "2026-06-08",
      theme: "画像つき投稿",
      angle: "目視確認",
      audience: "local_narita",
      source: "obsidian_inbox",
      valueConnection: "画像を目視確認して投稿準備する。",
    },
    drafts: [{
      id: `${id}_threads`,
      ideaId: id,
      approvalId: id,
      platform: "threads",
      publicationLevel: "level_2_draft",
      body: "FLATUP GYMは初心者でも安心です。",
      hashtags: ["FLATUPGYM"],
      cta: "",
      safetyNotes: [],
      createdAt: "2026-06-08T00:00:00.000Z",
    }],
    status: "pending_approval",
    approvalMessage: "候補",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  };
}

assert.equal(mediaDirectoryForEnv({ HOME: "/Users/jin" }), "/Users/jin/openqlow/media");
assert.deepEqual(parseInsertMediaCommand("挿入"), { kind: "list" });
assert.deepEqual(parseInsertMediaCommand("挿入 2"), { kind: "select", index: 2 });
assert.equal(parseInsertMediaCommand("画像 1"), undefined);

const root = await mkdtemp(path.join(os.tmpdir(), "openqlow-media-lib-root-"));
const mediaDir = await mkdtemp(path.join(os.tmpdir(), "openqlow-media-lib-media-"));
await mkdir(mediaDir, { recursive: true });
await writeFile(path.join(mediaDir, "a.jpg"), "a");
await writeFile(path.join(mediaDir, "b.heic"), "b");
await writeFile(path.join(mediaDir, "c.txt"), "c");
await writeFile(path.join(mediaDir, "d.mp4"), "d");

const list = await listMediaCandidates(mediaDir);
assert.deepEqual(list.map(item => item.name), ["a.jpg", "b.heic", "d.mp4"]);

await saveRecord(root, record("FG-20260608-001"));
const selected = await attachMediaSelectionCommand(root, "挿入 2", { mediaDir });
assert.equal(selected.ok, true);
assert.equal(selected.id, "FG-20260608-001");
assert.match(selected.message, /目視確認/);
assert.match(selected.message, /b\.heic/);

const saved = JSON.parse(await readFile(path.join(root, "state", "FG-20260608-001.json"), "utf8"));
assert.deepEqual(saved.mediaFiles, [path.join(mediaDir, "b.heic")]);

const listing = await attachMediaSelectionCommand(root, "挿入", { mediaDir });
assert.match(listing.message, /1\. a\.jpg/);
assert.match(listing.message, /3\. d\.mp4/);

const emptyDir = await mkdtemp(path.join(os.tmpdir(), "openqlow-media-empty-"));
const empty = await attachMediaSelectionCommand(root, "挿入", { mediaDir: emptyDir });
assert.equal(empty.ok, false);
assert.match(empty.message, /候補がありません/);

await rm(root, { recursive: true, force: true });
await rm(mediaDir, { recursive: true, force: true });
await rm(emptyDir, { recursive: true, force: true });

// ---- 写真は、JINが見ている下書きに付く ----
//
// 添付先は「いちばん新しい保留」だった。承認（OK）や修正が目印を見るのに、
// ここだけ見ていないので、別々の下書きを指していた。実際にこうなった:
//
//   JINが見ているのは A (FG-20260101-001)
//   "OK" が指すもの → FG-20260101-001
//   写真の添付先    → FG-20260101-002   ← 別の下書き
//
// JINは A に付けたつもりで、A は写真なしで承認される。
{
  const markerRoot = await mkdtemp(path.join(os.tmpdir(), "openqlow-media-lib-marker-"));
  const older = { ...record("FG-20260608-201"), createdAt: "2026-06-08T00:00:00.000Z" };
  const newer = { ...record("FG-20260608-202"), createdAt: "2026-06-08T01:00:00.000Z" };
  await saveRecord(markerRoot, older);
  await saveRecord(markerRoot, newer);
  await rememberApprovalCandidate(markerRoot, "FG-20260608-201");   // 見せたのは古い方

  const attached = await attachMediaToLatestPending(markerRoot, "/tmp/photo.jpg");
  assert.equal(attached.ok, true);
  assert.equal(attached.id, "FG-20260608-201", "見せた下書きに付ける（いちばん新しいものではない）");

  const a = JSON.parse(await readFile(path.join(markerRoot, "state", "FG-20260608-201.json"), "utf8"));
  const b = JSON.parse(await readFile(path.join(markerRoot, "state", "FG-20260608-202.json"), "utf8"));
  assert.deepEqual(a.mediaFiles, ["/tmp/photo.jpg"]);
  assert.deepEqual(b.mediaFiles ?? [], [], "見ていない下書きに写真を付けない");

  // 承認が指す先と同じであること。ここがずれると、写真なしで承認される。
  assert.equal(await expandApprovalShortcut("ok", markerRoot), "OK FG-20260608-201 all");

  await rm(markerRoot, { recursive: true, force: true });
}

// 見せた下書きが読めないときは、別のものに付けない。
{
  const brokenRoot = await mkdtemp(path.join(os.tmpdir(), "openqlow-media-lib-broken-"));
  await saveRecord(brokenRoot, { ...record("FG-20260608-211"), createdAt: "2026-06-08T00:00:00.000Z" });
  await saveRecord(brokenRoot, { ...record("FG-20260608-212"), createdAt: "2026-06-08T01:00:00.000Z" });
  await rememberApprovalCandidate(brokenRoot, "FG-20260608-211");
  await writeFile(path.join(brokenRoot, "state", "FG-20260608-211.json"), '{"id": "FG-2026', "utf8");

  const attached = await attachMediaToLatestPending(brokenRoot, "/tmp/photo.jpg");
  assert.equal(attached.ok, false, "分からないなら付けない");

  const b = JSON.parse(await readFile(path.join(brokenRoot, "state", "FG-20260608-212.json"), "utf8"));
  assert.deepEqual(b.mediaFiles ?? [], [], "巻き添えで別の下書きに付けない");

  await rm(brokenRoot, { recursive: true, force: true });
}

console.log("media library tests passed");
