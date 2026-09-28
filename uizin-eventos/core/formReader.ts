/**
 * 回答表を「共有を広げずに」読むための Google Apps Script（読むだけ）。
 *
 * 会長のGoogleアカウントの中で動くので、回答表の共有は「制限付き」のままでよい。
 * このスクリプトは getDisplayValues（読む）しか使わない。書き込み・削除・並べ替えの命令は1つも無い。
 * メール・電話・保護者名・住所の列は、Googleの外へ出す前にここで外す。
 * 合言葉（token）を知らない人には何も返さない。
 */

import { readFormCsv } from './formImport.ts';

const SCRIPT_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/;

/** 貼られたURLが「読むだけスクリプト」のURLか。これ以外へは問い合わせない */
export function isFormReaderUrl(value: string): boolean {
  return SCRIPT_URL.test(value.trim());
}

/** 合言葉。英数字だけの長いランダム文字 */
export function newReaderToken(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(24), (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
}

export function isValidReaderToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{20,64}$/.test(value);
}

/** 画面の「コピー」ボタンで渡すスクリプト本文。合言葉を埋め込んだ状態で渡す */
export function formReaderScript(token: string): string {
  if (!isValidReaderToken(token)) throw new Error('合言葉の形が正しくありません');
  return `/**
 * Tournament OS 回答表の読み取り専用スクリプト
 * - 回答表を「読むだけ」です。書き換え・削除はしません。
 * - メール・電話・保護者名・住所の列は送りません。
 * - 回答表の共有設定は「制限付き」のままで大丈夫です。
 */
const TOKEN = '${token}';
const SENSITIVE = /メール|mail|電話|携帯|tel|phone|保護者(の)?(氏名|名前|名)|保護者様?のお名前|住所|address|郵便/i;
const CONSENT = /同意|誓約|承諾|規約/;

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { body = {}; }
  if (body.token !== TOKEN) return reply({ ok: false, reason: '合言葉が違います' });
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const tabs = book.getSheets().map(function (s) { return s.getName(); });
  const sheet = body.tab ? book.getSheetByName(String(body.tab)) : book.getSheets()[0];
  if (!sheet) return reply({ ok: false, reason: 'タブ「' + body.tab + '」が見つかりません', tabs: tabs });
  if (sheet.getLastRow() < 1) return reply({ ok: true, tabs: tabs, tab: sheet.getName(), headers: [], rows: [] });
  const values = sheet.getRange(1, 1, sheet.getLastRow(), Math.max(1, sheet.getLastColumn())).getDisplayValues();
  const headers = values[0];
  const keep = [];
  const removed = [];
  headers.forEach(function (h, i) {
    const key = String(h).replace(/[\\s\\u3000]+/g, '');
    if (!CONSENT.test(key) && SENSITIVE.test(key)) removed.push(h); else keep.push(i);
  });
  const pick = function (row) { return keep.map(function (i) { return row[i]; }); };
  return reply({ ok: true, tabs: tabs, tab: sheet.getName(), headers: pick(headers), rows: values.slice(1).map(pick), removedColumns: removed });
}

function reply(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
`;
}

export type ReaderReply = { ok: true; tabs: string[]; tab: string; headers: string[]; rows: string[][]; removedColumns: string[] } | { ok: false; reason: string; tabs: string[] };

/** スクリプトの返事を確かめる。形が違う・0件は「読めていない」として扱う */
export function checkReaderReply(value: unknown): ReaderReply {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const tabs = Array.isArray(raw.tabs) ? raw.tabs.filter((t): t is string => typeof t === 'string').slice(0, 200) : [];
  if (raw.ok !== true) return { ok: false, reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 200) : '回答表を読めませんでした。', tabs };
  const headers = Array.isArray(raw.headers) ? raw.headers.map((h) => String(h ?? '')) : [];
  const rows = Array.isArray(raw.rows) ? raw.rows.filter(Array.isArray).map((r) => (r as unknown[]).map((c) => String(c ?? ''))) : [];
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (headers.length === 0) return { ok: false, reason: 'このタブは空でした。回答のタブを選んでください。', tabs };
  if (nonEmpty.length === 0) return { ok: false, reason: '回答が0件でした。回答のタブを選んでください。', tabs };
  const removedColumns = Array.isArray(raw.removedColumns) ? raw.removedColumns.map(String) : [];
  return { ok: true, tabs, tab: typeof raw.tab === 'string' ? raw.tab : '', headers, rows: nonEmpty, removedColumns };
}

// 同じ「0件・ログイン画面は取り込まない」決まりを CSV 側と共有していることを明示する
export { readFormCsv };
