// Edge Case Tests: Brand Growth adapter resilience

import { executeBrandGrowthRouting } from "./brand_growth_adapter.js";
import { formatBrandGrowthReply } from "./reply.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

{
  console.log("🧪 Edge Case Testing\n");

  // Test 1: Empty string
  console.log("✅ Test 1: Empty text input\n");
  (async () => {
    const result1 = await executeBrandGrowthRouting({
      text: "",
      lineUserId: "U_test",
      messageId: undefined,
    });
    assert(result1.ok, "Should handle empty text gracefully");
    console.log(`   ✅ Empty text: ok=${result1.ok}, handled=${result1.handled}`);

    // Test 2: Whitespace only
    console.log("✅ Test 2: Whitespace only\n");
    const result2 = await executeBrandGrowthRouting({
      text: "   　  　   ",
      lineUserId: "U_test",
      messageId: undefined,
    });
    assert(result2.ok, "Should handle whitespace gracefully");
    console.log(`   ✅ Whitespace: ok=${result2.ok}, handled=${result2.handled}`);

    // Test 3: Very long text (5000+ chars)
    console.log("✅ Test 3: Very long text\n");
    const longText = "女性向け。" + "あ".repeat(5000);
    const result3 = await executeBrandGrowthRouting({
      text: longText,
      lineUserId: "U_test",
      messageId: undefined,
    });
    assert(result3.ok, "Should handle long text");
    console.log(
      `   ✅ Long text (${longText.length} chars): ok=${result3.ok}, target=${result3.target}`,
    );

    // Test 4: Special characters & emoji
    console.log("✅ Test 4: Special characters & emoji\n");
    const specialText = "女性向け😀🎉 !@#$%^&*() こんにちは";
    const result4 = await executeBrandGrowthRouting({
      text: specialText,
      lineUserId: "U_test",
      messageId: undefined,
    });
    assert(result4.ok, "Should handle special chars");
    console.log(`   ✅ Special chars: ok=${result4.ok}`);

    // Test 5: Ambiguous/no keywords
    console.log("✅ Test 5: Ambiguous text (no routing keywords)\n");
    const ambiguous = "ジムについて色々聞きたいことがあります";
    const result5 = await executeBrandGrowthRouting({
      text: ambiguous,
      lineUserId: "U_test",
      messageId: undefined,
    });
    assert(result5.ok, "Should return ok for ambiguous");
    console.log(`   ✅ Ambiguous: ok=${result5.ok}, intent=${result5.intent}`);

    // Test 6: NULL/undefined lineUserId
    console.log("✅ Test 6: Empty lineUserId\n");
    const result6 = await executeBrandGrowthRouting({
      text: "女性向け。15秒。",
      lineUserId: "",
      messageId: undefined,
    });
    assert(result6.ok, "Should handle empty userId");
    console.log(`   ✅ Empty userId: ok=${result6.ok}`);

    // Test 7: Reply formatting with null values
    console.log("✅ Test 7: Reply with missing fields\n");
    const resultNoTarget = {
      ok: true,
      action: "brand_growth_routed",
      intent: "create",
      handled: false, // no target
    };
    const reply7 = formatBrandGrowthReply(resultNoTarget as any);
    assert(
      reply7.includes("申し訳ございません") || reply7.length === 0,
      "Should handle missing target",
    );
    console.log(`   ✅ Missing fields handled: ${reply7.substring(0, 30)}`);

    // Test 8: Repeated keywords
    console.log("✅ Test 8: Repeated keywords\n");
    const repeated = "女性向け 女性向け 女性向け 15秒 15秒 15秒";
    const result8 = await executeBrandGrowthRouting({
      text: repeated,
      lineUserId: "U_test",
      messageId: undefined,
    });
    assert(result8.ok, "Should handle repeated keywords");
    assert(result8.target === "women_beginners", "Should still route correctly");
    console.log(`   ✅ Repeated keywords: target=${result8.target}`);

    // Test 9: Mixed language (Japanese + English)
    console.log("✅ Test 9: Mixed language\n");
    const mixed = "女性向け senior citizens ジム photo 15 seconds trial";
    const result9 = await executeBrandGrowthRouting({
      text: mixed,
      lineUserId: "U_test",
      messageId: undefined,
    });
    assert(result9.ok, "Should handle mixed language");
    console.log(`   ✅ Mixed language: ok=${result9.ok}`);

    // Test 10: Type safety - no crashes on edge inputs
    console.log("✅ Test 10: Robustness check\n");
    const results = [result1, result2, result3, result4, result5, result6, result8, result9];
    for (const r of results) {
      assert(r.ok === true || r.ok === false, "Should always return boolean ok");
      assert(
        r.handled === true || r.handled === false,
        "Should always return boolean handled",
      );
    }
    console.log(`   ✅ Type safety: all results well-formed`);

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ EDGE CASE TESTING: ALL 10 CASES PASSED");
    console.log("=".repeat(60));
    console.log("\n✅ System is resilient to:");
    console.log("  • Empty & whitespace-only input");
    console.log("  • Very long text (5000+ chars)");
    console.log("  • Special characters & emoji");
    console.log("  • Ambiguous/non-matching keywords");
    console.log("  • Missing userIds");
    console.log("  • Null/undefined fields");
    console.log("  • Repeated keywords");
    console.log("  • Mixed Japanese/English");
    console.log("  • Type mismatches");
  })();
}
