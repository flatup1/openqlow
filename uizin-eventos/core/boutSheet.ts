// A3 対戦一覧表（掲示用）の「中身の決まり」。画面にも通信にも依存しない（テストしやすい）。
// 会長が決めた対戦カードを、見やすい一覧表にするだけ。自動で組み合わせることはしない。
// 載せてよいのは、ここで名前を挙げた項目だけ（白リスト）。電話・メール・生年月日・健康・同意の記録は、データにあっても通さない。
import type { LocalBout, LocalFighter, LocalTournament } from './privateTournament.ts';
import { weightTag } from './weightClass.ts';

/** A3 の寸法（mm）。短い辺 297、長い辺 420 */
export const A3_MM = { short: 297, long: 420 } as const;

export type SheetOrientation = 'portrait' | 'landscape';

/** 載せる項目（会長が決める）。氏名は、いつも載る */
export type SheetShow = { photo: boolean; gym: boolean; classLine: boolean; rule: boolean };
export const DEFAULT_SHOW: SheetShow = { photo: true, gym: true, classLine: true, rule: false };

export type SheetOptions = { perPage: number; orientation: SheetOrientation; show: SheetShow };

/** 向きごとの、1ページに載せる試合数。まず目指すのは A3 を 4 枚（3〜4 枚）。auto = 自動で決めるときの下限・上限 */
export const PER_PAGE = {
  portrait: { min: 1, max: 14, auto: [4, 12] as const, columns: 1 },
  landscape: { min: 2, max: 24, auto: [6, 16] as const, columns: 2 },
} as const;
export const TARGET_PAGES = 4;

/** 向きごとの、横に並べる試合の数。縦の紙は 1 列、横の紙は 2 列（左の列を上から下へ、つづけて右の列。試合順のまま） */
export const columnsOf = (orientation: SheetOrientation): number => PER_PAGE[orientation].columns;
export const rowsOf = (perPage: number, orientation: SheetOrientation): number => Math.ceil(perPage / columnsOf(orientation));

/** 1ページの試合数を、使える範囲に直す（数でないときは、自動の下限） */
export function clampPerPage(value: unknown, orientation: SheetOrientation): number {
  const limit = PER_PAGE[orientation];
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return limit.auto[0];
  return Math.min(limit.max, Math.max(limit.min, n));
}

/** 全部で何ページか。試合が 0 のときは 0 ページ */
export function pageCount(total: number, perPage: number): number {
  const per = Number.isFinite(perPage) ? Math.max(1, Math.floor(perPage)) : 1;
  return total <= 0 ? 0 : Math.ceil(total / per);
}

/** ページ数に合わせた、1ページの試合数（例：試合 30 を 4 枚 → 8 試合）。使える範囲の中で、いちばん近い数 */
export function perPageForPages(total: number, pages: number, orientation: SheetOrientation): number {
  const wanted = Math.ceil(Math.max(1, total) / Math.max(1, Math.floor(pages)));
  return clampPerPage(wanted, orientation);
}

/** 自動で決める 1ページの試合数。A3 を 4 枚にしたいので、試合数 ÷ 4。ただし、向きごとの下限・上限の中 */
export function suggestPerPage(total: number, orientation: SheetOrientation): number {
  const [low, high] = PER_PAGE[orientation].auto;
  const wanted = Math.ceil(Math.max(1, total) / TARGET_PAGES);
  return clampPerPage(Math.min(high, Math.max(low, wanted)), orientation);
}

export type SheetSide = {
  /** ok = 出る人／absent = 欠場／empty = まだ決まっていない（選手が選ばれていない） */
  state: 'ok' | 'absent' | 'empty';
  name: string;
  gym: string;
  /** 写真（data URL）。ないとき・載せないとき・欠場のときは空。空でも、名前などの文字だけで出せる */
  photo: string;
  /** クラス・区分・階級の札（例：「Aクラス　中学生男子・37kg以下」）。載せないときは空 */
  tag: string;
};

export type SheetBout = {
  /** 試合番号（1 から。準備画面・当日の画面と同じ順番） */
  number: number;
  /** 例：「第3試合」 */
  label: string;
  /** 試合を見分ける文字（準備画面の「体重の区分」の欄）。載せないとき・空のときは空 */
  classLine: string;
  /** ルール。載せないとき・空のときは空 */
  rule: string;
  red: SheetSide;
  blue: SheetSide;
};

export type SheetPage = {
  /** 1 から */
  number: number;
  total: number;
  from: number;
  to: number;
  /** 例：「第1〜8試合」 */
  range: string;
  bouts: SheetBout[];
};

export const boutLabel = (number: number): string => '第' + number + '試合';
export const rangeText = (from: number, to: number): string => from === to ? boutLabel(from) : '第' + from + '〜' + to + '試合';

/** 一覧表に出す、1人ぶん。載せてよい項目だけを、1つずつ取り出す（ほかの項目は、触らない） */
export function sheetSide(fighter: LocalFighter | undefined, show: SheetShow): SheetSide {
  if (!fighter) return { state: 'empty', name: '', gym: '', photo: '', tag: '' };
  const absent = fighter.absent === true;
  const name = String(fighter.name ?? '').trim();
  const tag = show.classLine ? [String(fighter.fighterClass ?? '').trim(), weightTag(fighter)].filter(Boolean).join('　') : '';
  return {
    state: absent ? 'absent' : 'ok',
    name: name || '名前未入力',
    gym: show.gym ? String(fighter.gym ?? '').trim() : '',
    photo: show.photo && !absent ? String(fighter.photoDataUrl ?? '') : '',
    tag,
  };
}

function sheetBout(bout: LocalBout, index: number, byId: Map<string, LocalFighter>, show: SheetShow): SheetBout {
  return {
    number: index + 1,
    label: boutLabel(index + 1),
    classLine: show.classLine ? String(bout.className ?? '').trim() : '',
    rule: show.rule ? String(bout.rule ?? '').trim() : '',
    red: sheetSide(byId.get(bout.redId), show),
    blue: sheetSide(byId.get(bout.blueId), show),
  };
}

/** 全部の試合を、試合順のまま、一覧表の形にする */
export function sheetBouts(data: Pick<LocalTournament, 'fighters' | 'bouts'>, show: SheetShow): SheetBout[] {
  const byId = new Map(data.fighters.map((fighter) => [fighter.id, fighter]));
  return data.bouts.map((bout, index) => sheetBout(bout, index, byId, show));
}

/** ページに分ける。1試合は、必ず 1 ページの中に入る（ページをまたがない）。試合が 0 のときは、ページなし */
export function paginate(bouts: SheetBout[], perPage: number): SheetPage[] {
  const per = Number.isFinite(perPage) ? Math.max(1, Math.floor(perPage)) : 1;
  const total = pageCount(bouts.length, per);
  const pages: SheetPage[] = [];
  for (let at = 0; at < bouts.length; at += per) {
    const slice = bouts.slice(at, at + per);
    pages.push({ number: pages.length + 1, total, from: slice[0].number, to: slice[slice.length - 1].number, range: rangeText(slice[0].number, slice[slice.length - 1].number), bouts: slice });
  }
  return pages;
}

export type SheetNotes = {
  /** 選手がまだ決まっていない試合の番号 */
  empty: number[];
  /** 欠場の選手がいる試合の番号 */
  absent: number[];
  /** 名前が空の選手がいる試合の番号 */
  noName: number[];
  /** 写真のない選手の人数（試合に入っている人だけ。欠場の人は数えない）。写真がなくても、文字だけで出る */
  noPhoto: number;
  /** 赤と青が同じ人の試合の番号 */
  same: number[];
  /** 2つ以上の試合に入っている選手の名前 */
  twice: string[];
};

/** 印刷の前に、会長に確かめてもらうこと。止めるためではない（印刷はできる） */
export function sheetNotes(data: Pick<LocalTournament, 'fighters' | 'bouts'>): SheetNotes {
  const byId = new Map(data.fighters.map((fighter) => [fighter.id, fighter]));
  const notes: SheetNotes = { empty: [], absent: [], noName: [], noPhoto: 0, same: [], twice: [] };
  const seen = new Map<string, number>();
  const photoCounted = new Set<string>();
  data.bouts.forEach((bout, index) => {
    const number = index + 1;
    const red = byId.get(bout.redId), blue = byId.get(bout.blueId);
    if (!red || !blue) notes.empty.push(number);
    if (red?.absent === true || blue?.absent === true) notes.absent.push(number);
    if ((red && !red.name.trim()) || (blue && !blue.name.trim())) notes.noName.push(number);
    if (red && blue && red.id === blue.id) notes.same.push(number);
    // 1つの試合の中で赤と青の両方にいる人は、「同じ人」で言う。「2つ以上の試合」には数えない
    for (const fighter of new Set([red, blue])) {
      if (!fighter) continue;
      seen.set(fighter.id, (seen.get(fighter.id) ?? 0) + 1);
      if (!fighter.photoDataUrl && fighter.absent !== true && !photoCounted.has(fighter.id)) { photoCounted.add(fighter.id); notes.noPhoto++; }
    }
  });
  for (const [id, count] of seen) if (count > 1) notes.twice.push(String(byId.get(id)?.name.trim() || '名前未入力'));
  return notes;
}

/** 一覧表の全部。大会名・ページ・試合 */
export type SheetModel = { title: string; logo: boolean; totalBouts: number; pages: SheetPage[]; notes: SheetNotes };

export function buildSheet(data: LocalTournament, options: SheetOptions): SheetModel {
  const perPage = clampPerPage(options.perPage, options.orientation);
  const bouts = sheetBouts(data, options.show);
  return {
    title: String(data.title ?? '').trim() || '大会名未設定',
    logo: data.entryConfig?.logo === true,
    totalBouts: bouts.length,
    pages: paginate(bouts, perPage),
    notes: sheetNotes(data),
  };
}

/** 紙の余白（mm）と、ページの見出しの高さ（見出しの下のすき間をふくむ）。1つの試合の高さは、sheetMetrics が決める */
export const PAGE_MARGIN_MM = 10;
export const HEADER_MM = 22;

export type SheetPrefs = {
  orientation: SheetOrientation;
  show: SheetShow;
  /** 会長が1ページの試合数を決めたときだけ数が入る */
  count: number | null;
  /** 「A3を3枚／4枚にする」を押したとき。試合数が変わっても、その枚数に合わせ直す */
  pages: 3 | 4 | null;
};

/** 覚えておいた設定（このブラウザの localStorage の文字）を読む。壊れた文字・変な値は、自動の値にする。count と pages は、どちらか一方だけ */
export function parseSheetPrefs(raw: string | null): SheetPrefs {
  let value: unknown = null;
  try { value = raw ? JSON.parse(raw) : null; } catch { value = null; }
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const orientation: SheetOrientation = object.orientation === 'landscape' ? 'landscape' : 'portrait';
  const showRaw = object.show && typeof object.show === 'object' ? object.show as Record<string, unknown> : {};
  const flag = (key: keyof SheetShow): boolean => typeof showRaw[key] === 'boolean' ? showRaw[key] as boolean : DEFAULT_SHOW[key];
  const pages = object.pages === 3 || object.pages === 4 ? object.pages : null;
  const count = pages === null && typeof object.perPage === 'number' && Number.isFinite(object.perPage) ? clampPerPage(object.perPage, orientation) : null;
  return { orientation, show: { photo: flag('photo'), gym: flag('gym'), classLine: flag('classLine'), rule: flag('rule') }, count, pages };
}

/** 設定から、いまの試合数での 1ページの試合数を決める */
export function resolvePerPage(prefs: Pick<SheetPrefs, 'orientation' | 'count' | 'pages'>, total: number): number {
  if (prefs.pages !== null) return perPageForPages(total, prefs.pages, prefs.orientation);
  if (prefs.count !== null) return clampPerPage(prefs.count, prefs.orientation);
  return suggestPerPage(total, prefs.orientation);
}

/** 設定（向き・載せる項目・1ページの試合数）を、まとめて読む（試合数 total で、自動の数を決める） */
export function parseSheetOptions(raw: string | null, total: number): SheetOptions {
  const prefs = parseSheetPrefs(raw);
  return { perPage: resolvePerPage(prefs, total), orientation: prefs.orientation, show: prefs.show };
}

/* ───────────── 紙の上の大きさ（mm）。画面のプレビューと印刷で、同じ数を使う ───────────── */

export type SheetMetrics = {
  /** 紙の幅・高さ（mm）。向きで入れかわる */
  pageW: number; pageH: number;
  columns: number; rows: number;
  /** 1つの試合の枠の幅・高さ（mm）。行のあいだのすき間は除く */
  cellW: number; cellH: number;
  /** 試合番号の列の幅、左右の選手の幅 */
  centerW: number; sideW: number;
  /** 写真の幅・高さ。写真を載せないときは 0 */
  photoW: number; photoH: number;
  /** 文字の大きさ（mm）。氏名・所属ジム・クラス/階級の札・ルール・試合番号 */
  name: number; gym: number; tag: number; rule: number; no: number;
};

export const COLUMN_GAP_MM = 6;
export const ROW_GAP_MM = 2.5;
const clampMm = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const round1 = (value: number): number => Math.round(value * 10) / 10;
/** 小数1けたに切りさげる（大きさを丸めて、入るはずの文字が、はみ出さないようにする） */
const floor1 = (value: number): number => Math.floor(value * 10 + 1e-9) / 10;

/** 向き・1ページの試合数・写真の有無から、紙の上の寸法を決める。高さに合わせて、写真と文字が大きくなる（小さくなる）。 */
export function sheetMetrics(perPage: number, orientation: SheetOrientation, withPhoto: boolean): SheetMetrics {
  const pageW = orientation === 'portrait' ? A3_MM.short : A3_MM.long;
  const pageH = orientation === 'portrait' ? A3_MM.long : A3_MM.short;
  const columns = columnsOf(orientation), rows = rowsOf(perPage, orientation);
  const cellW = (pageW - PAGE_MARGIN_MM * 2 - COLUMN_GAP_MM * (columns - 1)) / columns;
  const cellH = (pageH - PAGE_MARGIN_MM * 2 - HEADER_MM - ROW_GAP_MM * (rows - 1)) / rows;
  const centerW = cellW >= 250 ? 34 : 28;
  const sideW = (cellW - centerW) / 2;
  // 写真の幅は、選手の場所の3割まで（横の紙は、氏名の場所がせまくなるため）
  const photoH = withPhoto ? clampMm(Math.min(cellH - 6, (sideW * 0.3) / 0.8), 12, 44) : 0;
  const name = clampMm(Math.min(cellH * 0.27, sideW * 0.13), 4.2, 15);
  return {
    pageW, pageH, columns, rows, cellW: round1(cellW), cellH: round1(cellH), centerW, sideW: round1(sideW),
    photoW: round1(photoH * 0.8), photoH: round1(photoH),
    name: round1(name), gym: round1(clampMm(name * 0.5, 3.2, 7)), tag: round1(clampMm(name * 0.42, 3, 6)), rule: round1(clampMm(name * 0.36, 2.8, 5)),
    no: round1(clampMm(cellH * 0.38, 7, 20)),
  };
}

/* ───────────── 文字の幅・折り返しの見つもり ───────────── */

/** 全角の幅で見る文字（かな・漢字・全角・幅があいまいな記号 ※ ★ ① → など、三点リーダー）。ふつうの句読点・引用符（U+2010〜2027）は、半角の幅 */
const isWide = (code: number): boolean => code >= 0x2030 || code === 0x2025 || code === 0x2026;

/**
 * 1文字の幅の見つもり（em）。かな・漢字・全角は 1。半角の英字は、太い字（氏名は太字）の実際の幅に近い値（大文字は広く、i・l は狭く）。
 * 幅があいまいな記号（★ ① → など）と絵文字は、広いほうで見る。
 */
export function charEm(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x1f000 || (code >= 0x2600 && code <= 0x27bf)) return 1.3;
  if (isWide(code)) return 1;
  if (ch === ' ') return 0.3;
  if (code >= 0x30 && code <= 0x39) return 0.6;
  if (ch === 'W' || ch === 'M') return 0.96;
  if (ch === 'I') return 0.36;
  if (code >= 0x41 && code <= 0x5a) return 0.74;
  if (ch === 'm' || ch === 'w') return 0.88;
  if (ch === 'i' || ch === 'j' || ch === 'l') return 0.3;
  if (ch === 'f' || ch === 'r' || ch === 't') return 0.38;
  if (code >= 0x61 && code <= 0x7a) return 0.58;
  if ('-.,\'’:;!|()'.includes(ch)) return 0.36;
  return 0.62;
}

/** 文字の幅の見つもり（em） */
export function textWidthEm(text: string): number {
  let sum = 0;
  for (const ch of Array.from(text)) sum += charEm(ch);
  return sum;
}

/** 実際のフォントは、見つもりより少し広いことがある。そのぶんの余裕 */
const TEXT_SAFETY = 1.04;
/** 英数字のつながり（単語）か。単語は、空白のところで折り返す。かな・漢字・全角は、どこでも折り返せる */
const isWordChar = (ch: string): boolean => ch !== ' ' && !isWide(ch.codePointAt(0) ?? 0);
/** 行の頭に来てはいけない字（長音「ー」・中点「・」・小さいかな・句読点・閉じかっこ）。前の字といっしょに折り返す */
const NO_START = new Set(Array.from('ーｰ・ゃゅょっぁぃぅぇぉゎゕゖャュョッァィゥェォヮヵヶ、。，．，）」』】〕〉》〙〗｝！？…‥々'));
/** 行の終わりに来てはいけない字（開きかっこ）。次の字といっしょに折り返す */
const NO_END = new Set(Array.from('（「『【〔〈《〘〖｛'));

/**
 * 何行になるか。ブラウザの折り返しをまねる：かな・漢字は1字ずつ、英数字は単語ごと（長すぎる単語は字の途中で）折り返す。
 * sizeMm = 文字の大きさ（mm）、widthMm = 文字を入れる場所の幅（mm）。文字がないときは 0 行。
 */
export function wrapLines(text: string, sizeMm: number, widthMm: number): number {
  // 全角の空白（姓と名のあいだの「　」）は、1字ぶんの幅で数える。ふつうの空白・改行だけを、1つの空白にまとめる
  const chars = Array.from(text.replace(/[ \t\r\n]+/g, ' ').replace(/^ | $/g, ''));
  if (chars.length === 0) return 0;
  const line = Math.max(0.5, widthMm / (Math.max(0.1, sizeMm) * TEXT_SAFETY));
  let lines = 1, x = 0;
  for (let i = 0; i < chars.length;) {
    const ch = chars[i];
    if (isWordChar(ch)) {
      let j = i;
      while (j < chars.length && isWordChar(chars[j])) j++;
      // 単語は、ハイフンのうしろでも折り返せる（ブラウザは、字の途中より先に、ハイフンのうしろで折り返す）。区切りごとに、順に置く
      const parts: string[][] = [];
      let cur: string[] = [];
      for (let k = i; k < j; k++) { cur.push(chars[k]); if (chars[k] === '-' && k + 1 < j) { parts.push(cur); cur = []; } }
      parts.push(cur);
      for (const part of parts) {
        const w = part.reduce((sum, c) => sum + charEm(c), 0);
        if (x + w <= line + 1e-9) x += w;
        else if (w <= line) { lines++; x = w; }
        else { // 1行に入らない長い区切り：ブラウザは、まず前の区切りのあとで折り返して（次の行の先頭にして）、それでも入らない分を、字の途中で折り返す
          if (x > 0) { lines++; x = 0; }
          for (const c of part) { const e = charEm(c); if (x + e > line + 1e-9) { lines++; x = e; } else x += e; }
        }
      }
      i = j;
    } else if (ch === ' ') {
      x += charEm(ch); if (x > line) { lines++; x = 0; } // 行の終わりの空白は、次の行に回さない
      i++;
    } else {
      // かな・漢字：1字ずつ折り返せる。ただし、行の頭に来てはいけない字（ー ・ 小さい「ゃゅょっ」 句読点 閉じかっこ）は、前の字とひとまとまり。
      // 行の終わりに来てはいけない字（開きかっこ）は、次の字とひとまとまり（ブラウザの禁則処理をまねる）
      let w = charEm(ch);
      let k = i + 1;
      if (NO_END.has(ch) && k < chars.length && !isWordChar(chars[k]) && chars[k] !== ' ') { w += charEm(chars[k]); k++; }
      while (k < chars.length && NO_START.has(chars[k])) { w += charEm(chars[k]); k++; }
      if (x + w > line + 1e-9) { lines++; x = w; } else x += w;
      i = k;
    }
  }
  return lines;
}

/**
 * 文字を、maxLines 行までに収める、いちばん大きい大きさ（mm）にする（maxMm から minMm のあいだ。0.1mm きざみ、切りさげ）。
 * minMm でも入らないときは、cut = true（枠で切れる。画面で知らせる）。文字がないときは 0 行。
 */
export function fitText(text: string, widthMm: number, maxMm: number, minMm: number, maxLines: number): { size: number; lines: number; cut: boolean } {
  const top = Math.floor(maxMm * 10 + 1e-9), bottom = Math.min(top, Math.ceil(minMm * 10 - 1e-9));
  if (!text.trim()) return { size: top / 10, lines: 0, cut: false };
  if (wrapLines(text, bottom / 10, widthMm) > maxLines) return { size: bottom / 10, lines: maxLines, cut: true };
  let low = bottom, high = top; // low は入る大きさ。大きいほど行が増える（単調）ので、二分探索
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (wrapLines(text, mid / 10, widthMm) <= maxLines) low = mid; else high = mid - 1;
  }
  return { size: low / 10, lines: wrapLines(text, low / 10, widthMm), cut: false };
}

/**
 * 氏名の文字の大きさと行数。まず「1行に入る大きさ」を考える。それが上限の75%以上なら、1行にする（4〜5文字の名前の、最後の1文字だけが次の行に落ちる、を防ぐ）。
 * それより小さくなるときだけ、2行にする（2行に入る大きさ。下限 3.2mm）。textW = 氏名の場所の幅（mm）。
 */
export function fitNameText(name: string, textW: number, maxMm: number): { size: number; lines: number; cut: boolean } {
  const one = fitText(name, textW, maxMm, 3.2, 1);
  if (!one.cut && one.size >= maxMm * 0.75) return one;
  return fitText(name, textW, maxMm, 3.2, 2);
}

/** 氏名の文字の大きさ（mm）だけ。fitNameText の大きさ */
export function fitNameMm(name: string, maxMm: number, textW: number): number {
  return fitNameText(name, textW, maxMm).size;
}

/** 1人ぶんの文字の高さの見つもり（mm）。「▲ 赤」の行（欠場の札は、この行に並べる）＋氏名＋所属ジム＋札。欠場の選手は、札（クラス・区分・階級）を出さない */
export function sideHeightMm(state: SheetSide['state'], f: Pick<SideFit, 'corner' | 'name' | 'gym' | 'tag' | 'nameLines' | 'gymLines' | 'tagLines'>): number {
  // 欠場の札は、枠の線と余白のぶん、行より少し高い
  return f.corner * 1.25 + (state === 'absent' ? 0.8 : 0) + f.nameLines * f.name * 1.17 + f.gymLines * f.gym * 1.22 + f.tagLines * f.tag * 1.27;
}

/**
 * 各ページの見出し（大会名）の文字の大きさ。textW = 見出しの場所の幅（mm）。
 * 1行で5mm以上に入るなら1行（上限8mm）。それより小さくなるときは2行（上限6.8mm。見出しの高さに2行が入る大きさ）。
 */
export function fitTitleMm(title: string, textW: number): { size: number; lines: 1 | 2 } {
  const one = fitText(title, textW, 8, 5, 1);
  if (!one.cut) return { size: one.size, lines: 1 };
  return { size: fitText(title, textW, 6.8, 3.2, 2).size, lines: 2 };
}

export type CenterFit = {
  /** 試合番号の大きさ。word = 「第」「試合」の大きさ */
  no: number; word: number;
  classLine: number; rule: number; classLines: number; ruleLines: number;
  /** true = 「第 N 試合」を1行にした（せまい枠）。false = 3行に積んだ */
  compact: boolean;
  /** 枠に入らなくて、省いた文字（0行にした）。画面で知らせる */
  droppedClass: boolean; droppedRule: boolean;
};

/**
 * まん中の列（「第 N 試合」・試合を見分ける文字・ルール）が、枠の高さに入る並べ方・大きさ・行数を決める。必ず枠に入る（入らない文字は省いて、省いたことを返す）。
 * 順番：①3行に積む → 文字を小さく ②「第N試合」を1行にして、①と同じ ③ルールを省く ④試合を見分ける文字も省く。番号だけは、いつも出す。
 */
export function fitCenter(bout: Pick<SheetBout, 'number' | 'classLine' | 'rule'>, m: SheetMetrics): CenterFit {
  const textW = Math.max(12, m.centerW - 3.2);
  const budget = m.cellH - 2.4 - 2;
  const digits = String(bout.number).length;
  // 行の数。3行をこえるときは、入らない（Infinity）。切って見せることはしない（文字は、ぜんぶ載るか、省くか）
  const lines = (text: string, size: number): number => { if (!text) return 0; const n = wrapLines(text, size, textW); return n > 3 ? Infinity : n; };
  const attempt = (compact: boolean, withClass: boolean, withRule: boolean): CenterFit | null => {
    const classText = withClass ? bout.classLine : '', ruleText = withRule ? bout.rule : '';
    // 番号の大きさ：積むときは枠の高さで決まる（3けたは小さめ）。1行（第N試合）のときは、枠の幅に入る大きさ（上限9mm。「第」「試合」は番号の55%）
    let no = compact ? clampMm(Math.min(9, textW / ((1.65 + 0.6 * digits) * TEXT_SAFETY)), 6, 9) : (digits > 2 ? Math.max(7, m.no * 0.72) : m.no);
    const noMin = compact ? 6 : 7; // 番号は、読めることがいちばん大事。これより小さくするくらいなら、ほかの文字を省く
    let word = compact ? Math.max(2.6, no * 0.55) : m.tag, cs = m.tag, rs = m.rule;
    const head = (): number => compact ? no * 1.15 : word * 1.1 * 2 + no;
    const used = (cl: number, rl: number): number => head() + (cl ? 1 + cl * cs * 1.25 : 0) + (rl ? 0.8 + rl * rs * 1.25 : 0);
    for (let step = 0; step < 60; step++) {
      const cl = lines(classText, cs), rl = lines(ruleText, rs);
      if (used(cl, rl) <= budget) return { no: floor1(no), word: floor1(compact ? Math.max(2.6, no * 0.55) : word), classLine: floor1(cs), rule: floor1(rs), classLines: cl, ruleLines: rl, compact, droppedClass: !!bout.classLine && !withClass, droppedRule: !!bout.rule && !withRule };
      if (no > noMin) no = Math.max(noMin, no * 0.92);
      else if (cs > 2.6 || rs > 2.4 || (!compact && word > 2.6)) { cs = Math.max(2.6, cs * 0.93); rs = Math.max(2.4, rs * 0.93); if (!compact) word = Math.max(2.6, word * 0.93); }
      else return null;
    }
    return null;
  };
  const fit = attempt(false, true, true) ?? attempt(true, true, true) ?? attempt(true, true, false) ?? attempt(true, false, false);
  // ④でも入らないほどせまい枠は、ここには来ない（試合番号の1行は、最小の枠でも入る）。念のため、番号だけを最小の大きさで返す
  return fit ?? { no: 6, word: 2.6, classLine: 2.6, rule: 2.4, classLines: 0, ruleLines: 0, compact: true, droppedClass: !!bout.classLine, droppedRule: !!bout.rule };
}

/** その向きで、1ページの試合数の上限・下限（＋ー を押せるか） */
export const perPageLimit = (orientation: SheetOrientation): { min: number; max: number } => ({ min: PER_PAGE[orientation].min, max: PER_PAGE[orientation].max });

/** 「A3を ○ 枚にする」を押すと、実際に何枚になるか。試合が多い・少ないときは、○枚にならないことがある */
export function pagesIfTarget(total: number, target: number, orientation: SheetOrientation): number {
  return pageCount(total, perPageForPages(total, target, orientation));
}

export type SideFit = {
  name: number; gym: number; tag: number; corner: number; nameLines: number; gymLines: number; tagLines: number; textW: number;
  /** 最小の大きさ・行数でも入らず、枠で切れる文字（…と出る）。印刷の前に、画面で知らせる */
  cut: { name: boolean; gym: boolean; tag: boolean };
};

/**
 * 1人ぶんの文字（氏名・所属ジム・クラス/階級の札）が、枠の高さに入るように、大きさと行数を決める。
 * 折り返しは wrapLines でまねて数える（1行に入る文字数が、字の幅で決まることも見る）。氏名は、まず1行、だめなら小さく、それでも長ければ2行。
 * 高さに入らないときは、ぜんぶの文字を少しずつ小さくする（下限あり）。それでも入らないときは、行数をへらす（あふれるより、1行に切るほうがよい）。
 * 最小の大きさでも入らない文字は、cut = true で返す（画面で「切れる」と知らせる）。
 */
export function fitSide(side: Pick<SheetSide, 'name' | 'gym' | 'tag' | 'state'>, m: SheetMetrics, withPhoto: boolean): SideFit {
  const textW = Math.max(20, m.sideW - (withPhoto ? m.photoW + 9 : 7));
  const budget = m.cellH - 2.4;
  const name = side.state === 'empty' ? '未定' : side.name;
  const tagText = side.state === 'absent' ? '' : side.tag;
  const build = (scale: number, cap: number): { fit: SideFit; high: number } => {
    const nameMax = Math.max(3.4, m.name * scale);
    const nm = cap === 1 ? fitText(name, textW, nameMax, 3.2, 1) : fitNameText(name, textW, nameMax);
    const gm = fitText(side.gym, textW, Math.max(2.6, m.gym * scale), 2.6, cap);
    const tg = fitText(tagText, textW, Math.max(2.4, m.tag * scale), 2.4, cap);
    const fit: SideFit = { name: nm.size, gym: gm.size, tag: tg.size, corner: floor1(Math.max(2.4, m.tag * scale)), nameLines: Math.max(1, nm.lines), gymLines: gm.lines, tagLines: tg.lines, textW, cut: { name: nm.cut, gym: gm.cut, tag: tg.cut } };
    return { fit, high: sideHeightMm(side.state, fit) };
  };
  let scale = 1, cur = build(scale, 2);
  for (let step = 0; step < 30 && cur.high > budget; step++) { scale *= 0.93; cur = build(scale, 2); }
  if (cur.high > budget) cur = build(scale, 1);
  return cur.fit;
}
