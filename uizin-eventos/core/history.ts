/**
 * 「直前の一手だけ元に戻せる」ための最小の履歴。
 *
 * v1では、あえて1手だけにする。
 * 何手も戻せると、本番で「どこまで戻したか分からない」事故が起きるため。
 */

import type { EventState, LogEntry } from './types.ts';

export type History = {
  current: EventState;
  /** 直前の状態。無ければ null */
  previous: EventState | null;
  /** 操作ログ（新しい順・最大 LOG_LIMIT 件） */
  log: LogEntry[];
};

export const LOG_LIMIT = 50;

export function newHistory(state: EventState): History {
  return { current: state, previous: null, log: [] };
}

/** 状態が変わったときに履歴へ積む */
export function commit(history: History, next: EventState): History {
  const log = next.lastCommand ? [next.lastCommand, ...history.log].slice(0, LOG_LIMIT) : history.log;
  return { current: next, previous: history.current, log };
}

export type UndoResult = { history: History; changed: boolean; reason: string | null };

/**
 * 直前の一手を取り消す。
 * version は前に戻さず、必ず進める（全画面の「新しい方を採用する」判定を壊さないため）。
 */
export function undo(history: History, now: number): UndoResult {
  if (!history.previous) {
    return { history, changed: false, reason: '元に戻せる操作がありません。' };
  }
  const undone = history.current.lastCommand;
  const version = history.current.version + 1;
  const entry: LogEntry = {
    type: 'undo',
    at: now,
    label: '元に戻す' + (undone ? '（' + undone.label + '）' : ''),
    version,
  };
  const restored: EventState = {
    ...history.previous,
    version,
    updatedAt: now,
    lastCommand: entry,
  };
  return {
    history: {
      current: restored,
      previous: null,
      log: [entry, ...history.log].slice(0, LOG_LIMIT),
    },
    changed: true,
    reason: null,
  };
}

export function canUndo(history: History): boolean {
  return history.previous !== null;
}

/** 直前の一手の説明（ボタンに出す） */
export function undoLabel(history: History): string {
  const last = history.current.lastCommand;
  if (!history.previous || !last) return '元に戻せる操作はありません';
  return '元に戻す: ' + last.label;
}
