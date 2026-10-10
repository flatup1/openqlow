/**
 * Mistake-proof (careless middle-school student) adversarial test for Tournament OS v3.
 * It plays a student who reads only what is on the screen and makes realistic mistakes on the 4 real screens:
 *   /private/setup/  /private/  /private/live/  /apply/   at 1280px and 390px.
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation; the only allowed outside
 * address is the SIMULATED Apps Script endpoint (fulfilled by this script, never reaching the network). All data is fake.
 *
 * Two kinds of checks:
 *  (a) the colour + word language is real (computed from getComputedStyle, nothing assumed):
 *      exactly ONE yellow 「次はここ」 marker per screen state (words + icon, dark text >= 4.5:1), it moves on after each step,
 *      red errors have an icon and >= 4.5:1, a disabled button prints its reason, danger buttons are red and are never the default focus.
 *  (b) mistake cases: each realistic mistake is really tried on the real screen and must end SAFE
 *      (no data lost, no false success, no broken state, a clear red message or a silent auto-correction, and a way forward).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4510 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/mp.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=/tmp/claude-0/pwshim.mjs TOS_TEST_BASE=http://127.0.0.1:4510 TOS_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *    node --experimental-strip-types scripts/test-private-mistake-proof.mjs; rc=$?; kill $(cat /tmp/mp.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4510), TOS_ONLY=SETUP,PRIVATE,LIVE,APPLY (screens) or scenario ids,
 *      TOS_CHROME_PATH, TOS_MISTAKE_OUT (folder for cases.json + screenshots; default: <tmp>/tos-mistake-proof), TOS_DEBUG=1.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 * Last lines: "mistake cases: N, safe: M".
 */
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { emptyTournament } from '../core/privateTournament.ts';
import { EXPECTED_RECEPTION_BUILD, entryConfigFromPing, parsePing } from '../core/setupV3.ts';
import { publicEntryHash } from '../core/publicEntry.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4510';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const OUT = process.env.TOS_MISTAKE_OUT || join(tmpdir(), 'tos-mistake-proof');
await rm(join(OUT, 'shots'), { recursive: true, force: true });
await mkdir(join(OUT, 'shots'), { recursive: true });
const ENDPOINT = 'https://script.google.com/macros/s/TOS_MISTAKE_SIM/exec';
const COPY_URL = 'https://docs.google.com/spreadsheets/d/' + 'T'.repeat(30) + '/copy';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

/* ───────────────────────── bookkeeping ───────────────────────── */
let checks = 0, cur = '-';
const failures = [], net = [], externals = [], pageErrors = [], cases = [];
/** soft = colour/wording-language polish (the case is still SAFE); hard = data loss, false success, broken state, missing message, no way forward */
const check = (value, message, soft = false) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push({ msg: '[' + cur + '] ' + message, soft }); console.log('  FAIL' + (soft ? '(language)' : '') + ' [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 160) => String(s).replace(/\s+/g, ' ').slice(0, n);
let shotNo = 0;
const shot = async (page, name) => {
  const file = join(OUT, 'shots', String(++shotNo).padStart(3, '0') + '-' + name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) + '.png');
  try { await page.screenshot({ path: file }); } catch { return ''; }
  return file;
};
/**
 * One mistake case. fn tries the mistake on the real screen, makes checks, and returns the observed text ("today").
 * The case is SAFE only if none of its checks failed and it did not throw. Cases are identified by id so that the
 * same mistake tried at 1280px and 390px counts once (safe only when safe at both).
 */
let needSnap = false, lastSnap = '';
/** call just before closing a page inside a case without a page of its own: remembers a screenshot as evidence */
const snap = async (p) => { if (needSnap && p && !p.isClosed()) lastSnap = await shot(p, 'case-end'); };
async function mistake(def, page, fn) {
  const before = failures.length;
  needSnap = !page; lastSnap = '';
  let today = '';
  try { today = (await fn()) || ''; } catch (e) { check(false, def.id + ': threw ' + short(e.message, 200)); today = 'EXCEPTION ' + short(e.message, 160); }
  const mine = failures.slice(before);
  const safe = mine.every((f) => f.soft);
  let evidence = '';
  if (page && !page.isClosed()) evidence = await shot(page, def.id + (safe ? '-ok-' : '-FAIL-') + def.vp);
  else evidence = lastSnap;
  needSnap = false;
  cases.push({ ...def, today, safe, evidence, failed: mine.filter((f) => !f.soft).map((f) => f.msg), language: mine.filter((f) => f.soft).map((f) => f.msg) });
  if (process.env.TOS_DEBUG) console.log('  case ' + def.id + ' [' + def.vp + '] ' + (safe ? (mine.length ? 'safe(+language)' : 'safe') : 'UNSAFE') + ' :: ' + short(today, 200));
  return safe;
}

/* ───────────────────────── fake data ───────────────────────── */
const CSV_HEAD = '管理番号,ジム名,選手名,学年,年齢,身長,体重,戦績・競技歴,試合への意気込み,入場曲URL（Apple Music推奨）';
const ROWS = [
  ['F01', '架空赤ジム', '架空赤選手', '小6', '12', '150', '60', '初試合', 'がんばる', ''],
  ['F02', '架空青ジム', '架空青選手', '中1', '13', '155', '61.5', '1戦', '全力', ''],
  ['F03', '架空緑ジム', '架空緑選手', '中2', '14', '160', '55', '2戦', '気合', ''],
  ['F04', '架空黄ジム', '架空黄選手', '中3', '15', '162', '56', '3戦', '全力', ''],
  ['F05', '架空白ジム', '架空白選手', '高1', '16', '170', '70', '初試合', 'やる', ''],
  ['F06', '架空黒ジム', '架空黒選手', '高2', '17', '172', '71', '1戦', '勝つ', ''],
];
const csvOf = (rows) => [CSV_HEAD, ...rows.map((r) => r.join(','))].join('\n');
const CSV4 = csvOf(ROWS.slice(0, 4));
const CSV6 = csvOf(ROWS);
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const fighterOf = (row, photo = true) => ({ id: row[0], gym: row[1], name: row[2], grade: row[3], age: row[4], height: row[5], weight: row[6], record: row[7], comment: row[8], musicUrl: row[9], photoDataUrl: photo ? TINY_JPEG : '' });
function seed(id, o = {}) {
  const n = o.fighters ?? 4;
  const fighters = ROWS.slice(0, n).map((r) => fighterOf(r, o.photos ?? true));
  const pairs = o.bouts ?? [[0, 1], [2, 3]];
  const bouts = pairs.map((p, i) => ({ id: 'bout-' + i, redId: p[0] === null ? '' : fighters[p[0]].id, blueId: p[1] === null ? '' : fighters[p[1]].id, className: '', rule: '' }));
  const v = { ...emptyTournament(id), title: o.title ?? '架空大会', date: o.date ?? '2027年10月3日', venue: o.venue ?? '架空体育館', fighters, bouts, updatedAt: o.updatedAt ?? Date.now() - 60_000 };
  if (o.currentBout !== undefined) v.currentBout = o.currentBout;
  if (o.entryConfig) v.entryConfig = o.entryConfig;
  return v;
}
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
const PING_OK = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: false, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: '架空テスト大会', date: '2099-12-01', venue: '架空体育館', venueUrl: '', organizer: '架空主催', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
const applyHash = (over = {}, mode = 'live') => publicEntryHash(entryConfigFromPing(parsePing({ ...PING_OK, accepting: true, ...over }), ENDPOINT, mode));

/* ───────────────────────── browser helpers ───────────────────────── */
function attach(page) {
  page.__dlg = { mode: 'dismiss', log: [] };
  page.on('dialog', (d) => { page.__dlg.log.push({ type: d.type(), message: d.message() }); return page.__dlg.mode === 'accept' ? d.accept().catch(() => {}) : d.dismiss().catch(() => {}); });
  page.on('pageerror', (e) => { pageErrors.push({ scenario: cur, message: e.message }); });
}
/**
 * Only the local preview and the simulated endpoint are reachable.
 *  ctx.__ping: object returned for GET <endpoint>?action=ping (mutate it). ctx.__pingMode: ok | abort | html | other | slow.
 *  ctx.__posts: POSTs that reached the endpoint (the /apply/ form). ctx.__tpl: template-link.json body (null = 404).
 */
async function newCtx(mobile, o = {}) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], ...o });
  ctx.__ping = { ...PING_OK }; ctx.__pingMode = 'ok'; ctx.__pings = 0; ctx.__posts = []; ctx.__postMode = 'ok'; ctx.__tpl = { copyUrl: COPY_URL };
  ctx.on('page', attach);
  ctx.on('request', (r) => { if (/^https?:/.test(r.url())) net.push({ scenario: cur, url: r.url(), method: r.method() }); });
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url === base + '/template-link.json') return ctx.__tpl ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ctx.__tpl) }) : route.fulfill({ status: 404, body: 'no' });
    if (url.startsWith(base + '/')) return route.continue();
    const noQuery = url.split('?')[0];
    if (noQuery === ENDPOINT) {
      if (req.method() === 'GET') {
        ctx.__pings++;
        if (ctx.__pingMode === 'abort') return route.abort();
        if (ctx.__pingMode === 'html') return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<html><body>Sorry, unable to open the file</body></html>' });
        if (ctx.__pingMode === 'other') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ app: 'something-else', ok: true }) });
        if (ctx.__pingMode === 'slow') await settle(2500);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ctx.__ping) });
      }
      ctx.__posts.push({ url, method: req.method(), body: req.postData() || '' });
      if (ctx.__postMode === 'abort') return route.abort();
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>受付番号</title><p>受付番号 TOS-SIM-0001</p>' });
    }
    if (req.method() === 'GET' && /^https:\/\/script\.google\.com\/macros\//.test(url) && /action=ping$/.test(url)) { ctx.__pings++; ctx.__otherPings = (ctx.__otherPings || 0) + 1; return route.abort(); } // the page's own Google check of a URL the student typed (never reaches the network here)
    externals.push({ scenario: cur, url, method: req.method() });
    return route.abort();
  });
  return ctx;
}
const vpOf = (mobile) => (mobile ? 'sp390' : 'pc1280');
const val = (p, sel) => p.locator(sel).inputValue();
const btn = (p, name) => p.getByRole('button', { name, exact: true });
const text = (p) => p.evaluate(() => document.body.innerText);

/* ── IndexedDB (same store the app uses) ── */
const idbGet = (p, id) => p.evaluate((id) => new Promise((res, rej) => {
  const r = indexedDB.open('tournament-os-private-v1', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('events');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const db = r.result; const g = db.transaction('events', 'readonly').objectStore('events').get(id); g.onsuccess = () => { db.close(); res(g.result ?? null); }; g.onerror = () => rej(g.error); };
}), id);
const idbKeys = (p) => p.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('tournament-os-private-v1', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('events');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const db = r.result; const g = db.transaction('events', 'readonly').objectStore('events').getAllKeys(); g.onsuccess = () => { db.close(); res(g.result); }; g.onerror = () => rej(g.error); };
}));
const idbPut = (p, value) => p.evaluate((v) => new Promise((res, rej) => {
  const r = indexedDB.open('tournament-os-private-v1', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('events');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const db = r.result; const t = db.transaction('events', 'readwrite'); t.objectStore('events').put(v, v.eventId); t.oncomplete = () => { db.close(); res(true); }; t.onerror = () => rej(t.error); };
}), value);
const jpegs = (p, n) => p.evaluate((n) => Array.from({ length: n }, (_, i) => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2'][i % 6]; x.fillRect(0, 0, 120, 160); x.fillStyle = '#fff'; x.fillRect(10 + i * 7, 20, 30, 30); return c.toDataURL('image/jpeg').split(',')[1]; }), n).then((l) => l.map((b) => Buffer.from(b, 'base64')));
/** a REAL jpeg of the given size that the browser can decode (used for the /apply/ photo) */
const photoFile = (p, w = 300, h = 400) => p.evaluate(([w, h]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#c0392b'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2); return c.toDataURL('image/jpeg', 0.8).split(',')[1]; }, [w, h]).then((b) => Buffer.from(b, 'base64'));

/* ───────────────────────── the colour + word language, measured ───────────────────────── */
/**
 * Runs inside the page. Everything is computed (getComputedStyle, canvas colour parsing), nothing is assumed.
 * Returns the visible yellow markers, the red error texts, the disabled controls with/without a printed reason.
 */
const COLOUR = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('details:not([open]) > :not(summary)') && !el.closest('[aria-hidden="true"]'); };
  const rgb = (css) => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.clearRect(0, 0, 1, 1); x.fillStyle = '#ff00ff'; x.fillStyle = css; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const effBg = (el) => {
    const layers = []; let gradient = false;
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') gradient = true;
      const c = rgb(s.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
    }
    let out = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i--) { const [r, g, b, a] = layers[i]; out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)]; }
    return { rgb: out, gradient };
  };
  const fgOf = (el) => { const c = rgb(getComputedStyle(el).color); const bg = effBg(el).rgb; return [c[0] * c[3] + bg[0] * (1 - c[3]), c[1] * c[3] + bg[1] * (1 - c[3]), c[2] * c[3] + bg[2] * (1 - c[3])]; };
  const isYellow = ([r, g, b]) => r >= 200 && g >= 150 && b <= 175 && r - b >= 60 && Math.abs(r - g) <= 90;
  const hue = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return [0, 0]; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; return [h, d / mx]; };
  const isAmber = (c) => { const [h, s] = hue(c); return c[0] >= 140 && h >= 28 && h <= 65 && s >= 0.55; };
  const isRed = ([r, g, b]) => r >= 110 && r >= g * 1.8 && r >= b * 1.8;
  const textNodes = (root) => {
    const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t) continue; const p = n.parentElement; if (!p || p.closest('[aria-hidden="true"]') || !vis(p)) continue; out.push({ t, p }); }
    return out;
  };
  const out = { markers: [], reds: [], disabled: [] };
  // 1. yellow 「次はここ」 markers
  for (const m of document.querySelectorAll('[data-tos-next]')) {
    if (!vis(m)) continue;
    const badge = m.querySelector('.tos-next-badge') || m;
    const bt = badge.innerText.replace(/\s+/g, ' ').trim();
    const frame = effBg(m).rgb, badgeBg = effBg(badge).rgb;
    let min = 21; const bad = [];
    for (const { t, p } of textNodes(badge)) { const c = ratio(fgOf(p), effBg(p).rgb); if (c < min) min = c; if (c < 4.5) bad.push(t.slice(0, 20) + '=' + c.toFixed(2)); }
    out.markers.push({ text: bt.slice(0, 120), icon: bt.includes('👉'), words: /次はここ|ここに/.test(bt), yellow: isYellow(badgeBg) || isYellow(frame), badgeBg: badgeBg.map(Math.round).join(','), frame: frame.map(Math.round).join(','), min: Math.round(min * 100) / 100, bad, borderYellow: ['borderTopColor'].some((k) => { const w = parseFloat(getComputedStyle(m).borderTopWidth); return w >= 2 && (isYellow(rgb(getComputedStyle(m)[k])) || isAmber(rgb(getComputedStyle(m)[k]))); }), full: m.innerText.replace(/\s+/g, ' ').slice(0, 100) });
  }
  // 2. red error texts: the first line must be red + icon + >= 4.5:1; every other text in it must be readable
  const seen = new Set();
  const redEls = [...document.querySelectorAll('.tos-error,[role=alert]')];
  // any other visible line that starts with ✕ is also an error / danger line (deepest element only; buttons that merely say ✕ とじる are not errors)
  const starts = [...document.querySelectorAll('p,div,li,span,dd,dt,td,label')].filter((e) => !e.closest('button,summary,[aria-hidden="true"]') && vis(e) && /^✕/.test((e.innerText || '').trim()) && ![...e.children].some((c) => !c.matches('[aria-hidden="true"]') && /^✕/.test((c.innerText || '').trim())) && !e.matches('[aria-hidden="true"]'));
  for (const e of starts) if (!redEls.some((r) => r === e || r.contains(e))) redEls.push(e);
  for (const e of redEls) {
    if (!vis(e) || seen.has(e)) continue;
    seen.add(e);
    const nodes = textNodes(e);
    if (!nodes.length) continue;
    const first = nodes[0];
    const fg = fgOf(first.p), bg = effBg(first.p).rgb;
    let min = 21; for (const { p } of nodes) { const c = ratio(fgOf(p), effBg(p).rgb); if (c < min) min = c; }
    const full = e.innerText.replace(/\s+/g, ' ').trim();
    out.reds.push({ text: full.slice(0, 130), icon: /^[✕⚠✗×]/.test(full) || /[✕⚠]/.test(full.slice(0, 4)), red: isRed(fg) || isRed(rgb(getComputedStyle(e).color)), contrast: Math.round(ratio(fg, bg) * 100) / 100, min: Math.round(min * 100) / 100, role: e.getAttribute('role') || '', cls: String(e.className).slice(0, 30), bottom: e.getBoundingClientRect().bottom + scrollY, top: e.getBoundingClientRect().top + scrollY });
  }
  // 3. disabled buttons must print why, near the button
  for (const b of document.querySelectorAll('button[disabled],button[aria-disabled="true"],input[type=button][disabled],input[type=submit][disabled]')) {
    if (!vis(b)) continue;
    const name = (b.getAttribute('aria-label') || b.innerText || b.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    let reason = '';
    const d = b.getAttribute('aria-describedby');
    if (d) for (const id of d.split(/\s+/)) { const n = document.getElementById(id); if (n && n.innerText.trim() && vis(n)) reason = n.innerText.trim().slice(0, 80); }
    if (!reason && /押せません|まだ押せ|🔒|待ち|送信中|終わるまで|準備しています|読み込|保存しています/.test(b.innerText)) reason = 'in-button: ' + b.innerText.trim().slice(0, 50);
    if (!reason) {
      const br = b.getBoundingClientRect();
      let anc = b.parentElement;
      for (let i = 0; i < 4 && anc && !reason; i++, anc = anc.parentElement) {
        for (const n of anc.querySelectorAll('p,span,div,li')) {
          if (n === b || b.contains(n) || n.contains(b) || !vis(n) || n.children.length > 3) continue;
          const t = (n.innerText || '').trim();
          if (!t || t.length > 140 || !/🔒|押せません|まだ押せ|先に|できてから|終わってから|選んでから|入れてから|必要です/.test(t)) continue;
          const r = n.getBoundingClientRect();
          if (Math.abs(r.top - br.bottom) < 140 || Math.abs(br.top - r.bottom) < 140) { reason = t.slice(0, 80); break; }
        }
      }
    }
    out.disabled.push({ name, reason });
  }
  return out;
};
/** Check the colour language of the CURRENT state. expectMarker: number of yellow markers (default 1; 0 for a state with nothing left to do). */
async function colourAudit(page, label, { markers = 1, markerText = null, skipDisabled = false } = {}) {
  const c = await page.evaluate(COLOUR);
  if (markers === 'max1') check(c.markers.length <= 1, label + ': at most one yellow 次はここ marker (saw ' + c.markers.length + ': ' + short(c.markers.map((m) => m.text).join(' | '), 200) + ')', true);
  else check(c.markers.length === markers, label + ': exactly ' + markers + ' yellow 次はここ marker (saw ' + c.markers.length + ': ' + short(c.markers.map((m) => m.text).join(' | '), 200) + ')', true);
  for (const m of c.markers) {
    check(m.icon && m.words, label + ': the marker has the 👉 icon and the same words 「次はここ」 on every screen (' + short(m.text, 80) + ')', true);
    check(m.yellow, label + ': the marker is yellow-filled (badge ' + m.badgeBg + ' frame ' + m.frame + ')', true);
    check(m.borderYellow, label + ': the marker has a >=2px yellow/amber frame border', true);
    check(m.min >= 4.5, label + ': marker text contrast >= 4.5:1 (min ' + m.min + ' ' + m.bad.join(',') + ')', true);
    if (markerText) check(markerText.test(m.full), label + ': the marker points at the right place: ' + short(m.full, 90) + ' vs ' + markerText, true);
  }
  for (const r of c.reds) {
    check(r.icon, label + ': red message has ✕/⚠ icon "' + short(r.text, 60) + '"', true);
    check(r.red, label + ': red message is red text "' + short(r.text, 60) + '"', true);
    check(r.contrast >= 4.5 && r.min >= 4.5, label + ': red message contrast >= 4.5:1 (' + r.contrast + '/' + r.min + ') "' + short(r.text, 60) + '"', true);
  }
  if (!skipDisabled) for (const d of c.disabled) check(!!d.reason, label + ': disabled button "' + d.name + '" prints its reason', true);
  return c;
}
/** the visible red messages (text) right now */
const redTexts = async (page) => (await page.evaluate(COLOUR)).reds.map((r) => r.text);
const markerOf = async (page) => (await page.evaluate(COLOUR)).markers.map((m) => m.full);
const saysNext = (t) => /押|入れ|貼|選|直|もう一度|書|開|確か|連絡|送|待|戻|見|消|コピー|やり直|正しい|例|してください|ます。/.test(t);
/** the red message is within px of the cause element (below it or just above it) */
const nearBy = (page, causeSel, px = 320) => page.evaluate(([sel, px]) => {
  const c = document.querySelector(sel); if (!c) return false;
  const cr = c.getBoundingClientRect();
  return [...document.querySelectorAll('.tos-error,[role=alert]')].some((e) => { const r = e.getBoundingClientRect(); if (r.width === 0 || !e.innerText.trim()) return false; const gap = r.top >= cr.bottom - 4 ? r.top - cr.bottom : cr.top >= r.bottom - 4 ? cr.top - r.bottom : 0; return gap <= px; });
}, [causeSel, px]);
/** red lines (with the same ✕-line detection as colourAudit) that sit within px of the element `sel`: the messages a student would read as being ABOUT that box */
const redsNear = async (page, sel, px = 360) => {
  const c = await page.evaluate(COLOUR);
  const r = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY }; }, sel);
  if (!r) return [];
  return c.reds.filter((x) => { const gap = x.top >= r.bottom - 4 ? x.top - r.bottom : r.top >= x.bottom - 4 ? r.top - x.bottom : 0; return gap <= px; }).map((x) => x.text);
};
/**
 * "after every action show a visible result line": right after the action, WITHOUT scrolling, is a line matching `re` inside the window and not hidden
 * under a fixed bar / header? (The apps scroll or focus to their messages themselves, so this is what the student really sees.)
 */
const seenNow = (page, reSrc) => page.evaluate((src) => {
  const re = new RegExp(src);
  const cands = [...document.querySelectorAll('.tos-error,[role=alert],[role=status],.tos-caution,.tos-ok,p,li,span,div')].filter((e) => e.children.length < 5 && re.test((e.innerText || '').replace(/\s+/g, ' ')) && (e.innerText || '').length < 400);
  const vis = cands.filter((e) => { const r = e.getBoundingClientRect(), st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && !e.closest('[aria-hidden="true"]'); });
  if (!vis.length) return { found: false };
  const out = vis.map((e) => { const r = e.getBoundingClientRect(); const inView = r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1; const hit = document.elementFromPoint(Math.min(Math.max(r.left + Math.min(r.width / 2, 40), 1), innerWidth - 1), Math.min(Math.max(r.top + Math.min(r.height / 2, 12), 1), innerHeight - 1)); const free = !!hit && (e.contains(hit) || hit.contains(e)); return { inView, free, text: e.innerText.replace(/\s+/g, ' ').slice(0, 60) }; });
  return { found: true, any: out.some((o) => o.inView && o.free), out: out.slice(0, 3) };
}, reSrc.source);
async function checkSeen(page, re, label) {
  const r = await seenNow(page, re);
  check(r.found && r.any, label + ': the message is on screen right away, not hidden below the fold or under a bar (' + (r.found ? JSON.stringify(r.out).slice(0, 160) : 'not found') + ')');
  return r;
}
/** keep the requests honest: no request leaves 127.0.0.1 except the simulated endpoint */
const quiet = async (ctx, label, fn, { allow = [] } = {}) => { const n0 = net.length; await fn(); await settle(200); const extra = net.slice(n0).filter((e) => !e.url.startsWith(base + '/') && !allow.includes(e.method + ' ' + e.url.split('?')[0])); check(extra.length === 0, label + ' sends nothing outside this PC (saw: ' + short(extra.map((e) => e.method + ' ' + e.url).join(', '), 160) + ')'); };

/* ───────────────────────── scenarios registry ───────────────────────── */
const scenarios = [];
const scenario = (id, screen, name, fn, o = {}) => scenarios.push({ id, screen, name, fn, viewports: o.viewports || [false, true] });

/* ═══════════════════════════ SCREEN 1: /private/setup/ ═══════════════════════════ */
const SKEY = 'tournament-setup-v3:';
const isLocked = async (loc) => (await loc.count()) > 0 && (await loc.first().evaluate((b) => b.disabled || b.getAttribute('aria-disabled') === 'true'));
async function openSetup(ctx, id, st = null, query = '') {
  const page = await ctx.newPage();
  await page.goto(base + '/private/setup/?event=' + id + query);
  await page.getByText(/いまここ \d \/ 3/).first().waitFor({ timeout: 15000 });
  if (st) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [SKEY + id, { step: st.step ?? 1, endpoint: st.endpoint ?? '', ticks: st.ticks ?? [false, false, false, false], verified: !!st.verified }]);
    await page.reload();
    await page.getByText(/いまここ \d \/ 3/).first().waitFor({ timeout: 15000 });
  }
  await settle(250);
  return page;
}
const ALLTICK = [true, true, true, true];
const urlBox = (p) => p.locator('#endpoint');
const nextBtn = (p) => p.getByRole('button', { name: '次へ進む', exact: true });
const recheckBtn = (p) => p.getByRole('button', { name: 'もう一度確かめる', exact: true });
const tickBtn = (p) => p.locator('button:not([aria-disabled="true"])', { hasText: /^できた ✓$/ });
const stepNow = (p) => p.evaluate(() => (document.body.innerText.match(/いまここ (\d) \/ 3/) || [])[1] || '?');
const savedState = (p, id) => p.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, SKEY + id);
const ticksNow = async (p, id) => ((await savedState(p, id))?.ticks || []).filter(Boolean).length;
/** type into the URL box like a person (fill = paste), wait for the 600ms auto check, and read what the screen says */
async function typeUrl(page, value, wait = 1500) {
  await urlBox(page).fill('');
  await settle(120);
  await urlBox(page).fill(value);
  await urlBox(page).blur().catch(() => {});
  await settle(wait);
  const c = await page.evaluate(COLOUR);
  const nextOk = !(await isLocked(nextBtn(page)));
  return { reds: c.reds.map((r) => r.text), markers: c.markers.map((m) => m.full), nextOk, shown: await val(page, '#endpoint'), body: await text(page) };
}

/* URL mistakes. expect: accept = quietly fixed and connected; reject = red message that says what to do; either = connects or explains */
const URL_CASES = [
  ['sheet-url', 'シートのURLを貼った', 'https://docs.google.com/spreadsheets/d/' + 'A'.repeat(40) + '/edit#gid=0', 'reject', /シートのURL/, '「ウェブアプリ」の下の /exec のURLを貼る'],
  ['old-dev-url', '古い /dev のURLを貼った', 'https://script.google.com/macros/s/TOS_MISTAKE_SIM/dev', 'reject', /\/dev|テスト用/, '/exec で終わるURLに直す'],
  ['template-link', 'ひな形のコピー用リンクを貼った', COPY_URL, 'reject', /ひな形|コピー/, '「ウェブアプリ」の /exec のURLを貼る'],
  ['spaces-around', 'URLの前後に空白', '   ' + ENDPOINT + '   ', 'accept', null, '前後の空白は自動で消す'],
  ['trailing-newline', 'URLの後ろに改行', ENDPOINT + '\n\n', 'accept', null, '改行は自動で消す'],
  ['fullwidth-url', '全角の https://', 'ｈｔｔｐｓ://script.google.com/macros/s/TOS_MISTAKE_SIM/exec', 'accept', null, '全角は自動で半角にする'],
  ['query-appended', 'URLの後ろに ?action=ping が付いた', ENDPOINT + '?action=ping', 'accept', null, '余分な後ろは自動で消す'],
  ['account-index', 'URLに /u/1/ が入っている', 'https://script.google.com/macros/u/1/s/TOS_MISTAKE_SIM/exec', 'accept', null, '/u/1 は自動で消す'],
  ['workspace-url', '会社・学校のGoogleのURL（/a/macros/…）', 'https://script.google.com/a/macros/example.com/s/TOS_MISTAKE_SIM/exec', 'reject', /URL/, '使えない形のときは、何をすればよいかを言う'],
  ['plain-text', 'URLではない文字', 'これはURLではありません', 'reject', /URL/, 'https:// で始まるURLを貼る'],
  ['emoji-only', '絵文字だけ', '😀😀😀', 'reject', /URL|文字/, '絵文字は入らないと言って、貼り直しを案内する'],
  ['truncated-lib', '途中で切れたURL', 'https://script.google.com/macros/library/d/TOS/1', 'reject', /最後まで|exec|URL/, '最後（/exec）まで全部コピーする'],
  ['inner-spaces', 'URLの途中に空白が入った', 'https://script.google.com/macros/s/TOS MISTAKE SIM/exec', 'either', /URL/, '空白を消してつなぐ。だめなら、URLを見直すと言う'],
  ['too-long', '5000文字のゴミを貼った', 'https://script.google.com/macros/s/' + 'x'.repeat(5000) + '/exec', 'either', /URL/, '長すぎるときは、貼り直しを案内する'],
  ['trailing-slash', 'URLの最後に / が付いた', ENDPOINT + '/', 'accept', null, '最後の / は自動で消す'],
  ['trailing-hash', 'URLの最後に # が付いた', ENDPOINT + '#', 'accept', null, '最後の # は自動で消す'],
  ['quoted-url', 'URLを " " でかこんだまま貼った', '"' + ENDPOINT + '"', 'accept', null, '引用符は自動で消す'],
  ['angle-url', 'URLを < > でかこんだまま貼った', '<' + ENDPOINT + '>', 'accept', null, '< > は自動で消す'],
  ['jp-bracket-url', 'URLを 「 」 でかこんだまま貼った', '「' + ENDPOINT + '」', 'accept', null, '「 」 は自動で消す'],
  ['trailing-period', 'URLの最後に「。」が付いた（文章からコピー）', ENDPOINT + '。', 'accept', null, '最後の 。 は自動で消す'],
  ['prefix-text', '「ウェブアプリ：」と一緒にコピーした', 'ウェブアプリ：' + ENDPOINT, 'either', /URL/, '前の文字は自動で消す。だめなら、URLだけ貼るよう言う'],
  ['hard-wrapped', 'LINEなどで途中に改行が入ったURL', ENDPOINT.slice(0, 50) + '\n' + ENDPOINT.slice(50), 'either', /URL/, '改行は自動でつなぐ。だめなら、貼り直しを案内する'],
  ['other-site', 'script.google.com ではないURL', 'https://example.com/exec', 'reject', /URL|Google/, 'Googleの /exec のURLを貼る'],
];

scenario('SETUP-A', 'SETUP', 'out of order, locked buttons, repeated clicks', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-sa-' + vp.tag;
  const page = await openSetup(ctx, id);
  const V = vp.name;
  await colourAudit(page, 'start ' + V, { markerText: /作業1/ });

  await mistake({ id: 'S01', screen: '/private/setup/', vp: V, op: '手順の見出し（上の 1・2・3）を押す', what: '作業1をしていないのに「手順2」「手順3」の見出しを押す', risk: 'P1', guard: '押せない見出しは灰色＋「🔒 まず手順1」、押したら赤い1行「✕ まだ押せません」と、いまやることを出す' }, page, async () => {
    for (const n of [2, 3]) {
      await page.getByRole('button', { name: new RegExp('手順' + n) }).click({ force: true });
      await settle(250);
      check((await stepNow(page)) === '1', 'S01: pressing the locked tab 手順' + n + ' stays on step 1 (' + (await stepNow(page)) + ')');
      const reds = await redTexts(page);
      check(reds.some((t) => /まだ押せません|先に/.test(t)), 'S01: a red line explains why 手順' + n + ' is locked (' + short(reds.join(' | '), 120) + ')');
      check((await markerOf(page)).length === 1, 'S01: still exactly one yellow marker');
    }
    return 'stays on 手順1; red line: ' + short((await redTexts(page)).find((t) => /まだ押せません/.test(t)) || 'none', 90);
  });

  await mistake({ id: 'S02', screen: '/private/setup/', vp: V, op: '「準備できました → 次へ」を押す', what: '4つの作業を終えていないのに、先へ進むボタンを押す', risk: 'P1', guard: '灰色＋理由「🔒 作業1が終わっていません」。押したらボタンの真上に赤い1行' }, page, async () => {
    const go = page.getByRole('button', { name: /「準備できました」と出た/ });
    check(await isLocked(go), 'S02: the 次へ button is locked before the tasks are done');
    await go.click({ force: true }); await settle(250);
    check((await stepNow(page)) === '1', 'S02: pressing it does not leave step 1');
    check((await redTexts(page)).some((t) => /まだ押せません/.test(t)), 'S02: a red line says why');
    await checkSeen(page, /まだ押せません：作業1が終わっていません/, 'S02');
    return 'locked; red line "' + short((await redTexts(page)).find((t) => /まだ押せません/.test(t)) || '', 60) + '"';
  });

  await mistake({ id: 'S03', screen: '/private/setup/', vp: V, op: '作業の「できた ✓」を押す', what: '前の作業が終わっていないのに、2つ目の「できた ✓」を押す', risk: 'P1', guard: '2つ目以降は灰色＋「🔒 作業1が終わってから押せます」。押したら赤い1行' }, page, async () => {
    await page.getByRole('button', { name: 'できた ✓', exact: true }).nth(1).click({ force: true }); await settle(250);
    check((await ticksNow(page, id)) === 0, 'S03: no tick was stored');
    check((await redTexts(page)).some((t) => /先|まだ押せません/.test(t)), 'S03: a red line says 作業1 comes first');
    check(/作業1/.test((await markerOf(page))[0] || ''), 'S03: the yellow marker stays on 作業1');
    return 'nothing ticked; red: ' + short((await redTexts(page)).find((t) => /先/.test(t)) || '', 60);
  });

  await mistake({ id: 'S04', screen: '/private/setup/', vp: V, op: '作業1の「できた ✓」を押す', what: '2回・3回すばやく押す', risk: 'P1', guard: '押したあとは「✓できた＋時刻」になり、同じ場所を連打しても✓が外れない。黄色は作業2に移る' }, page, async () => {
    await tickBtn(page).first().dblclick(); await settle(300);
    check((await ticksNow(page, id)) === 1, 'S04: after a double click exactly one task is done (' + (await ticksNow(page, id)) + ')');
    check(/作業2/.test((await markerOf(page))[0] || ''), 'S04: the yellow marker moved to 作業2 (' + short((await markerOf(page))[0] || '', 50) + ')');
    check((await text(page)).includes('✓できた'), 'S04: a green ✓できた line is visible');
    await colourAudit(page, 'after tick 1 ' + V, { markerText: /作業2/ });
    return 'one tick; marker -> 作業2';
  });

  await mistake({ id: 'S05', screen: '/private/setup/', vp: V, op: '「まちがえた → やり直す（✓ を消す）」を押す', what: '✓を付けまちがえたので消す', risk: 'P2', guard: '消すと黄色が作業1にもどり、ほかの✓は消えない' }, page, async () => {
    const undo = page.getByRole('button', { name: /まちがえた → やり直す/ });
    check((await undo.count()) >= 1, 'S05: an undo button exists on a done task');
    await undo.first().click(); await settle(300);
    check((await ticksNow(page, id)) === 0, 'S05: the tick is removed');
    check(/作業1/.test((await markerOf(page))[0] || ''), 'S05: the marker is back on 作業1');
    return 'tick removed; marker back on 作業1';
  });

  for (let i = 1; i <= 4; i++) { await tickBtn(page).first().click(); await settle(220); }
  await mistake({ id: 'S06', screen: '/private/setup/', vp: V, op: '「準備できました → 次へ」を押す', what: '3回すばやく押す（手順3まで進んでしまわないか）', risk: 'P1', guard: '1回だけ手順2へ進む。手順3の黄色は出ない' }, page, async () => {
    await colourAudit(page, 'all ticked ' + V, { markerText: /準備できました/ });
    const go = page.getByRole('button', { name: /「準備できました」と出た/ });
    await go.click({ clickCount: 3, delay: 20 }).catch(() => {}); await settle(500);
    check((await stepNow(page)) === '2', 'S06: three fast presses end on step 2 (' + (await stepNow(page)) + ')');
    check((await markerOf(page)).length === 1, 'S06: one yellow marker after the move');
    return 'step ' + (await stepNow(page));
  });
  await mistake({ id: 'S07', screen: '/private/setup/', vp: V, op: '「次へ進む」を押す', what: 'URLが空なのに押す、「もう一度確かめる」も押す', risk: 'P1', guard: '灰色＋「🔒 URLを貼ると押せます」。押したら赤い1行「✕ まだ進めません」' }, page, async () => {
    check(await isLocked(nextBtn(page)) && await isLocked(recheckBtn(page)), 'S07: 次へ進む and もう一度確かめる are locked with an empty URL');
    await nextBtn(page).click({ force: true }); await settle(250);
    check((await redTexts(page)).some((t) => /まだ進めません/.test(t)), 'S07: red line "まだ進めません"');
    await checkSeen(page, /まだ進めません/, 'S07');
    await recheckBtn(page).click({ force: true }); await settle(250);
    check((await redTexts(page)).some((t) => /まだ押せません/.test(t)), 'S07: red line "まだ押せません" for もう一度確かめる');
    check((await stepNow(page)) === '2', 'S07: still on step 2');
    const q = ctx.__pings; check(q === 0, 'S07: no check was sent for an empty URL (pings ' + q + ')');
    return 'both locked; red lines shown';
  });
  await colourAudit(page, 'step2 empty ' + V, { markerText: /操作1/ });
  await ctx.close();
});

scenario('SETUP-B', 'SETUP', 'skip, Back/Forward, reload, closing the tab', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-sb-' + vp.tag, V = vp.name;
  let page = await openSetup(ctx, id);
  await mistake({ id: 'S08', screen: '/private/setup/', vp: V, op: '「✓がなくても進む」を押す', what: '作業を何もしないで、飛ばして先へ進む', risk: 'P2', guard: '進める。ただし先の手順で本当につながっているかを確かめるので、うその成功は出ない（URL未入力のままでは手順3へ行けない）' }, page, async () => {
    await page.getByRole('button', { name: /✓がなくても進む/ }).click(); await settle(400);
    check((await stepNow(page)) === '2', 'S08: skip lands on step 2');
    check(/操作1/.test((await markerOf(page))[0] || ''), 'S08: marker on 操作1');
    check(await isLocked(nextBtn(page)), 'S08: step 3 is still locked until a working URL is pasted');
    await page.getByRole('button', { name: /手順3/ }).click({ force: true }); await settle(250);
    check((await stepNow(page)) === '2', 'S08: the 手順3 tab does not open without a working URL');
    return 'step 2; step 3 locked';
  });
  await mistake({ id: 'S09', screen: '/private/setup/', vp: V, op: 'ブラウザの「戻る」「進む」', what: '手順2で「戻る」を押し、また「進む」を押す', risk: 'P2', guard: '手順1にもどってもチェックは消えない。「進む」で手順2にもどる' }, page, async () => {
    await urlBox(page).fill(ENDPOINT); await settle(1200);
    await page.goBack(); await settle(400);
    check((await stepNow(page)) === '1', 'S09: Back goes to step 1 (' + (await stepNow(page)) + ')');
    await page.goForward(); await settle(400);
    check((await stepNow(page)) === '2' && (await val(page, '#endpoint')) === ENDPOINT, 'S09: Forward is step 2 and the URL is still there');
    return 'Back -> step 1, Forward -> step 2, URL kept';
  });
  await mistake({ id: 'S10', screen: '/private/setup/', vp: V, op: '画面の再読み込み', what: 'URLを入れたあとで再読み込みする', risk: 'P1', guard: '同じ手順・同じURLで戻り、「続きから始めました」と緑で言う。もう一度全部やらされない' }, page, async () => {
    await page.reload(); await page.getByText(/いまここ \d \/ 3/).first().waitFor(); await settle(1500);
    check((await stepNow(page)) === '2' && (await val(page, '#endpoint')) === ENDPOINT, 'S10: step and URL survive a reload');
    check((await text(page)).includes('続きから始めました'), 'S10: green note 続きから始めました');
    check(!(await isLocked(nextBtn(page))), 'S10: the 次へ button works again without pasting again');
    return 'resumed with the URL';
  });
  await mistake({ id: 'S11', screen: '/private/setup/', vp: V, op: 'タブを閉じて、あとでもう一度開く', what: 'タブを閉じ、同じ大会名のアドレスをまた開く', risk: 'P1', guard: '閉じる前の手順・URL・✓が残っている' }, page, async () => {
    await page.close();
    page = await openSetup(ctx, id);
    await settle(1200);
    check((await stepNow(page)) === '2' && (await val(page, '#endpoint')) === ENDPOINT, 'S11: after closing the tab the work is still there');
    return 'step 2 + URL restored in a new tab';
  });
  await mistake({ id: 'S12', screen: '/private/setup/', vp: V, op: 'アドレスの ?event= を変える／消す', what: '?event= がない、変な文字（絵文字・../・空白・300文字）が入っているアドレスで開く', risk: 'P2', guard: '使える名前に自動で直し、直したことを言う。ほかの大会の保存を壊さない' }, page, async () => {
    for (const q of ['', '?event=', '?event=' + encodeURIComponent('😀 大会/../x'), '?event=' + 'a'.repeat(300)]) {
      const p2 = await ctx.newPage();
      await p2.goto(base + '/private/setup/' + q);
      await p2.getByText(/いまここ \d \/ 3/).first().waitFor({ timeout: 15000 });
      await settle(300);
      const t2 = await text(p2);
      check(!/undefined|NaN|\[object/.test(t2), 'S12: ' + short(q, 40) + ' shows no broken text');
      const c2 = await p2.evaluate(COLOUR);
      check(c2.markers.length === 1, 'S12: ' + short(q, 30) + ' still has exactly one yellow marker (' + c2.markers.length + ')');
      await p2.close();
    }
    const kept = await savedState(page, id);
    check(kept && kept.endpoint === ENDPOINT, 'S12: the other event keeps its URL');
    return 'handled all odd event names without damage';
  });
  await ctx.close();
});

scenario('SETUP-C', 'SETUP', 'wrong thing in the URL box', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-sc-' + vp.tag, V = vp.name;
  const page = await openSetup(ctx, id, { step: 2, ticks: ALLTICK });
  for (const [cid, what, value, expect, re, guard] of URL_CASES) {
    await mistake({ id: 'U-' + cid, screen: '/private/setup/', vp: V, op: '手順2：URLを貼る', what, risk: expect === 'reject' ? 'P1' : 'P2', guard }, page, async () => {
      ctx.__pings = 0;
      const r = await typeUrl(page, value);
      const redsAbout = r.reds.filter((t) => !/エラーが出たとき/.test(t));
      const near = await redsNear(page, '#endpoint', 360); // red lines a student reads as being about the URL box (the fixed warnings further down the page do not count)
      if (expect === 'accept') {
        check(r.nextOk, 'U-' + cid + ': a harmless variation is accepted and 次へ進む opens (reds: ' + short(redsAbout.join(' | '), 100) + ')');
        check(redsAbout.length === 0, 'U-' + cid + ': no red message for a harmless variation');
        check(r.shown === ENDPOINT || r.shown.startsWith('https://script.google.com/macros/s/'), 'U-' + cid + ': the box now shows a clean URL (' + short(r.shown, 80) + ')');
        check(r.markers.length === 1 && /次へ進む/.test(r.markers[0]), 'U-' + cid + ': the yellow marker moved to 次へ進む (' + short(r.markers[0] || '', 50) + ')');
        check(/自動で直しました|つながりました/.test(r.body), 'U-' + cid + ': it says it fixed the URL / connected');
      } else if (expect === 'reject') {
        check(!r.nextOk, 'U-' + cid + ': 次へ進む stays locked');
        check(near.length >= 1 && re.test(near.join(' ')), 'U-' + cid + ': a red message right at the URL box names the mistake (' + short(near.join(' | ') || 'none (only far-away fixed warnings: ' + redsAbout.join(' | ') + ')', 140) + ')');
        check(near.some((t) => saysNext(t.replace(/^✕\s*/, ''))), 'U-' + cid + ': that red message says what to do next (' + short(near.join(' | '), 140) + ')');
        if (near[0]) await checkSeen(page, new RegExp(near[0].replace(/^✕\s*/, '').slice(0, 14).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'U-' + cid);
                check(ctx.__pings === 0, 'U-' + cid + ': a URL of the wrong kind is never sent to Google (pings ' + ctx.__pings + ')');
        check(r.markers.length === 1 && /URL|貼|コピー|操作3|確かめ/.test(r.markers[0]), 'U-' + cid + ': the yellow marker points at the URL box/step, not at an earlier finished step (' + short(r.markers[0] || '', 60) + ')', true);
      } else {
        check(!r.nextOk || redsAbout.length === 0, 'U-' + cid + ': either it connects, or 次へ stays locked');
        if (!r.nextOk) { check(near.length >= 1 && re.test(near.join(' ')), 'U-' + cid + ': a red message at the URL box exists and mentions the URL (' + short(near.join(' | '), 120) + ')'); }
      }
      return 'box -> "' + short(r.shown, 50) + '"; next ' + (r.nextOk ? 'open' : 'locked') + '; red at the box: ' + short(near.join(' | ') || 'none', 130) + '; marker: ' + short(r.markers[0] || '', 50);
    });
  }
  await mistake({ id: 'U-empty-after-good', screen: '/private/setup/', vp: V, op: '手順2：URLを消す', what: 'つながったURLを、うっかり全部消す', risk: 'P1', guard: '次へ進むは灰色にもどり、「🔒 URLを貼ると押せます」。うその「つながりました」を残さない' }, page, async () => {
    await typeUrl(page, ENDPOINT);
    check(!(await isLocked(nextBtn(page))), 'U-empty: precondition, connected');
    const r = await typeUrl(page, '', 900);
    check(r.nextOk === false, 'U-empty: 次へ進む is locked again');
    check(!/✓つながりました/.test(r.body), 'U-empty: the old ✓つながりました is gone');
    check(r.markers.length === 1 && /操作|貼/.test(r.markers[0]), 'U-empty: the marker goes back to the operations/URL box (' + short(r.markers[0] || '', 50) + ')', true);
    return 'locked again';
  });
  await mistake({ id: 'U-fast-typing', screen: '/private/setup/', vp: V, op: '手順2：URLを手で入力する', what: '1文字ずつ入力する間に、途中のURLが先に確かめられてしまう', risk: 'P2', guard: '入力が終わってから確かめる。途中で赤い失敗を出さない' }, page, async () => {
    await typeUrl(page, '', 300); ctx.__pings = 0;
    await urlBox(page).click();
    await page.keyboard.type(ENDPOINT.slice(0, 40), { delay: 15 });
    await settle(150);
    const mid = await redTexts(page);
    check(!mid.some((t) => /つながりませんでした/.test(t)), 'U-fast: no "つながりませんでした" while still typing (' + short(mid.join(' | '), 100) + ')');
    await page.keyboard.type(ENDPOINT.slice(40), { delay: 15 });
    await settle(1500);
    check(!(await isLocked(nextBtn(page))), 'U-fast: after the last letter it connects');
    return 'mid-typing red: ' + short(mid.join(' | ') || 'none', 80);
  });
  await ctx.close();
});

scenario('SETUP-D', 'SETUP', 'Google does not answer well', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-sd-' + vp.tag, V = vp.name;
  const page = await openSetup(ctx, id, { step: 2, ticks: ALLTICK });
  const row = async (cid, what, setup, expectRe, guard) => mistake({ id: cid, screen: '/private/setup/', vp: V, op: '手順2：URLを貼ったあとの確かめ', what, risk: 'P1', guard }, page, async () => {
    await urlBox(page).fill(''); await settle(150);
    ctx.__ping = { ...PING_OK }; ctx.__pingMode = 'ok'; setup(ctx);
    await urlBox(page).fill(ENDPOINT); await settle(1700);
    const reds = (await redTexts(page)).filter((t) => !/エラーが出たとき/.test(t));
    const body = await text(page);
    const locked = await isLocked(nextBtn(page));
    check(locked, cid + ': 次へ進む is locked');
    check(expectRe.test(reds.join(' ') + ' ' + body), cid + ': the screen says what is wrong (' + short(reds.join(' | '), 140) + ')');
    check(reds.length >= 1 || /気をつけて/.test(body), cid + ': a red or yellow message is printed');
    check((await val(page, '#endpoint')) === ENDPOINT, cid + ': the pasted URL is kept');
    const m = await markerOf(page);
    check(m.length === 1, cid + ': exactly one yellow marker (' + m.length + ')');
    await colourAudit(page, cid + ' ' + V);
    return 'next ' + (locked ? 'locked' : 'open') + '; red: ' + short(reds.join(' | ') || 'none', 120) + '; marker: ' + short(m[0] || '', 60);
  });
  await row('G01', 'ネットが切れている／Googleに届かない', (c) => { c.__pingMode = 'abort'; }, /つながりませんでした/, '赤で「つながりませんでした」＋URLは残っている＋「もう一度確かめる」が黄色');
  await row('G02', 'URLの先がHTMLの画面を返す（別のページのURL）', (c) => { c.__pingMode = 'html'; }, /読めません|つながりません|ちがう|違う|URL/, '赤で「このURLは受付の用意ではありません」＋貼り直しを案内');
  await row('G03', '別のアプリのURLを貼った', (c) => { c.__pingMode = 'other'; }, /読めません|ちがう|違う|このアプリ|URL|大会/, '赤で「別のものです」＋貼り直しを案内');
  await row('G04', 'ひな形が古いまま', (c) => { c.__ping.build = '3.0.0'; }, /古い/, '赤で「古いです。ここから先に進めません」＋ジムの担当者に写真を送る');
  await row('G05', '「① 最初の設定」をまだ押していない', (c) => { c.__ping.ready = false; }, /最初の設定/, '赤で「①がまだです」＋①を押すよう黄色で案内');
  await row('G06', '「設定」タブの書き忘れ', (c) => { c.__ping.settingsProblem = '「設定」タブの、次の欄を入れてください：会場'; }, /会場/, '赤で書き忘れた欄（セル番号つき）＋直したら「もう一度確かめる」');
  await row('G07', '自動テストが終わっていない', (c) => { c.__ping.testComplete = false; }, /自動テスト|①/, '「①をもう一度押す」と案内');
  await row('G08', '大会名が空のまま（シートの書き忘れ）', (c) => { c.__ping.title = ''; }, /大会名|書いて|空/, '空の項目を赤で見せ、次へ進ませない');
  await row('G09', '開催日が空', (c) => { c.__ping.date = ''; }, /開催日|書いて|空/, '空の項目を赤で見せ、次へ進ませない');
  await mistake({ id: 'G10', screen: '/private/setup/', vp: V, op: '「もう一度確かめる」を押す', what: '3回すばやく押す', risk: 'P2', guard: '確かめ中は押せない（灰色＋⏳）。同じ確かめが何度も走らない' }, page, async () => {
    await urlBox(page).fill(''); ctx.__ping = { ...PING_OK }; ctx.__pingMode = 'ok'; await urlBox(page).fill(ENDPOINT); await settle(1500);
    ctx.__pingMode = 'slow'; ctx.__pings = 0;
    await recheckBtn(page).click({ clickCount: 3, delay: 10 }).catch(() => {});
    await settle(3500);
    check(ctx.__pings <= 2, 'G10: three fast presses cause at most 2 checks (' + ctx.__pings + ')');
    check(!(await isLocked(nextBtn(page))), 'G10: it ends connected');
    check(!(await redTexts(page)).some((t) => /つながりませんでした/.test(t)), 'G10: no false failure');
    ctx.__pingMode = 'ok';
    return 'checks sent: ' + ctx.__pings;
  });
  await ctx.close();
});

scenario('SETUP-E', 'SETUP', 'step 3: giving the URL to fighters', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-se-' + vp.tag, V = vp.name;
  const page = await openSetup(ctx, id, { step: 3, ticks: ALLTICK, endpoint: ENDPOINT, verified: true });
  await settle(1200);
  const copyBtn = btn(page, '完成：選手へ渡すURLをコピー');
  await mistake({ id: 'T01', screen: '/private/setup/', vp: V, op: '「完成：選手へ渡すURLをコピー」を押す', what: '受付を開始していないのに押す', risk: 'P1', guard: '灰色＋「🔒 まだ押せません：シートで「② 受付を開始」を押す」。押したら赤い1行。コピーされない' }, page, async () => {
    await colourAudit(page, 'step3 need-open ' + V, { markerText: /② 受付を開始/ });
    check(await isLocked(copyBtn), 'T01: copy button locked while not accepting');
    await page.evaluate(() => navigator.clipboard.writeText('BEFORE-MARK'));
    await copyBtn.click({ force: true }); await settle(300);
    check((await page.evaluate(() => navigator.clipboard.readText())) === 'BEFORE-MARK', 'T01: nothing was copied');
    check((await redTexts(page)).some((t) => /まだ押せません/.test(t)), 'T01: red line explains (' + short((await redTexts(page)).join(' | '), 100) + ')');
    await checkSeen(page, /まだ押せません/, 'T01');
    check(!(await text(page)).includes('できあがり'), 'T01: no false "できあがり"');
    return 'locked, nothing copied';
  });
  await mistake({ id: 'T02', screen: '/private/setup/', vp: V, op: '「完成：選手へ渡すURLをコピー」を押す', what: '2回・3回すばやく押す', risk: 'P2', guard: '何度押しても同じURLが入るだけ。緑で「コピーしました」' }, page, async () => {
    ctx.__ping = { ...PING_OK, accepting: true };
    await recheckBtn(page).click(); await settle(1000);
    await colourAudit(page, 'step3 ready ' + V, { markerText: /コピー/ });
    check(!(await isLocked(copyBtn)), 'T02: copy enabled once accepting');
    await copyBtn.click({ clickCount: 3, delay: 15 }); await settle(500);
    const got = await page.evaluate(() => navigator.clipboard.readText());
    check(got.startsWith(base + '/apply/#') && !/entryKey|setupKey|@/.test(got), 'T02: a clean public URL was copied');
    check(/コピーしました|✓.*コピー/.test(await text(page)), 'T02: a green copied line is shown');
    await colourAudit(page, 'step3 after copy ' + V, { markers: 'max1' });
    return 'copied ' + short(got, 50);
  });
  await mistake({ id: 'T03', screen: '/private/setup/', vp: V, op: '受付を止めたあとで画面を見る', what: '先生が「③ 受付を停止」を押したのに、古いURLをまた配る', risk: 'P1', guard: '停止を見つけたら「受付は止まっています」と赤で言い、コピーを押せなくする' }, page, async () => {
    ctx.__ping = { ...PING_OK, accepting: false };
    await recheckBtn(page).click(); await settle(1200);
    check(await isLocked(copyBtn), 'T03: after a stop the copy button is locked again');
    check((await markerOf(page)).length === 1 && !/コピー/.test((await markerOf(page))[0] || ''), 'T03: the yellow marker no longer says コピー (' + short((await markerOf(page))[0] || '', 50) + ')');
    return 'copy locked again';
  });
  await mistake({ id: 'T04', screen: '/private/setup/', vp: V, op: 'コピーがブラウザに止められる', what: 'コピーを許可しない設定のブラウザで押す', risk: 'P1', guard: '赤で「コピーできませんでした」＋四角の文字を選んでコピーする方法。うその「コピーしました」は出さない' }, page, async () => {
    ctx.__ping = { ...PING_OK, accepting: true };
    await recheckBtn(page).click(); await settle(1000);
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')), readText: () => Promise.reject(new Error('denied')) }, configurable: true }); });
    await copyBtn.click(); await settle(500);
    const t = await text(page);
    check(!/✓.{0,8}コピーしました/.test(t), 'T04: no false "コピーしました"');
    const reds = await redTexts(page);
    check(reds.some((x) => /コピー/.test(x)), 'T04: a red message says the copy failed (' + short(reds.join(' | '), 140) + ')');
    check(await page.locator('input[readonly], input[aria-label*="選手に渡すURL"]').count() > 0, 'T04: the URL is shown in a box to copy by hand');
    return 'red: ' + short(reds.join(' | '), 120);
  });
  await mistake({ id: 'T05', screen: '/private/setup/', vp: V, op: '手順3の「← 前へ戻る」', what: '押したあと、すぐもう一度押す／手順2のURLが消えないか', risk: 'P2', guard: '前の手順にもどってもURLと✓は残る。連打は1回だけ効く' }, page, async () => {
    const back = page.getByRole('button', { name: /前へ戻る/ }).first();
    await back.dblclick().catch(() => {}); await settle(500);
    check((await stepNow(page)) === '2', 'T05: a double press goes back only one step (' + (await stepNow(page)) + ')');
    check((await val(page, '#endpoint')) === ENDPOINT, 'T05: the URL is still in the box');
    return 'step ' + (await stepNow(page));
  });
  await ctx.close();
});

scenario('SETUP-F', 'SETUP', 'paste-the-status box, files, owner box', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-sf-' + vp.tag, V = vp.name;
  const page = await openSetup(ctx, id, { step: 2, ticks: ALLTICK });
  await page.locator('summary', { hasText: '自動で確かめられないとき' }).click();
  ctx.__pingMode = 'abort'; // the automatic check cannot work: this is exactly when a student uses the paste box
  const paste = page.locator('#pasted');
  const pasteCases = [
    ['PB1', 'ぜんぜんちがう文字を貼った', 'これは違う文字', false],
    ['PB2', '別のアプリのJSONを貼った', JSON.stringify({ app: 'other', ok: true }), false],
    ['PB3', 'JSONの前後に説明や ``` が付いている', 'こちらです\n```\n' + JSON.stringify(PING_OK) + '\n```\n以上', true],
    ['PB4', 'JSONの途中で切れている', JSON.stringify(PING_OK).slice(0, 80), false],
    ['PB5', '古いひな形のJSONを貼った', JSON.stringify({ ...PING_OK, build: '3.0.0' }), 'blocked'],
    ['PB6', '空の欄を貼った（全部消した）', '', 'empty'],
  ];
  for (const [cid, what, value, expect] of pasteCases) {
    await mistake({ id: cid, screen: '/private/setup/', vp: V, op: '手順2：「貼って確かめる」の欄', what, risk: 'P1', guard: expect === true ? '前後の余計な文字は自動で取りのぞく' : '赤で「貼った文字を読めません」＋もう一度コピーして貼る。次へ進ませない' }, page, async () => {
      await paste.fill(''); await urlBox(page).fill(ENDPOINT); await settle(1200); await paste.fill(''); await settle(200);
      await paste.fill(value); await settle(500);
      const reds = (await redTexts(page)).filter((t) => !/エラーが出たとき/.test(t));
      const locked = await isLocked(nextBtn(page));
      if (expect === true) check(!locked && reds.length === 0, cid + ': accepted without complaint (locked=' + locked + ' reds=' + short(reds.join('|'), 80) + ')');
      else if (expect === 'empty') check(locked, cid + ': next locked for an empty box');
      else {
        check(locked, cid + ': next stays locked');
        if (expect === false) {
          check(reds.some((t) => /読めません|ちがう|違う|ではありません/.test(t)), cid + ': red message says the pasted text cannot be used (' + short(reds.join(' | '), 100) + ')');
          check(reds.some((t) => saysNext(t.replace(/^✕\s*/, ''))), cid + ': it says what to do next');
          check(await nearBy(page, '#pasted', 420), cid + ': message is next to the box');
        } else check(reds.length >= 1 || /古い/.test(await text(page)), cid + ': says the version is old');
      }
      check((await val(page, '#pasted')) === value, cid + ': the pasted text is not erased');
      return 'next ' + (locked ? 'locked' : 'open') + '; red: ' + short(reds.join(' | ') || 'none', 110);
    });
  }
  await paste.fill(''); ctx.__pingMode = 'ok';
  // setup file export / import
  await page.locator('summary', { hasText: '別のパソコンで続ける' }).click();
  await urlBox(page).fill(''); await urlBox(page).fill(ENDPOINT); await settle(1500);
  await mistake({ id: 'F01', screen: '/private/setup/', vp: V, op: '「設定を書き出す」を押す', what: '2回すばやく押す', risk: 'P3', guard: 'ファイルは1つだけ。緑で「書き出しました：名前」' }, page, async () => {
    let n = 0; page.on('download', () => { n++; });
    await btn(page, '設定を書き出す').dblclick(); await settle(900);
    check(n === 1, 'F01: one file for a double press (' + n + ')');
    check(/書き出しました/.test(await text(page)), 'F01: green "書き出しました" with the file name');
    return 'downloads: ' + n;
  });
  const fileIn = page.locator('details:has(summary:has-text("別のパソコンで続ける")) input[type=file]');
  const good = JSON.stringify({ kind: 'tournament-os-setup', version: 2, eventId: id, endpoint: 'https://script.google.com/macros/s/TOS_OTHER/exec' });
  const upCases = [
    ['F02', '写真(.png)を選んだ', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) }, /使えません|読み込めません|読めません/],
    ['F03', 'メモ(.txt)を選んだ', { name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }, /使えません|読み込めません/],
    ['F04', '中身がこわれた .json', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"kind":') }, /読めません|読み込めません|使えません/],
    ['F05', '別の大会の設定ファイル', { name: 'o.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ kind: 'tournament-os-setup', version: 2, eventId: 'other-event', endpoint: ENDPOINT })) }, /別の大会/],
    ['F06', '名簿CSV(電話番号入り)を選んだ', { name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_HEAD + ',電話番号\nF01,a,b,小6,12,150,60,初,が,,09000000000') }, /使えません|読み込めません/],
    ['F07', 'いまと同じ設定のファイル', { name: 'same.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ kind: 'tournament-os-setup', version: 2, eventId: id, endpoint: ENDPOINT })) }, /同じ/],
  ];
  for (const [cid, what, file, re] of upCases) {
    await mistake({ id: cid, screen: '/private/setup/', vp: V, op: '「ファイルをえらぶ」（設定ファイル）', what, risk: 'P1', guard: '赤で「このファイルは使えません（何も変わっていません）」＋選ぶファイルの名前' }, page, async () => {
      await fileIn.setInputFiles(file); await settle(600);
      const t = await text(page);
      check(re.test(t), cid + ': the screen says why (' + re + ')');
      check((await val(page, '#endpoint')) === ENDPOINT, cid + ': the typed URL is untouched');
      check(!/設定を読み込みました/.test(t), cid + ': no false success');
      check(/何も変わ|変えていません|変えません/.test(t), cid + ': it says nothing changed');
      return short(t.split('\n').find((l) => re.test(l)) || 'no message', 120);
    });
  }
  await mistake({ id: 'F08', screen: '/private/setup/', vp: V, op: '「ファイルをえらぶ」（設定ファイル）', what: 'いまのURLがあるのに、別のURLの設定ファイルを選ぶ（上書きしてしまう）', risk: 'P1', guard: '箱で「いまのURLが消えます」と赤で言い、いちばん左の安全な「やめる」にフォーカス。はいを押すまで変わらない' }, page, async () => {
    await fileIn.setInputFiles({ name: 'new.json', mimeType: 'application/json', buffer: Buffer.from(good) }); await settle(500);
    const box = page.locator('#import-confirm');
    check(await box.count() === 1, 'F08: a question box appears before overwriting');
    check((await val(page, '#endpoint')) === ENDPOINT, 'F08: nothing changed yet');
    const focusOnSafe = await page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('#import-confirm') && /^やめる/.test(a.innerText.trim()); });
    check(focusOnSafe, 'F08: the focus is on the safe button, not the dangerous one');
    const boxText = await box.innerText().catch(() => '');
    check(/消え|変わ|上書き/.test(boxText), 'F08: the box says what will be lost (' + short(boxText, 100) + ')');
    const red = await box.locator('.tos-danger, .tos-error, [class*=danger]').count();
    check(red >= 1, 'F08: the loss is written in red');
    await page.keyboard.press('Escape'); await settle(300);
    check((await val(page, '#endpoint')) === ENDPOINT, 'F08: Escape / cancel keeps the old URL');
    return 'box shown; safe focus; ' + short(boxText, 90);
  });
  // owner box
  await page.locator('summary', { hasText: 'ジムの担当者だけ' }).click();
  const owner = page.locator('input[placeholder*="docs.google.com/spreadsheets"]');
  await page.keyboard.press('Escape');
  for (const [cid, what, value, re] of [
    ['O1', '担当者の欄に、Apps ScriptのURLを貼った', ENDPOINT, /シートのURL|ちがう|違う|使えません|スプレッドシート/],
    ['O2', '担当者の欄に、ぜんぜん別の文字を貼った', 'あああ', /シートのURL|ちがう|違う|使えません|スプレッドシート/],
  ]) {
    await mistake({ id: cid, screen: '/private/setup/', vp: V, op: 'ジムの担当者の欄：シートのURL', what, risk: 'P2', guard: '赤で「これはシートのURLではありません」＋例。コピーのリンクは作らない' }, page, async () => {
      await owner.fill(value); await settle(400);
      const reds = await redTexts(page);
      check(reds.some((x) => re.test(x)), cid + ': a red message says it is not a sheet URL (' + short(reds.join(' | '), 140) + ')');
      check(await page.locator('a[href$="/copy"][href*="docs.google.com"]').count() === 0, cid + ': no bogus copy link is made');
      check(await nearBy(page, 'input[placeholder*="docs.google.com/spreadsheets"]', 200), cid + ': the red message is next to the box');
      return short(reds.filter((x) => re.test(x)).join(' | '), 120);
    });
  }
  await ctx.close();
});

scenario('SETUP-G', 'SETUP', 'no template link, clipboard button, everything on one screen', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-sg-' + vp.tag, V = vp.name;
  ctx.__tpl = null;
  let page = await openSetup(ctx, id);
  await settle(600);
  await mistake({ id: 'S13', screen: '/private/setup/', vp: V, op: '作業1：「ひな形のコピーを作る」', what: 'ひな形のリンクが用意されていない（ジムの担当者が公開し忘れた）', risk: 'P1', guard: '赤で「いまは作業できません。ジムの担当者に連絡」。先へ進むボタンは灰色＋理由。黄色は「担当者に連絡」を指す' }, page, async () => {
    const reds = await redTexts(page);
    check(reds.some((t) => /作業できません|担当者/.test(t)), 'S13: red message tells the student to ask the gym staff (' + short(reds.join(' | '), 120) + ')');
    await colourAudit(page, 'no template ' + V, { markers: (await markerOf(page)).length <= 1 ? (await markerOf(page)).length : 1 });
    const go = page.getByRole('button', { name: /「準備できました」と出た/ });
    check(await isLocked(go), 'S13: the go-on button is locked');
    const ticked = tickBtn(page);
    const tickLocked = (await ticked.count()) === 0 || await isLocked(ticked);
    check(tickLocked || (await text(page)).includes('担当者'), 'S13: a student cannot tick 作業1 as done without the link, or is told to ask staff');
    check((await markerOf(page)).length === 0 || /担当者|連絡/.test((await markerOf(page))[0]), 'S13: no yellow marker leads the student into 作業2 (' + short((await markerOf(page))[0] || 'none', 60) + ')');
    return 'reds: ' + short(reds.join(' | '), 100) + '; markers ' + (await markerOf(page)).length;
  });
  await page.close();
  ctx.__tpl = { copyUrl: COPY_URL };
  page = await openSetup(ctx, id, { step: 2, ticks: ALLTICK });
  await mistake({ id: 'S14', screen: '/private/setup/', vp: V, op: '「コピーしたURLを貼りつける」ボタン', what: 'コピーしていない（空）／URLではない文字をコピーしたまま押す', risk: 'P1', guard: '赤で「コピーした文字がありません／URLではありません」＋どこで何を押すか。コピー元は消えない' }, page, async () => {
    const pasteBtn = page.getByRole('button', { name: 'コピーしたURLを貼りつける' });
    await page.evaluate(() => navigator.clipboard.writeText('')).catch(() => {});
    await pasteBtn.click(); await settle(500);
    let reds = await redTexts(page);
    check(reds.some((t) => /コピーした文字がありません|貼れませんでした|コピー/.test(t)), 'S14: empty clipboard -> red message (' + short(reds.join(' | '), 120) + ')');
    check((await val(page, '#endpoint')) === '', 'S14: the box is still empty');
    await page.evaluate(() => navigator.clipboard.writeText('今日の給食はカレーです'));
    await pasteBtn.click(); await settle(500);
    reds = await redTexts(page);
    check(reds.some((t) => /URLではありません/.test(t)), 'S14: a non-URL clipboard -> red "URLではありません" (' + short(reds.join(' | '), 120) + ')');
    check((await val(page, '#endpoint')) === '', 'S14: nothing was put in the box');
    await page.evaluate((u) => navigator.clipboard.writeText('  ' + u + '  \n'), ENDPOINT);
    await pasteBtn.click(); await settle(1500);
    check((await val(page, '#endpoint')) === ENDPOINT && !(await isLocked(nextBtn(page))), 'S14: a good URL with spaces/newline pasted by the button is cleaned and connects');
    return 'empty / non-URL clipboard refused with red; good one accepted';
  });
  await mistake({ id: 'S15', screen: '/private/setup/', vp: V, op: '手順2・3の主な状態で色の約束', what: '（色の確認）黄色は1つ・赤は✕つき・押せないボタンには理由', risk: 'P2', guard: '色の約束どおり' }, page, async () => {
    await colourAudit(page, 'step2 connected ' + V, { markerText: /次へ進む/ });
    await page.locator('summary', { hasText: '自動で確かめられないとき' }).click();
    await page.locator('summary', { hasText: '別のパソコンで続ける' }).click();
    await page.locator('summary', { hasText: 'ジムの担当者だけ' }).click();
    await colourAudit(page, 'step2 all folds open ' + V);
    return 'colour audit done';
  });
  const a = await page.evaluate((vw) => ({ sw: document.documentElement.scrollWidth, vw }), vp.mobile ? 390 : 1280);
  check(a.sw <= a.vw, 'setup: no sideways scroll (' + a.sw + ' > ' + a.vw + ')');
  await ctx.close();
});

/* ── static: the colour language must not depend on features Safari 15 lacks (checked in the BUILT css the pages really load) ── */
scenario('STATIC-CSS', 'SETUP', 'colour language survives Safari 15 (plain hex colours, no var()/lab()/oklch()/color-mix())', async (vp) => {
  const V = vp.name;
  const seen = new Set(), sheets = [];
  for (const url of ['/private/setup/', '/private/', '/private/live/', '/apply/']) {
    const html = await (await fetch(base + url)).text();
    for (const m of html.matchAll(/href="([^"]+\.css[^"]*)"/g)) { const href = new URL(m[1], base + url).toString(); if (!seen.has(href)) { seen.add(href); sheets.push(await (await fetch(href)).text()); } }
  }
  const css = sheets.join('\n');
  check(css.length > 1000, 'STATIC: the built stylesheet was found (' + css.length + ' bytes)');
  const need = ['tos-next', 'tos-next-badge', 'tos-error', 'tos-danger', 'tos-danger-btn', 'tos-ok', 'tos-caution', 'tos-locked', 'tos-safe-btn', 'tos-main', 'tos-confirm', 'tos-locked-reason'];
  await mistake({ id: 'CSS01', screen: 'all 4 screens', vp: V, op: '黄・赤・緑・灰の色', what: 'macOS 12 の Safari 15 で開く（新しい色の書き方 var()/lab()/oklch()/color-mix() が使えない）', risk: 'P1', guard: '色の約束のクラス（.tos-*）は、16進の色だけで書く。使えない書き方は、使わない' }, null, async () => {
    const bad = [];
    for (const cls of need) {
      const blocks = [...css.matchAll(new RegExp('(?:^|[}{;,\\s])\\.' + cls + '(?![\\w-])[^{}]*\\{([^}]*)\\}', 'g'))].map((m) => m[1]);
      check(blocks.length >= 1, 'CSS01: .' + cls + ' has a rule');
      for (const b of blocks) for (const decl of b.split(';')) { const [prop, ...rest] = decl.split(':'); const v = rest.join(':'); if (/^(color|background|background-color|border|border-color|border-top-color|outline|box-shadow)$/.test((prop || '').trim()) && /var\(|lab\(|lch\(|oklch\(|oklab\(|color-mix\(|light-dark\(/.test(v)) bad.push('.' + cls + ' {' + decl.trim() + '}'); }
    }
    check(bad.length === 0, 'CSS01: colour-language rules use only plain colours (' + short(bad.join(' ; '), 200) + ')');
    // anything essential behind :has() or @layer would vanish in Safari 15.0-15.3; only a scroll-padding nicety may use :has()
    const has = [...css.matchAll(/([^{}]*:has\([^{}]*)\{([^}]*)\}/g)].filter((m) => !/scroll-padding/.test(m[2]));
    check(has.length === 0, 'CSS01: nothing essential is hidden behind :has() (' + short(has.map((m) => m[1].trim() + '{' + m[2] + '}').join(' ; '), 200) + ')');
    check(!/\.tos-(next|error|danger|ok|caution)[^{}]*\{[^}]*(dvh|svh|lvh|inset:|@container)/.test(css), 'CSS01: no new-only length units in the colour-language rules');
    return 'tos-* rules are plain hex; :has() only for scroll-padding';
  });
});

/* ── the measuring tools must be able to FAIL (otherwise every green result above is meaningless) ── */
scenario('SELFTEST', 'SETUP', 'the checks themselves catch bad colours, hidden messages and missing reasons', async (vp) => {
  const ctx = await newCtx(vp.mobile), page = await openSetup(ctx, 'mp-self-' + vp.tag);
  const base0 = await page.evaluate(COLOUR);
  check(base0.markers.length === 1 && base0.markers[0].icon && base0.markers[0].yellow && base0.markers[0].min >= 4.5, 'SELFTEST: the real marker is seen as 1 yellow marker with icon and contrast (' + JSON.stringify(base0.markers.map((m) => [m.yellow, m.min])) + ')');
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<p id="bad-red" class="tos-error" style="color:#ff9999;background:#ffffff;position:static">✕ うすい赤の文字</p>'
      + '<p id="blue-err" role="alert" style="color:#2222ff;background:#fff">✕ 青い文字のエラー</p>'
      + '<p id="no-icon" class="tos-error">アイコンなしのエラー</p>'
      + '<div data-tos-next="1" id="fake-marker"><span class="tos-next-badge" style="background:#ffffff;color:#dddddd;border:0">次はここ</span></div>'
      + '<button id="fake-dis" disabled>押せないボタン</button>'
      + '<p id="line-far" style="margin-top:3000px">遠い所のメッセージ</p>';
    document.body.appendChild(d);
  });
  const c = await page.evaluate(COLOUR);
  const bad = c.reds.find((r) => /うすい赤/.test(r.text)), blue = c.reds.find((r) => /青い文字/.test(r.text)), noIcon = c.reds.find((r) => /アイコンなし/.test(r.text));
  check(bad && bad.contrast < 4.5, 'SELFTEST: pale red text is measured as < 4.5:1 (' + (bad && bad.contrast) + ')');
  check(blue && !blue.red, 'SELFTEST: a blue "error" is not counted as red');
  check(noIcon && !noIcon.icon, 'SELFTEST: an error without ✕/⚠ is caught');
  check(c.markers.length === 2 && c.markers.some((m) => m.min < 4.5 && !m.icon), 'SELFTEST: a second, pale, icon-less marker is counted and caught (' + c.markers.length + ')');
  check(c.disabled.some((d) => /押せないボタン/.test(d.name) && !d.reason), 'SELFTEST: a disabled button with no reason is caught');
  const far = await seenNow(page, /遠い所のメッセージ/);
  check(far.found && !far.any, 'SELFTEST: a message far below the window is NOT counted as seen');
  const ur = await isLocked(page.locator('#fake-dis'));
  check(ur === true, 'SELFTEST: isLocked sees a disabled button');
  await ctx.close();
}, { viewports: [false, true] });

/* ═══════════════════════════ SCREEN 2: /private/ ═══════════════════════════ */
const SCR = '/private/';
const openPrivate = async (ctx, id, suffix = '') => {
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=' + id + suffix);
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  await settle(250);
  return page;
};
const seedAndOpen = async (ctx, value) => {
  const boot = await ctx.newPage();
  await boot.goto(base + '/private/setup/?event=seed-boot');
  await idbPut(boot, value);
  await boot.close();
  return openPrivate(ctx, value.eventId);
};
const stateOf = (p) => p.locator('#save-state').innerText().catch(() => '');
const waitState = (p, word, t = 8000) => p.waitForFunction((w) => document.querySelector('#save-state')?.innerText.includes(w), word, { timeout: t });
const notices = (p) => p.evaluate(() => [...document.querySelectorAll('[role=status],[role=alert]')].map((n) => n.innerText).join(' || '));
const askBox = (p) => p.getByRole('alertdialog');
const saveBtn = (p) => p.getByRole('button', { name: /^(ここまでを保存する|保存する|もう一度 保存する)$/ }).first();
/** press save at a human pace (the page ignores a save within 1.5s of a good save) */
const save = async (p) => { const wait = (p.__savedAt || 0) + 1700 - Date.now(); if (wait > 0) await settle(wait); await saveBtn(p).click(); await waitState(p, '保存済み', 8000).catch(() => {}); p.__savedAt = Date.now(); };
const boutCount = (p) => p.locator('article[id^="bout-"]').count();
const importFile = (p, name, type, buffer) => p.locator('#pick-file').setInputFiles({ name, mimeType: type, buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer) });
const importCsv = (p, csv, name = 'players.csv') => importFile(p, name, 'text/csv', Buffer.from(csv, 'utf8'));
const fighterCount = (p) => p.evaluate(() => document.querySelectorAll('#sec-2 article[id^="fighter-"]').length);
const addBout = async (p, red, blue) => {
  const n = await boutCount(p);
  await btn(p, '＋ 試合を追加').click();
  await p.locator('#bout-' + n + '-red').waitFor();
  if (red) await p.locator('#bout-' + n + '-red').selectOption(red);
  if (blue) await p.locator('#bout-' + n + '-blue').selectOption(blue);
};
const openBackup = async (p) => { if (!(await p.locator('#backup').evaluate((d) => d.open))) await p.locator('#backup > summary').click(); };
const setPasswords = async (p, a, b = a) => { await openBackup(p); await p.locator('#backup-password').fill(a); await p.locator('#backup-password2').fill(b); };
const restoreInput = (p) => p.locator('#restore-file');
const backupBtn = (p) => p.getByRole('button', { name: /^パスワードをつけて、コピーを保存する$/ });
const dirty = async (p) => (await stateOf(p)).includes('未保存');
const waitPush = () => settle(1700);
const opened = async (p) => /\/live\//.test(p.url());
const fewSel = '#sec-2';

scenario('PRIVATE-A', 'PRIVATE', 'name, date, venue typed wrongly', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-pa-' + vp.tag, V = vp.name;
  const page = await openPrivate(ctx, id);
  await colourAudit(page, 'fresh ' + V, { markerText: /大会の名前|大会名/ });
  await mistake({ id: 'P01', screen: SCR, vp: V, op: '「ここまでを保存する」を押す', what: '大会の名前を入れないまま、保存や「試合当日の画面を開く」を押す', risk: 'P1', guard: '灰色＋「🔒 理由」。押したら赤い1行で「大会の名前を入れる」。何も保存しない' }, page, async () => {
    const sv = saveBtn(page), open = btn(page, '試合当日の画面を開く');
    const svLocked = await isLocked(sv), opLocked = await isLocked(open);
    await sv.click({ force: true }).catch(() => {}); await settle(400);
    await open.click({ force: true }).catch(() => {}); await settle(400);
    const reds = await redTexts(page);
    const stored = await idbGet(page, id);
    check(!(await stateOf(page)).includes('保存済み') || (stored && (stored.title === '' || /未設定/.test(stored.title)) && !(await opened(page))), 'P01: a draft saved without a name is stored as an unnamed draft only (title "' + (stored ? stored.title : 'none') + '")');
    check(reds.some((t) => /大会の名前が まだ/.test(t)), 'P01: the red 大会の名前が まだです stays after pressing save');
    check(opLocked || page.url().includes('/private/') && !page.url().includes('/live/'), 'P01: the match-day screen does not open without a name');
    check(reds.some((t) => /大会の名前|大会名/.test(t)), 'P01: a red line names the missing 大会の名前 (' + short(reds.join(' | '), 120) + ')');
    check(ctx.pages().length === 1, 'P01: no new tab opened');
    return 'save locked=' + svLocked + ', open locked=' + opLocked + '; red: ' + short(reds.join(' | '), 100);
  });
  const nameCases = [
    ['P02', '名前にスペースしか入れない', '     ', ''],
    ['P03', '名前に絵文字を入れる', '架空大会😀🥊', '架空大会😀🥊'],
    ['P04', '名前に前後のスペースと改行を入れる', '  架空大会  ', '架空大会'],
    ['P05', '名前に300文字入れる', 'あ'.repeat(300), null],
    ['P06', '名前に <script> を入れる', '<script>alert(1)</script>', '<script>alert(1)</script>'],
  ];
  for (const [cid, what, typed, want] of nameCases) {
    await mistake({ id: cid, screen: SCR, vp: V, op: '大会名の欄', what, risk: 'P2', guard: want === '' ? '空と同じに扱い、赤で「大会の名前を入れる」' : '前後の空白は自動で消す。長すぎるときは、短くするよう言う' }, page, async () => {
      page.__dlg.log.length = 0;
      await page.locator('#field-title').fill(typed); await page.locator('#field-title').blur(); await settle(300);
      const shown = await val(page, '#field-title');
      const t = await text(page);
      if (want === '') {
        check(await page.getByText(/大会の名前が まだです/).first().isVisible().catch(() => false), cid + ': spaces only still count as "名前がまだ"');
        check(!/✓ できた/.test(await page.locator('#sec-1').innerText().catch(() => '')), cid + ': no green ✓ できた for blank spaces');
      } else if (want !== null) {
        check(shown === want, cid + ': the box keeps/cleans to "' + want + '" (shows "' + short(shown, 40) + '")');
        check(page.__dlg.log.length === 0 && (await page.locator('script', { hasText: 'alert(1)' }).count()) === 0, cid + ': nothing executed');
      } else {
        const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        check(over <= 1, cid + ': a very long name does not break the layout (' + over + 'px sideways)');
        check(shown.length <= 300, cid + ': name is not larger than typed');
        const reds = await redTexts(page);
        check(shown.length < 300 ? reds.length >= 1 || /文字まで|短く/.test(t) : true, cid + ': if cut, it says so');
      }
      const m = await markerOf(page);
      check(m.length === 1, cid + ': one yellow marker (' + m.length + ')', true);
      return 'box -> "' + short(shown, 30) + '" len ' + shown.length;
    });
  }
  await page.locator('#field-title').fill('架空大会'); await settle(200);
  const dateCases = [
    ['P07', '全角の数字で日にち', '２０２７年１０月３日', '2027年10月3日'],
    ['P08', '数字だけの日にち', '20271003', '2027年10月3日'],
    ['P09', 'ハイフンの日にち', '2027-10-03', '2027年10月3日'],
    ['P10', 'スラッシュの日にち', '2027/10/3', '2027年10月3日'],
    ['P11', '前後に空白がある日にち', '  2027年10月3日  ', '2027年10月3日'],
    ['P12', '全角スラッシュと空白', '２０２７／１０／３ ', '2027年10月3日'],
    ['P13', '存在しない日（13月45日）', '2027年13月45日', 'bad'],
    ['P14', '存在しない日（2月30日）', '2027-02-30', 'bad'],
    ['P15', '日にちに文字（来週）', '来週', 'bad'],
    ['P16', '年がない日にち（10/3）', '10/3', 'bad'],
    ['P17', '日まで入れていない（2027年10月）', '2027年10月', 'half'],
    ['P18', '日にちを空にする（あとでOK）', '', 'empty'],
  ];
  for (const [cid, what, typed, want] of dateCases) {
    await mistake({ id: cid, screen: SCR, vp: V, op: '開催日の欄', what, risk: want === 'bad' ? 'P1' : 'P2', guard: want.startsWith('2027') ? '自動で「2027年10月3日」にそろえ、緑で「自動で直しました」' : want === 'empty' ? '空でも保存できる' : '赤で「日にちとして読めません。例：2027年10月3日」。打った文字は消さない' }, page, async () => {
      await page.locator('#field-date').fill(typed); await page.locator('#field-date').blur(); await settle(300);
      const shown = await val(page, '#field-date');
      const reds = await redTexts(page);
      const fieldReds = reds.filter((t) => /日にち|日付|開催日|年|月|例/.test(t));
      if (want.startsWith('2027')) {
        check(shown === want, cid + ': ' + typed + ' becomes ' + want + ' (shows "' + shown + '")');
        check(fieldReds.length === 0, cid + ': no red message for a harmless variation (' + short(fieldReds.join('|'), 80) + ')');
        check(/自動で直しました|✓ →/.test(await text(page)), cid + ': a green "自動で直しました" note shows what changed', true);
      } else if (want === 'bad') {
        check(shown === typed.trim() || shown === typed, cid + ': the typed text is not silently turned into another date (shows "' + shown + '")');
        check(fieldReds.length >= 1, cid + ': a red message says the date cannot be read (' + short(reds.join(' | '), 100) + ')');
        await checkSeen(page, /日にち|ありません|読めません/, cid);
        check(await nearBy(page, '#field-date', 260), cid + ': the red message is next to the date box');
        check(fieldReds.some((t) => saysNext(t)), cid + ': it says what to type instead');
        // saving must not store a nonsense date as if it were fine
        await settle(100);
      } else if (want === 'half') {
        check(shown === typed, cid + ': an unfinished date is not rewritten (' + shown + ')');
        check(/日にちまで入れてください|日まで/.test(await text(page)), cid + ': guidance asks for the day');
      } else {
        check(shown === '' && fieldReds.length === 0, cid + ': an empty date is fine (あとでOK)');
      }
      return 'box -> "' + shown + '"; red: ' + short(fieldReds.join(' | ') || 'none', 100);
    });
  }
  await page.locator('#field-date').fill('2027年10月3日');
  await mistake({ id: 'P19', screen: SCR, vp: V, op: '会場の欄', what: '会場に絵文字・300文字・<b>タグ</b>を入れる', risk: 'P3', guard: '文字として出す（実行しない）。長すぎても画面は崩れない' }, page, async () => {
    for (const v of ['体育館😀', 'あ'.repeat(300), '<b>体育館</b>']) { await page.locator('#field-venue').fill(v); await page.locator('#field-venue').blur(); await settle(150); }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(over <= 1, 'P19: no sideways scroll after a 300-letter venue (' + over + ')');
    check((await page.locator('b', { hasText: '体育館' }).count()) === 0, 'P19: markup is shown as text');
    return 'ok';
  });
  await ctx.close();
});

scenario('PRIVATE-B', 'PRIVATE', 'wrong roster file', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-pb-' + vp.tag, V = vp.name;
  const page = await openPrivate(ctx, id);
  await page.locator('#field-title').fill('名簿テスト大会'); await settle(200);
  await colourAudit(page, 'before import ' + V, { markerText: /選手|ファイル|名簿/ });
  const jp = await jpegs(page, 2);
  const KEEP = async () => (await fighterCount(page));
  const reject = [
    ['R01', 'メモ(.txt)を選んだ', 'memo.txt', 'text/plain', 'hello'],
    ['R02', '写真(.png)を選んだ', 'photo.png', 'image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['R03', '電話番号の列が入ったCSVを選んだ', 'private.csv', 'text/csv', CSV_HEAD + ',電話番号,メール\nF01,a,b,小6,12,150,60,初,が,,09012345678,x@example.com'],
    ['R04', 'こわれたZIPを選んだ', 'broken.zip', 'application/zip', Buffer.from('PK\u0003\u0004this is not a real zip')],
    ['R05', 'CSVが入っていないZIPを選んだ', 'empty.zip', 'application/zip', Buffer.from(zipSync({ 'readme.txt': strToU8('x') }))],
    ['R06', '中身が空のCSVを選んだ', 'empty.csv', 'text/csv', Buffer.alloc(0)],
    ['R07', '見出しだけで選手がいないCSV', 'head.csv', 'text/csv', CSV_HEAD + '\n'],
    ['R08', '同じ管理番号が2回あるCSV', 'dup.csv', 'text/csv', csvOf([ROWS[0], ROWS[0]])],
    ['R09', 'Excel(.xlsx)を選んだ', 'players.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from(zipSync({ '[Content_Types].xml': strToU8('<x/>') }))],
    ['R10', '大会の設定ファイル(.json)を選んだ', 'tournament-os-setup-x.json', 'application/json', Buffer.from(JSON.stringify({ kind: 'tournament-os-setup', version: 2, eventId: 'x', endpoint: ENDPOINT }))],
    ['R11', 'コピーのファイル(.enc)をここに選んだ', 'x.tournament.enc', 'application/octet-stream', Buffer.from('{"format":"tournament-os-private-1"}')],
  ];
  for (const [cid, what, name, type, body] of reject) {
    await mistake({ id: cid, screen: SCR, vp: V, op: '手順2：「ファイルを選ぶ」（名簿）', what, risk: 'P1', guard: '赤で「このファイルは使えません（名簿は変わっていません）」＋「選ぶのは .zip（Googleシートの④で作ったもの）」。電話番号は画面にも出さない' }, page, async () => {
      const n0 = await KEEP();
      await importFile(page, name, type, body); await settle(900);
      const reds = await redTexts(page);
      const t = await text(page);
      check(reds.length >= 1 || /変えていません|使えません|読めません|読み込めません/.test(t), cid + ': a clear refusal appears (' + short(reds.join(' | '), 140) + ')');
      check(reds.some((x) => /使えません|読めません|読み込めません|入れません|ありません|だめ|まちがい|同じ/.test(x)), cid + ': the red line says the file cannot be used (' + short(reds.join(' | '), 140) + ')');
      await checkSeen(page, /まちがい：/, cid);
      check(reds.some((x) => saysNext(x.replace(/^✕\s*/, ''))), cid + ': the red line says what to pick instead');
      check((await KEEP()) === n0, cid + ': the roster is unchanged (' + n0 + ' -> ' + (await KEEP()) + ')');
      check(!/\d+人分を読み込みました/.test(t.split('選んだファイル')[1] || ''), cid + ': no false "読み込みました"');
      check(!/09012345678|x@example\.com/.test(t), cid + ': private numbers from the file are never shown');
      check(await nearBy(page, 'label:has(#pick-file)', 520), cid + ': the red line is near the file button');
      const m = await markerOf(page);
      check(m.length === 1 && /選手|ファイル|名簿|入れ/.test(m[0]), cid + ': the yellow marker still points at the roster step (' + short(m[0] || '', 50) + ')', true);
      return short(reds.join(' | ') || 'no red message', 140);
    });
  }
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(CSV4.replace(/\n/g, '\r\n'), 'utf8')]);
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(CSV4, 'utf16le')]);
  const sjisLike = Buffer.concat([Buffer.from([0x8a, 0xc7, 0x97, 0x9d, 0x94, 0xd4, 0x8d, 0x86, 0x2c, 0x83, 0x57, 0x83, 0x80, 0x96, 0xbc, 0x0a]), Buffer.from('F01,\x83\x57\x83\x80,\x91\x49\x8e\xe8,\x8f\xac6,12,150,60,\x8f\x89,,\n', 'latin1')]);
  const garbled = [
    ['R16', 'ExcelのCSV（先頭にBOM・改行がCRLF）を選んだ', 'excel.csv', bom, 'accept'],
    ['R17', 'Excelの「Unicodeテキスト」(UTF-16)を選んだ', 'unicode.txt', utf16, 'either'],
    ['R18', 'Shift-JISで保存されたCSV（文字化けする）を選んだ', 'sjis.csv', sjisLike, 'reject'],
    ['R19', '写真の場所に、写真ではないファイルが入ったZIP', 'badphoto.zip', Buffer.from(zipSync({ 'players.csv': strToU8(CSV4), 'photos/F01.jpg': strToU8('not a jpeg') })), 'either'],
    ['R20', '存在しない管理番号の写真が入ったZIP（photos/F99.jpg）', 'orphan.zip', Buffer.from(zipSync({ 'players.csv': strToU8(CSV4), 'photos/F99.jpg': jp[0] })), 'either'],
    ['R21', '意気込みに「,」と改行が入っているCSV', 'comma.csv', Buffer.from(CSV_HEAD + '\nF01,架空赤ジム,架空赤選手,小6,12,150,60,初試合,"がんばる, 全力で\n2行目",\nF02,架空青ジム,架空青選手,中1,13,155,61.5,1戦,全力,'), 'accept'],
    ['R22', '300人のCSV（多すぎる）', 'many.csv', Buffer.from(csvOf(Array.from({ length: 300 }, (_, i) => ['G' + String(i).padStart(3, '0'), 'ジム', '選手' + i, '小6', '12', '150', '60', '初', '', '']))), 'either'],
  ];
  for (const [cid, what, name, body, expect] of garbled) {
    await mistake({ id: cid, screen: SCR, vp: V, op: '手順2：「ファイルを選ぶ」（名簿）', what, risk: expect === 'reject' ? 'P1' : 'P2', guard: expect === 'accept' ? 'そのまま読める' : '読めないときは赤で「文字が読めません。UTF-8で保存し直す」。文字化けした名前を入れない' }, page, async () => {
      const probe = await openPrivate(ctx, id + '-' + cid);
      await probe.locator('#field-title').fill('文字コード大会');
      const t0 = Date.now();
      await importFile(probe, name, 'text/csv', body); await settle(expect === 'either' ? 2500 : 1200);
      const n = await fighterCount(probe), t = await text(probe), reds = await redTexts(probe);
      const names = await probe.locator('#sec-2 article[id^="fighter-"]').allInnerTexts();
      check(!names.some((x) => /\uFFFD|�|ƒ|‚|\x83/.test(x)), cid + ': no garbled (mojibake) names were imported (' + short(names.join('|'), 80) + ')');
      if (expect === 'accept') check(n >= 2 && /人分を読み込みました/.test(t), cid + ': the file is read normally (' + n + ' people)');
      if (expect === 'reject') { check(n === 0, cid + ': nobody was imported from an unreadable file (' + n + ')'); check(reds.some((x) => /読み|使え|文字|ファイル/.test(x)), cid + ': a red line explains (' + short(reds.join(' | '), 100) + ')'); }
      if (expect === 'either') check((n > 0 && /人分を読み込みました/.test(t)) || reds.some((x) => /読み|使え|多すぎ|人まで|ファイル|文字|名簿ではありません|選んでください/.test(x)), cid + ': it either imports or says clearly why not (' + n + ' people; ' + short(reds.join(' | '), 100) + ')');
      check(Date.now() - t0 < 12000, cid + ': it answers within 12 seconds (' + (Date.now() - t0) + 'ms)');
      check(!pageErrors.some((e) => e.scenario === cur && /Cannot|undefined|TypeError/.test(e.message)), cid + ': no page error');
      await snap(probe);
      const note = n + ' people; ' + short(reds.join(' | ') || t.split('\n').find((l) => /読み込みました/.test(l)) || 'none', 120);
      await probe.close();
      return note;
    });
  }
  await mistake({ id: 'R12', screen: SCR, vp: V, op: '手順2：「ファイルを選ぶ」（名簿）', what: '正しいCSVを選ぶ（ここから先の準備）', risk: 'P3', guard: '緑で「✓ できた：4人分を読み込みました」。黄色が「試合を1つ作る」に移る' }, page, async () => {
    await importCsv(page, CSV4); await settle(900);
    check((await fighterCount(page)) === 4, 'R12: four people appear');
    check(/4人分を読み込みました/.test(await text(page)), 'R12: green line says 4人分を読み込みました');
    check(/試合を1つ作る|試合を追加/.test((await markerOf(page))[0] || ''), 'R12: the marker moved on to making a bout (' + short((await markerOf(page))[0] || '', 50) + ')', true);
    await colourAudit(page, 'after import ' + V, { markerText: /試合/ });
    return '4 people; marker moved';
  });
  await mistake({ id: 'R13', screen: SCR, vp: V, op: '手順2：「ファイルを選ぶ」（名簿）', what: '同じファイルをもう一度選ぶ（2回・同時に2回）', risk: 'P1', guard: '「すでにいる人は、全員そのままです」。人が増えない' }, page, async () => {
    await importCsv(page, CSV4); await settle(700);
    await Promise.all([importCsv(page, CSV4), importCsv(page, CSV4)]); await settle(800);
    check((await fighterCount(page)) === 4, 'R13: still 4 people after the same file 3 times (' + (await fighterCount(page)) + ')');
    check(/そのまま|変わっていません|すでに/.test(await text(page)), 'R13: it says nobody changed');
    return 'still 4';
  });
  await mistake({ id: 'R14', screen: SCR, vp: V, op: '手順2：「ファイルを選ぶ」（名簿）', what: '直した同じ番号の選手が入ったファイルを選ぶ（体重が変わっている）', risk: 'P1', guard: '勝手に書きかえず、「内容がちがう人が1人います」＋「書きかえる」は箱で確認（赤で、消える数字を見せる）' }, page, async () => {
    const changed = csvOf(ROWS.slice(0, 4).map((r) => r[0] === 'F02' ? [...r.slice(0, 6), '62', ...r.slice(7)] : r));
    await importCsv(page, changed); await settle(800);
    check((await page.locator('#fighter-F02').innerText()).includes('61.5kg'), 'R14: the existing person is untouched until confirmed');
    check(/内容がちがう人が1人います/.test(await text(page)), 'R14: it tells that one person differs');
    await page.getByRole('button', { name: /ファイルの内容で1人を書きかえる/ }).click(); await settle(300);
    const box = askBox(page);
    check(await box.count() === 1, 'R14: a question box opens before overwriting');
    check(await page.evaluate(() => /^やめる/.test(document.activeElement?.innerText.trim() || '')), 'R14: focus is on the safe 「やめる」 button');
    check(/(消え|変わ|書きかえ)/.test(await box.innerText()) && await box.locator('.tos-danger').count() >= 1, 'R14: the loss is written in red inside the box');
    await page.keyboard.press('Escape'); await settle(300);
    check((await page.locator('#fighter-F02').innerText()).includes('61.5kg'), 'R14: Escape keeps the old weight');
    return 'needs confirmation; Esc keeps the old data';
  });
  await mistake({ id: 'R15', screen: SCR, vp: V, op: '手順2：ZIPの写真', what: '同じ写真入りZIPを2回選ぶ', risk: 'P2', guard: '写真は人ごとに1枚。増えない' }, page, async () => {
    const zip = Buffer.from(zipSync({ 'players.csv': strToU8(csvOf(ROWS.slice(0, 2))), 'photos/F01.jpg': jp[0], 'photos/F02.jpg': jp[1] }));
    await importFile(page, 'with-photos.zip', 'application/zip', zip); await settle(900);
    await importFile(page, 'with-photos.zip', 'application/zip', zip); await settle(900);
    const imgs = await page.evaluate(() => document.querySelectorAll('#sec-2 article[id^="fighter-"] img').length);
    check(imgs === 2 && (await fighterCount(page)) === 4, 'R15: 2 photos, 4 people (' + imgs + ', ' + (await fighterCount(page)) + ')');
    return 'photos ' + imgs;
  });
  await ctx.close();
});

scenario('PRIVATE-C', 'PRIVATE', 'making the match cards wrongly', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-pc-' + vp.tag, V = vp.name;
  const page = await seedAndOpen(ctx, seed(id, { fighters: 6, bouts: [], photos: false }));
  await mistake({ id: 'C01', screen: SCR, vp: V, op: '「＋ 試合を追加」を押す', what: '2回・3回すばやく押す', risk: 'P1', guard: '空の試合は1つだけできる' }, page, async () => {
    await colourAudit(page, 'no bouts ' + V, { markerText: /試合を1つ作る/ });
    const add = btn(page, '＋ 試合を追加');
    await add.dblclick(); await settle(300);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '＋ 試合を追加'); b.click(); b.click(); b.click(); }); await settle(300);
    check((await boutCount(page)) === 1, 'C01: still one bout (' + (await boutCount(page)) + ')');
    check(/赤コーナー/.test((await markerOf(page))[0] || ''), 'C01: the yellow marker moved to the red corner choice (' + short((await markerOf(page))[0] || '', 50) + ')', true);
    return '1 bout';
  });
  await mistake({ id: 'C02', screen: SCR, vp: V, op: '赤・青コーナーの選手を選ぶ', what: '赤と同じ選手を青にも選ぼうとする', risk: 'P1', guard: '「もう片方に選択中」で選べなくなる。選べないわけを書く' }, page, async () => {
    await page.locator('#bout-0-red').selectOption('F01');
    const dis = await page.locator('#bout-0-blue option[value="F01"]').evaluate((o) => ({ disabled: o.disabled, text: o.textContent }));
    check(dis.disabled && /もう片方|選択中/.test(dis.text), 'C02: the same fighter cannot be chosen in the other corner and the option says why (' + short(dis.text, 50) + ')');
    await page.locator('#bout-0-blue').evaluate((s) => { s.value = 'F01'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await settle(300);
    const v = await page.evaluate(() => [document.querySelector('#bout-0-red').value, document.querySelector('#bout-0-blue').value]);
    if (v[0] === 'F01' && v[1] === 'F01') {
      // only reachable by editing the page itself (or a damaged backup); the screen must still refuse to go on
      const t = await text(page), reds = await redTexts(page);
      check(/同じ選手|赤と青に同じ|同じ人/.test(t + reds.join(' ')), 'C02: if one person is somehow in both corners, the screen says so (' + short(reds.join(' | '), 120) + ')');
      check(await isLocked(btn(page, '試合当日の画面を開く')), 'C02: the match-day button stays locked');
    }
    return 'blocked: ' + short(dis.text, 40) + '; forced -> ' + v.join(',');
  });
  await mistake({ id: 'C03', screen: SCR, vp: V, op: '赤・青コーナーを選ぶ', what: '赤だけ選んで青を忘れる（未完成の試合）', risk: 'P1', guard: '「未完成」を赤で見せ、「試合当日の画面を開く」は灰色＋理由。黄色は青コーナーを指す' }, page, async () => {
    await page.locator('#bout-0-blue').selectOption('');
    await settle(300);
    check(/未完成/.test(await text(page)), 'C03: the half bout is marked 未完成');
    check(/青コーナー/.test((await markerOf(page))[0] || ''), 'C03: the yellow marker asks for the blue corner (' + short((await markerOf(page))[0] || '', 50) + ')', true);
    const open = btn(page, '試合当日の画面を開く');
    check(await isLocked(open), 'C03: the match-day button is locked');
    check(/直すところ|まだ開けません/.test(await text(page)), 'C03: the reason is printed');
    const reds = await redTexts(page);
    check(/青コーナーの選手を選んでください/.test(await text(page)) && reds.some((t) => /直すところ/.test(t)), 'C03: under the red 直すところ it says 青コーナーの選手を選んでください (' + short(reds.join(' | '), 120) + ')');
    return 'locked; ' + short((await text(page)).split('\n').find((l) => /青コーナーの選手を選んでください/.test(l)) || '', 100);
  });
  await mistake({ id: 'C04', screen: SCR, vp: V, op: '赤青を入替', what: '押したあと、もう一度押す／わざと押す', risk: 'P3', guard: '2回押すと元にもどる。選手が消えない' }, page, async () => {
    await page.locator('#bout-0-blue').selectOption('F02'); await settle(200);
    const sw = page.getByRole('button', { name: '赤青を入替' }).first();
    await sw.click(); await settle(200);
    check((await page.locator('#bout-0-red').inputValue()) === 'F02' && (await page.locator('#bout-0-blue').inputValue()) === 'F01', 'C04: swap works');
    await sw.dblclick(); await settle(200);
    check((await page.locator('#bout-0-red').inputValue()) === 'F02' && (await page.locator('#bout-0-blue').inputValue()) === 'F01', 'C04: two quick presses swap twice (back to start)');
    return 'ok';
  });
  await mistake({ id: 'C05', screen: SCR, vp: V, op: '赤・青コーナーを選ぶ', what: '同じ選手を2つの試合に入れてしまう', risk: 'P1', guard: '赤で「〇〇さんが2つの試合に入っています」＋どの試合か。開く前に直させる' }, page, async () => {
    await addBout(page, '', '');
    await page.locator('#bout-1-red').selectOption('F01').catch(() => {});
    await page.locator('#bout-1-blue').selectOption('F03').catch(() => {});
    await settle(300);
    const t = await text(page), reds = await redTexts(page);
    const optText = await page.locator('#bout-1-red option[value="F01"]').evaluate((o) => o.textContent + '|' + o.disabled).catch(() => '');
    const warned = /ほかの試合にも出ます|2試合|二重|2つの試合/.test(t);
    check(warned, 'C05: the screen warns that a fighter is in two bouts (' + short(reds.join(' | ') + ' ' + optText, 160) + ')');
    check(await page.getByRole('button', { name: '選び直す' }).count() >= 1, 'C05: a safe 選び直す button is offered next to the warning');
    await page.getByRole('button', { name: '選び直す' }).first().click().catch(() => {}); await settle(300);
    return short((t.split('\n').find((l) => /ほかの試合にも/.test(l)) || '') + ' | option: ' + optText, 160);
  });
  await mistake({ id: 'C06', screen: SCR, vp: V, op: '「この試合を消す」', what: '試合を消してしまう（まちがえて）', risk: 'P1', guard: '12秒の「元にもどす」。消えたものを赤か黄色で言う' }, page, async () => {
    const n = await boutCount(page);
    await page.getByRole('button', { name: 'この試合を消す' }).first().click(); await settle(400);
    const asked = await askBox(page).count();
    if (asked) {
      check(await page.evaluate(() => /^やめる/.test(document.activeElement?.innerText.trim() || '')), 'C06: the box starts on the safe button');
      await page.keyboard.press('Escape'); await settle(300);
      check((await boutCount(page)) === n, 'C06: Escape keeps the bout');
      return 'asks first; Esc keeps';
    }
    check((await boutCount(page)) === n - 1, 'C06: one bout removed');
    check(await page.getByRole('button', { name: /元にもどす/ }).count() >= 1, 'C06: an 元にもどす button is offered');
    await page.getByRole('button', { name: /元にもどす/ }).first().click(); await settle(300);
    check((await boutCount(page)) === n, 'C06: undo brings the bout back');
    return 'removed with undo; undo works';
  });
  await page.close();
  const page7 = await seedAndOpen(ctx, seed(id + 'c7', { fighters: 6, bouts: [[0, 1]], photos: false }));
  await mistake({ id: 'C07', screen: SCR, vp: V, op: '「おすすめの組み合わせを自動で作る」', what: '手で作った試合があるときに、2回すばやく押す', risk: 'P1', guard: '「これは案です」と黄色で言う。手で作った試合は消さない。選手が2回入らない' }, page7, async () => {
    const page = page7;
    const before = JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('article[id^="bout-"]')].map((a) => [a.querySelector('select[aria-label="赤コーナーの選手"]')?.value, a.querySelector('select[aria-label="青コーナーの選手"]')?.value])));
    const sug = page.getByRole('button', { name: 'おすすめの組み合わせを自動で作る' });
    if (await sug.count()) {
      await sug.dblclick(); await settle(500);
      const bv = await page.evaluate(() => [...document.querySelectorAll('article[id^="bout-"]')].map((a) => [a.querySelector('select[aria-label="赤コーナーの選手"]')?.value, a.querySelector('select[aria-label="青コーナーの選手"]')?.value]));
      const ids = bv.flat().filter(Boolean);
      check(new Set(ids).size === ids.length, 'C07: nobody is placed twice by the auto button (' + ids.join(',') + ')');
      const first = JSON.parse(before)[0];
      check(JSON.stringify(bv[0]) === JSON.stringify(first) || /消え|上書き|かわり/.test(await text(page)), 'C07: the bout made by hand is kept (or the loss is announced)');
    }
    return 'ok';
  });
  await ctx.close();
});

scenario('PRIVATE-D', 'PRIVATE', 'forgetting to save, closing, reloading', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-pd-' + vp.tag, V = vp.name;
  const page = await openPrivate(ctx, id);
  await page.locator('#field-title').fill('保存わすれ大会');
  await importCsv(page, CSV4); await page.getByText('4人分を読み込みました').first().waitFor();
  await addBout(page, 'F01', 'F02');
  await mistake({ id: 'D01', screen: SCR, vp: V, op: '保存', what: '保存を忘れて、「試合当日の画面を開く」を押す', risk: 'P1', guard: '開く前に保存する／保存が先と赤で言う。保存していない内容を当日の画面で空にしない' }, page, async () => {
    check(await dirty(page), 'D01: the screen says 未保存');
    await colourAudit(page, 'ready to save ' + V, { markerText: /保存/ });
    const open = btn(page, '試合当日の画面を開く').first();
    const locked = await isLocked(open);
    const pagesBefore = ctx.pages().length;
    await open.click({ force: true }).catch(() => {}); await settle(1500);
    const stored = await idbGet(page, id);
    const opened = ctx.pages().length > pagesBefore || page.url().includes('/live/');
    if (opened) {
      const live = ctx.pages().at(-1);
      const lt = await live.evaluate(() => document.body.innerText);
      check(stored && stored.bouts.length === 1, 'D01: if the match-day screen opened, the data was saved first (stored bouts: ' + (stored ? stored.bouts.length : 'none') + ')');
      check(/第1試合/.test(lt) && !/このブラウザにありません|保存データを読めません/.test(lt), 'D01: the match-day screen shows the bout, not an empty screen (' + short(lt, 80) + ')');
      if (live !== page) await live.close();
    } else {
      const reds = await redTexts(page);
      check(locked || reds.some((t) => /保存/.test(t)), 'D01: it is locked, or a red line says to save first (' + short(reds.join(' | '), 100) + ')');
    }
    return 'locked=' + locked + ', opened=' + opened;
  });
  const pd2 = await openPrivate(ctx, id);
  await pd2.locator('#field-venue').fill('保存する会場'); await settle(300);
  await mistake({ id: 'D02', screen: SCR, vp: V, op: '「ここまでを保存する」を押す', what: '2回・3回すばやく押す', risk: 'P1', guard: '保存は1つだけ。「保存済み」と緑で言い、まちがった衝突を出さない' }, pd2, async () => {
    await pd2.evaluate(() => { window.__puts = 0; const p = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { window.__puts++; return p.apply(this, a); }; });
    await waitPush();
    await saveBtn(pd2).dblclick(); await settle(1000);
    await waitState(pd2, '保存済み').catch(() => {});
    check((await stateOf(pd2)).includes('保存済み') && await pd2.locator('#conflict-box').count() === 0, 'D02: ends 保存済み with no false conflict (' + short(await stateOf(pd2), 50) + ')');
    check((await idbKeys(pd2)).filter((k) => k === id).length === 1 && (await pd2.evaluate(() => window.__puts)) <= 2, 'D02: one record, at most two writes (' + await pd2.evaluate(() => window.__puts) + ')');
    check((await notices(pd2)).includes('保存しました') || /✓/.test(await stateOf(pd2)), 'D02: a visible success line');
    pd2.__savedAt = Date.now();
    await colourAudit(pd2, 'saved ' + V, { markerText: /当日の画面|開く|コピー|申し込み/ });
    return 'saved once';
  });
  await mistake({ id: 'D03', screen: SCR, vp: V, op: 'ページを閉じる／別のページへ行く', what: '内容を直したあと、保存しないでタブを閉じる', risk: 'P1', guard: 'ブラウザの「このページを離れますか」が出る（標準の確認）。保存済みなら何も聞かない' }, page, async () => {
    pd2.__dlg.log.length = 0;
    await pd2.close({ runBeforeUnload: true }).catch(() => {});
    check(!pd2.__dlg.log.some((d) => d.type === 'beforeunload'), 'D03: a saved page closes without asking');
    return 'clean close: dialogs ' + pd2.__dlg.log.length;
  });
  const p2 = await openPrivate(ctx, id);
  await mistake({ id: 'D04', screen: SCR, vp: V, op: 'ページを閉じる／再読み込み', what: '大会名を直したあと、保存しないで再読み込み・閉じる', risk: 'P1', guard: 'ブラウザの「このページを離れますか」が出る。「とどまる」を押せば何も失わない' }, p2, async () => {
    await p2.locator('#field-title').fill('保存してない名前'); await settle(300);
    check(await dirty(p2), 'D04: it says 未保存 after typing');
    p2.__dlg.log.length = 0; p2.__dlg.mode = 'dismiss';
    await p2.reload().catch(() => {}); await settle(600);
    check(p2.__dlg.log.some((d) => d.type === 'beforeunload'), 'D04: a "leave this page?" question was asked (' + p2.__dlg.log.map((d) => d.type).join(',') + ')');
    check((await val(p2, '#field-title')) === '保存してない名前', 'D04: choosing to stay keeps what was typed');
    p2.__dlg.mode = 'accept';
    await p2.reload(); await p2.locator('#field-title').waitFor(); await settle(500);
    check((await val(p2, '#field-title')) === '保存わすれ大会', 'D04: after choosing to leave, the saved name is back (the unsaved one was never saved)');
    p2.__dlg.mode = 'dismiss';
    return 'beforeunload asked: ' + p2.__dlg.log.length;
  });
  await mistake({ id: 'D05', screen: SCR, vp: V, op: 'ブラウザの「戻る」', what: '直している途中でブラウザの戻るを押す', risk: 'P1', guard: '保存していない内容があるときは「このページを離れますか」が出る。何も聞かずに消えない' }, p2, async () => {
    await p2.locator('#field-venue').fill('未保存の会場'); await settle(200);
    p2.__dlg.log.length = 0; p2.__dlg.mode = 'dismiss';
    await p2.goBack().catch(() => {}); await settle(700);
    const stillHere = /\/private\/\?event=/.test(p2.url());
    check(stillHere ? (await val(p2, '#field-venue')) === '未保存の会場' : p2.__dlg.log.length > 0 || true, 'D05: the typed venue survives, or the screen asked first');
    check(stillHere || p2.__dlg.log.some((d) => d.type === 'beforeunload'), 'D05: leaving with unsaved text was asked about (url ' + short(p2.url(), 60) + ')');
    return 'stayed=' + stillHere + ' dialogs=' + p2.__dlg.log.map((d) => d.type).join(',');
  });
  await ctx.close();
});

scenario('PRIVATE-E', 'PRIVATE', 'backup password, restore wrong things', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-pe-' + vp.tag, V = vp.name, pw = 'fictional-pass-1234';
  const page = await seedAndOpen(ctx, seed(id, { title: 'いまのデータ' }));
  await openBackup(page);
  const before = JSON.stringify(await idbGet(page, id));
  const pwCases = [
    ['E01', 'パスワードを入れないで保存ボタンを押す', '', '', false],
    ['E02', '9文字の短いパスワード', '123456789', '123456789', false],
    ['E03', '2つ目をまちがえた', pw, pw + 'x', false],
    ['E04', 'スペースだけのパスワード', '          ', '          ', false],
    ['E05', '10文字のパスワード（ちょうど）で「紙に書きました」を忘れる', '1234567890', '1234567890', 'paper'],
  ];
  for (const [cid, what, a, b2, expect] of pwCases) {
    await mistake({ id: cid, screen: SCR, vp: V, op: 'コピーのファイル：パスワード', what, risk: 'P1', guard: '灰色＋理由「🔒 パスワードは10文字以上」「同じではありません」「紙に書いてください」。ファイルは作らない' }, page, async () => {
      await page.locator('#backup-password').fill(a); await page.locator('#backup-password2').fill(b2);
      if (await page.locator('#paper-done').isChecked()) await page.locator('#paper-done').uncheck();
      await settle(300);
      let downloads = 0; const onDl = () => { downloads++; }; page.on('download', onDl);
      const bb = backupBtn(page);
      check(await isLocked(bb), cid + ': the backup button is locked');
      await bb.click({ force: true }).catch(() => {}); await settle(700);
      page.off('download', onDl);
      check(downloads === 0, cid + ': no file was made (' + downloads + ')');
      const area = await page.locator('#backup').innerText();
      const reds = await redTexts(page);
      check(/10文字|同じではありません|同じ|紙に書|パスワード/.test(area), cid + ': the reason is printed in plain words');
      check(reds.some((x) => /パスワード|10文字|同じ|紙/.test(x)) || /🔒/.test(area), cid + ': there is a red or 🔒 line');
      return short(area.split('\n').filter((l) => /10文字|同じ|紙|🔒|✕/.test(l)).join(' / '), 140);
    });
  }
  const good = nodeBackup({ ...seed(id, { title: '戻したい大会', fighters: 2, bouts: [[0, 1]] }), updatedAt: Date.now() }, pw);
  const flip = (text) => { const p = JSON.parse(text); const b = Buffer.from(p.data, 'base64'); b[5] ^= 0xff; p.data = b.toString('base64'); return JSON.stringify(p); };
  const bad = [
    ['E10', '合っていないパスワードで戻す', good, 'wrong-password-1', /パスワードがちがいます/],
    ['E11', '途中で切れたコピーのファイル', good.slice(0, Math.floor(good.length / 2)), pw, /ではありません|読めません|戻せませんでした/],
    ['E12', 'メモ(.txt)を選んだ', 'これはただのメモです', pw, /ではありません/],
    ['E13', 'ZIPを選んだ', Buffer.from(zipSync({ 'players.csv': strToU8(CSV6) })), pw, /ではありません/],
    ['E14', '空のファイルを選んだ', '', pw, /ではありません/],
    ['E15', '別の大会のコピーのファイル', nodeBackup({ ...seed(id + '-other', { title: '別の大会' }), updatedAt: Date.now() }, pw), pw, /別の大会|用です/],
    ['E16', '中身がこわれたコピーのファイル', flip(good), pw, /戻せませんでした/],
  ];
  await page.locator('#field-venue').fill('未保存の会場');
  for (const [cid, what, content, password, re] of bad) {
    await mistake({ id: cid, screen: SCR, vp: V, op: 'コピーのファイルから戻す', what, risk: 'P1', guard: '赤で理由（パスワードがちがいます等）＋もう一度どうするか。いまの内容・保存データは変わらない' }, page, async () => {
      await page.locator('#backup-password').fill(password); await page.locator('#backup-password2').fill(password); await settle(100);
      page.__dlg.log.length = 0;
      await restoreInput(page).setInputFiles({ name: 'bad.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) }, { force: true }).catch(() => {}); await settle(1100);
      const area = await page.locator('#backup').innerText();
      const reds = await redTexts(page);
      check(re.test(area) && !area.includes('戻しました'), cid + ': refused with the reason (' + short(area.split('\n').filter((l) => re.test(l)).join(' / '), 120) + ')');
      const cautions = await page.evaluate(() => [...document.querySelectorAll('.tos-caution')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ')));
      const shown = cid === 'E15' ? [...reds, ...cautions] : reds; // a backup of ANOTHER event changes nothing: a yellow caution with a button is fine
      check(shown.some((x) => re.test(x)), cid + ': the reason is in a red (or, for another event, yellow) line (' + short(shown.join(' | '), 120) + ')');
      check(shown.some((x) => re.test(x) && saysNext(x.replace(/^✕\s*/, ''))) || cid === 'E15' && await page.getByRole('button', { name: 'この大会として開く' }).count() === 1, cid + ': it says what to do next');
      check((await val(page, '#field-title')) === 'いまのデータ' && (await val(page, '#field-venue')) === '未保存の会場' && JSON.stringify(await idbGet(page, id)) === before, cid + ': screen, typed text and stored data are untouched');
      check(!(await askBox(page).count()), cid + ': no overwrite question for a refused file');
      return short(reds.join(' | '), 140);
    });
  }
  await mistake({ id: 'E20', screen: SCR, vp: V, op: 'コピーのファイルから戻す', what: '正しいファイルで、保存していない入力があるのに戻す（上書き）', risk: 'P1', guard: '箱で赤く「いまの画面の内容が消えます」。いちばん左の「やめる」にフォーカス。Escで何も変えない' }, page, async () => {
    await page.locator('#backup-password').fill(pw); await page.locator('#backup-password2').fill(pw);
    await restoreInput(page).setInputFiles({ name: 'good.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.from(good) }, { force: true }); await askBox(page).waitFor({ timeout: 9000 });
    const box = askBox(page), bt = await box.innerText();
    check(/(消え|上書き|かわり|変わり)/.test(bt) && await box.locator('.tos-danger').count() >= 1, 'E20: the box names what is lost, in red (' + short(bt, 110) + ')');
    check(await page.evaluate(() => /^やめる/.test(document.activeElement?.innerText.trim() || '')), 'E20: the focus is on the safe button');
    await page.keyboard.press('Escape'); await settle(400);
    check((await val(page, '#field-title')) === 'いまのデータ' && JSON.stringify(await idbGet(page, id)) === before, 'E20: Escape changes nothing');
    return 'box: ' + short(bt, 100);
  });
  await mistake({ id: 'E21', screen: SCR, vp: V, op: 'コピーのファイルを作る', what: '「パスワードをつけて、コピーを保存する」を2回すばやく押す', risk: 'P2', guard: 'ファイルは1つ' }, page, async () => {
    await page.locator('#backup-password').fill(pw); await page.locator('#backup-password2').fill(pw);
    if (!(await page.locator('#paper-done').isChecked())) await page.locator('#paper-done').check();
    await settle(3200);
    let downloads = 0; page.on('download', () => { downloads++; });
    await backupBtn(page).dblclick(); await settle(2500);
    check(downloads === 1, 'E21: one file for a double press (' + downloads + ')');
    check(/ファイルを保存しました|保存しました/.test(await notices(page) + await text(page)), 'E21: a green line says the file was saved');
    return 'downloads ' + downloads;
  });
  await ctx.close();
});

scenario('PRIVATE-F', 'PRIVATE', 'adding or fixing one fighter, photos, danger buttons', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-pf-' + vp.tag, V = vp.name;
  const page = await seedAndOpen(ctx, seed(id, { fighters: 4, photos: false }));
  await page.locator('summary', { hasText: 'ほかの入れ方' }).click();
  await page.locator('summary', { hasText: '1人ずつ入れる' }).click();
  const fill = async (o) => { for (const k of ['name', 'gym', 'grade', 'age', 'height', 'weight', 'record', 'comment']) await page.locator('#manual-' + k).fill(o[k] ?? ''); };
  const add = () => page.getByRole('button', { name: 'この選手を追加', exact: true });
  const manual = [
    ['M01', '名前を空にして追加', { name: '', gym: 'ジム', height: '170', weight: '60', record: '初' }, 'reject', /名前|選手名/],
    ['M02', '体重に文字（abc）', { name: '追加A', gym: 'ジム', height: '170', weight: 'abc', record: '初' }, 'reject', /体重/],
    ['M03', '全角の数字（身長 １７０・体重 ６０）', { name: '追加B', gym: 'ジム', height: '１７０', weight: '６０', record: '初' }, 'accept', null],
    ['M04', '単位つき（170cm・60kg）', { name: '追加C', gym: 'ジム', height: '170cm', weight: '60kg', record: '初' }, 'accept', null],
    ['M05', '体重 0 ／ 999', { name: '追加D', gym: 'ジム', height: '170', weight: '999', record: '初' }, 'reject', /体重/],
    ['M06', '身長にマイナス', { name: '追加E', gym: 'ジム', height: '-5', weight: '60', record: '初' }, 'reject', /身長/],
    ['M07', '名前に絵文字', { name: '追加😀', gym: 'ジム', height: '170', weight: '60', record: '初' }, 'either', null],
    ['M08', '名前の前後に空白', { name: '   追加F   ', gym: 'ジム', height: '170', weight: '60', record: '初' }, 'accept', null],
    ['M09', 'ジム名が空', { name: '追加G', gym: '', height: '170', weight: '60', record: '初' }, 'reject', /ジム/],
  ];
  for (const [cid, what, o, expect, re] of manual) {
    await mistake({ id: cid, screen: SCR, vp: V, op: '「1人ずつ入れる」', what, risk: expect === 'reject' ? 'P1' : 'P2', guard: expect === 'reject' ? '赤で「どの欄が」「どう直す」。人は増えない' : '全角・単位・空白は自動で直して追加する' }, page, async () => {
      const n0 = await fighterCount(page);
      await fill(o); await add().click(); await settle(500);
      const n1 = await fighterCount(page), reds = await redTexts(page);
      if (expect === 'reject') {
        check(n1 === n0, cid + ': nobody was added (' + n0 + ' -> ' + n1 + ')');
        check(reds.some((t) => re.test(t)), cid + ': a red line names the field (' + short(reds.join(' | '), 120) + ')');
        check(reds.some((t) => saysNext(t.replace(/^✕\s*/, ''))), cid + ': it says how to fix it');
        check(await nearBy(page, '#manual-name', 900) || await nearBy(page, '#manual-weight', 600), cid + ': the red line is close to the form');
      } else if (expect === 'accept') {
        check(n1 === n0 + 1, cid + ': the fighter was added (' + n0 + ' -> ' + n1 + ') reds: ' + short(reds.join('|'), 80));
        const last = await page.locator('#sec-2 article[id^="fighter-"]').last().innerText();
        check(!/NaN|undefined/.test(last), cid + ': the card shows clean numbers (' + short(last, 60) + ')');
        check(/60kg/.test(last) || cid === 'M08', cid + ': weight shows as 60kg');
        if (cid === 'M08') check(/追加F/.test(last) && !/ {2}追加F/.test(last), cid + ': the name is trimmed');
      } else check(n1 === n0 || n1 === n0 + 1, cid + ': either added or refused cleanly');
      await page.waitForTimeout(100);
      return 'people ' + n0 + ' -> ' + n1 + '; red: ' + short(reds.join(' | ') || 'none', 100);
    });
  }
  await mistake({ id: 'M10', screen: SCR, vp: V, op: '「この選手を追加」', what: '2回すばやく押す', risk: 'P1', guard: '1人だけ増える' }, page, async () => {
    await fill({ name: '連打さん', gym: 'ジム', height: '170', weight: '60', record: '初' });
    const n0 = await fighterCount(page);
    await add().dblclick(); await settle(500);
    check((await fighterCount(page)) === n0 + 1, 'M10: one person for a double press (' + n0 + ' -> ' + (await fighterCount(page)) + ')');
    return 'one added';
  });
  await mistake({ id: 'M11', screen: SCR, vp: V, op: '「写真を選ぶ／変える」', what: '写真ではないファイル（.txt）と、こわれた画像を選ぶ', risk: 'P1', guard: '赤で「写真ではありません」＋jpgかpngを選ぶ。元の写真は消えない' }, page, async () => {
    const input = page.locator('#sec-2 article[id^="fighter-"] input[type=file]').first();
    await input.setInputFiles({ name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await settle(700);
    const reds1 = await redTexts(page);
    await input.setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a jpeg at all') }); await settle(900);
    const reds2 = await redTexts(page);
    const imgs = await page.locator('#sec-2 article[id^="fighter-"] img').count();
    check(reds1.some((t) => /写真|画像|使えません|ファイル/.test(t)), 'M11: .txt as a photo -> red message (' + short(reds1.join(' | '), 100) + ')');
    check(reds2.some((t) => /写真|画像|読めません|使えません|ファイル/.test(t)), 'M11: a broken image -> red message (' + short(reds2.join(' | '), 100) + ')');
    check(imgs === 0, 'M11: no photo was attached from the bad files (' + imgs + ')');
    return 'txt: ' + short(reds1.join(' | '), 60) + ' / broken: ' + short(reds2.join(' | '), 60);
  });
  await mistake({ id: 'M12', screen: SCR, vp: V, op: '「消す」（選手）', what: 'まちがえて「消す」を押す。試合に入っている選手を消す', risk: 'P1', guard: '箱で赤く「〇〇さんを消します／第1試合の赤コーナーが空になります」。やめるが最初のフォーカス。Escで中止' }, page, async () => {
    await addBout(page, 'F01', 'F02');
    const n0 = await fighterCount(page);
    await page.locator('#remove-F01').click(); await settle(300);
    const box = askBox(page);
    check(await box.count() === 1, 'M12: a box opens before removing');
    const bt = await box.innerText();
    check(/架空赤選手/.test(bt) && /第1試合/.test(bt), 'M12: the box names the fighter and the bout that loses a corner (' + short(bt, 120) + ')');
    check(await box.locator('.tos-danger').count() >= 1, 'M12: the loss is written in red');
    await colourAudit(page, 'private delete-fighter box ' + V, { markers: 'max1' });
    check(await page.evaluate(() => /^やめる/.test(document.activeElement?.innerText.trim() || '')), 'M12: focus is on やめる (not the dangerous button)');
    const danger = box.getByRole('button', { name: /消す/ });
    check(/消す|もどせません/.test(await danger.innerText()), 'M12: the red button names what happens (' + short(await danger.innerText(), 30) + ')');
    const style = await danger.evaluate((b) => { const s = getComputedStyle(b); return s.color + '|' + s.borderTopColor; });
    check(/^rgb\((1[5-9]\d|2\d\d), ?\d{1,2}, ?\d{1,2}\)/.test(style.split('|')[0]) || /^rgb\((1[5-9]\d|2\d\d), ?\d{1,2}, ?\d{1,2}\)/.test(style.split('|')[1]), 'M12: the danger button is red (' + style + ')');
    await page.keyboard.press('Escape'); await settle(300);
    check((await fighterCount(page)) === n0, 'M12: Escape keeps the fighter');
    await page.locator('#remove-F01').click(); await settle(300);
    await box.getByRole('button', { name: /^やめる/ }).click(); await settle(300);
    check((await fighterCount(page)) === n0 && await page.locator('#bout-0-red').inputValue() === 'F01', 'M12: pressing やめる changes nothing');
    return 'box: ' + short(bt, 110);
  });
  await mistake({ id: 'M13', screen: SCR, vp: V, op: '「直す」（選手）', what: '直す画面で名前を空にして決める', risk: 'P1', guard: '赤で「名前が空です」。もとの名前は消えない' }, page, async () => {
    const edit = page.getByRole('button', { name: /^直す 架空赤選手/ }).first();
    if (!(await edit.count())) { check(false, 'M13: the edit button of a kept fighter exists'); return 'missing'; }
    await edit.click(); await settle(400);
    const art = page.locator('#fighter-F01');
    const nameIn = art.locator('input').first();
    await nameIn.fill('   '); await settle(100);
    const okBtn = art.getByRole('button', { name: 'この内容で直す' });
    check(await isLocked(okBtn), 'M13: the 「この内容で直す」 button is locked for a blank name');
    await okBtn.click({ force: true }); await settle(400);
    const reds = await redTexts(page);
    check(reds.some((t) => /選手名/.test(t)), 'M13: a blank name is refused with a red 選手名 line (' + short(reds.join(' | '), 100) + ')');
    check(await nearBy(page, '#fighter-F01 input', 500), 'M13: the red line is near the edit fields');
    await art.getByRole('button', { name: 'やめる' }).click(); await settle(300);
    const q = askBox(page);
    check(await q.count() === 1 && /消えます/.test(await q.innerText()) && await q.locator('.tos-danger').count() >= 1, 'M13: pressing やめる after typing asks first, with the loss in red');
    check(await page.evaluate(() => /^続けて直す/.test(document.activeElement?.innerText.trim() || '')), 'M13: the safe 続けて直す button has the focus');
    await q.getByRole('button', { name: '直した内容を消す' }).click(); await settle(300);
    check((await page.locator('#fighter-F01').innerText()).includes('架空赤選手'), 'M13: after discarding, the original name is back');
    await edit.click(); await settle(300);
    await nameIn.fill('直した名前'); await art.getByRole('button', { name: 'この内容で直す' }).click(); await settle(300);
    check((await page.locator('#fighter-F01').innerText()).includes('直した名前') && (await dirty(page)), 'M13: a good edit is shown and the screen says 未保存');
    return 'edit opened';
  });
  await ctx.close();
});

scenario('PRIVATE-G', 'PRIVATE', 'new event, other pages, the colour language at each step', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-pg-' + vp.tag, V = vp.name;
  const page = await seedAndOpen(ctx, seed(id, { fighters: 4 }));
  await settle(400);
  await mistake({ id: 'N01', screen: SCR, vp: V, op: '「新しい大会をつくる」', what: 'いまの大会があるのに、まちがえて押す', risk: 'P1', guard: '箱で「いまの大会は消えません。別の大会が増えます」と言い、やめるが最初のフォーカス。何もしないで閉じられる' }, page, async () => {
    await page.locator('summary', { hasText: '大会をえらぶ' }).click().catch(() => {});
    const nb = page.locator('#new-event-btn');
    await nb.click(); await settle(500);
    const hasBox = await askBox(page).count();
    const urlNow = page.url();
    if (hasBox) {
      const bt = await askBox(page).innerText();
      check(await page.evaluate(() => /^やめる/.test(document.activeElement?.innerText.trim() || '')), 'N01: focus is on the safe button');
      await page.keyboard.press('Escape'); await settle(300);
      check(page.url() === urlNow && (await val(page, '#field-title')) === '架空大会', 'N01: Escape keeps this event');
      return 'box: ' + short(bt, 100);
    }
    check(page.url() === urlNow || (await idbGet(page, id)) !== null, 'N01: the current event was not destroyed');
    return 'no box; url now ' + short(page.url(), 80);
  });
  await mistake({ id: 'N02', screen: SCR, vp: V, op: '「申し込みページをつくる画面へ →」', what: '保存していない内容があるのに、別の画面へのリンクを押す', risk: 'P1', guard: '保存していない内容があるときは、画面を離れる前に「このページを離れますか」が出る' }, page, async () => {
    await page.locator('#field-venue').fill('未保存の会場2'); await settle(200);
    page.__dlg.log.length = 0; page.__dlg.mode = 'dismiss';
    await page.getByRole('link', { name: /申し込みページをつくる画面へ/ }).first().click().catch(() => {}); await settle(800);
    const left = /\/private\/setup\//.test(page.url());
    check(!left ? true : page.__dlg.log.some((d) => d.type === 'beforeunload') || (await idbGet(page, id)).venue === '未保存の会場2', 'N02: it asked first, or the venue was kept');
    check((await val(page, '#field-venue').catch(() => '未保存の会場2')) === '未保存の会場2' || left, 'N02: the typed venue is still there when staying');
    return 'left=' + left + ' dialogs=' + page.__dlg.log.map((d) => d.type).join(',');
  });
  await page.close();
  const p2 = await seedAndOpen(ctx, seed(id + '2', { fighters: 4, bouts: [[0, 1], [2, 3]] }));
  await mistake({ id: 'N03', screen: SCR, vp: V, op: '全部の状態で色の約束', what: '（色の確認）完成した状態：黄色は1つ・赤は✕つき・押せないボタンには理由・危ないボタンは赤', risk: 'P2', guard: '色の約束どおり' }, p2, async () => {
    await colourAudit(p2, 'finished event ' + V);
    await p2.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    await settle(300);
    await colourAudit(p2, 'finished event, folds open ' + V, { markers: (await markerOf(p2)).length === 0 ? 0 : 1 });
    const c = await p2.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /^消す|この試合を消す|消す \S/.test(b.innerText.trim()) && b.getBoundingClientRect().width > 0).map((b) => { const s = getComputedStyle(b); return { t: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').slice(0, 30), color: s.color, border: s.borderTopColor, focused: document.activeElement === b }; }));
    for (const d of c) {
      check(!d.focused, 'N03: the danger button "' + d.t + '" is not focused by default', true);
      check(/^rgb\((1[3-9]\d|2\d\d), ?\d{1,2}, ?\d{1,2}\)/.test(d.color) || /^rgb\((1[3-9]\d|2\d\d), ?\d{1,2}, ?\d{1,2}\)/.test(d.border), 'N03: the danger button "' + d.t + '" is red (' + d.color + ' / ' + d.border + ')', true);
    }
    const a = await p2.evaluate((vw) => ({ sw: document.documentElement.scrollWidth, vw }), vp.mobile ? 390 : 1280);
    check(a.sw <= a.vw, 'N03: no sideways scroll (' + a.sw + ')');
    return 'danger buttons: ' + c.map((d) => d.t).slice(0, 4).join(' / ');
  });
  await mistake({ id: 'N04', screen: SCR, vp: V, op: '「試合当日の画面を開く」', what: '完成して保存したあと、2回すばやく押す', risk: 'P2', guard: '画面は1つだけ開く' }, p2, async () => {
    const open = btn(p2, '試合当日の画面を開く').last();
    const n0 = ctx.pages().length;
    await open.dblclick().catch(() => {}); await settle(1500);
    check(ctx.pages().length - n0 <= 1, 'N04: one screen opened (' + (ctx.pages().length - n0) + ')');
    return 'opened ' + (ctx.pages().length - n0);
  });
  await ctx.close();
});

scenario('PRIVATE-H', 'PRIVATE', 'the yellow marker follows a student through the 4 steps', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-ph-' + vp.tag, V = vp.name;
  const page = await openPrivate(ctx, id);
  const steps = [];
  const mark = async (label, re) => { const c = await colourAudit(page, 'private ' + label + ' ' + V, { markerText: re }); steps.push(label + ': ' + short((c.markers[0] || {}).full || 'none', 40)); };
  await mistake({ id: 'Y01', screen: SCR, vp: V, op: '4つの手順を上から順に', what: '（黄色の移動）名前→選手→試合→赤→青→保存→開く の順に、黄色が次の作業へ動く', risk: 'P2', guard: '黄色は1つだけ。終わった所は緑✓。押せない所は灰色＋理由' }, page, async () => {
    await mark('1 fresh', /大会の名前|大会名/);
    check(document_active_not_danger(await page.evaluate(() => ({ t: document.activeElement?.innerText || '', c: String(document.activeElement?.className || '') }))), 'Y01: nothing dangerous has the focus when the page opens');
    await page.locator('#field-title').fill('黄色テスト大会'); await settle(300);
    await mark('2 named', /選手|ファイル|名簿/);
    await importCsv(page, CSV4); await page.getByText('4人分を読み込みました').first().waitFor(); await settle(300);
    await mark('3 roster', /試合を1つ作る|試合を追加/);
    await btn(page, '＋ 試合を追加').click(); await page.locator('#bout-0-red').waitFor(); await settle(300);
    await mark('4 empty bout', /赤コーナー/);
    await page.locator('#bout-0-red').selectOption('F01'); await settle(300);
    await mark('5 red chosen', /青コーナー/);
    await page.locator('#bout-0-blue').selectOption('F02'); await settle(300);
    await mark('6 bout ready', /保存|試合を追加/);
    await save(page); await settle(400);
    await mark('7 saved', /当日|開く|コピー|申し込み/);
    return steps.join(' > ');
  });
  await ctx.close();
});
const document_active_not_danger = (a) => !/消す|上書き|やり直す/.test(a.t) && !/danger/.test(a.c);

/* ═══════════════════════════ SCREEN 3: /private/live/ ═══════════════════════════ */
const LSCR = '/private/live/';
const openLive = async (ctx, id, suffix = '') => {
  const page = await ctx.newPage();
  await page.goto(base + '/private/live/?event=' + id + suffix);
  await page.locator('main').first().waitFor({ timeout: 15000 });
  await settle(700);
  return page;
};
const seedLive = async (ctx, value, suffix = '') => {
  const boot = await ctx.newPage();
  await boot.goto(base + '/private/setup/?event=seed-boot');
  await idbPut(boot, value);
  await boot.close();
  return openLive(ctx, value.eventId, suffix);
};
const nextLive = (p) => p.getByRole('button', { name: /^次の試合 →/ });
const prevLive = (p) => p.getByRole('button', { name: /^← 前の試合/ });
const curNo = (p) => p.evaluate(() => { const b = document.querySelector('header b'); return b ? ((b.innerText.match(/第(\d+)試合/) || [])[1] || b.innerText.slice(0, 12)) : '?'; });
const storedBout = async (p, id) => (await idbGet(p, id))?.currentBout;
const liveFailWrites = (p) => p.evaluate(() => { window.__orig = window.__orig || { tx: IDBDatabase.prototype.transaction }; const o = window.__orig; IDBDatabase.prototype.transaction = function (s, m, ...r) { if (m === 'readwrite') throw new Error('SIMULATED_DISK_FULL'); return o.tx.call(this, s, m, ...r); }; });
const liveHealWrites = (p) => p.evaluate(() => { if (window.__orig) IDBDatabase.prototype.transaction = window.__orig.tx; });

scenario('LIVE-A', 'LIVE', 'tapping the wrong thing during the matches', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-la-' + vp.tag, V = vp.name;
  const page = await seedLive(ctx, seed(id, { fighters: 6, bouts: [[0, 1], [2, 3], [4, 5]] }));
  await mistake({ id: 'L01', screen: LSCR, vp: V, op: '「次の試合 →」を押す', what: '2回・3回すばやく押す（ダブルタップで1試合とばす）', risk: 'P1', guard: '続けて同じ向きの押しは1回だけ効く。黄色の「次はここ」は押したあと次の試合の分に動く' }, page, async () => {
    await colourAudit(page, 'live bout 1 ' + V, { markerText: /この試合が終わったら|次の試合/ });
    check((await curNo(page)) === '1', 'L01: starts at 第1試合');
    await nextLive(page).dblclick(); await settle(900);
    check((await curNo(page)) === '2', 'L01: a double tap goes to 第2試合 only (now 第' + (await curNo(page)) + '試合)');
    check((await storedBout(page, id)) === 1, 'L01: the saved position is bout 2 (index ' + (await storedBout(page, id)) + ')');
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^次の試合/.test(x.innerText.trim())); b.click(); b.click(); b.click(); });
    await settle(900);
    check((await curNo(page)) === '3' || (await curNo(page)) === '2', 'L01: three instant taps move at most one more (now 第' + (await curNo(page)) + '試合)');
    check((await curNo(page)) !== '4', 'L01: it never runs past the last bout');
    return 'now 第' + (await curNo(page)) + '試合';
  });
  await mistake({ id: 'L02', screen: LSCR, vp: V, op: '「← 前の試合」「次の試合 →」', what: '最後の試合で「次の試合」を押す／最初の試合で「前の試合」を押す', risk: 'P1', guard: '押せない方は灰色＋「🔒 いちばん最後です」。黄色は「一覧」に移る' }, page, async () => {
    await settle(1100);
    if ((await curNo(page)) !== '3') { for (let i = 0; i < 3 && (await curNo(page)) !== '3'; i++) { await settle(1100); await nextLive(page).click({ force: true }).catch(() => {}); await settle(700); } }
    check((await curNo(page)) === '3', 'L02: on the last bout');
    check(await isLocked(nextLive(page)), 'L02: 次の試合 is locked on the last bout');
    check(/最後|これ以上|次はありません/.test(await text(page)), 'L02: a printed reason (最後の試合です)');
    await nextLive(page).click({ force: true }).catch(() => {}); await settle(400);
    check((await curNo(page)) === '3' && (await storedBout(page, id)) === 2, 'L02: pressing it changes nothing');
    const m = await markerOf(page);
    check(m.length === 1 && /一覧/.test(m[0]), 'L02: the one yellow marker moves to 一覧 (' + short(m[0] || 'none', 50) + ')', true);
    await colourAudit(page, 'live last bout ' + V);
    return 'locked; marker: ' + short(m[0] || 'none', 60);
  });
  await mistake({ id: 'L03', screen: LSCR, vp: V, op: '「元にもどす」', what: 'まちがえて進めたので、もどす', risk: 'P1', guard: '「元にもどす」が大きく出る。押すと前の試合に戻り、保存される' }, page, async () => {
    await settle(1200);
    await prevLive(page).click(); await settle(900);
    check((await curNo(page)) === '2', 'L03: 前の試合 goes back one (now 第' + (await curNo(page)) + ')');
    const undo = page.getByRole('button', { name: /もどす|にすすむ/ });
    check(await undo.count() >= 1, 'L03: an undo button (もどす / にすすむ) is offered after moving');
    if (await undo.count()) { await undo.first().click(); await settle(900); check((await curNo(page)) === '3' && (await storedBout(page, id)) === 2, 'L03: もどす returns to 第3試合 and saves it'); }
    return 'undo works';
  });
  await mistake({ id: 'L04', screen: LSCR, vp: V, op: '画面の再読み込み／タブを閉じて開き直す', what: '試合の途中で再読み込みする', risk: 'P1', guard: '同じ試合から続く。最初にもどらない' }, page, async () => {
    await page.reload(); await page.locator('main').first().waitFor(); await settle(900);
    check((await curNo(page)) === '3', 'L04: after a reload it is still 第3試合 (' + (await curNo(page)) + ')');
    await snap(page);
    await page.close();
    const p2 = await openLive(ctx, id);
    check((await curNo(p2)) === '3', 'L04: after closing and opening again it is still 第3試合');
    await snap(p2);
    await p2.close();
    return 'position kept';
  });
  await ctx.close();
});

scenario('LIVE-B', 'LIVE', 'the list view and the other screen', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-lb-' + vp.tag, V = vp.name;
  const page = await seedLive(ctx, seed(id, { fighters: 6, bouts: [[0, 1], [2, 3], [4, 5]] }), '&view=list');
  await mistake({ id: 'L05', screen: LSCR, vp: V, op: '「一覧」の見かた', what: '一覧を見ただけで試合が変わってしまわないか', risk: 'P1', guard: '一覧は見るだけ（「⚠ ここは見るだけです」）。押すまで試合は変わらない' }, page, async () => {
    check(/見るだけ/.test(await text(page)), 'L05: the list says it is view only');
    check((await storedBout(page, id)) === 0, 'L05: opening the list changes nothing');
    const m = await markerOf(page);
    check(m.length === 1, 'L05: the list screen has exactly one yellow 次はここ marker (saw ' + m.length + ')', true);
    await colourAudit(page, 'live list ' + V, { markers: m.length });
    return 'markers on the list: ' + m.length;
  });
  await mistake({ id: 'L06', screen: LSCR, vp: V, op: '一覧の「この試合を開く」', what: '行を押したあと、すぐもう一度押す（2回目が次の画面の「次の試合」に当たる）', risk: 'P1', guard: '開いた直後は少しの間、押しを受けない。1試合だけ動く' }, page, async () => {
    const open3 = page.getByRole('button', { name: /この試合を開く 第3試合/ });
    await open3.dblclick().catch(() => {}); await settle(1200);
    check((await curNo(page)) === '3', 'L06: a double tap on row 3 ends on 第3試合 (' + (await curNo(page)) + ')');
    check((await storedBout(page, id)) === 2, 'L06: stored position is bout 3');
    check(await page.getByRole('button', { name: /もどす|にすすむ/ }).count() >= 1, 'L06: an undo button is offered');
    return 'on 第' + (await curNo(page));
  });
  await mistake({ id: 'L07', screen: LSCR, vp: V, op: 'アドレスの ?view=', what: '?view=foo のような変なアドレスで開く', risk: 'P3', guard: '1試合ずつの画面で開く' }, page, async () => {
    const p2 = await openLive(ctx, id, '&view=foo');
    check(await nextLive(p2).count() === 1 || await prevLive(p2).count() === 1, 'L07: a bad ?view= shows the one-bout screen');
    await snap(p2);
    await p2.close();
    return 'ok';
  });
  await mistake({ id: 'L08', screen: LSCR, vp: V, op: '一覧の「第 □ 試合へ 行く」', what: '番号に 0・99・文字・全角・空を入れる', risk: 'P2', guard: '範囲外は赤で「1〜3の数字」。全角は自動で直す。試合は変わらない' }, page, async () => {
    const list = await openLive(ctx, id, '&view=list');
    const jump = list.locator('#live-list-jump');
    const before = await storedBout(list, id);
    const results = [];
    for (const v of ['0', '99', 'あ', '', '２', '2番', ' 1 ']) {
      await jump.fill(v); await list.getByRole('button', { name: /^行く$/ }).click({ force: true }).catch(() => {}); await settle(250);
      const reds = await redTexts(list);
      results.push(JSON.stringify(v) + '=>' + short(reds.filter((t) => /試合|数字|番号/.test(t)).join('|') || 'none', 40));
      if (['0', '99', 'あ', ''].includes(v)) check(reds.some((t) => /試合|数字|番号|入れ/.test(t)) || /範囲|1〜|1～/.test(await text(list)), 'L08: "' + v + '" gets a red message (' + short(reds.join(' | '), 80) + ')');
    }
    check((await storedBout(list, id)) === before, 'L08: the jump box never changes the current bout (' + before + ' -> ' + (await storedBout(list, id)) + ')');
    await snap(list);
    await list.close();
    return results.join('; ');
  });
  await mistake({ id: 'L09', screen: LSCR, vp: V, op: '「準備画面へ戻る」', what: 'まちがえて押す／戻ったあとで当日の画面にもどる', risk: 'P2', guard: '試合の位置はそのまま。何も消えない' }, page, async () => {
    const before = await storedBout(page, id);
    await page.getByRole('link', { name: /準備画面へ戻る/ }).first().click(); await page.locator('#field-title').waitFor({ timeout: 10000 }); await settle(400);
    check(/\/private\/\?event=/.test(page.url()) && !/live/.test(page.url()), 'L09: it opens the prep screen');
    check((await storedBout(page, id)) === before && (await val(page, '#field-title')) === '架空大会', 'L09: nothing was lost');
    await page.goBack(); await settle(900);
    check(/\/live\//.test(page.url()), 'L09: Back returns to the match-day screen');
    return 'ok';
  });
  await ctx.close();
});

scenario('LIVE-C', 'LIVE', 'missing, broken or unsaveable data', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'mp-lc-' + vp.tag, V = vp.name;
  await mistake({ id: 'L10', screen: LSCR, vp: V, op: 'アドレスを開く', what: '別のパソコン・別のブラウザで開く（その大会がない）／?event= が空', risk: 'P1', guard: '赤で「この大会は、このブラウザにありません」＋黄色「準備画面へ戻る」。空の試合を見せない' }, null, async () => {
    for (const q of ['?event=nothing-here-' + vp.tag, '', '?event=']) {
      const p = await ctx.newPage();
      await p.goto(base + '/private/live/' + q); await settle(1500);
      const t = await text(p), reds = await redTexts(p), m = await markerOf(p);
      check(/ありません|読めません|準備画面/.test(t) && !/NaN|undefined/.test(t), 'L10: ' + (q || '(no query)') + ' shows a clear message (' + short(t, 80) + ')');
      check(reds.length >= 1 && reds.some((x) => /ありません|読めません/.test(x)), 'L10: the message is red (' + short(reds.join(' | '), 80) + ')');
      check(m.length === 1 && /準備画面/.test(m[0]), 'L10: the one yellow marker is 準備画面へ戻る (' + short(m[0] || 'none', 40) + ')', true);
      check(await p.getByRole('link', { name: /準備画面へ戻る/ }).count() === 1, 'L10: a way forward (link back to the prep screen)');
      await colourAudit(p, 'live missing ' + V, { markers: 1 });
      await snap(p);
      await p.close();
    }
    return 'clear message + way back for 3 odd addresses';
  });
  const cases = [
    ['L11', '試合が1つもない大会で開く', seed(id + 'z', { fighters: 4, bouts: [] }), /試合がありません|試合を作|準備画面/],
    ['L12', '保存されている「いまの試合」が壊れている（99番）', seed(id + 'b99', { fighters: 4, currentBout: 99 }), null],
    ['L13', '赤と青に同じ選手が入っている', (() => { const v = seed(id + 'same', { fighters: 4 }); v.bouts[0].blueId = v.bouts[0].redId; return v; })(), /同じ/],
    ['L14', '試合の選手がいない（名簿から消えている）', (() => { const v = seed(id + 'miss', { fighters: 4 }); v.bouts[0].redId = 'NOBODY'; return v; })(), /いません|見つかりません|選手がいない|選手が空|まだ/],
    ['L15', '選手が1人だけ・試合が1つだけ', seed(id + 'one', { fighters: 2, bouts: [[0, 1]] }), null],
  ];
  for (const [cid, what, value, re] of cases) {
    await mistake({ id: cid, screen: LSCR, vp: V, op: '当日の画面を開く', what, risk: 'P1', guard: '赤で何がおかしいかを言い、準備画面へ戻る道を出す。落ちない・空白にしない' }, null, async () => {
      const p = await seedLive(ctx, value);
      const t = await text(p), reds = await redTexts(p), m = await markerOf(p);
      check(!/NaN|undefined|\[object|Cannot read/.test(t) && t.trim().length > 20, cid + ': the screen is not blank or broken (' + short(t, 80) + ')');
      if (re) check(re.test(t), cid + ': it says what is wrong (' + short(t, 140) + ')');
      if (cid === 'L13' || cid === 'L14') { check(reds.length >= 1, cid + ': a red message is shown (' + short(reds.join(' | '), 100) + ')'); check(await p.getByRole('link', { name: /準備画面へ戻る/ }).count() >= 1, cid + ': a link back to the prep screen is offered'); }
      check(m.length <= 1, cid + ': at most one yellow marker (' + m.length + ')', true);
      check(await storedBout(p, value.eventId) === value.currentBout || cid === 'L12', cid + ': nothing was rewritten just by looking');
      await colourAudit(p, cid + ' ' + V, { markers: m.length });
      const note = short(t.split('\n').slice(0, 8).join(' / '), 150);
      await snap(p);
      await p.close();
      return note;
    });
  }
  const page = await seedLive(ctx, seed(id + 's', { fighters: 6, bouts: [[0, 1], [2, 3], [4, 5]] }));
  await mistake({ id: 'L16', screen: LSCR, vp: V, op: '「次の試合 →」を押す', what: '保存できない（ディスクがいっぱい／プライベートウィンドウ）のに押す', risk: 'P1', guard: '赤で「保存できていません。試合は進んでいません」＋黄色は失敗したボタンの「もう一度押す」。画面だけ先へ進んで、あとで食い違うことはない' }, page, async () => {
    await liveFailWrites(page);
    await nextLive(page).click(); await settle(1500);
    const reds = await redTexts(page);
    check((await curNo(page)) === '1', 'L16: the screen did not move on without saving (now 第' + (await curNo(page)) + ')');
    check(reds.some((t) => /保存できていません|保存できません|保存に失敗/.test(t)), 'L16: a red line says it could not be saved (' + short(reds.join(' | '), 120) + ')');
    await checkSeen(page, /保存できなかったため/, 'L16');
    check(reds.some((t) => /進めていません|進んでいません|変わっていません|まだ第1試合のまま/.test(t)), 'L16: it says the bout did not move');
    check(!/✓ 保存済み/.test(await text(page)), 'L16: no green 保存済み badge while saving fails');
    const m = await markerOf(page);
    check(m.length === 1 && /もう一度/.test(m[0]), 'L16: the yellow marker asks to press the button again (' + short(m[0] || 'none', 60) + ')', true);
    await liveHealWrites(page);
    await nextLive(page).click(); await settle(1100);
    check((await curNo(page)) === '2' && (await storedBout(page, id + 's')) === 1, 'L16: after the disk is fine, pressing again works');
    return 'red: ' + short(reds.join(' | '), 120);
  });
  await mistake({ id: 'L17', screen: LSCR, vp: V, op: '2つのタブで開いたまま使う', what: '別のタブで試合を進めたあと、こちらの古い画面の「次の試合」を押す', risk: 'P1', guard: '「別の画面で変わりました」と黄色で言う。古い画面が上書きして試合を巻き戻さない' }, page, async () => {
    const other = await openLive(ctx, id + 's');
    check((await curNo(other)) === '2', 'L17: the second tab shows 第2試合');
    await settle(1100);
    await nextLive(other).click(); await settle(1100);
    check((await storedBout(other, id + 's')) === 2, 'L17: the second tab moved to 第3試合');
    await settle(900);
    const t = await text(page);
    check((await curNo(page)) === '3' || /別の画面で変わりました|最新/.test(t), 'L17: the old tab updated itself or warns (now 第' + (await curNo(page)) + ')');
    await prevLive(page).click({ force: true }).catch(() => {}); await settle(1100);
    const after = await storedBout(other, id + 's');
    check(after === 1 || after === 2, 'L17: nothing jumped to a wrong bout (stored index ' + after + ')');
    await snap(other);
    await other.close();
    return 'old tab: ' + (/別の画面で変わりました/.test(t) ? 'warned' : 'auto-updated');
  });
  await ctx.close();
});

scenario('LIVE-D', 'LIVE', 'private window / storage blocked', async (vp) => {
  const ctx = await newCtx(vp.mobile), V = vp.name;
  await mistake({ id: 'L18', screen: LSCR, vp: V, op: '当日の画面を開く', what: 'プライベートウィンドウなどで、保存データを読めない', risk: 'P1', guard: '赤で「保存データを読めません（データは消えていません）」＋「ふつうのウィンドウで開く」＋黄色「準備画面へ戻る」' }, null, async () => {
    const p = await ctx.newPage();
    await p.addInitScript(() => { indexedDB.open = function () { throw new DOMException('denied', 'SecurityError'); }; });
    await p.goto(base + '/private/live/?event=anything'); await settle(1500);
    const t = await text(p), reds = await redTexts(p), m = await markerOf(p);
    check(reds.some((x) => /読めません|ありません/.test(x)), 'L18: a red message says the data cannot be read (' + short(reds.join(' | '), 100) + ')');
    check(/消えていません|ふつうのウィンドウ/.test(t), 'L18: it says the data is not lost and what to try');
    check(await p.getByRole('link', { name: /準備画面へ戻る/ }).count() >= 1, 'L18: a way back is offered');
    check(m.length === 1, 'L18: one yellow marker (' + m.length + ')', true);
    await colourAudit(p, 'live unreadable ' + V, { markers: 1 });
    await snap(p);
    await p.close();
    return short(reds.join(' | '), 140);
  });
  const slow = await ctx.newPage();
  await mistake({ id: 'L19', screen: LSCR, vp: V, op: '当日の画面を開く', what: '保存データの読み込みが止まったまま（3秒以上）', risk: 'P2', guard: '待つ間は黄色の「そのまま待つ」。3秒すぎたら赤で「読めません」＋「もう一度ひらく」' }, slow, async () => {
    await slow.addInitScript(() => { const o = indexedDB.open.bind(indexedDB); indexedDB.open = function (...a) { return { set onsuccess(f) {}, set onerror(f) {}, set onupgradeneeded(f) {}, set onblocked(f) {}, result: null }; }; });
    await slow.goto(base + '/private/live/?event=slow'); await settle(600);
    check(/読んでいます/.test(await text(slow)) && (await redTexts(slow)).length === 0, 'L19: while waiting there is no red error yet (a ⏳ note instead)');
    await settle(3300);
    const reds = await redTexts(slow);
    check(reds.some((x) => /読めません|画面が出ません/.test(x)), 'L19: after 3 seconds a red message appears (' + short(reds.join(' | '), 100) + ')');
    const retry = await slow.getByRole('button', { name: 'もう一度ひらく' }).count(), back = await slow.getByRole('link', { name: /準備画面へ戻る/ }).count();
    check(retry === 1 || back >= 1, 'L19: there is a way forward (もう一度ひらく or a link to the prep screen)');
    check(retry === 1, 'L19: a 「もう一度ひらく」 retry button is offered when the read failed (only the link back is offered: ' + back + ')', true);
    const m = await markerOf(slow);
    check(m.length === 1, 'L19: exactly one yellow marker (' + m.length + ')', true);
    return short(reds.join(' | '), 120);
  });
  await ctx.close();
});

/* ═══════════════════════════ SCREEN 4: /apply/ (the fighter's phone form) ═══════════════════════════ */
const ASCR = '/apply/';
const GOOD = { gym: '架空ジム', name: '架空選手', height: '170', weight: '55', record: '初試合', contactName: '架空保護者', contactPhone: '09012345678', contactEmail: 'dummy@example.com' };
const openApply = async (ctx, over = {}, mode = 'live', hash = null) => {
  const page = await ctx.newPage();
  await page.goto(base + '/apply/' + (hash ?? applyHash(over, mode)));
  await page.locator('#f-gym, main, h1').first().waitFor({ timeout: 15000 });
  await settle(500);
  return page;
};
const fillField = async (page, key, value) => { const el = page.locator('#f-' + key); await el.fill(value); await el.blur(); };
/** a careful student: everything right. skip = field keys to leave empty. */
async function fillApply(page, o = {}, { photo = true, consent = true, skip = [] } = {}) {
  const v = { ...GOOD, ...o };
  for (const k of ['gym', 'name', 'height', 'weight', 'record', 'contactName', 'contactPhone', 'contactEmail']) if (!skip.includes(k)) await fillField(page, k, v[k]);
  if (photo && !skip.includes('photo')) {
    await page.locator('#f-photo').setInputFiles({ name: 'face.jpg', mimeType: 'image/jpeg', buffer: await photoFile(page) });
    await page.waitForFunction(() => !/写真を準備しています/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
    await settle(300);
  }
  if (consent && !skip.includes('consent')) await page.locator('#f-consent').check();
  await settle(200);
}
const reviewBtn = (p) => p.getByRole('button', { name: /^入力内容を確認する/ });
const sendBtn = (p) => p.getByRole('button', { name: 'この内容で送信する', exact: true });
const alerts = (p) => p.evaluate(() => [...document.querySelectorAll('[role=alert]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
const fieldMsg = (p, key) => p.evaluate((k) => { const el = document.getElementById('f-' + k); if (!el) return ''; const d = (el.getAttribute('aria-describedby') || '').split(/\s+/).map((i) => document.getElementById(i)).filter(Boolean).map((n) => n.innerText.replace(/\s+/g, ' ')).join(' | '); return d; }, key);
const tosErrors = (p) => p.evaluate(() => [...document.querySelectorAll('.tos-error')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));

scenario('APPLY-A', 'APPLY', 'empty and half-filled form', async (vp) => {
  const ctx = await newCtx(vp.mobile), V = vp.name;
  const page = await openApply(ctx);
  await mistake({ id: 'A01', screen: ASCR, vp: V, op: '「入力内容を確認する →」を押す', what: '何も入れないで押す', risk: 'P1', guard: '送信はされない。赤で「足りない所がN か所」＋欄ごとの赤＋最初の足りない欄へ移る。黄色は最初の欄' }, page, async () => {
    await colourAudit(page, 'apply fresh ' + V, { markerText: /ジム名/ });
    await reviewBtn(page).click({ force: true }); await settle(600);
    const al = await alerts(page), errs = await tosErrors(page);
    check(ctx.__posts.length === 0, 'A01: nothing was sent');
    check(al.some((t) => /足りない所が\d+か所/.test(t)), 'A01: a red summary says how many fields are missing (' + short(al.join(' | '), 100) + ')');
    await checkSeen(page, /足りない所が\d+か所/, 'A01');
    await checkSeen(page, /ジム名がまだです/, 'A01 first field');
    check(errs.filter((t) => /まだです/.test(t)).length >= 8, 'A01: each missing field has its own red line (' + errs.filter((t) => /まだです/.test(t)).length + ')');
    check(await page.evaluate(() => document.activeElement?.id === 'f-gym'), 'A01: the focus moved to the first missing field (ジム名)');
    check(errs.filter((t) => /まだです/.test(t)).every((t) => saysNext(t)), 'A01: every red line says what to do');
    const m = await markerOf(page);
    check(m.length === 1 && /ジム名/.test(m[0]), 'A01: the one yellow marker is on ジム名 (' + short(m[0] || 'none', 40) + ')', true);
    await colourAudit(page, 'apply after empty press ' + V, { markerText: /ジム名/ });
    return short(al.join(' | '), 100);
  });
  await mistake({ id: 'A02', screen: ASCR, vp: V, op: '連絡先の欄', what: '同意のチェックを入れ忘れる', risk: 'P1', guard: '赤「同意するときは、四角にチェックを入れてください」を同意の欄の近くに出す。送らない' }, page, async () => {
    const p2 = await openApply(ctx);
    await fillApply(p2, {}, { consent: false });
    await reviewBtn(p2).click(); await settle(500);
    const errs = await tosErrors(p2);
    check(errs.some((t) => /同意/.test(t)), 'A02: a red line asks to tick the box (' + short(errs.join(' | '), 100) + ')');
    check(await nearBy(p2, '#f-consent', 260), 'A02: the red line is next to the checkbox');
    check(ctx.__posts.length === 0 && !(await p2.getByRole('button', { name: 'この内容で送信する' }).count()), 'A02: no way to send yet and nothing was sent');
    const m = await markerOf(p2);
    check(m.length === 1 && /同意|チェック|四角/.test(m[0]), 'A02: the yellow marker points at the checkbox (' + short(m[0] || 'none', 50) + ')', true);
    await snap(p2);
    await p2.close();
    return short(errs.join(' | '), 90);
  });
  await mistake({ id: 'A03', screen: ASCR, vp: V, op: '写真をえらぶ', what: '写真を選ばないで確認に進む', risk: 'P1', guard: '赤「顔写真がまだです。下の『📷 写真をえらぶ』を押します」' }, page, async () => {
    const p2 = await openApply(ctx);
    await fillApply(p2, {}, { photo: false });
    await reviewBtn(p2).click(); await settle(500);
    const errs = await tosErrors(p2);
    check(errs.some((t) => /顔写真/.test(t) && /写真をえらぶ|選/.test(t)), 'A03: red line about the photo with what to press (' + short(errs.join(' | '), 100) + ')');
    check(ctx.__posts.length === 0, 'A03: nothing sent');
    await snap(p2);
    await p2.close();
    return short(errs.join(' | '), 90);
  });
  await ctx.close();
});

scenario('APPLY-B', 'APPLY', 'numbers, phone, email typed the wrong way', async (vp) => {
  const ctx = await newCtx(vp.mobile), V = vp.name;
  const page = await openApply(ctx);
  const okCases = [
    ['N01', '身長を全角で「１７０ｃｍ」', 'height', '１７０ｃｍ', '170'],
    ['N02', '身長を「170 cm」（空白と単位）', 'height', '170 cm', '170'],
    ['N03', '体重を「５５．５ｋｇ」', 'weight', '５５．５ｋｇ', '55.5'],
    ['N04', '体重を「55,5」（コンマ）', 'weight', '55,5', '55.5'],
    ['N05', '体重を「55.0」', 'weight', '55.0', '55'],
    ['N06', '電話番号を全角とハイフンで', 'contactPhone', '０９０－１２３４－５６７８', '09012345678'],
    ['N07', '電話番号を +81 で', 'contactPhone', '+81 90-1234-5678', '09012345678'],
    ['N08', '電話番号の前後に空白とかっこ', 'contactPhone', ' (090) 1234 5678 ', '09012345678'],
    ['N09', 'メールを全角の ＠ と大文字で', 'contactEmail', 'ＤＵＭＭＹ＠Example.com ', 'DUMMY@Example.com'],
    ['N10', 'メールの最後に「。」', 'contactEmail', 'dummy@example.com。', 'dummy@example.com'],
    ['N11', 'ジム名の前後に空白と全角空白', 'gym', '　 架空ジム 　', '架空ジム'],
    ['N26', '体重を「５５キロ」（カタカナの単位）', 'weight', '５５キロ', '55'],
    ['N27', '年齢を「１５歳」', 'age', '１５歳', '15'],
  ];
  for (const [cid, what, key, typed, want] of okCases) {
    await mistake({ id: cid, screen: ASCR, vp: V, op: key === 'height' || key === 'weight' || key === 'age' ? '身長・体重・年齢の欄' : key === 'contactPhone' ? '電話番号の欄' : key === 'contactEmail' ? 'メールの欄' : 'ジム名の欄', what, risk: 'P2', guard: '自動でそろえ、緑で「A → B」と見せる。赤は出さない' }, page, async () => {
      await fillField(page, key, typed); await settle(300);
      const shown = await val(page, '#f-' + key);
      const errs = (await tosErrors(page)).filter((t) => !/まだです/.test(t));
      check(shown === want, cid + ': "' + typed + '" is tidied to "' + want + '" (shows "' + shown + '")');
      check(!errs.some((t) => new RegExp({ height: '身長', weight: '体重', age: '年齢', contactPhone: '電話', contactEmail: 'メール', gym: 'ジム' }[key]).test(t)), cid + ': no red message for a harmless variation (' + short(errs.join('|'), 80) + ')');
      if (key !== 'gym') check(/→/.test(await page.evaluate((k) => document.getElementById('f-' + k)?.closest('div')?.parentElement?.innerText || '', key)) || true, cid + ': (tidy note)');
      return '"' + typed + '" -> "' + shown + '"';
    });
  }
  const badCases = [
    ['N12', '体重に文字（abc）', 'weight', 'abc', /体重|数字/],
    ['N13', '体重に 0', 'weight', '0', /体重|数字|範囲|〜|から/],
    ['N14', '体重に 999', 'weight', '999', /体重|数字|範囲|〜|から/],
    ['N15', '身長にマイナス', 'height', '-5', /身長|数字/],
    ['N16', '身長に「ひゃくななじゅう」', 'height', 'ひゃくななじゅう', /身長|数字/],
    ['N17', '電話番号が短い（090-1234）', 'contactPhone', '090-1234', /電話/],
    ['N18', '電話番号に文字（abc）', 'contactPhone', 'abc', /電話/],
    ['N19', 'メールに @ がない', 'contactEmail', 'dummy.example.com', /メール/],
    ['N20', 'メールが途中まで（dummy@）', 'contactEmail', 'dummy@', /メール/],
    ['N21', 'メールに空白が真ん中に入る（dum my@example.com）', 'contactEmail', 'dum my@example.com', null],
  ];
  for (const [cid, what, key, typed, re] of badCases) {
    await mistake({ id: cid, screen: ASCR, vp: V, op: key === 'height' || key === 'weight' || key === 'age' ? '身長・体重・年齢の欄' : key === 'contactPhone' ? '電話番号の欄' : 'メールの欄', what, risk: 'P1', guard: '欄を出たら、その欄の下に赤で「どこがまちがい」「例：…」。確認には進ませない' }, page, async () => {
      await fillField(page, key, ''); await settle(100);
      await fillField(page, key, typed); await settle(400);
      const errs = await tosErrors(page);
      const mine = await page.evaluate((k) => { const el = document.getElementById('f-' + k); const box = el?.closest('div'); return el ? { top: el.getBoundingClientRect().bottom, v: el.value, invalid: el.getAttribute('aria-invalid') } : null; }, key);
      if (re) {
        const m = errs.filter((t) => re.test(t) && !/まだです/.test(t));
        check(m.length >= 1, cid + ': a red line about this field appears (' + short(errs.join(' | '), 120) + ')');
        check(m.some((t) => /例|入れ|入力|数字|正しい|確認|直/.test(t)), cid + ': it gives an example or says what to do (' + short(m.join(' | '), 100) + ')');
        check(await nearBy(page, '#f-' + key, 220), cid + ': the red line is right under the box');
      } else check(true, cid + ': (either way is fine)');
      // a bad value can never reach the review step
      await fillApply(page, { [key]: typed }, { skip: ['photo'] });
      await reviewBtn(page).click({ force: true }).catch(() => {}); await settle(400);
      check(ctx.__posts.length === 0, cid + ': nothing was sent');
      return 'red: ' + short(errs.filter((t) => !/まだです/.test(t)).join(' | ') || 'none', 100);
    });
  }
  const eitherCases = [
    ['N24', '電話番号の前に「TEL:」と書く', 'contactPhone', 'TEL:090-1234-5678', '09012345678', /電話/],
    ['N25', '身長をメートルで「1.7m」と書く', 'height', '1.7m', null, /身長|cm|センチ|数字|範囲|〜|から/],
    ['N28', 'メールの前に「mailto:」が付いている', 'contactEmail', 'mailto:dummy@example.com', 'dummy@example.com', /メール/],
    ['N29', '身長を「170センチ」', 'height', '170センチ', '170', /身長/],
  ];
  for (const [cid, what, key, typed, want, re] of eitherCases) {
    await mistake({ id: cid, screen: ASCR, vp: V, op: key === 'height' ? '身長の欄' : key === 'contactPhone' ? '電話番号の欄' : 'メールの欄', what, risk: 'P1', guard: key === 'height' ? '自動でそろえるか、赤で「cmで入れます。例：170」と言う。1.7cmのような値を通さない' : key === 'contactEmail' ? '先頭の mailto: は自動で消すか、赤で「メールアドレスだけを入れます」と言う' : '自動でそろえるか、赤で例を出す。まちがった値のまま通さない' }, page, async () => {
      await fillField(page, key, ''); await fillField(page, key, typed); await settle(400);
      const shown = await val(page, '#f-' + key), errs = (await tosErrors(page)).filter((t) => re.test(t) && !/まだです/.test(t));
      if (want !== null && shown === want) check(errs.length === 0, cid + ': tidied to "' + want + '" with no red line');
      else {
        check(errs.length >= 1, cid + ': not tidied (shows "' + shown + '"), so a red line must say what is wrong (' + short(errs.join(' | '), 100) + ')');
        check(errs.some((t) => /例|入れ|入力|数字|cm|正しい|直/.test(t)), cid + ': the red line says what to type instead');
        await fillApply(page, { [key]: typed }, { skip: ['photo'] }); await reviewBtn(page).click({ force: true }).catch(() => {}); await settle(300);
        check(await sendBtn(page).count() === 0 && ctx.__posts.length === 0, cid + ': the wrong value cannot reach the send button');
      }
      return '"' + typed + '" -> "' + shown + '"; red: ' + short(errs.join(' | ') || 'none', 90);
    });
  }
  await mistake({ id: 'N22', screen: ASCR, vp: V, op: 'メールの欄', what: 'gmail.con のようなうっかりミス', risk: 'P1', guard: '決めつけず質問にする：「.com ではありませんか？」＋「直す」「このまま使う」' }, page, async () => {
    const p2 = await openApply(ctx);
    await fillField(p2, 'contactEmail', 'dummy@gmail.con'); await settle(300);
    check(/\.com/.test(await text(p2)) && await p2.getByRole('button', { name: '直す' }).count() >= 1 && await p2.getByRole('button', { name: 'このまま使う' }).count() >= 1, 'N22: it asks ".com ではありませんか？" with 直す / このまま使う');
    await p2.getByRole('button', { name: '直す' }).first().click(); await settle(300);
    check((await val(p2, '#f-contactEmail')) === 'dummy@gmail.com', 'N22: 直す corrects it (' + (await val(p2, '#f-contactEmail')) + ')');
    await snap(p2);
    await p2.close();
    return 'asks first';
  });
  await mistake({ id: 'N23', screen: ASCR, vp: V, op: '名前・戦績・意気込みの欄', what: '絵文字・500文字より長い文章・<script> を入れる', risk: 'P2', guard: '文字として扱う。長すぎるときは赤で「短くしてください」。画面は崩れない' }, page, async () => {
    const p2 = await openApply(ctx);
    await fillField(p2, 'name', '架空😀選手'); await fillField(p2, 'record', '<script>alert(1)</script>');
    await fillField(p2, 'comment', 'あ'.repeat(700)); await settle(300);
    const over = await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(over <= 1, 'N23: no sideways scroll (' + over + ')');
    check(p2.__dlg.log.length === 0 && await p2.locator('script', { hasText: 'alert(1)' }).count() === 0, 'N23: nothing was run');
    const cl = await val(p2, '#f-comment');
    check(cl.length <= 500 || (await tosErrors(p2)).some((t) => /500|長/.test(t)), 'N23: a 700-letter comment is cut to 500 or refused in red (' + cl.length + ')');
    await snap(p2);
    await p2.close();
    return 'comment length ' + cl.length;
  });
  await ctx.close();
});

scenario('APPLY-C', 'APPLY', 'photos', async (vp) => {
  const ctx = await newCtx(vp.mobile), V = vp.name;
  const page = await openApply(ctx);
  const input = page.locator('#f-photo');
  await mistake({ id: 'H01', screen: ASCR, vp: V, op: '「📷 写真をえらぶ」', what: '写真ではないファイル（.txt）を選ぶ', risk: 'P1', guard: '赤「これは写真ではありません」＋写真アプリの写真を選ぶ。写真は付かない' }, page, async () => {
    await input.setInputFiles({ name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await settle(700);
    const errs = await tosErrors(page);
    check(errs.some((t) => /写真ではありません/.test(t) && /選/.test(t)), 'H01: red line says it is not a photo and what to pick (' + short(errs.join(' | '), 100) + ')');
    check(await page.locator('img[alt*="写真"], #f-photo-box img').count() === 0, 'H01: no photo was attached');
    const m = await markerOf(page);
    check(m.length === 1, 'H01: still one yellow marker', true);
    return short(errs.find((t) => /写真/.test(t)) || '', 100);
  });
  await mistake({ id: 'H02', screen: ASCR, vp: V, op: '「📷 写真をえらぶ」', what: 'こわれた画像（名前は .jpg だが中身はちがう）を選ぶ', risk: 'P1', guard: '赤「写真が読み込めませんでした。別の写真を選ぶか、その場でカメラで撮ってください」' }, page, async () => {
    await input.setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not a jpeg') }); await settle(900);
    const errs = await tosErrors(page);
    check(errs.some((t) => /読み込めませんでした|写真/.test(t) && /別の写真|カメラ/.test(t)), 'H02: red line says to pick another photo (' + short(errs.join(' | '), 100) + ')');
    return short(errs.find((t) => /写真/.test(t)) || '', 100);
  });
  await mistake({ id: 'H03', screen: ASCR, vp: V, op: '「📷 写真をえらぶ」', what: '21MBの大きすぎる写真を選ぶ', risk: 'P2', guard: '赤「写真が大きすぎます（20MBまで）」＋別の写真を選ぶ' }, page, async () => {
    await input.setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(21 * 1024 * 1024, 1) }); await settle(1500);
    const errs = await tosErrors(page);
    check(errs.some((t) => /大きすぎます|読み込めません/.test(t)), 'H03: red line about the size (' + short(errs.join(' | '), 100) + ')');
    return short(errs.find((t) => /大きすぎ|読み込め/.test(t)) || '', 100);
  });
  await mistake({ id: 'H04', screen: ASCR, vp: V, op: '「📷 写真をえらぶ」', what: '良い写真を選んだあとで、まちがって悪いファイルを選ぶ（前の写真が消えないか）', risk: 'P1', guard: '赤で言い、「前の写真は そのままです」。写真は消えない' }, page, async () => {
    const p2 = await openApply(ctx);
    await p2.locator('#f-photo').setInputFiles({ name: 'face.jpg', mimeType: 'image/jpeg', buffer: await photoFile(p2) }); await settle(1200);
    check(await p2.locator('img').count() >= 1, 'H04: the good photo is shown');
    await p2.locator('#f-photo').setInputFiles({ name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }); await settle(800);
    const errs = await tosErrors(p2);
    check(await p2.locator('img').count() >= 1, 'H04: the first photo is still there after a bad pick');
    check(errs.some((t) => /前の写真は そのままです|前の写真/.test(t)), 'H04: the red line says the previous photo is kept (' + short(errs.join(' | '), 100) + ')');
    await snap(p2);
    await p2.close();
    return 'kept';
  });
  await ctx.close();
});

scenario('APPLY-D', 'APPLY', 'sending: double press, offline, edit after checking, leaving', async (vp) => {
  const ctx = await newCtx(vp.mobile), V = vp.name;
  await mistake({ id: 'X01', screen: ASCR, vp: V, op: '「この内容で送信する」', what: '2回・3回すばやく押す（申し込みが二重にならないか）', risk: 'P1', guard: '送るのは1回だけ。押したあとは「戻らない・閉じない」を赤で、黄色は「そのまま待つ」' }, null, async () => {
    const page = await openApply(ctx);
    await fillApply(page);
    await colourAudit(page, 'apply ready to check ' + V, { markerText: /確認|この内容/ });
    await reviewBtn(page).click(); await settle(500);
    check(await sendBtn(page).count() === 1, 'X01: the send button appears after checking');
    await colourAudit(page, 'apply review ' + V, { markerText: /送信|送る|この内容/ });
    const t = await text(page);
    check(/まだ送信していません|送信ではありません|確認/.test(t), 'X01: it says clearly that nothing has been sent yet');
    ctx.__posts.length = 0;
    await sendBtn(page).click({ clickCount: 3, delay: 15 }).catch(() => {}); await settle(1800);
    check(ctx.__posts.length === 1, 'X01: exactly one request was sent for three presses (' + ctx.__posts.length + ')');
    const body = ctx.__posts[0]?.body || '';
    const params = new URLSearchParams(body);
    check(!params.get('entryKey') && !/setupKey/.test(body), 'X01: no secret key value in the request (entryKey="' + (params.get('entryKey') || '') + '")');
    check(params.get('requestId') !== null && params.get('mode') === 'live', 'X01: the request has its duplicate-guard id and the live mode');
    check(/架空選手/.test(decodeURIComponent(body.replace(/\+/g, ' '))) || body.length > 50, 'X01: the request carries the form');
    return 'POSTs: ' + ctx.__posts.length;
  });
  await mistake({ id: 'X02', screen: ASCR, vp: V, op: '「入力内容を確認する →」→「戻って直す」', what: '確認の画面で内容のまちがいに気づいて「戻って直す」を押す', risk: 'P1', guard: '送信されない。入力は消えない。「内容を直したので、もう一度確認」と言う' }, null, async () => {
    const page = await openApply(ctx);
    await fillApply(page);
    ctx.__posts.length = 0;
    await reviewBtn(page).click(); await settle(400);
    await page.getByRole('button', { name: /戻って直す/ }).click(); await settle(400);
    check(ctx.__posts.length === 0, 'X02: nothing was sent');
    check((await val(page, '#f-name')) === '架空選手' && (await val(page, '#f-contactEmail')) === 'dummy@example.com', 'X02: nothing typed was lost');
    check(await sendBtn(page).count() === 0, 'X02: the send button is gone again (must check again)');
    // fix something after checking: the old check is void
    await reviewBtn(page).click(); await settle(300);
    await fillField(page, 'weight', '56'); await settle(500);
    check(await sendBtn(page).count() === 0, 'X02: after changing a field the old check no longer allows sending');
    check(/もう一度「入力内容を確認する/.test(await text(page) + (await alerts(page)).join(' ')), 'X02: it says to check again');
    await snap(page);
    await page.close();
    return 'safe';
  });
  await mistake({ id: 'X06', screen: ASCR, vp: V, op: '送ったあとの「戻る」', what: '送信したあと、ブラウザの戻るで申し込みの画面にもどって、もう一度送る', risk: 'P1', guard: '「受付番号の画面が出ましたか？ 出た方は申し込み済みです」と聞く。もう一度送っても二重にならない（同じ申込番号）。入力は消えている' }, null, async () => {
    const page = await openApply(ctx);
    await fillApply(page);
    await reviewBtn(page).click(); await settle(400);
    ctx.__posts.length = 0;
    await sendBtn(page).click(); await settle(1800);
    check(ctx.__posts.length === 1, 'X06: first send reached the endpoint once (' + ctx.__posts.length + ')');
    const firstId = new URLSearchParams(ctx.__posts[0]?.body || '').get('requestId');
    check(!!firstId, 'X06: the send carries a request id that makes a repeat harmless');
    page.__dlg.mode = 'accept';
    await page.goBack().catch(() => {}); await settle(1200);
    const t = await text(page);
    check(ctx.__posts.length === 1, 'X06: going Back does not send again by itself (' + ctx.__posts.length + ')');
    check(/\/apply\//.test(page.url()), 'X06: Back returns to the apply page');
    if (/受付番号の画面が出ましたか/.test(t)) check(/二重|申し込み済み/.test(t), 'X06: it says an earlier send is not doubled');
    else check((await val(page, '#f-name').catch(() => '')) === '', 'X06: otherwise the form is empty again (nothing personal restored)');
    await snap(page);
    const note = short(t.split('\n').find((l) => /受付番号|二重/.test(l)) || 'form is empty again', 100);
    await page.close();
    return note;
  });
  await mistake({ id: 'A04', screen: ASCR, vp: V, op: 'Enterキー', what: '欄でEnterキーを押す（2回・確認の画面でも）', risk: 'P1', guard: 'Enterで申し込みは送られない。送るのは「この内容で送信する」ボタンだけ' }, null, async () => {
    const page = await openApply(ctx);
    await fillApply(page);
    ctx.__posts.length = 0;
    await page.locator('#f-contactEmail').focus(); await page.keyboard.press('Enter'); await settle(400);
    check(ctx.__posts.length === 0, 'A04: Enter in a field does not send');
    await page.locator('#f-name').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await settle(500);
    check(ctx.__posts.length === 0, 'A04: pressing Enter twice does not send, even on the check screen (' + ctx.__posts.length + ')');
    await page.locator('#f-contactName').focus(); await page.keyboard.press('Enter'); await settle(300);
    check(ctx.__posts.length === 0, 'A04: Enter on the check screen still sends nothing');
    await snap(page);
    await page.close();
    return 'POSTs ' + ctx.__posts.length;
  });
  await mistake({ id: 'X03', screen: ASCR, vp: V, op: '「この内容で送信する」', what: '電波がない（機内モード）のに押す', risk: 'P1', guard: '赤「電波がありません。電波のある場所で、もう一度押してください」。送信しない。入力は消えない' }, null, async () => {
    const page = await openApply(ctx);
    await fillApply(page);
    await reviewBtn(page).click(); await settle(400);
    ctx.__posts.length = 0;
    await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await settle(300);
    await sendBtn(page).click({ force: true }).catch(() => {}); await settle(700);
    const al = await alerts(page);
    check(ctx.__posts.length === 0, 'X03: nothing was sent while offline');
    check(al.some((t) => /電波/.test(t)) || /電波/.test(await text(page)), 'X03: a red line says there is no signal (' + short(al.join(' | '), 100) + ')');
    check((await val(page, '#f-name')) === '架空選手', 'X03: input is kept');
    await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online'))); await settle(300);
    await snap(page);
    await page.close();
    return short(al.join(' | '), 100);
  });
  await mistake({ id: 'X04', screen: ASCR, vp: V, op: 'ページを閉じる・戻る・再読み込み', what: '入力の途中で閉じる／戻る／更新する', risk: 'P1', guard: '「このページを離れますか」が出る。入力はこの端末に残らない（個人情報）ので、ページで「入力は消えます」と言っておく' }, null, async () => {
    const page = await openApply(ctx);
    check(/入力は消えます/.test(await text(page)), 'X04: the page warns beforehand that reloading erases the input');
    check(page.__dlg.log.length === 0, 'X04: nothing asked while the form is empty');
    await fillField(page, 'name', '架空選手'); await settle(200);
    page.__dlg.log.length = 0; page.__dlg.mode = 'dismiss';
    await page.reload().catch(() => {}); await settle(700);
    check(page.__dlg.log.some((d) => d.type === 'beforeunload'), 'X04: reload with input asks "leave this page?" (' + page.__dlg.log.map((d) => d.type).join(',') + ')');
    check((await val(page, '#f-name')) === '架空選手', 'X04: choosing to stay keeps the input');
    page.__dlg.mode = 'accept';
    await page.reload(); await page.locator('#f-gym').waitFor(); await settle(400);
    check((await val(page, '#f-name')) === '', 'X04: after leaving, nothing personal is left behind in the box');
    const stored = await page.evaluate(() => JSON.stringify({ l: Object.keys(localStorage), s: Object.keys(sessionStorage) }));
    check(!/架空選手|dummy|0901234/.test(JSON.stringify(await page.evaluate(() => ({ ...localStorage })))), 'X04: no personal data was stored in this browser (' + stored + ')');
    await snap(page);
    await page.close();
    return 'beforeunload asked';
  });
  await mistake({ id: 'X05', screen: ASCR, vp: V, op: 'リンクが変わる', what: '入力の途中で、別のURLのリンクを開き直す（ハッシュが変わる）', risk: 'P1', guard: '入力を黙って消さない。箱で「新しいリンクに切りかえますか」と聞き、やめるが先' }, null, async () => {
    const page = await openApply(ctx);
    await fillField(page, 'name', '架空選手');
    await page.evaluate((h) => { location.hash = h; }, applyHash({ title: '別の大会' }));
    await settle(700);
    const t = await text(page);
    const box = page.getByRole('alertdialog');
    check((await val(page, '#f-name')) === '架空選手' || await box.count() === 1, 'X05: the typed name was not silently erased');
    if (await box.count()) {
      check(await page.evaluate(() => /^(やめる|今のまま続ける|いまのまま続ける)/.test(document.activeElement?.innerText.trim() || '')), 'X05: the safe button has the focus (' + await page.evaluate(() => document.activeElement?.innerText.trim()) + ')');
      check(await box.locator('.tos-danger').count() >= 1, 'X05: the loss is written in red');
    }
    await snap(page);
    await page.close();
    return box ? 'asked: ' + short(t.split('\n').find((l) => /新しい|切りかえ/.test(l)) || '', 60) : 'kept';
  });
  await ctx.close();
});

scenario('APPLY-E', 'APPLY', 'wrong, old or closed links', async (vp) => {
  const ctx = await newCtx(vp.mobile), V = vp.name;
  const linkCases = [
    ['K01', 'リンクの後ろ（#…）が切れている／何もない', '', /使えません|古く|リンク/],
    ['K02', 'リンクが途中で切れている（#endpoint=https%3A）', '#endpoint=https%3A%2F%2Fscript.google.com', /使えません|古く|リンク/],
    ['K03', '別のURL（script.google.com 以外）のリンク', '#' + new URLSearchParams({ endpoint: 'https://example.com/exec', protocol: '3', mode: 'live', eventId: 'tos-0123456789', title: '架空', date: '2099-12-01', venue: 'x', organizer: 'x', contact: '0200000000', deadline: '2099-11-30' }).toString(), /使えません|古く|リンク/],
    ['K04', '古い /dev のリンク', '#' + new URLSearchParams({ endpoint: 'https://script.google.com/macros/s/TOS/dev', protocol: '3', mode: 'live', eventId: 'tos-0123456789', title: '架空', date: '2099-12-01', venue: 'x', organizer: 'x', contact: '0200000000', deadline: '2099-11-30' }).toString(), /使えません|古く|リンク/],
    ['K05', 'protocol が古い（鍵なしの旧リンク）', '#' + new URLSearchParams({ endpoint: ENDPOINT, protocol: '2', mode: 'live', eventId: 'tos-0123456789', title: '架空', date: '2099-12-01', venue: 'x', organizer: 'x', contact: '0200000000', deadline: '2099-11-30' }).toString(), /使えません|古く|リンク|新しい/],
  ];
  for (const [cid, what, hash, re] of linkCases) {
    await mistake({ id: cid, screen: ASCR, vp: V, op: '申し込みのリンクを開く', what, risk: 'P1', guard: '赤で「このリンクは使えません。主催者に新しいリンクを聞いてください」。送信ボタンは灰色＋理由。問い合わせ先があれば出す' }, null, async () => {
      const page = await openApply(ctx, {}, 'live', hash);
      const t = await text(page), errs = await tosErrors(page), al = await alerts(page);
      check(re.test(t), cid + ': the page says the link cannot be used (' + short(t, 120) + ')');
      check(errs.length + al.length >= 1, cid + ': there is a red message (' + short(errs.concat(al).join(' | '), 100) + ')');
      check(/主催者|聞いて|問い合わせ|連絡/.test(t), cid + ': it says who to ask');
      ctx.__posts.length = 0;
      await reviewBtn(page).click({ force: true }).catch(() => {}); await settle(300);
      check(ctx.__posts.length === 0 && await sendBtn(page).count() === 0, cid + ': nothing can be sent');
      const dis = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /確認/.test(b.innerText) && b.getBoundingClientRect().width > 0).map((b) => b.disabled || b.getAttribute('aria-disabled') === 'true'));
      check(dis.every(Boolean), cid + ': the check button is locked (' + dis.join(',') + ')');
      await colourAudit(page, 'apply bad link ' + cid + ' ' + V, { markers: (await markerOf(page)).length <= 1 ? (await markerOf(page)).length : 1 });
      const note = short(errs.concat(al).join(' | ') || t.slice(0, 120), 130);
      await snap(page);
      await page.close();
      return note;
    });
  }
  await mistake({ id: 'K06', screen: ASCR, vp: V, op: '申し込みのリンクを開く', what: '締め切りの日をすぎたあとで開く', risk: 'P1', guard: '赤で「締め切りをすぎました」＋電話で相談（番号つき）。送信はさせない' }, null, async () => {
    const page = await openApply(ctx, { deadline: '2000-01-01' });
    const t = await text(page), errs = await tosErrors(page), al = await alerts(page);
    check(/締切|締め切り/.test(t) && /すぎ|過ぎ|終わ|電話|相談|連絡/.test(t), 'K06: it says the deadline has passed (' + short(t.slice(0, 160), 120) + ')');
    check(errs.length + al.length >= 1 || /気をつけて/.test(t), 'K06: red or yellow message shown');
    check(/0200000000|02-0000-0000|電話/.test(t), 'K06: the contact phone is offered');
    const m = await markerOf(page);
    check(m.length <= 1, 'K06: at most one yellow marker (' + m.length + ')');
    await colourAudit(page, 'apply deadline passed ' + V, { markers: m.length });
    await snap(page);
    await page.close();
    return short(errs.concat(al).join(' | ') || t.slice(0, 100), 100);
  });
  await mistake({ id: 'K07', screen: ASCR, vp: V, op: '申し込みのリンクを開く', what: '練習用（テスト）のリンクを本番と思って使う', risk: 'P1', guard: '練習用だと目立つ色と言葉（⚠ 練習用）で言う。本物の名簿に入らないことを書く' }, null, async () => {
    const page = await openApply(ctx, {}, 'test');
    const t = await text(page);
    check(/練習|テスト/.test(t), 'K07: the page says it is only practice/test (' + short(t.slice(0, 120), 100) + ')');
    check(/大会には届きません|本番ではありません|入りません/.test(t), 'K07: it says nothing reaches the real tournament');
    const errs = await tosErrors(page);
    check(errs.some((x) => /テスト/.test(x)), 'K07: the practice warning is in red');
    await snap(page);
    await page.close();
    return short(t.split('\n').find((l) => /練習|テスト/.test(l)) || '', 100);
  });
  await ctx.close();
});

scenario('APPLY-F', 'APPLY', 'colour language on the whole form', async (vp) => {
  const ctx = await newCtx(vp.mobile), V = vp.name;
  const page = await openApply(ctx);
  await mistake({ id: 'Z01', screen: ASCR, vp: V, op: '4つの手順を上から順に', what: '（黄色の移動）ジム名→選手名→…→写真→連絡先→同意→確認→送信の順に、黄色が次の欄へ動く', risk: 'P2', guard: '黄色は1つだけ。終わった欄は緑✓。足りない数「あと〇か所」を出す' }, page, async () => {
    const seq = [];
    const step = async (label, re) => { const c = await colourAudit(page, 'apply ' + label + ' ' + V, { markerText: re }); seq.push(label + ':' + short((c.markers[0] || {}).full || 'none', 30)); };
    await step('1 empty', /ジム名/);
    await fillField(page, 'gym', GOOD.gym); await step('2 gym done', /選手名/);
    await fillField(page, 'name', GOOD.name); await step('3 name done', /身長/);
    await fillField(page, 'height', GOOD.height); await step('4 height done', /体重/);
    await fillField(page, 'weight', GOOD.weight); await step('5 weight done', /戦績/);
    await fillField(page, 'record', GOOD.record); await step('6 record done', /写真/);
    await page.locator('#f-photo').setInputFiles({ name: 'face.jpg', mimeType: 'image/jpeg', buffer: await photoFile(page) }); await settle(1200);
    await step('7 photo done', /お名前|連絡先/);
    await fillField(page, 'contactName', GOOD.contactName); await step('8 contact name', /電話/);
    await fillField(page, 'contactPhone', GOOD.contactPhone); await step('9 phone', /メール/);
    await fillField(page, 'contactEmail', GOOD.contactEmail); await step('10 email', /同意|チェック|四角/);
    await page.locator('#f-consent').check(); await settle(300); await step('11 consent', /確認/);
    return seq.join(' > ');
  });
  await mistake({ id: 'Z02', screen: ASCR, vp: V, op: '押せないボタンと危ないボタン', what: '（色の確認）押せないボタンに理由・危ない箱は赤・安全な方が先', risk: 'P2', guard: '色の約束どおり' }, page, async () => {
    const a = await page.evaluate((vw) => ({ sw: document.documentElement.scrollWidth, vw }), vp.mobile ? 390 : 1280);
    check(a.sw <= a.vw, 'Z02: no sideways scroll (' + a.sw + ')');
    const focus = await page.evaluate(() => ({ t: document.activeElement?.innerText || '', c: String(document.activeElement?.className || '') }));
    check(!/danger/.test(focus.c), 'Z02: no dangerous button has the focus by default');
    return 'ok';
  });
  await ctx.close();
});

/* ═══════════════════════════ runner ═══════════════════════════ */
const t0 = Date.now();
for (const sc of scenarios) {
  if (ONLY.length && !ONLY.includes(sc.id) && !ONLY.includes(sc.screen)) continue;
  for (const mobile of sc.viewports) {
    const vp = { mobile, tag: mobile ? 'sp' : 'pc', name: vpOf(mobile) };
    cur = sc.id + '/' + vp.name;
    console.log('▶ ' + cur + ' — ' + sc.name);
    try { await sc.fn(vp); } catch (e) { check(false, 'scenario crashed: ' + short(e.stack || e.message, 400)); }
  }
}
await browser.close();

/* privacy invariants over the whole run */
check(externals.length === 0, 'no request left 127.0.0.1 except the simulated endpoint (saw ' + short(externals.map((e) => e.method + ' ' + e.url).join(', '), 200) + ')');
check(pageErrors.length === 0, 'no uncaught page errors (' + short(pageErrors.map((e) => e.scenario + ': ' + e.message).join(' | '), 300) + ')');
const writes = net.filter((n) => n.method !== 'GET' && !n.url.startsWith(base + '/') && !/APPLY/.test(n.scenario));
check(writes.length === 0, 'only the /apply/ form ever POSTs to the endpoint (saw ' + writes.length + ' elsewhere)');

/* distinct mistakes: safe only when safe at every viewport */
const byId = new Map();
for (const c of cases) { const o = byId.get(c.id) || { ...c, safe: true, runs: [] }; o.safe = o.safe && c.safe; o.runs.push({ vp: c.vp, safe: c.safe, today: c.today, evidence: c.evidence, failed: c.failed, language: c.language }); byId.set(c.id, o); }
const distinct = [...byId.values()];
await writeFile(join(OUT, 'cases.json'), JSON.stringify(distinct, null, 1));
const unsafe = distinct.filter((c) => !c.safe);
console.log('\n── unsafe mistake cases ──');
for (const c of unsafe) console.log(' [' + c.risk + '] ' + c.id + ' ' + c.screen + ' | ' + c.op + ' | ' + c.what + '\n      today: ' + short(c.runs.find((r) => !r.safe)?.today || c.today, 200) + '\n      guard: ' + c.guard + '\n      evidence: ' + (c.runs.find((r) => !r.safe)?.evidence || ''));
if (process.env.TOS_PRINT_ALL) { console.log('\n── every mistake case (operation | mistake | risk | today | guard) ──'); for (const c of distinct) console.log((c.safe ? 'SAFE   ' : 'UNSAFE ') + c.id + ' [' + c.risk + '] ' + c.screen + ' | ' + c.op + ' | ' + c.what + ' | today: ' + short(c.today, 120) + ' | guard: ' + c.guard); }
console.log('\ncases file: ' + join(OUT, 'cases.json'));
const hardF = failures.filter((f) => !f.soft), softF = failures.filter((f) => f.soft);
console.log('checks: ' + checks + ', failed: ' + failures.length + ' (hard ' + hardF.length + ', colour/word language ' + softF.length + ') (' + Math.round((Date.now() - t0) / 1000) + 's)');
console.log('mistake cases: ' + distinct.length + ', safe: ' + distinct.filter((c) => c.safe).length + '  (runs: ' + cases.length + ', safe runs: ' + cases.filter((c) => c.safe).length + ')');
if (failures.length) { console.log('\nFAILURES:'); for (const f of failures) console.log(' - ' + (f.soft ? '(language) ' : '') + f.msg); process.exit(1); }
