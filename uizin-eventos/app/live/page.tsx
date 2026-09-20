'use client';

/**
 * 画面6: かんたん進行画面（`/live/`）
 *
 * 「パソコンを触ったことがない人」だけを想定している。
 * 操作は2種類しかない:
 *   1. 選手の下の ▶ を押す → その人の入場曲が鳴る
 *   2. いちばん下の「次の試合へ」を押す → 次の試合の写真・名前・意気込みに変わる
 *
 * 足さないもの: 停止・元に戻す・ラウンド操作・番組表の取り込み。
 * それらは今までどおり `/op/` の担当。ここに置くと押し間違える。
 *
 * この画面は自分の中に「今どの試合か」を持たない。持つと大型モニターとずれる。
 * 試合を進めるときは必ずサーバーへコマンドを送り、返ってきた状態を映す。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEventState, useTick } from '../lib/useEventState.ts';
import { sendCommand } from '../lib/client.ts';
import { canOperate, createOperationGate } from '../../core/operatorSafety.ts';
import { getOperatorKey, setOperatorKey } from '../lib/config.ts';
import { TimerBar } from '../components/TimerBar.tsx';
import { Loading } from '../components/Loading.tsx';
import { currentMatch } from '../../core/state.ts';
import { cueForFighter, liveNextAction, playPlan } from '../../core/walkout.ts';
import type { PlayPlan } from '../../core/walkout.ts';
import type { Fighter, MusicCue } from '../../core/types.ts';

/** 指1本で確実に押せる大きさ（88px）を、全部のボタンで守る */
const TAP =
  'flex min-h-[88px] w-full items-center justify-center gap-3 rounded-2xl px-4 py-4 text-center ' +
  'text-xl font-black leading-tight text-white transition active:scale-[0.99] sm:text-2xl';

type Side = 'red' | 'blue';

function sideLabel(side: Side): string {
  return side === 'red' ? '赤コーナー' : '青コーナー';
}

/** ▶ ボタン。曲が無いときはボタンそのものを出さない（押せるのに何も起きない、を作らない） */
function PlayButton({
  side,
  plan,
  playing,
  disabled,
  onPress,
}: {
  side: Side;
  plan: PlayPlan;
  playing: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  if (plan.kind === 'none') {
    return (
      <p className="flex min-h-[88px] items-center justify-center rounded-2xl border-2 border-dashed border-white/20 px-4 text-center text-base font-bold text-slate-400">
        {plan.label}
      </p>
    );
  }

  const tone =
    side === 'red'
      ? 'bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900'
      : 'bg-sky-600 hover:bg-sky-500 disabled:bg-sky-900';
  const stopTone = 'bg-slate-700 hover:bg-slate-600';

  // ボタンの文字と、押したときに起きることを必ず一致させる。
  const label = playing
    ? '■ 止める'
    : plan.kind === 'open'
      ? sideLabel(side) + '：' + plan.label
      : '▶ ' + sideLabel(side) + 'の入場曲を流す';

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={TAP + ' ' + (playing ? stopTone : tone) + ' disabled:text-slate-400'}
    >
      {label}
    </button>
  );
}

function Corner({
  side,
  fighter,
  cue,
  plan,
  playing,
  disabled,
  onPress,
}: {
  side: Side;
  fighter: Fighter;
  cue: MusicCue | null;
  plan: PlayPlan;
  playing: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const isRed = side === 'red';
  // 写真が読めなくても対戦カードは必ず出す。黙って名前だけに戻す。
  const [photoBroken, setPhotoBroken] = useState(false);
  useEffect(() => setPhotoBroken(false), [fighter.photo]);
  const showPhoto = fighter.photo !== '' && !photoBroken;

  const border = isRed ? 'border-rose-600' : 'border-sky-600';
  const bg = isRed ? 'bg-rose-950/40' : 'bg-sky-950/40';
  const badge = isRed ? 'bg-rose-600' : 'bg-sky-600';
  const rule = isRed ? 'bg-rose-500' : 'bg-sky-500';

  return (
    <div className="flex flex-col gap-3">
      <div className={'flex flex-1 flex-col overflow-hidden rounded-3xl border-4 ' + border + ' ' + bg}>
        <div className={'relative aspect-[4/5] w-full' + (showPhoto ? ' bg-black' : '')}>
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
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0) 100%)',
                }}
              />
            </>
          ) : null}

          <span
            className={
              'absolute left-3 top-3 rounded-full px-4 py-1 text-base font-black tracking-widest text-white ' + badge
            }
          >
            {sideLabel(side)}
          </span>

          <div className="absolute inset-x-0 bottom-0 p-4">
            {/* 画面でいちばん大きい文字は選手名 */}
            <p className="text-[clamp(1.7rem,4.6vw,3.6rem)] font-black leading-none text-white drop-shadow-lg">
              {fighter.name || '（未入力）'}
            </p>
            <div className={'mt-2 h-1.5 w-24 rounded-full ' + rule} />
          </div>
        </div>

        <div className="p-4">
          <p className="text-base font-semibold text-slate-300 sm:text-lg">
            {[fighter.team, fighter.record].filter(Boolean).join('　/　') || '—'}
          </p>
          {/* 意気込みは省略しない。MCが読む文章なので、全文が出ていないと意味がない */}
          <p className="mt-3 border-t border-white/15 pt-3 text-lg font-bold leading-relaxed text-white sm:text-xl">
            {fighter.comment ? '「' + fighter.comment + '」' : '（意気込み未入力）'}
          </p>
          <p className="mt-3 text-sm text-slate-400">
            入場曲: {cue ? cue.title + (cue.artist ? '／' + cue.artist : '') : '未登録'}
          </p>
        </div>
      </div>

      <PlayButton side={side} plan={plan} playing={playing} disabled={disabled} onPress={onPress} />
    </div>
  );
}

/** 操作キーがまだ入っていない端末のための、最初の1回だけの画面 */
function KeySetup({ onSaved }: { onSaved: (key: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <main className="mx-auto flex min-h-screen max-w-[600px] flex-col justify-center gap-5 px-6">
      <h1 className="text-3xl font-black text-white">はじめに1回だけ</h1>
      <p className="text-lg leading-relaxed text-slate-300">
        この端末で試合を進めるための「合言葉」を入れてください。大会の担当者から受け取ります。
      </p>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="合言葉"
        className="min-h-[72px] rounded-2xl border border-white/20 bg-black/40 px-5 text-2xl text-white"
      />
      <button
        type="button"
        onClick={() => {
          const key = value.trim();
          if (key === '') return;
          setOperatorKey(key);
          onSaved(key);
        }}
        className={TAP + ' bg-emerald-600 hover:bg-emerald-500'}
      >
        保存してはじめる
      </button>
      <p className="text-sm text-slate-500">
        合言葉はこの端末の中にだけ保存されます。入れ直すときは、URLの末尾に{' '}
        <code className="rounded bg-black/40 px-1">?key=…</code> を付けます。
      </p>
    </main>
  );
}

export default function LivePage() {
  const store = useEventState();
  const tick = useTick(500);

  const [hasKey, setHasKey] = useState(true);
  const [playing, setPlaying] = useState<Side | null>(null);
  const [embedUrl, setEmbedUrl] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gate = useRef(createOperationGate());
  const generation = useRef(0);
  const bus = useRef<BroadcastChannel | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);
  const ready = !uncertain && canOperate(store.connection, hasKey, store.lastMessageAt, tick);

  useEffect(() => {
    setHasKey(getOperatorKey() !== '');
  }, []);

  const stopMusic = useCallback(() => {
    generation.current++;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setEmbedUrl('');
    setPlaying(null);
  }, []);

  useEffect(() => {
    try { bus.current = new BroadcastChannel('uizin.eventos.audio'); bus.current.onmessage = stopMusic; } catch { /* Single-tab fallback. */ }
    return () => { bus.current?.close(); generation.current++; audioRef.current?.pause(); };
  }, [stopMusic]);

  useEffect(() => { if (store.snapshot?.state.hold.active) stopMusic(); }, [store.snapshot?.state.hold.active, stopMusic]);

  const match = store.snapshot ? currentMatch(store.snapshot.program, store.snapshot.state) : null;
  const matchNo = match ? match.no : -1;

  // 試合が変わったら鳴っているものは止める（前の試合の曲が鳴り続けない）
  useEffect(() => {
    stopMusic();
  }, [matchNo, stopMusic]);

  const press = useCallback(
    (side: Side, plan: PlayPlan) => {
      setNote(null);
      if (playing === side) {
        stopMusic();
        return;
      }
      if (plan.kind === 'none') return;

      if (externalOpen && !window.confirm('外部アプリの曲を停止してから切り替えてください。停止しましたか？')) return;
      stopMusic();
      bus.current?.postMessage('stop');
      if (plan.kind === 'open') {
        // Apple Music はブラウザの中では鳴らせない。アプリを開くだけ、と最初から書いてある。
        window.open(plan.url, '_blank', 'noopener,noreferrer');
        setExternalOpen(true);
        setNote('外部アプリが開きます。再生・停止は外部側で操作してください。');
        return;
      }

      setExternalOpen(false);
      if (plan.kind === 'audio') {
        const audio = audioRef.current;
        if (!audio) return;
        audio.src = plan.url;
        const token = generation.current;
        void audio.play().then(() => { if (token === generation.current) setPlaying(side); }).catch(() => {
          if (token !== generation.current) return;
          setPlaying(null);
          setNote('この端末で音を出せませんでした。もう一度押してください。');
        });
        return;
      }
      setEmbedUrl(plan.embedUrl);
      setPlaying(side);
    },
    [playing, stopMusic, externalOpen],
  );

  if (!hasKey) return <KeySetup onSaved={() => setHasKey(true)} />;
  if (!store.snapshot) return <Loading connection={store.connection} error={store.error} />;

  const { state, program } = store.snapshot;
  const now = store.serverNow();
  const action = liveNextAction(program, state);

  const redCue = cueForFighter(program, match, 'red');
  const blueCue = cueForFighter(program, match, 'blue');
  const redPlan = playPlan(redCue);
  const bluePlan = playPlan(blueCue);

  const advance = async () => {
    if (action.kind !== 'start' && action.kind !== 'next') return;
    if (!ready || !window.confirm(action.label + 'に進みますか？\n' + (playing ? 'OS内の音楽を停止します。\n' : '') + (externalOpen ? '外部アプリの音楽は外部側で停止してください。' : '')) || !gate.current.acquire(Date.now())) return;
    setBusy(true);
    setNote(null);
    stopMusic();
    try {
      const res = await sendCommand(action.command, state.version);
      if (!res.ok) setNote('進められませんでした: ' + (res.reason ?? '理由が分かりません'));
      if (res.uncertain || !await store.refresh()) setUncertain(true);
    } finally { gate.current.release(Date.now()); setBusy(false); }
  };

  return (
    <div className="flex min-h-screen flex-col" data-tick={tick}>
      <TimerBar state={state} program={program} now={now} connection={store.connection} />

      {!ready && <p role="status" className="p-4 text-amber-200">最新状態を確認するまで進行できません。<button className="ml-4 min-h-12 underline" onClick={async () => { if (await store.refresh()) setUncertain(false); }}>最新状態を確認</button></p>}
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-4">
        {match ? (
          <>
            <p className="mb-3 text-center text-2xl font-black tracking-wide text-slate-200 sm:text-3xl">
              第{match.no}試合
              <span className="ml-3 text-lg font-bold text-slate-400 sm:text-xl">
                {[match.className, match.rule, match.rounds + 'R'].filter(Boolean).join('　/　')}
              </span>
            </p>

            <div className="grid flex-1 grid-cols-2 gap-3 sm:gap-5">
              <Corner
                side="red"
                fighter={match.red}
                cue={redCue}
                plan={redPlan}
                playing={playing === 'red'}
                disabled={busy || state.hold.active}
                onPress={() => press('red', redPlan)}
              />
              <Corner
                side="blue"
                fighter={match.blue}
                cue={blueCue}
                plan={bluePlan}
                playing={playing === 'blue'}
                disabled={busy || state.hold.active}
                onPress={() => press('blue', bluePlan)}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-4xl font-black text-white">{program.meta.title}</p>
            <p className="text-lg text-slate-400">試合がまだ登録されていません。担当者に伝えてください。</p>
          </div>
        )}

        {/* YouTube はここに出す。押した瞬間に鳴っているものが目に見えるようにする */}
        {embedUrl ? (
          <div className="mx-auto mt-4 w-full max-w-[480px]">
            <iframe
              key={embedUrl}
              src={embedUrl}
              title="入場曲"
              allow="autoplay; encrypted-media"
              className="aspect-video w-full rounded-2xl border border-white/15"
            />
          </div>
        ) : null}

        {note ? (
          <p className="mt-4 rounded-2xl bg-amber-950/70 px-5 py-4 text-center text-lg font-bold text-amber-200">
            {note}
          </p>
        ) : null}

        {state.hold.active ? (
          <p className="mt-5 rounded-2xl bg-rose-700 px-5 py-6 text-center text-2xl font-black text-white">
            {state.hold.message || 'しばらくお待ちください'}
            <span className="mt-2 block text-base font-bold text-rose-100">
              担当者が再開するまで待ってください
            </span>
          </p>
        ) : null}

        {/* 誤タップ防止に、上のボタンから離す */}
        <div className="mt-8 border-t border-white/10 pt-5">
          {action.kind === 'start' || action.kind === 'next' ? (
            <button
              type="button"
              onClick={() => void advance()}
              disabled={busy || !ready}
              className={TAP + ' min-h-[104px] bg-emerald-600 text-2xl hover:bg-emerald-500 disabled:bg-emerald-900 sm:text-3xl'}
            >
              {busy ? '送信中…' : action.label}
            </button>
          ) : (
            <p className="flex min-h-[104px] items-center justify-center rounded-2xl border-2 border-dashed border-white/20 px-4 text-center text-xl font-bold text-slate-400">
              {action.label}
            </p>
          )}
        </div>
      </main>

      {/* 音源ファイルの再生口。画面には出さない（操作するのは上のボタンだけ） */}
      <audio ref={audioRef} onError={() => { stopMusic(); setNote('音源を読み込めませんでした。URLを確認してください。'); }} onEnded={() => setPlaying(null)} className="hidden" />
    </div>
  );
}
