import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimeoutError, fetchWithDeadline, timeoutSignal } from '../core/net.ts';

const ok = () => new Response('{}', { status: 200 });

test('AbortSignal.timeout がある環境では、それをそのまま使う', () => {
  const signal = timeoutSignal(50);
  assert.ok(signal instanceof AbortSignal);
});

test('AbortSignal.timeout が無い古い Safari でも、signal を作れる（例外を投げない）', async () => {
  const signal = timeoutSignal(20, { AbortController });
  assert.ok(signal, 'AbortController から作り直せていない');
  assert.equal(signal?.aborted, false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(signal?.aborted, true, '時間が来ても中断されていない');
});

test('AbortSignal.timeout が例外を投げる環境でも、代わりの signal を返す', () => {
  const throwing = {
    timeout() {
      throw new TypeError('not implemented');
    },
  } as unknown as typeof AbortSignal;
  const signal = timeoutSignal(20, { AbortSignal: throwing, AbortController });
  assert.ok(signal instanceof AbortSignal);
});

test('AbortController すら無い環境では undefined を返す（ここで落とさない）', () => {
  assert.equal(timeoutSignal(20, {}), undefined);
});

test('通信が固まっても、必ず時間切れで返ってくる（画面が止まらない）', async () => {
  const hangs = () => new Promise<Response>(() => {});
  await assert.rejects(() => fetchWithDeadline(hangs, 'https://example.test/', 30), TimeoutError);
});

test('中断できない古い環境でも、時間切れになる', async () => {
  const hangs = () => new Promise<Response>(() => {});
  await assert.rejects(
    () => fetchWithDeadline(hangs, 'https://example.test/', 30, { signal: undefined }),
    (e: unknown) => e instanceof TimeoutError,
  );
});

test('時間内に返れば、その応答をそのまま返す', async () => {
  const res = await fetchWithDeadline(async () => ok(), 'https://example.test/', 500);
  assert.equal(res.status, 200);
});

test('呼び出し側が渡した signal を、時間切れ用の signal で上書きしない', async () => {
  const controller = new AbortController();
  let seen: AbortSignal | null | undefined;
  await fetchWithDeadline(
    async (_url, init) => {
      seen = init?.signal as AbortSignal | undefined;
      return ok();
    },
    'https://example.test/',
    500,
    { signal: controller.signal },
  );
  assert.equal(seen, controller.signal);
});

test('時間内に終われば、待ち続けるタイマーを残さない', async () => {
  const before = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
  await fetchWithDeadline(async () => ok(), 'https://example.test/', 60_000);
  const after = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
  assert.equal(after, before, '時間切れタイマーが片付いていない');
});
