import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeLineCommand } from "./commands.js";
import { SessionStore } from "../conversation/session_store.js";

async function makeStore(): Promise<SessionStore> {
  const baseDir = await mkdtemp(path.join(tmpdir(), "openqlow-cmd-mem-test-"));
  return new SessionStore({ baseDir });
}

const userId = "test-line-user-001";

// 1. userId なし → メモリキーパーは呼ばれない（既存挙動を維持）
{
  const result = await executeLineCommand("/昨日の記録");
  assert.equal(result.handled, false, "userId なしは未処理");
}

// 2. /昨日の記録 + userId → セッション開始
{
  const store = await makeStore();
  const result = await executeLineCommand("/昨日の記録", { userId, memorySessionStore: store });
  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "memory_keeper");
  assert.match(result.message, /記憶係/);
}

// 2b. /日記 + userId → /昨日の記録 と同じくセッション開始
{
  const store = await makeStore();
  const result = await executeLineCommand("/日記", { userId, memorySessionStore: store });
  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "memory_keeper");
  assert.match(result.message, /記憶係/);
}

// 3. /中止 でセッション破棄
{
  const store = await makeStore();
  await executeLineCommand("/昨日の記録", { userId, memorySessionStore: store });
  const r = await executeLineCommand("/中止", { userId, memorySessionStore: store });
  assert.equal(r.handled, true);
  assert.equal(r.ok, true);
  assert.match(r.message, /中止/);
}

// 4. 進行中セッションへの「なし」回答が引き継がれる（自動セッション破棄）
{
  const store = await makeStore();
  await executeLineCommand("/昨日の記録", { userId, memorySessionStore: store });
  const r = await executeLineCommand("なし", { userId, memorySessionStore: store });
  assert.equal(r.handled, true);
  assert.equal(r.action, "memory_keeper");
  assert.match(r.message, /記録なしで終了/);
}

// 4b. ワンショット: /日記 本文 で 1 往復保存
{
  const tmp = await mkdtemp(path.join(tmpdir(), "openqlow-cmd-mem-vault-"));
  process.env.OBSIDIAN_VAULT_ROOT = tmp;
  const store = await makeStore();
  const r = await executeLineCommand("メモ メルティのキッズクラス始動", { userId, memorySessionStore: store });
  assert.equal(r.handled, true);
  assert.equal(r.action, "memory_keeper");
  assert.match(r.message, /保存しました/);
}

// 5. 進行中セッションがない普通のメッセージは未処理（既存承認フローに流れる）
{
  const store = await makeStore();
  const r = await executeLineCommand("OK FG-20260522-001", { userId, memorySessionStore: store });
  assert.equal(r.handled, false, "承認コマンドはメモリキーパーで handled しない");
}

// 6. /追記 と /昨日の記録 が共存しても干渉しない
{
  const store = await makeStore();
  const r1 = await executeLineCommand("/追記   ", { userId, memorySessionStore: store });
  assert.equal(r1.handled, true);
  assert.equal(r1.action, "append_obsidian");

  const r2 = await executeLineCommand("/昨日の記録", { userId, memorySessionStore: store });
  assert.equal(r2.action, "memory_keeper");
}

console.log("commands memory integration tests passed");
