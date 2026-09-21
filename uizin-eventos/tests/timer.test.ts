import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  displayMs,
  elapsedMs,
  formatDuration,
  isOvertime,
  makeTimer,
  pauseTimer,
  remainingMs,
  resetTimer,
  restartTimer,
  startTimer,
} from '../core/timer.ts';

test('カウントダウンは開始時刻からの計算で決まる', () => {
  const t0 = 1_000_000;
  const t = startTimer(makeTimer(180_000), t0);
  assert.equal(remainingMs(t, t0), 180_000);
  assert.equal(remainingMs(t, t0 + 60_000), 120_000);
  assert.equal(remainingMs(t, t0 + 180_000), 0);
});

test('一時停止と再開で時間が飛ばない', () => {
  const t0 = 0;
  let t = startTimer(makeTimer(180_000), t0);
  t = pauseTimer(t, t0 + 30_000);
  assert.equal(remainingMs(t, t0 + 999_999), 150_000, '止めている間は減らない');
  t = startTimer(t, t0 + 100_000);
  assert.equal(remainingMs(t, t0 + 110_000), 140_000);
});

test('時間超過はマイナスで表す（勝手に止めない）', () => {
  const t = startTimer(makeTimer(10_000), 0);
  assert.equal(remainingMs(t, 12_000), -2_000);
  assert.equal(isOvertime(t, 12_000), true);
  assert.equal(isOvertime(t, 9_000), false);
});

test('カウントアップ（Event Timer）は残りを持たない', () => {
  const t = startTimer(makeTimer(null), 0);
  assert.equal(remainingMs(t, 5_000), null);
  assert.equal(elapsedMs(t, 5_000), 5_000);
  assert.equal(displayMs(t, 5_000), 5_000);
});

test('リセットは頭出しに戻し、目標時間も入れ替えられる', () => {
  let t = startTimer(makeTimer(180_000), 0);
  t = resetTimer(t, 60_000);
  assert.equal(t.mode, 'idle');
  assert.equal(t.elapsedMs, 0);
  assert.equal(remainingMs(t, 999_999), 60_000);
});

test('restartTimer はその場で走らせる', () => {
  const t = restartTimer(120_000, 5_000);
  assert.equal(t.mode, 'running');
  assert.equal(remainingMs(t, 5_000 + 1_000), 119_000);
});

test('同じタイマーは、どの端末のどの時刻計算でも同じ値になる', () => {
  const t = startTimer(makeTimer(180_000), 1_700_000_000_000);
  const 端末A = remainingMs(t, 1_700_000_045_000);
  const 端末B = remainingMs(t, 1_700_000_045_000);
  assert.equal(端末A, 端末B);
  assert.equal(端末A, 135_000);
});

test('表示のフォーマット', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65_000), '01:05');
  assert.equal(formatDuration(3_600_000), '1:00:00');
  assert.equal(formatDuration(-5_000), '-00:05');
  assert.equal(formatDuration(999), '00:00');
});
