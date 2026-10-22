import { stripInvisibleChars } from './csv.ts';
import type { LocalFighter } from './privateTournament.ts';

/**
 * 階級分け（区分 → 階級）の、純粋なルール。
 * 区分＝「中学生女子」「高校生・一般男子」など。階級＝「-37kg（37kg以下）」など。区分ごとに、選べる階級がちがう。
 * 階級の「保存する形」は、先頭に記号のつかない文字（37kg以下／60kgをこえる／無差別）。
 * 先頭が「-」「+」だと、表計算ソフトが式だと思ってしまうため。選ぶ画面だけ「-37kg（37kg以下）」と、記号と言葉を並べる。
 * 体重を超えているかの警告は、ここでは作らない（主催者の決まり）。
 */

export type DivisionSetting = { name: string; classes: string[] };
export type WeightSettings = { enabled: true; divisions: DivisionSetting[] };

export const WEIGHT_LIMITS = { divisions: 12, name: 20, classes: 20, classText: 16, label: 40 } as const;

/** 「kgを数にした中身」。kind: max＝◯kg以下／over＝◯kgをこえる／open＝無差別／text＝そのほかの名前（例：ライト級） */
export type WeightClassInfo = { kind: 'max' | 'over' | 'open' | 'text'; kg?: number; canon: string };

const OPEN_WORDS = new Set(['無差別', '無差別級', 'フリー', 'フリー級', 'free', 'open', 'オープン', 'オープン級', '体重無制限', '体重制限なし'].map((word) => squash(word)));
const NUM = '(\\d{1,3}(?:\\.\\d)?)';
const KG = '(?:kg|キロ|ｋｇ)?';
const RE_MAX = [new RegExp('^-' + NUM + KG + '(?:級)?(?:以下)?$'), new RegExp('^' + NUM + KG + '(?:級)?(?:以下|まで)$'), new RegExp('^' + NUM + '(?:kg|キロ|ｋｇ)級$')];
const RE_OVER = [new RegExp('^\\+' + NUM + KG + '(?:級)?$'), new RegExp('^' + NUM + KG + '(?:をこえる|を超える|こえる|超える|超え|超|以上|超級)$')];

const fmtKg = (kg: number): string => String(Number(kg.toFixed(1)));
/** 「なし」の言い方（「なし」「なしです」「特になし」「階級はありません」…）。表の1つのマスぜんぶがこれなら、階級を選ばせない区分。階級の名前には使えない */
const NONE_PHRASE = /^(?:特に)?(?:なし|無し|ナシ|階級(?:は)?(?:なし|無し|ありません)|ありません)(?:です|でした)?$/;
/** マスや1つぶんの文字の外側の「（ ）」「「 」」と、うしろの「。」を取る */
const stripEdges = (value: string): string => value.replace(/^[（(「『]([\s\S]*)[）)」』]$/, '$1').replace(/[。.．！!]+$/, '').trim();
const HAS_WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]/u;
const RESERVED_WORDS = new Set(['kg', 'キロ', '級', '以下', '以上', 'まで', '超', '超え', '超える', 'こえる', 'をこえる', 'を超える', '未満', 'なし', '無し', 'ナシ', 'ありません', 'あり', '有り', 'アリ', 'はい', 'いいえ'].map((word) => squash(word)));

/** 比べるために、見えない文字を取り、全角・半角をそろえ、空白を取り、ダッシュ類を「-」にそろえる */
function squash(value: string): string {
  return stripInvisibleChars(String(value ?? '')).normalize('NFKC').toLowerCase().replace(/[ー‐‑–—−―－﹣]/g, '-').replace(/＋/g, '+').replace(/\s+/g, '');
}

/**
 * 階級の1つぶんの文字を読む。読めて意味が分かれば WeightClassInfo。
 * 数字だけ（「37」）は、以下か超かが分からないので null。数字がまじる読めない文字も null。数字のない名前（ライト級）は text として通す。
 */
export function parseWeightClass(raw: string): WeightClassInfo | null {
  const s = squash(raw);
  if (!s) return null;
  if (OPEN_WORDS.has(s)) return { kind: 'open', canon: '無差別' };
  for (const re of RE_MAX) { const m = re.exec(s); if (m) { const kg = Number(m[1]); if (kg > 0 && kg < 300) return { kind: 'max', kg, canon: fmtKg(kg) + 'kg以下' }; return null; } }
  for (const re of RE_OVER) { const m = re.exec(s); if (m) { const kg = Number(m[1]); if (kg > 0 && kg < 300) return { kind: 'over', kg, canon: fmtKg(kg) + 'kgをこえる' }; return null; } }
  if (/\d/.test(s)) return null;
  // 名前は、全角・半角のちがいをそろえて持つ（取り込んだファイルの「ＬＩＧＨＴ」と設定の「LIGHT」が、同じ階級になる）
  const text = cleanWeightText(raw).normalize('NFKC');
  if (!text || text.length > WEIGHT_LIMITS.classText || /^[=+\-@]/.test(text)) return null;
  // 名前には、文字（かな・漢字・英字）が1つは要る。記号や「ー」だけ、「kg」「以下」のような単位・ことば、「なし」の言い方は、階級の名前にしない
  if (!HAS_WORD.test(text) || RESERVED_WORDS.has(squash(text)) || NONE_PHRASE.test(squash(text))) return null;
  return { kind: 'text', canon: text };
}

/** 画面や表に入れる文字から、制御文字と見えない文字を取り、空白を1つにして、前後を切る */
export function cleanWeightText(value: string): string {
  return stripInvisibleChars(String(value ?? '')).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, WEIGHT_LIMITS.label);
}

/** 保存する形にそろえる。読めないときは ''（空） */
export function canonWeightClass(raw: string): string {
  return parseWeightClass(raw)?.canon ?? '';
}

/** 選ぶ画面の見出し：記号と言葉を並べる。例「-37kg（37kg以下）」「+60kg（60kgをこえる）」「無差別（体重の制限なし）」 */
export function weightClassLabel(canon: string): string {
  const info = parseWeightClass(canon);
  if (!info) return cleanWeightText(canon);
  if (info.kind === 'max') return '-' + fmtKg(info.kg ?? 0) + 'kg（' + fmtKg(info.kg ?? 0) + 'kg以下）';
  if (info.kind === 'over') return '+' + fmtKg(info.kg ?? 0) + 'kg（' + fmtKg(info.kg ?? 0) + 'kgをこえる）';
  if (info.kind === 'open') return '無差別（体重の制限なし）';
  return info.canon;
}

/** リンクや表で使う短い形。例「-37」「+60」「無差別」 */
export function weightClassToken(canon: string): string {
  const info = parseWeightClass(canon);
  if (!info) return cleanWeightText(canon);
  if (info.kind === 'max') return '-' + fmtKg(info.kg ?? 0);
  if (info.kind === 'over') return '+' + fmtKg(info.kg ?? 0);
  return info.canon;
}

const SPLIT_LIST = /[,、，。;；\/／\n\r\t　 ]+/;
/** 「なし」と書いたことが分かる形：「なし」「階級なし」のあとに、（かっこの説明）や「。」が付いてもよい */
const NONE_FORM = /^(?:なし|無し|ナシ|階級なし|階級無し|階級はなし|ありません)(?:[（(][^）)]*[）)])?[。.]?$/;
/** 数字とあとの単位・「-」と数字のあいだの空白は、区切りではない（「-37 kg」「- 37」を2つに割らない） */
const UNIT_AFTER = '(?:kg|キロ|ｋｇ|級|以下|まで|をこえる|を超える|こえる|超える|超え|超|以上)';
const glueUnits = (raw: string): string => raw.replace(/([-+＋−‐‑–—―－﹣])\s+(?=\d)/g, '$1').replace(new RegExp('(\\d)\\s+(?=' + UNIT_AFTER + ')', 'gi'), '$1').replace(new RegExp('(kg|キロ|ｋｇ)\\s+(?=' + UNIT_AFTER.replace('kg|キロ|ｋｇ|', '') + ')', 'gi'), '$1');

/**
 * 主催者が表に書いた「階級のならび」（例：-37、-40、-43、+60）を、保存する形の一覧にする。
 * 「なし」だけなら、階級を選ばない区分（classes が空）。書き方がまちがっている分は problems に、どれがどう悪いかを入れる。
 */
export function parseClassList(text: string): { classes: string[]; problems: string[]; none: boolean } {
  const raw = stripInvisibleChars(String(text ?? '')).normalize('NFKC').trim();
  const problems: string[] = [];
  if (!raw) return { classes: [], problems: ['空です（階級を書くか、階級を選ばせない区分なら「なし」と書いてください）'], none: false };
  const flatCell = raw.replace(/\s+/g, '');
  if (NONE_FORM.test(flatCell) || NONE_PHRASE.test(stripEdges(flatCell))) return { classes: [], problems, none: true };
  const classes: string[] = [];
  const seen = new Set<string>();
  for (const part of glueUnits(raw).split(SPLIT_LIST)) {
    const token = stripEdges(part.trim());
    if (!token) continue;
    if (token.length > WEIGHT_LIMITS.classText) { problems.push('「' + token.slice(0, 12) + '」は長すぎます（' + WEIGHT_LIMITS.classText + '文字まで）'); continue; }
    const info = parseWeightClass(token);
    if (!info) {
      const flat = squash(token);
      problems.push(/^[\d.]+(?:kg|キロ)?$/.test(flat)
        ? '「' + token.slice(0, 12) + '」は、以下なら「-' + flat.replace(/kg|キロ/g, '') + '」、こえるなら「+' + flat.replace(/kg|キロ/g, '') + '」と書いてください'
        : '「' + token.slice(0, 12) + '」は、階級として読めません（例：-37、+60、無差別）');
      continue;
    }
    const key = info.canon.toLowerCase();
    if (seen.has(key)) { problems.push('同じ階級が2回あります（' + info.canon + '）'); continue; }
    seen.add(key);
    classes.push(info.canon);
  }
  if (classes.length > WEIGHT_LIMITS.classes) problems.push('階級が多すぎます（' + WEIGHT_LIMITS.classes + 'こまで）');
  if (!classes.length && !problems.length) problems.push('階級が1つも読めません（例：-37、-40、+60、無差別／階級を選ばせない区分なら「なし」と書きます）');
  return { classes, problems, none: false };
}

/** 比べるための印：見えない文字を取り、全角・半角と大文字・小文字と前後の空白のちがいを無くす */
const keyOf = (value: string): string => stripInvisibleChars(String(value ?? '')).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
export const divisionKey = keyOf;

/** 区分の名前（設定にある名前）の形。見えない文字・制御文字を取る */
export function cleanDivisionName(value: string): string {
  return stripInvisibleChars(String(value ?? '')).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 設定に入れる前の、区分の名前の検査。問題があれば、理由（空なら問題なし） */
export function divisionNameProblem(name: string): string {
  const n = cleanDivisionName(name);
  if (!n) return '区分の名前が空です';
  if (n.length > WEIGHT_LIMITS.name) return '区分の名前は' + WEIGHT_LIMITS.name + '文字までにしてください（' + n.slice(0, 12) + '…）';
  if (/^[=+\-@]/.test(n)) return '区分の名前は、「=」「+」「-」「@」で始めないでください（' + n.slice(0, 12) + '）';
  return '';
}

const division = (name: string, tokens: string): DivisionSetting => ({ name, classes: tokens ? parseClassList(tokens).classes : [] });

/** 申込ページ・当日画面にそのまま出る、初期の表（千葉県キックボクシング協会 Vol.6 の要項と同じ）。Googleのシート「設定」タブの初期値と同じ（テストで一致を確認する）。 */
export const DEFAULT_DIVISIONS: DivisionSetting[] = [
  division('小学生以下', ''),
  division('中学生女子', '-37,-40,-43,-46,-49,-52,-55,-58'),
  division('中学生男子', '-37,-40,-43,-46,-49,-52,-55,-58'),
  division('高校生・一般女子', '-40,-43,-46,-50,-53,-56,-59,-62,-65'),
  division('高校生・一般男子', '-50,-53,-56,-59,-62,-65,-68,-71,-74,-77,-80,-85,無差別'),
  division('花道・女子（40歳以上）', '-40,-45,-50,-55,-60,+60'),
  division('花道・男子（40歳以上）', '-55,-60,-65,-70,-75,-80,-85,無差別'),
];
export const DEFAULT_WEIGHT_SETTINGS: WeightSettings = { enabled: true, divisions: DEFAULT_DIVISIONS };

/** 区分を探す（全角・半角・大文字小文字・空白のちがいは同じ）。なければ undefined */
export function findDivision(name: string, s: WeightSettings | null | undefined): DivisionSetting | undefined {
  if (!s || !s.enabled) return undefined;
  const k = keyOf(name);
  return k ? s.divisions.find((d) => keyOf(d.name) === k) : undefined;
}

/** 区分名を、設定の名前にそろえる。設定になければ ''。 */
export function normalizeDivision(value: string, s: WeightSettings | null | undefined): string {
  return findDivision(value, s)?.name ?? '';
}

/** その区分の階級の一覧にある形（保存する形）にそろえる。区分や階級が設定になければ ''。 */
export function normalizeWeightClass(divisionName: string, value: string, s: WeightSettings | null | undefined): string {
  const d = findDivision(divisionName, s);
  if (!d || !d.classes.length) return '';
  const canon = canonWeightClass(value);
  if (!canon) return '';
  const k = canon.toLowerCase();
  return d.classes.find((c) => c.toLowerCase() === k) ?? '';
}

/**
 * 取り込んだファイルの区分・階級の文字を、設定の名前にそろえる。読めないものは、そのまま（見えない文字を取って）返す。
 * 区分は「・」や空白の有る無しを気にしない（「高校生一般男子」も同じ）。階級は、書き方（-37／37kg以下／37kg級）を気にしない。
 */
export function normalizeDivisionLoose(value: string, s: WeightSettings | null | undefined): string {
  const exact = normalizeDivision(value, s);
  if (exact) return exact;
  const tidy = cleanDivisionName(value);
  if (!s || !s.enabled || !tidy) return tidy;
  const loose = (t: string) => keyOf(t).replace(/[・･·]/g, '');
  const k = loose(tidy);
  const found = s.divisions.filter((d) => loose(d.name) === k);
  return found.length === 1 ? found[0].name : tidy;
}
export function normalizeWeightClassLoose(divisionName: string, value: string, s: WeightSettings | null | undefined): string {
  const exact = normalizeWeightClass(divisionName, value, s);
  if (exact) return exact;
  const info = parseWeightClass(value);
  return info ? info.canon : cleanWeightText(value);
}

/** 「区分」と「階級」の選びかたの検査。問題があれば、直し方つきの文。空なら問題なし。 */
export function weightChoiceError(divisionName: string, weightClass: string, s: WeightSettings | null | undefined): string {
  if (!s || !s.enabled) return '';
  if (!cleanDivisionName(divisionName)) return '区分を選んでください。';
  const d = findDivision(divisionName, s);
  if (!d) return '区分は、えらべるものから選んでください。';
  if (!d.classes.length) return '';
  if (!cleanWeightText(weightClass)) return '階級を選んでください。';
  if (!normalizeWeightClass(d.name, weightClass, s)) return '階級は、えらべるものから選んでください。';
  return '';
}

/**
 * 階級のない区分（初期は「小学生以下」）を選んだときの説明。オーナーの言葉のまま。
 * 申込ページの灰色の説明・準備の画面・ほかのジム用の画面は、この定数をそのまま出す（手で別々に書かない）。
 * 「目安」であって約束ではない。クラスを決める人の話は、ここに入れない（クラスを選ぶのは本人）。
 */
export const NO_CLASS_NOTE = 'この区分には階級がありません。小学生の試合は、申し込みの体重を目安に、近い学年（1〜2年の差）・近い体重（2〜3kgの差）の選手どうしで組みます。目安なので、ちがうこともあります。';

/** 送る前の確認の「階級」の行。上の定数のうしろ2文（先頭の1文は、行の名前「階級」と重なるので外す）を「なし（ ）」で包む */
export function noClassReviewValue(): string {
  return 'なし（' + NO_CLASS_NOTE.slice(NO_CLASS_NOTE.indexOf('。') + 1) + '）';
}

/** この区分は、階級を選ばせるか */
export const divisionHasClasses = (name: string, s: WeightSettings | null | undefined): boolean => (findDivision(name, s)?.classes.length ?? 0) > 0;

/** 選手の「区分・階級」を、1つの短い文にする。例「中学生男子・37kg以下」「小学生以下」。何も無ければ ''。 */
export function weightTag(fighter: Pick<LocalFighter, 'division' | 'weightClass'> | undefined): string {
  const d = cleanDivisionName(fighter?.division ?? ''), w = cleanWeightText(fighter?.weightClass ?? '');
  return [d, w].filter(Boolean).join('・');
}

/** 試合の赤と青の、区分・階級がちがうときの注意（先頭の ⚠ は画面側で付ける）。止めるためではなく、確かめてもらうため。ちがわない・どちらかが空なら ''。 */
export function boutWeightWarning(red?: LocalFighter, blue?: LocalFighter): string {
  const rd = cleanDivisionName(red?.division ?? ''), bd = cleanDivisionName(blue?.division ?? '');
  const rw = cleanWeightText(red?.weightClass ?? ''), bw = cleanWeightText(blue?.weightClass ?? '');
  if (rd && bd && keyOf(rd) !== keyOf(bd)) return '区分がちがいます（赤：' + rd + '／青：' + bd + '）。ふつうは、同じ区分の人どうしで戦います。';
  if (rw && bw && keyOf(rw) !== keyOf(bw)) return '階級がちがいます（赤：' + rw + '／青：' + bw + '）。ふつうは、同じ階級の人どうしで戦います。';
  return '';
}

/** 区分の一覧を、リンクで運ぶための短い形（JSON）にする。例：[["中学生女子","-37,-40"],["小学生以下",""]] */
export function weightSettingsToParam(s: WeightSettings): string {
  return JSON.stringify(s.divisions.map((d) => [d.name, d.classes.map(weightClassToken).join(',')]));
}

/** 初期の表と同じか（同じなら、リンクに表を入れない。リンクが短くなる） */
export function isDefaultWeightSettings(s: WeightSettings | null | undefined): boolean {
  return !!s && weightSettingsToParam(s) === weightSettingsToParam(DEFAULT_WEIGHT_SETTINGS);
}

/**
 * 信用できない入れ物（ping・リンク）から、正しい設定だけを取り出す。投げない。
 * 区分は [{name, classes:[…]}] か [[name, "-37,-40"]] のどちらでも読む。階級は、書き方がちがっても、保存する形にそろえる。1つでも読めなければ、全体をむこうにする（半分だけ使うことはしない）。
 */
export function parseWeightSettings(value: unknown): WeightSettings | undefined {
  try {
    let v: unknown = value;
    if (!v || typeof v !== 'object') return undefined;
    if (Array.isArray(v)) v = { enabled: true, divisions: v };
    const o = v as Record<string, unknown>;
    if (o.enabled !== true || !Array.isArray(o.divisions)) return undefined;
    if (o.divisions.length < 1 || o.divisions.length > WEIGHT_LIMITS.divisions) return undefined;
    const out: DivisionSetting[] = [];
    const names = new Set<string>();
    for (const item of o.divisions) {
      let name: unknown, list: unknown;
      if (Array.isArray(item)) { name = item[0]; list = item[1]; }
      else if (item && typeof item === 'object') { name = (item as Record<string, unknown>).name; list = (item as Record<string, unknown>).classes; }
      else return undefined;
      if (typeof name !== 'string') return undefined;
      const clean = cleanDivisionName(name);
      if (divisionNameProblem(clean) || names.has(keyOf(clean))) return undefined;
      names.add(keyOf(clean));
      let classes: string[] = [];
      if (typeof list === 'string') {
        const parsed = list.trim() === '' ? { classes: [], problems: [] as string[], none: true } : parseClassList(list);
        if (parsed.problems.length) return undefined;
        classes = parsed.classes;
      } else if (Array.isArray(list)) {
        if (list.length > WEIGHT_LIMITS.classes) return undefined;
        const seen = new Set<string>();
        for (const c of list) {
          if (typeof c !== 'string') return undefined;
          const canon = canonWeightClass(c);
          if (!canon || canon.length > WEIGHT_LIMITS.classText || seen.has(canon.toLowerCase())) return undefined;
          seen.add(canon.toLowerCase());
          classes.push(canon);
        }
      } else return undefined;
      out.push({ name: clean, classes });
    }
    return { enabled: true, divisions: out };
  } catch {
    return undefined;
  }
}

/** 「ws=」「wd=」の文字（JSON）から、正しい設定だけを取り出す。読めなければ undefined */
export function weightsFromParam(value: string | null | undefined): WeightSettings | undefined {
  if (!value || value.length > 3000) return undefined;
  try { return parseWeightSettings({ enabled: true, divisions: JSON.parse(value) }); } catch { return undefined; }
}
