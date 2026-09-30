import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readJsonIfExists, writeJsonAtomic } from "../state/atomic_json.js";
import { loadRecord } from "../state/file_store.js";
import type { PlatformDraft } from "../types.js";
import type { PublishDestination, PublishQueueEntry } from "./publisher_types.js";

const BROWSER_DESTINATION_URLS: Record<PublishDestination, string> = {
  threads: "https://www.threads.net/",
  google_business: "https://business.google.com/",
  line_voom: "https://manager.line.biz/",
};

export interface BrowserPostJob {
  recordId: string;
  destination: PublishDestination;
  status: "queued_for_mac_browser";
  url: string;
  text: string;
  mediaFiles: string[];
  finalClickAllowed: boolean;
  createdAt: string;
}

function draftText(draft: PlatformDraft): string {
  return [
    draft.title ?? "",
    draft.body,
    draft.hashtags.length ? draft.hashtags.map(tag => `#${tag}`).join(" ") : "",
    draft.cta,
  ].filter(Boolean).join("\n\n");
}

function draftForBrowserDestination(drafts: PlatformDraft[], destination: PublishDestination): PlatformDraft {
  if (destination === "line_voom") return drafts.find(draft => draft.platform === "line") ?? drafts[0]!;
  return drafts[0]!;
}

async function loadQueue(root: string, id: string): Promise<PublishQueueEntry> {
  const text = await readFile(path.join(root, "state", "publish_queue", `${id}.json`), "utf8");
  return JSON.parse(text) as PublishQueueEntry;
}

export async function enqueueBrowserPostJobs(
  root: string,
  id: string,
  destinations: PublishDestination[],
  now = new Date(),
): Promise<BrowserPostJob[]> {
  const queue = await loadQueue(root, id);
  const record = await loadRecord(root, id);
  if (!record) throw new Error(`Record not found: ${id}`);

  const allowed = new Set(queue.destinations);
  const createdAt = now.toISOString();
  const jobs: BrowserPostJob[] = destinations
    .filter(destination => allowed.has(destination))
    .map(destination => ({
      recordId: id,
      destination,
      status: "queued_for_mac_browser",
      url: BROWSER_DESTINATION_URLS[destination],
      text: draftText(draftForBrowserDestination(record.drafts, destination)),
      mediaFiles: queue.mediaFiles ?? [],
      finalClickAllowed: true,
      createdAt,
    }));

  const dir = path.join(root, "state", "browser_post_jobs");
  const file = path.join(dir, `${id}.json`);
  await mkdir(dir, { recursive: true });

  // すでに投稿済みの仕事は消さない。
  // 作り直した「未投稿」で上書きすると、投稿済みの記録が消えて二重投稿になる。
  // 読めないファイルは「無い」と同じに扱わず、例外のまま止める。
  const existing = await readJsonIfExists<{ jobs?: Array<{ destination: PublishDestination; status: string }> }>(file);
  const kept = (existing?.jobs ?? []).filter(job => job.status === "published");
  const keptDestinations = new Set(kept.map(job => job.destination));
  const fresh = jobs.filter(job => !keptDestinations.has(job.destination));
  const untouched = (existing?.jobs ?? []).filter(job => job.status !== "published" && !jobs.some(j => j.destination === job.destination));

  await writeJsonAtomic(file, { recordId: id, jobs: [...kept, ...untouched, ...fresh] });
  return fresh;
}
