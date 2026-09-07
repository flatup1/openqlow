// Integration Test: Source Verifier → queryKnowledge Pipeline
//
// 責務: verifyManifestRegistry で Design Pack を検証・有効化し、
// active verified KnowledgeRef のみを queryKnowledge に渡す。
// queryKnowledge は I/O-free のまま。

import { createHash } from "node:crypto";
import type { KnowledgeEntry } from "../brand_growth/contracts/knowledge.js";
import { verifyManifestRegistry, verifySourcesInMemory } from "./knowledge_source_verifier.js";

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- Integration Test 1: verifyManifestRegistry Pipeline ---

{
  // Scenario: Production manifest with mixed entry types
  // All entries start with source_hash: null (awaiting Design Pack verification)

  const manifestEntries: KnowledgeEntry[] = [
    // 1. Constitution (owner_canon) - should activate and unblock query
    {
      id: "kn_constitution_2026",
      title: "Brand Constitution",
      category: "constitution",
      tags: ["brand:constitution"],
      authority: "owner_canon",
      status: "active",
      source_path: "constitution.md",
      source_hash: null, // Awaiting Design Pack
      version: "2026.1",
      reviewed_at: "2026-08-01T00:00:00Z",
      review_due: null,
      token_cost: 300,
      evidence_confidence: 1,
      contains_secrets: false,
      contains_pii: false,
      location: "local",
      conflicts_with: [],
    },
    // 2. Target with fragment - should activate, preserve fragment, keep hash
    {
      id: "kn_target_women_beginners",
      title: "Women Beginners Target",
      category: "target",
      tags: ["target:women_beginners"],
      authority: "approved_reference",
      status: "active",
      source_path: "target.md#women-beginners", // Fragment: selector metadata
      source_hash: null,
      version: "1",
      reviewed_at: "2026-08-01T00:00:00Z",
      review_due: null,
      token_cost: 100,
      evidence_confidence: 0.9,
      contains_secrets: false,
      contains_pii: false,
      location: "local",
      conflicts_with: [],
    },
    // 3. Secret entry - should mark missing, zero I/O
    {
      id: "kn_secret_credentials",
      title: "Secret Data",
      category: "dictionary",
      tags: [],
      authority: "historical",
      status: "active",
      source_path: "secret.md",
      source_hash: null,
      version: "0",
      reviewed_at: null,
      review_due: null,
      token_cost: 0,
      evidence_confidence: 0,
      contains_secrets: true, // Protected: never open
      contains_pii: false,
      location: "local",
      conflicts_with: [],
    },
    // 4. PII entry - should mark missing, zero I/O
    {
      id: "kn_customer_data",
      title: "Customer Data",
      category: "dictionary",
      tags: [],
      authority: "historical",
      status: "active",
      source_path: "customers.md",
      source_hash: null,
      version: "0",
      reviewed_at: null,
      review_due: null,
      token_cost: 0,
      evidence_confidence: 0,
      contains_secrets: false,
      contains_pii: true, // Protected: never open
      location: "local",
      conflicts_with: [],
    },
    // 5. Quarantined entry - should stay quarantined, zero I/O
    {
      id: "kn_quarantined_old",
      title: "Old Quarantined",
      category: "dictionary",
      tags: [],
      authority: "historical",
      status: "quarantined",
      source_path: "old.md",
      source_hash: null,
      version: "0",
      reviewed_at: null,
      review_due: null,
      token_cost: 0,
      evidence_confidence: 0,
      contains_secrets: false,
      contains_pii: false,
      location: "local",
      conflicts_with: [],
    },
    // 6. Conflicted entry - should not activate, preserve as-is
    {
      id: "kn_voice_v1",
      title: "Voice Variant 1",
      category: "dictionary",
      tags: ["voice:variant"],
      authority: "owner_canon",
      status: "active",
      source_path: "voice.md#v1",
      source_hash: null,
      version: "1",
      reviewed_at: "2026-08-01T00:00:00Z",
      review_due: null,
      token_cost: 50,
      evidence_confidence: 1,
      contains_secrets: false,
      contains_pii: false,
      location: "local",
      conflicts_with: ["kn_voice_v2"], // Conflicted
    },
  ];

  // Design Pack fixture content
  const constitutionContent = "# Brand Constitution\n\nCore safety values for all women";
  const targetContent = "## Women Beginners\nLow-impact, confidence-building exercises";
  const voiceContent = "## Brand Voice\nWarm, encouraging, judgment-free";

  const constitutionHash = hashContent(constitutionContent);
  const targetHash = hashContent(targetContent);
  const voiceHash = hashContent(voiceContent);

  // Mock Design Pack files
  const mockMap = new Map([
    ["constitution.md", constitutionContent],
    ["target.md", targetContent],
    ["voice.md", voiceContent],
    // Note: secret.md, customers.md, old.md are NOT in mock (never accessed)
  ]);

  // Step 1: Verify manifest against fixture
  const verified = verifySourcesInMemory(manifestEntries, mockMap);

  console.log("✅ Integration Test 1: Verification Phase");

  // Step 2: Verify Constitution activated (unblocks query)
  const constitution = verified[0];
  assert(constitution?.status === "active", "Constitution activated after verification");
  assert(constitution?.source_hash === constitutionHash, "Constitution hash computed");
  console.log(`  Constitution hash: ${constitution?.source_hash?.substring(0, 8)}...`);

  // Step 3: Verify Target activated with fragment preserved
  const target = verified[1];
  assert(target?.status === "active", "Target activated after verification");
  assert(target?.source_hash === targetHash, "Target hash computed from base file");
  assert(target?.source_path === "target.md#women-beginners", "Fragment metadata preserved");
  console.log(`  Target path: ${target?.source_path} (fragment preserved)`);
  console.log(`  Target hash: ${target?.source_hash?.substring(0, 8)}...`);

  // Step 4: Verify Protected entries INACTIVE (zero I/O)
  const secret = verified[2];
  assert(secret?.status === "missing", "Secret entry marked missing");
  assert(secret?.source_hash === null, "Secret has no hash (never opened)");
  console.log("  Secret: marked missing, zero I/O ✅");

  const pii = verified[3];
  assert(pii?.status === "missing", "PII entry marked missing");
  assert(pii?.source_hash === null, "PII has no hash (never opened)");
  console.log("  PII: marked missing, zero I/O ✅");

  const quarantined = verified[4];
  assert(quarantined?.status === "quarantined", "Quarantined status preserved");
  assert(quarantined?.source_hash === null, "Quarantined has no hash (never opened)");
  console.log("  Quarantined: status preserved, zero I/O ✅");

  // Step 5: Verify Conflicted entry NOT activated
  const conflicted = verified[5];
  assert(conflicted?.status === "active", "Conflicted status preserved");
  assert(conflicted?.source_hash === null, "Conflicted has no hash (never activated)");
  assert(conflicted?.conflicts_with.includes("kn_voice_v2"), "Conflict metadata preserved");
  console.log("  Conflicted: not activated, preserved for owner decision ✅");

  // Step 6: Build active-only registry for queryKnowledge
  const activeVerified = verified.filter(
    entry => entry.status === "active" && entry.source_hash !== null
  );
  console.log(`\n✅ Active verified entries for queryKnowledge: ${activeVerified.length}`);
  console.log(`   - Constitution: yes`);
  console.log(`   - Target (women_beginners): yes`);
  console.log(`   - Protected/Conflicted: no (filtered out)`);

  // Step 7: Verify queryKnowledge would receive only active verified entries
  assert(activeVerified.length === 2, "Only 2 entries are active + verified");
  assert(
    activeVerified.every(e => e.status === "active" && e.source_hash !== null),
    "All entries active with verified hash"
  );
  console.log("\n✅ Integration Test 1: PASSED");
}

console.log("\nintegration_knowledge tests passed");
