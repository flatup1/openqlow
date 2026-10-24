// 準備の画面（/private/）だけで使う、画面に依存しない小さな計算。
// 通信・保存・乱数・日時の読み取りはしません（画面側が担当します）。
import { contractWeight, gymKey, sameFighterKey, type LocalBout, type LocalFighter, type LocalTournament } from '../../core/privateTournament.ts';
import { classNameKey, classState, cleanClassLabel, DEFAULT_CLASS_SETTINGS, normalizeClass, normalizeClassLoose, type ClassSettings } from '../../core/classRules.ts';
import { dateDigits, formatDateInput, isCompleteDate } from '../../core/dateInput.ts';
import { classesFromParam, DEFAULT_ENTRY_CONFIG, type EntryFieldMode, type EntryFormConfig } from '../../core/entryPackage.ts';
import { boutWeightWarning, cleanDivisionName, cleanWeightText, divisionKey, findDivision, normalizeDivisionLoose, normalizeWeightClass, normalizeWeightClassLoose, WEIGHT_LIMITS, weightSettingsToParam, weightsFromParam, type WeightSettings } from '../../core/weightClass.ts';
import { parseRecordDetailCsv, recordDetailProblems, RECORD_KIND, type RecordDetail } from '../../core/recordDetail.ts';
import { toRowsIndexed } from '../../core/csv.ts';
import { isValidEventId } from './eventId.ts';
import { checkMusic, checkNumber, FIELD_LABEL, type FieldKey } from './normalize.ts';

export const UNSET_TITLE = '大会名未設定';
export const FALLBACK_ERROR = 'うまくいきませんでした。もう一度やってみてください。直らないときは、ジムの担当者に連絡してください。';

/** 「大会名未設定」は、まだ名前が決まっていない状態として扱う（保存データは変えない） */
export const isTitleReal = (title: string): boolean => {
  const text = title.trim();
  return text !== '' && text !== UNSET_TITLE;
};

/** core の contractWeight / boutWarnings と同じ読み取りルール（10〜250） */
export function parseKg(value: string | undefined): number | null {
  const n = Number(String(value ?? '').trim().replace(/kg$/i, '').trim());
  return Number.isFinite(n) && n >= 10 && n <= 250 ? n : null;
}

/** 体重差（0.1kg単位）。どちらかが読めないときは null */
export function weightGap(red?: LocalFighter, blue?: LocalFighter): number | null {
  const a = parseKg(red?.weight), b = parseKg(blue?.weight);
  if (a === null || b === null) return null;
  return Math.round(Math.abs(a - b) * 10) / 10;
}

export const isBlankBout = (bout: LocalBout): boolean => !bout.redId && !bout.blueId;
/** 赤か青のどちらか一方だけ入っている（未完成） */
export const isHalfBout = (bout: LocalBout): boolean => !!bout.redId !== !!bout.blueId;

export function unplacedFighters(fighters: LocalFighter[], bouts: LocalBout[]): LocalFighter[] {
  const placed = new Set<string>();
  for (const bout of bouts) { if (bout.redId) placed.add(bout.redId); if (bout.blueId) placed.add(bout.blueId); }
  return fighters.filter((fighter) => !placed.has(fighter.id));
}

export type BoutProblem = { side: 'red' | 'blue' | 'both' | 'same' | 'unknown'; text: string };

/** validateTournament の1試合ぶんの条件を、場所つきで返す（空の試合は問題にしない） */
export function boutProblems(bout: LocalBout, index: number, fighters: LocalFighter[]): BoutProblem[] {
  if (isBlankBout(bout)) return [];
  const no = '第' + (index + 1) + '試合';
  const list: BoutProblem[] = [];
  if (!bout.redId && !bout.blueId) list.push({ side: 'both', text: no + 'の赤コーナーと青コーナーの選手を選んでください。' });
  else if (!bout.redId) list.push({ side: 'red', text: no + 'の赤コーナーの選手を選んでください。' });
  else if (!bout.blueId) list.push({ side: 'blue', text: no + 'の青コーナーの選手を選んでください。' });
  if (bout.redId && bout.redId === bout.blueId) list.push({ side: 'same', text: no + 'で、同じ選手が赤と青に選ばれています。' });
  if ([bout.redId, bout.blueId].some((id) => id && !fighters.some((fighter) => fighter.id === id))) list.push({ side: 'unknown', text: no + 'に、名簿にいない選手がいます。選び直してください。' });
  return list;
}

/** 空の試合（赤も青も空）を取り除く。いまの試合の番号は、はみ出さないように直す */
export function dropBlankBouts(value: LocalTournament): LocalTournament {
  if (!value.bouts.some(isBlankBout)) return value;
  const bouts = value.bouts.filter((bout) => !isBlankBout(bout));
  // いまの試合より前にあった空の試合が消えると、番号が前に詰まる。同じ試合を指し続けるよう、消えた数だけ引く（引かないと、いまの試合が1つ先に飛ぶ）
  const before = value.bouts.slice(0, Math.max(0, value.currentBout)).filter(isBlankBout).length;
  return { ...value, bouts, currentBout: Math.min(Math.max(0, value.currentBout - before), Math.max(0, bouts.length - 1)) };
}

/**
 * 保存されているコピーと、画面の元になったコピーが「試合の進み具合」だけ違うかを調べる。
 * 試合当日の画面が「いまの試合」を進めたときだけ、静かに取り込むために使う。
 */
export function sameExceptProgress(a: LocalTournament, b: LocalTournament): boolean {
  if (a.eventId !== b.eventId || a.title !== b.title || a.venue !== b.venue || a.date !== b.date) return false;
  if (JSON.stringify(a.entryConfig ?? null) !== JSON.stringify(b.entryConfig ?? null)) return false;
  if (a.fighters.length !== b.fighters.length || a.bouts.length !== b.bouts.length) return false;
  const fighterKeys = ['id', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'comment', 'musicUrl', 'photoDataUrl'] as const;
  for (let i = 0; i < a.fighters.length; i++) for (const key of fighterKeys) if (a.fighters[i][key] !== b.fighters[i][key]) return false;
  for (let i = 0; i < a.fighters.length; i++) if ((a.fighters[i].fighterClass ?? '') !== (b.fighters[i].fighterClass ?? '') || (a.fighters[i].absent === true) !== (b.fighters[i].absent === true)) return false;
  // くわしい戦績がちがうときも、「進み具合だけのちがい」とは言わない（ほかの画面の名簿の取り込みを、静かに取り込まないため）
  for (let i = 0; i < a.fighters.length; i++) if (!recordDetailSame(a.fighters[i].recordDetail, b.fighters[i].recordDetail)) return false;
  for (let i = 0; i < a.fighters.length; i++) if ((a.fighters[i].division ?? '') !== (b.fighters[i].division ?? '') || (a.fighters[i].weightClass ?? '') !== (b.fighters[i].weightClass ?? '')) return false;
  const boutKeys = ['id', 'redId', 'blueId', 'className', 'rule'] as const;
  for (let i = 0; i < a.bouts.length; i++) for (const key of boutKeys) if (a.bouts[i][key] !== b.bouts[i][key]) return false;
  return true;
}

export type NextKey = 'title' | 'fighters' | 'fighters2' | 'bouts' | 'half' | 'save' | 'fix' | 'open' | 'done';
export type NextState = {
  /** dateOk: 開催日は「なくてもOK」。次にやることの順番には入れない（あとで入れてもよい） */
  titleReal: boolean; dateOk: boolean; fighters: number; nonBlankBouts: number;
  halfIndex: number; dirty: boolean; everSaved: boolean; problems: number; opened: boolean;
};

/** 「次にやること」を1つだけ決める。順番は上から（開催日は入れない：空でも保存できて、開けるから） */
export function nextActionKey(s: NextState): NextKey {
  if (!s.titleReal) return 'title';
  if (s.fighters === 0) return 'fighters';
  if (s.fighters < 2) return 'fighters2';
  if (s.nonBlankBouts === 0) return 'bouts';
  if (s.halfIndex >= 0) return 'half';
  if (s.dirty || !s.everSaved) return 'save';
  if (s.problems > 0) return 'fix';
  return s.opened ? 'done' : 'open';
}

/** 日本時間の今日を、20271003 のような数にする */
export function todayJstNum(now: number = Date.now()): number {
  const jst = new Date(now + 9 * 60 * 60 * 1000);
  return jst.getUTCFullYear() * 10000 + (jst.getUTCMonth() + 1) * 100 + jst.getUTCDate();
}

/** 「2027年10月3日」「2027-10-03」「20271003」を 20271003 にする。日にちとして読めなければ null */
export function dateNum(value: string): number | null {
  const match = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(formatDateInput(value));
  return match ? Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]) : null;
}

/** 今日より前の日にちか（年の打ちまちがい・去年のシートのコピーに気づくため。読めない日にちは false） */
export function isPastDate(value: string, now: number = Date.now()): boolean {
  const n = dateNum(value);
  return n !== null && n < todayJstNum(now);
}

/** 例: 14:32 （端末の時計。個人情報ではありません） */
export function clockText(ms: number): string {
  const date = new Date(ms);
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

/** 試合当日の画面に出る契約体重の数字だけ（例: 61.5kg）。読めないときは空 */
export function contractKg(red?: LocalFighter, blue?: LocalFighter): string {
  return contractWeight(red, blue).replace('契約', '');
}

/** 取り込みエラーを、画面に出す固定の文に直す（外部ライブラリの文は出さない） */
export class ImportProblem extends Error {
  kind: 'no-list' | 'no-sheet' | 'blocked' | 'dup' | 'too-large' | 'too-many-files' | 'too-many' | 'empty' | 'ext' | 'encoding' | 'quote' | 'stale';
  constructor(kind: ImportProblem['kind']) { super(kind); this.name = 'ImportProblem'; this.kind = kind; }
}

export const KEEP = '今の名簿は変えていません。';

/** 読めない列の一覧。他の語に含まれる語（電話 と 電話番号）は除き、1回ずつ並べる */
export function blockedWords(words: string[]): string[] {
  const unique = [...new Set(words)];
  return unique.filter((word) => !unique.some((other) => other !== word && other.includes(word)));
}

/** ZIP や Excel を読む部品（別の小さなファイル）が、読み込めなかったときのエラー。古い画面を開いたままにして、サーバーが新しくなったときなどに起きる */
const CHUNK_FAILED = /Failed to fetch dynamically imported|Loading chunk|Loading CSS chunk|Failed to load chunk|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i;

/** 取り込みエラーの種類（わからないものは空） */
export function importProblemKind(error: unknown): ImportProblem['kind'] | '' {
  const text = error instanceof Error ? error.message : '';
  const name = error instanceof Error ? error.name : '';
  return error instanceof ImportProblem ? error.kind
    : name === 'ChunkLoadError' || CHUNK_FAILED.test(text) ? 'stale'
    : name === 'CsvQuoteError' ? 'quote'
    : text.includes('同じ管理番号') ? 'dup'
    : text.includes('3000人') ? 'too-many'
    : text.includes('ファイルが多すぎ') ? 'too-many-files'
    : text.includes('大きすぎ') || text.includes('多すぎ') ? 'too-large' : '';
}

export function importErrorText(error: unknown, blockedHeaders: string[] = []): string {
  const kind = importProblemKind(error);
  switch (kind) {
    case 'no-list': return 'ZIPの中に players.csv が見つかりません。シートのメニュー「Tournament OS」→「④ OS用の名簿ZIPを作る」で作ったZIPを、そのまま選んでください。' + KEEP;
    case 'no-sheet': return 'このExcelには「選手入力」というシートがありません。「選手入力シートを保存する」で保存したExcelに、選手を書いてから選んでください。' + KEEP;
    case 'blocked': { const words = blockedWords(blockedHeaders); return 'このファイルには、読み込めない情報（' + (words.length ? words.join('、') : '電話番号 など') + '）が入っています。その部分を消して、もう一度選んでください。' + KEEP; }
    case 'dup': return '同じ選手が2回入っています。Excelで重なっている行を1つ消して、もう一度選んでください。' + KEEP;
    case 'too-large': return 'ZIPが大きすぎます（全部で100MBまで）。写真を小さくして、「④ OS用の名簿ZIPを作る」でZIPを作り直してください。' + KEEP;
    case 'too-many-files': return 'ZIPの中のファイルが多すぎます（3000まで）。④で作ったZIPを、そのまま選んでください。' + KEEP;
    case 'too-many': return '選手が多すぎます（3000人までです）。' + KEEP;
    case 'empty': return 'このファイルから選手を1人も読み取れませんでした。1行目の見出し（例：選手名・ジム名・体重・戦績・クラス）と、選手の名前を確かめてください。' + KEEP;
    case 'ext': return 'ZIPかExcel（.xlsx）か、CSVを選んでください。' + KEEP;
    case 'quote': return 'ファイルの中に、閉じていない「"」（ダブルクォート）があります。その「"」を消して保存し直してから、もう一度選んでください。' + KEEP;
    case 'stale': return 'この画面が古くなっています。ページを開き直して（F5キー）、もう一度ファイルを選んでください。名簿と保存したデータは消えません。まだ保存していない入力があるときは、先に「保存する」を押します。';
    case 'encoding': return 'ExcelのCSVは読めないことがあります。Excelのファイル（.xlsx）のまま選ぶか、「CSV UTF-8」で保存し直してください。' + KEEP;
    default: return 'このファイルは読み込めませんでした。申し込みのZIPファイルか、「選手入力シート」のExcelを選んでください。' + KEEP;
  }
}

/** 選べるファイルの種類か（名前の最後で見る）。それ以外は中を読まずに止める */
export const importKind = (fileName: string): 'zip' | 'xlsx' | 'csv' | '' => {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.zip') ? 'zip' : lower.endsWith('.xlsx') ? 'xlsx' : lower.endsWith('.csv') ? 'csv' : '';
};

const ROSTER_HEADERS = ['選手名', '名前', '管理番号', 'fighter_name', 'name'];
const hasRosterHeader = (csv: string): boolean => { const first = (csv.split(/\r?\n/, 1)[0] ?? '').toLowerCase(); return ROSTER_HEADERS.some((word) => first.includes(word)); };

/**
 * CSV のバイト列を文字にする。まず UTF-8。文字化け（U+FFFD）が出るか、見出しが読めないときだけ Shift_JIS（ExcelのCSV）で読み直す。
 * ブラウザ内蔵の TextDecoder だけを使う（通信なし）。どちらもだめなら ImportProblem('encoding')。
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  const garbled = utf8.includes('\uFFFD');
  if (!garbled && hasRosterHeader(utf8)) return utf8;
  try {
    const sjis = new TextDecoder('shift_jis').decode(bytes);
    if (!sjis.includes('\uFFFD') && hasRosterHeader(sjis)) return sjis;
  } catch { /* shift_jis に対応していない環境 */ }
  if (!garbled) return utf8;
  throw new ImportProblem('encoding');
}

/* ───────── ZIP の中の名前を読む（フォルダごと圧縮した ZIP・Mac のごみを許す） ───────── */
/** 区切りを / にそろえる */
export const zipEntryName = (raw: string): string => raw.replace(/\\/g, '/').replace(/^\.?\//, '');
export const isZipJunk = (name: string): boolean => /(?:^|\/)__MACOSX\//i.test(name) || /(?:^|\/)(?:\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(name) || /(?:^|\/)\._[^/]*$/.test(name);
/** 名簿のCSV：いちばん外か、フォルダ1つの中の players.csv（大文字・小文字は気にしない） */
export const isRosterCsvName = (name: string): boolean => /^(?:[^/]+\/)?players\.csv$/i.test(name);
export const isPhotoName = (name: string): boolean => /^(?:[^/]+\/)?photos\/[^/]+\.(?:jpe?g|png|webp)$/i.test(name);
/** 見つかった中身から、名簿のCSVと写真を選ぶ。外にあるCSVを先に使い、無ければフォルダ1つの中のものを使う。無ければ null */
export function pickZipRoster(entries: ReadonlyArray<readonly [string, string]>): { csv: string; photos: Array<readonly [string, string]> } | null {
  const csvs = entries.filter(([, name]) => isRosterCsvName(name));
  if (!csvs.length) return null;
  const top = csvs.find(([, name]) => !name.includes('/')) ?? csvs[0];
  const prefix = top[1].includes('/') ? top[1].slice(0, top[1].indexOf('/') + 1) : '';
  const photos = entries.filter(([, name]) => isPhotoName(name) && name.toLowerCase().startsWith(prefix.toLowerCase() + 'photos/'))
    .map(([raw, name]) => [raw, 'photos/' + name.slice(name.lastIndexOf('/') + 1)] as const);
  return { csv: top[0], photos };
}

/* ───────── くわしい戦績（名簿ZIPの records.csv）。無い・読めないときは、何も付けない（名簿は別に読むので、エラーにしない） ───────── */

/** records.csv の大きさの上限。これより大きいものは読まない（名簿は止めない） */
export const RECORDS_CSV_MAX_BYTES = 5 * 1024 * 1024;
/** records.csv の名前（players.csv と同じく、いちばん外か、フォルダ1つの中。大文字・小文字は気にしない） */
export const isRecordsCsvName = (name: string): boolean => /^(?:[^/]+\/)?records\.csv$/i.test(name);

/** 名簿（players.csv）と同じフォルダにある records.csv の、ZIP の中の名前（無ければ null）。名簿のある場所に合わせる（写真と同じ決め方） */
export function recordsCsvEntry(entries: ReadonlyArray<readonly [string, string]>, rosterRaw: string): string | null {
  const roster = zipEntryName(rosterRaw);
  const prefix = roster.includes('/') ? roster.slice(0, roster.indexOf('/') + 1) : '';
  const want = (prefix + 'records.csv').toLowerCase();
  const hit = entries.find(([, name]) => isRecordsCsvName(name) && name.toLowerCase() === want);
  return hit ? hit[0] : null;
}

/**
 * records.csv（UTF-8）を、受付番号ごとのくわしい戦績にする。読めないときは空（何も付けない）。
 * 見出しが違うときは、ぜんぶ読まない。キックの1行が無い受付・決まりに合わない行がある受付は、その受付だけ付けない（一部だけ出さない）。
 */
export function recordDetailsFromCsv(bytes: Uint8Array | undefined): Map<string, RecordDetail> {
  const found = new Map<string, RecordDetail>();
  if (!bytes) return found;
  try {
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
    const parsed = parseRecordDetailCsv(text);
    if (!parsed.ok) return found;
    // キックの1行は、受付ごとに必ずある（受付の決まり）。キックの行が無い受付は、未経験と読まない
    const withKick = new Set(toRowsIndexed(text).rows.filter(({ row }) => row['種類'] === RECORD_KIND.kick).map(({ row }) => row['受付番号']));
    for (const [receipt, detail] of parsed.byReceipt) if (withKick.has(receipt) && recordDetailProblems(detail).length === 0) found.set(receipt, detail);
  } catch { /* 読めないときは、何も付けない（名簿は別に読める） */ }
  return found;
}

/** 受付番号（＝管理番号。前後の空白は無視）で、選手に付ける。付かなかった人は、そのまま（何も足さない） */
export function recordDetailOnFighters(fighters: LocalFighter[], details: Map<string, RecordDetail>): LocalFighter[] {
  if (!details.size) return fighters;
  return fighters.map((fighter) => {
    const detail = details.get(fighter.id.trim());
    return detail ? { ...fighter, recordDetail: detail } : fighter;
  });
}

/** 2つのくわしい戦績が同じか（どちらも無いときは同じ） */
export const recordDetailSame = (a: RecordDetail | undefined, b: RecordDetail | undefined): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** 準備の画面の「くわしい戦績」の文（1行ずつ）。キックは必ず1行。他の格闘技・タイトルは、あるものだけ */
export type RecordDetailLines = { kick: string; others: string[]; titles: string[] };
export function recordDetailLines(detail: RecordDetail): RecordDetailLines {
  const k = detail.kick;
  const kick = k.games === 0 ? 'キックボクシング：未経験（試合数 0）' : 'キックボクシング：試合数 ' + k.games + '・勝ち ' + k.win + '・負け ' + k.loss + '・引き分け ' + k.draw;
  const others = detail.others.map((o) => o.sport + '（他の格闘技）：試合数 ' + o.games + '・勝ち ' + o.win + '・負け ' + o.loss + '・引き分け ' + o.draw + '・勝敗なし ' + o.noResult);
  const titles = detail.titles.map((t) => 'タイトル・入賞：' + t.event + '（' + t.year + '年・' + t.class + '）・' + t.result);
  return { kick, others, titles };
}

/** 写真エラーを、次にやることつきの固定文に直す */
export function photoErrorText(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  if (text.includes('大きすぎ')) return '写真が大きすぎます。別の写真を選んでください。';
  return '写真が読み込めませんでした。別の写真を選ぶか、その場でカメラで撮ってください。';
}

/** 全角数字などをそろえる（身長・体重・年齢の打ち間違い対策。画面側だけの整形） */
export const tidy = (value: string): string => value.normalize('NFKC').trim();

/* ───────── 次にすること（塗りボタンは、いつも1つ） ───────── */

export type SaveState = 'idle' | 'saving' | 'failed';
export type NextKind = 'save' | 'title' | 'roster' | 'bout' | 'fix' | 'open' | 'conflict';
export type NextActionState = NextState & { saveState: SaveState; conflict: boolean };
export type NextAction = { kind: NextKind; key: NextKey; label: string };

const KEY_KIND: Record<NextKey, NextKind> = { title: 'title', fighters: 'roster', fighters2: 'roster', bouts: 'bout', half: 'bout', save: 'save', fix: 'fix', open: 'open', done: 'open' };

/** 入力の手順ごとの、ボタンの文言（上のバナーと下の帯で同じ文） */
export function nextLabel(key: NextKey, halfIndex = -1, halfSide: 'red' | 'blue' = 'blue'): string {
  switch (key) {
    case 'title': return '大会の名前を入れる';
    case 'fighters': return '選手のファイルを選ぶ';
    case 'fighters2': return '選手をもう1人入れる';
    case 'bouts': return '試合を1つ作る';
    case 'half': return '第' + (halfIndex + 1) + '試合の' + (halfSide === 'red' ? '赤' : '青') + 'を選ぶ';
    case 'save': return '保存する';
    case 'fix': return '直すところを見る';
    case 'done': return 'もう1つ開く';
    default: return '試合当日の画面を開く';
  }
}

/**
 * 「次にやること」を1つだけ決める（下の帯の塗りボタンも、上のバナーも、ここだけを見る）。
 * 優先: 別の画面との食いちがい > 保存中・保存失敗 > 次の入力 > （入力が終わったら）保存 > 直す > 開く
 * 「まだ入力が残っている」ときは入力を先にし、保存は小さなボタンで別に出す（画面側）。
 */
export function nextAction(s: NextActionState & { halfSide?: 'red' | 'blue' }): NextAction {
  if (s.conflict) return { kind: 'conflict', key: 'save', label: '上の「👉 次はここ」の箱を見る' };
  if (s.saveState === 'saving') return { kind: 'save', key: 'save', label: '保存中…' };
  if (s.saveState === 'failed') return { kind: 'save', key: 'save', label: 'もう一度 保存する' };
  const key = nextActionKey(s);
  return { kind: KEY_KIND[key], key, label: nextLabel(key, s.halfIndex, s.halfSide) };
}

/* ───────── 保存の4つの状態（状態ラインはここだけが決める） ───────── */

export type SaveLine = { tone: 'ok' | 'warn' | 'bad' | 'neutral'; text: string; short: string };

/** pending: 「この選手を追加」を押す前の入力・直している途中の入力がある（保存の対象には、まだ入っていない） */
export function saveLine(s: { conflict: boolean; saveState: SaveState; dirty: boolean; everSaved: boolean; savedClock: string; pending?: boolean }): SaveLine {
  if (s.conflict) return { tone: 'bad', text: '✕ 保存できません：別の画面で内容が変わりました', short: '✕ 保存できません' };
  if (s.saveState === 'saving') return { tone: 'neutral', text: '⏳ 保存中…（そのままお待ちください）', short: '⏳ 保存中…' };
  if (s.saveState === 'failed') return { tone: 'bad', text: '✕ 保存失敗（入れた内容は画面に残っています）', short: '✕ 保存失敗' };
  if (s.dirty) return { tone: 'warn', text: '● 未保存（入れた内容は、まだ保存していません）', short: '● 未保存' };
  if (!s.everSaved) return { tone: 'warn', text: '● 未保存（まだ一度も保存していません）', short: '● 未保存' };
  if (s.pending) return { tone: 'warn', text: '● 未保存（選手の入力が、まだ追加されていません）', short: '● 未保存' };
  return { tone: 'ok', text: '✓ 保存済み ' + s.savedClock, short: '✓ 保存済み ' + s.savedClock };
}

/* ───────── 保存に失敗した理由を分ける ───────── */

export type SaveErrorKind = 'bad-id' | 'bad-data' | 'quota' | 'unavailable' | 'other';

export function classifySaveError(error: unknown, eventId = ''): SaveErrorKind {
  if (eventId && !isValidEventId(eventId)) return 'bad-id';
  const name = error instanceof Error || (typeof DOMException !== 'undefined' && error instanceof DOMException) ? (error as Error).name : '';
  const text = error instanceof Error ? error.message : '';
  // 大会番号が正しいのに「データを確認」と言われたら、原因は大会番号ではなく、どこかの欄（長すぎる文字など）
  if (text.includes('保存するデータを確認してください')) return 'bad-data';
  if (name === 'QuotaExceededError' || /quota/i.test(text) || /空き容量/.test(text)) return 'quota';
  if (text.includes('保存場所を開けません') || text.includes('保存場所の更新') || name === 'InvalidStateError' || name === 'SecurityError' || name === 'NotFoundError') return 'unavailable';
  return 'other';
}

export function saveErrorText(kind: SaveErrorKind): string {
  switch (kind) {
    case 'bad-id': return 'この画面のアドレスの大会番号が使えません。「新しい大会をつくる」から作り直してください。入れた内容は画面に残っています。';
    case 'bad-data': return '保存できませんでした。どこかの欄が長すぎます。選手の一覧の「長い…」の知らせを見てください。入れた内容は画面に残っています。';
    case 'quota': return '保存できませんでした。パソコンの空きが足りません。入れた内容は残っています。';
    case 'unavailable': return '保存できませんでした。保存場所が開けません。入れた内容は残っています。ほかの画面を閉じてみてください。';
    default: return '保存できませんでした。入れた内容は残っています。';
  }
}

/* ───────── 名簿の読み込み: 前からいる人は、黙って変えない ───────── */

const FIGHTER_FIELDS: Array<[keyof LocalFighter, string]> = [
  ['name', '名前'], ['gym', 'ジム名'], ['grade', '学年'], ['age', '年齢'], ['height', '身長'], ['weight', '体重'], ['record', '戦績'], ['comment', '意気込み'], ['musicUrl', '入場曲'],
];

export type FighterDiff = { name: string; fields: Array<{ label: string; from: string; to: string }> };
export type MergeKeepResult = {
  /** 新しく入った人の数（名前とジムが同じ人は、ここに数えない） */
  added: number;
  /** 前からいて、内容も同じ人の数 */
  same: number;
  /** 前からいて、内容がちがう人（既定では、前の内容のまま） */
  differs: FighterDiff[];
  /** 前からいた人は今のまま + 新しい人 + （写真がなかった人の写真）。名前とジムが同じ人は足さない */
  merged: LocalFighter[];
  /** ファイルの内容を優先した場合の名簿（ボタンを押して確認したときだけ使う） */
  overwritten: LocalFighter[];
  /** 写真がなかった人に、ファイルの写真を足した数 */
  photosFilled: number;
  /** クラスが空だった人に、ファイルのクラスを足した数（親が申し込みで選んだ値なので、黙って足してよい） */
  classesFilled: number;
  /** 区分・階級が空だった人に、ファイルの区分・階級を足した人数（クラスと同じ。親が申し込みで選んだ値なので、黙って足してよい） */
  weightsFilled: number;
  /** くわしい戦績を足した人の数（前からいて、くわしい戦績が無かった人だけ） */
  recordsFilled: number;
  /** merged が今の名簿と変わるか（変わらなければ、画面を「未保存」にしない） */
  changed: boolean;
  /** 管理番号はちがうが、名前とジムが前からいる人と同じ人（管理番号の空欄で行がずれたときに起こる）。既定では足さない */
  lookalike: LocalFighter[];
};

/** 名前とジムが同じかを見るための印（全角・半角と空白の差は無視する） */
export const sameKey = (fighter: LocalFighter): string => fighter.name.normalize('NFKC').replace(/\s+/g, '') + '|' + gymKey(fighter.gym);
/** 名前が空でないときの印（試合の注意と同じ決め方。core と同じ） */
export { sameFighterKey };

/**
 * 前からいる人は黙って変えない。新しい人だけ足す。
 * クラスだけは別あつかい：前のクラスが空なら、ファイルのクラスを足す（classesFilled）。
 * ファイルに「クラス」の列が無い（hasClassColumn=false）ときは、クラスを比べず、前のクラスを消さない。
 * 区分・階級もクラスと同じ（足した人数は weightsFilled。列が無い hasDivisionColumn / hasWeightClassColumn=false のときは、比べず、消さない）。
 * 区分がちがう（前の区分のまま）ときは、階級だけをファイルから足さない（別の区分の階級が混ざらないように。ちがいとして出す）。
 */
export function mergeKeepExisting(current: LocalFighter[], incoming: LocalFighter[], opts: { hasClassColumn?: boolean; hasDivisionColumn?: boolean; hasWeightClassColumn?: boolean } = {}): MergeKeepResult {
  const hasClassColumn = opts.hasClassColumn !== false;
  const hasDivisionColumn = opts.hasDivisionColumn !== false, hasWeightClassColumn = opts.hasWeightClassColumn !== false;
  if (new Set(incoming.map((fighter) => fighter.id)).size !== incoming.length) throw new Error('同じ管理番号が2つあります。元の名簿は変えていません。');
  const byId = new Map(current.map((fighter) => [fighter.id, fighter]));
  const incomingById = new Map(incoming.map((fighter) => [fighter.id, fighter]));
  const fresh = incoming.filter((fighter) => !byId.has(fighter.id));
  if (current.length + fresh.length > 3000) throw new Error('名簿が3000人を超えます。元の名簿は変えていません。');
  const known = new Set(current.filter((fighter) => fighter.name.trim()).map(sameKey));
  const lookalike = fresh.filter((fighter) => fighter.name.trim() && known.has(sameKey(fighter)));
  const lookalikeIds = new Set(lookalike.map((fighter) => fighter.id));
  const added = fresh.filter((fighter) => !lookalikeIds.has(fighter.id));
  const differs: FighterDiff[] = [];
  let same = 0, photosFilled = 0, classesFilled = 0, weightsFilled = 0, recordsFilled = 0;
  const merged = current.map((fighter) => {
    const next = incomingById.get(fighter.id);
    if (!next) return fighter;
    const fields = FIGHTER_FIELDS.filter(([key]) => (fighter[key] ?? '') !== (next[key] ?? '')).map(([key, label]) => ({ label, from: String(fighter[key] ?? ''), to: String(next[key] ?? '') }));
    const mine = (fighter.fighterClass ?? '').trim(), theirs = (next.fighterClass ?? '').trim();
    let fillClass = false;
    if (hasClassColumn) {
      if (!mine && theirs) fillClass = true;
      else if (!sameClassName(mine, theirs)) fields.push({ label: 'クラス', from: mine, to: theirs });
    }
    const mineD = (fighter.division ?? '').trim(), theirsD = (next.division ?? '').trim();
    const mineW = (fighter.weightClass ?? '').trim(), theirsW = (next.weightClass ?? '').trim();
    let fillD = false, fillW = false;
    if (hasDivisionColumn) {
      if (!mineD && theirsD) fillD = true;
      else if (!sameWeightText(mineD, theirsD)) fields.push({ label: '区分', from: mineD, to: theirsD });
    }
    if (hasWeightClassColumn) {
      const sameDivision = !theirsD || sameWeightText(fillD ? theirsD : mineD, theirsD);
      if (!mineW && theirsW && sameDivision) fillW = true;
      else if (!sameWeightText(mineW, theirsW)) fields.push({ label: '階級', from: mineW, to: theirsW });
    }
    if (next.photoDataUrl && fighter.photoDataUrl && next.photoDataUrl !== fighter.photoDataUrl) fields.push({ label: '写真', from: 'あり', to: '別の写真' });
    // くわしい戦績：前から入っている分は黙って変えない。ちがうときだけ「ちがい」に出す（書きかえを選んだときに、ファイルの分になる）
    if (fighter.recordDetail && next.recordDetail && !recordDetailSame(fighter.recordDetail, next.recordDetail)) fields.push({ label: 'くわしい戦績', from: 'あり', to: '別の内容' });
    if (fields.length) differs.push({ name: fighter.name || '名前なし', fields }); else same++;
    let out = fighter;
    if (!fighter.photoDataUrl && next.photoDataUrl) { photosFilled++; out = { ...out, photoDataUrl: next.photoDataUrl }; }
    if (fillClass) { classesFilled++; out = { ...out, fighterClass: theirs }; }
    if (fillD || fillW) { weightsFilled++; out = { ...out, ...(fillD ? { division: theirsD } : {}), ...(fillW ? { weightClass: theirsW } : {}) }; }
    // くわしい戦績が無かった人には、ファイルの分を足す（空欄を埋めるのと同じ。入っている分は、そのまま）
    if (!fighter.recordDetail && next.recordDetail) { recordsFilled++; out = { ...out, recordDetail: next.recordDetail }; }
    return out;
  });
  const all = merged.concat(added);
  const overwritten = current.map((fighter) => {
    const next = incomingById.get(fighter.id);
    if (!next) return fighter;
    const out: LocalFighter = { ...next, photoDataUrl: next.photoDataUrl || fighter.photoDataUrl };
    // 欠場は、名簿の書きかえで消さない（名簿のファイルには、欠場の列が無い）
    if (fighter.absent) out.absent = true;
    // クラスの列が無いファイル・空のクラスで、前のクラスを消さない（親が選んだ値）
    const keep = (fighter.fighterClass ?? '').trim();
    if (!(next.fighterClass ?? '').trim() && keep && !hasClassColumn) out.fighterClass = fighter.fighterClass;
    // 区分・階級の列が無いファイルでも、前の区分・階級を消さない
    if (!(next.division ?? '').trim() && (fighter.division ?? '').trim() && !hasDivisionColumn) out.division = fighter.division;
    if (!(next.weightClass ?? '').trim() && (fighter.weightClass ?? '').trim() && !hasWeightClassColumn) out.weightClass = fighter.weightClass;
    // くわしい戦績は、名簿のファイルには無い（records.csv は別）。ファイルに無い人は、前の戦績を消さない（欠場と同じ）
    if (!next.recordDetail && fighter.recordDetail) out.recordDetail = fighter.recordDetail;
    return out;
  }).concat(added);
  return { added: added.length, same, differs, merged: all, overwritten, photosFilled, classesFilled, weightsFilled, recordsFilled, changed: added.length > 0 || photosFilled > 0 || classesFilled > 0 || weightsFilled > 0 || recordsFilled > 0, lookalike };
}

/** 書きかえで「何が変わるか」を見せる順番。このアプリで大事なもの（クラス・体重・戦績・名前）が先 */
const OVERWRITE_ORDER = ['クラス', '区分', '階級', '体重', '戦績', '名前', 'ジム名', '身長', '年齢', '学年', '意気込み', '入場曲', '写真'];
const orderOf = (label: string): number => { const at = OVERWRITE_ORDER.indexOf(label); return at < 0 ? OVERWRITE_ORDER.length : at; };

/**
 * 「ファイルの内容に書きかえる」前の確認の文の材料。1行目＝結論（何人が変わるか）、あとは例。
 * 例は大事な順（クラス・体重・戦績・名前…）。空の欄が埋まるだけの変化（学年・年齢など）は、「空欄を埋める」とまとめる。
 * クラスが変わる人は、人ごとに1行（「クラス Aクラス→Bクラス：名前」）。いちばん上に出す。
 */
function overwriteParts(differs: FighterDiff[]): { verdict: string; examples: string[] } {
  const classLines = differs.flatMap((item) => item.fields.filter((field) => field.label === 'クラス').map((field) => 'クラス ' + (field.from || '（空）') + '→' + (field.to || '（空）') + '：' + item.name));
  // 区分・階級も、クラスと同じ。人ごとに1行（「区分 中学生女子→中学生男子：名前」）。クラスの次に出す
  const weightLines = differs.flatMap((item) => item.fields.filter((field) => field.label === '区分' || field.label === '階級').map((field) => field.label + ' ' + (field.from || '（空）') + '→' + (field.to || '（空）') + '：' + item.name));
  const own = (label: string): boolean => label === 'クラス' || label === '区分' || label === '階級';
  const people = differs.map((item) => {
    const changed = item.fields.filter((field) => !own(field.label) && field.from !== '').sort((a, b) => orderOf(a.label) - orderOf(b.label));
    const fills = item.fields.filter((field) => !own(field.label) && field.from === '');
    return { name: item.name, changed, fills };
  }).filter((item) => item.changed.length > 0 || item.fills.length > 0);
  const personLine = (item: (typeof people)[number]): string => {
    const shown = item.changed.slice(0, 2).map((field) => field.label + ' ' + field.from + '→' + (field.to || '（空）')).join('、');
    const more = item.changed.length > 2 ? ' ほか' : '';
    const fill = item.fills.length ? (shown ? '、' : '') + '空欄を埋める：' + item.fills.map((field) => field.label).join('・') : '';
    return item.name + ' ' + shown + more + fill;
  };
  const shownPeople = people.slice(0, 3).map(personLine);
  return {
    verdict: '次の' + differs.length + '人を、ファイルの内容に書きかえます（手で直した所も戻ります）：',
    examples: [...classLines.slice(0, 5), ...(classLines.length > 5 ? ['クラスが変わる人は、ほか' + (classLines.length - 5) + '人'] : []), ...weightLines.slice(0, 5), ...(weightLines.length > 5 ? ['区分・階級が変わる所は、ほか' + (weightLines.length - 5) + 'か所'] : []), ...shownPeople, ...(people.length > 3 ? ['ほか' + (people.length - 3) + '人'] : [])],
  };
}

/** 「ファイルの内容に書きかえる」前の確認の文。何が変わるかを数と例で書く */
export function overwriteConfirmText(differs: FighterDiff[]): string {
  const { verdict, examples } = overwriteParts(differs);
  return verdict + '\n' + examples.join('\n') + '\n\nよろしいですか？';
}

/** 画面の中の確認の箱に出す文（「よろしいですか？」は、ボタンがあるので付けない） */
export type BoxText = { verdict: string; lines: string[] };
export function overwriteBoxText(differs: FighterDiff[]): BoxText {
  const { verdict, examples } = overwriteParts(differs);
  return { verdict: verdict.replace(/：$/, '。'), lines: examples };
}

/* ───────── 手入力フォーム ───────── */

/** 1つも入れていない手入力フォームか（二度押しで同じ説明が出続けないように） */
export const isBlankFighterForm = (f: LocalFighter): boolean =>
  (['name', 'gym', 'grade', 'age', 'height', 'weight', 'record', 'comment', 'musicUrl'] as const).every((key) => !f[key].trim());

/* ───────── クラス（Aクラス・Bクラスなど）。個人情報ではない。無いときは、項目ごと無い（古い形のまま） ───────── */

const classKeyOf = (name: string): string => classNameKey(name);

/** 同じクラス名か（全角・半角、大文字・小文字、前後の空白のちがいは同じ） */
export const sameClassName = (a: string, b: string): boolean => classKeyOf(a) === classKeyOf(b);

/** 名簿に出てくるクラスの名前（空は除く。全角・半角ちがいは同じ名前。出てきた順） */
export function knownClasses(fighters: LocalFighter[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const fighter of fighters) {
    const name = (fighter.fighterClass ?? '').trim();
    if (!name || seen.has(classKeyOf(name))) continue;
    seen.add(classKeyOf(name));
    names.push(name);
  }
  return names;
}

/**
 * 「1人ずつ入れる」「直す」で選べるクラス。名簿にクラスが無く、「クラスも入れる」も押していないときは、空（欄を出さない）。
 * 名簿のクラスが初期の2つ（Aクラス・Bクラス）だけなら、2つとも選べる。シートで別の名前にしているときは、名簿に出ている名前だけ。
 * （受付で決めたクラス設定を持っているときは、画面側が、その2つの名前を先に使う：classNamesOf）
 */
export function classChoices(fighters: LocalFighter[], optIn: boolean): string[] {
  const names = knownClasses(fighters);
  const { upper, lower } = DEFAULT_CLASS_SETTINGS;
  if (names.length === 0) return optIn ? [upper.name, lower.name] : [];
  return names.some((name) => normalizeClass(name, DEFAULT_CLASS_SETTINGS) !== '') ? [upper.name, lower.name] : names;
}

/** 受付のクラス設定の2つの名前（設定が無いときは null）。シートで名前を変えていても、2つとも選べるようにするため */
export const classNamesOf = (settings: ClassSettings | undefined): string[] | null => settings && settings.enabled ? [settings.upper.name, settings.lower.name] : null;

/** この大会で使うクラス設定（受付で決めた設定。無くて、名簿が初期の名前だけなら初期の設定。それ以外は null＝条件の文は出さない） */
export function effectiveClassSettings(saved: ClassSettings | undefined, fighters: LocalFighter[], optIn: boolean): ClassSettings | null {
  if (saved && saved.enabled) return saved;
  const names = knownClasses(fighters);
  if (names.length === 0) return optIn ? DEFAULT_CLASS_SETTINGS : null;
  // Aクラス・Bクラスと読める名前が1つでもあれば、初期の設定を使う（そのとき「S」など ほかの名前は、「決めたクラスにない名前」として黄色で知らせる）。
  // 全部が別の名前（シニア・ジュニアなど）で、受付の設定も無いときは、決められないので null
  return names.some((name) => normalizeClass(name, DEFAULT_CLASS_SETTINGS) !== '') ? DEFAULT_CLASS_SETTINGS : null;
}

/** クラスの文字を整える（制御文字を取り、前後の空白を取り、40文字まで）。空なら項目ごと無くす */
export function tidyClass(fighter: LocalFighter): LocalFighter {
  const label = cleanClassLabel(fighter.fighterClass ?? '');
  const next: LocalFighter = { ...fighter };
  delete next.fighterClass;
  if (label) next.fighterClass = label;
  return next;
}

/** クラスが変わったか（「なし」と空の文字は同じ） */
export const classChanged = (a: LocalFighter, b: LocalFighter): boolean => (a.fighterClass ?? '').trim() !== (b.fighterClass ?? '').trim();

/** 「クラス （空） → Aクラス」のような、直した所の短い言い方（変わっていなければ空） */
export function describeClassChange(before: LocalFighter, after: LocalFighter): string {
  if (!classChanged(before, after)) return '';
  return 'クラス ' + ((before.fighterClass ?? '').trim() || '（空）') + ' → ' + ((after.fighterClass ?? '').trim() || '（空）');
}

/* ───────── 区分・階級（階級分けをする大会だけ）。個人情報ではない。無いときは、項目ごと無い（今までの形のまま） ───────── */

/** 同じ区分・階級の文字か（全角・半角、大文字・小文字、空白のちがいは同じ） */
export const sameWeightText = (a: string, b: string): boolean => divisionKey(a) === divisionKey(b);

/** 区分・階級の文字を整える（制御文字を取り、前後の空白を取り、40文字まで）。空なら項目ごと無くす */
export function tidyWeight(fighter: LocalFighter): LocalFighter {
  const next: LocalFighter = { ...fighter };
  delete next.division;
  delete next.weightClass;
  const division = cleanDivisionName(fighter.division ?? '').slice(0, WEIGHT_LIMITS.label), weightClass = cleanWeightText(fighter.weightClass ?? '');
  if (division) next.division = division;
  if (weightClass) next.weightClass = weightClass;
  return next;
}

/** 区分か階級が変わったか（空の文字と、項目が無いのは同じ） */
export const weightChanged = (a: LocalFighter, b: LocalFighter): boolean => (a.division ?? '').trim() !== (b.division ?? '').trim() || (a.weightClass ?? '').trim() !== (b.weightClass ?? '').trim();

/** 「区分 （空） → 中学生男子、階級 （空） → 37kg以下」のような、直した所の短い言い方（変わっていなければ空） */
export function describeWeightChange(before: LocalFighter, after: LocalFighter): string {
  const parts: string[] = [];
  for (const [key, label] of [['division', '区分'], ['weightClass', '階級']] as const) {
    const from = (before[key] ?? '').trim(), to = (after[key] ?? '').trim();
    if (from !== to) parts.push(label + ' ' + (from || '（空）') + ' → ' + (to || '（空）'));
  }
  return parts.join('、');
}

/** 区分か階級が入っている人か */
export const hasWeightTag = (fighter: LocalFighter): boolean => (fighter.division ?? '').trim() !== '' || (fighter.weightClass ?? '').trim() !== '';

/**
 * 区分・階級の入れかたで、気をつけたいこと（無ければ null）。保存は止めない。設定（受付の「階級分け」）が無いときは、いつも null。
 * blank-all＝どちらも空 / blank-division＝階級だけ入っている / blank-class＝階級を選ぶ区分なのに階級が空 /
 * unknown-division＝設定にない区分 / unknown-class＝その区分の階級にない / extra-class＝階級のない区分（小学生以下など）なのに階級が入っている
 */
export type WeightIssueKind = 'blank-all' | 'blank-division' | 'blank-class' | 'unknown-division' | 'unknown-class' | 'extra-class';
export function weightIssue(fighter: Pick<LocalFighter, 'division' | 'weightClass'> | undefined, settings: WeightSettings | null | undefined): WeightIssueKind | null {
  if (!settings || !settings.enabled) return null;
  const division = cleanDivisionName(fighter?.division ?? ''), weightClass = cleanWeightText(fighter?.weightClass ?? '');
  if (!division && !weightClass) return 'blank-all';
  if (!division) return 'blank-division';
  const found = findDivision(division, settings);
  if (!found) return 'unknown-division';
  if (!found.classes.length) return weightClass ? 'extra-class' : null;
  if (!weightClass) return 'blank-class';
  return normalizeWeightClass(found.name, weightClass, settings) ? null : 'unknown-class';
}

/** weightIssue のやさしい一文（黄色の箱に入れる。入れなくても保存できる） */
export function weightIssueText(kind: WeightIssueKind, fighter: Pick<LocalFighter, 'division' | 'weightClass'> | undefined): string {
  const division = cleanDivisionName(fighter?.division ?? '').slice(0, 12), weightClass = cleanWeightText(fighter?.weightClass ?? '').slice(0, 12);
  switch (kind) {
    case 'blank-all': return '区分・階級が入っていません。なくても保存できますが、区分・階級がちがう組かどうか、確かめられません。';
    case 'blank-division': return '区分が入っていません。なくても保存できますが、区分がちがう組かどうか、確かめられません。';
    case 'blank-class': return '階級が入っていません。なくても保存できますが、階級がちがう組かどうか、確かめられません。';
    case 'unknown-division': return '区分「' + division + '」は、設定にある区分ではありません。このままでも保存できます。';
    case 'unknown-class': return '階級「' + weightClass + '」は、この区分の階級にありません。このままでも保存できます。';
    default: return 'この区分には階級がありません。入っている階級「' + weightClass + '」は、「えらばない」にすると消えます。';
  }
}

/** 階級分けをする大会で、区分・階級が入っていない人（blank）と、設定にない人（unknown）。設定が無い大会は、いつも空。名前の無い行は数えない */
export function weightChoiceTrouble(fighters: LocalFighter[], settings: WeightSettings | null | undefined): { blank: LocalFighter[]; unknown: LocalFighter[] } {
  if (!settings || !settings.enabled) return { blank: [], unknown: [] };
  const blank: LocalFighter[] = [], unknown: LocalFighter[] = [];
  for (const fighter of fighters) {
    if (!fighter.name.trim()) continue;
    const kind = weightIssue(fighter, settings);
    if (kind === 'blank-all' || kind === 'blank-division' || kind === 'blank-class') blank.push(fighter);
    else if (kind) unknown.push(fighter);
  }
  return { blank, unknown };
}

/** 赤と青で区分か階級がちがう試合か（どちらかが空なら、ちがうと言わない。core の boutWeightWarning と同じ決め方） */
export const weightMixAt = (bout: LocalBout, byId: Map<string, LocalFighter>): boolean => boutWeightWarning(byId.get(bout.redId), byId.get(bout.blueId)) !== '';

/** 区分・階級がちがう試合の番号（0から）。止めない注意なので、数えて知らせるだけ */
export function weightMixIndexes(bouts: LocalBout[], fighters: LocalFighter[]): number[] {
  const byId = new Map(fighters.map((fighter) => [fighter.id, fighter]));
  const found: number[] = [];
  bouts.forEach((bout, index) => { if (weightMixAt(bout, byId)) found.push(index); });
  return found;
}

/** 「区分・階級がちがう組が2つあります（第1・第3試合）。…」。おすすめの組み合わせのあとの、赤い注意の文 */
export function weightMixText(indexes: number[]): string {
  return '区分・階級がちがう組が' + indexes.length + 'つあります（' + indexes.map((i) => '第' + (i + 1)).join('・') + '試合）。ふつうは同じ区分・階級の人どうしで組みます。';
}

/** ファイルを読み込んだあとの知らせ：区分・階級の列が無いファイルでは、今の区分・階級はそのまま。今の名簿に入っていない列のことは言わない */
export function weightColumnNote(current: LocalFighter[], hasDivisionColumn: boolean, hasWeightClassColumn: boolean): string {
  const lost = [
    !hasDivisionColumn && current.some((fighter) => (fighter.division ?? '').trim()) ? '区分' : '',
    !hasWeightClassColumn && current.some((fighter) => (fighter.weightClass ?? '').trim()) ? '階級' : '',
  ].filter(Boolean).join('・');
  return lost ? 'このファイルには' + lost + 'の列が無いので、今の' + lost + 'はそのままです。' : '';
}

/**
 * 公開した申込ページ（シート）の設定と、いまの大会の設定が同じか。クラス・階級分け・ロゴまで見る。
 * 項目の並びはそろえて比べる（保存したときと、リンクから読んだときで、並びがちがっても同じと見る）。
 */
export function entryConfigKey(config: EntryFormConfig | undefined): string {
  const c = config ?? DEFAULT_ENTRY_CONFIG;
  return JSON.stringify({ music: c.music, grade: c.grade, age: c.age, comment: c.comment, classes: config?.classes ?? null, weights: config?.weights ? weightSettingsToParam(config.weights) : null, logo: !!config?.logo });
}
export const sameEntryConfig = (a: EntryFormConfig | undefined, b: EntryFormConfig | undefined): boolean => entryConfigKey(a) === entryConfigKey(b);

/* ───────── ファイルから取り込んだ人の整え（手で入れるときと同じ約束：全角の数字・単位・入場曲の空白を直す） ───────── */

export type ImportNormalized = {
  fighters: LocalFighter[];
  /** 自動で直した欄の数 */
  fixed: number;
  /** 直した人の数 */
  fixedPeople: number;
  /** 直した例（「体重 ６５kg → 65」） */
  examples: string[];
  /** 直せなかった欄（読めない数字・使えない入場曲のリンク）。そのままにして、赤で知らせる */
  unreadable: Array<{ id: string; name: string; field: FieldKey; from: string }>;
};

export function normalizeImported(fighters: LocalFighter[], classes?: ClassSettings, weights?: WeightSettings): ImportNormalized {
  let fixed = 0;
  const people = new Set<string>();
  const examples: string[] = [];
  const unreadable: ImportNormalized['unreadable'] = [];
  const out = fighters.map((fighter) => {
    const next: LocalFighter = { ...fighter };
    const note = (key: FieldKey, from: string, to: string) => { fixed++; people.add(fighter.id); if (examples.length < 3) examples.push(FIELD_LABEL[key] + ' ' + from.slice(0, 16) + ' → ' + (to || '（空）')); };
    for (const key of ['height', 'weight', 'age'] as const) {
      const raw = fighter[key];
      if (!raw.trim()) continue;
      const done = checkNumber(key, raw);
      if (done.problem) { unreadable.push({ id: fighter.id, name: fighter.name, field: key, from: raw.trim().slice(0, 20) }); continue; }
      if (done.fixed && done.value !== '' && done.value !== raw) { next[key] = done.value; note(key, raw.trim(), done.value); }
    }
    if (fighter.musicUrl.trim()) {
      const music = checkMusic(fighter.musicUrl);
      if (music.problem) unreadable.push({ id: fighter.id, name: fighter.name, field: 'musicUrl', from: fighter.musicUrl.trim().slice(0, 20) });
      else if (music.value !== fighter.musicUrl) { next.musicUrl = music.value; if (music.fixed) note('musicUrl', fighter.musicUrl.trim().slice(0, 12) + '…', '空白を取りました'); }
    }
    const cls = (fighter.fighterClass ?? '').trim();
    if (cls) {
      const tidy2 = normalizeClassLoose(cls, classes ?? DEFAULT_CLASS_SETTINGS);
      if (tidy2 !== fighter.fighterClass) { next.fighterClass = tidy2; fixed++; people.add(fighter.id); if (examples.length < 3) examples.push('クラス ' + cls.slice(0, 12) + ' → ' + tidy2.slice(0, 12)); }
    }
    // 区分・階級：設定（受付の「階級分け」）の名前にそろえる（書き方のちがい：-37／37kg以下／37kg級、「・」の有る無し）。設定にない名前は、そのまま持つ（消さない）。40文字まで
    const division = (fighter.division ?? '').trim(), weightClass = (fighter.weightClass ?? '').trim();
    if (division || weightClass) {
      const nextDivision = division ? normalizeDivisionLoose(division, weights).slice(0, WEIGHT_LIMITS.label) : '';
      const nextClass = weightClass ? normalizeWeightClassLoose(nextDivision || division, weightClass, weights) : '';
      const change = (key: 'division' | 'weightClass', label: string, from: string, to: string) => {
        if (to === (fighter[key] ?? '')) return;
        if (to) next[key] = to; else delete next[key];
        fixed++; people.add(fighter.id);
        if (examples.length < 3) examples.push(label + ' ' + from.slice(0, 12) + ' → ' + (to.slice(0, 12) || '（空）'));
      };
      if (division) change('division', '区分', division, nextDivision);
      if (weightClass) change('weightClass', '階級', weightClass, nextClass);
    }
    return next;
  });
  return { fighters: out, fixed, fixedPeople: people.size, examples, unreadable };
}

/* ───────── 消した試合を、順に戻す ───────── */

export type RemovedBout = { bout: LocalBout; index: number };

/** いちばん新しく消した試合を戻す。同じ番号の試合がもうあるときは、重ならないように捨てる */
export function restoreLastRemoved(bouts: LocalBout[], stack: RemovedBout[]): { bouts: LocalBout[]; stack: RemovedBout[]; restored: RemovedBout | null } {
  let rest = stack;
  while (rest.length) {
    const last = rest[rest.length - 1];
    rest = rest.slice(0, -1);
    if (bouts.some((bout) => bout.id === last.bout.id)) continue;
    const next = [...bouts];
    next.splice(Math.min(last.index, next.length), 0, last.bout);
    return { bouts: next, stack: rest, restored: last };
  }
  return { bouts, stack: rest, restored: null };
}

/* ───────── コピーのファイルから戻す ───────── */

export type RestoreErrorKind = 'format' | 'password' | 'content';

/** ファイルがコピーのファイルの形か（中身は読まない） */
export function looksLikeBackup(text: string): boolean {
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    return !!payload && payload.format === 'tournament-os-private-1' && ['salt', 'iv', 'data'].every((key) => typeof payload[key] === 'string');
  } catch { return false; }
}

export function classifyRestoreError(error: unknown): RestoreErrorKind {
  const name = error instanceof Error ? error.name : '';
  const text = error instanceof Error ? error.message : '';
  if (name === 'OperationError') return 'password';
  if (text.includes('バックアップではありません') || name === 'InvalidCharacterError') return 'format';
  return 'content';
}

/** 入力どおりで開けなければ、全角・前後の空白をそろえて1回だけやり直す（暗号の形式は変えない） */
export async function decryptWithRetry<T>(decrypt: (password: string) => Promise<T>, password: string): Promise<T> {
  try { return await decrypt(password); }
  catch (error) {
    const fixed = password.normalize('NFKC').trim();
    if (classifyRestoreError(error) !== 'password' || fixed === password || !fixed) throw error;
    return await decrypt(fixed);
  }
}

export const RESTORE_TEXT = {
  noPassword: '先に、パスワードを入れてください。',
  format: 'これはコピーのファイル（○○.tournament.enc）ではありません。別のファイルを選んでください。今のデータは変えていません。',
  password: '戻せませんでした。パスワードがちがいます。日本語入力が全角になっていないか、前後に空白がないか見て、もう一度入れてください。今のデータは変えていません。',
  content: '戻せませんでした。ファイルの中身が読めません。ファイルがこわれているかもしれません。今のデータは変えていません。',
  write: '戻せませんでした。いまのデータは変えていません。もう一度「コピーのファイルから戻す」を押して、同じファイルを選んでください。',
  cancel: 'やめました。何も変えていません。',
} as const;

/** 例: 10月3日 14:03 */
export const monthDayClock = (ms: number): string => { const d = new Date(ms); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };

function restoreParts(a: { restored: LocalTournament; current: LocalTournament; dirty: boolean; everSaved: boolean }) {
  const n = a.restored.fighters.length, m = a.restored.bouts.length, p = a.restored.fighters.filter((f) => f.photoDataUrl).length;
  const n2 = a.current.fighters.length, m2 = a.current.bouts.length;
  const warn: string[] = [];
  if (n2 > 0 && n === 0 && m === 0) warn.push('⚠ このコピーは空です。');
  if (n < n2) warn.push('⚠ 減ります：選手が' + n2 + '人から' + n + '人になります。');
  if (m < m2) warn.push('⚠ 減ります：試合が' + m2 + 'つから' + m + 'つになります。');
  // クラス（この大会でいちばん大事な情報）が、数のくらべには出ない。消えるなら、はっきり言う
  const c2 = a.current.fighters.filter((f) => (f.fighterClass ?? '').trim() !== '').length, c = a.restored.fighters.filter((f) => (f.fighterClass ?? '').trim() !== '').length;
  if (c < c2) warn.push('⚠ 減ります：クラスが入っている選手が' + c2 + '人から' + c + '人になります。');
  if (a.current.entryConfig?.classes && !a.restored.entryConfig?.classes) warn.push('⚠ 消えます：クラスの設定（条件とルール）。選手のクラスを選ぶ欄が出なくなります。');
  // 区分・階級も同じ。人数が減るなら、はっきり言う。階級分けの設定やロゴの設定が消えるときも言う
  const w2 = a.current.fighters.filter(hasWeightTag).length, w = a.restored.fighters.filter(hasWeightTag).length;
  if (w < w2) warn.push('⚠ 減ります：区分・階級が入っている選手が' + w2 + '人から' + w + '人になります。');
  // 欠場にした選手の印も、数のくらべには出ない。消えるなら、はっきり言う
  const restoredById = new Map(a.restored.fighters.map((f) => [f.id, f]));
  const x2 = a.current.fighters.filter((f) => f.absent === true).length, x = a.restored.fighters.filter((f) => f.absent === true).length;
  // 人数だけでなく、「いま欠場なのに、コピーでは欠場でない人」がいるかも見る（入れかわりを見のがさない）
  const lostAbsent = a.current.fighters.filter((f) => f.absent === true && restoredById.has(f.id) && restoredById.get(f.id)?.absent !== true).length;
  if (x < x2) warn.push('⚠ 減ります：欠場にしている選手が' + x2 + '人から' + x + '人になります。');
  else if (lostAbsent > 0) warn.push('⚠ 消えます：いま欠場にしている選手のうち、' + lostAbsent + '人の「欠場」の印が、コピーにはありません。')
  if (a.current.entryConfig?.weights && !a.restored.entryConfig?.weights) warn.push('⚠ 消えます：階級分けの設定（区分と階級の表）。選手の区分・階級を選ぶ欄が出なくなります。');
  if (a.current.entryConfig?.logo && !a.restored.entryConfig?.logo) warn.push('⚠ 消えます：ロゴの設定。申込ページと当日の画面に、ロゴが出なくなります。');
  const title = isTitleReal(a.restored.title) ? a.restored.title : '名前なし';
  const empty = n2 === 0 && m2 === 0 && !a.everSaved && !a.dirty;
  // 1行目は結論。「何が消えるか」を先に言う
  const verdict = empty ? 'コピーの内容を戻します（なくなるものはありません）。' : 'いまの内容は消えて、コピーの内容に入れかわります。';
  const counts = '選手' + n2 + '人→' + n + '人・試合' + m2 + 'つ→' + m + 'つ';
  const head = '『' + title + '』のコピー（選手' + n + '人・写真' + p + '枚・試合' + m + 'つ・' + monthDayClock(a.restored.updatedAt) + '）を戻します。';
  const body = empty
    ? '（いまの内容は空です）コピーの内容に入れかわりますが、なくなるものはありません。'
    : 'いまの内容（選手' + n2 + '人・試合' + m2 + 'つ' + (a.dirty ? '、まだ保存していない変更あり' : '') + '）は、保存ずみのものも消えます。';
  return { verdict, warn, counts, head, body };
}

export function restoreConfirmText(a: { restored: LocalTournament; current: LocalTournament; dirty: boolean; everSaved: boolean }): string {
  const { verdict, warn, counts, head, body } = restoreParts(a);
  return verdict + '\n' + (warn.length ? warn.join('\n') + '\n' : '') + 'こう変わります：' + counts + '\n' + head + '\n' + body + '\nよろしいですか？';
}

/** 画面の中の確認の箱に出す文。1行目＝結論と数。そのあとに注意・中身 */
export function restoreBoxText(a: { restored: LocalTournament; current: LocalTournament; dirty: boolean; everSaved: boolean }): BoxText {
  const { verdict, warn, counts, head, body } = restoreParts(a);
  return { verdict: verdict.replace(/。$/, '') + '：' + counts + '。', lines: [...warn, head, body] };
}

/** 「別の画面の内容を使う」前の確認の文（箱用）。いまの入力が消えることを先に言う */
export function useOtherBoxText(a: { mine: LocalTournament; latest: LocalTournament }): BoxText {
  const { mine, latest } = a;
  return {
    verdict: 'いまの入力は消えて、別の画面の内容になります：選手' + mine.fighters.length + '人→' + latest.fighters.length + '人・試合' + mine.bouts.length + 'つ→' + latest.bouts.length + 'つ。',
    lines: ['いまの入力：' + (isTitleReal(mine.title) ? mine.title : '名前なし') + '・選手' + mine.fighters.length + '人', '別の画面の内容：' + clockText(latest.updatedAt) + 'に保存・選手' + latest.fighters.length + '人'],
  };
}

/**
 * 「コピー作成ずみ」の印が、まだ今の内容と同じか。
 * snapshot＝このページを開いてから作ったコピーの中身。同じ（進み具合だけの違いは無視）なら新しい。
 * snapshot がない（ページを開き直した）ときは、コピーを作ったときの保存の時刻（savedFor）と、いまの保存の時刻で見る。
 */
export function backupIsFresh(a: { current: LocalTournament; snapshot: LocalTournament | null; dirty: boolean; savedFor: number }): boolean {
  if (a.snapshot) return a.current === a.snapshot || sameExceptProgress(a.current, a.snapshot);
  return !a.dirty && a.savedFor > 0 && a.current.updatedAt === a.savedFor;
}

/** コピーのファイルの名前。例: taikai-lq3k9x2a-20271003.tournament.enc（戻すときは名前を見ない） */
export function backupFileName(eventId: string, date: string): string {
  const digits = isCompleteDate(date) ? dateDigits(date) : '';
  return eventId + '-' + (/^\d{8}$/.test(digits) ? digits : 'nodate') + '.tournament.enc';
}

/* ───────── 「受付をつくる」画面から来る値（URLの # の中。決まった言葉だけ受け取る） ───────── */

const MODES: EntryFieldMode[] = ['off', 'optional', 'required'];

/** #m=on|off  #g/#a/#c=off|optional|required  #cs=クラス設定  #ws=階級分けの表  #logo=on。決まった言葉以外は無視。1つも使えなければ null */
export function entryConfigFromHash(hash: string): EntryFormConfig | null {
  const given = new URLSearchParams(hash.replace(/^#/, ''));
  const config: EntryFormConfig = { ...DEFAULT_ENTRY_CONFIG };
  let used = false;
  const music = given.get('m');
  if (music === 'on' || music === 'off') { config.music = music === 'on'; used = true; }
  for (const [param, key] of [['g', 'grade'], ['a', 'age'], ['c', 'comment']] as const) {
    const value = given.get(param) as EntryFieldMode | null;
    if (value && MODES.includes(value)) { config[key] = value; used = true; }
  }
  // cs=クラス設定（受付の画面が、シートの「設定」タブから読み取ったもの。形が正しいときだけ使う）
  const classes = classesFromParam(given.get('cs'));
  if (classes) { config.classes = classes; used = true; }
  // ws=階級分け（区分→階級）の表、logo=on ロゴを出す（どちらも、形が正しいときだけ使う。無い・読めないときは、項目ごと無い）
  const weights = weightsFromParam(given.get('ws'));
  if (weights) { config.weights = weights; used = true; }
  if (given.get('logo') === 'on') { config.logo = true; used = true; }
  return used ? config : null;
}

/** #from=<大会番号> の値。使える形のときだけ返す */
export function fromEventIdFromHash(hash: string): string {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('from') ?? '';
  return isValidEventId(value) ? value : '';
}


/* ───────────────────────── ここから下: 「次はここ（黄色）」と、わかりやすい言いかえ ───────────────────────── */

/** 例: 10月3日 01:15（時刻は2けた） */
export const monthDayClockPad = (ms: number): string => { const d = new Date(ms); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/** 大会の一覧に出す名前。名前なしは日時で見分ける（空で何も入れていない大会は「新しい（空）」） */
export function eventListName(a: { title: string; fighters: number; bouts: number; updatedAt: number }): string {
  if (isTitleReal(a.title)) return a.title;
  return a.fighters === 0 && a.bouts === 0 ? '新しい（空）' + monthDayClockPad(a.updatedAt) : '名前なし（作成 ' + monthDayClockPad(a.updatedAt) + '）';
}

/** コピーのファイルが、いまより何日前のものか（1日未満は空） */
export function oldCopyText(copyAt: number, now: number): string {
  const days = Math.floor((now - copyAt) / 86_400_000);
  return days >= 1 ? 'このコピーは' + days + '日前のものです' : '';
}

/** 保存の失敗の「理由」だけ（見出しの文は画面で付ける） */
export function saveReasonText(kind: SaveErrorKind): string {
  switch (kind) {
    case 'bad-id': return 'この画面のアドレスの大会番号が使えません。「新しい大会をつくる」から作り直します';
    case 'bad-data': return 'どこかの欄が長すぎます。選手の一覧の「長い…」の知らせを見てください';
    case 'quota': return 'パソコンの空きが足りません';
    case 'unavailable': return '保存場所が開けません';
    default: return 'くわしい理由はわかりません';
  }
}

/** 2回目以降の失敗の「理由」を、ごく短く（帯の高さをおさえるため） */
export function saveReasonShort(kind: SaveErrorKind): string {
  switch (kind) {
    case 'bad-id': return '大会番号が使えません';
    case 'bad-data': return 'どこかの欄が長すぎます';
    case 'quota': return 'パソコンの空きが足りません';
    case 'unavailable': return '保存場所が開けません';
    default: return '';
  }
}

/** 試合の問題を、1行の短い言い方にする（保存の結果の2行目用） */
export function shortProblem(problem: BoutProblem, index: number): string {
  const no = '第' + (index + 1) + '試合';
  switch (problem.side) {
    case 'red': return no + 'の赤コーナーが、まだ入っていません';
    case 'blue': return no + 'の青コーナーが、まだ入っていません';
    case 'both': return no + 'の赤コーナーと青コーナーが、まだ入っていません';
    case 'same': return no + 'で、同じ人が赤と青に入っています';
    default: return no + 'に、名簿にいない人がいます';
  }
}

/** 体重差の見張り: 5kg未満は何も出さない / 5kg以上10kg未満は注意 / 10kg以上は赤 */
export function gapLevel(gap: number | null): 'none' | 'caution' | 'danger' {
  if (gap === null || gap < 5) return 'none';
  return gap >= 10 ? 'danger' : 'caution';
}

/** 体重が読めない人（体重なし・読めない体重） */
export const weightMissing = (fighters: LocalFighter[]): LocalFighter[] => fighters.filter((fighter) => parseKg(fighter.weight) === null);

/** 欄ごとの文字数の上限（手で入れるときの検査 checkFighter と同じ。ここを超えても保存はできるが、5000文字を超えると保存がすべて失敗する） */
/** 試合カードの「ルール」「体重の区分」の文字数の上限。これを超える貼りつけは、保存がぜんぶ失敗する原因（保存の検査は1つの欄5000文字）になる */
export const BOUT_TEXT_MAX = 100;

export const TEXT_LIMITS = { name: 80, gym: 120, grade: 30, record: 300, comment: 500, musicUrl: 500 } as const;
export type LongField = keyof typeof TEXT_LIMITS;

/** 文字が長すぎる人（1人につき、最初の1つの欄だけ。直すと、次の欄が出る） */
export function tooLong(fighters: LocalFighter[]): Array<{ fighter: LocalFighter; field: LongField; max: number }> {
  const found: Array<{ fighter: LocalFighter; field: LongField; max: number }> = [];
  for (const fighter of fighters) {
    const field = (Object.keys(TEXT_LIMITS) as LongField[]).find((key) => String(fighter[key] ?? '').length > TEXT_LIMITS[key]);
    if (field) found.push({ fighter, field, max: TEXT_LIMITS[field] });
  }
  return found;
}

/**
 * 体重のどこが困るか。empty＝入っていない / unreadable＝数字として読めない（例：「六十五」）/ range＝数字だが、10〜250kg の外（例：5kg）/ null＝読める。
 * 画面の言葉を、この3つで分ける（「ない」と「読めない」と「範囲の外」を、同じ人に別々の言い方で言わない）。
 */
export type WeightTrouble = 'empty' | 'unreadable' | 'range' | null;
export function weightTrouble(value: string | undefined): WeightTrouble {
  const text = String(value ?? '').trim();
  if (!text) return 'empty';
  if (parseKg(text) !== null) return null;
  const n = Number(text.replace(/kg$/i, '').trim());
  return Number.isFinite(n) ? 'range' : 'unreadable';
}

/** 体重の困りごとを、人に言う文にする（先頭の ✕ は画面が付ける）。name は選手の名前 */
export function weightTroubleText(trouble: Exclude<WeightTrouble, null>, name: string, raw = ''): string {
  const shownRaw = raw.trim().slice(0, 10);
  if (trouble === 'empty') return '体重が入っていません：' + name;
  if (trouble === 'range') return '体重は10〜250kgで入れます：' + name + '（いま ' + shownRaw + '）';
  return '体重「' + shownRaw + '」が数字で読めません（例：65）：' + name;
}

/** 体重が入っているのに、数字として読めない人（例：「六十五」）。体重が空の人は含めない */
export const weightUnreadable = (fighters: LocalFighter[]): LocalFighter[] => fighters.filter((fighter) => fighter.weight.trim() !== '' && parseKg(fighter.weight) === null);

/** 身長と体重を入れかえて書いたように見える人（身長のほうが小さい。例：身長65・体重170）。子どもでも、cm の数のほうが kg より大きい */
export function heightWeightSwapped(fighter: LocalFighter): boolean {
  const h = Number(fighter.height.trim().replace(/cm$/i, '').trim());
  const w = parseKg(fighter.weight);
  return fighter.height.trim() !== '' && Number.isFinite(h) && h > 0 && w !== null && h < w && h <= 140;
}

/** 同じ名前＋同じジムの人が、もういるか（全角・半角と空白の差は無視する） */
export function sameFighterExists(list: LocalFighter[], candidate: LocalFighter): boolean {
  if (!candidate.name.trim()) return false;
  const key = sameKey(candidate);
  return list.some((fighter) => fighter.name.trim() && sameKey(fighter) === key);
}

/**
 * 「試合当日の画面を開く」が押せない本当の理由（押せるときは空）。「上の〇〇を見て」と、画面にない箱を指さない。
 * 順番：大会の名前 → 選手 → 試合 → 直すところ。problems＝「✕ 直すところ」の箱に並ぶ数（0なら、その箱は画面にない）
 */
export function openLockReason(a: { titleMissing: boolean; fighters: number; nonBlankBouts: number; problems: number; canOpen: boolean }): string {
  if (a.canOpen) return '';
  if (a.titleMissing) return 'まだ開けません：先に、大会の名前を入れます';
  if (a.fighters < 2) return 'まだ開けません：先に、選手を2人以上入れます';
  if (a.nonBlankBouts === 0) return 'まだ開けません：先に、「＋ 試合を追加」で試合を1つ作ります';
  if (a.problems > 0) return 'まだ開けません：上の「✕ 直すところ」を直します';
  return 'まだ開けません：データのどこかが正しくありません';
}

/**
 * クラスを使う大会で、クラスが入っていない人・決めたクラスにない名前の人。on＝クラスを使う大会か（受付でクラスを決めた、または名簿にクラスの人がいる）。
 * クラスを使わない大会は、いつも空。
 */
export function classTrouble(fighters: LocalFighter[], settings: ClassSettings | null | undefined, on: boolean): { blank: LocalFighter[]; unknown: LocalFighter[] } {
  if (!on) return { blank: [], unknown: [] };
  return {
    blank: fighters.filter((f) => f.name.trim() && classState(f, settings) === 'blank'),
    unknown: fighters.filter((f) => f.name.trim() && classState(f, settings) === 'unknown'),
  };
}

/**
 * Excelの表の1つのセルを、CSVに入れる文字にする。Excelは「3-1」「2-1」を日づけに変えてしまうので、日づけで来たセルは
 * 「月-日」の形に戻して知らせる（日づけの文字をそのまま名簿に入れない）。
 */
export function excelCellText(cell: unknown): { text: string; wasDate: boolean } {
  if (cell instanceof Date && Number.isFinite(cell.getTime())) return { text: (cell.getUTCMonth() + 1) + '-' + cell.getUTCDate(), wasDate: true };
  return { text: String(cell ?? ''), wasDate: false };
}

/** 取り込みエラーを「見出し」と「くわしい文」に分ける（くわしい文は importErrorText と同じ。末尾の「変えていません」だけ除く） */
export function importErrorParts(error: unknown, fileName: string, blockedHeaders: string[] = []): { head: string; detail: string; hint: string } {
  const full = importErrorText(error, blockedHeaders);
  const detail = full.replace(KEEP, '').trim();
  const kind = importProblemKind(error);
  const words = blockedWords(blockedHeaders);
  switch (kind) {
    case 'ext': return { head: 'これは名簿ではありません（' + fileName + '）', detail, hint: '' };
    case 'blocked': return { head: '個人情報の列があります：' + (words.length ? words.join('、') : '電話番号 など'), detail: 'この名簿には入れられません。その列を消して、もう一度選んでください。', hint: 'Googleシートの④で作ったZIPなら、この列は入りません' };
    case 'no-list': case 'no-sheet': return { head: 'これは名簿ではありません（' + fileName + '）', detail, hint: '' };
    case 'too-large': return { head: 'ZIPが大きすぎます（' + fileName + '）', detail, hint: '' };
    case 'quote': return { head: 'ファイルの「"」が閉じていません（' + fileName + '）', detail, hint: '' };
    case 'stale': return { head: 'この画面が古くなっています', detail, hint: '' };
    case 'too-many-files': return { head: 'ZIPの中のファイルが多すぎます（' + fileName + '）', detail, hint: '' };
    default: break;
  }
  if (!kind) return { head: '「' + fileName + '」はこわれているようです。別のファイルを選びます', detail, hint: '' };
  return { head: 'このファイルは使えません（' + fileName + '）', detail, hint: '' };
}

/* ───────── 「次はここ」を1つだけ決める ───────── */

/** 読み込みに失敗したファイルの種類（やり直しで選ぶファイルの言い方が変わる） */
export type ImportFileKind = 'zip' | 'xlsx' | 'csv';
export type Follow =
  | { kind: 'refile'; file?: ImportFileKind }
  | { kind: 'reload' }
  | { kind: 'photo'; id: string }
  /** n＝もう見た案の数（0〜）。黄色は、案を1つ見るごとに、次の案へ移る（3つ全部を見るまで、保存には進まない） */
  | { kind: 'review'; n?: number }
  | { kind: 'pw' };

export type MarkerWhere = 'none' | 'conflict' | 'chooser' | 'bar' | 'bar-copy' | 'title' | 'file' | 'add-bout' | 'bout' | 'photo' | 'review' | 'pw' | 'reload';
export type Marker = {
  where: MarkerWhere;
  /** 黄色のバッジの文（「👉 次はここ：」のあと） */
  label: string;
  /** 下の青いボタンの文。黄色が帯の外にあるときは「そこへ行く」ボタンになる（なければ nextAction の文） */
  barLabel?: string;
  index?: number;
  side?: 'red' | 'blue';
  id?: string;
};

export type MarkerInput = {
  conflict: boolean; asking: boolean; chooseFirst: boolean; follow: Follow | null;
  na: NextAction; saveState: SaveState;
  /** 赤も青も空の試合（いちばん上のもの）。なければ -1 */
  blankIndex: number;
  halfIndex: number; halfSide: 'red' | 'blue';
  /** 「直すところ」の最初の1つ（試合の赤か青）。なければ null */
  fix: { index: number; side: 'red' | 'blue' } | null;
  titleMissing: boolean;
  /** 保存失敗の知らせに「コピーのファイルを作る」ボタンが出ているか（出ていなければ、黄色は「もう一度保存」に置く） */
  copyButton?: boolean;
};

const sideWord = (side: 'red' | 'blue') => (side === 'red' ? '赤' : '青');

/** 読み込みに失敗したあとの、黄色の文。いま使ったファイルの種類に合わせる（Excelを使ったのに、ZIPを選べとは言わない） */
export function refileLabel(file?: ImportFileKind): string {
  return file === 'xlsx' ? '直したExcelのファイルをもう一度選ぶ' : file === 'csv' ? '直したCSVのファイルをもう一度選ぶ' : '「Tournament_OS_（英数字）.zip」をもう一度選ぶ';
}

/**
 * 画面に黄色の「👉 次はここ」を出す場所を、1つだけ決める（バッジ・上のナビ・下の帯が、この1つを見る）。
 * 優先: ぶつかり > 確認の箱が開いている（黄色なし） > 続きから開く大会を選ぶ > 直後のつづき（follow）> nextAction
 */
export function pickMarker(a: MarkerInput): Marker {
  if (a.conflict) return { where: 'conflict', label: 'どちらを使うか、この箱で選ぶ' };
  if (a.asking) return { where: 'none', label: '' };
  if (a.chooseFirst) return { where: 'chooser', label: '続きから開く大会を選ぶ', barLabel: '続きから開く大会を選ぶ' };
  if (a.follow?.kind === 'pw') return { where: 'pw', label: 'パスワード欄を直して、もう一度ファイルを選ぶ' };
  if (a.follow?.kind === 'reload') return { where: 'reload', label: '「開き直す」を押す', barLabel: '開き直す' };
  if (a.follow?.kind === 'refile') return { where: 'file', label: refileLabel(a.follow.file), barLabel: 'ファイルを選び直す' };
  if (a.follow?.kind === 'photo') return { where: 'photo', id: a.follow.id, label: '写真を選ぶ（あとででもOK）', barLabel: '写真を選ぶ' };
  if (a.follow?.kind === 'review') { const n = a.follow.n ?? 0; return n > 0 ? { where: 'review', label: (n + 1) + 'つ目の案を見る', barLabel: (n + 1) + 'つ目の案を見る' } : { where: 'review', label: '案を1つずつ確かめる', barLabel: '案を1つずつ確かめる' }; }
  const { na } = a;
  if (na.kind === 'save' && a.saveState === 'failed') return a.copyButton === false ? { where: 'bar', label: 'もう一度 保存' } : { where: 'bar-copy', label: 'コピーのファイルを作る' };
  if (na.kind === 'save' && a.saveState === 'saving') return { where: 'bar', label: '保存が終わるまで待つ' };
  // 空の試合カード（赤も青も空）が画面で待っているときは、保存や「開く」より先に、その赤コーナーを選ぶ（黄色はいつも1つ）
  if (a.blankIndex >= 0 && (na.key === 'bouts' || na.key === 'save' || na.key === 'fix' || na.key === 'open')) {
    return { where: 'bout', index: a.blankIndex, side: 'red', label: '第' + (a.blankIndex + 1) + '試合の赤コーナーを選ぶ', barLabel: '赤コーナーを選ぶ' };
  }
  switch (na.key) {
    case 'title': return { where: 'title', label: 'ここに大会の名前を入れる' };
    case 'fighters': return { where: 'file', label: 'ここにZIPを選ぶ（ファイル名の例：Tournament_OS_tos-1234567890.zip）' };
    case 'fighters2': return { where: 'file', label: 'ここで選手をもう1人入れる' };
    case 'bouts':
      return a.blankIndex >= 0
        ? { where: 'bout', index: a.blankIndex, side: 'red', label: '第' + (a.blankIndex + 1) + '試合の赤コーナーを選ぶ', barLabel: '赤コーナーを選ぶ' }
        : { where: 'add-bout', label: '試合を1つ作る' };
    case 'half': return { where: 'bout', index: a.halfIndex, side: a.halfSide, label: '第' + (a.halfIndex + 1) + '試合の' + sideWord(a.halfSide) + 'コーナーを選ぶ' };
    case 'save': return { where: 'bar', label: '保存' };
    case 'fix':
      if (a.fix) return { where: 'bout', index: a.fix.index, side: a.fix.side, label: '第' + (a.fix.index + 1) + '試合の' + sideWord(a.fix.side) + 'コーナーを選び直す', barLabel: '直すところへ行く' };
      return a.titleMissing ? { where: 'title', label: 'ここに大会の名前を入れる' } : { where: 'bar', label: '直すところを見る' };
    case 'open': return { where: 'bar', label: '試合当日の画面を開く' };
    // 開いたあと：黄色は消さない。当日は、開いた画面で試合を進める（ここで もう一度押すと、もう1つ開く）
    case 'done': return { where: 'bar', label: '当日は、開いた画面で試合を進める' };
    default: return { where: 'none', label: '' };
  }
}
