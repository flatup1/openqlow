import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadRecord } from "../state/file_store.js";
import type { PlatformDraft } from "../types.js";
import type { PublishDestination, PublishQueueEntry } from "./publisher_types.js";

const DESTINATION_LABELS: Record<PublishDestination, string> = {
  threads: "Threads",
  google_business: "Google Business Profile",
  line_voom: "LINE VOOM",
  instagram: "Instagram",
};

const DESTINATION_URLS: Record<PublishDestination, string> = {
  threads: "https://www.threads.net/",
  google_business: "https://business.google.com/",
  line_voom: "https://manager.line.biz/",
  instagram: "https://www.instagram.com/",
};

function draftText(draft: PlatformDraft): string {
  return [
    draft.title ?? "",
    draft.body,
    draft.hashtags.length ? draft.hashtags.map(tag => `#${tag}`).join(" ") : "",
    draft.cta,
  ].filter(Boolean).join("\n\n");
}

function draftForDestination(drafts: PlatformDraft[], destination: PublishDestination): PlatformDraft {
  if (destination === "threads") {
    return drafts.find(draft => draft.platform === "threads") ?? drafts[0]!;
  }
  return drafts[0]!;
}

function renderDestination(destination: PublishDestination, draft: PlatformDraft): string[] {
  return [
    `## ${DESTINATION_LABELS[destination]}`,
    "",
    `URL: ${DESTINATION_URLS[destination]}`,
    "",
    "貼り付け本文:",
    "",
    "```text",
    draftText(draft),
    "```",
    "",
    "注意: 最終投稿ボタンはオーナーが押す。Codexは公開ボタンを押さない。",
    "",
  ];
}

async function loadQueue(root: string, id: string): Promise<PublishQueueEntry> {
  const file = path.join(root, "state", "publish_queue", `${id}.json`);
  const text = await readFile(file, "utf8");
  return JSON.parse(text) as PublishQueueEntry;
}

export async function createBrowserAssistSheet(root: string, id: string): Promise<string> {
  const queue = await loadQueue(root, id);
  const record = await loadRecord(root, id);
  if (!record) throw new Error(`Record not found: ${id}`);

  const lines = [
    `# Browser Assist - ${id}`,
    "",
    "このシートは投稿補助用です。実投稿は行いません。",
    "最終投稿ボタンはオーナーが押す。",
    "",
  ];

  for (const destination of queue.destinations) {
    lines.push(...renderDestination(destination, draftForDestination(record.drafts, destination)));
  }

  const dir = path.join(root, "state", "publish_assist");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}
