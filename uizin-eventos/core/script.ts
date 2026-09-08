/**
 * MC が読み上げる文章の組み立て（純関数）。
 *
 * MC画面には「読む文だけ」を出す。ボタンは1つも置かない。
 * だから、何を読むかはここで完全に決めきる。
 */

import type { EventState, Program } from './types.ts';
import { currentMatch, nextMatch } from './state.ts';

export type McBlock = {
  /** 見出し（小さく出す） */
  heading: string;
  /** 読み上げる本文（大きく出す） */
  lines: string[];
  /** 補足（読まなくてよい情報） */
  note: string;
};

function roundText(rounds: number, roundSeconds: number): string {
  const minutes = Math.floor(roundSeconds / 60);
  const seconds = roundSeconds % 60;
  const time = seconds === 0 ? minutes + '分' : minutes + '分' + seconds + '秒';
  return time + ' ' + rounds + 'ラウンド';
}

function fighterLine(side: '赤' | '青', f: { name: string; team: string; record: string }): string {
  const parts = [side + 'コーナー'];
  if (f.team) parts.push(f.team + '所属');
  parts.push(f.name + '選手');
  const head = parts.join('、');
  return f.record ? head + '。' + f.record + '。' : head + '。';
}

export function buildMcScript(program: Program, state: EventState): McBlock {
  if (state.hold.active) {
    return {
      heading: '停止中',
      lines: [state.hold.message || program.meta.holdMessage],
      note: '再開の合図が出るまで、この文だけを読んでください。',
    };
  }

  if (state.phase === 'before') {
    const first = program.matches.length > 0 ? program.matches[0] : null;
    return {
      heading: '開始前',
      lines: [
        'まもなく ' + program.meta.title + ' を開始いたします。',
        first ? '第1試合は、' + first.red.name + '選手 対 ' + first.blue.name + '選手です。' : '',
      ].filter((l) => l !== ''),
      note: '開始の合図が出るまで待機してください。',
    };
  }

  if (state.phase === 'finished') {
    return {
      heading: '終了',
      lines: [
        '本日の ' + program.meta.title + ' は、これをもちまして全試合終了となります。',
        'ご来場、誠にありがとうございました。',
      ],
      note: '',
    };
  }

  const match = currentMatch(program, state);
  if (!match) {
    return { heading: '待機', lines: ['しばらくお待ちください。'], note: '試合情報が読み込まれていません。' };
  }

  const title = '第' + match.no + '試合';

  if (state.phase === 'walkout') {
    const lines = [
      title + '。' + (match.className ? match.className + '。' : '') + roundText(match.rounds, match.roundSeconds) + '。',
      fighterLine('赤', match.red),
      match.red.comment ? '意気込み。「' + match.red.comment + '」' : '',
      fighterLine('青', match.blue),
      match.blue.comment ? '意気込み。「' + match.blue.comment + '」' : '',
    ].filter((l) => l !== '');
    return { heading: title + '　入場', lines, note: match.rule ? 'ルール: ' + match.rule : '' };
  }

  if (state.phase === 'fight') {
    return {
      heading: title + '　第' + state.round + 'ラウンド',
      lines: [
        '第' + state.round + 'ラウンド。',
        match.red.name + '選手 対 ' + match.blue.name + '選手。',
      ],
      note: '試合中は原則しゃべりません。合図が出たときだけ読んでください。',
    };
  }

  if (state.phase === 'interval') {
    return {
      heading: title + '　インターバル',
      lines: [
        'インターバルです。',
        '続いて第' + (state.round + 1) + 'ラウンド。',
      ],
      note: '',
    };
  }

  // result
  const following = nextMatch(program, state);
  return {
    heading: title + '　結果',
    lines: [
      title + '、勝敗を確認しています。しばらくお待ちください。',
      following
        ? '次は第' + following.no + '試合、' + following.red.name + '選手 対 ' + following.blue.name + '選手です。'
        : '本日の最終試合でした。',
    ],
    note: '勝者名は、オペレーターの合図を受けてから読んでください。',
  };
}
