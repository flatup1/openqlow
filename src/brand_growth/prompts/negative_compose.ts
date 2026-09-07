// Brand Growth Phase 3: 避けたいものを、必要な分類だけ選ぶ。
//
// 参照: PROMPT_BIBLE、ACCEPTANCE_TESTS AT-011。
//
// 考え方:
//   巨大な1本の文字列にしない。分類ごとの配列にして、必要な分類だけ付ける。
//   人が写っていない施設の映像に「指の本数」の注意を付けても意味がなく、
//   かえって生成を乱すため、identity と anatomy は入れない。

import type { ContentMode, TargetPrimary } from "../contracts/route_decision.js";
import type { NegativeBlock, NegativeCategory } from "./prompt_ir.js";

/** 分類ごとの中身。Provider 固有の記法は使わない。 */
const RULES: Record<NegativeCategory, readonly string[]> = {
  identity: [
    "different face from the reference",
    "face morphing between frames",
    "changed apparent age",
    "changed hair style or hair color",
    "changed body type",
    "changed clothing or gloves",
    "added or removed people",
  ],
  character_consistency: [
    "changed silhouette",
    "changed color palette",
    "changed costume details",
    "changed proportions between shots",
    "resemblance to any existing published character",
  ],
  anatomy: [
    "extra fingers or limbs",
    "fused or missing joints",
    "impossible joint rotation",
    "distorted proportions",
  ],
  motion: [
    "physically impossible movement",
    "floating or sliding feet",
    "more than one primary action in the clip",
    "unnatural acceleration",
  ],
  temporal: [
    "flicker between frames",
    "identity drift over time",
    "objects popping in or out",
    "lighting that changes without reason",
  ],
  environment: [
    "room layout that changes mid clip",
    "equipment appearing or disappearing",
    "generated text or signage",
    "invented logos",
  ],
  brand: [
    "fear or intimidation",
    "blood or visible injury",
    "pain or suffering as the subject",
    "humiliation or mockery",
    "body shaming",
    "urgency or pressure to act",
  ],
};

export interface NegativeSelectionInput {
  readonly content_mode: ContentMode;
  readonly target: TargetPrimary;
  /** 実在の人物が写った参照素材があるか。 */
  readonly has_person_reference: boolean;
  /** 承認済みオリジナルキャラクターを使うか。 */
  readonly has_character_reference: boolean;
  /** 人物が登場しない施設の画か。 */
  readonly is_empty_facility: boolean;
  /** 静止画として出すか。 */
  readonly is_still_image: boolean;
}

/**
 * 必要な分類だけを決める。
 * 迷ったら足すのではなく、その画に意味がある分類だけを選ぶ。
 */
export function selectNegativeCategories(input: NegativeSelectionInput): readonly NegativeCategory[] {
  const isCombat = input.target === "competition" || input.target === "sparring_fans";

  // 人物のいない施設: 時間・環境・ブランドだけ。人の身体の注意は付けない。
  if (input.is_empty_facility) {
    return Object.freeze(["temporal", "environment", "brand"] as NegativeCategory[]);
  }

  // オリジナルキャラクターのアニメーション: 同一性は identity ではなく character_consistency。
  if (input.has_character_reference || input.content_mode === "animation") {
    return Object.freeze([
      "character_consistency",
      "anatomy",
      "motion",
      "temporal",
      "environment",
      "brand",
    ] as NegativeCategory[]);
  }

  // 静止画: 時間と動きの注意は不要。
  if (input.is_still_image) {
    return Object.freeze(["identity", "anatomy", "environment", "brand"] as NegativeCategory[]);
  }

  // 試合・スパー: 動きの質が中心。参照人物がいれば同一性も守る。
  if (isCombat) {
    const combat: NegativeCategory[] = ["anatomy", "motion", "temporal", "environment", "brand"];
    if (input.has_person_reference) combat.unshift("identity");
    return Object.freeze(combat);
  }

  // 実在の人物を動かす: 6分類すべて。
  if (input.has_person_reference) {
    return Object.freeze([
      "identity",
      "anatomy",
      "motion",
      "temporal",
      "environment",
      "brand",
    ] as NegativeCategory[]);
  }

  // 人物参照が無い生成: 身体と動きの破綻、時間、環境、ブランドを見る。
  return Object.freeze(["anatomy", "motion", "temporal", "environment", "brand"] as NegativeCategory[]);
}

/** 分類を中身つきの塊にする。 */
export function composeNegatives(categories: readonly NegativeCategory[]): readonly NegativeBlock[] {
  return Object.freeze(
    categories.map(category => Object.freeze({ category, rules: Object.freeze([...RULES[category]]) })),
  );
}

/** 実在の人物を動かすときに守るもの。 */
export function subjectPreservationFor(input: NegativeSelectionInput): readonly string[] {
  if (input.is_empty_facility) {
    return Object.freeze([
      "keep the room layout unchanged",
      "keep equipment placement unchanged",
      "keep lighting consistent across the clip",
    ]);
  }

  if (input.has_character_reference || input.content_mode === "animation") {
    return Object.freeze([
      "keep the original silhouette",
      "keep the original color palette",
      "keep the original costume",
      "keep the original proportions",
      "keep the number of characters unchanged",
    ]);
  }

  if (!input.has_person_reference) {
    return Object.freeze(["keep the gym environment believable", "keep one primary action"]);
  }

  return Object.freeze([
    "keep the same face",
    "keep the same apparent age",
    "keep the same hair",
    "keep the same body type",
    "keep the same clothing",
    "keep the same gloves",
    "keep the same number of people",
    "keep the same gym background",
    "keep existing logos unchanged",
    "keep temporal consistency across frames",
    "allow natural breathing and eye movement",
    "keep believable weight transfer",
    "perform exactly one action",
  ]);
}
