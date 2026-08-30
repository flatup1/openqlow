import { mkdir, appendFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {
  AD_LINE_WEBHOOK_PATH,
  type AdLeadEvent,
  validateAdvertisingLineEnv,
} from "./ad_channel_boundary.js";
import {
  type AdvertisingLineOutcome,
  type AdvertisingLineWebhookPayload,
  handleAdvertisingLinePayload,
} from "./ad_webhook_handler.js";
import { verifyLineSignature } from "./webhook_auth.js";
import {
  MAX_WEBHOOK_BODY_BYTES,
  exceedsWebhookBodyLimit,
  publicWebhookError,
  safeLineLog,
} from "./webhook_security.js";

export type AdvertisingLineEventSink = (outcomes: AdvertisingLineOutcome[]) => Promise<number>;

export interface AdvertisingLineServerOptions {
  env?: NodeJS.ProcessEnv;
  eventSink?: AdvertisingLineEventSink;
}

interface BodyResult {
  body: string;
  tooLarge: boolean;
}

async function readRequestBody(req: http.IncomingMessage): Promise<BodyResult> {
  return await new Promise((resolve, reject) => {
    let body = "";
    let receivedBytes = 0;
    let tooLarge = false;
    req.on("data", chunk => {
      const chunkBytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      if (tooLarge || exceedsWebhookBodyLimit(receivedBytes, chunkBytes)) {
        tooLarge = true;
        return;
      }
      receivedBytes += chunkBytes;
      body += chunk;
    });
    req.on("end", () => resolve({ body, tooLarge }));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

/** 生のuserId・本文を含まない最小イベントだけを広告専用領域へ追記する。 */
export function createJsonlAdvertisingLineEventSink(dataDir: string): AdvertisingLineEventSink {
  return async outcomes => {
    const events = outcomes.flatMap(outcome => (outcome.event ? [outcome.event] : []));
    if (events.length === 0) return 0;
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const filePath = path.join(dataDir, "events.ndjson");
    const lines = `${events.map((event: AdLeadEvent) => JSON.stringify(event)).join("\n")}\n`;
    await appendFile(filePath, lines, { encoding: "utf8", mode: 0o600 });
    return events.length;
  };
}

/** 広告専用LINEだけを受ける独立HTTPサーバー。返信・予約・AIKA書き込みは行わない。 */
export function createAdvertisingLineServer(options: AdvertisingLineServerOptions = {}): http.Server {
  const env = options.env ?? process.env;
  const configResult = validateAdvertisingLineEnv(env);
  if (!configResult.ok) {
    throw new Error(`Advertising LINE configuration rejected: ${configResult.errors.join("; ")}`);
  }
  const config = configResult.config;
  const channelSecret = (env.AD_LINE_CHANNEL_SECRET ?? "").trim();
  const sink = options.eventSink ??
    (config.dryRun ? async () => 0 : createJsonlAdvertisingLineEventSink(config.dataDir));

  return http.createServer(async (req, res) => {
    const requestPath = new URL(req.url || "/", "http://localhost").pathname;
    if (req.method !== "POST" || requestPath !== AD_LINE_WEBHOOK_PATH) {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    try {
      const { body, tooLarge } = await readRequestBody(req);
      if (tooLarge) {
        json(res, 413, { ok: false, error: "payload_too_large", maxBytes: MAX_WEBHOOK_BODY_BYTES });
        return;
      }
      if (!verifyLineSignature(body, req.headers["x-line-signature"], { channelSecret, dryRun: config.dryRun })) {
        json(res, 401, { ok: false, error: "invalid_line_signature" });
        return;
      }

      let payload: AdvertisingLineWebhookPayload;
      try {
        payload = JSON.parse(body) as AdvertisingLineWebhookPayload;
      } catch {
        json(res, 400, { ok: false, error: "invalid_json" });
        return;
      }

      const outcomes = handleAdvertisingLinePayload(payload, config);
      const stored = await sink(outcomes);
      json(res, 200, {
        ok: true,
        dryRun: config.dryRun,
        accepted: outcomes.filter(outcome => outcome.action === "queue_ad_lead").length,
        handedOff: outcomes.filter(outcome => outcome.action === "handoff_member_support").length,
        ownerOps: outcomes.filter(outcome => outcome.action === "owner_ad_ops").length,
        ignored: outcomes.filter(outcome => outcome.action === "ignore").length,
        stored,
      });
    } catch {
      console.error(safeLineLog("processing_failed"));
      json(res, 500, publicWebhookError());
    }
  });
}

export function startAdvertisingLineServer(env: NodeJS.ProcessEnv = process.env): http.Server {
  const port = Number(env.AD_LINE_PORT || 8788);
  const server = createAdvertisingLineServer({ env });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Advertising LINE webhook listening on 127.0.0.1:${port}${AD_LINE_WEBHOOK_PATH}`);
  });
  return server;
}
