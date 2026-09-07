// Brand Growth Phase 1: 受入試験用の入力。
//
// 全て架空のID・架空のハッシュ・架空のURIで作る。
//   - 実在の顧客、実在のメディア、実在の会員情報を入れない。
//   - 料金・住所・時間などの正本値を書かない（正本は src/shared/canon.ts）。
//   - 時刻は固定値。実行するたびに結果が変わらないようにする。

import type { AssetRef, CreativeInput } from "../contracts/creative_input.js";
import type {
  ContentMode,
  EmotionalGoal,
  Intent,
  Objective,
  PlatformId,
  TargetPrimary,
} from "../contracts/route_decision.js";

/** 受入試験の基準時刻（UTC）。実時刻は使わない。 */
export const FIXTURE_REQUESTED_AT = "2026-08-15T00:00:00Z";

/** 架空のハッシュ。実ファイルのものではない。 */
function fakeHash(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

function asset(overrides: Partial<AssetRef> & Pick<AssetRef, "asset_id">): AssetRef {
  return {
    uri: `fixture://${overrides.asset_id}`,
    sha256: fakeHash("ab"),
    media_type: "image",
    source_type: "gym_photo",
    contains_person: false,
    contains_minor: false,
    consent_status: "not_required",
    consent_reference: null,
    retention_class: "session",
    ...overrides,
  };
}

function input(
  requestId: string,
  rawText: string,
  assets: readonly AssetRef[],
  extra: Partial<CreativeInput> = {},
): CreativeInput {
  return {
    request_id: requestId,
    raw_text: rawText,
    input_channel: "fixture",
    assets,
    requested_at: FIXTURE_REQUESTED_AT,
    ...extra,
  };
}

/** 成人・同意確認済みのジム写真。 */
const ADULT_GYM_PHOTO = asset({
  asset_id: "ast_fixture_adult_gym",
  source_type: "member_photo",
  contains_person: true,
  consent_status: "confirmed",
  consent_reference: "fixture-consent-001",
});

/** 人物が写っていない施設写真。 */
const FACILITY_PHOTO = asset({
  asset_id: "ast_fixture_facility",
  source_type: "facility_photo",
});

/** 承認済みオリジナルキャラクターシート（実在人物ではない）。 */
const CHARACTER_SHEET = asset({
  asset_id: "ast_fixture_character",
  media_type: "character_sheet",
  source_type: "character_sheet",
  consent_status: "not_required",
});

/** 未成年が写り、同意が未確認の写真。生成へ渡してはいけない。 */
const MINOR_PHOTO_UNKNOWN_CONSENT = asset({
  asset_id: "ast_fixture_minor_unknown",
  source_type: "member_photo",
  contains_person: true,
  contains_minor: true,
  consent_status: "unknown",
});

/** 同じ写真に大人が2人。どちらを動かすか決められない。 */
const TWO_ADULTS_PHOTO_A = asset({
  asset_id: "ast_fixture_two_adults_a",
  source_type: "member_photo",
  contains_person: true,
  consent_status: "confirmed",
  consent_reference: "fixture-consent-002",
});
const TWO_ADULTS_PHOTO_B = asset({
  asset_id: "ast_fixture_two_adults_b",
  source_type: "member_photo",
  contains_person: true,
  consent_status: "confirmed",
  consent_reference: "fixture-consent-003",
});

export const AT001_WOMEN_REEL = input(
  "req_at001",
  "女性向け。このジム写真。Instagram Reel。体験につなげたい。",
  [ADULT_GYM_PHOTO],
);

export const AT002_KIDS_ANIME = input(
  "req_at002",
  "子ども向け。これをアニメで動かしたい。",
  [CHARACTER_SHEET],
);

export const AT003_COMPETITION_COOL = input(
  "req_at003",
  "試合をめちゃくちゃカッコよく。",
  [],
);

export const AT004_PARENT_AND_CHILD = input(
  "req_at004",
  "親子向け。この写真を15秒に。",
  [ADULT_GYM_PHOTO],
);

export const AT005_SENIOR = input(
  "req_at005",
  "シニア向け。運動を始める安心感。",
  [],
);

export const AT006_WEBSITE_HERO = input(
  "req_at006",
  "このジム写真をWebサイトのヒーロー動画に。",
  [FACILITY_PHOTO],
);

export const AT007_INSTAGRAM_DEFAULT = input(
  "req_at007",
  "この画像をInstagram用に。",
  [ADULT_GYM_PHOTO],
);

export const AT008_MINIMAL_AMBIGUOUS = input(
  "req_at008",
  "これ動かして。",
  [ADULT_GYM_PHOTO],
);

export const AT009_EVENT_FACTS_MISSING = input(
  "req_at009",
  "来週の大会告知を作って。",
  [],
);

export const AT025_MINOR_CONSENT = input(
  "req_at025",
  "この写真を動かして。",
  [MINOR_PHOTO_UNKNOWN_CONSENT],
);

export const AT046_OWNER_MINIMAL_WORK = input(
  "req_at046",
  "この写真をリールにして。",
  [ADULT_GYM_PHOTO],
);

/** 誰を動かすか決められないケース。 */
export const AMBIGUOUS_PERSON = input(
  "req_ambiguous_person",
  "この写真を動かして。",
  [TWO_ADULTS_PHOTO_A, TWO_ADULTS_PHOTO_B],
);

/** 明示ヒントが本文の推定より強いことを確かめるケース。 */
export const HINT_OVERRIDES_TEXT = input(
  "req_hint_priority",
  "女性向けのリールにしたい。",
  [ADULT_GYM_PHOTO],
  { target_hint: "senior", objective_hint: "line_add" },
);

/** 恐怖で人を動かそうとする依頼。安全側へ変換されるべきケース。 */
export const FORBIDDEN_EMOTION_REQUEST = input(
  "req_forbidden_emotion",
  "サボってる人を焦らせる感じで作って。",
  [ADULT_GYM_PHOTO],
);

/** 医療の断定を求める依頼。人間へ回すべきケース。 */
export const MEDICAL_CLAIM_REQUEST = input(
  "req_medical_claim",
  "腰痛が治ると言い切る動画にして。",
  [ADULT_GYM_PHOTO],
);

// --- 尺の明示（Codex レビュー 2026-08-15 で追加）-----------------------------

/** 配信面と尺の両方を明示。両方に同じ値が入るべきケース。 */
export const DURATION_WITH_PLATFORM = input(
  "req_duration_platform",
  "30s Instagram Reel",
  [ADULT_GYM_PHOTO],
);

/** 0秒。使えない値。 */
export const DURATION_INVALID_ZERO = input(
  "req_duration_zero",
  "この写真を0秒にして。",
  [ADULT_GYM_PHOTO],
);

/** 長すぎる。使えない値。 */
export const DURATION_INVALID_TOO_LONG = input(
  "req_duration_too_long",
  "この写真を9999秒にして。",
  [ADULT_GYM_PHOTO],
);

/** 小数。使えない値。 */
export const DURATION_INVALID_DECIMAL = input(
  "req_duration_decimal",
  "この写真を1.5秒にして。",
  [ADULT_GYM_PHOTO],
);

/** 複合表記。ここでは解釈しない。 */
export const DURATION_MIXED_UNITS = input(
  "req_duration_mixed",
  "この写真を1分30秒にして。",
  [ADULT_GYM_PHOTO],
);

/** 分の指定。秒へ換算できるケース。 */
export const DURATION_IN_MINUTES = input(
  "req_duration_minutes",
  "この写真を1分にして。",
  [ADULT_GYM_PHOTO],
);

/** 構造化ヒントが本文の「15秒」より強いことを確かめるケース。 */
export const DURATION_HINT_OVERRIDES_TEXT = input(
  "req_duration_hint",
  "この写真を15秒に。Instagram Reel。",
  [ADULT_GYM_PHOTO],
  { duration_hint_seconds: 30 },
);

// --- 言い換え・表記揺れ・打ち消しの検証ケース --------------------------------
//
// 一行入力の現実的な言い方を並べる。宣言した項目だけを検証する（書いていない項目は自由）。

export interface ParaphraseExpectation {
  readonly target?: TargetPrimary;
  readonly secondary?: TargetPrimary | null;
  readonly objective?: Objective;
  readonly intent?: Intent;
  readonly content_mode?: ContentMode;
  readonly emotional_goal?: EmotionalGoal;
  /** null は「配信面が未定であること」を要求する。 */
  readonly platform?: PlatformId | null;
  readonly duration?: number | null;
  readonly cta_approval?: boolean;
  readonly clarification?: boolean;
  /** この field の assumption が残っていること。 */
  readonly assumption_field?: string;
}

export interface ParaphraseCase {
  readonly id: string;
  readonly input: CreativeInput;
  readonly expect: ParaphraseExpectation;
}

function paraphrase(
  id: string,
  rawText: string,
  expect: ParaphraseExpectation,
  assets: readonly AssetRef[] = [],
  extra: Partial<CreativeInput> = {},
): ParaphraseCase {
  return { id, input: input(`req_${id}`, rawText, assets, extra), expect };
}

export const PARAPHRASE_CASES: readonly ParaphraseCase[] = Object.freeze([
  // --- Target の言い換え ---
  paraphrase("p01", "女性向けのリールを作って", {
    target: "women_beginners",
    platform: "instagram_reel",
    intent: "create",
  }),
  paraphrase("p02", "レディースクラスの動画にしたい", { target: "women_beginners" }),
  paraphrase("p03", "30代女性に届けたい", { target: "women_30_40" }),
  paraphrase("p04", "キッズクラスの様子を動画に", { target: "kids", secondary: "parents" }),
  paraphrase("p05", "小学生の子が楽しそうなやつ", { target: "kids", emotional_goal: "fun" }),
  paraphrase("p06", "親子で通える感じを伝えたい", { target: "kids_parents", secondary: "kids" }),
  paraphrase("p07", "保護者の方に安心してほしい", { target: "parents", objective: "trust" }),
  paraphrase("p08", "シニアの方が無理なく始められる", { target: "senior" }),
  paraphrase("p09", "60代でも大丈夫だと伝えたい", { target: "senior" }),
  paraphrase("p10", "男性初心者が入りやすい雰囲気", { target: "men_beginners" }),
  paraphrase("p11", "運動不足のお父さんに向けて", { target: "inactive_men" }),
  paraphrase("p12", "家族みんなで楽しめる", { target: "family", secondary: "parents" }),
  paraphrase("p13", "試合の迫力を伝えたい", { target: "competition", emotional_goal: "aspiration" }),
  paraphrase("p14", "スパーリングのかっこよさ", { target: "sparring_fans", emotional_goal: "aspiration" }),
  paraphrase("p15", "コーチの紹介動画", { target: "instructor" }),
  paraphrase("p16", "会員さんの体験談", { target: "member_story" }),
  paraphrase("p17", "館内の設備を見せたい", { target: "facility" }),
  paraphrase("p18", "未経験でも大丈夫と伝えたい", { target: "general_beginner" }),

  // --- 打ち消し表現 ---
  paraphrase("p19", "子ども向けではなく初心者女性向けにして", { target: "women_beginners" }),
  paraphrase("p20", "試合ではなく初心者向けの内容で", { target: "general_beginner" }),
  paraphrase("p21", "アニメではなく実写で撮影して", { content_mode: "live_action" }),

  // --- Objective の言い換えと CTA 承認 ---
  paraphrase("p22", "体験に来てもらいたい", { objective: "trial", cta_approval: true }),
  paraphrase("p23", "入会につなげたい", { objective: "enrollment", cta_approval: true }),
  paraphrase("p24", "公式ラインに登録してほしい", { objective: "line_add", cta_approval: true }),
  paraphrase("p25", "プロフィールへ飛んでほしい", { objective: "profile_visit", cta_approval: true }),
  paraphrase("p26", "もっと知ってほしいだけ", { objective: "awareness", cta_approval: false }),

  // --- 誤検知しないこと ---
  paraphrase("p27", "onlineで相談したい人向け", { objective: "line_add", platform: null }),
  paraphrase("p28", "9:16で作って", { duration: null, intent: "create" }),

  // --- Platform の言い換え ---
  paraphrase("p29", "TikTokにも出したい", { platform: "tiktok", intent: "repurpose" }),
  paraphrase("p30", "YouTubeショートにしたい", { platform: "youtube_shorts" }),
  paraphrase("p31", "ホームページのトップに置く動画", { platform: "website_hero" }),
  paraphrase("p32", "広告用に15秒で", { platform: "advertising", duration: 15 }),

  // --- 表記揺れ・全角・空白 ---
  paraphrase("p33", "３０秒でお願いします", { duration: 30 }),
  paraphrase("p34", "  この  写真  を  動かして  ", { intent: "animate" }, [ADULT_GYM_PHOTO]),
  paraphrase("p35", "ＩＮＳＴＡＧＲＡＭ用のリール", { platform: "instagram_reel" }),
  paraphrase("p36", "1分にまとめて", { duration: 60 }),

  // --- Intent の言い換え ---
  paraphrase("p37", "アニメで動かしたい", { intent: "animate", content_mode: "animation" }),
  paraphrase("p38", "なぜ伸びたのか知りたい", { intent: "analyze" }),
  paraphrase("p39", "A/Bで試したい", { intent: "experiment" }),
  paraphrase("p40", "大会の告知を出したい", {
    intent: "announce",
    objective: "event",
    clarification: true,
  }),

  // --- 推定を残すこと ---
  paraphrase("p41", "これいい感じにして", { assumption_field: "target_primary" }),
  paraphrase("p42", "この写真を動かして", { assumption_field: "platforms", platform: null }, [
    ADULT_GYM_PHOTO,
  ]),
]);

export const ALL_FIXTURES: readonly CreativeInput[] = Object.freeze([
  AT001_WOMEN_REEL,
  AT002_KIDS_ANIME,
  AT003_COMPETITION_COOL,
  AT004_PARENT_AND_CHILD,
  AT005_SENIOR,
  AT006_WEBSITE_HERO,
  AT007_INSTAGRAM_DEFAULT,
  AT008_MINIMAL_AMBIGUOUS,
  AT009_EVENT_FACTS_MISSING,
  AT025_MINOR_CONSENT,
  AT046_OWNER_MINIMAL_WORK,
  AMBIGUOUS_PERSON,
  HINT_OVERRIDES_TEXT,
  FORBIDDEN_EMOTION_REQUEST,
  MEDICAL_CLAIM_REQUEST,
  DURATION_WITH_PLATFORM,
  DURATION_INVALID_ZERO,
  DURATION_INVALID_TOO_LONG,
  DURATION_INVALID_DECIMAL,
  DURATION_MIXED_UNITS,
  DURATION_IN_MINUTES,
  DURATION_HINT_OVERRIDES_TEXT,
  ...PARAPHRASE_CASES.map(c => c.input),
]);
