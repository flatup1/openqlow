/**
 * タイマー計算（純関数だけ）。
 *
 * 大原則: タイマーは「残り秒」を保存しない。
 * 開始時刻(サーバー時刻)と積算だけを保存し、表示のたびに計算する。
 * → 再読み込みしても、後から繋いだ端末でも、必ず同じ値になる。
 */

import type { Timer } from './types.ts';

export function makeTimer(durationMs: number | null): Timer {
  return { mode: 'idle', startedAt: null, elapsedMs: 0, durationMs };
}

export function startTimer(t: Timer, now: number): Timer {
  if (t.mode === 'running') return t;
  return { mode: 'running', startedAt: now, elapsedMs: t.elapsedMs, durationMs: t.durationMs };
}

export function pauseTimer(t: Timer, now: number): Timer {
  if (t.mode !== 'running') return t;
  return {
    mode: 'paused',
    startedAt: null,
    elapsedMs: elapsedMs(t, now),
    durationMs: t.durationMs,
  };
}

/** 止めて頭出しに戻す。durationMs を渡すと目標時間も入れ替える */
export function resetTimer(t: Timer, durationMs?: number | null): Timer {
  return {
    mode: 'idle',
    startedAt: null,
    elapsedMs: 0,
    durationMs: durationMs === undefined ? t.durationMs : durationMs,
  };
}

/** 目標時間を入れ替えて、その場で走らせる（ラウンド開始・インターバル開始に使う） */
export function restartTimer(durationMs: number | null, now: number): Timer {
  return { mode: 'running', startedAt: now, elapsedMs: 0, durationMs };
}

export function elapsedMs(t: Timer, now: number): number {
  if (t.mode === 'running' && t.startedAt !== null) {
    const delta = now - t.startedAt;
    return t.elapsedMs + (delta > 0 ? delta : 0);
  }
  return t.elapsedMs;
}

/** 残り(ms)。カウントアップ(durationMs=null)のときは null。マイナスもそのまま返す（超過の可視化） */
export function remainingMs(t: Timer, now: number): number | null {
  if (t.durationMs === null) return null;
  return t.durationMs - elapsedMs(t, now);
}

/** 残りがマイナス = 時間超過 */
export function isOvertime(t: Timer, now: number): boolean {
  const r = remainingMs(t, now);
  return r !== null && r < 0;
}

/** "MM:SS"。1時間を超えたら "H:MM:SS"。マイナスは先頭に "-" */
export function formatDuration(ms: number): string {
  const negative = ms < 0;
  const total = Math.floor((negative ? -ms : ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body =
    h > 0
      ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
      : String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return (negative ? '-' : '') + body;
}

/** 画面に出す1行。カウントダウンは残り、カウントアップは経過 */
export function displayMs(t: Timer, now: number): number {
  const r = remainingMs(t, now);
  return r === null ? elapsedMs(t, now) : r;
}
