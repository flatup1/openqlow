// AIKA（守りの受付）統合パイプライン。
//
// AIKA本体(flatup-ai-os)の LLM返信（line_reply / followup / review_request …）を、
// openQLOW の安全網に通す「合体の接点」。flatup-ai-os はこの1関数を呼ぶだけでよい:
//
//   const out = receptionReply(input, () => lineReply(system, input));
//   if (out.approved) send(out.reply); else 人間確認(out);
//
// 流れ:
//   ① 正本(FLATUP_CANON)を canonContext() でプロンプトに渡し、料金/住所を勝手に作らせない
//   ② LLMで生成（落ちたら沈黙せずフォールバック）
//   ③ 送信前に scoreResponseQuality でゲート。reject は安全な正本返信に差し替え（rejectは絶対送らない）
//   ④ good/perfect のみ approved=true（送信可）。revise は人間確認に回す。

import { FLATUP_CANON as C } from "../shared/canon.js";
import {
  scoreResponseQuality,
  type ReplyContext,
  type ResponseQualityResult,
} from "../shared/response_quality.js";
import { fallbackReply } from "../shared/fallback_reply.js";

export interface ReceptionResult {
  /** 最終的にお客様へ出す（人間確認後に送る）下書き本文 */
  reply: string;
  /** llm = AIが生成 / fallback = 障害 or reject で正本返信に差し替え */
  source: "llm" | "fallback";
  quality: ResponseQualityResult;
  /** good/perfect なら true（送信OK）。revise は false（人間確認） */
  approved: boolean;
}

/** LLMプロンプトに渡す「正本の事実」。AIに正本だけを使わせるためのコンテキスト。 */
export function canonContext(): string {
  return [
    "【FLATUP GYM 正本（この事実だけを使う・推測しない）】",
    `料金: ${C.trialFirst} / 月会費 ${C.priceKids}・${C.priceWomen}・${C.priceMen} / ${C.joinFee}`,
    `グローブ等: ${C.gloveSet}`,
    `場所: ${C.address}（最寄り ${C.nearestStation}）/ ${C.access} / ${C.parking}`,
    `営業: ${C.businessHours}`,
    `クラス: ${C.classes}`,
    `体験枠: キッズ ${C.scheduleKids} / レディース ${C.scheduleLadies} / 男性 ${C.bookingMen} / 女性 ${C.bookingWomen} / ${C.noBooking}`,
    `特典: ${C.parentDiscount} / ${C.referralBenefit}`,
    "口調: 世界一優しい・初心者や女性が安心・怒鳴らない・押し売りしない・末尾に必要なら『AIKA』。",
  ].join("\n");
}

/**
 * AIの返信を安全網に通して、送ってよい下書きを返す。送信はしない（生成のみ）。
 * @param message お客様のメッセージ
 * @param generate LLMで返信を作る関数（落ちうる）
 * @param ctx 既知スロット・直近返信（再質問/重複検出に使う）
 */
export function receptionReply(
  message: string,
  generate: () => string,
  ctx: ReplyContext = {},
): ReceptionResult {
  let reply: string;
  let source: "llm" | "fallback";
  try {
    const r = generate();
    if (r && r.trim()) {
      reply = r;
      source = "llm";
    } else {
      reply = fallbackReply(message);
      source = "fallback";
    }
  } catch {
    reply = fallbackReply(message);
    source = "fallback";
  }

  let quality = scoreResponseQuality(reply, ctx);

  // LLMの返信が「却下」級なら、絶対に送らず正本ベースの安全返信へ差し替える。
  if (source === "llm" && quality.decision === "reject") {
    reply = fallbackReply(message);
    source = "fallback";
    quality = scoreResponseQuality(reply, ctx);
  }

  const approved = quality.decision === "good" || quality.decision === "perfect";
  return { reply, source, quality, approved };
}
