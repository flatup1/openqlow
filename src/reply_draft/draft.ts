// 受信1件から「下書き」を組み立てる。
//
// 新しい文章生成は持たない。既存の資産をこの順で通すだけ:
//   ① inquiry_reply  返信案と仕分け（優先度・次の一手）
//   ② reply_gate     4観点の採点（revise/reject は人間へ）
//   ③ safety/check   断定・誇張・医療表現などの検査
//   ④ privacy/rules  電話番号・メールを伏字にする
//
// ここでは保存も送信もしない。作るだけ。

import { generateInquiryReply, type InquiryClassification } from "../generators/inquiry_reply.js";
import { gateInquiryReplies } from "../generators/reply_gate.js";
import { pseudonymize } from "../line_bot/pseudonymize.js";
import { sanitiseFreeText } from "../privacy/rules.js";
import { checkDraftSafety } from "../safety/check.js";
import { triageInbound, type TriageResult } from "./triage.js";
import type { ReplyDraftSource } from "./config.js";

export interface InboundMessage {
  /** 受信元 */
  source: ReplyDraftSource;
  /** 受信元での一意なID（LINEのmessageIdなど）。重複を防ぐ鍵になる。 */
  externalId: string;
  /** 本文 */
  text: string;
  /** 送信者ID（LINEのuserIdなど）。そのままは保存しない。 */
  senderId?: string;
  /** 受信時刻（ISO） */
  receivedAt: string;
}

export interface ReplyDraft {
  /** 下書きID */
  id: string;
  source: ReplyDraftSource;
  externalId: string;
  /** 伏せた送信者ID。元のIDは保存しない。 */
  maskedSender: string;
  receivedAt: string;
  createdAt: string;
  /** 受け取った本文（伏字済み） */
  inboundText: string;
  triage: TriageResult;
  /** 下書き本文。人間確認が必要なときは undefined。 */
  draftText?: string;
  /** 短い版。LINE通知に載せる用。 */
  shortDraftText?: string;
  classification?: InquiryClassification;
  /** 返信品質の最低点（0..100） */
  qualityScore?: number;
  /** true なら文案を出さず、JIN確認だけ求める */
  needsHuman: boolean;
  /** JIN確認が必要な理由 */
  humanReason?: string;
  /** 状態。作った時点では必ず未送信。 */
  status: "draft_only";
  /** LINE通知を送った時刻。まだなら undefined。 */
  notifiedAt?: string;
}

/** 下書きIDは受信元と外部IDから決まる。同じ受信からは常に同じIDになる。 */
export function draftIdFor(source: ReplyDraftSource, externalId: string): string {
  return `${source}-${pseudonymize(externalId, 10)}`;
}

/** 品質が足りない返信は出さない。ここが「変な文章を渡さない」最後の関門。 */
const QUALITY_FLOOR = 70;

export function buildReplyDraft(inbound: InboundMessage, now: Date = new Date()): ReplyDraft {
  const base = {
    id: draftIdFor(inbound.source, inbound.externalId),
    source: inbound.source,
    externalId: inbound.externalId,
    maskedSender: pseudonymize(inbound.senderId),
    receivedAt: inbound.receivedAt,
    createdAt: now.toISOString(),
    inboundText: sanitiseFreeText(inbound.text.trim()),
    status: "draft_only" as const,
  };

  const triage = triageInbound(inbound.text);
  if (triage.route === "human_only") {
    return { ...base, triage, needsHuman: true, humanReason: triage.reason };
  }

  const generated = generateInquiryReply({ message: inbound.text });
  const gate = gateInquiryReplies(generated);

  if (gate.needsRevision || gate.worstTotal < QUALITY_FLOOR) {
    return {
      ...base,
      triage,
      classification: generated.classification,
      qualityScore: gate.worstTotal,
      needsHuman: true,
      humanReason: `返信の品質が基準に届かない（${gate.worstTotal}点）`,
    };
  }

  const polite = generated.replies.polite;
  const safety = checkDraftSafety(polite);
  if (!safety.ok) {
    const blocking = safety.issues.filter(issue => issue.severity === "block");
    if (blocking.length > 0) {
      return {
        ...base,
        triage,
        classification: generated.classification,
        qualityScore: gate.worstTotal,
        needsHuman: true,
        humanReason: `安全チェックで止まった（${blocking[0].message}）`,
      };
    }
  }

  return {
    ...base,
    triage,
    classification: generated.classification,
    qualityScore: gate.worstTotal,
    draftText: sanitiseFreeText(polite),
    shortDraftText: sanitiseFreeText(generated.replies.short),
    needsHuman: false,
  };
}
