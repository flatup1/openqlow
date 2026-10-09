'use client';
import { useEffect, useState } from 'react';
type FighterView={name:string;gym:string;weight:string};
type View={title:string;boutNo:number;totalBouts:number;red:FighterView|null;blue:FighterView|null};
export default function CloudView() {
  const [view,setView]=useState<View|null>(null),[message,setMessage]=useState('大会を確認しています…');
  useEffect(()=>{
    const code=new URLSearchParams(location.search).get('code')||'';
    const controller=new AbortController();
    const load=async()=>{try{const response=await fetch('/api/cloud-view?code='+encodeURIComponent(code),{cache:'no-store',credentials:'omit',signal:controller.signal});const body=await response.json() as {ok:boolean;reason?:string;view:View};if(!response.ok||!body.ok){setView(null);setMessage(body.reason||'主催者に画面のリンクを確認してください。');return;}setView(body.view);setMessage('');}catch{if(!controller.signal.aborted)setMessage('接続を確認しています。表示の更新をお待ちください。');}};
    void load();const timer=setInterval(()=>void load(),5000);return ()=>{controller.abort();clearInterval(timer);};
  },[]);
  return <main className="min-h-screen bg-slate-950 p-6 text-white"><div className="mx-auto max-w-4xl"><h1 className="text-center text-3xl font-black">{view?.title||'大会の観客画面'}</h1>{message&&<p role="status" className="mt-4 text-center">{message}</p>}{view&&<><p className="my-6 text-center text-xl font-black">{view.totalBouts?'第 '+view.boutNo+' 試合 / 全 '+view.totalBouts+' 試合':'対戦カードを準備しています'}</p><section className="grid gap-6 sm:grid-cols-2">{(['red','blue'] as const).map(side=><article key={side} className={'rounded-3xl p-8 text-center '+(side==='red'?'bg-rose-700':'bg-blue-700')}><p>{side==='red'?'赤コーナー':'青コーナー'}</p><h2 className="mt-4 text-3xl font-black">{view[side]?.name||'選手未設定'}</h2><p className="mt-3 text-xl">{view[side]?.gym}</p><p className="mt-3 text-2xl font-black">{view[side]?.weight?view[side]!.weight+'kg':''}</p></article>)}</section></>}</div></main>;
}
