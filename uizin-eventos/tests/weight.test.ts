/**
 * 契約体重（core/weight.ts）。
 *
 * 赤青で体重が違うとき、掲示するのは「重い方」。
 * 間違った契約体重を出すくらいなら出さない、を守っているかを見る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatKg, matchWeights, parseWeightKg } from '../core/weight.ts';

test('進行表にある書き方をひととおり読める', () => {
  assert.equal(parseWeightKg('16.5 kg'), 16.5);
  assert.equal(parseWeightKg('16.5kg'), 16.5);
  assert.equal(parseWeightKg('16.5'), 16.5);
  assert.equal(parseWeightKg('16.5 kg kg'), 16.5);   // 実データにあった重複表記
  assert.equal(parseWeightKg('１６．５ｋｇ'), 16.5);   // 全角
  assert.equal(parseWeightKg(' 70.0 kg '), 70);
});

test('読めないもの・ありえない値は null にする', () => {
  assert.equal(parseWeightKg(''), null);
  assert.equal(parseWeightKg('未計量'), null);
  assert.equal(parseWeightKg('0kg'), null);
  assert.equal(parseWeightKg('5kg'), null);      // 人の体重として低すぎる
  assert.equal(parseWeightKg('250kg'), null);    // 高すぎる
});

test('契約体重は重い方に合わせる', () => {
  const w = matchWeights('31.0 kg', '32.0 kg');
  assert.ok(w);
  assert.equal(w.contract, 32);
  assert.equal(w.diff, 1);
});

test('赤が重い場合も、重い方が契約体重になる', () => {
  const w = matchWeights('70.0 kg', '62.5 kg');
  assert.ok(w);
  assert.equal(w.contract, 70);
  assert.equal(w.diff, 7.5);
});

test('同じ体重なら差はゼロ', () => {
  const w = matchWeights('16.5 kg', '16.5 kg');
  assert.ok(w);
  assert.equal(w.contract, 16.5);
  assert.equal(w.diff, 0);
});

test('片方でも読めなければ掲示しない（片方だけの契約体重は意味がない）', () => {
  assert.equal(matchWeights('31.0 kg', ''), null);
  assert.equal(matchWeights('', '32.0 kg'), null);
  assert.equal(matchWeights('未計量', '32.0 kg'), null);
});

test('掲示は小数第1位までで揃える', () => {
  assert.equal(formatKg(20), '20.0kg');
  assert.equal(formatKg(16.5), '16.5kg');
  assert.equal(formatKg(70), '70.0kg');
});
