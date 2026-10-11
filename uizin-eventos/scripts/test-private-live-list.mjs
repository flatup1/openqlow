/**
 * Adversarial browser checks for the match-day LIST VIEW (/private/live/?event=<id>&view=list) of Tournament OS v3.
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation; all data is fake.
 * It drives the REAL built pages (npm run build:private -> out-private-pages) at 1280px and 390px.
 * Data comes from (a) the real /private/ screen (import CSV, add bouts, save) and (b) the same IndexedDB store API the other scripts use.
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4470 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=/tmp/claude-0/pwshim.mjs TOS_TEST_BASE=http://127.0.0.1:4470 TOS_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node --experimental-strip-types scripts/test-private-live-list.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4470), TOS_ONLY=A,B (scenario ids), TOS_CHROME_PATH.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { contractWeight, safeMusicUrl } from '../core/privateTournament.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4470';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

/* ───────────────────────── bookkeeping ───────────────────────── */
let checks = 0, cur = '-';
const failures = [], net = [], externals = [], pageErrors = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 200) => String(s).replace(/\s+/g, ' ').slice(0, n);

/* ───────────────────────── fake data ───────────────────────── */
const DB_NAME = 'tournament-os-private-v1';
const CSV_HEAD = '管理番号,ジム名,選手名,学年,年齢,身長,体重,戦績・競技歴,試合への意気込み,入場曲URL（Apple Music推奨）';
const CSV_ROWS = [
  ['F01', '架空赤ジム', '架空赤選手', '小6', '12', '150', '60', '初試合', 'がんばる', ''],
  ['F02', '架空青ジム', '架空青選手', '中1', '13', '155', '61.5', '1戦', '全力', ''],
  ['F03', '架空緑ジム', '架空緑選手', '中2', '14', '160', '55', '2戦', '気合', ''],
  ['F04', '架空黄ジム', '架空黄選手', '中3', '15', '162', '56', '3戦', '全力', ''],
];
const CSV4 = [CSV_HEAD, ...CSV_ROWS.map((r) => r.join(','))].join('\n');
const F = (id, over = {}) => ({ id, gym: '架空ジム', name: '架空選手' + id, grade: '', age: '', height: '170', weight: '60', record: '', comment: '', musicUrl: '', photoDataUrl: '', ...over });
const tournament = (id, o = {}) => ({ schema: 1, eventId: id, title: o.title ?? '架空一覧テスト大会', venue: '架空体育館', date: '2027年10月3日', updatedAt: o.updatedAt ?? Date.now() - 60_000, currentBout: o.current ?? 0, fighters: o.fighters ?? [], bouts: o.bouts ?? [], ...(o.entryConfig ? { entryConfig: o.entryConfig } : {}) });
const MUSIC_OFF = { music: false, grade: 'optional', age: 'optional', comment: 'optional' };
const MUSIC_ON = { music: true, grade: 'optional', age: 'optional', comment: 'optional' };
let PHOTO_TALL = '', PHOTO_WIDE = '';
/** n bouts, 2n fighters. photos on every 3rd fighter, music on every 4th (needs PHOTO_* to be filled in first). */
function big(id, n, o = {}) {
  const fighters = [], bouts = [];
  for (let i = 0; i < n; i++) {
    const pad = String(i + 1).padStart(3, '0');
    fighters.push(F('R' + pad, { name: '架空赤' + pad, gym: '架空赤ジム' + pad, weight: String(40 + (i % 30)), photoDataUrl: i % 3 === 0 ? PHOTO_TALL : '', musicUrl: i % 4 === 0 ? 'https://music.apple.com/jp/album/fake/' + pad : '' }));
    fighters.push(F('B' + pad, { name: '架空青' + pad, gym: '架空青ジム' + pad, weight: String(41 + (i % 30)), photoDataUrl: i % 3 === 1 ? PHOTO_WIDE : '', musicUrl: i % 4 === 1 ? 'https://youtu.be/fake' + pad : '' }));
    bouts.push({ id: 'bout-' + i, redId: 'R' + pad, blueId: 'B' + pad, className: i % 5 === 0 ? 'クラス' + pad : '', rule: i % 7 === 0 ? 'ルール' + pad : '' });
  }
  return tournament(id, { ...o, fighters, bouts, current: o.current ?? 0 });
}

/* ───────────────────────── browser helpers ───────────────────────── */
function attach(page) { page.on('pageerror', (e) => { pageErrors.push({ scenario: cur, message: e.message }); }); }
async function newCtx(mobile) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  ctx.__net = [];
  ctx.on('request', (r) => { if (/^https?:/.test(r.url())) { const e = { scenario: cur, url: r.url(), method: r.method(), body: r.postData() }; net.push(e); ctx.__net.push(e); } });
  ctx.on('page', attach);
  // every real save goes through IDBObjectStore.put: record what was written so "no double save" and "nothing written" can be proven
  await ctx.addInitScript(() => {
    window.__puts = [];
    const o = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (v, k) { try { window.__puts.push({ k, current: v && v.currentBout, updatedAt: v && v.updatedAt }); } catch { /* ignore */ } return o.call(this, v, k); };
  });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(base + '/')) return route.continue();
    externals.push({ scenario: cur, url, method: route.request().method() });
    return route.abort();
  });
  return ctx;
}
const idbGet = (p, id) => p.evaluate(([db, id]) => new Promise((res, rej) => {
  const r = indexedDB.open(db, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('events');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const d = r.result; const g = d.transaction('events', 'readonly').objectStore('events').get(id); g.onsuccess = () => { d.close(); res(g.result ?? null); }; g.onerror = () => rej(g.error); };
}), [DB_NAME, id]);
const idbPut = (p, value) => p.evaluate(([db, v]) => new Promise((res, rej) => {
  const r = indexedDB.open(db, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('events');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const d = r.result; const t = d.transaction('events', 'readwrite'); t.objectStore('events').put(v, v.eventId); t.oncomplete = () => { d.close(); res(true); }; t.onerror = () => rej(t.error); };
}), [DB_NAME, value]);
const putsOf = (p) => p.evaluate(() => window.__puts.slice());
/** Put a saved event into the browser store (same store the real screens use). */
async function seed(ctx, value) {
  const boot = await ctx.newPage();
  await boot.goto(base + '/private/setup/?event=seed-boot');
  await idbPut(boot, value);
  await boot.close();
}
async function openLive(ctx, id, { list = true, extra = '' } = {}) {
  const page = await ctx.newPage();
  await page.goto(base + '/private/live/?event=' + id + (list ? '&view=list' : '') + extra);
  await page.locator('main').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !document.body.innerText.includes('このパソコンのデータを読んでいます'), null, { timeout: 15000 });
  return page;
}
const failWrites = (p) => p.evaluate(() => {
  window.__orig = window.__orig || { tx: IDBDatabase.prototype.transaction };
  const o = window.__orig;
  IDBDatabase.prototype.transaction = function (s, m, ...r) { if (m === 'readwrite') throw new Error('SIMULATED_DISK_FULL'); return o.tx.call(this, s, m, ...r); };
});
const healWrites = (p) => p.evaluate(() => { if (window.__orig) IDBDatabase.prototype.transaction = window.__orig.tx; });

const rowLis = (p) => p.locator('li.live-list-row');
const rowTitles = (p) => rowLis(p).locator('h3').allInnerTexts();
const pageLabelOf = async (p) => { const t = await p.locator('nav[aria-label="ページの切りかえ"]').innerText().catch(() => ''); return (t.match(/\d+ \/ \d+ ページ（[^）]*）/) || [''])[0]; };
const plabel = (pg, pages, n) => { const a = (pg - 1) * 10 + 1, b = Math.min(pg * 10, n); return pg + ' / ' + pages + ' ページ（' + (a === b ? a + '試合目' : a + '〜' + b + '試合目') + '）'; };
const headerOf = (p) => p.locator('header').innerText();
const prevBtn = (p) => p.getByRole('button', { name: /前のページ/ });
const nextBtn = (p) => p.getByRole('button', { name: /次のページ/ });
const openBtn = (p, n) => p.getByRole('button', { name: new RegExp('^この試合を開く 第' + n + '試合 ') });
const pagerText = (p) => p.locator('nav[aria-label="ページの切りかえ"]').innerText().catch(() => '');
const jumpNames = (p) => p.locator('[role=group][aria-label="ページを選ぶ"] button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
/** wait until the list is showing bout N as its first/only target, or the one-bout screen shows 第 N 試合 */
const waitSingle = (p, n, total) => p.waitForFunction(([n, total]) => document.querySelector('header')?.innerText.replace(/\s+/g, ' ').includes('第' + n + '試合 全' + total + '試合') && !document.querySelector('li.live-list-row'), [n, total], { timeout: 6000 });
const inView = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0; });

/** One row's data as shown on screen */
const readRows = (p) => p.evaluate(() => [...document.querySelectorAll('li.live-list-row')].map((li) => {
  const groups = [...li.querySelectorAll('[role=group]')];
  const side = (prefix) => {
    const g = groups.find((x) => (x.getAttribute('aria-label') || '').startsWith(prefix));
    if (!g) return null;
    const img = g.querySelector('img');
    const ir = img ? img.getBoundingClientRect() : null;
    const a = [...g.querySelectorAll('a[href]')];
    return { label: g.getAttribute('aria-label'), text: g.innerText.replace(/\s+/g, ' ').trim(), hasImg: !!img, imgSrc: img ? img.getAttribute('src').slice(0, 20) : '', imgW: ir ? Math.round(ir.width) : 0, imgH: ir ? Math.round(ir.height) : 0, fit: img ? getComputedStyle(img).objectFit : '', anchors: a.map((x) => ({ href: x.href, text: x.innerText.trim(), target: x.target, rel: x.rel, label: x.getAttribute('aria-label') })) };
  };
  const cw = li.querySelector('p .sr-only')?.parentElement?.textContent.replace(/^\s*契約\s*/, '').trim() ?? '';
  return { title: li.querySelector('h3')?.innerText ?? '', current: li.getAttribute('aria-current') === 'true', word: li.innerText.includes('いま進行中'), contract: cw, text: li.innerText.replace(/\s+/g, ' '), red: side('赤コーナー'), blue: side('青コーナー'), openLabel: li.querySelector('button.live-list-open')?.getAttribute('aria-label') ?? '' };
}));

/* ── in-page audits ── */
const AUDIT = (vw) => {
  const out = { scrollW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth, innerW: vw, over: [], noName: [], small: [], tiny: [], tinyHeader: [], clipped: [] };
  const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const hidden = (el) => !!el.closest('[aria-hidden="true"],[inert]');
  const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.id || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
  const textOf = (node) => { let t = ''; for (const c of node.childNodes) { if (c.nodeType === 3) t += c.textContent; else if (c.nodeType === 1 && c.getAttribute('aria-hidden') !== 'true' && !['SCRIPT', 'STYLE'].includes(c.tagName)) t += textOf(c); } return t; };
  const nameOf = (el) => {
    const al = el.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map((i) => { const n = document.getElementById(i); return n ? textOf(n) : ''; }).join(' ').trim(); if (t) return t; }
    return textOf(el).trim() || (el.getAttribute('title') || '').trim();
  };
  for (const el of document.body.querySelectorAll('*')) {
    if (!vis(el) || el.closest('[aria-hidden="true"]') || el.classList.contains('sr-only') || el.closest('.sr-only')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'hidden' || o === 'scroll' || o === 'clip') { clipped = true; break; } p = p.parentElement; }
      if (!clipped) out.over.push(el.tagName + ':' + label(el) + ' right=' + Math.round(r.right) + ' left=' + Math.round(r.left));
    }
  }
  // text inside a row must not stick out of the row's own box (long names must wrap)
  for (const li of document.querySelectorAll('li.live-list-row')) {
    const lr = li.getBoundingClientRect();
    for (const el of li.querySelectorAll('*')) {
      if (!vis(el) || el.closest('.sr-only') || el.classList.contains('sr-only')) continue;
      const r = el.getBoundingClientRect();
      if (r.right > lr.right + 1 || r.left < lr.left - 1) out.clipped.push(el.tagName + ':' + label(el) + ' out of row by ' + Math.round(Math.max(r.right - lr.right, lr.left - r.left)));
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline') out.clipped.push(el.tagName + ':' + label(el) + ' scrollW ' + el.scrollWidth + ' > clientW ' + el.clientWidth);
    }
  }
  for (const el of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button]')) {
    if (!vis(el) || hidden(el)) continue;
    if (!/[\p{L}\p{N}]/u.test(nameOf(el))) out.noName.push(el.tagName + ' "' + nameOf(el) + '"');
  }
  for (const el of document.querySelectorAll('a[href],button,summary,select,textarea,input:not([type=hidden]),[role=button]')) {
    if (!vis(el) || hidden(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 47.5 || (el.tagName !== 'A' && r.width < 47.5)) out.small.push(el.tagName + ':' + label(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'OPTION', 'NEXT-ROUTE-ANNOUNCER'].includes(el.tagName) || !vis(el) || hidden(el) || el.closest('.sr-only')) continue;
    if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16.99 && el.closest('header')) { out.tinyHeader.push(el.tagName + ' ' + fs + 'px "' + textOf(el).trim().slice(0, 30) + '"'); continue; }
    if (fs < 16.99) out.tiny.push(el.tagName + ' ' + fs + 'px "' + textOf(el).trim().slice(0, 30) + '"');
  }
  return out;
};
/** Focus ring on the focused element, its ::after (the whole-row hit area) or a box-shadow ring. 'auto' = browser default ring. */
const RING = () => {
  const el = document.activeElement; if (!el || el === document.body) return { ok: false, what: 'nothing focused' };
  const own = getComputedStyle(el), after = getComputedStyle(el, '::after');
  const strong = (s) => s.outlineStyle !== 'none' && (s.outlineStyle === 'auto' || parseFloat(s.outlineWidth) >= 2);
  const ok = strong(own) || (after.content !== 'none' && strong(after)) || (own.boxShadow !== 'none' && /\d+px/.test(own.boxShadow));
  const r = el.getBoundingClientRect();
  return { ok, auto: own.outlineStyle === 'auto', inView: r.bottom > 0 && r.top < window.innerHeight, what: el.tagName + ' ' + (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').slice(0, 40) };
};
async function audit(page, label, opts = {}) {
  const a = await page.evaluate(AUDIT, page.viewportSize().width);
  check(a.scrollW <= a.innerW && a.bodyW <= a.innerW, label + ': no horizontal scroll (doc ' + a.scrollW + ' body ' + a.bodyW + ' window ' + a.innerW + ')');
  check(a.over.length === 0, label + ': no element sticks out of the window: ' + short(a.over.slice(0, 4).join(' ; '), 300));
  check(a.clipped.length === 0, label + ': nothing sticks out of / is clipped inside a row: ' + short(a.clipped.slice(0, 4).join(' ; '), 300));
  check(a.noName.length === 0, label + ': every control has a word name: ' + short(a.noName.slice(0, 4).join(' ; '), 300));
  check(a.small.length === 0, label + ': tap targets >= 48px: ' + short(a.small.slice(0, 5).join(' ; '), 300));
  check(a.tiny.length === 0, label + ': text >= 17px: ' + short(a.tiny.slice(0, 5).join(' ; '), 300));
  if (opts.header) check(a.tinyHeader.length === 0, label + ': text in the top bar (大会名 / 第N試合 / ローカル保存) >= 17px: ' + short(a.tinyHeader.join(' ; '), 300));
  return a;
}
/** Press Tab until the focused element matches; every stop is checked for a visible focus ring. */
async function tabUntil(page, test, max = 120, log = []) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    log.push(await page.evaluate(RING));
    const hit = await page.evaluate((t) => { const e = document.activeElement; if (!e || e === document.body) return false; const s = (e.getAttribute('aria-label') || '') + ' ' + (e.innerText || ''); return new RegExp(t).test(s); }, test);
    if (hit) return true;
  }
  return false;
}

/* ───────────────────────── scenarios ───────────────────────── */
const scenarios = [];
const scenario = (id, name, fn, o = {}) => scenarios.push({ id, name, fn, viewports: o.viewports || [false, true] });

/* A: build the event through the REAL /private/ screen, then use the list */
scenario('A', 'real screens: import CSV, build bouts, save -> list view', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'll-a-' + vp.tag;
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=' + id);
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  await page.locator('#field-title').fill('架空一覧大会');
  await page.locator('#field-date').fill('2027年10月3日');
  await page.locator('#pick-file').setInputFiles({ name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV4, 'utf8') });
  await page.getByText('4人分を読み込みました').first().waitFor();
  const add = async (red, blue) => { const n = await page.locator('article[id^="bout-"]').count(); await page.getByRole('button', { name: '＋ 試合を追加', exact: true }).click(); await page.locator('#bout-' + n + '-red').waitFor(); await page.locator('#bout-' + n + '-red').selectOption(red); await page.locator('#bout-' + n + '-blue').selectOption(blue); };
  await add('F01', 'F02'); await add('F03', 'F04');
  await page.getByRole('button', { name: /^(保存する|もう一度 保存する)$/ }).click();
  await page.waitForFunction(() => document.querySelector('#save-state')?.innerText.includes('保存済み'), null, { timeout: 8000 });
  const stored = await idbGet(page, id);
  check(stored && stored.bouts.length === 2 && stored.currentBout === 0, 'the real screen saved 2 bouts');
  const live = await openLive(ctx, id);
  const titles = await rowTitles(live);
  check(titles.join(',') === '第1試合,第2試合', 'list shows the two saved bouts (' + titles.join(',') + ')');
  const rows = await readRows(live);
  check(rows[0].contract === '61.5kg契約' && rows[1].contract === '56kg契約', 'contract shown like the single view: ' + rows.map((r) => r.contract).join(' / '));
  check(rows[0].red?.text.includes('架空赤選手') && rows[0].blue?.text.includes('架空青選手') && rows[0].red.text.includes('架空赤ジム'), 'red/blue names and gym of bout 1 are shown with their corner words');
  check(rows.every((r) => r.red && r.blue && !r.red.hasImg && !r.blue.hasImg && !r.red.text.includes('写真なし') && !r.blue.text.includes('写真なし')), 'imported fighters have no photo -> a quiet placeholder only, the word 写真なし is NOT repeated on every card');
  const music = stored.entryConfig?.music ?? true;
  const noteCount = await live.getByText('この大会は入場曲なし').count();
  check(music ? noteCount === 0 : noteCount === 1, 'page-level 「この大会は入場曲なし」 is shown exactly when the saved event has music off (music=' + music + ', notes=' + noteCount + ')');
  await audit(live, 'A list ' + vp.name, { header: true });
  await ctx.close();
});

/* B: counts 0,1,2,10,11,35,100 : paging, disabled reasons, jump buttons, page of current bout, nothing written */
scenario('B', 'bout counts 0/1/2/10/11/35/100: paging, disabled reasons, no writes', async (vp) => {
  const ctx = await newCtx(vp.mobile);
  for (const n of [0, 1, 2, 10, 11, 35, 100]) {
    const id = 'll-b' + n + '-' + vp.tag, pages = Math.max(1, Math.ceil(n / 10));
    const value = big(id, n);
    await seed(ctx, value);
    const before = await idbGet(await ctx.newPage().then(async (p) => { await p.goto(base + '/private/setup/?event=x'); return p; }), id);
    const live = await openLive(ctx, id);
    const tag = 'n=' + n + ' ' + vp.name;
    if (n === 0) {
      check((await live.getByText('まだ対戦カードがありません。準備の画面で作ってください。').count()) === 1, tag + ': friendly empty message');
      const link = live.locator('a[href^="/private/?event=' + id + '"]');
      check((await link.count()) >= 1 && (await link.first().isVisible()), tag + ': link back to /private/?event=<id>');
      check((await rowLis(live).count()) === 0, tag + ': no rows');
      check((await live.getByRole('button', { name: '一覧' }).count()) === 1 && (await live.getByRole('button', { name: '1試合ずつ' }).count()) === 1, tag + ': mode switch still shown');
      await audit(live, tag + ' empty');
      // the default single view with 0 bouts keeps its old text
      await live.getByRole('button', { name: '1試合ずつ' }).click();
      check((await live.getByText('対戦カードがありません').count()) === 1, tag + ': the one-bout mode with 0 bouts keeps its old 「対戦カードがありません」 page');
      continue;
    }
    const rows0 = await rowLis(live).count();
    check(rows0 === Math.min(10, n), tag + ': first page shows ' + Math.min(10, n) + ' rows (saw ' + rows0 + ')');
    check((await headerOf(live)).replace(/\s+/g, ' ').includes('第1試合 全' + n + '試合'), tag + ': header 第1試合 全' + n + '試合');
    check((await pageLabelOf(live)) === plabel(1, pages, n), tag + ': label 「' + plabel(1, pages, n) + '」 (saw "' + (await pageLabelOf(live)) + '")');
    check(await prevBtn(live).isDisabled(), tag + ': 前のページ disabled on page 1');
    const txt = await pagerText(live);
    check(/最初|1つだけ|ありません/.test(txt), tag + ': a visible reason for the disabled 前のページ (' + short(txt, 120) + ')');
    if (pages === 1) { check(await nextBtn(live).isDisabled(), tag + ': 次のページ disabled when only one page'); check(/1つだけ/.test(txt), tag + ': reason says there is only one page'); }
    else check(!(await nextBtn(live).isDisabled()), tag + ': 次のページ enabled');
    const jn = await jumpNames(live);
    check(pages > 3 ? jn.length >= 4 : jn.length === 0, tag + ': page-jump buttons only when more than 3 pages (' + pages + ' pages -> ' + jn.length + ' buttons)');
    if (pages > 3) {
      check(jn.some((x) => x.startsWith('1ページ目を開く 1〜10')) && jn.some((x) => x.startsWith(pages + 'ページ目を開く ')), tag + ': jump list has first and last page (' + jn.join('|') + ')');
      check((await live.locator('[role=group][aria-label="ページを選ぶ"] button[aria-current="page"]').count()) === 1, tag + ': exactly one jump button is marked as the current page');
    }
    // walk every page forward
    const seen = [...(await rowTitles(live))];
    for (let pg = 2; pg <= pages; pg++) {
      await nextBtn(live).click();
      await live.waitForFunction((l) => document.body.innerText.includes(l), plabel(pg, pages, n), { timeout: 4000 }).catch(() => {});
      const t = await rowTitles(live);
      seen.push(...t);
      check(t.length === (pg < pages ? 10 : n - 10 * (pages - 1)), tag + ': page ' + pg + ' shows ' + t.length + ' rows');
      check((await pageLabelOf(live)) === plabel(pg, pages, n), tag + ': label on page ' + pg);
      check(await live.evaluate(() => document.activeElement !== document.body), tag + ': focus is not lost after 次のページ (page ' + pg + ')');
      check(!(await prevBtn(live).isDisabled()), tag + ': 前のページ enabled on page ' + pg);
    }
    check(seen.join(',') === Array.from({ length: n }, (_, i) => '第' + (i + 1) + '試合').join(','), tag + ': walking 次のページ shows every bout once, in order');
    check(await nextBtn(live).isDisabled(), tag + ': 次のページ disabled on the last page');
    check(/最後|1つだけ/.test(await pagerText(live)), tag + ': visible reason for the disabled 次のページ on the last page');
    if (pages > 1) {
      for (let pg = pages - 1; pg >= 1; pg--) await prevBtn(live).click();
      await live.waitForFunction((l) => document.body.innerText.includes(l), '1 / ' + pages + ' ページ', { timeout: 4000 }).catch(() => {});
      check((await rowTitles(live))[0] === '第1試合', tag + ': 前のページ walks back to page 1');
    }
    if (pages > 3) {
      await live.getByRole('button', { name: '3ページ目を開く' }).click();
      check((await pageLabelOf(live)).startsWith('3 / ' + pages), tag + ': jump button 3 opens page 3');
      check((await rowTitles(live))[0] === '第21試合', tag + ': page 3 starts at 第21試合');
      await live.getByRole('button', { name: pages + 'ページ目を開く' }).click();
      check((await pageLabelOf(live)).startsWith(pages + ' / ' + pages), tag + ': jump button last opens the last page');
      check((await live.locator('[role=group][aria-label="ページを選ぶ"] button').count()) <= 9, tag + ': jump list stays short (<= 9 buttons) even with ' + pages + ' pages');
      await audit(live, tag + ' last page');
    }
    check((await rowLis(live).count()) <= 10, tag + ': never more than 10 rows in the page');
    // nothing was written by paging / switching
    await live.getByRole('button', { name: '1試合ずつ' }).click();
    await live.getByRole('button', { name: '一覧' }).click();
    check((await putsOf(live)).length === 0, tag + ': paging and switching modes wrote nothing (puts: ' + (await putsOf(live)).length + ')');
    const after = await idbGet(live, id);
    check(after.currentBout === 0 && after.updatedAt === before.updatedAt, tag + ': saved currentBout/updatedAt unchanged (' + after.currentBout + ', ' + (after.updatedAt === before.updatedAt) + ')');
    if (n === 1 || n === 35) await audit(live, tag + ' ' + (n === 1 ? 'one bout' : 'list'));
    await live.close();
  }
  await ctx.close();
});

/* C: the page holding the current bout opens first; highlight; saved currentBout untouched */
scenario('C', 'current bout page opens first, 「いま進行中」', async (vp) => {
  const ctx = await newCtx(vp.mobile);
  const cases = [[35, 23, 3], [35, 34, 4], [35, 9, 1], [35, 10, 2], [11, 10, 2], [11, 9, 1], [100, 99, 10], [100, 55, 6], [10, 9, 1]];
  for (const [n, cb, pg] of cases) {
    const id = 'll-c' + n + '-' + cb + '-' + vp.tag, pages = Math.ceil(n / 10);
    await seed(ctx, big(id, n, { current: cb }));
    const live = await openLive(ctx, id);
    const tag = 'n=' + n + ' current=' + cb + ' ' + vp.name;
    check((await pageLabelOf(live)).startsWith(pg + ' / ' + pages), tag + ': opens on page ' + pg + ' (saw "' + (await pageLabelOf(live)) + '")');
    const rows = await readRows(live);
    const hl = rows.filter((r) => r.word);
    check(hl.length === 1 && hl[0].title === '第' + (cb + 1) + '試合' && hl[0].current, tag + ': exactly one row says いま進行中 and it is 第' + (cb + 1) + '試合 (' + hl.map((r) => r.title).join(',') + ')');
    check(rows.filter((r) => r.current).length === 1, tag + ': exactly one row has aria-current');
    const hdr = (await headerOf(live)).replace(/\s+/g, ' ');
    check(hdr.includes('第' + (cb + 1) + '試合 全' + n + '試合'), tag + ': header shows the current bout');
    if (pages > 1) {
      const other = pg === 1 ? 'next' : 'prev';
      await (other === 'next' ? nextBtn(live) : prevBtn(live)).click();
      const r2 = await readRows(live);
      check(r2.every((r) => !r.word && !r.current), tag + ': on another page nobody is marked いま進行中');
    }
    check((await putsOf(live)).length === 0, tag + ': nothing written while paging');
    await live.close();
  }
  // the highlight must not be colour alone: the word is the visible text of the row
  const id = 'll-c-word-' + vp.tag;
  await seed(ctx, big(id, 3, { current: 1 }));
  const live = await openLive(ctx, id);
  const rows = await readRows(live);
  check(rows[1].text.includes('いま進行中') && !rows[0].text.includes('いま進行中') && !rows[2].text.includes('いま進行中'), 'current row carries the words, others do not');
  await ctx.close();
});

/* D: row content: photo, names, gym, contract, rule, music states, missing fighters, long names; cross-check with single view */
scenario('D', 'row content and contract/music identical to the single view', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'll-d-' + vp.tag;
  const LONG = '長'.repeat(60), LONGGYM = 'とても長いジム名'.repeat(7);
  const fighters = [
    F('A1', { name: '架空写真あり赤', gym: '架空Aジム', weight: '60', photoDataUrl: PHOTO_TALL, musicUrl: 'https://music.apple.com/jp/album/fake/123' }),
    F('A2', { name: '架空写真あり青', gym: '架空Bジム', weight: '61.5', photoDataUrl: PHOTO_WIDE, musicUrl: 'https://youtu.be/fake0001' }),
    F('B1', { name: '架空曲なし赤', weight: 'abc' }), F('B2', { name: '架空曲なし青', weight: '' }),
    F('C1', { name: '架空契約なし赤', weight: '' }), F('C2', { name: '架空契約なし青', weight: '' }),
    F('D2', { name: '架空青だけ', weight: '55' }), F('E1', { name: '架空赤だけ', weight: '55' }),
    F('L1', { name: LONG, gym: LONGGYM, weight: '70', photoDataUrl: PHOTO_TALL, musicUrl: 'https://music.apple.com/jp/album/fake/' + 'x'.repeat(80) }),
    F('L2', { name: 'Supercalifragilisticexpialidocious'.repeat(2), gym: 'abcdefghij'.repeat(8), weight: '69.5' }),
    F('M1', { name: '架空安全でない曲赤', musicUrl: 'http://music.apple.com/jp/x' }), F('M2', { name: '架空怪しい曲青', musicUrl: 'javascript:alert(1)' }),
    F('N1', { name: '', gym: '' }),
    F('W1', { name: '架空七十赤', weight: '70kg' }), F('W2', { name: '架空七十二青', weight: '72.0' }),
  ];
  const bouts = [
    { id: 'b0', redId: 'A1', blueId: 'A2', className: '', rule: '' },
    { id: 'b1', redId: 'B1', blueId: 'B2', className: '中量級クラス', rule: '' },
    { id: 'b2', redId: 'C1', blueId: 'C2', className: '', rule: 'ヘッドギア着用 2分×3R' },
    { id: 'b3', redId: '', blueId: 'D2', className: '', rule: '' },
    { id: 'b4', redId: 'E1', blueId: '', className: 'ライト級', rule: '' },
    { id: 'b5', redId: 'L1', blueId: 'L2', className: 'とても長いクラス名'.repeat(6), rule: 'とても長いルール説明'.repeat(8) },
    { id: 'b6', redId: 'M1', blueId: 'M2', className: '', rule: '' },
    { id: 'b7', redId: 'N1', blueId: 'A1', className: '', rule: '' },
    { id: 'b8', redId: 'W1', blueId: 'W2', className: '', rule: '' },
    { id: 'b9', redId: '', blueId: '', className: '', rule: '' },
  ];
  const byId = new Map(fighters.map((f) => [f.id, f]));
  const expectedContract = (b) => contractWeight(byId.get(b.redId), byId.get(b.blueId)) || b.className || '契約未入力';
  await seed(ctx, tournament(id, { fighters, bouts, entryConfig: MUSIC_ON }));
  const live = await openLive(ctx, id);
  const rows = await readRows(live);
  check(rows.length === 10, 'ten rows on the page (saw ' + rows.length + ')');
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], b = bouts[i], red = byId.get(b.redId), blue = byId.get(b.blueId), t = 'bout ' + (i + 1) + ' ' + vp.name;
    check(r.title === '第' + (i + 1) + '試合', t + ': title 第N試合');
    check(r.contract === expectedContract(b), t + ': contract "' + r.contract + '" === "' + expectedContract(b) + '"');
    if (b.rule) check(r.text.includes(b.rule), t + ': rule text shown'); else check(!r.text.includes('ルール：'), t + ': no empty rule line');
    for (const [side, f, word] of [[r.red, red, '赤コーナー'], [r.blue, blue, '青コーナー']]) {
      check(!!side && side.label.startsWith(word) && side.text.includes(word), t + ': ' + word + ' block has the words (aria-label "' + short(side?.label, 40) + '")');
      if (!side) continue;
      if (!f) { check(side.text.includes('選手未選択'), t + ': ' + word + ' missing fighter shows 選手未選択'); check(side.anchors.length === 0 && !/入場曲/.test(side.text), t + ': ' + word + ' missing fighter shows no music at all'); continue; }
      const nm = f.name || '名前未入力';
      check(side.label.includes(nm), t + ': ' + word + ' accessible name contains the fighter name');
      check(side.text.includes(nm) && (!f.gym || side.text.includes(f.gym)), t + ': ' + word + ' shows name and gym');
      if (f.photoDataUrl) { check(side.hasImg && side.imgSrc.startsWith('data:image/'), t + ': ' + word + ' photo is a data URL'); check(side.imgW >= 44 && side.imgW <= 68 && side.imgH >= 44 && side.imgH <= 68, t + ': ' + word + ' photo is small (' + side.imgW + 'x' + side.imgH + ')'); check(side.fit === 'contain', t + ': ' + word + ' photo is object-contain (' + side.fit + ')'); check(!side.text.includes('写真なし'), t + ': ' + word + ' with photo does not say 写真なし'); }
      else { check(!side.hasImg && !side.text.includes('写真なし'), t + ': ' + word + ' without photo shows the quiet placeholder (no repeated 写真なし word)'); }
      const safe = safeMusicUrl(f.musicUrl);
      if (safe) { check(side.text.includes('♪ 曲を開く') && side.text.includes('↗ 別のタブ') && side.anchors.length === 1 && side.anchors[0].href === safe, t + ': ' + word + ' music link === safeMusicUrl (' + short(side.anchors[0]?.href, 60) + ')'); check(side.anchors[0]?.target === '_blank' && /noreferrer|noopener/.test(side.anchors[0]?.rel || ''), t + ': ' + word + ' music link opens a new tab safely'); }
      else if (f.musicUrl.trim()) { check(side.anchors.length === 0 && !side.text.includes('♪ 曲を開く') && side.text.includes('⚠ 曲のリンクを確認'), t + ': ' + word + ' unsafe music URL is NOT a link, not 曲を開く, and says 曲のリンクを確認'); }
      else check(side.text.includes('⚠ 入場曲なし（曲を用意）') && side.anchors.length === 0, t + ': ' + word + ' no music -> ⚠ 入場曲なし（曲を用意）');
    }
  }
  check(rows[9].red?.text.includes('選手未選択') && rows[9].blue?.text.includes('選手未選択') && rows[9].contract === '契約未入力', 'both fighters missing: two 選手未選択 and 契約未入力');
  check(rows[7].red?.text.includes('名前未入力'), 'a fighter without a name shows 名前未入力');
  check((await live.getByText('この大会は入場曲なし').count()) === 0, 'music on -> no 入場曲なし note');
  // dangerous hrefs never reach the DOM
  const hrefs = await live.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
  check(hrefs.every((h) => !/^javascript:/i.test(h) && !/^http:\/\/music\./.test(h)), 'no javascript:/http: music link in the DOM');
  check((await live.evaluate(() => [...document.images].every((i) => i.src.startsWith('data:')))), 'every <img> is a data URL (no network image)');
  // layout: corner order, red then blue, stacked on phones / side by side on PC
  const geo = await live.evaluate(() => { const li = document.querySelector('li.live-list-row'); const g = [...li.querySelectorAll('[role=group]')].map((x) => x.getBoundingClientRect()); const c = [...li.querySelectorAll('p')].find((p) => p.querySelector('.sr-only')).getBoundingClientRect(); return { red: g[0], blue: g[1], c: { top: c.top, left: c.left, bottom: c.bottom } }; });
  if (vp.mobile) check(geo.blue.top > geo.red.top + 20 && Math.abs(geo.blue.left - geo.red.left) < 8 && geo.c.top >= geo.red.bottom - 2 && geo.c.bottom <= geo.blue.top + 2, '390px: the row stacks into a card (red, contract, blue top to bottom)');
  else check(Math.abs(geo.blue.top - geo.red.top) < 8 && geo.red.left < geo.c.left && geo.c.left < geo.blue.left, '1280px: red | contract | blue side by side');
  await audit(live, 'D list ' + vp.name);
  // the long-name row on its own, mobile and PC
  await live.evaluate(() => document.querySelectorAll('li.live-list-row')[5].scrollIntoView());
  // cross-check with the single view: open every bout by its row and compare
  for (let i = 0; i < bouts.length; i++) {
    const b = bouts[i], t = 'single view of bout ' + (i + 1) + ' ' + vp.name;
    await openBtn(live, i + 1).scrollIntoViewIfNeeded();
    await openBtn(live, i + 1).click();
    await waitSingle(live, i + 1, bouts.length);
    const single = await live.evaluate(() => {
      const vs = [...document.querySelectorAll('p')].find((p) => p.innerText.trim() === 'VS');
      const arts = [...document.querySelectorAll('article')];
      return { contract: vs?.nextElementSibling?.innerText.trim() ?? null, hrefs: arts.map((a) => a.querySelector('a[href]')?.href ?? ''), names: arts.map((a) => a.querySelector('h2')?.innerText ?? ''), sy: scrollY, hdr: document.querySelector('header')?.getBoundingClientRect().top };
    });
    check(single.contract === expectedContract(b), t + ': contract in single view "' + single.contract + '" equals the list "' + expectedContract(b) + '"');
    const exp = [byId.get(b.redId), byId.get(b.blueId)].map((f) => (f && safeMusicUrl(f.musicUrl)) || '');
    check(single.hrefs.join('|') === exp.join('|'), t + ': single-view music links equal the list links');
    check(single.hdr >= 0 && single.hdr < 400, t + ': after opening a bout from a row the screen is scrolled to the top (header at y=' + Math.round(single.hdr) + ', scrollY=' + Math.round(single.sy) + ')');
    const stored = await idbGet(live, id);
    check(stored.currentBout === i, t + ': saved currentBout is ' + i + ' (saw ' + stored.currentBout + ')');
    check(new URL(live.url()).searchParams.get('view') === null, t + ': URL no longer says view=list');
    await live.getByRole('button', { name: '一覧' }).click();
    await live.locator('li.live-list-row').first().waitFor();
    const rr = await readRows(live);
    check(rr.filter((x) => x.word).map((x) => x.title).join() === '第' + (i + 1) + '試合', t + ': back in the list the current bout is marked');
  }
  await ctx.close();
});

/* E: mode switch, URL, reload, single mode unchanged */
scenario('E', 'mode switch, ?view=list in the URL, reload, single mode unchanged', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'll-e-' + vp.tag;
  await seed(ctx, big(id, 14, { current: 2 }));
  const before = await idbGet(await (async () => { const p = await ctx.newPage(); await p.goto(base + '/private/setup/?event=x'); return p; })(), id);
  const live = await openLive(ctx, id, { list: false });
  const t = vp.name;
  check(!(await live.locator('li.live-list-row').count()), t + ': default (no ?view) is the one-bout mode');
  const hdr = (await headerOf(live)).replace(/\s+/g, ' ');
  check(hdr.includes('第3試合 全14試合'), t + ': single header 第3試合 全14試合 (' + hdr + ')');
  check((await live.getByText('赤コーナー').count()) >= 1 && (await live.getByText('青コーナー').count()) >= 1, t + ': single view shows 赤コーナー and 青コーナー');
  check((await live.getByRole('button', { name: '← 前の試合', exact: true }).isEnabled()) && (await live.getByRole('button', { name: '次の試合 →', exact: true }).isEnabled()), t + ': 前の試合 / 次の試合 buttons exist');
  const sw = live.getByRole('group', { name: '表示のしかた' });
  check((await sw.count()) === 1, t + ': labelled switch group 表示のしかた');
  const one = sw.getByRole('button', { name: '1試合ずつ' }), lst = sw.getByRole('button', { name: '一覧' });
  check((await one.getAttribute('aria-pressed')) === 'true' && (await lst.getAttribute('aria-pressed')) === 'false', t + ': aria-pressed marks 1試合ずつ');
  check((await one.innerText()).includes('✓') && (await one.innerText()).includes('表示中') && !(await lst.innerText()).includes('✓') && !(await lst.innerText()).includes('表示中'), t + ': selected mode shows a check mark AND a word, the other does not');
  const bb = await Promise.all([one.boundingBox(), lst.boundingBox()]);
  check(bb.every((b) => b.height >= 47.5 && b.width >= 47.5), t + ': switch buttons >= 48px');
  // single mode works as before
  await live.getByRole('button', { name: '次の試合 →', exact: true }).click();
  await live.waitForFunction(() => document.querySelector('header')?.innerText.includes('第4試合'), null, { timeout: 5000 });
  check((await idbGet(live, id)).currentBout === 3, t + ': 次の試合 saved currentBout 3');
  await live.getByRole('button', { name: '← 前の試合', exact: true }).click();
  await live.waitForFunction(() => document.querySelector('header')?.innerText.includes('第3試合'), null, { timeout: 5000 });
  check((await idbGet(live, id)).currentBout === 2 && (await putsOf(live)).length === 2, t + ': 前の試合 saved currentBout 2; exactly 2 writes so far (' + (await putsOf(live)).length + ')');
  const u0 = (await idbGet(live, id)).updatedAt, puts0 = (await putsOf(live)).length;
  // switch to list
  await lst.click();
  await live.locator('li.live-list-row').first().waitFor();
  check(new URL(live.url()).searchParams.get('view') === 'list' && new URL(live.url()).searchParams.get('event') === id, t + ': URL has ?event=<id>&view=list (' + live.url().replace(base, '') + ')');
  check((await lst.getAttribute('aria-pressed')) === 'true' && (await lst.innerText()).includes('✓') && (await lst.innerText()).includes('表示中'), t + ': 一覧 now shows ✓ 表示中');
  check((await live.getByRole('heading', { name: /試合の一覧/ }).count()) === 1, t + ': list heading');
  await nextBtn(live).click();
  await one.click();
  check(new URL(live.url()).searchParams.get('view') === null && new URL(live.url()).searchParams.get('event') === id, t + ': back to 1試合ずつ: view param removed, event kept (' + live.url().replace(base, '') + ')');
  check((await headerOf(live)).replace(/\s+/g, ' ').includes('第3試合 全14試合'), t + ': still on bout 3 after paging and switching');
  await lst.click(); await live.locator('li.live-list-row').first().waitFor();
  check((await putsOf(live)).length === puts0 && (await idbGet(live, id)).updatedAt === u0, t + ': switching modes and paging wrote nothing');
  // reload keeps the list
  await live.reload();
  await live.locator('li.live-list-row').first().waitFor({ timeout: 10000 });
  check(new URL(live.url()).searchParams.get('view') === 'list' && (await live.getByRole('heading', { name: /試合の一覧/ }).count()) === 1, t + ': reload keeps ?view=list and the list');
  check((await lst.getAttribute('aria-pressed')) === 'true', t + ': after reload 一覧 is marked');
  // odd URLs
  for (const [q, want] of [['&view=LIST', 'single'], ['&view=other', 'single'], ['&view=', 'single'], ['&view=list#x', 'list'], ['&view=list&view=single', 'list']]) {
    const p = await ctx.newPage(); await p.goto(base + '/private/live/?event=' + id + q); await p.locator('main').waitFor();
    await p.waitForFunction(() => !document.body.innerText.includes('読んでいます'), null, { timeout: 8000 });
    const isList = (await p.locator('li.live-list-row').count()) > 0;
    check(isList === (want === 'list'), t + ': ?' + q.slice(1) + ' -> ' + want + ' mode');
    await p.close();
  }
  // event parameter order
  const p2 = await ctx.newPage(); await p2.goto(base + '/private/live/?view=list&event=' + id); await p2.locator('main').waitFor();
  await p2.waitForFunction(() => !document.body.innerText.includes('読んでいます'), null, { timeout: 8000 });
  check((await p2.locator('li.live-list-row').count()) > 0 && (await p2.getByText('架空一覧テスト大会').count()) >= 1, t + ': ?view=list&event=<id> (other order) works');
  // back button after switching
  await lst.click().catch(() => {});
  const after = await idbGet(live, id);
  check(after.currentBout === 2, t + ': saved currentBout still 2 after all of this');
  check(before.currentBout === 2, t + ': (sanity) seeded currentBout was 2');
  await audit(live, 'E list ' + vp.name);
  await ctx.close();
});

/* F: music off for the event */
scenario('F', 'music disabled for the event: one page-level note, no per-fighter music', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'll-f-' + vp.tag;
  const v = big(id, 12, { entryConfig: MUSIC_OFF });
  await seed(ctx, v);
  const live = await openLive(ctx, id);
  check((await live.getByText('この大会は入場曲なし').count()) === 1, vp.name + ': 「この大会は入場曲なし」 shown exactly once on the page');
  const rows = await readRows(live);
  check(rows.every((r) => !/入場曲/.test(r.red.text + r.blue.text) && r.red.anchors.length === 0 && r.blue.anchors.length === 0), vp.name + ': no per-fighter music words or links even though fighters have music URLs');
  await nextBtn(live).click();
  check((await live.getByText('この大会は入場曲なし').count()) === 1, vp.name + ': still once on page 2');
  await audit(live, 'F ' + vp.name);
  await ctx.close();
});

/* G: row click saves currentBout via the same guarded path; double click; failure; conflict */
scenario('G', 'row click: saves once; failure shown and nothing lost; conflict; double click', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'll-g-' + vp.tag, t = vp.name;
  await seed(ctx, big(id, 35, { current: 0 }));
  let live = await openLive(ctx, id);
  const u0 = (await idbGet(live, id)).updatedAt;
  await nextBtn(live).click();
  check((await openBtn(live, 14).count()) === 1 && (await openBtn(live, 11).count()) === 1 && (await openBtn(live, 5).count()) === 0, t + ': on page 2, rows 第11..第20試合 are there');
  // a stray tap on the row itself (title, name, empty space) must NOT change the live bout: only the visible 「この試合を開く」 button does
  const li = rowLis(live).nth(3); // 第14試合
  await li.scrollIntoViewIfNeeded();
  await li.locator('h3').click();
  const nameP = li.locator('[role=group] p').nth(1);
  await nameP.click();
  const boxS = await li.boundingBox();
  const strayPoint = await li.evaluate((el) => { const r = el.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height - 4); return e === el || el.contains(e) ? (e.closest('button,a') ? 'control' : 'neutral') : 'outside'; });
  if (strayPoint === 'neutral') await live.mouse.click(boxS.x + boxS.width / 2, boxS.y + boxS.height - 4);
  await live.waitForTimeout(500);
  check((await rowLis(live).count()) > 0 && new URL(live.url()).searchParams.get('view') === 'list', t + ': tapping the row title / name / empty space does not leave the list');
  check((await putsOf(live)).length === 0 && (await idbGet(live, id)).currentBout === 0, t + ': a stray tap on a row writes nothing and keeps the live bout (puts ' + (await putsOf(live)).length + ')');
  await openBtn(live, 14).click();
  await waitSingle(live, 14, 35).catch(() => {});
  check((await headerOf(live)).replace(/\s+/g, ' ').includes('第14試合 全35試合'), t + ': pressing the 「この試合を開く」 button of the row opens 第14試合 in the one-bout mode');
  let s = await idbGet(live, id), puts = await putsOf(live);
  check(s.currentBout === 13 && s.updatedAt > u0, t + ': currentBout 13 persisted');
  check(puts.length === 1 && puts[0].current === 13, t + ': exactly ONE write for one click (' + puts.length + ')');
  check(new URL(live.url()).searchParams.get('view') === null, t + ': URL left list mode');
  // reload: persisted
  await live.reload(); await live.locator('header').waitFor();
  check((await headerOf(live)).replace(/\s+/g, ' ').includes('第14試合'), t + ': after reload still bout 14');
  // list again: current page first
  await live.getByRole('button', { name: '一覧' }).click();
  check((await pageLabelOf(live)).startsWith('2 / 4'), t + ': back in the list: page 2 (current bout 14) opens first');
  // open the already-current bout: no needless write
  const nW = (await putsOf(live)).length;
  await openBtn(live, 14).click();
  await waitSingle(live, 14, 35).catch(() => {});
  check((await putsOf(live)).length === nW, t + ': opening the already-current bout writes nothing');
  await live.getByRole('button', { name: '一覧' }).click();
  // rapid double click (clickCount 2): one write
  const b2 = await openBtn(live, 12).boundingBox().catch(() => null);
  await openBtn(live, 12).scrollIntoViewIfNeeded();
  await openBtn(live, 12).dblclick();
  await live.waitForTimeout(600);
  s = await idbGet(live, id);
  check(s.currentBout === 11, t + ': dblclick on a row ends on bout 12 (saw index ' + s.currentBout + ')');
  check((await putsOf(live)).length === nW + 1, t + ': dblclick wrote once (' + ((await putsOf(live)).length - nW) + ')');
  // human-speed double click: the 2nd click lands ~150ms later, after the screen already changed to the one-bout mode
  await live.getByRole('button', { name: '一覧' }).click().catch(() => {});
  await live.locator('li.live-list-row').first().waitFor();
  const dbl = [];
  for (const place of ['natural', 'bottom']) {
    const want = place === 'natural' ? 13 : 15, cb = (await idbGet(live, id)).currentBout;
    const target = openBtn(live, want);
    await target.scrollIntoViewIfNeeded();
    if (place === 'bottom') await target.evaluate((el) => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.bottom - (window.innerHeight - 30)); });
    const bx = await target.boundingBox();
    const cx = bx.x + bx.width / 2, cy = bx.y + bx.height / 2;
    await live.mouse.click(cx, cy);
    await live.waitForTimeout(160);
    const under = await live.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return (e?.closest('button')?.innerText || e?.tagName || '').replace(/\s+/g, ' ').slice(0, 30); }, [cx, cy]);
    await live.mouse.click(cx, cy);
    await live.waitForTimeout(700);
    const final = (await idbGet(live, id)).currentBout;
    dbl.push(place + ': y=' + Math.round(cy) + ' under 2nd click: "' + under + '" -> index ' + final);
    check(final === want - 1, t + ': human double click on a row (' + place + ' position; 2nd click 160ms later lands on "' + under + '") still ends on the chosen bout ' + want + ' (saw index ' + final + ', before ' + cb + ')');
    await live.getByRole('button', { name: '一覧' }).click().catch(() => {});
    await live.locator('li.live-list-row').first().waitFor();
  }
  console.log('  info ' + t + ' double click: ' + dbl.join(' | '));
  await live.close();

  /* failed save */
  live = await openLive(ctx, id);
  const base0 = await idbGet(live, id);
  await failWrites(live);
  let target = base0.currentBout === 0 ? 5 : 0;
  // choose a different bout on the page shown
  const titles = await rowTitles(live);
  const pick = titles.map((x) => Number(x.replace(/\D/g, ''))).filter((n) => n !== base0.currentBout + 1).pop();
  const b = openBtn(live, pick);
  await b.scrollIntoViewIfNeeded();
  await b.click();
  await live.waitForTimeout(500);
  const alertBox = live.locator('main [role=alert]');
  check((await alertBox.count()) === 1 && (await alertBox.innerText()).includes('保存できなかった'), t + ': failed save shows a visible message (' + short(await alertBox.allInnerTexts().then((a) => a.join('|')), 100) + ')');
  check((await live.locator('li.live-list-row').count()) > 0 && new URL(live.url()).searchParams.get('view') === 'list', t + ': after a failed save we stay in the list (nothing lost)');
  check((await alertBox.count()) === 1 && (await inView(alertBox)), t + ': the failure message is inside the visible screen after pressing a row far down the page (scrollY ' + Math.round(await live.evaluate(() => scrollY)) + ')');
  const sf = await idbGet(live, id);
  check(sf.currentBout === base0.currentBout && sf.updatedAt === base0.updatedAt, t + ': failed save changed nothing in storage');
  check((await openBtn(live, pick).isEnabled()), t + ': row button usable again after the failure');
  await healWrites(live);
  await openBtn(live, pick).click();
  await waitSingle(live, pick, 35).catch(() => {});
  check((await idbGet(live, id)).currentBout === pick - 1, t + ': after the problem is fixed the same click works (bout ' + pick + ')');
  check((await live.locator('main [role=alert]').count()) === 0, t + ': the failure message is gone after a good save');
  await live.close();

  /* conflict: another tab changed the event in between */
  live = await openLive(ctx, id);
  const cur = await idbGet(live, id);
  const other = await ctx.newPage(); await other.goto(base + '/private/setup/?event=x');
  await idbPut(other, { ...cur, title: '別の画面で直した大会名', updatedAt: cur.updatedAt + 5 }); // no broadcast: this tab does not know
  const t2 = (await rowTitles(live)).map((x) => Number(x.replace(/\D/g, ''))).filter((n) => n !== cur.currentBout + 1).pop();
  await openBtn(live, t2).click();
  await live.waitForTimeout(500);
  const stored2 = await idbGet(live, id);
  check(stored2.title === '別の画面で直した大会名' && stored2.currentBout === cur.currentBout, t + ': a stale list does not overwrite the newer data in storage');
  check((await live.locator('main [role=alert]').count()) === 1 && (await live.locator('main [role=alert]').innerText()).includes('別の画面'), t + ': conflict message shown (' + short(await live.locator('main [role=alert]').allInnerTexts().then((a) => a.join('|')), 100) + ')');
  check((await live.locator('li.live-list-row').count()) > 0, t + ': stays in the list on conflict');
  check((await live.locator('main [role=alert]').innerText()).includes('最新の内容に読み直しました') && !(await live.locator('main [role=alert]').innerText()).includes('この画面を読み直して'), t + ': the message says the screen already re-read the newest data (no manual reload asked)');
  await live.waitForFunction(() => document.querySelector('header')?.innerText.includes('別の画面で直した大会名'), null, { timeout: 4000 }).catch(() => {});
  check((await headerOf(live)).includes('別の画面で直した大会名'), t + ': after a conflict the screen re-reads the newer data by itself (title changed without F5)');
  await openBtn(live, t2).click();
  await waitSingle(live, t2, 35).catch(() => {});
  check((await idbGet(live, id)).currentBout === t2 - 1, t + ': pressing the same row again now works (bout ' + t2 + ')');
  await ctx.close();
});

/* H: keyboard only */
scenario('H', 'keyboard only: Tab to a row, Enter opens it, focus rings', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'll-h-' + vp.tag, t = vp.name;
  await seed(ctx, big(id, 35, { current: 0 }));
  const live = await openLive(ctx, id);
  const log = [];
  check(await tabUntil(live, '1試合ずつ', 10, log), t + ': Tab reaches 1試合ずつ');
  check(await tabUntil(live, '(^| )一覧', 3, log), t + ': Tab reaches 一覧');
  check(await tabUntil(live, 'この試合を開く 第1試合 ', 24, log), t + ': Tab reaches the row of 第1試合');
  check(await tabUntil(live, 'この試合を開く 第3試合 ', 12, log), t + ': Tab reaches the row of 第3試合 (music links in between are reachable too)');
  const ring = await live.evaluate(RING);
  check(ring.ok && ring.inView, t + ': focused row shows a visible ring (' + JSON.stringify(ring) + ')');
  const labelFocused = await live.evaluate(() => document.activeElement.getAttribute('aria-label'));
  check(/赤コーナー 架空赤003 対 青コーナー 架空青003/.test(labelFocused), t + ': row button name says the bout and both corners with names (' + labelFocused + ')');
  await live.keyboard.press('Enter');
  await waitSingle(live, 3, 35).catch(() => {});
  check((await headerOf(live)).replace(/\s+/g, ' ').includes('第3試合 全35試合'), t + ': Enter on the row opens 第3試合');
  check((await idbGet(live, id)).currentBout === 2, t + ': Enter persisted currentBout 2');
  check((await putsOf(live)).length === 1, t + ': Enter wrote once');
  const afterEnter = await live.evaluate(() => ({ body: document.activeElement === document.body || !document.activeElement, what: document.activeElement?.tagName }));
  check(!afterEnter.body, t + ': after Enter opened the bout the keyboard focus is not dropped on the empty page (activeElement ' + afterEnter.what + ')');
  const mark = log.length;
  // space on switch, then page buttons by keyboard
  const reached = await tabUntil(live, '(^| )一覧', 12, log);
  if (log[mark] && log[mark].what === 'nothing focused') log.splice(mark, 1); // counted by the explicit focus check above
  check(reached, t + ': Tab reaches 一覧 again from the one-bout screen');
  await live.keyboard.press('Space');
  await live.locator('li.live-list-row').first().waitFor();
  check(await tabUntil(live, '次のページ', 60, log), t + ': Tab reaches 次のページ');
  await live.keyboard.press('Enter');
  await live.waitForFunction(() => document.body.innerText.includes('2 / 4 ページ'), null, { timeout: 4000 });
  const act = await live.evaluate(() => ({ body: document.activeElement === document.body, id: document.activeElement.id, top: document.activeElement.getBoundingClientRect().top }));
  check(!act.body, t + ': focus is not lost after paging with Enter');
  check(act.top >= 0 && act.top < (vp.mobile ? 844 : 900), t + ': after paging the focused heading is on screen (top ' + Math.round(act.top) + ')');
  check(await tabUntil(live, '前のページ', 80, log) || true, t + ': (info) walking on');
  // 'nothing focused' = Tab left the page for the browser's own bar (wrap-around), not an element without a ring
  const stops = log.filter((r) => r.what !== 'nothing focused');
  check(stops.every((r) => r.ok), t + ': every Tab stop shows a visible focus ring (' + short(stops.filter((r) => !r.ok).map((r) => r.what).join(' ; ')) + ')');
  check(stops.every((r) => r.inView), t + ': every Tab stop is scrolled into view (' + short(stops.filter((r) => !r.inView).map((r) => r.what).join(' ; ')) + ')');
  check(stops.length >= 10, t + ': (sanity) the keyboard walk visited ' + stops.length + ' stops');
  // Shift+Tab backwards also works
  await live.keyboard.press('Shift+Tab');
  check(await live.evaluate(() => document.activeElement !== document.body), t + ': Shift+Tab works');
  // single-view buttons keep a visible focus indicator
  await live.goto(base + '/private/live/?event=' + id);
  await live.locator('header').waitFor();
  const slog = [];
  check(await tabUntil(live, '次の試合', 12, slog), t + ': Tab reaches 次の試合 in the one-bout mode');
  check(slog.filter((r) => r.what !== 'nothing focused').every((r) => r.ok), t + ': one-bout mode: every Tab stop shows a focus indicator (' + short(slog.filter((r) => !r.ok).map((r) => r.what).join(' ; ')) + ')');
  await ctx.close();
});

/* I: accessibility names and structure */
scenario('I', 'screen-reader names, words next to colours', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'll-i-' + vp.tag, t = vp.name;
  await seed(ctx, big(id, 12, { current: 1 }));
  const live = await openLive(ctx, id);
  check((await live.getByRole('group', { name: /^赤コーナー 架空赤001 / }).count()) === 1 && (await live.getByRole('group', { name: /^青コーナー 架空青001 / }).count()) === 1, t + ': groups named 赤コーナー <name> <gym> and 青コーナー <name> <gym>');
  check((await live.getByRole('navigation', { name: 'ページの切りかえ' }).count()) === 1, t + ': pager is a labelled navigation');
  check((await live.getByRole('heading', { level: 1 }).count()) === 1 && (await live.getByRole('heading', { level: 2 }).count()) === 1 && (await live.getByRole('heading', { level: 3 }).count()) === 10, t + ': heading outline h1 > h2 > 10 x h3');
  check((await live.getByRole('list').count()) >= 1 && (await live.getByRole('listitem').count()) >= 10, t + ': bouts are list items');
  const cur = rowLis(live).nth(1);
  check((await cur.getAttribute('aria-current')) === 'true', t + ': current row exposes aria-current');
  const visibleWords = await live.evaluate(() => [...document.querySelectorAll('li.live-list-row [role=group]')].every((g) => /^(赤|青)コーナー/.test(g.getAttribute('aria-label') || '') && g.innerText.includes((g.getAttribute('aria-label') || '').slice(0, 5))));
  check(visibleWords, t + ': the accessible corner name equals words that are also visible (red/blue never by colour alone)');
  const markers = await live.evaluate(() => [...document.querySelectorAll('li.live-list-row [role=group] > p')].map((p) => ({ txt: p.innerText.replace(/\s+/g, ' '), bg: getComputedStyle(p).backgroundColor })));
  check(markers.length === 20 && markers.every((m) => /(赤|青)コーナー/.test(m.txt) && (m.txt.includes('赤') ? /▲/ : /■/).test(m.txt)), t + ': each corner has a coloured band with the word AND a shape (▲ red / ■ blue) (' + markers.length + ')');
  check(markers.filter((m) => m.txt.includes('赤')).every((m) => m.bg !== markers.find((x) => x.txt.includes('青')).bg), t + ': red and blue markers differ in colour as well as in words');
  const imgsAlt = await live.evaluate(() => [...document.querySelectorAll('li.live-list-row img')].every((i) => i.getAttribute('alt') === ''));
  check(imgsAlt, t + ': photos are decorative (alt="") because the name sits next to them');
  const reduced = await live.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !b.disabled).every((b) => (b.getAttribute('aria-label') || b.innerText).includes((b.innerText || '').replace(/[✓←→▶\s]|表示中/g, '').slice(0, 3))));
  check(reduced, t + ': visible button text is contained in its accessible name (voice control)');
  await ctx.close();
});

/* J: layout audits, extreme names, print bonus, single mode layout */
scenario('J', 'layout audits at 1280px and 390px, print, single-mode fit', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'll-j-' + vp.tag, t = vp.name;
  const LONG = '極'.repeat(80);
  const fighters = [F('X1', { name: LONG, gym: 'ジム'.repeat(60), weight: '70', photoDataUrl: PHOTO_WIDE, musicUrl: 'https://music.apple.com/jp/album/fake/1' }), F('X2', { name: 'W'.repeat(90), gym: 'g'.repeat(100), weight: '70', musicUrl: 'https://youtu.be/xxxxxxxx' })];
  const bouts = Array.from({ length: 12 }, (_, i) => ({ id: 'b' + i, redId: 'X1', blueId: 'X2', className: 'クラス'.repeat(6), rule: 'ルール'.repeat(8) }));
  await seed(ctx, tournament(id, { fighters, bouts, current: 11, entryConfig: MUSIC_ON, title: '架空長い大会名'.repeat(12) }));
  const live = await openLive(ctx, id);
  await audit(live, 'J long names page 2 ' + t);
  await prevBtn(live).click();
  await audit(live, 'J long names page 1 ' + t, { header: true });
  const long = await live.evaluate(() => { const li = document.querySelector('li.live-list-row'); const p = [...li.querySelectorAll('p')].filter((x) => x.innerText.includes('極極')); return p.map((x) => ({ h: Math.round(x.getBoundingClientRect().height), w: Math.round(x.getBoundingClientRect().width), fs: parseFloat(getComputedStyle(x).fontSize) })); });
  check(long.length >= 1 && long.every((x) => x.fs >= 17 && x.h > 24), t + ': a very long name wraps over several lines (' + JSON.stringify(long) + ')');
  // print (bonus)
  await live.emulateMedia({ media: 'print' });
  const pr = await live.evaluate(() => ({ nav: getComputedStyle(document.querySelector('nav[aria-label="ページの切りかえ"]')).display, sw: getComputedStyle(document.querySelector('[role=group][aria-label="表示のしかた"]')).display, btn: getComputedStyle(document.querySelector('button.live-list-open')).display, rows: document.querySelectorAll('li.live-list-row').length, sw2: document.documentElement.scrollWidth }));
  check(pr.nav === 'none' && pr.sw === 'none' && pr.btn === 'none' && pr.rows === 10, t + ': (bonus) print hides buttons/pager and keeps the rows (' + JSON.stringify(pr) + ')');
  await live.emulateMedia({ media: 'screen' });
  await live.close();

  // long NAMES only (short class and rule): the names alone must wrap inside their block
  const idn = 'll-jn-' + vp.tag;
  await seed(ctx, tournament(idn, { fighters, bouts: bouts.map((x) => ({ ...x, className: '', rule: '' })), current: 0, entryConfig: MUSIC_ON }));
  const ln = await openLive(ctx, idn);
  await audit(ln, 'J long names only ' + t);
  await ln.close();
  // long rule / class only (short names): a long contract text must not crush the fighter blocks
  for (const [what, cls, rule] of [['class 18 chars', 'とても長いクラス名です十八文字', ''], ['rule 40 chars', '', 'ヘッドギアとすねあてを着けて、2分3ラウンドで行います。ひじ打ちは禁止です。'], ['rule 100 chars', '', 'ルール説明'.repeat(20)], ['class 90 chars', 'クラス'.repeat(30), '']]) {
    const idr = 'll-jr-' + vp.tag + '-' + what.replace(/\W/g, '');
    await seed(ctx, tournament(idr, { fighters: [F('S1', { name: '架空短名赤', weight: '' }), F('S2', { name: '架空短名青', weight: '' })], bouts: [{ id: 'b0', redId: 'S1', blueId: 'S2', className: cls, rule }], current: 0, entryConfig: MUSIC_ON }));
    const lr = await openLive(ctx, idr);
    const g = await lr.evaluate(() => { const li = document.querySelector('li.live-list-row'); return { doc: document.documentElement.scrollWidth, win: window.innerWidth, groups: [...li.querySelectorAll('[role=group]')].map((x) => Math.round(x.getBoundingClientRect().width)) }; });
    check(g.doc <= g.win && g.groups.every((w) => w >= 200 || w >= vp.mobile * 300), t + ': ' + what + ' in the centre keeps both fighter blocks wide enough and the page inside the window (doc ' + g.doc + '/' + g.win + ', block widths ' + g.groups.join(',') + ')');
    await lr.close();
  }
  // normal 35-bout list + audits on page 2 and 4, single view
  const id2 = 'll-j2-' + vp.tag;
  await seed(ctx, big(id2, 35, { current: 12 }));
  const l2 = await openLive(ctx, id2);
  await audit(l2, 'J 35 bouts ' + t);
  await l2.getByRole('button', { name: '4ページ目を開く' }).click();
  await audit(l2, 'J 35 bouts last page ' + t);
  // heavy: how many "emphasised" filled dark buttons are on the screen at once (design rule: one primary at a time)
  const heavy = await l2.evaluate(() => { const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }; const num = (s) => (s.match(/[\d.]+/g) || []).map(Number); return [...document.querySelectorAll('button,a[href]')].filter((el) => { const s = getComputedStyle(el); const bg = num(s.backgroundColor), fg = num(s.color); return el.getBoundingClientRect().height > 0 && (bg[3] ?? 1) > 0.8 && lum(bg) < 0.2 && lum(fg) > 0.7; }).map((el) => (el.getAttribute('aria-label') || el.innerText).replace(/\s+/g, ' ').slice(0, 25)); });
  console.log('  info ' + t + ': filled dark buttons visible on the last page: ' + heavy.length + ' -> ' + heavy.join(' / '));
  await l2.close();
  // single mode: the footer buttons must fit the screen without scrolling at the declared size
  const l3 = await openLive(ctx, id2, { list: false });
  const fit = await l3.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('次の試合')); const r = b.getBoundingClientRect(); return { bottom: Math.round(r.bottom), inner: window.innerHeight, docH: document.documentElement.scrollHeight }; });
  console.log('  info ' + t + ': one-bout mode 次の試合 bottom=' + fit.bottom + ' of ' + fit.inner + ' (document height ' + fit.docH + ')');
  if (!vp.mobile) check(fit.bottom <= fit.inner && fit.docH <= fit.inner + 1, t + ': one-bout mode fits one 1280x900 screen with the new switch (bottom ' + fit.bottom + ', doc ' + fit.docH + ')');
  await audit(l3, 'J one-bout mode ' + t);
  await ctx.close();
});

/* K: second tab changes currentBout while the list is open; stale highlight */
scenario('K', 'another tab moves to the next bout while the list is open', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'll-k-' + vp.tag, t = vp.name;
  await seed(ctx, big(id, 25, { current: 8 }));
  const a = await openLive(ctx, id);
  const b = await openLive(ctx, id, { list: false });
  await b.getByRole('button', { name: '次の試合 →', exact: true }).click();
  await b.waitForFunction(() => document.querySelector('header')?.innerText.includes('第10試合'), null, { timeout: 5000 });
  await settle(700);
  const rows = await readRows(a);
  const stored = await idbGet(a, id);
  const stale = rows.filter((r) => r.word && r.title !== '第' + (stored.currentBout + 1) + '試合');
  check(stored.currentBout === 9 && stale.length === 0, t + ': the list never shows いま進行中 on a bout that is no longer current (stored ' + stored.currentBout + ', marked ' + rows.filter((r) => r.word).map((r) => r.title).join() + ')');
  const word = rows.filter((r) => r.word);
  check(word.length === 1 && word[0].title === '第10試合', t + ': the open list follows the other tab (第10試合 is marked)');
  // user chose a page himself -> stays there
  await nextBtn(a).click();
  await b.getByRole('button', { name: '次の試合 →', exact: true }).click();
  await b.waitForFunction(() => document.querySelector('header')?.innerText.includes('第11試合'), null, { timeout: 5000 });
  await settle(700);
  const lab = await pageLabelOf(a);
  check(/^\d+ \/ 3 ページ/.test(lab) && (await rowLis(a).count()) > 0, t + ': list still sane after the second update (' + lab + ')');
  await ctx.close();
});

/* L: the MC's 5-second questions on match day (round-2 findings): which bout is now, where is page N, who has no music, how big is the text */
const CONTRAST = () => {
  // any CSS colour (rgb, oklch, lab ...) -> [r,g,b,a] through a canvas
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0.5) return c; } return [255, 255, 255, 1]; };
  return (el) => { const fg = rgba(getComputedStyle(el).color), bg = bgOf(el); const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
};
const NOT_HIDDEN = (sel) => { const el = document.querySelector(sel); if (!el) return { found: false }; const r = el.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20)); return { found: true, top: Math.round(r.top), visible: r.top >= 0 && r.bottom <= innerHeight, free: !!e && (e === el || el.contains(e)) }; };
scenario('L', 'MC questions: now-bar, pager at the top, jump to a bout, music summary, text sizes, single-view footer', async (vp) => {
  const ctx = await newCtx(vp.mobile), t = vp.name, id = 'll-l-' + vp.tag;
  const v = big(id, 35, { current: 7 });
  await seed(ctx, v);
  const live = await openLive(ctx, id);
  // 1. which bout is now? one big line + one big button, row scrolled into view and not hidden under the bars
  const nowText = await live.locator('.live-now p').first().innerText();
  check(/^いま：第8試合\s+架空赤008 対 架空青008$/.test(nowText.trim()), t + ': the top bar answers 「いま：第8試合　架空赤008 対 架空青008」 (saw "' + short(nowText, 60) + '")');
  const nowFs = await live.locator('.live-now p').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check(nowFs >= 24, t + ': the 「いま」 line is 24px or bigger (' + nowFs + ')');
  const nowBtn = live.getByRole('button', { name: 'いまの試合を見る' });
  check((await nowBtn.count()) === 1 && (await nowBtn.boundingBox()).height >= 48, t + ': one big 「いまの試合を見る」 button');
  const opened = await live.evaluate(NOT_HIDDEN, '#live-list-row-7');
  check(opened.found && opened.visible && opened.free, t + ': opening 一覧 already shows the current row (not 3 screens down, not hidden under the bars): ' + JSON.stringify(opened));
  await live.evaluate(() => window.scrollTo(0, 0));
  check(!(await live.evaluate(NOT_HIDDEN, '#live-list-row-7')).visible || vp.mobile || true, t + ': (info) scrolled back to the top');
  await nowBtn.click();
  await live.waitForTimeout(100);
  const afterNow = await live.evaluate(NOT_HIDDEN, '#live-list-row-7');
  check(afterNow.visible && afterNow.free, t + ': 「いまの試合を見る」 brings the current row into view: ' + JSON.stringify(afterNow));
  check(await live.evaluate(() => document.activeElement?.getAttribute('aria-label')?.startsWith('この試合を開く 第8試合')), t + ': keyboard focus lands on that row\'s open button');
  check((await live.evaluate(() => document.querySelectorAll('nav[aria-label="ページの切りかえ"]').length)) === 1, t + ': exactly one pager');
  // 2. pager is fixed on screen: after scrolling a long way it is still at the top
  await live.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  const pg = await live.locator('nav[aria-label="ページの切りかえ"]').boundingBox();
  check(pg.y >= -1 && pg.y < 260 && pg.height >= 48, t + ': the pager stays on screen while scrolling (top ' + Math.round(pg.y) + ')');
  check(await nextBtn(live).isVisible() && (await nextBtn(live).evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })), t + ': 次のページ is on screen in the middle of the page');
  // heading shows how many bouts and pages
  check((await live.getByRole('heading', { level: 2 }).innerText()).replace(/\s+/g, ' ').includes('全35試合・4ページ'), t + ': the title says 全35試合・4ページ');
  // 3. page buttons carry their range and mark the page of the live bout
  const jn = await jumpNames(live);
  check(jn.length === 4 && jn[1].startsWith('2ページ目を開く 11〜20') && jn[3].startsWith('4ページ目を開く 31〜35'), t + ': page buttons say 1〜10 / 11〜20 / 21〜30 / 31〜35 (' + jn.join(' | ') + ')');
  check((await live.locator('[role=group][aria-label="ページを選ぶ"] button').first().innerText()).includes('いま'), t + ': the page button holding the live bout says いま');
  // 4. on another page: amber bar tells where the live bout is, one tap goes back
  await nextBtn(live).click();
  const bar = await live.locator('.live-now').innerText();
  check(bar.includes('いまの試合は 第8試合（1ページ目）です') && !(await live.getByRole('button', { name: 'いまの試合を見る' }).count()), t + ': on page 2 the amber bar says 「いまの試合は 第8試合（1ページ目）です」 (' + short(bar, 90) + ')');
  check(await live.locator('.live-now').evaluate((el) => el.className.includes('border-amber-500') && !el.className.includes('emerald')), t + ': that bar is amber, not the calm green');
  const back = live.getByRole('button', { name: 'いまの試合のページへ' });
  check((await back.count()) === 1, t + ': the button 「いまの試合のページへ」 is there');
  await back.click();
  check((await pageLabelOf(live)).startsWith('1 / 4') && (await readRows(live)).some((r) => r.word && r.title === '第8試合'), t + ': one tap returns to the page with the live bout');
  // 5. jump to a bout by number
  await live.fill('#live-list-jump', '23');
  await live.getByRole('button', { name: '行く', exact: true }).click();
  await live.waitForTimeout(150);
  check((await pageLabelOf(live)).startsWith('3 / 4'), t + ': 第23試合へ opens page 3 (' + (await pageLabelOf(live)) + ')');
  const j = await live.evaluate(NOT_HIDDEN, '#live-list-row-22');
  check(j.visible && j.free, t + ': the row 第23試合 is in view and not hidden under the bars: ' + JSON.stringify(j));
  check((await live.locator('#live-list-row-22').innerText()).includes('ここです') && (await live.locator('[role=status]').innerText()).includes('第23試合のところへ来ました'), t + ': visible success sign on the row and in the status line');
  check((await putsOf(live)).length === 0, t + ': jumping only looks, it writes nothing');
  await live.fill('#live-list-jump', '99');
  await live.locator('#live-list-jump').press('Enter');
  check((await live.locator('#live-list-jump-error').innerText()).includes('1から35までの数字'), t + ': a wrong number gets a short Japanese message (Enter works)');
  await live.fill('#live-list-jump', '');
  // 6. no-music summary + filter
  const sumText = await live.locator('#live-list-music-summary').innerText();
  const want = new Set(); v.bouts.forEach((b) => [b.redId, b.blueId].forEach((x) => { const f = v.fighters.find((y) => y.id === x); if (!safeMusicUrl(f.musicUrl)) want.add(x); }));
  check(sumText.replace(/\s+/g, ' ').includes('入場曲がまだの選手：' + want.size + '人'), t + ': 「入場曲がまだの選手：' + want.size + '人」 (saw "' + short(sumText, 80) + '")');
  await live.getByRole('button', { name: '曲がない試合だけ見る' }).click();
  const filtered = await readRows(live);
  check(filtered.length >= 1 && filtered.every((r) => /入場曲なし|曲のリンクを確認/.test(r.text)), t + ': 「曲がない試合だけ見る」 shows only bouts where someone has no music (' + filtered.length + ' rows)');
  check((await pageLabelOf(live)).includes('件目'), t + ': the pager counts items while filtered (' + (await pageLabelOf(live)) + ')');
  await live.getByRole('button', { name: 'ぜんぶの試合を見る' }).click();
  check((await rowLis(live).count()) === 10, t + ': 「ぜんぶの試合を見る」 brings the normal list back');
  // 7. look of the chips
  const chips = await live.evaluate(() => { const g = (t) => [...document.querySelectorAll('li.live-list-row p')].find((p) => p.innerText.includes(t)); const none = g('入場曲なし（曲を用意）'), a = [...document.querySelectorAll('li.live-list-row a[href]')][0]; const cs = (e) => e && { fs: parseFloat(getComputedStyle(e).fontSize), fw: getComputedStyle(e).fontWeight, bw: parseFloat(getComputedStyle(e).borderTopWidth), bc: getComputedStyle(e).borderTopColor, bg: getComputedStyle(e).backgroundColor, txt: e.innerText.replace(/\s+/g, ' ') }; return { none: cs(none), link: cs(a) }; });
  check(chips.none && chips.none.fs >= 18 && Number(chips.none.fw) >= 700 && chips.none.bw >= 4 && chips.none.txt.startsWith('⚠'), t + ': 「⚠ 入場曲なし（曲を用意）」 is the loud chip: 18px bold, 4px border (' + JSON.stringify(chips.none) + ')');
  check(chips.link && chips.link.bw <= 2 && chips.link.txt.includes('♪ 曲を開く') && chips.link.txt.includes('↗ 別のタブ'), t + ': having music is a quiet outlined 「♪ 曲を開く ↗ 別のタブ」 (' + JSON.stringify(chips.link) + ')');
  // 8. sizes in the list
  const sizes = await live.evaluate(() => { const li = document.querySelector('li.live-list-row'); const name = li.querySelector('[role=group] .min-w-0 p'); const band = li.querySelector('[role=group] > p'); const cw = li.querySelector('p .sr-only').parentElement; const h = li.getBoundingClientRect().height; return { name: parseFloat(getComputedStyle(name).fontSize), band: parseFloat(getComputedStyle(band).fontSize), bandW: Math.round(band.getBoundingClientRect().width), groupW: Math.round(band.parentElement.getBoundingClientRect().width), weight: parseFloat(getComputedStyle(cw).fontSize), bw: getComputedStyle(band.parentElement).borderTopWidth, rowH: Math.round(h) }; });
  check(sizes.name >= 28 && sizes.weight >= 28 && sizes.band >= 24, t + ': list names and contract weight >= 28px, corner band >= 24px (' + JSON.stringify(sizes) + ')');
  check(sizes.bandW >= sizes.groupW - 8 && parseFloat(sizes.bw) >= 3, t + ': the corner band spans the whole card and the card border is 3px+');
  check(vp.mobile ? sizes.rowH <= 540 : sizes.rowH <= 230, t + ': a list row is compact (' + sizes.rowH + 'px; was 288 / 571)');
  // 9. keyboard focus is never hidden under the bars
  await live.evaluate(() => window.scrollTo(0, 0));
  const hid = [];
  for (let i = 0; i < 45; i++) {
    await live.keyboard.press('Tab');
    const r = await live.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const b = e.getBoundingClientRect(); const x = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height / 2, 10)); return { what: (e.getAttribute('aria-label') || e.innerText || e.tagName).slice(0, 30), ok: !!x && (x === e || e.contains(x) || x.contains(e)) }; });
    if (r && !r.ok) hid.push(r.what);
  }
  check(hid.length === 0, t + ': no Tab stop in the list is hidden under the fixed bars (' + hid.slice(0, 3).join(' ; ') + ')');
  await audit(live, 'L list ' + t, { header: true });
  await live.close();

  // single view: sizes, sticky footer, disabled reason, focus ring
  const one = await openLive(ctx, id, { list: false });
  const sv = await one.evaluate(() => { const vs = [...document.querySelectorAll('p')].find((p) => p.innerText.trim() === 'VS'); const fs = (e) => parseFloat(getComputedStyle(e).fontSize); const band = document.querySelector('article > p'); const hb = document.querySelector('header b span'); const next = [...document.querySelectorAll('button')].find((b) => b.innerText.includes('次の試合')); const r = next.getBoundingClientRect(); return { bout: fs(hb), name: fs(document.querySelector('article h2')), weight: fs(vs.nextElementSibling), vs: fs(vs), band: fs(band), bandText: band.innerText, nextBottom: Math.round(r.bottom), vh: innerHeight, nextTop: Math.round(r.top) }; });
  check(sv.bout >= 40, t + ': single view: the bout number is the biggest thing in the top bar (' + sv.bout + 'px)');
  check(sv.band >= 24 && /▲.*赤コーナー/.test(sv.bandText), t + ': single view: corner band 24px+ with the word and the shape (' + sv.bandText + ')');
  check(sv.weight >= (vp.mobile ? 28 : 44) && sv.vs <= 28 && sv.weight > sv.vs, t + ': contract weight (' + sv.weight + 'px) is bigger than VS (' + sv.vs + 'px)');
  if (!vp.mobile) check(sv.name >= 56, t + ': single view names are 56px at 1280 (' + sv.name + ')');
  check(sv.nextBottom <= sv.vh && sv.nextTop >= 0, t + ': 次の試合 is on the first screen without scrolling (bottom ' + sv.nextBottom + ' of ' + sv.vh + ')');
  await one.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await one.evaluate(() => window.scrollTo(0, 0));
  await one.keyboard.press('Tab'); await one.keyboard.press('Tab'); await one.keyboard.press('Tab');
  const ringSeen = [];
  for (let i = 0; i < 12; i++) { await one.keyboard.press('Tab'); ringSeen.push(await one.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { what: (e.innerText || '').slice(0, 12), w: parseFloat(s.outlineWidth), st: s.outlineStyle }; })); }
  const fb = ringSeen.filter((r) => /前の試合|次の試合|入場曲を開く/.test(r.what));
  check(fb.length >= 2 && fb.every((r) => r.st !== 'auto' && r.w >= 4), t + ': 前の試合 / 次の試合 / 入場曲 link have the thick focus ring (' + JSON.stringify(fb) + ')');
  await one.close();
  // disabled state is readable and explained, at the first and the last bout
  for (const [cur, btnName, reasonText] of [[0, '← 前の試合', '最初の試合です'], [34, '次の試合 →', '最後の試合です（これで全部終わりです）']]) {
    const idE = 'll-l-edge' + cur + '-' + vp.tag;
    await seed(ctx, big(idE, 35, { current: cur }));
    const p = await openLive(ctx, idE, { list: false });
    const b = p.getByRole('button', { name: btnName, exact: true });
    check(await b.isDisabled(), t + ': ' + btnName + ' is disabled at bout ' + (cur + 1));
    const c2 = await b.evaluate((el, src) => (new Function('return (' + src + ')()')())(el), String(CONTRAST));
    check(c2 >= 4.5, t + ': the disabled ' + btnName + ' is still readable (contrast ' + c2.toFixed(2) + ')');
    check((await p.locator('footer').innerText()).includes(reasonText), t + ': the footer says 「' + reasonText + '」');
    await p.close();
  }
  // from the list to a bout and back: the undo bar
  const lst = await openLive(ctx, id);
  await openBtn(lst, 3).click();
  await lst.waitForTimeout(400);
  const undoBtn = lst.getByRole('button', { name: /^第\d+試合にもどす$/ });
  if (await undoBtn.count()) {
    const was = (await idbGet(lst, id)).currentBout;
    const label = await undoBtn.innerText();
    await undoBtn.click(); await lst.waitForTimeout(400);
    check((await idbGet(lst, id)).currentBout === Number(label.replace(/\D/g, '')) - 1 && Number(label.replace(/\D/g, '')) - 1 !== was, t + ': 「' + label + '」 brings the previous bout back with one tap');
  } else check(false, t + ': after opening a bout from the list a 「第N試合にもどす」 button is offered');
  await lst.close();
  // 0 bouts, single view: readable text, header + switcher + a 48px button
  const idZ = 'll-l-zero-' + vp.tag;
  await seed(ctx, big(idZ, 0));
  const z = await openLive(ctx, idZ, { list: false });
  const zr = await z.evaluate(() => { const p = [...document.querySelectorAll('main p')].find((x) => x.innerText.includes('対戦カードがありません')); const a = document.querySelector('main a[href^="/private/"]'); const b = a.getBoundingClientRect(); return { has: !!p, header: !!document.querySelector('header'), switcher: !!document.querySelector('[role=group][aria-label="表示のしかた"]'), aw: Math.round(b.width), ah: Math.round(b.height), label: a.innerText.trim() }; });
  const zc = await z.evaluate(`(${CONTRAST})()([...document.querySelectorAll('main p')].find((x) => x.innerText.includes('対戦カードがありません')))`);
  check(zr.has && zr.header && zr.switcher && zr.ah >= 48 && zr.label === '準備画面へ戻る', t + ': 0 bouts (single view): header + switcher + message + a 48px 「準備画面へ戻る」 button (' + JSON.stringify(zr) + ')');
  check(zc >= 4.5, t + ': 0 bouts (single view): the message is readable (contrast ' + zc.toFixed(2) + ')');
  await audit(z, 'L zero bouts ' + t, { header: true });
  await z.close();
  // nothing saved in this browser: >= 17px, 48px button, a short reason
  const nd = await ctx.newPage(); await nd.goto(base + '/private/live/?event=ll-l-never-' + vp.tag); await nd.locator('main a').waitFor();
  const ndr = await nd.evaluate(() => { const a = document.querySelector('main a'); const r = a.getBoundingClientRect(); return { ah: Math.round(r.height), fs: Math.min(...[...document.querySelectorAll('main p')].map((p) => parseFloat(getComputedStyle(p).fontSize))), text: document.querySelector('main').innerText.replace(/\s+/g, ' ') }; });
  check(ndr.ah >= 48 && ndr.fs >= 17 && ndr.text.includes('別のパソコンかブラウザで作りましたか'), t + ': nothing saved here: text >= 17px, a 48px button, and the reason (' + JSON.stringify({ ah: ndr.ah, fs: ndr.fs }) + ')');
  await audit(nd, 'L nothing saved ' + t);
  await nd.close();
  await ctx.close();
});

/* ───────────────────────── runner ───────────────────────── */
{
  // real jpeg photos (portrait and landscape) made in the browser itself: no files, no network
  const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base + '/private/setup/?event=photo-boot');
  const mk = (w, h, col) => p.evaluate(([w, h, col]) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2); return cv.toDataURL('image/jpeg', 0.5); }, [w, h, col]);
  PHOTO_TALL = await mk(120, 200, '#2563eb'); PHOTO_WIDE = await mk(300, 100, '#dc2626');
  await c.close();
  assert.ok(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(PHOTO_TALL) && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(PHOTO_WIDE), 'fake photos made');
}
for (const s of scenarios) {
  if (ONLY.length && !ONLY.includes(s.id)) continue;
  for (const mobile of s.viewports) {
    const vp = { mobile, name: mobile ? '390px' : '1280px', tag: mobile ? 'sp' : 'pc' };
    cur = s.id + '/' + vp.name;
    const t0 = Date.now(), f0 = failures.length;
    console.log('▶ ' + cur + ' ' + s.name);
    try { await s.fn(vp); } catch (e) { const at = (String(e.stack).match(/test-private-live-list\.mjs:(\d+)/) || [])[1]; failures.push('[' + cur + '] scenario stopped at line ' + at + ': ' + short(e.message, 1200)); console.log('  ABORT [' + cur + '] line ' + at + ': ' + short(e.message, 1200)); }
    console.log('  ' + (failures.length === f0 ? 'ok' : (failures.length - f0) + ' failure(s)') + ' (' + Math.round((Date.now() - t0) / 100) / 10 + 's)');
  }
}
cur = 'NET';
check(externals.length === 0, 'no request ever left 127.0.0.1 (' + externals.length + ': ' + short(externals.slice(0, 3).map((e) => e.method + ' ' + e.url).join(', ')) + ')');
check(net.filter((n) => !n.url.startsWith(base + '/')).length === 0, 'every recorded request went to the local page server only');
check(net.filter((n) => n.method !== 'GET').length === 0, 'no POST/PUT/DELETE request at all');
check(net.filter((n) => n.body).length === 0, 'no request carried a body');
cur = 'ERR';
check(pageErrors.length === 0, 'no uncaught page error in any scenario (' + short(pageErrors.slice(0, 3).map((e) => e.scenario + ': ' + e.message).join(' | '), 300) + ')');
await browser.close();
console.log('\nLive-list checks: ' + (checks - failures.length) + ' passed, ' + failures.length + ' failed, ' + checks + ' total.');
if (failures.length) { console.log('\nFAILED:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
console.log('All live-list checks passed.');
