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
  parseOneShotMemo,
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

// 1. parseMemoryCommand: 主要 3 コマンド + エイリアス
assert.equal(parseMemoryCommand("/昨日の記録"), "/昨日の記録");
assert.equal(parseMemoryCommand("/日記"), "/昨日の記録");
assert.equal(parseMemoryCommand("日記"), "/昨日の記録");
assert.equal(parseMemoryCommand("/昨日の日記"), "/昨日の記録");
assert.equal(parseMemoryCommand("/保存用ログ"), "/保存用ログ");
assert.equal(parseMemoryCommand("/中止"), "/中止");
assert.equal(parseMemoryCommand("昨日の記録"), "/昨日の記録"); // 先頭 / なしも許容
assert.equal(parseMemoryCommand("OK FG-20260521-001"), undefined);
assert.equal(parseMemoryCommand("/SNS作成"), undefined);

// 1b. 全角スラッシュ「／」も半角と同じ扱い（日本語IME対策）
assert.equal(parseMemoryCommand("／日記"), "/昨日の記録");
assert.equal(parseMemoryCommand("／昨日の記録"), "/昨日の記録");
assert.equal(parseMemoryCommand("／中止"), "/中止");

// 1c. 「やめる」単体は memory ではなく承認フロー側の責務（混同回避）
assert.equal(parseMemoryCommand("やめる"), undefined);
assert.equal(parseMemoryCommand("やめる FG-20260521-001"), undefined);

// 1d. parseOneShotMemo: /日記 + 本文 のワンショット記録抽出
assert.deepEqual(parseOneShotMemo("/日記 メルティのキッズクラス始動"), { body: "メルティのキッズクラス始動" });
assert.deepEqual(parseOneShotMemo("/昨日の記録 体験者あり"), { body: "体験者あり" });
assert.deepEqual(parseOneShotMemo("／日記 全角スラでもOK"), { body: "全角スラでもOK" });
assert.deepEqual(parseOneShotMemo("日記\n改行で本文"), { body: "改行で本文" });
assert.equal(parseOneShotMemo("/日記"), undefined); // 本文なしはワンショットではない
assert.equal(parseOneShotMemo("/日記   "), undefined); // 空白だけも対象外
assert.equal(parseOneShotMemo("/SNS作成 何か"), undefined);

// 1e. parseMemoryCommand: ワンショット形式は対話起動として扱わない
assert.equal(parseMemoryCommand("/日記 本文あり"), undefined);
assert.equal(parseMemoryCommand("／日記 本文あり"), undefined);

// 2. isMemoryCommandText
assert.equal(isMemoryCommandText("/昨日の記録"), true);
assert.equal(isMemoryCommandText("/日記"), true);
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

// 10b. routeMemoryText: /日記 alias
{
  const store = await makeStore();
  const r = await routeMemoryText(userId, "/日記", { store });
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

// 13. ワンショット記録：/日記 本文 → 1往復で保存
{
  await setVaultTmp();
  const store = await makeStore();
  const r = await routeMemoryText(userId, "/日記 メルティのキッズクラス始動", { store });
  assert.equal(r.route, "command");
  assert.ok(r.ok, `保存失敗: ${r.reply}`);
  assert.match(r.reply, /保存しました/);
  assert.equal(r.meta?.mode, "one_shot");
  assert.equal(await store.exists(userId), false, "ワンショット後はセッション残らない");
}

// 14. 「なし」回答 → 自動セッション破棄、ファイル作らない
{
  await setVaultTmp();
  const store = await makeStore();
  await routeMemoryText(userId, "/日記", { store });
  const r = await routeMemoryText(userId, "なし", { store });
  assert.equal(r.route, "ongoing_session");
  assert.ok(r.ok);
  assert.match(r.reply, /記録なしで終了/);
  assert.equal(await store.exists(userId), false, "セッションは自動破棄");
}

// 15. 対話モード完走 → /保存用ログ なしで自動保存される
{
  await setVaultTmp();
  const store = await makeStore();
  await routeMemoryText(userId, "/日記", { store });
  await routeMemoryText(userId, "はい", { store });
  await routeMemoryText(userId, "e", { store });          // その他選択
  const r = await routeMemoryText(userId, "メモ本文", { store }); // 1 行で完了
  // 「その他」は質問 1 つだけなので、回答後 awaiting_more_genre になる
  // 続けて「終わる」で end → 自動保存
  const r2 = await routeMemoryText(userId, "終わる", { store });
  assert.match(r2.reply, /保存しました/, `自動保存応答: ${r2.reply}`);
  assert.equal(await store.exists(userId), false, "自動保存後はセッション破棄");
}

console.log("memory keeper tests passed");
