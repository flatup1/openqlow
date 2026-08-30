import assert from "node:assert/strict";
import crypto from "node:crypto";
import type http from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AD_LINE_WEBHOOK_PATH } from "./ad_channel_boundary.js";
import type { AdvertisingLineOutcome } from "./ad_webhook_handler.js";
import {
  createAdvertisingLineServer,
  createJsonlAdvertisingLineEventSink,
} from "./ad_webhook_server.js";
import { MAX_WEBHOOK_BODY_BYTES } from "./webhook_security.js";

const ownerUserId = "U0123456789abcdef0123456789abcdef";
const prospectUserId = "U11111111111111111111111111111111";

const baseEnv: NodeJS.ProcessEnv = {
  AD_LINE_PURPOSE: "advertising",
  AD_LINE_CHANNEL_ID: "2000000001",
  AD_LINE_ACCOUNT_BASIC_ID: "@adexample",
  AD_LINE_OWNER_USER_ID: ownerUserId,
  AD_LINE_WEBHOOK_PATH,
  AD_LINE_DATA_DIR: "/tmp/openqlow-ad-line-server-test",
  AD_LINE_DRY_RUN: "true",
  MEMBER_LINE_CHANNEL_ID: "1234567890",
  MEMBER_LINE_ACCOUNT_BASIC_ID: "@memberexample",
  OPENQLOW_DATA_DIR: "/tmp/openqlow-data",
};

async function listen(server: http.Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: http.Server): Promise<void> {
  server.close();
  await once(server, "close");
}

const dryServer = createAdvertisingLineServer({ env: baseEnv });
const dryUrl = await listen(dryServer);
try {
  const wrongPath = await fetch(`${dryUrl}/openqlow/webhook`, { method: "POST", body: "{}" });
  assert.equal(wrongPath.status, 404, "the existing webhook path is never accepted by the advertising server");

  const body = JSON.stringify({
    events: [{
      type: "message",
      timestamp: Date.parse("2026-08-30T00:00:00.000Z"),
      source: { userId: prospectUserId },
      message: { type: "text", text: "IG01 体験したいです" },
    }],
  });
  const response = await fetch(`${dryUrl}${AD_LINE_WEBHOOK_PATH}`, { method: "POST", body });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    dryRun: true,
    accepted: 1,
    handedOff: 0,
    ownerOps: 0,
    ignored: 0,
    stored: 0,
  });

  const tooLarge = await fetch(`${dryUrl}${AD_LINE_WEBHOOK_PATH}`, {
    method: "POST",
    body: "x".repeat(MAX_WEBHOOK_BODY_BYTES + 1),
  });
  assert.equal(tooLarge.status, 413, "oversized requests are rejected");
} finally {
  await close(dryServer);
}

const secret = "advertising-channel-secret";
const captured: AdvertisingLineOutcome[][] = [];
const productionServer = createAdvertisingLineServer({
  env: { ...baseEnv, AD_LINE_DRY_RUN: "false", AD_LINE_CHANNEL_SECRET: secret },
  eventSink: async outcomes => {
    captured.push(outcomes);
    return outcomes.filter(outcome => outcome.event).length;
  },
});
const productionUrl = await listen(productionServer);
try {
  const body = JSON.stringify({
    events: [{
      type: "message",
      timestamp: Date.parse("2026-08-30T00:00:00.000Z"),
      source: { userId: prospectUserId },
      message: { type: "text", text: "META02 体験希望。名前はテスト太郎" },
    }],
  });
  const invalid = await fetch(`${productionUrl}${AD_LINE_WEBHOOK_PATH}`, {
    method: "POST",
    body,
    headers: { "x-line-signature": "invalid" },
  });
  assert.equal(invalid.status, 401, "invalid signatures are rejected in production");

  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64");
  const valid = await fetch(`${productionUrl}${AD_LINE_WEBHOOK_PATH}`, {
    method: "POST",
    body,
    headers: { "x-line-signature": signature },
  });
  assert.equal(valid.status, 200);
  const result = await valid.json() as Record<string, unknown>;
  assert.equal(result.accepted, 1);
  assert.equal(result.stored, 1);
  const capturedText = JSON.stringify(captured);
  assert.doesNotMatch(capturedText, new RegExp(prospectUserId), "raw LINE user IDs are not sent to storage");
  assert.doesNotMatch(capturedText, /テスト太郎/, "raw message text and personal names are not sent to storage");
} finally {
  await close(productionServer);
}

const persistenceDir = await mkdtemp(path.join(os.tmpdir(), "openqlow-ad-line-"));
try {
  const sink = createJsonlAdvertisingLineEventSink(persistenceDir);
  const stored = await sink(captured.flat());
  assert.equal(stored, 1, "the default sink stores the anonymized lead event");
  const persisted = await readFile(path.join(persistenceDir, "events.ndjson"), "utf8");
  assert.match(persisted, /"campaignCode":"META02"/);
  assert.doesNotMatch(persisted, new RegExp(prospectUserId), "raw LINE user IDs are not written to disk");
  assert.doesNotMatch(persisted, /テスト太郎/, "message text and personal names are not written to disk");
} finally {
  await rm(persistenceDir, { recursive: true, force: true });
}

console.log("advertising LINE webhook server tests passed");
