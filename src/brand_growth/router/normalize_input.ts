// Brand Growth Phase 1 Router: 入力の正規化。
//
// 日本語の一行入力は、全角/半角・記号・空白の揺れが大きい。
// 判定前に形をそろえて、同じ意味の入力が同じ結果になるようにする（決定性）。
// 元の raw_text は必ず保持し、上書きしない。

import type { CreativeInput } from "../contracts/creative_input.js";

export interface NormalizedInput {
  /** 元の入力そのまま。 */
  readonly raw_text: string;
  /** NFKC 正規化＋記号統一＋空白を1つに畳んだもの。単位の語境界が必要な判定はこれを使う。 */
  readonly text: string;
  /** text を小文字化したもの。語境界を保ったまま Instagram / instagram の揺れを吸収する。 */
  readonly text_lower: string;
  /** text から空白を抜いて小文字化したもの。日本語の分かち書き揺れに強い。 */
  readonly compact_lower: string;
}

/**
 * 文字列を判定しやすい形へそろえる。
 *
 * ダッシュ類は "-" に統一するが、長音符「ー」は絶対に置き換えない。
 * 「リール」「ショート」「トレーナー」のように、長音符は日本語の語そのものだからである。
 * （置き換えると「リ-ル」になり、語が一致しなくなる）
 */
export function normalizeText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[−―‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeInput(input: CreativeInput): NormalizedInput {
  const text = normalizeText(input.raw_text);
  const textLower = text.toLowerCase();
  return {
    raw_text: input.raw_text,
    text,
    text_lower: textLower,
    compact_lower: textLower.replace(/\s+/g, ""),
  };
}

/**
 * 正規化済みテキストのどこかに当たるか。
 * 照合先は小文字化済みなので、判定パターンは必ず小文字で書く。
 */
export function matches(normalized: NormalizedInput, pattern: RegExp): boolean {
  return pattern.test(normalized.compact_lower);
}
