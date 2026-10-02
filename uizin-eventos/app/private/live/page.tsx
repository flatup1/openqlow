'use client';

import { useEffect, useMemo, useState } from 'react';
import { contractWeight, safeMusicUrl, type LocalTournament } from '../../../core/privateTournament.ts';
import { readPrivateEvent, watchPrivateEvent, writePrivateEvent } from '../../lib/privateStore.ts';

function FighterCard({ side, fighter }: { side: 'red'|'blue'; fighter: LocalTournament['fighters'][number] | undefined }) {
  const [playing, setPlaying] = useState(false);
  const musicUrl = safeMusicUrl(fighter?.musicUrl ?? '');
  const color = side === 'red' ? 'border-rose-500 bg-rose-600' : 'border-blue-500 bg-blue-600';
  return <article className={'flex min-h-0 flex-col overflow-hidden rounded-3xl border-4 bg-white ' + color.split(' ')[0]}><div className="relative min-h-[180px] flex-1 bg-slate-100">{fighter?.photoDataUrl ? <img src={fighter.photoDataUrl} alt="" className="absolute inset-0 h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-slate-500">👤 画像なし</div>}<span className={'absolute left-3 top-3 rounded-full px-4 py-2 font-black text-white ' + color.split(' ')[1]}>{side === 'red' ? '赤コーナー' : '青コーナー'}</span></div><div className="p-4"><h2 className="text-center text-3xl font-black">{fighter?.name || '選手未設定'}</h2><p className="text-center font-bold text-slate-600">{fighter?.gym}</p><div className="mt-3 rounded-xl bg-amber-50 p-3"><b>意気込み</b><p className="mt-1">{fighter?.comment || '未入力'}</p></div><p className="mt-3 truncate text-sm font-bold">入場曲：{musicUrl ? '登録あり' : '曲なし・URL要確認'}</p>{musicUrl ? <a href={musicUrl} target="_blank" rel="noreferrer" onClick={()=>setPlaying(true)} className={'mt-2 block rounded-xl p-4 text-center text-xl font-black text-white ' + color.split(' ')[1]}>{playing ? '▶ 曲の画面を開きました' : '▶ 入場曲を開く'}</a> : <div className="mt-2 rounded-xl bg-slate-200 p-4 text-center font-bold text-slate-500">曲なし・URL要確認</div>}</div></article>;
}

export default function PrivateLive() {
  const [data,setData]=useState<LocalTournament|null>(null);
  const eventId = typeof window === 'undefined' ? '' : new URLSearchParams(location.search).get('event') || 'my-tournament';
  const load=()=>void readPrivateEvent(eventId).then(setData);
  useEffect(()=>{ load(); return watchPrivateEvent(eventId,load); },[eventId]);
  const bout=data?.bouts[data.currentBout];
  const byId=useMemo(()=>new Map(data?.fighters.map((f)=>[f.id,f])??[]),[data]);
  if(!data) return <main className="p-8">このパソコンのデータを読んでいます…</main>;
  if(!bout) return <main className="grid min-h-screen place-items-center bg-slate-50 p-8 text-center"><div><h1 className="text-3xl font-black">対戦カードがありません</h1><a href={'/private/?event='+encodeURIComponent(eventId)} className="mt-5 block text-indigo-700 underline">準備画面へ戻る</a></div></main>;
  const red=byId.get(bout.redId), blue=byId.get(bout.blueId);
  const jump=async(index:number)=>{const next={...data,currentBout:index};setData(next);await writePrivateEvent(next);};
  return <main className="flex min-h-[100dvh] flex-col bg-slate-100 p-3 text-slate-950"><header className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-5 py-3 shadow-sm"><h1 className="text-xl font-black">{data.title}</h1><b>第 {data.currentBout+1} 試合 / 全 {data.bouts.length} 試合</b><span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-black text-emerald-900">🔐 ローカル保存</span></header><section className="mt-3 grid min-h-0 flex-1 gap-3 md:grid-cols-[1fr_150px_1fr]"><FighterCard side="red" fighter={red}/><div className="grid place-items-center rounded-2xl bg-white p-3 text-center"><div><p className="text-5xl font-black">VS</p><p className="mt-3 text-xl font-black">{contractWeight(red,blue) || bout.className || '契約未入力'}</p><p className="mt-2 text-sm text-slate-600">{bout.rule}</p></div></div><FighterCard side="blue" fighter={blue}/></section><footer className="mt-3 grid grid-cols-2 gap-3"><button disabled={data.currentBout===0} onClick={()=>void jump(data.currentBout-1)} className="min-h-[76px] rounded-2xl bg-slate-800 text-xl font-black text-white disabled:bg-slate-300">← 前の試合</button><button disabled={data.currentBout>=data.bouts.length-1} onClick={()=>void jump(data.currentBout+1)} className="min-h-[76px] rounded-2xl bg-emerald-700 text-xl font-black text-white disabled:bg-slate-300">次の試合 →</button></footer></main>;
}
