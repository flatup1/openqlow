import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadRecord } from "../state/file_store.js";
import type { PlatformDraft } from "../types.js";
import type { PublishDestination, PublishQueueEntry } from "./publisher_types.js";
import { resolvePublicMediaUrl, type PublicMediaEnv } from "./public_media.js";

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

function destinationStep(destination: PublishDestination): string {
  if (destination === "google_business") return "Googleは画像URLをコピーして、投稿画面で写真に追加します。";
  if (destination === "line_voom") return "LINE VOOMは画像ファイルをアップロードして、本文を貼ります。";
  return "ThreadsはAPI投稿済みでない場合だけ、画面を開いて本文と画像を確認します。";
}

async function loadQueue(root: string, id: string): Promise<PublishQueueEntry> {
  const text = await readFile(path.join(root, "state", "publish_queue", `${id}.json`), "utf8");
  return JSON.parse(text) as PublishQueueEntry;
}

async function renderMediaSection(mediaFiles: string[] = [], env: PublicMediaEnv = process.env): Promise<string> {
  if (mediaFiles.length === 0) {
    return `
    <section class="card media">
      <h2>画像確認</h2>
      <p>画像なし。本文だけ確認します。</p>
    </section>`;
  }

  const items = await Promise.all(mediaFiles.map(async (file, index) => {
    const publicUrl = await resolvePublicMediaUrl(file, env);
    const fileName = path.basename(file);
    const publicLine = publicUrl
      ? `<div class="media-row"><span>画像URL:</span><code>${escapeHtml(publicUrl)}</code><button type="button" data-copy="${escapeHtml(publicUrl)}">画像URLをコピー</button></div>`
      : `<div class="media-row muted">画像URLなし。Googleは手動確認、LINE VOOMはファイルアップロードで進めます。</div>`;
    return `
      <li>
        <strong>${index + 1}. ${escapeHtml(fileName)}</strong>
        <div class="media-row"><span>ファイル:</span><code>${escapeHtml(file)}</code><button type="button" data-copy="${escapeHtml(file)}">ファイルパスをコピー</button></div>
        ${publicLine}
      </li>`;
  }));

  return `
    <section class="card media">
      <h2>画像確認</h2>
      <p>お客様・子ども・女性・会員の映り込みを確認してから投稿します。</p>
      <ul>${items.join("\n")}</ul>
    </section>`;
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
      <p class="step">${escapeHtml(destinationStep(destination))}</p>
      <textarea readonly>${escapeHtml(text)}</textarea>
      <button type="button" data-copy="${escapeHtml(text)}">本文をコピー</button>
    </section>`;
}

export async function createBrowserPanel(
  root: string,
  id: string,
  opts: { env?: PublicMediaEnv } = {},
): Promise<string> {
  const queue = await loadQueue(root, id);
  const record = await loadRecord(root, id);
  if (!record) throw new Error(`Record not found: ${id}`);

  const mediaSection = await renderMediaSection(queue.mediaFiles, opts.env);
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
    .media { margin-bottom: 16px; }
    .media ul { margin: 12px 0 0; padding-left: 18px; display: grid; gap: 12px; }
    .media-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
    .muted { color: #64748b; }
    code { background: #f1f5f9; border: 1px solid #d9e2ec; border-radius: 6px; padding: 6px 8px; overflow-wrap: anywhere; }
    .card-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    h2 { font-size: 18px; margin: 0; }
    .step { background: #eef6ff; border-left: 4px solid #3b82f6; padding: 10px; margin: 12px 0 0; }
    .open, button { border: 1px solid #9fb3c8; background: #102a43; color: white; border-radius: 6px; padding: 9px 12px; text-decoration: none; font-size: 14px; cursor: pointer; }
    textarea { box-sizing: border-box; width: 100%; min-height: 190px; margin: 12px 0; border: 1px solid #bcccdc; border-radius: 6px; padding: 12px; font-size: 15px; line-height: 1.6; resize: vertical; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <h1>openQLOW Publish Assist - ${escapeHtml(id)}</h1>
    <div class="warning">最終投稿ボタンは押さない。公開前にオーナーが画面上で内容を確認する。</div>
    ${mediaSection}
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
