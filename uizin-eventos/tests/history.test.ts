import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canUndo, commit, newHistory, undo, undoLabel } from '../core/history.ts';
import { initialState, reduce } from '../core/state.ts';
import { buildProgram } from './fixtures.ts';

const T0 = 1_700_000_000_000;

function press(history: ReturnType<typeof newHistory>, program: ReturnType<typeof buildProgram>, now: number) {
  const r = reduce(history.current, program, { type: 'next' }, now);
  return r.changed ? commit(history, r.state) : history;
}

test('最初は元に戻せない', () => {
  const program = buildProgram();
  const history = newHistory(initialState(T0, program));
  assert.equal(canUndo(history), false);
  assert.equal(undo(history, T0).changed, false);
  assert.match(undoLabel(history), /元に戻せる操作はありません/);
});

test('直前の一手だけ元に戻せる', () => {
  const program = buildProgram();
  let history = newHistory(initialState(T0, program));
  history = press(history, program, T0 + 1_000); // walkout
  history = press(history, program, T0 + 2_000); // fight
  assert.equal(history.current.phase, 'fight');

  const result = undo(history, T0 + 3_000);
  assert.equal(result.changed, true);
  assert.equal(result.history.current.phase, 'walkout');
});

test('元に戻すのは1手だけ。2回続けては戻せない', () => {
  const program = buildProgram();
  let history = newHistory(initialState(T0, program));
  history = press(history, program, T0 + 1_000);
  history = press(history, program, T0 + 2_000);
  const first = undo(history, T0 + 3_000);
  assert.equal(first.changed, true);
  const second = undo(first.history, T0 + 4_000);
  assert.equal(second.changed, false);
  assert.match(second.reason ?? '', /元に戻せる操作がありません/);
});

test('元に戻しても version は必ず前に進む（画面が古い状態を掴まない）', () => {
  const program = buildProgram();
  let history = newHistory(initialState(T0, program));
  history = press(history, program, T0 + 1_000);
  history = press(history, program, T0 + 2_000);
  const before = history.current.version;
  const result = undo(history, T0 + 3_000);
  assert.equal(result.history.current.version, before + 1);
});

test('操作ログが新しい順に積み上がる', () => {
  const program = buildProgram();
  let history = newHistory(initialState(T0, program));
  history = press(history, program, T0 + 1_000);
  history = press(history, program, T0 + 2_000);
  const result = undo(history, T0 + 3_000);
  assert.equal(result.history.log[0].type, 'undo');
  assert.equal(result.history.log[1].type, 'next');
  assert.match(result.history.log[0].label, /元に戻す/);
});

test('元に戻すボタンには、何が戻るのかを書ける', () => {
  const program = buildProgram();
  let history = newHistory(initialState(T0, program));
  history = press(history, program, T0 + 1_000);
  assert.match(undoLabel(history), /元に戻す: /);
});
