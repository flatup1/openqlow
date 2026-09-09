// Brand Growth Phase 4 契約: QualityAssessment。
//
// 参照: SCHEMA_CATALOG §11、ACCEPTANCE_TESTS AT-025。
//
// 検査は2種類ある。混ぜない。
//   blocking: 1つでも fail なら passed=false。点数では取り返せない。
//   scored  : 良し悪しの目安。低くても blocking を上書きしない。
//
// 「まだ見ていない」は「合格」ではない。未確認は unknown のまま残し、
// 合格側には数えない（fail closed）。
//
// ここには料金・住所・時間などの事実も、顧客の個人情報も置かない。

/** これが1つでも fail なら不合格。SCHEMA_CATALOG §11。 */
export type BlockingCheckName =
  | "consent"
  | "identity"
  | "anatomy"
  | "temporal"
  | "environment"
  | "secret_or_pii"
  | "brand";

/** 点数で見る項目。合否そのものは決めない。 */
export type ScoredCheckName =
  | "motion"
  | "technical"
  | "story_readability"
  | "emotional_goal"
  | "hero_moment";

export const BLOCKING_CHECK_NAMES: readonly BlockingCheckName[] = Object.freeze([
  "consent",
  "identity",
  "anatomy",
  "temporal",
  "environment",
  "secret_or_pii",
  "brand",
] as const);

export const SCORED_CHECK_NAMES: readonly ScoredCheckName[] = Object.freeze([
  "motion",
  "technical",
  "story_readability",
  "emotional_goal",
  "hero_moment",
] as const);

/**
 * 検査ひとつの結果。
 * not_applicable は「この作品には関係がない」。unknown は「まだ見ていない」。
 * この2つは意味が違うので、同じ扱いにしない。
 */
export type CheckOutcome = "pass" | "fail" | "not_applicable" | "unknown";

export interface BlockingCheck {
  readonly name: BlockingCheckName;
  readonly outcome: CheckOutcome;
  /** fail / unknown の理由。値そのもの（鍵や個人情報）は書かない。 */
  readonly reason: string | null;
}

export interface ScoredCheck {
  readonly name: ScoredCheckName;
  /** 0〜100。まだ点けていなければ null（0 にしない）。 */
  readonly score: number | null;
  readonly note: string | null;
}

/** 誰が見たか。usable と数えてよいのは human と hybrid だけ（SCHEMA_CATALOG §20）。 */
export type AssessedBy = "human" | "automated" | "hybrid";

/** その素材を使えるか。unknown は「まだ決まっていない」。 */
export type Usability = "unknown" | "usable" | "rejected";

export const QUALITY_SCHEMA_VERSION = "brand_growth.quality_assessment.4.0.0";

/** 生成後の品質判定。作ったあとは変更しない（直すときは新しい記録を作る）。 */
export interface QualityAssessment {
  readonly schema_version: string;
  readonly assessment_id: string;
  readonly asset_id: string;
  readonly assessed_by: AssessedBy;
  readonly blocking_checks: readonly BlockingCheck[];
  readonly scored_checks: readonly ScoredCheck[];
  /** blocking がすべて pass か not_applicable のときだけ true。 */
  readonly passed: boolean;
  readonly rejection_reasons: readonly string[];
  readonly notes: readonly string[];
  readonly human_reviewer: string | null;
  /** UTC ISO 8601。 */
  readonly assessed_at: string;
  readonly usability: Usability;
  readonly warnings: readonly string[];
}
