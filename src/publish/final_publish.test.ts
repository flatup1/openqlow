import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

const publicMediaDir = path.join(root, "public", "media");
await mkdir(publicMediaDir, { recursive: true });
const publicMediaFile = path.join(publicMediaDir, "post.jpg");
await writeFile(publicMediaFile, "image");

const publicLocalImageRecord: DraftRecord = {
  ...record,
  id: "FG-20260603-006",
  drafts: [{
    ...baseThreadsDraft,
    id: "FG-20260603-006_threads",
    ideaId: "FG-20260603-006",
    approvalId: "FG-20260603-006",
  }],
};
await saveRecord(root, publicLocalImageRecord);
await createPublishQueueEntry(root, publicLocalImageRecord, ["threads"], new Date("2026-06-03T00:00:00.000Z"), {
  mediaFiles: [publicMediaFile],
});

const publicLocalCalls: Array<{ url: string; body: string }> = [];
const publicLocalImageResult = await runFinalPublish(root, "FG-20260603-006", {
  env: {
    THREADS_USER_ID: "27079444471741122",
    THREADS_ACCESS_TOKEN: "token",
    OPENQLOW_PUBLIC_MEDIA_DIR: publicMediaDir,
    OPENQLOW_PUBLIC_MEDIA_BASE_URL: "https://media.example.com/openqlow/",
  },
  fetchImpl: (async (url: string | URL, init?: RequestInit) => {
    publicLocalCalls.push({ url: String(url), body: String(init?.body ?? "") });
    if (publicLocalCalls.length === 1) return new Response(JSON.stringify({ id: "public-image-creation-1" }), { status: 200 });
    return new Response(JSON.stringify({ id: "public-image-post-1" }), { status: 200 });
  }) as typeof fetch,
});

assert.deepEqual(publicLocalImageResult.published, [{ destination: "threads", externalId: "public-image-post-1" }]);
assert.deepEqual(publicLocalImageResult.browserQueued, []);
assert.match(publicLocalCalls[0].body, /media_type=IMAGE/);
assert.match(publicLocalCalls[0].body, /image_url=https%3A%2F%2Fmedia.example.com%2Fopenqlow%2Fpost.jpg/);

// 1つの投稿先(Threads API)が例外を投げても、全体を巻き込んで落とさず、
// その投稿先は skipped に理由付きで記録し、他の投稿先(ブラウザ)は続行し、結果も保存する。
const resilientRecord: DraftRecord = {
  ...record,
  id: "FG-20260603-007",
  drafts: [{
    ...baseThreadsDraft,
    id: "FG-20260603-007_threads",
    ideaId: "FG-20260603-007",
    approvalId: "FG-20260603-007",
  }],
};
await saveRecord(root, resilientRecord);
await createPublishQueueEntry(root, resilientRecord, ["threads", "line_voom"]);

const resilientResult = await runFinalPublish(root, "FG-20260603-007", {
  env: {
    THREADS_USER_ID: "27079444471741122",
    THREADS_ACCESS_TOKEN: "expired",
  },
  fetchImpl: (async () =>
    new Response(JSON.stringify({ error: { message: "Invalid OAuth access token." } }), { status: 401 })) as typeof fetch,
});

assert.deepEqual(resilientResult.published, [], "失敗した投稿先は published に入らない");
assert.equal(resilientResult.skipped.length, 1, "Threadsの失敗は skipped に1件記録される");
assert.equal(resilientResult.skipped[0].destination, "threads");
assert.match(resilientResult.skipped[0].reason, /Invalid OAuth access token|Threads API 401/);
assert.deepEqual(resilientResult.browserQueued.map(item => item.destination), ["line_voom"], "他の投稿先は続行する");

// 例外が起きても結果ファイルは必ず保存される（webhookが落ちて沈黙しない）。
const resilientLog = JSON.parse(
  await readFile(path.join(root, "state", "publish_results", "FG-20260603-007.json"), "utf8"),
);
assert.equal(resilientLog.skipped[0].destination, "threads");

console.log("final publish tests passed");
