/**
 * Adversarial resilience checks for the Tournament OS v3 chairman screens (/private/ and /private/setup/).
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation; all data is fake.
 * It drives the REAL built pages (npm run build:private -> out-private-pages) at 1280px and 390px.
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4450 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=/tmp/claude-0/pwshim.mjs TOS_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/test-private-resilience.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4450), TOS_ONLY=A,B (scenario ids), TOS_CHROME_PATH (for the browser-restart scenario).
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { emptyTournament, isLocalTournament } from '../core/privateTournament.ts';
import { EXPECTED_RECEPTION_BUILD } from '../core/setupV3.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4450';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const ENDPOINT = 'https://script.google.com/macros/s/TOS_RESILIENCE_SIM/exec';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

/* ───────────────────────── bookkeeping ───────────────────────── */
let checks = 0, cur = '-';
const failures = [], skipped = [], net = [], externals = [], pageErrors = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 160) => String(s).replace(/\s+/g, ' ').slice(0, n);

/* ───────────────────────── fake data ───────────────────────── */
const CSV_HEAD = '管理番号,ジム名,選手名,学年,年齢,身長,体重,戦績・競技歴,試合への意気込み,入場曲URL（Apple Music推奨）';
const ROWS = [
  ['F01', '架空赤ジム', '架空赤選手', '小6', '12', '150', '60', '初試合', 'がんばる', ''],
  ['F02', '架空青ジム', '架空青選手', '中1', '13', '155', '61.5', '1戦', '全力', ''],
  ['F03', '架空緑ジム', '架空緑選手', '中2', '14', '160', '55', '2戦', '気合', ''],
  ['F04', '架空黄ジム', '架空黄選手', '中3', '15', '162', '56', '3戦', '全力', ''],
  ['F05', '架空白ジム', '架空白選手', '高1', '16', '170', '70', '初試合', 'やる', ''],
  ['F06', '架空黒ジム', '架空黒選手', '高2', '17', '172', '71', '1戦', '勝つ', ''],
  ['F07', '架空紫ジム', '架空紫選手', '高3', '18', '175', '65', '5戦', '勝つ', ''],
  ['F08', '架空桃ジム', '架空桃選手', '社会人', '25', '176', '66', '8戦', '勝つ', ''],
];
const csvOf = (rows) => [CSV_HEAD, ...rows.map((r) => r.join(','))].join('\n');
const CSV6 = csvOf(ROWS.slice(0, 6));
const CSV8 = csvOf(ROWS);
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const fighterOf = (row, photo = true) => ({ id: row[0], gym: row[1], name: row[2], grade: row[3], age: row[4], height: row[5], weight: row[6], record: row[7], comment: row[8], musicUrl: row[9], photoDataUrl: photo ? TINY_JPEG : '' });
/** A saved event for seeding the browser store directly (the real screens are driven in scenarios A, I and L). */
function seed(id, o = {}) {
  const n = o.fighters ?? 4;
  const fighters = ROWS.slice(0, n).map((r) => fighterOf(r, o.photos ?? true));
  const pairs = o.bouts ?? [[0, 1], [2, 3]];
  const bouts = pairs.map((p, i) => ({ id: 'bout-' + i, redId: p[0] === null ? '' : fighters[p[0]].id, blueId: p[1] === null ? '' : fighters[p[1]].id, className: '', rule: '' }));
  const v = { ...emptyTournament(id), title: o.title ?? '架空大会', date: o.date ?? '2027年10月3日', venue: o.venue ?? '架空体育館', fighters, bouts, updatedAt: o.updatedAt ?? Date.now() - 60_000 };
  if (o.entryConfig) v.entryConfig = o.entryConfig;
  return v;
}

/* ───────────────────────── backup file (independent of the app, same documented format) ───────────────────────── */
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
  page.__dlg = { mode: 'dismiss', log: [] };
  page.on('dialog', (d) => { page.__dlg.log.push({ type: d.type(), message: d.message() }); return page.__dlg.mode === 'accept' ? d.accept().catch(() => {}) : d.dismiss().catch(() => {}); });
  page.on('pageerror', (e) => { pageErrors.push({ scenario: cur, message: e.message }); });
}
function wire(ctx, allowed = []) {
  ctx.__net = [];
  ctx.__ext = null; // optional handler for allowed external requests (setup page ping)
  ctx.on('request', (r) => { if (/^https?:/.test(r.url())) { const e = { scenario: cur, url: r.url(), method: r.method(), body: r.postData() }; net.push(e); ctx.__net.push(e); } });
  ctx.on('page', attach);
  return ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(base + '/')) return route.continue();
    const base0 = url.split('?')[0];
    if (allowed.includes(base0) && ctx.__ext) return ctx.__ext(route);
    externals.push({ scenario: cur, url, method: route.request().method() });
    return route.abort();
  });
}
async function newCtx(mobile, o = {}) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], ...o });
  await wire(ctx, o.allowed || []);
  return ctx;
}
const openPrivate = async (ctx, id, suffix = '') => {
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=' + id + suffix);
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  return page;
};
const stateOf = (p) => p.locator('#save-state').innerText();
const waitState = (p, word, t = 8000) => p.waitForFunction((w) => document.querySelector('#save-state')?.innerText.includes(w), word, { timeout: t });
const notices = (p) => p.evaluate(() => [...document.querySelectorAll('[role=status],[role=alert]')].map((n) => n.innerText).join(' || '));
const waitNotice = (p, text, t = 8000) => p.waitForFunction((w) => [...document.querySelectorAll('[role=status],[role=alert]')].some((n) => n.innerText.includes(w)), text, { timeout: t });
/** 確認は画面の中の箱（role=alertdialog）。ブラウザの確認画面は出ない。箱のボタンを名前で押す */
const askBox = (p) => p.getByRole('alertdialog');
const SAFE_NO = 'やめる（何も変えない）';
const boxPress = (p, name) => askBox(p).getByRole('button', { name, exact: typeof name === 'string' }).click();
const boxNextTo = (p, boxSel, triggerSel) => p.evaluate(([b, t]) => { const bx = document.querySelector(b), tr0 = document.querySelector(t); if (!bx || !tr0) return false; const tr = tr0.closest('label') || tr0; const rb = bx.getBoundingClientRect(), rt = tr.getBoundingClientRect(); return rb.top >= rt.bottom - 2 && rb.top - rt.bottom < 400; }, [boxSel, triggerSel]);
const focusIsSafe = (p) => p.evaluate((n) => document.activeElement?.textContent === n && !!document.activeElement.closest('[role=alertdialog]'), SAFE_NO);
const waitDialogs = async (p, n, ms = 5000) => { const t = Date.now(); while (p.__dlg.log.length < n && Date.now() - t < ms) await settle(50); return p.__dlg.log.length >= n; };
const val = (p, sel) => p.locator(sel).inputValue();
const btn = (p, name) => p.getByRole('button', { name, exact: true });
const saveBtn = (p) => p.getByRole('button', { name: /^(保存する|もう一度 保存する)$/ });
/** Press save at a human pace: the page ignores a save press within 1.5s of a previous good save (see scenario B), so wait for that first. */
const save = async (p) => { const wait = (p.__savedAt || 0) + 1700 - Date.now(); if (wait > 0) await settle(wait); await saveBtn(p).click(); await waitState(p, '保存済み', 8000).catch(() => {}); p.__savedAt = Date.now(); };
const boutCount = (p) => p.locator('article[id^="bout-"]').count();
const boutValues = (p) => p.evaluate(() => [...document.querySelectorAll('article[id^="bout-"]')].map((a) => [a.querySelector('select[aria-label="赤コーナーの選手"]')?.value ?? null, a.querySelector('select[aria-label="青コーナーの選手"]')?.value ?? null]));
const importFile = (p, name, type, buffer) => p.locator('#pick-file').setInputFiles({ name, mimeType: type, buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer) });
const importCsv = (p, csv, name = 'players.csv') => importFile(p, name, 'text/csv', Buffer.from(csv, 'utf8'));
const addBout = async (p, red, blue) => {
  const n = await boutCount(p);
  await btn(p, '＋ 試合を追加').click();
  await p.locator('#bout-' + n + '-red').waitFor();
  if (red) await p.locator('#bout-' + n + '-red').selectOption(red);
  if (blue) await p.locator('#bout-' + n + '-blue').selectOption(blue);
};
const openBackup = async (p) => { if (!(await p.locator('#backup').evaluate((d) => d.open))) await p.locator('#backup > summary').click(); };
const setPasswords = async (p, a, b = a) => { await openBackup(p); await p.locator('#backup-password').fill(a); await p.locator('#backup-password2').fill(b); };
const restoreInput = (p) => p.locator('input[accept=".enc"]');
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
/** Put a saved event into the browser store, then open the real screen on it. */
const seedAndOpen = async (ctx, value) => {
  const boot = await ctx.newPage();
  await boot.goto(base + '/private/setup/?event=seed-boot');
  await idbPut(boot, value);
  await boot.close();
  return openPrivate(ctx, value.eventId);
};
const jpegs = (p, n) => p.evaluate((n) => Array.from({ length: n }, (_, i) => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2'][i % 6]; x.fillRect(0, 0, 120, 160); x.fillStyle = '#fff'; x.fillRect(10 + i * 7, 20, 30, 30); return c.toDataURL('image/jpeg').split(',')[1]; }), n).then((l) => l.map((b) => Buffer.from(b, 'base64')));
const quiet = async (ctx, label, fn) => { const n0 = ctx.__net.length; await fn(); await settle(250); const extra = ctx.__net.slice(n0); check(extra.length === 0, label + ' sends no network request (saw: ' + short(extra.map((e) => e.method + ' ' + e.url).join(', '), 200) + ')'); };

/* ── failure injection (IndexedDB) ── */
const failWrites = (p, kind = 'tx') => p.evaluate((kind) => {
  window.__orig = window.__orig || { tx: IDBDatabase.prototype.transaction, put: IDBObjectStore.prototype.put, open: indexedDB.open };
  const o = window.__orig;
  if (kind === 'tx' || kind === 'quota') IDBDatabase.prototype.transaction = function (s, m, ...r) { if (m === 'readwrite') { if (kind === 'quota') throw new DOMException('quota', 'QuotaExceededError'); throw new Error('SIMULATED_DISK_FULL'); } return o.tx.call(this, s, m, ...r); };
  if (kind === 'put') IDBObjectStore.prototype.put = function () { throw new DOMException('quota', 'QuotaExceededError'); };
  if (kind === 'open') indexedDB.open = function () { throw new DOMException('denied', 'SecurityError'); };
}, kind);
const healWrites = (p) => p.evaluate(() => { const o = window.__orig; if (!o) return; IDBDatabase.prototype.transaction = o.tx; IDBObjectStore.prototype.put = o.put; delete indexedDB.open; });
const slowOpen = (p, ms) => p.evaluate((ms) => {
  const orig = indexedDB.open.bind(indexedDB);
  indexedDB.open = function (...a) {
    const fake = {};
    setTimeout(() => {
      const real = orig(...a);
      real.onupgradeneeded = (e) => { fake.result = real.result; fake.onupgradeneeded && fake.onupgradeneeded(e); };
      real.onsuccess = (e) => { fake.result = real.result; fake.onsuccess && fake.onsuccess(e); };
      real.onerror = (e) => { fake.error = real.error; fake.onerror && fake.onerror(e); };
      real.onblocked = (e) => { fake.onblocked && fake.onblocked(e); };
    }, ms);
    return fake;
  };
}, ms);
const unslow = (p) => p.evaluate(() => { delete indexedDB.open; });

/* ── in-page audits ── */
const AUDIT = (vw) => {
  const out = { scrollW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth, innerW: vw, over: [], noName: [], small: [], tiny: [], primary: [], text: document.body.innerText.length };
  const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const hidden = (el) => !!el.closest('[aria-hidden="true"],[inert]');
  const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.id || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
  const textOf = (node) => { let t = ''; for (const c of node.childNodes) { if (c.nodeType === 3) t += c.textContent; else if (c.nodeType === 1 && c.getAttribute('aria-hidden') !== 'true' && !['SCRIPT', 'STYLE'].includes(c.tagName)) t += textOf(c); } return t; };
  const nameOf = (el) => {
    const al = el.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map((i) => { const n = document.getElementById(i); return n ? textOf(n) : ''; }).join(' ').trim(); if (t) return t; }
    if (el.labels && el.labels.length) { const t = [...el.labels].map((l) => textOf(l)).join(' ').trim(); if (t) return t; }
    if (el.tagName === 'IMG') return el.getAttribute('alt') || '';
    const t = textOf(el).trim(); if (t) return t;
    return (el.getAttribute('title') || '').trim();
  };
  const rgb = (css) => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.clearRect(0, 0, 1, 1); x.fillStyle = css; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  // 1. horizontal overflow: the page, plus any visible element sticking out of the window
  for (const el of document.body.querySelectorAll('*')) {
    if (!vis(el) || el.closest('[aria-hidden="true"]')) continue;
    if (el.closest('details:not([open])') && !el.closest('summary') && el.tagName !== 'SUMMARY' && !(el.parentElement?.tagName === 'DETAILS')) continue; // folded text is not on screen (its effect on the page width is caught by the scrollWidth check)
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'hidden' || o === 'scroll' || o === 'clip') { clipped = true; break; } p = p.parentElement; }
      if (!clipped && !el.classList.contains('sr-only')) out.over.push(el.tagName + ':' + label(el) + ' right=' + Math.round(r.right) + ' left=' + Math.round(r.left));
    }
  }
  // 2. accessible names on every control; a name made only of symbols is an icon-only control
  for (const el of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=checkbox]')) {
    if (!vis(el) && !el.classList.contains('sr-only')) continue;
    if (hidden(el)) continue;
    const n = nameOf(el);
    if (!/[\p{L}\p{N}]/u.test(n)) out.noName.push(el.tagName + '#' + (el.id || '') + ' "' + n + '" class=' + String(el.className).slice(0, 40));
  }
  // 3. tap targets >= 48px
  for (const el of document.querySelectorAll('a[href],button,summary,select,textarea,input:not([type=hidden]):not([type=file]),[role=button]')) {
    if (!vis(el) || hidden(el)) continue;
    const r = el.getBoundingClientRect();
    const box = el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type) && el.labels && el.labels[0] ? el.labels[0].getBoundingClientRect() : r;
    if (box.height < 47.5 || (el.tagName !== 'A' && box.width < 47.5)) out.small.push(el.tagName + ':' + label(el) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height));
  }
  for (const el of document.querySelectorAll('label')) {
    if (!el.querySelector('input[type=file]') || !vis(el) || hidden(el)) continue;
    const r = el.getBoundingClientRect(); if (r.height < 47.5) out.small.push('FILE-LABEL:' + label(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  // 4. text >= 17px
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'OPTION', 'OPTGROUP', 'NEXT-ROUTE-ANNOUNCER'].includes(el.tagName) || !vis(el) || hidden(el) || el.closest('.sr-only')) continue;
    const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    const isField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && el.type !== 'file' && el.type !== 'checkbox';
    if (!own && !isField) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16.99) out.tiny.push(el.tagName + ' ' + fs + 'px "' + (own ? textOf(el).trim() : label(el)).slice(0, 30) + '"');
  }
  // 5. emphasised (dark filled, light text) buttons: exactly one at a time
  for (const el of document.querySelectorAll('button,a[href],[role=button]')) {
    if (!vis(el) || hidden(el)) continue;
    const s = getComputedStyle(el), bg = rgb(s.backgroundColor), fg = rgb(s.color);
    if (bg[3] > 200 && lum(bg) < 0.2 && lum(fg) > 0.7) out.primary.push(label(el));
  }
  return out;
};
const RING = () => {
  const el = document.activeElement; if (!el || el === document.body) return { ok: false, what: 'nothing focused' };
  const ring = (n) => { const s = getComputedStyle(n); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || (s.boxShadow !== 'none' && /\d+px/.test(s.boxShadow)); };
  let ok = ring(el);
  if (!ok && el.tagName === 'INPUT' && el.type === 'file') { const l = el.closest('label'); ok = !!l && ring(l); }
  const bar = document.querySelector('div.fixed.bottom-0'); let hiddenByBar = false;
  if (bar && !bar.contains(el)) { const r = el.getBoundingClientRect(), b = bar.getBoundingClientRect(); const target = el.tagName === 'INPUT' && el.type === 'file' && el.closest('label') ? el.closest('label').getBoundingClientRect() : r; hiddenByBar = target.bottom > b.top + 2 && target.top < b.bottom; }
  return { ok, hiddenByBar, what: el.tagName + '#' + (el.id || '') + ' ' + (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').slice(0, 30) };
};
async function audit(page, label, { primary = 1, tapLinks = true } = {}) {
  const a = await page.evaluate(AUDIT, page.viewportSize().width);
  check(a.scrollW <= a.innerW && a.bodyW <= a.innerW, label + ': no horizontal scroll (doc ' + a.scrollW + ' body ' + a.bodyW + ' window ' + a.innerW + ') ' + short(a.over.slice(0, 3).join(' ; ')));
  check(a.over.length === 0, label + ': no element sticks out of the window: ' + short(a.over.slice(0, 4).join(' ; '), 300));
  check(a.noName.length === 0, label + ': every control has a word name (no icon-only control): ' + short(a.noName.slice(0, 4).join(' ; '), 300));
  const small = tapLinks ? a.small : a.small.filter((s) => !s.startsWith('A:'));
  check(small.length === 0, label + ': tap targets >= 48px: ' + short(small.slice(0, 5).join(' ; '), 300));
  check(a.tiny.length === 0, label + ': text >= 17px: ' + short(a.tiny.slice(0, 5).join(' ; '), 300));
  if (primary !== null) check(a.primary.length === primary, label + ': exactly ' + primary + ' emphasised primary button (saw ' + a.primary.length + ': ' + short(a.primary.join(' / '), 200) + ')');
  return a;
}
/** Press Tab until the focused element matches; every stop is checked for a visible focus ring and not hiding under the bar. */
async function tabUntil(page, { sel, text }, max = 400, log = []) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(RING);
    log.push(r);
    const hit = await page.evaluate(({ sel, text }) => { const e = document.activeElement; if (!e || e === document.body || e === document.documentElement) return false; if (sel && !(e.matches(sel) || e.closest(sel))) return false; if (text && !(e.innerText || '').includes(text) && !(e.getAttribute('aria-label') || '').includes(text)) return false; return true; }, { sel, text });
    if (hit) return true;
  }
  return false;
}

/* ───────────────────────── scenarios ───────────────────────── */
const scenarios = [];
const scenario = (id, name, fn, o = {}) => scenarios.push({ id, name, fn, viewports: o.viewports || [false, true] });

/* A: new event -> fill -> import CSV -> bouts -> save (incomplete date + half bout) -> close tab -> reopen */
scenario('A', 'new event, half-finished save, close, reopen', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-a-' + vp.tag;
  let page = await openPrivate(ctx, id);
  check((await stateOf(page)).includes('未保存'), 'fresh event: state line says 未保存 (' + short(await stateOf(page)) + ')');
  await page.locator('#field-title').fill('架空ジム交流大会');
  await page.locator('#field-date').fill('2027年10月');
  await page.locator('#field-date').blur();
  const dateShown = await val(page, '#field-date');
  check(dateShown === '2027年10月', 'an unfinished date typed by the user is not rewritten when the field loses focus (typed "2027年10月", now shows "' + dateShown + '")');
  check(await page.getByText('日にちまで入れてください').first().isVisible(), 'unfinished date shows guidance');
  await page.locator('#field-venue').fill('架空体育館');
  await importCsv(page, CSV6);
  await page.getByText('6人分を読み込みました').first().waitFor();
  check((await page.locator('#sec-2').innerText()).includes('6人 入っています'), 'roster shows 6 people');
  await addBout(page, 'F01', 'F02');
  await addBout(page, 'F03', '');
  check(await page.getByText('未完成').first().isVisible(), 'half-finished bout is marked 未完成');
  check((await stateOf(page)).includes('未保存') && (await page.title()).startsWith('●'), 'after editing: 未保存 and tab title has the dot');
  await save(page);
  check(!(await stateOf(page)).includes('未保存'), 'after save: state line is 保存済み only');
  check((await notices(page)).includes('保存しました'), 'save shows a visible success notice');
  check(!(await page.title()).startsWith('●'), 'after save: tab title has no dot');
  const stored = await idbGet(page, id);
  check(stored && isLocalTournament(stored), 'stored record is valid');
  check(stored.fighters.length === 6 && stored.bouts.length === 2 && stored.bouts[1].redId === 'F03' && stored.bouts[1].blueId === '', 'half-finished bout and roster were saved as they were');
  check(stored.title === '架空ジム交流大会' && stored.venue === '架空体育館' && stored.date === dateShown, 'incomplete date saved as shown ("' + stored.date + '")');
  await audit(page, 'A saved ' + vp.name);
  await page.close();
  page = await openPrivate(ctx, id);
  await waitState(page, '保存済み');
  check(await val(page, '#field-title') === '架空ジム交流大会' && await val(page, '#field-venue') === '架空体育館' && await val(page, '#field-date') === dateShown, 'reopen: title, venue and (incomplete) date come back');
  check((await page.locator('#sec-2').innerText()).includes('6人 入っています') && (await boutCount(page)) === 2, 'reopen: 6 fighters and 2 bouts come back');
  const bv = await boutValues(page);
  check(bv[0][0] === 'F01' && bv[0][1] === 'F02' && bv[1][0] === 'F03' && bv[1][1] === '', 'reopen: bout picks (including the half-finished one) come back');
  check((await page.locator('main').innerText()).includes('いま開いている大会：架空ジム交流大会'), 'reopen: top line names the event');
  check(!(await page.title()).startsWith('●') && (await stateOf(page)).includes('保存済み'), 'reopen: shows 保存済み, no dot');
  check((await page.locator('nav[aria-label="4つの手順"] [aria-current="step"]').count()) === 1, 'reopen: exactly one 現在地 marker in the step bar');
  check((await page.locator('main').innerText()).includes('次にすること'), 'reopen: shows 次にすること');
  await ctx.close();
});

/* A2: close the whole browser (not just the tab) and start it again with the same profile */
scenario('A2', 'browser restart keeps the saved work', async (vp) => {
  const dir = await mkdtemp(join(process.env.TOS_TMP_DIR || tmpdir(), 'tos-res-'));
  const opts = { headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }), viewport: vp.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: vp.mobile, hasTouch: vp.mobile };
  let ctx;
  try { ctx = await chromium.launchPersistentContext(dir, opts); } catch (e) { skipped.push('A2 browser restart (persistent profile could not start: ' + short(e.message, 100) + ')'); await rm(dir, { recursive: true, force: true }); return; }
  await wire(ctx);
  const id = 'res-a2-' + vp.tag;
  let page = await ctx.newPage();
  await page.goto(base + '/private/?event=' + id);
  await page.locator('#field-title').waitFor();
  await page.locator('#field-title').fill('再起動テスト大会');
  await importCsv(page, CSV6);
  await page.getByText('6人分を読み込みました').first().waitFor();
  await addBout(page, 'F01', 'F02');
  await save(page);
  await ctx.close();
  ctx = await chromium.launchPersistentContext(dir, opts);
  await wire(ctx);
  page = await ctx.newPage();
  await page.goto(base + '/private/?event=' + id);
  await page.locator('#field-title').waitFor();
  await waitState(page, '保存済み');
  check(await val(page, '#field-title') === '再起動テスト大会' && (await page.locator('#sec-2').innerText()).includes('6人 入っています') && (await boutCount(page)) === 1, 'after a full browser restart, title, roster and bout are back');
  await ctx.close();
  await rm(dir, { recursive: true, force: true });
});

/* B: the four save states, forced IndexedDB failures, retry */
scenario('B', 'four save states and forced storage failures', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-b-' + vp.tag;
  const page = await openPrivate(ctx, id);
  await page.evaluate(() => { window.__states = new Set(); const rec = () => { const t = document.querySelector('#save-state')?.innerText; if (t) window.__states.add(t.split('（')[0].replace(/\d\d:\d\d/, '').trim()); }; rec(); new MutationObserver(rec).observe(document.body, { subtree: true, childList: true, characterData: true }); });
  // the state line must always be on screen (fixed bar), at top and bottom of the page
  const inView = () => page.evaluate(() => { const r = document.querySelector('#save-state').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0; });
  check(await inView(), 'state line visible at the top of the page');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  check(await inView(), 'state line visible at the bottom of the page');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#field-title').fill('保存テスト');
  check((await stateOf(page)).includes('未保存'), '未保存 shown after typing');
  // 保存中 with a double click
  await page.evaluate(() => { window.__puts = 0; const p = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { window.__puts++; return p.apply(this, a); }; });
  await slowOpen(page, 1200);
  await saveBtn(page).dblclick();
  await waitState(page, '保存中', 3000).catch(() => {});
  const mid = await stateOf(page);
  check(mid.includes('保存中') && !mid.includes('保存済み'), '保存中 shown while the write is slow (' + short(mid) + ')');
  const barBtn = page.locator('div.fixed.bottom-0 .flex.items-stretch > button').first();
  check((await barBtn.getAttribute('aria-disabled')) === 'true' && (await barBtn.innerText()).includes('保存中'), 'while saving, the main button says 保存中 and is disabled');
  await page.locator('#field-title').click();
  await page.keyboard.press('End');
  await page.keyboard.type('追記');
  await waitState(page, '未保存', 6000).catch(() => {});
  await settle(1500);
  const after = await stateOf(page);
  check(after.includes('未保存') && !after.includes('保存済み'), 'text typed while saving is NOT reported as saved (' + short(after) + ')');
  check((await val(page, '#field-title')) === '保存テスト追記', 'text typed while saving stays on screen');
  check(!(await notices(page)).includes('保存しました'), 'no 保存しました notice for a save that was overtaken by typing');
  const stored1 = await idbGet(page, id);
  check(stored1 && stored1.title === '保存テスト', 'only the snapshot that was saved is stored, not the later typing');
  check((await page.evaluate(() => window.__puts)) === 1, 'double click on save wrote once (writes: ' + (await page.evaluate(() => window.__puts)) + ')');
  await unslow(page);
  await save(page);
  check((await idbGet(page, id)).title === '保存テスト追記', 'second save stores the typed text');
  check(/保存済み \d\d:\d\d/.test(await stateOf(page)), '保存済み shows the clock time');
  await page.locator('#field-title').fill('保存テスト2');
  check((await stateOf(page)).includes('未保存') && !(await notices(page)).includes('保存しました'), 'editing after a save: 未保存 and the old success notice is gone');
  // forced failures: never 保存済み, input kept, recover by retry
  for (const kind of ['tx', 'quota', 'put', 'open']) {
    const typed = '失敗テスト-' + kind;
    const before = await idbGet(page, id);
    await failWrites(page, kind);
    await page.locator('#field-title').fill(typed);
    await saveBtn(page).click();
    await waitState(page, '保存失敗', 6000).catch(() => {});
    const st = await stateOf(page), top = await page.locator('main > div > div').first().innerText();
    check(st.includes('保存失敗') && !st.includes('保存済み') && !top.includes('保存済み'), kind + ': failure shows 保存失敗, never 保存済み (' + short(st) + ' | top: ' + short(top, 80) + ')');
    const nn = await notices(page);
    check(nn.includes('保存できませんでした') && !nn.includes('保存しました'), kind + ': error notice says what happened and no success notice (' + short(nn, 120) + ')');
    if (kind === 'quota') check(nn.includes('空き'), 'quota failure says the disk is full');
    check((await val(page, '#field-title')) === typed, kind + ': typed input stays on screen');
    if (kind !== 'open') check(JSON.stringify(await idbGet(page, id)) === JSON.stringify(before), kind + ': stored data untouched by the failed save');
    check((await barBtn.innerText()).includes('もう一度 保存する'), kind + ': main button tells what to press next (もう一度 保存する)');
    check((await page.title()).startsWith('●') && (await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })), kind + ': unsaved work still guarded against closing the tab');
    if (kind === 'tx') {
      await settle(1700); // a person does not press twice within 1.5s
      await saveBtn(page).click();
      await waitNotice(page, 'コピーのファイルに入れておくと', 4000).catch(() => {});
      check(await page.getByRole('button', { name: 'コピーのファイルを作る', exact: true }).count() > 0, 'second failure offers the backup-file way out');
    }
    await healWrites(page);
    await settle(1700);
    if (kind === 'open') check(JSON.stringify(await idbGet(page, id)) === JSON.stringify(before), kind + ': stored data untouched by the failed save');
    await save(page);
    check((await stateOf(page)).includes('保存済み') && (await idbGet(page, id)).title === typed, kind + ': retry after recovery saves the typed text');
    check(!(await notices(page)).includes('保存できませんでした'), kind + ': failure notice is cleared after a good save');
  }
  // a retry pressed soon after an earlier good save must still work while 保存失敗 is shown
  await settle(1700);
  await page.locator('#field-title').fill('近い再試行-1'); await save(page);
  await failWrites(page, 'tx');
  await page.locator('#field-title').fill('近い再試行-2'); await saveBtn(page).click(); await waitState(page, '保存失敗', 5000);
  await healWrites(page);
  await settle(500);
  await saveBtn(page).click(); await settle(1200);
  check((await stateOf(page)).includes('保存済み') && (await idbGet(page, id)).title === '近い再試行-2', 'pressing もう一度 保存する within 1.5s of an earlier good save is not silently ignored (' + short(await stateOf(page)) + ')');
  // save, fix one letter at once, press the main bottom button again: a person does this. The state line says 未保存, so the press must save.
  // (Needs a finished event: only then is 保存する the main bottom button; before that the main button asks for the next missing item.)
  {
    const q = await seedAndOpen(ctx, seed(id + '-quick'));
    const bar = q.locator('div.fixed.bottom-0 .flex.items-stretch > button').first();
    await q.locator('#field-title').fill('すぐ直す-1');
    check((await bar.innerText()).includes('保存する'), 'finished event with a change: the main bottom button is 保存する (' + short(await bar.innerText()) + ')');
    await bar.click(); await waitState(q, '保存済み', 4000).catch(() => {});
    await q.locator('#field-title').fill('すぐ直す-2');
    check((await stateOf(q)).includes('未保存'), 'quick edit right after a save: state line says 未保存');
    await settle(300);
    await bar.click(); await settle(1500);
    check((await stateOf(q)).includes('保存済み') && (await idbGet(q, id + '-quick')).title === 'すぐ直す-2', 'main button pressed <1.5s after a good save, with new text typed, saves it instead of doing nothing (state: ' + short(await stateOf(q)) + ', stored: ' + (await idbGet(q, id + '-quick')).title + ')');
    await q.close();
  }
  const seen = await page.evaluate(() => [...window.__states]);
  for (const w of ['未保存', '保存中', '保存済み', '保存失敗']) check(seen.some((s) => s.includes(w)), 'state line showed ' + w + ' at some point (saw ' + short(seen.join(' / '), 200) + ')');
  // first-ever save failing
  const p2 = await openPrivate(ctx, id + '-first');
  await failWrites(p2, 'tx');
  await p2.locator('#field-title').fill('初めての保存');
  await saveBtn(p2).click();
  await waitState(p2, '保存失敗', 6000).catch(() => {});
  check((await stateOf(p2)).includes('保存失敗') && !(await stateOf(p2)).includes('保存済み') && (await val(p2, '#field-title')) === '初めての保存', 'first-ever save failing: 保存失敗, input kept');
  await healWrites(p2);
  await save(p2);
  check((await idbGet(p2, id + '-first'))?.title === '初めての保存', 'first-ever save works on retry');
  await ctx.close();
});

/* B2: the browser store cannot even be read (private window / blocked data) */
scenario('B2', 'storage unreadable at load', async (vp) => {
  const ctx = await newCtx(vp.mobile);
  const page = await ctx.newPage();
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } }); });
  await page.goto(base + '/private/?event=res-b2');
  await page.getByRole('heading', { name: '保存してあるデータを、読めませんでした' }).waitFor({ timeout: 15000 });
  check((await page.locator('#field-title').count()) === 0, 'when nothing can be saved, no input form is offered');
  check(await btn(page, 'もう一度読み込む').isVisible(), 'a retry button is shown');
  check((await page.locator('main').innerText()).includes('データは消していません'), 'tells that no data was deleted');
  await audit(page, 'load error ' + vp.name);
  await ctx.close();
});

/* C: offline / online */
scenario('C', 'offline then online', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-c-' + vp.tag;
  const page = await openPrivate(ctx, id);
  await page.locator('#field-title').fill('オフライン大会');
  await ctx.setOffline(true);
  await importCsv(page, CSV6);
  await page.getByText('6人分を読み込みました').first().waitFor();
  await save(page);
  check((await idbGet(page, id))?.title === 'オフライン大会', 'offline: save works and is stored');
  check(!(await notices(page)).includes('保存できませんでした'), 'offline: no false error');
  await setPasswords(page, 'offline-password-1');
  const dl = page.waitForEvent('download', { timeout: 15000 });
  await btn(page, 'パスワードをつけて、コピーを保存する').click();
  check(!!(await dl), 'offline: backup file can be created');
  await ctx.setOffline(false);
  await page.locator('#field-venue').fill('オンライン復帰後の会場');
  await save(page);
  await page.reload();
  await page.locator('#field-title').waitFor();
  check(await val(page, '#field-venue') === 'オンライン復帰後の会場' && await val(page, '#field-title') === 'オフライン大会', 'online again: reload shows everything');
  await ctx.close();
});

/* D: two tabs on the same event */
scenario('D', 'two-tab conflict', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-d-' + vp.tag;
  const A = await seedAndOpen(ctx, seed(id, { title: '共有大会', venue: '元の会場' }));
  const B = await openPrivate(ctx, id);
  // D3: B has no unsaved work -> follows A quietly
  await A.locator('#field-title').fill('A版の名前');
  await save(A);
  await B.waitForFunction(() => document.querySelector('#field-title').value === 'A版の名前', null, { timeout: 6000 }).catch(() => {});
  check(await val(B, '#field-title') === 'A版の名前', 'idle second tab follows the other tab');
  check(!(await B.locator('#conflict-box').count()), 'idle second tab raises no conflict');
  // D1: B has unsaved work, A saves again
  await B.locator('#field-venue').fill('架空B会場');
  await A.locator('#field-title').fill('A版その2');
  await save(A);
  await B.locator('#conflict-box').waitFor({ timeout: 6000 }).catch(() => {});
  check(await B.locator('#conflict-box').count() === 1, 'B with unsaved work is told about the other tab');
  check((await stateOf(B)).includes('保存できません'), 'B state line says it cannot save (' + short(await stateOf(B)) + ')');
  await audit(B, 'conflict ' + vp.name);
  await btn(B, 'ここまでを保存する').click();
  await settle(700);
  check((await idbGet(B, id)).title === 'A版その2', 'B pressing save does NOT overwrite A (stored title: ' + (await idbGet(B, id)).title + ')');
  check(await val(B, '#field-venue') === '架空B会場', 'B keeps what was typed');
  check(!(await stateOf(B)).includes('保存済み'), 'B never claims 保存済み during a conflict');
  B.__dlg.log.length = 0;
  await B.getByRole('button', { name: /別の画面の内容を使う/ }).click();
  await askBox(B).waitFor({ timeout: 5000 }).catch(() => {});
  check(await askBox(B).count() === 1 && (await askBox(B).innerText()).includes('消えて'), 'taking the other tab asks first (in the page) and says what disappears');
  check(await boxNextTo(B, '#confirm-other', '#use-other-trigger') && await focusIsSafe(B), 'that box sits next to the button, and focus is on the safe button');
  check(await val(B, '#field-venue') === '架空B会場', 'opening the box changes nothing yet');
  await B.keyboard.press('Escape');
  await settle(300);
  check(await askBox(B).count() === 0 && await val(B, '#field-venue') === '架空B会場' && await B.locator('#conflict-box').count() === 1 && (await notices(B)).includes('やめました。何も変えていません。'), 'Escape on that question changes nothing');
  await B.getByRole('button', { name: /別の画面の内容を使う/ }).click();
  await askBox(B).waitFor({ timeout: 5000 });
  await boxPress(B, SAFE_NO);
  await settle(300);
  check(await askBox(B).count() === 0 && await val(B, '#field-venue') === '架空B会場' && await B.locator('#conflict-box').count() === 1, 'pressing やめる on that question changes nothing');
  await B.getByRole('button', { name: /別の画面の内容を使う/ }).click();
  await askBox(B).waitFor({ timeout: 5000 });
  await boxPress(B, /^別の画面の内容にする/);
  await B.waitForFunction(() => !document.querySelector('#conflict-box'), null, { timeout: 5000 }).catch(() => {});
  check(await val(B, '#field-title') === 'A版その2' && await val(B, '#field-venue') === '元の会場' && (await stateOf(B)).includes('保存済み'), 'accepting adopts the other tab and shows 保存済み');
  check(B.__dlg.log.length === 0, 'no native browser dialog was used for the other-tab question');
  // D2: a tab that never hears the broadcast must still not overwrite
  const C = await ctx.newPage();
  await C.addInitScript(() => { delete window.BroadcastChannel; });
  await C.goto(base + '/private/?event=' + id); await C.locator('#field-title').waitFor();
  await C.locator('#field-title').fill('C版');
  await A.locator('#field-venue').fill('A会場3');
  await save(A);
  await btn(C, 'ここまでを保存する').click();
  await settle(900);
  const st = await idbGet(C, id);
  check(st.venue === 'A会場3' && st.title !== 'C版', 'stale tab (no broadcast) cannot silently overwrite (stored: ' + st.title + ' / ' + st.venue + ')');
  check(await val(C, '#field-title') === 'C版', 'stale tab keeps its typed text');
  check(!(await stateOf(C)).includes('保存済み') && (await notices(C) + (await C.locator('#conflict-box').count())).length > 0, 'stale tab does not claim 保存済み and explains');
  const keep = C.getByRole('button', { name: /いまの入力を残す/ });
  if (await keep.count()) { await keep.click(); await settle(400); await save(C); check((await idbGet(C, id)).title === 'C版', 'after choosing いまの入力を残す, saving stores C (explicit choice)'); }
  else check(false, 'stale tab offers いまの入力を残す');
  // D4: match-day screen moves the current bout while the admin has unsaved typing
  const id2 = id + '-live';
  const ad = await seedAndOpen(ctx, seed(id2, {}));
  await ad.locator('#field-venue').fill('試合中に直した会場');
  const live = await ctx.newPage();
  await live.goto(base + '/private/live/?event=' + id2);
  await live.getByRole('button', { name: '次の試合 →', exact: true }).click();
  await live.waitForFunction(() => document.querySelector('header')?.textContent.includes('第2試合'), null, { timeout: 6000 });
  await settle(500);
  check(await ad.locator('#conflict-box').count() === 0, 'match-day progress is not reported as a conflict');
  await save(ad);
  const fin = await idbGet(ad, id2);
  check(fin.venue === '試合中に直した会場' && fin.currentBout === 1, 'saving from the admin keeps the live screen on bout 2 (currentBout ' + fin.currentBout + ')');
  await ctx.close();
});

/* E: rapid clicks */
scenario('E', 'rapid clicks create no duplicates', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-e-' + vp.tag;
  const page = await seedAndOpen(ctx, seed(id, { fighters: 8, bouts: [], photos: false }));
  const add = btn(page, '＋ 試合を追加');
  await add.dblclick(); await settle(300);
  check((await boutCount(page)) === 1, 'double click on 試合を追加 makes one bout (' + await boutCount(page) + ')');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '＋ 試合を追加'); b.click(); b.click(); b.click(); });
  await settle(300);
  check((await boutCount(page)) === 1, 'three instant clicks on 試合を追加 still one bout (' + await boutCount(page) + ')');
  await page.locator('#bout-0-red').selectOption('F01'); await page.locator('#bout-0-blue').selectOption('F02');
  await add.dblclick(); await settle(300);
  check((await boutCount(page)) === 2, 'after filling bout 1, double click adds exactly one more (' + await boutCount(page) + ')');
  await page.locator('#bout-1-red').selectOption('F03'); await page.locator('#bout-1-blue').selectOption('F04');
  const sug = page.getByRole('button', { name: 'おすすめの組み合わせを自動で作る' });
  check(await sug.count() === 1, 'auto-suggest is offered when 4 fighters are left');
  await sug.dblclick(); await settle(400);
  const bv = await boutValues(page), ids = bv.flat().filter(Boolean);
  check(bv.length === 4 && new Set(ids).size === ids.length, 'double click on auto-suggest: 4 bouts, nobody placed twice (bouts ' + bv.length + ', placed ' + ids.length + ', distinct ' + new Set(ids).size + ')');
  const x = page.locator('#bout-0 button', { hasText: '消す' });
  await x.dblclick(); await settle(300);
  check((await boutCount(page)) === 3, 'double click on 消す removes one bout only (' + await boutCount(page) + ')');
  // save
  await page.evaluate(() => { window.__puts = 0; const p = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { window.__puts++; return p.apply(this, a); }; });
  const sbtn = btn(page, 'ここまでを保存する');
  await sbtn.dblclick(); await settle(900);
  check((await idbKeys(page)).filter((k) => k === id).length === 1 && (await page.evaluate(() => window.__puts)) <= 2, 'double click on save: one record, at most two writes (' + await page.evaluate(() => window.__puts) + ')');
  check((await stateOf(page)).includes('保存済み') && await page.locator('#conflict-box').count() === 0, 'double click on save ends in 保存済み, no false conflict (' + short(await stateOf(page)) + ')');
  check((await boutCount(page)) === 3 && (await idbGet(page, id)).bouts.length === 3, 'bouts intact after the double save');
  // manual add
  await page.locator('summary', { hasText: 'ほかの入れ方' }).click();
  await page.locator('summary', { hasText: '1人ずつ入れる' }).click();
  for (const [f, v] of [['name', '架空追加選手'], ['gym', '架空追加ジム'], ['height', '170'], ['weight', '65'], ['record', '初試合']]) await page.locator('#manual-' + f).fill(v);
  await page.getByRole('button', { name: 'この選手を追加', exact: true }).dblclick(); await settle(300);
  check((await page.locator('#sec-2').innerText()).includes('9人 入っています'), 'double click on この選手を追加 adds one person (8 -> 9)');
  // two imports at the same time
  await Promise.all([importCsv(page, CSV8), importCsv(page, CSV8)]);
  await page.getByText('8人分を読み込みました').first().waitFor();
  await settle(500);
  check((await page.locator('#sec-2').innerText()).includes('9人 入っています'), 'two simultaneous imports of the same file add nobody (still 9)');
  // open match-day screen twice
  await saveBtn(page).click().catch(() => {}); await waitState(page, '保存済み', 5000).catch(() => {});
  await page.waitForTimeout(1700);
  const pages0 = ctx.pages().length;
  const openBtn = btn(page, '試合当日の画面を開く');
  if (await openBtn.count() >= 1) { await openBtn.last().dblclick(); await settle(1200); check(ctx.pages().length - pages0 <= 1, 'double click on 試合当日の画面を開く opens one screen (' + (ctx.pages().length - pages0) + ')'); }
  // backup button twice
  await setPasswords(page, 'rapid-click-pass-1');
  let downloads = 0; page.on('download', () => { downloads++; });
  await page.waitForTimeout(3100);
  await btn(page, 'パスワードをつけて、コピーを保存する').dblclick(); await settle(1500);
  check(downloads === 1, 'double click on the backup button gives one file (' + downloads + ')');
  await ctx.close();
});

/* F: reload / Back / Forward with unsaved work */
scenario('F', 'reload, Back and Forward with unsaved input', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-f-' + vp.tag;
  const page = await seedAndOpen(ctx, seed(id, { title: '保存ずみの名前' }));
  await page.goto(base + '/private/?event=' + id + '-x');
  await page.locator('#field-title').waitFor();
  // clean page: leaving is silent
  page.__dlg.log.length = 0; page.__dlg.mode = 'accept';
  await page.goto(base + '/private/?event=' + id); await page.locator('#field-title').waitFor();
  check(page.__dlg.log.length === 0, 'leaving a clean page asks nothing');
  // dirty page
  await page.locator('#field-venue').click(); await page.keyboard.type('未保存の会場');
  check(await val(page, '#field-venue') === '架空体育館未保存の会場', 'typed (focus check)');
  page.__dlg.mode = 'dismiss'; page.__dlg.log.length = 0;
  await page.reload({ timeout: 3000 }).catch(() => {});
  check(page.__dlg.log.some((d) => d.type === 'beforeunload'), 'reload with unsaved input warns first');
  check(await val(page, '#field-venue') === '架空体育館未保存の会場', 'staying on the page keeps the typed text');
  page.__dlg.log.length = 0;
  await page.goBack({ timeout: 3000 }).catch(() => {});
  check(page.__dlg.log.some((d) => d.type === 'beforeunload'), 'Back with unsaved input warns first');
  check(await val(page, '#field-venue') === '架空体育館未保存の会場', 'staying keeps the typed text after Back');
  page.__dlg.mode = 'accept';
  await page.goBack({ timeout: 8000 }).catch(() => {});
  await page.waitForLoadState().catch(() => {});
  page.__dlg.mode = 'dismiss'; page.__dlg.log.length = 0;
  await page.goForward({ timeout: 8000 }).catch(() => {});
  await page.locator('#field-title').waitFor({ timeout: 8000 }).catch(() => {});
  check(await val(page, '#field-title') === '保存ずみの名前' && await val(page, '#field-venue') === '架空体育館', 'after Back and Forward, the saved work is complete (the unsaved line was warned about)');
  // after saving there is no warning
  await page.locator('#field-venue').click(); await page.keyboard.type('保存する会場');
  await save(page);
  page.__dlg.log.length = 0;
  await page.reload({ timeout: 8000 }).catch(() => {});
  await page.locator('#field-title').waitFor();
  check(page.__dlg.log.length === 0 && await val(page, '#field-venue') === '架空体育館保存する会場', 'saved work reloads silently and intact');
  // import in progress is also guarded
  await ctx.close();
});

/* G: cancelling file choosers and confirmations */
scenario('G', 'cancelled choosers and confirms change nothing', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-g-' + vp.tag;
  const page = await seedAndOpen(ctx, seed(id, { title: 'いまのデータ' }));
  await page.locator('#field-venue').fill('未保存の会場');
  const before = JSON.stringify(await idbGet(page, id)), st0 = await stateOf(page);
  const fighters0 = (await page.locator('#sec-2').innerText());
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('label', { hasText: 'ファイルを選ぶ' }).first().click()]);
  await chooser.setFiles([]);
  await page.evaluate(() => { const i = document.querySelector('#pick-file'); i.dispatchEvent(new Event('change', { bubbles: true })); i.dispatchEvent(new Event('cancel', { bubbles: true })); });
  await settle(500);
  check((await page.getByText('選んだファイル').count()) === 0 && (await page.locator('#sec-2').innerText()) === fighters0 && (await stateOf(page)) === st0, 'cancelled roster chooser: nothing imported, nothing changed');
  await setPasswords(page, 'cancel-test-pass-1');
  const [ch2] = await Promise.all([page.waitForEvent('filechooser'), page.locator('label', { hasText: 'コピーのファイルから戻す' }).click()]);
  await ch2.setFiles([]);
  await page.evaluate(() => { const i = document.querySelector('input[accept=".enc"]'); i.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle(500);
  check(page.__dlg.log.length === 0 && (await val(page, '#field-venue')) === '未保存の会場' && JSON.stringify(await idbGet(page, id)) === before, 'cancelled restore chooser: no question, nothing changed');
  // restore question answered "no"
  const good = nodeBackup({ ...seed(id, { title: '戻したい大会', fighters: 2, bouts: [[0, 1]] }), updatedAt: Date.now() }, 'cancel-test-pass-1');
  page.__dlg.log.length = 0;
  await restoreInput(page).setInputFiles({ name: 'x.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.from(good) });
  await askBox(page).waitFor({ timeout: 6000 }).catch(() => {});
  check(await askBox(page).count() === 1, 'restore asks before overwriting (a box in the page)');
  check(await boxNextTo(page, '#confirm-restore', '#restore-file') && await focusIsSafe(page), 'the restore box sits next to the restore button and focus is on the safe button');
  const msg = await askBox(page).innerText().catch(() => '');
  check((msg.split('\n')[0] || '').includes('上書き') && msg.includes('戻したい大会') && /選手が4人から2人に減ります/.test(msg) && msg.includes('まだ保存していない変更'), 'the question says what is restored, what is lost and that unsaved changes exist: ' + short(msg, 200));
  check(await val(page, '#field-title') === 'いまのデータ' && (await val(page, '#field-venue')) === '未保存の会場' && JSON.stringify(await idbGet(page, id)) === before, 'opening the box alone: screen and stored data untouched');
  await boxPress(page, SAFE_NO);
  await settle(500);
  check(await askBox(page).count() === 0, 'answering no closes the box');
  check(await val(page, '#field-title') === 'いまのデータ' && (await val(page, '#field-venue')) === '未保存の会場' && JSON.stringify(await idbGet(page, id)) === before, 'answering no: screen and stored data untouched');
  check((await notices(page)).includes('やめました'), 'answering no: says やめました、何も変えていません');
  check((await stateOf(page)).includes('未保存'), 'answering no: still 未保存 (the draft is still a draft)');
  // overwrite question from re-import answered no
  await importCsv(page, csvOf([[...ROWS[0].slice(0, 6), '99', ...ROWS[0].slice(7)]]));
  await page.getByText('1人分を読み込みました').first().waitFor();
  const ov = page.getByRole('button', { name: /ファイルの内容で1人を書きかえる/ });
  check(await ov.count() === 1, 're-import with a changed person offers 書きかえる only as a button');
  check(!(await page.locator('#sec-2').innerText()).includes('99kg'), 're-import did not change the person before the button was pressed');
  page.__dlg.log.length = 0;
  await ov.click(); await askBox(page).waitFor({ timeout: 5000 }).catch(() => {});
  const ovText = await askBox(page).innerText().catch(() => '');
  check(ovText.includes('書きかえます') && ovText.includes('体重 60→99'), 'overwrite question names what changes (体重 60→99)');
  check(await boxNextTo(page, '#confirm-overwrite', '#overwrite-trigger') && await focusIsSafe(page), 'the overwrite box sits next to its button and focus is on the safe button');
  check(!(await page.locator('#sec-2').innerText()).includes('99kg'), 'the open box alone does not change the weight');
  await boxPress(page, SAFE_NO);
  await settle(300);
  check(await askBox(page).count() === 0 && !(await page.locator('#sec-2').innerText()).includes('99kg'), 'answering no keeps the old weight');
  check(page.__dlg.log.length === 0, 'no native browser dialog appeared for either question');
  await ctx.close();
});

/* H: importing the same roster again */
scenario('H', 'importing the same file twice, bad files', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-h-' + vp.tag;
  const page = await openPrivate(ctx, id);
  const count = async () => (await page.evaluate(() => document.querySelectorAll('#sec-2 article[id^="fighter-"]').length));
  await page.locator('#field-title').fill('再読み込み大会');
  await quiet(ctx, 'importing a roster', async () => { await importCsv(page, CSV6); await page.getByText('6人分を読み込みました').first().waitFor(); });
  check((await count()) === 6, 'first import: 6 people');
  await addBout(page, 'F01', 'F02');
  await save(page);
  const saved = JSON.stringify(await idbGet(page, id));
  await importCsv(page, CSV6);
  await page.getByText('すでにいる人は、全員そのままです').first().waitFor({ timeout: 6000 }).catch(() => {});
  check((await count()) === 6 && (await notices(page)).includes('全員そのままです'), 'same file again: still 6, says nobody changed');
  const changed = csvOf(ROWS.slice(0, 6).map((r) => r[0] === 'F02' ? [...r.slice(0, 6), '62', ...r.slice(7)] : r));
  await importCsv(page, changed);
  await page.getByText('内容がちがう人が1人います').first().waitFor({ timeout: 6000 }).catch(() => {});
  check((await count()) === 6 && (await page.locator('#fighter-F02').innerText()).includes('61.5kg'), 'changed file: still 6, existing person untouched until confirmed');
  check(JSON.stringify(await idbGet(page, id)) === saved, 're-import never changes the saved data (draft only)');
  await page.getByRole('button', { name: /ファイルの内容で1人を書きかえる/ }).click();
  await askBox(page).waitFor({ timeout: 5000 });
  await boxPress(page, /^ファイルの内容で書きかえる/);
  await settle(400);
  check((await count()) === 6 && (await page.locator('#fighter-F02').innerText()).includes('62kg'), 'after confirming: 6 people, weight updated');
  check((await boutValues(page))[0].join() === 'F01,F02', 'bout still points at the same people after the update');
  check((await stateOf(page)).includes('未保存') && JSON.stringify(await idbGet(page, id)) === saved, 'the update is a draft until saved');
  page.__dlg.mode = 'dismiss';
  // bad files
  const keep = await page.locator('#sec-2').innerText();
  const bad = [
    ['not a roster (.txt)', 'memo.txt', 'text/plain', 'hello', '今の名簿は変えていません|読み'],
    ['duplicate ids', 'dup.csv', 'text/csv', csvOf([ROWS[0], ROWS[0]]), '同じ(選手|管理番号)'],
    ['personal columns', 'private.csv', 'text/csv', CSV_HEAD + ',電話番号\nF01,a,b,小6,12,150,60,初,が,,09000000000', '読み込めません|入れません|電話'],
    ['empty csv', 'empty.csv', 'text/csv', CSV_HEAD + '\n', '選手がいません|空|1人も'],
    ['zip without list', 'x.zip', 'application/zip', Buffer.from(zipSync({ 'readme.txt': strToU8('x') })), 'players.csv|一覧|名簿'],
  ];
  for (const [label, name, type, body, re] of bad) {
    await importFile(page, name, type, body);
    await settle(700);
    const nn = await notices(page);
    check(new RegExp(re).test(nn) && !/人分を読み込みました/.test(nn.split('||').slice(-1)[0] || ''), label + ': refused with a plain Japanese reason (' + short(nn.split('||').slice(-2).join('|'), 140) + ')');
    check((await page.locator('#sec-2').innerText()).split('選んだファイル')[0] === keep.split('選んだファイル')[0] || (await count()) === 6, label + ': roster untouched');
  }
  // injection-looking names are plain text
  let dialogsSeen = 0; page.__dlg.log.length = 0;
  await importCsv(page, csvOf([['X01', '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '小6', '12', '150', '60', '初', '=HYPERLINK("x")', '']]), 'inj.csv');
  await page.getByText('1人分を読み込みました').first().waitFor();
  dialogsSeen = page.__dlg.log.length;
  check(dialogsSeen === 0 && (await page.locator('img[src="x"]').count()) === 0, 'names with markup are shown as text only');
  // photos arrive once per person even if the ZIP is read twice
  const jp = await jpegs(page, 2);
  const zip = Buffer.from(zipSync({ 'players.csv': strToU8(csvOf(ROWS.slice(0, 2))), 'photos/F01.jpg': jp[0], 'photos/F02.jpg': jp[1] }));
  await importFile(page, 'with-photos.zip', 'application/zip', zip);
  await page.getByText(/2人分を読み込みました/).first().waitFor();
  await importFile(page, 'with-photos.zip', 'application/zip', zip);
  await settle(800);
  check((await page.evaluate(() => document.querySelectorAll('#sec-2 article[id^="fighter-"] img').length)) === 2, 'ZIP twice: still two photos (no duplicates)');
  await ctx.close();
});

/* I: backup -> restore round trip in a fresh browser profile */
scenario('I', 'backup and restore round trip', async (vp) => {
  const ctxA = await newCtx(vp.mobile), id = 'res-i-' + vp.tag, pw = 'fictional-pass-1234';
  const A = await openPrivate(ctxA, id);
  await A.locator('#field-title').fill('引継ぎテスト大会');
  await A.locator('#field-date').fill('20271003'); await A.locator('#field-date').blur();
  await A.locator('#field-venue').fill('架空体育館');
  await A.locator('summary', { hasText: '選手に書いてもらうこと' }).click();
  await A.getByRole('button', { name: /^(✓ えらんだ：)?はい$/ }).click();
  await A.locator('#cfg-grade').selectOption('required');
  const jp = await jpegs(A, 3);
  const zip = Buffer.from(zipSync({ 'players.csv': strToU8(CSV6), 'photos/F01.jpg': jp[0], 'photos/F02.jpg': jp[1], 'photos/F03.jpg': jp[2] }));
  await importFile(A, 'roster.zip', 'application/zip', zip);
  await A.getByText('6人分を読み込みました').first().waitFor();
  await addBout(A, 'F01', 'F02'); await addBout(A, 'F03', '');
  await save(A);
  await A.locator('#sec-2 article[id^="fighter-"] img').first().waitFor();
  check((await A.locator('#sec-2').innerText()).includes('写真あり 3 / なし 3'), 'ZIP gave 3 photos');
  const orig = await idbGet(A, id);
  await setPasswords(A, pw, 'different-pass-9');
  check(await btn(A, 'パスワードをつけて、コピーを保存する').getAttribute('aria-disabled') === 'true' && (await A.locator('#backup').innerText()).includes('パスワードが同じではありません'), 'mistyped second password blocks the backup and says why');
  await A.locator('#backup-password2').fill(pw);
  let file;
  await quiet(ctxA, 'creating the backup file', async () => {
    const dl = A.waitForEvent('download');
    await btn(A, 'パスワードをつけて、コピーを保存する').click();
    const d = await dl;
    check(/\.tournament\.enc$/.test(d.suggestedFilename()) && d.suggestedFilename().includes(id), 'backup file name ends with .tournament.enc and has the event id (' + d.suggestedFilename() + ')');
    file = await readFile(await d.path(), 'utf8');
  });
  check((await notices(A)).includes('ファイルを保存しました'), 'backup shows a visible success sign');
  // "F01" is only 3 base64 letters: it appears by pure chance inside random ciphertext of a photo-sized file (flaky),
  // so test the text outside the ciphertext for it, and test the decoded ciphertext bytes for long, unambiguous strings.
  const envelope = JSON.parse(file), cipherBytes = Buffer.from(envelope.data, 'base64');
  check(!/架空|引継ぎ|F01|data:image/.test(file.replace(envelope.data, '')) && !/架空|引継ぎ|data:image/.test(file) && !['架空赤選手', '架空体育館', '引継ぎテスト大会', 'data:image', '"fighters"'].some((t) => cipherBytes.includes(Buffer.from(t))), 'backup file contains no readable names or photos');
  const plain = nodeOpen(file, pw);
  check(plain.title === orig.title && plain.fighters.length === 6 && plain.fighters.filter((f) => f.photoDataUrl).length === 3 && plain.bouts.length === 2 && plain.entryConfig?.music === true && plain.entryConfig?.grade === 'required', 'backup holds roster, photos, bouts and the entry settings');
  check(!JSON.stringify(plain).includes('script.google.com') && !/endpoint|setupKey/.test(JSON.stringify(plain)), 'backup holds no Google reception settings');
  // a brand-new profile = another PC
  const ctxB = await newCtx(vp.mobile);
  const B = await openPrivate(ctxB, id);
  check(await B.getByRole('button', { name: '別のパソコンへ移す／こわれたときのコピー' }).isVisible(), 'empty screen offers 別のパソコンへ移す／こわれたときのコピー');
  await B.getByRole('button', { name: '別のパソコンへ移す／こわれたときのコピー' }).click();
  check(await B.evaluate(() => document.activeElement?.id) === 'backup-password', 'that button moves focus to the password box');
  await B.locator('#backup-password').fill(pw);
  let emptyAsk = '';
  await quiet(ctxB, 'restoring a backup', async () => {
    await restoreInput(B).setInputFiles({ name: 'x.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.from(file) });
    await askBox(B).waitFor({ timeout: 8000 });
    emptyAsk = await askBox(B).innerText();
    await boxPress(B, '上書きして戻す');
    await waitNotice(B, '戻しました', 10000);
  });
  check(B.__dlg.log.length === 0 && emptyAsk.includes('空です'), 'restore on an empty screen still asks once (in the page) and says nothing is lost');
  const rest = await idbGet(B, id);
  const strip = (v) => JSON.stringify({ ...v, updatedAt: 0 });
  check(strip(rest) === strip(orig), 'restored record equals the original (roster, photos, bouts, settings)');
  check((await B.locator('#sec-2').innerText()).includes('写真あり 3 / なし 3') && (await boutCount(B)) === 2 && await val(B, '#field-title') === '引継ぎテスト大会', 'restored screen shows roster, photos and bouts');
  check((await stateOf(B)).includes('保存済み'), 'after restore the state line says 保存済み');
  await B.reload(); await B.locator('#field-title').waitFor();
  check(strip(await idbGet(B, id)) === strip(orig) && (await boutCount(B)) === 2, 'restored data survives a reload');
  await audit(B, 'after restore ' + vp.name);
  await ctxA.close(); await ctxB.close();
});

/* J: files that must be refused, then the right one works */
scenario('J', 'wrong password, corrupt, non-backup and other-event files', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-j-' + vp.tag, pw = 'correct-horse-9';
  const page = await seedAndOpen(ctx, seed(id, { title: 'いまのデータ' }));
  await page.locator('#field-venue').fill('未保存の会場');
  const before = JSON.stringify(await idbGet(page, id));
  const good = nodeBackup({ ...seed(id, { title: '戻したい大会', fighters: 2, bouts: [[0, 1]] }), updatedAt: Date.now() }, pw);
  const other = nodeBackup({ ...seed(id + '-other', { title: '別の大会' }), updatedAt: Date.now() }, pw);
  const flip = (text) => { const p = JSON.parse(text); const b = Buffer.from(p.data, 'base64'); b[5] ^= 0xff; p.data = b.toString('base64'); return JSON.stringify(p); };
  const wrongShape = nodeBackup({ hello: 'world' }, pw);
  const badCurrent = nodeBackup({ ...seed(id, { title: '壊れ' }), currentBout: 99 }, pw);
  const cases = [
    ['wrong password', good, 'wrong-password-1', /パスワードがちがいます/],
    ['corrupted ciphertext', flip(good), pw, /戻せませんでした/],
    ['truncated file', good.slice(0, Math.floor(good.length / 2)), pw, /コピーのファイル.*ではありません/],
    ['plain text file', 'これはただのメモです', pw, /ではありません/],
    ['other json', JSON.stringify({ format: 'something-else', salt: 'a', iv: 'b', data: 'c' }), pw, /ではありません/],
    ['zip renamed .enc', Buffer.from(zipSync({ 'players.csv': strToU8(CSV6) })), pw, /ではありません/],
    ['empty file', '', pw, /ではありません/],
    ['not a tournament inside', wrongShape, pw, /戻せませんでした/],
    ['invalid tournament inside', badCurrent, pw, /戻せませんでした/],
    ['backup of a different event', other, pw, /別の大会|用です/],
  ];
  await setPasswords(page, pw);
  const state0 = await stateOf(page);
  for (const [label, content, password, re] of cases) {
    await page.locator('#backup-password').fill(password);
    page.__dlg.log.length = 0;
    await restoreInput(page).setInputFiles({ name: 'bad.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });
    await settle(900);
    const area = await page.locator('#backup').innerText();
    if (process.env.TOS_DEBUG) console.log('  J-msg', label, '=>', short(area.split('\n').filter((l) => /戻せ|ではありません|用です/.test(l)).join(' / '), 200));
    check(re.test(area) && !area.includes('戻しました'), label + ': refused with a clear reason (' + short(area.split('\n').filter((l) => /戻せ|ではありません|用です/.test(l)).join(' / '), 150) + ')');
    check(page.__dlg.log.length === 0, label + ': no overwrite question (nothing to overwrite)');
    check((await val(page, '#field-title')) === 'いまのデータ' && (await val(page, '#field-venue')) === '未保存の会場' && JSON.stringify(await idbGet(page, id)) === before, label + ': screen, typed text and stored data untouched');
    check((await stateOf(page)) === state0, label + ': state line unchanged');
  }
  const switcher = page.getByRole('button', { name: 'この大会として開く', exact: true });
  check(await switcher.count() === 1 && (await page.locator('#backup').innerText()).includes('ブラウザが確認'), 'other-event refusal offers この大会として開く and warns about unsaved work');
  // password rules
  await page.locator('#backup-password').fill('short');
  let opened = true; await Promise.all([page.waitForEvent('filechooser', { timeout: 700 }).catch(() => { opened = false; }), page.locator('label', { hasText: 'コピーのファイルから戻す' }).click({ force: true })]);
  check(!opened, 'with a too-short password the restore chooser does not even open');
  await page.locator('#backup-password').fill('');
  await restoreInput(page).setInputFiles({ name: 'x.enc', mimeType: 'application/octet-stream', buffer: Buffer.from(good) });
  await settle(500);
  check((await page.locator('#backup').innerText()).includes('先に、パスワードを入れてください') && JSON.stringify(await idbGet(page, id)) === before, 'no password: asks for it, nothing changed');
  // retry with the right file; spaces around the password are forgiven
  await page.locator('#backup-password').fill('  ' + pw + '  ');
  page.__dlg.log.length = 0;
  let asks = 0;
  await quiet(ctx, 'restoring the right file', async () => {
    await restoreInput(page).setInputFiles({ name: 'good.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.from(good) });
    await askBox(page).waitFor({ timeout: 8000 }); asks = await askBox(page).count();
    await boxPress(page, '上書きして戻す');
    await waitNotice(page, '戻しました', 10000);
  });
  check(asks === 1 && page.__dlg.log.length === 0, 'the right file asks once (in the page) before overwriting');
  check(await val(page, '#field-title') === '戻したい大会' && (await idbGet(page, id)).title === '戻したい大会' && (await idbGet(page, id)).fighters.length === 2, 'retry with the right file restores (title, 2 fighters stored)');
  check((await stateOf(page)).includes('保存済み'), 'after restore: 保存済み');
  const undo = page.getByRole('button', { name: /元にもどす/ });
  if (await undo.count()) { await undo.click(); await settle(800); check((await idbGet(page, id)).title === 'いまのデータ', 'the restore can be undone while the page stays open'); }
  else check(false, 'restore offers 元にもどす');
  // leave for the other event
  await page.locator('#field-venue').fill('また未保存');
  page.__dlg.mode = 'accept'; // ここで出るのは、ブラウザの「ページを離れますか」だけ（保存していない変更があるため）
  await page.locator('#backup-password').fill(pw);
  await restoreInput(page).setInputFiles({ name: 'o.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.from(other) });
  await switcher.waitFor({ timeout: 5000 });
  await Promise.all([page.waitForURL(/event=res-j-.*-other/, { timeout: 8000 }).catch(() => {}), switcher.click()]);
  check(/event=res-j-.*-other/.test(page.url()), 'この大会として開く goes to the other event');
  await ctx.close();
});

/* N: new event, resuming without the URL */
scenario('N', 'new event from the chooser and resume without the URL', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-n-' + vp.tag;
  const page = await seedAndOpen(ctx, seed(id, { title: '前の大会', venue: '架空体育館', entryConfig: { music: true, grade: 'required', age: 'optional', comment: 'off' } }));
  const before = JSON.stringify(await idbGet(page, id));
  await page.locator('summary', { hasText: '大会をえらぶ' }).click();
  await page.getByText('いま開いている：前の大会').first().waitFor();
  await btn(page, '新しい大会をつくる（前回の設定を引き継ぐ）').click();
  await page.waitForURL(/event=taikai-/, { timeout: 8000 });
  await page.locator('#field-title').waitFor();
  const nid = new URL(page.url()).searchParams.get('event');
  check(await val(page, '#field-venue') === '架空体育館' && (await page.locator('#sec-2').innerText()).includes('まだ0人'), 'new event: venue carried over, roster and bouts empty');
  check((await notices(page)).includes('引き継ぎました') && (await stateOf(page)).includes('未保存'), 'new event: says what was carried over and that nothing is saved yet');
  check(JSON.stringify(await idbGet(page, id)) === before, 'making a new event never touches the old one');
  await page.locator('#field-title').fill('新しい大会'); await save(page);
  check((await idbGet(page, nid))?.entryConfig?.music === true, 'new event keeps the entry settings');
  // resume with no ?event= at all
  const p2 = await ctx.newPage();
  await p2.goto(base + '/private/'); await p2.locator('#field-title').waitFor();
  const link = p2.getByRole('link', { name: /続きから：前の大会/ });
  await link.waitFor({ timeout: 6000 }).catch(() => {});
  check(await link.count() === 1 && await p2.getByRole('link', { name: /続きから：新しい大会/ }).count() === 1, 'without the URL, the saved events are listed to continue from');
  await link.click();
  await p2.waitForURL(new RegExp('event=' + id)); await p2.locator('#field-title').waitFor();
  check(await val(p2, '#field-title') === '前の大会' && (await p2.locator('#sec-2').innerText()).includes('4人 入っています'), 'continuing from the list brings everything back');
  // failing save blocks leaving
  await failWrites(p2, 'tx');
  await p2.locator('#field-venue').fill('失敗前の会場');
  await p2.locator('summary', { hasText: '大会をえらぶ' }).click();
  await btn(p2, '新しい大会をつくる（前回の設定を引き継ぐ）').click();
  await settle(1200);
  check(p2.url().includes('event=' + id) && await val(p2, '#field-venue') === '失敗前の会場' && (await stateOf(p2)).includes('保存失敗'), 'if saving fails, 新しい大会をつくる stays put, keeps the text and says 保存失敗');
  await ctx.close();
});

/* P: drafts never reach what the match-day screen reads, and nothing touches the Google reception */
scenario('P', 'draft vs saved vs match-day screen vs Google setup', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-p-' + vp.tag;
  const page = await seedAndOpen(ctx, seed(id, { title: '保存ずみの大会名' }));
  const setupKey = 'tournament-setup-v3:' + id, setupVal = JSON.stringify({ step: 3, endpoint: ENDPOINT, ticks: [true, true, true, true] });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [setupKey, setupVal]);
  const live = await ctx.newPage();
  await live.goto(base + '/private/live/?event=' + id);
  await live.getByRole('heading', { name: '保存ずみの大会名' }).waitFor();
  await page.locator('#field-title').fill('まだ保存していない大会名');
  await importCsv(page, csvOf([[...ROWS[0].slice(0, 2), '架空赤選手', ...ROWS[0].slice(3, 6), '99', ...ROWS[0].slice(7)]]));
  await page.getByText('1人分を読み込みました').first().waitFor();
  await settle(700);
  check(await live.getByRole('heading', { name: '保存ずみの大会名' }).count() === 1, 'unsaved draft is not visible on the match-day screen');
  check((await idbGet(page, id)).title === '保存ずみの大会名' && (await idbGet(page, id)).fighters[0].weight === '60', 'unsaved draft and re-import are not in the saved data');
  await setPasswords(page, 'draft-password-1');
  const upd = (await idbGet(page, id)).updatedAt;
  const dl = page.waitForEvent('download'); await btn(page, 'パスワードをつけて、コピーを保存する').click(); await dl;
  check((await idbGet(page, id)).updatedAt === upd, 'creating a backup does not change the saved data');
  await save(page);
  await live.getByRole('heading', { name: 'まだ保存していない大会名' }).waitFor({ timeout: 6000 }).catch(() => {});
  check(await live.getByRole('heading', { name: 'まだ保存していない大会名' }).count() === 1, 'after 保存, the match-day screen shows the new title');
  const good = nodeBackup({ ...seed(id, { title: '戻した大会名', fighters: 2, bouts: [[0, 1]] }), updatedAt: Date.now() }, 'draft-password-1');
  await restoreInput(page).setInputFiles({ name: 'g.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.from(good) });
  await askBox(page).waitFor({ timeout: 8000 });
  await boxPress(page, '上書きして戻す');
  await waitNotice(page, '戻しました', 10000);
  await live.getByRole('heading', { name: '戻した大会名' }).waitFor({ timeout: 6000 }).catch(() => {});
  check(await live.getByRole('heading', { name: '戻した大会名' }).count() === 1, 'a confirmed restore reaches the match-day screen');
  check(await page.evaluate((k) => localStorage.getItem(k), setupKey) === setupVal, 'saving, importing and restoring never touch the Google reception record');
  // a half-finished bout on the match-day screen does not crash it
  const half = await seedAndOpen(ctx, seed(id + '-half', { bouts: [[0, null]] }));
  const l2 = await ctx.newPage(); await l2.goto(base + '/private/live/?event=' + id + '-half');
  await l2.getByText('選手未設定').first().waitFor({ timeout: 6000 }).catch(() => {});
  check(await l2.getByText('選手未設定').count() >= 1, 'a saved half-finished bout shows 選手未設定 on the match-day screen');
  await half.close();
  await ctx.close();
});

/* L: keyboard only */
scenario('L', 'keyboard-only main path with visible focus', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-l-' + vp.tag;
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=' + id); await page.locator('#field-title').waitFor();
  const log = [];
  const type = async (t) => { await page.keyboard.insertText(t); };
  check(await tabUntil(page, { sel: '#field-title' }, 60, log), 'Tab reaches the title field');
  await type('キーボード大会');
  check(await tabUntil(page, { sel: '#field-date' }, 10, log), 'Tab reaches the date field');
  await type('20271003');
  await page.keyboard.press('Tab'); log.push(await page.evaluate(RING));
  check(await val(page, '#field-date') === '2027年10月3日', 'date digits become a Japanese date by keyboard');
  check(await tabUntil(page, { sel: '#pick-file' }, 120, log), 'Tab reaches the roster file picker');
  await settle(400);
  // Enter should open the chooser. Headless Chromium sometimes drops a file chooser (a bare page does it too), so retry the same key, then try Space.
  let chooser = null, enterTries = 0, via = 'Enter';
  while (!chooser && enterTries < 3) { enterTries++; const cp = page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null); await page.keyboard.press('Enter'); chooser = await cp; }
  if (!chooser) { skipped.push(cur + ': Enter on the roster picker raised no file chooser in 3 tries (headless Chromium drops choosers intermittently, also on a bare page); Space was tried instead'); via = 'Space'; const cp = page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null); await page.keyboard.press(' '); chooser = await cp; }
  check(!!chooser, 'a key (' + via + ') on the focused picker opens the file chooser');
  if (!chooser) await page.locator('#pick-file').setInputFiles({ name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV6) });
  if (chooser) await chooser.setFiles({ name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV6) });
  await page.getByText('6人分を読み込みました').first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await tabUntil(page, { text: '＋ 試合を追加' }, 300, log), 'Tab reaches ＋ 試合を追加');
  await page.keyboard.press('Enter');
  await settle(500);
  check(await page.evaluate(() => document.activeElement?.id) === 'bout-0-red', 'after adding a bout, focus moves to the red picker');
  await page.keyboard.press('ArrowDown');
  check(await tabUntil(page, { sel: '#bout-0-blue' }, 10, log), 'Tab reaches the blue picker');
  await page.keyboard.press('ArrowDown');
  await settle(300);
  const bv = await boutValues(page);
  check(bv[0][0] && bv[0][1] && bv[0][0] !== bv[0][1], 'both corners chosen by keyboard (' + bv[0].join(',') + ')');
  check(await tabUntil(page, { sel: 'div.fixed.bottom-0 button', text: '保存' }, 400, log), 'Tab reaches the bottom 保存 button');
  await page.keyboard.press('Enter');
  await waitState(page, '保存済み', 8000).catch(() => {});
  check((await stateOf(page)).includes('保存済み'), 'the whole main path ends in 保存済み with the keyboard only');
  const st = await idbGet(page, id);
  check(st && st.title === 'キーボード大会' && st.date === '2027年10月3日' && st.fighters.length === 6 && st.bouts.length === 1, 'stored data is what was typed');
  const noRing = log.filter((r) => !r.ok), hid = log.filter((r) => r.hiddenByBar);
  check(noRing.length === 0, 'every Tab stop has a visible focus ring (' + log.length + ' stops; missing: ' + short(noRing.slice(0, 3).map((r) => r.what).join(' ; ')) + ')');
  check(hid.length === 0, 'no Tab stop is hidden under the bottom bar (' + short(hid.slice(0, 3).map((r) => r.what).join(' ; ')) + ')');
  // folds and the backup area by keyboard
  await page.evaluate(() => window.scrollTo(0, 0));
  const log2 = [];
  await page.evaluate(() => document.activeElement?.blur());
  check(await tabUntil(page, { text: 'コピーのファイルを作る・戻す' }, 400, log2), 'Tab reaches the backup fold');
  const foldState = () => page.evaluate(() => document.activeElement.tagName === 'SUMMARY' ? document.activeElement.parentElement.open : null);
  const wasOpen = await foldState();
  check(wasOpen !== null, 'focus is on the fold heading before pressing Enter');
  await page.keyboard.press('Enter'); await settle(300);
  check(await foldState() === !wasOpen, 'Enter on a fold heading toggles it and keeps the focus on the heading (was open=' + wasOpen + ')');
  const foldRing = await page.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e); return { ok: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2, what: e.tagName + '#' + e.id + ' ' + (e.innerText || '').replace(/\s+/g, ' ').slice(0, 30), outline: s.outlineStyle + ' ' + s.outlineWidth, fv: e.matches(':focus-visible') }; });
  await page.keyboard.press('Enter'); await settle(300);
  check(await foldState() === wasOpen, 'Enter again toggles it back');
  check(foldRing.ok, 'fold heading shows a focus ring (' + JSON.stringify(foldRing) + ')');
  await ctx.close();
});

/* M: layout, text size, tap size, names, one primary button, in many different states */
scenario('M', 'layout and readability in many states', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-m-' + vp.tag;
  const empty = await openPrivate(ctx, id + '-e');
  await audit(empty, 'empty ' + vp.name);
  const long = 'あ'.repeat(70) + 'LONGNAME' + 'x'.repeat(40);
  const v = seed(id, { title: long, venue: long, fighters: 8, bouts: [[0, 1], [2, null], [3, 4]], photos: false });
  v.fighters[0].name = long; v.fighters[1].gym = long; v.fighters[2].comment = long;
  const page = await seedAndOpen(ctx, v);
  await audit(page, 'long title/venue/names ' + vp.name);
  await page.locator('summary', { hasText: '大会をえらぶ' }).click();
  await settle(300);
  await audit(page, 'event list with the long title ' + vp.name);
  await page.close();
  // everything below uses a normal-length title, so one overflow problem does not hide the others (long fighter fields are kept)
  const v2 = seed(id + '-b', { title: '架空大会', venue: '架空会場', fighters: 8, bouts: [[0, 1], [2, null], [3, 4]], photos: false });
  v2.fighters[0].name = long; v2.fighters[1].gym = long; v2.fighters[2].comment = long;
  const page2 = await seedAndOpen(ctx, v2);
  await audit(page2, 'long fighter fields ' + vp.name);
  await page2.locator('summary', { hasText: '大会をえらぶ' }).click();
  await page2.locator('summary', { hasText: 'ほかの入れ方' }).click();
  await page2.locator('summary', { hasText: '1人ずつ入れる' }).click();
  await page2.getByRole('button', { name: 'この選手を追加', exact: true }).click();
  await settle(200);
  await audit(page2, 'manual-form errors ' + vp.name);
  await openBackup(page2);
  await page2.locator('#backup-password').fill('abc');
  await restoreInput(page2).setInputFiles({ name: 'longlonglonglonglonglonglonglonglonglonglonglonglonglonglonglong.tournament.enc', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await settle(400);
  await audit(page2, 'backup open + notice ' + vp.name);
  await importFile(page2, 'x'.repeat(120) + '.csv', 'text/csv', 'hello');
  await settle(500);
  await audit(page2, 'long file name error ' + vp.name);
  await page2.locator('#fighter-F01 button', { hasText: '直す' }).click();
  await audit(page2, 'editing a fighter ' + vp.name);
  await failWrites(page2, 'tx');
  await page2.locator('#field-title').fill('保存失敗の見た目');
  await saveBtn(page2).click(); await waitState(page2, '保存失敗', 5000).catch(() => {});
  await audit(page2, 'save failed ' + vp.name);
  // the page must stay usable at a narrow window with the soft keyboard (visual viewport shrink is simulated by a short window)
  await page2.setViewportSize({ width: vp.mobile ? 390 : 1280, height: 360 });
  await page2.locator('#field-venue').focus();
  const a = await page2.evaluate(AUDIT, page2.viewportSize().width);
  check(a.scrollW <= a.innerW, 'short window (soft keyboard): still no horizontal scroll');
  await ctx.close();
});

/* SH: short screens (phone turned sideways, browser zoomed 200%): the fixed bars must leave room for a question box */
scenario('SH', 'short screens: steps bar scrolls away, bottom bar is one line, a question box fits with its buttons', async (vp) => {
  const ctx = await newCtx(vp.mobile), id = 'res-sh-' + vp.tag;
  for (const [w, h] of [[844, 390], [640, 450], [667, 375]]) {
    const t = w + 'x' + h;
    const page = await seedAndOpen(ctx, seed(id + '-' + w, { title: '架空短い画面' }));
    await page.setViewportSize({ width: w, height: h });
    await importCsv(page, csvOf([[...ROWS[0].slice(0, 6), '99', ...ROWS[0].slice(7)]]));
    await page.getByText('1人分を読み込みました').first().waitFor();
    const ov = page.getByRole('button', { name: /ファイルの内容で1人を書きかえる/ });
    await ov.click(); await askBox(page).waitFor({ timeout: 5000 });
    await settle(300);
    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="4つの手順"]'), box = document.querySelector('#confirm-overwrite'), bar = document.querySelector('#save-state').closest('.fixed');
      const rb = box.getBoundingClientRect(), rbar = bar.getBoundingClientRect(), ns = getComputedStyle(nav);
      const buttons = [...box.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
      return { navPos: ns.position, barH: Math.round(rbar.height), barTop: Math.round(rbar.top), vh: innerHeight, boxTop: Math.round(rb.top), boxBottom: Math.round(rb.bottom), boxH: Math.round(rb.height), buttonsInside: buttons.every((b) => b.top >= 0 && b.bottom <= rbar.top + 1), sw: document.documentElement.scrollWidth, iw: innerWidth };
    });
    check(m.navPos === 'static', t + ': the 4-steps bar is not stuck to the top on a short screen (' + m.navPos + ')');
    check(m.barH <= 110, t + ': the bottom bar is compact on a short screen (' + m.barH + 'px of ' + m.vh + ')');
    check(m.boxTop >= 0 && m.boxBottom <= m.barTop + 1 && m.buttonsInside, t + ': the whole question box (question, both buttons, 「何も変わりません」) is visible at once above the bottom bar (box ' + m.boxTop + '-' + m.boxBottom + ', bar from ' + m.barTop + ')');
    check(m.sw <= m.iw, t + ': no horizontal scroll');
    await boxPress(page, SAFE_NO);
    await page.close();
  }
  await ctx.close();
}, { viewports: [false] });

/* SU: /private/setup/ */
scenario('SU', 'setup page: typed URL survives failures; layout', async (vp) => {
  const ctx = await newCtx(vp.mobile, { allowed: [ENDPOINT] }), id = 'res-su-' + vp.tag;
  const READY = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: false, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: '架空テスト大会', date: '2099-12-01', venue: '架空体育館', venueUrl: '', organizer: '架空主催', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
  let mode = 'abort', pings = 0;
  ctx.__ext = async (route) => {
    pings++;
    if (mode === 'abort') return route.abort();
    if (mode === 'html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>ログイン</title>' });
    if (mode === 'server-error') return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(READY) });
  };
  const page = await ctx.newPage();
  await page.goto(base + '/private/setup/?event=' + id);
  await page.getByText('いまここ 1 / 3').first().waitFor();
  await audit(page, 'setup step 1 ' + vp.name);
  await page.getByRole('button', { name: /「準備できました」と出た/ }).click();
  await page.getByText('いまここ 2 / 3').first().waitFor();
  const input = page.locator('#endpoint');
  const a2 = await audit(page, 'setup step 2 empty ' + vp.name, { primary: null });
  // Design rule: one emphasised button at a time. With no URL yet the only forward button (次へ進む) is shown greyed out, so none is emphasised.
  check(a2.primary.length === 1 || (a2.primary.length === 0 && await page.getByRole('button', { name: '次へ進む' }).getAttribute('aria-disabled') === 'true'), 'setup step 2 empty ' + vp.name + ': exactly one emphasised button, or none because the only forward button is greyed out (saw ' + a2.primary.length + ')');
  for (const m of ['abort', 'html', 'server-error']) {
    mode = m;
    await input.fill(''); await input.fill(ENDPOINT);
    await page.waitForTimeout(1200);
    check(await input.inputValue() === ENDPOINT, 'URL stays in the box after a failed check (' + m + ')');
    check(await page.locator('[role=alert]').filter({ hasText: /つながりませんでした|だれでも使える|形が違います/ }).count() >= 1, 'a failed check (' + m + ') explains what to do in words');
    check(await page.getByRole('button', { name: '次へ進む' }).getAttribute('aria-disabled') === 'true', 'failed check (' + m + ') does not unlock 次へ進む');
  }
  await page.reload(); await page.getByText('いまここ 2 / 3').first().waitFor();
  check(await page.locator('#endpoint').inputValue() === ENDPOINT, 'typed URL survives a reload');
  await ctx.setOffline(true);
  mode = 'abort'; // a request made while offline fails; it does not get an answer
  await page.getByRole('button', { name: 'もう一度確かめる' }).click();
  await page.waitForTimeout(800);
  check(await page.locator('#endpoint').inputValue() === ENDPOINT && await page.getByText('入れたURLは、そのまま残っています').count() >= 1, 'offline check: URL kept, tells it was kept');
  await ctx.setOffline(false);
  mode = 'ok';
  await page.getByRole('button', { name: 'もう一度確かめる' }).click();
  await page.getByText('次は、シートのメニュー「Tournament OS」→「② 受付を開始」を押してください。').first().waitFor({ timeout: 8000 });
  check(!(await page.getByRole('button', { name: '次へ進む' }).getAttribute('aria-disabled')), 'a good check unlocks 次へ進む');
  await audit(page, 'setup step 2 connected ' + vp.name);
  await page.getByRole('button', { name: '次へ進む' }).dblclick();
  await page.getByText(/いまここ [23] \/ 3/).first().waitFor();
  await settle(500);
  const onStep3 = await page.getByText('いまここ 3 / 3').count() === 1;
  check(onStep3, 'double click on 次へ進む lands on step 3 (the second click must not hit something else after the screen changes)');
  if (!onStep3) { await page.getByRole('button', { name: '次へ進む' }).click(); await page.getByText('いまここ 3 / 3').first().waitFor(); }
  await audit(page, 'setup step 3 ' + vp.name);
  {
    const c1 = await newCtx(vp.mobile, { allowed: [ENDPOINT] }); c1.__ext = ctx.__ext;
    const q = await c1.newPage();
    await q.goto(base + '/private/setup/?event=' + id + '-dbl'); await q.getByText('いまここ 1 / 3').first().waitFor();
    await q.getByRole('button', { name: /「準備できました」と出た/ }).dblclick();
    await settle(600);
    check(await q.getByText('いまここ 2 / 3').count() === 1, 'double click on the step-1 button lands on step 2, not back on step 1');
    await c1.close();
  }
  // Back / Forward keeps the typed URL
  await page.goto(base + '/private/?event=' + id); await page.locator('#field-title').waitFor();
  await page.goBack(); await page.getByText(/いまここ \d \/ 3/).first().waitFor();
  check(await page.getByText('いまここ 3 / 3').count() === 1, 'Back to the setup page resumes at the same step');
  await page.getByRole('button', { name: '← 前へ戻る' }).click();
  check(await page.locator('#endpoint').inputValue() === ENDPOINT, 'URL still there after going back a step');
  // typed URL stays when browser storage refuses to save
  const ctx2 = await newCtx(vp.mobile, { allowed: [ENDPOINT] });
  ctx2.__ext = ctx.__ext;
  const p2 = await ctx2.newPage();
  await p2.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
  await p2.goto(base + '/private/setup/?event=' + id + '-ls');
  await p2.getByText('いまここ 1 / 3').first().waitFor();
  check(await p2.getByText('この画面の進みぐあいを、覚えておけません').count() === 1, 'when storage is refused, the screen says progress cannot be remembered');
  await p2.getByRole('button', { name: /「準備できました」と出た/ }).click();
  await p2.locator('#endpoint').fill(ENDPOINT);
  await p2.waitForTimeout(900);
  check(await p2.locator('#endpoint').inputValue() === ENDPOINT, 'typed URL stays on screen when storage is refused');
  await ctx2.close();
  // keyboard path on the setup page
  const ctx3 = await newCtx(vp.mobile, { allowed: [ENDPOINT] });
  ctx3.__ext = ctx.__ext;
  const p3 = await ctx3.newPage();
  await p3.goto(base + '/private/setup/?event=' + id + '-kb'); await p3.getByText('いまここ 1 / 3').first().waitFor();
  const log = [];
  check(await tabUntil(p3, { text: '「準備できました」と出た' }, 80, log), 'Tab reaches the step-1 button');
  await p3.keyboard.press('Enter');
  await p3.getByText('いまここ 2 / 3').first().waitFor();
  // step 2 puts the cursor in the URL box by itself; step back once so Tab still has to reach it by keyboard
  const autoFocused = await p3.evaluate(() => document.activeElement && document.activeElement.id === 'endpoint');
  if (autoFocused) { log.push(await p3.evaluate(RING)); await p3.keyboard.press('Shift+Tab'); }
  check(await tabUntil(p3, { sel: '#endpoint' }, 80, log), 'Tab reaches the URL box' + (autoFocused ? ' (the cursor was already put there; went back one stop and Tab came back)' : ''));
  await p3.keyboard.insertText(ENDPOINT);
  await p3.getByText('次は、シートのメニュー「Tournament OS」→「② 受付を開始」を押してください。').first().waitFor({ timeout: 8000 });
  check(await tabUntil(p3, { text: '次へ進む' }, 80, log), 'Tab reaches 次へ進む');
  await p3.keyboard.press('Enter');
  await p3.getByText('いまここ 3 / 3').first().waitFor();
  check(log.every((r) => r.ok), 'setup page: every Tab stop shows a focus ring (' + short(log.filter((r) => !r.ok).map((r) => r.what).join(' ; ')) + ')');
  await ctx3.close();
  const allowedHits = net.filter((n) => n.scenario === 'SU' && !n.url.startsWith(base + '/'));
  check(allowedHits.every((n) => n.url.split('?')[0] === ENDPOINT && n.method === 'GET' && !n.body), 'the setup page only does GET pings to the pasted Google URL');
  await ctx.close();
});

/* ───────────────────────── runner ───────────────────────── */
for (const s of scenarios) {
  if (ONLY.length && !ONLY.includes(s.id)) continue;
  for (const mobile of s.viewports) {
    const vp = { mobile, name: mobile ? '390px' : '1280px', tag: mobile ? 'sp' : 'pc' };
    cur = s.id + '/' + vp.name;
    const t0 = Date.now(), f0 = failures.length;
    console.log('▶ ' + cur + ' ' + s.name);
    try { await s.fn(vp); } catch (e) { const at = (String(e.stack).match(/test-private-resilience\.mjs:(\d+)/) || [])[1]; failures.push('[' + cur + '] scenario stopped at line ' + at + ': ' + short(e.message, 1200)); console.log('  ABORT [' + cur + '] line ' + at + ': ' + short(e.message, 1200)); }
    console.log('  ' + (failures.length === f0 ? 'ok' : (failures.length - f0) + ' failure(s)') + ' (' + Math.round((Date.now() - t0) / 100) / 10 + 's)');
  }
}
cur = 'NET';
check(externals.length === 0, 'no request ever left 127.0.0.1 except the simulated Google ping (' + externals.length + ': ' + short(externals.slice(0, 3).map((e) => e.method + ' ' + e.url).join(', ')) + ')');
check(net.filter((n) => n.url.startsWith(base + '/') && n.method !== 'GET').length === 0, 'no POST/PUT/DELETE request to the page server at all');
check(net.filter((n) => /private\/\?|private\/$/.test(n.url) && n.body).length === 0, 'no request carried a body');
cur = 'ERR';
check(pageErrors.length === 0, 'no uncaught page error in any scenario (' + short(pageErrors.slice(0, 3).map((e) => e.scenario + ': ' + e.message).join(' | '), 300) + ')');
await browser.close();
console.log('\nSkipped: ' + (skipped.length ? skipped.join('; ') : 'none'));
console.log('Resilience checks: ' + (checks - failures.length) + ' passed, ' + failures.length + ' failed, ' + checks + ' total.');
if (failures.length) { console.log('\nFAILED:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
console.log('All resilience checks passed.');
