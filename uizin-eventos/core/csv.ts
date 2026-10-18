/**
 * 依存ゼロの CSV パーサ（RFC4180 相当）。
 * Google スプレッドシートの「CSVで書き出し」をそのまま読むために使う。
 */

/**
 * 文字の向きの印・幅ゼロの空白・BOM など、見えない文字（コピーや貼り付けで入る）。
 * 見出し・クラス名・名前の比べ合いの前に取り除く（U+200C・200D は、絵文字や一部の文字に使うので、名前の取り込みでは残す版も用意する）。
 */
export const INVISIBLE_RE = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
/** 名前・ジム名の取り込み用（結合に使う U+200C・U+200D は残す） */
export const INVISIBLE_KEEP_JOINERS_RE = /[\u00AD\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
export const stripInvisibleChars = (value: string): string => String(value ?? '').replace(INVISIBLE_RE, '');

/** 「"」が閉じないまま終わった CSV（取り込みの検査で使う。画面は「ファイルがこわれています」と言う） */
export class CsvQuoteError extends Error {
  constructor() { super('csv-open-quote'); this.name = 'CsvQuoteError'; }
}

/**
 * CSV を行と欄にする。
 * - 「"」は、欄の最初にあるときだけ、引用の始まり（5"6 や 12" のような、欄の途中の「"」はただの文字）
 * - 行の終わりは、CRLF・LF・CR だけ（古い Mac の Excel の CSV は CR だけ）
 * - strict: 引用が閉じないまま終わったら CsvQuoteError（あとの行が全部1つの欄に飲みこまれて、黙って消えるのを防ぐ）
 */
export function parseCsv(text: string, opts: { strict?: boolean } = {}): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // 先頭のBOMを落とす
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    // 欄のはじめ（空白だけのあとも）の「"」だけが、引用の始まり
    if (ch === '"' && field.trim() === '') {
      field = '';
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\r' && src[i + 1] === '\n') continue; // CRLF は LF のところで1回だけ区切る
    if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  if (inQuotes && opts.strict) throw new CsvQuoteError();
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * 見出しを正規化する（大文字小文字・空白・全角空白・BOMの揺れ、全角と半角のちがい、うしろの（単位）を吸収）。
 * 例：「体重（kg）」「体重(kg)」「ＮＡＭＥ」「クラス（A/B）」→ 体重・体重・name・クラス
 */
export function normalizeKey(key: string): string {
  return stripInvisibleChars(key)
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s*\([^()]*\)\s*$/, '')
    .replace(/[\s\u3000]+/g, '_');
}

export type Row = Record<string, string>;

/** 1行目を見出しとして、行を辞書に変換する。空行は捨てる */
export function toRows(text: string): Row[] {
  return toRowsIndexed(text).rows.map((item) => item.row);
}

/**
 * toRows に、見出しの元の文字と、各行の行番号（ファイルの上から数えて何行目か。見出しが1行目）を足したもの。
 * 同じ名前に直る見出しが2つあるときは、中身が入っているほうを使う。
 */
export function toRowsIndexed(text: string, opts: { strict?: boolean } = {}): { headers: string[]; rows: Array<{ row: Row; line: number }> } {
  const raw = parseCsv(text, opts);
  if (raw.length === 0) return { headers: [], rows: [] };
  const headers = raw[0].map((cell) => stripInvisibleChars(cell).trim());
  const header = raw[0].map(normalizeKey);
  const out: Array<{ row: Row; line: number }> = [];
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i];
    const isEmpty = cells.every((c) => c.trim() === '');
    if (isEmpty) continue;
    const row: Row = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (!key) continue;
      const value = (cells[c] ?? '').trim();
      if (key in row && row[key] !== '' && value === '') continue;
      row[key] = value;
    }
    out.push({ row, line: i + 1 });
  }
  return { headers, rows: out };
}

/** 別名のどれかを拾う。見つからなければ '' */
export function pick(row: Row, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[normalizeKey(key)];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

/** 全角数字を半角にそろえる */
function toHalfWidth(raw: string): string {
  return raw.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** 数値として拾う。空や壊れた値は fallback */
export function pickNumber(row: Row, fallback: number, ...keys: string[]): number {
  const raw = pick(row, ...keys);
  if (raw === '') return fallback;
  const m = toHalfWidth(raw).match(/-?\d+(\.\d+)?/);
  if (!m) return fallback;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : fallback;
}

/** "3:00" / "180" / "3分" をすべて秒に直す */
export function parseSeconds(raw: string, fallback: number): number {
  const text = toHalfWidth(raw).replace(/：/g, ':').trim();
  if (text === '') return fallback;
  const clock = text.match(/^(\d+):([0-5]?\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const jp = text.match(/^(\d+)\s*分\s*(\d+)?\s*秒?$/);
  if (jp) return Number(jp[1]) * 60 + Number(jp[2] ?? 0);
  const num = text.match(/^-?\d+(\.\d+)?$/);
  if (num) return Math.round(Number(num[0]));
  return fallback;
}

/** 取り込み内容の指紋（FNV-1a 32bit）。番組表が変わったことの検出だけに使う */
export function fingerprint(...parts: string[]): string {
  let hash = 0x811c9dc5;
  const joined = parts.join(' ');
  for (let i = 0; i < joined.length; i++) {
    hash ^= joined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
