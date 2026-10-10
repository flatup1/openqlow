'use client';

import { memo } from 'react';
import { contractWeight, type LocalBout, type LocalFighter } from '../../core/privateTournament.ts';
import type { EntryFormConfig } from '../../core/entryPackage.ts';
import { gapLevel, isBlankBout, isHalfBout, parseKg, weightGap } from './logic.ts';
import { FIELD_LABEL, type FieldKey } from './normalize.ts';
import { Caution, ErrorLine, Example, LockReason, NextSlot, OkLine } from './marks.tsx';
import { Badge, btn, Chip, cls, Fold, inputClass } from './parts.tsx';

export const kgText = (value: string) => value.trim() ? value.trim().replace(/kg$/i, '') + 'kg' : '体重未入力';

export type FieldProblems = Partial<Record<FieldKey, string>>;
export type FieldFixes = Partial<Record<FieldKey, string>>;

/* ───────── 選手の入力欄（1人ずつ入れる / 直す で共通） ───────── */
const EXAMPLES: Record<FieldKey, string> = {
  name: '山田 太郎', gym: '○○ジム', grade: '小6 / 中2 / 社会人', age: '15（数字だけ）', height: '170', weight: '65.5',
  record: '初試合なら「初試合」', comment: '全力でがんばります', musicUrl: 'https://music.apple.com/…',
};

export function FighterFields({ value, onChange, onBlurField, config, prefix, problems, fixes, targetId }: {
  value: LocalFighter; onChange: (key: FieldKey, next: string) => void; onBlurField?: (key: FieldKey) => void; config: EntryFormConfig; prefix: string;
  problems?: FieldProblems; fixes?: FieldFixes; targetId?: string | null;
}) {
  const rows: Array<{ key: FieldKey; label: string; required: boolean; unit?: string; mode?: 'numeric' | 'decimal' | 'text'; show: boolean }> = [
    { key: 'name', label: '選手名', required: true, show: true },
    { key: 'gym', label: 'ジム名', required: true, show: true },
    { key: 'grade', label: '学年', required: config.grade === 'required', show: config.grade !== 'off' },
    { key: 'age', label: '年齢', required: config.age === 'required', mode: 'numeric', show: config.age !== 'off' },
    { key: 'height', label: '身長', required: true, unit: 'cm', mode: 'decimal', show: true },
    { key: 'weight', label: '体重', required: true, unit: 'kg', mode: 'decimal', show: true },
    { key: 'record', label: '戦績', required: true, show: true },
    { key: 'comment', label: '意気込み', required: config.comment === 'required', show: config.comment !== 'off' },
    { key: 'musicUrl', label: '入場曲のリンク', required: config.music, show: config.music },
  ];
  return <div className="grid gap-4 sm:grid-cols-2">{rows.filter((row) => row.show).map((row) => {
    const id = prefix + '-' + row.key, problem = problems?.[row.key], fix = fixes?.[row.key];
    return <div key={row.key} className="min-w-0">
      <div className="flex flex-wrap items-baseline"><label htmlFor={id} className="text-lg font-bold">{row.label}</label><Badge required={row.required} /></div>
      <div className="flex items-center gap-2">
        <input id={id} className={cls(inputClass, problem && 'tos-input-error', targetId === id && 'tos-target')} value={value[row.key]} inputMode={row.mode} autoComplete="off" aria-invalid={!!problem || undefined}
          aria-describedby={problem ? id + '-error' : id + '-example'} onChange={(e) => onChange(row.key, e.target.value)} onBlur={() => onBlurField?.(row.key)} />
        {row.unit ? <span className="mt-1 shrink-0 text-lg font-bold" aria-hidden="true">{row.unit}</span> : null}
      </div>
      <Example id={id + '-example'} className="mt-1"><code>{EXAMPLES[row.key]}</code></Example>
      {problem ? <ErrorLine id={id + '-error'} role={null} className="mt-1">{problem}</ErrorLine> : null}
      {!problem && fix ? <OkLine quiet className="mt-1">自動で直しました：{fix}</OkLine> : null}
    </div>;
  })}</div>;
}

/* ───────── 対戦カード1枚（<article> はこの中だけ。画像タグは使わない） ───────── */
export type BoutCardProps = {
  bout: LocalBout; index: number; total: number; fighters: LocalFighter[]; groups: Array<[string, LocalFighter[]]>;
  byId: Map<string, LocalFighter>; placed: Map<string, number>; bouts: LocalBout[];
  isCurrent: boolean; isSuggested: boolean; ruleCopied: boolean;
  /** 黄色の「👉 次はここ」を付ける側（なければ null）と、その札の文 */
  nextSide: 'red' | 'blue' | null; nextLabel: string;
  /** 「確かめました」の印（体重差・2試合に出る人）。キーは画面側が決める */
  acks: Set<string>; targetId: string | null;
  onPatch: (index: number, patch: Partial<LocalBout>) => void; onMove: (index: number, direction: -1 | 1) => void; onRemove: (index: number) => void;
  onAck: (key: string) => void; onFocusSide: (index: number, side: 'red' | 'blue') => void; onEditWeight: (fighterId: string) => void;
};

const sideStyle = { red: 'border-rose-600 bg-rose-50', blue: 'border-blue-600 bg-blue-50' } as const;

export const BoutCard = memo(function BoutCard({ bout, index, total, fighters, groups, byId, placed, bouts, isCurrent, isSuggested, ruleCopied, nextSide, nextLabel, acks, targetId, onPatch, onMove, onRemove, onAck, onFocusSide, onEditWeight }: BoutCardProps) {
  const red = byId.get(bout.redId), blue = byId.get(bout.blueId);
  const half = isHalfBout(bout), blank = isBlankBout(bout);
  const gap = weightGap(red, blue);
  const level = gapLevel(gap);
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
  const missingWeight = (f: LocalFighter | undefined) => f && parseKg(f.weight) === null
    ? <div className="mt-2 space-y-2"><ErrorLine role={null}>体重がありません：{f.name}</ErrorLine><button type="button" onClick={() => onEditWeight(f.id)} className={cls(btn.base, btn.outline)}>体重を入れる</button></div> : null;
  const centerBadge = gap === null
    ? (weightUnknown ? <Chip tone="amber">⚠ 体重が未入力の選手がいます</Chip> : null)
    : level !== 'none' ? <Chip tone="amber">体重差 {gap}kg ⚠</Chip> : <Chip tone="green">体重差 {gap}kg ✓</Chip>;
  // 同じ人が2試合に出ている（相手の試合の番号は、この箱の中に書かない＝ほかの試合のカードと取りちがえないため）
  const doubled = [red, blue].filter((f): f is LocalFighter => !!f && bouts.filter((other) => other.redId === f.id || other.blueId === f.id).length > 1);
  const doubledOpen = doubled.filter((f) => !acks.has('dbl:' + bout.id + ':' + f.id));
  const gapKey = 'gap:' + bout.id + ':' + bout.redId + ':' + bout.blueId;
  const sameGym = red && blue && red.gym.trim() && red.gym.trim() === blue.gym.trim() ? red.gym.trim() : '';
  const reselect = (f: LocalFighter, label: string) => <button key={'r' + f.id} type="button" onClick={() => onFocusSide(index, f.id === bout.redId ? 'red' : 'blue')} className="tos-safe-btn inline-flex items-center justify-center text-center text-lg touch-manipulation">{label}</button>;
  const sideBox = (side: 'red' | 'blue') => {
    const f = side === 'red' ? red : blue, id = 'bout-' + index + '-' + side, value = side === 'red' ? bout.redId : bout.blueId;
    return <div className={cls('min-w-0 rounded-xl border-l-8 p-3', sideStyle[side])}>
      <span className={cls('inline-flex min-h-8 items-center rounded-full px-3 text-[17px] font-bold text-white', side === 'red' ? 'bg-rose-700' : 'bg-blue-700')}>{side === 'red' ? '▲ 赤コーナー' : '■ 青コーナー'}</span>
      <NextSlot active={nextSide === side} label={nextLabel} className="mt-2">
        <select id={id} aria-label={side === 'red' ? '赤コーナーの選手' : '青コーナーの選手'} aria-describedby={title + (!value ? ' ' + id + '-hint' : '')} aria-invalid={!value || undefined}
          className={cls(inputClass, side === 'red' ? 'border-rose-400' : 'border-blue-400', targetId === id && 'tos-target')} value={value} onChange={(e) => onPatch(index, side === 'red' ? { redId: e.target.value } : { blueId: e.target.value })}>
          <option value="">{side === 'red' ? '赤の選手を選ぶ' : '青の選手を選ぶ'}</option>{options(side)}
        </select>
      </NextSlot>
      {!value ? <p id={id + '-hint'} className="mt-1 text-[17px] font-bold text-slate-900">{side === 'red' ? '赤の選手を選んでください' : '青の選手を選んでください'}</p> : null}
      {profile(f)}
      {missingWeight(f)}
    </div>;
  };
  return <article id={'bout-' + index} className="scroll-mt-28 rounded-2xl border-2 border-slate-300 bg-white p-3 shadow-sm sm:p-4">
    <div className="flex flex-wrap items-center gap-2">
      <h3 id={title} className="mr-auto text-xl font-bold">第{index + 1}試合</h3>
      {half || blank ? <Chip tone="amber">未完成</Chip> : null}
      {isSuggested ? <Chip tone="amber">案</Chip> : null}
      {isCurrent ? <Chip tone="indigo">▶ いま試合当日の画面に出ている試合</Chip> : null}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" aria-describedby={title} aria-disabled={index === 0 || undefined} onClick={() => { if (index > 0) onMove(index, -1); }} className={cls(btn.base, btn.outline, index === 0 && 'tos-locked')}>↑ 上へ</button>
      <button type="button" aria-describedby={title} aria-disabled={index === total - 1 || undefined} onClick={() => { if (index < total - 1) onMove(index, 1); }} className={cls(btn.base, btn.outline, index === total - 1 && 'tos-locked')}>↓ 下へ</button>
      <button type="button" aria-describedby={title} onClick={() => onRemove(index)} className="tos-danger-btn ml-auto inline-flex items-center justify-center text-center text-lg touch-manipulation"><span aria-hidden="true">✕ </span>この試合を消す（第{index + 1}試合）</button>
    </div>
    {index === 0 || index === total - 1 ? <div className="mt-1 space-y-1">
      {index === 0 ? <LockReason>「↑ 上へ」は押せません：いちばん上です</LockReason> : null}
      {index === total - 1 ? <LockReason>「↓ 下へ」は押せません：いちばん下です</LockReason> : null}
    </div> : null}
    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1fr)]">
      {sideBox('red')}
      <div className="flex min-w-0 flex-col items-stretch justify-center gap-2 md:items-center">
        {centerBadge}
        <button type="button" aria-describedby={title} onClick={() => onPatch(index, { redId: bout.blueId, blueId: bout.redId })} className={cls(btn.base, btn.outline)}>赤青を入替</button>
      </div>
      {sideBox('blue')}
    </div>
    {red && blue ? <p className="mt-3 text-[17px] font-medium">{contract ? '試合当日の画面には「' + contract + '」と出ます。' : '体重がわからないので、体重の区分の文字が出ます。'}</p> : null}
    {level === 'caution' ? <Caution className="mt-3" role="status">体重差 {gap}kg です。</Caution> : null}
    {level === 'danger' && gap !== null && !acks.has(gapKey) ? <div className="mt-3 space-y-2">
      <ErrorLine role="status">体重差 {gap}kg：けがの危険があります。本当にこの2人ですか？</ErrorLine>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={() => onFocusSide(index, 'blue')} className="tos-safe-btn inline-flex items-center justify-center text-center text-lg touch-manipulation">選び直す</button>
        <button type="button" onClick={() => onAck(gapKey)} className={cls(btn.base, btn.outlineBig)}>この2人でよい</button>
      </div>
    </div> : null}
    {level === 'danger' && gap !== null && acks.has(gapKey) ? <Caution className="mt-3" role="status">体重差 {gap}kg です（この2人でよいと、確かめました）。</Caution> : null}
    {sameGym ? <Caution className="mt-3" role="status">同じジム（{sameGym}）の選手どうしです。</Caution> : null}
    {doubledOpen.map((f) => {
      const count = bouts.filter((other) => other.redId === f.id || other.blueId === f.id).length;
      return <Caution key={f.id} className="mt-3" role="status">
        <p className="">{f.name}さんは、ほかの試合にも出ます（全部で{count}試合）。同じ日に2試合してよいですか？</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          {reselect(f, '選び直す')}
          <button type="button" onClick={() => onAck('dbl:' + bout.id + ':' + f.id)} className={cls(btn.base, btn.outlineBig)}>このまま（2試合に出す）</button>
        </div>
      </Caution>;
    })}
    {ruleCopied ? <Caution className="mt-3" role="status">まえの試合と同じ値です。違うなら、下の「ルール・体重の区分」を直す。</Caution> : null}
    <div className="mt-3">
      <Fold title="ルール・体重の区分（なくてもOK）" className="border-slate-300">
        <p className="text-[17px] font-medium">ふつうは体重から自動で出ます。</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0"><label htmlFor={'bout-' + index + '-class'} className="text-lg font-bold">体重の区分</label><input id={'bout-' + index + '-class'} className={inputClass} value={bout.className} placeholder="例: 60kg" onChange={(e) => onPatch(index, { className: e.target.value })} onBlur={(e) => { const next = e.target.value.normalize('NFKC'); if (next !== e.target.value) onPatch(index, { className: next }); }} /></div>
          <div className="min-w-0"><label htmlFor={'bout-' + index + '-rule'} className="text-lg font-bold">ルール</label><input id={'bout-' + index + '-rule'} className={inputClass} value={bout.rule} placeholder="例: キックボクシング 2分2R" onChange={(e) => onPatch(index, { rule: e.target.value })} onBlur={(e) => { const next = e.target.value.normalize('NFKC'); if (next !== e.target.value) onPatch(index, { rule: next }); }} /></div>
        </div>
      </Fold>
    </div>
  </article>;
});

export const fieldLabel = (key: FieldKey): string => FIELD_LABEL[key];
