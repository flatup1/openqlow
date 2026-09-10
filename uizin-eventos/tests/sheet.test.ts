import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram, sheetCsvUrl } from '../core/sheet.ts';
import { parseSeconds, toRows } from '../core/csv.ts';
import { buildProgram, EVENT_CSV, MATCHES_CSV, MUSIC_CSV } from './fixtures.ts';

test('スプレッドシートのCSVから番組表を組み立てる', () => {
  const p = buildProgram();
  assert.equal(p.meta.title, 'UIZIN 第1回');
  assert.equal(p.meta.venue, '成田市中台体育館');
  assert.equal(p.matches.length, 2);
  assert.equal(p.matches[0].red.name, '山田 太郎');
  assert.equal(p.matches[0].red.comment, '必ず勝ちます');
  assert.equal(p.matches[0].rounds, 2);
  assert.equal(p.matches[0].roundSeconds, 180);
  assert.equal(p.matches[0].breakSeconds, 60);
  assert.equal(p.matches[1].roundSeconds, 120);
  assert.equal(p.cues.length, 4);
  assert.equal(p.cues[1].kind, 'walkout_red');
  assert.equal(p.cues[1].matchNo, 1);
});

test('日本語の見出しでも取り込める', () => {
  const csv = [
    '番号,クラス,ルール,ラウンド数,ラウンド秒,インターバル秒,赤_名前,赤_所属,赤_戦績,赤_意気込み,青_名前,青_所属,青_戦績,青_意気込み',
    '1,ライト級,MMA,2,3分,1分,赤選手,Aジム,1勝,がんばります,青選手,Bジム,2勝,勝ちます',
  ].join('\n');
  const p = parseProgram({ event: EVENT_CSV, matches: csv, music: MUSIC_CSV }, 0);
  assert.equal(p.matches.length, 1);
  assert.equal(p.matches[0].red.name, '赤選手');
  assert.equal(p.matches[0].roundSeconds, 180);
  assert.equal(p.matches[0].breakSeconds, 60);
});

test('壊れた行は捨てて、番組表の取り込み自体は止めない', () => {
  const csv = [
    'no,red_name,blue_name',
    '1,,',
    '2,赤,青',
  ].join('\n');
  const p = parseProgram({ event: '', matches: csv, music: '' }, 0);
  assert.equal(p.matches.length, 1);
  assert.equal(p.matches[0].no, 2);
  assert.ok(p.warnings.length > 0);
});

test('試合番号は昇順に並べ直す', () => {
  const csv = ['no,red_name,blue_name', '3,c,d', '1,a,b'].join('\n');
  const p = parseProgram({ event: '', matches: csv, music: '' }, 0);
  assert.deepEqual(p.matches.map((m) => m.no), [1, 3]);
});

test('中身が同じなら revision は同じ、変われば変わる', () => {
  const a = parseProgram({ event: EVENT_CSV, matches: MATCHES_CSV, music: MUSIC_CSV }, 1);
  const b = parseProgram({ event: EVENT_CSV, matches: MATCHES_CSV, music: MUSIC_CSV }, 2);
  const c = parseProgram({ event: EVENT_CSV, matches: MATCHES_CSV + '\n3,,,,,,x,,,,y,,,,', music: MUSIC_CSV }, 1);
  assert.equal(a.revision, b.revision);
  assert.notEqual(a.revision, c.revision);
});

test('CSVの引用符・改行・カンマを正しく読む', () => {
  const rows = toRows('a,b\n1,"x,y"\n2,"line1\nline2"\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].b, 'x,y');
  assert.equal(rows[1].b, 'line1\nline2');
});

test('秒数の書き方はどれでも受け取る', () => {
  assert.equal(parseSeconds('3:00', 0), 180);
  assert.equal(parseSeconds('180', 0), 180);
  assert.equal(parseSeconds('3分', 0), 180);
  assert.equal(parseSeconds('1分30秒', 0), 90);
  assert.equal(parseSeconds('', 99), 99);
  assert.equal(parseSeconds('なし', 99), 99);
});

test('シートCSVのURLを組み立てる', () => {
  assert.equal(
    sheetCsvUrl('ABC123', 'matches'),
    'https://docs.google.com/spreadsheets/d/ABC123/gviz/tq?tqx=out:csv&sheet=matches',
  );
});
