import { safeLineLog } from "./webhook_security.js";

export interface ExtractedEvent {
  kind: "text" | "media";
  text?: string;
  messageId?: string;
  messageType?: "image" | "video";
  userId?: string;
  /** LINE が各イベントに付ける一意ID。返信下書きの重複判定に使う。 */
  webhookEventId?: string;
  /** LINEイベントの送信時刻（ms）。webhookEventId が無いときの指紋づくりに使う。 */
  timestamp?: number;
  /**
   * 承認者（オーナー）からのイベントか。
   * false = 会員。会員のメッセージは退会相談の受付だけに使い、
   * 承認・push などのコマンド経路（executeApprovalText）へは絶対に渡さない。
   */
  isApprover: boolean;
}

export interface ExtractedEvents {
  events: ExtractedEvent[];
  linePayload: boolean;
  ignored?: string;
  replyToken?: string;
}

interface RawLineEvent {
  type?: string;
  replyToken?: string;
  webhookEventId?: string;
  timestamp?: number;
  source?: { userId?: string };
  message?: { type?: string; text?: string; id?: string };
}

// 会員（承認者以外）のイベントも捨てずに返し、isApprover を付けて呼び出し側へ渡す。
//
// 以前はここで return してバッチ全体を捨てていたため、同じバッチに入っていた
// 承認者（Jin）の指示まで一緒に消えていた。取りこぼしを防ぐため、1件ずつ判定する。
// さらに会員のメッセージは退会相談の受付に必要なため、除外せず isApprover=false で返す。
// どの経路へ流すかは webhook.ts が決める（会員をコマンド経路へ通さない線引きはそちら）。
export function extractLineEvents(
  rawBody: string,
  allowedApproverIds: ReadonlySet<string>,
): ExtractedEvents {
  try {
    const payload = JSON.parse(rawBody) as { events?: RawLineEvent[] };

    if (!Array.isArray(payload.events)) {
      // LINE形式でない本文（署名検証は通過済み＝オーナーの直接呼び出し）。従来どおり承認者扱い。
      return { events: [{ kind: "text", text: rawBody, isApprover: true }], linePayload: false };
    }

    const events: ExtractedEvent[] = [];
    let replyToken: string | undefined;

    for (const event of payload.events) {
      if (event.type !== "message") continue;
      const userId = event.source?.userId;
      // 承認者IDが未設定の環境では、従来どおり全員を承認者として扱う（挙動を変えない）。
      const isApprover = allowedApproverIds.size === 0 || allowedApproverIds.has(userId || "");

      if (event.message?.type === "text" && event.message.text) {
        if (isApprover) {
          console.log(safeLineLog("text_received"));
          // 返信はオーナー向けの操作結果なので、承認者のイベントからだけ返信トークンを取る。
          // 会員に内部の処理結果を返さないための線引き。
          replyToken ??= event.replyToken;
        }
        events.push({
          kind: "text",
          text: event.message.text,
          messageId: event.message.id,
          userId,
          webhookEventId: event.webhookEventId,
          timestamp: event.timestamp,
          isApprover,
        });
      }

      // メディアの取り込みはオーナーの素材投稿用。会員からは受け付けない。
      if (isApprover && (event.message?.type === "image" || event.message?.type === "video") && event.message.id) {
        replyToken ??= event.replyToken;
        events.push({
          kind: "media",
          messageId: event.message.id,
          messageType: event.message.type,
          userId,
          webhookEventId: event.webhookEventId,
          timestamp: event.timestamp,
          isApprover,
        });
      }
    }

    return { events, linePayload: true, replyToken };
  } catch {
    // LINE形式でない本文（署名検証は通過済み＝オーナーの直接呼び出し）。従来どおり承認者扱い。
    return { events: [{ kind: "text", text: rawBody, isApprover: true }], linePayload: false };
  }
}
