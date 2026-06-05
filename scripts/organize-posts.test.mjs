import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { classifyExtension, resolveUniquePath, organizeOnce } from "./organize-posts.mjs";

// classifyExtension
assert.equal(classifyExtension(".jpg"), "image");
assert.equal(classifyExtension(".JPG"), "image", "case insensitive");
assert.equal(classifyExtension(".heic"), "image");
assert.equal(classifyExtension(".mp4"), "video");
assert.equal(classifyExtension(".MOV"), "video");
assert.equal(classifyExtension(".pdf"), "unknown");
assert.equal(classifyExtension(""), "unknown");

// resolveUniquePath
{
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-organize-test-"));
  try {
    const p1 = await resolveUniquePath(tmp, "foo.jpg");
    assert.equal(path.basename(p1), "foo.jpg", "新規ファイルはそのまま");

    // 既存ファイルを作って衝突させる
    await fs.writeFile(path.join(tmp, "foo.jpg"), "x");
    const p2 = await resolveUniquePath(tmp, "foo.jpg");
    assert.equal(path.basename(p2), "foo (1).jpg", "衝突時は (1) 付与");

    await fs.writeFile(path.join(tmp, "foo (1).jpg"), "x");
    const p3 = await resolveUniquePath(tmp, "foo.jpg");
    assert.equal(path.basename(p3), "foo (2).jpg", "さらに衝突なら (2)");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// organizeOnce — フルテスト
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-organize-root-"));
  try {
    const inbox = path.join(root, "inbox");
    await fs.mkdir(inbox, { recursive: true });

    // ファイル群を作成
    await fs.writeFile(path.join(inbox, "cat.jpg"), "imgdata");
    await fs.writeFile(path.join(inbox, "video.mp4"), "viddata");
    await fs.writeFile(path.join(inbox, "screenshot.PNG"), "imgdata");
    await fs.writeFile(path.join(inbox, "tutorial.MOV"), "viddata");
    await fs.writeFile(path.join(inbox, "notes.txt"), "textdata");
    await fs.writeFile(path.join(inbox, ".DS_Store"), "macdata");

    const result = await organizeOnce(root);
    assert.equal(result.moved.length, 4, "4ファイル移動");
    assert.equal(result.skipped.length, 1, ".txt がスキップ");

    // 移動後の検証
    const images = await fs.readdir(path.join(root, "ready", "images"));
    const videos = await fs.readdir(path.join(root, "ready", "videos"));
    assert.ok(images.includes("cat.jpg"));
    assert.ok(images.includes("screenshot.PNG"));
    assert.ok(videos.includes("video.mp4"));
    assert.ok(videos.includes("tutorial.MOV"));

    // inbox には .txt と .DS_Store だけ残る
    const remaining = await fs.readdir(inbox);
    assert.deepEqual(remaining.sort(), [".DS_Store", "notes.txt"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

// organizeOnce — 衝突解決
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-organize-collision-"));
  try {
    const inbox = path.join(root, "inbox");
    const images = path.join(root, "ready", "images");
    await fs.mkdir(inbox, { recursive: true });
    await fs.mkdir(images, { recursive: true });

    // 同名ファイル既存
    await fs.writeFile(path.join(images, "cat.jpg"), "old");
    await fs.writeFile(path.join(inbox, "cat.jpg"), "new");

    await organizeOnce(root);
    const list = (await fs.readdir(images)).sort();
    assert.deepEqual(list, ["cat (1).jpg", "cat.jpg"], "衝突時に番号付与");
    const old = await fs.readFile(path.join(images, "cat.jpg"), "utf8");
    const fresh = await fs.readFile(path.join(images, "cat (1).jpg"), "utf8");
    assert.equal(old, "old", "既存ファイルは保護される");
    assert.equal(fresh, "new", "新規ファイルが (1) として入る");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

// organizeOnce — dryRun
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-organize-dry-"));
  try {
    const inbox = path.join(root, "inbox");
    await fs.mkdir(inbox, { recursive: true });
    await fs.writeFile(path.join(inbox, "x.jpg"), "data");

    const result = await organizeOnce(root, { dryRun: true });
    assert.equal(result.moved.length, 1);
    assert.equal(result.moved[0].dryRun, true);
    // ファイルは inbox に残ったまま
    const remaining = await fs.readdir(inbox);
    assert.deepEqual(remaining, ["x.jpg"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

// organizeOnce — inbox が無い
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-organize-noinbox-"));
  try {
    const result = await organizeOnce(root);
    assert.equal(result.inboxMissing, true);
    assert.equal(result.moved.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

console.log("organize-posts tests passed");
