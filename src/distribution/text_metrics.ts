// ─────────────────────────────────────────────────────────────────────────
// EXPERIMENTAL SPIKE (2026-06) — distribution スパイク共有のテキスト計量ヘルパー
//
// craft_score.ts（採点）と expand_scored.ts（修復ループ）が同じ「重み付き長さ」基準で
// X の長さを判定する必要があるため、両者の単一の真実をここに置く。
// 依存ゼロ・純関数。distribution スパイク群を撤去する際に一緒に消せる。
// ─────────────────────────────────────────────────────────────────────────

/** X の重み付き長さ上限（CJK=2 換算で約140文字相当）。 */
export const X_WEIGHTED_LIMIT = 280;

// CJK（ひらがな/カタカナ/漢字/全角記号）を2、それ以外を1として数える近似。
const CJK = /[　-ヿ㐀-鿿＀-￯]/;

/** 全角を含むおおまかな表示長。X は CJK を重く数えるため CJK=2 で近似。 */
export function weightedLength(text: string): number {
  let len = 0;
  for (const ch of text) {
    len += CJK.test(ch) ? 2 : 1;
  }
  return len;
}
