/**
 * 設定ロック（core/settingsLock.ts）。
 *
 * 守りたいのは2つだけ:
 *   - 大会中にうっかり設定が変わらない
 *   - そのせいで、曲や試合の進行まで使えなくならない
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNLOCK_WINDOW_MS,
  canRun,
  isUnlocked,
  needsUnlock,
  remainingUnlockMs,
  unlockCountdownLabel,
} from '../core/settingsLock.ts';

const NOW = 1_700_000_000_000;

// --- 何をロックするか -------------------------------------------------------

test('曲の再生・停止と、前／次の試合は、ロック中でもそのまま使える', () => {
  for (const action of ['play_music', 'stop_music', 'prev_match', 'next_match'] as const) {
    assert.equal(needsUnlock(action), false, action + ' はロックしない');
    assert.equal(canRun(action, null, NOW), true, action + ' はロック中でも使える');
  }
});

test('設定とデータを変えるものは、解除しないと使えない', () => {
  for (const action of ['change_key', 'change_api', 'reload_program'] as const) {
    assert.equal(needsUnlock(action), true, action + ' はロックする');
    assert.equal(canRun(action, null, NOW), false, action + ' はロック中は使えない');
  }
});

// --- いつ閉じるか -----------------------------------------------------------

test('解除していなければ、いつでもロック中', () => {
  assert.equal(isUnlocked(null, NOW), false);
  assert.equal(remainingUnlockMs(null, NOW), 0);
  assert.equal(unlockCountdownLabel(null, NOW), 'ロック中');
});

test('解除した直後は使えて、時間が来ると自動で閉じる', () => {
  assert.equal(isUnlocked(NOW, NOW), true);
  assert.equal(canRun('change_key', NOW, NOW), true);

  // 窓の内側
  assert.equal(isUnlocked(NOW, NOW + UNLOCK_WINDOW_MS - 1), true);
  // ちょうど時間切れ（境界は「閉じる」側に倒す）
  assert.equal(isUnlocked(NOW, NOW + UNLOCK_WINDOW_MS), false);
  assert.equal(canRun('change_key', NOW, NOW + UNLOCK_WINDOW_MS), false);
});

test('閉じたあとも、曲と前／次はそのまま使える（ロックで大会を止めない）', () => {
  const later = NOW + UNLOCK_WINDOW_MS * 10;
  assert.equal(canRun('change_key', NOW, later), false);
  assert.equal(canRun('next_match', NOW, later), true);
  assert.equal(canRun('prev_match', NOW, later), true);
  assert.equal(canRun('play_music', NOW, later), true);
  assert.equal(canRun('stop_music', NOW, later), true);
});

test('端末の時計が巻き戻っても、勝手に開きっぱなしにならない', () => {
  assert.equal(isUnlocked(NOW, NOW - 1), false);
  assert.equal(canRun('change_key', NOW, NOW - 60_000), false);
});

test('こわれた時刻を渡されても、開かない', () => {
  assert.equal(isUnlocked(Number.NaN, NOW), false);
  assert.equal(isUnlocked(NOW, Number.NaN), false);
  assert.equal(isUnlocked(Number.POSITIVE_INFINITY, NOW), false);
});

// --- 残り時間の見せ方 -------------------------------------------------------

test('残り時間は「あと◯秒」と、切り上げで出す', () => {
  assert.equal(remainingUnlockMs(NOW, NOW), UNLOCK_WINDOW_MS);
  assert.equal(unlockCountdownLabel(NOW, NOW), 'あと60秒で自動ロック');
  assert.equal(unlockCountdownLabel(NOW, NOW + 59_500), 'あと1秒で自動ロック');
  assert.equal(unlockCountdownLabel(NOW, NOW + UNLOCK_WINDOW_MS), 'ロック中');
});

test('解除の長さは60秒。短すぎても長すぎても意味がなくなる', () => {
  assert.equal(UNLOCK_WINDOW_MS, 60_000);
});
