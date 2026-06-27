import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MAX_WEBHOOK_BODY_BYTES,
  exceedsWebhookBodyLimit,
  publicWebhookError,
  safeLineLog,
} from "./webhook_security.js";

assert.equal(safeLineLog("text_received"), "[LINE] authorized text message received");
assert.equal(safeLineLog("reply_skipped"), "[LINE] reply skipped");
assert.deepEqual(publicWebhookError(), { ok: false, error: "internal_error" });
assert.equal(exceedsWebhookBodyLimit(MAX_WEBHOOK_BODY_BYTES - 1, 1), false);
assert.equal(exceedsWebhookBodyLimit(MAX_WEBHOOK_BODY_BYTES, 1), true);

const webhookSource = readFileSync(fileURLToPath(new URL("./webhook.ts", import.meta.url)), "utf8");
const notifierSource = readFileSync(fileURLToPath(new URL("./notifier.ts", import.meta.url)), "utf8");
const replySource = readFileSync(fileURLToPath(new URL("./reply.ts", import.meta.url)), "utf8");

for (const [name, source] of [
  ["webhook.ts", webhookSource],
  ["notifier.ts", notifierSource],
  ["reply.ts", replySource],
] as const) {
  assert.doesNotMatch(source, /console\.(?:log|error)\([^)]*(?:message\.text|userId|\+\s*text)/, `${name} must not log LINE PII`);
  assert.doesNotMatch(source, /console\.error\(error\)/, `${name} must not dump external errors`);
}

assert.doesNotMatch(webhookSource, /String\(error\)/, "webhook must not expose internal errors");
assert.doesNotMatch(notifierSource, /res\.text\(\)/, "notifier must not retain LINE API response bodies");
assert.doesNotMatch(replySource, /res\.text\(\)/, "reply must not retain LINE API response bodies");
assert.match(webhookSource, /MAX_WEBHOOK_BODY_BYTES/, "webhook must enforce a request size limit");

console.log("line webhook security tests passed");
