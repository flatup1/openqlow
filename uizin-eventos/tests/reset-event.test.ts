import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commit, newHistory, undo } from '../core/history.ts';
import { initialState, reduce } from '../core/state.ts';
import { remainingMs } from '../core/timer.ts';
import { buildProgram } from './fixtures.ts';

const T0 = 1_700_000_000_000;

function progressedEvent() {
  const program = buildProgram();
  let state = initialState(T0, program);
  state = reduce(state, program, { type: 'jump_match', matchNo: 2 }, T0 + 1_000).state;
  state = reduce(state, program, { type: 'next' }, T0 + 2_000).state;
  state = reduce(state, program, { type: 'cue_next' }, T0 + 3_000).state;
  state = reduce(state, program, { type: 'cue_start' }, T0 + 4_000).state;
  return { program, state };
}

for (const phase of ['fight', 'finished'] as const) {
  test(`${phase} から初期化すると最初の試合・曲へ戻り、番組表を保持してタイマーを止める`, () => {
    let { program, state } = progressedEvent();
    if (phase === 'finished') state = reduce(state, program, { type: 'finish_event' }, T0 + 10_000).state;
    const originalProgram = structuredClone(program);
    const now = T0 + 60_000;
    const result = reduce(state, program, { type: 'reset_event' }, now);

    assert.equal(result.changed, true);
    assert.equal(result.state.phase, 'before');
    assert.equal(result.state.matchIndex, 0);
    assert.equal(result.state.round, 1);
    assert.equal(result.state.cueIndex, 0);
    assert.equal(result.state.hold.active, false);
    for (const timer of [result.state.eventTimer, result.state.roundTimer, result.state.cueTimer]) {
      assert.equal(timer.mode, 'idle');
      assert.equal(timer.elapsedMs, 0);
      assert.equal(timer.startedAt, null);
    }
    assert.equal(remainingMs(result.state.roundTimer, now + 60_000), program.matches[0].roundSeconds * 1000);
    assert.equal(remainingMs(result.state.cueTimer, now + 60_000), program.cues[0].seconds * 1000);
    assert.equal(result.state.programRevision, program.revision);
    assert.equal(result.state.version, state.version + 1);
    assert.equal(result.state.lastCommand?.type, 'reset_event');
    assert.deepEqual(program, originalProgram);
  });
}

test('緊急停止中の初期化は拒否し、停止状態とタイマーを保持する', () => {
  const { program, state } = progressedEvent();
  const held = reduce(state, program, { type: 'hold' }, T0 + 10_000).state;
  const result = reduce(held, program, { type: 'reset_event' }, T0 + 20_000);
  assert.equal(result.changed, false);
  assert.match(result.reason ?? '', /停止中/);
  assert.deepEqual(result.state, held);
});

test('初期化直後のUndoで初期化前の終了状態を復元でき、操作ログも残る', () => {
  const { program, state } = progressedEvent();
  const finished = reduce(state, program, { type: 'finish_event' }, T0 + 10_000).state;
  const reset = reduce(finished, program, { type: 'reset_event' }, T0 + 20_000).state;
  const history = commit(newHistory(finished), reset);
  const result = undo(history, T0 + 30_000);
  assert.equal(result.changed, true);
  const restored = result.history.current;
  assert.equal(restored.phase, 'finished');
  assert.equal(restored.matchIndex, finished.matchIndex);
  assert.equal(restored.cueIndex, finished.cueIndex);
  assert.deepEqual(restored.eventTimer, finished.eventTimer);
  assert.deepEqual(restored.roundTimer, finished.roundTimer);
  assert.deepEqual(restored.cueTimer, finished.cueTimer);
  assert.equal(restored.version, reset.version + 1);
  assert.deepEqual(result.history.log.map(entry => entry.type), ['undo', 'reset_event']);
  assert.equal(undo(result.history, T0 + 40_000).changed, false);
});
