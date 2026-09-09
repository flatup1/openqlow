import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveRecord } from "../state/file_store.js";
import { applyLineRevisionCommand, parseLineRevisionCommand } from "./revision.js";
import { rememberApprovalCandidate } from "./shortcut.js";
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

// ---- 「修正 …」は、JINが見ている下書きを直す ----
//
// ID を省いた修正は「いちばん新しい保留」を書き換えていた。
// JINが見ているものと違うので、実際にこうなった:
//
//   JINが見ているのは A (FG-20260101-001)
//   修正 Aを直した本文です
//   → Aの本文: そのまま / Bの本文: Aを直した本文です  ← 見ていない B が書き換わる
//
// 「どれを見せたか」の判断は resolveCurrentDraftId が1か所で持つ。
{
  const root2 = await mkdtemp(path.join(os.tmpdir(), "openqlow-revision-marker-"));
  await saveRecord(root2, record("FG-20260608-101", "Aの本文", "2026-06-08T00:00:00.000Z"));
  await saveRecord(root2, record("FG-20260608-102", "Bの本文", "2026-06-08T01:00:00.000Z"));
  await rememberApprovalCandidate(root2, "FG-20260608-101");   // 見せたのは A（古い方）

  const revised = await applyLineRevisionCommand(root2, "修正 Aを直した本文です");
  assert.equal(revised.ok, true);
  assert.equal(revised.id, "FG-20260608-101", "見せた下書きを直す（いちばん新しいものではない）");

  const a = JSON.parse(await readFile(path.join(root2, "state", "FG-20260608-101.json"), "utf8"));
  const b = JSON.parse(await readFile(path.join(root2, "state", "FG-20260608-102.json"), "utf8"));
  assert.match(a.drafts[0].body, /Aを直した本文です/, "Aが直っている");
  assert.equal(b.drafts[0].body, "Bの本文", "見ていない B は書き換えない");

  await rm(root2, { recursive: true, force: true });
}

// 見せた下書きが読めないときは、別のものを書き換えない。
{
  const root3 = await mkdtemp(path.join(os.tmpdir(), "openqlow-revision-broken-"));
  await saveRecord(root3, record("FG-20260608-111", "Aの本文", "2026-06-08T00:00:00.000Z"));
  await saveRecord(root3, record("FG-20260608-112", "Bの本文", "2026-06-08T01:00:00.000Z"));
  await rememberApprovalCandidate(root3, "FG-20260608-111");
  await writeFile(path.join(root3, "state", "FG-20260608-111.json"), '{"id": "FG-2026', "utf8");

  const revised = await applyLineRevisionCommand(root3, "修正 直した本文です");
  assert.equal(revised.ok, false, "分からないなら書き換えない");

  const b = JSON.parse(await readFile(path.join(root3, "state", "FG-20260608-112.json"), "utf8"));
  assert.equal(b.drafts[0].body, "Bの本文", "巻き添えで B を書き換えない");

  await rm(root3, { recursive: true, force: true });
}

console.log("revision tests passed");
