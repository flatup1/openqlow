import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

// ---- 投稿するたびに記録する（途中で落ちても二重投稿しない）----
//
// 記録はまとめて最後に書いていた。途中で落ちると
// 「投稿済みなのに記録は未投稿」になり、再実行で二重投稿する。
// 実際に途中でディスクを見るとこうなっていた:
//
//   1件目を公開したあとの、ディスク上の状態:
//     instagram: queued_for_mac_browser   ← もう投稿されている
//     threads:   queued_for_mac_browser
//
// 公式アカウントへの二重投稿は、あとから静かには消せない。
{
  const stepRoot = await mkdtemp(path.join(tmpdir(), "openqlow-browser-post-step-"));
  const id = "FG-20260603-801";
  const dir = path.join(stepRoot, "state", "browser_post_jobs");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}.json`);

  const job = (destination: string) => ({
    recordId: id,
    destination,
    body: "本文",
    hashtags: [],
    mediaFiles: [],
    finalClickAllowed: true,
    createdAt: "2026-06-03T00:00:00.000Z",
    status: "queued_for_mac_browser",
  });
  await writeFile(
    file,
    JSON.stringify({ recordId: id, jobs: [job("google_business"), job("line_voom")] }, null, 2),
    "utf8",
  );

  const seenDuringSecond: string[] = [];
  let calls = 0;
  await runBrowserPostJobs(stepRoot, id, {
    publish: async destination => {
      calls += 1;
      if (calls === 2) {
        // 1件目はもう投稿済み。この瞬間のディスクを見る。
        const onDisk = JSON.parse(await readFile(file, "utf8"));
        for (const stored of onDisk.jobs) seenDuringSecond.push(`${stored.destination}:${stored.status}`);
      }
      return { externalId: `${destination.destination}-posted` };
    },
  });

  assert.deepEqual(
    seenDuringSecond,
    ["google_business:published", "line_voom:queued_for_mac_browser"],
    "1件投稿したらすぐ記録する（落ちても二重投稿しない）",
  );
}

console.log("browser post runner tests passed");
