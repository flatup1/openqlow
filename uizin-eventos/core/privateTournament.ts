import { fingerprint, INVISIBLE_KEEP_JOINERS_RE, normalizeKey, pick, stripInvisibleChars, toRowsIndexed } from './csv.ts';
import type { EntryFormConfig } from './entryPackage.ts';
import { cleanClassLabel, DEFAULT_CLASS_SETTINGS, normalizeClassLoose, parseClassSettings } from './classRules.ts';

export type LocalFighter = {
  id: string;
  gym: string;
  name: string;
  grade: string;
  age: string;
  height: string;
  weight: string;
  record: string;
  comment: string;
  musicUrl: string;
  photoDataUrl: string;
  /** クラスの名前（例：Aクラス）。申込のときに選んだ名前の文字。ないときは項目ごと無い。 */
  fighterClass?: string;
};

export type LocalBout = {
  id: string;
  redId: string;
  blueId: string;
  className: string;
  rule: string;
};

export type LocalTournament = {
  schema: 1;
  eventId: string;
  title: string;
  venue: string;
  date: string;
  updatedAt: number;
  currentBout: number;
  fighters: LocalFighter[];
  bouts: LocalBout[];
  entryConfig?: EntryFormConfig;
};

const PRIVATE_HEADERS = [
  '電話', '電話番号', 'メール', 'メールアドレス', '住所', '郵便番号', '保護者名',
  '連絡先', '生年月日', '同意者名', '申込日時', '受付番号',
];

export function emptyTournament(eventId = 'my-tournament'): LocalTournament {
  return { schema: 1, eventId, title: '大会名未設定', venue: '', date: '', updatedAt: Date.now(), currentBout: 0, fighters: [], bouts: [] };
}

export function privateHeaders(csv: string): string[] {
  const first = csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  return PRIVATE_HEADERS.filter((word) => first.includes(word));
}

/**
 * 見出しの読み方（別の言い方も読む）。見出しは、全角・半角、大文字・小文字、うしろの（単位）のちがいを無くして比べる
 * （「体重（kg）」「体重(kg)」「ＮＡＭＥ」も読める）。
 * 「クラス」の列は、見出しがあれば、中が空でも「クラスの列がある」と数える。
 */
const ALIASES = {
  id: ['管理番号', 'id'],
  name: ['選手名', '名前', '氏名', 'お名前', '選手名（リングネーム）', 'リングネーム', 'ファイター名', 'fighter_name', 'name'],
  gym: ['ジム名', '所属ジム', '所属gym', '所属', 'ジム', 'チーム', 'gym', 'team'],
  grade: ['学年', 'grade'],
  age: ['年齢', 'age'],
  height: ['身長', 'height'],
  weight: ['体重', '試合時の希望体重（kg）', '希望体重', 'weight'],
  record: ['戦績', '戦績・競技歴', '競技歴', 'record'],
  comment: ['意気込み', '試合への意気込み', 'comment'],
  musicUrl: ['入場曲', '入場曲url', '入場曲URL（Apple Music推奨）', '入場曲のリンク', 'music_url', 'music'],
} as const;
/** このアプリが書く名前と、はっきりクラスとわかる見出し */
const CLASS_HEADERS = ['クラス', 'fighter_class', 'クラス区分', '申込クラス', '申し込みクラス'];
/** 「class」「区分」は、体重の区分・男子／女子の区分のこともある。中身が Aクラス／Bクラス のときだけ、クラスの列として読む */
const WEAK_CLASS_HEADERS = ['class', '区分'];

/** 1つの欄に入れられる文字数の上限（保存の検査は5000文字。これを超えると、保存がすべて失敗するので、取り込みのときに切る） */
export const HARD_TEXT_LIMIT = 5000;

/**
 * Googleのシートと名簿ZIPは、数式にならないよう、= + - @ で始まる文字の前に ' を1つ足して書く（受付のスクリプトの clean_ と、
 * entryPackage の safeCell）。取り込むときは、その守りの ' を1つだけ外して、元の文字に戻す。
 * （' のあとが = + - @ でないときは、本物の ' なので外さない）
 */
export function unguardCell(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

export type ImportResult = {
  fighters: LocalFighter[];
  blockedHeaders: string[];
  /** ファイルに「クラス」の列があったか（空欄だけの列でも true）。無い古いファイルで、今のクラスを消さないために使う */
  hasClassColumn: boolean;
  /** 長すぎて切った欄の数（HARD_TEXT_LIMIT 超え） */
  cut: number;
  /** 読めなかった列の見出し（このアプリが使わない列）。黙って捨てないよう、画面に出す */
  unreadHeaders: string[];
  /** 選手名が空だったので入れなかった行の番号（ファイルの上から数えて何行目か。見出しが1行目） */
  skippedLines: number[];
};

const NO_IMPORT = (blockedHeaders: string[]): ImportResult => ({ fighters: [], blockedHeaders, hasClassColumn: false, cut: 0, unreadHeaders: [], skippedLines: [] });

export function importFighters(csv: string): ImportResult {
  const blockedHeaders = privateHeaders(csv);
  if (blockedHeaders.length) return NO_IMPORT(blockedHeaders);
  // 「"」が閉じないままのファイルは、あとの行が黙って消えるので、読まずに止める（CsvQuoteError）
  const { headers, rows: indexed } = toRowsIndexed(csv, { strict: true });
  const rows = indexed.map((item) => item.row);
  const known = new Set<string>([...Object.values(ALIASES).flat(), ...CLASS_HEADERS, ...WEAK_CLASS_HEADERS].map(normalizeKey));
  const keyOf = (header: string) => normalizeKey(header);
  const strongClass = CLASS_HEADERS.map(normalizeKey);
  let classKeys = strongClass.filter((key) => headers.some((header) => keyOf(header) === key));
  // 「class」「区分」: 中身が Aクラス／Bクラス（A・B・上・下 も）だけのときに限って、クラスの列にする
  const weakKeys = WEAK_CLASS_HEADERS.map(normalizeKey).filter((key) => headers.some((header) => keyOf(header) === key));
  const weakOk = (key: string) => {
    const values = rows.map((row) => (row[key] ?? '').trim()).filter(Boolean);
    return values.every((value) => ['Aクラス', 'Bクラス'].includes(normalizeClassLoose(cleanClassLabel(value), DEFAULT_CLASS_SETTINGS)));
  };
  const weakUsed = classKeys.length === 0 ? weakKeys.filter(weakOk) : [];
  classKeys = [...classKeys, ...weakUsed];
  const classAliases = classKeys.length ? classKeys : strongClass;
  const unreadHeaders: string[] = [];
  for (const header of headers) {
    const key = keyOf(header);
    if (!header || !key) continue;
    const used = known.has(key) && !(WEAK_CLASS_HEADERS.map(normalizeKey).includes(key) && !weakUsed.includes(key));
    if (!used && !unreadHeaders.includes(header)) unreadHeaders.push(header);
  }
  const hasClassColumn = classKeys.length > 0;
  let cut = 0;
  const limit = (raw: string): string => { const value = unguardCell(raw.replace(INVISIBLE_KEEP_JOINERS_RE, '')); if (value.length <= HARD_TEXT_LIMIT) return value; cut++; return value.slice(0, HARD_TEXT_LIMIT); };
  const skippedLines: number[] = [];
  const fighters: LocalFighter[] = [];
  rows.forEach((row, index) => {
    const name = limit(pick(row, ...ALIASES.name));
    if (name.trim() === '') { skippedLines.push(indexed[index].line); return; }
    const gym = limit(pick(row, ...ALIASES.gym));
    const stable = limit(pick(row, ...ALIASES.id) || fingerprint(String(index), name, gym));
    const cls = cleanClassLabel(pick(row, ...classAliases));
    fighters.push({
      id: stable,
      gym,
      name,
      grade: limit(pick(row, ...ALIASES.grade)),
      age: limit(pick(row, ...ALIASES.age)),
      height: limit(pick(row, ...ALIASES.height)),
      weight: limit(pick(row, ...ALIASES.weight)),
      record: limit(pick(row, ...ALIASES.record)),
      comment: limit(pick(row, ...ALIASES.comment)),
      musicUrl: limit(pick(row, ...ALIASES.musicUrl)),
      photoDataUrl: '',
      ...(cls ? { fighterClass: cls } : {}),
    });
  });
  if (new Set(fighters.map((fighter) => fighter.id)).size !== fighters.length) throw new Error('同じ管理番号が2つあります。原本で重複を確認してください。今ある名簿は変えていません。');
  return { fighters, blockedHeaders: [], hasClassColumn, cut, unreadHeaders, skippedLines };
}

/** Re-import by receipt, retaining cards and fighters absent from this file. Never guess by name. */
export function mergeFighters(current: LocalFighter[], incoming: LocalFighter[]): LocalFighter[] {
  if (new Set(incoming.map(fighter=>fighter.id)).size !== incoming.length) throw new Error('同じ管理番号が2つあります。元の名簿は変えていません。');
  const updates = new Map(incoming.map(fighter=>[fighter.id,fighter]));
  const existing = new Set(current.map(fighter=>fighter.id));
  const combined = current.map(fighter=>{
    const next=updates.get(fighter.id);
    return next ? {...next,photoDataUrl:next.photoDataUrl||fighter.photoDataUrl} : fighter;
  }).concat(incoming.filter(fighter=>!existing.has(fighter.id)));
  if(combined.length>3000)throw new Error('名簿が3000人を超えます。元の名簿は変えていません。');
  return combined;
}

export function contractWeight(red: LocalFighter | undefined, blue: LocalFighter | undefined): string {
  const parse = (value: string | undefined) => Number(String(value ?? '').trim().replace(/kg$/i, '').trim());
  const weights = [parse(red?.weight), parse(blue?.weight)];
  if (!weights.every((value) => Number.isFinite(value) && value >= 10 && value <= 250)) return '';
  const value = Math.max(...weights);
  return (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)) + 'kg契約';
}

/** 名前とジムが同じかを見るための印（全角・半角と空白の差は無視する）。名前が空のときは空の文字 */
export const sameFighterKey = (fighter: LocalFighter): string => fighter.name.trim() ? stripInvisibleChars(fighter.name).normalize('NFKC').replace(/\s+/g, '') + '|' + gymKey(fighter.gym) : '';

/** ジム名を比べるための印（全角・半角、大文字・小文字、空白、見えない文字のちがいは同じ）。空のジム名は空の文字。「同じジムか」は、全部ここで決める */
export const gymKey = (gym: string): string => stripInvisibleChars(String(gym ?? '')).normalize('NFKC').toLowerCase().replace(/[\s\u3000]+/g, '');

/** Soft warnings for one card. They never block saving; the organizer decides. */
export const WEIGHT_GAP_WARN_KG = 5;
export function boutWarnings(bout: LocalBout, fighters: LocalFighter[], bouts: LocalBout[]): string[] {
  const red = fighters.find((f) => f.id === bout.redId), blue = fighters.find((f) => f.id === bout.blueId);
  const warnings: string[] = [];
  const parse = (value: string | undefined) => Number(String(value ?? '').trim().replace(/kg$/i, '').trim());
  if (red && blue) {
    const a = parse(red.weight), b = parse(blue.weight);
    if (Number.isFinite(a) && Number.isFinite(b) && a >= 10 && b >= 10 && Math.abs(a - b) >= WEIGHT_GAP_WARN_KG) warnings.push('体重差が ' + (Math.round(Math.abs(a - b) * 10) / 10) + 'kg あります（' + red.name + ' ' + a + 'kg / ' + blue.name + ' ' + b + 'kg）。');
    if (gymKey(red.gym) && gymKey(red.gym) === gymKey(blue.gym)) warnings.push('同じジム（' + red.gym.trim() + '）の選手どうしです。');
    // 管理番号はちがうのに、名前もジムも同じ（同じ人が2回申し込んだ）。赤と青に同じ人を入れていないか
    if (red.id !== blue.id && sameFighterKey(red) && sameFighterKey(red) === sameFighterKey(blue)) warnings.push('赤と青が、同じ人かもしれません（' + red.name + '・名前もジムも同じです）。');
  }
  // 同じ人（管理番号が同じ、または名前とジムが同じ）が何試合に入っているか
  const inBout = (other: LocalBout, f: LocalFighter): boolean => {
    const key = sameFighterKey(f);
    return [other.redId, other.blueId].some((id) => {
      if (!id) return false;
      if (id === f.id) return true;
      if (!key) return false;
      const person = fighters.find((x) => x.id === id);
      return !!person && sameFighterKey(person) === key;
    });
  };
  [red, blue].forEach((f) => {
    if (!f) return;
    const count = bouts.filter((other) => inBout(other, f)).length;
    if (count > 1) warnings.push(f.name + ' が ' + count + ' 試合に入っています。');
  });
  return warnings;
}

export function safeMusicUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    if (host === 'music.apple.com' || host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return url.toString();
  } catch { /* Invalid URL: do not make it clickable. */ }
  return '';
}

export function validateTournament(value: LocalTournament): string[] {
  const errors: string[] = [];
  if (!value.title.trim()) errors.push('大会名を入力してください。');
  value.bouts.forEach((bout, index) => {
    if (!bout.redId || !bout.blueId) errors.push('第' + (index + 1) + '試合の赤・青を選んでください。');
    if (bout.redId && bout.redId === bout.blueId) errors.push('第' + (index + 1) + '試合で同じ選手が選ばれています。');
    if ([bout.redId, bout.blueId].some((id) => id && !value.fighters.some((fighter) => fighter.id === id))) errors.push('第' + (index + 1) + '試合に名簿にいない選手がいます。選び直してください。');
  });
  if (new Set(value.fighters.map((fighter) => fighter.id)).size !== value.fighters.length) errors.push('選手の管理番号が重複しています。');
  if (new Set(value.bouts.map((bout) => bout.id)).size !== value.bouts.length) errors.push('試合の管理番号が重複しています。');
  return errors;
}

/** Validate stored/backup data before it can overwrite this event. Incomplete cards are allowed while preparing. */
export function isLocalTournament(value: unknown): value is LocalTournament {
  if (!value || typeof value !== 'object') return false;
  const data = value as LocalTournament;
  const text = (item: unknown) => typeof item === 'string' && item.length <= 5000;
  if (data.entryConfig !== undefined && (!data.entryConfig || typeof data.entryConfig.music !== 'boolean' || !['grade','age','comment'].every(key => ['off','optional','required'].includes(data.entryConfig![key as 'grade'|'age'|'comment'])))) return false;
  // 受付のクラス設定（あれば）。形がおかしいものは断る。無い古いデータは今までどおり通す
  if (data.entryConfig?.classes !== undefined && !parseClassSettings(data.entryConfig.classes)) return false;
  if (data.schema !== 1 || !text(data.eventId) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(data.eventId) || ![data.title,data.venue,data.date].every(text) || !Number.isFinite(data.updatedAt) || !Number.isInteger(data.currentBout) || data.currentBout<0 || !Array.isArray(data.fighters) || !Array.isArray(data.bouts) || data.fighters.length>3000 || data.bouts.length>3000 || data.currentBout>=Math.max(1,data.bouts.length)) return false;
  return data.fighters.every((fighter) => fighter && ['id','gym','name','grade','age','height','weight','record','comment','musicUrl'].every((key) => text(fighter[key as keyof LocalFighter])) && fighter.id.length>0 && (fighter.fighterClass === undefined || (typeof fighter.fighterClass === 'string' && fighter.fighterClass.length <= 40)) && typeof fighter.photoDataUrl==='string' && (!fighter.photoDataUrl || /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(fighter.photoDataUrl) && fighter.photoDataUrl.length<=1_800_100)) && data.bouts.every((bout) => bout && ['id','redId','blueId','className','rule'].every((key) => text(bout[key as keyof LocalBout])) && bout.id.length>0) && new Set(data.fighters.map(fighter=>fighter.id)).size===data.fighters.length && new Set(data.bouts.map(bout=>bout.id)).size===data.bouts.length;
}
