// Brand Growth Phase 1 Router: 一行入力から RouteDecision を1つ作る。
//
// 参照: CLAUDE_CODE_IMPLEMENTATION_SPEC §5 の擬似コード。
// この関数は純関数である。
//   - ファイル、ネットワーク、環境変数、乱数、実行時刻を使わない。
//   - 同じ入力からは必ず同じ結果が出る（TARGET_ROUTER_SPEC §15）。
//   - 外部へ何も送らない。課金しない。顧客へ返信しない。

import type { CreativeInput } from "../contracts/creative_input.js";
import {
  ROUTER_VERSION,
  type Assumption,
  type ConfidenceField,
  type RouteDecision,
} from "../contracts/route_decision.js";
import { PHASE1_VERSION_BUNDLE } from "../contracts/version_bundle.js";
import { classifyIntent } from "./classify_intent.js";
import { classifyObjective } from "./classify_objective.js";
import { classifyTarget } from "./classify_target.js";
import { normalizeInput } from "./normalize_input.js";
import {
  collectClarifications,
  selectContentMode,
  selectCtaPolicy,
  selectEmotionalGoal,
  selectKnowledgeTags,
  selectPlatforms,
  selectQualityProfile,
  selectRequestedDuration,
} from "./select_profile.js";

/** 中身まで凍結して、後から書き換えられないようにする。 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/** request_id から決まる route_id。乱数も時刻も使わない。 */
function routeIdFor(requestId: string): string {
  return `rte_${requestId.replace(/^req_/, "")}`;
}

export function route(input: CreativeInput): RouteDecision {
  const normalized = normalizeInput(input);
  const assumptions: Assumption[] = [];

  const intent = classifyIntent(normalized);
  const target = classifyTarget(input, normalized);
  const objective = classifyObjective(input, normalized, intent.value);
  const contentMode = selectContentMode(input, normalized, intent.value);
  const emotional = selectEmotionalGoal(normalized, target.primary.value, objective.value);
  // 尺は配信面より先に決める。配信面が未定でも、本人が言った尺を失わないため。
  const duration = selectRequestedDuration(input, normalized);
  const platforms = selectPlatforms(input, normalized, duration.seconds);

  const qualityProfile = selectQualityProfile(input, target.primary.value, objective.value, contentMode.value);
  const cta = selectCtaPolicy(objective.value);
  const knowledgeTags = selectKnowledgeTags({
    target: target.primary.value,
    secondary: target.secondary,
    objective: objective.value,
    contentMode: contentMode.value,
    emotionalGoal: emotional.goal.value,
    platforms: platforms.platforms,
  });

  // --- 推定で埋めたところを、質問の代わりに全部見えるようにする ---

  if (target.primary.source !== "explicit_hint" && target.primary.source !== "explicit_text") {
    assumptions.push({
      field: "target_primary",
      value: target.primary.value,
      reason:
        target.primary.source === "asset_metadata"
          ? "本文に指定が無いため素材の種類から推定した"
          : "本文にも素材にも手掛かりが無いため初心者向けとして進めた",
    });
  }
  if (objective.source === "default") {
    assumptions.push({
      field: "objective",
      value: objective.value,
      reason: "変換の合図が無いため、売り込みではなく信頼づくりを既定にした",
    });
  }
  if (contentMode.source !== "explicit_hint" && contentMode.source !== "explicit_text") {
    assumptions.push({
      field: "content_mode",
      value: contentMode.value,
      reason: "作り方の指定が無いため素材の種類から決めた",
    });
  }
  if (emotional.converted_from_forbidden) {
    assumptions.push({
      field: "emotional_goal",
      value: emotional.goal.value,
      reason: "恐怖や罪悪感で動かす依頼だったため、安全側の感情へ置き換えた",
    });
  } else if (emotional.goal.source === "default") {
    assumptions.push({
      field: "emotional_goal",
      value: emotional.goal.value,
      reason: "感情の指定が無いため、この対象の既定の感情を使った",
    });
  }
  if (duration.rejected_value !== null) {
    assumptions.push({
      field: "requested_duration_seconds",
      value: "null",
      reason: `尺の指定「${duration.rejected_value}」は扱える範囲外のため使わず、未指定として扱った`,
    });
  }
  if (platforms.platforms === null) {
    assumptions.push({
      field: "platforms",
      value: "null",
      reason: "配信面の指定が無い。質問はせず未定のままにし、比率は後段で決める",
    });
  } else {
    for (const plan of platforms.platforms) {
      assumptions.push({
        field: `platforms.${plan.platform}`,
        value: `${plan.aspect_ratio} / ${plan.duration_seconds}秒`,
        reason:
          duration.seconds === null
            ? "配信面の既定値を使った。比率と尺は質問しない"
            : "比率は配信面の既定値。尺は本人が明示した値をそのまま使った",
      });
    }
  }
  if (cta.approval_required) {
    assumptions.push({
      field: "cta_policy",
      value: cta.policy,
      reason: "誘導文は人間の承認が出るまで本文に載せない",
    });
  }

  const clarificationReasons = collectClarifications({
    input,
    normalized,
    objective: objective.value,
    contentMode: contentMode.value,
  });

  const confidenceByField: Record<ConfidenceField, number> = {
    intent: intent.confidence,
    target_primary: target.primary.confidence,
    objective: objective.confidence,
    content_mode: contentMode.confidence,
    emotional_goal: emotional.goal.confidence,
    platforms: platforms.confidence,
  };

  const decision: RouteDecision = {
    route_id: routeIdFor(input.request_id),
    request_id: input.request_id,
    intent: intent.value,
    target_primary: target.primary.value,
    target_secondary: target.secondary,
    objective: objective.value,
    content_mode: contentMode.value,
    platforms: platforms.platforms,
    requested_duration_seconds: duration.seconds,
    emotional_goal: emotional.goal.value,
    required_knowledge_tags: knowledgeTags,
    quality_profile: qualityProfile,
    cta_policy: cta.policy,
    cta_approval_required: cta.approval_required,
    confidence_by_field: confidenceByField,
    assumptions,
    clarification_required: clarificationReasons.length > 0,
    clarification_reasons: clarificationReasons,
    router_version: ROUTER_VERSION,
    version_bundle: PHASE1_VERSION_BUNDLE,
    decided_at: input.requested_at,
  };

  return deepFreeze(decision);
}

/**
 * JIN が一行で読めるようにする要約。
 * 事実（料金・住所・時間）は一切出さない。判断とその理由だけを出す。
 */
export function explainDecision(decision: RouteDecision): string {
  const platform =
    decision.platforms === null
      ? "配信面: 未定"
      : `配信面: ${decision.platforms.map(p => `${p.platform}(${p.aspect_ratio}/${p.duration_seconds}秒)`).join(", ")}`;
  const head = `対象: ${decision.target_primary} / 目的: ${decision.objective} / 感情: ${decision.emotional_goal} / 作り方: ${decision.content_mode}`;
  const duration =
    decision.requested_duration_seconds === null
      ? "尺: 指定なし"
      : `尺: ${decision.requested_duration_seconds}秒（本人の指定）`;
  const cta = `CTA: ${decision.cta_policy}${decision.cta_approval_required ? "（承認待ち）" : ""}`;
  const ask = decision.clarification_required
    ? `確認が必要: ${decision.clarification_reasons.join(", ")}`
    : "確認事項なし";
  return [head, platform, duration, cta, ask].join("\n");
}
