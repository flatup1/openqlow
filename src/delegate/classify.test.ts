import assert from "node:assert/strict";
import { classifyDelegation, mentionsApprovalGate, stripDelegatePrefix } from "./classify.js";
import { ENGINE_BY_TASK_KIND } from "./contracts.js";

// --- 考える仕事は ChatGPT へ ---
{
  const d = classifyDelegation("この設計をレビューして");
  assert.equal(d.engine, "chatgpt");
  assert.equal(d.task_kind, "review");
  assert.equal(d.source, "lexicon");
  assert.ok(d.confidence >= 0.8, "確度が付く");
}
assert.equal(classifyDelegation("次の一手を教えて").engine, "chatgpt");
assert.equal(classifyDelegation("たごさく構文の台本を書いて").engine, "chatgpt");
assert.equal(classifyDelegation("なぜトークンが減るのか説明して").task_kind, "explain");

// --- 手を動かす仕事は Claude へ ---
{
  const d = classifyDelegation("npm run test を緑にして");
  assert.equal(d.engine, "claude");
  assert.equal(d.task_kind, "verify");
}
assert.equal(classifyDelegation("src/delegate/classify.ts を修正して").engine, "claude");
assert.equal(classifyDelegation("差分を見せて").task_kind, "repo");
assert.equal(classifyDelegation("動画を書き出して").engine, "claude");

// --- 判定できないときは Claude 側に残す（勝手に外へ出さない） ---
{
  const d = classifyDelegation("こんにちは");
  assert.equal(d.task_kind, "unknown");
  assert.equal(d.engine, "claude");
  assert.equal(d.source, "default");
  assert.equal(d.matched.length, 0);
}

// --- 打ち消し表現に耐える ---
{
  const d = classifyDelegation("テストではなく計画を立てて");
  assert.equal(d.task_kind, "plan", "「テストではなく」は verify として数えない");
  assert.equal(d.engine, "chatgpt");
}

// --- 明示の合図は辞書より強い ---
{
  const d = classifyDelegation("ChatGPTに依頼：テストの直し方を教えて");
  assert.equal(d.engine, "chatgpt");
  assert.equal(d.source, "explicit_prefix");
  assert.equal(d.confidence, 1);
}
{
  // 合図と engine が食い違うときは、代表的な種類へ置き換える。
  const d = classifyDelegation("Claudeに依頼：この設計をレビューして");
  assert.equal(d.engine, "claude");
  assert.equal(d.task_kind, "run");
  assert.equal(ENGINE_BY_TASK_KIND[d.task_kind], "claude", "種類と engine が矛盾しない");
}
{
  // 合図に見えるだけの文を誤爆させない。
  const d = classifyDelegation("ChatGPTに依頼する方法を教えてください");
  assert.equal(d.source, "lexicon");
  assert.equal(d.task_kind, "explain");
}

// --- 合図の取り除き ---
assert.equal(stripDelegatePrefix("ChatGPTに依頼：レビューして"), "レビューして");
assert.equal(stripDelegatePrefix("ChatGPT: レビューして"), "レビューして");
assert.equal(stripDelegatePrefix("レビューして"), "レビューして");

// --- 承認が要る操作は engine と無関係に必ず記録する ---
{
  const d = classifyDelegation("料金表を公開して");
  assert.ok(d.requires_human_approval, "公開と料金は承認が要る");
  assert.deepEqual([...d.approval_reasons], ["publish", "money"]);
}
{
  const d = classifyDelegation("この差分をコミットして push して");
  assert.ok(d.requires_human_approval);
  assert.deepEqual([...d.approval_reasons], ["git_write"]);
}
{
  const d = classifyDelegation("退会の手順を説明して");
  assert.equal(d.engine, "chatgpt", "説明そのものは委任してよい");
  assert.ok(d.requires_human_approval, "退会の語が出たら実行は承認後");
}
{
  const d = classifyDelegation("レビューして");
  assert.equal(d.requires_human_approval, false);
  assert.equal(d.approval_reasons.length, 0);
}
assert.ok(mentionsApprovalGate("本番へデプロイして"));
assert.equal(mentionsApprovalGate("設計を教えて"), false);

// --- 同じ入力からは同じ答えが出る（決定的） ---
{
  const a = classifyDelegation("この差分をレビューして");
  const b = classifyDelegation("この差分をレビューして");
  assert.deepEqual(a, b);
}

console.log("delegate classify tests passed");
