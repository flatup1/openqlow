/**
 * Regression checks for the POLISH round of the public apply page (/apply/): cut links, the Back button (bfcache), the 30 s timeout,
 * auto-fix without lost taps, e-mail / phone / height-weight mistakes, wording, focus, no-JS, old browsers.
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation, except the apply form's POST to the
 * (simulated) Google endpoint, which is answered locally. All data is fake. Drives the REAL built page (npm run build:private).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4991 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-polish-apply.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4991), TOS_ONLY=P1,P2 (scenario ids), TOS_CHROME_PATH.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { publicEntryHash } from '../core/publicEntry.ts';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4991';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const ENDPOINT = 'https://script.google.com/macros/s/TOS_POLISH_APPLY_SIM/exec';
const launchOpts = EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' };
const browser = await chromium.launch({ headless: true, ...launchOpts });
/** A second browser with the back/forward cache ON (Playwright switches it off by default), so the real "Back from Google" path runs. */
const bfBrowser = await chromium.launch({ headless: true, ...launchOpts, ignoreDefaultArgs: ['--disable-back-forward-cache'], args: ['--enable-features=BackForwardCache', '--disable-features=BackForwardCacheDisabledForTesting'] });

/* ───────────────────────── bookkeeping ───────────────────────── */
let checks = 0, cur = '-';
const failures = [], net = [], externals = [], pageErrors = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 160) => String(s).replace(/\s+/g, ' ').slice(0, n);
const note = (m) => console.log('  note [' + cur + '] ' + m);

/* ───────────────────────── links ───────────────────────── */
const baseCfg = { endpoint: ENDPOINT, eventId: 'polish-apply', title: '架空テスト大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '架空連絡先 02-0000-0000', music: false, grade: 'off', age: 'off', comment: 'off', protocol: '3', mode: 'live' };
const hashFor = (over = {}, classes = undefined) => publicEntryHash({ ...baseCfg, ...over, ...(classes ? { classes } : {}) });
const CUSTOM = { enabled: true, upper: { name: '上級クラス', condition: '5勝以上（例：5勝0敗）', rule: '首相撲あり／膝蹴りあり' }, lower: { name: '初級クラス', condition: '4勝以下（例：初出場）', rule: 'パンチとキックのみ' }, upperMinWins: 5 };

/* ───────────────────────── browser helpers ───────────────────────── */
function attach(page) {
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('pageerror', (e) => { pageErrors.push({ scenario: cur, message: e.message }); });
}
async function newCtx(viewport, br = browser, opts = {}) {
  const mobile = viewport.width < 800;
  const ctx = await br.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, ...opts });
  ctx.__posts = [];
  ctx.on('request', (r) => { if (/^https?:/.test(r.url())) net.push({ scenario: cur, url: r.url(), method: r.method() }); });
  ctx.on('page', attach);
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(base + '/')) return route.continue();
    if (url === ENDPOINT && req.method() === 'POST') {
      const fields = new URLSearchParams(req.postData() || '');
      ctx.__posts.push(fields);
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
const GOOD = [['ジム名 必須', '架空ジム'], ['選手名 必須', '架空選手'], ['身長（cm）必須', '170'], ['体重（kg）必須', '65'], ['戦績 必須', '初出場'], ['連絡先のお名前 必須', '架空連絡先'], ['電話番号 必須', '09012345678'], ['メールアドレス 必須', 'test@example.com']];
async function fillAll(page, { skip = [], consent = true, photo = true, over = {} } = {}) {
  for (const [label, value] of GOOD) if (!skip.includes(label)) await page.getByLabel(label, { exact: true }).fill(over[label] ?? value);
  if (photo) {
    const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 120, 160); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
    await page.locator('input[type=file]').setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await page.getByAltText('選んだ写真').waitFor();
  }
  if (consent) await page.getByRole('checkbox').check();
}
const reviewBtn = (p) => p.getByRole('button', { name: '入力内容を確認する →', exact: true });
const sendBtn = (p) => p.getByRole('button', { name: 'この内容で送信する', exact: true });
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const val = (p, sel) => p.locator(sel).inputValue();
/** the visible red (.tos-error) lines */
const redLines = (p) => p.evaluate(() => [...document.querySelectorAll('.tos-error')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
const greenLines = (p) => p.evaluate(() => [...document.querySelectorAll('.tos-ok')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
const yellowLines = (p) => p.evaluate(() => [...document.querySelectorAll('.tos-caution')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
const nextMarks = (p) => p.evaluate(() => [...document.querySelectorAll('[data-tos-next] .tos-next-badge')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
/** a mouse press that stays down for a moment, like a real finger: blur of the previous field happens at press time */
async function slowTap(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + Math.min(12, box.width / 2), box.y + Math.min(12, box.height / 2));
  await page.mouse.down();
  await settle(120);
  await page.mouse.up();
  await settle(250);
}
const inView = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight; }, sel);

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
const DESKTOP = { width: 1280, height: 900 }, PHONE = { width: 390, height: 844 }, SMALL = { width: 320, height: 568 }, MID = { width: 375, height: 667 };

/* ───────────────────────── P1 S-2: a very long record never freezes the form ───────────────────────── */
await scenario('P1', 'S-2: a long digit run in 戦績 does not freeze the page', [DESKTOP, PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}, DEFAULT_CLASS_SETTINGS));
  for (const [label, text] of [['30000 x 1', '1'.repeat(30000)], ['30000 zeros then 勝', '0'.repeat(30000) + '勝'], ['100 digits then 勝', '9'.repeat(100) + '勝'], ['3 wins then junk', '3勝' + 'あ'.repeat(5000)]]) {
    const t0 = Date.now();
    await page.getByLabel('戦績 必須', { exact: true }).fill(text);
    await page.getByLabel('ジム名 必須', { exact: true }).click();
    const alive = await Promise.race([page.evaluate(() => 'alive'), settle(4000).then(() => 'frozen')]);
    const ms = Date.now() - t0;
    check(alive === 'alive' && ms < 3000, 'P1 ' + label + ': page answers within 3 s (' + ms + 'ms)');
  }
  await ctx.close();
});

/* ───────────────────────── P2 B2 / S-3 / r1-1 / r1-107: every cut of the link is caught ───────────────────────── */
await scenario('P2', 'cut links: red box, send locked', [PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const full = hashFor({}, CUSTOM);
  const fullTest = hashFor({ mode: 'test' }, DEFAULT_CLASS_SETTINGS);
  const cuts = [
    ['before &cls=on', full.slice(0, full.indexOf('&cls=on'))],
    ['inside cls=on', full.slice(0, full.indexOf('&cls=on') + 6)],
    ['inside a class name', full.slice(0, full.indexOf('&cuN=') + 9)],
    ['inside the class rule', full.slice(0, full.indexOf('&clR=') + 12)],
    ['right before protocol', full.slice(0, full.indexOf('&protocol='))],
    ['mode=te (a test link would read as LIVE)', fullTest.slice(0, fullTest.indexOf('mode=te') + 7)],
    ['mode= (empty)', full.slice(0, full.indexOf('mode=') + 5)],
    ['only the end marker lost', full.slice(0, full.indexOf('&end='))],
    ['end= (empty)', full.slice(0, full.indexOf('&end=') + 5)],
  ];
  for (const [name, hash] of cuts) {
    const page = await openApply(ctx, hash, { wait: false });
    await page.getByText('このページでは申し込めません').first().waitFor({ timeout: 15000 }).catch(() => {});
    const t = await bodyText(page);
    const formVisible = await page.getByLabel('ジム名 必須', { exact: true }).isVisible().catch(() => false);
    check(/このページでは申し込めません/.test(t) && /途中で切れ/.test(t) && /新しいリンク/.test(t), 'P2 cut ' + name + ': red box says the link is cut and what to do (' + short(t, 100) + ')');
    check(!formVisible && !(await reviewBtn(page).isEnabled().catch(() => false)), 'P2 cut ' + name + ': the form is not usable and cannot be sent');
    check((await redLines(page)).some((x) => x.includes('✕')) || /✕/.test(t), 'P2 cut ' + name + ': the red box carries ✕');
    await page.close();
  }
  // the whole links work; a test link says so; an OLD link (no end marker, no class) keeps working
  const okLinks = [['class link', full], ['test link', fullTest], ['no-class link', hashFor({})],
    ['old link (no end marker)', hashFor({}).replace(/&end=1$/, '')],
    ['old link, old key order (protocol first)', '#' + new URLSearchParams({ endpoint: ENDPOINT, protocol: '3', mode: 'live', eventId: 'old-link', title: '昔のリンク', organizer: '', date: '', venue: '', venueUrl: '', deadline: '', contact: '', music: 'off', grade: 'off', age: 'off', comment: 'off' }).toString()]];
  for (const [name, hash] of okLinks) {
    const page = await openApply(ctx, hash);
    check(await page.getByLabel('ジム名 必須', { exact: true }).isVisible(), 'P2 whole ' + name + ': the form opens');
    if (name === 'class link') check((await page.locator('#f-fighterClass').innerText()).includes('上級クラス'), 'P2 whole class link: the custom class text is shown');
    if (name === 'test link') check(/これはテストです/.test(await bodyText(page)), 'P2 whole test link: says これはテストです');
    await page.close();
  }
  await ctx.close();
});

/* ───────────────────────── P3 B1 / r1-2 / r1-5 / r1-112 / r1-14: Back button (bfcache) ───────────────────────── */
await scenario('P3', 'Back after sending: message, timer, new request id, reset', [PHONE], async (vp) => {
  const ctx = await newCtx(vp, bfBrowser);
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.addEventListener('pageshow', (e) => { window.__persisted = e.persisted; window.__shows = (window.__shows || 0) + 1; }); });
  await page.goto(base + '/apply/' + hashFor({}, DEFAULT_CLASS_SETTINGS));
  await page.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
  await fillAll(page);
  await page.locator('#f-fighterClass input[value=lower]').check();
  await reviewBtn(page).click();
  await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor();
  await sendBtn(page).click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  const firstId = ctx.__posts[0]?.get('requestId');
  check(!!firstId && ctx.__posts.length === 1, 'P3 first send carries a request id (' + ctx.__posts.length + ' post)');
  const t0 = Date.now();
  await page.goBack({ waitUntil: 'commit' });
  await page.getByText('受付番号の画面が出ましたか').first().waitFor({ timeout: 8000 }).catch(() => {});
  const persisted = await page.evaluate(() => window.__persisted).catch(() => undefined);
  if (persisted !== true) note('page was NOT restored from the back/forward cache (persisted=' + persisted + '); the timer check below is weaker');
  check(/受付番号の画面が出ましたか/.test(await bodyText(page)), 'P3 after Back the page asks 受付番号の画面が出ましたか');
  // the 30 s send timer must not overwrite that message later (r1-2)
  await settle(Math.max(0, 31500 - (Date.now() - t0)));
  const later = await bodyText(page);
  check(/受付番号の画面が出ましたか/.test(later) && !/通信に時間がかかっています/.test(later), 'P3 31 s after the send the message is still the Back message (no stale "wait for Google")');
  // the button to press is on screen, focused, and not covered (r1-3 / r1-112)
  const resend = page.getByRole('button', { name: 'もう一度送る（二重になりません）', exact: true });
  check(await resend.isVisible(), 'P3 「もう一度送る（二重になりません）」 is there');
  check(await inView(page, '#f-submit'), 'P3 the resend button is inside the screen');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'f-submit'), 'P3 the resend button has the focus');
  check(await page.evaluate(() => { const b = document.getElementById('f-submit'); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === b || b.contains(e); }), 'P3 nothing covers the resend button');
  check((await page.locator('#apply-msg').count()) === 0, 'P3 the message is not a sticky bar over the page (it sits above the button)');
  // same content -> same id (no double)
  await resend.click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  check(ctx.__posts.length === 2 && ctx.__posts[1].get('requestId') === firstId, 'P3 resend of the SAME content keeps the request id (no double)');
  await page.goBack({ waitUntil: 'commit' });
  await page.getByText('受付番号の画面が出ましたか').first().waitFor({ timeout: 8000 });
  // changed content -> a NEW id, and wording that lets a failed application be corrected (r1-5)
  await page.getByLabel('選手名 必須', { exact: true }).fill('架空選手改');
  await page.getByLabel('ジム名 必須', { exact: true }).click();
  const t = await bodyText(page);
  check(!!(await page.getByRole('button', { name: '入力内容を確認する →', exact: true }).count()) && !(await page.getByRole('button', { name: 'この内容で送る', exact: true }).count()), 'P3 after a change the button is 「入力内容を確認する →」 (the read-over screen comes first, r2-11)');
  check(/受付番号が出なかった方は、直して送って大丈夫です/.test(t) && /受付番号が出た方は、もう申し込み済みです/.test(t), 'P3 the note separates 出なかった方 (may correct) from 出た方 (already applied)');
  check(!/別の人の申し込みになります|変えないでください|この新しい内容で送る/.test(t), 'P3 the old "do not change / another person" wording is gone');
  check(!!(await page.getByRole('button', { name: '別の人を申し込む（入力を消して、最初から）', exact: true }).count()), 'P3 the 「別の人を申し込む」 button is there');
  await page.getByRole('button', { name: '入力内容を確認する →', exact: true }).click();
  await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor({ timeout: 5000 });
  check(ctx.__posts.length === 2, 'P3 r2-11: pressing 「入力内容を確認する →」 after a change sends NOTHING; the review screen opens first (' + ctx.__posts.length + ' posts)');
  await sendBtn(page).click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  check(ctx.__posts.length === 3 && ctx.__posts[2].get('requestId') && ctx.__posts[2].get('requestId') !== firstId && ctx.__posts[2].get('name') === '架空選手改', 'P3 changed content is sent with a NEW request id');
  await page.goBack({ waitUntil: 'commit' });
  await page.getByText('受付番号の画面が出ましたか').first().waitFor({ timeout: 8000 });
  // 「別の人を申し込む」: empty form, back at the top, green sign, focus on the first field (r1-14)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: '別の人を申し込む（入力を消して、最初から）', exact: true }).click();
  await settle(300);
  check((await val(page, '#f-gym')) === '' && (await val(page, '#f-name')) === '', 'P3 reset empties the form');
  check(await page.evaluate(() => window.scrollY < 40), 'P3 reset scrolls back to the top');
  check((await greenLines(page)).some((x) => x.includes('入力を消しました')), 'P3 reset shows a green ✓ 入力を消しました (' + short((await greenLines(page)).join('|'), 80) + ')');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'f-gym'), 'P3 reset puts the cursor in the first field');
  await ctx.close();
});

/* ───────────────────────── P4 r1-3: after the 30 s timeout the button to press is in view ───────────────────────── */
await scenario('P4', '30 s timeout: resend button visible and focused at small sizes', [SMALL, MID, PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await ctx.newPage();
  await page.addInitScript(() => { HTMLFormElement.prototype.requestSubmit = function () { /* simulate a send that hangs */ }; HTMLFormElement.prototype.submit = function () { /* same */ }; });
  await page.clock.install();
  await page.goto(base + '/apply/' + hashFor({}));
  await page.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
  await fillAll(page);
  await reviewBtn(page).click();
  await sendBtn(page).click();
  await page.getByText('そのまま待つ').first().waitFor({ timeout: 8000 });
  await page.clock.fastForward(31000);
  await page.getByText('通信に時間がかかっています').first().waitFor({ timeout: 8000 });
  await settle(400);
  await page.clock.fastForward(200);
  check(await inView(page, '#f-submit'), 'P4 ' + vp.width + 'x' + vp.height + ': the resend button is inside the screen');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'f-submit'), 'P4 the resend button has the focus');
  check(await page.evaluate(() => { const b = document.getElementById('f-submit'); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === b || b.contains(e); }), 'P4 nothing covers the resend button');
  const msgH = await page.evaluate(() => { const m = document.getElementById('apply-msg-inline'); return m ? m.getBoundingClientRect().height / window.innerHeight : -1; });
  check(msgH > 0 && msgH < 0.5, 'P4 the message box is not larger than half the screen (' + msgH.toFixed(2) + ')');
  check(/下の「もう一度送る」/.test(await bodyText(page)) && /もう一度送る（二重になりません）/.test(await bodyText(page)), 'P4 it names the button 「もう一度送る」, and the button itself says 二重になりません');
  await ctx.close();
});

/* ───────────────────────── P5 r1-4: the yellow badge does not say "直す" while the parent is still typing ───────────────────────── */
await scenario('P5', 'badge says 入れる, not 直す, while typing', [PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}));
  await page.locator('#f-gym').click();
  check((await nextMarks(page)).length === 1 && /ジム名を入れる/.test((await nextMarks(page))[0]), 'P5 on the first field the badge is 「ジム名を入れる」 (' + (await nextMarks(page)).join('|') + ')');
  await page.keyboard.type('フ');
  const m1 = await nextMarks(page);
  check(m1.length === 1 && /ジム名を入れる/.test(m1[0]) && !/直す/.test(m1[0]), 'P5 after the first character it is still 入れる, not 直す (' + m1.join('|') + ')');
  await page.keyboard.type('ラット');
  check(!/直す/.test((await nextMarks(page)).join('')), 'P5 after more characters it is still not 直す');
  await page.keyboard.press('Tab');
  check(/選手名を入れる/.test((await nextMarks(page))[0] || ''), 'P5 Tab moves the badge to the next field 選手名');
  // an EMPTY field that a failed press flagged red still says 入れる (nothing was written wrong)
  const ctxE = await newCtx(vp);
  const pe = await openApply(ctxE, hashFor({}));
  await reviewBtn(pe).click({ force: true }).catch(() => {});
  await settle(500);
  check(/ジム名を入れる/.test((await nextMarks(pe)).join('')) && !/直す/.test((await nextMarks(pe)).join('')), 'P5 after a failed press the empty first field still says 「ジム名を入れる」, not 直す (' + (await nextMarks(pe)).join('|') + ')');
  await ctxE.close();
  // a real mistake still says 直す
  await page.locator('#f-name').fill('架空選手');
  await page.locator('#f-height').fill('abc');
  await page.locator('#f-weight').click();
  await page.keyboard.press('Tab'); // the badge stays on the field that has the cursor; once the cursor leaves, it points at the wrong 身長
  await settle(250);
  check(/身長を直す/.test((await nextMarks(page)).join('')), 'P5 a really wrong 身長 shows 「身長を直す」 (' + (await nextMarks(page)).join('|') + ')');
  await ctx.close();
});

/* ───────────────────────── P6 r1-6: auto-fix notes must not eat the next tap ───────────────────────── */
await scenario('P6', 'a tap right after an auto-fixed field is not lost', [PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  for (const [name, fieldId, typed, fixed] of [['e-mail', 'f-contactEmail', 'ａ@b.com', 'a@b.com'], ['phone', 'f-contactPhone', '０９０－１２３４－５６７８', '09012345678'], ['height', 'f-height', '１７０ｃｍ', '170']]) {
    const page = await openApply(ctx, hashFor({}));
    await page.locator('#' + fieldId).fill(typed);
    const before = await page.locator('#f-consent').evaluate((e) => { e.scrollIntoView({ block: 'center' }); return e.getBoundingClientRect().top; });
    await page.locator('#' + fieldId).focus();
    // press the checkbox: the field loses focus at press time
    const box = await page.locator('#f-consent').boundingBox();
    await page.mouse.move(box.x + 8, box.y + 8);
    await page.mouse.down();
    await settle(150);
    const during = await page.locator('#f-consent').evaluate((e) => e.getBoundingClientRect().top);
    await page.mouse.up();
    await settle(400);
    check(await page.locator('#f-consent').isChecked(), 'P6 ' + name + ': the checkbox is checked by ONE tap right after the auto-fixed field');
    check(Math.abs(during - box.y) < 2, 'P6 ' + name + ': nothing moved under the finger while it was down (' + (during - box.y).toFixed(0) + 'px)');
    check((await val(page, '#' + fieldId)) === fixed, 'P6 ' + name + ': the value is still tidied afterwards (' + (await val(page, '#' + fieldId)) + ')');
    check((await greenLines(page)).some((x) => x.includes('自動で直しました')), 'P6 ' + name + ': the green ✓ 自動で直しました note appears after the tap');
    void before;
    await page.close();
  }
  await ctx.close();
});

/* ───────────────────────── P7 r1-7 / r1-84 / r1-117 / r1-141: e-mail ───────────────────────── */
await scenario('P7', 'e-mail: no silent gluing; clear red messages', [PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}));
  const tryMail = async (typed) => { await page.locator('#f-contactEmail').fill(typed); await page.locator('#f-contactEmail').blur(); await settle(200); return { v: await val(page, '#f-contactEmail'), red: (await redLines(page)).join(' | '), green: (await greenLines(page)).join(' | ') }; };
  for (const typed of ['a b@c.com', 'a@b.com c@d.com', 'a@b.com　c@d.com']) {
    const r = await tryMail(typed);
    check(r.v === typed.normalize('NFKC') || r.v === typed, 'P7 "' + typed + '" is NOT rewritten (' + r.v + ')');
    check(/途中に空白/.test(r.red), 'P7 "' + typed + '" gets the red 「メールアドレスの途中に空白があります」 (' + short(r.red, 80) + ')');
    check(!/自動で直しました/.test(r.green), 'P7 "' + typed + '" gets no green "fixed" note');
  }
  let r = await tryMail('  a@b.com  ');
  check(r.v === 'a@b.com' && !/途中/.test(r.red), 'P7 leading / trailing spaces are still removed quietly (' + r.v + ')');
  r = await tryMail('a@b.com, c@d.com');
  check(r.red !== '' && r.v.includes(' '), 'P7 two addresses with a comma are refused (' + short(r.red, 70) + ')');
  await page.close();
  await ctx.close();
});

/* ───────────────────────── P8 B4 / r1-12 / r1-117: phone numbers ───────────────────────── */
await scenario('P8', 'phone: nonsense numbers get a red message next to the field', [PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}));
  const tryTel = async (typed) => { await page.locator('#f-contactPhone').fill(typed); await page.locator('#f-contactPhone').blur(); await settle(150); return { v: await val(page, '#f-contactPhone'), red: (await redLines(page)).filter((x) => /電話|けた|数字|番号/.test(x)).join(' | '), green: (await greenLines(page)).join(' | ') }; };
  for (const typed of ['0000000000', '00000000000', '09000000000', '09011111111', '03-0000-0000', '050-0000-0000']) {
    const r = await tryTel(typed);
    check(/同じ数字/.test(r.red), 'P8 "' + typed + '" -> red 同じ数字がならんでいます (' + short(r.red, 70) + ')');
  }
  for (const typed of ['0120-123-456', '0800-123-456', '0120123456']) {
    const r = await tryTel(typed);
    check(/フリーダイヤル/.test(r.red) && !/携帯の電話番号は11けた/.test(r.red), 'P8 "' + typed + '" -> the free-dial message, not the mobile-digits message (' + short(r.red, 70) + ')');
  }
  for (const typed of ['09012345678 (母)', '090-1234-5678/080-1111-2222', '090-1234-5678 または 080-1111-2222']) {
    const r = await tryTel(typed);
    check(/1つだけ/.test(r.red), 'P8 "' + typed + '" -> red 「1つだけ、数字だけ」 (' + short(r.red, 70) + ')');
  }
  let r = await tryTel('090 1234 567');
  check(/11けた/.test(r.red) && !/自動で直しました/.test(r.green), 'P8 a short number shows the red digits message and NO green note next to it (' + short(r.red + ' / ' + r.green, 90) + ')');
  r = await tryTel('０９０－１２３４－５６７８');
  check(r.v === '09012345678' && r.red === '' && /自動で直しました/.test(r.green), 'P8 a good number typed full-width is tidied with a green note and no red');
  await page.close();
  await ctx.close();
});

/* ───────────────────────── P9 r1-13: height and weight swapped ───────────────────────── */
await scenario('P9', 'swapped height / weight: a yellow question, never a block', [PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}));
  await page.locator('#f-height').fill('55'); await page.locator('#f-weight').fill('170'); await page.locator('#f-weight').blur(); await settle(200);
  let y = (await yellowLines(page)).join(' | ');
  check(/身長と体重が、逆ではありませんか/.test(y) && /⚠/.test(y), 'P9 55 / 170 gets the yellow ⚠ 「身長と体重が、逆ではありませんか？」 (' + short(y, 90) + ')');
  check(!(await redLines(page)).some((x) => /身長|体重/.test(x)), 'P9 it is not red (it must not block)');
  await page.locator('#f-height').fill('170'); await page.locator('#f-weight').fill('65'); await page.locator('#f-weight').blur(); await settle(200);
  y = (await yellowLines(page)).join(' | ');
  check(!/逆ではありませんか/.test(y), 'P9 170 / 65 gets no such question');
  // and it does not stop the send
  await page.locator('#f-height').fill('55'); await page.locator('#f-weight').fill('170');
  await fillAll(page, { skip: ['身長（cm）必須', '体重（kg）必須'] });
  await reviewBtn(page).click();
  check(await page.getByRole('heading', { name: '送る前の確認', exact: true }).isVisible().catch(() => false), 'P9 the review screen still opens with 55 / 170');
  await ctx.close();
});

/* ───────────────────────── P10 r1-15: the "no signal" red line goes away when the signal is back ───────────────────────── */
await scenario('P10', 'offline message clears when back online', [PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}));
  await fillAll(page);
  await reviewBtn(page).click();
  await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor();
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await settle(200);
  await sendBtn(page).click({ force: true }).catch(() => {});
  await settle(300);
  check(/電波がありません/.test(await bodyText(page)), 'P10 offline: the red 電波がありません line shows');
  check(ctx.__posts.length === 0, 'P10 offline: nothing was sent');
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await settle(300);
  const t = await bodyText(page);
  check(!/送れません：電波がありません/.test(t), 'P10 back online: the old red line is gone (' + short((await redLines(page)).join('|'), 80) + ')');
  await ctx.close();
});

/* ───────────────────────── P11 r1-8: only the class (and consent) missing ───────────────────────── */
await scenario('P11', 'class missing: legend, badge and the red line are visible', [SMALL, PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}, DEFAULT_CLASS_SETTINGS));
  await fillAll(page, { consent: false });
  await reviewBtn(page).click();
  await settle(700);
  const geo = await page.evaluate(() => {
    const bar = document.getElementById('apply-msg'); const barBottom = bar ? bar.getBoundingClientRect().bottom : 0;
    const legend = document.querySelector('#f-fighterClass legend'); const err = document.getElementById('f-fighterClass-err');
    const badge = [...document.querySelectorAll('[data-tos-next] .tos-next-badge')][0];
    const r = (e) => (e ? e.getBoundingClientRect() : null);
    return { barBottom, vh: window.innerHeight, legend: r(legend) && { top: r(legend).top, bottom: r(legend).bottom }, err: r(err) && { top: r(err).top, bottom: r(err).bottom }, badge: r(badge) && { top: r(badge).top, bottom: r(badge).bottom }, legendBeforeCards: Boolean(err && legend && err.compareDocumentPosition(document.querySelector('#f-fighterClass label')) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  check(geo.legend && geo.legend.top >= geo.barBottom - 1 && geo.legend.bottom <= geo.vh, 'P11 ' + vp.width + 'px: the legend 「クラス 必須」 is on screen and not under the message bar (' + JSON.stringify(geo.legend) + ' bar ' + Math.round(geo.barBottom) + ')');
  check(geo.err && geo.err.bottom <= geo.vh && geo.err.top >= geo.barBottom - 1, 'P11 ' + vp.width + 'px: the red line 「クラスを選んでください」 is on screen (' + JSON.stringify(geo.err) + ')');
  check(geo.legendBeforeCards, 'P11 the red line sits above the two class cards (right under the legend)');
  check(geo.badge && geo.badge.top >= geo.barBottom - 1 && geo.badge.bottom <= geo.vh, 'P11 ' + vp.width + 'px: the yellow 👉 次はここ badge is on screen (' + JSON.stringify(geo.badge) + ')');
  if (vp.width <= 400) check(geo.barBottom / geo.vh <= 0.4, 'P11 the message bar is at most 40% of the screen (' + (geo.barBottom / geo.vh).toFixed(2) + ')');
  await ctx.close();
});

/* ───────────────────────── P12 r1-16 / r1-17 / r1-18 / r1-91 / r1-93 / r1-94 / r1-120: wording, marks, sizes ───────────────────────── */
await scenario('P12', 'wording, one 👉, 17px, pill', [SMALL, PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({ deadline: '2099-11-30' }, DEFAULT_CLASS_SETTINGS));
  const t = await bodyText(page);
  check((t.match(/👉/g) || []).length === 1, 'P12 exactly ONE 👉 on the screen (' + (t.match(/👉/g) || []).length + ')');
  check(/📍/.test(t) || vp.width >= 640, 'P12 the step bar uses 📍 いまここ');
  check(!/申込/.test(t), 'P12 one spelling: 申し込み, never 申込 (' + short((t.match(/.{6}申込.{6}/) || [''])[0], 40) + ')');
  check(!/読んでね|先に答えます|約3分で終わります）/.test(t), 'P12 no childish / odd phrases');
  check(/約3分で終わります/.test(t) && !/主催：[^\n]*約3分/.test(t), 'P12 「約3分で終わります」 is on its own line, not glued to the organiser');
  check(/条件とルールを読んで、合うほうを選んでください/.test(t) && !/自分で決めてかまいません/.test(t), 'P12 class hint reads 「条件とルールを読んで、合うほうを選んでください」');
  const pill = await page.evaluate(() => { const e = [...document.querySelectorAll('span')].find((x) => x.textContent.includes('⏰')); if (!e) return null; return parseFloat(getComputedStyle(e).borderTopLeftRadius); });
  check(pill !== null && pill <= 24, 'P12 the deadline pill is not an egg (radius ' + pill + 'px)');
  const small = await page.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('main *')) {
      if (e.closest('.sr-only') || e.closest('[hidden]')) continue;
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const r = e.getBoundingClientRect(); if (r.width === 0) continue;
      const cs = getComputedStyle(e); if (cs.visibility === 'hidden') continue;
      const px = parseFloat(cs.fontSize);
      if (px < 16.99) out.push(e.tagName.toLowerCase() + ':' + px + ':' + e.textContent.trim().slice(0, 20));
    }
    return out;
  });
  check(small.length === 0, 'P12 every visible text is at least 17px (' + small.slice(0, 5).join(' | ') + ')');
  await page.locator('#f-email, #f-contactEmail').first().fill('taro@example.con');
  await page.locator('#f-contactEmail').blur();
  await settle(150);
  await reviewBtn(page).click();
  await settle(300);
  const all = await bodyText(page);
  check(!/先に答えます/.test(all), 'P12 the e-mail question no longer starts with 「先に答えます」');
  check(/「\.con」になっています。「\.com」ではありませんか/.test(all), 'P12 the e-mail question reads 「.con」になっています。「.com」ではありませんか？');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'P12 no sideways scroll');
  await ctx.close();
});

/* ───────────────────────── P13 r1-19 / r1-73 / r1-129 / r1-145: no JS, old browser, first paint ───────────────────────── */
await scenario('P13', 'noscript, old-browser note, no dark flash', [PHONE], async (vp) => {
  const ctx = await newCtx(vp, browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(base + '/apply/' + hashFor({}));
  await settle(300);
  const t = await bodyText(page);
  check(/JavaScript/.test(t) && /オン/.test(t) && /Chrome か Safari/.test(t), 'P13 with JavaScript off the parent reads what to do (' + short(t, 100) + ')');
  check(/⚠/.test(t), 'P13 the no-JS line carries ⚠ (not colour only)');
  await ctx.close();
  for (const path of ['/apply/', '/private/', '/private/setup/']) {
    const html = await (await fetch(base + path)).text();
    check(/<noscript/.test(html), 'P13 ' + path + ' has a <noscript> line');
  }
  // chunks that never load -> after 10 s the old-browser note appears; the page is light from the first paint
  const ctx2 = await newCtx(vp);
  await ctx2.route('**/_next/static/chunks/*.js', (route) => route.abort());
  const p2 = await ctx2.newPage();
  await p2.goto(base + '/apply/' + hashFor({}), { waitUntil: 'domcontentloaded' });
  const first = await p2.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor }));
  check(first.theme === 'light' && first.bg === 'rgb(238, 242, 248)', 'P13 /apply/ is light from the very first paint, no dark flash (' + JSON.stringify(first) + ')');
  await p2.getByText('ブラウザが古いかもしれません').first().waitFor({ timeout: 14000 }).catch(() => {});
  check(/ブラウザが古いかもしれません/.test(await bodyText(p2)) && /Chrome か、新しい Safari/.test(await bodyText(p2)), 'P13 stuck on 「よみこみ中…」 for 10 s -> the yellow ⚠ old-browser note appears');
  await ctx2.close();
});

/* ───────────────────────── P14 r1-121 / r1-122: focus ring, dialog focus ───────────────────────── */
await scenario('P14', 'focus ring on checkbox / summary; dialog returns focus', [DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}, DEFAULT_CLASS_SETTINGS));
  const ring = async (sel) => { await page.locator(sel).focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); return page.locator(sel).evaluate((e) => { const c = getComputedStyle(e); return { w: parseFloat(c.outlineWidth), style: c.outlineStyle, color: c.outlineColor }; }); };
  for (const sel of ['#f-consent', '#f-fighterClass input[value=upper]', '#privacy-fold summary']) {
    const o = await ring(sel);
    check(o.style !== 'none' && o.w >= 3 && o.color === 'rgb(67, 56, 202)', 'P14 ' + sel + ' shows the 4px indigo ring (' + JSON.stringify(o) + ')');
  }
  // the "another event" dialog: focus goes back to the field, Escape works from anywhere, it is described
  await page.locator('#f-gym').fill('架空ジム');
  await page.locator('#f-gym').focus();
  await page.evaluate((h) => { location.hash = h; }, hashFor({ eventId: 'other-event', title: '別の大会' }));
  await page.getByRole('alertdialog').waitFor();
  check(!!(await page.getByRole('alertdialog').getAttribute('aria-describedby')), 'P14 the dialog is described (aria-describedby)');
  check(await page.evaluate(() => /今のまま続ける/.test(document.activeElement.innerText)), 'P14 the safe button has the focus first');
  await page.evaluate(() => (document.activeElement).blur());
  await page.keyboard.press('Escape');
  await settle(200);
  check((await page.getByRole('alertdialog').count()) === 0, 'P14 Escape closes the dialog even when the focus is not inside it');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'f-gym'), 'P14 after closing, the focus is back in the field it came from');
  check((await val(page, '#f-gym')) === '架空ジム', 'P14 nothing typed was lost');
  await ctx.close();
});

/* ═══════════════════════════ ROUND 2 (fix-apply-r2) ═══════════════════════════ */

/* ───────────────────────── P15 r2-1 / r2-4 / r2-132: the class hint is right, and it sits ABOVE the two cards ───────────────────────── */
await scenario('P15', 'class hint: no wrong Aクラス for 週3-4回, and the hint is above the cards', [SMALL, PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}, DEFAULT_CLASS_SETTINGS));
  const rec = page.getByLabel('戦績 必須', { exact: true });
  const hint = async () => (await page.locator('#f-fighterClass-live').innerText()).replace(/\s+/g, ' ');
  for (const [text, want] of [['週3-4回練習しています。試合は初めてです', 'Bクラス'], ['空手3-4年', null], ['空手歴3-4年・初試合', 'Bクラス'], ['小学5-6年生', null], ['10-12歳', null], ['初試合（目標3勝）', null], ['初心者', 'Bクラス'], ['特になし', 'Bクラス']]) {
    await rec.fill(text); await rec.blur(); await settle(80);
    const h = await hint();
    check(!/Aクラスです/.test(h), 'P15 ' + JSON.stringify(text) + ' never suggests Aクラス (' + short(h, 60) + ')');
    if (want) check(h.includes('戦績からは、' + want + 'です'), 'P15 ' + JSON.stringify(text) + ' -> ' + want + ' (' + short(h, 60) + ')');
    else check(!h.includes('戦績からは、'), 'P15 ' + JSON.stringify(text) + ' -> no suggestion (' + short(h, 60) + ')');
  }
  // the condition words a parent copies are still read when they decide the class; the ones that do not decide give no hint
  for (const [text, want] of [['3勝以上', 'Aクラス'], ['2勝以下', 'Bクラス'], ['5勝以下', null], ['3勝を目指します', null]]) {
    await rec.fill(text); await rec.blur(); await settle(80);
    const h = await hint();
    if (want) check(h.includes('戦績からは、' + want + 'です'), 'P15 ' + JSON.stringify(text) + ' -> ' + want + ' (' + short(h, 60) + ')');
    else check(!h.includes('戦績からは、'), 'P15 ' + JSON.stringify(text) + ' -> no suggestion (' + short(h, 60) + ')');
  }
  // the yellow hint and the red line are above the first card; the red line shows when the choice differs
  await rec.fill('5勝2敗'); await rec.blur(); await settle(80);
  await page.locator('#f-fighterClass input[value=lower]').check({ force: true }); await settle(120);
  const pos = await page.evaluate(() => {
    const y = (e) => (e ? e.getBoundingClientRect().top + window.scrollY : null);
    const cardEl = document.querySelector('#f-fighterClass label');
    const yellow = [...document.querySelectorAll('#f-fighterClass-live .tos-caution')][0];
    const red = [...document.querySelectorAll('#f-fighterClass-live .tos-error')][0];
    return { card: y(cardEl), yellow: y(yellow), red: y(red), yellowText: yellow && yellow.innerText, redText: red && red.innerText };
  });
  check(pos.yellow !== null && pos.yellow < pos.card, 'P15 the yellow hint is above the first card (' + pos.yellow + ' < ' + pos.card + ')');
  check(pos.red !== null && pos.red < pos.card && /戦績と合っていますか/.test(pos.redText || ''), 'P15 the red 戦績と合っていますか line is above the first card');
  // the review screen has the button to pick the class again, next to the red line
  await fillAll(page, { over: { '戦績 必須': '5勝2敗' } });
  await page.locator('#f-fighterClass input[value=lower]').check({ force: true });
  await reviewBtn(page).click();
  await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor();
  const again = page.getByRole('button', { name: 'クラスを選び直す', exact: true });
  check((await again.count()) === 1, 'P15 the review screen has 「クラスを選び直す」 beside the red line');
  await again.click(); await settle(300);
  check(await page.evaluate(() => !document.querySelector('[aria-label="送る前の確認"]') && !!document.activeElement && (document.activeElement.id === 'f-fighterClass' || !!document.activeElement.closest('#f-fighterClass'))), 'P15 「クラスを選び直す」 goes back to the class box and focuses it');
  const seen = await page.evaluate(() => { const r = document.getElementById('f-fighterClass-live').getBoundingClientRect(); const bar = document.getElementById('apply-msg'); return { top: r.top, vh: window.innerHeight, bar: bar ? bar.getBoundingClientRect().bottom : 0 }; });
  check(seen.top >= seen.bar - 1 && seen.top < seen.vh - 60, 'P15 the class hint starts on screen, under the message bar (' + JSON.stringify(seen) + ')');
  await ctx.close();
});

/* ───────────────────────── P16 r2-2: invisible characters ───────────────────────── */
await scenario('P16', 'invisible characters pasted with a value are removed', [PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({ music: true }));
  const fillBlur = async (sel, v) => { await page.locator(sel).fill(v); await page.locator(sel).blur(); await settle(120); };
  await fillBlur('#f-contactPhone', '‪090-1234-5678‬');
  check((await val(page, '#f-contactPhone')) === '09012345678' && !(await redLines(page)).some((x) => /電話/.test(x)), 'P16 phone with U+202A/U+202C -> 09012345678, no red');
  await fillBlur('#f-contactPhone', '​09012345678');
  check((await val(page, '#f-contactPhone')) === '09012345678' && !(await redLines(page)).some((x) => /電話/.test(x)), 'P16 phone with a zero-width space -> clean, no red');
  await fillBlur('#f-contactEmail', '‪a@b.com‬');
  check((await val(page, '#f-contactEmail')) === 'a@b.com' && !(await redLines(page)).some((x) => /メール|日本語/.test(x)), 'P16 e-mail with U+202A/U+202C -> a@b.com, no "日本語は使えません"');
  await fillBlur('#f-height', '​170');
  check((await val(page, '#f-height')) === '170' && !(await redLines(page)).some((x) => /数字だけ/.test(x)), 'P16 height with a zero-width space -> 170, no red');
  await fillBlur('#f-weight', '‪60‬');
  check((await val(page, '#f-weight')) === '60', 'P16 weight with bidi marks -> 60');
  await fillBlur('#f-musicUrl', '​https://music.apple.com/jp/x');
  check((await val(page, '#f-musicUrl')) === 'https://music.apple.com/jp/x' && !(await redLines(page)).some((x) => /Apple Music/.test(x)), 'P16 music link with a zero-width space is cleaned');
  // a gym / name made only of zero-width spaces is EMPTY: the red "まだです" line, and nothing is sent
  await fillAll(page, { skip: ['ジム名 必須', '選手名 必須'], over: {} });
  await page.locator('#f-musicUrl').fill('https://music.apple.com/jp/x');
  await page.locator('#f-gym').fill('​'); await page.locator('#f-name').fill('​​');
  await reviewBtn(page).click(); await settle(300);
  const red = (await redLines(page)).join(' | ');
  check(/ジム名がまだです/.test(red) && /選手名がまだです/.test(red), 'P16 a gym / name of only U+200B counts as empty (' + short(red, 120) + ')');
  check(ctx.__posts.length === 0 && (await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 0, 'P16 and the review screen does not open');
  await page.locator('#f-gym').fill('​架空ジム'); await page.locator('#f-name').fill('架空選手​');
  await reviewBtn(page).click();
  await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor({ timeout: 5000 });
  await sendBtn(page).click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  const post = ctx.__posts[0];
  check(post && post.get('gym') === '架空ジム' && post.get('name') === '架空選手' && post.get('contactPhone') === '09012345678', 'P16 what is posted has no invisible characters (' + (post && [post.get('gym'), post.get('name'), post.get('contactPhone')].map((x) => JSON.stringify(x)).join(' ')) + ')');
  await ctx.close();
});

/* ───────────────────────── P17 r2-3 / r2-13: reopening the link after a send ───────────────────────── */
await scenario('P17', 'reopen after a send: yellow, both branches, no green', [PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}));
  await fillAll(page);
  await reviewBtn(page).click();
  await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor();
  check(/戻ると、入れた文字と写真が消えていることがあります/.test(await bodyText(page)), 'P17 the review screen says that going back may clear the form');
  await sendBtn(page).click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  const again = await openApply(ctx, hashFor({}));
  const t = await bodyText(again);
  check(/さっき、申し込みを送りました。/.test(t), 'P17 the banner is there');
  check(/受付番号の画面が出た方：申し込み済みです。同じ人を、もう一度送らないでください。/.test(t), 'P17 branch 1: receipt number appeared -> done, do not send again');
  check(/「送れませんでした」と出た方、何も出なかった方：入れた文字と写真は、消えています。最初から入れ直して、送ってください。/.test(t), 'P17 branch 2: failed -> typing is cleared, fill in again and send');
  const banner = await again.evaluate(() => { const e = [...document.querySelectorAll('.tos-caution')].find((x) => /さっき、申し込みを送りました/.test(x.innerText)); const okOne = [...document.querySelectorAll('.tos-ok')].some((x) => /さっき/.test(x.innerText)); return { yellow: !!e, green: okOne }; });
  check(banner.yellow && !banner.green, 'P17 the banner is a yellow caution, not a green ✓');
  check((await again.getByRole('button', { name: '別の選手を申し込む', exact: false }).count()) === 0 && !/別の選手を申し込む/.test(t), 'P17 the old name 「別の選手を申し込む」 is gone');
  await again.getByLabel('ジム名 必須', { exact: true }).fill('入力は消えない');
  await again.getByRole('button', { name: 'この表示を消す', exact: true }).click(); await settle(150);
  check(!/さっき、申し込みを送りました/.test(await bodyText(again)), 'P17 「この表示を消す」 hides the banner');
  check((await val(again, '#f-gym')) === '入力は消えない', 'P17 and it does NOT clear the form (that is 「別の人を申し込む」 only)');
  await ctx.close();
});

/* ───────────────────────── P18 r2-5 / r2-6 / r2-7 / r2-8 / r2-80: messages for phone, e-mail, music link ───────────────────────── */
await scenario('P18', 'phone / e-mail / link messages say what to DO and catch impossible values', [PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({ music: true }));
  const red = async (sel, v) => { await page.locator(sel).fill(v); await page.locator(sel).blur(); await settle(150); return (await redLines(page)).join(' | '); };
  let r = await red('#f-contactPhone', '09012345678(母)');
  check(/消してください/.test(r) && !/消します/.test(r), 'P18 phone with text: asks the parent to delete (no false promise 消します) (' + short(r, 90) + ')');
  r = await red('#f-contactPhone', '0800-123-456');
  check(/主催者がかけても、本人につながりません/.test(r) && !/電話がつながりません/.test(r), 'P18 free-dial: the real reason is told (' + short(r, 90) + ')');
  r = await red('#f-contactPhone', '00-1234-5678');
  check(/「00」で始まる番号は、使えません/.test(r) && (await greenLines(page)).length === 0, 'P18 00-1234-5678 -> red, and NO green 自動で直しました (' + short(r, 70) + ')');
  r = await red('#f-contactPhone', '01234567890');
  check(/11けたの番号は、携帯電話/.test(r), 'P18 01234567890 -> red (' + short(r, 70) + ')');
  for (const ok of ['09012345678', '03-1234-5678', '０８０－１２３４－５６７８']) { r = await red('#f-contactPhone', ok); check(!/電話番号は|けた|番号/.test(r), 'P18 ' + ok + ' is accepted (' + short(r, 60) + ')'); }
  for (const bad of ['<a@b.com>', '(a@b.com)', 'a@b.c', 'a@b..com', 'a@-b.com']) { r = await red('#f-contactEmail', bad); check(/メールアドレス/.test(r), 'P18 e-mail ' + bad + ' -> red (' + short(r, 60) + ')'); }
  for (const ok of ['a@b.com', 'taro..hanako@docomo.ne.jp', 'x.@ezweb.ne.jp']) { r = await red('#f-contactEmail', ok); check(!/メールアドレス/.test(r), 'P18 e-mail ' + ok + ' is accepted (' + short(r, 60) + ')'); }
  r = await red('#f-musicUrl', 'ＨＴＴＰＳ：／／ｍｕｓｉｃ．ａｐｐｌｅ．ｃｏｍ／ｊｐ／Album');
  check(!/Apple Music/.test(r) && (await val(page, '#f-musicUrl')) === 'https://music.apple.com/jp/Album', 'P18 upper-case / full-width scheme and host -> lower case, no red; the path keeps its case (' + (await val(page, '#f-musicUrl')) + ')');
  r = await red('#f-musicUrl', 'Https://Youtu.be/AbC');
  check(!/YouTube/.test(r) && (await val(page, '#f-musicUrl')) === 'https://youtu.be/AbC', 'P18 Https://Youtu.be/AbC -> https://youtu.be/AbC');
  for (const sel of ['#f-musicUrl', '#f-contactEmail', '#f-contactPhone']) {
    const a = await page.locator(sel).evaluate((e) => ({ c: e.getAttribute('autocapitalize'), k: e.getAttribute('autocorrect'), s: e.getAttribute('spellcheck') }));
    check(a.c === 'none' && a.k === 'off' && a.s === 'false', 'P18 ' + sel + ' has autocapitalize none / autocorrect off / spellcheck false (' + JSON.stringify(a) + ')');
  }
  await ctx.close();
});

/* ───────────────────────── P19 r2-10: offline on the review screen ───────────────────────── */
await scenario('P19', 'offline: no yellow frame on a locked button, honest message', [SMALL, PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}));
  await fillAll(page);
  await reviewBtn(page).click();
  await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor();
  check((await nextMarks(page)).length === 1, 'P19 online review: exactly one 👉 (' + (await nextMarks(page)).join('|') + ')');
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await settle(250);
  check((await nextMarks(page)).length === 0, 'P19 offline: NO yellow 👉 次はここ (the button is grey and locked) (' + (await nextMarks(page)).join('|') + ')');
  check(/🔒\s*電波がありません/.test(await bodyText(page)), 'P19 offline: the grey 🔒 reason is printed');
  await sendBtn(page).click({ force: true }).catch(() => {});
  await settle(250);
  const t = await bodyText(page);
  check(/送れません：電波がありません。まだ送っていません。電波のある場所で、もう一度押してください。/.test(t) && !/失敗：/.test(t), 'P19 tapping it says 送れません… まだ送っていません (not 失敗)');
  check(ctx.__posts.length === 0, 'P19 nothing was posted');
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await settle(250);
  check((await nextMarks(page)).length === 1, 'P19 back online: the yellow 👉 is back');
  await ctx.close();
});

/* ───────────────────────── P20 r2-11: after Back + a change, the read-over screen is not skipped ───────────────────────── */
await scenario('P20', 'bfcache: a changed form goes through the review screen', [PHONE], async (vp) => {
  const ctx = await newCtx(vp, bfBrowser);
  const page = await ctx.newPage();
  await page.goto(base + '/apply/' + hashFor({}));
  await page.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
  await fillAll(page);
  await reviewBtn(page).click();
  await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor();
  await sendBtn(page).click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  await page.goBack({ waitUntil: 'commit' });
  await page.getByText('受付番号の画面が出ましたか').first().waitFor({ timeout: 8000 });
  // change the PHONE (the thing the review screen exists to double-check)
  await page.locator('#f-contactPhone').fill('08099998888'); await page.locator('#f-gym').click();
  const label = (await page.locator('#f-submit').innerText()).trim();
  check(label === '入力内容を確認する →', 'P20 after a change the main button is 「入力内容を確認する →」 (' + label + ')');
  const n0 = ctx.__posts.length;
  await page.locator('#f-submit').click(); await settle(500);
  check(ctx.__posts.length === n0, 'P20 pressing it does NOT post (' + ctx.__posts.length + ' vs ' + n0 + ')');
  check((await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 1, 'P20 the review screen with the new phone opens');
  check(/08099998888/.test(await bodyText(page)), 'P20 the new phone is on that screen');
  await sendBtn(page).click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  const a = ctx.__posts[0].get('requestId'), b = ctx.__posts[ctx.__posts.length - 1].get('requestId');
  check(ctx.__posts.length === n0 + 1 && a !== b && ctx.__posts[ctx.__posts.length - 1].get('contactPhone') === '08099998888', 'P20 then it posts once, with a NEW request id and the new phone');
  await ctx.close();
});

/* ───────────────────────── P21 r2-12 / r2-14 / r2-15 / r2-16 / r2-93: wording and sizes ───────────────────────── */
await scenario('P21', 'photo error, weight hint, gym hint, map link, 使い道', [PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({ venueUrl: 'https://maps.app.goo.gl/abc' }));
  const fieldText = async (id) => (await page.locator('#' + id).innerText()).replace(/\s+/g, ' ');
  const weightBox = await page.locator('#f-weight').evaluate((e) => e.closest('[class*="relative"]').innerText.replace(/\s+/g, ' '));
  check((weightBox.match(/試合に出る体重/g) || []).length === 1, 'P21 the weight field says it once (' + short(weightBox, 100) + ')');
  check(/試合に出る体重（kg）です。わからない時は、今の体重を入れてください。/.test(weightBox), 'P21 the one weight sentence includes 「わからない時は、今の体重」');
  const gymBox = await page.locator('#f-gym').evaluate((e) => e.closest('[class*="relative"]').innerText.replace(/\s+/g, ' '));
  check(/通っていない時は「無所属」と入れてください/.test(gymBox), 'P21 the gym field says what to write with no gym (' + short(gymBox, 100) + ')');
  const link = page.locator('a', { hasText: '架空体育館' });
  const box = await link.boundingBox();
  check(box && box.height >= 44, 'P21 the map link is at least 44px tall (' + (box && box.height) + ')');
  await fillAll(page, { photo: false });
  await reviewBtn(page).click(); await settle(300);
  const photoBox = await page.locator('#f-photo-box').innerText();
  check(/上の「📷 写真をえらぶ（撮る・アルバムから）」を押してください。/.test(photoBox) && !/下の「/.test(photoBox), 'P21 the photo error names the exact button and says 上 (' + short(photoBox, 120) + ')');
  check(/📷 写真をえらぶ（撮る・アルバムから）/.test(photoBox), 'P21 and that button exists with exactly that name');
  const badge = (await nextMarks(page)).join(' | ');
  check(/写真をえらぶ/.test(badge) && !/写真を選ぶ/.test(badge), 'P21 the yellow badge says えらぶ (' + badge + ')');
  const t = await bodyText(page);
  check(/下の「使い道」と「困ったとき」も、読んでください/.test(t), 'P21 the sentence names 「使い道」');
  check((await page.locator('#privacy-fold summary').innerText()).includes('使い道'), 'P21 and a fold really is titled 使い道');
  await ctx.close();
});

/* ───────────────────────── P22 r2-17: keyboard focus after 「とじる」 ───────────────────────── */
await scenario('P22', 'closing the red bar keeps the keyboard in the form', [DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}));
  await reviewBtn(page).click(); await settle(400);
  const close = page.getByRole('button', { name: 'とじる', exact: true });
  check((await close.count()) === 1, 'P22 the red bar has 「とじる」');
  await close.focus(); await page.keyboard.press('Enter'); await settle(250);
  const where = await page.evaluate(() => { const a = document.activeElement; return { tag: a && a.tagName, id: a && a.id }; });
  check(where.tag !== 'BODY' && /^f-/.test(where.id), 'P22 after Enter on 「とじる」 the focus is in the first field with a problem (' + JSON.stringify(where) + ')');
  check((await close.count()) === 0, 'P22 and the bar is closed');
  await ctx.close();
});

/* ───────────────────────── P23 r2-104: forced colors (Windows High Contrast) ───────────────────────── */
await scenario('P23', 'forced-colors: a focused text field has a visible outline', [DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({ music: true, comment: 'optional' }));
  await page.emulateMedia({ forcedColors: 'active' });
  for (const sel of ['#f-name', '#f-contactEmail', '#f-comment', '#f-musicUrl']) {
    await page.locator(sel).focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await settle(60);
    const o = await page.locator(sel).evaluate((e) => { const c = getComputedStyle(e); return { style: c.outlineStyle, w: parseFloat(c.outlineWidth) }; });
    check(o.style !== 'none' && o.w >= 3, 'P23 ' + sel + ' shows an outline in forced-colors (' + JSON.stringify(o) + ')');
  }
  await ctx.close();
});

/* ───────────────────────── P24 r2-115 / r2-122: static title, dvh, no hydration error on a browser without randomUUID ───────────────────────── */
await scenario('P24', 'static title of /apply/, min-height rule order, old-browser /private/ without a React error', [PHONE], async (vp) => {
  const html = await (await fetch(base + '/apply/')).text();
  check(/<title>大会の申し込み<\/title>/.test(html), 'P24 /apply/ static HTML has the title 大会の申し込み (' + short((html.match(/<title>[^<]*<\/title>/) || [''])[0], 60) + ')');
  check(/name="description" content="選手の申し込みページです。"/.test(html), 'P24 and a Japanese description');
  check(/name="robots" content="noindex/.test(html), 'P24 and noindex is kept');
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({}));
  const mh = await page.evaluate(() => { const m = document.querySelector('main.tos-apply'); return { px: parseFloat(getComputedStyle(m).minHeight), h: window.innerHeight }; });
  check(Math.abs(mh.px - mh.h) < 2, 'P24 the apply page min-height follows the visible height (dvh wins over vh) (' + JSON.stringify(mh) + ')');
  const cls = await page.evaluate(() => document.querySelector('main.tos-apply').className);
  check(/\bmin-h-screen\b/.test(cls), 'P24 the main keeps min-h-screen (100vh) as the fallback for a browser that cannot read dvh');
  await ctx.close();
  const old = await newCtx(vp);
  const p2 = await old.newPage();
  const errs = [];
  p2.on('pageerror', (e) => errs.push(e.message));
  p2.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p2.addInitScript(() => { try { Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true }); } catch { /* */ } });
  await p2.goto(base + '/private/?event=oldx1'); await settle(1500);
  check(/ブラウザが古い|Chrome/.test(await bodyText(p2)), 'P24 a browser without randomUUID sees the old-browser page');
  check(!errs.some((m) => /418|425|423|[Hh]ydrat/.test(m)), 'P24 and there is no React hydration error (' + short(errs.join(' | '), 120) + ')');
  await old.close();
});

/* ───────────────────────── P25 r2-22: a date pasted with a time is NOT turned into a different date ───────────────────────── */
await scenario('P25', 'date + time pasted into 開催日 stays as typed and shows the red message', [DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await ctx.newPage();
  attach(page);
  await page.goto(base + '/private/?event=date-r2-22');
  await page.locator('#field-date').waitFor({ timeout: 15000 });
  for (const typed of ['2027/10/3 10:00', '2027年10月3日(日) 10:00', '2027-10-3 12:30', '2027/1/2 10:00']) {
    await page.locator('#field-date').fill(typed); await page.locator('#field-date').blur(); await settle(200);
    const v = await val(page, '#field-date');
    const t = await bodyText(page);
    check(v === typed && !/自動で直しました[^\n]*年\d+月\d+日/.test(t), 'P25 "' + typed + '" is not rewritten (' + v + ')');
  }
  await page.locator('#field-date').fill('2027年10月3日(日)'); await page.locator('#field-date').blur(); await settle(200);
  check((await val(page, '#field-date')) === '2027年10月3日', 'P25 a plain date with a weekday is still read');
  await ctx.close();
});

/* ───────────────────────── P26 r2-34: keyboard focus after 消す / 直す on the prep screen ───────────────────────── */
await scenario('P26', 'focus is not lost after removing a bout / a fighter or saving an edit', [DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await ctx.newPage();
  attach(page);
  await page.goto(base + '/private/?event=focus-r2-34');
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  const HEAD = '管理番号,ジム名,選手名,学年,年齢,身長,体重,戦績・競技歴,試合への意気込み,入場曲URL（Apple Music推奨）';
  const csv = [HEAD, ...[1, 2, 3, 4].map((n) => `"F${n}","架空${n}ジム","架空${n}選手","中1","13","155","60","初試合","",""`)].join('\n');
  await page.locator('#pick-file').setInputFiles({ name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await settle(900);
  const active = () => page.evaluate(() => { const a = document.activeElement; return { tag: a && a.tagName, id: (a && a.id) || '' }; });
  // a bout: add, then remove it with the keyboard
  await page.getByRole('button', { name: '＋ 試合を追加', exact: true }).click(); await settle(300);
  const rm = page.getByRole('button', { name: /^この試合を消す/ }).first();
  if ((await rm.count()) === 0) note('no 「この試合を消す」 button found; the bout check is skipped'); else {
    await rm.focus(); await page.keyboard.press('Enter'); await settle(500);
    const a = await active();
    check(a.tag !== 'BODY', 'P26 after removing a bout the focus is not on <body> (' + JSON.stringify(a) + ')');
  }
  // a fighter: 消す -> ✕ 消す（もどせません）
  const del = page.getByRole('button', { name: '消す 架空4選手', exact: true });
  await del.scrollIntoViewIfNeeded().catch(() => {});
  if ((await del.count()) === 0) { const fold = page.locator('summary', { hasText: '選手の一覧' }); if (await fold.count()) await fold.first().click(); await settle(200); }
  await del.focus(); await page.keyboard.press('Enter'); await settle(300);
  await page.getByRole('button', { name: '✕ 消す（もどせません）', exact: true }).focus(); await page.keyboard.press('Enter'); await settle(500);
  const b = await active();
  check(b.id === 'fighter-note', 'P26 after removing a fighter the focus is on the green result line (' + JSON.stringify(b) + ')');
  // an edit: 直す -> change weight -> この内容で直す
  const edit = page.getByRole('button', { name: '直す 架空3選手', exact: true });
  await edit.focus(); await page.keyboard.press('Enter'); await settle(400);
  const w = page.locator('[id^="edit-"][id$="-weight"]').first();
  await w.fill('61'); await w.blur();
  await page.getByRole('button', { name: 'この内容で直す', exact: true }).focus(); await page.keyboard.press('Enter'); await settle(500);
  const c = await active();
  check(/^edit-note-/.test(c.id), 'P26 after 「この内容で直す」 the focus is on the "直しました" line (' + JSON.stringify(c) + ')');
  await ctx.close();
});

/* ───────────────────────── done ───────────────────────── */
await settle(100);
for (const e of externals) failures.push('[' + e.scenario + '] EXTERNAL request attempted: ' + e.method + ' ' + e.url);
for (const e of pageErrors) failures.push('[' + e.scenario + '] page error: ' + short(e.message, 200));
const nonLocal = net.filter((n) => !n.url.startsWith(base + '/') && n.url !== ENDPOINT && !n.url.startsWith('data:'));
for (const n of nonLocal) failures.push('[' + n.scenario + '] network request left the app: ' + n.method + ' ' + n.url);
await browser.close();
await bfBrowser.close();
console.log('\n' + checks + ' checks, ' + failures.length + ' failed.');
for (const f of failures) console.log(' - ' + f);
process.exit(failures.length ? 1 : 0);
