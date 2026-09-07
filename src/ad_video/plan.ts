// 広告動画: 「何を・何本・いくらで作るか」を先に紙にする。
//
// 参照: 指示書 §8「生成方式」/ §9「量産ルール」/ §12「ファイル命名」/ §13「コスト管理」/ §14「承認」。
//
// 決めごと:
//   - ここは純関数だけ。ネットワークも課金も起こさない。
//   - 生成の前に必ず通す。止める理由が1つでもあれば `approved_to_generate` は false。
//   - 費用は 本数 × 秒数 × 単価 で出す（§13）。単価が公式未確認なら、そもそも進めない。

import { findModel, findPrice, unverifiedReasons, type FalTaskKind, type ModelSpec } from "./catalog.js";
import { checkExpression, mentionsMinor } from "./guard.js";
import { BASE_AVOID_EN, findConcept, type AdConcept } from "./concepts.js";

/** テストは安く、勝ち動画は768P（指示書 §8）。 */
export const TEST_RESOLUTION = "480p";
export const WINNER_RESOLUTION = "768p";
export const DEFAULT_DURATION_SECONDS = 5;
export const DEFAULT_ASPECT_RATIO = "9:16";
export const DEFAULT_PROMPT_EXPANSION_MODE = "balanced";

/** これを超える見積りは、実行せずオーナー確認（§13）。 */
export const COST_APPROVAL_THRESHOLD_USD = 5;
/** これを超える本数は「大量生成」として承認が要る（§14）。 */
export const BULK_APPROVAL_THRESHOLD_CLIPS = 5;

export interface PlanRequest {
  readonly concept_ids: readonly string[];
  readonly model_key?: string;
  readonly resolution?: string;
  readonly duration_seconds?: number;
  readonly aspect_ratio?: string;
  readonly prompt_expansion_mode?: string;
  /** オーナーが承認済みだと呼び出し側が明示したか。既定は false。 */
  readonly owner_approved?: boolean;
}

/** モデルへ渡す本体。ここにAPIキーは入らない。 */
export interface GenerationRequest {
  readonly concept_id: string;
  readonly endpoint: string;
  readonly task_kind: FalTaskKind;
  readonly output_basename: string;
  readonly input: Readonly<{
    prompt: string;
    duration: number;
    resolution: string;
    aspect_ratio: string;
    prompt_expansion_mode: string;
  }>;
}

export interface CostEstimate {
  readonly clips: number;
  readonly seconds_each: number;
  readonly usd_per_output_second: number;
  readonly total_usd: number;
  readonly formula_ja: string;
  readonly price_verified_official: boolean;
}

export interface GenerationPlan {
  readonly model_key: string;
  readonly resolution: string;
  readonly requests: readonly GenerationRequest[];
  readonly cost: CostEstimate;
  /** 生成に進んでよいか。1つでも止める理由があれば false。 */
  readonly approved_to_generate: boolean;
  /** 止める理由。人がそのまま読める日本語。 */
  readonly blockers_ja: readonly string[];
  /** 止めはしないが、人に見てほしいこと。 */
  readonly warnings_ja: readonly string[];
}

/** 本数 × 秒数 × 単価（§13）。小数の丸め誤差は最後にだけ丸める。 */
export function estimateCost(params: {
  readonly clips: number;
  readonly seconds_each: number;
  readonly usd_per_output_second: number;
  readonly price_verified_official: boolean;
}): CostEstimate {
  const total = params.clips * params.seconds_each * params.usd_per_output_second;
  return Object.freeze({
    clips: params.clips,
    seconds_each: params.seconds_each,
    usd_per_output_second: params.usd_per_output_second,
    total_usd: Math.round(total * 10000) / 10000,
    formula_ja: `${params.clips}本 × ${params.seconds_each}秒 × $${params.usd_per_output_second}/秒 = $${
      Math.round(total * 10000) / 10000
    }`,
    price_verified_official: params.price_verified_official,
  });
}

/**
 * 保存名を決める（§12）。意味の分かる名前にする。
 * 例: flatup_women_beginner_002__480p_5s
 */
export function outputBasename(concept: AdConcept, resolution: string, seconds: number): string {
  return `${concept.id}__${resolution}_${seconds}s`;
}

function optionBlockers(spec: ModelSpec, plan: {
  resolution: string;
  duration: number;
  aspect_ratio: string;
  prompt_expansion_mode: string;
}): string[] {
  const out: string[] = [];
  if (!spec.resolutions.includes(plan.resolution)) {
    out.push(`解像度 ${plan.resolution} は台帳にない（使えるのは ${spec.resolutions.join(" / ")}）`);
  }
  if (!spec.durations_seconds.includes(plan.duration)) {
    out.push(`尺 ${plan.duration}秒 は台帳にない（使えるのは ${spec.durations_seconds.join(" / ")}秒）`);
  }
  if (!spec.aspect_ratios.includes(plan.aspect_ratio)) {
    out.push(`比率 ${plan.aspect_ratio} は台帳にない`);
  }
  if (!spec.prompt_expansion_modes.includes(plan.prompt_expansion_mode)) {
    out.push(`prompt_expansion_mode ${plan.prompt_expansion_mode} は台帳にない`);
  }
  return out;
}

/** 生成計画を組む。ここを通らないものは生成しない。 */
export function buildPlan(request: PlanRequest): GenerationPlan {
  const modelKey = request.model_key ?? "minimax/h3-max-turbo";
  const resolution = request.resolution ?? TEST_RESOLUTION;
  const duration = request.duration_seconds ?? DEFAULT_DURATION_SECONDS;
  const aspectRatio = request.aspect_ratio ?? DEFAULT_ASPECT_RATIO;
  const expansion = request.prompt_expansion_mode ?? DEFAULT_PROMPT_EXPANSION_MODE;

  const blockers: string[] = [];
  const warnings: string[] = [];

  const spec = findModel(modelKey);
  if (spec === null) {
    return Object.freeze({
      model_key: modelKey,
      resolution,
      requests: Object.freeze([]),
      cost: estimateCost({
        clips: 0,
        seconds_each: duration,
        usd_per_output_second: 0,
        price_verified_official: false,
      }),
      approved_to_generate: false,
      blockers_ja: Object.freeze([`モデル ${modelKey} が台帳にない`]),
      warnings_ja: Object.freeze([]),
    });
  }

  blockers.push(...optionBlockers(spec, {
    resolution,
    duration,
    aspect_ratio: aspectRatio,
    prompt_expansion_mode: expansion,
  }));
  // 公式未確認の仕様・単価では課金生成に進まない（§2）。
  blockers.push(...unverifiedReasons(spec, resolution));

  const requests: GenerationRequest[] = [];
  for (const id of request.concept_ids) {
    const concept = findConcept(id);
    if (concept === null) {
      blockers.push(`コンセプト ${id} が見つからない`);
      continue;
    }
    const guard = checkExpression(`${concept.prompt_en} ${concept.cta_ja} ${concept.title_ja}`);
    for (const hit of guard.hits) {
      blockers.push(`${id}: 表現「${hit.term}」は使わない（${hit.reason_ja} → ${hit.instead_ja}）`);
    }
    if (mentionsMinor(concept.prompt_en)) {
      blockers.push(`${id}: 未成年が写る想定。保護者同意の確認が済むまで生成しない`);
    }
    if (concept.task_kind === "image_to_video" && concept.needed_asset_ja !== null) {
      warnings.push(`${id}: 素材が要る（${concept.needed_asset_ja}）`);
    }
    requests.push(
      Object.freeze({
        concept_id: concept.id,
        endpoint: spec.endpoints[concept.task_kind],
        task_kind: concept.task_kind,
        output_basename: outputBasename(concept, resolution, duration),
        input: Object.freeze({
          // モデルに negative 引数が無いので、避けたいものは本文の後ろへ足す。
          prompt: `${concept.prompt_en} ${BASE_AVOID_EN}`,
          duration,
          resolution,
          aspect_ratio: aspectRatio,
          prompt_expansion_mode: expansion,
        }),
      }),
    );
  }

  if (requests.length === 0) blockers.push("生成する対象が1本もない");

  const price = findPrice(spec, resolution);
  const cost = estimateCost({
    clips: requests.length,
    seconds_each: duration,
    usd_per_output_second: price?.usd_per_output_second ?? 0,
    price_verified_official: price?.verified_official ?? false,
  });

  const ownerApproved = request.owner_approved === true;
  if (requests.length > BULK_APPROVAL_THRESHOLD_CLIPS && !ownerApproved) {
    blockers.push(
      `${requests.length}本は大量生成。オーナー承認が要る（上限 ${BULK_APPROVAL_THRESHOLD_CLIPS}本）`,
    );
  }
  if (cost.total_usd > COST_APPROVAL_THRESHOLD_USD && !ownerApproved) {
    blockers.push(
      `見積り $${cost.total_usd} は上限 $${COST_APPROVAL_THRESHOLD_USD} を超える。オーナー承認が要る`,
    );
  }
  if (resolution === WINNER_RESOLUTION) {
    warnings.push("768Pは勝ち動画用。検証段階なら安いほうで回す（§8）");
  }

  return Object.freeze({
    model_key: modelKey,
    resolution,
    requests: Object.freeze(requests),
    cost,
    approved_to_generate: blockers.length === 0,
    blockers_ja: Object.freeze(blockers),
    warnings_ja: Object.freeze(warnings),
  });
}
