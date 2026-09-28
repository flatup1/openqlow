import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { checkReaderReply, formReaderScript, isFormReaderUrl, isValidReaderToken, newReaderToken } from '../core/formReader.ts';

// 実際の回答表と同じ見出し＋架空データ
const SHEET = [
  ['タイムスタンプ', 'メールアドレス', '所属ジム・道場', '選手氏名', '保護者同意', '連絡先電話番号', '保護者氏名', '通常体重'],
  ['2026/08/01', 'x@example.com', 'テストジム', '山田 太郎', '同意する', '090-0000-0000', '山田 花子', '30'],
];

/** 生成したスクリプトを、偽のGoogle環境で本当に動かす */
function runScript(token: string, body: unknown, sheets: Record<string, string[][]> = { 'フォームの回答 2': SHEET }) {
  const calls: string[] = [];
  const sheetObj = (name: string) => ({
    getName: () => name,
    getLastRow: () => sheets[name].length,
    getLastColumn: () => sheets[name][0]?.length ?? 0,
    getRange: (r: number, c: number, nr: number, nc: number) => ({
      getDisplayValues: () => { calls.push('getDisplayValues'); return sheets[name].slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)); },
      setValue: () => calls.push('WRITE'), setValues: () => calls.push('WRITE'), clear: () => calls.push('WRITE'),
    }),
    deleteRow: () => calls.push('WRITE'), appendRow: () => calls.push('WRITE'),
  });
  const book = { getSheets: () => Object.keys(sheets).map(sheetObj), getSheetByName: (n: string) => (sheets[n] ? sheetObj(n) : null) };
  const ctx: Record<string, unknown> = {
    SpreadsheetApp: { getActiveSpreadsheet: () => book },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ text: t, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(formReaderScript(token), ctx);
  const out = (ctx.doPost as (e: unknown) => { text: string })({ postData: { contents: JSON.stringify(body) } });
  return { reply: JSON.parse(out.text) as Record<string, unknown>, calls };
}

test('合言葉が合えば読める。メール・電話・保護者名はGoogleの外へ出さない', () => {
  const token = newReaderToken();
  const { reply, calls } = runScript(token, { token, tab: 'フォームの回答 2' });
  assert.equal(reply.ok, true);
  assert.deepEqual(reply.headers, ['タイムスタンプ', '所属ジム・道場', '選手氏名', '保護者同意', '通常体重']);
  assert.ok(!JSON.stringify(reply).includes('x@example.com'));
  assert.ok(!JSON.stringify(reply).includes('090-0000-0000'));
  assert.ok(!JSON.stringify(reply.rows).includes('山田 花子'));
  assert.deepEqual(calls.filter((c) => c === 'WRITE'), [], '回答表へは一切書き込まない');
});

test('合言葉が違えば何も返さない', () => {
  const { reply, calls } = runScript(newReaderToken(), { token: 'wrong-token-wrong-token-1234', tab: '' });
  assert.equal(reply.ok, false);
  assert.equal(reply.headers, undefined);
  assert.deepEqual(calls, []);
});

test('タブの一覧を返すので、会長はタブ名を打たずに選べる', () => {
  const token = newReaderToken();
  const { reply } = runScript(token, { token, tab: 'ない' }, { '申込予約▼': [['a']], 'フォームの回答 2': SHEET });
  assert.equal(reply.ok, false);
  assert.deepEqual(reply.tabs, ['申込予約▼', 'フォームの回答 2']);
});

test('スクリプト本文に書き込み系の命令が入っていない', () => {
  const src = formReaderScript(newReaderToken());
  for (const bad of ['setValue', 'appendRow', 'deleteRow', 'clear(', 'insertSheet', 'sort(', 'UrlFetchApp', 'MailApp']) assert.ok(!src.includes(bad), bad);
});

test('問い合わせ先は script.google.com の決まった形だけ', () => {
  assert.ok(isFormReaderUrl('https://script.google.com/macros/s/AKfycbx1234567890abcdefghijkl/exec'));
  assert.ok(!isFormReaderUrl('https://evil.example.com/macros/s/AKfycbx1234567890abcdefghijkl/exec'));
  assert.ok(!isFormReaderUrl('https://script.google.com.evil.com/macros/s/AKfycbx1234567890abcdefghijkl/exec'));
  assert.ok(!isFormReaderUrl('http://script.google.com/macros/s/AKfycbx1234567890abcdefghijkl/exec'));
});

test('合言葉は毎回ちがう長い英数字', () => {
  const a = newReaderToken(), b = newReaderToken();
  assert.ok(isValidReaderToken(a) && a !== b && a.length === 24);
  assert.throws(() => formReaderScript("x'; evil()//"));
});

test('0件・空・形の違う返事は取り込まない', () => {
  assert.equal(checkReaderReply({ ok: true, headers: ['a'], rows: [] }).ok, false);
  assert.equal(checkReaderReply({ ok: true, headers: [], rows: [['x']] }).ok, false);
  assert.equal(checkReaderReply('<html>').ok, false);
  const good = checkReaderReply({ ok: true, tab: 'T', tabs: ['T'], headers: ['選手氏名'], rows: [['a'], ['', '']] });
  assert.ok(good.ok && good.rows.length === 1);
});
