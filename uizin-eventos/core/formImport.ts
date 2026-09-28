/**
 * 既存のGoogleフォーム回答表 → Tournament OS の選手一覧。
 *
 * ネットワークは触らない。CSV文字列を受け取って変換するだけ。
 * 原本（回答表）は読むだけで、ここから書き換える手段は一切ない。
 *
 * 大事な決まり:
 * - メール・電話・保護者名・住所の列は「取り込まない列」として最初に外す。
 * - 写真・意気込み・入場曲が無くても取り込みは止めない（未登録として扱う）。
 * - 同じ行を何度読んでも選手は増えない（行の中身から決まる受付番号を使う）。
 * - 別の行なのに同じ選手に見えるものは自動でまとめず「確認してください」と出す。
 */

import { fingerprint, normalizeKey, parseCsv } from './csv.ts';
import { looksLikeHtml } from './sheet.ts';
import type { MatchBuilderFighter } from './matchBuilder.ts';

export type FormField =
  | 'timestamp' | 'gym' | 'fighterName' | 'fighterKana' | 'className' | 'birthDate' | 'age' | 'grade'
  | 'gender' | 'height' | 'weight' | 'category' | 'record' | 'style' | 'otherExperience' | 'memo'
  | 'comment' | 'musicUrl' | 'photoUrl' | 'canFightTwice';

/** 個人情報なので、取り込み・画面表示・保存のどこにも出さない列 */
export type SensitiveField = 'email' | 'phone' | 'guardian' | 'address';

export const FORM_FIELD_LABELS: Record<FormField, string> = {
  timestamp: '申込日時', gym: '所属ジム', fighterName: '選手名', fighterKana: 'ふりがな', className: '出場クラス',
  birthDate: '生年月日', age: '年齢', grade: '学年', gender: '性別', height: '身長', weight: '体重',
  category: '階級・カテゴリー', record: '戦績・競技歴', style: 'スタイル', otherExperience: '他格闘技歴',
  memo: '運営メモ', comment: '意気込み', musicUrl: '入場曲', photoUrl: '顔写真', canFightTwice: '2試合可能か',
};

/** 必ず要る列。これが無いと取り込めない */
export const REQUIRED_FIELDS: FormField[] = ['fighterName'];
/** 無くても取り込むが「未登録」と出す列 */
export const OPTIONAL_PROFILE_FIELDS: FormField[] = ['photoUrl', 'comment', 'musicUrl', 'canFightTwice'];

// 並び順が大事: 先に書いた方を優先する（例: 「出場階級」は「出場クラス」より先に階級として判定）。
const FIELD_PATTERNS: Array<[FormField, RegExp]> = [
  ['timestamp', /タイムスタンプ|timestamp|申込日時|送信日時/],
  ['fighterKana', /フリガナ|ふりがな|カナ|かな|kana/],
  ['fighterName', /選手(氏)?名|リングネーム|^氏名$|^名前$|^お名前$|fighter_?name/],
  ['gym', /所属|ジム|道場|チーム|gym|team/],
  ['birthDate', /生年月日|誕生日|birth/],
  ['age', /年齢|^age$/],
  ['grade', /学年|grade/],
  ['gender', /性別|gender|^sex$/],
  ['height', /身長|height/],
  ['category', /階級|カテゴリ|category|weight_?class/],
  ['weight', /体重|weight/],
  ['className', /クラス|部門|class|division/],
  ['otherExperience', /他格闘技|他の格闘技|格闘技歴|競技歴/],
  ['record', /戦績|試合経験|試合数|record/],
  ['style', /スタイル|構え|style|stance/],
  ['comment', /意気込み|コメント|ひとこと|一言|comment/],
  ['musicUrl', /入場曲|曲|music|song/],
  ['photoUrl', /写真|画像|photo|image/],
  ['canFightTwice', /2試合|２試合|二試合|複数試合|ダブル/],
  ['memo', /備考|メモ|連絡事項|note|memo/],
];

const SENSITIVE_PATTERNS: Array<[SensitiveField, RegExp]> = [
  ['email', /メール|e-?mail|mail/],
  ['phone', /電話|携帯|tel|phone/],
  ['guardian', /保護者(の)?(氏名|名前|名)|保護者様?のお名前|parent_?name|guardian_?name/],
  ['address', /住所|address|郵便/],
];

/** 同意欄（誓約書・保護者同意など）。表示はしないが、同意の有無だけは運営メモ用に数える */
const CONSENT_PATTERN = /同意|誓約|承諾|規約/;

export type ColumnKind =
  | { kind: 'field'; field: FormField }
  | { kind: 'sensitive'; field: SensitiveField }
  | { kind: 'consent' }
  | { kind: 'ignore' };

export type ColumnMapping = {
  header: string;
  index: number;
  mapped: ColumnKind;
  /** 自動で決まったか（false なら人が選んだ・または未対応） */
  auto: boolean;
};

export function classifyHeader(header: string): ColumnKind {
  const key = normalizeKey(header);
  if (key === '') return { kind: 'ignore' };
  // 同意欄は「保護者同意」のように保護者を含むので、個人情報判定より先に見る。
  if (CONSENT_PATTERN.test(key)) return { kind: 'consent' };
  for (const [field, pattern] of SENSITIVE_PATTERNS) if (pattern.test(key)) return { kind: 'sensitive', field };
  for (const [field, pattern] of FIELD_PATTERNS) if (pattern.test(key)) return { kind: 'field', field };
  return { kind: 'ignore' };
}

/** 見出し行から列の対応を自動で作る。同じ項目が2列に当たったら、2列目は「使わない」にする */
export function detectColumns(headers: string[]): ColumnMapping[] {
  const used = new Set<FormField>();
  return headers.map((header, index) => {
    const mapped = classifyHeader(header);
    if (mapped.kind === 'field') {
      if (used.has(mapped.field)) return { header, index, mapped: { kind: 'ignore' }, auto: false };
      used.add(mapped.field);
    }
    return { header, index, mapped, auto: mapped.kind !== 'ignore' };
  });
}

/** 人が候補から選び直す。個人情報列は選び直せない（守りを外させない） */
export function remapColumn(columns: ColumnMapping[], index: number, field: FormField | ''): ColumnMapping[] {
  const target = columns.find((c) => c.index === index);
  if (!target || target.mapped.kind === 'sensitive') return columns;
  return columns.map((column) => {
    if (column.mapped.kind === 'sensitive') return column;
    if (column.index === index) {
      return { ...column, mapped: field ? { kind: 'field', field } : { kind: 'ignore' }, auto: false };
    }
    // 同じ項目を2列に付けない。前に付いていた列は外す。
    if (field && column.mapped.kind === 'field' && column.mapped.field === field) {
      return { ...column, mapped: { kind: 'ignore' }, auto: false };
    }
    return column;
  });
}

export function mappedFields(columns: ColumnMapping[]): Set<FormField> {
  const out = new Set<FormField>();
  for (const c of columns) if (c.mapped.kind === 'field') out.add(c.mapped.field);
  return out;
}

export function missingRequiredFields(columns: ColumnMapping[]): FormField[] {
  const have = mappedFields(columns);
  return REQUIRED_FIELDS.filter((f) => !have.has(f));
}

export type ReadResult =
  | { ok: true; headers: string[]; rows: string[][] }
  | { ok: false; reason: string };

/**
 * 回答表のCSVを確認する。ログイン画面や0件は「読めていない」として止める。
 * ここで止めれば、今ある正常な選手一覧は何も変わらない。
 */
export function readFormCsv(text: string): ReadResult {
  if (text.trim() === '') return { ok: false, reason: '回答表が空でした。タブ名が正しいか確認してください。' };
  if (looksLikeHtml(text)) {
    return { ok: false, reason: '回答表を開けませんでした（Googleのログイン画面が返りました）。共有を「リンクを知っている全員・閲覧者」にしてください。' };
  }
  const raw = parseCsv(text);
  if (raw.length === 0) return { ok: false, reason: '回答表が空でした。' };
  const headers = raw[0].map((h) => h.replace(/﻿/g, '').trim());
  const rows = raw.slice(1).filter((cells) => cells.some((c) => c.trim() !== ''));
  if (rows.length === 0) return { ok: false, reason: '回答が0件でした。タブ名が正しいか、回答が入っているか確認してください。' };
  return { ok: true, headers, rows };
}

/** 個人情報の列を CSV から外す。サーバーから画面へ送る前に使う */
export function stripSensitiveColumns(headers: string[], rows: string[][]): { headers: string[]; rows: string[][]; removed: string[] } {
  const keep: number[] = [];
  const removed: string[] = [];
  headers.forEach((h, i) => (classifyHeader(h).kind === 'sensitive' ? removed.push(h) : keep.push(i)));
  return {
    headers: keep.map((i) => headers[i]),
    rows: rows.map((r) => keep.map((i) => r[i] ?? '')),
    removed,
  };
}

export type ImportedFighter = MatchBuilderFighter & {
  gender?: string;
  className?: string;
  memo?: string;
  source: 'google-form';
  /** 大会で使う項目のうち、回答表に無い／空のもの（「未登録」と出す） */
  missing: FormField[];
  /** 何行目から来たか（見出しを1行目として数える） */
  sheetRow: number;
};

export type DuplicateWarning = { receiptNos: [string, string]; names: string; message: string };

export type ImportPreview = {
  fighters: ImportedFighter[];
  duplicates: DuplicateWarning[];
  skipped: Array<{ sheetRow: number; reason: string }>;
  /** 同じ回答行が2回入っていたので1人にまとめた数 */
  sameRowCount: number;
};

function toHalf(value: string): string {
  return value.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();
}

/** "45.5kg" "４５キロ" → "45.5"。数字が無ければ元の文字をそのまま残す（勝手に推測しない） */
export function numberText(value: string): string {
  const m = toHalf(value).match(/\d+(?:\.\d+)?/);
  return m ? m[0] : value.trim();
}

/** 名前の揺れ（空白・全角半角・カタカナひらがな）をそろえた比較用の文字 */
export function nameKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\s　・･]/g, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase();
}

/** 回答1行から決まる受付番号。同じ行なら何度読んでも同じ番号になる */
export function formReceiptNo(parts: { timestamp: string; fighterName: string; fighterKana: string; birthDate: string; gym: string }): string {
  const key = [parts.timestamp.trim(), nameKey(parts.fighterName), nameKey(parts.fighterKana), toHalf(parts.birthDate), nameKey(parts.gym)].join('|');
  return 'GF-' + fingerprint(key).toUpperCase();
}

export function buildImportPreview(headers: string[], rows: string[][], columns: ColumnMapping[], wanted: FormField[] = OPTIONAL_PROFILE_FIELDS): ImportPreview {
  const indexOf = new Map<FormField, number>();
  for (const c of columns) if (c.mapped.kind === 'field') indexOf.set(c.mapped.field, c.index);
  const get = (row: string[], field: FormField): string => {
    const i = indexOf.get(field);
    return i === undefined ? '' : (row[i] ?? '').trim();
  };

  const fighters: ImportedFighter[] = [];
  const skipped: ImportPreview['skipped'] = [];
  const seen = new Set<string>();
  let sameRowCount = 0;

  rows.forEach((row, i) => {
    const sheetRow = i + 2;
    const fighterName = get(row, 'fighterName');
    if (!fighterName) {
      skipped.push({ sheetRow, reason: '選手名が空です' });
      return;
    }
    const timestamp = get(row, 'timestamp');
    const fighterKana = get(row, 'fighterKana');
    const birthDate = get(row, 'birthDate');
    const gym = get(row, 'gym');
    const receiptNo = formReceiptNo({ timestamp, fighterName, fighterKana, birthDate, gym });
    if (seen.has(receiptNo)) { sameRowCount++; return; }
    seen.add(receiptNo);

    const record = get(row, 'record');
    const other = get(row, 'otherExperience');
    const style = get(row, 'style');
    const recordText = [record, other ? '他格闘技: ' + other : '', style ? 'スタイル: ' + style : ''].filter(Boolean).join(' / ');
    const category = get(row, 'category');
    const className = get(row, 'className');
    const fighter: ImportedFighter = {
      receiptNo, fighterName, fighterKana, gym,
      age: numberText(get(row, 'age')), grade: get(row, 'grade'), gender: get(row, 'gender'),
      height: numberText(get(row, 'height')), weight: numberText(get(row, 'weight')),
      category: category || className, className, record: recordText, memo: get(row, 'memo'),
      comment: get(row, 'comment'), musicUrl: get(row, 'musicUrl'), photoUrl: get(row, 'photoUrl'),
      musicChoice: get(row, 'musicUrl') ? 'あり' : '', canFightTwice: get(row, 'canFightTwice'),
      source: 'google-form', missing: [], sheetRow,
    };
    const checks: Array<[FormField, string]> = [['gym', gym], ['weight', fighter.weight ?? ''], ...wanted.map((f): [FormField, string] => [f, get(row, f)])];
    fighter.missing = checks.filter(([, v]) => !v).map(([f]) => f);
    fighters.push(fighter);
  });

  return { fighters, duplicates: findDuplicates(fighters), skipped, sameRowCount };
}

/** 別の回答行なのに同じ選手に見える組を探す。自動でまとめない */
export function findDuplicates(fighters: MatchBuilderFighter[]): DuplicateWarning[] {
  const out: DuplicateWarning[] = [];
  for (let a = 0; a < fighters.length; a++) {
    for (let b = a + 1; b < fighters.length; b++) {
      const x = fighters[a], y = fighters[b];
      const sameName = nameKey(x.fighterName) !== '' && nameKey(x.fighterName) === nameKey(y.fighterName);
      const sameKana = nameKey(x.fighterKana ?? '') !== '' && nameKey(x.fighterKana ?? '') === nameKey(y.fighterKana ?? '');
      const sameGym = nameKey(x.gym) !== '' && nameKey(x.gym) === nameKey(y.gym);
      if ((sameName && (sameGym || sameKana || !x.gym || !y.gym)) || (sameKana && sameGym)) {
        out.push({
          receiptNos: [x.receiptNo, y.receiptNo],
          names: x.fighterName + '（' + (x.gym || '所属なし') + '）と ' + y.fighterName + '（' + (y.gym || '所属なし') + '）',
          message: '同じ選手か確認してください。二重に申し込んだ可能性があります。',
        });
      }
    }
  }
  return out;
}

export type MergeResult = { fighters: MatchBuilderFighter[]; before: number; after: number; added: number; updated: number };

/**
 * 今の選手一覧に取り込み結果を足す。
 * - 今いる選手は消さない（回答表から消えていても残す）。
 * - 同じ受付番号は新しい内容で置き換える（人数は増えない）。
 */
export function mergeImported(current: MatchBuilderFighter[], incoming: MatchBuilderFighter[]): MergeResult {
  const byId = new Map(current.map((f) => [f.receiptNo, f]));
  let added = 0, updated = 0;
  for (const f of incoming) {
    if (byId.has(f.receiptNo)) updated++; else added++;
    byId.set(f.receiptNo, f);
  }
  const fighters = [...byId.values()];
  return { fighters, before: current.length, after: fighters.length, added, updated };
}

/** URL から gid（タブの番号）を取り出す。無ければ '' */
export function extractGid(value: string): string {
  const m = value.match(/[#?&]gid=(\d{1,12})/);
  return m ? m[1] : '';
}

/** 読み取り専用のCSV書き出しURL。gid があればそれを、無ければタブ名を使う */
export function formCsvUrl(sheetId: string, tab: { gid?: string; name?: string }): string {
  const base = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(sheetId) + '/gviz/tq?tqx=out:csv&headers=1';
  if (tab.name) return base + '&sheet=' + encodeURIComponent(tab.name);
  if (tab.gid) return base + '&gid=' + encodeURIComponent(tab.gid);
  return base;
}
