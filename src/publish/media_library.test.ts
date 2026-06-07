import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveRecord } from "../state/file_store.js";
import {
  attachMediaSelectionCommand,
  listMediaCandidates,
  mediaDirectoryForEnv,
  parseInsertMediaCommand,
} from "./media_library.js";
import type { DraftRecord } from "../types.js";

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

console.log("media library tests passed");
