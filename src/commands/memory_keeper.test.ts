import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../conversation/session_store.js";
import {
  cancelMemorySession,
  continueMemoryInterview,
  dispatchMemoryCommand,
  isMemoryCommandText,
  parseMemoryCommand,
  routeMemoryText,
  saveMemorySession,
  startMemoryInterview,
} from "./memory_keeper.js";

async function makeStore(): Promise<SessionStore> {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-mk-test-"));
  return new SessionStore({ baseDir });
}

async function setVaultTmp(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-mk-vault-"));
  process.env.OBSIDIAN_VAULT_ROOT = tmp;
}

const userId = "test-user-mk-001";

// 1. parseMemoryCommand: 主要 3 コマンド
assert.equal(parseMemoryCommand("/昨日の記録"), "/昨日の記録");
assert.equal(parseMemoryCommand("/保存用ログ"), "/保存用ログ");
assert.equal(parseMemoryCommand("/中止"), "/中止");
assert.equal(parseMemoryCommand("昨日の記録"), "/昨日の記録"); // 先頭 / なしも許容
assert.equal(parseMemoryCommand("OK FG-20260521-001"), undefined);
assert.equal(parseMemoryCommand("/SNS作成"), undefined);

// 2. isMemoryCommandText
assert.equal(isMemoryCommandText("/昨日の記録"), true);
assert.equal(isMemoryCommandText("hello"), false);

// 3. startMemoryInterview: セッション開始メッセージに「昨日」と「はい/なし」が入る
{
  const store = await makeStore();
  const r = await startMemoryInterview(userId, { store });
  assert.ok(r.ok);
  assert.ok(r.reply.includes("記憶係"));
  assert.ok(r.reply.includes("はい"));
  assert.ok(r.reply.includes("なし"));
  assert.ok(await store.exists(userId));
}

// 4. dispatchMemoryCommand: /中止 でセッション破棄
{
  const store = await makeStore();
  await startMemoryInterview(userId, { store });
  assert.ok(await store.exists(userId));

  const r = await dispatchMemoryCommand(userId, "/中止", { store });
  assert.ok(r.ok);
  assert.ok(r.reply.includes("中止"));
  assert.equal(await store.exists(userId), false);
}

// 5. continueMemoryInterview: 「なし」→ finished
{
  const store = await makeStore();
  await startMemoryInterview(userId, { store });
  const r = await continueMemoryInterview(userId, "なし", { store });
  assert.ok(r);
  assert.ok(r?.ok);
  assert.equal(r?.meta?.finished, true);
}

// 6. continueMemoryInterview: セッションなし → undefined
{
  const store = await makeStore();
  const r = await continueMemoryInterview("unknown-user", "なんか", { store });
  assert.equal(r, undefined);
}

// 7. saveMemorySession: 1 件記録後に Obsidian に保存される
{
  await setVaultTmp();
  const store = await makeStore();
  await startMemoryInterview(userId, { store });
  await continueMemoryInterview(userId, "はい", { store });
  await continueMemoryInterview(userId, "a", { store }); // trial
  // trial の質問は 7 つ。すべて回答する。
  for (let i = 0; i < 7; i++) {
    await continueMemoryInterview(userId, `回答${i}`, { store });
  }
  // awaiting_more_genre → 終わり
  await continueMemoryInterview(userId, "f", { store });

  const saved = await saveMemorySession(userId, { store });
  assert.ok(saved.ok, `保存失敗: ${saved.reply}`);
  assert.ok(typeof saved.meta?.filePath === "string");
  assert.equal(await store.exists(userId), false, "保存後はセッション破棄");
}

// 8. saveMemorySession: セッションなしならエラー応答
{
  const store = await makeStore();
  const r = await saveMemorySession("no-session-user", { store });
  assert.equal(r.ok, false);
  assert.ok(r.reply.includes("見つかりません"));
}

// 9. cancelMemorySession: セッションなしでも安全
{
  const store = await makeStore();
  const r = await cancelMemorySession("no-session-user", { store });
  assert.ok(r.ok);
  assert.ok(r.reply.includes("ありません"));
}

// 10. routeMemoryText: コマンド経路
{
  const store = await makeStore();
  const r = await routeMemoryText(userId, "/昨日の記録", { store });
  assert.equal(r.route, "command");
  assert.ok(r.ok);
}

// 11. routeMemoryText: 進行中セッションへの回答
{
  const store = await makeStore();
  await startMemoryInterview(userId, { store });
  const r = await routeMemoryText(userId, "なし", { store });
  assert.equal(r.route, "ongoing_session");
  assert.ok(r.ok);
}

// 12. routeMemoryText: 該当なし
{
  const store = await makeStore();
  const r = await routeMemoryText("nobody-user", "なし", { store });
  assert.equal(r.route, "no_match");
}

console.log("memory keeper tests passed");
