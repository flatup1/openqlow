'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { classMismatch, CLASS_NEUTRAL_NOTE, suggestClass, suggestText } from '../../core/classRules.ts';
import { formatDateInput } from '../../core/dateInput.ts';
import { emailFormOk, entryErrors, lowerLinkHost, MUSIC_URL_FORM, phoneFormOk, stripInvisible, type EntryFighter } from '../../core/entryPackage.ts';
import { EMPTY_PUBLIC_ENTRY_CONFIG, isVenueUrl, publicEntryConfig, publicEntryLinkCut, publicEntryReady, type PublicEntryConfig } from '../../core/publicEntry.ts';
import { findDivision, normalizeWeightClass, weightChoiceError, weightClassLabel } from '../../core/weightClass.ts';
import { CkaLogo } from '../components/CkaLogo.tsx';
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

type Key = 'gym' | 'name' | 'height' | 'weight' | 'division' | 'weightClass' | 'record' | 'fighterClass' | 'grade' | 'age' | 'comment' | 'musicUrl' | 'photo' | 'contactName' | 'contactPhone' | 'contactEmail' | 'consent';
type Tone = 'info' | 'ok' | 'warn' | 'error';
type FieldErrors = Partial<Record<Key, string>>;
type Flags = Partial<Record<Key, boolean>>;
type Notes = Partial<Record<Key, string>>;
type Problem = { text: string; early: boolean };
type ContactNow = { name: string; phone: string; email: string };

const SENT_KEY = 'tos-apply-sent-v1';
const SENT_WINDOW_MS = 2 * 60 * 60 * 1000;
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

const inputBase = 'mt-2 block w-full min-h-14 min-w-0 rounded-2xl border-2 px-4 py-3 text-lg font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-indigo-700 focus:ring-4 focus:ring-indigo-600 disabled:opacity-70';
const blank = (): EntryFighter => ({ id: '', gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '' });
const card = 'mt-5 rounded-3xl border-2 border-slate-300 bg-white p-4 sm:p-7';
const greyBtn = 'min-h-12 rounded-xl border-2 border-slate-500 bg-white px-4 text-[1.0625rem] font-bold text-slate-900';
const darkBtn = 'min-h-12 rounded-xl border-2 border-slate-900 bg-white px-4 text-[1.0625rem] font-bold text-slate-900';

const SHORT: Record<Key, string> = { gym: 'ジム名', name: '選手名', height: '身長', weight: '体重', division: '区分', weightClass: '階級', record: '戦績', fighterClass: 'クラス', grade: '学年', age: '年齢', comment: '意気込み', musicUrl: '入場曲のリンク', photo: '写真', contactName: 'お名前', contactPhone: '電話番号', contactEmail: 'メールアドレス', consent: '同意のチェック' };
const NEXT_LABEL: Record<Key, string> = { gym: 'ジム名を入れる', name: '選手名を入れる', height: '身長を入れる', weight: '体重を入れる', division: '区分を選ぶ', weightClass: '階級を選ぶ', record: '戦績を入れる', fighterClass: 'クラスを選ぶ', grade: '学年を入れる', age: '年齢を入れる', comment: '意気込みを入れる', musicUrl: '入場曲のリンクを入れる', photo: 'ここを押して写真をえらぶ', contactName: 'お名前を入れる', contactPhone: '電話番号を入れる', contactEmail: 'メールアドレスを入れる', consent: '最後にここにチェック' };
const TEXT_KEYS: Key[] = ['gym', 'name', 'height', 'weight', 'record', 'grade', 'age', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail'];

/** 全角→半角にそろえ、見えない文字（向きの印・幅ゼロの空白など）を取る。これを通してから、ほかの決まりで調べる */
const nfkc = (value: string) => stripInvisible(value.normalize('NFKC'));
const noSpace = (value: string) => value.replace(/\s+/g, '');
const trimAll = (value: string) => stripInvisible(value).replace(/^[\s　]+|[\s　]+$/g, '');
/** 数字の欄を、数字だけにそろえる。全角・単位・コンマ・「15.0」を自動で直す（この画面の中だけの整形。受付側のルールは変えない）。 */
const cleanNumber = (value: string, units: RegExp) => noSpace(nfkc(value).replace(units, '')).replace(/,/g, '.').replace(/^(\d+)\.0+$/, '$1');
function normalizeFighter(f: EntryFighter): EntryFighter {
  return {
    ...f,
    // 見えない文字だけの欄は、空と同じ。前後の空白も取る
    gym: trimAll(f.gym), name: trimAll(f.name), grade: trimAll(f.grade), record: trimAll(f.record), comment: trimAll(f.comment),
    height: cleanNumber(f.height, /センチメートル|センチ|cm|m/gi),
    weight: cleanNumber(f.weight, /キログラム|キロ|kg/gi),
    age: cleanNumber(f.age, /歳|才|さい/g),
    musicUrl: lowerLinkHost(noSpace(nfkc(f.musicUrl))),
  };
}
/** 電話番号：全角→半角、ハイフン・長音・点・かっこ・空白を外す、+81 は先頭の0にする（「/」で2つ並べた番号などは、のこして赤で知らせる） */
const normalizePhone = (value: string) => nfkc(value).replace(/[\s\u3000\-ー－―‐‑–—−・.．()（）[\]]/g, '').replace(/^\+810?/, '0');
/** メール：全角→半角、前後の空白を外す、先頭の mailto: を外す、末尾の , 。 、 ; を外す。真ん中の空白は消さない（別のアドレスになるので、赤で知らせる） */
const normalizeEmail = (value: string) => trimAll(trimAll(nfkc(value)).replace(/^mailto:/i, '').replace(/[,.;。、]+$/, ''));
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
    case 'photo': return '顔写真がまだです。上の「📷 写真をえらぶ（撮る・アルバムから）」を押してください。';
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
      if (value.length > 10) return { text: `${label}は10文字までです。数字だけ入れてください。例：${example}`, early: true };
      if (!/^\d+(\.\d+)?$/.test(value)) return { text: `数字だけを入れてください。例：${example}`, early: false };
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
      return MUSIC_URL_FORM.test(value) ? null : { text: 'Apple MusicかYouTubeのリンクを貼ってください。例：https://music.apple.com/…', early: false };
    }
    case 'contactName': return tooLong(contact.name, 100);
    case 'contactPhone': {
      const p = contact.phone;
      if (!p) return null;
      if (/\D/.test(p)) return { text: '電話番号は、数字だけで、1つだけ入れてください。文字や、2つ目の番号は消してください。例：09012345678', early: false };
      if (!/^0\d{9,10}$/.test(p)) return { text: '電話番号は0から始まる10〜11けたです。例：09012345678', early: false };
      // フリーダイヤルは、けた数より先に知らせる（0800-123-456 は10けた）
      if (/^0(120|800)/.test(p)) return { text: 'フリーダイヤル（0120・0800）では、主催者がかけても、本人につながりません。連絡がつく携帯電話などの番号を入れてください。例：09012345678', early: false };
      // いちばんよくある打ちまちがい：1けた足りない・多い。携帯（050・070・080・090）は、かならず11けた
      if (/^0[5789]0/.test(p) && p.length !== 11) return { text: `携帯の電話番号は11けたです。いま${p.length}けたです。1けた足りないか、多いかもしれません。例：09012345678`, early: false };
      // 0000000000・09000000000・03-0000-0000 のように、同じ数字が後ろにならぶ番号
      if (/^(\d)\1+$/.test(p) || /(\d)\1{7}$/.test(p)) return { text: '同じ数字がならんでいます。電話番号をもう一度見てください。例：09012345678', early: false };
      // 「00」で始まる番号は無い。11けたは、携帯（050・070・080・090）だけ
      if (/^00/.test(p)) return { text: '「00」で始まる番号は、使えません。日本の電話番号を入れてください。例：09012345678', early: false };
      if (!phoneFormOk(p)) return { text: '11けたの番号は、携帯電話（050・070・080・090で始まる）だけです。もう一度見てください。例：09012345678', early: false };
      return null;
    }
    case 'contactEmail': {
      const value = contact.email;
      if (!value) return null;
      if (value.length > 200) return { text: `長すぎます（いま${value.length}字／200字まで）`, early: true };
      if (/\s/.test(value)) return { text: 'メールアドレスの途中に空白があります。空白を取って、1つだけ入れてください。例：name@example.com', early: false };
      if (/[,;、，；]/.test(value) || (value.match(/@/g) || []).length > 1) return { text: 'メールアドレスは、1つだけ入れてください。例：name@example.com', early: false };
      if (/[^\x00-\x7F]/.test(value)) return { text: '日本語は使えません。半角で入れてください。例：name@example.com', early: false };
      if (/[<>()"']/.test(value)) return { text: 'メールアドレスに、使えない記号（< > ( ) " \'）があります。記号を取って、アドレスだけを入れてください。例：name@example.com', early: false };
      return emailFormOk(value) ? null : { text: 'メールアドレスの形がちがいます。例：name@example.com', early: false };
    }
    default: return null;
  }
}

/** まとめて全部の欄を調べる。順番と文言のもとは、これまでの確認と同じ。形のまちがいは、欄ごとに具体的な文で上書きする。 */
function validate(nf: EntryFighter, hasPhoto: boolean, config: PublicEntryConfig, contact: { name: string; phone: string; email: string; consent: boolean }, ready: boolean, emailOk: string, chosenClass: 'upper' | 'lower' | '' = '', division = '', weightClass = '') {
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
  // 階級分け（シートの設定が「あり」のときだけ）。区分→階級の順に選ぶ。選んでいないと送れない。階級のない区分（小学生以下など）は、階級を選ばなくてよい
  if (config.weights) {
    const picked = weightChoiceError(division, weightClass, config.weights);
    if (picked) { errors.push(picked); put(picked.startsWith('区分') ? 'division' : 'weightClass', picked); }
  }
  // クラス分け（シートの設定が「あり」のときだけ）。選んでいないと送れない。戦績とちがっても、送れる
  if (config.classes?.enabled && !chosenClass) {
    errors.push('クラスを選んでください。');
    put('fighterClass', 'クラスを選んでください（' + config.classes.upper.name + 'か' + config.classes.lower.name + '）。');
  }
  if (!trimAll(contact.name)) { errors.push('連絡先のお名前を入力してください。'); put('contactName', 'お名前がまだです。連絡がつく人の名前を入力してください。'); }
  if (!contact.phone) { errors.push('電話番号を確認してください。'); put('contactPhone', '電話番号がまだです。例：09012345678（ハイフンは、あってもなくてもOKです）'); }
  if (!contact.email) { errors.push('メールアドレスを確認してください。'); put('contactEmail', 'メールアドレスがまだです。例：name@example.com'); }
  else {
    const suspect = emailSuspect(contact.email);
    if (suspect && !fields.contactEmail && emailOk !== contact.email) { errors.push('メールアドレスを確認してください。'); put('contactEmail', `「${suspect.bad}」になっています。「${suspect.good}」ではありませんか？ 下の「直す」か「このまま使う」を押してください`); }
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

/** size：文字の大きさ（ふつうは text-[1.0625rem]。クラス分けの箱は、17px以上にするため text-lg） / status：読み上げに知らせたいとき */
function Caution({ title, children, className = '', size = 'text-[1.0625rem]', status = false }: { title?: string; children: ReactNode; className?: string; size?: string; status?: boolean }) {
  return <div role={status ? 'status' : 'note'} className={'tos-caution ' + size + ' ' + className}><span aria-hidden="true" className="tos-icon">⚠</span>{title ? <span className="tos-caution-title">{title}：</span> : null}{children}</div>;
}
/** icon：ふつうは ✕（まちがい）。送れなくはない やさしい赤（クラスと戦績がちがう）は ⚠ にする / status：alert ほど強くなく読み上げる */
function ErrorLine({ id, children, className = '', alert = false, big = false, icon = '✕', status = false, size }: { id?: string; children: ReactNode; className?: string; alert?: boolean; big?: boolean; icon?: string; status?: boolean; size?: string }) {
  return <p id={id} role={alert ? 'alert' : status ? 'status' : undefined} className={'tos-error ' + (size ?? (big ? 'text-xl' : 'text-[1.0625rem]')) + ' ' + className}><span aria-hidden="true" className="tos-icon">{icon}</span>{children}</p>;
}
function OkLine({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return <p id={id} className={'tos-ok text-[1.0625rem] ' + className}><span aria-hidden="true" className="tos-icon">✓</span>{children}</p>;
}
/** 灰色の「i」の案内。赤でも黄でもない、ただの説明（黄は「次はここ」と、ほんとうに気をつけることだけ） */
function Note({ children, className = '', title, id, status = false }: { children: ReactNode; className?: string; title?: string; id?: string; status?: boolean }) {
  return <div id={id} role={status ? 'status' : 'note'} className={'tos-note text-[1.0625rem] ' + className}><span aria-hidden="true" className="tos-icon">i</span>{title ? <b>{title}：</b> : null}{children}</div>;
}
function LockReason({ children }: { children: ReactNode }) {
  return <p className="tos-locked-reason mt-2"><span aria-hidden="true" className="tos-icon">🔒</span>{children}</p>;
}

/** 画面の中の確認箱。やめる（何も変えない）が左・大きく・最初に選ばれている。閉じたら、開く前に居た場所へ戻る */
function DangerConfirm({ title, lines, safeLabel, dangerLabel, onSafe, onDanger }: { title: string; lines: string[]; safeLabel: string; dangerLabel: string; onSafe: () => void; onDanger: () => void }) {
  const safeRef = useRef<HTMLButtonElement>(null);
  const safeNow = useRef(onSafe);
  safeNow.current = onSafe;
  useEffect(() => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    safeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); safeNow.current(); } };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const back = opener && opener.isConnected ? opener : document.getElementById('f-gym');
      back?.focus({ preventScroll: true });
    };
  }, []);
  return <div role="alertdialog" aria-labelledby="danger-confirm-title" aria-describedby="danger-confirm-lines" className="tos-confirm mt-4">
    <p id="danger-confirm-title" className="tos-danger text-lg"><span aria-hidden="true" className="tos-icon">✕</span>{title}</p>
    <div id="danger-confirm-lines">{lines.map((line) => <p key={line} className="tos-danger mt-1 text-[1.0625rem]">{line}</p>)}</div>
    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
      <button ref={safeRef} type="button" onClick={onSafe} className="tos-safe-btn w-full text-lg sm:flex-[2]">{safeLabel}</button>
      <button type="button" onClick={onDanger} className="tos-danger-btn w-full text-[1.0625rem] sm:flex-1">{dangerLabel}</button>
    </div>
  </div>;
}

function Chip({ children, tone, size = 'text-[1.0625rem]' }: { children: ReactNode; tone: 'need' | 'opt' | 'here' | 'done'; size?: string }) {
  const cls = tone === 'need' ? 'border-2 border-indigo-700 bg-indigo-50 text-indigo-900' : tone === 'opt' ? 'bg-slate-200 text-slate-800' : tone === 'here' ? 'bg-indigo-700 text-white' : 'bg-emerald-700 text-white';
  return <span className={'ml-2 inline-block rounded-full px-2.5 py-0.5 align-middle font-bold leading-normal ' + size + ' ' + cls}>{children}</span>;
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
      {badge === '任意' ? <span className="text-[1.0625rem] font-bold text-slate-700">（空でもOK）</span> : null}
    </div>
    {hint ? <p id={id + '-hint'} className="mt-1 text-[1.0625rem] font-medium leading-relaxed text-slate-700">{hint}</p> : null}
    {example && example.length ? <p id={id + '-ex'} className="tos-example mt-1">例：{example.map((e, i) => <span key={e}>{i ? ' ／ ' : ''}<code>{e}</code></span>)}</p> : null}
    {children}
    {extra}
    {note && !error ? <OkLine id={id + '-note'} className="mt-2">自動で直しました：{note}</OkLine> : null}
    {error ? <ErrorLine id={id + '-err'} className="mt-2"><span className="min-w-0">{error}</span></ErrorLine> : null}
  </NextBox>;
}

function Fold({ id, title, sub, children }: { id?: string; title: string; sub?: string; children: ReactNode }) {
  return <details id={id} className="group mt-4 scroll-mt-24 rounded-2xl border-2 border-slate-300 bg-white">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 text-lg font-bold"><span className="min-w-0">{title}{sub ? <span className="mt-0.5 block text-[1.0625rem] font-medium text-slate-700">{sub}</span> : null}</span><span aria-hidden="true" className="shrink-0 text-[1.0625rem] font-medium text-slate-700"><span className="group-open:hidden">▶ ひらく</span><span className="hidden group-open:inline">▼ とじる</span></span></summary>
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
  /** クラス分け：選んだほう（'upper'＝上のクラス、'lower'＝下のクラス）。シートの設定が「なし」のときは、ずっと空 */
  const [chosenClass, setChosenClass] = useState<'upper' | 'lower' | ''>('');
  /** 階級分け：選んだ区分（設定にある名前）と階級（保存する形。例：37kg以下）。リンクに階級分けが無いときは、ずっと空 */
  const [division, setDivision] = useState('');
  const [weightClass, setWeightClass] = useState('');
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
  /** 指や マウスを押している間は、欄を出た時の自動なおし（レイアウトが動く）を、離すまで待つ。動くと、押した所が ずれて、タップが消える */
  const pointerDownRef = useRef(false);
  const pendingLeaveRef = useRef<Key[]>([]);
  const leaveRef = useRef<(key: Key) => void>(() => {});
  /** いま出ている赤い文が「電波がありません」のとき true。電波が戻ったら、この文だけ消す */
  const offlineMsgRef = useRef(false);

  const say = (text: string, kind: Tone = 'info') => { offlineMsgRef.current = false; setMessage(text); setTone(kind); };

  const applyConfig = (next: PublicEntryConfig, hash = '') => {
    setConfig(next);
    // setup 画面が作るリンクには、決まったキーが全部入っていて、最後に end=1 が付く。後ろが欠けていたら、途中で切れている
    setLinkCut(publicEntryLinkCut(hash));
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
    // 読み込みの前に layout の小さな補助が data-theme を付けていたら、元は「なし」だったことにする
    const booted = root.hasAttribute('data-theme-boot');
    const before = booted ? null : root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => { root.removeAttribute('data-theme-boot'); if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); };
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
      if (resultTimerRef.current) { clearTimeout(resultTimerRef.current); resultTimerRef.current = null; }
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
    const sync = () => {
      const now = navigator.onLine !== false;
      setOnline(now);
      if (now && offlineMsgRef.current) { offlineMsgRef.current = false; setMessage(''); }
    };
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
    // 送れたか分からないとき：押すべきボタンを画面の真ん中に出して、そこに合わせる（上の帯や 別のボタンに隠れない）
    if (!confirmationPending) return;
    const id = window.setTimeout(() => {
      const button = document.getElementById('f-submit');
      button?.scrollIntoView({ block: 'center' });
      button?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(id);
  }, [confirmationPending]);
  useEffect(() => {
    if (!reviewing) return;
    const heading = reviewHeadingRef.current;
    heading?.scrollIntoView({ block: 'start' });
    heading?.focus({ preventScroll: true });
  }, [reviewing]);

  const nf = useMemo(() => normalizeFighter(fighter), [fighter]);
  /** 連絡先のお名前（見えない文字・前後の空白を取ったもの） */
  const cname = trimAll(contactName);
  const phone = useMemo(() => normalizePhone(contactPhone), [contactPhone]);
  const email = useMemo(() => normalizeEmail(contactEmail), [contactEmail]);
  // クラス分け（シートの設定が「あり」のときだけ出る）。戦績の文字を読む処理は、入力のたびに1回だけ走らせる
  const classes = config.classes?.enabled ? config.classes : undefined;
  const classSuggest = useMemo(() => (classes ? suggestClass(fighter.record, classes) : null), [classes, fighter.record]);
  const classMismatchText = useMemo(() => (classes && chosenClass ? classMismatch(fighter.record, classes[chosenClass].name, classes) : ''), [classes, chosenClass, fighter.record]);
  // 階級分け（シートの設定が「あり」のときだけ出る）。区分を選ぶと、その区分の階級が出る。階級のない区分（小学生以下など）は、階級の欄を出さない
  const weights = config.weights?.enabled ? config.weights : undefined;
  const pickedDivision = weights ? findDivision(division, weights) : undefined;
  const needClass = !!pickedDivision && pickedDivision.classes.length > 0;
  const noClass = !!pickedDivision && pickedDivision.classes.length === 0;
  const classPicked = needClass && !!normalizeWeightClass(division, weightClass, weights);
  const payloadKey = JSON.stringify([fighter.gym, fighter.name, fighter.grade, fighter.age, nf.age, nf.height, nf.weight, fighter.record, fighter.comment, nf.musicUrl, contactName, phone, email, photo, classes ? chosenClass : '', ...(weights ? [division, weightClass] : [])]);
  const contactNow: ContactNow = { name: cname, phone, email };
  const hasInput = [fighter.gym, fighter.name, fighter.grade, fighter.age, fighter.height, fighter.weight, fighter.record, fighter.comment, fighter.musicUrl, contactName, contactPhone, contactEmail].some((v) => v.trim()) || Boolean(photo) || consent || Boolean(chosenClass) || Boolean(division);
  hasInputRef.current = hasInput;
  // 確認の画面は、中身が本当に変わったときだけ閉じる（前後の空白を消すだけの自動なおしでは、閉じない）
  const reviewKey = JSON.stringify([trimAll(fighter.gym), trimAll(fighter.name), trimAll(fighter.grade), nf.age, nf.height, nf.weight, trimAll(fighter.record), trimAll(fighter.comment), nf.musicUrl, trimAll(contactName), phone, email, photo, classes ? chosenClass : '', ...(weights ? [division, weightClass] : []), consent]);
  useEffect(() => {
    if (reviewingRef.current) say('内容を直したので、もう一度「入力内容を確認する →」を押してください。', 'warn');
    setReviewing(false);
  }, [reviewKey, config]);

  useEffect(() => {
    // 入力が1つでもある間、閉じる前に確認を出す（送るときだけ外す）。入力はこの端末に残さない
    if (!hasInput || sending) return;
    const guard = (event: BeforeUnloadEvent) => { if (allowLeaveRef.current) return; event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [hasInput, sending]);

  useEffect(() => {
    // 押している間は待ち、click が終わった直後にまとめて自動なおしをする（click の前にやると、押した所が ずれて、チェックが入らなくなる）。
    // click が来ないとき（押したまま外で離した、など）のために、離して0.4秒後にも流す
    let late: ReturnType<typeof setTimeout> | null = null;
    let stuck: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      pointerDownRef.current = false;
      if (late) { clearTimeout(late); late = null; }
      if (stuck) { clearTimeout(stuck); stuck = null; }
      const keys = pendingLeaveRef.current;
      pendingLeaveRef.current = [];
      keys.forEach((key) => leaveRef.current(key));
    };
    const down = () => {
      pointerDownRef.current = true;
      if (stuck) clearTimeout(stuck);
      stuck = setTimeout(flush, 4000);
    };
    const up = () => { if (late) clearTimeout(late); late = setTimeout(flush, 400); };
    const cancel = () => { if (late) clearTimeout(late); late = setTimeout(flush, 0); };
    const afterClick = () => { if (late) clearTimeout(late); late = setTimeout(flush, 0); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('click', afterClick);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('click', afterClick);
      if (late) clearTimeout(late);
      if (stuck) clearTimeout(stuck);
    };
  }, []);

  const clearError = (key: Key) => {
    setFieldErrors((old) => { if (!old[key]) return old; const rest = { ...old }; delete rest[key]; return rest; });
    setNotes((old) => { if (!old[key]) return old; const rest = { ...old }; delete rest[key]; return rest; });
    setTouched((old) => (old[key] ? { ...old, [key]: false } : old));
    if (tone === 'error' || tone === 'ok') setMessage('');
  };
  const change = (key: keyof EntryFighter, value: string) => { setFighter((old) => ({ ...old, [key]: value })); clearError(key as Key); };
  /** 区分を変えたら、階級は空に戻す（前の区分の階級は、新しい区分に無いことがある） */
  const changeDivision = (value: string) => { setDivision(value); setWeightClass(''); clearError('division'); clearError('weightClass'); };
  const changeWeightClass = (value: string) => { setWeightClass(value); clearError('weightClass'); };
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
  leaveRef.current = leave;
  const leaveSoon = (key: Key) => {
    if (pointerDownRef.current) { if (!pendingLeaveRef.current.includes(key)) pendingLeaveRef.current.push(key); return; }
    leave(key);
  };
  /** 欄を画面に出す。背の高い箱（クラス）は、真ん中に置くと上の見出しが上の帯に隠れるので、上の帯の下に頭をそろえる */
  const focusField = (key: Key) => {
    const target = document.getElementById(key === 'photo' ? 'f-photo-box' : 'f-' + key);
    if (target) {
      const rect = target.getBoundingClientRect();
      const bar = Math.min(window.innerHeight * 0.35, 160) + 16;
      if (rect.height > window.innerHeight * 0.45) window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - bar - 64) });
      else if (key === 'photo') target.scrollIntoView({ block: 'center' });
      else window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - bar - 150) }); // 欄の上の見出し・例も、上の帯の下に出す
    }
    document.getElementById('f-' + key)?.focus({ preventScroll: true });
  };
  /** 赤い帯の「とじる」：閉じたあと、フォーカスが消えないよう、まちがいのある最初の欄（なければジム名）へ移す */
  const closeMessage = () => {
    setMessage('');
    const keys = (Object.keys(fieldErrors) as Key[]).map((key) => ({ key, el: document.getElementById(key === 'photo' ? 'f-photo' : 'f-' + key) })).filter((x): x is { key: Key; el: HTMLElement } => Boolean(x.el));
    keys.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    (keys[0]?.el ?? document.getElementById('f-gym'))?.focus({ preventScroll: true });
  };
  const focusFirst = (fields: FieldErrors) => {
    const boxes = (Object.keys(fields) as Key[]).map((key) => ({ key, el: document.getElementById(key === 'photo' ? 'f-photo-box' : 'f-' + key) })).filter((x): x is { key: Key; el: HTMLElement } => Boolean(x.el));
    boxes.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (boxes[0]) focusField(boxes[0].key);
  };

  const order: Array<[Key, boolean]> = [['gym', !!nf.gym], ['name', !!nf.name], ['height', !!nf.height], ['weight', !!nf.weight],
    ...(weights ? [['division', !!pickedDivision] as [Key, boolean]] : []), ...(needClass ? [['weightClass', classPicked] as [Key, boolean]] : []),
    ['record', !!nf.record],
    ...(classes ? [['fighterClass', !!chosenClass] as [Key, boolean]] : []),
    ...(config.grade === 'required' ? [['grade', !!nf.grade] as [Key, boolean]] : []), ...(config.age === 'required' ? [['age', !!nf.age] as [Key, boolean]] : []), ...(config.comment === 'required' ? [['comment', !!nf.comment] as [Key, boolean]] : []),
    ...(config.music ? [['musicUrl', !!nf.musicUrl] as [Key, boolean]] : []), ['photo', !!photo], ['contactName', !!cname], ['contactPhone', !!phone], ['contactEmail', !!email], ['consent', consent]];

  const submit = (confirmed = false, resend = false) => {
    if (sendingRef.current) return;
    if (photoLoadingRef.current) { setReviewing(false); say('まだ送れません：写真を準備しています。写真が表示されてから押してください。', 'warn'); return; }
    if (confirmed && !reviewing && !resend) return;
    const { errors, fields } = validate(nf, Boolean(photo), config, { name: cname, phone, email, consent }, publicEntryReady(config) && !linkCut, emailOk, chosenClass, division, weightClass);
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
      resultTimerRef.current = null;
      if (!sendingRef.current) return;
      allowLeaveRef.current = false;
      sendingRef.current = false; setSending(false);
      setConfirmationPending(true);
      say('通信に時間がかかっています。Googleの画面が出たら、そのままお待ちください。出ないときだけ、下の「もう一度送る」を押してください。', 'warn');
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
          : notImage ? `これは写真ではありません（${name}）。写真アプリの写真を選んでください。`
            : '写真が読み込めませんでした。写真アプリの別の写真を選ぶか、その場でカメラで撮ってください。') + (kept ? ' 前の写真はそのままです。' : ''),
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

  const infoItems = [nf.gym, nf.name, nf.height, nf.weight, nf.record, photo,
    ...(weights ? [pickedDivision?.name ?? ''] : []), ...(needClass ? [classPicked ? weightClass : ''] : []),
    ...(classes ? [chosenClass] : []),
    ...(config.grade === 'required' ? [nf.grade] : []), ...(config.age === 'required' ? [nf.age] : []), ...(config.comment === 'required' ? [nf.comment] : []), ...(config.music ? [nf.musicUrl] : [])].map(Boolean);
  const contactItems = [cname, phone, email, consent ? 'yes' : ''].map(Boolean);
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
    else if (reviewing) nextKind = callFirst ? 'call' : online ? 'send' : 'none';
    else if (photoLoading) nextKind = 'none';
    else if (todoKey || stickOk) nextKind = 'field';
    else nextKind = confirmationPending && !changedAfterSend ? 'resend' : 'confirm';
  }
  const markKey: Key | null = nextKind === 'field' ? (stickOk ? stick : todoKey) : null;
  const nextLabel = (key: Key): string => {
    if (key === 'photo') return photoError && !photo ? 'もう一度、写真をえらぶ' : NEXT_LABEL.photo;
    if (key === 'contactEmail' && emailAsk) return 'メールアドレスの質問に答える';
    // 「直す」は、何か入っていて、赤い文が出ているときだけ。空っぽの欄や、入力の途中では、まちがいと言わない
    const empty = order.find(([k]) => k === key)?.[1] === false;
    return !empty && shown(key) ? `${SHORT[key]}を直す` : NEXT_LABEL[key];
  };
  const prefix = '次はここ';
  // 身長と体重が逆かもしれない（黄色の注意だけ。送るのは止めない）
  const isNum = (v: string) => /^\d+(\.\d+)?$/.test(v);
  const swapSuspect = Boolean(touched.height && touched.weight && isNum(nf.height) && isNum(nf.weight) && Number(nf.height) >= 50 && Number(nf.height) <= 250 && Number(nf.weight) >= 10 && Number(nf.weight) <= 250 && Number(nf.weight) >= Number(nf.height));

  const ids = (key: Key, parts: { hint?: boolean; example?: boolean } = {}) => ({
    id: 'f-' + key,
    'aria-invalid': shown(key) ? true : undefined,
    'aria-describedby': [parts.hint ? 'f-' + key + '-hint' : '', parts.example ? 'f-' + key + '-ex' : '', notes[key] && !shown(key) ? 'f-' + key + '-note' : '', shown(key) ? 'f-' + key + '-err' : ''].filter(Boolean).join(' ') || undefined,
  });
  const look = (key: Key) => inputBase + (shown(key) ? ' tos-input-error' : ' border-slate-500 bg-white');
  const fieldProps = (key: Key) => ({ error: shown(key) || undefined, note: notes[key], next: markKey === key ? nextLabel(key) : undefined, nextPrefix: prefix });

  const META: Record<'gym' | 'name' | 'height' | 'weight' | 'record' | 'grade' | 'age' | 'comment' | 'musicUrl' | 'contactName' | 'contactPhone' | 'contactEmail', { hint: string; example: string[] }> = {
    gym: { hint: '通っているジム・道場の名前です。通っていない時は「無所属」と入れてください。', example: ['フラットアップジム'] },
    name: { hint: '試合で呼ばれる名前です。本名でも、あだ名でもOK', example: ['山田 太郎'] },
    height: { hint: '数字だけ入れてください。「cm」は書かなくてもOK', example: ['170'] },
    weight: { hint: '試合に出る体重（kg）です。わからない時は、今の体重を入れてください。', example: ['55'] },
    record: { hint: '試合の成績です。はじめてなら「初試合」と書いてください', example: ['初試合', '3勝1敗', '空手3年'] },
    grade: { hint: '30文字までです', example: ['中2', '高1', '社会人'] },
    age: { hint: '数字だけ入れてください', example: ['15'] },
    comment: { hint: config.comment === 'required' ? '試合で紹介される一言です。必ず書いてください。' : '試合で紹介される一言です。書かなくても大丈夫です。', example: ['全力でがんばります'] },
    musicUrl: { hint: 'Apple Music か YouTube の、曲のリンクを貼ってください。', example: ['https://music.apple.com/…'] },
    contactName: { hint: '連絡がつく人の名前（本人か保護者）', example: ['山田 花子'] },
    contactPhone: { hint: 'ハイフンは、あってもなくても大丈夫です。数字は全角でもOK', example: ['09012345678'] },
    contactEmail: { hint: 'お持ちでなければ、保護者の方のメールアドレスで大丈夫です', example: ['name@example.com'] },
  };

  const fighterField = (key: 'gym' | 'name' | 'height' | 'weight' | 'record' | 'grade' | 'age', label: string, extraNode?: ReactNode, inputMode?: 'decimal' | 'numeric') =>
    <Field key={key} id={'f-' + key} label={label} hint={META[key].hint} example={META[key].example} extra={extraNode} {...fieldProps(key)}>
      <input {...ids(key, { hint: true, example: true })} className={look(key)} value={fighter[key]} placeholder={key === 'record' ? '初試合' : undefined} inputMode={inputMode} autoComplete="off" enterKeyHint="next" onChange={(e) => change(key, e.target.value)} onBlur={() => leaveSoon(key)} />
    </Field>;
  const gradeField = () => fighterField('grade', '学年 ' + (config.grade === 'required' ? '必須' : '任意'));
  const ageField = () => fighterField('age', '年齢 ' + (config.age === 'required' ? '必須' : '任意'), undefined, 'numeric');
  const commentLeft = 500 - nf.comment.length;
  const commentField = () => <Field key="comment" id="f-comment" label={'意気込み ' + (config.comment === 'required' ? '必須' : '任意')} hint={META.comment.hint} example={META.comment.example} {...fieldProps('comment')}
    extra={<><p className="mt-2 text-[1.0625rem] font-bold text-slate-700">{commentLeft >= 0 ? `あと${commentLeft}文字（500文字まで）` : ''}</p><Caution className="mt-2">会場の画面に出ます。住所や電話番号は書かない</Caution></>}>
    <textarea {...ids('comment', { hint: true, example: true })} rows={3} className={look('comment')} value={fighter.comment} autoComplete="off" onChange={(e) => change('comment', e.target.value)} onBlur={() => leaveSoon('comment')} />
  </Field>;
  const requiredExtra = [config.grade === 'required' ? gradeField() : null, config.age === 'required' ? ageField() : null, config.comment === 'required' ? commentField() : null];
  const optionalExtra = [config.grade === 'optional' ? gradeField() : null, config.age === 'optional' ? ageField() : null, config.comment === 'optional' ? commentField() : null].filter(Boolean);

  // 階級分け（シートの設定が「あり」のときだけ出る）。ふつうの「選ぶ欄」を2つ：区分 → 階級。
  // 区分を選ぶと、その区分の階級だけが出る。階級のない区分（小学生以下など）は、階級の欄のかわりに灰色の説明を出す。選んでいないと送れない（赤い ✕）
  const divisionField = () => {
    if (!weights) return null;
    return <Field key="division" id="f-division" label="区分 必須" hint="出る区分を選んでください。区分によって、選べる階級（体重で分けたグループ）がちがいます。"
      extra={noClass ? <Note id="f-weightClass-none" status className="mt-2">この区分には階級がありません。体重が近い人どうしで組みます。</Note> : undefined} {...fieldProps('division')}>
      <select {...ids('division', { hint: true })} aria-required="true" className={look('division')} value={division} autoComplete="off" onChange={(e) => changeDivision(e.target.value)}>
        <option value="">選んでください</option>
        {weights.divisions.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
      </select>
    </Field>;
  };
  const weightClassField = () => {
    if (!weights || !pickedDivision || !needClass) return null;
    return <Field key="weightClass" id="f-weightClass" label="階級 必須" hint="体重に合う階級を選んでください。" {...fieldProps('weightClass')}>
      <select {...ids('weightClass', { hint: true })} aria-required="true" className={look('weightClass')} value={weightClass} autoComplete="off" onChange={(e) => changeWeightClass(e.target.value)}>
        <option value="">選んでください</option>
        {pickedDivision.classes.map((c) => <option key={c} value={c}>{weightClassLabel(c)}</option>)}
      </select>
    </Field>;
  };

  // クラス分け（シートの設定が「あり」のときだけ出る）。
  // 大きな2つの選択肢。それぞれの『すぐ下』に、条件とルールを出す。選ぶのは本人。目安（黄）と ちがい（赤）は、見せるだけで、送るのは止めない。
  const classNeutral = Boolean(classes && !classSuggest && nf.record && touched.record);
  const classErr = fieldErrors.fighterClass;
  const classField = () => {
    if (!classes) return null;
    const sides = [['upper', classes.upper], ['lower', classes.lower]] as const;
    return <NextBox key="fighterClass" on={markKey === 'fighterClass'} label={nextLabel('fighterClass')} prefix={prefix} float>
      <fieldset id="f-fighterClass" tabIndex={-1} role="radiogroup" aria-required="true" aria-invalid={classErr ? true : undefined} aria-describedby={'f-fighterClass-hint' + (classErr ? ' f-fighterClass-err' : '')} className="m-0 min-w-0 scroll-mt-24 rounded-2xl border-0 p-0 outline-none focus:ring-4 focus:ring-indigo-600">
        <legend className="block p-0 text-lg font-bold leading-snug [text-wrap:balance]">クラス<Chip tone="need" size="text-[1.0625rem]">必須</Chip></legend>
        <p id="f-fighterClass-hint" className="mt-1 text-[1.0625rem] font-medium leading-relaxed text-slate-700">条件とルールを読んで、合うほうを選んでください。</p>
        {classErr ? <ErrorLine id="f-fighterClass-err" size="text-lg" className="mt-3"><span className="min-w-0">{classErr}</span></ErrorLine> : null}
        <div id="f-fighterClass-live">{classSuggest ? <Caution title="目安" status size="text-lg" className="mt-3"><span className="font-bold">{suggestText(classSuggest.name)}</span>{classMismatchText ? null : <p className="mt-1">目安です。どちらにするかは、ご自分で決めてください。</p>}</Caution> : null}
        {classNeutral ? <p role="status" className="tos-note mt-3 text-lg"><span aria-hidden="true" className="tos-icon">i</span>{CLASS_NEUTRAL_NOTE}</p> : null}
        {classMismatchText ? <><ErrorLine status icon="⚠" size="text-lg" className="mt-3"><span className="min-w-0">{classMismatchText}</span></ErrorLine><p className="mt-1 text-lg font-bold text-slate-800">合っていれば、そのまま送れます。</p></> : null}</div>
        <div className="mt-3 grid gap-3">
          {sides.map(([key, side]) => {
            const on = chosenClass === key;
            return <label key={key} className={'flex min-h-14 min-w-0 cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 text-lg focus-within:ring-4 focus-within:ring-indigo-600 ' + (on ? 'border-emerald-600 bg-emerald-50' : classErr ? 'tos-input-error' : 'border-slate-500 bg-white')}>
              <input type="radio" name="fighterClass" value={key} checked={on} aria-labelledby={'f-class-' + key + '-name'} aria-describedby={'f-class-' + key + '-info'} onChange={() => { setChosenClass(key); clearError('fighterClass'); }} className="mt-1 h-7 w-7 shrink-0 accent-indigo-700" />
              <span className="block min-w-0 flex-1">
                <span id={'f-class-' + key + '-name'} className="block break-words text-2xl font-black leading-tight">{side.name}</span>
                <span id={'f-class-' + key + '-info'} className="mt-1 block min-w-0 text-lg font-medium leading-relaxed text-slate-900">
                  <span className="block whitespace-pre-wrap break-words"><b>条件：</b>{side.condition}</span>
                  <span className="mt-1 block whitespace-pre-wrap break-words"><b>ルール：</b>{side.rule}</span>
                </span>
                {on ? <span className="mt-2 inline-block rounded-full bg-emerald-700 px-3 py-0.5 text-[1.0625rem] font-bold text-white">✓ えらびました</span> : null}
              </span>
            </label>;
          })}
        </div>
      </fieldset>
    </NextBox>;
  };

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
    setContactName(''); setContactPhone(''); setContactEmail(''); setConsent(false); setChosenClass(''); setDivision(''); setWeightClass('');
    setFieldErrors({}); setNotes({}); setTouched({}); setEmailOk(''); setAttempted(false);
    setRequestId(''); setConfirmationPending(false); setReviewing(false);
    sentPayloadRef.current = '';
    say('入力を消しました。次の人の申し込みを、始められます。', 'ok');
    window.scrollTo({ top: 0 });
    document.getElementById('f-gym')?.focus({ preventScroll: true });
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
    if (!(el instanceof HTMLInputElement) || ['checkbox', 'radio', 'file', 'button', 'submit'].includes(el.type)) return;
    e.preventDefault();
    const list = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input:not([type=file]):not([type=checkbox]):not([type=hidden]), textarea, select'));
    const i = list.indexOf(el);
    if (i >= 0 && i < list.length - 1) list[i + 1].focus();
    else submit();
  };
  const onFieldsFocus = (e: { target: EventTarget }) => {
    const id = (e.target as HTMLElement).id || '';
    const key = id.startsWith('f-') ? (id.slice(2) as Key) : null;
    setStick(key && TEXT_KEYS.includes(key) && key === todoKeyRef.current ? key : null);
  };

  if (!loaded) return <main data-tos-loading="1" className="min-h-screen bg-slate-50 px-4 py-10 text-lg font-medium text-slate-950 [color-scheme:light]"><p className="mx-auto max-w-3xl text-center text-slate-700">よみこみ中…</p></main>;

  const isTest = config.mode === 'test';
  const locked = sending || photoLoading || !endpointReady;
  const lockReason = !endpointReady ? '今は押せません：このリンクは使えません' : sending ? '送信中は押せません' : photoLoading ? '写真ができるまで待ちます' : '';
  const statusLabel = !endpointReady ? '' : isTest ? 'テスト用画面（本番ではありません）' : deadlinePassed ? '締切を過ぎています' : '申し込み受付中';
  const msgBox = tone === 'error' ? 'tos-error' : tone === 'ok' ? 'tos-ok' : tone === 'warn' ? 'tos-caution' : 'rounded-xl border-2 border-slate-500 bg-white';
  const msgIcon = tone === 'error' ? '✕' : tone === 'ok' ? '✓' : tone === 'warn' ? '⚠' : 'ℹ';
  /** メッセージの箱。上にくっつく帯は小さく（画面の35%まで）。送れなかったとき（confirmationPending）は、ボタンの すぐ上に ふつうに置く */
  const messageBox = (top: boolean) => message && !sending ? <div id={top ? 'apply-msg' : 'apply-msg-inline'} role={tone === 'error' ? 'alert' : 'status'} className={(top ? 'sticky top-2 z-20 max-h-[35vh] overflow-y-auto ' : '') + 'mt-4 text-[1.0625rem] font-bold shadow ' + msgBox + (tone === 'info' ? ' p-3' : '')}><div className="flex flex-row items-start gap-2"><div className="min-w-0 flex-1"><p><span aria-hidden="true" className="tos-icon">{msgIcon}</span>{message}</p>{confirmationPending && telLink ? <p className="mt-1">{telLink}</p> : null}</div>{top ? <button type="button" onClick={closeMessage} className="min-h-12 shrink-0 rounded-xl border-2 border-current bg-white px-2 text-[1.0625rem] font-bold text-slate-900">とじる</button> : null}</div></div> : null;
  const stepLine = <span aria-hidden="true">📍</span>;
  const showRow = (value: string) => endpointReady || Boolean(value);

  return <main className="tos-apply min-h-screen bg-slate-50 px-4 py-4 text-lg font-medium leading-relaxed text-slate-950 [color-scheme:light] sm:py-10"><div className="mx-auto w-full max-w-3xl tos-apply-wrap overflow-x-clip">
    <header className="rounded-3xl bg-slate-900 p-4 text-white sm:p-8">
      <div className="flex items-center justify-between gap-3">{statusLabel ? <p className={'rounded-full px-3 py-1 text-[1.0625rem] font-bold ' + (isTest || deadlinePassed ? 'bg-red-100 text-red-900' : 'bg-white/15')}>{isTest || deadlinePassed ? <span aria-hidden="true" className="tos-icon">✕</span> : null}{statusLabel}</p> : <span />}<p aria-hidden="true" className="text-3xl">🥊</p></div>
      {config.logo
        ? <div className="mt-3 flex items-center gap-3 sm:gap-4"><CkaLogo size={64} className="bg-white" /><h1 className="min-w-0 flex-1 text-2xl font-black leading-tight [overflow-wrap:anywhere] [text-wrap:balance] sm:text-4xl">{config.title || '大会の申し込み'}</h1></div>
        : <h1 className="mt-3 text-2xl font-black leading-tight [text-wrap:balance] sm:text-4xl">{config.title || '大会の申し込み'}</h1>}
      <p className="mt-1 text-[1.0625rem] font-bold text-slate-200">{config.organizer ? '主催：' + config.organizer : '選手のみなさん、申し込みを待っています'}</p>
      {endpointReady ? <p className="mt-1 text-[1.0625rem] font-bold text-slate-200">約3分で終わります</p> : null}
      {endpointReady || config.date || config.venue || config.deadline ? <dl className="mt-3 divide-y divide-white/20 rounded-2xl bg-white/10 px-3">
        {showRow(config.date) ? <div className="flex min-h-12 items-center gap-3 py-1.5"><dt className="w-20 shrink-0 text-[1.0625rem] text-slate-200">開催日</dt><dd className="min-w-0 text-lg font-bold">{dateText || '未定'}</dd></div> : null}
        {showRow(config.venue) ? <div className="flex min-h-12 items-center gap-3 py-1.5"><dt className="w-20 shrink-0 text-[1.0625rem] text-slate-200">会場</dt><dd className="min-w-0 text-lg font-bold">{isVenueUrl(config.venueUrl) ? <a href={config.venueUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center underline underline-offset-4">{config.venue || '地図を開く'} ↗</a> : config.venue || '未定'}</dd></div> : null}
        {showRow(config.deadline) ? <div className="flex min-h-12 items-center gap-3 py-1.5"><dt className="w-20 shrink-0 text-[1.0625rem] text-slate-200">締切</dt><dd className="min-w-0 text-lg font-bold">{deadlineText ? <span className={'inline-block rounded-2xl px-3 py-0.5 ' + (deadlinePassed ? 'bg-red-100 text-red-900' : 'bg-white text-slate-950')}>{deadlinePassed ? <span aria-hidden="true" className="tos-icon">✕</span> : null}<span aria-hidden="true" className="tos-icon">⏰</span>申し込みは{deadlineText}</span> : '未定'}</dd></div> : null}
      </dl> : null}
    </header>

    {!endpointReady ? <div className="mt-4"><ErrorLine alert big><span>このページでは申し込めません</span><span className="mt-2 block text-[1.0625rem]">理由：リンクが古いか、途中で切れています</span><span className="mt-1 block text-[1.0625rem]">やること：主催者に「新しいリンクをください」と言う</span></ErrorLine>
      <p className="mt-3 font-bold">{telLink || noContactText}</p></div> : null}
    {endpointReady && isTest ? <ErrorLine big className="mt-4">これはテストです。ここから送っても、大会には届きません</ErrorLine> : null}
    {endpointReady && deadlinePassed ? <ErrorLine className="mt-4">申し込みの締切は過ぎています（{deadlineShort}まで）</ErrorLine> : null}
    {endpointReady && deadlineUnclear && !deadlinePassed ? <Caution className="mt-4">申し込みの締切は「{config.deadline}」です。過ぎていないか、確かめてください</Caution> : null}
    {recentSent ? <Caution title="気をつけて" status className="mt-4"><span className="block font-bold">さっき、申し込みを送りました。</span><ul className="mt-1 list-disc space-y-1 pl-6"><li><b>受付番号の画面が出た方：</b>申し込み済みです。同じ人を、もう一度送らないでください。</li><li><b>「送れませんでした」と出た方、何も出なかった方：</b>入れた文字と写真は、消えています。最初から入れ直して、送ってください。</li></ul><button type="button" onClick={() => setRecentSent(false)} className={greyBtn + ' mt-2 w-full'}>この表示を消す</button></Caution> : null}
    {askNew ? <>
      <Caution className="mt-4">別の大会のリンクです。入力を消して新しく始めますか？</Caution>
      <DangerConfirm title="消えます：いま入れた内容" lines={['選手の情報・写真・連絡先が、ぜんぶ消えます', '消したあとは、元にもどせません']} safeLabel="今のまま続ける" dangerLabel="消して新しく始める" onSafe={() => setPendingHash('')} onDanger={startNew} />
    </> : null}
    {endpointReady ? <Caution title="気をつけて" className="mt-4"><ul className="mt-1 list-disc space-y-1 pl-6"><li>送るまで終わりではありません。最後に「この内容で送信する」を押します。</li><li>途中でページを閉じたり、更新すると、入力は消えます。</li></ul></Caution> : null}

    {endpointReady ? <ol aria-label="申し込みの流れ" className="mt-4 grid grid-cols-4 gap-2">{steps.map((name, i) => { const n = i + 1; const state = n < stage ? 'done' : n === stage ? 'here' : 'later'; return <li key={name} aria-current={state === 'here' ? 'step' : undefined} className={'flex min-h-16 min-w-0 flex-col items-center rounded-2xl border-2 px-1 py-2 text-center text-[1.0625rem] font-bold leading-tight ' + (state === 'here' ? 'border-indigo-700 bg-indigo-50 text-indigo-950' : state === 'done' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700')}><span aria-hidden="true" className={'grid h-7 w-7 place-items-center rounded-full text-[1.0625rem] ' + (state === 'here' ? 'bg-indigo-700 text-white' : state === 'done' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700')}>{state === 'done' ? '✓' : n}</span><span className="mt-1 block min-w-0">{name}</span>{state === 'here' ? <><span className="sr-only">（いまここ）</span><span aria-hidden="true" className="mt-1 hidden whitespace-nowrap rounded-full bg-indigo-700 px-2 text-[1.0625rem] text-white sm:inline">📍 いまここ</span></> : null}</li>; })}</ol> : null}
    {endpointReady ? <p className="mt-2 rounded-xl border-2 border-indigo-700 bg-white px-3 py-2 text-[1.0625rem] font-bold text-indigo-950 sm:hidden">{stepLine} いまここ：{stage} / 4　{steps[stage - 1]}</p> : null}
    {endpointReady ? <p className="mt-2 text-[1.0625rem] text-slate-700">「4 完了」は、Googleの画面で受付番号が出たときです。</p> : null}
    {!confirmationPending ? messageBox(true) : null}
    <fieldset disabled={sending || !endpointReady} onKeyDown={onFieldsKeyDown} onFocus={onFieldsFocus} onBlur={() => setStick(null)} className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">選手の申し込み</legend>
      <section className={card} hidden={!endpointReady}>
        <h2 className="flex items-center gap-3 text-2xl font-black"><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-700 text-xl text-white">1</span>選手の情報</h2>
        <p className="mt-3 text-[1.0625rem] text-slate-700">「必須」のところは、ぜんぶ入れてください。</p>
        <div className="mt-8 grid gap-8">
          {fighterField('gym', 'ジム名 必須')}
          {fighterField('name', '選手名 必須', <Note className="mt-2">保護者の名前ではなく、出る人の名前</Note>)}
          {fighterField('height', '身長（cm）必須', undefined, 'decimal')}
          {fighterField('weight', '体重（kg）必須', <>{swapSuspect ? <Caution className="mt-2" status>身長と体重が、逆ではありませんか？ いま、身長{nf.height}cm、体重{nf.weight}kgと入っています。</Caution> : null}</>, 'decimal')}
          {divisionField()}
          {weightClassField()}
          {fighterField('record', '戦績 必須', nf.record === 'なし' ? <Caution className="mt-2">初試合なら「初試合」と書いてください</Caution> : undefined)}
          {classField()}
          {requiredExtra}
          {config.music ? <Field id="f-musicUrl" label="入場曲のリンク 必須" hint={META.musicUrl.hint} example={META.musicUrl.example} extra={<Note className="mt-2">曲のアプリで「共有」→「リンクをコピー」</Note>} {...fieldProps('musicUrl')}><input {...ids('musicUrl', { hint: true, example: true })} className={look('musicUrl')} value={fighter.musicUrl} placeholder="Apple Music または YouTube" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" enterKeyHint="next" onChange={(e) => change('musicUrl', e.target.value)} onBlur={() => leaveSoon('musicUrl')} /></Field> : null}
        </div>
        <div id="f-photo-box" className={'mt-8 scroll-mt-24 rounded-3xl p-4 focus-within:ring-4 focus-within:ring-indigo-600 ' + (photo ? 'border-2 border-dashed border-emerald-600 bg-emerald-50' : photoError || fieldErrors.photo ? 'border-[3px] border-solid border-red-700 bg-white' : 'border-2 border-dashed border-slate-500 bg-white')}>
          <h3 className="text-lg font-bold leading-snug"><LabelText label="顔写真 必須" /></h3>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-[1.0625rem] font-medium text-slate-800"><li>顔が正面から見える</li><li>明るい場所で撮る</li><li>ひとりだけ写っている</li><li>帽子やサングラスはなし</li></ul>
          <Note title="写真が選べないとき" className="mt-3"><ol className="mt-1 list-decimal space-y-1 pl-6"><li>右上の「…」を押す</li><li>「他のブラウザで開く」を押す</li><li>この画面にもどる</li></ol><span className="mt-1 block">※ 開き直すと、入力は消えます。</span></Note>
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
        <Note className="mt-3 font-bold">主催者からの連絡だけに使います。入力した内容は、この申し込みサイトには残りません。主催者のGoogleの表にだけ保存されます。</Note>
        <div id="contact-fields" className="mt-8 grid scroll-mt-24 gap-8">
          <Field id="f-contactName" label="連絡先のお名前 必須" hint={META.contactName.hint} example={META.contactName.example} {...fieldProps('contactName')}><input {...ids('contactName', { hint: true, example: true })} className={look('contactName')} value={contactName} autoComplete="name" enterKeyHint="next" onChange={(e) => { setContactName(e.target.value); clearError('contactName'); }} onBlur={() => leaveSoon('contactName')} /></Field>
          <Field id="f-contactPhone" label="電話番号 必須" hint={META.contactPhone.hint} example={META.contactPhone.example} {...fieldProps('contactPhone')}><input {...ids('contactPhone', { hint: true, example: true })} className={look('contactPhone')} type="tel" inputMode="tel" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="tel" enterKeyHint="next" value={contactPhone} onChange={(e) => { setContactPhone(e.target.value); clearError('contactPhone'); }} onBlur={() => leaveSoon('contactPhone')} /></Field>
          <Field id="f-contactEmail" label="メールアドレス 必須" hint={META.contactEmail.hint} example={META.contactEmail.example} {...fieldProps('contactEmail')}
            extra={emailAsk && suspect ? <Caution className="mt-2"><span className="block">「{suspect.bad}」になっています。「{suspect.good}」ではありませんか？</span><span className="mt-2 flex flex-wrap gap-3"><button type="button" onClick={() => { setContactEmail(suspect.fixed); setEmailOk(suspect.fixed); clearError('contactEmail'); }} className={darkBtn}>直す</button><button type="button" onClick={() => { setEmailOk(email); clearError('contactEmail'); }} className={greyBtn}>このまま使う</button></span></Caution> : undefined}>
            <input {...ids('contactEmail', { hint: true, example: true })} className={look('contactEmail')} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="email" enterKeyHint="done" value={contactEmail} onChange={(e) => { setContactEmail(e.target.value); clearError('contactEmail'); }} onBlur={() => leaveSoon('contactEmail')} /></Field>
        </div>
        <NextBox id="f-consent-box" on={markKey === 'consent'} label={NEXT_LABEL.consent} prefix={prefix} float className="mt-8">
          <p id="f-consent-note" className="text-[1.0625rem] font-bold text-slate-800">18歳未満の方は、保護者の方と一緒に入力して、チェックしてください。集める情報は「名前・電話・メール・写真」です。</p>
          <button type="button" onClick={openPrivacy} className={greyBtn + ' mt-2'}>使い道を読む（ここを押す）</button>
          <label className={'mt-3 flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 text-lg font-bold ' + (fieldErrors.consent ? 'tos-input-error' : 'border-slate-500 bg-slate-50')}><input id="f-consent" type="checkbox" checked={consent} aria-describedby={'f-consent-note' + (fieldErrors.consent ? ' f-consent-err' : '')} aria-invalid={fieldErrors.consent ? true : undefined} onChange={(e) => { setConsent(e.target.checked); clearError('consent'); }} className="mt-0.5 h-7 w-7 shrink-0 accent-indigo-700" />主催者が、大会の運営のために、私（または子ども）の情報を使うことに同意します。</label>
          {fieldErrors.consent ? <ErrorLine id="f-consent-err" className="mt-2"><span className="min-w-0">{fieldErrors.consent}</span></ErrorLine> : null}
        </NextBox>
      </section>
    </fieldset>
    <form ref={formRef} action={endpointReady ? config.endpoint : undefined} method="post" target="_self" className="hidden">
      {Object.entries({ protocol: config.protocol === '3' ? '3' : '2', entryKey: config.entryKey || '', mode: config.mode || '', website: '', eventId: config.eventId, requestId, gym: nf.gym, name: nf.name, grade: config.grade === 'off' ? '' : nf.grade, age: config.age === 'off' ? '' : nf.age, height: nf.height.replace(/cm$/i, ''), weight: nf.weight.replace(/kg$/i, ''), record: nf.record, fighterClass: classes ? chosenClass : '', ...(weights ? { division, weightClass: needClass ? weightClass : '' } : {}), comment: config.comment === 'off' ? '' : nf.comment, musicUrl: config.music ? nf.musicUrl : '', contactName: cname, contactPhone: phone, contactEmail: email, consent: consent ? 'yes' : 'no', photoDataUrl: photo }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    </form>
    {reviewing ? <section aria-label="送る前の確認" className="my-6 rounded-3xl border-2 border-indigo-700 bg-white p-4 sm:p-6">
      <h2 ref={reviewHeadingRef} tabIndex={-1} className="scroll-mt-24 text-2xl font-black outline-none">送る前の確認</h2>
      <p className="mt-3 text-xl font-black">上から読んで、まちがいがないか見てください。</p>
      <p className="mt-3 font-bold">{config.organizer || '大会主催者'}のGoogleへ、選手情報・連絡先・写真を送ります（主催者だけが見られます）。</p>
      {isTest ? <ErrorLine className="mt-3">これはテストです。ここから送っても、大会には届きません</ErrorLine> : null}
      <div className="mt-4 rounded-2xl border-2 border-slate-300 p-3"><dl><dt className="text-[1.0625rem] text-slate-600">大会</dt><dd className="break-words text-lg font-bold">{config.title}</dd></dl></div>
      <div className="mt-3 rounded-2xl border-2 border-slate-300 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">選手の情報</h3><button type="button" aria-label="選手の情報を直す" onClick={() => fix('gym')} className="min-h-12 shrink-0 rounded-xl border-2 border-slate-500 px-4 text-lg font-bold">直す</button></div>
        <dl className="mt-2 grid gap-3">
          {([['ジム名', nf.gym], ['選手名', nf.name], ['身長', nf.height ? nf.height + ' cm' : ''], ['体重', nf.weight ? nf.weight + ' kg' : ''],
            ...(weights ? [['区分', division], ['階級', noClass ? 'なし（体重が近い人どうしで組みます）' : weightClass ? weightClassLabel(weightClass) : '']] : []),
            ['戦績', nf.record],
            ...(classes && chosenClass ? [['クラス', classes[chosenClass].name]] : []),
            ...(config.grade !== 'off' ? [['学年', nf.grade]] : []), ...(config.age !== 'off' ? [['年齢', nf.age]] : []), ...(config.comment !== 'off' ? [['意気込み', nf.comment]] : []), ...(config.music ? [['入場曲のリンク', nf.musicUrl]] : [])] as string[][]).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[1.0625rem] text-slate-600">{label}</dt><dd className="whitespace-pre-wrap break-words text-lg font-bold">{value.trim() ? value : '（未入力）'}</dd></div>)}
        </dl>
        {classMismatchText ? <><ErrorLine icon="⚠" className="mt-3"><span className="min-w-0">{classMismatchText} 合っていれば、そのまま送れます。</span></ErrorLine><button type="button" onClick={() => fix('fighterClass')} className={greyBtn + ' mt-2 w-full'}>クラスを選び直す</button></> : null}</div>
      <div className="mt-3 rounded-2xl border-2 border-slate-300 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">顔写真</h3><button type="button" aria-label="写真を直す" onClick={() => fix('photo')} className="min-h-12 shrink-0 rounded-xl border-2 border-slate-500 px-4 text-lg font-bold">直す</button></div>{photo ? <img src={photo} alt="" className="mt-2 h-28 w-24 rounded-xl bg-slate-100 object-contain" /> : <p className="mt-2 text-[1.0625rem] text-slate-600">（未入力）</p>}</div>
      <div className="mt-3 rounded-2xl border-2 border-slate-300 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">連絡先</h3><button type="button" aria-label="連絡先を直す" onClick={fixContact} className="min-h-12 shrink-0 rounded-xl border-2 border-slate-500 px-4 text-lg font-bold">直す</button></div>
        <dl className="mt-2 grid gap-3">
          <div className="min-w-0"><dt className="text-[1.0625rem] text-slate-600">お名前</dt><dd className="break-words text-lg font-bold">{cname}</dd></div>
          <div className="min-w-0"><dt className="text-[1.0625rem] text-slate-600">電話番号</dt><dd className="break-words text-3xl font-black tracking-wide">{phone}</dd><Caution className="mt-2">この番号で電話がつながりますか？ 主催者から電話します。</Caution></div>
          <div className="min-w-0"><dt className="text-[1.0625rem] text-slate-600">メールアドレス</dt><dd className="break-words text-2xl font-black">{email}</dd><Caution className="mt-2">もう一度、見くらべてください</Caution></div>
        </dl></div>
            {deadlinePassed ? <ErrorLine className="mt-3">いま送っても、受け付けられないことがあります。先に主催者に電話する</ErrorLine> : null}
      {deadlinePassed && !tel ? <p className="mt-2 font-bold">{noContactText}</p> : null}
      {callFirst ? <NextBox on={nextKind === 'call'} label="主催者に電話する" prefix="次はここ" className="mt-3">{telLink}</NextBox> : null}
      <p className="tos-danger mt-4 text-[1.0625rem]"><span aria-hidden="true" className="tos-icon">✕</span>送ったあとは、ここでは直せません（直すときは主催者に連絡）</p>
      <p className="mt-1 text-[1.0625rem] font-bold text-slate-900">電話番号とメールが合っているか、もう一度見てください。</p>
      <NextBox on={nextKind === 'send'} label="正しければ、下のボタンを押す" prefix="次はここ" className="mt-3">
        <button disabled={sending||photoLoading||!endpointReady} aria-disabled={!online ? true : undefined} onClick={() => { if (!online) { say('送れません：電波がありません。まだ送っていません。電波のある場所で、もう一度押してください。', 'error'); offlineMsgRef.current = true; return; } submit(true); }} className={'w-full text-xl ' + (locked || !online ? 'tos-locked min-h-14 rounded-xl px-4 py-3 font-black' : isTest ? 'tos-safe-btn' : 'tos-main')}>この内容で送信する</button>
        {!online ? <LockReason>電波がありません。電波のある場所で押してください</LockReason> : null}
      </NextBox>
      <div className="tos-note mt-3 text-[1.0625rem]">
        <p className="font-bold">送ると、Googleの白い画面が出ます。そのあとの3つ：</p>
        <ol className="mt-1 list-decimal space-y-1 pl-6">
          <li>「受付番号」が出たか見る。（「注意」の文字が出ても、だいじょうぶです）</li>
          <li>その画面の写真をとる。</li>
          <li>閉じる（戻らない）。</li>
        </ol>
        <p className="mt-2 font-bold">「送れませんでした」と出たときだけ、ブラウザの「戻る」で戻って、直してからもう一度送ります。</p>
        <p className="mt-1">戻ると、入れた文字と写真が消えていることがあります。そのときは、最初から入れ直してください。</p>
        <p className="mt-2 text-slate-700">失敗したときのために、この確認の画面も写真にとっておくと安心です。</p>
      </div>
      <p className="mt-3 text-[1.0625rem] font-bold text-slate-700"><span aria-hidden="true" className="tos-icon">✓</span>「戻って直す」を押しても、入力は消えません</p>
      <button onClick={() => { setReviewing(false); setMessage(''); focusField('gym'); }} className="tos-safe-btn mt-2 w-full text-lg">戻って直す（送信しません）</button>
    </section> : <div className="my-6">
      {sending ? <NextBox on flush label={`そのまま待つ（あと${wait}秒）`} prefix="次はここ" className="mb-3"><p className="tos-danger"><span aria-hidden="true" className="tos-icon">✕</span>戻らない・閉じない</p><p className="mt-1 text-[1.0625rem]">送信中です。Googleの画面が出るまで、30秒ほどかかることがあります。</p></NextBox> : null}
      {endpointReady ? <p className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-lg font-bold"><span className="rounded-full bg-slate-200 px-3 py-1 text-slate-900">入力 {filled}/{total}</span>{left > 0 ? <button type="button" onClick={() => { if (firstMissing) focusField(firstMissing); }} className={greyBtn}>あと{left}か所 → 入っていないところへ</button> : badKeys.length ? <button type="button" onClick={() => focusField(badKeys[0])} className={greyBtn}>直す所 → 「✕」のところへ</button> : <span className="text-emerald-800">✓ ぜんぶ入りました</span>}</p> : null}
      {endpointReady && (left > 0 || badKeys.length > 0) && nextKind === 'field' ? <p className="mb-2 text-[1.0625rem] text-slate-700">ボタンを押すと、「次はここ」の札がついた所へ行きます。</p> : null}
      {badKeys.length ? <ErrorLine className="mb-2">直す所：{badKeys.map((key) => SHORT[key]).join('、')}</ErrorLine> : null}
      {confirmationPending ? messageBox(false) : null}
      <NextBox id="f-submit-box" flush float on={nextKind === 'confirm' || nextKind === 'resend'} className="mt-8" label={nextKind === 'resend' ? 'Googleの画面が出ないときだけ、押す' : '確認のボタンを押す'} prefix="次はここ">
        <button id="f-submit" disabled={sending||photoLoading||!endpointReady} onClick={() => (confirmationPending && !changedAfterSend ? submit(true, true) : submit())} className={'w-full text-xl ' + (locked ? 'tos-locked min-h-14 rounded-xl px-4 py-3 font-black' : 'tos-main')}>{sending ? '⏳ 送信しています…' : photoLoading ? '写真を準備しています…' : confirmationPending && !changedAfterSend ? 'もう一度送る（二重になりません）' : '入力内容を確認する →'}</button>
        {lockReason ? <LockReason>{lockReason}</LockReason> : null}
      </NextBox>
      {endpointReady && !sending ? (confirmationPending
        ? <div className="mt-2 space-y-2">
          {changedAfterSend
            ? <Caution title="直したときは"><span className="block">受付番号が出なかった方は、直して送って大丈夫です。上の「入力内容を確認する →」を押すと、確認の画面が出ます。</span><span className="mt-1 block">受付番号が出た方は、もう申し込み済みです。同じ人を、もう一度送らないでください。</span></Caution>
            : <p className="text-[1.0625rem] text-slate-700">前と同じ内容なので、二重にはなりません。</p>}
          <p className="tos-danger text-[1.0625rem]"><span aria-hidden="true" className="tos-icon">✕</span>次のボタンを押すと、いま入っている内容が消えます（送った申し込みは、消えません）。</p>
          <button type="button" onClick={resetAll} className={greyBtn + ' w-full'}>別の人を申し込む（入力を消して、最初から）</button>
        </div>
        : <p className="tos-note mt-2 text-[1.0625rem]"><span aria-hidden="true" className="tos-icon">i</span>まだ送りません。次の画面で、まちがいがないか見るだけです。</p>) : null}
    </div>}
    {endpointReady ? <Note className="mt-4">下の「使い道」と「困ったとき」も、読んでください。押すと開きます。</Note> : null}
    <Fold id="privacy-fold" title="使い道" sub="どんな情報を、何のために使いますか？"><ul className="list-disc space-y-1 pl-6"><li>集めるもの：選手の情報・顔写真・連絡先（名前・電話・メール・写真）</li><li>見る人：主催者と、大会の運営の人</li><li>使うこと：組み合わせ作り、大会の連絡、当日の会場の画面での紹介（名前・写真・戦績・一言）</li><li>電話番号とメールは、会場の画面には出ません。</li></ul></Fold>
    <Fold title="困ったとき"><ul className="space-y-3"><li><b>写真が選べないとき</b><br />LINEの右上のメニューから「他のブラウザで開く」（またはSafari）を選んで、開き直してください。</li><li><b>Googleの画面が出ないとき</b><br />少し待ってから、もう一度ボタンを押してください。同じ申し込みは、二重になりません。</li><li><b>受付番号が出ないとき</b><br />主催者に電話してください。{telLink ? <><br />{telLink}</> : null}</li></ul></Fold>
    <p className="mb-8 mt-6 text-center text-[1.0625rem] font-bold text-slate-700">問い合わせ：{config.contact || '大会主催者へご確認ください'}</p>
  </div></main>;
}
