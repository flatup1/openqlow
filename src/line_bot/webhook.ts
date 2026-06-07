import http from "node:http";
import crypto from "node:crypto";
import { loadConfig } from "../config.js";
import { approveRecord, rejectRecord, requestRevision } from "../scheduler/daily.js";
import { parseApprovalCommand } from "../approval/command.js";
import { expandApprovalShortcut } from "../approval/shortcut.js";
import { createBrowserPanel } from "../publish/browser_panel.js";
import { runFinalPublish } from "../publish/final_publish.js";
import { executeLineCommand } from "./commands.js";
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
  text: string;
  userId?: string;
}

function extractLineTexts(rawBody: string): { events: ExtractedEvent[]; linePayload: boolean; ignored?: string; replyToken?: string } {
  try {
    const payload = JSON.parse(rawBody) as {
      events?: Array<{
        type?: string;
        replyToken?: string;
        source?: { userId?: string };
        message?: { type?: string; text?: string };
      }>;
    };

    if (!Array.isArray(payload.events)) {
      return { events: [{ text: rawBody }], linePayload: false };
    }

    const events: ExtractedEvent[] = [];
    let replyToken: string | undefined;
    for (const event of payload.events) {
      if (event.type !== "message" || event.message?.type !== "text" || !event.message.text) continue;
      const userId = event.source?.userId;
      console.log(`LINE message received from ${userId || "unknown"}: ${event.message.text}`);
      if (allowedApproverIds.size > 0 && !allowedApproverIds.has(userId || "")) {
        return { events: [], linePayload: true, ignored: "non_approver_user" };
      }
      replyToken ??= event.replyToken;
      events.push({ text: event.message.text, userId });
    }

    return { events, linePayload: true, replyToken };
  } catch {
    return { events: [{ text: rawBody }], linePayload: false };
  }
}

async function executeApproval(text: string, userId?: string): Promise<Record<string, unknown>> {
  const lineCommand = await executeLineCommand(text, { userId });
  if (lineCommand.handled) return { ...lineCommand };

  const config = loadConfig();
  const approvalText = await expandApprovalShortcut(text, config.root) ?? text;
  const okShortcutUsed = approvalText !== text;
  const parsed = parseApprovalCommand(approvalText);
  if (!parsed) {
    return {
      ok: false,
      message: [
        "受け取りました。",
        "日報として残すなら、体験・入会・口コミ・今日やることを1通で送ってください。",
        "例: 体験ひかりちゃん1名 入会予定 今日やること広告",
        "投稿候補を作るなら「投稿」と送ってください。",
      ].join("\n"),
    };
  }

  if (parsed.response === "OK") {
    const files = await approveRecord(parsed.id, parsed.raw);
    const hasPublishDestinations = parsed.targets.some(target => target !== "drafts_only");
    const panel = hasPublishDestinations ? await createBrowserPanel(config.root, parsed.id) : undefined;
    const finalPublish = okShortcutUsed && hasPublishDestinations
      ? await runFinalPublish(config.root, parsed.id)
      : undefined;
    const finalPublished = finalPublish?.published.map(item => `${item.destination}: ${item.externalId}`) ?? [];
    const browserQueued = finalPublish?.browserQueued.map(item => `${item.destination}: Macブラウザ投稿待ち`) ?? [];
    const finalSkipped = finalPublish?.skipped.map(item => `${item.destination}: ${item.reason}`) ?? [];
    const message = [
      finalPublish ? "OPENQLOW: ok承認で最終投稿まで処理しました。" : hasPublishDestinations ? "OPENQLOW: 投稿準備キューを作りました。" : "OPENQLOW: 下書きを保存しました。",
      `ID: ${parsed.id}`,
      finalPublished.length ? `最終投稿済み: ${finalPublished.join(" / ")}` : "",
      browserQueued.length ? `ブラウザ投稿待ち: ${browserQueued.join(" / ")}` : "",
      finalSkipped.length ? `未完了: ${finalSkipped.join(" / ")}` : "",
      panel ? `ブラウザ投稿パネル: ${panel}` : "",
      panel ? "Threads / Googleビジネス / LINE VOOM は、このパネルから本文コピーして確認できます。" : "",
      finalPublish ? "Googleビジネス / LINE VOOM はMac側のログイン済みブラウザ投稿ランナーで処理します。" : panel ? "最終投稿ボタンは、Jinさんが画面で確認してから押してください。" : "",
    ].filter(Boolean).join("\n");
    return { ok: true, action: "approved", id: parsed.id, saved: files, panel, message };
  }

  if (parsed.response === "revision") {
    const record = await requestRevision(parsed.id, parsed.note ?? "");
    return { ok: true, action: "needs_revision", id: record.id };
  }

  const record = await rejectRecord(parsed.id);
  return { ok: true, action: "rejected", id: record.id };
}

const server = http.createServer(async (req, res) => {
  const requestPath = new URL(req.url || "/", "http://localhost").pathname;
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

    const extracted = extractLineTexts(body);
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
        results.push(await executeApproval(ev.text, ev.userId));
      }
      if (extracted.linePayload) {
        await replyLineMessage(extracted.replyToken, formatWebhookReply(results));
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: results.every(result => result.ok === true), results }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  });
});

server.listen(port, () => {
  console.log(`OPENQLOW LINE webhook listening on http://localhost:${port}/openqlow/webhook`);
});
