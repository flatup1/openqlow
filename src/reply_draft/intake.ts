// webhook から呼ばれる受け口。
//
// ここは「受信を待ち行列に置く」だけ。下書きは作らないし、返信もしない。
// webhook の応答を遅らせないため、重い処理（生成・保存・通知）は run.ts が後でまとめて行う。
//
// 返す形は webhook の他のハンドラと同じにし、replyToSender は必ず false。
// お客様へは1文字も返さない。

import { openqlowPath } from "../utils/paths.js";
import { loadReplyDraftConfig, type ReplyDraftConfig } from "./config.js";
import type { InboundMessage } from "./draft.js";
import { appendInbound } from "./store.js";

export interface CaptureInput {
  text: string;
  lineUserId?: string;
  messageId?: string;
}

export interface CaptureResult {
  ok: true;
  action: "reply_draft_captured" | "reply_draft_skipped";
  /** 待ち行列に入れたか */
  captured: boolean;
  reason?: string;
  /** お客様へは絶対に返さない。 */
  replyToSender: false;
}

export interface CaptureOptions {
  config?: ReplyDraftConfig;
  stateDir?: string;
  now?: Date;
}

/** LINE公式で受けたお客様のメッセージを、下書き待ちとして記録する。 */
export async function captureInboundForDraft(
  input: CaptureInput,
  opts: CaptureOptions = {},
): Promise<CaptureResult> {
  const config = opts.config ?? loadReplyDraftConfig();

  if (config.disabled || !config.enabled || !config.sources.includes("line")) {
    return { ok: true, action: "reply_draft_skipped", captured: false, reason: "無効", replyToSender: false };
  }

  const text = (input.text ?? "").trim();
  if (!text) {
    return { ok: true, action: "reply_draft_skipped", captured: false, reason: "本文なし", replyToSender: false };
  }
  // 外部IDが無いと二重に下書きを作ってしまう。無いものは受け取らない。
  if (!input.messageId) {
    return { ok: true, action: "reply_draft_skipped", captured: false, reason: "messageIdなし", replyToSender: false };
  }

  const inbound: InboundMessage = {
    source: "line",
    externalId: input.messageId,
    text,
    senderId: input.lineUserId,
    receivedAt: (opts.now ?? new Date()).toISOString(),
  };

  try {
    await appendInbound(opts.stateDir ?? openqlowPath("state", "reply_drafts"), inbound);
  } catch {
    // 記録に失敗しても webhook は止めない。返信しないことは変わらない。
    return { ok: true, action: "reply_draft_skipped", captured: false, reason: "保存できず", replyToSender: false };
  }

  return { ok: true, action: "reply_draft_captured", captured: true, replyToSender: false };
}
