import assert from "node:assert/strict";
import { healthcheckNamesForEnv, lineWebhookAttemptsForEnv } from "./healthcheck.js";

assert.deepEqual(
  healthcheckNamesForEnv({}),
  ["openrouter", "line_webhook"],
  "デフォルトではVPS不要の ngrok / launchd を見ない",
);

assert.deepEqual(
  healthcheckNamesForEnv({ OPENQLOW_CHECK_NGROK: "true", OPENQLOW_CHECK_LAUNCHD: "true" }),
  ["openrouter", "line_webhook", "ngrok", "launchd"],
  "Mac運用では明示ONで ngrok / launchd を見る",
);

assert.deepEqual(
  healthcheckNamesForEnv({ OPENQLOW_MONITOR_SYSTEMD: "true" }),
  ["openrouter", "systemd_self_heal", "line_webhook"],
  "VPS運用では systemd 自己修復してから webhook を見る",
);

assert.equal(lineWebhookAttemptsForEnv({}), 1, "通常はwebhook確認を1回だけ行う");
assert.equal(
  lineWebhookAttemptsForEnv({ OPENQLOW_MONITOR_SYSTEMD: "true" }),
  8,
  "VPS自己修復後はwebhook起動待ちのため複数回確認する",
);
assert.equal(
  lineWebhookAttemptsForEnv({ OPENQLOW_LINE_WEBHOOK_ATTEMPTS: "3" }),
  3,
  "明示指定があれば確認回数を上書きできる",
);

console.log("healthcheck plan tests passed");
