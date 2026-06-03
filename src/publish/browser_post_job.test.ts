import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { saveRecord } from "../state/file_store.js";
import { createPublishQueueEntry } from "./queue.js";
import { enqueueBrowserPostJobs } from "./browser_post_job.js";

const root = await mkdtemp(path.join(tmpdir(), "openqlow-browser-post-job-"));
const record: DraftRecord = {
  id: "FG-20260603-003",
  idea: {
    id: "FG-20260603-003",
    date: "2026-06-03",
    theme: "browser final post",
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
    body: "FLATUP GYM browser final post test",
    hashtags: ["FLATUPGYM"],
    cta: "体験はLINEからどうぞ。",
    safetyNotes: [],
    createdAt: "2026-06-03T00:00:00.000Z",
  }],
  status: "saved",
  approvalMessage: "投稿候補です。",
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
};

await saveRecord(root, record);
await createPublishQueueEntry(root, record, ["google_business", "threads", "line_voom"], new Date("2026-06-03T00:00:00.000Z"), {
  mediaFiles: ["/tmp/post.mp4"],
});

const jobs = await enqueueBrowserPostJobs(root, "FG-20260603-003", ["google_business", "line_voom"], new Date("2026-06-03T06:00:00.000Z"));

assert.equal(jobs.length, 2);
assert.deepEqual(jobs.map(job => job.destination), ["google_business", "line_voom"]);
assert(jobs.every(job => job.status === "queued_for_mac_browser"));
assert(jobs.every(job => job.finalClickAllowed === true));
assert.deepEqual(jobs[0].mediaFiles, ["/tmp/post.mp4"]);
assert(jobs[0].text.includes("FLATUP GYM browser final post test"));
assert(jobs[0].text.includes("#FLATUPGYM"));

const saved = JSON.parse(await readFile(path.join(root, "state", "browser_post_jobs", "FG-20260603-003.json"), "utf8"));
assert.deepEqual(saved.jobs.map((job: { destination: string }) => job.destination), ["google_business", "line_voom"]);
assert.equal(saved.jobs[0].createdAt, "2026-06-03T06:00:00.000Z");

console.log("browser post job tests passed");
