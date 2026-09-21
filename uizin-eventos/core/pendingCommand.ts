/**
 * 通信が切れている間に押された「次の試合へ／前の試合へ」を、
 * 取り消せる形でいったん預かり、通信が戻った瞬間に1回だけ送るための決まりごと。
 *
 * 何を直したかったのか。
 *   これまでは、通信が12秒途切れるとボタンが灰色になり、
 *   担当者は「押しても何も起きない画面」の前で立ち往生していた。
 *   会場のWi-Fiは不安定なので、当日いちばん起きやすい詰まり方がこれだった。
 *
 * それでも安全装置は1つも外していない。
 *   預かったコマンドには「押した時点の版（expectedVersion）」を貼り付ける。
 *   送るのは通信が戻ってからで、サーバーはこれまでどおり版を突き合わせる。
 *   もし別の端末が先に進めていたら、版が合わないので必ず拒否される。
 *   つまり「古い画面を見たまま進めてしまう」事故は起きない。
 *
 * 忘れた頃に勝手に動くのも事故なので、預かりは90秒で捨てる。
 * 捨てたことは黙らず、画面で担当者に伝える（sent でも expired でも必ず何か出す）。
 *
 * ここはネットワークもReactも知らない純粋な関数だけ。だからテストできる。
 */

import type { Command } from './types.ts';

/** 預かったまま送れなかったコマンドを捨てるまでの時間 */
export const PENDING_TTL_MS = 90_000;

export type PendingCommand = {
  command: Command;
  /** 担当者が押したボタンの文字。そのまま画面に出して「何を預かっているか」を示す */
  label: string;
  /** 押した時点で画面に出ていた版。ずれていればサーバーが拒否する */
  expectedVersion: number;
  queuedAt: number;
};

export type PendingDecision =
  | { kind: 'idle' }
  /** 通信が戻った。いま1回だけ送る */
  | { kind: 'send'; pending: PendingCommand }
  /** まだ通信が戻っていない。あと何ミリ秒で捨てるかを添える */
  | { kind: 'wait'; pending: PendingCommand; remainingMs: number }
  /** 時間切れ。送らずに捨てて、担当者に知らせる */
  | { kind: 'expired'; pending: PendingCommand };

function elapsed(pending: PendingCommand, now: number): number {
  // 端末の時計が巻き戻ることがある。負の経過時間で「永久に待つ」を作らない。
  return Math.max(0, now - pending.queuedAt);
}

/** 預かっているコマンドを、いまどう扱うか */
export function decidePending(
  pending: PendingCommand | null,
  canSendNow: boolean,
  now: number,
): PendingDecision {
  if (!pending) return { kind: 'idle' };
  // 時間切れの判定を先にする。90秒前の「次へ」を、戻った瞬間に送ってはいけない。
  const passed = elapsed(pending, now);
  if (passed >= PENDING_TTL_MS) return { kind: 'expired', pending };
  if (canSendNow) return { kind: 'send', pending };
  return { kind: 'wait', pending, remainingMs: PENDING_TTL_MS - passed };
}

/**
 * 「通信が戻るまで預かります」を担当者に出してよい場面か。
 *
 * 出さない場面を先に決めてある:
 *   - 合言葉が無い端末（そもそも操作できない）
 *   - 直前の操作の結果が分からない（重ねると二重進行になる）
 *   - 緊急停止中（止めている最中に進めない）
 *   - すでに1つ預かっている（2つ以上は預からない。押した数だけ進むのが事故）
 *   - いま送れる（預かる必要がない。そのまま送る）
 */
export function canQueue(args: {
  hasKey: boolean;
  uncertain: boolean;
  held: boolean;
  canSendNow: boolean;
  pending: PendingCommand | null;
}): boolean {
  return args.hasKey && !args.uncertain && !args.held && !args.canSendNow && args.pending === null;
}

/** 画面に出す「あと◯秒」。秒未満は切り上げて、0秒と出さない */
export function waitCountdownLabel(remainingMs: number): string {
  return 'あと' + Math.max(1, Math.ceil(remainingMs / 1000)) + '秒で取り消します';
}
