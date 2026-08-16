// Brand Growth Phase 3 Director: RouteDecision と Knowledge から Brief を組み立てる。
//
// 順番は固定:
//   人の状況 → 感情ひとつ → 物語 → 見せ場ひとつ → 画 → （この先で Prompt IR）
//
// 知識が使えないなら Brief を作らない。作らないことが正しい失敗の仕方。
// 時刻・乱数・ファイル・ネットワーク・環境変数は使わない。

import type {
  BriefResult,
  CreativeBrief,
  ReusePlan,
  ShotPlan,
  StoryBeat,
} from "../contracts/creative_brief.js";
import type { KnowledgeResult } from "../contracts/knowledge.js";
import type { RouteDecision, TargetPrimary } from "../contracts/route_decision.js";
import type { VersionBundle } from "../contracts/version_bundle.js";
import { arcFor } from "./emotional_arc.js";
import { heroMomentFor, primaryActionFor } from "./hero_moment.js";
import { childSurfaceIsClean, requiresTwoLayer, twoLayerFor } from "./two_layer.js";

export const DIRECTOR_VERSION = "3.0.0";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/** 感情の流れを物語の拍へ落とす。拍の数は流れと同じにして増やさない。 */
function beatsFrom(arc: readonly string[]): readonly StoryBeat[] {
  return arc.map((beat, index) => ({ order: index + 1, beat }));
}

/** 見せ場を中心に、補助カットを最小限だけ置く。主要な動作は1つのまま。 */
function shotPlanFor(target: TargetPrimary, heroMoment: string): ShotPlan {
  return {
    primary_action: primaryActionFor(target),
    shots: [
      { order: 1, description: "状況が分かる引きの画。人物の表情は見えるが動作はまだ" },
      { order: 2, description: heroMoment },
      { order: 3, description: "余韻。動作の後に一拍おく" },
    ],
  };
}

function reusePlanFor(decision: RouteDecision): ReusePlan {
  const master =
    decision.requested_duration_seconds ??
    (decision.platforms !== null ? (decision.platforms[0]?.duration_seconds ?? null) : null);
  return {
    master_seconds: master,
    variants: ["縦型ショート", "正方形", "静止画サムネイル"],
  };
}

/**
 * CTA の下書き。
 * pure brand は出さない。誘導する場合も、煽らず事実だけを短く置く。
 * 実際に本文へ載せてよいかは人間が決める。
 */
function ctaDraftFor(decision: RouteDecision): string | null {
  if (decision.cta_policy === "pure_brand" || decision.cta_policy === "none") return null;
  switch (decision.objective) {
    case "trial":
      return "気になった方は、体験の空き状況をご確認ください。";
    case "enrollment":
      return "続けたい方向けの案内をご用意しています。";
    case "line_add":
      return "質問だけでも受け付けています。";
    case "profile_visit":
      return "ほかの様子はプロフィールからご覧いただけます。";
    case "event":
      return "開催の詳細は確定した情報のみお伝えします。";
    default:
      return null;
  }
}

function hypothesisFor(decision: RouteDecision): string {
  return `${decision.target_primary} に ${decision.emotional_goal} を狙った見せ場を1つ置くと、最後まで見られる割合が上がる`;
}

/**
 * Brief を作る。
 * knowledge が blocked のときは何も作らない。
 */
export function buildBrief(
  decision: RouteDecision,
  knowledge: KnowledgeResult,
  versionBundle: VersionBundle,
): BriefResult {
  const warnings: string[] = [];

  if (knowledge.blocked) {
    return deepFreeze({
      blocked: true,
      block_reason: `knowledge_blocked:${knowledge.block_reason ?? "unknown"}`,
      brief: null,
      warnings: ["knowledge_unavailable_no_brief_created"],
    });
  }

  if (decision.clarification_required) {
    return deepFreeze({
      blocked: true,
      block_reason: `clarification_required:${decision.clarification_reasons.join(",")}`,
      brief: null,
      warnings: ["human_confirmation_required_before_brief"],
    });
  }

  const target = decision.target_primary;
  const baseline = arcFor(target);
  const heroMoment = heroMomentFor(target);
  const twoLayer = twoLayerFor(target);

  // 子ども系で二層が無いのは設計違反。黙って進めない。
  if (requiresTwoLayer(target) && twoLayer === null) {
    return deepFreeze({
      blocked: true,
      block_reason: "two_layer_missing_for_kids",
      brief: null,
      warnings: ["kids content requires both child surface and parent layer"],
    });
  }
  if (twoLayer !== null && !childSurfaceIsClean(twoLayer)) {
    return deepFreeze({
      blocked: true,
      block_reason: "parent_message_leaked_into_child_layer",
      brief: null,
      warnings: ["parent wording must not appear in the child layer"],
    });
  }

  if (!heroMoment.readable_without_explanation) {
    return deepFreeze({
      blocked: true,
      block_reason: "hero_moment_not_readable",
      brief: null,
      warnings: ["hero moment must work without explanation"],
    });
  }

  for (const warning of knowledge.warnings) warnings.push(`knowledge:${warning}`);
  if (knowledge.owner_approval_required) warnings.push("knowledge_conflict_needs_owner_decision");

  const brief: CreativeBrief = {
    brief_id: `brf_${decision.request_id.replace(/^req_/, "")}`,
    request_id: decision.request_id,
    route_id: decision.route_id,
    target,
    objective: decision.objective,
    person_context: baseline.person_context,
    // 感情の目標は Router が決めたひとつだけを引き継ぐ。ここで増やさない。
    emotional_goal_one: decision.emotional_goal,
    emotional_arc: baseline.arc,
    story_role_of_flatup: baseline.story_role_of_flatup,
    story_beats: beatsFrom(baseline.arc),
    hero_moment: heroMoment,
    visual_mode: decision.content_mode,
    shot_plan: shotPlanFor(target, heroMoment.moment),
    audio_intent: baseline.audio_intent,
    cta_policy: decision.cta_policy,
    cta_draft: ctaDraftFor(decision),
    cta_approval_required: decision.cta_approval_required,
    reuse_plan: reusePlanFor(decision),
    experiment_hypothesis: hypothesisFor(decision),
    assumptions: decision.assumptions,
    knowledge_references: knowledge.selected.map(entry => entry.id),
    two_layer: twoLayer,
    version_bundle: versionBundle,
  };

  return deepFreeze({
    blocked: false,
    block_reason: null,
    brief,
    warnings,
  });
}
