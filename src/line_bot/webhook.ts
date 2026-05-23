import http from "node:http";
import crypto from "node:crypto";
import { approveRecord, rejectRecord, requestRevision } from "../scheduler/daily.js";
import { executeLineCommand } from "./commands.js";
import { formatWebhookReply, replyLineMessage } from "./reply.js";

const port = Number(process.env.OPENQLOW_LINE_PORT || 8787);
const webhookPaths = new Set(["/line/webhook", "/openqlow/webhook"]);
const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
const jinLineUserId = process.env.JIN_LINE_USER_ID || "";
const backupApproverLineUserId = process.env.BACKUP_APPROVER_LINE_USER_ID || "";
const allowedApproverIds = new Set([jinLineUserId, backupApproverLineUserId].filter(Boolean));

const APPROVAL_ID_REGEX = "FG-\\d{8}-\\d{3}";

function parseApproval(text: string): { id: string; response: "OK" | "revision" | "reject"; raw: string; note?: string } | undefined {
  const trimmed = text.trim();

  const ok = trimmed.match(new RegExp(`^OK\\s+(${APPROVAL_ID_REGEX})$`, "i"));
  if (ok) return { id: ok[1], response: "OK", raw: trimmed };

  const revision = trimmed.match(new RegExp(`^修正\\s+(${APPROVAL_ID_REGEX})[:::]?\\s*(.*)$`));
  if (revision) return { id: revision[1], response: "revision", raw: trimmed, note: revision[2] };

  const reject = trimmed.match(new RegExp(`^[×x✕Xやめる]+\\s*(${APPROVAL_ID_REGEX})$`, "i"));
  if (reject) return { id: reject[1], response: "reject", raw: trimmed };

  return undefined;
}

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

  const parsed = parseApproval(text);
  if (!parsed) {
    return {
      ok: false,
      message: "No approval command found. Expected: OK FG-YYYYMMDD-NNN / 修正 FG-YYYYMMDD-NNN: comment / やめる FG-YYYYMMDD-NNN"
    };
  }

  if (parsed.response === "OK") {
    const files = await approveRecord(parsed.id, parsed.raw);
    return { ok: true, action: "approved", id: parsed.id, saved: files };
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
