// 返信下書きの作成。
//
// 新しいAIロジックは足さない。既存の部品を、決まった順番で通すだけにする（要件 §24）。
//
//   privacy/rules      個人情報を伏字にする（ここから先は伏字の本文しか流れない）
//   triage             分類・優先度・JIN確認の判定
//   inquiry_reply      正本(FLATUP_CANON)ベースの返信候補を作る
//   reply_gate         返信候補を4観点で採点する
//   aika/receptionist  正本と口調のゲートを通す（却下級なら正本フォールバックへ）
//   safety/check       誇張・断定・医療表現・危険表現・不適切表現を検出
//   canon 金額ガード   正本に無い金額が入っていたら下書きにしない
//
// 送信は一切しない。ここが返すのは「JINが読む下書き」だけ。

import { FLATUP_CANON } from "../shared/canon.js";
import { receptionReply } from "../aika/receptionist.js";
import { generateInquiryReply } from "../generators/inquiry_reply.js";
import { gateInquiryReplies } from "../generators/reply_gate.js";
import { sanitiseFreeText } from "../privacy/rules.js";
import { checkDraftSafety } from "../safety/check.js";
import {
  triageInquiry,
  type EscalationReason,
  type InquiryCategory,
  type InquiryPriority,
} from "./triage.js";

export interface ReplyDraftBuild {
  /** 伏字済みの問い合わせ本文。保存・通知に使うのはこちらだけ。 */
  maskedMessage: string;
  category: InquiryCategory;
  priority: InquiryPriority;
  escalate: boolean;
  reasons: EscalationReason[];
  aboutMinor: boolean;
  /** JINが送る下書き本文。escalate のときは undefined（AIは書かない）。 */
  body?: string;
  /** reply_gate / receptionist の採点結果（0..100）。 */
  qualityTotal?: number;
  /** 人の手直しが要ると採点で判断されたか。 */
  needsRevision?: boolean;
  notes: string[];
}

// safety/check は SNS投稿の下書き用も兼ねているため、投稿専用の指摘まで拾ってしまう。
// 顧客への返信では次の指摘だけを「下書きにしない理由」として扱う。
//   - salesy_cta / unsafe_auto_publish : 投稿ルール。返信で体験へ案内するのは正しい振る舞い
//   - missing_flatup_value             : 警告レベル（severity: warn）で、返信の可否には使わない
const REPLY_BLOCKING_SAFETY_CODES = new Set([
  "pii_phone",
  "pii_email",
  "other_gym_attack",
  "overclaim",
  "body_shaming",
  "fear_baiting",
  "before_after_baiting",
  "elitist_phrasing",
  "medical_claim",
  "mocking_weakness",
  "blaming_effort",
  "low_kindness_score",
]);

// 正本に載っていない金額を、AIが作文して出さないためのガード（要件 §26）。
const CANON_TEXT = Object.values(FLATUP_CANON).join(" ").replace(/\s/g, "");

/** 本文中の「◯◯円」のうち、正本に無いものを返す。空なら正本どおり。 */
export function nonCanonAmounts(text: string): string[] {
  const found = text.match(/\d[\d,]*\s*円/g) ?? [];
  const unknown = found
    .map(amount => amount.replace(/\s/g, ""))
    .filter(amount => !CANON_TEXT.includes(amount));
  return Array.from(new Set(unknown));
}

/**
 * 温度が高い（体験・予約の意思がある）問い合わせには、予約誘導の下書きを主に使う。
 *
 * 退会・休会の相談は triage が先にJIN確認へ回すのでここには来ない。それでも
 * membershipConsult を先に見るのは、片方の判定だけが変わったときに
 * 体験誘導の文面が退会相談へ出てしまう事故を防ぐため。
 */
function pickBaseReply(result: ReturnType<typeof generateInquiryReply>): string {
  if (result.replies.membershipConsult) return result.replies.membershipConsult;
  if (result.replies.obstacleConsult) return result.replies.obstacleConsult;
  return result.classification.temperature === "high"
    ? result.replies.bookingFocused
    : result.replies.polite;
}

/**
 * 問い合わせ1件から下書きを作る。純関数（保存も送信もしない）。
 */
export function buildReplyDraft(rawMessage: string): ReplyDraftBuild {
  // STEP 3: 個人情報マスキング。ここから先は伏字の本文しか扱わない。
  const maskedMessage = sanitiseFreeText(rawMessage).trim();

  // STEP 5-6: 分類と危険判定。
  const triage = triageInquiry(maskedMessage);
  const base: ReplyDraftBuild = {
    maskedMessage,
    category: triage.category,
    priority: triage.priority,
    escalate: triage.escalate,
    reasons: [...triage.reasons],
    aboutMinor: triage.aboutMinor,
    notes: [],
  };

  if (triage.escalate) {
    base.notes.push("AIは返信本文を作っていません。JINが内容を確認してください。");
    return base;
  }

  // STEP 7-9: 返信候補の生成 → 出力ゲート → 受付ゲート。
  let generated: ReturnType<typeof generateInquiryReply>;
  try {
    generated = generateInquiryReply({ message: maskedMessage });
  } catch {
    // 生成できない問い合わせ（空文など）は、推測で埋めずJIN確認へ回す。
    return {
      ...base,
      escalate: true,
      priority: "ESCALATE",
      reasons: [...base.reasons, "too_little_information"],
      notes: ["返信案を作れませんでした。JINが内容を確認してください。"],
    };
  }

  const gate = gateInquiryReplies(generated);
  const reception = receptionReply(maskedMessage, () => pickBaseReply(generated));

  // STEP 10: 安全チェック。返信として出してはいけない表現が残っていたらJIN確認へ。
  const safety = checkDraftSafety(reception.reply);
  const blocking = safety.issues.filter(
    issue => issue.severity === "block" && REPLY_BLOCKING_SAFETY_CODES.has(issue.code),
  );
  if (blocking.length > 0) {
    return {
      ...base,
      escalate: true,
      priority: "ESCALATE",
      reasons: [...base.reasons, "safety"],
      notes: [
        "安全チェックで指摘が出たため、AIは返信本文を出しません。",
        ...blocking.map(issue => `指摘: ${issue.message}`),
      ],
    };
  }

  // 正本に無い金額が混ざっていたら、下書きにしない（推測の値段をJINに見せない）。
  const strayAmounts = nonCanonAmounts(reception.reply);
  if (strayAmounts.length > 0) {
    return {
      ...base,
      escalate: true,
      priority: "ESCALATE",
      reasons: [...base.reasons, "special_request"],
      notes: [
        `正本にない金額（${strayAmounts.join(" / ")}）が含まれたため、下書きにしませんでした。`,
        "料金は src/shared/canon.ts の値だけを使います。",
      ],
    };
  }

  // STEP 11: 念のためもう一度伏字を通す（保存・通知に生の連絡先を残さない）。
  const body = sanitiseFreeText(reception.reply);

  const notes = [...generated.notes];
  if (gate.needsRevision) notes.push("採点で手直し推奨が出ています。送信前に文面を確認してください。");
  if (reception.source === "fallback") notes.push("返信案は正本ベースの安全文に差し替えています。");

  return {
    ...base,
    body,
    qualityTotal: Math.min(gate.worstTotal, reception.quality.total),
    needsRevision: gate.needsRevision || !reception.approved,
    notes,
  };
}
