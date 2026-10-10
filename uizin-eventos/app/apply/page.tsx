'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { formatDateInput } from '../../core/dateInput.ts';
import { entryErrors, type EntryFighter } from '../../core/entryPackage.ts';
import { EMPTY_PUBLIC_ENTRY_CONFIG, isVenueUrl, publicEntryConfig, publicEntryReady, type PublicEntryConfig } from '../../core/publicEntry.ts';
import { photoToDataUrl } from '../lib/privateStore.ts';

/*
  色と言葉の約束（全画面で同じ。色だけで伝えない）
  黄の濃い塗り tos-next    = 「👉 次はここ」。1つの状態に、最大1つ（data-tos-next）
  薄い黄       tos-caution = 「⚠ 気をつけて」
  赤           tos-error / tos-danger = 「✕ まちがい・取り消せない」
  緑           tos-ok      = 「✓ できた」
  灰の点線     tos-locked  = 「🔒 今は押せない＋理由」
  インディゴ塗り tos-main  = ふつうの主ボタン（1つの状態に1つ）
*/

type Key = 'gym' | 'name' | 'height' | 'weight' | 'record' | 'grade' | 'age' | 'comment' | 'musicUrl' | 'photo' | 'contactName' | 'contactPhone' | 'contactEmail' | 'consent';
type Tone = 'info' | 'ok' | 'warn' | 'error';
type FieldErrors = Partial<Record<Key, string>>;
type Flags = Partial<Record<Key, boolean>>;
type Notes = Partial<Record<Key, string>>;
type Problem = { text: string; early: boolean };
type ContactNow = { name: string; phone: string; email: string };

const SENT_KEY = 'tos-apply-sent-v1';
const SENT_WINDOW_MS = 2 * 60 * 60 * 1000;
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const MUSIC_URL = /^https:\/\/(?:music\.apple\.com|(?:[\w-]+\.)?youtube\.com|youtu\.be)\//;
const EMAIL_FORM = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputBase = 'mt-2 block w-full min-h-14 min-w-0 rounded-2xl border-2 px-4 py-3 text-lg font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-indigo-700 focus:ring-4 focus:ring-indigo-600 disabled:opacity-70';
const blank = (): EntryFighter => ({ id: '', gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '' });
const card = 'mt-5 rounded-3xl border-2 border-slate-300 bg-white p-4 sm:p-7';
const greyBtn = 'min-h-12 rounded-xl border-2 border-slate-500 bg-white px-4 text-base font-bold text-slate-900';
const darkBtn = 'min-h-12 rounded-xl border-2 border-slate-900 bg-white px-4 text-base font-bold text-slate-900';

const SHORT: Record<Key, string> = { gym: 'ジム名', name: '選手名', height: '身長', weight: '体重', record: '戦績', grade: '学年', age: '年齢', comment: '意気込み', musicUrl: '入場曲のリンク', photo: '写真', contactName: 'お名前', contactPhone: '電話番号', contactEmail: 'メールアドレス', consent: '同意のチェック' };
const NEXT_LABEL: Record<Key, string> = { gym: 'ジム名を入れる', name: '選手名を入れる', height: '身長を入れる', weight: '体重を入れる', record: '戦績を入れる', grade: '学年を入れる', age: '年齢を入れる', comment: '意気込みを入れる', musicUrl: '入場曲のリンクを入れる', photo: 'ここを押して写真を選ぶ', contactName: 'お名前を入れる', contactPhone: '電話番号を入れる', contactEmail: 'メールアドレスを入れる', consent: '最後にここにチェック' };
const TEXT_KEYS: Key[] = ['gym', 'name', 'height', 'weight', 'record', 'grade', 'age', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail'];

const nfkc = (value: string) => value.normalize('NFKC');
const noSpace = (value: string) => value.replace(/\s+/g, '');
const trimAll = (value: string) => value.replace(/^[\s　]+|[\s　]+$/g, '');
/** 数字の欄を、数字だけにそろえる。全角・単位・コンマ・「15.0」を自動で直す（この画面の中だけの整形。受付側のルールは変えない）。 */
const cleanNumber = (value: string, units: RegExp) => noSpace(nfkc(value).replace(units, '')).replace(/,/g, '.').replace(/^(\d+)\.0+$/, '$1');
function normalizeFighter(f: EntryFighter): EntryFighter {
  return {
    ...f,
    height: cleanNumber(f.height, /センチメートル|センチ|cm|m/gi),
    weight: cleanNumber(f.weight, /キログラム|キロ|kg/gi),
    age: cleanNumber(f.age, /歳|才|さい/g),
    musicUrl: noSpace(nfkc(f.musicUrl)),
  };
}
/** 電話番号：全角→半角、ハイフン・長音・点・かっこ・空白を外す、+81 は先頭の0にする */
const normalizePhone = (value: string) => nfkc(value).replace(/[\s\u3000\-ー－―‐‑–—−・.．\/／()（）[\]]/g, '').replace(/^\+810?/, '0');
/** メール：全角→半角、空白を外す、先頭の mailto: を外す、末尾の , 。 、 ; を外す */
const normalizeEmail = (value: string) => noSpace(nfkc(value)).replace(/^mailto:/i, '').replace(/[,.;。、]+$/, '');
/** よくある打ちまちがい（.con など）。まちがいと決めつけず、質問にする */
function emailSuspect(email: string): { bad: string; good: string; fixed: string } | null {
  const tail = email.match(/\.(con|cpm|comm|cim|vom|xom)$/i);
  if (tail && email.includes('@')) return { bad: tail[0], good: '.com', fixed: email.slice(0, email.length - tail[0].length) + '.com' };
  if (/@gmail\.co$/i.test(email)) return { bad: 'gmail.co', good: 'gmail.com', fixed: email + 'm' };
  return null;
}
const show = (value: string) => (value.length > 36 ? value.slice(0, 34) + '…' : value);

function newRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseJa(value: string): { y: number; m: number; d: number } | null {
  const m = formatDateInput(value).match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}
const weekday = (p: { y: number; m: number; d: number }) => WEEK[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
function telDigits(contact: string): string {
  const match = contact.normalize('NFKC').match(/0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/);
  return match ? match[0].replace(/\D/g, '') : '';
}

const CORE_KEYS: [string, Key][] = [['ジム名', 'gym'], ['選手名', 'name'], ['身長', 'height'], ['体重', 'weight'], ['戦績', 'record'], ['学年', 'grade'], ['年齢', 'age'], ['試合への意気込み', 'comment'], ['入場曲', 'musicUrl'], ['選手の写真', 'photo']];

function friendly(key: Key): string {
  switch (key) {
    case 'gym': return 'ジム名がまだです。入力してください。';
    case 'name': return '選手名がまだです。入力してください。';
    case 'height': return '身長がまだです。数字だけ入力してください。例：170';
    case 'weight': return '体重がまだです。数字だけ入力してください。例：55';
    case 'record': return '戦績がまだです。初試合なら「初試合」と入力してください。';
    case 'grade': return '学年がまだです。入力してください。例：中2';
    case 'age': return '年齢がまだです。数字だけ入力してください。例：15';
    case 'comment': return '意気込みがまだです。入力してください。';
    case 'musicUrl': return '入場曲のリンクがまだです。Apple MusicかYouTubeのリンクを貼ってください。';
    case 'photo': return '顔写真がまだです。下の「📷 写真をえらぶ」を押します。';
    default: return '入力してください。';
  }
}

/**
 * 1つの欄の「形」のまちがい。空っぽは数えない（空は「足りない所」として別に数える）。
 * early=true は、入力中でもすぐ赤にしてよいもの（長すぎ）。それ以外は、欄を出た時に赤にする。
 */
function problemFor(key: Key, nf: EntryFighter, contact: ContactNow, config: PublicEntryConfig): Problem | null {
  const tooLong = (value: string, max: number): Problem | null => (value.trim().length > max ? { text: `長すぎます（いま${value.trim().length}字／${max}字まで）`, early: true } : null);
  switch (key) {
    case 'gym': return tooLong(nf.gym, 120);
    case 'name': return tooLong(nf.name, 80);
    case 'record': return tooLong(nf.record, 300);
    case 'comment': return config.comment === 'off' ? null : tooLong(nf.comment, 500);
    case 'grade': return config.grade === 'off' ? null : tooLong(nf.grade, 30);
    case 'height':
    case 'weight': {
      const value = nf[key];
      if (!value) return null;
      const label = key === 'height' ? '身長' : '体重';
      const example = key === 'height' ? '170' : '55';
      if (value.length > 10) return { text: `${label}は10文字までです。数字だけ入れます。例：${example}`, early: true };
      if (!/^\d+(\.\d+)?$/.test(value)) return { text: `数字だけを入れます。例：${example}`, early: false };
      const [low, high] = key === 'height' ? [50, 250] : [10, 250];
      const n = Number(value);
      return n < low || n > high ? { text: `${label}は${low}から${high}の間の数字です。例：${example}`, early: false } : null;
    }
    case 'age': {
      const value = nf.age;
      if (config.age === 'off' || !value) return null;
      return /^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 120 ? null : { text: '年齢は1から120の数字だけです。例：15', early: false };
    }
    case 'musicUrl': {
      const value = nf.musicUrl;
      if (!config.music || !value) return null;
      if (value.length > 500) return { text: 'リンクが長すぎます。曲の「共有」からコピーし直してください', early: true };
      if (/spotify/i.test(value)) return { text: 'Spotify は使えません。Apple Music か YouTube で同じ曲を探してください', early: false };
      return MUSIC_URL.test(value) ? null : { text: 'Apple MusicかYouTubeのリンクを貼ってください。例：https://music.apple.com/…', early: false };
    }
    case 'contactName': return tooLong(contact.name, 100);
    case 'contactPhone': {
      const p = contact.phone;
      if (!p) return null;
      if (!/^0\d{9,10}$/.test(p)) return { text: '電話番号は0から始まる10〜11けたです。例：09012345678', early: false };
      // いちばんよくある打ちまちがい：1けた足りない・多い。携帯（050・070・080・090）は、かならず11けた
      if (/^0[5789]0/.test(p) && p.length !== 11) return { text: `携帯の電話番号は11けたです。いま${p.length}けたです。1けた足りないか、多いかもしれません。例：09012345678`, early: false };
      if (/^0(120|800)/.test(p)) return { text: 'フリーダイヤル（0120・0800）は、電話がつながりません。連絡がつく電話番号を入れます。例：09012345678', early: false };
      if (/^(\d)\1+$/.test(p)) return { text: '同じ数字がならんでいます。電話番号をもう一度見ます。例：09012345678', early: false };
      return null;
    }
    case 'contactEmail': {
      const value = contact.email;
      if (!value) return null;
      if (value.length > 200) return { text: `長すぎます（いま${value.length}字／200字まで）`, early: true };
      if (/[^\x00-\x7F]/.test(value)) return { text: '日本語は使えません。半角で入れます。例：name@example.com', early: false };
      return EMAIL_FORM.test(value) ? null : { text: 'メールアドレスの形がちがいます。例：name@example.com', early: false };
    }
    default: return null;
  }
}

/** まとめて全部の欄を調べる。順番と文言のもとは、これまでの確認と同じ。形のまちがいは、欄ごとに具体的な文で上書きする。 */
function validate(nf: EntryFighter, hasPhoto: boolean, config: PublicEntryConfig, contact: { name: string; phone: string; email: string; consent: boolean }, ready: boolean, emailOk: string) {
  const errors: string[] = [];
  const fields: FieldErrors = {};
  const put = (key: Key, text: string) => { if (!fields[key]) fields[key] = text; };
  for (const text of entryErrors(nf, hasPhoto, config)) {
    errors.push(text);
    if (text.startsWith('入力内容が長すぎ')) continue;
    const hit = CORE_KEYS.find(([prefix]) => text.startsWith(prefix));
    if (hit) put(hit[1], friendly(hit[1]));
  }
  for (const key of TEXT_KEYS) {
    const p = problemFor(key, nf, { name: contact.name, phone: contact.phone, email: contact.email }, config);
    if (p) { if (!fields[key]) errors.push(p.text); fields[key] = p.text; }
  }
  if (!contact.name.trim()) { errors.push('連絡先のお名前を入力してください。'); put('contactName', 'お名前がまだです。連絡がつく人の名前を入力してください。'); }
  if (!contact.phone) { errors.push('電話番号を確認してください。'); put('contactPhone', '電話番号がまだです。例：09012345678（ハイフンは、あってもなくてもOKです）'); }
  if (!contact.email) { errors.push('メールアドレスを確認してください。'); put('contactEmail', 'メールアドレスがまだです。例：name@example.com'); }
  else {
    const suspect = emailSuspect(contact.email);
    if (suspect && !fields.contactEmail && emailOk !== contact.email) { errors.push('メールアドレスを確認してください。'); put('contactEmail', `先に答えます：「${suspect.bad}」になっています。下の「直す」か「このまま使う」を押します`); }
  }
  if (!contact.consent) { errors.push('個人情報の取扱いへの同意が必要です。'); put('consent', '同意するときは、四角にチェックを入れてください。'); }
  if (!ready) errors.push('この申し込みページは古くなっています。主催者に、新しいリンクを聞いてください。');
  return { errors, fields };
}

/* ---------- 色と言葉の部品（外部通信なし） ---------- */

/** 「👉 次はここ」の札つき黄色い箱。on=false のときは、同じ大きさの透明な箱になる（画面がずれない） */
function NextBox({ on, label, prefix = '次はここ', float = false, flush = false, id, className = '', children }: { on: boolean; label: string; prefix?: string; float?: boolean; flush?: boolean; id?: string; className?: string; children: ReactNode }) {
  const badge = <span className={'tos-next-badge' + (float ? ' pointer-events-none absolute bottom-full left-3 z-10 mb-[-3px] max-w-[calc(100%-1.5rem)]' : '')}><span aria-hidden="true">👉</span> {prefix}：{label}</span>;
  return <div id={id} data-tos-next={on ? '1' : undefined} className={'relative min-w-0 scroll-mt-24 ' + (flush ? '' : '-mx-[14px] ') + (on ? 'tos-next ' : 'rounded-[14px] border-[3px] border-transparent px-[14px] py-3 ') + className}>
    {on ? (float ? badge : <p className="mb-2">{badge}</p>) : null}
    {children}
  </div>;
}

function Caution({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return <div role="note" className={'tos-caution text-base ' + className}><span aria-hidden="true" className="tos-icon">⚠</span>{title ? <span className="tos-caution-title">{title}：</span> : null}{children}</div>;
}
function ErrorLine({ id, children, className = '', alert = false, big = false }: { id?: string; children: ReactNode; className?: string; alert?: boolean; big?: boolean }) {
  return <p id={id} role={alert ? 'alert' : undefined} className={'tos-error ' + (big ? 'text-xl ' : 'text-base ') + className}><span aria-hidden="true" className="tos-icon">✕</span>{children}</p>;
}
function OkLine({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return <p id={id} className={'tos-ok text-base ' + className}><span aria-hidden="true" className="tos-icon">✓</span>{children}</p>;
}
function LockReason({ children }: { children: ReactNode }) {
  return <p className="tos-locked-reason mt-2"><span aria-hidden="true" className="tos-icon">🔒</span>{children}</p>;
}

/** 画面の中の確認箱。やめる（何も変えない）が左・大きく・最初に選ばれている */
function DangerConfirm({ title, lines, safeLabel, dangerLabel, onSafe, onDanger }: { title: string; lines: string[]; safeLabel: string; dangerLabel: string; onSafe: () => void; onDanger: () => void }) {
  const safeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { safeRef.current?.focus(); }, []);
  return <div role="alertdialog" aria-labelledby="danger-confirm-title" className="tos-confirm mt-4" onKeyDown={(e) => { if (e.key === 'Escape') onSafe(); }}>
    <p id="danger-confirm-title" className="tos-danger text-lg"><span aria-hidden="true" className="tos-icon">✕</span>{title}</p>
    {lines.map((line) => <p key={line} className="tos-danger mt-1 text-base">{line}</p>)}
    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
      <button ref={safeRef} type="button" onClick={onSafe} className="tos-safe-btn w-full text-lg sm:flex-[2]">{safeLabel}</button>
      <button type="button" onClick={onDanger} className="tos-danger-btn w-full text-base sm:flex-1">{dangerLabel}</button>
    </div>
  </div>;
}

function Chip({ children, tone }: { children: ReactNode; tone: 'need' | 'opt' | 'here' | 'done' }) {
  const cls = tone === 'need' ? 'border-2 border-indigo-700 bg-indigo-50 text-indigo-900' : tone === 'opt' ? 'bg-slate-200 text-slate-800' : tone === 'here' ? 'bg-indigo-700 text-white' : 'bg-emerald-700 text-white';
  return <span className={'ml-2 inline-block rounded-full px-2.5 py-0.5 align-middle text-base font-bold leading-normal ' + cls}>{children}</span>;
}

/** 「名前 必須」のような文字を、「必須」の札つきで出す（Field と同じ見た目。札は赤コーナーの赤とまぜないよう、インディゴの枠） */
function LabelText({ label }: { label: string }) {
  const m = label.match(/^(.*?)(\s?)(必須|任意)$/);
  return <>{m ? m[1] : label}{m ? m[2] : ''}{m ? <Chip tone={m[3] === '必須' ? 'need' : 'opt'}>{m[3]}</Chip> : null}</>;
}

function Field({ id, label, hint, example, error, note, next, nextPrefix, extra, children }: { id: string; label: string; hint?: string; example?: string[]; error?: string; note?: string; next?: string; nextPrefix?: string; extra?: ReactNode; children: ReactNode }) {
  const m = label.match(/^(.*?)(\s?)(必須|任意)$/);
  const text = m ? m[1] : label;
  const gap = m ? m[2] : '';
  const badge = m ? m[3] : '';
  return <NextBox on={Boolean(next)} label={next || ''} prefix={nextPrefix} float>
    <div className="flex flex-wrap items-baseline gap-x-2">
      <label htmlFor={id} className="block text-lg font-bold leading-snug [text-wrap:balance]">{text}{gap}{badge ? <Chip tone={badge === '必須' ? 'need' : 'opt'}>{badge}</Chip> : null}</label>
      {badge === '任意' ? <span className="text-base font-bold text-slate-700">（空でもOK）</span> : null}
    </div>
    {hint ? <p id={id + '-hint'} className="mt-1 text-base font-medium leading-relaxed text-slate-700">{hint}</p> : null}
    {example && example.length ? <p id={id + '-ex'} className="tos-example mt-1">例：{example.map((e, i) => <span key={e}>{i ? ' ／ ' : ''}<code>{e}</code></span>)}</p> : null}
    {children}
    {extra}
    {note ? <OkLine id={id + '-note'} className="mt-2">自動で直しました：{note}</OkLine> : null}
    {error ? <ErrorLine id={id + '-err'} className="mt-2"><span className="min-w-0">{error}</span></ErrorLine> : null}
  </NextBox>;
}

function Fold({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return <details id={id} className="group mt-4 scroll-mt-24 rounded-2xl border-2 border-slate-300 bg-white">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 text-lg font-bold"><span className="min-w-0">{title}</span><span aria-hidden="true" className="shrink-0 text-base font-medium text-slate-700"><span className="group-open:hidden">▶ ひらく</span><span className="hidden group-open:inline">▼ とじる</span></span></summary>
    <div className="border-t-2 border-slate-200 p-4 text-lg leading-relaxed">{children}</div>
  </details>;
}

export default function PublicApply() {
  const [config, setConfig] = useState<PublicEntryConfig>(EMPTY_PUBLIC_ENTRY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [fighter, setFighter] = useState<EntryFighter>(blank);
  const [photo, setPhoto] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const photoVersionRef = useRef(0);
  const photoLoadingRef = useRef(false);
  const goodPhotoRef = useRef('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('info');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notes, setNotes] = useState<Notes>({});
  const [touched, setTouched] = useState<Flags>({});
  const [stick, setStick] = useState<Key | null>(null);
  const [emailOk, setEmailOk] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(30);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [recentSent, setRecentSent] = useState(false);
  const [online, setOnline] = useState(true);
  const [pendingHash, setPendingHash] = useState('');
  /** リンクの後ろが切れている（コピーで途中までしか取れなかった）。送っても、あとでGoogleに断られるので、先に止める */
  const [linkCut, setLinkCut] = useState(false);
  /** 送った中身の控え。送ったあとに名前などを変えたら、別の人の申し込みとして、新しい控え番号で送る */
  const sentPayloadRef = useRef('');
  const formRef = useRef<HTMLFormElement>(null);
  const dispatchedRef = useRef(0);
  const sendingRef = useRef(false);
  const reviewingRef = useRef(false);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowLeaveRef = useRef(false);
  const appliedHashRef = useRef('');
  const hasInputRef = useRef(false);
  const todoKeyRef = useRef<Key | null>(null);
  const titleRef = useRef('');

  const say = (text: string, kind: Tone = 'info') => { setMessage(text); setTone(kind); };

  const applyConfig = (next: PublicEntryConfig, hash = '') => {
    setConfig(next);
    // setup 画面が作るリンクには、決まったキーが全部入っている。最後のほうのキーがない・値が読めないなら、途中で切れている
    try {
      const given = new URLSearchParams(hash.replace(/^#/, ''));
      const music = given.get('music'), comment = given.get('comment');
      setLinkCut(hash !== '' && (!given.has('eventId') || !given.has('title') || !given.has('contact') || (music !== 'on' && music !== 'off') || (comment !== 'off' && comment !== 'optional' && comment !== 'required')));
    } catch { setLinkCut(false); }
    titleRef.current = next.title ? next.title + ' 申し込み' : '大会の申し込み';
    document.title = titleRef.current;
    const dl = parseJa(next.deadline);
    if (dl) {
      const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const today = jst.getUTCFullYear() * 10000 + (jst.getUTCMonth() + 1) * 100 + jst.getUTCDate();
      setDeadlinePassed(today > dl.y * 10000 + dl.m * 100 + dl.d);
    } else setDeadlinePassed(false);
    let sentBefore = false;
    try {
      const saved = JSON.parse(localStorage.getItem(SENT_KEY) || 'null') as { eventId?: string; sentAt?: number; mode?: string } | null;
      if (saved && saved.eventId === next.eventId && (saved.mode ?? 'live') === (next.mode ?? 'live') && typeof saved.sentAt === 'number' && Date.now() - saved.sentAt < SENT_WINDOW_MS && Date.now() >= saved.sentAt) sentBefore = true;
    } catch { /* 保存できない画面でも、申し込みはできる */ }
    setRecentSent(sentBefore);
  };

  useEffect(() => {
    appliedHashRef.current = location.hash;
    applyConfig(publicEntryConfig(location.hash), location.hash);
    setLoaded(true);
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => { if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); };
  }, []);
  useEffect(() => {
    // 画面の名前（タブの文字）は、サイト共通の名前に上書きされることがあるので、大会名のほうに戻す
    const watcher = new MutationObserver(() => { if (titleRef.current && document.title !== titleRef.current) document.title = titleRef.current; });
    watcher.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => watcher.disconnect();
  }, []);
  useEffect(() => {
    // 同じタブで、別の大会のリンクに変わった時
    const changed = () => {
      if (location.hash === appliedHashRef.current || sendingRef.current) return;
      if (hasInputRef.current) { setPendingHash(location.hash); return; }
      appliedHashRef.current = location.hash;
      applyConfig(publicEntryConfig(location.hash), location.hash);
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {
    const returned = (event: PageTransitionEvent) => {
      allowLeaveRef.current = false;
      if (!event.persisted || !sendingRef.current) return;
      sendingRef.current = false;
      setSending(false); setConfirmationPending(true);
      say('受付番号の画面が出ましたか？ 出た方は申し込み済みです。出なかった方だけ、下のボタンを押してください。', 'warn');
    };
    window.addEventListener('pageshow', returned);
    return () => {
      window.removeEventListener('pageshow', returned);
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    };
  }, []);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
  useEffect(() => {
    if (sending && requestId && attempt > dispatchedRef.current) {
      dispatchedRef.current = attempt;
      try { localStorage.setItem(SENT_KEY, JSON.stringify({ eventId: config.eventId, sentAt: Date.now(), mode: config.mode ?? 'live' })); } catch { /* 目印が残せなくても送れる */ }
      const form = formRef.current;
      try {
        if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
        else form?.submit();
      } catch {
        if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
        allowLeaveRef.current = false;
        sendingRef.current = false; setSending(false);
        say('失敗：送信できませんでした。Safari か Chrome で開き直してください。', 'error');
      }
    }
  }, [sending, requestId, attempt, config.eventId, config.mode]);
  useEffect(() => {
    // 送っている間、残り秒数を1秒ごとに減らして見せる（30秒の保険タイマーとは別）
    if (!sending) return;
    setWait(30);
    const timer = setInterval(() => setWait((old) => (old > 0 ? old - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [sending]);
  useEffect(() => { reviewingRef.current = reviewing; }, [reviewing]);
  useEffect(() => {
    if (reviewingRef.current) say('内容を直したので、もう一度「入力内容を確認する →」を押してください。', 'warn');
    setReviewing(false);
  }, [fighter, photo, contactName, contactPhone, contactEmail, consent, config]);
  useEffect(() => {
    if (!reviewing) return;
    const heading = reviewHeadingRef.current;
    heading?.scrollIntoView({ block: 'start' });
    heading?.focus({ preventScroll: true });
  }, [reviewing]);

  const nf = useMemo(() => normalizeFighter(fighter), [fighter]);
  const phone = useMemo(() => normalizePhone(contactPhone), [contactPhone]);
  const email = useMemo(() => normalizeEmail(contactEmail), [contactEmail]);
  const payloadKey = JSON.stringify([fighter.gym, fighter.name, fighter.grade, fighter.age, nf.age, nf.height, nf.weight, fighter.record, fighter.comment, nf.musicUrl, contactName, phone, email, photo]);
  const contactNow: ContactNow = { name: contactName, phone, email };
  const hasInput = [fighter.gym, fighter.name, fighter.grade, fighter.age, fighter.height, fighter.weight, fighter.record, fighter.comment, fighter.musicUrl, contactName, contactPhone, contactEmail].some((v) => v.trim()) || Boolean(photo) || consent;
  hasInputRef.current = hasInput;

  useEffect(() => {
    // 入力が1つでもある間、閉じる前に確認を出す（送るときだけ外す）。入力はこの端末に残さない
    if (!hasInput || sending) return;
    const guard = (event: BeforeUnloadEvent) => { if (allowLeaveRef.current) return; event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [hasInput, sending]);

  const clearError = (key: Key) => {
    setFieldErrors((old) => { if (!old[key]) return old; const rest = { ...old }; delete rest[key]; return rest; });
    setNotes((old) => { if (!old[key]) return old; const rest = { ...old }; delete rest[key]; return rest; });
    setTouched((old) => (old[key] ? { ...old, [key]: false } : old));
    if (tone === 'error') setMessage('');
  };
  const change = (key: keyof EntryFighter, value: string) => { setFighter((old) => ({ ...old, [key]: value })); clearError(key as Key); };
  /** 欄を出た時：前後の空白を消す。数字・電話・メール・曲のリンクは自動で直して、直したことを緑で見せる */
  const leave = (key: Key) => {
    setTouched((old) => ({ ...old, [key]: true }));
    const note = (from: string, to: string) => { if (trimAll(from) !== to) setNotes((old) => ({ ...old, [key]: `${show(trimAll(from)) || '（空）'} → ${show(to) || '（空）'}` })); };
    if (key === 'height' || key === 'weight' || key === 'age' || key === 'musicUrl') {
      const next = nf[key];
      if (next !== fighter[key]) { note(fighter[key], next); setFighter((old) => ({ ...old, [key]: next })); }
    } else if (key === 'gym' || key === 'name' || key === 'record' || key === 'grade' || key === 'comment') {
      const next = trimAll(fighter[key]);
      if (next !== fighter[key]) setFighter((old) => ({ ...old, [key]: next }));
    } else if (key === 'contactName') {
      const next = trimAll(contactName);
      if (next !== contactName) setContactName(next);
    } else if (key === 'contactPhone') {
      if (phone !== contactPhone) { note(contactPhone, phone); setContactPhone(phone); }
    } else if (key === 'contactEmail') {
      if (email !== contactEmail) { note(contactEmail, email); setContactEmail(email); }
    }
  };
  const focusField = (key: Key) => {
    document.getElementById(key === 'photo' ? 'f-photo-box' : 'f-' + key)?.scrollIntoView({ block: 'center' });
    document.getElementById('f-' + key)?.focus({ preventScroll: true });
  };
  const focusFirst = (fields: FieldErrors) => {
    const boxes = (Object.keys(fields) as Key[]).map((key) => ({ key, el: document.getElementById(key === 'photo' ? 'f-photo-box' : 'f-' + key) })).filter((x): x is { key: Key; el: HTMLElement } => Boolean(x.el));
    boxes.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (boxes[0]) focusField(boxes[0].key);
  };

  const order: Array<[Key, boolean]> = [['gym', !!fighter.gym.trim()], ['name', !!fighter.name.trim()], ['height', !!nf.height], ['weight', !!nf.weight], ['record', !!fighter.record.trim()],
    ...(config.grade === 'required' ? [['grade', !!fighter.grade.trim()] as [Key, boolean]] : []), ...(config.age === 'required' ? [['age', !!nf.age] as [Key, boolean]] : []), ...(config.comment === 'required' ? [['comment', !!fighter.comment.trim()] as [Key, boolean]] : []),
    ...(config.music ? [['musicUrl', !!nf.musicUrl] as [Key, boolean]] : []), ['photo', !!photo], ['contactName', !!contactName.trim()], ['contactPhone', !!phone], ['contactEmail', !!email], ['consent', consent]];

  const submit = (confirmed = false, resend = false) => {
    if (sendingRef.current) return;
    if (photoLoadingRef.current) { setReviewing(false); say('まだ送れません：写真を準備しています。写真が表示されてから押してください。', 'warn'); return; }
    if (confirmed && !reviewing && !resend) return;
    const { errors, fields } = validate(nf, Boolean(photo), config, { name: contactName, phone, email, consent }, publicEntryReady(config) && !linkCut, emailOk);
    if (errors.length) {
      setReviewing(false);
      setAttempted(true);
      setFieldErrors(fields);
      const missing = order.filter(([key, ok]) => !ok && fields[key]).map(([key]) => key);
      const missingSet = new Set<string>(missing);
      const bad = (Object.keys(fields) as Key[]).filter((key) => !missingSet.has(key));
      const parts: string[] = [];
      if (missing.length) parts.push(`足りない所が${missing.length}か所あります`);
      if (bad.length) parts.push(`直す所：${bad.map((key) => SHORT[key]).join('、')}`);
      say(parts.length ? `まちがい：${parts.join('、')}。「✕」がついた所を、上から直します。` : '失敗：' + errors[0], 'error');
      if (parts.length) focusFirst(fields);
      return;
    }
    setFieldErrors({});
    setAttempted(false);
    if (!confirmed) { setReviewing(true); setMessage(''); return; }
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    // 送ったあとに内容を変えて、もう一度送るときは、別の人の申し込み。同じ控え番号のままだと、Googleに断られて、登録されない
    const sentBefore = sentPayloadRef.current;
    const changedSince = sentBefore !== '' && sentBefore !== payloadKey;
    if (changedSince) setRequestId(crypto.randomUUID?.() || newRequestId());
    else setRequestId((old) => old || crypto.randomUUID?.() || newRequestId());
    sentPayloadRef.current = payloadKey;
    setAttempt((old) => old + 1);
    sendingRef.current = true;
    allowLeaveRef.current = true;
    say('Googleの受付結果画面へ移動します。受付番号が出るまでお待ちください。', 'info');
    setConfirmationPending(false);
    setReviewing(false);
    setSending(true);
    resultTimerRef.current = setTimeout(() => {
      allowLeaveRef.current = false;
      sendingRef.current = false; setSending(false);
      setConfirmationPending(true);
      say('通信に時間がかかっています。Googleの画面が出たら、そのままお待ちください。出ないときだけ、下のボタンを押してください。同じ申込は二重になりません。', 'warn');
    }, 30000);
  };

  const choosePhoto = async (file?: File) => {
    if (!file) return;
    const version = ++photoVersionRef.current;
    photoLoadingRef.current = true;
    setPhotoLoading(true); setPhoto(''); setReviewing(false);
    setPhotoError('');
    clearError('photo');
    try {
      const nextPhoto = await photoToDataUrl(file);
      if (version !== photoVersionRef.current) return;
      goodPhotoRef.current = nextPhoto;
      setPhoto(nextPhoto);
    } catch (error) {
      if (version !== photoVersionRef.current) return;
      const text = error instanceof Error ? error.message : '';
      const name = show(file.name || '');
      const tooBig = text.includes('大きすぎ');
      const notImage = text.includes('画像ファイル');
      const kept = goodPhotoRef.current;
      if (kept) setPhoto(kept);
      setPhotoError(
        (tooBig ? '写真が大きすぎます（20MBまで）。別の写真を選んでください。'
          : notImage ? `これは写真ではありません（${name}）。写真アプリの写真を選びます。`
            : '写真が読み込めませんでした。写真アプリの別の写真を選ぶか、その場でカメラで撮ってください。') + (kept ? ' 前の写真は そのままです。' : ''),
      );
    } finally {
      if (version === photoVersionRef.current) { photoLoadingRef.current = false; setPhotoLoading(false); }
    }
  };

  const endpointReady = publicEntryReady(config) && !linkCut;
  const changedAfterSend = confirmationPending && sentPayloadRef.current !== '' && sentPayloadRef.current !== payloadKey;
  const tel = telDigits(config.contact);
  const dateInfo = parseJa(config.date);
  const dateText = dateInfo ? `${dateInfo.y}年${dateInfo.m}月${dateInfo.d}日（${weekday(dateInfo)}）` : config.date;
  const deadlineInfo = parseJa(config.deadline);
  const deadlineText = deadlineInfo ? `${deadlineInfo.m}月${deadlineInfo.d}日（${weekday(deadlineInfo)}）まで` : config.deadline ? (config.deadline.endsWith('まで') ? config.deadline : config.deadline + 'まで') : '';
  const deadlineShort = deadlineInfo ? `${deadlineInfo.m}月${deadlineInfo.d}日` : config.deadline;
  const deadlineUnclear = Boolean(config.deadline) && !deadlineInfo;

  const infoItems = [fighter.gym.trim(), fighter.name.trim(), nf.height, nf.weight, fighter.record.trim(), photo,
    ...(config.grade === 'required' ? [fighter.grade.trim()] : []), ...(config.age === 'required' ? [nf.age] : []), ...(config.comment === 'required' ? [fighter.comment.trim()] : []), ...(config.music ? [nf.musicUrl] : [])].map(Boolean);
  const contactItems = [contactName.trim(), phone, email, consent ? 'yes' : ''].map(Boolean);
  const filled = [...infoItems, ...contactItems].filter(Boolean).length;
  const total = infoItems.length + contactItems.length;
  const left = total - filled;
  const infoDone = infoItems.every(Boolean);
  const contactDone = contactItems.every(Boolean);
  const stage = reviewing ? 3 : !infoDone ? 1 : !contactDone ? 2 : 3;
  const steps = ['選手の情報', '連絡先', '確認して送る', '完了'];

  // 欄ごとの、いま見せる赤（送ろうとして出た赤、または欄を出た後の形のまちがい）
  const live = (key: Key): string => { const p = problemFor(key, nf, contactNow, config); return p && (p.early || touched[key]) ? p.text : ''; };
  const shown = (key: Key) => fieldErrors[key] || live(key);
  const suspect = emailSuspect(email);
  const emailAsk = Boolean(suspect) && emailOk !== email && !live('contactEmail') && Boolean(touched.contactEmail || fieldErrors.contactEmail);
  const badKeys = TEXT_KEYS.filter((key) => live(key));
  // 「次はここ」は、いつも1つだけ。入っていない欄・直す欄のうち、画面でいちばん上のもの
  const todoKey: Key | null = order.find(([key, ok]) => !ok || shown(key) || (key === 'photo' && photoError && !photo) || (key === 'contactEmail' && emailAsk))?.[0] ?? null;
  todoKeyRef.current = todoKey;
  const firstMissing = order.find(([, ok]) => !ok)?.[0];
  const callFirst = deadlinePassed && Boolean(tel);
  const askNew = Boolean(pendingHash);
  const stickOk = Boolean(stick) && order.some(([key]) => key === stick);
  let nextKind: 'none' | 'field' | 'confirm' | 'resend' | 'send' | 'call' | 'wait' = 'none';
  if (endpointReady && !askNew) {
    if (sending) nextKind = 'wait';
    else if (reviewing) nextKind = callFirst ? 'call' : 'send';
    else if (photoLoading) nextKind = 'none';
    else if (todoKey || stickOk) nextKind = 'field';
    else nextKind = confirmationPending ? 'resend' : 'confirm';
  }
  const markKey: Key | null = nextKind === 'field' ? (stickOk ? stick : todoKey) : null;
  const nextLabel = (key: Key): string => {
    if (key === 'photo') return photoError && !photo ? 'もう一度「📷 写真をえらぶ」を押す' : NEXT_LABEL.photo;
    if (key === 'contactEmail' && emailAsk) return 'メールアドレスの質問に答える';
    const missing = order.find(([k]) => k === key)?.[1] === false;
    return missing ? NEXT_LABEL[key] : `${SHORT[key]}を直す`;
  };
  const prefix = '次はここ';

  const ids = (key: Key, parts: { hint?: boolean; example?: boolean } = {}) => ({
    id: 'f-' + key,
    'aria-invalid': shown(key) ? true : undefined,
    'aria-describedby': [parts.hint ? 'f-' + key + '-hint' : '', parts.example ? 'f-' + key + '-ex' : '', notes[key] ? 'f-' + key + '-note' : '', shown(key) ? 'f-' + key + '-err' : ''].filter(Boolean).join(' ') || undefined,
  });
  const look = (key: Key) => inputBase + (shown(key) ? ' tos-input-error' : ' border-slate-500 bg-white');
  const fieldProps = (key: Key) => ({ error: shown(key) || undefined, note: notes[key], next: markKey === key ? nextLabel(key) : undefined, nextPrefix: prefix });

  const META: Record<'gym' | 'name' | 'height' | 'weight' | 'record' | 'grade' | 'age' | 'comment' | 'musicUrl' | 'contactName' | 'contactPhone' | 'contactEmail', { hint: string; example: string[] }> = {
    gym: { hint: '通っているジムの名前です。', example: ['フラットアップジム'] },
    name: { hint: '試合で呼ばれる名前です。本名でも、あだ名でもOK', example: ['山田 太郎'] },
    height: { hint: '数字だけ入れます。「cm」は書かなくてもOK', example: ['170'] },
    weight: { hint: '試合に出る体重（kg）です', example: ['55'] },
    record: { hint: '試合の成績です。はじめてなら「初試合」と書きます', example: ['初試合', '3勝1敗', '空手3年'] },
    grade: { hint: '30文字までです', example: ['中2', '高1', '社会人'] },
    age: { hint: '数字だけ入れます', example: ['15'] },
    comment: { hint: config.comment === 'required' ? '試合で紹介される一言です。必ず書いてください。' : '試合で紹介される一言です。書かなくても大丈夫です。', example: ['全力でがんばります'] },
    musicUrl: { hint: 'Apple Music か YouTube の、曲のリンクを貼ってください。', example: ['https://music.apple.com/…'] },
    contactName: { hint: '連絡がつく人の名前（本人か保護者）', example: ['山田 花子'] },
    contactPhone: { hint: 'ハイフンは、あってもなくても大丈夫です。数字は全角でもOK', example: ['09012345678'] },
    contactEmail: { hint: 'お持ちでなければ、保護者の方のメールアドレスで大丈夫です', example: ['name@example.com'] },
  };

  const fighterField = (key: 'gym' | 'name' | 'height' | 'weight' | 'record' | 'grade' | 'age', label: string, extraNode?: ReactNode, inputMode?: 'decimal' | 'numeric') =>
    <Field key={key} id={'f-' + key} label={label} hint={META[key].hint} example={META[key].example} extra={extraNode} {...fieldProps(key)}>
      <input {...ids(key, { hint: true, example: true })} className={look(key)} value={fighter[key]} placeholder={key === 'record' ? '初試合' : undefined} inputMode={inputMode} autoComplete="off" enterKeyHint="next" onChange={(e) => change(key, e.target.value)} onBlur={() => leave(key)} />
    </Field>;
  const gradeField = () => fighterField('grade', '学年 ' + (config.grade === 'required' ? '必須' : '任意'));
  const ageField = () => fighterField('age', '年齢 ' + (config.age === 'required' ? '必須' : '任意'), undefined, 'numeric');
  const commentLeft = 500 - fighter.comment.trim().length;
  const commentField = () => <Field key="comment" id="f-comment" label={'意気込み ' + (config.comment === 'required' ? '必須' : '任意')} hint={META.comment.hint} example={META.comment.example} {...fieldProps('comment')}
    extra={<><p className="mt-2 text-base font-bold text-slate-700">{commentLeft >= 0 ? `あと${commentLeft}文字（500文字まで）` : ''}</p><Caution className="mt-2">会場の画面に出ます。住所や電話番号は書かない</Caution></>}>
    <textarea {...ids('comment', { hint: true, example: true })} rows={3} className={look('comment')} value={fighter.comment} autoComplete="off" onChange={(e) => change('comment', e.target.value)} onBlur={() => leave('comment')} />
  </Field>;
  const requiredExtra = [config.grade === 'required' ? gradeField() : null, config.age === 'required' ? ageField() : null, config.comment === 'required' ? commentField() : null];
  const optionalExtra = [config.grade === 'optional' ? gradeField() : null, config.age === 'optional' ? ageField() : null, config.comment === 'optional' ? commentField() : null].filter(Boolean);

  const telLink = tel ? <a href={'tel:' + tel} className="inline-flex min-h-12 items-center font-bold text-indigo-800 underline underline-offset-4">📞 主催者に電話する（{tel}）</a> : null;
  const noContactText = config.contact ? '連絡先：' + config.contact : '連絡先がありません。リンクをくれた人に聞いてください';
  const fix = (key: Key) => { setReviewing(false); say('ここを直したら、一番下の「入力内容を確認する →」をもう一度押してください。', 'warn'); focusField(key); };
  const fixContact = () => {
    setReviewing(false);
    say('ここを直したら、一番下の「入力内容を確認する →」をもう一度押してください。', 'warn');
    document.getElementById('contact-fields')?.scrollIntoView({ block: 'start' });
    document.getElementById('f-contactName')?.focus({ preventScroll: true });
  };
  const openPrivacy = () => {
    const box = document.getElementById('privacy-fold') as HTMLDetailsElement | null;
    if (!box) return;
    box.open = true;
    box.scrollIntoView({ block: 'center' });
  };

  const resetAll = () => {
    photoVersionRef.current += 1;
    photoLoadingRef.current = false;
    goodPhotoRef.current = '';
    setFighter(blank()); setPhoto(''); setPhotoLoading(false); setPhotoError('');
    setContactName(''); setContactPhone(''); setContactEmail(''); setConsent(false);
    setFieldErrors({}); setNotes({}); setTouched({}); setEmailOk(''); setAttempted(false);
    setRequestId(''); setConfirmationPending(false); setReviewing(false); setMessage('');
    sentPayloadRef.current = '';
  };
  const startNew = () => {
    const hash = pendingHash;
    resetAll();
    appliedHashRef.current = hash;
    setPendingHash('');
    applyConfig(publicEntryConfig(hash), hash);
    window.scrollTo({ top: 0 });
  };

  const onFieldsKeyDown = (e: ReactKeyboardEvent<HTMLFieldSetElement>) => {
    if (e.key !== 'Enter' || (e.nativeEvent as KeyboardEvent).isComposing || e.keyCode === 229) return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || ['checkbox', 'file', 'button', 'submit'].includes(el.type)) return;
    e.preventDefault();
    const list = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input:not([type=file]):not([type=checkbox]):not([type=hidden]), textarea'));
    const i = list.indexOf(el);
    if (i >= 0 && i < list.length - 1) list[i + 1].focus();
    else submit();
  };
  const onFieldsFocus = (e: { target: EventTarget }) => {
    const id = (e.target as HTMLElement).id || '';
    const key = id.startsWith('f-') ? (id.slice(2) as Key) : null;
    setStick(key && TEXT_KEYS.includes(key) && key === todoKeyRef.current ? key : null);
  };

  if (!loaded) return <main className="min-h-screen bg-slate-50 px-4 py-10 text-lg font-medium text-slate-950 [color-scheme:light]"><p className="mx-auto max-w-3xl text-center text-slate-700">よみこみ中…</p></main>;

  const isTest = config.mode === 'test';
  const locked = sending || photoLoading || !endpointReady;
  const lockReason = !endpointReady ? '今は押せません：このリンクは使えません' : sending ? '送信中は押せません' : photoLoading ? '写真ができるまで待ちます' : '';
  const statusLabel = !endpointReady ? '' : isTest ? 'テスト用画面（本番ではありません）' : deadlinePassed ? '締切を過ぎています' : '申し込み受付中';
  const msgBox = tone === 'error' ? 'tos-error' : tone === 'ok' ? 'tos-ok' : tone === 'warn' ? 'tos-caution' : 'rounded-xl border-2 border-slate-500 bg-white';
  const msgIcon = tone === 'error' ? '✕' : tone === 'ok' ? '✓' : tone === 'warn' ? '⚠' : 'ℹ';
  const stepLine = <span aria-hidden="true">👉</span>;
  const showRow = (value: string) => endpointReady || Boolean(value);

  return <main className="min-h-screen bg-slate-50 px-4 py-4 text-lg font-medium leading-relaxed text-slate-950 [color-scheme:light] sm:py-10 [min-height:100dvh]"><div className="mx-auto w-full max-w-3xl overflow-x-clip [overflow-wrap:anywhere] [word-break:auto-phrase]">
    <header className="rounded-3xl bg-slate-900 p-4 text-white sm:p-8">
      <div className="flex items-center justify-between gap-3">{statusLabel ? <p className={'rounded-full px-3 py-1 text-base font-bold ' + (isTest || deadlinePassed ? 'bg-red-100 text-red-900' : 'bg-white/15')}>{isTest || deadlinePassed ? <span aria-hidden="true" className="tos-icon">✕</span> : null}{statusLabel}</p> : <span />}<p aria-hidden="true" className="text-3xl">🥊</p></div>
      <h1 className="mt-3 text-2xl font-black leading-tight [text-wrap:balance] sm:text-4xl">{config.title || '大会の申し込み'}</h1>
      <p className="mt-1 text-base font-bold text-slate-200">{config.organizer ? '主催：' + config.organizer : '選手のみなさん、申し込みを待っています'}{endpointReady ? '（約3分で終わります）' : ''}</p>
      {endpointReady || config.date || config.venue || config.deadline ? <dl className="mt-3 divide-y divide-white/20 rounded-2xl bg-white/10 px-3">
        {showRow(config.date) ? <div className="flex min-h-12 items-center gap-3 py-1.5"><dt className="w-20 shrink-0 text-base text-slate-200">開催日</dt><dd className="min-w-0 text-lg font-bold">{dateText || '未定'}</dd></div> : null}
        {showRow(config.venue) ? <div className="flex min-h-12 items-center gap-3 py-1.5"><dt className="w-20 shrink-0 text-base text-slate-200">会場</dt><dd className="min-w-0 text-lg font-bold">{isVenueUrl(config.venueUrl) ? <a href={config.venueUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">{config.venue || '地図を開く'} ↗</a> : config.venue || '未定'}</dd></div> : null}
        {showRow(config.deadline) ? <div className="flex min-h-12 items-center gap-3 py-1.5"><dt className="w-20 shrink-0 text-base text-slate-200">申込締切</dt><dd className="min-w-0 text-lg font-bold">{deadlineText ? <span className={'inline-block rounded-full px-3 py-0.5 ' + (deadlinePassed ? 'bg-red-100 text-red-900' : 'bg-white text-slate-950')}>{deadlinePassed ? <span aria-hidden="true" className="tos-icon">✕</span> : null}<span aria-hidden="true" className="tos-icon">⏰</span>申込は{deadlineText}</span> : '未定'}</dd></div> : null}
      </dl> : null}
    </header>

    {!endpointReady ? <div className="mt-4"><ErrorLine alert big><span>このページでは申し込めません</span><span className="mt-2 block text-base">理由：リンクが古いか、壊れています</span><span className="mt-1 block text-base">やること：主催者に「新しいリンクをください」と言う</span></ErrorLine>
      <p className="mt-3 font-bold">{telLink || noContactText}</p></div> : null}
    {endpointReady && isTest ? <ErrorLine big className="mt-4">これはテストです。ここから送っても、大会には届きません</ErrorLine> : null}
    {endpointReady && deadlinePassed ? <ErrorLine className="mt-4">申込の締切は過ぎています（{deadlineShort}まで）</ErrorLine> : null}
    {endpointReady && deadlineUnclear && !deadlinePassed ? <Caution className="mt-4">申込の締切は「{config.deadline}」です。過ぎていないか、確かめてください</Caution> : null}
    {recentSent ? <div className="tos-ok mt-4"><p><span aria-hidden="true" className="tos-icon">✓</span>さっき、申し込みを送りました。受付番号の画面が出た方は、もう申し込み済みです。</p><p className="tos-danger mt-1"><span aria-hidden="true" className="tos-icon">✕</span>同じ人の申込を2回しないでください</p><details className="mt-2"><summary className="flex min-h-12 cursor-pointer items-center text-base underline underline-offset-4">別の選手を申し込む</summary><button type="button" onClick={() => setRecentSent(false)} className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-500 bg-white px-4 text-lg font-bold text-slate-900">この表示を消して、別の選手を申し込む</button></details></div> : null}
    {askNew ? <>
      <Caution className="mt-4">別の大会のリンクです。入力を消して新しく始めますか？</Caution>
      <DangerConfirm title="消えます：いま入れた内容" lines={['選手の情報・写真・連絡先が、ぜんぶ消えます', '消したあとは、元にもどせません']} safeLabel="今のまま続ける" dangerLabel="消して新しく始める" onSafe={() => setPendingHash('')} onDanger={startNew} />
    </> : null}
    {endpointReady ? <Caution title="気をつけて" className="mt-4"><ul className="mt-1 list-disc space-y-1 pl-6"><li>送るまで終わりではありません。最後に「この内容で送信する」を押します。</li><li>途中でページを閉じたり、更新すると、入力は消えます。</li></ul></Caution> : null}

    {endpointReady ? <ol aria-label="申し込みの流れ" className="mt-4 grid grid-cols-4 gap-2">{steps.map((name, i) => { const n = i + 1; const state = n < stage ? 'done' : n === stage ? 'here' : 'later'; return <li key={name} aria-current={state === 'here' ? 'step' : undefined} className={'flex min-h-16 min-w-0 flex-col items-center rounded-2xl border-2 px-1 py-2 text-center text-base font-bold leading-tight ' + (state === 'here' ? 'border-indigo-700 bg-indigo-50 text-indigo-950' : state === 'done' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700')}><span aria-hidden="true" className={'grid h-7 w-7 place-items-center rounded-full text-base ' + (state === 'here' ? 'bg-indigo-700 text-white' : state === 'done' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700')}>{state === 'done' ? '✓' : n}</span><span className="mt-1 block min-w-0">{name}</span>{state === 'here' ? <><span className="sr-only">（いまここ）</span><span aria-hidden="true" className="mt-1 hidden whitespace-nowrap rounded-full bg-indigo-700 px-2 text-base text-white sm:inline">👉 いまここ</span></> : null}</li>; })}</ol> : null}
    {endpointReady ? <p className="mt-2 rounded-xl border-2 border-indigo-700 bg-white px-3 py-2 text-base font-bold text-indigo-950 sm:hidden">{stepLine} いまここ：{stage} / 4　{steps[stage - 1]}</p> : null}
    {endpointReady ? <p className="mt-2 text-base text-slate-700">「4 完了」は、Googleの画面で受付番号が出たときです。</p> : null}
    {message && !sending ? <div role={tone === 'error' ? 'alert' : 'status'} className={'sticky top-2 z-20 mt-4 text-lg font-bold shadow ' + msgBox + (tone === 'info' ? ' p-4' : '')}><div className="flex flex-col items-start gap-2"><div className="min-w-0 flex-1"><p><span aria-hidden="true" className="tos-icon">{msgIcon}</span>{message}</p>{confirmationPending && telLink ? <p className="mt-1">{telLink}</p> : null}</div><button type="button" onClick={() => setMessage('')} className="min-h-12 shrink-0 self-end rounded-xl border-2 border-current bg-white px-3 text-base font-bold text-slate-900">✕ とじる</button></div></div> : null}
    <fieldset disabled={sending || !endpointReady} onKeyDown={onFieldsKeyDown} onFocus={onFieldsFocus} onBlur={() => setStick(null)} className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">選手の申し込み</legend>
      <section className={card} hidden={!endpointReady}>
        <h2 className="flex items-center gap-3 text-2xl font-black"><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-700 text-xl text-white">1</span>選手の情報</h2>
        <p className="mt-3 text-base text-slate-700">「必須」のところは、ぜんぶ入れてください。</p>
        <div className="mt-8 grid gap-8">
          {fighterField('gym', 'ジム名 必須')}
          {fighterField('name', '選手名 必須', <Caution className="mt-2">保護者の名前ではなく、出る人の名前</Caution>)}
          {fighterField('height', '身長（cm）必須', undefined, 'decimal')}
          {fighterField('weight', '体重（kg）必須', <Caution className="mt-2">試合に出る体重です（わからない時は、今の体重）</Caution>, 'decimal')}
          {fighterField('record', '戦績 必須', fighter.record.trim() === 'なし' ? <Caution className="mt-2">初試合なら「初試合」と書いてください</Caution> : undefined)}
          {requiredExtra}
          {config.music ? <Field id="f-musicUrl" label="入場曲のリンク 必須" hint={META.musicUrl.hint} example={META.musicUrl.example} extra={<Caution className="mt-2">曲のアプリで「共有」→「リンクをコピー」</Caution>} {...fieldProps('musicUrl')}><input {...ids('musicUrl', { hint: true, example: true })} className={look('musicUrl')} value={fighter.musicUrl} placeholder="Apple Music または YouTube" inputMode="url" autoComplete="off" enterKeyHint="next" onChange={(e) => change('musicUrl', e.target.value)} onBlur={() => leave('musicUrl')} /></Field> : null}
        </div>
        <div id="f-photo-box" className={'mt-8 scroll-mt-24 rounded-3xl p-4 focus-within:ring-4 focus-within:ring-indigo-600 ' + (photo ? 'border-2 border-dashed border-emerald-600 bg-emerald-50' : photoError || fieldErrors.photo ? 'border-[3px] border-solid border-red-700 bg-white' : 'border-2 border-dashed border-slate-500 bg-white')}>
          <h3 className="text-lg font-bold leading-snug"><LabelText label="顔写真 必須" /></h3>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-base font-medium text-slate-800"><li>顔が正面から見える</li><li>明るい場所で撮る</li><li>ひとりだけ写っている</li><li>帽子やサングラスはなし</li></ul>
          <Caution title="写真が選べないとき" className="mt-3"><ol className="mt-1 list-decimal space-y-1 pl-6"><li>右上の「…」を押す</li><li>「他のブラウザで開く」を押す</li><li>この画面にもどる</li></ol><span className="mt-1 block">※ 開き直すと、入力は消えます。</span></Caution>
          {photoLoading ? <p className="mt-3 font-bold text-slate-800">⏳ 写真を準備しています。少しお待ちください。</p> : null}
          {photo ? <div className="mt-3 text-center"><OkLine className="text-left">写真OK</OkLine><img src={photo} alt="選んだ写真" className="mx-auto mt-2 h-56 w-44 max-w-full rounded-2xl bg-white object-contain" /></div> : null}
          <NextBox on={markKey === 'photo'} label={nextLabel('photo')} prefix={prefix} float className="mt-8">
            <label htmlFor="f-photo" aria-disabled={photoLoading ? true : undefined} onClick={(e) => { if (photoLoading) e.preventDefault(); }} className={'flex min-h-14 items-center justify-center rounded-2xl px-4 py-3 text-center text-lg ' + (photoLoading ? 'tos-locked font-black' : photo ? 'tos-safe-btn' : 'tos-main')}>{photo ? '写真をえらびなおす' : '📷 写真をえらぶ（撮る・アルバムから）'}</label>
            {photoLoading ? <LockReason>写真ができるまで待ちます</LockReason> : null}
            <input id="f-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-describedby={photoError || fieldErrors.photo ? 'f-photo-err' : undefined} onChange={(e) => { const input = e.currentTarget; const file = input.files?.[0]; void choosePhoto(file).finally(() => { input.value = ''; }); }} />
          </NextBox>
          {photoError || fieldErrors.photo ? <ErrorLine id="f-photo-err" className="mt-2"><span className="min-w-0">{photoError || fieldErrors.photo}</span></ErrorLine> : null}
        </div>
        {optionalExtra.length ? <><h3 className="mt-6 border-t-2 border-slate-200 pt-4 text-lg font-bold text-slate-700">書かなくてもOK（任意）</h3><div className="mt-8 grid gap-8">{optionalExtra}</div></> : null}
      </section>
      <section className={card} hidden={!endpointReady}>
        <h2 className="flex items-center gap-3 text-2xl font-black"><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-700 text-xl text-white">2</span>連絡先</h2>
        <p className="mt-3 rounded-2xl border-2 border-slate-300 bg-white p-3 text-base font-bold text-slate-800">🔒 主催者からの連絡だけに使います。入力した内容は、この申込サイトには残りません。主催者のGoogleの表にだけ保存されます。</p>
        <div id="contact-fields" className="mt-8 grid scroll-mt-24 gap-8">
          <Field id="f-contactName" label="連絡先のお名前 必須" hint={META.contactName.hint} example={META.contactName.example} {...fieldProps('contactName')}><input {...ids('contactName', { hint: true, example: true })} className={look('contactName')} value={contactName} autoComplete="name" enterKeyHint="next" onChange={(e) => { setContactName(e.target.value); clearError('contactName'); }} onBlur={() => leave('contactName')} /></Field>
          <Field id="f-contactPhone" label="電話番号 必須" hint={META.contactPhone.hint} example={META.contactPhone.example} {...fieldProps('contactPhone')}><input {...ids('contactPhone', { hint: true, example: true })} className={look('contactPhone')} type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" value={contactPhone} onChange={(e) => { setContactPhone(e.target.value); clearError('contactPhone'); }} onBlur={() => leave('contactPhone')} /></Field>
          <Field id="f-contactEmail" label="メールアドレス 必須" hint={META.contactEmail.hint} example={META.contactEmail.example} {...fieldProps('contactEmail')}
            extra={emailAsk && suspect ? <Caution className="mt-2"><span className="block">「{suspect.bad}」になっています。「{suspect.good}」ではありませんか？</span><span className="mt-2 flex flex-wrap gap-3"><button type="button" onClick={() => { setContactEmail(suspect.fixed); setEmailOk(suspect.fixed); clearError('contactEmail'); }} className={darkBtn}>直す</button><button type="button" onClick={() => { setEmailOk(email); clearError('contactEmail'); }} className={greyBtn}>このまま使う</button></span></Caution> : undefined}>
            <input {...ids('contactEmail', { hint: true, example: true })} className={look('contactEmail')} type="email" inputMode="email" autoComplete="email" enterKeyHint="done" value={contactEmail} onChange={(e) => { setContactEmail(e.target.value); clearError('contactEmail'); }} onBlur={() => leave('contactEmail')} /></Field>
        </div>
        <NextBox id="f-consent-box" on={markKey === 'consent'} label={NEXT_LABEL.consent} prefix={prefix} float className="mt-8">
          <p id="f-consent-note" className="text-base font-bold text-slate-800">18歳未満の方は、保護者の方と一緒に入力して、チェックしてください。集める情報は「名前・電話・メール・写真」です。</p>
          <button type="button" onClick={openPrivacy} className={greyBtn + ' mt-2'}>使い道を読む（ここを押す）</button>
          <label className={'mt-3 flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 text-lg font-bold ' + (fieldErrors.consent ? 'tos-input-error' : 'border-slate-500 bg-slate-50')}><input id="f-consent" type="checkbox" checked={consent} aria-describedby={'f-consent-note' + (fieldErrors.consent ? ' f-consent-err' : '')} aria-invalid={fieldErrors.consent ? true : undefined} onChange={(e) => { setConsent(e.target.checked); clearError('consent'); }} className="mt-0.5 h-7 w-7 shrink-0 accent-indigo-700" />主催者が、大会の運営のために、私（または子ども）の情報を使うことに同意します。</label>
          {fieldErrors.consent ? <ErrorLine id="f-consent-err" className="mt-2"><span className="min-w-0">{fieldErrors.consent}</span></ErrorLine> : null}
        </NextBox>
      </section>
    </fieldset>
    <form ref={formRef} action={endpointReady ? config.endpoint : undefined} method="post" target="_self" className="hidden">
      {Object.entries({ protocol: config.protocol === '3' ? '3' : '2', entryKey: config.entryKey || '', mode: config.mode || '', website: '', eventId: config.eventId, requestId, gym: fighter.gym, name: fighter.name, grade: config.grade === 'off' ? '' : fighter.grade, age: config.age === 'off' ? '' : nf.age, height: nf.height.replace(/cm$/i, ''), weight: nf.weight.replace(/kg$/i, ''), record: fighter.record, comment: config.comment === 'off' ? '' : fighter.comment, musicUrl: config.music ? nf.musicUrl : '', contactName, contactPhone: phone, contactEmail: email, consent: consent ? 'yes' : 'no', photoDataUrl: photo }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    </form>
    {reviewing ? <section aria-label="送る前の確認" className="my-6 rounded-3xl border-2 border-indigo-700 bg-white p-4 sm:p-6">
      <h2 ref={reviewHeadingRef} tabIndex={-1} className="scroll-mt-24 text-2xl font-black outline-none">送る前の確認</h2>
      <p className="mt-3 text-xl font-black">上から読んで、まちがいがないか見ます。</p>
      <p className="mt-3 font-bold">{config.organizer || '大会主催者'}のGoogleへ、選手情報・連絡先・写真を送ります（主催者だけが見られます）。</p>
      {isTest ? <ErrorLine className="mt-3">これはテストです。ここから送っても、大会には届きません</ErrorLine> : null}
      <div className="mt-4 rounded-2xl border-2 border-slate-300 p-3"><dl><dt className="text-base text-slate-600">大会</dt><dd className="break-words text-lg font-bold">{config.title}</dd></dl></div>
      <div className="mt-3 rounded-2xl border-2 border-slate-300 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">選手の情報</h3><button type="button" aria-label="選手の情報を直す" onClick={() => fix('gym')} className="min-h-12 shrink-0 rounded-xl border-2 border-slate-500 px-4 text-lg font-bold">直す</button></div>
        <dl className="mt-2 grid gap-3">
          {([['ジム名', fighter.gym], ['選手名', fighter.name], ['身長', nf.height ? nf.height + ' cm' : ''], ['体重', nf.weight ? nf.weight + ' kg' : ''], ['戦績', fighter.record],
            ...(config.grade !== 'off' ? [['学年', fighter.grade]] : []), ...(config.age !== 'off' ? [['年齢', nf.age]] : []), ...(config.comment !== 'off' ? [['意気込み', fighter.comment]] : []), ...(config.music ? [['入場曲のリンク', nf.musicUrl]] : [])] as string[][]).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-base text-slate-600">{label}</dt><dd className="whitespace-pre-wrap break-words text-lg font-bold">{value.trim() ? value : '（未入力）'}</dd></div>)}
        </dl></div>
      <div className="mt-3 rounded-2xl border-2 border-slate-300 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">顔写真</h3><button type="button" aria-label="写真を直す" onClick={() => fix('photo')} className="min-h-12 shrink-0 rounded-xl border-2 border-slate-500 px-4 text-lg font-bold">直す</button></div>{photo ? <img src={photo} alt="" className="mt-2 h-28 w-24 rounded-xl bg-slate-100 object-contain" /> : <p className="mt-2 text-base text-slate-600">（未入力）</p>}</div>
      <div className="mt-3 rounded-2xl border-2 border-slate-300 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">連絡先</h3><button type="button" aria-label="連絡先を直す" onClick={fixContact} className="min-h-12 shrink-0 rounded-xl border-2 border-slate-500 px-4 text-lg font-bold">直す</button></div>
        <dl className="mt-2 grid gap-3">
          <div className="min-w-0"><dt className="text-base text-slate-600">お名前</dt><dd className="break-words text-lg font-bold">{contactName}</dd></div>
          <div className="min-w-0"><dt className="text-base text-slate-600">電話番号</dt><dd className="break-words text-3xl font-black tracking-wide">{phone}</dd><Caution className="mt-2">この番号で電話がつながりますか？ 主催者から電話します。</Caution></div>
          <div className="min-w-0"><dt className="text-base text-slate-600">メールアドレス</dt><dd className="break-words text-2xl font-black">{email}</dd><Caution className="mt-2">もう一度、読み合わせてください</Caution></div>
        </dl></div>
      {!online ? <Caution className="mt-3">電波のある場所で押す</Caution> : null}
      {deadlinePassed ? <ErrorLine className="mt-3">いま送っても、受け付けられないことがあります。先に主催者に電話する</ErrorLine> : null}
      {deadlinePassed && !tel ? <p className="mt-2 font-bold">{noContactText}</p> : null}
      {callFirst ? <NextBox on={nextKind === 'call'} label="主催者に電話する" prefix="次はここ" className="mt-3">{telLink}</NextBox> : null}
      <p className="tos-danger mt-4 text-base"><span aria-hidden="true" className="tos-icon">✕</span>送ったあとは、ここでは直せません（直すときは主催者に連絡）</p>
      <p className="mt-1 text-base font-bold text-slate-900">電話番号とメールが合っているか、もう一度見ます。</p>
      <NextBox on={nextKind === 'send'} label="正しければ、下のボタンを押す" prefix="次はここ" className="mt-3">
        <button disabled={sending||photoLoading||!endpointReady} aria-disabled={!online ? true : undefined} onClick={() => { if (!online) { say('失敗：電波がありません。電波のある場所で、もう一度押してください。', 'error'); return; } submit(true); }} className={'w-full text-xl ' + (locked || !online ? 'tos-locked min-h-14 rounded-xl px-4 py-3 font-black' : isTest ? 'tos-safe-btn' : 'tos-main')}>この内容で送信する</button>
        {!online ? <LockReason>電波がありません。電波のある場所で押します</LockReason> : null}
      </NextBox>
      <div className="tos-note mt-3 text-base">
        <p className="font-bold">送ると、Googleの白い画面が出ます。そのあとの3つ：</p>
        <ol className="mt-1 list-decimal space-y-1 pl-6">
          <li>「受付番号」が出たか見る。（「注意」の文字が出ても、だいじょうぶです）</li>
          <li>その画面の写真をとる。</li>
          <li>閉じる（戻らない）。</li>
        </ol>
        <p className="mt-2 text-slate-700">失敗したときのために、この確認の画面も写真にとっておくと安心です。</p>
      </div>
      <p className="mt-3 text-base font-bold text-slate-700"><span aria-hidden="true" className="tos-icon">✓</span>「戻って直す」を押しても、入力は消えません</p>
      <button onClick={() => { setReviewing(false); setMessage(''); focusField('gym'); }} className="tos-safe-btn mt-2 w-full text-lg">戻って直す（送信しません）</button>
    </section> : <div className="my-6">
      {sending ? <NextBox on flush label={`そのまま待つ（あと${wait}秒）`} prefix="次はここ" className="mb-3"><p className="tos-danger"><span aria-hidden="true" className="tos-icon">✕</span>戻らない・閉じない</p><p className="mt-1 text-base">送信中です。Googleの画面が出るまで、30秒ほどかかることがあります。</p></NextBox> : null}
      {endpointReady ? <p className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-lg font-bold"><span className="rounded-full bg-slate-200 px-3 py-1 text-slate-900">入力 {filled}/{total}</span>{left > 0 ? <button type="button" onClick={() => { if (firstMissing) focusField(firstMissing); }} className={greyBtn}>あと{left}か所 → 入っていないところへ</button> : badKeys.length ? <button type="button" onClick={() => focusField(badKeys[0])} className={greyBtn}>直す所 → 「✕」のところへ</button> : <span className="text-emerald-800">✓ ぜんぶ入りました</span>}</p> : null}
      {endpointReady && (left > 0 || badKeys.length > 0) && nextKind === 'field' ? <p className="mb-2 text-base text-slate-700">ボタンを押すと、「👉 次はここ」のところへ行きます。</p> : null}
      {badKeys.length ? <ErrorLine className="mb-2">直す所：{badKeys.map((key) => SHORT[key]).join('、')}</ErrorLine> : null}
      <NextBox flush float on={nextKind === 'confirm' || nextKind === 'resend'} className="mt-8" label={nextKind === 'resend' ? 'Googleの画面が出ないときだけ、押す' : '確認のボタンを押す'} prefix="次はここ">
        <button disabled={sending||photoLoading||!endpointReady} onClick={() => (confirmationPending ? submit(true, true) : submit())} className={'w-full text-xl ' + (locked ? 'tos-locked min-h-14 rounded-xl px-4 py-3 font-black' : 'tos-main')}>{sending ? '⏳ 送信しています…' : photoLoading ? '写真を準備しています…' : confirmationPending ? (changedAfterSend ? 'この新しい内容で送る（別の人の申し込み）' : 'もう一度送る（二重になりません）') : '入力内容を確認する →'}</button>
        {lockReason ? <LockReason>{lockReason}</LockReason> : null}
      </NextBox>
      {endpointReady && !sending ? (confirmationPending
        ? <div className="mt-2 space-y-2">
          {changedAfterSend
            ? <p className="tos-danger text-base"><span aria-hidden="true" className="tos-icon">✕</span>名前などを変えたので、別の人の申し込みになります。同じ人の申し込みなら、変えないでください。</p>
            : <p className="text-base text-slate-700">前の送信と同じ申込なので、二重にはなりません。</p>}
          <p className="tos-danger text-base"><span aria-hidden="true" className="tos-icon">✕</span>次のボタンを押すと、いま入っている内容が消えます（送った申し込みは、消えません）。</p>
          <button type="button" onClick={resetAll} className={greyBtn + ' w-full'}>別の人を申し込む（入力を消して、最初から）</button>
        </div>
        : <p className="tos-note mt-2 text-base"><span aria-hidden="true" className="tos-icon">i</span>まだ送りません。次の画面で、まちがいがないか見るだけです。</p>) : null}
    </div>}
    {endpointReady ? <Caution className="mt-4">読んでね。下の「使い道」と「困ったとき」は、押すと開きます。</Caution> : null}
    <Fold id="privacy-fold" title="どんな情報を、何のために使いますか？"><ul className="list-disc space-y-1 pl-6"><li>集めるもの：選手の情報・顔写真・連絡先（名前・電話・メール・写真）</li><li>見る人：主催者と、大会の運営の人</li><li>使うこと：組み合わせ作り、大会の連絡、当日の会場の画面での紹介（名前・写真・戦績・一言）</li><li>電話番号とメールは、会場の画面には出ません。</li></ul></Fold>
    <Fold title="困ったとき"><ul className="space-y-3"><li><b>写真が選べないとき</b><br />LINEの右上のメニューから「他のブラウザで開く」（またはSafari）を選んで、開き直してください。</li><li><b>Googleの画面が出ないとき</b><br />少し待ってから、もう一度ボタンを押してください。同じ申込は二重になりません。</li><li><b>受付番号が出ないとき</b><br />主催者に電話してください。{telLink ? <><br />{telLink}</> : null}</li></ul></Fold>
    <p className="mb-8 mt-6 text-center text-base font-bold text-slate-700">問い合わせ：{config.contact || '大会主催者へご確認ください'}</p>
  </div></main>;
}
