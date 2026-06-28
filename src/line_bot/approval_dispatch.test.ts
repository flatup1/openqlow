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

await withTempEnv(async (root) => {
  const id = "FG-20260608-401";
  const userId = "test-approval-dispatch-user";
  await saveRecord(root, pendingRecord(id));
  await rememberApprovalCandidate(root, id);

  const daily = await executeLineCommand("日報", { userId });
  assert.equal(daily.handled, true);
  assert.equal(daily.action, "memory_keeper");

  const approved = await executeApprovalText("ok", userId);
  assert.equal(approved.ok, true);
  assert.equal(approved.action, "approved");
  assert.equal(approved.id, id);
  assert.match(String(approved.message), /投稿準備キュー/);
  assert.doesNotMatch(String(approved.message), /日報として読み取れません/);

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

// 公開投稿ON(OPENQLOW_ENABLE_PUBLIC_POSTING=true)の時、OKで実際にThreadsへAPI投稿する。
await withTempEnv(async (root) => {
  const id = "FG-20260608-403";
  await saveRecord(root, pendingRecord(id));
  await rememberApprovalCandidate(root, id);

  const prev = {
    enable: process.env.OPENQLOW_ENABLE_PUBLIC_POSTING,
    user: process.env.THREADS_USER_ID,
    token: process.env.THREADS_ACCESS_TOKEN,
    fetch: globalThis.fetch,
  };
  process.env.OPENQLOW_ENABLE_PUBLIC_POSTING = "true";
  process.env.THREADS_USER_ID = "17841400000000000";
  process.env.THREADS_ACCESS_TOKEN = "test-token";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ id: `threads-${calls}` }), { status: 200 });
  }) as typeof fetch;

  try {
    const published = await executeApprovalText(`OK ${id} threads`, "test-approval-dispatch-user");
    assert.equal(published.ok, true);
    assert.equal(published.action, "published", "公開投稿ONなら action=published");
    assert.match(String(published.message), /自動投稿しました/);
    assert.match(String(published.message), /投稿完了/);
    assert.ok(calls >= 2, "Threads APIへ作成+公開の2回呼ぶ");
  } finally {
    globalThis.fetch = prev.fetch;
    if (prev.enable === undefined) delete process.env.OPENQLOW_ENABLE_PUBLIC_POSTING; else process.env.OPENQLOW_ENABLE_PUBLIC_POSTING = prev.enable;
    if (prev.user === undefined) delete process.env.THREADS_USER_ID; else process.env.THREADS_USER_ID = prev.user;
    if (prev.token === undefined) delete process.env.THREADS_ACCESS_TOKEN; else process.env.THREADS_ACCESS_TOKEN = prev.token;
  }
});

// 承認済み候補に対して bare「ok」を再送しても、無言の汎用fallbackではなく
// 「もう承認済み」と明示する（二重投稿はしない）。
await withTempEnv(async (root) => {
  const id = "FG-20260608-404";
  await saveRecord(root, pendingRecord(id));
  await rememberApprovalCandidate(root, id);

  const first = await executeApprovalText("ok", "test-approval-dispatch-user");
  assert.equal(first.action, "approved", "1回目のokは承認される");

  const second = await executeApprovalText("ok", "test-approval-dispatch-user");
  assert.equal(second.action, "already_handled", "2回目のokは「もう承認済み」案内");
  assert.match(String(second.message), /承認済み/);
  assert.doesNotMatch(String(second.message), /受け取りました/, "汎用fallbackには落とさない");
});

console.log("approval dispatch tests passed");
