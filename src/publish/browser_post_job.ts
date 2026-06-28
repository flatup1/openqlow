import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadRecord } from "../state/file_store.js";
import type { PlatformDraft } from "../types.js";
import type { PublishDestination, PublishQueueEntry } from "./publisher_types.js";

const BROWSER_DESTINATION_URLS: Record<PublishDestination, string> = {
  threads: "https://www.threads.net/",
  google_business: "https://business.google.com/",
  line_voom: "https://manager.line.biz/",
  instagram: "https://www.instagram.com/",
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
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.json`), `${JSON.stringify({ recordId: id, jobs }, null, 2)}\n`, "utf8");
  return jobs;
}
