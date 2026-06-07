import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveRecord } from "../state/file_store.js";
import { applyLineRevisionCommand, parseLineRevisionCommand } from "./revision.js";
import type { DraftRecord } from "../types.js";

function record(id: string, body: string, createdAt: string): DraftRecord {
  return {
    id,
    idea: {
      id,
      date: "2026-06-08",
      theme: "女性が安心して始める格闘技",
      angle: "安心感",
      audience: "women",
      source: "obsidian_inbox",
      valueConnection: "FLATUPの安心感を伝える。",
    },
    drafts: [{
      id: `${id}_threads`,
      ideaId: id,
      approvalId: id,
      platform: "threads",
      publicationLevel: "level_2_draft",
      body,
      hashtags: ["FLATUPGYM"],
      cta: "",
      safetyNotes: [],
      createdAt,
    }],
    status: "pending_approval",
    approvalMessage: "before",
    createdAt,
    updatedAt: createdAt,
  };
}

assert.deepEqual(parseLineRevisionCommand("修正 FLATUP GYMは、初心者でも安心して始められます。"), {
  body: "FLATUP GYMは、初心者でも安心して始められます。",
});
assert.deepEqual(parseLineRevisionCommand("修正 FG-20260608-002: FLATUP GYMは女性も安心です。"), {
  id: "FG-20260608-002",
  body: "FLATUP GYMは女性も安心です。",
});

const root = await mkdtemp(path.join(os.tmpdir(), "openqlow-revision-"));
await saveRecord(root, record("FG-20260608-001", "古い本文", "2026-06-08T00:00:00.000Z"));
await saveRecord(root, record("FG-20260608-002", "直近の古い本文", "2026-06-08T01:00:00.000Z"));

const revised = await applyLineRevisionCommand(root, "修正 FLATUP GYMは、初心者でも安心して一歩を踏み出せるやさしい格闘技ジムです。");
assert.equal(revised.ok, true);
assert.equal(revised.id, "FG-20260608-002");
assert.match(revised.message, /再確認してください/);
assert.match(revised.message, /OK FG-20260608-002/);

const saved = JSON.parse(await readFile(path.join(root, "state", "FG-20260608-002.json"), "utf8"));
assert.equal(saved.status, "pending_approval");
assert.equal(saved.drafts[0].body, "FLATUP GYMは、初心者でも安心して一歩を踏み出せるやさしい格闘技ジムです。");
assert.equal(saved.revisionHistory[0].oldDrafts[0].body, "直近の古い本文");
assert.match(saved.approvalMessage, /初心者でも安心/);

const blocked = await applyLineRevisionCommand(root, "修正 絶対に100%痩せます。FLATUP GYM");
assert.equal(blocked.ok, false);
assert.match(blocked.message, /安全チェック/);

await rm(root, { recursive: true, force: true });

console.log("revision tests passed");
