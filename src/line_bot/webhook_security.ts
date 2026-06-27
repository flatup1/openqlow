export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

type SafeLineAction =
  | "text_received"
  | "reply_skipped"
  | "push_skipped"
  | "push_dry_run"
  | "push_sending"
  | "push_failed"
  | "reply_failed"
  | "processing_failed";

const SAFE_LINE_LOGS: Record<SafeLineAction, string> = {
  text_received: "[LINE] authorized text message received",
  reply_skipped: "[LINE] reply skipped",
  push_skipped: "[LINE] push skipped",
  push_dry_run: "[LINE] push dry-run",
  push_sending: "[LINE] sending notification",
  push_failed: "[LINE] push failed",
  reply_failed: "[LINE] reply failed",
  processing_failed: "[webhook] processing failed",
};

export function safeLineLog(action: SafeLineAction): string {
  return SAFE_LINE_LOGS[action];
}

export function publicWebhookError(): { ok: false; error: "internal_error" } {
  return { ok: false, error: "internal_error" };
}

export function exceedsWebhookBodyLimit(
  receivedBytes: number,
  nextChunkBytes: number,
  maxBytes = MAX_WEBHOOK_BODY_BYTES,
): boolean {
  return receivedBytes + nextChunkBytes > maxBytes;
}
