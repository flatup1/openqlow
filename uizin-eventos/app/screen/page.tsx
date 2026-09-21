'use client';

/**
 * 画面3: 表示専用画面（大型モニター向け・完全に閲覧専用）
 *
 * 出すのは「対戦カード」と「意気込み」だけ。それ以外は足さない。
 *
 * 選手写真について:
 *   写真は「あれば出す、なければ今までどおり」。写真のせいで対戦カードが出ない、
 *   という壊れ方だけは絶対に作らない。読み込みに失敗したら黙って名前だけに戻す。
 *   写真を出してよいかは同意の範囲の問題なので、出さない選手は進行表の写真欄を空にする。
 */

import { useState } from 'react';
import { useEventState, useTick } from '../lib/useEventState.ts';
import { TimerBar } from '../components/TimerBar.tsx';
import { HoldOverlay } from '../components/HoldOverlay.tsx';
import { Loading } from '../components/Loading.tsx';
import { currentMatch, nextMatch } from '../../core/state.ts';
import type { Fighter } from '../../core/types.ts';

function Corner({ side, fighter }: { side: 'red' | 'blue'; fighter: Fighter }) {
  const isRed = side === 'red';
  // 写真が読めなかったら、名前だけの表示に戻す。画面は止めない。
  const [photoBroken, setPhotoBroken] = useState(false);
  const showPhoto = fighter.photo !== '' && !photoBroken;

  const accent = isRed ? 'text-rose-400' : 'text-sky-400';
  const border = isRed ? 'border-rose-600' : 'border-sky-600';
  const bg = isRed ? 'bg-rose-950/40' : 'bg-sky-950/40';
  const rule = isRed ? 'bg-rose-500' : 'bg-sky-500';

  return (
    <div
      className={
        'relative flex flex-1 flex-col overflow-hidden rounded-3xl border-4 ' +
        border +
        (showPhoto ? ' bg-black' : ' ' + bg)
      }
    >
      {showPhoto ? (
        <>
          <img
            src={fighter.photo}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            onError={() => setPhotoBroken(true)}
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
          {/*
            名前を読めるようにするための覆い。
            濃くしすぎると顔が見えなくなり、薄くすると名前が沈む。
            下だけ濃く、顔のあたりは薄く、という配分にしてある。
          */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.05) 100%)',
            }}
          />
        </>
      ) : null}

      <div className={'relative flex flex-1 flex-col justify-end p-8' + (showPhoto ? '' : ' justify-center')}>
        <p className={'text-lg font-black tracking-widest ' + accent}>{isRed ? 'RED' : 'BLUE'}</p>
        <p className="mt-2 text-[clamp(2.5rem,6vw,6rem)] font-black leading-none text-white drop-shadow-lg">
          {fighter.name || '—'}
        </p>
        <div className={'mt-3 h-1.5 w-full max-w-[18rem] rounded-full ' + rule} />
        <p className="mt-4 text-[clamp(1rem,1.8vw,1.9rem)] font-semibold text-slate-200 drop-shadow">
          {[fighter.team, fighter.record].filter(Boolean).join('　/　')}
        </p>
        {fighter.comment ? (
          <p className="mt-6 border-t border-white/25 pt-5 text-[clamp(1.2rem,2.4vw,2.6rem)] font-bold leading-snug text-white drop-shadow-lg">
            「{fighter.comment}」
          </p>
        ) : null}
      </div>
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
            <p className="mt-4 text-center text-[clamp(0.9rem,1.6vw,1.6rem)] font-black tracking-wider text-slate-400">
              {[match.className, match.rule, match.rounds + 'R'].filter(Boolean).join('　/　')}
            </p>
            {upcoming ? (
              <p className="mt-2 text-center text-[clamp(0.9rem,1.6vw,1.6rem)] font-bold text-slate-500">
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
