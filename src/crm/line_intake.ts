// LINE受信 → 見込み客の自動下書き化（接続口 / seam）
//
// LINE webhook（src/line_bot/ = Codex領域）から呼び出される想定の薄いアダプタ。
// webhook は受信イベントから userId と本文を取り出し、この関数を1回呼ぶだけでよい。
// webhook 本体には触れず、CRM側（src/crm/ = Claude領域）にだけ接続口を用意する。
//
// 厳守事項:
//   - 自動返信はしない。ここで作るのは下書きレコードと返信案のみ（送信はオーナー確認後）。
//   - 同一 LINE ユーザーは externalId で名寄せし、重複登録しない（更新する）。
//   - 既存客の status は new_inquiry へ戻さない（進行状態を尊重）。

import { buildProspectFromInquiry } from "./intake.js";
import type { ProspectStore } from "./store.js";
import type { Prospect, ProspectInput } from "./prospect.js";

export interface LineInquiry {
  /** LINE の userId（U... の擬似ID）。名寄せキー */
  lineUserId: string;
  /** 受信メッセージ本文 */
  text: string;
  /** 表示名（任意）。あれば名前として保存 */
  displayName?: string;
}

export interface LineIntakeResult {
  prospect: Prospect;
  /** オーナーが確認して送る返信下書き（自動送信はしない） */
  replyDraft: string;
  /** 新規作成なら true、既存客の更新なら false */
  created: boolean;
}

/**
 * LINE受信メッセージから見込み客を下書き登録（または更新）する。
 * @param inquiry LINE userId と本文
 * @param store 見込み客ストア
 * @param now タイムスタンプ生成（テスト用に差し替え可能）
 */
export async function intakeFromLineMessage(
  inquiry: LineInquiry,
  store: ProspectStore,
  now: () => Date = () => new Date(),
): Promise<LineIntakeResult> {
  const { lineUserId, text, displayName } = inquiry;
  if (!text || !text.trim()) {
    throw new Error("line inquiry text is required");
  }

  const { prospect, replyDraft } = buildProspectFromInquiry(
    { message: text },
    { name: displayName ?? "", contactSource: "LINE", now },
  );

  const existing = lineUserId ? await store.findByExternalId(lineUserId) : undefined;

  if (existing) {
    // 既存客: 最新の問い合わせ内容・返信案・温度感・連絡時刻を更新。status は触らない（前進のみ）。
    const patch: ProspectInput = {
      inquiryText: prospect.inquiryText,
      aiReply: prospect.aiReply,
      temperature: prospect.temperature,
      purpose: prospect.purpose || existing.purpose,
      nextAction: prospect.nextAction,
      lastContactAt: prospect.lastContactAt,
      name: existing.name || prospect.name || "",
    };
    const updated = await store.update(existing.id, patch);
    return { prospect: updated!, replyDraft, created: false };
  }

  const created = await store.create({ ...prospect, externalId: lineUserId });
  return { prospect: created, replyDraft, created: true };
}
