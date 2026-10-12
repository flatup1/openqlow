import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveRecord } from "../state/file_store.js";
import {
  applyImageChoiceCommand,
  attachMediaSelectionCommand,
  candidatePreviewUrls,
  imageChoiceCandidates,
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

// 回帰テスト: 表示したプレビューの「画像N」と、番号で選んだ画像が必ず同じになること。
// （以前は表示=新しい順、選択=名前順で、見た画像と違うものが投稿されていた）
const choiceDir = await mkdtemp(path.join(os.tmpdir(), "openqlow-media-choice-"));
const choiceRoot = await mkdtemp(path.join(os.tmpdir(), "openqlow-choice-root-"));
const names = ["aaa-old.jpg", "bbb-mid.jpg", "ccc-new.jpg", "ddd-clip.mp4"];
const base = Date.parse("2026-06-08T00:00:00.000Z");
for (const [i, name] of names.entries()) {
  const file = path.join(choiceDir, name);
  await writeFile(file, "x");
  // 名前順と新しい順を逆にする（aaa が一番古い、ccc が一番新しい）。
  const t = new Date(base + i * 60_000);
  await utimes(file, t, t);
}
const choiceEnv = {
  OPENQLOW_MEDIA_DIR: choiceDir,
  OPENQLOW_PUBLIC_MEDIA_DIR: choiceDir,
  OPENQLOW_PUBLIC_MEDIA_BASE_URL: "https://x.example/openqlow/media/",
};
const previews = await candidatePreviewUrls(choiceEnv);
const choices = await imageChoiceCandidates(choiceEnv);
assert.deepEqual(previews, choices.map((candidate) => candidate.publicUrl));
assert.equal(choices[0].name, "ccc-new.jpg", "画像1は一番新しい画像");
assert.ok(!choices.some((candidate) => candidate.kind === "video"), "動画は画像候補に入れない");

await saveRecord(choiceRoot, { ...record("FG-20260608-010"), status: "pending_approval" });
const picked = await applyImageChoiceCommand(choiceRoot, "画像 1", { env: choiceEnv });
assert.equal(picked.ok, true, picked.message);
const choiceSaved = JSON.parse(await readFile(path.join(choiceRoot, "state", "FG-20260608-010.json"), "utf8")) as DraftRecord;
assert.deepEqual(choiceSaved.mediaFiles, [path.join(choiceDir, "ccc-new.jpg")], "画像1の表示と投稿対象が一致");

await rm(root, { recursive: true, force: true });
await rm(mediaDir, { recursive: true, force: true });
await rm(emptyDir, { recursive: true, force: true });
await rm(choiceDir, { recursive: true, force: true });
await rm(choiceRoot, { recursive: true, force: true });

console.log("media library tests passed");
