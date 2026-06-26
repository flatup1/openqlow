import { receptionReply, receptionReplyAsync, canonContext } from "./receptionist.js";
import { FLATUP_CANON } from "../shared/canon.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 正本コンテキストに事実が入る（プロンプト注入用）
const ctx = canonContext();
assert(ctx.includes(FLATUP_CANON.priceWomen), "canon context has women price");
assert(ctx.includes(FLATUP_CANON.nearestStation), "canon context has station");
assert(ctx.includes("AIKA"), "canon context sets AIKA tone");

// ① 良いLLM返信 → そのまま採用・approved
const goodLlm =
  "ご不安ですよね😊 FLATUP GYMは怒鳴らない、世界一優しい格闘技ジムです。" +
  "初心者の方も安心して始められますよ。まずはご希望の曜日だけ教えていただけますか？";
const r1 = receptionReply("体験したいです", () => goodLlm);
assert(r1.source === "llm", "good llm reply used as-is");
assert(r1.approved === true, "good llm reply approved");

// ② LLMが落ちた（例外） → 沈黙せずフォールバック・approved
const r2 = receptionReply("料金は？", () => { throw new Error("OpenRouter 401"); });
assert(r2.source === "fallback", "throw -> fallback");
assert(r2.approved === true, "fallback reply approved (kind, canon-based)");
assert(r2.reply.includes(FLATUP_CANON.priceWomen), "fallback price reply uses canon");

// ③ LLMが空 → フォールバック
const r3 = receptionReply("場所は？", () => "");
assert(r3.source === "fallback", "empty -> fallback");
assert(r3.reply.includes(FLATUP_CANON.nearestStation), "fallback access uses canon");

// ④ LLMが煽り(reject級) → 絶対送らず正本返信へ差し替え
const harsh = "本気じゃないなら来るな。根性で限界まで追い込め。";
const r4 = receptionReply("体験したい", () => harsh);
assert(r4.source === "fallback", "reject-grade llm reply is replaced by fallback");
assert(r4.reply !== harsh, "harsh reply is never returned");
assert(r4.approved === true, "replacement is approved");

// ⑤ async版（AIKAのlineReplyはPromise）: 成功→llm、例外→fallback、reject→差し替え
const a1 = await receptionReplyAsync("体験したい", async () => goodLlm);
assert(a1.source === "llm" && a1.approved, "async good llm approved");
const a2 = await receptionReplyAsync("料金は？", async () => { throw new Error("401"); });
assert(a2.source === "fallback" && a2.approved, "async throw -> fallback approved");
const a3 = await receptionReplyAsync("体験したい", async () => harsh);
assert(a3.source === "fallback" && a3.reply !== harsh, "async reject -> replaced");

console.log("aika receptionist tests passed");
