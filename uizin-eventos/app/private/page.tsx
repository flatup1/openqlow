'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { boutWarnings, contractWeight, emptyTournament, importFighters, validateTournament, WEIGHT_GAP_WARN_KG, type LocalBout, type LocalFighter, type LocalTournament } from '../../core/privateTournament.ts';
import { suggestBouts } from '../../core/boutSuggest.ts';
import { formatDateInput, isCompleteDate } from '../../core/dateInput.ts';
import { DEFAULT_ENTRY_CONFIG, entryConfigSearch, entryErrors, type EntryFieldMode, type EntryFormConfig } from '../../core/entryPackage.ts';
import { bytesToArrayBuffer, decryptBackup, encryptBackup, listPrivateEvents, photoToDataUrl, PrivateSaveConflict, readPrivateEvent, watchPrivateEvent, writePrivateEvent, type PrivateEventSummary } from '../lib/privateStore.ts';
import { DEFAULT_EVENT_ID, isValidEventId, newEventId, normalizeEventId } from './eventId.ts';
import {
  backupFileName, backupIsFresh, boutProblems, classifyRestoreError, classifySaveError, clockText, contractKg, decodeCsvBytes, decryptWithRetry, dropBlankBouts, entryConfigFromHash, FALLBACK_ERROR,
  fromEventIdFromHash, importErrorText, ImportProblem, importKind, isBlankBout, isBlankFighterForm, isHalfBout, isTitleReal, looksLikeBackup, mergeKeepExisting, nextAction, overwriteBoxText,
  photoErrorText, restoreBoxText, restoreLastRemoved, RESTORE_TEXT, sameExceptProgress, saveErrorText, saveLine, tidy, useOtherBoxText, weightGap,
  type FighterDiff, type NextKey, type RemovedBout, type SaveState,
} from './logic.ts';
import { Badge, btn, Chip, cls, ConfirmBox, Fold, inputClass, Notice, Section } from './parts.tsx';

const blankFighter = (): LocalFighter => ({ id: crypto.randomUUID(), gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '', photoDataUrl: '' });
const kgText = (value: string) => value.trim() ? value.trim().replace(/kg$/i, '') + 'kg' : '体重未入力';
const VIEW_WINDOW_NOTE = '新しい画面が開きます。見終わったら、画面の上の「試合の準備」の名前を押してもどります。';
const FILE_ACCEPT = '.zip,.xlsx,.csv,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
const SETUP_KEY = 'tournament-setup-v3:';
const BACKUP_AT_KEY = 'tournament-backup-at:';
/** コピーを作ったときの「保存の時刻」。ページを開き直しても、コピーが古いかを見分けるため */
const BACKUP_FOR_KEY = 'tournament-backup-for:';

type Msg = { kind: 'ok' | 'error' | 'info' | 'warn'; text: string; area: string; action?: { label: string; onClick: () => void }; sticky?: boolean; tag?: 'undo-restore' };
type ImportNote = { kind: 'ok' | 'error'; file: string; text: string; noPhoto?: number; staleWarn?: boolean };
type TopNote = { id: string; kind: 'info' | 'warn'; text: string };
type PendingOverwrite = { base: LocalFighter[]; overwritten: LocalFighter[]; differs: FighterDiff[] };
type PendingLookalike = { base: LocalFighter[]; extra: LocalFighter[] };
/** 画面の中の確認の箱（いちどに1つだけ）。nonce は「もう一度押した」ときに箱を作り直して、フォーカスを戻すため */
type Ask = { kind: 'restore'; restored: LocalTournament; nonce: number } | { kind: 'overwrite'; nonce: number } | { kind: 'other'; latest: LocalTournament; nonce: number };
type FieldKey = 'name' | 'gym' | 'grade' | 'age' | 'height' | 'weight' | 'record' | 'comment' | 'musicUrl';
/** yes = つながりの確認ずみ（申し込みページの画面で確かめた）/ entered = URLを入れただけ / no = まだ / unknown = 読めない */
type SetupState = 'yes' | 'entered' | 'no' | 'unknown';

const FIELD_WORDS: Array<[FieldKey, string]> = [['gym', 'ジム名'], ['name', '選手名'], ['height', '身長'], ['weight', '体重'], ['record', '戦績'], ['grade', '学年'], ['age', '年齢'], ['comment', '意気込み'], ['musicUrl', '入場曲']];
const EDIT_KEYS: FieldKey[] = ['name', 'gym', 'grade', 'age', 'height', 'weight', 'record', 'comment', 'musicUrl'];
const invalidKeys = (errors: string[]): Set<FieldKey> => new Set(FIELD_WORDS.filter(([, word]) => errors.some((error) => error.includes(word))).map(([key]) => key));

/* ───────── 選手の入力欄（1人ずつ入れる / 直す で共通） ───────── */
function FighterFields({ value, onChange, config, prefix, invalid, describedBy }: { value: LocalFighter; onChange: (key: FieldKey, next: string) => void; config: EntryFormConfig; prefix: string; invalid?: Set<FieldKey>; describedBy?: string }) {
  const rows: Array<{ key: FieldKey; label: string; required: boolean; hint?: string; unit?: string; mode?: 'numeric' | 'decimal' | 'text'; auto?: string; show: boolean }> = [
    { key: 'name', label: '選手名', required: true, hint: '例: 山田 太郎', show: true },
    { key: 'gym', label: 'ジム名', required: true, hint: '例: ○○ジム', show: true },
    { key: 'grade', label: '学年', required: config.grade === 'required', hint: '例: 小6 / 中2 / 社会人', show: config.grade !== 'off' },
    { key: 'age', label: '年齢', required: config.age === 'required', hint: '例: 15（数字だけ）', mode: 'numeric', show: config.age !== 'off' },
    { key: 'height', label: '身長', required: true, hint: '例: 170', unit: 'cm', mode: 'decimal', show: true },
    { key: 'weight', label: '体重', required: true, hint: '例: 65', unit: 'kg', mode: 'decimal', show: true },
    { key: 'record', label: '戦績', required: true, hint: '初試合なら「初試合」', show: true },
    { key: 'comment', label: '意気込み', required: config.comment === 'required', hint: '例: 全力でがんばります', show: config.comment !== 'off' },
    { key: 'musicUrl', label: '入場曲のリンク', required: config.music, hint: 'Apple Music か YouTube のリンク', show: config.music },
  ];
  return <div className="grid gap-4 sm:grid-cols-2">{rows.filter((row) => row.show).map((row) => <div key={row.key} className="min-w-0">
    <div className="flex flex-wrap items-baseline"><label htmlFor={prefix + '-' + row.key} className="text-lg font-bold">{row.label}</label><Badge required={row.required} /></div>
    <div className="flex items-center gap-2">
      <input id={prefix + '-' + row.key} className={inputClass} value={value[row.key]} placeholder={row.hint} inputMode={row.mode} autoComplete="off" aria-invalid={invalid?.has(row.key) || undefined} aria-describedby={invalid?.has(row.key) ? describedBy : undefined} onChange={(e) => onChange(row.key, e.target.value)} />
      {row.unit ? <span className="mt-1 shrink-0 text-lg font-bold" aria-hidden="true">{row.unit}</span> : null}
    </div>
  </div>)}</div>;
}

/* ───────── 対戦カード1枚（<article> はこの中だけ。画像タグは使わない） ───────── */
type BoutCardProps = {
  bout: LocalBout; index: number; total: number; fighters: LocalFighter[]; groups: Array<[string, LocalFighter[]]>;
  byId: Map<string, LocalFighter>; placed: Map<string, number>; bouts: LocalBout[];
  isCurrent: boolean; isSuggested: boolean; ruleCopied: boolean;
  onPatch: (index: number, patch: Partial<LocalBout>) => void; onMove: (index: number, direction: -1 | 1) => void; onRemove: (index: number) => void;
};
const BoutCard = memo(function BoutCard({ bout, index, total, fighters, groups, byId, placed, bouts, isCurrent, isSuggested, ruleCopied, onPatch, onMove, onRemove }: BoutCardProps) {
  const red = byId.get(bout.redId), blue = byId.get(bout.blueId);
  const half = isHalfBout(bout), blank = isBlankBout(bout);
  const gap = weightGap(red, blue);
  const warnings = boutWarnings(bout, fighters, bouts);
  const contract = contractWeight(red, blue);
  const weightUnknown = !!red && !!blue && gap === null;
  const inThisBout = (id: string) => id === bout.redId || id === bout.blueId;
  const title = 'bout-' + index + '-title';
  // 選択肢は「65kg 山田 太郎（ジム名）」の順。体重が先なので、せまい画面でも切れない
  const options = (side: 'red' | 'blue') => groups.map(([gym, list]) => <optgroup key={gym} label={gym || 'ジム名なし'}>{list.map((f) => {
    const other = side === 'red' ? bout.blueId : bout.redId;
    const mark = f.id === other ? '（もう片方に選択中）' : (placed.get(f.id) ?? 0) - (inThisBout(f.id) ? 1 : 0) > 0 ? '（配置ずみ）' : '';
    return <option key={f.id} value={f.id} disabled={f.id === other}>{`${kgText(f.weight)} ${f.name}${gym ? '（' + gym + '）' : ''}${mark}`}</option>;
  })}</optgroup>);
  const profile = (f: LocalFighter | undefined) => f ? <div className="mt-3 flex min-w-0 items-center gap-3">
    <div aria-hidden="true" className="h-14 w-14 shrink-0 rounded-lg border-2 border-slate-300 bg-slate-200 bg-cover bg-center" style={f.photoDataUrl ? { backgroundImage: 'url(' + f.photoDataUrl + ')' } : undefined} />
    <div className="min-w-0 text-[17px] font-medium leading-snug">
      <p className="break-words text-lg font-bold">{f.name}</p>
      <p className="break-words">{kgText(f.weight)}{f.record ? '・' + f.record : ''}</p>
      <p className="break-words text-slate-700">{[f.age ? f.age + '歳' : '', f.grade].filter(Boolean).join('・')}</p>
    </div>
  </div> : null;
  const centerBadge = gap === null
    ? (weightUnknown ? <Chip tone="amber">⚠ 体重が未入力の選手がいます</Chip> : null)
    : gap >= WEIGHT_GAP_WARN_KG ? <Chip tone="amber">体重差 {gap}kg ⚠</Chip> : <Chip tone="green">体重差 {gap}kg ✓</Chip>;
  return <article id={'bout-' + index} className="scroll-mt-28 rounded-2xl border-2 border-slate-300 bg-white p-3 shadow-sm sm:p-4">
    <div className="flex flex-wrap items-center gap-2">
      <h3 id={title} className="mr-auto text-xl font-bold">第{index + 1}試合</h3>
      {half || blank ? <Chip tone="amber">未完成</Chip> : null}
      {isSuggested ? <Chip tone="amber">案</Chip> : null}
      {isCurrent ? <Chip tone="indigo">▶ いま試合当日の画面に出ている試合</Chip> : null}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" aria-describedby={title} aria-disabled={index === 0 || undefined} onClick={() => { if (index > 0) onMove(index, -1); }} className={cls(btn.base, btn.outline)}>↑ 上へ</button>
      <button type="button" aria-describedby={title} aria-disabled={index === total - 1 || undefined} onClick={() => { if (index < total - 1) onMove(index, 1); }} className={cls(btn.base, btn.outline)}>↓ 下へ</button>
      <button type="button" aria-describedby={title} onClick={() => onRemove(index)} className={cls(btn.base, btn.outline, 'ml-auto')}>消す</button>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1fr)]">
      <div className="min-w-0 rounded-xl border-l-8 border-rose-600 bg-rose-50 p-3">
        <span className="inline-flex min-h-8 items-center rounded-full bg-rose-600 px-3 text-[17px] font-bold text-white">赤コーナー</span>
        <select id={'bout-' + index + '-red'} aria-label="赤コーナーの選手" aria-describedby={title + (!bout.redId ? ' bout-' + index + '-red-hint' : '')} aria-invalid={!bout.redId || undefined} className={cls(inputClass, 'border-rose-400')} value={bout.redId} onChange={(e) => onPatch(index, { redId: e.target.value })}>
          <option value="">赤の選手を選ぶ</option>{options('red')}
        </select>
        {!bout.redId ? <p id={'bout-' + index + '-red-hint'} className="mt-1 text-[17px] font-bold text-amber-950">⚠ 赤の選手を選んでください</p> : null}
        {profile(red)}
      </div>
      <div className="flex min-w-0 flex-col items-stretch justify-center gap-2 md:items-center">
        {centerBadge}
        <button type="button" aria-describedby={title} onClick={() => onPatch(index, { redId: bout.blueId, blueId: bout.redId })} className={cls(btn.base, btn.outline)}>赤青を入替</button>
      </div>
      <div className="min-w-0 rounded-xl border-l-8 border-blue-600 bg-blue-50 p-3">
        <span className="inline-flex min-h-8 items-center rounded-full bg-blue-600 px-3 text-[17px] font-bold text-white">青コーナー</span>
        <select id={'bout-' + index + '-blue'} aria-label="青コーナーの選手" aria-describedby={title + (!bout.blueId ? ' bout-' + index + '-blue-hint' : '')} aria-invalid={!bout.blueId || undefined} className={cls(inputClass, 'border-blue-400')} value={bout.blueId} onChange={(e) => onPatch(index, { blueId: e.target.value })}>
          <option value="">青の選手を選ぶ</option>{options('blue')}
        </select>
        {!bout.blueId ? <p id={'bout-' + index + '-blue-hint'} className="mt-1 text-[17px] font-bold text-amber-950">⚠ 青の選手を選んでください</p> : null}
        {profile(blue)}
      </div>
    </div>
    {red && blue ? <p className="mt-3 text-[17px] font-medium">{contract ? '試合当日の画面には「' + contract + '」と出ます。' : '体重がわからないので、体重の区分（階級）の文字が出ます。'}</p> : null}
    {warnings.length ? <div className="mt-3 space-y-2">
      {warnings.map((w) => <p key={w} role="status" className="rounded-xl border-2 border-amber-500 bg-amber-50 p-2 text-[17px] font-bold text-amber-950">⚠ {w}</p>)}
      <p className="text-[17px] font-medium">このままでも大丈夫です。気になるときだけ選び直してください。</p>
    </div> : null}
    <div className="mt-3">
      <Fold title="ルール・体重の区分（なくてもOK）" className="border-slate-300">
        <p className="text-[17px] font-medium">ふつうは体重から自動で出ます。</p>
        {ruleCopied ? <p className="mt-1 text-[17px] font-bold text-emerald-800">まえの試合と同じルールを入れました</p> : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0"><label htmlFor={'bout-' + index + '-class'} className="text-lg font-bold">体重の区分（階級）</label><input id={'bout-' + index + '-class'} className={inputClass} value={bout.className} placeholder="例: 60kg" onChange={(e) => onPatch(index, { className: e.target.value })} /></div>
          <div className="min-w-0"><label htmlFor={'bout-' + index + '-rule'} className="text-lg font-bold">ルール</label><input id={'bout-' + index + '-rule'} className={inputClass} value={bout.rule} placeholder="例: キックボクシング 2分2R" onChange={(e) => onPatch(index, { rule: e.target.value })} /></div>
        </div>
      </Fold>
    </div>
  </article>;
});

/** 「コピー作成ずみ」の印。コピーのあとで変えたなら、古いことを言葉で言う（色だけにしない） */
function BackupChip({ at, stale }: { at: number; stale: boolean }) {
  return stale
    ? <Chip tone="amber">⚠ 前のコピーのあとで変更あり（コピー {clockText(at)}）</Chip>
    : <Chip tone="green">✓ コピー作成ずみ {clockText(at)}</Chip>;
}

/* ───────── 画面本体 ───────── */
export default function PrivateAdmin() {
  const [data, setData] = useState<LocalTournament>(() => emptyTournament(DEFAULT_EVENT_ID));
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [everSaved, setEverSaved] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [failStreak, setFailStreak] = useState(0);
  const [opened, setOpened] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [topNotes, setTopNotes] = useState<TopNote[]>([]);
  const [importNote, setImportNote] = useState<ImportNote | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null);
  const [pendingLookalike, setPendingLookalike] = useState<PendingLookalike | null>(null);
  const [manual, setManual] = useState<LocalFighter>(blankFighter);
  const [manualErrors, setManualErrors] = useState<string[]>([]);
  const [manualNote, setManualNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LocalFighter>(blankFighter);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<{ id: string; text: string } | null>(null);
  const [listPref, setListPref] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupAt, setBackupAt] = useState(0);
  const [copyState, setCopyState] = useState<'ok' | 'fail' | null>(null);
  const [googleFail, setGoogleFail] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [suggested, setSuggested] = useState<Set<string>>(() => new Set());
  const [suggestNote, setSuggestNote] = useState<{ kind: 'warn' | 'ok'; text: string; ids: string[] } | null>(null);
  const [ruleCopiedId, setRuleCopiedId] = useState('');
  const [fieldFocused, setFieldFocused] = useState(false);
  const [viewportShrunk, setViewportShrunk] = useState(false);
  const [setupState, setSetupState] = useState<SetupState>('unknown');
  const [events, setEvents] = useState<PrivateEventSummary[] | null>(null);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [, setJumpTick] = useState(0);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [announce, setAnnounce] = useState('');
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
  const pendingJump = useRef<{ id: string; box?: string } | null>(null);
  const lastTouched = useRef(-1);
  const backupAutoOpened = useRef(false);
  const navRef = useRef<HTMLElement | null>(null);
  const blurTimer = useRef<number | undefined>(undefined);
  const pendingInputRef = useRef(false);
  const entryConfig: EntryFormConfig = data.entryConfig ?? DEFAULT_ENTRY_CONFIG;
  const dirty = ready && !loadError && data !== cleanRef.current;
  const keyboardUp = fieldFocused && viewportShrunk;
  // 「この選手を追加」を押す前の入力と、直している途中の入力。保存の対象には、まだ入っていない
  const manualDirty = !isBlankFighterForm(manual);
  const editDirty = editingId !== null && (() => { const original = data.fighters.find((fighter) => fighter.id === editingId); return !!original && EDIT_KEYS.some((k) => original[k] !== draft[k]); })();
  const pendingInput = ready && !loadError && (manualDirty || editDirty);
  pendingInputRef.current = pendingInput;
  const line = saveLine({ conflict, saveState, dirty, everSaved, savedClock: clockText(data.updatedAt), pending: pendingInput });
  // 「コピー作成ずみ」が、いまの内容と同じか（ちがうなら「前のコピーのあとで変更あり」）
  const backupStale = useMemo(() => backupAt > 0 && !backupIsFresh({ current: data, snapshot: backupSnap, dirty, savedFor: backupFor }), [backupAt, data, backupSnap, dirty, backupFor]);

  const notify = useCallback((kind: Msg['kind'], text: string, area = 'toast', action?: Msg['action'], sticky = false, tag?: Msg['tag']) => { setMsg({ kind, text, area, action, sticky, tag }); if (area === 'backup') setBackupOpen(true); }, []);
  /** 読み上げ専用の欄に、ひとことだけ入れる（同じ文でも、もう一度読まれるよう、いちど空にする） */
  const say = useCallback((text: string) => {
    announceAtRef.current = Date.now();
    window.clearTimeout(announceTimer.current);
    setAnnounce('');
    announceTimer.current = window.setTimeout(() => setAnnounce(text), 60);
  }, []);
  /** 保存の結果。見える知らせと、読み上げ（1回だけ）を一緒に出す */
  const notifySave = useCallback((kind: Msg['kind'], text: string, action?: Msg['action']) => { notify(kind, text, 'save', action); say(text); }, [notify, say]);
  const addTopNote = useCallback((note: TopNote) => setTopNotes((old) => [...old.filter((item) => item.id !== note.id), note]), []);

  // 状態ラインの読み上げ: 保存の結果（保存済み・保存失敗・保存中）は「保存の知らせ」が1回だけ読む。
  // ここでは、保存の結果ではない変化（入力して未保存になった・別の画面で内容が変わった）だけを読む
  useEffect(() => {
    const prev = prevLineRef.current;
    prevLineRef.current = line.text;
    if (!ready || loadError || !prev || prev === line.text) return;
    if (!/^(● 未保存|! 保存できません)/.test(line.text)) return;
    if (Date.now() - announceAtRef.current < 1500) return;
    say(line.text);
  }, [line.text, ready, loadError, say]);

  // 確認の箱は、その相手（別の画面との食いちがい・書きかえ待ち）がなくなったら、しまう
  useEffect(() => {
    setAsk((current) => !current ? current
      : current.kind === 'other' && !conflict ? null
      : current.kind === 'overwrite' && !(pendingOverwrite && pendingOverwrite.base === data.fighters) ? null
      : current);
  }, [conflict, pendingOverwrite, data.fighters]);

  // 明るい配色（/apply と同じ決まり）。画面を離れたら元に戻る
  useEffect(() => { const before = document.title; return () => { document.title = before; }; }, []);
  useEffect(() => {
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => { if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); };
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
      if (hasParam && id !== rawParam) {
        try { params.set('event', id); history.replaceState(null, '', location.pathname + '?' + params.toString() + location.hash); } catch { /* 直せなくても進められる */ }
        notes.push({ id: 'fixed-id', kind: 'info', text: 'アドレスの大会番号を、使える形に直しました。' });
      }
      try {
        const given = new URLSearchParams(hash.replace(/^#/, ''));
        const t = (given.get('t') ?? '').trim().slice(0, 100), d = formatDateInput((given.get('d') ?? '').trim().slice(0, 30)), v = (given.get('v') ?? '').trim().slice(0, 100);
        const patch: Partial<LocalTournament> = {};
        if (t && !isTitleReal(value.title)) patch.title = t;
        if (d && isCompleteDate(d) && !isCompleteDate(value.date)) patch.date = d;
        if (v && !value.venue.trim()) patch.venue = v;
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
        }
        if (Object.keys(patch).length) shown = { ...value, ...patch };
      } catch { /* 入れなくても進められる */ }
      setTopNotes(notes);
      setData(shown); setReady(true);
      // ?event= が無い（どの大会か決まっていない）到着のときは、保存してある大会の一覧を出す
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
      const saved = JSON.parse(raw) as { endpoint?: unknown; verified?: unknown };
      // 緑の「できています」は、申し込みページの画面が「つながった」と確かめたときだけ。URLを入れただけでは緑にしない
      const entered = typeof saved.endpoint === 'string' && /^https:\/\/script\.google\.com\/\S+/.test(saved.endpoint.trim());
      setSetupState(!entered ? 'no' : saved.verified === true ? 'yes' : 'entered');
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
          removedRef.current = [];
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

  // 知らせは少したつと消える（エラーと「消えない印」つきは残る）
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

  // 下の帯の高さを測って、本文の下の余白にする（帯が高くなっても文字が隠れない）
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--bar-h', el.offsetHeight + 'px');
    set();
    if (typeof ResizeObserver === 'undefined') return () => root.style.removeProperty('--bar-h');
    const observer = new ResizeObserver(set);
    observer.observe(el);
    return () => { observer.disconnect(); root.style.removeProperty('--bar-h'); };
  }, [ready, loadError]);

  // 上にくっつく手順ナビの高さも測る。移動先やフォーカス中の欄が、ナビの下に隠れないようにする（スマホ幅だけ）
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--nav-h', el.offsetHeight + 'px');
    set();
    if (typeof ResizeObserver === 'undefined') return () => root.style.removeProperty('--nav-h');
    const observer = new ResizeObserver(set);
    observer.observe(el);
    return () => { observer.disconnect(); root.style.removeProperty('--nav-h'); };
  }, [ready, loadError]);

  useEffect(() => () => { window.clearTimeout(blurTimer.current); window.clearTimeout(announceTimer.current); }, []);

  /** 画面が描き直されたあとで、指定した場所にフォーカスを戻す */
  const focusSoon = useCallback((id: string) => { window.setTimeout(() => document.getElementById(id)?.focus(), 0); }, []);
  const jump = useCallback((id: string, boxId?: string) => {
    const el = document.getElementById(id);
    const box = (boxId ? document.getElementById(boxId) : null) ?? el;
    if (!box) return;
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
    if (el) el.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const pending = pendingJump.current;
    if (!pending) return;
    pendingJump.current = null;
    jump(pending.id, pending.box);
  });
  /** コピーのファイルの欄を開いて、パスワードの欄に移る */
  const goBackup = useCallback(() => { setBackupOpen(true); pendingJump.current = { id: 'backup-password', box: 'backup' }; setJumpTick((n) => n + 1); }, []);

  const byId = useMemo(() => new Map(data.fighters.map((fighter) => [fighter.id, fighter])), [data.fighters]);
  const groups = useMemo(() => {
    const map = new Map<string, LocalFighter[]>();
    for (const fighter of data.fighters) { const key = fighter.gym.trim(); const list = map.get(key); if (list) list.push(fighter); else map.set(key, [fighter]); }
    return [...map.entries()];
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
    if (id) { setSuggested((old) => { if (!old.has(id)) return old; const next = new Set(old); next.delete(id); return next; }); setRuleCopiedId((old) => old === id && ('className' in patch || 'rule' in patch) ? '' : old); }
  }, []);
  const onMove = useCallback((index: number, direction: -1 | 1) => {
    const current = dataRef.current, target = index + direction;
    if (target < 0 || target >= current.bouts.length) return;
    setData((old) => { const next = [...old.bouts]; [next[index], next[target]] = [next[target], next[index]]; return { ...old, bouts: next }; });
    if (current.currentBout > 0 && (index <= current.currentBout || target <= current.currentBout)) notify('info', '試合当日の画面の「いまの試合」がずれます。');
  }, [notify]);
  /** 消した試合を、新しいほうから順に戻す */
  const undoRemove = useCallback(() => {
    const result = restoreLastRemoved(dataRef.current.bouts, removedRef.current);
    removedRef.current = result.stack;
    const restored = result.restored;
    if (!restored) { setMsg(null); return; }
    setData((old) => ({ ...old, bouts: restoreLastRemoved(old.bouts, [restored]).bouts }));
    if (result.stack.length > 0) notify('info', '第' + (restored.index + 1) + '試合を戻しました。ほかにも戻せる試合が' + result.stack.length + 'つあります。', 'toast', { label: '元にもどす', onClick: () => undoRemoveRef.current() });
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
    if (isBlankBout(removed)) return;
    removedRef.current = [...removedRef.current, { bout: removed, index }];
    const shift = current.currentBout > 0 && index <= current.currentBout ? ' 試合当日の画面の「いまの試合」がずれます。' : '';
    notify('ok', '第' + (index + 1) + '試合を消しました。' + shift, 'toast', { label: '元にもどす', onClick: () => undoRemoveRef.current() });
  }, [notify]);

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
    setSaveState('saving');
    const base = source ?? dataRef.current;
    let nextState: SaveState = 'idle';
    try {
      const { saved, untouched } = await commit(base, source);
      failRef.current = 0; setFailStreak(0);
      savedAtRef.current = Date.now();
      if (!backupAutoOpened.current) { backupAutoOpened.current = true; setBackupOpen(true); }
      const unfinished = saved.bouts.filter(isHalfBout).length + (isTitleReal(saved.title) ? 0 : 1);
      // 保存している間にまた入力したときは、「保存しました」は出さない（状態ラインが「未保存」を示す）
      if (untouched) notifySave('ok', '保存しました。このパソコンの中に残ります。' + (unfinished > 0 ? 'まだ直すところが' + unfinished + 'つあります（試合当日の画面を開く前に直します）。' : ''));
      return true;
    } catch (error) {
      if (error instanceof PrivateSaveConflict) {
        setConflict(true);
        notifySave('error', '保存しませんでした。別の画面で内容が変わりました。入れた内容は画面に残っています。', { label: '黄色い案内を見る', onClick: () => jump('conflict-box') });
      } else {
        nextState = 'failed';
        failRef.current += 1; setFailStreak(failRef.current);
        const repeated = failRef.current >= 2;
        // 失敗の知らせは、帯の中に1つだけ。「もう一度」だけの堂々めぐりにしないため、いつも「コピーのファイルを作る」の出口を出す
        notifySave('error', repeated ? 'また失敗しました。コピーのファイルに入れておくと安心。' : saveErrorText(classifySaveError(error, base.eventId)), { label: 'コピーのファイルを作る', onClick: goBackup });
      }
      return false;
    } finally { setSaveState(nextState); }
  };

  /** 別の画面で保存された内容を、いまの画面にする */
  const adoptLatest = (latest: LocalTournament) => {
    savedRef.current = latest; cleanRef.current = latest; setData(latest); setConflict(false); setSaveState('idle'); failRef.current = 0; setFailStreak(0);
    setPendingOverwrite(null); setAsk(null); removedRef.current = []; setMsg(null);
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
    let blocked: string[] = [];
    try {
      const kind = importKind(file.name);
      if (!kind) throw new ImportProblem('ext');
      if (file.size > 100 * 1024 * 1024) throw new ImportProblem('too-large');
      let csv = '';
      let photos: Record<string, Uint8Array> = {};
      if (kind === 'zip') {
        const { strFromU8, unzipSync } = await import('fflate');
        let unpackedBytes=0, fileCount=0;
        const unpacked = unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:(entry)=>{
          fileCount++;unpackedBytes+=entry.originalSize;
          if(fileCount>3001||entry.originalSize>20*1024*1024||unpackedBytes>100*1024*1024)throw new ImportProblem('too-large');
          return entry.name==='players.csv'||/^photos\/[^/]+\.(?:jpe?g|png|webp)$/i.test(entry.name);
        }});
        const keys = Object.keys(unpacked);
        if (keys.length > 3001) throw new ImportProblem('too-large');
        const csvBytes = unpacked['players.csv'];
        if (!csvBytes) throw new ImportProblem('no-list');
        csv = strFromU8(csvBytes).replace(/^﻿/, '');
        photos = Object.fromEntries(Object.entries(unpacked).filter(([name]) => /^photos\/[^/]+\.(?:jpe?g|png|webp)$/i.test(name)));
      } else if (kind === 'xlsx') {
        const { readSheet } = await import('read-excel-file/browser');
        let rows;
        try { rows = await readSheet(file, '選手入力'); } catch { throw new ImportProblem('no-sheet'); }
        csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
      } else {
        // まず UTF-8。文字化けしたときだけ、ExcelのCSV（Shift_JIS）で読み直す
        csv = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
      }
      const result = importFighters(csv);
      if (result.blockedHeaders.length) { blocked = result.blockedHeaders; throw new ImportProblem('blocked'); }
      if(!result.fighters.length)throw new ImportProblem('empty');
      const fighters = await Promise.all(result.fighters.map(async (fighter) => {
        const photoEntry = Object.entries(photos).find(([name]) => name.replace(/^photos\//, '').replace(/\.[^.]+$/, '') === fighter.id);
        if (!photoEntry) return fighter;
        const extension = photoEntry[0].split('.').pop()?.toLowerCase();
        const type = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
        // 読めない写真が1枚あっても、名簿は読み込む（その選手は「写真がありません」になる）
        try { return { ...fighter, photoDataUrl: await photoToDataUrl(new File([bytesToArrayBuffer(photoEntry[1])], photoEntry[0], { type })) }; } catch { return fighter; }
      }));
      // 前からいる人は黙って変えない。新しい人だけ足す。内容がちがう人は、押したときだけ書きかえる
      const current = dataRef.current.fighters;
      const merge = mergeKeepExisting(current, fighters);
      setData((old) => {
        if (old.fighters === current) return merge.changed ? { ...old, fighters: merge.merged } : old;
        try { return { ...old, fighters: mergeKeepExisting(old.fighters, fighters).merged }; } catch { return old; }
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
      }
      setImportNote({ kind: 'ok', file: file.name, noPhoto: merge.merged.filter((fighter) => !fighter.photoDataUrl).length, staleWarn: current.length > 0 && already === 0 && same === 0 && merge.added > 0, text });
      const base = merge.changed ? merge.merged : current;
      if (merge.differs.length > 0) setPendingOverwrite({ base, overwritten: merge.overwritten, differs: merge.differs });
      if (same > 0) setPendingLookalike({ base, extra: merge.lookalike });
      setListPref(true);
    } catch (error) {
      setImportNote({ kind: 'error', file: file.name, text: importErrorText(error, blocked) });
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

  /* 選手を1人ずつ入れる / 直す / 消す / 写真 */
  const addManual = () => {
    // 完全に空のまま、もう一度押したときは何もしない（「追加しました」の案内を消さない）
    if (manualNote && isBlankFighterForm(manual)) return;
    const cleaned: LocalFighter = { ...manual, name: manual.name.trim(), gym: manual.gym.trim(), age: tidy(manual.age), height: tidy(manual.height), weight: tidy(manual.weight), record: manual.record.trim() };
    const errors = entryErrors(cleaned, true, entryConfig);
    if (errors.length) { setManualErrors(errors); setManualNote(''); return; }
    setManualErrors([]);
    setData((old) => ({ ...old, fighters: [...old.fighters, cleaned] }));
    setManual(blankFighter()); setListPref(true);
    setManualNote('✓ ' + cleaned.name + 'さんを追加しました（現在' + (data.fighters.length + 1) + '人）。つぎに写真を選んでください。');
    pendingJump.current = { id: 'fighter-' + cleaned.id };
  };
  const choosePhoto = async (e: ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.currentTarget.files?.[0]; e.currentTarget.value = '';
    if (!file) return;
    setPhotoBusy(id); setPhotoError(null);
    try {
      const photoDataUrl = await photoToDataUrl(file);
      setData((old) => ({ ...old, fighters: old.fighters.map((item) => item.id === id ? { ...item, photoDataUrl } : item) }));
    } catch (error) { setPhotoError({ id, text: photoErrorText(error) }); }
    finally { setPhotoBusy(null); }
  };
  const applyEdit = () => {
    if (!editingId) return;
    if (!draft.name.trim()) { notify('error', '選手の名前を入れてください。', 'toast'); return; }
    const next: LocalFighter = { ...draft, name: draft.name.trim(), gym: draft.gym.trim(), age: tidy(draft.age), height: tidy(draft.height), weight: tidy(draft.weight) };
    setData((old) => ({ ...old, fighters: old.fighters.map((item) => item.id === editingId ? { ...next, id: item.id, photoDataUrl: item.photoDataUrl } : item) }));
    setEditingId(null);
  };
  const removeFighter = (id: string) => {
    setData((old) => ({ ...old, fighters: old.fighters.filter((item) => item.id !== id), bouts: old.bouts.map((bout) => ({ ...bout, redId: bout.redId === id ? '' : bout.redId, blueId: bout.blueId === id ? '' : bout.blueId })) }));
    setConfirmDeleteId(null);
    notify('ok', (byId.get(id)?.name ?? '選手') + 'さんを消しました。');
  };

  /* 対戦カードをつくる */
  const newBout = (patch: Partial<LocalBout> = {}): LocalBout => {
    const prev = data.bouts[data.bouts.length - 1];
    return { id: crypto.randomUUID(), redId: '', blueId: '', className: prev?.className ?? '', rule: prev?.rule ?? '', ...patch };
  };
  const addBout = () => {
    if (data.fighters.length < 2) { jump('pick-file', 'pick-file-box'); return; }
    const last = data.bouts[data.bouts.length - 1];
    if (last && isBlankBout(last)) { jump('bout-' + (data.bouts.length - 1) + '-red'); return; }
    const bout = newBout();
    edit('bouts', [...data.bouts, bout]);
    setSuggestNote(null);
    if (last && (bout.className || bout.rule)) setRuleCopiedId(bout.id);
    lastTouched.current = data.bouts.length;
    pendingJump.current = { id: 'bout-' + data.bouts.length + '-red' };
  };
  const unplaced = useMemo(() => data.fighters.filter((fighter) => !placed.has(fighter.id)), [data.fighters, placed]);
  const placeFighter = (fighter: LocalFighter) => {
    const room = (i: number) => i >= 0 && i < data.bouts.length && (!data.bouts[i].redId || !data.bouts[i].blueId);
    let target = lastTouched.current;
    if (!room(target)) target = data.bouts.findIndex((_, i) => room(i));
    if (target >= 0) {
      const bout = data.bouts[target], side = !bout.redId ? 'red' : 'blue';
      onPatch(target, side === 'red' ? { redId: fighter.id } : { blueId: fighter.id });
      notify('info', fighter.name + 'さんを第' + (target + 1) + '試合の' + (side === 'red' ? '赤' : '青') + 'コーナーに入れました。');
    } else {
      const bout = newBout({ redId: fighter.id });
      edit('bouts', [...data.bouts, bout]);
      lastTouched.current = data.bouts.length;
      notify('info', fighter.name + 'さんを第' + (data.bouts.length + 1) + '試合の赤コーナーに入れました。つぎに青コーナーを選びます。');
    }
  };
  const makeSuggestion = () => {
    const made = suggestBouts(data.fighters, data.bouts, () => crypto.randomUUID());
    if (!made.length) { setSuggestNote({ kind: 'warn', ids: [], text: 'おすすめは作れませんでした。体重が入っていない選手がいると、自動では組めません。「＋ 試合を追加」から、自分で選んでください。' }); return; }
    const prev = data.bouts[data.bouts.length - 1];
    const added: LocalBout[] = made.map((bout: LocalBout) => ({ ...bout, className: bout.className || prev?.className || '', rule: bout.rule || prev?.rule || '' }));
    edit('bouts', [...data.bouts, ...added]);
    setSuggested((old) => new Set([...old, ...added.map((bout: LocalBout) => bout.id)]));
    const left = unplaced.length - added.length * 2;
    setSuggestNote({ kind: 'ok', ids: added.map((bout: LocalBout) => bout.id), text: 'おすすめの組み合わせを' + added.length + 'つ、いちばん下に足しました。' + (left > 0 ? 'のこり' + left + '人は、相手が見つからなかったので、まだ入っていません。' : '') });
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
    setSuggestNote(null);
    notify('ok', '手を入れていない' + untouched.size + 'つを消しました。' + (kept > 0 ? '手を入れた' + kept + 'つは残しました。' : ''));
  };

  /* ───── コピーのファイル（作る / 戻す） ───── */
  // 2つ目の欄は、なくてもOK（空なら確認なし）。入っていて、1つ目とちがうときだけ止める
  const passwordProblem = password.length < 10 ? 'あと' + (10 - password.length) + '文字必要です' : password2 && password2 !== password ? 'パスワードが同じではありません' : '';
  const download = async () => {
    if (passwordProblem) { document.getElementById(password.length < 10 ? 'backup-password' : 'backup-password2')?.focus(); return; }
    if (backupBusy || Date.now() - downloadDoneAt.current < 3000) return;
    setBackupBusy(true); setMsg((current) => current && current.area === 'backup' ? null : current);
    try {
      const snapshot = dataRef.current;
      const encrypted = await encryptBackup(snapshot, password);
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
      notify('ok', 'ファイルを保存しました：' + name + '。ダウンロードの中にあります。USBメモリか別のパソコンにも入れておくと安心です。パスワードは紙に書いてください。' + (snapshot !== cleanRef.current ? ' まだ保存していない変更も、このファイルに入っています。' : ''), 'backup', undefined, true);
    } catch { notify('error', 'コピーのファイルを作れませんでした。もう一度「パスワードをつけて、コピーを保存する」を押してください。', 'backup'); }
    finally { downloadDoneAt.current = Date.now(); setBackupBusy(false); }
  };
  const restore = async (file?: File) => {
    if (!file || restoreBusyRef.current) return;
    if (!password) { notify('error', RESTORE_TEXT.noPassword, 'backup'); document.getElementById('backup-password')?.focus(); return; }
    restoreBusyRef.current = true;
    setMsg((current) => current && current.area === 'backup' ? null : current);
    setAsk((current) => current?.kind === 'restore' ? null : current);
    try {
      let text = '';
      try { text = await file.text(); } catch { notify('error', RESTORE_TEXT.format, 'backup'); return; }
      if (!looksLikeBackup(text)) { notify('error', RESTORE_TEXT.format, 'backup'); return; }
      let restored: LocalTournament;
      try { restored = await decryptWithRetry((pw) => decryptBackup(text, pw), password); }
      catch (error) { notify('error', RESTORE_TEXT[classifyRestoreError(error)], 'backup'); return; }
      const mine = dataRef.current;
      if (restored.eventId !== mine.eventId) {
        const go = () => { location.href = '/private/?event=' + encodeURIComponent(restored.eventId); };
        notify('error', 'このコピーは『' + (isTitleReal(restored.title) ? restored.title : restored.eventId) + '』用です。いまの画面は別の大会なので、何も変えていません。' + (mine !== cleanRef.current ? '（開くと、保存していない変更について、ブラウザが確認を出します）' : ''), 'backup', { label: 'この大会として開く', onClick: go });
        return;
      }
      // ここでは、まだ何も変えない。「コピーのファイルから戻す」のすぐ下に確認の箱を出し、「上書きして戻す」を押したときだけ戻す
      setBackupOpen(true);
      setAsk({ kind: 'restore', restored, nonce: ++askSeq.current });
    } finally { restoreBusyRef.current = false; }
  };
  /** 確認の箱の「上書きして戻す」を押したあと。いまの内容（箱を見ている間に変わっていても、いまの内容）をコピーで置きかえる */
  const finishRestore = async (restored: LocalTournament) => {
    if (restoreBusyRef.current) return;
    restoreBusyRef.current = true;
    try {
      const mine = dataRef.current;
      if (restored.eventId !== mine.eventId) { notify('error', 'いまの画面は別の大会なので、何も変えていません。', 'backup'); return; }
      const before = { saved: savedRef.current, screen: mine, dirty: mine !== cleanRef.current };
      try {
        await commit({ ...restored, updatedAt: savedRef.current?.updatedAt ?? mine.updatedAt }, { ...restored, updatedAt: savedRef.current?.updatedAt ?? mine.updatedAt });
      } catch (error) {
        if (error instanceof PrivateSaveConflict) setConflict(true);
        notify('error', RESTORE_TEXT.write, 'backup');
        return;
      }
      setSaveState('idle'); failRef.current = 0; setFailStreak(0); removedRef.current = []; setEditingId(null); setSuggestNote(null);
      const undo = everSaved && before.saved ? { label: '元にもどす（このページを開いている間だけ）', onClick: () => void undoRestore(before) } : undefined;
      notify('ok', '戻しました。' + (isTitleReal(restored.title) ? restored.title : '名前なし') + '・選手' + restored.fighters.length + '人・試合' + restored.bouts.length + 'つ。すでに保存ずみです。', 'backup', undo, true, undo ? 'undo-restore' : undefined);
    } finally { restoreBusyRef.current = false; }
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
    } catch { notify('error', '元にもどせませんでした。いまのデータは変えていません。', 'backup'); }
  };
  const onPickBackup = (e: ChangeEvent<HTMLInputElement>) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void restore(file); };

  /* ───── 確認の箱の2つのボタン ───── */
  /** 「やめる（何も変えない）」。Escape も同じ。押したボタンに、フォーカスを戻す */
  const answerNo = () => {
    if (!ask) return;
    const kind = ask.kind;
    setAsk(null);
    notify('info', RESTORE_TEXT.cancel, kind === 'restore' ? 'backup' : 'toast');
    focusSoon(kind === 'restore' ? 'restore-file' : kind === 'overwrite' ? 'overwrite-trigger' : 'use-other-trigger');
  };
  /** あぶないほうのボタン（「上書きして戻す」「書きかえる」「別の画面の内容にする」）。ここを押したときだけ、変える */
  const answerYes = () => {
    if (!ask) return;
    if (ask.kind === 'restore') { const restored = ask.restored; setAsk(null); void finishRestore(restored).then(() => focusSoon('restore-file')); return; }
    if (ask.kind === 'overwrite') { applyOverwrite(); return; }
    const shown = ask.latest;
    setAsk(null);
    adoptOther(shown);
  };

  /* ───── ここから下は、読み込みの状態ごとの表示 ───── */
  if (!ready) return <main className="tos-read min-h-dvh bg-slate-50 p-6 text-slate-950 [color-scheme:light]"><p className="text-xl font-bold">じゅんびしています…</p></main>;
  if (loadError) return <main className="tos-read min-h-dvh bg-slate-50 p-4 text-slate-950 [color-scheme:light] sm:p-8"><div className="mx-auto max-w-2xl rounded-2xl border-2 border-slate-300 bg-white p-5">
    <h1 className="text-2xl font-bold">保存してあるデータを、読めませんでした</h1>
    <p role="alert" className="mt-3 font-medium">{loadError}</p>
    <ol className="mt-3 list-decimal space-y-1 pl-6 font-medium"><li>「プライベートウィンドウ」ではないか確認します。</li><li>パソコンの空き容量を確認します。</li><li>それでもだめなら、ジムの担当者に連絡します。</li></ol>
    <button type="button" className={cls(btn.base, btn.primary, 'mt-5 w-full sm:w-auto')} onClick={() => location.reload()}>もう一度読み込む</button>
  </div></main>;

  /* ───── 計算 ───── */
  const live = '/private/live/?event=' + encodeURIComponent(data.eventId);
  const entryLink = '/private/entry/?' + entryConfigSearch(entryConfig);
  const setupLink = '/private/setup/?event=' + encodeURIComponent(data.eventId);
  const setEntryMode = (key: 'grade' | 'age' | 'comment', value: EntryFieldMode) => edit('entryConfig', { ...entryConfig, [key]: value });
  const googleSetup = '/private/google-setup/?' + new URLSearchParams({ event:data.eventId, title:data.title, date:data.date, venue:data.venue, music:entryConfig.music?'on':'off', grade:entryConfig.grade, age:entryConfig.age, comment:entryConfig.comment }).toString();
  const copyEntryLink = async () => {
    try { await navigator.clipboard.writeText(location.origin + entryLink); setCopyState('ok'); }
    catch { setCopyState('fail'); }
  };

  const dateOk = isCompleteDate(data.date);
  const nFighters = data.fighters.length;
  const nonBlank = data.bouts.filter((bout) => !isBlankBout(bout)).length;
  const halfIndex = data.bouts.findIndex(isHalfBout);
  const halfSide = halfIndex >= 0 && !data.bouts[halfIndex].redId ? 'red' : 'blue';
  const withPhoto = data.fighters.filter((fighter) => fighter.photoDataUrl).length;
  const placedCount = data.fighters.length - unplaced.length;
  const titleMissing = !data.title.trim();
  const otherCore = Math.max(0, coreErrors.length - boutIssues.length - (titleMissing ? 1 : 0)) > 0;
  const problemCount = boutIssues.length + (titleMissing ? 1 : 0) + (otherCore ? 1 : 0);
  const validOk = coreErrors.length === 0 && nonBlank >= 1;
  const done1 = titleReal, done2 = nFighters >= 2, done3 = nonBlank >= 1 && boutIssues.length === 0, done4 = !dirty && everSaved && validOk;
  const doneList = [done1, done2, done3, done4];
  const nowStep = doneList.findIndex((done) => !done);
  const warnCount = data.bouts.reduce((sum, bout) => sum + boutWarnings(bout, data.fighters, data.bouts).length, 0);
  const googleReady = titleReal && dateOk;
  const fresh = nFighters === 0 && data.bouts.length === 0;
  const title = titleReal ? data.title : 'まだ名前なし';
  const firstWarn = data.bouts.findIndex((bout) => boutWarnings(bout, data.fighters, data.bouts).length > 0);
  const datePreview = dateOk ? formatDateInput(data.date) : '';
  // 失敗の知らせが帯に出ているときは、状態ラインは「! 保存失敗」だけ（同じ文を2回出さない）
  const failShown = saveState === 'failed' && !!msg && msg.kind === 'error' && msg.area !== 'backup';
  const lineTone = line.tone === 'bad' ? 'text-rose-800' : line.tone === 'warn' ? 'text-amber-950' : line.tone === 'ok' ? 'text-emerald-800' : 'text-slate-800';

  const na = nextAction({ titleReal, dateOk, fighters: nFighters, nonBlankBouts: nonBlank, halfIndex, halfSide, dirty, everSaved, problems: problemCount, opened, saveState, conflict });
  const key: NextKey = na.key;
  const goToProblem = () => {
    if (nonBlank === 0) return jump('add-bout');
    const issue = boutIssues[0];
    if (issue) return jump('bout-' + issue.index + (issue.side === 'blue' ? '-blue' : '-red'));
    if (titleMissing) return jump('field-title');
    jump('sec-4');
  };
  const banner: Record<NextKey, { hint: string; run: () => void }> = {
    title: { hint: '「1. 大会の情報」の、いちばん上の欄です。日にちは、あとでもOKです。', run: () => jump('field-title') },
    fighters: { hint: '申し込みで集めた選手のファイルを、「2. 選手を入れる」で選びます。', run: () => jump('pick-file', 'pick-file-box') },
    fighters2: { hint: '試合は2人いないと作れません。', run: () => jump('pick-file', 'pick-file-box') },
    bouts: { hint: '「＋ 試合を追加」を押して、赤と青の選手を選びます。', run: () => jump('add-bout') },
    half: { hint: '選手が1人だけ入っている試合があります。', run: () => jump('bout-' + halfIndex + (halfSide === 'red' ? '-red' : '-blue')) },
    save: { hint: saveState === 'failed' ? '入れた内容は画面に残っています。もう一度、押してみます。' : 'ここまでの内容を、このパソコンの中に残します。', run: () => { void save(); } },
    fix: { hint: 'まだ直すところがあります。', run: goToProblem },
    open: { hint: '準備は終わりました。試合当日の画面で、確かめます。', run: () => { void openLive(); } },
    done: { hint: '', run: () => undefined },
  };
  const canOpen = validOk;
  async function openLive() {
    if (openingRef.current) return;
    if (!canOpen) { goToProblem(); return; }
    // 二度押しで、画面がいくつも開かないようにする（2秒）
    openingRef.current = true; window.setTimeout(() => { openingRef.current = false; }, 2000);
    let popup: Window | null = null;
    try { popup = window.open('', '_blank'); } catch { popup = null; }
    if (dirty && !(await save())) { popup?.close(); openingRef.current = false; return; }
    setOpened(true);
    if (popup) { try { popup.opener = null; } catch { /* 古い画面では無視 */ } popup.location.href = live; } else location.href = live;
  }
  /** 新しい大会をつくる: 名簿・対戦カードは空。「選手に書いてもらうこと」と会場だけ引き継ぐ */
  const startNewEvent = async () => {
    if (newEventRef.current) return;
    if (pendingInputRef.current) { if (!window.confirm('選手の入力が、まだ追加されていません。\n新しい大会に移ると、その入力は消えます。\nよろしいですか？')) return; pendingInputRef.current = false; }
    newEventRef.current = true; window.setTimeout(() => { newEventRef.current = false; }, 2000);
    if (dirty && !(await save())) { newEventRef.current = false; return; }
    location.href = '/private/?event=' + newEventId(Date.now()) + '#from=' + encodeURIComponent(dataRef.current.eventId);
  };
  const onBarPrimary = () => {
    if (na.kind === 'conflict') { jump('conflict-box'); return; }
    if (na.kind === 'open' && Date.now() - savedAtRef.current >= 1500) { void openLive(); return; }
    // 保存した直後の二度押しだけ止める。保存のあとに入力がある（未保存）・保存に失敗した、ときは必ず保存する
    const nothingUnsaved = dataRef.current === cleanRef.current && saveState !== 'failed';
    if (na.kind === 'open' && Date.now() - savedAtRef.current < 1500) return;
    if (na.kind === 'save' && nothingUnsaved && Date.now() - savedAtRef.current < 1500) return;
    if (na.kind === 'save' && saveState === 'saving') return;
    banner[key].run();
  };
  // 保存のあとは、止まったボタンを見せず、すぐ次のボタンに進む（「保存済み」は状態ラインだけが言う）
  const barDisabled = na.kind === 'save' && saveState === 'saving';
  const barLabel = na.label;
  const showSecondarySave = dirty && na.kind !== 'save' && na.kind !== 'conflict' && saveState === 'idle';

  const listOpen = listPref ?? nFighters <= 8;
  const shownFighters = nFighters > 8 && query.trim() ? data.fighters.filter((fighter) => (fighter.name + fighter.gym).includes(query.trim())) : data.fighters;
  // 上の4つの手順の名前は、下の見出しと同じ。スマホでは、せまいので短い名前を使う
  const steps = [['sec-1', '大会の情報', '大会'], ['sec-2', '選手を入れる', '選手'], ['sec-3', '対戦カードを作る', '試合'], ['sec-4', '保存して開く', '開く']] as const;
  const musicNow = entryConfig.music;
  const modeLine = (mode: EntryFieldMode) => mode === 'off' ? '入力画面：この欄は出ません。' : mode === 'optional' ? '入力画面：この欄が出ます（空でもOK）。' : '入力画面：この欄が出ます（必ず書く）。';
  const manualInvalid = invalidKeys(manualErrors);
  const overwriteReady = pendingOverwrite && pendingOverwrite.base === data.fighters ? pendingOverwrite : null;
  const canUndoSuggestion = !!suggestNote && suggestNote.ids.some((id) => suggested.has(id) && data.bouts.some((bout) => bout.id === id));
  const restoreLocked = password.length < 10;
  const rosterHelp = <>
    <ol className="mt-3 max-w-[38em] list-decimal space-y-2 pl-6 font-medium">
      <li>Googleのシートを開く（画面の上の、シートの名前を押す）</li>
      <li>メニュー「Tournament OS」→「④ OS用の名簿ZIPを作る」を押す</li>
      <li>できたファイルを探す（「ダウンロード」の中）</li>
      <li>下の「ファイルを選ぶ」を押して、そのファイルを選ぶ</li>
    </ol>
    <p className="mt-3 flex flex-wrap items-center gap-2 text-[17px] font-medium">
      <Chip tone="slate">ZIP＝まとめたファイル</Chip>
      <span>ファイル名の例：</span>
      <span className="rounded-lg border-2 border-slate-400 bg-white px-3 py-1 font-bold"><span aria-hidden="true">📄 </span>選手名簿.zip</span>
    </p>
  </>;

  /** 次にすること（文だけ。押すボタンは、画面の下の青いボタンの1つ） */
  const nextCard = <section aria-label="次にすること" className="rounded-2xl border-2 border-indigo-700 bg-white p-4 shadow-sm">
    {key === 'done' && na.kind === 'open' ? <p className="text-xl font-bold text-emerald-800">✓ ぜんぶ終わりました</p> : <>
      <p className="text-lg font-bold text-indigo-900">次にすること：{na.label}</p>
      <p className="mt-1 font-medium">{na.kind === 'conflict' ? '別の画面で内容が変わりました。下の黄色い案内で、どちらを使うか選びます。' : banner[key].hint}</p>
      <p className="mt-1 text-[17px] font-bold text-indigo-900"><span aria-hidden="true">↓ </span>画面の下の青いボタンを押します。</p>
    </>}
  </section>;

  /** 別のパソコンへ移す・こわれたときに戻す入口。データがあっても、いつも見える */
  const backupJump = <div className="rounded-xl border-2 border-slate-300 bg-white p-3">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={goBackup} className={cls(btn.base, btn.outlineBig, 'w-full text-balance [word-break:auto-phrase] sm:w-auto')}>別のパソコンへ移す／こわれたときのコピー</button>
      {backupAt ? <BackupChip at={backupAt} stale={backupStale} /> : <Chip tone="slate">コピーのファイル：まだ</Chip>}
    </div>
    <p className="mt-1 text-[17px] font-medium">押すと、下の「コピーのファイルを作る・戻す」が開きます。コピーのファイルを持っているときも、ここから戻します。</p>
  </div>;

  /** Googleの申し込みページ（べつの作業）。確かめてあるときだけ緑。ほかは、目立たない灰色 */
  const googleBox = nFighters === 0 ? <section aria-label="この大会の申し込みページ" className={cls('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 p-3 text-[17px] font-bold', setupState === 'yes' ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-slate-50 text-slate-900')}>
    <p className="min-w-0">{setupState === 'yes' ? '✓ 申し込みページ：つながりを確かめてあります' : setupState === 'entered' ? 'べつの作業：申し込みページ（URLは入れてあります）' : setupState === 'unknown' ? '? べつの作業：申し込みページの画面で確かめます' : 'べつの作業：申し込みページ（あとでOK）'}</p>
    {setupState !== 'yes' ? <a href={setupLink} className={cls(btn.base, btn.outline)}>申し込みページをつくる画面へ →</a> : null}
    <p className="w-full text-[17px] font-medium text-slate-800">{setupState === 'entered' ? 'つながったかは、申し込みページの画面で確かめます。' : 'このパソコンの中の記録で見ています。別のパソコンで作ったときは「まだ」と出ます。'}</p>
  </section> : null;

  /** ほか：大会をえらぶ・安心のしくみ（ふだんは閉じておく） */
  const otherFold = <Fold title="大会をえらぶ・安心のしくみ（ほか）" open={chooserOpen} onToggle={(open) => { setChooserOpen(open); if (open && events === null) void loadEvents(); }} className="border-slate-300">
    <p className="text-lg font-bold">大会をえらぶ（続きから／新しい大会）</p>
    {events === null ? <p className="mt-2 font-medium">⏳ 保存してある大会を探しています…</p> : <ul className="mt-2 space-y-2">
      {events.map((item) => {
        const label = '続きから：' + (isTitleReal(item.title) ? item.title : '名前なし') + '　' + (item.date || '日にちなし') + '　選手' + item.fighters + '人';
        return <li key={item.eventId} className="min-w-0 [overflow-wrap:anywhere]">{item.eventId === data.eventId
          ? <p className="flex min-h-14 min-w-0 items-center rounded-xl border-2 border-emerald-700 bg-emerald-50 px-4 py-2 text-lg font-bold text-emerald-900 [overflow-wrap:anywhere]">✓ いま開いている：{label.replace('続きから：', '')}</p>
          : <a href={'/private/?event=' + encodeURIComponent(item.eventId)} className={cls(btn.base, btn.outlineBig, 'w-full justify-start text-left')}>{label}</a>}</li>;
      })}
      {events.length === 0 ? <li className="font-medium">{eventsFailed ? '保存してある大会を読めませんでした。いま開いている大会は、そのまま使えます。' : 'まだ、保存してある大会はありません。'}</li> : null}
    </ul>}
    <button type="button" onClick={() => { void startNewEvent(); }} className={cls(btn.base, btn.outlineBig, 'mt-4 w-full text-balance sm:w-auto')}>新しい大会をつくる（前回の設定を引き継ぐ）</button>
    <p className="mt-2 max-w-[38em] text-[17px] font-medium">名簿と対戦カードは空で始まります。引き継ぐのは「選手に書いてもらうこと」と会場だけです。</p>
    <div className="mt-5 border-t-2 border-slate-200 pt-4">
      <p className="text-lg font-bold"><span aria-hidden="true">🔒 </span>安心のしくみ</p>
      <p className="mt-2 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 font-bold text-amber-950">⚠ このパソコンでだけ使えます。別のパソコンやスマホで開くと空です。</p>
      <p className="mt-2 max-w-[38em] font-medium">選手の名前・写真・体重・試合カードは、このパソコンの中にだけ保存します。インターネットには送りません。</p>
      <p className="mt-2 max-w-[38em] font-medium">同じパソコンの別の画面では、同じ内容が出ます。</p>
      <p className="mt-2 max-w-[38em] font-medium">Googleの受付の設定は、この保存とは別です。</p>
      <p className="mt-2 max-w-[38em] font-medium">ネットが切れても入力と保存はできます。ただし、画面を閉じたあとに開くには、ネットが必要です。</p>
    </div>
  </Fold>;

  return <>
  <main className="tos-read min-h-dvh bg-slate-50 pb-[calc(var(--bar-h,13rem)+1rem)] text-slate-950 [color-scheme:light] [word-break:auto-phrase] [overflow-wrap:anywhere]"
    onFocus={(e) => { const t = e.target as HTMLElement; window.clearTimeout(blurTimer.current); setFieldFocused(t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'file', 'radio', 'button'].includes((t as HTMLInputElement).type))); }}
    // 入力欄から外れた瞬間に下の帯を入れ替えると、押そうとしたボタンが消える。少し待ってから戻す
    onBlur={() => { window.clearTimeout(blurTimer.current); blurTimer.current = window.setTimeout(() => setFieldFocused(false), 300); }}>
    <div className="mx-auto w-full max-w-6xl px-4 py-4 lg:py-8">
      {/* いちばん上の1行: いま開いている大会（続きから開いたときの確認も兼ねる） */}
      <div className="rounded-xl border-2 border-slate-400 bg-white p-3">
        <p className="min-w-0 break-words text-lg font-bold">いま開いている大会：<span className="text-indigo-900">{title}</span>　<span className="whitespace-nowrap font-medium">選手{nFighters}人・試合{nonBlank}つ</span>　<span className={cls('whitespace-nowrap', lineTone)}>{line.short}</span></p>
      </div>
      {topNotes.length ? <div className="mt-3 space-y-2">{topNotes.map((note) => <Notice key={note.id} kind={note.kind} onClose={() => setTopNotes((old) => old.filter((item) => item.id !== note.id))}>{note.text}{note.id === 'from-event' && setupState !== 'yes' ? <> <a href={setupLink} className="font-bold text-indigo-800 underline underline-offset-4">この大会の申し込みページを作る →</a></> : null}</Notice>)}</div> : null}

      <header className="mt-3"><h1 className="text-balance text-2xl font-bold">{fresh && !titleReal ? '4つの手順で、対戦カードを作ります。' : '試合の準備'}</h1></header>

      <div className="mt-3 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* 4つの手順: 現在地・できた・まだ（スマホは上にくっつく / PCは左）。いちばん上に置く */}
        <nav ref={navRef} aria-label="4つの手順" className="tos-nav sticky top-0 z-30 -mx-4 border-b-2 border-slate-300 bg-white/95 px-2 py-2 backdrop-blur lg:top-4 lg:mx-0 lg:rounded-2xl lg:border-2 lg:p-2">
          <ol className="grid grid-cols-4 gap-1 lg:grid-cols-1 lg:gap-2">{steps.map(([id, label, short], i) => {
            const isDone = doneList[i], isNow = nowStep === i;
            return <li key={id} className="min-w-0"><a href={'#' + id} onClick={(e) => { e.preventDefault(); jump(id); }} aria-current={isNow ? 'step' : undefined}
              className={cls('flex min-h-12 flex-col items-center justify-center rounded-xl border-2 px-1 py-1 text-center text-[17px] font-bold leading-tight lg:items-start lg:px-3 lg:text-left', isDone ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : isNow ? 'border-4 border-indigo-700 bg-indigo-50 text-indigo-950' : 'border-slate-500 bg-slate-50 text-slate-800')}>
              <span className="flex flex-wrap items-center justify-center gap-x-1 lg:justify-start"><span aria-hidden="true" className="shrink-0">{isDone ? '✓' : isNow ? '▶' : ''}{i + 1}</span><span className="sr-only">{i + 1} </span><span className="lg:hidden">{short}</span><span className="hidden lg:inline">{label}</span></span>
              <span aria-hidden="true">{isDone ? 'できた' : isNow ? '次にやる' : 'まだ'}</span>
              <span className="sr-only">{isDone ? 'できた' : isNow ? 'まだ（次にやる）' : 'まだ'}</span>
            </a></li>;
          })}</ol>
          <p className="mt-1 text-center text-[17px] font-bold text-slate-900 lg:hidden">{nowStep >= 0 ? '▶ 次にやる：' + (nowStep + 1) + ' ' + steps[nowStep][1] : '✓ ぜんぶできました'}</p>
        </nav>

        <div className="mt-4 min-w-0 max-w-4xl space-y-5 lg:mt-0">
          {conflict ? <div id="conflict-box" tabIndex={-1} className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 focus:outline-none">
            <p className="font-bold text-amber-950">⚠ 別の画面で、この大会の内容が変わりました。このまま保存すると、そちらの変更が消えます。</p>
            <p className="mt-1 text-[17px] font-medium">（試合当日の画面や、別の画面を開いたままのときに起こります）</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button type="button" className={cls(btn.base, btn.outlineBig)} onClick={keepMine}>いまの入力を残す（保存すると、別の画面の変更は消えます）</button>
              <button type="button" id="use-other-trigger" className={cls(btn.base, btn.outlineBig)} onClick={useOther}>別の画面の内容を使う（いま入れた分は消えます）</button>
            </div>
            {ask?.kind === 'other' ? <ConfirmBox key={ask.nonce} id="confirm-other" label="確認：別の画面の内容を使うか" {...useOtherBoxText({ mine: data, latest: ask.latest })} yesLabel="別の画面の内容にする（いまの入力は消える）" noLabel="やめる（何も変えない）" onYes={answerYes} onNo={answerNo} /> : null}
          </div> : null}

          {nextCard}
          {backupJump}
          {googleBox}
          {otherFold}

          {/* ───── 1 ───── */}
          <Section id="sec-1" title="1. 大会の情報" done={done1}>
            <p className="max-w-[38em] font-medium">対戦カードの画面に出る、大会の名前と日にちです。Googleのシートに書いたものと同じものを入れます。</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="min-w-0 sm:col-span-2">
                <div className="flex flex-wrap items-baseline"><label htmlFor="field-title" className="text-lg font-bold">大会名</label><Badge required /></div>
                <input id="field-title" className={cls(inputClass, 'scroll-mt-28')} value={titleReal ? data.title : ''} placeholder="例: ○○ジム交流大会" autoComplete="off" aria-describedby="title-hint" onChange={(e) => edit('title', e.target.value)} />
                <p id="title-hint" className={cls('mt-1 text-[17px] font-bold', titleReal ? 'text-emerald-800' : 'text-amber-950')}>{titleReal ? '✓ 入りました' : '⚠ 大会の名前を入れてください'}</p>
                <p className="text-[17px] font-medium text-slate-800">できあがり見本：対戦カードの上に「{titleReal ? data.title : '第3回 ○○ジム交流大会'}」と出ます。</p>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline"><label htmlFor="field-date" className="text-lg font-bold">開催日</label><Badge text="なくてもOK（あとでOK）" /></div>
                <input id="field-date" className={cls(inputClass, 'scroll-mt-28')} inputMode="numeric" autoComplete="off" placeholder="例: 20271003（数字だけでOK）" aria-describedby="date-hint" value={data.date} onChange={(e) => edit('date', e.target.value)} onBlur={(e) => { if (!isCompleteDate(e.target.value)) return; const next = formatDateInput(e.target.value); if (next !== e.target.value) edit('date', next); }} />
                {data.date.trim() && !dateOk ? <p id="date-hint" className="mt-1 text-[17px] font-bold text-amber-950">⚠ 日にちまで入れてください。例：20271003（半角でも全角でもOK）</p>
                  : dateOk ? <p id="date-hint" className="mt-1 text-[17px] font-bold text-emerald-800">→ {datePreview} ✓</p>
                  : <p id="date-hint" className="mt-1 text-[17px] font-medium text-slate-800">空のままでも、保存できます。入れるなら、数字だけでOK。20271003 → 2027年10月3日</p>}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline"><label htmlFor="field-venue" className="text-lg font-bold">会場</label><Badge /></div>
                <input id="field-venue" className={inputClass} placeholder="例: ○○体育館" autoComplete="off" value={data.venue} onChange={(e) => edit('venue', e.target.value)} />
              </div>
            </div>

            <Fold title={<span>選手に書いてもらうこと <Chip tone="slate">申し込みページは変わりません</Chip></span>} className="border-slate-300">
              <p className="max-w-[38em] font-medium">いつも書いてもらうもの：名前・ジム名・写真・身長・体重・戦績</p>
              <p className="mt-1 max-w-[38em] text-[17px] font-medium text-slate-800">ここで変えるのは、この画面の「1人ずつ入れる」と、他のジム用の入力画面です。</p>
              <div className="mt-4 space-y-5">
                <div role="group" aria-labelledby="music-label">
                  <p id="music-label" className="text-lg font-bold">入場曲を書いてもらう</p>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-sm">
                    {([[true, 'はい'], [false, 'いいえ']] as const).map(([value, label]) => <button key={label} type="button" aria-pressed={musicNow === value} onClick={() => edit('entryConfig', { ...entryConfig, music: value })}
                      className={cls(btn.base, 'min-h-14 text-xl', musicNow === value ? 'border-4 border-indigo-700 bg-indigo-50 text-indigo-900' : 'border-slate-500 bg-white text-slate-900')}>{musicNow === value ? '✓ えらんだ：' : ''}{label}</button>)}
                  </div>
                  <p className="mt-1 text-[17px] font-medium text-slate-800">{musicNow ? '入力画面：入場曲の欄が出ます。' : '入力画面：入場曲の欄は出ません。'}</p>
                </div>
                <div className="grid max-w-md gap-4">{([['grade', '学年'], ['age', '年齢'], ['comment', '意気込み']] as const).map(([k, label]) => <div key={k} className="min-w-0">
                  <label htmlFor={'cfg-' + k} className="text-lg font-bold">{label}</label>
                  <select id={'cfg-' + k} className={inputClass} value={entryConfig[k]} aria-describedby={'cfg-' + k + '-line'} onChange={(e) => setEntryMode(k, e.target.value as EntryFieldMode)}>
                    <option value="off">出さない</option>
                    <option value="optional">書く（空でもOK）</option>
                    <option value="required">必ず書く</option>
                  </select>
                  <p id={'cfg-' + k + '-line'} className="mt-1 text-[17px] font-medium text-slate-800">{modeLine(entryConfig[k])}</p>
                </div>)}</div>
              </div>
            </Fold>

            <Fold title="ジムの担当者だけ：別の方法で受付をつくる（作った人は押さない）" className="border-slate-300">
              <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 font-bold text-amber-950">⚠ 受付のURLをもう作った人は、ここは使いません。もう一度押すと、別の受付ができてしまいます。</p>
              <p className="mt-3 max-w-[38em] font-medium">「申し込みページをつくる画面」を使わずに、この画面の内容から、Googleの受付を作ります。</p>
              <dl className="mt-3 grid gap-1 rounded-xl border-2 border-slate-300 bg-slate-50 p-3 text-[17px] font-medium sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
                <dt className="font-bold">名前:</dt><dd className="min-w-0 break-words [overflow-wrap:anywhere]">{titleReal ? data.title : '（まだ）'}</dd>
                <dt className="font-bold">日にち:</dt><dd>{dateOk ? datePreview : '（まだ）'}</dd>
                <dt className="font-bold">入場曲:</dt><dd>{musicNow ? 'あり' : 'なし'}</dd>
              </dl>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href={googleSetup} aria-disabled={!googleReady || undefined} onClick={async (e) => { e.preventDefault(); if (!googleReady) { jump(titleReal ? 'field-date' : 'field-title'); return; } setGoogleFail(false); if(await save())location.href=googleSetup;else setGoogleFail(true); }} className={cls(btn.base, btn.outlineBig, 'text-balance')}>別の方法で受付をつくる →</a>
                <a href={entryLink} target="_blank" rel="noopener noreferrer" className={cls(btn.base, btn.outlineBig)}>入力画面を見る（他のジム用）</a>
              </div>
              {!googleReady ? <p className="mt-2 text-[17px] font-bold text-amber-950">⚠ 先に、大会の名前と日にちを入れてください</p> : null}
              <p className="mt-1 text-[17px] font-medium">「入力画面を見る」は、{VIEW_WINDOW_NOTE}</p>
              {googleFail ? <p className="mt-2 flex gap-2 text-[17px] font-bold text-rose-800"><span aria-hidden="true">!</span>保存できなかったので、先に進めません。下の「保存する」を押してから、もう一度やってください。</p> : null}
            </Fold>
          </Section>

          {/* ───── 2 ───── */}
          <Section id="sec-2" title="2. 選手を入れる" done={done2} doneText={'選手 ' + nFighters + '人'} todoText={'まだ（選手 ' + nFighters + '人）'}>
            <div className="rounded-2xl border-2 border-indigo-700 bg-white p-4">
              <h3 className="text-xl font-bold">申し込みが集まった選手を入れる</h3>
              {nFighters === 0 ? rosterHelp : <div className="mt-3"><Fold title="名簿ファイルの作り方（もう一度読み込むとき）" className="border-slate-300">{rosterHelp}</Fold></div>}
              <div id="pick-file-box" className="mt-4 scroll-mt-28">
                <label className={cls(btn.base, btn.outlineBig, 'w-full cursor-pointer text-balance focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-700 sm:w-auto sm:min-w-[16rem]')}>
                  <span>ファイルを選ぶ</span>
                  <input id="pick-file" type="file" accept={FILE_ACCEPT} className="sr-only" onChange={onPickFile} />
                </label>
                {nFighters > 0 ? <p className="mt-2 max-w-[38em] text-[17px] font-medium">もう一度読み込んでも、いる人は変わりません。新しい人だけ足されます。</p> : null}
              </div>
              {importBusy ? <p className="mt-3 font-bold text-slate-800">⏳ よみこんでいます…そのままお待ちください。閉じないでください。</p> : null}
              {importNote ? <div className="mt-3 space-y-2">
                <p id="import-result" tabIndex={-1} className="break-all text-[17px] font-medium text-slate-800 focus:outline-none">選んだファイル: {importNote.file}</p>
                {importNote.staleWarn ? <Notice kind="warn">前の大会の名簿が残っています。別の大会なら「新しい大会をつくる」から始めてください。</Notice> : null}
                <Notice kind={importNote.kind === 'ok' ? 'ok' : 'error'} onClose={() => setImportNote(null)} action={overwriteReady ? { label: 'ファイルの内容で' + overwriteReady.differs.length + '人を書きかえる', onClick: askOverwrite, id: 'overwrite-trigger' } : undefined}>
                  <p>{importNote.text}</p>
                  {importNote.kind === 'ok' ? <>
                    {importNote.noPhoto ? <p className="mt-1 font-medium">写真がない選手：{importNote.noPhoto}人（写真は、あとでOKです）</p> : null}
                    <p className="mt-1">次にすること：{na.label}（下の青いボタン）</p>
                  </> : null}
                </Notice>
                {ask?.kind === 'overwrite' && overwriteReady ? <ConfirmBox key={ask.nonce} id="confirm-overwrite" label="確認：ファイルの内容で名簿を書きかえるか" {...overwriteBoxText(overwriteReady.differs)} yesLabel={'ファイルの内容で書きかえる（' + overwriteReady.differs.length + '人）'} noLabel="やめる（何も変えない）" onYes={answerYes} onNo={answerNo} /> : null}
                {pendingLookalike ? <Notice kind="warn" action={{ label: '別の人なら、足す', onClick: applyLookalike }}>
                  <p>同じ名前の人が{pendingLookalike.extra.length}人 重なっています。足していません。</p>
                  <p className="mt-1 font-medium">{pendingLookalike.extra.slice(0, 3).map((f) => f.name).join('、')}{pendingLookalike.extra.length > 3 ? ' ほか' : ''}（名前とジムが、前からいる人と同じです）</p>
                  <p className="mt-1 font-medium">同じ人なら、何もしなくてOKです。別の人のときだけ、下を押します。</p>
                </Notice> : null}
              </div> : null}
            </div>

            <p className="rounded-xl border-2 border-slate-300 bg-slate-100 p-3 font-medium"><span aria-hidden="true">🔒 </span>電話番号・メール・住所・生年月日・保護者名は入れません。入れた内容は、インターネットに送りません。</p>

            <Fold title="ほかの入れ方（Excel・他のジム・1人ずつ）" className="border-slate-300">
              <div className="space-y-4">
                <Fold title="Excelの表を使う" className="border-slate-300">
                  <ol className="max-w-[38em] list-decimal space-y-1 pl-6 font-medium">
                    <li>「選手入力シートを保存する」を押して、Excelをダウンロードします。</li>
                    <li>Excelに選手を書いて、保存します。</li>
                    <li>上の「ファイルを選ぶ」で、そのExcelを選びます。</li>
                  </ol>
                  <a href="/templates/Tournament_OS_選手入力テンプレート.xlsx" download className={cls(btn.base, btn.outlineBig, 'mt-3 w-full sm:w-auto')}>選手入力シートを保存する</a>
                </Fold>
                <Fold title="ほかのジムからまとめて受け取る" className="border-slate-300">
                  <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 font-bold text-amber-950">⚠ これは他のジム用です。選手本人に渡すURLは、「申し込みページをつくる画面」でできます。</p>
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
                  <p aria-live="polite" className="mt-2 font-bold text-emerald-800">{copyState === 'ok' ? '✓ コピーしました' : ''}</p>
                  {copyState === 'fail' ? <div className="mt-2">
                    <p className="text-[17px] font-bold text-slate-900">コピーできませんでした。下の四角の中をクリックして、「Ctrl」を押しながら「A」（全部選ぶ）、つづけて「Ctrl」を押しながら「C」（コピー）を押します。</p>
                    <input readOnly aria-label="コピーするURL" value={location.origin + entryLink} onFocus={(e) => e.currentTarget.select()} className={cls(inputClass, 'break-all')} />
                  </div> : null}
                </Fold>
                <Fold title="1人ずつ入れる" className="border-slate-300">
                  <FighterFields value={manual} config={entryConfig} prefix="manual" invalid={manualInvalid} describedBy="manual-errors" onChange={(k, v) => { setManual((old) => ({ ...old, [k]: v })); setManualErrors([]); setManualNote(''); }} />
                  <button type="button" onClick={addManual} className={cls(btn.base, btn.outlineBig, 'mt-4 w-full sm:w-auto')}>この選手を追加</button>
                  {manualErrors.length ? <div id="manual-errors" role="status" className="mt-3 rounded-xl border-2 border-rose-600 bg-rose-50 p-3 text-[17px] font-bold text-rose-900">
                    <p><span aria-hidden="true">! </span>次の{manualErrors.length}か所を直してください。</p>
                    <ul className="mt-1 list-disc space-y-1 pl-6">{manualErrors.map((error) => <li key={error}>{error}</li>)}</ul>
                  </div> : null}
                  {manualNote ? <p role="status" className="mt-3 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-3 font-bold text-emerald-900">{manualNote}</p> : null}
                </Fold>
              </div>
            </Fold>

            {/* 選手の一覧 */}
            <div>
              {nFighters === 0
                ? <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 font-bold text-amber-950">⚠ まだ0人です。上の「ファイルを選ぶ」から入れます。</p>
                : <div className="space-y-2">
                  <p className="rounded-xl border-2 border-emerald-700 bg-emerald-50 p-3 font-bold text-emerald-900">✓ {nFighters}人 入っています（写真あり {withPhoto} / なし {nFighters - withPhoto}）</p>
                  {withPhoto < nFighters ? <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 font-bold text-amber-950">⚠ 写真がない人 {nFighters - withPhoto}人（写真は、あとでOKです）</p> : null}
                </div>}
              {nFighters > 0 ? <div className="mt-3"><Fold title={'選手の一覧（' + nFighters + '人）'} open={listOpen} onToggle={setListPref}>
                {nFighters > 8 ? <div className="mb-3"><label htmlFor="fighter-filter" className="text-lg font-bold">名前やジムで探す</label><input id="fighter-filter" className={inputClass} value={query} placeholder="例: 山田" autoComplete="off" onChange={(e) => setQuery(e.target.value)} /></div> : null}
                {listOpen ? <div className="grid gap-3 sm:grid-cols-2">{shownFighters.map((fighter) => {
                  const editing = editingId === fighter.id;
                  const otherEditing = editDirty && !editing;
                  return <article key={fighter.id} id={'fighter-' + fighter.id} className={cls('min-w-0 scroll-mt-28 rounded-xl border-2 border-slate-300 bg-white p-3', editing ? 'sm:col-span-2' : '')}>
                    <div className="flex gap-3">
                      <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100">{fighter.photoDataUrl ? <img src={fighter.photoDataUrl} alt="" className="h-full w-full object-contain" /> : <span className="grid h-full place-items-center px-1 text-center text-[17px] text-slate-700">写真なし</span>}</div>
                      <div className="min-w-0 flex-1 break-words">
                        <p className="text-lg font-bold">{fighter.name}</p>
                        <p className="text-[17px] font-medium">{fighter.gym}</p>
                        <p className="text-[17px] font-medium">{kgText(fighter.weight)}{fighter.record ? '・' + fighter.record : ''}</p>
                        {!fighter.photoDataUrl ? <p className="mt-1"><Chip tone="slate">写真：あとでOK</Chip></p> : null}
                      </div>
                    </div>
                    {editing ? <div className="mt-3 space-y-3 border-t-2 border-slate-200 pt-3">
                      <FighterFields value={draft} config={entryConfig} prefix={'edit-' + fighter.id} onChange={(k, v) => setDraft((old) => ({ ...old, [k]: v }))} />
                      <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={applyEdit} className={cls(btn.base, btn.outlineBig)}>この内容で直す</button>
                        <button type="button" onClick={() => setEditingId(null)} className={cls(btn.base, btn.outlineBig)}>やめる</button>
                      </div>
                    </div> : <div className="mt-3 flex flex-wrap gap-2">
                      <label className={cls(btn.base, btn.outlineBig, 'cursor-pointer focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-700')}>
                        <span>{photoBusy === fighter.id ? '⏳ 読んでいます…' : fighter.photoDataUrl ? '写真を変える' : '写真を選ぶ'}</span>
                        <input type="file" accept="image/*" aria-label={(fighter.photoDataUrl ? '写真を変える ' : '写真を選ぶ ') + fighter.name} className="sr-only" onChange={(e) => void choosePhoto(e, fighter.id)} />
                      </label>
                      <button type="button" aria-disabled={otherEditing || undefined} onClick={() => {
                        // 直している途中の入力があるうちは、ほかの人の「直す」を押しても、何もしない（途中の入力が消えないように）
                        if (otherEditing) { notify('info', '先に、いま直している人の「この内容で直す」か「やめる」を押してください。', 'toast'); jump('fighter-' + editingId); return; }
                        setDraft({ ...fighter }); setEditingId(fighter.id); setConfirmDeleteId(null);
                      }} aria-label={'直す ' + fighter.name} className={cls(btn.base, btn.outline)}>直す</button>
                      {confirmDeleteId === fighter.id ? <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border-2 border-slate-400 bg-slate-50 p-2">
                        <p className="w-full text-[17px] font-bold">{fighter.name}さんを消しますか？{placed.has(fighter.id) ? ' この人が入っている試合の選手も空になります。' : ''}</p>
                        <button type="button" onClick={() => removeFighter(fighter.id)} aria-label={'消す（決定） ' + fighter.name} className={cls(btn.base, btn.outline)}>消す</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className={cls(btn.base, btn.outline)}>やめる</button>
                      </div> : <button type="button" onClick={() => setConfirmDeleteId(fighter.id)} aria-label={'消す ' + fighter.name} className={cls(btn.base, btn.outline)}>消す</button>}
                    </div>}
                    {photoError?.id === fighter.id ? <p className="mt-2 flex gap-2 text-[17px] font-bold text-rose-800"><span aria-hidden="true">!</span>{photoError.text}</p> : null}
                  </article>;
                })}</div> : null}
              </Fold></div> : null}
            </div>
          </Section>

          {/* ───── 3 ───── */}
          <Section id="sec-3" title="3. 対戦カードを作る" done={done3} doneText={'試合 ' + nonBlank + 'つ'}>
            <p className="max-w-[38em] font-medium">赤コーナーと青コーナーの選手を選んで、1試合ずつ作ります。</p>
            <p className="text-lg font-bold">試合 {nonBlank} つ ／ 選手 {nFighters}人中 {placedCount}人が入っています</p>

            {unplaced.length > 0 && data.bouts.length > 0 ? <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
              <p className="font-bold">まだ試合に入っていない選手 {unplaced.length}人</p>
              <p className="text-[17px] font-medium">名前を押すと、空いている赤か青に入ります。</p>
              <ul className="mt-2 flex flex-wrap gap-2">{unplaced.map((fighter) => <li key={fighter.id} className="min-w-0"><button type="button" onClick={() => placeFighter(fighter)} className={cls(btn.base, btn.outline, 'max-w-full')}>{fighter.name}</button></li>)}</ul>
            </div> : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
              <div className="min-w-0">
                <button id="add-bout" type="button" aria-disabled={nFighters < 2 || undefined} onClick={addBout} className={cls(btn.base, btn.outlineBig, 'w-full scroll-mt-28 sm:w-auto sm:min-w-[14rem]')}>＋ 試合を追加</button>
                {nFighters < 2 ? <p className="mt-1 text-[17px] font-bold text-amber-950">⚠ まず選手を2人以上入れてください</p> : null}
              </div>
              {unplaced.length >= 2 ? <button type="button" onClick={makeSuggestion} className={cls(btn.base, btn.outlineBig, 'text-balance')}>おすすめの組み合わせを自動で作る</button> : null}
            </div>
            {suggestNote ? <div className="space-y-2">
              <Notice kind={suggestNote.kind} onClose={() => setSuggestNote(null)}>{suggestNote.text}{canUndoSuggestion ? '気に入らないときは「この案を取り消す」を押します。' : ''}</Notice>
              {canUndoSuggestion ? <button type="button" onClick={undoSuggestion} className={cls(btn.base, btn.outline)}>この案を取り消す</button> : null}
            </div> : null}

            {data.bouts.length === 0
              ? <p className="rounded-2xl border-2 border-dashed border-slate-400 bg-white p-5 text-center font-bold">まだ試合がありません。「＋ 試合を追加」を押します。</p>
              : <>
                <div>
                  <p className="font-bold">試合の一覧（押すと、その試合に移ります）</p>
                  <ul className="mt-2 space-y-1">{data.bouts.map((bout, index) => {
                    const red = byId.get(bout.redId), blue = byId.get(bout.blueId), kg = contractKg(red, blue);
                    return <li key={bout.id}><button type="button" onClick={() => jump('bout-' + index)} className="flex min-h-12 w-full min-w-0 items-center gap-2 rounded-lg border-2 border-slate-300 bg-white px-3 py-1 text-left text-[17px] font-medium break-words">
                      <b className="shrink-0">第{index + 1}試合</b>
                      <span className="min-w-0 flex-1 break-words">{red?.name ?? '（赤まだ）'} vs {blue?.name ?? '（青まだ）'}{kg ? ' ・' + kg : ''}</span>
                    </button></li>;
                  })}</ul>
                </div>
                <div className="space-y-4">{data.bouts.map((bout, index) => <BoutCard key={bout.id} bout={bout} index={index} total={data.bouts.length} fighters={data.fighters} groups={groups} byId={byId} placed={placed} bouts={data.bouts}
                  isCurrent={data.currentBout > 0 && index === data.currentBout} isSuggested={suggested.has(bout.id)} ruleCopied={ruleCopiedId === bout.id} onPatch={onPatch} onMove={onMove} onRemove={onRemove} />)}</div>
              </>}
          </Section>

          {/* ───── 4 ───── */}
          <Section id="sec-4" title="4. 保存して開く" done={done4}>
            <p className="max-w-[38em] font-medium">ここは、さいごの確認です。下のボタンで保存して、試合当日の画面を開きます。</p>
            <ul className="grid gap-2 sm:grid-cols-2">{([
              // 5つ目: あとでOK（なくても進める）の行。足りなくても、黄色にしない
              ['大会の名前', titleReal, titleReal ? '✓' : 'まだ', 'field-title', false],
              ['日にち', dateOk, dateOk ? '✓' : 'あとでOK', 'field-date', true],
              ['選手 ' + nFighters + '人', nFighters >= 2, nFighters >= 2 ? '✓' : 'まだ', 'sec-2', false],
              [nFighters === 0 ? '写真' : '写真 ' + withPhoto + '/' + nFighters, nFighters > 0 && withPhoto === nFighters, nFighters > 0 && withPhoto === nFighters ? '✓' : 'あとでOK', 'sec-2', true],
              ['試合 ' + nonBlank + 'つ', nonBlank >= 1 && boutIssues.length === 0, nonBlank >= 1 && boutIssues.length === 0 ? '✓' : 'まだ', 'sec-3', false],
              ['保存', done4, done4 ? '✓' : 'まだ', '', false],
            ] as const).map(([label, ok, mark, target, later]) => {
              const tone = cls('flex min-h-12 items-center justify-between gap-2 rounded-xl border-2 px-3 text-lg font-bold', ok ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : later ? 'border-slate-400 bg-slate-100 text-slate-900' : 'border-amber-500 bg-amber-50 text-amber-950');
              return <li key={label}>{target
                ? <a href={'#' + target} onClick={(e) => { e.preventDefault(); jump(target); }} className={tone}><span>{label}</span><span>{mark}</span></a>
                : <div className={tone}><span>{label}</span><span>{mark}</span></div>}</li>;
            })}</ul>
            {problemCount > 0 ? <div className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3">
              <p className="font-bold text-amber-950">⚠ 直すところ</p>
              <ul className="mt-2 space-y-2">
                {titleMissing ? <li className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1">大会の名前が入っていません。</span><button type="button" onClick={() => jump('field-title')} className={cls(btn.base, btn.outline)}>名前の欄へ</button></li> : null}
                {boutIssues.map((issue) => <li key={issue.index + issue.side} className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-words">{issue.text}</span><button type="button" onClick={() => jump('bout-' + issue.index + (issue.side === 'blue' ? '-blue' : '-red'))} className={cls(btn.base, btn.outline)}>第{issue.index + 1}試合へ</button></li>)}
                {otherCore ? <li>データのどこかが正しくありません。画面を読み込み直しても直らないときは、ジムの担当者に連絡してください。</li> : null}
              </ul>
            </div> : null}
            {warnCount > 0 ? <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 font-bold text-amber-950">
              <p className="min-w-0 flex-1">⚠ 気をつけたいところが{warnCount}つあります。このまま保存しても、だいじょうぶです。</p>
              {firstWarn >= 0 ? <button type="button" onClick={() => jump('bout-' + firstWarn)} className={cls(btn.base, btn.outline)}>見直す：第{firstWarn + 1}試合へ</button> : null}
            </div> : null}
            {done4 ? <div className="rounded-2xl border-2 border-emerald-700 bg-emerald-50 p-4">
              <p className="text-2xl font-bold text-emerald-900">じゅんび OK ✓</p>
              <p className="mt-1 max-w-[38em] font-medium">試合当日は、このパソコンで「試合当日の画面を開く」を押します。</p>
              {data.currentBout > 0 ? <div className="mt-3">
                <p className="text-[17px] font-medium">リハーサルのあとは、これを押すと、試合当日の画面が第1試合から始まります。</p>
                <button type="button" onClick={() => setData((old) => ({ ...old, currentBout: 0 }))} className={cls(btn.base, btn.outline, 'mt-2')}>試合当日の画面を第1試合にもどす</button>
              </div> : null}
            </div> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" aria-disabled={saveState === 'saving' || undefined} onClick={() => { void save(); }} className={cls(btn.base, btn.outlineBig)}>ここまでを保存する</button>
              <button type="button" aria-disabled={!canOpen || undefined} onClick={() => { void openLive(); }} className={cls(btn.base, btn.outlineBig)}>試合当日の画面を開く</button>
            </div>
            {!dateOk ? <p className="max-w-[38em] text-[17px] font-bold text-slate-900">日にちが空でも開けます。</p> : null}
            <p className="max-w-[38em] text-[17px] font-medium">{!canOpen ? '⚠ まだ開けません。上の「次にすること」と「直すところ」を見てください。' : VIEW_WINDOW_NOTE}</p>
          </Section>

          {/* ───── コピーのファイル（別のパソコンへ移す・こわれたとき） ───── */}
          <Fold id="backup" title={<span>コピーのファイルを作る・戻す{backupAt ? <> <BackupChip at={backupAt} stale={backupStale} /></> : <> <Chip tone="slate">別のパソコンに移すときは必要</Chip></>}</span>} open={backupOpen} onToggle={setBackupOpen} className="border-slate-300">
            <p className="max-w-[38em] font-medium">別のパソコンに移すときと、パソコンがこわれたときに使います。名簿・写真・対戦カード・書いてもらうことの設定が入ります。Googleの受付の設定は入りません。</p>
            <p className="mt-2 max-w-[38em] text-lg font-bold">このパスワードは忘れると戻せません。紙にも書いてください。</p>
            <div className="mt-4 max-w-md">
              <label htmlFor="backup-password" className="text-lg font-bold">パスワード（作るときも、戻すときも、この欄を使います）</label>
              <input id="backup-password" type={showPassword ? 'text' : 'password'} className={inputClass} value={password} placeholder="10文字以上のパスワード" autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
              <p className={cls('mt-1 text-[17px] font-bold', password.length >= 10 ? 'text-emerald-800' : 'text-slate-800')}>{password.length}/10文字{password.length >= 10 ? ' ✓' : ''}</p>
              <div className="mt-2"><button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} className={cls(btn.base, btn.outline)}>{showPassword ? '文字をかくす' : '文字を見る'}</button></div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
                <p className="text-lg font-bold">コピーを作る</p>
                <div className="mt-2">
                  <label htmlFor="backup-password2" className="text-lg font-bold">同じパスワードをもう一度</label><Badge />
                  <input id="backup-password2" type={showPassword ? 'text' : 'password'} className={inputClass} value={password2} placeholder="もう一度、同じものを入れる" autoComplete="new-password" onChange={(e) => setPassword2(e.target.value)} />
                  <p className={cls('mt-1 text-[17px] font-bold', password2 && password2 === password ? 'text-emerald-800' : password2 ? 'text-amber-950' : 'text-slate-800')}>{password2 ? (password2 === password ? '✓ 同じです' : '⚠ パスワードが同じではありません') : '入れると、打ち間違いを防げます。入れなくても、コピーは作れます。'}</p>
                </div>
                <button type="button" aria-disabled={!!passwordProblem || backupBusy || undefined} onClick={() => void download()} className={cls(btn.base, btn.outlineBig, 'mt-3 w-full')}>{backupBusy ? '作っています…' : 'パスワードをつけて、コピーを保存する'}</button>
                {passwordProblem ? <p className="mt-1 text-[17px] font-bold text-amber-950">⚠ 押せません：{passwordProblem}</p> : null}
              </div>
              <div className="min-w-0 rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
                <p className="text-lg font-bold">コピーのファイルから戻す</p>
                <ol className="mt-1 max-w-[38em] list-none space-y-1 pl-0 text-[17px] font-medium">
                  <li>1 上のパスワードを入れる（ファイルを作ったときのもの）</li>
                  <li>2 下の「コピーのファイルから戻す」を押して、ファイルを選ぶ</li>
                </ol>
                <label aria-disabled={restoreLocked || undefined} onClick={(e) => { if (restoreLocked) e.preventDefault(); }} className={cls(btn.base, btn.outlineBig, 'mt-3 w-full cursor-pointer focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-700')}>
                  <span>コピーのファイルから戻す</span>
                  <input id="restore-file" type="file" accept=".enc" aria-disabled={restoreLocked || undefined} onClick={(e) => { if (restoreLocked) e.preventDefault(); }} className="sr-only" onChange={onPickBackup} />
                </label>
                {restoreLocked ? <p className="mt-1 text-[17px] font-bold text-amber-950">⚠ 押せません：先に、上のパスワードを入れてください</p> : null}
                {ask?.kind === 'restore' ? <ConfirmBox key={ask.nonce} id="confirm-restore" label="確認：コピーのファイルから戻すか" {...restoreBoxText({ restored: ask.restored, current: data, dirty, everSaved })} yesLabel="上書きして戻す" noLabel="やめる（何も変えない）" onYes={answerYes} onNo={answerNo} /> : null}
              </div>
            </div>
            {msg && msg.area === 'backup' ? <div className="mt-4"><Notice kind={msg.kind} action={msg.tag === 'undo-restore' && dirty ? undefined : msg.action} onClose={() => setMsg(null)}>{msg.text}</Notice></div> : null}
          </Fold>
        </div>
      </div>
    </div>

    {/* ───── 画面の下にくっつく帯。状態ラインは1か所。塗りのボタンは、いまやることの1つだけ ───── */}
    {/* ボタンを押した瞬間に入力欄から外れても、帯の中身が入れ替わらないよう、押す前のフォーカスを動かさない */}
    <div ref={barRef} onMouseDown={(e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }} className="fixed inset-x-0 bottom-0 z-40 w-full [overflow-wrap:anywhere] border-t-2 border-slate-400 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.12)]">
      <div className="mx-auto max-w-6xl px-4 pt-2">
        {msg && msg.area !== 'backup' ? <div className="pb-2 lg:pl-[16.5rem]"><div className="max-w-4xl"><Notice compact inlineClose={failShown} live={msg.area === 'save' ? 'off' : undefined} kind={msg.kind} action={failShown ? undefined : msg.action} onClose={() => setMsg(null)}>{msg.text}</Notice></div></div> : null}
        <div className="tos-bar-grid lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-center lg:gap-6">
          {/* 失敗のときは、状態ラインと同じ行に「コピーのファイルを作る」を置く（帯が高くならず、いつも見える） */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p id="save-state" tabIndex={-1} aria-live="off" className={cls('text-lg font-bold leading-snug', lineTone)}>{failShown ? line.short : line.text}</p>
            {failShown && msg?.action ? <button type="button" onClick={msg.action.onClick} className={cls(btn.base, btn.outline, 'px-3')}>{msg.action.label}</button> : null}
          </div>
          <div className="mt-1 max-w-4xl lg:mt-0">
            {!keyboardUp ? <div className="flex items-stretch gap-2">
              <button type="button" aria-disabled={barDisabled || undefined} onClick={onBarPrimary} className={cls(btn.base, btn.primary, 'min-w-0 flex-1 text-balance text-lg [word-break:keep-all] sm:text-xl')}>{barLabel}</button>
              {showSecondarySave ? <button type="button" onClick={() => { void save(); }} className={cls(btn.base, btn.outlineBig, 'shrink-0')}>保存する</button> : null}
            </div> : na.kind !== 'conflict' ? <button type="button" aria-disabled={saveState === 'saving' || undefined} onClick={() => { void save(); }} className={cls(btn.base, btn.outline, 'w-full sm:w-auto')}>保存</button> : null}
            {!keyboardUp && na.kind === 'save' && saveState === 'idle' ? <p className="tos-bar-note mt-1 text-[17px] font-medium text-slate-800">保存すると、このパソコンの中に残ります。</p> : null}
          </div>
        </div>
      </div>
    </div>
  </main>
  {/* 読み上げ専用（見えない）。保存の結果は、ここで1回だけ読む。見える知らせと状態ラインは読み上げない。<main> の外に置くので、画面の文字の数には入らない */}
  <span id="save-announce" aria-live="polite" aria-atomic="true" className="sr-only">{announce}</span>
  </>;
}
