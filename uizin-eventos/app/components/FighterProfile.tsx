'use client';

import { useEffect, useRef, useState } from 'react';
import type { Match } from '../../core/types.ts';

export function FighterPhoto({ url, name }: { url: string; name: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return url && !broken ? <img src={url} alt={name} onError={() => setBroken(true)} referrerPolicy="no-referrer" className="h-36 w-28 rounded-xl object-cover object-top" />
    : <div role="img" aria-label="写真 未登録" className="flex h-36 w-28 items-center justify-center rounded-xl bg-slate-800 text-6xl text-slate-500">♟</div>;
}

export function FighterProfile({ match, side, announce, onAnnounce, onClose, onPlay, onStop, playLabel, musicTitle, held }: {
  match: Match; side: 'red' | 'blue'; announce: boolean; onAnnounce: () => void; onClose: () => void;
  onPlay: () => void; onStop: () => void; playLabel: string; musicTitle: string; held: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fighter = match[side];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { previous?.focus(); };
  }, []);
  const fields = [
    ['所属ジム', fighter.team], ['年齢', fighter.age], ['身長', fighter.height], ['体重', fighter.weight],
    ['階級', match.className], ['カテゴリー', fighter.category], ['戦績', fighter.record], ['構え', fighter.stance],
    ['対戦相手', match[side === 'red' ? 'blue' : 'red'].name],
  ];
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="fighter-heading" className="fixed inset-0 m-auto max-h-[94vh] w-[min(1100px,96vw)] overflow-y-auto rounded-2xl border border-white/20 bg-slate-950 p-6 text-white backdrop:bg-black/85">
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-slate-950 py-2">
      <p className={'text-xl font-black ' + (side === 'red' ? 'text-rose-400' : 'text-sky-400')}>{side.toUpperCase()} CORNER · 第{match.no}試合<span className="mt-1 block text-white">{fighter.name} · {fighter.kana || '読み方未登録'}</span></p>
      <button onClick={onClose} className="min-h-12 rounded-lg bg-slate-700 px-6 font-bold">閉じる</button>
    </div>
    {held ? <p role="alert" className="rounded-xl bg-rose-950 p-4 text-2xl">緊急停止中です。読み上げを待ってください。</p> : null}
    <div className="mt-4 flex items-center gap-5">
      {!announce && <FighterPhoto url={fighter.photo} name={fighter.name} />}
      <div><h2 id="fighter-heading" className="text-[clamp(2rem,5vw,4rem)] font-black">{fighter.name || '選手名 未登録'}</h2>
        <p className="mt-2 text-2xl">{fighter.kana || '読み方未登録'}</p>
        <p className="mt-3 text-xl text-slate-300">{fighter.team || '所属 未登録'}</p></div>
    </div>
    {!announce && <dl className="my-6 grid grid-cols-2 gap-4 md:grid-cols-3">{fields.map(([label, value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="text-xl">{value || '未登録'}</dd></div>)}</dl>}
    <p className="mt-8 text-lg text-slate-400">選手の意気込み</p>
    <p className="mx-auto my-6 max-w-[24em] whitespace-pre-wrap break-words font-bold leading-relaxed" style={{ fontSize: announce ? (fighter.comment.length > 160 ? 'clamp(1.75rem,3vw,2.5rem)' : 'clamp(2rem,4vw,3.5rem)') : '1.5rem' }}>{fighter.comment || '意気込み 未登録'}</p>
    <p className="text-lg text-slate-300">入場曲：{musicTitle}</p>
    <div className="sticky bottom-0 flex flex-wrap gap-3 bg-slate-950 py-3">
      <button disabled={held} onClick={onPlay} className="min-h-14 rounded-xl bg-indigo-700 px-6 text-lg font-bold disabled:opacity-40">{playLabel}</button>
      <button onClick={onStop} className="min-h-14 rounded-xl bg-slate-700 px-6 text-lg font-bold">■ 停止（OS内）</button>
      {announce ? <button onClick={onClose} className="min-h-14 rounded-xl bg-emerald-700 px-6 text-lg font-bold">✓ 読み上げ完了</button>
        : <button onClick={onAnnounce} className="min-h-14 rounded-xl bg-slate-700 px-6 text-lg font-bold">🎙 アナウンス</button>}
    </div>
  </dialog>;
}
