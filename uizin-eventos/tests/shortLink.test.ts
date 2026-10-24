// 短い申込URL（/a/コード）。行き先の決まり・コードの字・枠（大会ID:モード）をリンクの中身から決めること・Workerの道筋（作る・固定・開く・大会の部屋と古い長いURLに触らない）・
// 作る画面（操作キーを端末に残さない・テストのURLを大きく知らせる）。大会名・URL・キーは、ぜんぶ架空。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../worker/index.ts';
import { ShortLinks } from '../worker/short-links-do.ts';
import { SHORT_LINK_PAGE } from '../worker/short-link-page.ts';
import { publicEntryHash, type PublicEntryConfig } from '../core/publicEntry.ts';
import { isShortLinkTarget, SHORT_CODE_ALPHABET, SHORT_CODE_LENGTH, SHORT_CODE_PATTERN, SHORT_LINK_SLOT_PATTERN, shortCodeChars, shortLinkSlot } from '../core/shortLink.ts';

const KEY = 'example-operator-key-0001';
const WORKER = 'https://worker.example.test';

/** 本物と同じ作り方のリンク（core/publicEntry.ts の publicEntryHash）。大会ID・名前・URLは架空 */
const BASE: PublicEntryConfig = {
  endpoint: 'https://script.google.com/macros/s/EXAMPLEKEY/exec', eventId: 'tos-example001', title: '架空大会', organizer: '架空主催', date: '2027年10月3日',
  venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '架空連絡先', music: false, grade: 'optional', age: 'optional', comment: 'optional', protocol: '3', mode: 'live',
};
const link = (over: Partial<PublicEntryConfig> = {}) => 'https://tournament-os-v3.pages.dev/apply/' + publicEntryHash({ ...BASE, ...over });
const APPLY = link();
const APPLY_NEW = link({ title: '架空大会（作り直し）' });
const APPLY_TEST = link({ mode: 'test' });
const APPLY_OTHER = link({ eventId: 'tos-example002', title: '別の架空大会' });
const href = (url: string) => new URL(url).href;

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

test('枠（大会ID:モード）は、リンクの中身から決まる。本番とテストは別の枠。切れたリンク・大会IDが読めないリンクは、枠にならない', () => {
  const live = shortLinkSlot(APPLY);
  assert.ok(live.ok);
  assert.equal(live.slot, 'tos-example001:live');
  assert.equal(live.mode, 'live');
  assert.equal(live.title, '架空大会');
  assert.equal(live.href, href(APPLY));
  const test_ = shortLinkSlot(APPLY_TEST);
  assert.ok(test_.ok);
  assert.equal(test_.slot, 'tos-example001:test');
  assert.equal(test_.mode, 'test');
  assert.notEqual(test_.slot, live.slot, 'テストのURLは、本番とは別の枠');
  assert.equal((shortLinkSlot(APPLY_OTHER) as { slot: string }).slot, 'tos-example002:live', '別の大会は、別の枠');
  assert.equal((shortLinkSlot(link({ eventId: 'TOS-Example001' })) as { slot: string }).slot, 'tos-example001:live', '大会IDの大文字・小文字は、同じ枠');
  assert.match((live as { slot: string }).slot, SHORT_LINK_SLOT_PATTERN);

  // 切れたリンク：最後の目印（end=1）が無い／本番かテストが無い／受付のURLが受付のものではない／途中で切れている
  assert.deepEqual(shortLinkSlot(APPLY.replace(/&end=1$/, '')), { ok: false, reason: 'cut' });
  assert.deepEqual(shortLinkSlot(APPLY.replace(/&mode=live/, '')), { ok: false, reason: 'cut' });
  assert.deepEqual(shortLinkSlot(link({ endpoint: 'https://evil.example.test/exec' })), { ok: false, reason: 'cut' });
  assert.deepEqual(shortLinkSlot(APPLY.slice(0, APPLY.length - 25)), { ok: false, reason: 'cut' });
  // 大会IDが読めない：空・短すぎる・使えない字（空のときに、読む側が入れる既定の名前の枠にも、ならない）
  for (const bad of ['', 'a', 'not valid!', 'x'.repeat(60)]) assert.deepEqual(shortLinkSlot(link({ eventId: bad })), { ok: false, reason: 'event' }, JSON.stringify(bad));
  // 申込ページのURLではない
  assert.deepEqual(shortLinkSlot('https://evil.example.test/apply/#a=1'), { ok: false, reason: 'target' });
  assert.deepEqual(shortLinkSlot(''), { ok: false, reason: 'target' });
});

test('枠の href は、URLとして整えた形：貼り付けで入った改行・タブが取れる', () => {
  const dirty = APPLY.slice(0, 90) + '\n' + APPLY.slice(90, 150) + '\t' + APPLY.slice(150, 200) + '\r\n' + APPLY.slice(200);
  const slot = shortLinkSlot(dirty);
  assert.ok(slot.ok);
  assert.equal(/[\n\r\t]/.test(slot.href), false);
  assert.equal(slot.href, href(APPLY));
  assert.equal(slot.slot, 'tos-example001:live');
});

function storeFake() {
  const data = new Map<string, unknown>();
  const storage = {
    async get(key: string) { return data.get(key); },
    async put(entries: Record<string, unknown>) { for (const [k, v] of Object.entries(entries)) data.set(k, v); },
  };
  return { data, storage };
}

function environment(options: { store?: boolean; storeFetch?: (request: Request) => Promise<Response> } = {}) {
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
        get() { return { fetch: options.storeFetch ?? ((request: Request) => shortLinks.fetch(request)) }; },
      },
    }),
  };
  return { env: env as never, data: box.data, roomNames, shortLinks };
}

const post = (body: unknown, key: string | null = KEY, query = '') => new Request(WORKER + '/api/short-links' + query, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(key === null ? {} : { 'x-operator-key': key }) },
  body: JSON.stringify(body),
});
const open = (code: string) => new Request(WORKER + '/a/' + code);
type Made = { ok: boolean; mode?: string; title?: string; code: string; url: string; reason?: string };
const make = async (env: never, body: unknown, query = ''): Promise<Made> => (await worker.fetch(post(body, KEY, query), env)).json() as Promise<Made>;

test('短いURLは、操作キーがあるときだけ作れる。キーが無い・違うときは、何も保存しない', async () => {
  const { env, data } = environment();
  assert.equal((await worker.fetch(post({ target: APPLY }, null), env)).status, 401);
  assert.equal((await worker.fetch(post({ target: APPLY }, 'wrong-key'), env)).status, 401);
  assert.equal(data.size, 0, '断ったあとは、何も残っていない');
});

test('作った短いURLを開くと、申込ページへ転送される（#の中身もそのまま）。大会の部屋には触らない', async () => {
  const { env, roomNames } = environment();
  const made = await worker.fetch(post({ target: APPLY }), env);
  assert.equal(made.status, 200);
  const body = await made.json() as Made;
  assert.equal(body.ok, true);
  assert.equal(body.mode, 'live', 'モードは、リンクの中身で決まる（送らなくてよい）');
  assert.equal(body.title, '架空大会', '画面が、どの大会かを見せられる');
  assert.match(body.code, SHORT_CODE_PATTERN);
  assert.equal(body.url, WORKER + '/a/' + body.code);
  const opened = await worker.fetch(open(body.code), env);
  assert.equal(opened.status, 302);
  assert.equal(opened.headers.get('location'), href(APPLY));
  assert.equal(opened.headers.get('cache-control'), 'no-store');
  assert.deepEqual(roomNames, [], '大会の部屋（EventRoom）には、一度も触っていない');
});

test('同じ大会・同じモードの短いURLは、行き先を入れ直しても同じコードのまま。配ったURLの行き先だけが新しくなる', async () => {
  const { env } = environment();
  const first = await make(env, { target: APPLY });
  const second = await make(env, { target: APPLY_NEW });
  assert.equal(second.code, first.code);
  assert.equal((await worker.fetch(open(first.code), env)).headers.get('location'), href(APPLY_NEW));
});

test('大会が違えば、別のコード。画面の ?event= や、Workerの EVENT_ID は、枠に関係しない', async () => {
  const { env } = environment();
  const live = await make(env, { target: APPLY });
  const other = await make(env, { target: APPLY_OTHER });
  assert.notEqual(other.code, live.code, '別の大会は、別のコード');
  const withQuery = await make(env, { target: APPLY }, '?event=flatup-cup-2027');
  assert.equal(withQuery.code, live.code, '?event= を付けても、枠は変わらない（別の大会の短いURLを、上書きできない）');
  assert.equal((await worker.fetch(open(live.code), env)).headers.get('location'), href(APPLY), '別の大会を作っても、前の大会の行き先は、そのまま');
  assert.equal((await worker.fetch(open(other.code), env)).headers.get('location'), href(APPLY_OTHER));
});

test('テスト用のURLは、別の枠・別のコード。配ったあとの本番の短いURLの行き先は、決して変わらない', async () => {
  const { env } = environment();
  const live = await make(env, { target: APPLY });
  const testMade = await make(env, { target: APPLY_TEST });
  assert.equal(testMade.mode, 'test');
  assert.notEqual(testMade.code, live.code);
  // テストのURLを何度作り直しても、本番のコードの行き先は、そのまま
  await make(env, { target: link({ mode: 'test', title: '架空大会（テストの作り直し）' }) });
  assert.equal((await worker.fetch(open(live.code), env)).headers.get('location'), href(APPLY));
  // 本番のモードで送っても、テストのURLなら、本番の枠には入らない（これが、以前の「いつも live」の穴）
  const refused = await worker.fetch(post({ mode: 'live', target: APPLY_TEST }), env);
  assert.equal(refused.status, 400);
  assert.match(((await refused.json()) as Made).reason ?? '', /テスト用.*本番用/);
  assert.equal((await worker.fetch(open(live.code), env)).headers.get('location'), href(APPLY), '断られたあとも、本番の行き先は、そのまま');
  // 逆も同じ：本番のURLを、テストとして作ることはできない
  assert.equal((await worker.fetch(post({ mode: 'test', target: APPLY }), env)).status, 400);
});

test('モードを送ってきたときは、リンクの中身と同じときだけ作る。知らないモードは断る。送らなくてもよい', async () => {
  const { env, data } = environment();
  assert.equal((await worker.fetch(post({ mode: 'live', target: APPLY }), env)).status, 200);
  assert.equal((await worker.fetch(post({ mode: 'test', target: APPLY_TEST }), env)).status, 200);
  assert.equal((await worker.fetch(post({ target: APPLY }), env)).status, 200, '送らなくてもよい');
  const before = data.size;
  assert.equal((await worker.fetch(post({ mode: 'other', target: APPLY }), env)).status, 400);
  assert.equal((await worker.fetch(post({ mode: 'test', target: APPLY }), env)).status, 400, '本番のURLは、テストとしては作れない');
  assert.equal(data.size, before, '断ったあとは、何も増えていない');
});

test('申込ページのURLでないもの・切れたリンク・大会IDが読めないリンクは、作らない（何も保存しない）', async () => {
  const { env, data } = environment();
  const bad: Array<[string, string]> = [
    ['よその場所', 'https://evil.example.test/apply/#a=1'],
    ['途中で切れている（最後の目印が無い）', APPLY.replace(/&end=1$/, '')],
    ['本番かテストかが無い', APPLY.replace(/&mode=live/, '')],
    ['大会IDが空', link({ eventId: '' })],
  ];
  for (const [name, target] of bad) {
    const response = await worker.fetch(post({ target }), env);
    assert.equal(response.status, 400, name);
    assert.equal(((await response.json()) as Made).ok, false, name);
  }
  const cut = await worker.fetch(post({ target: APPLY.replace(/&end=1$/, '') }), env);
  assert.match(((await cut.json()) as Made).reason ?? '', /途中で切れ/);
  const noEvent = await worker.fetch(post({ target: link({ eventId: '' }) }), env);
  assert.match(((await noEvent.json()) as Made).reason ?? '', /大会ID/);
  assert.equal(data.size, 0);
});

test('貼り付けで改行・タブが入ったURLでも、作れる。開くと、整えた形で転送される（500にならない）', async () => {
  const { env } = environment();
  const dirty = APPLY.slice(0, 90) + '\n' + APPLY.slice(90, 150) + '\t' + APPLY.slice(150);
  const made = await make(env, { target: dirty });
  assert.equal(made.ok, true);
  const opened = await worker.fetch(open(made.code), env);
  assert.equal(opened.status, 302);
  const location = opened.headers.get('location') ?? '';
  assert.equal(/[\n\r\t]/.test(location), false);
  assert.equal(location, href(APPLY));
});

test('コードは、大文字で打たれても開く。知らないコード・形の違うコードは、転送せず 404', async () => {
  const { env } = environment();
  const made = await make(env, { target: APPLY });
  assert.equal((await worker.fetch(open(made.code.toUpperCase()), env)).status, 302, '大文字でも開く');
  assert.equal((await worker.fetch(open(made.code.toUpperCase()), env)).headers.get('location'), href(APPLY));
  assert.equal((await worker.fetch(open('zzzzzzzz'), env)).status, 404, '知らないコード');
  assert.equal((await worker.fetch(open('0000000o'), env)).status, 404, '形が違う');
});

test('箱が無いときは 503。大会の既存の道は、箱が無くても動く', async () => {
  const noBox = environment({ store: false }).env;
  assert.equal((await worker.fetch(open('zzzzzzzz'), noBox)).status, 503);
  assert.equal((await worker.fetch(post({ target: APPLY }), noBox)).status, 503);
  assert.equal((await worker.fetch(new Request(WORKER + '/api/health'), noBox)).status, 200);
});

test('転送では、何が起きても、選手には 404 の文を見せる（箱が壊れた・答えがおかしい・行き先が申込ページでない）', async () => {
  const code = 'abcdefgh';
  const throwing = environment({ storeFetch: async () => { throw new Error('box is down'); } }).env;
  const thrown = await worker.fetch(open(code), throwing);
  assert.equal(thrown.status, 404);
  assert.match(await thrown.text(), /見つかりません/);
  const evil = environment({ storeFetch: async () => new Response(JSON.stringify({ ok: true, target: 'https://evil.example.test/apply/#a=1' })) }).env;
  assert.equal((await worker.fetch(open(code), evil)).status, 404, '申込ページでない行き先へは、転送しない');
  const garbage = environment({ storeFetch: async () => new Response('not json') }).env;
  assert.equal((await worker.fetch(open(code), garbage)).status, 404);
});

test('転送は、箱が整えていない行き先（途中の改行・タブつき）を返してきても、整えた形で転送する（箱の古い中身でも、500にならない）', async () => {
  const dirty = APPLY.slice(0, 90) + '\n' + APPLY.slice(90, 150) + '\t' + APPLY.slice(150);
  const { env } = environment({ storeFetch: async () => new Response(JSON.stringify({ ok: true, target: dirty })) });
  const opened = await worker.fetch(open('abcdefgh'), env);
  assert.equal(opened.status, 302);
  assert.equal(opened.headers.get('location'), href(APPLY));
});

test('箱そのものも、枠が行き先のリンクの中身と合わないものは受け取らない（直接つないでも）。入る行き先は、整えた形', async () => {
  const box = storeFake();
  const shortLinks = new ShortLinks({ storage: box.storage } as never, {});
  const put = (slot: string, target: string) => shortLinks.fetch(new Request('https://short-links/slot', { method: 'PUT', body: JSON.stringify({ slot, target }) }));
  assert.equal((await put('uizin-2026:live', 'https://evil.example.test/')).status, 400, '申込ページでない行き先');
  assert.equal((await put('uizin-2026:live', APPLY)).status, 400, '行き先の大会と合わない枠');
  assert.equal((await put('tos-example001:test', APPLY)).status, 400, '本番のリンクを、テストの枠には入れない');
  assert.equal((await put('tos-example001:live', APPLY_TEST)).status, 400, 'テストのリンクを、本番の枠には入れない');
  assert.equal((await put('tos-example001', APPLY)).status, 400, '枠の形が違う');
  assert.equal(box.data.size, 0);
  const dirty = APPLY.slice(0, 90) + '\n' + APPLY.slice(90);
  const ok = await put('tos-example001:live', dirty);
  assert.equal(ok.status, 200);
  const { code } = await ok.json() as { code: string };
  assert.equal(box.data.get('code:' + code), href(APPLY), '箱には、整えた形が入る');
  assert.equal(box.data.get('slot:tos-example001:live'), code);
  const found = await shortLinks.fetch(new Request('https://short-links/code/' + code));
  assert.equal(((await found.json()) as { target: string }).target, href(APPLY));
  assert.equal((await shortLinks.fetch(new Request('https://short-links/code/NOT-A-CODE'))).status, 404, '形の違うコードは、箱も探さない');
});

/** 作る画面の中の動きを、ほんものの script のまま動かして確かめる（見かけの部品は、すり替える） */
function runPage(options: { local?: Record<string, string>; session?: Record<string, string>; respond?: (url: string, init: { body?: string }) => { status: number; body: unknown } | Error } = {}) {
  const script = SHORT_LINK_PAGE.match(/<script>([\s\S]*?)<\/script>/)![1];
  const elements = new Map<string, Record<string, any>>();
  const el = (id: string) => {
    if (!elements.has(id)) {
      const handlers: Record<string, () => void> = {};
      elements.set(id, { id, value: '', textContent: '', className: '', hidden: id === 'result' || id === 'testwarn', handlers, addEventListener(type: string, fn: () => void) { handlers[type] = fn; } });
    }
    return elements.get(id)!;
  };
  const storeOf = (init: Record<string, string> = {}) => {
    const data = new Map(Object.entries(init)), calls: string[] = [];
    return { data, calls, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { calls.push('set:' + k); data.set(k, String(v)); }, removeItem: (k: string) => { calls.push('remove:' + k); data.delete(k); } };
  };
  const local = storeOf(options.local), session = storeOf(options.session);
  const fetched: Array<{ url: string; body: Record<string, unknown> }> = [];
  const sandbox = {
    document: { getElementById: el }, localStorage: local, sessionStorage: session, navigator: {},
    fetch: (url: string, init: { body?: string }) => {
      fetched.push({ url, body: JSON.parse(init.body ?? '{}') });
      const made = options.respond?.(url, init) ?? { status: 200, body: {} };
      if (made instanceof Error) return Promise.reject(made);
      return Promise.resolve({ ok: made.status >= 200 && made.status < 300, status: made.status, json: () => Promise.resolve(made.body) });
    },
  };
  vm.runInNewContext(script, sandbox);
  return { el, local, session, fetched };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };
const click = async (page: ReturnType<typeof runPage>, key: string, target: string) => {
  page.el('key').value = key;
  page.el('target').value = target;
  page.el('make').handlers.click();
  await settle();
};

test('作る画面：大会IDの欄は無い。送るのは行き先のURLだけ（?event= も モード も付けない）', async () => {
  assert.equal(/id="event"/.test(SHORT_LINK_PAGE), false, '大会IDの入力欄は無い');
  const page = runPage({ respond: () => ({ status: 200, body: { ok: true, url: WORKER + '/a/abcdefgh', mode: 'live', title: '架空大会' } }) });
  await click(page, KEY, APPLY);
  assert.equal(page.fetched.length, 1);
  assert.equal(page.fetched[0].url, '/api/short-links');
  assert.deepEqual(page.fetched[0].body, { target: APPLY });
});

test('作る画面：操作キーは、Workerが「通した」と答えたあとだけ、このタブ（sessionStorage）に覚える。localStorage には、一度も書かない', async () => {
  const ok = runPage({ respond: () => ({ status: 200, body: { ok: true, url: WORKER + '/a/abcdefgh', mode: 'live', title: '架空大会' } }) });
  await click(ok, KEY, APPLY);
  assert.equal(ok.session.data.get('uizin.shortLink.operatorKey'), KEY, '通ったあとは、このタブに覚える');
  assert.deepEqual(ok.local.calls.filter((call) => call.startsWith('set:')), [], 'localStorage には、何も書かない');
  // 断られたとき・通信できなかったとき・申込ページのURLでないときは、覚えない
  const refused = runPage({ respond: () => ({ status: 401, body: { ok: false, reason: '操作キーが違います。この画面からは短いURLを作れません。' } }) });
  await click(refused, 'wrong-key', APPLY);
  assert.deepEqual(refused.session.calls, [], '断られたキーは、覚えない');
  assert.match(refused.el('msg').textContent, /操作キーが違います/);
  assert.equal(refused.el('msg').className, 'bad');
  const offline = runPage({ respond: () => new Error('offline') });
  await click(offline, KEY, APPLY);
  assert.deepEqual(offline.session.calls, [], '通信できなかったときも、覚えない');
  assert.match(offline.el('msg').textContent, /通信できませんでした/);
  const notApply = runPage();
  await click(notApply, KEY, 'https://evil.example.test/');
  assert.equal(notApply.fetched.length, 0, '申込ページのURLでないものは、送りもしない');
  assert.deepEqual(notApply.session.calls, []);
});

test('作る画面：前の版が localStorage に残した操作キーと大会IDは、開いたときに消える。自動では入らない。同じタブでは、前に通ったキーが入る', () => {
  const legacy = runPage({ local: { 'uizin.shortLink.operatorKey': 'old-key', 'uizin.shortLink.eventId': 'old-event' } });
  assert.equal(legacy.local.data.size, 0, '古い物は、消えている');
  assert.equal(legacy.el('key').value, '', 'localStorage の物は、入らない');
  const sameTab = runPage({ session: { 'uizin.shortLink.operatorKey': KEY } });
  assert.equal(sameTab.el('key').value, KEY, '同じタブで、通ったことがあるキーだけ、入る');
});

test('作る画面：テスト用のURLだと、赤い大きな文で「選手には送らない」と知らせる。本番用では出さない。どの大会かも見せる', async () => {
  const testPage = runPage({ respond: () => ({ status: 200, body: { ok: true, url: WORKER + '/a/abcdefgh', mode: 'test', title: '架空大会' } }) });
  await click(testPage, KEY, APPLY_TEST);
  assert.equal(testPage.el('testwarn').hidden, false, 'テスト用の警告が出る');
  assert.equal(testPage.el('kind').textContent, 'テスト用：架空大会');
  assert.match(testPage.el('msg').textContent, /選手には送らないでください/);
  assert.equal(testPage.el('msg').className, 'bad', 'テスト用のできあがりは、赤で知らせる');
  assert.match(SHORT_LINK_PAGE, /これはテスト用です。選手には送らないでください。/);
  const livePage = runPage({ respond: () => ({ status: 200, body: { ok: true, url: WORKER + '/a/abcdefgh', mode: 'live', title: '架空大会' } }) });
  await click(livePage, KEY, APPLY);
  assert.equal(livePage.el('testwarn').hidden, true, '本番用では、テストの警告を出さない');
  assert.equal(livePage.el('kind').textContent, '本番用：架空大会');
  assert.equal(livePage.el('short').textContent, WORKER + '/a/abcdefgh');
  assert.equal(livePage.el('result').hidden, false);
});

test('作る画面（運営用）は Worker が配る。鍵の値は画面に入らず、呼ぶのは自分（Worker）だけ。説明は、正しい画面の名前', async () => {
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
  assert.match(html, /「選手の受付をつくる」の画面/, '長いURLをコピーする画面の名前');
  assert.equal(html.includes('準備画面で'), false, '長いURLは、準備画面ではなく、「選手の受付をつくる」の画面でコピーする');
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
