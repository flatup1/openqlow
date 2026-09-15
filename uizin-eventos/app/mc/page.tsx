'use client';

/**
 * 画面2: MC画面（完全に閲覧専用）
 *
 * 読み上げる文章だけを大きく出す。操作ボタンは1つも置かない。
 * 停止中は「しばらくお待ちください」だけになる。
 */

import { useEventState, useTick } from '../lib/useEventState.ts';
import { TimerBar } from '../components/TimerBar.tsx';
import { HoldOverlay } from '../components/HoldOverlay.tsx';
import { Loading } from '../components/Loading.tsx';
import { buildMcScript } from '../../core/script.ts';

export default function McPage() {
  const store = useEventState();
  const tick = useTick(200);

  if (!store.snapshot) return <Loading connection={store.connection} error={store.error} />;

  const { state, program } = store.snapshot;
  const now = store.serverNow();
  const script = buildMcScript(program, state);

  if (state.hold.active) {
    return (
      <>
        <TimerBar state={state} program={program} now={now} connection={store.connection} />
        <HoldOverlay message={state.hold.message} subtitle="再開の合図が出るまで、この文だけを読んでください。" />
      </>
    );
  }

  return (
    <div className="min-h-screen" data-tick={tick}>
      <TimerBar state={state} program={program} now={now} connection={store.connection} />

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <p className="mb-6 text-lg font-bold tracking-widest text-slate-400">{script.heading}</p>

        <div className="space-y-6">
          {script.lines.map((line, i) => (
            <p
              key={i}
              className="text-[clamp(1.75rem,4.2vw,4rem)] font-bold leading-[1.35] text-white"
            >
              {line}
            </p>
          ))}
        </div>

        {script.note ? (
          <p className="mt-10 border-t border-white/10 pt-6 text-base text-slate-400">{script.note}</p>
        ) : null}
      </main>
    </div>
  );
}
