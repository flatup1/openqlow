'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { diagnose, entryConfigFromPing, exportSetup, importSetup, isTemplateCopyLink, parsePing, parsePingText, pingUrl, templateCopyLink, type Diagnosis, type Ping } from '../../../core/setupV3.ts';
import { isAppsScriptUrl, publicEntryHash } from '../../../core/publicEntry.ts';
import { formatDateInput } from '../../../core/dateInput.ts';
import { readPrivateEvent } from '../../lib/privateStore.ts';
import { isTitleReal } from '../logic.ts';

const KEY = 'tournament-setup-v3:';
const STEPS = ['ひな形をコピーして、設定を書く', 'URLをはって、つなぐ', '選手に渡すURLを作る'];
/** 作業カードの名前。上の手順の数字（1〜3）とまぜないよう、ア・イ・ウ・エを使う */
const STEP_NAMES = ['準備', 'つなぐ', '渡す'];
const PAGE_NAME = '選手の受付をつくる';
const FALLBACK = 'うまくいきませんでした。もう一度やってみてください。直らないときは、ジムの担当者に連絡してください。';
const SHEET_WINDOW = 'Googleのシートが新しい画面で開きます。このシートは閉じないでください。このページにもどるときは、画面の上にある「' + PAGE_NAME + '」の名前を押します。';
const VIEW_WINDOW = '新しい画面が開きます。見終わったら、画面の上の「' + PAGE_NAME + '」の名前を押してもどります。';
const COPY_FAIL = 'コピーできませんでした。上の四角の中をクリックして、「Ctrl」を押しながら「A」（全部選ぶ）、つづけて「Ctrl」を押しながら「C」（コピー）を押します。スマホのときは、四角の文字を長く押してコピーします。';

/** 全部の入力・ボタン・リンク・summary で同じ、濃くて太い枠。 */
const FOCUS = 'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
const field = 'mt-2 block w-full min-h-14 rounded-xl border-2 border-slate-500 bg-white p-4 text-lg font-medium text-slate-950 placeholder:text-slate-500 focus:border-indigo-700 ' + FOCUS;
const btnBase = 'flex w-full items-center justify-center rounded-2xl px-5 py-3 text-center font-bold text-balance ' + FOCUS;
/** 塗りのボタンは、画面にいつも1つだけ。 */
const btnPrimary = btnBase + ' min-h-14 bg-indigo-700 text-xl text-white';
/** できたあとの見た目（塗らない）。 */
const btnDone = btnBase + ' min-h-14 border-2 border-emerald-700 bg-emerald-50 text-xl text-emerald-950';
/** まだ押せないボタン：点線の枠で、押せるボタンと区別する。 */
const btnOff = btnBase + ' min-h-14 border-2 border-dashed border-slate-600 bg-slate-100 text-xl text-slate-700';
const btnSecondary = btnBase + ' min-h-12 border-2 border-slate-500 bg-white text-lg text-slate-900';
const btnSecondaryOff = btnBase + ' min-h-12 border-2 border-dashed border-slate-600 bg-slate-100 text-lg text-slate-700';
const btnText = btnBase + ' min-h-12 text-lg text-slate-800 underline';
const chipCls = 'inline-flex min-h-10 items-center rounded-lg border-2 border-slate-400 bg-slate-100 px-3 py-1 text-[17px] font-bold text-slate-900';
const NEW_ID_DEFAULT = 'my-tournament';

/** 大会番号を使える形にする（試合の準備の画面と同じ規則）。 */
function normalizeId(raw: string): string {
  const id = raw.normalize('NFKC').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
  return id || NEW_ID_DEFAULT;
}
const hhmm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

type Tone = 'ok' | 'bad' | 'warn' | 'info';
const TONE: Record<Tone, string> = {
  ok: 'border-emerald-700 bg-emerald-50 text-emerald-950',
  bad: 'border-rose-600 bg-rose-50 text-rose-900',
  warn: 'border-amber-500 bg-amber-50 text-amber-950',
  info: 'border-slate-400 bg-slate-50 text-slate-900',
};
const ICON: Record<Tone, string> = { ok: '✓', bad: '!', warn: '⚠', info: 'i' };

type PingError = 'url' | 'access' | 'net' | 'paste-unreadable' | 'paste-wrong';
type Toast = { kind: Tone; text: string };

/** 画面に出してよいのは、日本語で書かれた文だけ。英語や記号だけのエラー文は出さない。 */
function jpMessage(error: unknown, fallback: string): string {
  return error instanceof Error && /[぀-ヿ一-鿿]/.test(error.message) ? error.message : fallback;
}

/** URLを貼った人が、どこを間違えたかを1行で言う。 */
function urlProblem(value: string): string {
  const v = value.trim();
  if (!v || isAppsScriptUrl(v)) return '';
  if (/docs\.google\.com/i.test(v)) return 'これはシートのURLです。「ウェブアプリ」のURL（…/exec で終わるもの）を貼ってください。';
  if (/\/dev(?:[?#]|$)/.test(v)) return 'これはテスト用のURLです。…/exec で終わるものを貼ってください。';
  if (!/^https:\/\//i.test(v)) return 'https:// で始まるURLを貼ってください。';
  if (/script\.google\.com/i.test(v)) return 'URLが最後まで入っていないようです。…/exec で終わるところまで、全部コピーしてください。';
  return 'これは「ウェブアプリ」のURLではないようです。https://script.google.com/… で始まり、/exec で終わるURLを貼ってください。';
}

function Box({ tone, children, role, className = '' }: { tone: Tone; children: ReactNode; role?: 'status' | 'alert'; className?: string }) {
  return <div role={role} className={'flex gap-2 rounded-xl border-2 p-3 sm:gap-3 sm:p-4 ' + TONE[tone] + ' ' + className}>
    <span aria-hidden="true" className="mt-0.5 shrink-0 font-bold">{ICON[tone]}</span>
    <div className="min-w-0 flex-1 space-y-1 sm:space-y-2">{children}</div>
  </div>;
}

function Chip({ children }: { children: ReactNode }) {
  return <span className={chipCls}>{children}</span>;
}

/** 「必須」「なくてもOK」の札。色だけでなく言葉でも見分けられる。 */
function Tag({ children, must = false }: { children: ReactNode; must?: boolean }) {
  return <span className={'ml-1 inline-block rounded-md border-2 px-2 text-[17px] font-bold ' + (must ? 'border-rose-700 bg-rose-50 text-rose-900' : 'border-slate-500 bg-slate-100 text-slate-800')}>{children}</span>;
}

/** 閉じておく説明。見出しの右に「ひらく／とじる」を出す。 */
function Fold({ title, sub, children, openSignal = false, defaultOpen = false, className = '', id, compact = false }: { title: ReactNode; sub?: ReactNode; children: ReactNode; openSignal?: boolean; defaultOpen?: boolean; className?: string; id?: string; compact?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  return <details id={id} open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className={'rounded-2xl border-2 border-slate-300 bg-white ' + className}>
    <summary className={'flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl font-bold [&::-webkit-details-marker]:hidden ' + (compact ? 'min-h-12 px-3 py-1 ' : 'min-h-14 p-4 ') + FOCUS}>
      <span className="min-w-0 flex-1"><span className="block text-balance">{title}</span>{sub ? <span className="block text-[17px] font-medium text-slate-700">{sub}</span> : null}</span>
      <span aria-hidden="true" className="shrink-0 rounded-lg border-2 border-slate-300 bg-white px-3 py-1 text-[17px] font-bold text-slate-800">{open ? '▼ とじる' : '▶ ひらく'}</span>
    </summary>
    <div className={'space-y-3 border-t-2 border-slate-200 ' + (compact ? 'p-3' : 'p-4')}>{children}</div>
  </details>;
}

/** 作業カード。見出しの上に「4つの作業の、3つ目」のような言葉をつけ（上の手順1〜3の数字とまぜない）、いちばん下に「できた」ボタン（この画面だけの目印。塗らない）。 */
function StepCard({ n, title, done, doneAt, onDone, children }: { n: number; title: ReactNode; done: boolean; doneAt?: string; onDone: () => void; children: ReactNode }) {
  return <section className={'rounded-2xl border-2 bg-white p-4 sm:p-5 ' + (done ? 'border-emerald-700' : 'border-slate-300')}>
    <div>
      <p className={'text-[17px] font-bold ' + (done ? 'text-emerald-800' : 'text-slate-800')}>{done ? '✓ できた　' : 'まだ　'}4つの作業の、{n}つ目</p>
      <h3 className="mt-1 text-balance text-xl font-bold">{title}</h3>
    </div>
    <div className="mt-3 space-y-3">{children}</div>
    <button type="button" aria-pressed={done} onClick={onDone} className={'mt-4 ' + (done ? btnDone : btnSecondary)}>{done ? '✓ できた' + (doneAt ? ' ' + doneAt : '') + '（まちがえたときは、もう一度押すと消えます）' : 'できた ✓'}</button>
  </section>;
}

/** 受付の状態。手順2と手順3で同じ言葉・同じ色を使う。 */
function Connection({ diagnosis }: { diagnosis: Diagnosis }) {
  const m = diagnosis.message;
  const message = <p>{diagnosis.ok ? '✓ ' : ''}{m}</p>;
  switch (diagnosis.stage) {
    case 'ready':
      return <Box tone="ok" role="status">{message}</Box>;
    case 'need-open':
      return <Box tone="info" role="status"><p className="font-bold">あと1つで完成です</p>{message}</Box>;
    case 'need-selftest':
      return <Box tone="warn" role="status"><p className="font-bold">あと少しです。もう一度「① 最初の設定」を押します。</p>{message}</Box>;
    case 'old-build':
      return <Box tone="bad" role="status">
        <p className="font-bold">Googleの版が古いです。ジムの担当者に「ひな形が古い版です」と伝えてください。あなたが直す必要はありません。</p>
        <Fold title="ジムの担当者向け"><p>ひな形を新しい版にしてから、もう一度「デプロイ」します。（「デプロイを管理」→ 鉛筆 →「新バージョン」→「デプロイ」でも直ります）</p></Fold>
      </Box>;
    case 'not-setup':
      return <Box tone="bad" role="status"><p className="font-bold">まだ「① 最初の設定」が終わっていないようです</p>{message}</Box>;
    case 'bad-settings': {
      const body = m.replace(/^シートの「設定」タブを直してください。/, '');
      const items = (body || m).split('。').filter(Boolean);
      return <Box tone="bad" role="status">
        <p className="font-bold">シートの「設定」タブに、直すところがあります</p>
        <ul className="space-y-1">{items.map((s) => <li key={s}>✗ {s}。</li>)}</ul>
        <p>直したら、このページの「もう一度確かめる」を押します。</p>
      </Box>;
    }
    default:
      return <Box tone="bad" role="status"><p className="font-bold">Googleの保存場所に、問題があります</p><p>{jpMessage(new Error(m), 'Googleの保存場所がいっぱいかもしれません。ジムの担当者に伝えてください。')}</p></Box>;
  }
}

export default function SetupV3() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [eventId, setEventId] = useState('my-tournament');
  const [endpoint, setEndpoint] = useState('');
  const [templateUrl, setTemplateUrl] = useState('');
  const [tpl, setTpl] = useState<'loading' | 'ok' | 'none'>('loading');
  const [ownerSheet, setOwnerSheet] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [ping, setPing] = useState<Ping | null>(null);
  const [pingError, setPingError] = useState<PingError | null>(null);
  const [checking, setChecking] = useState(false);
  const [pasted, setPasted] = useState('');
  const [ticks, setTicks] = useState([false, false, false, false]);
  const [staffOpen, setStaffOpen] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [resumeNote, setResumeNote] = useState(false);
  const [copied, setCopied] = useState('');
  const [copyFailed, setCopyFailed] = useState('');
  const [fileNote, setFileNote] = useState<Toast | null>(null);
  const [title, setTitle] = useState('');
  const [idFixed, setIdFixed] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [okAt, setOkAt] = useState('');
  const [tickAt, setTickAt] = useState(['', '', '', '']);
  const [copiedAt, setCopiedAt] = useState('');
  const [everCopiedLive, setEverCopiedLive] = useState(false);
  const [otherEvent, setOtherEvent] = useState('');
  /** 「コピーしたURLを貼りつける」ボタンがうまくいかなかったときの一言 */
  const [pasteNote, setPasteNote] = useState('');
  /** 実際にGoogleにつないで「つながった」と確かめたURL（これが今のURLと同じときだけ、試合の準備の画面に緑の「できています」が出る） */
  const [verifiedUrl, setVerifiedUrl] = useState('');
  const downloadedAt = useRef(0);
  const seq = useRef(0);
  const copyTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);
  const urlRef = useRef<HTMLInputElement>(null);
  const liveBoxRef = useRef<HTMLInputElement>(null);
  const lineBoxRef = useRef<HTMLTextAreaElement>(null);
  const stepMounted = useRef(false);
  /** 「貼って確かめる」で入れた文字から読み取った状態か（自動の確かめが失敗しても、消さないため） */
  const fromPaste = useRef(false);

  const say = (kind: Tone, text: string) => {
    window.clearTimeout(toastTimer.current);
    setToast({ kind, text });
    if (kind !== 'bad') toastTimer.current = window.setTimeout(() => setToast(null), 8000);
  };

  useEffect(() => {
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => { if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); };
  }, []);
  useEffect(() => () => { window.clearTimeout(copyTimer.current); window.clearTimeout(toastTimer.current); }, []);
  // 画面の上の名前（タブの名前）を、画面の中の文と同じにする
  useEffect(() => { const before = document.title; document.title = PAGE_NAME; return () => { document.title = before; }; }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('event');
    const id = raw === null ? NEW_ID_DEFAULT : normalizeId(raw);
    if (raw !== null && id !== raw) {
      // 使えない文字が入っていたら、使える形に直して、アドレスも直す（保存データは別の名前に混ざらない）
      try { params.set('event', id); history.replaceState(null, '', location.pathname + '?' + params.toString() + location.hash); } catch { /* アドレスを直せなくても進められる */ }
      setIdFixed(true);
    }
    setEventId(id);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY + id) || 'null');
      if (saved) {
        const s = typeof saved.step === 'number' && saved.step >= 1 && saved.step <= 3 ? saved.step : 1;
        setStep(s); setReached(s); setEndpoint(typeof saved.endpoint === 'string' ? saved.endpoint : '');
        if (saved.verified === true && typeof saved.endpoint === 'string') setVerifiedUrl(saved.endpoint);
        if (Array.isArray(saved.ticks) && saved.ticks.length === 4) setTicks(saved.ticks.map((v: unknown) => v === true));
        if (s > 1) setResumeNote(true);
      }
    } catch { /* 覚えていなくても進められる */ }
    fetch('/template-link.json', { cache: 'no-store' }).then((r) => r.json() as Promise<{ copyUrl?: unknown }>).then((j) => {
      if (typeof j.copyUrl === 'string' && isTemplateCopyLink(j.copyUrl)) { setTemplateUrl(j.copyUrl); setTpl('ok'); } else setTpl('none');
    }).catch(() => setTpl('none'));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY + eventId, JSON.stringify({ step, endpoint, ticks, verified: isAppsScriptUrl(endpoint) && verifiedUrl === endpoint })); setStorageFailed(false); setSavedAt(hhmm()); } catch { setStorageFailed(true); }
  }, [ready, step, eventId, endpoint, ticks, verifiedUrl]);

  // 「いま作っている大会」の名前。このパソコンに保存した大会があれば、その名前を読む（読むだけ。書きません）
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    readPrivateEvent(eventId).then((v) => { if (alive) setTitle(v && isTitleReal(v.title) ? v.title.trim() : ''); }).catch(() => { if (alive) setTitle(''); });
    return () => { alive = false; };
  }, [ready, eventId]);

  /** manual: ボタンを押した / auto: 自動 / poll: 5秒ごとの再確認（一時的な失敗では今の表示を消さない） */
  const check = async (mode: 'manual' | 'auto' | 'poll' = 'manual') => {
    let url: string;
    try { url = pingUrl(endpoint); } catch { if (mode !== 'poll') { setPing(null); if (mode === 'manual') setPingError('url'); } return; }
    const mine = ++seq.current;
    const checked = endpoint;
    setChecking(true);
    try {
      const response = await fetch(url, { cache: 'no-store' });
      const next = parsePing(await response.json());
      if (mine !== seq.current) return;
      fromPaste.current = false;
      setPing(next); setPingError(null); setOkAt(hhmm()); setVerifiedUrl(checked);
    } catch (error) {
      if (mine !== seq.current) return;
      if (mode === 'poll') return;
      setVerifiedUrl('');
      // 貼った文字から読み取った状態は、自動の確かめが失敗しても消さない（自分で押したときだけ消す）
      if (mode === 'auto' && fromPaste.current) return;
      fromPaste.current = false;
      setPing(null);
      setPingError(error instanceof SyntaxError || (error instanceof Error && error.message.includes('Tournament OS')) ? 'access' : 'net');
    } finally {
      if (mine === seq.current) setChecking(false);
    }
  };
  useEffect(() => {
    if (!ready || !isAppsScriptUrl(endpoint)) { fromPaste.current = false; setPing(null); return; }
    const timer = window.setTimeout(() => void check('auto'), 600);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, endpoint]);

  const urlOk = isAppsScriptUrl(endpoint);
  const diagnosis: Diagnosis | null = ping ? diagnose(ping) : null;
  const stage = diagnosis?.stage;
  const blocked = !urlOk || !diagnosis || ['old-build', 'not-setup', 'bad-settings', 'storage-full'].includes(diagnosis.stage);

  // 手順3に入ったら、すぐ確かめる。「受付を開始」を押すまでは5秒ごとに確かめ直す。
  useEffect(() => {
    if (!ready || step !== 3 || !isAppsScriptUrl(endpoint) || fromPaste.current) return;
    void check('auto');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, step]);
  useEffect(() => {
    if (!ready || step !== 3 || stage !== 'need-open' || !isAppsScriptUrl(endpoint)) return;
    const id = window.setInterval(() => void check('poll'), 5000);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, step, stage, endpoint]);

  // 手順が変わったら、上までもどす。
  useEffect(() => {
    if (!stepMounted.current) { stepMounted.current = true; return; }
    window.scrollTo({ top: 0 });
    // キーボードの人も迷わないよう、新しい手順の見出しに目印を移す
    // 手順2でまだURLが空のときは、貼る四角に目印を移す（パソコンのみ。スマホでは画面のキーボードが急に出るので、しない）
    window.setTimeout(() => {
      const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      if (step === 2 && !coarse && urlRef.current && !urlRef.current.value) urlRef.current.focus({ preventScroll: true });
      else document.getElementById('s' + step + '-title')?.focus({ preventScroll: true });
    }, 0);
  }, [step]);

  const stepChangedAt = useRef(0);
  const goStep = (n: number) => {
    // 二度押し対策: 進んだ直後(0.7秒)の「もどる」は無視する（手順が変わると画面が上にもどり、2回目の押しが上の手順ボタンに当たるため）
    if (n < step && Date.now() - stepChangedAt.current < 700) return;
    if (n !== step) stepChangedAt.current = Date.now();
    window.clearTimeout(toastTimer.current);
    setToast(null); setFileNote(null); setResumeNote(false); setIdFixed(false); setCopied(''); setCopyFailed('');
    setStep(n); setReached((r) => Math.max(r, n));
  };
  const canGo = (n: number) => n <= step || (n === 2 && reached >= 2) || (n === 3 && reached >= 2 && !blocked);

  const link = (mode: 'test' | 'live') => { try { return ping ? '/apply/' + publicEntryHash(entryConfigFromPing(ping, endpoint, mode)) : ''; } catch { return ''; } };
  const copy = async (key: string, text: string, done: string) => {
    window.clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(''); setCopied(key); setCopiedAt(hhmm()); if (key === 'live') setEverCopiedLive(true); say('ok', done);
      copyTimer.current = window.setTimeout(() => setCopied(''), 5000);
    } catch {
      setCopied(''); setCopyFailed(key); say('bad', 'コピーできませんでした。' + COPY_FAIL);
      window.setTimeout(() => { const box = key === 'line' ? lineBoxRef.current : liveBoxRef.current; box?.focus(); box?.select(); }, 0);
    }
  };
  const fetchTemplate = async (key: string, path: string, done: string) => {
    try { const r = await fetch(path); if (!r.ok) throw new Error(); await copy(key, await r.text(), done); } catch { say('bad', 'コピーできませんでした。画面を読み込み直して、もう一度押してください。'); }
  };
  const download = () => {
    // 二度押しで、同じファイルが2つできないようにする
    if (Date.now() - downloadedAt.current < 1500) return;
    downloadedAt.current = Date.now();
    try {
      const text = exportSetup({ eventId, endpoint });
      const name = 'tournament-os-setup-' + eventId + '.json';
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
      const note: Toast = { kind: 'ok', text: '設定を書き出しました（' + hhmm() + '）。ファイルの名前は ' + name + ' です。「ダウンロード」のフォルダに入ります。大会の中身はGoogleのシートにあります。個人情報と鍵は入っていません。' };
      setFileNote(note); say('ok', note.text);
    } catch (error) { const text = jpMessage(error, '書き出せませんでした。もう一度「設定を書き出す」を押してください。') + ' 画面の設定は消えていません。'; setFileNote({ kind: 'bad', text }); say('bad', text); }
  };
  const upload = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    const fail = (text: string) => { setFileNote({ kind: 'bad', text }); say('bad', text); };
    try {
      const s = importSetup(await file.text());
      // 別の大会のファイルでは、何も変えない（読み込めたように見せない）
      if (s.eventId !== eventId) { setOtherEvent(s.eventId); fail('別の大会のファイルです。この画面の設定は変えていません。'); return; }
      setOtherEvent('');
      if (s.endpoint === endpoint) { const same: Toast = { kind: 'info', text: 'このファイルは、いまの設定と同じです。何も変えていません。' }; setFileNote(same); say('info', same.text); return; }
      if (endpoint.trim() && !window.confirm('いま入れているURLを、ファイルのURLで上書きします。\n\nいまのURL：' + endpoint.slice(0, 48) + '…\n\nよろしいですか？')) {
        const stop: Toast = { kind: 'info', text: 'やめました。何も変えていません。' }; setFileNote(stop); say('info', stop.text); return;
      }
      setEndpoint(s.endpoint);
      const note: Toast = { kind: 'ok', text: '設定を読み込みました' + (title ? '（' + title + '）' : '') + '（' + hhmm() + '）。上の「いまここ」の手順から続けられます。' };
      setFileNote(note); say('ok', note.text);
    } catch (error) { setOtherEvent(''); fail(jpMessage(error, '読み込めませんでした。書き出したファイル（名前の最後が .json）を選んでください。') + ' この画面の設定は変えていません。'); }
  };
  const ownerCopy = (() => { try { return ownerSheet.trim() ? templateCopyLink(ownerSheet) : ''; } catch { return 'ERR'; } })();
  const jumpToUrl = () => { urlRef.current?.scrollIntoView({ block: 'center' }); urlRef.current?.focus(); };
  /** コピーしたURLを、ボタン1つで入れる。使えないブラウザでは、四角に貼る方法を言葉で伝える（通信はしない） */
  const pasteFromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim().slice(0, 2000);
      if (!text) { setPasteNote('コピーした文字がありません。Googleの画面で「コピー」を押してから、もう一度ここを押します。まだのときは、このページの下の「Googleでの3つの操作」を見ます。'); urlRef.current?.focus(); return; }
      fromPaste.current = false; setEndpoint(text); setPingError(null); setPasteNote(''); urlRef.current?.focus({ preventScroll: true });
    } catch {
      setPasteNote('このボタンでは貼れませんでした。下の四角をクリックして、「Ctrl」を押しながら「V」（貼り付け）を押します。スマホのときは、四角を長く押して「貼り付け」を選びます。');
      urlRef.current?.focus();
    }
  };

  if (!ready) return <main className="tos-read min-h-screen bg-slate-50 p-8 text-lg font-medium text-slate-950 [color-scheme:light]">じゅんびしています…</main>;

  const liveUrl = ping && link('live') ? location.origin + link('live') : '';
  const lineText = liveUrl ? (ping?.title || '大会') + 'の参加申し込みはこちら：' + liveUrl : '';
  const urlReady = !!(diagnosis?.ok && liveUrl);
  // 受付で決めた「書いてもらうこと」も、試合の準備の画面へ渡す（m=入場曲 on/off、g=学年 a=年齢 c=意気込み off/optional/required）
  const rosterHash = (() => {
    if (!ping?.title) return '';
    const h = new URLSearchParams({ t: ping.title, d: ping.date ? formatDateInput(ping.date) : '', v: ping.venue || '' });
    if (typeof ping.music === 'boolean') h.set('m', ping.music ? 'on' : 'off');
    if (ping.grade) h.set('g', ping.grade);
    if (ping.age) h.set('a', ping.age);
    if (ping.comment) h.set('c', ping.comment);
    return '#' + h.toString();
  })();
  const toRoster = '/private/?event=' + encodeURIComponent(eventId) + rosterHash;
  // 上の3つのボタンが、この画面の「ただ1つの」進みぐあい。各ボタンに ✓ できた / ▶ いまここ / まだ の言葉がつく
  const stepBtn = (n: number) => {
    const cur = n === step, done = n < step || (n === 3 && urlReady && step === 3), can = canGo(n);
    return <li key={n}><button type="button" aria-current={cur ? 'step' : undefined} aria-disabled={!can || undefined} onClick={() => { if (!can) { say('info', 'まだ押せません。上の順番どおりに進めます。'); return; } goStep(n); }}
      className={'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-1 text-[17px] font-bold leading-tight ' + FOCUS + ' ' + (cur ? 'border-4 border-indigo-700 bg-indigo-50 text-indigo-950' : done ? 'border-emerald-700 bg-emerald-50 text-emerald-950' : can ? 'border-slate-500 bg-white text-slate-800' : 'border-dashed border-slate-500 bg-white text-slate-700')}>
      <span className="sr-only">手順{n}、{STEP_NAMES[n - 1]}、{cur ? 'いまここ' : done ? 'できた' : can ? 'まだ（押せます）' : 'まだ（まだ押せません）'}</span>
      <span aria-hidden="true" className="flex items-center gap-1">
        <span className={'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[17px] font-bold text-white ' + (cur ? 'bg-indigo-700' : done ? 'bg-emerald-700' : 'bg-slate-600')}>{done && !cur ? '✓' : n}</span>
        <span>{STEP_NAMES[n - 1]}</span>
      </span>
      <span aria-hidden="true">{cur ? '▶ いまここ' : done ? '✓ できた' : 'まだ'}</span>
    </button></li>;
  };

  /** エラーは、原因のすぐそばに出す。見出しは「何が起きたか」、本文は「何をするか」。番号はつけない。 */
  const errorBox = (kind: PingError | null) => {
    if (kind === 'url') return <Box tone="bad" role="alert"><p className="font-bold">URLの形が違います</p><p>…/exec で終わる「ウェブアプリ」のURLを、もう一度コピーして貼ってください。</p></Box>;
    if (kind === 'access') return <Box tone="bad" role="alert"><p className="font-bold">Googleが、まだ「だれでも使える」になっていません</p><p>「デプロイ」の画面で「アクセスできるユーザー」を「全員」にして、もう一度「デプロイ」します。そのあと「もう一度確かめる」を押します。</p></Box>;
    if (kind === 'net') return <Box tone="bad" role="alert"><p className="font-bold">Googleにつながりませんでした</p>
      <p>入れたURLは、そのまま残っています。</p>
      <Fold compact title="だめなとき">
        <p className="font-bold">この4つを見ます。</p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>URLを最後まで全部コピーしたか見ます（…/exec で終わります）。</li>
          <li>「デプロイ」の「アクセスできるユーザー」が「全員」になっているか見ます。</li>
          <li>このパソコンがネットにつながっているか見ます。</li>
          <li>それでもだめなら、下の「自動で確かめられないとき（貼って確かめる）」を開きます。</li>
        </ol>
      </Fold></Box>;
    return null;
  };
  const nextReason = !urlOk ? 'まだ押せません：上の欄にURLを貼ってください。' : !diagnosis ? 'まだ押せません：Googleにつながっていません。少し待っても変わらないときは「もう一度確かめる」を押してください。' : blocked ? 'まだ押せません：上の赤い文字のとおりにシートを直してから、「もう一度確かめる」を押してください。' : '';
  // 塗りのボタンは、その時点で1つだけ
  const cardNow = ticks.findIndex((t) => !t);
  const backHere = 'おわったら、画面の上の「' + PAGE_NAME + '」を押して、ここにもどります。';
  const toggleTick = (i: number) => {
    setTicks((t) => t.map((v, j) => (j === i ? !v : v)));
    setTickAt((t) => t.map((v, j) => (j === i ? (ticks[i] ? '' : hhmm()) : v)));
  };
  const openStaff = () => { setStaffOpen(true); window.setTimeout(() => document.getElementById('staff-only')?.scrollIntoView({ block: 'start' }), 0); };

  /** 自動で確かめられないときの入り口。手順2と手順3の両方に出す（貼った文字を、手順3でも貼り直せるように）。 */
  const pasteFold = <Fold title="自動で確かめられないとき（貼って確かめる）" openSignal={pingError === 'net'}>
    <ol className="list-decimal space-y-2 pl-6">
      <li>下のボタンで、確かめるページを開きます。文字が出ます。</li>
      <li>その文字を、すべてコピーします。</li>
      <li>この画面に戻って、下の欄に貼ります。</li>
    </ol>
    <a aria-disabled={!urlOk} href={urlOk ? endpoint + '?action=ping' : undefined} target="_blank" rel="noreferrer" className={urlOk ? btnSecondary : btnOff + ' pointer-events-none'}>確かめるページを開く</a>
    <p className="text-[17px]">{urlOk ? VIEW_WINDOW : '先に、上の欄にURLを貼ってください。'}</p>
    <div>
      <label htmlFor="pasted" className="block font-bold">出た文字を貼る <Tag>なくてもOK（自動で確かめられるときは、使いません）</Tag></label>
      <textarea id="pasted" className={field + ' h-32'} value={pasted} aria-describedby="pasted-help" spellCheck={false} onChange={(e) => {
        const text = e.target.value; setPasted(text);
        if (!text.trim()) { setPingError(null); return; }
        try { const next = parsePingText(text); fromPaste.current = true; setPing(next); setPingError(null); setOkAt(hhmm()); } catch (error) { fromPaste.current = false; setPing(null); setPingError(error instanceof Error && error.message.includes('貼った文字を読めません') ? 'paste-unreadable' : 'paste-wrong'); }
      }} placeholder='{"app":"tournament-os", …}' />
      {pingError === 'paste-unreadable' ? <Box tone="bad" role="alert" className="mt-2"><p>貼った文字を読めません。確かめるページに出た文字を、すべてコピーして貼ってください。</p></Box> : null}
      {pingError === 'paste-wrong' ? <Box tone="bad" role="alert" className="mt-2"><p>これは、この大会の受付の文字ではありません。「ウェブアプリ」のURLで開いたページの文字を、すべて貼ってください。</p></Box> : null}
      <p id="pasted-help" className="mt-2 text-[17px]">出る文字には、大会の設定と受付の状態だけが入っています。メールアドレスや鍵、申込の内容は入っていません。貼った文字は、読めなくても消えません。</p>
    </div>
  </Fold>;

  const settingRows: ReadonlyArray<readonly [string, string]> = [['大会名', '○○ジム交流大会'], ['開催日', '2027年10月3日'], ['会場', '○○体育館'], ['主催者名', '○○ジム'], ['問い合わせ先', '03-0000-0000'], ['申込締切', '2027年9月20日'], ['入場曲', '「あり」か「なし」（▼から選びます）']];

  return <main className="tos-read min-h-screen bg-indigo-50 px-4 pb-40 pt-5 text-lg font-medium leading-[1.85] text-slate-950 [color-scheme:light] [overflow-wrap:anywhere] [word-break:auto-phrase] sm:px-6">
    <div className="mx-auto max-w-3xl">
      <header className="rounded-2xl border-2 border-slate-300 bg-white p-3 sm:p-6">
        <p className="mb-2 rounded-xl border-2 border-indigo-700 bg-indigo-50 px-3 py-2 text-[17px] font-bold text-indigo-950">いま作っている大会：{title || ping?.title || 'まだ名前なし'}</p>
        <h1 className="text-balance text-2xl font-bold sm:text-3xl"><span aria-hidden="true">🥊 </span>{PAGE_NAME}</h1>
        {step === 1 ? <p className="mt-2">15分くらいで終わります。順番にボタンを押すだけです。</p> : null}
        <p className={'mt-2 rounded-xl border-2 border-slate-300 bg-slate-50 px-3 py-2 text-[17px] font-medium text-slate-900 ' + (step === 2 ? 'hidden sm:block' : '')}><span aria-hidden="true">🔒 </span>入れた文字は、この画面とGoogleの中だけで使います。</p>
      </header>

      <nav aria-label="3つの手順" className="sticky top-0 z-30 -mx-4 mt-3 bg-indigo-50/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <ol className="grid grid-cols-3 gap-2">{[1, 2, 3].map(stepBtn)}</ol>
      </nav>

      <p className="mt-2 rounded-xl border-2 border-indigo-700 bg-indigo-50 px-4 py-1 font-bold text-indigo-950">いまここ {step} / 3：{STEP_NAMES[step - 1]}<span className="hidden sm:inline">（{STEPS[step - 1]}）</span></p>
      {idFixed ? <Box tone="info" role="status" className="mt-3"><p>アドレスの大会番号を、使える形に直しました。</p></Box> : null}
      {resumeNote ? <p className="mt-3 rounded-xl border-2 border-slate-400 bg-white px-4 py-2">✓ 前回の続きから始めました。いまは3つのうち{step}つ目です。</p> : null}
      {storageFailed
        ? <Box tone="warn" role="alert" className="mt-3"><p className="font-bold">! この画面の進みぐあいを、覚えておけません。</p><p>画面を閉じると最初からになります。URLだけ、紙などに控えておいてください。</p></Box>
        : savedAt && step !== 2 ? <p className="mt-1 text-[17px] leading-normal text-slate-800">✓ 進みぐあいを覚えました {savedAt}</p> : null}

      <div className="mt-4 space-y-5">
      {step === 1 ? <section aria-labelledby="s1-title" className="space-y-4 rounded-3xl border-2 border-indigo-700 bg-white p-4 sm:p-6">
        <h2 id="s1-title" tabIndex={-1} className="text-balance text-2xl font-bold">ひな形をコピーして、設定を書く</h2>
        <p>4つの作業をします。1つ終わったら「できた ✓」を押すと、目印がつきます（目印がつくだけです）。</p>
        <Fold title="画面（タブ）の行ったり来たり">
          <p>画面の一番上に並んだ名前を押すと、切りかえられます。このページの名前は「{PAGE_NAME}」です。</p>
          <div aria-hidden="true" className="flex gap-1 overflow-hidden rounded-t-lg border-b-2 border-slate-400 pt-1 text-[17px]">
            <span className="min-w-0 truncate rounded-t-lg border-2 border-b-0 border-indigo-700 bg-indigo-100 px-3 py-1 font-bold">{PAGE_NAME}</span>
            <span className="min-w-0 truncate rounded-t-lg border-2 border-b-0 border-slate-400 bg-white px-3 py-1">○○のコピー（Googleのシート）</span>
          </div>
        </Fold>

        <StepCard n={1} title="コピーを作る" done={ticks[0]} doneAt={tickAt[0]} onDone={() => toggleTick(0)}>
          <p className="text-[17px]">「ひな形」は、見本のGoogleシートのことです。これを自分用にコピーして使います。</p>
          {tpl === 'ok'
            ? <a href={templateUrl} target="_blank" rel="noreferrer" className={cardNow === 0 ? btnPrimary : btnSecondary}>ひな形のコピーを作る（Googleが開きます）</a>
            : tpl === 'loading'
              ? <p>読み込んでいます…</p>
              : <Box tone="info" role="status">
                <p className="text-xl font-bold">準備中です。ジムの担当者に連絡してください。</p>
                <p>「ひな形のリンクがありません」と伝えます。あなたが直す必要はありません。</p>
                <button type="button" onClick={openStaff} className={btnText}>ジムの担当者向けの説明を見る</button>
              </Box>}
          {tpl === 'ok' ? <p className="text-[17px] text-slate-800">{SHEET_WINDOW}</p> : null}
          <p>開いたら「コピーを作成」を押します。名前は、そのままで大丈夫です。</p>
          <p className="font-bold">シートが開いて、一番上に「…のコピー」と出たら、ここは終わりです。</p>
          <Box tone="info">
            <p className="font-bold">開かないときは、この2つを見ます</p>
            <ol className="list-decimal space-y-1 pl-6">
              <li>Googleにログインします。ジムで使っているGoogleのアカウントで大丈夫です。右上の丸いアイコンに自分の名前の文字が出ていれば、ログインできています。</li>
              <li>「履歴を残さない画面（シークレットウィンドウ）」では、この作業はできません。ふつうの画面で開きます。</li>
            </ol>
          </Box>
        </StepCard>

        <StepCard n={2} title="「設定」タブを書く" done={ticks[1]} doneAt={tickAt[1]} onDone={() => toggleTick(1)}>
          <p>コピーしたシートの左下にある <b>「設定」</b> という文字を押します。表が出ます。左の列に項目の名前があります。その<b>すぐ右どなりの空いた四角</b>（下の絵の黄色いところ）に、同じ順番で書きます。</p>
          <div role="img" aria-label="「設定」タブの絵。左の列に項目の名前、すぐ右どなりの空いた四角に書きます。" className="overflow-hidden rounded-xl border-2 border-slate-400 bg-white text-[17px]">
            <p aria-hidden="true" className="bg-slate-100 px-3 py-1 font-bold text-slate-800">見本の絵（ここには書けません）</p>
            {settingRows.map(([k, v]) => <div aria-hidden="true" key={k} className="grid grid-cols-[7.5rem_minmax(0,1fr)] border-t-2 border-slate-300">
              <div className="bg-slate-100 px-3 py-2 font-bold">{k}</div>
              <div className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-slate-800">例）{v}</div>
            </div>)}
          </div>
          <p>全部で7つです。日にちは「2027年10月3日」のように書きます（年は見本です。本当の日にちを書きます）。</p>
          <p>まちがえたり、書き忘れたりしても大丈夫です。次の画面で「ここを直してください」と教えます。</p>
        </StepCard>

        <StepCard n={3} title="メニューを押す" done={ticks[2]} doneAt={tickAt[2]} onDone={() => toggleTick(2)}>
          <Box tone="warn">
            <p className="font-bold">押すと、Googleから「確認されていません」という怖い画面が出ます。壊れていません。</p>
            <p>自分で作ったシートなので、大丈夫です。次の順に押します。</p>
            <p className="flex flex-wrap items-center gap-2"><Chip>「詳細」</Chip><span aria-hidden="true">→</span><Chip>「（安全ではないページ）に移動」</Chip><span aria-hidden="true">→</span><Chip>「許可」</Chip></p>
          </Box>
          <p>シートの上のメニューを、この順に押します。</p>
          <p className="flex flex-wrap items-center gap-2"><Chip>「Tournament OS」</Chip><span aria-hidden="true">→</span><Chip>「① 最初の設定」</Chip></p>
          <p className="text-[17px]">（「Tournament OS」は、Googleの画面のメニューにそう書いてあります。英語のまま押します。）</p>
          <p className="text-[17px]">メニューが出ないときは、ブラウザの丸い矢印（再読み込み）を押して、10秒待ちます。</p>
          <Fold title="Googleの許可画面で、もっと詳しく"><p>自分のアカウントを選びます。そのあと、上の黄色い四角のとおり「詳細」→「（安全ではないページ）に移動」→「許可」の順に押します。</p></Fold>
        </StepCard>

        <StepCard n={4} title="「準備できました」の確認" done={ticks[3]} doneAt={tickAt[3]} onDone={() => toggleTick(3)}>
          <p className="font-bold">Googleの画面に「準備できました」と出たら、ここは終わりです。</p>
          <p>ためしの申し込みが1件、自動で送られます。本物の名簿には入りません。</p>
          <Fold title="うまくいかないとき" defaultOpen>
            <ul className="space-y-3">
              <li>メニュー「Tournament OS」が見えない → ブラウザの丸い矢印（再読み込み）を押して、10秒待ちます。</li>
              <li>Googleの画面に、赤や灰色の四角で文字が出た → その画面を写真にとって、ジムの担当者に送ります。</li>
              <li>「準備できました」を見逃した → 大丈夫です。次の画面で自動で確かめます。</li>
            </ul>
          </Fold>
        </StepCard>

        <div>
          <button type="button" onClick={() => goStep(2)} className={cardNow === 0 && tpl === 'ok' ? btnSecondary : btnPrimary}>「準備できました」と出た → 次へ（次の画面で自動で確かめます）</button>
          <p className="mt-2 text-center text-[17px]">{ticks.every(Boolean) ? '' : 'まだ押していない「できた ✓」があります。'}わからなくても大丈夫です。次の画面で確かめます。</p>
        </div>
      </section> : null}

      {step === 2 ? <section aria-labelledby="s2-title" className="space-y-4 rounded-3xl border-2 border-indigo-700 bg-white p-3 sm:p-6">
        <h2 id="s2-title" tabIndex={-1} className="text-balance text-2xl font-bold">URLをはって、つなぐ</h2>
        {urlOk ? null : <p>Googleでコピーしたウェブアプリの URL を、下の四角に貼ります。まだのときは、下の「Googleでの3つの操作」を見ます。</p>}
        {/* 貼る四角。URLがまだないときは、太い枠と矢印の言葉で「ここ」を見せ、ボタンも1つだけ塗る */}
        <div id="url-box" className={'rounded-2xl p-3 sm:p-4 ' + (urlOk ? 'border-2 border-slate-300 bg-white' : 'border-4 border-indigo-700 bg-indigo-50')}>
          {!urlOk ? <p className="text-balance text-xl font-bold text-indigo-950"><span aria-hidden="true">↓ </span>ここに、コピーしたURLを貼ります</p> : null}
          {!urlOk ? <button type="button" onClick={() => void pasteFromClipboard()} aria-describedby="paste-help" className={btnPrimary + ' mt-3'}>コピーしたURLを貼りつける</button> : null}
          {!urlOk ? <p id="paste-help" role={pasteNote ? 'status' : undefined} className="mt-2 text-[17px]">{pasteNote || 'このボタンを押すか、下の四角に貼ります（「Ctrl」を押しながら「V」）。貼ると、自動で確かめます。'}</p> : null}
          <label htmlFor="endpoint" className={(urlOk ? '' : 'mt-3 ') + 'block text-xl font-bold'}>ウェブアプリのURL <Tag must>必須</Tag></label>
          <input id="endpoint" ref={urlRef} className={field} value={endpoint} aria-invalid={(!urlOk && !!endpoint.trim()) || undefined} aria-describedby="endpoint-example endpoint-state" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false}
            onChange={(e) => { fromPaste.current = false; setEndpoint(e.target.value.trim()); setPingError(null); setPasteNote(''); }} placeholder="https://script.google.com/macros/s/…/exec" />
          {urlOk && pingError ? null : <p id="endpoint-example" className="mt-2 text-[17px]">{urlOk ? '貼ると、自動で確かめます。' : '例：https://script.google.com/macros/s/AKfy…/exec （長い文字です。最後が /exec です）'}</p>}
          <div id="endpoint-state" className="mt-3">
            {!endpoint.trim() ? null
              : !urlOk ? <Box tone="bad" role="alert"><p>{urlProblem(endpoint)}</p></Box>
              : ping ? <Box tone="ok"><p className="text-xl font-bold">✓ URLは正しいです。Googleにつながりました</p>{okAt ? <p className="text-[17px]">できた ✓ {okAt}</p> : null}</Box>
              : pingError === 'url' || pingError === 'access' || pingError === 'net' ? null
              : pingError ? <Box tone="warn"><p>URLの形はOKです。でも、Googleにつながるか確かめられませんでした。入れたURLは残っています。下の説明を見て、「もう一度確かめる」を押してください。</p></Box>
              : <Box tone="info"><p>URLの形はOKです。いまGoogleにつないで確かめています…</p></Box>}
          </div>
          {pingError === 'url' || pingError === 'access' || pingError === 'net' ? <div className="mt-3">{errorBox(pingError)}</div> : null}
        </div>

        {diagnosis ? <Connection diagnosis={diagnosis} /> : null}
        <div>
          <button type="button" aria-disabled={!urlOk || undefined} aria-busy={checking} onClick={() => { if (!urlOk) { jumpToUrl(); return; } void check('manual'); }} className={urlOk ? (blocked ? btnPrimary : btnSecondary) : btnSecondaryOff}>もう一度確かめる</button>
          <p className="mt-2 text-[17px]">{!urlOk ? 'まだ押せません：先に、上の欄にURLを貼ってください。' : checking ? '⏳ 確かめています…（そのままお待ちください）' : pingError === 'net' || pingError === 'access' ? '次は、この「もう一度確かめる」を押します。' : 'シートを直したあとや、表示が変わらないときに押します。'}</p>
        </div>
        {ping ? <section aria-labelledby="readback" className="rounded-2xl border-2 border-slate-300 bg-slate-50 p-4">
          <h3 id="readback" className="text-balance text-xl font-bold">シートから読み取れた内容（まちがいがないか見てください）</h3>
          <dl className="mt-3 grid gap-2">
            {([['大会名', ping.title], ['開催日', ping.date ? formatDateInput(ping.date) : ''], ['会場', ping.venue], ['主催者名', ping.organizer], ['問い合わせ先', ping.contact], ['申込締切', ping.deadline ? formatDateInput(ping.deadline) : '']] as const).map(([k, v]) => <div key={k} className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2">
              <dt className="text-[17px] text-slate-700">{k}</dt>
              {v ? <dd className="break-words text-lg font-bold">{v}</dd> : <dd className="break-words text-lg font-bold text-amber-950">⚠ 未入力：シートの「設定」タブの、{k}のすぐ右どなりの四角に書いてください</dd>}
            </div>)}
          </dl>
          <p className="mt-3">違っていたら、シートの「設定」タブを直して、「もう一度確かめる」を押します。</p>
        </section> : null}

        {/* 長い説明は、URLが入ったら たたむ（失敗の箱と「もう一度確かめる」を、最初の画面に見せるため） */}
        <Fold key={urlOk ? 'folded' : 'open'} defaultOpen={!urlOk} title="Googleでの3つの操作（ア・イ・ウ）" sub={urlOk ? '見直したいときに ひらきます' : 'この順に押して、URLをコピーします'}>
          <p className="text-[17px]"><span aria-hidden="true">🔒 </span>入れた文字は、この画面とGoogleの中だけで使います。</p>
          <p>Googleの画面には「Apps Script」「デプロイ」という名前が出ます。そう書いてあるので、そのまま押します。（デプロイ ＝ みんなが使えるように出すこと）</p>
          <ol className="space-y-3">
            {[
              <>シートの上のメニュー <b>「拡張機能」→「Apps Script」</b> を押す（新しい画面が開きます）</>,
              <>右上の <b>「デプロイ」→「新しいデプロイ」</b> を押す。<b>「種類を選択」の歯車 →「ウェブアプリ」</b> を選ぶ。右下の青い <b>「デプロイ」</b> を押す <span aria-hidden="true" className="ml-1 inline-block rounded bg-blue-600 px-3 text-[17px] font-bold text-white">デプロイ</span>。Googleが「アクセスを承認」と出したら、前の画面（3つ目の作業）と同じように「許可」まで進みます。</>,
              <><b>「ウェブアプリ」のURL</b>（…/exec で終わる長い文字）の <b>「コピー」</b> を押す。コピーしたら、この画面にもどって、下の「貼る四角」に貼ります。</>,
            ].map((content, i) => <li key={i} className="flex items-start gap-3 rounded-2xl border-2 border-slate-300 bg-slate-50 p-4">
              <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-slate-700 text-center text-[17px] font-bold leading-none text-white"><span>操作<br />{i + 1}</span></span>
              <p className="min-w-0 flex-1 pt-2">{content}</p>
            </li>)}
          </ol>
          <p className="font-bold">{backHere}</p>
          <p className="text-[17px]">Googleが英語のときは: Deploy → New deployment → Deploy、Copy</p>
          <p className="text-[17px] font-bold">Googleの画面で、この3つが下のようになっていれば正しいです（最初から選ばれています）</p>
          <p className="flex flex-wrap gap-2"><Chip>種類：ウェブアプリ</Chip><Chip>実行：自分</Chip><Chip>アクセス：全員</Chip></p>
          <Fold title="設定が違っていたら">
            <p>「デプロイ」の画面で、3つの選ぶところを見ます（違っていたら選び直します）。</p>
            <ul className="list-disc space-y-1 pl-6"><li>種類：「ウェブアプリ」</li><li>実行するユーザー：「自分」</li><li>アクセスできるユーザー：「全員」</li></ul>
            <p>「全員」は、申込を送れるという意味です。申込表と写真フォルダが公開されるわけではありません。</p>
          </Fold>
        </Fold>

        {pasteFold}

        <div>
          <button type="button" aria-disabled={blocked || undefined} aria-describedby="next-reason" onClick={() => { if (blocked) { if (!urlOk) jumpToUrl(); return; } goStep(3); }} className={blocked ? btnOff : btnPrimary}>次へ進む</button>
          <p id="next-reason" className="mt-2 text-center text-[17px]">{blocked ? nextReason : '✓ 進めます。つぎは「受付を開始」を押して、選手に渡すURLを作ります。'}</p>
        </div>
        <button type="button" onClick={() => goStep(1)} className={btnText}>← 前へ戻る</button>
        {savedAt && !storageFailed ? <p className="text-center text-[17px] leading-normal text-slate-800">✓ 進みぐあいを覚えました {savedAt}</p> : null}
      </section> : null}

      {step === 3 ? <section aria-labelledby="s3-title" className="space-y-4 rounded-3xl border-2 border-indigo-700 bg-white p-4 sm:p-6">
        <h2 id="s3-title" tabIndex={-1} className="text-balance text-2xl font-bold">選手に渡すURLを作る</h2>
        <section className="rounded-2xl border-2 border-slate-300 bg-slate-50 p-4">
          <p className="font-bold">Googleのシートでこの2つを押します。</p>
          <p className="mt-2 flex flex-wrap items-center gap-2"><Chip>「Tournament OS」</Chip><span aria-hidden="true">→</span><Chip>「② 受付を開始」</Chip></p>
          <p className="mt-2 font-bold">{backHere}</p>
          <p className="mt-2 text-[17px]">もどると、自動で確かめます（5秒ごと）。</p>
        </section>

        {errorBox(pingError === 'paste-unreadable' || pingError === 'paste-wrong' ? null : pingError)}
        {diagnosis ? <Connection diagnosis={diagnosis} /> : !pingError ? <Box tone="info"><p>{urlOk ? '⏳ 確かめています…' : '受付のURLがありません。前の画面でURLを貼ってください。'}</p></Box> : null}
        <button type="button" aria-disabled={!urlOk || undefined} aria-busy={checking} onClick={() => { if (!urlOk) return; void check('manual'); }} className={urlOk ? (urlReady ? btnSecondary : btnPrimary) : btnSecondaryOff}>もう一度確かめる</button>
        {!urlOk ? <p className="-mt-2 text-[17px]">まだ押せません：前の画面でURLを貼ってください。</p> : checking ? <p className="-mt-2 text-[17px]">⏳ 確かめています…（そのままお待ちください）</p> : null}
        {pasteFold}

        <section aria-labelledby="made-url" className="space-y-3 rounded-2xl border-2 border-slate-300 bg-slate-50 p-4">
          <h3 id="made-url" className="text-xl font-bold">選手に渡すURL</h3>
          {urlReady ? <input ref={liveBoxRef} readOnly aria-label="選手に渡すURL" value={liveUrl} onFocus={(e) => e.currentTarget.select()} className={field + ' break-all'} /> : <p>まだありません。受付が始まると、ここに出ます。</p>}
          <button type="button" aria-disabled={!urlReady || undefined} aria-describedby="live-reason" onClick={() => { if (!urlReady) return; void copy('live', liveUrl, '選手に渡すURLをコピーしました。LINEなどに貼って送ります。'); }} className={urlReady ? (everCopiedLive ? btnDone : btnPrimary) : btnOff}>{copied === 'live' ? '✓ コピーしました（もう一度押せます）' : '完成：選手へ渡すURLをコピー'}</button>
          <p id="live-reason" className="text-[17px]">{urlReady ? (copyFailed === 'live' ? COPY_FAIL : copied === 'live' ? '✓ コピーしました ' + copiedAt + '。LINEの文字を入れる場所で、右クリック→「貼り付け」を押します（キーボードなら「Ctrl」を押しながら「V」）。' : 'このURLを、選手にLINEなどで送ります。') : 'まだ押せません：シートで「② 受付を開始」を押してください。'}</p>
          {urlReady ? <>
            <button type="button" onClick={() => void copy('line', lineText, 'LINEで送る文章をコピーしました。')} className={btnSecondary}>{copied === 'line' ? '✓ コピーしました' : 'LINEで送る文章をコピー'}</button>
            <textarea ref={lineBoxRef} readOnly aria-label="LINEで送る文章" value={lineText} rows={3} onFocus={(e) => e.currentTarget.select()} className={field + ' break-all'} />
            {copyFailed === 'line' ? <p className="text-[17px]">{COPY_FAIL}</p> : null}
          </> : null}
        </section>

        {urlReady ? <section className="space-y-3 rounded-2xl border-2 border-emerald-700 bg-emerald-50 p-4 text-emerald-950">
          <h3 className="text-balance text-2xl font-bold">できあがり</h3>
          <p className="text-xl font-bold">✓ 受付のじゅんびができました</p>
          <p className="font-bold">これから、やることは2つです。</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>上の「完成：選手へ渡すURLをコピー」を押して、LINEに貼って、選手に送ります。</li>
            <li>申し込みが集まるまで待ちます（数日かかります）。集まったら、このページをもう一度開いて、いちばん下のボタンで続けます。</li>
          </ol>
          <p className="text-[17px]">このページは、ブラウザの「お気に入り」（ブックマーク）に入れておくと、あとで開きやすいです。</p>
          <div className="space-y-2 rounded-xl border-2 border-emerald-700 bg-white p-3">
            <p className="font-bold">申し込みが集まったあとにすること</p>
            <ol className="list-decimal space-y-1 pl-6">
              <li>Googleのシートを開きます。</li>
              <li>シートの上のメニュー「Tournament OS」→「④ OS用の名簿ZIPを作る」を押します。（ZIP ＝ 申し込みをまとめたファイルのことです。メニューには、そう書いてあります）</li>
              <li>少し待つと、ファイルがパソコンに保存されます（「ダウンロード」というフォルダに入ります）。</li>
              <li>「試合の準備」の画面の、「ファイルを選ぶ」ボタンを押して、そのファイル（名前の最後が .zip）を選びます。</li>
            </ol>
          </div>
          <a href={toRoster} className={everCopiedLive ? btnPrimary : btnSecondary}>申し込みが集まったら：試合の準備の画面へ</a>
        </section> : null}

        <Fold title="任意：本物の申込画面でも、テストしてみる">
          <p>自動テストは済んでいます。選手が見る画面を自分の目で確かめたいときだけ、使ってください。架空の選手を1件送ります（本物の連絡先は使いません）。</p>
          <a aria-disabled={!link('test')} href={link('test') || undefined} target="_blank" rel="noreferrer" className={link('test') ? btnSecondary : btnOff + ' pointer-events-none'}>テスト申込を開く（新しい画面）</a>
          <p className="text-[17px]">{VIEW_WINDOW}</p>
        </Fold>
        <button type="button" onClick={() => goStep(2)} className={btnText}>← 前へ戻る</button>
      </section> : null}

      <Fold title="別のパソコンで続ける" sub="この画面で入れたURLを、ファイルにして持ち運べます">
        <p>この画面が覚えている受付URLだけを書き出します。大会の中身はGoogleのシートにあります。<b>個人情報と鍵は入りません。</b></p>
        <button type="button" onClick={download} className={btnSecondary}>設定を書き出す</button>
        <label className={btnSecondary + ' cursor-pointer focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-700'}>ファイルをえらぶ
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { const input = e.currentTarget; void upload(input).finally(() => { input.value = ''; }); }} />
        </label>
        <p className="text-[17px]">書き出したファイルを、別のパソコンのこの画面で選ぶと、続きから始められます。</p>
        {fileNote ? <Box tone={fileNote.kind} role={fileNote.kind === 'bad' ? 'alert' : 'status'}><p>{fileNote.text}</p>
          {otherEvent ? <a href={'/private/setup/?event=' + encodeURIComponent(otherEvent)} className={btnSecondary}>その大会の画面を開く（{otherEvent}）</a> : null}
        </Box> : null}
      </Fold>

      <details id="staff-only" open={staffOpen} onToggle={(e) => setStaffOpen(e.currentTarget.open)} className="group rounded-2xl border-2 border-slate-300 bg-slate-100">
        <summary className={'flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 text-[17px] font-bold text-slate-800 [&::-webkit-details-marker]:hidden ' + FOCUS}><span className="min-w-0 flex-1 text-balance">ジムの担当者だけ（会長は開かなくて大丈夫です）</span><span aria-hidden="true" className="shrink-0 rounded-lg border-2 border-slate-300 bg-white px-3 py-1">{staffOpen ? '▼ とじる' : '▶ ひらく'}</span></summary>
        <div className="space-y-3 border-t-2 border-slate-300 p-4 text-[17px] leading-relaxed">
          <p className="font-bold">ひな形を用意する（最初の1回だけ）</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>Googleスプレッドシートを新しく作ります。</li>
            <li>「拡張機能」→「Apps Script」を開き、下の「ひな形のプログラムをコピー」でコピーしたものを、全部消して貼り、保存します。</li>
            <li>Apps Scriptの左の歯車「プロジェクトの設定」で「appsscript.json マニフェスト ファイルをエディタで表示する」にチェックを入れ、下の「マニフェスト（appsscript.json）をコピー」でコピーしたものに入れ替えて、保存します（デプロイの「自分／全員」が最初から選ばれます）。</li>
            <li>スプレッドシートの「共有」を、「リンクを知っている全員が閲覧できる」にします（<b>個人情報は入れません</b>。入っているのはプログラムだけです）。</li>
            <li>スプレッドシートのURLを下に貼ると、「コピーを作る」リンクができます。<b>このシートでは「① 最初の設定」を押さないでください。</b></li>
          </ol>
          <button type="button" onClick={() => void fetchTemplate('own-gs', '/templates/Tournament_OS_Google受付_v3.gs', 'ひな形のプログラムをコピーしました。')} className={btnSecondary}>{copied === 'own-gs' ? '✓ コピーしました' : 'ひな形のプログラムをコピー'}</button>
          <button type="button" onClick={() => void fetchTemplate('own-json', '/templates/appsscript.json', 'マニフェストをコピーしました。')} className={btnSecondary}>{copied === 'own-json' ? '✓ コピーしました' : 'マニフェスト（appsscript.json）をコピー'}</button>
          <label className="block font-bold">スプレッドシートのURL <Tag>ジムの担当者だけ</Tag><input className={field} value={ownerSheet} onChange={(e) => setOwnerSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" autoComplete="off" /></label>
          {ownerCopy && ownerCopy !== 'ERR' ? <>
            <p className="break-all rounded-lg border-2 border-slate-300 bg-white p-2">{ownerCopy}</p>
            <button type="button" onClick={() => void copy('own-link', ownerCopy, '「コピーを作る」リンクをコピーしました。public/template-link.json の copyUrl に入れます。')} className={btnSecondary}>{copied === 'own-link' ? '✓ コピーしました' : 'このリンクをコピー'}</button>
            <p>コピーしたら、public/template-link.json の copyUrl に入れます。</p>
          </> : null}
          {ownerCopy === 'ERR' ? <p role="alert" className="font-bold text-rose-800">! スプレッドシートのURL（docs.google.com/spreadsheets/d/…）を貼ってください。</p> : null}
        </div>
      </details>
      </div>
    </div>

    {toast ? <div role={toast.kind === 'bad' ? 'alert' : 'status'} className={'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-3xl items-center gap-3 border-t-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-t-2xl ' + TONE[toast.kind]}>
      <span aria-hidden="true" className="shrink-0 font-bold">{ICON[toast.kind]}</span>
      <p className="min-w-0 flex-1">{toast.text}</p>
      <button type="button" onClick={() => setToast(null)} className={'min-h-12 shrink-0 rounded-xl border-2 border-slate-500 bg-white px-3 text-[17px] font-bold text-slate-900 ' + FOCUS}>✕ とじる</button>
    </div> : null}
  </main>;
}
