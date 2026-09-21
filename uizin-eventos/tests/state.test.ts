import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyProgram, initialState, nextActionLabel, reduce } from '../core/state.ts';
import { remainingMs } from '../core/timer.ts';
import { parseProgram } from '../core/sheet.ts';
import type { Command, EventState, Program } from '../core/types.ts';
import { buildProgram, EVENT_CSV, MATCHES_CSV, MUSIC_CSV } from './fixtures.ts';

const T0 = 1_700_000_000_000;

function run(program: Program, commands: Command[], startAt = T0, step = 1_000): EventState {
  let state = initialState(startAt, program);
  let now = startAt;
  for (const command of commands) {
    now += step;
    state = reduce(state, program, command, now).state;
  }
  return state;
}

test('開始前は「次へ」で大会が始まり、Event Timer が動き出す', () => {
  const program = buildProgram();
  const state = run(program, [{ type: 'next' }]);
  assert.equal(state.phase, 'walkout');
  assert.equal(state.matchIndex, 0);
  assert.equal(state.eventTimer.mode, 'running');
});

test('「次へ」だけで 入場→1R→インターバル→2R→結果→次の試合 と進む', () => {
  const program = buildProgram();
  const steps: Command[] = [{ type: 'next' }];
  let state = run(program, steps);
  const seen: string[] = [];
  let now = T0 + 10_000;
  for (let i = 0; i < 6; i++) {
    now += 1_000;
    state = reduce(state, program, { type: 'next' }, now).state;
    seen.push(state.phase + ':' + state.round + ':' + state.matchIndex);
  }
  assert.deepEqual(seen, [
    'fight:1:0',
    'interval:1:0',
    'fight:2:0',
    'result:2:0',
    'walkout:1:1',
    'fight:1:1',
  ]);
});

test('最終試合の結果で「次へ」を押すと終了になり、タイマーが止まる', () => {
  const program = buildProgram();
  let state = initialState(T0, program);
  let now = T0;
  // 2試合 × (入場→1R→…→結果) を押し切る
  for (let i = 0; i < 30 && state.phase !== 'finished'; i++) {
    now += 1_000;
    state = reduce(state, program, { type: 'next' }, now).state;
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.eventTimer.mode, 'paused');
  assert.equal(state.roundTimer.mode, 'paused');
});

test('ラウンド開始でラウンドタイマーがその試合の秒数で走る', () => {
  const program = buildProgram();
  const state = run(program, [{ type: 'next' }, { type: 'next' }]);
  assert.equal(state.phase, 'fight');
  assert.equal(state.roundTimer.mode, 'running');
  assert.equal(state.roundTimer.durationMs, 180_000);
});

test('インターバルはその試合のインターバル秒で走る', () => {
  const program = buildProgram();
  const state = run(program, [{ type: 'next' }, { type: 'next' }, { type: 'next' }]);
  assert.equal(state.phase, 'interval');
  assert.equal(state.roundTimer.durationMs, 60_000);
});

test('停止すると、動いていたタイマーが全部止まる', () => {
  const program = buildProgram();
  const state = run(program, [{ type: 'next' }, { type: 'next' }, { type: 'hold' }]);
  assert.equal(state.hold.active, true);
  assert.equal(state.eventTimer.mode, 'paused');
  assert.equal(state.roundTimer.mode, 'paused');
  assert.equal(state.hold.paused.event, true);
  assert.equal(state.hold.paused.round, true);
});

test('停止中は「次へ」を受け付けない（誤操作防止）', () => {
  const program = buildProgram();
  const held = run(program, [{ type: 'next' }, { type: 'next' }, { type: 'hold' }]);
  const result = reduce(held, program, { type: 'next' }, T0 + 100_000);
  assert.equal(result.changed, false);
  assert.equal(result.state.version, held.version);
  assert.match(result.reason ?? '', /停止中/);
});

test('再開すると、止めたタイマーだけが再び動く（止まっていたものは止まったまま）', () => {
  const program = buildProgram();
  let state = run(program, [{ type: 'next' }]); // walkout: roundTimer は idle
  assert.equal(state.roundTimer.mode, 'idle');
  state = reduce(state, program, { type: 'hold' }, T0 + 5_000).state;
  state = reduce(state, program, { type: 'resume' }, T0 + 9_000).state;
  assert.equal(state.hold.active, false);
  assert.equal(state.eventTimer.mode, 'running');
  assert.equal(state.roundTimer.mode, 'idle', '止まっていたラウンドタイマーは勝手に走り出さない');
});

test('停止している間はラウンドの残り時間が減らない', () => {
  const program = buildProgram();
  let state = run(program, [{ type: 'next' }, { type: 'next' }]);
  const before = remainingMs(state.roundTimer, T0 + 3_000);
  state = reduce(state, program, { type: 'hold' }, T0 + 3_000).state;
  assert.equal(remainingMs(state.roundTimer, T0 + 600_000), before);
});

test('停止中でも停止文言だけは変えられる', () => {
  const program = buildProgram();
  let state = run(program, [{ type: 'hold', message: '救護対応中です' }]);
  assert.equal(state.hold.message, '救護対応中です');
  const r = reduce(state, program, { type: 'hold', message: 'まもなく再開します' }, T0 + 60_000);
  assert.equal(r.changed, true);
  assert.equal(r.state.hold.message, 'まもなく再開します');
});

test('試合番号での移動ができる', () => {
  const program = buildProgram();
  const state = run(program, [{ type: 'next' }, { type: 'jump_match', matchNo: 2 }]);
  assert.equal(state.matchIndex, 1);
  assert.equal(state.phase, 'walkout');
  assert.equal(state.round, 1);
  assert.equal(state.roundTimer.durationMs, 120_000);
});

test('存在しない試合番号への移動は拒否され、状態は1ミリも変わらない', () => {
  const program = buildProgram();
  const state = run(program, [{ type: 'next' }]);
  const r = reduce(state, program, { type: 'jump_match', matchNo: 99 }, T0 + 50_000);
  assert.equal(r.changed, false);
  assert.deepEqual(r.state, state);
});

test('曲は独立して進む（試合の進行を巻き込まない）', () => {
  const program = buildProgram();
  let state = run(program, [{ type: 'next' }]);
  const phase = state.phase;
  state = reduce(state, program, { type: 'cue_next' }, T0 + 20_000).state;
  assert.equal(state.cueIndex, 1);
  assert.equal(state.phase, phase);
  state = reduce(state, program, { type: 'cue_start' }, T0 + 21_000).state;
  assert.equal(state.cueTimer.mode, 'running');
  assert.equal(state.cueTimer.durationMs, 60_000);
});

test('最後の曲より先には進めない', () => {
  const program = buildProgram();
  let state = initialState(T0, program);
  for (let i = 0; i < program.cues.length - 1; i++) {
    state = reduce(state, program, { type: 'cue_next' }, T0 + i * 1_000).state;
  }
  const r = reduce(state, program, { type: 'cue_next' }, T0 + 99_000);
  assert.equal(r.changed, false);
  assert.match(r.reason ?? '', /最後の曲/);
});

test('操作するたびに version が1つずつ上がる（全画面の同期判定に使う）', () => {
  const program = buildProgram();
  let state = initialState(T0, program);
  const versions: number[] = [state.version];
  const commands: Command[] = [{ type: 'next' }, { type: 'next' }, { type: 'hold' }, { type: 'resume' }];
  let now = T0;
  for (const c of commands) {
    now += 1_000;
    state = reduce(state, program, c, now).state;
    versions.push(state.version);
  }
  assert.deepEqual(versions, [1, 2, 3, 4, 5]);
});

test('拒否された操作では version が上がらない', () => {
  const program = buildProgram();
  const state = initialState(T0, program);
  const r = reduce(state, program, { type: 'resume' }, T0 + 1_000);
  assert.equal(r.changed, false);
  assert.equal(r.state.version, state.version);
});

test('操作ログ用に、直前の一手が日本語で残る', () => {
  const program = buildProgram();
  const state = run(program, [{ type: 'next' }, { type: 'next' }]);
  assert.equal(state.lastCommand?.type, 'next');
  assert.match(state.lastCommand?.label ?? '', /開始/);
});

test('「次へ」で何が起きるかを事前に日本語で言える', () => {
  const program = buildProgram();
  let state = initialState(T0, program);
  assert.match(nextActionLabel(program, state), /大会を開始/);
  state = reduce(state, program, { type: 'next' }, T0 + 1_000).state;
  assert.match(nextActionLabel(program, state), /試合開始/);
  state = reduce(state, program, { type: 'next' }, T0 + 2_000).state;
  assert.match(nextActionLabel(program, state), /インターバル/);
});

test('番組表を入れ替えても進行中の現在地を失わない', () => {
  const program = buildProgram();
  let state = run(program, [{ type: 'next' }, { type: 'jump_match', matchNo: 2 }]);
  const updated = parseProgram(
    { event: EVENT_CSV, matches: MATCHES_CSV + '\n3,,,,,,新選手,,,,新選手2,,,,', music: MUSIC_CSV },
    T0 + 60_000,
  );
  state = applyProgram(state, updated, program, T0 + 60_000);
  assert.equal(updated.matches[state.matchIndex].no, 2, '第2試合のままであること');
  assert.equal(state.programRevision, updated.revision);
});

test('試合が1件も無い番組表では大会を開始できない', () => {
  const empty = parseProgram({ event: EVENT_CSV, matches: 'no,red_name,blue_name', music: '' }, T0);
  const state = initialState(T0, empty);
  const r = reduce(state, empty, { type: 'start_event' }, T0 + 1_000);
  assert.equal(r.changed, false);
  assert.match(r.reason ?? '', /試合がありません/);
});

test('reduce は元のオブジェクトを書き換えない（純関数）', () => {
  const program = buildProgram();
  const state = initialState(T0, program);
  const snapshot = JSON.stringify(state);
  reduce(state, program, { type: 'next' }, T0 + 1_000);
  assert.equal(JSON.stringify(state), snapshot);
});
