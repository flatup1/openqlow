'use client';

import { useEffect, useRef, useState } from 'react';
import { entryErrors, type EntryFighter } from '../../core/entryPackage.ts';
import { EMPTY_PUBLIC_ENTRY_CONFIG, isVenueUrl, publicEntryConfig, publicEntryReady, type PublicEntryConfig } from '../../core/publicEntry.ts';
import { photoToDataUrl } from '../lib/privateStore.ts';

const field = 'mt-2 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3.5 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-100';
const blank = (): EntryFighter => ({ id: '', gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '' });

export default function PublicApply() {
  const [config, setConfig] = useState<PublicEntryConfig>(EMPTY_PUBLIC_ENTRY_CONFIG);
  const [fighter, setFighter] = useState<EntryFighter>(blank);
  const [photo, setPhoto] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoVersionRef = useRef(0);
  const photoLoadingRef = useRef(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const dispatchedRef = useRef(0);
  const sendingRef = useRef(false);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setConfig(publicEntryConfig(location.hash));
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => { if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); };
  }, []);
  useEffect(() => {
    const returned = (event: PageTransitionEvent) => {
      if (!event.persisted || !sendingRef.current) return;
      sendingRef.current = false;
      setSending(false); setConfirmationPending(true);
      setMessage('受付番号の画面が出た方は申し込み済みです。出なかった方は「同じ申込を確認・再開」を押してください。');
    };
    window.addEventListener('pageshow', returned);
    return () => {
      window.removeEventListener('pageshow', returned);
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    };
  }, []);
  useEffect(() => {
    if (sending && requestId && attempt > dispatchedRef.current) {
      dispatchedRef.current = attempt;
      formRef.current?.requestSubmit();
    }
  }, [sending, requestId, attempt]);
  useEffect(() => { setReviewing(false); }, [fighter, photo, contactName, contactPhone, contactEmail, consent, config]);

  const change = (key: keyof EntryFighter, value: string) => setFighter((old) => ({ ...old, [key]: value }));
  const submit = (confirmed = false) => {
    if (sendingRef.current) return;
    if (photoLoadingRef.current) { setReviewing(false); setMessage('写真を準備しています。写真が表示されてから押してください。'); return; }
    if (confirmed && !reviewing) return;
    const errors = entryErrors(fighter, Boolean(photo), config);
    if (!contactName.trim()) errors.push('連絡先のお名前を入力してください。');
    if (contactName.trim().length>100||contactEmail.trim().length>200) errors.push('連絡先のお名前は100文字、メールアドレスは200文字以内にしてください。');
    if (!/^0?[0-9][0-9 -]{8,14}$/.test(contactPhone)) errors.push('電話番号を確認してください。');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) errors.push('メールアドレスを確認してください。');
    if (!consent) errors.push('規約と個人情報の取扱いへの同意が必要です。');
    if (!publicEntryReady(config)) errors.push('この大会の受付先の更新が必要です。主催者へ新しいURLをご確認ください。');
    if (errors.length) { setReviewing(false); return setMessage(errors[0]); }
    if (!confirmed) { setReviewing(true); setMessage('まだ送っていません。下の確認欄を見て、正しければ「この内容で送信する」を押してください。'); return; }
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    setRequestId((old) => old || crypto.randomUUID());
    setAttempt((old) => old + 1);
    sendingRef.current = true;
    setMessage('Googleの受付結果画面へ移動します。受付番号が出るまでお待ちください。');
    setConfirmationPending(false);
    setReviewing(false);
    setSending(true);
    resultTimerRef.current = setTimeout(() => {
      sendingRef.current = false; setSending(false);
      setConfirmationPending(true);
      setMessage('受付結果画面へ移動できませんでした。下のボタンは同じ申込番号を使い、二重登録を防いで保存を確認・再開します。');
    }, 30000);
  };

  const choosePhoto = async (file?: File) => {
    if (!file) return;
    const version = ++photoVersionRef.current;
    photoLoadingRef.current = true;
    setPhotoLoading(true); setPhoto(''); setReviewing(false);
    setMessage('写真を準備しています。少しお待ちください。');
    try {
      const nextPhoto = await photoToDataUrl(file);
      if (version !== photoVersionRef.current) return;
      setPhoto(nextPhoto); setMessage('写真を選びました。下の写真を確認してください。');
    } catch {
      if (version !== photoVersionRef.current) return;
      setMessage('この写真を読み取れませんでした。20MB以下のJPG・PNG・WebPの写真を選び直してください。古い写真は送りません。');
    } finally {
      if (version === photoVersionRef.current) { photoLoadingRef.current = false; setPhotoLoading(false); }
    }
  };

  const endpointReady = publicEntryReady(config);
  return <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#fff1f2_0%,#f8fafc_34%,#eff6ff_100%)] px-4 py-6 text-slate-950 sm:py-10"><div className="mx-auto max-w-3xl">
    <header className="relative overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-2xl shadow-slate-300/70"><div className="absolute -left-16 -top-20 h-56 w-56 rotate-12 rounded-[3rem] bg-rose-600 opacity-80"/><div className="absolute -bottom-24 -right-12 h-60 w-60 -rotate-12 rounded-[3rem] bg-blue-600 opacity-80"/><div className="relative p-6 sm:p-9"><div className="flex items-center justify-between gap-4"><p className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-black tracking-[.2em]">FIGHTER ENTRY</p><p className="text-4xl drop-shadow">🥊</p></div><h1 className="mt-6 text-3xl font-black leading-tight sm:text-5xl">{config.title || '大会エントリー'}</h1><p className="mt-3 font-bold text-slate-300">{config.organizer ? '主催：' + config.organizer : '挑戦する選手を募集しています'}</p><div className="mt-6 grid grid-cols-1 gap-2 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur sm:grid-cols-3"><p className="rounded-xl bg-white/10 p-3"><span className="text-xs font-black text-rose-300">開催日</span><br/><b>{config.date || '確認中'}</b></p><p className="rounded-xl bg-white/10 p-3"><span className="text-xs font-black text-blue-300">会場</span><br/>{isVenueUrl(config.venueUrl)?<a href={config.venueUrl} target="_blank" rel="noreferrer" className="font-black underline decoration-blue-300 underline-offset-4">{config.venue || '地図を開く'} ↗</a>:<b>{config.venue || '確認中'}</b>}</p><p className="rounded-xl bg-white/10 p-3"><span className="text-xs font-black text-amber-300">申込締切</span><br/><b>{config.deadline || '確認中'}</b></p></div></div><div className="grid h-2 grid-cols-2"><span className="bg-rose-600"/><span className="bg-blue-600"/></div></header>
    <div className="mt-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 font-bold text-amber-950 shadow-sm"><span className="text-2xl">💡</span><p>「必須」をすべて入力し、最後に送信してください。顔がはっきり見える写真を用意してください。</p></div>
    {!endpointReady ? <p className="mt-4 rounded-xl bg-rose-700 p-4 font-black text-white">受付の準備が終わっていません。まだ入力・送信しないでください。</p> : null}
    {config.mode==='test'?<p className="mt-4 rounded-xl bg-amber-100 p-4 font-black text-amber-950">テスト専用です。選手へこのURLは送らず、架空の情報で保存を試してください。</p>:null}
    {message ? <p role="status" className="sticky top-2 z-20 mt-4 rounded-xl bg-indigo-700 p-4 font-bold text-white shadow">{message}</p> : null}
    <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 sm:p-7"><div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rose-600 to-red-800 text-xl font-black text-white shadow-lg">1</span><div><p className="text-xs font-black tracking-[.2em] text-rose-600">FIGHTER</p><h2 className="text-2xl font-black">選手の情報</h2></div></div><div className="mt-6 grid gap-5 sm:grid-cols-2">
      {([['gym','所属ジム 必須'],['name','選手名・リングネーム 必須'],['height','身長（cm）必須'],['weight','希望体重（kg）必須'],['record','戦績・競技歴 必須']] as const).map(([key,label])=><label key={key} className="font-bold">{label}<input className={field+' bg-amber-50'} value={fighter[key]} inputMode={key==='height'||key==='weight'?'decimal':undefined} onChange={(e)=>change(key,e.target.value)} /></label>)}
      {([['grade','学年',config.grade],['age','年齢',config.age],['comment','試合への意気込み',config.comment]] as const).filter(([, , mode])=>mode!=='off').map(([key,label,mode])=><label key={key} className="font-bold">{label} {mode==='required'?'必須':'任意'}<input className={field+(mode==='required'?' bg-amber-50':'')} value={fighter[key]} onChange={(e)=>change(key,e.target.value)} /></label>)}
    </div>{config.music?<label className="mt-5 block font-bold">入場曲URL 必須<input className={field+' bg-amber-50'} value={fighter.musicUrl} placeholder="Apple Music または YouTube" onChange={(e)=>change('musicUrl',e.target.value)}/></label>:null}<label className="group mt-6 block cursor-pointer rounded-3xl border-2 border-dashed border-rose-300 bg-gradient-to-br from-rose-50 to-blue-50 p-6 text-center transition hover:border-rose-500 hover:shadow-lg"><span className="block text-4xl">📸</span><span className="mt-2 block text-lg font-black">顔写真 必須</span><span className="mt-1 block text-sm font-bold text-slate-600">ここを押して、顔がよく見える写真を選ぶ</span><input type="file" accept="image/jpeg,image/png,image/webp" className="mx-auto mt-4 block max-w-full text-sm" onChange={(e)=>void choosePhoto(e.target.files?.[0])}/></label>{photo?<div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-center"><p className="mb-3 font-black text-emerald-800">✓ この写真を送ります</p><img src={photo} alt="選んだ写真" className="mx-auto h-56 w-44 rounded-2xl bg-white object-contain shadow-lg"/></div>:null}</section>
    <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 sm:p-7"><div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-800 text-xl font-black text-white shadow-lg">2</span><div><p className="text-xs font-black tracking-[.2em] text-blue-600">CONTACT</p><h2 className="text-2xl font-black">連絡先</h2></div></div><p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-950">🔒 主催者からの連絡だけに使います。Cloudflareには保存されません。</p><div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="font-bold">連絡先のお名前 必須<input className={field+' bg-amber-50'} value={contactName} onChange={(e)=>setContactName(e.target.value)}/></label><label className="font-bold">電話番号 必須<input className={field+' bg-amber-50'} inputMode="tel" value={contactPhone} onChange={(e)=>setContactPhone(e.target.value)}/></label><label className="font-bold sm:col-span-2">メールアドレス 必須<input className={field+' bg-amber-50'} type="email" value={contactEmail} onChange={(e)=>setContactEmail(e.target.value)}/></label></div><label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 font-bold transition hover:border-blue-300"><input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-blue-700"/>大会規約と、主催者が大会運営のために個人情報を使用することに同意します。</label></section>
    <form ref={formRef} action={endpointReady?config.endpoint:undefined} method="post" target="_self" className="hidden">
      {Object.entries({ protocol:config.protocol==='3'?'3':'2',entryKey:config.entryKey||'',mode:config.mode||'',website:'',eventId:config.eventId,requestId,gym:fighter.gym,name:fighter.name,grade:config.grade==='off'?'':fighter.grade,age:config.age==='off'?'':fighter.age,height:fighter.height.trim().replace(/cm$/i,''),weight:fighter.weight.trim().replace(/kg$/i,''),record:fighter.record,comment:config.comment==='off'?'':fighter.comment,musicUrl:config.music?fighter.musicUrl:'',contactName,contactPhone,contactEmail,consent:consent?'yes':'no',photoDataUrl:photo }).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>) }
    </form>
    {reviewing?<section aria-label="送る前の確認" className="my-6 rounded-3xl border-2 border-blue-300 bg-white p-5 shadow-xl"><h2 className="text-2xl font-black">送る前の確認</h2><p className="mt-3 font-bold">{config.organizer||'大会主催者'}のGoogleへ、入力した選手情報・連絡先・写真を送ります。Cloudflareには保存しません。</p><dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 break-words"><dt>大会</dt><dd>{config.title}</dd><dt>選手</dt><dd>{fighter.name}</dd><dt>ジム</dt><dd>{fighter.gym}</dd><dt>身長・体重</dt><dd>{fighter.height} cm ・ {fighter.weight} kg</dd><dt>連絡先</dt><dd>{contactName}<br/>{contactPhone}<br/>{contactEmail}</dd></dl>{config.mode==='test'?<p className="mt-3 font-black text-amber-900">これはテストです。本番の名簿には入りません。</p>:null}<button disabled={sending||photoLoading||!endpointReady} onClick={()=>submit(true)} className="mt-5 w-full rounded-2xl bg-blue-700 p-5 text-xl font-black text-white disabled:bg-slate-300">この内容で送信する</button><button onClick={()=>{setReviewing(false);setMessage('まだ送っていません。直したい欄を変更してください。');}} className="mt-3 w-full rounded-xl border p-4 font-bold">戻って直す（送信しません）</button></section>:<button disabled={sending||photoLoading||!endpointReady} onClick={()=>submit()} className="my-6 w-full rounded-2xl bg-gradient-to-r from-rose-600 via-slate-950 to-blue-600 p-5 text-xl font-black text-white shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl disabled:translate-y-0 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none">{sending?'送信しています…':photoLoading?'写真を準備しています…':confirmationPending?'同じ申込を確認・再開する':'入力内容を確認する →'}</button>}<p className="mb-8 text-center text-sm font-bold text-slate-600">問い合わせ：{config.contact || '大会主催者へご確認ください'}</p>
  </div></main>;
}
