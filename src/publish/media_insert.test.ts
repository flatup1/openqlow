import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { saveRecord, loadRecord } from "../state/file_store.js";
import {
  applyInsert,
  isAllowedMedia,
  listMediaCandidates,
  parseInsertCommand,
  resolveMediaDir,
} from "./media_insert.js";

function testIsAllowedMedia(): void {
  assert.equal(isAllowedMedia("a.jpg"), true);
  assert.equal(isAllowedMedia("a.JPG"), true);
  assert.equal(isAllowedMedia("clip.mp4"), true);
  assert.equal(isAllowedMedia("movie.mov"), true);
  assert.equal(isAllowedMedia("doc.pdf"), false);
  assert.equal(isAllowedMedia("noext"), false);
}

function testParseInsertCommand(): void {
  assert.deepEqual(parseInsertCommand("挿入"), { kind: "list" });
  assert.deepEqual(parseInsertCommand("挿入 2"), { kind: "pick", index: 2 });
  assert.deepEqual(parseInsertCommand("挿入2"), { kind: "pick", index: 2 });
  assert.deepEqual(parseInsertCommand("挿入 ２"), { kind: "pick", index: 2 }); // 全角数字
  assert.equal(parseInsertCommand("挿入してください"), undefined);
  assert.equal(parseInsertCommand("ok"), undefined);
}

function testResolveMediaDir(): void {
  assert.equal(resolveMediaDir({ OPENQLOW_MEDIA_DIR: "/x/y" } as NodeJS.ProcessEnv), "/x/y");
  assert.equal(
    resolveMediaDir({ HOME: "/home/jin" } as NodeJS.ProcessEnv),
    "/home/jin/openqlow/media",
  );
  assert.equal(
    resolveMediaDir({ HOME: "/home/jin", OPENQLOW_MEDIA_DIR: "~/m" } as NodeJS.ProcessEnv),
    "/home/jin/m",
  );
}

function pendingRecord(id: string): DraftRecord {
  const now = "2026-06-09T00:00:00.000Z";
  return {
    id,
    idea: { id, date: "2026-06-09", theme: "t", angle: "a", audience: "beginners", source: "rotation", valueConnection: "v" },
    drafts: [
      {
        id: `${id}-t`,
        ideaId: id,
        approvalId: id,
        platform: "threads",
        publicationLevel: "level_2_draft",
        body: "本文",
        hashtags: [],
        cta: "c",
        safetyNotes: [],
        createdAt: now,
      },
    ],
    status: "pending_approval",
    approvalMessage: "m",
    createdAt: now,
    updatedAt: now,
  };
}

async function testListAndAttach(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-insert-"));
  try {
    const media = path.join(root, "media");
    await mkdir(media, { recursive: true });
    await writeFile(path.join(media, "b.jpg"), "x");
    await writeFile(path.join(media, "a.png"), "x");
    await writeFile(path.join(media, "ignore.txt"), "x");

    // 一覧（許可拡張子のみ・名前昇順）
    const files = await listMediaCandidates(media);
    assert.deepEqual(files, ["a.png", "b.jpg"]);

    const list = await applyInsert(root, media, { kind: "list" });
    assert.match(list.message, /1\. a\.png/);
    assert.match(list.message, /2\. b\.jpg/);

    // 添付先の候補が無ければ pending 無しで失敗
    const noPending = await applyInsert(root, media, { kind: "pick", index: 1 });
    assert.equal(noPending.ok, false);
    assert.match(noPending.message, /投稿候補がありません/);

    // 候補を作って添付
    await saveRecord(root, pendingRecord("FG-20260609-001"));
    const picked = await applyInsert(root, media, { kind: "pick", index: 1 });
    assert.equal(picked.ok, true);
    assert.match(picked.message, /添付しました/);
    assert.match(picked.message, /a\.png/);

    const updated = await loadRecord(root, "FG-20260609-001");
    assert.deepEqual(updated?.mediaFiles, [path.join(media, "a.png")]);

    // 範囲外の番号
    const oob = await applyInsert(root, media, { kind: "pick", index: 9 });
    assert.equal(oob.ok, false);
    assert.match(oob.message, /1〜2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testEmptyFolder(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-insert-"));
  try {
    const media = path.join(root, "empty");
    await mkdir(media, { recursive: true });
    const res = await applyInsert(root, media, { kind: "list" });
    assert.equal(res.ok, false);
    assert.match(res.message, /見つかりませんでした/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

testIsAllowedMedia();
testParseInsertCommand();
testResolveMediaDir();
await testListAndAttach();
await testEmptyFolder();

console.log("media insert tests passed");
