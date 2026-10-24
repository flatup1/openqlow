// 短い申込URL（/a/コード）。行き先の決まり・コードの字・Workerの道筋（作る・固定・開く・大会の部屋と古い長いURLに触らない）。
// 大会名・URL・キーは、ぜんぶ架空。
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';
import { ShortLinks } from '../worker/short-links-do.ts';
import { isShortLinkTarget, SHORT_CODE_ALPHABET, SHORT_CODE_LENGTH, SHORT_CODE_PATTERN, shortCodeChars } from '../core/shortLink.ts';

const KEY = 'example-operator-key-0001';
const WORKER = 'https://worker.example.test';
const APPLY = 'https://tournament-os-v3.pages.dev/apply/#endpoint=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FEXAMPLE%2Fexec&pl=%E6%9E%B6%E7%A9%BA';
const APPLY_NEW = APPLY + '&plt=2';

test('行き先は、申込ページ（/apply/#…）だけ。よその場所・http・別のページ・ハッシュなしは通さない', () => {
  assert.equal(isShortLinkTarget(APPLY), true);
  assert.equal(isShortLinkTarget('https://c036b341.tournament-os-v3.pages.dev/apply/#a=1'), true, 'プレビューの別名も通る');
  for (const bad of [
    'http://tournament-os-v3.pages.dev/apply/#a=1',
    'https://tournament-os-v3.pages.dev.example.test/apply/#a=1',
    'https://xtournament-os-v3.pages.dev/apply/#a=1',
    'https://tournament-os-v3.pages.dev/private/setup/#a=1',
    'https://tournament-os-v3.pages.dev/apply/',
    'https://user@tournament-os-v3.pages.dev/apply/#a=1',
    'https://tournament-os-v3.pages.dev:8443/apply/#a=1',
    'not a url',
    '',
    APPLY + 'x'.repeat(8000),
  ]) assert.equal(isShortLinkTarget(bad), false, bad.slice(0, 60));
});

test('コードの字は、読み間違えやすい 0・1・i・l・o を使わない。字の出やすさはそろう', () => {
  assert.equal(SHORT_CODE_ALPHABET.length, 31);
  for (const ch of '01ilo') assert.equal(SHORT_CODE_ALPHABET.includes(ch), false, ch);
  assert.equal(shortCodeChars([0, 1, 31, 248, 255]), '232', '248以上は捨て、0・1・31は順に2・3・2');
  const all = shortCodeChars(Array.from({ length: 256 }, (_, i) => i));
  assert.equal(all.length, 248, '256のうち、あまりの8つは捨てる');
  assert.match(all, /^[2-9a-hjkmnp-z]+$/);
  assert.equal(SHORT_CODE_LENGTH, 8);
  assert.equal(SHORT_CODE_PATTERN.test('23456789'), true);
  assert.equal(SHORT_CODE_PATTERN.test('2345678'), false, '7字は短すぎる');
  assert.equal(SHORT_CODE_PATTERN.test('a0b1c2d3'), false, '0と1は使わない');
  assert.equal(SHORT_CODE_PATTERN.test('abcdefgi'), false, 'i は使わない');
});

function storeFake() {
  const data = new Map<string, unknown>();
  const storage = {
    async get(key: string) { return data.get(key); },
    async put(entries: Record<string, unknown>) { for (const [k, v] of Object.entries(entries)) data.set(k, v); },
  };
  return { data, storage };
}

function environment(options: { store?: boolean } = {}) {
  const box = storeFake();
  const shortLinks = new ShortLinks({ storage: box.storage } as never, {});
  const roomNames: string[] = [];
  const env = {
    EVENT_ID: 'uizin-2026',
    ALLOWED_ORIGINS: '*',
    OPERATOR_KEY: KEY,
    EVENT_ROOM: {
      idFromName(name: string) { roomNames.push(name); return name; },
      get() { return { fetch: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) }; },
    },
    ...(options.store === false ? {} : {
      SHORT_LINKS: {
        idFromName(name: string) { return name; },
        get() { return { fetch: (request: Request) => shortLinks.fetch(request) }; },
      },
    }),
  };
  return { env: env as never, data: box.data, roomNames };
}

const post = (body: unknown, key: string | null = KEY, query = '') => new Request(WORKER + '/api/short-links' + query, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(key === null ? {} : { 'x-operator-key': key }) },
  body: JSON.stringify(body),
});
const open = (code: string) => new Request(WORKER + '/a/' + code);

test('短いURLは、操作キーがあるときだけ作れる。キーが無い・違うときは、何も保存しない', async () => {
  const { env, data } = environment();
  assert.equal((await worker.fetch(post({ mode: 'live', target: APPLY }, null), env)).status, 401);
  assert.equal((await worker.fetch(post({ mode: 'live', target: APPLY }, 'wrong-key'), env)).status, 401);
  assert.equal(data.size, 0, '断ったあとは、何も残っていない');
});

test('作った短いURLを開くと、申込ページへ転送される（#の中身もそのまま）。大会の部屋には触らない', async () => {
  const { env, roomNames } = environment();
  const made = await worker.fetch(post({ mode: 'live', target: APPLY }), env);
  assert.equal(made.status, 200);
  const body = await made.json() as { ok: boolean; mode: string; code: string; url: string };
  assert.equal(body.ok, true);
  assert.equal(body.mode, 'live');
  assert.match(body.code, SHORT_CODE_PATTERN);
  assert.equal(body.url, WORKER + '/a/' + body.code);
  const opened = await worker.fetch(open(body.code), env);
  assert.equal(opened.status, 302);
  assert.equal(opened.headers.get('location'), APPLY);
  assert.equal(opened.headers.get('cache-control'), 'no-store');
  assert.deepEqual(roomNames, [], '大会の部屋（EventRoom）には、一度も触っていない');
});

test('同じ大会・同じモードの短いURLは、行き先を入れ直しても同じコードのまま。配ったURLの行き先だけが新しくなる', async () => {
  const { env } = environment();
  const first = await (await worker.fetch(post({ mode: 'live', target: APPLY }), env)).json() as { code: string };
  const second = await (await worker.fetch(post({ mode: 'live', target: APPLY_NEW }), env)).json() as { code: string };
  assert.equal(second.code, first.code);
  const opened = await worker.fetch(open(first.code), env);
  assert.equal(opened.headers.get('location'), APPLY_NEW);
});

test('大会が違うか、テストのモードなら、別のコードになる', async () => {
  const { env } = environment();
  const live = await (await worker.fetch(post({ mode: 'live', target: APPLY }), env)).json() as { code: string };
  const testMode = await (await worker.fetch(post({ mode: 'test', target: APPLY }), env)).json() as { code: string };
  const otherEvent = await (await worker.fetch(post({ mode: 'live', target: APPLY }, KEY, '?event=flatup-cup-2027'), env)).json() as { code: string };
  assert.notEqual(testMode.code, live.code);
  assert.notEqual(otherEvent.code, live.code);
});

test('申込ページのURLでないもの・知らないモード・モードの無いものは、作らない', async () => {
  const { env, data } = environment();
  assert.equal((await worker.fetch(post({ mode: 'live', target: 'https://evil.example.test/apply/#a=1' }), env)).status, 400);
  assert.equal((await worker.fetch(post({ mode: 'other', target: APPLY }), env)).status, 400);
  assert.equal((await worker.fetch(post({ target: APPLY }), env)).status, 400);
  assert.equal(data.size, 0);
});

test('箱そのものも、申込ページ以外の行き先は受け取らない（直接つないでも）', async () => {
  const box = storeFake();
  const shortLinks = new ShortLinks({ storage: box.storage } as never, {});
  const bad = await shortLinks.fetch(new Request('https://short-links/slot', {
    method: 'PUT', body: JSON.stringify({ slot: 'uizin-2026:live', target: 'https://evil.example.test/' }),
  }));
  assert.equal(bad.status, 400);
  assert.equal(box.data.size, 0);
});

test('知らないコード・形の違うコードは、転送せず 404。箱が無いときは 503。大会の既存の道は、箱が無くても動く', async () => {
  const { env } = environment();
  assert.equal((await worker.fetch(open('zzzzzzzz'), env)).status, 404, '知らないコード');
  assert.equal((await worker.fetch(open('0000000o'), env)).status, 404, '形が違う');
  const noBox = environment({ store: false }).env;
  assert.equal((await worker.fetch(open('zzzzzzzz'), noBox)).status, 503);
  assert.equal((await worker.fetch(post({ mode: 'live', target: APPLY }), noBox)).status, 503);
  assert.equal((await worker.fetch(new Request(WORKER + '/api/health'), noBox)).status, 200);
});

test('短いURLを作る画面（運営用）は Worker が配る。鍵の値は画面に入らず、Pagesの準備画面には何も足さない', async () => {
  const { env } = environment();
  const page = await worker.fetch(new Request(WORKER + '/short-link'), env);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') ?? '', /text\/html/);
  const csp = page.headers.get('content-security-policy') ?? '';
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'/, '呼ぶのは自分（Worker）だけ');
  assert.equal(page.headers.get('x-robots-tag'), 'noindex');
  const html = await page.text();
  assert.match(html, /\/api\/short-links/);
  assert.equal(html.includes(KEY), false, '鍵の値は、画面にもコードにも入っていない');
});

test('申込ページの画面（Pages）から、操作キーの付いた呼び出しを受け付ける（事前の確認も通る）', async () => {
  const { env } = environment();
  const preflight = await worker.fetch(new Request(WORKER + '/api/short-links', {
    method: 'OPTIONS',
    headers: { origin: 'https://tournament-os-v3.pages.dev', 'access-control-request-headers': 'content-type,x-operator-key' },
  }), env);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /x-operator-key/);
});
