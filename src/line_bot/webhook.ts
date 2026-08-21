import http from "node:http";
import path from "node:path";
import { loadConfig } from "../config.js";
import { saveLineMessageMediaAndAttach } from "../publish/line_media.js";
import { executeApprovalText } from "./approval_dispatch.js";
import { executeBrandGrowthRouting } from "./brand_growth_adapter.js";
import { executeLineCrmIntake } from "./crm_intake.js";
import { formatWebhookReply, replyLineMessage } from "./reply.js";
import { verifyLineSignature } from "./webhook_auth.js";
import { isMemberAutoReplyEnabled, sealMemberReply } from "./member_reply_gate.js";
import { pseudonymize } from "./pseudonymize.js";
import { type ExtractedEvent, extractLineEvents } from "./webhook_events.js";
import { executeLineWithdrawalIntake } from "./withdrawal_intake.js";
import {
  MAX_WEBHOOK_BODY_BYTES,
  exceedsWebhookBodyLimit,
  publicWebhookError,
  safeLineLog,
} from "./webhook_security.js";
import { logError as writeSelfRepairLog } from "../crm/self_repair.js";

const port = Number(process.env.OPENQLOW_LINE_PORT || 8787);
const webhookPaths = new Set(["/line/webhook", "/openqlow/webhook"]);
const healthPaths = new Set(["/openqlow/health"]);
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

async function logBrandGrowthRouting(input: {
  lineUserId: string;
  text: string;
  target?: string;
  objective?: string;
  intent?: string;
}): Promise<void> {
  try {
    const dataDir = process.env.OPENQLOW_DATA_DIR || path.join(process.cwd(), "data");
    const timestamp = new Date().toISOString();
    const logMessage = [
      `【Brand Growth Routing】${timestamp}`,
      // LINE userId と本文そのものはログに残さない（AGENTS.md / 指示書§26）。
      // 追跡に必要な「同一人物かどうか」は、復元できない短いハッシュで足りる。
      `User: ${pseudonymize(input.lineUserId)}`,
      `Length: ${input.text.length}`,
      `Target: ${input.target || "skipped"}`,
      `Objective: ${input.objective || "N/A"}`,
      `Intent: ${input.intent || "N/A"}`,
    ].join("\n");
    await writeSelfRepairLog("line_webhook_error", logMessage, "brand_growth_routing", dataDir);
  } catch (error) {
    console.error("Failed to log brand growth routing:", error);
  }
}

const server = http.createServer(async (req, res) => {
  const requestPath = new URL(req.url || "/", "http://localhost").pathname;
  if (req.method === "GET" && healthPaths.has(requestPath)) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "openqlow-webhook" }));
    return;
  }

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

    const extracted = extractLineEvents(body, allowedApproverIds);
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
        // 会員（承認者以外）のメッセージは退会相談と創作依頼の受付に使う。
        // executeApprovalText には絶対に渡さない（承認・push コマンドを踏ませないため）。
        if (!ev.isApprover) {
          // 会員へ返信してよいかは member_reply_gate が唯一の判断者。
          // 各ハンドラが replyToSender: true を返しても、関門が閉じていれば送らない。
          const memberReplyAllowed = isMemberAutoReplyEnabled();
          const withdrawal = await executeLineWithdrawalIntake({
            text: ev.text ?? "",
            lineUserId: ev.userId,
            messageId: ev.messageId,
          });
          if (withdrawal.handled) {
            results.push(sealMemberReply(withdrawal, memberReplyAllowed));
          } else {
            const brandGrowth = await executeBrandGrowthRouting({
              text: ev.text ?? "",
              lineUserId: ev.userId ?? "",
              messageId: ev.messageId,
            });
            if (brandGrowth.handled) {
              // Log to CRM
              await logBrandGrowthRouting({
                lineUserId: ev.userId ?? "unknown",
                text: ev.text ?? "",
                target: typeof brandGrowth.target === "string" ? brandGrowth.target : undefined,
                objective: typeof brandGrowth.objective === "string" ? brandGrowth.objective : undefined,
                intent: typeof brandGrowth.intent === "string" ? brandGrowth.intent : undefined,
              });
              results.push(
                sealMemberReply(brandGrowth as unknown as Record<string, unknown>, memberReplyAllowed),
              );
            } else {
              results.push({
                ok: true,
                action: "ignored",
                message: "non_approver_message_ignored",
                replyToSender: false,
              });
            }
          }
          continue;
        }

        if (ev.kind === "media") {
          results.push(await executeLineMedia(ev));
        } else {
          const crmResult = await executeLineCrmIntake({
            text: ev.text ?? "",
            lineUserId: ev.userId,
            approver: ev.isApprover,
          });
          if (crmResult.handled) {
            results.push(crmResult);
          } else if (ev.isApprover) {
            results.push(await executeApprovalText(ev.text ?? "", ev.userId));
          } else {
            results.push({ ok: true, action: "ignored_non_approver_text", replyToSender: false });
          }
        }
      }
      const replyableResults = results.filter(result => result.replyToSender !== false);
      if (extracted.linePayload && replyableResults.length > 0) {
        await replyLineMessage(extracted.replyToken, formatWebhookReply(replyableResults));
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
