/**
 * くわしい戦績の入力欄の「文字 → 決まりの形」の変換（画面の文字は、そのまま持つ）。画面の見た目は RecordDetailFields.tsx。
 * 決まりの確認と、送る形は core/recordDetail.ts。ここは、画面と試験の両方が使う、純粋な関数だけ。
 */

import { RECORD_DETAIL_LIMITS, RECORD_DETAIL_VERSION, recordDetailProblems, type KickRecord, type RecordDetail } from '../../core/recordDetail.ts';
import { stripInvisible } from '../../core/entryPackage.ts';

/**
 * 画面で聞くのは「試合数」と「勝ち」だけ（2026-10-24 owner：何戦何勝かだけ知りたい。引き分けなどは、いらない）。
 * 送る形（core/recordDetail.ts）は、これまでと同じ：負け＝試合数−勝ち（引き分け・勝敗なしも、ここに入る）、引き分け・勝敗なし＝0。
 * こうすると、中身の決まり・Googleの受付（.gs）の検査・表の列・名簿ZIPは、変えなくてよい。
 * 変えたのは、シートに書く戦績の一行の形だけ（「5戦3勝2敗」。Googleの受付は 3.20261024.2 から）。
 */
export type KickText = { games: string; win: string };
export type OtherText = { sport: string; games: string; win: string };
export type TitleText = { event: string; year: string; class: string; result: string };

export const EMPTY_KICK_TEXT: KickText = { games: '', win: '' };
export const emptyOtherText = (): OtherText => ({ sport: '', games: '', win: '' });
export const emptyTitleText = (): TitleText => ({ event: '', year: '', class: '', result: '' });

/** 画面の数字（全角も可）を数にする。数字でなければ NaN（決まりの確認で、直す所になる） */
export function countOf(text: string): number {
  const t = stripInvisible(String(text ?? '').normalize('NFKC')).replace(/[\s,]/g, '');
  return /^\d{1,4}$/.test(t) ? Number(t) : NaN;
}

const textOf = (value: string): string => stripInvisible(String(value ?? '')).replace(/^[\s　]+|[\s　]+$/g, '');

/** 負け＝試合数−勝ち（引き分け・勝敗なしも、ここに入る）。勝ちが数でない・試合数より多いときは NaN（決まりの確認が、その欄を直すように言う） */
const lossOf = (games: number, win: number): number => (Number.isInteger(games) && Number.isInteger(win) && win >= 0 && win <= games ? games - win : NaN);

/** 画面の文字から、決まりの形を作る（数字が読めないところは NaN のまま。決まりの確認が、その欄を直すように言う）。未経験（試合数0）のときは、勝ち・負けは 0。引き分け・勝敗なしは、いつも 0 */
export function detailFromText(kick: KickText, others: OtherText[], titles: TitleText[]): RecordDetail {
  const games = countOf(kick.games);
  const none = games === 0;
  const win = none ? 0 : countOf(kick.win);
  return {
    v: RECORD_DETAIL_VERSION,
    kick: { games, win, loss: none ? 0 : lossOf(games, win), draw: 0 },
    others: others.map((o) => {
      const g = countOf(o.games), w = countOf(o.win);
      return { sport: textOf(o.sport), games: g, win: w, loss: lossOf(g, w), draw: 0, noResult: 0 };
    }),
    titles: titles.map((t) => ({ event: textOf(t.event), year: countOf(t.year), class: textOf(t.class), result: textOf(t.result) })),
  };
}

/**
 * 直す所を、画面の欄（試合数・勝ち）の言い方で言う。決まりの確認（core/recordDetail.ts）の言葉のうち、
 * 「勝ち・負け・引き分け」と言うものは、画面には勝ちしかないので、「勝ち」だけの言い方に置きかえる（勝ちが数でない／試合数より多い）。
 * ほかの言葉（試合数・競技名・タイトルなど）は、決まりの確認のまま。
 */
export function recordProblems(kick: KickText, others: OtherText[], titles: TitleText[]): string[] {
  const detail = detailFromText(kick, others, titles);
  // 欄ごとに分けて確かめる（どの欄の言葉かを、そのまま保つため）。ほかの欄は、問題の出ない値に置く
  const calm = { games: 0, win: 0, loss: 0, draw: 0 };
  const kickAll = recordDetailProblems({ ...detail, others: [], titles: [] });
  const otherAll = recordDetailProblems({ ...detail, kick: calm, titles: [] });
  const titleAll = recordDetailProblems({ ...detail, kick: calm, others: [] });
  const out: string[] = [];
  const games = countOf(kick.games), win = countOf(kick.win);
  for (const text of kickAll) {
    if (/^キックボクシングの勝ち・負け・引き分け/.test(text)) {
      out.push(Number.isInteger(win) && win > games ? 'キックボクシングの勝ちが、試合数（' + games + '）より多くなっています。' : 'キックボクシングの勝ちを、数字で入れてください。');
    } else out.push(text);
  }
  // 他の格闘技：勝ちに関する言葉は、行ごとに作り直す（どの競技かを言うため）。ほかの言葉は、決まりの確認のまま
  for (const text of otherAll) if (!/勝ち・負け・引き分け/.test(text)) out.push(text);
  for (const o of others) {
    const g = countOf(o.games), w = countOf(o.win);
    if (!(g >= 1)) continue; // 試合数が先に直す所（決まりの確認が言う）
    const who = textOf(o.sport) ? '「' + textOf(o.sport) + '」' : '他の格闘技';
    if (!Number.isInteger(w)) out.push(who + 'の勝ちを、数字で入れてください。');
    else if (w > g) out.push(who + 'の勝ちが、試合数（' + g + '）より多くなっています。');
  }
  out.push(...titleAll);
  return out;
}

/** 決まりの形（キック）を、画面の文字に戻す（下書きを戻すとき）。初試合（試合数0）の勝ちは、空に戻す（ふつうに入れるときも、勝ちは空から始まる。「0」が入ったままだと、あとで試合数を変えたとき、勝ちを入れていないのに「入った」ことになる） */
export function kickTextOf(kick: KickRecord): KickText {
  return { games: String(kick.games), win: kick.games === 0 ? '' : String(kick.win) };
}

const anyText = (...values: string[]): boolean => values.some((value) => textOf(value) !== '');
// 上限は、決まりの確認と同じ core の RECORD_DETAIL_LIMITS を使う（ここに写しを持たない。写しがあると、片方だけ変えたときに答えがずれる）
const countIn = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= RECORD_DETAIL_LIMITS.games;

/**
 * 「入れたのに、まちがっている」欄があるか（黄色の札・直す所の言い方を「戦績を入れる」でなく「戦績を直す」にするため）。
 * まだ入れていない欄（空）や、入力の途中（試合数だけ入れて、勝ちはまだ、など）は、まちがいと言わない。
 * 入れた文字そのものが決まりに合わないとき（数字でない・試合数より多い勝ち・字数オーバー・4けたでない年）だけ true。
 */
export function recordIsWrong(kick: KickText, others: OtherText[], titles: TitleText[]): boolean {
  const g = countOf(kick.games), w = countOf(kick.win);
  if (anyText(kick.games) && !countIn(g)) return true;
  if (g > 0 && anyText(kick.win) && (!countIn(w) || w > g)) return true;
  for (const o of others) {
    const og = countOf(o.games), ow = countOf(o.win);
    if (textOf(o.sport).length > RECORD_DETAIL_LIMITS.sport) return true;
    if (anyText(o.games) && !(countIn(og) && og >= 1)) return true;
    if (anyText(o.win) && (!countIn(ow) || (og >= 1 && ow > og))) return true;
  }
  for (const t of titles) {
    const year = countOf(t.year);
    if (anyText(t.year) && !(Number.isInteger(year) && year >= RECORD_DETAIL_LIMITS.yearMin && year <= RECORD_DETAIL_LIMITS.yearMax)) return true;
    if (textOf(t.event).length > RECORD_DETAIL_LIMITS.event || textOf(t.class).length > RECORD_DETAIL_LIMITS.class || textOf(t.result).length > RECORD_DETAIL_LIMITS.result) return true;
  }
  return false;
}

/** 戦績の言い方「5戦3勝2敗」（2026-10-24 owner：確認の画面を ○戦○勝○敗 で出したい）。聞くのは試合数と勝ちだけなので、敗＝試合数−勝ち（引き分けも「敗」に入る） */
export function recordLine(games: number, win: number): string {
  return games + '戦' + win + '勝' + (games - win) + '敗';
}

/** 「敗」の意味（確認の画面に、小さく出す一言）。試合数と勝ちから決めた数なので、引き分けのある人が驚かないように言う */
export const RECORD_LOSS_NOTE = '「敗」は、試合数から勝ちを引いた数です（引き分けも入ります）。';

/** 送る前の確認に出す行（見出しと中身）。キック・他の格闘技・タイトルの順。キックと他の格闘技は「5戦3勝2敗」の形 */
export function recordReviewPairs(detail: RecordDetail): [string, string][] {
  const out: [string, string][] = [];
  const k = detail.kick;
  out.push(['キックボクシング', k.games === 0 ? '未経験（試合数 0）' : recordLine(k.games, k.win)]);
  for (const o of detail.others) out.push(['他の格闘技：' + o.sport, recordLine(o.games, o.win)]);
  for (const t of detail.titles) out.push(['タイトル・入賞：' + t.event, t.year + '年・' + t.class + '・' + t.result]);
  return out;
}
