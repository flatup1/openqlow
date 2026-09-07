// Brand Growth Phase 3: 試験用の「検証済み」知識台帳。
//
// 大事な前提:
//   ここにあるのは **メタデータだけ** であり、実際の文書の本文は一切持ち込まない。
//   本番の manifest は実体未確認のため missing であり、それが正しい状態。
//   その状態では Prompt を作れないので、Phase 3 の動作確認だけを目的に、
//   「検証済みならこうなる」という台帳をこの場で組み立てる。
//   fake hash で本番を騙すためのものではないので、fixture 専用の印を付ける。

import type { KnowledgeEntry } from "../contracts/knowledge.js";
import { createRegistry } from "../knowledge/registry.js";

function fixtureEntry(
  overrides: Partial<KnowledgeEntry> & Pick<KnowledgeEntry, "id" | "title">,
): KnowledgeEntry {
  return {
    category: "creative",
    tags: [],
    authority: "approved_reference",
    status: "active",
    source_path: `fixture://${overrides.id}`,
    source_hash: "fixture-only-not-a-real-hash",
    version: "fixture-1.0.0",
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

export const FIXTURE_CONSTITUTION = fixtureEntry({
  id: "kn_fx_constitution",
  title: "Brand Constitution (fixture)",
  category: "constitution",
  tags: ["brand:constitution"],
  authority: "owner_canon",
  version: "fixture-constitution-1.0.0",
  token_cost: 300,
  evidence_confidence: 1,
});

export const FIXTURE_DICTIONARY = fixtureEntry({
  id: "kn_fx_dictionary",
  title: "Brand Dictionary (fixture)",
  category: "dictionary",
  tags: [
    "brand:dictionary:safety",
    "brand:dictionary:fun",
    "brand:dictionary:trust",
    "brand:dictionary:aspiration",
  ],
  authority: "owner_canon",
  version: "fixture-dictionary-1.0.0",
  token_cost: 150,
});

export const FIXTURE_TARGETS: readonly KnowledgeEntry[] = [
  fixtureEntry({
    id: "kn_fx_target_women",
    title: "Women beginners (fixture)",
    category: "target",
    tags: ["target:women_beginners", "story:first_step"],
    version: "fixture-target-women-1.0.0",
  }),
  fixtureEntry({
    id: "kn_fx_target_kids",
    title: "Kids (fixture)",
    category: "target",
    tags: ["target:kids", "story:growth"],
    version: "fixture-target-kids-1.0.0",
  }),
  fixtureEntry({
    id: "kn_fx_target_kids_parents",
    title: "Kids and parents (fixture)",
    category: "target",
    tags: ["target:kids_parents", "story:shared_action"],
    version: "fixture-target-kids-parents-1.0.0",
  }),
  fixtureEntry({
    id: "kn_fx_target_competition",
    title: "Competition (fixture)",
    category: "target",
    tags: ["target:competition", "story:challenge"],
    version: "fixture-target-competition-1.0.0",
  }),
  fixtureEntry({
    id: "kn_fx_target_facility",
    title: "Facility (fixture)",
    category: "target",
    tags: ["target:facility", "story:place"],
    version: "fixture-target-facility-1.0.0",
  }),
  fixtureEntry({
    id: "kn_fx_target_general",
    title: "General beginner (fixture)",
    category: "target",
    tags: ["target:general_beginner", "story:first_step"],
    version: "fixture-target-general-1.0.0",
  }),
];

export const FIXTURE_MODE_RULES = fixtureEntry({
  id: "kn_fx_mode_i2v",
  title: "Image to video rules (fixture)",
  category: "creative",
  tags: ["mode:image_to_video", "mode:animation", "mode:text_to_video"],
  version: "fixture-mode-1.0.0",
  token_cost: 120,
});

/** 検証済みの状態を再現した台帳。Phase 3 の dry-run 用。 */
export const FIXTURE_REGISTRY = createRegistry(
  [FIXTURE_CONSTITUTION, FIXTURE_DICTIONARY, ...FIXTURE_TARGETS, FIXTURE_MODE_RULES],
  "fixture-registry-1.0.0",
);
