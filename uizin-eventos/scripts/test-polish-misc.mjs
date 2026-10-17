/**
 * Regression checks for the POLISH round, area "misc": the built CSS (no @layer: Safari 15.0-15.3), the first screen
 * (light colours, no black flash, a reason when JavaScript is off or the page cannot start), no search engines + no favicon 404,
 * the safety headers file, and the release gate run on the real built folder.
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation. All data is fake.
 * Drives the REAL built pages (npm run build:private -> out-private-pages).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4992 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-polish-misc.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Or all suites at once: npm run verify:all
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4992), TOS_ONLY=M1,M2 (scenario ids), TOS_CHROME_PATH.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicEntryHash } from '../core/publicEntry.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4992';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

/* ───────────────────────── bookkeeping ───────────────────────── */
let checks = 0, cur = '-';
const failures = [], net = [], externals = [], pageErrors = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 160) => String(s).replace(/\s+/g, ' ').slice(0, n);

/** Every screen of the app. /apply/ has no event id; the others get a fake one. */
const SCREENS = [
  ['/private/?event=misc-a', '準備'],
  ['/private/setup/?event=misc-a', '受付をつくる'],
  ['/private/live/?event=misc-a', '当日'],
  ['/private/entry/?event=misc-a', '入力'],
  ['/apply/', '申込'],
];
const LIGHT_BG = 'rgb(238, 242, 248)';

async function newCtx(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
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

const scenarios = [];
const scenario = (id, name, fn) => scenarios.push({ id, name, fn });

/* ───────────────────────── M1 (r1-128): no @layer in the built CSS ───────────────────────── */
scenario('M1', 'the built CSS has no @layer (Safari 15.0-15.3 drops @layer blocks, and the whole layout with them)', async () => {
  const ctx = await newCtx();
  for (const [path, label] of SCREENS) {
    const page = await ctx.newPage();
    await page.goto(base + path);
    await settle(400);
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href));
    check(hrefs.length >= 1, label + ': the page links its CSS (' + hrefs.length + ')');
    for (const href of hrefs) {
      const css = await (await page.request.get(href)).text();
      check(!/@layer\b/.test(css), label + ': the CSS file has no @layer (' + href.split('/').pop() + ', ' + css.length + ' bytes)');
      check(css.length > 20000, label + ': the CSS file is the full stylesheet, not an empty one (' + css.length + ')');
    }
    const layerRules = await page.evaluate(() => [...document.styleSheets].reduce((n, sheet) => { try { return n + [...sheet.cssRules].filter((r) => r.constructor.name === 'CSSLayerBlockRule' || r.constructor.name === 'CSSLayerStatementRule').length; } catch { return n; } }, 0));
    check(layerRules === 0, label + ': the browser sees 0 layer rules (' + layerRules + ')');
    await page.close();
  }
  await ctx.close();
});

/* ───────────────────────── M2 (r1-128): the cascade is the same as before ───────────────────────── */
scenario('M2', 'the look is unchanged without @layer: hand-written rules still beat Tailwind variants; utilities still apply', async () => {
  const ctx = await newCtx();
  for (const [path, label] of [SCREENS[0], SCREENS.find(([p]) => p === '/apply/')]) {
    const page = await ctx.newPage();
    await page.goto(base + path);
    await settle(800);
    const r = await page.evaluate(() => {
      const host = document.body;
      const mk = (html) => { const d = document.createElement('div'); d.innerHTML = html; host.appendChild(d); return d.firstElementChild; };
      // A locked button: Tailwind's aria-disabled variant (stronger by selector) must NOT beat the hand-written .tos-locked.
      const locked = mk('<button type="button" aria-disabled="true" class="aria-disabled:border-slate-600 aria-disabled:bg-slate-100 aria-disabled:text-slate-700 bg-white text-slate-900 tos-locked">x</button>');
      const next = mk('<div class="tos-next bg-white text-slate-900 p-0">x</div>');
      const util = mk('<div class="px-4 flex">x</div>');
      const out = {
        lockedColor: getComputedStyle(locked).color, lockedBg: getComputedStyle(locked).backgroundColor, lockedBorder: getComputedStyle(locked).borderTopStyle,
        nextBg: getComputedStyle(next).backgroundColor, nextBorderColor: getComputedStyle(next).borderTopColor,
        pad: getComputedStyle(util).paddingLeft, display: getComputedStyle(util).display,
      };
      locked.parentElement.remove(); next.parentElement.remove(); util.parentElement.remove();
      return out;
    });
    check(r.lockedColor === 'rgb(55, 65, 81)' && r.lockedBg === 'rgb(229, 231, 235)' && r.lockedBorder === 'dashed', label + ': .tos-locked still wins over aria-disabled: variants (grey, dashed): ' + JSON.stringify(r));
    check(r.nextBg === 'rgb(254, 240, 138)' && r.nextBorderColor === 'rgb(161, 98, 7)', label + ': .tos-next (yellow 次はここ) still wins over bg-white');
    check(r.pad === '16px' && r.display === 'flex', label + ': Tailwind utilities still work (px-4, flex): ' + r.pad + ' ' + r.display);
    // plain colours only (Safari 15: no lab/oklch/color-mix in the hand-written colour language)
    const exotic = await page.evaluate(() => [...document.querySelectorAll('.tos-next, .tos-next-badge, .tos-caution, .tos-error, .tos-ok, .tos-locked, .tos-main, .tos-safe-btn, .tos-danger-btn, .tos-confirm')].filter((e) => /lab\(|oklch|color-mix/.test(getComputedStyle(e).color + getComputedStyle(e).backgroundColor + getComputedStyle(e).borderTopColor)).map((e) => e.className));
    check(exotic.length === 0, label + ': the colour-language boxes (yellow/red/green/grey) keep plain hex/rgb colours (' + exotic.length + ' with lab/oklch: ' + short(exotic.join(' | '), 100) + ')');
    await page.close();
  }
  await ctx.close();
});

/* ───────────────────────── M3 (r1-35): JavaScript off ───────────────────────── */
scenario('M3', 'JavaScript off: light page, and a reason in words (not a black page with "じゅんびしています…" forever)', async () => {
  const ctx = await newCtx({ javaScriptEnabled: false });
  for (const [path, label] of SCREENS) {
    const page = await ctx.newPage();
    await page.goto(base + path);
    await settle(300);
    const r = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, htmlBg: getComputedStyle(document.documentElement).backgroundColor, color: getComputedStyle(document.body).color, text: document.body.innerText, alert: !!document.querySelector('[role=alert]') }));
    check(r.bg === LIGHT_BG && r.htmlBg === LIGHT_BG, label + ': light background with JS off (' + r.bg + ' / ' + r.htmlBg + ')');
    check(r.color === 'rgb(15, 23, 42)', label + ': dark text on it (' + r.color + ')');
    check(/JavaScript/.test(r.text) && /オン/.test(r.text), label + ': the page says JavaScript must be turned on: ' + short(r.text, 90));
    check(/⚠/.test(r.text), label + ': the line has the ⚠ icon');
    const alertStyle = await page.evaluate(() => { const a = document.querySelector('[role=alert]'); if (!a) return null; const s = getComputedStyle(a); return { bg: s.backgroundColor, color: s.color, w: a.getBoundingClientRect().width }; });
    check(alertStyle && alertStyle.bg === 'rgb(254, 240, 138)' && alertStyle.color === 'rgb(28, 25, 23)' && alertStyle.w > 200, label + ': the line is a yellow caution box (' + JSON.stringify(alertStyle) + ')');
    await page.close();
  }
  await ctx.close();
});

/* ───────────────────────── M4 (r1-35 / B8): before the page starts ───────────────────────── */
scenario('M4', 'the app scripts cannot start: the page is already light (no black flash), and after 10 seconds a ⚠ line says the browser may be too old', async () => {
  const ctx = await newCtx();
  await ctx.route(/\/_next\/static\/chunks\/.*\.js$/, (route) => route.abort());
  const pages = [];
  for (const [path, label] of [SCREENS[0], SCREENS[1], SCREENS.find(([p]) => p === '/apply/')]) {
    const page = await ctx.newPage();
    await page.goto(base + path);
    await settle(300);
    const r = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), boot: document.documentElement.getAttribute('data-theme-boot'), bg: getComputedStyle(document.body).backgroundColor, meta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'), loading: !!document.querySelector('[data-tos-loading]') }));
    check(r.theme === 'light' && r.boot === '1', label + ': data-theme=light is set before the app starts (' + r.theme + ')');
    check(r.bg === LIGHT_BG, label + ': the body is light before the app starts, not #07090d (' + r.bg + ')');
    check(r.meta === '#eef2f8', label + ': the browser bar colour is light too (' + r.meta + ')');
    check(r.loading, label + ': the page is still on its loading line (the app did not start)');
    pages.push([page, label]);
  }
  await settle(10300);
  for (const [page, label] of pages) {
    const t = await page.evaluate(() => { const a = document.querySelector('body > [role=alert]'); return a ? { text: a.innerText, bg: getComputedStyle(a).backgroundColor } : null; });
    check(t && /⚠/.test(t.text) && /古い|開き直して/.test(t.text) && /Chrome/.test(t.text), label + ': after 10 s a ⚠ line says what to do (' + short(t ? t.text : 'none', 100) + ')');
    check(t && t.bg === 'rgb(254, 240, 138)', label + ': that line is yellow');
    await page.close();
  }
  await ctx.close();
});

/* ───────────────────────── M5 (r1-140): no search engines, no favicon 404 ───────────────────────── */
scenario('M5', 'noindex meta, an empty icon, no 404 in the console, no stray requests', async () => {
  const ctx = await newCtx();
  for (const [path, label] of SCREENS) {
    const page = await ctx.newPage();
    const bad = [], consoleErrors = [];
    page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await page.goto(base + path);
    await settle(900);
    const r = await page.evaluate(() => ({ robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') || '', icon: document.querySelector('link[rel~="icon"]')?.getAttribute('href') || '' }));
    check(/noindex/.test(r.robots) && /nofollow/.test(r.robots), label + ': meta robots says noindex, nofollow (' + r.robots + ')');
    check(r.icon === 'data:,', label + ': the icon is the empty data: icon, so no /favicon.ico request (' + r.icon + ')');
    check(bad.length === 0, label + ': no response with an error status: ' + bad.join(' | '));
    check(consoleErrors.length === 0, label + ': no red error in the console: ' + short(consoleErrors.join(' | '), 200));
    await page.close();
  }
  await ctx.close();
});

/* ───────────────────────── M6 (r1-133 / r1-172): the safety headers file ───────────────────────── */
scenario('M6', 'the served _headers file keeps every privacy rule (CSP, referrer, noindex), for all five path blocks', async () => {
  const text = await (await fetch(base + '/_headers')).text();
  const blocks = new Map();
  let curBlock = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (/^\S/.test(raw)) { curBlock = { path: raw.trim(), lines: [] }; blocks.set(curBlock.path, curBlock); } else if (curBlock) curBlock.lines.push(raw.trim());
  }
  const need = ['/private/', '/private/entry/*', '/private/live/*', '/private/setup/*', '/apply/*'];
  check(!blocks.has('/private/google-setup/*'), '/private/google-setup/*: the legacy page is not published, so it has no block (D-1)');
  for (const p of need) {
    const b = blocks.get(p);
    check(!!b, p + ': block exists');
    if (!b) continue;
    const joined = b.lines.join('\n');
    check(/Referrer-Policy: no-referrer/.test(joined) && /X-Content-Type-Options: nosniff/.test(joined) && /X-Frame-Options: DENY/.test(joined), p + ': referrer none, nosniff, DENY');
    check(/X-Robots-Tag: noindex, nofollow/.test(joined), p + ': noindex header');
    check(/default-src 'self'/.test(joined) && /object-src 'none'/.test(joined) && /frame-src 'none'/.test(joined) && /base-uri 'none'/.test(joined) && /frame-ancestors 'none'/.test(joined), p + ': CSP base rules');
    check(!/(?:default|script|style|font|img|connect)-src[^;\n]*(?:\*|https:(?!\/\/script\.google))/.test(joined.replace(/https:\/\/script\.google(?:usercontent)?\.com/g, '')), p + ': no wildcard or open https: source');
  }
  const apply = (blocks.get('/apply/*') || { lines: [] }).lines.join('\n');
  check(/connect-src 'none'/.test(apply), '/apply/*: connect-src none (the apply page makes no network request of its own)');
  check(/form-action https:\/\/script\.google\.com https:\/\/script\.googleusercontent\.com;/.test(apply), '/apply/*: form-action is only the two Google addresses');
  for (const p of need.filter((x) => x !== '/apply/*')) {
    const b = blocks.get(p); if (!b) continue;
    check(!/form-action https/.test(b.lines.join('\n')), p + ': only /apply/ may post to Google');
  }
});

/* ───────────────────────── M7 (r1-132 / r1-142 / r1-172): the gate on the real folder ───────────────────────── */
scenario('M7', 'the release gate passes on the folder that is being served (and says what it checked)', async () => {
  const dir = join(ROOT, 'out-private-pages');
  if (!existsSync(dir)) { console.log('  skip: out-private-pages is not next to the scripts (a served copy elsewhere)'); return; }
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/check-private-build.mjs'), dir], { encoding: 'utf8' });
  check(r.status === 0 && /^OK 公開用フォルダは、正常です/.test(r.stdout), 'the gate passes on the built folder: ' + short(r.stdout + r.stderr, 200));
  const sh = spawnSync('bash', [join(ROOT, 'scripts/tree-stamp.sh')], { encoding: 'utf8' });
  check(/^(?:[0-9a-f]{40}|none):[0-9a-f]{40}\n?$/.test(sh.stdout), 'tree-stamp.sh prints "commit:fingerprint": ' + short(sh.stdout, 100));
});

/* ───────────────────────── M8 (r1-43): the music field follows the sheet setting ───────────────────────── */
scenario('M8', 'apply page: 入場曲 on -> the music link box is there and required; off -> no box and no mention (the sheet decides)', async () => {
  const cfg = { endpoint: 'https://script.google.com/macros/s/TOS_MISC_SIM/exec', eventId: 'misc-music', title: '架空テスト大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '架空連絡先 02-0000-0000', grade: 'off', age: 'off', comment: 'off', protocol: '3', mode: 'live' };
  const ctx = await newCtx();
  for (const music of [true, false]) {
    const page = await ctx.newPage();
    await page.goto(base + '/apply/' + publicEntryHash({ ...cfg, music }));
    await page.locator('#f-gym').waitFor({ timeout: 15000 });
    const has = await page.locator('#f-musicUrl').count();
    const mention = /入場曲/.test(await page.locator('main').innerText());
    check(music ? has === 1 : has === 0, 'music ' + music + ': the music link box is ' + (music ? 'there' : 'not there') + ' (' + has + ')');
    check(music ? mention : !mention, 'music ' + music + ': the page ' + (music ? 'asks for' : 'does not mention') + ' 入場曲');
    await page.close();
  }
  await ctx.close();
});

/* ───────────────────────── run ───────────────────────── */
for (const s of scenarios) {
  if (ONLY.length && !ONLY.includes(s.id)) continue;
  cur = s.id;
  console.log('▶ ' + s.id + ' — ' + s.name);
  try { await s.fn(); } catch (e) { failures.push('[' + s.id + '] scenario crashed: ' + short(e && e.message, 300)); console.log('  CRASH [' + s.id + '] ' + short(e && e.message, 300)); }
}

/* ───────────────────────── done ───────────────────────── */
await settle(100);
if (checks === 0) failures.push('no check ran (TOS_ONLY=' + ONLY.join(',') + ' matched no scenario id; ids: ' + scenarios.map((s) => s.id).join(',') + ')');
for (const e of externals) failures.push('[' + e.scenario + '] EXTERNAL request attempted: ' + e.method + ' ' + e.url);
for (const e of pageErrors) failures.push('[' + e.scenario + '] page error: ' + short(e.message, 200));
const nonLocal = net.filter((n) => !n.url.startsWith(base + '/') && !n.url.startsWith('data:'));
for (const n of nonLocal) failures.push('[' + n.scenario + '] network request left the app: ' + n.method + ' ' + n.url);
await browser.close();
console.log('\n' + checks + ' checks, ' + failures.length + ' failed.');
for (const f of failures) console.log(' - ' + f);
process.exit(failures.length ? 1 : 0);
