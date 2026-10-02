'use client';

import { useEffect, useRef, useState } from 'react';
import { entryErrors, type EntryFighter } from '../../core/entryPackage.ts';
import { EMPTY_PUBLIC_ENTRY_CONFIG, isAppsScriptUrl, isVenueUrl, publicEntryConfig, type PublicEntryConfig } from '../../core/publicEntry.ts';
import { photoToDataUrl } from '../lib/privateStore.ts';

const field = 'mt-2 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3.5 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-100';
const blank = (): EntryFighter => ({ id: '', gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '' });

export default function PublicApply() {
  const [config, setConfig] = useState<PublicEntryConfig>(EMPTY_PUBLIC_ENTRY_CONFIG);
  const [fighter, setFighter] = useState<EntryFighter>(blank);
  const [photo, setPhoto] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState('');
  const [requestId, setRequestId] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const tokenRef = useRef('');

  useEffect(() => {
    setConfig(publicEntryConfig(location.hash));
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => { if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); };
  }, []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const data = event.data as { type?: string; token?: string; receiptNo?: string; error?: string } | null;
      if (!data || data.type !== 'tournament-entry-result' || data.token !== tokenRef.current) return;
      setSending(false);
      if (data.error) return setMessage('送信できませんでした。時間をおいて、もう一度お試しください。');
      setDone(data.receiptNo || '受付済み');
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => { if (sending && requestId) formRef.current?.requestSubmit(); }, [sending, requestId]);

  const change = (key: keyof EntryFighter, value: string) => setFighter((old) => ({ ...old, [key]: value }));
  const submit = () => {
    const errors = entryErrors(fighter, Boolean(photo), config);
    if (!contactName.trim()) errors.push('連絡先のお名前を入力してください。');
    if (!/^0?[0-9][0-9 -]{8,14}$/.test(contactPhone)) errors.push('電話番号を確認してください。');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) errors.push('メールアドレスを確認してください。');
    if (!consent) errors.push('規約と個人情報の取扱いへの同意が必要です。');
    if (!isAppsScriptUrl(config.endpoint)) errors.push('この大会の受付先がまだ設定されていません。主催者へご連絡ください。');
    if (errors.length) return setMessage(errors[0]);
    if (!window.confirm('入力内容を主催者のGoogleアカウントへ送ります。よろしいですか？')) return;
    const requestId = crypto.randomUUID();
    tokenRef.current = crypto.randomUUID();
    setRequestId(requestId);
    setMessage('送信しています。この画面を閉じないでください。');
    setSending(true);
  };

  if (done) return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#dcfce7_0%,#f8fafc_55%)] p-5 text-slate-950"><section className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-emerald-200 bg-white text-center shadow-2xl"><div className="h-3 bg-gradient-to-r from-emerald-500 via-lime-400 to-emerald-500"/><div className="p-8"><p className="text-7xl">✅</p><p className="mt-3 text-sm font-black tracking-[.25em] text-emerald-700">ENTRY COMPLETE</p><h1 className="mt-2 text-3xl font-black">申し込みが完了しました</h1><p className="mt-5 text-lg font-bold text-slate-600">受付番号</p><p className="mt-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 text-3xl font-black tracking-wide text-emerald-900">{done}</p><p className="mt-5 font-bold text-slate-700">この画面をスクリーンショットで保存してください。</p></div></section></main>;
  const endpointReady = isAppsScriptUrl(config.endpoint);
  return <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#fff1f2_0%,#f8fafc_34%,#eff6ff_100%)] px-4 py-6 text-slate-950 sm:py-10"><div className="mx-auto max-w-3xl">
    <header className="relative overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-2xl shadow-slate-300/70"><div className="absolute -left-16 -top-20 h-56 w-56 rotate-12 rounded-[3rem] bg-rose-600 opacity-80"/><div className="absolute -bottom-24 -right-12 h-60 w-60 -rotate-12 rounded-[3rem] bg-blue-600 opacity-80"/><div className="relative p-6 sm:p-9"><div className="flex items-center justify-between gap-4"><p className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-black tracking-[.2em]">FIGHTER ENTRY</p><p className="text-4xl drop-shadow">🥊</p></div><h1 className="mt-6 text-3xl font-black leading-tight sm:text-5xl">{config.title || '大会エントリー'}</h1><p className="mt-3 font-bold text-slate-300">{config.organizer ? '主催：' + config.organizer : '挑戦する選手を募集しています'}</p><div className="mt-6 grid grid-cols-1 gap-2 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur sm:grid-cols-3"><p className="rounded-xl bg-white/10 p-3"><span className="text-xs font-black text-rose-300">開催日</span><br/><b>{config.date || '確認中'}</b></p><p className="rounded-xl bg-white/10 p-3"><span className="text-xs font-black text-blue-300">会場</span><br/>{isVenueUrl(config.venueUrl)?<a href={config.venueUrl} target="_blank" rel="noreferrer" className="font-black underline decoration-blue-300 underline-offset-4">{config.venue || '地図を開く'} ↗</a>:<b>{config.venue || '確認中'}</b>}</p><p className="rounded-xl bg-white/10 p-3"><span className="text-xs font-black text-amber-300">申込締切</span><br/><b>{config.deadline || '確認中'}</b></p></div></div><div className="grid h-2 grid-cols-2"><span className="bg-rose-600"/><span className="bg-blue-600"/></div></header>
    <div className="mt-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 font-bold text-amber-950 shadow-sm"><span className="text-2xl">💡</span><p>「必須」をすべて入力し、最後に送信してください。顔がはっきり見える写真を用意してください。</p></div>
    {!endpointReady ? <p className="mt-4 rounded-xl bg-rose-700 p-4 font-black text-white">受付の準備が終わっていません。まだ入力・送信しないでください。</p> : null}
    {message ? <p role="status" className="sticky top-2 z-20 mt-4 rounded-xl bg-indigo-700 p-4 font-bold text-white shadow">{message}</p> : null}
    <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 sm:p-7"><div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rose-600 to-red-800 text-xl font-black text-white shadow-lg">1</span><div><p className="text-xs font-black tracking-[.2em] text-rose-600">FIGHTER</p><h2 className="text-2xl font-black">選手の情報</h2></div></div><div className="mt-6 grid gap-5 sm:grid-cols-2">
      {([['gym','所属ジム 必須'],['name','選手名・リングネーム 必須'],['height','身長（cm）必須'],['weight','希望体重（kg）必須'],['record','戦績・競技歴 必須']] as const).map(([key,label])=><label key={key} className="font-bold">{label}<input className={field+' bg-amber-50'} value={fighter[key]} inputMode={key==='height'||key==='weight'?'decimal':undefined} onChange={(e)=>change(key,e.target.value)} /></label>)}
      {([['grade','学年',config.grade],['age','年齢',config.age],['comment','試合への意気込み',config.comment]] as const).filter(([, , mode])=>mode!=='off').map(([key,label,mode])=><label key={key} className="font-bold">{label} {mode==='required'?'必須':'任意'}<input className={field+(mode==='required'?' bg-amber-50':'')} value={fighter[key]} onChange={(e)=>change(key,e.target.value)} /></label>)}
    </div>{config.music?<label className="mt-5 block font-bold">入場曲URL 必須<input className={field+' bg-amber-50'} value={fighter.musicUrl} placeholder="Apple Music または YouTube" onChange={(e)=>change('musicUrl',e.target.value)}/></label>:null}<label className="group mt-6 block cursor-pointer rounded-3xl border-2 border-dashed border-rose-300 bg-gradient-to-br from-rose-50 to-blue-50 p-6 text-center transition hover:border-rose-500 hover:shadow-lg"><span className="block text-4xl">📸</span><span className="mt-2 block text-lg font-black">顔写真 必須</span><span className="mt-1 block text-sm font-bold text-slate-600">ここを押して、顔がよく見える写真を選ぶ</span><input type="file" accept="image/jpeg,image/png,image/webp" className="mx-auto mt-4 block max-w-full text-sm" onChange={async(e)=>{const file=e.target.files?.[0];if(!file)return;try{setPhoto(await photoToDataUrl(file));setMessage('写真を選びました。');}catch(error){setMessage(error instanceof Error?error.message:'写真を読めませんでした。');}}}/></label>{photo?<div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-center"><p className="mb-3 font-black text-emerald-800">✓ この写真を送ります</p><img src={photo} alt="選んだ写真" className="mx-auto h-56 w-44 rounded-2xl bg-white object-contain shadow-lg"/></div>:null}</section>
    <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 sm:p-7"><div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-800 text-xl font-black text-white shadow-lg">2</span><div><p className="text-xs font-black tracking-[.2em] text-blue-600">CONTACT</p><h2 className="text-2xl font-black">連絡先</h2></div></div><p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-950">🔒 主催者からの連絡だけに使います。Cloudflareには保存されません。</p><div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="font-bold">連絡先のお名前 必須<input className={field+' bg-amber-50'} value={contactName} onChange={(e)=>setContactName(e.target.value)}/></label><label className="font-bold">電話番号 必須<input className={field+' bg-amber-50'} inputMode="tel" value={contactPhone} onChange={(e)=>setContactPhone(e.target.value)}/></label><label className="font-bold sm:col-span-2">メールアドレス 必須<input className={field+' bg-amber-50'} type="email" value={contactEmail} onChange={(e)=>setContactEmail(e.target.value)}/></label></div><label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 font-bold transition hover:border-blue-300"><input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-blue-700"/>大会規約と、主催者が大会運営のために個人情報を使用することに同意します。</label></section>
    <form ref={formRef} action={config.endpoint || undefined} method="post" target="entry-result-frame" className="hidden">
      {Object.entries({ token:tokenRef.current, eventId:config.eventId, requestId, gym:fighter.gym, name:fighter.name, grade:fighter.grade, age:fighter.age, height:fighter.height, weight:fighter.weight, record:fighter.record, comment:fighter.comment, musicUrl:fighter.musicUrl, contactName, contactPhone, contactEmail, consent:consent?'yes':'no', photoDataUrl:photo }).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>) }
    </form><iframe name="entry-result-frame" title="送信結果" className="hidden"/>
    <button disabled={sending||!endpointReady} onClick={submit} className="my-6 w-full rounded-2xl bg-gradient-to-r from-rose-600 via-slate-950 to-blue-600 p-5 text-xl font-black text-white shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl disabled:translate-y-0 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none">{sending?'送信しています…':'入力内容を確認して申し込む →'}</button><p className="mb-8 text-center text-sm font-bold text-slate-600">問い合わせ：{config.contact || '大会主催者へご確認ください'}</p>
  </div></main>;
}
