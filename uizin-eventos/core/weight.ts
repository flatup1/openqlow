/**
 * 契約体重（両者のうち重い方）と、体重差を出す（純関数）。
 *
 * 赤と青で体重が違うとき、重い方に合わせた値を「契約体重」として掲示する。
 * 差そのものも出す。差が大きい試合は、当日その場で確認できるようにしたいため。
 *
 * 進行表の体重欄は人が手で書くので、書き方が揃わない:
 *   「16.5 kg」「16.5kg」「16.5」「16.5 kg kg」（実データにあった重複表記）
 * どれも同じ意味として読む。読めないものは null にして、掲示そのものを出さない
 * （間違った契約体重を出すくらいなら、出さない方が安全）。
 */

/** 「16.5 kg」などから数値を取り出す。読めなければ null */
export function parseWeightKg(text: string): number | null {
  const s = String(text ?? '').normalize('NFKC').trim();
  if (s === '') return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  // 人の体重としてありえない値は読み違いとみなす（g や lb の混入など）
  if (n < 10 || n > 200) return null;
  return n;
}

/** 掲示用の文字列。小数第1位まで（20 → 20.0kg） */
export function formatKg(n: number): string {
  return n.toFixed(1) + 'kg';
}

export type MatchWeights = {
  /** 赤の体重 */
  red: number;
  /** 青の体重 */
  blue: number;
  /** 契約体重。重い方に合わせる */
  contract: number;
  /** 体重差（絶対値） */
  diff: number;
};

/**
 * 両者の体重から契約体重と差を出す。
 * どちらか一方でも読めなければ null（片方だけの契約体重は意味がないため）。
 */
export function matchWeights(redText: string, blueText: string): MatchWeights | null {
  const red = parseWeightKg(redText);
  const blue = parseWeightKg(blueText);
  if (red === null || blue === null) return null;
  return {
    red,
    blue,
    contract: Math.max(red, blue),
    diff: Math.abs(red - blue),
  };
}
