// LINE公式の問い合わせを、返信下書きルーティンへ渡す受け口。
//
// 既存のWebhookは壊さない。ここは「今まで誰も拾わずに捨てられていたメッセージ」だけを
// 受け取る追加口で、既存の退会受付・Brand Growth の経路には触れない。
//
// このファイルは絶対にお客様へ返信しない。replyToSender は常に false を返す。
// 例外も外へ出さない。下書きが作れなかったとしても、Webhookの応答は壊さない。

import { processInquiryEvent, type PipelineDeps, type ProcessOutcome } from "./pipeline.js";

export interface ReplyDraftIntakeResult {
  ok: boolean;
  action: string;
  /** 下書きとして受け付けたか。既存ハンドラの handled と同じ意味で使う。 */
  handled: boolean;
  /** 常に false。お客様へは何も返さない。 */
  replyToSender: false;
  outcome?: ProcessOutcome;
  draftId?: string;
}

export interface LineInquiryInput {
  text: string;
  lineUserId?: string;
  /** LINE の webhookEventId。無ければ messageId、それも無ければ指紋で重複判定する。 */
  webhookEventId?: string;
  messageId?: string;
  /** LINEイベントの timestamp（ms）。 */
  timestamp?: number;
}

export async function captureLineInquiryDraft(
  input: LineInquiryInput,
  deps: PipelineDeps = {},
): Promise<ReplyDraftIntakeResult> {
  if (!input.text || !input.text.trim()) {
    return { ok: true, action: "reply_draft_skipped", handled: false, replyToSender: false };
  }

  try {
    const result = await processInquiryEvent(
      {
        source: "line",
        text: input.text,
        senderId: input.lineUserId,
        eventId: input.webhookEventId || input.messageId,
        timestamp: input.timestamp,
      },
      deps,
    );

    return {
      ok: result.ok,
      action: `reply_draft_${result.outcome}`,
      // 機能が止まっている間は「拾っていない」と正直に返す。既存の ignored 応答を保つため。
      handled: result.outcome === "saved" || result.outcome === "duplicate",
      replyToSender: false,
      outcome: result.outcome,
      draftId: result.draftId,
    };
  } catch {
    // 下書き作成の失敗で、LINE Webhook の応答そのものを壊さない。
    return { ok: false, action: "reply_draft_failed", handled: false, replyToSender: false };
  }
}
