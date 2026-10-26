'use client';

import type { ReactNode } from 'react';

/** 生年月日の3つの値（選ぶ欄の value のまま。空は ''） */
export type BirthParts = { y: string; m: string; d: string };

/** 40代以上が選びやすい並び：1990年から1930年まで（新しい順ではない）。そのあとに、1991年から今年まで（年齢は確かめない） */
export const BIRTH_FIRST_YEAR = 1990;
export const BIRTH_LAST_OLD_YEAR = 1930;

/* ERA-BEGIN（tests/birthEra.test.ts が、この2つの印のあいだを取り出して試す。型の印以外は、ふつうの JavaScript で書く） */
/**
 * 西暦の年に並べる和暦。選ぶ欄の「見た目の文字」だけに使う（送る値・保存する値・リンク・タブは、ずっと西暦のまま）。
 * 昭和＝1926〜1989、平成＝1989〜2019、令和＝2019〜。年の途中で変わる年は、両方書く（1989＝昭和64・平成元、2019＝平成31・令和元）。
 * 昭和より前（1926年より前）は、和暦を付けない（''）。1926は昭和元年（この欄の選択肢は1930年からなので、1926は表の値としてだけ使う）。
 */
export function birthEra(year: number): string {
  const name = (gengo: string, n: number): string => gengo + (n === 1 ? '元' : String(n));
  if (!Number.isInteger(year) || year < 1926) return '';
  if (year === 1989) return name('昭和', 64) + '・' + name('平成', 1);
  if (year === 2019) return name('平成', 31) + '・' + name('令和', 1);
  if (year < 1989) return name('昭和', year - 1925);
  if (year < 2019) return name('平成', year - 1988);
  return name('令和', year - 2018);
}

/** 選ぶ欄に出す年の文字。例：1986（昭和61）。和暦が無い年は、西暦だけ */
export function birthYearLabel(year: number): string {
  const era = birthEra(year);
  return era ? year + '（' + era + '）' : String(year);
}
/* ERA-END */

export function birthYearLists(thisYear: number): { older: number[]; younger: number[] } {
  const older: number[] = [];
  for (let year = BIRTH_FIRST_YEAR; year >= BIRTH_LAST_OLD_YEAR; year--) if (year <= thisYear) older.push(year);
  const younger: number[] = [];
  for (let year = BIRTH_FIRST_YEAR + 1; year <= thisYear; year++) younger.push(year);
  return { older, younger };
}

/**
 * 生年月日：年・月・日の3つの「選ぶ欄」。1つ目（年）に id を付ける（見出しの label はここへつながる）。
 * 月は id + 'M'、日は id + 'D'。聞くだけで、年齢の判定はしない。
 */
export function BirthDateSelect({ id, value, onChange, onBlur, selectClass, describedBy, invalid, thisYear }: {
  id: string;
  value: BirthParts;
  onChange: (next: BirthParts) => void;
  onBlur?: () => void;
  selectClass: string;
  describedBy?: string;
  invalid?: boolean;
  thisYear: number;
}): ReactNode {
  const { older, younger } = birthYearLists(thisYear);
  const common = { 'aria-required': true as const, 'aria-invalid': invalid ? true : undefined, 'aria-describedby': describedBy, autoComplete: 'off', onBlur, className: selectClass };
  // 年の文字が長くなった（例：1989（昭和64・平成元））ので、年の欄は、どの画面の幅でも1行をひとりじめにする（月と日は、そのつぎの1行に2つ並ぶ）。
  // 320px でも文字が切れないよう、年の欄だけ、文字は17px（1.0625rem）・左右のすき間は少し細くする（それでも17px以上）。見た目の調整だけで、値・送る形は変わらない
  const yearStyle = { gridColumn: '1 / -1', fontSize: '1.0625rem', paddingLeft: '8px', paddingRight: '4px' };
  return <div className="tos-birth" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
    <select {...common} id={id} aria-label="生年月日の年（西暦）" style={yearStyle} value={value.y} onChange={(e) => onChange({ ...value, y: e.target.value })}>
      <option value="">年を選ぶ</option>
      <optgroup label={BIRTH_FIRST_YEAR + '年から' + BIRTH_LAST_OLD_YEAR + '年'}>{older.map((year) => <option key={year} value={String(year)}>{birthYearLabel(year)}</option>)}</optgroup>
      {younger.length ? <optgroup label={BIRTH_FIRST_YEAR + 1 + '年から今年'}>{younger.map((year) => <option key={year} value={String(year)}>{birthYearLabel(year)}</option>)}</optgroup> : null}
    </select>
    <select {...common} id={id + 'M'} aria-label="生年月日の月" value={value.m} onChange={(e) => onChange({ ...value, m: e.target.value })}>
      <option value="">月を選ぶ</option>
      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => <option key={month} value={String(month)}>{month}月</option>)}
    </select>
    <select {...common} id={id + 'D'} aria-label="生年月日の日" value={value.d} onChange={(e) => onChange({ ...value, d: e.target.value })}>
      <option value="">日を選ぶ</option>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => <option key={day} value={String(day)}>{day}日</option>)}
    </select>
  </div>;
}
