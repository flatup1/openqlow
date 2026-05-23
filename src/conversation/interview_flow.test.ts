import assert from "node:assert/strict";
import {
  __interviewInternals,
  advanceConversation,
  applyGenreChoice,
  applyGenreDetailAnswer,
  applyMoreGenreAnswer,
  applyYesNoAnswer,
  buildGenreChoiceQuestion,
  buildMoreGenreQuestion,
  buildYesNoQuestion,
} from "./interview_flow.js";
import type { ConversationSession } from "./session_store.js";

function makeSession(): ConversationSession {
  return {
    userId: "test",
    command: "/昨日の記録",
    step: "awaiting_yes_no",
    activeGenreQuestionIndex: 0,
    genres: [],
    startedAt: "2026-05-22T00:00:00.000Z",
    expiresAt: "2026-05-22T00:30:00.000Z",
    lastInteractionAt: "2026-05-22T00:00:00.000Z",
  };
}

// 1. buildYesNoQuestion: 質問文に「はい」「なし」が含まれる
const yesnoQ = buildYesNoQuestion();
assert.ok(yesnoQ.includes("はい"));
assert.ok(yesnoQ.includes("なし"));

// 2. 「なし」回答 → ready_to_save & finished
{
  const s = makeSession();
  const r = applyYesNoAnswer(s, "なし");
  assert.equal(s.step, "ready_to_save");
  assert.equal(r.finished, true);
}

// 3. 「はい」回答 → awaiting_genre_choice
{
  const s = makeSession();
  applyYesNoAnswer(s, "はい");
  assert.equal(s.step, "awaiting_genre_choice");
}

// 4. 不明な回答 → 再質問
{
  const s = makeSession();
  const r = applyYesNoAnswer(s, "わからん");
  assert.equal(s.step, "awaiting_yes_no");
  assert.ok(r.prompt.includes("はい"));
}

// 5. ジャンル a → trial 開始、最初の質問
{
  const s = makeSession();
  s.step = "awaiting_genre_choice";
  const r = applyGenreChoice(s, "a");
  assert.equal(s.step, "awaiting_genre_detail");
  assert.equal(s.activeGenre, "trial");
  assert.equal(s.genres.length, 1);
  assert.ok(r.prompt.includes("体験者"));
}

// 6. ジャンル選択で f / 終わり → ready_to_save
{
  const s = makeSession();
  s.step = "awaiting_genre_choice";
  const r = applyGenreChoice(s, "f");
  assert.equal(s.step, "ready_to_save");
  assert.equal(r.finished, true);
}

// 7. trial の全質問が順に進み、最後で awaiting_more_genre に遷移する
{
  const s = makeSession();
  s.step = "awaiting_genre_choice";
  applyGenreChoice(s, "a"); // trial 開始
  const questionCount = __interviewInternals.GENRE_QUESTIONS.trial.length;
  for (let i = 0; i < questionCount; i++) {
    applyGenreDetailAnswer(s, "テスト回答");
  }
  assert.equal(s.step, "awaiting_more_genre", "全質問終了で awaiting_more_genre に遷移");
  assert.equal(s.activeGenre, undefined, "active genre は解除");
  assert.equal(s.genres[0].answers.length, questionCount, "回答が全件保存");
}

// 8. 名前回答がプライバシー整形を通る（「山田太郎」→「山田 ★.」）
{
  const s = makeSession();
  s.step = "awaiting_genre_choice";
  applyGenreChoice(s, "a"); // trial、最初の質問は name
  applyGenreDetailAnswer(s, "山田太郎");
  assert.equal(s.genres[0].data.name, "山田 ★.");
}

// 9. applyMoreGenreAnswer: 再度別ジャンル開始
{
  const s = makeSession();
  s.step = "awaiting_genre_choice";
  applyGenreChoice(s, "a");
  // trial の全質問完了させる
  const qc = __interviewInternals.GENRE_QUESTIONS.trial.length;
  for (let i = 0; i < qc; i++) applyGenreDetailAnswer(s, "x");
  assert.equal(s.step, "awaiting_more_genre");

  // 別ジャンル開始（inquiry）
  const r = applyMoreGenreAnswer(s, "c");
  assert.equal(s.activeGenre, "inquiry");
  assert.equal(s.genres.length, 2);
  assert.ok(r.prompt.includes("問い合わせ"));
}

// 10. advanceConversation: ステップに応じて分岐
{
  const s = makeSession();
  // awaiting_yes_no
  advanceConversation(s, "はい");
  assert.equal(s.step, "awaiting_genre_choice");
  advanceConversation(s, "a");
  assert.equal(s.step, "awaiting_genre_detail");
}

// 11. ready_to_save 状態で advance しても落ちない
{
  const s = makeSession();
  s.step = "ready_to_save";
  const r = advanceConversation(s, "なんか送られた");
  assert.equal(r.finished, true);
}

console.log("interview flow tests passed");
