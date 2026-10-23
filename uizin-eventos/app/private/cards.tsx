'use client';

import { Fragment, memo, useState } from 'react';
import { contractWeight, gymKey, sameFighterKey, type LocalBout, type LocalFighter } from '../../core/privateTournament.ts';
import type { EntryFormConfig } from '../../core/entryPackage.ts';
import { boutClassWarning, classKey, classMismatch, classMixMessage, classState, suggestClass, suggestText, type ClassSettings } from '../../core/classRules.ts';
import { boutWeightWarning, cleanDivisionName, cleanWeightText, findDivision, NO_CLASS_NOTE, normalizeWeightClass, weightClassLabel, weightTag, type WeightSettings } from '../../core/weightClass.ts';
import { BOUT_TEXT_MAX, gapLevel, isBlankBout, isHalfBout, parseKg, sameClassName, weightGap, weightIssue, weightIssueText, weightTrouble, weightTroubleText } from './logic.ts';
import { FIELD_LABEL, shorten, type FieldKey } from './normalize.ts';
import { Caution, ErrorLine, Example, LockReason, NextSlot, OkLine, Soft } from './marks.tsx';
import { Badge, btn, Chip, cls, Fold, inputClass } from './parts.tsx';

export const kgText = (value: string) => {
  const text = value.trim();
  if (!text) return '体重未入力';
  // 読める数字なら「65kg」。読めない文字（六十五 など）は、kg を付けずに「読めません」、10〜250の外（5 など）は「範囲の外」と言う
  if (parseKg(text) !== null) return text.replace(/kg$/i, '') + 'kg';
  return weightTrouble(text) === 'range' ? '体重が10〜250kgの外です（' + text.slice(0, 10) + '）' : '体重が読めません（' + text.slice(0, 10) + '）';
};

export type FieldProblems = Partial<Record<FieldKey, string>>;
export type FieldFixes = Partial<Record<FieldKey, string>>;

/* ───────── 選手の入力欄（1人ずつ入れる / 直す で共通） ───────── */
const EXAMPLES: Record<FieldKey, string> = {
  name: '山田 太郎', gym: '○○ジム', grade: '小5／中2／社会人', age: '15（数字だけ）', height: '170', weight: '65.5',
  record: '初試合なら「初試合」', comment: '全力でがんばります', musicUrl: 'https://music.apple.com/…',
};

export function FighterFields({ value, onChange, onBlurField, config, prefix, problems, fixes, targetId, classOptions, onClassChange, classSettings, weights, onWeightChange, alsoShow, mode = 'add' }: {
  value: LocalFighter; onChange: (key: FieldKey, next: string) => void; onBlurField?: (key: FieldKey) => void; config: EntryFormConfig; prefix: string;
  problems?: FieldProblems; fixes?: FieldFixes; targetId?: string | null;
  /** 選べるクラスの名前。空か無いときは、クラスの欄を出さない（クラスを使わない大会は、今までどおり） */
  classOptions?: string[]; onClassChange?: (next: string) => void;
  /** クラスの条件とルール（あれば、選ぶ欄のすぐ下に出す）。戦績からの目安も、これで出す */
  classSettings?: ClassSettings | null;
  /** 階級分け（区分→階級）の設定。あるときだけ、区分・階級の選ぶ欄を出す（無い大会は、今までどおり）。入れなくても保存できる。区分を変えたら、階級は空に戻す */
  weights?: WeightSettings | null; onWeightChange?: (division: string, weightClass: string) => void;
  /** 設定では出さない欄でも、直す人にすでに入っている欄は出す（出さないと、まちがいを直せない行き止まりになる） */
  alsoShow?: FieldKey[];
  /** add＝「この選手を追加」の入力 / edit＝「この内容で直す」の入力。クラスのちがいの文が、押すボタンの名前を言う */
  mode?: 'add' | 'edit';
}) {
  const also = (key: FieldKey) => !!alsoShow?.includes(key);
  const rows: Array<{ key: FieldKey; label: string; required: boolean; unit?: string; mode?: 'numeric' | 'decimal' | 'text'; show: boolean }> = [
    { key: 'name', label: '選手名', required: true, show: true },
    { key: 'gym', label: 'ジム名', required: true, show: true },
    { key: 'grade', label: '学年', required: config.grade === 'required', show: config.grade !== 'off' || also('grade') },
    { key: 'age', label: '年齢', required: config.age === 'required', mode: 'numeric', show: config.age !== 'off' || also('age') },
    { key: 'height', label: '身長', required: true, unit: 'cm', mode: 'decimal', show: true },
    { key: 'weight', label: '体重', required: true, unit: 'kg', mode: 'decimal', show: true },
    { key: 'record', label: '戦績', required: true, show: true },
    { key: 'comment', label: '意気込み', required: config.comment === 'required', show: config.comment !== 'off' || also('comment') },
    { key: 'musicUrl', label: '入場曲のリンク', required: config.music, show: config.music || also('musicUrl') },
  ];
  // クラスの欄は「戦績」の次に出す。いまの値が選べる名前に無いときも、消えないように足す（全角・半角ちがいは同じ名前）
  const current = (value.fighterClass ?? '').trim();
  const options = classOptions ?? [];
  const hit = options.find((name) => current !== '' && sameClassName(name, current));
  const classId = prefix + '-fighterClass';
  const hint = classSettings ? suggestClass(value.record, classSettings) : null;
  const mismatch = classSettings && current ? classMismatch(value.record, current, classSettings) : '';
  const classBlock = options.length > 0 && onClassChange ? <div className="min-w-0">
    <div className="flex flex-wrap items-baseline"><label htmlFor={classId} className="text-lg font-bold">クラス</label><Badge text="なくてもOK" /></div>
    <select id={classId} className={cls(inputClass, targetId === classId && 'tos-target')} value={hit ?? current} aria-describedby={classId + '-note'} onChange={(e) => onClassChange(e.target.value)}>
      <option value="">えらばない</option>
      {current && !hit ? <option value={current}>{current}</option> : null}
      {options.map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
    <Soft id={classId + '-note'} className="mt-1">クラスを選びます。わからないときは「えらばない」。</Soft>
    {classSettings ? <ul className="mt-1 list-none space-y-2 p-0 text-[17px] font-medium">
      {[classSettings.upper, classSettings.lower].map((side) => <li key={side.name} className="break-words"><b>{side.name}</b>
        <span className="block"><b>条件：</b>{side.condition}</span>
        <span className="block"><b>ルール：</b>{side.rule}</span></li>)}
    </ul> : null}
    {hint ? <Caution className="mt-2" role="status" title="目安">{suggestText(hint.name)}。どちらにするかは、ご自分で決めてください。</Caution> : null}
    {mismatch ? <ErrorLine role="status" mark="⚠ " className="mt-2">{mismatch}{mode === 'edit' ? 'このままで「この内容で直す」を押せます。' : 'このままで「この選手を追加」を押せます。'}</ErrorLine> : null}
    {options.length === 1 ? <div className="mt-2">
      <label htmlFor={classId + '-other'} className="text-lg font-bold">もう1つのクラスの名前を入れる</label>
      <input id={classId + '-other'} className={inputClass} value={hit ? '' : current} autoComplete="off" onChange={(e) => onClassChange(e.target.value)} />
      <Example className="mt-1"><code>Bクラス</code>（選べるクラスが1つだけのときに使います）</Example>
    </div> : null}
  </div> : null;
  // 区分・階級の欄は「戦績」の次（クラスの欄の前）に出す。設定にない値が入っている人も、消さずに選択肢へ足す（全角・半角ちがいは同じ名前）
  const divCurrent = cleanDivisionName(value.division ?? ''), wcCurrent = cleanWeightText(value.weightClass ?? '');
  const divSetting = weights ? findDivision(divCurrent, weights) : undefined;
  const wcList = divSetting?.classes ?? [];
  const wcHit = divSetting && wcCurrent ? normalizeWeightClass(divSetting.name, wcCurrent, weights) : '';
  const divId = prefix + '-division', wcId = prefix + '-weightClass';
  const showWc = wcList.length > 0 || wcCurrent !== '';
  const wIssue = weights ? weightIssue(value, weights) : null;
  const weightBlock = weights && onWeightChange ? <div className="min-w-0 sm:col-span-2" data-tos-weights="1">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline"><label htmlFor={divId} className="text-lg font-bold">区分</label><Badge text="なくてもOK" /></div>
        <select id={divId} className={cls(inputClass, targetId === divId && 'tos-target')} value={divSetting?.name ?? divCurrent} aria-describedby={divId + '-note'} onChange={(e) => onWeightChange(e.target.value, '')}>
          <option value="">えらばない</option>
          {divCurrent && !divSetting ? <option value={divCurrent}>{divCurrent}</option> : null}
          {weights.divisions.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
        </select>
      </div>
      {showWc ? <div className="min-w-0">
        <div className="flex flex-wrap items-baseline"><label htmlFor={wcId} className="text-lg font-bold">階級</label><Badge text="なくてもOK" /></div>
        <select id={wcId} className={cls(inputClass, targetId === wcId && 'tos-target')} value={wcHit || wcCurrent} aria-describedby={divId + '-note'} onChange={(e) => onWeightChange(value.division ?? '', e.target.value)}>
          <option value="">えらばない</option>
          {wcCurrent && !wcHit ? <option value={wcCurrent}>{weightClassLabel(wcCurrent)}</option> : null}
          {wcList.map((c) => <option key={c} value={c}>{weightClassLabel(c)}</option>)}
        </select>
      </div> : null}
    </div>
    <Soft id={divId + '-note'} className="mt-1">区分と階級を選びます。階級＝体重で分けたグループです。わからないときは「えらばない」。</Soft>
    {divSetting && wcList.length === 0 ? <Soft className="mt-1">{NO_CLASS_NOTE}</Soft> : null}
    {wIssue ? <Caution className="mt-2" role="status">{weightIssueText(wIssue, value)}</Caution> : null}
  </div> : null;
  return <div className="grid gap-4 sm:grid-cols-2">{rows.filter((row) => row.show).map((row) => {
    const id = prefix + '-' + row.key, problem = problems?.[row.key], fix = fixes?.[row.key];
    return <Fragment key={row.key}><div className="min-w-0">
      <div className="flex flex-wrap items-baseline"><label htmlFor={id} className="text-lg font-bold">{row.label}</label><Badge required={row.required} /></div>
      <div className="flex items-center gap-2">
        <input id={id} className={cls(inputClass, problem && 'tos-input-error', targetId === id && 'tos-target')} value={value[row.key]} inputMode={row.mode} autoComplete="off" aria-invalid={!!problem || undefined}
          aria-describedby={problem ? id + '-error' : id + '-example'} onChange={(e) => onChange(row.key, e.target.value)} onBlur={() => onBlurField?.(row.key)} />
        {row.unit ? <span className="mt-1 shrink-0 text-lg font-bold" aria-hidden="true">{row.unit}</span> : null}
      </div>
      <Example id={id + '-example'} className="mt-1"><code>{EXAMPLES[row.key]}</code></Example>
      {problem ? <ErrorLine id={id + '-error'} role={null} className="mt-1">{problem}</ErrorLine> : null}
      {!problem && fix ? <OkLine quiet className="mt-1">自動で直しました：{fix}</OkLine> : null}
    </div>{row.key === 'record' ? <>{weightBlock}{classBlock}</> : null}</Fragment>;
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
  /** 名前もジムも同じ人が名簿に2人以上いる（「別の人です」と答えていない）人の管理番号 */
  dupIds: Set<string>;
  /** この大会のクラスの設定（名前とルールの文）。ないときは、ルールの行を出さない */
  classSettings?: ClassSettings | null;
  /** クラスを使う大会か（受付でクラスを決めた、または名簿にクラスの人がいる）。使うのに、クラスが入っていない人・読めない人は、黄色で知らせる */
  classesOn?: boolean;
  onPatch: (index: number, patch: Partial<LocalBout>) => void; onMove: (index: number, direction: -1 | 1) => void; onRemove: (index: number) => void;
  onAck: (key: string) => void; onFocusSide: (index: number, side: 'red' | 'blue') => void; onEditWeight: (fighterId: string) => void;
  /** この人の「直す」欄を開いて、クラスの欄へ移る */
  onEditClass: (fighterId: string) => void;
};

const sideStyle = { red: 'border-rose-600 bg-rose-50', blue: 'border-blue-600 bg-blue-50' } as const;

export const BoutCard = memo(function BoutCard({ bout, index, total, fighters, groups, byId, placed, bouts, isCurrent, isSuggested, ruleCopied, nextSide, nextLabel, acks, targetId, dupIds, classSettings, classesOn = false, onPatch, onMove, onRemove, onAck, onFocusSide, onEditWeight, onEditClass }: BoutCardProps) {
  const [ruleOpen, setRuleOpen] = useState(false);
  // 100文字を超える貼りつけは、保存がぜんぶ失敗する原因になる。欄に入れられる数を決め、すでに超えているもの（古いコピー）は赤で知らせる
  const longRule = bout.rule.length > BOUT_TEXT_MAX, longClass = bout.className.length > BOUT_TEXT_MAX;
  const red = byId.get(bout.redId), blue = byId.get(bout.blueId);
  const half = isHalfBout(bout), blank = isBlankBout(bout);
  const gap = weightGap(red, blue);
  const level = gapLevel(gap);
  const contract = contractWeight(red, blue);
  const weightUnknown = !!red && !!blue && gap === null;
  const inThisBout = (id: string) => id === bout.redId || id === bout.blueId;
  const title = 'bout-' + index + '-title';
  // 選択肢は「Aクラス 65kg 山田 太郎（ジム名）」の順。クラスと体重が先なので、せまい画面で閉じていても切れない
  const baseLabel = (f: LocalFighter) => `${f.fighterClass ? f.fighterClass + ' ' : ''}${kgText(f.weight)} ${f.name}${f.gym.trim() ? '（' + f.gym.trim() + '）' : ''}`;
  // 見た目が同じ選択肢（同じ名前・同じジム・同じ体重・同じクラス）には、管理番号を足して見分けられるようにする
  // （全角・半角と空白のちがいは、見た目では同じなので、同じ選択肢として数える）
  const labelKey = (f: LocalFighter) => baseLabel(f).normalize('NFKC').replace(/\s+/g, '');
  const labelCount = new Map<string, number>();
  for (const f of fighters) labelCount.set(labelKey(f), (labelCount.get(labelKey(f)) ?? 0) + 1);
  // この人が、ほかの試合のどこに入っているか（いちばん上の試合の番号）。選ぶ人に「どこに」を言うため
  const elsewhere = new Map<string, number>();
  bouts.forEach((other, at) => { if (at === index) return; for (const id of [other.redId, other.blueId]) if (id && !elsewhere.has(id)) elsewhere.set(id, at); });
  const options = (side: 'red' | 'blue') => groups.map(([gym, list]) => <optgroup key={gym} label={gym || 'ジム名なし'}>{list.map((f) => {
    const other = side === 'red' ? bout.blueId : bout.redId;
    const mark = f.id === other ? (side === 'red' ? '（青コーナーで選んでいます）' : '（赤コーナーで選んでいます）') : elsewhere.has(f.id) ? '（もう第' + ((elsewhere.get(f.id) ?? 0) + 1) + '試合に入っています）' : (placed.get(f.id) ?? 0) - (inThisBout(f.id) ? 1 : 0) > 0 ? '（ほかの試合に入っています）' : '';
    const twin = (labelCount.get(labelKey(f)) ?? 0) > 1 ? `（番号 ${shorten(f.id, 10)}）` : '';
    return <option key={f.id} value={f.id} disabled={f.id === other}>{baseLabel(f) + twin + (f.absent === true ? '（欠場）' : '') + mark}</option>;
  })}</optgroup>);
  const profile = (f: LocalFighter | undefined, side: 'red' | 'blue') => f ? <div className="mt-3 flex min-w-0 items-center gap-3">
    <div aria-hidden="true" className="h-14 w-14 shrink-0 rounded-lg border-2 border-slate-300 bg-slate-200 bg-cover bg-center" style={f.photoDataUrl ? { backgroundImage: 'url(' + f.photoDataUrl + ')' } : undefined} />
    <div className="min-w-0 text-[17px] font-medium leading-snug">
      <p className="break-words text-lg font-bold">{f.name}</p>
      <p className="break-words">{kgText(f.weight)}{f.record ? '・' + f.record : ''}</p>
      {f.fighterClass ? <p className="break-words font-bold [overflow-wrap:anywhere]">クラス：{f.fighterClass}</p> : null}
      {weightTag(f) ? <p data-weight-tag={side} className="break-words font-bold [overflow-wrap:anywhere]">区分・階級：{weightTag(f)}</p> : null}
      <p className="break-words text-slate-700">{[f.age ? f.age + '歳' : '', f.grade].filter(Boolean).join('・')}</p>
    </div>
  </div> : null;
  const missingWeight = (f: LocalFighter | undefined) => {
    const trouble = f ? weightTrouble(f.weight) : null;
    return f && trouble
      ? <div className="mt-2 space-y-2"><ErrorLine role={null}>{weightTroubleText(trouble, f.name, f.weight)}</ErrorLine><button type="button" onClick={() => onEditWeight(f.id)} className={cls(btn.base, btn.outline)}>体重を入れる</button></div> : null;
  };
  const centerBadge = gap === null
    ? (weightUnknown ? <Chip tone="amber">⚠ 体重が未入力の選手がいます</Chip> : null)
    : level !== 'none' ? <Chip tone="amber">体重差 {gap}kg ⚠</Chip> : <Chip tone="green">体重差 {gap}kg ✓</Chip>;
  const gapMeaning = index === 0 && gap !== null ? <p className="text-center text-[17px] font-medium text-slate-700">体重差＝体重のちがい</p> : null;
  // 同じ人が2試合に出ている（相手の試合の番号は、この箱の中に書かない＝ほかの試合のカードと取りちがえないため）
  // 管理番号がちがっても、名前もジムも同じ人は、同じ人として数える
  const personBouts = (f: LocalFighter): number => {
    const key = sameFighterKey(f);
    return bouts.filter((other) => [other.redId, other.blueId].some((id) => {
      if (!id) return false;
      if (id === f.id) return true;
      const person = key ? byId.get(id) : undefined;
      return !!person && sameFighterKey(person) === key;
    })).length;
  };
  const doubled = [red, blue].filter((f): f is LocalFighter => !!f && personBouts(f) > 1);
  const samePerson = !!red && !!blue && red.id !== blue.id && sameFighterKey(red) !== '' && sameFighterKey(red) === sameFighterKey(blue);
  const lookalikes = samePerson ? [] : [red, blue].filter((f): f is LocalFighter => !!f && dupIds.has(f.id));
  const doubledOpen = doubled.filter((f) => !acks.has('dbl:' + bout.id + ':' + f.id));
  const gapKey = 'gap:' + bout.id + ':' + bout.redId + ':' + bout.blueId;
  const sameGym = red && blue && gymKey(red.gym) && gymKey(red.gym) === gymKey(blue.gym) ? red.gym.trim() : '';
  // 赤と青のクラスがちがうとき（どちらかが空なら出ない）。ルールがちがうので知らせるだけ。保存も、試合当日の画面も、止めない
  const classWarn = boutClassWarning(red, blue);
  const classMix = classMixMessage(red, blue, classSettings);
  // 赤と青の区分か階級がちがうとき（どちらかが空なら出ない）。クラスのちがいとは別の箱。知らせるだけで、保存も、試合当日の画面も、止めない
  const weightWarn = boutWeightWarning(red, blue);
  // ルールの文のうしろの（ ）の説明（例：ワンアタック＝蹴り足をキャッチしたあと、1回だけ攻撃してよい）は、注意の文では短くするので、ここで1行ずつ足す
  const mixNotes: string[] = classMix && classSettings && classSettings.enabled
    ? Array.from(new Set([red, blue].map((f) => classKey((f?.fighterClass ?? '').trim(), classSettings)).filter(Boolean))).map((k) => (k === 'upper' ? classSettings.upper : classSettings.lower).rule.match(/（([^）]+)）/)?.[1] ?? '').filter(Boolean)
    : [];
  const reselect = (f: LocalFighter, label: string) => <button key={'r' + f.id} type="button" aria-describedby={title} onClick={() => onFocusSide(index, f.id === bout.redId ? 'red' : 'blue')} className="tos-safe-btn inline-flex items-center justify-center text-center text-lg touch-manipulation">{label}</button>;
  // クラスを使う大会で、クラスが入っていない人・決めたクラスにない名前（例：S）の人がいる試合。ちがうクラスか確かめられないので、黄色で知らせる
  const sides: Array<[string, LocalFighter | undefined]> = [['赤', red], ['青', blue]];
  const blankSides = sides.filter(([, f]) => !!f && classState(f, classSettings) === 'blank');
  const oddSides = sides.filter(([, f]) => !!f && classState(f, classSettings) === 'unknown');
  const classNotes = blankSides.length || oddSides.length ? <>
    {blankSides.map(([word, f]) => <Caution key={'cb' + word} className="mt-3" role="status">{word}コーナーの{f?.name}さんは、クラスが入っていないので、ちがうクラスか確かめられません。クラスを入れると、確かめられます。
      <span className="mt-2 flex"><button type="button" aria-describedby={title} onClick={() => f && onEditClass(f.id)} className={cls(btn.base, btn.outline)}>クラスを入れる</button></span></Caution>)}
    {oddSides.map(([word, f]) => <Caution key={'cu' + word} className="mt-3" role="status">{word}コーナーの{f?.name}さんのクラス「{(f?.fighterClass ?? '').trim().slice(0, 12)}」は、決めたクラスの名前にありません。ルールを、自分で確かめます。
      <span className="mt-2 flex"><button type="button" aria-describedby={title} onClick={() => f && onEditClass(f.id)} className={cls(btn.base, btn.outline)}>クラスを直す</button></span></Caution>)}
  </> : null;
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
      {profile(f, side)}
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
      {/* 試合が1つだけのときは、順番を変える相手がいない。押せないボタンと理由を並べない（次の大会は1試合だけ） */}
      {total >= 2 ? <button type="button" aria-describedby={title} aria-disabled={index === 0 || undefined} onClick={() => { if (index > 0) onMove(index, -1); }} className={cls(btn.base, btn.outline, index === 0 && 'tos-locked')}>↑ 上へ</button> : null}
      {total >= 2 ? <button type="button" aria-describedby={title} aria-disabled={index === total - 1 || undefined} onClick={() => { if (index < total - 1) onMove(index, 1); }} className={cls(btn.base, btn.outline, index === total - 1 && 'tos-locked')}>↓ 下へ</button> : null}
      <button type="button" aria-describedby={title} onClick={() => onRemove(index)} className="tos-danger-btn ml-auto inline-flex items-center justify-center text-center text-lg touch-manipulation"><span aria-hidden="true">✕ </span>この試合を消す（第{index + 1}試合）</button>
    </div>
    {total >= 2 && (index === 0 || index === total - 1) ? <div className="mt-1 space-y-1">
      {index === 0 ? <LockReason>「↑ 上へ」は押せません：いちばん上です</LockReason> : null}
      {index === total - 1 ? <LockReason>「↓ 下へ」は押せません：いちばん下です</LockReason> : null}
    </div> : null}
    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1fr)]">
      {sideBox('red')}
      <div className="flex min-w-0 flex-col items-stretch justify-center gap-2 md:items-center">
        {centerBadge}
        {gapMeaning}
        <button type="button" aria-describedby={title} onClick={() => onPatch(index, { redId: bout.blueId, blueId: bout.redId })} className={cls(btn.base, btn.outline)}>赤と青を入れかえる</button>
      </div>
      {sideBox('blue')}
    </div>
    {red && blue ? <p className="mt-3 text-[17px] font-medium">{contract ? '試合当日の画面には「' + contract + '」と出ます。' + (index === 0 ? '契約＝この試合で使う体重です。' : '') : '体重がまだわからないので、試合当日の画面に「契約体重」が出ません。上の「体重を入れる」を押してください。契約体重＝この試合で使う体重です。'}</p> : null}
    {level === 'caution' ? <Caution className="mt-3" role="status">体重差 {gap}kg です。少し差があります。心配なときは、選び直します。</Caution> : null}
    {level === 'danger' && gap !== null && !acks.has(gapKey) ? <div className="mt-3 space-y-2">
      <ErrorLine role="status">体重差 {gap}kg：けがの危険があります。本当にこの2人ですか？</ErrorLine>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" aria-describedby={title} onClick={() => onFocusSide(index, 'blue')} className="tos-safe-btn inline-flex items-center justify-center text-center text-lg touch-manipulation">選び直す</button>
        <button type="button" aria-describedby={title} onClick={() => onAck(gapKey)} className={cls(btn.base, btn.outlineBig)}>この2人でよい</button>
      </div>
    </div> : null}
    {level === 'danger' && gap !== null && acks.has(gapKey) ? <Caution className="mt-3" role="status">体重差 {gap}kg です（この2人でよいと、確かめました）。</Caution> : null}
    {classWarn && classMix && blue ? <div className="mt-3 space-y-2">
      <ErrorLine role="status" mark="⚠ " className="[overflow-wrap:anywhere]">{classMix.headline}</ErrorLine>
      {classMix.rules.length ? <ul className="m-0 list-none space-y-1 p-0 text-[17px] font-bold">{classMix.rules.map((line) => <li key={line} className="break-words">{line}</li>)}</ul> : null}
      {mixNotes.length ? <ul className="m-0 list-none space-y-1 p-0 text-[17px] font-medium">{mixNotes.map((note) => <li key={note} className="break-words">ことばの説明：{note}</li>)}</ul> : null}
      <Soft>このまま戦ってもかまいません。そのときは、主催者のあなたが、どちらのルールにするか決めて、「ルール」の欄に書きます。</Soft>
      <div className="flex flex-col gap-3 sm:flex-row">
        {reselect(blue, '青を選び直す')}
        <button type="button" aria-describedby={title} aria-expanded={ruleOpen} onClick={() => { setRuleOpen(true); window.setTimeout(() => document.getElementById('bout-' + index + '-rule')?.focus(), 0); }} className={cls(btn.base, btn.outlineBig)}>ルールを書く欄をひらく</button>
      </div>
    </div> : null}
    {weightWarn && red && blue ? <div className="mt-3 space-y-2" data-weight-warning="1">
      <ErrorLine role="status" mark="⚠ " className="[overflow-wrap:anywhere]">{weightWarn}</ErrorLine>
      <Soft>このまま戦ってもかまいません。違うときは、選び直します。</Soft>
      <div>{reselect(blue, '青を選び直す')}</div>
    </div> : null}
    {classesOn && !classWarn ? classNotes : null}
    {/* 欠場の選手が入っている試合。止めない（決めるのは主催者）。赤い ⚠ と言葉で知らせ、選び直すボタンを付ける */}
    {[red, blue].some((f) => f?.absent === true) ? <div className="mt-3 space-y-2" data-absent-warning="1">
      {([['赤', red], ['青', blue]] as const).filter(([, f]) => f?.absent === true).map(([side, f]) => <div key={side} className="space-y-2">
        <ErrorLine role="status" mark="⚠ " className="[overflow-wrap:anywhere]">{side}コーナーの{(f?.name ?? '').trim() || '名前未入力'}さんは、欠場です。相手を決め直すか、この試合を消してください。</ErrorLine>
        {f ? <div>{reselect(f, side + 'を選び直す')}</div> : null}
      </div>)}
    </div> : null}
    {samePerson && red && blue ? <div className="mt-3 space-y-2">
      <ErrorLine role="status" mark="⚠ ">同じ人かもしれません：赤と青が、同じ名前・同じジムです（番号 {shorten(red.id, 10)} と {shorten(blue.id, 10)}）。</ErrorLine>
      <div>{reselect(blue, '青を選び直す')}</div>
    </div> : null}
    {lookalikes.map((f) => <Caution key={'look' + f.id} className="mt-3" role="status">{f.name}さんは、名簿に同じ名前・同じジムの人がもう1人います。番号（{shorten(f.id, 10)}）を確かめます。</Caution>)}
    {sameGym ? <Caution className="mt-3" role="status">同じジム（{sameGym}）の2人です。ふつうは、ちがうジムの人と組みます。同じジムでよいなら、このままで大丈夫です。</Caution> : null}
    {doubledOpen.map((f) => {
      const count = personBouts(f);
      return <Caution key={f.id} className="mt-3" role="status">
        <p className="">{f.name}さんは、ほかの試合にも出ます（全部で{count}試合）。同じ日に2試合してよいですか？</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          {reselect(f, '選び直す')}
          <button type="button" aria-describedby={title} onClick={() => onAck('dbl:' + bout.id + ':' + f.id)} className={cls(btn.base, btn.outlineBig)}>このまま（2試合に出す）</button>
        </div>
      </Caution>;
    })}
    {ruleCopied ? <Caution className="mt-3" role="status">まえの試合と同じ値です。違うなら、下の「ルール・体重の区分」を直す。</Caution> : null}
    <div className="mt-3">
      <Fold title="ルール・体重の区分（なくてもOK）" className="border-slate-300" summaryDescribedBy={title} open={ruleOpen || longRule || longClass} onToggle={setRuleOpen}>
        <p className="text-[17px] font-medium">ふつうは体重から自動で出ます。クラスのルールを試合当日の画面に出したいときは、「ルール」に書きます。</p>
        <Example className="mt-1">体重の区分＝<code>60kg</code>　ルール＝<code>首相撲あり・膝蹴りあり</code></Example>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0"><label htmlFor={'bout-' + index + '-class'} className="text-lg font-bold">体重の区分</label><input id={'bout-' + index + '-class'} aria-describedby={title} maxLength={BOUT_TEXT_MAX} className={inputClass} value={bout.className} placeholder="例：60kg" onChange={(e) => onPatch(index, { className: e.target.value })} onBlur={(e) => { const next = e.target.value.normalize('NFKC'); if (next !== e.target.value) onPatch(index, { className: next }); }} />
            {longClass ? <div className="mt-1 space-y-1"><ErrorLine role={null}>体重の区分が長すぎます（いま{bout.className.length}文字・{BOUT_TEXT_MAX}文字まで）</ErrorLine><button type="button" onClick={() => onPatch(index, { className: bout.className.slice(0, BOUT_TEXT_MAX) })} className={cls(btn.base, btn.outline)}>{BOUT_TEXT_MAX}文字に切る</button></div> : null}</div>
          <div className="min-w-0"><label htmlFor={'bout-' + index + '-rule'} className="text-lg font-bold">ルール</label><input id={'bout-' + index + '-rule'} aria-describedby={title} maxLength={BOUT_TEXT_MAX} className={inputClass} value={bout.rule} placeholder="例：キックボクシング 2分2R" onChange={(e) => onPatch(index, { rule: e.target.value })} onBlur={(e) => { const next = e.target.value.normalize('NFKC'); if (next !== e.target.value) onPatch(index, { rule: next }); }} />
            {longRule ? <div className="mt-1 space-y-1"><ErrorLine role={null}>ルールが長すぎます（いま{bout.rule.length}文字・{BOUT_TEXT_MAX}文字まで）</ErrorLine><button type="button" onClick={() => onPatch(index, { rule: bout.rule.slice(0, BOUT_TEXT_MAX) })} className={cls(btn.base, btn.outline)}>{BOUT_TEXT_MAX}文字に切る</button></div> : null}</div>
        </div>
      </Fold>
    </div>
  </article>;
});

export const fieldLabel = (key: FieldKey): string => FIELD_LABEL[key];
