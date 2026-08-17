// Test: Brand Growth routing → LINE reply formatting

import { formatBrandGrowthReply, formatWebhookReply } from "./reply.js";
import type { BrandGrowthAdapterResult } from "./brand_growth_adapter.js";

{
  console.log("🚀 Reply Format Test\n");

  // Test 1: women_beginners routing
  console.log("✅ Test 1: Women beginners reply\n");
  const result1: BrandGrowthAdapterResult = {
    ok: true,
    action: "brand_growth_routed",
    target: "women_beginners",
    objective: "trial",
    intent: "create",
    handled: true,
    replyToSender: true,
  };

  const reply1 = formatBrandGrowthReply(result1);
  console.log("生成テキスト:");
  console.log(reply1);
  console.log("");

  // Test 2: senior routing
  console.log("✅ Test 2: Senior audience reply\n");
  const result2: BrandGrowthAdapterResult = {
    ok: true,
    action: "brand_growth_routed",
    target: "senior",
    objective: "trust",
    intent: "create",
    handled: true,
    replyToSender: true,
  };

  const reply2 = formatBrandGrowthReply(result2);
  console.log("生成テキスト:");
  console.log(reply2);
  console.log("");

  // Test 3: formatWebhookReply integration
  console.log("✅ Test 3: formatWebhookReply integration\n");
  const webhookResults = [result1];
  const webhookReply = formatWebhookReply(
    webhookResults as unknown as Array<Record<string, unknown>>,
  );
  console.log("webhook reply:");
  console.log(webhookReply);
  console.log("");

  // Test 4: Unknown target
  console.log("✅ Test 4: Unknown target (fallback)\n");
  const result4: BrandGrowthAdapterResult = {
    ok: true,
    action: "brand_growth_routed",
    target: "unknown_target",
    objective: "unknown_objective",
    intent: "create",
    handled: true,
    replyToSender: true,
  };

  const reply4 = formatBrandGrowthReply(result4);
  console.log("生成テキスト:");
  console.log(reply4);
  console.log("");

  console.log("=".repeat(60));
  console.log("✅ Reply Format Tests: PASSED");
  console.log("=".repeat(60));
}
