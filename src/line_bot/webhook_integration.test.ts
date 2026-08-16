// Integration Test: LINE webhook with Brand Growth adapter

import { executeBrandGrowthRouting } from "./brand_growth_adapter.js";
import { extractLineEvents } from "./webhook_events.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

{
  console.log("🚀 Integration Test: LINE Webhook + Brand Growth Adapter\n");

  // Simulate webhook with a creative request
  console.log("✅ Test 1: Webhook processes creative request\n");

  const rawLinePayload = JSON.stringify({
    events: [
      {
        type: "message",
        message: {
          type: "text",
          id: "msg_creative_001",
          text: "女性向け。このジム写真。15秒。体験につなげたい。",
        },
        source: {
          userId: "U1234567890",
        },
        replyToken: "reply_token_001",
      },
    ],
  });

  const extracted = extractLineEvents(rawLinePayload, new Set());
  assert(extracted.events.length === 1, "Should extract 1 event");

  const event = extracted.events[0];
  assert(event.kind === "text", "Should be text event");
  assert(event.text === "女性向け。このジム写真。15秒。体験につなげたい。", "Should preserve text");
  assert(event.userId === "U1234567890", "Should extract userId");
  assert(event.messageId === "msg_creative_001", "Should extract messageId");

  console.log(`   Event kind: ${event.kind}`);
  console.log(`   Text: ${event.text?.substring(0, 30)}...`);
  console.log(`   User ID: ${event.userId}`);
  console.log(`   Message ID: ${event.messageId}`);

  // Process through adapter
  (async () => {
    const result = await executeBrandGrowthRouting({
      text: event.text ?? "",
      lineUserId: event.userId ?? "",
      messageId: event.messageId,
    });

    assert(result.ok, "Routing should succeed");
    assert(result.handled, "Should be handled by Brand Growth");
    assert(result.intent === "create", "Intent should be create");
    assert(result.target === "women_beginners", "Target should be women_beginners");
    assert(result.objective === "trial", "Objective should be trial");
    assert(result.replyToSender === true, "Should reply to sender");

    console.log(`\n   ✅ Routing Result:`);
    console.log(`   Action: ${result.action}`);
    console.log(`   Intent: ${result.intent}`);
    console.log(`   Target: ${result.target}`);
    console.log(`   Objective: ${result.objective}`);
    console.log(`   Handled: ${result.handled}`);
    console.log(`   Reply to sender: ${result.replyToSender}`);

    console.log("\n✅ Test 1: PASSED\n");

    // Test 2: Webhook with non-creative request
    console.log("✅ Test 2: Webhook processes analysis request\n");

    const analysisPayload = JSON.stringify({
      events: [
        {
          type: "message",
          message: {
            type: "text",
            id: "msg_analysis_001",
            text: "先週の投稿、なぜ伸びたんですか？",
          },
          source: {
            userId: "U1234567890",
          },
          replyToken: "reply_token_002",
        },
      ],
    });

    const extracted2 = extractLineEvents(analysisPayload, new Set());
    assert(extracted2.events.length === 1, "Should extract 1 event");

    const event2 = extracted2.events[0];
    assert(event2.kind === "text", "Should be text event");

    const result2 = await executeBrandGrowthRouting({
      text: event2.text ?? "",
      lineUserId: event2.userId ?? "",
      messageId: event2.messageId,
    });

    assert(result2.ok, "Should return ok");
    assert(!result2.handled, "Should not be handled by Brand Growth");
    assert(result2.intent === "analyze", "Intent should be analyze");
    assert(result2.replyToSender === false, "Should not reply to sender");

    console.log(`   Action: ${result2.action}`);
    console.log(`   Intent: ${result2.intent}`);
    console.log(`   Handled: ${result2.handled}`);

    console.log("\n✅ Test 2: PASSED\n");

    // Summary
    console.log("=".repeat(60));
    console.log("✅ Webhook Integration Test: Complete");
    console.log("=".repeat(60));
    console.log("\nWebhook can now:");
    console.log("  ✅ Extract LINE events from webhook payload");
    console.log("  ✅ Route creative requests to Brand Growth");
    console.log("  ✅ Skip non-creative requests gracefully");
    console.log("  ✅ Return routing decisions for reply formatting");
    console.log("\nNext: webhook.ts will format Brand Growth results into LINE reply");
  })();
}
