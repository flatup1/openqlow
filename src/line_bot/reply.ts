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

/**
 * 例外発生時に LINE へ返す安全なメッセージを組み立てる。
 * 生のエラー文字列はそのまま出さない（上流APIの応答にトークン等が混ざる可能性を避ける）。
 * 既知のエラーは分かりやすい日本語に分類し、不明なものは汎用文に倒す。
 */
export function formatErrorReply(rawError: string): string {
  const e = rawError;
  if (/Record not found/i.test(e)) {
    return "OPENQLOW: 対象の投稿候補が見つかりませんでした。もう一度「投稿」で候補を作ってください。";
  }
  if (/Safety check failed/i.test(e)) {
    return "OPENQLOW: 安全チェックに引っかかりました。本文を見直して「修正 〇〇」で直してください。";
  }
  if (/publish lock|publication level|physical lock/i.test(e)) {
    return "OPENQLOW: 今は投稿レベルの承認ができません（Phase1の安全ロック）。下書き保存までは可能です。";
  }
  if (/Invalid approval/i.test(e)) {
    return "OPENQLOW: 承認コマンドの形式が正しくありませんでした。候補のメッセージにある「OK ...」を送ってください。";
  }
  if (/threads|publish|fetch|network|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|reply \d{3}/i.test(e)) {
    return "OPENQLOW: 投稿先への接続でエラーが出ました。半自動で確認してください。";
  }
  return "OPENQLOW: 処理中にエラーが出ました。半自動で確認してください。（詳細はサーバーログ）";
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
