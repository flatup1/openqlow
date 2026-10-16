/**
 * CSVを直接貼って番組表を入れ替える道（/api/program/upload）の通し確認。
 *
 * Google スプレッドシートに届かない日でも大会を開けるようにするための入口。
 * ここが壊れていると「当日、番組表が入らない」に直結するので、
 * 受け口（Worker）と保管庫（Durable Object）をつないだ状態で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';
import { EventRoom } from '../worker/event-do.ts';
import type { Snapshot } from '../core/types.ts';

const KEY = 'test-operator-key';

function env() {
  const saved = new Map();
  const ctx = {
    blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
    storage: { get: async (k: string) => saved.get(k), put: async (k: string, v: unknown) => { saved.set(k, v); } },
    getWebSockets: () => [],
  };
  const instance = new EventRoom(ctx as never, {});
  return {
    OPERATOR_KEY: KEY,
    ALLOWED_ORIGINS: '*',
    EVENT_ROOM: { idFromName: () => 'room', get: () => instance },
  } as never;
}

const upload = (e: unknown, body: unknown, key = KEY) =>
  worker.fetch(
    new Request('https://api.test/api/program/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-operator-key': key },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    e as never,
  );

const state = (e: unknown): Promise<Snapshot> =>
  worker.fetch(new Request('https://api.test/api/state'), e as never).then((r) => r.json() as Promise<Snapshot>);

const CSV = {
  event: 'key,value\ntitle,UIZIN 2026',
  matches: 'no,red_name,blue_name\n1,RED1,BLUE1\n2,RED2,BLUE2\n3,RED3,BLUE3',
  music: 'no,kind,title,music_url\n1,walkout_red,赤の曲,https://music.apple.com/jp/song/monkey-wrench/334812033',
};

test('シートを使わずCSVを貼るだけで、番組表が入る', async () => {
  const e = env();
  const res = await upload(e, CSV);
  assert.equal(res.status, 200);
  const snapshot = await state(e);
  assert.equal(snapshot.program.matches.length, 3);
  assert.equal(snapshot.program.cues.length, 1);
  assert.equal(snapshot.program.meta.title, 'UIZIN 2026');
});

test('合言葉が無ければ取り込めない（見ているだけの端末から書き換えられない）', async () => {
  const e = env();
  await upload(e, CSV);
  const before = await state(e);
  assert.equal((await upload(e, { ...CSV, matches: 'no,red_name,blue_name\n1,X,Y' }, 'wrong')).status, 401);
  assert.deepEqual((await state(e)).program, before.program);
});

test('matches が空のときは取り込まず、いまの番組表を残す', async () => {
  const e = env();
  await upload(e, CSV);
  const before = await state(e);
  assert.equal((await upload(e, { ...CSV, matches: '   ' })).status, 400);
  assert.deepEqual((await state(e)).program, before.program);
});

test('試合を1件も読み取れないCSVでは上書きしない（進行中の対戦カードを消さない）', async () => {
  const e = env();
  await upload(e, CSV);
  const before = await state(e);
  const res = await upload(e, { ...CSV, matches: 'no,red_name,blue_name' });
  assert.equal(res.status, 409);
  assert.deepEqual((await state(e)).program, before.program);
});

test('Googleのログイン画面のHTMLを貼っても、番組表が空にならない', async () => {
  const e = env();
  await upload(e, CSV);
  const before = await state(e);
  await upload(e, { ...CSV, matches: '<!doctype html><html><body>accounts.google.com/ServiceLogin</body></html>' });
  assert.deepEqual((await state(e)).program, before.program);
});

test('壊れた本文でも 500 にせず、何を直せばよいかを返す', async () => {
  const e = env();
  const res = await upload(e, '{これはJSONではない');
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; reason: string };
  assert.equal(body.ok, false);
  assert.match(body.reason, /貼り直して/);
});

test('取り込み直後も、進行そのものは最初から始められる', async () => {
  const e = env();
  await upload(e, CSV);
  const before = await state(e);
  const res = await worker.fetch(
    new Request('https://api.test/api/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-operator-key': KEY },
      body: JSON.stringify({ command: { type: 'next' }, expectedVersion: before.state.version }),
    }),
    e as never,
  );
  assert.equal(res.status, 200);
  assert.equal((await state(e)).state.version, before.state.version + 1);
});
