/**
 * Browser checks for R8-1: the 花道 entrants are NOT asked for the A/B class; they see one grey rule line instead.
 *
 * What is checked (on the public apply page /apply/ and the setup page /private/setup/):
 *   G (golden, runs on the OLD build too): a link WITHOUT hr behaves exactly as before — an ordinary division still needs a class (red error, the POST carries it),
 *     a 花道 division on such an old link still asks for the class, a link without classes never shows the class box. The POST keys are the old ones, in the old order.
 *   A: a link WITH hr (cls=on + hr=…): choosing a 花道 division removes the クラス box and shows the one rule line (grey, 17px+, not a required check, never a 👉);
 *     going back to an ordinary division brings the box back (required again); the counter "入力 N/M" loses exactly the class; the POST has an empty fighterClass
 *     and no new key; the review screen has no クラス row; an earlier red "クラスを選んでください" disappears when the division becomes 花道.
 *   B: 花道 + the extra questions (hn=on) together; 320px with a very long rule (no sideways scroll); a cut/odd hr link is refused like any cut link.
 *   S: the setup screen carries hr in the link it makes, and shows the one yellow caution line (first 30 characters + "仮の文・会長の確認が必要"), only when the sheet sends the rule.
 * Every sentence below is a fake test sentence. The real rule wording lives only in the Google script's initial value and in docs.
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation, except the apply form's POST (answered locally) and the setup page's ping (answered locally).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 5611 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/h.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_TEST_BASE=http://127.0.0.1:5611 TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-hanamichi-class.mjs; rc=$?; kill $(cat /tmp/h.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:5611), TOS_ONLY=G,A (scenario letters; G alone is what the OLD build must pass too), TOS_CHROME_PATH.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';
import { HANAMICHI_KEYS } from '../core/hanamichi.ts';
import { publicEntryHash } from '../core/publicEntry.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:5611';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const ENDPOINT = 'https://script.google.com/macros/s/TOS_HANAMICHI_CLASS_SIM/exec';
const SETUP_EP = 'https://script.google.com/macros/s/TOS_HANAMICHI_CLASS_SETUP_SIM/exec';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

/* ───────────────────────── bookkeeping ───────────────────────── */
let checks = 0, cur = '-', curW = 1280;
const failures = [], net = [], externals = [], pageErrors = [], consoleLines = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 160) => String(s).replace(/\s+/g, ' ').slice(0, n);

/* ───────────────────────── links ───────────────────────── */
/** 花道でない区分は2つ（階級あり／なし）、花道の区分も2つ（階級あり／なし） */
const WEIGHTS = { enabled: true, divisions: [{ name: '一般男子', classes: ['60kg以下', '60kgをこえる'] }, { name: '小学生', classes: [] }, { name: '花道男子', classes: ['無差別'] }, { name: '花道女子', classes: [] }] };
const baseCfg = { endpoint: ENDPOINT, eventId: 'hanamichi-class', title: '架空テスト大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '架空連絡先 02-0000-0000', music: false, grade: 'off', age: 'off', comment: 'off', protocol: '3', mode: 'live', weights: WEIGHTS };
const RULE = 'テスト用の花道の決まりです（1行）';
/** 昔のリンク（hr なし）。クラス分けは あり */
const oldHash = (over = {}) => publicEntryHash({ ...baseCfg, classes: DEFAULT_CLASS_SETTINGS, ...over });
/** 新しいリンク（hr あり） */
const newHash = (over = {}) => publicEntryHash({ ...baseCfg, classes: DEFAULT_CLASS_SETTINGS, hanamichiRule: RULE, ...over });
/** the POST keys of the old form, in order — the same before and after this change */
const OLD_KEYS = ['protocol', 'entryKey', 'mode', 'website', 'eventId', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'fighterClass', 'division', 'weightClass', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'photoDataUrl'];
const HN_GOOD = { hnNameKana: 'カクウ ハナミチイチロウ', hnGymKana: 'カクウジムエー', hnRing: '架空のタイガー', hnRingKana: 'カクウノタイガー', hnKickYears: '5', hnPerWeek: '3', hnOther: '', hnJob: '', hnHobby: '釣り', hnReason: '健康のために始めました。', hnMessage: '最後まで全力でがんばります。' };

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
  ctx.on('request', (r) => { if (/^https?:/.test(r.url())) net.push({ scenario: cur, url: r.url(), method: r.method() }); });
  ctx.on('page', attach);
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(base + '/')) return route.continue();
    if (url === ENDPOINT && req.method() === 'POST') {
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
/** the ordinary part of the form. classChoice: 'upper' | 'lower' | '' (a class is chosen only when the class box is on the page) */
async function fillBase(page, { division = '一般男子', weightClass = '60kg以下', classChoice = '', consent = true } = {}) {
  if (division) await page.locator('#f-division').selectOption(division);
  if (weightClass) await page.locator('#f-weightClass').selectOption(weightClass);
  for (const [label, value] of BASE_FIELDS) await page.getByLabel(label, { exact: true }).fill(value);
  const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 120, 160); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
  await page.locator('input[type=file]').setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByAltText('選んだ写真').waitFor();
  if (classChoice) await page.locator('input[type="radio"][name="fighterClass"][value="' + classChoice + '"]').check();
  if (consent) await page.getByRole('checkbox').check();
}
async function fillHn(page) {
  for (const key of HANAMICHI_KEYS) {
    if (key === 'hnBirth' || HN_GOOD[key] === undefined) continue;
    await page.locator('#f-' + key).fill(HN_GOOD[key]);
  }
  await page.locator('#f-hnBirth').selectOption('1975');
  await page.locator('#f-hnBirthM').selectOption('8');
  await page.locator('#f-hnBirthD').selectOption('20');
}
const reviewBtn = (p) => p.getByRole('button', { name: '入力内容を確認する →', exact: true });
const sendBtn = (p) => p.getByRole('button', { name: 'この内容で送信する', exact: true });
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const nextMarks = (p) => p.evaluate(() => [...document.querySelectorAll('[data-tos-next]')].map((e) => (e.querySelector('.tos-next-badge')?.textContent || '').replace(/\s+/g, ' ').trim()));
const counter = async (p) => { const m = (await bodyText(p)).match(/入力 (\d+)\/(\d+)/); return m ? [Number(m[1]), Number(m[2])] : [-1, -1]; };
const noOverflow = (p) => p.evaluate((W) => document.documentElement.scrollWidth <= W + 1 && document.body.scrollWidth <= W + 1, curW);
const classBoxCount = (p) => p.locator('#f-fighterClass').count();
const ruleBox = (p) => p.locator('#f-hanamichiRule');
/** exactly one yellow 👉 marker, with the 👉 sign and the words (never colour only) */
async function oneMark(page, where) {
  const marks = await nextMarks(page);
  check(marks.length === 1 && marks[0].includes('次はここ') && marks[0].includes('👉'), where + ': exactly one 👉 次はここ marker (' + marks.length + ': ' + short(marks.join(' | '), 100) + ')');
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
const reviewRows = (p) => p.evaluate(() => [...document.querySelectorAll('section[aria-label="送る前の確認"] dt')].map((e) => e.textContent.trim()));
const postKeys = (post) => (post ? [...post.keys()] : []);

async function scenario(id, title, viewports, fn) {
  if (ONLY.length && !ONLY.includes(id)) return;
  for (const vp of viewports) {
    cur = id + '@' + vp.width;
    curW = vp.width;
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

/* ───────────────────────── G (golden): a link without hr is exactly the old page ───────────────────────── */
await scenario('G', 'golden: links without hr — class still required for every division; the POST is the old one', [DESKTOP, PHONE], async (vp) => {
  // G1 an ordinary division: the class box is there and required; blocked without it; the POST carries it
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, oldHash());
    check((await classBoxCount(page)) === 1 && (await ruleBox(page).count()) === 0, 'G1 before a division: the class box is on the page, no rule line');
    await fillBase(page, { division: '一般男子', weightClass: '60kg以下' });
    check((await classBoxCount(page)) === 1 && (await page.locator('input[type="radio"][name="fighterClass"]').count()) === 2, 'G1 ordinary division: the class box with two choices');
    check(/クラス\s*必須/.test(await page.locator('#f-fighterClass legend').innerText()), 'G1 the class box says クラス 必須');
    await reviewBtn(page).click();
    await settle(400);
    const body = await bodyText(page);
    check(!(await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) && body.includes('クラスを選んでください'), 'G1 blocked without a class: the red "クラスを選んでください" is shown, no review screen');
    check((await page.locator('#f-fighterClass-err').count()) === 1, 'G1 the red error sits in the class box');
    await page.locator('input[type="radio"][name="fighterClass"][value="upper"]').check();
    const post = await sendIt(page, ctx);
    check(post && post.get('fighterClass') === 'upper' && post.get('division') === '一般男子' && post.get('weightClass') === '60kg以下', 'G1 the POST carries fighterClass=upper, division and weightClass');
    check(JSON.stringify(postKeys(post)) === JSON.stringify(OLD_KEYS), 'G1 the POST keys are exactly the old ones, in the old order (' + short(postKeys(post).join(','), 200) + ')');
    await ctx.close();
  }
  // G2 a 花道 division on an OLD link (no hr): the class is still asked for (nothing to show instead)
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, oldHash());
    await fillBase(page, { division: '花道男子', weightClass: '無差別' });
    check((await classBoxCount(page)) === 1 && (await ruleBox(page).count()) === 0, 'G2 花道 division on an old link: the class box is still there, no rule line');
    await reviewBtn(page).click();
    await settle(400);
    check((await bodyText(page)).includes('クラスを選んでください'), 'G2 blocked without a class (as before)');
    await page.locator('input[type="radio"][name="fighterClass"][value="lower"]').check();
    const post = await sendIt(page, ctx);
    check(post && post.get('fighterClass') === 'lower' && post.get('division') === '花道男子', 'G2 the POST carries fighterClass=lower');
    check(JSON.stringify(postKeys(post)) === JSON.stringify(OLD_KEYS), 'G2 the POST keys are the old ones');
    await ctx.close();
  }
  // G3 a link without classes: no class box on any division; the POST has an empty fighterClass
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, publicEntryHash({ ...baseCfg }));
    check((await classBoxCount(page)) === 0 && (await ruleBox(page).count()) === 0, 'G3 no classes in the link: no class box');
    await fillBase(page, { division: '花道男子', weightClass: '無差別' });
    check((await classBoxCount(page)) === 0, 'G3 花道 division, no classes in the link: no class box');
    const post = await sendIt(page, ctx);
    check(post && post.get('fighterClass') === '' && JSON.stringify(postKeys(post)) === JSON.stringify(OLD_KEYS), 'G3 the POST has an empty fighterClass and the old keys');
    await ctx.close();
  }
  // G4 the counter counts the class on an ordinary division and on an old-link 花道 division alike
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, oldHash());
    await page.locator('#f-division').selectOption('一般男子');
    const [, a] = await counter(page);
    await page.locator('#f-division').selectOption('花道男子');
    const [, b] = await counter(page);
    check(a > 0 && a === b, 'G4 old link: the same number of inputs for 一般男子 and 花道男子 (' + a + ' / ' + b + ')');
    await oneMark(page, 'G4');
    await ctx.close();
  }
});

/* ───────────────────────── A: a link with hr — 花道 has no class box, one rule line ───────────────────────── */
await scenario('A', 'hr link: 花道 → no class box, the rule line; an ordinary division → the class is required again', [DESKTOP, PHONE, SMALL], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, newHash());
  // A1 before a division is chosen we cannot know: the class box is on the page, no rule line
  check((await classBoxCount(page)) === 1 && (await ruleBox(page).count()) === 0, 'A1 no division yet: the class box is on the page, no rule line');
  await oneMark(page, 'A1');
  // A2 an ordinary division: the box; counter
  await page.locator('#f-division').selectOption('一般男子');
  await page.locator('#f-weightClass').selectOption('60kg以下');
  check((await classBoxCount(page)) === 1 && (await ruleBox(page).count()) === 0, 'A2 ordinary division: the class box, no rule line');
  const [, mOrdinary] = await counter(page);
  await page.locator('input[type="radio"][name="fighterClass"][value="upper"]').check();
  // A3 a 花道 division: no class box, one rule line
  await page.locator('#f-division').selectOption('花道男子');
  await page.locator('#f-weightClass').selectOption('無差別');
  check((await classBoxCount(page)) === 0 && (await page.locator('input[type="radio"][name="fighterClass"]').count()) === 0, 'A3 花道 division: no class box, no class radio');
  check((await ruleBox(page).count()) === 1, 'A3 the rule line is on the page (' + (await ruleBox(page).count()) + ')');
  const rule = await ruleBox(page).innerText();
  check(rule.replace(/^\s*i\s*/, '').trim() === RULE, 'A3 the rule line shows the sheet\'s sentence as it is (' + short(rule, 60) + ')');
  const look = await ruleBox(page).evaluate((el) => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const photo = document.getElementById('f-photo-box'), record = document.getElementById('f-record');
    const after = (a, b) => Boolean(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
    return {
      role: el.getAttribute('role'), cls: el.className, font: parseFloat(cs.fontSize), inputs: el.querySelectorAll('input,select,textarea,button').length, chips: el.textContent.includes('必須'),
      afterRecord: after(record, el), beforePhoto: after(el, photo), width: r.width, right: r.right, hasMark: Boolean(el.closest('[data-tos-next]')),
    };
  });
  check(look.role === 'note' && /tos-note/.test(look.cls) && !/tos-caution|tos-error|tos-ok/.test(look.cls), 'A3 the rule line is a grey note (not yellow, red or green): ' + look.cls);
  check(look.font >= 16.99, 'A3 the rule line is 17px or bigger (' + look.font + 'px)');
  check(look.inputs === 0 && !look.chips, 'A3 the rule line has no input and no 必須 mark (it is not a required check)');
  check(look.afterRecord && look.beforePhoto, 'A3 the rule line sits where the class box was: after 戦績, before the photo');
  check(!look.hasMark, 'A3 the rule line is not inside a 👉 marker');
  check(look.right <= vp.width + 1, 'A3 the rule line is inside the screen (right ' + Math.round(look.right) + ' of ' + vp.width + ')');
  check(await noOverflow(page), 'A3 no sideways scroll');
  const [, mHanamichi] = await counter(page);
  check(mOrdinary - mHanamichi === 1, 'A3 the counter loses exactly the class: ' + mOrdinary + ' → ' + mHanamichi);
  const marksNow = await nextMarks(page);
  check(!marksNow.some((m) => m.includes('クラス')), 'A3 the 👉 never points at the class (' + short(marksNow.join(' | '), 80) + ')');
  // A4 back to an ordinary division: the box returns; what was chosen before is still chosen; the rule line goes
  await page.locator('#f-division').selectOption('一般男子');
  await page.locator('#f-weightClass').selectOption('60kg以下');
  check((await classBoxCount(page)) === 1 && (await ruleBox(page).count()) === 0, 'A4 back to 一般男子: the class box again, no rule line');
  check(await page.locator('input[type="radio"][name="fighterClass"][value="upper"]').isChecked(), 'A4 the earlier choice (Aクラス) is still chosen');
  // 花道女子（階級のない区分）も同じ
  await page.locator('#f-division').selectOption('花道女子');
  check((await classBoxCount(page)) === 0 && (await ruleBox(page).count()) === 1, 'A4 花道女子 (no weight classes): no class box, the rule line');
  await page.locator('#f-division').selectOption('小学生');
  check((await classBoxCount(page)) === 1 && (await ruleBox(page).count()) === 0, 'A4 小学生: the class box, no rule line');
  await ctx.close();
});

await scenario('A', 'hr link: send a 花道 entry (no class, no new key); an ordinary entry still needs the class; an earlier red class error goes away', [DESKTOP, PHONE], async (vp) => {
  // A5 a 花道 entry goes through without any class; the review has no クラス row; the POST has an empty class and the old keys
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, newHash());
    await fillBase(page, { division: '花道男子', weightClass: '無差別' });
    check((await classBoxCount(page)) === 0, 'A5 filled as 花道: no class box');
    await oneMark(page, 'A5 all filled');
    await toReview(page);
    const rows = await reviewRows(page);
    check(rows.includes('出場区分') && !rows.includes('クラス'), 'A5 the review shows 出場区分 and has no クラス row (' + short(rows.join(','), 120) + ')');
    check(!/[AB]クラス/.test(await page.locator('section[aria-label="送る前の確認"]').innerText()), 'A5 no A/B class anywhere on the review');
    await sendBtn(page).click();
    await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
    const post = ctx.__posts[ctx.__posts.length - 1];
    check(post && post.get('fighterClass') === '' && post.get('division') === '花道男子' && post.get('weightClass') === '無差別', 'A5 the POST: empty fighterClass, division 花道男子, weightClass 無差別');
    check(JSON.stringify(postKeys(post)) === JSON.stringify(OLD_KEYS), 'A5 no new POST key; the old keys in the old order (' + short(postKeys(post).join(','), 200) + ')');
    // 古い選択（Aクラス）が残っていても、花道の区分では送らない
    await ctx.close();
  }
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, newHash());
    await fillBase(page, { division: '一般男子', weightClass: '60kg以下', classChoice: 'upper' });
    await page.locator('#f-division').selectOption('花道女子');
    const post = await sendIt(page, ctx);
    check(post && post.get('fighterClass') === '' && post.get('division') === '花道女子', 'A5 a class chosen BEFORE switching to 花道 is not sent (fighterClass is empty)');
    await ctx.close();
  }
  // A6 an ordinary division is still blocked without a class; the red error is in the class box
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, newHash());
    await fillBase(page, { division: '一般男子', weightClass: '60kg以下' });
    await reviewBtn(page).click();
    await settle(400);
    check((await bodyText(page)).includes('クラスを選んでください') && (await page.locator('#f-fighterClass-err').count()) === 1, 'A6 ordinary division, no class: the red "クラスを選んでください" in the class box');
    check(!(await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()), 'A6 blocked: no review screen');
    // A7 now the division becomes 花道: the red class error disappears and the page can go on
    await page.locator('#f-division').selectOption('花道男子');
    await page.locator('#f-weightClass').selectOption('無差別');
    await settle(300);
    const text = await bodyText(page);
    check((await page.locator('#f-fighterClass-err').count()) === 0 && !text.includes('クラスを選んでください') && !/直す所：[^\n]*クラス/.test(text), 'A7 after choosing 花道, no class error is left on the page');
    await oneMark(page, 'A7');
    await toReview(page);
    check((await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 1, 'A7 the review screen opens without a class');
    await ctx.close();
  }
  // A8 an ordinary entry: the class is sent, as before
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, newHash());
    await fillBase(page, { division: '一般男子', weightClass: '60kg以下', classChoice: 'lower' });
    const post = await sendIt(page, ctx);
    check(post && post.get('fighterClass') === 'lower' && JSON.stringify(postKeys(post)) === JSON.stringify(OLD_KEYS), 'A8 an ordinary entry on an hr link: fighterClass=lower and the old keys');
    await ctx.close();
  }
});

/* ───────────────────────── B: 花道 questions together; 320px with a very long rule; cut / odd links ───────────────────────── */
await scenario('B', '花道 questions (hn=on) with the rule line; very long rule at 320px; cut link', [DESKTOP, SMALL], async (vp) => {
  // B1 hn=on + hr: no class box, the 花道 card, the rule line; the POST has the 花道 keys and an empty class
  {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, newHash({ hanamichi: true }));
    await fillBase(page, { division: '花道男子', weightClass: '無差別' });
    await fillHn(page);
    check((await classBoxCount(page)) === 0 && (await ruleBox(page).count()) === 1 && (await page.locator('#hn-card').count()) === 1, 'B1 花道 + hn=on: no class box, the rule line and the 花道 card');
    await oneMark(page, 'B1 all filled');
    const post = await sendIt(page, ctx);
    check(post && post.get('fighterClass') === '' && HANAMICHI_KEYS.every((key) => post.has(key)), 'B1 the POST has the 12 花道 keys and an empty fighterClass');
    check(!postKeys(post).includes('hanamichiRule') && !postKeys(post).includes('hr'), 'B1 the rule is not posted');
    await ctx.close();
  }
  // B2 a long rule (120 full-width characters, and a 100-letter unbroken word): wraps, no sideways scroll
  for (const long of ['あ'.repeat(120), 'A'.repeat(100)]) {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, newHash({ hanamichiRule: long }));
    await page.locator('#f-division').selectOption('花道男子');
    check((await ruleBox(page).innerText()).includes(long), 'B2 the long rule is shown whole (' + long.length + ' chars)');
    check(await noOverflow(page), 'B2 no sideways scroll with a ' + long.length + '-char rule at ' + vp.width + 'px');
    const box = await ruleBox(page).boundingBox();
    check(box && box.x >= 0 && box.x + box.width <= vp.width + 1, 'B2 the rule line stays inside the screen (x ' + Math.round(box?.x ?? -1) + ', width ' + Math.round(box?.width ?? -1) + ')');
    await ctx.close();
  }
  // B3 a cut or odd link is refused like any cut link (the form is not usable)
  for (const [name, hash] of [['hr unreadable', newHash().replace(/hr=[^&]*/, 'hr=x')], ['hr cut off the end', newHash().replace(/&end=1$/, '')], ['hr without cls', newHash().replace('&cls=on', '')]]) {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hash, { wait: false });
    await page.getByText('このページでは申し込めません').waitFor({ timeout: 15000 }).catch(() => undefined);
    const text = await bodyText(page);
    check(text.includes('このページでは申し込めません') && text.includes('リンクが古いか、途中で切れています'), 'B3 ' + name + ': the page says it cannot take entries (link old or cut)');
    check((await page.getByLabel('ジム名 必須', { exact: true }).isVisible().catch(() => false)) === false && (await reviewBtn(page).isDisabled().catch(() => false)) === true, 'B3 ' + name + ': no usable form (inputs hidden, the 確認 button is locked)');
    await ctx.close();
  }
});

/* ───────────────────────── S: the setup screen makes the hr link and shows one caution line ───────────────────────── */
await scenario('S', 'setup screen: hr in the link, one yellow caution line with the first 30 characters', [DESKTOP, PHONE], async (vp) => {
  const READY = { app: 'tournament-os', protocol: 3, build: '3.20261022.7', ready: true, accepting: true, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: '架空テスト大会', date: '2099-12-01', venue: '架空体育館', venueUrl: '', organizer: '架空主催', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
  const open = async (ping, id) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: 800 }, isMobile: vp.width < 800, hasTouch: vp.width < 800, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
    ctx.on('page', attach);
    await ctx.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === base + '/template-link.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ copyUrl: 'https://docs.google.com/spreadsheets/d/' + 'P'.repeat(30) + '/copy' }) });
      if (url.startsWith(base + '/')) return route.continue();
      if (url === SETUP_EP + '?action=ping') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ping) });
      externals.push({ scenario: cur, url, method: route.request().method() });
      return route.abort();
    });
    const page = await ctx.newPage();
    await page.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* test setup only */ } }, ['tournament-setup-v3:' + id, JSON.stringify({ step: 3, endpoint: SETUP_EP, ticks: [true, true, true, true], verified: false })]);
    await page.goto(base + '/private/setup/?event=' + id);
    await page.getByText(/いまここ \d \/ 3/).first().waitFor({ timeout: 15000 });
    await page.getByText('架空テスト大会').first().waitFor({ timeout: 10000 }).catch(() => undefined);
    await settle(700);
    return { ctx, page };
  };
  const linkOf = (page) => page.locator('input[aria-label="選手に渡すURL"]').inputValue().catch(() => '');
  const cautionCount = (page) => page.evaluate(() => [...document.querySelectorAll('#hanamichi-rule-note .tos-caution')].filter((e) => e.getBoundingClientRect().height > 0).length);
  const withClasses = { ...READY, classMode: true, classes: DEFAULT_CLASS_SETTINGS, weightMode: true, weights: WEIGHTS };
  const longRule = 'テスト用の花道の決まりの文です。長い文のときは、最初の30字だけが画面に出ます。あとは「…」。確認用に長くしています。';
  // S1 a long rule: the link carries hr; the caution line shows the first 30 characters and "…", then the note
  {
    const { ctx, page } = await open({ ...withClasses, hanamichiRule: longRule }, 'hc-s1-' + vp.width);
    const link = await linkOf(page);
    check(/\/apply\/#/.test(link) && /[#&]cls=on(?:&[A-Za-z]+=[^&]*)*&hr=u[A-Za-z0-9_-]+&wc=on(?:&wd=[^&]*)?&protocol=3&mode=live&end=1$/.test(link), 'S1 the link carries hr after the class keys and before the weight keys (' + short(link.slice(-90), 100) + ')');
    check((await cautionCount(page)) === 1, 'S1 exactly one yellow caution line about the rule (' + (await cautionCount(page)) + ')');
    const text = await page.locator('#hanamichi-rule-note').innerText();
    check(text.includes('花道のルール：' + longRule.slice(0, 30) + '…（原本から写した仮の文。会長の確認が必要）') && !text.includes(longRule.slice(0, 31)), 'S1 the line: 花道のルール：+ first 30 characters + … + （原本から写した仮の文。会長の確認が必要） (' + short(text, 120) + ')');
    const style = await page.locator('#hanamichi-rule-note').evaluate((el) => { const c = el.querySelector('.tos-caution'); const cs = getComputedStyle(c); return { font: parseFloat(cs.fontSize), role: c.getAttribute('role'), icon: c.textContent.includes('⚠') }; });
    check(style.font >= 16.99 && style.role === 'note' && style.icon, 'S1 the caution is 17px+, a note, with the ⚠ sign (' + style.font + 'px)');
    check((await page.locator('[data-tos-next]').count()) <= 1, 'S1 at most ONE 👉 marker on the screen (' + (await page.locator('[data-tos-next]').count()) + ')');
    check(await noOverflow(page), 'S1 no sideways scroll');
    await ctx.close();
  }
  // S2 a short rule: no "…"
  {
    const { ctx, page } = await open({ ...withClasses, hanamichiRule: RULE }, 'hc-s2-' + vp.width);
    const text = await page.locator('#hanamichi-rule-note').innerText();
    check(text.includes('花道のルール：' + RULE + '（原本から写した仮の文。会長の確認が必要）') && !text.includes('…'), 'S2 a short rule is shown whole, without … (' + short(text, 100) + ')');
    await ctx.close();
  }
  // S3 no rule in the ping (class off / no 花道 division / old build): no hr in the link, no caution line
  for (const [name, ping] of [['no rule key', withClasses], ['class off', { ...READY, weightMode: true, weights: WEIGHTS, hanamichiRule: RULE }]]) {
    const { ctx, page } = await open(ping, 'hc-s3-' + name.length + '-' + vp.width);
    const link = await linkOf(page);
    check(/\/apply\/#/.test(link) && !/[#&]hr=/.test(link), 'S3 ' + name + ': no hr in the link');
    check((await page.locator('#hanamichi-rule-note').count()) === 0, 'S3 ' + name + ': no caution line');
    await ctx.close();
  }
  // S4 the sheet has a settings problem: the caution line is not shown (the red fix-it sentence comes first)
  {
    const message = '「花道のルール」が空です（A列が「花道のルール」の行のB列に、花道の選手に見せる1行を書いてください）';
    const { ctx, page } = await open({ ...withClasses, settingsProblem: message }, 'hc-s4-' + vp.width);
    const body = await bodyText(page);
    check(body.includes(message) && !/B3[0-9]/.test(message), 'S4 the problem sentence is shown as it is (the place is said by the row name)');
    check((await page.locator('#hanamichi-rule-note').count()) === 0, 'S4 no caution line while there is a problem');
    await ctx.close();
  }
});

/* ───────────────────────── done ───────────────────────── */
await settle(100);
for (const e of externals) failures.push('[' + e.scenario + '] EXTERNAL request attempted: ' + e.method + ' ' + e.url);
for (const e of pageErrors) failures.push('[' + e.scenario + '] page error: ' + short(e.message, 200));
const nonLocal = net.filter((n) => !n.url.startsWith(base + '/') && n.url !== ENDPOINT && n.url !== SETUP_EP + '?action=ping' && !n.url.startsWith('data:') && !/^https:\/\/docs\.google\.com\/spreadsheets\/d\/P+\/copy$/.test(n.url));
for (const n of nonLocal) failures.push('[' + n.scenario + '] network request left the app: ' + n.method + ' ' + n.url);
const badConsole = consoleLines.filter((c) => /error/i.test(c.text) && !/Failed to load resource/.test(c.text));
for (const c of badConsole) failures.push('[' + c.scenario + '] console error: ' + short(c.text, 160));
checks += 4; // the four guards above are checks too
await browser.close();
console.log('\n' + checks + ' checks, ' + failures.length + ' failed.');
for (const f of failures) console.log(' - ' + f);
process.exit(failures.length ? 1 : 0);
