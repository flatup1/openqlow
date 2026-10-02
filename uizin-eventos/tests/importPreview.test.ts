import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewImport } from '../core/importPreview.ts';
import { parseProgram } from '../core/sheet.ts';

const HEAD = 'no,class,rule,rounds,round_seconds,break_seconds,red_name,red_comment,red_photo,blue_name,blue_comment,blue_photo';
const row = (no: number, photo = 'https://example.test/p.jpg') =>
  [no, 'A級', 'MMA', 2, 180, 60, '赤' + no, 'がんばる', photo, '青' + no, 'まけない', photo].join(',');

const csv = (matches: string, music = '', event = 'key,value\ntitle,UIZIN 2026') => ({ event, matches, music });

test('45試合のCSVを貼ると、取り込む前に件数が全部出る', () => {
  const rows = [HEAD, ...Array.from({ length: 45 }, (_, i) => row(i + 1))].join('\n');
  const preview = previewImport(csv(rows), null, 1_000);
  assert.equal(preview.ok, true);
  assert.equal(preview.matches, 45);
  assert.equal(preview.comments, 90);
  assert.equal(preview.photos, 90);
  assert.equal(preview.title, 'UIZIN 2026');
});

test('試合が1件も読めないCSVは取り込まない（対戦カードを空で上書きしない）', () => {
  const preview = previewImport(csv('でたらめな文字列'), null, 1_000);
  assert.equal(preview.ok, false);
  assert.ok(preview.blockers.some((b) => b.includes('見出し')), preview.blockers.join('/'));
});

test('matches が空なら取り込まない', () => {
  const preview = previewImport(csv(''), null, 1_000);
  assert.equal(preview.ok, false);
  assert.ok(preview.blockers.some((b) => b.includes('matches が空')));
});

test('Googleのログイン画面を貼ってしまったら取り込まない', () => {
  const html = '<!doctype html><html><body>accounts.google.com/ServiceLogin</body></html>';
  const preview = previewImport(csv(html), null, 1_000);
  assert.equal(preview.ok, false);
  assert.ok(preview.blockers.some((b) => b.includes('CSVではなくWebページ')), preview.blockers.join('/'));
});

test('event シートにHTMLが混ざっていても止める', () => {
  const rows = [HEAD, row(1)].join('\n');
  const preview = previewImport(csv(rows, '', '<html><body>login</body></html>'), null, 1_000);
  assert.equal(preview.ok, false);
});

test('試合数が半分以下に減るときは、取り込めるが強く念を押す', () => {
  const current = parseProgram(csv([HEAD, ...Array.from({ length: 45 }, (_, i) => row(i + 1))].join('\n')), 1_000);
  const preview = previewImport(csv([HEAD, row(1), row(2)].join('\n')), current, 2_000);
  assert.equal(preview.ok, true, '人が確かめれば取り込めるべき');
  assert.equal(preview.matchDelta, -43);
  assert.ok(preview.cautions.some((c) => c.includes('45 件から 2 件')), preview.cautions.join('/'));
});

test('試合が増えるときは念を押さない', () => {
  const current = parseProgram(csv([HEAD, row(1)].join('\n')), 1_000);
  const preview = previewImport(csv([HEAD, row(1), row(2), row(3)].join('\n')), current, 2_000);
  assert.equal(preview.matchDelta, 2);
  assert.equal(preview.cautions.some((c) => c.includes('減ります')), false);
});

test('曲が無いことは取り込みを止める理由にしない（進行は続けられる）', () => {
  const preview = previewImport(csv([HEAD, row(1)].join('\n')), null, 1_000);
  assert.equal(preview.ok, true);
  assert.equal(preview.cues, 0);
  assert.ok(preview.cautions.some((c) => c.includes('曲が1件もありません')));
});

test('写真が1枚も無いことも、止める理由にはしない', () => {
  const preview = previewImport(csv([HEAD, row(1, '')].join('\n')), null, 1_000);
  assert.equal(preview.ok, true);
  assert.equal(preview.photos, 0);
  assert.ok(preview.cautions.some((c) => c.includes('写真が1枚もありません')));
});

test('音源URLが入っている曲だけを数える', () => {
  const music = [
    'no,kind,title,music_url',
    '1,walkout_red,赤の曲,https://music.apple.com/jp/song/monkey-wrench/334812033',
    '2,walkout_blue,青の曲,',
  ].join('\n');
  const preview = previewImport(csv([HEAD, row(1)].join('\n'), music), null, 1_000);
  assert.equal(preview.cues, 2);
  assert.equal(preview.music, 1);
});
