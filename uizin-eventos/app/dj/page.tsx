'use client';

import { useEffect, useRef, useState } from 'react';
import { useEventState, useTick } from '../lib/useEventState.ts';
import { getOperatorKey, setOperatorKey } from '../lib/config.ts';
import { reloadProgram, sendCommand, sendUndo } from '../lib/client.ts';
import type { CommandResponse } from '../lib/client.ts';
import { useAudioDesk } from '../lib/useAudioDesk.ts';
import type { Track } from '../lib/useAudioDesk.ts';
import { TimerBar } from '../components/TimerBar.tsx';
import { Loading } from '../components/Loading.tsx';
import { FighterPhoto, FighterProfile } from '../components/FighterProfile.tsx';
import { currentMatch, nextActionLabel, phaseLabel } from '../../core/state.ts';
import { cueForFighter } from '../../core/walkout.ts';
import { audioSource } from '../../core/audio.ts';
import type { Volumes } from '../../core/audio.ts';
import { canOperate, createOperationGate } from '../../core/operatorSafety.ts';
import type { Command, Match } from '../../core/types.ts';

const BUTTON = 'min-h-12 rounded-xl bg-slate-700 px-5 py-3 text-lg font-bold transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-35';
const PLAY = 'min-h-[88px] w-full rounded-xl px-4 py-4 text-xl font-black disabled:opacity-35';
const clock = (seconds: number) => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');

export default function DjPage() {
  const store = useEventState();
  const tick = useTick(400);
  const desk = useAudioDesk();
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const [settings, setSettings] = useState(false);
  const [query, setQuery] = useState('');
  const [profile, setProfile] = useState<{ side: 'red' | 'blue'; announce: boolean } | null>(null);
  const gate = useRef(createOperationGate());
  const ready = !uncertain && canOperate(store.connection, hasKey, store.lastMessageAt, Date.now());
  const held = store.snapshot?.state.hold.active ?? false;
  const match = store.snapshot ? currentMatch(store.snapshot.program, store.snapshot.state) : null;
  const matchIdentity = match ? [match.no, match.red.name, match.blue.name].join(':') : '';
  const previousIdentity = useRef(matchIdentity);

  useEffect(() => { setHasKey(Boolean(getOperatorKey())); }, []);
  useEffect(() => {
    if (held || previousIdentity.current !== matchIdentity) { desk.stop(); setProfile(null); }
    previousIdentity.current = matchIdentity;
  }, [held, matchIdentity, desk.stop]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') desk.stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [desk.stop]);

  if (!store.snapshot) return <Loading connection={store.connection} error={store.error} />;
  const { program, state } = store.snapshot;
  const previous = program.matches[state.matchIndex - 1];
  const next = program.matches[state.matchIndex + 1];
  const afterNext = program.matches[state.matchIndex + 2];

  const run = async (operation: () => Promise<CommandResponse>, success: string) => {
    if (!ready || !gate.current.acquire(Date.now())) return;
    setBusy(true);
    try {
      const response = await operation();
      setMessage(response.ok ? success : response.reason || '実行できませんでした。');
      if (response.uncertain) setUncertain(true);
      else if (!await store.refresh()) setUncertain(true);
    } catch { setUncertain(true); setMessage('結果を確認できません。再送せず、最新状態を確認してください。'); }
    finally { gate.current.release(Date.now()); setBusy(false); }
  };
  const dispatch = (command: Command, success: string) => run(() => sendCommand(command, state.version), success);
  const warnings = () => [
    desk.playing ? 'OS内の音楽を停止します。' : '', desk.external ? '外部アプリの音楽は外部側で停止してください。' : '',
    profile?.announce ? 'アナウンス途中です。' : '', state.phase === 'result' ? '結果発表・表彰中です。' : '',
  ].filter(Boolean).join('\n');
  const jump = (target: Match | undefined) => {
    if (!target || held || !ready || busy) return;
    if (!window.confirm('第' + target.no + '試合\n' + target.red.name + ' vs ' + target.blue.name + '\nに移動しますか？\n' + warnings())) return;
    desk.stop();
    void dispatch({ type: 'jump_match', matchNo: target.no }, '第' + target.no + '試合へ移動しました');
  };
  const advance = () => {
    if (!window.confirm(nextActionLabel(program, state) + 'に進みますか？\n' + warnings())) return;
    desk.stop(); void dispatch({ type: 'next' }, '進行を更新しました');
  };
  const emergency = async () => {
    desk.stop(); setProfile(null);
    if (!hasKey) { setMessage('OS内の音声を停止しました。大会進行の停止は操作キーを持つ担当者へ伝えてください。'); return; }
    // Emergency stop does not wait for another pending operation or a stale-screen gate.
    const response = await sendCommand({ type: 'hold' }, state.version);
    setMessage(response.ok ? '音声と大会進行を停止しました。外部アプリは外部側で停止してください。' : 'OS内の音声は停止しました。大会進行の停止は未確認です。担当者に伝えてください。');
    if (!response.ok) setUncertain(true);
    await store.refresh();
  };
  const trackFor = (side: 'red' | 'blue'): Track => {
    const cue = cueForFighter(program, match, side);
    const id = side + ':' + matchIdentity;
    const file = desk.files[id];
    return { id, channel: side, title: side.toUpperCase() + ' CORNER · ' + (match?.[side].name || '') + ' · ' + (file?.name || cue?.title || '入場曲'),
      url: file?.url || cue?.appleMusicUrl || cue?.youtubeUrl || cue?.otherUrl || '', local: Boolean(file) };
  };
  const playLabel = (track: Track) => track.local ? '▶ OS内で再生' : audioSource(track.url).label;
  const playable = (track: Track) => track.local || ['audio', 'external'].includes(audioSource(track.url).kind);
  const playTrack = (track: Track) => { if (!held) void desk.play(track); };
  const matches = program.matches.filter(m => [m.no, m.red.name, m.blue.name, m.red.team, m.blue.team].join(' ').toLowerCase().includes(query.toLowerCase()));

  return <div className="min-h-screen pb-28 text-white" data-tick={tick}>
    <TimerBar state={state} program={program} now={store.serverNow()} connection={store.connection} />
    <main className="mx-auto max-w-[1500px] space-y-5 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm tracking-[0.3em] text-slate-400">UIZIN TOURNAMENT OS</p><h1 className="text-3xl font-black">大会DJデスク</h1></div>
        <div className="flex flex-wrap gap-2"><button className={BUTTON} onClick={() => setSettings(!settings)}>{settings ? '運営画面へ' : '音源・音量設定'}</button>
          </div>
      </div>
      {!ready && <div role="status" className="rounded-xl border border-amber-600/50 bg-amber-950/40 p-4">
        {!hasKey ? '進行操作には操作キーが必要です。設定から入力してください。' : '保存済みの情報を表示しています。最新状態を確認するまで進行操作を停止します。'}
        <button className="ml-4 min-h-12 underline" onClick={async () => { if (await store.refresh()) setUncertain(false); }}>最新状態を確認</button>
      </div>}
      {(message || desk.error) && <p role="status" className="rounded-xl bg-amber-950/70 p-4 text-lg text-amber-100">{message} {desk.error}</p>}
      {held && <div role="alert" className="flex flex-wrap items-center gap-4 rounded-xl bg-rose-950 p-5 text-2xl font-black">緊急停止中 · {state.hold.message}
        <button className={BUTTON} disabled={!ready || busy} onClick={() => { if (window.confirm('安全確認が完了し、大会進行を再開しますか？ 音楽は自動再生しません。')) void dispatch({ type: 'resume' }, '再開しました'); }}>安全確認して再開</button></div>}
      <section aria-label="NOW PLAYING" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-600/40 bg-emerald-950/25 p-4">
        <div><p className="text-sm font-bold tracking-widest text-emerald-300">NOW PLAYING · OS内</p>
          <p className="mt-1 text-xl font-bold">{desk.playing ? desk.playing.title : '停止中'}</p>
          {desk.playing && <p>{desk.paused ? '一時停止' : '再生中'} · {clock(desk.position)} / {clock(desk.duration)}</p>}</div>
        <div className="flex gap-3"><button className={BUTTON} disabled={!desk.playing || held} onClick={() => void desk.togglePause()}>{desk.paused ? '再開' : '一時停止'}</button>
          </div>
      </section>
      {desk.external && <div className="rounded-xl border border-amber-600 p-4 text-amber-200">↗ 外部で開いた曲：{desk.external.title}（再生状態は確認できません）
        <p>外部アプリの音声はOSから停止できません。外部側で停止してください。</p><button className="min-h-12 underline" onClick={desk.clearExternal}>外部側で停止した</button></div>}
      {match ? <>
        <div className="text-center"><h2 className="text-3xl font-black">第{match.no}試合 <span className="text-xl text-slate-300">{match.className} · {phaseLabel(state.phase)}</span></h2>
          <p className="mt-2 text-slate-300">{match.rule} · {match.rounds}R</p></div>
        <div className="grid grid-cols-2 gap-3 md:gap-6">{(['red', 'blue'] as const).map(side => {
          const fighter = match[side], track = trackFor(side);
          return <section key={side} className={'flex flex-col gap-3 rounded-2xl border-2 p-4 ' + (side === 'red' ? 'border-rose-700 bg-rose-950/25' : 'border-sky-700 bg-sky-950/25')}>
            <p className={'text-lg font-black tracking-widest ' + (side === 'red' ? 'text-rose-300' : 'text-sky-300')}>{side.toUpperCase()} CORNER</p>
            <button className="flex flex-wrap items-center gap-4 text-left" aria-label={side.toUpperCase() + ' 選手詳細'} onClick={() => setProfile({ side, announce: false })}>
              <FighterPhoto url={fighter.photo} name={fighter.name} /><span><span className="block text-[clamp(1.5rem,3vw,3rem)] font-black">{fighter.name || '選手名 未登録'}</span>
                <span className="mt-1 block text-xl">{fighter.kana || '読み方未登録'}</span><span className="mt-2 block text-slate-300">{fighter.team || '所属 未登録'}</span></span>
            </button>
            <p className="text-slate-300">{fighter.category || match.className} · {fighter.record || '戦績 未登録'}</p>
            <button className={BUTTON} onClick={() => setProfile({ side, announce: true })}>🎙 アナウンス</button>
            <p className="min-h-12 text-sm text-slate-300">{track.url ? track.title : '入場曲 未登録'}</p>
            <button className={PLAY + (side === 'red' ? ' bg-rose-700' : ' bg-sky-700')} disabled={held || !playable(track)} onClick={() => playTrack(track)}>{playLabel(track)}</button>
            <button className={BUTTON} onClick={desk.stop}>■ 停止（OS内）</button>
          </section>;
        })}</div>
        <div className="grid gap-3 md:grid-cols-3"><button className={BUTTON} disabled={!previous || !ready || held || busy} onClick={() => jump(previous)}>← 前の試合{previous ? ' · #' + previous.no : ''}</button>
          <button className={BUTTON + ' !bg-emerald-700'} disabled={!ready || held || busy || state.phase === 'finished'} onClick={advance}>{nextActionLabel(program, state)}</button>
          <button className={BUTTON} disabled={!next || !ready || held || busy} onClick={() => jump(next)}>次の試合 →{next ? ' · #' + next.no : ''}</button></div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-slate-300"><p>次：{next ? '#' + next.no + ' ' + next.red.name + ' vs ' + next.blue.name : 'なし'}<br />その次：{afterNext ? '#' + afterNext.no + ' ' + afterNext.red.name + ' vs ' + afterNext.blue.name : 'なし'}</p>
          <button className={BUTTON} disabled={!ready || held || busy} onClick={() => { if (window.confirm('直前の進行操作を1つ戻しますか？\n' + warnings())) { desk.stop(); void run(() => sendUndo(state.version), '元に戻しました'); } }}>↶ Undo · 元に戻す</button></div>
      </> : <p className="rounded-xl bg-slate-800 p-8 text-xl">試合 未登録。進行表を確認してください。</p>}
      <div className="grid gap-5 lg:grid-cols-2">{(['winner', 'sampler'] as const).map(group => <section key={group} className="rounded-2xl border border-white/15 bg-white/5 p-4">
        <h2 className="mb-4 text-xl font-black">{group === 'winner' ? '🏆 Winner BGM · 表彰' : 'サンプラー'}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{desk.pads.filter(p => p.group === group).map(pad => {
          const fallback = group === 'winner' ? program.cues.filter(c => c.kind === 'result')[Number(pad.id.split('-')[1])] : null;
          const file = desk.files[pad.id];
          const track: Track = { id: pad.id, channel: 'pads', title: pad.label, local: Boolean(file), url: file?.url || pad.url || fallback?.appleMusicUrl || fallback?.youtubeUrl || fallback?.otherUrl || '' };
          return <button key={pad.id} disabled={held || !playable(track)} onClick={() => playTrack(track)} className={'min-h-24 rounded-xl border p-3 text-lg font-bold disabled:opacity-40 ' + (desk.playing?.id === pad.id ? 'border-emerald-400 bg-emerald-800' : 'border-white/20 bg-slate-800')}>
            {pad.label}<span className="mt-2 block text-sm font-normal">{playLabel(track)}</span></button>;
        })}</div>
      </section>)}</div>
      {settings && <section className="space-y-5 rounded-2xl border border-amber-500/40 p-5">
        <h2 className="text-2xl font-bold">大会前の設定</h2>
        <p className="text-slate-300">音量・パッド名・URLはこの端末に保存します。端末の音声ファイルは外部へ送信しません。再読込後はファイルを選び直してください。</p>
        <div className="flex flex-wrap gap-3"><input aria-label="操作キー" type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="操作キー" className="rounded-lg bg-slate-800 p-3" />
          <button className={BUTTON} onClick={() => { setOperatorKey(keyInput); setHasKey(Boolean(keyInput.trim())); setKeyInput(''); }}>操作キーを保存</button></div>
        <div className="grid gap-4 sm:grid-cols-4">{(Object.keys(desk.volumes) as (keyof Volumes)[]).map(key => <label key={key}>{({ master: 'MASTER', red: 'RED ENTRANCE', blue: 'BLUE ENTRANCE', pads: 'BGM / SAMPLER' })[key]} · {Math.round(desk.volumes[key] * 100)}%
          <input aria-label={key + ' 音量'} type="range" min="0" max="1" step="0.01" value={desk.volumes[key]} className="mt-3 w-full" onChange={e => desk.setVolumes(v => ({ ...v, [key]: Number(e.target.value) }))} /></label>)}</div>
        {match && <div className="grid gap-4 sm:grid-cols-2">{(['red', 'blue'] as const).map(side => { const track = trackFor(side); return <label key={side} className="rounded-xl bg-slate-800 p-4">第{match.no}試合 {side.toUpperCase()} 入場曲ファイル
          <input aria-label={side + ' 入場曲ファイル'} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus" className="mt-3 block w-full" onChange={e => desk.selectFile(track.id, e.target.files?.[0])} />
          {desk.files[track.id] && <button className="min-h-12 underline" onClick={() => desk.clearFile(track.id)}>ファイルを解除して登録URLを使う</button>}</label>; })}</div>}
        <div className="grid gap-3 md:grid-cols-2">{desk.pads.map(pad => <div key={pad.id} className="space-y-2 rounded-xl bg-slate-800 p-3">
          <input aria-label={pad.id + ' 名前'} value={pad.label} className="w-full rounded bg-black/30 p-3" onChange={e => desk.setPads(p => p.map(x => x.id === pad.id ? { ...x, label: e.target.value.slice(0, 80) } : x))} />
          <input aria-label={pad.id + ' URL'} value={pad.url} placeholder="音声URL / Apple Music / YouTube" className="w-full rounded bg-black/30 p-3" onChange={e => desk.setPads(p => p.map(x => x.id === pad.id ? { ...x, url: e.target.value } : x))} />
          <input aria-label={pad.id + ' ファイル'} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus" onChange={e => desk.selectFile(pad.id, e.target.files?.[0])} />
          {desk.files[pad.id] && <button className="min-h-12 underline" onClick={() => desk.clearFile(pad.id)}>ファイルを解除</button>}
        </div>)}</div>
      </section>}
      <section className="rounded-2xl border border-white/15 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">試合一覧 · {program.matches.length}試合</h2>
        <button className={BUTTON} disabled={!ready || busy || held} onClick={() => { if (window.confirm('Google Sheetsからデータ更新しますか？\n' + warnings())) { desk.stop(); void run(reloadProgram, 'データを更新しました'); } }}>データ更新</button></div>
        <p className="mt-2 text-slate-400">最終取込：{program.fetchedAt ? new Date(program.fetchedAt).toLocaleString('ja-JP') : '未取込'} · 更新に失敗した場合は現在のデータを保持します。</p>
        <input aria-label="試合を検索" placeholder="試合番号・選手名・ジム名で検索" value={query} onChange={e => setQuery(e.target.value)} className="my-4 min-h-12 w-full rounded-xl bg-slate-800 px-4 text-lg" />
        <div className="max-h-80 space-y-2 overflow-auto">{matches.map(m => <button key={m.no} disabled={!ready || held || busy || m.no === match?.no} onClick={() => jump(m)} className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800 px-4 py-2 text-left disabled:opacity-60">
          <span>#{m.no} · {m.red.name || '未登録'} vs {m.blue.name || '未登録'}</span><span>{m.no === match?.no ? '現在' : 'この試合へ'}</span></button>)}</div>
        <div className="mt-4 flex gap-5"><a className="min-h-12 underline" href="../op/">詳細な進行・CSV取込</a><a className="min-h-12 underline" href="../check/">入場曲チェック</a><a className="min-h-12 underline" href="../mc/" target="_blank" rel="noreferrer">MC画面</a></div>
      </section>
    </main>
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap justify-end gap-3 border-t border-white/20 bg-slate-950/95 px-4 py-3">
      <button className={BUTTON + ' !bg-slate-600'} onClick={desk.stop}>■ すべて停止（OS内）</button>
      <button className={BUTTON + ' !bg-rose-800'} onClick={() => void emergency()}>■ 緊急停止</button>
    </div>
    {profile && match && <FighterProfile match={match} side={profile.side} announce={profile.announce} held={held}
      onAnnounce={() => setProfile({ ...profile, announce: true })} onClose={() => setProfile(null)}
      onPlay={() => playTrack(trackFor(profile.side))} onStop={desk.stop} musicTitle={trackFor(profile.side).title} playLabel={playLabel(trackFor(profile.side))} />}
  </div>;
}
