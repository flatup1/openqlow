'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadEntryFighters, reloadProgram, saveEntryConfig, uploadProgram } from '../lib/client.ts';
import { getApiBase, getEventId, getOperatorKey, setApiBase, setEventId, setOperatorKey } from '../lib/config.ts';
import { extractSheetId, validateNewEvent } from '../../core/eventConfig.ts';
import { isValidEventId, normalizeEventId } from '../../core/eventId.ts';
import type { EntrySiteConfig } from '../../core/entry.ts';
import { EMPTY_ENTRY_CONFIG, validateEntryConfig } from '../../core/entry.ts';
import type { DraftMatch, MatchBuilderFighter } from '../../core/matchBuilder.ts';
import { FormImport } from '../components/FormImport.tsx';
import type { ImportedFighter } from '../../core/formImport.ts';
import { mergeImported } from '../../core/formImport.ts';
import { draftEventCsv, draftMatchesCsv, draftMusicCsv, filterFighters, moveDraftMatch, reviewDraftMatches, swapDraftCorners, validateDraftMatches } from '../../core/matchBuilder.ts';

const STEPS = [
  { no: 1, icon: '🏆', short: '大会を決める', color: 'bg-amber-100 text-amber-900' },
  { no: 2, icon: '📣', short: '選手を募集', color: 'bg-pink-100 text-pink-900' },
  { no: 3, icon: '🔗', short: '最初だけ接続', color: 'bg-violet-100 text-violet-900' },
  { no: 4, icon: '🥋', short: '選手を読む', color: 'bg-cyan-100 text-cyan-900' },
  { no: 5, icon: '🟥🟦', short: '対戦を作る', color: 'bg-emerald-100 text-emerald-900' },
  { no: 6, icon: '🎉', short: 'リンクを渡す', color: 'bg-amber-100 text-amber-900' },
];

/** いまのステップで「何をすればよいか」を1文で出す。会長が読むのはここだけで済むようにする */
const NEXT_ACTION: Record<number, string> = {
  1: '「大会名から自動で作る」を押すか、大会IDを入れる',
  2: '大会名・日付・会場を入れて「保存する」を押す',
  3: '管理用パスワードを入れる（1回だけ）',
  4: '選手を読み込む',
  5: '「＋ 試合を追加」を押して、赤と青を選ぶ',
  6: 'リンクをコピーして、参加者とスタッフへ送る',
};

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

function CompareRow({ red, blue }: { red?: MatchBuilderFighter; blue?: MatchBuilderFighter }) {
  if (!red && !blue) return null;
  const v = (f: MatchBuilderFighter | undefined, value: string | undefined, unit = '') => !f ? '—' : value ? value + unit : <span className="text-amber-700">未登録</span>;
  const rows: Array<[string, (f?: MatchBuilderFighter) => React.ReactNode]> = [
    ['所属', (f) => v(f, f?.gym)], ['年齢', (f) => v(f, f?.age, '歳')], ['体重', (f) => v(f, f?.weight, 'kg')],
    ['経験', (f) => v(f, f?.experience)], ['戦績', (f) => v(f, f?.record)],
  ];
  return <table className="mt-3 w-full table-fixed text-sm"><tbody>{rows.map(([label, get]) => <tr key={label} className="border-t"><td className="w-2/5 break-words p-1 text-right text-rose-800">{get(red)}</td><th className="w-1/5 p-1 text-center text-xs text-slate-500">{label}</th><td className="w-2/5 break-words p-1 text-blue-800">{get(blue)}</td></tr>)}</tbody></table>;
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
  const [step, setStepState] = useState(1);
  const [cardsPublished, setCardsPublished] = useState(false);
  const [query, setQuery] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [source, setSource] = useState<'' | 'google-form' | 'entry-page'>('');
  const [eventCsv, setEventCsv] = useState('');
  const [matchesCsv, setMatchesCsv] = useState('');
  const [musicCsv, setMusicCsv] = useState('');
  const [entryConfig, setEntryConfig] = useState<EntrySiteConfig>(EMPTY_ENTRY_CONFIG);
  const [copied, setCopied] = useState('');
  const [entryFighters, setFighters] = useState<MatchBuilderFighter[]>([]);
  // 既存Googleフォームから取り込んだ選手。メール・電話は最初から入っていない。
  // この端末にだけ覚えておき、再読込しても消えないようにする。
  const [formFighters, setFormFighters] = useState<ImportedFighter[]>([]);
  const fighters = useMemo(() => mergeImported(entryFighters, formFighters).fighters, [entryFighters, formFighters]);
  const [draftMatches, setDraftMatches] = useState<DraftMatch[]>([]);

  useEffect(() => {
    const initialEvent = getEventId(); const initialApi = getApiBase();
    try { const saved = window.localStorage.getItem('tos-form-fighters:' + initialEvent); if (saved) setFormFighters(JSON.parse(saved) as ImportedFighter[]); } catch { /* 読めなくても画面は動かす */ }
    try { const savedStep = Number(window.localStorage.getItem('tos-admin-step:' + initialEvent)); if (savedStep >= 1 && savedStep <= STEPS.length) setStepState(savedStep); } catch { /* 読めなければ1から */ }
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
  // 欄に文字が入っているだけでは「つながった」とは言えない。パスワードが合っているかを実際に確かめる。
  const [showKey, setShowKey] = useState(false);
  const [connCheck, setConnCheck] = useState<'idle' | 'checking' | 'ok' | 'bad' | 'offline'>('idle');
  useEffect(() => {
    if (!api.trim() || !key.trim() || !isValidEventId(eventId)) { setConnCheck('idle'); return; }
    setConnCheck('checking');
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const url = new URL(api.trim().replace(/\/+$/, '') + '/api/entries/export');
      url.searchParams.set('event', normalizeEventId(eventId)); url.searchParams.set('view', 'os');
      fetch(url, { headers: { 'x-operator-key': key.trim() }, signal: controller.signal })
        .then((res) => setConnCheck(res.ok ? 'ok' : res.status === 401 ? 'bad' : 'offline'))
        .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setConnCheck('offline'); });
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [api, key, eventId]);
  const sheetReady = Boolean(extractSheetId(sheet));
  const errors = useMemo(() => validateNewEvent(eventId, sheet), [eventId, sheet]);
  const entryUrl = origin + '/entry/?event=' + encodeURIComponent(normalizedId);
  const liveUrl = origin + '/live/?event=' + encodeURIComponent(normalizedId);
  const adminUrl = origin + '/admin/?event=' + encodeURIComponent(normalizedId);
  const helpPrompt = `Tournament OSで大会を作ります。次の管理画面を確認しながら手伝ってください。\n${adminUrl}\n\n今あるデータを消さず、勝手に公開せず、私が次に押す場所を小学生にも分かる日本語で1つずつ教えてください。リンクを直接開けない場合は、画面のスクリーンショットを送るよう案内してください。`;
  const setupPrompt = `Tournament OSの初回接続を設定してください。\n大会ID: ${normalizedId || '未設定'}\n私はパソコン操作に慣れていません。既存データを消さず、公開前に確認を取り、接続先URLと管理用パスワードをこの画面へ設定してください。`;
  const input = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-base focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100';

  const matchNotes = useMemo(() => reviewDraftMatches(draftMatches, fighters), [draftMatches, fighters]);
  const shownFighters = useMemo(() => filterFighters(fighters, query), [fighters, query]);
  const byReceipt = useMemo(() => new Map(fighters.map((f) => [f.receiptNo, f])), [fighters]);
  // 絞り込み中でも、いま選ばれている選手は選択肢から消さない（消えると選び直しになってしまう）
  const optionsFor = (selected: string) => {
    const current = byReceipt.get(selected);
    const list = !current || shownFighters.includes(current) ? shownFighters : [current, ...shownFighters];
    return list.map((fighter) => <option key={fighter.receiptNo} value={fighter.receiptNo}>{fighter.fighterName}（{fighter.gym || '所属未登録'} / {fighter.weight ? fighter.weight + 'kg' : '体重未登録'}）</option>);
  };
  const goStep = (next: number) => {
    const target = Math.min(STEPS.length, Math.max(1, next));
    setStepState(target); setMessage('');
    try { window.localStorage.setItem('tos-admin-step:' + normalizedId, String(target)); } catch { /* 覚えられなくても進める */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const doneByStep: Record<number, boolean> = { 1: idReady, 2: entryReady, 3: connectionReady && connCheck === 'ok', 4: fighters.length > 0, 5: cardsPublished, 6: false };
  const stepNav = <div className="mt-8 grid grid-cols-[1fr_2fr] gap-3">
    <button type="button" onClick={() => goStep(step - 1)} disabled={step === 1} className="rounded-2xl border-2 border-slate-300 bg-white p-4 text-lg font-black text-slate-700 disabled:opacity-30">← もどる</button>
    {step < STEPS.length ? <button type="button" onClick={() => goStep(step + 1)} className={'rounded-2xl p-4 text-xl font-black shadow ' + (doneByStep[step] ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700')}>{doneByStep[step] ? '次へ進む →' : 'あとでやる。次へ →'}</button> : <span />}
  </div>;
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
    if (connCheck === 'bad') return setMessage('管理用パスワードが違います。「3. 最初だけ接続」を開いて、入れ直してください。');
    saveConnection(); setBusy(true); setMessage('保存しています。画面を閉じずにお待ちください…');
    const result = await saveEntryConfig(entryConfig);
    setBusy(false); setMessage(result.ok ? '保存できました。「次へ進む」を押し、最後の「リンクを渡す」で募集ページを確認できます。' : '保存できませんでした: ' + (result.reason ?? '理由不明'));
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
  const loadFighters = async () => {
    if (!connectionReady) return setMessage('「3」を開き、接続先と操作キーを入れてください。');
    saveConnection(); setBusy(true); setMessage('申込選手を読み込んでいます…');
    const result = await loadEntryFighters(); setBusy(false);
    if (!result.ok) return setMessage('読み込めませんでした: ' + (result.reason ?? '理由不明'));
    setFighters(result.entries);
    setMessage(result.entries.length + '人を読み込みました。' + (result.source === 'backup' ? 'Google原本に接続できなかったため、安全な予備データを表示しています。' : 'Googleスプレッドシート原本の最新版です。'));
  };
  const confirmFormImport = (incoming: ImportedFighter[]) => {
    const merged = mergeImported(formFighters, incoming);
    const next = merged.fighters as ImportedFighter[];
    setFormFighters(next);
    try { window.localStorage.setItem('tos-form-fighters:' + normalizedId, JSON.stringify(next)); } catch { /* 保存できなくても今の画面では使える */ }
    return { ...merged, before: fighters.length, after: mergeImported(entryFighters, next).fighters.length };
  };
  const addMatch = () => setDraftMatches((matches) => [...matches, { id: crypto.randomUUID(), redReceipt: '', blueReceipt: '', className: '', rule: '' }]);
  const updateMatch = (index: number, values: Partial<DraftMatch>) => { setCardsPublished(false); setReviewing(false); setDraftMatches((matches) => matches.map((match, i) => i === index ? { ...match, ...values } : match)); };
  const saveMatchCards = async () => {
    if (!draftMatches.length) return setMessage('試合がまだありません。「試合を追加」を押してください。');
    const matchErrors = validateDraftMatches(draftMatches); if (matchErrors.length) return setMessage(matchErrors[0]);
    setReviewing(false);
    saveConnection(); setBusy(true); setMessage('対戦カードを反映しています…');
    const result = await uploadProgram({
      event: draftEventCsv({ title: entryConfig.title, venue: entryConfig.venue, date: entryConfig.date, startAt: entryConfig.startAt, weightDisplay: entryConfig.weightDisplay }),
      matches: draftMatchesCsv(draftMatches, fighters), music: draftMusicCsv(draftMatches, fighters, entryConfig.usesWalkoutMusic),
    });
    if (result.ok) setCardsPublished(true);
    setBusy(false); setMessage(result.ok ? '対戦カードを反映しました。大会当日の画面で赤・青と試合順を確認してください。' : '反映できませんでした: ' + (result.reason ?? '理由不明'));
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

  return <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-slate-50 to-emerald-50 px-4 py-8 text-slate-900"><div className="mx-auto max-w-3xl">
    <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><p className="font-black text-amber-950">🤖 この画面は、AIと一緒に大会を作るための画面です。</p><p className="mt-1 text-sm leading-relaxed text-slate-800">まずChatGPT、Codex、Claudeなど、使えるAIを1つ開いてください。下のボタンで文章とこの画面のURLをコピーしてAIへ送り、1つずつ進めます。分からない場合は、画面のスクリーンショットをAIへ送ってください。</p><button type="button" onClick={() => void copy('help', helpPrompt)} className="mt-3 w-full rounded-xl bg-amber-500 p-3 text-lg font-black text-slate-950">{copied === 'help' ? 'コピーしました ✓ AIへ貼り付けてください' : 'AIに送る文章をコピー'}</button></section>
    <nav className="mt-4 grid grid-cols-6 gap-1" aria-label="大会作りの道順">{STEPS.map((item) => <button key={item.no} type="button" onClick={() => goStep(item.no)} aria-current={item.no === step ? 'step' : undefined} aria-label={item.no + '. ' + item.short} className={'rounded-xl p-2 text-center text-xs font-bold ' + (item.no === step ? 'bg-indigo-700 text-white ring-4 ring-indigo-200' : doneByStep[item.no] ? 'bg-emerald-100 text-emerald-900' : 'bg-white text-slate-500')}><span aria-hidden="true" className="block text-xl">{doneByStep[item.no] && item.no !== step ? '✓' : item.icon}</span><span className="hidden sm:block">{item.short}</span></button>)}</nav>
    <section className="mt-4 rounded-3xl bg-indigo-700 p-5 text-white shadow-lg"><p className="text-sm font-bold opacity-80">いまやること（{step} / {STEPS.length}）</p><p className="mt-1 text-2xl font-black leading-snug sm:text-3xl">{step >= 4 && step <= 5 && !connectionReady ? '先に「3. 最初だけ接続」を済ませる' : step === 4 && !source ? '申込をどこで集めたか選ぶ' : step === 1 && idReady ? '大会IDは入っています。下の「次へ進む」を押す' : step === 3 && connCheck === 'ok' ? '接続できています。下の「次へ進む」を押す' : step === 3 && connCheck === 'bad' ? '管理用パスワードが違います。入れ直す' : step === 3 && connCheck === 'checking' ? '接続を確かめています…' : NEXT_ACTION[step]}</p>{step >= 4 && step <= 5 && !connectionReady ? <button type="button" onClick={() => goStep(3)} className="mt-3 w-full rounded-xl bg-white p-3 text-lg font-black text-indigo-800">3. 最初だけ接続 へ行く</button> : null}</section>
    {message ? <p role="status" className="sticky top-2 z-10 mt-5 rounded-xl border border-amber-300 bg-amber-100 p-4 font-bold text-amber-950 shadow">{message}</p> : null}

    {step === 1 ? <><section id="step-1" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={1} title="大会の名前を決める" done={idReady} /><p className="mt-3 text-slate-600">大会IDは、この大会だけの整理番号です。英語が分からなくても「自動で作る」を押せば大丈夫です。</p><label className="mt-5 block font-bold">大会ID<input value={eventId} onChange={(e) => updateEventId(e.target.value.toLowerCase())} className={input} placeholder="例: narita-kick-2027" /><span className="mt-1 block text-sm font-normal text-slate-500">使える文字は半角英数字と「-」だけです。あとから変えないでください。</span></label><button type="button" onClick={makeId} className="mt-3 rounded-xl border border-indigo-300 px-4 py-2 font-bold text-indigo-800">大会名から自動で作る</button></section>

{stepNav}</> : null}

    {step === 2 ? <><section id="step-2" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={2} title="参加者に見せる募集ページを書く" done={entryReady} /><p className="mt-3 text-slate-600">分かるところから入力します。赤い「必須」だけは空欄にできません。</p><div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="font-bold sm:col-span-2">大会名 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.title} onChange={(e) => updateEntry('title', e.target.value)} placeholder="例: ○○キックボクシング大会" /></label>
      <label className="font-bold">主催者 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.organizer} onChange={(e) => updateEntry('organizer', e.target.value)} placeholder="例: ○○ジム" /></label><label className="font-bold">開催日 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.date} onChange={(e) => updateEntry('date', e.target.value)} placeholder="例: 2027年9月23日" /></label>
      <label className="font-bold sm:col-span-2">会場 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.venue} onChange={(e) => updateEntry('venue', e.target.value)} placeholder="会場名と市区町村" /></label>
      <label className="font-bold">計量時間<input className={input} value={entryConfig.weighInAt} onChange={(e) => updateEntry('weighInAt', e.target.value)} placeholder="例: 10:00" /></label><label className="font-bold">試合開始<input className={input} value={entryConfig.startAt} onChange={(e) => updateEntry('startAt', e.target.value)} placeholder="例: 11:00" /></label>
      <label className="font-bold">参加費<input className={input} value={entryConfig.fee} onChange={(e) => updateEntry('fee', e.target.value)} placeholder="例: 4,000円" /></label><label className="font-bold">申し込み締切 <b className="text-rose-600">必須</b><input className={input} value={entryConfig.deadline} onChange={(e) => updateEntry('deadline', e.target.value)} placeholder="例: 2027年9月1日" /></label>
      <label className="font-bold sm:col-span-2">大会の説明<textarea className={input} rows={6} value={entryConfig.description} onChange={(e) => updateEntry('description', e.target.value)} placeholder="例: 初めて試合に出る方も歓迎します。経験を考えて安全に対戦相手を決めます。" /></label><label className="font-bold sm:col-span-2">質問の連絡先<input className={input} value={entryConfig.contact} onChange={(e) => updateEntry('contact', e.target.value)} placeholder="例: 公式LINEへご連絡ください" /></label>
    </div><label className="mt-5 flex gap-3 rounded-xl bg-indigo-50 p-4"><input type="checkbox" checked={entryConfig.usesWalkoutMusic} onChange={(e) => updateEntry('usesWalkoutMusic', e.target.checked)} /><span><b>この大会では入場曲を使う</b><br /><span className="text-sm text-slate-600">使わない大会はOFFにします。参加者の画面から入場曲の質問が消えます。</span></span></label><label className="mt-3 flex gap-3 rounded-xl bg-indigo-50 p-4"><input type="checkbox" checked={entryConfig.usesPhoto !== false} onChange={(e) => updateEntry('usesPhoto', e.target.checked)} /><span><b>この大会では顔写真を集める</b><br /><span className="text-sm text-slate-600">OFFにすると、募集ページから写真の欄が消え、写真なしで申し込めます。</span></span></label><label className="mt-3 block rounded-xl bg-indigo-50 p-4 font-bold">大会画面での体重の出し方<select className={input} value={entryConfig.weightDisplay ?? 'contract'} onChange={(e) => updateEntry('weightDisplay', e.target.value)}><option value="contract">重い方に合わせた「○○kg契約」だけ出す（おすすめ）</option><option value="both">契約体重と、赤・青それぞれの体重も出す</option><option value="none">体重は出さない</option></select></label><label className="mt-3 flex gap-3 rounded-xl bg-amber-50 p-4"><input type="checkbox" checked={entryConfig.published} onChange={(e) => updateEntry('published', e.target.checked)} /><span><b>申し込みを受け付ける</b><br /><span className="text-sm text-slate-600">最初はOFFのまま保存して確認します。内容が正しいと確認できたらONにします。</span></span></label><button disabled={busy} onClick={() => void saveEntry()} className="mt-4 w-full rounded-xl bg-indigo-700 p-4 text-lg font-black text-white disabled:bg-slate-300">入力した募集ページを保存する</button>{message ? <p role="alert" className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 font-bold text-amber-950">{message}</p> : null}</section>

{stepNav}</> : null}

    {step === 3 ? <><section id="step-3" className="mt-6 rounded-2xl border border-violet-200 bg-white p-6 shadow-sm"><StepTitle no={3} title="管理用パスワードを入れる（1回だけ）" done={connectionReady} />{connectionReady && connCheck === 'bad' ? <div className="mt-4 rounded-2xl border-4 border-rose-400 bg-rose-50 p-5 text-center"><p className="text-4xl" aria-hidden="true">⚠️</p><p className="mt-2 text-xl font-black text-rose-900">管理用パスワードが違うようです</p><p className="mt-1 text-slate-700">下の「管理用パスワード」の欄を消して、紙に控えたパスワードを入れ直してください。コピーして貼り付けると打ち間違いがありません。</p></div> : connectionReady && connCheck === 'offline' ? <div className="mt-4 rounded-2xl bg-amber-50 p-5 text-center"><p className="text-xl font-black text-amber-900">サーバーに届きませんでした</p><p className="mt-1 text-slate-700">保存場所URLの打ち間違いか、電波が弱いようです。少し待ってから、もう一度ためしてください。</p></div> : connectionReady && connCheck === 'checking' ? <div className="mt-4 rounded-2xl bg-slate-50 p-5 text-center"><p className="text-lg font-black text-slate-700">接続を確かめています…</p></div> : connectionReady ? <div className="mt-4 rounded-2xl bg-emerald-50 p-5 text-center"><p className="text-4xl" aria-hidden="true">✅</p><p className="mt-2 text-xl font-black text-emerald-900">接続できています</p><p className="mt-1 text-slate-700">ここでは何もしなくて大丈夫です。ステップ4へ進んでください。</p></div> : <div className="mt-4 rounded-2xl bg-violet-50 p-5"><p className="text-lg font-black text-violet-950">管理用パスワードを入れてください</p><p className="mt-2 leading-relaxed text-slate-700">公開したときに、黒い画面に一度だけ出た文字です。紙に控えたものを、下の欄に入れます。</p></div>}
    {connCheck !== 'ok' ? <div className="mt-4 rounded-2xl border-2 border-violet-300 p-4"><label className="block text-lg font-black">管理用パスワード<input type={showKey ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value.trim())} className={input} placeholder="ここに貼り付ける" /></label><label className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} />文字を見えるようにする（打ち間違いの確認用）</label>{!api.trim() ? <label className="mt-4 block font-bold">保存場所URL<input value={api} onChange={(e) => setApi(e.target.value)} className={input} placeholder="https://○○○.workers.dev" /></label> : null}<p className="mt-3 text-sm text-slate-600">他の人へ送らないでください。この端末の中だけに覚えます。</p></div> : null}<details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer font-bold text-slate-700">AI・詳しい人だけが開く接続設定</summary><div className="mt-4 space-y-4"><p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">分からない場合は入力しないでください。間違った文字を入れるとデータを読み込めません。</p><button type="button" onClick={() => void copy('setup', setupPrompt)} className="w-full rounded-xl bg-violet-700 p-3 font-black text-white">{copied === 'setup' ? 'コピーしました ✓' : 'AIへお願いする文章をコピー'}</button><label className="block font-bold">保存場所URL<input value={api} onChange={(e) => setApi(e.target.value)} className={input} placeholder="https://○○○.workers.dev" /><span className="mt-1 block text-sm font-normal text-slate-500">Cloudflareに作った、大会データの保存場所です。</span></label></div></details></section>

{stepNav}</> : null}

    {step === 4 ? <><section id="step-4" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={4} title="申込選手を原本から読み込む" done={fighters.length > 0} /><p className="mt-4 text-lg font-black">申込は、どちらで集めましたか？</p><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setSource('google-form')} aria-pressed={source === 'google-form'} className={'rounded-2xl border-4 p-4 text-left ' + (source === 'google-form' ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white')}><span aria-hidden="true" className="text-3xl">📝</span><b className="mt-1 block text-lg">Googleフォーム</b><span className="text-sm text-slate-600">いつものGoogleフォームで集めた</span></button>
        <button type="button" onClick={() => setSource('entry-page')} aria-pressed={source === 'entry-page'} className={'rounded-2xl border-4 p-4 text-left ' + (source === 'entry-page' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white')}><span aria-hidden="true" className="text-3xl">📣</span><b className="mt-1 block text-lg">この大会の募集ページ</b><span className="text-sm text-slate-600">ステップ2で作ったページで集めた</span></button>
      </div>
      {source === 'google-form' ? <FormImport eventId={normalizedId} disabled={busy || !connectionReady} currentCount={fighters.length} onConfirm={confirmFormImport} /> : null}
      {source === 'entry-page' ? <><p className="mt-4 text-slate-600">ボタンを押すと、募集ページに届いた申込から最新の選手一覧を読み込みます。</p><button disabled={busy || !connectionReady} onClick={() => void loadFighters()} className="mt-3 w-full rounded-xl bg-indigo-700 p-4 text-xl font-black text-white disabled:bg-slate-300">申込選手を読み込む</button></> : null}
      {fighters.length ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-900">✓ {fighters.length}人の選手を使えます</p> : null}
      <details className="mt-4 rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-bold">すでに対戦表のGoogleスプレッドシートがある場合</summary><p className="mt-3 text-sm text-slate-600">対戦表のURLを貼って取り込めます。電話番号・メール・住所が入った申込原本はここへ貼らないでください。</p><input value={sheet} onChange={(e) => setSheet(e.target.value)} className={input} placeholder="https://docs.google.com/spreadsheets/d/…/edit" /><button disabled={busy || errors.length > 0} onClick={() => void importSheet()} className="mt-3 w-full rounded-xl bg-slate-800 p-3 font-bold text-white disabled:bg-slate-300">完成済みの対戦表を取り込む</button></details>
    </section>

{stepNav}</> : null}

    {step === 5 ? <><section id="step-5" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={5} title="赤・青を選び、試合順を決める" done={cardsPublished} /><p className="mt-3 text-slate-600">試合を追加し、赤コーナーと青コーナーを選びます。間違えても、保存する前なら何度でも直せます。</p>{!fighters.length ? <p className="mt-4 rounded-xl bg-amber-50 p-4 font-bold text-amber-900">先に「4. 申込選手を読み込む」を押してください。</p> : null}{fighters.length ? <label className="mt-4 block font-bold">🔍 選手をさがす（名前・ふりがな・所属）<input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例: 山田 / テストジム" /><span className="mt-1 block text-sm font-normal text-slate-500">{query ? shownFighters.length + '人に絞りこみ中' : '全員 ' + fighters.length + '人'}</span></label> : null}<div className="mt-4 space-y-4">{draftMatches.map((match, index) => <article key={match.id} className="rounded-2xl border-2 border-slate-200 p-4"><div className="flex flex-wrap items-center gap-2"><p className="mr-auto text-xl font-black">第 {index + 1} 試合</p><button onClick={() => setDraftMatches((m) => moveDraftMatch(m, index, -1))} disabled={index === 0} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-30">↑ 一つ上へ</button><button onClick={() => setDraftMatches((m) => moveDraftMatch(m, index, 1))} disabled={index === draftMatches.length - 1} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-30">↓ 一つ下へ</button></div><div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]"><label className="font-bold text-rose-700">赤コーナー<select className={input} value={match.redReceipt} onChange={(e) => updateMatch(index, { redReceipt: e.target.value })}><option value="">選手を選ぶ</option>{optionsFor(match.redReceipt)}</select></label><button onClick={() => updateMatch(index, swapDraftCorners(match))} className="rounded-xl bg-slate-800 px-4 py-3 font-black text-white">⇄ 赤青を入れ替える</button><label className="font-bold text-blue-700">青コーナー<select className={input} value={match.blueReceipt} onChange={(e) => updateMatch(index, { blueReceipt: e.target.value })}><option value="">選手を選ぶ</option>{optionsFor(match.blueReceipt)}</select></label></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">階級・クラス<input className={input} value={match.className} onChange={(e) => updateMatch(index, { className: e.target.value })} placeholder="例: キッズ 30kg契約" /></label><label className="text-sm font-bold">ルール<input className={input} value={match.rule} onChange={(e) => updateMatch(index, { rule: e.target.value })} placeholder="例: キックボクシングルール" /></label></div><CompareRow red={byReceipt.get(match.redReceipt)} blue={byReceipt.get(match.blueReceipt)} />{matchNotes[index]?.length ? <ul className="mt-3 space-y-1">{matchNotes[index].map((note) => <li key={note.text} className={'rounded-lg p-2 text-sm font-bold ' + (note.level === 'warn' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700')}>{note.level === 'warn' ? '⚠ ' : 'ℹ '}{note.text}</li>)}</ul> : null}<button onClick={() => { if (window.confirm('第' + (index + 1) + '試合を消します。よろしいですか？（まだ大会画面には反映されません）')) setDraftMatches((matches) => matches.filter((_, i) => i !== index)); }} className="mt-4 text-sm font-bold text-rose-700">この試合を削除</button></article>)}</div><button onClick={addMatch} disabled={!fighters.length} className="mt-4 w-full rounded-xl border-2 border-dashed border-indigo-300 p-4 text-lg font-black text-indigo-800 disabled:opacity-40">＋ 試合を追加</button>{!reviewing ? <button onClick={() => { const errs = validateDraftMatches(draftMatches); if (errs.length) return setMessage(errs[0]); setReviewing(true); }} disabled={busy || !draftMatches.length} className="mt-4 w-full rounded-xl bg-emerald-700 p-4 text-xl font-black text-white disabled:bg-slate-300">反映する前に、全試合を一覧で確認する</button> : <div className="mt-4 rounded-2xl border-4 border-emerald-500 bg-emerald-50 p-4"><p className="text-lg font-black">この{draftMatches.length}試合で大会画面へ反映しますか？</p><ol className="mt-3 space-y-2">{draftMatches.map((match, index) => { const red = byReceipt.get(match.redReceipt); const blue = byReceipt.get(match.blueReceipt); const warns = matchNotes[index]?.filter((n) => n.level === 'warn').length ?? 0; return <li key={match.id} className="rounded-xl bg-white p-3"><b>第{index + 1}試合</b> <span className="font-bold text-rose-700">赤 {red?.fighterName}</span>（{red?.gym || '所属未登録'}） <b>VS</b> <span className="font-bold text-blue-700">青 {blue?.fighterName}</span>（{blue?.gym || '所属未登録'}）{match.className ? ' / ' + match.className : ''}{warns ? <span className="ml-2 rounded bg-amber-200 px-2 text-sm font-bold text-amber-900">⚠ 確認 {warns}件</span> : null}</li>; })}</ol><div className="mt-4 grid grid-cols-[1fr_2fr] gap-3"><button onClick={() => setReviewing(false)} className="rounded-xl border-2 border-slate-300 bg-white p-3 font-black">← もどって直す</button><button onClick={() => void saveMatchCards()} disabled={busy} className="rounded-xl bg-emerald-700 p-3 text-lg font-black text-white disabled:bg-slate-300">この内容で大会画面へ反映</button></div></div>}
    </section>{stepNav}</> : null}

    {step === 6 ? <><section id="step-6" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><StepTitle no={6} title="できあがり。リンクを渡す" done={false} /><div className="mt-4"><CoachIllustration /></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-cyan-50 p-4"><p className="font-black">参加者へ送る</p><p className="mt-1 text-sm text-slate-600">選手が申し込むページです。</p><button onClick={() => void copy('entry', entryUrl)} className="mt-3 w-full rounded-lg bg-cyan-700 p-3 font-bold text-white">{copied === 'entry' ? 'コピーしました ✓' : '募集ページのリンクをコピー'}</button><a href={entryUrl} className="mt-2 block text-center text-sm font-bold text-cyan-800">先に自分で見る</a></div><div className="rounded-xl bg-emerald-50 p-4"><p className="font-black">大会スタッフへ送る</p><p className="mt-1 text-sm text-slate-600">大会当日に使う画面です。</p><button onClick={() => void copy('live', liveUrl)} className="mt-3 w-full rounded-lg bg-emerald-700 p-3 font-bold text-white">{copied === 'live' ? 'コピーしました ✓' : '大会画面のリンクをコピー'}</button><a href={liveUrl} className="mt-2 block text-center text-sm font-bold text-emerald-800">大会当日の画面を見る</a></div></div>
      <div className="mt-6 rounded-xl border border-slate-200 p-4"><p className="font-black">申し込みを保存する</p><p className="mt-1 text-sm text-slate-600">緑は大会運営用です。赤は電話番号などが入るため、大会責任者だけが使います。</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><button onClick={() => void downloadEntries('os')} className="rounded-xl bg-emerald-700 p-3 font-bold text-white">大会運営用名簿を保存</button><button onClick={() => void downloadEntries('full')} className="rounded-xl border border-rose-300 p-3 font-bold text-rose-800">個人情報を含む原本を保存</button></div></div>
    </section>{stepNav}</> : null}

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><button type="button" onClick={() => setAdvanced((v) => !v)} className="font-bold text-slate-700">{advanced ? '− 閉じる' : '＋ 困ったときだけ開く予備の方法'}</button>{advanced ? <div className="mt-4 space-y-3"><p className="rounded-xl bg-amber-50 p-3 text-sm">Googleスプレッドシートが使えない非常時だけ使います。分からない場合は入力せず、AIへ「予備CSVの入れ方を教えて」と送ってください。</p><textarea value={eventCsv} onChange={(e) => setEventCsv(e.target.value)} rows={4} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="大会情報CSV" /><textarea value={matchesCsv} onChange={(e) => setMatchesCsv(e.target.value)} rows={8} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="対戦表CSV（必須）" /><textarea value={musicCsv} onChange={(e) => setMusicCsv(e.target.value)} rows={6} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="入場曲CSV" /><button disabled={busy} onClick={() => void importCsv()} className="w-full rounded-xl bg-slate-800 p-3 font-bold text-white">予備データを取り込む</button></div> : null}</section>

    <aside className="my-8 rounded-2xl bg-slate-900 p-6 text-white"><h2 className="text-xl font-black">分からなくなったら、この文章をAIへ送ってください</h2><pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-sm leading-relaxed">Tournament OSの大会準備画面で止まりました。{`\n`}今あるデータを消さず、公開もせず、次に押す場所を小学生にも分かる日本語で1つずつ教えてください。</pre></aside>
  </div></main>;
}
