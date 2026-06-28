import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { saveRecord } from "../state/file_store.js";
import { describeHandledApprovalCandidate, expandApprovalShortcut, rememberApprovalCandidate } from "./shortcut.js";

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

// 「ok」二度押し防止: 直近候補(902)を承認済みにした後、もう一度「ok」を送っても
// 古い別の保留下書き(901)を勝手に承認しない。
{
  const root = await makeRoot();
  await saveRecord(root, record("FG-20260603-901", "pending_approval", "2026-06-02T05:00:00.000Z"));
  await saveRecord(root, record("FG-20260603-902", "saved", "2026-06-02T21:00:00.000Z")); // 直近候補は承認済み
  await rememberApprovalCandidate(root, "FG-20260603-902"); // marker は直近の902を指す

  assert.equal(
    await expandApprovalShortcut("ok", root),
    undefined,
    "marker消費済みなら古い901を勝手に承認しない",
  );
}

// 直近候補が承認済み(saved)で marker がそれを指す時、bare「ok」は無言fallbackではなく
// 「もう承認済み」と説明する文を返せる（混乱防止）。
{
  const root = await makeRoot();
  await saveRecord(root, record("FG-20260603-902", "saved", "2026-06-02T21:00:00.000Z"));
  await rememberApprovalCandidate(root, "FG-20260603-902");

  const note = await describeHandledApprovalCandidate("ok", root);
  assert.ok(note && /承認済み/.test(note), "承認済み候補には「承認済み」と案内する");
  assert.ok(note && /二重に投稿/.test(note), "二重投稿しない旨を明示する");

  // pending のままなら説明は出さない（通常の承認フローに任せる）。
  const root2 = await makeRoot();
  await saveRecord(root2, record("FG-20260603-903", "pending_approval", "2026-06-02T21:00:00.000Z"));
  await rememberApprovalCandidate(root2, "FG-20260603-903");
  assert.equal(await describeHandledApprovalCandidate("ok", root2), undefined, "pendingなら説明は出さない");

  // marker が無ければ説明も出さない。
  const root3 = await makeRoot();
  assert.equal(await describeHandledApprovalCandidate("ok", root3), undefined, "markerが無ければ説明は出さない");
}

console.log("approval shortcut tests passed");
