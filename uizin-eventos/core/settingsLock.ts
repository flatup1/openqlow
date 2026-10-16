/**
 * 設定ロック — 当日の誤操作で「設定」と「データ」が変わらないようにする。
 *
 * 大会中にいちばん困るのは、進行担当が画面のどこかに触れてしまい、
 * 合言葉や接続先が消えて**進行そのものが止まる**こと。
 * かといって、曲の再生・停止や前後の試合移動まで固めると、今度は使えない画面になる。
 *
 * そこで操作を2種類に分ける:
 *
 *   1. いつも使うもの（再生・停止・前の試合・次の試合） … ロックしない
 *   2. 設定とデータを変えるもの（合言葉・接続先・取り込み） … 解除しないと使えない
 *
 * 解除は一時的で、一定時間さわらなければ自動で閉じる。
 * 「解除したまま放置して、結局ロックが無いのと同じ」を作らないため。
 */

/** 解除がひとりでに閉じるまでの時間（ミリ秒） */
export const UNLOCK_WINDOW_MS = 60_000;

/** `/live/` で起こりうる操作 */
export type LiveAction =
  // いつも使う
  | 'play_music'
  | 'stop_music'
  | 'prev_match'
  | 'next_match'
  // 設定・データを変える
  | 'change_key'
  | 'change_api'
  | 'reload_program';

/** ロック中でも必ず使える操作。ここを増やすときは理由を書くこと */
const ALWAYS_ALLOWED: readonly LiveAction[] = ['play_music', 'stop_music', 'prev_match', 'next_match'];

/** その操作は、ロックを解除しないと使えないか */
export function needsUnlock(action: LiveAction): boolean {
  return !ALWAYS_ALLOWED.includes(action);
}

/**
 * いま解除されているか。
 *
 * `unlockedAt` が null なら解除していない。
 * 端末の時計が巻き戻った場合（now < unlockedAt）は、安全側に倒して「ロック中」とみなす。
 */
export function isUnlocked(unlockedAt: number | null, now: number, windowMs: number = UNLOCK_WINDOW_MS): boolean {
  if (unlockedAt === null) return false;
  if (!Number.isFinite(unlockedAt) || !Number.isFinite(now)) return false;
  if (now < unlockedAt) return false;
  return now - unlockedAt < windowMs;
}

/** 自動で閉じるまであと何ミリ秒か（閉じていれば 0） */
export function remainingUnlockMs(
  unlockedAt: number | null,
  now: number,
  windowMs: number = UNLOCK_WINDOW_MS,
): number {
  if (!isUnlocked(unlockedAt, now, windowMs)) return 0;
  return windowMs - (now - (unlockedAt as number));
}

/** 画面から呼ぶ最終判定。「使ってよいか」をここ1か所で決める */
export function canRun(
  action: LiveAction,
  unlockedAt: number | null,
  now: number,
  windowMs: number = UNLOCK_WINDOW_MS,
): boolean {
  return !needsUnlock(action) || isUnlocked(unlockedAt, now, windowMs);
}

/** 残り時間を「あと◯秒」と書くための文字列（切り上げ） */
export function unlockCountdownLabel(
  unlockedAt: number | null,
  now: number,
  windowMs: number = UNLOCK_WINDOW_MS,
): string {
  const left = remainingUnlockMs(unlockedAt, now, windowMs);
  if (left <= 0) return 'ロック中';
  return 'あと' + Math.ceil(left / 1000) + '秒で自動ロック';
}
