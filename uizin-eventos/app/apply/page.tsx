'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatDateInput } from '../../core/dateInput.ts';
import { entryErrors, type EntryFighter } from '../../core/entryPackage.ts';
import { EMPTY_PUBLIC_ENTRY_CONFIG, isVenueUrl, publicEntryConfig, publicEntryReady, type PublicEntryConfig } from '../../core/publicEntry.ts';
import { photoToDataUrl } from '../lib/privateStore.ts';

type Key = 'gym' | 'name' | 'height' | 'weight' | 'record' | 'grade' | 'age' | 'comment' | 'musicUrl' | 'photo' | 'contactName' | 'contactPhone' | 'contactEmail' | 'consent';
type Tone = 'info' | 'ok' | 'warn' | 'error';
type FieldErrors = Partial<Record<Key, string>>;

const SENT_KEY = 'tos-apply-sent-v1';
const SENT_WINDOW_MS = 2 * 60 * 60 * 1000;
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

const inputBase = 'mt-2 block w-full min-h-14 min-w-0 rounded-2xl border-2 px-4 py-3 text-lg font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-indigo-700 focus:ring-4 focus:ring-indigo-200 disabled:opacity-70';
const blank = (): EntryFighter => ({ id: '', gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '' });
const card = 'mt-5 rounded-3xl border-2 border-slate-300 bg-white p-4 sm:p-7';
const dash = /[ー－―‐‑–—−]/g;

const nfkc = (value: string) => value.normalize('NFKC');
const noSpace = (value: string) => value.replace(/\s+/g, '');
/** 全角・単位つきの入力を、数字だけにそろえる（この画面の中だけの整形。受付側のルールは変えない）。 */
function normalizeFighter(f: EntryFighter): EntryFighter {
  return {
    ...f,
    height: noSpace(nfkc(f.height).replace(/センチメートル|センチ|cm/gi, '')),
    weight: noSpace(nfkc(f.weight).replace(/キログラム|キロ|kg/gi, '')),
    age: noSpace(nfkc(f.age).replace(/[歳才]/g, '')),
    musicUrl: noSpace(nfkc(f.musicUrl)),
  };
}
const normalizePhone = (value: string) => noSpace(nfkc(value).replace(dash, '-'));
const normalizeEmail = (value: string) => noSpace(nfkc(value));

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
const LIMITS: [Key & keyof EntryFighter, number][] = [['gym', 120], ['name', 80], ['record', 300], ['comment', 500]];

function friendly(key: Key, value: string): string {
  const v = value.trim();
  const n = Number(v);
  switch (key) {
    case 'gym': return 'ジム名を入力してください。';
    case 'name': return '選手名を入力してください。';
    case 'height': return !v ? '身長を入力してください（例 170）。' : Number.isNaN(n) ? '身長は数字だけで入力してください（例 170）。' : '身長は50から250の間の数字で入力してください（例 170）。';
    case 'weight': return !v ? '体重（出たい体重）を入力してください（例 55）。' : Number.isNaN(n) ? '体重は数字だけで入力してください（例 55）。' : '体重は10から250の間の数字で入力してください（例 55）。';
    case 'record': return '戦績を入力してください。初試合なら「初試合」と入力してください。';
    case 'grade': return '学年を入力してください（例 中2）。';
    case 'age': return !v ? '年齢を入力してください（例 15）。' : '年齢は1から120の数字だけで入力してください（例 15）。';
    case 'comment': return '意気込みを入力してください。';
    case 'musicUrl': return !v ? '入場曲のリンクを入力してください。' : 'Apple MusicかYouTubeのリンクを貼ってください。';
    case 'photo': return '顔写真を選んでください。下の「📷 写真をえらぶ」を押します。';
    default: return '入力してください。';
  }
}

/** まとめて全部の欄を調べる。順番と文言のもとは、これまでの確認と同じ。 */
function validate(nf: EntryFighter, hasPhoto: boolean, config: PublicEntryConfig, contact: { name: string; phone: string; email: string; consent: boolean }, ready: boolean) {
  const errors: string[] = [];
  const fields: FieldErrors = {};
  const put = (key: Key, text: string) => { if (!fields[key]) fields[key] = text; };
  for (const text of entryErrors(nf, hasPhoto, config)) {
    errors.push(text);
    if (text.startsWith('入力内容が長すぎ')) {
      for (const [key, max] of LIMITS) if (nf[key].trim().length > max) put(key, '文字が多すぎます。短くしてください。');
      continue;
    }
    const hit = CORE_KEYS.find(([prefix]) => text.startsWith(prefix));
    if (hit) put(hit[1], friendly(hit[1], hit[1] === 'photo' ? '' : nf[hit[1] as keyof EntryFighter]));
  }
  if (!contact.name.trim()) { errors.push('連絡先のお名前を入力してください。'); put('contactName', '連絡先のお名前を入力してください。'); }
  if (contact.name.trim().length > 100 || contact.email.trim().length > 200) {
    errors.push('連絡先のお名前は100文字、メールアドレスは200文字以内にしてください。');
    if (contact.name.trim().length > 100) put('contactName', 'お名前は100文字以内にしてください。');
    if (contact.email.trim().length > 200) put('contactEmail', 'メールアドレスは200文字以内にしてください。');
  }
  if (!/^0?[0-9][0-9 -]{8,14}$/.test(contact.phone)) { errors.push('電話番号を確認してください。'); put('contactPhone', '電話番号を入れてください（例 09012345678）。ハイフンは、あってもなくてもOKです。'); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) { errors.push('メールアドレスを確認してください。'); put('contactEmail', 'メールアドレスを正しく入力してください（例 name@example.com）。'); }
  if (!contact.consent) { errors.push('個人情報の取扱いへの同意が必要です。'); put('consent', '同意するときは、四角にチェックを入れてください。'); }
  if (!ready) errors.push('この申し込みページは古くなっています。主催者に、新しいリンクを聞いてください。');
  return { errors, fields };
}

function Chip({ children, tone }: { children: ReactNode; tone: 'need' | 'opt' | 'here' | 'done' }) {
  const cls = tone === 'need' ? 'bg-rose-700 text-white' : tone === 'opt' ? 'bg-slate-200 text-slate-800' : tone === 'here' ? 'bg-indigo-700 text-white' : 'bg-emerald-700 text-white';
  return <span className={'ml-2 inline-block rounded-full px-2.5 py-0.5 align-middle text-base font-bold leading-normal ' + cls}>{children}</span>;
}

/** 「名前 必須」のような文字を、赤い「必須」の札つきで出す（Field と同じ見た目） */
function LabelText({ label }: { label: string }) {
  const m = label.match(/^(.*?)(\s?)(必須|任意)$/);
  return <>{m ? m[1] : label}{m ? m[2] : ''}{m ? <Chip tone={m[3] === '必須' ? 'need' : 'opt'}>{m[3]}</Chip> : null}</>;
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  const m = label.match(/^(.*?)(\s?)(必須|任意)$/);
  const text = m ? m[1] : label;
  const gap = m ? m[2] : '';
  const badge = m ? m[3] : '';
  return <div className="min-w-0 scroll-mt-24">
    <label htmlFor={id} className="block text-lg font-bold leading-snug [text-wrap:balance]">{text}{gap}{badge ? <Chip tone={badge === '必須' ? 'need' : 'opt'}>{badge}</Chip> : null}</label>
    {hint ? <p id={id + '-hint'} className="mt-1 text-base font-medium leading-relaxed text-slate-700">{hint}</p> : null}
    {children}
    {error ? <p id={id + '-err'} className="mt-2 flex gap-2 text-base font-bold leading-relaxed text-rose-700"><span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-700 text-sm text-white">!</span><span className="min-w-0">{error}</span></p> : null}
  </div>;
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  return <details className="group mt-4 rounded-2xl border-2 border-slate-300 bg-white">
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
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('info');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sending, setSending] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [recentSent, setRecentSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dispatchedRef = useRef(0);
  const sendingRef = useRef(false);
  const reviewingRef = useRef(false);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = (text: string, kind: Tone = 'info') => { setMessage(text); setTone(kind); };

  useEffect(() => {
    const next = publicEntryConfig(location.hash);
    setConfig(next);
    document.title = next.title ? next.title + ' 申込' : '大会の申し込み';
    const dl = parseJa(next.deadline);
    if (dl) {
      const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const today = jst.getUTCFullYear() * 10000 + (jst.getUTCMonth() + 1) * 100 + jst.getUTCDate();
      setDeadlinePassed(today > dl.y * 10000 + dl.m * 100 + dl.d);
    }
    try {
      const saved = JSON.parse(localStorage.getItem(SENT_KEY) || 'null') as { eventId?: string; sentAt?: number } | null;
      if (saved && saved.eventId === next.eventId && typeof saved.sentAt === 'number' && Date.now() - saved.sentAt < SENT_WINDOW_MS && Date.now() >= saved.sentAt) setRecentSent(true);
    } catch { /* 保存できない画面でも、申し込みはできる */ }
    setLoaded(true);
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
      say('受付番号の画面が出ましたか？ 出た方は申し込み済みです。出なかった方だけ、下のボタンを押してください。', 'warn');
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
      try { localStorage.setItem(SENT_KEY, JSON.stringify({ eventId: config.eventId, sentAt: Date.now() })); } catch { /* 目印が残せなくても送れる */ }
      const form = formRef.current;
      try {
        if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
        else form?.submit();
      } catch {
        if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
        sendingRef.current = false; setSending(false);
        say('送信できませんでした。別のブラウザ（Safari / Chrome）で開き直してください。', 'error');
      }
    }
  }, [sending, requestId, attempt, config.eventId]);
  useEffect(() => { reviewingRef.current = reviewing; }, [reviewing]);
  useEffect(() => {
    if (reviewingRef.current) setMessage('');
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

  const clearError = (key: Key) => {
    setFieldErrors((old) => { if (!old[key]) return old; const rest = { ...old }; delete rest[key]; return rest; });
    if (tone === 'error') setMessage('');
  };
  const change = (key: keyof EntryFighter, value: string) => { setFighter((old) => ({ ...old, [key]: value })); clearError(key as Key); };
  const tidy = (key: 'height' | 'weight' | 'age' | 'musicUrl') => { const next = nf[key]; if (next !== fighter[key]) setFighter((old) => ({ ...old, [key]: next })); };
  const focusField = (key: Key) => {
    document.getElementById(key === 'photo' ? 'f-photo-box' : 'f-' + key)?.scrollIntoView({ block: 'center' });
    document.getElementById('f-' + key)?.focus({ preventScroll: true });
  };
  const focusFirst = (fields: FieldErrors) => {
    const boxes = (Object.keys(fields) as Key[]).map((key) => ({ key, el: document.getElementById(key === 'photo' ? 'f-photo-box' : 'f-' + key) })).filter((x): x is { key: Key; el: HTMLElement } => Boolean(x.el));
    boxes.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (boxes[0]) focusField(boxes[0].key);
  };

  const submit = (confirmed = false, resend = false) => {
    if (sendingRef.current) return;
    if (photoLoadingRef.current) { setReviewing(false); say('写真を準備しています。写真が表示されてから押してください。', 'warn'); return; }
    if (confirmed && !reviewing && !resend) return;
    const { errors, fields } = validate(nf, Boolean(photo), config, { name: contactName, phone, email, consent }, publicEntryReady(config));
    if (errors.length) {
      setReviewing(false);
      setFieldErrors(fields);
      const count = Object.keys(fields).length;
      say(count ? `入力が足りないところが${count}つあります。しるしの付いた欄を、上から直してください。` : errors[0], 'error');
      if (count) focusFirst(fields);
      return;
    }
    setFieldErrors({});
    if (!confirmed) { setReviewing(true); say('まだ送っていません。下の確認欄を見て、正しければ「この内容で送信する」を押してください。', 'info'); return; }
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    setRequestId((old) => old || crypto.randomUUID?.() || newRequestId());
    setAttempt((old) => old + 1);
    sendingRef.current = true;
    say('Googleの受付結果画面へ移動します。受付番号が出るまでお待ちください。', 'info');
    setConfirmationPending(false);
    setReviewing(false);
    setSending(true);
    resultTimerRef.current = setTimeout(() => {
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
      setPhoto(nextPhoto);
    } catch (error) {
      if (version !== photoVersionRef.current) return;
      const tooBig = error instanceof Error && error.message.includes('大きすぎ');
      setPhotoError(tooBig ? '写真が大きすぎます。別の写真を選んでください。前に選んだ写真は取り消しました。' : '写真が読み込めませんでした。写真アプリの別の写真を選ぶか、その場でカメラで撮ってください。前に選んだ写真は取り消しました。');
    } finally {
      if (version === photoVersionRef.current) { photoLoadingRef.current = false; setPhotoLoading(false); }
    }
  };

  const endpointReady = publicEntryReady(config);
  const tel = telDigits(config.contact);
  const dateInfo = parseJa(config.date);
  const dateText = dateInfo ? `${dateInfo.y}年${dateInfo.m}月${dateInfo.d}日（${weekday(dateInfo)}）` : config.date;
  const deadlineInfo = parseJa(config.deadline);
  const deadlineText = deadlineInfo ? `${deadlineInfo.m}月${deadlineInfo.d}日（${weekday(deadlineInfo)}）まで` : config.deadline ? (config.deadline.endsWith('まで') ? config.deadline : config.deadline + 'まで') : '';

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
  // 入っていない欄を、画面の上から順に並べる（「あと◯か所」から、いちばん上の欄へ飛ぶため）
  const order: Array<[Key, boolean]> = [['gym', !!fighter.gym.trim()], ['name', !!fighter.name.trim()], ['height', !!nf.height], ['weight', !!nf.weight], ['record', !!fighter.record.trim()],
    ...(config.grade === 'required' ? [['grade', !!fighter.grade.trim()] as [Key, boolean]] : []), ...(config.age === 'required' ? [['age', !!nf.age] as [Key, boolean]] : []), ...(config.comment === 'required' ? [['comment', !!fighter.comment.trim()] as [Key, boolean]] : []),
    ...(config.music ? [['musicUrl', !!nf.musicUrl] as [Key, boolean]] : []), ['photo', !!photo], ['contactName', !!contactName.trim()], ['contactPhone', !!phone], ['contactEmail', !!email], ['consent', consent]];
  const firstMissing = order.find(([, ok]) => !ok)?.[0];

  const ids = (key: Key, hint?: string) => ({
    id: 'f-' + key,
    'aria-invalid': fieldErrors[key] ? true : undefined,
    'aria-describedby': [hint ? 'f-' + key + '-hint' : '', fieldErrors[key] ? 'f-' + key + '-err' : ''].filter(Boolean).join(' ') || undefined,
  });
  const look = (key: Key, required: boolean) => inputBase + (fieldErrors[key] ? ' border-rose-600 bg-rose-50' : required ? ' border-slate-500 bg-amber-50' : ' border-slate-500 bg-white');

  const fighterField = (key: 'gym' | 'name' | 'height' | 'weight' | 'record' | 'grade' | 'age', label: string, required: boolean, hint: string, extra: { placeholder?: string; inputMode?: 'decimal' | 'numeric'; fix?: boolean } = {}) =>
    <Field key={key} id={'f-' + key} label={label} hint={hint} error={fieldErrors[key]}>
      <input {...ids(key, hint)} className={look(key, required)} value={fighter[key]} placeholder={extra.placeholder} inputMode={extra.inputMode} autoComplete="off" enterKeyHint="next" onChange={(e) => change(key, e.target.value)} onBlur={extra.fix ? () => tidy(key as 'height' | 'weight' | 'age') : undefined} />
    </Field>;

  const hints = {
    gym: '通っているジムの名前です。', name: '試合で呼ばれる名前です（リングネームでもOK）。', height: '例：170（数字だけ）', weight: '例：55（出たい体重です。迷ったら今の体重）',
    record: '例：初試合 ／ 3勝1敗 ／ 空手3年（競技歴でもOK）', grade: '例：中2 ／ 高1 ／ 社会人', age: '例：15（数字だけ）',
    comment: config.comment === 'required' ? '試合で紹介される一言です。必ず書いてください。' : '試合で紹介される一言です。書かなくても大丈夫です。', music: 'Apple MusicかYouTubeの曲のリンクを貼ってください。',
    contactName: '保護者の方のお名前でも大丈夫です', email: 'お持ちでなければ、保護者の方のメールアドレスで大丈夫です', phone: '例：09012345678（ハイフンはあってもなくても大丈夫です）',
  };
  const gradeField = () => fighterField('grade', '学年 ' + (config.grade === 'required' ? '必須' : '任意'), config.grade === 'required', hints.grade);
  const ageField = () => fighterField('age', '年齢 ' + (config.age === 'required' ? '必須' : '任意'), config.age === 'required', hints.age, { inputMode: 'numeric', fix: true });
  const commentField = () => <Field key="comment" id="f-comment" label={'意気込み ' + (config.comment === 'required' ? '必須' : '任意')} hint={hints.comment} error={fieldErrors.comment}>
    <textarea {...ids('comment', hints.comment)} rows={3} className={look('comment', config.comment === 'required')} value={fighter.comment} autoComplete="off" onChange={(e) => change('comment', e.target.value)} />
  </Field>;
  const requiredExtra = [config.grade === 'required' ? gradeField() : null, config.age === 'required' ? ageField() : null, config.comment === 'required' ? commentField() : null];
  const optionalExtra = [config.grade === 'optional' ? gradeField() : null, config.age === 'optional' ? ageField() : null, config.comment === 'optional' ? commentField() : null].filter(Boolean);

  const telLink = tel ? <a href={'tel:' + tel} className="inline-flex min-h-12 items-center font-bold text-indigo-800 underline underline-offset-4">📞 主催者に電話する</a> : null;
  const toneCls = tone === 'error' ? 'bg-rose-700 text-white' : tone === 'ok' ? 'bg-emerald-700 text-white' : tone === 'warn' ? 'border-2 border-amber-500 bg-amber-50 text-amber-950' : 'bg-indigo-700 text-white';
  const fix = (key: Key) => { setReviewing(false); focusField(key); };

  if (!loaded) return <main className="min-h-dvh bg-slate-50 px-4 py-10 text-lg font-medium text-slate-950 [color-scheme:light]"><p className="mx-auto max-w-3xl text-center text-slate-700">よみこみ中…</p></main>;

  return <main className="min-h-dvh bg-slate-50 px-4 py-4 text-lg font-medium leading-relaxed text-slate-950 [color-scheme:light] sm:py-10"><div className="mx-auto w-full max-w-3xl overflow-x-clip [overflow-wrap:anywhere] [word-break:auto-phrase]">
    <header className="rounded-3xl bg-slate-900 p-4 text-white sm:p-8">
      <div className="flex items-center justify-between gap-3"><p className="rounded-full bg-white/15 px-3 py-1 text-base font-bold">申し込み受付中</p><p aria-hidden="true" className="text-3xl">🥊</p></div>
      <h1 className="mt-3 text-2xl font-black leading-tight [text-wrap:balance] sm:text-4xl">{config.title || '大会の申し込み'}</h1>
      <p className="mt-1 text-base font-bold text-slate-200">{config.organizer ? '主催：' + config.organizer : '選手のみなさん、申し込みを待っています'}（約3分で終わります）</p>
      <dl className="mt-3 divide-y divide-white/20 rounded-2xl bg-white/10 px-3">
        <div className="flex min-h-12 items-center gap-3 py-1.5"><dt className="w-20 shrink-0 text-base text-slate-200">開催日</dt><dd className="min-w-0 text-lg font-bold">{dateText || '未定'}</dd></div>
        <div className="flex min-h-12 items-center gap-3 py-1.5"><dt className="w-20 shrink-0 text-base text-slate-200">会場</dt><dd className="min-w-0 text-lg font-bold">{isVenueUrl(config.venueUrl) ? <a href={config.venueUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">{config.venue || '地図を開く'} ↗</a> : config.venue || '未定'}</dd></div>
        <div className="flex min-h-12 items-center gap-3 py-1.5"><dt className="w-20 shrink-0 text-base text-slate-200">申込締切</dt><dd className="min-w-0 text-lg font-bold">{deadlineText ? <span className="inline-block rounded-full bg-amber-100 px-3 py-0.5 text-amber-950">{deadlineText}</span> : '未定'}</dd></div>
      </dl>
    </header>
    {deadlinePassed ? <p className="mt-4 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 font-bold text-amber-950">⚠ 申込の締切を過ぎています。申し込む前に主催者に聞いてください。</p> : null}
    {config.mode === 'test' ? <p className="mt-4 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 font-bold text-amber-950">これはテスト用の画面です。選手の方は、主催者から届いた本番のリンクから申し込んでください。</p> : null}
    {!endpointReady ? <div className="mt-4 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 font-bold text-amber-950"><p>このページは、まだ使えません。LINEで届いたリンクをもう一度タップしてください。それでも出ないときは、主催者に「申し込みのページが開けない」と伝えてください。</p>{telLink ? <p className="mt-2">{telLink}</p> : null}</div> : null}
    {recentSent ? <div className="mt-4 rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-4 font-bold text-emerald-950"><p>✓ さっき、申し込みを送りました。受付番号の画面が出た方は、もう申し込み済みです。</p><details className="mt-2"><summary className="flex min-h-12 cursor-pointer items-center text-base underline underline-offset-4">それでも新しく申し込む</summary><button type="button" onClick={() => setRecentSent(false)} className="mt-2 min-h-12 w-full rounded-2xl border-2 border-slate-500 bg-white px-4 text-lg font-bold text-slate-900">この表示を消して、新しく申し込む</button></details></div> : null}
    <ol aria-label="申し込みの流れ" className="mt-4 grid grid-cols-4 gap-2">{steps.map((name, i) => { const n = i + 1; const state = n < stage ? 'done' : n === stage ? 'here' : 'later'; return <li key={name} aria-current={state === 'here' ? 'step' : undefined} className={'flex min-h-16 min-w-0 flex-col items-center rounded-2xl border-2 px-1 py-2 text-center text-base font-bold leading-tight ' + (state === 'here' ? 'border-indigo-700 bg-indigo-50 text-indigo-950' : state === 'done' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700')}><span aria-hidden="true" className={'grid h-7 w-7 place-items-center rounded-full text-base ' + (state === 'here' ? 'bg-indigo-700 text-white' : state === 'done' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700')}>{state === 'done' ? '✓' : n}</span><span className="mt-1 block min-w-0">{name}</span>{state === 'here' ? <><span className="sr-only">（いまここ）</span><span aria-hidden="true" className="mt-1 hidden whitespace-nowrap rounded-full bg-indigo-700 px-2 text-base text-white sm:inline">いまここ</span></> : null}</li>; })}</ol>
    <p className="mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-base font-bold text-indigo-950 sm:hidden">▶ いまここ：{stage} / 4　{steps[stage - 1]}</p>
    {message ? <div role="status" className={'sticky top-2 z-20 mt-4 flex items-start gap-3 rounded-2xl p-4 text-lg font-bold shadow ' + toneCls}><div className="min-w-0 flex-1"><p>{message}</p>{confirmationPending && telLink ? <p className="mt-1">{telLink}</p> : null}</div><button type="button" onClick={() => setMessage('')} className="min-h-12 shrink-0 rounded-xl border-2 border-current px-3 text-base font-bold">✕ とじる</button></div> : null}
    <fieldset disabled={sending || !endpointReady} className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">選手の申し込み</legend>
      <section className={card}>
        <h2 className="flex items-center gap-3 text-2xl font-black"><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-700 text-xl text-white">1</span>選手の情報</h2>
        <p className="mt-3 text-base text-slate-700">「必須」のところは、ぜんぶ入れてください。</p>
        <div className="mt-4 grid gap-5">
          {fighterField('gym', 'ジム名 必須', true, hints.gym)}
          {fighterField('name', '選手名 必須', true, hints.name)}
          {fighterField('height', '身長（cm）必須', true, hints.height, { inputMode: 'decimal', fix: true })}
          {fighterField('weight', '体重（kg）必須', true, hints.weight, { inputMode: 'decimal', fix: true })}
          {fighterField('record', '戦績 必須', true, hints.record)}
          {requiredExtra}
          {config.music ? <Field id="f-musicUrl" label="入場曲のリンク 必須" hint={hints.music} error={fieldErrors.musicUrl}><input {...ids('musicUrl', hints.music)} className={look('musicUrl', true)} value={fighter.musicUrl} placeholder="Apple Music または YouTube" inputMode="url" autoComplete="off" enterKeyHint="next" onChange={(e) => change('musicUrl', e.target.value)} onBlur={() => tidy('musicUrl')} /></Field> : null}
        </div>
        <div id="f-photo-box" className={'mt-6 scroll-mt-24 rounded-3xl border-2 border-dashed p-4 focus-within:ring-4 focus-within:ring-indigo-200 ' + (photo ? 'border-emerald-600 bg-emerald-50' : photoError || fieldErrors.photo ? 'border-rose-600 bg-rose-50' : 'border-slate-500 bg-white')}>
          <h3 className="text-lg font-bold leading-snug"><LabelText label="顔写真 必須" /></h3>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-base font-medium text-slate-800"><li>顔が正面から見える</li><li>明るい場所で撮る</li><li>ひとりだけ写っている</li><li>帽子やサングラスはなし</li></ul>
          <p className="mt-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-base font-bold text-amber-950">写真が選べないときは、LINEの右上のメニューから「他のブラウザで開く」（またはSafari）を選んで、開き直してください。</p>
          {photoLoading ? <p className="mt-3 font-bold text-slate-800">⏳ 写真を準備しています。少しお待ちください。</p> : null}
          {photo ? <div className="mt-3 text-center"><p className="font-bold text-emerald-900">✓ 写真を選びました</p><img src={photo} alt="選んだ写真" className="mx-auto mt-2 h-56 w-44 max-w-full rounded-2xl bg-white object-contain" /></div> : null}
          <label htmlFor="f-photo" className={'mt-3 flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border-2 px-4 py-3 text-center text-lg font-bold ' + (photo ? 'border-slate-500 bg-white text-slate-900' : 'border-indigo-700 bg-indigo-50 text-indigo-950')}>{photo ? '写真をえらびなおす' : '📷 写真をえらぶ（撮る・アルバムから）'}</label>
          <input id="f-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-describedby={photoError || fieldErrors.photo ? 'f-photo-err' : undefined} onChange={(e) => { const input = e.currentTarget; const file = input.files?.[0]; void choosePhoto(file).finally(() => { input.value = ''; }); }} />
          {photoError || fieldErrors.photo ? <p id="f-photo-err" className="mt-2 flex gap-2 text-base font-bold leading-relaxed text-rose-700"><span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-700 text-sm text-white">!</span><span className="min-w-0">{photoError || fieldErrors.photo}</span></p> : null}
        </div>
        {optionalExtra.length ? <><h3 className="mt-6 border-t-2 border-slate-200 pt-4 text-lg font-bold text-slate-700">書かなくてもOK（任意）</h3><div className="mt-4 grid gap-5">{optionalExtra}</div></> : null}
      </section>
      <section className={card}>
        <h2 className="flex items-center gap-3 text-2xl font-black"><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-700 text-xl text-white">2</span>連絡先</h2>
        <p className="mt-3 rounded-2xl bg-slate-100 p-3 text-base font-bold text-slate-800">🔒 主催者からの連絡だけに使います。入力した内容は、この申込サイトには残りません。主催者のGoogleの表にだけ保存されます。</p>
        <div className="mt-4 grid gap-5">
          <Field id="f-contactName" label="連絡先のお名前 必須" hint={hints.contactName} error={fieldErrors.contactName}><input {...ids('contactName', hints.contactName)} className={look('contactName', true)} value={contactName} autoComplete="name" enterKeyHint="next" onChange={(e) => { setContactName(e.target.value); clearError('contactName'); }} /></Field>
          <Field id="f-contactPhone" label="電話番号 必須" hint={hints.phone} error={fieldErrors.contactPhone}><input {...ids('contactPhone', hints.phone)} className={look('contactPhone', true)} type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" value={contactPhone} onChange={(e) => { setContactPhone(e.target.value); clearError('contactPhone'); }} onBlur={() => { if (phone !== contactPhone) setContactPhone(phone); }} /></Field>
          <Field id="f-contactEmail" label="メールアドレス 必須" hint={hints.email} error={fieldErrors.contactEmail}><input {...ids('contactEmail', hints.email)} className={look('contactEmail', true)} type="email" inputMode="email" autoComplete="email" enterKeyHint="done" value={contactEmail} onChange={(e) => { setContactEmail(e.target.value); clearError('contactEmail'); }} onBlur={() => { if (email !== contactEmail) setContactEmail(email); }} /></Field>
        </div>
        <div id="f-consent-box" className="mt-6 scroll-mt-24">
          <p id="f-consent-note" className="text-base font-bold text-slate-800">18歳未満の方は、保護者の方と一緒に入力して、チェックしてください。どんな情報を使うかは、いちばん下の「どんな情報を、何のために使いますか？」に書いてあります。</p>
          <label className={'mt-2 flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 text-lg font-bold ' + (fieldErrors.consent ? 'border-rose-600 bg-rose-50' : 'border-slate-500 bg-slate-50')}><input id="f-consent" type="checkbox" checked={consent} aria-describedby={'f-consent-note' + (fieldErrors.consent ? ' f-consent-err' : '')} aria-invalid={fieldErrors.consent ? true : undefined} onChange={(e) => { setConsent(e.target.checked); clearError('consent'); }} className="mt-0.5 h-7 w-7 shrink-0 accent-indigo-700" />主催者が、大会の運営のために、私（または子ども）の情報を使うことに同意します。</label>
          {fieldErrors.consent ? <p id="f-consent-err" className="mt-2 flex gap-2 text-base font-bold text-rose-700"><span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-700 text-sm text-white">!</span><span className="min-w-0">{fieldErrors.consent}</span></p> : null}
        </div>
      </section>
    </fieldset>
    <form ref={formRef} action={endpointReady ? config.endpoint : undefined} method="post" target="_self" className="hidden">
      {Object.entries({ protocol: config.protocol === '3' ? '3' : '2', entryKey: config.entryKey || '', mode: config.mode || '', website: '', eventId: config.eventId, requestId, gym: fighter.gym, name: fighter.name, grade: config.grade === 'off' ? '' : fighter.grade, age: config.age === 'off' ? '' : nf.age, height: nf.height.replace(/cm$/i, ''), weight: nf.weight.replace(/kg$/i, ''), record: fighter.record, comment: config.comment === 'off' ? '' : fighter.comment, musicUrl: config.music ? nf.musicUrl : '', contactName, contactPhone: phone, contactEmail: email, consent: consent ? 'yes' : 'no', photoDataUrl: photo }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    </form>
    {reviewing ? <section aria-label="送る前の確認" className="my-6 rounded-3xl border-2 border-indigo-700 bg-white p-4 sm:p-6">
      <h2 ref={reviewHeadingRef} tabIndex={-1} className="scroll-mt-24 text-2xl font-black outline-none">送る前の確認</h2>
      <p className="mt-3 font-bold">{config.organizer || '大会主催者'}のGoogleへ、入力した選手情報・連絡先・写真を送ります。入力した内容は、大会の受付用Googleに送られ、主催者だけが見られます。</p>
      {config.mode === 'test' ? <p className="mt-3 font-bold text-amber-950">これはテストです。本番の名簿には入りません。</p> : null}
      <div className="mt-4 rounded-2xl border-2 border-slate-300 p-3"><dl><dt className="text-base text-slate-600">大会</dt><dd className="break-words text-lg font-bold">{config.title}</dd></dl></div>
      <div className="mt-3 rounded-2xl border-2 border-slate-300 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">選手の情報</h3><button type="button" aria-label="選手の情報を直す" onClick={() => fix('gym')} className="min-h-12 shrink-0 rounded-xl border-2 border-slate-500 px-4 text-lg font-bold">直す</button></div>
        <dl className="mt-2 grid gap-3">
          {([['ジム名', fighter.gym], ['選手名', fighter.name], ['身長', nf.height ? nf.height + ' cm' : ''], ['体重', nf.weight ? nf.weight + ' kg' : ''], ['戦績', fighter.record],
            ...(config.grade !== 'off' ? [['学年', fighter.grade]] : []), ...(config.age !== 'off' ? [['年齢', nf.age]] : []), ...(config.comment !== 'off' ? [['意気込み', fighter.comment]] : []), ...(config.music ? [['入場曲のリンク', nf.musicUrl]] : [])] as string[][]).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-base text-slate-600">{label}</dt><dd className="whitespace-pre-wrap break-words text-lg font-bold">{value.trim() ? value : '（未入力）'}</dd></div>)}
        </dl></div>
      <div className="mt-3 rounded-2xl border-2 border-slate-300 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">顔写真</h3><button type="button" aria-label="写真を直す" onClick={() => fix('photo')} className="min-h-12 shrink-0 rounded-xl border-2 border-slate-500 px-4 text-lg font-bold">直す</button></div>{photo ? <img src={photo} alt="" className="mt-2 h-28 w-24 rounded-xl bg-slate-100 object-contain" /> : <p className="mt-2 text-base text-slate-600">（未入力）</p>}</div>
      <div className="mt-3 rounded-2xl border-2 border-slate-300 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">連絡先</h3><button type="button" aria-label="連絡先を直す" onClick={() => fix('contactName')} className="min-h-12 shrink-0 rounded-xl border-2 border-slate-500 px-4 text-lg font-bold">直す</button></div>
        <dl className="mt-2 grid gap-3">{([['お名前', contactName], ['電話番号', phone], ['メールアドレス', email]] as string[][]).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-base text-slate-600">{label}</dt><dd className="break-words text-lg font-bold">{value}</dd></div>)}</dl></div>
      <div className="mt-4 rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-4 text-base font-bold leading-relaxed text-emerald-950">送ると、Googleの白い画面になります。「申し込みが完了しました」と受付番号が出たら、申し込みは終わりです。その画面を写真にとって（スクリーンショット）、とっておいてください。「注意」の文字が出ても、だいじょうぶです。</div>
      <button disabled={sending||photoLoading||!endpointReady} onClick={() => submit(true)} className="mt-4 min-h-14 w-full rounded-2xl border-2 border-indigo-700 bg-indigo-700 px-4 py-3 text-xl font-black text-white disabled:border-slate-400 disabled:bg-slate-200 disabled:text-slate-700">この内容で送信する</button>
      <button onClick={() => { setReviewing(false); setMessage(''); focusField('gym'); }} className="mt-3 min-h-14 w-full rounded-2xl border-2 border-slate-500 bg-white px-4 py-3 text-lg font-bold text-slate-900">戻って直す（送信しません）</button>
    </section> : <div className="my-6">
      {sending ? <p className="mb-3 rounded-2xl bg-indigo-50 p-4 text-lg font-bold text-indigo-950">送信中です。画面を閉じずにお待ちください（30秒ほどかかることがあります）</p> : null}
      <p className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-lg font-bold"><span className="rounded-full bg-slate-200 px-3 py-1 text-slate-900">入力 {filled}/{total}</span>{left > 0 ? <button type="button" onClick={() => { if (firstMissing) focusField(firstMissing); }} className="min-h-12 rounded-xl border-2 border-amber-500 bg-amber-50 px-3 text-lg font-bold text-amber-950">あと{left}か所 → 入っていないところへ</button> : <span className="text-emerald-800">✓ ぜんぶ入りました</span>}</p>
      <button disabled={sending||photoLoading||!endpointReady} onClick={() => (confirmationPending ? submit(true, true) : submit())} className="min-h-14 w-full rounded-2xl border-2 border-indigo-700 bg-indigo-700 px-4 py-3 text-xl font-black text-white transition hover:bg-indigo-800 disabled:border-slate-400 disabled:bg-slate-200 disabled:text-slate-700">{sending ? '⏳ 送信しています…' : photoLoading ? '写真を準備しています…' : confirmationPending ? 'もう一度送る（二重になりません）' : '入力内容を確認する →'}</button>
      <p className="mt-2 text-base text-slate-700">{!endpointReady ? '今は押せません。上の案内を読んでください。' : sending ? '' : confirmationPending ? '同じ申込番号を使うので、二重にはなりません。' : '押しても、まだ送りません。次の画面で内容を見られます。'}</p>
    </div>}
    <Fold title="どんな情報を、何のために使いますか？"><ul className="list-disc space-y-1 pl-6"><li>集めるもの：選手の情報・顔写真・連絡先</li><li>見る人：主催者と、大会の運営の人</li><li>使うこと：組み合わせ作り、大会の連絡、当日の会場の画面での紹介（名前・写真・戦績・一言）</li><li>電話番号とメールは、会場の画面には出ません。</li></ul></Fold>
    <Fold title="困ったとき"><ul className="space-y-3"><li><b>写真が選べないとき</b><br />LINEの右上のメニューから「他のブラウザで開く」（またはSafari）を選んで、開き直してください。</li><li><b>Googleの画面が出ないとき</b><br />少し待ってから、もう一度ボタンを押してください。同じ申込は二重になりません。</li><li><b>受付番号が出ないとき</b><br />主催者に電話してください。{telLink ? <><br />{telLink}</> : null}</li></ul></Fold>
    <p className="mb-8 mt-6 text-center text-base font-bold text-slate-700">問い合わせ：{config.contact || '大会主催者へご確認ください'}</p>
  </div></main>;
}
