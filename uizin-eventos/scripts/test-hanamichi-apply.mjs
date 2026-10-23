/**
 * Browser checks for the 花道 (Hanamichi) extra questions on the public apply page (/apply/):
 * the card appears only for a division whose name contains 花道 (and only when the link carries hn=on), 12 items in the table's order,
 * three select boxes for the birth date, required items block the send with a reason, changing the division discards the answers,
 * no sideways scroll at 320px, one 👉 marker per state, nothing leaves the page except the apply form's POST, and nothing personal
 * is kept in the link, storage or the console. With the setting OFF (no hn=on) the page and its POST are exactly the old ones.
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation, except the apply form's POST to the
 * (simulated) Google endpoint, which is answered locally. All data is fake. Drives the REAL built page (npm run build:private).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 5401 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/h.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_TEST_BASE=http://127.0.0.1:5401 TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-hanamichi-apply.mjs; rc=$?; kill $(cat /tmp/h.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:5401), TOS_ONLY=A,B (scenario letters), TOS_CHROME_PATH.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { HANAMICHI_ASKED_ITEMS, HANAMICHI_DERIVED_KEYS, HANAMICHI_ITEMS, HANAMICHI_KEYS, hanamichiAgeFrom, jstDateText } from '../core/hanamichi.ts';
import { publicEntryHash } from '../core/publicEntry.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:5401';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const ENDPOINT = 'https://script.google.com/macros/s/TOS_HANAMICHI_SIM/exec';
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
/** 花道の区分は2つ（階級あり／なし）。花道でない区分も2つ（階級あり／なし） */
const WEIGHTS = { enabled: true, divisions: [{ name: '一般男子', classes: ['60kg以下', '60kgをこえる'] }, { name: '花道男子', classes: ['無差別'] }, { name: '花道女子', classes: [] }, { name: '小学生', classes: [] }] };
const baseCfg = { endpoint: ENDPOINT, eventId: 'hanamichi-apply', title: '架空テスト大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '架空連絡先 02-0000-0000', music: false, grade: 'off', age: 'off', comment: 'off', protocol: '3', mode: 'live', weights: WEIGHTS };
const textOf = async (p, selector) => ((await p.locator(selector).count()) ? p.locator(selector).first().innerText() : '');
const hashFor = (over = {}) => publicEntryHash({ ...baseCfg, hanamichi: true, ...over });
/** the POST keys of the old form, in order (setting OFF must send exactly these) */
const OLD_KEYS = ['protocol', 'entryKey', 'mode', 'website', 'eventId', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'fighterClass', 'division', 'weightClass', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'photoDataUrl'];
const THIS_YEAR = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
/** fake answers (no real person) */
const HN_GOOD = { hnNameKana: 'カクウ ハナミチイチロウ', hnGymKana: 'カクウジムエー', hnRing: '架空のタイガー', hnRingKana: 'カクウノタイガー', hnKickYears: '5', hnPerWeek: '3', hnOther: '', hnJob: '', hnHobby: '釣り', hnReason: '健康のために始めました。', hnMessage: '全力でがんばります。' };
const BIRTH_GOOD = { y: '1975', m: '8', d: '20' };

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
const BASE_FIELDS = [['ジム名 必須', '架空ジム'], ['選手名 必須', '架空選手'], ['身長（cm）必須', '170'], ['体重（kg）必須', '65'], ['戦績 必須', '初出場'], ['連絡先のお名前 必須', '架空連絡先'], ['電話番号 必須', '09012345678'], ['メールアドレス 必須', 'test@example.com']];
/** the ordinary part of the form (everything except the 花道 card); the division is chosen first so a 花道 card can show */
async function fillBase(page, { division = '花道男子', weightClass = '無差別', consent = true } = {}) {
  if (division) await page.locator('#f-division').selectOption(division);
  if (weightClass) await page.locator('#f-weightClass').selectOption(weightClass);
  for (const [label, value] of BASE_FIELDS) await page.getByLabel(label, { exact: true }).fill(value);
  const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 120, 160); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
  await page.locator('input[type=file]').setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByAltText('選んだ写真').waitFor();
  if (consent) await page.getByRole('checkbox').check();
}
async function fillBirth(page, { y, m, d }) {
  await page.locator('#f-hnBirth').selectOption(y);
  await page.locator('#f-hnBirthM').selectOption(m);
  await page.locator('#f-hnBirthD').selectOption(d);
}
async function fillHn(page, over = {}, birth = BIRTH_GOOD) {
  const values = { ...HN_GOOD, ...over };
  for (const key of HANAMICHI_KEYS) {
    // リングネーム・そのフリガナは、選手名から作る（欄は無い）
    if (key === 'hnBirth' || HANAMICHI_DERIVED_KEYS.includes(key) || values[key] === undefined) continue;
    await page.locator('#f-' + key).fill(values[key]);
  }
  if (birth) await fillBirth(page, birth);
}
const reviewBtn = (p) => p.getByRole('button', { name: '入力内容を確認する →', exact: true });
const sendBtn = (p) => p.getByRole('button', { name: 'この内容で送信する', exact: true });
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const nextMarks = (p) => p.evaluate(() => [...document.querySelectorAll('[data-tos-next]')].map((e) => (e.querySelector('.tos-next-badge')?.textContent || '').replace(/\s+/g, ' ').trim()));
const cardCount = (p) => p.locator('#hn-card').count();
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
/** the visible 花道 card text pieces smaller than 17px, and inputs/buttons/selects shorter than 48px */
const smallThings = (p) => p.evaluate(() => {
  const card = document.getElementById('hn-card');
  if (!card) return { small: ['no card'], short: [] };
  const small = [], shortOnes = [];
  for (const el of card.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(getComputedStyle(el).fontSize) < 16.99) small.push((el.textContent || '').trim().slice(0, 16) + ' ' + getComputedStyle(el).fontSize);
    if (el.matches('input:not([type=hidden]),select,textarea,button') && r.height < 47.99) shortOnes.push(el.id + ' ' + Math.round(r.height));
  }
  return { small, short: shortOnes };
});

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

/* ───────────────────────── A: the card shows for a 花道 division, in the table's order ───────────────────────── */
await scenario('A', 'choosing a 花道 division shows the card with the 12 items', [DESKTOP, PHONE], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  check((await cardCount(page)) === 0 && !/花道の追加の質問/.test(await bodyText(page)), 'A before any division is chosen: no card');
  await page.locator('#f-division').selectOption('一般男子');
  check((await cardCount(page)) === 0 && (await page.locator('#f-hnNameKana').count()) === 0, 'A an ordinary division: no card, no 花道 field');
  const [, totalOrdinary] = await counter(page);
  await page.locator('#f-division').selectOption('小学生');
  const [, totalNoClass] = await counter(page);
  await page.locator('#f-division').selectOption('花道女子');
  check((await cardCount(page)) === 1, 'A a 花道 division: the card shows');
  const [filled0, totalHn] = await counter(page);
  // 必須は10項目。リングネームのフリガナは、リングネームを入れるまで数えない（まだ要らない）
  const required = HANAMICHI_ITEMS.filter((i) => i.required).length;
  check(filled0 === 1 && totalHn - totalNoClass <= required, 'A the counter counts only the 花道 items that are due now (入力 ' + filled0 + '/' + totalHn + ', before ' + totalNoClass + ', ordinary ' + totalOrdinary + ')');
  // リングネームは、選手名から作る（欄は出ない）。ふつうの欄（学年・年齢・意気込み）も、花道では出ない
  check((await page.locator('#f-hnRing').count()) === 0 && (await page.locator('#f-hnRingKana').count()) === 0, 'A the ring name and its reading are not asked (they come from 選手名 and フリガナ)');
  check((await page.locator('#f-grade,#f-age,#f-comment').count()) === 0, 'A grade, age and message are not asked in the 花道 card or above it');
  await page.locator('#f-division').selectOption('花道男子');
  const text = await page.locator('#hn-card').innerText();
  check(/花道の追加の質問/.test(text) && text.includes('花道の紹介の質問です。アナウンスで使います。'), 'A the heading and the sentence "花道の紹介の質問です。アナウンスで使います。" are there (' + short(text, 90) + ')');
  check(text.includes('住所や電話番号は書かないでください。'), 'A the one-line caution "住所や電話番号は書かないでください。" is there');
  // position: after the photo box, before the 連絡先 card
  const order = await page.evaluate(() => {
    const photo = document.getElementById('f-photo-box'), card = document.getElementById('hn-card'), contact = document.getElementById('contact-fields');
    const after = (a, b) => Boolean(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
    const sections = [...document.querySelectorAll('main section')].filter((s) => s.offsetWidth > 0).length;
    return { photoBeforeCard: after(photo, card), cardBeforeContact: after(card, contact), sections };
  });
  check(order.photoBeforeCard && order.cardBeforeContact, 'A the card sits between the photo and the 連絡先 card');
  // the 12 items: one field each, in the table's order, labelled with the table's words and 必須/任意
  const ids = await page.evaluate(() => [...document.querySelectorAll('#hn-card [id^="f-hn"]')].map((e) => e.id).filter((id) => !/-(hint|ex|err|note)$/.test(id)));
  const expectIds = HANAMICHI_ASKED_ITEMS.map((item) => item.key).flatMap((key) => (key === 'hnBirth' ? ['f-hnBirth', 'f-hnBirthM', 'f-hnBirthD'] : ['f-' + key]));
  check(JSON.stringify(ids) === JSON.stringify(expectIds), 'A the 12 items come in the table order (birth = 3 selects) (' + short(ids.join(','), 200) + ')');
  for (const item of HANAMICHI_ASKED_ITEMS) {
    const label = (await page.locator('#hn-card label[for="f-' + item.key + '"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    check(label.startsWith(item.label) && label.includes(item.required ? '必須' : '任意'), 'A "' + item.label + '" is labelled ' + (item.required ? '必須' : '任意') + ' (' + short(label, 50) + ')');
  }
  check(await page.locator('#hn-card').getByText('（空でもOK）').count() === HANAMICHI_ASKED_ITEMS.filter((i) => !i.required).length, 'A the two optional items say （空でもOK）');
  // no double asking: nothing for the items the ordinary form already has
  const labels = await page.locator('#hn-card label').allInnerTexts();
  check(!labels.some((l) => /^(ジム名|選手名|身長|体重|戦績)/.test(l.trim())), 'A the card does not ask the gym, name, height, weight or record a second time');
  // input kinds: three selects for the birth date, a textarea for the two long answers, numbers are numeric
  check((await page.locator('#hn-card select').count()) === 3 && (await page.locator('#hn-card textarea').count()) === 2, 'A the birth date is three selects; the two long answers are textareas');
  check((await page.locator('#f-hnKickYears').getAttribute('inputmode')) === 'numeric' && (await page.locator('#f-hnPerWeek').getAttribute('inputmode')) === 'numeric', 'A the two number answers open the number keypad');
  // no placeholder with a name-like example anywhere in the card
  const placeholders = await page.evaluate(() => [...document.querySelectorAll('#hn-card input,#hn-card textarea')].map((e) => e.getAttribute('placeholder')).filter(Boolean));
  check(placeholders.length === 0, 'A no placeholder in the card (' + placeholders.join('|') + ')');
  // size rules
  const sz = await smallThings(page);
  check(sz.small.length === 0, 'A every text in the card is 17px or bigger (' + sz.small.slice(0, 3).join(' | ') + ')');
  check(sz.short.length === 0, 'A every input, select and button in the card is 48px or taller (' + sz.short.slice(0, 3).join(' | ') + ')');
  await ctx.close();
});

/* ───────────────────────── B: an ordinary division — no card, and the POST is exactly the old one ───────────────────────── */
await scenario('B', 'an ordinary division: no card, no 花道 key in the POST', [DESKTOP, PHONE], async (vp) => {
  for (const [division, weightClass] of [['一般男子', '60kg以下'], ['小学生', '']]) {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await fillBase(page, { division, weightClass });
    check((await cardCount(page)) === 0 && (await page.locator('[id^="f-hn"]').count()) === 0, 'B ' + division + ': no card, no 花道 field');
    await oneMark(page, 'B ' + division + ' all filled');
    const post = await sendIt(page, ctx);
    const keys = post ? [...post.keys()] : [];
    check(JSON.stringify(keys) === JSON.stringify(OLD_KEYS), 'B ' + division + ': the POST keys are exactly the old ones (' + short(keys.join(','), 220) + ')');
    check(post && post.get('division') === division, 'B ' + division + ': the division is sent');
    await ctx.close();
  }
});

/* ───────────────────────── C: required answers missing — blocked with reasons ───────────────────────── */
await scenario('C', 'required 花道 answers empty: no send, the reasons show, the cursor goes to the first one', [PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  await fillBase(page);
  const first = await oneMark(page, 'C base filled, 花道 empty');
  check(first.includes('氏名のフリガナ'), 'C the one marker points at the first 花道 item (' + first + ')');
  await reviewBtn(page).click();
  await settle(400);
  check((await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 0, 'C the review screen does not open');
  check(ctx.__posts.length === 0, 'C nothing is sent');
  const top = await page.locator('#apply-msg').innerText().catch(() => '');
  check(/足りない所が\d+か所あります/.test(top) && top.includes('✕'), 'C the red band says how many places are missing (' + short(top, 80) + ')');
  const needed = HANAMICHI_ASKED_ITEMS.map((item) => item.key).filter((k) => !['hnOther', 'hnJob'].includes(k));
  for (const key of needed) {
    const line = await page.locator('#f-' + key + '-err').innerText().catch(() => '');
    check(line.includes('✕') && line.length > 3, 'C ' + key + ' has a red ✕ line (' + short(line, 60) + ')');
  }
  check((await page.locator('#f-hnOther-err').count()) === 0 && (await page.locator('#f-hnJob-err').count()) === 0, 'C the two optional items are not marked');
  check((await page.locator('#f-hnRingKana-err').count()) === 0, 'C the ring name reading is not asked (it is not a field)');
  check((await activeId(page)) === 'f-hnNameKana', 'C the cursor goes to the first missing 花道 item (' + (await activeId(page)) + ')');
  const mark = await oneMark(page, 'C after the failed try');
  check(mark.includes('氏名のフリガナ'), 'C the marker stays on the first missing item (' + mark + ')');
  const aria = await page.locator('#f-hnNameKana').getAttribute('aria-invalid');
  check(aria === 'true', 'C the field says aria-invalid');

  await fillHn(page);
  await page.locator('#hn-card h2').click(); // leave the field: the marker stays on a field while the cursor is in it
  await settle(300);
  const done = await oneMark(page, 'C all answered');
  check(done.includes('確認のボタン'), 'C the marker has moved on to the confirm button (' + done + ')');
  check(ctx.__posts.length === 0, 'C still nothing sent');
  await ctx.close();
});

/* ───────────────────────── D: changing the division discards the answers ───────────────────────── */
await scenario('D', 'changing away from 花道 removes the card and discards the answers; nothing is sent', [PHONE, DESKTOP], async (vp) => {
  const MARK = 'ZZ捨てる印';
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await fillBase(page);
    await fillHn(page, { hnHobby: MARK, hnReason: MARK + '理由', hnMessage: MARK + 'メッセージ' });
    check((await cardCount(page)) === 1, 'D the card is there while 花道男子 is chosen');
    await page.locator('#f-division').selectOption('一般男子');
    check((await cardCount(page)) === 0 && (await page.locator('[id^="f-hn"]').count()) === 0, 'D after switching to 一般男子 the card and its fields are gone');
    await page.locator('#f-weightClass').selectOption('60kg以下');
    check(!(await bodyText(page)).includes(MARK), 'D the typed answers are not on the page any more');
    await oneMark(page, 'D after switching away');
    const post = await sendIt(page, ctx);
    const body = ctx.__postBodies.at(-1) || '';
    check(post && !body.includes(encodeURIComponent(MARK)) && ![...post.keys()].some((k) => k.startsWith('hn')), 'D the POST has no 花道 key and none of the typed answers (' + (post ? [...post.keys()].filter((k) => k.startsWith('hn')).join(',') : 'no POST') + ')');
    check(post && JSON.stringify([...post.keys()]) === JSON.stringify(OLD_KEYS), 'D the POST is exactly the old key list');
    await ctx.close();
  }
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await fillBase(page);
    await fillHn(page, { hnHobby: MARK });
    await page.locator('#f-division').selectOption('小学生');
    await page.locator('#f-division').selectOption('花道男子');
    await page.locator('#f-weightClass').selectOption('無差別');
    const values = await page.evaluate((keys) => keys.filter((k) => k !== 'hnBirth').map((k) => document.getElementById('f-' + k).value), HANAMICHI_ASKED_ITEMS.map((item) => item.key));
    const birth = await page.evaluate(() => ['f-hnBirth', 'f-hnBirthM', 'f-hnBirthD'].map((id) => document.getElementById(id).value));
    check(values.every((v) => v === '') && birth.every((v) => v === ''), 'D coming back to a 花道 division: every answer is empty again (' + short(values.join('|') + '/' + birth.join('|'), 80) + ')');
    const errs = await page.locator('#hn-card .tos-error').count();
    check(errs === 0, 'D coming back: no red line is left over');
    const mark = await oneMark(page, 'D coming back');
    check(mark.includes('氏名のフリガナ'), 'D coming back: the marker is on the first 花道 item (' + mark + ')');
    // from a 花道 division to another 花道 division: the answers stay
    await page.locator('#f-hnHobby').fill(MARK);
    await page.locator('#f-division').selectOption('花道女子');
    check((await cardCount(page)) === 1 && (await page.locator('#f-hnHobby').inputValue()) === MARK, 'D between two 花道 divisions the answers stay');
    await ctx.close();
  }
});

/* ───────────────────────── E: no sideways scroll at 320px (and the other widths) ───────────────────────── */
await scenario('E', 'no sideways scroll: the card, its red lines, the long answers and the review', [SMALL, PHONE, DESKTOP], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  await fillBase(page);
  let s = await sideways(page);
  check(s.sw <= s.cw, 'E the card opens with no sideways scroll (' + s.sw + ' vs ' + s.cw + ')');
  await reviewBtn(page).click();
  await settle(400);
  s = await sideways(page);
  check(s.sw <= s.cw, 'E with every red line showing: no sideways scroll (' + s.sw + ' vs ' + s.cw + ')');
  const long = 'あ'.repeat(59), wide = 'W'.repeat(59);
  await fillHn(page, { hnNameKana: wide, hnGymKana: wide, hnRing: long, hnRingKana: wide, hnOther: wide, hnJob: wide, hnHobby: wide, hnReason: 'W'.repeat(299), hnMessage: 'あ'.repeat(299) }, { y: '1990', m: '12', d: '31' });
  s = await sideways(page);
  check(s.sw <= s.cw, 'E long unbroken answers: no sideways scroll (' + s.sw + ' vs ' + s.cw + ')');
  const out = await page.evaluate(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll('#hn-card *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > w + 0.5 || r.left < -0.5); }).map((e) => (e.id || e.tagName) + ':' + Math.round(e.getBoundingClientRect().right)).slice(0, 4); });
  check(out.length === 0, 'E nothing in the card reaches outside the screen (' + out.join(',') + ')');
  const birth = await page.evaluate(() => ['f-hnBirth', 'f-hnBirthM', 'f-hnBirthD'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), right: Math.round(r.right) }; }));
  check(birth.every((b) => b.h >= 48 && b.w >= 70), 'E the three birth selects are at least 48px tall and 70px wide (' + birth.map((b) => b.w + 'x' + b.h).join(' ') + ')');
  // R5 (owner 2026-10-22): the year lines are long ("1989（昭和64・平成元）"), so the year select has a row to itself at EVERY width (it used to share one row with month and day on a wide screen)
  check(birth[0].top < birth[1].top && birth[1].top === birth[2].top, 'E at every width: the year is on its own row, month and day share the next row (' + birth.map((b) => b.top).join(',') + ')');
  // R5: the year lines are longer now ("1989（昭和64・平成元）" is the longest). The chosen text must fit inside the select (not cut) at every width, and be 17px+
  for (const y of ['1989', '2019', '1990']) {
    await page.locator('#f-hnBirth').selectOption(y);
    const fit = await page.evaluate(() => {
      const el = document.getElementById('f-hnBirth'), cs = getComputedStyle(el), c = document.createElement('canvas').getContext('2d');
      c.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const text = el.selectedOptions[0].text;
      return { text, textWidth: Math.ceil(c.measureText(text).width), inner: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), font: parseFloat(cs.fontSize) };
    });
    // 24px is kept for the drop-down arrow (Chromium needs about 20px; the rest is a margin for other browsers)
    check(fit.textWidth + 24 <= fit.inner && fit.font >= 17, 'E the chosen year ' + fit.text + ' fits inside its select at ' + vp.width + 'px (text ' + fit.textWidth + 'px + 24px arrow <= ' + Math.round(fit.inner) + 'px; font ' + fit.font + 'px)');
  }
  s = await sideways(page);
  check(s.sw <= s.cw, 'E with the longest year chosen: no sideways scroll (' + s.sw + ' vs ' + s.cw + ')');
  const sz = await smallThings(page);
  check(sz.small.length === 0 && sz.short.length === 0, 'E text 17px+ and targets 48px+ also with long answers (' + sz.small.concat(sz.short).slice(0, 3).join(' | ') + ')');
  await toReview(page);
  s = await sideways(page);
  check(s.sw <= s.cw, 'E the review screen with long answers: no sideways scroll (' + s.sw + ' vs ' + s.cw + ')');
  const review = await bodyText(page);
  check(review.includes('花道の追加の質問') && review.includes('1990年12月31日'), 'E the review lists the 花道 block and the birth date');
  await ctx.close();
});

/* ───────────────────────── H: the birth date — three selects, a 40+ friendly order, no age check ───────────────────────── */
await scenario('H', 'birth date: three selects, order 1990→1930 then 1991→this year, impossible and future dates are red, no age check', [DESKTOP, PHONE], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  await page.locator('#f-division').selectOption('花道男子');
  const years = await page.locator('#f-hnBirth option').allInnerTexts();
  const months = await page.locator('#f-hnBirthM option').allInnerTexts();
  const days = await page.locator('#f-hnBirthD option').allInnerTexts();
  check(years[0] === '年を選ぶ' && months[0] === '月を選ぶ' && days[0] === '日を選ぶ', 'H each select starts with a "…を選ぶ" line');
  // R5 (owner 2026-10-22): the year lines are "西暦（和暦）"; the borders are written both ways; the VALUES stay the western year
  check(years[1] === '1990（平成2）' && years[2] === '1989（昭和64・平成元）' && years[3] === '1988（昭和63）' && years[61] === '1930（昭和5）', 'H the years run 1990, 1989 … 1930 (not newest first), each with its 和暦 (' + years.slice(1, 4).join(',') + '…' + years[61] + ')');
  check(years[62] === '1991（平成3）' && years[years.length - 1] === THIS_YEAR + '（令和' + (THIS_YEAR - 2018) + '）' && years.length === 1 + 61 + (THIS_YEAR - 1990), 'H then 1991 … this year (' + years[62] + '…' + years[years.length - 1] + ', ' + years.length + ' lines)');
  check(years.includes('2019（平成31・令和元）') && years.includes('2020（令和2）') && years.includes('1986（昭和61）'), 'H 2019 is written both ways (平成31・令和元), 2020 is 令和2, 1986 is 昭和61');
  const yearValues = await page.locator('#f-hnBirth option').evaluateAll((os) => os.map((o) => o.value));
  check(yearValues[0] === '' && yearValues[1] === '1990' && yearValues[2] === '1989' && yearValues[61] === '1930' && yearValues[62] === '1991' && yearValues.slice(1).every((v) => /^\d{4}$/.test(v)), 'H the option VALUES are still the plain western years (' + yearValues.slice(0, 4).join(',') + ')');

  check(months.length === 13 && months[1] === '1月' && months[12] === '12月' && days.length === 32 && days[1] === '1日' && days[31] === '31日', 'H 12 months and 31 days');
  check((await page.locator('#f-hnBirth').evaluate((el) => el.getAttribute('aria-label'))).includes('年') && (await page.locator('label[for="f-hnBirth"]').count()) === 1, 'H the year select has the 生年月日 label; each select has its own spoken name');
  // partly chosen: nothing red yet (only an empty answer)
  await page.locator('#f-hnBirth').selectOption('1975');
  check((await page.locator('#f-hnBirth-err').count()) === 0, 'H only the year chosen: no red line yet');
  // a day that does not exist
  await page.locator('#f-hnBirthM').selectOption('2');
  await page.locator('#f-hnBirthD').selectOption('30');
  let err = await page.locator('#f-hnBirth-err').innerText().catch(() => '');
  check(err.includes('✕') && err.includes('1975年2月30日は、ありません'), 'H 1975-02-30: a red ✕ line says the day does not exist (' + short(err, 70) + ')');
  check((await page.locator('#f-hnBirth').getAttribute('aria-invalid')) === 'true', 'H the selects say aria-invalid');
  await page.locator('#f-hnBirthD').selectOption('28');
  check((await page.locator('#f-hnBirth-err').count()) === 0, 'H choosing a real day clears the red line');
  // 29 February: only in a leap year
  await page.locator('#f-hnBirthD').selectOption('29');
  err = await page.locator('#f-hnBirth-err').innerText().catch(() => '');
  check(err.includes('1975年2月29日は、ありません'), 'H 1975-02-29 (not a leap year) is red');
  await page.locator('#f-hnBirth').selectOption('1976');
  check((await page.locator('#f-hnBirth-err').count()) === 0, 'H 1976-02-29 (a leap year) is fine');
  // a day that has not come yet
  const today = new Date(Date.now() + 9 * 3600 * 1000);
  if (!(today.getUTCMonth() === 11 && today.getUTCDate() === 31)) {
    await page.locator('#f-hnBirth').selectOption(String(THIS_YEAR));
    await page.locator('#f-hnBirthM').selectOption('12');
    await page.locator('#f-hnBirthD').selectOption('31');
    err = await page.locator('#f-hnBirth-err').innerText().catch(() => '');
    check(err.includes('✕') && err.includes('まだ来ていない日'), 'H a day in the future is red (' + short(err, 60) + ')');
  }
  // age is never checked: a young birth year and an old one are both fine
  for (const y of [String(THIS_YEAR - 12), '1930']) {
    await page.locator('#f-hnBirth').selectOption(y);
    await page.locator('#f-hnBirthM').selectOption('1');
    await page.locator('#f-hnBirthD').selectOption('1');
    check((await page.locator('#f-hnBirth-err').count()) === 0, 'H the year ' + y + ' is accepted (no age check)');
  }
  // a wrong date blocks the send; the real one goes through as yyyy-mm-dd
  await fillBase(page, { division: '', weightClass: '無差別' });
  await fillHn(page, {}, { y: '1975', m: '2', d: '30' });
  await reviewBtn(page).click();
  await settle(400);
  check((await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 0 && (await page.locator('#f-hnBirth-err').count()) === 1, 'H an impossible date blocks the review');
  check((await activeId(page)) === 'f-hnBirth', 'H the cursor goes to the year select');
  await fillBirth(page, BIRTH_GOOD);
  await oneMark(page, 'H date fixed');
  check((await page.locator('#f-hnBirth').evaluate((el) => el.selectedOptions[0].text)) === '1975（昭和50）', 'H once chosen, the year select shows 1975（昭和50）');
  const yearFont = await page.locator('#f-hnBirth').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check(yearFont >= 17, 'H the chosen year is written at 17px or more (' + yearFont + 'px)');
  const post = await sendIt(page, ctx);
  check(post && post.get('hnBirth') === '1975-08-20', 'H the POST carries hnBirth=1975-08-20 (' + (post && post.get('hnBirth')) + ')');
  check(!(ctx.__postBodies.at(-1) || '').includes(encodeURIComponent('昭和')) && !(ctx.__postBodies.at(-1) || '').includes(encodeURIComponent('平成')), 'H no 和暦 word travels in the POST (the sent value is the western date)');
  await ctx.close();
});

/* ───────────────────────── I: the whole flow — review lists the answers, the POST carries the 12 keys in order ───────────────────────── */
await scenario('I', 'full flow: review block, then the POST with the 12 keys after the old ones', [DESKTOP, PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  await fillBase(page);
  await fillHn(page);
  const done = await oneMark(page, 'I everything filled');
  check(done.includes('確認のボタン'), 'I the marker is on the confirm button (' + done + ')');
  const [filled, total] = await counter(page);
  check(filled === total && total > 0, 'I the counter is full (入力 ' + filled + '/' + total + ')');
  await toReview(page);
  const review = await page.locator('section[aria-label="送る前の確認"]').innerText();
  check(review.includes('花道の追加の質問'), 'I the review has a 花道 block');
  for (const item of HANAMICHI_ASKED_ITEMS) check(review.includes(item.label), 'I the review lists "' + item.label + '"');
  check(!review.includes('リングネーム'), 'I the review does not list リングネーム (it is 選手名 now)');
  for (const value of [HN_GOOD.hnNameKana, '架空選手', HN_GOOD.hnHobby, '1975年8月20日', HN_GOOD.hnReason]) check(review.includes(value), 'I the review shows the answer "' + value + '"');
  check(/職業\s*（書いていません）/.test(review) && /他格闘歴\s*（書いていません）/.test(review), 'I an empty optional answer says （書いていません）, not a mistake');
  await oneMark(page, 'I review screen');
  // "直す" goes back to the first 花道 field
  await page.getByRole('button', { name: '花道の追加の質問を直す', exact: true }).click();
  await settle(300);
  check((await activeId(page)) === 'f-hnNameKana' && (await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 0, 'I 直す closes the review and puts the cursor on the first 花道 item (' + (await activeId(page)) + ')');
  await toReview(page);
  await sendBtn(page).click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  const post = ctx.__posts.at(-1);
  const keys = post ? [...post.keys()] : [];
  check(JSON.stringify(keys) === JSON.stringify([...OLD_KEYS, ...HANAMICHI_KEYS]), 'I the POST keys: the old ones, then the 12 in table order (' + short(keys.slice(-13).join(','), 200) + ')');
  // リングネーム＝選手名（架空選手）、そのフリガナ＝氏名のフリガナ。ほかは、入れたとおり
  const expect = { ...HN_GOOD, hnBirth: '1975-08-20', hnRing: '架空選手', hnRingKana: HN_GOOD.hnNameKana };
  const wrong = HANAMICHI_KEYS.filter((k) => post && post.get(k) !== expect[k]);
  check(post && wrong.length === 0, 'I every answer is posted as typed (wrong: ' + wrong.map((k) => k + '=' + (post && post.get(k))).join(',') + ')');
  check(post && post.get('division') === '花道男子' && post.get('weightClass') === '無差別' && post.get('gym') === '架空ジム', 'I the ordinary values are still posted (division, weightClass, gym)');
  await ctx.close();
});

/* ───────────────────────── J: setting OFF — the page is the old page ───────────────────────── */
await scenario('J', 'no hn=on in the link: a 花道 division shows nothing extra and the POST is the old one', [DESKTOP, PHONE], async (vp) => {
  const cases = [
    ['setting off (no hn in the link)', publicEntryHash({ ...baseCfg })],
    ['hn=on but no division table', publicEntryHash({ ...baseCfg, weights: undefined, hanamichi: true })],
    ['hn=on on an old protocol-2 link', publicEntryHash({ ...baseCfg, protocol: '2', entryKey: 'k'.repeat(40), hanamichi: true })],
  ];
  for (const [name, hash] of cases) {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hash);
    const hasDivision = (await page.locator('#f-division').count()) === 1;
    if (hasDivision) await fillBase(page, { division: '花道男子', weightClass: '無差別' });
    else await fillBase(page, { division: '', weightClass: '' });
    check((await cardCount(page)) === 0 && (await page.locator('[id^="f-hn"]').count()) === 0 && !/花道の追加の質問/.test(await bodyText(page)), 'J ' + name + ': no card');
    await oneMark(page, 'J ' + name);
    const post = await sendIt(page, ctx);
    const keys = post ? [...post.keys()] : [];
    check(post && !keys.some((k) => k.startsWith('hn')), 'J ' + name + ': no 花道 key is posted (' + keys.filter((k) => k.startsWith('hn')).join(',') + ')');
    const old = hasDivision ? OLD_KEYS : OLD_KEYS.filter((k) => k !== 'division' && k !== 'weightClass');
    check(JSON.stringify(keys) === JSON.stringify(old), 'J ' + name + ': the POST keys are exactly the old ones (' + short(keys.join(','), 160) + ')');
    await ctx.close();
  }
});

/* ───────────────────────── K: a damaged hn value in the link stops the page ───────────────────────── */
await scenario('K', 'hn cut or wrong: the page stops with the red box; hn=on is fine', [PHONE], async (vp) => {
  const good = hashFor();
  const cases = [['hn=off', good.replace('hn=on', 'hn=off'), true], ['hn=o (cut)', good.replace('hn=on', 'hn=o'), true], ['hn= (empty)', good.replace('hn=on', 'hn='), true], ['end marker lost', good.replace(/&end=1$/, ''), true], ['hn=on (good)', good, false]];
  for (const [name, hash, stops] of cases) {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hash, { wait: false });
    await page.getByText(stops ? 'このページでは申し込めません' : 'ジム名').first().waitFor({ timeout: 15000 }).catch(() => {});
    const t = await bodyText(page);
    const formVisible = await page.getByLabel('ジム名 必須', { exact: true }).isVisible().catch(() => false);
    if (stops) check(/このページでは申し込めません/.test(t) && /途中で切れ/.test(t) && !formVisible && !(await reviewBtn(page).isEnabled().catch(() => false)), 'K ' + name + ': red box, no form, cannot send');
    else check(!/このページでは申し込めません/.test(t) && formVisible, 'K ' + name + ': the form opens');
    await ctx.close();
  }
});

/* ───────────────────────── L: nothing personal stays behind (link, storage, console, title) ───────────────────────── */
await scenario('L', 'the answers never reach the link, the storage, the console or the tab title', [DESKTOP], async () => {
  const SECRET = { hnNameKana: 'ZQXカナ名', hnGymKana: 'ZQXカナジム', hnRing: 'ZQXリング', hnRingKana: 'ZQXリングカナ', hnOther: 'ZQX他格闘', hnJob: 'ZQX職業', hnHobby: 'ZQX趣味', hnReason: 'ZQX理由', hnMessage: 'ZQXメッセージ', hnKickYears: '7', hnPerWeek: '4' };
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  await fillBase(page);
  await fillHn(page, SECRET, { y: '1971', m: '3', d: '9' });
  await toReview(page);
  const probe = () => page.evaluate(() => {
    const dump = (s) => { const out = []; try { for (let i = 0; i < s.length; i++) { const k = s.key(i); out.push(k + '=' + s.getItem(k)); } } catch { /* storage may be blocked */ } return out.join('\n'); };
    return { href: location.href, title: document.title, local: dump(localStorage), session: dump(sessionStorage), cookie: document.cookie };
  });
  let p = await probe();
  const leak = (text) => /ZQX/.test(text) || /1971/.test(text);
  check(!leak(p.href) && !leak(p.title) && !leak(p.local) && !leak(p.session) && !leak(p.cookie), 'L before sending: no answer in the link, the title, localStorage, sessionStorage or cookies');
  await sendBtn(page).click();
  await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
  p = await probe();
  check(!leak(p.href) && !leak(p.local) && !leak(p.session), 'L after sending: nothing kept either (the sent-mark holds only the event id, a time and the mode)');
  check(!consoleLines.filter((c) => c.scenario === cur).some((c) => leak(c.text)), 'L no answer was written to the console');
  check(ctx.__posts.length === 1, 'L exactly one POST');
  await ctx.close();
});

/* ───────────────────────── M: typing — auto-fixed numbers (green), too-long text (red at once), counters ───────────────────────── */
await scenario('M', 'typing: numbers are tidied (green note), a wrong number or a too-long text is red, the counter counts down', [PHONE, DESKTOP], async () => {
  const ctx = await newCtx(PHONE);
  const page = await openApply(ctx, hashFor());
  await page.locator('#f-division').selectOption('花道男子');
  // a number with a unit and full-width digits is tidied when the field is left, and the change is shown in green with a ✓
  await page.locator('#f-hnKickYears').fill('５年');
  await page.locator('#f-hnPerWeek').click();
  await settle(500);
  check((await page.locator('#f-hnKickYears').inputValue()) === '5', 'M "５年" becomes 5 when the field is left (' + (await page.locator('#f-hnKickYears').inputValue()) + ')');
  const note = await page.locator('#f-hnKickYears-note').innerText().catch(() => '');
  check(note.includes('✓') && note.includes('自動で直しました'), 'M the change is told in green with ✓ (' + short(note, 50) + ')');
  await page.locator('#f-hnPerWeek').fill('週3回');
  await page.locator('#f-hnHobby').click();
  await settle(500);
  check((await page.locator('#f-hnPerWeek').inputValue()) === '3', 'M "週3回" becomes 3');
  // a number that is not a number, or too big: red after leaving the field
  await page.locator('#f-hnKickYears').fill('abc');
  await page.locator('#f-hnPerWeek').click();
  await settle(500);
  let err = await page.locator('#f-hnKickYears-err').innerText().catch(() => '');
  check(err.includes('✕') && err.includes('0から99の数字だけ'), 'M "abc" in a number field: red ✕ line (' + short(err, 60) + ')');
  await page.locator('#f-hnKickYears').fill('100');
  await page.locator('#f-hnPerWeek').click();
  await settle(500);
  err = await page.locator('#f-hnKickYears-err').innerText().catch(() => '');
  check(err.includes('0から99の数字だけ'), 'M 100 is red (the limit is 99)');
  await page.locator('#f-hnKickYears').fill('0');
  await page.locator('#f-hnPerWeek').click();
  await settle(300);
  check((await page.locator('#f-hnKickYears-err').count()) === 0, 'M 0 is allowed (less than a year)');
  // too long: red at once, counted
  await page.locator('#f-hnHobby').fill('あ'.repeat(61));
  await settle(200);
  err = await page.locator('#f-hnHobby-err').innerText().catch(() => '');
  check(err.includes('✕') && err.includes('長すぎます（いま61字／60字まで）'), 'M 61 characters in a 60-character item: red at once (' + short(err, 60) + ')');
  await page.locator('#f-hnHobby').fill('あ'.repeat(60));
  check((await page.locator('#f-hnHobby-err').count()) === 0, 'M exactly 60 is fine');
  const left = async (id) => (await page.locator('#' + id).locator('xpath=ancestor::*[contains(@class,"relative")][1]').innerText()).replace(/\s+/g, ' ');
  await page.locator('#f-hnMessage').fill('あ'.repeat(100));
  check((await left('f-hnMessage')).includes('あと200文字（300文字まで）'), 'M the long answer shows how many characters are left (あと200文字)');
  await page.locator('#f-hnReason').fill('い'.repeat(301));
  await settle(200);
  err = await page.locator('#f-hnReason-err').innerText().catch(() => '');
  check(err.includes('長すぎます（いま301字／300字まで）'), 'M 301 characters in a 300-character item: red');
  // spaces only is empty
  await page.locator('#f-hnJob').fill('   ');
  await page.locator('#f-hnOther').click();
  await settle(300);
  check((await page.locator('#f-hnJob-err').count()) === 0, 'M the optional job may be empty or spaces');
  await ctx.close();
});

/* ───────────────────────── N: review fixes — an optional answer that is too long gets the one 👉; the 👉 fits in 2 lines at 320px; the focused field's name is not under the red band; one consistent privacy line ───────────────────────── */
/** the 👉 box inside the 花道 card: its badge height and how far the badge reaches into the control just above it */
const hnBadge = (p) => p.evaluate(() => {
  const box = document.querySelector('#hn-card [data-tos-next]');
  if (!box) return null;
  const badge = box.querySelector('.tos-next-badge').getBoundingClientRect();
  const controls = [...document.querySelectorAll('#hn-card input, #hn-card select, #hn-card textarea')];
  const first = box.querySelector('input,select,textarea');
  const at = controls.indexOf(first);
  const prev = at > 0 ? controls[at - 1].getBoundingClientRect() : null;
  return { id: first.id, text: badge ? box.querySelector('.tos-next-badge').textContent.replace(/\s+/g, ' ').trim() : '', h: Math.round(badge.height), overlap: prev ? Math.round(Math.max(0, Math.min(badge.bottom, prev.bottom) - Math.max(badge.top, prev.top))) : 0 };
});
/** where the focused field's name (its label) and the 👉 sit, against the sticky red band */
const hnBand = (p) => p.evaluate(() => {
  const band = document.getElementById('apply-msg');
  const id = (document.activeElement && document.activeElement.id) || '';
  const label = document.querySelector('label[for="' + id + '"]');
  const badge = document.querySelector('[data-tos-next] .tos-next-badge');
  const input = document.getElementById(id);
  const r = (e) => (e ? e.getBoundingClientRect() : null);
  return { id, bandBottom: band ? Math.round(r(band).bottom) : -1, labelTop: label ? Math.round(r(label).top) : -1, labelBottom: label ? Math.round(r(label).bottom) : -1, badgeTop: badge ? Math.round(r(badge).top) : -1, inputTop: input ? Math.round(r(input).top) : -1, vh: window.innerHeight };
});
await scenario('N', 'optional answer too long gets the 👉; the 👉 is 2 lines at 320px; the label is not under the band; one privacy sentence', [{ width: 390, height: 844 }, SMALL], async (vp) => {
  /* N1 (job / other-fighting history, both optional): a red ✕ and a yellow 「confirm」 must never be shown together */
  for (const [key, label] of [['hnJob', '職業'], ['hnOther', '他格闘歴']]) {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await fillBase(page);
    await fillHn(page);
    const okMark = await oneMark(page, 'N1 ' + key + ' everything filled');
    check(okMark.includes('確認のボタン'), 'N1 ' + key + ': all good → the 👉 is on the confirm button (' + okMark + ')');
    const [f0, t0] = await counter(page);
    await page.locator('#f-' + key).fill('あ'.repeat(61));
    await page.locator('#hn-card h2').click();
    await settle(400);
    const err = await page.locator('#f-' + key + '-err').innerText().catch(() => '');
    check(err.includes('✕') && err.includes('長すぎます（いま61字／60字まで）'), 'N1 ' + key + ': the red ✕ line is shown (' + short(err, 60) + ')');
    const mark = await oneMark(page, 'N1 ' + key + ' too long');
    check(mark.includes(label + 'を直す') && !mark.includes('確認のボタン'), 'N1 ' + key + ': the one 👉 points at the field to fix, not at the confirm button (' + mark + ')');
    const [f1, t1] = await counter(page);
    check(f1 === f0 && t1 === t0, 'N1 ' + key + ': the 入力 N/M counter is unchanged by an optional answer (' + f0 + '/' + t0 + ' → ' + f1 + '/' + t1 + ')');
    await reviewBtn(page).click();
    await settle(500);
    const band = await page.locator('#apply-msg').innerText().catch(() => '');
    check(band.includes('直す所：' + label) && !/足りない所/.test(band), 'N1 ' + key + ': the blocked send says 直す所：' + label + ' (' + short(band, 70) + ')');
    check((await activeId(page)) === 'f-' + key && ctx.__posts.length === 0, 'N1 ' + key + ': the cursor jumps to the field, nothing is sent');
    const after = await oneMark(page, 'N1 ' + key + ' after the blocked send');
    check(after.includes(label + 'を直す'), 'N1 ' + key + ': after the blocked send the 👉 still points at the field (' + after + ')');
    await page.locator('#f-' + key).fill('あ'.repeat(60));
    await page.locator('#hn-card h2').click();
    await settle(400);
    const fixed = await oneMark(page, 'N1 ' + key + ' fixed');
    check(fixed.includes('確認のボタン'), 'N1 ' + key + ': once fixed the 👉 goes back to the confirm button (' + fixed + ')');
    await ctx.close();
  }
  /* N1b both optional answers too long: the upper one (table order) gets the 👉 */
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await fillBase(page);
    await fillHn(page, { hnOther: 'あ'.repeat(61), hnJob: 'い'.repeat(61) });
    await page.locator('#hn-card h2').click();
    await settle(400);
    const mark = await oneMark(page, 'N1b both too long');
    check(mark.includes('他格闘歴を直す'), 'N1b both too long: the 👉 is on the upper one, 他格闘歴 (' + mark + ')');
    await ctx.close();
  }

  /* N2 (320px): every 👉 in the card is at most 2 lines and does not reach into the text of the control above */
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await fillBase(page);
    const seen = [];
    for (const item of HANAMICHI_ASKED_ITEMS) {
      const g = await hnBadge(page);
      if (g) {
        seen.push(g.id + ':' + g.h + '/' + g.overlap);
        check(g.h <= 66, 'N2 ' + g.id + ': the 👉 is at most 2 lines (' + g.h + 'px; ' + short(g.text, 40) + ')');
        check(g.overlap <= 12, 'N2 ' + g.id + ': the 👉 stays off the text of the control above (reaches ' + g.overlap + 'px into it)');
      }
      if (item.key === 'hnBirth') await fillBirth(page, BIRTH_GOOD);
      else if (HN_GOOD[item.key]) await page.locator('#f-' + item.key).fill(HN_GOOD[item.key]);
      await page.locator('#hn-card h2').click();
      await settle(250);
    }
    check(seen.length >= 10, 'N2 the 👉 was seen on the ' + seen.length + ' required items (' + short(seen.join(' '), 200) + ')');
    await ctx.close();
  }

  /* N3: after a blocked send, and after 「直す」 from the review, the focused field's name and the 👉 are below the red band */
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await fillBase(page);
    await reviewBtn(page).click();
    await settle(700);
    let g = await hnBand(page);
    check(g.id === 'f-hnNameKana' && g.bandBottom > 0, 'N3 blocked send: the cursor is on the first 花道 field and the band is there (' + g.id + ', band to ' + g.bandBottom + 'px)');
    check(g.labelTop >= g.bandBottom, 'N3 blocked send: the field name starts below the band (name at ' + g.labelTop + 'px, band ends ' + g.bandBottom + 'px)');
    check(g.badgeTop >= g.bandBottom - 1, 'N3 blocked send: the 👉 is below the band (👉 at ' + g.badgeTop + 'px, band ends ' + g.bandBottom + 'px)');
    check(g.labelBottom <= g.vh && g.inputTop < g.vh - 40, 'N3 blocked send: the field name and the start of the input are on the screen (name ends ' + g.labelBottom + ', input at ' + g.inputTop + ', screen ' + g.vh + ')');
    await fillHn(page);
    await toReview(page);
    await page.getByRole('button', { name: '花道の追加の質問を直す', exact: true }).click();
    await settle(700);
    g = await hnBand(page);
    check(g.id === 'f-hnNameKana' && g.bandBottom > 0, 'N3 直す: the cursor is on the first 花道 field and the band is there (' + g.id + ', band to ' + g.bandBottom + 'px)');
    check(g.labelTop >= g.bandBottom, 'N3 直す: the field name starts below the band (name at ' + g.labelTop + 'px, band ends ' + g.bandBottom + 'px)');
    check(g.labelBottom <= g.vh && g.inputTop < g.vh - 40, 'N3 直す: the field name and the start of the input are on the screen');
    // a tall field (the long answers) — the name is still not under the band
    await page.locator('#f-hnMessage').fill('');
    await page.locator('#hn-card h2').click();
    await page.getByRole('button', { name: /^あと\d+か所/ }).click();
    await settle(700);
    g = await hnBand(page);
    check(g.id === 'f-hnMessage', 'N3 「あと…か所」 goes to the empty long answer (' + g.id + ')');
    check(g.bandBottom < 0 || g.labelTop >= g.bandBottom, 'N3 long answer: the field name is not under the band');
    check(g.labelBottom <= g.vh, 'N3 long answer: the field name is on the screen');
    await ctx.close();
  }

  /* N4: the privacy fold says one thing: the same readers for the 花道 answers; the 花道 answers are in the list of what is collected */
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await page.locator('#f-division').selectOption('花道男子');
    const fold = await page.locator('#privacy-fold').evaluate((el) => el.textContent.replace(/\s+/g, ' '));
    check(/集めるもの：[^見]*花道の追加の質問の答え/.test(fold), 'N4 the 集めるもの line lists the 花道 answers (' + short(fold, 120) + ')');
    // R6a-6/7（採点からの最適化。owner 回答：花道の答えはすべてアナウンスで使う）：見る人は1つの言い方にそろえ、花道の答えは「アナウンスで読み上げることがある」とはっきり書く
    check(fold.includes('見る人：申し込みの元データは、主催者と運営スタッフだけが見ます') && !fold.includes('主催者だけが見ます'), 'N4 only one statement of who sees: 主催者と運営スタッフだけが見ます (no 主催者だけが見ます)');
    check(fold.includes('花道の質問の答え（フリガナ・リングネーム・生年月日・キック歴・練習頻度・他格闘歴・職業・趣味・始めた理由・メッセージ）は、会場のアナウンスで読み上げることがあります'), 'N4 the 花道 line says the answers may be read out at the venue');
    await page.locator('#f-division').selectOption('一般男子');
    const plain = await page.locator('#privacy-fold').evaluate((el) => el.textContent.replace(/\s+/g, ' '));
    check(!plain.includes('花道') && plain.includes('集めるもの：選手の情報・顔写真・連絡先（名前・電話・メール・写真）見る人：'), 'N4 an ordinary division: the fold is the old one, with no 花道 word');
    await ctx.close();
  }
});

/* P: fewer questions (owner 2026-10-23): the ring name is the 選手名; the age comes from the birth date; grade / age / message are not asked in the 花道 card; the shortcuts; the 60-character name */
await scenario('P', '花道: リングネームは選手名、年齢は生年月日から。学年・年齢・意気込みは出さない。近道の「選手名と同じ」・60字の選手名', [DESKTOP, PHONE], async (vp) => {
  const today = jstDateText();
  const expectAge = hanamichiAgeFrom('1975-08-20', today);
  {
    // 年齢・学年・意気込みの設定が「必須」のリンク：花道では画面に出さず、送る値は生年月日・「社会人」・花道のメッセージ
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor({ age: 'required', grade: 'required', comment: 'required' }));
    await fillBase(page, { division: '花道男子', weightClass: '無差別' });
    await fillHn(page, {}, null);
    await fillBirth(page, BIRTH_GOOD);
    await settle(200);
    check((await page.locator('#f-grade,#f-age,#f-comment').count()) === 0, 'P a 花道 division: no grade, age or message field on the page');
    check((await page.locator('#f-hnRing').count()) === 0 && (await page.locator('#f-hnRingKana').count()) === 0, 'P no ring-name field (リングネーム is 選手名)');
    await toReview(page);
    const review = await page.locator('section[aria-label="送る前の確認"]').innerText();
    check(review.includes('年齢（生年月日から自動）') && review.includes(expectAge), 'P the review shows the age from the birth date (' + expectAge + ')');
    await page.getByRole('button', { name: '花道の追加の質問を直す', exact: true }).click();
    await settle(300);
    // the post: ring name = 選手名; age = from the birth date
    await toReview(page);
    await sendBtn(page).click();
    await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
    const post = ctx.__posts.at(-1);
    check(post && post.get('age') === expectAge, 'P the POST age is the one from the birth date (' + (post && post.get('age')) + ')');
    check(post && post.get('grade') === '社会人' && post.get('comment') === HN_GOOD.hnMessage, 'P the POST grade is 社会人 and the comment is the 花道 message (' + (post && post.get('grade')) + ')');
    check(post && post.get('hnRing') === '架空選手' && post.get('hnRingKana') === HN_GOOD.hnNameKana, 'P the POST ring name is 選手名 and its reading is 氏名のフリガナ');
    await ctx.close();
  }
  {
    // 設定が「なし」（今の基本の設定）：年齢も学年も意気込みも、送らず、確認にも出さない
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await fillBase(page, { division: '花道男子', weightClass: '無差別' });
    await fillHn(page, {}, null);
    await fillBirth(page, BIRTH_GOOD);
    await toReview(page);
    const review = await page.locator('section[aria-label="送る前の確認"]').innerText();
    check(!review.includes('年齢（生年月日から自動）') && !review.includes('学年（自動）'), 'P settings off: the review shows no automatic grade or age');
    await sendBtn(page).click();
    await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
    const post = ctx.__posts.at(-1);
    check(post && post.get('age') === '' && post.get('grade') === '' && post.get('comment') === '', 'P settings off: nothing is posted for age, grade or message');
    await ctx.close();
  }
  {
    // birth this year, 1 January: age 0 is not accepted; the birth-date field says so (no dead end)
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await fillBase(page, { division: '花道男子', weightClass: '無差別' });
    await fillHn(page, {}, null);
    const thisYear = today.slice(0, 4);
    await fillBirth(page, { y: thisYear, m: '1', d: '1' });
    await reviewBtn(page).click();
    await settle(400);
    const err = await textOf(page, '#f-hnBirth-err');
    check(err.includes('0歳や、120歳をこえる年は、入れられません'), 'P age 0: the birth-date field says why (' + short(err, 80) + ')');
    await ctx.close();
  }
  {
    // 選手名 longer than 60 (it is the ring name now): red at once on the name field
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await fillBase(page, { division: '花道男子', weightClass: '無差別' });
    await page.getByLabel('選手名 必須', { exact: true }).fill('あ'.repeat(61));
    await settle(200);
    const nameErr = await textOf(page, '#f-name-err');
    check(nameErr.includes('花道のときは、選手名は60字までです'), 'P a 61-character 選手名 in 花道 is red at once (' + short(nameErr, 80) + ')');
    await ctx.close();
  }
  {
    // shortcut: 連絡先のお名前 = 選手名
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    await fillBase(page, { division: '花道男子', weightClass: '無差別', consent: false });
    await page.getByLabel('連絡先のお名前 必須', { exact: true }).fill('');
    const btn = page.getByRole('button', { name: '選手名と同じにする', exact: true });
    check((await btn.count()) === 1, 'P the grey shortcut 「選手名と同じにする」 is there while the contact name is empty');
    await btn.click();
    await settle(150);
    check((await page.getByLabel('連絡先のお名前 必須', { exact: true }).inputValue()) === '架空選手', 'P the shortcut fills the contact name with 選手名');
    await ctx.close();
  }
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
