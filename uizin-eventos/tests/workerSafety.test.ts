import test from 'node:test';
import assert from 'node:assert/strict';
import { EventRoom } from '../worker/event-do.ts';
import type { Snapshot } from '../core/types.ts';

function room() {
  const saved = new Map();
  const ctx = {
    blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
    storage: { get: async (key: string) => saved.get(key), put: async (key: string, value: unknown) => { saved.set(key, value); } },
    getWebSockets: () => [],
  };
  return new EventRoom(ctx as never, {});
}
const command = (r: EventRoom, body: unknown) => r.fetch(new Request('https://local/command', { method: 'POST', body: JSON.stringify(body) }));
const snapshot = (r: EventRoom): Promise<Snapshot> => r.fetch(new Request('https://local/snapshot')).then(x => x.json() as Promise<Snapshot>);

test('server rejects missing/stale versions without modifying persisted state', async () => {
  const r = room();
  const before = await snapshot(r);
  assert.equal((await command(r, { command: { type: 'reset_event' } })).status, 409);
  assert.equal((await command(r, { command: { type: 'reset_event' }, expectedVersion: before.state.version - 1 })).status, 409);
  const after = await snapshot(r);
  assert.deepEqual(after.state, before.state);
});
test('two simultaneous clients on the same version can change state only once', async () => {
  const r = room();
  const s = await snapshot(r);
  const body = { command: { type: 'reset_event' }, expectedVersion: s.state.version };
  const replies = await Promise.all([command(r, body), command(r, body)]);
  assert.deepEqual(replies.map(x => x.status).sort(), [200, 409]);
  const current = await snapshot(r);
  assert.equal(current.state.version, s.state.version + 1);
});
test('emergency hold works from stale client but stale resume and undo are refused', async () => {
  const r = room();
  assert.equal((await command(r, { command: { type: 'hold' } })).status, 200);
  assert.equal((await command(r, { command: { type: 'resume' }, expectedVersion: 0 })).status, 409);
  assert.equal((await r.fetch(new Request('https://local/undo', { method: 'POST' }))).status, 409);
  const s = await snapshot(r);
  assert.equal(s.state.hold.active, true);
  assert.equal((await r.fetch(new Request('https://local/undo', { method: 'POST', body: JSON.stringify({ expectedVersion: s.state.version }) }))).status, 409);
  assert.equal((await command(r, { command: { type: 'resume' }, expectedVersion: s.state.version })).status, 200);
});
