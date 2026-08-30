import assert from "node:assert/strict";
import {
  AD_LINE_WEBHOOK_PATH,
  createAdLeadEvent,
  routeAdvertisingLineMessage,
  validateAdvertisingLineEnv,
} from "./ad_channel_boundary.js";
import { handleAdvertisingLinePayload } from "./ad_webhook_handler.js";

const ownerUserId = "U0123456789abcdef0123456789abcdef";
const prospectUserId = "U11111111111111111111111111111111";

const validEnv: NodeJS.ProcessEnv = {
  AD_LINE_PURPOSE: "advertising",
  AD_LINE_CHANNEL_ID: "2000000001",
  AD_LINE_ACCOUNT_BASIC_ID: "@adexample",
  AD_LINE_OWNER_USER_ID: ownerUserId,
  AD_LINE_WEBHOOK_PATH,
  AD_LINE_DATA_DIR: "/tmp/openqlow-ad-line",
  AD_LINE_DRY_RUN: "true",
  MEMBER_LINE_CHANNEL_ID: "1234567890",
  MEMBER_LINE_ACCOUNT_BASIC_ID: "@memberexample",
  OPENQLOW_DATA_DIR: "/tmp/openqlow-data",
};

const valid = validateAdvertisingLineEnv(validEnv);
if (!valid.ok) assert.fail(valid.errors.join("\n"));
assert.equal(valid.ok, true, "dedicated advertising config passes");
assert.equal(valid.config.purpose, "advertising");
assert.equal(valid.config.webhookPath, "/openqlow/ad-line/webhook");
assert.equal(valid.config.credentialsReady, false, "dry-run does not require credentials");

const missingPurpose = validateAdvertisingLineEnv({ ...validEnv, AD_LINE_PURPOSE: "" });
assert.equal(missingPurpose.ok, false, "missing advertising purpose fails closed");

const sameChannel = validateAdvertisingLineEnv({ ...validEnv, MEMBER_LINE_CHANNEL_ID: "2000000001" });
assert.equal(sameChannel.ok, false, "member and advertising channel IDs cannot match");

const existingOpenqlowMigration = validateAdvertisingLineEnv({
  ...validEnv,
  AD_LINE_CHANNEL_SECRET: "shared-secret",
  LINE_CHANNEL_SECRET: "shared-secret",
  AD_LINE_CHANNEL_ACCESS_TOKEN: "shared-token",
  LINE_CHANNEL_ACCESS_TOKEN: "shared-token",
});
assert.equal(existingOpenqlowMigration.ok, true, "the existing openQLOW account can migrate to the advertising lane");

const unsafePath = validateAdvertisingLineEnv({ ...validEnv, AD_LINE_WEBHOOK_PATH: "/line/webhook" });
assert.equal(unsafePath.ok, false, "member webhook path cannot be reused");

const productionWithoutCredentials = validateAdvertisingLineEnv({ ...validEnv, AD_LINE_DRY_RUN: "false" });
assert.equal(productionWithoutCredentials.ok, false, "production fails closed without dedicated credentials");

const inboundOnlyProduction = validateAdvertisingLineEnv({
  ...validEnv,
  AD_LINE_DRY_RUN: "false",
  AD_LINE_CHANNEL_SECRET: "dedicated-signature-secret",
});
assert.equal(inboundOnlyProduction.ok, true, "inbound-only production needs no outbound access token");

assert.equal(
  routeAdvertisingLineMessage({ userId: ownerUserId, text: "/広告集計", ownerUserId }),
  "owner_ad_ops",
  "owner commands stay in advertising operations",
);
assert.equal(
  routeAdvertisingLineMessage({ userId: prospectUserId, text: "IG01 広告を見ました。体験したいです", ownerUserId }),
  "ad_lead_intake",
  "advertising prospects enter the ad lead lane",
);
assert.equal(
  routeAdvertisingLineMessage({ userId: prospectUserId, text: "会員です。休会したいです", ownerUserId }),
  "member_support_handoff",
  "member support is never processed in the advertising lane",
);
assert.equal(
  routeAdvertisingLineMessage({ userId: prospectUserId, text: "会員になりたいです", ownerUserId }),
  "ad_lead_intake",
  "prospects who want to become members remain in the advertising lane",
);
assert.equal(
  routeAdvertisingLineMessage({ userId: prospectUserId, text: "月会費を知りたいです", ownerUserId }),
  "ad_lead_intake",
  "prospect pricing questions remain in the advertising lane",
);
assert.equal(
  routeAdvertisingLineMessage({ userId: prospectUserId, text: "既存会員です。支払いについて相談したい", ownerUserId }),
  "member_support_handoff",
  "explicit existing-member support is handed off",
);

const rawMessage = "IG-KIDS-01 広告を見ました。体験したいです。名前はテスト太郎です";
const leadEvent = createAdLeadEvent(
  { userId: prospectUserId, text: rawMessage, ownerUserId },
  "ad_lead_intake",
  new Date("2026-08-30T00:00:00.000Z"),
);
assert.ok(leadEvent);
assert.equal(leadEvent.campaignCode, "IG-KIDS-01");
assert.equal(leadEvent.sourceUserHash.length, 64);
assert.doesNotMatch(JSON.stringify(leadEvent), new RegExp(prospectUserId), "raw LINE user ID is not retained");
assert.doesNotMatch(JSON.stringify(leadEvent), /テスト太郎/, "message text and personal name are not retained");

const outcomes = handleAdvertisingLinePayload(
  {
    events: [
      {
        type: "message",
        timestamp: Date.parse("2026-08-30T00:00:00.000Z"),
        source: { userId: prospectUserId },
        message: { type: "text", text: "META02 体験したいです" },
      },
      {
        type: "message",
        timestamp: Date.parse("2026-08-30T00:01:00.000Z"),
        source: { userId: prospectUserId },
        message: { type: "text", text: "退会について聞きたい" },
      },
    ],
  },
  valid.config,
);
assert.equal(outcomes[0]?.action, "queue_ad_lead");
assert.equal(outcomes[0]?.event?.campaignCode, "META02");
assert.equal(outcomes[1]?.action, "handoff_member_support");

console.log("advertising LINE boundary tests passed");
