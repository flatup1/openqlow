import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImportPreview, classifyHeader, detectColumns, extractGid, formCsvUrl, mergeImported,
  missingRequiredFields, readFormCsv, remapColumn, stripSensitiveColumns,
} from '../core/formImport.ts';

// 実在の回答表「フォームの回答 2」と同じ見出し。中身はすべて架空。
const HEADERS = ['タイムスタンプ', 'メールアドレス', '所属ジム・道場', '選手氏名', 'フリガナ', '出場クラス', '生年月日', '年齢', '学年', '性別', '身長', '通常体重', '出場階級', '戦績', 'スタイル', '他格闘技歴', '備考', '誓約書', '保護者同意', '団体・ジム責任者同意'];
const row = (ts: string, gym: string, name: string, kana: string, weight: string) =>
  [ts, 'test@example.com', gym, name, kana, 'ジュニア', '2014/04/01', '12', '小6', '男', '150', weight, '-40kg', '3戦2勝', 'オーソドックス', '空手2年', '左ひざ注意', '同意する', '同意する', '同意する'];
const csvOf = (rows: string[][]) => [HEADERS, ...rows].map((r) => r.map((c) => '"' + c + '"').join(',')).join('\r\n');
const SAMPLE = csvOf([
  row('2026/08/01 10:00:00', 'テストジム', '山田 太郎', 'ヤマダ タロウ', '38.5kg'),
  row('2026/08/02 11:00:00', '架空道場', '佐藤 花子', 'サトウ ハナコ', '３６'),
  row('2026/08/03 12:00:00', 'テストジム', '山田太郎', 'やまだたろう', '38'),
]);

function preview(text = SAMPLE) {
  const read = readFormCsv(text);
  assert.ok(read.ok);
  const safe = stripSensitiveColumns(read.headers, read.rows);
  return { safe, result: buildImportPreview(safe.headers, safe.rows, detectColumns(safe.headers)) };
}

test('実際の回答表の見出しを自動で対応づける', () => {
  const cols = detectColumns(HEADERS);
  const map = Object.fromEntries(cols.map((c) => [c.header, c.mapped.kind === 'field' ? c.mapped.field : c.mapped.kind]));
  assert.deepEqual(map, {
    'タイムスタンプ': 'timestamp', 'メールアドレス': 'sensitive', '所属ジム・道場': 'gym', '選手氏名': 'fighterName',
    'フリガナ': 'fighterKana', '出場クラス': 'className', '生年月日': 'birthDate', '年齢': 'age', '学年': 'grade',
    '性別': 'gender', '身長': 'height', '通常体重': 'weight', '出場階級': 'category', '戦績': 'record',
    'スタイル': 'style', '他格闘技歴': 'otherExperience', '備考': 'memo', '誓約書': 'consent', '保護者同意': 'consent',
    '団体・ジム責任者同意': 'consent',
  });
});

test('メール・電話・保護者名・住所は画面へ送る前に外す', () => {
  assert.equal(classifyHeader('連絡先電話番号').kind, 'sensitive');
  assert.equal(classifyHeader('保護者氏名').kind, 'sensitive');
  assert.equal(classifyHeader('住所').kind, 'sensitive');
  const { safe, result } = preview();
  assert.deepEqual(safe.removed, ['メールアドレス']);
  assert.ok(!JSON.stringify(result).includes('test@example.com'));
});

test('写真・意気込み・入場曲が無くても取り込みは止めず、未登録にする', () => {
  const { result } = preview();
  assert.equal(result.fighters.length, 3);
  const f = result.fighters[0];
  assert.equal(f.fighterName, '山田 太郎');
  assert.equal(f.gym, 'テストジム');
  assert.equal(f.weight, '38.5');
  assert.equal(f.category, '-40kg');
  assert.match(f.record ?? '', /3戦2勝.*空手2年/);
  assert.equal(f.memo, '左ひざ注意');
  assert.equal(f.comment, '');
  assert.equal(f.photoUrl, '');
  assert.deepEqual(f.missing, ['photoUrl', 'comment', 'musicUrl', 'canFightTwice']);
  assert.equal(result.fighters[1].weight, '36', '全角数字もそろえる');
});

test('別の行で同じ選手に見えるものは自動でまとめず、確認を出す', () => {
  const { result } = preview();
  assert.equal(result.fighters.length, 3);
  assert.equal(result.duplicates.length, 1);
  assert.match(result.duplicates[0].message, /同じ選手か確認してください/);
});

test('同じ回答表を2回読んでも人数は増えない', () => {
  const first = preview().result.fighters;
  const second = preview().result.fighters;
  const once = mergeImported([], first);
  const twice = mergeImported(once.fighters, second);
  assert.equal(once.after, 3);
  assert.equal(twice.after, 3);
  assert.equal(twice.added, 0);
  assert.equal(twice.updated, 3);
});

test('全く同じ回答行が2回あっても1人にまとめる', () => {
  const dup = csvOf([row('2026/08/01 10:00:00', 'A', '田中', 'タナカ', '40'), row('2026/08/01 10:00:00', 'A', '田中', 'タナカ', '40')]);
  const { result } = preview(dup);
  assert.equal(result.fighters.length, 1);
  assert.equal(result.sameRowCount, 1);
});

test('取り込んでも今いる選手は消えない', () => {
  const existing = [{ receiptNo: 'ENT-1', fighterName: '募集ページの選手', gym: 'X' }];
  const r = mergeImported(existing, preview().result.fighters);
  assert.equal(r.before, 1);
  assert.equal(r.after, 4);
  assert.ok(r.fighters.some((f) => f.receiptNo === 'ENT-1'));
});

test('ログイン画面・空・0件はデータとして取り込まない', () => {
  assert.equal(readFormCsv('<!DOCTYPE html><html>login</html>').ok, false);
  assert.equal(readFormCsv('').ok, false);
  assert.equal(readFormCsv(HEADERS.join(',') + '\r\n,,,\r\n').ok, false);
});

test('選手名が無い行は読まずに理由を残す', () => {
  const r = preview(csvOf([row('t', 'A', '', '', '40'), row('t2', 'A', '鈴木', 'スズキ', '40')])).result;
  assert.equal(r.fighters.length, 1);
  assert.deepEqual(r.skipped, [{ sheetRow: 2, reason: '選手名が空です' }]);
});

test('列名が違うフォームは人が選び直せる。個人情報列は選び直せない', () => {
  const headers = ['なまえ', 'メール', 'たいじゅう'];
  let cols = detectColumns(headers);
  assert.deepEqual(missingRequiredFields(cols), ['fighterName']);
  cols = remapColumn(cols, 0, 'fighterName');
  cols = remapColumn(cols, 1, 'fighterName');
  cols = remapColumn(cols, 2, 'weight');
  assert.deepEqual(missingRequiredFields(cols), []);
  assert.equal(cols[1].mapped.kind, 'sensitive');
  const r = buildImportPreview(headers, [['架空 一郎', 'x@example.com', '50']], cols);
  assert.equal(r.fighters[0].fighterName, '架空 一郎');
  assert.equal(r.fighters[0].weight, '50');
});

test('読むのはGoogleの書き出しURLだけ（書き込み用URLは作らない）', () => {
  const id = '1TimFyPyXm0pZMXLnGV694eFfatS731fORCjmmUdGkB4';
  assert.equal(extractGid('https://docs.google.com/spreadsheets/d/' + id + '/edit#gid=123'), '123');
  const u = formCsvUrl(id, { name: 'フォームの回答 2' });
  assert.match(u, /\/gviz\/tq\?tqx=out:csv/);
  assert.match(u, /sheet=%E3%83%95/);
  assert.match(formCsvUrl(id, { gid: '5' }), /gid=5$/);
});
