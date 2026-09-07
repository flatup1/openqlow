// Brand Growth Phase 1 Router: 誰に向けるか（Target）を決める。
//
// 参照: TARGET_ROUTER_SPEC §2 §4、CLAUDE_CODE_IMPLEMENTATION_SPEC §6。
// 大事な原則:
//   1. 明示ヒント > 本文の明示語 > 素材メタデータ > 既定。低い方が高い方を上書きしない。
//   2. 人物の見た目だけで決めつけない。写真に女性が写っているだけで女性向けにしない。
//   3. target_primary は必ず埋める。分からないまま先へ進めない。
//   4. 「子ども向けではなく初心者女性向け」のような打ち消しに引っかからない（lexicon が処理）。
//
// 並び順が優先度。人の属性を先に、コンテンツの種類（施設など）を後に置く。
// 施設語は「誰に向けるか」より弱い手掛かりなので重みを 0.5 にする。

import type { CreativeInput } from "../contracts/creative_input.js";
import type { Classified, TargetPrimary } from "../contracts/route_decision.js";
import { confidenceFromMatch, scoreLexicon, type Phrase } from "./lexicon.js";
import type { NormalizedInput } from "./normalize_input.js";

const TARGET_PHRASES: readonly Phrase<TargetPrimary>[] = [
  // 親子（「子ども」より先に置く）
  { value: "kids_parents", phrase: "親子", weight: 2 },
  { value: "kids_parents", phrase: "ママと子" },
  { value: "kids_parents", phrase: "パパと子" },
  { value: "kids_parents", phrase: "親子で" },
  { value: "kids_parents", phrase: "子どもと一緒に" },
  // 子ども
  { value: "kids", phrase: "子ども" },
  { value: "kids", phrase: "子供" },
  { value: "kids", phrase: "こども" },
  { value: "kids", phrase: "キッズ" },
  { value: "kids", phrase: "kids" },
  { value: "kids", phrase: "小学生" },
  { value: "kids", phrase: "園児" },
  { value: "kids", phrase: "幼児" },
  { value: "kids", phrase: "児童" },
  // 保護者
  { value: "parents", phrase: "保護者" },
  { value: "parents", phrase: "親御さん" },
  { value: "parents", phrase: "ママ向け" },
  { value: "parents", phrase: "パパ向け" },
  // 女性（年代つきを先に）
  { value: "women_30_40", phrase: "30代女性", weight: 2 },
  { value: "women_30_40", phrase: "40代女性", weight: 2 },
  { value: "women_30_40", phrase: "アラフォー", weight: 2 },
  { value: "women_beginners", phrase: "女性" },
  { value: "women_beginners", phrase: "レディース" },
  { value: "women_beginners", phrase: "ladies" },
  { value: "women_beginners", phrase: "女子" },
  // 男性
  { value: "inactive_men", phrase: "運動不足の男性", weight: 2 },
  { value: "inactive_men", phrase: "運動不足のお父さん", weight: 2 },
  { value: "inactive_men", phrase: "体力が落ちた", weight: 2 },
  { value: "inactive_men", phrase: "運動不足" },
  { value: "men_beginners", phrase: "男性初心者", weight: 2 },
  { value: "men_beginners", phrase: "男性向け" },
  { value: "men_beginners", phrase: "お父さん向け" },
  { value: "men_beginners", phrase: "男性" },
  // シニア
  { value: "senior", phrase: "シニア" },
  { value: "senior", phrase: "高齢" },
  { value: "senior", phrase: "60代" },
  { value: "senior", phrase: "70代" },
  { value: "senior", phrase: "年配" },
  // 家族
  { value: "family", phrase: "家族" },
  { value: "family", phrase: "ファミリー" },
  // 格闘
  { value: "sparring_fans", phrase: "スパー" },
  { value: "sparring_fans", phrase: "スパーリング" },
  { value: "sparring_fans", phrase: "格闘技好き" },
  { value: "competition", phrase: "試合" },
  { value: "competition", phrase: "大会" },
  { value: "competition", phrase: "勝負" },
  { value: "competition", phrase: "トーナメント" },
  { value: "competition", phrase: "選手" },
  // 人・物語
  { value: "instructor", phrase: "コーチ" },
  { value: "instructor", phrase: "インストラクター" },
  { value: "instructor", phrase: "トレーナー" },
  { value: "instructor", phrase: "先生" },
  { value: "member_story", phrase: "会員さん" },
  { value: "member_story", phrase: "メンバーの声" },
  { value: "member_story", phrase: "体験談" },
  // 施設（誰に向けるかの手掛かりとしては弱い）
  { value: "facility", phrase: "ジム内", weight: 0.5 },
  { value: "facility", phrase: "施設", weight: 0.5 },
  { value: "facility", phrase: "設備", weight: 0.5 },
  { value: "facility", phrase: "館内", weight: 0.5 },
  { value: "facility", phrase: "店内", weight: 0.5 },
  { value: "facility", phrase: "ジム写真", weight: 0.5 },
  { value: "facility", phrase: "ジムの写真", weight: 0.5 },
  // 初心者一般
  { value: "general_beginner", phrase: "初心者" },
  { value: "general_beginner", phrase: "未経験" },
  { value: "general_beginner", phrase: "運動が苦手" },
  { value: "general_beginner", phrase: "はじめての" },
  { value: "general_beginner", phrase: "初めての" },
];

/** 主 Target に対して自然に付く副 Target。二層設計（子ども＋親）の入口。 */
const SECONDARY: Partial<Record<TargetPrimary, TargetPrimary>> = {
  kids: "parents",
  kids_parents: "kids",
  family: "parents",
  competition: "sparring_fans",
};

export interface TargetResult {
  readonly primary: Classified<TargetPrimary>;
  readonly secondary: TargetPrimary | null;
}

function withSecondary(primary: Classified<TargetPrimary>): TargetResult {
  return { primary, secondary: SECONDARY[primary.value] ?? null };
}

/**
 * 素材メタデータからの推定。
 * 見た目の属性ではなく「何の素材か」だけを使う。人物属性で決めつけないため。
 */
function fromAssets(input: CreativeInput): Classified<TargetPrimary> | null {
  let characterSheet = false;
  let minor = false;
  let person = false;
  let facilityShot = false;

  for (const a of input.assets) {
    if (a.media_type === "character_sheet" || a.source_type === "character_sheet") characterSheet = true;
    if (a.contains_minor) minor = true;
    if (a.contains_person) person = true;
    if (a.source_type === "facility_photo" || a.source_type === "gym_photo") facilityShot = true;
  }

  if (characterSheet) return { value: "kids", confidence: 0.6, source: "asset_metadata" };
  if (minor) return { value: "kids", confidence: 0.7, source: "asset_metadata" };
  // 大人が写っている、それ以上は分からない。初心者向けとして扱い、推定である旨を残す。
  if (person) return { value: "general_beginner", confidence: 0.55, source: "asset_metadata" };
  if (facilityShot) return { value: "facility", confidence: 0.55, source: "asset_metadata" };
  return null;
}

export function classifyTarget(input: CreativeInput, normalized: NormalizedInput): TargetResult {
  const hint = input.target_hint;
  if (hint) {
    return withSecondary({ value: hint, confidence: 0.95, source: "explicit_hint" });
  }

  const match = scoreLexicon(TARGET_PHRASES, normalized);
  if (match) {
    return withSecondary({
      value: match.value,
      confidence: confidenceFromMatch(match),
      source: "explicit_text",
    });
  }

  const fromAsset = fromAssets(input);
  if (fromAsset) {
    return withSecondary(fromAsset);
  }

  // 最後の受け皿。ここに来た時点で confidence は低く、必ず assumption に残す。
  return withSecondary({ value: "general_beginner", confidence: 0.4, source: "default" });
}
