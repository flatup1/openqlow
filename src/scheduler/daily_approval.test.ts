import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveRecord } from "../state/file_store.js";
import type { DraftRecord } from "../types.js";

const tmp = await mkdtemp(path.join(os.tmpdir(), "openqlow-daily-approval-"));
process.env.OPENQLOW_ROOT = tmp;
process.env.OBSIDIAN_VAULT_ROOT = path.join(tmp, "vault");

const { approveRecord } = await import("./daily.js");

const record: DraftRecord = {
  id: "FG-20260530-001",
  idea: {
    id: "FG-20260530-001",
    date: "2026-05-30",
    theme: "初心者の一歩",
    angle: "世界一やさしい格闘技ジムの安心感",
    audience: "beginners",
    source: "mma_topic",
    valueConnection: "体験予約につながる安心感を伝える。",
  },
  drafts: [
    {
      id: "FG-20260530-001_threads",
      ideaId: "FG-20260530-001",
      approvalId: "FG-20260530-001",
      platform: "threads",
      publicationLevel: "level_2_draft",
      body: "FLATUP GYMは、格闘技が初めての方でも安心して始められる、世界一やさしい格闘技ジムです。",
      hashtags: ["FLATUPGYM"],
      cta: "気になる方も、自分のペースで大丈夫です。",
      safetyNotes: [],
      createdAt: "2026-05-30T00:00:00.000Z",
    },
  ],
  status: "pending_approval",
  approvalMessage: "投稿候補です。",
  createdAt: "2026-05-30T00:00:00.000Z",
  updatedAt: "2026-05-30T00:00:00.000Z",
};

await saveRecord(tmp, record);

const saved = await approveRecord("FG-20260530-001", "OK FG-20260530-001 all");
const queuePath = path.join(tmp, "state", "publish_queue", "FG-20260530-001.json");
const queue = JSON.parse(await readFile(queuePath, "utf8"));

assert(saved.includes(queuePath), "returns publish queue path with saved files");
assert.deepEqual(queue.destinations, ["google_business", "threads", "line_voom"]);
assert.equal(queue.status, "queued_for_owner");

await rm(tmp, { recursive: true, force: true });

console.log("daily approval tests passed");
