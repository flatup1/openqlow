import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readJsonIfExists, writeJsonAtomic } from "../state/atomic_json.js";
import { loadRecord } from "../state/file_store.js";
import type { PlatformDraft } from "../types.js";
import { enqueueBrowserPostJobs, type BrowserPostJob } from "./browser_post_job.js";
import type { PublishDestination, PublishQueueEntry } from "./publisher_types.js";
import { resolvePublicMediaUrl } from "./public_media.js";
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

function resultFile(root: string, id: string): string {
  return path.join(root, "state", "publish_results", `${id}.json`);
}

async function saveResult(root: string, result: FinalPublishResult): Promise<void> {
  await mkdir(path.dirname(resultFile(root, result.recordId)), { recursive: true });
  await writeJsonAtomic(resultFile(root, result.recordId), result);
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

  // 前回の結果を引き継ぐ。すでに投稿した宛先へは、もう一度投稿しない。
  // 読めない結果ファイルは「まだ投稿していない」とは限らないので、例外のまま止める。
  const previous = await readJsonIfExists<FinalPublishResult>(resultFile(root, id));

  const result: FinalPublishResult = {
    recordId: id,
    published: previous?.published ? [...previous.published] : [],
    browserQueued: [],
    skipped: [],
    createdAt: new Date().toISOString(),
  };

  const browserDestinations: PublishDestination[] = [];

  for (const destination of queue.destinations) {
    if (destination === "threads") {
      if (result.published.some(item => item.destination === destination)) continue;
      const mediaFile = queue.mediaFiles?.[0];
      if (queue.mediaFiles && queue.mediaFiles.length > 1) {
        browserDestinations.push(destination);
        continue;
      }
      const mediaUrl = mediaFile ? await resolvePublicMediaUrl(mediaFile, env) : undefined;
      if (mediaFile && !isThreadsImageUrl(mediaUrl ?? "")) {
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
      const published = mediaUrl
        ? await publishThreadsImage({
          userId,
          accessToken,
          text,
          imageUrl: mediaUrl,
          fetchImpl: opts.fetchImpl,
        })
        : await publishThreadsText({
          userId,
          accessToken,
          text,
          fetchImpl: opts.fetchImpl,
        });
      result.published.push({ destination, externalId: published.postId });
      // 投稿できたらすぐ記録する。あとの処理で落ちても、再実行で二重投稿しない。
      await saveResult(root, result);
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
