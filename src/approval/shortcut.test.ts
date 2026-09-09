import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { saveRecord } from "../state/file_store.js";
import { expandApprovalShortcut, expandRejectionShortcut, rememberApprovalCandidate } from "./shortcut.js";

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

// ---- 目印があるときは、それ以外を承認しない ----
//
// 目印（last_approval_candidate）は「JINへ最後に見せたもの」。
// これが読めないときに「いちばん新しい保留」へ落とすと、
// JINが見ていない別の下書きを承認してしまう。実際にそうなった:
//
//   JINが見ているのは A (FG-20260101-001)
//   Aが壊れた状態で "OK" → OK FG-20260101-002 all  ← 見ていない B
//
// 画面で見たものと、承認されるものが違う。分からないときは何も指さない。
{
  const root = await makeRoot();
  await saveRecord(root, record("FG-20260603-011", "pending_approval", "2026-06-02T20:00:00.000Z"));
  await saveRecord(root, record("FG-20260603-012", "pending_approval", "2026-06-02T21:00:00.000Z"));
  await rememberApprovalCandidate(root, "FG-20260603-011");

  assert.equal(await expandApprovalShortcut("ok", root), "OK FG-20260603-011 all", "前提: 目印が勝つ");

  // 見せた下書きのファイルが壊れた（同期の途中・書き込み中など）。
  await writeFile(path.join(root, "state", "FG-20260603-011.json"), '{"id": "FG-2026', "utf8");
  assert.equal(
    await expandApprovalShortcut("ok", root),
    undefined,
    "読めないなら、別の下書きを承認しない",
  );
  assert.equal(
    await expandRejectionShortcut("no", root),
    undefined,
    "却下も同じ。見ていないものを却下しない",
  );
}

// 目印が指す先がもう保留でないときも、別のものへ移らない。
{
  const root = await makeRoot();
  await saveRecord(root, record("FG-20260603-021", "approved", "2026-06-02T20:00:00.000Z"));
  await saveRecord(root, record("FG-20260603-022", "pending_approval", "2026-06-02T21:00:00.000Z"));
  await rememberApprovalCandidate(root, "FG-20260603-021");

  assert.equal(await expandApprovalShortcut("ok", root), undefined);
}

// 日付が読めない記録を「いちばん新しい」にしない（目印がまだ無いとき）。
{
  const root = await makeRoot();
  await saveRecord(root, record("FG-20260603-031", "pending_approval", "2026-06-02T20:00:00.000Z"));
  await saveRecord(root, record("FG-20260603-032", "pending_approval", "こわれた日付"));

  assert.equal(
    await expandApprovalShortcut("ok", root),
    "OK FG-20260603-031 all",
    "日付が読めないものが勝手に最新にならない",
  );
}

console.log("approval shortcut tests passed");
