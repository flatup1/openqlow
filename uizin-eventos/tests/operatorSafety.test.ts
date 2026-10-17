import test from 'node:test';
import assert from 'node:assert/strict';
import { canOperate, createOperationGate, shortcut } from '../core/operatorSafety.ts';

test('only fresh synchronized state plus a key permits operations', () => {
  for (const c of ['offline', 'connecting']) assert.equal(canOperate(c, true, 1000, 2000), false);
  for (const c of ['live', 'polling']) {
    assert.equal(canOperate(c, true, 1000, 2000), true);
    assert.equal(canOperate(c, false, 1000, 2000), false);
    assert.equal(canOperate(c, true, 1000, 13000), false);
    assert.equal(canOperate(c, true, 0, 2000), false);
    assert.equal(canOperate(c, true, 3000, 2000), false);
  }
});
test('same-tick click + shortcut and rapid repeat issue only one operation', () => {
  const g = createOperationGate();
  assert.equal(g.acquire(1000), true);
  assert.equal(g.acquire(1000), false);
  assert.equal(g.acquire(99999), false);
  g.release(100000);
  assert.equal(g.acquire(100799), false);
  assert.equal(g.acquire(100800), true);
});
test('Esc never resumes; holding keys and interactive elements do not double dispatch', () => {
  assert.equal(shortcut('Escape', false, false, false), 'hold');
  assert.equal(shortcut('Escape', false, false, true), null);
  assert.equal(shortcut('Space', false, false, false), 'next');
  assert.equal(shortcut('Space', false, false, true), null);
  for (const code of ['Space', 'Escape']) {
    assert.equal(shortcut(code, true, false, false), null);
    assert.equal(shortcut(code, false, true, false), null);
  }
});
