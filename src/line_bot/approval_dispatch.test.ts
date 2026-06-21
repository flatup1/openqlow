import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rememberApprovalCandidate } from "../approval/shortcut.js";
import { saveRecord } from "../state/file_store.js";
import type { DraftRecord } from "../types.js";
import { executeLineCommand } from "./commands.js";
import { executeApprovalText } from "./approval_dispatch.js";

function pendingRecord(id: string): DraftRecord {
  return {
    id,
    idea: {
      id,
      date: "2026-06-08",
      theme: "承認ショートカット",
      angle: "日報セッションより承認を優先する",
      audience: "local_narita",
      source: "obsidian_inbox",
      valueConnection: "okを投稿準備承認として扱う。",
    },
    drafts: [{
      id: `${id}_threads`,
      ideaId: id,
      approvalId: id,
      platform: "threads",
      publicationLevel: "level_2_draft",
      body: "FLATUP GYMは初心者でも安心して始められます。",
      hashtags: ["FLATUPGYM"],
      cta: "",
      safetyNotes: [],
      createdAt: "2026-06-08T00:00:00.000Z",
    }],
    status: "pending_approval",
    approvalMessage: "候補",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  };
}

async function withTempEnv<T>(fn: (root: string, vault: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-approval-dispatch-root-"));
  const vault = await mkdtemp(path.join(tmpdir(), "openqlow-approval-dispatch-vault-"));
  process.env.OPENQLOW_ROOT = root;
  process.env.OBSIDIAN_VAULT_ROOT = vault;
  return fn(root, vault);
}

// ok は写真ゲートで一旦止まり、写真の判断（ここでは2回目のok=写真なし）で投稿が確定する。
await withTempEnv(async (root) => {
  const id = "FG-20260608-401";
  const userId = "test-approval-dispatch-user";
  await saveRecord(root, pendingRecord(id));
  await rememberApprovalCandidate(root, id);

  const daily = await executeLineCommand("日報", { userId });
  assert.equal(daily.handled, true);
  assert.equal(daily.action, "memory_keeper");

  // 1回目の ok: まだ投稿せず、写真を聞いて止まる。
  const firstOk = await executeApprovalText("ok", userId);
  assert.equal(firstOk.ok, true);
  assert.equal(firstOk.action, "awaiting_media");
  assert.equal(firstOk.id, id);
  assert.match(String(firstOk.message), /写真/);
  const notYet = JSON.parse(await readFile(path.join(root, "state", `${id}.json`), "utf8"));
  assert.equal(notYet.status, "pending_approval");

  // 2回目の ok: 写真なしで投稿を確定する。
  const approved = await executeApprovalText("ok", userId);
  assert.equal(approved.ok, true);
  assert.equal(approved.action, "approved");
  assert.equal(approved.id, id);
  assert.match(String(approved.message), /投稿準備キュー|自動投稿/);
  assert.doesNotMatch(String(approved.message), /日報として読み取れません/);

  const saved = JSON.parse(await readFile(path.join(root, "state", `${id}.json`), "utf8"));
  assert.equal(saved.status, "saved");
});

// ok の後に「画像なし」を送ると、添付判断に続けてそのまま投稿が確定する。
await withTempEnv(async (root) => {
  const id = "FG-20260608-403";
  const userId = "test-approval-dispatch-user";
  await saveRecord(root, pendingRecord(id));
  await rememberApprovalCandidate(root, id);

  const firstOk = await executeApprovalText("ok", userId);
  assert.equal(firstOk.action, "awaiting_media");

  const decided = await executeApprovalText("画像なし", userId);
  assert.equal(decided.ok, true);
  assert.equal(decided.action, "approved");
  assert.equal(decided.id, id);

  const saved = JSON.parse(await readFile(path.join(root, "state", `${id}.json`), "utf8"));
  assert.equal(saved.status, "saved");
});

await withTempEnv(async (root) => {
  const id = "FG-20260608-402";
  await saveRecord(root, pendingRecord(id));
  await rememberApprovalCandidate(root, id);

  const rejected = await executeApprovalText("やめる", "test-approval-dispatch-user");
  assert.equal(rejected.ok, true);
  assert.equal(rejected.action, "rejected");
  assert.equal(rejected.id, id);

  const saved = JSON.parse(await readFile(path.join(root, "state", `${id}.json`), "utf8"));
  assert.equal(saved.status, "rejected");
});

// 「修正」だけ → 次の一言が修正指示として拾われる（日報フォールバックに落ちない）。
await withTempEnv(async (root) => {
  const id = "FG-20260608-404";
  const userId = "test-approval-dispatch-user";
  await saveRecord(root, pendingRecord(id));
  await rememberApprovalCandidate(root, id);

  const ask = await executeApprovalText("修正", userId);
  assert.equal(ask.action, "awaiting_revision");
  assert.match(String(ask.message), /何をどう直しますか/);

  // 次の一言（指示）。LLM未接続なので書き直しは失敗するが、"revise系"に流れること＝拾えている証拠。
  const instr = await executeApprovalText("もっとやさしく", userId);
  assert.ok(["revised", "revise_failed"].includes(String(instr.action)), `expected revise route, got ${String(instr.action)}`);
  assert.doesNotMatch(String(instr.message), /日報として残すなら/);
});

console.log("approval dispatch tests passed");
