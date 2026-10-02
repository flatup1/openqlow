'use client';

import { useEffect, useRef, useState } from 'react';
import { entryErrors, type EntryFighter } from '../../core/entryPackage.ts';
import { EMPTY_PUBLIC_ENTRY_CONFIG, isAppsScriptUrl, publicEntryConfig, type PublicEntryConfig } from '../../core/publicEntry.ts';
import { photoToDataUrl } from '../lib/privateStore.ts';

const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-base';
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

  useEffect(() => { setConfig(publicEntryConfig(location.hash)); }, []);
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

  if (done) return <main className="grid min-h-screen place-items-center bg-emerald-50 p-5 text-slate-950"><section className="max-w-xl rounded-3xl bg-white p-8 text-center shadow"><p className="text-6xl">✅</p><h1 className="mt-4 text-3xl font-black">申し込みが完了しました</h1><p className="mt-4 text-lg">受付番号</p><p className="mt-2 rounded-xl bg-emerald-100 p-4 text-2xl font-black text-emerald-900">{done}</p><p className="mt-4 text-slate-700">この番号をスクリーンショットで保存してください。</p></section></main>;
  const endpointReady = isAppsScriptUrl(config.endpoint);
  return <main className="min-h-screen bg-sky-50 px-4 py-8 text-slate-950"><div className="mx-auto max-w-3xl">
    <header className="rounded-3xl bg-white p-6 shadow-sm"><p className="font-black text-indigo-700">🥊 大会エントリー</p><h1 className="mt-2 text-3xl font-black">{config.title || '大会エントリー'}</h1><p className="mt-3 text-slate-700">{config.organizer ? '主催：' + config.organizer : ''}</p><div className="mt-4 grid gap-2 rounded-2xl bg-indigo-50 p-4 sm:grid-cols-3"><p><b>開催日</b><br/>{config.date || '確認中'}</p><p><b>会場</b><br/>{config.venue || '確認中'}</p><p><b>締切</b><br/>{config.deadline || '確認中'}</p></div><p className="mt-4 rounded-xl bg-amber-50 p-4 font-bold text-amber-950">黄色い「必須」をすべて入力し、最後に送信してください。写真は顔がはっきり見えるものを選びます。</p></header>
    {!endpointReady ? <p className="mt-4 rounded-xl bg-rose-700 p-4 font-black text-white">受付の準備が終わっていません。まだ入力・送信しないでください。</p> : null}
    {message ? <p role="status" className="sticky top-2 z-20 mt-4 rounded-xl bg-indigo-700 p-4 font-bold text-white shadow">{message}</p> : null}
    <section className="mt-5 rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">1. 選手の情報</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
      {([['gym','所属ジム 必須'],['name','選手名・リングネーム 必須'],['height','身長（cm）必須'],['weight','希望体重（kg）必須'],['record','戦績・競技歴 必須']] as const).map(([key,label])=><label key={key} className="font-bold">{label}<input className={field+' bg-amber-50'} value={fighter[key]} inputMode={key==='height'||key==='weight'?'decimal':undefined} onChange={(e)=>change(key,e.target.value)} /></label>)}
      {([['grade','学年',config.grade],['age','年齢',config.age],['comment','試合への意気込み',config.comment]] as const).filter(([, , mode])=>mode!=='off').map(([key,label,mode])=><label key={key} className="font-bold">{label} {mode==='required'?'必須':'任意'}<input className={field+(mode==='required'?' bg-amber-50':'')} value={fighter[key]} onChange={(e)=>change(key,e.target.value)} /></label>)}
    </div>{config.music?<label className="mt-4 block font-bold">入場曲URL 必須<input className={field+' bg-amber-50'} value={fighter.musicUrl} placeholder="Apple Music または YouTube" onChange={(e)=>change('musicUrl',e.target.value)}/></label>:null}<label className="mt-4 block rounded-2xl border-2 border-dashed border-indigo-300 bg-amber-50 p-5 text-center font-black">顔写真 必須<input type="file" accept="image/jpeg,image/png,image/webp" className="mt-3 block w-full text-sm" onChange={async(e)=>{const file=e.target.files?.[0];if(!file)return;try{setPhoto(await photoToDataUrl(file));setMessage('写真を選びました。');}catch(error){setMessage(error instanceof Error?error.message:'写真を読めませんでした。');}}}/></label>{photo?<img src={photo} alt="選んだ写真" className="mx-auto mt-3 h-48 w-40 rounded-xl bg-slate-100 object-contain"/>:null}</section>
    <section className="mt-5 rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">2. 連絡先</h2><p className="mt-2 text-sm text-slate-600">主催者からの連絡だけに使います。Cloudflareには保存されません。</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="font-bold">連絡先のお名前 必須<input className={field+' bg-amber-50'} value={contactName} onChange={(e)=>setContactName(e.target.value)}/></label><label className="font-bold">電話番号 必須<input className={field+' bg-amber-50'} inputMode="tel" value={contactPhone} onChange={(e)=>setContactPhone(e.target.value)}/></label><label className="font-bold sm:col-span-2">メールアドレス 必須<input className={field+' bg-amber-50'} type="email" value={contactEmail} onChange={(e)=>setContactEmail(e.target.value)}/></label></div><label className="mt-5 flex items-start gap-3 rounded-xl bg-slate-100 p-4 font-bold"><input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0"/>大会規約と、主催者が大会運営のために個人情報を使用することに同意します。</label></section>
    <form ref={formRef} action={config.endpoint || undefined} method="post" target="entry-result-frame" className="hidden">
      {Object.entries({ token:tokenRef.current, eventId:config.eventId, requestId, gym:fighter.gym, name:fighter.name, grade:fighter.grade, age:fighter.age, height:fighter.height, weight:fighter.weight, record:fighter.record, comment:fighter.comment, musicUrl:fighter.musicUrl, contactName, contactPhone, contactEmail, consent:consent?'yes':'no', photoDataUrl:photo }).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>) }
    </form><iframe name="entry-result-frame" title="送信結果" className="hidden"/>
    <button disabled={sending||!endpointReady} onClick={submit} className="my-5 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white disabled:bg-slate-300">{sending?'送信しています…':'内容を確認して申し込む'}</button><p className="mb-8 text-center text-sm text-slate-600">問い合わせ：{config.contact || '大会主催者へご確認ください'}</p>
  </div></main>;
}
