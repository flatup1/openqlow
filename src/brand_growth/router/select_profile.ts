// Brand Growth Phase 1 Router: 作り方・感情・配信面・品質プロファイル・CTA・Knowledge tag・確認事項を選ぶ。
//
// 参照: TARGET_ROUTER_SPEC §6〜§13、CLAUDE_CODE_IMPLEMENTATION_SPEC §6 §7。
// ここでは事実（料金・住所・時間）を一切扱わない。必要になったら canon の型付きセレクタ経由にする。

import {
  hasCharacterSheet,
  hasImageAsset,
  hasVerifiedFactSource,
  hasVideoAsset,
  personAssets,
  blockedMinorAssets,
  type CreativeInput,
} from "../contracts/creative_input.js";
import type {
  Classified,
  ClarificationReason,
  ContentMode,
  CtaPolicy,
  EmotionalGoal,
  Intent,
  Objective,
  PlatformId,
  PlatformPlan,
  QualityProfile,
  SignalSource,
  TargetPrimary,
} from "../contracts/route_decision.js";
import {
  anyPhrasePresent,
  confidenceFromMatch,
  matchedValues,
  scoreLexicon,
  type Phrase,
} from "./lexicon.js";
import type { NormalizedInput } from "./normalize_input.js";

// --- Content Mode -----------------------------------------------------------

const ANIME_PHRASES: readonly string[] = ["アニメ", "animation", "イラストで", "漫画風"];
const LIVE_ACTION_PHRASES: readonly string[] = ["実写で", "実写希望", "撮影して"];

/** 何をどう作るか。素材の有無が判断の中心。 */
export function selectContentMode(
  input: CreativeInput,
  normalized: NormalizedInput,
  intent: Intent,
): Classified<ContentMode> {
  if (input.content_mode_hint) {
    return { value: input.content_mode_hint, confidence: 0.95, source: "explicit_hint" };
  }
  if (intent === "repurpose" && hasVideoAsset(input)) {
    return { value: "edit_only", confidence: 0.85, source: "explicit_text" };
  }
  if (anyPhrasePresent(ANIME_PHRASES, normalized) || hasCharacterSheet(input)) {
    return { value: "animation", confidence: 0.9, source: "explicit_text" };
  }
  if (anyPhrasePresent(LIVE_ACTION_PHRASES, normalized)) {
    return { value: "live_action", confidence: 0.9, source: "explicit_text" };
  }
  if (hasImageAsset(input)) {
    // 写真があるなら動かす。Phase 1 の中心ケース。
    return { value: "image_to_video", confidence: 0.85, source: "asset_metadata" };
  }
  if (hasVideoAsset(input)) {
    return { value: "edit_only", confidence: 0.7, source: "asset_metadata" };
  }
  return { value: "text_to_video", confidence: 0.6, source: "default" };
}

// --- Emotional Goal ---------------------------------------------------------

/** 本文で感情が明示された場合の言い回し。並び順が優先度。 */
const EMOTION_PHRASES: readonly Phrase<EmotionalGoal>[] = [
  { value: "aspiration", phrase: "かっこよく" },
  { value: "aspiration", phrase: "かっこいい" },
  { value: "aspiration", phrase: "かっこよさ" },
  { value: "aspiration", phrase: "クールに" },
  { value: "aspiration", phrase: "痺れる" },
  { value: "aspiration", phrase: "憧れ" },
  { value: "aspiration", phrase: "迫力" },
  { value: "safety", phrase: "安心" },
  { value: "safety", phrase: "やさしい" },
  { value: "safety", phrase: "優しい" },
  { value: "safety", phrase: "こわくない" },
  { value: "safety", phrase: "怖くない" },
  { value: "safety", phrase: "無理なく" },
  { value: "fun", phrase: "楽しい" },
  { value: "fun", phrase: "楽しく" },
  { value: "fun", phrase: "楽しそう" },
  { value: "fun", phrase: "楽しめる" },
  { value: "fun", phrase: "わくわく" },
  { value: "fun", phrase: "笑顔" },
  { value: "trust", phrase: "信頼" },
  { value: "trust", phrase: "誠実" },
  { value: "trust", phrase: "ちゃんとしてる" },
  { value: "confidence", phrase: "自信" },
  { value: "confidence", phrase: "できるかも" },
  { value: "confidence", phrase: "一歩踏み出" },
  { value: "belonging", phrase: "仲間" },
  { value: "belonging", phrase: "居場所" },
  { value: "belonging", phrase: "家族みたい" },
  { value: "empathy", phrase: "物語" },
  { value: "empathy", phrase: "ストーリー" },
  { value: "empathy", phrase: "共感" },
];

/** 使ってはいけない感情の合図。安全側へ変換する。 */
const FORBIDDEN_EMOTION_PHRASES: readonly string[] = [
  "恐怖",
  "怖がらせ",
  "煽って",
  "罪悪感",
  "焦らせ",
  "不安にさせ",
];

/** Target 別の既定感情。CLAUDE_CODE_IMPLEMENTATION_SPEC §6 の既定マトリクス。 */
const TARGET_EMOTION: Record<TargetPrimary, EmotionalGoal> = {
  kids: "fun",
  kids_parents: "trust",
  women_beginners: "safety",
  women_30_40: "safety",
  men_beginners: "permission",
  inactive_men: "permission",
  senior: "confidence",
  parents: "trust",
  family: "belonging",
  sparring_fans: "aspiration",
  competition: "aspiration",
  event: "aspiration",
  facility: "safety",
  instructor: "trust",
  member_story: "empathy",
  general_beginner: "safety",
};

export interface EmotionalGoalResult {
  readonly goal: Classified<EmotionalGoal>;
  /** 禁止感情の依頼を安全側へ置き換えたか。 */
  readonly converted_from_forbidden: boolean;
}

export function selectEmotionalGoal(
  normalized: NormalizedInput,
  target: TargetPrimary,
  objective: Objective,
): EmotionalGoalResult {
  if (anyPhrasePresent(FORBIDDEN_EMOTION_PHRASES, normalized)) {
    // 恐怖や罪悪感で人を動かさない。安全側の既定へ置き換える。
    return {
      goal: { value: TARGET_EMOTION[target], confidence: 0.8, source: "default" },
      converted_from_forbidden: true,
    };
  }
  const match = scoreLexicon(EMOTION_PHRASES, normalized);
  if (match) {
    return {
      goal: { value: match.value, confidence: confidenceFromMatch(match), source: "explicit_text" },
      converted_from_forbidden: false,
    };
  }
  // 女性初心者×体験は safety、子ども×体験でも fun のまま、と Target 既定を尊重する。
  const base = TARGET_EMOTION[target];
  const confidence = objective === "trust" ? 0.75 : 0.8;
  return {
    goal: { value: base, confidence, source: "default" },
    converted_from_forbidden: false,
  };
}

// --- Requested duration -----------------------------------------------------

/** 受け付ける尺の範囲（秒）。短尺クリエイティブとして現実的な幅だけを通す。 */
export const MIN_DURATION_SECONDS = 1;
export const MAX_DURATION_SECONDS = 120;

/** 「15秒」「30s」「30 sec」「1分」を拾う。倍率は秒への換算値。 */
const DURATION_PATTERNS: ReadonlyArray<readonly [RegExp, number]> = [
  [/(\d+(?:\.\d+)?)\s*(?:秒|s(?:ec(?:s|onds)?)?\b)/, 1],
  [/(\d+(?:\.\d+)?)\s*分/, 60],
];

/** 「1分30秒」のような複合表記。ここでは解釈せず、安全に捨てる。 */
const MIXED_UNIT = /\d+\s*分[^。\n]{0,4}\d+\s*秒/;

export interface RequestedDurationResult {
  /** 使える明示値。無ければ null。既定値はここへ入れない。 */
  readonly seconds: number | null;
  readonly source: SignalSource;
  /** 値は見つかったが使えなかったときの元の表記。問題なければ null。 */
  readonly rejected_value: string | null;
}

/** 整数で、範囲内であることだけを条件にする。 */
function validDuration(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (!Number.isInteger(value)) return null;
  if (value < MIN_DURATION_SECONDS || value > MAX_DURATION_SECONDS) return null;
  return value;
}

/**
 * ユーザーが明示した尺を取り出す。
 * 構造化ヒント > 本文の明示 > 未指定（null）。例外は投げない。
 */
export function selectRequestedDuration(
  input: CreativeInput,
  normalized: NormalizedInput,
): RequestedDurationResult {
  const hint = input.duration_hint_seconds;
  if (hint !== undefined && hint !== null) {
    const ok = validDuration(hint);
    return ok !== null
      ? { seconds: ok, source: "explicit_hint", rejected_value: null }
      : { seconds: null, source: "explicit_hint", rejected_value: String(hint) };
  }

  // 空白を残した側を見る。compact_lower だと "30 s" が "30s..." と繋がり単位の語境界が壊れるため。
  const text = normalized.text_lower;

  const mixed = MIXED_UNIT.exec(text);
  if (mixed) {
    return { seconds: null, source: "explicit_text", rejected_value: mixed[0] };
  }

  for (const [pattern, multiplier] of DURATION_PATTERNS) {
    const found = pattern.exec(text);
    if (found) {
      const ok = validDuration(Number(found[1]) * multiplier);
      return ok !== null
        ? { seconds: ok, source: "explicit_text", rejected_value: null }
        : { seconds: null, source: "explicit_text", rejected_value: found[0] };
    }
  }

  return { seconds: null, source: "default", rejected_value: null };
}

// --- Platform ---------------------------------------------------------------

/**
 * 配信面の言い回し。
 * "line" は online 等の一部に当たらないよう語境界を要求する。
 */
const PLATFORM_PHRASES: readonly Phrase<PlatformId>[] = [
  { value: "instagram_reel", phrase: "リール" },
  { value: "instagram_reel", phrase: "reel" },
  { value: "instagram_reel", phrase: "instagram" },
  { value: "instagram_reel", phrase: "インスタ" },
  { value: "tiktok", phrase: "tiktok" },
  { value: "tiktok", phrase: "ティックトック" },
  { value: "youtube_shorts", phrase: "shorts" },
  { value: "youtube_shorts", phrase: "ショート" },
  { value: "youtube_shorts", phrase: "youtube" },
  { value: "youtube_shorts", phrase: "ユーチューブ" },
  { value: "website_hero", phrase: "webサイト" },
  { value: "website_hero", phrase: "ウェブサイト" },
  { value: "website_hero", phrase: "ホームページ" },
  { value: "website_hero", phrase: "サイトの" },
  { value: "website_hero", phrase: "ヒーロー動画" },
  { value: "website_hero", phrase: "トップページ" },
  { value: "website_hero", phrase: "トップに置く" },
  { value: "line", phrase: "公式ライン" },
  { value: "line", phrase: "line", boundary: true },
  { value: "advertising", phrase: "広告" },
  { value: "advertising", phrase: "ad用" },
];

/** 配信面ごとの既定アスペクト比と尺。TARGET_ROUTER_SPEC §8。 */
const PLATFORM_DEFAULTS: Record<PlatformId, { readonly aspect_ratio: string; readonly duration_seconds: number }> = {
  instagram_reel: { aspect_ratio: "9:16", duration_seconds: 15 },
  tiktok: { aspect_ratio: "9:16", duration_seconds: 15 },
  youtube_shorts: { aspect_ratio: "9:16", duration_seconds: 30 },
  website_hero: { aspect_ratio: "16:9", duration_seconds: 10 },
  line: { aspect_ratio: "9:16", duration_seconds: 15 },
  advertising: { aspect_ratio: "9:16", duration_seconds: 15 },
};

export interface PlatformResult {
  /** 未指定なら null。空配列にしない（unknown と none を区別する）。 */
  readonly platforms: readonly PlatformPlan[] | null;
  readonly confidence: number;
}

/** 明示された尺があれば必ずそれを使う。既定尺は明示が無いときだけ使う。 */
function planFor(platform: PlatformId, input: CreativeInput, requestedDuration: number | null): PlatformPlan {
  const defaults = PLATFORM_DEFAULTS[platform];
  return {
    platform,
    aspect_ratio: input.aspect_ratio_hint ?? defaults.aspect_ratio,
    duration_seconds: requestedDuration ?? defaults.duration_seconds,
  };
}

export function selectPlatforms(
  input: CreativeInput,
  normalized: NormalizedInput,
  requestedDuration: number | null,
): PlatformResult {
  if (input.platform_hint) {
    return { platforms: [planFor(input.platform_hint, input, requestedDuration)], confidence: 0.95 };
  }
  const found = matchedValues(PLATFORM_PHRASES, normalized);
  if (found.length > 0) {
    return { platforms: found.map(p => planFor(p, input, requestedDuration)), confidence: 0.9 };
  }
  // 配信面が分からない。ここで質問はしない（TARGET_ROUTER_SPEC §13）。null のまま assumption に残す。
  return { platforms: null, confidence: 0.3 };
}

// --- Quality Profile --------------------------------------------------------

/**
 * 必要な blocker の範囲を決める。安全に関わる順で先に決める。
 * 未成年が写っている可能性が最優先。
 */
export function selectQualityProfile(
  input: CreativeInput,
  target: TargetPrimary,
  objective: Objective,
  contentMode: ContentMode,
): QualityProfile {
  if (input.assets.some(a => a.contains_minor)) return "minor_i2v";
  if (hasCharacterSheet(input) || contentMode === "animation") return "original_character";
  if (objective === "event") return "event_facts";
  if (target === "competition" || target === "sparring_fans") return "combat";
  if (personAssets(input).length > 0 && contentMode === "image_to_video") return "people_i2v";
  if (target === "facility") return "facility";
  return "standard_creative";
}

// --- CTA --------------------------------------------------------------------

export interface CtaResult {
  readonly policy: CtaPolicy;
  /** 本文へ載せる前に人間承認が要るか。 */
  readonly approval_required: boolean;
}

/**
 * CTA の方針。TARGET_ROUTER_SPEC §11 とオーナー確定事項（AT-001 準拠で soft_conversion）。
 * 顧客返信の CTA はこの Router では絶対に選ばない。既存 src/safety の判定は一切変更しない。
 */
export function selectCtaPolicy(objective: Objective): CtaResult {
  switch (objective) {
    case "trial":
    case "enrollment":
    case "profile_visit":
    case "line_add":
    case "event":
      return { policy: "soft_conversion", approval_required: true };
    case "awareness":
    case "trust":
    case "retention":
      return { policy: "pure_brand", approval_required: false };
    default:
      return { policy: "pure_brand", approval_required: false };
  }
}

// --- Knowledge tags ---------------------------------------------------------

/** Target 別の物語の型。TARGET_ROUTER_SPEC §9 の story family。 */
const STORY_TAG: Record<TargetPrimary, string> = {
  kids: "story:growth",
  kids_parents: "story:shared_action",
  women_beginners: "story:first_step",
  women_30_40: "story:first_step",
  men_beginners: "story:first_step",
  inactive_men: "story:restart",
  senior: "story:steady_progress",
  parents: "story:shared_action",
  family: "story:belonging",
  sparring_fans: "story:challenge",
  competition: "story:challenge",
  event: "story:challenge",
  facility: "story:place",
  instructor: "story:people",
  member_story: "story:member_voice",
  general_beginner: "story:first_step",
};

/**
 * 必要な Knowledge の tag だけを返す。全カテゴリを読ませない（AT-042 の前提）。
 * 実際の取得は Phase 2 の Knowledge Registry が行う。
 */
export function selectKnowledgeTags(params: {
  readonly target: TargetPrimary;
  readonly secondary: TargetPrimary | null;
  readonly objective: Objective;
  readonly contentMode: ContentMode;
  readonly emotionalGoal: EmotionalGoal;
  readonly platforms: readonly PlatformPlan[] | null;
}): readonly string[] {
  const tags = new Set<string>();
  tags.add("brand:constitution");
  tags.add(`brand:dictionary:${params.emotionalGoal}`);
  tags.add(`target:${params.target}`);
  if (params.secondary) tags.add(`target:${params.secondary}`);
  tags.add(STORY_TAG[params.target]);
  tags.add(`mode:${params.contentMode}`);
  tags.add(`objective:${params.objective}`);
  for (const plan of params.platforms ?? []) {
    tags.add(`platform:${plan.platform}`);
  }
  // 承認済み学習だけを後段で引くための目印。Phase 5 で中身が入る。
  tags.add(`learning:${params.target}:approved`);
  return Object.freeze([...tags].sort());
}

// --- Clarification ----------------------------------------------------------

const MEDICAL_OR_LEGAL_PHRASES: readonly string[] = [
  "治る",
  "治します",
  "治療",
  "診断",
  "痩せると断言",
  "効果を保証",
  "法的に",
  "医学的に",
];

/**
 * 人間に聞くべきことだけを集める。
 * カメラ・照明・音楽・レンズ・Negative・比率・既定尺は聞かない（型に存在しない）。
 */
export function collectClarifications(params: {
  readonly input: CreativeInput;
  readonly normalized: NormalizedInput;
  readonly objective: Objective;
  readonly contentMode: ContentMode;
}): readonly ClarificationReason[] {
  const reasons: ClarificationReason[] = [];

  // 未成年の同意が確認できない限り必ず止める（fail closed / AT-025）。
  if (blockedMinorAssets(params.input).length > 0) {
    reasons.push("minor_consent");
  }

  // 外部事実を語るのに一次資料が無いなら、日付や場所を推測しない（AT-009）。
  if (params.objective === "event" && !hasVerifiedFactSource(params.input)) {
    reasons.push("event_facts");
  }

  // 誰を動かすのか決まらない場合だけ聞く。1人なら聞かない（AT-008）。
  const animating = params.contentMode === "image_to_video" || params.contentMode === "animation";
  if (animating && personAssets(params.input).length >= 2) {
    reasons.push("ambiguous_person");
  }

  // 医療・法律の断定を求められたら人間へ回す。
  if (anyPhrasePresent(MEDICAL_OR_LEGAL_PHRASES, params.normalized)) {
    reasons.push("medical_or_legal_claim");
  }

  // paid_batch_budget は課金実行の境界で使う。Phase 1 は実行を持たないため発生しない。
  return Object.freeze(reasons);
}
