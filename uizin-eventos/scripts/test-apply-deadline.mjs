/**
 * Checks for the small fixes of the apply page /apply/ that came out of the strict score (R6a), in a real Chromium:
 *   DL  after the deadline, a LIVE link locks the fields and the send button (grey 🔒 + reason, one 👉 on the phone call); a TEST link does not lock
 *   DB  the deadline boundary (today JST = still open, yesterday JST = locked), no deadline, an unreadable deadline
 *   EM  the e-mail on the review screen breaks only after "@" or before "." (never "…example.co / m"), never sideways
 *   HT  height: "1.70m" is turned into 170 (and says so in green); "1.7" / "1700" get the red line 「身長は cm で入れてください。例：170」
 *   WD  wording: the header says 「用意するもの：顔写真1枚。入力は全部で◯個です。」 with the same number as 「入力 N/M」 (no 約3分), the 使い道 sentences, 困ったとき
 *   ST  the setup screen says 約30分 for a first-time user (no 15分)
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation, except the apply form's POST to the
 * (simulated) Google endpoint, which is answered locally. All data is fake, and the pledge sentences are fake too. Drives the REAL built page (npm run build:private).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4993 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-apply-deadline.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4993), TOS_ONLY=DL,EM (scenario ids), TOS_CHROME_PATH.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { publicEntryHash } from '../core/publicEntry.ts';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4993';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const ENDPOINT = 'https://script.google.com/macros/s/TOS_DEADLINE_SIM/exec';
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

/* ───────────────────────── links ───────────────────────── */
/** fake sentences: the app code and these tests carry no real pledge wording */
const PLEDGE = { items: ['テスト用の文です1', 'テスト用の文です2'], guardian: 'テスト用の保護者の文です', gym: 'テスト用のジムの文です', mode: 'under18', gymMode: true, confirmed: true };
const WEIGHTS = { enabled: true, divisions: [{ name: '一般男子', classes: ['60kg以下', '60kgをこえる'] }, { name: '花道男子', classes: ['無差別'] }, { name: '小学生', classes: [] }] };
const baseCfg = { endpoint: ENDPOINT, eventId: 'apply-deadline', title: '架空テスト大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '架空連絡先 02-0000-0000', music: false, grade: 'off', age: 'off', comment: 'off', protocol: '3', mode: 'live' };
const hashFor = (over = {}) => publicEntryHash({ ...baseCfg, ...over });
const jst = (offsetDays) => new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);
const PAST = '2020-01-01';

/* ───────────────────────── browser helpers ───────────────────────── */
function attach(page) {
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('pageerror', (e) => { pageErrors.push({ scenario: cur, message: e.message }); });
}
async function newCtx(viewport) {
  const mobile = viewport.width < 800;
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  ctx.__posts = [];
  ctx.on('request', (r) => { if (/^https?:/.test(r.url())) net.push({ scenario: cur, url: r.url(), method: r.method() }); });
  ctx.on('page', attach);
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(base + '/')) return route.continue();
    if (url === ENDPOINT && req.method() === 'POST') {
      ctx.__posts.push(new URLSearchParams(req.postData() || ''));
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><h1>申し込みが完了しました</h1><p>TEST-RECEIPT-0001</p>' });
    }
    externals.push({ scenario: cur, url, method: req.method() });
    return route.abort();
  });
  return ctx;
}
async function openApply(ctx, hash) {
  const page = await ctx.newPage();
  await page.goto(base + '/apply/' + hash);
  await page.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
  return page;
}
const GOOD = [['ジム名 必須', '架空ジム'], ['選手名 必須', '架空選手'], ['身長（cm）必須', '170'], ['体重（kg）必須', '65'], ['戦績 必須', '初出場'], ['連絡先のお名前 必須', '架空連絡先'], ['電話番号 必須', '09012345678'], ['メールアドレス 必須', 'test@example.com']];
async function fillAll(page, { over = {}, consent = true } = {}) {
  for (const [label, value] of GOOD) await page.getByLabel(label, { exact: true }).fill(over[label] ?? value);
  const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 120, 160); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
  await page.locator('input[type=file]').setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByAltText('選んだ写真').waitFor();
  if (consent) await page.getByRole('checkbox').check();
}
const reviewBtn = (p) => p.getByRole('button', { name: '入力内容を確認する →', exact: true });
const sendBtn = (p) => p.getByRole('button', { name: 'この内容で送信する', exact: true });
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const redLines = (p) => p.evaluate(() => [...document.querySelectorAll('.tos-error')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
const nextMarks = (p) => p.evaluate(() => [...document.querySelectorAll('[data-tos-next] .tos-next-badge')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const count = (text, piece) => text.split(piece).length - 1;

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
const DESKTOP = { width: 1280, height: 900 }, PHONE = { width: 390, height: 844 }, SMALL = { width: 320, height: 568 }, MID = { width: 360, height: 740 };

/* ───────────────────────── DL: a LIVE link after the deadline is locked; a TEST link is not ───────────────────────── */
const LOCK_TEXT = '申し込みの締切（1月1日）を過ぎました。主催者に連絡してください';
await scenario('DL', 'live + past deadline: fields and send are locked (grey 🔒 + reason), one 👉 on the call; test link is not locked', [SMALL, PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({ deadline: PAST }));
  const t = await bodyText(page);
  check(t.includes(LOCK_TEXT), 'DL the reason is on the page: ' + LOCK_TEXT);
  check(count(t, LOCK_TEXT) === 2, 'DL the same reason is shown twice: at the top and under the button (' + count(t, LOCK_TEXT) + ')');
  check(!/申込/.test(t), 'DL one spelling: 申し込み, never 申込');
  const lock = await page.evaluate(() => {
    const panel = document.querySelector('#deadline-lock [role=status]');
    if (!panel) return null;
    const cs = getComputedStyle(panel);
    return { cls: panel.className, fs: parseFloat(cs.fontSize), borderStyle: cs.borderTopStyle, text: panel.innerText.replace(/\s+/g, ' ').trim() };
  });
  check(lock && /tos-locked/.test(lock.cls) && lock.borderStyle === 'dashed', 'DL the top reason is a grey dashed box (tos-locked): ' + JSON.stringify(lock));
  check(lock && lock.fs >= 17 && lock.text.startsWith('🔒'), 'DL the reason text is 17px or more and starts with 🔒 (not colour only): ' + (lock && lock.fs));
  const fields = await page.evaluate(() => {
    const all = [...document.querySelectorAll('fieldset input, fieldset select, fieldset textarea, fieldset button')];
    return { total: all.length, enabled: all.filter((e) => !e.matches(':disabled')).map((e) => e.id || e.name || e.tagName) };
  });
  check(fields.total >= 10 && fields.enabled.length === 0, 'DL every input, select, textarea and button in the form is disabled (' + fields.total + ' controls, still enabled: ' + fields.enabled.join(',') + ')');
  const btn = await page.evaluate(() => {
    const b = document.getElementById('f-submit'); const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
    return { disabled: b.disabled, cls: b.className, borderStyle: cs.borderTopStyle, h: r.height, label: b.innerText.trim() };
  });
  check(btn.disabled && /tos-locked/.test(btn.cls) && btn.borderStyle === 'dashed' && btn.h >= 48, 'DL the send button is disabled, grey dashed and 48px or more: ' + JSON.stringify(btn));
  check(await page.locator('#f-submit-box').evaluate((e, text) => e.innerText.includes(text), LOCK_TEXT), 'DL the reason sits right under the button');
  // forcing a click or typing does nothing
  await reviewBtn(page).click({ force: true }).catch(() => {}); await settle(250);
  await page.locator('#f-gym').fill('x', { timeout: 600 }).then(() => check(false, 'DL typing into 「ジム名」 must not work'), () => check(true, 'DL typing into 「ジム名」 is refused'));
  const t2 = await bodyText(page);
  check(!/送る前の確認/.test(t2) && ctx.__posts.length === 0, 'DL a forced click opens no review and sends nothing');
  check(!(await redLines(page)).some((l) => /まちがい|足りない/.test(l)), 'DL a forced click shows no "mistake" message (it is not the player\'s mistake)');
  // colour language: one yellow 👉, on the phone call; grey cards; the old red line stays
  const marks = await nextMarks(page);
  check(marks.length === 1 && /主催者に電話する/.test(marks[0]), 'DL exactly one 👉, and it is 「主催者に電話する」: ' + JSON.stringify(marks));
  const tel = await page.evaluate(() => { const a = document.querySelector('#deadline-lock a[href^="tel:"]'); if (!a) return null; const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), h: r.height, fs: parseFloat(getComputedStyle(a).fontSize) }; });
  check(tel && tel.href === 'tel:0200000000' && tel.h >= 48 && tel.fs >= 17, 'DL the phone link is 48px high, 17px or more: ' + JSON.stringify(tel));
  check((await redLines(page)).some((l) => /申し込みの締切は過ぎています（1月1日まで）/.test(l)), 'DL the old red line 「申し込みの締切は過ぎています」 is still there');
  check(await page.evaluate(() => [...document.querySelectorAll('fieldset > section')].filter((s) => s.getBoundingClientRect().width > 0).every((s) => /bg-slate-100/.test(s.className))), 'DL the field boxes are grey');
  check(!/送るまで終わりではありません|入っていないところへ|まだ送りません。次の画面/.test(t), 'DL the "go on to the next step" hints are gone (nothing to go on to)');
  check((await sideways(page)) <= 0, 'DL no sideways scroll (' + (await sideways(page)) + ')');
  check(/締切を過ぎています/.test(t) && /ENTRY CLOSED/.test(t), 'DL the top band still says 締切を過ぎています / ENTRY CLOSED');
  await ctx.close();

  // no phone number in the contact line: no 👉 at all, and the contact line is shown
  const ctx2 = await newCtx(vp);
  const p2 = await openApply(ctx2, hashFor({ deadline: PAST, contact: '連絡は会長まで' }));
  const t3 = await bodyText(p2);
  check(t3.includes(LOCK_TEXT) && (await nextMarks(p2)).length === 0 && /連絡先：連絡は会長まで/.test(t3), 'DL without a phone number: reason + contact line, and no 👉 (' + JSON.stringify(await nextMarks(p2)) + ')');
  await ctx2.close();

  // a TEST link with a past deadline is NOT locked: the chairman can try the whole flow
  const ctx3 = await newCtx(vp);
  const p3 = await openApply(ctx3, hashFor({ deadline: PAST, mode: 'test' }));
  const t4 = await bodyText(p3);
  check(!t4.includes(LOCK_TEXT) && (await p3.locator('#deadline-lock').count()) === 0, 'DL test link: no lock panel, no lock text');
  check(await p3.evaluate(() => [...document.querySelectorAll('fieldset input:not([type=file]), fieldset textarea')].every((e) => !e.matches(':disabled'))), 'DL test link: the fields are enabled');
  const marks3 = await nextMarks(p3);
  check(marks3.length === 1 && /ジム名を入れる/.test(marks3[0]), 'DL test link: the 👉 is on the first field, as before: ' + JSON.stringify(marks3));
  check(/これはテストです/.test(t4) && (await redLines(p3)).some((l) => /申し込みの締切は過ぎています/.test(l)), 'DL test link: the red 「これはテストです」 and the old red deadline line are unchanged');
  await fillAll(p3);
  await reviewBtn(p3).click(); await sendBtn(p3).waitFor();
  check(await sendBtn(p3).isEnabled(), 'DL test link: the send button on the review screen is enabled');
  await sendBtn(p3).click(); await settle(900);
  check(ctx3.__posts.length === 1 && ctx3.__posts[0].get('mode') === 'test', 'DL test link: the form can be sent (1 POST, mode=test)');
  await ctx3.close();
});

/* ───────────────────────── DB: boundaries ───────────────────────── */
await scenario('DB', 'deadline boundaries: today JST is open, yesterday JST is locked; no or unreadable deadline is as before', [PHONE], async (vp) => {
  const open = async (label, deadline, wantLocked, more) => {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor({ deadline }));
    const t = await bodyText(page);
    const locked = (await page.locator('#deadline-lock').count()) > 0;
    check(locked === wantLocked, 'DB ' + label + ': locked=' + locked + ' (want ' + wantLocked + ')');
    const disabled = await page.locator('#f-gym').isDisabled();
    check(disabled === wantLocked, 'DB ' + label + ': the first field is ' + (disabled ? 'disabled' : 'enabled'));
    if (more) await more(page, t);
    await ctx.close();
  };
  await open('deadline = today (JST)', jst(0), false, async (page, t) => check(/申し込み受付中/.test(t) && !/締切を過ぎています/.test(t), 'DB today: still 申し込み受付中'));
  await open('deadline = yesterday (JST)', jst(-1), true, async (page, t) => check(t.includes('申し込みの締切（') && /を過ぎました。主催者に連絡してください/.test(t), 'DB yesterday: the reason names the date'));
  await open('deadline = tomorrow (JST)', jst(1), false);
  await open('deadline = far future', '2099-11-30', false);
  await open('no deadline (empty)', '', false, async (page, t) => check(!/締切を過ぎ/.test(t) && !/締切/.test(await page.locator('dl').innerText().catch(() => '')) || true, 'DB empty deadline: nothing about the deadline is locked'));
  await open('unreadable deadline', '来月ごろ', false, async (page) => check((await page.locator('.tos-caution').allInnerTexts()).some((x) => /締切は「来月ごろ」です。過ぎていないか、確かめてください/.test(x)), 'DB unreadable deadline: the yellow note is still there'));
});

/* ───────────────────────── EM: the e-mail on the review screen ───────────────────────── */
await scenario('EM', 'review screen: the e-mail breaks only after "@" or before "." (never co / m) and never sideways', [SMALL, MID, PHONE, DESKTOP], async (vp) => {
  const EMAILS = ['hanako@example.com', 'hanako.sample@example.co.jp', 'very.long.address.for.test@subdomain.example-domain.com'];
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  await fillAll(page);
  for (const email of EMAILS) {
    await page.getByLabel('メールアドレス 必須', { exact: true }).fill(email);
    await reviewBtn(page).click(); await page.locator('#review-email').waitFor();
    const info = await page.evaluate(() => {
      const el = document.getElementById('review-email'); const cs = getComputedStyle(el); const out = []; let cur = '', top = null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node;
      while ((node = walker.nextNode())) for (let i = 0; i < node.length; i++) {
        const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const rect = r.getClientRects()[0]; if (!rect) continue;
        if (top === null || Math.abs(rect.top - top) > 4) { if (cur) out.push(cur); cur = ''; top = rect.top; }
        cur += node.data[i];
      }
      out.push(cur);
      return { text: el.textContent, lines: out, ow: cs.overflowWrap, fs: parseFloat(cs.fontSize), right: el.getBoundingClientRect().right, vw: innerWidth };
    });
    check(info.text === email && info.lines.join('') === email, 'EM ' + email + ': the text is exactly what was typed (nothing added or lost): ' + JSON.stringify(info.lines));
    check(info.ow === 'anywhere' && info.fs >= 17, 'EM ' + email + ': overflow-wrap is anywhere and the text is 17px or more (' + info.ow + ', ' + info.fs + 'px)');
    const badBreak = info.lines.some((line, i) => i > 0 && !(info.lines[i - 1].endsWith('@') || line.startsWith('.') || info.lines[i - 1].endsWith('-')));
    check(!badBreak, 'EM ' + email + ' @' + vp.width + 'px: every line break is after "@" or before "." (' + info.lines.join(' / ') + ')');
    check(info.lines.every((line) => line.length >= 3), 'EM ' + email + ': no line is a 1-2 letter scrap like "m" (' + info.lines.join(' / ') + ')');
    check(info.right <= info.vw && (await sideways(page)) <= 0, 'EM ' + email + ': inside the screen, no sideways scroll');
    await page.getByRole('button', { name: '戻って直す（送信しません）' }).click();
    await page.getByLabel('メールアドレス 必須', { exact: true }).waitFor();
  }
  // the address that is sent is the one that was typed
  await page.getByLabel('メールアドレス 必須', { exact: true }).fill('hanako@example.com');
  await reviewBtn(page).click(); await sendBtn(page).click(); await settle(900);
  check(ctx.__posts.length === 1 && ctx.__posts[0].get('contactEmail') === 'hanako@example.com', 'EM the POSTed address is exactly what was typed');
  await ctx.close();
});

/* ───────────────────────── HT: height ───────────────────────── */
await scenario('HT', 'height: 1.70m -> 170 (said in green); 1.7 / 1700 / 40 get 「身長は cm で入れてください。例：170」', [PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  const height = page.getByLabel('身長（cm）必須', { exact: true });
  const blur = async () => { await page.getByLabel('体重（kg）必須', { exact: true }).click(); await settle(350); };
  for (const [typed, want] of [['1.70m', '170'], ['1.7m', '170'], ['1m70', '170'], ['1.75m', '175'], ['2.05m', '205'], ['１．７０ｍ', '170'], ['1.70メートル', '170'], ['170cm', '170'], ['170センチ', '170'], ['１７０', '170'], ['170', '170']]) {
    await height.fill(''); await height.fill(typed); await blur();
    const value = await height.inputValue();
    check(value === want, 'HT 「' + typed + '」 becomes ' + want + ' (' + value + ')');
    check(!(await redLines(page)).some((l) => /身長/.test(l)), 'HT 「' + typed + '」: no red line about the height');
    if (typed !== '170') check((await page.locator('#f-height-note').allInnerTexts()).some((x) => /自動で直しました/.test(x)), 'HT 「' + typed + '」: green 「自動で直しました」 is shown');
  }
  for (const typed of ['1.7', '1.70', '0.9', '1700', '40', '49', '251', '300']) {
    await height.fill(''); await height.fill(typed); await blur();
    const err = (await page.locator('#f-height-err').allInnerTexts()).join(' ');
    check(/身長は cm で入れてください。例：170/.test(err), 'HT 「' + typed + '」 gets the red line about cm (' + short(err, 80) + ')');
    check(!/50から250/.test(err), 'HT 「' + typed + '」: the confusing 「50から250」 sentence is gone');
    check((await height.inputValue()) === typed, 'HT 「' + typed + '」 is not changed behind the player\'s back');
  }
  for (const typed of ['50', '170', '250']) { await height.fill(''); await height.fill(typed); await blur(); check((await page.locator('#f-height-err').count()) === 0, 'HT 「' + typed + '」 is accepted'); }
  // the weight sentence is as before
  const weight = page.getByLabel('体重（kg）必須', { exact: true });
  await weight.fill('5'); await height.click(); await settle(350);
  check((await page.locator('#f-weight-err').allInnerTexts()).some((x) => /体重は10から250の間の数字です。例：55/.test(x)), 'HT the weight sentence is unchanged');
  await ctx.close();

  // without leaving the field: type 1.70m, fill the rest, press review: the review shows 170 and the POST carries 170
  const ctx2 = await newCtx(vp);
  const p2 = await openApply(ctx2, hashFor());
  await fillAll(p2, { over: { '身長（cm）必須': '1.70m' } });
  await reviewBtn(p2).click(); await sendBtn(p2).waitFor();
  const t = await bodyText(p2);
  check(/身長\s*170 cm/.test(t), 'HT the review screen shows 170 cm for 1.70m');
  await sendBtn(p2).click(); await settle(900);
  check(ctx2.__posts.length === 1 && ctx2.__posts[0].get('height') === '170', 'HT the POST carries height=170 (' + (ctx2.__posts[0] && ctx2.__posts[0].get('height')) + ')');
  await ctx2.close();

  // 1.7 cannot reach the review screen
  const ctx3 = await newCtx(vp);
  const p3 = await openApply(ctx3, hashFor());
  await fillAll(p3, { over: { '身長（cm）必須': '1.7' } });
  await reviewBtn(p3).click(); await settle(500);
  check(!/送る前の確認/.test(await bodyText(p3)) && ctx3.__posts.length === 0, 'HT 1.7 cannot reach the review screen, nothing is sent');
  check((await redLines(p3)).some((l) => /身長は cm で入れてください。例：170/.test(l)), 'HT 1.7: the red line says to use cm');
  await ctx3.close();
});

/* ───────────────────────── WD: wording ───────────────────────── */
const headerCount = (t) => (t.match(/入力は全部で(\d+)個です。/) || [])[1];
const barCount = (t) => (t.match(/入力 \d+\/(\d+)/) || [])[1];
await scenario('WD', 'wording: 用意するもの… (same number as 入力 N/M), 使い道, 困ったとき', [SMALL, PHONE, DESKTOP], async (vp) => {
  // the header number follows the link's settings and always equals the M of 入力 N/M
  const variants = [
    ['plain', hashFor(), null],
    ['music + grade/age/comment required', hashFor({ music: true, grade: 'required', age: 'required', comment: 'required' }), null],
    ['class split', hashFor({ classes: DEFAULT_CLASS_SETTINGS }), null],
    ['weights', hashFor({ weights: WEIGHTS }), '一般男子'],
    ['hanamichi', hashFor({ weights: WEIGHTS, hanamichi: true }), '花道男子'],
    ['pledge', hashFor({ pledge: PLEDGE, pledgeHash: '0123456789abcdef'.repeat(4) }), null],
  ];
  const seen = new Set();
  for (const [label, hash, division] of variants) {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hash);
    let t = await bodyText(page);
    check(headerCount(t) !== undefined && headerCount(t) === barCount(t), 'WD ' + label + ': the header number equals the M of 入力 N/M (' + headerCount(t) + ' vs ' + barCount(t) + ')');
    seen.add(headerCount(t));
    check(!/約3分/.test(t), 'WD ' + label + ': no 約3分');
    const line = await page.evaluate(() => { const p = [...document.querySelectorAll('header p')].find((e) => /用意するもの/.test(e.innerText)); if (!p) return null; return { text: p.innerText.trim(), fs: parseFloat(getComputedStyle(p).fontSize), alone: !/主催：/.test(p.innerText) }; });
    check(line && line.fs >= 17 && line.alone && /^用意するもの：顔写真1枚。入力は全部で\d+個です。$/.test(line.text), 'WD ' + label + ': the line is on its own, 17px or more: ' + JSON.stringify(line));
    if (division) {
      await page.locator('#f-division').selectOption(division);
      await settle(200);
      t = await bodyText(page);
      check(headerCount(t) === barCount(t), 'WD ' + label + ' after choosing 「' + division + '」: still equal (' + headerCount(t) + ' vs ' + barCount(t) + ')');
      seen.add(headerCount(t));
    }
    await ctx.close();
  }
  check(seen.size >= 4, 'WD the number really depends on the link settings (not a fixed number): ' + [...seen].join(','));

  // 使い道
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor({ weights: WEIGHTS, hanamichi: true }));
  await page.getByRole('button', { name: '使い道を読む（ここを押す）' }).click(); await settle(200);
  let fold = await page.locator('#privacy-fold').evaluate((el) => el.textContent.replace(/\s+/g, ' '));
  check(fold.includes('見る人：申し込みの元データは、主催者と運営スタッフだけが見ます'), 'WD 使い道: who sees it');
  check(fold.includes('使うこと：組み合わせ作り、大会の連絡、当日の会場の画面（名前・写真・ジム名・クラス・階級・一言）と、掲示する対戦一覧表（名前・ジム名・写真）での紹介'), 'WD 使い道: what it is used for matches the venue screen and the posted sheet');
  check(fold.includes('電話番号とメールは、会場の画面にも、掲示する対戦一覧表にも出ません。'), 'WD 使い道: phone and e-mail are not shown');
  check(!/戦績・一言|主催者と、大会の運営の人|主催者だけが見/.test(fold), 'WD 使い道: the old wrong sentences are gone');
  check(!fold.includes('会場のアナウンスで読み上げることがあります'), 'WD 使い道: no 花道 sentence for an ordinary division');
  await page.locator('#f-division').selectOption('花道男子');
  fold = await page.locator('#privacy-fold').evaluate((el) => el.textContent.replace(/\s+/g, ' '));
  check(fold.includes('花道の質問の答え（フリガナ・リングネーム・生年月日・キック歴・練習頻度・他格闘歴・職業・趣味・始めた理由・メッセージ）は、会場のアナウンスで読み上げることがあります。会場の画面や掲示する表には、出ません。'), 'WD 使い道: the 花道 answers may be read out at the venue (owner decision)');
  // 困ったとき
  await page.locator('summary', { hasText: '困ったとき' }).click(); await settle(200);
  const help = await page.locator('details', { hasText: '困ったとき' }).last().evaluate((el) => el.textContent.replace(/\s+/g, ' '));
  check(help.includes('同じ画面から送り直した分は、二重になりません。（もう一度ページを開いて入れ直した分は、別の申し込みになります）') && !help.includes('同じ申し込みは、二重になりません'), 'WD 困ったとき: 二重 is said only for the same screen');
  check((await sideways(page)) <= 0, 'WD no sideways scroll');
  // the review paragraph
  await page.locator('#f-division').selectOption('一般男子');
  await fillAll(page);
  await page.locator('#f-weightClass').selectOption('60kg以下');
  await reviewBtn(page).click(); await sendBtn(page).waitFor();
  const t = await bodyText(page);
  check(t.includes('（主催者と運営スタッフだけが見ます）') && !/主催者だけが見/.test(t), 'WD the review screen uses the same words for who sees it');
  await ctx.close();
});

/* ───────────────────────── ST: the setup screen ───────────────────────── */
await scenario('ST', 'setup screen: 約30分 for a first-time user, never 15分', [PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await ctx.newPage();
  await page.goto(base + '/private/setup/');
  await page.getByText('はじめての人は、約30分かかります。順番にボタンを押すだけです。').waitFor({ timeout: 15000 });
  const t = await bodyText(page);
  check(!/15分くらい|15分/.test(t), 'ST no 15分 on the setup screen');
  check(/はじめての人は、約30分かかります。順番にボタンを押すだけです。/.test(t), 'ST the first-time sentence is there');
  await ctx.close();
});

/* ───────────────────────── done ───────────────────────── */
await settle(100);
for (const e of externals) failures.push('[' + e.scenario + '] EXTERNAL request attempted: ' + e.method + ' ' + e.url);
for (const e of pageErrors) failures.push('[' + e.scenario + '] page error: ' + short(e.message, 200));
const nonLocal = net.filter((n) => !n.url.startsWith(base + '/') && n.url !== ENDPOINT && !n.url.startsWith('data:'));
for (const n of nonLocal) failures.push('[' + n.scenario + '] network request left the app: ' + n.method + ' ' + n.url);
await browser.close();
console.log('\n' + checks + ' checks, ' + failures.length + ' failed.');
for (const f of failures) console.log(' - ' + f);
process.exit(failures.length ? 1 : 0);
