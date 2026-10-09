'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { contractWeight, safeMusicUrl, type LocalTournament } from '../../../core/privateTournament.ts';
import { cloudStorage, PrivateSaveConflict, readPrivateEvent, watchPrivateEvent, writePrivateEvent } from '../../lib/privateStore.ts';
import { cloudServerTime, cloudTimerCommand } from '../../lib/cloudClient.ts';
import { timerAt, timerCommand, type TimerAction } from '../../../core/privateTimer.ts';

function FighterCard({ side, fighter, musicEnabled }: { side: 'red'|'blue'; fighter: LocalTournament['fighters'][number] | undefined; musicEnabled: boolean }) {
  const [playing, setPlaying] = useState(false);
  const musicUrl = musicEnabled ? safeMusicUrl(fighter?.musicUrl ?? '') : '';
  useEffect(()=>setPlaying(false),[fighter?.id]);
  const color = side === 'red' ? 'border-rose-500 bg-rose-600' : 'border-blue-500 bg-blue-600';
  return <article className={'flex min-h-0 flex-col overflow-hidden rounded-3xl border-4 bg-white ' + color.split(' ')[0]}>
    <div className="relative min-h-[180px] flex-1 bg-slate-100">
      {fighter?.photoDataUrl ? <img src={fighter.photoDataUrl} alt="" className="absolute inset-0 h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-slate-500">👤 画像なし</div>}
      <span className={'absolute left-3 top-3 rounded-full px-4 py-2 font-black text-white ' + color.split(' ')[1]}>{side === 'red' ? '赤コーナー' : '青コーナー'}</span>
    </div>
    <div className="p-4">
      <h2 className="text-center text-3xl font-black">{fighter?.name || '選手未設定'}</h2>
      <p className="text-center font-bold text-slate-600">{fighter?.gym}</p>
      <div className="mt-3 rounded-xl bg-amber-50 p-3"><b>意気込み</b><p className="mt-1">{fighter?.comment || '未入力'}</p></div>
      {musicUrl ? <a href={musicUrl} target="_blank" rel="noreferrer" onClick={()=>setPlaying(true)} className={'mt-3 block rounded-xl p-4 text-center text-xl font-black text-white ' + color.split(' ')[1]}>{playing ? '▶ 曲の画面を開きました' : '▶ 入場曲を開く'}</a> :
        <p className="mt-3 rounded-xl bg-slate-100 p-4 text-center font-bold text-slate-600">{!musicEnabled ? 'この大会は入場曲なし' : fighter?.musicUrl ? '入場曲のリンクを確認してください' : '入場曲はまだ登録されていません'}</p>}
    </div>
  </article>;
}

export default function PrivateLive() {
  const [data,setData]=useState<LocalTournament|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(false);
  const savingRef=useRef(false);
  const [now,setNow]=useState(0);
  useEffect(()=>{const tick=()=>setNow(cloudStorage()?cloudServerTime():Date.now());tick();const interval=setInterval(tick,200);return ()=>clearInterval(interval);},[]);
  const eventId = typeof window === 'undefined' ? '' : new URLSearchParams(location.search).get('event') || 'my-tournament';
  const load=()=>void readPrivateEvent(eventId).then((value)=>{setData(value);setLoaded(true);}).catch(()=>{setMessage('保存データを読めませんでした。データは消していません。準備画面で確認してください。');setLoaded(true);});
  useEffect(()=>{ load(); return watchPrivateEvent(eventId,()=>{if(!savingRef.current)load();}); },[eventId]);
  const bout=data?.bouts[data.currentBout];
  const byId=useMemo(()=>new Map(data?.fighters.map((f)=>[f.id,f])??[]),[data]);
  const timer=data?timerAt(data,now):null;
  const clock=timer?Math.ceil(timer.remainingMs/1000):0;
  const cloud=cloudStorage();
  const back='/cloud-manage/?event='+encodeURIComponent(eventId)+(cloud?'&storage=cloud':'');
  if(!loaded) return <main className="p-8">このパソコンのデータを読んでいます…</main>;
  if(!data)return <main className="p-8"><p>{message||'このブラウザには、まだ大会を保存していません。'}</p><a href={back} className="mt-4 block underline">準備画面へ戻る</a></main>;
  if(!bout) return <main className="grid min-h-screen place-items-center bg-slate-50 p-8 text-center"><div><h1 className="text-3xl font-black">対戦カードがありません</h1><a href={back} className="mt-5 block text-indigo-700 underline">準備画面へ戻る</a></div></main>;
  const red=byId.get(bout.redId), blue=byId.get(bout.blueId);
  const musicEnabled=data.entryConfig?.music ?? true;
  const jump=async(index:number)=>{
    if(savingRef.current||index<0||index>=data.bouts.length)return;
    if(timer?.status==='running')return setMessage('時計を止めてから試合を切り替えてください。');
    savingRef.current=true;setSaving(true);const next={...data,currentBout:index,timer:undefined};
    try{const saved=await writePrivateEvent(next);setData(saved);setMessage('');}
    catch(error){setMessage(error instanceof PrivateSaveConflict ? error.message+' この画面を読み直して、今の試合を確認してください。' : '保存できなかったため、試合は進めていません。空き容量を確認して、もう一度押してください。');}
    finally{savingRef.current=false;setSaving(false);}
  };
  const control=async(action:TimerAction)=>{
    if(savingRef.current)return;
    if(action==='reset'&&!window.confirm('この試合の時計を最初へ戻しますか？'))return;
    savingRef.current=true;setSaving(true);
    try{setData(cloud?await cloudTimerCommand(data,action):await writePrivateEvent(timerCommand(data,action,Date.now())));setMessage('');}
    catch(error){setMessage(error instanceof Error?error.message:'時計を保存できません。最新の状態を読み直してください。');}
    finally{savingRef.current=false;setSaving(false);}
  };
  return <main className="flex min-h-[100dvh] flex-col bg-slate-100 p-3 text-slate-950"><header className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-5 py-3 shadow-sm"><h1 className="text-xl font-black">{data.title}</h1><b>第 {data.currentBout+1} 試合 / 全 {data.bouts.length} 試合</b><span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-black text-emerald-900">{cloud?'☁ Cloudflare保存':'🔐 ローカル保存'}</span></header>{message?<p role="alert" className="mt-3 rounded-xl bg-rose-100 p-4 font-bold text-rose-900">{message}</p>:null}<section className="mt-3 rounded-2xl bg-slate-950 p-4 text-center text-white" aria-label="試合タイマー">{timer?<><p className="font-black">{timer.phase==='complete'?'試合時間が終了しました':(timer.phase==='break'?'休憩':'ラウンド')+' '+timer.round}</p><output aria-label="残り時間" className="block text-6xl font-black tabular-nums">{Math.floor(clock/60).toString().padStart(2,'0')}:{(clock%60).toString().padStart(2,'0')}</output><p className="mt-2">各ラウンドは会長が「時計を開始」を押して始めます。</p><p aria-label="時計の状態">{timer.status==='running'?'進行中':'停止中'}</p><div className="mt-3 flex justify-center gap-3"><button disabled={saving||timer.status==='running'||timer.phase==='complete'} onClick={()=>void control('start')} className="rounded-xl bg-emerald-600 p-3 disabled:bg-slate-600">時計を開始</button><button disabled={saving||timer.status!=='running'} onClick={()=>void control('pause')} className="rounded-xl bg-amber-600 p-3 disabled:bg-slate-600">時計を止める</button><button disabled={saving} onClick={()=>void control('reset')} className="rounded-xl border p-3">時計を最初へ戻す</button></div></>:<p>準備画面で試合の時間を設定してください。</p>}</section><section className="mt-3 grid min-h-0 flex-1 gap-3 md:grid-cols-[1fr_150px_1fr]"><FighterCard side="red" fighter={red} musicEnabled={musicEnabled}/><div className="grid place-items-center rounded-2xl bg-white p-3 text-center"><div><p className="text-5xl font-black">VS</p><p className="mt-3 text-xl font-black">{contractWeight(red,blue) || bout.className || '契約未入力'}</p><p className="mt-2 text-sm text-slate-600">{bout.rule}</p></div></div><FighterCard side="blue" fighter={blue} musicEnabled={musicEnabled}/></section><footer className="mt-3 grid grid-cols-2 gap-3"><button disabled={saving||data.currentBout===0} onClick={()=>void jump(data.currentBout-1)} className="min-h-[76px] rounded-2xl bg-slate-800 text-xl font-black text-white disabled:bg-slate-300">← 前の試合</button><button disabled={saving||data.currentBout>=data.bouts.length-1} onClick={()=>void jump(data.currentBout+1)} className="min-h-[76px] rounded-2xl bg-emerald-700 text-xl font-black text-white disabled:bg-slate-300">次の試合 →</button></footer></main>;
}
