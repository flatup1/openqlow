import { stripInvisibleChars } from './csv.ts';
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
  upper: { name: 'Aクラス', condition: '3勝以上（3勝以下でも、会長・指導者の許可があればAクラスに出られます）', rule: '首相撲5秒／蹴り足キャッチはワンアタック（キャッチ後に1回だけ攻撃できる）／ワンマッチは顔面への膝蹴り禁止' },
  lower: { name: 'Bクラス', condition: 'アマチュア。2勝以下（例：初出場、2勝1敗、1勝3敗）', rule: '首相撲なし／蹴り足キャッチなし／膝蹴りなし／回転技なし' },
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

/** 長音「ー」は、読む前に「-」にそろえられる。だから、ことばのほうも同じにそろえる */
const ZERO_WORDS = new Set([
  '初試合', '初出場', '初参戦', '初めて', 'はじめて', '初', '未経験', '経験なし', '経験無し', '戦績なし', '戦績無し', 'なし', '無し', 'ナシ', 'ゼロ', 'ぜろ', 'デビュー前', '試合経験なし',
  '特になし', '特に無し', '特にありません', 'ありません', 'ないです', 'ない', '無い', '試合経験ありません', '試合経験はありません', '試合経験なし', '出場なし', '出場無し', '出場経験なし', '出場経験ありません',
  '初戦', '初心者', 'デビュー戦', '試合に出たことがない', '試合に出たことがありません', '出たことがない', '出たことがありません', '試合に出たことない', '試合経験ない', '試合経験がない', '試合経験が無い',
  '初陣', '大会初参加', '初参加', '零', '〇', '試合は初', '試合は初めて', 'これまで試合はありません', 'これまでありません', 'まだありません', 'まだ無し', 'まだなし', 'まだない', '試合したことない',
].map((word) => word.replace(/ー/g, '-')));
/** 文のどこにあっても「勝ちが0」と読める言い方（「勝」の数や「3-1」の形が無いときだけ使う） */
const ZERO_ANYWHERE = /初出場|初試合|初参戦|初めて|はじめて|未経験|未勝利|勝ちなし|勝ち無し|勝利なし|勝無し|経験なし|経験無し|戦績なし|戦績無し|デビュ[ー-]前|アマ初|アマチュア初|初戦|初心者|デビュ[ー-]戦|出たことがない|出たことがありません|出たことない|出場したことがない|出場したことがありません|試合経験(?:が)?(?:ありません|ない|無い)|出場経験(?:が)?(?:ありません|ない|無い|なし)|出場(?:なし|無し)|初陣|大会初参加|初参加|試合は初(?![-\d])|試合(?:を|は|に)?(?:した|やった|出た|出場した|経験した)?(?:こと|経験)?(?:が|は)?(?:ありません|ない|無い|なし|無し)/;
/** 「3勝まで」「3勝くらい」「3勝を目指します」のように、数のあとに「いまのぴったりの勝ち数ではない」ことばが付くとき（決めない） */
const LIMIT_AFTER = /^\s*(?:まで|くらい|ぐらい|程度|前後|ほど|あたり|近く|を目指|をめざ|を目標|を狙|を希望|予定|したい|になりたい)/;
/** 「3勝以上」「2勝以下」は読める。以上は『その数かそれより多い』、以下は『その数かそれより少ない』。ふつうの境目（3勝）をまたぐときは決めない */
const OR_MORE = /^\s*(?:以上|超|越え)/;
const OR_LESS = /^\s*(?:以下|未満)/;
/** 「初試合ではありません」のように、打ち消しているときは決めない */
const NEGATED = /ではな|じゃな|でない|ではあり/;
/** 「3勝したい」「目標3勝」は、いまの戦績ではない。0勝のことばと一緒でも決めない */
const GOAL = /目標|目指|めざ|したい|なりたい|予定|希望|狙|ねらい|目的|ゴール/;
/** 数字の範囲のあとに付くと「勝ち負け」ではなくなることば（週3-4回、3-4年、10-12歳 など） */
const RANGE_UNIT = /^\s*(?:年|歳|才|さい|回|級|日|月|週|時|分|秒|位|人|名|kg|cm|キロ|グラム|センチ|ヶ月|か月|カ月|ヵ月|ケ月|度|本|番|段|期|組|クラス|階級|点|頭|倍|%|キロ級|ラウンド|r(?![a-z])|ｒ)/;
/** 数字の範囲の前に付くと「勝ち負け」ではなくなることば（週3-4、第3-4、小3-4、歳…） */
const RANGE_BEFORE = /[週第小中高歳]$/;
/** 長すぎる戦績は読まない（サーバーの上限は300文字。長い数字の並びで画面が止まらないようにする） */
export const MAX_RECORD_CHARS = 400;

/** 戦績の文字から「勝った数」を読む。決められないときは null（目安を出さない）。 */
export function parseWins(record: string): number | null {
  if (typeof record !== 'string' || record.length > MAX_RECORD_CHARS) return null;
  // 0) 文字をそろえる
  let s = record.normalize('NFKC').toLowerCase().replace(/[ー‐‑–—−―]/g, '-').replace(/\s+/g, ' ').trim();
  if (!s || s.length > MAX_RECORD_CHARS * 3) return null;
  // 小数点つきの数（3.5勝）は、勝ちの数ではない。まちがった数を出すより、目安を出さない
  if (/\d\.\d/.test(s)) return null;
  // 4けた以上の数字（年・日づけ・長い数字の並び）は、勝ちの数ではない。1つの印にして、あとの検索が長くならないようにする
  const hadLong = /\d{4,}/.test(s);
  s = s.replace(/\d{4,}/g, 'N');
  // 1) 漢数字（「勝」の直前だけ）
  s = s.replace(/[〇零一二三四五六七八九十]+(?=勝)/g, (m) => {
    const n = kanjiToNumber(m);
    return n === null ? m : String(n);
  });
  // 2) 範囲（2〜3勝、2-3勝、2か3勝）は決められない
  if (/\d+\s*勝?\s*(?:~|〜|から|or|か|-)\s*\d+\s*勝/.test(s)) return null;
  // 3) 「◯勝」「◯w」
  const found: number[] = [];
  // 「3勝以上」「5勝以下」「3勝を目指します」は、いまの勝ち数ではない。まちがった目安を出すより、出さない
  const pushWins = (m: RegExpMatchArray): boolean => {
    const n = Number(m[1]), after = s.slice((m.index ?? 0) + m[0].length);
    if (LIMIT_AFTER.test(after)) return false;
    // 「5勝以下」「2勝以上」は、Aか Bか決まらない。「3勝以上」→ A、「2勝以下」→ B のように、決まるときだけ読む
    if (OR_MORE.test(after) && n < 3) return false;
    if (OR_LESS.test(after) && n > (/^\s*未満/.test(after) ? 3 : 2)) return false;
    found.push(OR_LESS.test(after) && /^\s*未満/.test(after) ? Math.max(0, n - 1) : n);
    return true;
  };
  for (const m of s.matchAll(/(\d+)\s*勝/g)) if (!pushWins(m)) return null;
  for (const m of s.matchAll(/(\d+)\s*(?:wins|win|w)(?![a-z])/g)) if (!pushWins(m)) return null;
  let wins: number | null = null;
  if (found.length) {
    if (found.some((n) => n !== found[0])) return null;
    wins = found[0];
    // 「初試合（目標3勝）」「初出場。3勝したい」のように、0勝のことばや、これからの話と一緒のときは決めない
    if (wins > 0 && ((ZERO_ANYWHERE.test(s) && !NEGATED.test(s)) || GOAL.test(s))) return null;
  } else {
    // 4) 3-1 / 3-1-0 の形（先頭が勝ち）。日づけ（2024-05-12）のように長い数字があるときは使わない。
    //    「週3-4回」「空手3-4年」「10-12歳」のように、あとに単位が付くものは、勝ち負けではない
    let hyphen: number | null = null;
    if (!hadLong) {
      for (const m of s.matchAll(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/g)) {
        const at = m.index ?? 0;
        const before = s.slice(0, at), after = s.slice(at + m[0].length);
        if (RANGE_BEFORE.test(before) || /\d$/.test(before) || /^[\d-]/.test(after) || RANGE_UNIT.test(after)) continue;
        hyphen = Number(m[1]);
        break;
      }
    }
    const lost = s.match(/(\d+)\s*戦\s*(\d+)\s*敗/);
    // 5) 「初出場」「未経験」など。「空手3年・初試合」のように年数の数字があってもよいが、試合の数（◯戦・◯試合・◯敗）があるときは決めない。
    //    「週3-4回練習」「空手3-4年」のような数は、試合の数ではないので、数えない
    const t = s.replace(/(?:です|でした|予定|[。.!！\s])+$/, '').replace(/^(?:戦績|経歴|戦歴|成績|試合経験)\s*[:：=＝\-]?\s*/, '').replace(/^[。.!！\s]+/, '');
    const noPractice = s.replace(/週\s*\d+\s*(?:-\s*\d+\s*)?回/g, ' ').replace(/\d+\s*-\s*\d+\s*(?:年|歳|才|さい|回|級|日|月|週|時|分|位|人|名|ヶ月|か月|カ月|ヵ月|ケ月|度)/g, ' ');
    const hasCount = /\d\s*(?:戦|試合|回|敗|分)/.test(noPractice);
    const zero = (!/\d/.test(s) && (ZERO_WORDS.has(t) || /(?:未経験|経験なし|経験無し|試合なし)$/.test(t))) || (ZERO_ANYWHERE.test(s) && !NEGATED.test(s) && !hasCount);
    if (hyphen !== null) {
      // 「初出場 3-1」のように、0勝のことばと数が食いちがうときは決めない
      wins = zero && hyphen > 0 ? null : hyphen;
    } else if (lost && Number(lost[1]) === Number(lost[2])) wins = 0; // 1戦1敗＝ぜんぶ負け
    else if (/^0+\s*(?:戦|試合)?$/.test(s)) wins = 0;
    else if (zero) wins = 0;
  }
  // 6)・7) それ以外・大きすぎる数は読まない
  if (wins === null || !Number.isInteger(wins) || wins < 0 || wins > 99) return null;
  return wins;
}

/** 比べるための印：見えない文字を取り、全角・半角と大文字・小文字と前後の空白のちがいを無くす */
const keyOf = (value: string): string => stripInvisibleChars(String(value ?? '')).normalize('NFKC').trim().toLowerCase();
const same = (a: string, b: string) => keyOf(a) === keyOf(b);

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

/** クラスの名前を、くらべるための印にする（全角・半角、大文字・小文字、前後の空白のちがいは同じ） */
export const classNameKey = (name: string): string => keyOf(name);

/**
 * 取り込んだファイルの「クラス」の文字を、設定の名前にそろえる。
 * 「Aクラス」「ａクラス」のほか、頭文字だけの「A」「B」（名前が A・B で始まるとき）と「上」「下」も読む。読めないものは、そのまま返す。
 */
export function normalizeClassLoose(value: string, s: ClassSettings): string {
  const exact = normalizeClass(value, s);
  if (exact) return exact;
  if (!s.enabled || typeof value !== 'string') return value;
  const v = classNameKey(value).replace(/\s+/g, '');
  const initial = (side: ClassSide) => classNameKey(side.name).slice(0, 1);
  if (v.length === 1 && /[a-z]/.test(v)) {
    if (v === initial(s.upper) && v !== initial(s.lower)) return s.upper.name;
    if (v === initial(s.lower) && v !== initial(s.upper)) return s.lower.name;
  }
  if (['上', '上位', '上のクラス', '上級'].includes(v)) return s.upper.name;
  if (['下', '下位', '下のクラス', '初級'].includes(v)) return s.lower.name;
  return value;
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

/** CSV・取り込み用。制御文字と、見えない文字（文字の向きの印・幅ゼロの空白）を消し、40文字まで。 */
export function cleanClassLabel(value: string): string {
  return stripInvisibleChars(String(value ?? '')).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, CLASS_LIMITS.label);
}

/** 赤と青のクラスがちがうときの注意（先頭の ⚠ は画面側で付ける）。どちらかが空なら ''。 */
export function boutClassWarning(red?: LocalFighter, blue?: LocalFighter): string {
  const r = (red?.fighterClass ?? '').trim();
  const b = (blue?.fighterClass ?? '').trim();
  if (!r || !b || same(r, b)) return '';
  return 'クラスがちがいます（赤：' + r + '／青：' + b + '）。ルールがちがうので、組み合わせを確かめてください。';
}

/** ルールの長い文から、（かっこの説明）だけを取りのぞく（80文字の説明を、注意の文に入れないため）。かっこの外の言葉は、後ろのものも残す。かっこが閉じていないときは、「（」の前まで。 */
export function shortRule(rule: string): string {
  const full = String(rule ?? '').trim();
  const head = full.replace(/（[^）]*）/g, '').split('（')[0].replace(/\s+/g, ' ').trim();
  return (head || full).slice(0, 60);
}

/**
 * クラスを使う大会で、この人のクラスがどんな状態か。
 * ok＝決めたクラスのどちらか / blank＝入っていない / unknown＝入っているが、決めたクラスの名前にない（例：S）。
 * 設定（受付で決めた2つの名前）が無いときは、blank だけを見分ける。
 */
export function classState(fighter: LocalFighter | undefined, s?: ClassSettings | null): 'ok' | 'blank' | 'unknown' {
  const label = cleanClassLabel(fighter?.fighterClass ?? '');
  if (!label) return 'blank';
  if (s && s.enabled && classKey(label, s) === '') return 'unknown';
  return 'ok';
}

/**
 * 準備画面の対戦カードの赤い注意（赤と青のクラスがちがうとき）。
 * headline = 何がまちがいかと、ふつうはどうするか（「クラスがちがいます」を先頭に置く）。rules = それぞれのクラスのルール（設定にあるときだけ）。
 * 設定（受付で決めたクラスの名前と、ルールの文）が無ければ、ルールの行は出さない。
 * 決めたクラスにない名前（例：S）のときは、「ルールは自分で決めます」と言う。
 */
export function classMixMessage(red: LocalFighter | undefined, blue: LocalFighter | undefined, s?: ClassSettings | null): { headline: string; rules: string[] } | null {
  if (boutClassWarning(red, blue) === '') return null;
  const r = (red?.fighterClass ?? '').trim(), b = (blue?.fighterClass ?? '').trim();
  const rules: string[] = [];
  if (s && s.enabled) {
    const seen = new Set<string>();
    for (const label of [r, b]) {
      const key = classKey(label, s);
      if (!key) { if (label && !seen.has('?' + keyOf(label))) { seen.add('?' + keyOf(label)); rules.push('「' + label + '」は、決めたクラス（' + s.upper.name + '・' + s.lower.name + '）にありません。ルールは、自分で決めます。'); } continue; }
      if (seen.has(key)) continue;
      seen.add(key);
      const side = key === 'upper' ? s.upper : s.lower;
      rules.push(side.name + 'のルール：' + shortRule(side.rule));
    }
  }
  return { headline: 'クラスがちがいます：赤は' + r + '、青は' + b + 'です。ルールがちがうので、ふつうは同じクラスの人と戦います。', rules };
}

/** 準備画面の対戦カードの上に出す、クラスの見かた。「Aクラス＝3勝以上　Bクラス＝2勝以下（初出場も）」 */
export function classLegend(s: ClassSettings | null | undefined): string {
  if (!s || !s.enabled) return '';
  const lowerWins = s.upperMinWins - 1;
  const lower = lowerWins <= 0 ? '0勝（初出場も）' : lowerWins + '勝以下（初出場も）';
  return 'クラス：' + s.upper.name + '＝' + s.upperMinWins + '勝以上　' + s.lower.name + '＝' + lower + '。';
}

/** 信用できない入れ物（ping・URLのハッシュ）から、正しいクラス設定だけを取り出す。投げない。 */
export function parseClassSettings(value: unknown): ClassSettings | undefined {
  try {
    if (!value || typeof value !== 'object') return undefined;
    const v = value as Record<string, unknown>;
    if (v.enabled !== true) return undefined;
    const clean = (x: unknown) => (typeof x === 'string' ? stripInvisibleChars(x).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : null);
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
