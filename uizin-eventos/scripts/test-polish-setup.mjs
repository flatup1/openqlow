/**
 * 仕上げ（setup 担当）の画面試験。会長が /private/setup/ で「準備 → つなぐ → 渡す」を進めるときの、迷いやすい所を1つずつ確かめる。
 * Local-only: Google is simulated (a fake endpoint answers GET ?action=ping); every other request that leaves 127.0.0.1 is aborted and counted.
 * Fake data only. It drives the REAL built pages (npm run build:private -> out-private-pages).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4993 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-polish-setup.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4993), TOS_CHROME_PATH, TOS_ONLY=S1,S2 (scenario ids).
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';
import { EXPECTED_RECEPTION_BUILD } from '../core/setupV3.ts';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4993';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

const ENDPOINT = 'https://script.google.com/macros/s/TOS_POLISH_SETUP_SIM/exec';
const COPY_URL = 'https://docs.google.com/spreadsheets/d/' + 'P'.repeat(30) + '/copy';
const READY = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: false, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: '架空テスト大会', date: '2099-12-01', venue: '架空体育館', venueUrl: '', organizer: '架空主催', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
const BASE_PING = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD };

let checks = 0, cur = '-';
const failures = [], externals = [], pageErrors = [], pings = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 160) => String(s).replace(/\s+/g, ' ').slice(0, n);

/** 1つの文脈。Google（ENDPOINT）の返事は ctx.__ping を返す。ひな形リンクは ctx.__tpl（null なら 404）。 */
async function newCtx(vp, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
  ctx.__ping = o.ping ?? READY;
  ctx.__tpl = o.tpl === undefined ? { copyUrl: COPY_URL } : o.tpl;
  ctx.on('page', (page) => page.on('pageerror', (e) => pageErrors.push({ scenario: cur, message: e.message })));
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url === base + '/template-link.json') return ctx.__tpl ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ctx.__tpl) }) : route.fulfill({ status: 404, body: 'no' });
    if (url.startsWith(base + '/')) return route.continue();
    // 本物のGoogleは無い。受付のURLなら どれでも（古いURLも新しいURLも）、まねの返事を返す。ctx.__pingFail のときは、つながらない
    if (/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\?action=ping$/.test(url) && route.request().method() === 'GET') {
      pings.push({ scenario: cur, body: url });
      if (ctx.__pingFail) return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ctx.__ping) });
    }
    if (url === ENDPOINT + '?action=ping' && route.request().method() === 'GET') { pings.push({ scenario: cur, body: route.request().postData() }); return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ctx.__ping) }); }
    externals.push({ scenario: cur, url, method: route.request().method() });
    return route.abort();
  });
  return ctx;
}
const PC = { w: 1280, h: 800, name: '1280x800' }, PHONE = { w: 390, h: 844, name: '390x844', mobile: true }, SMALL = { w: 320, h: 568, name: '320x568', mobile: true };
const KEY = (id) => 'tournament-setup-v3:' + id;
/** 保存した進みぐあいを先に入れてから開く（step: 1〜3、ticks: 作業の✓、url: 入れたURL） */
async function openSetup(ctx, id, { step = 1, ticks = [false, false, false, false], url = '' } = {}) {
  const page = await ctx.newPage();
  await page.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* 試験の準備だけ */ } }, [KEY(id), JSON.stringify({ step, endpoint: url, ticks, verified: false })]);
  await page.goto(base + '/private/setup/?event=' + id);
  await page.getByText(/いまここ \d \/ 3/).first().waitFor({ timeout: 15000 });
  return page;
}
const frames = (p) => p.locator('[data-tos-next]');
const frameTexts = (p) => p.evaluate(() => [...document.querySelectorAll('[data-tos-next]')].map((f) => f.innerText.replace(/\s+/g, ' ').trim()));
/** 塗りのボタン（濃い色の塗り＋明るい文字）の名前 */
const filledButtons = (p) => p.evaluate(() => {
  const rgb = (c) => { const m = c.match(/[\d.]+/g) || []; return [Number(m[0]), Number(m[1]), Number(m[2]), m[3] === undefined ? 1 : Number(m[3])]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const out = [];
  for (const el of document.querySelectorAll('button,a[href],[role=button]')) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none' || el.closest('[aria-hidden="true"]')) continue;
    const bg = rgb(s.backgroundColor), fg = rgb(s.color);
    if (bg[3] > 0.78 && lum(bg) < 0.2 && lum(fg) > 0.7) out.push((el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40));
  }
  return out;
});
/** 「👉 次はここ」の枠は1つだけ。塗りのボタンがあるなら、その枠の中の1つだけ */
async function oneMarker(page, label, { primary = null } = {}) {
  const n = await frames(page).count();
  check(n === 1, label + ': exactly one yellow 「次はここ」 frame (saw ' + n + ')');
  const filled = await filledButtons(page), texts = await frameTexts(page);
  if (primary !== null) check(filled.length === primary, label + ': exactly ' + primary + ' filled button (saw ' + filled.length + ': ' + short(filled.join(' / '), 120) + ')');
  else check(filled.length <= 1, label + ': at most 1 filled button (saw ' + filled.length + ')');
  check(filled.every((f) => texts.some((t) => t.includes(f))), label + ': the filled button sits inside the yellow frame (' + short(filled.join(' / '), 80) + ')');
  return { n, filled, texts };
}
const bodyText = (p) => p.locator('main').innerText();
const hasHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

const scenarios = [];
const scenario = (id, name, fn) => scenarios.push({ id, name, fn });

/* S1: ブラウザのタブの名前（r1-75） */
scenario('S1', 'tab names stay Japanese after the layout metadata loads', async () => {
  const ctx = await newCtx(PC);
  const page = await openSetup(ctx, 'pol-s1');
  await settle(4000);
  check(await page.title() === '選手の受付をつくる', 'setup page: tab name stays 「選手の受付をつくる」 after 4s (now 「' + await page.title() + '」)');
  const live = await ctx.newPage();
  await live.goto(base + '/private/live/?event=pol-s1'); await settle(2500);
  check(await live.title() === '試合当日の画面', 'live page: tab name is Japanese 「試合当日の画面」 (now 「' + await live.title() + '」)');
  await ctx.close();
});

/* S2: 最初の画面。黄色の枠が見える所にあり、塗りのボタンは1つで枠の中。使わないカードはたたむ（B7 / r1-86 / r1-114） */
scenario('S2', 'step 1 first screen: the one next action is visible, one filled button, long cards are folded', async () => {
  for (const vp of [PC, PHONE, SMALL]) {
    const ctx = await newCtx(vp);
    const page = await openSetup(ctx, 'pol-s2-' + vp.w);
    await settle(1200);
    const label = 'step 1 first screen ' + vp.name;
    await oneMarker(page, label, { primary: 1 });
    const r = await page.evaluate(() => { const f = document.querySelector('[data-tos-next]'); const nav = document.querySelector('nav[aria-label="3つの手順"]'); const b = f.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: window.innerHeight, navBottom: nav ? nav.getBoundingClientRect().bottom : 0, docH: document.documentElement.scrollHeight }; });
    check(r.top >= r.navBottom - 2 && r.top < r.h * 0.85, label + ': the yellow frame starts inside the first screen under the step bar (top ' + Math.round(r.top) + ' / window ' + r.h + ')');
    check(r.bottom <= r.h + 4, label + ': the whole yellow frame fits in the first screen (bottom ' + Math.round(r.bottom) + ' / window ' + r.h + ')');
    check(!(await hasHScroll(page)), label + ': no horizontal scroll');
    // 作業2〜4（まだ押せない）は、見出しと「できた ✓」と理由だけ。長い説明はたたんである
    const pic = page.getByRole('img', { name: /「設定」タブの絵/ });
    check(!(await pic.isVisible()), label + ': the long 「設定」 picture of task 2 is folded while task 1 is the current one');
    check(await page.getByText('やり方を先に読む').count() === 3, label + ': tasks 2-4 offer 「やり方を先に読む」 (saw ' + await page.getByText('やり方を先に読む').count() + ')');
    check(await page.getByRole('button', { name: 'できた ✓', exact: true }).count() === 4, label + ': all four 「できた ✓」 buttons still exist');
    if (vp === PC) check(r.docH < 5200, label + ': the page is shorter than before (' + r.docH + 'px; was about 6900)');
    // 先に読みたいときは、ひらける
    await page.getByText('やり方を先に読む').first().click();
    check(await pic.isVisible(), label + ': 「やり方を先に読む」 opens the picture of task 2');
    check(!(await bodyText(page)).includes('黄色'), label + ': no colour name (黄色) is used in the instructions');
    check(await page.locator('[data-tos-next]').count() === 1, label + ': opening a fold does not add a second 「次はここ」');
    await ctx.close();
  }
});

/* S3: 4つの作業を順に押し、本物の「準備できました」ボタンで進む（B12）。毎回、枠は1つ・塗りのボタンは1つ。二度押し・Tabでも届く */
scenario('S3', 'four tasks ticked in order, the real 準備できました button, double click and Tab reach', async () => {
  for (const vp of [PC, PHONE]) {
    const ctx = await newCtx(vp);
    const page = await openSetup(ctx, 'pol-s3-' + vp.w);
    const L = 'tick path ' + vp.name;
    await oneMarker(page, L + ' start', { primary: 1 });
    check((await frameTexts(page))[0].includes('作業1'), L + ': the yellow frame starts at 作業1');
    // 「ひな形のコピーを作る」を押したあと（Googleへは出ない）
    await page.getByRole('link', { name: /ひな形のコピーを作る/ }).evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
    await page.getByRole('link', { name: /ひな形のコピーを作る/ }).click();
    await oneMarker(page, L + ' after the copy link', { primary: 1 });
    for (let i = 1; i <= 4; i++) {
      // 押せるのは、枠の中の「できた ✓」だけ
      const btn = page.locator('[data-tos-next]').getByRole('button', { name: 'できた ✓', exact: true });
      check(await btn.count() === 1, L + ': the 「できた ✓」 of task ' + i + ' is the one inside the yellow frame');
      await btn.click();
      await page.getByText('✓ できた').nth(i - 1).waitFor();
      if (i < 4) { await oneMarker(page, L + ' after task ' + i, { primary: 1 }); check((await frameTexts(page))[0].includes('作業' + (i + 1)), L + ': the yellow frame moved to 作業' + (i + 1)); }
    }
    const go2 = page.getByRole('button', { name: /「準備できました」と出た → 次へ/ });
    await oneMarker(page, L + ' all four done', { primary: 1 });
    check(await go2.isVisible() && (await go2.getAttribute('aria-disabled')) !== 'true', L + ': after the 4 ticks the real 「準備できました」 button is live');
    check(await go2.evaluate((b) => !!b.closest('[data-tos-next]')), L + ': the real 「準備できました」 button is inside the yellow frame');
    // Tab だけで届く
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
    let reached = false;
    for (let i = 0; i < 160 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => /準備できました/.test(document.activeElement?.textContent || '')); }
    check(reached, L + ': Tab reaches the real 「準備できました」 button');
    // 二度押ししても、1つ進むだけ（2回目が次の画面の別のボタンに当たらない）
    await go2.dblclick();
    await settle(900);
    check(await page.getByText('いまここ 2 / 3').count() === 1 && await page.getByText('いまここ 3 / 3').count() === 0, L + ': a double click lands on step 2 and stays there');
    await ctx.close();
  }
});

/* S4: Google側の止まり方（ping の error）ごとに、別の案内と、1つの「次はここ」（r1-58 / r1-57） */
scenario('S4', 'each Google error code gets its own guidance and exactly one next action', async () => {
  const cases = [
    { name: 'owner', ping: { ...BASE_PING, ready: false, error: 'owner' }, head: /デプロイした人のGoogleアカウントが、①を押した人とちがいます/, mark: /同じGoogleアカウントで、デプロイをやり直す/, notIn: /①がまだです/ },
    { name: 'sharing', ping: { ...BASE_PING, ready: false, error: 'sharing' }, head: /共有が、「制限付き」になっていません/, mark: /直したら、これを押す/, notIn: /①がまだです/ },
    { name: 'headers', ping: { ...BASE_PING, ready: false, error: 'headers', errorTab: '申込原本（個人情報あり）', errorCell: 'E1', errorExpected: '選手名' }, head: /申込表の1行目（見出し）が、変わっています/, body: /「申込原本（個人情報あり）」タブのE1を、「選手名」に直してください/, mark: /直したら、これを押す/, notIn: /①がまだです/ },
    { name: 'headers (test tab)', ping: { ...BASE_PING, ready: false, error: 'headers', errorTab: 'テスト申込', errorCell: 'D1', errorExpected: '所属ジム' }, head: /見出し）が、変わっています/, body: /名前を「テスト申込_古い」に変えて、メニュー「① 最初の設定」を押します/, mark: /直したら、これを押す/, notIn: /①がまだです/ },
    { name: 'missing tab', ping: { ...BASE_PING, ready: false, error: 'missing', errorTab: 'テストOS取込用' }, head: /申込表のタブが見つかりません/, body: /「テストOS取込用」タブが見つかりません/, mark: /「① 最初の設定」を押す/, notIn: /①がまだです/ },
    { name: 'not set up', ping: { ...BASE_PING, ready: false }, head: /まだ最初の設定が終わっていません（①がまだです）/, mark: /「① 最初の設定」を押す/ },
    { name: 'setup code', ping: { ...BASE_PING, ready: false, error: 'setup' }, head: /まだ最初の設定が終わっていません（①がまだです）/, mark: /「① 最初の設定」を押す/ },
  ];
  for (const c of cases) {
    for (const stepNo of [2, 3]) {
      const ctx = await newCtx(stepNo === 2 ? PC : PHONE, { ping: c.ping });
      const id = 'pol-s4-' + c.name.replace(/\W/g, '') + stepNo;
      const page = await openSetup(ctx, id, { step: stepNo, ticks: [true, true, true, true], url: ENDPOINT });
      const L = 'ping ' + c.name + ' step ' + stepNo;
      await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Googleにつながりませんでした') === false && /✕|⚠/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 8000 }).catch(() => {});
      await settle(1300);
      const text = await bodyText(page);
      check(c.head.test(text), L + ': red headline ' + c.head);
      if (c.body) check(c.body.test(text), L + ': says exactly what to fix ' + c.body);
      if (c.notIn) check(!c.notIn.test(text), L + ': does not tell the chairman to press 「① 最初の設定」 as if it were not done');
      const marks = await frameTexts(page);
      check(marks.length === 1 && c.mark.test(marks[0]), L + ': exactly one yellow frame saying ' + c.mark + ' (saw ' + short(marks.join(' | '), 120) + ')');
      if (stepNo === 2) check(await page.getByRole('button', { name: '次へ進む' }).getAttribute('aria-disabled') === 'true', L + ': 次へ進む is locked');
      await ctx.close();
    }
  }
});

/* S5: 直しものがあるあいだは、読み取り欄で「未入力」と責めない（r1-59） */
scenario('S5', 'read-back box does not blame filled cells while the sheet has a problem', async () => {
  const problems = [
    { ...BASE_PING, ready: true, accepting: false, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '「設定」タブの、次の欄を入れてください：会場' },
    { ...BASE_PING, ready: true, accepting: false, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '「大会名」は300文字までにしてください' },
    { ...BASE_PING, ready: false, error: 'headers', errorTab: 'テスト申込', errorCell: 'D1', errorExpected: '所属ジム' },
  ];
  for (const [i, ping] of problems.entries()) {
    const ctx = await newCtx(PC, { ping });
    const page = await openSetup(ctx, 'pol-s5-' + i, { step: 2, ticks: [true, true, true, true], url: ENDPOINT });
    await settle(1500);
    const text = await bodyText(page);
    check(!/未入力：/.test(text), 'problem ' + i + ': no red 「未入力」 lines for cells that are filled');
    check(!/クラス分け\s*なし（クラスは分けません）/.test(text), 'problem ' + i + ': 「クラス分け なし」 is not claimed while the sheet cannot be read');
    if (ping.ready) check(/まだ読み取れません/.test(text), 'problem ' + i + ': the box says 「まだ読み取れません」 in plain grey words');
    await oneMarker(page, 'problem ' + i);
    await ctx.close();
  }
  // 正しく読めたときは、値が出る
  const ctx = await newCtx(PC);
  const page = await openSetup(ctx, 'pol-s5-ok', { step: 2, ticks: [true, true, true, true], url: ENDPOINT });
  await page.getByText('架空テスト大会', { exact: true }).waitFor({ timeout: 8000 });
  check(!/未入力：/.test(await bodyText(page)), 'good ping: values are shown, no 未入力');
  await ctx.close();
});

/* S6: 日にちが過ぎているときは、緑の「次へ進む」の案内を出さず、1つの黄色だけ（r1-80） */
scenario('S6', 'past dates: no green 「次へ進む」 promise, one yellow frame', async () => {
  const ctx = await newCtx(PC, { ping: { ...READY, date: '2020-01-01', deadline: '2019-12-31' } });
  const page = await openSetup(ctx, 'pol-s6', { step: 2, ticks: [true, true, true, true], url: ENDPOINT });
  await page.getByText('先に直すところがあります').first().waitFor({ timeout: 8000 });
  const text = await bodyText(page);
  check(!/✓ つながりました。次は「次へ進む」を押します/.test(text) && !/✓ 受付中です/.test(text), 'past date: no green line promising 「次へ進む」');
  check(/開催日（B3）か申込締切（B8）が、過ぎた日になっています/.test(text), 'past date: says which cells to fix');
  const marks = await oneMarker(page, 'past date');
  check(/直したら、これを押す/.test(marks.texts[0] || ''), 'past date: the one yellow frame says 「直したら、これを押す」');
  check(await page.getByRole('button', { name: '次へ進む' }).getAttribute('aria-disabled') === 'true', 'past date: 次へ進む is locked');
  check(/日にちが過ぎています/.test(text), 'past date: the lock reason is printed under 次へ進む');
  await ctx.close();
});

/* S7: URLの貼りまちがい（r1-62 / r1-143） */
scenario('S7', 'pasted address mistakes get the right red words', async () => {
  const ctx = await newCtx(PC);
  const page = await openSetup(ctx, 'pol-s7', { step: 2, ticks: [true, true, true, true] });
  const input = page.locator('#endpoint');
  const table = [
    ['editor (home/projects)', 'https://script.google.com/home/projects/AKfycbyAAAAAAAAAAAAAAAAAAAAAAAAAA/edit', /Apps Scriptの編集画面のURL/, /最後まで入っていません/],
    ['editor (projects)', 'https://script.google.com/u/0/home/projects/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit', /Apps Scriptの編集画面のURL/, /最後まで入っていません/],
    ['editor (d/…/edit)', 'https://script.google.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit', /Apps Scriptの編集画面のURL/, /最後まで入っていません/],
    ['workspace', 'https://script.google.com/a/macros/example.com/s/AKfycbyAAAAAAAAAAAAAAAAAAAAAA/exec', /会社や学校のGoogleアカウントでは、使えません/, /最後まで入っていません/],
    ['cut off', 'https://script.google.com/macros/s/AKfycbyAAAAAAAAAAAAAAAAAAAAAA', /URLが最後まで入っていません/, /編集画面/],
    ['sheet', 'https://docs.google.com/spreadsheets/d/' + 'S'.repeat(30) + '/edit', /シートのURL/, /最後まで入っていません/],
  ];
  for (const [name, value, want, notWant] of table) {
    await input.fill(''); await input.fill(value); await settle(300);
    const t = await page.locator('#endpoint-problem').innerText().catch(() => '');
    check(want.test(t), 'URL ' + name + ': red words say ' + want + ' (saw ' + short(t, 80) + ')');
    check(!notWant.test(t), 'URL ' + name + ': does not use the wrong words ' + notWant);
    check(await page.locator('#endpoint-problem[role=alert]').count() === 1, 'URL ' + name + ': the red box is an alert');
    check(await page.getByRole('button', { name: 'もう一度確かめる' }).getAttribute('aria-disabled') === 'true', 'URL ' + name + ': 「もう一度確かめる」 is locked');
  }
  const editorBody = await (async () => { await input.fill('https://script.google.com/home/projects/AKfycbyAAAAAAAAAAAAAAAAAAAAAAAAAA/edit'); await settle(300); return page.locator('#endpoint-problem').innerText(); })();
  check(/デプロイのあとに出る「ウェブアプリ」のURL（…\/exec で終わる）の横の「コピー」を押します/.test(editorBody), 'editor URL: says which address to copy instead');
  await ctx.close();
});

/* S8: 古いブラウザの黄色の注意と、はじめの許可（r1-69 / r1-102 / r1-115） */
scenario('S8', 'old-browser note and the first-run permission note', async () => {
  const modern = await newCtx(PC);
  const p1 = await openSetup(modern, 'pol-s8a');
  check(await p1.getByText('Chromeで開いてください').count() === 0, 'a modern browser gets no 「Chromeで開いてください」 note');
  await modern.close();
  const old = await newCtx(PC);
  const p2 = await old.newPage();
  await p2.addInitScript(() => { const orig = CSS.supports.bind(CSS); CSS.supports = (q, v) => (/:has/.test(String(q)) ? false : orig(q, v)); });
  await p2.goto(base + '/private/setup/?event=pol-s8b'); await p2.getByText(/いまここ \d \/ 3/).first().waitFor();
  const note = p2.locator('[role=note]', { hasText: 'Chromeで開いてください' });
  check(await note.count() === 1 && await note.isVisible(), 'a browser without :has gets the yellow note 「Chromeで開いてください」');
  check(/一部が見えないことがあります/.test(await note.innerText()), 'the note says why (older Safari cannot show everything)');
  check(await note.evaluate((n) => n.classList.contains('tos-caution') && /⚠/.test(n.innerText)), 'the note is a caution with ⚠ and words (not colour only)');
  check(await p2.locator('[data-tos-next]').count() === 1, 'the note is not a second 「次はここ」');
  // 作業3の「1回目」の注意（たたんでいる説明の中）
  await p2.getByText('やり方を先に読む').nth(1).click();
  const t = await bodyText(p2);
  check(/許可の画面が出ます。そのあと、何も起きなかったり、エラーが出たりすることがあります/.test(t) && /2回押すのが、ふつうです/.test(t), 'task 3 says the first press may show a permission screen and an error, and that pressing 2 times is normal');
  await old.close();
});

/* S9: クラスの行がない古いシート・古い版の黄色の注意（r1-61 / r1-147）と、読み取り欄の言葉 */
scenario('S9', 'old sheet / old script: yellow caution about classes, never a plain 「なし」', async () => {
  const rows = [
    ['no class rows', { ...READY, classRows: false }, /このシートには、クラス分けの行がありません/, /⚠ このシートには、クラスの行がありません/],
    ['old build', { ...READY, build: '3.20261004.4' }, /このGoogleの版は、クラス分けに対応していません/, null],
  ];
  for (const [name, ping, caution, row] of rows) {
    const ctx = await newCtx(PC, { ping });
    const page = await openSetup(ctx, 'pol-s9-' + name.replace(/\W/g, ''), { step: 2, ticks: [true, true, true, true], url: ENDPOINT });
    await page.getByText('シートから読み取れた内容（まちがいがないか見てください）').waitFor({ timeout: 8000 });
    const t = await bodyText(page);
    check(caution.test(t), name + ': yellow caution ' + caution);
    if (row) check(row.test(t), name + ': the 「クラス分け」 row says ⚠ there are no class rows (not a plain なし)');
    check(await page.locator('[role=note]', { hasText: 'クラス分け' }).first().evaluate((n) => /⚠/.test(n.innerText)), name + ': the caution carries ⚠ and words');
    await ctx.close();
  }
  const on = await newCtx(PC, { ping: { ...READY, classMode: true, classes: { enabled: true, upper: { name: 'Aクラス', condition: '3勝以上', rule: '首相撲あり' }, lower: { name: 'Bクラス', condition: '2勝以下', rule: 'パンチとキックのみ' }, upperMinWins: 3 } } });
  const page = await openSetup(on, 'pol-s9-on', { step: 2, ticks: [true, true, true, true], url: ENDPOINT });
  await page.getByText('✓ あり（Aクラス／Bクラス）。申し込みページに出ます').waitFor({ timeout: 8000 });
  check(true, 'classes on: the green row names both classes');
  await on.close();
});

/* S10: 文字を大きくしても、絵が切れない・横にずれない（r1-124） */
scenario('S10', 'text enlargement: the sheet picture is not clipped, no sideways scroll', async () => {
  for (const [vp, pct] of [[PHONE, 200], [SMALL, 150], [PC, 200]]) {
    const ctx = await newCtx(vp);
    const page = await openSetup(ctx, 'pol-s10-' + vp.w + '-' + pct, { ticks: [true, false, false, false] });
    await page.evaluate((p) => { document.documentElement.style.fontSize = p + '%'; }, pct);
    await settle(400);
    const pic = page.getByRole('img', { name: /「設定」タブの絵/ });
    await pic.scrollIntoViewIfNeeded();
    const m = await pic.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    check(m.sw <= m.cw + 1, 'text ' + pct + '% at ' + vp.name + ': the 「設定」 picture is not clipped (scrollWidth ' + m.sw + ' / box ' + m.cw + ')');
    check(!(await hasHScroll(page)), 'text ' + pct + '% at ' + vp.name + ': no horizontal scroll');
    await ctx.close();
  }
});

/* S10b: 準備の画面でも、写真のない選手の札（「写真：あとでOK」）が、文字を大きくしても横にはみ出さない（r1-124） */
scenario('S10b', 'prep page: the 「写真：あとでOK」 chip stays inside the card at 200% text', async () => {
  const CSV = '管理番号,ジム名,選手名,学年,年齢,身長,体重,戦績・競技歴,試合への意気込み,入場曲URL（Apple Music推奨）\nF01,架空赤ジム,架空赤選手,小6,12,150,60,初試合,がんばる,\nF02,架空青ジム,架空青選手,中1,13,155,61.5,1戦,全力,';
  for (const [vp, pct] of [[PHONE, 200], [SMALL, 150], [PC, 200]]) {
    const ctx = await newCtx(vp);
    const page = await ctx.newPage();
    await page.goto(base + '/private/?event=pol-s10b-' + vp.w); await page.locator('#field-title').waitFor({ timeout: 15000 });
    await page.locator('#pick-file').setInputFiles({ name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await page.getByText('写真：あとでOK').first().waitFor({ timeout: 8000 });
    await page.evaluate((x) => { document.documentElement.style.fontSize = x + '%'; }, pct);
    await settle(400);
    check(!(await hasHScroll(page)), 'prep page text ' + pct + '% at ' + vp.name + ': no horizontal scroll with the 「写真：あとでOK」 chip');
    const out = await page.evaluate(() => [...document.querySelectorAll('span')].filter((s) => s.textContent === '写真：あとでOK').map((s) => Math.round(s.getBoundingClientRect().right) - window.innerWidth));
    check(out.every((d) => d <= 1), 'prep page text ' + pct + '% at ' + vp.name + ': the chip is inside the window (over by ' + out.join(',') + 'px)');
    await ctx.close();
  }
});

/* S11: 保存場所の文に、余分な空白がない（r1-98） */
scenario('S11', 'storage-full words have no stray spaces', async () => {
  const ctx = await newCtx(PC, { ping: { ...READY, storageProblem: 'Googleの保存容量が、ほとんど残っていません（あと約50MB）。写真が保存できなくなります。Driveや Gmail の要らないものを消すか、容量を追加してください。' } });
  const page = await openSetup(ctx, 'pol-s11', { step: 2, ticks: [true, true, true, true], url: ENDPOINT });
  await page.getByText('このままでは写真が保存できません').waitFor({ timeout: 8000 });
  const t = await bodyText(page);
  check(/Googleの保存場所の要らないものを消すか/.test(t) && !/Googleの保存場所 の/.test(t), 'storage: no stray space in 「Googleの保存場所の要らないものを消すか」');
  check(/ジムの担当者に「Googleの保存場所がいっぱい」と伝える/.test(t) && !/保存できる場所が いっぱい|場所が いっぱい/.test(t), 'storage: the staff message has no stray space');
  await oneMarker(page, 'storage full');
  await ctx.close();
});

/* S12: ほかの画面とのつながり（読み取り・名前）。「消した試合を元にもどす」の名前が1つ（r1-89）は /private/ の画面で確かめる */
scenario('S12', 'one name for the undo button of a removed bout', async () => {
  const ctx = await newCtx(PC);
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=pol-s12'); await page.locator('#field-title').waitFor({ timeout: 15000 });
  const src = await page.evaluate(() => [...document.scripts].map((s) => s.src).join('\n'));
  check(src.length > 0, 'the prep page loaded its scripts');
  const js = await page.evaluate(async () => { const out = []; for (const s of document.scripts) { if (!s.src) continue; try { out.push(await (await fetch(s.src)).text()); } catch { /* 同じ場所だけ */ } } return out.join('\n'); });
  check(js.includes('消した試合を元にもどす') && !js.includes('>消した試合を戻す<') && !/label:\s*['"]元にもどす['"]/.test(js), 'the removed-bout undo has one name 「消した試合を元にもどす」 in the toast and in the button');
  await ctx.close();
});

/* ═════════════════════════ 第2回（round 2） ═════════════════════════ */

/* S13: D-1 古い「別の方法で受付をつくる」画面は、公開した画面にない。リンクも文も無い。古い画面が残した覚え書きは、消える */
scenario('S13', 'D-1: the legacy google-setup page is not in the release; no link or sentence leads to it; its leftovers are cleared', async () => {
  const ctx = await newCtx(PC);
  const gone = await ctx.newPage();
  const resp = await gone.goto(base + '/private/google-setup/?event=pol-s13');
  check(resp && resp.status() === 404, 'the legacy page is not served (status ' + (resp && resp.status()) + ')');
  check(!(await gone.getByText('Google受付をつなぐ').count()) && !(await gone.getByText('主催者本人のGoogleメールアドレス').count()), 'no legacy form is shown');
  for (const path of ['/private/?event=pol-s13', '/private/setup/?event=pol-s13']) {
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('tournament-google-setup:pol-s13', JSON.stringify({ setupKey: 'k'.repeat(20), email: 'organizer@example.com' })); sessionStorage.setItem('tournament-google-setup:pol-s13', '{}'); } catch { /* 試験の準備だけ */ } });
    await page.goto(base + path);
    await page.locator('main').first().waitFor({ timeout: 15000 });
    await settle(900);
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
    check(!hrefs.some((h) => /google-setup/.test(h || '')), path + ': no link to the legacy page');
    check(!(await page.evaluate(() => document.body.textContent || '')).includes('別の方法で受付をつくる'), path + ': no 「別の方法で受付をつくる」');
    if (path.includes('/setup/')) check(await page.evaluate(() => localStorage.getItem('tournament-google-setup:pol-s13') === null && sessionStorage.getItem('tournament-google-setup:pol-s13') === null), 'setup page: the organiser e-mail / key the legacy page left in this browser are cleared');
    await page.close();
  }
  await ctx.close();
});

/* S14: r2-58 / r2-73 / B12 締切を過ぎた・止めた受付は、「受付中」「あと1つで完成」と言わない。黄色は1つ。✓は1つ */
scenario('S14', 'r2-58: a closed reception is said to be closed (not accepting) and the one yellow is the roster link; r2-73 one tick', async () => {
  const closedCases = [
    ['old Google, deadline passed', { ...READY, accepting: true, date: '2020-01-02', deadline: '2020-01-01' }, /申込は終わっています。このURLは、選手に送りません/, /締切を過ぎたので、受付は終わっています/],
    ['new Google, closedBy deadline', { ...READY, accepting: false, closedBy: 'deadline' }, /申込は終わっています。このURLは、選手に送りません/, /締切を過ぎたので、受付は終わっています/],
    ['new Google, closedBy stopped', { ...READY, accepting: false, closedBy: 'stopped' }, /申込は終わっています。このURLは、選手に送りません/, /受付を止めています。選手は、いま申し込めません/],
  ];
  for (const [name, ping, headline, reason] of closedCases) {
    const ctx = await newCtx(PC, { ping });
    const page = await openSetup(ctx, 'pol-s14', { step: 3, ticks: [true, true, true, true], url: ENDPOINT });
    await page.getByText('申込は終わっています').first().waitFor({ timeout: 9000 });
    const text = await bodyText(page);
    check(headline.test(text) && reason.test(text), name + ': says the reception is closed and why');
    check(!/✓ 受付中です/.test(text) && !/あと1つで完成です/.test(text) && !/受付のじゅんびができました/.test(text), name + ': no green 「受付中」, no 「あと1つで完成」, no 「できあがり」');
    const copy = page.getByRole('button', { name: '完成：選手へ渡すURLをコピー' });
    check(await copy.getAttribute('aria-disabled') === 'true', name + ': the copy-URL button is locked');
    check(/受付が終わっています/.test(await page.locator('#live-reason').innerText()), name + ': the lock reason is printed under it');
    check(await page.locator('input[aria-label="選手に渡すURL"]').count() === 0, name + ': no URL box to hand out');
    const marks = await oneMarker(page, name, { primary: 1 });
    check(/試合の準備の画面へ/.test(marks.texts[0] || ''), name + ': the one yellow frame is 「試合の準備の画面へ」 (' + short(marks.texts[0] || '', 80) + ')');
    check(await page.getByRole('link', { name: '申し込みが集まったら：試合の準備の画面へ' }).count() === 1, name + ': exactly one 「試合の準備の画面へ」 link');
    check(/ZIP/.test(text), name + ': the roster ZIP steps are still shown');
    await ctx.close();
  }
  // 受付中（日にちが先）：緑の ✓ は見出しの1つだけ。塗りのボタンは1つ（コピー）
  const ctx = await newCtx(PC, { ping: { ...READY, accepting: true } });
  const page = await openSetup(ctx, 'pol-s14-ok', { step: 3, ticks: [true, true, true, true], url: ENDPOINT });
  await page.getByText('✓ 受付中です').first().waitFor({ timeout: 9000 });
  const box = await page.locator('.tos-ok', { hasText: '受付中です' }).first().innerText();
  check(!/✓ 受付できます/.test(box) && (box.match(/✓/g) || []).length === 1, 'ready box: exactly one ✓ (' + short(box, 80) + ')');
  await oneMarker(page, 'step 3 ready', { primary: 1 });
  check(/選手に渡すURLをコピーする/.test((await frameTexts(page))[0] || ''), 'step 3 ready: the one yellow frame is the copy button');
  await ctx.close();
  // 開始前（②を押す）：黄色は1つ、塗りのボタンは無い（Googleでの操作の絵）
  const ctx2 = await newCtx(PC, { ping: { ...READY, accepting: false } });
  const p2 = await openSetup(ctx2, 'pol-s14-open', { step: 3, ticks: [true, true, true, true], url: ENDPOINT });
  await p2.getByText('あと1つで完成です').first().waitFor({ timeout: 9000 });
  await oneMarker(p2, 'step 3 need-open', { primary: 0 });
  await ctx2.close();
});

/* S15: r2-59 貼って確かめる道では、「自動で確かめます」と言わない。黄色は貼り直す場所 */
scenario('S15', 'r2-59: in the paste route step 3 does not promise automatic checking; the yellow is the paste fold, opened', async () => {
  const ctx = await newCtx(PC, { ping: READY });
  ctx.__pingFail = true;
  const page = await openSetup(ctx, 'pol-s15', { step: 2, ticks: [true, true, true, true], url: ENDPOINT });
  await page.getByText('Googleにつながりませんでした').first().waitFor({ timeout: 9000 });
  await page.locator('#pasted').fill(JSON.stringify({ ...READY, accepting: false }));
  await page.getByText('読めました（Googleにはつないでいません）').waitFor({ timeout: 6000 });
  await page.getByRole('button', { name: '次へ進む' }).click();
  await page.getByText('いまここ 3 / 3').waitFor();
  await settle(900);
  const text = await bodyText(page);
  check(/この画面は、貼った文字を読んでいます。自動では変わりません/.test(text), 'step 3 (pasted): says it does not change by itself');
  check(!/もどると、自動で確かめます/.test(text), 'step 3 (pasted): the false promise 「自動で確かめます」 is gone');
  const marks = await oneMarker(page, 'step 3 pasted');
  check(/貼り直す/.test(marks.texts[0] || ''), 'step 3 (pasted): the one yellow frame is the paste-again place (' + short(marks.texts[0] || '', 90) + ')');
  check(await page.locator('details:has(summary:has-text("自動で確かめられないとき")) ').first().evaluate((d) => d.open), 'step 3 (pasted): the paste fold is opened for him');
  await ctx.close();
});

/* S16: r2-63 古いURLのうしろに新しいURLを貼ったら、新しいほうを使い、黄色の注意で言う */
scenario('S16', 'r2-63: pasting a new URL after the old one keeps the NEW one and says so (no green auto-fix)', async () => {
  const OLD = 'https://script.google.com/macros/s/OLDOLDOLDOLDOLD/exec', NEW = 'https://script.google.com/macros/s/NEWNEWNEWNEWNEW/exec';
  const ctx = await newCtx(PC, { ping: READY });
  const page = await openSetup(ctx, 'pol-s16', { step: 2, ticks: [true, true, true, true], url: OLD });
  await page.getByText('✓ つながりました。次は「次へ進む」を押します。').waitFor({ timeout: 9000 });
  await page.evaluate((t) => navigator.clipboard.writeText(t), NEW);
  await page.locator('#endpoint').click(); await page.keyboard.press('End'); await page.keyboard.press('Control+V');
  await settle(900);
  check(await page.locator('#endpoint').inputValue() === NEW, 'the box now holds the NEW url (' + short(await page.locator('#endpoint').inputValue(), 90) + ')');
  const text = await bodyText(page);
  check(/2つのURLが入っていました。新しく貼ったほうのURLを使います/.test(text), 'a yellow caution says two URLs were there');
  check(!/自動で直しました/.test(text), 'no green 「自動で直しました」 when information was dropped');
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('tournament-setup-v3:pol-s16')).endpoint)) === NEW, 'the new url is the one remembered');
  // 先頭に貼っても、いまの欄とちがうほうを使う
  await page.locator('#endpoint').click(); await page.keyboard.press('Home'); await page.evaluate((t) => navigator.clipboard.writeText(t), OLD); await page.keyboard.press('Control+V');
  await settle(600);
  check(await page.locator('#endpoint').inputValue() === OLD, 'pasting at the front: the one that differs from the box is kept (' + short(await page.locator('#endpoint').inputValue(), 90) + ')');
  await ctx.close();
});

/* S17: r2-61 / r2-65 / r2-62 / r2-60 / r2-75 / r2-68 見出し・フォルダ・直し先の言い方 */
scenario('S17', 'r2-61/65/62/60/68: headers inserted/row gone, trashed folder, cell hints, and where the red box is', async () => {
  const cases = [
    ['inserted column', { ...BASE_PING, ready: false, error: 'headers', errorTab: '申込原本（個人情報あり）', errorCell: 'C1', errorExpected: '大会ID', errorInserted: true }, /C列を消してください（C列の上で右クリック →「列を削除」）/, /「大会ID」に直してください/],
    ['row deleted', { ...BASE_PING, ready: false, error: 'headers', errorTab: '申込原本（個人情報あり）', errorCell: 'A1', errorExpected: '受付番号', errorRowGone: true }, /上に1行挿入/, /「受付番号」に直してください/],
    ['trashed folder', { ...BASE_PING, ready: false, error: 'folder' }, /ゴミ箱を開き|「ゴミ箱」を開き/, /まだ最初の設定が終わっていません/],
  ];
  for (const [name, ping, want, notWant] of cases) {
    const ctx = await newCtx(PC, { ping });
    const page = await openSetup(ctx, 'pol-s17', { step: 2, ticks: [true, true, true, true], url: ENDPOINT });
    await page.locator('[role=alert]', { hasText: /1行目|写真フォルダ/ }).first().waitFor({ timeout: 9000 });
    const text = await bodyText(page);
    check(want.test(text), name + ': says the right fix');
    check(!notWant.test(text), name + ': does not say the harmful or wrong thing');
    await oneMarker(page, name);
    await ctx.close();
  }
  // 設定の直し先
  const ctx = await newCtx(PC, { ping: { ...BASE_PING, ready: true, accepting: false, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '「会場の地図URL」は、Googleマップの共有URLにするか、空にしてください。「会場」は300文字までにしてください。「大会名」は300文字までにしてください' } });
  const page = await openSetup(ctx, 'pol-s17-cells', { step: 2, ticks: [true, true, true, true], url: ENDPOINT });
  await page.getByText('シートの「設定」タブに、直すところがあります').waitFor({ timeout: 9000 });
  const text = await bodyText(page);
  check(text.includes('会場の地図URL（B5）：Googleマップの「共有」で出るURLにするか、空にする'), 'map URL → B5 with the right words');
  check(text.includes('会場（B4）：300文字までに、短くする') && text.includes('大会名（B2）：300文字までに、短くする'), 'long text cells → shorten, with the right cell');
  check(!/会場（B4）：▼から選び直す|大会名（B2）：▼から選び直す/.test(text), 'free-text cells are never told to "choose from the ▼"');
  await ctx.close();
  // 手順3：「上の✕」ではなく、赤い箱は下。文もそう言う
  const c3 = await newCtx(PC, { ping: { ...BASE_PING, ready: true, accepting: false, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '「申込締切」は、2027年9月20日 のように入れてください' } });
  const p3 = await openSetup(c3, 'pol-s17-s3', { step: 3, ticks: [true, true, true, true], url: ENDPOINT });
  await p3.getByText('先に、下の「✕」の文のとおりに直します').waitFor({ timeout: 9000 });
  const pos = await p3.evaluate(() => {
    const sentence = [...document.querySelectorAll('p')].find((p) => /先に、下の「✕」の文のとおりに直します/.test(p.textContent || ''));
    const box = document.querySelector('[role=alert]');
    return { sentence: sentence.getBoundingClientRect().top, box: box ? box.getBoundingClientRect().top : -1 };
  });
  check(pos.box > pos.sentence, 'step 3: the red box is BELOW the sentence that points to it (sentence ' + Math.round(pos.sentence) + ', box ' + Math.round(pos.box) + ')');
  check(!/先に、上の「✕」/.test(await bodyText(p3)), 'step 3: never says 「上の✕」');
  await c3.close();
});

/* S18: r2-69 URLが無いのに書き出せない。書き出しは緑にならない */
scenario('S18', 'r2-69: export is locked without a URL (reason printed, no download, no green)', async () => {
  const ctx = await newCtx(PC);
  const page = await openSetup(ctx, 'pol-s18', { step: 1 });
  await page.locator('summary', { hasText: '別のパソコンで続ける' }).click();
  const btn = page.getByRole('button', { name: '設定を書き出す', exact: true });
  check(await btn.getAttribute('aria-disabled') === 'true', 'no URL: 「設定を書き出す」 is locked');
  check(/URLがまだ入っていません。手順2でURLを貼ると押せます/.test(await bodyText(page)), 'no URL: the 🔒 reason is printed');
  let downloads = 0; page.on('download', () => { downloads++; });
  await btn.click({ force: true }); await settle(700);   // 押せない見た目のボタン（aria-disabled）を、あえて押す
  check(downloads === 0, 'no URL: pressing it downloads nothing');
  const text = await bodyText(page);
  check(!/書き出しました/.test(text) && /URLがまだ入っていません。先に、手順2でURLを貼ります/.test(text), 'no URL: no green 「書き出しました」, a yellow caution instead');
  await ctx.close();
  // URL があれば、今までどおり書き出せる
  const c2 = await newCtx(PC);
  const p2 = await openSetup(c2, 'pol-s18b', { step: 3, ticks: [true, true, true, true], url: ENDPOINT });
  await p2.locator('summary', { hasText: '別のパソコンで続ける' }).click();
  const [dl] = await Promise.all([p2.waitForEvent('download'), p2.getByRole('button', { name: '設定を書き出す', exact: true }).click()]);
  check(/tournament-os-setup-pol-s18b\.json$/.test(dl.suggestedFilename()), 'with a URL it still downloads the setup file');
  await c2.close();
});

/* S19: r2-72 つながったが使えない状態を、緑の「確かめてあります」にしない（試合の準備の画面で見る） */
scenario('S19', 'r2-72: a URL that answered but cannot accept entries is not "確かめてあります"; a usable one is, with the time', async () => {
  const badPing = { ...BASE_PING, ready: false, error: 'headers', errorTab: 'テスト申込', errorCell: 'D1', errorExpected: '所属ジム' };
  for (const [name, ping, good] of [['broken headers', badPing, false], ['ready', READY, true]]) {
    const ctx = await newCtx(PC, { ping });
    const page = await openSetup(ctx, 'pol-s19-' + (good ? 'ok' : 'bad'), { step: 2, ticks: [true, true, true, true], url: ENDPOINT });
    await page.getByText(good ? '✓ つながりました。次は「次へ進む」を押します。' : '申込表の1行目（見出し）が、変わっています').first().waitFor({ timeout: 9000 });
    await settle(500);
    const saved = await page.evaluate((id) => JSON.parse(localStorage.getItem('tournament-setup-v3:' + id)), 'pol-s19-' + (good ? 'ok' : 'bad'));
    check(saved.verified === good && saved.connected === true, name + ': saved verified=' + good + ', connected=true');
    check(good ? /^\d\d:\d\d$/.test(saved.at) : saved.at === '', name + ': the time is saved only when verified (' + saved.at + ')');
    const prep = await ctx.newPage();
    await prep.goto(base + '/private/?event=pol-s19-' + (good ? 'ok' : 'bad'));
    await prep.locator('section[aria-label="この大会の申し込みページ"]').waitFor({ timeout: 15000 });
    const box = await prep.locator('section[aria-label="この大会の申し込みページ"]').innerText();
    if (good) check(/✓ 申し込みページ：つながりを確かめてあります（できた）\s*\d\d:\d\d に確かめました/.test(box), name + ': prep shows the green line with the time (' + short(box, 80) + ')');
    else check(!/✓ 申し込みページ：つながりを確かめてあります/.test(box) && /つながりました。でも、受付はまだ使えません/.test(box), name + ': prep shows the yellow 「つながりました。でも、受付はまだ使えません」 (' + short(box, 90) + ')');
    await ctx.close();
  }
});

/* S20: キーボード・低い画面・読み上げ（r2-99 / r2-101 / r2-107 / r2-108） */
scenario('S20', 'r2-99/101/107/108: nav is not sticky on short screens; Enter moves focus to the next 「できた ✓」; names carry the task', async () => {
  for (const vp of [{ w: 360, h: 380, name: '360x380', mobile: true }, { w: 640, h: 360, name: '640x360' }]) {
    const ctx = await newCtx(vp);
    const page = await openSetup(ctx, 'pol-s20-' + vp.w);
    check(await page.locator('nav[aria-label="3つの手順"]').evaluate((n) => getComputedStyle(n).position) === 'static', vp.name + ': the step bar is not sticky on a short screen (it would hide the focused control)');
    // Tab で10回進んでも、目印のある所が画面の中にある（帯の下に隠れない）
    let hidden = 0;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: window.innerHeight }; });
      if (r && (r.bottom <= 0 || r.top >= r.h)) hidden++;
    }
    check(hidden === 0, vp.name + ': 12 Tab stops, none of them outside the window (' + hidden + ')');
    await ctx.close();
  }
  const ctxPc = await newCtx(PC);
  check(await (await openSetup(ctxPc, 'pol-s20-pc')).locator('nav[aria-label="3つの手順"]').evaluate((n) => getComputedStyle(n).position) === 'sticky', '1280x800: the step bar still sticks');
  await ctxPc.close();
  const ctx = await newCtx(PC);
  const page = await openSetup(ctx, 'pol-s20-kb');
  await page.locator('#card-done-1').focus();
  const active = () => page.evaluate(() => document.activeElement && document.activeElement.id);
  for (const [i, next] of [[1, 'card-done-2'], [2, 'card-done-3'], [3, 'card-done-4'], [4, 'go2-btn']]) {
    await page.keyboard.press('Enter'); await settle(300);
    check(await active() === next, 'Enter on task ' + i + ': focus moves to ' + next + ' (now ' + await active() + ')');
  }
  // 「やり直す」で、✓を消したボタンに戻る
  await settle(600);   // 押した直後（0.45秒）の「やり直す」は、二度押しとして無視される
  await page.getByRole('button', { name: /まちがえた → やり直す/ }).nth(1).click(); await settle(300);
  check(await active() === 'card-done-2', 'undo of task 2: focus returns to its 「できた ✓」 (now ' + await active() + ')');
  // 4つの「できた ✓」は、読み上げの説明がぜんぶちがう（どの作業か分かる）
  const fresh = await newCtx(PC);
  const p2 = await openSetup(fresh, 'pol-s20-names');
  const descs = await p2.evaluate(() => [1, 2, 3, 4].map((n) => { const b = document.getElementById('card-done-' + n); return (b.getAttribute('aria-describedby') || '').split(' ').map((id) => (document.getElementById(id) || {}).textContent || '').join(' / '); }));
  check(new Set(descs).size === 4 && descs.every((d, i) => d.includes(['コピーを作る', '「設定」タブに書く', 'メニューを押す', '「準備できました」の確認'][i])), 'the four 「できた ✓」 have four different spoken descriptions (' + short(descs.join(' | '), 160) + ')');
  const sr = await p2.locator('nav[aria-label="3つの手順"] li').nth(2).locator('.sr-only').innerText();
  check(/まだ押せません。先に、前の手順を終えます/.test(sr), 'the locked step-3 button says why in its spoken name (' + sr + ')');
  await fresh.close(); await ctx.close();
});

/* S21: 準備の画面：終わった大会を消す・シートの設定を入れる・他のジム用の入力画面 */
scenario('S21', 'r2-121/126/111/84: delete a finished tournament (after a copy file), apply the sheet settings to a saved tournament, entry page, one name for the setup screen', async () => {
  const ctx = await newCtx(PC);
  const page = await ctx.newPage();
  const id = 'pol-s21';
  await page.goto(base + '/private/?event=' + id);
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  await page.locator('#field-title').fill('削除テスト大会');
  await page.getByRole('button', { name: '保存する', exact: true }).first().click();
  await page.getByRole('status').filter({ hasText: '保存しました' }).first().waitFor({ timeout: 9000 });
  // 大会をえらぶ・安心のしくみ（ほか）を開く
  await page.locator('summary', { hasText: '大会をえらぶ・安心のしくみ' }).click();
  const del = page.locator('#delete-event-btn');
  check(await del.getAttribute('aria-disabled') === 'true', 'before a copy file exists, the delete button is locked');
  check(/先に、「コピーのファイルを作る・戻す」でコピーを作ります/.test(await bodyText(page)), 'the 🔒 reason says to make the copy file first');
  await del.click({ force: true }); await settle(300);   // 押せない見た目のボタンを、あえて押す
  check(await page.locator('#confirm-delete-event').count() === 0, 'a locked delete button opens nothing');
  // コピーのファイルを作る
  if (!(await page.getByPlaceholder('10文字以上のパスワード').isVisible())) await page.locator('summary', { hasText: 'コピーのファイルを作る・戻す' }).click();
  await page.getByPlaceholder('10文字以上のパスワード').fill('fictional-test-password');
  await page.locator('#paper-done').check();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'パスワードをつけて、コピーを保存する', exact: true }).click();
  await dl; await settle(600);
  check(await del.getAttribute('aria-disabled') !== 'true', 'after a copy file, the delete button is live');
  await del.click();
  const box = page.locator('#confirm-delete-event');
  await box.waitFor({ timeout: 6000 });
  const boxText = await box.innerText();
  check(/✕ 取り消せない：この大会（削除テスト大会）が、このパソコンから消えます/.test(boxText) && /選手 0人・写真 0枚・試合 0つが、消えます/.test(boxText), 'the box names what is lost');
  check(/コピーのファイルは消えません/.test(boxText), 'the box says the copy file stays');
  await box.getByRole('button', { name: 'やめる（何も消さない）' }).click(); await settle(300);
  check(await page.locator('#confirm-delete-event').count() === 0 && (await page.evaluate((e) => indexedDB.databases().then((l) => l.length > 0))), 'cancelling keeps the tournament');
  await del.click(); await page.locator('#confirm-delete-event').waitFor();
  await page.locator('#confirm-delete-event').getByRole('button', { name: 'この大会を、このパソコンから消す' }).click();
  await page.waitForURL(base + '/private/', { timeout: 9000 });
  const left = await page.evaluate(() => new Promise((resolve) => { const r = indexedDB.open('tournament-os-private-v1'); r.onsuccess = () => { const q = r.result.transaction('events', 'readonly').objectStore('events').get('pol-s21'); q.onsuccess = () => resolve(q.result ?? null); }; }));
  check(left === null, 'the tournament is gone from this browser');
  check(await page.evaluate(() => localStorage.getItem('tournament-setup-v3:pol-s21') === null && localStorage.getItem('tournament-backup-at:pol-s21') === null), 'its remembered setup / copy time are gone too');
  await ctx.close();

  // r2-126：保存ずみの大会に、シートの設定が入っていない
  const c2 = await newCtx(PC);
  const p2 = await c2.newPage();
  await p2.goto(base + '/private/?event=pol-s21b');
  await p2.locator('#field-title').waitFor({ timeout: 15000 });
  await p2.locator('#field-title').fill('設定テスト大会');
  await p2.getByRole('button', { name: '保存する', exact: true }).first().click();
  await p2.getByRole('status').filter({ hasText: '保存しました' }).first().waitFor({ timeout: 9000 });
  const cs = JSON.stringify(DEFAULT_CLASS_SETTINGS);
  await p2.close();
  // 「選手の受付をつくる」の画面から、シートの設定つきのアドレスで開き直す（同じ大会は、もう保存ずみ）
  const p2b = await c2.newPage();
  await p2b.goto(base + '/private/?event=pol-s21b#' + new URLSearchParams({ t: '設定テスト大会', m: 'on', g: 'required', cs }).toString());
  await p2b.locator('#apply-sheet-config').waitFor({ timeout: 15000 });
  check(/シートで決めた「選手に書いてもらうこと」や、クラス分けが、この大会に まだ入っていません/.test(await bodyText(p2b)), 'saved tournament: a yellow caution says the sheet settings are not in yet (nothing is dropped silently)');
  await p2b.locator('#apply-sheet-config').click();
  await p2b.getByText('シートで決めた「選手に書いてもらうこと」とクラス分けを入れました').waitFor({ timeout: 6000 });
  check(await p2b.locator('#apply-sheet-config').count() === 0, 'after pressing it, the caution is gone');
  await c2.close();

  // r2-111 / r2-84：他のジム用の入力画面・名前
  const c3 = await newCtx(PHONE);
  const p3 = await c3.newPage();
  await p3.goto(base + '/private/entry/?title=%E6%9E%B6%E7%A9%BA&event=pol-s21c');
  await p3.locator('main').first().waitFor({ timeout: 15000 });
  const fileH = await p3.locator('input[type=file]').evaluate((e) => e.getBoundingClientRect().height);
  check(fileH >= 44, 'entry page: the photo chooser is at least 44px high (' + Math.round(fileH) + ')');
  check(!(await p3.evaluate(() => document.body.innerText)).includes('Cloudflare'), 'entry page: no jargon (Cloudflare)');
  const p4 = await c3.newPage();
  await p4.goto(base + '/private/?event=pol-s21d');
  await p4.locator('#field-title').waitFor({ timeout: 15000 });
  const links = await p4.getByRole('link', { name: '選手の受付をつくる画面へ →' }).count();
  check(links >= 1, 'prep page: the link to the setup screen is named 「選手の受付をつくる画面へ →」');
  check(!(await p4.evaluate(() => document.body.textContent || '')).includes('申し込みページをつくる画面'), 'prep page: the old second name is gone');
  await c3.close();
});

/* ───────────────────────── runner ───────────────────────── */
for (const s of scenarios) {
  if (ONLY.length && !ONLY.includes(s.id)) continue;
  cur = s.id;
  const t0 = Date.now(), f0 = failures.length;
  console.log('▶ ' + s.id + ' ' + s.name);
  try { await s.fn(); } catch (e) { failures.push('[' + s.id + '] scenario stopped: ' + short(e.message, 600)); console.log('  ABORT [' + s.id + '] ' + short(e.message, 400)); }
  console.log('  ' + (failures.length === f0 ? 'ok' : (failures.length - f0) + ' failure(s)') + ' (' + Math.round((Date.now() - t0) / 100) / 10 + 's)');
}
check(externals.length === 0, 'the app made no request outside 127.0.0.1 and the fake Google ping (' + short(externals.slice(0, 3).map((e) => e.url).join(' ; '), 200) + ')');
check(pageErrors.length === 0, 'no page errors (' + short(pageErrors.slice(0, 2).map((e) => e.message).join(' ; '), 200) + ')');
await browser.close();
console.log('\n' + checks + ' checks, ' + failures.length + ' failed');
if (failures.length) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
console.log('polish-setup browser checks passed: ' + checks);
