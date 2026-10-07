'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { boutWarnings, contractWeight, emptyTournament, importFighters, mergeFighters, validateTournament, WEIGHT_GAP_WARN_KG, type LocalBout, type LocalFighter, type LocalTournament } from '../../core/privateTournament.ts';
import { suggestBouts } from '../../core/boutSuggest.ts';
import { formatDateInput, isCompleteDate } from '../../core/dateInput.ts';
import { DEFAULT_ENTRY_CONFIG, entryConfigSearch, entryErrors, type EntryFieldMode, type EntryFormConfig } from '../../core/entryPackage.ts';
import { bytesToArrayBuffer, decryptBackup, encryptBackup, photoToDataUrl, PrivateSaveConflict, readPrivateEvent, watchPrivateEvent, writePrivateEvent } from '../lib/privateStore.ts';
import { boutProblems, clockText, contractKg, dropBlankBouts, FALLBACK_ERROR, importErrorText, ImportProblem, isBlankBout, isHalfBout, isTitleReal, nextActionKey, photoErrorText, sameExceptProgress, tidy, weightGap, type NextKey } from './logic.ts';
import { Badge, btn, Chip, cls, Fold, inputClass, Notice, Section } from './parts.tsx';

const blankFighter = (): LocalFighter => ({ id: crypto.randomUUID(), gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '', photoDataUrl: '' });
const kgText = (value: string) => value.trim() ? value.trim().replace(/kg$/i, '') + 'kg' : '体重未入力';
const VIEW_WINDOW_NOTE = '新しい画面が開きます。見終わったら、画面の上の「試合の準備」の名前を押してもどります。';
const FILE_ACCEPT = '.zip,.xlsx,.csv,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

type Msg = { kind: 'ok' | 'error' | 'info' | 'warn'; text: string; area: string; action?: { label: string; onClick: () => void } };
type ImportNote = { kind: 'ok' | 'error'; file: string; text: string; noPhoto?: number };
type FieldKey = 'name' | 'gym' | 'grade' | 'age' | 'height' | 'weight' | 'record' | 'comment' | 'musicUrl';

/* ───────── 選手の入力欄（1人ずつ入れる / 直す で共通） ───────── */
function FighterFields({ value, onChange, config, prefix }: { value: LocalFighter; onChange: (key: FieldKey, next: string) => void; config: EntryFormConfig; prefix: string }) {
  const rows: Array<{ key: FieldKey; label: string; required: boolean; hint?: string; unit?: string; mode?: 'numeric' | 'decimal' | 'text'; auto?: string; show: boolean }> = [
    { key: 'name', label: '選手名', required: true, show: true },
    { key: 'gym', label: 'ジム名', required: true, show: true },
    { key: 'grade', label: '学年', required: config.grade === 'required', hint: '例: 小6 / 中2 / 社会人', show: config.grade !== 'off' },
    { key: 'age', label: '年齢', required: config.age === 'required', hint: '例: 15（数字だけ）', mode: 'numeric', show: config.age !== 'off' },
    { key: 'height', label: '身長', required: true, hint: '例: 170', unit: 'cm', mode: 'decimal', show: true },
    { key: 'weight', label: '体重', required: true, hint: '例: 65', unit: 'kg', mode: 'decimal', show: true },
    { key: 'record', label: '戦績', required: true, hint: '初試合なら「初試合」', show: true },
    { key: 'comment', label: '意気込み', required: config.comment === 'required', show: config.comment !== 'off' },
    { key: 'musicUrl', label: '入場曲のリンク', required: config.music, hint: 'Apple Music か YouTube のリンク', show: config.music },
  ];
  return <div className="grid gap-4 sm:grid-cols-2">{rows.filter((row) => row.show).map((row) => <div key={row.key} className="min-w-0">
    <div className="flex flex-wrap items-baseline"><label htmlFor={prefix + '-' + row.key} className="text-lg font-bold">{row.label}</label><Badge required={row.required} /></div>
    <div className="flex items-center gap-2">
      <input id={prefix + '-' + row.key} className={inputClass} value={value[row.key]} placeholder={row.hint} inputMode={row.mode} autoComplete="off" onChange={(e) => onChange(row.key, e.target.value)} />
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
  const options = (side: 'red' | 'blue') => groups.map(([gym, list]) => <optgroup key={gym} label={gym || 'ジム名なし'}>{list.map((f) => {
    const other = side === 'red' ? bout.blueId : bout.redId;
    const mark = f.id === other ? '（もう片方に選択中）' : (placed.get(f.id) ?? 0) - (inThisBout(f.id) ? 1 : 0) > 0 ? '（配置ずみ）' : '';
    return <option key={f.id} value={f.id} disabled={f.id === other}>{`${f.name}（${gym ? gym + '・' : ''}${kgText(f.weight)}）${mark}`}</option>;
  })}</optgroup>);
  const profile = (f: LocalFighter | undefined) => f ? <div className="mt-3 flex min-w-0 items-center gap-3">
    <div aria-hidden="true" className="h-14 w-14 shrink-0 rounded-lg border-2 border-slate-300 bg-slate-200 bg-cover bg-center" style={f.photoDataUrl ? { backgroundImage: 'url(' + f.photoDataUrl + ')' } : undefined} />
    <div className="min-w-0 text-base font-medium leading-snug">
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
      <h3 id={'bout-' + index + '-title'} className="mr-auto text-xl font-bold">第{index + 1}試合</h3>
      {half || blank ? <Chip tone="amber">未完成</Chip> : null}
      {isSuggested ? <Chip tone="amber">案</Chip> : null}
      {isCurrent ? <Chip tone="indigo">▶ いま試合当日の画面に出ている試合</Chip> : null}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" aria-describedby={'bout-' + index + '-title'} aria-disabled={index === 0 || undefined} onClick={() => { if (index > 0) onMove(index, -1); }} className={cls(btn.base, btn.outline)}>↑ 上へ</button>
      <button type="button" aria-describedby={'bout-' + index + '-title'} aria-disabled={index === total - 1 || undefined} onClick={() => { if (index < total - 1) onMove(index, 1); }} className={cls(btn.base, btn.outline)}>↓ 下へ</button>
      <button type="button" aria-describedby={'bout-' + index + '-title'} onClick={() => onRemove(index)} className={cls(btn.base, btn.outline, 'ml-auto')}>消す</button>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1fr)]">
      <div className="min-w-0 rounded-xl border-l-8 border-rose-600 bg-rose-50 p-3">
        <span className="inline-flex min-h-8 items-center rounded-full bg-rose-600 px-3 text-base font-bold text-white">赤コーナー</span>
        <select id={'bout-' + index + '-red'} aria-label="赤コーナーの選手" aria-describedby={!bout.redId ? 'bout-' + index + '-red-hint' : undefined} aria-invalid={!bout.redId || undefined} className={cls(inputClass, 'border-rose-400')} value={bout.redId} onChange={(e) => onPatch(index, { redId: e.target.value })}>
          <option value="">赤の選手を選ぶ</option>{options('red')}
        </select>
        {!bout.redId ? <p id={'bout-' + index + '-red-hint'} className="mt-1 text-base font-bold text-amber-950">⚠ 赤の選手を選んでください</p> : null}
        {profile(red)}
      </div>
      <div className="flex min-w-0 flex-col items-stretch justify-center gap-2 md:items-center">
        {centerBadge}
        <button type="button" aria-describedby={'bout-' + index + '-title'} onClick={() => onPatch(index, { redId: bout.blueId, blueId: bout.redId })} className={cls(btn.base, btn.outline)}>赤青を入替</button>
      </div>
      <div className="min-w-0 rounded-xl border-l-8 border-blue-600 bg-blue-50 p-3">
        <span className="inline-flex min-h-8 items-center rounded-full bg-blue-600 px-3 text-base font-bold text-white">青コーナー</span>
        <select id={'bout-' + index + '-blue'} aria-label="青コーナーの選手" aria-describedby={!bout.blueId ? 'bout-' + index + '-blue-hint' : undefined} aria-invalid={!bout.blueId || undefined} className={cls(inputClass, 'border-blue-400')} value={bout.blueId} onChange={(e) => onPatch(index, { blueId: e.target.value })}>
          <option value="">青の選手を選ぶ</option>{options('blue')}
        </select>
        {!bout.blueId ? <p id={'bout-' + index + '-blue-hint'} className="mt-1 text-base font-bold text-amber-950">⚠ 青の選手を選んでください</p> : null}
        {profile(blue)}
      </div>
    </div>
    {red && blue ? <p className="mt-3 text-base font-medium">{contract ? '試合当日の画面には「' + contract + '」と出ます。' : '体重がわからないので、体重の区分（階級）の文字が出ます。'}</p> : null}
    {warnings.length ? <div className="mt-3 space-y-2">
      {warnings.map((w) => <p key={w} role="status" className="rounded-xl border-2 border-amber-500 bg-amber-50 p-2 text-base font-bold text-amber-950">⚠ {w}</p>)}
      <p className="text-base font-medium">このままでも大丈夫です。気になるときだけ選び直してください。</p>
    </div> : null}
    <div className="mt-3">
      <Fold title="ルール・体重の区分（なくてもOK）" className="border-slate-300">
        <p className="text-base font-medium">ふつうは体重から自動で出ます。</p>
        {ruleCopied ? <p className="mt-1 text-base font-bold text-emerald-800">まえの試合と同じルールを入れました</p> : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0"><label htmlFor={'bout-' + index + '-class'} className="text-lg font-bold">体重の区分（階級）</label><input id={'bout-' + index + '-class'} className={inputClass} value={bout.className} placeholder="例: 60kg" onChange={(e) => onPatch(index, { className: e.target.value })} /></div>
          <div className="min-w-0"><label htmlFor={'bout-' + index + '-rule'} className="text-lg font-bold">ルール</label><input id={'bout-' + index + '-rule'} className={inputClass} value={bout.rule} placeholder="例: キックボクシング 2分2R" onChange={(e) => onPatch(index, { rule: e.target.value })} /></div>
        </div>
      </Fold>
    </div>
  </article>;
});

/* ───────── 画面本体 ───────── */
export default function PrivateAdmin() {
  const [data, setData] = useState<LocalTournament>(() => emptyTournament('my-tournament'));
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [everSaved, setEverSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [importNote, setImportNote] = useState<ImportNote | null>(null);
  const [importBusy, setImportBusy] = useState(false);
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
  const [copyState, setCopyState] = useState<'ok' | 'fail' | null>(null);
  const [googleFail, setGoogleFail] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [suggested, setSuggested] = useState<Set<string>>(() => new Set());
  const [suggestNote, setSuggestNote] = useState<{ kind: 'warn' | 'ok'; text: string; ids: string[] } | null>(null);
  const [ruleCopiedId, setRuleCopiedId] = useState('');
  const [keyboardUp, setKeyboardUp] = useState(false);

  const savedRef = useRef<LocalTournament | null>(null);
  /** 「保存ずみ」とみなす画面の中身。空の試合カードを画面に残したまま保存できるように、保存した中身とは分けて持つ */
  const cleanRef = useRef<LocalTournament | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const savingRef = useRef(false);
  const pendingJump = useRef<{ id: string; box?: string } | null>(null);
  const lastTouched = useRef(-1);
  const backupAutoOpened = useRef(false);
  const entryConfig: EntryFormConfig = data.entryConfig ?? DEFAULT_ENTRY_CONFIG;
  const dirty = ready && !loadError && data !== cleanRef.current;

  // 明るい配色（/apply と同じ決まり）。画面を離れたら元に戻す
  useEffect(() => { const before = document.title; return () => { document.title = before; }; }, []);
  useEffect(() => {
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => { if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); };
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('event')?.trim() || 'my-tournament';
    readPrivateEvent(id).then((saved) => {
      const value = saved ?? emptyTournament(id);
      savedRef.current = value; cleanRef.current = value; setEverSaved(!!saved);
      // 「受付をつくる」画面から来たときは、そこで読み取った大会の名前・日にち・会場を、空の欄にだけ入れる
      let shown = value;
      try {
        const given = new URLSearchParams(location.hash.replace(/^#/, ''));
        const t = (given.get('t') ?? '').trim().slice(0, 100), d = formatDateInput((given.get('d') ?? '').trim().slice(0, 30)), v = (given.get('v') ?? '').trim().slice(0, 100);
        const patch: Partial<LocalTournament> = {};
        if (t && !isTitleReal(value.title)) patch.title = t;
        if (d && isCompleteDate(d) && !isCompleteDate(value.date)) patch.date = d;
        if (v && !value.venue.trim()) patch.venue = v;
        if (Object.keys(patch).length) shown = { ...value, ...patch };
      } catch { /* 入れなくても進められる */ }
      setData(shown); setReady(true);
    }).catch(() => { setLoadError('このパソコンの保存データを読み取れませんでした。データは消していません。'); setReady(true); });
  }, []);

  // 保存していない変更があるとき: 閉じる前に確認し、タイトルに ● を付ける
  useEffect(() => {
    document.title = (dirty ? '● ' : '') + '試合の準備';
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  // 別の画面（試合当日の画面など）が保存したとき
  useEffect(() => {
    if (!ready || loadError) return;
    const eventId = dataRef.current.eventId;
    return watchPrivateEvent(eventId, () => {
      void readPrivateEvent(eventId).then((latest) => {
        if (!latest) return;
        const base = savedRef.current;
        if (base && latest.updatedAt === base.updatedAt) return; // 自分の保存
        if (dataRef.current === cleanRef.current) { savedRef.current = latest; cleanRef.current = latest; setData(latest); return; }
        if (base && sameExceptProgress(latest, base)) {
          setData((old) => ({ ...old, updatedAt: latest.updatedAt, currentBout: Math.min(latest.currentBout, Math.max(0, old.bouts.length - 1)) }));
          return;
        }
        setConflict(true);
      }).catch(() => undefined);
    });
  }, [ready, loadError]);

  // 知らせは少したつと消える（エラーは残る）
  useEffect(() => {
    if (!msg || msg.kind === 'error') return;
    const timer = window.setTimeout(() => setMsg((current) => current === msg ? null : current), msg.action ? 12_000 : 10_000);
    return () => window.clearTimeout(timer);
  }, [msg]);

  const notify = useCallback((kind: Msg['kind'], text: string, area = 'toast', action?: Msg['action']) => { setMsg({ kind, text, area, action }); if (area === 'backup') setBackupOpen(true); }, []);

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
  const onRemove = useCallback((index: number) => {
    const current = dataRef.current, removed = current.bouts[index];
    if (!removed) return;
    setData((old) => ({ ...old, bouts: old.bouts.filter((_, i) => i !== index), currentBout: Math.min(old.currentBout, Math.max(0, old.bouts.length - 2)) }));
    if (isBlankBout(removed)) return;
    const shift = current.currentBout > 0 && index <= current.currentBout ? ' 試合当日の画面の「いまの試合」がずれます。' : '';
    notify('ok', '第' + (index + 1) + '試合を消しました。' + shift, 'toast', { label: '元にもどす', onClick: () => { setData((old) => { const next = [...old.bouts]; next.splice(Math.min(index, next.length), 0, removed); return { ...old, bouts: next }; }); setMsg(null); } });
  }, [notify]);

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
  const save = async (source?: LocalTournament): Promise<boolean> => {
    if (savingRef.current) return false;
    savingRef.current = true; setSaving(true);
    const base = source ?? data;
    try {
      // 赤も青も空の試合は、保存した中身には入れない（保存は止めない）。作業中の空のカードは、画面にそのまま残す
      const toWrite = dropBlankBouts(base);
      const saved = await writeOnce(toWrite);
      const screen: LocalTournament = toWrite === base ? saved : { ...saved, bouts: base.bouts };
      savedRef.current = saved; cleanRef.current = screen; setEverSaved(true); setConflict(false);
      setData((old) => source || old === base ? screen : { ...old, updatedAt: saved.updatedAt });
      if (!backupAutoOpened.current) { backupAutoOpened.current = true; setBackupOpen(true); }
      const unfinished = saved.bouts.filter(isHalfBout).length + (isTitleReal(saved.title) ? 0 : 1);
      notify('ok', '保存しました。このパソコンの中に残ります。' + (unfinished > 0 ? 'まだ直すところが' + unfinished + 'つあります（試合当日の画面を開く前に直します）。' : ''), 'save');
      return true;
    } catch (error) {
      if (error instanceof PrivateSaveConflict) {
        setConflict(true);
        notify('error', '別の画面で内容が変わっていたので、保存しませんでした。入れた内容は画面に残っています。上の黄色い案内から、どちらを使うか選んでください。', 'save', { label: '黄色い案内を見る', onClick: () => jump('conflict-box') });
      } else notify('error', '保存できませんでした。入力内容は画面に残っています。このパソコンの空き容量を確認して、もう一度「保存する」を押してください。', 'save');
      return false;
    } finally { savingRef.current = false; setSaving(false); }
  };

  /* 選手ファイルを読み込む */
  const readEntryFile = async (file?: File) => {
    if (!file) return;
    setImportBusy(true); setImportNote(null);
    let blocked: string[] = [];
    try {
      if(file.size>100*1024*1024)throw new ImportProblem('too-large');
      let csv = '';
      let photos: Record<string, Uint8Array> = {};
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.zip')) {
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
      } else if (lower.endsWith('.xlsx')) {
        const { readSheet } = await import('read-excel-file/browser');
        let rows;
        try { rows = await readSheet(file, '選手入力'); } catch { throw new ImportProblem('no-sheet'); }
        csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
      } else {
        csv = await file.text();
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
      // Validate before scheduling the state update; existing card order and current bout stay intact.
      const merged = mergeFighters(data.fighters,fighters);
      setData((old) => ({ ...old, fighters:mergeFighters(old.fighters,fighters) }));
      const before = new Set(data.fighters.map((fighter) => fighter.id));
      const fresh = fighters.filter((fighter) => !before.has(fighter.id)).length;
      setImportNote({ kind: 'ok', file: file.name, noPhoto: merged.filter((fighter) => !fighter.photoDataUrl).length, text: fighters.length + '人分を読み込みました（写真 ' + fighters.filter((fighter) => fighter.photoDataUrl).length + '枚）。' + (before.size > 0 ? 'このうち、新しく入った人は' + fresh + '人です。前からいた人は、そのままです。' : '') });
      setListPref(true);
    } catch (error) {
      setImportNote({ kind: 'error', file: file.name, text: importErrorText(error, blocked) });
    } finally { setImportBusy(false); }
  };
  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void readEntryFile(file); };

  /* 選手を1人ずつ入れる / 直す / 消す / 写真 */
  const addManual = () => {
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
    setSuggestNote({ kind: 'ok', ids: added.map((bout: LocalBout) => bout.id), text: 'おすすめの組み合わせを' + added.length + 'つ、いちばん下に足しました。気に入らないときは「この案を取り消す」を押します。' + (left > 0 ? 'のこり' + left + '人は、相手が見つからなかったので、まだ入っていません。' : '') });
    pendingJump.current = { id: 'bout-' + data.bouts.length };
  };
  const undoSuggestion = () => {
    if (!suggestNote) return;
    const ids = new Set(suggestNote.ids);
    edit('bouts', data.bouts.filter((bout) => !ids.has(bout.id)));
    setSuggested((old) => new Set([...old].filter((id) => !ids.has(id))));
    setSuggestNote(null);
  };

  /* 予備ファイル */
  const passwordProblem = password.length < 10 ? 'あと' + (10 - password.length) + '文字必要です' : password2 && password2 !== password ? 'パスワードが同じではありません' : '';
  const [passwordMessage, setPasswordMessage] = useState('');
  const download = async () => {
    if (passwordProblem) { setPasswordMessage(passwordProblem.startsWith('あと') ? 'パスワードは10文字以上にしてください。' : passwordProblem + '。もう一度ていねいに入れてください。'); return; }
    setPasswordMessage('');
    try {
      const encrypted = await encryptBackup(data, password);
      const url = URL.createObjectURL(new Blob([encrypted], { type: 'application/octet-stream' }));
      const a = document.createElement('a'); a.href = url; a.download = data.eventId + '.tournament.enc'; a.click();
      // Give the browser time to start its download before releasing the file URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      notify('ok', 'コピーのファイルを保存しました。パソコンの「ダウンロード」の中を見て、ファイルがあるか確かめてください。パスワードは別に、紙に書いて保管してください。', 'backup');
    } catch { notify('error', FALLBACK_ERROR, 'backup'); }
  };
  const restore = async (file?: File) => {
    if (!file) return;
    try {
      const restored = await decryptBackup(await file.text(), password);
      if(restored.eventId!==data.eventId)return notify('error', '別の大会のコピーのファイルです。この大会のデータは変えていません。', 'backup');
      if(!window.confirm('コピーの内容に戻します。今のデータを上書きしてよろしいですか？（いまの内容は消えます）'))return;
      if(await save({...restored,updatedAt:data.updatedAt}))notify('ok', '戻しました。内容を見て確かめてください。', 'backup');
    }
    catch { notify('error', '戻せませんでした。パスワードがちがうか、別のファイルかもしれません。上のパスワード欄を見て、もう一度やってください。', 'backup'); }
  };
  const onPickBackup = (e: ChangeEvent<HTMLInputElement>) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void restore(file); };

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

  const titleReal = isTitleReal(data.title);
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
  const done1 = titleReal && dateOk, done2 = nFighters >= 2, done3 = nonBlank >= 1 && boutIssues.length === 0, done4 = !dirty && everSaved && validOk;
  const doneList = [done1, done2, done3, done4];
  const nowStep = doneList.findIndex((done) => !done);
  const warnCount = data.bouts.reduce((sum, bout) => sum + boutWarnings(bout, data.fighters, data.bouts).length, 0);
  const googleReady = titleReal && dateOk;
  const fresh = nFighters === 0 && data.bouts.length === 0;
  const title = titleReal ? data.title : 'まだ入っていません';
  const firstWarn = data.bouts.findIndex((bout) => boutWarnings(bout, data.fighters, data.bouts).length > 0);
  const datePreview = dateOk ? formatDateInput(data.date) : '';

  const key: NextKey = nextActionKey({ titleReal, dateOk, fighters: nFighters, nonBlankBouts: nonBlank, halfIndex, dirty, everSaved, problems: problemCount, opened });
  const goToProblem = () => {
    if (nonBlank === 0) return jump('add-bout');
    const issue = boutIssues[0];
    if (issue) return jump('bout-' + issue.index + (issue.side === 'blue' ? '-blue' : '-red'));
    if (titleMissing) return jump('field-title');
    jump('sec-4');
  };
  const banner: Record<NextKey, { label: string; hint: string; run: () => void }> = {
    title: { label: '大会の名前を入れる', hint: '「1. 大会の情報」の、いちばん上の欄です。', run: () => jump('field-title') },
    date: { label: '日にちを入れる', hint: '例: 20271003 のように、数字だけ入れればOKです。', run: () => jump('field-date') },
    fighters: { label: '選手のファイルを選ぶ', hint: '申し込みで集めた選手のファイルを、「2. 選手を入れる」で選びます。', run: () => jump('pick-file', 'pick-file-box') },
    fighters2: { label: '選手をもう1人入れる', hint: '試合は2人いないと作れません。', run: () => jump('pick-file', 'pick-file-box') },
    bouts: { label: '試合を1つ作る', hint: '「＋ 試合を追加」を押して、赤と青の選手を選びます。', run: () => jump('add-bout') },
    half: { label: '第' + (halfIndex + 1) + '試合の' + (halfSide === 'red' ? '赤' : '青') + 'を選ぶ', hint: '選手が1人だけ入っている試合があります。', run: () => jump('bout-' + halfIndex + (halfSide === 'red' ? '-red' : '-blue')) },
    save: { label: '保存する', hint: 'ここまでの内容を、このパソコンの中に残します。', run: () => { void save(); } },
    fix: { label: '直すところを見る', hint: 'まだ直すところがあります。', run: goToProblem },
    open: { label: '試合当日の画面を開く', hint: '準備は終わりました。試合当日の画面で、確かめます。', run: () => { void openLive(); } },
    done: { label: '', hint: '', run: () => undefined },
  };
  const canOpen = validOk;
  async function openLive() {
    if (!canOpen) { goToProblem(); return; }
    let popup: Window | null = null;
    try { popup = window.open('', '_blank'); } catch { popup = null; }
    if (dirty && !(await save())) { popup?.close(); return; }
    setOpened(true);
    if (popup) { try { popup.opener = null; } catch { /* 古い画面では無視 */ } popup.location.href = live; } else location.href = live;
  }

  const listOpen = listPref ?? nFighters <= 8;
  const shownFighters = nFighters > 8 && query.trim() ? data.fighters.filter((fighter) => (fighter.name + fighter.gym).includes(query.trim())) : data.fighters;
  // 上の4つの手順の名前は、下の見出しと同じ。スマホでは、せまいので短い名前を使う
  const steps = [['sec-1', '大会の情報', '情報'], ['sec-2', '選手を入れる', '選手'], ['sec-3', '対戦カードを作る', '対戦'], ['sec-4', '保存して開く', '保存']] as const;
  const musicNow = entryConfig.music;
  const modeLine = (mode: EntryFieldMode) => mode === 'off' ? '入力画面：この欄は出ません。' : mode === 'optional' ? '入力画面：この欄が出ます（空でもOK）。' : '入力画面：この欄が出ます（必ず書く）。';
  const savedClock = clockText(data.updatedAt);

  return <main className="tos-read min-h-dvh bg-slate-50 pb-52 text-slate-950 [color-scheme:light] [word-break:auto-phrase]"
    onFocus={(e) => { const t = e.target as HTMLElement; setKeyboardUp(window.innerWidth < 640 && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'file', 'radio', 'button'].includes((t as HTMLInputElement).type)))); }}
    onBlur={() => setKeyboardUp(false)}>
    <div className="mx-auto w-full max-w-6xl px-4 py-4 lg:py-8">
      {/* 上のうすい帯 */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-base font-medium text-slate-800">
        <p className="min-w-0 break-words">大会の名前：<b className="font-bold">{title}</b></p>
        <a href={setupLink} className="inline-flex min-h-12 items-center font-bold text-indigo-800 underline underline-offset-4">まだ「選手に渡すURL」がない人は → 申し込みページをつくる画面</a>
      </div>

      {/* 見出し */}
      {fresh && !titleReal ? <header className="mt-3 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
        <p className="text-base font-bold text-indigo-800">試合の準備をします</p>
        <h1 className="mt-1 text-balance text-3xl font-bold leading-snug">4つの手順で、対戦カードを作ります。</h1>
        <p className="mt-2 max-w-[38em] font-medium">入れた内容は、このパソコンの中だけに残ります。インターネットには送りません。</p>
        <p className="mt-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 font-bold text-amber-950">⚠ このパソコンでだけ使えます。別のパソコンやスマホで開くと空です。</p>
      </header> : <header className="mt-3"><h1 className="text-balance text-2xl font-bold">試合の準備</h1></header>}
      <div className="mt-3"><Fold title="🔒 安心のしくみ" className="border-slate-300">
        <p className="max-w-[38em] font-medium">選手の名前・写真・体重・試合カードは、このパソコンの中にだけ保存します。インターネットには送りません。</p>
        <p className="mt-2 max-w-[38em] font-medium">別のパソコンやスマホで開くと、空です。同じパソコンの別の画面では、同じ内容が出ます。</p>
        <p className="mt-2 max-w-[38em] font-medium">Googleの受付の設定は、この保存とは別です。</p>
      </Fold></div>

      {/* 全体の流れ（いちばん最初のときだけ。ここがどこかを1行で） */}
      {nFighters === 0 ? <ol aria-label="全体の流れ" className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold text-slate-800">
        <li className="rounded-lg border-2 border-emerald-700 bg-emerald-50 px-2 py-0.5 text-emerald-900">✓ 申し込みページを作る</li>
        <li aria-hidden="true">→</li>
        <li className="rounded-lg border-2 border-emerald-700 bg-emerald-50 px-2 py-0.5 text-emerald-900">✓ 選手に渡す</li>
        <li aria-hidden="true">→</li>
        <li aria-current="step" className="rounded-lg border-2 border-amber-500 bg-amber-50 px-2 py-0.5 text-amber-950">▶ 名簿を入れて、対戦カードを作る</li>
      </ol> : null}

      {/* 次にやること */}
      <section aria-label="次にやること" className="mt-4 rounded-2xl border-2 border-indigo-700 bg-white p-4 shadow-sm">
        {key === 'done' ? <p className="text-xl font-bold text-emerald-800">✓ ぜんぶ終わりました</p> : <>
          <p className="text-base font-bold text-indigo-800">つぎは</p>
          <p className="mt-1 font-medium">{banner[key].hint}</p>
          <button type="button" onClick={banner[key].run} className={cls(btn.base, btn.primary, 'mt-3 w-full text-balance sm:w-auto sm:min-w-[20rem]')}>{banner[key].label} →</button>
        </>}
      </section>

      {conflict ? <div id="conflict-box" tabIndex={-1} className="mt-4 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 focus:outline-none">
        <p className="font-bold text-amber-950">⚠ 別の画面で、この大会の内容が変わりました。このまま保存すると、そちらの変更が消えます。</p>
        <p className="mt-1 text-base font-medium">（試合当日の画面や、別の画面を開いたままのときに起こります）</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <button type="button" className={cls(btn.base, btn.outlineBig)} onClick={() => { void readPrivateEvent(data.eventId).then((latest) => { if (latest) { savedRef.current = latest; cleanRef.current = latest; setData(latest); } setConflict(false); }).catch(() => notify('error', FALLBACK_ERROR)); }}>別の画面の内容を使う（いま入れた分は消えます）</button>
          <button type="button" className={cls(btn.base, btn.outlineBig)} onClick={() => { void readPrivateEvent(data.eventId).then((latest) => { if (latest) { savedRef.current = latest; setData((old) => ({ ...old, updatedAt: latest.updatedAt })); } setConflict(false); }).catch(() => notify('error', FALLBACK_ERROR)); }}>いまの入力を使う（保存すると、別の画面の変更は消えます）</button>
        </div>
      </div> : null}

      <div className="mt-4 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* 4つの手順（スマホは上にくっつく / PCは左） */}
        <nav aria-label="4つの手順" className="sticky top-0 z-30 -mx-4 border-b-2 border-slate-300 bg-white/95 px-2 py-2 backdrop-blur lg:top-4 lg:mx-0 lg:rounded-2xl lg:border-2 lg:p-2">
          <ol className="grid grid-cols-4 gap-1 lg:grid-cols-1 lg:gap-2">{steps.map(([id, label, short], i) => {
            const isDone = doneList[i], isNow = nowStep === i;
            return <li key={id} className="min-w-0"><a href={'#' + id} onClick={(e) => { e.preventDefault(); jump(id); }} aria-current={isNow ? 'step' : undefined}
              className={cls('flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-1 text-center text-base font-bold leading-tight lg:items-start lg:px-3 lg:text-left', isDone ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : isNow ? 'border-4 border-amber-500 bg-amber-50 text-amber-950' : 'border-slate-300 bg-slate-50 text-slate-700')}>
              <span className="flex items-center gap-1 lg:gap-2"><span aria-hidden="true" className="shrink-0">{isDone ? '✓' : isNow ? '▶' : i + 1}</span><span className="sr-only">{i + 1} </span><span className="lg:hidden">{short}</span><span className="hidden lg:inline">{label}</span></span>
              {isNow ? <span className="hidden rounded-full bg-amber-200 px-2 text-base font-bold leading-snug text-amber-950 lg:inline">いまここ</span> : null}
            </a></li>;
          })}</ol>
        </nav>

        <div className="mt-4 min-w-0 max-w-4xl space-y-5 lg:mt-0">
          {/* ───── 1 ───── */}
          <Section id="sec-1" title="1. 大会の情報" done={done1}>
            <p className="max-w-[38em] font-medium">対戦カードの画面に出る、大会の名前と日にちです。Googleのシートに書いたものと同じものを入れます。</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="min-w-0 sm:col-span-2">
                <div className="flex flex-wrap items-baseline"><label htmlFor="field-title" className="text-lg font-bold">大会名</label><Badge required /></div>
                <input id="field-title" className={cls(inputClass, 'scroll-mt-28')} value={titleReal ? data.title : ''} placeholder="例: ○○ジム交流大会" autoComplete="off" aria-describedby="title-hint" onChange={(e) => edit('title', e.target.value)} />
                <p id="title-hint" className={cls('mt-1 text-base font-bold', titleReal ? 'text-emerald-800' : 'text-amber-950')}>{titleReal ? '✓ 入りました' : '⚠ 大会の名前を入れてください'}</p>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline"><label htmlFor="field-date" className="text-lg font-bold">開催日</label><Badge required /></div>
                <input id="field-date" className={cls(inputClass, 'scroll-mt-28')} inputMode="numeric" autoComplete="off" placeholder="例: 20271003（数字だけでOK）" aria-describedby="date-hint" value={data.date} onChange={(e) => edit('date', e.target.value)} onBlur={(e) => { const next = formatDateInput(e.target.value); if (next !== e.target.value) edit('date', next); }} />
                {data.date.trim() && !dateOk ? <p id="date-hint" className="mt-1 text-base font-bold text-amber-950">⚠ 日にちまで入れてください。例：20271003（半角でも全角でもOK）</p>
                  : dateOk ? <p id="date-hint" className="mt-1 text-base font-bold text-emerald-800">→ {datePreview} ✓</p>
                  : <p id="date-hint" className="mt-1 text-base font-medium text-slate-800">数字だけでOK。20271003 → 2027年10月3日</p>}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline"><label htmlFor="field-venue" className="text-lg font-bold">会場</label><Badge /></div>
                <input id="field-venue" className={inputClass} placeholder="例: ○○体育館" autoComplete="off" value={data.venue} onChange={(e) => edit('venue', e.target.value)} />
              </div>
            </div>

            <div className="rounded-2xl border-2 border-slate-300 bg-slate-50 p-4">
              <h3 className="text-xl font-bold">選手に書いてもらうこと</h3>
              <p className="mt-2 max-w-[38em] font-medium">いつも書いてもらうもの：名前・ジム名・写真・身長・体重・戦績</p>
              <p className="mt-1 max-w-[38em] text-base font-bold text-amber-950">⚠ ここは、この画面の「1人ずつ入れる」と、他のジム用の入力画面に使います。すでに作った申し込みページは、ここを変えても変わりません。</p>
              <div className="mt-4 space-y-5">
                <div role="group" aria-labelledby="music-label">
                  <p id="music-label" className="text-lg font-bold">入場曲を書いてもらう</p>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-sm">
                    {([[true, 'はい'], [false, 'いいえ']] as const).map(([value, label]) => <button key={label} type="button" aria-pressed={musicNow === value} onClick={() => edit('entryConfig', { ...entryConfig, music: value })}
                      className={cls(btn.base, 'min-h-14 text-xl', musicNow === value ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-500 bg-white text-slate-900')}>{musicNow === value ? '✓ ' : ''}{label}</button>)}
                  </div>
                  <p className="mt-1 text-base font-medium text-slate-800">{musicNow ? '入力画面：入場曲の欄が出ます。' : '入力画面：入場曲の欄は出ません。'}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">{([['grade', '学年'], ['age', '年齢'], ['comment', '意気込み']] as const).map(([k, label]) => <div key={k} className="min-w-0">
                  <label htmlFor={'cfg-' + k} className="text-lg font-bold">{label}</label>
                  <select id={'cfg-' + k} className={inputClass} value={entryConfig[k]} aria-describedby={'cfg-' + k + '-line'} onChange={(e) => setEntryMode(k, e.target.value as EntryFieldMode)}>
                    <option value="off">書いてもらわない</option>
                    <option value="optional">書いてもらう（空でもOK）</option>
                    <option value="required">必ず書いてもらう</option>
                  </select>
                  <p id={'cfg-' + k + '-line'} className="mt-1 text-base font-medium text-slate-800">{modeLine(entryConfig[k])}</p>
                </div>)}</div>
              </div>
            </div>

            <Fold title="ジムの担当者だけ：別の方法で受付をつくる（作った人は押さない）" className="border-slate-300">
              <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 font-bold text-amber-950">⚠ 受付のURLをもう作った人は、ここは使いません。もう一度押すと、別の受付ができてしまいます。</p>
              <p className="mt-3 max-w-[38em] font-medium">「申し込みページをつくる画面」を使わずに、この画面の内容から、Googleの受付を作ります。</p>
              <dl className="mt-3 grid gap-1 rounded-xl border-2 border-slate-300 bg-slate-50 p-3 text-base font-medium sm:grid-cols-[auto_1fr] sm:gap-x-3">
                <dt className="font-bold">名前:</dt><dd className="break-words">{titleReal ? data.title : '（まだ）'}</dd>
                <dt className="font-bold">日にち:</dt><dd>{dateOk ? datePreview : '（まだ）'}</dd>
                <dt className="font-bold">入場曲:</dt><dd>{musicNow ? 'あり' : 'なし'}</dd>
              </dl>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href={googleSetup} aria-disabled={!googleReady || undefined} onClick={async (e) => { e.preventDefault(); if (!googleReady) { jump(titleReal ? 'field-date' : 'field-title'); return; } setGoogleFail(false); if(await save())location.href=googleSetup;else setGoogleFail(true); }} className={cls(btn.base, btn.outlineBig, 'text-balance')}>別の方法で受付をつくる →</a>
                <a href={entryLink} target="_blank" rel="noopener noreferrer" className={cls(btn.base, btn.outlineBig)}>入力画面を見る（他のジム用）</a>
              </div>
              {!googleReady ? <p className="mt-2 text-base font-bold text-amber-950">⚠ 先に、大会の名前と日にちを入れてください</p> : null}
              <p className="mt-1 text-base font-medium">「入力画面を見る」は、{VIEW_WINDOW_NOTE}</p>
              {googleFail ? <p className="mt-2 flex gap-2 text-base font-bold text-rose-800"><span aria-hidden="true">!</span>保存できなかったので、先に進めません。下の「保存する」を押してから、もう一度やってください。</p> : null}
            </Fold>
          </Section>

          {/* ───── 2 ───── */}
          <Section id="sec-2" title="2. 選手を入れる" done={done2}>
            <div className="rounded-2xl border-2 border-indigo-700 bg-white p-4">
              <h3 className="text-xl font-bold">申し込みが集まった選手を入れる</h3>
              <ol className="mt-3 max-w-[38em] list-decimal space-y-2 pl-6 font-medium">
                <li>Googleのシートを開きます（画面の上の、シートの名前を押します）。</li>
                <li>シートの上のメニュー「Tournament OS」→「④ OS用の名簿ZIPを作る」を押します。</li>
                <li>少し待つと、ファイルがパソコンに保存されます（「ダウンロード」というフォルダに入ります）。</li>
                <li>下の青いボタン「ファイルを選ぶ」を押して、そのファイル（名前の最後が .zip）を選びます。いちばん新しいものを選びます。</li>
              </ol>
              <p className="mt-2 max-w-[38em] text-base font-medium">ZIP ＝ 選手の一覧と写真がまとまった、1つのファイルのことです。</p>
              <div id="pick-file-box" className="mt-4 scroll-mt-28">
                <label className={cls(btn.base, btn.primary, 'w-full cursor-pointer text-balance focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-400 sm:w-auto sm:min-w-[16rem]')}>
                  <span>ファイルを選ぶ</span>
                  <input id="pick-file" type="file" accept={FILE_ACCEPT} className="sr-only" onChange={onPickFile} />
                </label>
              </div>
              {importBusy ? <p className="mt-3 font-bold text-slate-800">⏳ よみこんでいます…</p> : null}
              {importNote ? <div className="mt-3 space-y-2">
                <p className="break-all text-base font-medium text-slate-800">選んだファイル: {importNote.file}</p>
                <Notice kind={importNote.kind === 'ok' ? 'ok' : 'error'} onClose={() => setImportNote(null)}>
                  <p>{importNote.text}</p>
                  {importNote.kind === 'ok' ? <>
                    {importNote.noPhoto ? <p className="mt-1 rounded-lg bg-amber-50 p-2 text-amber-950">⚠ 写真がない選手が{importNote.noPhoto}人います。下の一覧で写真を選べます。</p> : null}
                    <p className="mt-1">つぎは「＋ 試合を追加」を押します。</p>
                  </> : null}
                </Notice>
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
                  <p className="mt-2 text-base font-medium">「設定した入力画面を確認」は、{VIEW_WINDOW_NOTE}</p>
                  <p aria-live="polite" className="mt-2 font-bold text-emerald-800">{copyState === 'ok' ? '✓ コピーしました' : ''}</p>
                  {copyState === 'fail' ? <div className="mt-2">
                    <p className="text-base font-bold text-slate-900">コピーできませんでした。下の四角の中をクリックして、「Ctrl」を押しながら「A」（全部選ぶ）、つづけて「Ctrl」を押しながら「C」（コピー）を押します。</p>
                    <input readOnly aria-label="コピーするURL" value={location.origin + entryLink} onFocus={(e) => e.currentTarget.select()} className={cls(inputClass, 'break-all')} />
                  </div> : null}
                </Fold>
                <Fold title="1人ずつ入れる" className="border-slate-300">
                  <FighterFields value={manual} config={entryConfig} prefix="manual" onChange={(k, v) => { setManual((old) => ({ ...old, [k]: v })); setManualErrors([]); setManualNote(''); }} />
                  <button type="button" onClick={addManual} className={cls(btn.base, btn.primary, 'mt-4 w-full sm:w-auto')}>この選手を追加</button>
                  {manualErrors.length ? <div role="status" className="mt-3 rounded-xl border-2 border-rose-600 bg-rose-50 p-3 text-base font-bold text-rose-900">
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
                : <p className="rounded-xl border-2 border-emerald-700 bg-emerald-50 p-3 font-bold text-emerald-900">✓ {nFighters}人 入っています（写真あり {withPhoto} / なし {nFighters - withPhoto}）</p>}
              {nFighters > 0 ? <div className="mt-3"><Fold title={'選手の一覧（' + nFighters + '人）'} open={listOpen} onToggle={setListPref}>
                {nFighters > 8 ? <div className="mb-3"><label htmlFor="fighter-filter" className="text-lg font-bold">名前やジムで探す</label><input id="fighter-filter" className={inputClass} value={query} placeholder="例: 山田" autoComplete="off" onChange={(e) => setQuery(e.target.value)} /></div> : null}
                {listOpen ? <div className="grid gap-3 sm:grid-cols-2">{shownFighters.map((fighter) => {
                  const editing = editingId === fighter.id;
                  return <article key={fighter.id} id={'fighter-' + fighter.id} className={cls('min-w-0 scroll-mt-28 rounded-xl border-2 bg-white p-3', fighter.photoDataUrl ? 'border-slate-300' : 'border-amber-500', editing ? 'sm:col-span-2' : '')}>
                    <div className="flex gap-3">
                      <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100">{fighter.photoDataUrl ? <img src={fighter.photoDataUrl} alt="" className="h-full w-full object-contain" /> : <span className="grid h-full place-items-center px-1 text-center text-base text-slate-700">写真なし</span>}</div>
                      <div className="min-w-0 flex-1 break-words">
                        <p className="text-lg font-bold">{fighter.name}</p>
                        <p className="text-base font-medium">{fighter.gym}</p>
                        <p className="text-base font-medium">{kgText(fighter.weight)}{fighter.record ? '・' + fighter.record : ''}</p>
                        {!fighter.photoDataUrl ? <p className="mt-1"><Chip tone="amber">写真がありません</Chip></p> : null}
                      </div>
                    </div>
                    {editing ? <div className="mt-3 space-y-3 border-t-2 border-slate-200 pt-3">
                      <FighterFields value={draft} config={entryConfig} prefix={'edit-' + fighter.id} onChange={(k, v) => setDraft((old) => ({ ...old, [k]: v }))} />
                      <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={applyEdit} className={cls(btn.base, btn.primary)}>この内容で直す</button>
                        <button type="button" onClick={() => setEditingId(null)} className={cls(btn.base, btn.outlineBig)}>やめる</button>
                      </div>
                    </div> : <div className="mt-3 flex flex-wrap gap-2">
                      <label className={cls(btn.base, btn.outlineBig, 'cursor-pointer focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-400')}>
                        <span>{photoBusy === fighter.id ? '⏳ 読んでいます…' : fighter.photoDataUrl ? '写真を変える' : '写真を選ぶ'}</span>
                        <input type="file" accept="image/*" aria-label={(fighter.photoDataUrl ? '写真を変える ' : '写真を選ぶ ') + fighter.name} className="sr-only" onChange={(e) => void choosePhoto(e, fighter.id)} />
                      </label>
                      <button type="button" onClick={() => { setDraft({ ...fighter }); setEditingId(fighter.id); setConfirmDeleteId(null); }} aria-label={'直す ' + fighter.name} className={cls(btn.base, btn.outline)}>直す</button>
                      {confirmDeleteId === fighter.id ? <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border-2 border-slate-400 bg-slate-50 p-2">
                        <p className="w-full text-base font-bold">{fighter.name}さんを消しますか？{placed.has(fighter.id) ? ' この人が入っている試合の選手も空になります。' : ''}</p>
                        <button type="button" onClick={() => removeFighter(fighter.id)} aria-label={'消す（決定） ' + fighter.name} className={cls(btn.base, btn.outline)}>消す</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className={cls(btn.base, btn.outline)}>やめる</button>
                      </div> : <button type="button" onClick={() => setConfirmDeleteId(fighter.id)} aria-label={'消す ' + fighter.name} className={cls(btn.base, btn.outline)}>消す</button>}
                    </div>}
                    {photoError?.id === fighter.id ? <p className="mt-2 flex gap-2 text-base font-bold text-rose-800"><span aria-hidden="true">!</span>{photoError.text}</p> : null}
                  </article>;
                })}</div> : null}
              </Fold></div> : null}
            </div>
          </Section>

          {/* ───── 3 ───── */}
          <Section id="sec-3" title="3. 対戦カードを作る" done={done3}>
            <p className="max-w-[38em] font-medium">赤コーナーと青コーナーの選手を選んで、1試合ずつ作ります。</p>
            <p className="text-lg font-bold">試合 {nonBlank} つ ／ 選手 {nFighters}人中 {placedCount}人が入っています</p>

            {unplaced.length > 0 && data.bouts.length > 0 ? <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
              <p className="font-bold">まだ試合に入っていない選手 {unplaced.length}人</p>
              <p className="text-base font-medium">名前を押すと、空いている赤か青に入ります。</p>
              <ul className="mt-2 flex flex-wrap gap-2">{unplaced.map((fighter) => <li key={fighter.id} className="min-w-0"><button type="button" onClick={() => placeFighter(fighter)} className={cls(btn.base, btn.outline, 'max-w-full')}>{fighter.name}</button></li>)}</ul>
            </div> : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
              <div className="min-w-0">
                <button id="add-bout" type="button" aria-disabled={nFighters < 2 || undefined} onClick={addBout} className={cls(btn.base, btn.primary, 'w-full scroll-mt-28 sm:w-auto sm:min-w-[14rem]')}>＋ 試合を追加</button>
                {nFighters < 2 ? <p className="mt-1 text-base font-bold text-amber-950">⚠ まず選手を2人以上入れてください</p> : null}
              </div>
              {unplaced.length >= 2 ? <button type="button" onClick={makeSuggestion} className={cls(btn.base, btn.outlineBig, 'text-balance')}>おすすめの組み合わせを自動で作る</button> : null}
            </div>
            {suggestNote ? <div className="space-y-2">
              <Notice kind={suggestNote.kind} onClose={() => setSuggestNote(null)}>{suggestNote.text}</Notice>
              {suggestNote.ids.length ? <button type="button" onClick={undoSuggestion} className={cls(btn.base, btn.outline)}>この案を取り消す</button> : null}
            </div> : null}

            {data.bouts.length === 0
              ? <p className="rounded-2xl border-2 border-dashed border-slate-400 bg-white p-5 text-center font-bold">まだ試合がありません。「＋ 試合を追加」を押します。</p>
              : <>
                <div>
                  <p className="font-bold">試合の一覧（押すと、その試合に移ります）</p>
                  <ul className="mt-2 space-y-1">{data.bouts.map((bout, index) => {
                    const red = byId.get(bout.redId), blue = byId.get(bout.blueId), kg = contractKg(red, blue);
                    return <li key={bout.id}><button type="button" onClick={() => jump('bout-' + index)} className="flex min-h-12 w-full min-w-0 items-center gap-2 rounded-lg border-2 border-slate-300 bg-white px-3 py-1 text-left text-base font-medium break-words">
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
              ['大会の名前', titleReal, titleReal ? '✓' : 'まだ', 'field-title'],
              ['日にち', dateOk, dateOk ? '✓' : 'まだ', 'field-date'],
              ['選手 ' + nFighters + '人', nFighters >= 2, nFighters >= 2 ? '✓' : 'まだ', 'sec-2'],
              [nFighters === 0 ? '写真' : '写真 ' + withPhoto + '/' + nFighters + (withPhoto < nFighters ? '（なくても進めます）' : ''), nFighters > 0 && withPhoto === nFighters, nFighters === 0 ? 'まだ' : withPhoto === nFighters ? '✓' : '⚠', 'sec-2'],
              ['試合 ' + nonBlank + 'つ', nonBlank >= 1 && boutIssues.length === 0, nonBlank >= 1 && boutIssues.length === 0 ? '✓' : 'まだ', 'sec-3'],
              ['保存', done4, done4 ? '✓' : 'まだ', ''],
            ] as const).map(([label, ok, mark, target]) => {
              const tone = cls('flex min-h-12 items-center justify-between gap-2 rounded-xl border-2 px-3 text-lg font-bold', ok ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-amber-500 bg-amber-50 text-amber-950');
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
                <p className="text-base font-medium">リハーサルのあとは、これを押すと、試合当日の画面が第1試合から始まります。</p>
                <button type="button" onClick={() => setData((old) => ({ ...old, currentBout: 0 }))} className={cls(btn.base, btn.outline, 'mt-2')}>試合当日の画面を第1試合にもどす</button>
              </div> : null}
            </div> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" aria-disabled={saving || undefined} onClick={() => { void save(); }} className={cls(btn.base, dirty ? btn.success : btn.outlineBig)}>ここまでを保存する</button>
              <button type="button" aria-disabled={!canOpen || undefined} onClick={() => { void openLive(); }} className={cls(btn.base, !dirty && canOpen ? btn.primary : btn.outlineBig)}>試合当日の画面を開く</button>
            </div>
            <p className="max-w-[38em] text-base font-medium">{!canOpen ? '⚠ まだ開けません。上の「つぎは」と「直すところ」を見てください。' : VIEW_WINDOW_NOTE}</p>
          </Section>

          {/* ───── 念のためのコピー ───── */}
          <Fold id="backup" title="コピーのファイルを作る（あとでOK）" open={backupOpen} onToggle={setBackupOpen} className="border-slate-300">
            <p className="max-w-[38em] font-medium">パソコンがこわれたときに備えて、コピーのファイルを作ります。名簿・写真・対戦カード・書いてもらうことの設定が入ります。Googleの受付の設定は入りません。</p>
            <p className="mt-2 max-w-[38em] text-lg font-bold">このパスワードは忘れると戻せません。紙にも書いてください。</p>
            {msg && msg.area === 'backup' ? <div className="mt-3"><Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice></div> : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="backup-password" className="text-lg font-bold">パスワード（忘れると開けません）</label>
                <input id="backup-password" type={showPassword ? 'text' : 'password'} className={inputClass} value={password} placeholder="10文字以上のパスワード" autoComplete="new-password" onChange={(e) => { setPassword(e.target.value); setPasswordMessage(''); }} />
                <p className={cls('mt-1 text-base font-bold', password.length >= 10 ? 'text-emerald-800' : 'text-slate-800')}>{password.length}/10文字{password.length >= 10 ? ' ✓' : ''}</p>
              </div>
              <div className="min-w-0">
                <label htmlFor="backup-password2" className="text-lg font-bold">同じパスワードをもう一度</label>
                <input id="backup-password2" type={showPassword ? 'text' : 'password'} className={inputClass} value={password2} placeholder="もう一度、同じものを入れる" autoComplete="new-password" onChange={(e) => { setPassword2(e.target.value); setPasswordMessage(''); }} />
                <p className={cls('mt-1 text-base font-bold', password2 && password2 === password ? 'text-emerald-800' : 'text-slate-800')}>{password2 ? (password2 === password ? '✓ 同じです' : '⚠ パスワードが同じではありません') : 'もう一度入れると、打ち間違いを防げます'}</p>
              </div>
            </div>
            <div className="mt-3"><button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} className={cls(btn.base, btn.outline)}>{showPassword ? '文字をかくす' : '文字を見る'}</button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <button type="button" aria-disabled={!!passwordProblem || undefined} onClick={() => void download()} className={cls(btn.base, btn.success, 'w-full')}>パスワードをつけて、コピーを保存する</button>
                {passwordProblem ? <p className="mt-1 text-base font-bold text-amber-950">⚠ {passwordProblem}</p> : null}
                {passwordMessage ? <p className="mt-1 flex gap-2 text-base font-bold text-rose-800"><span aria-hidden="true">!</span>{passwordMessage}</p> : null}
              </div>
              <div>
                <label className={cls(btn.base, btn.outlineBig, 'w-full cursor-pointer focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-indigo-400')}>
                  <span>コピーのファイルから戻す</span>
                  <input type="file" accept=".enc" className="sr-only" onChange={onPickBackup} />
                </label>
                <p className="mt-1 text-base font-medium">戻すときは、上のパスワード欄に、ファイルを作ったときのパスワードを入れてから押します。</p>
              </div>
            </div>
          </Fold>
        </div>
      </div>
    </div>

    {/* ───── 画面の下にくっつく帯。ボタンは、いまやることの1つだけ ───── */}
    <div className="fixed inset-x-0 bottom-0 z-40 w-full border-t-2 border-slate-400 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.12)]">
      <div className="mx-auto max-w-6xl px-4 pt-2">
        {msg && msg.area !== 'backup' ? <div className="pb-2 lg:pl-[16.5rem]"><div className="max-h-[30dvh] max-w-4xl overflow-y-auto"><Notice kind={msg.kind} action={msg.action} onClose={() => setMsg(null)}>{msg.text}</Notice></div></div> : null}
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-center lg:gap-6">
          <p className={cls('text-lg font-bold leading-snug', dirty ? 'text-amber-950' : everSaved ? 'text-emerald-800' : 'text-slate-800')}>
            {dirty ? '● まだ保存していません' : everSaved ? '✓ 保存ずみ ' + savedClock : '保存は、まだしていません'}
          </p>
          {!keyboardUp ? <div className="mt-1 max-w-4xl lg:mt-0">
            {dirty
              ? <button type="button" aria-disabled={saving || undefined} onClick={() => { void save(); }} className={cls(btn.base, btn.success, 'w-full')}>保存する</button>
              : canOpen
                ? <button type="button" onClick={() => { void openLive(); }} className={cls(btn.base, btn.primary, 'w-full')}>試合当日の画面を開く</button>
                : key === 'done' ? null : <button type="button" onClick={banner[key].run} className={cls(btn.base, btn.primary, 'w-full text-balance')}>つぎは：{banner[key].label} →</button>}
            {dirty ? <p className="mt-1 text-base font-medium text-slate-800">保存すると、このパソコンの中に残ります。</p> : null}
          </div> : null}
        </div>
      </div>
    </div>
  </main>;
}
