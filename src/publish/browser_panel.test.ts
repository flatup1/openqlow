import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
await createPublishQueueEntry(tmp, record, ["threads", "google_business", "line_voom"]);

const file = await createBrowserPanel(tmp, "FG-20260530-004");
const html = await readFile(file, "utf8");

assert.match(file, /FG-20260530-004\.html$/);
assert.match(html, /<title>openQLOW Publish Assist - FG-20260530-004<\/title>/);
assert.match(html, /Threads/);
assert.match(html, /Google Business Profile/);
assert.match(html, /LINE VOOM/);
assert.match(html, /https:\/\/www\.threads\.net\//);
assert.match(html, /https:\/\/business\.google\.com\//);
assert.match(html, /https:\/\/manager\.line\.biz\//);
assert.match(html, /navigator\.clipboard\.writeText/);
assert.match(html, /最終投稿ボタンは押さない/);
assert.match(html, /子どもが安心して挑戦できる/);

await rm(tmp, { recursive: true, force: true });

console.log("browser panel tests passed");
