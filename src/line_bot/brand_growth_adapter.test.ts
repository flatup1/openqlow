// Integration Test: LINE webhook → Brand Growth routing

import { executeBrandGrowthRouting } from "./brand_growth_adapter.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

{
  console.log("🚀 Integration Test: LINE → Brand Growth Routing\n");

  // Test Case 1: Creative request (女性向け)
  console.log("✅ Test 1: Women beginners + trial booking\n");
  const result1 = await executeBrandGrowthRouting({
    text: "女性向け。このジム写真。15秒。体験につなげたい。",
    lineUserId: "U1234567890",
    messageId: "msg_001",
  });

  console.log(`   Status: ${result1.ok ? "✅ OK" : "❌ FAILED"}`);
  console.log(`   Action: ${result1.action}`);
  console.log(`   Intent: ${result1.intent}`);
  console.log(`   Target: ${result1.target}`);
  console.log(`   Objective: ${result1.objective}`);
  console.log(`   Handled: ${result1.handled}`);

  assert(result1.ok, "Routing should succeed");
  assert(result1.handled, "Should be handled by Brand Growth");
  assert(result1.intent === "create", "Intent should be create");
  assert(result1.target === "women_beginners", "Target should be women_beginners");
  assert(result1.objective === "trial", "Objective should be trial");

  console.log("\n✅ Test 1: PASSED\n");

  // Test Case 2: Non-creative request (analysis)
  console.log("✅ Test 2: Non-creative input (analysis)\n");
  const result2 = await executeBrandGrowthRouting({
    text: "先週の投稿、なぜ伸びたんですか？",
    lineUserId: "U1234567890",
    messageId: "msg_002",
  });

  console.log(`   Status: ${result2.ok ? "✅ OK" : "❌ FAILED"}`);
  console.log(`   Action: ${result2.action}`);
  console.log(`   Intent: ${result2.intent}`);
  console.log(`   Handled: ${result2.handled}`);

  assert(result2.ok, "Should return ok");
  assert(!result2.handled, "Should skip non-creative requests");
  assert(result2.intent !== "create" && result2.intent !== "animate", "Intent should not be create/animate");

  console.log("\n✅ Test 2: PASSED\n");

  // Test Case 3: Senior audience + creation request
  console.log("✅ Test 3: Senior audience + creative request\n");
  const result3 = await executeBrandGrowthRouting({
    text: "シニア向けの動画を作りたい。高齢者でも始められるジムのイメージ。",
    lineUserId: "U9876543210",
    messageId: "msg_003",
  });

  console.log(`   Status: ${result3.ok ? "✅ OK" : "❌ FAILED"}`);
  console.log(`   Action: ${result3.action}`);
  console.log(`   Intent: ${result3.intent}`);
  console.log(`   Target: ${result3.target}`);
  console.log(`   Objective: ${result3.objective}`);
  console.log(`   Handled: ${result3.handled}`);

  assert(result3.ok, "Should succeed");
  assert(result3.intent === "create", "Intent should be create");
  assert(result3.handled, "Should be handled by Brand Growth");
  assert(result3.target === "senior", "Target should be senior");

  console.log("\n✅ Test 3: PASSED\n");

  // Summary
  console.log("=".repeat(60));
  console.log("✅ Integration Test: LINE → Brand Growth Routing");
  console.log("=".repeat(60));
  console.log("\nAll routing tests passed:");
  console.log("  ✅ Creative requests → routed with target + objective");
  console.log("  ✅ Non-creative requests → skipped gracefully");
  console.log("  ✅ Multiple targets recognized (women_beginners, senior)");
  console.log("  ✅ Intent classification accurate (create vs other)");
  console.log("\nLine webhook can now:");
  console.log("  1. Accept text from LINE user");
  console.log("  2. Route via Brand Growth router");
  console.log("  3. Determine target audience + objective");
  console.log("  4. Pass to brief/prompt generation");
  console.log("  5. Reply to user with draft");
}

console.log("\nbrand_growth_adapter tests passed");
