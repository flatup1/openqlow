'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { contractWeight, safeMusicUrl, type LocalFighter, type LocalTournament } from '../../../core/privateTournament.ts';
import { PrivateSaveConflict, readPrivateEvent, watchPrivateEvent, writePrivateEvent } from '../../lib/privateStore.ts';
import ListView, { EmptyBouts } from './ListView.tsx';
import { MUSIC_NEW_TAB, musicLabel, musicState, parseViewParam, withViewParam, type LiveView } from './listLogic.ts';

/* 赤と青は、色だけでなく「言葉」と「形」でも分ける: 赤コーナー=▲ / 青コーナー=■ 。帯は 24px の太字 */
const SIDE = {
  red: { label: '赤コーナー', mark: '▲', border: 'border-rose-700', band: 'bg-rose-700' },
  blue: { label: '青コーナー', mark: '■', border: 'border-blue-700', band: 'bg-blue-700' },
} as const;

function FighterCard({ side, fighter, musicEnabled }: { side: 'red'|'blue'; fighter: LocalFighter | undefined; musicEnabled: boolean }) {
  const [playing, setPlaying] = useState(false);
  const musicUrl = musicEnabled ? safeMusicUrl(fighter?.musicUrl ?? '') : '';
  const music = musicState(fighter, musicEnabled);
  useEffect(()=>setPlaying(false),[fighter?.id]);
  const look = SIDE[side];
  const hasPhoto = !!fighter?.photoDataUrl;
  return <article className={'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border-4 bg-white text-[17px] ' + look.border}>
    <p className={'px-4 py-2 text-center text-2xl font-black text-white ' + look.band}><span aria-hidden="true">{look.mark} </span>{look.label}</p>
    <div className={'relative bg-slate-100 ' + (hasPhoto ? 'min-h-[160px] flex-1 md:min-h-[180px]' : 'h-[96px] shrink-0')}>
      {hasPhoto ? <img src={fighter?.photoDataUrl} alt="" className="absolute inset-0 h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-slate-600">👤 画像なし</div>}
    </div>
    <div className="p-3">
      <h2 className="text-center text-[clamp(2.25rem,4.4vw,3.5rem)] font-black leading-tight [overflow-wrap:anywhere]">{fighter?.name || '選手未設定'}</h2>
      <p className="mt-1 text-center text-xl font-bold text-slate-700 [overflow-wrap:anywhere]">{fighter?.gym}</p>
      <div className="mt-2 rounded-xl bg-amber-50 p-3"><b>意気込み</b><p className="mt-1">{fighter?.comment || '未入力'}</p></div>
      {musicUrl ? <a href={musicUrl} target="_blank" rel="noreferrer" onClick={()=>setPlaying(true)} className="live-list-focus mt-2 flex min-h-[56px] items-center justify-center gap-2 rounded-xl border-4 border-slate-700 bg-white p-3 text-center text-xl font-black text-slate-950">{playing ? '▶ 曲の画面を開きました' : '▶ 入場曲を開く'}<span className="text-[17px] font-bold text-slate-700">{MUSIC_NEW_TAB}</span></a> :
        !musicEnabled ? <p className="mt-2 rounded-xl bg-slate-100 p-3 text-center font-bold text-slate-700">この大会は入場曲なし</p> :
        music === 'empty' ? null :
        <p className={'mt-2 rounded-xl border-4 p-3 text-center text-[18px] font-black leading-snug ' + (music === 'none' ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-orange-700 bg-orange-100 text-orange-950')}>{musicLabel(music)}</p>}
    </div>
  </article>;
}

export default function PrivateLive() {
  const [data,setData]=useState<LocalTournament|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(false);
  const savingRef=useRef(false);
  // 一覧の行から開いた直後: 2回目のクリックが新しい画面の「次の試合」などに当たらないよう、少しの間だけマウス・タッチを受けない
  const [settling,setSettling]=useState(false);
  const settleTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const openedFromList=useRef(false);
  const boutLabel=useRef<HTMLElement>(null);
  // 一覧から別の試合を開いたあと10秒だけ、「前の試合にもどす」を出す（まちがえて開いても、ひと押しで戻れる）
  const [undo,setUndo]=useState<{to:number;at:number}|null>(null);
  useEffect(()=>()=>{if(settleTimer.current)clearTimeout(settleTimer.current);},[]);
  useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),10000);return()=>clearTimeout(timer);},[undo]);
  // 見かた（1試合ずつ / 一覧）。URL の ?view=list に持たせるので、読み直しても、ブックマークしても残る
  const [view,setView]=useState<LiveView>(()=>typeof window==='undefined'?'single':parseViewParam(location.search));
  useEffect(()=>{const sync=()=>setView(parseViewParam(location.search));sync();window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);},[]);
  const changeView=(next:LiveView)=>{setView(next);try{history.replaceState(history.state,'',location.pathname+withViewParam(location.search,next)+location.hash);}catch{/* URLを書けなくても画面は切りかわる */}};
  const eventId = typeof window === 'undefined' ? '' : new URLSearchParams(location.search).get('event') || 'my-tournament';
  const load=()=>void readPrivateEvent(eventId).then((value)=>{setData(value);setLoaded(true);}).catch(()=>{setMessage('保存データを読めませんでした。データは消していません。準備画面で確認してください。');setLoaded(true);});
  useEffect(()=>{ load(); return watchPrivateEvent(eventId,load); },[eventId]);
  const bout=data?.bouts[data.currentBout];
  // 行から開いたあと: 画面の一番上へ戻し、「第N試合」にフォーカスを置く（読み上げ・キーボードのため）
  useEffect(()=>{
    if(view!=='single'||!openedFromList.current||!bout)return;
    openedFromList.current=false;
    try{window.scrollTo({top:0,left:0,behavior:'instant'});}catch{window.scrollTo(0,0);}
    boutLabel.current?.focus({preventScroll:true});
  },[view,bout]);
  const byId=useMemo(()=>new Map(data?.fighters.map((f)=>[f.id,f])??[]),[data]);
  const back='/private/?event='+encodeURIComponent(eventId);
  const pageClass='min-h-[100dvh] bg-slate-100 p-6 text-lg text-slate-950';
  const linkClass='live-list-focus mt-4 inline-flex min-h-[48px] items-center rounded-xl bg-indigo-700 px-5 text-lg font-black text-white';
  if(!loaded) return <main className={pageClass}><p className="text-xl font-bold">このパソコンのデータを読んでいます…</p></main>;
  if(!data)return <main className={pageClass}><div className="mx-auto max-w-xl rounded-2xl bg-white p-6"><p className="text-xl font-black">{message||'このブラウザには、まだ大会を保存していません。'}</p>{message?null:<p className="mt-2">この大会は、別のパソコンかブラウザで作りましたか？ 作ったパソコンの、同じブラウザで開いてください。</p>}<a href={back} className={linkClass}>準備画面へ戻る</a></div></main>;
  const list=view==='list';
  const red=bout?byId.get(bout.redId):undefined, blue=bout?byId.get(bout.blueId):undefined;
  const musicEnabled=data.entryConfig?.music ?? true;
  const last=data.bouts.length-1;
  // 保存できたら true。1試合ずつの画面と一覧の画面で、同じ保存・同じ守りを使う
  const jump=async(index:number):Promise<boolean>=>{
    if(savingRef.current||index<0||index>=data.bouts.length)return false;
    savingRef.current=true;setSaving(true);const next={...data,currentBout:index};
    try{const saved=await writePrivateEvent(next);setData(saved);setMessage('');setUndo(null);return true;}
    catch(error){
      if(error instanceof PrivateSaveConflict){load();setMessage('別の画面で変わっていたので、最新の内容に読み直しました。もう一度押してください。');}
      else setMessage('保存できなかったため、試合は進めていません。空き容量を確認して、もう一度押してください。');
      return false;
    }
    finally{savingRef.current=false;setSaving(false);}
  };
  // 一覧の行を押す: 今の試合にして、1試合ずつの画面で開く。保存できなかったら一覧のまま（エラーを出す）
  const openFromList=(index:number)=>{void (async()=>{
    const before=data.currentBout;
    if(index!==before&&!(await jump(index)))return;
    if(index!==before)setUndo({to:before,at:index});
    openedFromList.current=true;setSettling(true);
    if(settleTimer.current)clearTimeout(settleTimer.current);
    settleTimer.current=setTimeout(()=>setSettling(false),700);
    changeView('single');
  })();};
  const pick=(mode:LiveView)=>'live-list-focus live-list-noprint min-h-[64px] flex-1 rounded-xl border-2 px-3 text-xl font-black sm:flex-none sm:px-8 '+(view===mode?'border-slate-900 bg-slate-900 text-white':'border-slate-700 bg-white text-slate-900');
  const switcher=<div role="group" aria-label="表示のしかた" className="live-list-noprint mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm"><span className="w-full text-lg font-black sm:w-auto">表示のしかた</span><div className="flex w-full gap-3 sm:w-auto"><button type="button" aria-pressed={!list} onClick={()=>changeView('single')} className={pick('single')}><span className="block leading-tight">1試合ずつ</span>{!list?<span aria-hidden="true" className="block text-[17px] font-bold leading-tight">✓ 表示中</span>:null}</button><button type="button" aria-pressed={list} onClick={()=>changeView('list')} className={pick('list')}><span className="block leading-tight">一覧</span>{list?<span aria-hidden="true" className="block text-[17px] font-bold leading-tight">✓ 表示中</span>:null}</button></div></div>;
  const edge=last===0?'この大会は1試合だけです':data.currentBout===0?'最初の試合です':data.currentBout>=last?'最後の試合です（これで全部終わりです）':'';
  const footBtn='live-list-focus min-h-[64px] rounded-2xl text-xl font-black sm:min-h-[76px] ';
  return <main className={'flex min-h-[100dvh] flex-col bg-slate-100 p-3 text-slate-950'+(settling?' pointer-events-none':'')}><header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-white px-5 py-3 shadow-sm"><h1 className="text-xl font-black [overflow-wrap:anywhere]">{data.title}</h1><b ref={boutLabel} tabIndex={-1} className="live-list-focus flex flex-wrap items-baseline gap-x-3 rounded-lg px-1">{bout?<><span className="text-[40px] font-black leading-tight">{'第'+(data.currentBout+1)+'試合'}</span><span className="text-xl font-bold text-slate-700">{'全'+data.bouts.length+'試合'}</span></>:<span className="text-xl">全0試合</span>}</b><span className="rounded-full bg-emerald-100 px-3 py-1 text-[17px] font-black text-emerald-900">🔐 ローカル保存</span></header>{switcher}{message?<div role="alert" className="live-list-noprint fixed inset-x-3 top-3 z-50 mx-auto flex max-w-3xl items-start gap-3 rounded-2xl border-4 border-rose-700 bg-rose-50 p-4 text-[17px] font-bold text-rose-950 shadow-xl"><p className="min-w-0 flex-1 leading-snug [overflow-wrap:anywhere]"><span aria-hidden="true">⚠ </span>{message}</p><button type="button" onClick={()=>setMessage('')} className="live-list-focus min-h-[48px] shrink-0 rounded-xl border-2 border-rose-800 bg-white px-4 text-[17px] font-black text-rose-950">閉じる</button></div>:null}{!list&&undo&&bout?<div role="status" className="live-list-noprint mt-3 flex flex-wrap items-center gap-3 rounded-2xl border-4 border-amber-500 bg-amber-100 p-3"><p className="min-w-0 flex-1 text-xl font-black text-slate-950">{'第'+(undo.at+1)+'試合を開きました。'}<span className="block text-[17px] font-bold text-slate-800">まちがえたときは、下のボタンで もどれます（10秒）</span></p><button type="button" disabled={saving} onClick={()=>void jump(undo.to)} className="live-list-focus min-h-[56px] w-full rounded-xl sm:w-auto border-4 border-slate-900 bg-white px-5 text-xl font-black text-slate-950">{'第'+(undo.to+1)+'試合にもどす'}</button></div>:null}{list?<ListView data={data} eventId={eventId} saving={saving} onOpen={openFromList}/>:bout?<><section className="mt-3 grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_minmax(0,1fr)]"><FighterCard side="red" fighter={red} musicEnabled={musicEnabled}/><div className="grid min-w-0 place-items-center rounded-2xl bg-white p-3 text-center"><div className="min-w-0 max-w-full"><p className="text-2xl font-black leading-none text-slate-600">VS</p><p className="mt-3 text-[clamp(1.75rem,3.5vw,2.75rem)] font-black leading-tight [overflow-wrap:anywhere]">{contractWeight(red,blue) || bout.className || '契約未入力'}</p><p className="mt-2 text-xl font-bold text-slate-700 [overflow-wrap:anywhere]">{bout.rule}</p></div></div><FighterCard side="blue" fighter={blue} musicEnabled={musicEnabled}/></section><footer className="live-single-footer mt-3 rounded-2xl bg-white p-2 shadow-[0_-4px_12px_rgba(15,23,42,0.18)]"><div className="grid grid-cols-2 gap-3"><button disabled={saving||data.currentBout===0} onClick={()=>void jump(data.currentBout-1)} className={footBtn+'border-4 border-slate-800 bg-white text-slate-950 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-700'}>← 前の試合</button><button disabled={saving||data.currentBout>=last} onClick={()=>void jump(data.currentBout+1)} className={footBtn+'border-4 border-emerald-800 bg-emerald-700 text-white disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-700'}>次の試合 →</button></div>{edge?<p className="mt-1 text-center text-[17px] font-bold text-slate-800">{edge}</p>:null}</footer></>:<EmptyBouts eventId={eventId}/>}</main>;
}
