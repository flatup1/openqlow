/**
 * くわしい戦績の入力欄の「文字 → 決まりの形」の変換（画面の文字は、そのまま持つ）。画面の見た目は RecordDetailFields.tsx。
 * 決まりの確認と、送る形は core/recordDetail.ts。ここは、画面と試験の両方が使う、純粋な関数だけ。
 */

import { RECORD_DETAIL_LIMITS, RECORD_DETAIL_VERSION, recordDetailProblems, type KickRecord, type RecordDetail } from '../../core/recordDetail.ts';
import { stripInvisible } from '../../core/entryPackage.ts';

/**
 * 画面で聞くのは「試合数」「勝ち」「引き分け」（2026-10-25 owner：引き分けも表示できるように。引き分けは、なければ空のままでよい＝0）。
 * 送る形（core/recordDetail.ts）は、これまでと同じ：負け＝試合数−勝ち−引き分け（他の格闘技の「勝敗なし」も、負けに入る）、勝敗なし＝0。
 * 中身の決まり・Googleの受付（.gs）の検査・表の列・名簿ZIPは、前から引き分けを持てるので、変えなくてよい。
 * シートに書く戦績の一行は「5戦3勝1敗1分」（引き分けが0なら「5戦3勝2敗」。Googleの受付 3.20261024.2 のまま）。
 */
/** draw は、前の形（試合数・勝ちだけ）の値も受けるため、無くてもよい（無い＝空＝0） */
export type KickText = { games: string; win: string; draw?: string };
export type OtherText = { sport: string; games: string; win: string; draw?: string };
export type TitleText = { event: string; year: string; class: string; result: string };

export const EMPTY_KICK_TEXT: KickText = { games: '', win: '', draw: '' };
export const emptyOtherText = (): OtherText => ({ sport: '', games: '', win: '', draw: '' });
export const emptyTitleText = (): TitleText => ({ event: '', year: '', class: '', result: '' });

/** 画面の数字（全角も可）を数にする。数字でなければ NaN（決まりの確認で、直す所になる） */
export function countOf(text: string): number {
  const t = stripInvisible(String(text ?? '').normalize('NFKC')).replace(/[\s,]/g, '');
  return /^\d{1,4}$/.test(t) ? Number(t) : NaN;
}

const textOf = (value: string): string => stripInvisible(String(value ?? '')).replace(/^[\s　]+|[\s　]+$/g, '');

/** 引き分けの欄：空（空白だけも）は 0（引き分けが無い人は、入れなくてよい）。数字でなければ NaN */
export const drawOf = (text: string | undefined): number => (textOf(text ?? '') === '' ? 0 : countOf(text ?? ''));

/** 負け＝試合数−勝ち−引き分け（勝敗なしも、ここに入る）。勝ち・引き分けが数でない・合わせて試合数より多いときは NaN（決まりの確認が、その欄を直すように言う） */
const lossOf = (games: number, win: number, draw: number): number => (Number.isInteger(games) && Number.isInteger(win) && Number.isInteger(draw) && win >= 0 && draw >= 0 && win + draw <= games ? games - win - draw : NaN);

/** 画面の文字から、決まりの形を作る（数字が読めないところは NaN のまま。決まりの確認が、その欄を直すように言う）。未経験（試合数0）のときは、勝ち・負け・引き分けは 0。勝敗なしは、いつも 0 */
export function detailFromText(kick: KickText, others: OtherText[], titles: TitleText[]): RecordDetail {
  const games = countOf(kick.games);
  const none = games === 0;
  const win = none ? 0 : countOf(kick.win);
  const draw = none ? 0 : drawOf(kick.draw);
  return {
    v: RECORD_DETAIL_VERSION,
    kick: { games, win, loss: none ? 0 : lossOf(games, win, draw), draw },
    others: others.map((o) => {
      const g = countOf(o.games), w = countOf(o.win), d = drawOf(o.draw);
      return { sport: textOf(o.sport), games: g, win: w, loss: lossOf(g, w, d), draw: d, noResult: 0 };
    }),
    titles: titles.map((t) => ({ event: textOf(t.event), year: countOf(t.year), class: textOf(t.class), result: textOf(t.result) })),
  };
}

/**
 * 直す所を、画面の欄（試合数・勝ち・引き分け）の言い方で言う。決まりの確認（core/recordDetail.ts）の言葉のうち、
 * 「勝ち・負け・引き分け」と言うものは、画面には負けの欄が無いので、勝ち・引き分けの言い方に置きかえる（数でない／合わせて試合数より多い）。
 * ほかの言葉（試合数・競技名・タイトルなど）は、決まりの確認のまま。
 */
const countWords = (who: string, games: number, win: number, draw: number): string | null => {
  if (!Number.isInteger(win)) return who + 'の勝ちを、数字で入れてください。';
  if (!Number.isInteger(draw)) return who + 'の引き分けを、数字で入れてください（無ければ、空のままにします）。';
  if (win > games) return who + 'の勝ちが、試合数（' + games + '）より多くなっています。';
  if (win + draw > games) return who + 'の勝ちと引き分けを合わせた数が、試合数（' + games + '）より多くなっています。';
  return null;
};
export function recordProblems(kick: KickText, others: OtherText[], titles: TitleText[]): string[] {
  const detail = detailFromText(kick, others, titles);
  // 欄ごとに分けて確かめる（どの欄の言葉かを、そのまま保つため）。ほかの欄は、問題の出ない値に置く
  const calm = { games: 0, win: 0, loss: 0, draw: 0 };
  const kickAll = recordDetailProblems({ ...detail, others: [], titles: [] });
  const otherAll = recordDetailProblems({ ...detail, kick: calm, titles: [] });
  const titleAll = recordDetailProblems({ ...detail, kick: calm, others: [] });
  const out: string[] = [];
  const games = countOf(kick.games), win = countOf(kick.win), draw = drawOf(kick.draw);
  for (const text of kickAll) {
    if (/^キックボクシングの勝ち・負け・引き分け/.test(text)) {
      out.push(countWords('キックボクシング', games, win, draw) ?? 'キックボクシングの勝ちを、数字で入れてください。');
    } else out.push(text);
  }
  // 他の格闘技：勝ちに関する言葉は、行ごとに作り直す（どの競技かを言うため）。ほかの言葉は、決まりの確認のまま
  for (const text of otherAll) if (!/勝ち・負け・引き分け/.test(text)) out.push(text);
  for (const o of others) {
    const g = countOf(o.games), w = countOf(o.win), d = drawOf(o.draw);
    if (!(g >= 1)) continue; // 試合数が先に直す所（決まりの確認が言う）
    const who = textOf(o.sport) ? '「' + textOf(o.sport) + '」' : '他の格闘技';
    const words = countWords(who, g, w, d);
    if (words) out.push(words);
  }
  out.push(...titleAll);
  return out;
}

/** 決まりの形（キック）を、画面の文字に戻す（下書きを戻すとき）。初試合（試合数0）の勝ちは、空に戻す（ふつうに入れるときも、勝ちは空から始まる。「0」が入ったままだと、あとで試合数を変えたとき、勝ちを入れていないのに「入った」ことになる） */
export function kickTextOf(kick: KickRecord): KickText {
  return { games: String(kick.games), win: kick.games === 0 ? '' : String(kick.win), draw: kick.games === 0 || kick.draw === 0 ? '' : String(kick.draw) };
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
  const g = countOf(kick.games), w = countOf(kick.win), d = drawOf(kick.draw);
  if (anyText(kick.games) && !countIn(g)) return true;
  if (g > 0 && anyText(kick.win) && (!countIn(w) || w > g)) return true;
  if (g > 0 && anyText(kick.draw ?? '') && (!countIn(d) || d > g || (countIn(w) && w + d > g))) return true;
  for (const o of others) {
    const og = countOf(o.games), ow = countOf(o.win), od = drawOf(o.draw);
    if (textOf(o.sport).length > RECORD_DETAIL_LIMITS.sport) return true;
    if (anyText(o.games) && !(countIn(og) && og >= 1)) return true;
    if (anyText(o.win) && (!countIn(ow) || (og >= 1 && ow > og))) return true;
    if (anyText(o.draw ?? '') && (!countIn(od) || (og >= 1 && (od > og || (countIn(ow) && ow + od > og))))) return true;
  }
  for (const t of titles) {
    const year = countOf(t.year);
    if (anyText(t.year) && !(Number.isInteger(year) && year >= RECORD_DETAIL_LIMITS.yearMin && year <= RECORD_DETAIL_LIMITS.yearMax)) return true;
    if (textOf(t.event).length > RECORD_DETAIL_LIMITS.event || textOf(t.class).length > RECORD_DETAIL_LIMITS.class || textOf(t.result).length > RECORD_DETAIL_LIMITS.result) return true;
  }
  return false;
}

/** 戦績の言い方「5戦3勝1敗1分」（2026-10-25 owner：引き分けも出す）。引き分けが0なら「5戦3勝2敗」。敗＝試合数−勝ち−引き分け */
export function recordLine(games: number, win: number, draw = 0): string {
  return games + '戦' + win + '勝' + (games - win - draw) + '敗' + (draw > 0 ? draw + '分' : '');
}

/** 「敗」の意味（確認の画面に、小さく出す一言）。負けは聞かずに、試合数・勝ち・引き分けから決めた数なので、そう言う */
export const RECORD_LOSS_NOTE = '「敗」は、試合数から勝ちと引き分けを引いた数です。';

/** 送る前の確認に出す行（見出しと中身）。キック・他の格闘技・タイトルの順。キックと他の格闘技は「5戦3勝2敗」の形 */
export function recordReviewPairs(detail: RecordDetail): [string, string][] {
  const out: [string, string][] = [];
  const k = detail.kick;
  out.push(['キックボクシング', k.games === 0 ? '未経験（試合数 0）' : recordLine(k.games, k.win, k.draw)]);
  for (const o of detail.others) out.push(['他の格闘技：' + o.sport, recordLine(o.games, o.win, o.draw)]);
  for (const t of detail.titles) out.push(['タイトル・入賞：' + t.event, t.year + '年・' + t.class + '・' + t.result]);
  return out;
}
