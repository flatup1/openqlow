import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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

// 2c. /おはよう（デフォルト）は対話モード（1問ずつ）
{
  const store = await makeStore();
  const result = await executeLineCommand("／ おはよー", { userId, memorySessionStore: store });
  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "memory_keeper");
  assert.match(result.message, /1通で送ってください/);
  assert.doesNotMatch(result.message, /1問ずつ聞きます/);
  assert.doesNotMatch(result.message, /1\/8: 昨日、体験/);
}

// 2c-bis. /おはよう まとめ でも、かんたん日報プロンプトに統一
{
  const store = await makeStore();
  const result = await executeLineCommand("おはよう まとめ", { userId, memorySessionStore: store });
  assert.equal(result.action, "memory_keeper");
  assert.match(result.message, /1通で送ってください/);
  assert.match(result.message, /体験 ひかりちゃん1名/);
  assert.doesNotMatch(result.message, /1\. 昨日の体験/);
}

// 2d. /おはよう 後の番号つきまとめ回答を1回で保存する
{
  const tmp = await mkdtemp(path.join(tmpdir(), "openqlow-bulk-morning-vault-"));
  process.env.OBSIDIAN_VAULT_ROOT = tmp;
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-bulk-morning-root-"));
  process.env.OPENQLOW_ROOT = root;
  const store = await makeStore();
  // 旧テンプレ送信モードで起動するため「まとめ」サフィックス
  await executeLineCommand("おはよう まとめ", { userId, memorySessionStore: store });

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
  assert.match(result.message, /投稿候補を作るなら「投稿」/);
  assert.doesNotMatch(result.message, /投稿ID: FG-\d{8}-9\d\d/);
  const stateFiles = await readdir(path.join(root, "state")).catch(() => []);
  const recordFile = stateFiles.find((file) => /^FG-\d{8}-9\d\d\.json$/.test(file));
  assert.equal(recordFile, undefined, "日報保存だけでは投稿候補レコードを作らない");
  assert.equal(result.meta?.mode, "simple_daily");
}

// 2e. かんたん日報: 朝セッション後の自由文1通を保存し、投稿候補は自動表示しない
{
  const tmp = await mkdtemp(path.join(tmpdir(), "openqlow-simple-morning-vault-"));
  process.env.OBSIDIAN_VAULT_ROOT = tmp;
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-simple-morning-root-"));
  process.env.OPENQLOW_ROOT = root;
  const store = await makeStore();
  await executeLineCommand("日報", { userId, memorySessionStore: store });

  const result = await executeLineCommand([
    "体験ひかりちゃん1名",
    "入会予定あり",
    "気になる会員 森田さん",
    "口コミ レディースと全会員",
    "今日やること 広告を打つ",
  ].join("\n"), { userId, memorySessionStore: store });

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "memory_keeper");
  assert.match(result.message, /保存しました/);
  assert.match(result.message, /今日やること:/);
  assert.match(result.message, /広告を打つ/);
  assert.match(result.message, /投稿候補を作るなら「投稿」/);
  assert.doesNotMatch(result.message, /投稿ID: FG-/);
  assert.doesNotMatch(result.message, /投稿準備まで: OK FG-/);
  assert.doesNotMatch(result.message, /No approval command found/);
  assert.equal(result.meta?.mode, "simple_daily");
}

// 2f. かんたん日報: 番号が崩れた1行回答も保存する
{
  const tmp = await mkdtemp(path.join(tmpdir(), "openqlow-simple-numbered-vault-"));
  process.env.OBSIDIAN_VAULT_ROOT = tmp;
  const store = await makeStore();
  await executeLineCommand("日報", { userId, memorySessionStore: store });

  const result = await executeLineCommand(
    "1. 昨日の体験： ひかりちゃん2. 入会： 1 3. 入会迷ってる人： バク4. 返信・フォローが必要な人： 5. 口コミ頼めそうな人： 6. 加瀬さん 休みがち・退会しそうな人： 7. 気になる会員： 8. 今日の最優先タスク： システム完成",
    { userId, memorySessionStore: store },
  );

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.match(result.message, /保存しました/);
  assert.match(result.message, /システム完成/);
  assert.doesNotMatch(result.message, /読み取れませんでした/);
}

// 2g. セッション無しでも日報っぽい自由文は No approval command に流さず保存する
{
  const tmp = await mkdtemp(path.join(tmpdir(), "openqlow-simple-no-session-vault-"));
  process.env.OBSIDIAN_VAULT_ROOT = tmp;
  const store = await makeStore();
  const result = await executeLineCommand(
    "ok 体験ひかりちゃん1名 入会予定あり 今日やること 広告を打つ",
    { userId, memorySessionStore: store },
  );

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "memory_keeper");
  assert.match(result.message, /保存しました/);
  assert.doesNotMatch(result.message, /No approval command found/);
}

// 2h. 「投稿」だけで直近日報ベースの投稿候補を1件作り、次操作は ok だけにする
{
  const tmp = await mkdtemp(path.join(tmpdir(), "openqlow-simple-post-vault-"));
  process.env.OBSIDIAN_VAULT_ROOT = tmp;
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-simple-post-root-"));
  process.env.OPENQLOW_ROOT = root;
  const mediaDir = await mkdtemp(path.join(tmpdir(), "openqlow-simple-post-media-"));
  process.env.OPENQLOW_MEDIA_DIR = mediaDir;
  await writeFile(path.join(mediaDir, "morning-a.jpg"), "fake", "utf8");
  await writeFile(path.join(mediaDir, "ignore.txt"), "fake", "utf8");
  const store = await makeStore();
  const result = await executeLineCommand("投稿", { userId, memorySessionStore: store });

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "memory_keeper");
  // 新UI: 短い案内＋タップ式ボタン（写真選択は ok の後の写真ゲートで行う）。
  assert.match(result.message, /今日の投稿案/);
  assert.match(result.message, /これで投稿/);
  assert.ok(Array.isArray(result.quickReplies) && result.quickReplies.some((q) => q.text === "ok"));
  assert.doesNotMatch(result.message, /OK FG-/);
  assert.doesNotMatch(result.message, /投稿準備まで/);
  const stateFiles = await readdir(path.join(root, "state"));
  assert.ok(stateFiles.some((file) => /^FG-\d{8}-9\d\d\.json$/.test(file)));
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
