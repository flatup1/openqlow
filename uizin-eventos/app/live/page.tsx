'use client';

/**
 * 画面6: かんたん進行画面（`/live/`）
 *
 * 「パソコンを触ったことがない人」だけを想定している。
 * ふだん使う操作は4つしかない:
 *   1. 選手の下の ▶ を押す → その人の入場曲が鳴る（もう一度押すと止まる）
 *   2. いちばん下の「次の試合へ」を押す → 次の試合の写真・名前・意気込みに変わる
 *   3. その左の「←　第◯試合」を押す → 1つ前の試合に戻る（進めすぎたとき用）
 *   4. 何もしない（迷ったら触らない、で大会は止まらない）
 *
 * 設定（合言葉・接続先）は、ふだんはロックしてある。
 * 大会中にうっかり触れて合言葉が消えると、進行そのものが止まるため。
 * 解除は一時的で、しばらく使わなければ自動で閉じる（core/settingsLock.ts）。
 *
 * 見た目は明るい配色。手元で見る画面なので、暗い部屋でも明るい部屋でも読める方を選ぶ。
 * 大型モニター（/screen/）と音響席（/mix/）は暗いまま。客席に向けて映す画面だから。
 *
 * 足さないもの: 元に戻す・ラウンド操作・番組表の取り込み。
 * それらは今までどおり `/op/` の担当。ここに置くと押し間違える。
 *
 * この画面は自分の中に「今どの試合か」を持たない。持つと大型モニターとずれる。
 * 試合を動かすときは必ずサーバーへコマンドを送り、返ってきた状態を映す。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEventState, useTick } from '../lib/useEventState.ts';
import { sendCommand } from '../lib/client.ts';
import { canOperate, createOperationGate } from '../../core/operatorSafety.ts';
import { getApiBase, getOperatorKey, setOperatorKey } from '../lib/config.ts';
import { Loading } from '../components/Loading.tsx';
import { currentMatch, phaseLabel } from '../../core/state.ts';
import { cueForFighter, liveNextAction, livePrevAction, playPlan } from '../../core/walkout.ts';
import { formatKg, matchWeights } from '../../core/weight.ts';
import type { PlayPlan } from '../../core/walkout.ts';
import { canRun, isUnlocked, unlockCountdownLabel } from '../../core/settingsLock.ts';
import type { EventState, Fighter, MusicCue, Program } from '../../core/types.ts';
import type { Connection } from '../lib/useEventState.ts';

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
  // 曲が無い／鳴らせないときは、押せないボタンとして出す。
  // 消してしまうと左右の形が変わって、どちらの話か分からなくなる。
  if (plan.kind === 'none') {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="flex min-h-[88px] w-full cursor-not-allowed items-center justify-center rounded-2xl border-2 border-slate-300 bg-slate-100 px-4 text-center text-base font-bold text-slate-500"
      >
        {plan.label}
      </button>
    );
  }

  const tone =
    side === 'red'
      ? 'bg-rose-600 hover:bg-rose-500 disabled:bg-rose-200'
      : 'bg-sky-600 hover:bg-sky-500 disabled:bg-sky-200';
  const stopTone = 'bg-slate-800 hover:bg-slate-700';

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
      className={TAP + ' shadow-sm ' + (playing ? stopTone : tone) + ' disabled:text-white/70'}
    >
      {label}
    </button>
  );
}

/**
 * 写真が無いときに出す人型。
 *
 * 画像ファイルではなく SVG を直接書いている。
 * 会場のネットが切れても、この形だけは必ず出したいため
 * （写真が出ない枠で、さらに読み込み待ちの空白が出るのを避ける）。
 */
function FighterSilhouette() {
  return (
    <svg viewBox="0 0 120 120" className="h-2/3 w-2/3 max-h-[160px] text-slate-500" aria-hidden="true">
      <ellipse cx="60" cy="41" rx="20.5" ry="24.5" fill="currentColor" />
      <path
        d="M60 69c-23.5 0-38 13.8-41.2 31.4-.8 4.4 2.6 8.6 7.1 8.6h68.2c4.5 0 7.9-4.2 7.1-8.6C98 82.8 83.5 69 60 69z"
        fill="currentColor"
      />
    </svg>
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

  const border = isRed ? 'border-rose-500' : 'border-sky-500';
  const badge = isRed ? 'bg-rose-600' : 'bg-sky-600';
  const rule = isRed ? 'bg-rose-500' : 'bg-sky-500';

  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          'flex flex-1 flex-col overflow-hidden rounded-3xl border-4 bg-white shadow-sm ' +
          border +
          (playing ? ' ring-4 ring-emerald-400' : '')
        }
      >
        {/*
          写真の枠。

          実測（2026-09-21・75枚）: 申込写真の93%が縦長 3:4。
          これを横長の枠に object-cover で入れると、写真の上56%しか映らず、
          さらに名前の帯が下を覆うため、実際に見えるのは「額から上」だけになる。
          顔が出ないと、誰の試合か分からない画面になってしまう。

          そこで:
            - 枠を縦長 4:5 にして、切り落とす量そのものを減らす
            - object-position を 50% 22% にして、顔が来る高さを枠の中に入れる
            - 名前は写真の上に重ねず、下に置く（顔を隠さない）
        */}
        <div
          className={
            'relative aspect-[4/5] w-full sm:max-h-[24vh] ' +
            (showPhoto ? 'bg-slate-900' : 'bg-slate-100')
          }
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 p-4">
            <FighterSilhouette />
            {!showPhoto ? <span className="text-sm font-bold text-slate-400">画像なし</span> : null}
          </div>

          {showPhoto ? (
            <img
              src={fighter.photo}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              onError={() => setPhotoBroken(true)}
              // object-cover（切り取り）にしない。
              // 実測（2026-09-21・75枚）で申込写真の93%が縦長 3:4 なのに対し、
              // ここに使える枠は横長になる。切り取ると必ずどこかが欠け、
              // 実際に「額から上だけ」「目元だけ」になった写真があった。
              // 顔が欠けると誰の試合か分からなくなるので、全体を必ず映す。
              //
              // 写真の27枚は外部サイトにあり、1枚5〜8秒かかることがある（同日実測）。
              // 読み込みを待つ間も人型を見せたいので、下のシルエットの上に重ねている。
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : null}

          <span
            className={
              'absolute left-3 top-3 rounded-full px-4 py-1 text-base font-black tracking-widest text-white ' + badge
            }
          >
            {sideLabel(side)}
          </span>
        </div>

        <div className="p-4">
          {/* 画面でいちばん大きい文字は選手名。写真に重ねないので、顔が隠れない */}
          <p className="text-[clamp(1.6rem,4.2vw,3.2rem)] font-black leading-none text-slate-900">
            {fighter.name || '（未入力）'}
          </p>
          <div className={'mb-3 mt-2 h-1.5 w-24 rounded-full ' + rule} />

          <p className="text-base font-semibold text-slate-600 sm:text-lg">
            {[fighter.team, fighter.record].filter(Boolean).join('　/　') || '—'}
          </p>
          {/* 意気込みは省略しない。MCが読む文章なので、全文が出ていないと意味がない */}
          <p className="mt-3 border-t border-slate-200 pt-3 text-lg font-bold leading-relaxed text-slate-900 sm:text-xl">
            {fighter.comment ? '「' + fighter.comment + '」' : '（意気込み未入力）'}
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>入場曲: {cue ? cue.title + (cue.artist ? '／' + cue.artist : '') : '未登録'}</span>
            {/* いま鳴っているのがどちらの曲か、文字でも分かるようにする */}
            <span
              className={
                'rounded-full px-2 py-0.5 text-xs font-bold ' +
                (playing ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')
              }
            >
              {playing ? '▶ 再生中' : '停止中'}
            </span>
          </p>
        </div>
      </div>

      <PlayButton side={side} plan={plan} playing={playing} disabled={disabled} onPress={onPress} />
    </div>
  );
}

const CONNECTION_TEXT: Record<Connection, string> = {
  connecting: '接続中',
  live: '同期中',
  polling: '低速同期',
  offline: '未接続',
};

const CONNECTION_DOT: Record<Connection, string> = {
  connecting: 'bg-slate-400',
  live: 'bg-emerald-500',
  polling: 'bg-amber-400',
  offline: 'bg-rose-600',
};

/**
 * 画面いちばん上の帯。出すのは3つだけ。
 *   1. 大会名
 *   2. いま何試合目か（全何試合か）
 *   3. 編集ロックがかかっているか
 *
 * タイマーは出さない。`/live/` は「誰でも進行できる画面」で、
 * 時間を見て判断するのはオペレーター（`/op/`）の仕事だから。
 * 代わりに、進行状況と接続状態だけ小さく添える（止まっていないかを見るため）。
 */
function LiveHeader({
  program,
  state,
  matchNo,
  unlocked,
  connection,
  onOpenSettings,
  settingsOpen,
}: {
  program: Program;
  state: EventState;
  matchNo: number | null;
  unlocked: boolean;
  connection: Connection;
  onOpenSettings: () => void;
  settingsOpen: boolean;
}) {
  const total = program.matches.length;
  return (
    <header className="sticky top-0 z-40 border-b-2 border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-xl font-black text-slate-900 sm:text-2xl">
            {program.meta.title || 'UIZIN EventOS'}
          </span>
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            {program.meta.venue ? <span className="truncate">{program.meta.venue}</span> : null}
            <span>{phaseLabel(state.phase)}</span>
            <span className="inline-flex items-center gap-1">
              <span className={'h-2 w-2 rounded-full ' + CONNECTION_DOT[connection]} aria-hidden />
              {CONNECTION_TEXT[connection]}
            </span>
          </span>
        </div>

        {/* いま何試合目か。画面のどこを見ても分かるように、いちばん上に置く */}
        <p className="text-2xl font-black text-slate-900 sm:text-3xl">
          {matchNo === null ? '開始前' : '第' + matchNo + '試合'}
          <span className="ml-2 text-base font-bold text-slate-500 sm:text-lg">
            / 全{total}試合
          </span>
        </p>

        <div className="ml-auto flex items-center gap-2">
          {/* 編集できる状態かどうかは、ひと目で分かる必要がある */}
          <span
            className={
              'rounded-full px-3 py-1.5 text-sm font-black ' +
              (unlocked ? 'bg-amber-400 text-amber-950' : 'bg-slate-200 text-slate-700')
            }
          >
            {unlocked ? '🔓 編集可能' : '🔒 編集ロック中'}
          </span>
          {/* 設定はふだん使わないので、わざと小さく端に置く */}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-expanded={settingsOpen}
            className="min-h-12 rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-100"
          >
            設定
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * 設定パネル。ふだんは閉じていて、開いてもロックがかかっている。
 * ここにあるのは「間違えると進行が止まるもの」だけ。
 */
function SettingsPanel({
  unlockedAt,
  now,
  onUnlock,
  onLock,
  onForgetKey,
  onClose,
}: {
  unlockedAt: number | null;
  now: number;
  onUnlock: () => void;
  onLock: () => void;
  onForgetKey: () => void;
  onClose: () => void;
}) {
  const [api, setApi] = useState('');
  useEffect(() => setApi(getApiBase()), []);
  const open = isUnlocked(unlockedAt, now);

  return (
    <section className="mt-6 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-black text-slate-900">設定（編集）</h2>
        <span
          className={
            'rounded-full px-3 py-1 text-sm font-bold ' +
            (open ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-700')
          }
        >
          {open ? '🔓 編集可能 · ' + unlockCountdownLabel(unlockedAt, now) : '🔒 編集ロック中'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto min-h-12 rounded-xl border-2 border-slate-300 px-4 font-bold text-slate-700 hover:bg-slate-100"
        >
          閉じる
        </button>
      </div>

      {open ? (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-base leading-relaxed text-slate-700">
            ここを変えると進行が止まることがあります。必要がなければ触らないでください。
          </p>
          <button
            type="button"
            onClick={onForgetKey}
            className="min-h-[72px] rounded-2xl bg-slate-800 px-5 text-lg font-black text-white hover:bg-slate-700"
          >
            合言葉を入れ直す
          </button>
          <p className="text-sm text-slate-500">
            接続先: <code className="rounded bg-slate-100 px-1 text-slate-700">{api || '(未設定)'}</code>
            <br />
            接続先を変えるときは、URLの末尾に <code className="rounded bg-slate-100 px-1 text-slate-700">?api=https://…</code> を付けます。
          </p>
          <button
            type="button"
            onClick={onLock}
            className="min-h-[72px] rounded-2xl border-2 border-slate-300 px-5 text-lg font-black text-slate-800 hover:bg-slate-100"
          >
            🔒 いますぐ再ロックする
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-base leading-relaxed text-slate-700">
            曲の再生・停止と、前／次の試合は、ロック中でもそのまま使えます。
            <br />
            ロックしているのは、設定とデータの変更だけです。
          </p>
          <button
            type="button"
            onClick={onUnlock}
            className="min-h-[72px] rounded-2xl border-2 border-slate-300 px-5 text-lg font-black text-slate-800 hover:bg-slate-100"
          >
            🔓 編集ロックを解除する
          </button>
        </div>
      )}
    </section>
  );
}

/** 操作キーがまだ入っていない端末のための、最初の1回だけの画面 */
function KeySetup({ onSaved }: { onSaved: (key: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <main className="mx-auto flex min-h-screen max-w-[600px] flex-col justify-center gap-5 px-6">
      <h1 className="text-3xl font-black text-slate-900">はじめに1回だけ</h1>
      <p className="text-lg leading-relaxed text-slate-700">
        この端末で試合を進めるための「合言葉」を入れてください。大会の担当者から受け取ります。
      </p>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="合言葉"
        className="min-h-[72px] rounded-2xl border-2 border-slate-300 bg-white px-5 text-2xl text-slate-900"
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
        <code className="rounded bg-slate-100 px-1 text-slate-700">?key=…</code> を付けます。
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
  // 設定ロック。ふだんは null（＝ロック中）。解除しても時間で自動的に閉じる。
  const [unlockedAt, setUnlockedAt] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ready = !uncertain && canOperate(store.connection, hasKey, store.lastMessageAt, tick);

  useEffect(() => {
    setHasKey(getOperatorKey() !== '');
  }, []);

  // この画面だけ明るい配色にする。離れたら元の配色に戻す（他の画面を巻き込まない）
  useEffect(() => {
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => {
      if (before === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', before);
    };
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
  const action = liveNextAction(program, state);
  const back = livePrevAction(program, state);

  const weights = match ? matchWeights(match.red.weight ?? '', match.blue.weight ?? '') : null;

  const redCue = cueForFighter(program, match, 'red');
  const blueCue = cueForFighter(program, match, 'blue');
  const redPlan = playPlan(redCue);
  const bluePlan = playPlan(blueCue);

  /** 試合を動かす。前へも次へも、通るのはこの1本だけにする（二重送信を1か所で止める） */
  const move = async (label: string, command: Parameters<typeof sendCommand>[0]) => {
    if (!ready || !window.confirm(label + 'に進みますか？\n' + (playing ? 'OS内の音楽を停止します。\n' : '') + (externalOpen ? '外部アプリの音楽は外部側で停止してください。' : '')) || !gate.current.acquire(Date.now())) return;
    setBusy(true);
    setNote(null);
    stopMusic();
    try {
      const res = await sendCommand(command, state.version);
      if (!res.ok) setNote('進められませんでした: ' + (res.reason ?? '理由が分かりません'));
      if (res.uncertain || !await store.refresh()) setUncertain(true);
    } finally { gate.current.release(Date.now()); setBusy(false); }
  };

  const advance = async () => {
    if (action.kind !== 'start' && action.kind !== 'next') return;
    await move(action.label, action.command);
  };

  // 前の試合へ戻る。ロック中でも使える（進めすぎを直せないと、かえって大会が止まる）
  const goBack = async () => {
    if (back.kind !== 'prev' || !canRun('prev_match', unlockedAt, tick)) return;
    await move(back.label, back.command);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#eef2f8]" data-tick={tick}>
      <LiveHeader
        program={program}
        state={state}
        matchNo={match ? match.no : null}
        unlocked={isUnlocked(unlockedAt, tick)}
        connection={store.connection}
        settingsOpen={settingsOpen}
        onOpenSettings={() => setSettingsOpen((v) => !v)}
      />

      {!ready && <p role="status" className="bg-amber-100 p-4 font-bold text-amber-900">最新状態を確認するまで進行できません。<button className="ml-4 min-h-12 underline" onClick={async () => { if (await store.refresh()) setUncertain(false); }}>最新状態を確認</button></p>}
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-4">
        {match ? (
          <>
            <p className="mb-3 text-center text-base font-bold text-slate-500 sm:text-lg">
              {[match.className, match.rule, match.rounds + 'R'].filter(Boolean).join('　/　')}
              {/* スマホでは VS を出していないので、契約体重をこちらに出す */}
              {weights ? (
                <span className="tabular ml-3 text-slate-700 sm:hidden">
                  契約 {formatKg(weights.contract)}
                </span>
              ) : null}
            </p>

            {/* 赤 / VS / 青。VS は幅のあるときだけ出す（スマホでは場所を食うだけ） */}
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-5">
              <Corner
                side="red"
                fighter={match.red}
                cue={redCue}
                plan={redPlan}
                playing={playing === 'red'}
                disabled={busy || state.hold.active}
                onPress={() => press('red', redPlan)}
              />

              {/*
                VS の下は契約体重だけ。重い方に合わせた1つの値を出す。

                両者の体重を並べたり差を出したりはしない（2026-09-21 発注者の指示）。
                選手ごとの体重も出さない。並べられると結局そこが目につくため。
                どちらかの体重が読めない試合では、間違った値を出さないよう何も出さない。
              */}
              <div className="hidden flex-col items-center justify-center gap-3 px-1 sm:flex">
                <span className="text-3xl font-black tracking-widest text-slate-400 lg:text-5xl">VS</span>
                {weights ? (
                  <div className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-center">
                    <p className="text-[0.7rem] font-bold tracking-widest text-slate-500">契約</p>
                    <p className="tabular text-xl font-black leading-tight text-slate-900 lg:text-2xl">
                      {formatKg(weights.contract)}
                    </p>
                  </div>
                ) : null}
              </div>

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
            <p className="text-4xl font-black text-slate-900">{program.meta.title}</p>
            <p className="text-lg text-slate-500">試合がまだ登録されていません。担当者に伝えてください。</p>
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
              className="aspect-video w-full rounded-2xl border border-slate-300 bg-white"
            />
          </div>
        ) : null}

        {note ? (
          <p className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-100 px-5 py-4 text-center text-lg font-bold text-amber-900">
            {note}
          </p>
        ) : null}

        {state.hold.active ? (
          <p className="mt-5 rounded-2xl bg-rose-600 px-5 py-6 text-center text-2xl font-black text-white">
            {state.hold.message || 'しばらくお待ちください'}
            <span className="mt-2 block text-base font-bold text-rose-100">
              担当者が再開するまで待ってください
            </span>
          </p>
        ) : null}

        {/* 誤タップ防止に、上のボタンから離す。戻るは小さく、次へは大きく、色も分ける */}
        <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:mt-4 sm:flex-row">
          {back.kind === 'prev' ? (
            <button
              type="button"
              onClick={() => void goBack()}
              disabled={busy || !ready}
              className="flex min-h-[88px] w-full items-center justify-center rounded-2xl border-2 border-slate-300 bg-white px-3 text-lg font-black text-slate-700 transition hover:bg-slate-100 active:scale-[0.99] disabled:text-slate-300 sm:w-[32%] sm:max-w-[240px] sm:text-xl"
            >
              {busy ? '…' : back.label}
            </button>
          ) : null}

          {action.kind === 'start' || action.kind === 'next' ? (
            <button
              type="button"
              onClick={() => void advance()}
              disabled={busy || !ready}
              className={TAP + ' min-h-[104px] flex-1 bg-emerald-600 text-2xl shadow-sm hover:bg-emerald-500 disabled:bg-emerald-200 sm:text-3xl'}
            >
              {busy ? '送信中…' : action.label}
            </button>
          ) : (
            <p className="flex min-h-[104px] flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 text-center text-xl font-bold text-slate-500">
              {action.label}
            </p>
          )}
        </div>

        {settingsOpen ? (
          <SettingsPanel
            unlockedAt={unlockedAt}
            now={tick}
            onUnlock={() => {
              if (!window.confirm('設定のロックを解除しますか？\n合言葉や接続先を変えると、進行が止まることがあります。')) return;
              setUnlockedAt(Date.now());
            }}
            onLock={() => setUnlockedAt(null)}
            onForgetKey={() => {
              if (!canRun('change_key', unlockedAt, Date.now())) return;
              if (!window.confirm('合言葉を消して、入れ直しますか？\n入れ直すまで試合を進められません。')) return;
              setOperatorKey('');
              setUnlockedAt(null);
              setSettingsOpen(false);
              setHasKey(false);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}
      </main>

      {/* 音源ファイルの再生口。画面には出さない（操作するのは上のボタンだけ） */}
      <audio ref={audioRef} onError={() => { stopMusic(); setNote('音源を読み込めませんでした。URLを確認してください。'); }} onEnded={() => setPlaying(null)} className="hidden" />
    </div>
  );
}
