// Brand Growth Phase 3: 一行の依頼から、人が確認できる一式まで組み立てる（dry-run）。
//
// 出す10点:
//   1 日本語の要約  2 Prompt IR  3 選んだ Negative 分類  4 最終プロンプト
//   5 一般的な Provider 互換メモ  6 編集メモ  7 推定した箇所  8 使った知識
//   9 版の記録  10 必要な承認
//
// 外へは何も送らない。生成もしない。課金もしない。

import type { CreativeBrief } from "../contracts/creative_brief.js";
import type { CreativeInput } from "../contracts/creative_input.js";
import type { KnowledgeResult } from "../contracts/knowledge.js";
import type { Assumption, RouteDecision } from "../contracts/route_decision.js";
import type { VersionBundle } from "../contracts/version_bundle.js";
import { buildBrief } from "../director/build_brief.js";
import { composePromptIR, renderFinalPrompt } from "./compose.js";
import type { NegativeSelectionInput } from "./negative_compose.js";
import { buildVersionBundle, type NegativeBlock, type PromptIR } from "./prompt_ir.js";
import { guardStyleNames } from "./style_name_guard.js";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

export interface ApprovalRequirement {
  /** 課金生成には必ず人間の承認が要る。 */
  readonly paid_generation_approval_required: true;
  /** 誘導文を本文へ載せるのに承認が要るか。 */
  readonly cta_approval_required: boolean;
  /** 知識の食い違いでオーナー判断が要るか。 */
  readonly knowledge_conflict_approval_required: boolean;
  readonly notes: readonly string[];
}

export interface CreativePackage {
  readonly blocked: boolean;
  readonly block_reason: string | null;
  readonly summary_ja: string;
  readonly prompt_ir: PromptIR | null;
  readonly negative_categories: readonly NegativeBlock[];
  readonly final_prompt: string | null;
  readonly provider_compatibility_notes: readonly string[];
  readonly editing_note: string | null;
  readonly assumptions: readonly Assumption[];
  readonly knowledge_references: readonly string[];
  readonly version_bundle: VersionBundle;
  readonly approval: ApprovalRequirement;
  readonly warnings: readonly string[];
}

/** 選ばれた知識から版を写し取る。後で知識が変わっても、この記録は変わらない。 */
function versionBundleFrom(decision: RouteDecision, knowledge: KnowledgeResult): VersionBundle {
  const find = (category: string): string | null =>
    knowledge.selected.find(entry => entry.category === category)?.version ?? null;

  return buildVersionBundle({
    knowledge_registry_version: knowledge.registry_version,
    constitution_version: find("constitution"),
    dictionary_version: find("dictionary"),
    target_knowledge_version: find("target"),
    router_version: decision.router_version,
  });
}

function negativeInputFrom(input: CreativeInput, decision: RouteDecision): NegativeSelectionInput {
  const hasPerson = input.assets.some(asset => asset.contains_person);
  const hasCharacter = input.assets.some(
    asset => asset.media_type === "character_sheet" || asset.source_type === "character_sheet",
  );
  const isFacility = decision.target_primary === "facility" && !hasPerson;

  return {
    content_mode: decision.content_mode,
    target: decision.target_primary,
    has_person_reference: hasPerson,
    has_character_reference: hasCharacter,
    is_empty_facility: isFacility,
    is_still_image: false,
  };
}

function summaryFor(brief: CreativeBrief): string {
  const lines = [
    `だれに: ${brief.target}`,
    `なぜ: ${brief.objective}`,
    `どんな気持ちにするか: ${brief.emotional_goal_one}（ひとつだけ）`,
    `主人公: お客さま。FLATUPの役: ${brief.story_role_of_flatup}`,
    `流れ: ${brief.emotional_arc.join(" → ")}`,
    `見せ場（1つ）: ${brief.hero_moment.moment}`,
    `この1本の動作: ${brief.shot_plan.primary_action}`,
  ];
  if (brief.two_layer !== null) {
    lines.push(`子どもに見える層: ${brief.two_layer.child_surface}`);
    lines.push(`親が受け取る層: ${brief.two_layer.parent_deep_layer}`);
  }
  lines.push(brief.cta_draft === null ? "誘導: 入れない" : "誘導: 余韻の後に静かに1行（承認待ち）");
  return lines.join("\n");
}

function blockedPackage(reason: string, warnings: readonly string[], bundle: VersionBundle): CreativePackage {
  return deepFreeze({
    blocked: true,
    block_reason: reason,
    summary_ja: `作成を止めました。理由: ${reason}\n人間の確認が要ります。プロンプトは作っていません。`,
    prompt_ir: null,
    negative_categories: [],
    final_prompt: null,
    provider_compatibility_notes: [],
    editing_note: null,
    assumptions: [],
    knowledge_references: [],
    version_bundle: bundle,
    approval: {
      paid_generation_approval_required: true,
      cta_approval_required: false,
      knowledge_conflict_approval_required: false,
      notes: ["blocked before any prompt was created"],
    },
    warnings,
  });
}

/**
 * dry-run の本体。
 * 知識が使えない、または人間の確認が要る場合は、プロンプトを作らずに止める。
 */
export function renderCreativePackage(
  input: CreativeInput,
  decision: RouteDecision,
  knowledge: KnowledgeResult,
): CreativePackage {
  const bundle = versionBundleFrom(decision, knowledge);
  const briefResult = buildBrief(decision, knowledge, bundle);

  if (briefResult.blocked || briefResult.brief === null) {
    return blockedPackage(briefResult.block_reason ?? "unknown", briefResult.warnings, bundle);
  }

  const brief = briefResult.brief;
  const style = guardStyleNames(input.raw_text, brief.emotional_goal_one);
  const negatives = negativeInputFrom(input, decision);

  const ir = composePromptIR({
    brief,
    decision,
    negatives,
    style_replacement_attributes: style.visual_attributes,
  });

  const warnings = [...briefResult.warnings];
  if (style.flagged) {
    // 固有名そのものは残さない。件数だけを伝える。
    warnings.push(`style_name_removed:${style.removed_reference_count}`);
  }

  return deepFreeze({
    blocked: false,
    block_reason: null,
    summary_ja: summaryFor(brief),
    prompt_ir: ir,
    negative_categories: ir.negative_categories,
    final_prompt: renderFinalPrompt(ir),
    provider_compatibility_notes: ir.provider_constraints,
    editing_note: ir.cta_editing_note,
    assumptions: brief.assumptions,
    knowledge_references: brief.knowledge_references,
    version_bundle: bundle,
    approval: {
      paid_generation_approval_required: true,
      cta_approval_required: brief.cta_approval_required,
      knowledge_conflict_approval_required: knowledge.owner_approval_required,
      notes: [
        "この一式は下書きです。生成も送信もしていません。",
        "課金を伴う生成は人間の承認後にのみ行えます。",
      ],
    },
    warnings,
  });
}
