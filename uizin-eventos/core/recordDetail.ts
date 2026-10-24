/**
 * くわしい戦績（キックボクシング・他の格闘技・タイトル/入賞歴）の決まり。申し込みの画面・Googleの受付（.gs）・準備の画面が同じものを使う。
 *
 * 形：申し込みの画面は、下の JSON（packRecordDetail）を1つの隠し欄「recordDetail」に入れて送る。
 * 保存：Googleの受付は、「戦績詳細」の表に、1件を何行かに分けて書く（RECORD_DETAIL_HEADERS の順）。
 * 書き出し：名簿ZIPの records.csv は、同じ見出しの表。準備の画面は、受付番号で、選手に付け直す。
 *
 * 古い申し込み（この欄が無い）は、ここを通らない。読めないものは、捨てて、選手の情報は止めない。
 */

export const RECORD_DETAIL_VERSION = 1;

/** 上限（入力の長さ・個数）。Googleの受付も、同じ数で止める */
export const RECORD_DETAIL_LIMITS = {
  games: 999,
  others: 5,
  titles: 5,
  sport: 20,
  event: 60,
  class: 30,
  result: 60,
  yearMin: 1900,
  yearMax: 2100,
} as const;

export type KickRecord = { games: number; win: number; loss: number; draw: number };
export type OtherSportRecord = { sport: string; games: number; win: number; loss: number; draw: number; noResult: number };
export type TitleRecord = { event: string; year: number; class: string; result: string };
export type RecordDetail = { v: typeof RECORD_DETAIL_VERSION; kick: KickRecord; others: OtherSportRecord[]; titles: TitleRecord[] };

export const EMPTY_KICK: KickRecord = { games: 0, win: 0, loss: 0, draw: 0 };

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= RECORD_DETAIL_LIMITS.games;
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim() !== '' && value.trim().length <= max;

/** キックの戦績の、1行の言い方。試合数0は「初試合」（クラス分けの言い方と同じ）。例：「3勝1敗」「2勝1敗1分」 */
export function kickRecordText(kick: KickRecord): string {
  if (kick.games === 0) return '初試合';
  return kick.win + '勝' + kick.loss + '敗' + (kick.draw > 0 ? kick.draw + '分' : '');
}

/** 「3勝1敗」「2勝1敗1分」「初試合」から、キックの数に戻す（下書きを戻すとき用）。合わなければ null */
export function kickFromRecordText(text: string): KickRecord | null {
  const t = String(text ?? '').trim();
  if (t === '初試合') return { ...EMPTY_KICK };
  const m = t.match(/^(\d{1,3})勝(\d{1,3})敗(?:(\d{1,3})分)?$/);
  if (!m) return null;
  const win = Number(m[1]), loss = Number(m[2]), draw = m[3] ? Number(m[3]) : 0;
  const games = win + loss + draw;
  if (games < 1 || games > RECORD_DETAIL_LIMITS.games) return null;
  return { games, win, loss, draw };
}

/** 中身の決まりに合わない所を、画面に出す言葉で返す。合っていれば空の配列 */
export function recordDetailProblems(detail: unknown): string[] {
  const out: string[] = [];
  const d = detail as Partial<RecordDetail> | null | undefined;
  if (!d || typeof d !== 'object') return ['くわしい戦績の中身が読めません。'];
  const kick = d.kick as KickRecord | undefined;
  if (!kick || !isCount(kick.games)) out.push('キックボクシングの試合数を、数字で入れてください（未経験は「0」）。');
  else if (kick.games > 0) {
    if (!isCount(kick.win) || !isCount(kick.loss) || !isCount(kick.draw)) out.push('キックボクシングの勝ち・負け・引き分けを、数字で入れてください。');
    else if (kick.win + kick.loss + kick.draw !== kick.games) out.push('キックボクシングの勝ち・負け・引き分けの合計が、試合数と合っていません（試合数 ' + kick.games + '）。');
  } else if (!isCount(kick.win) || kick.win !== 0 || kick.loss !== 0 || kick.draw !== 0) out.push('未経験（試合数0）のときは、勝ち・負け・引き分けは入れません。');
  const others = Array.isArray(d.others) ? d.others : null;
  if (!others) out.push('他の格闘技の欄が読めません。');
  else {
    if (others.length > RECORD_DETAIL_LIMITS.others) out.push('他の格闘技は、' + RECORD_DETAIL_LIMITS.others + 'つまでです。');
    for (const o of others.slice(0, RECORD_DETAIL_LIMITS.others)) {
      if (!isText(o?.sport, RECORD_DETAIL_LIMITS.sport)) out.push('他の格闘技の競技名を入れてください（' + RECORD_DETAIL_LIMITS.sport + '字まで）。');
      if (!isCount(o?.games) || o.games < 1) out.push('他の格闘技の試合数は、1以上の数字で入れてください。');
      else if (![o.win, o.loss, o.draw, o.noResult].every(isCount)) out.push('他の格闘技の勝ち・負け・引き分け・勝敗なしを、数字で入れてください。');
      else if (o.win + o.loss + o.draw + o.noResult !== o.games) out.push('「' + o.sport + '」の勝ち・負け・引き分け・勝敗なしの合計が、試合数と合っていません（試合数 ' + o.games + '）。');
    }
  }
  const titles = Array.isArray(d.titles) ? d.titles : null;
  if (!titles) out.push('タイトル・入賞歴の欄が読めません。');
  else {
    if (titles.length > RECORD_DETAIL_LIMITS.titles) out.push('タイトル・入賞歴は、' + RECORD_DETAIL_LIMITS.titles + 'つまでです。');
    for (const t of titles.slice(0, RECORD_DETAIL_LIMITS.titles)) {
      if (!isText(t?.event, RECORD_DETAIL_LIMITS.event)) out.push('タイトル・入賞歴の大会名を入れてください（' + RECORD_DETAIL_LIMITS.event + '字まで）。');
      if (!Number.isInteger(t?.year) || t.year < RECORD_DETAIL_LIMITS.yearMin || t.year > RECORD_DETAIL_LIMITS.yearMax) out.push('獲得年は、4けたの数字で入れてください。');
      if (!isText(t?.class, RECORD_DETAIL_LIMITS.class)) out.push('タイトル・入賞歴の階級を入れてください（' + RECORD_DETAIL_LIMITS.class + '字まで）。');
      if (!isText(t?.result, RECORD_DETAIL_LIMITS.result)) out.push('タイトル名または入賞成績を入れてください（' + RECORD_DETAIL_LIMITS.result + '字まで）。');
    }
  }
  return out;
}

/** 画面が送る形（キーの順を決めて、JSON にする）。中身が決まりに合わないときは、空の文字（送らない） */
export function packRecordDetail(detail: RecordDetail): string {
  if (recordDetailProblems(detail).length) return '';
  const clean: RecordDetail = {
    v: RECORD_DETAIL_VERSION,
    kick: { games: detail.kick.games, win: detail.kick.win, loss: detail.kick.loss, draw: detail.kick.draw },
    others: detail.others.map((o) => ({ sport: o.sport.trim(), games: o.games, win: o.win, loss: o.loss, draw: o.draw, noResult: o.noResult })),
    titles: detail.titles.map((t) => ({ event: t.event.trim(), year: t.year, class: t.class.trim(), result: t.result.trim() })),
  };
  return JSON.stringify(clean);
}

/** 送られてきた JSON を読む。形が違う・決まりに合わないときは null（Googleの受付は、その時だけ断る） */
export function parseRecordDetail(text: unknown): RecordDetail | null {
  if (typeof text !== 'string' || text.trim() === '' || text.length > 20000) return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as RecordDetail;
  if (d.v !== RECORD_DETAIL_VERSION) return null;
  if (recordDetailProblems(d).length) return null;
  return packRecordDetail(d) ? (JSON.parse(packRecordDetail(d)) as RecordDetail) : null;
}

/** records.csv と「戦績詳細」の表の見出し（この順。Googleの受付も、準備の画面も、この見出しで読む） */
export const RECORD_DETAIL_HEADERS = ['受付番号', '申込日時', '種類', '競技名・大会名', '試合数', '勝ち', '負け', '引き分け', '勝敗なし', '獲得年', '階級', 'タイトル名・入賞成績'] as const;
export const RECORD_KIND = { kick: 'キック', other: '他の格闘技', title: 'タイトル・入賞' } as const;

/** 1件の申し込みを、表の行（見出しの順）に分ける。キックは必ず1行。他の格闘技・タイトルは、1つにつき1行 */
export function recordDetailRows(receiptNo: string, submittedAt: string, detail: RecordDetail): string[][] {
  const blank = (): string[] => RECORD_DETAIL_HEADERS.map(() => '');
  const rows: string[][] = [];
  const kick = blank();
  Object.assign(kick, { 0: receiptNo, 1: submittedAt, 2: RECORD_KIND.kick, 3: 'キックボクシング' });
  kick[4] = String(detail.kick.games); kick[5] = String(detail.kick.win); kick[6] = String(detail.kick.loss); kick[7] = String(detail.kick.draw);
  rows.push(kick);
  for (const o of detail.others) {
    const row = blank();
    row[0] = receiptNo; row[1] = submittedAt; row[2] = RECORD_KIND.other; row[3] = o.sport;
    row[4] = String(o.games); row[5] = String(o.win); row[6] = String(o.loss); row[7] = String(o.draw); row[8] = String(o.noResult);
    rows.push(row);
  }
  for (const t of detail.titles) {
    const row = blank();
    row[0] = receiptNo; row[1] = submittedAt; row[2] = RECORD_KIND.title; row[3] = t.event;
    row[9] = String(t.year); row[10] = t.class; row[11] = t.result;
    rows.push(row);
  }
  return rows;
}

/** records.csv（見出しつき）を読み、受付番号ごとの中身にする。見出しが違うときは、ぜんぶ読まない（名簿は別に読める） */
export function parseRecordDetailCsv(text: string): { ok: true; byReceipt: Map<string, RecordDetail> } | { ok: false; reason: string } {
  const rows = csvRows(String(text ?? '').replace(/^﻿/, ''));
  if (!rows.length) return { ok: true, byReceipt: new Map() };
  const head = rows[0].map((cell) => cell.trim());
  if (head.length !== RECORD_DETAIL_HEADERS.length || head.some((cell, i) => cell !== RECORD_DETAIL_HEADERS[i])) return { ok: false, reason: '戦績の見出しが、この版と違います' };
  const byReceipt = new Map<string, RecordDetail>();
  for (const row of rows.slice(1)) {
    const receipt = (row[0] ?? '').trim();
    if (!receipt) continue;
    const kind = (row[2] ?? '').trim();
    const cur: RecordDetail = byReceipt.get(receipt) ?? { v: RECORD_DETAIL_VERSION, kick: { ...EMPTY_KICK }, others: [], titles: [] };
    const num = (i: number) => Number((row[i] ?? '').trim());
    if (kind === RECORD_KIND.kick) cur.kick = { games: num(4), win: num(5), loss: num(6), draw: num(7) };
    else if (kind === RECORD_KIND.other) cur.others.push({ sport: (row[3] ?? '').trim(), games: num(4), win: num(5), loss: num(6), draw: num(7), noResult: num(8) });
    else if (kind === RECORD_KIND.title) cur.titles.push({ event: (row[3] ?? '').trim(), year: num(9), class: (row[10] ?? '').trim(), result: (row[11] ?? '').trim() });
    else continue;
    byReceipt.set(receipt, cur);
  }
  return { ok: true, byReceipt };
}

/** CSVを行に分ける（"..." の中の , と改行を守る）。見出しと同じ形の、最小限の読み方 */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}
