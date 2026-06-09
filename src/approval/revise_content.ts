import type { DraftRecord } from "../types.js";

/**
 * `修正 <内容>` で受け取った新しい本文を、候補の各媒体下書きに反映する。
 * - 入力テキストをそのまま新しい本文（body）にする（LLM 不使用・確実）。
 * - title / cta / hashtags / platform / publicationLevel は維持する。
 * - 状態は pending_approval のまま（修正＝確定・投稿にしない。必ず再承認を挟む）。
 * 純粋関数（副作用なし）。保存・安全チェックは呼び出し側で行う。
 */
export function applyBodyEdit(record: DraftRecord, newBody: string, now = new Date()): DraftRecord {
  const trimmed = newBody.trim();
  return {
    ...record,
    drafts: record.drafts.map((draft) => ({ ...draft, body: trimmed })),
    status: "pending_approval",
    updatedAt: now.toISOString(),
  };
}

/** 修正本文として使える内容か（空・空白のみは不可）。 */
export function isUsableRevisionText(text: string): boolean {
  return text.trim().length > 0;
}
