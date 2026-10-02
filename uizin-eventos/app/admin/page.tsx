'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadEntryFighters, reloadProgram, saveEntryConfig, uploadProgram } from '../lib/client.ts';
import { getApiBase, getEventId, getOperatorKey, setApiBase, setEventId, setOperatorKey } from '../lib/config.ts';
import { extractSheetId, validateNewEvent } from '../../core/eventConfig.ts';
import { isValidEventId, normalizeEventId } from '../../core/eventId.ts';
import type { EntrySiteConfig } from '../../core/entry.ts';
import { dateDigits, formatDateInput } from '../../core/dateInput.ts';
import { EMPTY_ENTRY_CONFIG, validateEntryConfig } from '../../core/entry.ts';
import type { DraftMatch, MatchBuilderFighter } from '../../core/matchBuilder.ts';
import { draftEventCsv, draftMatchesCsv, draftMusicCsv, moveDraftMatch, swapDraftCorners, validateDraftMatches } from '../../core/matchBuilder.ts';

const STEPS = [
  { no: 1, icon: '🏆', short: '大会を決める', color: 'bg-amber-100 text-amber-900' },
  { no: 2, icon: '📣', short: '選手を募集', color: 'bg-pink-100 text-pink-900' },
  { no: 3, icon: '🔗', short: '最初だけ接続', color: 'bg-violet-100 text-violet-900' },
  { no: 4, icon: '🥋', short: '選手を読む', color: 'bg-cyan-100 text-cyan-900' },
  { no: 5, icon: '🟥🟦', short: '対戦を作る', color: 'bg-emerald-100 text-emerald-900' },
];

function CoachIllustration() {
  return <svg aria-hidden="true" viewBox="0 0 240 170" className="mx-auto h-auto w-full max-w-[220px]">
    <rect x="15" y="119" width="210" height="34" rx="8" fill="#f8fafc" stroke="#94a3b8" strokeWidth="3" />
    <path d="M15 128h210M15 145h210" stroke="#ef4444" strokeWidth="4" /><path d="M25 111v50M215 111v50" stroke="#475569" strokeWidth="5" />
    <circle cx="120" cy="53" r="29" fill="#f8c9a4" /><path d="M91 49c4-30 55-39 59 7-18-6-29-19-35-27-4 10-12 17-24 20Z" fill="#334155" />
    <circle cx="109" cy="56" r="3" fill="#334155" /><circle cx="131" cy="56" r="3" fill="#334155" /><path d="M111 68c6 5 12 5 18 0" fill="none" stroke="#9f1239" strokeWidth="3" strokeLinecap="round" />
    <path d="M91 92c15-17 43-17 58 0l10 48H81Z" fill="#111827" /><path d="m109 84 11 15 11-15" fill="#fff" /><path d="M100 101h40" stroke="#facc15" strokeWidth="5" />
    <path d="M91 101 68 89M149 101l23-12" fill="none" stroke="#f8c9a4" strokeWidth="13" strokeLinecap="round" />
    <path d="M52 72c-10 0-18 8-18 18s8 18 18 18c8 0 13-4 17-10l8-12-14-14Z" fill="#ef4444" /><path d="M188 72c10 0 18 8 18 18s-8 18-18 18c-8 0-13-4-17-10l-8-12 14-14Z" fill="#2563eb" />
    <path d="M45 86h21M174 86h21" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    <path d="M20 26h52l-8 14 8 14H20Z" fill="#ef4444" /><path d="M220 26h-52l8 14-8 14h52Z" fill="#2563eb" /><text x="46" y="45" textAnchor="middle" fill="white" fontSize="12" fontWeight="800">RED</text><text x="194" y="45" textAnchor="middle" fill="white" fontSize="12" fontWeight="800">BLUE</text>
    <circle cx="120" cy="17" r="13" fill="#facc15" /><path d="m114 17 4 4 8-9" fill="none" stroke="#854d0e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function StepTitle({ no, title, done }: { no: number; title: string; done: boolean }) {
  const step = STEPS[no - 1];
  return <div className="flex items-center gap-3"><span aria-hidden="true" className={'grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl shadow-sm ' + step.color}>{step.icon}</span><div><p className="text-sm font-black text-slate-500">ステップ {no} {done ? '・できました ✓' : ''}</p><h2 className="text-xl font-black sm:text-2xl">{title}</h2></div></div>;
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
  const [fighters, setFighters] = useState<MatchBuilderFighter[]>([]);
  const [draftMatches, setDraftMatches] = useState<DraftMatch[]>([]);

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
  const adminUrl = origin + '/admin/?event=' + encodeURIComponent(normalizedId);
  const helpPrompt = `Tournament OSで大会を作ります。次の管理画面を確認しながら手伝ってください。\n${adminUrl}\n\n今あるデータを消さず、勝手に公開せず、私が次に押す場所を小学生にも分かる日本語で1つずつ教えてください。リンクを直接開けない場合は、画面のスクリーンショットを送るよう案内してください。`;
  const setupPrompt = `Tournament OSの初回接続を設定してください。\n大会ID: ${normalizedId || '未設定'}\n私はパソコン操作に慣れていません。既存データを消さず、公開前に確認を取り、この端末の保存済み接続設定を確認し、必要な初回設定を手伝ってください。管理用の秘密情報はチャットに表示しないでください。`;
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
    const config = { ...entryConfig, date: formatDateInput(entryConfig.date), deadline: formatDateInput(entryConfig.deadline) };
    const configErrors = validateEntryConfig(config);
    if (!idReady) return setMessage('まず「1」で大会IDを決めてください。');
    if (configErrors.length) return setMessage('「2」の入力を確認してください。' + configErrors[0]);
    if (!connectionReady) return setMessage('「3」を開き、AIへ接続設定を依頼してください。');
    saveConnection(); setBusy(true); setMessage('保存しています。画面を閉じずにお待ちください…');
    setEntryConfig(config);
    const result = await saveEntryConfig(config);
    setBusy(false); setMessage(result.ok ? '保存できました。下の「募集ページを見る」で内容を確認してください。' : '保存できませんでした: ' + (result.reason ?? '理由不明'));
  };
  const importSheet = async () => {
    if (errors.length) return setMessage('「1」と「4」を確認してください。' + errors[0]);
    if (!connectionReady) return setMessage('「3」を開き、AIへ接続設定を依頼してください。');
    saveConnection(); setBusy(true); setMessage('対戦表を確認しています…');
    const result = await reloadProgram(extractSheetId(sheet));
    setBusy(false); setMessage(result.ok ? '対戦表を取り込みました。「大会当日の画面を見る」で確認してください。' : '取り込めませんでした: ' + (result.reason ?? '理由不明'));
  };
  const importCsv = async () => {
    if (!matchesCsv.trim()) return setMessage('予備の対戦表CSVが空です。分からない場合はAIへ相談してください。');
    if (!connectionReady) return setMessage('「3」を開き、AIへ接続設定を依頼してください。');
    saveConnection(); setBusy(true); setMessage('予備データを確認しています…');
    const result = await uploadProgram({ event: eventCsv, matches: matchesCsv, music: musicCsv });
    setBusy(false); setMessage(result.ok ? '予備データを取り込みました。大会画面を確認してください。' : '取り込めませんでした: ' + (result.reason ?? '理由不明'));
  };
  const loadFighters = async () => {
    if (!connectionReady) return setMessage('「3」を開き、AIへ接続設定を依頼してください。');
    saveConnection(); setBusy(true); setMessage('申込選手を読み込んでいます…');
    const result = await loadEntryFighters(); setBusy(false);
    if (!result.ok) return setMessage('読み込めませんでした: ' + (result.reason ?? '理由不明'));
    setFighters(result.entries);
    setMessage(result.entries.length + '人を読み込みました。' + (result.source === 'backup' ? 'Google原本に接続できなかったため、安全な予備データを表示しています。' : 'Googleスプレッドシート原本の最新版です。'));
  };
  const addMatch = () => setDraftMatches((matches) => [...matches, { id: crypto.randomUUID(), redReceipt: '', blueReceipt: '', className: '', rule: '' }]);
  const updateMatch = (index: number, values: Partial<DraftMatch>) => setDraftMatches((matches) => matches.map((match, i) => i === index ? { ...match, ...values } : match));
  const saveMatchCards = async () => {
    if (!draftMatches.length) return setMessage('試合がまだありません。「試合を追加」を押してください。');
    const matchErrors = validateDraftMatches(draftMatches); if (matchErrors.length) return setMessage(matchErrors[0]);
    if (!window.confirm(draftMatches.length + '試合を大会画面へ反映します。選手名と試合順を確認しましたか？')) return;
    saveConnection(); setBusy(true); setMessage('対戦カードを反映しています…');
    const result = await uploadProgram({
      event: draftEventCsv({ title: entryConfig.title, venue: entryConfig.venue, date: entryConfig.date, startAt: entryConfig.startAt }),
      matches: draftMatchesCsv(draftMatches, fighters), music: draftMusicCsv(draftMatches, fighters, entryConfig.usesWalkoutMusic),
    });
    setBusy(false); setMessage(result.ok ? '対戦カードを反映しました。大会当日の画面で赤・青と試合順を確認してください。' : '反映できませんでした: ' + (result.reason ?? '理由不明'));
  };
  const downloadEntries = async (view: 'os' | 'full') => {
    if (!connectionReady) return setMessage('「3」を開き、AIへ接続設定を依頼してください。');
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

  return <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-slate-50 to-emerald-50 px-4 py-8 text-slate-900"><div className="mx-auto max-w-3xl">
    <section className="mb-5 rounded-3xl border-4 border-amber-300 bg-amber-50 p-5 shadow-md sm:p-6"><div className="flex items-start gap-4"><span aria-hidden="true" className="text-5xl">🤖</span><div><p className="text-sm font-black text-amber-800">作業を始める前に</p><h1 className="text-2xl font-black sm:text-3xl">最初にAIを開いてください</h1></div></div><p className="mt-4 text-lg font-bold leading-relaxed text-slate-800">この画面は、AIに見てもらいながら進めると簡単です。Codex・Claude Code・ChatGPTなど、普段使っているAIを開き、この管理画面のリンクとお願い文を送ります。</p><ol className="mt-4 space-y-3"><li className="flex gap-3 rounded-xl bg-white p-3"><b className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-400">1</b><span><b>AIを開く</b><br /><span className="text-sm text-slate-600">Codex、Claude Code、ChatGPTなどを開きます。</span></span></li><li className="flex gap-3 rounded-xl bg-white p-3"><b className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-400">2</b><span><b>下のボタンで文章とリンクをコピー</b><br /><span className="text-sm text-slate-600">コピーした内容をAIへ貼り付けます。</span></span></li><li className="flex gap-3 rounded-xl bg-white p-3"><b className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-400">3</b><span><b>この画面を閉じず、AIの案内どおりに進める</b><br /><span className="text-sm text-slate-600">AIがリンクを開けない場合は、画面のスクリーンショットを送ります。</span></span></li></ol><button type="button" onClick={() => void copy('help', helpPrompt)} className="mt-4 w-full rounded-xl bg-amber-500 p-4 text-lg font-black text-slate-950 shadow-sm">{copied === 'help' ? 'コピーしました ✓ AIへ貼り付けてください' : 'AIに送る文章とリンクをコピー'}</button></section>
    <header className="overflow-hidden rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm sm:grid sm:grid-cols-[1fr_220px] sm:items-center sm:p-8"><div><p className="text-sm font-bold text-indigo-700">TOURNAMENT OS</p>
    <h1 className="mt-1 text-3xl font-black">絵を見ながら、大会を作ろう</h1>
    <p className="mt-3 text-lg leading-relaxed text-slate-700">パソコンが苦手でも大丈夫です。<b>番号どおりに、上から下へ</b>進めます。分からない場所は想像で埋めず、AIまたは大会責任者へ確認します。</p><p className="mt-4 inline-flex rounded-full bg-emerald-100 px-4 py-2 font-black text-emerald-900">全部で5ステップです</p></div><CoachIllustration /></header>
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="大会作りの道順">{STEPS.map((step, index) => <div key={step.no} className={'relative rounded-2xl p-3 text-center ' + step.color}><span aria-hidden="true" className="block text-3xl">{step.icon}</span><b className="mt-1 block text-sm">{step.no}. {step.short}</b>{index < STEPS.length - 1 ? <span aria-hidden="true" className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-xl text-slate-400 sm:block">→</span> : null}</div>)}</div>
    <aside className="mt-6 rounded-2xl bg-indigo-50 p-5"><p className="font-black text-indigo-950">まず覚えることは3つだけ</p><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed"><li>大会ごとに「大会ID」という名前を1つ作ります。</li><li>参加者に渡すのは「募集ページ」のリンクです。</li><li>大会当日にスタッフが開くのは「大会当日の画面」のリンクです。</li></ol></aside>
    <nav className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="準備の進み具合">{[[1, '大会ID', idReady], [2, '募集内容', entryReady], [3, '接続', connectionReady], [4, '原本', fighters.length > 0], [5, '対戦カード', draftMatches.length > 0]].map(([no, label, done]) => <a key={String(no)} href={'#step-' + no} className={'rounded-xl border p-3 text-center text-sm font-bold shadow-sm ' + (done ? 'border-emerald-200 bg-emerald-100 text-emerald-900' : 'border-slate-200 bg-white text-slate-600')}>{done ? '✓ ' : no + '. '}{String(label)}</a>)}</nav>
    {message ? <p role="status" className="sticky top-2 z-10 mt-5 rounded-xl border border-amber-300 bg-amber-100 p-4 font-bold text-amber-950 shadow">{message}</p> : null}

    <section id="step-1" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={1} title="大会の名前を決める" done={idReady} /><p className="mt-3 text-slate-600">大会IDは、この大会だけの整理番号です。英語が分からなくても「自動で作る」を押せば大丈夫です。</p><label className="mt-5 block font-bold">大会ID<input value={eventId} onChange={(e) => updateEventId(e.target.value.toLowerCase())} className={input} placeholder="例: narita-kick-2027" /><span className="mt-1 block text-sm font-normal text-slate-500">使える文字は半角英数字と「-」だけです。あとから変えないでください。</span></label><button type="button" onClick={makeId} className="mt-3 rounded-xl border border-indigo-300 px-4 py-2 font-bold text-indigo-800">大会名から自動で作る</button></section>

    <section id="step-2" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={2} title="参加者に見せる募集ページを書く" done={entryReady} /><p className="mt-3 text-slate-600">分かるところから入力します。赤い「必須」だけは空欄にできません。</p><div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="font-bold sm:col-span-2">大会名 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.title} onChange={(e) => updateEntry('title', e.target.value)} placeholder="例: ○○キックボクシング大会" /></label>
      <label className="font-bold">主催者 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.organizer} onChange={(e) => updateEntry('organizer', e.target.value)} placeholder="例: ○○ジム" /></label><label className="font-bold">開催日 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.date} inputMode="numeric" onFocus={() => updateEntry('date', dateDigits(entryConfig.date))} onChange={(e) => updateEntry('date', dateDigits(e.target.value))} onBlur={() => updateEntry('date', formatDateInput(entryConfig.date))} placeholder="例: 20270923（半角数字8桁）" /></label>
      <label className="font-bold sm:col-span-2">会場 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.venue} onChange={(e) => updateEntry('venue', e.target.value)} placeholder="会場名と市区町村" /></label>
      <label className="font-bold">計量時間<input className={input} value={entryConfig.weighInAt} onChange={(e) => updateEntry('weighInAt', e.target.value)} placeholder="例: 10:00" /></label><label className="font-bold">試合開始<input className={input} value={entryConfig.startAt} onChange={(e) => updateEntry('startAt', e.target.value)} placeholder="例: 11:00" /></label>
      <label className="font-bold">参加費<input className={input} value={entryConfig.fee} onChange={(e) => updateEntry('fee', e.target.value)} placeholder="例: 4,000円" /></label><label className="font-bold">申し込み締切 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.deadline} inputMode="numeric" onFocus={() => updateEntry('deadline', dateDigits(entryConfig.deadline))} onChange={(e) => updateEntry('deadline', dateDigits(e.target.value))} onBlur={() => updateEntry('deadline', formatDateInput(entryConfig.deadline))} placeholder="例: 20270901（半角数字8桁）" /></label>
      <label className="font-bold sm:col-span-2">大会の説明<textarea className={input} rows={6} value={entryConfig.description} onChange={(e) => updateEntry('description', e.target.value)} placeholder="例: 初めて試合に出る方も歓迎します。経験を考えて安全に対戦相手を決めます。" /></label><label className="font-bold sm:col-span-2">質問の連絡先<input className={input} value={entryConfig.contact} onChange={(e) => updateEntry('contact', e.target.value)} placeholder="例: 公式LINEへご連絡ください" /></label>
    </div><label className="mt-5 flex gap-3 rounded-xl bg-indigo-50 p-4"><input type="checkbox" checked={entryConfig.usesWalkoutMusic} onChange={(e) => updateEntry('usesWalkoutMusic', e.target.checked)} /><span><b>この大会では入場曲を使う</b><br /><span className="text-sm text-slate-600">使わない大会はOFFにします。参加者の画面から入場曲の質問が消えます。</span></span></label><label className="mt-3 flex gap-3 rounded-xl bg-amber-50 p-4"><input type="checkbox" checked={entryConfig.published} onChange={(e) => updateEntry('published', e.target.checked)} /><span><b>申し込みを受け付ける</b><br /><span className="text-sm text-slate-600">最初はOFFのまま保存して確認します。内容が正しいと確認できたらONにします。</span></span></label><button disabled={busy} onClick={() => void saveEntry()} className="mt-4 w-full rounded-xl bg-indigo-700 p-4 text-lg font-black text-white disabled:bg-slate-300">入力した募集ページを保存する</button></section>

    <section id="step-3" className="mt-6 rounded-2xl border border-violet-200 bg-white p-6 shadow-sm"><StepTitle no={3} title="最初の1回だけ、AIにつないでもらう" done={connectionReady} />{connectionReady ? <div className="mt-4 rounded-2xl bg-emerald-50 p-5 text-center"><p className="text-4xl" aria-hidden="true">✅</p><p className="mt-2 text-xl font-black text-emerald-900">接続できています</p><p className="mt-1 text-slate-700">ここでは何もしなくて大丈夫です。ステップ4へ進んでください。</p></div> : <div className="mt-4 rounded-2xl bg-violet-50 p-5"><p className="text-lg font-black text-violet-950">ここは自分で設定しません</p><p className="mt-2 leading-relaxed text-slate-700">下のボタンを押して文章をコピーし、CodexやClaude Codeなど、アプリを作ってくれたAIへ貼り付けてください。AIが接続を準備します。</p><button type="button" onClick={() => void copy('setup', setupPrompt)} className="mt-4 w-full rounded-xl bg-violet-700 p-4 text-lg font-black text-white">{copied === 'setup' ? 'コピーしました ✓ AIへ貼り付けてください' : 'AIへお願いする文章をコピー'}</button></div>}<details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer font-bold text-slate-700">AI・詳しい人だけが開く接続設定</summary><div className="mt-4 space-y-4"><p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">分からない場合は入力しないでください。間違った文字を入れるとデータを読み込めません。</p><label className="block font-bold">保存場所URL<input value={api} onChange={(e) => setApi(e.target.value)} className={input} placeholder="https://○○○.workers.dev" /><span className="mt-1 block text-sm font-normal text-slate-500">Cloudflareに作った、大会データの保存場所です。</span></label><p className="text-sm text-slate-600">管理用の接続情報は、この端末に保存した設定を使います。接続できない場合は、上のボタンでAIへ設定を依頼してください。</p></div></details></section>

    <section id="step-4" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={4} title="申込選手を原本から読み込む" done={fighters.length > 0} /><p className="mt-3 text-slate-600">ボタンを押すと、非公開のGoogleスプレッドシート原本から最新版の選手一覧を読み込みます。原本を直した後も、もう一度押せば更新されます。</p><button disabled={busy} onClick={() => void loadFighters()} className="mt-4 w-full rounded-xl bg-indigo-700 p-4 text-xl font-black text-white disabled:bg-slate-300">申込選手を読み込む</button>{fighters.length ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-900">✓ {fighters.length}人の選手を使えます</p> : null}
      <details className="mt-4 rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-bold">すでに対戦表のGoogleスプレッドシートがある場合</summary><p className="mt-3 text-sm text-slate-600">対戦表のURLを貼って取り込めます。電話番号・メール・住所が入った申込原本はここへ貼らないでください。</p><input value={sheet} onChange={(e) => setSheet(e.target.value)} className={input} placeholder="https://docs.google.com/spreadsheets/d/…/edit" /><button disabled={busy || errors.length > 0} onClick={() => void importSheet()} className="mt-3 w-full rounded-xl bg-slate-800 p-3 font-bold text-white disabled:bg-slate-300">完成済みの対戦表を取り込む</button></details>
    </section>

    <section id="step-5" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={5} title="赤・青を選び、試合順を決める" done={draftMatches.length > 0} /><p className="mt-3 text-slate-600">試合を追加し、赤コーナーと青コーナーを選びます。間違えても、保存する前なら何度でも直せます。</p>{!fighters.length ? <p className="mt-4 rounded-xl bg-amber-50 p-4 font-bold text-amber-900">先に「4. 申込選手を読み込む」を押してください。</p> : null}<div className="mt-4 space-y-4">{draftMatches.map((match, index) => <article key={match.id} className="rounded-2xl border-2 border-slate-200 p-4"><div className="flex flex-wrap items-center gap-2"><p className="mr-auto text-xl font-black">第 {index + 1} 試合</p><button onClick={() => setDraftMatches((m) => moveDraftMatch(m, index, -1))} disabled={index === 0} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-30">↑ 一つ上へ</button><button onClick={() => setDraftMatches((m) => moveDraftMatch(m, index, 1))} disabled={index === draftMatches.length - 1} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-30">↓ 一つ下へ</button></div><div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]"><label className="font-bold text-rose-700">赤コーナー<select className={input} value={match.redReceipt} onChange={(e) => updateMatch(index, { redReceipt: e.target.value })}><option value="">選手を選ぶ</option>{fighters.map((fighter) => <option key={fighter.receiptNo} value={fighter.receiptNo}>{fighter.fighterName}（{fighter.gym} / {fighter.weight || '?'}kg）</option>)}</select></label><button onClick={() => updateMatch(index, swapDraftCorners(match))} className="rounded-xl bg-slate-800 px-4 py-3 font-black text-white">⇄ 赤青を入れ替える</button><label className="font-bold text-blue-700">青コーナー<select className={input} value={match.blueReceipt} onChange={(e) => updateMatch(index, { blueReceipt: e.target.value })}><option value="">選手を選ぶ</option>{fighters.map((fighter) => <option key={fighter.receiptNo} value={fighter.receiptNo}>{fighter.fighterName}（{fighter.gym} / {fighter.weight || '?'}kg）</option>)}</select></label></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">階級・クラス<input className={input} value={match.className} onChange={(e) => updateMatch(index, { className: e.target.value })} placeholder="例: キッズ 30kg契約" /></label><label className="text-sm font-bold">ルール<input className={input} value={match.rule} onChange={(e) => updateMatch(index, { rule: e.target.value })} placeholder="例: キックボクシングルール" /></label></div><button onClick={() => setDraftMatches((matches) => matches.filter((_, i) => i !== index))} className="mt-4 text-sm font-bold text-rose-700">この試合を削除</button></article>)}</div><button onClick={addMatch} disabled={!fighters.length} className="mt-4 w-full rounded-xl border-2 border-dashed border-indigo-300 p-4 text-lg font-black text-indigo-800 disabled:opacity-40">＋ 試合を追加</button><button onClick={() => void saveMatchCards()} disabled={busy || !draftMatches.length} className="mt-4 w-full rounded-xl bg-emerald-700 p-4 text-xl font-black text-white disabled:bg-slate-300">確認した対戦カードを大会画面へ反映</button>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-cyan-50 p-4"><p className="font-black">参加者へ送る</p><p className="mt-1 text-sm text-slate-600">選手が申し込むページです。</p><button onClick={() => void copy('entry', entryUrl)} className="mt-3 w-full rounded-lg bg-cyan-700 p-3 font-bold text-white">{copied === 'entry' ? 'コピーしました ✓' : '募集ページのリンクをコピー'}</button><a href={entryUrl} className="mt-2 block text-center text-sm font-bold text-cyan-800">先に自分で見る</a></div><div className="rounded-xl bg-emerald-50 p-4"><p className="font-black">大会スタッフへ送る</p><p className="mt-1 text-sm text-slate-600">大会当日に使う画面です。</p><button onClick={() => void copy('live', liveUrl)} className="mt-3 w-full rounded-lg bg-emerald-700 p-3 font-bold text-white">{copied === 'live' ? 'コピーしました ✓' : '大会画面のリンクをコピー'}</button><a href={liveUrl} className="mt-2 block text-center text-sm font-bold text-emerald-800">大会当日の画面を見る</a></div></div>
      <div className="mt-6 rounded-xl border border-slate-200 p-4"><p className="font-black">申し込みを保存する</p><p className="mt-1 text-sm text-slate-600">緑は大会運営用です。赤は電話番号などが入るため、大会責任者だけが使います。</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><button onClick={() => void downloadEntries('os')} className="rounded-xl bg-emerald-700 p-3 font-bold text-white">大会運営用名簿を保存</button><button onClick={() => void downloadEntries('full')} className="rounded-xl border border-rose-300 p-3 font-bold text-rose-800">個人情報を含む原本を保存</button></div></div>
    </section>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><button type="button" onClick={() => setAdvanced((v) => !v)} className="font-bold text-slate-700">{advanced ? '− 閉じる' : '＋ 困ったときだけ開く予備の方法'}</button>{advanced ? <div className="mt-4 space-y-3"><p className="rounded-xl bg-amber-50 p-3 text-sm">Googleスプレッドシートが使えない非常時だけ使います。分からない場合は入力せず、AIへ「予備CSVの入れ方を教えて」と送ってください。</p><textarea value={eventCsv} onChange={(e) => setEventCsv(e.target.value)} rows={4} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="大会情報CSV" /><textarea value={matchesCsv} onChange={(e) => setMatchesCsv(e.target.value)} rows={8} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="対戦表CSV（必須）" /><textarea value={musicCsv} onChange={(e) => setMusicCsv(e.target.value)} rows={6} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="入場曲CSV" /><button disabled={busy} onClick={() => void importCsv()} className="w-full rounded-xl bg-slate-800 p-3 font-bold text-white">予備データを取り込む</button></div> : null}</section>

    <aside className="my-8 rounded-2xl bg-slate-900 p-6 text-white"><h2 className="text-xl font-black">分からなくなったら、この文章をAIへ送ってください</h2><pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-sm leading-relaxed">Tournament OSの大会準備画面で止まりました。{`\n`}今あるデータを消さず、公開もせず、次に押す場所を小学生にも分かる日本語で1つずつ教えてください。</pre></aside>
  </div></main>;
}
