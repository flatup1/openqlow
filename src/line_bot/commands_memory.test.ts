import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeLineCommand } from "./commands.js";
import { SessionStore } from "../conversation/session_store.js";
import { approveRecord } from "../scheduler/daily.js";

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

// 2c. /おはよう は一問一答ではなく、まとめ回答テンプレートを返す
{
  const store = await makeStore();
  const result = await executeLineCommand("／ おはよー", { userId, memorySessionStore: store });
  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "memory_keeper");
  assert.match(result.message, /まとめて送ってください/);
  assert.match(result.message, /1\. 昨日の体験/);
  assert.match(result.message, /3\. 入会迷ってる人/);
  assert.match(result.message, /5\. 口コミ頼めそうな人/);
  assert.match(result.message, /8\. 今日の最優先タスク/);
}

// 2d. /おはよう 後の番号つきまとめ回答を1回で保存する
{
  const tmp = await mkdtemp(path.join(tmpdir(), "openqlow-bulk-morning-vault-"));
  process.env.OBSIDIAN_VAULT_ROOT = tmp;
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-bulk-morning-root-"));
  process.env.OPENQLOW_ROOT = root;
  const store = await makeStore();
  await executeLineCommand("おはよう", { userId, memorySessionStore: store });

  const result = await executeLineCommand([
    "1. 体験1人、女性、初心者",
    "2. 入会なし",
    "3. なし",
    "4. 昨日の体験者に料金案内",
    "5. なし",
    "6. 最近Aさん来てない",
    "7. なし",
    "8. 体験者にLINEする",
  ].join("\n"), { userId, memorySessionStore: store });

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "memory_keeper");
  assert.match(result.message, /保存しました/);
  assert.match(result.message, /投稿ID: FG-\d{8}-9\d\d/);
  assert.match(result.message, /投稿準備まで: OK FG-\d{8}-9\d\d all/);
  assert.match(result.message, /Threadsのみ: OK FG-\d{8}-9\d\d threads/);
  const stateFiles = await readdir(path.join(root, "state"));
  const recordFile = stateFiles.find((file) => /^FG-\d{8}-9\d\d\.json$/.test(file));
  assert.ok(recordFile, "朝回答から投稿候補レコードが作られる");
  const record = JSON.parse(await readFile(path.join(root, "state", recordFile), "utf8"));
  assert.equal(record.status, "pending_approval");
  assert.ok(record.drafts.some((draft: { platform: string }) => draft.platform === "threads"));
  assert.doesNotMatch(JSON.stringify(record.drafts), /Aさん|料金案内|体験者にLINEする/);
  await approveRecord(record.id, `OK ${record.id} all`);
  const queue = JSON.parse(await readFile(path.join(root, "state", "publish_queue", `${record.id}.json`), "utf8"));
  assert.deepEqual(queue.destinations, ["google_business", "threads", "line_voom"]);
  assert.equal(queue.instructions.threads.humanFinalClickRequired, true);
  assert.equal(queue.instructions.line_voom.mode, "browser_assist_only");
  assert.equal(result.meta?.mode, "bulk_morning");
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
