// Brand Growth Phase 3: 固有のスタジオ名・作家名への依存を止める。
//
// 方針:
//   「〇〇風」「style of 〇〇」のような固有名への依存を検知したら、
//   **その名前をどこにも残さずに** 見た目の特徴へ言い換える。
//
// 重要:
//   検知した固有名は返り値にもログにも assumption にも保存しない。
//   件数だけを数える。名前を持ち回った時点で流出の経路になるため。

import type { EmotionalGoal } from "../contracts/route_decision.js";

/** 一般的な様式であって固有名ではない語。これらは言い換えの対象にしない。 */
const GENERIC_STYLE_WORDS: readonly string[] = [
  "和風",
  "洋風",
  "昭和風",
  "レトロ風",
  "アニメ風",
  "実写風",
  "ドキュメンタリー風",
  "手描き風",
  "水彩風",
];

/** 「〇〇風」の直前に来る固有名らしい並び（カタカナ/ラテン文字が2文字以上）。 */
const JA_STYLE_PATTERN = /([ァ-ーA-Za-z][ァ-ーA-Za-z・\s]{1,24})風/g;
const EN_STYLE_PATTERN = /\b(?:in the )?style of\s+[A-Za-z][A-Za-z.\s'-]{1,30}/gi;
const STUDIO_PATTERN = /\bstudio\s+[A-Za-z][A-Za-z'-]{1,20}/gi;

export interface StyleGuardResult {
  /** 固有名への依存を見つけたか。 */
  readonly flagged: boolean;
  /** 取り除いた参照の件数。名前そのものは保存しない。 */
  readonly removed_reference_count: number;
  /** 名前の代わりに使う、見た目の言葉。 */
  readonly visual_attributes: readonly string[];
}

/** 感情から導く、固有名に頼らない見た目の言葉。 */
function attributesFor(goal: EmotionalGoal): readonly string[] {
  switch (goal) {
    case "safety":
      return ["やわらかい拡散光", "彩度は控えめ", "輪郭は硬くしない", "余白を広めに取る"];
    case "fun":
      return ["明るい昼光", "彩度はやや高め", "動きの輪郭をはっきり", "軽いテンポ"];
    case "aspiration":
      return ["コントラスト強め", "陰影をはっきり", "被写体を中央に置く", "落ち着いた色温度"];
    case "trust":
      return ["均一な明るさ", "自然な肌の色", "水平を保つ", "誇張しない"];
    case "confidence":
      return ["やわらかい順光", "影を濃くしない", "安定した構図"];
    case "permission":
      return ["自然光", "特別感を作りすぎない", "日常の質感"];
    case "belonging":
      return ["あたたかい色温度", "複数の人が同じ画に収まる構図"];
    case "empathy":
      return ["浅い被写界深度", "表情に寄る", "静かな明るさ"];
    default:
      return ["自然光", "誇張しない色"];
  }
}

function countMatches(text: string, pattern: RegExp): number {
  const copy = new RegExp(pattern.source, pattern.flags);
  let count = 0;
  for (;;) {
    const found = copy.exec(text);
    if (found === null) break;
    // 一般的な様式語は固有名ではないので数えない。
    const matchedText = found[0];
    if (GENERIC_STYLE_WORDS.some(word => matchedText.includes(word))) continue;
    count += 1;
    if (copy.lastIndex === found.index) copy.lastIndex += 1;
  }
  return count;
}

/**
 * 依頼文を検査する。
 * 名前は返さない。件数と、代わりに使う見た目の言葉だけを返す。
 */
export function guardStyleNames(rawText: string, goal: EmotionalGoal): StyleGuardResult {
  const count =
    countMatches(rawText, JA_STYLE_PATTERN) +
    countMatches(rawText, EN_STYLE_PATTERN) +
    countMatches(rawText, STUDIO_PATTERN);

  if (count === 0) {
    return Object.freeze({ flagged: false, removed_reference_count: 0, visual_attributes: Object.freeze([]) });
  }

  return Object.freeze({
    flagged: true,
    removed_reference_count: count,
    visual_attributes: Object.freeze([...attributesFor(goal)]),
  });
}

/**
 * 出力物に固有名が残っていないかの最終確認。
 * 「風」「style of」「studio」の並びが残っていたら false。
 */
export function isFreeOfStyleNames(text: string): boolean {
  return (
    countMatches(text, JA_STYLE_PATTERN) === 0 &&
    countMatches(text, EN_STYLE_PATTERN) === 0 &&
    countMatches(text, STUDIO_PATTERN) === 0
  );
}
