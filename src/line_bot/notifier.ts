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
  /** 送ってよい相手（テスト用の差し替え）。既定は JIN_LINE_USER_ID と BACKUP_APPROVER_LINE_USER_ID。 */
  approvedRecipients?: ReadonlySet<string>;
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

// openQLOW が LINE を送ってよい相手は、Jin と予備の承認者だけ。
// お客様への直接送信は AIKA と Jin の仕事で、openQLOW の担当ではない。
// （src/safety/forbidden_actions.ts の send_to_customer_directly）
function approvedRecipients(opts: PushOptions): ReadonlySet<string> {
  if (opts.approvedRecipients) return opts.approvedRecipients;
  return new Set(
    [envOrEmpty("JIN_LINE_USER_ID"), envOrEmpty("BACKUP_APPROVER_LINE_USER_ID")].filter(Boolean),
  );
}

export async function pushLineMessage(text: string, opts: PushOptions = {}): Promise<{ ok: boolean; mode: "dry_run" | "sent" | "skipped"; error?: string }> {
  const token = opts.token ?? envOrEmpty("LINE_CHANNEL_ACCESS_TOKEN");
  const userId = opts.userId ?? envOrEmpty("JIN_LINE_USER_ID");
  const explicitDryRun = opts.dryRun ?? (process.env.OPENQLOW_LINE_DRY_RUN === "true");

  if (!token || !userId) {
    console.log(safeLineLog("push_skipped"));
    return { ok: true, mode: "skipped" };
  }

  // 送り先の検査は dry run より前に置く。dry run でも送り先が間違っていることは分かるべきで、
  // 本番に切り替えた瞬間に初めて気づく、という形にしてはいけない。
  const approved = approvedRecipients(opts);
  if (approved.size === 0) {
    // 承認された送り先が1つも設定されていないなら、相手が正しいことを確かめられない。送らない。
    console.log(safeLineLog("push_skipped"));
    return { ok: true, mode: "skipped" };
  }
  if (!approved.has(userId)) {
    // ここで throw して止める。ルールを書いてあるだけでなく、実装で通れなくする。
    assertNotForbidden("send_to_customer_directly");
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
