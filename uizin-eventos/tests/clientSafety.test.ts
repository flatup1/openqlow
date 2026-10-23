import test from 'node:test';
import assert from 'node:assert/strict';
import { sendCommand, sendUndo } from '../app/lib/client.ts';

test('network failure is uncertain and never automatically retried', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    calls++;
    assert.ok(options.signal, 'request has a bounded timeout');
    assert.equal(JSON.parse(String(options.body)).expectedVersion, 42);
    throw new Error('response lost');
  });
  const result = await sendCommand({ type: 'next' }, 42);
  assert.equal(result.ok, false);
  assert.equal(result.uncertain, true);
  assert.equal(calls, 1);
});
test('undo carries the version the operator saw', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    assert.equal(JSON.parse(String(options.body)).expectedVersion, 9);
    return new Response(JSON.stringify({ ok: true }));
  });
  assert.equal((await sendUndo(9)).ok, true);
});
