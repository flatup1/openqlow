'use client';

/**
 * 画面4: Event Mix（閲覧専用）
 *
 * 出すのは「今の曲」「次の曲」「あと何秒」の3つだけ。
 * v1では自動再生をしない。再生ボタンは、人が外部サービス（Apple Music / YouTube）で押す。
 * ここに置いてあるのは「開く」リンクだけで、システムは音を鳴らさない。
 */

import { useEventState, useTick } from '../lib/useEventState.ts';
import { TimerBar } from '../components/TimerBar.tsx';
import { HoldOverlay } from '../components/HoldOverlay.tsx';
import { Loading } from '../components/Loading.tsx';
import { currentCue, nextCue } from '../../core/state.ts';
import { displayMs, formatDuration, remainingMs } from '../../core/timer.ts';
import { colorClass, judgeCue } from '../../core/music.ts';
import { cueKindLabel } from '../../core/sheet.ts';

export default function MixPage() {
  const store = useEventState();
  const tick = useTick(200);

  if (!store.snapshot) return <Loading connection={store.connection} error={store.error} />;

  const { state, program, musicReport } = store.snapshot;
  const now = store.serverNow();
  const links = musicReport?.links ?? [];
  const cue = currentCue(program, state);
  const upcoming = nextCue(program, state);
  const verdict = cue ? judgeCue(cue, links) : null;
  const upcomingVerdict = upcoming ? judgeCue(upcoming, links) : null;
  const left = remainingMs(state.cueTimer, now);
  const nearEnd = left !== null && left <= 15_000;

  if (state.hold.active) {
    return (
      <>
        <TimerBar state={state} program={program} now={now} connection={store.connection} />
        <HoldOverlay message={state.hold.message} subtitle="停止中は曲を進めません。" />
      </>
    );
  }

  return (
    <div className="min-h-screen" data-tick={tick}>
      <TimerBar state={state} program={program} now={now} connection={store.connection} />

      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <section className="rounded-3xl border border-white/15 bg-white/5 p-8">
          <p className="mb-2 flex items-center gap-3 text-sm font-bold tracking-widest text-slate-400">
            NOW PLAYING
            {verdict ? <span className={'h-3 w-3 rounded-full ' + colorClass(verdict.color)} aria-hidden /> : null}
            {cue ? <span className="text-slate-500">{cueKindLabel(cue.kind)}</span> : null}
          </p>
          <p className="text-[clamp(2rem,6vw,5rem)] font-black leading-tight text-white">
            {cue ? cue.title : '曲が登録されていません'}
          </p>
          {cue?.artist ? <p className="mt-2 text-2xl font-semibold text-slate-300">{cue.artist}</p> : null}

          <div className="mt-8 flex flex-wrap items-end gap-8">
            <div>
              <p className="text-sm font-bold tracking-widest text-slate-400">あと</p>
              <p
                className={
                  'tabular text-[clamp(3rem,12vw,9rem)] font-black leading-none ' +
                  (state.cueTimer.mode === 'idle'
                    ? 'text-slate-500'
                    : nearEnd
                      ? 'text-amber-300'
                      : 'text-white')
                }
              >
                {cue && cue.seconds > 0 ? formatDuration(displayMs(state.cueTimer, now)) : '--:--'}
              </p>
              {state.cueTimer.mode === 'idle' ? (
                <p className="mt-1 text-sm text-slate-500">まだ再生されていません</p>
              ) : null}
            </div>

            {verdict?.playUrl ? (
              <a
                href={verdict.playUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl bg-slate-700 px-8 py-5 text-2xl font-black text-white"
              >
                {verdict.source === 'apple' ? 'Apple Music を開く' : 'YouTube を開く'}
              </a>
            ) : (
              <p className="rounded-2xl bg-rose-950 px-8 py-5 text-xl font-bold text-rose-200">
                音源がありません（赤）
              </p>
            )}
          </div>

          <p className="mt-6 text-sm text-slate-500">
            再生ボタンは人が押します。このシステムは音を鳴らしません（v1の決まりごと）。
          </p>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="mb-2 flex items-center gap-3 text-sm font-bold tracking-widest text-slate-400">
            NEXT
            {upcomingVerdict ? (
              <span className={'h-3 w-3 rounded-full ' + colorClass(upcomingVerdict.color)} aria-hidden />
            ) : null}
          </p>
          <p className="text-[clamp(1.5rem,3.5vw,3rem)] font-black text-slate-100">
            {upcoming ? upcoming.title : '—'}
          </p>
          {upcoming ? (
            <p className="mt-1 text-lg text-slate-400">
              {[upcoming.artist, cueKindLabel(upcoming.kind), upcoming.seconds > 0 ? formatDuration(upcoming.seconds * 1000) : '尺未設定']
                .filter(Boolean)
                .join('　/　')}
            </p>
          ) : null}
        </section>

        <ol className="mt-6 space-y-1 text-sm text-slate-400">
          {program.cues.map((c, i) => {
            const v = judgeCue(c, links);
            return (
              <li
                key={c.no}
                className={
                  'flex items-center gap-3 rounded px-3 py-2 ' +
                  (i === state.cueIndex ? 'bg-white/10 font-bold text-white' : '')
                }
              >
                <span className={'h-2.5 w-2.5 shrink-0 rounded-full ' + colorClass(v.color)} aria-hidden />
                <span className="tabular w-8 shrink-0 text-right">{c.no}</span>
                <span className="truncate">{c.title}</span>
                <span className="ml-auto shrink-0 text-xs text-slate-500">{cueKindLabel(c.kind)}</span>
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}
