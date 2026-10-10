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
  /** 赤と青が同じ選手（まちがい）。選手が選ばれていない（空）ときは false */
  sameFighter: boolean;
  /** 体重もクラス名もなく「契約未入力」になる試合 */
  noContract: boolean;
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
  const contract = contractWeight(red, blue) || bout.className || NO_CONTRACT;
  return {
    index,
    title,
    isCurrent: index === currentIndex,
    contract,
    noContract: contract === NO_CONTRACT,
    sameFighter: !!bout.redId && bout.redId === bout.blueId,
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

/** 数字の欄に入れられたものを読みやすくする。全角→半角、空白（全角も）を取る */
function cleanNumberText(input: string): string {
  return String(input ?? '').normalize('NFKC').replace(/[\s\u3000]/g, '');
}

/** 数字のあとに付いていてもよい言葉（「12番」「12号」「12試合目」）と、終わりの「. , 、 。」 */
const BOUT_NUMBER = /^第?(\d+)(?:試合目|試合|番目|番|号目|号|目)?[.,、。]*$/;

/**
 * 「第 __ 試合へ」の入力を、0 始まりの試合番号にする。全角の数字・「12番」「12号」「12試合目」・終わりの「。」も受ける。
 * 小数（3.5）・マイナス・文字だけ・範囲の外は null。
 */
export function parseBoutNumber(input: string, total: number): number | null {
  const m = BOUT_NUMBER.exec(cleanNumberText(input));
  if (!m || m[1].length > 5) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= total ? n - 1 : null;
}

export type BoutNumberProblem = { kind: 'empty' | 'text' | 'zero' | 'big'; message: string };

/** 「行く」が受けられない入力の、原因別の短い言葉。受けられるなら null。どれも「何がまちがいか」と「どう直すか」 */
export function boutNumberProblem(input: string, total: number): BoutNumberProblem | null {
  if (parseBoutNumber(input, total) !== null) return null;
  const half = cleanNumberText(input);
  const range = '1から' + total + 'までの数字';
  if (!half) return { kind: 'empty', message: '数字が入っていません。' + range + 'を入れてください（例：12）。' };
  const m = BOUT_NUMBER.exec(half);
  if (!m) return { kind: 'text', message: '数字だけ入れてください（例：12）。' + range + 'を入れます。' };
  const n = Number(m[1]);
  if (n < 1) return { kind: 'zero', message: '0番の試合はありません。' + range + 'を入れてください。' };
  return { kind: 'big', message: 'この大会は' + total + '試合までです（入れた数字は' + (m[1].length > 5 ? '大きすぎる数' : n) + '）。' + range + 'を入れてください。' };
}

/** 一覧の「行く」が成功したときの、緑の1行。見るだけで、いまの試合は変わらないことまで書く */
export function jumpDoneText(index: number, page: number, currentBout: number): string {
  return '第' + (index + 1) + '試合のところへ来ました（' + (page + 1) + 'ページ目）。見るだけです。いまの試合は 第' + (currentBout + 1) + '試合 のままです。';
}

/** 1試合ずつの画面で「前の試合」「次の試合」「元にもどす」を押した向き。list = 一覧の行から開いた */
export type MoveVia = 'next' | 'prev' | 'list';

export type MoveNotice = { text: string; undoLabel: string };

/**
 * 試合を動かした直後に出す、黄色い「⚠ 気をつけて」の言葉と、元にもどす（または、すすむ）ボタンの名前。
 * before = 押す前の試合（0 始まり）、after = 動かしたあとの試合。ボタンの名前は「第7試合にもどす」の形。
 */
export function moveNotice(via: MoveVia, before: number, after: number): MoveNotice {
  const b = '第' + (before + 1) + '試合', a = '第' + (after + 1) + '試合';
  if (via === 'prev') return { text: a + 'にもどりました', undoLabel: b + 'にすすむ' };
  if (via === 'next') return { text: b + ' → ' + a + 'に進みました', undoLabel: b + 'にもどす' };
  return { text: a + 'に変えました。まちがえたら右のボタン →', undoLabel: b + 'にもどす' };
}

/** 元にもどす案内を、大きい箱で見せる秒数。そのあとは小さい灰の1行になる */
export const UNDO_BIG_SECONDS = 10;

/** 大きい箱に残っている秒数（0 なら小さい1行に変わる）。now と since は ms */
export function undoSecondsLeft(since: number, now: number, limit = UNDO_BIG_SECONDS): number {
  const passed = Math.floor(Math.max(0, now - since) / 1000);
  return Math.max(0, limit - passed);
}

/** 同じ向きのボタンが続けて押された（ダブルタップ）か。まちがって2つ進まないための印 */
export const REPEAT_PRESS_MS = 450;
export function isRepeatPress(last: { dir: string; at: number } | null, dir: string, now: number, gap = REPEAT_PRESS_MS): boolean {
  return !!last && last.dir === dir && now - last.at >= 0 && now - last.at < gap;
}

/** 保存できなかったときの赤い言葉。text=何があったか / more=いまの状態と、次に押すもの / tip=ありがちな原因と、やること。ぶつかったとき（別の画面で変わった）は page.tsx が別に作る */
export function saveFailNotice(via: MoveVia | 'undo', currentBout: number): { text: string; more: string; tip: string } {
  const here = '第' + (currentBout + 1) + '試合';
  const tip = '写真が多いと保存できないことがあります。ほかのタブを閉じて、もう一度押す。';
  if (via === 'list') return { text: '失敗：この行は開けませんでした。保存できなかったため、試合は進めていません。', more: 'まだ' + here + 'のままです。もう一度「この試合を開く」を押す。', tip };
  if (via === 'undo') return { text: '失敗：保存できなかったため、試合は戻せていません。', more: 'まだ' + here + 'のままです。もう一度、同じボタンを押す。', tip };
  return { text: '失敗：保存できなかったため、試合は進めていません。', more: 'まだ' + here + 'のままです。もう一度「' + (via === 'prev' ? '← 前の試合' : '次の試合 →') + '」を押す。', tip };
}

/** 絞り込み中の黄色い注意 */
export function filterNote(shown: number, total: number): string {
  return '一部の試合だけ表示中です（' + total + '試合中 ' + shown + '試合）。';
}

/** 一覧の行の「この試合を開く」の下に出す、押す前の言葉 */
export function openWarning(index: number): string {
  return '押すと、いまの試合が 第' + (index + 1) + '試合 に変わります';
}

/** 「次の試合 →」の下の灰字 */
export function nextHint(current: number, total: number): string {
  return current + 1 >= total ? '' : '次は 第' + (current + 2) + '試合';
}
