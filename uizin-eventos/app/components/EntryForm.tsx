'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_ENTRY_CONFIG, entryConfigFromSearch, entryCsv, entryErrors, type EntryFighter, type EntryFormConfig } from '../../core/entryPackage.ts';
import { bytesToArrayBuffer, photoToDataUrl } from '../lib/privateStore.ts';
import { onlineEntryRequest, type OnlineRecruitment } from '../lib/onlineEntryClient.ts';

type ReadyFighter = EntryFighter & { photoDataUrl: string };
const input = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-base';
const blank = (gym = ''): EntryFighter => ({ id: crypto.randomUUID(), gym, name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '' });

function photoBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.split(',', 2)[1] ?? '');
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export default function EntryForm({onlineCode}: {onlineCode?:string} = {}) {
  const [config, setConfig] = useState<EntryFormConfig>(DEFAULT_ENTRY_CONFIG);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<EntryFighter>(() => blank());
  const [photo, setPhoto] = useState('');
  const [fighters, setFighters] = useState<ReadyFighter[]>([]);
  const [message, setMessage] = useState('');
  const [recruitment,setRecruitment]=useState<OnlineRecruitment|null>(null);
  const [sending,setSending]=useState(false);
  const [receipts,setReceipts]=useState<Record<string,string>>({});
  useEffect(() => {
    if(!onlineCode){setConfig(entryConfigFromSearch(location.search));setReady(true);return;}
    onlineEntryRequest(onlineCode).then(body=>{if(body.recruitment){setRecruitment(body.recruitment);setConfig(body.recruitment.config);}setReady(true);}).catch(error=>{setMessage(error instanceof Error?error.message:'受付を確認できません。');setReady(true);});
  }, [onlineCode]);

  const change = (key: keyof EntryFighter, value: string) => setCurrent((old) => ({ ...old, [key]: value }));
  const add = () => {
    const errors = entryErrors(current, Boolean(photo), config);
    if (errors.length) return setMessage(errors[0]);
    setFighters((old) => [...old, { ...current, photoDataUrl: photo }]);
    setCurrent(blank(current.gym));
    setPhoto('');
    setMessage('選手を追加しました。続けて次の選手を入力できます。');
  };
  const download = async () => {
    if (!fighters.length) return setMessage('先に選手を1人以上追加してください。');
    const { strToU8, zipSync } = await import('fflate');
    const files: Record<string, Uint8Array> = { 'players.csv': strToU8(entryCsv(fighters)) };
    for (const fighter of fighters) files[`photos/${fighter.id}.jpg`] = photoBytes(fighter.photoDataUrl);
    const zipped = zipSync(files, { level: 6 });
    const url = URL.createObjectURL(new Blob([bytesToArrayBuffer(zipped)], { type: 'application/zip' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = (fighters[0].gym.trim() || 'ジム') + '_選手提出パック.zip';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('提出ファイルを保存しました。このZIPファイルを大会主催者へ渡してください。');
  };
  const submit=async()=>{
    if(!onlineCode||sending||!recruitment?.accepting)return;
    if(!fighters.length)return setMessage('先に選手を追加してください。');
    setSending(true);
    try{for(const fighter of fighters){if(receipts[fighter.id])continue;const body=await onlineEntryRequest(onlineCode,fighter);if(!body.receipt)throw new Error('受付番号を確認できません。同じ内容で再確認してください。');setReceipts(old=>({...old,[fighter.id]:body.receipt!}));}setMessage('申し込みを受け付けました。受付番号を控えてください。');}
    catch(error){setMessage(error instanceof Error?error.message:'受付結果を確認できません。入力を残して、同じ内容で再確認してください。');}
    finally{setSending(false);}
  };

  if (!ready) return <main className="p-8">入力画面を準備しています…</main>;
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950"><div className="mx-auto max-w-3xl">
    <header className="rounded-3xl bg-white p-6 shadow-sm"><p className="font-black text-emerald-700">🔐 選手エントリーシート</p><h1 className="mt-2 text-3xl font-black">{onlineCode?recruitment?.title||'受付を開けません':'黄色い欄へ入力するだけです'}</h1><p className="mt-3 leading-relaxed text-slate-700">{onlineCode?'「大会へ申し込む」を押すと、氏名・写真・競技情報を大会主催者のCloudflare保存先へ送ります。': '入力した名前・体重・写真はCloudflareへ送信されません。この画面を閉じるまで、この端末の中だけで使います。'}</p>{recruitment&&<><p>{recruitment.date} / {recruitment.venue}</p><p>{recruitment.description}</p><p>{recruitment.accepting?'受付中':'締切を過ぎています'} {recruitment.deadline}</p></>}<div className="mt-4 rounded-xl bg-amber-50 p-4 font-bold text-amber-950">電話番号・メール・住所・生年月日・保護者名は入力しません。</div></header>
    {message ? <p role="status" className="sticky top-2 z-20 mt-4 rounded-xl bg-indigo-700 p-4 font-bold text-white shadow">{message}</p> : null}
    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">1. 選手を入力</h2><p className="mt-2 text-slate-600">「必須」はすべて入力してください。戦績がない選手は「初試合」と入力します。</p><div className="mt-4 grid gap-4 sm:grid-cols-2">
      {([['gym','ジム名 必須'],['name','選手名 必須'],['height','身長（cm）必須'],['weight','体重（kg）必須'],['record','戦績・競技歴 必須']] as const).map(([key,label]) => <label key={key} className="font-bold">{label}<input className={input + ' bg-amber-50'} value={current[key]} inputMode={['height','weight'].includes(key) ? 'decimal' : undefined} onChange={(event)=>change(key,event.target.value)} /></label>)}
      {([['grade','学年',config.grade],['age','年齢',config.age],['comment','試合への意気込み',config.comment]] as const).filter(([, , mode])=>mode!=='off').map(([key,label,mode]) => <label key={key} className="font-bold">{label}{mode==='required'?' 必須':' 任意'}<input className={input + ' bg-amber-50'} value={current[key]} inputMode={key==='age'?'numeric':undefined} onChange={(event)=>change(key,event.target.value)} /></label>)}
    </div>{config.music?<label className="mt-4 block rounded-xl bg-amber-50 p-4 font-bold">入場曲URL 必須<input className={input} value={current.musicUrl} placeholder="Apple Music または YouTube のURL" onChange={(event)=>change('musicUrl',event.target.value)}/></label>:<p className="mt-4 rounded-xl bg-slate-100 p-4 font-bold text-slate-700">この大会では入場曲を使いません。</p>}<label className="mt-4 block rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 p-5 text-center font-black text-indigo-900">選手の顔写真 必須<input type="file" accept="image/*" className="mt-3 block w-full text-sm" onChange={async(event)=>{const file=event.target.files?.[0];if(!file)return;try{setPhoto(await photoToDataUrl(file));setMessage('写真を選びました。');}catch(error){setMessage(error instanceof Error?error.message:'写真を読めませんでした。');}}} /></label>{photo ? <img src={photo} alt="選んだ顔写真" className="mx-auto mt-3 h-44 w-36 rounded-xl bg-slate-100 object-contain" /> : null}<button onClick={add} className="mt-5 w-full rounded-xl bg-indigo-700 p-4 text-xl font-black text-white">この選手を追加</button></section>
    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">2. 入力した選手を確認</h2><p className="mt-2 rounded-xl bg-emerald-50 p-4 font-black text-emerald-900">現在 {fighters.length}人</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{fighters.map((fighter,index)=><article key={fighter.id} className="flex gap-3 rounded-xl border p-3"><img src={fighter.photoDataUrl} alt="" className="h-24 w-20 rounded-lg bg-slate-100 object-contain"/><div className="min-w-0 flex-1"><b>{fighter.name}</b><p className="text-sm text-slate-600">{fighter.gym} / {fighter.weight}kg</p><button onClick={()=>setFighters((old)=>old.filter((_,i)=>i!==index))} className="mt-3 text-sm font-bold text-rose-700">この選手を取り消す</button></div></article>)}</div></section>
    {onlineCode&&<section className="mt-5 rounded-2xl bg-white p-6"><h2 className="text-2xl font-black">3. 大会へ申し込む</h2><p className="mt-3">氏名・写真・競技情報の送信内容を確認して押してください。</p><button disabled={sending||!recruitment?.accepting} onClick={()=>void submit()} className="mt-4 w-full rounded-xl bg-indigo-700 p-4 font-black text-white disabled:bg-slate-300">{sending?'受付を確認しています…':'大会へ申し込む'}</button>{Object.entries(receipts).map(([id,receipt])=><p key={id} className="mt-3 break-all">受付番号：{receipt}</p>)}</section>}
    <section className="my-5 rounded-2xl bg-slate-900 p-6 text-white"><h2 className="text-2xl font-black">{onlineCode?'予備の提出ファイルを作る':'3. 主催者へ渡すファイルを作る'}</h2><p className="mt-2 text-slate-300">CSVと写真を1つのZIPファイルにまとめます。このボタンではインターネットへ送信しません。</p><button onClick={()=>void download()} className="mt-4 w-full rounded-xl bg-emerald-600 p-4 text-xl font-black">📥 提出ファイルを保存する</button><p className="mt-3 text-center text-sm text-slate-300">保存されたZIPファイルを、いつもの連絡方法で大会主催者へ渡してください。</p></section>
  </div></main>;
}
