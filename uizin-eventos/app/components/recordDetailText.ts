/**
 * くわしい戦績の入力欄の「文字 → 決まりの形」の変換（画面の文字は、そのまま持つ）。画面の見た目は RecordDetailFields.tsx。
 * 決まりの確認と、送る形は core/recordDetail.ts。ここは、画面と試験の両方が使う、純粋な関数だけ。
 */

import { RECORD_DETAIL_VERSION, recordDetailProblems, type KickRecord, type RecordDetail } from '../../core/recordDetail.ts';
import { stripInvisible } from '../../core/entryPackage.ts';

/**
 * 画面で聞くのは「試合数」と「勝ち」だけ（2026-10-24 owner：何戦何勝かだけ知りたい。引き分けなどは、いらない）。
 * 送る形（core/recordDetail.ts）は、これまでと同じ：負け＝試合数−勝ち（引き分け・勝敗なしも、ここに入る）、引き分け・勝敗なし＝0。
 * 決まり・Googleの受付（.gs）・表の列・名簿ZIPを、1つも変えないための作りです。
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

/** 決まりの形（キック）を、画面の文字に戻す（下書きを戻すとき） */
export function kickTextOf(kick: KickRecord): KickText {
  return { games: String(kick.games), win: String(kick.win) };
}

/** 送る前の確認に出す行（見出しと中身）。キック・他の格闘技・タイトルの順 */
export function recordReviewPairs(detail: RecordDetail): [string, string][] {
  const out: [string, string][] = [];
  const k = detail.kick;
  out.push(['キックボクシング', k.games === 0 ? '未経験（試合数 0）' : '試合 ' + k.games + '・勝ち ' + k.win]);
  for (const o of detail.others) out.push(['他の格闘技：' + o.sport, '試合 ' + o.games + '・勝ち ' + o.win]);
  for (const t of detail.titles) out.push(['タイトル・入賞：' + t.event, t.year + '年・' + t.class + '・' + t.result]);
  return out;
}
