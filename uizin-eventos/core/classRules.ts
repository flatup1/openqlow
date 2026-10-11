import type { LocalFighter } from './privateTournament.ts';

/**
 * クラス分け（A／Bクラスなど）の純粋なルール。
 * 戦績の文字から「勝った数」だけを読み、目安のクラスを出す。目安であって、止めることには使わない。
 */

export type ClassSide = { name: string; condition: string; rule: string };
export type ClassSettings = { enabled: boolean; upper: ClassSide; lower: ClassSide; upperMinWins: number };

/** Googleのシート「設定」タブの初期値と同じ（テストで一致を確認する）。 */
export const DEFAULT_CLASS_SETTINGS: ClassSettings = {
  enabled: true,
  upper: { name: 'Aクラス', condition: '3勝以上（例：3勝0敗、4勝、5勝2敗）', rule: '首相撲あり／膝蹴りあり／蹴り足キャッチ（ワンアタック＝蹴り足をキャッチしたあと、1回だけ攻撃してよい）' },
  lower: { name: 'Bクラス', condition: 'アマチュア。2勝以下（例：初出場、2勝1敗、1勝3敗）', rule: 'パンチとキックのみ' },
  upperMinWins: 3,
};

export const CLASS_LIMITS = { name: 12, condition: 60, rule: 80, label: 40 } as const;

export const CLASS_NEUTRAL_NOTE = '戦績から、クラスの目安は出せませんでした。条件を読んで、選んでください。';

const KANJI_DIGITS: Record<string, number> = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };

/** 「三」「十二」「二十」「九十九」などを数字にする。読めなければ null。 */
function kanjiToNumber(text: string): number | null {
  const parts = text.split('十');
  if (parts.length > 2) return null;
  const digit = (part: string): number | null => {
    if (part.length === 0) return null;
    let n = 0;
    for (const ch of part) {
      if (!(ch in KANJI_DIGITS)) return null;
      n = n * 10 + KANJI_DIGITS[ch];
    }
    return n;
  };
  if (parts.length === 1) return digit(text);
  const [before, after] = parts;
  let tens = 1;
  if (before !== '') {
    const t = digit(before);
    if (t === null || t > 9 || before.length !== 1) return null;
    tens = t;
  }
  let ones = 0;
  if (after !== '') {
    const o = digit(after);
    if (o === null || o > 9 || after.length !== 1) return null;
    ones = o;
  }
  return tens * 10 + ones;
}

const ZERO_WORDS = new Set(['初試合', '初出場', '初参戦', '初めて', 'はじめて', '初', '未経験', '経験なし', '経験無し', '戦績なし', '戦績無し', 'なし', '無し', 'ゼロ', 'デビュー前', '試合経験なし']);

/** 戦績の文字から「勝った数」を読む。決められないときは null（目安を出さない）。 */
export function parseWins(record: string): number | null {
  if (typeof record !== 'string') return null;
  // 0) 文字をそろえる
  let s = record.normalize('NFKC').toLowerCase().replace(/[ー‐‑–—−―]/g, '-').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  // 1) 漢数字（「勝」の直前だけ）
  s = s.replace(/[〇零一二三四五六七八九十]+(?=勝)/g, (m) => {
    const n = kanjiToNumber(m);
    return n === null ? m : String(n);
  });
  // 2) 範囲（2〜3勝、2-3勝、2か3勝）は決められない
  if (/\d+\s*勝?\s*(?:~|〜|から|or|か|-)\s*\d+\s*勝/.test(s)) return null;
  // 3) 「◯勝」「◯w」
  const found: number[] = [];
  for (const m of s.matchAll(/(\d+)\s*勝/g)) found.push(Number(m[1]));
  for (const m of s.matchAll(/(\d+)\s*(?:wins|win|w)(?![a-z])/g)) found.push(Number(m[1]));
  let wins: number | null = null;
  if (found.length) {
    if (found.some((n) => n !== found[0])) return null;
    wins = found[0];
  } else {
    // 4) 3-1 / 3-1-0 の形（先頭が勝ち）
    const h = s.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
    if (h) wins = Number(h[1]);
    else if (!/\d/.test(s)) {
      // 5) 「初出場」「未経験」など
      const t = s.replace(/(?:です|でした|予定|[。.!\s])+$/, '');
      if (ZERO_WORDS.has(t) || /(?:未経験|経験なし|経験無し|試合なし)$/.test(t)) wins = 0;
    } else if (/^0+(?:戦|試合)?$/.test(s)) wins = 0;
  }
  // 6)・7) それ以外・大きすぎる数は読まない
  if (wins === null || !Number.isInteger(wins) || wins < 0 || wins > 99) return null;
  return wins;
}

const same = (a: string, b: string) => a.normalize('NFKC').trim().toLowerCase() === b.normalize('NFKC').trim().toLowerCase();

export function suggestClass(record: string, s: ClassSettings): { name: string; wins: number } | null {
  if (!s.enabled) return null;
  const wins = parseWins(record);
  if (wins === null) return null;
  return { name: wins >= s.upperMinWins ? s.upper.name : s.lower.name, wins };
}

/** 選んだクラス名を、設定の2つの名前のどちらかにそろえる。どちらでもなければ ''。 */
export function normalizeClass(value: string, s: ClassSettings): string {
  if (!s.enabled || typeof value !== 'string') return '';
  if (same(value, s.upper.name)) return s.upper.name;
  if (same(value, s.lower.name)) return s.lower.name;
  return '';
}

export function classKey(name: string, s: ClassSettings): 'upper' | 'lower' | '' {
  const n = normalizeClass(name, s);
  if (!n) return '';
  return n === s.upper.name ? 'upper' : 'lower';
}

/** 戦績の目安と、選んだクラスがちがうときの、やさしい一文。合っている・決められないときは ''。 */
export function classMismatch(record: string, chosen: string, s: ClassSettings): string {
  const picked = normalizeClass(chosen, s);
  if (!picked) return '';
  const sg = suggestClass(record, s);
  if (!sg || sg.name === picked) return '';
  return '戦績と合っていますか？ 戦績は' + sg.wins + '勝で、目安は' + sg.name + 'です。';
}

export function suggestText(name: string): string {
  return '戦績からは、' + name + 'です';
}

/** CSV・取り込み用。制御文字を消し、40文字まで。 */
export function cleanClassLabel(value: string): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, CLASS_LIMITS.label);
}

/** 赤と青のクラスがちがうときの注意（先頭の ⚠ は画面側で付ける）。どちらかが空なら ''。 */
export function boutClassWarning(red?: LocalFighter, blue?: LocalFighter): string {
  const r = (red?.fighterClass ?? '').trim();
  const b = (blue?.fighterClass ?? '').trim();
  if (!r || !b || same(r, b)) return '';
  return 'クラスがちがいます（赤：' + r + '／青：' + b + '）。ルールがちがうので、組み合わせを確かめてください。';
}

/** 信用できない入れ物（ping・URLのハッシュ）から、正しいクラス設定だけを取り出す。投げない。 */
export function parseClassSettings(value: unknown): ClassSettings | undefined {
  try {
    if (!value || typeof value !== 'object') return undefined;
    const v = value as Record<string, unknown>;
    if (v.enabled !== true) return undefined;
    const clean = (x: unknown) => (typeof x === 'string' ? x.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : null);
    const side = (x: unknown): ClassSide | undefined => {
      if (!x || typeof x !== 'object') return undefined;
      const o = x as Record<string, unknown>;
      const name = clean(o.name), condition = clean(o.condition), rule = clean(o.rule);
      if (name === null || condition === null || rule === null) return undefined;
      if (name.length < 1 || name.length > CLASS_LIMITS.name) return undefined;
      if (condition.length < 1 || condition.length > CLASS_LIMITS.condition) return undefined;
      if (rule.length < 1 || rule.length > CLASS_LIMITS.rule) return undefined;
      return { name, condition, rule };
    };
    const upper = side(v.upper), lower = side(v.lower);
    if (!upper || !lower || same(upper.name, lower.name)) return undefined;
    const wins = v.upperMinWins;
    if (typeof wins !== 'number' || !Number.isInteger(wins) || wins < 1 || wins > 99) return undefined;
    return { enabled: true, upper, lower, upperMinWins: wins };
  } catch {
    return undefined;
  }
}
