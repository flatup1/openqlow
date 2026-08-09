import { loadConfig } from "../config.js";
import { completeBrowserJob } from "./browser_job_complete.js";
import type { PublishDestination } from "./publisher_types.js";

// `npm run browser:done -- <recordId> <destination> [externalId]` で実行。
// 失敗を記録するときは `--error "理由"` を付ける。
const args = process.argv.slice(2);
const errorIndex = args.indexOf("--error");
const error = errorIndex >= 0 ? args[errorIndex + 1] : undefined;
const positional = errorIndex >= 0 ? args.slice(0, errorIndex) : args;
const [recordId, destination, externalId] = positional;

if (!recordId || !destination) {
  console.error('使い方: npm run browser:done -- <recordId> <destination> [投稿URLかID] [--error "理由"]');
  process.exit(1);
}

const config = loadConfig();
const result = await completeBrowserJob(config.root, {
  recordId,
  destination: destination as PublishDestination,
  externalId,
  error,
});

if (result.status === "published") {
  const note = result.alreadyCompleted ? "（既に完了済みでした）" : "";
  console.log(`✅ 投稿済みとして記録: ${result.recordId} / ${result.destination} → ${result.externalId}${note}`);
} else {
  console.log(`❌ 未投稿として記録: ${result.recordId} / ${result.destination}`);
  process.exitCode = 1;
}
