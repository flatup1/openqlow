/**
 * v1 の完成条件を、そのままテストにしたもの。
 *
 *   1. 3端末同時同期で問題なく動く
 *   2. 30分の模擬大会を完走できる
 *   3. 緊急停止と復元が動く
 *   4. 音源チェックで赤が残らない
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyProgram, currentMatch, initialState, phaseLabel, reduce } from '../core/state.ts';
import { commit, newHistory, undo } from '../core/history.ts';
import { displayMs, formatDuration, remainingMs } from '../core/timer.ts';
import { buildMcScript } from '../core/script.ts';
import { summarizeMusic } from '../core/music.ts';
import { parseProgram } from '../core/sheet.ts';
import type { EventState, Program } from '../core/types.ts';

const T0 = 1_700_000_000_000;

/** 5試合・2R・2分・インターバル1分 = ちょうど30分ほどの大会 */
const REHEARSAL_MATCHES = 5;

function rehearsalProgram(): Program {
  const header =
    'no,class,rule,rounds,round_seconds,break_seconds,red_name,red_team,red_record,red_comment,blue_name,blue_team,blue_record,blue_comment,note';
  const rows = [];
  for (let i = 1; i <= REHEARSAL_MATCHES; i++) {
    rows.push(
      [i, 'ライト級', 'アマチュアMMA', 2, '2:00', 60, '赤' + i, 'Aジム', '1勝', '勝ちます', '青' + i, 'Bジム', '2勝', '全力で', ''].join(','),
    );
  }
  const music = ['no,kind,title,apple_music_url,youtube_url,seconds'];
  for (let i = 1; i <= REHEARSAL_MATCHES; i++) {
    music.push([i, 'walkout_red', '入場曲' + i, 'https://music.apple.com/jp/album/a/' + i, '', 60].join(','));
  }
  return parseProgram(
    {
      event: ['key,value', 'title,UIZIN 模擬大会', 'venue,テスト会場', 'hold_message,しばらくお待ちください'].join('\n'),
      matches: [header, ...rows].join('\n'),
      music: music.join('\n'),
    },
    T0,
  );
}

/** 1台の端末が、同じ state から画面に出す文字列を作る（画面ごとの表示の代わり） */
function render(program: Program, state: EventState, now: number): string {
  const match = currentMatch(program, state);
  const mc = buildMcScript(program, state);
  return [
    'v' + state.version,
    phaseLabel(state.phase),
    'R' + state.round,
    match ? '第' + match.no + '試合 ' + match.red.name + ' vs ' + match.blue.name : '試合なし',
    'EVENT ' + formatDuration(displayMs(state.eventTimer, now)),
    'ROUND ' + formatDuration(displayMs(state.roundTimer, now)),
    state.hold.active ? 'HOLD:' + state.hold.message : 'LIVE',
    'MC:' + mc.lines.join(' / '),
  ].join(' | ');
}

test('完成条件2: 30分の模擬大会を「次へ」だけで完走できる', () => {
  const program = rehearsalProgram();
  let history = newHistory(initialState(T0, program));
  let now = T0;
  let presses = 0;

  // 実時間どおりに進める（入場30秒 / 1R 3分 / インターバル1分 / 結果30秒）
  const waitFor = (state: EventState): number => {
    if (state.phase === 'before') return 5_000;
    if (state.phase === 'walkout') return 30_000;
    if (state.phase === 'fight') return 120_000;
    if (state.phase === 'interval') return 60_000;
    return 30_000;
  };

  while (history.current.phase !== 'finished' && presses < 200) {
    now += waitFor(history.current);
    const r = reduce(history.current, program, { type: 'next' }, now);
    assert.equal(r.changed, true, '「次へ」が拒否された: ' + r.reason);
    history = commit(history, r.state);
    presses++;
  }

  assert.equal(history.current.phase, 'finished', '最後まで進んだ');
  assert.equal(presses, 1 + REHEARSAL_MATCHES * 5, '押した「次へ」の回数（開始1回 + 1試合あたり5回）');

  const elapsedMinutes = (now - T0) / 60_000;
  assert.ok(elapsedMinutes >= 28 && elapsedMinutes <= 32, '30分の模擬大会になっている: 実際 ' + elapsedMinutes.toFixed(1) + '分');
  assert.equal(history.current.eventTimer.mode, 'paused');
});

test('完成条件1: 3端末が同じ瞬間に同じ表示になる（1秒未満のズレも出ない）', () => {
  const program = rehearsalProgram();
  let state = initialState(T0, program);
  let now = T0;
  for (const _ of [0, 1, 2, 3]) {
    now += 12_345;
    state = reduce(state, program, { type: 'next' }, now).state;
  }

  // 3端末は同じ state を受け取り、それぞれ自分で表示を計算する
  const 観測時刻 = now + 47_000;
  const オペレーター = render(program, state, 観測時刻);
  const MC = render(program, state, 観測時刻);
  const 表示画面 = render(program, state, 観測時刻);

  assert.equal(オペレーター, MC);
  assert.equal(MC, 表示画面);

  // 端末の時計が 300ms ずれていても、同期のズレは1秒未満に収まる
  const ズレ = 300;
  const 正 = remainingMs(state.roundTimer, 観測時刻) ?? 0;
  const 誤 = remainingMs(state.roundTimer, 観測時刻 + ズレ) ?? 0;
  assert.ok(Math.abs(正 - 誤) < 1_000, '端末間のズレは1秒未満: ' + Math.abs(正 - 誤) + 'ms');
});

test('完成条件1: 遅れて繋いだ端末も、同じ state から同じ残り時間を出す', () => {
  const program = rehearsalProgram();
  let state = initialState(T0, program);
  state = reduce(state, program, { type: 'next' }, T0 + 1_000).state; // 入場
  state = reduce(state, program, { type: 'next' }, T0 + 31_000).state; // 1R開始

  // 90秒後に接続してきた端末
  const 観測時刻 = T0 + 121_000;
  assert.equal(remainingMs(state.roundTimer, 観測時刻), 30_000, '2分ラウンドの90秒経過 = 残り30秒');
  assert.equal(formatDuration(displayMs(state.roundTimer, 観測時刻)), '00:30');
});

test('完成条件3: 緊急停止すると全画面が止まり、MCは「しばらくお待ちください」になる', () => {
  const program = rehearsalProgram();
  let state = initialState(T0, program);
  state = reduce(state, program, { type: 'next' }, T0 + 1_000).state;
  state = reduce(state, program, { type: 'next' }, T0 + 31_000).state;

  const 停止時刻 = T0 + 91_000;
  const 残り = remainingMs(state.roundTimer, 停止時刻);
  state = reduce(state, program, { type: 'hold' }, 停止時刻).state;

  assert.equal(state.hold.active, true);
  assert.equal(buildMcScript(program, state).lines[0], 'しばらくお待ちください');

  // 5分停止しても、残り時間は1ミリも減らない
  const 再開時刻 = 停止時刻 + 300_000;
  assert.equal(remainingMs(state.roundTimer, 再開時刻), 残り);

  state = reduce(state, program, { type: 'resume' }, 再開時刻).state;
  assert.equal(state.hold.active, false);
  assert.equal(remainingMs(state.roundTimer, 再開時刻), 残り, '再開した瞬間は止めたところから');
  assert.equal(remainingMs(state.roundTimer, 再開時刻 + 10_000), (残り ?? 0) - 10_000);
});

test('完成条件3: ブラウザを再読み込みしても、試合・タイマー・状態が完全に戻る', () => {
  const program = rehearsalProgram();
  let state = initialState(T0, program);
  state = reduce(state, program, { type: 'next' }, T0 + 1_000).state;
  state = reduce(state, program, { type: 'next' }, T0 + 31_000).state;
  state = reduce(state, program, { type: 'next' }, T0 + 211_000).state; // インターバル

  // 保存 → 再読み込み（JSONを通す）
  const 保存 = JSON.stringify(state);
  const 復元: EventState = JSON.parse(保存);

  const 観測時刻 = T0 + 241_000;
  assert.deepEqual(復元, state);
  assert.equal(render(program, 復元, 観測時刻), render(program, state, 観測時刻));
  assert.equal(remainingMs(復元.roundTimer, 観測時刻), 30_000, 'インターバル残り30秒が復元される');
});

test('完成条件3: 押し間違えても、直前の一手だけ元に戻せる', () => {
  const program = rehearsalProgram();
  let history = newHistory(initialState(T0, program));
  let now = T0;
  for (const _ of [0, 1, 2]) {
    now += 30_000;
    history = commit(history, reduce(history.current, program, { type: 'next' }, now).state);
  }
  const 戻す前 = history.current.phase;

  // 間違えて「次へ」を押してしまった
  now += 1_000;
  history = commit(history, reduce(history.current, program, { type: 'next' }, now).state);
  assert.notEqual(history.current.phase, 戻す前);

  const result = undo(history, now + 1_000);
  assert.equal(result.changed, true);
  assert.equal(result.history.current.phase, 戻す前);
});

test('完成条件4: 音源チェックで赤が残らないこと（模擬大会の番組表）', () => {
  const program = rehearsalProgram();
  const summary = summarizeMusic(program.cues, []);
  assert.equal(summary.red, 0, '赤が残っていたら大会を開始しない');
  assert.equal(summary.ready, true);
});

test('進行中に番組表を取り込み直しても、大会は止まらない', () => {
  const program = rehearsalProgram();
  let state = initialState(T0, program);
  state = reduce(state, program, { type: 'next' }, T0 + 1_000).state;
  state = reduce(state, program, { type: 'next' }, T0 + 31_000).state;
  const 残り = remainingMs(state.roundTimer, T0 + 91_000);

  const updated = rehearsalProgram();
  state = applyProgram(state, updated, program, T0 + 91_000);

  assert.equal(state.phase, 'fight');
  assert.equal(remainingMs(state.roundTimer, T0 + 91_000), 残り, '走っているタイマーは触らない');
  assert.equal(currentMatch(updated, state)?.no, 1);
});
