import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { loadRecord, saveRecord } from "./file_store.js";

function sampleRecord(id: string): DraftRecord {
  const now = new Date().toISOString();
  return {
    id,
    idea: {
      id,
      date: "2026-06-09",
      theme: "t",
      angle: "a",
      audience: "beginners",
      source: "rotation",
      valueConnection: "v",
    },
    drafts: [],
    status: "pending_approval",
    approvalMessage: "msg",
    createdAt: now,
    updatedAt: now,
  };
}

async function testSaveAndLoadRoundTrip(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-state-"));
  try {
    const record = sampleRecord("FG-20260609-001");
    await saveRecord(root, record);
    const loaded = await loadRecord(root, record.id);
    assert.ok(loaded, "record should load");
    assert.equal(loaded?.id, record.id);
    assert.equal(loaded?.status, "pending_approval");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testLoadMissingReturnsUndefined(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-state-"));
  try {
    const loaded = await loadRecord(root, "FG-00000000-000");
    assert.equal(loaded, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await testSaveAndLoadRoundTrip();
await testLoadMissingReturnsUndefined();

console.log("file_store tests passed");
