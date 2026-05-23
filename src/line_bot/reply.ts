interface LineMessage {
  type: "text";
  text: string;
}

interface ReplyOptions {
  token?: string;
  fetchImpl?: typeof fetch;
}

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const LINE_MESSAGE_MAX_CHARS = 5000;

function trimForLine(text: string): string {
  if (text.length <= LINE_MESSAGE_MAX_CHARS) return text;
  return text.slice(0, LINE_MESSAGE_MAX_CHARS - 20) + "\n...(truncated)";
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
  const messages: LineMessage[] = [{ type: "text", text: trimForLine(text) }];
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
