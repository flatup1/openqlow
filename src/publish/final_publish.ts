import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadRecord } from "../state/file_store.js";
import type { PlatformDraft } from "../types.js";
import { enqueueBrowserPostJobs, type BrowserPostJob } from "./browser_post_job.js";
import type { PublishDestination, PublishQueueEntry } from "./publisher_types.js";
import { publishThreadsImage, publishThreadsText } from "./threads_api.js";

export interface FinalPublishResult {
  recordId: string;
  published: Array<{ destination: PublishDestination; externalId: string }>;
  browserQueued: BrowserPostJob[];
  skipped: Array<{ destination: PublishDestination; reason: string }>;
  createdAt: string;
}

interface FinalPublishOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

function envValue(env: Record<string, string | undefined>, key: string): string {
  return env[key] ?? "";
}

function draftText(draft: PlatformDraft): string {
  return [
    draft.title ?? "",
    draft.body,
    draft.hashtags.length ? draft.hashtags.map(tag => `#${tag}`).join(" ") : "",
    draft.cta,
  ].filter(Boolean).join("\n\n");
}

function threadsDraft(drafts: PlatformDraft[]): PlatformDraft | undefined {
  return drafts.find(draft => draft.platform === "threads") ?? drafts[0];
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isThreadsImageUrl(value: string): boolean {
  return isRemoteUrl(value) && /\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(value);
}

async function loadQueue(root: string, id: string): Promise<PublishQueueEntry> {
  const text = await readFile(path.join(root, "state", "publish_queue", `${id}.json`), "utf8");
  return JSON.parse(text) as PublishQueueEntry;
}

async function saveResult(root: string, result: FinalPublishResult): Promise<void> {
  const dir = path.join(root, "state", "publish_results");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${result.recordId}.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

export async function runFinalPublish(
  root: string,
  id: string,
  opts: FinalPublishOptions = {},
): Promise<FinalPublishResult> {
  const env = opts.env ?? process.env;
  const queue = await loadQueue(root, id);
  const record = await loadRecord(root, id);
  if (!record) throw new Error(`Record not found: ${id}`);

  const result: FinalPublishResult = {
    recordId: id,
    published: [],
    browserQueued: [],
    skipped: [],
    createdAt: new Date().toISOString(),
  };

  const browserDestinations: PublishDestination[] = [];

  for (const destination of queue.destinations) {
    if (destination === "threads") {
      const mediaFile = queue.mediaFiles?.[0];
      if (queue.mediaFiles && queue.mediaFiles.length > 1) {
        browserDestinations.push(destination);
        continue;
      }
      if (mediaFile && !isThreadsImageUrl(mediaFile)) {
        browserDestinations.push(destination);
        continue;
      }
      const userId = envValue(env, "THREADS_USER_ID");
      const accessToken = envValue(env, "THREADS_ACCESS_TOKEN");
      const draft = threadsDraft(record.drafts);
      if (!userId || !accessToken) {
        result.skipped.push({ destination, reason: "THREADS_USER_ID or THREADS_ACCESS_TOKEN is missing" });
        continue;
      }
      if (!draft) {
        result.skipped.push({ destination, reason: "Threads draft is missing" });
        continue;
      }
      const text = draftText(draft);
      const published = mediaFile
        ? await publishThreadsImage({
          userId,
          accessToken,
          text,
          imageUrl: mediaFile,
          fetchImpl: opts.fetchImpl,
        })
        : await publishThreadsText({
          userId,
          accessToken,
          text,
          fetchImpl: opts.fetchImpl,
        });
      result.published.push({ destination, externalId: published.postId });
      continue;
    }

    if (destination === "google_business") {
      browserDestinations.push(destination);
      continue;
    }

    browserDestinations.push(destination);
  }

  if (browserDestinations.length) {
    result.browserQueued = await enqueueBrowserPostJobs(root, id, browserDestinations);
  }

  await saveResult(root, result);
  return result;
}
