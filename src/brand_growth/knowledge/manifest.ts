// Brand Growth Phase 2: 知識台帳の宣言（YAML相当をTypeScriptで持つ）。
//
// ここは「宣言」であって「検証済みの事実」ではない。
//
// 重要な正直さの規則:
//   - このcloud worktreeには docs/flatup-ai-os/ が存在しない（Codex担当・別管理）。
//   - 実体を確認していないので source_hash は null、status は missing にする。
//     確認していないものを active と偽装しない。ハッシュを捏造しない。
//   - したがって、この宣言だけで問い合わせを実行すると憲法が見つからず blocked になる。
//     それが正しい失敗の仕方である。実体が置かれ、検証された時点で active へ更新する。
//   - legacy の資格情報を含む文書は quarantined として path だけ登録し、
//     読み込み口（loader）を一切持たせない。中身は永久に読まない。

import type { KnowledgeEntry } from "../contracts/knowledge.js";
import { createRegistry } from "./registry.js";

export const MANIFEST_VERSION = "2.0.0-declared";

/**
 * 宣言済みの知識。全て未検証のため status は missing。
 * 実体を確認して hash を入れた時点で active へ変える運用にする。
 */
export const MANIFEST_ENTRIES: readonly KnowledgeEntry[] = Object.freeze([
  {
    id: "kn_brand_constitution",
    title: "Brand Constitution",
    category: "constitution",
    tags: Object.freeze(["brand:constitution"]),
    authority: "owner_canon",
    status: "missing",
    source_path: "docs/flatup-ai-os/BRAND_CONSTITUTION.md",
    source_hash: null,
    version: "1.0.0-design",
    reviewed_at: null,
    review_due: null,
    token_cost: 900,
    evidence_confidence: 0.9,
    contains_secrets: false,
    contains_pii: false,
    location: "local",
    conflicts_with: Object.freeze([]),
  },
  {
    id: "kn_brand_dictionary",
    title: "Brand Dictionary",
    category: "dictionary",
    tags: Object.freeze([
      "brand:dictionary",
      "brand:dictionary:safety",
      "brand:dictionary:fun",
      "brand:dictionary:trust",
      "brand:dictionary:aspiration",
    ]),
    authority: "owner_canon",
    status: "missing",
    source_path: "docs/flatup-ai-os/BRAND_DICTIONARY.md",
    source_hash: null,
    version: "1.0.0-design",
    reviewed_at: null,
    review_due: null,
    token_cost: 700,
    evidence_confidence: 0.9,
    contains_secrets: false,
    contains_pii: false,
    location: "local",
    conflicts_with: Object.freeze([]),
  },
  {
    id: "kn_human_approval_policy",
    title: "Human Approval Policy",
    category: "policy",
    tags: Object.freeze(["policy:approval", "policy:human_gate"]),
    authority: "approved_policy",
    status: "missing",
    source_path: "docs/ai-os/canon/approval_matrix.md",
    source_hash: null,
    version: "unverified",
    reviewed_at: null,
    review_due: null,
    token_cost: 400,
    evidence_confidence: 0.8,
    contains_secrets: false,
    contains_pii: false,
    location: "local",
    conflicts_with: Object.freeze([]),
  },
  {
    id: "kn_machine_canon_reference",
    title: "Machine canon reference (selector only)",
    category: "canon_reference",
    tags: Object.freeze(["canon:machine", "canon:facts"]),
    authority: "machine_canon",
    status: "missing",
    source_path: "src/shared/canon.ts",
    source_hash: null,
    version: "unverified",
    reviewed_at: null,
    review_due: null,
    token_cost: 300,
    evidence_confidence: 1,
    contains_secrets: false,
    contains_pii: false,
    location: "local",
    conflicts_with: Object.freeze([]),
  },
  {
    id: "kn_target_kids",
    title: "Kids target reference",
    category: "target",
    tags: Object.freeze(["target:kids", "story:growth"]),
    authority: "approved_reference",
    status: "missing",
    source_path: "docs/flatup-ai-os/BRAND_DICTIONARY.md#kids",
    source_hash: null,
    version: "1.0.0-design",
    reviewed_at: null,
    review_due: null,
    token_cost: 350,
    evidence_confidence: 0.7,
    contains_secrets: false,
    contains_pii: false,
    location: "local",
    conflicts_with: Object.freeze([]),
  },
  {
    id: "kn_target_women_beginners",
    title: "Women beginner target reference",
    category: "target",
    tags: Object.freeze(["target:women_beginners", "story:first_step"]),
    authority: "approved_reference",
    status: "missing",
    source_path: "docs/flatup-ai-os/BRAND_DICTIONARY.md#women-beginners",
    source_hash: null,
    version: "1.0.0-design",
    reviewed_at: null,
    review_due: null,
    token_cost: 350,
    evidence_confidence: 0.7,
    contains_secrets: false,
    contains_pii: false,
    location: "local",
    conflicts_with: Object.freeze([]),
  },
  {
    id: "kn_target_sparring",
    title: "Sparring target reference",
    category: "target",
    tags: Object.freeze(["target:sparring_fans", "story:challenge"]),
    authority: "approved_reference",
    status: "missing",
    source_path: "docs/flatup-ai-os/BRAND_DICTIONARY.md#sparring",
    source_hash: null,
    version: "1.0.0-design",
    reviewed_at: null,
    review_due: null,
    token_cost: 350,
    evidence_confidence: 0.7,
    contains_secrets: false,
    contains_pii: false,
    location: "local",
    conflicts_with: Object.freeze([]),
  },
  {
    id: "kn_provider_demo_capability",
    title: "Demo provider capability",
    category: "provider",
    tags: Object.freeze(["provider:demo", "provider:capability"]),
    authority: "approved_reference",
    status: "missing",
    source_path: "docs/flatup-ai-os/ARCHITECTURE_BOOK.md#provider-demo",
    source_hash: null,
    version: "1.0.0-design",
    reviewed_at: null,
    review_due: null,
    token_cost: 250,
    evidence_confidence: 0.6,
    contains_secrets: false,
    contains_pii: false,
    location: "local",
    conflicts_with: Object.freeze([]),
  },
  {
    // 資格情報を含む legacy 文書。path だけを登録し、中身は永久に読まない。
    // 読み込み口を作らないことが対策そのものなので、loader を書いてはいけない。
    id: "kn_quarantine_legacy_briefing",
    title: "Legacy briefing (quarantined, never loaded)",
    category: "creative",
    tags: Object.freeze(["legacy:briefing", "quarantine:credential"]),
    authority: "historical",
    status: "quarantined",
    source_path: "external://legacy/FLATUP_AI_OS_briefing.md",
    source_hash: null,
    version: "unverified",
    reviewed_at: null,
    review_due: null,
    token_cost: 0,
    evidence_confidence: 0,
    contains_secrets: true,
    contains_pii: true,
    location: "external",
    conflicts_with: Object.freeze([]),
  },
]);

/**
 * 宣言から台帳を作る。
 * 実体が未検証なので、この台帳で問い合わせると憲法が見つからず blocked になる。
 * それは不具合ではなく、設計どおりの安全な失敗である。
 */
export function createManifestRegistry() {
  return createRegistry(MANIFEST_ENTRIES, MANIFEST_VERSION);
}
