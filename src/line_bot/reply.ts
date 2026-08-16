import type { BrandGrowthAdapterResult } from "./brand_growth_adapter.js";
import { safeLineLog } from "./webhook_security.js";

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

const TARGET_LABELS: Record<string, string> = {
  women_beginners: "女性初心者向け",
  senior: "シニア向け",
  families: "ファミリー向け",
  men_rebuilding: "男性（自信取戻し）",
};

const OBJECTIVE_LABELS: Record<string, string> = {
  trial: "体験に繋げる",
  trust: "信頼構築",
  conversion: "入会に繋げる",
  retention: "継続促進",
};

export function formatBrandGrowthReply(result: BrandGrowthAdapterResult): string {
  if (!result.handled || !result.target || !result.objective) {
    return "OPENQLOW: 申し訳ございません。リクエストを処理できませんでした。";
  }

  const targetLabel = TARGET_LABELS[result.target] || result.target;
  const objectiveLabel = OBJECTIVE_LABELS[result.objective] || result.objective;

  return [
    "📋 企画書ができました！",
    "",
    `対象: ${targetLabel}`,
    `目的: ${objectiveLabel}`,
    "",
    "次は撮影準備に進みます。",
  ].join("\n");
}

export function formatWebhookReply(results: Array<Record<string, unknown>>): string {
  const first = results[0];
  if (!first) return "OPENQLOW: 受信しました。";

  if (typeof first.message === "string" && first.ok === true) {
    return first.message;
  }

  if (first.ok === true) {
    const action = typeof first.action === "string" ? first.action : "processed";
    // Brand Growth routing result
    if (action === "brand_growth_routed" && typeof first.target === "string") {
      const brandGrowthResult: BrandGrowthAdapterResult = {
        ok: first.ok === true,
        action,
        target: first.target,
        objective: typeof first.objective === "string" ? first.objective : undefined,
        intent: typeof first.intent === "string" ? first.intent : undefined,
        handled: first.handled === true,
        replyToSender: first.replyToSender !== false,
      };
      return formatBrandGrowthReply(brandGrowthResult);
    }

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
    console.log(safeLineLog("reply_skipped"));
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
    const error = `LINE reply ${res.status}`;
    console.error(safeLineLog("reply_failed"));
    return { ok: false, mode: "sent", error };
  }

  return { ok: true, mode: "sent" };
}
