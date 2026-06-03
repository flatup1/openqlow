import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPublishQueueEntry } from "./queue.js";
import type { DraftRecord } from "../types.js";

const tmp = await mkdtemp(path.join(os.tmpdir(), "openqlow-publish-queue-"));

const record: DraftRecord = {
  id: "FG-20260530-001",
  idea: {
    id: "FG-20260530-001",
    date: "2026-05-30",
    theme: "初心者が最初の一歩を踏み出す日",
    angle: "怖くない格闘技ジム",
    audience: "beginners",
    source: "mma_topic",
    valueConnection: "体験予約につながる安心感を伝える。",
  },
  drafts: [
    {
      id: "FG-20260530-001_threads",
      ideaId: "FG-20260530-001",
      approvalId: "FG-20260530-001",
      platform: "threads",
      publicationLevel: "level_2_draft",
      body: "格闘技が初めてでも、最初の一歩はやさしくて大丈夫です。",
      hashtags: ["FLATUPGYM"],
      cta: "体験は公式LINEからお気軽にどうぞ。",
      safetyNotes: [],
      createdAt: "2026-05-30T00:00:00.000Z",
    },
  ],
  status: "pending_approval",
  approvalMessage: "投稿候補です。",
  createdAt: "2026-05-30T00:00:00.000Z",
  updatedAt: "2026-05-30T00:00:00.000Z",
};

const file = await createPublishQueueEntry(tmp, record, ["threads", "google_business", "line_voom"], new Date("2026-05-30T00:00:00.000Z"), {
  mediaFiles: ["/tmp/flatup.mp4"],
});
const json = JSON.parse(await readFile(file, "utf8"));

assert.equal(json.recordId, "FG-20260530-001");
assert.equal(json.status, "queued_for_owner");
assert.deepEqual(json.destinations, ["threads", "google_business", "line_voom"]);
assert.deepEqual(json.mediaFiles, ["/tmp/flatup.mp4"]);
assert.deepEqual(json.sourceDraftIds, ["FG-20260530-001_threads"]);
assert.equal(json.instructions.threads.mode, "api_or_browser_assist");
assert.equal(json.instructions.google_business.mode, "api_setup_required");
assert.equal(json.instructions.line_voom.mode, "browser_assist_only");
assert(json.instructions.google_business.requiredEnvKeys.includes("GOOGLE_BUSINESS_LOCATION_ID"));
assert(json.instructions.threads.requiredEnvKeys.includes("THREADS_ACCESS_TOKEN"));
assert(json.instructions.line_voom.humanFinalClickRequired);

await rm(tmp, { recursive: true, force: true });

console.log("publish queue tests passed");
