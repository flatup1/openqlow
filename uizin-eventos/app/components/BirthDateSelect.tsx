'use client';

import type { ReactNode } from 'react';

/** 生年月日の3つの値（選ぶ欄の value のまま。空は ''） */
export type BirthParts = { y: string; m: string; d: string };

/** 40代以上が選びやすい並び：1990年から1930年まで（新しい順ではない）。そのあとに、1991年から今年まで（年齢は確かめない） */
export const BIRTH_FIRST_YEAR = 1990;
export const BIRTH_LAST_OLD_YEAR = 1930;

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
  return <div className="tos-birth">
    <select {...common} id={id} aria-label="生年月日の年（西暦）" value={value.y} onChange={(e) => onChange({ ...value, y: e.target.value })}>
      <option value="">年を選ぶ</option>
      <optgroup label={BIRTH_FIRST_YEAR + '年から' + BIRTH_LAST_OLD_YEAR + '年'}>{older.map((year) => <option key={year} value={String(year)}>{year}年</option>)}</optgroup>
      {younger.length ? <optgroup label={BIRTH_FIRST_YEAR + 1 + '年から今年'}>{younger.map((year) => <option key={year} value={String(year)}>{year}年</option>)}</optgroup> : null}
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
