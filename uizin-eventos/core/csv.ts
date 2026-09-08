/**
 * 依存ゼロの CSV パーサ（RFC4180 相当）。
 * Google スプレッドシートの「CSVで書き出し」をそのまま読むために使う。
 */

export function parseCsv(text: string): string[][] {
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
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** 見出しを正規化する（大文字小文字・空白・全角空白・BOMの揺れを吸収） */
export function normalizeKey(key: string): string {
  return key
    .replace(/\uFEFF/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '_');
}

export type Row = Record<string, string>;

/** 1行目を見出しとして、行を辞書に変換する。空行は捨てる */
export function toRows(text: string): Row[] {
  const raw = parseCsv(text);
  if (raw.length === 0) return [];
  const header = raw[0].map(normalizeKey);
  const out: Row[] = [];
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i];
    const isEmpty = cells.every((c) => c.trim() === '');
    if (isEmpty) continue;
    const row: Row = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (!key) continue;
      row[key] = (cells[c] ?? '').trim();
    }
    out.push(row);
  }
  return out;
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
