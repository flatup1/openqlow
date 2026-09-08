'use client';

/**
 * 画面5: 音源チェック（大会前日に使う）
 *
 * 赤がゼロになるまで大会を開始しない、という運用のための一覧。
 * 誰でも見られるが、検査の実行は操作者だけ。
 */

import { useCallback, useMemo, useState } from 'react';
import { useEventState } from '../lib/useEventState.ts';
import { checkMusic } from '../lib/client.ts';
import { Loading } from '../components/Loading.tsx';
import { ConnectionBadge } from '../components/TimerBar.tsx';
import { colorClass, colorLabel, summarizeMusic } from '../../core/music.ts';
import { cueKindLabel } from '../../core/sheet.ts';
import { formatDuration } from '../../core/timer.ts';

export default function CheckPage() {
  const store = useEventState();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!store.snapshot) return null;
    return summarizeMusic(store.snapshot.program.cues, store.snapshot.musicReport?.links ?? []);
  }, [store.snapshot]);

  const runCheck = useCallback(async () => {
    setBusy(true);
    setMessage('リンクを確認しています…');
    const res = await checkMusic();
    setMessage(res.ok ? '確認しました。' : '実行できません: ' + (res.reason ?? '理由不明'));
    setBusy(false);
  }, []);

  if (!store.snapshot || !summary) return <Loading connection={store.connection} error={store.error} />;

  const { program, musicReport } = store.snapshot;
  const links = musicReport?.links ?? [];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0e14]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4">
          <h1 className="text-xl font-black text-white">音源チェック</h1>
          <p className="text-sm text-slate-400">{program.meta.title}</p>
          <div className="ml-auto">
            <ConnectionBadge connection={store.connection} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <section
          className={
            'rounded-2xl border p-6 ' +
            (summary.ready ? 'border-emerald-600 bg-emerald-950/40' : 'border-rose-600 bg-rose-950/40')
          }
        >
          <p className="text-[clamp(1.5rem,4vw,2.75rem)] font-black text-white">
            {summary.ready ? '赤はありません。大会を開始できます。' : '赤が ' + summary.red + ' 件あります。開始しないでください。'}
          </p>
          <div className="mt-4 flex flex-wrap gap-6 text-lg font-bold">
            <span className="text-emerald-400">緑 {summary.green}</span>
            <span className="text-amber-300">黄 {summary.yellow}</span>
            <span className="text-rose-400">赤 {summary.red}</span>
            <span className="text-slate-400">合計 {summary.total}</span>
          </div>
          <p className="mt-3 text-sm text-slate-300">
            緑 = Apple Music で再生できる（第一優先）／黄 = YouTube のみ、または尺が未設定／赤 = URLが無い・形が違う・リンク切れ
          </p>
        </section>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runCheck()}
            className="rounded-xl bg-slate-700 px-6 py-4 text-lg font-bold text-white disabled:opacity-50"
          >
            リンク切れを検査する（操作者のみ）
          </button>
          <p className="text-sm text-slate-400">
            {musicReport
              ? '最終検査: ' + new Date(musicReport.checkedAt).toLocaleString('ja-JP')
              : 'まだ検査していません（形の判定だけで色を出しています）'}
          </p>
          {message ? <p className="text-sm font-semibold text-slate-200">{message}</p> : null}
        </div>

        {program.warnings.length > 0 ? (
          <ul className="mt-4 space-y-1 rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-200">
            {program.warnings.map((w) => (
              <li key={w}>・{w}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/20 text-xs tracking-widest text-slate-400">
                <th className="px-3 py-2">色</th>
                <th className="px-3 py-2">No</th>
                <th className="px-3 py-2">用途</th>
                <th className="px-3 py-2">曲名</th>
                <th className="px-3 py-2">尺</th>
                <th className="px-3 py-2">再生元</th>
                <th className="px-3 py-2">状態</th>
              </tr>
            </thead>
            <tbody>
              {summary.verdicts.map((v) => {
                const cue = program.cues.find((c) => c.no === v.cueNo);
                const link = v.playUrl ? links.find((l) => l.url === v.playUrl) : undefined;
                return (
                  <tr key={v.cueNo} className="border-b border-white/10">
                    <td className="px-3 py-3">
                      <span className={'inline-flex h-4 w-4 rounded-full ' + colorClass(v.color)} aria-hidden />
                      <span className="sr-only">{colorLabel(v.color)}</span>
                    </td>
                    <td className="tabular px-3 py-3 text-slate-300">{v.cueNo}</td>
                    <td className="px-3 py-3 text-slate-300">{cue ? cueKindLabel(cue.kind) : '—'}</td>
                    <td className="px-3 py-3 font-semibold text-white">
                      {cue?.title ?? '—'}
                      {cue?.artist ? <span className="ml-2 text-slate-400">{cue.artist}</span> : null}
                      {cue?.matchNo ? <span className="ml-2 text-slate-500">第{cue.matchNo}試合</span> : null}
                    </td>
                    <td className="tabular px-3 py-3 text-slate-300">
                      {cue && cue.seconds > 0 ? formatDuration(cue.seconds * 1000) : '未設定'}
                    </td>
                    <td className="px-3 py-3">
                      {v.playUrl ? (
                        <a className="text-slate-200 underline" href={v.playUrl} target="_blank" rel="noreferrer">
                          {v.source === 'apple' ? 'Apple Music' : 'YouTube'}
                        </a>
                      ) : (
                        <span className="text-rose-400">なし</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {v.reason}
                      {link && link.alive === null ? (
                        <span className="ml-1 text-slate-500">（{link.note}）</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <nav className="mt-8 flex flex-wrap gap-3 text-sm text-slate-300">
          <a className="underline" href="../">入口</a>
          <a className="underline" href="../op/">ダッシュボード</a>
          <a className="underline" href="../mix/">Event Mix</a>
        </nav>
      </main>
    </div>
  );
}
