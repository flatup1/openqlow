// Brand Growth Phase 4: 生成する前の見張り役（Quality Guardian）。
//
// 参照: IMPLEMENTATION_BOOK §6「preflight QA」、SCHEMA_CATALOG §11、
//       ACCEPTANCE_TESTS AT-025。
//
// 役割は1つ。「作ってはいけないものを、作る前に止める」。
// 直し方は提案しない。止めるか、通すか、人へ回すかだけを決める。
//
// 決定論的であること:
//   - 時計を読まない。乱数を使わない。ファイルもネットワークも触らない。
//   - 同じ入力なら必ず同じ結果になる。
//
// 判定できないものは「合格」にしない（fail closed）。

import { blockedMinorAssets, type AssetRef, type CreativeInput } from "../contracts/creative_input.js";
import type { RouteDecision } from "../contracts/route_decision.js";
import type { BlockingCheckName, CheckOutcome } from "../contracts/quality.js";
import { BLOCKING_CHECK_NAMES } from "../contracts/quality.js";
import { deepFreeze } from "../contracts/record_rules.js";
import type { NegativeCategory, PromptIR } from "../prompts/prompt_ir.js";
import { isFreeOfStyleNames } from "../prompts/style_name_guard.js";
import { scanText as scanSecrets } from "../../shared/secret_guard.js";
import { scanPii } from "../../shared/pii_guard.js";

export const QUALITY_GUARDIAN_VERSION = "4.0.0";

/**
 * ブランドとして出さないもの。
 * 「世界一やさしい格闘技ジム」から外れる方向の言葉だけを見る。
 */
const BRAND_FORBIDDEN_TERMS: readonly string[] = Object.freeze([
  "血",
  "流血",
  "ホラー",
  "恐怖演出",
  "見下す",
  "屈辱",
  "晒し",
  "ぼこぼこ",
  "blood",
  "gore",
  "horror",
  "humiliation",
]);

export interface PreflightCheck {
  readonly name: BlockingCheckName;
  readonly outcome: CheckOutcome;
  readonly reason: string | null;
}

export interface PreflightResult {
  /** blocking がすべて pass か not_applicable のときだけ true。 */
  readonly passed: boolean;
  readonly checks: readonly PreflightCheck[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly clarification_required: boolean;
  /** 生成 Provider へ投げてよいか。1つでも止まっていれば false。 */
  readonly provider_request_allowed: boolean;
  readonly guardian_version: string;
}

export interface PreflightParams {
  readonly input: CreativeInput;
  readonly decision: RouteDecision;
  /** まだ Prompt が無い段階でも呼べる。null なら Prompt 由来の検査は unknown。 */
  readonly prompt_ir: PromptIR | null;
  /** Knowledge 側が止めているか（Phase 3 の blocked をそのまま渡す）。 */
  readonly knowledge_blocked?: boolean;
  readonly knowledge_block_reason?: string | null;
}

function hasNegative(ir: PromptIR | null, category: NegativeCategory): boolean {
  if (ir === null) return false;
  return ir.negative_categories.some(block => block.category === category);
}

/** Prompt の文字列だけを集める。数値や真偽値は見ない。 */
function promptText(ir: PromptIR | null): string {
  if (ir === null) return "";
  const parts: string[] = [
    ir.action,
    ir.camera,
    ir.lens,
    ir.composition,
    ir.lighting,
    ir.atmosphere,
    ir.color,
    ir.speed,
    ir.sound,
    ir.music,
    ir.hero_moment,
    ir.cta_editing_note ?? "",
    ...ir.story,
    ...ir.body_mechanics,
    ...ir.continuity,
    ...ir.subject_preservation,
  ];
  return parts.join("\n");
}

function personAssetsOf(input: CreativeInput): readonly AssetRef[] {
  return input.assets.filter(asset => asset.contains_person);
}

function hasCharacterAsset(input: CreativeInput): boolean {
  return input.assets.some(
    asset => asset.media_type === "character_sheet" || asset.source_type === "character_sheet",
  );
}

function showsRealPlace(input: CreativeInput, decision: RouteDecision): boolean {
  if (decision.target_primary === "facility") return true;
  return input.assets.some(
    asset => asset.source_type === "gym_photo" || asset.source_type === "facility_photo",
  );
}

/** 動く映像を作るか。edit_only は既存素材の編集なので動きの検査対象にしない。 */
function producesMotion(decision: RouteDecision): boolean {
  return decision.content_mode !== "edit_only";
}

// --- 検査ひとつずつ ---------------------------------------------------------

function checkConsent(input: CreativeInput): PreflightCheck {
  const minors = blockedMinorAssets(input);
  if (minors.length > 0) {
    // 素材の中身も ID も出さない。件数だけ伝える。
    return { name: "consent", outcome: "fail", reason: `minor_consent_unconfirmed:${minors.length}` };
  }
  const people = personAssetsOf(input);
  if (people.length === 0) {
    return { name: "consent", outcome: "not_applicable", reason: "no person in assets" };
  }
  const missing = people.filter(asset => asset.consent_status === "missing");
  if (missing.length > 0) {
    return { name: "consent", outcome: "fail", reason: `person_consent_missing:${missing.length}` };
  }
  return { name: "consent", outcome: "pass", reason: null };
}

function checkSecretOrPii(input: CreativeInput, ir: PromptIR | null): PreflightCheck {
  const text = `${input.raw_text}\n${promptText(ir)}`;
  const secrets = scanSecrets(text);
  if (secrets.length > 0) {
    // 値は絶対に載せない。種類だけ。
    return { name: "secret_or_pii", outcome: "fail", reason: `secret:${secrets.map(f => f.kind).join(",")}` };
  }
  const pii = scanPii(text);
  if (pii.length > 0) {
    return { name: "secret_or_pii", outcome: "fail", reason: `pii:${pii.map(f => f.kind).join(",")}` };
  }
  return { name: "secret_or_pii", outcome: "pass", reason: null };
}

function checkBrand(input: CreativeInput, ir: PromptIR | null): PreflightCheck {
  const text = `${input.raw_text}\n${promptText(ir)}`;
  const hit = BRAND_FORBIDDEN_TERMS.find(term => text.includes(term));
  if (hit !== undefined) {
    return { name: "brand", outcome: "fail", reason: "brand_forbidden_expression" };
  }
  if (!isFreeOfStyleNames(promptText(ir))) {
    return { name: "brand", outcome: "fail", reason: "style_name_in_prompt" };
  }
  if (ir === null) {
    return { name: "brand", outcome: "unknown", reason: "prompt not composed yet" };
  }
  if (!hasNegative(ir, "brand")) {
    return { name: "brand", outcome: "fail", reason: "brand_negative_missing" };
  }
  return { name: "brand", outcome: "pass", reason: null };
}

function checkIdentity(input: CreativeInput, decision: RouteDecision, ir: PromptIR | null): PreflightCheck {
  const hasPerson = personAssetsOf(input).length > 0;
  const hasCharacter = hasCharacterAsset(input);
  if (!hasPerson && !hasCharacter) {
    return { name: "identity", outcome: "not_applicable", reason: "no person or character reference" };
  }
  if (ir === null) {
    return { name: "identity", outcome: "unknown", reason: "prompt not composed yet" };
  }
  if (ir.subject_preservation.length === 0) {
    return { name: "identity", outcome: "fail", reason: "subject_preservation_missing" };
  }
  const guarded = hasNegative(ir, "identity") || hasNegative(ir, "character_consistency");
  if (!guarded) {
    return { name: "identity", outcome: "fail", reason: "identity_negative_missing" };
  }
  // 実写素材を動かすのに、別人になる余地を残していないか。
  if (decision.content_mode === "image_to_video" && hasPerson && !hasNegative(ir, "identity")) {
    return { name: "identity", outcome: "fail", reason: "identity_negative_missing_for_i2v" };
  }
  return { name: "identity", outcome: "pass", reason: null };
}

function checkAnatomy(input: CreativeInput, decision: RouteDecision, ir: PromptIR | null): PreflightCheck {
  const showsBody = personAssetsOf(input).length > 0 || hasCharacterAsset(input);
  if (!showsBody || !producesMotion(decision)) {
    return { name: "anatomy", outcome: "not_applicable", reason: "no moving body in this piece" };
  }
  if (ir === null) {
    return { name: "anatomy", outcome: "unknown", reason: "prompt not composed yet" };
  }
  if (!hasNegative(ir, "anatomy")) {
    return { name: "anatomy", outcome: "fail", reason: "anatomy_negative_missing" };
  }
  return { name: "anatomy", outcome: "pass", reason: null };
}

function checkTemporal(decision: RouteDecision, ir: PromptIR | null): PreflightCheck {
  if (!producesMotion(decision)) {
    return { name: "temporal", outcome: "not_applicable", reason: "edit only" };
  }
  if (ir === null) {
    return { name: "temporal", outcome: "unknown", reason: "prompt not composed yet" };
  }
  if (!hasNegative(ir, "temporal")) {
    return { name: "temporal", outcome: "fail", reason: "temporal_negative_missing" };
  }
  return { name: "temporal", outcome: "pass", reason: null };
}

function checkEnvironment(input: CreativeInput, decision: RouteDecision, ir: PromptIR | null): PreflightCheck {
  if (!showsRealPlace(input, decision)) {
    return { name: "environment", outcome: "not_applicable", reason: "no real place shown" };
  }
  if (ir === null) {
    return { name: "environment", outcome: "unknown", reason: "prompt not composed yet" };
  }
  if (!hasNegative(ir, "environment")) {
    return { name: "environment", outcome: "fail", reason: "environment_negative_missing" };
  }
  return { name: "environment", outcome: "pass", reason: null };
}

/**
 * 生成前の検査をまとめて走らせる。
 *
 * 通らなかった検査があれば provider_request_allowed は false になる。
 * この関数は「止める」以上のことはしない。生成も送信も課金もしない。
 */
export function runPreflight(params: PreflightParams): PreflightResult {
  const { input, decision, prompt_ir: ir } = params;
  const knowledgeBlocked = params.knowledge_blocked === true;

  const checks: PreflightCheck[] = [
    checkConsent(input),
    checkIdentity(input, decision, ir),
    checkAnatomy(input, decision, ir),
    checkTemporal(decision, ir),
    checkEnvironment(input, decision, ir),
    checkSecretOrPii(input, ir),
    checkBrand(input, ir),
  ];

  // SCHEMA_CATALOG §11 の順番どおりに並べ、抜けがないことを構造で保証する。
  const ordered = BLOCKING_CHECK_NAMES.map(name => {
    const found = checks.find(check => check.name === name);
    return found ?? { name, outcome: "unknown" as CheckOutcome, reason: "check not implemented" };
  });

  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const check of ordered) {
    if (check.outcome === "fail") blockers.push(`${check.name}:${check.reason ?? "failed"}`);
    // 未確認は合格にしない。生成は止めたうえで、人が見る対象として残す。
    if (check.outcome === "unknown") warnings.push(`${check.name}:unverified`);
  }

  if (knowledgeBlocked) {
    blockers.push(`knowledge:${params.knowledge_block_reason ?? "blocked"}`);
  }

  // 判断のつかない人物が複数いる、といった Router 側の確認事項も引き継ぐ。
  const clarificationRequired = decision.clarification_required || blockers.some(b => b.startsWith("consent:"));

  const unverified = ordered.some(check => check.outcome === "unknown");
  const passed = blockers.length === 0 && !unverified;

  return deepFreeze({
    passed,
    checks: ordered,
    blockers,
    warnings,
    clarification_required: clarificationRequired,
    provider_request_allowed: passed,
    guardian_version: QUALITY_GUARDIAN_VERSION,
  });
}

/** 人が読む一行説明。値そのもの（鍵・個人情報）は出さない。 */
export function explainPreflight(result: PreflightResult): string {
  if (result.passed) return "生成前チェック: 通過。ただし課金生成には人の承認が要ります。";
  const lines = ["生成前チェック: 止めました。"];
  for (const blocker of result.blockers) lines.push(`- 止めた理由: ${blocker}`);
  for (const warning of result.warnings) lines.push(`- 未確認: ${warning}`);
  if (result.clarification_required) lines.push("- 人への確認が必要です。");
  return lines.join("\n");
}
