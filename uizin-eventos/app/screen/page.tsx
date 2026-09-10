'use client';

/**
 * 画面3: 表示専用画面（大型モニター向け・完全に閲覧専用）
 *
 * 出すのは「対戦カード」と「意気込み」だけ。それ以外は足さない。
 */

import { useEventState, useTick } from '../lib/useEventState.ts';
import { TimerBar } from '../components/TimerBar.tsx';
import { HoldOverlay } from '../components/HoldOverlay.tsx';
import { Loading } from '../components/Loading.tsx';
import { currentMatch, nextMatch } from '../../core/state.ts';
import type { Fighter } from '../../core/types.ts';

function Corner({ side, fighter }: { side: 'red' | 'blue'; fighter: Fighter }) {
  const isRed = side === 'red';
  return (
    <div
      className={
        'flex flex-1 flex-col justify-center rounded-3xl border-4 p-8 ' +
        (isRed ? 'border-rose-600 bg-rose-950/40' : 'border-sky-600 bg-sky-950/40')
      }
    >
      <p className={'text-lg font-black tracking-widest ' + (isRed ? 'text-rose-400' : 'text-sky-400')}>
        {isRed ? 'RED' : 'BLUE'}
      </p>
      <p className="mt-2 text-[clamp(2.5rem,6vw,6rem)] font-black leading-none text-white">
        {fighter.name || '—'}
      </p>
      <p className="mt-4 text-[clamp(1rem,1.8vw,1.9rem)] font-semibold text-slate-300">
        {[fighter.team, fighter.record].filter(Boolean).join('　/　')}
      </p>
      {fighter.comment ? (
        <p className="mt-8 border-t border-white/20 pt-6 text-[clamp(1.2rem,2.4vw,2.6rem)] font-bold leading-snug text-white">
          「{fighter.comment}」
        </p>
      ) : null}
    </div>
  );
}

export default function ScreenPage() {
  const store = useEventState();
  const tick = useTick(200);

  if (!store.snapshot) return <Loading connection={store.connection} error={store.error} />;

  const { state, program } = store.snapshot;
  const now = store.serverNow();
  const match = currentMatch(program, state);
  const upcoming = nextMatch(program, state);

  if (state.hold.active) {
    return (
      <>
        <TimerBar state={state} program={program} now={now} connection={store.connection} />
        <HoldOverlay message={state.hold.message} />
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col" data-tick={tick}>
      <TimerBar state={state} program={program} now={now} connection={store.connection} />

      <main className="flex flex-1 flex-col px-6 py-6">
        {match ? (
          <>
            <p className="mb-4 text-center text-[clamp(1.2rem,2.6vw,2.4rem)] font-black tracking-widest text-slate-300">
              第{match.no}試合　{[match.className, match.rule].filter(Boolean).join('　/　')}
            </p>
            <div className="flex flex-1 flex-col gap-4 lg:flex-row">
              <Corner side="red" fighter={match.red} />
              <div className="flex items-center justify-center text-[clamp(2rem,5vw,5rem)] font-black text-slate-600">
                VS
              </div>
              <Corner side="blue" fighter={match.blue} />
            </div>
            {upcoming ? (
              <p className="mt-4 text-center text-[clamp(0.9rem,1.6vw,1.6rem)] font-bold text-slate-400">
                NEXT　第{upcoming.no}試合　{upcoming.red.name} vs {upcoming.blue.name}
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="text-[clamp(2rem,6vw,6rem)] font-black text-white">{program.meta.title}</p>
            {program.meta.venue ? (
              <p className="mt-4 text-[clamp(1rem,2vw,2rem)] font-bold text-slate-400">{program.meta.venue}</p>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
