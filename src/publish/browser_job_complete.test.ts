import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { completeBrowserJob } from "./browser_job_complete.js";

const root = await mkdtemp(path.join(tmpdir(), "openqlow-browser-job-complete-"));
const jobsDir = path.join(root, "state", "browser_post_jobs");
await mkdir(jobsDir, { recursive: true });

const file = path.join(jobsDir, "post-1.json");
async function reset(): Promise<void> {
  await writeFile(file, JSON.stringify({
    recordId: "post-1",
    jobs: [
      {
        recordId: "post-1",
        destination: "google_business",
        status: "queued_for_mac_browser",
        url: "https://business.google.com/",
        text: "おはようございます",
        mediaFiles: [],
        finalClickAllowed: true,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      {
        recordId: "post-1",
        destination: "line_voom",
        status: "queued_for_mac_browser",
        url: "https://manager.line.biz/",
        text: "おはようございます",
        mediaFiles: [],
        finalClickAllowed: true,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  }));
}

await reset();

const now = new Date("2026-08-09T01:00:00.000Z");
const ok = await completeBrowserJob(root, {
  recordId: "post-1",
  destination: "google_business",
  externalId: "gbp-123",
  now,
});
assert.equal(ok.status, "published");
assert.equal(ok.externalId, "gbp-123");
assert.equal(ok.alreadyCompleted, false);

// 完了させた投稿先だけが変わり、他の投稿先は待ちのまま残る。
const afterOk = JSON.parse(await readFile(file, "utf8"));
assert.equal(afterOk.jobs[0].status, "published");
assert.equal(afterOk.jobs[0].publishedAt, now.toISOString());
assert.equal(afterOk.jobs[1].status, "queued_for_mac_browser");

// 二重完了しても壊れず、既に済んでいたことを知らせる。
const again = await completeBrowserJob(root, {
  recordId: "post-1",
  destination: "google_business",
  externalId: "gbp-123",
  now,
});
assert.equal(again.alreadyCompleted, true);
assert.equal(again.status, "published");

// 失敗は理由付きで残し、成功IDは消す。
const failed = await completeBrowserJob(root, {
  recordId: "post-1",
  destination: "line_voom",
  error: "ログインを求められた",
  now,
});
assert.equal(failed.status, "failed");
const afterFail = JSON.parse(await readFile(file, "utf8"));
assert.equal(afterFail.jobs[1].status, "failed");
assert.equal(afterFail.jobs[1].error, "ログインを求められた");
assert.equal(afterFail.jobs[1].externalId, undefined);

await assert.rejects(
  () => completeBrowserJob(root, { recordId: "missing", destination: "threads" }),
  /見つかりません/,
);
await assert.rejects(
  () => completeBrowserJob(root, { recordId: "post-1", destination: "threads" }),
  /投稿先が見つかりません/,
);

await rm(root, { recursive: true, force: true });

console.log("browser job complete tests passed");
