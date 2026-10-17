'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_ENTRY_CONFIG, entryClassError, entryConfigFromSearch, entryCsv, entryErrors, type EntryFighter, type EntryFormConfig } from '../../../core/entryPackage.ts';
import { classMismatch, suggestClass, suggestText } from '../../../core/classRules.ts';
import { bytesToArrayBuffer, photoToDataUrl } from '../../lib/privateStore.ts';
import { checkNumber, fieldOfEntryError } from '../normalize.ts';

type ReadyFighter = EntryFighter & { photoDataUrl: string };
const input = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-base';
/** 知らせ。ok＝緑の「✓」/ error＝赤の「✕」（何が足りないかを全部）。色だけにせず、いつも記号と言葉を付ける */
type Message = { kind: 'ok' | 'error'; lines: string[] };
const FIELD_ID: Record<string, string> = { gym: 'entry-gym', name: 'entry-name', height: 'entry-height', weight: 'entry-weight', record: 'entry-record', grade: 'entry-grade', age: 'entry-age', comment: 'entry-comment', musicUrl: 'entry-musicUrl' };
/** 古い Safari（15.4より前）には crypto.randomUUID が無い。無くても画面が壊れないようにする（この ID は、画面の中の目印だけ） */
const newId = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'f-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const blank = (gym = ''): EntryFighter => ({ id: newId(), gym, name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '' });

function photoBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.split(',', 2)[1] ?? '');
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export default function PrivateEntry() {
  const [config, setConfig] = useState<EntryFormConfig>(DEFAULT_ENTRY_CONFIG);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<EntryFighter>(() => blank());
  const [photo, setPhoto] = useState('');
  const [fighters, setFighters] = useState<ReadyFighter[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const ok = (text: string) => setMessage({ kind: 'ok', lines: [text] });
  useEffect(() => { setConfig(entryConfigFromSearch(location.search)); setReady(true); }, []);

  const change = (key: keyof EntryFighter, value: string) => setCurrent((old) => ({ ...old, [key]: value }));
  const add = () => {
    // 数字は、全角（１７０）や単位つき（65kg）でも読めるように、そろえてから調べる（/apply/ と同じ）
    const fixedNumbers = Object.fromEntries((['height', 'weight', 'age'] as const).map((key) => { const done = checkNumber(key, current[key]); return [key, done.problem ? current[key] : done.value]; }));
    const next: EntryFighter = { ...current, ...fixedNumbers };
    const errors = [...entryErrors(next, Boolean(photo), config), entryClassError(next, config)].filter(Boolean);
    if (errors.length) {
      setMessage({ kind: 'error', lines: errors });
      // いちばん上の足りない所へ移る（画面の外にあると、赤い知らせの意味がわからないため）
      const first = errors[0];
      const target = first.includes('クラス') ? 'entry-class' : first.includes('写真') ? 'entry-photo' : FIELD_ID[fieldOfEntryError(first)] ?? 'entry-gym';
      window.setTimeout(() => document.getElementById(target)?.focus(), 0);
      return;
    }
    setFighters((old) => [...old, { ...next, photoDataUrl: photo }]);
    setCurrent(blank(current.gym));
    setPhoto('');
    ok('選手を追加しました。続けて次の選手を入力できます。');
  };
  const download = async () => {
    if (!fighters.length) return setMessage({ kind: 'error', lines: ['先に選手を1人以上追加してください。'] });
    const { strToU8, zipSync } = await import('fflate');
    const files: Record<string, Uint8Array> = { 'players.csv': strToU8(entryCsv(fighters, !!config.classes)) };
    for (const fighter of fighters) files[`photos/${fighter.id}.jpg`] = photoBytes(fighter.photoDataUrl);
    const zipped = zipSync(files, { level: 6 });
    const url = URL.createObjectURL(new Blob([bytesToArrayBuffer(zipped)], { type: 'application/zip' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = (fighters[0].gym.trim() || 'ジム') + '_選手提出パック.zip';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // ブラウザが保存を始めるまで待ってから、ファイルの元を手放す（すぐ手放すと、Safari・Firefox で空のファイルになることがある。準備の画面と同じ30秒）
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    ok('提出ファイルを保存しました。このZIPファイルを大会主催者へ渡してください。');
  };

  if (!ready) return <main data-tos-loading="1" className="p-8">入力画面を準備しています…</main>;
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950"><div className="mx-auto max-w-3xl">
    <header className="rounded-3xl bg-white p-6 shadow-sm"><p className="font-black text-emerald-700">🔐 選手エントリーシート（他のジム用の入力画面）</p><h1 className="mt-2 text-3xl font-black">上から順に入力するだけです</h1><p className="mt-3 text-[17px] leading-relaxed text-slate-700">入力した名前・体重・写真は、インターネットへ送信されません。この画面を閉じるまで、この端末の中だけで使います。</p><div className="mt-4 rounded-xl bg-amber-50 p-4 font-bold text-amber-950">電話番号・メール・住所・生年月日・保護者名は入力しません。</div></header>
    {message ? (message.kind === 'error'
      ? <div role="status" className="tos-error sticky top-2 z-20 mt-4 text-[1.0625rem] shadow"><p className="m-0"><span aria-hidden="true">✕ </span>{message.lines.length > 1 ? 'まちがい：' + message.lines.length + 'か所を直してください。' : 'まちがい：'}</p><ul className="m-0 mt-1 list-none space-y-1 p-0">{message.lines.map((line) => <li key={line}>{line}</li>)}</ul></div>
      : <p role="status" className="tos-ok sticky top-2 z-20 mt-4 text-[1.0625rem] shadow"><span aria-hidden="true">✓ </span>{message.lines[0]}</p>) : null}
    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">1. 選手を入力</h2><p className="mt-2 text-slate-600">「必須」はすべて入力してください。戦績がない選手は「初試合」と入力します。</p><div className="mt-4 grid gap-4 sm:grid-cols-2">
      {([['gym','ジム名 必須'],['name','選手名 必須'],['height','身長（cm）必須'],['weight','体重（kg）必須'],['record','戦績・競技歴 必須']] as const).map(([key,label]) => <label key={key} className="font-bold">{label}<input id={FIELD_ID[key]} className={input + ' bg-amber-50'} value={current[key]} inputMode={['height','weight'].includes(key) ? 'decimal' : undefined} onChange={(event)=>change(key,event.target.value)} /></label>)}
      {([['grade','学年',config.grade],['age','年齢',config.age],['comment','試合への意気込み',config.comment]] as const).filter(([, , mode])=>mode!=='off').map(([key,label,mode]) => <label key={key} className="font-bold">{label}{mode==='required'?' 必須':' 任意'}<input id={FIELD_ID[key]} className={input + ' bg-amber-50'} value={current[key]} inputMode={key==='age'?'numeric':undefined} onChange={(event)=>change(key,event.target.value)} /></label>)}
    </div>{config.classes ? <fieldset className="mt-4 rounded-xl border-2 border-slate-400 bg-white p-4 text-lg"><legend className="px-1 text-lg font-bold">クラス 必須（どちらか1つ）</legend>
      <p className="text-lg text-slate-700">自分の戦績に合うほうを選びます。迷ったら、主催者に聞きます。</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{([config.classes.upper, config.classes.lower]).map((side, i) => <label key={side.name} className={'block cursor-pointer rounded-xl border-2 p-3 ' + (current.fighterClass === side.name ? 'border-indigo-700 bg-indigo-50' : 'border-slate-400 bg-white')}>
        <span className="flex items-center gap-2 text-lg font-bold"><input id={'entry-class-' + i} type="radio" name="fighterClass" value={side.name} checked={current.fighterClass === side.name} onChange={() => change('fighterClass', side.name)} className="h-5 w-5 accent-indigo-700" />{side.name}</span>
        <span className="mt-1 block text-lg font-medium">条件：{side.condition}</span>
        <span className="block text-lg font-medium">ルール：{side.rule}</span>
      </label>)}</div>
      {(() => { const hint = suggestClass(current.record, config.classes); const diff = classMismatch(current.record, current.fighterClass ?? '', config.classes);
        return <>{hint ? <p className="mt-3 rounded-lg border-2 border-amber-600 bg-amber-50 p-2 text-lg font-bold text-amber-950">{suggestText(hint.name)}（目安です。自分で選んでかまいません）</p> : null}
          {diff ? <p role="status" className="mt-2 rounded-lg border-2 border-rose-700 bg-rose-50 p-2 text-lg font-bold text-rose-900"><span aria-hidden="true">⚠ </span>{diff}このままでも追加できます。</p> : null}</>; })()}
    </fieldset> : null}{config.music?<label className="mt-4 block rounded-xl bg-amber-50 p-4 font-bold">入場曲のリンク 必須<input id="entry-musicUrl" className={input} value={current.musicUrl} placeholder="Apple Music または YouTube のURL" onChange={(event)=>change('musicUrl',event.target.value)}/></label>:<p className="mt-4 rounded-xl bg-slate-100 p-4 font-bold text-slate-700">この大会では入場曲を使いません。</p>}<label className="mt-4 block rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 p-5 text-center font-black text-indigo-900">選手の顔写真 必須<input id="entry-photo" type="file" accept="image/*" className="mt-3 block min-h-12 w-full text-[17px] file:mr-3 file:min-h-12 file:rounded-xl file:border-2 file:border-indigo-700 file:bg-white file:px-4 file:text-[17px] file:font-bold file:text-indigo-900" onChange={async(event)=>{const file=event.target.files?.[0];if(!file)return;try{setPhoto(await photoToDataUrl(file));ok('写真を選びました。');}catch(error){setMessage({ kind: 'error', lines: [error instanceof Error?error.message:'写真を読めませんでした。'] });}}} /></label>{photo ? <img src={photo} alt="選んだ顔写真" className="mx-auto mt-3 h-44 w-36 rounded-xl bg-slate-100 object-contain" /> : null}<button onClick={add} className="mt-5 w-full rounded-xl bg-indigo-700 p-4 text-xl font-black text-white">この選手を追加</button></section>
    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">2. 入力した選手を確認</h2><p className="mt-2 rounded-xl bg-emerald-50 p-4 font-black text-emerald-900">現在 {fighters.length}人</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{fighters.map((fighter,index)=><article key={fighter.id} className="flex gap-3 rounded-xl border p-3"><img src={fighter.photoDataUrl} alt="" className="h-24 w-20 rounded-lg bg-slate-100 object-contain"/><div className="min-w-0 flex-1"><b>{fighter.name}</b><p className="text-sm text-slate-600">{fighter.gym} / {fighter.weight}kg</p><button onClick={()=>setFighters((old)=>old.filter((_,i)=>i!==index))} className="mt-3 text-sm font-bold text-rose-700">この選手を取り消す</button></div></article>)}</div></section>
    <section className="my-5 rounded-2xl bg-slate-900 p-6 text-white"><h2 className="text-2xl font-black">3. 主催者へ渡すファイルを作る</h2><p className="mt-2 text-[17px] text-slate-300">名簿のファイルと写真を、1つのZIPファイル（ZIP＝まとめたファイル）にまとめます。データはインターネットへ送信されません。</p><button onClick={()=>void download()} className="mt-4 w-full rounded-xl bg-emerald-600 p-4 text-xl font-black">📥 提出ファイルを保存する</button><p className="mt-3 text-center text-[17px] text-slate-300">保存されたZIPファイルを、いつもの連絡方法で大会主催者へ渡してください。</p></section>
  </div></main>;
}
