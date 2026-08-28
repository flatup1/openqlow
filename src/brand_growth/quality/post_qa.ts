// Brand Growth Phase 4: 生成したあとの品質判定（post-QA 契約）。
//
// 参照: SCHEMA_CATALOG §11、§20。
//
// 決めることは2つだけ。
//   passed    : blocking がすべて pass か not_applicable のときだけ true。
//   usability : 使える / 使えない / まだ決まっていない。
//
// 大事な線引き:
//   - 「見ていない」検査は pass にしない。unknown のまま残し、passed=false にする。
//   - 点数（motion など）は blocking を上書きしない。90点でも同意が無ければ不合格。
//   - 費用の「使えた本数」に数えてよいのは、人が見た判定（human / hybrid）だけ。
//
// この module は時計を読まない。assessed_at は呼び出し側が渡す。

import type {
  AssessedBy,
  BlockingCheck,
  BlockingCheckName,
  CheckOutcome,
  QualityAssessment,
  ScoredCheck,
  ScoredCheckName,
  Usability,
} from "../contracts/quality.js";
import { BLOCKING_CHECK_NAMES, QUALITY_SCHEMA_VERSION, SCORED_CHECK_NAMES } from "../contracts/quality.js";
import {
  assertCleanText,
  assertSafeId,
  assertUtcIso8601,
  deepFreeze,
  RecordRuleError,
} from "../contracts/record_rules.js";

export interface BlockingInput {
  readonly outcome: CheckOutcome;
  readonly reason?: string | null;
}

export interface PostQaParams {
  readonly assessment_id: string;
  readonly asset_id: string;
  readonly assessed_by: AssessedBy;
  /** UTC ISO 8601。 */
  readonly assessed_at: string;
  /** 人が見たなら誰か。automated なら null。 */
  readonly human_reviewer?: string | null;
  /** 書かなかった検査は unknown になる（pass に落ちない）。 */
  readonly blocking?: Readonly<Partial<Record<BlockingCheckName, BlockingInput>>>;
  /** 0〜100。書かなかった項目は null（0 にしない）。 */
  readonly scored?: Readonly<Partial<Record<ScoredCheckName, number | null>>>;
  readonly notes?: readonly string[];
}

function normalizeBlocking(
  input: Readonly<Partial<Record<BlockingCheckName, BlockingInput>>> | undefined,
): readonly BlockingCheck[] {
  return BLOCKING_CHECK_NAMES.map(name => {
    const given = input?.[name];
    if (given === undefined) {
      // 書かれていない＝まだ見ていない。合格にはしない。
      return { name, outcome: "unknown" as CheckOutcome, reason: "not assessed" };
    }
    return { name, outcome: given.outcome, reason: given.reason ?? null };
  });
}

function normalizeScored(
  input: Readonly<Partial<Record<ScoredCheckName, number | null>>> | undefined,
): readonly ScoredCheck[] {
  return SCORED_CHECK_NAMES.map(name => {
    const raw = input?.[name];
    if (raw === undefined || raw === null) {
      return { name, score: null, note: "not scored" };
    }
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
      throw new RecordRuleError("invalid_score", `scored_checks.${name} must be between 0 and 100`);
    }
    return { name, score: raw, note: null };
  });
}

/**
 * 品質判定を1件つくる。
 *
 * 投げる場合:
 *   - ID や日時が契約を満たしていない
 *   - 点数が 0〜100 の外
 *   - notes や reviewer に秘密情報・個人情報が入っている
 */
export function assessQuality(params: PostQaParams): QualityAssessment {
  assertSafeId("assessment_id", params.assessment_id);
  assertSafeId("asset_id", params.asset_id);
  assertUtcIso8601("assessed_at", params.assessed_at);

  const reviewer = params.human_reviewer ?? null;
  if (params.assessed_by !== "automated" && (reviewer === null || reviewer.trim() === "")) {
    throw new RecordRuleError("missing_reviewer", "human and hybrid assessments require human_reviewer");
  }
  if (reviewer !== null) assertCleanText("human_reviewer", reviewer);

  const notes = params.notes ?? [];
  for (const note of notes) assertCleanText("notes", note);

  const blocking = normalizeBlocking(params.blocking);
  const scored = normalizeScored(params.scored);

  const failed = blocking.filter(check => check.outcome === "fail");
  const unknown = blocking.filter(check => check.outcome === "unknown");

  // blocking が1つでも fail なら不合格（SCHEMA_CATALOG §11）。
  // 未確認が残っている間も合格にはしない（fail closed）。
  const passed = failed.length === 0 && unknown.length === 0;

  const rejectionReasons = failed.map(check => `${check.name}:${check.reason ?? "failed"}`);

  const warnings: string[] = [];
  for (const check of unknown) warnings.push(`unverified:${check.name}`);
  for (const check of scored) {
    if (check.score === null) warnings.push(`unscored:${check.name}`);
  }

  // usable と数えてよいのは人が見た判定だけ（SCHEMA_CATALOG §20）。
  let usability: Usability;
  if (!passed) {
    usability = failed.length > 0 ? "rejected" : "unknown";
  } else if (params.assessed_by === "automated") {
    usability = "unknown";
    warnings.push("automated_only:human_review_required_before_counting_usable");
  } else {
    usability = "usable";
  }

  return deepFreeze({
    schema_version: QUALITY_SCHEMA_VERSION,
    assessment_id: params.assessment_id,
    asset_id: params.asset_id,
    assessed_by: params.assessed_by,
    blocking_checks: blocking,
    scored_checks: scored,
    passed,
    rejection_reasons: rejectionReasons,
    notes,
    human_reviewer: reviewer,
    assessed_at: params.assessed_at,
    usability,
    warnings,
  });
}

/** 費用計算に数えてよい「使えた本数」。人が見た判定だけを数える。 */
export function countUsable(assessments: readonly QualityAssessment[]): number {
  return assessments.filter(
    assessment =>
      assessment.usability === "usable" &&
      assessment.passed &&
      (assessment.assessed_by === "human" || assessment.assessed_by === "hybrid"),
  ).length;
}

/** 人が読む一行説明。 */
export function explainAssessment(assessment: QualityAssessment): string {
  if (assessment.passed) return `合格（${assessment.assessed_by}）。使えるか: ${assessment.usability}`;
  if (assessment.rejection_reasons.length > 0) {
    return `不合格。理由: ${assessment.rejection_reasons.join(" / ")}`;
  }
  return `保留。未確認の検査が残っています: ${assessment.warnings.join(" / ")}`;
}
