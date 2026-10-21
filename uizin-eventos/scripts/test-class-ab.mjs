/**
 * Adversarial browser checks for the A/B CLASS feature of Tournament OS v3 (apply form class choice, /private/ roster + bout card,
 * /private/live/ single + list view). Written by a tester who did not write the code.
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation, except the apply form's single POST to the
 * (simulated) Google endpoint, which is fulfilled locally. All data is fake. It drives the REAL built pages (npm run build:private ->
 * out-private-pages) at 1280px and 390px.
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4620 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_TEST_BASE=http://127.0.0.1:4620 TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-class-ab.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4620), TOS_ONLY=A,B,C,D,E (scenario ids), TOS_CHROME_PATH.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { publicEntryHash } from '../core/publicEntry.ts';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';
import { emptyTournament } from '../core/privateTournament.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4620';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const ENDPOINT = 'https://script.google.com/macros/s/TOS_CLASS_AB_SIM/exec';
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
/** Every request is recorded. Same-origin goes through; the one simulated Google POST is answered locally; everything else is aborted and counted. */
async function newCtx(mobile, userAgent) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, acceptDownloads: true, ...(userAgent ? { userAgent } : {}) });
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
let curW = 1280;
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
const baseCfg = { endpoint: ENDPOINT, eventId: 'class-ab', title: '架空テスト大会', organizer: '', date: '', venue: '', venueUrl: '', deadline: '', contact: '', music: false, grade: 'off', age: 'off', comment: 'off', protocol: '3', mode: 'live' };
const hashWith = (classes, extra = {}) => publicEntryHash({ ...baseCfg, ...extra, ...(classes ? { classes } : {}) });
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

/* ───────────────────────── scenarios ───────────────────────── */
const SCENARIOS = [];
const scenario = (id, title, fn) => SCENARIOS.push({ id, title, fn });

/** A. The apply form, class on. Every state at both widths. */
scenario('A', 'apply form: choice, required, suggestion, mismatch, send', async (vp) => {
  const d = DEFAULT_CLASS_SETTINGS;
  /* A1 both options, condition + rules right under each, nothing pre-chosen, big tap targets */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashOn());
    const box = CLS(page);
    check(await box.isVisible(), 'A1 class box is on the form');
    check((await box.innerText()).includes('必須'), 'A1 class is marked 必須');
    const radios = box.locator('input[type=radio]');
    check((await radios.count()) === 2, 'A1 exactly two class radios');
    check((await box.locator('input[type=radio]:checked').count()) === 0, 'A1 nothing is chosen by default');
    for (const [key, side] of [['upper', d.upper], ['lower', d.lower]]) {
      const label = box.locator('label').filter({ has: page.locator('input[value=' + key + ']') });
      const t = await label.innerText();
      check(t.includes(side.name) && t.includes(side.condition) && t.includes(side.rule), 'A1 ' + side.name + ': name + condition + rule all sit inside its own choice (' + short(t, 80) + ')');
      const bb = await label.boundingBox();
      check(bb && bb.height >= 56 && bb.width >= 200, 'A1 ' + side.name + ' choice is a large target (' + (bb ? Math.round(bb.width) + 'x' + Math.round(bb.height) : '-') + ')');
      const name = await box.locator('input[value=' + key + ']').getAttribute('aria-labelledby');
      check(!!name, 'A1 ' + side.name + ' radio has an accessible name');
    }
    check(/ワンアタック（キャッチ後に1回だけ攻撃できる）/.test(await box.innerText()), 'A1 one-attack is explained in plain words');
    check(/3勝以上/.test(await box.innerText()) && /2勝以下/.test(await box.innerText()), 'A1 the words 3勝以上 and 2勝以下 are shown');
    check(await noOverflow(page), 'A1 no horizontal overflow (' + (await widest(page)).join('/') + ')');
    check((await nextMarks(page)).length === 1, 'A1 exactly ONE 👉 次はここ at the start (' + (await nextMarks(page)).join(' | ') + ')');
    // the rule/condition sizes: >= 17px is the owner brief for this feature
    const small = await box.evaluate((fs) => {
      const out = [];
      const w = document.createTreeWalker(fs, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const px = parseFloat(getComputedStyle(n.parentElement).fontSize); if (px < 17) out.push(px + 'px:' + n.textContent.trim().slice(0, 18)); }
      return out;
    });
    check(small.length === 0, 'A1 all text in the class box is >= 17px (found small: ' + short(small.join(' | '), 200) + ')');
    await ctx.close();
  }
  /* A2 required: cannot go on without a choice, red message next to the choice, nothing is sent */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashOn());
    await fillAll(page, '初出場');
    await settle(200);
    const nm0 = await nextMarks(page);
    check(nm0.length === 1 && /クラスを選ぶ/.test(nm0[0] ?? ''), 'A2 with everything else filled, the ONE 👉 次はここ points at the class (' + nm0.join(' | ') + ')');
    await reviewBtn(page).click();
    await settle(400);
    check((await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 0, 'A2 no review screen without a class');
    check((await nextMarks(page)).length === 1, 'A2 after the failed press there is still exactly ONE 👉 次はここ (' + (await nextMarks(page)).join(' | ') + ')');
    const err = CLS(page).locator('#f-fighterClass-err');
    check((await err.count()) === 1 && (await err.innerText()).includes('クラスを選んでください'), 'A2 red message inside the class box says クラスを選んでください (' + short(await err.allInnerTexts(), 100) + ')');
    if (await err.count()) {
      const s = await styleOf(err.locator('span').last());
      check(contrast(s.fg, s.bg) >= 4.5 && isReddish(s.fg), 'A2 error text is red and >= 4.5:1 (' + contrast(s.fg, s.bg).toFixed(2) + ')');
      check(s.weight >= 600, 'A2 error text is bold');
      check(s.size >= 17, 'A2 error text is >= 17px (' + s.size + 'px)');
      const eb = await err.boundingBox(), cb = await CLS(page).boundingBox();
      check(eb && cb && eb.y >= cb.y && eb.y + eb.height <= cb.y + cb.height + 2, 'A2 the error is physically inside the class box (next to the choice)');
    }
    check(ctx.__posts.length === 0, 'A2 nothing was posted');
    const focusIn = await page.evaluate(() => !!document.activeElement?.closest('#f-fighterClass') || document.activeElement?.id === 'f-fighterClass');
    check(focusIn, 'A2 focus moved to the class choice');
    const msgs = await page.evaluate(() => [...document.querySelectorAll('[role=status],[role=alert]')].map((n) => n.innerText).join(' || '));
    check(/クラス/.test(msgs), 'A2 the top message mentions クラス (' + short(msgs, 120) + ')');
    // choosing one clears the red message and shows the green tick
    await classPick(page, 'upper');
    await settle(200);
    check((await CLS(page).locator('#f-fighterClass-err').count()) === 0, 'A2 the red message goes away once a class is chosen');
    check((await CLS(page).innerText()).includes('✓ えらびました'), 'A2 a visible ✓ shows the choice was taken');
    const nm1 = await nextMarks(page);
    check(nm1.length === 1 && !/クラス/.test(nm1[0] ?? ''), 'A2 after choosing, the ONE 👉 次はここ has moved on from the class (' + nm1.join(' | ') + ')');
    check(await noOverflow(page), 'A2 no overflow');
    await ctx.close();
  }
  /* A3 the yellow suggestion for each record, B <= 2 wins, A >= 3, none when unreadable */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashOn());
    const rec = page.getByLabel('戦績 必須', { exact: true });
    const CASES = [
      ['初出場', 'B'], ['初試合', 'B'], ['0勝', 'B'], ['2勝1敗', 'B'], ['1勝3敗', 'B'], ['３戦２勝', 'B'], ['3戦2勝', 'B'], ['３戦０勝', 'B'], ['10戦2勝8敗', 'B'], ['２勝１敗', 'B'], ['二勝', 'B'], ['0勝0敗', 'B'], ['未経験', 'B'],
      ['3勝0敗', 'A'], ['3-0', 'A'], ['三勝', 'A'], ['4勝', 'A'], ['5勝2敗', 'A'], ['３勝０敗', 'A'], ['10戦3勝7敗', 'A'], ['3勝2敗1分', 'A'], ['十勝', 'A'], ['20勝', 'A'], ['5-2', 'A'], ['3 勝', 'A'],
      ['3W2L', 'A'], ['2w1l', 'B'], ['0-3', 'B'], ['3-2-1', 'A'], ['5戦3勝2敗', 'A'], ['プロ3勝', 'A'], ['アマチュア2勝', 'B'], ['2勝（1KO）', 'B'], ['3勝(2KO)', 'A'], ['１０戦４勝６敗', 'A'], ['九勝', 'A'], ['二十勝', 'A'], ['3勝-1敗', 'A'], ['2023年出場、2勝', 'B'], ['2戦0勝2敗', 'B'], ['3win', 'A'],
      ['2024-03-01', null], ['100勝', null], ['2勝3勝', null], ['勝率100%', null], ['3 weeks', null], ['2勝か3勝', null],
      ['', null], ['   ', null], ['アマチュア3戦', null], ['2勝か3勝', null], ['3勝と2勝', null], ['たくさん', null], ['?', null],
      // added by the adversarial pass: phrases a parent really writes
      ['2勝以下', 'B'], ['3勝以上', 'A'], ['通算3勝', 'A'], ['プロ戦績3勝0敗', 'A'], ['2戦2勝', 'B'], ['1勝1敗1分け', 'B'], ['0勝3敗', 'B'], ['勝利なし', 'B'], ['2024/3/1 初出場', 'B'], ['10月に初出場', 'B'], ['3勝ち', 'A'], ['２０２５年１０月 ３勝', 'A'],
      ['3連勝', null], ['全勝', null], ['3戦全勝', null], ['3.5勝', null], ['1000勝', null], ['5敗', null], ['2勝1敗とか3勝1敗', null], ['2024/3/1', null], ['3/1', null], ['Aクラス', null],
      // round 2 (r2-1): a number range with a unit (times a week, years, age) is NOT a win-loss record -> no suggestion or Bクラス, never Aクラス
      ['週3-4回練習しています。試合は初めてです', 'B'], ['空手歴3-4年・初試合', 'B'], ['空手3-4年', null], ['小学5-6年生', null], ['10-12歳', null], ['キック3-4年', null], ['ジュニア大会3-4回出場', null],
      // round 2 (r2-132): a zero word together with a win count, or a wish, is not decided; plain beginner phrases are read as Bクラス
      ['初試合（目標3勝）', null], ['初出場です。3勝したい', null], ['初出場。3勝を目指します', null], ['試合経験なし 3勝は無理', null],
      ['特になし', 'B'], ['ありません', 'B'], ['試合経験ありません', 'B'], ['出場なし', 'B'], ['戦績:なし', 'B'], ['初戦', 'B'], ['初心者', 'B'], ['デビュー戦', 'B'], ['試合に出たことがない', 'B'], ['ナシ', 'B'], ['0 試合', 'B'],
    ];
    for (const [text, want] of CASES) {
      await rec.fill(text);
      await rec.blur();
      await settle(60);
      const notes = await classNotes(page);
      const yellow = notes.find((n) => /戦績からは、/.test(n));
      const got = yellow ? (yellow.match(/戦績からは、(.+?)です/) || [])[1] : null;
      const wantName = want === 'A' ? d.upper.name : want === 'B' ? d.lower.name : null;
      check(got === wantName, 'A3 record ' + JSON.stringify(text) + ' -> ' + (wantName ?? 'no suggestion') + ' (got ' + (got ?? 'none') + ')');
      if (want === null && text.trim()) check(notes.some((n) => /目安は出せませんでした/.test(n)) && !yellow, 'A3 unreadable ' + JSON.stringify(text) + ' gets the neutral note, not a guess');
      if (want === null && !text.trim()) check(notes.length === 0, 'A3 empty record: no suggestion and no note (' + short(notes.join('|'), 60) + ')');
      check((await box_checked(page)) === 0, 'A3 the suggestion never chooses for the user (' + JSON.stringify(text) + ')');
    }
    // "勝ち負けなし": ambiguous in plain Japanese - it must never produce class A
    await rec.fill('勝ち負けなし'); await rec.blur(); await settle(60);
    const nn = await classNotes(page);
    const ym = nn.find((n) => /戦績からは、/.test(n));
    note('勝ち負けなし -> ' + (ym ? ym : (nn[0] || 'nothing')));
    check(!ym || /Bクラス/.test(ym), 'A3 勝ち負けなし never suggests the upper class');
    // look of the yellow suggestion
    await rec.fill('2勝1敗'); await settle(80);
    const yel = CLS(page).locator('[role=status]', { hasText: '戦績からは、' });
    check((await yel.count()) === 1, 'A3 exactly one yellow suggestion');
    const ys = await styleOf(yel);
    check(isYellowish(ys.bg) || isYellowish(ys.border), 'A3 the suggestion is YELLOW (bg ' + ys.bg + ' border ' + ys.border + ')');
    check(isDark(ys.fg) && contrast(ys.fg, ys.bg) >= 4.5, 'A3 dark text on yellow, >= 4.5:1 (' + contrast(ys.fg, ys.bg).toFixed(2) + ')');
    check(/⚠|👉/.test(await yel.innerText()), 'A3 the suggestion has an icon (⚠) as well as words');
    check(ys.size >= 17, 'A3 the suggestion text is >= 17px (' + ys.size + 'px)');
    const side = await CLS(page).locator('p', { hasText: '目安です' }).first().evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
    check(side >= 17, 'A3 the 目安です note is >= 17px (' + side + 'px)');
    check(await noOverflow(page), 'A3 no overflow');
    // keep it from stalling: very long numeric records must not freeze the page
    for (const huge of ['1'.repeat(30000), '1 '.repeat(15000), '勝'.repeat(30000), '1-'.repeat(15000), '9'.repeat(100) + '勝']) {
      const t0 = Date.now();
      await rec.fill(huge);
      await page.evaluate(() => 1);
      const ms = Date.now() - t0;
      check(ms < 4000, 'A3 a ' + huge.length + '-char record (' + huge.slice(0, 6) + '...) does not freeze the page (' + ms + 'ms)');
    }
    await ctx.close();
  }
  /* A4 mismatch: red gentle line, never blocks, posts fighterClass */
  for (const [record, pick, otherName, want] of [['2勝1敗', 'upper', d.lower.name, 'upper'], ['3勝0敗', 'lower', d.upper.name, 'lower']]) {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashOn());
    await fillAll(page, record);
    await classPick(page, pick);
    await settle(150);
    const notes = await classNotes(page);
    const red = CLS(page).locator('[role=status]', { hasText: '戦績と合っていますか？' });
    check((await red.count()) === 1, 'A4 [' + record + ' + ' + pick + '] the red line 戦績と合っていますか？ is shown');
    if (await red.count()) {
      const rs = await styleOf(red);
      check(isReddish(rs.fg) || isReddish(rs.border), 'A4 it is RED (fg ' + rs.fg + ' border ' + rs.border + ')');
      check(contrast(rs.fg, rs.bg) >= 4.5, 'A4 red text >= 4.5:1 (' + contrast(rs.fg, rs.bg).toFixed(2) + ')');
      check(rs.weight >= 600 && /⚠|✕/.test(await red.innerText()), 'A4 bold with a ⚠ mark and words');
      check(rs.size >= 17, 'A4 red line >= 17px (' + rs.size + 'px)');
      check((await red.innerText()).includes(otherName), 'A4 it names the suggested class ' + otherName);
    }
    check(notes.some((n) => /戦績からは、/.test(n)), 'A4 the yellow suggestion stays beside the red line');
    check((await CLS(page).innerText()).includes('そのまま送れます'), 'A4 it says it can be sent as it is');
    check(await noOverflow(page), 'A4 no overflow');
    // the review page repeats the gentle red line, and going back keeps the choice
    await reviewBtn(page).click();
    await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor({ timeout: 8000 });
    const rvText = await page.getByRole('region', { name: '送る前の確認' }).innerText();
    check(rvText.includes('クラス') && rvText.includes(classes_name(pick)) && rvText.includes('戦績と合っていますか？') && rvText.includes('そのまま送れます'), 'A4 the review screen shows the class and the gentle ⚠ line, and says it can be sent');
    check((await nextMarks(page)).length === 1, 'A4 the review screen has exactly ONE 👉 次はここ (' + (await nextMarks(page)).join(' | ') + ')');
    await page.getByRole('button', { name: '戻って直す（送信しません）', exact: true }).click();
    await settle(200);
    check((await box_checked(page)) === 1 && await CLS(page).locator('input[value=' + pick + ']').isChecked(), 'A4 going back from the review keeps the chosen class');
    check(ctx.__posts.length === 0, 'A4 going back posts nothing');
    // it must still go through
    const sent = await send(page, ctx);
    check(sent === 1, 'A4 the mismatch does NOT block sending (posts ' + sent + ')');
    check(ctx.__posts.length === 1 && ctx.__posts[0].get('fighterClass') === want, 'A4 the post carries fighterClass=' + want + ' (' + ctx.__posts[0]?.get('fighterClass') + ')');
    check(ctx.__posts[0]?.get('record') === record, 'A4 the free-text record is still posted untouched');
    check(!/upper|lower/.test(await page.evaluate(() => document.body.innerText)), 'A4 internal keys never leak onto the success page');
    await ctx.close();
  }
  /* A5 matching choice: no red line; post carries the value; review page shows class word */
  for (const [record, pick, name] of [['初出場', 'lower', d.lower.name], ['4勝', 'upper', d.upper.name]]) {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashOn());
    await fillAll(page, record);
    await classPick(page, pick);
    await settle(150);
    check((await CLS(page).locator('[role=status]', { hasText: '戦績と合っていますか' }).count()) === 0, 'A5 [' + record + ' + ' + name + '] no red line when it matches');
    await reviewBtn(page).click();
    await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor({ timeout: 8000 });
    const rv = await page.getByRole('region', { name: '送る前の確認' }).innerText().catch(async () => (await bodyText(page)));
    check(rv.includes('クラス') && rv.includes(name), 'A5 the review screen shows クラス / ' + name);
    check(await noOverflow(page), 'A5 review has no overflow');
    // changing the class from the review goes back to editing and never submits
    check(ctx.__posts.length === 0, 'A5 review alone posts nothing');
    await sendBtn(page).click();
    await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
    check(ctx.__posts.length === 1 && ctx.__posts[0].get('fighterClass') === pick, 'A5 post carries fighterClass=' + pick + ' (' + ctx.__posts[0]?.get('fighterClass') + ')');
    const keys = [...ctx.__posts[0].keys()];
    check(!keys.some((k) => /class/i.test(k) && k !== 'fighterClass'), 'A5 only the one new field is added');
    await ctx.close();
  }
  /* A6 an unreadable record with a choice: no red line, still sends */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashOn());
    await fillAll(page, 'アマチュア3戦');
    await classPick(page, 'lower');
    await settle(150);
    check((await CLS(page).locator('[role=status]', { hasText: '戦績と合っていますか' }).count()) === 0, 'A6 unreadable record + a choice: no red line');
    check((await send(page, ctx)) === 1, 'A6 and it sends');
    await ctx.close();
  }
  /* A7 changing the record after choosing updates the red line live (and removing the record clears it) */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashOn());
    const rec = page.getByLabel('戦績 必須', { exact: true });
    await classPick(page, 'lower');
    await rec.fill('5勝');
    await settle(100);
    check((await CLS(page).locator('[role=status]', { hasText: '戦績と合っていますか' }).count()) === 1, 'A7 typing 5勝 after choosing B raises the red line');
    await rec.fill('1勝');
    await settle(100);
    check((await CLS(page).locator('[role=status]', { hasText: '戦績と合っていますか' }).count()) === 0, 'A7 fixing the record to 1勝 clears it');
    await rec.fill('');
    await settle(100);
    check((await classNotes(page)).length === 0, 'A7 empty record clears all notes');
    await ctx.close();
  }
  /* A8 class off / absent: form unchanged */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashWith(undefined));
    check((await CLS(page).count()) === 0 && (await page.locator('input[type=radio]').count()) === 0, 'A8 no class box and no radios when classes are off');
    check(!(await bodyText(page)).includes('クラス'), 'A8 the word クラス does not appear at all');
    await fillAll(page, '2勝1敗');
    await page.getByLabel('戦績 必須', { exact: true }).fill('2勝1敗');
    await settle(100);
    check(!(await bodyText(page)).includes('戦績からは'), 'A8 no suggestion when classes are off');
    const sent = await send(page, ctx);
    check(sent === 1, 'A8 sends without a class');
    check(!ctx.__posts[0].get('fighterClass'), 'A8 the posted fighterClass is empty/absent (' + JSON.stringify(ctx.__posts[0].get('fighterClass')) + ')');
    await ctx.close();
    // cls=off explicit stays a normal form. cls=on with texts that cannot be read, and any cls value that is not on/off (a link cut inside "cls=on"), is a BROKEN link:
    // red box, form locked (S-3 / r1-1) - a parent must not fill everything in and only then learn that Google refuses the class-less send.
    // Lenient on purpose: empty names (-> defaults) and a bad win count (-> 3 wins) are still readable, so the form stays usable.
    for (const [frag, locked] of [['&cls=off', false], ['&cls=yes', true], ['&cls=on&cuN=' + encodeURIComponent('同じ') + '&clN=' + encodeURIComponent('同じ'), true], ['&cls=on&cuN=&clN=', false], ['&cls=on&cw=0', false], ['&cls=on&cw=abc', false]]) {
      const c2 = await newCtx(vp.mobile);
      const p2 = await c2.newPage();
      await p2.goto(base + '/apply/' + hashWith(undefined) + frag);
      if (locked) await p2.getByText('このページでは申し込めません').first().waitFor({ timeout: 15000 });
      else await p2.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
      const has = (await CLS(p2).count()) === 1;
      note('hash ' + frag.slice(0, 50) + ' -> class box ' + (has ? 'shown' : 'hidden') + (locked ? ', locked' : ''));
      check(await noOverflow(p2), 'A8 odd hash ' + frag.slice(0, 40) + ' does not break the page');
      if (locked) check(!has && (await reviewBtn(p2).isDisabled().catch(() => true)) && !(await p2.getByLabel('ジム名 必須', { exact: true }).isVisible()), 'A8 ' + frag.slice(0, 40) + ' is a broken link: red box, no form, no send');
      if (/cls=off$/.test(frag)) check(!has, 'A8 ' + frag + ' keeps the class box off');
      await c2.close();
    }
  }
  /* A9 custom names/wins from the hash (the owner can change them in the sheet) */
  {
    const ctx = await newCtx(vp.mobile);
    const custom = { enabled: true, upper: { name: '上級', condition: '5勝以上', rule: '肘あり' }, lower: { name: '初級', condition: '4勝以下', rule: '肘なし' }, upperMinWins: 5 };
    const page = await openApply(ctx, hashWith(custom));
    const t = await CLS(page).innerText();
    check(t.includes('上級') && t.includes('5勝以上') && t.includes('肘あり') && t.includes('初級') && t.includes('肘なし'), 'A9 custom names / conditions / rules appear');
    const rec = page.getByLabel('戦績 必須', { exact: true });
    for (const [r, w] of [['4勝', '初級'], ['5勝', '上級'], ['3勝', '初級']]) { await rec.fill(r); await settle(60); check((await classNotes(page)).some((n) => n.includes('戦績からは、' + w + 'です')), 'A9 with 5-win line, ' + r + ' -> ' + w); }
    await ctx.close();
  }
  /* A10 inside LINE on an old iPhone (Safari 15 engine + LINE in the user agent): keyboard choice, required, one POST even on a double tap */
  {
    const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.2.0';
    const ctx = await newCtx(vp.mobile, UA);
    const page = await openApply(ctx, hashOn());
    check(await CLS(page).isVisible(), 'A10 [LINE UA] the class box shows');
    await fillAll(page, '2勝1敗');
    // keyboard only: focus the first radio, arrow to the second, the choice is taken without a mouse
    await CLS(page).locator('input[type=radio]').first().focus();
    await page.keyboard.press('ArrowDown');
    await settle(100);
    const kb = await CLS(page).locator('input[type=radio]:checked').evaluateAll((els) => els.map((e) => e.value));
    check(kb.length === 1, 'A10 an arrow key chooses exactly one class (' + kb.join() + ')');
    const ring = await CLS(page).locator('input[type=radio]:focus-visible').count();
    check(ring === 1, 'A10 the focused radio is the one that shows a focus ring (' + ring + ')');
    await classPick(page, 'lower');
    await reviewBtn(page).click();
    await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor({ timeout: 8000 });
    await sendBtn(page).dblclick().catch(() => {});
    await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
    await settle(400);
    check(ctx.__posts.length === 1, 'A10 a double tap on 送信 posts exactly once (' + ctx.__posts.length + ')');
    check(ctx.__posts[0]?.get('fighterClass') === 'lower', 'A10 the post carries fighterClass=lower');
    await ctx.close();
  }
  /* A11 Enter key inside a text field must not skip the required class (nothing may be posted) */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openApply(ctx, hashOn());
    await fillAll(page, '初出場');
    await page.getByLabel('メールアドレス 必須', { exact: true }).press('Enter');
    await settle(500);
    check(ctx.__posts.length === 0, 'A11 pressing Enter with no class chosen posts nothing');
    check((await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 0, 'A11 and does not reach the review screen');
    await ctx.close();
  }
});
/** leaf elements (no element children) whose own text matches `re` and whose font is under 17px, or whose text/background contrast is under 4.5 */
const weakText = (p, re, root = 'main') => p.evaluate(([src, root]) => {
  const rx = new RegExp(src);
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const conv = (str) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = str; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const out = [];
  for (const el of document.querySelectorAll(root + ' *')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!t || !rx.test(t)) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el), px = parseFloat(cs.fontSize);
    const layers = []; for (let n = el; n; n = n.parentElement) { const c = conv(getComputedStyle(n).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    let bg = [255, 255, 255]; for (const l of layers.reverse()) bg = [0, 1, 2].map((i) => Math.round(l[i] * l[3] + bg[i] * (1 - l[3])));
    const fg = conv(cs.color), ratio = (Math.max(L(fg), L(bg)) + 0.05) / (Math.min(L(fg), L(bg)) + 0.05);
    if (px < 17 || ratio < 4.5) out.push(t.slice(0, 22) + ' [' + px + 'px, ' + ratio.toFixed(2) + ':1]');
  }
  return out;
}, [re.source, root]);
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
const classes_name = (k) => DEFAULT_CLASS_SETTINGS[k].name;
const box_checked = (p) => CLS(p).locator('input[type=radio]:checked').count();

/** B. /private/ : roster import, backup, fighter cards, bout card warning */
scenario('B', 'chairman page: import, cards, backup, bout warning', async (vp) => {
  const tag = vp.mobile ? 'm' : 'd';
  /* B1 CSV with クラス */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'cls-b1-' + tag;
    const page = await openPrivate(ctx, id);
    await importCsv(page, csvCls);
    await waitNotice(page, '4人分を読み込みました');
    const t = await bodyText(page);
    check((t.match(/クラス：Aクラス/g) || []).length === 2 && (t.match(/クラス：Bクラス/g) || []).length === 1, 'B1 cards show the class WORD: 2x Aクラス, 1x Bクラス (' + (t.match(/クラス：\S+/g) || []).join(',') + ')');
    check((t.match(/クラス：/g) || []).length === 3, 'B1 the fighter without a class shows no class line');
    check(await noOverflow(page), 'B1 no overflow (' + (await widest(page)).join('/') + ')');
    check(!/09012345678|test@example|架空連絡先/.test(await page.locator('main').innerText()), 'B1 no applicant contact data (the apply form\'s phone / mail / contact name) appears on the roster screen');
    // bouts: A vs B warns, A vs A and A vs none do not
    const n0 = await addBout(page, 'F01', 'F02');
    await settle(150);
    const warn = page.getByText('クラスがちがいます', { exact: false });
    check((await warn.count()) >= 1, 'B1 A vs B shows the red cross-class warning');
    const w = page.locator('[role=status]', { hasText: 'クラスがちがいます' }).first();
    if (await w.count()) {
      const s = await styleOf(w);
      const txt = await w.innerText();
      check(isReddish(s.fg) || isReddish(s.border), 'B1 warning is RED (fg ' + s.fg + ' border ' + s.border + ')');
      check(contrast(s.fg, s.bg) >= 4.5, 'B1 warning text >= 4.5:1 (' + contrast(s.fg, s.bg).toFixed(2) + ')');
      check(/⚠/.test(txt) && txt.includes('赤はAクラス') && txt.includes('青はBクラス') && txt.includes('ルール'), 'B1 warning has ⚠ and names red/blue classes with the reason (' + short(txt, 100) + ')');
      check(s.size >= 17 && s.weight >= 600, 'B1 warning is bold and >= 17px (' + s.size + 'px, ' + s.weight + ')');
    }
    const head = await page.locator('article[id^="bout-"]').nth(n0).innerText();
    note('bout card text: ' + short(head, 140));
    // the header line of the bout list carries a word as well
    check((await bodyText(page)).includes('⚠ クラスがちがいます'), 'B1 the bout summary line carries ⚠ クラスがちがいます too (same words as the card)');
    const weak1 = await weakText(page, 'クラス');
    check(weak1.length === 0, 'B1 every piece of text that mentions クラス on the roster/bout screen is >= 17px and >= 4.5:1 (' + short(weak1.join(' | '), 240) + ')');
    // swap blue to F04 (A) -> warning disappears
    await page.locator('#bout-' + n0 + '-blue').selectOption('F04');
    await settle(150);
    check((await page.locator('[role=status]', { hasText: 'クラスがちがいます' }).count()) === 0, 'B1 A vs A: no warning');
    await page.locator('#bout-' + n0 + '-blue').selectOption('F03');
    await settle(150);
    check((await page.locator('[role=status]', { hasText: 'クラスがちがいます' }).count()) === 0, 'B1 A vs (no class): no warning (nothing to compare)');
    await page.locator('#bout-' + n0 + '-red').selectOption('F02');
    await page.locator('#bout-' + n0 + '-blue').selectOption('F01');
    await settle(150);
    check((await page.locator('[role=status]', { hasText: 'クラスがちがいます' }).count()) >= 1, 'B1 B vs A (swapped) also warns');
    check(await noOverflow(page), 'B1 no overflow with the warning');
    // the bout never blocks saving: save and read back
    await pressSave(page);
    await page.waitForFunction(() => document.querySelector('#save-state')?.innerText.includes('保存済み'), null, { timeout: 8000 }).catch(() => {});
    const saved = await idbGet(page, id);
    check(saved && saved.fighters.filter((f) => f.fighterClass === 'Aクラス').length === 2 && saved.fighters.filter((f) => f.fighterClass === 'Bクラス').length === 1, 'B1 saved data keeps the classes');
    check(saved && saved.fighters.find((f) => f.id === 'F03') && !('fighterClass' in saved.fighters.find((f) => f.id === 'F03')), 'B1 a fighter without a class has no fighterClass key (old shape)');
    check(saved && saved.bouts.length === 1, 'B1 the cross-class bout saved (warning never blocks)');
    await page.reload();
    await page.locator('#field-title').waitFor();
    await page.waitForFunction(() => /クラス：Aクラス/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
    const afterReload = (await page.locator('article[id^="fighter-"]').allInnerTexts()).join('\n');
    check((afterReload.match(/クラス：Aクラス/g) || []).length === 2 && (afterReload.match(/クラス：Bクラス/g) || []).length === 1, 'B1 classes survive a reload (fighter cards: ' + (afterReload.match(/クラス：\S+/g) || []).join(',') + ')');
    const boutAfter = await page.locator('article[id^="bout-"]').first().innerText();
    check(/クラス：Bクラス/.test(boutAfter) && /クラス：Aクラス/.test(boutAfter), 'B1 the bout card shows the class word of both corners (' + short(boutAfter.match(/クラス：\S+/g) ?? [], 60) + ')');
    check((await boutCount(page)) === 1 && (await page.locator('[role=status]', { hasText: 'クラスがちがいます' }).count()) >= 1, 'B1 the cross-class warning is still there after a reload');
    await ctx.close();
  }
  /* B2 CSV without クラス: unchanged */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'cls-b2-' + tag;
    const page = await openPrivate(ctx, id);
    await importCsv(page, csvPlain);
    await waitNotice(page, '4人分を読み込みました');
    const t = await bodyText(page);
    check(!/クラス：/.test(t), 'B2 no class lines when the CSV has no クラス column');
    await addBout(page, 'F01', 'F02');
    await settle(150);
    check((await page.locator('[role=status]', { hasText: 'クラスがちがいます' }).count()) === 0, 'B2 no class warning without classes');
    check(!/⚠ クラスがちがいます/.test(await bodyText(page)), 'B2 no class word in the bout line');
    check(await noOverflow(page), 'B2 no overflow');
    await pressSave(page);
    await page.waitForFunction(() => document.querySelector('#save-state')?.innerText.includes('保存済み'), null, { timeout: 8000 }).catch(() => {});
    const saved = await idbGet(page, id);
    check(saved && saved.fighters.length === 4 && saved.fighters.every((f) => !('fighterClass' in f)), 'B2 old-shaped fighters stay old-shaped (no fighterClass keys)');
    await ctx.close();
  }
  /* B3 a class column that exists but is empty everywhere, and an English header */
  {
    const ctx = await newCtx(vp.mobile);
    const page = await openPrivate(ctx, 'cls-b3-' + tag);
    const csv = [HEAD_CLS, rowOf('F01', '赤', '5勝', ''), rowOf('F02', '青', '初試合', '')].join('\n');
    await importCsv(page, csv);
    await waitNotice(page, '2人分を読み込みました');
    check(!/クラス：/.test(await bodyText(page)), 'B3 an empty クラス column is the same as none');
    await ctx.close();
    const ctx3 = await newCtx(vp.mobile);
    const p3 = await openPrivate(ctx3, 'cls-b3e-' + tag);
    await importCsv(p3, ['管理番号,ジム名,選手名,身長,体重,戦績,class', 'F01,架空ジム,架空英語見出し,170,60,5勝,Aクラス'].join('\n'));
    await waitNotice(p3, '1人分を読み込みました');
    check(/クラス：Aクラス/.test(await bodyText(p3)), 'B3 an English "class" header is read too');
    await ctx.close();
  }
  /* B4 old backup (pre-change shape) restores; new shape restores; real backup file carries the class */
  {
    const pw = 'class-test-pass-1';
    const ctx = await newCtx(vp.mobile);
    const id = 'cls-b4-' + tag;
    const oldShape = { schema: 1, eventId: id, title: '古いコピーの大会', venue: '架空', date: '2026年1月1日', updatedAt: Date.now() - 1000, currentBout: 0, fighters: [F('F01', { name: '架空古赤', gym: 'G' }), F('F02', { name: '架空古青', gym: 'G' })], bouts: [bout(0, 'F01', 'F02')] };
    check(!JSON.stringify(oldShape).includes('fighterClass'), 'B4 the old-shape fixture really has no fighterClass');
    const file = nodeBackup(oldShape, pw);
    const page = await openPrivate(ctx, id);
    await openBackup(page);
    await page.locator('#backup-password').fill(pw);
    await page.locator('input[accept=".enc"]').setInputFiles({ name: 'old.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.from(file) });
    const ask = page.getByRole('alertdialog');
    check(await ask.waitFor({ timeout: 8000 }).then(() => true).catch(() => false), 'B4 the restore asks once before it writes');
    await ask.getByRole('button', { name: RESTORE_YES, exact: true }).click();
    await waitNotice(page, '戻しました', 12000).catch(() => {});
    const t = await bodyText(page);
    check(t.includes('戻しました') && t.includes('選手2人'), 'B4 the old backup restores (' + short((t.match(/戻しました[^。]*。[^。]*。/) || [''])[0], 90) + ')');
    const saved = await idbGet(page, id);
    check(saved && saved.fighters.length === 2 && saved.bouts.length === 1 && saved.title === '古いコピーの大会', 'B4 old backup content is intact');
    check(!/クラス：/.test(t) && (await page.locator('[role=status]', { hasText: 'クラスがちがいます' }).count()) === 0, 'B4 no class marks and no warning for an old backup');
    check(await noOverflow(page), 'B4 no overflow');
    // a backup written by the NEW app: download it and open it with the password
    const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await page.locator('#backup-password2').fill(pw);
    await page.locator('#paper-done').check();
    await page.getByRole('button', { name: 'パスワードをつけて、コピーを保存する', exact: true }).click();
    const d = await dl.catch(() => null);
    check(!!d, 'B4 a backup file can still be made after restoring an old one');
    if (d) {
      const plain = nodeOpen(await readFile(await d.path(), 'utf8'), pw);
      check(plain.fighters.length === 2 && plain.fighters.every((f) => !('fighterClass' in f)), 'B4 re-saving an old backup adds no fighterClass key');
    }
    await ctx.close();
    // new-shape backup with classes comes back with its classes
    const ctx2 = await newCtx(vp.mobile);
    const id2 = 'cls-b4n-' + tag;
    const withCls = { ...oldShape, eventId: id2, fighters: [F('F01', { name: '架空新赤', fighterClass: 'Aクラス' }), F('F02', { name: '架空新青', fighterClass: 'Bクラス' })] };
    const p2 = await openPrivate(ctx2, id2);
    await openBackup(p2);
    await p2.locator('#backup-password').fill(pw);
    await p2.locator('input[accept=".enc"]').setInputFiles({ name: 'new.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.from(nodeBackup(withCls, pw)) });
    const ask2 = p2.getByRole('alertdialog');
    await ask2.waitFor({ timeout: 8000 }).catch(() => {});
    await ask2.getByRole('button', { name: RESTORE_YES, exact: true }).click();
    await waitNotice(p2, '戻しました', 12000).catch(() => {});
    const t2 = await bodyText(p2);
    check(/クラス：Aクラス/.test(t2) && /クラス：Bクラス/.test(t2), 'B4 a backup with classes restores with the class words');
    const rs = await idbGet(p2, id2);
    check(rs && rs.fighters.map((f) => f.fighterClass).join() === 'Aクラス,Bクラス', 'B4 the restored record keeps the exact class text');
    check(await noOverflow(p2), 'B4 no overflow after restore');
    await ctx2.close();
  }
  /* B5 a backup with a too-long class is refused plainly and changes nothing */
  {
    const pw = 'class-test-pass-1';
    const ctx = await newCtx(vp.mobile);
    const id = 'cls-b5-' + tag;
    const page = await openPrivate(ctx, id);
    await page.locator('#field-title').fill('変えたくない大会');
    await openBackup(page);
    await page.locator('#backup-password').fill(pw);
    const bad = { schema: 1, eventId: id, title: '長すぎ', venue: '', date: '', updatedAt: Date.now() - 1000, currentBout: 0, fighters: [F('F01', { fighterClass: 'あ'.repeat(200) })], bouts: [] };
    await page.locator('input[accept=".enc"]').setInputFiles({ name: 'bad.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.from(nodeBackup(bad, pw)) });
    await settle(1800);
    const ask = page.getByRole('alertdialog');
    note('B5 a dialog box is open: ' + (await ask.count()) + (await ask.count() ? ' text: ' + short(await ask.innerText(), 90) : ''));
    check((await ask.count()) === 0, 'B5 a backup with a 200-char class never reaches the overwrite question (it is refused first)');
    if (await ask.count()) await ask.getByRole('button', { name: 'やめる（何も変えない）' }).click().catch(() => {});
    await settle(300);
    const t = await bodyText(page);
    const msgB5 = await page.evaluate(() => [...document.querySelectorAll('[role=status],[role=alert]')].map((n) => n.innerText).join(' || '));
    note('B5 visible messages: ' + short(msgB5, 300));
    check(/戻せ|読めません|使えない|ちがう|まちがい|こわれ|形/.test(msgB5) && !msgB5.includes('戻しました'), 'B5 the refusal is visible in plain words (' + short(msgB5, 100) + ')');
    check((await page.locator('#field-title').inputValue()) === '変えたくない大会', 'B5 nothing on the screen changed');
    check(!t.includes('戻しました'), 'B5 a 200-char class inside a backup is not silently accepted (' + short((t.match(/戻せ[^。]*。/) || ['(no refusal text)'])[0], 80) + ')');
    check(await noOverflow(page), 'B5 no overflow');
    check(pageErrors.every((e) => e.scenario !== cur), 'B5 no script error (' + short(pageErrors.filter((e) => e.scenario === cur).map((e) => e.message).join('|'), 100) + ')');
    await ctx.close();
  }
  /* B6 the manual add / edit forms */
  {
    const ctx = await newCtx(vp.mobile);
    const id = 'cls-b6-' + tag;
    const page = await openPrivate(ctx, id);
    // roster WITHOUT classes: the form stays as it was, with one opt-in button
    await importCsv(page, csvPlain);
    await waitNotice(page, '4人分を読み込みました');
    await openFoldsOf(page, '#manual-name');
    check((await page.locator('#manual-fighterClass').count()) === 0, 'B6 a roster without classes: no class box in the add form');
    const optIn = page.getByRole('button', { name: 'クラスも入れる（Aクラス・Bクラス）', exact: true });
    check((await optIn.count()) === 1, 'B6 the add form offers one button クラスも入れる（Aクラス・Bクラス）');
    await optIn.click();
    check((await page.getByText('クラスを入れられます').count()) >= 1, 'B6 pressing it shows a visible ✓ クラスを入れられます');
    const sel = page.locator('#manual-fighterClass');
    check((await sel.count()) === 1, 'B6 the class box is there after the button');
    const opts = await sel.locator('option').allInnerTexts();
    check(opts.join('|') === 'えらばない|Aクラス|Bクラス', 'B6 choices are えらばない / Aクラス / Bクラス (' + opts.join('|') + ')');
    check((await sel.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))) >= 17, 'B6 the class box text is >= 17px');
    for (const [f, v] of [['name', '架空追加クラス選手'], ['gym', '架空追加ジム'], ['height', '170'], ['weight', '65'], ['record', '1勝2敗']]) await page.locator('#manual-' + f).fill(v);
    await sel.selectOption('Bクラス');
    await page.getByRole('button', { name: 'この選手を追加', exact: true }).click();
    await waitNotice(page, '追加しました', 6000).catch(() => {});
    await settle(200);
    const card = page.locator('article[id^="fighter-"]', { hasText: '架空追加クラス選手' });
    check((await card.count()) === 1 && (await card.innerText()).includes('クラス：Bクラス'), 'B6 the added fighter shows クラス：Bクラス');
    // one with えらばない: no key
    for (const [f, v] of [['name', '架空追加無し選手'], ['gym', '架空追加ジム2'], ['height', '170'], ['weight', '65'], ['record', '初試合']]) await page.locator('#manual-' + f).fill(v);
    await sel.selectOption('');
    await page.getByRole('button', { name: 'この選手を追加', exact: true }).click();
    await settle(300);
    await pressSave(page);
    await waitState2(page);
    const saved = await idbGet(page, id);
    const sb = saved && saved.fighters.find((f) => f.name === '架空追加クラス選手'), sn = saved && saved.fighters.find((f) => f.name === '架空追加無し選手');
    check(sb && sb.fighterClass === 'Bクラス', 'B6 the saved record has fighterClass Bクラス');
    check(sn && !('fighterClass' in sn), 'B6 えらばない saves no fighterClass key');
    check(await noOverflow(page), 'B6 no overflow');
    // edit: change the class of an existing fighter from the card
    await openEdit(page, '架空追加クラス選手');
    const esel = page.locator('select[id^="edit-"][id$="-fighterClass"]');
    check((await esel.count()) === 1 && (await esel.inputValue()) === 'Bクラス', 'B6 the edit form starts on the saved class');
    await esel.selectOption('Aクラス');
    await page.getByRole('button', { name: 'この内容で直す', exact: true }).click();
    await settle(300);
    const t = await bodyText(page);
    check(/クラス\s*Bクラス\s*→\s*Aクラス/.test(t), 'B6 the edit note says what changed: クラス Bクラス → Aクラス');
    check((await card.innerText()).includes('クラス：Aクラス'), 'B6 the card now shows Aクラス');
    // edit a fighter whose class is not in the list (hand-edited CSV): it is kept, not wiped
    await ctx.close();
    const ctx2 = await newCtx(vp.mobile);
    const id2 = 'cls-b6x-' + tag;
    const p2 = await openPrivate(ctx2, id2);
    await importCsv(p2, [HEAD_CLS, rowOf('F01', '赤', '5勝', 'Aクラス'), rowOf('F02', '青', '初試合', 'Zクラス')].join('\n'));
    await waitNotice(p2, '2人分を読み込みました');
    await openEdit(p2, '架空青選手');
    const e2 = p2.locator('select[id^="edit-"][id$="-fighterClass"]');
    const o2 = await e2.locator('option').allInnerTexts();
    check((await e2.inputValue()) === 'Zクラス' && o2.includes('Zクラス'), 'B6 an unknown class is kept visible in the edit box (' + o2.join('|') + ')');
    await p2.getByRole('button', { name: 'やめる', exact: true }).click().catch(() => {});
    await ctx2.close();
  }
  /* B7 real round trip through the app: classes -> make the encrypted copy -> a brand-new browser profile -> restore -> same classes and same warning */
  {
    const pw = 'class-test-pass-1';
    const id = 'cls-b7-' + tag;
    const ctx = await newCtx(vp.mobile);
    const page = await openPrivate(ctx, id);
    await importCsv(page, csvCls);
    await waitNotice(page, '4人分を読み込みました');
    await addBout(page, 'F01', 'F02');
    await pressSave(page);
    await waitState2(page);
    await openBackup(page);
    await page.locator('#backup-password').fill(pw);
    await page.locator('#backup-password2').fill(pw);
    await page.locator('#paper-done').check();
    const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await page.getByRole('button', { name: 'パスワードをつけて、コピーを保存する', exact: true }).click();
    const d = await dl;
    check(!!d, 'B7 the encrypted copy file is made');
    let fileText = '';
    if (d) fileText = await readFile(await d.path(), 'utf8');
    await ctx.close();
    if (fileText) {
      const plain = nodeOpen(fileText, pw);
      check(plain.fighters.map((f) => f.fighterClass ?? '').join('|') === 'Aクラス|Bクラス||Aクラス', 'B7 the backup holds the exact classes (' + plain.fighters.map((f) => f.fighterClass ?? '-').join('|') + ')');
      check(plain.schema === 1, 'B7 the backup keeps schema 1 (old apps can still read the shape)');
      check(/^tournament-os-private-1$/.test(JSON.parse(fileText).format), 'B7 the file format name is unchanged');
      const ctx2 = await newCtx(vp.mobile);
      const p2 = await openPrivate(ctx2, id);
      check(!/クラス：/.test(await bodyText(p2)), 'B7 the new browser profile starts empty');
      await openBackup(p2);
      await p2.locator('#backup-password').fill(pw);
      await p2.locator('input[accept=".enc"]').setInputFiles({ name: 'rt.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.from(fileText) });
      const ask = p2.getByRole('alertdialog');
      await ask.waitFor({ timeout: 8000 }).catch(() => {});
      if (await ask.count()) await ask.getByRole('button', { name: RESTORE_YES, exact: true }).click();
      await waitNotice(p2, '戻しました', 12000).catch(() => {});
      await p2.waitForFunction(() => /クラス：Aクラス/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
      const t = await bodyText(p2);
      check((t.match(/クラス：Aクラス/g) || []).length >= 2 && /クラス：Bクラス/.test(t), 'B7 after the restore the cards show the class words');
      check((await p2.locator('[role=status]', { hasText: 'クラスがちがいます' }).count()) >= 1, 'B7 after the restore the red cross-class warning is back');
      const back = await idbGet(p2, id);
      check(back && back.fighters.map((f) => f.fighterClass ?? '').join('|') === 'Aクラス|Bクラス||Aクラス', 'B7 the restored data has the same classes');
      check(await noOverflow(p2), 'B7 no overflow after the round trip');
      await ctx2.close();
    }
  }
  /* B8 importing again: a file WITHOUT the class column never wipes classes; a file WITH it fills only empty ones */
  {
    const id = 'cls-b8-' + tag;
    const ctx = await newCtx(vp.mobile);
    const page = await openPrivate(ctx, id);
    const mk = (withCls) => [withCls ? HEAD_CLS : CSV_HEAD, rowOf('F01', '赤', '5勝', withCls ? 'Aクラス' : undefined), rowOf('F02', '青', '初試合', withCls ? 'Bクラス' : undefined)].join('\n');
    await importCsv(page, mk(false));
    await waitNotice(page, '2人分を読み込みました');
    check(!/クラス：/.test(await bodyText(page)), 'B8 start: no classes');
    await importCsv(page, mk(true));
    await waitNotice(page, 'クラスが空だった2人に、クラスを足しました');
    check(/クラス：Aクラス/.test(await bodyText(page)) && /クラス：Bクラス/.test(await bodyText(page)), 'B8 a later file with classes fills the empty ones');
    await importCsv(page, mk(false));
    await waitNotice(page, 'クラスの列が無いので、今のクラスはそのままです');
    const t = await bodyText(page);
    check(/クラス：Aクラス/.test(t) && /クラス：Bクラス/.test(t), 'B8 a later file WITHOUT the column keeps the classes');
    // a later file with a DIFFERENT class for someone already there must not silently overwrite the chosen one
    await importCsv(page, [HEAD_CLS, rowOf('F01', '赤', '5勝', 'Bクラス'), rowOf('F02', '青', '初試合', 'Aクラス')].join('\n'));
    await settle(800);
    const saved = await bodyText(page);
    const cards = (await page.locator('article[id^="fighter-"]').allInnerTexts()).join('\n');
    note('B8 after a conflicting class file: ' + (cards.match(/クラス：\S+/g) || []).join(','));
    check(/クラス：Aクラス/.test(cards) && /クラス：Bクラス/.test(cards) && (cards.match(/クラス：/g) || []).length === 2, 'B8 a conflicting class never makes two people lose their class (' + (cards.match(/クラス：\S+/g) || []).join(',') + ')');
    check(await noOverflow(page), 'B8 no overflow');
    await ctx.close();
  }
  /* B9 custom class names from the sheet: loose CSV words are read against THEM, the bout warning prints THEIR rules */
  {
    const custom = { enabled: true, upper: { name: '上級', condition: '5勝以上', rule: '肘あり（ひじで打ってよい）' }, lower: { name: '初級', condition: '4勝以下', rule: '肘なし' }, upperMinWins: 5 };
    const id = 'cls-b9-' + tag;
    const ctx = await newCtx(vp.mobile);
    await seed(ctx, tournament(id, { entryConfig: { music: false, grade: 'optional', age: 'optional', comment: 'optional', classes: custom }, fighters: [F('F01', { name: '架空上一', fighterClass: '上級' }), F('F02', { name: '架空初二', fighterClass: '初級' })], bouts: [bout(0, 'F01', 'F02')] }));
    const page = await openPrivate(ctx, id);
    await page.waitForFunction(() => /架空上一/.test(document.body.innerText), null, { timeout: 8000 });
    const w = page.locator('[role=status]', { hasText: 'クラスがちがいます' }).first();
    check((await w.count()) === 1, 'B9 custom names: the cross-class warning shows');
    const wt = (await w.count()) ? await w.innerText() : '';
    check(wt.includes('上級') && wt.includes('初級'), 'B9 the warning uses the sheet\'s class names (' + short(wt, 80) + ')');
    const body = await bodyText(page);
    check(body.includes('上級のルール：肘あり') && body.includes('初級のルール：肘なし'), 'B9 the warning prints each class\'s own short rule (' + short((body.match(/上級のルール[^\n]*/) || [''])[0], 60) + ')');
    check(!body.includes('Aクラス') && !body.includes('Bクラス'), 'B9 default names do not leak when the sheet has its own');
    check(await noOverflow(page), 'B9 no overflow');
    await importCsv(page, [HEAD_CLS, rowOf('F11', '甲', '5勝', '上'), rowOf('F12', '乙', '初試合', '下'), rowOf('F13', '丙', '初試合', ' 初級　'), rowOf('F14', '丁', '2勝', 'Aクラス')].join('\n'));
    await waitNotice(page, '4人分を読み込みました');
    const cards = (await page.locator('article[id^="fighter-"]').allInnerTexts()).join('\n');
    const lines = cards.match(/クラス：\S+/g) || [];
    note('B9 imported class words: ' + lines.join(','));
    check(lines.filter((x) => x === 'クラス：上級').length >= 2 && lines.filter((x) => x === 'クラス：初級').length >= 3, 'B9 上 / 下 / spaces are read as the sheet\'s 上級 / 初級');
    check(lines.includes('クラス：Aクラス'), 'B9 a word that is not in the sheet (Aクラス) is kept as typed, never guessed');
    await ctx.close();
  }
});
const waitState2 = (p) => p.waitForFunction(() => document.querySelector('#save-state')?.innerText.includes('保存済み'), null, { timeout: 8000 }).catch(() => {});
async function openFoldsOf(p, sel) {
  for (let i = 0; i < 6 && !(await p.locator(sel).isVisible().catch(() => false)); i++) {
    const closed = await p.evaluate((s) => { const el = document.querySelector(s); let hit = null; for (let n = el; n; n = n.parentElement) if (n.tagName === 'DETAILS' && !n.open) hit = n; if (!hit) return false; hit.querySelector(':scope > summary').setAttribute('data-open-me', '1'); return true; }, sel);
    if (!closed) break;
    await p.locator('[data-open-me="1"]').first().click();
    await p.evaluate(() => document.querySelectorAll('[data-open-me]').forEach((e) => e.removeAttribute('data-open-me')));
  }
}
async function openEdit(p, name) {
  await p.getByRole('button', { name: '直す ' + name, exact: true }).click();
  await p.locator('select[id^="edit-"][id$="-fighterClass"], input[id^="edit-"][id$="-name"]').first().waitFor();
}

/** C. live screens */
scenario('C', 'live: single + list show the class word on both corners', async (vp) => {
  const tag = vp.mobile ? 'm' : 'd';
  const longCls = 'あ'.repeat(40);
  const fighters = [F('F01', { name: '架空赤一', fighterClass: 'Aクラス' }), F('F02', { name: '架空青二', fighterClass: 'Bクラス' }), F('F03', { name: '架空緑三' }), F('F04', { name: '架空黄四', fighterClass: 'Aクラス' }), F('F05', { name: '架空長五', fighterClass: longCls }), F('F06', { name: '架空桃六', fighterClass: 'Bクラス', photoDataUrl: TINY_JPEG })];
  const mk = (id, red, blue) => tournament(id, { fighters, bouts: [bout(0, red, blue)] });
  const ctx = await newCtx(vp.mobile);
  const cases = [
    ['ab', 'F01', 'F02', { red: 'Aクラス', blue: 'Bクラス', warn: true }],
    ['aa', 'F01', 'F04', { red: 'Aクラス', blue: 'Aクラス', warn: false }],
    ['an', 'F01', 'F03', { red: 'Aクラス', blue: '', warn: false }],
    ['na', 'F03', 'F04', { red: '', blue: 'Aクラス', warn: false }],
    ['nn', 'F03', 'F03x', { red: '', blue: '', warn: false }],
    ['lg', 'F05', 'F06', { red: longCls, blue: 'Bクラス', warn: true }],
  ];
  for (const [k, r, b, want] of cases) await seed(ctx, mk('cls-c-' + k + '-' + tag, r, b === 'F03x' ? '' : b));
  for (const [k, , , want] of cases) {
    const id = 'cls-c-' + k + '-' + tag;
    /* single */
    const s = await openLive(ctx, id, false);
    const side = (txt) => s.evaluate((txt) => {
      // find the chip whose own text is exactly txt and report which corner (赤/青) it sits in
      const chips = [...document.querySelectorAll('main span, main p')].filter((e) => e.children.length === 0 && e.textContent.trim() === txt);
      return chips.map((chip) => { for (let n = chip; n && n !== document.body; n = n.parentElement) { const t = n.innerText || ''; const r = t.includes('赤コーナー'), b = t.includes('青コーナー'); if (r !== b) return r ? 'red' : 'blue'; } return '?'; });
    }, txt);
    const st = await bodyText(s);
    if (want.red) { const sd = await side(want.red); check(sd.includes('red'), 'C single [' + k + '] red corner shows ' + short(want.red, 12)); }
    if (want.blue) { const sd = await side(want.blue); check(sd.includes('blue'), 'C single [' + k + '] blue corner shows ' + short(want.blue, 12)); }
    if (!want.red && !want.blue) check(!/[AB]クラス/.test(st), 'C single [' + k + '] no class words when neither fighter has one');
    const wn = await s.locator('[role=status]', { hasText: 'クラスがちがう' }).count();
    check(want.warn ? wn >= 1 : wn === 0, 'C single [' + k + '] cross-class warning ' + (want.warn ? 'shown' : 'absent') + ' (' + wn + ')');
    if (want.warn && wn) {
      const ws = await styleOf(s.locator('[role=status]', { hasText: 'クラスがちがう' }).first());
      check(isReddish(ws.fg) || isReddish(ws.border), 'C single [' + k + '] warning is red');
      check(contrast(ws.fg, ws.bg) >= 4.5, 'C single [' + k + '] warning contrast >= 4.5 (' + contrast(ws.fg, ws.bg).toFixed(2) + ')');
    }
    check(await noOverflow(s), 'C single [' + k + '] no overflow (' + (await widest(s)).join('/') + ')');
    check(st.includes('赤コーナー') && st.includes('青コーナー') && /架空/.test(st), 'C single [' + k + '] corner words and names still shown');
    // chip text size
    const chipEl = s.locator('main span.rounded-full', { hasText: want.red || want.blue || '@@none@@' }).first();
    if (want.red || want.blue) { if (await chipEl.count()) { const cs = await styleOf(chipEl); check(cs.size >= 17, 'C single [' + k + '] class chip >= 17px (' + cs.size + ')'); check(contrast(cs.fg, cs.bg) >= 4.5, 'C single [' + k + '] class chip contrast (' + contrast(cs.fg, cs.bg).toFixed(2) + ')'); } else check(false, 'C single [' + k + '] class chip element found'); }
    await s.close();
    /* list */
    const l = await openLive(ctx, id, true);
    const lt = await bodyText(l);
    const groups = await l.evaluate(() => [...document.querySelectorAll('[role=group][aria-label]')].map((g) => g.getAttribute('aria-label')));
    if (want.red) check(groups.some((g) => g.startsWith('赤コーナー') && g.includes(want.red)), 'C list [' + k + '] red group label has ' + short(want.red, 12) + ' (' + short(groups.join('|'), 120) + ')');
    if (want.blue) check(groups.some((g) => g.startsWith('青コーナー') && g.includes(want.blue)), 'C list [' + k + '] blue group label has ' + short(want.blue, 12));
    if (want.red) check(lt.includes(want.red), 'C list [' + k + '] class word is visible in the row');
    if (!want.red && !want.blue) check(!/[AB]クラス/.test(lt), 'C list [' + k + '] no class words when none');
    const lw = await l.getByText('クラスがちがう', { exact: false }).count();
    check(want.warn ? lw >= 1 : lw === 0, 'C list [' + k + '] クラスがちがう ' + (want.warn ? 'shown' : 'absent') + ' (' + lw + ')');
    if (want.warn && lw) {
      const ws = await styleOf(l.getByText('クラスがちがう').first());
      check(isReddish(ws.fg) || isReddish(ws.border), 'C list [' + k + '] list warning is red');
      check(contrast(ws.fg, ws.bg) >= 4.5 && ws.size >= 17, 'C list [' + k + '] list warning >= 4.5:1 and >= 17px (' + contrast(ws.fg, ws.bg).toFixed(2) + ', ' + ws.size + 'px)');
    }
    check(await noOverflow(l), 'C list [' + k + '] no overflow (' + (await widest(l)).join('/') + ')');
    check(/架空/.test(lt) && lt.includes('赤コーナー') && lt.includes('青コーナー'), 'C list [' + k + '] names and corner words intact');
    // both corners of one row sit side by side or stacked with names visible
    const names = await l.evaluate(() => [...document.querySelectorAll('[role=group][aria-label]')].map((g) => { const r = g.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.width)]; }));
    check(names.every(([a, b]) => a >= -1 && b <= window_w(vp) + 1), 'C list [' + k + '] corner boxes stay inside the screen (' + JSON.stringify(names) + ')');
    await l.close();
  }
  await ctx.close();
});
const window_w = (vp) => (vp.mobile ? 390 : 1280);

/** D. mistake cases */
scenario('D', 'mistakes: injection, unknown class, 200 chars, full-width spaces', async (vp) => {
  const tag = vp.mobile ? 'm' : 'd';
  const long200 = 'い'.repeat(200);
  const evil = [
    ['F01', '=HYPERLINK("http://evil.example/","押す")'],
    ['F02', '<script>window.__xss=1</script>'],
    ['F03', 'Cクラス'],
    ['F04', long200],
    ['F05', '　Ａクラス　'],
    ['F06', 'Aクラス'],
    ['F07', '<img src=x onerror="window.__xss=2">'],
    ['F08', '@SUM(1+1)'],
    ['F09', '+1-1'],
    ['F10', 'A\nクラス\tX'],
    ['F11', '‮Bクラス'],
  ];
  const csv = [HEAD_CLS, ...evil.map(([id, c], i) => rowOf(id, String(i + 1), '初試合', c))].join('\n');
  const ctx = await newCtx(vp.mobile);
  await ctx.addInitScript(() => { window.__xss = 0; });
  const id = 'cls-d-' + tag;
  const page = await openPrivate(ctx, id);
  await importCsv(page, csv);
  await waitNotice(page, evil.length + '人分を読み込みました');
  check((await page.evaluate(() => window.__xss)) === 0, 'D no script ran from a class value');
  check(dialogs.filter((x) => x.scenario === cur).length === 0, 'D no dialog appeared');
  check((await page.locator('main img[src="x"], main script').count()) === 0, 'D class text is shown as text, not as an element');
  const t = await bodyText(page);
  check(t.includes('=HYPERLINK("http://evil.example/","押す")') || t.includes('HYPERLINK'), 'D formula text is displayed literally as text');
  check(t.includes('<script>window.__xss=1</script>') || t.includes('window.__xss=1'), 'D <script> text is displayed literally');
  const lines = (t.match(/クラス：[^\n]*/g) || []);
  note('class lines: ' + lines.map((x) => short(x, 40)).join(' || '));
  check(lines.every((x) => x.replace('クラス：', '').length <= 40), 'D every shown class is <= 40 chars (longest ' + Math.max(...lines.map((x) => x.replace('クラス：', '').length)) + ')');
  check(lines.some((x) => x.replace('クラス：', '') === 'い'.repeat(40)), 'D the 200-char class is cut to 40, not rejected or kept whole');
  // 取り込みのとき、設定の名前にそろえる（全角の「Ａクラス」＋前後の全角空白 → 「Aクラス」）。F05 と F06 で「クラス：Aクラス」が2つになる
  check(lines.filter((x) => x.trim() === 'クラス：Aクラス').length >= 2 && !lines.some((x) => /Ａ/.test(x)), 'D full-width Ａクラス (with full-width spaces) is trimmed AND written as the setting\'s name Aクラス (' + short(lines.filter((x) => /Ａ|^クラス：Aクラス$/.test(x.trim())).join('|'), 60) + ')');
  check(lines.some((x) => /^クラス：Cクラス$/.test(x.trim())), 'D a class that is not in the A/B list is kept as typed (the OS has no list to check)');
  check(!lines.some((x) => /[\u202a-\u202e\u2066-\u2069\u200b-\u200f]/.test(x)), 'D bidi / zero-width control characters in a class are removed (cannot flip or hide the text on the cards)');
  check(!lines.some((x) => /[\n\t]/.test(x)), 'D tabs/newlines in a class are flattened');
  check(await noOverflow(page), 'D no overflow with hostile classes (' + (await widest(page)).join('/') + '; wide: ' + (await wideOnes(page)).join(' | ') + ')');
  // bouts
  const n0 = await addBout(page, 'F05', 'F06');
  await settle(150);
  check((await page.locator('[role=status]', { hasText: 'クラスがちがいます' }).count()) === 0, 'D full-width Ａクラス vs Aクラス is the SAME class: no false warning');
  await page.locator('#bout-' + n0 + '-blue').selectOption('F03');
  await settle(150);
  check((await page.locator('[role=status]', { hasText: 'クラスがちがいます' }).count()) >= 1, 'D Aクラス vs Cクラス warns');
  await page.locator('#bout-' + n0 + '-red').selectOption('F02');
  await page.locator('#bout-' + n0 + '-blue').selectOption('F04');
  await settle(200);
  const w = page.locator('[role=status]', { hasText: 'クラスがちがいます' }).first();
  if (await w.count()) {
    const wt = await w.innerText();
    check(wt.includes('<script>') && (await page.evaluate(() => window.__xss)) === 0, 'D the warning prints the hostile class as plain text only');
    const wb = await w.boundingBox();
    check(wb && wb.x >= -1 && wb.x + wb.width <= window_w(vp) + 1, 'D the warning itself, with a long hostile class, stays inside the screen (x ' + Math.round(wb?.x ?? -1) + ' w ' + Math.round(wb?.width ?? -1) + ')');
  } else check(false, 'D warning appears for <script> vs 200-char class');
  // options in the dropdown
  const opts = await page.locator('#bout-' + n0 + '-red option').allInnerTexts();
  check(opts.every((o) => o.length < 400), 'D the dropdown options stay a sane length (max ' + Math.max(...opts.map((o) => o.length)) + ')');
  // saving then live views with the hostile data
  await pressSave(page);
  await page.waitForFunction(() => document.querySelector('#save-state')?.innerText.includes('保存済み'), null, { timeout: 8000 }).catch(() => {});
  const saved = await idbGet(page, id);
  check(saved && saved.fighters.length === evil.length, 'D hostile roster saved (' + (saved ? saved.fighters.length : 0) + ')');
  check(saved && saved.fighters.every((f) => (f.fighterClass ?? '').length <= 40), 'D nothing over 40 chars was stored');
  for (const list of [false, true]) {
    const live = await openLive(ctx, id, list);
    check((await live.evaluate(() => window.__xss)) === 0, 'D live ' + (list ? 'list' : 'single') + ': no script ran');
    check(await noOverflow(live), 'D live ' + (list ? 'list' : 'single') + ': no overflow (' + (await widest(live)).join('/') + ')');
    await live.close();
  }
  // bad class text in a hand-built tournament that bypassed the CSV cleaner: stored classes are only text
  const raw = tournament('cls-d2-' + tag, { fighters: [F('F01', { fighterClass: '<b>太字</b>' }), F('F02', { fighterClass: 'Bクラス' })], bouts: [bout(0, 'F01', 'F02')] });
  await seed(ctx, raw);
  for (const list of [false, true]) {
    const live = await openLive(ctx, 'cls-d2-' + tag, list);
    check((await live.locator('main b').count()) === 0 || (await live.locator('main b', { hasText: '太字' }).count()) === 0, 'D live ' + (list ? 'list' : 'single') + ': <b> in a class is not rendered as markup');
    await live.close();
  }
  await ctx.close();
  // apply side: hostile class names in the hash
  {
    const ctx2 = await newCtx(vp.mobile);
    await ctx2.addInitScript(() => { window.__xss = 0; });
    const hostile = { enabled: true, upper: { name: '<script>w', condition: '<img src=x onerror="window.__xss=3">', rule: '=HYPERLINK("x")' }, lower: { name: '　Ｂ　', condition: 'あ'.repeat(60), rule: 'い'.repeat(80) }, upperMinWins: 3 };
    const page2 = await openApply(ctx2, hashWith(hostile));
    check((await page2.evaluate(() => window.__xss)) === 0, 'D apply: hostile class texts in the link run no script');
    check((await CLS(page2).locator('img').count()) === 0, 'D apply: hostile class text is plain text');
    check((await CLS(page2).count()) === 1, 'D apply: the class box still shows');
    check(await noOverflow(page2), 'D apply: max-length class texts do not overflow (' + (await widest(page2)).join('/') + ')');
    const t2 = await CLS(page2).innerText();
    check(t2.includes('<img src=x') && t2.includes('<script>w'), 'D apply: texts shown literally');
    await ctx2.close();
    // over-long values in a hand-edited link are cut, not trusted
    const ctx3 = await newCtx(vp.mobile);
    const page3 = await ctx3.newPage();
    await page3.goto(base + '/apply/' + hashOn() + '&cuN=' + encodeURIComponent('あ'.repeat(200)) + '&cuC=' + encodeURIComponent('い'.repeat(500)) + '&cuR=' + encodeURIComponent('う'.repeat(500)));
    await page3.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
    const t3 = CLS(page3);
    if (await t3.count()) {
      const tx = await t3.innerText();
      check(!tx.includes('あ'.repeat(13)) && !tx.includes('い'.repeat(61)) && !tx.includes('う'.repeat(81)), 'D apply: over-long link texts are cut to 12/60/80 (' + short(tx, 60) + ')');
    } else note('over-long link: class box hidden (fail-closed)');
    check(await noOverflow(page3), 'D apply: over-long link does not overflow');
    await ctx3.close();
  }
});

/** F. the gym-side entry sheet /private/entry/ (builds the ZIP the chairman imports) */
scenario('F', 'entry sheet /private/entry/: class choice, hints, ZIP', async (vp) => {
  const d = DEFAULT_CLASS_SETTINGS;
  const url = (cs) => base + '/private/entry/?' + new URLSearchParams({ music: 'off', grade: 'optional', age: 'optional', comment: 'optional', ...(cs ? { cs: JSON.stringify(cs) } : {}) }).toString();
  const open = async (ctx, cs) => { const p = await ctx.newPage(); await p.goto(url(cs)); await p.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 }); return p; };
  const box = (p) => p.locator('fieldset', { hasText: 'クラス 必須' });
  const fillBasic = async (p, rec) => {
    for (const [l, v] of [['ジム名 必須', '架空ジム'], ['選手名 必須', '架空エントリー選手'], ['身長（cm）必須', '170'], ['体重（kg）必須', '65'], ['戦績・競技歴 必須', rec]]) await p.getByLabel(l, { exact: true }).fill(v);
    const jpeg = Buffer.from(await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 120, 160); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
    await p.locator('input[type=file]').setInputFiles({ name: 'f.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await p.waitForFunction(() => document.body.innerText.includes('写真') , null, { timeout: 5000 }).catch(() => {});
    await settle(300);
  };
  /* F1 without classes: nothing about classes */
  {
    const ctx = await newCtx(vp.mobile);
    const p = await open(ctx, null);
    check((await box(p).count()) === 0 && !(await bodyText(p)).includes('クラス'), 'F1 no class box and no word クラス when the link carries no classes');
    await ctx.close();
  }
  /* F2 with classes: both choices with condition + rule, big, readable */
  {
    const ctx = await newCtx(vp.mobile);
    const p = await open(ctx, d);
    const b = box(p);
    check((await b.count()) === 1, 'F2 the class box is on the entry sheet');
    const t = await b.innerText();
    check(t.includes(d.upper.name) && t.includes(d.upper.condition) && t.includes(d.upper.rule) && t.includes(d.lower.name) && t.includes(d.lower.condition) && t.includes(d.lower.rule), 'F2 both classes show name + condition + rule');
    check((await b.locator('input[type=radio]:checked').count()) === 0, 'F2 nothing is pre-chosen');
    const weak = await weakText(p, /./, 'fieldset');
    check(weak.length === 0, 'F2 every text in the class box is >= 17px and >= 4.5:1 (' + short(weak.join(' | '), 260) + ')');
    for (const side of [d.upper, d.lower]) {
      const lab = b.locator('label', { hasText: side.name }).first();
      const bb = await lab.boundingBox();
      check(bb && bb.height >= 56, 'F2 ' + side.name + ' is a large tap target (' + (bb ? Math.round(bb.height) : '-') + 'px high)');
    }
    check(await noOverflow(p), 'F2 no overflow (' + (await widest(p)).join('/') + ')');
    await ctx.close();
  }
  /* F3 required: add without a class -> plain message, nothing added; suggestion + gentle red line, never blocks */
  {
    const ctx = await newCtx(vp.mobile);
    const p = await open(ctx, d);
    await fillBasic(p, '2勝1敗');
    const yel = box(p).locator('p', { hasText: '戦績からは、' });
    check((await yel.count()) === 1 && (await yel.innerText()).includes(d.lower.name), 'F3 the suggestion names ' + d.lower.name + ' for 2勝1敗');
    if (await yel.count()) {
      const ys = await styleOf(yel);
      check(isYellowish(ys.bg) || isYellowish(ys.border), 'F3 the suggestion is YELLOW (bg ' + ys.bg + ' border ' + ys.border + ')');
      check(contrast(ys.fg, ys.bg) >= 4.5, 'F3 suggestion contrast >= 4.5:1 (' + contrast(ys.fg, ys.bg).toFixed(2) + ')');
      check(ys.size >= 17, 'F3 suggestion text >= 17px (' + ys.size + 'px)');
    }
    await p.getByRole('button', { name: 'この選手を追加', exact: true }).click();
    await settle(200);
    const msg = await p.locator('[role=status]').first().innerText().catch(() => '');
    check(/クラスを選んでください/.test(msg), 'F3 adding without a class says クラスを選んでください (' + short(msg, 80) + ')');
    check(!(await bodyText(p)).includes('現在 1人'), 'F3 nobody was added without a class');
    await box(p).locator('input[value=' + JSON.stringify(d.upper.name) + ']').check();
    await settle(150);
    const red = box(p).locator('[role=status]', { hasText: '戦績と合っていますか？' });
    check((await red.count()) === 1, 'F3 choosing the other class shows the gentle red line');
    if (await red.count()) {
      const rs = await styleOf(red);
      check(isReddish(rs.fg) || isReddish(rs.border), 'F3 red line is RED (fg ' + rs.fg + ' border ' + rs.border + ')');
      check(contrast(rs.fg, rs.bg) >= 4.5, 'F3 red line contrast >= 4.5:1 (' + contrast(rs.fg, rs.bg).toFixed(2) + ')');
      check(/⚠/.test(await red.innerText()), 'F3 red line carries a ⚠ mark and words, not colour alone');
      check(rs.size >= 17, 'F3 red line text >= 17px (' + rs.size + 'px)');
    }
    await p.getByRole('button', { name: 'この選手を追加', exact: true }).click();
    await settle(300);
    check((await bodyText(p)).includes('現在 1人'), 'F3 the mismatch does NOT block adding');
    // download the ZIP, read the CSV, and feed it to the roster screen
    const dl = p.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await p.getByRole('button', { name: '📥 提出ファイルを保存する', exact: true }).click();
    const dd = await dl.catch(() => null);
    check(!!dd, 'F3 the ZIP is saved');
    if (dd) {
      const { unzipSync, strFromU8 } = await import('fflate');
      const files = unzipSync(new Uint8Array(await readFile(await dd.path())));
      const names = Object.keys(files);
      check(names.includes('players.csv') && names.some((n) => n.startsWith('photos/')), 'F3 ZIP still has players.csv + photos/ (' + names.join(',') + ')');
      const csv = strFromU8(files['players.csv']);
      const head = csv.replace(/^﻿/, '').split(/\r?\n/)[0];
      check(head.endsWith(',"クラス"') && head.split(',').length === 11, 'F3 CSV gets one extra last column クラス (' + head.slice(-30) + ')');
      check(csv.includes('"' + d.upper.name + '"'), 'F3 the chosen class is in the CSV');
      const ctx2 = await newCtx(vp.mobile);
      const p2 = await openPrivate(ctx2, 'cls-f3-' + (vp.mobile ? 'm' : 'd'));
      await importCsv(p2, csv);
      await waitNotice(p2, '1人分を読み込みました');
      check(/クラス：Aクラス/.test(await bodyText(p2)), 'F3 the ZIP\'s CSV imports with the class');
      await ctx2.close();
    }
    await ctx.close();
  }
  /* F4 old link (no cs): ZIP header is the old 10 columns */
  {
    const ctx = await newCtx(vp.mobile);
    const p = await open(ctx, null);
    await fillBasic(p, '初試合');
    await p.getByRole('button', { name: 'この選手を追加', exact: true }).click();
    await settle(300);
    const dl = p.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await p.getByRole('button', { name: '📥 提出ファイルを保存する', exact: true }).click();
    const dd = await dl.catch(() => null);
    if (dd) {
      const { unzipSync, strFromU8 } = await import('fflate');
      const files = unzipSync(new Uint8Array(await readFile(await dd.path())));
      const head = strFromU8(files['players.csv']).replace(/^﻿/, '').split(/\r?\n/)[0];
      check(head.split(',').length === 10 && !head.includes('クラス'), 'F4 without classes the CSV keeps its old 10 columns');
    } else check(false, 'F4 ZIP saved');
    await ctx.close();
  }
  /* F5 hostile cs values are refused, never run */
  {
    const ctx = await newCtx(vp.mobile);
    await ctx.addInitScript(() => { window.__xss = 0; });
    const hostile = { enabled: true, upper: { name: '<img src=x onerror="window.__xss=9">', condition: 'あ', rule: 'い' }, lower: { name: 'B', condition: 'う', rule: 'え' }, upperMinWins: 3 };
    const p = await open(ctx, hostile);
    check((await p.evaluate(() => window.__xss)) === 0 && (await box(p).locator('img').count()) === 0, 'F5 markup in a class name is shown as text only');
    check(await noOverflow(p), 'F5 no overflow');
    await ctx.close();
    const ctx2 = await newCtx(vp.mobile);
    const p2 = await ctx2.newPage();
    await p2.goto(base + '/private/entry/?cs=' + encodeURIComponent('{"enabled":true,"upper":{"name":"同","condition":"a","rule":"b"},"lower":{"name":"同","condition":"a","rule":"b"},"upperMinWins":3}'));
    await p2.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
    check((await box(p2).count()) === 0, 'F5 a broken cs (same names) shows no class box rather than a half-working one');
    await ctx2.close();
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
  const allowed = new Set(['protocol', 'entryKey', 'mode', 'website', 'eventId', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'fighterClass', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'photoDataUrl']);
  check(posts.length > 0 && posts.every((p) => [...p.fields.keys()].every((k) => allowed.has(k))), 'E every posted field is a known one (' + posts.length + ' posts)');
  check(posts.every((p) => ['', 'upper', 'lower'].includes(p.fields.get('fighterClass') ?? '')), 'E fighterClass is only upper / lower / empty (no free text goes out)');
  check(pageErrors.length === 0, 'E no uncaught page errors in the whole run (' + short(pageErrors.slice(0, 3).map((e) => '[' + e.scenario + '] ' + e.message).join(' | '), 200) + ')');
  check(dialogs.length === 0, 'E no browser dialogs');
});

/* ───────────────────────── run ───────────────────────── */
const VPS = [{ name: '1280', mobile: false }, { name: '390', mobile: true }];
try {
  for (const s of SCENARIOS) {
    if (ONLY.length && !ONLY.includes(s.id)) continue;
    for (const vp of VPS) {
      cur = s.id + '@' + vp.name;
      curW = vp.mobile ? 390 : 1280;
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
