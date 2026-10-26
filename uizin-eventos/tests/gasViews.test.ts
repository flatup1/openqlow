import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness } from './helpers/gasV3Harness.ts';
import { RECORD_DETAIL_HEADERS } from '../core/recordDetail.ts';

/*
  見やすさと、マッチメイク用の「見るだけ」のタブ（2026-10-26 owner：列の幅・見出しの固定と色。各ページに選手名。浦田会長がマッチメイクしやすいように）。
  ① 最初の設定で、受付が書くタブの見た目をととのえ、「マッチメイク表」「戦績（選手名つき）」を作る。中身は式（受付のタブを読むだけ）。
*/
type H = ReturnType<typeof harness>;
const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', TEST_OS = 'テストOS取込用';
const MATCH = 'マッチメイク表', RECORD_VIEW = '戦績（選手名つき）', RECORD = '戦績詳細';
const sheetOf = (h: H, name: string): any => (h as any).book.getSheetByName(name);
const script = readFileSync(new URL('../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8');

const MATCH_FORMULA = "=ARRAYFORMULA(IFERROR(SORT(FILTER({'OS取込用（連絡先なし）'!M2:M,'OS取込用（連絡先なし）'!L2:L,IFERROR(VALUE('OS取込用（連絡先なし）'!G2:G),'OS取込用（連絡先なし）'!G2:G),'OS取込用（連絡先なし）'!N2:N,'OS取込用（連絡先なし）'!C2:C,'OS取込用（連絡先なし）'!B2:B,'OS取込用（連絡先なし）'!H2:H,'OS取込用（連絡先なし）'!E2:E,'OS取込用（連絡先なし）'!D2:D,'OS取込用（連絡先なし）'!F2:F,'OS取込用（連絡先なし）'!A2:A},'OS取込用（連絡先なし）'!A2:A<>\"\"),1,TRUE,2,TRUE,3,TRUE),\"\"))";
const RECORD_FORMULA = "=ARRAYFORMULA(IFERROR(FILTER({'戦績詳細'!A2:A,IFERROR(VLOOKUP('戦績詳細'!A2:A,{'OS取込用（連絡先なし）'!A2:A,'OS取込用（連絡先なし）'!C2:C},2,FALSE),\"\"),IFERROR(VLOOKUP('戦績詳細'!A2:A,{'OS取込用（連絡先なし）'!A2:A,'OS取込用（連絡先なし）'!B2:B},2,FALSE),\"\"),'戦績詳細'!C2:L},'戦績詳細'!A2:A<>\"\"),\"\"))";

test('見るだけのタブ：① で「マッチメイク表」「戦績（選手名つき）」を作る。見出し・式・うすい緑の見出し・1行目の固定・警告つきの保護', () => {
  const h = harness(); h.ready();
  const match = sheetOf(h, MATCH), view = sheetOf(h, RECORD_VIEW);
  assert.ok(match && view, '2つのタブができる');
  assert.deepEqual(match.rows[0], ['区分', 'クラス', '体重(kg)', '階級', '選手名', 'ジム名', '戦績', '年齢', '学年', '身長', '管理番号']);
  assert.deepEqual(view.rows[0], ['受付番号', '選手名', 'ジム名', ...RECORD_DETAIL_HEADERS.slice(2)]);
  assert.equal(match.formulas.get('2:1'), MATCH_FORMULA, 'マッチメイク表：区分→クラス→体重（数にして軽い順）');
  assert.equal(view.formulas.get('2:1'), RECORD_FORMULA, '戦績（選手名つき）：戦績詳細に、OS取込用の選手名・ジム名を付ける');
  for (const sheet of [match, view]) {
    assert.equal(sheet.frozenRows, 1);
    assert.equal(sheet.backgrounds.get('1:1'), '#dcfce7', '見るだけのタブは、うすい緑');
    assert.equal(sheet.protections.length, 1); assert.equal(sheet.protections[0].prot.warningOnly, true, '警告だけ（止めない）');
    assert.equal(sheet.rows.length, 1, '式のほかは、何も書かない');
  }
  assert.equal(match.columnWidths.get(5), 140, '選手名の列は広め');
  assert.ok(!/連絡先|電話|メール/.test(match.rows[0].join('') + view.rows[0].join('')), '連絡先は出さない');
  assert.ok(!MATCH_FORMULA.includes(PRIVATE) && !RECORD_FORMULA.includes(PRIVATE), '個人情報の表（申込原本）は読まない');
});

test('見やすさ：受付が書くタブも、① で 1行目の固定・うすい青の見出し・列の幅。文字は1マスも変えない', () => {
  const h = harness(); h.ready();
  for (const name of [PRIVATE, OS, TEST, TEST_OS, RECORD, 'テスト戦績詳細']) {
    const sheet = sheetOf(h, name);
    assert.equal(sheet.frozenRows, 1, name + '：1行目を固定');
    assert.equal(sheet.backgrounds.get('1:1'), '#dbeafe', name + '：見出しは、うすい青');
    assert.ok(sheet.columnWidths.size >= sheet.rows[0].length, name + '：列の幅');
  }
  assert.equal(sheetOf(h, PRIVATE).columnWidths.get(5), 140, '申込原本の選手名（E列）は 140');
  assert.equal(sheetOf(h, RECORD).columnWidths.get(8), 80, '戦績詳細の引き分け（H列）は 80');
});

test('もう一度 ① を押しても同じ（保護は増えない・式は同じ）。受付は今までどおり書け、見るだけのタブには書かない', () => {
  const h = harness(); h.ready(); h.call('openEntries');
  const before = sheetOf(h, MATCH).protections.length;
  h.call('setupTournament');
  assert.equal(sheetOf(h, MATCH).protections.length, before, '保護は増えない');
  assert.equal(sheetOf(h, MATCH).formulas.get('2:1'), MATCH_FORMULA);
  const receipt = h.call('saveEntry_', h.params('live', {}));
  assert.ok(sheetOf(h, OS).rows.some((r: any[]) => r[0] === receipt), '受付は OS取込用に書く');
  assert.equal(sheetOf(h, MATCH).rows.length, 1, 'マッチメイク表には書かない（式が読む）');
  assert.equal(sheetOf(h, RECORD_VIEW).rows.length, 1);
});

test('見るだけのタブを、だれかが消しても、① で作り直す。タブの名前・見出しを変えられていても、受付は止まらない', () => {
  const h = harness(); h.ready(); h.call('openEntries');
  (h as any).book.sheets.delete(MATCH);
  h.call('setupTournament');
  assert.ok(sheetOf(h, MATCH), '作り直す');
  sheetOf(h, MATCH).rows[0][0] = 'いたずら';
  const receipt = h.call('saveEntry_', h.params('live', {}));
  assert.ok(receipt, '見るだけのタブの見出しは、受付の点検に入らない');
  assert.match(script, /setupViews_\(book\);/, '① の中で呼ぶ');
  assert.match(script, /function setupViews_\(book\) \{\n  try \{ formatTables_\(book\); \} catch/, '失敗しても ① は止めない');
});
