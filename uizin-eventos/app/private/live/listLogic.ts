import { contractWeight, safeMusicUrl, type LocalBout, type LocalFighter, type LocalTournament } from '../../../core/privateTournament.ts';

/** 試合当日の画面の見かた。1試合ずつ（ふだん）か、一覧か。 */
export type LiveView = 'single' | 'list';

export const LIST_PAGE_SIZE = 10;

/** URL の ?view=list のときだけ一覧。それ以外はすべて「1試合ずつ」。 */
export function parseViewParam(search: string): LiveView {
  try {
    return new URLSearchParams(search).get('view') === 'list' ? 'list' : 'single';
  } catch {
    return 'single';
  }
}

/** 見かたを URL に書く。event など、ほかの値はそのまま残す。「1試合ずつ」は ?view を付けない（今までの URL のまま）。 */
export function withViewParam(search: string, view: LiveView): string {
  const params = new URLSearchParams(search);
  if (view === 'list') params.set('view', 'list');
  else params.delete('view');
  const text = params.toString();
  return text ? '?' + text : '';
}

/** ページ数。試合が 0 でも 1 ページ（空のページ）と数える。 */
export function pageCount(total: number, size = LIST_PAGE_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.ceil(total / size);
}

/** 0 始まりの試合番号が入っているページ（0 始まり）。範囲外は端のページに寄せる。 */
export function pageOfBout(boutIndex: number, total: number, size = LIST_PAGE_SIZE): number {
  const index = Number.isFinite(boutIndex) ? Math.max(0, Math.floor(boutIndex)) : 0;
  return clampPage(Math.floor(index / size), total, size);
}

export function clampPage(page: number, total: number, size = LIST_PAGE_SIZE): number {
  const last = pageCount(total, size) - 1;
  if (!Number.isFinite(page)) return 0;
  return Math.min(Math.max(0, Math.floor(page)), last);
}

/** そのページに出す試合の範囲 [start, end)。 */
export function pageRange(page: number, total: number, size = LIST_PAGE_SIZE): { start: number; end: number } {
  const safe = clampPage(page, total, size);
  const start = Math.min(safe * size, Math.max(0, total));
  return { start, end: Math.min(start + size, Math.max(0, total)) };
}

/** そのページの試合の範囲を言葉にする。「11〜20試合目」。1試合だけのときは「35試合目」。page は 0 始まり。 */
export function pageRangeText(page: number, total: number, size = LIST_PAGE_SIZE, unit = '試合目'): string {
  const { start, end } = pageRange(page, total, size);
  if (end <= start) return '試合なし';
  return end - start === 1 ? start + 1 + unit : start + 1 + '〜' + end + unit;
}

/** 「2 / 4 ページ（11〜20試合目）」。page は 0 始まり。 */
export function pageLabel(page: number, total: number, size = LIST_PAGE_SIZE, unit = '試合目'): string {
  const pages = pageCount(total, size);
  return clampPage(page, total, size) + 1 + ' / ' + pages + ' ページ（' + pageRangeText(page, total, size, unit) + '）';
}

/** ページ番号ボタンに書く文字。「11〜20」。1試合だけのページは「35」。 */
export function pageButtonText(page: number, total: number, size = LIST_PAGE_SIZE): string {
  const { start, end } = pageRange(page, total, size);
  if (end <= start) return String(page + 1);
  return end - start === 1 ? String(start + 1) : start + 1 + '〜' + end;
}

/** 見出しのそばに出す「全35試合・4ページ」 */
export function totalLabel(total: number, size = LIST_PAGE_SIZE): string {
  return '全' + Math.max(0, total) + '試合・' + pageCount(total, size) + 'ページ';
}

export type PagerState = { prevDisabled: boolean; nextDisabled: boolean; prevReason: string; nextReason: string };

/** 前・次のボタンが押せるか。押せないときは、理由を短い言葉で返す。 */
export function pagerState(page: number, total: number, size = LIST_PAGE_SIZE): PagerState {
  const pages = pageCount(total, size);
  const safe = clampPage(page, total, size);
  const prevDisabled = safe <= 0, nextDisabled = safe >= pages - 1;
  const only = pages <= 1;
  return {
    prevDisabled,
    nextDisabled,
    prevReason: prevDisabled ? (only ? 'ページは1つだけです' : 'いちばん最初のページです') : '',
    nextReason: nextDisabled ? (only ? 'ページは1つだけです' : 'いちばん最後のページです') : '',
  };
}

/**
 * ページ番号ボタン。3ページ以下は出さない（前・次だけで足りる）。
 * 9ページ以下は全部、それより多いときは最初・最後・今開いているページの前後・「今の試合のページ」だけ（間は 'gap'）。
 * 「今の試合のページ」は、ページをどれだけ移っても、必ず選べる。
 */
export function pageJumpList(pages: number, current: number, mustKeep?: number): Array<number | 'gap'> {
  if (pages <= 3) return [];
  const all = Array.from({ length: pages }, (_, i) => i);
  if (pages <= 9) return all;
  const keep = new Set([0, pages - 1, current - 2, current - 1, current, current + 1, current + 2, mustKeep ?? -1].filter((n) => n >= 0 && n < pages));
  const out: Array<number | 'gap'> = [];
  let previous = -1;
  for (const n of all) {
    if (!keep.has(n)) continue;
    if (previous >= 0 && n - previous > 1) out.push('gap');
    out.push(n);
    previous = n;
  }
  return out;
}

/** 入場曲の状態。off=この大会は入場曲なし / empty=選手がいない（何も出さない） */
export type MusicState = 'off' | 'empty' | 'link' | 'broken' | 'none';

export function musicState(fighter: LocalFighter | undefined, musicEnabled: boolean): MusicState {
  if (!musicEnabled) return 'off';
  if (!fighter) return 'empty';
  if (safeMusicUrl(fighter.musicUrl ?? '')) return 'link';
  return String(fighter.musicUrl ?? '').trim() ? 'broken' : 'none';
}

/**
 * 一覧に書く入場曲の言葉。いちばん目立たせたいのは「曲がない」こと（進行係がすぐ気づくため）。
 * link=静かな案内（押すと別のタブで開く） / none=琥珀の太い枠 / broken=もっと濃いだいだいの枠で、別の言葉
 */
export function musicLabel(state: MusicState): string {
  if (state === 'link') return '♪ 曲を開く';
  if (state === 'none') return '⚠ 入場曲なし（曲を用意）';
  if (state === 'broken') return '⚠ 曲のリンクを確認';
  return '';
}

/** 曲を開くリンクの横に小さく添える言葉（別のタブで開くことを、見える文字で伝える） */
export const MUSIC_NEW_TAB = '↗ 別のタブ';

export const MISSING_FIGHTER = '選手未選択';
export const NO_CONTRACT = '契約未入力';
export const NO_MUSIC_EVENT = 'この大会は入場曲なし';
export const NO_MUSIC_DONE = '入場曲はぜんぶそろっています';
export const EMPTY_LIST_MESSAGE = 'まだ対戦カードがありません。準備の画面で作ってください。';

export type CornerModel = {
  side: 'red' | 'blue';
  label: '赤コーナー' | '青コーナー';
  present: boolean;
  name: string;
  gym: string;
  photoDataUrl: string;
  music: MusicState;
  musicUrl: string;
};

export type RowModel = {
  index: number;
  title: string;
  isCurrent: boolean;
  contract: string;
  rule: string;
  red: CornerModel;
  blue: CornerModel;
  openLabel: string;
};

function corner(side: 'red' | 'blue', fighter: LocalFighter | undefined, musicEnabled: boolean): CornerModel {
  const state = musicState(fighter, musicEnabled);
  return {
    side,
    label: side === 'red' ? '赤コーナー' : '青コーナー',
    present: !!fighter,
    name: fighter ? fighter.name.trim() || '名前未入力' : MISSING_FIGHTER,
    gym: fighter?.gym.trim() ?? '',
    photoDataUrl: fighter?.photoDataUrl ?? '',
    music: state,
    musicUrl: state === 'link' && fighter ? safeMusicUrl(fighter.musicUrl) : '',
  };
}

/** 1つの試合を、画面の1行ぶんのデータにする。契約は1試合ずつの画面と同じ決め方。 */
export function buildRow(bout: LocalBout, index: number, byId: Map<string, LocalFighter>, musicEnabled: boolean, currentIndex: number): RowModel {
  const red = byId.get(bout.redId), blue = byId.get(bout.blueId);
  const r = corner('red', red, musicEnabled), b = corner('blue', blue, musicEnabled);
  const title = '第' + (index + 1) + '試合';
  return {
    index,
    title,
    isCurrent: index === currentIndex,
    contract: contractWeight(red, blue) || bout.className || NO_CONTRACT,
    rule: bout.rule.trim(),
    red: r,
    blue: b,
    openLabel: 'この試合を開く ' + title + ' 赤コーナー ' + r.name + ' 対 青コーナー ' + b.name,
  };
}

/** そのページの行だけを作る（100試合でも10行ぶんしか作らない）。indices を渡すと、その試合だけを並べる（絞りこみ）。 */
export function buildPageRows(data: Pick<LocalTournament, 'bouts' | 'fighters' | 'currentBout'>, page: number, musicEnabled: boolean, size = LIST_PAGE_SIZE, indices?: number[]): RowModel[] {
  const byId = new Map(data.fighters.map((f) => [f.id, f]));
  const count = indices ? indices.length : data.bouts.length;
  const { start, end } = pageRange(page, count, size);
  const picked = indices ? indices.slice(start, end) : Array.from({ length: end - start }, (_, i) => start + i);
  return picked.filter((i) => i >= 0 && i < data.bouts.length).map((i) => buildRow(data.bouts[i], i, byId, musicEnabled, data.currentBout));
}

export type MusicSummary = {
  /** 曲がまだの選手の数（曲なし＋リンク要確認。同じ選手は1人と数える） */
  fighters: number;
  /** そのうち、曲が空の人 */
  none: number;
  /** そのうち、リンクが使えない人 */
  broken: number;
  /** 曲がまだの選手が出る試合（0 始まり） */
  bouts: number[];
};

/** 「入場曲がまだの選手：5人」の数え方。試合に出ていない選手は数えない。 */
export function summarizeMusic(data: Pick<LocalTournament, 'bouts' | 'fighters'>, musicEnabled: boolean): MusicSummary {
  const out: MusicSummary = { fighters: 0, none: 0, broken: 0, bouts: [] };
  if (!musicEnabled) return out;
  const byId = new Map(data.fighters.map((f) => [f.id, f]));
  const seen = new Set<string>();
  data.bouts.forEach((bout, index) => {
    let missing = false;
    for (const id of [bout.redId, bout.blueId]) {
      const f = byId.get(id);
      const state = musicState(f, true);
      if (state !== 'none' && state !== 'broken') continue;
      missing = true;
      if (f && !seen.has(f.id)) { seen.add(f.id); out.fighters++; if (state === 'none') out.none++; else out.broken++; }
    }
    if (missing) out.bouts.push(index);
  });
  return out;
}

export type NowModel = { index: number; title: string; text: string; page: number };

/** 「いま：第8試合　架空赤008 対 架空青008」の材料。試合が 0 のときは null。 */
export function nowModel(data: Pick<LocalTournament, 'bouts' | 'fighters' | 'currentBout'>, size = LIST_PAGE_SIZE): NowModel | null {
  const total = data.bouts.length;
  const bout = data.bouts[data.currentBout];
  if (!bout) return null;
  const byId = new Map(data.fighters.map((f) => [f.id, f]));
  const name = (id: string) => { const f = byId.get(id); return f ? f.name.trim() || '名前未入力' : MISSING_FIGHTER; };
  const title = '第' + (data.currentBout + 1) + '試合';
  return { index: data.currentBout, title, text: title + '　' + name(bout.redId) + ' 対 ' + name(bout.blueId), page: pageOfBout(data.currentBout, total, size) };
}

/** 「第 __ 試合へ」の入力を、0 始まりの試合番号にする。全角の数字も受ける。使えない入力は null。 */
export function parseBoutNumber(input: string, total: number): number | null {
  const half = String(input ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[\s　]/g, '');
  const m = /^第?(\d{1,5})(?:試合)?$/.exec(half);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= total ? n - 1 : null;
}
