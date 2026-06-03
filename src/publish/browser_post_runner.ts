import { readFile, writeFile } from "node:fs/promises";
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
  await writeFile(path.join(root, "state", "browser_post_jobs", `${id}.json`), `${JSON.stringify(data, null, 2)}\n`, "utf8");
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
  }

  await saveJobs(root, id, data);
  return result;
}
