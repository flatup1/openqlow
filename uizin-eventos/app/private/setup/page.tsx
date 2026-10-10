'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { diagnose, entryConfigFromPing, exportSetup, importSetup, isTemplateCopyLink, parsePing, parsePingText, pingUrl, templateCopyLink, type Diagnosis, type Ping } from '../../../core/setupV3.ts';
import { isAppsScriptUrl, publicEntryHash } from '../../../core/publicEntry.ts';
import { formatDateInput } from '../../../core/dateInput.ts';
import { readPrivateEvent } from '../../lib/privateStore.ts';
import { isPastDate, isTitleReal } from '../logic.ts';

/*
  色と言葉の約束（全画面で同じ。色だけで伝えない）
  黄の濃い塗り「👉 次はここ」＝いま押す・書く所（1つだけ）／薄い黄「⚠ 気をつけて」／赤「✕ まちがい・取り消せない」
  緑「✓ できた」／灰の点線「🔒 今は押せない＋理由」／インディゴ塗り＝ふつうの主ボタン（1つだけ）
*/

const KEY = 'tournament-setup-v3:';
const STEPS = ['ひな形をコピーして、設定を書く', 'URLをはって、つなぐ', '選手に渡すURLを作る'];
/** 作業カードの名前。上の手順の数字（1〜3）とまぜないよう、準備・つなぐ・渡す を使う */
const STEP_NAMES = ['準備', 'つなぐ', '渡す'];
const PAGE_NAME = '選手の受付をつくる';
/** Googleシートのメニューの名前。.gs の onOpen と同じ言葉にそろえる（.gs が変わったらここだけ直す） */
const MENU_ZIP = '④ OS用の名簿ZIPを作る';
const SHEET_WINDOW = 'Googleのシートは新しいタブで開きます。このページのタブは閉じません。もどるときは、一番上の「' + PAGE_NAME + '」と書いたタブを押します。';
const VIEW_WINDOW = '新しいタブが開きます。見終わったら、一番上の「' + PAGE_NAME + '」と書いたタブを押してもどります。';
const COPY_STEPS = 'パソコン：上の四角をクリックして、Ctrl を押しながら A（全部えらぶ）、つづけて Ctrl を押しながら C（コピー）。Macは Ctrl のかわりに ⌘（コマンド）キー。スマホ：四角を長く押して「コピー」。';
const CARD_LABELS = ['作業1：Googleでコピーを作る', '作業2：「設定」タブに書く（B列の7つ）', '作業3：メニュー「① 最初の設定」を押す', '作業4：「準備できました」と出るのを確かめる'];
const OP_LABELS = ['操作1：Apps Scriptを開く（いまはここ）', '操作2：「新しいデプロイ」を押す（いまはここ）', '操作3：URLの「コピー」を押す（いまはここ）'];
const GOOD_URL = 'https://script.google.com/macros/s/…/exec';
/** シートの「設定」タブの、B列のセル番号（.gs の SETTING_ROWS と同じ順番） */
const CELL: Record<string, string> = { 大会名: 'B2', 開催日: 'B3', 会場: 'B4', 会場の地図URL: 'B5', 主催者名: 'B6', 問い合わせ先: 'B7', 申込締切: 'B8', 入場曲: 'B9', 学年: 'B10', 年齢: 'B11', 意気込み: 'B12' };
const HOW: Record<string, string> = {
  大会名: '例：第3回 青空ジム大会 のように入れる', 開催日: '2027年10月3日 のように入れる', 会場: '例：○○体育館 のように入れる', 主催者名: '例：○○ジム のように入れる',
  問い合わせ先: '電話番号か、LINEのURLを入れる', 申込締切: '2027年9月20日 のように入れる（開催日と同じか、その前の日）', 入場曲: '▼から「あり」か「なし」を選ぶ',
};

/** 全部の入力・ボタン・リンク・summary で同じ、濃くて太い枠。 */
const FOCUS = 'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
const field = 'mt-2 block w-full min-h-14 rounded-xl border-2 border-slate-500 bg-white p-4 text-lg font-medium text-slate-950 placeholder:text-slate-500 focus:border-indigo-700 ' + FOCUS;
const btnBase = 'flex w-full items-center justify-center rounded-2xl px-5 py-3 text-center font-bold text-balance ' + FOCUS;
/** 塗りのボタンは、画面にいつも1つだけ（黄色の「次はここ」の中に置く）。 */
const btnPrimary = btnBase + ' min-h-14 bg-indigo-700 text-xl text-white';
/** できたあとの見た目（塗らない）。 */
const btnDone = btnBase + ' min-h-14 border-2 border-emerald-700 bg-emerald-50 text-xl text-emerald-950';
/** まだ押せないボタン：灰色の点線（tos-locked）で、押せるボタンと区別する。理由は、すぐ下に🔒つきで書く。 */
const btnOff = btnBase + ' min-h-14 text-xl tos-locked';
const btnSecondary = btnBase + ' min-h-12 border-2 border-slate-500 bg-white text-lg text-slate-900';
const btnSecondaryOff = btnBase + ' min-h-12 text-lg tos-locked';
const btnText = btnBase + ' min-h-12 text-lg text-slate-800 underline';
const btnQuiet = btnBase + ' min-h-12 text-[17px] text-slate-700 underline';
const NEW_ID_DEFAULT = 'my-tournament';
/** 共通CSS（tos-*）の文字は 16px なので、17px 以上にそろえる */
const S17: CSSProperties = { fontSize: '1.0625rem' };

/** 大会番号を使える形にする（試合の準備の画面と同じ規則）。 */
function normalizeId(raw: string): string {
  const id = raw.normalize('NFKC').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
  return id || NEW_ID_DEFAULT;
}
const hhmm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

type Tone = 'ok' | 'bad' | 'warn' | 'info';
const ICON: Record<Tone, string> = { ok: '', bad: '✕', warn: '⚠', info: 'i' };

type PingError = 'url' | 'access' | 'wrong-app' | 'net' | 'paste-unreadable' | 'paste-wrong';
type Note = { kind: Tone; text: string; hint?: string };
type NextId =
  | 'card0' | 'card1' | 'card2' | 'card3' | 'go2'
  | 'op0' | 'op1' | 'op2' | 'paste' | 'recheck' | 'recheck-fix' | 'rerun1' | 'open-ops' | 'wrong-app' | 'send-photo' | 'tell-staff' | 'next'
  | 'open' | 'copy' | 'copy-new' | 'copy-manual' | 'back2' | 'export';
type Next = { id: NextId; label: string } | null;

/** 画面に出してよいのは、日本語で書かれた文だけ。英語や記号だけのエラー文は出さない。 */
function jpMessage(error: unknown, fallback: string): string {
  return error instanceof Error && /[぀-ヿ一-鿿]/.test(error.message) ? error.message : fallback;
}

/** 通信が失敗したとき、原因を3つに分ける（別のアプリ／ログイン画面／ネットにつながらない）。 */
function classifyPingError(error: unknown): PingError {
  if (error instanceof SyntaxError) return 'access';
  if (error instanceof Error && error.message.includes('Tournament OS')) return 'wrong-app';
  return 'net';
}

/* ---------- URLを、貼られたままの形から自動で直す（ネット通信なし） ---------- */
type UrlKind = 'sheet' | 'template' | 'dev' | 'id' | 'login' | 'workspace' | 'incomplete' | 'text' | 'symbols' | 'long' | 'other';
type UrlResult = { ok: true; url: string; changed: boolean } | { ok: false; kind: UrlKind };

/**
 * 全角→半角、空白・改行・かぎ括弧を全部除く、前の文章を捨てる、後ろの ? # / ?action=ping を捨てる、
 * 2回続けて貼られたら最初の /exec で切る。取り出せたら自動で直した形を返す。
 */
function cleanUrl(raw: string): UrlResult {
  const trimmed = raw.trim();
  let s = raw.normalize('NFKC').replace(/[\s　]+/g, '').replace(/[「」『』<>"'`]/g, '');
  s = s.replace(/\/macros\/u\/\d+\/s\//i, '/macros/s/');
  const m = s.match(/(?:https?:\/\/)?script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec(?:(?=https?:\/\/)|(?![A-Za-z0-9_-]))/i);
  if (m) {
    const url = 'https://script.google.com/macros/s/' + m[1] + '/exec';
    return { ok: true, url, changed: url !== trimmed };
  }
  if (/docs\.google\.com\/spreadsheets/i.test(s)) return { ok: false, kind: /\/copy/i.test(s) ? 'template' : 'sheet' };
  if (/accounts\.google\.com|servicelogin/i.test(s)) return { ok: false, kind: 'login' };
  if (/\/a\/macros\//i.test(s)) return { ok: false, kind: 'workspace' };
  if (/\/macros\/s\/[A-Za-z0-9_-]+\/dev(?![A-Za-z0-9_-])/i.test(s)) return { ok: false, kind: 'dev' };
  if (/^(?:AKfy)?[A-Za-z0-9_-]{40,}$/.test(s)) return { ok: false, kind: 'id' };
  if (trimmed.length > 4000) return { ok: false, kind: 'long' };
  if (/script\.google\.com/i.test(s)) return { ok: false, kind: 'incomplete' };
  if (!/https?:|[a-z0-9-]+\.[a-z]{2,}\//i.test(s)) return { ok: false, kind: /[\p{L}\p{N}]/u.test(s) ? 'text' : 'symbols' };
  return { ok: false, kind: 'other' };
}
const looksLikeUrl = (raw: string) => /https?:\/\/|script\.google\.com|docs\.google\.com/i.test(raw.normalize('NFKC'));
const shortUrl = (u: string) => (u.length > 52 ? u.slice(0, 36) + '…' + u.slice(-14) : u);

const RIGHT_ONE = '正しいものは、デプロイの画面の「ウェブアプリ」の下にある、/exec で終わる長いURLです。';
/** 貼ったURLのどこがまちがいか。head は赤の1行目、body は次の行（なければ RIGHT_ONE）。 */
function urlProblem(kind: UrlKind): { head: string; body: string } {
  switch (kind) {
    case 'sheet': return { head: 'これは「シートのURL」です', body: RIGHT_ONE };
    case 'template': return { head: 'これは「ひな形のコピーを作るURL」です', body: RIGHT_ONE };
    case 'dev': return { head: 'これは「テスト用のURL」（/dev で終わる）です', body: '「新しいデプロイ」で出た、/exec で終わるURLを使います。「デプロイをテスト」は押しません。' };
    case 'id': return { head: 'それはIDです', body: 'URLの横の「コピー」を押してください。' };
    case 'login': return { head: 'これは「Googleのログインの画面のURL」です', body: RIGHT_ONE };
    case 'workspace': return { head: '会社や学校のGoogleのURL（/a/macros/ が入ったURL）は、まだ使えません', body: '個人のGoogleアカウントで、もう一度「新しいデプロイ」をして、/exec で終わるURLをコピーしてください。むずかしいときは、ジムの担当者に連絡してください。' };
    case 'symbols': return { head: 'URLではありません', body: 'https:// で始まるURLを貼ってください。' + RIGHT_ONE };
    case 'incomplete': return { head: 'URLが最後まで入っていません', body: '…/exec のところまで、全部コピーしてください。' };
    case 'text': return { head: 'URLではなく、ただの文字です', body: 'https:// で始まるURLを貼ってください。' + RIGHT_ONE };
    case 'long': return { head: '文字が長すぎます', body: 'URLだけをコピーし直してください。' + RIGHT_ONE };
    default: return { head: 'これは「ウェブアプリ」のURLではありません', body: RIGHT_ONE };
  }
}

/** 「貼って確かめる」で貼った文字から、前後の説明や ``` を取り除いて { … } だけにする。 */
function cleanPasted(text: string): string {
  const t = text.replace(/```[a-zA-Z]*/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}

/** 「設定」タブの直すところを、行・セル番号つきの短い文に直す。 */
function settingLines(message: string): { google: string; fixes: string[] }[] {
  const body = message.replace(/^シートの「設定」タブを直してください。/, '');
  return (body || message).split('。').filter(Boolean).map((item) => {
    const nameOf = (n: string) => Object.keys(CELL).find((k) => n.startsWith(k));
    const miss = item.match(/次の欄を入れてください：(.+)$/);
    if (miss) {
      return { google: item, fixes: miss[1].split('、').map((n) => { const k = nameOf(n); return k ? k + '（' + CELL[k] + '）：書いてありません。' + (HOW[k] || '黄色いセルに書く') : n + '：書いてありません'; }) };
    }
    const k = (item.match(/「(.+?)」/) || [])[1];
    const key = k ? nameOf(k) : undefined;
    if (!key) return { google: item, fixes: [item] };
    const cell = key + '（' + CELL[key] + '）：';
    if (key === '開催日') return { google: item, fixes: [cell + '2027年10月3日 のように入れる'] };
    if (key === '申込締切') return { google: item, fixes: [cell + (item.includes('開催日と同じ') ? '開催日と同じか、それより前の日にする' : '2027年9月20日 のように入れる')] };
    if (key === '会場の地図URL') return { google: item, fixes: [cell + 'Googleマップの「共有」で出るURLにするか、空にする'] };
    return { google: item, fixes: [cell + '▼から選び直す'] };
  });
}

/* ---------- 共通の部品（色と言葉の約束どおり） ---------- */
function Box({ tone, children, role, className = '', id }: { tone: Tone; children: ReactNode; role?: 'status' | 'alert'; className?: string; id?: string }) {
  const cls = tone === 'ok' ? 'tos-ok' : tone === 'bad' ? 'tos-error' : tone === 'warn' ? 'tos-caution' : 'rounded-xl border-2 border-slate-400 bg-white p-3 text-slate-900 sm:p-4';
  return <div id={id} role={role} tabIndex={role === 'alert' ? -1 : undefined} className={cls + ' ' + className}>
    <div className="flex gap-2 sm:gap-3">
      {ICON[tone] ? <span aria-hidden="true" className="mt-0.5 shrink-0 font-bold">{ICON[tone]}</span> : null}
      <div className="min-w-0 flex-1 space-y-1 sm:space-y-2">{children}</div>
    </div>
  </div>;
}

/** 赤い1行。原因のすぐ近くに置く。先頭の ✕ はここで付ける。 */
function ErrorLine({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return <p id={id} role="alert" tabIndex={-1} className={'tos-error ' + className}><span aria-hidden="true" className="tos-icon">✕</span>{children}</p>;
}
/** 緑の1行。先頭の ✓ はここで付ける。 */
function OkLine({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p role="status" className={'tos-ok ' + className}><span aria-hidden="true" className="tos-icon">✓</span>{children}</p>;
}
/** 薄い黄の「気をつけて」。消えない注意。 */
function Caution({ lead, title = '気をつけて', children, className = '' }: { lead?: ReactNode; title?: string; children?: ReactNode; className?: string }) {
  return <div role="note" className={'tos-caution ' + className}>
    <p><span className="tos-caution-title"><span aria-hidden="true" className="tos-icon">⚠</span>{title}：</span>{lead}</p>
    {children}
  </div>;
}
/** 押せない理由。ボタンのすぐ下に、いつも出す。 */
function Why({ id, children }: { id?: string; children: ReactNode }) {
  return <p id={id} className="tos-locked-reason" style={S17}><span aria-hidden="true" className="tos-icon">🔒</span>{children}</p>;
}
function Example({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return <p id={id} className={'tos-example ' + className} style={S17}>例：{children}</p>;
}
/**
 * 「👉 次はここ」。on のときだけ黄色。同じ位置に置き続けるので、黄色が移ってもボタンは作り直されない
 * （キーボードの目印が消えない）。バッジの文字は、ボタンの名前の『外』に置く。
 */
function Mark({ on, label, children }: { on: boolean; label: string; children: ReactNode }) {
  return <div className={on ? 'tos-next' : undefined} data-tos-next={on ? '1' : undefined}>
    {on ? <p className="mb-2"><span className="tos-next-badge" style={{ ...S17, borderRadius: 18, textAlign: 'left' }}><span aria-hidden="true">👉</span><span className="min-w-0">次はここ：{label}</span></span></p> : null}
    {children}
  </div>;
}

/**
 * Googleの画面の「絵」。このページのボタンではないので、押せない。
 * 本物のボタン（丸い角・太い実線）と見分けるため、四角い角・点線・「📷 絵（押せません）」の札を付ける。
 */
function MenuPic({ menu }: { menu: string }) {
  return <span role="img" aria-label={'Googleのシートの絵。メニュー「Tournament OS」の中の' + menu + '。ここでは押せません。'} className="tos-gpic">
    <span aria-hidden="true" className="tos-pic-tag">📷 Googleのシートの絵（ここでは押せません）</span>
    <span aria-hidden="true" className="mt-1 flex flex-wrap items-center gap-2"><span className="tos-gchip">「Tournament OS」</span><span>→</span><span className="tos-gchip">{menu}</span></span>
  </span>;
}

/** 「必須」「なくてもOK」の札。色だけでなく言葉でも見分けられる。 */
function Tag({ children, must = false }: { children: ReactNode; must?: boolean }) {
  return <span className={'ml-1 inline-block rounded-md border-2 px-2 text-[17px] font-bold ' + (must ? 'border-red-700 bg-red-50 text-red-800' : 'border-slate-500 bg-slate-100 text-slate-800')}>{children}</span>;
}

/** 閉じておく説明。見出しの右に「ひらく／とじる」を出す。 */
function Fold({ title, sub, children, openSignal = 0, defaultOpen = false, className = '', id, compact = false, caution = false }: { title: ReactNode; sub?: ReactNode; children: ReactNode; openSignal?: boolean | number; defaultOpen?: boolean; className?: string; id?: string; compact?: boolean; caution?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  return <details id={id} open={open} onToggle={(e) => setOpen(e.currentTarget.open)} style={caution ? { padding: 0 } : undefined} className={(caution ? 'tos-caution ' : 'rounded-2xl border-2 border-slate-300 bg-white ') + className}>
    <summary className={'flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl font-bold [&::-webkit-details-marker]:hidden ' + (compact ? 'min-h-12 px-3 py-1 ' : 'min-h-14 p-4 ') + FOCUS}>
      <span className="min-w-0 flex-1"><span className="block text-balance">{title}</span>{sub ? <span className="block text-[17px] font-medium text-slate-700">{sub}</span> : null}</span>
      <span aria-hidden="true" className="shrink-0 rounded-lg border-2 border-slate-300 bg-white px-3 py-1 text-[17px] font-bold text-slate-800">{open ? '▼ とじる' : '▶ ひらく'}</span>
    </summary>
    <div className={'space-y-3 border-t-2 border-slate-200 font-medium ' + (compact ? 'p-3' : 'p-4')}>{children}</div>
  </details>;
}

/**
 * 作業カード。見出しの上に「4つの作業の、3つ目」の言葉をつける。
 * 黄色の枠は、カード全体ではなく「できた ✓」のボタンだけに付ける（長い説明の中で、黄色い所が迷子にならない）。
 * いまやる作業のカードは、太いインディゴの枠と「▶ いまやる作業」の言葉で見分ける（黄色は1つだけ）。
 * 前の作業が終わっていないと「できた ✓」は押せない（理由を🔒で書く）。終わったら緑の「✓ できた」になり、黄色が次のカードへ移る。
 */
function StepCard({ n, title, done, doneAt, here, current, label, locked, lockReason, warn, onDone, onUndo, onBlocked, children }: {
  n: number; title: ReactNode; done: boolean; doneAt?: string; here: boolean; current: boolean; label: string; locked: boolean; lockReason: string; warn?: ReactNode;
  onDone: () => void; onUndo: () => void; onBlocked: () => void; children: ReactNode;
}) {
  return <section className={'rounded-2xl p-4 font-medium text-slate-950 sm:p-5 ' + (done ? 'border-2 border-emerald-700 bg-white' : locked ? 'border-2 border-dashed border-slate-500 bg-slate-50' : current ? 'border-4 border-indigo-700 bg-white' : 'border-2 border-slate-300 bg-white')}>
    <div>
      <p className={'text-[17px] font-bold ' + (done ? 'text-emerald-800' : current ? 'text-indigo-900' : 'text-slate-800')}>{done ? '✓ できた　' : current ? '▶ いまやる作業　' : 'まだ　'}4つの作業の、{n}つ目</p>
      <h3 className="mt-1 text-balance text-xl font-bold">{title}</h3>
    </div>
    <div className="mt-3 space-y-3">{children}</div>
    {done
      ? <div className="mt-4 space-y-2">
        <OkLine>できた{doneAt ? ' ' + doneAt : ''}</OkLine>
        <button type="button" onClick={onUndo} className={btnQuiet}>まちがえた → やり直す（✓ を消す）</button>
      </div>
      : <div className="mt-4">
        {warn}
        <Mark on={here} label={label}>
          <button type="button" aria-disabled={locked || undefined} aria-describedby={'card-why-' + n} onClick={locked ? onBlocked : onDone} className={'mt-0 ' + (locked ? btnSecondaryOff : here ? btnPrimary : btnSecondary)}>できた ✓</button>
        </Mark>
        {locked ? <div className="mt-2"><Why id={'card-why-' + n}>{lockReason}</Why></div> : <p id={'card-why-' + n} className="mt-2 text-[17px] text-slate-700">この作業が終わったら押します。</p>}
      </div>}
  </section>;
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
  const [ping, setPing] = useState<Ping | null>(null);
  const [pingError, setPingError] = useState<PingError | null>(null);
  const [checking, setChecking] = useState(false);
  const [pasted, setPasted] = useState('');
  const [ticks, setTicks] = useState([false, false, false, false]);
  const [ops, setOps] = useState([false, false, false]);
  const [opsSignal, setOpsSignal] = useState(0);
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffNote, setStaffNote] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [resumeNote, setResumeNote] = useState(false);
  const [copied, setCopied] = useState('');
  const [copyFailed, setCopyFailed] = useState('');
  const [fileNote, setFileNote] = useState<Note | null>(null);
  const [importNote, setImportNote] = useState<Note | null>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const [title, setTitle] = useState('');
  const [idFixed, setIdFixed] = useState('');
  const [noEvent, setNoEvent] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [okAt, setOkAt] = useState('');
  const [tickAt, setTickAt] = useState(['', '', '', '']);
  const [copiedAt, setCopiedAt] = useState('');
  const [everCopiedLive, setEverCopiedLive] = useState(false);
  const [copiedLiveUrl, setCopiedLiveUrl] = useState('');
  const [otherEvent, setOtherEvent] = useState('');
  /** 「コピーしたURLを貼りつける」ボタンがうまくいかなかったときの一言 */
  const [pasteNote, setPasteNote] = useState<{ kind: 'bad' | 'warn'; text: string } | null>(null);
  /** 実際にGoogleにつないで「つながった」と確かめたURL（これが今のURLと同じときだけ、試合の準備の画面に緑の「できています」が出る） */
  const [verifiedUrl, setVerifiedUrl] = useState('');
  /** 貼ったURLを自動で直したとき、その前と後 */
  const [urlFix, setUrlFix] = useState<{ from: string; to: string } | null>(null);
  /** 「貼って確かめる」で入れた文字から読み取った状態か（画面に出す印） */
  const [pasteSrc, setPasteSrc] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const [wasReady, setWasReady] = useState(false);
  const [backIgnored, setBackIgnored] = useState(false);
  /** 押せないボタンを押したとき、そのボタンの真上に出す赤い1行 */
  const [warn, setWarn] = useState<{ key: string; text: string } | null>(null);
  const [urlTarget, setUrlTarget] = useState(false);
  /** 作業1の「ひな形のコピーを作る」を押したか。押すまでは黄色がそのリンクに、押したあとは「できた ✓」に付く */
  const [copyOpened, setCopyOpened] = useState(false);
  const downloadedAt = useRef(0);
  const seq = useRef(0);
  const lastTickAt = useRef(0);
  const copyTimer = useRef<number | undefined>(undefined);
  const urlRef = useRef<HTMLInputElement>(null);
  const liveBoxRef = useRef<HTMLInputElement>(null);
  const lineBoxRef = useRef<HTMLTextAreaElement>(null);
  const safeRef = useRef<HTMLButtonElement>(null);
  const stepMounted = useRef(false);
  /** 「貼って確かめる」で入れた文字から読み取った状態か（自動の確かめが失敗しても、消さないため） */
  const fromPaste = useRef(false);
  const setFromPaste = (v: boolean) => { fromPaste.current = v; setPasteSrc(v); };

  useEffect(() => {
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => { if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); };
  }, []);
  useEffect(() => () => { window.clearTimeout(copyTimer.current); }, []);
  // 画面の上の名前（タブの名前）を、画面の中の文と同じにする
  useEffect(() => { const before = document.title; document.title = PAGE_NAME; return () => { document.title = before; }; }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('event');
    const id = raw === null ? NEW_ID_DEFAULT : normalizeId(raw);
    if (raw === null) setNoEvent(true);
    if (raw !== null && id !== raw) {
      // 使えない文字が入っていたら、使える形に直して、アドレスも直す（保存データは別の名前に混ざらない）
      try { params.set('event', id); history.replaceState(null, '', location.pathname + '?' + params.toString() + location.hash); } catch { /* アドレスを直せなくても進められる */ }
      setIdFixed(id);
    }
    setEventId(id);
    let start = 1;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY + id) || 'null');
      if (saved) {
        const s = typeof saved.step === 'number' && saved.step >= 1 && saved.step <= 3 ? saved.step : 1;
        start = s;
        setStep(s); setReached(s); setEndpoint(typeof saved.endpoint === 'string' ? saved.endpoint : '');
        if (saved.verified === true && typeof saved.endpoint === 'string') setVerifiedUrl(saved.endpoint);
        if (Array.isArray(saved.ticks) && saved.ticks.length === 4) setTicks(saved.ticks.map((v: unknown) => v === true));
        if (s > 1) setResumeNote(true);
      }
    } catch { /* 覚えていなくても進められる */ }
    // ブラウザの「戻る」＝前の手順。いまの手順までの履歴を作っておく
    try {
      const base = location.pathname + location.search;
      const m = /^#step([123])$/.exec(location.hash);
      if (!m || Number(m[1]) !== start) {
        history.replaceState(null, '', base + '#step1');
        for (let n = 2; n <= start; n++) history.pushState(null, '', base + '#step' + n);
      }
    } catch { /* 履歴が作れなくても進められる */ }
    fetch('/template-link.json', { cache: 'no-store' }).then((r) => r.json() as Promise<{ copyUrl?: unknown }>).then((j) => {
      if (typeof j.copyUrl === 'string' && isTemplateCopyLink(j.copyUrl)) { setTemplateUrl(j.copyUrl); setTpl('ok'); } else setTpl('none');
    }).catch(() => setTpl('none'));
    setReady(true);
  }, []);

  // ブラウザの「戻る」「進む」で手順を切りかえる
  useEffect(() => {
    const onPop = () => {
      const m = /^#step([123])$/.exec(location.hash);
      const n = m ? Number(m[1]) : 1;
      setStep(n); setReached((r) => Math.max(r, n));
      setFileNote(null); setImportNote(null); setPendingImport(null); setResumeNote(false); setIdFixed(''); setNoEvent(false); setCopied(''); setCopyFailed(''); setWarn(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
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

  /** manual: ボタンを押した / auto: 自動 / poll: 定期の再確認（一時的な失敗では今の表示を消さない） */
  const check = async (mode: 'manual' | 'auto' | 'poll' = 'manual') => {
    let url: string;
    try { url = pingUrl(endpoint); } catch { if (mode !== 'poll') { setPing(null); if (mode === 'manual') setPingError('url'); } return; }
    const mine = ++seq.current;
    const checked = endpoint;
    if (mode !== 'poll') setChecking(true);
    try {
      const response = await fetch(url, { cache: 'no-store' });
      const next = parsePing(await response.json());
      if (mine !== seq.current) return;
      setFromPaste(false);
      setPing(next); setPingError(null); setOkAt(hhmm()); setVerifiedUrl(checked); setPollFailed(false);
    } catch (error) {
      if (mine !== seq.current) return;
      if (mode === 'poll') { setPollFailed(true); return; }
      setVerifiedUrl('');
      // 貼った文字から読み取った状態は、自動の確かめが失敗しても消さない（自分で押したときだけ消す）
      if (mode === 'auto' && fromPaste.current) return;
      setFromPaste(false);
      setPing(null);
      setPingError(classifyPingError(error));
    } finally {
      if (mine === seq.current) setChecking(false);
    }
  };
  useEffect(() => {
    if (!ready || !isAppsScriptUrl(endpoint)) { setFromPaste(false); setPing(null); return; }
    const timer = window.setTimeout(() => void check('auto'), 600);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, endpoint]);

  const urlOk = isAppsScriptUrl(endpoint);
  const diagnosis: Diagnosis | null = ping ? diagnose(ping) : null;
  const stage = diagnosis?.stage;
  /** シートから読み取った6つの項目。空のものは、次へ進めない */
  const readRows: ReadonlyArray<readonly [string, string]> = ping
    ? [['大会名', ping.title || ''], ['開催日', ping.date ? formatDateInput(ping.date) : ''], ['会場', ping.venue || ''], ['主催者名', ping.organizer || ''], ['問い合わせ先', ping.contact || ''], ['申込締切', ping.deadline ? formatDateInput(ping.deadline) : '']]
    : [];
  const missing = readRows.filter(([, v]) => !v).map(([k]) => k);
  /** 日にちが今日より前（去年のシートのコピー・年の書きまちがいに気づくため）。ここでは日本時間の今日と比べる */
  const datePast = !!ping && isPastDate(ping.date || '');
  const deadlinePast = !!ping && isPastDate(ping.deadline || '');
  const blocked = !urlOk || !diagnosis || datePast || deadlinePast || ['old-build', 'not-setup', 'bad-settings', 'storage-full', 'need-selftest'].includes(diagnosis.stage) || missing.length > 0;

  // 手順3に入ったら、すぐ確かめる。「受付を開始」を押すまでは5秒ごと、受付中は30秒ごとに確かめ直す。
  useEffect(() => {
    if (!ready || step !== 3 || !isAppsScriptUrl(endpoint) || fromPaste.current) return;
    void check('auto');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, step]);
  useEffect(() => {
    if (!ready || step !== 3 || (stage !== 'need-open' && stage !== 'ready') || !isAppsScriptUrl(endpoint) || pasteSrc) return;
    const id = window.setInterval(() => void check('poll'), stage === 'ready' ? 30000 : 5000);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, step, stage, endpoint, pasteSrc]);
  useEffect(() => { if (step === 3 && stage === 'ready') setWasReady(true); if (step !== 3) setWasReady(false); }, [step, stage]);

  // 手順が変わったら、上までもどす。
  useEffect(() => {
    if (!stepMounted.current) { stepMounted.current = true; return; }
    window.scrollTo({ top: 0 });
    // キーボードの人も迷わないよう、新しい手順の見出しに目印を移す
    window.setTimeout(() => { document.getElementById('s' + step + '-title')?.focus({ preventScroll: true }); }, 0);
  }, [step]);

  // 赤い1行が出たら、そこへ目印を移す。状況が変わったら消す
  useEffect(() => { if (warn) document.getElementById('warn-' + warn.key)?.focus(); }, [warn]);
  // URLのまちがいの赤い文が、画面の外（下）や上の帯の下にかくれていたら、見える所まで画面を動かす
  useEffect(() => {
    if (step !== 2 || !endpoint.trim()) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById('endpoint-problem');
      if (!el) return;
      const r = el.getBoundingClientRect();
      const nav = document.querySelector('nav[aria-label="3つの手順"]');
      const top = nav ? nav.getBoundingClientRect().bottom : 0;
      if (r.top < top + 4 || r.bottom > window.innerHeight - 8) el.scrollIntoView({ block: 'center' });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [endpoint, step]);
  useEffect(() => { setWarn(null); setUrlTarget(false); }, [step, ticks, endpoint, stage, pingError]);
  // 上書きの確認が出たら、安全なボタンに目印を移す
  useEffect(() => { if (pendingImport !== null) { document.getElementById('import-confirm')?.scrollIntoView({ block: 'center' }); safeRef.current?.focus(); } }, [pendingImport]);

  const stepChangedAt = useRef(0);
  const goStep = (n: number) => {
    // 二度押し対策: 進んだ直後(0.7秒)の「もどる」は無視する（手順が変わると画面が上にもどり、2回目の押しが上の手順ボタンに当たるため）
    if (n < step && Date.now() - stepChangedAt.current < 700) { setBackIgnored(true); window.setTimeout(() => setBackIgnored(false), 3000); return; }
    if (n !== step) {
      stepChangedAt.current = Date.now();
      try { history.pushState(null, '', location.pathname + location.search + '#step' + n); } catch { /* 履歴に積めなくても進められる */ }
    }
    setFileNote(null); setImportNote(null); setPendingImport(null); setResumeNote(false); setIdFixed(''); setNoEvent(false); setCopied(''); setCopyFailed(''); setWarn(null); setBackIgnored(false);
    setStep(n); setReached((r) => Math.max(r, n));
  };
  const canGo = (n: number) => n <= step || (n === 2 && reached >= 2) || (n === 3 && reached >= 2 && !blocked);

  const link = (mode: 'test' | 'live') => { try { return ping ? '/apply/' + publicEntryHash(entryConfigFromPing(ping, endpoint, mode)) : ''; } catch { return ''; } };
  const copy = async (key: string, text: string) => {
    window.clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(''); setCopied(key); setCopiedAt(hhmm()); if (key === 'live') { setEverCopiedLive(true); setCopiedLiveUrl(text); }
      copyTimer.current = window.setTimeout(() => setCopied(''), 5000);
    } catch {
      setCopied(''); setCopyFailed(key);
      window.setTimeout(() => { const box = key === 'line' ? lineBoxRef.current : liveBoxRef.current; box?.focus(); box?.select(); }, 0);
    }
  };
  const fetchTemplate = async (key: string, path: string) => {
    try { const r = await fetch(path); if (!r.ok) throw new Error(); await copy(key, await r.text()); } catch { setCopied(''); setCopyFailed(key); }
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
      setExported(true);
      setFileNote({ kind: 'ok', text: '書き出しました：' + name + '（' + hhmm() + '）', hint: '見つからないときは「ダウンロード」フォルダを開きます。大会の中身はGoogleのシートにあります。個人情報と鍵は入っていません。' });
    } catch (error) { setFileNote({ kind: 'bad', text: jpMessage(error, '書き出せませんでした。もう一度「設定を書き出す」を押してください。') + ' 画面の設定は消えていません。' }); }
  };
  const applyImport = (url: string) => {
    setEndpoint(url); setUrlFix(null); setPingError(null); setPendingImport(null); setOtherEvent('');
    goStep(2);
    setImportNote({ kind: 'ok', text: '設定を読み込みました' + (title ? '（' + title + '）' : '') + '（' + hhmm() + '）。' });
  };
  const upload = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    const fail = (text: string, hint?: string) => setFileNote({ kind: 'bad', text, hint });
    setPendingImport(null); setOtherEvent('');
    // 名前の終わりが .json でなければ、中身を読まずに断る
    if (!/\.json$/i.test(file.name)) { fail('このファイルは使えません（何も変わっていません）', '選ぶファイル：tournament-os-setup-' + eventId + '.json'); return; }
    try {
      const s = importSetup(await file.text());
      // 別の大会のファイルでは、何も変えない（読み込めたように見せない）
      if (s.eventId !== eventId) { setOtherEvent(s.eventId); fail('別の大会のファイルです。この画面の設定は変えていません。'); return; }
      if (!s.endpoint) { fail('このファイルにはURLが入っていません。何も変えません。'); return; }
      if (s.endpoint === endpoint) { setFileNote({ kind: 'info', text: 'このファイルは、いまの設定と同じです。何も変えていません。' }); return; }
      if (endpoint.trim()) { setFileNote(null); setPendingImport(s.endpoint); return; }
      applyImport(s.endpoint);
    } catch (error) { fail(jpMessage(error, '読み込めませんでした。書き出したファイルを選んでください。') + ' この画面の設定は変えていません。', '選ぶファイル：tournament-os-setup-' + eventId + '.json'); }
  };
  const ownerCopy = (() => { try { return ownerSheet.trim() ? templateCopyLink(ownerSheet.normalize('NFKC').trim().replace(/\/u\/\d+\//, '/')) : ''; } catch { return 'ERR'; } })();
  const jumpToUrl = () => { urlRef.current?.scrollIntoView({ block: 'center' }); urlRef.current?.focus(); };
  /** コピーしたURLを、ボタン1つで入れる。使えないブラウザでは、四角に貼る方法を言葉で伝える（通信はしない） */
  const pasteFromClipboard = async () => {
    const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
    if (safari) setPasteNote({ kind: 'warn', text: '小さな「ペースト」が出たら、それを押します。' });
    try {
      const text = (await navigator.clipboard.readText()).slice(0, 4000);
      if (!text.trim()) { setPasteNote({ kind: 'bad', text: 'コピーした文字がありません。Googleの画面で「コピー」を押してから、もう一度ここを押します。まだのときは、下の「Googleでの3つの操作」を見ます。' }); urlRef.current?.focus(); return; }
      const r = cleanUrl(text);
      if (!r.ok && !looksLikeUrl(text)) { setPasteNote({ kind: 'bad', text: 'コピーしたのはURLではありません（入れていません）。Googleの画面で、/exec で終わるURLの「コピー」を押してから、もう一度ここを押します。' }); urlRef.current?.focus(); return; }
      setFromPaste(false); setEndpoint(r.ok ? r.url : text.trim()); setUrlFix(r.ok && r.changed ? { from: text.trim(), to: r.url } : null); setPingError(null); setPasteNote(null); urlRef.current?.focus({ preventScroll: true });
    } catch {
      setPasteNote({ kind: 'bad', text: 'このボタンでは貼れませんでした。下の四角をクリックして、Ctrl を押しながら V（Macは ⌘ を押しながら V）を押します。スマホのときは、四角を長く押して「貼り付け」を選びます。' });
      urlRef.current?.focus();
    }
  };

  if (!ready) return <main className="tos-read min-h-screen bg-slate-50 p-8 text-lg font-medium text-slate-950 [color-scheme:light]">じゅんびしています…</main>;

  const liveUrl = ping && link('live') ? location.origin + link('live') : '';
  const lineText = liveUrl ? (ping?.title || '大会') + 'の参加申し込みはこちら：' + liveUrl : '';
  const urlReady = !!(diagnosis?.ok && liveUrl);
  const copiedFresh = everCopiedLive && !!liveUrl && copiedLiveUrl === liveUrl;
  const staleCopy = everCopiedLive && urlReady && copiedLiveUrl !== liveUrl;
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

  /* ---------- 「次はここ」を決める。画面の黄色・上の「▶ 次にやる」は、すべてこの1つから作る ---------- */
  // 短い入力は、打っている途中かもしれないので赤にしない。ただし、URLに使えない文字（絵文字・日本語）が入っていたら、すぐ赤にする
  const endpointProblem = !endpoint.trim() || urlOk || (endpoint.trim().length < 8 && !/[^\x00-\x7F]/.test(endpoint.normalize('NFKC'))) ? null : cleanUrl(endpoint);
  const urlWrong = !!endpointProblem && !endpointProblem.ok;
  /** URLの欄の状態に合わせた「押せない理由」。まちがいが出ているときに「貼ってください」と言うと、画面とくいちがう */
  const urlLockWhy = !endpoint.trim() ? 'URLを貼ると押せます' : urlWrong ? 'URLを直すと押せます（上の「✕」の文のとおりに）' : 'URLを最後まで貼ると押せます';
  const cardNow = ticks.findIndex((t) => !t);
  const showTopExport = storageFailed && urlOk && !exported;
  const next: Next = (() => {
    if (showTopExport) return { id: 'export', label: '「設定を書き出す」を押して保存する' };
    if (step === 1) {
      if (tpl !== 'ok') return null;
      if (cardNow === 0 && !copyOpened) return { id: 'card0', label: '作業1：「ひな形のコピーを作る」を押す' };
      if (cardNow >= 0) return { id: ('card' + cardNow) as NextId, label: CARD_LABELS[cardNow] };
      return { id: 'go2', label: '「準備できました → 次へ」を押す' };
    }
    if (step === 2 && !urlOk) {
      if (urlWrong) return { id: 'paste', label: 'ここにURLを貼り直す' };
      const i = ops.findIndex((v) => !v);
      return i >= 0 ? { id: ('op' + i) as NextId, label: OP_LABELS[i] } : { id: 'paste', label: 'ここにURLを貼る' };
    }
    if (!urlOk) return { id: 'back2', label: '手順2へ戻って、URLを貼る' };
    if (pingError === 'access') return step === 2 ? { id: 'paste', label: 'ここに新しいURLを貼り直す' } : { id: 'open-ops', label: '手順2へ戻って、新しいURLを貼り直す' };
    if (pingError === 'wrong-app') return { id: 'wrong-app', label: '手順1へ戻る' };
    if (pingError === 'net') return { id: 'recheck', label: 'もう一度確かめる' };
    if (pingError || !diagnosis) return null;
    switch (diagnosis.stage) {
      case 'old-build': return { id: 'send-photo', label: 'この画面の写真を、ジムの担当者に送る' };
      case 'not-setup': return { id: 'rerun1', label: 'Googleシートで「Tournament OS」→「① 最初の設定」を押す' };
      case 'need-selftest': return { id: 'rerun1', label: '「① 最初の設定」をもう一度押す' };
      case 'bad-settings': return { id: 'recheck-fix', label: '直したら、これを押す' };
      case 'storage-full': return { id: 'tell-staff', label: 'ジムの担当者に「Googleの保存できる場所が いっぱい」と伝える' };
      default: break;
    }
    if (step === 2) return missing.length || datePast || deadlinePast ? { id: 'recheck-fix', label: '直したら、これを押す' } : { id: 'next', label: 'これでよければ「次へ進む」を押す' };
    if (diagnosis.stage === 'need-open') return { id: 'open', label: 'Googleシートで「Tournament OS」→「② 受付を開始」を押す' };
    if (!urlReady) return null;
    if (staleCopy) return { id: 'copy-new', label: '新しいURLをコピーする' };
    if (copyFailed === 'live' || copyFailed === 'line') return { id: 'copy-manual', label: '四角を長く押して「コピー」を選ぶ' };
    if (!copiedFresh) return { id: 'copy', label: '選手に渡すURLをコピーする' };
    return null;
  })();
  const here = (id: NextId) => next?.id === id;
  const mark = (id: NextId, node: ReactNode) => <Mark on={here(id)} label={next?.label || ''}>{node}</Mark>;
  const finished = step === 3 && !next && urlReady && copiedFresh;
  const warnLine = (key: string) => (warn?.key === key ? <ErrorLine id={'warn-' + key} className="mb-2">{warn.text}</ErrorLine> : null);
  const nextReason = !urlOk ? urlLockWhy
    : !diagnosis ? 'Googleにつながるまで押せません。少し待っても変わらないときは「もう一度確かめる」を押します'
    : stage === 'old-build' ? 'Googleの版が古いので押せません。ジムの担当者に連絡してください'
    : stage === 'not-setup' ? '①が終わってから押せます'
    : stage === 'bad-settings' ? '「設定」タブを直して、「もう一度確かめる」を押してから押せます'
    : stage === 'storage-full' ? 'Googleの保存場所の問題が直ってから押せます'
    : stage === 'need-selftest' ? '①をもう一度押してから押せます'
    : missing.length ? '未入力があります（シートの「設定」タブに書いてから）'
    : deadlinePast || datePast ? '日にちが過ぎています（シートの「設定」タブを直してから）'
    : '';
  const backHere = 'おわったら、一番上の「' + PAGE_NAME + '」のタブを押して、ここにもどります。';
  const toggleTick = (i: number) => {
    // 二度押し対策: 「できた ✓」を押した直後（0.45秒）の2回目の押しは、✓を外すボタンに当たることがある。✓を外す動きは、無視する
    if (ticks[i] && Date.now() - lastTickAt.current < 450) return;
    if (!ticks[i]) lastTickAt.current = Date.now();
    if (i === 0 && ticks[0]) setCopyOpened(false);
    setTicks((t) => t.map((v, j) => (j === i ? !v : v)));
    setTickAt((t) => t.map((v, j) => (j === i ? (ticks[i] ? '' : hhmm()) : v)));
  };
  const openStaff = () => { setStaffOpen(true); window.setTimeout(() => document.getElementById('staff-only')?.scrollIntoView({ block: 'start' }), 0); };
  const showStaff = () => { setStaffNote(true); openStaff(); };
  const openOps = () => { setOpsSignal((n) => n + 1); window.setTimeout(() => document.getElementById('ops-fold')?.scrollIntoView({ block: 'start' }), 0); };

  // 上の3つのボタンが、この画面の「ただ1つの」進みぐあい。各ボタンに ✓ できた / ▶ いまここ / まだ / 🔒 の言葉がつく
  const stepBtn = (n: number) => {
    const cur = n === step, done = n < step || (n === 3 && urlReady && step === 3), can = canGo(n);
    return <li key={n}><button type="button" aria-current={cur ? 'step' : undefined} aria-disabled={!can || undefined} onClick={() => { if (!can) { setWarn({ key: 'nav', text: 'まだ押せません。上の順番どおりに進めます。' + (n === 2 ? '先に、手順1の4つの作業をします。' : 'URLを貼って確かめるのが先です。') }); return; } goStep(n); }}
      className={'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-1 text-[17px] font-bold leading-tight ' + FOCUS + ' ' + (cur ? 'border-4 border-indigo-700 bg-indigo-50 text-indigo-950' : done ? 'border-emerald-700 bg-emerald-50 text-emerald-950' : can ? 'border-slate-500 bg-white text-slate-800' : 'tos-locked')}>
      <span className="sr-only">手順{n}、{STEP_NAMES[n - 1]}、{cur ? 'いまここ' : done ? 'できた' : can ? 'まだ（押せます）' : 'まだ（まだ押せません）'}</span>
      <span aria-hidden="true" className="flex flex-col items-center leading-tight sm:flex-row sm:gap-1.5">
        <span>{done && !cur ? '✓ ' : ''}手順{n}</span>
        <span>{STEP_NAMES[n - 1]}</span>
      </span>
      <span aria-hidden="true">{cur ? '▶ いまここ' : done ? '✓ できた' : can ? 'まだ' : '🔒 まず手順' + (n - 1)}</span>
    </button></li>;
  };

  /** 受付の状態。手順2と手順3で同じ言葉・同じ色を使う。 */
  const connectionBox = (d: Diagnosis) => {
    const m = d.message;
    const message = <p>{d.ok ? '✓ ' : ''}{m}</p>;
    const chips = (menu: string) => <div className="space-y-1"><p>Googleのシートで、下の絵のとおりに押します。</p><MenuPic menu={menu} /></div>;
    switch (d.stage) {
      case 'ready':
        return <Box tone="ok" role="status"><p className="text-xl font-bold">✓ 受付中です</p>{message}{step === 2 ? <p className="font-bold">次は「次へ進む」を押します。手順3で、選手に渡すURLをコピーします。</p> : null}</Box>;
      case 'need-open':
        return step === 2
          ? <Box tone="info" role="status"><p className="font-bold">✓ つながりました。次は「次へ進む」を押します。</p><p className="text-[17px]">（「② 受付を開始」は、手順3で押します）</p></Box>
          : <Box tone="info" role="status"><p className="font-bold">あと1つで完成です</p><p className="text-[17px]">{m}</p></Box>;
      case 'need-selftest':
        return <><Caution lead="あと少しです。">{message}</Caution>{step === 2 ? mark('rerun1', chips('「① 最初の設定」')) : null}</>;
      case 'old-build':
        return <>
          <ErrorLine>Googleの版が古いです。ここから先に進めません</ErrorLine>
          {mark('send-photo', <p>この画面の写真を、ジムの担当者に送ります。あなたが直す必要はありません。</p>)}
          <Fold caution defaultOpen title="ジムの担当者向け">
            <Caution title="気をつけて" lead="ジムの担当者の人だけ。" />
            <p>ひな形を新しい版にしてから、もう一度「デプロイ」します。（「デプロイを管理」→ 鉛筆 →「新バージョン」→「デプロイ」でも直ります）</p>
          </Fold>
        </>;
      case 'not-setup':
        return <>
          <ErrorLine>まだ最初の設定が終わっていません（①がまだです）</ErrorLine>
          {step === 2 ? mark('rerun1', chips('「① 最初の設定」')) : null}
        </>;
      case 'bad-settings': {
        const lines = settingLines(m);
        return <Box tone="bad" role="alert">
          <p>シートの「設定」タブに、直すところがあります</p>
          <ul className="space-y-3">
            {lines.map((l) => <li key={l.google} className="space-y-1">
              {l.fixes.map((f) => <p key={f}>{f}</p>)}
              <p className="text-[17px] font-medium text-slate-800">Googleの言葉：{l.google}</p>
            </li>)}
          </ul>
          <p className="font-semibold">直したら、このページの「もう一度確かめる」を押します。</p>
        </Box>;
      }
      default:
        return <>
          <ErrorLine>このままでは写真が保存できません</ErrorLine>
          {mark('tell-staff', <p>やること：ジムの担当者に「Googleの保存できる場所が いっぱい」と伝える</p>)}
          <p className="text-[17px] text-slate-800">Googleの言葉：{jpMessage(new Error(m), 'Googleの保存場所が、いっぱいかもしれません。').replace('Driveや Gmail', 'Googleの保存場所')}</p>
        </>;
    }
  };

  /** エラーは、原因のすぐそばに出す。見出しは「何が起きたか」、本文は「何をするか」。 */
  const errorBox = (kind: PingError | null) => {
    if (kind === 'url') return <Box tone="bad" role="alert"><p>URLの形が違います</p><p className="font-semibold">…/exec で終わる「ウェブアプリ」のURLを、もう一度コピーして貼ってください。</p></Box>;
    if (kind === 'access') return <Box tone="bad" role="alert">
      <p>Googleが、まだ「だれでも使える」になっていません</p>
      <ol className="list-decimal space-y-1 pl-6 font-semibold">
        <li>Googleの「デプロイ」→「新しいデプロイ」を、もう一度押す。</li>
        <li>「アクセスできるユーザー」が「全員」か見て、「デプロイ」を押す。</li>
        <li>出た新しいURLの「コピー」を押して、{step === 2 ? '上の四角' : '手順2の四角'}に貼り直す（前のURLは使いません）。</li>
      </ol>
      <p className="text-[17px]">「もう一度確かめる」だけでは直りません。前のURLを確かめるだけだからです。</p>
      {mark('open-ops', <button type="button" onClick={() => { if (step === 2) openOps(); else goStep(2); }} className={here('open-ops') ? btnPrimary : btnSecondary}>{step === 2 ? 'Googleの3つの操作を開く' : '手順2へ戻る'}</button>)}
    </Box>;
    if (kind === 'wrong-app') return <Box tone="bad" role="alert">
      <p>これは、このひな形のURLではありません</p>
      <p className="font-semibold">ひな形のコピーを作り直して、そのURLを貼ります。</p>
      {mark('wrong-app', <button type="button" onClick={() => goStep(1)} className={here('wrong-app') ? btnPrimary : btnSecondary}>手順1へ戻る</button>)}
    </Box>;
    if (kind === 'net') return <Box tone="bad" role="alert"><p>Googleにつながりませんでした</p>
      <p className="font-semibold">ネットにつながっているか、見てください。入れたURLは、そのまま残っています。</p>
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

  /** 自動で確かめられないときの入り口。手順2と手順3の両方に出す（貼った文字を、手順3でも貼り直せるように）。 */
  const pasteFold = <Fold title="自動で確かめられないとき（貼って確かめる）" openSignal={pingError === 'net'}>
    <ol className="list-decimal space-y-2 pl-6">
      <li>下のボタンで、確かめるページを開きます。文字が出ます。</li>
      <li>その文字を、すべてコピーします。</li>
      <li>この画面に戻って、下の欄に貼ります。</li>
    </ol>
    <a aria-disabled={!urlOk} aria-describedby="open-ping-why" href={urlOk ? endpoint + '?action=ping' : undefined} target="_blank" rel="noreferrer" className={urlOk ? btnSecondary : btnSecondaryOff + ' pointer-events-none'}>確かめるページを開く</a>
    {urlOk ? <p id="open-ping-why" className="text-[17px]">{VIEW_WINDOW}</p> : <Why id="open-ping-why">{endpoint.trim() && urlWrong ? '先にURLを直します。上の「✕」の文のとおりに直すと押せます。' : '先にURLを貼ります。上の欄にURLを貼ると押せます。'}</Why>}
    <div>
      <label htmlFor="pasted" className="block font-bold">出た文字を貼る <Tag>なくてもOK（自動で確かめられるときは、使いません）</Tag></label>
      <Caution className="mt-2" lead="文字は { で始まり } で終わります。前後の説明や ``` があっても、自動で取りのぞきます。" />
      <textarea id="pasted" className={field + ' h-32' + (pingError === 'paste-unreadable' || pingError === 'paste-wrong' ? ' tos-input-error' : '')} value={pasted} aria-describedby="pasted-help" aria-invalid={pingError === 'paste-unreadable' || pingError === 'paste-wrong' || undefined} spellCheck={false} onChange={(e) => {
        const text = e.target.value; setPasted(text);
        if (!text.trim()) { setPingError(null); setFromPaste(false); return; }
        try { const next = parsePingText(cleanPasted(text)); setFromPaste(true); setPing(next); setPingError(null); setOkAt(hhmm()); } catch (error) { setFromPaste(false); setPing(null); setPingError(error instanceof Error && error.message.includes('貼った文字を読めません') ? 'paste-unreadable' : 'paste-wrong'); }
      }} placeholder='{"app":"tournament-os", …}' />
      {pingError === 'paste-unreadable' ? <ErrorLine className="mt-2">貼った文字を読めません。確かめるページに出た文字を、すべてコピーして貼ってください。</ErrorLine> : null}
      {pingError === 'paste-wrong' ? <ErrorLine className="mt-2">これは、この大会の受付の文字ではありません。「ウェブアプリ」のURLで開いたページの文字を、すべて貼ってください。</ErrorLine> : null}
      {pasteSrc && ping ? <OkLine className="mt-2">読めました（Googleにはつないでいません）</OkLine> : null}
      <p id="pasted-help" className="mt-2 text-[17px]">出る文字には、大会の設定と受付の状態だけが入っています。メールアドレスや鍵、申込の内容は入っていません。貼った文字は、読めなくても消えません。</p>
    </div>
  </Fold>;

  const sheetRows: ReadonlyArray<readonly [string, string, string, string]> = [
    ['大会名', 'B2', 'write', '○○ジム交流大会'], ['開催日', 'B3', 'write', '2027年10月3日'], ['会場', 'B4', 'write', '○○体育館'], ['会場の地図URL', 'B5', 'skip', '書かなくてOK（空のままでいい）'],
    ['主催者名', 'B6', 'write', '○○ジム'], ['問い合わせ先', 'B7', 'write', '03-0000-0000'], ['申込締切', 'B8', 'write', '2027年9月20日'], ['入場曲', 'B9', 'write', 'あり か なし を▼から選ぶ'],
    ['学年', 'B10', 'skip', '書かなくてOK（最初から入っています）'], ['年齢', 'B11', 'skip', '書かなくてOK（最初から入っています）'], ['意気込み', 'B12', 'skip', '書かなくてOK（最初から入っています）'],
  ];
  const musicText = ping?.music === true ? 'あり' : ping?.music === false ? 'なし' : '（シートにありません）';
  const modeText = (v?: string) => (v === 'required' ? '必ず書く' : v === 'off' ? '聞かない' : '書いても、書かなくてもOK');

  const opBodies: ReactNode[] = [
    <>シートの上のメニュー <b>「拡張機能」→「Apps Script」</b> を押す（新しいタブが開きます）</>,
    <>
      <ol className="list-none space-y-1 pl-0">
        <li><b>a.</b> 右上の <b>「デプロイ」→「新しいデプロイ」</b> を押す。</li>
        <li><b>b.</b> <b>「種類を選択」の歯車 →「ウェブアプリ」</b> を選ぶ。</li>
        <li><b>c.</b> 右下の <b>「デプロイ」</b>（Googleの青いボタン）を押す。「アクセスを承認」と出たら「許可」まで押す（手順1の作業3と同じ）。</li>
      </ol>
      <Caution className="mt-2" lead="「新しいデプロイ」は1回だけ押します。何回も押すと、URLが何個もできます。" />
      <span className="tos-danger mt-2 block">✕ 「デプロイをテスト」は押さない（URLが /dev になって使えません）</span>
    </>,
    <>
      <span><b>「ウェブアプリ」のURL</b>（…/exec で終わる長い文字）の横の <b>「コピー」</b> を押す。コピーしたら、この画面にもどって、下の「貼る四角」に貼ります。</span>
      <span role="img" aria-label="Googleの画面の絵。ウェブアプリの下にURLが出て、その横に「コピー」があります。ここでは押せません。" className="tos-pic mt-2 block p-3 text-[17px]">
        <span aria-hidden="true" className="tos-pic-tag">📷 Googleの画面の絵（ここでは押せません）</span>
        <span aria-hidden="true" className="mt-1 block font-bold">ウェブアプリ</span>
        <span aria-hidden="true" className="mt-1 flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-all border-2 border-dotted border-slate-500 bg-slate-50 px-2">https://script.google.com/macros/s/…/exec</span>
          <span className="tos-gchip" style={{ borderWidth: 4, borderColor: '#1c1917' }}>◀ ここの「コピー」</span>
        </span>
        <span aria-hidden="true" className="mt-1 block font-bold">↑ 「コピー」の文字を押します</span>
      </span>
    </>,
  ];

  const opsAllDone = urlOk || ops.every(Boolean);
  const opsFold = <Fold id="ops-fold" key={opsAllDone ? 'folded' : 'open'} defaultOpen={!opsAllDone} openSignal={opsSignal} title="Googleでの3つの操作" sub={opsAllDone ? '見直したいときに ひらきます' : 'この順に押して、URLをコピーします'}>
    <p className="text-[17px]"><span aria-hidden="true">🔒 </span>入れた文字は、この画面とGoogleの中だけで使います。</p>
    <p>Googleの画面には「Apps Script」「デプロイ」という名前が出ます。そう書いてあるので、そのまま押します。（デプロイ ＝ みんなが使えるように出すこと）</p>
    <ol className="space-y-3">
      {opBodies.map((content, i) => {
        const done = urlOk || ops[i];
        const now = here(('op' + i) as NextId);
        return <li key={i}>
          <div className={'flex flex-col items-start gap-2 rounded-2xl p-3 font-medium text-slate-950 sm:flex-row sm:gap-3 sm:p-4 ' + (done ? 'border-2 border-emerald-700 bg-emerald-50' : now ? 'border-4 border-indigo-700 bg-white' : 'border-2 border-slate-300 bg-slate-50')}>
            <span aria-hidden="true" className={'grid h-14 w-14 shrink-0 place-items-center rounded-full text-center text-[17px] font-bold leading-none text-white ' + (now ? 'bg-indigo-700' : 'bg-slate-700')}><span>操作<br />{i + 1}</span></span>
            <div className="min-w-0 w-full flex-1 space-y-2 sm:pt-1">
              <div>{content}</div>
              {done ? <OkLine>{urlOk ? 'できた（URLが入りました）' : 'できた'}</OkLine> : null}
              {!urlOk ? (done
                ? <button type="button" onClick={() => setOps((o) => o.map((v, j) => (j === i ? false : v)))} className={btnQuiet}>まちがえた → 操作{i + 1}をやり直す</button>
                : <Mark on={now} label={'操作' + (i + 1) + 'が終わったら、ここを押す'}><button type="button" onClick={() => setOps((o) => o.map((v, j) => (j === i ? true : v)))} className={now ? btnPrimary : btnSecondary}>操作{i + 1}が終わった ✓</button></Mark>) : null}
            </div>
          </div>
        </li>;
      })}
    </ol>
    <p className="font-bold">{backHere}</p>
    <p className="text-[17px]">Googleが英語のときは: Deploy → New deployment → Deploy、Copy</p>
    <p className="text-[17px] font-bold">Googleの画面で、この3つが下のようになっていれば正しいです（最初から選ばれています）</p>
    <div role="img" aria-label="Googleの画面の見本。種類はウェブアプリ、実行は自分、アクセスは全員。ここでは押せません。" className="tos-gpic">
      <span aria-hidden="true" className="tos-pic-tag">📷 Googleの画面の見本（ここでは押せません）</span>
      <span aria-hidden="true" className="mt-1 flex flex-wrap gap-2"><span className="tos-gchip">種類：ウェブアプリ</span><span className="tos-gchip">実行：自分</span><span className="tos-gchip">アクセス：全員</span></span>
    </div>
    <Fold title="設定が違っていたら">
      <p>「デプロイ」の画面で、3つの選ぶところを見ます（違っていたら選び直します）。</p>
      <ul className="list-disc space-y-1 pl-6"><li>種類：「ウェブアプリ」</li><li>実行するユーザー：「自分」</li><li>アクセスできるユーザー：「全員」</li></ul>
      <p>「全員」は、申込を送れるという意味です。申込表と写真フォルダが公開されるわけではありません。</p>
    </Fold>
  </Fold>;

  const problem = endpointProblem && !endpointProblem.ok ? urlProblem(endpointProblem.kind) : null;
  const statusBlock = !endpoint.trim() ? null
    : !urlOk ? (problem
      ? <>
        <Box tone="bad" role="alert" id="endpoint-problem"><p>{problem.head}</p>{problem.body ? <p className="font-semibold">{problem.body}</p> : null}</Box>
        <Example className="mt-2">正しい形は <code>{GOOD_URL}</code> で終わる長いURL</Example>
      </>
      : null)
    : <>
      {urlFix ? <OkLine className="mb-2">自動で直しました：{shortUrl(urlFix.from)} → {shortUrl(urlFix.to)}</OkLine> : null}
      {ping && pasteSrc ? <Caution lead="貼った文字を読みました（Googleにはつないでいません）。" />
        : ping ? <OkLine>つながりました（URLは正しいです）{okAt ? '　' + okAt : ''}</OkLine>
        : pingError === 'url' || pingError === 'access' || pingError === 'wrong-app' || pingError === 'net' ? null
        : pingError ? <Caution lead="URLの形はOKです。でも、Googleにつながるか確かめられませんでした。入れたURLは残っています。下の説明を見て、「もう一度確かめる」を押してください。" />
        : <Box tone="info"><p>URLの形はOKです。いまGoogleにつないで確かめています…</p></Box>}
    </>;

  const urlBox = <div id="url-box" className="rounded-2xl border-2 border-slate-400 bg-white p-3 font-medium text-slate-950 sm:p-4">
    {!urlOk ? <p className="text-balance text-xl font-bold">{here('paste') ? 'コピーしたURLを、ここに貼ります。' : 'URLを貼る場所です。上の操作1〜3が終わってから使います。'}</p> : null}
    {!urlOk ? <button type="button" onClick={() => void pasteFromClipboard()} aria-describedby="paste-help" className={(here('paste') ? btnPrimary : btnSecondary) + ' mt-3'}>コピーしたURLを貼りつける</button> : null}
    {!urlOk ? <div id="paste-help" className="mt-2">
      {pasteNote?.kind === 'bad' ? <ErrorLine id="warn-paste">{pasteNote.text}</ErrorLine> : pasteNote?.kind === 'warn' ? <Caution lead={pasteNote.text} /> : <p className="text-[17px]">このボタンを押すか、下の四角に貼ります（Ctrl を押しながら V。Macは ⌘ を押しながら V）。貼ると、自動で確かめます。</p>}
    </div> : null}
    <label htmlFor="endpoint" className={(urlOk ? '' : 'mt-3 ') + 'block min-h-11 py-1 text-xl font-bold'}>ウェブアプリのURL <Tag must>必須</Tag></label>
    {urlOk && pingError === 'access' ? <p id="endpoint-example" className="tos-example mt-1" style={S17}>古いURLを消して、新しいURLを貼ります（四角を押して、Ctrl を押しながら A で全部えらび、Ctrl を押しながら V。Macは ⌘）。</p> : urlOk && pingError ? null : urlOk ? <p id="endpoint-example" className="tos-example mt-1" style={S17}>貼ると、自動で確かめます。</p> : <Example id="endpoint-example" className="mt-1"><code>{GOOD_URL}</code> で終わる長いURL</Example>}
    <input id="endpoint" ref={urlRef} className={field + (problem ? ' tos-input-error' : '') + (urlTarget ? ' tos-target' : '')} value={endpoint} aria-invalid={(!urlOk && !!endpoint.trim() && !!problem) || undefined} aria-describedby={'endpoint-example endpoint-state' + (problem ? ' endpoint-problem' : '')} inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false}
      onChange={(e) => {
        const raw = e.target.value;
        const r = cleanUrl(raw);
        setFromPaste(false); setPingError(null); setPasteNote(null);
        if (r.ok) { setEndpoint(r.url); setUrlFix(r.changed ? { from: raw.trim(), to: r.url } : null); } else { setEndpoint(raw); setUrlFix(null); }
      }} placeholder="https://script.google.com/macros/s/…/exec" />
    <div id="endpoint-state" className="mt-3">{statusBlock}</div>
    {pingError === 'url' || pingError === 'access' || pingError === 'wrong-app' || pingError === 'net' ? <div className="mt-3">{errorBox(pingError)}</div> : null}
  </div>;

  const recheckPrimary = here('recheck') || here('recheck-fix');
  const recheckBtn = (cls: string) => <button type="button" aria-disabled={!urlOk || checking || undefined} aria-busy={checking} onClick={() => {
    if (!urlOk) { setWarn({ key: 'recheck', text: 'まだ押せません：' + (endpoint.trim() && urlWrong ? '上の「✕」の文のとおりに、URLを直してください。' : '先に、上の欄にURLを貼ってください。') }); setUrlTarget(true); jumpToUrl(); return; }
    if (checking) return;
    void check('manual');
  }} className={cls}>もう一度確かめる</button>;

  const zipSteps = <div className="space-y-2 rounded-xl border-2 border-emerald-700 bg-white p-3 text-slate-950">
    <p className="font-bold">申し込みが集まったあとにすること</p>
    <ol className="list-decimal space-y-1 pl-6">
      <li>Googleのシートを開き、上のメニュー「Tournament OS」→「{MENU_ZIP}」を押します。（ZIP ＝ 申し込みをまとめたファイルのことです）</li>
      <li>シートの画面の上に、URLが20秒だけ出ます。そのURLをクリックします。消えたら、もう一度「{MENU_ZIP}」を押します。</li>
      <li>Googleドライブが開きます。ZIPの「ダウンロード」を押します（「ダウンロード」フォルダに入ります）。</li>
      <li>「試合の準備」の画面で「ファイルを選ぶ」を押して、そのファイル（名前の最後が .zip）を選びます。</li>
    </ol>
    <Caution lead={<>「{MENU_ZIP}」を押しても、まだパソコンには入りません。上の3番の「ダウンロード」を押します。</>} />
  </div>;

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
        {warn?.key === 'nav' ? <ErrorLine id="warn-nav" className="mt-2">{warn.text}</ErrorLine> : null}
      </nav>

      <div className="mt-2 rounded-xl border-2 border-indigo-700 bg-indigo-50 px-4 py-1 text-indigo-950">
        <p className="font-bold">いまここ {step} / 3：{STEP_NAMES[step - 1]}<span className="hidden sm:inline">（{STEPS[step - 1]}）</span></p>
        {next ? <p className="text-[17px] font-bold">▶ 次にやる：{next.label}</p> : finished ? <p className="text-[17px] font-bold">✓ いまは、やることはありません</p> : null}
      </div>
      {idFixed ? <Caution className="mt-3" lead={<>大会番号を「{idFixed}」に直しました。別の大会と同じ番号になっていないか確認してください。</>} /> : null}
      {noEvent ? <Caution className="mt-3" lead="大会の名前がありません。「試合の準備」から開き直します。"><a href="/private/" className={btnText + ' mt-1'}>試合の準備を開く</a></Caution> : null}
      {resumeNote ? <OkLine className="mt-3">続きから始めました。いまは3つのうち{step}つ目です。</OkLine> : null}
      {importNote ? <OkLine className="mt-3">{importNote.text}</OkLine> : null}
      {storageFailed
        ? <div className="mt-3 space-y-2">
          <ErrorLine>この画面を閉じると、URLが消えます。この画面の進みぐあいを、覚えておけません。</ErrorLine>
          <p className="text-[17px]">画面を閉じると最初からになります。URLだけ、紙などに控えておいてください。</p>
          {showTopExport ? mark('export', <button type="button" onClick={download} className={btnPrimary}>設定を書き出す</button>) : null}
        </div>
        : savedAt && step !== 2 ? <p className="mt-1 text-[17px] leading-normal text-emerald-900">✓ 進みぐあいを覚えました {savedAt}</p> : null}

      <div className="mt-4 space-y-5">
      {step === 1 ? <section aria-labelledby="s1-title" className="space-y-4 rounded-3xl border-2 border-indigo-700 bg-white p-4 sm:p-6">
        <h2 id="s1-title" tabIndex={-1} className="text-balance text-2xl font-bold">ひな形をコピーして、設定を書く</h2>
        <p className="font-bold">4つの作業を、上から順にやります。「👉 次はここ」と書いてある所が、次にやる所です。</p>
        <p>1つ終わったら「できた ✓」を押します。押すと、「👉 次はここ」が次の作業に移ります。</p>
        <Fold title="画面（タブ）の行ったり来たり">
          <Caution lead="「タブ」は2種類あります。まぜないでください。">
            <ol className="list-decimal space-y-1 pl-6">
              <li>画面の一番上に並ぶ名前（Chrome・Safariなどの上のタブ）。このページの名前は「{PAGE_NAME}」です。押すと切りかえられます。</li>
              <li>Googleシートの一番下に並ぶ名前（シートの下の「設定」と書いたタブ）。これは、シートの中の表です。</li>
            </ol>
          </Caution>
          <div aria-hidden="true" className="flex gap-1 overflow-hidden rounded-t-lg border-b-2 border-slate-400 pt-1 text-[17px]">
            <span className="min-w-0 truncate rounded-t-lg border-2 border-b-0 border-indigo-700 bg-indigo-100 px-3 py-1 font-bold">{PAGE_NAME}</span>
            <span className="min-w-0 truncate rounded-t-lg border-2 border-b-0 border-slate-400 bg-white px-3 py-1">○○のコピー（Googleのシート）</span>
          </div>
        </Fold>

        <StepCard n={1} title="コピーを作る" done={ticks[0]} doneAt={tickAt[0]} here={here('card0') && copyOpened} current={cardNow === 0} label="作業1が終わったら「できた ✓」を押す" locked={false} lockReason="" onDone={() => toggleTick(0)} onUndo={() => toggleTick(0)} onBlocked={() => undefined}>
          <p className="text-[17px]">「ひな形」は、見本のGoogleシートのことです。これを自分用にコピーして使います。</p>
          {tpl === 'ok'
            ? <Mark on={here('card0') && !copyOpened} label="作業1：ここを押して、Googleでコピーを作る"><a href={templateUrl} target="_blank" rel="noreferrer" onClick={() => setCopyOpened(true)} className={here('card0') && !copyOpened ? btnPrimary : btnSecondary}>ひな形のコピーを作る（Googleが開きます）</a></Mark>
            : tpl === 'loading'
              ? <p>読み込んでいます…</p>
              : <div className="space-y-2">
                <ErrorLine>いまは作業できません。ジムの担当者に連絡してください。</ErrorLine>
                <p>「ひな形のリンクがありません」と伝えます。あなたが直す必要はありません。</p>
                <button type="button" onClick={showStaff} className={btnQuiet}>ジムの担当者向けの説明を見る</button>
                {staffNote ? <Caution lead="ジムの担当者の人だけ。会長は、下の説明を読まなくて大丈夫です。" /> : null}
              </div>}
          {tpl === 'ok' ? <Caution lead={SHEET_WINDOW} /> : null}
          {tpl === 'ok' ? <div><p className="tos-danger">✕ シークレットウィンドウでは作業しない</p><p>ふつうのウィンドウで開きます。</p></div> : null}
          <ol className="list-decimal space-y-1 pl-6">
            <li>開いたら「コピーを作成」を押します。名前は、そのままで大丈夫です。</li>
            <li className="font-bold">シートが開いて、一番上に「…のコピー」と出たら、ここは終わりです。</li>
          </ol>
          <Box tone="info">
            <p className="font-bold">開かないときは、これを見ます</p>
            <ol className="list-decimal space-y-1 pl-6">
              <li>Googleにログインします。ジムで使っているGoogleのアカウントで大丈夫です。右上の丸いアイコンに自分の名前の文字が出ていれば、ログインできています。</li>
            </ol>
          </Box>
        </StepCard>

        <StepCard n={2} title="「設定」タブを書く" done={ticks[1]} doneAt={tickAt[1]} here={here('card1')} current={cardNow === 1} label="作業2が終わったら「できた ✓」を押す" locked={cardNow >= 0 && cardNow < 1} lockReason="作業1が終わってから押せます" warn={warnLine('card1')} onDone={() => toggleTick(1)} onUndo={() => toggleTick(1)} onBlocked={() => setWarn({ key: 'card1', text: 'まだ押せません：作業1が先です' })}>
          <p className="tos-danger">✕ 「…のコピー」と出ていない画面では作業しない</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li className="font-bold">シートの下に「設定」タブができるまで、10秒待ちます。</li>
            <li>コピーしたシートの左下にある <b>「設定」</b> という文字を押します。表が出ます。</li>
            <li>下の絵と同じ行の、右の列（B列）に書きます。</li>
          </ol>
          <p className="font-bold">この絵は見本です。Googleのシートの、黄色いセルに書きます。</p>
          <div role="img" aria-label="「設定」タブの絵。11行あります。書くのは、右の列（B列）の黄色いセルの7つだけです。左の列には書きません。" className="tos-pic overflow-hidden text-[17px]">
            <p aria-hidden="true" className="tos-pic-tag bg-slate-100 px-3 py-1">📷 Googleのシートの絵（ここには書けません）</p>
            <div aria-hidden="true" className="grid grid-cols-[7.5rem_minmax(0,1fr)] border-t-2 border-slate-400 bg-slate-100 font-bold"><div className="px-3 py-1">項目（A列）</div><div className="border-l-2 border-slate-400 px-3 py-1">値（B列）</div></div>
            {sheetRows.map(([k, cell, kind, v]) => <div aria-hidden="true" key={k} className="grid grid-cols-[7.5rem_minmax(0,1fr)] border-t-2 border-slate-300">
              <div className="bg-slate-100 px-3 py-2 font-bold">{k}</div>
              <div className={'border-l-2 border-slate-400 px-3 py-2 ' + (kind === 'write' ? 'tos-pic-yellow' : 'tos-pic-grey')}>{kind === 'write' ? <><span className="font-bold">✎ 書く（{cell}）</span><br />例）{v}</> : v}</div>
            </div>)}
          </div>
          <p className="tos-danger">✕ 左の列（A列）には書かない。黄色いセルだけに書く</p>
          <p>全部で7つです。日にちは「2027年10月3日」のように書きます（年は見本です。本当の日にちを書きます）。</p>
          <p className="text-[17px] text-slate-700">（2027-10-03 でも 2027/10/3 でも大丈夫です。数字は全角でもOKです）</p>
          <p>まちがえたり、書き忘れたりしても大丈夫です。次の画面で「ここを直してください」と教えます。</p>
        </StepCard>

        <StepCard n={3} title="メニューを押す" done={ticks[2]} doneAt={tickAt[2]} here={here('card2')} current={cardNow === 2} label="作業3が終わったら「できた ✓」を押す" locked={cardNow >= 0 && cardNow < 2} lockReason={'作業' + (cardNow + 1) + 'が終わってから押せます'} warn={warnLine('card2')} onDone={() => toggleTick(2)} onUndo={() => toggleTick(2)} onBlocked={() => setWarn({ key: 'card2', text: 'まだ押せません：作業' + (cardNow + 1) + 'が先です' })}>
          <p>Googleのシートの上のメニューを、この順に押します。</p>
          <MenuPic menu="「① 最初の設定」" />
          <p className="text-[17px]">（「Tournament OS」は、Googleの画面のメニューにそう書いてあります。英語のまま押します。）</p>
          <p className="text-[17px]">メニューが出ないときは、Chrome・Safariなどの丸い矢印（再読み込み）を押して、10秒待ちます。</p>
          <Caution lead="Googleの画面が何回か出ます。壊れていません。途中で閉じません。自分で作ったシートなので、大丈夫です。">
            <ol className="list-decimal space-y-1 pl-6">
              <li>「承認が必要です」→「権限を確認」を押す</li>
              <li>Googleアカウントを選ぶ</li>
              <li>「このアプリは確認されていません」→「詳細」を押す</li>
              <li>「（安全ではないページ）に移動」を押す</li>
              <li>「許可」を押す</li>
            </ol>
          </Caution>
          <p className="tos-danger">✕ 途中で閉じない。「許可」まで押す</p>
          <p className="font-bold">許可が終わったら、もう一度「① 最初の設定」を押します。</p>
          <div><p className="tos-danger">✕ ちがうGoogleアカウントで開かない</p><p>コピーを作ったときと同じアカウントで開きます（右上の丸いアイコンで切りかえ）。</p></div>
          <Fold title="Googleの許可画面で、もっと詳しく"><p>自分のアカウントを選びます。「詳細」の文字が小さくて見えないときは、画面の下のほうを探して押します。そのあと、上の1〜5の順に押して「許可」まで進みます。</p></Fold>
        </StepCard>

        <StepCard n={4} title="「準備できました」の確認" done={ticks[3]} doneAt={tickAt[3]} here={here('card3')} current={cardNow === 3} label="作業4が終わったら「できた ✓」を押す" locked={cardNow >= 0 && cardNow < 3} lockReason={'作業' + (cardNow + 1) + 'が終わってから押せます'} warn={warnLine('card3')} onDone={() => toggleTick(3)} onUndo={() => toggleTick(3)} onBlocked={() => setWarn({ key: 'card3', text: 'まだ押せません：作業' + (cardNow + 1) + 'が先です' })}>
          <p className="font-bold">Googleの画面に「準備できました」と出たら、ここは終わりです。</p>
          <p>ためしの申し込みが1件、自動で送られます。本物の名簿には入りません。</p>
          <Fold title="うまくいかないとき" defaultOpen>
            <ul className="space-y-3">
              <li>メニュー「Tournament OS」が見えない → Chrome・Safariなどの丸い矢印（再読み込み）を押して、10秒待ちます。</li>
              <li>Googleの画面に、エラーの文字（四角の中）が出た → その画面を写真にとって、ジムの担当者に送ります。</li>
              <li>「準備できました」を見逃した → 大丈夫です。次の画面で自動で確かめます。</li>
            </ul>
          </Fold>
          <Caution title="もしエラーが出たら">
            <ol className="mt-1 list-decimal space-y-1 pl-6"><li>そのまま閉じない</li><li>画面を写真にとる</li><li>ジムの担当者に送る</li></ol>
            <div className="grid gap-2 font-medium text-slate-950 sm:grid-cols-2">
              <p className="rounded-lg bg-white px-2 text-[17px] font-bold sm:col-span-2">よくある3つ（左がGoogleの言葉、右が直し方）</p>
              {([
                ['「設定」タブの、次の欄を入れてください：…', '「設定」タブの黄色いセルに書いて、もう一度「① 最初の設定」を押す'],
                ['このシートを作った本人のGoogleで開き直してください。', 'コピーを作ったときと同じGoogleアカウントに切りかえて、もう一度押す'],
                ['申込表と写真フォルダの共有を「制限付き・主催者本人だけ」にしてください。', 'シート右上の「共有」→「一般的なアクセス」を「制限付き」にする。わからなければ、ジムの担当者に連絡'],
              ] as const).map(([g, f]) => <div key={g} className="contents">
                <p className="rounded-lg border-2 border-slate-400 bg-white p-2 text-[17px] text-slate-900"><span className="block text-slate-700">Googleの言葉</span>{g}</p>
                <p className="rounded-lg border-2 border-slate-400 bg-white p-2 text-[17px] text-slate-900"><span className="block text-slate-700">直し方</span>{f}</p>
              </div>)}
            </div>
          </Caution>
        </StepCard>

        <div>
          {warnLine('go2')}
          {mark('go2', cardNow < 0
            ? <button type="button" onClick={() => goStep(2)} className={btnPrimary}>「準備できました」と出た → 次へ（次の画面で自動で確かめます）</button>
            : <button type="button" aria-disabled="true" aria-describedby="go2-why" onClick={() => setWarn({ key: 'go2', text: 'まだ押せません：作業' + (cardNow + 1) + 'が終わっていません' })} className={btnOff}>「準備できました」と出た → 次へ（次の画面で自動で確かめます）</button>)}
          {cardNow < 0
            ? <p id="go2-why" className="mt-2 text-center text-[17px]">わからなくても大丈夫です。次の画面で確かめます。</p>
            : <div className="mt-2 text-center"><Why id="go2-why">{tpl === 'none' ? 'ひな形のリンクができるまで押せません' : '作業' + (cardNow + 1) + 'が終わっていません'}</Why></div>}
          {cardNow >= 0 ? <button type="button" onClick={() => goStep(2)} className={btnQuiet + ' mt-1'}>✓がなくても進む（次の画面で確かめます）</button> : null}
        </div>
      </section> : null}

      {step === 2 ? <section aria-labelledby="s2-title" className="space-y-4 rounded-3xl border-2 border-indigo-700 bg-white p-3 sm:p-6">
        <h2 id="s2-title" tabIndex={-1} className="text-balance text-2xl font-bold">URLをはって、つなぐ</h2>
        {urlOk ? null : <p>2つのことをします。① Googleの「操作1・2・3」で、URLをコピーする。② そのURLを、下の四角に貼る。</p>}
        {!urlOk ? opsFold : null}
        {mark('paste', urlBox)}

        {diagnosis ? connectionBox(diagnosis) : null}
        <div>
          {warnLine('recheck')}
          {mark('recheck', mark('recheck-fix', recheckBtn(!urlOk ? btnSecondaryOff : recheckPrimary ? btnPrimary : btnSecondary)))}
          <p className="mt-2 text-[17px]">{!urlOk ? (endpoint.trim() && urlWrong ? '🔒 まだ押せません：上の「✕」の文のとおりに、URLを直してください。' : '🔒 まだ押せません：先に、上の欄にURLを貼ってください。') : checking ? '⏳ 確かめています…（そのままお待ちください）' : pingError === 'net' || pingError === 'access' ? '次は、この「もう一度確かめる」を押します。' : 'シートを直したあとや、表示が変わらないときに押します。'}</p>
        </div>
        {ping ? <section aria-labelledby="readback" className="rounded-2xl border-2 border-slate-300 bg-white p-4">
          <h3 id="readback" className="text-balance text-xl font-bold">シートから読み取れた内容（まちがいがないか見てください）</h3>
          <dl className="mt-3 grid gap-2">
            {readRows.map(([k, v]) => {
              const past = !!v && ((k === '開催日' && datePast) || (k === '申込締切' && deadlinePast));
              return <div key={k} className={'rounded-xl bg-white px-3 py-2 ' + (v && !past ? 'border-2 border-slate-300' : 'tos-input-error')}>
              <dt className="text-[17px] text-slate-700">{k}</dt>
              {past ? <dd className="break-words text-lg font-bold"><span>{v}</span><span className="tos-danger mt-1 block"><span aria-hidden="true">✕ </span>この日にちは過ぎています。年（2027など）はまちがっていませんか？ シートの「設定」タブの {CELL[k]} を直して、「もう一度確かめる」を押します。</span></dd> : v ? <dd className="break-words text-lg font-bold">{v}</dd> : <dd className="break-words text-lg font-bold text-red-700"><span aria-hidden="true">✕ </span>未入力：{k}（シートの「設定」タブの {CELL[k]} に書いてください）</dd>}
            </div>;})}
            <div className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2"><dt className="text-[17px] text-slate-700">入場曲</dt><dd className="break-words text-lg font-bold">{musicText}</dd></div>
            <div className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2"><dt className="text-[17px] text-slate-700">学年</dt><dd className="break-words text-lg font-bold">{modeText(ping.grade)}</dd></div>
            <div className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2"><dt className="text-[17px] text-slate-700">年齢</dt><dd className="break-words text-lg font-bold">{modeText(ping.age)}</dd></div>
            <div className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2"><dt className="text-[17px] text-slate-700">意気込み</dt><dd className="break-words text-lg font-bold">{modeText(ping.comment)}</dd></div>
          </dl>
          <p className="mt-3">違っていたら、シートの「設定」タブを直して、「もう一度確かめる」を押します。</p>
        </section> : null}

        {urlOk ? opsFold : null}

        {pasteFold}

        <div>
          {warnLine('next')}
          {mark('next', blocked
            ? <button type="button" aria-disabled="true" aria-describedby="next-reason" onClick={() => { setWarn({ key: 'next', text: 'まだ進めません：' + nextReason }); if (!urlOk) { setUrlTarget(true); jumpToUrl(); } }} className={btnOff}>次へ進む</button>
            : <button type="button" aria-describedby="next-reason" onClick={() => goStep(3)} className={here('next') ? btnPrimary : btnSecondary}>次へ進む</button>)}
          <div id="next-reason" className="mt-2 text-center">{blocked ? <Why>{nextReason}</Why> : <p className="text-[17px]">✓ 進めます。つぎは手順3で、シートの「② 受付を開始」を押して、選手に渡すURLを作ります。</p>}</div>
        </div>
        <button type="button" onClick={() => goStep(1)} className={btnText}>← 前へ戻る</button>
        {backIgnored ? <p role="status" className="text-center text-[17px]">いま進んだところです。もう一度押すと戻れます。</p> : null}
        {savedAt && !storageFailed ? <p className="text-center text-[17px] leading-normal text-emerald-900">✓ 進みぐあいを覚えました {savedAt}</p> : null}
      </section> : null}

      {step === 3 ? <section aria-labelledby="s3-title" className="space-y-4 rounded-3xl border-2 border-indigo-700 bg-white p-4 sm:p-6">
        <h2 id="s3-title" tabIndex={-1} className="text-balance text-2xl font-bold">選手に渡すURLを作る</h2>
        <section className="space-y-2 rounded-2xl border-2 border-slate-300 bg-white p-4">
          {stage === 'need-open' && wasReady ? <ErrorLine>受付が止まっています。選手は申し込めません。</ErrorLine> : null}
          {stage === 'need-open'
            ? mark('open', <>
              <p className="font-bold">Googleのシートでこの2つを押します。</p>
              <div className="mt-2"><MenuPic menu="「② 受付を開始」" /></div>
              <p className="mt-2 font-bold">{backHere}</p>
              <p className="mt-2 text-[17px]">もどると、自動で確かめます（5秒ごと）。</p>
            </>)
            : stage === 'not-setup' || stage === 'need-selftest'
              ? mark('rerun1', <>
                <p className="font-bold">Googleのシートでこの2つを押します。</p>
                <div className="mt-2"><MenuPic menu="「① 最初の設定」" /></div>
                <p className="mt-2 font-bold">{backHere}</p>
              </>)
              : stage === 'ready'
                ? <p className="text-slate-700">受付は、もう始まっています。選手に渡すURLを、下でコピーします。（30秒ごとに、受付が続いているか確かめます）</p>
                : <p className="text-slate-700">{diagnosis ? '先に、上の「✕」の文のとおりに直します。' : '⏳ いま確かめています…'}</p>}
          <p className="tos-danger">✕ 「③ 受付を停止」を押すと、選手は申し込めなくなります。申し込みをしめきるときだけ押します。</p>
          <p className="text-[17px] text-slate-700">また受け付けるときは、シートで「Tournament OS」→「② 受付を開始」を押します。</p>
        </section>
        <Caution lead="URLを送ったあとで、シートの「設定」タブを直したとき：">
          <ol className="mt-1 list-decimal space-y-1 pl-6">
            <li>上の「もう一度確かめる」を押す。</li>
            <li>「完成：選手へ渡すURLをコピー」を、もう一度押す。</li>
            <li>新しいURLを、もう一度 選手に送る。（前に送ったURLは、古い内容のままです）</li>
          </ol>
        </Caution>

        {errorBox(pingError === 'paste-unreadable' || pingError === 'paste-wrong' ? null : pingError)}
        {pollFailed && diagnosis ? <Caution lead="いまは確認できません（URLはそのままです）。" /> : null}
        {diagnosis ? connectionBox(diagnosis) : !pingError ? <Box tone="info"><p>{urlOk ? '⏳ 確かめています…' : '受付のURLがありません。前の画面でURLを貼ってください。'}</p></Box> : null}
        <div>
          {warnLine('recheck')}
          {mark('recheck', mark('recheck-fix', recheckBtn(!urlOk ? btnSecondaryOff : recheckPrimary ? btnPrimary : btnSecondary)))}
          {!urlOk ? <p className="mt-2 text-[17px]">🔒 まだ押せません：前の画面でURLを貼ってください。</p> : checking ? <p className="mt-2 text-[17px]">⏳ 確かめています…（そのままお待ちください）</p> : null}
        </div>
        {pasteFold}

        <section aria-labelledby="made-url" className="space-y-3 rounded-2xl border-2 border-slate-300 bg-white p-4">
          <h3 id="made-url" className="text-xl font-bold">選手に渡すURL</h3>
          {urlReady ? <>
            {staleCopy ? <ErrorLine>先に送ったURLは古い内容です。新しいURLを送り直します。</ErrorLine> : null}
            {copyFailed === 'live' ? <ErrorLine>コピーできていません。</ErrorLine> : null}
            {mark('copy-manual', <input ref={liveBoxRef} readOnly aria-label="選手に渡すURL" value={liveUrl} onFocus={(e) => e.currentTarget.select()} className={field + ' break-all'} />)}
          </> : <p>まだありません。受付が始まると、ここに出ます。</p>}
          {warnLine('copy')}
          {mark('copy', urlReady
            ? <button type="button" aria-describedby="live-reason" onClick={() => void copy('live', liveUrl)} className={here('copy') || here('copy-new') ? btnPrimary : copiedFresh ? btnDone : btnSecondary}>{copied === 'live' ? '✓ コピーしました（もう一度押せます）' : '完成：選手へ渡すURLをコピー'}</button>
            : <button type="button" aria-disabled="true" aria-describedby="live-reason" onClick={() => setWarn({ key: 'copy', text: 'まだ押せません：シートで「② 受付を開始」を押す' })} className={btnOff}>完成：選手へ渡すURLをコピー</button>)}
          <div id="live-reason" className="space-y-1">
            {!urlReady ? <Why>まだ押せません：シートで「② 受付を開始」を押す</Why>
              : copyFailed === 'live' ? <p className="text-[17px]">{COPY_STEPS}</p>
              : copiedFresh ? <OkLine>コピー済み {copiedAt}</OkLine>
              : <p className="text-[17px]">このURLを、選手にLINEなどで送ります。</p>}
            {urlReady && copiedFresh ? <p className="text-[17px]">LINEの文字を入れる場所で、右クリック→「貼り付け」を押します（キーボードなら Ctrl を押しながら V。Macは ⌘ を押しながら V）。</p> : null}
          </div>
          {urlReady ? <>
            <button type="button" onClick={() => void copy('line', lineText)} className={btnSecondary}>{copied === 'line' ? '✓ コピーしました' : 'LINEで送る文章をコピー'}</button>
            {copyFailed === 'line' ? <ErrorLine>コピーできていません。</ErrorLine> : null}
            {mark('copy-manual', <textarea ref={lineBoxRef} readOnly aria-label="LINEで送る文章" value={lineText} rows={3} onFocus={(e) => e.currentTarget.select()} className={field + ' break-all'} />)}
            {copyFailed === 'line' ? <p className="text-[17px]">{COPY_STEPS}</p> : null}
          </> : null}
        </section>

        {urlReady ? <section className="space-y-3 rounded-2xl border-2 border-emerald-700 bg-emerald-50 p-4 text-emerald-950">
          <h3 className="text-balance text-2xl font-bold">できあがり</h3>
          <p className="text-xl font-bold">✓ 受付のじゅんびができました</p>
          <p className="font-bold">これから、やることは2つです。</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>上の「完成：選手へ渡すURLをコピー」を押して、LINEに貼って、選手に送ります。</li>
            <li>申し込みが集まるまで待ちます（数日かかります）。集まったら、このページをもう一度開いて、「申し込みが集まったら：試合の準備の画面へ」を押します。</li>
          </ol>
          <p className="text-[17px]">このページは、Chrome・Safariなどの「お気に入り」（ブックマーク）に入れておくと、あとで開きやすいです。</p>
          {zipSteps}
          <a href={toRoster} aria-describedby="roster-why" className={btnSecondary}>申し込みが集まったら：試合の準備の画面へ</a>
          <p id="roster-why" className="text-[17px]">別の画面（試合の準備）に移ります。「戻る」で、ここに戻れます。申し込みが集まるまでは、押さなくて大丈夫です。</p>
        </section> : null}

        <Fold caution title="任意：本物の申込画面でも、テストしてみる（⚠ これは練習用。選手には送らない）">
          <p>自動テストは済んでいます。選手が見る画面を自分の目で確かめたいときだけ、使ってください。架空の選手を1件送ります（本物の連絡先は使いません）。</p>
          <a aria-disabled={!link('test')} href={link('test') || undefined} target="_blank" rel="noreferrer" className={link('test') ? btnSecondary : btnSecondaryOff + ' pointer-events-none'}>テスト申込を開く（新しいタブ）</a>
          <p className="text-[17px]">{VIEW_WINDOW}</p>
        </Fold>
        <div>
          {mark('back2', <button type="button" onClick={() => goStep(2)} className={btnText}>← 前へ戻る</button>)}
          {backIgnored ? <p role="status" className="text-center text-[17px]">いま進んだところです。もう一度押すと戻れます。</p> : null}
        </div>
      </section> : null}

      <Fold title="別のパソコンで続ける" sub="この画面で入れたURLを、ファイルにして持ち運べます">
        <p>この画面が覚えている受付URLだけを書き出します。大会の中身はGoogleのシートにあります。<b>個人情報と鍵は入りません。</b></p>
        {showTopExport ? <p className="text-[17px]">「設定を書き出す」のボタンは、上の「👉 次はここ」の箱にあります。</p> : <button type="button" onClick={download} className={btnSecondary}>設定を書き出す</button>}
        <label className={btnSecondary + ' cursor-pointer focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-700'}>ファイルをえらぶ
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { const input = e.currentTarget; void upload(input).finally(() => { input.value = ''; }); }} />
        </label>
        <Example className="mt-0">選ぶファイルの名前：<code>tournament-os-setup-{eventId}.json</code></Example>
        <p className="text-[17px]">書き出したファイルを、別のパソコンのこの画面で選ぶと、続きから始められます。</p>
        {pendingImport !== null ? <div id="import-confirm" role="alertdialog" aria-labelledby="import-title" className="tos-confirm space-y-3 font-medium">
          <p id="import-title" className="tos-danger">✕ 取り消せない：いまのURLが消えて、ファイルのURLに変わります</p>
          <p className="break-all text-[17px]"><span className="tos-danger">消えるURL（いま）：</span>{shortUrl(endpoint)}</p>
          <p className="break-all text-[17px]"><span className="font-bold">新しいURL（ファイル）：</span>{shortUrl(pendingImport)}</p>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <button ref={safeRef} type="button" onClick={() => { setPendingImport(null); setFileNote({ kind: 'info', text: 'やめました。何も変えていません。' }); }} className={btnBase + ' tos-safe-btn text-xl'}>やめる（何も変えない）</button>
            <button type="button" onClick={() => applyImport(pendingImport)} className={btnBase + ' tos-danger-btn text-lg'}>今のURLを消して、ファイルのURLにする</button>
          </div>
        </div> : null}
        {fileNote ? (fileNote.kind === 'bad'
          ? <div className="space-y-2"><ErrorLine>{fileNote.text}</ErrorLine>{fileNote.hint ? <Example className="mt-0">{fileNote.hint.replace(/^選ぶファイル：/, '選ぶファイル：')}</Example> : null}
            {otherEvent ? <a href={'/private/setup/?event=' + encodeURIComponent(otherEvent)} className={btnSecondary}>その大会の画面を開く（{otherEvent}）</a> : null}</div>
          : fileNote.kind === 'ok'
            ? <div className="space-y-1"><OkLine>{fileNote.text}</OkLine>{fileNote.hint ? <p className="text-[17px] text-slate-700">{fileNote.hint}</p> : null}</div>
            : <Box tone="info" role="status"><p>{fileNote.text}</p></Box>) : null}
      </Fold>

      <details id="staff-only" open={staffOpen} onToggle={(e) => setStaffOpen(e.currentTarget.open)} className="group rounded-2xl border-2 border-slate-300 bg-slate-100">
        <summary className={'flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 text-[17px] font-bold text-slate-800 [&::-webkit-details-marker]:hidden ' + FOCUS}><span className="min-w-0 flex-1 text-balance">ジムの担当者だけ（会長は開かなくて大丈夫です）</span><span aria-hidden="true" className="shrink-0 rounded-lg border-2 border-slate-300 bg-white px-3 py-1">{staffOpen ? '▼ とじる' : '▶ ひらく'}</span></summary>
        <div className="space-y-3 border-t-2 border-slate-300 p-4 text-[17px] leading-relaxed">
          <Caution lead="ジムの担当者だけ。会長は、ここを押さなくて大丈夫です。" />
          <p className="font-bold">ひな形を用意する（最初の1回だけ）</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>Googleスプレッドシートを新しく作ります。</li>
            <li>「拡張機能」→「Apps Script」を開き、下の「ひな形のプログラムをコピー」でコピーしたものを、全部消して貼り、保存します。</li>
            <li>Apps Scriptの左の歯車「プロジェクトの設定」で「appsscript.json マニフェスト ファイルをエディタで表示する」にチェックを入れ、下の「マニフェスト（appsscript.json）をコピー」でコピーしたものに入れ替えて、保存します（デプロイの「自分／全員」が最初から選ばれます）。</li>
            <li>スプレッドシートの「共有」を、「リンクを知っている全員が閲覧できる」にします（<b>個人情報は入れません</b>。入っているのはプログラムだけです）。</li>
            <li>スプレッドシートのURLを下に貼ると、「コピーを作る」リンクができます。</li>
          </ol>
          <p className="tos-danger">✕ このシートでは「① 最初の設定」を押さない（ひな形シートで①を押すと、コピーした全員の設定が壊れます）</p>
          <button type="button" onClick={() => void fetchTemplate('own-gs', '/templates/Tournament_OS_Google受付_v3.gs')} className={btnSecondary}>{copied === 'own-gs' ? '✓ コピーしました' : 'ひな形のプログラムをコピー'}</button>
          {copyFailed === 'own-gs' ? <ErrorLine>コピーできていません。画面を読み込み直して、もう一度押してください。</ErrorLine> : null}
          <button type="button" onClick={() => void fetchTemplate('own-json', '/templates/appsscript.json')} className={btnSecondary}>{copied === 'own-json' ? '✓ コピーしました' : 'マニフェスト（appsscript.json）をコピー'}</button>
          {copyFailed === 'own-json' ? <ErrorLine>コピーできていません。画面を読み込み直して、もう一度押してください。</ErrorLine> : null}
          <label className="block font-bold">スプレッドシートのURL <Tag>ジムの担当者だけ</Tag><input className={field + (ownerCopy === 'ERR' ? ' tos-input-error' : '')} value={ownerSheet} onChange={(e) => setOwnerSheet(e.target.value)} aria-invalid={ownerCopy === 'ERR' || undefined} placeholder="https://docs.google.com/spreadsheets/d/…" autoComplete="off" /></label>
          {ownerCopy && ownerCopy !== 'ERR' ? <>
            <p className="break-all rounded-lg border-2 border-slate-300 bg-white p-2">{ownerCopy}</p>
            <button type="button" onClick={() => void copy('own-link', ownerCopy)} className={btnSecondary}>{copied === 'own-link' ? '✓ コピーしました' : 'このリンクをコピー'}</button>
            {copyFailed === 'own-link' ? <ErrorLine>コピーできていません。上の四角を選んで、Ctrl を押しながら C（Macは ⌘ を押しながら C）。</ErrorLine> : null}
            <p>コピーしたら、public/template-link.json の copyUrl に入れます。</p>
          </> : null}
          {ownerCopy === 'ERR' ? <ErrorLine>スプレッドシートのURL（docs.google.com/spreadsheets/d/…）を貼ってください。</ErrorLine> : null}
        </div>
      </details>
      </div>
    </div>
  </main>;
}
