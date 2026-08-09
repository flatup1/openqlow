import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserPostJob } from "./browser_post_job.js";
import type { PublishDestination } from "./publisher_types.js";

type StoredStatus = BrowserPostJob["status"] | "published" | "failed";

interface StoredBrowserPostJob extends Omit<BrowserPostJob, "status"> {
  status: StoredStatus;
  externalId?: string;
  publishedAt?: string;
  error?: string;
}

interface StoredBrowserPostJobs {
  recordId: string;
  jobs: StoredBrowserPostJob[];
}

export interface CompleteBrowserJobInput {
  recordId: string;
  destination: PublishDestination;
  externalId?: string;
  error?: string;
  now?: Date;
}

export interface CompleteBrowserJobResult {
  recordId: string;
  destination: PublishDestination;
  status: "published" | "failed";
  externalId?: string;
  alreadyCompleted: boolean;
}

/**
 * ブラウザエージェント（CODEX等）が画面で投稿し終えた結果を書き戻す。
 * 「投稿できた」と言われた時だけ published にし、失敗は理由付きで failed に残す。
 * 同じ投稿先を二重に完了させても状態は壊さず、alreadyCompleted で知らせる。
 */
export async function completeBrowserJob(
  root: string,
  input: CompleteBrowserJobInput,
): Promise<CompleteBrowserJobResult> {
  const file = path.join(root, "state", "browser_post_jobs", `${input.recordId}.json`);
  const text = await readFile(file, "utf8").catch(() => undefined);
  if (text === undefined) throw new Error(`ブラウザ投稿ジョブが見つかりません: ${input.recordId}`);

  const data = JSON.parse(text) as StoredBrowserPostJobs;
  const job = data.jobs?.find(item => item.destination === input.destination);
  if (!job) throw new Error(`投稿先が見つかりません: ${input.recordId} / ${input.destination}`);

  const alreadyCompleted = job.status !== "queued_for_mac_browser";
  const completedAt = (input.now ?? new Date()).toISOString();

  if (input.error) {
    job.status = "failed";
    job.error = input.error;
    delete job.externalId;
    delete job.publishedAt;
  } else {
    job.status = "published";
    job.externalId = input.externalId ?? "browser";
    job.publishedAt = completedAt;
    delete job.error;
  }

  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  return {
    recordId: input.recordId,
    destination: input.destination,
    status: job.status === "failed" ? "failed" : "published",
    externalId: job.externalId,
    alreadyCompleted,
  };
}
