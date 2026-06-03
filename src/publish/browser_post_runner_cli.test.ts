import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { saveRecord } from "../state/file_store.js";
import { createPublishQueueEntry } from "./queue.js";
import { enqueueBrowserPostJobs } from "./browser_post_job.js";
import { runBrowserPostRunnerCli } from "./browser_post_runner_cli.js";

const root = await mkdtemp(path.join(tmpdir(), "openqlow-browser-post-runner-cli-"));
process.env.OPENQLOW_ROOT = root;

const record: DraftRecord = {
  id: "FG-20260603-005",
  idea: {
    id: "FG-20260603-005",
    date: "2026-06-03",
    theme: "browser runner cli",
    angle: "test",
    audience: "local_narita",
    source: "obsidian_inbox",
    valueConnection: "test",
  },
  drafts: [{
    id: "FG-20260603-005_line",
    ideaId: "FG-20260603-005",
    approvalId: "FG-20260603-005",
    platform: "line",
    publicationLevel: "level_2_draft",
    body: "FLATUP GYM browser runner cli test",
    hashtags: ["FLATUPGYM"],
    cta: "",
    safetyNotes: [],
    createdAt: "2026-06-03T00:00:00.000Z",
  }],
  mediaFiles: ["/tmp/post.mp4"],
  status: "saved",
  approvalMessage: "投稿候補です。",
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
};

await saveRecord(root, record);
await createPublishQueueEntry(root, record, ["line_voom"], new Date("2026-06-03T00:00:00.000Z"), {
  mediaFiles: record.mediaFiles,
});
await enqueueBrowserPostJobs(root, record.id, ["line_voom"], new Date("2026-06-03T06:00:00.000Z"));

const result = await runBrowserPostRunnerCli(record.id, {
  now: new Date("2026-06-03T06:10:00.000Z"),
});

assert.equal(result.ok, false);
assert.equal(result.result.published.length, 0);
assert.equal(result.result.failed.length, 1);
assert.match(result.message, /実ブラウザ投稿アダプタ未接続/);

const saved = JSON.parse(await readFile(path.join(root, "state", "browser_post_jobs", `${record.id}.json`), "utf8"));
assert.equal(saved.jobs[0].status, "failed");
assert.match(saved.jobs[0].error, /実ブラウザ投稿アダプタ未接続/);
assert.deepEqual(saved.jobs[0].mediaFiles, ["/tmp/post.mp4"]);

await enqueueBrowserPostJobs(root, record.id, ["line_voom"], new Date("2026-06-03T06:20:00.000Z"));
process.env.OPENQLOW_BROWSER_POSTER_CMD = "/tmp/fake-browser-poster";
const commandResult = await runBrowserPostRunnerCli(record.id, {
  now: new Date("2026-06-03T06:30:00.000Z"),
  runCommand: async (_command, _args) => JSON.stringify({ externalId: "line_voom-live-1" }),
});
delete process.env.OPENQLOW_BROWSER_POSTER_CMD;

assert.equal(commandResult.ok, true);
assert.deepEqual(commandResult.result.published.map(item => item.externalId), ["line_voom-live-1"]);

console.log("browser post runner cli tests passed");
