import type { KindnessScore, SafetyIssue, SafetyResult } from "../types.js";

const phonePattern = /(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}|\+81[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})/;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const competitorPattern = /(他(の)?ジム|競合|ライバル)/;
const attackWordPattern = /(最悪|ダメ|最低|弱い|意味ない|終わってる)/;
const overclaimPattern = /(必ず|絶対)(に)?(痩せ|やせ|強くな)|100[%％]|100パーセント|完全(に)?保証|保証(します|です)?/;
const unsafePublishPattern = /(自動投稿|即時公開|勝手に公開|予約投稿API|schedule API|予約投稿|SNSに公開|投稿します|公開します|へ公開|に投稿)/i;
const salesyCtaPattern = /(公式LINE|プロフィール.*LINE|体験.*(予約|受付|連絡|LINE)|無料体験|今だけ|限定|ご連絡ください|来てください|よかったら来て)/;
const bodyShamingPattern = /(デブ|太っているから|太った自分|醜い|だらしない体|モテない体|痩せないと|体型.*恥|お腹.*ヤバい)/;
const fearBaitingPattern = /(ボコボコ|殴られ|痛い目|怖いぞ|舐められる|やられる前に|恐怖で|格闘技.*怖い.*来)/;
const beforeAfterPattern = /(ビフォーアフター|before\s*after|劇的変化|激変|別人級|人生変わる体|たった\d+日で)/i;
const elitistPattern = /(本気の人だけ|覚悟がない人は|甘えるな|根性|追い込め|限界まで|サボるな|本気じゃないなら来るな)/;
const medicalClaimPattern = /(治る|治します|改善します|治療|リハビリ|肩こり.*治|腰痛.*治|うつ.*治|不安障害.*治|医療)/;
const mockingWeaknessPattern = /(弱い[^。！？\n]{0,8}笑|弱者|ヘタクソ|運動音痴[^。！？\n]{0,8}笑|情けない|ダサい|ビビり|チキン)/;
const blamingEffortPattern = /(努力不足|自分に甘い|怠け|意志が弱い|だから変われない|言い訳するな|やる気がないだけ)/;

function normalizeForSafety(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[−ー―‐‑‒–—]/g, "-");
}

function hasOtherGymAttack(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  return competitorPattern.test(compact) && attackWordPattern.test(compact);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(5, score));
}

function decisionFor(total: number): KindnessScore["decision"] {
  if (total >= 22) return "strong";
  if (total >= 18) return "revise_lightly";
  if (total >= 14) return "revise_before_showing";
  return "reject";
}

export function calculateKindnessScore(text: string): KindnessScore {
  const normalized = normalizeForSafety(text);
  let notScary = 5;
  let beginnerFriendly = 5;
  let noShameOrPressure = 5;
  let memberDignity = 5;
  let flatupLike = 5;

  if (fearBaitingPattern.test(normalized) || /怖い|威圧|殴|倒す|強制/.test(normalized)) notScary -= 2;
  if (elitistPattern.test(normalized) || /経験者向け|本格派|追い込み/.test(normalized)) beginnerFriendly -= 2;
  if (salesyCtaPattern.test(normalized) || bodyShamingPattern.test(normalized) || blamingEffortPattern.test(normalized)) noShameOrPressure -= 2;
  if (mockingWeaknessPattern.test(normalized) || beforeAfterPattern.test(normalized) || /晒|失敗.*笑/.test(normalized)) memberDignity -= 2;
  if (!/FLATUP|フラットアップ|やさしい|優しい|安心|笑顔|弱い自分|初心者|成田|挑戦|幸せ/.test(normalized)) flatupLike -= 2;

  if (/怒鳴らない|威圧しない|安心|やさしい|優しい|笑顔|自分のペース|弱い自分/.test(normalized)) {
    notScary += 1;
    beginnerFriendly += 1;
    flatupLike += 1;
  }

  notScary = clampScore(notScary);
  beginnerFriendly = clampScore(beginnerFriendly);
  noShameOrPressure = clampScore(noShameOrPressure);
  memberDignity = clampScore(memberDignity);
  flatupLike = clampScore(flatupLike);

  const total = notScary + beginnerFriendly + noShameOrPressure + memberDignity + flatupLike;

  return {
    notScary,
    beginnerFriendly,
    noShameOrPressure,
    memberDignity,
    flatupLike,
    total,
    decision: decisionFor(total),
  };
}

export function checkDraftSafety(text: string): SafetyResult {
  const normalized = normalizeForSafety(text);
  const issues: SafetyIssue[] = [];
  const kindnessScore = calculateKindnessScore(normalized);

  if (phonePattern.test(normalized)) {
    issues.push({
      code: "pii_phone",
      severity: "block",
      message: "電話番号らしき文字列が含まれています。",
    });
  }

  if (emailPattern.test(normalized)) {
    issues.push({
      code: "pii_email",
      severity: "block",
      message: "メールアドレスらしき文字列が含まれています。",
    });
  }

  if (hasOtherGymAttack(normalized)) {
    issues.push({
      code: "other_gym_attack",
      severity: "block",
      message: "他ジムを直接攻撃する表現があります。",
    });
  }

  if (overclaimPattern.test(normalized)) {
    issues.push({
      code: "overclaim",
      severity: "block",
      message: "効果を断定しすぎる表現があります。",
    });
  }

  if (unsafePublishPattern.test(normalized)) {
    issues.push({
      code: "unsafe_auto_publish",
      severity: "block",
      message: "自動公開・予約投稿・公開実行を示す表現があります。",
    });
  }

  if (salesyCtaPattern.test(normalized)) {
    issues.push({
      code: "salesy_cta",
      severity: "block",
      message: "OPENQLOW v2で禁止している営業CTAが含まれています。",
    });
  }

  if (bodyShamingPattern.test(normalized)) {
    issues.push({
      code: "body_shaming",
      severity: "block",
      message: "体型コンプレックスを刺激する表現があります。",
    });
  }

  if (fearBaitingPattern.test(normalized)) {
    issues.push({
      code: "fear_baiting",
      severity: "block",
      message: "格闘技の恐怖で釣る表現があります。",
    });
  }

  if (beforeAfterPattern.test(normalized)) {
    issues.push({
      code: "before_after_baiting",
      severity: "block",
      message: "ビフォーアフターや劇的変化の煽りがあります。",
    });
  }

  if (elitistPattern.test(normalized)) {
    issues.push({
      code: "elitist_phrasing",
      severity: "block",
      message: "初心者を遠ざける本気・根性・選民的な表現があります。",
    });
  }

  if (medicalClaimPattern.test(normalized)) {
    issues.push({
      code: "medical_claim",
      severity: "block",
      message: "医療・治療効果を断定する表現があります。",
    });
  }

  if (mockingWeaknessPattern.test(normalized)) {
    issues.push({
      code: "mocking_weakness",
      severity: "block",
      message: "弱さや失敗を笑いものにする表現があります。",
    });
  }

  if (blamingEffortPattern.test(normalized)) {
    issues.push({
      code: "blaming_effort",
      severity: "block",
      message: "努力不足として責める表現があります。",
    });
  }

  if (!/FLATUP|フラットアップ|成田|初心者|女性|子ども|キッズ|挑戦|やさしい|優しい|安心|弱い自分/.test(normalized)) {
    issues.push({
      code: "missing_flatup_value",
      severity: "warn",
      message: "FLATUPの価値観との接続が弱い可能性があります。",
    });
  }

  if (kindnessScore.total < 18) {
    issues.push({
      code: "low_kindness_score",
      severity: "block",
      message: `優しさスコアが低すぎます (${kindnessScore.total}/25)。`,
    });
  }

  return {
    ok: issues.every(issue => issue.severity !== "block"),
    issues,
    kindnessScore,
  };
}
