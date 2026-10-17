/**
 * イベントステートの書き換え規則（唯一の真実）。
 *
 * ここは純関数だけ。ネットワークも時計も触らない（now は必ず引数で受け取る）。
 * Worker も画面も、ここを通してしか状態を変えられない。
 */

import type {
  Command,
  EventState,
  LogEntry,
  Match,
  MusicCue,
  Program,
  ReduceResult,
  Timer,
} from './types.ts';
import { makeTimer, pauseTimer, resetTimer, restartTimer, startTimer } from './timer.ts';

export const EMPTY_PROGRAM: Program = {
  revision: 'empty',
  fetchedAt: 0,
  meta: {
    title: 'UIZIN',
    venue: '',
    date: '',
    startAt: '',
    holdMessage: 'しばらくお待ちください',
  },
  matches: [],
  cues: [],
  warnings: ['番組表がまだ取り込まれていません。'],
};

export function initialState(now: number, program: Program): EventState {
  const first = program.matches.length > 0 ? program.matches[0] : null;
  return {
    version: 1,
    updatedAt: now,
    programRevision: program.revision,
    matchIndex: program.matches.length > 0 ? 0 : -1,
    phase: 'before',
    round: 1,
    hold: {
      active: false,
      message: program.meta.holdMessage,
      since: null,
      paused: { event: false, round: false, cue: false },
    },
    eventTimer: makeTimer(null),
    roundTimer: makeTimer(first ? first.roundSeconds * 1000 : null),
    cueIndex: program.cues.length > 0 ? 0 : -1,
    cueTimer: makeTimer(program.cues.length > 0 ? program.cues[0].seconds * 1000 : null),
    lastCommand: null,
  };
}

// ---------------------------------------------------------------------------
// 参照ヘルパー
// ---------------------------------------------------------------------------

export function currentMatch(program: Program, state: EventState): Match | null {
  if (state.matchIndex < 0 || state.matchIndex >= program.matches.length) return null;
  return program.matches[state.matchIndex];
}

export function nextMatch(program: Program, state: EventState): Match | null {
  const i = state.matchIndex + 1;
  if (i < 0 || i >= program.matches.length) return null;
  return program.matches[i];
}

export function currentCue(program: Program, state: EventState): MusicCue | null {
  if (state.cueIndex < 0 || state.cueIndex >= program.cues.length) return null;
  return program.cues[state.cueIndex];
}

export function nextCue(program: Program, state: EventState): MusicCue | null {
  const i = state.cueIndex + 1;
  if (i < 0 || i >= program.cues.length) return null;
  return program.cues[i];
}

export function phaseLabel(phase: EventState['phase']): string {
  if (phase === 'before') return '開始前';
  if (phase === 'walkout') return '入場';
  if (phase === 'fight') return '試合中';
  if (phase === 'interval') return 'インターバル';
  if (phase === 'result') return '結果';
  return '終了';
}

/** 「次へ」を押すと何が起きるかの予告（誤操作防止のため画面に出す） */
export function nextActionLabel(program: Program, state: EventState): string {
  if (state.hold.active) return '停止中（再開すると押せます）';
  const match = currentMatch(program, state);
  if (state.phase === 'before') return program.matches.length > 0 ? '大会を開始（第1試合の入場へ）' : '試合がありません';
  if (state.phase === 'walkout') return '試合開始（第1ラウンド）';
  if (state.phase === 'fight') {
    if (match && state.round < match.rounds) return 'ラウンド終了（インターバルへ）';
    return '試合終了（結果へ）';
  }
  if (state.phase === 'interval') return '第' + (state.round + 1) + 'ラウンド開始';
  if (state.phase === 'result') {
    return nextMatch(program, state) ? '次の試合の入場へ' : '大会を終了';
  }
  return '大会は終了しています';
}

// ---------------------------------------------------------------------------
// reduce
// ---------------------------------------------------------------------------

function bump(state: EventState, now: number, type: LogEntry['type'], label: string): EventState {
  const version = state.version + 1;
  return {
    ...state,
    version,
    updatedAt: now,
    lastCommand: { type, at: now, label, version },
  };
}

function reject(state: EventState, reason: string): ReduceResult {
  return { state, changed: false, reason, label: '' };
}

function roundDurationMs(match: Match | null): number | null {
  return match ? match.roundSeconds * 1000 : null;
}

function breakDurationMs(match: Match | null): number | null {
  return match ? match.breakSeconds * 1000 : null;
}

function cueDurationMs(cue: MusicCue | null): number | null {
  if (!cue) return null;
  return cue.seconds > 0 ? cue.seconds * 1000 : null;
}

/**
 * コマンドを1つ適用する。
 * 「大会を止めない」ため、不正なコマンドは例外を投げずに changed:false で返す。
 */
export function reduce(
  state: EventState,
  program: Program,
  command: Command,
  now: number,
): ReduceResult {
  // --- 停止中は「再開」と「停止文言の変更」しか受け付けない（誤操作防止） ---
  if (state.hold.active && command.type !== 'resume' && command.type !== 'hold') {
    return reject(state, '停止中です。先に「再開」を押してください。');
  }

  const match = currentMatch(program, state);

  if (command.type === 'hold') {
    const message = (command.message ?? '').trim() || state.hold.message || program.meta.holdMessage;
    if (state.hold.active) {
      if (message === state.hold.message) return reject(state, 'すでに停止中です。');
      const s = bump(state, now, 'hold', '停止の文言を変更');
      return { state: { ...s, hold: { ...s.hold, message } }, changed: true, reason: null, label: '停止の文言を変更' };
    }
    const paused = {
      event: state.eventTimer.mode === 'running',
      round: state.roundTimer.mode === 'running',
      cue: state.cueTimer.mode === 'running',
    };
    const s = bump(state, now, 'hold', '停止');
    return {
      state: {
        ...s,
        hold: { active: true, message, since: now, paused },
        eventTimer: pauseTimer(state.eventTimer, now),
        roundTimer: pauseTimer(state.roundTimer, now),
        cueTimer: pauseTimer(state.cueTimer, now),
      },
      changed: true,
      reason: null,
      label: '停止',
    };
  }

  if (command.type === 'resume') {
    if (!state.hold.active) return reject(state, '停止していません。');
    const p = state.hold.paused;
    const s = bump(state, now, 'resume', '再開');
    return {
      state: {
        ...s,
        hold: { active: false, message: state.hold.message, since: null, paused: { event: false, round: false, cue: false } },
        eventTimer: p.event ? startTimer(state.eventTimer, now) : state.eventTimer,
        roundTimer: p.round ? startTimer(state.roundTimer, now) : state.roundTimer,
        cueTimer: p.cue ? startTimer(state.cueTimer, now) : state.cueTimer,
      },
      changed: true,
      reason: null,
      label: '再開',
    };
  }

  if (command.type === 'start_event' || (command.type === 'next' && state.phase === 'before')) {
    if (state.phase !== 'before') return reject(state, 'すでに大会は始まっています。');
    if (program.matches.length === 0) return reject(state, '番組表に試合がありません。先に取り込んでください。');
    const first = program.matches[0];
    const s = bump(state, now, command.type, '大会を開始（第1試合の入場）');
    return {
      state: {
        ...s,
        matchIndex: 0,
        phase: 'walkout',
        round: 1,
        eventTimer: startTimer(resetTimer(state.eventTimer, null), now),
        roundTimer: resetTimer(state.roundTimer, first.roundSeconds * 1000),
      },
      changed: true,
      reason: null,
      label: '大会を開始（第1試合の入場）',
    };
  }

  if (command.type === 'next') {
    if (state.phase === 'finished') return reject(state, '大会は終了しています。');

    if (state.phase === 'walkout') {
      const label = '第' + (match ? match.no : '?') + '試合 開始（1R）';
      const s = bump(state, now, 'next', label);
      return {
        state: { ...s, phase: 'fight', round: 1, roundTimer: restartTimer(roundDurationMs(match), now) },
        changed: true,
        reason: null,
        label,
      };
    }

    if (state.phase === 'fight') {
      if (match && state.round < match.rounds) {
        const label = state.round + 'R終了 → インターバル';
        const s = bump(state, now, 'next', label);
        return {
          state: { ...s, phase: 'interval', roundTimer: restartTimer(breakDurationMs(match), now) },
          changed: true,
          reason: null,
          label,
        };
      }
      const label = '試合終了 → 結果';
      const s = bump(state, now, 'next', label);
      return {
        state: { ...s, phase: 'result', roundTimer: pauseTimer(state.roundTimer, now) },
        changed: true,
        reason: null,
        label,
      };
    }

    if (state.phase === 'interval') {
      const round = state.round + 1;
      const label = round + 'R 開始';
      const s = bump(state, now, 'next', label);
      return {
        state: { ...s, phase: 'fight', round, roundTimer: restartTimer(roundDurationMs(match), now) },
        changed: true,
        reason: null,
        label,
      };
    }

    // result
    const following = nextMatch(program, state);
    if (!following) {
      const label = '全試合終了';
      const s = bump(state, now, 'next', label);
      return {
        state: {
          ...s,
          phase: 'finished',
          eventTimer: pauseTimer(state.eventTimer, now),
          roundTimer: pauseTimer(state.roundTimer, now),
        },
        changed: true,
        reason: null,
        label,
      };
    }
    const label = '第' + following.no + '試合 入場へ';
    const s = bump(state, now, 'next', label);
    return {
      state: {
        ...s,
        matchIndex: state.matchIndex + 1,
        phase: 'walkout',
        round: 1,
        roundTimer: resetTimer(state.roundTimer, following.roundSeconds * 1000),
      },
      changed: true,
      reason: null,
      label,
    };
  }

  if (command.type === 'round_start') {
    if (state.roundTimer.mode === 'running') return reject(state, 'ラウンドタイマーは動いています。');
    const s = bump(state, now, 'round_start', 'ラウンドタイマー開始');
    return { state: { ...s, roundTimer: startTimer(state.roundTimer, now) }, changed: true, reason: null, label: 'ラウンドタイマー開始' };
  }

  if (command.type === 'round_pause') {
    if (state.roundTimer.mode !== 'running') return reject(state, 'ラウンドタイマーは動いていません。');
    const s = bump(state, now, 'round_pause', 'ラウンドタイマー一時停止');
    return { state: { ...s, roundTimer: pauseTimer(state.roundTimer, now) }, changed: true, reason: null, label: 'ラウンドタイマー一時停止' };
  }

  if (command.type === 'round_reset') {
    const duration = state.phase === 'interval' ? breakDurationMs(match) : roundDurationMs(match);
    const s = bump(state, now, 'round_reset', 'ラウンドタイマーを戻す');
    return { state: { ...s, roundTimer: resetTimer(state.roundTimer, duration) }, changed: true, reason: null, label: 'ラウンドタイマーを戻す' };
  }

  if (command.type === 'cue_start') {
    const cue = currentCue(program, state);
    if (!cue) return reject(state, '曲がありません。');
    const s = bump(state, now, 'cue_start', '再生開始: ' + cue.title);
    return { state: { ...s, cueTimer: restartTimer(cueDurationMs(cue), now) }, changed: true, reason: null, label: '再生開始: ' + cue.title };
  }

  if (command.type === 'cue_next' || command.type === 'cue_prev') {
    if (program.cues.length === 0) return reject(state, '曲がありません。');
    const step = command.type === 'cue_next' ? 1 : -1;
    const index = state.cueIndex + step;
    if (index < 0) return reject(state, '最初の曲です。');
    if (index >= program.cues.length) return reject(state, '最後の曲です。');
    const cue = program.cues[index];
    const label = (step > 0 ? '次の曲へ: ' : '前の曲へ: ') + cue.title;
    const s = bump(state, now, command.type, label);
    return {
      state: { ...s, cueIndex: index, cueTimer: resetTimer(state.cueTimer, cueDurationMs(cue)) },
      changed: true,
      reason: null,
      label,
    };
  }

  if (command.type === 'jump_cue') {
    const index = program.cues.findIndex((c) => c.no === command.cueNo);
    if (index < 0) return reject(state, '曲番号 ' + command.cueNo + ' は番組表にありません。');
    const cue = program.cues[index];
    const label = '曲を移動: ' + cue.title;
    const s = bump(state, now, 'jump_cue', label);
    return {
      state: { ...s, cueIndex: index, cueTimer: resetTimer(state.cueTimer, cueDurationMs(cue)) },
      changed: true,
      reason: null,
      label,
    };
  }

  if (command.type === 'jump_match') {
    const index = program.matches.findIndex((m) => m.no === command.matchNo);
    if (index < 0) return reject(state, '試合番号 ' + command.matchNo + ' は番組表にありません。');
    const target = program.matches[index];
    const label = '第' + target.no + '試合へ移動（入場）';
    const s = bump(state, now, 'jump_match', label);
    return {
      state: {
        ...s,
        matchIndex: index,
        phase: 'walkout',
        round: 1,
        roundTimer: resetTimer(state.roundTimer, target.roundSeconds * 1000),
        eventTimer: state.eventTimer.mode === 'idle' ? startTimer(state.eventTimer, now) : state.eventTimer,
      },
      changed: true,
      reason: null,
      label,
    };
  }

  if (command.type === 'finish_event') {
    if (state.phase === 'finished') return reject(state, 'すでに終了しています。');
    const s = bump(state, now, 'finish_event', '大会を終了');
    return {
      state: {
        ...s,
        phase: 'finished',
        eventTimer: pauseTimer(state.eventTimer, now),
        roundTimer: pauseTimer(state.roundTimer, now),
        cueTimer: pauseTimer(state.cueTimer, now),
      },
      changed: true,
      reason: null,
      label: '大会を終了',
    };
  }

  if (command.type === 'reset_event') {
    const fresh = initialState(now, program);
    return {
      state: {
        ...fresh,
        version: state.version + 1,
        lastCommand: { type: 'reset_event', at: now, label: '最初に戻す', version: state.version + 1 },
      },
      changed: true,
      reason: null,
      label: '最初に戻す',
    };
  }

  return reject(state, '不明な操作です。');
}

/**
 * 新しい番組表を取り込んだときの当て込み。
 * 進行中でも壊さない（現在地は番号で追いかけ、無ければ範囲に丸める）。
 */
export function applyProgram(state: EventState, program: Program, previous: Program, now: number): EventState {
  let matchIndex = state.matchIndex;
  if (program.matches.length === 0) {
    matchIndex = -1;
  } else {
    const currentNo =
      previous.matches.length > state.matchIndex && state.matchIndex >= 0
        ? previous.matches[state.matchIndex].no
        : null;
    const found = currentNo === null ? -1 : program.matches.findIndex((m) => m.no === currentNo);
    matchIndex = found >= 0 ? found : Math.min(Math.max(state.matchIndex, 0), program.matches.length - 1);
  }

  let cueIndex = state.cueIndex;
  if (program.cues.length === 0) {
    cueIndex = -1;
  } else {
    const currentNo =
      previous.cues.length > state.cueIndex && state.cueIndex >= 0 ? previous.cues[state.cueIndex].no : null;
    const found = currentNo === null ? -1 : program.cues.findIndex((c) => c.no === currentNo);
    cueIndex = found >= 0 ? found : Math.min(Math.max(state.cueIndex, 0), program.cues.length - 1);
  }

  const match = matchIndex >= 0 ? program.matches[matchIndex] : null;
  const roundTimer: Timer =
    state.roundTimer.mode === 'idle' && match
      ? resetTimer(state.roundTimer, match.roundSeconds * 1000)
      : state.roundTimer;

  const version = state.version + 1;
  return {
    ...state,
    version,
    updatedAt: now,
    programRevision: program.revision,
    matchIndex,
    cueIndex,
    roundTimer,
    lastCommand: { type: 'program_reload', at: now, label: '番組表を取り込み', version },
  };
}
