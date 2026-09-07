// Brand Growth Phase 1 契約: Router の出力 RouteDecision。
//
// 参照: Design Pack SCHEMA_CATALOG §3 / TARGET_ROUTER_SPEC。
// 方針:
//   - 型と定数だけを置く。I/O、ネットワーク、環境変数、時刻取得を一切持たない。
//   - unknown と 0 を区別する（値が未定なら null、空配列で誤魔化さない）。
//   - 料金・住所・時間などの事実値はここに書かない（正本は src/shared/canon.ts）。

import type { VersionBundle } from "./version_bundle.js";

/** 依頼の種類。TARGET_ROUTER_SPEC §3。 */
export type Intent = "create" | "animate" | "repurpose" | "announce" | "analyze" | "experiment";

/** 誰に向けるか。SCHEMA_CATALOG §3 の target enum。 */
export type TargetPrimary =
  | "kids"
  | "kids_parents"
  | "women_beginners"
  | "women_30_40"
  | "men_beginners"
  | "inactive_men"
  | "senior"
  | "parents"
  | "family"
  | "sparring_fans"
  | "competition"
  | "event"
  | "facility"
  | "instructor"
  | "member_story"
  | "general_beginner";

/** 何を起こしたいか。再生数は objective にしない（TARGET_ROUTER_SPEC §5）。 */
export type Objective =
  | "awareness"
  | "trust"
  | "profile_visit"
  | "line_add"
  | "trial"
  | "enrollment"
  | "event"
  | "retention";

/** どう作るか。TARGET_ROUTER_SPEC §6。 */
export type ContentMode = "live_action" | "image_to_video" | "animation" | "text_to_video" | "edit_only";

/** 一本の動画で狙う感情はひとつだけ。TARGET_ROUTER_SPEC §7。 */
export type EmotionalGoal =
  | "safety"
  | "fun"
  | "trust"
  | "permission"
  | "confidence"
  | "aspiration"
  | "belonging"
  | "empathy";

/** 配信面。TARGET_ROUTER_SPEC §8。 */
export type PlatformId =
  | "instagram_reel"
  | "tiktok"
  | "youtube_shorts"
  | "website_hero"
  | "line"
  | "advertising";

/** 必要な blocker と Negative の範囲を決める。TARGET_ROUTER_SPEC §10。 */
export type QualityProfile =
  | "standard_creative"
  | "people_i2v"
  | "minor_i2v"
  | "original_character"
  | "combat"
  | "facility"
  | "event_facts";

/**
 * CTA の方針。TARGET_ROUTER_SPEC §11。
 * 顧客返信の CTA 判定はこの Router の責務ではない（既存 src/safety が引き続き担当）。
 */
export type CtaPolicy = "pure_brand" | "soft_conversion" | "explicit_trial" | "none";

/**
 * 人間に質問してよい理由。TARGET_ROUTER_SPEC §13 の Required 5件だけを列挙する。
 * カメラ・照明・音楽・レンズ・Negative・アスペクト比・既定尺は「質問しない」ため、
 * enum に存在させない＝構造的に質問できないようにする（AT-046）。
 */
export type ClarificationReason =
  | "minor_consent"
  | "event_facts"
  | "ambiguous_person"
  | "medical_or_legal_claim"
  | "paid_batch_budget";

export const ALLOWED_CLARIFICATION_REASONS: readonly ClarificationReason[] = Object.freeze([
  "minor_consent",
  "event_facts",
  "ambiguous_person",
  "medical_or_legal_claim",
  "paid_batch_budget",
] as const);

/** confidence を付ける対象フィールド。 */
export type ConfidenceField = "intent" | "target_primary" | "objective" | "content_mode" | "emotional_goal" | "platforms";

/** その判断が何に由来するか。TARGET_ROUTER_SPEC §2 の入力優先度。 */
export type SignalSource = "explicit_hint" | "explicit_text" | "asset_metadata" | "default";

/** 分類結果ひとつぶん。 */
export interface Classified<T> {
  readonly value: T;
  /** 0〜1。confidenceBand() で説明語へ変換する。 */
  readonly confidence: number;
  readonly source: SignalSource;
}

/** 配信面ごとの既定値。TARGET_ROUTER_SPEC §8。 */
export interface PlatformPlan {
  readonly platform: PlatformId;
  readonly aspect_ratio: string;
  readonly duration_seconds: number;
}

/** 推定で埋めた箇所を人間に見せるための記録（質問の代わりに使う）。 */
export interface Assumption {
  readonly field: string;
  readonly value: string;
  readonly reason: string;
}

/** Router の出力。生成後は凍結され変更できない。 */
export interface RouteDecision {
  readonly route_id: string;
  readonly request_id: string;
  readonly intent: Intent;
  readonly target_primary: TargetPrimary;
  readonly target_secondary: TargetPrimary | null;
  readonly objective: Objective;
  readonly content_mode: ContentMode;
  /** 配信面が未指定なら null（空配列にしない＝unknown と none を区別する）。 */
  readonly platforms: readonly PlatformPlan[] | null;
  /**
   * ユーザーが明示した尺（秒）。未指定なら null。
   *
   * 配信面が未定でも、本人が言った「15秒に」を失わないための場所。
   * ここに既定値は入れない（既定尺は PlatformPlan 側が持つ）。
   * 対応範囲外・不正値は null にし、assumptions へ理由を残す。
   * Codex 承認の Phase 1 内 加算的契約修正（2026-08-15）。
   */
  readonly requested_duration_seconds: number | null;
  readonly emotional_goal: EmotionalGoal;
  readonly required_knowledge_tags: readonly string[];
  readonly quality_profile: QualityProfile;
  readonly cta_policy: CtaPolicy;
  /** CTA を実際に本文へ載せるには人間承認が要るか。 */
  readonly cta_approval_required: boolean;
  readonly confidence_by_field: Readonly<Record<ConfidenceField, number>>;
  readonly assumptions: readonly Assumption[];
  readonly clarification_required: boolean;
  readonly clarification_reasons: readonly ClarificationReason[];
  readonly router_version: string;
  readonly version_bundle: VersionBundle;
  /** 入力の requested_at をそのまま引き継ぐ。実行時刻は使わない（決定性のため）。 */
  readonly decided_at: string;
}

/**
 * 1.0.0: Phase 1 初版。
 * 1.1.0: requested_duration_seconds を追加（加算のみ。既存フィールドの意味は変えていない）。
 * 1.2.0: 単純なキーワード一致を、宣言的な言い回し辞書＋決定論的スコアリングへ置き換えた。
 *        打ち消し表現（「子ども向けではなく初心者女性向け」）と言い換えに強くなった。
 *        契約は変えていない。同点は宣言順で決めるため、結果は従来どおり再現する。
 */
export const ROUTER_VERSION = "1.2.0";

export type ConfidenceBand = "explicit" | "strong_inference" | "default_assumption" | "clarification_candidate";

/**
 * confidence の説明語。TARGET_ROUTER_SPEC §12。
 * confidence が低いだけでは質問しない。質問の可否は clarification_reasons が決める。
 */
export function confidenceBand(value: number): ConfidenceBand {
  if (value >= 0.9) return "explicit";
  if (value >= 0.7) return "strong_inference";
  if (value >= 0.5) return "default_assumption";
  return "clarification_candidate";
}
