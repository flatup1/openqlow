/**
 * Checks for the A3 bout list (対戦一覧表) screen /private/sheet/: preview, pages, print layout (real PDF), privacy, missing photos,
 * absent fighters, re-output after a change, stored options, thumbnails, and the links from the prep / live screens.
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation. All data is fake.
 * Drives the REAL built pages (npm run build:private -> out-private-pages).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4995 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-bout-sheet.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4995), TOS_ONLY=A,B (scenario ids), TOS_CHROME_PATH, TOS_SHOTS=<dir> (also save screenshots / PDFs there).
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4995';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const SHOTS = process.env.TOS_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
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
let PHOTOS = [], BIG = '', REDISH = '', BLUEISH = '';
const F = (id, over = {}) => ({ id, gym: '架空' + id + 'ジム', name: '架空' + id + '選手', grade: '中1', age: '13', height: '150', weight: '45', record: '2勝1敗', comment: 'がんばります', musicUrl: '', photoDataUrl: '', ...over });
const B = (id, redId, blueId, over = {}) => ({ id, redId, blueId, className: '', rule: '', ...over });
const T = (id, o = {}) => ({ schema: 1, eventId: id, title: o.title ?? '千葉県キックボクシング協会アマチュア大会', venue: '架空体育館', date: '2026年12月20日', updatedAt: Date.now() - 60_000, currentBout: 0, fighters: o.fighters ?? [], bouts: o.bouts ?? [], ...(o.entryConfig ? { entryConfig: o.entryConfig } : {}) });
/** n bouts; photo: every fighter gets one / none / half */
function tournament(id, n, { photo = 'all', over = {} } = {}) {
  const fighters = [], bouts = [];
  for (let i = 1; i <= n; i++) {
    const withPhoto = photo === 'all' || (photo === 'half' && i % 2 === 1);
    fighters.push(F('r' + i, { photoDataUrl: withPhoto ? PHOTOS[i % PHOTOS.length] : '' }), F('b' + i, { photoDataUrl: withPhoto ? PHOTOS[(i + 3) % PHOTOS.length] : '' }));
    bouts.push(B('m' + i, 'r' + i, 'b' + i, i % 3 === 0 ? { className: '60kg契約' } : {}));
  }
  return T(id, { fighters, bouts, ...over });
}

/* ───────────────────────── browser helpers ───────────────────────── */
async function newCtx(viewport = { width: 1280, height: 900 }, extra = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...extra });
  ctx.on('request', (r) => { if (/^https?:/.test(r.url())) net.push({ scenario: cur, url: r.url(), method: r.method() }); });
  ctx.on('page', (page) => { page.on('pageerror', (e) => pageErrors.push({ scenario: cur, message: e.message })); page.on('dialog', (d) => d.dismiss().catch(() => {})); });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(base + '/')) return route.continue();
    externals.push({ scenario: cur, url, method: route.request().method() });
    return route.abort();
  });
  return ctx;
}
const idbPut = (p, value) => p.evaluate(([db, v]) => new Promise((res, rej) => {
  const r = indexedDB.open(db, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('events');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const d = r.result; const t = d.transaction('events', 'readwrite'); t.objectStore('events').put(v, v.eventId); t.oncomplete = () => { d.close(); res(true); }; t.onerror = () => rej(t.error); };
}), [DB_NAME, value]);
async function seed(ctx, value) {
  const boot = await ctx.newPage();
  await boot.goto(base + '/private/setup/?event=seed-boot');
  await idbPut(boot, value);
  await boot.close();
}
async function openSheet(ctx, id, { wait = true } = {}) {
  const page = await ctx.newPage();
  await page.goto(base + '/private/sheet/?event=' + id);
  await page.locator('main').waitFor({ timeout: 15000 });
  if (wait) await page.waitForFunction(() => !document.body.innerText.includes('このパソコンのデータを読んでいます'), null, { timeout: 15000 });
  return page;
}
/** wait until the small photos are ready (the print button unlocks) */
const photosReady = (p) => p.waitForFunction(() => { const b = document.getElementById('sheet-print'); return !b || !b.hasAttribute('aria-disabled'); }, null, { timeout: 20000 });
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const pagesOf = (p) => p.locator('.sheet-page').count();
const markers = (p) => p.evaluate(() => [...document.querySelectorAll('[data-tos-next="1"]')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()));
const shot = async (p, name, full = true) => { if (SHOTS) await p.screenshot({ path: SHOTS + '/' + name + '.png', fullPage: full }); };

/** make real JPEGs in the browser (varied colours; one big noisy one for the thumbnail check) */
async function makePhotos() {
  const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base + '/private/setup/?event=photo-boot');
  const out = await p.evaluate(() => {
    const make = (w, h, hue, noise) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.fillStyle = `hsl(${hue} 55% 60%)`; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, h * 0.38, w * 0.22, 0, 7); x.fill(); x.fillRect(w * 0.25, h * 0.58, w * 0.5, h * 0.4); if (noise) for (let i = 0; i < 4000; i++) { x.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`; x.fillRect(Math.random() * w, Math.random() * h, 6, 6); } return cv.toDataURL('image/jpeg', 0.92); };
    return { photos: [20, 80, 140, 200, 260, 320].map((h) => make(300, 400, h, false)), big: make(1200, 1600, 30, true), redish: make(300, 400, 0, false), blueish: make(300, 400, 240, false) };
  });
  await c.close();
  PHOTOS = out.photos; BIG = out.big; REDISH = out.redish; BLUEISH = out.blueish;
  assert.ok(PHOTOS.every((s) => /^data:image\/jpeg;base64,/.test(s)) && BIG.length > 200_000, 'fake photos were made');
}

/* ───────────────────────── scenarios ───────────────────────── */
const scenarios = [];
const scenario = (id, name, fn) => scenarios.push({ id, name, fn });
const PHONE = { width: 390, height: 844 }, SMALL = { width: 320, height: 568 }, DESKTOP = { width: 1280, height: 900 };

scenario('A', 'preview: title, page range, page number, two names and gyms per bout, photo boxes; no sideways scroll at 1280 / 390 / 320', async () => {
  for (const vp of [DESKTOP, PHONE, SMALL]) {
    const t = vp.width + 'px ';
    const ctx = await newCtx(vp);
    await seed(ctx, tournament('sh-a', 12, { photo: 'half' }));
    const p = await openSheet(ctx, 'sh-a');
    await photosReady(p);
    const info = await p.evaluate(() => ({
      h1: document.querySelector('h1')?.innerText, pages: document.querySelectorAll('.sheet-page').length, bouts: document.querySelectorAll('.sheet-bout').length,
      heads: [...document.querySelectorAll('.sheet-head')].map((h) => h.innerText.replace(/\s+/g, ' ').trim()),
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      photoBoxes: document.querySelectorAll('.sheet-photo').length, imgs: document.querySelectorAll('.sheet-photo img').length,
      note: document.getElementById('sheet-count-note')?.innerText,
    }));
    check(info.h1 === '対戦一覧表（A3）', t + 'the screen title is 「対戦一覧表（A3）」 (' + info.h1 + ')');
    check(info.pages === 3 && info.bouts === 12, t + '12 bouts -> 3 pages of 4 by default (' + info.pages + ' pages, ' + info.bouts + ' bouts)');
    check(info.heads.length === 3 && info.heads.every((h) => h.includes('千葉県キックボクシング協会アマチュア大会')), t + 'every page shows the tournament name (' + short(info.heads.join(' | '), 160) + ')');
    check(/第1〜4試合/.test(info.heads[0]) && /第5〜8試合/.test(info.heads[1]) && /第9〜12試合/.test(info.heads[2]), t + 'every page shows the bout range');
    check(/1 \/ 3 ページ/.test(info.heads[0]) && /3 \/ 3 ページ/.test(info.heads[2]), t + 'every page shows 「N / 全ページ」');
    check(info.sw <= info.cw, t + 'no sideways scroll (' + info.sw + ' vs ' + info.cw + ')');
    check(info.photoBoxes === 24 && info.imgs === 12, t + 'a photo box for every fighter; images only where a photo exists (' + info.photoBoxes + ' boxes, ' + info.imgs + ' images)');
    check(/全12試合 → A3 3枚（1ページ 4 試合）/.test(info.note || ''), t + 'the count line says how many sheets (' + info.note + ')');
    // every bout: two names + two gyms + number
    const bouts = await p.evaluate(() => [...document.querySelectorAll('.sheet-bout')].map((b) => ({ n: b.getAttribute('data-sheet-bout'), names: [...b.querySelectorAll('.sheet-name')].map((e) => e.innerText), gyms: [...b.querySelectorAll('.sheet-gym')].map((e) => e.innerText), no: b.querySelector('.sheet-no')?.innerText, corners: [...b.querySelectorAll('.sheet-corner')].map((e) => e.innerText) })));
    check(bouts.every((b, i) => b.names.length === 2 && b.gyms.length === 2 && b.no === String(i + 1)), t + 'each bout: number in order, two names, two gyms');
    check(bouts.every((b) => b.corners[0] === '▲ 赤' && b.corners[1] === '■ 青'), t + 'red is on the left, blue on the right, with words as well as shapes');
    const geo = await p.evaluate(() => [...document.querySelectorAll('.sheet-bout')].map((b) => { const r = b.querySelector('.sheet-red').getBoundingClientRect(), c = b.querySelector('.sheet-center').getBoundingClientRect(), bl = b.querySelector('.sheet-blue').getBoundingClientRect(); const col = (e) => getComputedStyle(e.querySelector('.sheet-corner')).color.match(/\d+/g).map(Number); return { left: r.right <= c.left + 1 && c.right <= bl.left + 1, rc: col(b.querySelector('.sheet-red')), bc: col(b.querySelector('.sheet-blue')) }; }));
    check(geo.every((g) => g.left), t + 'on the screen the red side is really LEFT of the number column and the blue side RIGHT of it (not only DOM order)');
    check(geo.every((g) => g.rc[0] > 150 && g.rc[1] < 80 && g.rc[2] < 80 && g.bc[2] > 150 && g.bc[0] < 80), t + 'the 赤 mark is red and the 青 mark is blue');
    const boxes = await p.evaluate(() => [...document.querySelectorAll('main label')].filter((l) => l.querySelector('input[type=checkbox]')).map((l) => ({ t: l.innerText.trim().slice(0, 12), h: l.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(l).fontSize), box: l.querySelector('input').getBoundingClientRect().width })));
    check(boxes.length === 4 && boxes.every((b) => b.h >= 47.5 && b.fs >= 17 && b.box >= 20), t + 'the four 「載せるもの」 checkboxes: label 17px+, row 48px+, box 20px+ (' + short(JSON.stringify(boxes.filter((b) => b.h < 47.5 || b.fs < 17 || b.box < 20)), 120) + ')');
    check(bouts[0].names[0] === '架空r1選手' && bouts[0].names[1] === '架空b1選手', t + 'left = red, right = blue');
    const yellow = await markers(p);
    check(yellow.length === 1 && /印刷の画面を開く/.test(yellow[0]), t + 'exactly one 👉 次はここ: open the print screen (' + short(yellow.join('|'), 80) + ')');
    // controls are readable and tappable (outside the paper preview)
    const small = await p.evaluate(() => {
      const bad = [];
      for (const e of document.querySelectorAll('main button, main input, main label, main a, main p, main h1, main h2, main span')) {
        if (e.closest('.sheet-wrap')) continue;
        const r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (e.children.length === 0 && (e.textContent || '').trim() && fs < 17) bad.push('font ' + fs + ': ' + (e.textContent || '').trim().slice(0, 20));
        if ((e.tagName === 'BUTTON' || e.tagName === 'A' || (e.tagName === 'INPUT' && e.type !== 'checkbox')) && r.height < 47.5) bad.push('tap ' + Math.round(r.height) + ': ' + (e.textContent || e.id || '').trim().slice(0, 20));
      }
      return bad;
    });
    check(small.length === 0, t + 'text is 17px or more and buttons are 48px tall outside the preview (' + short(small.join(' | '), 200) + ')');
    if (vp === DESKTOP) { await shot(p, 'A-preview-1280'); }
    await ctx.close();
  }
});

scenario('B', 'options: 1ページの試合数, 3枚 / 4枚 / 自動, orientation, what to show; remembered after a reload', async () => {
  const ctx = await newCtx(DESKTOP);
  await seed(ctx, tournament('sh-b', 12, { photo: 'all' }));
  const p = await openSheet(ctx, 'sh-b');
  await photosReady(p);
  check(await pagesOf(p) === 3, 'B default: 3 pages');
  await p.locator('#sheet-per-page').fill('6'); await settle(300);
  check(await pagesOf(p) === 2, 'B 6 per page -> 2 pages');
  check(/全12試合 → A3 2枚（1ページ 6 試合）/.test(await p.locator('#sheet-count-note').innerText()), 'B the count line follows');
  await p.getByRole('button', { name: 'A3を3枚にする', exact: true }).click(); await settle(200);
  check(await pagesOf(p) === 3 && (await p.locator('#sheet-per-page').inputValue()) === '4', 'B 「A3を3枚にする」 -> 4 per page, 3 pages');
  check((await p.locator('#sheet-pages-3').getAttribute('aria-pressed')) === 'true' && (await p.locator('#sheet-auto').getAttribute('aria-pressed')) === 'false', 'B the chosen button is marked as pressed (and 自動 is not)');
  await p.getByRole('button', { name: 'A3を4枚にする', exact: true }).click(); await settle(200);
  check(await pagesOf(p) === 4 && (await p.locator('#sheet-per-page').inputValue()) === '3', 'B 「A3を4枚にする」 -> 3 per page, 4 pages');
  await p.getByRole('button', { name: '1ページの試合数を1つふやす', exact: true }).click(); await settle(150);
  check((await p.locator('#sheet-per-page').inputValue()) === '4', 'B ＋ adds one');
  await p.getByRole('button', { name: /自動/ }).click(); await settle(200);
  check((await p.locator('#sheet-per-page').inputValue()) === '4' && await pagesOf(p) === 3, 'B 自動 returns to the suggested number');
  check((await p.locator('#sheet-auto').getAttribute('aria-pressed')) === 'true', 'B 自動 is marked as pressed');
  await p.locator('#sheet-per-page').fill('99'); await p.locator('#sheet-per-page').blur(); await settle(200);
  check((await p.locator('#sheet-per-page').inputValue()) === '14', 'B a number that is too big is held at the limit (14 portrait) when the box is left');
  check((await p.locator('#sheet-more').getAttribute('aria-disabled')) === 'true' && /これ以上ふやせません/.test(await p.locator('#sheet-limit-notes').innerText()), 'B at the top limit the ＋ button is locked and says why in words');
  await p.locator('#sheet-more').click({ force: true }); await settle(100);
  check((await p.locator('#sheet-per-page').inputValue()) === '14', 'B a locked ＋ does nothing');
  await p.locator('#sheet-per-page').fill('1'); await p.locator('#sheet-per-page').blur(); await settle(150);
  check((await p.locator('#sheet-less').getAttribute('aria-disabled')) === 'true' && /これ以上へらせません/.test(await p.locator('#sheet-limit-notes').innerText()), 'B at the bottom limit the － button is locked and says why in words');
  // orientation
  await p.locator('#sheet-per-page').fill('6'); await settle(150);
  await p.getByRole('button', { name: /横/ }).click(); await settle(300);
  check((await p.getByRole('button', { name: /横/ }).getAttribute('aria-pressed')) === 'true', 'B the chosen orientation is marked as pressed');
  const land = await p.evaluate(() => { const g = document.querySelector('.sheet-grid'); const pg = document.querySelector('.sheet-page'); return { cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, w: pg.getBoundingClientRect().width, h: pg.getBoundingClientRect().height, style: document.getElementById('sheet-page-size')?.textContent }; });
  check(land.cols === 2 && land.w > land.h, 'B landscape: two columns, wider than tall (' + land.cols + ' cols, ' + Math.round(land.w) + 'x' + Math.round(land.h) + ')');
  check(/A3 landscape/.test(land.style || ''), 'B the print page size says A3 landscape (' + land.style + ')');
  const order = await p.evaluate(() => [...document.querySelectorAll('.sheet-page')[0].querySelectorAll('.sheet-bout')].map((b) => ({ n: Number(b.getAttribute('data-sheet-bout')), x: Math.round(b.getBoundingClientRect().left), y: Math.round(b.getBoundingClientRect().top) })));
  check(order.slice(0, 3).every((b) => b.x === order[0].x) && order[3].x > order[0].x && order[3].y === order[0].y, 'B landscape: the left column is filled first, then the right (bout order stays top to bottom) (' + JSON.stringify(order.map((b) => b.n)) + ')');
  await shot(p, 'B-landscape');
  await p.getByRole('button', { name: /縦/ }).click(); await settle(200);
  // what to show
  await p.getByLabel('所属ジム').uncheck(); await p.getByLabel('小さな顔写真').uncheck(); await p.getByLabel('ルール').check(); await settle(200);
  const shown = await p.evaluate(() => ({ gyms: document.querySelectorAll('.sheet-gym').length, photos: document.querySelectorAll('.sheet-photo').length, names: document.querySelectorAll('.sheet-name').length }));
  check(shown.gyms === 0 && shown.photos === 0 && shown.names === 24, 'B gym off / photo off: names stay, gyms and photo boxes go (' + JSON.stringify(shown) + ')');
  // remembered
  await p.reload(); await p.locator('#sheet-per-page').waitFor(); await settle(300);
  check(!(await p.getByLabel('所属ジム').isChecked()) && !(await p.getByLabel('小さな顔写真').isChecked()) && await p.getByLabel('ルール').isChecked(), 'B the choices are remembered after a reload');
  check((await p.locator('#sheet-per-page').inputValue()) === '6', 'B the number per page is remembered after a reload');
  await ctx.close();
});

scenario('C', 'print: a real PDF. A3 size, one sheet per page, no blank extra page, no bout split across pages (portrait and landscape)', async () => {
  const ctx = await newCtx(DESKTOP);
  await seed(ctx, tournament('sh-c', 30, { photo: 'all' }));
  const p = await openSheet(ctx, 'sh-c');
  await photosReady(p);
  const MB = (buf) => { const m = buf.toString('latin1').match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/); return m ? [Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])] : null; };
  const pageCountOf = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  for (const [orient, per] of [['portrait', 8], ['landscape', 12]]) {
    if (orient === 'landscape') await p.getByRole('button', { name: /横/ }).click();
    await p.locator('#sheet-per-page').fill(String(per)); await settle(300);
    const expectPages = Math.ceil(30 / per);
    check(await pagesOf(p) === expectPages, 'C ' + orient + ': ' + expectPages + ' pages in the preview');
    await p.emulateMedia({ media: 'print' }); await settle(200);
    const geo = await p.evaluate(() => {
      const pages = [...document.querySelectorAll('.sheet-page')].map((pg) => ({ r: pg.getBoundingClientRect(), bouts: [...pg.querySelectorAll('.sheet-bout')].map((b) => b.getBoundingClientRect()) }));
      const px = (mm) => mm * 96 / 25.4;
      return { pages: pages.map((g) => ({ w: g.r.width / (96 / 25.4), h: g.r.height / (96 / 25.4), top: g.r.top, bottom: g.r.bottom, outside: g.bouts.filter((b) => b.top < g.r.top - 0.5 || b.bottom > g.r.bottom + 0.5 || b.left < g.r.left - 0.5 || b.right > g.r.right + 0.5).length })), px: px(1), noprint: [...document.querySelectorAll('.sheet-noprint')].filter((e) => getComputedStyle(e).display !== 'none').length };
    });
    check(geo.noprint === 0, 'C ' + orient + ': the controls are hidden in print');
    const printed = await p.evaluate(() => { const pg = [...document.querySelectorAll('.sheet-page')]; return { heads: pg.map((x) => x.querySelector('.sheet-head').innerText.replace(/\s+/g, ' ')), imgs: pg.map((x) => x.querySelectorAll('.sheet-photo img').length), order: pg.map((x) => [...x.querySelectorAll('.sheet-bout')].every((b) => b.querySelector('.sheet-red').getBoundingClientRect().left < b.querySelector('.sheet-blue').getBoundingClientRect().left)), grey: getComputedStyle(document.querySelector('.sheet-center')).backgroundColor }; });
    check(printed.heads.every((h, i) => h.includes('千葉県キックボクシング協会アマチュア大会') && new RegExp((i + 1) + ' / ' + printed.heads.length + ' ページ').test(h)), 'C ' + orient + ': in PRINT media every page header still shows the tournament name and 「N / 全ページ」 (' + short(printed.heads.join(' | '), 100) + ')');
    check(printed.imgs.every((n) => n > 0) && printed.order.every(Boolean), 'C ' + orient + ': in PRINT media the photos are there and red stays left of blue on every page');
    check(geo.pages.every((g) => g.outside === 0), 'C ' + orient + ': every bout lies inside its own page (none crosses a page edge)');
    const [W, H] = orient === 'portrait' ? [297, 419.5] : [420, 296.5];
    check(geo.pages.every((g) => Math.abs(g.w - W) < 0.6 && Math.abs(g.h - H) < 0.6), 'C ' + orient + ': every page is A3 (' + geo.pages.slice(0, 2).map((g) => Math.round(g.w) + 'x' + Math.round(g.h)).join(',') + ')');
    const pdf = await p.pdf({ preferCSSPageSize: true, printBackground: true });
    const size = MB(pdf), count = pageCountOf(pdf);
    const [pw, ph] = orient === 'portrait' ? [841.9, 1190.6] : [1190.6, 841.9];
    check(size && Math.abs(size[0] - pw) < 2 && Math.abs(size[1] - ph) < 2, 'C ' + orient + ': the PDF page is A3 ' + orient + ' (' + (size ? size.map(Math.round).join('x') : 'no MediaBox') + ')');
    check(count === expectPages, 'C ' + orient + ': the PDF has ' + expectPages + ' pages, no blank extra page (' + count + ')');
    if (SHOTS) writeFileSync(SHOTS + '/C-' + orient + '.pdf', pdf);
    await p.emulateMedia({ media: 'screen' });
  }
  await ctx.close();
});

scenario('D', 'privacy: phone, mail, birthday, health, consent, age, height, weight, record and the comment never appear on the screen or the paper', async () => {
  const ctx = await newCtx(DESKTOP);
  const data = tournament('sh-d', 4, { photo: 'all' });
  data.fighters[0] = { ...data.fighters[0], phone: '09011112222', contactPhone: '09033334444', contactEmail: 'taro@example.com', birthday: '2011-02-03', health: '持病あり', consent: 'yes', consentAt: '2026-10-01T00:00:00Z', guardian: '保護者こっそり', comment: '電話は 090-5555-6666 です', record: '3勝0敗', height: '171', weight: '61.5', age: '15', grade: '中3', musicUrl: 'https://music.apple.com/jp/album/x' };
  await seed(ctx, data);
  const p = await openSheet(ctx, 'sh-d');
  await photosReady(p);
  const html = (await p.content()).replace(/data:[^"')\s]+/g, 'data:'); // the photos are base64 text: numbers like 171 can appear by chance, so they are cut out before looking
  const text = await bodyText(p);
  for (const word of ['09011112222', '09033334444', 'taro@example.com', '2011-02-03', '持病', 'consent', '保護者こっそり', '090-5555-6666', '3勝0敗', '171', '61.5', '15歳', '中3', 'music.apple.com']) {
    check(!text.includes(word) && !html.includes(word), 'D 「' + word + '」 does not appear anywhere on the page');
  }
  check(/どの試合も、赤と青が決まっています/.test(text), 'D the page says it is fine to print');
  check(/電話番号・生年月日・健康のこと・同意の記録は、一覧表には出ません/.test(text) && /載せてよいかは、会長が決めます/.test(text), 'D the page says what is never printed and who decides what is printed');
  await ctx.close();
});

scenario('E', 'no photo: names and gyms still print; the count of fighters without a photo is told; the preview keeps its alignment', async () => {
  const ctx = await newCtx(DESKTOP);
  await seed(ctx, tournament('sh-e', 6, { photo: 'none' }));
  const p = await openSheet(ctx, 'sh-e');
  await photosReady(p);
  const info = await p.evaluate(() => ({ imgs: document.querySelectorAll('.sheet-photo img').length, boxes: document.querySelectorAll('.sheet-photo').length, names: [...document.querySelectorAll('.sheet-name')].map((e) => e.innerText), xs: [...document.querySelectorAll('.sheet-red .sheet-text')].map((e) => Math.round(e.getBoundingClientRect().left)) }));
  check(info.imgs === 0 && info.boxes === 12, 'E no image tags, but the empty photo boxes keep the names lined up (' + info.imgs + ' images, ' + info.boxes + ' boxes)');
  check(info.names.length === 12 && info.names.every((n) => /^架空/.test(n)), 'E all 12 names are there');
  check(new Set(info.xs).size === 1, 'E the red names start at the same x on every row');
  check(/写真がない選手が12人います/.test(await bodyText(p)), 'E the page tells how many fighters have no photo (「…12人…文字だけで出ます」)');
  await p.getByLabel('小さな顔写真').uncheck(); await settle(200);
  check(!/写真がない選手が/.test(await bodyText(p)), 'E with photos switched off the no-photo notice goes away');
  await p.getByLabel('小さな顔写真').check(); await settle(200);
  const btn = p.locator('#sheet-print');
  check((await btn.count()) === 1 && !(await btn.getAttribute('aria-disabled')), 'E printing is allowed without photos');
  // rows with and without photos: the names still start at the same x (the empty box keeps its width)
  await seed(ctx, tournament('sh-e2', 6, { photo: 'half' }));
  const mixed = await openSheet(ctx, 'sh-e2'); await photosReady(mixed);
  const mx = await mixed.evaluate(() => ({ red: [...document.querySelectorAll('.sheet-red .sheet-text')].map((e) => Math.round(e.getBoundingClientRect().left)), blue: [...document.querySelectorAll('.sheet-blue .sheet-text')].map((e) => Math.round(e.getBoundingClientRect().right)), imgs: document.querySelectorAll('.sheet-photo img').length }));
  check(mx.imgs > 0 && mx.imgs < 12 && new Set(mx.red).size === 1 && new Set(mx.blue).size === 1, 'E rows with a photo and rows without keep the names aligned (red x ' + [...new Set(mx.red)].join(',') + ', blue x ' + [...new Set(mx.blue)].join(',') + ', ' + mx.imgs + ' images)');
  await mixed.close();
  // each photo sits on ITS fighter: red fighters have a red-ish photo, blue fighters a blue-ish one
  const rb = tournament('sh-e3', 4, { photo: 'none' });
  rb.fighters = rb.fighters.map((f) => ({ ...f, photoDataUrl: f.id.startsWith('r') ? REDISH : BLUEISH }));
  await seed(ctx, rb);
  const tie = await openSheet(ctx, 'sh-e3'); await photosReady(tie);
  const hues = await tie.evaluate(async () => {
    const mean = (img) => { const c = document.createElement('canvas'); c.width = 20; c.height = 20; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 20, 20); const d = x.getImageData(0, 0, 20, 20).data; let r = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; b += d[i + 2]; } return r > b ? 'red' : 'blue'; };
    await Promise.all([...document.querySelectorAll('.sheet-photo img')].map((i) => i.complete ? 1 : new Promise((res) => { i.onload = res; i.onerror = res; })));
    return { red: [...document.querySelectorAll('.sheet-red .sheet-photo img')].map(mean), blue: [...document.querySelectorAll('.sheet-blue .sheet-photo img')].map(mean) };
  });
  check(hues.red.length === 4 && hues.blue.length === 4 && hues.red.every((h) => h === 'red') && hues.blue.every((h) => h === 'blue'), 'E every photo is on its own fighter (red side shows the red-ish photos, blue side the blue-ish ones: ' + JSON.stringify(hues) + ')');
  await tie.close();
  await ctx.close();
});

scenario('F', 'absent and undecided: 欠場 and 未定 are in words; the checks list them; the absent photo is not printed', async () => {
  const ctx = await newCtx(DESKTOP);
  const data = tournament('sh-f', 5, { photo: 'all' });
  data.fighters[2] = { ...data.fighters[2], absent: true };       // r2
  data.bouts[3] = B('m4', '', 'b4');                                // 第4試合 red undecided
  data.fighters[8] = { ...data.fighters[8], name: '' };            // r5 no name
  await seed(ctx, data);
  const p = await openSheet(ctx, 'sh-f');
  await photosReady(p);
  const info = await p.evaluate(() => {
    const b2 = document.querySelector('[data-sheet-bout="2"]'), b4 = document.querySelector('[data-sheet-bout="4"]'), b5 = document.querySelector('[data-sheet-bout="5"]');
    return { absentWord: b2.querySelector('.sheet-red .sheet-absent')?.innerText, deco: getComputedStyle(b2.querySelector('.sheet-red .sheet-name')).textDecorationLine, absentImg: b2.querySelectorAll('.sheet-red img').length, otherImg: b2.querySelectorAll('.sheet-blue img').length, undecided: b4.querySelector('.sheet-red .sheet-name')?.innerText, noName: b5.querySelector('.sheet-red .sheet-name')?.innerText };
  });
  check(info.absentWord === '欠場' && /line-through/.test(info.deco), 'F absent: the word 欠場 and a line through the name (' + info.absentWord + ', ' + info.deco + ')');
  check(info.absentImg === 0 && info.otherImg === 1, 'F absent: no photo for the absent fighter, the opponent keeps theirs');
  const corner = await p.evaluate(() => { const c = document.querySelector('[data-sheet-bout="2"] .sheet-red .sheet-corner'); return { text: c?.innerText.replace(/\s+/g, ' ').trim(), tags: document.querySelectorAll('[data-sheet-bout="2"] .sheet-red .sheet-tag').length }; });
  check(corner.text === '▲ 赤 欠場' && corner.tags === 0, 'F absent: 「▲ 赤 欠場」 on one line, no class line for a fighter who will not fight (' + JSON.stringify(corner) + ')');
  check(info.undecided === '未定', 'F a side with no fighter says 未定 (' + info.undecided + ')');
  check(info.noName === '名前未入力', 'F a fighter with an empty name says 名前未入力 (' + info.noName + ')');
  const text = await bodyText(p);
  check(/第4試合は、選手がまだ決まっていません/.test(text), 'F the checks list the undecided bout');
  check(/第2試合に、欠場の選手がいます/.test(text), 'F the checks list the absent fighter');
  check(/第5試合に、名前が入っていない選手がいます/.test(text), 'F the checks list the missing name');
  check(/準備の画面/.test(text), 'F the checks say where to fix it (the prep screen)');
  check((await markers(p)).length === 1, 'F still exactly one yellow 次はここ');
  const yellows = await p.evaluate(() => [...document.querySelectorAll('.tos-caution')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  check(yellows.length >= 3 && yellows.every((y) => /^⚠ /.test(y)), 'F each check starts with the ⚠ sign and a word, not colour only');
  await shot(p, 'F-absent');
  await ctx.close();
});

scenario('G', 're-output after a change: another tab saves a new order / opponent / absence, this screen follows (and the button reads it again)', async () => {
  const ctx = await newCtx(DESKTOP);
  await seed(ctx, tournament('sh-g', 4, { photo: 'all' }));
  const p = await openSheet(ctx, 'sh-g');
  await photosReady(p);
  const reds = () => p.evaluate(() => [...document.querySelectorAll('.sheet-bout')].map((b) => b.querySelector('.sheet-red .sheet-name').innerText));
  check(JSON.stringify(await reds()) === JSON.stringify(['架空r1選手', '架空r2選手', '架空r3選手', '架空r4選手']), 'G starts in the saved order');
  // another tab (the prep screen) saves: bouts 1 and 4 swap, bout 2's blue becomes b3, r3 is absent
  const other = await ctx.newPage();
  await other.goto(base + '/private/setup/?event=seed-boot');
  const changed = tournament('sh-g', 4, { photo: 'all' });
  changed.bouts = [changed.bouts[3], changed.bouts[1], changed.bouts[2], changed.bouts[0]];
  changed.bouts[1] = { ...changed.bouts[1], blueId: 'b3' };
  changed.fighters = changed.fighters.map((f) => f.id === 'r3' ? { ...f, absent: true } : f);
  changed.updatedAt = Date.now();
  await idbPut(other, changed);
  await other.evaluate(() => { const c = new BroadcastChannel('tournament-os-private:sh-g'); c.postMessage({ type: 'changed' }); c.close(); });
  await p.waitForFunction(() => document.querySelector('.sheet-bout .sheet-red .sheet-name')?.innerText === '架空r4選手', null, { timeout: 8000 }).catch(() => {});
  check(JSON.stringify(await reds()) === JSON.stringify(['架空r4選手', '架空r2選手', '架空r3選手', '架空r1選手']), 'G the new order shows up without reloading (' + JSON.stringify(await reds()) + ')');
  check((await p.locator('[data-sheet-bout="2"] .sheet-blue .sheet-name').innerText()) === '架空b3選手', 'G the changed opponent shows up');
  check((await p.locator('[data-sheet-bout="3"] .sheet-red .sheet-absent').count()) === 1, 'G the new absence shows up as 欠場');
  check(/第3試合に、欠場の選手がいます/.test(await bodyText(p)), 'G the checks follow too');
  await other.close();
  // the button path (no broadcast): change the data silently, press 「最新の内容を読み込む」
  const quiet = await ctx.newPage();
  await quiet.goto(base + '/private/setup/?event=seed-boot');
  changed.title = '名前を直した大会'; changed.updatedAt = Date.now() + 5; await idbPut(quiet, changed); await quiet.close();
  await p.getByRole('button', { name: '最新の内容を読み込む', exact: true }).click(); await settle(500);
  check(/名前を直した大会/.test(await p.locator('.sheet-title').first().innerText()), 'G 「最新の内容を読み込む」 reads the saved tournament again');
  check(/最新の内容を読み込みました（\d\d:\d\d:\d\d）/.test(await p.locator('#sheet-reload-note').innerText()), 'G the button answers with a green ✓ sentence and the time with seconds');
  check(/最後に読み込んだ時刻：\d\d:\d\d:\d\d/.test(await p.locator('#sheet-read-at').innerText()), 'G the last-read time shows seconds');
  // a read that fails: a red sentence, and the sheet on the screen stays as it was
  await p.evaluate(() => { indexedDB.open = () => { throw new Error('boom'); }; });
  await p.getByRole('button', { name: '最新の内容を読み込む', exact: true }).click(); await settle(400);
  check(/読み込めませんでした。いま出ているのは、前に読み込んだ内容です/.test(await p.locator('#sheet-reload-note').innerText()) && (await p.locator('#sheet-reload-note .tos-error').count()) === 1, 'G a failed read says so in a red ✕ sentence');
  check(/名前を直した大会/.test(await p.locator('.sheet-title').first().innerText()), 'G after a failed read the sheet is still the last good one');
  check((await p.locator('.sheet-page').count()) === 1, 'G the sheet is rebuilt (4 bouts -> 1 page)');
  await ctx.close();
});

scenario('H', 'thumbnails: big photos are made small for the sheet (light PDF); the print button waits for them; print() is called once with a clear file name', async () => {
  const ctx = await newCtx(DESKTOP);
  const data = tournament('sh-h', 2, { photo: 'none' });
  data.fighters[0].photoDataUrl = BIG;
  await seed(ctx, data);
  const p = await openSheet(ctx, 'sh-h');
  await photosReady(p);
  const img = await p.evaluate(() => { const i = document.querySelector('.sheet-photo img'); return i ? { len: i.src.length, w: i.naturalWidth, h: i.naturalHeight } : null; });
  check(img && img.len < BIG.length * 0.25 && Math.max(img.w, img.h) <= 361 && Math.max(img.w, img.h) >= 300, 'H the sheet uses a small copy of the photo (' + (img ? img.len + ' bytes, ' + img.w + 'x' + img.h : 'no image') + ' vs ' + BIG.length + ')');
  const stored = await p.evaluate(([db]) => new Promise((res) => { const r = indexedDB.open(db, 1); r.onsuccess = () => { const g = r.result.transaction('events').objectStore('events').get('sh-h'); g.onsuccess = () => { res(g.result.fighters[0].photoDataUrl.length); r.result.close(); }; }; }), [DB_NAME]);
  check(stored === BIG.length, 'H the saved photo itself is not changed');
  await p.evaluate(() => { window.__printCalls = []; window.print = () => { window.__printCalls.push(document.title); }; });
  const yellow = await markers(p);
  check(yellow.length === 1, 'H the yellow 次はここ is on the print button once the photos are ready');
  await p.locator('#sheet-print').click(); await settle(200);
  const calls = await p.evaluate(() => window.__printCalls);
  check(calls.length === 1 && calls[0] === '対戦一覧表 千葉県キックボクシング協会アマチュア大会', 'H print() was called once, the title (the default PDF name) says what it is (' + JSON.stringify(calls) + ')');
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await settle(100);
  check(await p.title() === '対戦一覧表（A3）', 'H the tab name is back after printing (' + (await p.title()) + ')');
  await ctx.close();
});

scenario('H3', 'an unreadable photo never locks the print button for good: the sheet falls back to the original and printing unlocks', async () => {
  const ctx = await newCtx(DESKTOP);
  const data = tournament('sh-h3', 2, { photo: 'all' });
  data.fighters[0] = { ...data.fighters[0], photoDataUrl: 'data:image/jpeg;base64,AAAA' };
  await seed(ctx, data);
  const p = await openSheet(ctx, 'sh-h3');
  await p.waitForFunction(() => { const b = document.getElementById('sheet-print'); return b && !b.hasAttribute('aria-disabled'); }, null, { timeout: 12000 }).catch(() => {});
  check((await p.locator('#sheet-print').getAttribute('aria-disabled')) === null, 'H3 a photo that cannot be read does not keep the print button locked (it unlocks within 12 s)');
  check((await p.locator('.sheet-bout').count()) === 2, 'H3 the sheet still shows both bouts');
  await ctx.close();
});

scenario('H2', 'print button lock: while the small photos are not ready the button is grey with a reason, nothing is yellow and a click does not print; when they are ready it unlocks', async () => {
  const ctx = await newCtx(DESKTOP);
  // hold every data: image back until we let it go (this is how a slow phone-sized photo load looks)
  await ctx.addInitScript(() => {
    const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    window.__held = []; window.__hold = true;
    Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, get() { return d.get.call(this); }, set(v) { if (window.__hold && typeof v === 'string' && v.startsWith('data:')) { window.__held.push([this, v]); return; } d.set.call(this, v); } });
    window.__release = () => { window.__hold = false; const h = window.__held; window.__held = []; for (const [el, v] of h) d.set.call(el, v); };
  });
  await seed(ctx, tournament('sh-h2', 3, { photo: 'all' }));
  const p = await openSheet(ctx, 'sh-h2');
  await p.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++; }; });
  const btn = p.locator('#sheet-print');
  check((await btn.getAttribute('aria-disabled')) === 'true', 'H2 the print button is locked while the photos are being made');
  check(/🔒 写真を、一覧表の大きさにととのえています（あと\d+人）/.test(await bodyText(p)), 'H2 a grey 🔒 reason says how many are left');
  check((await markers(p)).length === 0, 'H2 no yellow 次はここ while it waits');
  check(!/どの試合も、赤と青が決まっています。そのまま印刷できます/.test(await bodyText(p)) && (await p.locator('.sheet-noprint .tos-ok').count()) === 0, 'H2 no green ✓ 「そのまま印刷できます」 while it waits');
  await btn.click({ force: true }); await settle(150);
  check(await p.evaluate(() => window.__printCalls) === 0, 'H2 a click on the locked button does not print');
  await p.evaluate(() => window.__release());
  await photosReady(p);
  check((await markers(p)).length === 1 && (await p.locator('.sheet-noprint .tos-ok').count()) === 1, 'H2 when ready: one yellow 次はここ and the green ✓ sentence');
  await btn.click(); await settle(150);
  check(await p.evaluate(() => window.__printCalls) === 1, 'H2 now the click prints');
  await ctx.close();
});

scenario('I', 'no bouts / no such tournament / the way back: plain words, no print button, a link to the prep screen', async () => {
  const ctx = await newCtx(DESKTOP);
  await seed(ctx, T('sh-i-empty', {}));
  const p = await openSheet(ctx, 'sh-i-empty');
  const t = await bodyText(p);
  check(/対戦カードがありません/.test(t) && (await p.locator('#sheet-print').count()) === 0, 'I no bouts: it says so and there is no print button');
  check(/準備の画面へもどる/.test(t) && (await p.locator('a[href*="/private/?event=sh-i-empty"]').count()) >= 1, 'I a link back to the prep screen of this tournament');
  const yellowEmpty = await markers(p);
  check(yellowEmpty.length === 1 && /準備の画面へもどる/.test(yellowEmpty[0]), 'I no bouts: exactly one yellow 👉 次はここ: back to the prep screen (' + short(yellowEmpty.join('|'), 80) + ')');
  const q = await openSheet(ctx, 'sh-i-missing');
  const t2 = await bodyText(q);
  check(/この大会は、このブラウザにありません/.test(t2) && /^✕/m.test(t2), 'I an unknown tournament: a red ✕ sentence');
  const yellowMissing = await markers(q);
  check(yellowMissing.length === 1 && /準備の画面へもどる/.test(yellowMissing[0]), 'I an unknown tournament: exactly one yellow 👉 次はここ: back to the prep screen');
  const keys = await q.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('tos-sheet:')));
  check(!keys.includes('tos-sheet:sh-i-missing'), 'I a screen with no tournament leaves no saved options behind (' + keys.join(',') + ')');
  await ctx.close();
});

scenario('J', 'long names, long gyms, a 3-digit bout number and 14 per page: nothing spills out of its box', async () => {
  const ctx = await newCtx(DESKTOP);
  const data = tournament('sh-j', 120, { photo: 'half' });
  data.fighters[0] = { ...data.fighters[0], name: '架空太郎左衛門ひろし・ジュニア・サード', gym: '千葉県の本当に長い名前のキックボクシングジムと仲間たち' };
  data.fighters[1] = { ...data.fighters[1], name: 'あ'.repeat(40), gym: 'ジム'.repeat(30) };
  await seed(ctx, data);
  const p = await openSheet(ctx, 'sh-j');
  await photosReady(p);
  await p.locator('#sheet-per-page').fill('14'); await settle(500);
  const spill = await p.evaluate(() => {
    const bad = [];
    for (const b of document.querySelectorAll('.sheet-bout')) {
      const r = b.getBoundingClientRect();
      for (const e of b.querySelectorAll('.sheet-text, .sheet-center, .sheet-photo')) { const q = e.getBoundingClientRect(); if (q.right > r.right + 1 || q.left < r.left - 1 || q.bottom > r.bottom + 1 || q.top < r.top - 1) bad.push(b.getAttribute('data-sheet-bout') + ':' + e.className); }
    }
    return bad;
  });
  check(spill.length === 0, 'J no text or photo box crosses its bout frame (' + short(spill.join(','), 120) + ')');
  const nos = await p.evaluate(() => [...document.querySelectorAll('.sheet-no')].slice(-1)[0].innerText);
  check(nos === '120', 'J the last bout number is 120 (' + nos + ')');
  check(await pagesOf(p) === 9, 'J 120 bouts at 14 per page -> 9 pages');
  await ctx.close();
});

scenario('K', 'prep screen: 「欠場にする」 on the roster, the bout warning, save, then 「A3の対戦一覧表をつくる」 opens the sheet that says 欠場', async () => {
  const ctx = await newCtx(DESKTOP);
  await seed(ctx, tournament('sh-k', 3, { photo: 'all' }));
  const p = await ctx.newPage();
  await p.goto(base + '/private/?event=sh-k');
  await p.locator('#field-title').waitFor({ timeout: 15000 });
  await settle(500);
  const btn = p.getByRole('button', { name: '欠場にする 架空r1選手', exact: true });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  if ((await btn.count()) === 0) { const fold = p.locator('summary', { hasText: '選手の一覧' }); if (await fold.count()) await fold.first().click(); await settle(200); }
  await p.getByRole('button', { name: '欠場にする 架空r1選手', exact: true }).click(); await settle(300);
  check(await p.locator('[data-absent-chip]').count() === 1 && /✕ 欠場/.test(await p.locator('[data-absent-chip]').first().innerText()), 'K the roster card shows the word 「✕ 欠場」');
  check(await p.getByRole('button', { name: '欠場をやめる 架空r1選手', exact: true }).count() === 1, 'K the button now says 「欠場をやめる」');
  const text = await bodyText(p);
  check(/赤コーナーの架空r1選手さんは、欠場です。相手を決め直すか、この試合を消してください/.test(text) && (await p.locator('[data-absent-warning] .tos-error').count()) === 1, 'K the first bout card warns in words, with ⚠ (a soft warning, one line for the absent side)');
  check(/第1試合に入っています/.test(text), 'K the message says which bout the fighter is in');
  const options = await p.locator('select[id^="bout-"]').first().locator('option').allInnerTexts();
  check(options.some((o) => /架空r1選手.*（欠場）/.test(o)), 'K the drop-down marks the absent fighter with （欠場） (' + short(options.join(' | '), 160) + ')');
  check(/欠場の選手が入っている試合/.test(text), 'K the caution banner names 欠場 among the things to check');
  // not saved yet: the saved data has no absent flag
  const before = await p.evaluate(([db]) => new Promise((res) => { const r = indexedDB.open(db, 1); r.onsuccess = () => { const g = r.result.transaction('events').objectStore('events').get('sh-k'); g.onsuccess = () => { res(g.result.fighters.filter((f) => f.absent).length); r.result.close(); }; }; }), [DB_NAME]);
  check(before === 0, 'K nothing is saved until 「保存する」 (' + before + ')');
  // open the sheet: it saves first, then opens a new tab
  const popupPromise = ctx.waitForEvent('page', { timeout: 15000 });
  await p.locator('#open-sheet').click();
  const sheet = await popupPromise;
  await sheet.waitForURL(/\/private\/sheet\/\?event=sh-k/, { timeout: 15000 });
  await sheet.locator('.sheet-bout').first().waitFor({ timeout: 15000 });
  const after = await p.evaluate(([db]) => new Promise((res) => { const r = indexedDB.open(db, 1); r.onsuccess = () => { const g = r.result.transaction('events').objectStore('events').get('sh-k'); g.onsuccess = () => { res(g.result.fighters.filter((f) => f.absent).map((f) => f.id)); r.result.close(); }; }; }), [DB_NAME]);
  check(JSON.stringify(after) === JSON.stringify(['r1']), 'K the click saved the unsaved change first (' + JSON.stringify(after) + ')');
  check(await sheet.locator('[data-sheet-bout="1"] .sheet-red .sheet-absent').count() === 1, 'K the opened sheet says 欠場 on bout 1');
  await Promise.all([sheet.waitForEvent('close', { timeout: 5000 }).catch(() => {}), sheet.locator('#sheet-back').click().catch(() => {})]);
  await settle(300);
  check(sheet.isClosed(), 'K the back button closes the tab that the prep screen opened (the prep screen is still there)');
  // back: 欠場をやめる removes the flag completely
  await p.getByRole('button', { name: '欠場をやめる 架空r1選手', exact: true }).click(); await settle(200);
  await p.getByRole('button', { name: /ここまでを保存/ }).click(); await settle(800);
  const gone = await p.evaluate(([db]) => new Promise((res) => { const r = indexedDB.open(db, 1); r.onsuccess = () => { const g = r.result.transaction('events').objectStore('events').get('sh-k'); g.onsuccess = () => { res(g.result.fighters.some((f) => 'absent' in f)); r.result.close(); }; }; }), [DB_NAME]);
  check(gone === false, 'K 欠場をやめる + 保存: the key is gone (not left as false)');
  // an edit of the fighter keeps the flag
  await p.getByRole('button', { name: '欠場にする 架空b1選手', exact: true }).click(); await settle(200);
  await p.getByRole('button', { name: '直す 架空b1選手', exact: true }).click(); await settle(300);
  await p.locator('[id^="edit-"][id$="-weight"]').first().fill('46'); await p.locator('[id^="edit-"][id$="-weight"]').first().blur();
  await p.getByRole('button', { name: 'この内容で直す', exact: true }).click(); await settle(400);
  check(await p.getByRole('button', { name: '欠場をやめる 架空b1選手', exact: true }).count() === 1, 'K editing a fighter does not drop the 欠場 flag');
  await ctx.close();
});

scenario('L', 'live screens: an absent fighter is named in words on the single view and in the list; the suggestion never picks an absent fighter', async () => {
  const ctx = await newCtx(DESKTOP);
  const data = tournament('sh-l', 2, { photo: 'all' });
  data.fighters = data.fighters.map((f) => f.id === 'r1' ? { ...f, absent: true } : f);
  await seed(ctx, data);
  const single = await ctx.newPage();
  await single.goto(base + '/private/live/?event=sh-l');
  await single.locator('main').waitFor();
  await single.waitForFunction(() => !document.body.innerText.includes('このパソコンのデータを読んでいます'), null, { timeout: 15000 });
  const st = await bodyText(single);
  check(/欠場です。この試合は行えません。準備画面で相手や試合を直してください/.test(st), 'L the single view says 欠場 in words (a red line)');
  check((await single.evaluate(() => [...document.querySelectorAll('.tos-error')].filter((e) => /欠場/.test(e.innerText)).length)) === 1, 'L it is one red ✕ line (the opponent has none)');
  const list = await ctx.newPage();
  await list.goto(base + '/private/live/?event=sh-l&view=list');
  await list.locator('main').waitFor();
  await list.waitForFunction(() => !document.body.innerText.includes('このパソコンのデータを読んでいます'), null, { timeout: 15000 });
  const lt = await bodyText(list);
  check(/欠場です。この試合は行えません/.test(lt), 'L the list row says 欠場 too');
  check(await list.locator('[role=group][aria-label*="欠場"]').count() === 1, 'L the red corner group is named with 欠場 for a screen reader');
  // suggestion: 4 fighters, one absent, no bouts -> the suggestion makes one bout from the other three? (3 fighters = 1 bout) and never includes the absent one
  const sug = { ...T('sh-l2', { fighters: [F('a1', { weight: '45' }), F('a2', { weight: '46', absent: true }), F('a3', { weight: '45' }), F('a4', { weight: '46' })], bouts: [] }) };
  await seed(ctx, sug);
  const prep = await ctx.newPage();
  await prep.goto(base + '/private/?event=sh-l2');
  await prep.locator('#field-title').waitFor({ timeout: 15000 });
  await settle(400);
  const make = prep.getByRole('button', { name: 'おすすめの組み合わせを自動で作る', exact: true });
  if ((await make.count()) === 0) { await prep.getByRole('button', { name: '＋ 試合を追加', exact: true }).click().catch(() => {}); await settle(300); }
  if (await make.count()) {
    await make.click(); await settle(500);
    const used = await prep.evaluate(() => [...document.querySelectorAll('select[id^="bout-"]')].map((s) => s.options[s.selectedIndex]?.text || ''));
    check(used.length >= 2 && used.every((t) => !/a2/.test(t)), 'L the suggestion never puts the absent fighter in a bout (' + short(used.join(' | '), 160) + ')');
  } else { check(false, 'L the suggestion button was not found, so this check could not run'); }
  await ctx.close();
});

scenario('M', 'options are remembered per tournament (landscape, 自動, 3枚); the 3枚 / 4枚 buttons are locked with a reason when they cannot be true; typing a number works digit by digit', async () => {
  const ctx = await newCtx(DESKTOP);
  await seed(ctx, tournament('sh-m', 30, { photo: 'none' }));
  await seed(ctx, tournament('sh-m2', 30, { photo: 'none' }));
  const p = await openSheet(ctx, 'sh-m');
  // digit by digit in landscape: 「1」 is below the minimum (2) but the box keeps what was typed; 「12」 is accepted
  await p.getByRole('button', { name: /横/ }).click(); await settle(200);
  const box = p.locator('#sheet-per-page');
  await box.fill(''); await box.pressSequentially('1'); await settle(150);
  check((await box.inputValue()) === '1', 'M typing 「1」 in landscape: the box keeps 1 (it does not jump to 2 under the finger)');
  await box.pressSequentially('2'); await settle(200);
  check((await box.inputValue()) === '12' && await pagesOf(p) === 3, 'M typing 「12」 in landscape -> 12 per page, 3 pages (' + (await box.inputValue()) + ', ' + (await pagesOf(p)) + ' pages)');
  await box.fill(''); await box.blur(); await settle(150);
  check((await box.inputValue()) === '12', 'M leaving the box empty puts the number back');
  // 3枚 mode is remembered as 「3枚」, not as a number
  await p.getByRole('button', { name: 'A3を3枚にする', exact: true }).click(); await settle(200);
  await p.reload(); await p.locator('#sheet-per-page').waitFor(); await settle(300);
  check((await p.getByRole('button', { name: /横/ }).getAttribute('aria-pressed')) === 'true', 'M landscape is remembered after a reload');
  check((await p.locator('#sheet-pages-3').getAttribute('aria-pressed')) === 'true' && await pagesOf(p) === 3, 'M 「A3を3枚にする」 is remembered after a reload (3 pages)');
  const raw = await p.evaluate(() => localStorage.getItem('tos-sheet:sh-m'));
  check(/"pages":3/.test(raw || '') && !/perPage/.test(raw || ''), 'M it is stored as pages=3, not as a number (' + raw + ')');
  // 自動 is remembered as 自動
  await p.locator('#sheet-auto').click(); await settle(200);
  await p.reload(); await p.locator('#sheet-per-page').waitFor(); await settle(300);
  check((await p.locator('#sheet-auto').getAttribute('aria-pressed')) === 'true', 'M 自動 is remembered after a reload');
  // another tournament is not touched
  const q = await openSheet(ctx, 'sh-m2');
  check((await q.getByRole('button', { name: /縦/ }).getAttribute('aria-pressed')) === 'true' && (await q.locator('#sheet-auto').getAttribute('aria-pressed')) === 'true', 'M another tournament starts with the default (portrait, 自動)');
  await q.close();
  // 4枚 for 30 bouts in portrait is possible; 3枚 for 60 bouts in portrait is not (14 per page max) -> locked with the reason, and 横 would work
  const r = await openSheet(ctx, 'sh-m');
  await r.getByRole('button', { name: /縦/ }).click(); await settle(150);
  check((await r.locator('#sheet-pages-3').getAttribute('aria-disabled')) === null && (await r.locator('#sheet-pages-4').getAttribute('aria-disabled')) === null, 'M 30 bouts in portrait: both 「3枚」 and 「4枚」 can be pressed');
  await r.close();
  await seed(ctx, tournament('sh-m60', 60, { photo: 'none' }));
  const big = await openSheet(ctx, 'sh-m60');
  check((await big.locator('#sheet-pages-3').getAttribute('aria-disabled')) === 'true', 'M 60 bouts in portrait: 「A3を3枚にする」 is locked');
  const reason = await big.locator('#sheet-limit-notes').innerText();
  check(/「A3を3枚にする」は押せません。全60試合は、縦では、A3を3枚にできません（5枚になります）。横にすると3枚になります/.test(reason), 'M the reason says why and what would work (' + short(reason, 220) + ')');
  check(/A3が5枚になります。紙を減らしたいときは、「横」/.test(reason), 'M a hint tells that 横 fits more bouts on a page');
  await big.locator('#sheet-pages-3').click({ force: true }); await settle(150);
  check((await big.locator('#sheet-pages-3').getAttribute('aria-pressed')) === 'false', 'M a locked button does nothing when clicked');
  await big.getByRole('button', { name: /横/ }).click(); await settle(200);
  check((await big.locator('#sheet-pages-3').getAttribute('aria-disabled')) === null, 'M in landscape the same button can be pressed');
  // a screen with a tournament that does not exist does not write anything
  const none = await openSheet(ctx, 'sh-m-nothing');
  const keys = await none.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('tos-sheet:')));
  check(!keys.includes('tos-sheet:sh-m-nothing'), 'M nothing is stored for a tournament that does not exist');
  await ctx.close();
});

scenario('N', 'dense landscape (24 per page) with class lines, Latin names, a long rule and absent fighters: no frame is crossed and no usual text is cut', async () => {
  const ctx = await newCtx(DESKTOP);
  const data = tournament('sh-n', 48, { photo: 'half' });
  data.fighters = data.fighters.map((f, i) => ({
    ...f,
    name: i % 7 === 0 ? 'Alexander Constantine' : i % 5 === 0 ? '田中 太郎丸' : '山田 太郎',
    gym: i % 6 === 0 ? 'FLATUP KICKBOXING GYM CHIBA' : '千葉キックボクシングジム',
    fighterClass: i % 2 ? 'Aクラス' : 'Bクラス', division: '中学生男子', weightClass: '37kg以下',
    ...(i % 11 === 4 ? { absent: true } : {}),
  }));
  data.bouts = data.bouts.map((b, i) => ({ ...b, className: i % 4 === 0 ? 'キックボクシング Aクラス 中学生男子 -45kg' : '', rule: 'キックボクシング 2分2R／首相撲5秒／ワンマッチ' }));
  await seed(ctx, data);
  const boot = await ctx.newPage(); await boot.goto(base + '/private/setup/?event=seed-boot');
  await boot.evaluate(() => localStorage.setItem('tos-sheet:sh-n', JSON.stringify({ orientation: 'landscape', perPage: 24, show: { photo: true, gym: true, classLine: true, rule: true } })));
  await boot.close();
  const p = await openSheet(ctx, 'sh-n');
  await photosReady(p);
  check(await pagesOf(p) === 2, 'N 48 bouts at 24 per page in landscape -> 2 pages');
  const r = await p.evaluate(() => {
    const frame = [], cut = [];
    for (const b of document.querySelectorAll('.sheet-bout')) {
      const fr = b.getBoundingClientRect();
      for (const e of b.querySelectorAll('.sheet-text, .sheet-center, .sheet-photo')) { const q = e.getBoundingClientRect(); if (q.right > fr.right + 1 || q.left < fr.left - 1 || q.bottom > fr.bottom + 1 || q.top < fr.top - 1) frame.push(b.getAttribute('data-sheet-bout') + ':' + e.className); }
      for (const e of b.querySelectorAll('.sheet-name, .sheet-gym, .sheet-tag, .sheet-classline, .sheet-rule')) {
        if (e.scrollWidth > e.clientWidth + 1) cut.push(b.getAttribute('data-sheet-bout') + ':' + e.className + ':w');
        if (e.scrollHeight > e.clientHeight + 1) cut.push(b.getAttribute('data-sheet-bout') + ':' + e.className + ':h');
      }
      const c = b.querySelector('.sheet-center'); if (c.scrollHeight > c.clientHeight + 1) cut.push(b.getAttribute('data-sheet-bout') + ':center');
    }
    return { frame, cut, tiny: [...document.querySelectorAll('.sheet-bout p')].map((e) => parseFloat(getComputedStyle(e).fontSize) / (96 / 25.4)).filter((mm) => mm < 2.3).length };
  });
  check(r.frame.length === 0, 'N no text or photo box crosses its bout frame (' + short(r.frame.join(','), 160) + ')');
  check(r.cut.length === 0, 'N no usual name / gym / class line is cut off (' + short(r.cut.join(','), 200) + ')');
  check(r.tiny === 0, 'N nothing is set smaller than 2.3mm');
  const noRule = await p.evaluate(() => [...document.querySelectorAll('.sheet-bout')].filter((b) => !b.querySelector('.sheet-rule')).length);
  const noClass = await p.evaluate(() => [...document.querySelectorAll('.sheet-bout')].filter((b) => !b.querySelector('.sheet-classline')).length);
  const notes = await p.locator('#sheet-limit-notes').innerText();
  check(noRule === 0 || /の「ルール」の文字は、入りきらないので載りません/.test(notes), 'N when a rule did not fit and was left out, the page says so in words (' + noRule + ' bouts without a rule)');
  check(noClass <= 36 || /のまん中の列の文字（体重の区分など）は、入りきらないので載りません/.test(notes), 'N when the centre class line was left out, the page says so in words');
  const names = await p.evaluate(() => [...document.querySelectorAll('.sheet-name')].map((e) => ({ t: e.innerText, lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).fontSize) / 1.15) })));
  check(names.filter((n) => /^(山田 太郎|田中 太郎丸)$/.test(n.t)).every((n) => n.lines === 1), 'N four- and five-character names stay on one line (no lonely last character)');
  const absentCount = await p.locator('.sheet-state-absent').count();
  check(absentCount >= 4 && (await p.locator('.sheet-absent').count()) === absentCount, 'N the absent badge is on every absent fighter (' + absentCount + ')');
  await shot(p, 'N-dense-landscape');
  await ctx.close();
});

scenario('O', 'the way back: the button closes the tab when the prep screen opened it; otherwise it goes to the prep screen', async () => {
  const ctx = await newCtx(DESKTOP);
  await seed(ctx, tournament('sh-o', 3, { photo: 'none' }));
  // opened by hand (no opener): the button cannot close the tab, so it goes to the prep screen
  const p = await openSheet(ctx, 'sh-o');
  const back = p.locator('#sheet-back');
  check((await back.innerText()).includes('この画面を閉じる') && (await back.boundingBox()).height >= 47.5, 'O the back button says what it does and is 48px tall');
  await back.click();
  await p.waitForURL(/\/private\/\?event=sh-o/, { timeout: 5000 }).catch(() => {});
  check(/\/private\/\?event=sh-o/.test(p.url()), 'O it went to the prep screen of this tournament (' + p.url() + ')');
  await ctx.close();
});

scenario('P', 'review fixes: all-undecided points the yellow at the prep screen; an unreal title is warned; saved time is shown; Enter commits a typed number; a saved but impossible 3枚 shows no ✓; honest paper hints; read failure screen', async () => {
  // (1) every bout undecided
  const ctx = await newCtx(DESKTOP);
  await seed(ctx, T('sh-p1', { fighters: [], bouts: [B('m1', '', ''), B('m2', '', ''), B('m3', '', '')] }));
  const p1 = await openSheet(ctx, 'sh-p1');
  const y1 = await markers(p1);
  check(y1.length === 1 && /選手を決める（準備の画面へ）/.test(y1[0]), 'P all bouts undecided: the one yellow 👉 says to go to the prep screen (' + short(y1.join('|'), 90) + ')');
  check((await p1.locator('#sheet-print').getAttribute('aria-disabled')) === null, 'P printing is still allowed (only the guidance changed)');
  await p1.close();
  // (2) unreal title, saved time
  await seed(ctx, { ...tournament('sh-p2', 3, { photo: 'none' }), title: '大会名未設定' });
  const p2 = await openSheet(ctx, 'sh-p2');
  const t2 = await bodyText(p2);
  check(/大会の名前がまだ入っていません/.test(t2) && (await p2.locator('.sheet-noprint .tos-ok').count()) === 0, 'P an unreal title is warned and the green 「そのまま印刷できます」 is not shown');
  check(/保存した時刻：\d\d:\d\d:\d\d/.test(await p2.locator('#sheet-saved-at').innerText()), 'P the saved time (not only the read time) is shown');
  check(/この画面を閉じる/.test(t2) && /もう一度「A3の対戦一覧表をつくる」を押します/.test(t2), 'P the way back is one route: close, fix and save on the prep screen, press 「A3の対戦一覧表をつくる」 again');
  await p2.close();
  // (3) Enter commits a typed number; out-of-range typing is explained
  await seed(ctx, tournament('sh-p3', 24, { photo: 'none' }));
  const p3 = await openSheet(ctx, 'sh-p3');
  const box = p3.locator('#sheet-per-page');
  await box.fill('15'); await settle(150);
  check(/14試合までです。Enter（またはほかの所を押す）と、14試合になります/.test(await p3.locator('#sheet-limit-notes').innerText()), 'P a typed number above the limit is explained at once');
  await box.press('Enter'); await settle(200);
  check((await box.inputValue()) === '14' && /1ページ 14 試合/.test(await p3.locator('#sheet-count-note').innerText()), 'P Enter commits the number (clamped to 14) and the preview follows');
  check((await box.getAttribute('aria-describedby')) === 'sheet-limit-notes', 'P the number box points at the notes with aria-describedby');
  // saved 3枚 that cannot be honoured
  await p3.evaluate(() => localStorage.setItem('tos-sheet:sh-p3', JSON.stringify({ orientation: 'portrait', pages: 3 })));
  await seed(ctx, tournament('sh-p3', 2, { photo: 'none' }));
  await p3.evaluate(() => localStorage.setItem('tos-sheet:sh-p3', JSON.stringify({ orientation: 'portrait', pages: 3 })));
  await p3.reload(); await p3.locator('#sheet-per-page').waitFor(); await settle(300);
  check((await p3.locator('#sheet-pages-3').getAttribute('aria-pressed')) === 'false' && !/✓/.test(await p3.locator('#sheet-pages-3').innerText()), 'P a saved 3枚 that cannot be honoured is shown WITHOUT ✓ and not pressed');
  check(/前に選んだ「A3を3枚にする」は、いまはできません/.test(await p3.locator('#sheet-limit-notes').innerText()), 'P the note says the earlier choice is no longer possible');
  check((await p3.locator('#sheet-pages-3').getAttribute('aria-describedby')) === 'sheet-limit-notes', 'P a locked 3枚 button points at its reason (aria-describedby)');
  await p3.close();
  // (4) honest paper hints: 70 bouts landscape, auto: not at the limit -> no 「上限のため」
  await seed(ctx, tournament('sh-p4', 70, { photo: 'none' }));
  const p4 = await openSheet(ctx, 'sh-p4');
  await p4.getByRole('button', { name: /横/ }).click(); await settle(250);
  const notes4 = await p4.locator('#sheet-limit-notes').innerText();
  check(!/上限のため、これ以上は減りません/.test(notes4), 'P landscape 16 per page is not at the limit (24): the screen does not claim a limit (' + short(notes4, 140) + ')');
  check(/「自動」を押します|ふやす（＋）/.test(notes4), 'P it points at the real remedy (＋ or 自動)');
  await p4.close();
  await ctx.close();
  // (5) read failure: IndexedDB throws
  const ctx2 = await newCtx(DESKTOP);
  await ctx2.addInitScript(() => { try { indexedDB.open = () => { throw new Error('blocked'); }; } catch { /* ignore */ } });
  const p5 = await ctx2.newPage();
  await p5.goto(base + '/private/sheet/?event=sh-p5');
  await p5.waitForFunction(() => !document.body.innerText.includes('このパソコンのデータを読んでいます'), null, { timeout: 15000 });
  const t5 = await bodyText(p5);
  check(/保存データを読めません（データは消えていません）/.test(t5) && /① プライベートウィンドウでは使えません/.test(t5) && /② それでもだめなときは/.test(t5), 'P read failure: the same ①②  guidance as the live screen');
  check(await p5.getByRole('button', { name: 'もう一度ひらく', exact: true }).count() === 1, 'P read failure: a 「もう一度ひらく」 button');
  const y5 = await markers(p5);
  check(y5.length === 1 && /①をしてもだめなとき：準備の画面へ/.test(y5[0]), 'P read failure: exactly one yellow, worded so it does not contradict ① (' + short(y5.join('|'), 90) + ')');
  await ctx2.close();
});

scenario('Q', 'text that is cut: usual long names / romaji / gyms fit at the default settings; extreme ones are warned in words before printing; no sideways scroll at 320px with a long Latin name', async () => {
  const ctx = await newCtx(DESKTOP);
  const names = ['ミハイル・ゴルバチョフ', 'アレクサンダー・スミス', '田中太郎左衛門次郎', 'JOHN SMITH', 'TARO YAMADA', 'MAXIMILIAN WEBER', 'DAIKI NAKAMURA', 'Yuki Matsumoto', '田中　陽菜', '高橋　花子', '佐々木　大二郎', '小野寺　まゆみ', 'ジェームス・ブラウン', 'エドワード・ノートン', 'ジェニファー・ローレンス', 'ニコラス・ケイジ'];
  const gyms = ['ゴールデングローブキックボクシングジム', 'フラットアップキックボクシングジム千葉道場', 'FLATUP KICKBOXING GYM', '千葉キックボクシングジム'];
  const data = tournament('sh-q', 8, { photo: 'half' });
  data.fighters = data.fighters.map((f, i) => ({ ...f, name: names[i % names.length], gym: gyms[i % gyms.length], fighterClass: 'Bクラス', division: '中学生男子', weightClass: '37kg以下' }));
  await seed(ctx, data);
  for (const [label, prefs] of [['portrait 4', { orientation: 'portrait', perPage: 4 }], ['portrait 8', { orientation: 'portrait', perPage: 8 }], ['landscape 8', { orientation: 'landscape', perPage: 8 }]]) {
    const boot = await ctx.newPage(); await boot.goto(base + '/private/setup/?event=seed-boot');
    await boot.evaluate((v) => localStorage.setItem('tos-sheet:sh-q', JSON.stringify({ ...v, show: { photo: true, gym: true, classLine: true, rule: false } })), prefs); await boot.close();
    const p = await openSheet(ctx, 'sh-q');
    await photosReady(p);
    const cut = await p.evaluate(() => {
      const bad = [];
      for (const b of document.querySelectorAll('.sheet-bout')) for (const e of b.querySelectorAll('.sheet-name, .sheet-gym, .sheet-tag')) {
        if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) bad.push(b.getAttribute('data-sheet-bout') + ':' + e.className.replace('sheet-', '') + ':' + e.innerText.slice(0, 14));
      }
      return bad;
    });
    check(cut.length === 0, 'Q ' + label + ': usual long names / romaji / long gyms are shown in full, nothing cut (' + short(cut.join(' | '), 200) + ')');
    check((await p.locator('#sheet-cut-note').count()) === 0, 'Q ' + label + ': no 「切れます」 warning when nothing is cut');
    await p.close();
  }
  // an extreme name: it is cut on paper, and the screen says so
  const extreme = tournament('sh-q2', 3, { photo: 'none' });
  extreme.fighters[0] = { ...extreme.fighters[0], name: 'あ'.repeat(90) };
  await seed(ctx, extreme);
  const e = await openSheet(ctx, 'sh-q2');
  check(/第1試合は、名前・所属ジム・クラスの文字が長くて、紙の上で一部が「…」と切れます/.test(await e.locator('#sheet-cut-note').innerText()), 'Q an extreme name is warned in words with the bout number before printing');
  check((await e.locator('.sheet-noprint .tos-ok').count()) === 0, 'Q no green ✓ while something is cut');
  await e.close();
  // 320px: a long Latin name in two bouts must not make the page scroll sideways (the 2-bouts warning carries the name)
  const small = await newCtx(SMALL);
  const wide = tournament('sh-q3', 2, { photo: 'none' });
  wide.fighters[0] = { ...wide.fighters[0], name: 'Wolfeschlegelsteinhausenbergerdorff-Wolfeschlegelsteinhausenbergerdorff' };
  wide.bouts[1] = B('m2', 'r1', 'b2');
  await seed(small, wide);
  const s3 = await openSheet(small, 'sh-q3');
  const sw = await s3.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(sw.sw <= sw.cw, 'Q 320px: no sideways scroll with a very long Latin name in the 「2つ以上の試合」 warning (' + sw.sw + ' vs ' + sw.cw + ')');
  await small.close();
  await ctx.close();
});

/* ───────────────────────── runner ───────────────────────── */
await makePhotos();
for (const s of scenarios) {
  if (ONLY.length && !ONLY.includes(s.id)) continue;
  cur = s.id;
  const t0 = Date.now(), f0 = failures.length;
  console.log('▶ ' + s.id + ' ' + s.name);
  try { await s.fn(); } catch (e) { const at = (String(e.stack).match(/test-bout-sheet\.mjs:(\d+)/) || [])[1]; failures.push('[' + cur + '] scenario stopped at line ' + at + ': ' + short(e.message, 600)); console.log('  ABORT [' + cur + '] line ' + at + ': ' + short(e.message, 400)); }
  console.log('  ' + (failures.length === f0 ? 'ok' : (failures.length - f0) + ' failure(s)') + ' (' + Math.round((Date.now() - t0) / 100) / 10 + 's)');
}
cur = 'FILTER';
check(!ONLY.length || scenarios.some((s) => ONLY.includes(s.id)), 'TOS_ONLY matched no scenario (' + ONLY.join(',') + '): nothing was checked');
cur = 'NET';
check(externals.length === 0, 'no request ever left 127.0.0.1 (' + externals.length + ': ' + short(externals.slice(0, 3).map((e) => e.method + ' ' + e.url).join(', ')) + ')');
check(net.filter((n) => n.method !== 'GET').length === 0, 'no POST/PUT/DELETE request at all');
cur = 'ERR';
check(pageErrors.length === 0, 'no uncaught page error in any scenario (' + short(pageErrors.slice(0, 3).map((e) => e.scenario + ': ' + e.message).join(' | '), 300) + ')');
await browser.close();
console.log('\nBout-sheet checks: ' + (checks - failures.length) + ' passed, ' + failures.length + ' failed, ' + checks + ' total.');
if (failures.length) { console.log('\nFAILED:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
console.log('All bout-sheet checks passed.');
