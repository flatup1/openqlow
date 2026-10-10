// 準備の画面（/private/）の「入力のまちがい」を、人に直させず、機械が直すための小さな純関数。
// 通信・保存・乱数・日時の読み取りはしません。直せたら「直した」と言い、直せないときだけ理由を返します。
import { dateDigits, formatDateInput, isCompleteDate } from '../../core/dateInput.ts';
import type { EntryFormConfig } from '../../core/entryPackage.ts';
import { entryErrors } from '../../core/entryPackage.ts';
import type { LocalFighter } from '../../core/privateTournament.ts';

/** 全角→半角（NFKC）にして、空白・改行・タブ・全角空白をすべて取る */
export const squash = (value: string): string => value.normalize('NFKC').replace(/[\s　]+/g, '');

/* ───────── パスワード ───────── */

/** パスワードは、作るときに「全角→半角」「前後の空白なし」にそろえる（戻すときは、元の入力→そろえた入力の順で試す） */
export const normalizePassword = (value: string): string => value.normalize('NFKC').trim();

/* ───────── 数字（身長・体重・年齢） ───────── */

const UNIT = /(?:センチメートル|センチ|cm|キログラム|キロ|kg|歳|才|さい|m)$/i;
export type NumberRead = { ok: true; value: string; fixed: boolean; from: string } | { ok: false };

/**
 * 数字の欄を読む。「65キロ」「170cm」「70,5」「６５」「15歳」→ 数字だけにする。
 * 0x10・1e5・ー・漢数字は直さずに ok:false（赤で知らせる）。空は ok:true の空文字。
 */
export function readNumber(raw: string, integer = false): NumberRead {
  const from = raw.trim();
  let text = squash(raw);
  if (!text) return { ok: true, value: '', fixed: false, from };
  text = text.replace(/^約/, '').replace(UNIT, '').replace(/(\d)[,、](?=\d)/g, '$1.').replace(/\.$/, '');
  if (integer) text = text.replace(/^(\d+)\.0+$/, '$1');
  text = text.replace(/^0+(?=\d)/, '');
  if (!/^\d+(?:\.\d+)?$/.test(text) || text.length > 10) return { ok: false };
  return { ok: true, value: text, fixed: text !== from, from };
}

export type NumberKey = 'height' | 'weight' | 'age';
export const NUMBER_RULES: Record<NumberKey, { label: string; min: number; max: number; example: string; integer: boolean }> = {
  height: { label: '身長', min: 50, max: 250, example: '170', integer: false },
  weight: { label: '体重', min: 10, max: 250, example: '65.5', integer: false },
  age: { label: '年齢', min: 1, max: 120, example: '15', integer: true },
};

/** 数字の欄を、直して検査する。value は直した文字、problem は赤で出す文（なければ null） */
export function checkNumber(key: NumberKey, raw: string): { value: string; fixed: boolean; from: string; problem: string | null } {
  const rule = NUMBER_RULES[key];
  const read = readNumber(raw, rule.integer);
  if (!read.ok) return { value: raw, fixed: false, from: raw.trim(), problem: rule.label + '：数字だけ入れる。例：' + rule.example };
  if (read.value === '') return { value: '', fixed: false, from: read.from, problem: null };
  const n = Number(read.value);
  if (!Number.isFinite(n) || n < rule.min || n > rule.max) return { value: read.value, fixed: read.fixed, from: read.from, problem: rule.label + '：' + rule.min + '〜' + rule.max + 'の間で入れる。例：' + rule.example };
  return { value: read.value, fixed: read.fixed, from: read.from, problem: null };
}

/* ───────── 日にち ───────── */

export type DateRead =
  | { kind: 'empty' }
  | { kind: 'ok'; text: string; fixed: boolean; from: string }
  | { kind: 'partial' }
  | { kind: 'bad'; reason: string };

const validDay = (y: number, m: number, d: number): boolean => {
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/**
 * 日にちを読む。2027年10月3日／2027-10-03／2027/10/3／2027.10.03／20271003／全角／空白入り → ぜんぶ 2027年10月3日。
 * 日にちまで入っていない途中の入力は partial（保存は止めない）。あり得ない日にち・令和などは bad（理由つき）。
 */
export function readDate(raw: string): DateRead {
  const from = raw.trim();
  const text = squash(raw);
  if (!text) return { kind: 'empty' };
  if (/令和|平成|昭和|^[rhs]\d/i.test(text)) return { kind: 'bad', reason: '令和などは使えません。西暦で入れます。例：2027年10月3日' };
  const full = text.match(/^(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?$/) ?? text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (full) {
    const [y, m, d] = [Number(full[1]), Number(full[2]), Number(full[3])];
    if (!validDay(y, m, d)) return { kind: 'bad', reason: m + '月' + d + '日はありません。もう一度、日にちを入れます' };
    const shown = formatDateInput(dateDigits(text));
    return { kind: 'ok', text: shown, fixed: shown !== from, from };
  }
  if (/^\d{1,2}[月/.-]\d{1,2}日?$/.test(text)) return { kind: 'bad', reason: '年がありません。例：2027年10月3日' };
  if (/^\d{9,}$/.test(text)) return { kind: 'bad', reason: '数字が多すぎます。例：20271003' };
  if (/^\d{4}/.test(text) && /^[\d年月日/.-]+$/.test(text)) return { kind: 'partial' };
  if (/^\d{1,3}$/.test(text)) return { kind: 'partial' };
  return { kind: 'bad', reason: '日にちとして読めません。例：2027年10月3日' };
}

/** 保存や「受付をつくる」に進めるほど読めている日にちか */
export const dateReadable = (raw: string): boolean => isCompleteDate(raw);

/* ───────── 探す（ひらがな・カタカナ・全角を同じにする） ───────── */

export function foldKana(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s　]+/g, '').replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/* ───────── 入場曲のリンク ───────── */

const MUSIC_HOST = /^https:\/\/(?:music\.apple\.com|(?:[\w-]+\.)?youtube\.com|youtu\.be)\//;
export function checkMusic(raw: string): { value: string; fixed: boolean; problem: string | null } {
  const from = raw.trim();
  const value = squash(raw);
  const fixed = value !== from;
  if (!value) return { value: '', fixed: false, problem: null };
  if (value.length > 500) return { value, fixed, problem: '入場曲のリンク：長すぎます（500文字まで）。曲の「共有」からコピーし直す' };
  if (/spotify/i.test(value)) return { value, fixed, problem: '入場曲のリンク：Spotify は使えません。Apple Music か YouTube で同じ曲を探す' };
  if (!MUSIC_HOST.test(value)) return { value, fixed, problem: '入場曲のリンク：Apple Music か YouTube の https:// から始まるリンクだけ使えます' };
  return { value, fixed, problem: null };
}

/* ───────── 選手1人ぶんの検査（1人ずつ入れる／直す で同じ） ───────── */

export type FieldKey = 'name' | 'gym' | 'grade' | 'age' | 'height' | 'weight' | 'record' | 'comment' | 'musicUrl';
export type FieldProblem = { key: FieldKey; text: string };
export type FieldFix = { key: FieldKey; label: string; from: string; to: string };
export const FIELD_LABEL: Record<FieldKey, string> = { name: '選手名', gym: 'ジム名', grade: '学年', age: '年齢', height: '身長', weight: '体重', record: '戦績', comment: '意気込み', musicUrl: '入場曲のリンク' };
const MAX_LENGTH: Partial<Record<FieldKey, number>> = { name: 80, gym: 120, grade: 30, record: 300, comment: 500 };

/**
 * 1人ぶんを直して検査する。
 * mode='add'（1人ずつ入れる）: 必要な欄が空ならまちがい。mode='edit'（直す）: すでにいる人なので、空の欄は責めない（名前だけは必要）。
 * fighter は直したあとの値。problems が空なら、そのまま使える。
 */
export function checkFighter(input: LocalFighter, config: EntryFormConfig, mode: 'add' | 'edit'): { fighter: LocalFighter; problems: FieldProblem[]; fixes: FieldFix[] } {
  const problems: FieldProblem[] = [];
  const fixes: FieldFix[] = [];
  const out: LocalFighter = { ...input };
  const bad = (key: FieldKey, text: string) => { if (!problems.some((p) => p.key === key)) problems.push({ key, text }); };
  for (const key of ['name', 'gym', 'record', 'comment', 'grade'] as const) out[key] = input[key].trim();
  for (const key of ['height', 'weight', 'age'] as const) {
    const done = checkNumber(key, input[key]);
    out[key] = done.value;
    if (done.problem) bad(key, done.problem);
    else if (done.fixed && done.value !== '') fixes.push({ key, label: FIELD_LABEL[key], from: done.from, to: done.value });
  }
  const music = checkMusic(input.musicUrl);
  out.musicUrl = music.value;
  if (music.problem) bad('musicUrl', music.problem);
  else if (music.fixed && music.value) fixes.push({ key: 'musicUrl', label: FIELD_LABEL.musicUrl, from: input.musicUrl.trim().slice(0, 20) + '…', to: '空白を取りました' });
  for (const [key, max] of Object.entries(MAX_LENGTH) as Array<[FieldKey, number]>) if (out[key].length > max) bad(key, FIELD_LABEL[key] + 'は' + max + '文字までです（いま' + out[key].length + '文字）');
  if (!out.name) bad('name', '選手名：入れてください。例：山田 太郎');
  if (mode === 'add') {
    if (!out.gym) bad('gym', 'ジム名：入れてください。例：○○ジム');
    if (!out.height) bad('height', '身長：入れてください。例：170');
    if (!out.weight) bad('weight', '体重：入れてください。例：65.5');
    if (!out.record) bad('record', '戦績：入れてください。初試合なら「初試合」');
    if (config.grade === 'required' && !out.grade) bad('grade', '学年：入れてください。例：中2');
    if (config.age === 'required' && !out.age) bad('age', '年齢：入れてください。例：15');
    if (config.comment === 'required' && !out.comment) bad('comment', '意気込み：入れてください');
    if (config.music && !out.musicUrl) bad('musicUrl', '入場曲のリンク：入れてください（Apple Music か YouTube）');
    // 最後の門は今までと同じ検査。上で拾えなかったまちがいがあっても、ここで止まる
    if (!problems.length) {
      const left = entryErrors(out, true, config);
      if (left.length) problems.push({ key: 'name', text: left[0].replace(/。$/, '') });
    }
  }
  return { fighter: out, problems, fixes };
}

/** 「体重 52 → 53」のような、直した所の短い言い方（最大2つ） */
export function describeChange(before: LocalFighter, after: LocalFighter): string {
  const keys: FieldKey[] = ['name', 'gym', 'grade', 'age', 'height', 'weight', 'record', 'comment', 'musicUrl'];
  const changed = keys.filter((key) => before[key] !== after[key]);
  if (!changed.length) return '';
  const shown = changed.slice(0, 2).map((key) => FIELD_LABEL[key] + ' ' + (before[key] ? before[key].slice(0, 12) : '（空）') + ' → ' + (after[key] ? after[key].slice(0, 12) : '（空）'));
  return shown.join('、') + (changed.length > 2 ? ' ほか' : '');
}

/** 名前の長い人を、画面に出せる長さにする */
export const shorten = (value: string, max = 18): string => (value.length > max ? value.slice(0, max) + '…' : value);
