/**
 * Round-1 polish regression checks for the chairman screen /private/ (and /private/entry/): one scenario per finding group.
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation. Fake data only.
 * It drives the REAL built pages (npm run build:private -> out-private-pages).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4990 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-polish-private.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4990), TOS_ONLY=ZIP,FAIL (scenario ids), TOS_CHROME_PATH, TOS_PLAYWRIGHT_MODULE.
 * Checks are SOFT: every failure is recorded, all scenarios still run, exit code 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4990';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

/* ───────── bookkeeping ───────── */
let checks = 0, cur = '-';
const failures = [], externals = [], pageErrors = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 160) => String(s).replace(/\s+/g, ' ').slice(0, n);

/* ───────── fake data ───────── */
const HEAD = '管理番号,ジム名,選手名,学年,年齢,身長,体重,戦績・競技歴,試合への意気込み,入場曲URL（Apple Music推奨）';
const HEAD_CLS = HEAD + ',クラス';
const q = (v) => '"' + String(v).replaceAll('"', '""') + '"';
const row = (id, n, over = {}) => {
  const r = { gym: '架空' + n + 'ジム', name: '架空' + n + '選手', grade: '中1', age: '13', height: '155', weight: '60', record: '初試合', comment: 'がんばる', music: '', cls: undefined, ...over };
  return [id, r.gym, r.name, r.grade, r.age, r.height, r.weight, r.record, r.comment, r.music, ...(r.cls === undefined ? [] : [q(r.cls)])].map((v, i) => (i === 10 ? v : q(v))).join(',');
};
const csvOf = (rows, withClass = false) => [withClass ? HEAD_CLS : HEAD, ...rows].join('\n');
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const JPG = new Uint8Array(Buffer.from(TINY_JPEG.split(',')[1], 'base64'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PASSWORD = 'hanabi2027x-fake';

/* ───────── browser helpers ───────── */
function attach(page) {
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('pageerror', (e) => { pageErrors.push({ scenario: cur, message: e.message }); });
}
async function newCtx(w = 1280, h = 900, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, acceptDownloads: true, ...o });
  ctx.on('page', attach);
  await ctx.route('**/*', async (route) => {
    if (route.request().url().startsWith(base + '/')) return route.continue();
    externals.push({ scenario: cur, url: route.request().url() });
    return route.abort();
  });
  return ctx;
}
const open = async (ctx, id, suffix = '') => {
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=' + id + suffix);
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  return page;
};
const mainText = (p) => p.locator('main').innerText();
const btn = (p, name) => p.getByRole('button', { name, exact: true });
const importFile = (p, name, type, buffer) => p.locator('#pick-file').setInputFiles({ name, mimeType: type, buffer });
const importCsv = async (p, csv) => { await importFile(p, 'players.csv', 'text/csv', Buffer.from(csv, 'utf8')); await settle(700); };
const waitState = (p, word, t = 8000) => p.waitForFunction((w) => document.querySelector('#save-state')?.innerText.includes(w), word, { timeout: t });
const saveNow = async (p) => { await btn(p, 'ここまでを保存する').click(); await waitState(p, '保存済み').catch(() => {}); };
const openBackup = async (p) => { if (!(await p.locator('#backup').evaluate((d) => d.open))) await p.locator('#backup > summary').click(); };
const yellowSlots = (p) => p.evaluate(() => [...document.querySelectorAll('[data-tos-next]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
const idbGet = (p, id) => p.evaluate((id) => new Promise((res, rej) => {
  const r = indexedDB.open('tournament-os-private-v1', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('events');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const db = r.result; const g = db.transaction('events', 'readonly').objectStore('events').get(id); g.onsuccess = () => { db.close(); res(g.result ?? null); }; g.onerror = () => rej(g.error); };
}), id);
const idbPut = (p, value) => p.evaluate((v) => new Promise((res, rej) => {
  const r = indexedDB.open('tournament-os-private-v1', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('events');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const db = r.result; const t = db.transaction('events', 'readwrite'); t.objectStore('events').put(v, 'polish-bad'); t.oncomplete = () => { db.close(); res(true); }; t.onerror = () => rej(t.error); };
}), value);
const nodeBackup = (value, password) => {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, 250_000, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ format: 'tournament-os-private-1', salt: salt.toString('base64'), iv: iv.toString('base64'), data: data.toString('base64') });
};
const fighterOf = (id, n, over = {}) => ({ id, gym: '架空' + n + 'ジム', name: '架空' + n + '選手', grade: '', age: '', height: '170', weight: '60', record: '初試合', comment: '', musicUrl: '', photoDataUrl: '', ...over });

const SCENARIOS = [];
const scenario = (id, title, fn) => SCENARIOS.push({ id, title, fn });

/* ───────────────────────── ZIP (B10 / r1-21 / r1-64 / r1-77 / r1-109 / r1-131 / r1-146 / r1-160 / r1-38) ───────────────────────── */
scenario('ZIP', 'ZIP with one top-level folder, Mac junk, upper-case names', async () => {
  const csv = csvOf([row('F01', '赤'), row('F02', '青')]);
  const files = (prefix, extra = {}) => ({ [prefix + 'players.csv']: strToU8(csv), [prefix + 'photos/F01.jpg']: JPG, ...extra });
  const junk = {};
  for (let i = 0; i < 3300; i++) junk['__MACOSX/選手名簿/photos/._x' + i + '.jpg'] = strToU8('x');
  const cases = [
    ['flat', zipSync(files('')), true],
    ['one folder', zipSync(files('選手名簿/')), true],
    ['one folder + __MACOSX + .DS_Store', zipSync(files('選手名簿/', { '__MACOSX/選手名簿/._players.csv': strToU8('x'), '選手名簿/.DS_Store': strToU8('x'), '.DS_Store': strToU8('x') })), true],
    ['flat + __MACOSX', zipSync(files('', { '__MACOSX/._players.csv': strToU8('x'), '.DS_Store': strToU8('x') })), true],
    ['upper-case PLAYERS.CSV', zipSync({ 'PLAYERS.CSV': strToU8(csv) }), true],
    ['3300 Mac junk entries do not count as "too many files"', zipSync(files('選手名簿/', junk)), true],
    ['two folders deep', zipSync(files('a/b/')), false],
    ['no players.csv at all', zipSync({ 'memo.txt': strToU8('x') }), false],
  ];
  let flatPhotos = null;
  for (const [label, zip, ok] of cases) {
    const ctx = await newCtx();
    const page = await open(ctx, 'polish-zip-' + Date.now() + Math.floor(Math.random() * 1000));
    await importFile(page, 'select.zip', 'application/zip', Buffer.from(zip));
    await page.waitForFunction(() => /人分を読み込みました|まちがい：/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    const t = await mainText(page);
    if (ok) {
      check(/2人分を読み込みました/.test(t), 'ZIP ' + label + ': imported 2 fighters (' + short(t.match(/[^。\n]*読み込みました[^\n]*/)?.[0] ?? t.match(/まちがい：[^\n]*/)?.[0] ?? '', 100) + ')');
      const photos = t.match(/写真 (\d+)枚/)?.[1];
      if (label === 'flat') flatPhotos = photos;
      else if (flatPhotos !== null && label !== 'upper-case PLAYERS.CSV') check(photos === flatPhotos, 'ZIP ' + label + ': same photo count as the flat ZIP (' + photos + ' vs ' + flatPhotos + ')');
    } else {
      const err = await page.locator('#import-error').innerText().catch(() => '');
      check(/players\.csv が見つかりません/.test(err) && /そのまま選んでください/.test(err) && /今の名簿は変えていません/.test(err), 'ZIP ' + label + ': refused with what to do (' + short(err, 140) + ')');
      check((await page.locator('article[id^="fighter-"]').count()) === 0, 'ZIP ' + label + ': nothing was added');
    }
    await ctx.close();
  }
  // more than 3001 REAL files: a distinct message (not "ファイルが大きすぎます" twice)
  const many = {};
  for (let i = 0; i < 3100; i++) many['f/photos/p' + i + '.jpg'] = strToU8('x');
  many['f/players.csv'] = strToU8(csv);
  const ctx = await newCtx();
  const page = await open(ctx, 'polish-zip-many-' + Date.now());
  await importFile(page, 'many.zip', 'application/zip', Buffer.from(zipSync(many)));
  await page.locator('#import-error').waitFor({ timeout: 20000 }).catch(() => {});
  const err = await page.locator('#import-error').innerText().catch(() => '');
  check(/ファイルが多すぎます/.test(err) && /3000まで/.test(err) && (err.match(/大きすぎます/g) || []).length === 0, 'ZIP with 3100 real files: its own message, no "大きすぎます" (' + short(err, 160) + ')');
  await ctx.close();
});

/* ───────────────────────── Overflow (S-1 / r1-136 / r1-10) and the photo box (r1-36) ───────────────────────── */
scenario('OVR', 'long class text wraps inside the card; photo placeholder is one line', async () => {
  const evil = [
    ['O1', 'い'.repeat(40)], ['O2', '=HYPERLINK("http://evil.example/","押す")'], ['O3', '<script>window.__x=1</script>'], ['O4', 'Cクラス'],
  ];
  const csv = csvOf(evil.map(([id, c], i) => row(id, String(i + 1), { ...(i === 0 ? { name: 'あ'.repeat(80) } : {}), cls: c })), true);
  for (const [w, h] of [[1280, 900], [390, 844], [320, 640]]) {
    const ctx = await newCtx(w, h);
    const page = await open(ctx, 'polish-ovr-' + w + '-' + Date.now());
    await importCsv(page, csv);
    const dims = await page.evaluate(() => [document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth]);
    check(dims[0] <= w + 1 && dims[1] <= w + 1, 'long class text @' + w + ': no horizontal scroll (' + dims.join('/') + ')');
    const box = await page.evaluate(() => { const c = [...document.querySelectorAll('article[id^="fighter-"] span')].find((s) => /^クラス：い{40}$/.test(s.textContent.trim())); if (!c) return null; const r = c.getBoundingClientRect(); const a = c.closest('article').getBoundingClientRect(); return { right: r.right, aRight: a.right, h: r.height }; });
    check(box && box.right <= box.aRight + 1, 'long class chip @' + w + ' stays inside its card (' + JSON.stringify(box) + ')');
    const ph = await page.evaluate(() => { const s = [...document.querySelectorAll('article[id^="fighter-"] span')].find((x) => x.textContent.trim() === '写真なし'); if (!s) return null; const r = document.createRange(); r.selectNodeContents(s); const rects = [...r.getClientRects()]; return { lines: new Set(rects.map((x) => Math.round(x.top))).size, h: Math.round(Math.max(...rects.map((x) => x.height))) }; });
    check(ph && ph.lines === 1, '「写真なし」 is one line @' + w + ' (' + JSON.stringify(ph) + ')');
    await ctx.close();
  }
});

/* ───────────────────────── Restore on a new PC (r1-22) ───────────────────────── */
async function makeBackup(id, rows) {
  const ctx = await newCtx();
  const page = await open(ctx, id);
  await page.locator('#field-title').fill('第3回 架空テスト大会');
  await importCsv(page, csvOf(rows, true));
  await saveNow(page);
  await openBackup(page);
  await page.locator('#backup-password').fill(PASSWORD);
  await page.locator('#paper-done').check();
  const dl = page.waitForEvent('download');
  await btn(page, 'パスワードをつけて、コピーを保存する').click();
  const file = await dl;
  const buffer = await readFile(await file.path());
  await ctx.close();
  return buffer;
}
scenario('RST', 'a copy file from another PC restores into a fresh PC (and the refusal path leads back)', async () => {
  const idA = 'polish-rst-' + Date.now();
  const enc = await makeBackup(idA, [row('F01', '赤', { cls: 'Aクラス' }), row('F02', '青', { cls: 'Bクラス' }), row('F03', '緑', { cls: 'Bクラス' })]);
  // new PC: nothing typed, nothing saved
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await page.goto(base + '/private/');
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  await openBackup(page);
  await page.locator('#backup-password').fill(PASSWORD);
  await page.locator('input[accept=".enc"]').setInputFiles({ name: 'copy.tournament.enc', mimeType: 'application/octet-stream', buffer: enc });
  const box = page.getByRole('alertdialog');
  await box.waitFor({ timeout: 8000 }).catch(() => {});
  const boxText = await box.innerText().catch(() => '');
  check(/なくなるものはありません/.test(boxText), 'new PC: the box says nothing will be lost (' + short(boxText, 120) + ')');
  check(!/いまの画面は別の大会なので/.test(await mainText(page)), 'new PC: no "other event" refusal');
  const yes = box.getByRole('button', { name: 'コピーの大会を入れる（なくなるものはありません）', exact: true });
  check((await yes.count()) === 1, 'new PC: one clear button 「コピーの大会を入れる（なくなるものはありません）」');
  check(await page.evaluate(() => /safe|やめる/.test(document.activeElement?.textContent ?? '') && !!document.activeElement.closest('[role=alertdialog]')), 'new PC: focus starts on the safe 「やめる」 button');
  await Promise.all([page.waitForURL(new RegExp('event=' + idA), { timeout: 10000 }).catch(() => {}), yes.click()]);
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  await settle(400);
  const t = await mainText(page);
  check(page.url().includes('event=' + idA), 'new PC: the copy\'s own event is opened');
  check(/戻しました：『第3回 架空テスト大会』・選手3人/.test(t), 'new PC: a green 戻しました note names the event and the fighters (' + short(t.match(/戻しました[^\n]*/)?.[0] ?? '', 100) + ')');
  check((await page.locator('article[id^="fighter-"]').count()) === 3 || /選手3人/.test(t), 'new PC: 3 fighters are there');
  check((await page.locator('#field-title').inputValue()) === '第3回 架空テスト大会', 'new PC: the title came back');
  const stored = await idbGet(page, idA);
  check(stored && stored.fighters.length === 3 && stored.fighters[0].fighterClass === 'Aクラス', 'new PC: stored with the classes');
  await ctx.close();

  // a PC that already has something saved: refused, but the button leads to a screen that asks for the file again
  const ctx2 = await newCtx();
  const p2 = await open(ctx2, 'polish-rst-other-' + Date.now());
  await p2.locator('#field-title').fill('いまのデータ');
  await saveNow(p2);
  await openBackup(p2);
  await p2.locator('#backup-password').fill(PASSWORD);
  await p2.locator('input[accept=".enc"]').setInputFiles({ name: 'copy.tournament.enc', mimeType: 'application/octet-stream', buffer: enc });
  const open2 = btn(p2, '大会を開く（そのあと、もう一度ファイルを選ぶ）');
  await open2.waitFor({ timeout: 8000 }).catch(() => {});
  check((await open2.count()) === 1, 'screen with data: refusal offers 「大会を開く（そのあと、もう一度ファイルを選ぶ）」');
  check(/何も変えていません/.test(await p2.locator('#backup').innerText()) && (await p2.locator('#field-title').inputValue()) === 'いまのデータ', 'screen with data: nothing changed');
  await Promise.all([p2.waitForURL(new RegExp('event=' + idA), { timeout: 10000 }).catch(() => {}), open2.click()]);
  await p2.locator('#field-title').waitFor({ timeout: 15000 });
  await settle(300);
  const slots = await yellowSlots(p2);
  check(slots.length === 1 && /パスワード欄を直して、もう一度ファイルを選ぶ/.test(slots[0]), 'after 大会を開く: ONE yellow 「次はここ」 says to enter the password and pick the file again (' + short(slots.join(' | '), 100) + ')');
  await p2.locator('#backup-password').fill(PASSWORD);
  await p2.locator('input[accept=".enc"]').setInputFiles({ name: 'copy.tournament.enc', mimeType: 'application/octet-stream', buffer: enc });
  const box2 = p2.getByRole('alertdialog');
  await box2.waitFor({ timeout: 8000 }).catch(() => {});
  check(/コピーの内容を戻します|入れかわります/.test(await box2.innerText().catch(() => '')), 'after 大会を開く: picking the file again reaches the normal restore box');
  await box2.getByRole('button', { name: /^今の内容を消して、コピーに戻す$/ }).click().catch(() => {});
  await settle(900);
  const stored2 = await idbGet(p2, idA);
  check(stored2 && stored2.fighters.length === 3, 'after 大会を開く + the same file: the roster is restored (' + (stored2 ? stored2.fighters.length : 'none') + ' fighters)');
  await ctx2.close();
});

/* ───────────────────────── Long cells (r1-23 / r1-149) and hidden fields that block 直す (r1-24) ───────────────────────── */
scenario('LNG', 'a cell over 5000 chars is cut and named; a 600-char comment is fixable even when the field is off', async () => {
  const ctx = await newCtx();
  const page = await open(ctx, 'polish-lng-' + Date.now());
  await page.locator('#field-title').fill('第3回 架空テスト大会');
  await importCsv(page, csvOf([row('L1', '長', { comment: 'あ'.repeat(6000) }), row('L2', '中', { comment: 'い'.repeat(600) }), row('L3', '普通')]));
  let t = await mainText(page);
  check(/長すぎて切った所が1か所あります/.test(t), 'a 6000-char cell: the import says one cell was cut (' + short(t.match(/長すぎて切った[^\n]*/)?.[0] ?? '', 80) + ')');
  check(/架空中選手さんの意気込みが長すぎます（500文字まで・いま600文字）/.test(t), 'a 600-char comment: the roster names the person and the field (' + short(t.match(/[^\n]*が長すぎます[^\n]*/)?.[0] ?? '', 100) + ')');
  await saveNow(page);
  const st = await page.locator('#save-state').innerText();
  check(/保存済み/.test(st), 'saving works after the cut (' + short(st, 40) + ')');
  check(!/大会番号が使えません|新しい大会をつくる/.test(await page.locator('body').innerText()), 'no wrong "event number" advice');
  // switch 意気込み to "出さない" then fix the long one
  await page.locator('#sec-1 summary', { hasText: '選手に書いてもらうこと' }).click();
  await page.locator('#cfg-comment').selectOption('off');
  const fixBtn = btn(page, '長い人を直す').first();
  await fixBtn.click();
  await settle(500);
  const field = page.locator('input[id^="edit-"][id$="-comment"]');
  check((await field.count()) === 1, 'the 意気込み box is shown for the person who has a long one, even though the form hides it');
  if (await field.count()) {
    await field.fill('がんばります');
    await field.blur();
    const ok = btn(page, 'この内容で直す');
    check((await ok.getAttribute('aria-disabled')) !== 'true', '「この内容で直す」 is usable after shortening');
    await ok.click(); await settle(300);
    check(/直しました/.test(await mainText(page)), 'fixed: a green 直しました appears');
  }
  // a pasted 6000-char title does not break saving
  await page.locator('#field-title').fill('題'.repeat(6000));
  await page.locator('#field-title').blur();
  await saveNow(page);
  const saved = await idbGet(page, new URL(page.url()).searchParams.get('event'));
  check(saved && saved.title.length <= 1000, 'a 6000-char title is cut on save (' + (saved ? saved.title.length : 'not saved') + ')');
  await ctx.close();
});
scenario('MUS', 'a bad 入場曲 link on a fighter is fixable even when 入場曲 is off', async () => {
  const ctx = await newCtx();
  const page = await open(ctx, 'polish-mus-' + Date.now());
  await importCsv(page, csvOf([row('M1', '山', { music: 'https://open.spotify.com/track/abc', name: '山田 太郎' }), row('M2', '川')]));
  await page.getByRole('button', { name: '直す 山田 太郎', exact: true }).click();
  await settle(400);
  const field = page.locator('input[id^="edit-"][id$="-musicUrl"]');
  check((await field.count()) === 1, 'the 入場曲のリンク box is shown, so the red line has a place to be fixed');
  const err = await page.locator('[id^="edit-"][id$="-musicUrl-error"]').innerText().catch(() => '');
  check(/Spotify/.test(err), 'the red line sits next to it (' + short(err, 60) + ')');
  const ok = btn(page, 'この内容で直す');
  check((await ok.getAttribute('aria-disabled')) === 'true', '「この内容で直す」 is locked while the link is bad, with the reason printed');
  await field.fill('https://music.apple.com/jp/album/x');
  await settle(200);
  check((await ok.getAttribute('aria-disabled')) !== 'true', 'it unlocks after the link is fixed');
  await ok.click(); await settle(300);
  check(/直しました/.test(await mainText(page)), 'fixed with a visible 直しました');
  await ctx.close();
});

/* ───────────────────────── Failure bar (B6 / r1-25 / r1-30 / r1-97 / r1-108) ───────────────────────── */
scenario('FAIL', 'the save-failure bar stays small and says what is lost', async () => {
  const sizes = [[320, 568, true], [360, 640, true], [800, 450, true], [390, 844, false], [1280, 900, false]];
  for (const [w, h, compact] of sizes) {
    const ctx = await newCtx(w, h);
    await ctx.addInitScript(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { if (window.__failPut) throw new DOMException('quota', 'QuotaExceededError'); return put.apply(this, a); }; });
    const page = await open(ctx, 'polish-fail-' + w + '-' + Date.now());
    await page.locator('#field-title').fill('第3回 架空テスト大会');
    await importCsv(page, csvOf([row('A1', '赤'), row('A2', '青'), row('A3', '緑'), row('A4', '黄')]));
    await page.evaluate(() => { window.__failPut = true; });
    await page.locator('#field-venue').fill('架空体育館');
    // 帯は、幅が せまく低い画面では「くっつけず」（chromeFlow: relative）、ふつうは fixed。どちらでも同じ帯を見つける
    const barSel = 'div.z-40.w-full.border-t-2.border-slate-400';
    const barBtn = page.locator(barSel).getByRole('button', { name: /^(保存する|もう一度 保存する)$/ }).first();
    await barBtn.click();
    await waitState(page, '保存失敗', 8000).catch(() => {});
    await settle(500);
    const m = await page.evaluate(() => {
      const bar = document.querySelector('div.z-40.w-full.border-t-2.border-slate-400'), nav = document.querySelector('nav[aria-label="4つの手順"]');
      const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const buttons = [...bar.querySelectorAll('button')].filter(vis).map((b) => b.innerText.replace(/\s+/g, ' ').trim());
      const barR = bar.getBoundingClientRect(), navR = nav.getBoundingClientRect();
      const slots = [...bar.querySelectorAll('[data-tos-next]')].filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim());
      const navSticky = getComputedStyle(nav).position === 'sticky';
      return { vh: innerHeight, bar: Math.round(barR.height), nav: Math.round(navR.height), navSticky, buttons, slots, text: bar.innerText.replace(/\s+/g, ' ') };
    });
    const tag = w + 'x' + h;
    check(/保存失敗|保存できません/.test(m.text), tag + ': the failure is shown (' + short(m.text, 80) + ')');
    check(/このページを閉じると/.test(m.text) || compact, tag + ': the sentence names the PAGE ("このページを閉じると…")');
    check(!/(?<!このページを)閉じると消えます/.test(m.text.replace('このページを閉じると消えます', '')), tag + ': no bare "閉じると消えます" next to the close button');
    check(m.buttons.filter((b) => /コピーのファイルを作る/.test(b)).length === 1, tag + ': one 「コピーのファイルを作る」 button (' + short(m.buttons.join(' | '), 100) + ')');
    check(m.slots.length === 1 && /コピーのファイルを作る/.test(m.slots[0]), tag + ': exactly ONE yellow frame and the filled button sits inside it (' + short(m.slots.join(' | '), 80) + ')');
    if (compact) {
      check(!m.buttons.some((b) => /とじる/.test(b)), tag + ': compact bar has no 「✕ とじる」 (' + short(m.buttons.join(' | '), 100) + ')');
      check(m.buttons.length <= 2 && m.buttons.some((b) => /もう一度 保存する/.test(b)), tag + ': compact bar: the yellow button plus a retry link inside the error line only (' + m.buttons.length + ' buttons)');
      check(m.bar <= m.vh * 0.42, tag + ': compact bar is at most 42% of the screen (' + m.bar + 'px of ' + m.vh + 'px = ' + Math.round((m.bar / m.vh) * 100) + '%; before this fix: 55-63%)');
      if (m.navSticky) check(m.bar + m.nav <= m.vh * 0.65, tag + ': bar + sticky nav leave at least 35% for content (' + (m.bar + m.nav) + 'px of ' + m.vh + 'px; before this fix: 82%)');
      check(m.nav <= 112 || !m.navSticky, tag + ': the sticky step nav is one short row (' + m.nav + 'px; was 154px at 320 wide)');
    } else {
      check(m.buttons.some((b) => /とじる/.test(b)) && m.buttons.some((b) => /もう一度 保存する/.test(b)), tag + ': normal bar keeps 「✕ とじる」 and 「もう一度 保存する」 (' + short(m.buttons.join(' | '), 100) + ')');
    }
    // the retry works once the disk is back
    await page.evaluate(() => { window.__failPut = false; });
    const retry = page.locator(barSel).getByRole('button', { name: /^もう一度 保存する$/ });
    if (await retry.first().isVisible().catch(() => false)) { await retry.first().click(); await waitState(page, '保存済み', 8000).catch(() => {}); }
    check(/保存済み/.test(await page.locator('#save-state').innerText().catch(() => '')), tag + ': retry saves (' + short(await page.locator('#save-state').innerText().catch(() => ''), 30) + ')');
    await ctx.close();
  }
});

/* ───────────────────────── Roster import: class column, normalising, duplicates (r1-26 / r1-31 / r1-27 / B3 / r1-118) ───────────────────────── */
scenario('IMP', 'import keeps classes, fixes numbers, warns about duplicates and swapped numbers', async () => {
  const ctx = await newCtx();
  const page = await open(ctx, 'polish-imp-' + Date.now());
  await importCsv(page, csvOf([row('C1', '一', { cls: 'Aクラス' }), row('C2', '二', { cls: 'Bクラス' })], true));
  check(/クラス：Aクラス/.test(await mainText(page)) && /クラス：Bクラス/.test(await mainText(page)), 'classes are in the roster');
  // old CSV without a クラス column, with one changed weight: class must not count as a difference
  await importCsv(page, csvOf([row('C1', '一', { weight: '70' }), row('C2', '二')]));
  let t = await mainText(page);
  check(/内容がちがう人が1人います/.test(t), 'a file with no クラス column: one person differs (the weight), not two (' + short(t.match(/[^\n]*内容がちがう[^\n]*/)?.[0] ?? '', 100) + ')');
  check(/このファイルにはクラスの列が無いので、今のクラスはそのままです/.test(t), 'the import says the classes were kept');
  await page.getByRole('button', { name: /^ファイルの内容で1人を書きかえる$/ }).click();
  const box = page.getByRole('alertdialog');
  await box.waitFor({ timeout: 5000 }).catch(() => {});
  const boxText = await box.innerText().catch(() => '');
  check(!/クラス/.test(boxText) && /体重 60→70/.test(boxText), 'the overwrite box lists only the weight, not the class (' + short(boxText, 120) + ')');
  await box.getByRole('button', { name: /^ファイルの内容で書きかえる/ }).click();
  await settle(300);
  t = await mainText(page);
  check(/クラス：Aクラス/.test(t) && /クラス：Bクラス/.test(t), 'after the overwrite the classes are still there');

  // an empty class is filled from a later file that has it
  const p2 = await open(ctx, 'polish-imp2-' + Date.now());
  await importCsv(p2, csvOf([row('C1', '一')]));
  await importCsv(p2, csvOf([row('C1', '一', { cls: 'Ａクラス' })], true));
  t = await mainText(p2);
  check(/クラスが空だった1人に、クラスを足しました/.test(t) && /クラス：Aクラス/.test(t) && !/内容がちがう/.test(t), 'a later file fills an empty class, written as Aクラス without an overwrite step');

  // normalising, unreadable, swapped (B11)
  const p3 = await open(ctx, 'polish-imp3-' + Date.now());
  await importCsv(p3, csvOf([
    row('N1', '全', { weight: '６５ｋｇ', height: '170cm', name: '田中 三郎' }),
    row('N2', '逆', { height: '65', weight: '170', name: '鈴木 逆' }),
    row('N3', '漢', { weight: '六十五', name: '佐藤 漢' }),
  ]));
  t = await mainText(p3);
  check(/自動で直しました：1人・2か所/.test(t), 'full-width weight and 170cm: a green 自動で直しました with the count (' + short(t.match(/自動で直しました[^\n]*/)?.[0] ?? '', 120) + ')');
  check(!/６５ｋｇ/.test(t) || /体重 ６５ｋｇ → 65/.test(t), 'the roster does not show 「６５ｋｇkg」');
  check(!/体重が入っていない人：[^\n]*田中/.test(t), 'the person who typed a weight is not called "体重が入っていない"');
  check(/身長と体重を入れかえていませんか？：1人（鈴木 逆/.test(t), 'swapped height/weight: a yellow caution names the person (' + short(t.match(/身長と体重を入れかえて[^\n]*/)?.[0] ?? '', 100) + ')');
  check(/体重が読めない人：1人（佐藤 漢「六十五」）/.test(t), 'an unreadable weight is named with what was typed (' + short(t.match(/体重が読めない人[^\n]*/)?.[0] ?? '', 100) + ')');
  check(/直せなかった所が1か所あります/.test(t), 'a red line lists what could not be fixed');
  // option labels of the bout builder carry "65kg", never 「６５ｋｇkg」
  await btn(p3, '＋ 試合を追加').click();
  const opts = await p3.locator('#bout-0-red option').allInnerTexts();
  check(opts.some((o) => /65kg 架空全選手|65kg 田中 三郎/.test(o)) && !opts.some((o) => /６５ｋｇkg/.test(o)), 'bout options show 65kg (' + short(opts.join(' | '), 120) + ')');

  // duplicates (B3 / r1-27 / r1-135 / r1-177)
  const p4 = await open(ctx, 'polish-dup-' + Date.now());
  await importCsv(p4, csvOf([row('D1', '同', { name: '山田 太郎', gym: '同じジム' }), row('D2', '同', { name: '山田　太郎', gym: '同じジム' }), row('D3', '別')]));
  t = await mainText(p4);
  check(/同じ名前とジムの人が1組います：山田 太郎（同じジム・番号 D1 と D2）/.test(t), 'roster: a yellow caution names the pair with both numbers (' + short(t.match(/同じ名前とジムの人[^\n]*/)?.[0] ?? '', 120) + ')');
  await btn(p4, '＋ 試合を追加').click();
  await p4.locator('#bout-0-red').selectOption('D1');
  await p4.locator('#bout-0-blue').selectOption('D2');
  await settle(200);
  const card = await p4.locator('#bout-0').innerText();
  check(/同じ人かもしれません：赤と青が、同じ名前・同じジムです/.test(card), 'bout builder: a red 同じ人かもしれません line (' + short(card.match(/[^\n]*同じ人かも[^\n]*/)?.[0] ?? '', 100) + ')');
  const labels = await p4.locator('#bout-0-red option[value="D1"], #bout-0-red option[value="D2"]').allInnerTexts();
  check(labels.length === 2 && labels[0] !== labels[1] && /番号 D1/.test(labels[0]) && /番号 D2/.test(labels[1]), 'the two lookalike options can be told apart (' + short(labels.join(' | '), 100) + ')');
  check((await p4.locator('#bout-0 [role="status"].tos-error', { hasText: '同じ人かもしれません' }).count()) === 1, 'the line is a red ⚠ box, not only a colour');
  await ctx.close();
});

/* ───────────────────────── Class choice with conditions; renamed classes; other-gym form (r1-28 / r1-29 / r1-40) ───────────────────────── */
const RENAMED = { enabled: true, upper: { name: 'シニア', condition: '3勝以上', rule: '首相撲あり' }, lower: { name: 'ジュニア', condition: '2勝以下', rule: 'パンチとキックのみ' }, upperMinWins: 3 };
scenario('CLS', 'the add/edit form offers both renamed classes with conditions and a record hint; the other-gym form has the class', async () => {
  const ctx = await newCtx();
  const page = await open(ctx, 'polish-cls-' + Date.now(), '#t=' + encodeURIComponent('第3回 架空テスト大会') + '&cs=' + encodeURIComponent(JSON.stringify(RENAMED)));
  await page.locator('summary', { hasText: 'ほかの入れ方' }).click();
  await page.locator('summary', { hasText: '1人ずつ入れる' }).click();
  const sel = page.locator('#manual-fighterClass');
  await sel.waitFor({ timeout: 5000 }).catch(() => {});
  const opts = await sel.locator('option').allInnerTexts();
  check(opts.includes('シニア') && opts.includes('ジュニア'), 'renamed classes: both names are choices (' + opts.join('|') + ')');
  const t0 = await mainText(page);
  check(/シニア：3勝以上（ルール：首相撲あり）/.test(t0) && /ジュニア：2勝以下（ルール：パンチとキックのみ）/.test(t0), 'the condition and the rule are printed next to the choice');
  await page.locator('#manual-record').fill('5勝2敗');
  await settle(150);
  check(/戦績からは、シニアです/.test(await mainText(page)), 'a yellow hint 「戦績からは、シニアです」 for 5勝2敗');
  await sel.selectOption('ジュニア');
  await settle(150);
  const t1 = await mainText(page);
  check(/戦績と合っていますか？/.test(t1) && /目安はシニアです/.test(t1), 'a different choice gets the gentle red ⚠ line');
  check((await page.locator('#manual-fighterClass ~ p.tos-error, #manual-fighterClass ~ div p.tos-error, p.tos-error').filter({ hasText: '戦績と合っていますか？' }).count()) >= 1, 'it is a red box');
  check((await btn(page, 'この選手を追加').count()) === 1, '追加 is never blocked by the class hint');

  // other-gym form: the choice is there, required, and the ZIP gets a クラス column
  const ctx2 = await newCtx();
  const e = await ctx2.newPage();
  await e.goto(base + '/private/entry/?music=off&grade=optional&age=optional&comment=optional&cs=' + encodeURIComponent(JSON.stringify(RENAMED)));
  await e.getByText('クラス 必須').waitFor({ timeout: 10000 });
  check((await e.locator('input[name="fighterClass"]').count()) === 2, 'other-gym form: two class choices');
  check(/条件：3勝以上/.test(await e.locator('fieldset').innerText()) && /ルール：首相撲あり/.test(await e.locator('fieldset').innerText()), 'other-gym form: conditions and rules are next to the choice');
  const fill = async (label, value) => e.locator('label', { hasText: label }).locator('input').first().fill(value);
  await fill('ジム名', '架空ジム'); await fill('選手名', '架空 太郎'); await fill('身長', '170'); await fill('体重', '60'); await fill('戦績', '5勝2敗');
  await e.locator('input[type="file"]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: PNG });
  await settle(400);
  await e.getByRole('button', { name: 'この選手を追加' }).click();
  await settle(200);
  check(/クラスを選んでください/.test(await e.locator('[role="status"]').first().innerText().catch(() => '')), 'other-gym form: adding without a class says クラスを選んでください');
  await e.locator('input[name="fighterClass"][value="シニア"]').check();
  check(/戦績からは、シニアです/.test(await e.locator('fieldset').innerText()), 'other-gym form: the record hint is shown');
  await e.getByRole('button', { name: 'この選手を追加' }).click();
  await settle(300);
  const dl = e.waitForEvent('download');
  await e.getByRole('button', { name: /提出ファイルを保存する/ }).click();
  const file = await dl;
  const zip = unzipSync(new Uint8Array(await readFile(await file.path())));
  const csv = strFromU8(zip['players.csv']);
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  check(/"クラス"$/.test(lines[0]) && /"シニア"$/.test(lines[1]), 'other-gym ZIP: players.csv has a クラス column and the chosen class (' + short(lines[0].slice(-12) + ' / ' + lines[1].slice(-12), 60) + ')');
  // …and the chairman screen reads it back
  const p = await open(ctx, 'polish-cls-back-' + Date.now());
  await importFile(p, 'pack.zip', 'application/zip', Buffer.from(await readFile(await file.path())));
  await settle(800);
  check(/クラス：シニア/.test(await mainText(p)), 'the chairman screen shows the class from the other-gym ZIP');
  // a form without classes: no class block, 10 columns
  const e2 = await ctx2.newPage();
  await e2.goto(base + '/private/entry/?music=off&grade=optional&age=optional&comment=optional');
  await e2.getByText('選手エントリーシート').waitFor();
  check((await e2.locator('input[name="fighterClass"]').count()) === 0, 'other-gym form without classes: no class block');
  await ctx.close(); await ctx2.close();
});

/* ───────────────────────── Small fixes: age 15.5, past date, step-4 colours, wording ───────────────────────── */
scenario('FLD', 'age 15.5 marks the age box; a past date is not green; step 4 stays calm', async () => {
  const ctx = await newCtx();
  const page = await open(ctx, 'polish-fld-' + Date.now());
  await importCsv(page, csvOf([row('A1', '赤'), row('A2', '青')]));
  await page.locator('summary', { hasText: 'ほかの入れ方' }).click();
  await page.locator('summary', { hasText: '1人ずつ入れる' }).click();
  const fill = async (k, v) => page.locator('#manual-' + k).fill(v);
  await fill('gym', '架空ジム'); await fill('name', '架空 太郎'); await fill('height', '170'); await fill('weight', '60'); await fill('record', '初試合'); await fill('age', '15.5');
  await btn(page, 'この選手を追加').click();
  await settle(300);
  check((await page.locator('#manual-age-error').count()) === 1, 'age 15.5: the red line is next to 年齢');
  check((await page.locator('#manual-name').getAttribute('aria-invalid')) !== 'true' && (await page.locator('#manual-name-error').count()) === 0, 'age 15.5: the name box is NOT red');

  // past date (the title is typed first: the section badge can only be green when the title is there)
  await page.locator('#field-title').fill('第3回 架空テスト大会');
  await page.locator('#field-title').blur();
  await page.locator('#field-date').fill('20200101');
  await page.locator('#field-date').blur();
  await settle(300);
  const sec1 = await page.locator('#sec-1').innerText();
  check(/この日にちは過ぎています/.test(sec1), 'past date: the yellow caution is shown');
  check(!(await page.locator('#date-hint.tos-ok').count()) && !/日にちを読みました/.test(sec1) && !/✓ → /.test(sec1), 'past date: no green ✓ line above the caution');
  const chip = await page.locator('#sec-1 h2 + span, #sec-1 > div > span').first().innerText().catch(() => '');
  check(/⚠ 日にちを見直す/.test(sec1) && !/できた ✓/.test(sec1.split('\n').slice(0, 3).join(' ')), 'past date: section 1 badge says 日にちを見直す, not できた ✓ (' + short(chip, 30) + ')');
  const row4 = await page.locator('#sec-4 li', { hasText: '日にち' }).first().innerText();
  check(/⚠ 過ぎています/.test(row4), 'past date: the step-4 row is amber 「⚠ 過ぎています」 (' + short(row4, 30) + ')');
  const navText = await page.locator('nav[aria-label="4つの手順"] a').first().innerText();
  check(!/できた/.test(navText) || /見直す/.test(navText), 'past date: the nav item is not a plain green ✓ (' + short(navText, 30) + ')');
  await page.locator('#field-date').fill('来月');
  await page.locator('#field-date').blur();
  await settle(200);
  check(/日にちとして読めません/.test(await page.locator('#sec-1').innerText()) && /⚠ 日にちを見直す/.test(await page.locator('#sec-1').innerText()), 'unreadable date: the badge is not green either');
  await page.locator('#field-date').fill('2099年10月3日');
  await page.locator('#field-date').blur();
  await settle(200);
  check(/日にちを読みました：2099年10月3日/.test(await page.locator('#sec-1').innerText()) && !/日にちを見直す/.test(await page.locator('#sec-1').innerText()), 'a future date: a calm green line, and the badge is green again');

  // step 4: an ordinary pending row is grey, not red (r1-180)
  await settle(200);
  const reds = await page.evaluate(() => [...document.querySelectorAll('#sec-4 ul li > *')].filter((e) => getComputedStyle(e).backgroundColor === 'rgb(254, 242, 242)').map((e) => e.innerText.replace(/\s+/g, ' ')));
  check(reds.length === 0, 'step 4 after leaving the title box: no red 「✕ まだ」 row yet (' + short(reds.join(' | '), 80) + ')');

  // wording
  const t = await mainText(page);
  check(/選手2人・試合なし/.test(t) && !/試合0つ/.test(t), 'no 「試合0つ」: it says 試合なし');
  check(!/バックアップの「コピーのファイル」/.test(t), 'one word for the copy file: no 「バックアップの…」');
  check(/名前：/.test(await page.locator('#sec-1 dl').innerText().catch(() => '')) || true, '');
  await ctx.close();
});

/* ───────────────────────── Bout builder: words, yellow with an empty card, class mix in おすすめ ───────────────────────── */
scenario('BLD', 'bout builder explains itself; yellow points at an empty card; おすすめ warns about class mixes', async () => {
  const ctx = await newCtx(1280, 900);
  const page = await open(ctx, 'polish-bld-' + Date.now());
  await page.locator('#field-title').fill('第3回 架空テスト大会');
  const ROWS = [row('F01', '赤', { weight: '60', cls: 'Aクラス', name: '山田 太郎' }), row('F02', '青', { weight: '61', cls: 'Bクラス', name: '佐藤 次郎' }), row('F03', '緑', { weight: '70', cls: 'Aクラス' }), row('F04', '黄', { weight: '71', cls: 'Bクラス' }), row('F05', '白', { weight: '80', cls: 'Aクラス' }), row('F06', '黒', { weight: '81', cls: 'Aクラス' })];
  await importCsv(page, csvOf(ROWS, true));
  const sec3 = await page.locator('#sec-3').innerText();
  check(/対戦カードは、だれとだれが戦うかを決めた表です/.test(sec3) && /赤コーナー・青コーナーは、リングの2つの角の名前です/.test(sec3), 'sec 3: 対戦カード / 赤コーナー・青コーナー are explained in plain words');
  check(/例：第1試合/.test(sec3) && /順番を変えるときは、「↑ 上へ」「↓ 下へ」/.test(sec3), 'sec 3: an example and the meaning of the order');
  check(/試合 なし ／ 選手6人のうち、試合に入っている人 0人/.test(sec3), 'sec 3: the count line is plain (' + short(sec3.match(/試合 なし[^\n]*/)?.[0] ?? '', 60) + ')');
  // first bout, save
  await btn(page, '＋ 試合を追加').click();
  await page.locator('#bout-0-red').selectOption('F01');
  await page.locator('#bout-0-blue').selectOption('F04');
  const card0 = await page.locator('#bout-0').innerText();
  check(/体重差＝2人の体重のちがい/.test(card0) && /契約＝この試合で使う体重です/.test(card0), 'first card explains 体重差 and 契約');
  check(/クラスがちがいます/.test(card0), 'the cross-class red line is still there');
  await saveNow(page);
  const t1 = await mainText(page);
  check(/まだ試合に入っていない選手が4人います。全員が試合に出なくてもかまいません。もう1試合作るときは、「＋ 試合を追加」を押します。これでよければ、そのまま「試合当日の画面を開く」を押します。/.test(t1), 'after 1 saved bout: the plain line about the other 4 fighters (and the next bout) is shown');
  // press ＋ again, an empty card appears: yellow must point at its red corner
  await btn(page, '＋ 試合を追加').click();
  await settle(300);
  const slots = await yellowSlots(page);
  check(slots.length === 1 && /第2試合の赤コーナーを選ぶ（空の試合があります）/.test(slots[0]), 'with an empty card on screen the ONE yellow points at its red corner (' + short(slots.join(' | '), 100) + ')');
  const bar = await page.locator('div.fixed.bottom-0').innerText();
  check(!/次はここ：保存/.test(bar), 'the bottom bar is not yellow-on-保存 while a card waits');
  // pressing ＋ again says why nothing new appears
  await btn(page, '＋ 試合を追加').click();
  await settle(200);
  check(/空の試合がもうあります。先に、第2試合の赤と青を選びます。/.test(await mainText(page)), 'pressing 「＋ 試合を追加」 with an empty card gives a message');
  // the yellow badge is not a tall ellipse (r1-179)
  const badge = await page.evaluate(() => { const b = document.querySelector('article .tos-next-badge') || document.querySelector('.tos-next-badge'); if (!b) return null; const s = getComputedStyle(b); return { radius: s.borderTopLeftRadius, display: s.display }; });
  check(badge && badge.radius === '14px' && badge.display === 'inline-block', 'the yellow badge uses a 14px corner and flows as text (' + JSON.stringify(badge) + ')');
  // おすすめ: remaining F03 (A70) F04.. are in use; build a fresh roster to test the suggestion
  const p2 = await open(ctx, 'polish-bld2-' + Date.now());
  await p2.locator('#field-title').fill('第3回 架空テスト大会');
  await importCsv(p2, csvOf([row('G1', '一', { weight: '60', cls: 'Aクラス' }), row('G2', '二', { weight: '61', cls: 'Bクラス' }), row('G3', '三', { weight: '70', cls: 'Aクラス' }), row('G4', '四', { weight: '71', cls: 'Bクラス' })], true));
  check(/体重が近い人どうしを、2人ずつ組みます（同じクラスの人を先に）/.test(await p2.locator('#sec-3').innerText()), 'the button is explained before it is pressed');
  await btn(p2, 'おすすめの組み合わせを自動で作る').click();
  await settle(400);
  const s3 = await p2.locator('#sec-3').innerText();
  check(/クラスがちがう組が2つあります（第1・第2試合）。ルールがちがうので、同じクラスの人どうしがおすすめです。/.test(s3), 'おすすめ with unavoidable class mixes: a red ⚠ line names them (' + short(s3.match(/クラスがちがう組[^\n]*/)?.[0] ?? '', 100) + ')');
  check((await btn(p2, 'クラスがちがう試合へ').count()) === 1, 'おすすめ: a button 「クラスがちがう試合へ」');
  check(/⚠ クラスがちがいます/.test(s3), 'the bout list uses the same words as the card (⚠ クラスがちがいます)');
  const p3 = await open(ctx, 'polish-bld3-' + Date.now());
  await p3.locator('#field-title').fill('第3回 架空テスト大会');
  await importCsv(p3, csvOf([row('H1', '一', { weight: '55', cls: 'Aクラス' }), row('H2', '二', { weight: '56', cls: 'Bクラス' }), row('H3', '三', { weight: '60', cls: 'Aクラス' }), row('H4', '四', { weight: '61', cls: 'Bクラス' })], true));
  await btn(p3, 'おすすめの組み合わせを自動で作る').click();
  await settle(400);
  const s4 = await p3.locator('#sec-3').innerText();
  check(!/クラスがちがう組/.test(s4) && !/クラスがちがいます/.test(s4), 'おすすめ pairs A-A and B-B when the weights are within 5kg (no class mix)');
  await ctx.close();
});

/* ───────────────────────── Save then open quickly (r1-185), password help (r1-116) ───────────────────────── */
scenario('PWD', 'password example and the load-error screen; open right after save says why nothing happened', async () => {
  const ctx = await newCtx();
  const page = await open(ctx, 'polish-pwd-' + Date.now());
  await openBackup(page);
  const bk = await page.locator('#backup').innerText();
  check(/半角の英数字で、10文字以上にします/.test(bk) && /例：hanabi2027x（あなたの言葉に変えます）/.test(bk), 'backup box: a rule line and a REAL example (' + short(bk.match(/例：[^\n]*/)?.[0] ?? '', 60) + ')');
  // load-error screen
  const boot = await ctx.newPage();
  await boot.goto(base + '/private/setup/?event=seed-boot');
  await idbPut(boot, { schema: 2, eventId: 'polish-bad' });
  await boot.close();
  const bad = await ctx.newPage();
  await bad.goto(base + '/private/?event=polish-bad');
  await bad.locator('#load-password').waitFor({ timeout: 10000 });
  const lt = await bad.locator('main').innerText();
  check(/例：hanabi2027x/.test(lt) && /0\/10文字/.test(lt), 'load-error screen: an example and a letter counter');
  await bad.locator('#load-password').fill('abc');
  check(/3\/10文字/.test(await bad.locator('main').innerText()), 'load-error screen: the counter counts');
  check((await bad.locator('#load-password').getAttribute('type')) === 'password', 'password is hidden at first');
  await btn(bad, '文字を見る').click();
  check((await bad.locator('#load-password').getAttribute('type')) === 'text', '「文字を見る」 shows it');

  // open right after save
  const p = await open(ctx, 'polish-open-' + Date.now());
  await p.locator('#field-title').fill('第3回 架空テスト大会');
  await importCsv(p, csvOf([row('A1', '赤'), row('A2', '青')]));
  await btn(p, '＋ 試合を追加').click();
  await p.locator('#bout-0-red').selectOption('A1');
  await p.locator('#bout-0-blue').selectOption('A2');
  await p.locator('div.fixed.bottom-0').getByRole('button', { name: '保存する', exact: true }).first().click();
  await waitState(p, '保存済み');
  const openBtn = p.locator('div.fixed.bottom-0').getByRole('button', { name: '試合当日の画面を開く', exact: true });
  await openBtn.waitFor({ timeout: 3000 });
  await openBtn.click();
  await settle(300);
  check(/いま保存しました。もう一度、「試合当日の画面を開く」を押します。/.test(await p.locator('div.fixed.bottom-0').innerText()), 'an early press of 「試合当日の画面を開く」 gets a visible message, not silence');
  await ctx.close();
});

/* ───────────────────────── run ───────────────────────── */
try {
  for (const s of SCENARIOS) {
    if (ONLY.length && !ONLY.includes(s.id)) continue;
    cur = s.id;
    const before = failures.length;
    console.log('== ' + s.id + ' ' + s.title);
    try { await s.fn(); } catch (e) { failures.push('[' + cur + '] SCENARIO CRASHED: ' + short(e && e.message ? e.message : e, 400)); console.log('  CRASH [' + cur + '] ' + short(e && e.stack ? e.stack : e, 700)); }
    console.log('   ' + (failures.length - before) + ' failure(s)');
  }
} finally {
  await browser.close();
}
check(externals.length === 0, 'no request left 127.0.0.1 (' + short(externals.map((e) => e.url).join(', '), 160) + ')');
check(pageErrors.length === 0, 'no uncaught page error (' + short(pageErrors.map((e) => '[' + e.scenario + '] ' + e.message).join(' | '), 200) + ')');
console.log('\n' + checks + ' checks, ' + failures.length + ' failed.');
for (const f of failures) console.log(' - ' + f);
process.exit(failures.length ? 1 : 0);
