// Brand Growth Phase 3: Provider に依存しない Prompt IR。
//
// 参照: SCHEMA_CATALOG §7、PROMPT_BIBLE、ACCEPTANCE_TESTS AT-016。
//
// ここには絶対に入れないもの:
//   - Provider の endpoint、API、モデル名、ベンダー固有のコマンドや request JSON
//   - 特定の作家・制作会社・スタジオの固有名
//   - 料金・住所・時間などの事実
//   - 秘密情報、個人情報
//
// 生成にいくらかかるかはここでは分からない。estimated_cost は null のままにし、
// 課金生成には人間の承認が要ることだけを明示する。

import type { VersionBundle } from "../contracts/version_bundle.js";
import type {
  Assumption,
  ContentMode,
  EmotionalGoal,
  Objective,
  TargetPrimary,
} from "../contracts/route_decision.js";
import type { PersonContext } from "../contracts/creative_brief.js";

export const PROMPT_ENGINE_VERSION = "3.0.0";
export const PROMPT_TEMPLATE_VERSION = "3.0.1";
export const NEGATIVE_RULES_VERSION = "3.0.0";

/** 避けたいものの分類。必要な分類だけを選ぶ（全部入れない）。 */
export type NegativeCategory =
  | "identity"
  | "character_consistency"
  | "anatomy"
  | "motion"
  | "temporal"
  | "environment"
  | "brand";

export interface NegativeBlock {
  readonly category: NegativeCategory;
  readonly rules: readonly string[];
}

export interface PromptIR {
  readonly prompt_id: string;
  readonly brief_id: string;
  readonly target: TargetPrimary;
  readonly objective: Objective;
  readonly emotional_goal: EmotionalGoal;
  readonly human_context: PersonContext;
  readonly story: readonly string[];
  readonly hero_moment: string;
  /** 元の素材から変えてはいけないもの。 */
  readonly subject_preservation: readonly string[];
  /** 1本につき1つの動作。 */
  readonly action: string;
  readonly body_mechanics: readonly string[];
  readonly camera: string;
  readonly lens: string;
  readonly composition: string;
  readonly lighting: string;
  readonly atmosphere: string;
  readonly color: string;
  readonly speed: string;
  readonly sound: string;
  readonly music: string;
  readonly continuity: readonly string[];
  readonly negative_categories: readonly NegativeBlock[];
  readonly duration_seconds: number | null;
  readonly aspect_ratio: string | null;
  /** 誘導の一言は本編の余韻の後。承認前は出さない。 */
  readonly cta_editing_note: string | null;
  /** Provider を特定しない、一般的な制約メモ。 */
  readonly provider_constraints: readonly string[];
  readonly knowledge_references: readonly string[];
  readonly assumptions: readonly Assumption[];
  readonly version_bundle: VersionBundle;
  /** 生成費用はここでは決まらない。 */
  readonly estimated_cost: null;
  /** 課金生成は必ず人間の承認が要る。 */
  readonly paid_generation_approval_required: true;
  readonly visual_mode: ContentMode;
}

/**
 * 版の束を作る。
 * 実際に使った知識の版を写し取るので、後から知識が変わっても記録は変わらない。
 */
export function buildVersionBundle(params: {
  readonly knowledge_registry_version: string | null;
  readonly constitution_version: string | null;
  readonly dictionary_version: string | null;
  readonly target_knowledge_version: string | null;
  readonly router_version: string;
}): VersionBundle {
  return Object.freeze({
    constitution_version: params.constitution_version,
    dictionary_version: params.dictionary_version,
    router_version: params.router_version,
    knowledge_registry_version: params.knowledge_registry_version,
    target_knowledge_version: params.target_knowledge_version,
    prompt_engine_version: PROMPT_ENGINE_VERSION,
    prompt_template_version: PROMPT_TEMPLATE_VERSION,
    negative_rules_version: NEGATIVE_RULES_VERSION,
    metrics_schema_version: null,
    provider_adapter_id: null,
    provider_adapter_version: null,
    learning_policy_version: null,
  });
}
