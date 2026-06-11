import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { saveRecord } from "../state/file_store.js";
import { createPublishQueueEntry } from "./queue.js";
import { runFinalPublish } from "./final_publish.js";

const root = await mkdtemp(path.join(tmpdir(), "openqlow-final-publish-"));
const record: DraftRecord = {
  id: "FG-20260603-003",
  idea: {
    id: "FG-20260603-003",
    date: "2026-06-03",
    theme: "test",
    angle: "test",
    audience: "local_narita",
    source: "obsidian_inbox",
    valueConnection: "test",
  },
  drafts: [{
    id: "FG-20260603-003_threads",
    ideaId: "FG-20260603-003",
    approvalId: "FG-20260603-003",
    platform: "threads",
    publicationLevel: "level_2_draft",
    body: "FLATUP GYM final publish test",
    hashtags: ["FLATUPGYM"],
    cta: "",
    safetyNotes: [],
    createdAt: "2026-06-03T00:00:00.000Z",
  }],
  status: "saved",
  approvalMessage: "投稿候補です。",
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
};
await saveRecord(root, record);
await createPublishQueueEntry(root, record, ["google_business", "threads", "line_voom"]);

const calls: Array<{ url: string; body: string }> = [];
const result = await runFinalPublish(root, "FG-20260603-003", {
  env: {
    THREADS_USER_ID: "27079444471741122",
    THREADS_ACCESS_TOKEN: "token",
  },
  fetchImpl: (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    if (calls.length === 1) return new Response(JSON.stringify({ id: "creation-1" }), { status: 200 });
    return new Response(JSON.stringify({ id: "post-1" }), { status: 200 });
  }) as typeof fetch,
});

assert.equal(result.recordId, "FG-20260603-003");
assert.deepEqual(result.published, [{ destination: "threads", externalId: "post-1" }]);
assert.deepEqual(result.browserQueued.map(item => item.destination), ["google_business", "line_voom"]);
assert(result.browserQueued.every(item => item.status === "queued_for_mac_browser"));
assert.equal(calls.length, 2);

const log = JSON.parse(await readFile(path.join(root, "state", "publish_results", "FG-20260603-003.json"), "utf8"));
assert.equal(log.published[0].externalId, "post-1");
assert.deepEqual(log.browserQueued.map((item: { destination: string }) => item.destination), ["google_business", "line_voom"]);

const browserJobs = JSON.parse(await readFile(path.join(root, "state", "browser_post_jobs", "FG-20260603-003.json"), "utf8"));
assert.equal(browserJobs.jobs.length, 2);

const baseThreadsDraft = record.drafts[0]!;
const imageRecord: DraftRecord = {
  ...record,
  id: "FG-20260603-004",
  drafts: [{
    ...baseThreadsDraft,
    id: "FG-20260603-004_threads",
    ideaId: "FG-20260603-004",
    approvalId: "FG-20260603-004",
  }],
};
await saveRecord(root, imageRecord);
await createPublishQueueEntry(root, imageRecord, ["threads"], new Date("2026-06-03T00:00:00.000Z"), {
  mediaFiles: ["https://example.com/post.jpg"],
});

const imageCalls: Array<{ url: string; body: string }> = [];
const imageResult = await runFinalPublish(root, "FG-20260603-004", {
  env: {
    THREADS_USER_ID: "27079444471741122",
    THREADS_ACCESS_TOKEN: "token",
  },
  fetchImpl: (async (url: string | URL, init?: RequestInit) => {
    imageCalls.push({ url: String(url), body: String(init?.body ?? "") });
    if (imageCalls.length === 1) return new Response(JSON.stringify({ id: "image-creation-1" }), { status: 200 });
    return new Response(JSON.stringify({ id: "image-post-1" }), { status: 200 });
  }) as typeof fetch,
});

assert.deepEqual(imageResult.published, [{ destination: "threads", externalId: "image-post-1" }]);
assert.deepEqual(imageResult.browserQueued, []);
assert.equal(imageCalls.length, 2);
assert.match(imageCalls[0].body, /media_type=IMAGE/);
assert.match(imageCalls[0].body, /image_url=https%3A%2F%2Fexample.com%2Fpost.jpg/);

const localImageRecord: DraftRecord = {
  ...record,
  id: "FG-20260603-005",
  drafts: [{
    ...baseThreadsDraft,
    id: "FG-20260603-005_threads",
    ideaId: "FG-20260603-005",
    approvalId: "FG-20260603-005",
  }],
};
await saveRecord(root, localImageRecord);
await createPublishQueueEntry(root, localImageRecord, ["threads"], new Date("2026-06-03T00:00:00.000Z"), {
  mediaFiles: ["/tmp/post.jpg"],
});

const localImageResult = await runFinalPublish(root, "FG-20260603-005", {
  env: {
    THREADS_USER_ID: "27079444471741122",
    THREADS_ACCESS_TOKEN: "token",
  },
  fetchImpl: (async () => {
    throw new Error("Local media should not call Threads API");
  }) as typeof fetch,
});

assert.deepEqual(localImageResult.published, []);
assert.deepEqual(localImageResult.browserQueued.map(item => item.destination), ["threads"]);

console.log("final publish tests passed");
