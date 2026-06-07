import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveRecord } from "../state/file_store.js";
import { saveLineMessageMediaAndAttach } from "./line_media.js";
import type { DraftRecord } from "../types.js";

function record(id: string): DraftRecord {
  return {
    id,
    idea: {
      id,
      date: "2026-06-08",
      theme: "LINE直送メディア",
      angle: "目視確認",
      audience: "local_narita",
      source: "obsidian_inbox",
      valueConnection: "LINEで送った画像を投稿候補に添付する。",
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

const root = await mkdtemp(path.join(os.tmpdir(), "openqlow-line-media-root-"));
const mediaDir = await mkdtemp(path.join(os.tmpdir(), "openqlow-line-media-dir-"));
await saveRecord(root, record("FG-20260608-101"));

const calls: Array<{ url: string; auth: string | null }> = [];
const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
  calls.push({ url: String(url), auth: (init?.headers as Record<string, string>).Authorization ?? null });
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-type": "image/jpeg", "content-length": "3" },
  });
};

const result = await saveLineMessageMediaAndAttach({
  root,
  mediaDir,
  messageId: "line-message-id",
  messageType: "image",
  token: "line-token",
  fetchImpl,
  now: new Date("2026-06-08T01:02:03.000Z"),
});

assert.equal(result.ok, true);
assert.equal(result.id, "FG-20260608-101");
assert.match(result.message, /目視確認/);
assert.match(result.message, /FG-20260608-101-20260608010203\.jpg/);
assert.equal(calls[0].url, "https://api-data.line.me/v2/bot/message/line-message-id/content");
assert.equal(calls[0].auth, "Bearer line-token");

const saved = JSON.parse(await readFile(path.join(root, "state", "FG-20260608-101.json"), "utf8"));
assert.equal(saved.mediaFiles.length, 1);
assert.match(saved.mediaFiles[0], /FG-20260608-101-20260608010203\.jpg$/);

const collision = await saveLineMessageMediaAndAttach({
  root,
  mediaDir,
  messageId: "line-message-id-2",
  messageType: "image",
  token: "line-token",
  fetchImpl,
  now: new Date("2026-06-08T01:02:03.000Z"),
});
assert.equal(collision.ok, true);
const savedCollision = JSON.parse(await readFile(path.join(root, "state", "FG-20260608-101.json"), "utf8"));
assert.equal(savedCollision.mediaFiles.length, 2);
assert.match(savedCollision.mediaFiles[1], /FG-20260608-101-20260608010203-2\.jpg$/);

const tooLarge = await saveLineMessageMediaAndAttach({
  root,
  mediaDir,
  messageId: "too-large",
  messageType: "video",
  token: "line-token",
  fetchImpl: async () => new Response(new Uint8Array([1]), {
    status: 200,
    headers: { "content-type": "video/mp4", "content-length": String(25 * 1024 * 1024) },
  }),
});
assert.equal(tooLarge.ok, false);
assert.match(tooLarge.message, /サイズ上限/);

const unsupported = await saveLineMessageMediaAndAttach({
  root,
  mediaDir,
  messageId: "bad",
  messageType: "image",
  token: "line-token",
  fetchImpl: async () => new Response(new Uint8Array([1]), {
    status: 200,
    headers: { "content-type": "image/gif", "content-length": "1" },
  }),
});
assert.equal(unsupported.ok, false);
assert.match(unsupported.message, /未対応/);

await rm(root, { recursive: true, force: true });
await rm(mediaDir, { recursive: true, force: true });

console.log("line media tests passed");
