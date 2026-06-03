import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { saveRecord } from "../state/file_store.js";
import { createPublishQueueEntry } from "./queue.js";
import { enqueueBrowserPostJobs } from "./browser_post_job.js";
import { runBrowserPostJobs } from "./browser_post_runner.js";

const root = await mkdtemp(path.join(tmpdir(), "openqlow-browser-post-runner-"));
const record: DraftRecord = {
  id: "FG-20260603-004",
  idea: {
    id: "FG-20260603-004",
    date: "2026-06-03",
    theme: "browser runner",
    angle: "test",
    audience: "local_narita",
    source: "obsidian_inbox",
    valueConnection: "test",
  },
  drafts: [{
    id: "FG-20260603-004_threads",
    ideaId: "FG-20260603-004",
    approvalId: "FG-20260603-004",
    platform: "threads",
    publicationLevel: "level_2_draft",
    body: "FLATUP GYM browser runner test",
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
await createPublishQueueEntry(root, record, ["google_business", "line_voom"]);
await enqueueBrowserPostJobs(root, "FG-20260603-004", ["google_business", "line_voom"], new Date("2026-06-03T06:00:00.000Z"));

const calls: string[] = [];
const result = await runBrowserPostJobs(root, "FG-20260603-004", {
  publish: async job => {
    calls.push(job.destination);
    return { externalId: `${job.destination}-posted` };
  },
  now: new Date("2026-06-03T06:05:00.000Z"),
});

assert.deepEqual(calls, ["google_business", "line_voom"]);
assert.deepEqual(result.published.map(item => item.destination), ["google_business", "line_voom"]);
assert.equal(result.failed.length, 0);

const saved = JSON.parse(await readFile(path.join(root, "state", "browser_post_jobs", "FG-20260603-004.json"), "utf8"));
assert(saved.jobs.every((job: { status: string }) => job.status === "published"));
assert.deepEqual(saved.jobs.map((job: { externalId: string }) => job.externalId), ["google_business-posted", "line_voom-posted"]);
assert.equal(saved.jobs[0].publishedAt, "2026-06-03T06:05:00.000Z");

console.log("browser post runner tests passed");
