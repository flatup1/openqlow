import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_TTL_MS, canQueue, decidePending, waitCountdownLabel } from '../core/pendingCommand.ts';
import type { PendingCommand } from '../core/pendingCommand.ts';
import { canOperate } from '../core/operatorSafety.ts';

const at = (queuedAt: number, expectedVersion = 7): PendingCommand => ({
  command: { type: 'next' },
  label: '第3試合へ',
  expectedVersion,
  queuedAt,
});

test('預かっていなければ、何もしない', () => {
  assert.deepEqual(decidePending(null, true, 1_000), { kind: 'idle' });
});

test('通信が戻ったら、預かったコマンドを送る', () => {
  const pending = at(1_000);
  assert.deepEqual(decidePending(pending, true, 3_000), { kind: 'send', pending });
});

test('通信が戻るまでは送らず、残り時間を出す', () => {
  const decision = decidePending(at(1_000), false, 3_000);
  assert.equal(decision.kind, 'wait');
  assert.equal(decision.kind === 'wait' ? decision.remainingMs : -1, PENDING_TTL_MS - 2_000);
});

test('90秒たったら、送らずに捨てる（忘れた頃に勝手に進まない）', () => {
  const decision = decidePending(at(1_000), false, 1_000 + PENDING_TTL_MS);
  assert.equal(decision.kind, 'expired');
});

test('時間切れのほうが優先。通信が戻っても、90秒前の「次へ」は送らない', () => {
  const decision = decidePending(at(1_000), true, 1_000 + PENDING_TTL_MS + 5_000);
  assert.equal(decision.kind, 'expired', '古い操作が復帰と同時に飛んでいる');
});

test('端末の時計が巻き戻っても、永久に待ち続けない', () => {
  const decision = decidePending(at(10_000), false, 1_000);
  assert.equal(decision.kind, 'wait');
  assert.equal(decision.kind === 'wait' ? decision.remainingMs : -1, PENDING_TTL_MS);
});

test('押した時点の版を貼り付けたまま送る（サーバーの版チェックを外さない）', () => {
  const decision = decidePending(at(1_000, 42), true, 2_000);
  assert.equal(decision.kind === 'send' ? decision.pending.expectedVersion : -1, 42);
});

const base = { hasKey: true, uncertain: false, held: false, canSendNow: false, pending: null };

test('通信が切れているときだけ、預かりを申し出る', () => {
  assert.equal(canQueue(base), true);
});

test('いま送れるなら預からない（そのまま送る）', () => {
  assert.equal(canQueue({ ...base, canSendNow: true }), false);
});

test('合言葉が無い端末では預からない', () => {
  assert.equal(canQueue({ ...base, hasKey: false }), false);
});

test('直前の結果が分からないときは預からない（二重進行を作らない）', () => {
  assert.equal(canQueue({ ...base, uncertain: true }), false);
});

test('緊急停止中は預からない', () => {
  assert.equal(canQueue({ ...base, held: true }), false);
});

test('2つめは預からない（押した数だけ進むのが事故）', () => {
  assert.equal(canQueue({ ...base, pending: at(1_000) }), false);
});

test('canOperate が false の状況と、預かりを申し出る状況が一致している', () => {
  // 12秒より古い状態しか無い端末＝これまでボタンが灰色になっていた場面
  const now = 100_000;
  const canSendNow = canOperate('offline', true, now - 30_000, now);
  assert.equal(canSendNow, false);
  assert.equal(canQueue({ ...base, canSendNow }), true);
});

test('通信が生きている間は、これまでどおり即送信のまま（挙動を変えない）', () => {
  const now = 100_000;
  const canSendNow = canOperate('live', true, now - 500, now);
  assert.equal(canSendNow, true);
  assert.equal(canQueue({ ...base, canSendNow }), false);
});

test('残り時間は切り上げて出す（0秒と出さない）', () => {
  assert.equal(waitCountdownLabel(1), 'あと1秒で取り消します');
  assert.equal(waitCountdownLabel(0), 'あと1秒で取り消します');
  assert.equal(waitCountdownLabel(2_400), 'あと3秒で取り消します');
});
