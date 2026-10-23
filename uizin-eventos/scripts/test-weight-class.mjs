/**
 * Adversarial browser checks for the WEIGHT-CLASS feature (区分→階級) and the CKA LOGO of Tournament OS v3:
 * apply form (two-step choice, required, send), /private/ roster + bout card, /private/live/ single + list view.
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation, except the apply form's single POST to the
 * (simulated) Google endpoint, which is fulfilled locally. All data is fake. It drives the REAL built pages (npm run build:private ->
 * out-private-pages) at 1280px and 390px.
 *
 * Run: python3 -m http.server 4620 -d out-private-pages --bind 127.0.0.1 &
 *      TOS_PLAYWRIGHT_MODULE=playwright TOS_TEST_BASE=http://127.0.0.1:4620 TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-weight-class.mjs
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4620), TOS_ONLY=A,B,C (scenario ids), TOS_CHROME_PATH.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { publicEntryHash } from '../core/publicEntry.ts';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';
import { DEFAULT_WEIGHT_SETTINGS, noClassReviewValue, NO_CLASS_NOTE, NO_CLASS_NOTE_APPLY, weightClassLabel } from '../core/weightClass.ts';
import { emptyTournament } from '../core/privateTournament.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4620';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const ENDPOINT = 'https://script.google.com/macros/s/TOS_WEIGHT_SIM/exec';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

/* ───────────────────────── bookkeeping ───────────────────────── */
let checks = 0, cur = '-';
const failures = [], net = [], externals = [], pageErrors = [], posts = [], dialogs = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 160) => String(s).replace(/\s+/g, ' ').slice(0, n);
const note = (m) => console.log('  note [' + cur + '] ' + m);

/* ───────────────────────── colour maths ───────────────────────── */
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** computed colours (oklch etc. are converted through a canvas), the effective opaque background, size and weight */
const styleOf = (loc) => loc.evaluate((el) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const conv = (str) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = str; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const cs = getComputedStyle(el);
  const layers = [];
  for (let n = el; n; n = n.parentElement) { const c = conv(getComputedStyle(n).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
  let bg = [255, 255, 255];
  for (const l of layers.reverse()) bg = [0, 1, 2].map((i) => Math.round(l[i] * l[3] + bg[i] * (1 - l[3])));
  return { fg: conv(cs.color).slice(0, 3), bg, border: conv(cs.borderTopColor).slice(0, 3), borderW: parseFloat(cs.borderTopWidth), size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) };
});
const hueOf = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d === 0) return -1; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
/** yellow family: hue 38-62deg and clearly coloured (the app's cautions are pale yellow #fefce8 with a dark-yellow #a16207 border, or solid yellow #fef08a) */
const isYellowish = (rgb) => { const h = hueOf(rgb); return h >= 38 && h <= 62 && Math.max(...rgb) - Math.min(...rgb) >= 20; };
const isReddish = ([r, g, b]) => r > 150 && r > g + 60 && r > b + 60;
const isDark = (rgb) => lum(rgb) < 0.2;

/* ───────────────────────── fake data ───────────────────────── */
const CSV_HEAD = '管理番号,ジム名,選手名,学年,年齢,身長,体重,戦績・競技歴,試合への意気込み,入場曲URL（Apple Music推奨）';
const HEAD_CLS = CSV_HEAD + ',クラス';
const quote = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const rowOf = (id, n, rec, cls) => [id, '架空' + n + 'ジム', '架空' + n + '選手', '中1', '13', '155', '60', rec, 'がんばる', '', ...(cls === undefined ? [] : [quote(cls)])].join(',');
const csvPlain = [CSV_HEAD, rowOf('F01', '赤', '初試合'), rowOf('F02', '青', '2勝1敗'), rowOf('F03', '緑', '5勝'), rowOf('F04', '黄', '1戦')].join('\n');
const csvCls = [HEAD_CLS, rowOf('F01', '赤', '5勝', 'Aクラス'), rowOf('F02', '青', '初試合', 'Bクラス'), rowOf('F03', '緑', '1戦', ''), rowOf('F04', '黄', '3勝0敗', 'Aクラス')].join('\n');
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const F = (id, over = {}) => ({ id, gym: '架空ジム', name: '架空選手' + id, grade: '', age: '', height: '170', weight: '60', record: '', comment: '', musicUrl: '', photoDataUrl: '', ...over });
const tournament = (id, o = {}) => ({ ...emptyTournament(id), title: o.title ?? '架空クラス大会', venue: '架空体育館', date: '2027年10月3日', updatedAt: Date.now() - 60_000, currentBout: o.current ?? 0, fighters: o.fighters ?? [], bouts: o.bouts ?? [], ...(o.entryConfig ? { entryConfig: o.entryConfig } : {}) });
const bout = (i, r, b) => ({ id: 'bout-' + i, redId: r, blueId: b, className: '', rule: '' });

const nodeBackup = (value, password) => {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, 250_000, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ format: 'tournament-os-private-1', salt: salt.toString('base64'), iv: iv.toString('base64'), data: data.toString('base64') });
};
const nodeOpen = (text, password) => {
  const p = JSON.parse(text);
  const key = pbkdf2Sync(password, Buffer.from(p.salt, 'base64'), 250_000, 32, 'sha256');
  const buf = Buffer.from(p.data, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8'));
};

/* ───────────────────────── browser helpers ───────────────────────── */
function attach(page) {
  page.on('dialog', (d) => { dialogs.push({ scenario: cur, message: d.message() }); return d.dismiss().catch(() => {}); });
  page.on('pageerror', (e) => { pageErrors.push({ scenario: cur, message: e.message }); });
}
let curW = 1280;
/** Every request is recorded. Same-origin goes through; the one simulated Google POST is answered locally; everything else is aborted and counted. */
async function newCtx(mobile, userAgent) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: curW, height: curW <= 320 ? 640 : 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, acceptDownloads: true, ...(userAgent ? { userAgent } : {}) });
  ctx.__posts = [];
  ctx.on('request', (r) => { if (/^https?:/.test(r.url())) net.push({ scenario: cur, url: r.url(), method: r.method() }); });
  ctx.on('page', attach);
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(base + '/')) return route.continue();
    if (url === ENDPOINT && req.method() === 'POST') {
      const fields = new URLSearchParams(req.postData() || '');
      ctx.__posts.push(fields); posts.push({ scenario: cur, fields });
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><h1>申し込みが完了しました</h1><p>TEST-RECEIPT</p>' });
    }
    externals.push({ scenario: cur, url, method: req.method() });
    return route.abort();
  });
  return ctx;
}
/* The designed width, NOT window.innerWidth: a phone browser widens its layout viewport when something overflows, which would hide the very bug. */
const noOverflow = (p) => p.evaluate((W) => document.documentElement.scrollWidth <= W + 1 && document.body.scrollWidth <= W + 1, curW);
const widest = (p) => p.evaluate((W) => [document.documentElement.scrollWidth, W], curW);
const wideOnes = (p) => p.evaluate((W) => [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > W + 1; }).slice(0, 4).map((e) => e.tagName.toLowerCase() + ' "' + (e.textContent || '').trim().slice(0, 24) + '" right=' + Math.round(e.getBoundingClientRect().right)), curW);
const openBackup = async (p) => { if (!(await p.locator('#backup').evaluate((d) => d.open))) await p.locator('#backup > summary').click(); };
const RESTORE_YES = '今の内容を消して、コピーに戻す';
const DB_NAME = 'tournament-os-private-v1';
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
async function seed(ctx, value) {
  const boot = await ctx.newPage();
  await boot.goto(base + '/private/setup/?event=seed-boot');
  await idbPut(boot, value);
  await boot.close();
}
const openPrivate = async (ctx, id) => {
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=' + id);
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  return page;
};
const openLive = async (ctx, id, list) => {
  const page = await ctx.newPage();
  await page.goto(base + '/private/live/?event=' + id + (list ? '&view=list' : ''));
  await page.locator('main').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !document.body.innerText.includes('このパソコンのデータを読んでいます'), null, { timeout: 15000 });
  return page;
};
const importCsv = (p, csv) => p.locator('#pick-file').setInputFiles({ name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
const btn = (p, name) => p.getByRole('button', { name, exact: true });
const boutCount = (p) => p.locator('article[id^="bout-"]').count();
const addBout = async (p, red, blue) => {
  const n = await boutCount(p);
  /* If the page is so wide that Playwright cannot scroll to the button, the overflow check has already recorded that bug; press the button through the DOM so the rest still runs. */
  await btn(p, '＋ 試合を追加').click({ timeout: 6000 }).catch(async () => { note('add-bout could not be clicked normally (page too wide?); pressing it through the DOM'); await p.evaluate(() => document.getElementById('add-bout').click()); });
  await p.locator('#bout-' + n + '-red').waitFor();
  if (red) await p.locator('#bout-' + n + '-red').selectOption(red);
  if (blue) await p.locator('#bout-' + n + '-blue').selectOption(blue);
  return n;
};
const pressSave = async (p) => {
  const b = p.getByRole('button', { name: /^(保存する|もう一度 保存する)$/ });
  await b.click({ timeout: 6000 }).catch(async () => { note('save could not be clicked normally (page too wide?); pressing it through the DOM'); await b.evaluate((el) => el.click()); });
};
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const waitNotice = (p, text, t = 10000) => p.waitForFunction((w) => [...document.querySelectorAll('[role=status],[role=alert]')].some((n) => n.innerText.includes(w)), text, { timeout: t });

/* ───────────────────────── apply-form helpers ───────────────────────── */
const baseCfg = { endpoint: ENDPOINT, eventId: 'weight-class', title: '架空テスト大会', organizer: '', date: '', venue: '', venueUrl: '', deadline: '', contact: '', music: false, grade: 'off', age: 'off', comment: 'off', protocol: '3', mode: 'live' };
const hashWith = (classes, extra = {}) => publicEntryHash({ ...baseCfg, ...extra, ...(classes ? { classes } : {}) });
const hashW = (weights, extra = {}) => publicEntryHash({ ...baseCfg, ...extra, ...(weights ? { weights } : {}) });
const hashOn = () => hashWith(DEFAULT_CLASS_SETTINGS);
const CLS = (p) => p.locator('#f-fighterClass');
async function openApply(ctx, hash, wait = true) {
  const page = await ctx.newPage();
  await page.goto(base + '/apply/' + hash);
  await page.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
  if (wait) await settle(150);
  return page;
}
async function fillAll(page, record = '初出場', skipClass = true) {
  for (const [label, value] of [['ジム名 必須', '架空ジム'], ['選手名 必須', '架空選手'], ['身長（cm）必須', '170'], ['体重（kg）必須', '65'], ['戦績 必須', record], ['連絡先のお名前 必須', '架空連絡先'], ['電話番号 必須', '09012345678'], ['メールアドレス 必須', 'test@example.com']]) await page.getByLabel(label, { exact: true }).fill(value);
  const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 120, 160); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
  await page.locator('input[type=file]').setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByAltText('選んだ写真').waitFor();
  await page.getByRole('checkbox').check();
}
const reviewBtn = (p) => p.getByRole('button', { name: '入力内容を確認する →', exact: true });
const sendBtn = (p) => p.getByRole('button', { name: 'この内容で送信する', exact: true });
const classPick = (p, which) => CLS(p).locator('input[type=radio][value=' + which + ']').check({ force: false });
async function send(page, ctx) {
  const before = ctx.__posts.length;
  await reviewBtn(page).click();
  await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor({ timeout: 8000 });
  await sendBtn(page).click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  return ctx.__posts.length - before;
}
/** the visible class notes inside the class box */
/** the visible 👉 次はここ markers (there must be exactly one per state) */
const nextMarks = (p) => p.evaluate(() => [...document.querySelectorAll('[data-tos-next]')].map((e) => (e.querySelector('.tos-next-badge')?.textContent || '').trim()));
const classNotes = (p) => CLS(p).evaluate((fs) => [...fs.querySelectorAll('[role=status]')].map((n) => n.innerText.trim()));

/** remove every @supports (color:color-mix(...)){ ... } block (balanced braces): those are Tailwind's guarded upgrades; what is left must be Safari-15 safe */
const stripSupports = (css) => {
  const key = '@supports (color:color-mix(';
  let out = css;
  for (let i = out.indexOf(key); i >= 0; i = out.indexOf(key)) {
    const open = out.indexOf('{', out.indexOf('))', i));
    let depth = 0, j = open;
    for (; j < out.length; j++) { if (out[j] === '{') depth++; else if (out[j] === '}' && --depth === 0) break; }
    out = out.slice(0, i) + out.slice(j + 1);
  }
  return out;
};
/* ───────────────────────── scenarios ───────────────────────── */
const SCENARIOS = [];
const scenario = (id, title, fn) => SCENARIOS.push({ id, title, fn });

const DIV = (p) => p.locator('#f-division');
const WCL = (p) => p.locator('#f-weightClass');
const DEF = DEFAULT_WEIGHT_SETTINGS;
const divOf = (name) => DEF.divisions.find((d) => d.name === name);
const posted = (ctx) => ctx.__posts.at(-1);
/** the text of every <option> of a select */
const optionTexts = (loc) => loc.locator('option').allInnerTexts();
const optionValues = (loc) => loc.locator('option').evaluateAll((os) => os.map((o) => o.value));
async function fillAllW(page, record = '初出場') { await fillAll(page, record); }

/** A. The apply form with weights on. Every state at both widths. */
scenario('A', 'apply form: two-step choice, required, review, send, logo', async (vp) => {
  /* A1 first look: a division box with the 7 divisions, nothing chosen, no weight-class box yet, one yellow marker */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashW(DEF));
    const sel = DIV(page);
    check(await sel.isVisible(), 'A1 the 区分 select is on the form');
    check(/区分/.test(await page.locator('body').innerText()), 'A1 the word 区分 is on the page');
    // R1（owner 修正願 2026-10-22）：選手に見える見出しは「出場区分」。「区分」だけの見出し・案内は残らない
    const divHead = (await page.locator('label[for="f-division"]').innerText()).replace(/\s+/g, ' ');
    check(/^出場区分 必須$/.test(divHead), 'A1 the heading is 出場区分 必須 (' + divHead + ')');
    check(/出場区分を選んでください。出場区分によって、選べる階級/.test(await page.locator('#f-division-hint').innerText()), 'A1 the hint says 出場区分 (' + short(await page.locator('#f-division-hint').innerText(), 80) + ')');
    check(((await page.locator('main').innerText()).replace(/出場区分/g, '').match(/区分/g) || []).length === 0, 'A1 no 区分 stands alone on the apply form (only 出場区分)');
    const texts = await optionTexts(sel);
    check(texts[0] === '選んでください' && texts.length === 1 + DEF.divisions.length, 'A1 first option is 選んでください, then every division (' + texts.length + ')');
    check(DEF.divisions.every((d, i) => texts[i + 1] === d.name), 'A1 the divisions are listed in the sheet order (' + short(texts.join('|'), 160) + ')');
    check((await sel.inputValue()) === '', 'A1 nothing is pre-chosen');
    check((await WCL(page).count()) === 0, 'A1 no 階級 select before a division is chosen');
    const bb = await sel.boundingBox();
    check(bb && bb.height >= 48 && bb.width >= 200, 'A1 the 区分 select is a large target (' + (bb ? Math.round(bb.width) + 'x' + Math.round(bb.height) : '-') + ')');
    check((await sel.getAttribute('aria-required')) === 'true', 'A1 the select says it is required');
    const text = await page.locator('#f-division-hint').innerText().catch(() => '');
    check(/階級/.test(text), 'A1 the hint tells what 階級 is (' + short(text, 80) + ')');
    check(await noOverflow(page), 'A1 no horizontal overflow (' + (await widest(page)).join('/') + '; ' + (await wideOnes(page)).join(' | ') + ')');
    const marks = await nextMarks(page);
    check(marks.length === 1 && !/区分|階級/.test(marks[0]), 'A1 exactly ONE 👉 次はここ, still at the first empty box (' + marks.join(' | ') + ')');
    const small = await page.locator('#f-division').evaluate((el) => {
      const box = el.closest('[id="f-division-wrap"], .relative') || el.parentElement.parentElement; const out = [];
      const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const px = parseFloat(getComputedStyle(n.parentElement).fontSize); if (px < 17) out.push(px + 'px:' + n.textContent.trim().slice(0, 18)); }
      return out;
    });
    check(small.length === 0, 'A1 all text in the 区分 box is >= 17px (' + short(small.join(' | '), 200) + ')');
    await ctx.close();
  }
  /* A2 two steps: the 階級 choices follow the 区分; a 区分 without 階級 says so; changing the 区分 empties the 階級 */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashW(DEF));
    await DIV(page).selectOption('中学生男子');
    await WCL(page).waitFor({ timeout: 4000 });
    const want = divOf('中学生男子').classes;
    const texts = await optionTexts(WCL(page)), values = await optionValues(WCL(page));
    check(texts[0] === '選んでください' && texts.length === 1 + want.length, 'A2 中学生男子: 選んでください + ' + want.length + ' weight classes (' + texts.length + ')');
    check(want.every((c, i) => texts[i + 1] === weightClassLabel(c)), 'A2 each choice shows the symbol AND the words (' + short(texts.slice(1, 4).join(' | '), 120) + ')');
    check(texts[1] === '-37kg（37kg以下）', 'A2 the first choice reads -37kg（37kg以下）');
    check(want.every((c, i) => values[i + 1] === c) && !values.some((v) => /^[-+=@]/.test(v)), 'A2 the saved value is the plain form (37kg以下), never starting with - or +');
    const bb = await WCL(page).boundingBox();
    check(bb && bb.height >= 48, 'A2 the 階級 select is a large target (' + (bb ? Math.round(bb.height) : '-') + ')');
    check((await page.locator('#f-weightClass-none').count()) === 0, 'A2 no "no 階級" note for a division that has 階級');
    check((await nextMarks(page)).length === 1, 'A2 still exactly ONE 👉 次はここ (' + (await nextMarks(page)).join(' | ') + ')');
    await WCL(page).selectOption('40kg以下');
    check((await WCL(page).inputValue()) === '40kg以下', 'A2 a class can be chosen');
    // a different division with other classes: the old choice is emptied, the list changes
    await DIV(page).selectOption('高校生・一般男子');
    check((await WCL(page).inputValue()) === '', 'A2 changing the 区分 empties the 階級 (was 40kg以下)');
    const t2 = await optionTexts(WCL(page));
    check(t2.length === 1 + divOf('高校生・一般男子').classes.length && t2.includes('無差別（体重の制限なし）') && t2.includes('-85kg（85kg以下）'), 'A2 the list now has the high-school/general men classes incl. 無差別');
    await DIV(page).selectOption('花道・女子（40歳以上）');
    const t3 = await optionTexts(WCL(page));
    check(t3.includes('+60kg（60kgをこえる）'), 'A2 花道 women have +60kg（60kgをこえる）');
    // 小学生以下: no 階級 at all
    await DIV(page).selectOption('小学生以下');
    check((await WCL(page).count()) === 0, 'A2 小学生以下 has no 階級 select');
    const none = page.locator('#f-weightClass-none');
    check((await none.count()) === 1 && /この出場区分には階級がありません/.test(await none.innerText()) && /小学生の試合は、申し込みの体重を目安に、近い学年（1〜2年の差）・近い体重（2〜3kgの差）の選手どうしで組みます。目安なので、ちがうこともあります。/.test(await none.innerText()) && (await none.innerText()).includes(NO_CLASS_NOTE_APPLY), 'A2 小学生以下 shows the grey note (' + short(await none.allInnerTexts(), 100) + ')');
    check(await noOverflow(page), 'A2 no overflow in every state');
    // back to a division with classes: the note is gone, the list is empty
    await DIV(page).selectOption('中学生女子');
    check((await page.locator('#f-weightClass-none').count()) === 0 && (await WCL(page).inputValue()) === '', 'A2 back to a division with classes: no note, nothing chosen');
    // choosing the empty option goes back to the start
    await DIV(page).selectOption('');
    check((await WCL(page).count()) === 0 && (await page.locator('#f-weightClass-none').count()) === 0, 'A2 choosing 選んでください again hides everything below');
    await ctx.close();
  }
  /* A3 required: with everything else filled, the ONE yellow marker points at 区分; the button does not go on; red message next to the box */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashW(DEF));
    await fillAllW(page);
    await settle(200);
    const nm = await nextMarks(page);
    check(nm.length === 1 && /出場区分を選ぶ/.test(nm[0] ?? ''), 'A3 with everything else filled, the ONE marker says 出場区分を選ぶ (' + nm.join(' | ') + ')');
    await reviewBtn(page).click();
    await settle(400);
    check((await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 0, 'A3 no review screen without a 区分');
    const err = page.locator('#f-division-err');
    check((await err.count()) === 1 && /出場区分を選んでください/.test(await err.innerText()), 'A3 red message at the 出場区分 says 出場区分を選んでください (' + short(await err.allInnerTexts(), 80) + ')');
    check(/[✕✖]/.test(await err.innerText()) || (await err.locator('[aria-hidden]').count()) > 0, 'A3 the red message carries a mark, not only a colour');
    check((await nextMarks(page)).length === 1, 'A3 after the failed press there is still ONE marker (' + (await nextMarks(page)).join(' | ') + ')');
    check((await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'f-division', 'A3 the cursor moves to the 区分 box (' + (await page.evaluate(() => document.activeElement && document.activeElement.id)) + ')');
    check(await noOverflow(page), 'A3 no overflow with the error');
    // choosing clears the error, the marker moves on to 階級
    await DIV(page).selectOption('中学生男子');
    await settle(150);
    check((await page.locator('#f-division-err').count()) === 0, 'A3 choosing a 区分 clears its red message');
    const nm2 = await nextMarks(page);
    check(nm2.length === 1 && /階級を選ぶ/.test(nm2[0] ?? ''), 'A3 now the ONE marker says 階級を選ぶ (' + nm2.join(' | ') + ')');
    await reviewBtn(page).click();
    await settle(400);
    check((await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 0, 'A3 no review screen without a 階級');
    const err2 = page.locator('#f-weightClass-err');
    check((await err2.count()) === 1 && /階級を選んでください/.test(await err2.innerText()), 'A3 red message at the 階級 says 階級を選んでください (' + short(await err2.allInnerTexts(), 80) + ')');
    check(ctx.__posts.length === 0, 'A3 nothing was sent');
    await WCL(page).selectOption('37kg以下');
    await settle(150);
    check((await page.locator('#f-weightClass-err').count()) === 0, 'A3 choosing a 階級 clears its red message');
    await ctx.close();
  }
  /* A4 send: review shows 区分 and 階級; the POST carries the plain values */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashW(DEF));
    await fillAllW(page);
    await DIV(page).selectOption('中学生男子');
    await WCL(page).selectOption('40kg以下');
    await settle(150);
    check((await nextMarks(page)).length === 1 && !/区分|階級/.test((await nextMarks(page))[0] ?? ''), 'A4 all chosen: the ONE marker has moved on (' + (await nextMarks(page)).join(' | ') + ')');
    await reviewBtn(page).click();
    await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor({ timeout: 8000 });
    const review = await bodyText(page);
    check(/出場区分\s*中学生男子/.test(review) && /階級\s*-40kg（40kg以下）/.test(review), 'A4 the review lists 出場区分 中学生男子 and 階級 -40kg（40kg以下） (' + short(review.match(/区分[\s\S]{0,60}/)?.[0] ?? '', 100) + ')');
    await sendBtn(page).click();
    await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
    const f = posted(ctx);
    check(f && f.get('division') === '中学生男子' && f.get('weightClass') === '40kg以下', 'A4 the POST carries division=中学生男子 weightClass=40kg以下 (' + (f ? f.get('division') + '/' + f.get('weightClass') : '-') + ')');
    check(f && !f.has('fighterClass') || f.get('fighterClass') === '', 'A4 no A/B class is sent when the class feature is off');
    await ctx.close();
  }
  /* A5 小学生以下: sent with no 階級, the review says there is none */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashW(DEF));
    await fillAllW(page);
    await DIV(page).selectOption('小学生以下');
    await settle(150);
    check((await nextMarks(page)).length === 1 && !/区分|階級/.test((await nextMarks(page))[0] ?? ''), 'A5 小学生以下 needs no 階級: the marker has moved on (' + (await nextMarks(page)).join(' | ') + ')');
    await reviewBtn(page).click();
    await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor({ timeout: 8000 });
    check(/階級\s*なし（小学生の試合は、申し込みの体重を目安に、近い学年（1〜2年の差）・近い体重（2〜3kgの差）の選手どうしで組みます。目安なので、ちがうこともあります。）/.test(await bodyText(page)) && (await bodyText(page)).includes(noClassReviewValue()), 'A5 the review says 階級 なし（小学生の試合は、…目安なので、ちがうこともあります。）');
    await sendBtn(page).click();
    await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
    const f = posted(ctx);
    check(f && f.get('division') === '小学生以下' && (f.get('weightClass') ?? '') === '', 'A5 the POST carries division=小学生以下 and an empty weightClass (' + (f ? f.get('division') + '/' + f.get('weightClass') : '-') + ')');
    await ctx.close();
  }
  /* A6 weights OFF (a link made without them): the form is exactly the old one and posts no new fields */
  {
    const ctx = await newCtx(vp.mobile);
    const link = hashW(null);
    check(!/wc=|wd=|logo=/.test(link), 'A6 a link made without weights has no wc / wd / logo');
    const page = await openApply(ctx, link);
    check((await DIV(page).count()) === 0 && (await WCL(page).count()) === 0, 'A6 no 区分 / 階級 box');
    const body = await bodyText(page);
    check(!/区分|階級/.test(body), 'A6 the words 区分 / 階級 are not on the page');
    await fillAllW(page);
    await send(page, ctx);
    const f = posted(ctx);
    check(f && !f.has('division') && !f.has('weightClass'), 'A6 the POST has no division / weightClass fields (' + (f ? [...f.keys()].filter((k) => /division|weight/.test(k)).join(',') : '-') + ')');
    check((await page.locator('img[alt*="C.K.A"]').count()) === 0, 'A6 no logo');
    await ctx.close();
  }
  /* A7 weights + A/B classes together: both boxes, region order 区分 → 階級 → クラス, one marker, both posted */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashW(DEF, { classes: DEFAULT_CLASS_SETTINGS }));
    check((await DIV(page).count()) === 1 && (await CLS(page).count()) === 1, 'A7 both the 区分 box and the クラス box are on the form');
    const order = await page.evaluate(() => { const a = document.getElementById('f-division'), b = document.getElementById('f-fighterClass'); return !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); });
    check(order, 'A7 the 区分 box comes before the クラス box');
    await fillAllW(page);
    await DIV(page).selectOption('高校生・一般男子');
    await WCL(page).selectOption('無差別');
    await settle(150);
    const nm = await nextMarks(page);
    check(nm.length === 1 && /クラスを選ぶ/.test(nm[0] ?? ''), 'A7 with 区分 and 階級 chosen, the ONE marker points at クラス (' + nm.join(' | ') + ')');
    await classPick(page, 'lower');
    await send(page, ctx);
    const f = posted(ctx);
    check(f && f.get('division') === '高校生・一般男子' && f.get('weightClass') === '無差別' && f.get('fighterClass') === 'lower', 'A7 the POST carries all three (' + (f ? [f.get('division'), f.get('weightClass'), f.get('fighterClass')].join('/') : '-') + ')');
    await ctx.close();
  }
  /* A8 a changed table (wd): custom divisions, +60, 無差別, a free-text name; short link; markup stays text */
  {
    const ctx = await newCtx(vp.mobile);
    await ctx.addInitScript(() => { window.__xss = 0; });
    const custom = { enabled: true, divisions: [{ name: 'ミニ', classes: [] }, { name: '男子', classes: ['60kg以下', '60kgをこえる', '無差別', 'ライト級'] }, { name: '<svg onload=__xss=9>', classes: ['40kg以下'] }] };
    const link = hashW(custom);
    check(/wd=/.test(link), 'A8 a changed table travels in wd');
    check(link.length < 1500, 'A8 the link stays short (' + link.length + ')');
    const page = await openApply(ctx, link);
    const names = (await optionTexts(DIV(page))).slice(1);
    check(names[0] === 'ミニ' && names[1] === '男子' && names[2] === '<svg onload=__xss=9>', 'A8 the custom divisions are listed, the hostile name as plain text');
    check((await page.evaluate(() => window.__xss)) === 0 && (await page.locator('main svg[onload]').count()) === 0, 'A8 markup in a division name never runs');
    await DIV(page).selectOption('男子');
    const t = await optionTexts(WCL(page));
    check(t.join('|') === '選んでください|-60kg（60kg以下）|+60kg（60kgをこえる）|無差別（体重の制限なし）|ライト級', 'A8 custom classes: ' + short(t.join('|'), 120));
    check(dialogs.filter((x) => x.scenario === cur).length === 0, 'A8 no dialog');
    await ctx.close();
  }
  /* A9 a link cut in the middle of the table is refused, not half-used */
  {
    const ctx = await newCtx(vp.mobile);
    const custom = { enabled: true, divisions: [{ name: '男子', classes: ['60kg以下'] }] };
    const link = hashW(custom);
    const cut = link.slice(0, link.indexOf('wd=') + 14);
    const page = await ctx.newPage();
    await page.goto(base + '/apply/' + cut);
    await settle(600);
    const t = await bodyText(page);
    check(/このページでは申し込めません/.test(t) && /途中で切れています/.test(t), 'A9 a link cut inside the table says it cannot be used (' + short(t, 80) + ')');
    check((await reviewBtn(page).isDisabled().catch(() => true)) || (await reviewBtn(page).count()) === 0, 'A9 the review button cannot be used on a cut link');
    check(ctx.__posts.length === 0, 'A9 nothing is sent');
    await ctx.close();
  }
  /* A10 the logo: shown only when asked, never leaks layout at this width, has a name for screen readers */
  {
    const ctx = await newCtx(vp.mobile);
    const longTitle = '第12回 千葉県少年少女キックボクシング選手権大会 兼 全国大会千葉県予選会（架空）';
    const page = await openApply(ctx, publicEntryHash({ ...baseCfg, title: longTitle, weights: DEF, logo: true }));
    const logo = page.locator('img[alt*="C.K.A"]');
    check((await logo.count()) === 1, 'A10 the logo is on the page when the link asks for it');
    const lb = await logo.boundingBox();
    check(lb && lb.width >= 56 && lb.width <= 72 && Math.abs(lb.width - lb.height) < 2, 'A10 the logo is a round 56-72px mark (' + (lb ? Math.round(lb.width) + 'x' + Math.round(lb.height) : '-') + ')');
    check((await logo.getAttribute('alt')).includes('千葉県キックボクシング協会'), 'A10 the logo has a spoken name');
    check((await logo.getAttribute('src')).startsWith('data:image/'), 'A10 the logo is embedded (no outside file)');
    const h1 = await page.locator('h1').innerText();
    check(h1.includes('第12回'), 'A10 the title is still the heading (' + short(h1, 40) + ')');
    check(await noOverflow(page), 'A10 no overflow with the logo and a long title (' + (await widest(page)).join('/') + '; ' + (await wideOnes(page)).join(' | ') + ')');
    const loaded = await logo.evaluate((img) => img.complete && img.naturalWidth > 0);
    check(loaded, 'A10 the logo image really decodes');
    // without the logo flag
    const page2 = await openApply(ctx, publicEntryHash({ ...baseCfg, title: longTitle, weights: DEF }));
    check((await page2.locator('img[alt*="C.K.A"]').count()) === 0, 'A10 no logo when the link does not ask for it');
    await ctx.close();
  }
});

/* ───────────────────────── live screens ───────────────────────── */
const ENTRY_BASE = { music: false, grade: 'optional', age: 'optional', comment: 'optional' };
const LIVE_CFG = (extra = {}) => ({ ...ENTRY_BASE, weights: DEF, ...extra });
const FW = (id, over = {}) => F(id, { comment: '意気込みです', ...over });
const liveData = (id, cfg, bouts, fighters) => tournament(id, { entryConfig: cfg, fighters, bouts });
const LIVE_FIGHTERS = [
  FW('a', { name: '甲', division: '中学生男子', weightClass: '37kg以下' }), FW('b', { name: '乙', division: '中学生男子', weightClass: '37kg以下' }),
  FW('c', { name: '丙', division: '中学生男子', weightClass: '40kg以下' }), FW('d', { name: '丁', division: '中学生女子', weightClass: '37kg以下' }),
  FW('e', { name: '戊', division: '小学生以下' }), FW('f', { name: '己', division: '小学生以下' }), FW('g', { name: '庚' }),
];
const LIVE_BOUTS = [bout(0, 'a', 'b'), bout(1, 'a', 'c'), bout(2, 'a', 'd'), bout(3, 'e', 'f'), bout(4, 'a', 'g')];

/** B. The match-day screen: tags, the red caution, the logo. */
scenario('B', 'live: division/weight tags, red caution when they differ, logo', async (vp) => {
  const tag = vp.mobile ? 'm' : 'd';
  /* B1 single view: same 区分・階級 → tags, no caution */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'wc-b1-' + tag;
    await seed(ctx, liveData(id, LIVE_CFG({ logo: true }), LIVE_BOUTS, LIVE_FIGHTERS));
    const page = await openLive(ctx, id, false);
    const red = page.locator('[data-weight-tag="red"]'), blue = page.locator('[data-weight-tag="blue"]');
    check((await red.count()) === 1 && (await blue.count()) === 1, 'B1 each corner shows a 区分・階級 tag');
    check(/中学生男子/.test(await red.innerText()) && /37kg以下/.test(await red.innerText()), 'B1 the red tag reads 中学生男子 … 37kg以下 (' + short(await red.innerText(), 60) + ')');
    check((await page.locator('#live-weight-warning').count()) === 0, 'B1 no caution when both are the same 区分・階級');
    const logo = page.locator('img[alt*="C.K.A"]');
    check((await logo.count()) === 1, 'B1 the logo is in the header when the event asks for it');
    const lb = await logo.boundingBox();
    check(lb && lb.width >= 40 && lb.width <= 56 && Math.abs(lb.width - lb.height) < 2, 'B1 the header logo is a small round 40-56px mark (' + (lb ? Math.round(lb.width) : '-') + ')');
    check(await noOverflow(page), 'B1 no overflow (' + (await widest(page)).join('/') + '; ' + (await wideOnes(page)).join(' | ') + ')');
    await ctx.close();
  }
  /* B2 the caution: other 階級, other 区分, one side empty, no 階級 divisions */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'wc-b2-' + tag;
    await seed(ctx, liveData(id, LIVE_CFG(), LIVE_BOUTS, LIVE_FIGHTERS));
    const cases = [[1, /階級がちがいます（赤：37kg以下／青：40kg以下）/, '階級 differs'], [2, /区分がちがいます（赤：中学生男子／青：中学生女子）/, '区分 differs'], [3, null, 'two 小学生以下: nothing to say'], [4, null, 'one side without any 区分: nothing to say']];
    const ctx2 = await newCtx(vp.mobile);
    await seed(ctx2, liveData(id, LIVE_CFG(), LIVE_BOUTS, LIVE_FIGHTERS));
    for (const [i, re, label] of cases) {
      const page = await openLive(ctx2, id, false).catch(() => null);
      if (!page) { check(false, 'B2 live opened for ' + label); continue; }
      // jump to bout i by the keyboard / buttons: re-seed with currentBout instead (the screen does not keep its own place)
      await page.close();
      await seed(ctx2, { ...liveData(id, LIVE_CFG(), LIVE_BOUTS, LIVE_FIGHTERS), currentBout: i });
      const p = await openLive(ctx2, id, false);
      const w = p.locator('#live-weight-warning');
      if (re) {
        check((await w.count()) === 1 && re.test(await w.innerText()), 'B2 ' + label + ': the red caution says so (' + short(await w.allInnerTexts(), 90) + ')');
        check(/⚠/.test(await w.innerText()) || (await w.locator('[aria-hidden]').count()) > 0, 'B2 ' + label + ': the caution has a mark, not only a colour');
        check((await w.getAttribute('role')) === 'status', 'B2 ' + label + ': it is a status message (does not steal focus)');
        const st = await styleOf(w);
        check(isReddish(st.border) || isReddish(st.fg), 'B2 ' + label + ': it is red-family (fg ' + st.fg.join(',') + ' border ' + st.border.join(',') + ')');
        check(/試合は、このまま進められます|このまま/.test(await w.innerText()), 'B2 ' + label + ': it says the bout can go on (never blocks)');
      } else check((await w.count()) === 0, 'B2 ' + label + ': no caution (' + (await w.count()) + ')');
      // the next-bout button still works whatever the caution says
      check(await noOverflow(p), 'B2 ' + label + ': no overflow (' + (await widest(p)).join('/') + '; ' + (await wideOnes(p)).join(' | ') + ')');
      await p.close();
    }
    await ctx2.close();
  }
  /* B3 caution + A/B class caution + same-person caution together still fit one screen (no page scroll needed for the buttons) */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'wc-b3-' + tag;
    const fighters = [
      FW('a', { name: '同じ名前', gym: '同じジム', division: '中学生男子', weightClass: '37kg以下', fighterClass: 'Aクラス' }),
      FW('b', { name: '同じ名前', gym: '同じジム', division: '中学生女子', weightClass: '40kg以下', fighterClass: 'Bクラス' }),
    ];
    await seed(ctx, liveData(id, LIVE_CFG({ classes: DEFAULT_CLASS_SETTINGS }), [bout(0, 'a', 'b'), bout(1, 'a', 'b')], fighters));
    const page = await openLive(ctx, id, false);
    check((await page.locator('#live-weight-warning').count()) === 1, 'B3 the 区分 caution shows');
    check((await page.locator('.live-mix').count()) >= 2, 'B3 the other cautions show too (' + (await page.locator('.live-mix').count()) + ')');
    check(await noOverflow(page), 'B3 no horizontal overflow with every caution (' + (await widest(page)).join('/') + ')');
    const next = page.getByRole('button', { name: /次の試合/ });
    const nb = await next.boundingBox();
    // 320px の小さな画面では、ページは下へ流れる（下の帯は、ふつうの並びになる。test-polish-live.mjs が見ている）。それ以上の幅では、ボタンが画面の中にある
    if (curW >= 390) check(!!nb && nb.y >= 0 && nb.y + nb.height <= (await page.evaluate(() => window.innerHeight)), 'B3 the 次の試合 button stays inside the screen with every caution (y=' + (nb ? Math.round(nb.y) : '-') + ', h=' + (nb ? Math.round(nb.height) : '-') + ')');
    else check(!!nb && nb.height >= 48, 'B3 at 320px the 次の試合 button is still a large target (h=' + (nb ? Math.round(nb.height) : '-') + ')');
    await ctx.close();
  }
  /* B4 list view: each row shows the tags; the caution is only on the screen, not on paper */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'wc-b4-' + tag;
    await seed(ctx, liveData(id, LIVE_CFG(), LIVE_BOUTS, LIVE_FIGHTERS));
    const page = await openLive(ctx, id, true);
    const tags = await page.locator('[data-weight-tag]').count();
    check(tags >= 2 * 4, 'B4 the list shows a tag for each corner of the filled bouts (' + tags + ')');
    check((await page.locator('#live-list-weight-warning-1').count()) === 1 && /階級がちがいます/.test(await page.locator('#live-list-weight-warning-1').innerText()), 'B4 row 2 has the 階級 caution');
    check((await page.locator('#live-list-weight-warning-2').count()) === 1 && /区分がちがいます/.test(await page.locator('#live-list-weight-warning-2').innerText()), 'B4 row 3 has the 区分 caution');
    check((await page.locator('#live-list-weight-warning-0').count()) === 0 && (await page.locator('#live-list-weight-warning-3').count()) === 0, 'B4 rows with the same 区分・階級 have no caution');
    await page.emulateMedia({ media: 'print' });
    const shown = await page.locator('#live-list-weight-warning-1').evaluate((el) => getComputedStyle(el).display !== 'none');
    check(!shown, 'B4 the caution is not printed');
    check((await page.locator('[data-weight-tag]').first().evaluate((el) => getComputedStyle(el).display !== 'none')), 'B4 the tags are printed');
    await page.emulateMedia({ media: 'screen' });
    check(await noOverflow(page), 'B4 no overflow (' + (await widest(page)).join('/') + '; ' + (await wideOnes(page)).join(' | ') + ')');
    await ctx.close();
  }
  /* B5 an event without weights or logo looks exactly like before: no tags, no caution, no logo */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'wc-b5-' + tag;
    const plain = LIVE_FIGHTERS.map((f) => { const { division, weightClass, ...rest } = f; return rest; });
    await seed(ctx, liveData(id, ENTRY_BASE, LIVE_BOUTS, plain));
    const page = await openLive(ctx, id, false);
    check((await page.locator('[data-weight-tag]').count()) === 0 && (await page.locator('#live-weight-warning').count()) === 0, 'B5 no tag and no caution');
    check((await page.locator('img[alt*="C.K.A"]').count()) === 0, 'B5 no logo');
    await ctx.close();
  }
  /* B6 an event with weights set but the logo off: tags yes, logo no; and hostile text stays text */
  {
    const ctx = await newCtx(vp.mobile);
    await ctx.addInitScript(() => { window.__xss = 0; });
    const id = 'wc-b6-' + tag;
    const fighters = [FW('a', { name: '甲', division: '<img src=x onerror="window.__xss=1">', weightClass: '=1+1' }), FW('b', { name: '乙', division: 'あ'.repeat(40), weightClass: 'い'.repeat(40) })];
    await seed(ctx, liveData(id, LIVE_CFG(), [bout(0, 'a', 'b')], fighters));
    const page = await openLive(ctx, id, false);
    check((await page.evaluate(() => window.__xss)) === 0 && (await page.locator('main img[src="x"]').count()) === 0, 'B6 markup in a 区分 stays text');
    check((await page.locator('img[alt*="C.K.A"]').count()) === 0, 'B6 no logo when the event does not ask for it');
    check(await noOverflow(page), 'B6 no overflow with hostile / very long values (' + (await widest(page)).join('/') + '; ' + (await wideOnes(page)).join(' | ') + ')');
    await ctx.close();
  }
});

/* ───────────────────────── prep screen ───────────────────────── */
const waitState2 = (p) => p.waitForFunction(() => document.querySelector('#save-state')?.innerText.includes('保存済み'), null, { timeout: 8000 }).catch(() => {});
async function openFoldsOf(p, sel) {
  for (let i = 0; i < 6 && !(await p.locator(sel).isVisible().catch(() => false)); i++) {
    const closed = await p.evaluate((s) => { const el = document.querySelector(s); let hit = null; for (let n = el; n; n = n.parentElement) if (n.tagName === 'DETAILS' && !n.open) hit = n; if (!hit) return false; hit.querySelector(':scope > summary').setAttribute('data-open-me', '1'); return true; }, sel);
    if (!closed) break;
    await p.locator('[data-open-me="1"]').first().click();
    await p.evaluate(() => document.querySelectorAll('[data-open-me]').forEach((e) => e.removeAttribute('data-open-me')));
  }
}
async function openEditW(p, name) {
  await p.getByRole('button', { name: '直す ' + name, exact: true }).click();
  await p.locator('select[id^="edit-"][id$="-division"]').first().waitFor();
}
const HEAD_W = CSV_HEAD + ',クラス,区分,階級';
const rowW = (id, n, div, wcl) => [id, '架空' + n + 'ジム', '架空' + n + '選手', '中1', '13', '155', '40', '初試合', 'がんばる', '', '', quote(div), quote(wcl)].join(',');

/** C. The prep screen: add / edit forms, chips, bout card caution, import, save. */
scenario('C', 'prep: forms, chips, the red caution on a bout, import, save', async (vp) => {
  const tag = vp.mobile ? 'm' : 'd';
  const wfighters = [
    F('w1', { name: '架空甲', gym: 'ジムあ', weight: '37', division: '中学生男子', weightClass: '37kg以下' }),
    F('w2', { name: '架空乙', gym: 'ジムい', weight: '37', division: '中学生男子', weightClass: '37kg以下' }),
    F('w3', { name: '架空丙', gym: 'ジムう', weight: '40', division: '中学生男子', weightClass: '40kg以下' }),
    F('w4', { name: '架空丁', gym: 'ジムえ', weight: '37', division: '中学生女子', weightClass: '37kg以下' }),
    F('w5', { name: '架空戊', gym: 'ジムお', weight: '22', division: '小学生以下' }),
    F('w6', { name: '架空己', gym: 'ジムか', weight: '23' }),
  ];
  /* C1 the add form: two selects, the classes follow the division, 小学生以下 has none, saved, えらばない saves nothing */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'wc-c1-' + tag;
    await seed(ctx, tournament(id, { entryConfig: { ...ENTRY_BASE, weights: DEF }, fighters: wfighters }));
    const page = await openPrivate(ctx, id);
    await openFoldsOf(page, '#manual-name');
    const wbox = page.locator('#manual-division');
    check((await wbox.count()) === 1 && (await page.locator('[data-tos-weights]').count()) >= 1, 'C1 the add form has a 区分 select');
    const opts = await optionTexts(wbox);
    check(opts[0] === 'えらばない' && DEF.divisions.every((d, i) => opts[i + 1] === d.name), 'C1 えらばない + the 7 divisions (' + short(opts.join('|'), 100) + ')');
    check((await page.locator('#manual-weightClass').count()) === 0, 'C1 no 階級 select until a division is chosen');
    check((await wbox.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))) >= 17, 'C1 the select text is >= 17px');
    const bb = await wbox.boundingBox();
    check(bb && bb.height >= 48, 'C1 the select is a large target (' + (bb ? Math.round(bb.height) : '-') + ')');
    await wbox.selectOption('中学生男子');
    await page.locator('#manual-weightClass').waitFor({ timeout: 3000 });
    const t = await optionTexts(page.locator('#manual-weightClass'));
    check(t[0] === 'えらばない' && t[1] === '-37kg（37kg以下）' && t.length === 1 + divOf('中学生男子').classes.length, 'C1 the classes read with symbol and words (' + short(t.slice(0, 3).join('|'), 80) + ')');
    for (const [f, v] of [['name', '架空追加選手'], ['gym', '架空追加ジム'], ['height', '150'], ['weight', '43'], ['record', '初試合']]) await page.locator('#manual-' + f).fill(v);
    await page.locator('#manual-weightClass').selectOption('43kg以下');
    // changing the division empties the class
    await wbox.selectOption('中学生女子');
    check((await page.locator('#manual-weightClass').inputValue()) === '', 'C1 changing the division empties the 階級');
    await wbox.selectOption('小学生以下');
    check((await page.locator('#manual-weightClass').count()) === 0, 'C1 小学生以下 shows no 階級 select');
    check(/この区分には階級がありません/.test(await page.locator('[data-tos-weights]').first().innerText()) && (await page.locator('[data-tos-weights]').first().innerText()).includes(NO_CLASS_NOTE), 'C1 小学生以下 says it has no 階級 (the owner sentence)');
    await wbox.selectOption('中学生男子');
    await page.locator('#manual-weightClass').selectOption('43kg以下');
    await page.getByRole('button', { name: 'この選手を追加', exact: true }).click();
    await settle(300);
    const card = page.locator('article[id^="fighter-"]', { hasText: '架空追加選手' });
    check((await card.count()) === 1 && /区分・階級：中学生男子・43kg以下/.test(await card.innerText()), 'C1 the added fighter shows 区分・階級：中学生男子・43kg以下');
    // one with えらばない
    for (const [f, v] of [['name', '架空追加無し'], ['gym', '架空追加ジム2'], ['height', '150'], ['weight', '43'], ['record', '初試合']]) await page.locator('#manual-' + f).fill(v);
    await wbox.selectOption('');
    await page.getByRole('button', { name: 'この選手を追加', exact: true }).click();
    await settle(300);
    check(await noOverflow(page), 'C1 no overflow (' + (await widest(page)).join('/') + '; ' + (await wideOnes(page)).join(' | ') + ')');
    await pressSave(page);
    await waitState2(page);
    const saved = await idbGet(page, id);
    const sa = saved && saved.fighters.find((f) => f.name === '架空追加選手'), sn = saved && saved.fighters.find((f) => f.name === '架空追加無し');
    check(sa && sa.division === '中学生男子' && sa.weightClass === '43kg以下', 'C1 the saved record has division / weightClass in the plain form');
    check(sn && !('division' in sn) && !('weightClass' in sn), 'C1 えらばない saves no division / weightClass key');
    check(saved && saved.entryConfig && saved.entryConfig.weights && saved.entryConfig.weights.divisions.length === 7, 'C1 the saved event keeps the weight settings');
    await ctx.close();
  }
  /* C2 the edit form starts on the saved choice; an unknown value is kept; saving a change writes it and says what changed */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'wc-c2-' + tag;
    const odd = [...wfighters, F('w7', { name: '架空変則', gym: 'ジムき', weight: '50', division: '宇宙人区分', weightClass: '99kg以下' })];
    await seed(ctx, tournament(id, { entryConfig: { ...ENTRY_BASE, weights: DEF }, fighters: odd }));
    const page = await openPrivate(ctx, id);
    await openEditW(page, '架空甲');
    const dsel = page.locator('select[id^="edit-"][id$="-division"]'), wsel = page.locator('select[id^="edit-"][id$="-weightClass"]');
    check((await dsel.inputValue()) === '中学生男子' && (await wsel.inputValue()) === '37kg以下', 'C2 the edit form starts on the saved 区分 and 階級');
    await wsel.selectOption('40kg以下');
    await page.getByRole('button', { name: 'この内容で直す', exact: true }).click();
    await settle(300);
    const t = await bodyText(page);
    check(/階級[^\n]*37kg以下[^\n]*40kg以下/.test(t), 'C2 the note says what changed: 階級 37kg以下 → 40kg以下 (' + short((t.match(/階級[^\n]{0,60}/g) || []).join(' || '), 120) + ')');
    check(/区分・階級：中学生男子・40kg以下/.test(await page.locator('article[id^="fighter-"]', { hasText: '架空甲' }).innerText()), 'C2 the card now shows 40kg以下');
    // the unknown one
    await openEditW(page, '架空変則');
    const d2 = page.locator('select[id^="edit-"][id$="-division"]');
    const o2 = await optionTexts(d2);
    check((await d2.inputValue()) === '宇宙人区分' && o2.includes('宇宙人区分'), 'C2 an unknown 区分 is kept visible in the edit box, not wiped (' + short(o2.join('|'), 120) + ')');
    check(/設定にある区分ではありません/.test(await page.locator('[data-tos-weights]').last().innerText()), 'C2 a gentle yellow sentence says it is not in the list');
    await page.getByRole('button', { name: 'やめる', exact: true }).click().catch(() => {});
    // the roster note
    check((await page.locator('#weight-trouble').count()) === 1, 'C2 the roster shows ONE yellow note for fighters without / outside the list (' + (await page.locator('#weight-trouble').count()) + ')');
    check(/架空己|架空変則/.test(await page.locator('#weight-trouble').innerText()), 'C2 the note names the people (' + short(await page.locator('#weight-trouble').innerText(), 100) + ')');
    await ctx.close();
  }
  /* C3 bouts: a red caution when 区分 or 階級 differ; never blocks saving; counted in the summary */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'wc-c3-' + tag;
    await seed(ctx, tournament(id, { entryConfig: { ...ENTRY_BASE, weights: DEF }, fighters: wfighters }));
    const page = await openPrivate(ctx, id);
    const n0 = await addBout(page, 'w1', 'w2');
    check((await page.locator('#bout-' + n0).locator('[data-weight-warning]').count()) === 0, 'C3 same 区分・階級: no caution');
    check((await page.locator('#bout-' + n0).locator('[data-weight-tag="red"]').count()) === 1 && /中学生男子・37kg以下/.test(await page.locator('#bout-' + n0).locator('[data-weight-tag="red"]').innerText()), 'C3 each side shows its 区分・階級');
    const n1 = await addBout(page, 'w1', 'w3');
    const w1 = page.locator('#bout-' + n1).locator('[data-weight-warning]');
    check((await w1.count()) === 1 && /階級がちがいます（赤：37kg以下／青：40kg以下）/.test(await w1.innerText()), 'C3 other 階級: the red caution says so (' + short(await w1.allInnerTexts(), 100) + ')');
    const st = await styleOf(w1.locator('[role=status]').first());
    check(isReddish(st.border) || isReddish(st.fg), 'C3 it is red-family (fg ' + st.fg.join(',') + ')');
    check((await w1.locator('[role=status]').count()) === 1 && /⚠/.test(await w1.innerText()), 'C3 it is a status message with a ⚠ mark');
    check(/このまま戦ってもかまいません/.test(await w1.innerText()), 'C3 it says the bout may stay as it is');
    const n2 = await addBout(page, 'w1', 'w4');
    check(/区分がちがいます（赤：中学生男子／青：中学生女子）/.test(await page.locator('#bout-' + n2).locator('[data-weight-warning]').innerText()), 'C3 other 区分: the red caution says so');
    const n3 = await addBout(page, 'w5', 'w6');
    check((await page.locator('#bout-' + n3).locator('[data-weight-warning]').count()) === 0, 'C3 one side without any 区分: no caution');
    check(/⚠[^\n]*区分・階級がちがいます/.test(await bodyText(page)), 'C3 the bout summary line carries the caution words too');
    // choosing again fixes it
    await page.locator('#bout-' + n1 + '-blue').selectOption('w2');
    check((await page.locator('#bout-' + n1).locator('[data-weight-warning]').count()) === 0, 'C3 choosing the same 階級 again removes the caution');
    await page.locator('#bout-' + n1 + '-blue').selectOption('w3');
    check(await noOverflow(page), 'C3 no overflow with cautions (' + (await widest(page)).join('/') + '; ' + (await wideOnes(page)).join(' | ') + ')');
    // never blocks
    await pressSave(page);
    await waitState2(page);
    const saved = await idbGet(page, id);
    check(saved && saved.bouts.length === 4, 'C3 it saves all 4 bouts, cautions or not (' + (saved ? saved.bouts.length : '-') + ')');
    await ctx.close();
  }
  /* C4 the suggested pairing prefers the same 区分・階級 */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'wc-c4-' + tag;
    const four = [
      F('s1', { name: '架空一', gym: 'A', weight: '40', division: '中学生男子', weightClass: '40kg以下' }), F('s2', { name: '架空二', gym: 'B', weight: '41', division: '中学生女子', weightClass: '43kg以下' }),
      F('s3', { name: '架空三', gym: 'C', weight: '42', division: '中学生男子', weightClass: '40kg以下' }), F('s4', { name: '架空四', gym: 'D', weight: '43', division: '中学生女子', weightClass: '43kg以下' }),
    ];
    await seed(ctx, tournament(id, { entryConfig: { ...ENTRY_BASE, weights: DEF }, fighters: four }));
    const page = await openPrivate(ctx, id);
    await page.getByRole('button', { name: 'おすすめの組み合わせを自動で作る' }).click();
    await settle(400);
    const pairs = await page.evaluate(() => [...document.querySelectorAll('article[id^="bout-"]')].map((a) => [...a.querySelectorAll('select')].slice(0, 2).map((s) => s.value).sort().join('+')));
    check(pairs.length === 2 && pairs.includes('s1+s3') && pairs.includes('s2+s4'), 'C4 same 区分・階級 are paired together (' + pairs.join(' , ') + ')');
    check((await page.locator('[data-weight-warning]').count()) === 0 && (await page.locator('#suggest-weight-mix').count()) === 0, 'C4 so there is no caution and no count');
    await ctx.close();
  }
  /* C5 import: columns are read, -37 becomes the plain form, a name outside the list is kept */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'wc-c5-' + tag;
    await seed(ctx, tournament(id, { entryConfig: { ...ENTRY_BASE, weights: DEF }, fighters: [] }));
    const page = await openPrivate(ctx, id);
    const csv = [HEAD_W, rowW('K1', 'ア', '中学生男子', "'-37"), rowW('K2', 'イ', '高校生一般男子', '無差別'), rowW('K3', 'ウ', '小学生以下', ''), rowW('K4', 'エ', 'ちがう区分', 'ライト級'), rowW('K5', 'オ', '花道・女子（40歳以上）', '＋60')].join('\n');
    await importCsv(page, csv);
    await waitNotice(page, '5人分を読み込みました');
    const card = async (n) => (await page.locator('article[id^="fighter-"]', { hasText: n }).first().innerText());
    check(/区分・階級：中学生男子・37kg以下/.test(await card('架空ア選手')), 'C5 "-37" (with the spreadsheet guard) is read as 37kg以下');
    check(/区分・階級：高校生・一般男子・無差別/.test(await card('架空イ選手')), 'C5 高校生一般男子 (no ・) is matched to 高校生・一般男子');
    check(/区分・階級：小学生以下/.test(await card('架空ウ選手')) && !/小学生以下・/.test(await card('架空ウ選手')), 'C5 小学生以下 has no 階級');
    check(/区分・階級：ちがう区分・ライト級/.test(await card('架空エ選手')), 'C5 a name outside the list is kept as typed');
    check(/区分・階級：花道・女子（40歳以上）・60kgをこえる/.test(await card('架空オ選手')), 'C5 ＋60 (full width) is read as 60kgをこえる');
    check((await page.locator('#weight-trouble').count()) === 1 && /架空エ/.test(await page.locator('#weight-trouble').innerText()), 'C5 the yellow note names the one outside the list');
    const unread = (await bodyText(page)).match(/読めなかった列[^\n]*/)?.[0] ?? '';
    check(!/区分|階級/.test(unread), 'C5 区分 and 階級 are not reported as unreadable columns (' + short(unread, 60) + ')');
    await pressSave(page);
    await waitState2(page);
    const saved = await idbGet(page, id);
    const get = (n) => saved && saved.fighters.find((f) => f.name === n);
    check(get('架空ア選手') && get('架空ア選手').weightClass === '37kg以下' && get('架空ア選手').division === '中学生男子', 'C5 saved in the plain form');
    check(get('架空ウ選手') && get('架空ウ選手').division === '小学生以下' && !('weightClass' in get('架空ウ選手')), 'C5 小学生以下 saved without a weightClass key');
    check(await noOverflow(page), 'C5 no overflow');
    await ctx.close();
  }
  /* C6 an event without weights: nothing new on the prep screen */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'wc-c6-' + tag;
    const plain = wfighters.map((f) => { const { division, weightClass, ...r } = f; return r; });
    await seed(ctx, tournament(id, { entryConfig: ENTRY_BASE, fighters: plain }));
    const page = await openPrivate(ctx, id);
    await openFoldsOf(page, '#manual-name');
    check((await page.locator('[data-tos-weights]').count()) === 0 && (await page.locator('#manual-division').count()) === 0, 'C6 no 区分 / 階級 box in the add form');
    check((await page.locator('[data-weight-chip]').count()) === 0 && (await page.locator('#weight-trouble').count()) === 0, 'C6 no chip, no yellow note');
    await addBout(page, 'w1', 'w3');
    check((await page.locator('[data-weight-warning]').count()) === 0, 'C6 no weight-class caution');
    await ctx.close();
  }
});

/** D. Wrong values from a sheet are refused, not half used (the link carries the table) */
scenario('D', 'apply: wrong sheet values are refused, not half used', async (vp) => {
  const ctx = await newCtx(vp.mobile);
  const mk = (wd) => '#' + new URLSearchParams({ endpoint: ENDPOINT, eventId: 'weight-class', title: '架空', organizer: '', date: '', venue: '', venueUrl: '', deadline: '', contact: '03', music: 'off', grade: 'off', age: 'off', comment: 'off', wc: 'on', ...(wd ? { wd } : {}), protocol: '3', mode: 'live', end: '1' }).toString();
  for (const [label, wd, expectCut] of [
    ['empty table', '[]', true], ['not JSON', 'これは違う', true], ['number as a class', JSON.stringify([['男子', '37']]), true],
    ['duplicate division', JSON.stringify([['男子', '-37'], ['男子', '-40']]), true], ['formula as a division', JSON.stringify([['=1+1', '-37']]), true],
    ['valid', JSON.stringify([['男子', '-37,+60']]), false],
  ]) {
    const page = await ctx.newPage();
    await page.goto(base + '/apply/' + mk(wd));
    await settle(600);
    const t = await bodyText(page);
    const cut = /このページでは申し込めません/.test(t);
    check(cut === expectCut, 'D ' + label + ': ' + (expectCut ? 'refused as cut' : 'accepted') + ' (cut=' + cut + ')');
    if (!expectCut) check((await DIV(page).count()) === 1, 'D ' + label + ': the box is there');
    await page.close();
  }
  check(pageErrors.every((e) => e.scenario !== cur), 'D no script error');
  await ctx.close();
});



/** F. The "make the apply link" screen reads the sheet: 階級分け / ロゴ rows, the yellow notes for old sheets, the link it makes */
scenario('F', 'setup screen: weight rows, logo row, old-sheet notes (one yellow), link carries wc / logo', async (vp) => {
  const tag = vp.mobile ? 'm' + curW : 'd';
  const SETUP_EP = 'https://script.google.com/macros/s/TOS_WEIGHT_SETUP_SIM/exec';
  const READY = { app: 'tournament-os', protocol: 3, build: '3.20261022.7', ready: true, accepting: false, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: '架空テスト大会', date: '2099-12-01', venue: '架空体育館', venueUrl: '', organizer: '架空主催', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
  const WEIGHTS = { enabled: true, divisions: DEF.divisions.map((d) => ({ name: d.name, classes: d.classes })) };
  const open = async (ping, id, step = 2) => {
    const ctx = await browser.newContext({ viewport: { width: curW, height: vp.mobile ? 800 : 800 }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
    ctx.on('page', attach);
    await ctx.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === base + '/template-link.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ copyUrl: 'https://docs.google.com/spreadsheets/d/' + 'P'.repeat(30) + '/copy' }) });
      if (url.startsWith(base + '/')) return route.continue();
      if (/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\?action=ping$/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ping) });
      externals.push({ scenario: cur, url, method: route.request().method() });
      return route.abort();
    });
    const page = await ctx.newPage();
    await page.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* test setup only */ } }, ['tournament-setup-v3:' + id, JSON.stringify({ step, endpoint: SETUP_EP, ticks: [true, true, true, true], verified: false })]);
    await page.goto(base + '/private/setup/?event=' + id);
    await page.getByText(/いまここ \d \/ 3/).first().waitFor({ timeout: 15000 });
    await page.waitForFunction(() => !document.body.innerText.includes('読み込んでいます…'), null, { timeout: 5000 }).catch(() => undefined);
    await page.getByText('架空テスト大会', { exact: true }).first().waitFor({ timeout: 10000 }).catch(() => undefined);
    await settle(600);
    return { ctx, page };
  };
  const cautionCount = (page, re) => page.evaluate((src) => { const r = new RegExp(src); return [...document.querySelectorAll('main *')].filter((e) => e.children.length < 8 && r.test(e.innerText || '') && /気をつけて/.test(e.innerText || '') && e.getBoundingClientRect().height > 0).length; }, re.source);
  /* F1 weights + logo on: both rows say ✓, nothing yellow about old sheets, one marker, no overflow */
  {
    const { ctx, page } = await open({ ...READY, weightMode: true, weights: WEIGHTS, logo: true }, 'wc-f1-' + tag);
    const rw = await page.locator('#read-weights').innerText(), rl = await page.locator('#read-logo').innerText();
    check(/階級分け/.test(rw) && /✓ あり（7区分）。申し込みページに出ます/.test(rw), 'F1 the 階級分け row says ✓ あり（7区分） (' + short(rw, 80) + ')');
    check(/ロゴ/.test(rl) && /✓ あり（申し込みページと当日の画面に出ます）/.test(rl), 'F1 the ロゴ row says ✓ あり (' + short(rl, 80) + ')');
    check(!/古い版で、階級分け/.test(await bodyText(page)) && !/階級分け・ロゴの行がありません/.test(await bodyText(page)), 'F1 no old-sheet yellow note');
    check(await noOverflow(page), 'F1 no overflow (' + (await widest(page)).join('/') + '; ' + (await wideOnes(page)).join(' | ') + ')');
    check((await page.locator('[data-tos-next]').count()) === 1, 'F1 exactly ONE yellow marker (' + (await page.locator('[data-tos-next]').count()) + ')');
    await ctx.close();
  }
  /* F2 not used: plain words, no yellow */
  {
    const { ctx, page } = await open(READY, 'wc-f2-' + tag);
    check(/なし（階級は分けません）/.test(await page.locator('#read-weights').innerText()) && /なし（ロゴは出しません）/.test(await page.locator('#read-logo').innerText()), 'F2 not used: なし（階級は分けません） / なし（ロゴは出しません）');
    check(!/古い版で、階級分け|階級分け・ロゴの行がありません|このシートでは、ロゴを使えません/.test(await bodyText(page)), 'F2 nothing yellow when the feature is simply not used');
    await ctx.close();
  }
  /* F3 the previous build (3.20261010.5): class works, weights do not → exactly one yellow note, about 階級分け・ロゴ, class note absent */
  {
    const { ctx, page } = await open({ ...READY, build: '3.20261010.5' }, 'wc-f3-' + tag);
    const body = await bodyText(page);
    check(/このシートは古い版で、階級分け・ロゴに対応していません/.test(body), 'F3 the yellow note says the sheet is old for 階級分け・ロゴ');
    check(!/このGoogleの版は、クラス分けに対応していません/.test(body), 'F3 the class note is NOT shown (classes still work on this build)');
    check(/⚠ このシートは古い版で、階級分けに対応していません/.test(await page.locator('#read-weights').innerText()) && /⚠ このシートでは、ロゴを使えません/.test(await page.locator('#read-logo').innerText()), 'F3 the two rows carry the ⚠ words');
    check(/新しい版に入れかえて/.test(body), 'F3 the remedy mentions replacing the program in the sheet already in use');
    check(await noOverflow(page), 'F3 no overflow');
    await ctx.close();
  }
  /* F4 the oldest build: ONE yellow note (class), which also tells that 階級分け・ロゴ come with the new version */
  {
    const { ctx, page } = await open({ ...READY, build: '3.20261004.4' }, 'wc-f4-' + tag);
    const body = await bodyText(page);
    check(/このGoogleの版は、クラス分けに対応していません/.test(body) && /階級分けとロゴも、新しい版のシートで使えるようになります/.test(body), 'F4 one note: classes AND 階級分け・ロゴ');
    check(!/このシートは古い版で、階級分け・ロゴに対応していません/.test(body), 'F4 not a second yellow note for the same remedy');
    await ctx.close();
  }
  /* F5 a sheet copy without the 階級分け row */
  {
    const { ctx, page } = await open({ ...READY, weightRows: false }, 'wc-f5-' + tag);
    check(/このシートには、階級分け・ロゴの行がありません/.test(await bodyText(page)) && /⚠ このシートには、階級分けの行がありません/.test(await page.locator('#read-weights').innerText()), 'F5 the note says the rows are missing');
    await ctx.close();
  }
  /* F6 weightMode on but the table cannot be read: red, not a half-working link */
  {
    const { ctx, page } = await open({ ...READY, weightMode: true }, 'wc-f6-' + tag);
    check(/✕ あり（でも、区分と階級の表を申し込みページに入れられません/.test(await page.locator('#read-weights').innerText()), 'F6 the 階級分け row is red-worded (✕ …入れられません)');
    check(/階級分けが「あり」ですが、区分と階級の表を読めませんでした/.test(await bodyText(page)), 'F6 the sheet-fix sentence names the problem');
    await ctx.close();
  }
  /* F7 step 3: the link made for the fighters carries wc and logo (and the default table stays short) */
  {
    const { ctx, page } = await open({ ...READY, accepting: true, weightMode: true, weights: WEIGHTS, logo: true }, 'wc-f7-' + tag, 3);
    await settle(500);
    const urlBox = page.locator('input[aria-label="選手に渡すURL"]');
    const val = await urlBox.inputValue().catch(() => '');
    check(/\/apply\/#/.test(val) && /wc=on/.test(val) && /logo=on/.test(val) && !/wd=/.test(val), 'F7 the fighters\' link has wc=on and logo=on, and no wd for the default table (' + short(val, 40) + '…)');
    check(/階級分け：あり（7区分）。申し込みページに出ます/.test(await bodyText(page)) && /ロゴ：あり。申し込みページと当日の画面に出ます/.test(await bodyText(page)), 'F7 the green lines say 階級分け・ロゴ are on');
    check(await noOverflow(page), 'F7 no overflow');
    await ctx.close();
  }
  /* F8 the build just before 花道 (3.20261019.6) with 階級分け on and the default table (it has 花道 divisions): this sheet cannot say whether 花道 is wanted,
     so the screen must show NOTHING new about it: no ⚠, no yellow "プログラムが古いです", no "古い版" — the same as before 花道 existed (step 2 and step 3) */
  for (const step of [2, 3]) {
    const { ctx, page } = await open({ ...READY, build: '3.20261019.6', accepting: step === 3, weightMode: true, weights: WEIGHTS }, 'wc-f8-' + step + '-' + tag, step);
    const body = await bodyText(page);
    check(!/Googleのプログラムが古いです|花道の追加情報に対応していません|古い版/.test(body), 'F8 step ' + step + ': nothing about an old version for 花道 (' + short((body.match(/.{0,20}(プログラムが古い|古い版).{0,20}/) || [''])[0], 60) + ')');
    check(!/このシートは古い版で、|このGoogleの版は、クラス分けに対応していません|階級分け・ロゴの行がありません|クラス分けの行がありません/.test(body), 'F8 step ' + step + ': none of the old-sheet yellow notes (this build is fine for 階級分け)');
    if (step === 2) {
      const row = await page.locator('#read-hanamichi').innerText();
      check(/なし（追加の質問は出しません）/.test(row) && !/⚠/.test(row), 'F8 the 花道 row reads plain なし, no ⚠ (' + short(row, 60) + ')');
    }
    check(/あり（7区分）/.test(body), 'F8 step ' + step + ': 階級分け itself still works on this build (あり（7区分）)');
    await ctx.close();
  }
  /* F9 the 花道 row (setting あり): the row says ✓ あり, nothing yellow, one marker, text 17px+, no overflow */
  {
    const { ctx, page } = await open({ ...READY, weightMode: true, weights: WEIGHTS, hanamichiMode: true }, 'wc-f9-' + tag);
    const row = await page.locator('#read-hanamichi').innerText();
    check(/花道の追加情報/.test(row) && /✓ あり（花道の区分を選んだ人にだけ、追加の質問が出ます）/.test(row), 'F9 the 花道 row says ✓ あり (' + short(row, 80) + ')');
    check(!/古い版|プログラムが古いです/.test(await bodyText(page)), 'F9 nothing about an old version');
    check((await page.locator('[data-tos-next]').count()) === 1, 'F9 exactly ONE yellow marker');
    const sizes = await page.evaluate(() => ['#read-hanamichi dt', '#read-hanamichi dd'].map((q) => parseFloat(getComputedStyle(document.querySelector(q)).fontSize)));
    check(sizes.every((n) => n >= 17), 'F9 the row text is 17px or bigger (' + sizes.join('/') + ')');
    check(await noOverflow(page), 'F9 no overflow');
    await ctx.close();
  }
  /* F10 the 花道 row (setting なし): plain なし, no ✓ */
  {
    const { ctx, page } = await open({ ...READY, weightMode: true, weights: WEIGHTS }, 'wc-f10-' + tag);
    const row = await page.locator('#read-hanamichi').innerText();
    check(/なし（追加の質問は出しません）/.test(row) && !/✓|⚠/.test(row), 'F10 the 花道 row says なし, no ✓ and no ⚠ (' + short(row, 60) + ')');
    await ctx.close();
  }
  /* F11 setting あり but no 花道 division: a red "settings to fix" sentence that names the row by its NAME (no cell number) */
  {
    const message = '「花道の追加情報」が「あり」ですが、選べる区分に「花道」の入った名前がありません（「階級分け」を「あり」にして、区分の名前に「花道」を入れるか、A列が「花道の追加情報」の行のB列を「なし」にしてください）';
    const { ctx, page } = await open({ ...READY, settingsProblem: message }, 'wc-f11-' + tag);
    const body = await bodyText(page);
    check(/A列が「花道の追加情報」の行のB列/.test(body) && !/B30/.test(body), 'F11 the place is said by the row name, with no cell number');
    check(await noOverflow(page), 'F11 no overflow');
    await ctx.close();
  }
  /* F12 step 3: the fighters' link carries hn=on (before protocol) and a green line, only when the sheet says あり */
  {
    const on = await open({ ...READY, accepting: true, weightMode: true, weights: WEIGHTS, hanamichiMode: true }, 'wc-f12a-' + tag, 3);
    await settle(500);
    const val = await on.page.locator('input[aria-label="選手に渡すURL"]').inputValue().catch(() => '');
    check(/\/apply\/#/.test(val) && /[#&]hn=on&protocol=3&mode=live&end=1$/.test(val), 'F12 あり: the link carries hn=on just before protocol (' + short(val.slice(-60), 70) + ')');
    check(/花道の追加情報：あり。花道の区分を選んだ人にだけ、追加の質問が出ます。/.test(await bodyText(on.page)), 'F12 あり: the green line is there');
    await on.ctx.close();
    const off = await open({ ...READY, accepting: true, weightMode: true, weights: WEIGHTS }, 'wc-f12b-' + tag, 3);
    await settle(500);
    const v2 = await off.page.locator('input[aria-label="選手に渡すURL"]').inputValue().catch(() => '');
    check(/\/apply\/#/.test(v2) && !/hn=/.test(v2) && !/花道の追加情報：あり/.test(await bodyText(off.page)), 'F12 なし: no hn in the link, no green line');
    await off.ctx.close();
    const old = await open({ ...READY, build: '3.20261019.6', accepting: true, weightMode: true, weights: WEIGHTS, hanamichiMode: true }, 'wc-f12c-' + tag, 3);
    await settle(500);
    const v3 = await old.page.locator('input[aria-label="選手に渡すURL"]').inputValue().catch(() => '');
    check(/\/apply\/#/.test(v3) && !/hn=/.test(v3), 'F12 an old build never makes an hn link, even if the ping claims it');
    await old.ctx.close();
  }
});

/** E. privacy, network, headers, contrast of the shared rules (run once) */
scenario('E', 'network and policy', async (vp) => {
  if (vp.mobile) return;
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  const blocks = headers.split(/\n(?=\/)/);
  const applyBlock = blocks.find((b) => b.startsWith('/apply/')) || '';
  check(/connect-src 'none'/.test(applyBlock), 'E /apply/ CSP keeps connect-src none');
  check(/form-action https:\/\/script\.google\.com https:\/\/script\.googleusercontent\.com;/.test(applyBlock), 'E /apply/ CSP keeps form-action only script.google.com(+usercontent)');
  check(!/https:\/\/(?!script\.google)/.test(applyBlock.replace(/https:\/\/script\.googleusercontent\.com/g, '')), 'E /apply/ CSP lists no other host');
  const builtRes = await fetch(base + '/_headers').catch(() => null);
  const built = builtRes && builtRes.ok ? await builtRes.text() : '';
  check(built.length > 0, 'E the BUILD UNDER TEST serves _headers (not a stale copy)');
  const builtApply = built.split(/\n(?=\/)/).find((b) => b.startsWith('/apply/')) || '';
  check(builtApply === applyBlock, 'E the built /apply/ header block equals the source block (nothing weakened in the build)');
  check(/connect-src 'none'/.test(builtApply) && /form-action https:\/\/script\.google\.com https:\/\/script\.googleusercontent\.com;/.test(builtApply), 'E the built /apply/ CSP has connect-src none and the two form-action hosts');
  // the built apply page and its scripts name no outside host except Google's form endpoint
  const applyHtml = await (await fetch(base + '/apply/')).text();
  const outside = [...applyHtml.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  check(outside.length === 0, 'E the built /apply/ HTML loads nothing from outside (' + outside.slice(0, 3).join(',') + ')');
  const cssRes = [...applyHtml.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);
  for (const href of cssRes) { const css = await (await fetch(new URL(href, base + '/apply/'))).text(); check(!/url\(\s*["']?https?:/.test(css) && !/@import/.test(css), 'E CSS ' + href.slice(-18) + ' has no outside url() or @import'); check(!/color-mix\(/.test(stripSupports(css)), 'E CSS ' + href.slice(-18) + ' uses color-mix() only inside an @supports guard (Safari 15 keeps its hex fallback)'); }
  const kinds = net.filter((n) => n.url.startsWith(base + '/')).map((n) => { const last = new URL(n.url).pathname.split('/').pop(); return last.includes('.') ? last.split('.').pop().toLowerCase() : 'page'; });
  const okKinds = new Set(['js', 'css', 'ico', 'svg', 'png', 'txt', 'page', 'html', 'json']);
  const oddKinds = [...new Set(kinds.filter((k) => !okKinds.has(k)))];
  check(oddKinds.length === 0, 'E same-origin requests are only page / js / css / icon assets (odd: ' + oddKinds.join(',') + ')');
  check(net.every((n) => n.method === 'GET' || n.url === ENDPOINT), 'E every request except the one Google POST is a GET');
  const bad = externals.filter((e) => true);
  check(bad.length === 0, 'E nothing tried to reach outside 127.0.0.1 except the simulated Google POST (' + short(bad.slice(0, 3).map((e) => e.method + ' ' + e.url).join(' | '), 160) + ')');
  const offbase = net.filter((n) => !n.url.startsWith(base + '/') && !(n.url === ENDPOINT && n.method === 'POST'));
  check(offbase.length === 0, 'E every recorded request is same-origin or the one Google form POST (' + offbase.length + ' others)');
  const onlyApplyPosts = net.filter((n) => n.method === 'POST' && n.url !== ENDPOINT);
  check(onlyApplyPosts.length === 0, 'E no POST anywhere else (private pages never send)');
  const fonts = net.filter((n) => /\.(woff2?|ttf|otf)(\?|$)/i.test(n.url) && !n.url.startsWith(base + '/'));
  check(fonts.length === 0, 'E no external fonts');
  // personal data never rides along on OS-side pages: the posted fields are only the documented ones
  const allowed = new Set(['protocol', 'entryKey', 'mode', 'website', 'eventId', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'fighterClass', 'division', 'weightClass', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'photoDataUrl']);
  check(posts.length > 0 && posts.every((p) => [...p.fields.keys()].every((k) => allowed.has(k))), 'E every posted field is a known one (' + posts.length + ' posts)');
  check(posts.every((p) => ['', 'upper', 'lower'].includes(p.fields.get('fighterClass') ?? '')), 'E fighterClass is only upper / lower / empty (no free text goes out)');
  check(pageErrors.length === 0, 'E no uncaught page errors in the whole run (' + short(pageErrors.slice(0, 3).map((e) => '[' + e.scenario + '] ' + e.message).join(' | '), 200) + ')');
  check(dialogs.length === 0, 'E no browser dialogs');
});

/* ───────────────────────── run ───────────────────────── */
const VPS = [{ name: '1280', mobile: false, w: 1280 }, { name: '390', mobile: true, w: 390 }, { name: '320', mobile: true, w: 320 }];
try {
  for (const s of SCENARIOS) {
    if (ONLY.length && !ONLY.includes(s.id)) continue;
    for (const vp of VPS) {
      cur = s.id + '@' + vp.name;
      curW = vp.w;
      const t0 = Date.now();
      const before = failures.length;
      console.log('== ' + cur + ' ' + s.title);
      try { await s.fn(vp); } catch (e) { failures.push('[' + cur + '] SCENARIO CRASHED: ' + short(e && e.message ? e.message : e, 400)); console.log('  CRASH [' + cur + '] ' + short(e && e.stack ? e.stack : e, 600)); }
      console.log('   ' + (failures.length - before) + ' failure(s), ' + (Date.now() - t0) + 'ms');
    }
  }
} finally {
  await browser.close();
}
console.log('\n' + checks + ' checks, ' + failures.length + ' failed.');
for (const f of failures) console.log(' - ' + f);
process.exit(failures.length ? 1 : 0);
