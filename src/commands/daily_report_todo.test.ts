import assert from "node:assert/strict";
import { extractTopThreeTodos, buildTodoReplyLines } from "./daily_report_todo.js";

// 1) 全部空なら空配列
{
  const todos = extractTopThreeTodos({});
  assert.deepEqual(todos, []);
}

// 2) "なし" や "無し" はスキップされる
{
  const todos = extractTopThreeTodos({
    today_top_task: "なし",
    followup_needed: "無し",
    enrollment_considering: "",
  });
  assert.deepEqual(todos, []);
}

// 3) 1項目だけ埋まっていれば1件返す
{
  const todos = extractTopThreeTodos({ today_top_task: "LP更新" });
  assert.deepEqual(todos, ["今日のタスク: LP更新"]);
}

// 4) 優先順序通りに最大3件
{
  const todos = extractTopThreeTodos({
    today_top_task: "看板撮影",
    followup_needed: "山田さんへ返信",
    enrollment_considering: "佐藤さん声かけ",
    retention_risk: "せとさん確認",
    review_request_candidate: "田中さんに口コミ",
    concerning_member: "鈴木さん様子見",
  });
  assert.equal(todos.length, 3);
  assert.equal(todos[0], "今日のタスク: 看板撮影");
  assert.equal(todos[1], "返信・フォロー: 山田さんへ返信");
  assert.equal(todos[2], "入会検討中の方へ声かけ: 佐藤さん声かけ");
}

// 5) 上位がスキップされたら下位が繰り上がる
{
  const todos = extractTopThreeTodos({
    today_top_task: "なし",
    followup_needed: "なし",
    enrollment_considering: "佐藤さん",
    retention_risk: "せとさん",
    review_request_candidate: "田中さん",
    concerning_member: "鈴木さん",
  });
  assert.deepEqual(todos, [
    "入会検討中の方へ声かけ: 佐藤さん",
    "退会リスク確認: せとさん",
    "口コミ依頼: 田中さん",
  ]);
}

// 6) buildTodoReplyLines: 空なら空配列
{
  const lines = buildTodoReplyLines({});
  assert.deepEqual(lines, []);
}

// 7) buildTodoReplyLines: 1件以上で見出し付き整形
{
  const lines = buildTodoReplyLines({
    today_top_task: "LP更新",
    followup_needed: "山田さん",
  });
  assert.ok(lines.includes("今日やること:"));
  assert.ok(lines.includes("1. 今日のタスク: LP更新"));
  assert.ok(lines.includes("2. 返信・フォロー: 山田さん"));
}

// 8) 前後空白は trim される
{
  const todos = extractTopThreeTodos({ today_top_task: "  LP更新  " });
  assert.deepEqual(todos, ["今日のタスク: LP更新"]);
}

console.log("daily report todo tests passed");
