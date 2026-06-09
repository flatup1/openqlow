import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { saveRecord, loadRecord } from "../state/file_store.js";
import { applyLineMedia, extFromContentType, fetchLineContent } from "./line_media.js";

function testExtFromContentType(): void {
  assert.equal(extFromContentType("image/jpeg", "image"), ".jpg");
  assert.equal(extFromContentType("image/png", "image"), ".png");
  assert.equal(extFromContentType("video/mp4", "video"), ".mp4");
  assert.equal(extFromContentType("video/quicktime", "video"), ".mov");
  assert.equal(extFromContentType("application/octet-stream", "video"), ".mp4"); // fallback by type
  assert.equal(extFromContentType(null, "image"), ".jpg");
  assert.equal(extFromContentType("image/jpeg; charset=binary", "image"), ".jpg");
}

function fakeFetch(bytes: Uint8Array, contentType: string, status = 200): typeof fetch {
  const body = (status === 200 ? bytes : null) as unknown as BodyInit | null;
  return (async () => new Response(body, {
    status,
    headers: { "content-type": contentType },
  })) as unknown as typeof fetch;
}

async function testFetchLineContentRejectsNon200(): Promise<void> {
  await assert.rejects(() => fetchLineContent("mid", "tok", fakeFetch(new Uint8Array(), "", 404)));
}

function pendingRecord(id: string): DraftRecord {
  const now = "2026-06-09T00:00:00.000Z";
  return {
    id,
    idea: { id, date: "2026-06-09", theme: "t", angle: "a", audience: "beginners", source: "rotation", valueConnection: "v" },
    drafts: [
      { id: `${id}-t`, ideaId: id, approvalId: id, platform: "threads", publicationLevel: "level_2_draft", body: "本文", hashtags: [], cta: "c", safetyNotes: [], createdAt: now },
    ],
    status: "pending_approval",
    approvalMessage: "m",
    createdAt: now,
    updatedAt: now,
  };
}

async function testAttachLineMedia(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-linemedia-"));
  try {
    const media = path.join(root, "media");

    // 添付先が無ければ失敗
    const noPending = await applyLineMedia({
      root, mediaDir: media, messageId: "m1", messageType: "image", token: "tok",
      fetchImpl: fakeFetch(new Uint8Array([1, 2, 3]), "image/jpeg"),
    });
    assert.equal(noPending.ok, false);
    assert.match(noPending.message, /投稿候補がありません/);

    await saveRecord(root, pendingRecord("FG-20260609-001"));

    // トークン無し
    const noToken = await applyLineMedia({ root, mediaDir: media, messageId: "m1", messageType: "image", token: "" });
    assert.equal(noToken.ok, false);

    // 正常添付
    const ok = await applyLineMedia({
      root, mediaDir: media, messageId: "m1", messageType: "image", token: "tok",
      fetchImpl: fakeFetch(new Uint8Array([1, 2, 3, 4]), "image/png"),
      now: new Date("2026-06-09T01:00:00.000Z"),
    });
    assert.equal(ok.ok, true);
    assert.match(ok.message, /受け取りました/);
    assert.match(ok.message, /\.png/);

    const saved = await readdir(media);
    assert.equal(saved.length, 1);
    assert.match(saved[0], /^FG-20260609-001-\d+\.png$/);

    const updated = await loadRecord(root, "FG-20260609-001");
    assert.equal(updated?.mediaFiles?.length, 1);
    assert.match(updated!.mediaFiles![0], /\.png$/);

    // サイズ超過は拒否（保存しない）
    const tooBig = await applyLineMedia({
      root, mediaDir: media, messageId: "m2", messageType: "image", token: "tok",
      fetchImpl: fakeFetch(new Uint8Array([1, 2, 3, 4, 5]), "image/jpeg"),
      maxBytes: 2,
    });
    assert.equal(tooBig.ok, false);
    assert.match(tooBig.message, /大きすぎ/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

testExtFromContentType();
await testFetchLineContentRejectsNon200();
await testAttachLineMedia();

console.log("line media tests passed");
