import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPublishQueueEntry } from "./queue.js";
import { createBrowserAssistSheet } from "./browser_assist.js";
import { saveRecord } from "../state/file_store.js";
import type { DraftRecord } from "../types.js";

const tmp = await mkdtemp(path.join(os.tmpdir(), "openqlow-browser-assist-"));

const record: DraftRecord = {
  id: "FG-20260530-002",
  idea: {
    id: "FG-20260530-002",
    date: "2026-05-30",
    theme: "初心者の一歩",
    angle: "怖くない格闘技ジム",
    audience: "beginners",
    source: "mma_topic",
    valueConnection: "安心感を伝える。",
  },
  drafts: [
    {
      id: "FG-20260530-002_threads",
      ideaId: "FG-20260530-002",
      approvalId: "FG-20260530-002",
      platform: "threads",
      publicationLevel: "level_2_draft",
      body: "FLATUP GYMは、格闘技が初めての方でも安心して始められる、世界一やさしい格闘技ジムです。",
      hashtags: ["FLATUPGYM", "成田"],
      cta: "気になる方も、自分のペースで大丈夫です。",
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
await createPublishQueueEntry(tmp, record, ["threads", "google_business", "line_voom"], new Date("2026-05-30T09:00:00.000Z"));

const assistFile = await createBrowserAssistSheet(tmp, "FG-20260530-002");
const sheet = await readFile(assistFile, "utf8");

assert.match(sheet, /# Browser Assist - FG-20260530-002/);
assert.match(sheet, /## Threads/);
assert.match(sheet, /https:\/\/www\.threads\.net/);
assert.match(sheet, /## Google Business Profile/);
assert.match(sheet, /https:\/\/business\.google\.com/);
assert.match(sheet, /## LINE VOOM/);
assert.match(sheet, /https:\/\/manager\.line\.biz/);
assert.match(sheet, /最終投稿ボタンはオーナーが押す/);
assert.match(sheet, /FLATUP GYMは、格闘技が初めての方でも安心して始められる/);

await rm(tmp, { recursive: true, force: true });

console.log("browser assist tests passed");
