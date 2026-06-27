import { loadConfig } from "../config.js";
import { createCommandBrowserPostAdapter } from "./browser_post_command_adapter.js";
import type { BrowserPostJob } from "./browser_post_job.js";
import { runBrowserPostJobs, type BrowserPostRunnerResult } from "./browser_post_runner.js";

export interface BrowserPostRunnerCliOptions {
  now?: Date;
  publish?: (job: BrowserPostJob) => Promise<{ externalId: string }>;
  runCommand?: (command: string, args: string[]) => Promise<string>;
}

export interface BrowserPostRunnerCliResult {
  ok: boolean;
  message: string;
  result: BrowserPostRunnerResult;
}

async function defaultPublish(_job: BrowserPostJob): Promise<{ externalId: string }> {
  throw new Error("実ブラウザ投稿アダプタ未接続。Mac側のChrome操作アダプタを接続してください。");
}

function resolvePublishAdapter(opts: BrowserPostRunnerCliOptions): (job: BrowserPostJob) => Promise<{ externalId: string }> {
  if (opts.publish) return opts.publish;
  const command = process.env.OPENQLOW_BROWSER_POSTER_CMD ?? "";
  if (command) {
    const adapter = createCommandBrowserPostAdapter({
      command,
      run: opts.runCommand,
    });
    return job => adapter.publish(job);
  }
  return defaultPublish;
}

export async function runBrowserPostRunnerCli(
  id: string,
  opts: BrowserPostRunnerCliOptions = {},
): Promise<BrowserPostRunnerCliResult> {
  if (!id.trim()) throw new Error("post id is required");
  const config = loadConfig();
  const result = await runBrowserPostJobs(config.root, id.trim(), {
    publish: resolvePublishAdapter(opts),
    now: opts.now,
  });
  const ok = result.failed.length === 0;
  const message = [
    ok ? "Macブラウザ投稿ランナー完了。" : "Macブラウザ投稿ランナーで未完了があります。",
    `ID: ${result.recordId}`,
    result.published.length ? `投稿済み: ${result.published.map(item => `${item.destination}: ${item.externalId}`).join(" / ")}` : "",
    result.failed.length ? `未完了: ${result.failed.map(item => `${item.destination}: ${item.reason}`).join(" / ")}` : "",
  ].filter(Boolean).join("\n");

  return { ok, message, result };
}
