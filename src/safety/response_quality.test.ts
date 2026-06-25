import {
  scoreResponseQuality,
  scoreEmpathy,
  scoreNaturalness,
  scoreNonDuplication,
} from "./response_quality.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 完璧な返信は 100/100 / perfect ---
// 共感 → 安心材料 → 1問だけ。FLATUPらしい優しさ。重複なし。
const perfect = scoreResponseQuality(
  "ご不安ですよね😊 FLATUP GYMは怒鳴らない、世界一優しい格闘技ジムです。" +
    "初心者の方も自分のペースで安心して始められますよ。" +
    "まずはご希望の曜日だけ教えていただけますか？",
);
assert(perfect.total === 100, `ideal reply should score 100, got ${perfect.total}`);
assert(perfect.decision === "perfect", "ideal reply should be perfect");
assert(perfect.suggestions.length === 0, "ideal reply should have no suggestions");

// --- ① 寄り添い: 機械的な列挙要求はNG（ログ実例）---
const mechanical = scoreEmpathy("体験予約ですね。以下の3点を教えてください。1.お名前 2.種目 3.日時");
assert(mechanical.score < 15, `mechanical list should lose empathy points, got ${mechanical.score}`);
assert(mechanical.issues.length > 0, "mechanical list should produce empathy issue");

// 一度に質問が多すぎる
const tooMany = scoreEmpathy("お名前は？種目は？日時は？人数は？");
assert(tooMany.score < 20, `too many questions should lose points, got ${tooMany.score}`);

// 共感＋1問は満点
const empatheticOne = scoreEmpathy("痛くないか心配ですよね😊 まずはご希望の曜日を教えていただけますか？");
assert(empatheticOne.score === 25, `empathetic single question should be full, got ${empatheticOne.score}`);

// --- ② 不自然さ: スタック定型はNG（ログ実例）---
const stuck = scoreNaturalness("只今担当者が対応中です。少々お待ちください😊");
assert(stuck.score < 15, `stuck phrase should lose naturalness, got ${stuck.score}`);
assert(stuck.issues.some(i => i.includes("取次ぎ")), "stuck phrase should be flagged");

// 既知事項の再質問はNG（曜日を聞いた直後にまた曜日）
const reAsk = scoreNaturalness("ご希望の曜日を教えていただけますか？", { knownFacts: ["曜日"] });
assert(reAsk.score < 20, `re-asking known fact should lose points, got ${reAsk.score}`);
assert(reAsk.issues.some(i => i.includes("曜日")), "re-ask should mention the known fact");

// 既知でなければ満点
const freshAsk = scoreNaturalness("ご希望の曜日を教えていただけますか？", { knownFacts: [] });
assert(freshAsk.score === 25, `asking an unknown fact should be full, got ${freshAsk.score}`);

// --- ③ 重複: 直前と同一の再送はNG（ログ実例: 同じ投稿候補を連投）---
const prev = "投稿候補です。本文はこちらです。これで投稿しますか？";
const dup = scoreNonDuplication(prev, { recentReplies: [prev] });
assert(dup.score < 10, `duplicate reply should lose points, got ${dup.score}`);
assert(dup.issues.length > 0, "duplicate should be flagged");

// 文内反復もNG
const internalDup = scoreNonDuplication(
  "ありがとうございます。担当者より折り返しご連絡いたします。担当者より折り返しご連絡いたします。",
);
assert(internalDup.score < 25, `internal repetition should lose points, got ${internalDup.score}`);

// --- ④ 世界一優しい: 煽り・選民・恐怖はNG ---
const harsh = scoreResponseQuality("本気じゃないなら来るな。サボるな、根性で限界まで追い込め。");
assert(harsh.kindness.score <= 8, `harsh reply should score low kindness, got ${harsh.kindness.score}`);
assert(harsh.decision === "reject", "harsh reply must be rejected even if other axes are full");

// --- 総合: 定休日でも優しく代案を出す返信は高得点 ---
const closedDay = scoreResponseQuality(
  "本日は日曜で定休日なんです😊 ご不便おかけしてすみません。" +
    "明日からでしたら安心してご案内できますよ。ご希望の曜日だけ教えてくださいね。",
);
assert(closedDay.total >= 80, `kind closed-day reply should score high, got ${closedDay.total}`);

console.log("response_quality tests passed");
