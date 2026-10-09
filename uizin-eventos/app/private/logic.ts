// 準備の画面（/private/）だけで使う、画面に依存しない小さな計算。
// 通信・保存・乱数・日時の読み取りはしません（画面側が担当します）。
import { contractWeight, type LocalBout, type LocalFighter, type LocalTournament } from '../../core/privateTournament.ts';
import { dateDigits, isCompleteDate } from '../../core/dateInput.ts';
import { DEFAULT_ENTRY_CONFIG, type EntryFieldMode, type EntryFormConfig } from '../../core/entryPackage.ts';
import { isValidEventId } from './eventId.ts';

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
  return { ...value, bouts, currentBout: Math.min(value.currentBout, Math.max(0, bouts.length - 1)) };
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
  kind: 'no-list' | 'no-sheet' | 'blocked' | 'dup' | 'too-large' | 'too-many' | 'empty' | 'ext' | 'encoding';
  constructor(kind: ImportProblem['kind']) { super(kind); this.name = 'ImportProblem'; this.kind = kind; }
}

const KEEP = '今の名簿は変えていません。';

/** 読めない列の一覧。他の語に含まれる語（電話 と 電話番号）は除き、1回ずつ並べる */
export function blockedWords(words: string[]): string[] {
  const unique = [...new Set(words)];
  return unique.filter((word) => !unique.some((other) => other !== word && other.includes(word)));
}

export function importErrorText(error: unknown, blockedHeaders: string[] = []): string {
  const text = error instanceof Error ? error.message : '';
  const kind = error instanceof ImportProblem ? error.kind
    : text.includes('同じ管理番号') ? 'dup'
    : text.includes('3000人') ? 'too-many'
    : text.includes('大きすぎ') || text.includes('多すぎ') ? 'too-large' : '';
  switch (kind) {
    case 'no-list': return 'このファイルには選手の一覧が入っていません。シートのメニュー「Tournament OS」→「④ OS用の名簿ZIPを作る」で作ったファイルを選んでください。' + KEEP;
    case 'no-sheet': return 'このExcelには「選手入力」というシートがありません。「選手入力シートを保存する」で保存したExcelに、選手を書いてから選んでください。' + KEEP;
    case 'blocked': { const words = blockedWords(blockedHeaders); return 'このファイルには、読み込めない情報（' + (words.length ? words.join('、') : '電話番号 など') + '）が入っています。その部分を消して、もう一度選んでください。' + KEEP; }
    case 'dup': return '同じ選手が2回入っています。Excelで重なっている行を1つ消して、もう一度選んでください。' + KEEP;
    case 'too-large': return 'ファイルが大きすぎます。' + KEEP;
    case 'too-many': return '選手が多すぎます（3000人までです）。' + KEEP;
    case 'empty': return 'このファイルから選手を1人も読み取れませんでした。1行目の見出しと、選手の名前を確かめてください。' + KEEP;
    case 'ext': return 'ZIPかExcel（.xlsx）か、CSVを選んでください。' + KEEP;
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
    default: return '試合当日の画面を開く';
  }
}

/**
 * 「次にやること」を1つだけ決める（下の帯の塗りボタンも、上のバナーも、ここだけを見る）。
 * 優先: 別の画面との食いちがい > 保存中・保存失敗 > 次の入力 > （入力が終わったら）保存 > 直す > 開く
 * 「まだ入力が残っている」ときは入力を先にし、保存は小さなボタンで別に出す（画面側）。
 */
export function nextAction(s: NextActionState & { halfSide?: 'red' | 'blue' }): NextAction {
  if (s.conflict) return { kind: 'conflict', key: 'save', label: '黄色い案内を見る' };
  if (s.saveState === 'saving') return { kind: 'save', key: 'save', label: '保存中…' };
  if (s.saveState === 'failed') return { kind: 'save', key: 'save', label: 'もう一度 保存する' };
  const key = nextActionKey(s);
  return { kind: KEY_KIND[key], key, label: nextLabel(key, s.halfIndex, s.halfSide) };
}

/* ───────── 保存の4つの状態（状態ラインはここだけが決める） ───────── */

export type SaveLine = { tone: 'ok' | 'warn' | 'bad' | 'neutral'; text: string; short: string };

/** pending: 「この選手を追加」を押す前の入力・直している途中の入力がある（保存の対象には、まだ入っていない） */
export function saveLine(s: { conflict: boolean; saveState: SaveState; dirty: boolean; everSaved: boolean; savedClock: string; pending?: boolean }): SaveLine {
  if (s.conflict) return { tone: 'bad', text: '! 保存できません：別の画面で内容が変わりました', short: '! 保存できません' };
  if (s.saveState === 'saving') return { tone: 'neutral', text: '⏳ 保存中…（そのままお待ちください）', short: '⏳ 保存中…' };
  if (s.saveState === 'failed') return { tone: 'bad', text: '! 保存失敗（入れた内容は画面に残っています）', short: '! 保存失敗' };
  if (s.dirty) return { tone: 'warn', text: '● 未保存（入れた内容は、まだ保存していません）', short: '● 未保存' };
  if (!s.everSaved) return { tone: 'warn', text: '● 未保存（まだ一度も保存していません）', short: '● 未保存' };
  if (s.pending) return { tone: 'warn', text: '● 未保存（選手の入力が、まだ追加されていません）', short: '● 未保存' };
  return { tone: 'ok', text: '✓ 保存済み ' + s.savedClock, short: '✓ 保存済み ' + s.savedClock };
}

/* ───────── 保存に失敗した理由を分ける ───────── */

export type SaveErrorKind = 'bad-id' | 'quota' | 'unavailable' | 'other';

export function classifySaveError(error: unknown, eventId = ''): SaveErrorKind {
  if (eventId && !isValidEventId(eventId)) return 'bad-id';
  const name = error instanceof Error || (typeof DOMException !== 'undefined' && error instanceof DOMException) ? (error as Error).name : '';
  const text = error instanceof Error ? error.message : '';
  if (text.includes('保存するデータを確認してください')) return 'bad-id';
  if (name === 'QuotaExceededError' || /quota/i.test(text) || /空き容量/.test(text)) return 'quota';
  if (text.includes('保存場所を開けません') || text.includes('保存場所の更新') || name === 'InvalidStateError' || name === 'SecurityError' || name === 'NotFoundError') return 'unavailable';
  return 'other';
}

export function saveErrorText(kind: SaveErrorKind): string {
  switch (kind) {
    case 'bad-id': return 'この画面のアドレスの大会番号が使えません。「新しい大会をつくる」から作り直してください。入れた内容は画面に残っています。';
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
  /** merged が今の名簿と変わるか（変わらなければ、画面を「未保存」にしない） */
  changed: boolean;
  /** 管理番号はちがうが、名前とジムが前からいる人と同じ人（管理番号の空欄で行がずれたときに起こる）。既定では足さない */
  lookalike: LocalFighter[];
};

/** 名前とジムが同じかを見るための印（全角・半角と空白の差は無視する） */
const sameKey = (fighter: LocalFighter): string => fighter.name.normalize('NFKC').replace(/\s+/g, '') + '|' + fighter.gym.normalize('NFKC').replace(/\s+/g, '');

export function mergeKeepExisting(current: LocalFighter[], incoming: LocalFighter[]): MergeKeepResult {
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
  let same = 0, photosFilled = 0;
  const merged = current.map((fighter) => {
    const next = incomingById.get(fighter.id);
    if (!next) return fighter;
    const fields = FIGHTER_FIELDS.filter(([key]) => fighter[key] !== next[key]).map(([key, label]) => ({ label, from: String(fighter[key]), to: String(next[key]) }));
    if (next.photoDataUrl && fighter.photoDataUrl && next.photoDataUrl !== fighter.photoDataUrl) fields.push({ label: '写真', from: 'あり', to: '別の写真' });
    if (fields.length) differs.push({ name: fighter.name || '名前なし', fields }); else same++;
    if (!fighter.photoDataUrl && next.photoDataUrl) { photosFilled++; return { ...fighter, photoDataUrl: next.photoDataUrl }; }
    return fighter;
  });
  const all = merged.concat(added);
  const overwritten = current.map((fighter) => {
    const next = incomingById.get(fighter.id);
    return next ? { ...next, photoDataUrl: next.photoDataUrl || fighter.photoDataUrl } : fighter;
  }).concat(added);
  return { added: added.length, same, differs, merged: all, overwritten, photosFilled, changed: added.length > 0 || photosFilled > 0, lookalike };
}

/** 「ファイルの内容に書きかえる」前の確認の文の材料。1行目＝結論（何人が変わるか）、あとは例 */
function overwriteParts(differs: FighterDiff[]): { verdict: string; examples: string[] } {
  const show = differs.slice(0, 3).map((item) => {
    const first = item.fields.slice(0, 2).map((field) => field.label + ' ' + (field.from || '（空）') + '→' + (field.to || '（空）')).join('、');
    return item.name + ' ' + first + (item.fields.length > 2 ? ' ほか' : '');
  });
  return { verdict: '次の' + differs.length + '人を、ファイルの内容に書きかえます（手で直した所も戻ります）：', examples: show.concat(differs.length > 3 ? ['ほか' + (differs.length - 3) + '人'] : []) };
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
  if (n2 > 0 && n === 0 && m === 0) warn.push('！このコピーは空です。');
  if (n < n2) warn.push('！選手が' + n2 + '人から' + n + '人に減ります。');
  if (m < m2) warn.push('！試合が' + m2 + 'つから' + m + 'つに減ります。');
  const title = isTitleReal(a.restored.title) ? a.restored.title : '名前なし';
  const empty = n2 === 0 && m2 === 0 && !a.everSaved && !a.dirty;
  // 1行目は結論。「何が消えるか」を先に言う
  const verdict = empty ? 'コピーの内容を戻します（なくなるものはありません）。' : 'いまの内容が、コピーの内容に上書きされます。';
  const counts = '選手' + n2 + '人→' + n + '人・試合' + m2 + 'つ→' + m + 'つ';
  const head = '『' + title + '』のコピー（選手' + n + '人・写真' + p + '枚・試合' + m + 'つ・' + monthDayClock(a.restored.updatedAt) + '）を戻します。';
  const body = empty
    ? '（いまの内容は空です）上書きされますが、なくなるものはありません。'
    : 'いまの内容（選手' + n2 + '人・試合' + m2 + 'つ' + (a.dirty ? '、まだ保存していない変更あり' : '') + '）は、保存ずみのものも上書きされます。';
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

/** #m=on|off  #g/#a/#c=off|optional|required。決まった言葉以外は無視。1つも使えなければ null */
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
  return used ? config : null;
}

/** #from=<大会番号> の値。使える形のときだけ返す */
export function fromEventIdFromHash(hash: string): string {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('from') ?? '';
  return isValidEventId(value) ? value : '';
}
