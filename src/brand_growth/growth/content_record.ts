// Brand Growth Phase 4: 作った1本の一生（lifecycle）と、出したことの記録。
//
// 参照: IMPLEMENTATION_BOOK §6「生成前検査と Content lifecycle を保存する」、
//       SCHEMA_CATALOG §12（ContentRecord）、§13（PublicationRecord）。
//
// ここが守る一番大事な線引き:
//
//   「下書きを保存した」は「出した」ではない。
//
//   これを混ぜると、まだ世に出ていないものの反応を待ち続けることになる。
//   だから posted にするには、出した先の証跡（投稿URLや投稿ID）と日時を必ず求める。
//
// 外部へは何も送らない。投稿もしない。既存の publish キューにも触らない。
// ここにあるのは「何が起きたかを書き留める紙」だけ。
// 時計は読まない。日時は呼び出し側が渡す。

import type {
  AttemptCostRecord,
  ContentLifecycleStatus,
  ContentRecord,
  PublicationRecord,
  PublicationStatus,
} from "../contracts/growth.js";
import { CONTENT_SCHEMA_VERSION, PUBLICATION_SCHEMA_VERSION } from "../contracts/growth.js";
import type { VersionBundle } from "../contracts/version_bundle.js";
import {
  assertCleanText,
  assertCleanTexts,
  assertNonEmpty,
  assertNonNegativeSeconds,
  assertSafeId,
  assertUtcIso8601,
  deepFreeze,
  RecordRuleError,
} from "../contracts/record_rules.js";
import type { CostSummary } from "../contracts/growth.js";
import { summarizeCost } from "./cost.js";

/** 一生の進み方。飛ばしてよいが、戻ってはいけない。 */
const LIFECYCLE_ORDER: readonly ContentLifecycleStatus[] = Object.freeze([
  "drafted",
  "generated",
  "assessed",
  "approved",
  "published",
  "measured",
] as const);

/** 途中で止まる終わり方。ここからは先へ進まない。 */
const TERMINAL_STATUSES: readonly ContentLifecycleStatus[] = Object.freeze([
  "rejected",
  "archived",
] as const);

/**
 * 状態と中身の食い違いを拾う。
 *
 * 台帳を作るときも、状態を進めるときも、同じ関数で数え直す。
 * 片方だけで計算すると、状態を進めた記録の警告が空になり、
 * 「published なのに配信面が無い」といった矛盾が見えなくなる。
 */
function statusWarnings(params: {
  readonly status: ContentLifecycleStatus;
  readonly platforms: readonly string[];
  readonly cost: CostSummary;
  readonly attempt_count: number;
  readonly experiment_id: string | null;
  readonly hook: string | null;
}): readonly string[] {
  const warnings: string[] = [];

  // 費用側の赤信号は、台帳にも見えるようにしておく。
  for (const warning of params.cost.health_warnings) warnings.push(`cost:${warning}`);

  if ((params.status === "published" || params.status === "measured") && params.platforms.length === 0) {
    warnings.push("published_without_platform");
  }
  if (params.status === "measured" && params.cost.usable_count === 0) {
    warnings.push("measured_without_usable_output");
  }
  if (params.status === "generated" && params.attempt_count === 0) {
    warnings.push("generated_without_attempts");
  }
  // hook が null でも「記録されていない」ことに変わりはない。
  if (params.experiment_id !== null && params.hook === null) {
    warnings.push("experiment_without_recorded_hook");
  }
  return warnings;
}

export interface BuildContentRecordParams {
  readonly content_id: string;
  readonly request_id: string;
  readonly brief_id?: string | null;
  readonly target: string;
  readonly objective: string;
  readonly lifecycle_status: ContentLifecycleStatus;
  /** UTC ISO 8601。 */
  readonly created_at: string;
  readonly attempts?: readonly AttemptCostRecord[];
  readonly master_asset_ids?: readonly string[];
  readonly variant_asset_ids?: readonly string[];
  readonly source_asset_ids?: readonly string[];
  readonly platforms?: readonly string[];
  readonly emotional_hypothesis?: string | null;
  readonly hook?: string | null;
  readonly story_type?: string | null;
  readonly hero_moment?: string | null;
  readonly experiment_id?: string | null;
  readonly version_bundle?: VersionBundle | null;
  readonly fallback_currency?: string | null;
}

/**
 * 1本ぶんの台帳を作る。費用はこの中で集計される。
 *
 * 状態と中身が食い違っていたら、黙って直さずに警告として残す。
 * 例: published なのに配信面が1つも書かれていない。
 */
export function buildContentRecord(params: BuildContentRecordParams): ContentRecord {
  assertSafeId("content_id", params.content_id);
  assertSafeId("request_id", params.request_id);
  assertNonEmpty("target", params.target);
  assertNonEmpty("objective", params.objective);
  assertUtcIso8601("created_at", params.created_at);

  if (params.brief_id !== undefined && params.brief_id !== null) {
    assertSafeId("brief_id", params.brief_id);
  }
  if (params.experiment_id !== undefined && params.experiment_id !== null) {
    assertSafeId("experiment_id", params.experiment_id);
  }

  const masterAssets = params.master_asset_ids ?? [];
  const variantAssets = params.variant_asset_ids ?? [];
  const sourceAssets = params.source_asset_ids ?? [];
  const platforms = params.platforms ?? [];

  // 並びの中身も、単体の ID と同じ厳しさで見る。
  // ここを緩めると、配列側から個人情報が記録へ入り込む。
  assertCleanTexts("master_asset_ids", masterAssets);
  assertCleanTexts("variant_asset_ids", variantAssets);
  assertCleanTexts("source_asset_ids", sourceAssets);
  assertCleanTexts("platforms", platforms);

  for (const [field, value] of [
    ["emotional_hypothesis", params.emotional_hypothesis],
    ["hook", params.hook],
    ["story_type", params.story_type],
    ["hero_moment", params.hero_moment],
  ] as const) {
    if (value !== undefined && value !== null) assertCleanText(field, value);
  }

  const attempts = params.attempts ?? [];
  const cost = summarizeCost({ attempts, fallback_currency: params.fallback_currency ?? null });
  const status = params.lifecycle_status;

  const warnings = statusWarnings({
    status,
    platforms,
    cost,
    attempt_count: attempts.length,
    experiment_id: params.experiment_id ?? null,
    hook: params.hook ?? null,
  });

  return deepFreeze({
    schema_version: CONTENT_SCHEMA_VERSION,
    content_id: params.content_id,
    request_id: params.request_id,
    brief_id: params.brief_id ?? null,
    master_asset_ids: masterAssets,
    variant_asset_ids: variantAssets,
    target: params.target,
    objective: params.objective,
    emotional_hypothesis: params.emotional_hypothesis ?? null,
    hook: params.hook ?? null,
    story_type: params.story_type ?? null,
    hero_moment: params.hero_moment ?? null,
    source_asset_ids: sourceAssets,
    platforms,
    lifecycle_status: status,
    experiment_id: params.experiment_id ?? null,
    version_bundle: params.version_bundle ?? null,
    cost_summary: cost,
    created_at: params.created_at,
    warnings,
  }) as ContentRecord;
}

/**
 * 状態を1つ進める。戻る向きの変更は受け付けない。
 *
 * 訂正したいときは、この関数ではなく新しい記録を作って supersedes_id でつなぐ。
 */
export function advanceLifecycle(
  record: ContentRecord,
  next: ContentLifecycleStatus,
): ContentRecord {
  const current = record.lifecycle_status;
  if (current === next) return record;

  // 止まった状態からは動かさない。
  if (TERMINAL_STATUSES.includes(current)) {
    throw new RecordRuleError(
      "lifecycle_is_terminal",
      `content is already ${current} and cannot move to ${next}`,
    );
  }

  if (!TERMINAL_STATUSES.includes(next)) {
    const from = LIFECYCLE_ORDER.indexOf(current);
    const to = LIFECYCLE_ORDER.indexOf(next);
    if (from === -1 || to === -1) {
      throw new RecordRuleError("unknown_lifecycle_status", `unknown lifecycle transition ${current} → ${next}`);
    }
    if (to < from) {
      throw new RecordRuleError(
        "lifecycle_cannot_go_backwards",
        `lifecycle cannot move backwards: ${current} → ${next}`,
      );
    }
  }

  // 状態が変われば、食い違いの有無も変わる。必ず数え直す。
  // 数え直さないと、drafted から measured へ飛ばした記録の警告が空になり、
  // 「配信面が無いまま measured」「使えた本数0のまま measured」を見逃す。
  return deepFreeze({
    ...record,
    lifecycle_status: next,
    warnings: statusWarnings({
      status: next,
      platforms: record.platforms,
      cost: record.cost_summary,
      // 試行の件数は台帳が集計済みの値から読む。
      attempt_count: record.cost_summary.generation_count,
      experiment_id: record.experiment_id,
      hook: record.hook,
    }),
  }) as ContentRecord;
}

export interface RecordPublicationParams {
  readonly publication_id: string;
  readonly content_id: string;
  readonly platform: string;
  readonly status: PublicationStatus;
  /** posted のときは必須。出した先の投稿URLや投稿ID。 */
  readonly platform_content_reference?: string | null;
  /** posted のときは必須。UTC ISO 8601。 */
  readonly posted_at?: string | null;
  readonly scheduled_at?: string | null;
  readonly approved_at?: string | null;
  readonly approval_id?: string | null;
  readonly variant_asset_id?: string | null;
  readonly hook_variant?: string | null;
  readonly cta_variant?: string | null;
  readonly aspect_ratio?: string | null;
  readonly duration_seconds?: number | null;
  readonly attribution_tags?: readonly string[];
}

/**
 * 「出した」ことを記録する。
 *
 * posted にするには証跡と日時が要る（SCHEMA_CATALOG §13）。
 * 下書きを保存しただけのものを posted にはできない。
 */
export function recordPublication(params: RecordPublicationParams): PublicationRecord {
  assertSafeId("publication_id", params.publication_id);
  assertSafeId("content_id", params.content_id);
  assertNonEmpty("platform", params.platform);
  assertCleanText("platform", params.platform);

  if (params.approval_id !== undefined && params.approval_id !== null) {
    assertSafeId("approval_id", params.approval_id);
  }
  if (params.variant_asset_id !== undefined && params.variant_asset_id !== null) {
    assertSafeId("variant_asset_id", params.variant_asset_id);
  }
  assertCleanTexts("attribution_tags", params.attribution_tags ?? []);
  for (const [field, value] of [
    ["platform_content_reference", params.platform_content_reference],
    ["hook_variant", params.hook_variant],
    ["cta_variant", params.cta_variant],
    ["aspect_ratio", params.aspect_ratio],
  ] as const) {
    if (value !== undefined && value !== null) assertCleanText(field, value);
  }
  if (params.duration_seconds !== undefined && params.duration_seconds !== null) {
    assertNonNegativeSeconds("duration_seconds", params.duration_seconds);
  }

  const reference = params.platform_content_reference ?? null;
  const postedAt = params.posted_at ?? null;
  const scheduledAt = params.scheduled_at ?? null;
  const warnings: string[] = [];

  if (params.status === "posted") {
    // 「出したはず」では posted にしない。外から確かめられる証跡を求める。
    if (reference === null || reference.trim() === "") {
      throw new RecordRuleError(
        "posted_without_evidence",
        "posted requires platform_content_reference as external evidence",
      );
    }
    if (postedAt === null) {
      throw new RecordRuleError("posted_without_time", "posted requires posted_at");
    }
    assertUtcIso8601("posted_at", postedAt);
  } else if (params.status === "removed") {
    // 取り下げても「出した事実」は消さない。posted_at を持っていてよい。
    // ただし日時があるなら証跡もそろっているべき（出したのなら証跡があったはず）。
    if (postedAt !== null) {
      assertUtcIso8601("posted_at", postedAt);
      if (reference === null || reference.trim() === "") {
        throw new RecordRuleError(
          "removed_without_evidence",
          "removed with posted_at requires platform_content_reference",
        );
      }
    } else {
      // 出す前に取り下げた場合。出した記録が無いことを印として残す。
      warnings.push("removed_without_posted_record");
    }
  } else {
    // 出していないのに出した日時が入っているのは、取り違えのしるし。
    if (postedAt !== null) {
      throw new RecordRuleError(
        "unposted_has_posted_at",
        `posted_at must be null while status is ${params.status}`,
      );
    }
    if (params.status === "draft_saved" && reference !== null && reference.trim() !== "") {
      // 下書き保存に投稿先の証跡が付くのは筋が通らない。止めはしないが印を残す。
      warnings.push("draft_saved_has_platform_reference");
    }
  }

  if (scheduledAt !== null) assertUtcIso8601("scheduled_at", scheduledAt);
  if (params.approved_at !== undefined && params.approved_at !== null) {
    assertUtcIso8601("approved_at", params.approved_at);
  }
  if (params.status === "scheduled" && scheduledAt === null) {
    warnings.push("scheduled_without_time");
  }

  return deepFreeze({
    schema_version: PUBLICATION_SCHEMA_VERSION,
    publication_id: params.publication_id,
    content_id: params.content_id,
    platform: params.platform,
    platform_content_reference: reference,
    variant_asset_id: params.variant_asset_id ?? null,
    hook_variant: params.hook_variant ?? null,
    cta_variant: params.cta_variant ?? null,
    aspect_ratio: params.aspect_ratio ?? null,
    duration_seconds: params.duration_seconds ?? null,
    approved_at: params.approved_at ?? null,
    approval_id: params.approval_id ?? null,
    scheduled_at: scheduledAt,
    posted_at: postedAt,
    attribution_tags: params.attribution_tags ?? [],
    status: params.status,
    warnings,
  }) as PublicationRecord;
}

/** 実測値を待ってよい状態か。出していないものの数字は待たない。 */
export function isAwaitingMetrics(publication: PublicationRecord): boolean {
  return publication.status === "posted";
}

/** 人が読む一行説明。 */
export function explainContentRecord(record: ContentRecord): string {
  const cost = record.cost_summary;
  const perUsable =
    cost.effective_cost_per_usable === null
      ? `出せません（${cost.effective_cost_reason}）`
      : `${cost.effective_cost_per_usable.amount_minor} ${cost.effective_cost_per_usable.currency}`;
  const lines = [
    `${record.content_id}: ${record.target} / ${record.objective}`,
    `今どこ: ${record.lifecycle_status}`,
    `試行 ${cost.generation_count}件 / 使えた ${cost.usable_count}件`,
    `使える1本あたり: ${perUsable}`,
  ];
  if (record.warnings.length > 0) lines.push(`注意: ${record.warnings.join(" / ")}`);
  return lines.join("\n");
}
