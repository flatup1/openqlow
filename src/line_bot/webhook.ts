import http from "node:http";
import { loadConfig } from "../config.js";
import { saveLineMessageMediaAndAttach } from "../publish/line_media.js";
import { executeApprovalText } from "./approval_dispatch.js";
import { executeLineCrmIntake } from "./crm_intake.js";
import { formatWebhookReply, replyLineMessage } from "./reply.js";
import { tryServePublicMedia } from "./media_server.js";
import { verifyLineSignature } from "./webhook_auth.js";
import {
  MAX_WEBHOOK_BODY_BYTES,
  exceedsWebhookBodyLimit,
  publicWebhookError,
  safeLineLog,
} from "./webhook_security.js";

const port = Number(process.env.OPENQLOW_LINE_PORT || 8787);
const webhookPaths = new Set(["/line/webhook", "/openqlow/webhook"]);
const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
const jinLineUserId = process.env.JIN_LINE_USER_ID || "";
const backupApproverLineUserId = process.env.BACKUP_APPROVER_LINE_USER_ID || "";
const allowedApproverIds = new Set([jinLineUserId, backupApproverLineUserId].filter(Boolean));

function isSignatureValid(rawBody: string, signature: string | string[] | undefined): boolean {
  return verifyLineSignature(rawBody, signature, {
    channelSecret,
    dryRun: process.env.OPENQLOW_DRY_RUN !== "false",
  });
}

interface ExtractedEvent {
  kind: "text" | "media";
  text?: string;
  messageId?: string;
  messageType?: "image" | "video";
  userId?: string;
}

function extractLineEvents(rawBody: string): { events: ExtractedEvent[]; linePayload: boolean; ignored?: string; replyToken?: string } {
  try {
    const payload = JSON.parse(rawBody) as {
      events?: Array<{
        type?: string;
        replyToken?: string;
        source?: { userId?: string };
        message?: { type?: string; text?: string; id?: string };
      }>;
    };

    if (!Array.isArray(payload.events)) {
      return { events: [{ kind: "text", text: rawBody }], linePayload: false };
    }

    const events: ExtractedEvent[] = [];
    let replyToken: string | undefined;
    for (const event of payload.events) {
      if (event.type !== "message") continue;
      const userId = event.source?.userId;
      if (allowedApproverIds.size > 0 && !allowedApproverIds.has(userId || "")) {
        return { events: [], linePayload: true, ignored: "non_approver_user" };
      }
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

    return { events, linePayload: true, replyToken };
  } catch {
    return { events: [{ kind: "text", text: rawBody }], linePayload: false };
  }
}

async function executeLineMedia(event: ExtractedEvent): Promise<Record<string, unknown>> {
  if (event.kind !== "media" || !event.messageId || !event.messageType) {
    return { ok: false, message: "メディアイベントを処理できませんでした。" };
  }
  const config = loadConfig();
  const result = await saveLineMessageMediaAndAttach({
    root: config.root,
    messageId: event.messageId,
    messageType: event.messageType,
    token: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  });
  return {
    ok: result.ok,
    action: "line_media_attached",
    id: result.id,
    message: result.message,
  };
}

const server = http.createServer(async (req, res) => {
  const requestPath = new URL(req.url || "/", "http://localhost").pathname;

  // 公開メディア配信: /openqlow/media/<file> への GET を画像/動画として返す。
  // Instagram/Threads などの外部APIが image_url を取得できるようにするため。
  if (await tryServePublicMedia(req.method || "GET", requestPath, res)) return;

  if (req.method !== "POST" || !webhookPaths.has(requestPath)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }

  let body = "";
  let receivedBytes = 0;
  let bodyTooLarge = false;
  req.on("data", chunk => {
    const chunkBytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
    if (bodyTooLarge || exceedsWebhookBodyLimit(receivedBytes, chunkBytes)) {
      bodyTooLarge = true;
      return;
    }
    receivedBytes += chunkBytes;
    body += chunk;
  });
  req.on("end", async () => {
    if (bodyTooLarge) {
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "payload_too_large", maxBytes: MAX_WEBHOOK_BODY_BYTES }));
      return;
    }

    // 署名検証は content-type に依存させない。application/json 以外（text/plain 等）で
    // 署名を回避し、承認者チェックの無いフォールバック経路へ流し込む攻撃を防ぐ。
    if (!isSignatureValid(body, req.headers["x-line-signature"])) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid_line_signature" }));
      return;
    }

    const extracted = extractLineEvents(body);
    if (extracted.ignored) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, ignored: extracted.ignored }));
      return;
    }

    if (extracted.events.length === 0) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, ignored: "no_text_message" }));
      return;
    }

    try {
      const results = [];
      for (const ev of extracted.events) {
        if (ev.kind === "media") {
          results.push(await executeLineMedia(ev));
        } else {
          const crmResult = await executeLineCrmIntake({ text: ev.text ?? "", lineUserId: ev.userId });
          results.push(crmResult.handled ? crmResult : await executeApprovalText(ev.text ?? "", ev.userId));
        }
      }
      if (extracted.linePayload) {
        await replyLineMessage(extracted.replyToken, formatWebhookReply(results));
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: results.every(result => result.ok === true), results }));
    } catch {
      console.error(safeLineLog("processing_failed"));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(publicWebhookError()));
    }
  });
});

server.listen(port, () => {
  console.log(`OPENQLOW LINE webhook listening on http://localhost:${port}/openqlow/webhook`);
});
