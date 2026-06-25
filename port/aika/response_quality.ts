// AIKA（守りの受付AI）移植用 — 世界一優しい回答システム / 応答品質ゲート。
//
// このファイルは **依存ゼロの自己完結版** です。flatup-ai-os（AIKA）にそのままコピーして使えます。
// OPENQLOW 側の src/safety/response_quality.ts と同じ4観点・100点ですが、
// 優しさ判定(calculateKindnessScore)を内蔵し、AIKA 接客ログで見えた失敗も検出します。
//
//   ① empathy        悩みに寄り添えているか（機械的な質問攻めをしない）
//   ② naturalness    不自然な点はないか（取次ぎスタック・既知の再質問・知っている事実の出し渋り）
//   ③ nonDuplication 重複していないか（直近返信・文内反復）
//   ④ kindness       世界一優しい回答か（恐怖煽り・選民・体型否定・営業CTA等をブロック）
//
// 使い方（AIKAの返信ハンドラ内・送信前）:
//   const q = scoreResponseQuality(reply, { knownFacts: session.collectedSlots, recentReplies: lastSent });
//   if (q.decision === "reject" || q.decision === "revise") { /* 再生成 or 人間確認 */ }
//
// 規範: knowledge/wiki/kindest-ai-response-policy.md と一致させること。

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

// ───────── ① 寄り添い ─────────
// ※ 判定は src/safety/response_quality.ts（OPENQLOW本番版）と同一に保つこと。
//   「以下のN点」「1.お名前 2.…」のような冷たい列挙のみを機械的とみなす。
//   例文と共感を添えた予約3点要求（「次の3点を教えてください ①…」）は機械的扱いしない。
const MECHANICAL_LIST_PATTERN =
  /以下の\s*\d+\s*[点つ項]|下記.*(?:入力|教え|記入)|1[.．、)]\s*お?名前[\s\S]{0,20}2[.．、)]/;

// ───────── ② 不自然さ ─────────
// 取次ぎモードで固まる定型（AIKAログ:「只今担当者が対応中です。少々お待ちください」）
const STUCK_PHRASE_PATTERN = /只今.*担当者.*対応中|少々お待ちください/;
// 知っているはずの事実を出し渋る出力（AIKAログ: 住所を「確認できていません」で受け流す）
const DEFLECTION_PATTERN =
  /(情報が?手元にありません|確認できていません|確認できておりません|分かりかねます).{0,30}(折り返し|ご連絡|担当者)/;
const REASK_PATTERNS: Record<string, RegExp> = {
  曜日: /(ご希望の)?曜日|何曜/,
  時間: /時間帯|何時|時間を教え/,
  種目: /種目|どのクラス|どの種目/,
  名前: /お名前|名前を/,
};

// ───────── ④ 優しさ（内蔵・check.ts 由来） ─────────
const phonePattern = /(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}|\+81[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})/;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const competitorPattern = /(他(の)?ジム|競合|ライバル)/;
const attackWordPattern = /(最悪|ダメ|最低|弱い|意味ない|終わってる)/;
const overclaimPattern = /(必ず|絶対)(に)?(痩せ|やせ|強くな)|100[%％]|完全(に)?保証|保証(します|です)?/;
const bodyShamingPattern = /(デブ|太っているから|太った自分|醜い|だらしない体|モテない体|痩せないと|体型.*恥)/;
const fearBaitingPattern = /(ボコボコ|殴られ|痛い目|怖いぞ|舐められる|やられる前に|恐怖で)/;
const beforeAfterPattern = /(ビフォーアフター|劇的変化|激変|別人級|人生変わる体|たった\d+日で)/;
const elitistPattern = /(本気の人だけ|覚悟がない人は|甘えるな|根性|追い込め|限界まで|サボるな|本気じゃないなら来るな)/;
const medicalClaimPattern = /(治る|治します|改善します|治療|肩こり.*治|腰痛.*治|うつ.*治)/;
const mockingWeaknessPattern = /(弱者|ヘタクソ|運動音痴[^。！？\n]{0,8}笑|情けない|ダサい|ビビり|チキン)/;
const blamingEffortPattern = /(努力不足|自分に甘い|怠け|意志が弱い|だから変われない|言い訳するな|やる気がないだけ)/;
const KINDNESS_BLOCKS: Array<[RegExp, string]> = [
  [phonePattern, "電話番号らしき文字列が含まれています（公開・直書き禁止）。"],
  [emailPattern, "メールアドレスらしき文字列が含まれています。"],
  [overclaimPattern, "効果を断定しすぎる表現があります。"],
  [bodyShamingPattern, "体型コンプレックスを刺激する表現があります。"],
  [fearBaitingPattern, "格闘技の恐怖で釣る表現があります。"],
  [beforeAfterPattern, "ビフォーアフターや劇的変化の煽りがあります。"],
  [elitistPattern, "初心者を遠ざける本気・根性・選民的な表現があります。"],
  [medicalClaimPattern, "医療・治療効果を断定する表現があります。"],
  [mockingWeaknessPattern, "弱さや失敗を笑いものにする表現があります。"],
  [blamingEffortPattern, "努力不足として責める表現があります。"],
];

function clampAxis(score: number): number {
  return Math.max(0, Math.min(AXIS_MAX, Math.round(score)));
}

function normalizeForSafety(text: string): string {
  return text.normalize("NFKC").replace(/[−ー―‐‑‒–—]/g, "-");
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
  const m = text.normalize("NFKC").match(/[?？]/g);
  return m ? m.length : 0;
}

function hasOtherGymAttack(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  return competitorPattern.test(compact) && attackWordPattern.test(compact);
}

/** 0..25 の優しさスコア（check.ts の calculateKindnessScore を内蔵）。 */
function kindnessTotal(text: string): number {
  const t = normalizeForSafety(text);
  let notScary = 5, beginnerFriendly = 5, noShameOrPressure = 5, memberDignity = 5, flatupLike = 5;
  if (fearBaitingPattern.test(t) || /怖い|威圧|殴|倒す|強制/.test(t)) notScary -= 2;
  if (elitistPattern.test(t) || /経験者向け|本格派|追い込み/.test(t)) beginnerFriendly -= 2;
  if (bodyShamingPattern.test(t) || blamingEffortPattern.test(t)) noShameOrPressure -= 2;
  if (mockingWeaknessPattern.test(t) || beforeAfterPattern.test(t)) memberDignity -= 2;
  if (!/FLATUP|フラットアップ|やさしい|優しい|安心|笑顔|弱い自分|初心者|成田|挑戦|幸せ/.test(t)) flatupLike -= 2;
  if (/怒鳴らない|威圧しない|安心|やさしい|優しい|笑顔|自分のペース|弱い自分/.test(t)) {
    notScary += 1; beginnerFriendly += 1; flatupLike += 1;
  }
  const clamp = (n: number) => Math.max(0, Math.min(5, n));
  return clamp(notScary) + clamp(beginnerFriendly) + clamp(noShameOrPressure) + clamp(memberDignity) + clamp(flatupLike);
}

/** ① 寄り添い。 */
export function scoreEmpathy(reply: string): AxisScore {
  const issues: string[] = [];
  let score = AXIS_MAX;
  if (MECHANICAL_LIST_PATTERN.test(reply.normalize("NFKC"))) {
    score -= 15;
    issues.push("機械的な列挙で複数項目を一度に要求している（1〜2問ずつ、共感を添える）。");
  }
  const q = countQuestions(reply);
  if (q >= 3) {
    score -= 10;
    issues.push(`一度に質問が多すぎる（${q}問）。1回につき1〜2問に絞る。`);
  }
  return { score: clampAxis(score), issues };
}

/** ② 不自然さ。 */
export function scoreNaturalness(reply: string, ctx: ReplyContext = {}): AxisScore {
  const issues: string[] = [];
  let score = AXIS_MAX;
  if (STUCK_PHRASE_PATTERN.test(reply)) {
    score -= 15;
    issues.push("取次ぎ定型で固まっている。基本Q&A（時刻/曜日/料金/住所）は答え続ける。");
  }
  if (DEFLECTION_PATTERN.test(reply.normalize("NFKC"))) {
    score -= 10;
    issues.push("知っているはずの事実を出し渋っている。正本FAQから答え、不明な点だけ人へ。");
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

/** ③ 重複。 */
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
  const sentences = reply.split(/[。\n！？!?]/).map(s => normalizeForCompare(s)).filter(s => s.length >= 8);
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

/** ④ 世界一優しい回答か。 */
export function scoreKindness(reply: string): AxisScore {
  const issues: string[] = [];
  const t = normalizeForSafety(reply);
  let score = kindnessTotal(reply);
  const blocked: string[] = [];
  for (const [re, msg] of KINDNESS_BLOCKS) if (re.test(t)) blocked.push(msg);
  if (hasOtherGymAttack(t)) blocked.push("他ジムを直接攻撃する表現があります。");
  if (blocked.length > 0) {
    score = Math.min(score, 8);
    issues.push(...blocked);
  }
  return { score: clampAxis(score), issues };
}

function decisionFor(total: number, axes: AxisScore[]): QualityDecision {
  if (axes.every(a => a.score === AXIS_MAX)) return "perfect";
  const minAxis = Math.min(...axes.map(a => a.score));
  if (minAxis < 10) return "reject";
  if (minAxis < 15) return "revise";
  if (total >= 80) return "good";
  if (total >= 60) return "revise";
  return "reject";
}

/** 顧客向け返信を4観点で採点する。送信はしない。 */
export function scoreResponseQuality(reply: string, ctx: ReplyContext = {}): ResponseQualityResult {
  const empathy = scoreEmpathy(reply);
  const naturalness = scoreNaturalness(reply, ctx);
  const nonDuplication = scoreNonDuplication(reply, ctx);
  const kindness = scoreKindness(reply);
  const total = empathy.score + naturalness.score + nonDuplication.score + kindness.score;
  const axes = [empathy, naturalness, nonDuplication, kindness];
  return {
    total,
    empathy,
    naturalness,
    nonDuplication,
    kindness,
    decision: decisionFor(total, axes),
    suggestions: axes.flatMap(a => a.issues),
  };
}
