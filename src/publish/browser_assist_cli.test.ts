import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runPublishAssist, runPublishPanel } from "./browser_assist_cli.js";
import { createPublishQueueEntry } from "./queue.js";
import { saveRecord } from "../state/file_store.js";
import type { DraftRecord } from "../types.js";

const tmp = await mkdtemp(path.join(os.tmpdir(), "openqlow-browser-assist-cli-"));
process.env.OPENQLOW_ROOT = tmp;

const record: DraftRecord = {
  id: "FG-20260530-003",
  idea: {
    id: "FG-20260530-003",
    date: "2026-05-30",
    theme: "女性も安心",
    angle: "清潔感とやさしさ",
    audience: "women",
    source: "mma_topic",
    valueConnection: "安心感を伝える。",
  },
  drafts: [
    {
      id: "FG-20260530-003_threads",
      ideaId: "FG-20260530-003",
      approvalId: "FG-20260530-003",
      platform: "threads",
      publicationLevel: "level_2_draft",
      body: "FLATUP GYMは、女性も初心者も安心して通えるやさしい格闘技ジムです。",
      hashtags: ["FLATUPGYM"],
      cta: "自分のペースで大丈夫です。",
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
await createPublishQueueEntry(tmp, record, ["threads"]);

const result = await runPublishAssist("FG-20260530-003");
const text = await readFile(result.file, "utf8");
const panel = await runPublishPanel("FG-20260530-003");
const html = await readFile(panel.file, "utf8");

assert.equal(result.ok, true);
assert.match(result.file, /FG-20260530-003\.md$/);
assert.match(text, /女性も初心者も安心/);
assert.equal(panel.ok, true);
assert.match(panel.file, /FG-20260530-003\.html$/);
assert.match(html, /openQLOW Publish Assist - FG-20260530-003/);

await rm(tmp, { recursive: true, force: true });

console.log("browser assist cli tests passed");
