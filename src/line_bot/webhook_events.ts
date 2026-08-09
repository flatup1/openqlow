import { safeLineLog } from "./webhook_security.js";

export interface ExtractedEvent {
  kind: "text" | "media";
  text?: string;
  messageId?: string;
  messageType?: "image" | "video";
  userId?: string;
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
  source?: { userId?: string };
  message?: { type?: string; text?: string; id?: string };
}

// 承認者以外のイベントは1件ずつ捨てる。以前はここで return して
// バッチ全体を捨てていたため、同じバッチに入っていた承認者（Jin）の
// 指示まで一緒に消えていた。取りこぼしを防ぐため continue に変える。
export function extractLineEvents(
  rawBody: string,
  allowedApproverIds: ReadonlySet<string>,
): ExtractedEvents {
  try {
    const payload = JSON.parse(rawBody) as { events?: RawLineEvent[] };

    if (!Array.isArray(payload.events)) {
      return { events: [{ kind: "text", text: rawBody }], linePayload: false };
    }

    const events: ExtractedEvent[] = [];
    let replyToken: string | undefined;
    let skippedNonApprover = false;

    for (const event of payload.events) {
      if (event.type !== "message") continue;
      const userId = event.source?.userId;
      if (allowedApproverIds.size > 0 && !allowedApproverIds.has(userId || "")) {
        skippedNonApprover = true;
        continue;
      }
      // 返信先は承認者のイベントからだけ拾う（非承認者へ返信しない）。
      replyToken ??= event.replyToken;

      if (event.message?.type === "text" && event.message.text) {
        console.log(safeLineLog("text_received"));
        events.push({ kind: "text", text: event.message.text, userId });
      }

      if ((event.message?.type === "image" || event.message?.type === "video") && event.message.id) {
        events.push({
          kind: "media",
          messageId: event.message.id,
          messageType: event.message.type,
          userId,
        });
      }
    }

    if (events.length === 0 && skippedNonApprover) {
      return { events: [], linePayload: true, ignored: "non_approver_user" };
    }

    return { events, linePayload: true, replyToken };
  } catch {
    return { events: [{ kind: "text", text: rawBody }], linePayload: false };
  }
}
