import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { saveRecord, loadRecord } from "./file_store.js";
import type { DraftRecord } from "../types.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const tmp = await mkdtemp(path.join(os.tmpdir(), "openqlow-store-"));
const record: DraftRecord = {
  id: "record_test",
  idea: {
    id: "idea_test",
    date: "2026-05-17",
    theme: "弱い自分と戦う人へ",
    angle: "最初の一歩",
    audience: "beginners",
    source: "mma_topic",
    valueConnection: "FLATUPの挑戦に接続",
  },
  drafts: [],
  status: "pending_approval",
  approvalMessage: "承認依頼",
  createdAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z",
};

await saveRecord(tmp, record);
const loaded = await loadRecord(tmp, "record_test");

assert(loaded?.id === "record_test", "loads saved record");
assert(loaded?.status === "pending_approval", "keeps status");

await rm(tmp, { recursive: true, force: true });
console.log("file store tests passed");
