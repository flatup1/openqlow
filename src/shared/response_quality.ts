// 世界一優しい回答システム — 応答品質スコアラー（単一実装・共通層 shared）。
//
// 攻めOPENQLOW・守りAIKA の両方が、顧客向け返信を出す前に 4 観点で自動採点する唯一のゲート。
// 各 25 点・合計 100 点。実運用ログで観測した失敗を二度と起こさないための門番。
//   ① empathy        悩みに寄り添えているか（機械的な質問攻めをしない）
//   ② naturalness    不自然な点はないか（スタック・既知事項の再質問をしない）
//   ③ nonDuplication 重複していないか（直近返信・文内反復の検出）
//   ④ kindness       世界一優しい回答か（calculateKindnessScore + 安全チェック）
//
// 互換: `src/safety/response_quality.ts` は本ファイルの再エクスポート。
// 外部AIKA配布用の依存ゼロ複製は `port/aika/response_quality.ts`。
// 規範は knowledge/wiki/kindest-ai-response-policy.md と一致させる。

import { calculateKindnessScore, checkDraftSafety } from "../safety/check.js";

export interface ReplyContext {
  /** 直前までの会話で既に判明している事項のカテゴリ（例: ["曜日","種目"]）。再質問検出に使う。 */
  knownFacts?: string[];
  /** 直近で送った返信本文（重複検出用）。 */
  recentReplies?: string[];
}

export interface AxisScore {
  /** 0..25 */
  score: number;
  issues: string[];
}

export type QualityDecision = "perfect" | "good" | "revise" | "reject";

export interface ResponseQualityResult {
  /** 0..100 */
  total: number;
  empathy: AxisScore;
  naturalness: AxisScore;
  nonDuplication: AxisScore;
  kindness: AxisScore;
  decision: QualityDecision;
  suggestions: string[];
}

const AXIS_MAX = 25;

// ① 機械的な質問攻め・列挙要求（ログ実例:「以下の3点を教えてください。1.お名前 2.種目 3.日時」）
const MECHANICAL_LIST_PATTERN =
  /以下の\s*\d+\s*[点つ項]|下記.*(?:入力|教え|記入)|1[.．、)]\s*お?名前[\s\S]{0,20}2[.．、)]/;

// ② スタック定型（取次ぎモードで固まる:「只今担当者が対応中です。少々お待ちください」）
const STUCK_PHRASE_PATTERN = /只今.*担当者.*対応中|少々お待ちください/;

// ② 既知カテゴリの再質問検出
const REASK_PATTERNS: Record<string, RegExp> = {
  曜日: /(ご希望の)?曜日|何曜/,
  時間: /時間帯|何時|時間を教え/,
  種目: /種目|どのクラス|どの種目/,
  名前: /お名前|名前を/,
};

function clampAxis(score: number): number {
  return Math.max(0, Math.min(AXIS_MAX, Math.round(score)));
}

function normalizeForCompare(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[、。!！?？…・"'`*#]/g, "")
    .toLowerCase()
    .trim();
}

function countQuestions(text: string): number {
  const matches = text.normalize("NFKC").match(/[?？]/g);
  return matches ? matches.length : 0;
}

/** ① 寄り添い。機械的な列挙要求・一度に多すぎる質問を減点。 */
export function scoreEmpathy(reply: string): AxisScore {
  const issues: string[] = [];
  let score = AXIS_MAX;
  if (MECHANICAL_LIST_PATTERN.test(reply.normalize("NFKC"))) {
    score -= 15;
    issues.push("機械的な列挙で複数項目を一度に要求している（1〜2問ずつ、共感を添える）。");
  }
  const questions = countQuestions(reply);
  if (questions >= 3) {
    score -= 10;
    issues.push(`一度に質問が多すぎる（${questions}問）。1回につき1〜2問に絞る。`);
  }
  return { score: clampAxis(score), issues };
}

/** ② 不自然さ。スタック定型・既知事項の再質問を減点。 */
export function scoreNaturalness(reply: string, ctx: ReplyContext = {}): AxisScore {
  const issues: string[] = [];
  let score = AXIS_MAX;
  if (STUCK_PHRASE_PATTERN.test(reply)) {
    score -= 15;
    issues.push("取次ぎ定型で固まっている。基本Q&A（時刻/曜日/料金）は答え続ける。");
  }
  for (const known of ctx.knownFacts ?? []) {
    const pattern = REASK_PATTERNS[known];
    if (pattern && pattern.test(reply)) {
      score -= 10;
      issues.push(`既に分かっている「${known}」を再質問している。直前の会話を参照する。`);
    }
  }
  return { score: clampAxis(score), issues };
}

/** ③ 重複。直近返信との重複・文内の反復を減点。 */
export function scoreNonDuplication(reply: string, ctx: ReplyContext = {}): AxisScore {
  const issues: string[] = [];
  let score = AXIS_MAX;
  const norm = normalizeForCompare(reply);

  for (const prev of ctx.recentReplies ?? []) {
    const prevNorm = normalizeForCompare(prev);
    if (!prevNorm) continue;
    if (prevNorm === norm) {
      score -= 20;
      issues.push("直前と同一の返信を再送している（冪等にし、一歩進める）。");
      break;
    }
    const shorter = norm.length <= prevNorm.length ? norm : prevNorm;
    const longer = shorter === norm ? prevNorm : norm;
    if (shorter.length >= 20 && longer.includes(shorter)) {
      score -= 15;
      issues.push("直前の返信とほぼ同内容を再送している。");
      break;
    }
  }

  const sentences = reply
    .split(/[。\n！？!?]/)
    .map(s => normalizeForCompare(s))
    .filter(s => s.length >= 8);
  const seen = new Set<string>();
  for (const s of sentences) {
    if (seen.has(s)) {
      score -= 10;
      issues.push("同じ文を返信内で繰り返している。");
      break;
    }
    seen.add(s);
  }

  return { score: clampAxis(score), issues };
}

/** ④ 世界一優しい回答か。既存の優しさスコア（0..25）＋安全ブロックを反映。 */
export function scoreKindness(reply: string): AxisScore {
  const issues: string[] = [];
  const safety = checkDraftSafety(reply);
  let score = calculateKindnessScore(reply).total; // 0..25
  const blocks = safety.issues.filter(i => i.severity === "block");
  if (blocks.length > 0) {
    score = Math.min(score, 8);
    for (const b of blocks) issues.push(b.message);
  }
  return { score: clampAxis(score), issues };
}

function decisionFor(total: number, axes: AxisScore[]): QualityDecision {
  if (axes.every(a => a.score === AXIS_MAX)) return "perfect";
  // どれか1観点でも致命的に低ければ、合計が高くても「良い」とは見なさない。
  // 世界一優しい回答は全観点が水準を満たして初めて成立する。
  const minAxis = Math.min(...axes.map(a => a.score));
  if (minAxis < 10) return "reject";
  if (minAxis < 15) return "revise";
  if (total >= 80) return "good";
  if (total >= 60) return "revise";
  return "reject";
}

/** 顧客向け返信を 4 観点で採点する。 */
export function scoreResponseQuality(reply: string, ctx: ReplyContext = {}): ResponseQualityResult {
  const empathy = scoreEmpathy(reply);
  const naturalness = scoreNaturalness(reply, ctx);
  const nonDuplication = scoreNonDuplication(reply, ctx);
  const kindness = scoreKindness(reply);
  const total = empathy.score + naturalness.score + nonDuplication.score + kindness.score;
  const axes = [empathy, naturalness, nonDuplication, kindness];
  const suggestions = axes.flatMap(a => a.issues);
  return {
    total,
    empathy,
    naturalness,
    nonDuplication,
    kindness,
    decision: decisionFor(total, axes),
    suggestions,
  };
}
