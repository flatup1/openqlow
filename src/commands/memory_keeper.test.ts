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
assert.deepEqual(parseOneShotMemo("日記 メルティのキッズクラス始動"), { body: "メルティのキッズクラス始動" });
assert.deepEqual(parseOneShotMemo("メモ メルティのキッズクラス始動"), { body: "メルティのキッズクラス始動" });
assert.deepEqual(parseOneShotMemo("/メモ メルティのキッズクラス始動"), { body: "メルティのキッズクラス始動" });
assert.equal(parseOneShotMemo("/日記"), undefined); // 本文なしはワンショットではない
assert.equal(parseOneShotMemo("メモ"), undefined); // 本文なしはワンショットではない
assert.equal(parseOneShotMemo("/日記   "), undefined); // 空白だけも対象外
assert.equal(parseOneShotMemo("/SNS作成 何か"), undefined);

// 1e. parseMemoryCommand: ワンショット形式は対話起動として扱わない
assert.equal(parseMemoryCommand("/日記 本文あり"), undefined);
assert.equal(parseMemoryCommand("／日記 本文あり"), undefined);
assert.equal(parseMemoryCommand("メモ 本文あり"), undefined);

// 2. isMemoryCommandText
assert.equal(isMemoryCommandText("/昨日の記録"), true);
assert.equal(isMemoryCommandText("/日記"), true);
assert.equal(isMemoryCommandText("hello"), false);

// 3. startMemoryInterview: セッション開始メッセージに「昨日」と「はい/なし」が入る
{
  const store = await makeStore();
  const r = await startMemoryInterview(userId, { store });
  assert.ok(r.ok);
  assert.ok(r.reply.includes("記録を始めます"));
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
  assert.equal(r.route, "command");
  assert.equal(r.meta?.mode, "simple_daily");
  assert.match(r.reply, /保存しました/);
}

// 13. ワンショット記録：/日記 本文 → 1往復で保存
{
  await setVaultTmp();
  const store = await makeStore();
  const r = await routeMemoryText(userId, "メモ メルティのキッズクラス始動", { store });
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

// 14b. /おはよう（デフォルト） → かんたん日報モード
{
  const store = await makeStore();
  const r = await routeMemoryText(userId, "/おはよう", { store });
  assert.equal(r.route, "command");
  assert.ok(r.ok);
  assert.match(r.reply, /1通で送ってください/);
  assert.doesNotMatch(r.reply, /1問ずつ聞きます/);
  const s = await store.load(userId);
  assert.equal(s?.activeGenre, undefined);
  assert.equal(s?.step, "awaiting_bulk_morning");
  assert.equal(s?.activeGenreQuestionIndex, 0);
  assert.equal(r.meta?.mode, "simple_daily_prompt");
}

// 14b-bis. /日報 もかんたん日報モード
{
  const store = await makeStore();
  const r = await routeMemoryText(userId, "/日報", { store });
  assert.equal(r.route, "command");
  assert.ok(r.ok);
  assert.match(r.reply, /1通で送ってください/);
}

// 14b-tri. /おはよう まとめ → かんたん日報モードに統一
{
  const store = await makeStore();
  const r = await routeMemoryText(userId, "/おはよう まとめ", { store });
  assert.equal(r.route, "command");
  assert.ok(r.ok);
  assert.match(r.reply, /1通で送ってください/);
  assert.doesNotMatch(r.reply, /1\. 昨日の体験/);
  const s = await store.load(userId);
  assert.equal(s?.step, "awaiting_bulk_morning");
  assert.equal(r.meta?.mode, "morning_interview");
}

// 14b-quad. /日報 bulk もかんたん日報モード
{
  const store = await makeStore();
  const r = await routeMemoryText(userId, "/日報 bulk", { store });
  assert.match(r.reply, /1通で送ってください/);
}

// 14c. /朝 もエイリアス（かんたん日報モード）
{
  const store = await makeStore();
  const r = await routeMemoryText(userId, "/朝", { store });
  assert.equal(r.route, "command");
  assert.ok(r.ok);
  assert.match(r.reply, /1通で送ってください/);
}

// 14c-dialog. かんたん日報: 1通で自動保存＋ToDo3つ
{
  await setVaultTmp();
  const store = await makeStore();
  await routeMemoryText(userId, "/日報", { store });
  const last = await routeMemoryText(userId, [
    "体験 山田さん女性",
    "入会迷ってる人 佐藤さん料金",
    "休みがち せとさん",
    "今日やること 看板撮影",
  ].join("\n"), { store });
  assert.match(last.reply, /保存しました/);
  assert.match(last.reply, /今日やること:/);
  assert.match(last.reply, /今日のタスク: 看板撮影/);
  assert.match(last.reply, /入会検討中の方へ声かけ: 佐藤さん料金/);
  assert.equal(await store.exists(userId), false, "完走後はセッション破棄");
}

// 14c-dialog-typo. かんたん日報で「なひ」「無」「-」等の typo を「なし」に救済
{
  await setVaultTmp();
  const store = await makeStore();
  await routeMemoryText(userId, "/日報", { store });
  const last = await routeMemoryText(userId, "体験 なひ 入会 無 返信 - 口コミ ナシ 休みがち ない 今日 システム構築", { store });
  assert.match(last.reply, /保存しました/);
  // 「なし」しか残らない項目はToDoに出ない（typo救済が効いている証拠）
  assert.match(last.reply, /今日のタスク: システム構築/);
  assert.doesNotMatch(last.reply, /返信・フォロー:\s*なひ/, "なひがそのまま残らない");
  assert.doesNotMatch(last.reply, /退会リスク確認:\s*-/, "記号がそのまま残らない");
}

// 14e. 連結形コマンドのモード切替（Jin 実機の「日報まとめ」スペースなし）
{
  const store = await makeStore();
  // 進行中の対話セッションをまず作る
  await routeMemoryText(userId, "/日報", { store });
  // 「日報まとめ」（スペース無し）で bulk モードに切替できる
  const r = await routeMemoryText(userId, "日報まとめ", { store });
  assert.equal(r.route, "command", "concatenated form is recognized as command");
  assert.match(r.reply, /1通で送ってください/);
  assert.equal(r.meta?.mode, "morning_interview", "switched to simple daily mode");
}

// 14e-bis. スラッシュ付き連結形「/日報まとめ」も同様
{
  const store = await makeStore();
  const r = await routeMemoryText(userId, "/日報まとめ", { store });
  assert.equal(r.route, "command");
  assert.match(r.reply, /1通で送ってください/);
}

// 14e-tri. ヒント文は日報まとめを要求しない
{
  const store = await makeStore();
  const r = await routeMemoryText(userId, "/日報", { store });
  assert.doesNotMatch(r.reply, /日報まとめ/);
  assert.doesNotMatch(r.reply, /日報 まとめ/, "古いスペース有り表記が残っていない");
}

// 14d. 朝のまとめ回答 → 1回で即自動保存（OpenRouterを使わない）
//      → 旧テンプレ送信モードを使うので /おはよう まとめ
{
  await setVaultTmp();
  const store = await makeStore();
  await routeMemoryText(userId, "/おはよう まとめ", { store });
  const last = await routeMemoryText(userId, [
    "1. 体験1人、女性、初心者",
    "2. 入会なし",
    "3. なし",
    "4. 昨日の体験者に料金案内",
    "5. なし",
    "6. 最近Aさん来てない",
    "7. なし",
    "8. 体験者にLINEする",
  ].join("\n"), { store });
  assert.match(last.reply, /保存しました/, `自動保存応答: ${last.reply}`);
  assert.equal(last.meta?.mode, "simple_daily");
  // 8項目仕様: ToDo3つ提案が返信に含まれる（today_top_task が埋まっているため）
  assert.match(last.reply, /今日やること:/);
  assert.match(last.reply, /今日のタスク: 体験者にLINEする/);
  assert.equal(await store.exists(userId), false, "まとめ回答保存後はセッション破棄");
}

// 14d-label. ラベル付きのbulk回答（"8. 今日の最優先タスク：xxx" 形式）でも
//            値からラベルが剥がれ、ToDo返信に二重表示されない（実機バグA再現）
{
  await setVaultTmp();
  const store = await makeStore();
  await routeMemoryText(userId, "/おはよう まとめ", { store });
  const last = await routeMemoryText(userId, [
    "1. 昨日の体験：なし",
    "2. 入会：なし",
    "3. 入会迷ってる人：なし",
    "4. 返信・フォローが必要な人：なし",
    "5. 口コミ頼めそうな人：せいじ",
    "6. 休みがち・退会しそうな人：",
    "7. 気になる会員：",
    "8. 今日の最優先タスク：システム構築",
  ].join("\n"), { store });
  assert.match(last.reply, /保存しました/, `保存: ${last.reply}`);
  // ToDo に「今日のタスク: システム構築」が出る（"今日の最優先タスク:" は剥がれる）
  assert.match(last.reply, /今日のタスク: システム構築/);
  assert.doesNotMatch(last.reply, /今日のタスク:.*今日の最優先タスク/, "ラベル二重表示しない");
  // 「なし」しかない項目はToDo3つに含まれない
  assert.doesNotMatch(last.reply, /返信・フォロー:.*なし/, "「なし」は除外");
  assert.doesNotMatch(last.reply, /入会検討中.*なし/, "「なし」は除外");
}

// 14d-label-bis. 個別ラベルの剥がれ方を直接確認
//   全角の「:」混じり、長い語が短い語より先に剥がれるか
{
  await setVaultTmp();
  const store = await makeStore();
  await routeMemoryText(userId, "/おはよう まとめ", { store });
  const last = await routeMemoryText(userId, [
    "1. 体験 山田さん",
    "2. 入会 田中さん",
    "3. 入会迷ってる人: 佐藤さん",
    "4. なし",
    "5. なし",
    "6. なし",
    "7. なし",
    "8. 看板撮影",
  ].join("\n"), { store });
  assert.match(last.reply, /保存しました/);
  // ラベル付きの値が綺麗に剥がれること（ToDoには出ないがファイルには記録される）
  assert.match(last.reply, /今日のタスク: 看板撮影/);
  assert.match(last.reply, /入会検討中の方へ声かけ: 佐藤さん/);
}

// 15. 対話モード完走 → /保存用ログ なしで自動保存される
{
  await setVaultTmp();
  const store = await makeStore();
  await routeMemoryText(userId, "/日記", { store });
  await routeMemoryText(userId, "はい", { store });
  await routeMemoryText(userId, "e", { store });          // その他選択
  await routeMemoryText(userId, "メモ本文", { store }); // 1 行で完了
  // 「その他」は質問 1 つだけなので、回答後 awaiting_more_genre になる
  // 続けて「終わる」で end → 自動保存
  const r2 = await routeMemoryText(userId, "終わる", { store });
  assert.match(r2.reply, /保存しました/, `自動保存応答: ${r2.reply}`);
  assert.equal(await store.exists(userId), false, "自動保存後はセッション破棄");
}

console.log("memory keeper tests passed");
