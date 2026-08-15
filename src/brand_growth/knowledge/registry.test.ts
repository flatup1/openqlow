// Brand Growth Phase 2 受入試験: Knowledge Registry。
//
// 対応: AT-035 Knowledge Conflict / AT-036 Quarantined Credential Source /
//       AT-042 No Global Knowledge Load、および Phase 2 の failure safe 要件。
//
// この試験は外部へ一切アクセスしない。
// 検証済みの状態を再現するための fixture は **メタデータだけ** をこの場で組み立てる。
// 実際の文書本文をコピーして持ち込むことはしない（それをやると中身を持たない設計が崩れる）。

import type { KnowledgeEntry, KnowledgeQuery } from "../contracts/knowledge.js";
import { scanConflicts } from "./conflicts.js";
import { createManifestRegistry, MANIFEST_ENTRIES } from "./manifest.js";
import { explainKnowledgeResult, queryKnowledge } from "./query.js";
import { AUTHORITY_ORDER, authorityRank } from "./precedence.js";
import { createRegistry, KnowledgeRegistryError } from "./registry.js";
import { applyTokenBudget, isProtected } from "./token_budget.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 検証済みの台帳を組み立てる（メタデータのみ）-------------------------------------

function entry(overrides: Partial<KnowledgeEntry> & Pick<KnowledgeEntry, "id" | "title">): KnowledgeEntry {
  return {
    category: "creative",
    tags: [],
    authority: "approved_reference",
    status: "active",
    source_path: `fixture://${overrides.id}`,
    source_hash: "fixturehash",
    version: "1.0.0",
    reviewed_at: "2026-08-01T00:00:00Z",
    review_due: null,
    token_cost: 100,
    evidence_confidence: 0.7,
    contains_secrets: false,
    contains_pii: false,
    location: "local",
    conflicts_with: [],
    ...overrides,
  };
}

const CONSTITUTION = entry({
  id: "kn_constitution",
  title: "Constitution",
  category: "constitution",
  tags: ["brand:constitution"],
  authority: "owner_canon",
  token_cost: 300,
  evidence_confidence: 1,
});

const DICTIONARY_SAFETY = entry({
  id: "kn_dictionary_safety",
  title: "Dictionary safety",
  category: "dictionary",
  tags: ["brand:dictionary:safety"],
  authority: "owner_canon",
  token_cost: 120,
});

const APPROVAL_POLICY = entry({
  id: "kn_policy_approval",
  title: "Human approval policy",
  category: "policy",
  tags: ["policy:approval"],
  authority: "approved_policy",
  token_cost: 90,
});

const CANON_REFERENCE = entry({
  id: "kn_canon",
  title: "Machine canon selector",
  category: "canon_reference",
  tags: ["canon:facts"],
  authority: "machine_canon",
  token_cost: 80,
});

const TARGET_WOMEN = entry({
  id: "kn_target_women",
  title: "Women beginners",
  category: "target",
  tags: ["target:women_beginners", "story:first_step"],
  token_cost: 150,
});

const TARGET_KIDS = entry({
  id: "kn_target_kids",
  title: "Kids",
  category: "target",
  tags: ["target:kids"],
  token_cost: 150,
});

const TARGET_SPARRING = entry({
  id: "kn_target_sparring",
  title: "Sparring",
  category: "target",
  tags: ["target:sparring_fans"],
  token_cost: 150,
});

const MODE_I2V = entry({
  id: "kn_mode_i2v",
  title: "Image to video rules",
  category: "creative",
  tags: ["mode:image_to_video"],
  token_cost: 110,
});

const PLATFORM_REEL = entry({
  id: "kn_platform_reel",
  title: "Instagram reel rules",
  category: "creative",
  tags: ["platform:instagram_reel"],
  token_cost: 70,
});

const LEARNING_WOMEN = entry({
  id: "kn_learning_women",
  title: "Validated learning for women beginners",
  category: "learning",
  tags: ["target:women_beginners", "objective:trial"],
  authority: "validated_learning",
  token_cost: 60,
  evidence_confidence: 0.85,
});

const QUARANTINED_CREDENTIAL = entry({
  id: "kn_quarantined_briefing",
  title: "Legacy briefing",
  category: "creative",
  tags: ["legacy:briefing", "target:women_beginners"],
  authority: "historical",
  status: "quarantined",
  contains_secrets: true,
  contains_pii: true,
  token_cost: 0,
  evidence_confidence: 0,
  location: "external",
});

const EXTERNAL_MISSING = entry({
  id: "kn_external_vault",
  title: "Vault note",
  status: "missing",
  source_hash: null,
  location: "external",
  tags: ["target:women_beginners"],
});

const BRAND_LINE_A = entry({
  id: "kn_brand_line_a",
  title: "Brand line variant A",
  category: "dictionary",
  tags: ["brand:line", "target:women_beginners"],
  conflicts_with: ["kn_brand_line_b"],
  token_cost: 40,
});

const BRAND_LINE_B = entry({
  id: "kn_brand_line_b",
  title: "Brand line variant B",
  category: "dictionary",
  tags: ["brand:line", "target:women_beginners"],
  token_cost: 40,
});

const VERIFIED_ENTRIES: readonly KnowledgeEntry[] = [
  CONSTITUTION,
  DICTIONARY_SAFETY,
  APPROVAL_POLICY,
  CANON_REFERENCE,
  TARGET_WOMEN,
  TARGET_KIDS,
  TARGET_SPARRING,
  MODE_I2V,
  PLATFORM_REEL,
  LEARNING_WOMEN,
  QUARANTINED_CREDENTIAL,
  EXTERNAL_MISSING,
];

const REGISTRY = createRegistry(VERIFIED_ENTRIES, "test-1.0.0");

function query(overrides: Partial<KnowledgeQuery> = {}): KnowledgeQuery {
  return {
    required_tags: ["brand:constitution"],
    target: "women_beginners",
    objective: "trial",
    platform: "instagram_reel",
    content_mode: "image_to_video",
    max_entries: 10,
    token_budget: 5000,
    facts_needed: false,
    ...overrides,
  };
}

// --- AT-042 全 target を読み込まない -------------------------------------------------

{
  const result = queryKnowledge(REGISTRY, query());
  const ids = result.selected.map(s => s.id);

  assert(ids.includes("kn_constitution"), "AT-042 constitution is always included");
  assert(ids.includes("kn_dictionary_safety"), "AT-042 dictionary is included");
  assert(ids.includes("kn_target_women"), "AT-042 requested target is included");
  assert(ids.includes("kn_mode_i2v"), "AT-042 requested mode is included");

  // 他の target は絶対に読まない。
  assert(!ids.includes("kn_target_kids"), "AT-042 must not load kids target");
  assert(!ids.includes("kn_target_sparring"), "AT-042 must not load sparring target");
  const kidsWithheld = result.withheld.find(w => w.id === "kn_target_kids");
  assert(kidsWithheld?.reason === "other_target", `AT-042 kids reason: ${kidsWithheld?.reason}`);

  // 事実が要らないので machine canon も読まない。
  assert(!ids.includes("kn_canon"), "AT-042 canon is not loaded when facts are not needed");
}

{
  // 事実が要るときだけ machine canon が入る。
  const result = queryKnowledge(REGISTRY, query({ facts_needed: true }));
  assert(result.selected.some(s => s.id === "kn_canon"), "canon selector appears when facts are needed");
  const canon = result.selected.find(s => s.id === "kn_canon");
  assert(canon?.priority_group === 2, `canon should sit in group 2, got ${canon?.priority_group}`);
}

// --- AT-036 隔離された資格情報の文書 ---------------------------------------------------

{
  // その文書の tag に当たる問い合わせでも、絶対に選ばれない。
  const result = queryKnowledge(REGISTRY, query({ required_tags: ["brand:constitution", "legacy:briefing"] }));

  assert(!result.selected.some(s => s.id === "kn_quarantined_briefing"), "AT-036 quarantined entry never selected");

  const withheld = result.withheld.find(w => w.id === "kn_quarantined_briefing");
  assert(withheld !== undefined, "AT-036 quarantined entry is reported as withheld");
  assert(
    withheld?.reason === "contains_secrets" || withheld?.reason === "quarantined",
    `AT-036 reason should say why: ${withheld?.reason}`,
  );

  // 返り値のどこにも中身が乗らない。path とメタデータだけ。
  const serialized = JSON.stringify(result);
  for (const forbidden of ["content", "body", "secret_value", "token=", "password"]) {
    assert(!serialized.includes(forbidden), `AT-036 result must not carry ${forbidden}`);
  }
  // 要求した必須 tag が満たせないことは正直に返す。
  assert(result.missing_required.includes("legacy:briefing"), "AT-036 missing required tag is reported");
}

// --- AT-035 知識の食い違い -------------------------------------------------------------

{
  const conflicted = createRegistry([...VERIFIED_ENTRIES, BRAND_LINE_A, BRAND_LINE_B], "test-conflict");
  const result = queryKnowledge(conflicted, query({ required_tags: ["brand:constitution", "brand:line"] }));

  // どちらも黙って採用しない。
  assert(!result.selected.some(s => s.id === "kn_brand_line_a"), "AT-035 variant A is not silent truth");
  assert(!result.selected.some(s => s.id === "kn_brand_line_b"), "AT-035 variant B is not silent truth");

  // 記録が残り、人間の判断が要ると分かる。
  assert(result.conflicts.length === 1, `AT-035 one conflict record, got ${result.conflicts.length}`);
  assert(result.conflicts[0]?.owner_decision_required === true, "AT-035 owner decision required");
  assert(result.owner_approval_required, "AT-035 result flags owner approval");
  assert(
    result.conflicts[0]?.entry_ids.includes("kn_brand_line_a") &&
      result.conflicts[0]?.entry_ids.includes("kn_brand_line_b"),
    "AT-035 conflict names both entries",
  );
  // 競合しない知識は普通に使える。停止するのは影響範囲だけ。
  assert(result.selected.some(s => s.id === "kn_constitution"), "AT-035 unrelated knowledge still works");
}

{
  // status が conflicted のものも同じ扱い。
  const flagged = createRegistry(
    [...VERIFIED_ENTRIES, entry({ id: "kn_flagged", title: "Flagged", status: "conflicted", tags: ["brand:line"] })],
    "test-flagged",
  );
  const result = queryKnowledge(flagged, query());
  assert(!result.selected.some(s => s.id === "kn_flagged"), "conflicted status is never selected");
  assert(
    result.withheld.some(w => w.id === "kn_flagged" && w.reason === "conflicted"),
    "conflicted status is reported",
  );
}

// --- 必須 tag だけを読む ----------------------------------------------------------------

{
  const result = queryKnowledge(REGISTRY, query({ required_tags: ["brand:constitution"], platform: null, content_mode: null }));
  const ids = result.selected.map(s => s.id);
  assert(!ids.includes("kn_platform_reel"), "platform knowledge is not loaded when platform is null");
  assert(!ids.includes("kn_mode_i2v"), "mode knowledge is not loaded when mode is null");
}

// --- 件数の上限 --------------------------------------------------------------------------

{
  const result = queryKnowledge(REGISTRY, query({ max_entries: 2 }));
  assert(result.selected.length <= 3, `max entries respected (constitution protected), got ${result.selected.length}`);
  assert(result.selected.some(s => s.category === "constitution"), "constitution survives the entry cap");
  assert(result.withheld.some(w => w.reason === "max_entries"), "dropped entries report max_entries");
}

// --- 予算の上限。憲法は落とさない --------------------------------------------------------

{
  const result = queryKnowledge(REGISTRY, query({ token_budget: 400 }));
  assert(result.token_total <= 400, `token total within budget, got ${result.token_total}`);
  assert(result.selected.some(s => s.id === "kn_constitution"), "constitution is never dropped for budget");
  assert(result.withheld.some(w => w.reason === "token_budget"), "budget drops are reported");

  // 落とす順は権威の低い方から。承認ポリシーより先に参考資料が落ちる。
  const droppedIds = result.withheld.filter(w => w.reason === "token_budget").map(w => w.id);
  assert(droppedIds.length > 0, "something was dropped");
}

{
  // 憲法だけで予算を超える場合は、削らずに警告する。
  const result = queryKnowledge(REGISTRY, query({ token_budget: 10 }));
  assert(result.selected.some(s => s.id === "kn_constitution"), "constitution stays even over budget");
  assert(result.warnings.includes("token_budget_exceeded_by_protected"), "over-budget by protected is warned");
}

{
  // 予算削減の単体確認。
  const budget = applyTokenBudget(
    [
      { entry: CONSTITUTION, group: 1, matched_tags: [] },
      { entry: APPROVAL_POLICY, group: 1, matched_tags: [] },
      { entry: TARGET_WOMEN, group: 3, matched_tags: [] },
    ],
    350,
  );
  assert(budget.kept.some(c => c.entry.id === "kn_constitution"), "budget keeps constitution");
  assert(budget.token_total <= 350, "budget respects the limit");
  assert(isProtected(CONSTITUTION), "constitution is protected");
  assert(!isProtected(TARGET_WOMEN), "target reference is not protected");
}

// --- 優先順位と決定性 ---------------------------------------------------------------------

{
  const result = queryKnowledge(REGISTRY, query({ facts_needed: true }));

  // 段が昇順に並ぶ。
  const groups = result.selected.map(s => s.priority_group);
  for (let i = 1; i < groups.length; i += 1) {
    assert((groups[i] ?? 0) >= (groups[i - 1] ?? 0), `priority groups must be ascending: ${groups.join(",")}`);
  }
  // 先頭はオーナー正本。
  assert(result.selected[0]?.authority === "owner_canon", `first entry authority: ${result.selected[0]?.authority}`);

  // 同じ入力からは同じ結果。
  const again = queryKnowledge(REGISTRY, query({ facts_needed: true }));
  assert(JSON.stringify(result) === JSON.stringify(again), "query must be deterministic");

  // 権威の順序が定義どおり。
  assert(authorityRank("owner_canon") < authorityRank("machine_canon"), "owner canon outranks machine canon");
  assert(authorityRank("machine_canon") < authorityRank("approved_policy"), "machine canon outranks policy");
  assert(authorityRank("approved_policy") < authorityRank("validated_learning"), "policy outranks learning");
  assert(authorityRank("validated_learning") < authorityRank("approved_reference"), "learning outranks reference");
  assert(authorityRank("approved_reference") < authorityRank("historical"), "reference outranks historical");
  assert(AUTHORITY_ORDER.length === 6, "six authority levels");
}

// --- 憲法が無ければ止まる -------------------------------------------------------------------

{
  const withoutConstitution = createRegistry(
    VERIFIED_ENTRIES.filter(e => e.category !== "constitution"),
    "test-no-constitution",
  );
  const result = queryKnowledge(withoutConstitution, query());
  assert(result.blocked, "missing constitution blocks the query");
  assert(result.block_reason === "constitution_unavailable", `block reason: ${result.block_reason}`);
  assert(result.selected.length === 0, "blocked query selects nothing");
  assert(explainKnowledgeResult(result).includes("止めました"), "blocked result explains itself");
}

{
  // 憲法が隔離されている場合も同じく止まる。
  const quarantinedConstitution = createRegistry(
    [
      entry({
        id: "kn_constitution",
        title: "Constitution",
        category: "constitution",
        tags: ["brand:constitution"],
        authority: "owner_canon",
        status: "quarantined",
      }),
      TARGET_WOMEN,
    ],
    "test-quarantined-constitution",
  );
  const result = queryKnowledge(quarantinedConstitution, query());
  assert(result.blocked, "quarantined constitution blocks the query");
}

{
  // 憲法が食い違っている場合も止まる。
  const conflictedConstitution = createRegistry(
    [
      entry({
        id: "kn_constitution",
        title: "Constitution",
        category: "constitution",
        tags: ["brand:constitution"],
        authority: "owner_canon",
        status: "conflicted",
      }),
      TARGET_WOMEN,
    ],
    "test-conflicted-constitution",
  );
  const result = queryKnowledge(conflictedConstitution, query());
  assert(result.blocked, "conflicted constitution blocks the query");
}

// --- 外部ソースが無いときは安全に失敗する ------------------------------------------------------

{
  const result = queryKnowledge(REGISTRY, query());
  assert(!result.selected.some(s => s.id === "kn_external_vault"), "external missing source is never selected");
  assert(
    result.withheld.some(w => w.id === "kn_external_vault" && w.reason === "external_unavailable"),
    "external unavailable is reported",
  );
  assert(
    result.warnings.some(w => w.startsWith("external_source_unavailable:")),
    "external unavailability warns instead of failing hard",
  );
  // ローカルの検証済み知識だけで続行できている。
  assert(result.selected.length > 0, "local verified entries still work");
}

// --- target 知識が無いときは一般向けで進めることを明示する -------------------------------------

{
  const result = queryKnowledge(REGISTRY, query({ target: "senior" }));
  assert(result.warnings.includes("target_knowledge_missing:senior"), "missing target knowledge is warned");
  assert(result.warnings.includes("generic_fallback_used"), "generic fallback is announced");
  assert(!result.blocked, "missing target knowledge does not block");
  assert(result.selected.some(s => s.category === "constitution"), "constitution still available");
}

// --- 台帳が偽装を受け付けない -------------------------------------------------------------------

{
  let threw = false;
  try {
    createRegistry([entry({ id: "kn_fake", title: "Fake", source_hash: null, status: "active" })], "test-fake");
  } catch (error) {
    threw = error instanceof KnowledgeRegistryError;
  }
  assert(threw, "unverified source must not be registered as active");
}

{
  let threw = false;
  try {
    createRegistry([CONSTITUTION, entry({ ...CONSTITUTION, title: "duplicate" })], "test-dup");
  } catch (error) {
    threw = error instanceof KnowledgeRegistryError;
  }
  assert(threw, "duplicate ids are rejected");
}

{
  let threw = false;
  try {
    createRegistry(
      [entry({ id: "kn_secret_active", title: "Secret", contains_secrets: true, status: "active" })],
      "test-secret",
    );
  } catch (error) {
    threw = error instanceof KnowledgeRegistryError;
  }
  assert(threw, "secret bearing entry must be quarantined");
}

{
  let threw = false;
  try {
    const withContent = { ...entry({ id: "kn_with_body", title: "Body" }), body: "本文" } as KnowledgeEntry;
    createRegistry([withContent], "test-body");
  } catch (error) {
    threw = error instanceof KnowledgeRegistryError;
  }
  assert(threw, "entries must not carry content fields");
}

// --- 宣言（manifest）は実体未確認を正直に扱う -----------------------------------------------------

{
  const manifest = createManifestRegistry();
  assert(MANIFEST_ENTRIES.length >= 9, `manifest declares the required entries, got ${MANIFEST_ENTRIES.length}`);

  // 確認していないものを active と偽装しない。ハッシュも作らない。
  for (const declared of MANIFEST_ENTRIES) {
    if (declared.status === "active") {
      assert(declared.source_hash !== null, `manifest must not fake active: ${declared.id}`);
    }
    if (declared.source_hash === null) {
      assert(declared.status !== "active", `unverified entry must not be active: ${declared.id}`);
    }
  }

  // 資格情報を含む legacy 文書は隔離されている。
  const legacy = MANIFEST_ENTRIES.find(e => e.id === "kn_quarantine_legacy_briefing");
  assert(legacy?.status === "quarantined", "legacy briefing is quarantined");
  assert(legacy?.contains_secrets === true, "legacy briefing is marked as secret bearing");

  // 宣言だけでは実体が無いので、安全に止まる。これが正しい失敗の仕方。
  const result = queryKnowledge(manifest, query());
  assert(result.blocked, "declared-only manifest must fail safe");
  assert(result.block_reason === "constitution_unavailable", `manifest block reason: ${result.block_reason}`);
  assert(!result.selected.some(s => s.id === "kn_quarantine_legacy_briefing"), "quarantined never selected");

  // 必要な知識が宣言されている。
  const declaredIds = MANIFEST_ENTRIES.map(e => e.id);
  for (const required of [
    "kn_brand_constitution",
    "kn_brand_dictionary",
    "kn_machine_canon_reference",
    "kn_human_approval_policy",
    "kn_target_kids",
    "kn_target_women_beginners",
    "kn_target_sparring",
    "kn_provider_demo_capability",
    "kn_quarantine_legacy_briefing",
  ]) {
    assert(declaredIds.includes(required), `manifest must declare ${required}`);
  }
}

// --- 入力・台帳・結果が書き換わらない ---------------------------------------------------------------

{
  assert(Object.isFrozen(REGISTRY), "registry is frozen");
  assert(Object.isFrozen(REGISTRY.entries), "registry entries are frozen");

  const result = queryKnowledge(REGISTRY, query());
  assert(Object.isFrozen(result), "result is frozen");
  assert(Object.isFrozen(result.selected), "selected list is frozen");
  assert(Object.isFrozen(result.withheld), "withheld list is frozen");

  const beforeLength = result.selected.length;
  try {
    (result.selected as unknown as unknown[]).push({});
  } catch {
    // strict mode では例外。値が変わらないことだけを保証する。
  }
  assert(result.selected.length === beforeLength, "result must be immutable");

  // 台帳の中身も書き換えられない。
  const firstEntry = REGISTRY.entries[0];
  const beforeId = firstEntry?.id;
  try {
    (firstEntry as unknown as { id: string }).id = "hacked";
  } catch {
    // strict mode では例外。
  }
  assert(REGISTRY.entries[0]?.id === beforeId, "registry entries must be immutable");
}

// --- 食い違い検査の単体確認 -------------------------------------------------------------------------

{
  const scan = scanConflicts([
    { entry: BRAND_LINE_A, group: 3, matched_tags: [] },
    { entry: BRAND_LINE_B, group: 3, matched_tags: [] },
  ]);
  assert(scan.conflicts.length === 1, "one declared conflict");
  assert(scan.conflicted_ids.has("kn_brand_line_a"), "both sides are held back");
  assert(scan.conflicted_ids.has("kn_brand_line_b"), "both sides are held back");

  // 相手が候補に居なければ食い違いにならない。
  const alone = scanConflicts([{ entry: BRAND_LINE_A, group: 3, matched_tags: [] }]);
  assert(alone.conflicts.length === 0, "no conflict when the counterpart is absent");
}

// --- 人が読める要約 -----------------------------------------------------------------------------------

{
  const summary = explainKnowledgeResult(queryKnowledge(REGISTRY, query()));
  assert(summary.includes("使う知識:"), "summary states what is used");
  assert(summary.includes("外した知識:"), "summary states what was withheld");
}

console.log("brand_growth knowledge registry tests passed");
