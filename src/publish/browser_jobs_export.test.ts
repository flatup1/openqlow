import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { exportPendingBrowserJobs } from "./browser_jobs_export.js";

const root = await mkdtemp(path.join(tmpdir(), "openqlow-browser-jobs-export-"));
const jobsDir = path.join(root, "state", "browser_post_jobs");
const publicDir = path.join(root, "public", "media");
await mkdir(jobsDir, { recursive: true });
await mkdir(publicDir, { recursive: true });

const imageFile = path.join(publicDir, "morning.jpg");
await writeFile(imageFile, "image");

const env = {
  OPENQLOW_PUBLIC_MEDIA_DIR: publicDir,
  OPENQLOW_PUBLIC_MEDIA_BASE_URL: "https://media.example.com/openqlow/",
};

await writeFile(path.join(jobsDir, "post-1.json"), JSON.stringify({
  recordId: "post-1",
  jobs: [
    {
      recordId: "post-1",
      destination: "google_business",
      status: "queued_for_mac_browser",
      url: "https://business.google.com/",
      text: "おはようございます",
      mediaFiles: [imageFile],
      finalClickAllowed: true,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    {
      recordId: "post-1",
      destination: "line_voom",
      status: "published",
      url: "https://manager.line.biz/",
      text: "済み",
      mediaFiles: [],
      finalClickAllowed: true,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
  ],
}));

await writeFile(path.join(jobsDir, "post-2.json"), JSON.stringify({
  recordId: "post-2",
  jobs: [
    {
      recordId: "post-2",
      destination: "threads",
      status: "queued_for_mac_browser",
      url: "https://www.threads.net/",
      text: "こんにちは",
      mediaFiles: [path.join(publicDir, "missing.jpg")],
      finalClickAllowed: true,
      createdAt: "2026-07-31T00:00:00.000Z",
    },
  ],
}));

await writeFile(path.join(jobsDir, "broken.json"), "{ not json");

const result = await exportPendingBrowserJobs(root, env);

// 未投稿(queued)だけが出る。published は出さない。
assert.deepEqual(result.jobs.map(job => `${job.recordId}:${job.destination}`), [
  "post-2:threads",
  "post-1:google_business",
]);

// ローカルパスではなく公開HTTPS URLに変換されている（別マシンのブラウザから開ける）。
const google = result.jobs.find(job => job.destination === "google_business");
assert.deepEqual(google?.mediaUrls, ["https://media.example.com/openqlow/morning.jpg"]);
assert.equal(google?.missingMediaCount, 0);

// 解決できない画像は握りつぶさず、件数と警告で知らせる。
const threads = result.jobs.find(job => job.destination === "threads");
assert.deepEqual(threads?.mediaUrls, []);
assert.equal(threads?.missingMediaCount, 1);
assert.ok(result.warnings.some(warning => warning.includes("post-2")));
assert.ok(result.warnings.some(warning => warning.includes("broken.json")));

// 公開URL設定が無い場合も落ちずに、画像なしとして返す。
const noEnv = await exportPendingBrowserJobs(root, {});
assert.equal(noEnv.jobs.length, 2);
assert.deepEqual(noEnv.jobs.flatMap(job => job.mediaUrls), []);

// ジョブディレクトリが無くても落ちない。
const empty = await exportPendingBrowserJobs(path.join(root, "nope"), env);
assert.deepEqual(empty.jobs, []);

await rm(root, { recursive: true, force: true });

console.log("browser jobs export tests passed");
