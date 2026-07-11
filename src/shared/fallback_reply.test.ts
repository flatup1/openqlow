import { detectIntent, fallbackReply, safeReply } from "./fallback_reply.js";
import { scoreResponseQuality } from "./response_quality.js";
import { FLATUP_CANON } from "./canon.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 意図判定
assert(detectIntent("料金はいくらですか") === "price", "price intent");
assert(detectIntent("場所はどこですか") === "access", "access intent");
assert(detectIntent("どんなクラスがありますか") === "classes", "classes intent");
assert(detectIntent("今日はやってますか") === "hours", "hours intent");
assert(detectIntent("体験したいです") === "trial", "trial intent");
assert(detectIntent("こんにちは") === "greeting", "greeting intent");
assert(detectIntent("あの、ちょっと聞きたくて") === "unknown", "unknown intent");

// 退会・休会・違約金：正しい意図で拾い、体験(trial)へ化けさせない（#5と同じバグの回帰防止）
assert(detectIntent("退会したいです") === "cancellation", "退会 -> cancellation");
assert(detectIntent("入会して半年ですが違約金ありますか？") === "cancellation", "違約金 -> cancellation (not trial)");
assert(detectIntent("解約したい") === "cancellation", "解約 -> cancellation");
assert(detectIntent("休会はできますか？") === "suspension", "休会 -> suspension");

// 退会返信：退会届・翌月末退会を案内し、体験のお誘いにしない／断定せず人間確認へ
const cancelReply = fallbackReply("退会したいです");
assert(cancelReply.includes("退会届"), "cancellation reply mentions 退会届 (from canon)");
assert(cancelReply.includes("翌月末"), "cancellation reply mentions 翌月末退会");
assert(!cancelReply.includes("初回体験500円"), "cancellation reply is NOT a trial invite");
assert(cancelReply.includes("担当スタッフ"), "cancellation reply hands off to staff (no 断定)");
// 「入会」を含む違約金の質問も体験に化けない
assert(!fallbackReply("入会して半年ですが違約金ありますか？").includes("初回体験500円"), "違約金 question is not a trial invite");
// 休会返信
assert(fallbackReply("休会はできますか？").includes("休会"), "suspension reply mentions 休会");
assert(fallbackReply("休会はできますか？").includes("担当スタッフ"), "suspension reply hands off to staff");

// すべての意図でフォールバック返信が「優しさゲート」を通る（沈黙しない＝good/perfect）
const samples = ["料金は？", "場所はどこ？", "クラス教えて", "今日やってる？", "体験したい", "こんにちは", "ええと", "退会したい", "違約金はいくら？", "休会できますか"];
for (const m of samples) {
  const q = scoreResponseQuality(fallbackReply(m));
  assert(q.decision === "good" || q.decision === "perfect", `fallback for "${m}" must pass gate, got ${q.decision} (${q.total})`);
}

// 正本値を使っている（直書きでなくcanon由来）
assert(fallbackReply("料金は？").includes(FLATUP_CANON.priceWomen), "price fallback uses canon women price");
assert(fallbackReply("場所は？").includes(FLATUP_CANON.nearestStation), "access fallback uses canon station");

// safeReply: 生成が落ちたら沈黙せずフォールバック
const broke = safeReply("料金は？", () => { throw new Error("LLM 401"); });
assert(broke.usedFallback === true, "throw -> fallback used");
assert(broke.reply.trim().length > 0, "fallback reply not empty");
const empty = safeReply("料金は？", () => "");
assert(empty.usedFallback === true, "empty -> fallback used");
const ok = safeReply("x", () => "ちゃんとした返信です😊");
assert(ok.usedFallback === false && ok.reply.includes("ちゃんとした"), "good generate -> no fallback");

console.log("fallback_reply tests passed");
