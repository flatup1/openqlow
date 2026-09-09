import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserPostJob } from "./browser_post_job.js";

type BrowserPostStatus = BrowserPostJob["status"] | "published" | "failed";

interface StoredBrowserPostJob extends Omit<BrowserPostJob, "status"> {
  status: BrowserPostStatus;
  externalId?: string;
  publishedAt?: string;
  error?: string;
}

interface StoredBrowserPostJobs {
  recordId: string;
  jobs: StoredBrowserPostJob[];
}

export interface BrowserPostAdapter {
  publish(job: BrowserPostJob): Promise<{ externalId: string }>;
}

export interface BrowserPostRunnerOptions extends BrowserPostAdapter {
  now?: Date;
}

export interface BrowserPostRunnerResult {
  recordId: string;
  published: Array<{ destination: BrowserPostJob["destination"]; externalId: string }>;
  failed: Array<{ destination: BrowserPostJob["destination"]; reason: string }>;
}

async function loadJobs(root: string, id: string): Promise<StoredBrowserPostJobs> {
  const text = await readFile(path.join(root, "state", "browser_post_jobs", `${id}.json`), "utf8");
  return JSON.parse(text) as StoredBrowserPostJobs;
}

async function saveJobs(root: string, id: string, data: StoredBrowserPostJobs): Promise<void> {
  const file = path.join(root, "state", "browser_post_jobs", `${id}.json`);
  // いったん隣へ書いてから置き換える。書いている途中で落ちても、
  // 読めない壊れたファイルが残らない。読めなくなると、何を投稿済みか
  // 分からないまま再実行することになる。
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

function asPendingJob(job: StoredBrowserPostJob): BrowserPostJob {
  return {
    recordId: job.recordId,
    destination: job.destination,
    status: "queued_for_mac_browser",
    url: job.url,
    text: job.text,
    mediaFiles: job.mediaFiles,
    finalClickAllowed: job.finalClickAllowed,
    createdAt: job.createdAt,
  };
}

export async function runBrowserPostJobs(
  root: string,
  id: string,
  opts: BrowserPostRunnerOptions,
): Promise<BrowserPostRunnerResult> {
  const data = await loadJobs(root, id);
  const publishedAt = (opts.now ?? new Date()).toISOString();
  const result: BrowserPostRunnerResult = {
    recordId: id,
    published: [],
    failed: [],
  };

  for (const job of data.jobs) {
    if (job.status !== "queued_for_mac_browser") continue;

    try {
      const posted = await opts.publish(asPendingJob(job));
      job.status = "published";
      job.externalId = posted.externalId;
      job.publishedAt = publishedAt;
      delete job.error;
      result.published.push({ destination: job.destination, externalId: posted.externalId });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      job.status = "failed";
      job.error = reason;
      result.failed.push({ destination: job.destination, reason });
    }

    // 1件ごとに書き出す。
    //
    // まとめて最後に書いていたため、途中で落ちると「投稿済みなのに
    // 記録は未投稿」になった。実際に途中でディスクを見るとこうなっていた:
    //
    //   1件目を公開したあとの、ディスク上の状態:
    //     instagram: queued_for_mac_browser   ← もう投稿されている
    //     threads:   queued_for_mac_browser
    //     x:         queued_for_mac_browser
    //
    // ここでプロセスが落ちると、再実行で instagram へ二重投稿する。
    // 公式アカウントへの二重投稿は、あとから静かには消せない。
    //
    // 記録できないまま投稿を続けると、二重投稿が増えるだけなので、
    // ここで失敗したら例外はそのまま外へ出す（残りは投稿しない）。
    await saveJobs(root, id, data);
  }

  return result;
}
