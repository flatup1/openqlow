import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadRecord } from "../state/file_store.js";
import type { PlatformDraft } from "../types.js";
import type { PublishDestination, PublishQueueEntry } from "./publisher_types.js";

const LABELS: Record<PublishDestination, string> = {
  threads: "Threads",
  google_business: "Google Business Profile",
  line_voom: "LINE VOOM",
};

const URLS: Record<PublishDestination, string> = {
  threads: "https://www.threads.net/",
  google_business: "https://business.google.com/",
  line_voom: "https://manager.line.biz/",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function textForDraft(draft: PlatformDraft): string {
  return [
    draft.title ?? "",
    draft.body,
    draft.hashtags.length ? draft.hashtags.map(tag => `#${tag}`).join(" ") : "",
    draft.cta,
  ].filter(Boolean).join("\n\n");
}

function draftForDestination(drafts: PlatformDraft[], destination: PublishDestination): PlatformDraft {
  if (destination === "threads") return drafts.find(draft => draft.platform === "threads") ?? drafts[0]!;
  return drafts[0]!;
}

async function loadQueue(root: string, id: string): Promise<PublishQueueEntry> {
  const text = await readFile(path.join(root, "state", "publish_queue", `${id}.json`), "utf8");
  return JSON.parse(text) as PublishQueueEntry;
}

function renderCard(destination: PublishDestination, draft: PlatformDraft): string {
  const label = LABELS[destination];
  const url = URLS[destination];
  const text = textForDraft(draft);
  return `
    <section class="card">
      <div class="card-head">
        <h2>${escapeHtml(label)}</h2>
        <a class="open" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">開く</a>
      </div>
      <textarea readonly>${escapeHtml(text)}</textarea>
      <button type="button" data-copy="${escapeHtml(text)}">本文をコピー</button>
    </section>`;
}

export async function createBrowserPanel(root: string, id: string): Promise<string> {
  const queue = await loadQueue(root, id);
  const record = await loadRecord(root, id);
  if (!record) throw new Error(`Record not found: ${id}`);

  const cards = queue.destinations
    .map(destination => renderCard(destination, draftForDestination(record.drafts, destination)))
    .join("\n");

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>openQLOW Publish Assist - ${escapeHtml(id)}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f6f7f8; color: #1f2933; }
    main { max-width: 980px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .warning { background: #fff7ed; border: 1px solid #fed7aa; padding: 12px; border-radius: 8px; margin: 16px 0 20px; font-weight: 700; }
    .grid { display: grid; gap: 16px; }
    .card { background: white; border: 1px solid #d9e2ec; border-radius: 8px; padding: 16px; }
    .card-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    h2 { font-size: 18px; margin: 0; }
    .open, button { border: 1px solid #9fb3c8; background: #102a43; color: white; border-radius: 6px; padding: 9px 12px; text-decoration: none; font-size: 14px; cursor: pointer; }
    textarea { box-sizing: border-box; width: 100%; min-height: 190px; margin: 12px 0; border: 1px solid #bcccdc; border-radius: 6px; padding: 12px; font-size: 15px; line-height: 1.6; resize: vertical; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <h1>openQLOW Publish Assist - ${escapeHtml(id)}</h1>
    <div class="warning">最終投稿ボタンは押さない。公開前にオーナーが画面上で内容を確認する。</div>
    <div class="grid">${cards}</div>
  </main>
  <script>
    document.querySelectorAll("button[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        await navigator.clipboard.writeText(button.dataset.copy || "");
        button.textContent = "コピー済み";
      });
    });
  </script>
</body>
</html>
`;

  const dir = path.join(root, "state", "publish_assist");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}.html`);
  await writeFile(file, html, "utf8");
  return file;
}
