import { loadConfig } from "../config.js";
import { exportPendingBrowserJobs } from "./browser_jobs_export.js";

// `npm run browser:jobs` で実行。ブラウザで投稿待ちのジョブを一覧する。
// --json を付けるとブラウザエージェント（CODEX等）がそのまま読めるJSONを出す。
const asJson = process.argv.includes("--json");
const config = loadConfig();
const { jobs, warnings } = await exportPendingBrowserJobs(config.root);

if (asJson) {
  console.log(JSON.stringify({ jobs, warnings }, null, 2));
} else if (!jobs.length) {
  console.log("ブラウザ投稿待ちはありません。");
} else {
  console.log(`ブラウザ投稿待ち: ${jobs.length}件`);
  for (const job of jobs) {
    console.log("");
    console.log(`--- ${job.recordId} / ${job.destination} ---`);
    console.log(`URL: ${job.url}`);
    console.log(`画像: ${job.mediaUrls.length ? job.mediaUrls.join(" , ") : "なし"}`);
    console.log("本文:");
    console.log(job.text);
    console.log(`完了時: npm run browser:done -- ${job.recordId} ${job.destination} <投稿URLかID>`);
  }
}

for (const warning of warnings) {
  console.error(`⚠️ ${warning}`);
}
