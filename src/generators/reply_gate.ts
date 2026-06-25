// 返信の出力ゲート — 生成した顧客向け返信を、送る前に4観点で採点する。
//
// generateInquiryReply の結果を受け取り、各返信に response_quality スコアを付ける。
// 生成内容は変えない。人間が「100点未満なら修正提案を見て直す」ための情報を足すだけ。
// （世界一優しい回答システムの最終ゲート）

import {
  scoreResponseQuality,
  type ResponseQualityResult,
} from "../safety/response_quality.js";
import type { InquiryReplyResult } from "./inquiry_reply.js";

export interface GatedReply {
  /** 返信の種類ラベル（丁寧／短め／予約誘導 など） */
  label: string;
  /** 採点対象の本文 */
  reply: string;
  quality: ResponseQualityResult;
}

export interface ReplyGateResult {
  gated: GatedReply[];
  /** 最も低い合計点（0..100） */
  worstTotal: number;
  /** revise / reject が1つでもあれば true（人間の修正が必要） */
  needsRevision: boolean;
}

/** 顧客に送る即時返信のみをゲート対象にする（属性分類や注意書きは対象外）。 */
function customerFacingReplies(result: InquiryReplyResult): Array<[string, string]> {
  const r = result.replies;
  const entries: Array<[string, string]> = [
    ["丁寧な返信", r.polite],
    ["短めの返信", r.short],
    ["予約誘導", r.bookingFocused],
    ["24時間後の追客", r.followUp24h],
    ["3日後の追客", r.followUp3d],
  ];
  if (r.obstacleConsult) entries.push(["難条件の相談への返信", r.obstacleConsult]);
  return entries;
}

/** 生成した返信群を4観点で採点して返す。送信はしない。 */
export function gateInquiryReplies(result: InquiryReplyResult): ReplyGateResult {
  const gated: GatedReply[] = customerFacingReplies(result).map(([label, reply]) => ({
    label,
    reply,
    quality: scoreResponseQuality(reply),
  }));

  const worstTotal = gated.reduce((min, g) => Math.min(min, g.quality.total), 100);
  const needsRevision = gated.some(
    g => g.quality.decision === "revise" || g.quality.decision === "reject",
  );

  return { gated, worstTotal, needsRevision };
}

/** CLI 表示用の品質チェックセクションを組み立てる。 */
export function renderGate(gate: ReplyGateResult): string {
  const lines: string[] = [];
  for (const g of gate.gated) {
    const mark =
      g.quality.decision === "perfect" ? "💯" :
      g.quality.decision === "good" ? "✅" :
      g.quality.decision === "revise" ? "✏️" : "⛔";
    lines.push(`${mark} ${g.label}: ${g.quality.total}/100 (${g.quality.decision})`);
    for (const s of g.quality.suggestions) lines.push(`   修正提案: ${s}`);
  }
  lines.push("");
  lines.push(
    gate.needsRevision
      ? `⚠ 最低点 ${gate.worstTotal}/100。上の修正提案を反映してから送信してください。`
      : `✅ すべて水準を満たしています（最低点 ${gate.worstTotal}/100）。最終確認のうえ送信してください。`,
  );
  return lines.join("\n");
}
