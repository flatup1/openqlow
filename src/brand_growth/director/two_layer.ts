// Brand Growth Phase 3 Director: 子ども向けの二層設計。
//
// 見るのは子ども、決めるのは親。だから層を分ける。
//   表側（child_surface）: 子どもが見て楽しい。難しい言葉を使わない。
//   奥（parent_deep_layer）: 親が受け取る安心・成長・指導の質。
//
// してはいけないこと:
//   親へ向けた言葉を、子どもの台詞や表側の演出へ詰め込む。
//   子どもが「安心して通わせられます」とは言わない。

import type { TwoLayer } from "../contracts/creative_brief.js";
import type { TargetPrimary } from "../contracts/route_decision.js";

/** 二層が必須の Target。 */
export function requiresTwoLayer(target: TargetPrimary): boolean {
  return target === "kids" || target === "kids_parents";
}

/** 子どもの層に混ぜてはいけない、親向けの語。 */
const PARENT_ONLY_WORDS: readonly string[] = [
  "保護者",
  "月謝",
  "料金",
  "入会",
  "安心して通わせ",
  "送迎",
  "教育方針",
  "指導方針",
];

export function twoLayerFor(target: TargetPrimary): TwoLayer | null {
  if (!requiresTwoLayer(target)) return null;

  if (target === "kids") {
    return {
      child_surface: "できた瞬間がうれしい。自分の力で動けるのが楽しい",
      parent_deep_layer: "目線を合わせた指導、順番を待てる空気、けがをさせない配慮が見える",
    };
  }

  return {
    child_surface: "おうちの人と一緒だから、はじめての場所でも楽しい",
    parent_deep_layer: "親子で同じ体験を共有でき、子どもの変化をその場で見られる",
  };
}

/** 子どもの層に親向けの言葉が混ざっていないか。 */
export function childSurfaceIsClean(layer: TwoLayer): boolean {
  return !PARENT_ONLY_WORDS.some(word => layer.child_surface.includes(word));
}
