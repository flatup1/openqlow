// 準備の画面（/private/）だけで使う、画面に依存しない小さな計算。
// 通信・保存・乱数・日時の読み取りはしません（画面側が担当します）。
import { contractWeight, type LocalBout, type LocalFighter, type LocalTournament } from '../../core/privateTournament.ts';

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

export type NextKey = 'title' | 'date' | 'fighters' | 'fighters2' | 'bouts' | 'half' | 'save' | 'fix' | 'open' | 'done';
export type NextState = {
  titleReal: boolean; dateOk: boolean; fighters: number; nonBlankBouts: number;
  halfIndex: number; dirty: boolean; everSaved: boolean; problems: number; opened: boolean;
};

/** 「次にやること」を1つだけ決める。順番は上から */
export function nextActionKey(s: NextState): NextKey {
  if (!s.titleReal) return 'title';
  if (!s.dateOk) return 'date';
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
  kind: 'no-list' | 'no-sheet' | 'blocked' | 'dup' | 'too-large' | 'too-many' | 'empty';
  constructor(kind: ImportProblem['kind']) { super(kind); this.name = 'ImportProblem'; this.kind = kind; }
}

export function importErrorText(error: unknown, blockedHeaders: string[] = []): string {
  const text = error instanceof Error ? error.message : '';
  const kind = error instanceof ImportProblem ? error.kind
    : text.includes('同じ管理番号') ? 'dup'
    : text.includes('3000人') ? 'too-many'
    : text.includes('大きすぎ') || text.includes('多すぎ') ? 'too-large' : '';
  switch (kind) {
    case 'no-list': return 'このファイルには選手の一覧が入っていません。シートのメニュー「Tournament OS」→「④ OS用の名簿ZIPを作る」で作ったファイルを選んでください。';
    case 'no-sheet': return 'このExcelには「選手入力」というシートがありません。「選手入力シートを保存する」で保存したExcelに、選手を書いてから選んでください。';
    case 'blocked': return 'このファイルには、読み込めない情報（' + (blockedHeaders.length ? blockedHeaders.join('、') : '電話番号 など') + '）が入っています。その部分を消して、もう一度選んでください。';
    case 'dup': return '同じ選手が2回入っています。Excelで重なっている行を1つ消して、もう一度選んでください。今の名簿は変えていません。';
    case 'too-large': return 'ファイルが大きすぎます。今の名簿は変えていません。';
    case 'too-many': return '選手が多すぎます（3000人までです）。今の名簿は変えていません。';
    case 'empty': return 'このファイルから選手を1人も読み取れませんでした。1行目の見出しと、選手の名前を確かめてください。今の名簿は変えていません。';
    default: return 'このファイルは読み込めませんでした。申し込みのZIPファイルか、「選手入力シート」のExcelを選んでください。';
  }
}

/** 写真エラーを、次にやることつきの固定文に直す */
export function photoErrorText(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  if (text.includes('大きすぎ')) return '写真が大きすぎます。別の写真を選んでください。';
  return '写真が読み込めませんでした。別の写真を選ぶか、その場でカメラで撮ってください。';
}

/** 全角数字などをそろえる（身長・体重・年齢の打ち間違い対策。画面側だけの整形） */
export const tidy = (value: string): string => value.normalize('NFKC').trim();
