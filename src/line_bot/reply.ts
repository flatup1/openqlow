export interface QuickReplyItem {
  label: string;
  /** タップで送られるテキスト（uri 指定時は不要）。 */
  text?: string;
  /** 指定するとボタンはURLを開く（パネルを開く等）。 */
  uri?: string;
}

interface LineQuickReply {
  items: Array<{
    type: "action";
    action:
      | { type: "message"; label: string; text: string }
      | { type: "uri"; label: string; uri: string };
  }>;
}

interface LineMessage {
  type: "text";
  text: string;
  quickReply?: LineQuickReply;
}

interface ReplyOptions {
  token?: string;
  fetchImpl?: typeof fetch;
  quickReplies?: QuickReplyItem[];
}

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const LINE_MESSAGE_MAX_CHARS = 5000;
const LINE_QUICK_REPLY_MAX = 13;
const LINE_QUICK_LABEL_MAX = 20;

function trimForLine(text: string): string {
  if (text.length <= LINE_MESSAGE_MAX_CHARS) return text;
  return text.slice(0, LINE_MESSAGE_MAX_CHARS - 20) + "\n...(truncated)";
}

/** 結果オブジェクトからクイックリプライ（タップ式ボタン）を取り出す。 */
export function extractQuickReplies(results: Array<Record<string, unknown>>): QuickReplyItem[] | undefined {
  const first = results[0];
  const items = first?.quickReplies;
  if (!Array.isArray(items) || items.length === 0) return undefined;
  return items.filter((item): item is QuickReplyItem =>
    Boolean(item && typeof item === "object" && typeof (item as QuickReplyItem).label === "string"));
}

function buildQuickReply(items: QuickReplyItem[]): LineQuickReply | undefined {
  const usable = items.slice(0, LINE_QUICK_REPLY_MAX);
  if (usable.length === 0) return undefined;
  return {
    items: usable.map(item => {
      const label = item.label.slice(0, LINE_QUICK_LABEL_MAX);
      if (item.uri) {
        return { type: "action" as const, action: { type: "uri" as const, label, uri: item.uri } };
      }
      return { type: "action" as const, action: { type: "message" as const, label, text: item.text ?? label } };
    }),
  };
}

export function formatWebhookReply(results: Array<Record<string, unknown>>): string {
  const first = results[0];
  if (!first) return "OPENQLOW: 受信しました。";

  if (typeof first.message === "string" && first.ok === true) {
    return first.message;
  }

  if (first.ok === true) {
    const action = typeof first.action === "string" ? first.action : "processed";
    const id = typeof first.id === "string" ? first.id : "";
    return ["OPENQLOW: RUNしました。", id ? `ID: ${id}` : "", `action: ${action}`].filter(Boolean).join("\n");
  }

  const message = typeof first.message === "string" ? first.message : "承認コマンドではありませんでした。";
  return ["OPENQLOW: 受信しました。", message].join("\n");
}

export async function replyLineMessage(
  replyToken: string | undefined,
  text: string,
  opts: ReplyOptions = {},
): Promise<{ ok: boolean; mode: "sent" | "skipped"; error?: string }> {
  const token = opts.token ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  if (!token || !replyToken) {
    console.log("[LINE reply skipped: credentials or reply token missing]\n" + text);
    return { ok: true, mode: "skipped" };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const message: LineMessage = { type: "text", text: trimForLine(text) };
  if (opts.quickReplies?.length) {
    const quickReply = buildQuickReply(opts.quickReplies);
    if (quickReply) message.quickReply = quickReply;
  }
  const messages: LineMessage[] = [message];
  const res = await fetchImpl(LINE_REPLY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    const error = `LINE reply ${res.status}: ${body}`;
    console.error(error);
    return { ok: false, mode: "sent", error };
  }

  return { ok: true, mode: "sent" };
}
