'use client';

/**
 * 画面1: ダッシュボード（操作者だけが使う）
 *
 * ここだけが状態を書き換えられる。MC画面・表示画面は完全に閲覧専用。
 * 迷わないために、いちばん大きいボタンは「次へ」と「停止」の2つだけにしてある。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEventState, useTick } from '../lib/useEventState.ts';
import { checkMusic, reloadProgram, sendCommand, sendUndo } from '../lib/client.ts';
import { getApiBase, getOperatorKey, setApiBase, setOperatorKey } from '../lib/config.ts';
import { TimerBar } from '../components/TimerBar.tsx';
import { Loading } from '../components/Loading.tsx';
import { currentMatch, nextActionLabel, nextCue, nextMatch, currentCue, phaseLabel } from '../../core/state.ts';
import { formatDuration, displayMs } from '../../core/timer.ts';
import { judgeCue, summarizeMusic } from '../../core/music.ts';
import { cueKindLabel } from '../../core/sheet.ts';
import type { Command, Fighter, Match } from '../../core/types.ts';

function FighterCard({ side, fighter }: { side: 'red' | 'blue'; fighter: Fighter }) {
  const tone = side === 'red' ? 'border-rose-600/70 bg-rose-950/30' : 'border-sky-600/70 bg-sky-950/30';
  const label = side === 'red' ? '赤コーナー' : '青コーナー';
  const dot = side === 'red' ? 'bg-rose-500' : 'bg-sky-500';
  return (
    <div className={'rounded-xl border p-4 ' + tone}>
      <p className="mb-1 flex items-center gap-2 text-xs font-bold tracking-widest text-slate-300">
        <span className={'h-2.5 w-2.5 rounded-full ' + dot} aria-hidden />
        {label}
      </p>
      <p className="text-2xl font-black leading-tight text-white sm:text-3xl">{fighter.name || '（未入力）'}</p>
      <p className="mt-1 text-sm text-slate-300">
        {[fighter.team, fighter.record].filter(Boolean).join('　/　') || '—'}
      </p>
      <p className="mt-3 border-t border-white/10 pt-3 text-base leading-relaxed text-slate-100">
        {fighter.comment ? '「' + fighter.comment + '」' : '意気込み未入力'}
      </p>
    </div>
  );
}

function MatchSummary({ match, heading }: { match: Match | null; heading: string }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="mb-2 text-xs font-bold tracking-widest text-slate-400">{heading}</p>
      {match ? (
        <>
          <p className="text-lg font-bold text-white">
            第{match.no}試合　{[match.className, match.rule].filter(Boolean).join('　/　')}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {match.rounds}R × {formatDuration(match.roundSeconds * 1000)}　インターバル{' '}
            {formatDuration(match.breakSeconds * 1000)}
          </p>
          <p className="mt-2 text-base text-slate-100">
            {match.red.name} <span className="text-slate-500">vs</span> {match.blue.name}
          </p>
          {match.note ? <p className="mt-2 text-sm text-amber-300">メモ: {match.note}</p> : null}
        </>
      ) : (
        <p className="text-slate-400">なし</p>
      )}
    </section>
  );
}

export default function OperatorPage() {
  const store = useEventState();
  const tick = useTick(200);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [apiInput, setApiInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [hasKey, setHasKey] = useState(true);

  useEffect(() => {
    const key = getOperatorKey();
    setKeyInput(key);
    setApiInput(getApiBase());
    setHasKey(key !== '');
    setShowSettings(key === '');
  }, []);

  const now = store.snapshot ? store.serverNow() : tick;

  const notify = useCallback((text: string) => {
    setMessage(text);
    setTimeout(() => setMessage((m) => (m === text ? null : m)), 4_000);
  }, []);

  const run = useCallback(
    async (fn: () => Promise<{ ok: boolean; reason?: string; label?: string }>, okText: string) => {
      setBusy(true);
      try {
        const res = await fn();
        notify(res.ok ? res.label ?? okText : '実行できません: ' + (res.reason ?? '理由不明'));
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const dispatch = useCallback((command: Command, okText: string) => run(() => sendCommand(command), okText), [run]);

  // キーボードでも操作できるようにする（スペース = 次へ / Esc = 停止・再開）
  const snapshot = store.snapshot;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (!snapshot) return;
      if (e.code === 'Space') {
        e.preventDefault();
        void dispatch({ type: 'next' }, '次へ');
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        void dispatch(snapshot.state.hold.active ? { type: 'resume' } : { type: 'hold' }, '停止/再開');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snapshot, dispatch]);

  const musicSummary = useMemo(() => {
    if (!store.snapshot) return null;
    return summarizeMusic(store.snapshot.program.cues, store.snapshot.musicReport?.links ?? []);
  }, [store.snapshot]);

  if (!store.snapshot) return <Loading connection={store.connection} error={store.error} />;

  const { state, program } = store.snapshot;
  const match = currentMatch(program, state);
  const upcoming = nextMatch(program, state);
  const cue = currentCue(program, state);
  const upcomingCue = nextCue(program, state);
  const cueVerdict = cue ? judgeCue(cue, store.snapshot.musicReport?.links ?? []) : null;
  const held = state.hold.active;

  return (
    <div className="min-h-screen pb-24">
      <TimerBar state={state} program={program} now={now} connection={store.connection} />

      <main className="mx-auto max-w-[1600px] px-4 py-4">
        {!hasKey ? (
          <p className="mb-4 rounded-lg bg-amber-950 px-4 py-3 text-sm font-semibold text-amber-200">
            操作キーが未設定です。下の「接続設定」でキーを入れるまで、この画面からは操作できません。
          </p>
        ) : null}

        {message ? (
          <p className="mb-4 rounded-lg bg-slate-800 px-4 py-3 text-base font-semibold text-slate-100">{message}</p>
        ) : null}

        {musicSummary && !musicSummary.ready && state.phase === 'before' ? (
          <p className="mb-4 rounded-lg border border-rose-600 bg-rose-950/60 px-4 py-3 text-base font-bold text-rose-100">
            音源チェックに赤が {musicSummary.red} 件あります。赤がゼロになるまで大会を開始しない運用です。
            <a className="ml-2 underline" href="./check/">
              音源チェック画面を見る
            </a>
          </p>
        ) : null}

        {/* ---- いちばん大事な2つのボタン ---- */}
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <button
            type="button"
            disabled={busy || held}
            onClick={() => void dispatch({ type: 'next' }, '次へ')}
            className="op-button rounded-2xl bg-emerald-600 px-6 py-6 text-left text-white transition disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            <span className="block text-4xl font-black sm:text-5xl">次へ</span>
            <span className="mt-1 block text-sm font-semibold opacity-90">
              {nextActionLabel(program, state)}（スペースキー）
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void dispatch(held ? { type: 'resume' } : { type: 'hold' }, held ? '再開' : '停止')}
            className={
              'op-button rounded-2xl px-6 py-6 text-left text-white transition ' +
              (held ? 'bg-sky-600' : 'bg-rose-700')
            }
          >
            <span className="block text-4xl font-black sm:text-5xl">{held ? '再開' : '停止'}</span>
            <span className="mt-1 block text-sm font-semibold opacity-90">
              {held ? '全画面の停止表示を消す（Esc）' : '全画面を止めて待たせる（Esc）'}
            </span>
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(sendUndo, '元に戻しました')}
            className="rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-lg font-bold text-slate-100"
          >
            元に戻す
            <span className="mt-1 block text-xs font-normal text-slate-400">
              {state.lastCommand ? '直前: ' + state.lastCommand.label : '直前の操作なし'}
            </span>
          </button>
          <button
            type="button"
            disabled={busy || held}
            onClick={() =>
              void dispatch(
                state.roundTimer.mode === 'running' ? { type: 'round_pause' } : { type: 'round_start' },
                'ラウンドタイマー',
              )
            }
            className="rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-lg font-bold text-slate-100"
          >
            {state.roundTimer.mode === 'running' ? 'ラウンド一時停止' : 'ラウンド開始'}
            <span className="tabular mt-1 block text-xs font-normal text-slate-400">
              残り {formatDuration(displayMs(state.roundTimer, now))}
            </span>
          </button>
          <button
            type="button"
            disabled={busy || held}
            onClick={() => void dispatch({ type: 'round_reset' }, 'ラウンドタイマーを戻しました')}
            className="rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-lg font-bold text-slate-100"
          >
            ラウンドを頭出し
            <span className="mt-1 block text-xs font-normal text-slate-400">{phaseLabel(state.phase)}の秒数に戻す</span>
          </button>
        </div>

        {/* ---- 現在の試合 ---- */}
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xl font-black text-white">
              現在: {match ? '第' + match.no + '試合' : '—'}　
              <span className="text-base font-bold text-slate-400">{phaseLabel(state.phase)}</span>
            </h2>
            <p className="text-sm text-slate-400">
              進行 {Math.max(state.matchIndex + 1, 0)} / {program.matches.length} 試合
            </p>
          </div>
          {match ? (
            <div className="grid gap-3 md:grid-cols-2">
              <FighterCard side="red" fighter={match.red} />
              <FighterCard side="blue" fighter={match.blue} />
            </div>
          ) : (
            <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-slate-400">
              試合が選ばれていません。番組表を取り込んでから「次へ」を押してください。
            </p>
          )}
        </section>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <MatchSummary match={upcoming} heading="次の試合" />

          {/* ---- Event Mix（曲は人が押す。自動再生はしない） ---- */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="mb-2 text-xs font-bold tracking-widest text-slate-400">EVENT MIX（再生は人が押す）</p>
            {cue ? (
              <>
                <p className="text-lg font-bold text-white">
                  {cue.title}
                  <span className="ml-2 text-sm font-normal text-slate-400">{cueKindLabel(cue.kind)}</span>
                </p>
                <p className="tabular mt-1 text-sm text-slate-300">
                  あと {formatDuration(displayMs(state.cueTimer, now))}　
                  {cueVerdict?.playUrl ? (
                    <a className="underline" href={cueVerdict.playUrl} target="_blank" rel="noreferrer">
                      {cueVerdict.source === 'apple' ? 'Apple Music を開く' : 'YouTube を開く'}
                    </a>
                  ) : (
                    <span className="font-bold text-rose-400">音源未登録</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-slate-400">次: {upcomingCue ? upcomingCue.title : '—'}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || held}
                    onClick={() => void dispatch({ type: 'cue_start' }, '再生開始')}
                    className="rounded-lg bg-slate-700 px-4 py-2 font-bold text-white"
                  >
                    再生した（カウント開始）
                  </button>
                  <button
                    type="button"
                    disabled={busy || held}
                    onClick={() => void dispatch({ type: 'cue_next' }, '次の曲へ')}
                    className="rounded-lg bg-slate-700 px-4 py-2 font-bold text-white"
                  >
                    次の曲
                  </button>
                  <button
                    type="button"
                    disabled={busy || held}
                    onClick={() => void dispatch({ type: 'cue_prev' }, '前の曲へ')}
                    className="rounded-lg bg-slate-700 px-4 py-2 font-bold text-white"
                  >
                    前の曲
                  </button>
                </div>
              </>
            ) : (
              <p className="text-slate-400">曲が登録されていません。</p>
            )}
          </section>
        </div>

        {/* ---- 試合ジャンプ ---- */}
        <section className="mt-6">
          <p className="mb-2 text-xs font-bold tracking-widest text-slate-400">試合を選び直す（押し間違いに注意）</p>
          <div className="flex flex-wrap gap-2">
            {program.matches.map((m, i) => (
              <button
                key={m.no}
                type="button"
                disabled={busy || held}
                onClick={() => {
                  if (!window.confirm('第' + m.no + '試合（' + m.red.name + ' vs ' + m.blue.name + '）の入場に移動します。よろしいですか？')) return;
                  void dispatch({ type: 'jump_match', matchNo: m.no }, '第' + m.no + '試合へ移動');
                }}
                className={
                  'tabular rounded-lg px-3 py-2 text-sm font-bold ' +
                  (i === state.matchIndex ? 'bg-emerald-600 text-white' : 'bg-white/10 text-slate-200')
                }
              >
                {m.no}
              </button>
            ))}
          </div>
        </section>

        {/* ---- 番組表・音源・接続 ---- */}
        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-bold tracking-widest text-slate-400">番組表（Google スプレッドシート）</p>
            <p className="mt-1 text-sm text-slate-300">
              revision {program.revision}／試合 {program.matches.length}／曲 {program.cues.length}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(reloadProgram, '番組表を取り込みました')}
              className="mt-3 w-full rounded-lg bg-slate-700 px-4 py-3 font-bold text-white"
            >
              取り込み直す
            </button>
            {program.warnings.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-amber-300">
                {program.warnings.slice(0, 5).map((w) => (
                  <li key={w}>・{w}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-bold tracking-widest text-slate-400">音源チェック</p>
            {musicSummary ? (
              <p className="mt-1 text-sm text-slate-300">
                緑 {musicSummary.green}／黄 {musicSummary.yellow}／
                <span className={musicSummary.red > 0 ? 'font-bold text-rose-400' : ''}>赤 {musicSummary.red}</span>
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(checkMusic, '音源チェックを実行しました')}
              className="mt-3 w-full rounded-lg bg-slate-700 px-4 py-3 font-bold text-white"
            >
              リンク切れを検査する
            </button>
            <a className="mt-2 block text-center text-sm text-slate-300 underline" href="./check/">
              チェック画面を開く
            </a>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-bold tracking-widest text-slate-400">接続設定</p>
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="mt-1 text-sm text-slate-300 underline"
            >
              {showSettings ? '閉じる' : '開く'}
            </button>
            {showSettings ? (
              <div className="mt-3 space-y-2">
                <label className="block text-xs text-slate-400">
                  API（Worker）のURL
                  <input
                    className="mt-1 w-full rounded bg-black/40 px-2 py-2 text-sm text-slate-100"
                    value={apiInput}
                    onChange={(e) => setApiInput(e.target.value)}
                    placeholder="https://uizin-eventos-api.example.workers.dev"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  操作キー
                  <input
                    className="mt-1 w-full rounded bg-black/40 px-2 py-2 text-sm text-slate-100"
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setApiBase(apiInput);
                    setOperatorKey(keyInput);
                    setHasKey(keyInput.trim() !== '');
                    notify('保存しました。読み込み直すと反映されます。');
                  }}
                  className="w-full rounded-lg bg-slate-700 px-4 py-2 font-bold text-white"
                >
                  保存する
                </button>
                <p className="text-xs text-slate-500">
                  この端末にだけ保存されます。MC画面・表示画面にはキーを入れないでください。
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {/* ---- 操作ログ ---- */}
        <section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="mb-2 text-xs font-bold tracking-widest text-slate-400">操作ログ（自動保存・保存ボタンはありません）</p>
          <p className="text-sm text-slate-300">
            直前: {state.lastCommand ? state.lastCommand.label : '—'}　
            <span className="tabular text-slate-500">
              {state.lastCommand ? new Date(state.lastCommand.at).toLocaleTimeString('ja-JP') : ''}
            </span>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            全画面は同じ状態を見ています（version {state.version} / 番組表 {state.programRevision}）。
          </p>
        </section>

        <nav className="mt-6 flex flex-wrap gap-3 text-sm text-slate-300">
          <a className="underline" href="../">入口</a>
          <a className="underline" href="../mc/">MC画面</a>
          <a className="underline" href="../screen/">表示画面</a>
          <a className="underline" href="../mix/">Event Mix</a>
          <a className="underline" href="../check/">音源チェック</a>
        </nav>
      </main>
    </div>
  );
}
