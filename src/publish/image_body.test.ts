import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveRecord } from "../state/file_store.js";
import type { DraftRecord } from "../types.js";
import { rewriteBodyForImage } from "./image_body.js";

const now = "2026-06-17T00:00:00.000Z";
function pending(id: string, mediaFiles?: string[]): DraftRecord {
  return {
    id,
    idea: { id, date: "2026-06-17", theme: "t", angle: "a", audience: "beginners", source: "rotation", valueConnection: "v" },
    drafts: [{ id: `${id}_threads`, ideaId: id, approvalId: id, platform: "threads", publicationLevel: "level_2_draft", body: "元の本文です", hashtags: ["FLATUPGYM"], cta: "", safetyNotes: [], createdAt: now }],
    status: "pending_approval",
    approvalMessage: "m",
    createdAt: now,
    updatedAt: now,
    ...(mediaFiles ? { mediaFiles } : {}),
  };
}

const root = await mkdtemp(path.join(tmpdir(), "openqlow-image-body-"));
const img = path.join(root, "pic.jpg");
await writeFile(img, Buffer.from([0xff, 0xd8, 0xff]));
const env = { OPENROUTER_API_KEY: "sk-or-test" };
const okFetch = (async () =>
  new Response(JSON.stringify({ choices: [{ message: { content: "ミットに向かう一歩が、昨日の自分を少し超える。" } }] }), { status: 200 })) as unknown as typeof fetch;
const failFetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;

// 写真なし → 本文は変えない。
await saveRecord(root, pending("FG-20260617-001"));
assert.equal((await rewriteBodyForImage(root, "FG-20260617-001", env, okFetch)).kind, "kept");

// 写真あり・AI成功 → 本文が写真に合わせたものになる（ハッシュタグは残す）。
await saveRecord(root, pending("FG-20260617-002", [img]));
const updated = await rewriteBodyForImage(root, "FG-20260617-002", env, okFetch);
assert.equal(updated.kind, "updated");
const saved = JSON.parse(await readFile(path.join(root, "state", "FG-20260617-002.json"), "utf8")) as DraftRecord;
assert.match(saved.drafts[0].body, /ミットに向かう/);
assert.deepEqual(saved.drafts[0].hashtags, ["FLATUPGYM"]);

// 写真あり・AI失敗 → 元の本文のまま（事故にしない）。
await saveRecord(root, pending("FG-20260617-003", [img]));
const kept = await rewriteBodyForImage(root, "FG-20260617-003", env, failFetch);
assert.equal(kept.kind, "kept");
const keptSaved = JSON.parse(await readFile(path.join(root, "state", "FG-20260617-003.json"), "utf8")) as DraftRecord;
assert.equal(keptSaved.drafts[0].body, "元の本文です");

await rm(root, { recursive: true, force: true });
console.log("image body tests passed");
