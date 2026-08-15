import http from "node:http";
import { loadConfig } from "../config.js";
import { saveLineMessageMediaAndAttach } from "../publish/line_media.js";
import { executeApprovalText } from "./approval_dispatch.js";
import { executeLineCrmIntake } from "./crm_intake.js";
import { formatWebhookReply, replyLineMessage } from "./reply.js";
import { verifyLineSignature } from "./webhook_auth.js";
import { executeLineWithdrawalIntake } from "./withdrawal_intake.js";
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
  /**
   * 承認者（オーナー）からのイベントか。
   * false = 会員。会員のメッセージは退会相談の受付だけに使い、
   * 承認・push などのコマンド経路（executeApprovalText）へは絶対に渡さない。
   */
  isApprover: boolean;
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

async function executeLineMedia(event: ExtractedEvent): Promise<Record<string, unknown>> {
  if (event.kind !== "media" || !event.messageId || !event.messageType) {
    return { ok: false, message: "OPENQLOW: メディアイベントを処理できませんでした。" };
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
        // 会員（承認者以外）のメッセージは退会相談の受付だけに使う。
        // executeApprovalText には絶対に渡さない（承認・push コマンドを踏ませないため）。
        if (!ev.isApprover) {
          const withdrawal = await executeLineWithdrawalIntake({
            text: ev.text ?? "",
            lineUserId: ev.userId,
            messageId: ev.messageId,
          });
          if (withdrawal.handled) results.push(withdrawal);
          else results.push({ ok: true, action: "ignored", message: "non_approver_message_ignored" });
          continue;
        }

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
