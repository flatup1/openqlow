import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';

const KEY = 'test-operator-key-123';
const SCRIPT = 'https://script.google.com/macros/s/AKfycbx1234567890abcdefghijkl/exec';
const TOKEN = 'abcdefghijkmnpqrstuvwxyz';

function env() {
  return {
    EVENT_ID: 'test-event', ALLOWED_ORIGINS: '*', OPERATOR_KEY: KEY,
    EVENT_ROOM: { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response('{}') }) },
  } as never;
}

async function call(body: unknown, key = KEY, google?: (url: string, init?: RequestInit) => Response) {
  const original = globalThis.fetch;
  const seen: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push({ url, method: init?.method ?? 'GET' });
    return google ? google(url, init) : new Response('no', { status: 500 });
  }) as typeof fetch;
  try {
    const res = await worker.fetch(new Request('https://example.test/api/form-import/read?event=test-event', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-operator-key': key }, body: JSON.stringify(body),
    }), env());
    return { status: res.status, body: await res.json() as Record<string, unknown>, seen };
  } finally { globalThis.fetch = original; }
}

test('操作キーが無ければ読めない', async () => {
  const r = await call({ sheetUrl: SCRIPT, token: TOKEN }, 'wrong');
  assert.equal(r.status, 401);
  assert.equal(r.seen.length, 0);
});

test('読むだけスクリプト経由で読める。個人情報列はサーバーでも外す（二重の守り）', async () => {
  const r = await call({ sheetUrl: SCRIPT, token: TOKEN, tab: 'フォームの回答 2' }, KEY, (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { token: TOKEN, tab: 'フォームの回答 2' });
    return Response.json({ ok: true, tabs: ['フォームの回答 2'], tab: 'フォームの回答 2', headers: ['選手氏名', 'メールアドレス'], rows: [['山田', 'x@example.com']], removedColumns: [] });
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.headers, ['選手氏名']);
  assert.ok(!JSON.stringify(r.body).includes('x@example.com'));
  assert.deepEqual(r.seen.map((s) => s.url), [SCRIPT]);
});

test('合言葉が無い・違うURLには問い合わせない', async () => {
  const noToken = await call({ sheetUrl: SCRIPT });
  assert.equal(noToken.status, 400);
  const evil = await call({ sheetUrl: 'https://evil.example.com/x', token: TOKEN });
  assert.equal(evil.status, 400);
  assert.equal(noToken.seen.length + evil.seen.length, 0);
});

test('Googleのログイン画面や0件は取り込まず、理由を返す', async () => {
  const html = await call({ sheetUrl: SCRIPT, token: TOKEN }, KEY, () => new Response('<!DOCTYPE html><html>login</html>'));
  assert.equal(html.body.ok, false);
  const empty = await call({ sheetUrl: SCRIPT, token: TOKEN }, KEY, () => Response.json({ ok: true, tabs: ['A'], headers: ['選手氏名'], rows: [] }));
  assert.equal(empty.body.ok, false);
  assert.match(String(empty.body.reason), /0件/);
});

test('共有リンク方式は読むだけのCSV書き出しURL(GET)しか使わない', async () => {
  const r = await call({ sheetUrl: 'https://docs.google.com/spreadsheets/d/1TimFyPyXm0pZMXLnGV694eFfatS731fORCjmmUdGkB4/edit', tab: 'フォームの回答 2' }, KEY,
    () => new Response('"選手氏名","メールアドレス"\n"山田","x@example.com"\n'));
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.body.headers, ['選手氏名']);
  assert.equal(r.seen[0].method, 'GET');
  assert.match(r.seen[0].url, /\/gviz\/tq\?tqx=out:csv/);
});
