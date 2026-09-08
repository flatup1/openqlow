'use client';

/**
 * どの画面でも同じ位置（いちばん上）に出る帯。
 * Event Timer と Round Timer は、5画面すべてで同じ場所・同じ大きさにする。
 */

import type { EventState, Program } from '../../core/types.ts';
import { displayMs, formatDuration, isOvertime, remainingMs } from '../../core/timer.ts';
import { currentMatch, phaseLabel } from '../../core/state.ts';
import type { Connection } from '../lib/useEventState.ts';

const CONNECTION_TEXT: Record<Connection, string> = {
  connecting: '接続中',
  live: '同期中',
  polling: '低速同期',
  offline: '未接続',
};

const CONNECTION_COLOR: Record<Connection, string> = {
  connecting: 'bg-slate-500',
  live: 'bg-emerald-500',
  polling: 'bg-amber-400',
  offline: 'bg-rose-600',
};

export function ConnectionBadge({ connection }: { connection: Connection }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-sm font-semibold text-slate-200">
      <span className={'h-2.5 w-2.5 rounded-full ' + CONNECTION_COLOR[connection]} aria-hidden />
      {CONNECTION_TEXT[connection]}
    </span>
  );
}

export function TimerBar({
  state,
  program,
  now,
  connection,
}: {
  state: EventState;
  program: Program;
  now: number;
  connection: Connection;
}) {
  const match = currentMatch(program, state);
  const roundOver = isOvertime(state.roundTimer, now);
  const roundLeft = remainingMs(state.roundTimer, now);
  const roundWarning = roundLeft !== null && roundLeft <= 10_000 && roundLeft > 0;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0e14]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        <div className="flex flex-col leading-none">
          <span className="text-[0.7rem] font-semibold tracking-widest text-slate-400">EVENT</span>
          <span className="tabular text-3xl font-bold text-slate-100 sm:text-4xl">
            {formatDuration(displayMs(state.eventTimer, now))}
          </span>
        </div>

        <div className="flex flex-col leading-none">
          <span className="text-[0.7rem] font-semibold tracking-widest text-slate-400">
            ROUND {state.phase === 'interval' ? '（インターバル）' : 'R' + state.round}
          </span>
          <span
            className={
              'tabular text-3xl font-bold sm:text-4xl ' +
              (roundOver ? 'text-rose-400' : roundWarning ? 'text-amber-300' : 'text-slate-100')
            }
          >
            {formatDuration(displayMs(state.roundTimer, now))}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[0.7rem] font-semibold tracking-widest text-slate-400">
            {phaseLabel(state.phase)}
          </span>
          <span className="truncate text-base font-semibold text-slate-200 sm:text-lg">
            {match ? '第' + match.no + '試合　' + match.red.name + ' vs ' + match.blue.name : program.meta.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {state.hold.active ? (
            <span className="rounded-full bg-rose-600 px-3 py-1 text-sm font-bold text-white">停止中</span>
          ) : null}
          <ConnectionBadge connection={connection} />
          <span className="tabular hidden text-xs text-slate-500 sm:inline">v{state.version}</span>
        </div>
      </div>
    </header>
  );
}
