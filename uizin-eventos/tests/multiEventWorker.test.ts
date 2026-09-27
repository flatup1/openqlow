import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';

function env(names: string[]) {
  return {
    EVENT_ID: 'uizin-2026',
    ALLOWED_ORIGINS: '*',
    EVENT_ROOM: {
      idFromName(name: string) { names.push(name); return name; },
      get() { return { fetch: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) }; },
    },
  } as never;
}

test('different event query values use different durable object rooms', async () => {
  const names: string[] = [];
  const environment = env(names);
  await worker.fetch(new Request('https://example.test/api/state?event=narita-kick-2027'), environment);
  await worker.fetch(new Request('https://example.test/api/state?event=flatup-cup-2027'), environment);
  assert.deepEqual(names, ['narita-kick-2027', 'flatup-cup-2027']);
});

test('unsafe event ids cannot escape into another room', async () => {
  const names: string[] = [];
  const environment = env(names);
  const response = await worker.fetch(new Request('https://example.test/api/health?event=../private'), environment);
  const body = await response.json() as { eventId: string };
  assert.equal(body.eventId, 'uizin-2026');
});
