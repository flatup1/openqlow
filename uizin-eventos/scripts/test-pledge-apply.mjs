/**
 * Browser checks for the 誓約書 (pledge) card on the public apply page (/apply/):
 * the card sits after 連絡先 and only appears when the link carries pl=on; N required boxes (id f-pledgeN, the text exactly as in the link,
 * no numbers added); the guardian box comes and goes with the age; the gym-representative box (read-only gym name, name, mobile phone,
 * the permission tick, the consent tick) is asked of everyone (a gym name like 「無所属」 is refused in the gym field: people with no gym cannot take part); the review button is grey 🔒 with a reason
 * until every box is ticked; exactly one 👉 per state; the review rows; the POST keys exist only when they apply; on a live link that the
 * chairman has not confirmed (plc=off) the send is blocked (red ✕ + grey 🔒). With the setting OFF (no pl key) the page and its POST are the old ones.
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation, except the apply form's POST to the
 * (simulated) Google endpoint, which is answered locally. All sentences and people are fake (『テスト用の文です1』…). Drives the REAL built page (npm run build:private).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 5511 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_TEST_BASE=http://127.0.0.1:5511 TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-pledge-apply.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:5511), TOS_ONLY=A,B (scenario letters), TOS_CHROME_PATH.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { PLEDGE_POST_KEYS } from '../core/pledge.ts';
import { publicEntryHash } from '../core/publicEntry.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:5511';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const ENDPOINT = 'https://script.google.com/macros/s/TOS_PLEDGE_SIM/exec';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

/* ───────────────────────── bookkeeping ───────────────────────── */
let checks = 0, cur = '-';
const failures = [], net = [], externals = [], pageErrors = [], consoleLines = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 160) => String(s).replace(/\s+/g, ' ').slice(0, n);

/* ───────────────────────── links ───────────────────────── */
/** fake sentences: the app code and these tests carry no real pledge wording */
const ITEMS = ['テスト用の文です1', 'テスト用の文です2', 'テスト用の文です3', 'テスト用の文です4', 'テスト用の文です5'];
const PLEDGE = { items: ITEMS, guardian: 'テスト用の保護者の文です', gym: 'テスト用のジムの文です', mode: 'under18', gymMode: true, confirmed: true };
const HASH = '0123456789abcdef'.repeat(4);
const WEIGHTS = { enabled: true, divisions: [{ name: '一般男子', classes: ['60kg以下', '60kgをこえる'] }, { name: '花道男子', classes: ['無差別'] }] };
const baseCfg = { endpoint: ENDPOINT, eventId: 'pledge-apply', title: '架空テスト大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '架空連絡先 02-0000-0000', music: false, grade: 'off', age: 'required', comment: 'off', protocol: '3', mode: 'live' };
const hashFor = (over = {}, pledge = {}) => publicEntryHash({ ...baseCfg, pledge: { ...PLEDGE, ...pledge }, pledgeHash: HASH, ...over });
const plainHash = () => publicEntryHash(baseCfg);
/** the POST keys of the old form, in order (setting OFF must send exactly these) */
const OLD_KEYS = ['protocol', 'entryKey', 'mode', 'website', 'eventId', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'fighterClass', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'photoDataUrl'];
const GYM_NAME = '架空 責任者', GYM_PHONE = '09000000000';

/* ───────────────────────── browser helpers ───────────────────────── */
function attach(page) {
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('pageerror', (e) => { pageErrors.push({ scenario: cur, message: e.message }); });
  page.on('console', (m) => { consoleLines.push({ scenario: cur, text: m.text() }); });
}
async function newCtx(viewport) {
  const mobile = viewport.width < 800;
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  ctx.__posts = [];
  ctx.__postBodies = [];
  ctx.on('request', (r) => { if (/^https?:/.test(r.url())) net.push({ scenario: cur, url: r.url(), method: r.method() }); });
  ctx.on('page', attach);
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(base + '/')) return route.continue();
    if (url === ENDPOINT && req.method() === 'POST') {
      ctx.__postBodies.push(req.postData() || '');
      ctx.__posts.push(new URLSearchParams(req.postData() || ''));
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><h1>申し込みが完了しました</h1><p>TEST-RECEIPT-0001</p>' });
    }
    externals.push({ scenario: cur, url, method: req.method() });
    return route.abort();
  });
  return ctx;
}
async function openApply(ctx, hash, { wait = true } = {}) {
  const page = await ctx.newPage();
  await page.goto(base + '/apply/' + hash);
  if (wait) await page.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
  return page;
}
/** the ordinary part of the form: gym, name, height, weight, record, age, contact, photo and the privacy consent */
async function fillBase(page, { gym = '架空ジム', age = '15', consent = true } = {}) {
  const fields = [['ジム名 必須', gym], ['選手名 必須', '架空選手'], ['身長（cm）必須', '170'], ['体重（kg）必須', '65'], ['戦績 必須', '初出場'], ['連絡先のお名前 必須', '架空連絡先'], ['電話番号 必須', '09012345678'], ['メールアドレス 必須', 'test@example.com']];
  for (const [label, value] of fields) await page.getByLabel(label, { exact: true }).fill(value);
  if (age !== null) await page.getByLabel('年齢 必須', { exact: true }).fill(age);
  const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 120, 160); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
  await page.locator('input[type=file]').setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByAltText('選んだ写真').waitFor();
  if (consent) await page.locator('#f-consent').check();
  await settle(120);
}
const tick = (page, key) => page.locator('#f-' + key).check();
const ticked = (page, key) => page.locator('#f-' + key).isChecked();
/** 誓約書の項目の□は1つ（owner 2026-10-23）。✔で全部の項目に✔が入る */
async function tickItems(page) { await tick(page, 'pledge1'); }
async function fillGym(page, name = GYM_NAME, phone = GYM_PHONE) {
  await page.locator('#f-gymName').fill(name);
  await page.locator('#f-gymPhone').fill(phone);
}
/** everything the pledge card asks for (what is asked depends on the age and the gym name) */
async function fillPledge(page, { guardian = true, gym = true } = {}) {
  await tickItems(page);
  if (guardian && (await page.locator('#f-pledgeGuardian').count())) await tick(page, 'pledgeGuardian');
  if (gym && (await page.locator('#f-gymName').count())) { await fillGym(page); await tick(page, 'pledgeGym'); } // 許可の念押しも、同意の□といっしょ
  await settle(120);
}
const reviewBtn = (p) => p.getByRole('button', { name: '入力内容を確認する →', exact: true });
/** the locked review button is grey and says aria-disabled but is still pressable (a press shows the red ✕ and points at the box), so Playwright needs force */
const pressReview = (p) => reviewBtn(p).click({ force: true });
/** the text of an element, or '' when it is not there (never waits for a missing one) */
const textOf = async (p, selector) => ((await p.locator(selector).count()) ? p.locator(selector).first().innerText() : '');
const sendBtn = (p) => p.getByRole('button', { name: 'この内容で送信する', exact: true });
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const nextMarks = (p) => p.evaluate(() => [...document.querySelectorAll('[data-tos-next]')].map((e) => (e.querySelector('.tos-next-badge')?.textContent || '').replace(/\s+/g, ' ').trim()));
const cardCount = (p) => p.locator('#pledge-card').count();
const cardText = async (p) => ((await cardCount(p)) ? (await p.locator('#pledge-card').innerText()) : '');
const activeId = (p) => p.evaluate(() => (document.activeElement && document.activeElement.id) || '');
const counter = async (p) => { const m = (await bodyText(p)).match(/入力 (\d+)\/(\d+)/); return m ? [Number(m[1]), Number(m[2])] : [-1, -1]; };
const sideways = (p) => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
/** exactly one yellow 👉 marker, with the 👉 sign and the words (never colour only) */
async function oneMark(page, where) {
  const marks = await nextMarks(page);
  check(marks.length === 1 && marks[0].includes('次はここ'), where + ': exactly one 👉 次はここ marker (' + marks.length + ': ' + short(marks.join(' | '), 100) + ')');
  check(await page.evaluate(() => [...document.querySelectorAll('[data-tos-next] .tos-next-badge')].every((b) => b.textContent.includes('👉'))), where + ': the marker carries the 👉 sign');
  return marks[0] || '';
}
async function toReview(page) {
  await reviewBtn(page).click();
  await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor({ timeout: 8000 });
}
async function sendIt(page, ctx) {
  const before = ctx.__posts.length;
  await toReview(page);
  await sendBtn(page).click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  return ctx.__posts.length > before ? ctx.__posts[ctx.__posts.length - 1] : null;
}
/** the review button: is it the grey locked one, and what reason is printed under it? */
const reviewLock = (p) => p.evaluate(() => {
  const b = document.getElementById('f-submit');
  if (!b) return null;
  const box = b.parentElement;
  return { locked: b.classList.contains('tos-locked'), ariaDisabled: b.getAttribute('aria-disabled'), disabled: b.disabled, reason: (box.querySelector('.tos-locked-reason')?.textContent || '').replace(/\s+/g, ' ').trim(), height: Math.round(b.getBoundingClientRect().height) };
});
/** text pieces smaller than 17px and controls shorter than 48px, inside the pledge card */
const smallThings = (p) => p.evaluate(() => {
  const card = document.getElementById('pledge-card');
  if (!card) return { small: ['no card'], short: [] };
  const small = [], shortOnes = [];
  for (const el of card.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(getComputedStyle(el).fontSize) < 16.99) small.push((el.textContent || '').trim().slice(0, 16) + ' ' + getComputedStyle(el).fontSize);
    if (el.matches('input:not([type=hidden]),select,textarea,button') && (r.height < 47.99 || (el.type === 'checkbox' && r.width < 47.99))) shortOnes.push(el.id + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (el.matches('label') && el.querySelector('input[type=checkbox]') && r.height < 47.99) shortOnes.push('label ' + Math.round(r.height));
  }
  return { small, short: shortOnes };
});
const keysOf = (post) => (post ? [...post.keys()] : []);
const PLEDGE_KEYS_ALL = [...PLEDGE_POST_KEYS];
const pledgeKeysOf = (post) => keysOf(post).filter((k) => PLEDGE_KEYS_ALL.includes(k));

async function scenario(id, title, viewports, fn) {
  if (ONLY.length && !ONLY.includes(id)) return;
  for (const vp of viewports) {
    cur = id + '@' + vp.width;
    console.log('== ' + cur + ' ' + title);
    const before = failures.length, t0 = Date.now();
    try { await fn(vp); } catch (e) {
      failures.push('[' + cur + '] SCENARIO CRASHED: ' + short(e && e.message, 300));
      console.log('  FAIL [' + cur + '] SCENARIO CRASHED: ' + short(e && e.message, 300));
    }
    console.log('   ' + (failures.length - before) + ' failure(s), ' + (Date.now() - t0) + 'ms');
  }
}
const DESKTOP = { width: 1280, height: 900 }, PHONE = { width: 390, height: 844 }, SMALL = { width: 320, height: 568 };

/* ───────────────────────── A: the card, its place, its boxes, the words as given ───────────────────────── */
await scenario('A', 'the 誓約書 card shows after 連絡先 with one box per item, the words exactly as in the link', [DESKTOP, PHONE, SMALL], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  check((await cardCount(page)) === 1, 'A the card is there');
  const text = await cardText(page);
  check((await page.locator('#pledge-card h2').allInnerTexts()).join('|').replace(/\s+/g, '') === '＋誓約書', 'A the heading is 誓約書 (' + short(text, 40) + ')');
  check(text.includes('下の文を読んで、□に✔を入れてください。✔を入れないと、先へ進めません。'), 'A the one-line how-to is there');
  const order = await page.evaluate(() => {
    const contact = document.getElementById('contact-fields'), consent = document.getElementById('f-consent-box'), card = document.getElementById('pledge-card');
    const after = (a, b) => Boolean(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
    return { afterContact: after(contact, card), afterConsent: after(consent, card), cardIsLastSection: card === [...document.querySelectorAll('main fieldset > section')].filter((s) => s.offsetWidth > 0).pop() };
  });
  check(order.afterContact && order.afterConsent && order.cardIsLastSection, 'A the card is the last card, after 連絡先 and the privacy consent');
  // one checkbox per item, id f-pledgeN, with the item's text beside it, nothing added (no numbers, no bullets)
  const boxes = await page.evaluate(() => [...document.querySelectorAll('#pledge-card [id^="f-pledge"][type="checkbox"]')].map((e) => ({ id: e.id, label: (e.closest('label')?.innerText || '').replace(/\s+/g, ' ').trim(), checked: e.checked })));
  const itemBoxes = boxes.filter((b) => /^f-pledge\d+$/.test(b.id));
  // 項目の文は一覧で全部見せ、□は1つ（owner 2026-10-23「誓約書の5つの□を1つにまとめる」）
  check(JSON.stringify(itemBoxes.map((b) => b.id)) === JSON.stringify(['f-pledge1']), 'A one box for all items, id f-pledge1 (' + itemBoxes.map((b) => b.id).join(',') + ')');
  check(itemBoxes[0] && itemBoxes[0].label.startsWith('上の' + ITEMS.length + 'つに、すべて同意します'), 'A the box says 上の' + ITEMS.length + 'つに、すべて同意します (' + (itemBoxes[0] && itemBoxes[0].label) + ')');
  const listed = await page.locator('#pledge-items li').allInnerTexts();
  check(JSON.stringify(listed.map((t) => t.trim())) === JSON.stringify(ITEMS), 'A every item sentence is listed exactly as in the link, nothing added: ' + listed.join(' / '));
  check(itemBoxes.every((b) => !b.checked) && boxes.every((b) => !b.checked), 'A nothing is ticked at the start');
  check(!/(^|\s)[1-9１-９][.．)）、]\s*テスト用/.test(text) && !/[①②③④⑤]/.test(text), 'A no numbering is added to the sentences');
  // the guardian box (age 15 / empty age → shown) and the gym box
  check((await page.locator('#pledge-guardian-box').count()) === 1 && (await page.locator('#pledge-guardian-title').innerText()) === '保護者（連帯責任者）の同意', 'A the guardian box has the heading 保護者（連帯責任者）の同意');
  check((await page.locator('#pledge-guardian-text').innerText()) === PLEDGE.guardian, 'A the guardian sentence is shown exactly');
  check((await page.locator('#pledge-gym-title').innerText()) === '団体・ジム責任者の同意' && (await page.locator('#pledge-gym-text').innerText()) === PLEDGE.gym, 'A the gym box: heading 団体・ジム責任者の同意 and its sentence exactly');
  check(!(await page.locator('#pledge-card').innerText()).match(/印|署名|サイン|捺印/), 'A no seal or signature box');
  // keyboard: Tab reaches the boxes in order, Space ticks
  await page.locator('#f-pledge1').focus();
  await page.keyboard.press('Space');
  check(await ticked(page, 'pledge1'), 'A Space ticks the focused box');
  await page.keyboard.press('Space');
  check(!(await ticked(page, 'pledge1')), 'A Space again un-ticks it');
  await page.keyboard.press('Tab');
  check((await activeId(page)) === 'f-pledgeGuardian', 'A Tab goes to the next box, the guardian box (' + (await activeId(page)) + ')');
  // size rules
  const sz = await smallThings(page);
  check(sz.small.length === 0, 'A every text in the card is 17px or bigger (' + sz.small.slice(0, 3).join(' | ') + ')');
  check(sz.short.length === 0, 'A every checkbox, input and label in the card is 48px or bigger (' + sz.short.slice(0, 4).join(' | ') + ')');
  // the steps line and the consent note
  const steps = await page.locator('ol[aria-label="申し込みの流れ"]').innerText();
  check(steps.includes('連絡先と誓約書') && !/(^|\n)連絡先(\n|$)/.test(steps), 'A the second step says 連絡先と誓約書 (still four steps)');
  check((await page.locator('#f-consent-note').innerText()).includes('ジム責任者の名前・電話も、集めます。'), 'A the sentence about what is collected names the gym representative\'s name and phone');
  await page.locator('#privacy-fold summary').click();
  const fold = await page.locator('#privacy-fold').innerText();
  check(fold.includes('ジム責任者の名前・電話（誓約書があるとき）'), 'A the 使い道 screen lists the gym representative\'s name and phone (' + short(fold, 60) + ')');
  await ctx.close();
});

/* ───────────────────────── B: no pl key — the page, the steps and the POST are exactly the old ones ───────────────────────── */
await scenario('B', 'setting none: no card, no pledge key, the old steps, the old POST', [DESKTOP, PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, plainHash());
  check((await cardCount(page)) === 0 && !/誓約書/.test(await bodyText(page)), 'B no card and no 誓約書 on the page');
  check((await page.locator('[id^="f-pledge"],[id="f-gymName"],[id="f-gymPhone"],[id="f-gymPermission"]').count()) === 0, 'B no pledge field');
  const steps = await page.locator('ol[aria-label="申し込みの流れ"]').innerText();
  check(!steps.includes('誓約書') && /連絡先/.test(steps), 'B the second step is still just 連絡先');
  check(!(await page.locator('#f-consent-note').innerText()).includes('ジム責任者'), 'B the sentence about what is collected is the old one');
  await fillBase(page);
  const [filled, total] = await counter(page);
  check(filled === total && total > 0, 'B the counter is full without any pledge box (入力 ' + filled + '/' + total + ')');
  const done = await oneMark(page, 'B all filled');
  check(done.includes('確認のボタン'), 'B the marker is on the confirm button (' + done + ')');
  const lock = await reviewLock(page);
  check(lock && !lock.locked && lock.reason === '', 'B the review button is the normal one');
  const post = await sendIt(page, ctx);
  check(JSON.stringify(keysOf(post)) === JSON.stringify(OLD_KEYS), 'B the POST keys are exactly the old ones (' + short(keysOf(post).join(','), 220) + ')');
  check(pledgeKeysOf(post).length === 0, 'B no pledge key in the POST');
  await ctx.close();
  // an old link that has not got the end mark and no pl: same
  const ctx2 = await newCtx(vp);
  const old = await openApply(ctx2, plainHash().replace(/&end=1$/, ''));
  check((await cardCount(old)) === 0, 'B an old link (no end=1) shows no card');
  await ctx2.close();
});

/* ───────────────────────── C: the gate — one yellow 👉 per state, grey 🔒 with a reason until every box is ticked ───────────────────────── */
await scenario('C', 'the review button stays locked with a reason until every box is ticked; one 👉 at every step', [PHONE, DESKTOP, SMALL], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  const [, total0] = await counter(page);
  // the counter counts the boxes: 5 items + guardian + name + phone + permission + consent tick = 9 more
  await fillBase(page);
  const [filled1, total1] = await counter(page);
  check(total1 === total0 && total1 > filled1, 'C the total includes the pledge boxes from the start, before anything is typed (入力 ' + filled1 + '/' + total1 + ', at the start /' + total0 + ')');
  const base = await (async () => { const plain = await newCtx(vp); const p = await openApply(plain, plainHash()); await fillBase(p); const c = await counter(p); await plain.close(); return c; })();
  check(total1 - base[1] === 1 + 1 + 3, 'C one items box + guardian + gym name + gym phone + gym consent = 5 more (' + (total1 - base[1]) + ')');
  // base filled + privacy consent ticked: the next step is the first pledge box
  let mark = await oneMark(page, 'C base filled');
  check(mark.includes('この□に✔を入れる'), 'C the 👉 is on the first pledge box (' + mark + ')');
  check(await page.evaluate(() => { const el = document.querySelector('[data-tos-next]'); return Boolean(el && el.querySelector('#f-pledge1')); }), 'C the 👉 box holds f-pledge1');
  let lock = await reviewLock(page);
  check(lock && lock.locked && lock.ariaDisabled === 'true' && lock.height >= 48, 'C the review button is grey (tos-locked, aria-disabled, ≥48px)');
  check(lock && lock.reason.includes('🔒') && /誓約書の□が、あと\d+つ残っています/.test(lock.reason), 'C the reason is printed with a 🔒: ' + (lock && lock.reason));
  check(lock && /あと3つ/.test(lock.reason) && lock.reason.includes('ジム責任者の名前と電話が、まだです'), 'C the count: items box + guardian + gym consent = 3, and the gym name and phone are still missing (' + (lock && lock.reason) + ')');
  // pressing it anyway: nothing opens, a red ✕ points at the first box, the cursor goes there
  await pressReview(page);
  await settle(400);
  check((await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 0, 'C the review screen does not open');
  check(ctx.__posts.length === 0, 'C nothing is sent');
  const top = await textOf(page, '#apply-msg');
  check(top.includes('✕') && /足りない所が\d+か所あります/.test(top), 'C the red band says how many places are missing (' + short(top, 70) + ')');
  const line1 = await textOf(page, '#f-pledge1-err');
  check(line1.includes('✕') && line1.includes('✔'), 'C the items box has a red ✕ line (' + short(line1, 40) + ')');
  check((await page.locator('#f-pledge2').count()) === 0 && (await page.locator('#f-gymPermission').count()) === 0, 'C there is no second items box and no separate permission box');
  for (const key of ['pledgeGuardian', 'gymName', 'gymPhone', 'pledgeGym']) check((await page.locator('#f-' + key + '-err').count()) === 1, 'C ' + key + ' is marked red');
  check((await activeId(page)) === 'f-pledge1', 'C the cursor goes to the first box (' + (await activeId(page)) + ')');
  check((await page.locator('#f-pledge1').getAttribute('aria-invalid')) === 'true', 'C the first box says aria-invalid');
  mark = await oneMark(page, 'C after the failed try');
  check(mark.includes('この□に✔を入れる'), 'C still one 👉, on a box');
  // ticking the one items box clears its red line and ticks every item; the 👉 moves on to the guardian box
  await tick(page, 'pledge1');
  check((await page.locator('#f-pledge1-err').count()) === 0, 'C ticking the items box clears its red line');
  await page.locator('#pledge-card h2').click();
  await settle(120);
  const m1 = await oneMark(page, 'C after the items box');
  check(await page.evaluate(() => Boolean(document.querySelector('[data-tos-next] #f-pledgeGuardian'))), 'C the 👉 moved to the guardian box (' + m1 + ')');
  // after the items: the guardian box, then the gym name, the gym phone, the permission, the consent
  const seq = [['pledgeGuardian', async () => tick(page, 'pledgeGuardian')], ['gymName', async () => page.locator('#f-gymName').fill(GYM_NAME)], ['gymPhone', async () => page.locator('#f-gymPhone').fill(GYM_PHONE)], ['pledgeGym', async () => tick(page, 'pledgeGym')]];
  for (const [key, act] of seq) {
    const here = await page.evaluate((k) => Boolean(document.querySelector('[data-tos-next] #f-' + k)), key);
    check(here, 'C the 👉 is on ' + key);
    if (vp.width === 320) {
      const h = await page.evaluate(() => Math.round(document.querySelector('[data-tos-next] .tos-next-badge').getBoundingClientRect().height));
      check(h <= 66, 'C at 320px the 👉 on ' + key + ' is at most 2 lines (' + h + 'px)');
    }
    await act();
    await page.locator('#pledge-card h2').click();
    await settle(150);
  }
  // every box ticked: the lock is gone, the 👉 is on the confirm button
  lock = await reviewLock(page);
  check(lock && !lock.locked && lock.reason === '' && !lock.ariaDisabled, 'C every box ticked: the review button is the normal one, no reason');
  mark = await oneMark(page, 'C everything done');
  check(mark.includes('確認のボタン'), 'C the 👉 is on the confirm button (' + mark + ')');
  const [f2, t2] = await counter(page);
  check(f2 === t2, 'C the counter is full (入力 ' + f2 + '/' + t2 + ')');
  // un-tick one box: locked again, with "あと1つ"
  await page.locator('#f-pledge1').uncheck();
  await settle(120);
  lock = await reviewLock(page);
  check(lock && lock.locked && /あと1つ残っています/.test(lock.reason) && !lock.reason.includes('ジム責任者'), 'C un-ticking one box locks again: ' + (lock && lock.reason));
  mark = await oneMark(page, 'C one box un-ticked');
  check(await page.evaluate(() => Boolean(document.querySelector('[data-tos-next] #f-pledge1'))), 'C the 👉 comes back to the un-ticked box (' + mark + ')');
  await ctx.close();
});

/* ───────────────────────── D: all ticked → review rows → the POST with the keys, in order ───────────────────────── */
await scenario('D', 'all ticked: the review rows, then the POST (pledge keys after the old ones)', [DESKTOP, PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  await fillBase(page);
  await fillPledge(page);
  await toReview(page);
  const review = await page.locator('#review-pledge').innerText();
  check(/誓約書\s*5個ぜんぶに✔しました ✓/.test(review), 'D the review row 誓約書: 5個ぜんぶに✔しました ✓ (' + short(review, 80) + ')');
  check(/保護者の同意\s*✔しました ✓/.test(review), 'D the review row 保護者の同意: ✔しました ✓');
  check(/ジム責任者\s*名前・電話・許可の確認 ✓/.test(review), 'D the review row ジム責任者: 名前・電話・許可の確認 ✓');
  check(review.includes(GYM_NAME) && review.includes(GYM_PHONE), 'D the gym representative\'s name and phone are shown on the review screen too');
  const all = await bodyText(page);
  check(all.includes('誓約書の✔と、ジム責任者の名前・電話も、いっしょに送ります。'), 'D the review intro says the pledge and the gym representative\'s data are sent too');
  check(!/(^|\n)テスト用の文です/.test(all.slice(all.indexOf('送る前の確認'))), 'D the review screen does not repeat the sentences');
  check((await page.getByRole('button', { name: '誓約書を直す', exact: true }).count()) === 1, 'D there is a 直す button for the pledge');
  const s = await sideways(page);
  check(s.sw <= s.cw, 'D the review screen: no sideways scroll (' + s.sw + ' vs ' + s.cw + ')');
  const mark = await oneMark(page, 'D review screen');
  check(mark.includes('正しければ'), 'D the 👉 is on the send button (' + mark + ')');
  await sendBtn(page).click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  const post = ctx.__posts[ctx.__posts.length - 1];
  const keys = keysOf(post);
  check(JSON.stringify(keys.slice(0, OLD_KEYS.length)) === JSON.stringify(OLD_KEYS), 'D the old keys come first, unchanged');
  check(JSON.stringify(keys.slice(OLD_KEYS.length)) === JSON.stringify(PLEDGE_KEYS_ALL), 'D then the pledge keys in this order: ' + PLEDGE_KEYS_ALL.join(',') + ' (' + keys.slice(OLD_KEYS.length).join(',') + ')');
  check(post.get('pledge') === 'yes' && post.get('pledgeItems') === '1,2,3,4,5' && post.get('pledgeGuardian') === 'yes' && post.get('gymPermission') === 'yes' && post.get('pledgeGym') === 'yes', 'D pledge=yes, pledgeItems=1,2,3,4,5, pledgeGuardian/gymPermission/pledgeGym=yes');
  check(post.get('gymName') === GYM_NAME && post.get('gymPhone') === GYM_PHONE, 'D gymName and gymPhone are sent as typed/normalised');
  check(post.get('pledgeHash') === HASH, 'D pledgeHash is the link\'s plf, untouched (' + post.get('pledgeHash') + ')');
  check(!(ctx.__postBodies[ctx.__postBodies.length - 1] || '').includes(encodeURIComponent('テスト用の文です')), 'D the sentences themselves are not in the POST');
  await ctx.close();
});

/* ───────────────────────── E: the guardian box follows the age, live ───────────────────────── */
await scenario('E', 'guardian box: shown under 18 or when the age is empty / unreadable, gone at 18+, the tick is dropped when it goes', [DESKTOP, PHONE], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  const age = page.getByLabel('年齢 必須', { exact: true });
  const guardian = () => page.locator('#pledge-guardian-box').count();
  check((await guardian()) === 1, 'E age empty: the box is shown (the safe side)');
  for (const [value, shown] of [['15', 1], ['17', 1], ['18', 0], ['45', 0], ['１７', 1], ['１８', 0], ['あ', 1], ['121', 1], ['', 1], ['9', 1], ['30', 0]]) {
    await age.fill(value);
    check((await guardian()) === shown, 'E age "' + value + '": the guardian box is ' + (shown ? 'shown' : 'gone') + ' at once (' + (await guardian()) + ')');
  }
  // the tick goes away with the box, and does not come back
  await age.fill('15');
  await tick(page, 'pledgeGuardian');
  check(await ticked(page, 'pledgeGuardian'), 'E ticked at 15');
  await age.fill('45');
  check((await guardian()) === 0 && (await page.locator('#f-pledgeGuardian').count()) === 0, 'E at 45 the box is gone');
  await age.fill('16');
  check((await guardian()) === 1 && !(await ticked(page, 'pledgeGuardian')), 'E back at 16 the box is back and NOT ticked (the old tick was dropped)');
  // the lock reason counts the guardian box only while it is there
  await fillBase(page, { age: '45' });
  await fillPledge(page, { guardian: false });
  let lock = await reviewLock(page);
  check(lock && !lock.locked, 'E at 45 everything else ticked: not locked (no guardian box asked)');
  await page.getByLabel('年齢 必須', { exact: true }).fill('12');
  lock = await reviewLock(page);
  check(lock && lock.locked && /あと1つ残っています/.test(lock.reason), 'E at 12 the guardian box is asked again: locked with あと1つ (' + (lock && lock.reason) + ')');
  check((await oneMark(page, 'E guardian asked again')).includes('保護者'), 'E the one 👉 is on the guardian box');
  await tick(page, 'pledgeGuardian');
  await page.locator('#pledge-card h2').click();
  await settle(150);
  const post = await sendIt(page, ctx);
  check(post && post.get('pledgeGuardian') === 'yes', 'E sent at 12 with pledgeGuardian=yes');
  await ctx.close();
  // an adult: no pledgeGuardian key at all
  const ctx2 = await newCtx(DESKTOP);
  const adult = await openApply(ctx2, hashFor());
  await fillBase(adult, { age: '45' });
  await fillPledge(adult);
  const p2 = await sendIt(adult, ctx2);
  check(p2 && !p2.has('pledgeGuardian') && p2.has('pledgeItems'), 'E an adult\'s POST has no pledgeGuardian key (' + pledgeKeysOf(p2).join(',') + ')');
  await ctx2.close();
  // the three modes
  for (const [mode, age, expect] of [['all', '45', 1], ['none', '10', 0], ['all', '10', 1]]) {
    const c = await newCtx(DESKTOP);
    const p = await openApply(c, hashFor({}, { mode }));
    await p.getByLabel('年齢 必須', { exact: true }).fill(age);
    check((await p.locator('#pledge-guardian-box').count()) === expect, 'E guardian mode ' + mode + ' at age ' + age + ': the box is ' + (expect ? 'shown' : 'gone'));
    await c.close();
  }
  // the age field is not asked at all (age=off): the guardian box is shown (safe side)
  const c3 = await newCtx(DESKTOP);
  const p3 = await openApply(c3, hashFor({ age: 'off' }));
  check((await p3.locator('#pledge-guardian-box').count()) === 1, 'E no age field in the link: the guardian box is shown (the safe side)');
  await c3.close();
});

/* ───────────────────────── F: the gym representative box ───────────────────────── */
await scenario('F', 'gym representative: read-only gym name, name and mobile phone, the permission tick', [DESKTOP, PHONE], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  const box = () => page.locator('#pledge-gym-box').count();
  check((await box()) === 1, 'F the gym box is there');
  check((await page.locator('#pledge-gym-name').innerText()).includes('上の「ジム名」を入れると'), 'F with no gym name typed, the box says the name comes from above');
  await page.getByLabel('ジム名 必須', { exact: true }).fill('架空ジム');
  check((await page.locator('#pledge-gym-name').innerText()) === '架空ジム', 'F the gym name is shown, read from the 「ジム名」 above (' + (await page.locator('#pledge-gym-name').innerText()) + ')');
  check((await page.locator('#pledge-gym-box input').evaluateAll((els) => els.filter((e) => e.type !== 'checkbox').map((e) => e.id))).join(',') === 'f-gymName,f-gymPhone', 'F the only text inputs are the name and the phone (the gym name is not an input)');
  await page.getByLabel('ジム名 必須', { exact: true }).fill('架空ジム２');
  check((await page.locator('#pledge-gym-name').innerText()) === '架空ジム２', 'F changing the gym above changes it here at once');
  check((await page.locator('label[for="f-gymName"]').innerText()).replace(/\s+/g, ' ').startsWith('責任者のお名前') && (await page.locator('label[for="f-gymName"]').innerText()).includes('必須'), 'F the name field is 責任者のお名前 必須');
  check((await page.locator('label[for="f-gymPhone"]').innerText()).replace(/\s+/g, ' ').startsWith('責任者の携帯電話（ハイフンなし）') && (await page.locator('label[for="f-gymPhone"]').innerText()).includes('必須'), 'F the phone field is 責任者の携帯電話（ハイフンなし） 必須');
  check((await page.locator('#f-gymPhone-ex').innerText()).includes('09000000000'), 'F the example is the fake 09000000000');
  check((await page.locator('#f-gymPermission').count()) === 0 && (await textOf(page, '#pledge-gym-permission-note')).includes('ジム責任者の許可を得てから、名前と電話番号を入れて、下の□に✔を入れてください。'), 'F no separate permission box; the one-line reminder above the consent box');
  check((await page.locator('#pledge-gym-box').innerText()).match(/印|署名|サイン/) === null, 'F no seal or signature');
  // the phone: bad shapes are red after leaving the field; good shapes (full-width, hyphens) are fixed to digits and green
  const phoneErr = () => textOf(page, '#f-gymPhone-err');
  for (const [value, word] of [['0312345678', /11けた/], ['05012345678', /070・080・090/], ['09000', /11けた/], ['abc', /数字だけ/], ['01201234567', /070・080・090/]]) {
    await page.locator('#f-gymPhone').fill(value);
    await page.locator('#f-gymName').focus();
    await settle(150);
    const err = await phoneErr();
    check(err.includes('✕') && word.test(err), 'F phone "' + value + '" is red after leaving the field (' + short(err, 60) + ')');
  }
  for (const [value, want] of [['090-0000-0000', '09000000000'], ['０９０００００００００', '09000000000'], ['080 0000 0000', '08000000000'], ['070-0000-0000', '07000000000']]) {
    await page.locator('#f-gymPhone').fill(value);
    await page.locator('#f-gymName').focus();
    await settle(150);
    check((await page.locator('#f-gymPhone').inputValue()) === want && (await phoneErr()) === '', 'F phone "' + value + '" is fixed to ' + want + ' and not red');
  }
  const note = await textOf(page, '#f-gymPhone-note');
  check(note.includes('✓') && note.includes('自動で直しました'), 'F the automatic fix is shown in green with a ✓ (' + short(note, 50) + ')');
  // a name of 41 characters is red at once
  await page.locator('#f-gymName').fill('あ'.repeat(41));
  const nameErr = await textOf(page, '#f-gymName-err');
  check(nameErr.includes('✕') && nameErr.includes('40字まで'), 'F a 41-character name is red at once (' + short(nameErr, 50) + ')');
  await page.locator('#f-gymName').fill('あ'.repeat(40));
  check((await page.locator('#f-gymName-err').count()) === 0, 'F 40 characters is fine');
  await ctx.close();
});

/* ───────────────────────── G: people with no gym cannot take part ───────────────────────── */
await scenario('G', '無所属 and the like are refused in the gym field (red ✕, cannot be reviewed or sent); the gym box stays; a real gym name works again at once', [DESKTOP, PHONE], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  await fillBase(page, { gym: '架空ジム', age: '45' });
  await fillPledge(page);
  check((await page.locator('#pledge-gym-box').count()) === 1 && (await ticked(page, 'pledgeGym')), 'G the gym box is filled and ticked');
  const gymInput = page.getByLabel('ジム名 必須', { exact: true });
  const REFUSAL = 'ジムに所属していない人は、参加できません。通っているジム・道場の名前を入れてください。';
  check(!(await bodyText(page)).includes('無所属'), 'G the page never invites 「無所属」 (no such word on the page)');
  for (const name of ['無所属', ' 無所属 ', 'むしょぞく', 'ムショゾク', '所属なし', 'なし', '無し', 'フリー', 'ジムなし', '通っていない']) {
    await gymInput.fill('架空ジム');
    await gymInput.fill(name);
    await page.locator('#f-name').focus();
    await settle(150);
    const err = await textOf(page, '#f-gym-err');
    check(err.includes('✕') && err.includes(REFUSAL), 'G gym "' + name.trim() + '": red ✕ with the refusal (' + short(err, 50) + ')');
    check((await page.locator('#pledge-gym-box').count()) === 1 && (await page.locator('#f-gymName').count()) === 1, 'G gym "' + name.trim() + '": the gym box stays (it does not depend on the gym name)');
  }
  // what was typed in the gym box is NOT dropped by a wrong gym name
  await gymInput.fill('無所属');
  check((await page.locator('#f-gymName').inputValue()) === GYM_NAME && (await ticked(page, 'pledgeGym')) && (await ticked(page, 'pledgeGym')), 'G the box keeps what was typed while the gym name is wrong');
  // review is refused: stays on the form, red ✕ points at the gym field, nothing is sent
  const sent = ctx.__posts.length;
  await pressReview(page);
  await settle(300);
  check((await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 0, 'G with 無所属 the review screen does not open');
  check((await textOf(page, '#f-gym-err')).includes(REFUSAL), 'G … and the refusal is still on the gym field');
  check(ctx.__posts.length === sent, 'G … and nothing was sent');
  // back to a real gym: the red goes, review opens, the POST has the gym keys
  await gymInput.fill('架空ジム');
  await settle(150);
  check((await page.locator('#f-gym-err').count()) === 0, 'G a real gym name: the red ✕ is gone at once');
  const post = await sendIt(page, ctx);
  check(post && post.get('gym') === '架空ジム' && post.get('gymName') === GYM_NAME && post.get('gymPhone') === GYM_PHONE && post.get('gymPermission') === 'yes' && post.get('pledgeGym') === 'yes', 'G the POST has the gym keys (' + pledgeKeysOf(post).join(',') + ')');
  await ctx.close();
  // plm=off: no gym box at all, no gym key
  const ctx2 = await newCtx(DESKTOP);
  const off = await openApply(ctx2, hashFor({}, { gymMode: false }));
  check((await off.locator('#pledge-gym-box').count()) === 0, 'G plm=off: no gym box');
  await fillBase(off, { age: '45' });
  await fillPledge(off);
  check(!(await off.locator('#f-consent-note').innerText()).includes('ジム責任者'), 'G plm=off: the collected-data sentence is the old one');
  const p2 = await sendIt(off, ctx2);
  // the last two keys are the link's own settings (plg / plm), always sent so the server can tell a stale link (a stricter setting than the page knew) from a missing tick; the gym keys are still absent
  check(p2 && pledgeKeysOf(p2).join(',') === 'pledge,pledgeItems,pledgeHash,pledgeGuardianMode,pledgeGymMode' && p2.get('pledgeGymMode') === 'off', 'G plm=off POST: pledge, pledgeItems, pledgeHash and the link settings only; no gym keys (' + pledgeKeysOf(p2).join(',') + ')');
  await ctx2.close();
});

/* ───────────────────────── H: live link the chairman has not confirmed (plc=off) ───────────────────────── */
await scenario('H', 'plc=off on a live link: red ✕ above the card, send locked grey; a test link still works', [DESKTOP, PHONE], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor({}, { confirmed: false }));
  const red = await textOf(page, '#pledge-unconfirmed');
  check(red.includes('✕') && red.includes('主催者が、誓約書の文をまだ確認していません。送れません。'), 'H the red ✕ line is in the card (' + short(red, 60) + ')');
  const above = await page.evaluate(() => { const r = document.getElementById('pledge-unconfirmed'), first = document.getElementById('f-pledge1'); return Boolean(r && first && (r.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)); });
  check(above, 'H the red line is above the first box');
  await fillBase(page);
  await fillPledge(page);
  await toReview(page);
  const redReview = await textOf(page, '#review-pledge-unconfirmed');
  check(redReview.includes('✕') && redReview.includes('送れません'), 'H the review screen shows the red ✕ line too');
  const send = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'この内容で送信する'); return { disabled: b.disabled, locked: b.classList.contains('tos-locked'), reason: (b.parentElement.querySelector('.tos-locked-reason')?.textContent || '').replace(/\s+/g, ' ').trim() }; });
  check(send.disabled && send.locked && send.reason.includes('🔒'), 'H the send button is grey, disabled, with a 🔒 reason (' + send.reason + ')');
  const marks = await nextMarks(page);
  check(marks.length === 1 && marks[0].includes('主催者に電話する'), 'H the one 👉 points at calling the organizer, not at the locked button (' + marks.join('|') + ')');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'この内容で送信する'); b.disabled = false; b.click(); });
  await settle(500);
  check(ctx.__posts.length === 0, 'H even a button forced open from outside sends nothing');
  await ctx.close();
  // test link: works
  const ctx2 = await newCtx(DESKTOP);
  const test = await openApply(ctx2, hashFor({ mode: 'test' }, { confirmed: false }));
  check((await test.locator('#pledge-unconfirmed').count()) === 0, 'H a test link (mode=test): no red line, plc=off is fine');
  await fillBase(test);
  await fillPledge(test);
  const post = await sendIt(test, ctx2);
  check(post && post.get('pledge') === 'yes' && post.get('mode') === 'test', 'H a test link sends, with mode=test');
  await ctx2.close();
  // live and confirmed: sends
  const ctx3 = await newCtx(DESKTOP);
  const live = await openApply(ctx3, hashFor());
  check((await live.locator('#pledge-unconfirmed').count()) === 0, 'H a confirmed live link: no red line');
  await ctx3.close();
});

/* ───────────────────────── I: no sideways scroll, long sentences, 8 items ───────────────────────── */
await scenario('I', 'no sideways scroll at 320/390/1280: 8 items, long sentences, line breaks inside a sentence, every red line', [SMALL, PHONE, DESKTOP], async (vp) => {
  const long = Array.from({ length: 5 }, (_, i) => 'テスト用の長い文です' + (i + 1) + '：' + 'あ'.repeat(60) + 'W'.repeat(30));
  const items = [...long, '1行目\n2行目の文です', 'ASCII_only_unbroken_' + 'W'.repeat(40), 'ひらがなのぶんです'];
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}, { items: items.map((t) => t.slice(0, 120)), guardian: 'テスト用の保護者の文です。' + 'あ'.repeat(40), gym: 'テスト用のジムの文です。' + 'W'.repeat(40) }));
  const ids = await page.locator('#pledge-card input[type=checkbox]').evaluateAll((els) => els.map((e) => e.id));
  check(ids.filter((id) => /^f-pledge\d+$/.test(id)).length === 1 && ids.includes('f-pledgeGuardian') && ids.includes('f-pledgeGym') && !ids.includes('f-gymPermission'), 'I one items box (8 sentences listed) + the guardian box + the gym consent box (' + ids.join(',') + ')');
  check((await page.locator('#pledge-items li').count()) === 8, 'I the 8 sentences are listed');
  let s = await sideways(page);
  check(s.sw <= s.cw, 'I the card opens with no sideways scroll (' + s.sw + ' vs ' + s.cw + ')');
  const label7 = await page.locator('#pledge-items li').nth(5).innerText();
  check(label7.includes('1行目') && label7.includes('2行目の文です') && /1行目\s*\n\s*2行目/.test(label7), 'I a line break inside a sentence is kept (' + short(label7, 40) + ')');
  await fillBase(page, { age: '45' });
  await pressReview(page);
  await settle(400);
  s = await sideways(page);
  check(s.sw <= s.cw, 'I with every red line showing: no sideways scroll (' + s.sw + ' vs ' + s.cw + ')');
  const out = await page.evaluate(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll('#pledge-card *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > w + 0.5 || r.left < -0.5); }).map((e) => e.tagName + '#' + e.id).slice(0, 4); });
  check(out.length === 0, 'I nothing in the card reaches outside the screen (' + out.join(',') + ')');
  await fillGym(page, 'あ'.repeat(40), '０９０００００００００');
  await tickItems(page, 8);
  const sz = await smallThings(page);
  check(sz.small.length === 0 && sz.short.length === 0, 'I text 17px+ and targets 48px+ also with long sentences (' + sz.small.concat(sz.short).slice(0, 3).join(' | ') + ')');
  await ctx.close();
});

/* ───────────────────────── J: broken / cut links stop; the other cards do not move ───────────────────────── */
await scenario('J', 'a cut pledge link stops (no card, no send); the card sits with the other cards (花道 before 連絡先, 誓約書 after)', [DESKTOP, PHONE], async (vp) => {
  const full = hashFor();
  const ctx = await newCtx(vp);
  for (const [name, hash] of [['plt cut', full.replace(/(plt=[^&]{20})[^&]*/, '$1')], ['plf short', full.replace(HASH, HASH.slice(2))], ['no end', full.replace(/&end=1$/, '')], ['plm gone', full.replace(/&plm=on/, '')]]) {
    const page = await openApply(ctx, hash, { wait: false });
    await page.getByText('このページでは申し込めません').waitFor({ timeout: 15000 });
    check((await cardCount(page)) === 0 || !(await page.locator('#pledge-card').isVisible()), 'J ' + name + ': no visible card');
    check(!(await page.getByRole('button', { name: '入力内容を確認する →', exact: true }).isEnabled().catch(() => false)), 'J ' + name + ': the review button is not usable');
    await page.close();
  }
  check(ctx.__posts.length === 0, 'J nothing was sent');
  await ctx.close();
  // pledge + 花道 + 階級: the cards come in this order
  const ctx2 = await newCtx(vp);
  const hash = publicEntryHash({ ...baseCfg, weights: WEIGHTS, hanamichi: true, pledge: PLEDGE, pledgeHash: HASH });
  const page = await openApply(ctx2, hash);
  await page.locator('#f-division').selectOption('花道男子');
  await page.locator('#f-weightClass').selectOption('無差別');
  const order = await page.evaluate(() => {
    const pos = (id) => { const e = document.getElementById(id); return e ? e.getBoundingClientRect().top + scrollY : -1; };
    return { hn: pos('hn-card'), contact: pos('contact-fields'), pledge: pos('pledge-card') };
  });
  check(order.hn > 0 && order.hn < order.contact && order.contact < order.pledge, 'J 花道 card, then 連絡先, then 誓約書 (' + JSON.stringify(order) + ')');
  await ctx2.close();
});

/* ───────────────────────── K: nothing leaves the page, nothing is kept in storage or the console ───────────────────────── */
await scenario('K', 'the sentences, the gym representative\'s name and phone are not kept in storage or the console; nothing leaves except the POST', [DESKTOP], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  await fillBase(page);
  await fillPledge(page);
  const stored = await page.evaluate(() => JSON.stringify({ local: Object.fromEntries(Object.entries(localStorage)), session: Object.fromEntries(Object.entries(sessionStorage)), cookie: document.cookie }));
  // (R9) the draft key now holds the athlete's own fields, and its name carries the event id (here 'pledge-apply'): so look for pledge VALUE keys, not the word 'pledge'
  check(!stored.includes('テスト用') && !stored.includes('09000000000') && !stored.includes('責任者') && !/"pledge[0-9A-Za-z]*"|gymPermission|gymName|gymPhone/.test(stored), 'K storage holds no sentence, no name, no phone, no pledge value (' + short(stored, 100) + ')');
  await sendIt(page, ctx);
  // (R9) after the send the tab is on Google's page, whose storage is empty by itself: go back to the apply page of the same tab to look at ITS storage (the old check looked at the wrong origin)
  await page.goto(base + '/apply/' + hashFor());
  await page.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
  const after = await page.evaluate(() => JSON.stringify({ local: Object.fromEntries(Object.entries(localStorage)), session: Object.fromEntries(Object.entries(sessionStorage)) }));
  // (R9-2, owner decision) after a send the tab remembers the gym representative's name and phone for 60 minutes, in the next-kit key ONLY; never a sentence, never a tick
  const afterSession = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
  const kitKeys = Object.keys(afterSession).filter((k) => k.startsWith('tos-apply-next:v1:'));
  const outsideKit = JSON.stringify(Object.fromEntries(Object.entries(afterSession).filter(([k]) => !k.startsWith('tos-apply-next:v1:'))));
  check(!after.includes('テスト用') && kitKeys.length === 1 && !outsideKit.includes('09000000000') && !outsideKit.includes('架空 責任者') && !/"pledge[0-9A-Za-z]*"|gymPermission/.test(after), 'K after the send storage holds no sentence and no tick; the gym representative is in the next-kit key only (' + short(after, 100) + ')');
  const mine = consoleLines.filter((l) => l.scenario.startsWith('K'));
  check(!mine.some((l) => l.text.includes('テスト用') || l.text.includes('09000000000') || l.text.includes('責任者')), 'K the console has none of it (' + mine.length + ' lines)');
  await ctx.close();
});

/* ───────────────────────── R: what the reviewers found (the 👉 badge must not hide text; 17px; typed-wrong phone; blocked live link; guardian hint) ───────────────────────── */
/** text pieces (outside the badge itself) whose box overlaps the yellow 👉 badge by more than 2px: the badge floats above its box, so it must never cover a sentence the applicant has to read */
const badgeOverlaps = (p) => p.evaluate(() => {
  const badge = document.querySelector('[data-tos-next] .tos-next-badge');
  if (!badge) return null;
  const b = badge.getBoundingClientRect();
  const hits = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent.trim() || badge.contains(node)) continue;
    const el = node.parentElement;
    if (!el || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).display === 'none') continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue;
      const ix = Math.min(r.right, b.right) - Math.max(r.left, b.left), iy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      if (ix > 2 && iy > 2) hits.push(node.textContent.trim().slice(0, 22) + ' (' + Math.round(iy) + 'px)');
    }
  }
  return { hits, height: Math.round(b.height), text: badge.textContent.replace(/\s+/g, ' ').trim() };
});
await scenario('R1', 'the yellow 👉 never covers text at any step of the pledge card (guardian sentence, gym note, how-to line) at 320/390/1280', [SMALL, PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  await fillBase(page, { age: '15' });
  const seen = [];
  const probe = async (where) => {
    await settle(80);
    const o = await badgeOverlaps(page);
    check(o && o.hits.length === 0, 'R1 ' + where + ': the badge covers no text (' + (o ? o.height + 'px, "' + short(o.text, 40) + '" ' + o.hits.join(' | ') : 'no badge') + ')');
    if (o) seen.push(o.height);
  };
  await probe('first box (just under the how-to line)');
  await tick(page, 'pledge1'); await probe('after the items box (👉 on the next one)');
  await tick(page, 'pledgeGuardian'); await probe('after the guardian tick (👉 on the gym name)');
  await page.locator('#f-gymName').fill(GYM_NAME); await page.locator('#f-gymName').blur(); await probe('gym name typed');
  await page.locator('#f-gymPhone').fill(GYM_PHONE); await page.locator('#f-gymPhone').blur(); await probe('gym phone typed');
  await tick(page, 'pledgeGym'); await probe('everything done');
  // the same walk with the badge ON the guardian tick and on the gym name (the two places the reviewers saw covered)
  const page2 = await openApply(await newCtx(vp), hashFor());
  await fillBase(page2, { age: '15' });
  await tickItems(page2);
  const guardianMark = await oneMark(page2, 'R1 guardian step');
  check(guardianMark.includes('保護者'), 'R1 the 👉 is on the guardian tick (' + guardianMark + ')');
  const o = await badgeOverlaps(page2);
  check(o && o.hits.length === 0, 'R1 the guardian sentence stays readable under the 👉 (' + (o && (o.height + 'px ' + o.hits.join('|'))) + ')');
  const sentence = await page2.evaluate(() => { const a = document.getElementById('pledge-guardian-text'), b = document.querySelector('[data-tos-next] .tos-next-badge'); if (!a || !b) return null; const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect(); return { gap: Math.round(br.top - ar.bottom) }; });
  check(sentence && sentence.gap >= 0, 'R1 the badge starts below the end of the guardian sentence (gap ' + (sentence && sentence.gap) + 'px)');
  await ctx.close();
});

await scenario('R2', 'every sentence of the pledge gate is 17px or more, including the grey 🔒 reason with the 「あと○つ」 count (320/390/1280)', [SMALL, PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  await fillBase(page, { age: '15' });
  const lock = await reviewLock(page);
  check(lock && lock.locked && /あと3つ残っています/.test(lock.reason), 'R2 the lock reason with the count is there (' + (lock && lock.reason) + ')');
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.tos-locked-reason')].map((e) => parseFloat(getComputedStyle(e).fontSize)));
  check(sizes.length >= 1 && sizes.every((px) => px >= 16.99), 'R2 the 🔒 reason is 17px or more (' + sizes.join(',') + ')');
  // the blocked send lock on the review screen too (plc=off)
  const ctx2 = await newCtx(vp);
  const blocked = await openApply(ctx2, hashFor({}, { confirmed: false }));
  await fillBase(blocked, { age: '15' }); await fillPledge(blocked);
  await toReview(blocked);
  const sizes2 = await blocked.evaluate(() => [...document.querySelectorAll('.tos-locked-reason')].map((e) => parseFloat(getComputedStyle(e).fontSize)));
  check(sizes2.length >= 1 && sizes2.every((px) => px >= 16.99), 'R2 the review screen send lock is 17px or more (' + sizes2.join(',') + ')');
  await ctx.close(); await ctx2.close();
});

await scenario('R3', 'a gym phone that is typed but is not a mobile number is 「直す」, never 「まだです」: the 👉, the red band and the 🔒 reason', [DESKTOP, PHONE], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  await fillBase(page, { age: '45' });
  await tickItems(page);
  await page.locator('#f-gymName').fill(GYM_NAME);
  await tick(page, 'pledgeGym');
  await page.locator('#f-gymPhone').fill('0312345678');
  await page.locator('#f-gymPhone').blur();
  await settle(200);
  const mark = await oneMark(page, 'R3 typed-wrong phone');
  check(mark.includes('責任者の携帯電話を直す') && !mark.includes('入れる'), 'R3 the 👉 says 「責任者の携帯電話を直す」 (' + mark + ')');
  const lock = await reviewLock(page);
  check(lock && lock.locked && lock.reason.includes('携帯電話の番号になっていません') && !lock.reason.includes('まだです'), 'R3 the 🔒 reason says it is not a mobile number, not 「まだです」 (' + (lock && lock.reason) + ')');
  await pressReview(page);
  await settle(300);
  const t = await bodyText(page);
  check(t.includes('直す所：責任者の携帯電話') && !t.includes('足りない所が'), 'R3 the red band says 「直す所：責任者の携帯電話」 and no 「足りない所」 (' + short((t.match(/まちがい：[^\n]*/) || [''])[0], 80) + ')');
  check(/携帯電話は11けたです。いま10けたです/.test(await textOf(page, '#f-gymPhone-err')), 'R3 the red ✕ under the field is still there');
  // an EMPTY phone stays 「入れる」 / 「足りない」
  await page.locator('#f-gymPhone').fill('');
  await page.locator('#f-gymPhone').blur();
  await settle(150);
  const mark2 = await oneMark(page, 'R3 empty phone');
  check(mark2.includes('責任者の電話を入れる'), 'R3 an empty phone is still 「責任者の電話を入れる」 (' + mark2 + ')');
  const lock2 = await reviewLock(page);
  check(lock2 && lock2.reason.includes('ジム責任者の名前と電話が、まだです'), 'R3 an empty phone keeps the old reason (' + (lock2 && lock2.reason) + ')');
  await ctx.close();
});

await scenario('R4', 'a live link the chairman has not confirmed (plc=off): when everything is filled, the red ✕ sits next to the confirm button and the 👉 points at the phone call (or nowhere), never at a step that cannot finish', [DESKTOP, PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}, { confirmed: false }));
  await fillBase(page, { age: '45' });
  await fillPledge(page);
  await settle(200);
  const red = await textOf(page, '#form-pledge-unconfirmed');
  check(red.includes('✕') && red.includes('主催者が、誓約書の文をまだ確認していません。送れません。'), 'R4 the red ✕ is next to the confirm button (' + short(red, 70) + ')');
  const nearButton = await page.evaluate(() => { const r = document.getElementById('form-pledge-unconfirmed'), b = document.getElementById('f-submit'); if (!r || !b) return null; return Math.round(b.getBoundingClientRect().top - r.getBoundingClientRect().bottom); });
  check(nearButton !== null && nearButton >= 0 && nearButton < 220, 'R4 it is just above the button (' + nearButton + 'px)');
  const marks = await nextMarks(page);
  check(marks.length === 1 && marks[0].includes('主催者に電話する'), 'R4 the one 👉 points at calling the organizer (' + marks.join('|') + ')');
  check(!(await page.locator('#f-submit-box[data-tos-next]').count()), 'R4 the confirm button carries no 👉');
  check(!(await bodyText(page)).includes('確認のボタンを押す'), 'R4 nobody is told to press the confirm button');
  // the button is still pressable (the review screen then shows the same red line and the call box)
  await toReview(page);
  const marks2 = await nextMarks(page);
  check(marks2.length === 1 && marks2[0].includes('主催者に電話する') && (await textOf(page, '#review-pledge-unconfirmed')).includes('送れません'), 'R4 the review screen: red ✕ and the call 👉');
  check((await page.locator('#review-pledge-contact').count()) === 0, 'R4 with a phone number there is no extra contact line');
  await ctx.close();
  // contact without digits: no 👉 at all, the contact is written out (form and review)
  const ctx2 = await newCtx(vp);
  const page2 = await openApply(ctx2, hashFor({ contact: 'LINE：@架空グループ' }, { confirmed: false }));
  await fillBase(page2, { age: '45' });
  await fillPledge(page2);
  await settle(200);
  check((await nextMarks(page2)).length === 0, 'R4 no phone number: no yellow 👉 anywhere (' + (await nextMarks(page2)).join('|') + ')');
  const formText = await textOf(page2, '#form-pledge-blocked');
  check(formText.includes('主催者が、誓約書の文をまだ確認していません。') && formText.includes('連絡先：LINE：@架空グループ'), 'R4 the form says whom to ask (' + short(formText, 90) + ')');
  await toReview(page2);
  check((await nextMarks(page2)).length === 0, 'R4 the review screen has no 👉 either');
  const rv = await textOf(page2, '#review-pledge-contact');
  check(rv.includes('連絡先：LINE：@架空グループ'), 'R4 the review screen says 「連絡先：…」 under the red line (' + short(rv, 60) + ')');
  await ctx2.close();
  // a confirmed live link and a test link: none of this shows
  const ctx3 = await newCtx(vp);
  const ok = await openApply(ctx3, hashFor());
  await fillBase(ok, { age: '45' }); await fillPledge(ok); await settle(150);
  check((await ok.locator('#form-pledge-blocked').count()) === 0, 'R4 a confirmed link: no blocked box');
  const m = await nextMarks(ok);
  check(m.length === 1 && m[0].includes('確認のボタンを押す'), 'R4 a confirmed link: the 👉 is on the confirm button as before (' + m.join('|') + ')');
  await ctx3.close();
});

await scenario('R5', 'the guardian box that appears only because the age is empty says how to make it go away; it does not say so when the age is known', [DESKTOP, PHONE], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  const age = page.getByLabel('年齢 必須', { exact: true });
  const note = () => textOf(page, '#pledge-guardian-age-note');
  check((await note()).includes('年齢を入れると、18歳以上の方は、この欄が出なくなります。'), 'R5 empty age: the hint is in the guardian box (' + short(await note(), 50) + ')');
  for (const value of ['あ', '121', '0']) { await age.fill(value); check((await page.locator('#pledge-guardian-box').count()) === 1 && (await note()).includes('年齢を入れると'), 'R5 unreadable age "' + value + '": the hint stays'); }
  await age.fill('15');
  check((await page.locator('#pledge-guardian-box').count()) === 1 && (await page.locator('#pledge-guardian-age-note').count()) === 0, 'R5 age 15: the box is for a real reason, no hint');
  await age.fill('45');
  check((await page.locator('#pledge-guardian-box').count()) === 0, 'R5 age 45: the box is gone');
  const size = await (async () => { await age.fill(''); return page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('pledge-guardian-age-note')).fontSize)); })();
  check(size >= 16.99, 'R5 the hint is 17px or more (' + size + ')');
  await ctx.close();
  // mode "all": the box is always asked; it never says it will go away
  const ctx2 = await newCtx(DESKTOP);
  const all = await openApply(ctx2, hashFor({}, { mode: 'all' }));
  check((await all.locator('#pledge-guardian-box').count()) === 1 && (await all.locator('#pledge-guardian-age-note').count()) === 0, 'R5 mode all: asked for everyone, no hint');
  await ctx2.close();
});

await scenario('R6', 'the header number is the number NOW; a link whose count can change says so (出場区分・年齢). A link with none of it says nothing extra', [PHONE, SMALL], async (vp) => {
  const variants = [
    ['pledge under18 + gym', hashFor(), ['年齢']],
    ['pledge all, no gym', hashFor({}, { mode: 'all', gymMode: false }), []],
    ['pledge none, gym', hashFor({}, { mode: 'none' }), []],
    ['pledge none, no gym', hashFor({}, { mode: 'none', gymMode: false }), []],
    ['花道 + weights', publicEntryHash({ ...baseCfg, weights: WEIGHTS, hanamichi: true }), ['出場区分']],
    ['old link (nothing new)', plainHash(), []],
  ];
  for (const [label, hash, words] of variants) {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hash);
    const t = await textOf(page, '#count-note');
    const head = await page.evaluate(() => { const p = [...document.querySelectorAll('header p')].find((e) => /用意するもの/.test(e.innerText)); return p ? { text: p.innerText.trim(), fs: parseFloat(getComputedStyle(p).fontSize) } : null; });
    check(head && /^用意するもの：顔写真1枚。入力は全部で\d+個です。$/.test(head.text), 'R6 ' + label + ': the first line is the same as before (' + (head && head.text) + ')');
    if (words.length) check(t.includes(words.join('・') + 'によって、入力の数が変わることがあります。'), 'R6 ' + label + ': the note names ' + words.join('・') + ' (' + short(t, 60) + ')');
    else check(t === '' && (await page.locator('#count-note').count()) === 0, 'R6 ' + label + ': no extra note');
    if (words.length) check((await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('count-note')).fontSize))) >= 16.99, 'R6 ' + label + ': the note is 17px or more');
    check((await sideways(page)).sw <= (await sideways(page)).cw, 'R6 ' + label + ': no sideways scroll');
    await ctx.close();
  }
});

await scenario('R7', 'what the page says it remembers is what it really remembers (reload draft: player fields only; next person: gym, contact, the privacy tick and the gym representative)', [DESKTOP], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  const t = await bodyText(page);
  check(t.includes('更新したときは、選手の欄（ジム名・選手名・身長・体重など）の入力だけ、残っていることがあります'), 'R7 the top caution names the player fields only');
  check(t.includes('連絡先・写真・同意のチェック・誓約書の✔・ジム責任者の欄は、入れ直しになります'), 'R7 the top caution names what has to be typed again: only what this link has (pledge ticks, gym box; no 花道 word before a 花道 division is chosen)');
  check(!t.includes('花道の答え'), 'R7 no 花道 word on a link without 花道');
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  const t2 = await bodyText(page);
  check(t2.includes('個人情報の同意のチェックと、ジム責任者の名前・電話も、いっしょに覚えます。'), 'R7 the next-person sentence also names the consent tick and the gym representative (pledge link with the gym box)');
  check(t2.includes('送った内容は、主催者のGoogleのシートとドライブにだけ保存されます（これは変わりません）。') && !t2.includes('Googleの表にだけ'), 'R7 the storage sentence says sheet and Drive');
  // what is really kept after a send: gym, contact, consent and the representative's name and phone; nothing else
  await fillBase(page, { age: '45' });
  await fillPledge(page);
  await sendIt(page, ctx);
  await page.goto(base + '/apply/' + hashFor());
  await page.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
  await settle(250);
  const banner = await textOf(page, '#next-banner');
  check(banner.includes('さっきと同じジム名・連絡先を入れました。') && banner.includes('個人情報の同意のチェックも入っています。') && banner.includes('ジム責任者の名前・電話も入っています。'), 'R7 the banner names what came back (' + short(banner, 120) + ')');
  check((await page.locator('#f-consent').isChecked()) && (await page.locator('#f-gymName').inputValue()) === GYM_NAME && (await page.locator('#f-gymPhone').inputValue()) === GYM_PHONE, 'R7 and they really are in (consent, name, phone)');
  check(!(await ticked(page, 'pledgeGym')) && !(await ticked(page, 'pledge1')) && !(await ticked(page, 'pledgeGym')), 'R7 the permission tick and the pledge ticks are NOT back (asked again every time)');
  // a link without the gym box: no gym clause
  const ctx2 = await newCtx(DESKTOP);
  const plain = await openApply(ctx2, hashFor({}, { gymMode: false }));
  await plain.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  const t3 = await bodyText(plain);
  check(t3.includes('個人情報の同意のチェックも、いっしょに覚えます。') && !t3.includes('ジム責任者の名前・電話も、いっしょに覚えます'), 'R7 without the gym box the sentence names only the consent tick');
  check(t3.includes('連絡先・写真・同意のチェック・誓約書の✔は、入れ直しになります') && !t3.includes('ジム責任者の欄は、入れ直し'), 'R7 without the gym box the list has no 「ジム責任者の欄」');
  await ctx2.close(); await ctx.close();
});

await scenario('R8', 'the ordinary form (no pledge) too: while every field is filled one by one, the yellow 👉 covers no text at 320/360/390 (first field, photo button, contact fields, confirm button)', [SMALL, { width: 360, height: 700 }, PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, plainHash());
  const bad = [];
  const step = async (where) => { await settle(60); const o = await badgeOverlaps(page); if (o && o.hits.length) bad.push(where + ' [' + o.height + 'px ' + short(o.text, 30) + '] covers ' + o.hits.join(' | ')); };
  await step('start');
  for (const [l, v] of [['ジム名 必須', '架空ジム'], ['選手名 必須', '架空選手'], ['身長（cm）必須', '170'], ['体重（kg）必須', '65'], ['戦績 必須', '初出場'], ['年齢 必須', '15']]) { const f = page.getByLabel(l, { exact: true }); await f.fill(v); await f.blur(); await step('after ' + l); }
  const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 120, 160); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
  await step('before photo');
  await page.locator('input[type=file]').setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByAltText('選んだ写真').waitFor(); await step('after photo');
  for (const [l, v] of [['連絡先のお名前 必須', '架空連絡先'], ['電話番号 必須', '09000000000'], ['メールアドレス 必須', 'kakuu@example.com']]) { const f = page.getByLabel(l, { exact: true }); await f.fill(v); await f.blur(); await step('after ' + l); }
  await page.locator('#f-consent').check(); await step('after consent (👉 on the confirm button)');
  check(bad.length === 0, 'R8 ' + vp.width + 'px: no badge covers text (' + bad.join(' ; ') + ')');
  // the photo box: the badge sits above the photo button; it has room above (no overlap with the note)
  await ctx.close();
});

/* ───────────────────────── done ───────────────────────── */
await settle(100);
for (const e of externals) failures.push('[' + e.scenario + '] EXTERNAL request attempted: ' + e.method + ' ' + e.url);
for (const e of pageErrors) failures.push('[' + e.scenario + '] page error: ' + short(e.message, 200));
const nonLocal = net.filter((n) => !n.url.startsWith(base + '/') && n.url !== ENDPOINT && !n.url.startsWith('data:'));
for (const n of nonLocal) failures.push('[' + n.scenario + '] network request left the app: ' + n.method + ' ' + n.url);
checks += 3; // the three network guards above are checks too
await browser.close();
console.log('\n' + checks + ' checks, ' + failures.length + ' failed.');
for (const f of failures) console.log(' - ' + f);
process.exit(failures.length ? 1 : 0);
