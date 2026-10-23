'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { boutWarnings, emptyTournament, gymKey, HARD_TEXT_LIMIT, importFighters, validateTournament, type LocalBout, type LocalFighter, type LocalTournament } from '../../core/privateTournament.ts';
import { suggestBouts } from '../../core/boutSuggest.ts';
import { boutClassWarning, classLegend, DEFAULT_CLASS_SETTINGS } from '../../core/classRules.ts';
import { weightTag } from '../../core/weightClass.ts';
import { formatDateInput, isCompleteDate } from '../../core/dateInput.ts';
import { DEFAULT_ENTRY_CONFIG, entryConfigSearch, type EntryFieldMode, type EntryFormConfig } from '../../core/entryPackage.ts';
import { bytesToArrayBuffer, decryptBackup, deletePrivateEvent, encryptBackup, listPrivateEvents, photoToDataUrl, PrivateSaveConflict, readPrivateEvent, watchPrivateEvent, writePrivateEvent, type PrivateEventSummary } from '../lib/privateStore.ts';
import { newEventId, normalizeEventId } from './eventId.ts';
import {
  backupFileName, backupIsFresh, boutProblems, classTrouble, openLockReason, classChanged, classChoices, classifyRestoreError, classifySaveError, clockText, contractKg, decodeCsvBytes, decryptWithRetry, dropBlankBouts, entryConfigFromHash, eventListName, FALLBACK_ERROR,
  describeClassChange, describeWeightChange, effectiveClassSettings, fromEventIdFromHash, gapLevel, heightWeightSwapped, importErrorParts, ImportProblem, importProblemKind, importKind, isBlankBout, isHalfBout, isPastDate, isTitleReal, looksLikeBackup, mergeKeepExisting, nextAction, normalizeImported, oldCopyText, overwriteBoxText,
  photoErrorText, pickMarker, restoreBoxText, restoreLastRemoved, RESTORE_TEXT, sameEntryConfig, sameExceptProgress, sameFighterExists, sameKey, saveErrorText, saveLine, saveReasonShort, saveReasonText, shortProblem, tidyClass, tidyWeight, tooLong, useOtherBoxText, weightChanged, weightChoiceTrouble, weightColumnNote, weightGap, weightMissing, weightMixAt, weightMixText, weightUnreadable,
  classNamesOf, excelCellText, isPhotoName, isRosterCsvName, isZipJunk, pickZipRoster, TEXT_LIMITS, zipEntryName,
  type FighterDiff, type Follow, type ImportFileKind, type NextKey, type RemovedBout, type SaveErrorKind, type SaveState,
} from './logic.ts';
import { checkFighter, checkNumber, describeChange, FIELD_LABEL, foldKana, normalizePassword, readDate, shorten, type FieldKey, type FieldProblem } from './normalize.ts';
import { Badge, btn, Chip, cls, Fold, inputClass, Notice, Section, type NoticeExtra } from './parts.tsx';
import { Caution, DangerConfirm, ErrorLine, Example, LockReason, NextSlot, OkLine, Soft, StepNo } from './marks.tsx';
import { BoutCard, FighterFields, kgText, type FieldFixes, type FieldProblems } from './cards.tsx';

const blankFighter = (): LocalFighter => ({ id: crypto.randomUUID(), gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '', photoDataUrl: '' });
/** 消した試合を戻すボタンの名前。知らせ（トースト）の文と、ずっと残るボタンで、同じ言葉を使う */
const UNDO_REMOVE = '消した試合を元にもどす';
const VIEW_WINDOW_NOTE ='新しい画面（ブラウザでは「タブ」と言います）が開きます。いまの画面は、閉じなくて大丈夫です。もどるときは、ブラウザの一番上に並んだ名前の中から「試合の準備」を押します。';
const FILE_ACCEPT = '.zip,.xlsx,.csv,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
const SETUP_KEY = 'tournament-setup-v3:';
const BACKUP_AT_KEY = 'tournament-backup-at:';
/** コピーを作ったときの「保存の時刻」。ページを開き直しても、コピーが古いかを見分けるため */
const BACKUP_FOR_KEY = 'tournament-backup-for:';

type Msg = { kind: 'ok' | 'error' | 'info' | 'warn'; text: string; area: string; action?: { label: string; onClick: () => void }; sticky?: boolean; tag?: 'undo-restore' | 'backup-made'; extra?: NoticeExtra[] };
type ImportNote = {
  kind: 'ok' | 'error'; file: string; text: string; head?: string; hint?: string; noPhoto?: number; staleWarn?: boolean; addedIds?: string[];
  /** 自動で直した欄（人数・欄数・例）と、直せなかった欄、長すぎて切った欄の数 */
  fixed?: { fields: number; people: number; examples: string[] }; unreadable?: Array<{ id: string; name: string; field: FieldKey; from: string }>; cut?: number;
  /** 読めなかった列の見出し・名前が空で入れなかった行の番号・大きすぎて入れなかった写真・Excelが日づけに変えていたセルの数。黙って捨てずに知らせる */
  unreadHeaders?: string[]; skippedLines?: number[]; bigPhotos?: string[]; dateCells?: number;
  /** 画面が古い（読み込み部品が開けない）。ファイルのせいではない。「ページを開き直す」を出す */
  stale?: boolean;
};
type TopNote = { id: string; kind: 'info' | 'warn' | 'ok'; text: string };
type PendingOverwrite = { base: LocalFighter[]; overwritten: LocalFighter[]; differs: FighterDiff[] };
type PendingLookalike = { base: LocalFighter[]; extra: LocalFighter[] };
/** 画面の中の確認の箱（いちどに1つだけ）。nonce は「もう一度押した」ときに箱を作り直して、フォーカスを戻すため */
type Ask =
  | { kind: 'restore'; restored: LocalTournament; nonce: number }
  /** 空の新しい画面（別のパソコンに移ったとき）に、コピーの大会をそのまま入れる。なくなるものは無い */
  | { kind: 'restore-new'; restored: LocalTournament; nonce: number }
  | { kind: 'overwrite'; nonce: number }
  | { kind: 'other'; latest: LocalTournament; nonce: number }
  | { kind: 'remove'; id: string; nonce: number }
  | { kind: 'discard-edit'; nonce: number }
  | { kind: 'new-event'; nonce: number }
  | { kind: 'delete-event'; nonce: number }
  | { kind: 'move'; index: number; dir: -1 | 1; nonce: number }
  | { kind: 'rewind'; nonce: number };
/** yes = つながりの確認ずみ（「選手の受付をつくる」の画面で確かめた）/ blocked = Googleは答えたが、受付はまだ使えない / entered = URLを入れただけ / no = まだ / unknown = 読めない */
type SetupState = 'yes' | 'entered' | 'blocked' | 'no' | 'unknown';

const EDIT_KEYS: FieldKey[] = ['name', 'gym', 'grade', 'age', 'height', 'weight', 'record', 'comment', 'musicUrl'];
const toMap = (list: FieldProblem[]): FieldProblems => { const map: FieldProblems = {}; for (const item of list) if (!map[item.key]) map[item.key] = item.text; return map; };
const BIG = { fontSize: '1.0625rem' } as const;
/** じゅんびの4つ（1 大会の情報・2 選手を入れる・3 対戦カードを作る・4 保存して開く）が全部できたときの一文。デスクトップの箱とスマホの帯で、同じ言葉を使う（「終わりました」は、大会が終わったように読める。「4つ」と言うのは、コピーのファイル・USB・紙の一覧など、ほかの用意は別だから） */
const ALL_READY = (opened: boolean): string => opened ? 'じゅんびの4つは、ぜんぶできました。試合当日の画面は、開いてあります。' : 'じゅんびの4つは、ぜんぶできました。あとは「試合当日の画面を開く」を押します。';

/* ───────── 古いSafari（15.4より前）: 画面を作る前に、赤い箱で知らせる ───────── */
function OldBrowser() {
  return <main className="tos-read min-h-screen bg-slate-50 p-4 text-slate-950 [color-scheme:light] sm:p-8"><div className="mx-auto max-w-2xl space-y-3">
    <h1 className="text-2xl font-bold">試合の準備</h1>
    <ErrorLine>このブラウザは古いです。ブラウザか、パソコン・iPhone・iPadのOSを新しくするか、新しいChromeで開いてください。</ErrorLine>
    <Soft>この画面は、新しいSafari（15.4以上）か、Chromeで動きます。</Soft>
  </div></main>;
}

/* ───────── 保存データが読めないとき ───────── */
function LoadErrorScreen({ message, eventId }: { message: string; eventId: string }) {
  const [password, setPassword] = useState('');
  const [note, setNote] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const lenOk = normalizePassword(password).length >= 10;
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0]; e.currentTarget.value = '';
    if (!file || busy) return;
    if (!lenOk) { setNote({ kind: 'error', text: '先に、パスワードを入れてください（10文字以上）。' }); document.getElementById('load-password')?.focus(); return; }
    setBusy(true); setNote(null);
    try {
      let text = '';
      try { text = await file.text(); } catch { setNote({ kind: 'error', text: RESTORE_TEXT.format }); return; }
      if (!looksLikeBackup(text)) { setNote({ kind: 'error', text: RESTORE_TEXT.format }); return; }
      let restored: LocalTournament;
      try { restored = await decryptWithRetry((pw) => decryptBackup(text, pw), password); }
      catch (error) { setNote({ kind: 'error', text: RESTORE_TEXT[classifyRestoreError(error)] }); return; }
      let target = restored.eventId;
      try { await writePrivateEvent(restored); }
      catch {
        // 壊れた記録の上には書かない。新しい大会番号で入れる
        target = newEventId(Date.now());
        try { await writePrivateEvent({ ...restored, eventId: target }); }
        catch { setNote({ kind: 'error', text: '失敗：このパソコンでは保存できませんでした。「プライベートウィンドウ」ではないか確かめて、ふつうのウィンドウで開きます。' }); return; }
      }
      setNote({ kind: 'ok', text: '戻しました。開いています…' });
      location.href = '/private/?event=' + encodeURIComponent(target);
    } finally { setBusy(false); }
  };
  return <main className="tos-read min-h-screen bg-slate-50 p-4 text-slate-950 [color-scheme:light] sm:p-8"><div className="mx-auto max-w-2xl space-y-4 rounded-2xl border-2 border-slate-300 bg-white p-5">
    <h1 className="text-2xl font-bold">保存してあるデータを、読めませんでした</h1>
    <ErrorLine>保存データが読めません。{message}</ErrorLine>
    <ol className="list-decimal space-y-1 pl-6 font-medium"><li>「プライベートウィンドウ」ではないか確認します。</li><li>パソコンの空き容量を確認します。</li><li>それでもだめなら、この大会の作り方を知っている人に聞きます。</li></ol>
    {/* 黄色は1つだけ。まず「もう一度読み込む」（読めないのは、一時的なことが多い）。コピーのファイルから戻すのは、それでもだめなとき */}
    <NextSlot active label="もう一度読み込む">
      <button type="button" className={cls(btn.base, btn.primary, 'w-full sm:w-auto')} onClick={() => location.reload()}>もう一度読み込む</button>
    </NextSlot>
    <div className="space-y-3 rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
      <p className="text-lg font-bold">それでもだめなら：コピーのファイルから戻す</p>
      <div>
        <label htmlFor="load-password" className="text-lg font-bold">パスワード（コピーを作ったときのもの）</label>
        <input id="load-password" type={showPw ? 'text' : 'password'} className={inputClass} value={password} autoComplete="off" onChange={(e) => setPassword(e.target.value)} />
        <Example className="mt-1"><code>hanabi2027x</code>（コピーを作ったときに決めた、自分のパスワード）</Example>
        <p className={cls('mt-1 text-[17px] font-bold', normalizePassword(password).length >= 10 ? 'text-[#166534]' : 'text-slate-800')}>{normalizePassword(password).length}/10文字{lenOk ? ' ✓' : ''}</p>
        <div className="mt-2"><button type="button" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw} className={cls(btn.base, btn.outline)}>{showPw ? '文字をかくす' : '文字を見る'}</button></div>
      </div>
      <label aria-disabled={!lenOk || undefined} onClick={(e) => { if (!lenOk) { e.preventDefault(); setNote({ kind: 'error', text: '先に、パスワードを入れてください（10文字以上）。' }); } }} className={cls(btn.base, btn.outlineBig, 'w-full cursor-pointer focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-700 sm:w-auto', !lenOk && 'tos-locked')}>
        <span>コピーのファイルから戻す</span>
        <input type="file" accept=".enc" className="sr-only" onChange={(e) => void pick(e)} />
      </label>
      {!lenOk ? <LockReason>先に、上のパスワードを入れてから押します</LockReason> : null}
      {note ? (note.kind === 'error' ? <ErrorLine role="status">{note.text}</ErrorLine> : <OkLine>{note.text}</OkLine>) : null}
    </div>
    <div className="flex flex-col gap-3 sm:flex-row">
      <button type="button" className={cls(btn.base, btn.outlineBig, 'w-full sm:w-auto')} onClick={() => { location.href = '/private/?event=' + newEventId(Date.now()); }}>別の大会として はじめる</button>
    </div>
    <Soft>この大会の番号：{eventId}</Soft>
  </div></main>;
}

export default function PrivateAdminPage() {
  // 古いブラウザかどうかは、画面が出来てから（useEffect）調べる。書き出したHTMLと同じ最初の画面を出すので、Safari 15 で「ハイドレーションのエラー」が出ない
  const [support, setSupport] = useState<'wait' | 'yes' | 'no'>('wait');
  useEffect(() => { setSupport(typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? 'yes' : 'no'); }, []);
  if (support === 'wait') return <main data-tos-loading="1" className="tos-read min-h-screen bg-slate-50 p-6 text-slate-950 [color-scheme:light]"><p className="text-xl font-bold">じゅんびしています…</p></main>;
  return support === 'yes' ? <PrivateAdmin /> : <OldBrowser />;
}

/* ───────── 画面本体 ───────── */
function PrivateAdmin() {
  const [data, setData] = useState<LocalTournament>(() => emptyTournament(normalizeEventId('')));
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  /** アドレスの ?event= から読んだ大会番号。保存データが読めないときに、その番号を言うため（data は、読めないときは空の初期値のまま） */
  const [loadId, setLoadId] = useState(() => normalizeEventId(''));
  const [everSaved, setEverSaved] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [failStreak, setFailStreak] = useState(0);
  const [failKind, setFailKind] = useState<SaveErrorKind>('other');
  const [opened, setOpened] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [topNotes, setTopNotes] = useState<TopNote[]>([]);
  const [importNote, setImportNote] = useState<ImportNote | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null);
  const [pendingLookalike, setPendingLookalike] = useState<PendingLookalike | null>(null);
  const [manual, setManual] = useState<LocalFighter>(blankFighter);
  const [manualProblems, setManualProblems] = useState<FieldProblems>({});
  const [manualFixes, setManualFixes] = useState<FieldFixes>({});
  const [manualNote, setManualNote] = useState('');
  const [manualDup, setManualDup] = useState<LocalFighter | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LocalFighter>(blankFighter);
  /** 名簿にクラスが無い大会で、「クラスも入れる」を押したか（押すと、クラスの欄が出る） */
  const [classOptIn, setClassOptIn] = useState(false);
  const [editFixes, setEditFixes] = useState<FieldFixes>({});
  const [editNote, setEditNote] = useState<{ id: string; text: string } | null>(null);
  const [otherEditErr, setOtherEditErr] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<{ id: string; text: string } | null>(null);
  const [photoOk, setPhotoOk] = useState<{ id: string; name: string } | null>(null);
  const [fighterNote, setFighterNote] = useState('');
  const [listPref, setListPref] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [paperDone, setPaperDone] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [justMade, setJustMade] = useState(false);
  const [backupAt, setBackupAt] = useState(0);
  const [copyState, setCopyState] = useState<'ok' | 'fail' | null>(null);
  const [conflict, setConflict] = useState(false);
  const [suggested, setSuggested] = useState<Set<string>>(() => new Set());
  const [suggestNote, setSuggestNote] = useState<{ kind: 'warn' | 'ok'; text: string; ids: string[]; wide: number[]; noPartner: string; classMix?: number[]; weightMix?: number[] } | null>(null);
  const [ruleCopiedId, setRuleCopiedId] = useState('');
  const [fieldFocused, setFieldFocused] = useState(false);
  const [viewportShrunk, setViewportShrunk] = useState(false);
  const [setupState, setSetupState] = useState<SetupState>('unknown');
  /** 保存ずみの大会に、シートで決めた設定（書いてもらうこと・クラス）が まだ入っていないとき、その設定。入れる前に、本人に聞く */
  const [sheetCfg, setSheetCfg] = useState<EntryFormConfig | null>(null);
  /** 申し込みページ（Google）に最後につながった時刻（時:分）。画面が覚えているものを読むだけ */
  const [setupAt, setSetupAt] = useState('');
  const [events, setEvents] = useState<PrivateEventSummary[] | null>(null);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [noEventParam, setNoEventParam] = useState(false);
  const [chooseDismissed, setChooseDismissed] = useState(false);
  const [, setJumpTick] = useState(0);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [announce, setAnnounce] = useState('');
  const [follow, setFollow] = useState<Follow | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [dateFix, setDateFix] = useState('');
  /** 大会名の欄にカーソルがあるか。1文字だけ打った間は、まだ「できた」にしない（黄色が欄から離れて、打っている途中で画面が動くのを防ぐ） */
  const [titleFocused, setTitleFocused] = useState(false);
  /**
   * この画面を「空の新しい大会」として開いたか（開いた時に決めて、画面を開き直すまで変えない）。
   * 大会名を1文字打っただけで、「コピーのファイル」「申し込みページ」の箱が欄の上に出て、欄が下に動いてしまうのを防ぐ（Safariは、画面の動きを自動で直さない）。
   */
  const [emptyLayout, setEmptyLayout] = useState(false);
  /** 確認の箱に答えた直後の0.7秒、画面全体の『押す』を受けつけない（ダブルクリックの2回目が、動いたあとの別のボタンを押さないように） */
  const [shield, setShield] = useState(false);
  const [venueAsk, setVenueAsk] = useState(false);
  const [cfgTouched, setCfgTouched] = useState(false);
  const [acks, setAcks] = useState<Set<string>>(() => new Set());
  const [removedN, setRemovedN] = useState(0);
  const [placeNote, setPlaceNote] = useState<{ index: number; side: 'red' | 'blue' } | null>(null);
  const [openError, setOpenError] = useState('');
  const [openedNote, setOpenedNote] = useState(false);
  const sheetOpeningRef = useRef(false);
  /** 大会名を、一度でも『出ないまま』にしたか（欄から出た・保存や開くを押した）。そのあとから、赤い『まだです』を出す */
  const [titleTried, setTitleTried] = useState(false);
  const [rewound, setRewound] = useState(false);
  /** 「＋ 試合を追加」を、空の試合があるときに押したか（押したら、その試合の番号を知らせる） */
  const [blankAsk, setBlankAsk] = useState<number | null>(null);
  /** 保存した直後に「試合当日の画面を開く」を押した（二度押しよけで、開かなかった）ときの知らせ */
  const [justSavedNote, setJustSavedNote] = useState(false);
  /** このページを開いてから作った、コピーの中身（古くなったかを見分ける） */
  const [backupSnap, setBackupSnap] = useState<LocalTournament | null>(null);
  const [backupFor, setBackupFor] = useState(0);

  const savedRef = useRef<LocalTournament | null>(null);
  /** 「保存ずみ」とみなす画面の中身。空の試合カードを画面に残したまま保存できるように、保存した中身とは分けて持つ */
  const cleanRef = useRef<LocalTournament | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const askSeq = useRef(0);
  const announceTimer = useRef<number | undefined>(undefined);
  const announceAtRef = useRef(0);
  const backupSnapRef = useRef<LocalTournament | null>(null);
  const prevLineRef = useRef('');
  const failRef = useRef(0);
  const savedAtRef = useRef(0);
  const openingRef = useRef(false);
  const importBusyRef = useRef(false);
  const newEventRef = useRef(false);
  const lastRemoveAt = useRef(0);
  const removedRef = useRef<RemovedBout[]>([]);
  const undoRemoveRef = useRef<() => void>(() => undefined);
  const downloadDoneAt = useRef(0);
  const restoreBusyRef = useRef(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const pendingJump = useRef<{ id: string; box?: string; instant?: boolean } | null>(null);
  const lastTouched = useRef(-1);
  const backupAutoOpened = useRef(false);
  const navRef = useRef<HTMLElement | null>(null);
  // 上の手順ナビ＋下の帯が、画面の半分より大きいとき（小さい画面・大きい文字・拡大）は、手順ナビだけ、くっつけない（本文が見えなくなるため）。
  // 下の帯は、いつも画面の下にくっつける（黄色の「次はここ」と保存のボタンの置き場。流すと、画面の外に出てしまう）
  const [chromeFlow, setChromeFlow] = useState(false);
  /** 下の帯だけで画面の4割をこえるとき：帯の中の、くりかえしの説明を しまう（黄色の札・1つのボタン・知らせの1文だけにする） */
  const [barTight, setBarTight] = useState(false);
  const barTightRef = useRef(false);
  const blurTimer = useRef<number | undefined>(undefined);
  const madeTimer = useRef<number | undefined>(undefined);
  const shieldTimer = useRef<number | undefined>(undefined);
  const placeTimer = useRef<number | undefined>(undefined);
  const pendingInputRef = useRef(false);
  const dupCache = useRef<{ key: string; set: Set<string> }>({ key: '', set: new Set() });
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const editingRef = useRef(editingId);
  editingRef.current = editingId;
  const entryConfig: EntryFormConfig = data.entryConfig ?? DEFAULT_ENTRY_CONFIG;
  const dirty = ready && !loadError && data !== cleanRef.current;
  const keyboardUp = fieldFocused && viewportShrunk;
  // 「この選手を追加」を押す前の入力と、直している途中の入力。保存の対象には、まだ入っていない
  const manualDirty = !isBlankFighterFormLocal(manual);
  const editDirty = editingId !== null && (() => { const original = data.fighters.find((fighter) => fighter.id === editingId); return !!original && (EDIT_KEYS.some((k) => original[k] !== draft[k]) || classChanged(original, draft) || weightChanged(original, draft)); })();
  const pendingInput = ready && !loadError && (manualDirty || editDirty);
  pendingInputRef.current = pendingInput;
  const line = saveLine({ conflict, saveState, dirty, everSaved, savedClock: clockText(data.updatedAt), pending: pendingInput });
  // 「コピー作成ずみ」が、いまの内容と同じか（ちがうなら「前のコピーのあとで変更あり」）
  const backupStale = useMemo(() => backupAt > 0 && !backupIsFresh({ current: data, snapshot: backupSnap, dirty, savedFor: backupFor }), [backupAt, data, backupSnap, dirty, backupFor]);

  const notify = useCallback((kind: Msg['kind'], text: string, area = 'toast', action?: Msg['action'], sticky = false, tag?: Msg['tag'], extra?: NoticeExtra[]) => { setMsg({ kind, text, area, action, sticky, tag, extra }); if (area === 'backup') setBackupOpen(true); }, []);
  /** 読み上げ専用の欄に、ひとことだけ入れる（同じ文でも、もう一度読まれるよう、いちど空にする） */
  const say = useCallback((text: string) => {
    announceAtRef.current = Date.now();
    window.clearTimeout(announceTimer.current);
    setAnnounce('');
    announceTimer.current = window.setTimeout(() => setAnnounce(text), 60);
  }, []);
  /** 保存の結果。見える知らせと、読み上げ（1回だけ）を一緒に出す */
  const notifySave = useCallback((kind: Msg['kind'], text: string, action?: Msg['action'], extra?: NoticeExtra[]) => { notify(kind, text, 'save', action, kind === 'ok', undefined, extra); say(text); }, [notify, say]);
  const addTopNote = useCallback((note: TopNote) => setTopNotes((old) => [...old.filter((item) => item.id !== note.id), note]), []);
  void addTopNote;

  // 状態ラインの読み上げ: 保存の結果（保存済み・保存失敗・保存中）は「保存の知らせ」が1回だけ読む。
  // ここでは、保存の結果ではない変化（入力して未保存になった・別の画面で内容が変わった）だけを読む
  useEffect(() => {
    const prev = prevLineRef.current;
    prevLineRef.current = line.text;
    if (!ready || loadError || !prev || prev === line.text) return;
    if (!/^(● 未保存|✕ 保存できません)/.test(line.text)) return;
    if (Date.now() - announceAtRef.current < 1500) return;
    say(line.text);
  }, [line.text, ready, loadError, say]);

  // 確認の箱は、その相手（別の画面との食いちがい・書きかえ待ち・消す相手）がなくなったら、しまう
  useEffect(() => {
    setAsk((current) => !current ? current
      : current.kind === 'other' && !conflict ? null
      : current.kind === 'overwrite' && !(pendingOverwrite && pendingOverwrite.base === data.fighters) ? null
      : current.kind === 'remove' && !data.fighters.some((fighter) => fighter.id === current.id) ? null
      : current.kind === 'discard-edit' && editingId === null ? null
      : current);
  }, [conflict, pendingOverwrite, data.fighters, editingId]);

  // 明るい配色（/apply と同じ決まり）。画面を離れたら元に戻る
  useEffect(() => { const before = document.title; return () => { document.title = before; }; }, []);
  useEffect(() => {
    const root = document.documentElement;
    // 読み込みの前に layout の小さな補助が data-theme を付けていたら、元は「なし」だったことにする
    const booted = root.hasAttribute('data-theme-boot');
    const before = booted ? null : root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => { root.removeAttribute('data-theme-boot'); if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); };
  }, []);

  /** このパソコンに保存してある大会の一覧を読む（開いたときだけ。書き込みはしない） */
  const loadEvents = useCallback(async (): Promise<PrivateEventSummary[]> => {
    try { const list = await listPrivateEvents(); setEvents(list); setEventsFailed(false); return list; }
    catch { setEvents([]); setEventsFailed(true); return []; }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(location.search);
    const rawParam = (params.get('event') ?? '').trim();
    const hasParam = rawParam !== '';
    const id = normalizeEventId(rawParam);
    const hash = location.hash;
    setLoadId(id);
    readPrivateEvent(id).then(async (saved) => {
      const value = saved ?? emptyTournament(id);
      // 前の大会から引き継ぐ（「新しい大会をつくる」から来たときだけ。保存がまだ無い大会にだけ）
      const fromId = fromEventIdFromHash(hash);
      let fromEvent: LocalTournament | null = null;
      if (!saved && fromId && fromId !== id) { try { fromEvent = await readPrivateEvent(fromId); } catch { fromEvent = null; } }
      if (cancelled) return;
      savedRef.current = value; cleanRef.current = value; setEverSaved(!!saved);
      // 「受付をつくる」画面から来たときは、そこで読み取った大会の名前・日にち・会場・書いてもらうことを、空の欄にだけ入れる
      let shown = value;
      const notes: TopNote[] = [];
      let againRestore = false;
      let sheetNew: EntryFormConfig | null = null;
      if (hasParam && id !== rawParam) {
        try { params.set('event', id); history.replaceState(null, '', location.pathname + '?' + params.toString() + location.hash); } catch { /* 直せなくても進められる */ }
        notes.push({ id: 'fixed-id', kind: 'info', text: 'アドレスの大会番号を、使える形に直しました。' });
      }
      try {
        const given = new URLSearchParams(hash.replace(/^#/, ''));
        // 別のパソコンで作ったコピーのファイルを戻した直後（このページを開く前に、戻してある）
        if (given.get('restored') === '1' && saved) notes.push({ id: 'restored', kind: 'ok', text: '戻しました：『' + (isTitleReal(saved.title) ? saved.title : '名前なし') + '』・選手' + saved.fighters.length + '人・試合' + saved.bouts.length + 'つ。このパソコンに保存ずみです。' });
        // 「大会を開く（そのあと、もう一度ファイルを選ぶ）」から来た：コピーのファイルを選ぶ手順を、黄色の「次はここ」にする
        if (given.get('again') === 'restore') againRestore = true;
        const t = (given.get('t') ?? '').trim().slice(0, 100), d = formatDateInput((given.get('d') ?? '').trim().slice(0, 30)), v = (given.get('v') ?? '').trim().slice(0, 100);
        const patch: Partial<LocalTournament> = {};
        if (t && !isTitleReal(value.title)) patch.title = t;
        if (d && isCompleteDate(d) && !isCompleteDate(value.date)) patch.date = d;
        if (v && !value.venue.trim()) patch.venue = v;
        // 保存ずみの大会：シートの設定が、いま保存してある設定とちがうときは、だまって捨てない。黄色の注意で聞く（r2-126）
        if (saved) {
          const fromSheet = entryConfigFromHash(hash);
          // クラス分け・階級分け・ロゴまで見て、ちがうときだけ聞く（sameEntryConfig）
          if (fromSheet && !sameEntryConfig(fromSheet, value.entryConfig)) sheetNew = fromSheet;
        }
        if (!saved && value.entryConfig === undefined) {
          const google = entryConfigFromHash(hash);
          if (google) { patch.entryConfig = google; notes.push({ id: 'google-config', kind: 'info', text: 'Googleの受付をつくる画面で決めた「選手に書いてもらうこと」を入れました。まだ保存していません。' }); }
          else if (fromEvent?.entryConfig) patch.entryConfig = fromEvent.entryConfig;
        }
        if (!saved && fromEvent && !patch.venue && !value.venue.trim() && fromEvent.venue.trim()) patch.venue = fromEvent.venue;
        if (!saved && fromEvent) {
          const gotConfig = !!patch.entryConfig && patch.entryConfig === fromEvent.entryConfig, gotVenue = !!patch.venue && patch.venue === fromEvent.venue;
          if (gotConfig || gotVenue) {
            const what = gotConfig && gotVenue ? '「選手に書いてもらうこと」と会場を' : gotConfig ? '「選手に書いてもらうこと」を' : '会場を';
            notes.push({ id: 'from-event', kind: 'info', text: '前の大会' + (isTitleReal(fromEvent.title) ? '『' + fromEvent.title + '』' : '') + 'の' + what + '引き継ぎました。名簿と対戦カードは引き継いでいません。まだ保存していません。' });
          }
          if (gotVenue) setVenueAsk(true);
        }
        if (Object.keys(patch).length) shown = { ...value, ...patch };
      } catch { /* 入れなくても進められる */ }
      setTopNotes(notes); setSheetCfg(sheetNew);
      if (againRestore) { setFollow({ kind: 'pw' }); setBackupOpen(true); }
      setEmptyLayout(shown.fighters.length === 0 && shown.bouts.length === 0 && !isTitleReal(shown.title));
      setData(shown); setReady(true);
      // ?event= が無い（どの大会か決まっていない）到着のときは、保存してある大会の一覧を出す
      setNoEventParam(!hasParam);
      if (!hasParam) void loadEvents().then((list) => { if (!cancelled && list.length > 0) setChooserOpen(true); });
    }).catch(() => { if (!cancelled) { setLoadError('このパソコンの保存データを読み取れませんでした。データは消していません。'); setReady(true); } });
    return () => { cancelled = true; };
  }, [loadEvents]);

  // この大会の「申し込みページ」を、このパソコンで作ったかを、読むだけで確かめる（書き込まない）
  useEffect(() => {
    if (!ready || loadError) return;
    try {
      const raw = localStorage.getItem(SETUP_KEY + data.eventId);
      if (raw === null) { setSetupState('no'); return; }
      const saved = JSON.parse(raw) as { endpoint?: unknown; verified?: unknown; connected?: unknown; at?: unknown };
      // 緑の「できています」は、申し込みページの画面が「つながった」と確かめたときだけ。URLを入れただけでは緑にしない
      const entered = typeof saved.endpoint === 'string' && /^https:\/\/script\.google\.com\/\S+/.test(saved.endpoint.trim());
      setSetupState(!entered ? 'no' : saved.verified === true ? 'yes' : saved.connected === true ? 'blocked' : 'entered');
      setSetupAt(typeof saved.at === 'string' && /^\d{2}:\d{2}$/.test(saved.at) ? saved.at : '');
    } catch { setSetupState('unknown'); }
    try { const at = Number(localStorage.getItem(BACKUP_AT_KEY + data.eventId)); setBackupAt(Number.isFinite(at) && at > 0 ? at : 0); } catch { setBackupAt(0); }
    try { const forSaved = Number(localStorage.getItem(BACKUP_FOR_KEY + data.eventId)); setBackupFor(Number.isFinite(forSaved) && forSaved > 0 ? forSaved : 0); } catch { setBackupFor(0); }
  }, [ready, loadError, data.eventId]);

  // タブの名前: 保存していない変更があるとき ● を付ける。保存していない変更・読み込み中は、閉じる前に確認する
  const titleReal = isTitleReal(data.title);
  useEffect(() => {
    document.title = (dirty || pendingInput ? '● ' : '') + '試合の準備' + (titleReal ? '：' + data.title : '');
    if (!dirty && !importBusy && !pendingInput) return;
    // 保存した直後に別の画面へ移るときは、画面の更新を待たず、ref で「いま未保存か」を見る（追加前の入力・直している途中の入力も、未保存として守る）
    const guard = (event: BeforeUnloadEvent) => { if (dataRef.current === cleanRef.current && !importBusyRef.current && !pendingInputRef.current) return; event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, importBusy, pendingInput, titleReal, data.title]);

  // 別の画面（試合当日の画面など）が保存したとき
  useEffect(() => {
    if (!ready || loadError) return;
    const eventId = dataRef.current.eventId;
    return watchPrivateEvent(eventId, () => {
      void readPrivateEvent(eventId).then((latest) => {
        if (!latest) return;
        const base = savedRef.current;
        if (base && latest.updatedAt === base.updatedAt) return; // 自分の保存
        if (dataRef.current === cleanRef.current) {
          savedRef.current = latest; cleanRef.current = latest; setData(latest); setEverSaved(true);
          removedRef.current = []; setRemovedN(0);
          notify('info', 'べつの画面で保存された内容に更新しました ' + clockText(latest.updatedAt));
          return;
        }
        if (base && sameExceptProgress(latest, base)) {
          setData((old) => ({ ...old, updatedAt: latest.updatedAt, currentBout: Math.min(latest.currentBout, Math.max(0, old.bouts.length - 1)) }));
          return;
        }
        setConflict(true);
      }).catch(() => undefined);
    });
  }, [ready, loadError, notify]);

  // 知らせは少したつと消える（エラーと「消えない印」つきは残る。保存の結果は、次の保存か編集まで残る）
  useEffect(() => {
    if (!msg || msg.kind === 'error' || msg.sticky) return;
    const timer = window.setTimeout(() => setMsg((current) => current === msg ? null : current), msg.action ? 12_000 : 10_000);
    return () => window.clearTimeout(timer);
  }, [msg]);

  // 編集して「未保存」になった瞬間に、古い「保存しました」を消す（状態ラインが唯一の正）
  useEffect(() => { if (dirty) setMsg((current) => current && current.kind === 'ok' && current.area === 'save' ? null : current); }, [dirty]);

  // ソフトキーボードが出て、画面の高さが大きく縮んだときだけ、下の帯のボタンをしまう
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => setViewportShrunk(window.innerHeight - vv.height >= 150);
    check();
    vv.addEventListener('resize', check);
    return () => vv.removeEventListener('resize', check);
  }, []);

  // 下の帯の高さと、上の手順ナビの高さを測る。帯は本文の下の余白に、ナビは移動先の上の余白にする（隠れないように）。
  // 2つあわせて画面の4割をこえるとき（幅1024px未満。PCの左のナビは数えない）は、2つとも くっつけない（chromeFlow）。試合当日の画面の下の帯（live/page.tsx の FOOT_FLOW_SHARE）と同じ割合
  const measureChrome = () => {
    const root = document.documentElement, bar = barRef.current, nav = navRef.current;
    const barH = bar ? bar.offsetHeight : 0, navH = nav ? nav.offsetHeight : 0;
    // 手順ナビがくっつくのは、幅1024px未満で、高さ500pxより高いときだけ（globals.css が、低い画面では くっつけない）
    const navCounts = window.innerWidth < 1024 && window.innerHeight > 500;
    const flow = navCounts && barH + navH > window.innerHeight * 0.4;
    setChromeFlow(flow);
    if (!barTightRef.current && barH > window.innerHeight * 0.4) { barTightRef.current = true; setBarTight(true); }
    if (bar) root.style.setProperty('--bar-h', barH + 'px');
    if (nav) root.style.setProperty('--nav-h', (flow ? 0 : navH) + 'px');
  };
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    measureChrome();
    window.addEventListener('resize', measureChrome);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureChrome);
    observer?.observe(el);
    if (navRef.current) observer?.observe(navRef.current);
    return () => { window.removeEventListener('resize', measureChrome); observer?.disconnect(); root.style.removeProperty('--bar-h'); root.style.removeProperty('--nav-h'); };
  }, [ready, loadError]);

  // 帯の中身が変わったら、しまうのをやめて、測り直す（しまったまま測ると、また大きく戻って、行ったり来たりするため）
  useEffect(() => { barTightRef.current = false; setBarTight(false); }, [msg, saveState, ask, conflict, dirty, failStreak, opened]);
  useEffect(() => { const reset = () => { barTightRef.current = false; setBarTight(false); }; window.addEventListener('resize', reset); return () => window.removeEventListener('resize', reset); }, []);

  useEffect(() => () => { window.clearTimeout(blurTimer.current); window.clearTimeout(announceTimer.current); window.clearTimeout(madeTimer.current); window.clearTimeout(placeTimer.current); window.clearTimeout(shieldTimer.current); }, []);

  /** 画面が描き直されたあとで、指定した場所にフォーカスを戻す */
  const focusSoon = useCallback((id: string, fallback?: string) => { window.setTimeout(() => (document.getElementById(id) ?? (fallback ? document.getElementById(fallback) : null))?.focus(), 0); }, []);
  const jump = useCallback((id: string, boxId?: string, instant = false) => {
    const el = document.getElementById(id);
    const wanted = boxId ? document.getElementById(boxId) : null;
    // 黄色の枠が付いていない間は、枠は「箱を持たない」ので、場所として使えない。そのときは、ボタンそのものへ動く
    const box = (wanted && getComputedStyle(wanted).display !== 'contents' ? wanted : null) ?? el;
    if (!box) return;
    // 遠い所（取り込んだあと）へは、ゆっくり動かさない。動いている間に押すと、まだ動いている画面の途中のボタンを押してしまうため
    const calm = instant || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    box.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
    if (el) el.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const pending = pendingJump.current;
    if (!pending) return;
    pendingJump.current = null;
    jump(pending.id, pending.box, pending.instant);
  });
  /** 場所へ飛んで、その欄に太い黄褐色の枠（tos-target）を付ける。入力か選び直しで、枠は消える */
  const goTarget = useCallback((id: string, box?: string) => { setTarget(id); pendingJump.current = { id, box }; setJumpTick((n) => n + 1); }, []);
  useEffect(() => { if (target && !document.getElementById(target)) setTarget(null); }, [target, data]);
  /** コピーのファイルの欄を開いて、パスワードの欄に移る */
  const goBackup = useCallback(() => { setBackupOpen(true); pendingJump.current = { id: 'backup-password', box: 'backup' }; setJumpTick((n) => n + 1); }, []);
  // 別の画面と食いちがったら、黄色の箱まで画面を動かす（入力中の欄からフォーカスは奪わない。読み上げは赤い文が行う）
  useEffect(() => {
    if (!conflict) return;
    const box = document.getElementById('conflict-box');
    try { box?.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch { /* 古いブラウザでは、そのまま */ }
  }, [conflict]);

  const byId = useMemo(() => new Map(data.fighters.map((fighter) => [fighter.id, fighter])), [data.fighters]);
  const groups = useMemo(() => {
    // ジム名は、全角・半角、大文字・小文字、空白のちがいを同じとして、1つのグループにする（見出しは、最初の人の書き方）
    const map = new Map<string, { label: string; list: LocalFighter[] }>();
    for (const fighter of data.fighters) { const key = gymKey(fighter.gym); const group = map.get(key); if (group) group.list.push(fighter); else map.set(key, { label: fighter.gym.trim(), list: [fighter] }); }
    return [...map.values()].map((group): [string, LocalFighter[]] => [group.label, group.list]);
  }, [data.fighters]);
  const placed = useMemo(() => {
    const map = new Map<string, number>();
    for (const bout of data.bouts) new Set([bout.redId, bout.blueId].filter(Boolean)).forEach((id) => map.set(id, (map.get(id) ?? 0) + 1));
    return map;
  }, [data.bouts]);
  const dropped = useMemo(() => dropBlankBouts(data), [data]);
  const coreErrors = useMemo(() => validateTournament(dropped), [dropped]);
  const boutIssues = useMemo(() => data.bouts.flatMap((bout, index) => boutProblems(bout, index, data.fighters).map((problem) => ({ ...problem, index }))), [data.bouts, data.fighters]);

  const edit = <K extends keyof LocalTournament>(key: K, value: LocalTournament[K]) => setData((old) => ({ ...old, [key]: value, currentBout:key==='bouts'?Math.min(old.currentBout,Math.max(0,(value as LocalTournament['bouts']).length-1)):old.currentBout }));

  /* 対戦カードの操作（カードは memo なので、関数は作り直さない） */
  const onPatch = useCallback((index: number, patch: Partial<LocalBout>) => {
    lastTouched.current = index;
    const id = dataRef.current.bouts[index]?.id;
    setData((old) => ({ ...old, bouts: old.bouts.map((bout, i) => i === index ? { ...bout, ...patch } : bout) }));
    setTarget(null); setBlankAsk(null);
    if (id) { setSuggested((old) => { if (!old.has(id)) return old; const next = new Set(old); next.delete(id); return next; }); setRuleCopiedId((old) => old === id && ('className' in patch || 'rule' in patch) ? '' : old); }
  }, []);
  const doMove = useCallback((index: number, direction: -1 | 1) => {
    const current = dataRef.current, target = index + direction;
    if (target < 0 || target >= current.bouts.length) return;
    setData((old) => { const next = [...old.bouts]; [next[index], next[target]] = [next[target], next[index]]; return { ...old, bouts: next }; });
    if (current.currentBout > 0 && (index <= current.currentBout || target <= current.currentBout)) notify('warn', '試合当日の画面の「いまの試合」がずれます。');
  }, [notify]);
  const onMove = useCallback((index: number, direction: -1 | 1) => {
    const current = dataRef.current, target = index + direction;
    if (target < 0 || target >= current.bouts.length) return;
    // いま試合当日の画面に出ている試合（かその手前）を動かすときは、先にたずねる
    if (current.currentBout > 0 && (index <= current.currentBout || target <= current.currentBout)) { setAsk({ kind: 'move', index, dir: direction, nonce: ++askSeq.current }); return; }
    doMove(index, direction);
  }, [doMove]);
  /** 消した試合を、新しいほうから順に戻す */
  const undoRemove = useCallback(() => {
    const result = restoreLastRemoved(dataRef.current.bouts, removedRef.current);
    removedRef.current = result.stack;
    setRemovedN(result.stack.length);
    const restored = result.restored;
    if (!restored) { setMsg(null); return; }
    setData((old) => ({ ...old, bouts: restoreLastRemoved(old.bouts, [restored]).bouts }));
    if (result.stack.length > 0) notify('info', '第' + (restored.index + 1) + '試合を戻しました。ほかにも戻せる試合が' + result.stack.length + 'つあります。', 'toast', { label: UNDO_REMOVE, onClick: () => undoRemoveRef.current() });
    else notify('ok', '第' + (restored.index + 1) + '試合を戻しました。');
  }, [notify]);
  undoRemoveRef.current = undoRemove;
  const onRemove = useCallback((index: number) => {
    // ダブルクリックで、次の試合まで消えてしまうのを防ぐ（0.7秒以内の2回目は何もしない）
    const now = Date.now();
    if (now - lastRemoveAt.current < 700) return;
    lastRemoveAt.current = now;
    const current = dataRef.current, removed = current.bouts[index];
    if (!removed) return;
    setData((old) => ({ ...old, bouts: old.bouts.filter((_, i) => i !== index), currentBout: Math.min(old.currentBout, Math.max(0, old.bouts.length - 2)) }));
    // 押した「消す」ボタンは消えるので、フォーカスを近くの試合（なければ「＋ 試合を追加」）へ移す
    const left = current.bouts.length - 1;
    focusSoon(left <= 0 ? 'add-bout' : 'bout-' + Math.min(index, left - 1) + '-red', 'add-bout');
    if (isBlankBout(removed)) return;
    removedRef.current = [...removedRef.current, { bout: removed, index }];
    setRemovedN(removedRef.current.length);
    const name = (id: string) => current.fighters.find((fighter) => fighter.id === id)?.name ?? '（まだ）';
    const shift = current.currentBout > 0 && index <= current.currentBout ? ' 試合当日の画面の「いまの試合」がずれます。' : '';
    notify('error', '消しました：第' + (index + 1) + '試合（' + name(removed.redId) + ' vs ' + name(removed.blueId) + '）。まちがえたときは「' + UNDO_REMOVE + '」を押します（このページを閉じるまで戻せます）。' + shift, 'toast', { label: UNDO_REMOVE, onClick: () => undoRemoveRef.current() });
  }, [notify, focusSoon]);
  const onAck = useCallback((key: string) => setAcks((old) => new Set([...old, key])), []);
  const onFocusSide = useCallback((index: number, side: 'red' | 'blue') => { setTarget('bout-' + index + '-' + side); pendingJump.current = { id: 'bout-' + index + '-' + side }; setJumpTick((n) => n + 1); }, []);
  /** この人の「直す」欄を開いて、その欄へ移る（直している途中の人がいれば、先にそちらを終えてもらう） */
  const editFighter = useCallback((id: string, key: FieldKey | 'fighterClass' | 'division' = 'weight') => {
    const person = dataRef.current.fighters.find((fighter) => fighter.id === id);
    if (!person) return;
    const open = editingRef.current;
    if (open && open !== id) {
      const original = dataRef.current.fighters.find((fighter) => fighter.id === open);
      if (original && (EDIT_KEYS.some((k) => original[k] !== draftRef.current[k]) || classChanged(original, draftRef.current) || weightChanged(original, draftRef.current))) { setOtherEditErr(id); return; }
    }
    setOtherEditErr(null); setEditNote(null); setEditFixes({});
    setDraft({ ...person }); setEditingId(id); setListPref(true); setQuery('');
    pendingJump.current = { id: 'edit-' + id + '-' + key };
    setJumpTick((n) => n + 1);
  }, []);
  const onEditWeight = useCallback((id: string) => editFighter(id, 'weight'), [editFighter]);
  const onEditClass = useCallback((id: string) => editFighter(id, 'fighterClass'), [editFighter]);

  /* ───── 保存 ───── */
  const writeOnce = async (next: LocalTournament) => {
    try { return await writePrivateEvent(next); }
    catch (error) {
      if (error instanceof PrivateSaveConflict) {
        // 試合当日の画面が「いまの試合」だけ進めたときは、最新の更新時刻で1回だけやり直す
        const latest = await readPrivateEvent(next.eventId);
        const base = savedRef.current;
        if (latest && base && sameExceptProgress(latest, base)) return await writePrivateEvent({ ...next, updatedAt: latest.updatedAt, currentBout: Math.min(latest.currentBout, Math.max(0, next.bouts.length - 1)) });
      }
      throw error;
    }
  };
  const rememberBackupFor = (eventId: string, savedAt: number) => {
    setBackupFor(savedAt);
    try { localStorage.setItem(BACKUP_FOR_KEY + eventId, String(savedAt)); } catch { /* 記録できなくても、保存はできている */ }
  };
  /** 書き込んで、画面の「保存ずみ」の印を付ける。失敗したら投げる（通知は呼んだ側が決める） */
  const commit = async (base: LocalTournament, source?: LocalTournament): Promise<{ saved: LocalTournament; untouched: boolean }> => {
    // 赤も青も空の試合は、保存した中身には入れない（保存は止めない）。作業中の空のカードは、画面にそのまま残す
    const toWrite = dropBlankBouts(base);
    const saved = await writeOnce(toWrite);
    const screen: LocalTournament = toWrite === base ? saved : { ...saved, bouts: base.bouts };
    savedRef.current = saved; cleanRef.current = screen; setEverSaved(true); setConflict(false); setPendingOverwrite(null);
    // 保存前の入力でコピーを作っていて、その中身をそのまま保存したなら、コピーはまだ新しい（開き直しても、そう見える）
    if (backupSnapRef.current && sameExceptProgress(base, backupSnapRef.current)) rememberBackupFor(saved.eventId, saved.updatedAt);
    // 保存している間に、また入力されていないか（されていたら、画面の中身は入力のほうを残す）
    const untouched = !!source || dataRef.current === base;
    if (untouched) dataRef.current = screen; // 画面の更新より先に、「保存ずみ」と言えるように
    setData((old) => source || old === base ? screen : { ...old, updatedAt: saved.updatedAt });
    return { saved, untouched };
  };
  /**
   * 保存。保存している最中にもう一度押されたら、新しく書かず、いまの保存の結果をそのまま返す
   * （2回目が「失敗」と数えられたり、2回書いたりしない）
   */
  const save = (source?: LocalTournament): Promise<boolean> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const run = runSave(source).finally(() => { savePromiseRef.current = null; });
    savePromiseRef.current = run;
    return run;
  };
  const runSave = async (source?: LocalTournament): Promise<boolean> => {
    setTitleTried(true);
    setSaveState('saving');
    // 大会名・会場の前後の空白は、保存のときに自動で取る
    if (!source) {
      const raw = dataRef.current;
      // 長すぎる貼りつけで、保存がぜんぶ失敗しないよう、大会名・会場・日にちは上限で切る
      const cap = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);
      const nextTitle = cap(raw.title.trim() || raw.title, 1000), nextVenue = cap(raw.venue.trim(), 1000), nextDate = cap(raw.date, 100);
      if (raw.title !== nextTitle || raw.venue !== nextVenue || raw.date !== nextDate) {
        const trimmed = { ...raw, title: nextTitle, venue: nextVenue, date: nextDate };
        dataRef.current = trimmed; setData(trimmed);
      }
    }
    const base = source ?? dataRef.current;
    let nextState: SaveState = 'idle';
    try {
      const { saved, untouched } = await commit(base, source);
      failRef.current = 0; setFailStreak(0);
      savedAtRef.current = Date.now();
      if (!backupAutoOpened.current) { backupAutoOpened.current = true; setBackupOpen(true); }
      // 保存の結果は2行: 緑の「保存しました」と、まだ直す所（あれば）を別の黄色の行にする（「保存した＝準備OK」と読まれないため）
      const left: string[] = [];
      if (!isTitleReal(saved.title)) left.push('大会の名前が、まだ入っていません');
      let boutLeft = 0;
      saved.bouts.forEach((bout, index) => boutProblems(bout, index, saved.fighters).slice(0, 1).forEach((problem) => { left.push(shortProblem(problem, index)); boutLeft++; }));
      const dateBad = !!saved.date.trim() && !isCompleteDate(saved.date);
      if (dateBad) left.push('日にちが読めません。空にするか直します');
      // 「まだ：」は付けない（「気をつけて：」のあとに、また「：」が来て読みにくいため）。何を直すかを、そのまま言う
      const extra: NoticeExtra[] = left.length ? [{ kind: 'warn', text: left.slice(0, 2).join('。') + '。' + (left.length > 2 ? 'ほか' + (left.length - 2) + 'つ。' : '') + '試合当日の画面を開く前に、' + (boutLeft === left.length ? '選手を選びます。' : '直します。'), action: dateBad ? { label: '直す', ariaLabel: '日にちを直す', onClick: () => goTarget('field-date') } : undefined }] : [];
      // 保存している間にまた入力したときは、「保存しました」は出さない（状態ラインが「未保存」を示す）
      if (untouched) notifySave('ok', (isTitleReal(saved.title) ? '保存しました ' : '下書きとして保存しました（大会の名前はまだ） ') + clockText(saved.updatedAt) + '（このパソコンの中）', undefined, extra);
      return true;
    } catch (error) {
      if (error instanceof PrivateSaveConflict) {
        setConflict(true);
        notifySave('error', '止まってください：保存しませんでした。別の画面で内容が変わりました。入れた内容は画面に残っています。', { label: '上の「👉 次はここ」の箱を見る', onClick: () => jump('conflict-box') });
      } else {
        nextState = 'failed';
        const kind = classifySaveError(error, base.eventId);
        setFailKind(kind);
        failRef.current += 1; setFailStreak(failRef.current);
        const repeated = failRef.current >= 2;
        // 失敗の知らせは、帯の中に1つだけ。「もう一度」だけの堂々めぐりにしないため、いつも「コピーのファイルを作る」の出口を出す
        // 見出しの「保存失敗」は帯の中の状態ラインが言う（高さをおさえるため、ここでは繰り返さない）。まちがいの文は1回だけ
        notifySave('error', repeated ? 'また失敗しました。コピーのファイルに入れておくと安心。' + (saveReasonShort(kind) ? saveReasonShort(kind) + '。' : '') : '保存できませんでした。' + (kind === 'bad-id' || kind === 'bad-data' ? saveReasonText(kind) : saveReasonShort(kind)) + (kind === 'other' ? '' : '。') + 'このページを閉じると、入れた内容が消えます。', { label: 'コピーのファイルを作る', onClick: goBackup });
      }
      return false;
    } finally { setSaveState(nextState); }
  };

  /** 別の画面で保存された内容を、いまの画面にする */
  const adoptLatest = (latest: LocalTournament) => {
    savedRef.current = latest; cleanRef.current = latest; setData(latest); setConflict(false); setSaveState('idle'); failRef.current = 0; setFailStreak(0);
    setPendingOverwrite(null); setAsk(null); removedRef.current = []; setRemovedN(0); setMsg(null);
  };
  const keepMine = () => {
    setAsk(null);
    void readPrivateEvent(dataRef.current.eventId).then((latest) => { if (latest) { savedRef.current = latest; setData((old) => ({ ...old, updatedAt: latest.updatedAt })); } setConflict(false); setMsg(null); }).catch(() => notify('error', FALLBACK_ERROR));
  };
  /** 「別の画面の内容を使う」を押した: すぐには変えず、確認の箱を出す */
  const useOther = () => {
    void readPrivateEvent(dataRef.current.eventId).then((latest) => {
      if (!latest) { setConflict(false); setMsg(null); return; }
      setAsk({ kind: 'other', latest, nonce: ++askSeq.current });
    }).catch(() => notify('error', FALLBACK_ERROR));
  };
  const adoptOther = (shown: LocalTournament) => {
    void readPrivateEvent(dataRef.current.eventId).then((latest) => {
      if (!latest) { setAsk(null); setConflict(false); setMsg(null); return; }
      // 箱を見ている間に、また別の画面で保存されたら、そのまま使わず、新しい内容でもう一度たずねる
      if (latest.updatedAt !== shown.updatedAt) { setAsk({ kind: 'other', latest, nonce: ++askSeq.current }); notify('warn', 'また別の画面で変わりました。新しい内容を確かめてから、もう一度えらんでください。何も変えていません。'); return; }
      adoptLatest(latest);
      focusSoon('save-state');
    }).catch(() => notify('error', FALLBACK_ERROR));
  };

  /* ───── 選手ファイルを読み込む ───── */
  const readEntryFile = async (file?: File) => {
    if (!file) return;
    importBusyRef.current = true; setImportBusy(true); setImportNote(null); setPendingOverwrite(null); setPendingLookalike(null);
    setFollow((old) => old?.kind === 'refile' ? null : old);
    let blocked: string[] = [];
    let fileKind: ImportFileKind | '' = '';
    const bigPhotos: string[] = [];
    let dateCells = 0;
    try {
      const kind = importKind(file.name);
      if (!kind) throw new ImportProblem('ext');
      fileKind = kind;
      if (file.size > 100 * 1024 * 1024) throw new ImportProblem('too-large');
      let csv = '';
      let photos: Record<string, Uint8Array> = {};
      if (kind === 'zip') {
        const { unzipSync } = await import('fflate');
        let unpackedBytes = 0, fileCount = 0;
        const unpacked = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => {
          const name = zipEntryName(entry.name);
          // Macが入れるごみ（__MACOSX・.DS_Store・._名前）は、数にも大きさにも入れない
          if (isZipJunk(name)) return false;
          fileCount++; unpackedBytes += entry.originalSize;
          if (fileCount > 3001) throw new ImportProblem('too-many-files');
          if (unpackedBytes > 100 * 1024 * 1024) throw new ImportProblem('too-large');
          // 1枚が20MBをこえる写真は、その1枚だけ入れない（名簿とほかの写真は、読む）
          if (entry.originalSize > 20 * 1024 * 1024) { if (isPhotoName(name)) { bigPhotos.push(name.slice(name.lastIndexOf('/') + 1)); return false; } throw new ImportProblem('too-large'); }
          return isRosterCsvName(name) || isPhotoName(name);
        } });
        const found = pickZipRoster(Object.keys(unpacked).map((raw) => [raw, zipEntryName(raw)] as const));
        if (!found) throw new ImportProblem('no-list');
        // 名簿のCSVは、ふつうのCSVと同じ読み方（まずUTF-8、文字化けしたらExcelのCSV＝Shift_JIS）
        csv = decodeCsvBytes(unpacked[found.csv]);
        // 写真は 'photos/<名前>.jpg' の形にそろえる（フォルダごと圧縮された ZIP でも、同じように読む）
        photos = Object.fromEntries(found.photos.map(([raw, name]) => [name, unpacked[raw]] as const));
      } else if (kind === 'xlsx') {
        const { readSheet } = await import('read-excel-file/browser');
        let rows;
        try { rows = await readSheet(file, '選手入力'); } catch { throw new ImportProblem('no-sheet'); }
        // Excelは「3-1」「2-1」を日づけに変えてしまう。日づけで来たセルは「月-日」にもどす（日づけの長い文字を、そのまま名簿に入れない）
        csv = rows.map((row) => row.map((cell) => { const done = excelCellText(cell); if (done.wasDate) dateCells++; return `"${done.text.replaceAll('"', '""')}"`; }).join(',')).join('\n');
      } else {
        // まず UTF-8。文字化けしたときだけ、ExcelのCSV（Shift_JIS）で読み直す
        csv = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
      }
      const result = importFighters(csv);
      if (result.blockedHeaders.length) { blocked = result.blockedHeaders; throw new ImportProblem('blocked'); }
      if(!result.fighters.length)throw new ImportProblem('empty');
      // 手で入れるときと同じ約束で、数字（全角・単位）・入場曲の空白・クラスの書き方を自動で直す。直せないものは、赤で知らせる
      const tidied = normalizeImported(result.fighters, data.entryConfig?.classes, data.entryConfig?.weights);
      const fighters = await Promise.all(tidied.fighters.map(async (fighter) => {
        const photoEntry = Object.entries(photos).find(([name]) => name.replace(/^photos\//, '').replace(/\.[^.]+$/, '') === fighter.id);
        if (!photoEntry) return fighter;
        const extension = photoEntry[0].split('.').pop()?.toLowerCase();
        const type = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
        // 読めない写真が1枚あっても、名簿は読み込む（その選手は「写真がありません」になる）
        try { return { ...fighter, photoDataUrl: await photoToDataUrl(new File([bytesToArrayBuffer(photoEntry[1])], photoEntry[0], { type })) }; } catch { return fighter; }
      }));
      // 前からいる人は黙って変えない。新しい人だけ足す。内容がちがう人は、押したときだけ書きかえる
      const current = dataRef.current.fighters;
      const weightCols = { hasDivisionColumn: result.hasDivisionColumn, hasWeightClassColumn: result.hasWeightClassColumn };
      const merge = mergeKeepExisting(current, fighters, { hasClassColumn: result.hasClassColumn, ...weightCols });
      setData((old) => {
        if (old.fighters === current) return merge.changed ? { ...old, fighters: merge.merged } : old;
        try { return { ...old, fighters: mergeKeepExisting(old.fighters, fighters, weightCols).merged }; } catch { return old; }
      });
      const same = merge.lookalike.length;
      const already = fighters.length - merge.added - same;
      let text = fighters.length + '人分を読み込みました（写真 ' + fighters.filter((fighter) => fighter.photoDataUrl).length + '枚）。';
      if (current.length > 0) {
        text += '新しく入った人は' + merge.added + '人です。';
        if (same > 0) text += '名前とジムが同じ人が' + same + '人いたので、足していません。';
        if (already === 0) { if (same === 0) text += '前からいた人は、そのままです。'; }
        else if (merge.differs.length > 0) text += 'すでにいる' + already + '人は、そのままにしました（内容がちがう人が' + merge.differs.length + '人います）。';
        else text += 'すでにいる人は、全員そのままです。';
        if (merge.photosFilled > 0) text += '写真がなかった' + merge.photosFilled + '人には、写真を足しました。';
        if (merge.classesFilled > 0) text += 'クラスが空だった' + merge.classesFilled + '人に、クラスを足しました。';
        if (!result.hasClassColumn && current.some((fighter) => (fighter.fighterClass ?? '').trim())) text += 'このファイルにはクラスの列が無いので、今のクラスはそのままです。';
        if (merge.weightsFilled > 0) text += '区分・階級が空だった' + merge.weightsFilled + '人に、区分・階級を足しました。';
        text += weightColumnNote(current, result.hasDivisionColumn, result.hasWeightClassColumn);
      }
      // 前の大会の名簿が残っているかもしれないとき: 今の名簿に同じ管理番号の人が1人もいなくて、新しい人が足された
      const stale = current.length > 0 && already === 0 && same === 0 && merge.added > 0;
      setImportNote({
        kind: 'ok', file: file.name, noPhoto: merge.merged.filter((fighter) => !fighter.photoDataUrl).length, staleWarn: stale, addedIds: stale ? merge.merged.slice(current.length).map((fighter) => fighter.id) : undefined, text,
        fixed: tidied.fixed > 0 ? { fields: tidied.fixed, people: tidied.fixedPeople, examples: tidied.examples } : undefined,
        unreadable: tidied.unreadable.length ? tidied.unreadable : undefined, cut: result.cut > 0 ? result.cut : undefined,
        unreadHeaders: result.unreadHeaders.length ? result.unreadHeaders : undefined, skippedLines: result.skippedLines.length ? result.skippedLines : undefined,
        bigPhotos: bigPhotos.length ? bigPhotos : undefined, dateCells: dateCells > 0 ? dateCells : undefined,
      });
      // 取り込んだあと、次の黄色（試合を1つ作る）が画面の外にあるときは、そこまで動かす（「＋ 試合を追加」を押したあとと同じ）
      if (dataRef.current.bouts.length === 0 && isTitleReal(dataRef.current.title) && (merge.changed ? merge.merged : current).length >= 2) { pendingJump.current = { id: 'add-bout', box: 'add-bout-slot', instant: true }; setJumpTick((n) => n + 1); }
      say(fighters.length + '人分を読み込みました。');
      const base = merge.changed ? merge.merged : current;
      if (merge.differs.length > 0) setPendingOverwrite({ base, overwritten: merge.overwritten, differs: merge.differs });
      if (same > 0) setPendingLookalike({ base, extra: merge.lookalike });
      setListPref(true);
    } catch (error) {
      const parts = importErrorParts(error, file.name, blocked);
      const stale = importProblemKind(error) === 'stale';
      setImportNote({ kind: 'error', file: file.name, text: parts.detail, head: parts.head, hint: parts.hint, stale });
      // 画面が古いときは、ファイルのせいではない。ファイルを選び直しても直らないので、黄色は「ページを開き直す」に置く
      setFollow(stale ? { kind: 'reload' } : { kind: 'refile', file: fileKind || undefined });
      pendingJump.current = { id: 'import-error' };
    } finally { importBusyRef.current = false; setImportBusy(false); }
  };
  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void readEntryFile(file); };
  /** 「ファイルの内容で○人を書きかえる」を押した: すぐには変えず、確認の箱を出す */
  const askOverwrite = () => {
    const pending = pendingOverwrite;
    if (!pending) return;
    if (dataRef.current.fighters !== pending.base) { setPendingOverwrite(null); notify('info', '名簿が変わったので、書きかえはやめました。何も変えていません。もう一度ファイルを選んでください。'); return; }
    setAsk({ kind: 'overwrite', nonce: ++askSeq.current });
  };
  /** 内容がちがう人を、ファイルの内容に書きかえる（確認の箱の「書きかえる」を押したときだけ） */
  const applyOverwrite = () => {
    const pending = pendingOverwrite;
    setAsk(null);
    if (!pending) return;
    if (dataRef.current.fighters !== pending.base) { setPendingOverwrite(null); notify('info', '名簿が変わったので、書きかえはやめました。何も変えていません。もう一度ファイルを選んでください。'); return; }
    setData((old) => ({ ...old, fighters: pending.overwritten }));
    setPendingOverwrite(null);
    setImportNote((old) => old ? { ...old, kind: 'ok', staleWarn: false, noPhoto: pending.overwritten.filter((fighter) => !fighter.photoDataUrl).length, text: pending.differs.length + '人を、ファイルの内容に書きかえました。' } : old);
    focusSoon('import-result');
  };

  /** 名前とジムが同じ人を、別の人として足す（押したときだけ） */
  const applyLookalike = () => {
    const pending = pendingLookalike;
    if (!pending) return;
    if (dataRef.current.fighters !== pending.base) { setPendingLookalike(null); notify('info', '名簿が変わったので、足すのはやめました。何も変えていません。もう一度ファイルを選んでください。'); return; }
    setData((old) => ({ ...old, fighters: [...old.fighters, ...pending.extra] }));
    setPendingLookalike(null);
    setImportNote((old) => old ? { ...old, kind: 'ok', staleWarn: false, text: pending.extra.length + '人を、別の人として足しました。' } : old);
  };
  /** 「前の大会の人かもしれません」: 足した人を取り消して、名簿をもとにもどす */
  const undoStaleAdd = () => {
    const ids = new Set(importNote?.addedIds ?? []);
    if (!ids.size) return;
    setData((old) => ({
      ...old,
      fighters: old.fighters.filter((fighter) => !ids.has(fighter.id)),
      bouts: old.bouts.map((bout) => ({ ...bout, redId: ids.has(bout.redId) ? '' : bout.redId, blueId: ids.has(bout.blueId) ? '' : bout.blueId })),
    }));
    setImportNote((old) => old ? { ...old, kind: 'ok', staleWarn: false, addedIds: undefined, text: '足した' + ids.size + '人を取り消して、名簿をもとにもどしました。' } : old);
  };

  /* 選手を1人ずつ入れる / 直す / 消す / 写真 */
  const clearManualKey = (key: FieldKey) => { setManualProblems((old) => { if (!old[key]) return old; const next = { ...old }; delete next[key]; return next; }); setManualFixes((old) => { if (!old[key]) return old; const next = { ...old }; delete next[key]; return next; }); };
  /** 欄から出たとき: 数字・長い空白などを自動で直す。直したら「自動で直しました」を出す。直せないときだけ赤 */
  const fixFieldOf = (value: LocalFighter, key: FieldKey, setValue: (next: LocalFighter) => void, setFixes: (fn: (old: FieldFixes) => FieldFixes) => void, setProblems?: (fn: (old: FieldProblems) => FieldProblems) => void) => {
    const result = checkFighter(value, entryConfig, 'edit');
    const fixed = result.fighter[key];
    if (fixed !== value[key]) setValue({ ...value, [key]: fixed });
    const fix = result.fixes.find((item) => item.key === key);
    setFixes((old) => { const next = { ...old }; if (fix) next[key] = fix.from + ' → ' + fix.to; else delete next[key]; return next; });
    const problem = result.problems.find((item) => item.key === key && (key === 'height' || key === 'weight' || key === 'age' || key === 'musicUrl' || value[key].trim() !== ''));
    if (setProblems) setProblems((old) => { const next = { ...old }; if (problem) next[key] = problem.text; else delete next[key]; return next; });
  };
  const addFighterNow = (cleaned: LocalFighter) => {
    setManualProblems({}); setManualFixes({}); setManualDup(null);
    setData((old) => ({ ...old, fighters: [...old.fighters, cleaned] }));
    setManual(blankFighter()); setListPref(true); setQuery('');
    setManualNote(cleaned.name + 'さんを追加しました（現在' + (dataRef.current.fighters.length + 1) + '人）。次は、下の選手の一覧で写真を選びます。');
    setFollow({ kind: 'photo', id: cleaned.id });
    pendingJump.current = { id: 'fighter-' + cleaned.id };
    setJumpTick((n) => n + 1);
  };
  const addManual = () => {
    // 完全に空のまま、もう一度押したときは何もしない（「追加しました」の案内を消さない）
    if (manualNote && isBlankFighterFormLocal(manual)) return;
    const result = checkFighter(manual, entryConfig, 'add');
    if (result.problems.length) {
      setManualProblems(toMap(result.problems)); setManualNote(''); setManualDup(null);
      setManualFixes(Object.fromEntries(result.fixes.map((fix) => [fix.key, fix.from + ' → ' + fix.to])));
      focusSoon('manual-' + result.problems[0].key);
      return;
    }
    setManualProblems({});
    // クラスは、整えて入れる（空なら項目ごと無い）
    const cleaned = tidyWeight(tidyClass(result.fighter));
    if (sameFighterExists(dataRef.current.fighters, cleaned)) { setManualDup(cleaned); setManualNote(''); return; }
    addFighterNow(cleaned);
  };
  const choosePhoto = async (e: ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.currentTarget.files?.[0]; e.currentTarget.value = '';
    if (!file) return;
    setPhotoBusy(id); setPhotoError(null); setPhotoOk(null);
    try {
      const photoDataUrl = await photoToDataUrl(file);
      setData((old) => ({ ...old, fighters: old.fighters.map((item) => item.id === id ? { ...item, photoDataUrl } : item) }));
      setPhotoOk({ id, name: dataRef.current.fighters.find((item) => item.id === id)?.name ?? '' });
      setFollow((old) => old?.kind === 'photo' && old.id === id ? null : old);
    } catch (error) {
      const text = !file.type.startsWith('image/') ? 'これは写真ではありません（' + shorten(file.name, 30) + '）。写真アプリの写真を選びます' : file.size > 20 * 1024 * 1024 ? '写真が大きすぎます（20MBまで）。別の写真を選びます' : photoErrorText(error);
      setPhotoError({ id, text });
      setFollow({ kind: 'photo', id });
    }
    finally { setPhotoBusy(null); }
  };
  const applyEdit = () => {
    if (!editingId) return;
    const original = dataRef.current.fighters.find((item) => item.id === editingId);
    if (!original) return;
    const result = checkFighter(draft, entryConfig, 'edit');
    if (result.problems.length) { focusSoon('edit-' + editingId + '-' + result.problems[0].key); return; }
    const next: LocalFighter = tidyWeight(tidyClass({ ...result.fighter, id: original.id, photoDataUrl: original.photoDataUrl, ...(original.absent ? { absent: true } : {}) }));
    setData((old) => ({ ...old, fighters: old.fighters.map((item) => item.id === editingId ? next : item) }));
    setEditNote({ id: editingId, text: [describeChange(original, next), describeClassChange(original, next), describeWeightChange(original, next)].filter(Boolean).join('、') });
    setEditingId(null); setEditFixes({}); setOtherEditErr(null);
    focusSoon('edit-note-' + original.id, 'edit-btn-' + original.id);
  };
  /** 欠場にする／やめる。ほかの直しと同じで、「保存する」を押すまで、保存されない。保存すると、対戦一覧表・当日の画面に「欠場」と出る */
  const toggleAbsent = (id: string) => {
    const person = dataRef.current.fighters.find((item) => item.id === id);
    if (!person) return;
    const nowAbsent = person.absent !== true;
    const inBouts = dataRef.current.bouts.map((bout, index) => (bout.redId === id || bout.blueId === id ? index + 1 : 0)).filter(Boolean);
    setData((old) => ({ ...old, fighters: old.fighters.map((item) => { if (item.id !== id) return item; if (nowAbsent) return { ...item, absent: true }; const { absent: _gone, ...rest } = item; return rest; }) }));
    const name = (person.name.trim() || '名前未入力') + 'さん';
    if (!nowAbsent) notify('ok', name + 'を、欠場からもどしました。保存すると、一覧表と当日の画面も、もとにもどります。');
    else if (inBouts.length) notify('warn', name + 'を欠場にしました。第' + inBouts.join('・') + '試合に入っています。相手を決め直すか、その試合を消します。保存すると、一覧表と当日の画面に「欠場」と出ます。');
    else notify('info', name + 'を欠場にしました。保存すると、一覧表と当日の画面に「欠場」と出ます。');
  };
  const removeFighter = (id: string) => {
    const person = byId.get(id);
    const hit = data.bouts.map((bout, index) => ({ bout, index })).filter(({ bout }) => bout.redId === id || bout.blueId === id);
    setData((old) => ({ ...old, fighters: old.fighters.filter((item) => item.id !== id), bouts: old.bouts.map((bout) => ({ ...bout, redId: bout.redId === id ? '' : bout.redId, blueId: bout.blueId === id ? '' : bout.blueId })) }));
    setAsk(null);
    const emptied = hit.map(({ bout, index }) => '第' + (index + 1) + '試合の' + (bout.redId === id ? '赤' : '青') + 'が空です');
    setFighterNote((person?.name ?? '選手') + 'さんを消しました。' + (emptied.length ? '\n' + emptied.join('、') + '。' : ''));
    setFollow((old) => old?.kind === 'photo' && old.id === id ? null : old);
    focusSoon('fighter-note', 'add-bout');
  };

  /* 対戦カードをつくる */
  const newBout = (patch: Partial<LocalBout> = {}): LocalBout => {
    const prev = data.bouts[data.bouts.length - 1];
    // クラスを使う大会は、ルールがクラスごとにちがう。だれが入るかまだわからない新しい試合に、まえの試合のルールを入れない（Bクラスの試合に、Aクラスのルールが出てしまう）
    const copy = !classesOn && !!prev;
    return { id: crypto.randomUUID(), redId: '', blueId: '', className: copy ? prev.className : '', rule: copy ? prev.rule : '', ...patch };
  };
  const addBout = () => {
    if (data.fighters.length < 2) { jump('pick-file', 'pick-file-box'); return; }
    const last = data.bouts[data.bouts.length - 1];
    if (last && isBlankBout(last)) { setBlankAsk(data.bouts.length - 1); jump('bout-' + (data.bouts.length - 1) + '-red'); return; }
    setBlankAsk(null);
    const bout = newBout();
    edit('bouts', [...data.bouts, bout]);
    setSuggestNote(null); setPlaceNote(null);
    if (last && (bout.className || bout.rule)) setRuleCopiedId(bout.id);
    lastTouched.current = data.bouts.length;
    pendingJump.current = { id: 'bout-' + data.bouts.length + '-red' };
  };
  const unplaced = useMemo(() => data.fighters.filter((fighter) => !placed.has(fighter.id) && fighter.absent !== true), [data.fighters, placed]);
  /** 名前の札を押したとき、どこに入るか（押す前に言うため、押したときと同じ決め方を使う） */
  const placeTarget = (): { index: number; side: 'red' | 'blue' } | null => {
    const room = (i: number) => i >= 0 && i < data.bouts.length && (!data.bouts[i].redId || !data.bouts[i].blueId);
    let index = lastTouched.current;
    if (!room(index)) index = data.bouts.findIndex((_, i) => room(i));
    if (index < 0) return null;
    return { index, side: !data.bouts[index].redId ? 'red' : 'blue' };
  };
  const placeFighter = (fighter: LocalFighter) => {
    const spot = placeTarget();
    window.clearTimeout(placeTimer.current);
    if (spot) {
      onPatch(spot.index, spot.side === 'red' ? { redId: fighter.id } : { blueId: fighter.id });
      setPlaceNote(spot);
    } else {
      const bout = newBout({ redId: fighter.id });
      edit('bouts', [...data.bouts, bout]);
      lastTouched.current = data.bouts.length;
      setPlaceNote({ index: data.bouts.length, side: 'red' });
    }
    placeTimer.current = window.setTimeout(() => setPlaceNote(null), 15_000);
  };
  const makeSuggestion = () => {
    // 欠場の選手は、おすすめに入れない
    const made = suggestBouts(data.fighters.filter((fighter) => fighter.absent !== true), data.bouts, () => crypto.randomUUID());
    if (!made.length) { setSuggestNote({ kind: 'warn', ids: [], wide: [], noPartner: '', text: 'おすすめは作れませんでした。体重が入っていない選手がいると、自動では組めません。「＋ 試合を追加」から、自分で選んでください。' }); return; }
    // 体重差が10kg以上の組は、案に入れない（けがの危険）
    const gapOf = (bout: LocalBout) => weightGap(byId.get(bout.redId), byId.get(bout.blueId));
    const keep = made.filter((bout) => { const gap = gapOf(bout); return gap === null || gap < 10; });
    const skipped = made.filter((bout) => !keep.includes(bout));
    const noPartner = skipped.flatMap((bout) => [byId.get(bout.redId)?.name, byId.get(bout.blueId)?.name]).filter(Boolean).join('、');
    if (!keep.length) { setSuggestNote({ kind: 'warn', ids: [], wide: [], noPartner, text: 'おすすめは作れませんでした。体重の差が10kg以上になる組しかありません。「＋ 試合を追加」から、自分で選んでください。' }); return; }
    // 「ルール」と「体重の区分」は、まえの試合から写さない（クラスがちがう組に、ほかのクラスのルールが出てしまう）。空のままにして、1つずつ自分で書く
    const added: LocalBout[] = keep.map((bout: LocalBout) => ({ ...bout, className: '', rule: '' }));
    edit('bouts', [...data.bouts, ...added]);
    setSuggested((old) => new Set([...old, ...added.map((bout: LocalBout) => bout.id)]));
    const left = unplaced.length - added.length * 2;
    const wide = added.map((bout, i) => ({ index: data.bouts.length + i, gap: gapOf(bout) })).filter((item) => (item.gap ?? 0) >= 5).map((item) => item.index);
    // 赤と青のクラスがちがう案（ルールがちがう）。止めないが、知らせる
    const classMix = added.map((bout, i) => (classMixAt(bout) ? data.bouts.length + i : -1)).filter((index) => index >= 0);
    // 赤と青の区分か階級がちがう案も、同じように知らせる
    const weightMix = added.map((bout, i) => (weightMixAt(bout, byId) ? data.bouts.length + i : -1)).filter((index) => index >= 0);
    setSuggestNote({ kind: 'ok', ids: added.map((bout: LocalBout) => bout.id), wide, classMix, weightMix, noPartner, text: 'おすすめの組み合わせを' + added.length + 'つ、いちばん下に足しました。' + (left > 0 ? 'のこり' + left + '人は、組む相手がいなかったので、まだ入っていません。' : '') });
    setFollow({ kind: 'review', n: 0 });
    pendingJump.current = { id: 'bout-' + data.bouts.length };
  };
  /** 案のうち、まだ手を入れていない試合だけを消す。手を入れた試合は残す */
  const undoSuggestion = () => {
    if (!suggestNote) return;
    const untouched = new Set(suggestNote.ids.filter((id) => suggested.has(id)));
    const kept = suggestNote.ids.filter((id) => !untouched.has(id) && data.bouts.some((bout) => bout.id === id)).length;
    if (untouched.size === 0) { setSuggestNote(null); return; }
    edit('bouts', data.bouts.filter((bout) => !untouched.has(bout.id)));
    setSuggested((old) => new Set([...old].filter((id) => !untouched.has(id))));
    setSuggestNote(null); setFollow((old) => old?.kind === 'review' ? null : old);
    notify('ok', '手を入れていない' + untouched.size + 'つを消しました。' + (kept > 0 ? '手を入れた' + kept + 'つは残しました。' : ''));
  };

  /* ───── コピーのファイル（作る / 戻す） ───── */
  // 2つ目の欄は、なくてもOK（空なら確認なし）。入っていて、1つ目とちがうときだけ止める。全角・前後の空白は、半角・空白なしに直して使う
  const pwNorm = normalizePassword(password);
  const pwFixed = password !== '' && pwNorm !== password;
  const passwordProblem = pwNorm.length < 10 ? 'あと' + (10 - pwNorm.length) + '文字 必要です' : password2 && normalizePassword(password2) !== pwNorm ? 'パスワードが同じではありません' : '';
  /** 「この大会のデータを、このパソコンから消す」を押せるか。保存ずみで、そのあとの変更が無く、コピーのファイルを作ってあるとき */
  const deleteReady = everSaved && !dirty && backupAt > 0 && !backupStale;
  const copyLockedWhy = passwordProblem || (!paperDone ? '紙に書いてからチェックします' : '');
  const download = async () => {
    if (passwordProblem) { setBlockedMsg('まだ押せません：' + passwordProblem); document.getElementById(pwNorm.length < 10 ? 'backup-password' : 'backup-password2')?.focus(); return; }
    if (!paperDone) { setBlockedMsg('まだ押せません：先に「紙に書きました」にチェックを入れる'); document.getElementById('paper-done')?.focus(); return; }
    if (backupBusy || Date.now() - downloadDoneAt.current < 3000) return;
    setBlockedMsg('');
    setBackupBusy(true); setMsg((current) => current && current.area === 'backup' ? null : current);
    try {
      const snapshot = dataRef.current;
      const encrypted = await encryptBackup(snapshot, pwNorm);
      const name = backupFileName(snapshot.eventId, snapshot.date);
      const url = URL.createObjectURL(new Blob([encrypted], { type: 'application/octet-stream' }));
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      // Give the browser time to start its download before releasing the file URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      const stamp = Date.now();
      setBackupAt(stamp);
      try { localStorage.setItem(BACKUP_AT_KEY + snapshot.eventId, String(stamp)); } catch { /* 記録できなくても、ファイルはできている */ }
      // このコピーの中身を覚えておく。あとで変えたら「前のコピーのあとで変更あり」と出す（保存前の入力が入っているコピーは、保存の時刻では結べない）
      backupSnapRef.current = snapshot; setBackupSnap(snapshot);
      rememberBackupFor(snapshot.eventId, snapshot === cleanRef.current ? snapshot.updatedAt : 0);
      notify('ok', 'ファイルを保存しました：' + name + '。ダウンロードの中にあります。' + (snapshot !== cleanRef.current ? ' まだ保存していない変更も、このファイルに入っています。' : ''), 'backup', undefined, true, 'backup-made');
    } catch { notify('error', '失敗：コピーのファイルを作れませんでした。もう一度「パスワードをつけて、コピーを保存する」を押してください。', 'backup'); }
    finally {
      downloadDoneAt.current = Date.now(); setBackupBusy(false);
      setJustMade(true); window.clearTimeout(madeTimer.current); madeTimer.current = window.setTimeout(() => setJustMade(false), 3000);
    }
  };
  /** 失敗の文から「今のデータは変えていません」を分ける（赤い文と、緑の「変わっていません」を別の行にするため） */
  const splitKept = (text: string): { main: string; kept: boolean } => { const re = /(今|いま)のデータは変えていません。?/; return { main: text.replace(re, '').trim(), kept: re.test(text) }; };
  const restoreFail = (text: string, kind?: string) => {
    const { main, kept } = splitKept(text);
    const extra: NoticeExtra[] = [];
    if (kept) extra.push({ kind: 'ok', text: '今のデータは変わっていません。' });
    if (kind === 'password') extra.push({ kind: 'info', text: 'ファイルがこわれているときも、同じ表示になります。パスワードが合っているのに戻らないときは、別のコピーを選びます。' });
    notify('error', '失敗：' + main, 'backup', undefined, false, undefined, extra);
    if (kind === 'password') setFollow({ kind: 'pw' });
  };
  const restore = async (file?: File) => {
    if (!file || restoreBusyRef.current) return;
    if (!pwNorm) { notify('error', RESTORE_TEXT.noPassword, 'backup'); document.getElementById('backup-password')?.focus(); return; }
    restoreBusyRef.current = true;
    setMsg((current) => current && current.area === 'backup' ? null : current);
    setAsk((current) => current?.kind === 'restore' || current?.kind === 'restore-new' ? null : current);
    setFollow((old) => old?.kind === 'pw' ? null : old);
    try {
      let text = '';
      try { text = await file.text(); } catch { restoreFail(RESTORE_TEXT.format); return; }
      if (!looksLikeBackup(text)) { restoreFail(RESTORE_TEXT.format); return; }
      let restored: LocalTournament;
      try { restored = await decryptWithRetry((pw) => decryptBackup(text, pw), password); }
      catch (error) { const kind = classifyRestoreError(error); restoreFail(RESTORE_TEXT[kind], kind); return; }
      const mine = dataRef.current;
      if (restored.eventId !== mine.eventId) {
        // 別のパソコンに移ったとき：この画面が空で、一度も保存していないなら、なくなるものが無い。コピーの大会をそのまま入れる
        const untouched = mine.fighters.length === 0 && mine.bouts.length === 0 && !everSaved && mine === cleanRef.current && !pendingInputRef.current;
        if (untouched) { setBackupOpen(true); setAsk({ kind: 'restore-new', restored, nonce: ++askSeq.current }); return; }
        const go = () => { location.href = '/private/?event=' + encodeURIComponent(restored.eventId) + '#again=restore'; };
        notify('warn', 'このコピーは『' + (isTitleReal(restored.title) ? restored.title : restored.eventId) + '』用です。いまの画面は別の大会なので、何も変えていません。' + (mine !== cleanRef.current ? '（開くと、保存していない変更について、ブラウザが確認を出します）' : '') + '「大会を開く」を押したあと、もう一度パスワードを入れて、同じファイルを選びます。', 'backup', { label: '大会を開く（そのあと、もう一度ファイルを選ぶ）', onClick: go });
        return;
      }
      // ここでは、まだ何も変えない。「コピーのファイルから戻す」のすぐ下に確認の箱を出し、「今の内容を消して、コピーに戻す」を押したときだけ戻す
      setBackupOpen(true);
      setAsk({ kind: 'restore', restored, nonce: ++askSeq.current });
    } finally { restoreBusyRef.current = false; }
  };
  /** 確認の箱の「今の内容を消して、コピーに戻す」を押したあと。いまの内容（箱を見ている間に変わっていても、いまの内容）をコピーで置きかえる */
  const finishRestore = async (restored: LocalTournament) => {
    if (restoreBusyRef.current) return;
    restoreBusyRef.current = true;
    try {
      const mine = dataRef.current;
      if (restored.eventId !== mine.eventId) { notify('error', '失敗：いまの画面は別の大会なので、何も変えていません。', 'backup'); return; }
      const before = { saved: savedRef.current, screen: mine, dirty: mine !== cleanRef.current };
      try {
        await commit({ ...restored, updatedAt: savedRef.current?.updatedAt ?? mine.updatedAt }, { ...restored, updatedAt: savedRef.current?.updatedAt ?? mine.updatedAt });
      } catch (error) {
        if (error instanceof PrivateSaveConflict) setConflict(true);
        restoreFail(RESTORE_TEXT.write);
        return;
      }
      setSaveState('idle'); failRef.current = 0; setFailStreak(0); removedRef.current = []; setRemovedN(0); setEditingId(null); setSuggestNote(null);
      const undo = everSaved && before.saved ? { label: '元にもどす（このページを開いている間だけ）', onClick: () => void undoRestore(before) } : undefined;
      notify('ok', '戻しました。' + (isTitleReal(restored.title) ? restored.title : '名前なし') + '・選手' + restored.fighters.length + '人・試合' + restored.bouts.length + 'つ。すでに保存ずみです。', 'backup', undo, true, undo ? 'undo-restore' : undefined);
    } finally { restoreBusyRef.current = false; }
  };
  /** 空の新しい画面に、コピーの大会を、その大会番号のまま入れる（このパソコンに同じ大会番号の保存が無いときだけ）。入れたら、その大会を開く */
  const finishRestoreNew = async (restored: LocalTournament) => {
    if (restoreBusyRef.current) return;
    restoreBusyRef.current = true;
    try {
      const mine = dataRef.current;
      if (mine.fighters.length > 0 || mine.bouts.length > 0 || mine !== cleanRef.current || pendingInputRef.current) { notify('error', '失敗：いまの画面に入力があるので、何も変えていません。', 'backup'); return; }
      let existing: LocalTournament | null = null;
      try { existing = await readPrivateEvent(restored.eventId); } catch { existing = null; }
      if (existing) {
        const go = () => { location.href = '/private/?event=' + encodeURIComponent(restored.eventId) + '#again=restore'; };
        notify('warn', 'このパソコンには、この大会がもう保存されています。上書きはしないで、何も変えていません。', 'backup', { label: '大会を開く（そのあと、もう一度ファイルを選ぶ）', onClick: go });
        return;
      }
      await writePrivateEvent(restored);
      location.href = '/private/?event=' + encodeURIComponent(restored.eventId) + '#restored=1';
    } catch { restoreFail(RESTORE_TEXT.write); }
    finally { restoreBusyRef.current = false; }
  };
  /** コピーから戻す前の、保存ずみの内容に書き戻す（このページを開いている間だけ） */
  const undoRestore = async (before: { saved: LocalTournament | null; screen: LocalTournament; dirty: boolean }) => {
    const stored = savedRef.current;
    if (!before.saved || !stored) return;
    try {
      const written = await writeOnce({ ...before.saved, updatedAt: stored.updatedAt });
      savedRef.current = written; cleanRef.current = written; setConflict(false);
      setData(before.dirty ? { ...before.screen, updatedAt: written.updatedAt } : written);
      notify('ok', '戻す前の内容に、もどしました。', 'backup');
    } catch { notify('error', '失敗：元にもどせませんでした。いまのデータは変えていません。', 'backup'); }
  };
  const onPickBackup = (e: ChangeEvent<HTMLInputElement>) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void restore(file); };

  /* ───── 確認の箱の2つのボタン ───── */
  /** 「やめる（何も変えない）」。Escape も同じ。押したボタンに、フォーカスを戻す */
  const raiseShield = () => { setShield(true); window.clearTimeout(shieldTimer.current); shieldTimer.current = window.setTimeout(() => setShield(false), 700); };
  const answerNo = () => {
    if (!ask) return;
    raiseShield();
    const kind = ask.kind;
    const back = ask.kind === 'remove' ? 'remove-' + ask.id : ask.kind === 'discard-edit' ? 'edit-' + (editingId ?? '') + '-name'
      : kind === 'restore' || kind === 'restore-new' ? 'restore-file' : kind === 'overwrite' ? 'overwrite-trigger' : kind === 'other' ? 'use-other-trigger'
      : kind === 'new-event' ? 'new-event-btn' : kind === 'delete-event' ? 'delete-event-btn' : kind === 'rewind' ? 'rewind-btn' : '';
    setAsk(null);
    notify('info', RESTORE_TEXT.cancel, kind === 'restore' || kind === 'restore-new' ? 'backup' : 'toast');
    if (back) focusSoon(back);
  };
  /** あぶないほうのボタン（「今の内容を消して、コピーに戻す」「書きかえる」「別の画面の内容にする」など）。ここを押したときだけ、変える */
  const answerYes = () => {
    if (!ask) return;
    raiseShield();
    if (ask.kind === 'restore') { const restored = ask.restored; setAsk(null); void finishRestore(restored).then(() => focusSoon('restore-file')); return; }
    if (ask.kind === 'restore-new') { const restored = ask.restored; setAsk(null); void finishRestoreNew(restored); return; }
    if (ask.kind === 'overwrite') { applyOverwrite(); return; }
    if (ask.kind === 'remove') { removeFighter(ask.id); return; }
    if (ask.kind === 'discard-edit') { const who = editingId; setAsk(null); setEditingId(null); setEditFixes({}); setOtherEditErr(null); notify('info', '直した内容を消して、やめました。'); if (who) focusSoon('edit-btn-' + who, 'add-bout'); return; }
    if (ask.kind === 'new-event') { setAsk(null); void startNewEvent(); return; }
    if (ask.kind === 'delete-event') { setAsk(null); void removeThisEvent(); return; }
    if (ask.kind === 'move') { const { index, dir } = ask; setAsk(null); doMove(index, dir); return; }
    if (ask.kind === 'rewind') { setAsk(null); setData((old) => ({ ...old, currentBout: 0 })); setRewound(true); return; }
    const shown = ask.latest;
    setAsk(null);
    adoptOther(shown);
  };

  /* ───── ここから下は、読み込みの状態ごとの表示 ───── */
  if (!ready) return <main data-tos-loading="1" className="tos-read min-h-screen bg-slate-50 p-6 text-slate-950 [color-scheme:light]"><p className="text-xl font-bold">じゅんびしています…</p></main>;
  if (loadError) return <LoadErrorScreen message={loadError} eventId={loadId} />;

  /* ───── 計算 ───── */
  const live = '/private/live/?event=' + encodeURIComponent(data.eventId);
  const sheetLink = '/private/sheet/?event=' + encodeURIComponent(data.eventId);
  // 他のジム用の入力画面にも、クラスの選び方を渡す（クラスを使う大会だけ）
  const linkClasses = entryConfig.classes ?? (data.fighters.some((fighter) => (fighter.fighterClass ?? '').trim() !== '') ? effectiveClassSettings(undefined, data.fighters, false) ?? undefined : undefined);
  const entryLink = '/private/entry/?' + entryConfigSearch(linkClasses ? { ...entryConfig, classes: linkClasses } : entryConfig);
  const setupLink = '/private/setup/?event=' + encodeURIComponent(data.eventId);
  const setEntryMode = (key: 'grade' | 'age' | 'comment', value: EntryFieldMode) => { setCfgTouched(true); edit('entryConfig', { ...entryConfig, [key]: value }); };
  const copyEntryLink = async () => {
    try { await navigator.clipboard.writeText(location.origin + entryLink); setCopyState('ok'); }
    catch { setCopyState('fail'); }
  };

  // クラスの欄は、名簿にクラスがあるときか、「クラスも入れる」を押したときだけ出す
  // 受付（シートの「設定」タブ）で決めたクラスがあれば、その2つの名前を使う。無ければ、名簿に出ている名前
  const classList = classNamesOf(data.entryConfig?.classes) ?? classChoices(data.fighters, classOptIn);
  const rosterHasClass = data.fighters.some((fighter) => (fighter.fighterClass ?? '').trim() !== '');
  // クラスの条件とルールの文（受付の設定。無くて、名簿が初期の名前だけなら初期の設定）
  const classSettings = effectiveClassSettings(data.entryConfig?.classes, data.fighters, classOptIn);
  // クラスを使う大会か：受付でクラスを決めた、または名簿にクラスの人がいる。使うのに、クラスが入っていない人・決めたクラスにない人は、黄色で知らせる
  const classesOn = !!data.entryConfig?.classes?.enabled || rosterHasClass;
  const classIssues = classTrouble(data.fighters, classSettings, classesOn);
  // 階級分け（区分→階級）：受付（シートの「設定」タブ）で決めた表があるときだけ、区分・階級を選ぶ欄と、入れかたの知らせを出す。無い大会は、今までどおり
  const weights = data.entryConfig?.weights;
  const weightIssues = weightChoiceTrouble(data.fighters, weights);
  // シートの設定を入れる前の知らせで言う「クラス分け」「階級分け」「ロゴ」（階級分け・ロゴは、シートにあるときだけ言う）
  const sheetExtra = ['クラス分け', sheetCfg?.weights ? '階級分け' : '', sheetCfg?.logo ? 'ロゴ' : ''].filter(Boolean).join('・');
  const dateOk = isCompleteDate(data.date);
  // 大会名を打っている途中（欄にカーソルがあり、まだ1文字）は、「名前が入った」にしない。黄色もチェックも、打ち終わる（欄から出る、または2文字になる）まで、欄にとどまる
  const titleHold = titleFocused && titleReal && data.title.trim().length < 2;
  const titleCounts = titleReal && !titleHold;
  const dateRead = readDate(data.date);
  const nFighters = data.fighters.length;
  const nonBlank = data.bouts.filter((bout) => !isBlankBout(bout)).length;
  const halfIndex = data.bouts.findIndex(isHalfBout);
  const halfSide = halfIndex >= 0 && !data.bouts[halfIndex].redId ? 'red' : 'blue';
  const withPhoto = data.fighters.filter((fighter) => fighter.photoDataUrl).length;
  const placedCount = data.fighters.filter((fighter) => placed.has(fighter.id)).length;
  const titleMissing = !data.title.trim();
  const otherCore = Math.max(0, coreErrors.length - boutIssues.length - (titleMissing ? 1 : 0)) > 0;
  const problemCount = boutIssues.length + (titleMissing ? 1 : 0) + (otherCore ? 1 : 0);
  const validOk = coreErrors.length === 0 && nonBlank >= 1;
  const done1 = titleCounts, done2 = nFighters >= 2, done3 = nonBlank >= 1 && boutIssues.length === 0, done4 = !dirty && everSaved && validOk;
  const doneList = [done1, done2, done3, done4];
  // 日にちが読めない・過ぎている・途中のとき、「1. 大会の情報」は緑の ✓ にしない（黄色の「見直す」）
  const datePast = dateOk && isPastDate(data.date);
  const dateIssue = dateRead.kind === 'bad' || dateRead.kind === 'partial' || datePast;
  const stepWarn = [done1 && dateIssue, false, false, false];
  const nowStep = doneList.findIndex((done) => !done);
  // 赤と青のクラスがちがう試合も、「気をつけたいところ」に数える（保存は止めない）
  const classMixAt = (bout: LocalBout): boolean => boutClassWarning(byId.get(bout.redId), byId.get(bout.blueId)) !== '';
  // 赤と青の区分か階級がちがう試合も、同じように数える（クラスのちがいとは、別の注意なので、別に数える）
  const weightMix = (bout: LocalBout): boolean => weightMixAt(bout, byId);
  const warnCount = data.bouts.reduce((sum, bout) => sum + boutWarnings(bout, data.fighters, data.bouts).length + (classMixAt(bout) ? 1 : 0) + (weightMix(bout) ? 1 : 0), 0);
  const fresh = nFighters === 0 && data.bouts.length === 0;
  const emptyStart = fresh && !titleReal;
  const title = titleReal ? data.title : 'まだ名前なし';
  const firstWarn = data.bouts.findIndex((bout) => boutWarnings(bout, data.fighters, data.bouts).length > 0 || classMixAt(bout) || weightMix(bout));
  const datePreview = dateOk ? formatDateInput(data.date) : '';
  const missingW = weightMissing(data.fighters);
  const emptyW = missingW.filter((fighter) => fighter.weight.trim() === '');
  // 同じ名前の人が2人以上いるときは、名前のうしろに管理番号を足して見分ける
  const nameCount = new Map<string, number>();
  for (const fighter of data.fighters) nameCount.set(fighter.name.trim(), (nameCount.get(fighter.name.trim()) ?? 0) + 1);
  const who = (fighter: LocalFighter, max = 12): string => shorten(fighter.name, max) + ((nameCount.get(fighter.name.trim()) ?? 0) > 1 ? '（番号 ' + shorten(fighter.id, 8) + '）' : '');
  // 同じ名前＋同じジムの人が名簿に2人以上いる組（同じ人が2回申し込んだときに起こる）。「別の人です」と答えた組は出さない
  const dupGroups = (() => {
    const map = new Map<string, LocalFighter[]>();
    for (const f of data.fighters) { if (!f.name.trim()) continue; const k = sameKey(f); const list = map.get(k); if (list) list.push(f); else map.set(k, [f]); }
    return [...map.entries()].filter(([k, list]) => list.length > 1 && !acks.has('dupname:' + k));
  })();
  const dupIdsNow = new Set(dupGroups.flatMap(([, list]) => list.map((f) => f.id)));
  // 中身が同じなら同じ Set を使う（対戦カードは memo なので、毎回ちがう Set を渡すと、全部が描き直される）
  const dupKey = [...dupIdsNow].sort().join('|');
  if (dupCache.current.key !== dupKey) dupCache.current = { key: dupKey, set: dupIdsNow };
  const dupIds = dupCache.current.set;
  const longOnes = tooLong(data.fighters);
  // 取り込みで直せなかった所のうち、まだ直っていないもの（直したら、知らせから消える）
  const liveUnreadable = (importNote?.unreadable ?? []).filter((u) => { const f = byId.get(u.id); return !!f && String(f[u.field] ?? '').trim().slice(0, 20) === u.from; });
  const unreadableW = weightUnreadable(data.fighters);
  const swapped = data.fighters.filter(heightWeightSwapped);
  // 失敗の知らせが帯に出ているときは、状態ラインは「! 保存失敗」だけ（同じ文を2回出さない）
  const failShown = saveState === 'failed' && !!msg && msg.kind === 'error' && msg.area === 'save';
  const lineTone = line.tone === 'bad' ? 'text-rose-800' : line.tone === 'warn' ? 'text-stone-900' : line.tone === 'ok' ? 'text-emerald-800' : 'text-slate-800';
  /** 赤い『✕ まだ』を出してよいか：保存や『開く』を押して、うまくいかなかったあと */
  const failedTry = titleTried || !!openError;
  const chooseFirst = noEventParam && !chooseDismissed && !dirty && emptyStart && (events ?? []).some((item) => item.eventId !== data.eventId);

  const na = nextAction({ titleReal: titleCounts, dateOk, fighters: nFighters, nonBlankBouts: nonBlank, halfIndex, halfSide, dirty, everSaved, problems: problemCount, opened, saveState, conflict });
  const key: NextKey = na.key;
  // 黄色の「👉 次はここ」は、ここで決めた1つだけ。上のナビ・次にすること・下の帯・黄色の枠が、みんなこれを見る
  const blankIndex = data.bouts.findIndex(isBlankBout);
  const firstIssue = boutIssues[0];
  const activeFollow: Follow | null = !follow ? null
    : follow.kind === 'photo' ? (byId.get(follow.id) && !byId.get(follow.id)?.photoDataUrl ? follow : null)
    : follow.kind === 'review' ? (suggested.size > 0 ? follow : null)
    : follow;
  const marker = pickMarker({
    conflict, asking: ask !== null, chooseFirst, follow: activeFollow, na, saveState, blankIndex, halfIndex, halfSide,
    fix: firstIssue && firstIssue.side !== 'both' ? { index: firstIssue.index, side: firstIssue.side === 'blue' ? 'blue' : 'red' } : null, titleMissing, copyButton: failShown && !!msg?.action,
  });
  const here = marker.where;
  const barIsSave = here === 'bar' || here === 'bar-copy';
  const goToProblem = () => {
    if (nonBlank === 0) return jump('add-bout');
    const issue = boutIssues[0];
    if (issue) return jump('bout-' + issue.index + (issue.side === 'blue' ? '-blue' : '-red'));
    if (titleMissing) { setTitleTried(true); return jump('field-title'); }
    jump('sec-4');
  };
  const banner: Record<NextKey, { hint: string; run: () => void }> = {
    title: { hint: '「1. 大会の情報」の、いちばん上の欄です。日にちは、あとでもOKです。', run: () => jump('field-title') },
    fighters: { hint: '申し込みで集めた選手のファイルを、「2. 選手を入れる」で選びます。', run: () => jump('pick-file', 'pick-file-box') },
    fighters2: { hint: '試合は2人いないと作れません。', run: () => jump('pick-file', 'pick-file-box') },
    bouts: { hint: '「＋ 試合を追加」を押して、赤と青の選手を選びます。', run: () => blankIndex >= 0 ? jump('bout-' + blankIndex + '-red') : jump('add-bout') },
    half: { hint: '選手が1人だけ入っている試合があります。', run: () => jump('bout-' + halfIndex + (halfSide === 'red' ? '-red' : '-blue')) },
    save: { hint: saveState === 'failed' ? '入れた内容は画面に残っています。まず、コピーのファイルを作っておくと安心です。' : 'ここまでの内容を、このパソコンの中に残します。', run: () => { void save(); } },
    fix: { hint: 'まだ直すところがあります。', run: goToProblem },
    open: { hint: '準備は終わりました。試合当日の画面で、確かめます。', run: () => { void openLive(); } },
    done: { hint: '', run: () => undefined },
  };
  const canOpen = validOk;
  // 押せない本当の理由（画面にある箱だけを指さす）
  // 大会の名前が まだ「大会名未設定」のときも、黄色と同じ順番で「先に、大会の名前を入れます」と言う（画面の黄色は、いつも名前の欄から始まる）
  const openWhy = openLockReason({ titleMissing: titleMissing || !titleReal, fighters: nFighters, nonBlankBouts: nonBlank, problems: problemCount, canOpen });
  async function openLive() {
    setTitleTried(true);
    if (openingRef.current) return;
    if (!canOpen) {
      const issue = boutIssues[0];
      const why = nonBlank === 0 ? 'まだ試合がありません' : issue ? issue.text.replace(/。$/, '').replace('選んでください', 'が空です').replace(/の(赤|青)コーナーの選手が空です/, 'の$1コーナーが空です') : titleMissing ? '大会の名前がありません' : 'データのどこかが正しくありません';
      setOpenError('まだ開けません：' + why);
      if (nonBlank === 0) goTarget('add-bout'); else if (issue) goTarget('bout-' + issue.index + (issue.side === 'blue' ? '-blue' : '-red')); else if (titleMissing) goTarget('field-title'); else jump('sec-4');
      return;
    }
    // 二度押しで、画面がいくつも開かないようにする（2秒）
    openingRef.current = true; window.setTimeout(() => { openingRef.current = false; }, 2000);
    let popup: Window | null = null;
    try { popup = window.open('', '_blank'); } catch { popup = null; }
    if (dirty && !(await save())) { popup?.close(); openingRef.current = false; return; }
    setOpened(true); setOpenError(''); setOpenedNote(true);
    if (popup) { try { popup.opener = null; } catch { /* 古い画面では無視 */ } popup.location.href = live; } else location.href = live;
  }
  /** A3の対戦一覧表を、新しい画面で開く。保存していない直しがあるときは、先に保存する（一覧表は、保存した内容から作るため）。二度押しで、いくつも開かない */
  async function openSheet() {
    if (sheetOpeningRef.current) return;
    if (nonBlank === 0) { goTarget('add-bout'); return; }
    sheetOpeningRef.current = true; window.setTimeout(() => { sheetOpeningRef.current = false; }, 2000);
    let popup: Window | null = null;
    try { popup = window.open('', '_blank'); } catch { popup = null; }
    if (dirty && !(await save())) { popup?.close(); sheetOpeningRef.current = false; return; }
    if (popup) { try { popup.opener = null; } catch { /* 古い画面では無視 */ } popup.location.href = sheetLink; } else location.href = sheetLink;
  }
  /** この大会を、このパソコンから消す（消す前に、コピーのファイルがあることを確かめてある）。ほかの大会は消えない */
  async function removeThisEvent() {
    const id = dataRef.current.eventId;
    try {
      await deletePrivateEvent(id);
      try { for (const prefix of [SETUP_KEY, BACKUP_AT_KEY, BACKUP_FOR_KEY, 'tos-sheet:']) localStorage.removeItem(prefix + id); } catch { /* 覚え書きが消せなくても、大会は消えている */ }
      cleanRef.current = dataRef.current;
      location.href = '/private/';
    } catch { notify('error', '失敗：消せませんでした。この大会は、そのまま残っています。もう一度「この大会のデータを、このパソコンから消す」を押してください。'); }
  }
  /** 新しい大会をつくる: 名簿・対戦カードは空。「選手に書いてもらうこと」と会場だけ引き継ぐ */
  async function startNewEvent() {
    if (newEventRef.current) return;
    pendingInputRef.current = false;
    newEventRef.current = true; window.setTimeout(() => { newEventRef.current = false; }, 2000);
    if (dirty && !(await save())) { newEventRef.current = false; return; }
    location.href = '/private/?event=' + newEventId(Date.now()) + '#from=' + encodeURIComponent(dataRef.current.eventId);
  }
  /** 黄色の場所が「帯の外」にあるとき、下の青いボタンは、そこへ行くボタンになる */
  const runMarker = () => {
    switch (here) {
      case 'chooser': jump('choose-events'); return;
      case 'pw': goBackup(); return;
      case 'reload': jump('reload-btn'); return;
      case 'file': jump('pick-file', 'pick-file-box'); return;
      case 'photo': { const id = marker.id ?? ''; jump('fighter-' + id); return; }
      case 'review': { const at = data.bouts.findIndex((bout) => bout.id === suggestNote?.ids[reviewN]); jump('bout-' + Math.max(0, at)); return; }
      default: banner[key].run();
    }
  };
  const onBarPrimary = () => {
    if (lockedByAsk) return;
    if (na.kind === 'conflict') { jump('conflict-box'); return; }
    if (!barIsSave && here !== 'none') { runMarker(); return; }
    if (na.kind === 'open' && Date.now() - savedAtRef.current >= 1500) { void openLive(); return; }
    // 保存した直後の二度押しだけ止める。保存のあとに入力がある（未保存）・保存に失敗した、ときは必ず保存する
    const nothingUnsaved = dataRef.current === cleanRef.current && saveState !== 'failed';
    // 保存の直後に押された（二度押しよけ）：何も起きないように見えないよう、ひとこと知らせる
    if (na.kind === 'open' && Date.now() - savedAtRef.current < 1500) { setJustSavedNote(true); window.setTimeout(() => setJustSavedNote(false), 4000); return; }
    if (na.kind === 'save' && nothingUnsaved && Date.now() - savedAtRef.current < 1500) return;
    if (na.kind === 'save' && saveState === 'saving') return;
    banner[key].run();
  };
  // 確認の箱が開いている間は、下の青いボタンを押せなくする（箱に答えないまま、別のことをしない）。別の画面との食いちがいの箱（other）は、その箱の中で答える
  const lockedByAsk = ask !== null && ask.kind !== 'other';
  // 下の青いボタンの文: 「👉 次はここ」が帯の中なら、その仕事の名前。帯の外なら「そこへ行く」ボタン（押すと動くだけなので、『〜へ行く』と書く）
  const goLabel = (where: typeof here, text: string): string => where === 'title' ? '↑ 大会名の欄へ' : where === 'file' ? (text === 'ファイルを選び直す' ? '↑ ファイルを選び直す所へ' : '↑ ファイルを選ぶ所へ') : where === 'add-bout' ? '↑ 試合を作る所へ' : where === 'photo' ? '↑ 写真を選ぶ所へ' : where === 'review' ? '↑ 案の確認へ' : where === 'chooser' ? '↑ 大会を選ぶ所へ' : where === 'pw' ? '↑ パスワードの欄へ' : where === 'reload' ? '↑ 「開き直す」の所へ' : '↑ ' + text.replace(/を選ぶ$/, 'へ').replace(/へ行く$/, 'へ');
  const barLabel = na.kind === 'conflict' ? '上の「👉 次はここ」の箱を見る' : barIsSave || here === 'none' ? na.label : goLabel(here, marker.barLabel ?? na.label);
  /** 保存に失敗したとき：塗りのボタンは、黄色の中の『コピーのファイルを作る』。『もう一度 保存する』は、ふつうの枠だけのボタンにする */
  const failCopyFirst = failShown && !!msg?.action;
  // 緑の「✓ 保存しました 07:58（このパソコンの中）」の知らせが出ている間は、同じことを言う「✓ 保存済み 07:58」の行を、目には見せない（読み上げと確認のために残す）。帯の高さを、1行ぶん減らす
  const saveShownAbove = !!msg && msg.kind === 'ok' && msg.area === 'save' && line.tone === 'ok';
  const barDisabled = (na.kind === 'save' && saveState === 'saving') || lockedByAsk;
  const showSecondarySave = dirty && !barIsSave && !(here === 'none' && na.kind === 'save') && na.kind !== 'conflict' && saveState === 'idle' && !lockedByAsk;
  const steps = [['sec-1', '大会の情報', '大会'], ['sec-2', '選手を入れる', '選手'], ['sec-3', '対戦カードを作る', '試合'], ['sec-4', '保存して開く', '開く']] as const;
  const navText = ask ? '確認の箱に答える' : here === 'none' ? na.label : marker.label;
  const musicNow = entryConfig.music;
  const modeLine = (mode: EntryFieldMode) => mode === 'off' ? '入力画面：この欄は出ません。' : mode === 'optional' ? '入力画面：この欄が出ます（空でもOK）。' : '入力画面：この欄が出ます（必ず書く）。';
  const overwriteReady = pendingOverwrite && pendingOverwrite.base === data.fighters ? pendingOverwrite : null;
  const canUndoSuggestion = !!suggestNote && suggestNote.ids.some((id) => suggested.has(id) && data.bouts.some((bout) => bout.id === id));
  const reviewN = follow?.kind === 'review' ? Math.min(follow.n ?? 0, Math.max(0, (suggestNote?.ids.length ?? 1) - 1)) : 0;
  const restoreLocked = pwNorm.length < 10;
  const listOpen = listPref ?? nFighters <= 8;
  const q = foldKana(query);
  const shownFighters = nFighters > 8 && q ? data.fighters.filter((fighter) => foldKana(fighter.name + fighter.gym).includes(q)) : data.fighters;
  const draftCheck = editingId ? checkFighter(draft, entryConfig, 'edit') : null;
  const editProblems: FieldProblems = draftCheck ? toMap(draftCheck.problems) : {};
  const editFirst = draftCheck?.problems[0];
  const manualInvalidN = Object.keys(manualProblems).length;
  const spot = placeTarget();
  const sideWord = (side: 'red' | 'blue') => (side === 'red' ? '赤' : '青');

  /** 1試合だけ保存したあと、まだ試合に入っていない人がいるとき：黄色は増やさず、ふつうの文で教える */
  const moreBoutsNote = nonBlank >= 1 && unplaced.length >= 2 && blankIndex < 0
    ? <Soft className="max-w-[38em]">まだ試合に入っていない選手が{unplaced.length}人います。全員が試合に出なくてもかまいません。もう1試合作るときは、「＋ 試合を追加」を押します。これでよければ、そのまま「試合当日の画面を開く」を押します。</Soft> : null;
  const rosterHelp = <>
    <ol className="mt-3 max-w-[38em] list-none space-y-2 pl-0 font-medium">
      <li><StepNo n={1} />Googleのシートを開く（ブラウザの一番上に並んだ名前の中から、Googleのシートを押す）</li>
      <li><StepNo n={2} />メニュー「Tournament OS」→「④ OS用の名簿ZIPを作る」を押す（選手のリストのZIPです）</li>
      <li><StepNo n={3} />できたファイルを探す（「ダウンロード」の中）</li>
      <li><StepNo n={4} />下の「ファイルを選ぶ」を押して、そのファイルを選ぶ</li>
    </ol>
    <p className="mt-3 flex flex-wrap items-center gap-2 text-[17px] font-medium">
      <Chip tone="slate">ZIP＝まとめたファイル</Chip>
      <span>ファイル名の例：</span>
      <span className="rounded-lg border-2 border-slate-400 bg-white px-3 py-1 font-bold"><span aria-hidden="true">📄 </span>Tournament_OS_tos-1234567890.zip</span>
    </p>
  </>;

  /** 次にすること（文だけ。黄色のところと、下の青いボタンが、この文と同じ仕事をする） */
  const nextCard = <section aria-label="👉 次はここ" className="rounded-2xl border-2 border-slate-400 bg-white p-4 shadow-sm">
    {key === 'done' && na.kind === 'open' && !ask ? <OkLine>{ALL_READY(true)}</OkLine> : <>
      <p className="text-lg font-bold text-slate-950">👉 次はここ：{ask ? '確認の箱に答える' : here === 'none' ? na.label : marker.label}</p>
      {key === 'open' && !ask ? moreBoutsNote : null}
      {ask || na.kind === 'conflict' || here === 'bar' || here === 'bar-copy' || here === 'none' ? <p className="mt-1 font-medium">{ask ? '画面の中の確認の箱で、下の2つのボタンのどちらかを押します。' : na.kind === 'conflict' ? '別の画面で内容が変わりました。上の「👉 次はここ」の箱で、どちらを使うか選びます。' : banner[key].hint}</p> : null}
    </>}
  </section>;

  /** 別のパソコンへ移す・こわれたときに戻す入口。データがあっても、いつも見える */
  const backupJump = <div className="rounded-xl border-2 border-slate-300 bg-white p-3">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={goBackup} className={cls(btn.base, btn.outlineBig, 'w-full text-balance [word-break:auto-phrase] sm:w-auto')}>別のパソコンへ移す／こわれたときのコピー</button>
      {backupAt ? (backupStale ? <Chip tone="amber">⚠ 前のコピーのあとで変更あり（コピー {clockText(backupAt)}）</Chip> : <Chip tone="green">✓ コピー作成ずみ {clockText(backupAt)}</Chip>) : <Chip tone="slate">コピーのファイル：まだ</Chip>}
      {backupAt && backupStale ? <button type="button" onClick={goBackup} className={cls(btn.base, btn.outline)}>新しく作り直す</button> : null}
    </div>
    <p className="mt-1 text-[17px] font-medium">ここを押しても、まだコピーは作られません。下の「コピーのファイル」の画面が開くだけです。</p>
    {!backupAt && nFighters >= 1 ? <Caution className="mt-2" role="status">コピー未作成：停電や故障で消えると戻せません。</Caution> : null}
  </div>;

  /** Googleの申し込みページ（べつの作業）。確かめてあるときだけ緑。ほかは、目立たない注意か灰色。選手が入ったあとも、小さく残す */
  const googleBox = <section aria-label="この大会の申し込みページ" className={cls('space-y-2 rounded-xl border-2 p-3 text-[17px] font-bold', setupState === 'yes' ? 'border-[#166534] bg-[#f0fdf4] text-[#166534]' : 'border-slate-300 bg-slate-50 text-slate-900')}>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="min-w-0">{setupState === 'yes' ? '✓ 申し込みページ：つながりを確かめてあります（できた）' + (setupAt ? '　' + setupAt + ' に確かめました' : '') : setupState === 'blocked' ? '⚠ 気をつけて：申し込みページは、つながりました。でも、受付はまだ使えません' : setupState === 'entered' ? '⚠ 気をつけて：申し込みページは、URLだけ入っています。つながりの確認が まだ' : setupState === 'unknown' ? '? 申し込みページ：画面で確かめます' : '申し込みページ：まだ（あとでOK）'}</p>
      {setupState !== 'yes' ? <a href={setupLink} className={cls(btn.base, btn.outline)}>選手の受付をつくる画面へ →</a> : null}
    </div>
    {setupState !== 'yes' ? <Soft>別の画面に移ります。「戻る」で戻れます。</Soft> : null}
    {setupState === 'entered' ? <Soft className="font-medium">つながったかは、「選手の受付をつくる」の画面で確かめます。</Soft> : null}
    {setupState === 'blocked' ? <Soft className="font-medium">「選手の受付をつくる」の画面を開いて、「✕」の文のとおりに直します。直るまで、選手には URL を渡しません。</Soft> : null}
    <p className="text-[17px] font-bold text-[#b91c1c]"><span aria-hidden="true">✕ </span>別のパソコンで作った人は押さない。もう一度作ると別の受付になります。</p>
    <p className="text-[17px] font-medium text-slate-800">このパソコンの中の記録で見ています。別のパソコンで作ったときは「まだ」と出ます。</p>
  </section>;

  /** ほか：大会をえらぶ・安心のしくみ（ふだんは閉じておく） */
  const otherFold = <Fold id="choose-events" title="大会をえらぶ・安心のしくみ（ほか）" open={chooserOpen} onToggle={(open) => { setChooserOpen(open); if (open && events === null) void loadEvents(); }} className="border-slate-300">
    <p className="text-lg font-bold">大会をえらぶ（続きから／新しい大会）</p>
    {events === null ? <p className="mt-2 font-medium">⏳ 保存してある大会を探しています…</p> : <ul className="mt-2 space-y-2">
      {events.map((item) => {
        const name = eventListName(item);
        const label = '続きから：' + name + '　' + (item.date || '日にちなし') + '　選手' + item.fighters + '人';
        return <li key={item.eventId} className="min-w-0 [overflow-wrap:anywhere]">{item.eventId === data.eventId
          ? <p className="flex min-h-14 min-w-0 items-center rounded-xl border-2 border-[#166534] bg-[#f0fdf4] px-4 py-2 text-lg font-bold text-[#166534] [overflow-wrap:anywhere]">✓ いま開いている：{label.replace('続きから：', '')}</p>
          : <a href={'/private/?event=' + encodeURIComponent(item.eventId)} className={cls(btn.base, btn.outlineBig, 'w-full justify-start text-left')}>{label}</a>}</li>;
      })}
      {events.length === 0 ? <li className="font-medium">{eventsFailed ? '保存してある大会を読めませんでした。いま開いている大会は、そのまま使えます。' : 'まだ、保存してある大会はありません。'}</li> : null}
    </ul>}
    {ask?.kind === 'new-event' ? <DangerConfirm key={ask.nonce} yellow id="confirm-new-event" label="確認：新しい大会へ移るか" tone={dirty ? 'danger' : 'plain'} head={dirty ? '取り消せない' : '気をつけて'}
      verdict={dirty ? '先に保存します。保存できないと移れません。' : 'いまの大会（' + (titleReal ? data.title : '名前なし') + '・選手' + nFighters + '人）から、空の新しい大会へ移ります。'}
      lines={[...(dirty ? ['保存していない入力は、保存してから移ります'] : []), ...(pendingInput ? ['追加していない選手の入力は消えます'] : [])]}
      note={dirty ? '下のボタンを押すまで、何も変わりません。' : 'いまの大会は保存されて、「続きから」でまた開けます。'}
      safeLabel="やめる（ここにいる）" dangerLabel="新しい大会へ" onYes={answerYes} onNo={answerNo} /> : null}
    <button id="new-event-btn" type="button" onClick={() => setAsk({ kind: 'new-event', nonce: ++askSeq.current })} className={cls(btn.base, btn.outlineBig, 'mt-4 w-full text-balance sm:w-auto')}>新しい大会をつくる（前回の設定を引き継ぐ）</button>
    <p className="mt-2 max-w-[38em] text-[17px] font-medium">名簿と対戦カードは空で始まります。引き継ぐのは「選手に書いてもらうこと」と会場だけです。</p>
    <div className="mt-5 border-t-2 border-slate-200 pt-4">
      <p className="text-lg font-bold">大会が全部おわったら</p>
      <p className="mt-2 max-w-[38em] font-medium">選手の名前・写真・体重を、このパソコンから消せます。ほかの大会は消えません。</p>
      <button id="delete-event-btn" type="button" aria-disabled={!deleteReady || undefined} aria-describedby="delete-event-why" onClick={() => { if (deleteReady) setAsk({ kind: 'delete-event', nonce: ++askSeq.current }); }} className={cls('tos-danger-btn mt-3 inline-flex w-full items-center justify-center text-center text-lg touch-manipulation sm:w-auto', !deleteReady && 'tos-locked')}><span aria-hidden="true">✕ </span>この大会のデータを、このパソコンから消す</button>
      {deleteReady ? <p id="delete-event-why" className="mt-1 text-[17px] font-medium">押すと、もう一度聞きます。まだ消えません。</p> : <LockReason id="delete-event-why">押せません：{!everSaved ? '先に「保存する」を押します' : dirty ? '保存していない変更があります。先に「保存する」を押します' : backupAt <= 0 ? '先に、「コピーのファイルを作る・戻す」でコピーを作ります（消したあとで戻せるように）' : '前のコピーのあとで変更があります。コピーを作り直します'}</LockReason>}
      {ask?.kind === 'delete-event' ? <DangerConfirm key={ask.nonce} yellow id="confirm-delete-event" label="確認：この大会をこのパソコンから消すか" verdict={'この大会（' + (titleReal ? data.title : '名前なし') + '）が、このパソコンから消えます。'}
        lines={['選手 ' + nFighters + '人・写真 ' + data.fighters.filter((f) => f.photoDataUrl).length + '枚・試合 ' + nonBlank + 'つが、消えます']} note="コピーのファイルは消えません。そのファイルがあれば、あとで戻せます。下のボタンを押すまで、何も変わりません。"
        safeLabel="やめる（何も消さない）" dangerLabel="この大会を、このパソコンから消す" onYes={answerYes} onNo={answerNo} /> : null}
      <p className="mt-3 max-w-[38em] text-[17px] font-medium">Googleのシートと写真のフォルダは、別に消します。やり方は、「選手の受付をつくる」の画面の一番下の「大会が終わったら」に書いてあります。</p>
    </div>
    <div className="mt-5 border-t-2 border-slate-200 pt-4">
      <p className="text-lg font-bold"><span aria-hidden="true">🛡 </span>安心のしくみ</p>
      <p className="mt-2 max-w-[38em] font-medium">このパソコンでだけ使えます。別のパソコンやスマホで開くと空です。</p>
      <p className="mt-2 max-w-[38em] font-medium">選手の名前・写真・体重・試合カードは、このパソコンの中にだけ保存します。インターネットには送りません。</p>
      <p className="mt-2 max-w-[38em] font-medium">同じパソコンの別の画面では、同じ内容が出ます。</p>
      <p className="mt-2 max-w-[38em] font-medium">Googleの受付の設定は、この保存とは別です。</p>
      <p className="mt-2 max-w-[38em] font-medium">ネットが切れても入力と保存はできます。ただし、画面を閉じたあとに開くには、ネットが必要です。</p>
    </div>
  </Fold>;

  /** 最初の画面（保存まえ）に、いつも1つ出す注意 */
  const safeNote = <Caution role="status">この保存は、いま使っているアプリ（Chrome・Safariなど）の中だけです。別のパソコンや別のアプリで開くと空です。「コピーのファイル」を作っておくと安心です。</Caution>;
  const rewindBox = ask?.kind === 'rewind'
    ? <DangerConfirm key={ask.nonce} yellow id="confirm-rewind" label="確認：第1試合にもどすか" verdict={'いま 第' + (data.currentBout + 1) + '試合です。第1試合に戻ります。'} lines={['本番の途中なら、押さないでください']} safeLabel="やめる（何も変えない）" dangerLabel="第1試合にもどす" onYes={answerYes} onNo={answerNo} /> : null;

  return <>
  <main className="tos-read min-h-screen bg-slate-50 pb-[calc(var(--bar-h,13rem)+1rem)] text-slate-950 [color-scheme:light] [word-break:auto-phrase] [overflow-wrap:anywhere]"
    onFocus={(e) => { const t = e.target as HTMLElement; window.clearTimeout(blurTimer.current); setFieldFocused(t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'file', 'radio', 'button'].includes((t as HTMLInputElement).type))); }}
    // 入力欄から外れた瞬間に下の帯を入れ替えると、押そうとしたボタンが消える。少し待ってから戻す
    onBlur={() => { window.clearTimeout(blurTimer.current); blurTimer.current = window.setTimeout(() => setFieldFocused(false), 300); }}>
    <div className="mx-auto w-full max-w-6xl px-4 py-4 lg:py-8">
      {/* いちばん上の1行: いま開いている大会（続きから開いたときの確認も兼ねる） */}
      <div className="rounded-xl border-2 border-slate-400 bg-white p-3">
        <p className="min-w-0 break-words text-lg font-bold"><span className="block min-[760px]:inline">いま開いている大会：</span><span className="block text-indigo-900 min-[760px]:inline">{title}</span><span className="hidden min-[760px]:inline">　</span><span className="whitespace-nowrap font-medium">選手{nFighters}人・試合{nonBlank === 0 ? 'なし' : nonBlank + 'つ'}</span>　<span className={cls('whitespace-nowrap', lineTone)}>{line.short}</span></p>
      </div>
      {sheetCfg ? <Caution role="status" className="mt-3">
        <span>シートで決めた「選手に書いてもらうこと」や、{sheetExtra}が、この大会に まだ入っていません。入れないと、クラスの名前や入場曲{sheetCfg.weights ? '、区分・階級' : ''}の欄が、ここに出ません。</span>
        <span className="mt-2 flex flex-col gap-3 sm:flex-row">
          <button type="button" id="apply-sheet-config" onClick={() => { edit('entryConfig', sheetCfg); setSheetCfg(null); setTopNotes((old) => [...old.filter((n) => n.id !== 'google-config'), { id: 'google-config', kind: 'info', text: 'シートで決めた「選手に書いてもらうこと」と' + sheetExtra + 'を入れました。まだ保存していません。' }]); }} className={cls(btn.base, btn.outline)}>シートの設定を入れる</button>
          <button type="button" id="skip-sheet-config" onClick={() => setSheetCfg(null)} className={cls(btn.base, btn.outline)}>入れない（このままにする）</button>
        </span>
      </Caution> : null}
      {topNotes.length ? <div className="mt-3 space-y-2">{topNotes.map((note) => <Notice key={note.id} kind={note.kind} onClose={() => setTopNotes((old) => old.filter((item) => item.id !== note.id))}>{note.text}{note.id === 'from-event' && setupState !== 'yes' ? <> <a href={setupLink} className="font-bold text-indigo-800 underline underline-offset-4">選手の受付をつくる画面へ →</a></> : null}</Notice>)}</div> : null}

      <header className="mt-3"><h1 className="text-balance text-2xl font-bold">{fresh && (emptyLayout || !titleReal) ? '4つの手順で、対戦カードを作ります。' : '試合の準備'}</h1></header>

      <div className="mt-3 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* 4つの手順: 現在地・できた・まだ（スマホは上にくっつく / PCは左）。いちばん上に置く */}
        <nav ref={navRef} aria-label="4つの手順" className={cls(chromeFlow ? 'relative' : 'sticky top-0', 'tos-nav z-30 -mx-4 border-b-2 border-slate-300 bg-white/95 px-2 py-2 backdrop-blur lg:top-4 lg:mx-0 lg:rounded-2xl lg:border-2 lg:p-2')}>
          <ol className="grid list-none grid-cols-4 gap-1 p-0 lg:grid-cols-1 lg:gap-2">{steps.map(([id, label, short], i) => {
            const isDone = doneList[i], isNow = nowStep === i;
            return <li key={id} className="min-w-0"><a href={'#' + id} onClick={(e) => { e.preventDefault(); jump(id); }} aria-current={isNow ? 'step' : undefined}
              className={cls('flex min-h-12 flex-col items-center justify-center rounded-xl border-2 px-1 py-1 text-center text-[17px] font-bold leading-tight lg:items-start lg:px-3 lg:text-left', isDone && !stepWarn[i] ? 'border-[#166534] bg-[#f0fdf4] text-[#166534]' : isDone ? 'border-[#a16207] bg-[#fefce8] text-[#1c1917]' : isNow ? 'border-4 border-slate-900 bg-white text-slate-950' : 'border-slate-500 bg-slate-50 text-slate-800')}>
              {/* せまい画面（幅400px以下）では、番号と印だけにして、上にくっつく手順ナビを低くする（名前は、読み上げ用に残す） */}
              <span className="flex flex-wrap items-center justify-center gap-x-1 lg:justify-start"><span aria-hidden="true" className="shrink-0">{isDone ? (stepWarn[i] ? '⚠' : '✓') : isNow ? '▶' : ''}{i + 1}</span><span className="sr-only">{i + 1} </span><span className="max-[401px]:hidden lg:hidden">{short}</span><span className="sr-only min-[402px]:hidden">{label}</span><span className="hidden lg:inline">{label}</span></span>
              <span aria-hidden="true" className="max-[401px]:hidden">{isDone ? (stepWarn[i] ? '見直す' : 'できた') : isNow ? 'いまここ' : 'まだ'}</span>
              <span className="sr-only">{isDone ? (stepWarn[i] ? 'できた（見直す所があります）' : 'できた') : isNow ? 'まだ（いまここ）' : 'まだ'}</span>
            </a></li>;
          })}</ol>
          <p className="mt-1 text-center text-[17px] font-bold text-slate-900 lg:hidden">{nowStep >= 0 || ask ? '👉 次はここ：' + navText : '✓ ' + ALL_READY(opened)}</p>
        </nav>

        <div className="mt-4 min-w-0 max-w-4xl space-y-5 lg:mt-0">
          {conflict ? <NextSlot id="conflict-box" active label="どちらを使うか、この箱で選ぶ" className="space-y-3 focus:outline-none">
            <ErrorLine>止まってください：別の画面で、この大会の内容が変わりました。このまま保存すると、そちらの変更が消えます。</ErrorLine>
            <p className="text-[17px] font-medium">どちらかを選ぶまで、保存はできません。</p>
            <p className="font-bold">迷ったら：さっき試合当日の画面で、試合を進めただけなら「別の画面の内容を使う」。ここで たくさん入力したなら「いまの入力を残す」。</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <button type="button" className="tos-safe-btn inline-flex w-full items-center justify-center text-center text-lg touch-manipulation" onClick={keepMine}>いまの入力を残す（別の画面の変更が消える）</button>
                <p className="tos-danger  text-[17px]"><span aria-hidden="true">✕ </span>消えるもの：別の画面で変えた内容</p>
              </div>
              <div className="space-y-2">
                <button type="button" id="use-other-trigger" className="tos-danger-btn inline-flex w-full items-center justify-center text-center text-lg touch-manipulation" onClick={useOther}>別の画面の内容を使う（いま入れた分が消える）</button>
                <p className="tos-danger  text-[17px]"><span aria-hidden="true">✕ </span>消えるもの：いま入れた分（保存していない入力）</p>
              </div>
            </div>
            {ask?.kind === 'other' ? <ConfirmOther key={ask.nonce} ask={ask} data={data} onYes={answerYes} onNo={answerNo} /> : null}
          </NextSlot> : null}

          {chooseFirst ? <NextSlot active label="続きから開く大会を選ぶ" className="space-y-3">
            {otherFold}
            <button type="button" className={cls(btn.base, btn.outlineBig)} onClick={() => setChooseDismissed(true)}>続きではなく、新しく始める（この空の画面を使う）</button>
          </NextSlot> : null}

          <div className={cls('space-y-5', chooseFirst && 'opacity-60')}>
          {emptyLayout ? null : nextCard}
          {!everSaved && !conflict && !emptyLayout ? safeNote : null}
          {!emptyLayout ? backupJump : null}
          {!emptyLayout ? googleBox : null}
          {!emptyLayout && !chooseFirst ? otherFold : null}

          {/* ───── 1 ───── */}
          <Section id="sec-1" title="1. 大会の情報" done={done1} warnText={dateIssue ? '日にちを見直す' : undefined}>
            <p className="max-w-[38em] font-medium">試合当日の画面に出る、大会の名前と日にちです。Googleのシートに書いたものと同じものを入れます。</p>
            <p className="max-w-[38em] text-[17px] font-medium text-slate-800">試合当日の画面＝選手の名前・写真・体重を、大きく映す画面です。対戦カード＝だれとだれが戦うかを書いた表です。</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <NextSlot active={here === 'title'} label={marker.label} className="sm:col-span-2">
                <div className="min-w-0 sm:col-span-2">
                  <div className="flex flex-wrap items-baseline"><label htmlFor="field-title" className="text-lg font-bold">大会名</label><Badge required /></div>
                  <input id="field-title" className={cls(inputClass, 'scroll-mt-28', !titleReal && titleTried && 'tos-input-error', target === 'field-title' && 'tos-target')} value={titleReal ? data.title : ''} autoComplete="off" aria-invalid={(!titleReal && titleTried) || undefined} aria-describedby="title-hint" placeholder="例：第3回 青空ジム大会"
                    onChange={(e) => { setTarget(null); edit('title', e.target.value); }} onFocus={() => setTitleFocused(true)} onBlur={(e) => { setTitleFocused(false); setTitleTried(true); const next = e.target.value.trim(); if (next !== e.target.value) edit('title', next); }} />
                  <Example className="mt-1"><code>第3回 青空ジム大会</code></Example>
                  {titleCounts ? <>
                    <OkLine id="title-hint" className="mt-1">できた</OkLine>
                    {data.title.trim().length > 60 ? <Caution className="mt-2" role="status">長いです（いま{data.title.trim().length}文字）。60文字までにします。<button type="button" onClick={() => edit('title', data.title.trim().slice(0, 60))} className={cls(btn.base, btn.outline, 'ml-2 mt-1')}>60文字に切る</button></Caution> : null}
                    <Soft className="mt-1">できあがり見本：対戦カードの上に「{data.title.trim()}」と出ます。</Soft>
                  </> : <>
                    {titleTried && !titleReal
                      ? <ErrorLine id="title-hint" role="status" className="mt-1">大会の名前が まだです（必ず必要）。上の四角に、大会の名前を入れます。</ErrorLine>
                      : <Soft id="title-hint" className="mt-1">まだ入っていません。上の四角に、大会の名前を入れます（必ず必要）。</Soft>}
                    <Soft className="mt-1">できあがり見本：対戦カードの上に「第3回 青空ジム大会」と出ます。</Soft>
                  </>}
                </div>
              </NextSlot>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline"><label htmlFor="field-date" className="text-lg font-bold">開催日</label><Badge text="なくてもOK（あとでOK）" /></div>
                <input id="field-date" className={cls(inputClass, 'scroll-mt-28', dateRead.kind === 'bad' && 'tos-input-error', target === 'field-date' && 'tos-target')} inputMode="numeric" autoComplete="off" placeholder="例：2027年10月3日（20271003 でもOK）" aria-describedby="date-hint" value={data.date}
                  onChange={(e) => { setDateFix(''); setTarget(null); edit('date', e.target.value); }}
                  onBlur={(e) => { if (!isCompleteDate(e.target.value)) return; const next = formatDateInput(e.target.value); if (next !== e.target.value) { setDateFix(e.target.value.trim() + ' → ' + next); edit('date', next); } }} />
                <Example className="mt-1"><code>2027年10月3日</code>（2027-10-03 でも 2027/10/3 でも大丈夫。数字は全角でもOK）</Example>
                {dateRead.kind === 'bad' ? <ErrorLine id="date-hint" role="status" className="mt-1">{dateRead.reason}。</ErrorLine>
                  : dateRead.kind === 'partial' ? <Caution id="date-hint" className="mt-1" role="status">日にちまで入れてください。例：2027年10月3日（20271003 でもOK）</Caution>
                  : dateOk && datePast ? <Soft id="date-hint" className="mt-1">読み取った日にち：{datePreview}</Soft>
                  : dateOk ? (dateFix ? <OkLine id="date-hint" className="mt-1">自動で直しました：{dateFix}</OkLine> : <OkLine id="date-hint" className="mt-1">日にちを読みました：{datePreview}</OkLine>)
                  : <Soft id="date-hint" className="mt-1">空のままでも、保存できます。入れるなら、数字だけでOK。20271003 → 2027年10月3日</Soft>}
                {datePast ? <Caution id="date-past" className="mt-2" role="status">この日にちは過ぎています。年はまちがっていませんか？まちがいなら、上の四角を直します。</Caution> : null}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline"><label htmlFor="field-venue" className="text-lg font-bold">会場</label><Badge /></div>
                <input id="field-venue" className={cls(inputClass, target === 'field-venue' && 'tos-target')} placeholder="例：○○体育館" autoComplete="off" value={data.venue} onChange={(e) => { setVenueAsk(false); setTarget(null); edit('venue', e.target.value); }} onBlur={(e) => { const next = e.target.value.trim(); if (next !== e.target.value) edit('venue', next); }} />
                <Example className="mt-1"><code>青空体育館</code></Example>
                {venueAsk && data.venue.trim() ? <Caution className="mt-2" role="status">前の大会の会場です。合っていますか？
                  <span className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setVenueAsk(false)} className={cls(btn.base, btn.outline)}>合っている</button>
                    <button type="button" onClick={() => { setVenueAsk(false); goTarget('field-venue'); }} className={cls(btn.base, btn.outline)}>直す</button>
                  </span></Caution> : null}
              </div>
            </div>

            <Fold title={<span>選手に書いてもらうこと <Chip tone="slate">申し込みページは変わりません</Chip></span>} className="border-slate-300">
              <p className="tos-danger  font-bold"><span aria-hidden="true">✕ </span>ここを変えても、Googleの申し込みページは変わりません。</p>
              <p className="mt-2 max-w-[38em] font-medium">いつも書いてもらうもの：名前・ジム名・写真・身長・体重・戦績{entryConfig.classes ? '・クラス（' + entryConfig.classes.upper.name + 'か' + entryConfig.classes.lower.name + '）' : ''}{entryConfig.weights ? '・区分と階級（階級＝体重で分けたグループ）' : ''}</p>
              <p className="mt-1 max-w-[38em] text-[17px] font-medium text-slate-800">ここで変えるのは、この画面の「1人ずつ入れる」と、他のジム用の入力画面です。</p>
              <div className="mt-4 space-y-5">
                <div role="group" aria-labelledby="music-label">
                  <p id="music-label" className="text-lg font-bold">入場曲を書いてもらう</p>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-sm">
                    {([[true, 'はい'], [false, 'いいえ']] as const).map(([value, label]) => <button key={label} type="button" aria-pressed={musicNow === value} onClick={() => { setCfgTouched(true); edit('entryConfig', { ...entryConfig, music: value }); }}
                      className={cls(btn.base, 'min-h-14 text-xl', musicNow === value ? 'border-4 border-slate-900 bg-slate-100 text-slate-950' : 'border-slate-500 bg-white text-slate-900')}>{musicNow === value ? '✓ えらんだ：' : ''}{label}</button>)}
                  </div>
                  <p className="mt-1 text-[17px] font-medium text-slate-800">{musicNow ? '入力画面：入場曲の欄が出ます。' : '入力画面：入場曲の欄は出ません。'}</p>
                </div>
                <div className="grid max-w-md gap-4">{([['grade', '学年'], ['age', '年齢'], ['comment', '意気込み']] as const).map(([k, label]) => <div key={k} className="min-w-0">
                  <label htmlFor={'cfg-' + k} className="text-lg font-bold">{label}</label>
                  <select id={'cfg-' + k} className={inputClass} value={entryConfig[k]} aria-describedby={'cfg-' + k + '-line'} onChange={(e) => setEntryMode(k, e.target.value as EntryFieldMode)}>
                    <option value="off">出さない</option>
                    <option value="optional">書く（空でもOK）</option>
                    <option value="required">必ず書く（書かないと追加できません）</option>
                  </select>
                  <p id={'cfg-' + k + '-line'} className="mt-1 text-[17px] font-medium text-slate-800">{modeLine(entryConfig[k])}</p>
                </div>)}</div>
                {cfgTouched && dirty ? <Caution role="status">変えました。保存するまで残りません。</Caution> : null}
              </div>
            </Fold>

            <Fold title="他のジムの選手に、入力画面を見せる" className="border-slate-300">
              <p className="max-w-[38em] font-medium">他のジムの人に、選手の紹介を書いてもらうときに使う画面です。ふつうの申し込みには、使いません。</p>
              <div className="mt-3">
                <a href={entryLink} target="_blank" rel="noopener noreferrer" className={cls(btn.base, btn.outlineBig)}>入力画面を見る（他のジム用）</a>
              </div>
              <p className="mt-1 text-[17px] font-medium">「入力画面を見る」は、{VIEW_WINDOW_NOTE}</p>
            </Fold>
          </Section>
          {!everSaved && !conflict && emptyLayout ? safeNote : null}

          {/* ───── 2 ───── */}
          <Section id="sec-2" title="2. 選手を入れる" done={done2} doneText={'選手 ' + nFighters + '人'} todoText={'まだ（選手 ' + nFighters + '人）'}>
            <div className="rounded-2xl border-2 border-slate-400 bg-white p-4">
              <h3 className="text-xl font-bold">申し込みが集まった選手を入れる</h3>
              {nFighters === 0 ? rosterHelp : <div className="mt-3"><Fold title="名簿ファイルの作り方（もう一度読み込むとき）" className="border-slate-300">{rosterHelp}</Fold></div>}
              <div id="pick-file-box" className="mt-4 scroll-mt-28">
                <NextSlot active={here === 'file'} label={marker.label}>
                  <label aria-disabled={importBusy || undefined} onClick={(e) => { if (importBusy) e.preventDefault(); }} className={cls(btn.base, btn.outlineBig, 'w-full cursor-pointer text-balance focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-700 sm:w-auto sm:min-w-[16rem]', importBusy && 'tos-locked')}>
                    <span>ファイルを選ぶ</span>
                    <input id="pick-file" type="file" accept={FILE_ACCEPT} className="sr-only" onChange={onPickFile} />
                  </label>
                </NextSlot>
                {importBusy ? <LockReason>読んでいます。終わるまで押せません。閉じないでください。</LockReason> : null}
                {nFighters > 0 ? <p className="mt-2 max-w-[38em] text-[17px] font-medium">もう一度読み込んでも、いる人は変わりません。新しい人だけ足されます。</p> : null}
              </div>
              {importBusy ? <p className="mt-3 font-bold text-slate-800">⏳ よみこんでいます…そのままお待ちください。閉じないでください。</p> : null}
              {importNote ? <div className="mt-3 space-y-2">
                <p id="import-result" tabIndex={-1} className="break-all text-[17px] font-medium text-slate-800 focus:outline-none">選んだファイル：{importNote.file}</p>
                {importNote.kind === 'error' ? <>
                  {importNote.stale ? <div id="import-error" tabIndex={-1} className="space-y-2 focus:outline-none">
                    <Notice kind="warn"><b>{importNote.head}。</b>{importNote.text}</Notice>
                    <NextSlot active={here === 'reload'} label={marker.label}>
                      <button id="reload-btn" type="button" onClick={() => location.reload()} className={cls(btn.base, btn.outlineBig)}>開き直す</button>
                    </NextSlot>
                  </div> : <div id="import-error" tabIndex={-1} className="space-y-2 focus:outline-none">
                    <Notice kind="error" onClose={() => setImportNote(null)}><b>まちがい：{importNote.head}。</b>{importNote.text}</Notice>
                    <OkLine>今の名簿は変えていません。</OkLine>
                    {importNote.hint ? <Soft>{importNote.hint}</Soft> : null}
                  </div>}
                </> : <>
                  {importNote.staleWarn ? <Caution role="status">前の大会の人かもしれません。別の大会なら、足さないでください。
                    <span className="mt-2 flex flex-col gap-3 sm:flex-row">
                      <button type="button" onClick={undoStaleAdd} className="tos-safe-btn inline-flex items-center justify-center text-center text-lg touch-manipulation">足さない（もどす）</button>
                      <button type="button" onClick={() => setImportNote((old) => old ? { ...old, staleWarn: false } : old)} className={cls(btn.base, btn.outlineBig)}>このまま足す</button>
                    </span></Caution> : null}
                  <Notice kind="ok" onClose={() => setImportNote(null)} action={overwriteReady ? { label: 'ファイルの内容で' + overwriteReady.differs.length + '人を書きかえる', onClick: askOverwrite, id: 'overwrite-trigger' } : undefined}>
                    <b>できた：</b>{importNote.text}
                    {importNote.noPhoto ? <span className="mt-1 block font-medium">写真がない選手：{importNote.noPhoto}人（写真は、あとでOKです）</span> : null}
                  </Notice>
                  {importNote.fixed ? <OkLine quiet>自動で直しました：{importNote.fixed.people}人・{importNote.fixed.fields}か所（{importNote.fixed.examples.join('、')}{importNote.fixed.fields > importNote.fixed.examples.length ? ' など' : ''}）</OkLine> : null}
                  {liveUnreadable.length ? <div className="space-y-2">
                    <ErrorLine role="status">直せなかった所が{liveUnreadable.length}か所あります：{liveUnreadable.slice(0, 3).map((u) => { const f = byId.get(u.id); return (f ? who(f, 10) : shorten(u.name, 10)) + 'さんの' + FIELD_LABEL[u.field] + '「' + u.from + '」'; }).join('、')}{liveUnreadable.length > 3 ? ' ほか' : ''}。</ErrorLine>
                    <button type="button" onClick={() => editFighter(liveUnreadable[0].id, liveUnreadable[0].field)} className={cls(btn.base, btn.outline)}>その人を直す</button>
                  </div> : null}
                  {importNote.cut ? <ErrorLine role="status">長すぎて切った所が{importNote.cut}か所あります（{HARD_TEXT_LIMIT}文字まで）。選手の一覧の「長い…」の知らせを見て、直します。</ErrorLine> : null}
                  {importNote.skippedLines?.length ? <Caution role="status">名前が空の行が{importNote.skippedLines.length}つあったので、入れていません（{importNote.skippedLines.slice(0, 5).join('・')}{importNote.skippedLines.length > 5 ? ' ほか' : ''}行目）。</Caution> : null}
                  {importNote.unreadHeaders?.length ? <Caution role="status">読めなかった列：{importNote.unreadHeaders.slice(0, 6).map((h) => shorten(h, 12)).join('、')}{importNote.unreadHeaders.length > 6 ? ' ほか' : ''}。この列の中身は、入っていません。必要な列なら、1行目の見出しを「選手名」「ジム名」「体重」「戦績」「クラス」などに直して、もう一度選びます。</Caution> : null}
                  {importNote.bigPhotos?.length ? <Caution role="status">大きすぎる写真は、入れていません（1枚20MBまで）：{importNote.bigPhotos.slice(0, 3).map((n) => shorten(n, 20)).join('、')}{importNote.bigPhotos.length > 3 ? ' ほか' : ''}。ほかの人と写真は入れました。</Caution> : null}
                  {importNote.dateCells ? <Caution role="status">Excelが日づけに変えていた所が{importNote.dateCells}か所ありました（戦績の「3-1」など）。「月-日」の形にもどしました。合っているか、選手の一覧で確かめます。</Caution> : null}
                  {dirty ? <Caution role="note">まだ保存していません。</Caution> : null}
                </>}
                {ask?.kind === 'overwrite' && overwriteReady ? <ConfirmBoxOverwrite key={ask.nonce} differs={overwriteReady.differs} onYes={answerYes} onNo={answerNo} /> : null}
                {pendingLookalike ? <Notice kind="warn" action={{ label: '別の人なら、足す', onClick: applyLookalike }}>
                  <span>同じ名前の人が{pendingLookalike.extra.length}人 重なっています。足していません。</span>
                  <span className="mt-1 block font-medium">{pendingLookalike.extra.slice(0, 3).map((f) => f.name).join('、')}{pendingLookalike.extra.length > 3 ? ' ほか' : ''}（名前とジムが、前からいる人と同じです）</span>
                  <span className="mt-1 block font-medium">同じ人なら、何もしなくてOKです。別の人のときだけ、下を押します。</span>
                </Notice> : null}
              </div> : null}
            </div>

            <p className="rounded-xl border-2 border-slate-300 bg-slate-100 p-3 font-medium"><span aria-hidden="true">🛡 </span>電話番号・メール・住所・生年月日・保護者名は入れません。入れた内容は、インターネットに送りません。</p>

            <Fold title="ほかの入れ方（Excel・他のジム・1人ずつ）" className="border-slate-300">
              <div className="space-y-4">
                <Fold title="Excelの表を使う" className="border-slate-300">
                  <ol className="max-w-[38em] list-none space-y-2 pl-0 font-medium">
                    <li><StepNo n={1} />「選手入力シートを保存する」を押して、Excelをダウンロードします。</li>
                    <li><StepNo n={2} />Excelに選手を書いて、保存します。</li>
                    <li><StepNo n={3} />上の「ファイルを選ぶ」で、そのExcelを選びます。</li>
                  </ol>
                  <p className="tos-danger  mt-2"><span aria-hidden="true">✕ </span>シートの名前（選手入力）を変えない。</p>
                  <a href="/templates/Tournament_OS_選手入力テンプレート.xlsx" download className={cls(btn.base, btn.outlineBig, 'mt-3 w-full sm:w-auto')}>選手入力シートを保存する</a>
                </Fold>
                <Fold title="ほかのジムからまとめて受け取る" className="border-slate-300">
                  <p className="tos-danger "><span aria-hidden="true">✕ </span>選手本人には、このURLを渡さない。これは他のジム用です。選手本人に渡すURLは、「選手の受付をつくる」の画面でできます。</p>
                  <ol className="mt-3 max-w-[38em] list-none space-y-1 pl-0 font-medium">
                    <li>① 下のボタンでURLをコピーして、他のジムの代表者に送る</li>
                    <li>② 他のジムの代表者が選手を入力して、ファイルを送り返す</li>
                    <li>③ 送り返されたファイルを、上の「ファイルを選ぶ」で選ぶ（返ってきたZIPを選ぶだけです。）</li>
                  </ol>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button type="button" onClick={() => void copyEntryLink()} className={cls(btn.base, btn.outlineBig)}>他のジムの代表者に送るURLをコピー</button>
                    <a href={entryLink} target="_blank" rel="noopener noreferrer" className={cls(btn.base, btn.outlineBig)}>設定した入力画面を確認</a>
                  </div>
                  <p className="mt-2 text-[17px] font-medium">「設定した入力画面を確認」は、{VIEW_WINDOW_NOTE}</p>
                  {copyState === 'ok' ? <OkLine className="mt-2">コピーした：次は、他のジムの代表者に送る</OkLine> : null}
                  {copyState === 'fail' ? <div className="mt-2 space-y-2">
                    <ErrorLine role="status">コピーできていません。</ErrorLine>
                    <p className="text-[17px] font-bold text-slate-900">下の四角の中をクリックして、全部選んでコピーします（Windowsは「Ctrl」＋「A」→「Ctrl」＋「C」、Macは「⌘（コマンド）」＋「A」→「⌘」＋「C」）。</p>
                    <input readOnly aria-label="コピーするURL" value={location.origin + entryLink} onFocus={(e) => e.currentTarget.select()} className={cls(inputClass, 'break-all')} />
                  </div> : null}
                </Fold>
                <Fold title="1人ずつ入れる" className="border-slate-300">
                  {classList.length === 0
                    ? <div className="mb-4"><button type="button" onClick={() => setClassOptIn(true)} className={cls(btn.base, btn.outline, 'w-full sm:w-auto')}>クラスも入れる（{DEFAULT_CLASS_SETTINGS.upper.name}・{DEFAULT_CLASS_SETTINGS.lower.name}）</button></div>
                    : classOptIn && !rosterHasClass ? <OkLine className="mb-4">クラスを入れられます</OkLine> : null}
                  <FighterFields value={manual} config={entryConfig} prefix="manual" problems={manualProblems} fixes={manualFixes} classOptions={classList} classSettings={classSettings} weights={weights}
                    onClassChange={(v) => { setManual((old) => ({ ...old, fighterClass: v })); setManualNote(''); setManualDup(null); }}
                    onWeightChange={(d, w) => { setManual((old) => ({ ...old, division: d, weightClass: w })); setManualNote(''); setManualDup(null); }}
                    onChange={(k, v) => { setManual((old) => ({ ...old, [k]: v })); clearManualKey(k); setManualNote(''); setManualDup(null); }}
                    onBlurField={(k) => fixFieldOf(manual, k, setManual, setManualFixes, (fn) => setManualProblems(fn))} />
                  <button type="button" onClick={addManual} className={cls(btn.base, btn.outlineBig, 'mt-4 w-full sm:w-auto')}>この選手を追加</button>
                  {manualInvalidN ? <ErrorLine id="manual-errors" role="alert" className="mt-3">まちがい：{manualInvalidN}か所を直してください（「✕」がついた所）。</ErrorLine> : null}
                  {manualDup ? <Caution className="mt-3" role="status">同じ人がもういます（{manualDup.name}・{manualDup.gym}）。別の人なら「別の人として追加」を押します。
                    <span className="mt-2 flex"><button type="button" onClick={() => addFighterNow(manualDup)} className={cls(btn.base, btn.outlineBig)}>別の人として追加</button></span></Caution> : null}
                  {manualNote ? <OkLine className="mt-3">{manualNote}</OkLine> : null}
                </Fold>
              </div>
            </Fold>

            {/* 選手の一覧 */}
            <div>
              {nFighters === 0
                ? <Caution role="status">まだ0人です。上の「ファイルを選ぶ」から入れます。</Caution>
                : <div className="space-y-2">
                  <p className="tos-ok "><span aria-hidden="true">✓ </span>{nFighters}人 入っています（写真あり {withPhoto} / なし {nFighters - withPhoto}）</p>
                  {withPhoto < nFighters ? <Caution>写真がない人 {nFighters - withPhoto}人（写真は、あとでOKです）</Caution> : null}
                  {emptyW.length ? <Caution role="status">体重が入っていない人：{emptyW.length}人（{emptyW.slice(0, 3).map((f) => who(f)).join('、')}{emptyW.length > 3 ? ' ほか' : ''}）。体重がないと試合の体重差が出ません。
                    <span className="mt-2 flex"><button type="button" onClick={() => editFighter(emptyW[0].id, 'weight')} className={cls(btn.base, btn.outline)}>その人を直す</button></span></Caution> : null}
                  {unreadableW.length ? <Caution role="status">体重が読めない人：{unreadableW.length}人（{unreadableW.slice(0, 3).map((f) => who(f) + '「' + shorten(f.weight.trim(), 8) + '」').join('、')}{unreadableW.length > 3 ? ' ほか' : ''}）。10〜250の数字だけ（例：65）に直します。
                    <span className="mt-2 flex"><button type="button" onClick={() => editFighter(unreadableW[0].id, 'weight')} className={cls(btn.base, btn.outline)}>その人を直す</button></span></Caution> : null}
                  {swapped.length ? <Caution role="status">身長と体重を入れかえていませんか？：{swapped.length}人（{swapped.slice(0, 3).map((f) => who(f) + ' 身長' + shorten(f.height.trim(), 6) + '・体重' + shorten(f.weight.trim(), 6)).join('、')}{swapped.length > 3 ? ' ほか' : ''}）。ふつうは、身長（cm）のほうが体重（kg）より大きい数です。
                    <span className="mt-2 flex"><button type="button" onClick={() => editFighter(swapped[0].id, 'height')} className={cls(btn.base, btn.outline)}>その人を直す</button></span></Caution> : null}
                  {classIssues.blank.length + classIssues.unknown.length > 0 ? <Caution role="status">
                    クラスが入っていない／読めない人：{classIssues.blank.length + classIssues.unknown.length}人（{[...classIssues.blank, ...classIssues.unknown].slice(0, 3).map((f) => who(f)).join('、')}{classIssues.blank.length + classIssues.unknown.length > 3 ? ' ほか' : ''}）。クラスの入っていない人は、ちがうクラスの試合かどうか、確かめられません。
                    <span className="mt-2 flex"><button type="button" onClick={() => editFighter([...classIssues.blank, ...classIssues.unknown][0].id, 'fighterClass')} className={cls(btn.base, btn.outline)}>その人を直す</button></span></Caution> : null}
                  {weightIssues.blank.length + weightIssues.unknown.length > 0 ? <Caution id="weight-trouble" role="status">
                    区分・階級が入っていない／設定にない人：{weightIssues.blank.length + weightIssues.unknown.length}人（{[...weightIssues.blank, ...weightIssues.unknown].slice(0, 3).map((f) => who(f)).join('、')}{weightIssues.blank.length + weightIssues.unknown.length > 3 ? ' ほか' : ''}）。保存はできます。ただし、区分・階級がちがう試合かどうか、確かめられません。
                    <span className="mt-2 flex"><button type="button" onClick={() => editFighter([...weightIssues.blank, ...weightIssues.unknown][0].id, 'division')} className={cls(btn.base, btn.outline)}>その人を直す</button></span></Caution> : null}
                  {dupGroups.length ? <Caution role="status">
                    <span className="block">同じ名前とジムの人が{dupGroups.length}組います：{dupGroups.slice(0, 3).map(([, list]) => list[0].name + '（' + (list[0].gym || 'ジム名なし') + '・番号 ' + list.map((f) => shorten(f.id, 8)).join(' と ') + '）').join('、')}{dupGroups.length > 3 ? ' ほか' : ''}。同じ人なら、片方を「消す」で消します。</span>
                    <span className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setListPref(true); setQuery(''); pendingJump.current = { id: 'fighter-' + dupGroups[0][1][0].id }; setJumpTick((n) => n + 1); }} className={cls(btn.base, btn.outline)}>その人へ行く</button>
                      <button type="button" onClick={() => onAck('dupname:' + dupGroups[0][0])} className={cls(btn.base, btn.outline)}>別の人です（この注意を消す）</button>
                    </span>
                  </Caution> : null}
                  {longOnes.slice(0, 3).map(({ fighter, field, max }) => <div key={fighter.id + field} className="space-y-2">
                    <ErrorLine role={null}>{shorten(fighter.name, 12)}さんの{FIELD_LABEL[field]}が長すぎます（{max}文字まで・いま{String(fighter[field]).length}文字）：{shorten(String(fighter[field]), 20)}</ErrorLine>
                    <button type="button" onClick={() => editFighter(fighter.id, field)} className={cls(btn.base, btn.outline)}>長い人を直す</button>
                  </div>)}
                  {longOnes.length > 3 ? <Soft>ほかにも長い所がある人が{longOnes.length - 3}人います。1人ずつ直すと、次の人が出ます。</Soft> : null}
                </div>}
              {fighterNote ? <div id="fighter-note" tabIndex={-1} className="mt-3 space-y-2 outline-none">
                <OkLine>{fighterNote.split('\n')[0]}</OkLine>
                {fighterNote.includes('\n') ? <Caution role="note">{fighterNote.split('\n')[1]}</Caution> : null}
              </div> : null}
              {nFighters > 0 ? <div className="mt-3"><Fold title={'選手の一覧（' + nFighters + '人）'} open={listOpen} onToggle={setListPref}>
                {nFighters > 8 ? <div className="mb-3"><label htmlFor="fighter-filter" className="text-lg font-bold">名前やジムで探す</label><input id="fighter-filter" className={inputClass} value={query} placeholder="例：山田" autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
                  <Example className="mt-1"><code>山田</code>（漢字で、名字だけで探します。ひらがな・カタカナでも見つかります）</Example>
                  {q && shownFighters.length === 0 ? <Caution className="mt-2" role="status">「{query.trim()}」の人はいません。漢字で、名字だけで探します。
                    <span className="mt-2 flex"><button type="button" onClick={() => setQuery('')} className={cls(btn.base, btn.outline)}>全部見る</button></span></Caution> : null}
                </div> : null}
                {listOpen ? <div className="grid gap-3 sm:grid-cols-2">{shownFighters.map((fighter) => {
                  const editing = editingId === fighter.id;
                  const otherEditing = editDirty && !editing;
                  const photoHere = here === 'photo' && marker.id === fighter.id;
                  return <article key={fighter.id} id={'fighter-' + fighter.id} className={cls('min-w-0 scroll-mt-28 rounded-xl border-2 border-slate-300 bg-white p-3', editing ? 'sm:col-span-2' : '')}>
                    <div className="flex flex-wrap gap-3">
                      <div className="h-[96px] w-[96px] shrink-0 overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100">{fighter.photoDataUrl ? <img src={fighter.photoDataUrl} alt="" className="h-full w-full object-contain" /> : <span className="grid h-full place-items-center whitespace-nowrap px-1 text-center text-[17px] text-slate-700">写真なし</span>}</div>
                      <div className="min-w-[min(100%,9rem)] flex-1 break-words">
                        <p className="text-lg font-bold">{fighter.name}</p>
                        <p className="text-[17px] font-medium">{fighter.gym}</p>
                        {fighter.fighterClass ? <p className="mt-1 min-w-0"><Chip tone="slate">クラス：{fighter.fighterClass}</Chip></p> : null}
                        {weightTag(fighter) ? <p data-weight-chip="1" className="mt-1 min-w-0"><Chip tone="slate">区分・階級：{weightTag(fighter)}</Chip></p> : null}
                        <p className="text-[17px] font-medium">{kgText(fighter.weight)}{fighter.record ? '・' + fighter.record : ''}</p>
                        {fighter.absent ? <p data-absent-chip="1" className="mt-1"><Chip tone="rose">✕ 欠場</Chip></p> : null}
                        {!fighter.photoDataUrl ? <p className="mt-1"><Chip tone="slate">写真：あとでOK</Chip></p> : null}
                        {dupIds.has(fighter.id) ? <p className="mt-1"><Chip tone="amber">⚠ 同じ名前の人がいます</Chip></p> : null}
                      </div>
                    </div>
                    {editing ? <div className="mt-3 space-y-3 border-t-2 border-slate-200 pt-3">
                      <FighterFields value={draft} mode="edit" config={entryConfig} prefix={'edit-' + fighter.id} problems={editProblems} fixes={editFixes} classOptions={classList} classSettings={classSettings} weights={weights} alsoShow={(['grade', 'age', 'comment', 'musicUrl'] as const).filter((k) => String(fighter[k]).trim() !== '')}
                        onClassChange={(v) => setDraft((old) => ({ ...old, fighterClass: v }))}
                        onWeightChange={(d, w) => setDraft((old) => ({ ...old, division: d, weightClass: w }))}
                        onChange={(k, v) => { setDraft((old) => ({ ...old, [k]: v })); setEditFixes((old) => { if (!old[k]) return old; const next = { ...old }; delete next[k]; return next; }); }}
                        onBlurField={(k) => fixFieldOf(draft, k, setDraft, setEditFixes)} />
                      <div className="flex flex-wrap items-start gap-3">
                        <button type="button" aria-disabled={!!editFirst || undefined} onClick={applyEdit} className={cls(btn.base, btn.outlineBig, editFirst && 'tos-locked')}>この内容で直す</button>
                        <button type="button" onClick={() => { if (editDirty) setAsk({ kind: 'discard-edit', nonce: ++askSeq.current }); else { setEditingId(null); setEditFixes({}); } }} className={cls(btn.base, btn.outlineBig)}>やめる</button>
                      </div>
                      {editFirst ? <LockReason>{(editFirst.text.split('：')[0])}が まちがっています</LockReason> : null}
                      {ask?.kind === 'discard-edit' ? <DangerConfirm key={ask.nonce} yellow id="confirm-discard" label="確認：直した内容を消してやめるか" verdict="直した内容は消えます。" lines={['いま直した所が、もとにもどります']} safeLabel="続けて直す（何も消さない）" dangerLabel="直した内容を消す" onYes={answerYes} onNo={answerNo} /> : null}
                    </div> : <div className="mt-3 flex flex-wrap gap-2">
                      {photoHere || photoError?.id === fighter.id ? <p className="w-full text-lg font-bold">{fighter.name} さんの写真</p> : null}
                      <NextSlot active={photoHere} label={marker.label} className="w-full">
                        <label className={cls(btn.base, btn.outlineBig, 'cursor-pointer focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-700')}>
                          <span>{photoBusy === fighter.id ? '⏳ 読んでいます…' : fighter.photoDataUrl ? '写真を変える' : '写真を選ぶ'}</span>
                          <input type="file" accept="image/*" aria-label={(fighter.photoDataUrl ? '写真を変える ' : '写真を選ぶ ') + fighter.name} className="sr-only" onChange={(e) => void choosePhoto(e, fighter.id)} />
                        </label>
                      </NextSlot>
                      <button id={'edit-btn-' + fighter.id} type="button" aria-disabled={otherEditing || undefined} onClick={() => {
                        // 直している途中の入力があるうちは、ほかの人の「直す」を押しても、何もしない（途中の入力が消えないように）
                        if (otherEditing) { setOtherEditErr(fighter.id); return; }
                        editFighter(fighter.id, 'name');
                      }} aria-label={'直す ' + fighter.name} className={cls(btn.base, btn.outline)}>直す</button>
                      <button id={'absent-' + fighter.id} type="button" onClick={() => toggleAbsent(fighter.id)} aria-label={(fighter.absent ? '欠場をやめる ' : '欠場にする ') + fighter.name} className={cls(btn.base, btn.outline)}>{fighter.absent ? '欠場をやめる' : '欠場にする'}</button>
                      <button id={'remove-' + fighter.id} type="button" onClick={() => setAsk({ kind: 'remove', id: fighter.id, nonce: ++askSeq.current })} aria-label={'消す ' + fighter.name} className="tos-danger-btn inline-flex items-center justify-center text-center text-lg touch-manipulation"><span aria-hidden="true">✕ </span>消す：{shorten(fighter.name, 12)}</button>
                    </div>}
                    {otherEditErr === fighter.id && !editing ? <div className="mt-2 space-y-2">
                      <ErrorLine role="status">先に、いま直している人の「この内容で直す」か「やめる」を押す。</ErrorLine>
                      {editingId ? <button type="button" onClick={() => jump('fighter-' + editingId)} className={cls(btn.base, btn.outline)}>直している人へ</button> : null}
                    </div> : null}
                    {ask?.kind === 'remove' && ask.id === fighter.id ? <DangerConfirm key={ask.nonce} yellow id={'confirm-remove-' + fighter.id} label={'確認：' + fighter.name + 'さんを消すか'} verdict={fighter.name + 'さんを消します。'}
                      lines={data.bouts.flatMap((bout, index) => bout.redId === fighter.id || bout.blueId === fighter.id ? ['第' + (index + 1) + '試合の' + (bout.redId === fighter.id ? '赤' : '青') + 'コーナーが空になります'] : [])}
                      safeLabel="やめる" dangerLabel="✕ 消す（もどせません）" onYes={answerYes} onNo={answerNo} /> : null}
                    {photoError?.id === fighter.id ? <ErrorLine role="status" className="mt-2">{photoError.text}</ErrorLine> : null}
                    {photoOk?.id === fighter.id ? <OkLine className="mt-2">{photoOk.name}さんの写真を入れました</OkLine> : null}
                    {editNote?.id === fighter.id && !editing ? <div id={'edit-note-' + fighter.id} tabIndex={-1} className="outline-none"><OkLine className="mt-2">直しました{editNote.text ? '（' + editNote.text + '）' : ''}</OkLine></div> : null}
                  </article>;
                })}</div> : null}
              </Fold></div> : null}
            </div>
          </Section>

          {/* ───── 3 ───── */}
          <Section id="sec-3" title="3. 対戦カードを作る" done={done3} doneText={'試合 ' + (nonBlank === 0 ? 'なし' : nonBlank + 'つ')}>
            <p className="max-w-[38em] font-medium">対戦カードは、だれとだれが戦うかを決めた表です。1試合が、カード1枚です。</p>
            <ol className="max-w-[38em] list-none space-y-1 pl-0 font-medium">
              <li><StepNo n={1} />下の「＋ 試合を追加」を押す</li>
              <li><StepNo n={2} />赤コーナーの選手を選ぶ</li>
              <li><StepNo n={3} />青コーナーの選手を選ぶ</li>
            </ol>
            <p className="max-w-[38em] font-medium">赤コーナー・青コーナーは、リングの2つの角の名前です。どちらを赤にしてもかまいません。</p>
            <Example>第1試合　赤＝山田 太郎（60kg） 対 青＝佐藤 次郎（61kg）</Example>
            <Soft>試合は、上から順に行います。順番を変えるときは、「↑ 上へ」「↓ 下へ」を押します。</Soft>
            <p className="text-lg font-bold">試合 {nonBlank === 0 ? 'なし' : nonBlank + 'つ'} ／ 選手{nFighters}人のうち、試合に入っている人 {placedCount}人</p>
            {moreBoutsNote}
            {removedN > 0 ? <div><button type="button" onClick={() => undoRemoveRef.current()} className={cls(btn.base, btn.outline)}>{UNDO_REMOVE}</button></div> : null}
            {ask?.kind === 'move' ? <DangerConfirm key={ask.nonce} yellow id="confirm-move" label="確認：いまの試合を動かすか" verdict="いま試合当日の画面に出ている試合です。動かすと進みがずれます。" lines={['試合当日の画面の「いまの試合」がずれます']} safeLabel="やめる（何も変えない）" dangerLabel="動かす" onYes={answerYes} onNo={answerNo} /> : null}

            {unplaced.length > 0 && data.bouts.length > 0 ? <div className="space-y-2 rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
              <p className="font-bold">まだ試合に入っていない選手 {unplaced.length}人</p>
              <p className="text-[17px] font-medium">名前を押すと、空いている赤か青に入ります。</p>
              <Soft>押すと → {spot ? '第' + (spot.index + 1) + '試合の' + sideWord(spot.side) + 'コーナーに入ります' : '新しい試合の赤コーナーに入ります'}</Soft>
              <ul className="flex list-none flex-wrap gap-2 p-0">{unplaced.map((fighter) => <li key={fighter.id} className="min-w-0"><button type="button" onClick={() => placeFighter(fighter)} className={cls(btn.base, btn.outline, 'max-w-full')}>{fighter.name}</button></li>)}</ul>
            </div> : null}
            {placeNote ? <div className="space-y-2">
              <OkLine>第{placeNote.index + 1}試合の{sideWord(placeNote.side)}に入れました</OkLine>
              <Caution role="note">違うなら、第{placeNote.index + 1}試合の{sideWord(placeNote.side)}を選び直す。</Caution>
            </div> : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
              <div className="min-w-0">
                <NextSlot id="add-bout-slot" active={here === 'add-bout'} label={marker.label}>
                  <button id="add-bout" type="button" aria-disabled={nFighters < 2 || undefined} onClick={addBout} className={cls(btn.base, btn.outlineBig, 'w-full scroll-mt-28 sm:w-auto sm:min-w-[14rem]', nFighters < 2 && 'tos-locked', target === 'add-bout' && 'tos-target')}>＋ 試合を追加</button>
                </NextSlot>
                {nFighters < 2 ? <div className="mt-2"><LockReason>選手が2人以上になると押せます（いま{nFighters}人）</LockReason></div> : null}
                {blankAsk !== null && data.bouts[blankAsk] && isBlankBout(data.bouts[blankAsk]) ? <Caution className="mt-2" role="status">空の試合がもうあります。先に、第{blankAsk + 1}試合の赤と青を選びます。</Caution> : null}
              </div>
              {unplaced.length >= 2 ? <div className="min-w-0 space-y-2">
                <Caution role="note">おすすめは、コンピューターが作った下書き（案）です。使う前に、1つずつ見てください。</Caution>
                <button type="button" onClick={makeSuggestion} className={cls(btn.base, btn.outlineBig, 'text-balance')}>おすすめの組み合わせを自動で作る</button>
                <Soft>体重が近い人どうしを、2人ずつ組みます（体重差5kg以内に同じクラスの人がいれば、その人を先に）。{unplaced.some((fighter) => weightTag(fighter) !== '') ? '区分・階級が入っている人は、同じ区分・階級の人も先に探します。' : ''}まだ試合に入っていない人を、まとめて組みます。</Soft>
              </div> : null}
            </div>
            {suggestNote ? <div className="space-y-2">
              <Notice kind={suggestNote.kind} onClose={() => setSuggestNote(null)}>{suggestNote.text}{canUndoSuggestion ? '気に入らないときは「案を全部消す」を押します。' : ''}</Notice>
              {suggestNote.noPartner ? <Caution role="note">相手がいません：{suggestNote.noPartner}（体重差が10kg以上になるので、案に入れていません）</Caution> : null}
              {suggestNote.classMix?.length ? <div className="space-y-2">
                <ErrorLine role="status" mark="⚠ ">クラスがちがう組が{suggestNote.classMix.length}つあります（{suggestNote.classMix.map((i) => '第' + (i + 1)).join('・')}試合）。ルールがちがうので、ふつうは同じクラスの人どうしで組みます。</ErrorLine>
                <button type="button" onClick={() => jump('bout-' + (suggestNote.classMix?.[0] ?? 0))} className={cls(btn.base, btn.outline)}>クラスがちがう試合へ</button>
              </div> : null}
              {suggestNote.weightMix?.length ? <div id="suggest-weight-mix" className="space-y-2">
                <ErrorLine role="status" mark="⚠ ">{weightMixText(suggestNote.weightMix)}</ErrorLine>
                <button type="button" onClick={() => jump('bout-' + (suggestNote.weightMix?.[0] ?? 0))} className={cls(btn.base, btn.outline)}>区分・階級がちがう試合へ</button>
              </div> : null}
              {suggestNote.wide.length ? <div className="space-y-2">
                <Caution role="status">体重差が5kg以上の組が{suggestNote.wide.length}つあります（{suggestNote.wide.map((i) => '第' + (i + 1)).join('・')}試合）。少し差があります。心配なときは、選び直します。</Caution>
                <button type="button" onClick={() => jump('bout-' + suggestNote.wide[0])} className={cls(btn.base, btn.outline)}>その試合へ</button>
              </div> : null}
              {canUndoSuggestion ? <div className="space-y-2">
                <NextSlot active={here === 'review'} label={marker.label}>
                  <button type="button" onClick={() => {
                    // 案は1つずつ見る：押すたびに、黄色が次の案へ移る。最後の案を見たら、黄色は次の仕事（保存）へ進む
                    const total = suggestNote.ids.length;
                    const at = data.bouts.findIndex((bout) => bout.id === suggestNote.ids[Math.min(reviewN, total - 1)]);
                    setFollow(reviewN + 1 >= total ? null : { kind: 'review', n: reviewN + 1 });
                    jump('bout-' + Math.max(0, at));
                  }} className={cls(btn.base, btn.outlineBig)}>{reviewN + 1}つ目の案を見る</button>
                </NextSlot>
                <button type="button" onClick={undoSuggestion} className="tos-danger-btn inline-flex items-center justify-center text-center text-lg touch-manipulation">案を全部消す（この案を取り消す）</button>
              </div> : null}
            </div> : null}

            {data.bouts.length === 0
              ? <p className="rounded-2xl border-2 border-dashed border-slate-400 bg-white p-5 text-center font-bold">まだ試合がありません。「＋ 試合を追加」を押します。</p>
              : <>
                <div>
                  <p className="font-bold">試合の一覧（押すと、その試合に移ります）</p>
                  {rosterHasClass && classSettings ? <p className="mt-1 text-[17px] font-medium">{classLegend(classSettings)}</p> : null}
                  <ul className="mt-2 list-none space-y-1 p-0">{data.bouts.map((bout, index) => {
                    const red = byId.get(bout.redId), blue = byId.get(bout.blueId), kg = contractKg(red, blue);
                    const classMix = classMixAt(bout), wMix = weightMix(bout);
                    return <li key={bout.id}><button type="button" onClick={() => jump('bout-' + index)} className="flex min-h-12 w-full min-w-0 items-center gap-2 rounded-lg border-2 border-slate-300 bg-white px-3 py-1 text-left text-[17px] font-medium break-words">
                      <b className="shrink-0">第{index + 1}試合</b>
                      <span className="min-w-0 flex-1 break-words">{red?.name ?? '（赤まだ）'} vs {blue?.name ?? '（青まだ）'}{kg ? ' ・' + kg : ''}{classMix ? ' ⚠ クラスがちがいます' : ''}{wMix ? ' ⚠ 区分・階級がちがいます' : ''}</span>
                    </button></li>;
                  })}</ul>
                </div>
                <div className="space-y-4">{data.bouts.map((bout, index) => <BoutCard key={bout.id} bout={bout} index={index} total={data.bouts.length} fighters={data.fighters} groups={groups} byId={byId} placed={placed} bouts={data.bouts}
                  isCurrent={data.currentBout > 0 && index === data.currentBout} isSuggested={suggested.has(bout.id)} ruleCopied={ruleCopiedId === bout.id}
                  nextSide={here === 'bout' && marker.index === index ? marker.side ?? null : null} nextLabel={marker.label} acks={acks} targetId={target} dupIds={dupIds} classSettings={classSettings} classesOn={classesOn} onEditClass={onEditClass} onPatch={onPatch} onMove={onMove} onRemove={onRemove} onAck={onAck} onFocusSide={onFocusSide} onEditWeight={onEditWeight} />)}</div>
              </>}
          </Section>

          {/* ───── 4 ───── */}
          <Section id="sec-4" title="4. 保存して開く" done={done4}>
            <p className="max-w-[38em] font-medium">ここは、さいごの確認です。下のボタンで保存して、試合当日の画面を開きます。</p>
            <p className="max-w-[38em] text-[17px] font-medium text-slate-800">試合当日の画面＝選手の名前・写真・体重を、大きく映す画面です。開いても、試合は始まりません。</p>
            <ul className="grid list-none gap-2 p-0 sm:grid-cols-2">{([
              // 5つ目: あとでOK（なくても進める）の行。足りなくても、赤にしない。まだ何も試していないうちは、「まだ」も赤にしない（灰色）
              ['大会の名前', titleReal, 'field-title', false],
              ['日にち', dateOk && !datePast, 'field-date', true],
              ['選手 ' + nFighters + '人', nFighters >= 2, 'sec-2', false],
              [nFighters === 0 ? '写真' : '写真 ' + withPhoto + '/' + nFighters, nFighters > 0 && withPhoto === nFighters, 'sec-2', true],
              ['試合 ' + (nonBlank === 0 ? 'なし' : nonBlank + 'つ'), nonBlank >= 1 && boutIssues.length === 0, 'sec-3', false],
              ['保存', everSaved && !dirty, '', false],
            ] as const).map(([label, ok, goto, later]) => {
              // 赤は、その行そのものがうまくいかなかったときだけ（名前は、欄から出たあと。試合・保存は、「開く」や保存がうまくいかなかったあと）。ふつうの「まだ」は灰色
              const red = !ok && !later && (label === '大会の名前' ? titleTried : (!!openError || saveState === 'failed' || conflict));
              // 日にちが過ぎているときは、緑の ✓ にしない（年のまちがいかもしれない）。黄色の「⚠ 過ぎています」
              const pastRow = label === '日にち' && datePast;
              const markText = pastRow ? '⚠ 過ぎています' : ok ? '✓' : later ? 'あとでOK' : red ? '✕ まだ' : '○ まだ';
              const tone = cls('flex min-h-12 items-center justify-between gap-2 rounded-xl border-2 px-3 text-lg font-bold', pastRow ? 'border-[#a16207] bg-[#fefce8] text-[#1c1917]' : ok ? 'border-[#166534] bg-[#f0fdf4] text-[#166534]' : red ? 'border-[#b91c1c] bg-[#fef2f2] text-[#991b1b]' : 'border-slate-400 bg-slate-100 text-slate-900');
              return <li key={label}>{goto
                ? <a href={'#' + goto} onClick={(e) => { e.preventDefault(); jump(goto); }} className={tone}><span>{label}</span><span>{markText}</span></a>
                : <div className={tone}><span>{label}</span><span>{markText}</span></div>}</li>;
            })}</ul>
            {nFighters > 0 && withPhoto === 0 ? <Caution>写真がないと、試合当日の画面に顔が出ません。</Caution> : null}
            {problemCount > 0 ? <div className="rounded-xl border-2 border-[#b91c1c] bg-[#fef2f2] p-3">
              <p className="tos-danger "><span aria-hidden="true">✕ </span>直すところ</p>
              <ul className="mt-2 list-none space-y-2 p-0">
                {titleMissing ? <li className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1">大会の名前が入っていません。</span><button type="button" onClick={() => goTarget('field-title')} className={cls(btn.base, btn.outline)}>名前の欄へ</button></li> : null}
                {boutIssues.map((issue) => <li key={issue.index + issue.side} className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-words">{issue.text}</span><button type="button" onClick={() => jump('bout-' + issue.index + (issue.side === 'blue' ? '-blue' : '-red'))} className={cls(btn.base, btn.outline)}>第{issue.index + 1}試合へ</button></li>)}
                {otherCore ? <li>データのどこかが正しくありません。画面を読み込み直しても直らないときは、この大会の作り方を知っている人に聞いてください。</li> : null}
              </ul>
            </div> : null}
            {warnCount > 0 ? <Caution><span className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">気をつけたいところが{warnCount}つあります。保存はできます。ただし、試合の前に、1つずつ確かめてください（体重差が大きい試合・クラスがちがう試合{data.bouts.some(weightMix) ? '・区分や階級がちがう試合' : ''}{data.fighters.some((f) => f.absent === true) ? '・欠場の選手が入っている試合' : ''}など）。</span>
              {firstWarn >= 0 ? <button type="button" onClick={() => jump('bout-' + firstWarn)} className={cls(btn.base, btn.outline)}>見直す：第{firstWarn + 1}試合へ</button> : null}
            </span></Caution> : null}
            {done4 ? <div className="space-y-3 rounded-2xl border-2 border-[#166534] bg-[#f0fdf4] p-4">
              <p className="text-2xl font-bold text-[#166534]"><span aria-hidden="true">✓ </span>じゅんび OK</p>
              <p className="max-w-[38em] font-medium">試合当日は、このパソコンで「試合当日の画面を開く」を押します。</p>
              {data.currentBout > 0 ? <div className="space-y-2">
                <p className="tos-danger "><span aria-hidden="true">✕ </span>本番の途中なら押さない。</p>
                <p className="text-[17px] font-medium">リハーサルのあとは、これを押すと、試合当日の画面が第1試合から始まります。</p>
                <button id="rewind-btn" type="button" onClick={() => setAsk({ kind: 'rewind', nonce: ++askSeq.current })} className="tos-danger-btn inline-flex items-center justify-center text-center text-lg touch-manipulation">試合当日の画面を第1試合にもどす</button>
                {rewindBox}
              </div> : null}
              {rewound && data.currentBout === 0 ? <OkLine>もどしました。保存すると、試合当日の画面も第1試合になります。</OkLine> : null}
            </div> : null}
            {missingW.length > 0 && nonBlank > 0 ? <Caution role="note">{emptyW.length > 0 ? '体重が入っていない人が' + emptyW.length + '人います。' : ''}{missingW.length - emptyW.length > 0 ? '体重が読めない人が' + (missingW.length - emptyW.length) + '人います。' : ''}試合当日の画面に「契約体重」が出ません。</Caution> : null}
            {openError ? <ErrorLine role="status">{openError}</ErrorLine> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <button type="button" aria-disabled={saveState === 'saving' || undefined} onClick={() => { if (conflict) { jump('conflict-box'); return; } void save(); }} className={cls(btn.base, btn.outlineBig, 'w-full', (saveState === 'saving' || conflict) && 'tos-locked')}>ここまでを保存する</button>
                {saveState === 'saving' ? <LockReason>保存しています。終わるまで押せません</LockReason> : conflict ? <LockReason>先に、上の「👉 次はここ」の箱に答えます</LockReason> : null}
              </div>
              <div className="space-y-1">
                <button type="button" aria-disabled={!canOpen || undefined} onClick={() => { void openLive(); }} className={cls(btn.base, btn.outlineBig, 'w-full', !canOpen && 'tos-locked')}>試合当日の画面を開く</button>
                {!canOpen ? <LockReason>{openWhy}</LockReason> : null}
              </div>
              <div className="space-y-1">
                <button id="open-sheet" type="button" aria-disabled={nonBlank === 0 || undefined} onClick={() => { void openSheet(); }} className={cls(btn.base, btn.outlineBig, 'w-full', nonBlank === 0 && 'tos-locked')}>A3の対戦一覧表をつくる</button>
                {nonBlank === 0 ? <LockReason>先に、対戦カードを作ります</LockReason> : <Soft>掲示用の一覧表です。印刷・PDFにできます。保存した内容から作ります（保存していないときは、先に保存します）。</Soft>}
              </div>
            </div>
            {openedNote ? <OkLine>開きました。この画面はそのまま閉じずに残します。</OkLine> : null}
            {!dateOk ? <p className="max-w-[38em] text-[17px] font-bold text-slate-900">日にちが空でも開けます。</p> : null}
            {canOpen ? <p className="max-w-[38em] text-[17px] font-medium">{VIEW_WINDOW_NOTE}（新しい画面が開かない設定のときは、この画面で開きます。戻るには、画面の「戻る」ボタン（←）を押します。）</p> : null}
          </Section>

          {emptyLayout ? <>
            {backupJump}
            {googleBox}
            {chooseFirst ? null : otherFold}
          </> : null}

          {/* ───── コピーのファイル（別のパソコンへ移す・こわれたとき） ───── */}
          <Fold id="backup" title={<span>コピーのファイルを作る・戻す{backupAt ? <> {backupStale ? <Chip tone="amber">⚠ 前のコピーのあとで変更あり（コピー {clockText(backupAt)}）</Chip> : <Chip tone="green">✓ コピー作成ずみ {clockText(backupAt)}</Chip>}</> : <> <Chip tone="slate">別のパソコンに移すときは必要</Chip></>}</span>} open={backupOpen} onToggle={setBackupOpen} className="border-slate-300">
            <p className="max-w-[38em] font-medium">別のパソコンに移すときと、パソコンがこわれたときに使います。名簿・写真・対戦カード・書いてもらうことの設定が入ります。Googleの受付の設定は入りません。</p>
            <p className="tos-danger  mt-2 max-w-[38em] text-lg"><span aria-hidden="true">✕ </span>このパスワードを忘れると戻せません。紙にも書いてください。</p>
            <NextSlot active={here === 'pw'} label={marker.label} className="mt-4 max-w-md">
              <div className="max-w-md">
                <label htmlFor="backup-password" className="text-lg font-bold">パスワード（作るときも、戻すときも、この欄を使います）</label>
                <input id="backup-password" type={showPassword ? 'text' : 'password'} className={inputClass} value={password} placeholder="10文字以上のパスワード" autoComplete="new-password" onChange={(e) => { setPassword(e.target.value); setPaperDone(false); setBlockedMsg(''); setFollow((old) => old?.kind === 'pw' ? null : old); }} />
                <Soft className="mt-1">半角の英数字で、10文字以上にします。</Soft>
                <Example className="mt-1"><code>hanabi2027x</code>（あなたの言葉に変えます）</Example>
                <p className={cls('mt-1 text-[17px] font-bold', pwNorm.length >= 10 ? 'text-[#166534]' : 'text-slate-800')}>{pwNorm.length}/10文字{pwNorm.length >= 10 ? ' ✓' : ''}</p>
                {pwFixed ? <OkLine quiet className="mt-1">全角と空白は半角に直して使います。</OkLine> : null}
                <div className="mt-2"><button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} className={cls(btn.base, btn.outline)}>{showPassword ? '文字をかくす' : '文字を見る'}</button></div>
              </div>
            </NextSlot>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-3 rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
                <p className="text-lg font-bold">コピーを作る</p>
                <div>
                  <label htmlFor="backup-password2" className="text-lg font-bold">同じパスワードをもう一度</label><Badge />
                  <input id="backup-password2" type={showPassword ? 'text' : 'password'} className={cls(inputClass, password2 && normalizePassword(password2) !== pwNorm && 'tos-input-error')} value={password2} placeholder="もう一度、同じものを入れる" autoComplete="new-password" onChange={(e) => { setPassword2(e.target.value); setBlockedMsg(''); }} />
                  {password2 ? (normalizePassword(password2) === pwNorm ? <OkLine quiet className="mt-1">同じです</OkLine> : <ErrorLine id="pw2-error" role={null} className="mt-1">パスワードが同じではありません（上と同じものを入れる）</ErrorLine>) : <Soft className="mt-1">入れると、打ち間違いを防げます。入れなくても、コピーは作れます。</Soft>}
                </div>
                <Caution role="note">
                  <label htmlFor="paper-done" className="flex min-h-12 cursor-pointer items-center gap-3 text-lg font-bold">
                    <input id="paper-done" type="checkbox" checked={paperDone} onChange={(e) => { setPaperDone(e.target.checked); setBlockedMsg(''); }} className="h-6 w-6 shrink-0 accent-slate-900" />
                    <span>紙に書きました</span>
                  </label>
                  <span className="block text-[17px] font-medium">パスワードを紙に書いたら、チェックを入れます。</span>
                </Caution>
                {blockedMsg ? <ErrorLine role="status">{blockedMsg}</ErrorLine> : null}
                <button type="button" aria-disabled={!!copyLockedWhy || backupBusy || justMade || undefined} aria-describedby={copyLockedWhy || backupBusy || justMade ? 'copy-lock-why' : undefined} onClick={() => void download()} className={cls(btn.base, btn.outlineBig, 'w-full', (copyLockedWhy || backupBusy || justMade) && 'tos-locked')}>{backupBusy ? '作っています…' : 'パスワードをつけて、コピーを保存する'}</button>
                {copyLockedWhy ? <LockReason id="copy-lock-why">押せません：{copyLockedWhy}</LockReason> : backupBusy ? <LockReason id="copy-lock-why">作っています。終わるまで押せません</LockReason> : justMade ? <LockReason id="copy-lock-why">作りました。少し待ちます</LockReason> : null}
              </div>
              <div className="min-w-0 rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
                <p className="text-lg font-bold">コピーのファイルから戻す</p>
                <ol className="mt-1 max-w-[38em] list-none space-y-1 pl-0 text-[17px] font-medium">
                  <li>1 上のパスワードを入れる（ファイルを作ったときのもの）</li>
                  <li>2 下の「コピーのファイルから戻す」を押して、ファイルを選ぶ</li>
                </ol>
                <label onClick={(e) => { if (restoreLocked) e.preventDefault(); }} className={cls(btn.base, btn.outlineBig, 'mt-3 w-full cursor-pointer focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-700', restoreLocked && 'tos-locked')}>
                  <span>コピーのファイルから戻す</span>
                  <input id="restore-file" type="file" accept=".enc" aria-disabled={restoreLocked || undefined} aria-describedby={restoreLocked ? 'restore-lock-why' : undefined} onClick={(e) => { if (restoreLocked) e.preventDefault(); }} className="sr-only" onChange={onPickBackup} />
                </label>
                {restoreLocked ? <LockReason id="restore-lock-why">押せません：先に、上のパスワードを入れてください</LockReason> : null}
                {ask?.kind === 'restore-new' ? <DangerConfirm key={ask.nonce} yellow id="confirm-restore-new" label="確認：コピーの大会をこのパソコンに入れるか" tone="plain" head="戻す"
                  {...restoreBoxText({ restored: ask.restored, current: data, dirty: false, everSaved: false })} safeLabel="やめる（何も変えない）" dangerLabel="コピーの大会を入れる（なくなるものはありません）" note="下のボタンを押すまで、何も変わりません。押すと、その大会が開きます。" onYes={answerYes} onNo={answerNo}>
                  {oldCopyText(ask.restored.updatedAt, Date.now()) ? <Caution className="mt-2" role="note">{oldCopyText(ask.restored.updatedAt, Date.now())}。</Caution> : null}
                </DangerConfirm> : null}
                {ask?.kind === 'restore' ? <DangerConfirm key={ask.nonce} yellow id="confirm-restore" label="確認：コピーのファイルから戻すか" {...restoreBoxText({ restored: ask.restored, current: data, dirty, everSaved })} safeLabel="やめる（何も変えない）" dangerLabel="今の内容を消して、コピーに戻す" head="消える" note={everSaved ? '下のボタンを押すまで、何も変わりません。戻したあとも、このページを開いている間は「元にもどす」で戻せます。' : undefined} onYes={answerYes} onNo={answerNo}>
                  {oldCopyText(ask.restored.updatedAt, Date.now()) ? <Caution className="mt-2" role="note">{oldCopyText(ask.restored.updatedAt, Date.now())}。</Caution> : null}
                </DangerConfirm> : null}
              </div>
            </div>
            {msg && msg.area === 'backup' ? <div className="mt-4 space-y-2">
              <Notice kind={msg.kind} action={msg.tag === 'undo-restore' && dirty ? undefined : msg.action} onClose={() => setMsg(null)} extra={msg.extra}>{msg.text}</Notice>
              {msg.tag === 'backup-made' ? <>
                <p className="tos-danger "><span aria-hidden="true">✕ </span>パスワードは紙に。忘れると戻せません。</p>
                <Caution role="note">ダウンロードの中のファイルを、USBメモリにも入れておく。</Caution>
              </> : null}
              {msg.tag === 'undo-restore' ? <p className="tos-danger "><span aria-hidden="true">✕ </span>元にもどせるのは、この画面を閉じるまで。</p> : null}
            </div> : null}
          </Fold>
          </div>
        </div>
      </div>
    </div>

    {/* ───── 画面の下にくっつく帯。状態ラインは1か所。塗りのボタンは、いまやることの1つだけ ───── */}
    {/* ボタンを押した瞬間に入力欄から外れても、帯の中身が入れ替わらないよう、押す前のフォーカスを動かさない */}
    <div ref={barRef} data-bar-tight={barTight ? '1' : undefined} onMouseDown={(e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }} className={cls('fixed inset-x-0 bottom-0 z-40 w-full [overflow-wrap:anywhere] border-t-2 border-slate-400 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.12)]', barTight && '[&_.tos-bar-note]:hidden [&_.tos-bar-hint]:hidden [&_p[role=note]]:hidden [&_#save-state:not(.sr-only)]:sr-only')}>
      <div className={cls('mx-auto max-w-6xl px-4 pt-2', failCopyFirst && LOW_ROW)}>
        {msg && msg.area !== 'backup' ? <div className={cls('pb-2 lg:pl-[16.5rem]', failCopyFirst && LOW_NOTE)}><div className="max-w-4xl"><Notice compact inlineClose={failShown} closeClass={failShown ? COMPACT_HIDE : ''} live={msg.area === 'save' ? 'off' : undefined} kind={msg.kind} action={failShown ? undefined : msg.action} onClose={msg.kind === 'ok' && msg.area === 'save' ? undefined : () => setMsg(null)} extra={msg.extra}
          lead={failShown ? <><span id="save-state" tabIndex={-1} aria-live="off" className="sr-only">保存失敗</span>{failStreak < 2 ? <span aria-hidden="true">失敗：</span> : null}</> : undefined}>
          {/* せまい画面（幅360px以下・高さ500px以下）では、知らせは1文だけ。「もう一度 保存する」は文の中に入れ、黄色のボタンは1つだけ残す */}
          {failShown && failCopyFirst ? <>
            <span className={COMPACT_HIDE}>{msg.text}</span>
            <span className={COMPACT_SHOW}>{(saveReasonShort(failKind) || 'くわしい理由はわかりません') + '。このページを閉じると消えます。'} <button type="button" onClick={() => { void save(); }} style={{ minHeight: '44px' }} className={cls(btn.base, btn.outline, 'mt-1 px-2')}>もう一度 保存する</button></span>
          </> : msg.text}</Notice></div></div> : null}
        <div className={cls('tos-bar-grid lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-center lg:gap-6', failCopyFirst && LOW_GRID)}>
          {/* 失敗のときは、状態ライン（保存失敗）を知らせの中に入れ、「コピーのファイルを作る」を黄色の枠で1行に置く（帯が高くならず、いつも見える） */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {!failShown ? <p id="save-state" tabIndex={-1} aria-live="off" className={cls('text-lg font-bold leading-snug', lineTone, saveShownAbove && 'sr-only')}>{line.text}</p> : null}
            {failShown && msg?.action ? <NextSlot active={here === 'bar-copy'} label="" tight row style={BAR_FRAME} className="max-[361px]:flex-nowrap!">
              <button type="button" onClick={msg.action.onClick} style={{ padding: '0 8px', fontSize: '17px', minHeight: '48px' }} className={cls(btn.base, btn.primary, 'max-[361px]:min-w-0 max-[361px]:flex-1')}>{msg.action.label}</button>
            </NextSlot> : null}
          </div>
          <div className={cls('mt-1 max-w-4xl lg:mt-0', failCopyFirst && COMPACT_HIDE)}>
            <NextSlot active={here === 'bar'} label={marker.label} tight style={BAR_FRAME}>
              {here === 'bar' && na.kind === 'save' && saveState === 'idle' && dirty && !keyboardUp ? <p className="tos-danger tos-bar-hint mb-1 text-[17px]"><span aria-hidden="true">✕ </span>保存しないと、閉じたら消えます。</p> : null}
              {!keyboardUp ? <div className={cls('flex items-stretch gap-2', lockedByAsk && ASK_LOW_HIDE)}>
                <button type="button" aria-disabled={barDisabled || undefined} onClick={onBarPrimary} style={failShown ? { minHeight: '48px' } : undefined} className={cls(btn.base, failCopyFirst || key === 'done' ? btn.outlineBig : btn.primary, 'min-w-0 flex-1 text-balance text-lg [word-break:keep-all] sm:text-xl', lockedByAsk && 'tos-locked', failCopyFirst && COMPACT_HIDE)}>{barLabel}</button>
                {showSecondarySave ? <button type="button" onClick={() => { void save(); }} className={cls(btn.base, btn.outlineBig, 'shrink-0')}>保存する</button> : null}
              </div> : na.kind !== 'conflict' ? <button type="button" aria-disabled={saveState === 'saving' || undefined} onClick={() => { void save(); }} className={cls(btn.base, btn.outline, 'w-full sm:w-auto')}>保存</button> : null}
            </NextSlot>
            {lockedByAsk ? <LockReason className={ASK_LOW_HIDE}>先に、確認の箱に答えます</LockReason> : null}
            {key === 'done' && !keyboardUp && !lockedByAsk ? <p className="tos-ok mt-1" role="status"><span aria-hidden="true">✓ </span>開きました（別のタブ）。もう一度押すと、もう1つ開きます。</p> : null}
            {justSavedNote && na.kind === 'open' ? <p role="status" className="tos-bar-note mt-1 text-[17px] font-bold text-slate-800">いま保存しました。もう一度、「{barLabel}」を押します。</p> : null}
            {!keyboardUp && na.kind === 'save' && saveState === 'idle' && !lockedByAsk && here === 'bar' && !dirty ? <p className="tos-bar-note  mt-1 text-[17px] font-medium text-slate-800">保存すると、このパソコンの中に残ります。</p> : null}
            {!keyboardUp && !barIsSave && here !== 'none' && !lockedByAsk ? <p className="tos-bar-note  mt-1 text-[17px] font-medium text-slate-800">↑ 「👉 次はここ」と書いてある所へ行きます</p> : null}
          </div>
        </div>
      </div>
    </div>
    {/* 確認の箱に答えた直後の0.7秒だけ、画面全体を覆う（見えない）。ダブルクリックの2回目が、箱が消えて動いたあとの別のボタンを押さないように */}
    {shield ? <div aria-hidden="true" data-tos-shield="1" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 70 }} /> : null}
  </main>
  {/* 読み上げ専用（見えない）。保存の結果は、ここで1回だけ読む。見える知らせと状態ラインは読み上げない。<main> の外に置くので、画面の文字の数には入らない */}
  <span id="save-announce" aria-live="polite" aria-atomic="true" className="sr-only">{announce}</span>
  </>;
}

/** 下の帯の中の黄色の枠は、すき間を小さくする（帯が高くなりすぎないように） */
/** せまい画面（幅360px以下・高さ500px以下）でだけ、しまう／出す（下の帯を低くするため） */
const COMPACT_HIDE = 'max-[361px]:hidden [@media(max-height:500px)]:hidden';
/** 低い画面（高さ500px以下）で保存に失敗したとき：知らせと黄色の枠を、横に並べる（帯が高くならないように） */
const LOW_ROW = '[@media(max-height:500px)]:flex [@media(max-height:500px)]:items-start [@media(max-height:500px)]:gap-3';
const LOW_NOTE = '[@media(max-height:500px)]:min-w-0 [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:pb-0';
const LOW_GRID = '[@media(max-height:500px)]:flex-none';
/** 低い画面（高さ500px以下）で確認の箱が開いている間は、帯の押せない大きいボタンと、その理由をしまう（箱の文と2つのボタンが、帯の上に全部見えるように。答えるのは、箱の中のボタン） */
const ASK_LOW_HIDE = '[@media(max-height:500px)]:hidden';
const COMPACT_SHOW = 'hidden max-[361px]:inline [@media(max-height:500px)]:inline';
const BAR_FRAME = { padding: '4px 6px', borderWidth: '3px', borderRadius: '12px', boxShadow: 'none' } as const;

/** 1つも入れていない手入力フォームか（二度押しで同じ説明が出続けないように） */
function isBlankFighterFormLocal(f: LocalFighter): boolean {
  return (['name', 'gym', 'grade', 'age', 'height', 'weight', 'record', 'comment', 'musicUrl'] as const).every((key) => !f[key].trim());
}

/** 別の画面の内容を使う前の確認の箱 */
function ConfirmOther({ ask, data, onYes, onNo }: { ask: Extract<Ask, { kind: 'other' }>; data: LocalTournament; onYes: () => void; onNo: () => void }) {
  const text = useOtherBoxText({ mine: data, latest: ask.latest });
  return <DangerConfirm id="confirm-other" label="確認：別の画面の内容を使うか" {...text} safeLabel="やめる（何も変えない）" dangerLabel="別の画面の内容にする（いまの入力は消える）" onYes={onYes} onNo={onNo} />;
}

/** ファイルの内容で名簿を書きかえる前の確認の箱 */
function ConfirmBoxOverwrite({ differs, onYes, onNo }: { differs: FighterDiff[]; onYes: () => void; onNo: () => void }) {
  return <DangerConfirm yellow id="confirm-overwrite" label="確認：ファイルの内容で名簿を書きかえるか" {...overwriteBoxText(differs)} safeLabel="やめる（何も変えない）" dangerLabel={'ファイルの内容で書きかえる（' + differs.length + '人・もどせません）'} onYes={onYes} onNo={onNo} />;
}
