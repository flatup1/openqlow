import type { DraftRecord } from "../types.js";
import { loadConfig } from "../config.js";
import { rememberApprovalCandidate } from "../approval/shortcut.js";
import { assertNotForbidden } from "../safety/forbidden_actions.js";
import { safeLineLog } from "./webhook_security.js";

interface LineMessage {
  type: "text";
  text: string;
}

interface PushOptions {
  /** When true, no API call is made — message is printed to stdout. */
  dryRun?: boolean;
  token?: string;
  userId?: string;
  fetchImpl?: typeof fetch;
}

const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const LINE_MESSAGE_MAX_CHARS = 5000;

function chunkForLine(text: string): string[] {
  if (text.length <= LINE_MESSAGE_MAX_CHARS) return [text];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    chunks.push(text.slice(cursor, cursor + LINE_MESSAGE_MAX_CHARS));
    cursor += LINE_MESSAGE_MAX_CHARS;
  }
  return chunks;
}

function envOrEmpty(name: string): string {
  return process.env[name] ?? "";
}

// OPENQLOW が LINE で話して良いのは Jin（と代理承認者）だけ。
// 顧客への直接送信(send_to_customer_directly)はAIKA/Jinの領域なので、
// 承認済み宛先以外への送信要求は物理的に止める（forbidden_actions.ts が正本）。
function assertApprovedRecipient(userId: string): void {
  const approved = new Set(
    [envOrEmpty("JIN_LINE_USER_ID"), envOrEmpty("BACKUP_APPROVER_LINE_USER_ID")].filter(Boolean),
  );
  if (approved.size > 0 && !approved.has(userId)) {
    assertNotForbidden("send_to_customer_directly");
  }
}

export async function pushLineMessage(text: string, opts: PushOptions = {}): Promise<{ ok: boolean; mode: "dry_run" | "sent" | "skipped"; error?: string }> {
  const token = opts.token ?? envOrEmpty("LINE_CHANNEL_ACCESS_TOKEN");
  const userId = opts.userId ?? envOrEmpty("JIN_LINE_USER_ID");
  assertApprovedRecipient(userId);
  const explicitDryRun = opts.dryRun ?? (process.env.OPENQLOW_LINE_DRY_RUN === "true");

  if (!token || !userId) {
    console.log(safeLineLog("push_skipped"));
    return { ok: true, mode: "skipped" };
  }
  if (explicitDryRun) {
    console.log(safeLineLog("push_dry_run"));
    return { ok: true, mode: "dry_run" };
  }

  const chunks = chunkForLine(text);
  const messages: LineMessage[] = chunks.map(chunk => ({ type: "text", text: chunk }));

  console.log(safeLineLog("push_sending"));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(LINE_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: userId, messages }),
  });

  if (!res.ok) {
    const error = `LINE push ${res.status}`;
    console.error(safeLineLog("push_failed"));
    return { ok: false, mode: "sent", error };
  }
  return { ok: true, mode: "sent" };
}

export async function pushApprovalNotification(record: DraftRecord, opts: PushOptions = {}): Promise<{ ok: boolean; mode: "dry_run" | "sent" | "skipped"; error?: string }> {
  await rememberApprovalCandidate(loadConfig().root, record.id);
  return pushLineMessage(record.approvalMessage, opts);
}

export async function pushAlert(subject: string, body: string, opts: PushOptions = {}): Promise<{ ok: boolean; mode: "dry_run" | "sent" | "skipped"; error?: string }> {
  const text = [`【OPENQLOW Alert】 ${subject}`, "", body].join("\n");
  return pushLineMessage(text, opts);
}
