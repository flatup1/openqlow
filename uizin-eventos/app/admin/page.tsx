'use client';

import { useEffect, useMemo, useState } from 'react';
import { reloadProgram, saveEntryConfig, uploadProgram } from '../lib/client.ts';
import { getApiBase, getEventId, getOperatorKey, setApiBase, setEventId, setOperatorKey } from '../lib/config.ts';
import { extractSheetId, validateNewEvent } from '../../core/eventConfig.ts';
import { isValidEventId, normalizeEventId } from '../../core/eventId.ts';
import type { EntrySiteConfig } from '../../core/entry.ts';
import { EMPTY_ENTRY_CONFIG, validateEntryConfig } from '../../core/entry.ts';

function StepTitle({ no, title, done }: { no: number; title: string; done: boolean }) {
  return <div className="flex items-center gap-3"><span className={'grid h-10 w-10 place-items-center rounded-full text-lg font-black ' + (done ? 'bg-emerald-600 text-white' : 'bg-indigo-100 text-indigo-800')}>{done ? '✓' : no}</span><h2 className="text-2xl font-black">{title}</h2></div>;
}

export default function AdminPage() {
  const [eventId, updateEventId] = useState('');
  const [sheet, setSheet] = useState('');
  const [api, setApi] = useState('');
  const [key, setKey] = useState('');
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [eventCsv, setEventCsv] = useState('');
  const [matchesCsv, setMatchesCsv] = useState('');
  const [musicCsv, setMusicCsv] = useState('');
  const [entryConfig, setEntryConfig] = useState<EntrySiteConfig>(EMPTY_ENTRY_CONFIG);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const initialEvent = getEventId(); const initialApi = getApiBase();
    updateEventId(initialEvent); setApi(initialApi); setKey(getOperatorKey()); setOrigin(window.location.origin);
    fetch(new URL('/api/entry-config?event=' + encodeURIComponent(initialEvent), initialApi || window.location.origin))
      .then((r) => r.json()).then((value: unknown) => {
        const body = value as { config?: EntrySiteConfig }; if (body.config) setEntryConfig(body.config);
      }).catch(() => undefined);
  }, []);

  const normalizedId = normalizeEventId(eventId);
  const idReady = isValidEventId(eventId);
  const entryReady = validateEntryConfig(entryConfig).length === 0;
  const connectionReady = Boolean(api.trim() && key.trim());
  const sheetReady = Boolean(extractSheetId(sheet));
  const errors = useMemo(() => validateNewEvent(eventId, sheet), [eventId, sheet]);
  const entryUrl = origin + '/entry/?event=' + encodeURIComponent(normalizedId);
  const liveUrl = origin + '/live/?event=' + encodeURIComponent(normalizedId);
  const input = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-base focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100';

  const saveConnection = () => { setEventId(normalizedId); setApiBase(api); setOperatorKey(key); };
  const updateEntry = (name: keyof EntrySiteConfig, value: string | boolean) => setEntryConfig((v) => ({ ...v, [name]: value }));
  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(''), 1800);
  };
  const makeId = () => {
    const base = entryConfig.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    updateEventId((base || 'my-tournament') + '-' + new Date().getFullYear());
  };
  const saveEntry = async () => {
    const configErrors = validateEntryConfig(entryConfig);
    if (!idReady) return setMessage('まず「1」で大会IDを決めてください。');
    if (configErrors.length) return setMessage('「2」の入力を確認してください。' + configErrors[0]);
    if (!connectionReady) return setMessage('「3」を開き、AIから教えてもらった接続先と操作キーを入れてください。');
    saveConnection(); setBusy(true); setMessage('保存しています。画面を閉じずにお待ちください…');
    const result = await saveEntryConfig(entryConfig);
    setBusy(false); setMessage(result.ok ? '保存できました。下の「募集ページを見る」で内容を確認してください。' : '保存できませんでした: ' + (result.reason ?? '理由不明'));
  };
  const importSheet = async () => {
    if (errors.length) return setMessage('「1」と「4」を確認してください。' + errors[0]);
    if (!connectionReady) return setMessage('「3」を開き、接続先と操作キーを入れてください。');
    saveConnection(); setBusy(true); setMessage('対戦表を確認しています…');
    const result = await reloadProgram(extractSheetId(sheet));
    setBusy(false); setMessage(result.ok ? '対戦表を取り込みました。「大会当日の画面を見る」で確認してください。' : '取り込めませんでした: ' + (result.reason ?? '理由不明'));
  };
  const importCsv = async () => {
    if (!matchesCsv.trim()) return setMessage('予備の対戦表CSVが空です。分からない場合はAIへ相談してください。');
    if (!connectionReady) return setMessage('接続先と操作キーを入力してください。');
    saveConnection(); setBusy(true); setMessage('予備データを確認しています…');
    const result = await uploadProgram({ event: eventCsv, matches: matchesCsv, music: musicCsv });
    setBusy(false); setMessage(result.ok ? '予備データを取り込みました。大会画面を確認してください。' : '取り込めませんでした: ' + (result.reason ?? '理由不明'));
  };
  const downloadEntries = async (view: 'os' | 'full') => {
    if (!connectionReady) return setMessage('「3」を開き、接続先と操作キーを入れてください。');
    const url = new URL(api.replace(/\/+$/, '') + '/api/entries/export'); url.searchParams.set('event', normalizedId); url.searchParams.set('view', view);
    const res = await fetch(url, { headers: { 'x-operator-key': key } });
    const body = await res.json() as { entries?: Array<Record<string, unknown>>; reason?: string };
    if (!res.ok) return setMessage('保存できませんでした: ' + (body.reason ?? '理由不明'));
    const rows = body.entries ?? []; if (!rows.length) return setMessage('まだ申し込みはありません。');
    const columns = Object.keys(rows[0]); const cell = (value: unknown) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    const csv = '\uFEFF' + [columns.map(cell).join(','), ...rows.map((row) => columns.map((name) => cell(row[name])).join(','))].join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = normalizedId + '-entries-' + view + '.csv'; link.click(); URL.revokeObjectURL(link.href);
    setMessage(view === 'os' ? '大会運営用の名簿を保存しました。電話番号とメールは入っていません。' : '申し込み原本を保存しました。個人情報なので他の人へ送らないでください。');
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900"><div className="mx-auto max-w-3xl">
    <p className="text-sm font-bold text-indigo-700">TOURNAMENT OS</p>
    <h1 className="mt-1 text-3xl font-black">大会をはじめから準備する</h1>
    <p className="mt-3 text-lg leading-relaxed text-slate-700">むずかしい知識はいりません。<b>番号どおりに、上から下へ</b>進めてください。分からない場所は想像で埋めず、AIまたは大会責任者へ確認します。</p>
    <aside className="mt-6 rounded-2xl bg-indigo-50 p-5"><p className="font-black text-indigo-950">まず覚えることは3つだけ</p><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed"><li>大会ごとに「大会ID」という名前を1つ作ります。</li><li>参加者に渡すのは「募集ページ」のリンクです。</li><li>大会当日にスタッフが開くのは「大会当日の画面」のリンクです。</li></ol></aside>
    <nav className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="準備の進み具合">{[[1, '大会ID', idReady], [2, '募集内容', entryReady], [3, '接続', connectionReady], [4, '対戦表', sheetReady]].map(([no, label, done]) => <a key={String(no)} href={'#step-' + no} className={'rounded-xl p-3 text-center text-sm font-bold ' + (done ? 'bg-emerald-100 text-emerald-900' : 'bg-white text-slate-600')}>{done ? '✓ ' : no + '. '}{String(label)}</a>)}</nav>
    {message ? <p role="status" className="sticky top-2 z-10 mt-5 rounded-xl border border-amber-300 bg-amber-100 p-4 font-bold text-amber-950 shadow">{message}</p> : null}

    <section id="step-1" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={1} title="大会の名前を決める" done={idReady} /><p className="mt-3 text-slate-600">大会IDは、この大会だけの整理番号です。英語が分からなくても「自動で作る」を押せば大丈夫です。</p><label className="mt-5 block font-bold">大会ID<input value={eventId} onChange={(e) => updateEventId(e.target.value.toLowerCase())} className={input} placeholder="例: narita-kick-2027" /><span className="mt-1 block text-sm font-normal text-slate-500">使える文字は半角英数字と「-」だけです。あとから変えないでください。</span></label><button type="button" onClick={makeId} className="mt-3 rounded-xl border border-indigo-300 px-4 py-2 font-bold text-indigo-800">大会名から自動で作る</button></section>

    <section id="step-2" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={2} title="参加者に見せる募集ページを書く" done={entryReady} /><p className="mt-3 text-slate-600">分かるところから入力します。赤い「必須」だけは空欄にできません。</p><div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="font-bold sm:col-span-2">大会名 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.title} onChange={(e) => updateEntry('title', e.target.value)} placeholder="例: ○○キックボクシング大会" /></label>
      <label className="font-bold">主催者 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.organizer} onChange={(e) => updateEntry('organizer', e.target.value)} placeholder="例: ○○ジム" /></label><label className="font-bold">開催日 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.date} onChange={(e) => updateEntry('date', e.target.value)} placeholder="例: 2027年9月23日" /></label>
      <label className="font-bold sm:col-span-2">会場 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.venue} onChange={(e) => updateEntry('venue', e.target.value)} placeholder="会場名と市区町村" /></label>
      <label className="font-bold">計量時間<input className={input} value={entryConfig.weighInAt} onChange={(e) => updateEntry('weighInAt', e.target.value)} placeholder="例: 10:00" /></label><label className="font-bold">試合開始<input className={input} value={entryConfig.startAt} onChange={(e) => updateEntry('startAt', e.target.value)} placeholder="例: 11:00" /></label>
      <label className="font-bold">参加費<input className={input} value={entryConfig.fee} onChange={(e) => updateEntry('fee', e.target.value)} placeholder="例: 4,000円" /></label><label className="font-bold">申し込み締切 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.deadline} onChange={(e) => updateEntry('deadline', e.target.value)} placeholder="例: 2027年9月1日" /></label>
      <label className="font-bold sm:col-span-2">大会の説明<textarea className={input} rows={6} value={entryConfig.description} onChange={(e) => updateEntry('description', e.target.value)} placeholder="例: 初めて試合に出る方も歓迎します。経験を考えて安全に対戦相手を決めます。" /></label><label className="font-bold sm:col-span-2">質問の連絡先<input className={input} value={entryConfig.contact} onChange={(e) => updateEntry('contact', e.target.value)} placeholder="例: 公式LINEへご連絡ください" /></label>
    </div><label className="mt-5 flex gap-3 rounded-xl bg-amber-50 p-4"><input type="checkbox" checked={entryConfig.published} onChange={(e) => updateEntry('published', e.target.checked)} /><span><b>申し込みを受け付ける</b><br /><span className="text-sm text-slate-600">最初はOFFのまま保存して確認します。内容が正しいと確認できたらONにします。</span></span></label><button disabled={busy} onClick={() => void saveEntry()} className="mt-4 w-full rounded-xl bg-indigo-700 p-4 text-lg font-black text-white disabled:bg-slate-300">入力した募集ページを保存する</button></section>

    <section id="step-3" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={3} title="最初の1回だけ、つなぐ" done={connectionReady} /><p className="mt-3 text-slate-600">ここはAIがセットアップしたときに使います。分からない文字を自分で作らず、AIから教えてもらった2つをそのまま貼り付けてください。</p><details className="mt-4 rounded-xl border border-slate-200 p-4" open={!connectionReady}><summary className="cursor-pointer font-bold">接続情報を入力する</summary><div className="mt-4 space-y-4"><label className="block font-bold">① 接続先URL<input value={api} onChange={(e) => setApi(e.target.value)} className={input} placeholder="https://○○○.workers.dev" /><span className="mt-1 block text-sm font-normal text-slate-500">大会データを安全に保存する場所です。</span></label><label className="block font-bold">② 操作キー<input type="password" value={key} onChange={(e) => setKey(e.target.value)} className={input} placeholder="AIから受け取った操作キー" /><span className="mt-1 block text-sm font-normal text-slate-500">銀行の暗証番号と同じように、他の人へ送らないでください。このパソコンだけに保存されます。</span></label></div></details></section>

    <section id="step-4" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={4} title="対戦表を入れて、リンクを配る" done={sheetReady} /><p className="mt-3 text-slate-600">Googleスプレッドシートを開き、上にあるURLを全部コピーして貼ります。<b className="text-rose-700">電話番号・メール・住所が入った申し込み原本は貼らないでください。</b></p><label className="mt-5 block font-bold">対戦表のGoogleスプレッドシートURL<input value={sheet} onChange={(e) => setSheet(e.target.value)} className={input} placeholder="https://docs.google.com/spreadsheets/d/…/edit" /></label><button disabled={busy || errors.length > 0} onClick={() => void importSheet()} className="mt-4 w-full rounded-xl bg-indigo-700 p-4 text-xl font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">対戦表を取り込む</button>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-cyan-50 p-4"><p className="font-black">参加者へ送る</p><p className="mt-1 text-sm text-slate-600">選手が申し込むページです。</p><button onClick={() => void copy('entry', entryUrl)} className="mt-3 w-full rounded-lg bg-cyan-700 p-3 font-bold text-white">{copied === 'entry' ? 'コピーしました ✓' : '募集ページのリンクをコピー'}</button><a href={entryUrl} className="mt-2 block text-center text-sm font-bold text-cyan-800">先に自分で見る</a></div><div className="rounded-xl bg-emerald-50 p-4"><p className="font-black">大会スタッフへ送る</p><p className="mt-1 text-sm text-slate-600">大会当日に使う画面です。</p><button onClick={() => void copy('live', liveUrl)} className="mt-3 w-full rounded-lg bg-emerald-700 p-3 font-bold text-white">{copied === 'live' ? 'コピーしました ✓' : '大会画面のリンクをコピー'}</button><a href={liveUrl} className="mt-2 block text-center text-sm font-bold text-emerald-800">大会当日の画面を見る</a></div></div>
      <div className="mt-6 rounded-xl border border-slate-200 p-4"><p className="font-black">申し込みを保存する</p><p className="mt-1 text-sm text-slate-600">緑は大会運営用です。赤は電話番号などが入るため、大会責任者だけが使います。</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><button onClick={() => void downloadEntries('os')} className="rounded-xl bg-emerald-700 p-3 font-bold text-white">大会運営用名簿を保存</button><button onClick={() => void downloadEntries('full')} className="rounded-xl border border-rose-300 p-3 font-bold text-rose-800">個人情報を含む原本を保存</button></div></div>
    </section>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><button type="button" onClick={() => setAdvanced((v) => !v)} className="font-bold text-slate-700">{advanced ? '− 閉じる' : '＋ 困ったときだけ開く予備の方法'}</button>{advanced ? <div className="mt-4 space-y-3"><p className="rounded-xl bg-amber-50 p-3 text-sm">Googleスプレッドシートが使えない非常時だけ使います。分からない場合は入力せず、AIへ「予備CSVの入れ方を教えて」と送ってください。</p><textarea value={eventCsv} onChange={(e) => setEventCsv(e.target.value)} rows={4} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="大会情報CSV" /><textarea value={matchesCsv} onChange={(e) => setMatchesCsv(e.target.value)} rows={8} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="対戦表CSV（必須）" /><textarea value={musicCsv} onChange={(e) => setMusicCsv(e.target.value)} rows={6} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="入場曲CSV" /><button disabled={busy} onClick={() => void importCsv()} className="w-full rounded-xl bg-slate-800 p-3 font-bold text-white">予備データを取り込む</button></div> : null}</section>

    <aside className="my-8 rounded-2xl bg-slate-900 p-6 text-white"><h2 className="text-xl font-black">分からなくなったら、この文章をAIへ送ってください</h2><pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-sm leading-relaxed">Tournament OSの大会準備画面で止まりました。{`\n`}今あるデータを消さず、公開もせず、次に押す場所を小学生にも分かる日本語で1つずつ教えてください。</pre></aside>
  </div></main>;
}
