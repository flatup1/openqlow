/**
 * 選手写真URLの変換。
 *
 * 現場で実際に貼られるのは Google ドライブの共有リンク。あの形式は <img> で出ない。
 * ここを外すと「写真だけ出ない」という、当日いちばん原因の分かりにくい壊れ方になる。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driveFileId, normalizePhotoUrl, photoStatus } from '../core/photo.ts';
import { parseProgram } from '../core/sheet.ts';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

test('ドライブの共有リンクを、表示できる形に直す', () => {
  const expected = 'https://drive.google.com/thumbnail?id=' + ID + '&sz=w1200';
  assert.equal(normalizePhotoUrl('https://drive.google.com/file/d/' + ID + '/view?usp=sharing'), expected);
  assert.equal(normalizePhotoUrl('https://drive.google.com/open?id=' + ID), expected);
  assert.equal(normalizePhotoUrl('https://drive.google.com/uc?id=' + ID + '&export=download'), expected);
});

test('文章が混ざっていてもURLだけ拾う', () => {
  assert.equal(
    normalizePhotoUrl('顔写真です https://drive.google.com/file/d/' + ID + '/view'),
    'https://drive.google.com/thumbnail?id=' + ID + '&sz=w1200',
  );
});

test('画像の直リンクはそのまま使う', () => {
  assert.equal(normalizePhotoUrl('https://example.com/a/b.jpg'), 'https://example.com/a/b.jpg');
  assert.equal(normalizePhotoUrl('https://example.com/a/b.PNG?v=2'), 'https://example.com/a/b.PNG?v=2');
});

test('画像として読めないものは空にする（黙って壊れた画像を出さない）', () => {
  assert.equal(normalizePhotoUrl('https://www.instagram.com/p/abc123/'), '');
  assert.equal(normalizePhotoUrl('あとで送ります'), '');
  assert.equal(normalizePhotoUrl(''), '');
});

test('写真の状態を3つに分ける（前日に気づけるように）', () => {
  assert.equal(photoStatus(''), 'none');
  assert.equal(photoStatus('なし'), 'none');
  assert.equal(photoStatus('写真なし'), 'none');
  assert.equal(photoStatus('https://drive.google.com/file/d/' + ID + '/view'), 'ok');
  assert.equal(photoStatus('https://www.instagram.com/p/abc123/'), 'unusable');
});

test('ファイルIDを取り違えない', () => {
  assert.equal(driveFileId('https://drive.google.com/file/d/' + ID + '/view'), ID);
  assert.equal(driveFileId('https://example.com/file/d/' + ID + '/view'), '');
});

test('番組表の取り込みで、赤と青それぞれの写真が入る', () => {
  const matches = [
    'no,class,rule,rounds,round_seconds,break_seconds,red_name,red_photo,red_comment,blue_name,blue_photo,blue_comment',
    '1,一般,MMA,2,2:00,60,赤の人,https://drive.google.com/file/d/' + ID + '/view,いきます,青の人,,よろしく',
  ].join('\n');
  const p = parseProgram({ event: 'key,value\n', matches, music: 'no\n' }, 0);
  assert.equal(p.matches.length, 1);
  assert.equal(p.matches[0].red.photo, 'https://drive.google.com/thumbnail?id=' + ID + '&sz=w1200');
  // 写真なしは空のまま。名前だけで表示される
  assert.equal(p.matches[0].blue.photo, '');
});

test('日本語の列名でも読める（赤_写真 / 青_画像）', () => {
  const matches = [
    'no,赤_名前,赤_写真,青_名前,青_画像',
    '1,赤の人,https://drive.google.com/file/d/' + ID + '/view,青の人,https://example.com/x.jpg',
  ].join('\n');
  const p = parseProgram({ event: 'key,value\n', matches, music: 'no\n' }, 0);
  assert.equal(p.matches[0].red.photo, 'https://drive.google.com/thumbnail?id=' + ID + '&sz=w1200');
  assert.equal(p.matches[0].blue.photo, 'https://example.com/x.jpg');
});

// --- EventOS 自身が配る写真（2026-09-21 に追加） -----------------------------

test('Worker の /api/photos/ は拡張子が無くても写真として使う', () => {
  // 実測（2026-09-21）: content-type は image/jpeg で、<img> にそのまま入れて出る。
  // ここを弾くと、進行表の写真75枚のうち36枚が消える。
  const url = 'https://uizin-eventos-api.flatupgym.workers.dev/api/photos/UZ23-4C622F4F';
  assert.equal(normalizePhotoUrl(url), url);
  assert.equal(photoStatus(url), 'ok');
});

test('/api/photos/ に似ていても、別物は通さない', () => {
  // http（暗号化なし）は通さない
  assert.equal(normalizePhotoUrl('http://example.com/api/photos/abc'), '');
  // 受付番号の先が無いものは通さない
  assert.equal(normalizePhotoUrl('https://example.com/api/photos/'), '');
  // さらに階層があるものは通さない（想定外の形を黙って通さない）
  assert.equal(normalizePhotoUrl('https://example.com/api/photos/a/b'), '');
});
