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

// すべての意図でフォールバック返信が「優しさゲート」を通る（沈黙しない＝good/perfect）
const samples = ["料金は？", "場所はどこ？", "クラス教えて", "今日やってる？", "体験したい", "こんにちは", "ええと"];
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
