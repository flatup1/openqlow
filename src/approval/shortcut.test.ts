import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { saveRecord } from "../state/file_store.js";
import { expandApprovalShortcut, rememberApprovalCandidate } from "./shortcut.js";

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "openqlow-approval-shortcut-"));
}

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

{
  const root = await makeRoot();
  await saveRecord(root, record("FG-20260603-901", "pending_approval", "2026-06-02T20:00:00.000Z"));
  await saveRecord(root, record("FG-20260603-902", "pending_approval", "2026-06-02T21:00:00.000Z"));

  assert.equal(await expandApprovalShortcut("ok", root), "OK FG-20260603-902 all");
  assert.equal(await expandApprovalShortcut(" OK ", root), "OK FG-20260603-902 all");
}

{
  const root = await makeRoot();
  await saveRecord(root, record("FG-20260603-003", "pending_approval", "2026-06-02T20:15:00.000Z"));
  await saveRecord(root, record("FG-20260603-901", "pending_approval", "2026-06-02T20:28:00.000Z"));
  await rememberApprovalCandidate(root, "FG-20260603-003");

  assert.equal(await expandApprovalShortcut("ok", root), "OK FG-20260603-003 all");
}

{
  const root = await makeRoot();
  await saveRecord(root, record("FG-20260603-901", "saved", "2026-06-02T20:00:00.000Z"));

  assert.equal(await expandApprovalShortcut("ok", root), undefined);
  assert.equal(await expandApprovalShortcut("はい", root), undefined);
}

console.log("approval shortcut tests passed");
