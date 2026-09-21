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
  assert.ok(src.includes("shrink-0 ' + photoClass"), '写真の枠が余りをもらう作りに戻っている');
  assert.ok(src.includes('pairCommentSizeClass'), '意気込みの文字の大きさを長さで決めること');
});

test('写真の高さは、意気込みが長いほど下がるが 160px を下回らない', () => {
  let previous = 9999;
  for (let len = 0; len <= 500; len += 5) {
    const px = Number(photoHeightClass(len).match(/(\d+)/)![1]);
    assert.ok(px <= previous, len + '文字で写真が大きくなった');
    assert.ok(px >= 160, len + '文字で写真が ' + px + 'px まで小さくなった');
    previous = px;
  }
});

test('写真の高さは、赤青で必ず同じ値になる', () => {
  const a = pairPhotoHeightClass('短い', 'x'.repeat(300));
  const b = pairPhotoHeightClass('x'.repeat(300), '短い');
  assert.equal(a, b, '赤と青で入れ替えても同じ高さになること');
  assert.equal(a, photoHeightClass(300));
});
