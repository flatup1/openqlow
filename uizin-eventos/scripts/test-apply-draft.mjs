/**
 * Browser checks for the apply page's two short memories (R9): the DRAFT of what was typed (survives a reload) and the NEXT-PERSON kit (gym name + contact, 60 minutes).
 * Why they exist: pressing 「この内容で送信する」 sends the whole tab to Google (the hidden form posts with target="_self"), so "one more person" cannot be remembered in the page's
 * memory alone. Both memories live in sessionStorage ONLY (this tab; closing the tab erases them). Nothing else is stored, nothing goes on the network.
 *
 * What is checked (the privacy rules first):
 *   - the draft holds exactly the twelve athlete fields, written once 0.5 s after typing (batched), nothing else: no phone, e-mail, photo (data:image), birth date,
 *     花道 answers, consent tick, pledge tick, guardian tick, gym representative name/phone/permission tick. EVERY sessionStorage value is scanned after typing everything
 *   - the kit is written right before the form is submitted (and the draft is removed at that moment); it holds the gym name, the three contact fields, the privacy consent,
 *     the gym representative's name and phone — never the photo, the athlete fields, the 花道 answers, any pledge/guardian tick or the 「許可をとっている」 tick
 *   - reload -> a quiet banner (grey buttons, NOT the yellow 👉; exactly one 👉 in every state) -> 戻す restores (only what the link offers, no red on untouched fields), 消す deletes
 *   - reopen after a send (same tab) -> gym + contact + consent are filled, banner with 変える; 変える empties them and deletes the key; kit-only input does not trigger 「leave this page?」
 *   - a kit older than 60 min, a draft older than 12 h, a future time, another event, another mode, a wrong shape: ignored and deleted; another event's key is left alone
 *   - 「別の人を申し込む（選手の入力だけ消す）」 keeps the gym + contact and clears the athlete, the photo, the 花道 answers and every tick
 *   - storage that throws (private mode, quota): the page still works and still sends
 *   - the POST keys are unchanged; nothing leaves the machine except the (simulated) POST
 * Local-only: every request that leaves 127.0.0.1 is aborted and counted as a violation, except the apply form's POST to the (simulated) Google endpoint, answered locally.
 * All names, sentences, phones and mails are fake. Drives the REAL built page (npm run build:private).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 5621 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_TEST_BASE=http://127.0.0.1:5621 TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-apply-draft.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:5621), TOS_ONLY=A,B (scenario letters), TOS_CHROME_PATH.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { DRAFT_FIELDS, DRAFT_TTL_MS, NEVER_STORED, NEXT_NEVER_STORED, NEXT_TTL_MS } from '../core/applyDraft.ts';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';
import { HANAMICHI_ASKED_ITEMS } from '../core/hanamichi.ts';
import { publicEntryHash } from '../core/publicEntry.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:5621';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const ENDPOINT = 'https://script.google.com/macros/s/TOS_DRAFT_SIM/exec';
const launchOpts = EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' };
const browser = await chromium.launch({ headless: true, ...launchOpts });
/** a second browser with the back/forward cache ON (the default test browser turns it off): coming back from the Google page then restores the page as it was, like Safari on a phone does */
const bfBrowser = await chromium.launch({ headless: true, ...launchOpts, ignoreDefaultArgs: ['--disable-back-forward-cache'], args: ['--enable-features=BackForwardCache', '--disable-features=BackForwardCacheDisabledForTesting'] });

/* ───────────────────────── bookkeeping ───────────────────────── */
let checks = 0, cur = '-';
const failures = [], net = [], externals = [], pageErrors = [], consoleLines = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 160) => String(s).replace(/\s+/g, ' ').slice(0, n);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ───────────────────────── links and fake data ───────────────────────── */
const EVENT = 'draft-apply';
const WEIGHTS = { enabled: true, divisions: [{ name: '一般男子', classes: ['60kg以下', '60kgをこえる'] }, { name: '花道男子', classes: ['無差別'] }, { name: '小学生', classes: [] }] };
const baseCfg = { endpoint: ENDPOINT, eventId: EVENT, title: '架空テスト大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '架空連絡先 02-0000-0000', music: true, grade: 'required', age: 'required', comment: 'required', protocol: '3', mode: 'live', weights: WEIGHTS, classes: DEFAULT_CLASS_SETTINGS };
const ITEMS = ['テスト用の文です1', 'テスト用の文です2', 'テスト用の文です3'];
const PLEDGE = { items: ITEMS, guardian: 'テスト用の保護者の文です', gym: 'テスト用のジムの文です', mode: 'under18', gymMode: true, confirmed: true };
const HASH64 = '0123456789abcdef'.repeat(4);
const hashFor = (over = {}) => publicEntryHash({ ...baseCfg, ...over });
const fullHash = (over = {}) => publicEntryHash({ ...baseCfg, hanamichi: true, pledge: PLEDGE, pledgeHash: HASH64, ...over });
/** the POST keys of the old form, in order (nothing may be added by this feature) */
const OLD_KEYS = ['protocol', 'entryKey', 'mode', 'website', 'eventId', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'fighterClass', 'division', 'weightClass', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'photoDataUrl'];
const ATHLETE = { gym: '架空ジムA', name: '架空選手', height: '170', weight: '65', record: '3勝1敗', grade: '中2', age: '14', comment: '全力でがんばります', musicUrl: 'https://music.apple.com/jp/album/x/1234567890' };
const CONTACT = { name: '架空連絡', phone: '09012345678', email: 'kakuu@example.com' };
const GYM_REP = { name: '架空 責任者', phone: '09000000000' };
const SECRET_HN = { hnNameKana: 'ZQXカナ名', hnGymKana: 'ZQXカナジム', hnRing: 'ZQXリング', hnRingKana: 'ZQXリングカナ', hnOther: 'ZQX他格闘', hnJob: 'ZQX職業', hnHobby: 'ZQX趣味', hnReason: 'ZQX理由', hnMessage: 'ZQXメッセージ', hnKickYears: '7', hnPerWeek: '4' };
const DRAFT = (id = EVENT, mode = 'live') => 'tos-apply-draft:v1:' + id + ':' + mode;
const NEXT = (id = EVENT, mode = 'live') => 'tos-apply-next:v1:' + id + ':' + mode;
const MIN = 60 * 1000;

/* ───────────────────────── browser helpers ───────────────────────── */
function attach(page) {
  page.__dialogs = [];
  page.on('dialog', (d) => { page.__dialogs.push(d.type()); d.accept().catch(() => {}); });
  page.on('pageerror', (e) => { pageErrors.push({ scenario: cur, message: e.message }); });
  page.on('console', (m) => { consoleLines.push({ scenario: cur, text: m.text() }); });
}
async function newCtx(viewport, which = browser) {
  const mobile = viewport.width < 800;
  const ctx = await which.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
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
const gymBox = (p) => p.getByLabel('ジム名 必須', { exact: true });
async function openApply(ctx, hash, { wait = true, init = null } = {}) {
  const page = await ctx.newPage();
  if (init) await page.addInitScript(init);
  await page.goto(base + '/apply/' + hash);
  if (wait) await gymBox(page).waitFor({ timeout: 15000 });
  return page;
}
async function reload(page) {
  await page.reload();
  await gymBox(page).waitFor({ timeout: 15000 });
  await settle(250);
}
const val = (p, selector) => p.locator(selector).inputValue();
async function fillAthlete(page, a = ATHLETE, { division = '一般男子', weightClass = '60kgをこえる', cls = 'upper' } = {}) {
  await gymBox(page).fill(a.gym);
  await page.getByLabel('選手名 必須', { exact: true }).fill(a.name);
  await page.getByLabel('身長（cm）必須', { exact: true }).fill(a.height);
  await page.getByLabel('体重（kg）必須', { exact: true }).fill(a.weight);
  if (division) {
    await page.locator('#f-division').selectOption(division);
    if (weightClass) await page.locator('#f-weightClass').selectOption(weightClass);
  }
  await page.getByLabel('戦績 必須', { exact: true }).fill(a.record);
  if (cls) await page.locator('input[type="radio"][name="fighterClass"][value="' + cls + '"]').check();
  // 花道の区分では、学年・年齢・意気込みは画面に出ない（花道のときは、生年月日・メッセージから作る）
  for (const [label, value] of [['学年 必須', a.grade], ['年齢 必須', a.age], ['意気込み 必須', a.comment]]) {
    const field = page.getByLabel(label, { exact: true });
    if ((await field.count()) > 0) await field.fill(value);
  }
  await page.getByLabel('入場曲のリンク 必須', { exact: true }).fill(a.musicUrl);
}
async function fillContact(page, c = CONTACT, { consent = true } = {}) {
  await page.getByLabel('連絡先のお名前 必須', { exact: true }).fill(c.name);
  await page.getByLabel('電話番号 必須', { exact: true }).fill(c.phone);
  await page.getByLabel('メールアドレス 必須', { exact: true }).fill(c.email);
  if (consent) await page.locator('#f-consent').check();
}
async function addPhoto(page) {
  const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 120, 160); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
  await page.locator('input[type=file]').setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByAltText('選んだ写真').waitFor();
}
async function fillAll(page, over = {}) {
  await fillAthlete(page, ATHLETE, over);
  await fillContact(page);
  await addPhoto(page);
  await settle(150);
}
async function fillHn(page) {
  // リングネーム・そのフリガナは、選手名から作る（欄は無い）。残りの花道の欄だけ入れる
  for (const key of HANAMICHI_ASKED_ITEMS.map((item) => item.key)) { if (key !== 'hnBirth' && SECRET_HN[key] !== undefined) await page.locator('#f-' + key).fill(SECRET_HN[key]); }
  await page.locator('#f-hnBirth').selectOption('1971');
  await page.locator('#f-hnBirthM').selectOption('3');
  await page.locator('#f-hnBirthD').selectOption('9');
}
async function fillPledge(page) {
  for (let i = 1; i <= ITEMS.length; i++) await page.locator('#f-pledge' + i).check();
  if (await page.locator('#f-pledgeGuardian').count()) await page.locator('#f-pledgeGuardian').check();
  if (await page.locator('#f-gymName').count()) {
    await page.locator('#f-gymName').fill(GYM_REP.name);
    await page.locator('#f-gymPhone').fill(GYM_REP.phone);
    await page.locator('#f-gymPermission').check();
    await page.locator('#f-pledgeGym').check();
  }
  await settle(150);
}
const reviewBtn = (p) => p.getByRole('button', { name: '入力内容を確認する →', exact: true });
const sendBtn = (p) => p.getByRole('button', { name: 'この内容で送信する', exact: true });
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const nextMarks = (p) => p.evaluate(() => [...document.querySelectorAll('[data-tos-next]')].map((e) => (e.querySelector('.tos-next-badge')?.textContent || '').replace(/\s+/g, ' ').trim()));
const sideways = (p) => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
const activeId = (p) => p.evaluate(() => (document.activeElement && document.activeElement.id) || '');
async function oneMark(page, where, expectWord = '') {
  const marks = await nextMarks(page);
  check(marks.length === 1 && marks[0].includes('次はここ') && marks[0].includes('👉'), where + ': exactly one 👉 次はここ marker (' + marks.length + ': ' + short(marks.join(' | '), 100) + ')');
  if (expectWord) check((marks[0] || '').includes(expectWord), where + ': the 👉 is on ' + expectWord + ' (' + short(marks[0] || '', 60) + ')');
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
/** the storage of THIS tab (the origin's sessionStorage), as {key: value}, without the test's own keys */
const dump = (p) => p.evaluate(() => { const out = {}; try { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (!k.startsWith('__t:')) out[k] = sessionStorage.getItem(k); } } catch { /* blocked */ } return out; });
const readKey = (p, key) => p.evaluate((k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, key);
const writeKey = (p, key, value) => p.evaluate(([k, v]) => sessionStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)), [key, value]);
const localDump = (p) => p.evaluate(() => { const out = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); } return out; });
const kitRecord = (k, savedAt, id = EVENT, mode = 'live') => ({ v: 1, eventId: id, mode, savedAt, k });
const draftRecord = (f, savedAt, id = EVENT, mode = 'live') => ({ v: 1, eventId: id, mode, savedAt, f });
const KIT_K = { gym: 'キット架空ジム', contactName: 'キット連絡', contactPhone: '09033334444', contactEmail: 'kit@example.com', consent: true, gymName: '', gymPhone: '' };
const FIELD_VALUES = { gym: '架空ジムA', name: '架空選手', height: '170', weight: '65', division: '一般男子', weightClass: '60kgをこえる', fighterClass: 'upper', record: '3勝1敗', grade: '中2', age: '14', comment: '全力でがんばります', musicUrl: 'https://music.apple.com/jp/album/x/1234567890' };
/** what the form shows now (the twelve athlete fields + the contact fields + the consent) */
const formState = (p) => p.evaluate(() => {
  const v = (id) => { const e = document.getElementById(id); return e ? e.value : '(none)'; };
  const checked = document.querySelector('input[type="radio"][name="fighterClass"]:checked');
  return {
    gym: v('f-gym'), name: v('f-name'), height: v('f-height'), weight: v('f-weight'), division: v('f-division'), weightClass: v('f-weightClass'), fighterClass: checked ? checked.value : '',
    record: v('f-record'), grade: v('f-grade'), age: v('f-age'), comment: v('f-comment'), musicUrl: v('f-musicUrl'),
    contactName: v('f-contactName'), contactPhone: v('f-contactPhone'), contactEmail: v('f-contactEmail'), consent: Boolean(document.getElementById('f-consent') && document.getElementById('f-consent').checked),
    photo: document.querySelectorAll('img[alt="選んだ写真"]').length,
  };
});
const bannerInfo = (p, id) => p.evaluate((i) => {
  const e = document.getElementById(i);
  if (!e) return null;
  const buttons = [...e.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), h: Math.round(r.height), fs: parseFloat(getComputedStyle(b).fontSize), grey: !b.className.includes('tos-main') && !b.className.includes('tos-next') }; });
  return { text: e.innerText.replace(/\s+/g, ' ').trim(), role: e.getAttribute('role'), fs: parseFloat(getComputedStyle(e).fontSize), insideNext: Boolean(e.closest('[data-tos-next]')) || e.hasAttribute('data-tos-next') || Boolean(e.querySelector('[data-tos-next],.tos-next-badge')), buttons, top: Math.round(e.getBoundingClientRect().top + scrollY), fieldsTop: Math.round((document.querySelector('main fieldset') || document.body).getBoundingClientRect().top + scrollY) };
}, id);
/** a banner is quiet: a status note, text 17px+, buttons 48px+ and grey, no 👉 and no 「次はここ」, above the form */
async function quiet(page, id, where) {
  const b = await bannerInfo(page, id);
  check(Boolean(b), where + ': the banner #' + id + ' is there');
  if (!b) return null;
  check(b.role === 'status' && !b.insideNext && !b.text.includes('👉') && !b.text.includes('次はここ'), where + ': quiet (role=status, no 👉, no 次はここ, not a next-box): ' + short(b.text, 70));
  check(b.fs >= 16.99 && b.buttons.every((x) => x.h >= 47.99 && x.fs >= 16.99 && x.grey), where + ': text 17px+, buttons 48px+ and grey (' + b.buttons.map((x) => x.text + ' ' + x.h + 'px').join(', ') + ')');
  check(b.top < b.fieldsTop, where + ': the banner sits above the form');
  return b;
}

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

/* ───────────────────────── A: type -> reload -> banner -> 戻す ───────────────────────── */
await scenario('A', 'type, reload: the banner offers 戻す / 消す; 戻す puts back the twelve fields and nothing else', [DESKTOP, PHONE, SMALL], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor(), { init: () => { const orig = Storage.prototype.setItem; window.__draftWrites = 0; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('tos-apply-draft')) window.__draftWrites++; return orig.call(this, k, v); }; } });
  check((await readKey(page, DRAFT())) === null && (await page.locator('#draft-banner, #next-banner').count()) === 0, 'A nothing stored and no banner on a fresh tab');
  const hash0 = await page.evaluate(() => location.hash), title0 = await page.title();
  await oneMark(page, 'A fresh', 'ジム名');
  await fillAthlete(page);
  await fillContact(page);
  // debounce: not written at once, written once after 0.5 s
  const early = await readKey(page, DRAFT());
  await settle(900);
  const raw = await readKey(page, DRAFT());
  check(raw !== null, 'A the draft is written after typing' + (early === null ? ' (not at once)' : ' (already at once: ' + short(early, 40) + ')'));
  const writes = await page.evaluate(() => window.__draftWrites);
  check(writes >= 1 && writes <= 3, 'A the typing was written in batches, not once per key (' + writes + ' writes for ~20 field changes)');
  const parsed = JSON.parse(raw || '{}');
  check(same(Object.keys(parsed), ['v', 'eventId', 'mode', 'savedAt', 'f']) && parsed.v === 1 && parsed.eventId === EVENT && parsed.mode === 'live' && Math.abs(Date.now() - parsed.savedAt) < 60 * 1000, 'A the record is {v, eventId, mode, savedAt, f} (' + short(Object.keys(parsed).join(','), 60) + ')');
  check(same(Object.keys(parsed.f || {}), [...DRAFT_FIELDS]) && same(parsed.f, FIELD_VALUES), 'A f holds exactly the twelve fields, with the typed values (' + short(JSON.stringify(parsed.f), 140) + ')');
  // typing again: the stored text changes only after the quiet time
  await page.getByLabel('選手名 必須', { exact: true }).fill('架空選手B');
  const soon = JSON.parse((await readKey(page, DRAFT())) || '{}');
  check(soon.f && soon.f.name === '架空選手', 'A right after typing the stored name is still the old one (batched)');
  await settle(900);
  check(JSON.parse((await readKey(page, DRAFT())) || '{}').f.name === '架空選手B', 'A and 0.5 s later it is the new one');
  await page.getByLabel('選手名 必須', { exact: true }).fill('架空選手');
  await settle(900);

  await reload(page);
  const banner = await quiet(page, 'draft-banner', 'A after reload');
  check(Boolean(banner) && banner.text.includes('さっきの入力が残っています（') && /（(1分以内|\d+分前)）/.test(banner.text) && banner.text.includes('残しているのは、選手の欄だけです。連絡先・写真・同意のチェックは、残していません'), 'A the banner says what is there and how long ago, and that only the player fields are kept (contact, photo, the consent tick are not; a plain link names no 花道 / pledge words): ' + short(banner && banner.text, 110));
  check(Boolean(banner) && same(banner.buttons.map((b) => b.text), ['戻す', '消す']), 'A the banner has the buttons 戻す and 消す');
  check((await page.locator('#next-banner').count()) === 0, 'A only one banner');
  const empty = await formState(page);
  check(empty.gym === '' && empty.name === '' && empty.comment === '' && empty.division === '' && empty.fighterClass === '', 'A nothing is put back by itself (' + short(JSON.stringify(empty), 100) + ')');
  await oneMark(page, 'A banner shown', 'ジム名');
  const sw = await sideways(page);
  check(sw.sw <= sw.cw, 'A no sideways scroll with the banner (' + sw.sw + '/' + sw.cw + ')');
  check((await readKey(page, DRAFT())) === raw || JSON.parse((await readKey(page, DRAFT())) || '{}').f.name === '架空選手', 'A the stored draft is not overwritten by the empty form while the banner is shown');

  await page.getByRole('button', { name: '戻す', exact: true }).click();
  await settle(250);
  const back = await formState(page);
  check(same({ ...back, contactName: '', contactPhone: '', contactEmail: '', consent: false, photo: 0 }, { ...FIELD_VALUES, contactName: '', contactPhone: '', contactEmail: '', consent: false, photo: 0 }), 'A 戻す puts back the twelve fields (' + short(JSON.stringify(back), 160) + ')');
  check(back.contactName === '' && back.contactPhone === '' && back.contactEmail === '' && back.consent === false && back.photo === 0, 'A and ONLY them: the contact, the consent and the photo stay empty');
  check((await page.locator('#draft-banner').count()) === 0, 'A the banner is gone after 戻す');
  check((await bodyText(page)).includes('さっきの入力を戻しました'), 'A a green line says it was put back');
  check((await page.locator('.tos-input-error, [id$="-err"]').count()) === 0, 'A no red on the fields that were put back (not touched yet)');
  await oneMark(page, 'A after 戻す', '写真');
  check((await activeId(page)) === 'f-gym', 'A the cursor goes to the first field');
  await settle(900);
  check((await readKey(page, DRAFT())) !== null, 'A the put-back text is kept again (written after the quiet time)');
  check((await page.evaluate(() => location.hash)) === hash0 && (await page.title()) === title0, 'A the link (the # part) and the tab title never change: no personal value is put into them');
  await ctx.close();
});

/* ───────────────────────── B: 消す ───────────────────────── */
await scenario('B', '消す deletes the draft; reload shows no banner', [DESKTOP, PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  await fillAthlete(page);
  await settle(900);
  check((await readKey(page, DRAFT())) !== null, 'B a draft exists');
  await reload(page);
  await quiet(page, 'draft-banner', 'B banner');
  await page.getByRole('button', { name: '消す', exact: true }).click();
  await settle(250);
  check((await readKey(page, DRAFT())) === null, 'B 消す removes the key at once');
  check((await page.locator('#draft-banner').count()) === 0 && (await formState(page)).name === '', 'B the banner is gone and the form is still empty');
  await settle(900);
  check((await readKey(page, DRAFT())) === null, 'B the empty form does not write a new draft');
  await reload(page);
  check((await page.locator('#draft-banner, #next-banner').count()) === 0, 'B after another reload: no banner');
  // clearing the form by hand also removes the draft (nothing stale is left)
  await fillAthlete(page);
  await settle(900);
  check((await readKey(page, DRAFT())) !== null, 'B typed again: a draft');
  for (const label of ['ジム名 必須', '選手名 必須', '身長（cm）必須', '体重（kg）必須', '戦績 必須', '学年 必須', '年齢 必須', '意気込み 必須', '入場曲のリンク 必須']) {
    const field = page.getByLabel(label, { exact: true });
    if ((await field.count()) > 0) await field.fill('');
  }
  await page.locator('#f-division').selectOption('');
  await settle(900);
  check((await readKey(page, DRAFT())) === null || (JSON.parse((await readKey(page, DRAFT())) || '{}').f || {}).fighterClass === 'upper', 'B everything erased by hand -> the draft is removed (only the class radio, which cannot be unchecked, may remain)');
  await ctx.close();
});

/* ───────────────────────── C: send -> draft removed, kit written (right before the submit) ───────────────────────── */
await scenario('C', 'send: at the moment of the submit the draft is gone and the kit is written; the POST is the old POST', [DESKTOP, PHONE], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor(), { init: () => { const orig = HTMLFormElement.prototype.requestSubmit; HTMLFormElement.prototype.requestSubmit = function (...args) { try { const keys = []; for (let i = 0; i < sessionStorage.length; i++) keys.push(sessionStorage.key(i)); sessionStorage.setItem('__t:atSubmit', JSON.stringify(keys)); } catch { /* none */ } return orig.apply(this, args); }; } });
  await fillAll(page);
  await settle(900);
  check((await readKey(page, DRAFT())) !== null && (await readKey(page, NEXT())) === null, 'C before the send: a draft, no kit');
  const post = await sendIt(page, ctx);
  check(same([...post.keys()], OLD_KEYS), 'C the POST has exactly the old keys, in the old order (' + short([...post.keys()].join(','), 80) + ')');
  check(post.get('gym') === '架空ジムA' && post.get('contactPhone') === '09012345678' && post.get('consent') === 'yes', 'C and the old values');
  await page.goto(base + '/apply/' + hashFor());
  await gymBox(page).waitFor();
  const atSubmit = JSON.parse((await readKey(page, '__t:atSubmit')) || '[]');
  check(atSubmit.includes(NEXT()) && !atSubmit.includes(DRAFT()), 'C right before the form was submitted: the kit was already written and the draft already removed (' + atSubmit.join(',') + ')');
  const s = await dump(page);
  check(same(Object.keys(s), [NEXT()]), 'C afterwards the only key is the kit (' + Object.keys(s).join(',') + ')');
  const rec = JSON.parse(s[NEXT()] || '{}');
  check(same(Object.keys(rec), ['v', 'eventId', 'mode', 'savedAt', 'k']) && rec.eventId === EVENT && rec.mode === 'live' && Math.abs(Date.now() - rec.savedAt) < 90 * 1000, 'C the kit record is {v, eventId, mode, savedAt, k}');
  check(same(Object.keys(rec.k || {}).sort(), ['consent', 'contactEmail', 'contactName', 'contactPhone', 'gym', 'gymName', 'gymPhone']), 'C k holds the seven allowed keys only (' + Object.keys(rec.k || {}).join(',') + ')');
  check(rec.k && rec.k.gym === '架空ジムA' && rec.k.contactName === '架空連絡' && rec.k.contactPhone === '09012345678' && rec.k.contactEmail === 'kakuu@example.com' && rec.k.consent === true && rec.k.gymName === '' && rec.k.gymPhone === '', 'C with the gym, the contact, the consent (no gym representative here)');
  const text = s[NEXT()] || '';
  const kText = JSON.stringify(rec.k || {});
  check(!/data:image|架空選手|3勝1敗|全力で|music\.apple|60kg|170|中2/.test(kText) && !/data:image/.test(text), 'C no photo, no athlete field in the kit');
  for (const key of NEXT_NEVER_STORED) check(!text.includes('"' + key + '"'), 'C the kit has no "' + key + '"');
  const local = await localDump(page);
  check(Object.keys(local).every((k) => k === 'tos-apply-sent-v1') && !/架空|0901|kakuu/.test(JSON.stringify(local)), 'C localStorage holds only the old sent-mark, nothing personal (' + short(JSON.stringify(local), 100) + ')');
  await ctx.close();
});

/* ───────────────────────── D: reopen with the kit ───────────────────────── */
await scenario('D', 'reopen in the same tab after a send: gym + contact + consent are filled, banner, 変える', [DESKTOP, PHONE, SMALL], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  await fillAll(page);
  await sendIt(page, ctx);
  await page.goto(base + '/apply/' + hashFor());
  await gymBox(page).waitFor();
  await settle(300);
  const banner = await quiet(page, 'next-banner', 'D kit banner');
  check(Boolean(banner) && banner.text.includes('さっきと同じジム名・連絡先を入れました。') && same(banner.buttons.map((b) => b.text), ['変える']), 'D the banner: ' + short(banner && banner.text, 90));
  check(Boolean(banner) && banner.text.includes('共用の端末（ジムのタブレットなど）では、「変える」を押すか、タブを閉じてください。'), 'D and the one-line warning for a shared device');
  const st = await formState(page);
  check(st.gym === '架空ジムA' && st.contactName === '架空連絡' && st.contactPhone === '09012345678' && st.contactEmail === 'kakuu@example.com' && st.consent === true, 'D gym, contact and consent are filled (' + short(JSON.stringify(st), 160) + ')');
  check(st.name === '' && st.height === '' && st.weight === '' && st.division === '' && st.fighterClass === '' && st.record === '' && st.grade === '' && st.age === '' && st.comment === '' && st.musicUrl === '' && st.photo === 0, 'D the athlete fields and the photo are empty');
  check((await page.locator('#draft-banner').count()) === 0, 'D only one banner');
  await oneMark(page, 'D kit shown', '選手名');
  check((await page.locator('.tos-input-error, [id$="-err"]').count()) === 0, 'D no red on the filled fields');
  const sw = await sideways(page);
  check(sw.sw <= sw.cw, 'D no sideways scroll (' + sw.sw + '/' + sw.cw + ')');
  // typing nothing new: no draft is made from the kit's gym name
  await settle(900);
  check((await readKey(page, DRAFT())) === null, 'D the kit-filled gym name alone does not become a draft');
  // leaving the page with only the kit in it does not ask 「leave this page?」; with a typed name it does
  const guard = () => page.evaluate(() => { const ev = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; });
  check((await guard()) === false, 'D with only the kit in the form, closing the tab does not ask 「leave this page?」');
  await page.getByLabel('選手名 必須', { exact: true }).fill('架空次の人');
  check((await guard()) === true, 'D after typing a name it asks again');
  await settle(900);
  const draft = JSON.parse((await readKey(page, DRAFT())) || '{}');
  check(draft.f && draft.f.name === '架空次の人' && draft.f.gym === '架空ジムA', 'D now a draft exists (the name, with the gym)');
  await page.getByLabel('選手名 必須', { exact: true }).fill('');
  await settle(900);
  check((await readKey(page, DRAFT())) === null, 'D name erased again: the gym-only draft is dropped');
  // 変える
  await page.getByRole('button', { name: '変える', exact: true }).click();
  await settle(250);
  const cleared = await formState(page);
  check(cleared.gym === '' && cleared.contactName === '' && cleared.contactPhone === '' && cleared.contactEmail === '' && cleared.consent === false, 'D 変える empties the gym, the contact and the consent');
  check((await readKey(page, NEXT())) === null && (await page.locator('#next-banner').count()) === 0, 'D and removes the key and the banner');
  check((await activeId(page)) === 'f-gym', 'D the cursor goes to the gym field');
  await reload(page);
  check((await page.locator('#next-banner, #draft-banner').count()) === 0 && (await formState(page)).gym === '', 'D after a reload nothing comes back');
  await ctx.close();
});

/* ───────────────────────── E: time limits ───────────────────────── */
await scenario('E', 'limits: kit 60 min, draft 12 h, a time in the future, wrong shapes', [DESKTOP], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  const now = () => Date.now();
  // kit: 59 min is used, 61 min is not (and is deleted)
  await writeKey(page, NEXT(), kitRecord(KIT_K, now() - 59 * MIN));
  await reload(page);
  check((await page.locator('#next-banner').count()) === 1 && (await formState(page)).gym === 'キット架空ジム', 'E a 59-minute-old kit is used');
  check(NEXT_TTL_MS === 3600000 && DRAFT_TTL_MS === 43200000, 'E the limits in core are 60 min and 12 h');
  await writeKey(page, NEXT(), kitRecord(KIT_K, now() - 61 * MIN));
  await reload(page);
  check((await page.locator('#next-banner').count()) === 0 && (await formState(page)).gym === '' && (await readKey(page, NEXT())) === null, 'E a 61-minute-old kit is ignored and deleted');
  await writeKey(page, NEXT(), kitRecord(KIT_K, now() - 3 * 3600 * 1000));
  await reload(page);
  check((await page.locator('#next-banner').count()) === 0 && (await readKey(page, NEXT())) === null, 'E a 3-hour-old kit: ignored and deleted');
  await writeKey(page, NEXT(), kitRecord(KIT_K, now() + 10 * MIN));
  await reload(page);
  check((await page.locator('#next-banner').count()) === 0 && (await readKey(page, NEXT())) === null, 'E a kit stamped in the future: ignored and deleted');
  // draft: 11 h used, 13 h not
  await writeKey(page, DRAFT(), draftRecord(FIELD_VALUES, now() - 11 * 3600 * 1000));
  await reload(page);
  const b = await bannerInfo(page, 'draft-banner');
  check(Boolean(b) && /（11時間前）/.test(b.text), 'E an 11-hour-old draft is offered, "11時間前" (' + short(b && b.text, 60) + ')');
  await writeKey(page, DRAFT(), draftRecord(FIELD_VALUES, now() - 13 * 3600 * 1000));
  await reload(page);
  check((await page.locator('#draft-banner').count()) === 0 && (await readKey(page, DRAFT())) === null, 'E a 13-hour-old draft is ignored and deleted');
  await writeKey(page, DRAFT(), draftRecord(FIELD_VALUES, now() + 5 * MIN));
  await reload(page);
  check((await page.locator('#draft-banner').count()) === 0 && (await readKey(page, DRAFT())) === null, 'E a draft stamped in the future: ignored and deleted');
  // a draft that is 90 min old says so
  await writeKey(page, DRAFT(), draftRecord(FIELD_VALUES, now() - 90 * MIN));
  await reload(page);
  check(/（1時間前）/.test((await bannerInfo(page, 'draft-banner'))?.text || ''), 'E a 90-minute-old draft says 1時間前');
  await page.getByRole('button', { name: '消す', exact: true }).click();
  // wrong shapes: removed, no banner, no crash
  for (const [name, raw] of [['not json', 'not json'], ['an array', '[]'], ['a string', '"x"'], ['null', 'null'], ['no f', JSON.stringify({ v: 1, eventId: EVENT, mode: 'live', savedAt: now() })], ['f is an array', JSON.stringify({ v: 1, eventId: EVENT, mode: 'live', savedAt: now(), f: [] })], ['version 2', JSON.stringify({ v: 2, eventId: EVENT, mode: 'live', savedAt: now(), f: FIELD_VALUES })], ['savedAt is a string', JSON.stringify({ v: 1, eventId: EVENT, mode: 'live', savedAt: String(now()), f: FIELD_VALUES })], ['empty f', JSON.stringify({ v: 1, eventId: EVENT, mode: 'live', savedAt: now(), f: {} })]]) {
    await writeKey(page, DRAFT(), raw);
    await writeKey(page, NEXT(), raw);
    await reload(page);
    check((await page.locator('#draft-banner, #next-banner').count()) === 0 && (await readKey(page, DRAFT())) === null && (await readKey(page, NEXT())) === null, 'E a record that is ' + name + ': no banner, both keys deleted');
  }
  await ctx.close();
});

/* ───────────────────────── F: another event, another mode ───────────────────────── */
await scenario('F', 'another event or mode is never read; its key is left alone; extra keys inside a record are dropped', [DESKTOP], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  const now = Date.now();
  // another event's keys (their own names) are not read and not touched
  await writeKey(page, NEXT('other-event'), kitRecord(KIT_K, now - MIN, 'other-event'));
  await writeKey(page, DRAFT('other-event'), draftRecord(FIELD_VALUES, now - MIN, 'other-event'));
  await writeKey(page, NEXT(EVENT, 'test'), kitRecord(KIT_K, now - MIN, EVENT, 'test'));
  await writeKey(page, DRAFT(EVENT, 'test'), draftRecord(FIELD_VALUES, now - MIN, EVENT, 'test'));
  await reload(page);
  check((await page.locator('#draft-banner, #next-banner').count()) === 0 && (await formState(page)).gym === '', 'F other event / other mode: nothing is offered or filled');
  const s = await dump(page);
  check(Object.keys(s).length === 4, 'F and the four other keys are left alone (' + Object.keys(s).join(',') + ')');
  // a record under THIS key that says it is for another event or mode: ignored and deleted
  await writeKey(page, NEXT(), kitRecord(KIT_K, now - MIN, 'other-event'));
  await reload(page);
  check((await page.locator('#next-banner').count()) === 0 && (await readKey(page, NEXT())) === null, 'F a kit under this key that names another event: ignored and deleted');
  await writeKey(page, NEXT(), kitRecord(KIT_K, now - MIN, EVENT, 'test'));
  await reload(page);
  check((await page.locator('#next-banner').count()) === 0 && (await readKey(page, NEXT())) === null, 'F a kit under this key that names the test mode: ignored and deleted');
  await writeKey(page, DRAFT(), draftRecord(FIELD_VALUES, now - MIN, 'other-event'));
  await reload(page);
  check((await page.locator('#draft-banner').count()) === 0 && (await readKey(page, DRAFT())) === null, 'F a draft under this key that names another event: ignored and deleted');
  // extra keys in a record: dropped (a phone / the athlete fields in the kit never reach the form)
  await writeKey(page, NEXT(), kitRecord({ ...KIT_K, name: '漏れた選手', height: '199', photo: 'data:image/jpeg;base64,AAAA', pledge1: true, gymPermission: true, hnJob: '漏れ' }, now - MIN));
  await reload(page);
  const st = await formState(page);
  check(st.gym === 'キット架空ジム' && st.name === '' && st.height === '' && st.photo === 0, 'F extra keys inside the kit are dropped (the name stays empty)');
  await writeKey(page, DRAFT(), draftRecord({ ...FIELD_VALUES, contactPhone: '09099998888', contactEmail: 'leak@example.com', consent: true, photo: 'data:image/jpeg;base64,AAAA', hnBirth: '1975-08-20' }, now - MIN));
  await reload(page);
  await page.getByRole('button', { name: '戻す', exact: true }).click();
  await settle(200);
  const st2 = await formState(page);
  check(st2.contactPhone === '09033334444' || st2.contactPhone === '', 'F extra keys inside a draft are dropped (the phone is not the leaked one: ' + st2.contactPhone + ')');
  check(st2.contactEmail !== 'leak@example.com' && st2.photo === 0 && st2.name === '架空選手', 'F and nothing but the twelve fields came back');
  // the test mode has its own keys: a send in test mode writes the :test key, not the :live key
  const ctx2 = await newCtx(DESKTOP);
  const page2 = await openApply(ctx2, hashFor({ mode: 'test' }));
  await fillAll(page2);
  await sendIt(page2, ctx2);
  await page2.goto(base + '/apply/' + hashFor({ mode: 'test' }));
  await gymBox(page2).waitFor();
  const s2 = await dump(page2);
  check(same(Object.keys(s2), [NEXT(EVENT, 'test')]), 'F a send in test mode writes only the :test key (' + Object.keys(s2).join(',') + ')');
  check((await page2.locator('#next-banner').count()) === 1, 'F the test link uses it');
  await page2.goto(base + '/apply/' + hashFor({ mode: 'live' }));
  await gymBox(page2).waitFor();
  check((await page2.locator('#next-banner').count()) === 0 && (await formState(page2)).gym === '', 'F the live link of the same event does not see the test kit');
  await ctx2.close();
  await ctx.close();
});

/* ───────────────────────── G: storage that throws ───────────────────────── */
await scenario('G', 'storage that is blocked, throws, or is full: the page works and sends as before', [DESKTOP, PHONE], async () => {
  const variants = {
    'getter throws (private mode)': () => { Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } }); },
    'every method throws': () => { Object.defineProperty(window, 'sessionStorage', { configurable: true, value: { length: 0, key() { return null; }, clear() { throw new Error('x'); }, getItem() { throw new Error('read blocked'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() { throw new Error('remove blocked'); } } }); },
    'only the write throws (full)': () => { const real = window.sessionStorage; Object.defineProperty(window, 'sessionStorage', { configurable: true, value: { length: 0, key() { return null; }, clear() { real.clear(); }, getItem(k) { return real.getItem(k); }, setItem() { throw new DOMException('full', 'QuotaExceededError'); }, removeItem(k) { real.removeItem(k); } } }); },
    'the object is missing': () => { Object.defineProperty(window, 'sessionStorage', { configurable: true, value: null }); },
  };
  for (const [name, init] of Object.entries(variants)) {
    const ctx = await newCtx(DESKTOP);
    const errorsBefore = pageErrors.length;
    const page = await openApply(ctx, hashFor(), { init });
    await fillAll(page);
    await settle(900);
    check((await page.locator('#draft-banner, #next-banner').count()) === 0, 'G ' + name + ': no banner');
    await oneMark(page, 'G ' + name + ' (all filled)');
    const post = await sendIt(page, ctx);
    check(Boolean(post) && same([...post.keys()], OLD_KEYS) && post.get('name') === '架空選手', 'G ' + name + ': the form still sends, with the old keys');
    await page.goto(base + '/apply/' + hashFor());
    await gymBox(page).waitFor({ timeout: 15000 }).catch(() => {});
    await settle(300);
    check(pageErrors.length === errorsBefore, 'G ' + name + ': no page error (' + (pageErrors.length - errorsBefore) + ')');
    check((await bodyText(page).catch(() => '')).includes('ジム名'), 'G ' + name + ': the page still renders after a reload');
    await ctx.close();
  }
});

/* ───────────────────────── H: scan every stored value after typing everything ───────────────────────── */
await scenario('H', 'type EVERYTHING (花道, pledge, guardian, gym representative, photo, consent): the stored text holds none of it', [DESKTOP], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, fullHash());
  await fillAthlete(page, ATHLETE, { division: '花道男子', weightClass: '無差別' });
  await fillHn(page);
  await fillContact(page);
  await addPhoto(page);
  await fillPledge(page);
  await settle(900);
  check((await page.locator('#hn-card').count()) === 1 && (await page.locator('#pledge-card').count()) === 1 && (await page.locator('#pledge-guardian-box').count()) === 0 && (await page.locator('#pledge-gym-box').count()) === 1, 'H the form is fully filled: 花道 card, pledge card, no guardian box (adult from the birth date) and gym representative box all there');
  const s = await dump(page);
  check(same(Object.keys(s), [DRAFT()]), 'H sessionStorage holds exactly one key, the draft (' + Object.keys(s).join(',') + ')');
  const text = s[DRAFT()] || '';
  const parsed = JSON.parse(text || '{}');
  check(same(Object.keys(parsed.f || {}), [...DRAFT_FIELDS]) && parsed.f.division === '花道男子' && parsed.f.name === '架空選手', 'H the draft holds the twelve fields');
  // (digit patterns are tested on the VALUES only: the saved time is a 13-digit number that could contain any of them by chance)
  const valuesText = Object.values(parsed.f || {}).join('\n');
  const bad = [
    ['the contact phone', /09012345678/, true], ['the gym representative phone', /09000000000/, true], ['any phone-like number', /0\d{9,10}|\d{2,4}-\d{2,4}-\d{3,4}/, true], ['the contact mail', /kakuu@example/, false], ['any mail-like text', /[\w.+-]+@[\w-]+\.[\w.-]+/, false],
    ['a photo (data:image)', /data:image/i, false], ['a data URL', /data:/i, false], ['the base64 of a jpeg', /\/9j\/|base64/, false], ['the 花道 answers', /ZQX/, false], ['the birth date', /1971|昭和|3月9日/, true], ['a birth date shape', /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/, true],
    ['the contact name', /架空連絡/, false], ['the gym representative name', /責任者/, false], ['the pledge sentences', /テスト用/, false], ['a consent / pledge / guardian word', /consent|pledge|guardian|gymName|gymPhone|gymPermission|hn[A-Z]|birth|photo|contact/i, false],
    ['a "yes"/true tick', /"yes"|":true|"true"/, false],
  ];
  for (const [what, re, onValues] of bad) { const subject = onValues ? valuesText : text; check(!re.test(subject), 'H the stored draft has no ' + what + (re.test(subject) ? ' => ' + (subject.match(re) || [''])[0] : '')); }
  for (const key of NEVER_STORED) check(!text.includes('"' + key + '"'), 'H the stored draft has no "' + key + '" key');
  check(!Object.values(s).some((v) => /ZQX|09012345678|09000000000|kakuu@/.test(v)), 'H not a single stored value (whole sessionStorage) has any of it');
  check(same(await localDump(page), {}) && (await page.evaluate(() => document.cookie)) === '', 'H localStorage and cookies are empty while typing');
  check((await page.evaluate(() => location.hash)) === '#' + fullHash().slice(1) && !/ZQX|09012345678|kakuu/.test(await page.evaluate(() => location.href + document.title)), 'H the link and the title carry none of it');
  // a phone number or a mail typed into a free-text field is not stored (that field only)
  await page.locator('#f-hnMessage').fill('連絡は090-1234-5678まで');
  await settle(900);
  const f2 = JSON.parse((await readKey(page, DRAFT())) || '{}').f || {};
  check(f2.comment === '' && f2.name === '架空選手' && f2.record === '3勝1敗', 'H a phone number typed into 意気込み is not stored; the other fields are');
  await page.locator('#f-hnMessage').fill('メールは a@example.com です');
  await settle(900);
  check(((JSON.parse((await readKey(page, DRAFT())) || '{}').f || {}).comment) === '', 'H neither is an e-mail address');
  await page.locator('#f-hnMessage').fill('う'.repeat(5000));
  await settle(900);
  check((((JSON.parse((await readKey(page, DRAFT())) || '{}').f || {}).comment) || '').length <= 1000, 'H a 5000-character text is cut (<= 1000)');
  await page.locator('#f-hnMessage').fill(ATHLETE.comment);
  await settle(900);
  // send: draft gone; the kit holds the contact and the gym representative, and nothing of the athlete
  const post = await sendIt(page, ctx);
  check(Boolean(post) && post.get('pledge') === 'yes' && post.get('hnBirth') === '1971-03-09' && post.get('gymName') === GYM_REP.name, 'H the POST still carries the 花道 answers, the pledge and the gym representative (they go to the organiser, as before)');
  await page.goto(base + '/apply/' + fullHash());
  await gymBox(page).waitFor();
  await settle(300);
  const after = await dump(page);
  check(same(Object.keys(after), [NEXT()]), 'H after the send only the kit key is left (' + Object.keys(after).join(',') + ')');
  const kitText = after[NEXT()] || '';
  const kit = JSON.parse(kitText || '{}');
  check(kit.k && kit.k.contactPhone === '09012345678' && kit.k.contactEmail === 'kakuu@example.com' && kit.k.gymName === GYM_REP.name && kit.k.gymPhone === GYM_REP.phone && kit.k.consent === true, 'H the kit holds the contact and the gym representative (the owner chose this)');
  const kitValues = JSON.stringify(kit.k || {});
  const kitBad = [['a photo', /data:|base64/, false], ['the 花道 answers', /ZQX/, false], ['the birth date', /1971|昭和/, true], ['the pledge sentences', /テスト用/, false], ['the athlete fields', /架空選手|3勝1敗|全力で|music\.apple|一般男子|花道男子|中2|upper/, false], ['a pledge / guardian tick', /pledge|guardian|"yes"/, false], ['the 許可 tick', /gymPermission|gymConsent|permission/i, false], ['a hash', /0123456789abcdef/, false]];
  for (const [what, re, onValues] of kitBad) check(!re.test(onValues ? kitValues : kitText), 'H the kit has no ' + what);
  for (const key of NEXT_NEVER_STORED) check(!kitText.includes('"' + key + '"'), 'H the kit has no "' + key + '" key');
  // the form after reopening: the gym representative is filled (same gym), the ticks are NOT
  const rep = await page.evaluate(() => ({ name: document.getElementById('f-gymName')?.value ?? '(none)', phone: document.getElementById('f-gymPhone')?.value ?? '(none)', perm: document.getElementById('f-gymPermission')?.checked, gymTick: document.getElementById('f-pledgeGym')?.checked, items: [...document.querySelectorAll('input[id^="f-pledge"][type="checkbox"]')].filter((e) => e.checked).length }));
  check(rep.name === GYM_REP.name && rep.phone === GYM_REP.phone, 'H reopened: the gym representative name and phone are filled (' + JSON.stringify(rep) + ')');
  check(rep.perm === false && rep.gymTick === false && rep.items === 0, 'H but the 許可 tick, the gym consent tick and every pledge tick are empty again');
  const local = await localDump(page);
  check(Object.keys(local).every((k) => k === 'tos-apply-sent-v1') && !/ZQX|架空|09/.test(JSON.stringify(local)), 'H localStorage holds only the sent-mark');
  check(!consoleLines.filter((c) => c.scenario === cur).some((c) => /ZQX|09012345678|09000000000|kakuu@|data:image/.test(c.text)), 'H nothing personal was written to the console');
  await ctx.close();
});

/* ───────────────────────── J: 別の人を申し込む（選手の入力だけ消す） ───────────────────────── */
await scenario('J', '「別の人を申し込む（選手の入力だけ消す）」 keeps the gym + contact and clears the athlete and every tick', [DESKTOP, PHONE], async (vp) => {
  const ctx = await newCtx(vp, bfBrowser);
  const page = await openApply(ctx, fullHash());
  await fillAthlete(page, ATHLETE, { division: '花道男子', weightClass: '無差別' });
  await fillHn(page);
  await fillContact(page);
  await addPhoto(page);
  await fillPledge(page);
  const first = await sendIt(page, ctx);
  await page.goBack({ waitUntil: 'commit' });
  await page.getByText('受付番号の画面が出ましたか').first().waitFor({ timeout: 8000 });
  await settle(900);
  check((await readKey(page, DRAFT())) === null, 'J after coming back the form still holds the sent person, but no draft is made from it');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  check((await bodyText(page)).includes('次のボタンを押すと、選手の入力と写真が消えます。ジム名と連絡先は、そのまま残ります'), 'J the red line above the button says what is cleared and what stays');
  const old = await page.getByRole('button', { name: '別の人を申し込む（入力を消して、最初から）', exact: true }).count();
  check(old === 0, 'J the old button label is gone');
  await page.getByRole('button', { name: '別の人を申し込む（選手の入力だけ消す）', exact: true }).click();
  await settle(300);
  const st = await formState(page);
  check(st.name === '' && st.height === '' && st.weight === '' && st.division === '' && st.fighterClass === '' && st.record === '' && st.grade === '' && st.age === '' && st.comment === '' && st.musicUrl === '' && st.photo === 0, 'J the athlete fields and the photo are cleared (' + short(JSON.stringify(st), 140) + ')');
  check(st.gym === '架空ジムA' && st.contactName === '架空連絡' && st.contactPhone === '09012345678' && st.contactEmail === 'kakuu@example.com' && st.consent === true, 'J the gym name, the contact and the consent stay');
  const rest = await page.evaluate(() => ({ hnCard: document.getElementById('hn-card') ? 1 : 0, items: [...document.querySelectorAll('input[id^="f-pledge"][type="checkbox"]')].filter((e) => e.checked).length, perm: document.getElementById('f-gymPermission')?.checked, gymTick: document.getElementById('f-pledgeGym')?.checked, guardian: document.getElementById('f-pledgeGuardian')?.checked, repName: document.getElementById('f-gymName')?.value, repPhone: document.getElementById('f-gymPhone')?.value }));
  check(rest.hnCard === 0 && rest.items === 0 && !rest.perm && !rest.gymTick && !rest.guardian, 'J the 花道 card is gone and every pledge / guardian / 許可 tick is empty again (' + JSON.stringify(rest) + ')');
  check(rest.repName === GYM_REP.name && rest.repPhone === GYM_REP.phone, 'J the gym representative name and phone stay (same gym)');
  check((await activeId(page)) === 'f-name', 'J the cursor goes to the athlete name (the gym is already there)');
  check((await bodyText(page)).includes('選手の入力を消しました。ジム名と連絡先は、そのままです。'), 'J a green line says so');
  await oneMark(page, 'J after the reset', '選手名');
  check((await readKey(page, NEXT())) !== null, 'J the kit is still stored');
  const lock = await page.evaluate(() => { const b = document.getElementById('f-submit'); return { locked: b.classList.contains('tos-locked'), reason: (b.parentElement.querySelector('.tos-locked-reason')?.textContent || '').trim() }; });
  check(lock.locked, 'J the review button is grey again until the next person is filled in (' + lock.reason + ')');
  // the next person: fill the athlete, tick again, send: a new request id, the consent and the contact go along
  await fillAthlete(page, { ...ATHLETE, name: '架空次の人' }, { division: '花道男子', weightClass: '無差別' });
  await fillHn(page);
  await addPhoto(page);
  check(((await page.evaluate(() => { const b = document.getElementById('f-submit'); return b.parentElement.querySelector('.tos-locked-reason')?.textContent || ''; })).includes('誓約書の□が、あと')), 'J the pledge must be ticked again for the next person');
  await fillPledge(page);
  const second = await sendIt(page, ctx);
  check(Boolean(second) && second.get('name') === '架空次の人' && second.get('requestId') !== first.get('requestId') && second.get('contactPhone') === '09012345678' && second.get('consent') === 'yes' && second.get('gym') === '架空ジムA', 'J the second POST is a new application with the kept gym and contact (' + (second && second.get('requestId')) + ')');
  await ctx.close();
});

/* ───────────────────────── K: 戻す respects the link ───────────────────────── */
await scenario('K', '戻す only puts back what the link offers', [DESKTOP], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  const now = Date.now();
  // a division the link does not have, a class that does not belong, a class for a division without classes
  await writeKey(page, DRAFT(), draftRecord({ ...FIELD_VALUES, division: 'この区分は無い', weightClass: '9kg以下' }, now - MIN));
  await reload(page);
  await page.getByRole('button', { name: '戻す', exact: true }).click();
  await settle(250);
  let st = await formState(page);
  check(st.division === '' && st.weightClass === '(none)' && st.name === '架空選手' && st.fighterClass === 'upper', 'K a division the link does not have is not put back; the rest is (' + short(JSON.stringify(st), 120) + ')');
  await writeKey(page, DRAFT(), draftRecord({ ...FIELD_VALUES, division: '一般男子', weightClass: '999kg以下' }, now - MIN));
  await reload(page);
  await page.getByRole('button', { name: '戻す', exact: true }).click();
  await settle(250);
  st = await formState(page);
  check(st.division === '一般男子' && st.weightClass === '', 'K a class that is not in the division is not put back (the division is)');
  await writeKey(page, DRAFT(), draftRecord({ ...FIELD_VALUES, division: '小学生', weightClass: '60kg以下' }, now - MIN));
  await reload(page);
  await page.getByRole('button', { name: '戻す', exact: true }).click();
  await settle(250);
  st = await formState(page);
  check(st.division === '小学生' && st.weightClass === '(none)', 'K a division without classes: only the division');
  // a link without the class choice: the class is not put back (and there is no radio)
  const page2 = await openApply(ctx, hashFor({ classes: undefined }));
  await writeKey(page2, DRAFT(), draftRecord(FIELD_VALUES, now - MIN));
  await reload(page2);
  await page2.getByRole('button', { name: '戻す', exact: true }).click();
  await settle(250);
  st = await formState(page2);
  const radios = await page2.locator('input[type="radio"][name="fighterClass"]').count();
  check(radios === 0 && st.name === '架空選手' && st.division === '一般男子', 'K a link without classes: no class box, the rest is put back (' + radios + ' radios, ' + short(JSON.stringify(st), 140) + ')');
  // a link that hides 学年 / 年齢 / 意気込み / 入場曲: those are not put back
  const page3 = await openApply(ctx, hashFor({ grade: 'off', age: 'off', comment: 'off', music: false }));
  await writeKey(page3, DRAFT(), draftRecord(FIELD_VALUES, now - MIN));
  await reload(page3);
  await page3.getByRole('button', { name: '戻す', exact: true }).click();
  await settle(250);
  st = await formState(page3);
  check(st.grade === '(none)' && st.age === '(none)' && st.comment === '(none)' && st.musicUrl === '(none)' && st.name === '架空選手', 'K fields the link does not show are not put back');
  await settle(900);
  const rewritten = JSON.parse((await readKey(page3, DRAFT())) || '{}').f || {};
  check(rewritten.grade === '' && rewritten.age === '' && rewritten.comment === '' && rewritten.musicUrl === '', 'K and they are not written back either');
  await ctx.close();
});

/* ───────────────────────── L: no red right after 戻す; the ordinary check still catches it ───────────────────────── */
await scenario('L', 'after 戻す the untouched fields show no red; the ordinary check finds the mistakes when asked', [DESKTOP], async () => {
  const ctx = await newCtx(DESKTOP);
  const page = await openApply(ctx, hashFor());
  await writeKey(page, DRAFT(), draftRecord({ ...FIELD_VALUES, height: '300', weight: 'abc', musicUrl: 'https://example.com/x' }, Date.now() - MIN));
  await reload(page);
  await page.getByRole('button', { name: '戻す', exact: true }).click();
  await settle(300);
  check((await page.locator('.tos-input-error, [id$="-err"]').count()) === 0, 'L no red on fields that were put back and not touched');
  check((await val(page, '#f-height')) === '300' && (await val(page, '#f-weight')) === 'abc', 'L the values came back as they were');
  await reviewBtn(page).click();
  await settle(300);
  const reds = await page.evaluate(() => [...document.querySelectorAll('[id$="-err"]')].map((e) => e.id));
  check(reds.includes('f-height-err') && reds.includes('f-weight-err') && reds.includes('f-musicUrl-err'), 'L pressing 「入力内容を確認する」 shows the ordinary red for height, weight and the link (' + reds.join(',') + ')');
  await ctx.close();
});

/* ───────────────────────── M: the stored draft is not overwritten while the banner is up; a sent person is not saved again ───────────────────────── */
await scenario('M', 'the old draft stays while the banner is shown; the sent person is not saved as a new draft', [DESKTOP], async () => {
  const ctx = await newCtx(DESKTOP, bfBrowser);
  const page = await openApply(ctx, hashFor());
  await fillAthlete(page);
  await settle(900);
  await reload(page);
  const before = await readKey(page, DRAFT());
  await page.getByLabel('選手名 必須', { exact: true }).fill('入力しなおした名前');
  await settle(900);
  check((await readKey(page, DRAFT())) === before, 'M typing while the banner is shown does not overwrite the stored draft');
  await page.getByRole('button', { name: '戻す', exact: true }).click();
  await settle(250);
  check((await val(page, '#f-name')) === '架空選手', 'M 戻す puts back the saved name (the saved draft is what 戻す means)');
  // send, come back (the page is restored with the sent person still in the form): no draft is made from the sent person
  await fillContact(page);
  await addPhoto(page);
  await sendIt(page, ctx);
  await page.goBack({ waitUntil: 'commit' });
  await page.getByText('受付番号の画面が出ましたか').first().waitFor({ timeout: 8000 });
  await settle(1000);
  check((await readKey(page, DRAFT())) === null, 'M the person who was just sent is not saved as a draft (otherwise a reload would offer to send them again)');
  await page.getByLabel('選手名 必須', { exact: true }).fill('架空次の人');
  await settle(900);
  check(((JSON.parse((await readKey(page, DRAFT())) || '{}').f || {}).name) === '架空次の人', 'M but a changed form (the next person) is saved again');
  await ctx.close();
});

/* ───────────────────────── O: both a draft and a kit: one banner at a time, the draft first ───────────────────────── */
await scenario('O', 'a draft and a kit together: the draft banner first (one banner), then the kit after the decision', [DESKTOP, PHONE], async (vp) => {
  for (const choose of ['戻す', '消す']) {
    const ctx = await newCtx(vp);
    const page = await openApply(ctx, hashFor());
    const now = Date.now();
    await writeKey(page, DRAFT(), draftRecord({ ...FIELD_VALUES, gym: '下書きのジム' }, now - 2 * MIN));
    await writeKey(page, NEXT(), kitRecord(KIT_K, now - 3 * MIN));
    await reload(page);
    check((await page.locator('#draft-banner').count()) === 1 && (await page.locator('#next-banner').count()) === 0, 'O ' + choose + ': only the draft banner is shown first');
    const st0 = await formState(page);
    check(st0.gym === '' && st0.contactName === '', 'O ' + choose + ': nothing is filled while the draft banner is up');
    check((await readKey(page, NEXT())) !== null, 'O ' + choose + ': the kit is kept for later');
    await oneMark(page, 'O ' + choose + ' draft banner', 'ジム名');
    await page.getByRole('button', { name: choose, exact: true }).click();
    await settle(300);
    const st = await formState(page);
    check((await page.locator('#draft-banner').count()) === 0 && (await page.locator('#next-banner').count()) === 1, 'O ' + choose + ': then the kit banner');
    check(st.contactName === 'キット連絡' && st.contactPhone === '09033334444' && st.consent === true, 'O ' + choose + ': the contact comes from the kit');
    if (choose === '戻す') check(st.gym === '下書きのジム' && st.name === '架空選手', 'O 戻す: the gym is the draft\'s (what was put back is not overwritten by the kit)');
    else check(st.gym === 'キット架空ジム' && st.name === '', 'O 消す: the gym is the kit\'s and the athlete fields are empty');
    await oneMark(page, 'O ' + choose + ' kit banner');
    await ctx.close();
  }
});

/* ───────────────────────── P: where the memory is not used ───────────────────────── */
await scenario('P', 'no memory on a closed deadline (live), a broken link or a cut link; the test link is still usable after the deadline', [DESKTOP], async () => {
  const now = Date.now();
  const ctx = await newCtx(DESKTOP);
  // deadline passed on a live link: the form is locked, nothing is offered, nothing is filled
  const page = await openApply(ctx, hashFor({ deadline: '2020-01-01' }), { wait: false });
  await page.getByText('申し込みの締切').first().waitFor({ timeout: 15000 });
  await writeKey(page, DRAFT(), draftRecord(FIELD_VALUES, now - MIN));
  await writeKey(page, NEXT(), kitRecord(KIT_K, now - MIN));
  await page.reload();
  await page.getByText('申し込みの締切').first().waitFor({ timeout: 15000 });
  await settle(400);
  check((await page.locator('#draft-banner, #next-banner').count()) === 0, 'P a live link past its deadline: no banner');
  // a cut link (no end=1): the page refuses; no banner
  const cut = hashFor().replace(/&end=1$/, '');
  const page2 = await ctx.newPage();
  await page2.goto(base + '/apply/' + cut);
  await page2.getByText('このページでは申し込めません').first().waitFor({ timeout: 15000 });
  await writeKey(page2, DRAFT(), draftRecord(FIELD_VALUES, now - MIN));
  await page2.reload();
  await page2.getByText('このページでは申し込めません').first().waitFor({ timeout: 15000 });
  await settle(300);
  check((await page2.locator('#draft-banner, #next-banner').count()) === 0, 'P a cut link: no banner');
  const s2 = await dump(page2);
  check(Object.keys(s2).length === 1, 'P and the page wrote nothing of its own (' + Object.keys(s2).join(',') + ')');
  // the test link (mode=test) after its deadline is not locked, so the memory works
  const page3 = await openApply(ctx, hashFor({ deadline: '2020-01-01', mode: 'test' }));
  await writeKey(page3, DRAFT(EVENT, 'test'), draftRecord(FIELD_VALUES, now - MIN, EVENT, 'test'));
  await reload(page3);
  check((await page3.locator('#draft-banner').count()) === 1, 'P a test link past its deadline still offers the draft');
  await ctx.close();
});

/* ───────────────────────── Q: the page text is honest (nothing says "nothing is kept") ───────────────────────── */
await scenario('Q', 'the sentences: the contact note, the caution, the 使い道, the shared-device line, the LINE note', [DESKTOP, PHONE, SMALL], async (vp) => {
  const ctx = await newCtx(vp);
  const page = await openApply(ctx, hashFor());
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  const t = await bodyText(page);
  check(!t.includes('この申し込みサイトには残りません'), 'Q the old claim 「この申し込みサイトには残りません」 is gone');
  check(!t.includes('途中でページを閉じたり、更新すると、入力は消えます'), 'Q the old claim 「途中でページを閉じたり、更新すると、入力は消えます」 is gone');
  check(t.includes('送った内容は、主催者のGoogleのシートとドライブにだけ保存されます（これは変わりません）。'), 'Q the contact note: what was sent is stored only in the organiser\'s Google sheet and Drive (unchanged; photos go to Drive)');
  check(t.includes('この画面は、入力の途中では、選手の欄（ジム名・選手名・身長・体重など）だけを、このスマホのこのページの中にだけ、一時的に覚えておけます。連絡先・写真・同意のチェックは、途中では覚えません。送信するか、「消す」を押すか、ページ（タブ）を閉じると、消えます。'), 'Q the draft sentence (what is kept: the player fields only)');
  check(t.includes('送ったあと、もう1人申し込む人のために、ジム名と連絡先を、このスマホのこのタブの中に60分だけ覚えます。タブを閉じると消えます。'), 'Q the kit sentence');
  check(t.includes('共用の端末（ジムのタブレットなど）では、「変える」を押すか、タブを閉じてください。'), 'Q the shared-device line');
  check((t.match(/共用の端末（ジムのタブレットなど）/g) || []).length >= 2, 'Q it is said both near the contact fields and in 使い道');
  check(t.includes('途中でページ（タブ）を閉じると、入力は消えます。更新したときは、選手の欄（ジム名・選手名・身長・体重など）の入力だけ、残っていることがあります（上に「戻す」が出ます）。連絡先・写真・同意のチェックは、入れ直しになります。'), 'Q the caution at the top says what a reload does (and what has to be typed again)');
  check(t.includes('個人情報の同意のチェックも、いっしょに覚えます。'), 'Q the kit sentence also names the privacy-consent tick');
  check(t.includes('※ 別のブラウザで開き直すと、入力は消えます。'), 'Q the LINE note: only another browser loses the input');
  check(t.includes('このメモは、ネットには送りません。'), 'Q and the 使い道 says the memory is not sent anywhere');
  const small = await page.evaluate(() => { const n = document.getElementById('temp-memory-note'); return n ? parseFloat(getComputedStyle(n).fontSize) : 0; });
  check(small >= 16.99, 'Q the memory note is 17px or more (' + small + ')');
  const sw = await sideways(page);
  check(sw.sw <= sw.cw, 'Q no sideways scroll (' + sw.sw + '/' + sw.cw + ')');
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
await bfBrowser.close();
console.log('\n' + checks + ' checks, ' + failures.length + ' failed.');
for (const f of failures) console.log(' - ' + f);
process.exit(failures.length ? 1 : 0);
