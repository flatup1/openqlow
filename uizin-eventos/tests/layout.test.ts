/**
 * 意気込みの長さで文字の大きさを変える判定。
 *
 * ここが壊れると「意気込みが長い試合だけ写真が切手サイズになる」という、
 * 当日いちばん困る形（誰の試合か分からない）に戻る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  commentSizeClass,
  pairCommentLength,
  pairCommentSizeClass,
  pairPhotoHeightClass,
  photoHeightClass,
} from '../core/layout.ts';

test('意気込みが長いほど、文字は小さくなる（同じか小さいかのどちらか）', () => {
  const order = ['text-xl', 'text-lg', 'text-base', 'text-sm', 'text-xs'];
  const rank = (cls: string) => order.indexOf(cls.split(' ')[0]);
  let previous = -1;
  for (let len = 0; len <= 400; len += 5) {
    const r = rank(commentSizeClass(len));
    assert.notEqual(r, -1, '想定外のクラス: ' + commentSizeClass(len));
    assert.ok(r >= previous, len + '文字で文字が大きくなった');
    previous = r;
  }
});

test('短い意気込みは大きく出す', () => {
  assert.equal(commentSizeClass('がんばります。'.length), 'text-xl sm:text-2xl');
});

test('実データで一番長かった294文字でも、読める大きさで止める', () => {
  assert.equal(commentSizeClass(294), 'text-xs sm:text-sm');
});

test('赤と青は、長い方に合わせて同じ大きさにする（左右で不揃いにしない）', () => {
  assert.equal(pairCommentLength('短い', 'x'.repeat(200)), 200);
  assert.equal(pairCommentSizeClass('短い', 'x'.repeat(200)), commentSizeClass(200));
  // 空欄が混ざっても落ちない
  assert.equal(pairCommentLength('', ''), 0);
  assert.equal(pairCommentSizeClass('', ''), 'text-xl sm:text-2xl');
});

test('/live/ の写真は、赤青で必ず同じ大きさになる作りをしている', () => {
  const src = readFileSync(new URL('../app/live/page.tsx', import.meta.url), 'utf8');
  // 写真の枠は決め打ちの高さにする。余りをもらう作りだと、
  // 意気込みが長い側だけ写真が小さくなり、赤と青で大きさが揃わない。
  assert.ok(src.includes('pairPhotoHeightClass'), '写真の高さを赤青で1つに決めていない');
  assert.ok(src.includes("shrink min-h-[72px] ' + photoClass"), '写真が縮めない作りに戻っている（カードの中身が切れる）');
  assert.ok(src.includes('pairCommentSizeClass'), '意気込みの文字の大きさを長さで決めること');
});

test('写真の高さは、意気込みが長いほど下がるが 160px を下回らない', () => {
  let previous = 9999;
  for (let len = 0; len <= 500; len += 5) {
    const cls = photoHeightClass(len);
    const px = Number(cls.match(/(\d+)px/)![1]);
    assert.ok(px <= previous, len + '文字で写真が大きくなった');
    assert.ok(px >= 160, len + '文字で写真が ' + px + 'px まで小さくなった');
    previous = px;
  }
});

test('写真の高さに、160px を下回りうる書き方を混ぜない', () => {
  // vh を混ぜると 900px の画面で 153px まで下がり、下限を割った（実測）。
  // 数字がそのまま高さになる書き方だけにして、下限を必ず守る。
  for (const len of [0, 100, 300]) {
    const cls = photoHeightClass(len);
    assert.match(cls, /^h-\[\d+px\]$/, len + '文字のとき、高さが読み取れない書き方: ' + cls);
  }
});

test('/live/ は、進行担当が必ず見るもの（名前・所属・入場曲）をスクロールさせない', () => {
  // 曲名がスクロールする側に入っていたため、iPad とスマホで隠れていた（実測）。
  const src = readFileSync(new URL('../app/live/page.tsx', import.meta.url), 'utf8');
  const scroll = src.indexOf('overflow-y-auto');
  const song = src.indexOf('入場曲:');
  assert.ok(scroll > 0 && song > 0, '入場曲の行とスクロール枠が見つからない');
  assert.ok(song < scroll, '入場曲の行がスクロールする枠の中にある');
});

test('写真の高さは、赤青で必ず同じ値になる', () => {
  const a = pairPhotoHeightClass('短い', 'x'.repeat(300));
  const b = pairPhotoHeightClass('x'.repeat(300), '短い');
  assert.equal(a, b, '赤と青で入れ替えても同じ高さになること');
  assert.equal(a, photoHeightClass(300));
});
