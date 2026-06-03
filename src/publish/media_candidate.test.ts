import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMediaPublishCandidate } from "./media_candidate.js";

const root = await mkdtemp(path.join(tmpdir(), "openqlow-media-candidate-"));
const record = await createMediaPublishCandidate({
  root,
  body: "弱い自分と向き合う練習。今日も一歩ずつ。 #FLATUPGYM #成田",
  mediaFiles: ["/tmp/post.mp4"],
  destinations: ["threads", "line_voom"],
  now: new Date("2026-06-03T07:00:00.000Z"),
});

assert.equal(record.id, "FG-20260603-701");
assert.equal(record.status, "pending_approval");
assert.equal(record.drafts.length, 2);
assert.deepEqual(record.drafts.map(draft => draft.platform), ["threads", "line"]);
assert(record.drafts[0].body.includes("#FLATUPGYM"));
assert(!record.drafts[0].body.includes("#成田"));
assert(record.approvalMessage.includes("メディア: /tmp/post.mp4"));

const saved = JSON.parse(await readFile(path.join(root, "state", "FG-20260603-701.json"), "utf8"));
assert.equal(saved.id, "FG-20260603-701");

console.log("media candidate tests passed");
