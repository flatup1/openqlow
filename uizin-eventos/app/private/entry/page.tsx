'use client';

import { useEffect, useRef, useState } from 'react';
// ZIPを作る部品は、画面を開いたときに読みこんでおく（押したときに読みこむと、新しい版の公開・弱いWi-Fiで読めず、何も言わずに止まるため）
import { strToU8, zipSync } from 'fflate';
import { DEFAULT_ENTRY_CONFIG, entryClassError, entryConfigFromSearch, entryCsv, entryErrors, entryWeightError, type EntryFighter, type EntryFormConfig } from '../../../core/entryPackage.ts';
import { classMismatch, suggestClass, suggestText } from '../../../core/classRules.ts';
import { DIVISION_LABEL, findDivision, isDivisionError, NO_CLASS_NOTE_APPLY, weightClassLabel, weightTag } from '../../../core/weightClass.ts';
import { bytesToArrayBuffer, photoToDataUrl } from '../../lib/privateStore.ts';
import { NextSlot } from '../marks.tsx';
import { checkNumber, fieldOfEntryError } from '../normalize.ts';

type ReadyFighter = EntryFighter & { photoDataUrl: string };
const input = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-[17px]';
/**
 * 知らせ。ok＝緑の「✓」/ error＝赤の「✕」（何が足りないかを全部。head があれば、その見出し）/ removed＝赤の「✕ 消しました」と「元にもどす」（10秒だけ）。
 * 色だけにせず、いつも記号と言葉を付ける
 */
type Message = { kind: 'ok' | 'error'; lines: string[]; head?: string } | { kind: 'removed'; fighter: ReadyFighter; index: number };
/** 消した選手を「元にもどす」で戻せる時間（ミリ秒） */
const UNDO_MS = 10_000;
/** ZIPを作れなかったときの赤い文（入れた選手は、画面に残っている） */
const ZIP_FAILED = 'ZIPファイルを作れませんでした。入れた選手は、消えていません。この画面は閉じずに、ほかのアプリやタブを閉じてから、もう一度「📥 提出ファイルを保存する」を押します。';
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
  /** いちばん最後に「提出ファイルを保存する」で保存したときの名簿。この名簿のままなら、閉じても失うものは無い */
  const [savedList, setSavedList] = useState<ReadyFighter[] | null>(null);
  /** 「この選手を取り消す」を押した時刻（2回押しで、となりの選手まで消さないため） */
  const lastRemoveAt = useRef(0);
  const ok = (text: string) => setMessage({ kind: 'ok', lines: [text] });
  useEffect(() => { setConfig(entryConfigFromSearch(location.search)); setReady(true); }, []);

  /** 入れている途中の欄があるか（前の選手から引きついだジム名は、数えない。選んだ写真は、数える） */
  const formHasInput = !!photo || Object.entries(current).some(([key, value]) => key !== 'id' && key !== 'gym' && typeof value === 'string' && value.trim() !== '');
  /** 閉じると消えるものがあるか：まだ保存していない選手、または入れている途中の欄 */
  const unsaved = (fighters.length > 0 && fighters !== savedList) || formHasInput;
  useEffect(() => {
    // 入れた選手と写真は、この画面の中にしか無い。閉じる・読み直す・「戻る」の前に、確認を出す（「提出ファイルを保存する」のあとは、外す）
    if (!unsaved) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [unsaved]);
  // 消した選手の「元にもどす」は、10秒で消える（そのあとは、もどせない）
  useEffect(() => {
    if (message?.kind !== 'removed') return;
    const timer = window.setTimeout(() => setMessage((now) => (now === message ? null : now)), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  const change = (key: keyof EntryFighter, value: string) => setCurrent((old) => ({ ...old, [key]: value }));
  /** 区分を変えたら、階級は空に戻す（区分ごとに、選べる階級がちがうため） */
  const changeDivision = (value: string) => setCurrent((old) => ({ ...old, division: value, weightClass: '' }));
  const add = () => {
    // 数字は、全角（１７０）や単位つき（65kg）でも読めるように、そろえてから調べる（/apply/ と同じ）
    const fixedNumbers = Object.fromEntries((['height', 'weight', 'age'] as const).map((key) => { const done = checkNumber(key, current[key]); return [key, done.problem ? current[key] : done.value]; }));
    const next: EntryFighter = { ...current, ...fixedNumbers };
    const errors = [...entryErrors(next, Boolean(photo), config), entryWeightError(next, config), entryClassError(next, config)].filter(Boolean);
    if (errors.length) {
      setMessage({ kind: 'error', lines: errors });
      // いちばん上の足りない所へ移る（画面の外にあると、赤い知らせの意味がわからないため）
      const first = errors[0];
      const target = isDivisionError(first) ? 'entry-division' : first.startsWith('階級') ? 'entry-weightClass' : first.includes('クラス') ? 'entry-class' : first.includes('写真') ? 'entry-photo' : FIELD_ID[fieldOfEntryError(first)] ?? 'entry-gym';
      window.setTimeout(() => document.getElementById(target)?.focus(), 0);
      return;
    }
    setFighters((old) => [...old, { ...next, photoDataUrl: photo }]);
    setCurrent(blank(current.gym));
    setPhoto('');
    ok('選手を追加しました。続けて次の選手を入力できます。');
  };
  /** 「この選手を取り消す」：すぐ消して、10秒だけ「元にもどす」を出す */
  const remove = (index: number) => {
    // 2回押し（0.7秒の間）で、となりの選手まで消えないようにする（準備の画面の「試合を消す」と同じ）
    const now = Date.now();
    if (now - lastRemoveAt.current < 700) return;
    lastRemoveAt.current = now;
    const fighter = fighters[index];
    if (!fighter) return;
    setFighters((old) => old.filter((_, i) => i !== index));
    setMessage({ kind: 'removed', fighter, index });
    // 押したボタンは消えるので、目印（フォーカス）を「元にもどす」へ移す
    window.setTimeout(() => document.getElementById('entry-undo')?.focus(), 0);
  };
  /** 消した選手を、写真ごと、元の場所にもどす */
  const undo = () => {
    if (message?.kind !== 'removed') return;
    const { fighter, index } = message;
    setFighters((old) => (old.some((item) => item.id === fighter.id) ? old : [...old.slice(0, index), fighter, ...old.slice(index)]));
    ok(fighter.name + 'さんを、元にもどしました。');
    window.setTimeout(() => document.getElementById('entry-fighter-' + fighter.id)?.focus(), 0);
  };
  const download = () => {
    if (!fighters.length) return setMessage({ kind: 'error', lines: ['先に選手を1人以上追加してください。'] });
    try {
      const files: Record<string, Uint8Array> = { 'players.csv': strToU8(entryCsv(fighters, !!config.classes, !!config.weights)) };
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
      setSavedList(fighters);
      ok('提出ファイルの保存を始めました。ダウンロードの中にZIPファイルがあるか見て、大会主催者へ渡してください。');
    } catch {
      // ZIPを作れなかった（写真が多くて、スマホの力が足りない など）。入れた選手は、そのまま残す。閉じる前の確認も、そのまま
      setMessage({ kind: 'error', head: '保存できませんでした：', lines: [ZIP_FAILED] });
    }
  };
  /** 「👉 次はここ」は1つだけ。入れている途中・まだだれもいない →「この選手を追加」。保存していない選手がいる →「提出ファイルを保存する」。保存したあとは、出さない */
  const nextSpot: 'add' | 'save' | null = formHasInput || !fighters.length ? 'add' : fighters !== savedList ? 'save' : null;

  if (!ready) return <main data-tos-loading="1" className="p-8 text-[17px]">入力画面を準備しています…</main>;
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-[17px] text-slate-950"><div className="mx-auto max-w-3xl">
    <header className="rounded-3xl bg-white p-6 shadow-sm"><p className="font-black text-emerald-700">🔐 選手エントリーシート（他のジム用の入力画面）</p><h1 className="mt-2 text-3xl font-black">上から順に入力するだけです</h1><p className="mt-3 text-[17px] leading-relaxed text-slate-700">入力した名前・体重・写真は、インターネットへ送信されません。この画面を閉じるまで、この端末の中だけで使います。</p><p id="entry-close-note" className="mt-2 text-[17px] font-bold leading-relaxed text-slate-900">閉じると、入れた選手は消えます。先に「提出ファイルを保存する」を押します。</p><div className="mt-4 rounded-xl bg-amber-50 p-4 font-bold text-amber-950">電話番号・メール・住所・生年月日・保護者名は入力しません。</div></header>
    {message ? (message.kind === 'removed'
      ? <div role="status" className="tos-error sticky top-2 z-20 mt-4 text-[1.0625rem] shadow"><p className="m-0"><span aria-hidden="true">✕ </span>消しました：{message.fighter.name}さん。まちがえたときは、10秒のあいだに「元にもどす」を押します。</p><button id="entry-undo" type="button" onClick={undo} className="tos-safe-btn mt-2 w-full text-[17px] sm:w-auto">元にもどす</button></div>
      : message.kind === 'error'
      ? <div role="status" className="tos-error sticky top-2 z-20 mt-4 text-[1.0625rem] shadow"><p className="m-0"><span aria-hidden="true">✕ </span>{message.head ?? (message.lines.length > 1 ? 'まちがい：' + message.lines.length + 'か所を直してください。' : 'まちがい：')}</p><ul className="m-0 mt-1 list-none space-y-1 p-0">{message.lines.map((line) => <li key={line}>{line}</li>)}</ul></div>
      : <p role="status" className="tos-ok sticky top-2 z-20 mt-4 text-[1.0625rem] shadow"><span aria-hidden="true">✓ </span>{message.lines[0]}</p>) : null}
    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">1. 選手を入力</h2><p className="mt-2 text-slate-600">「必須」はすべて入力してください。戦績がない選手は「初試合」と入力します。</p><div className="mt-4 grid gap-4 sm:grid-cols-2">
      {([['gym','ジム名 必須'],['name','選手名 必須'],['height','身長（cm）必須'],['weight','体重（kg）必須'],['record','戦績・競技歴 必須']] as const).map(([key,label]) => <label key={key} className="font-bold">{label}<input id={FIELD_ID[key]} className={input + ' bg-amber-50'} value={current[key]} inputMode={['height','weight'].includes(key) ? 'decimal' : undefined} onChange={(event)=>change(key,event.target.value)} /></label>)}
      {([['grade','学年',config.grade],['age','年齢',config.age],['comment','試合への意気込み',config.comment]] as const).filter(([, , mode])=>mode!=='off').map(([key,label,mode]) => <label key={key} className="font-bold">{label}{mode==='required'?' 必須':' 任意'}<input id={FIELD_ID[key]} className={input + ' bg-amber-50'} value={current[key]} inputMode={key==='age'?'numeric':undefined} onChange={(event)=>change(key,event.target.value)} /></label>)}
    </div>{config.weights ? (() => { const division = findDivision(current.division ?? '', config.weights);
      return <fieldset id="entry-weights" className="mt-4 rounded-xl border-2 border-slate-400 bg-white p-4 text-lg"><legend className="px-1 text-lg font-bold">{DIVISION_LABEL}・階級 必須</legend>
        <p className="text-lg text-slate-700">階級とは、体重で分けたグループのことです。先に{DIVISION_LABEL}を選ぶと、階級が出ます。迷ったら、主催者に聞きます。</p>
        <label htmlFor="entry-division" className="mt-3 block text-lg font-bold">{DIVISION_LABEL}</label>
        <select id="entry-division" className="mt-1 min-h-12 w-full rounded-xl border-2 border-slate-400 bg-white p-3 text-lg" value={current.division ?? ''} onChange={(event) => changeDivision(event.target.value)}>
          <option value="">選んでください</option>
          {config.weights.divisions.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
        {division && division.classes.length ? <>
          <label htmlFor="entry-weightClass" className="mt-3 block text-lg font-bold">階級</label>
          <select id="entry-weightClass" className="mt-1 min-h-12 w-full rounded-xl border-2 border-slate-400 bg-white p-3 text-lg" value={current.weightClass ?? ''} onChange={(event) => change('weightClass', event.target.value)}>
            <option value="">選んでください</option>
            {division.classes.map((item) => <option key={item} value={item}>{weightClassLabel(item)}</option>)}
          </select>
        </> : null}
        {division && !division.classes.length ? <p id="entry-weightClass-none" className="mt-3 rounded-lg bg-slate-100 p-2 text-lg font-medium text-slate-800">{NO_CLASS_NOTE_APPLY}</p> : null}
      </fieldset>; })() : null}{config.classes ? <fieldset className="mt-4 rounded-xl border-2 border-slate-400 bg-white p-4 text-lg"><legend className="px-1 text-lg font-bold">クラス 必須（どちらか1つ）</legend>
      <p className="text-lg text-slate-700">自分の戦績に合うほうを選びます。迷ったら、主催者に聞きます。</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{([config.classes.upper, config.classes.lower]).map((side, i) => <label key={side.name} className={'block cursor-pointer rounded-xl border-2 p-3 ' + (current.fighterClass === side.name ? 'border-indigo-700 bg-indigo-50' : 'border-slate-400 bg-white')}>
        <span className="flex items-center gap-2 text-lg font-bold"><input id={'entry-class-' + i} type="radio" name="fighterClass" value={side.name} checked={current.fighterClass === side.name} onChange={() => change('fighterClass', side.name)} className="h-5 w-5 accent-indigo-700" />{side.name}</span>
        <span className="mt-1 block text-lg font-medium">条件：{side.condition}</span>
        <span className="block text-lg font-medium">ルール：{side.rule}</span>
      </label>)}</div>
      {(() => { const hint = suggestClass(current.record, config.classes); const diff = classMismatch(current.record, current.fighterClass ?? '', config.classes);
        return <>{hint ? <p className="mt-3 rounded-lg border-2 border-amber-600 bg-amber-50 p-2 text-lg font-bold text-amber-950">{suggestText(hint.name)}（目安です。自分で選んでかまいません）</p> : null}
          {diff ? <p role="status" className="mt-2 rounded-lg border-2 border-rose-700 bg-rose-50 p-2 text-lg font-bold text-rose-900"><span aria-hidden="true">⚠ </span>{diff}このままでも追加できます。</p> : null}</>; })()}
    </fieldset> : null}{config.music?<label className="mt-4 block rounded-xl bg-amber-50 p-4 font-bold">入場曲のリンク 必須<input id="entry-musicUrl" className={input} value={current.musicUrl} placeholder="Apple Music または YouTube のURL" onChange={(event)=>change('musicUrl',event.target.value)}/></label>:<p className="mt-4 rounded-xl bg-slate-100 p-4 font-bold text-slate-700">この大会では入場曲を使いません。</p>}<label className="mt-4 block rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 p-5 text-center font-black text-indigo-900">選手の顔写真 必須<input id="entry-photo" type="file" accept="image/*" className="mt-3 block min-h-12 w-full text-[17px] file:mr-3 file:min-h-12 file:rounded-xl file:border-2 file:border-indigo-700 file:bg-white file:px-4 file:text-[17px] file:font-bold file:text-indigo-900" onChange={async(event)=>{const file=event.target.files?.[0];if(!file)return;try{setPhoto(await photoToDataUrl(file));ok('写真を選びました。');}catch(error){setMessage({ kind: 'error', lines: [error instanceof Error?error.message:'写真を読めませんでした。'] });}}} /></label>{photo ? <img src={photo} alt="選んだ顔写真" className="mx-auto mt-3 h-44 w-36 rounded-xl bg-slate-100 object-contain" /> : null}<div className="mt-5"><NextSlot active={nextSpot === 'add'} label="上の欄を入れたら、「この選手を追加」を押す"><button type="button" onClick={add} className="w-full rounded-xl bg-indigo-700 p-4 text-xl font-black text-white">この選手を追加</button></NextSlot></div></section>
    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">2. 入力した選手を確認</h2><p className="mt-2 rounded-xl bg-emerald-50 p-4 font-black text-emerald-900">現在 {fighters.length}人</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{fighters.map((fighter,index)=><article key={fighter.id} id={'entry-fighter-' + fighter.id} tabIndex={-1} className="flex gap-3 rounded-xl border p-3"><img src={fighter.photoDataUrl} alt="" className="h-24 w-20 rounded-lg bg-slate-100 object-contain"/><div className="min-w-0 flex-1"><b id={'entry-fighter-name-' + fighter.id}>{fighter.name}</b><p className="text-[17px] text-slate-700">{fighter.gym} / {fighter.weight}kg</p>{weightTag(fighter) ? <p className="break-words text-[17px] text-slate-700">{weightTag(fighter)}</p> : null}<button type="button" aria-describedby={'entry-fighter-name-' + fighter.id} onClick={() => remove(index)} className="tos-danger-btn mt-3 text-[17px]">この選手を取り消す</button></div></article>)}</div></section>
    <section className="my-5 rounded-2xl bg-slate-900 p-6 text-white"><h2 className="text-2xl font-black">3. 主催者へ渡すファイルを作る</h2><p className="mt-2 text-[17px] text-slate-300">名簿のファイルと写真を、1つのZIPファイル（ZIP＝まとめたファイル）にまとめます。データはインターネットへ送信されません。</p><div className="mt-4"><NextSlot active={nextSpot === 'save'} label="全員入れたら、「提出ファイルを保存する」を押す"><button type="button" onClick={() => download()} className="w-full rounded-xl bg-emerald-600 p-4 text-xl font-black text-white">📥 提出ファイルを保存する</button></NextSlot></div><p className="mt-3 text-center text-[17px] text-slate-300">保存されたZIPファイルを、いつもの連絡方法で大会主催者へ渡してください。</p></section>
  </div></main>;
}
