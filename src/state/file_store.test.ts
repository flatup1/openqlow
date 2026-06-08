import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { loadRecord, saveRecord } from "./file_store.js";

function record(id: string, status: DraftRecord["status"], createdAt: string): DraftRecord {
  return {
    id,
    idea: {
      id,
      date: "2026-06-03",
      theme: "test",
      angle: "test",
      audience: "local_narita",
      source: "obsidian_inbox",
      valueConnection: "test",
    },
    drafts: [],
    status,
    approvalMessage: "投稿候補です。",
    createdAt,
    updatedAt: createdAt,
  };
}

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "openqlow-file-store-"));
}

// 1) save → load の往復で同じ内容が戻る
{
  const root = await makeRoot();
  try {
    const original = record("FG-20260603-001", "pending_approval", "2026-06-03T01:00:00.000Z");
    const file = await saveRecord(root, original);
    assert.equal(file, path.join(root, "state", "FG-20260603-001.json"));

    const loaded = await loadRecord(root, "FG-20260603-001");
    assert.deepEqual(loaded, original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// 2) 同じ id を再保存すると上書き更新になる（状態を進める用途）
{
  const root = await makeRoot();
  try {
    await saveRecord(root, record("FG-20260603-002", "pending_approval", "2026-06-03T01:00:00.000Z"));
    const updated = record("FG-20260603-002", "approved", "2026-06-03T01:00:00.000Z");
    await saveRecord(root, updated);

    const loaded = await loadRecord(root, "FG-20260603-002");
    assert.equal(loaded?.status, "approved");

    // shortcut.ts の loadStateRecords が読む `${id}.json` 形式であること
    const raw = await readFile(path.join(root, "state", "FG-20260603-002.json"), "utf8");
    assert.equal((JSON.parse(raw) as DraftRecord).id, "FG-20260603-002");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// 3) 存在しない id は undefined
{
  const root = await makeRoot();
  try {
    assert.equal(await loadRecord(root, "FG-20260603-999"), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// 4) 壊れた JSON は fail closed で undefined
{
  const root = await makeRoot();
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.join(root, "state"), { recursive: true });
    await writeFile(path.join(root, "state", "FG-20260603-003.json"), "{ broken", "utf8");
    assert.equal(await loadRecord(root, "FG-20260603-003"), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

console.log("file_store.test.ts ok");
