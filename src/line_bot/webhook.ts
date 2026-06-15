import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { saveLineMessageMediaAndAttach } from "../publish/line_media.js";
import { mediaDirectoryForEnv } from "../publish/media_library.js";
import { executeApprovalText } from "./approval_dispatch.js";
import { executeLineCrmIntake } from "./crm_intake.js";
import { formatWebhookReply, replyLineMessage } from "./reply.js";

const port = Number(process.env.OPENQLOW_LINE_PORT || 8787);
const webhookPaths = new Set(["/line/webhook", "/openqlow/webhook"]);
const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
const jinLineUserId = process.env.JIN_LINE_USER_ID || "";
const backupApproverLineUserId = process.env.BACKUP_APPROVER_LINE_USER_ID || "";
const allowedApproverIds = new Set([jinLineUserId, backupApproverLineUserId].filter(Boolean));

function verifyLineSignature(rawBody: string, signature: string | string[] | undefined): boolean {
  if (!channelSecret) {
    return process.env.OPENQLOW_DRY_RUN !== "false";
  }

  const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const actual = Array.isArray(signature) ? signature[0] : signature;
  if (!actual) return false;
  if (Buffer.byteLength(expected) !== Buffer.byteLength(actual)) return false;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
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
        console.log(`LINE message received from ${userId || "unknown"}: ${event.message.text}`);
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

const MEDIA_PREFIX = "/openqlow/media/";
const MEDIA_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

function mediaContentType(name: string): string {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return MEDIA_CONTENT_TYPES[ext] ?? "application/octet-stream";
}

// LINE で保存した画像/動画を公開配信する（Threads/Instagram 等が画像を取得するための公開URL）。
// ファイル名のみ許可（パストラバーサル防止）。GET 専用。webhook は openqlow ユーザーで動くため読める。
async function serveMedia(requestPath: string, res: http.ServerResponse): Promise<void> {
  const name = decodeURIComponent(requestPath.slice(MEDIA_PREFIX.length));
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
    res.writeHead(400);
    res.end("bad request");
    return;
  }
  const file = path.join(mediaDirectoryForEnv(), name);
  const data = await readFile(file).catch(() => null);
  if (!data) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": mediaContentType(name), "cache-control": "no-store" });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const requestPath = new URL(req.url || "/", "http://localhost").pathname;

  if (req.method === "GET" && requestPath.startsWith(MEDIA_PREFIX)) {
    await serveMedia(requestPath, res);
    return;
  }

  if (req.method !== "POST" || !webhookPaths.has(requestPath)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }

  let body = "";
  req.on("data", chunk => {
    body += chunk;
  });
  req.on("end", async () => {
    if (req.headers["content-type"]?.includes("application/json") && !verifyLineSignature(body, req.headers["x-line-signature"])) {
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
    } catch (error) {
      console.error("[webhook] executeApproval failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  });
});

server.listen(port, () => {
  console.log(`OPENQLOW LINE webhook listening on http://localhost:${port}/openqlow/webhook`);
});
