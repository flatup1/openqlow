/**
 * 貼り付けたCSVを「取り込む前に人が確かめる」ための下見。
 *
 * なぜ要るのか。
 *   当日の番組表はGoogleスプレッドシート経由で入れる前提だったが、
 *   Googleにログインできない・シートを公開できない、という事情はいつでも起こる。
 *   そのときでも大会は開けないといけないので、CSVを直接貼る道を用意する。
 *   （受け口 /api/program/upload はもともとサーバー側にあった。押せる場所が無かっただけ）
 *
 * 貼り付けはシートより事故りやすい。だから取り込む前に必ずこれを通す。
 *   - 試合が0件なら取り込まない（進行中の対戦カードを空で上書きしない）
 *   - Googleのログイン画面のHTMLを貼ってしまったら取り込まない
 *   - 試合数が大きく減るときは、数字を並べて見せてから人に決めさせる
 *
 * ネットワークは触らない。文字列を受け取って数えるだけ。
 */

import { looksLikeHtml, parseProgram } from './sheet.ts';
import type { SheetCsv } from './sheet.ts';
import type { Program } from './types.ts';

/** 試合数がこの割合より減るときは、事故かもしれないので強く念を押す */
const SHRINK_RATIO = 0.5;

export type ImportPreview = {
  /** true のときだけ取り込んでよい */
  ok: boolean;
  /** 取り込めない理由。空なら取り込める */
  blockers: string[];
  /** 取り込めるが、人に確かめてほしいこと */
  cautions: string[];
  title: string;
  matches: number;
  cues: number;
  /** 意気込みが入っている枠の数（選手単位） */
  comments: number;
  /** 写真が入っている枠の数（選手単位） */
  photos: number;
  /** 音源URLが入っている曲の数 */
  music: number;
  /** いま動いている番組表との差（＋なら増える） */
  matchDelta: number | null;
  /** parseProgram が出した注意書き */
  warnings: string[];
};

function countFighters(program: Program): { comments: number; photos: number } {
  let comments = 0;
  let photos = 0;
  for (const match of program.matches) {
    for (const fighter of [match.red, match.blue]) {
      if (fighter.comment.trim() !== '') comments++;
      if (fighter.photo.trim() !== '') photos++;
    }
  }
  return { comments, photos };
}

function countMusic(program: Program): number {
  return program.cues.filter(
    (cue) => cue.appleMusicUrl.trim() !== '' || cue.youtubeUrl.trim() !== '' || cue.otherUrl.trim() !== '',
  ).length;
}

/** 貼り付けたCSVを取り込んだら何が起きるかを、取り込む前に数えて返す */
export function previewImport(csv: SheetCsv, current: Program | null, now: number): ImportPreview {
  const blockers: string[] = [];
  const cautions: string[] = [];

  // Googleの「ログインしてください」画面をコピーして貼ると、CSVではなくHTMLが入る。
  // これをそのまま取り込むと試合0件になり、進行中の対戦カードが消える。
  for (const [name, text] of [['event', csv.event], ['matches', csv.matches], ['music', csv.music]] as const) {
    if (text.trim() !== '' && looksLikeHtml(text)) {
      blockers.push(
        name + ' に貼られているのはCSVではなくWebページです。スプレッドシートの「ファイル→ダウンロード→CSV」で保存した中身を貼ってください。',
      );
    }
  }

  const program = parseProgram(csv, now);
  const { comments, photos } = countFighters(program);
  const music = countMusic(program);

  if (csv.matches.trim() === '') {
    blockers.push('matches が空です。対戦カードのCSVを貼ってください。');
  } else if (program.matches.length === 0) {
    blockers.push('対戦カードを1件も読み取れませんでした。1行目が見出し（no, red_name, blue_name …）になっているか確かめてください。');
  }

  const before = current ? current.matches.length : null;
  const matchDelta = before === null ? null : program.matches.length - before;

  if (before !== null && before > 0 && program.matches.length < before * SHRINK_RATIO) {
    cautions.push(
      '試合が ' + before + ' 件から ' + program.matches.length + ' 件に減ります。貼り忘れた行がないか確かめてください。',
    );
  }
  if (program.cues.length === 0) {
    cautions.push('曲が1件もありません。入場曲は鳴らせなくなります（進行そのものは続けられます）。');
  }
  if (program.matches.length > 0 && photos === 0) {
    cautions.push('選手の写真が1枚もありません（名前と意気込みだけの表示になります）。');
  }

  return {
    ok: blockers.length === 0,
    blockers,
    cautions,
    title: program.meta.title,
    matches: program.matches.length,
    cues: program.cues.length,
    comments,
    photos,
    music,
    matchDelta,
    warnings: program.warnings,
  };
}
