import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserPanel } from "./browser_panel.js";
import { createPublishQueueEntry } from "./queue.js";
import { saveRecord } from "../state/file_store.js";
import type { DraftRecord } from "../types.js";

const tmp = await mkdtemp(path.join(os.tmpdir(), "openqlow-browser-panel-"));

const record: DraftRecord = {
  id: "FG-20260530-004",
  idea: {
    id: "FG-20260530-004",
    date: "2026-05-30",
    theme: "親子で成長",
    angle: "子どもの自信",
    audience: "kids_parents",
    source: "mma_topic",
    valueConnection: "保護者への安心感を伝える。",
  },
  drafts: [
    {
      id: "FG-20260530-004_threads",
      ideaId: "FG-20260530-004",
      approvalId: "FG-20260530-004",
      platform: "threads",
      publicationLevel: "level_2_draft",
      body: "FLATUP GYMは、子どもが安心して挑戦できるやさしい格闘技ジムです。",
      hashtags: ["FLATUPGYM", "キッズ"],
      cta: "まずは自分のペースで大丈夫です。",
      safetyNotes: [],
      createdAt: "2026-05-30T00:00:00.000Z",
    },
  ],
  status: "saved",
  approvalMessage: "投稿候補です。",
  createdAt: "2026-05-30T00:00:00.000Z",
  updatedAt: "2026-05-30T00:00:00.000Z",
};

await saveRecord(tmp, record);
const publicMediaDir = path.join(tmp, "public", "media");
const localMediaDir = path.join(tmp, "local", "media");
await mkdir(publicMediaDir, { recursive: true });
await mkdir(localMediaDir, { recursive: true });
const publicImage = path.join(publicMediaDir, "post.jpg");
const localImage = path.join(localMediaDir, "local.jpg");
await writeFile(publicImage, "image");
await writeFile(localImage, "image");
await createPublishQueueEntry(tmp, record, ["threads", "google_business", "line_voom"], new Date("2026-05-30T00:00:00.000Z"), {
  mediaFiles: [publicImage, localImage],
});

// 配信ディレクトリ＝公開ディレクトリ（VPSと同じ構成）にして、パネルが公開URLで返ることを確認。
const returned = await createBrowserPanel(tmp, "FG-20260530-004", {
  env: {
    OPENQLOW_MEDIA_DIR: publicMediaDir,
    OPENQLOW_PUBLIC_MEDIA_DIR: publicMediaDir,
    OPENQLOW_PUBLIC_MEDIA_BASE_URL: "https://media.example.com/openqlow/",
  },
});
// iPhone からタップできる公開URLを返す（VPSファイルパスではない）。
assert.equal(returned, "https://media.example.com/openqlow/panel-FG-20260530-004.html");

// パネル本体は publish_assist と配信ディレクトリの両方に書き出される。
const localPanel = path.join(tmp, "state", "publish_assist", "FG-20260530-004.html");
const servedPanel = path.join(publicMediaDir, "panel-FG-20260530-004.html");
const html = await readFile(localPanel, "utf8");
assert.equal(html, await readFile(servedPanel, "utf8"));

assert.match(html, /<title>openQLOW Publish Assist - FG-20260530-004<\/title>/);
assert.match(html, /Threads/);
assert.match(html, /Google Business Profile/);
assert.match(html, /LINE VOOM/);
assert.match(html, /https:\/\/www\.threads\.net\//);
assert.match(html, /https:\/\/business\.google\.com\//);
assert.match(html, /https:\/\/manager\.line\.biz\//);
assert.match(html, /navigator\.clipboard\.writeText/);
// 1タップ: コピー＋投稿画面を開くボタンと、開くURL(data-url)があること。
assert.match(html, /コピーして投稿画面を開く/);
assert.match(html, /data-url="https:\/\/business\.google\.com\/posts"/);
assert.match(html, /最終投稿ボタンは押さない/);
assert.match(html, /子どもが安心して挑戦できる/);
assert.match(html, /画像確認/);
assert.match(html, /https:\/\/media\.example\.com\/openqlow\/post\.jpg/);
assert.match(html, /<img class="preview" src="https:\/\/media\.example\.com\/openqlow\/post\.jpg"/);
assert.match(html, /local\.jpg/);
assert.match(html, /Googleは画像URLをコピー/);
assert.match(html, /LINE VOOMは画像ファイルをアップロード/);

await rm(tmp, { recursive: true, force: true });

console.log("browser panel tests passed");
