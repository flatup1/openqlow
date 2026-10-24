/**
 * くわしい戦績の入力欄の「文字 → 決まりの形」の変換（画面の文字は、そのまま持つ）。画面の見た目は RecordDetailFields.tsx。
 * 決まりの確認と、送る形は core/recordDetail.ts。ここは、画面と試験の両方が使う、純粋な関数だけ。
 */

import { RECORD_DETAIL_VERSION, type KickRecord, type RecordDetail } from '../../core/recordDetail.ts';
import { stripInvisible } from '../../core/entryPackage.ts';

export type KickText = { games: string; win: string; loss: string; draw: string };
export type OtherText = { sport: string; games: string; win: string; loss: string; draw: string; noResult: string };
export type TitleText = { event: string; year: string; class: string; result: string };

export const EMPTY_KICK_TEXT: KickText = { games: '', win: '', loss: '', draw: '' };
export const emptyOtherText = (): OtherText => ({ sport: '', games: '', win: '', loss: '', draw: '', noResult: '' });
export const emptyTitleText = (): TitleText => ({ event: '', year: '', class: '', result: '' });

/** 画面の数字（全角も可）を数にする。数字でなければ NaN（決まりの確認で、直す所になる） */
export function countOf(text: string): number {
  const t = stripInvisible(String(text ?? '').normalize('NFKC')).replace(/[\s,]/g, '');
  return /^\d{1,4}$/.test(t) ? Number(t) : NaN;
}

const textOf = (value: string): string => stripInvisible(String(value ?? '')).replace(/^[\s　]+|[\s　]+$/g, '');

/** 画面の文字から、決まりの形を作る（数字が読めないところは NaN のまま。決まりの確認が、その欄を直すように言う）。未経験（試合数0）のときは、勝ち・負け・引き分けは 0 */
export function detailFromText(kick: KickText, others: OtherText[], titles: TitleText[]): RecordDetail {
  const games = countOf(kick.games);
  const none = games === 0;
  return {
    v: RECORD_DETAIL_VERSION,
    kick: { games, win: none ? 0 : countOf(kick.win), loss: none ? 0 : countOf(kick.loss), draw: none ? 0 : countOf(kick.draw) },
    others: others.map((o) => ({ sport: textOf(o.sport), games: countOf(o.games), win: countOf(o.win), loss: countOf(o.loss), draw: countOf(o.draw), noResult: countOf(o.noResult) })),
    titles: titles.map((t) => ({ event: textOf(t.event), year: countOf(t.year), class: textOf(t.class), result: textOf(t.result) })),
  };
}

/** 決まりの形（キック）を、画面の文字に戻す（下書きを戻すとき） */
export function kickTextOf(kick: KickRecord): KickText {
  return { games: String(kick.games), win: String(kick.win), loss: String(kick.loss), draw: String(kick.draw) };
}

/** 送る前の確認に出す行（見出しと中身）。キック・他の格闘技・タイトルの順 */
export function recordReviewPairs(detail: RecordDetail): [string, string][] {
  const out: [string, string][] = [];
  const k = detail.kick;
  out.push(['キックボクシング', k.games === 0 ? '未経験（試合数 0）' : '試合 ' + k.games + '・勝ち ' + k.win + '・負け ' + k.loss + '・引き分け ' + k.draw]);
  for (const o of detail.others) out.push(['他の格闘技：' + o.sport, '試合 ' + o.games + '・勝ち ' + o.win + '・負け ' + o.loss + '・引き分け ' + o.draw + '・勝敗なし ' + o.noResult]);
  for (const t of detail.titles) out.push(['タイトル・入賞：' + t.event, t.year + '年・' + t.class + '・' + t.result]);
  return out;
}
