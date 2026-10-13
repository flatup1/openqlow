/**
 * Regression checks for the POLISH round, area "live" (the match-day screen /private/live/ and its list view),
 * plus the few places other screens show the same words (prep bout card, prep legend, titles).
 * Each scenario names the finding ids (r1-NN) it guards. Local-only: every request that leaves 127.0.0.1 is aborted
 * and counted as a violation. All data is fake. Drives the REAL built pages (npm run build:private -> out-private-pages).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4994 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-polish-live.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Or all suites at once: npm run verify:all
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4994), TOS_ONLY=P1,P2 (scenario ids), TOS_CHROME_PATH.
 * Checks are SOFT: every failure is recorded, all scenarios still run, the exit code is 1 if anything failed.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4994';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const EXE = process.env.TOS_CHROME_PATH || '';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

/* ───────────────────────── bookkeeping ───────────────────────── */
let checks = 0, cur = '-';
const failures = [], net = [], externals = [], pageErrors = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 200) => String(s).replace(/\s+/g, ' ').slice(0, n);

/* ───────────────────────── fake data ───────────────────────── */
const DB_NAME = 'tournament-os-private-v1';
const RULE_A = '首相撲あり／膝蹴りあり／蹴り足キャッチ（ワンアタック＝蹴り足をキャッチしたあと、1回だけ攻撃してよい）';
const MUSIC_OFF = { music: false, grade: 'optional', age: 'optional', comment: 'optional' };
const F = (id, over = {}) => ({ id, gym: '架空ジム', name: '架空' + id, grade: '', age: '', height: '170', weight: '60', record: '', comment: '意気込みです', musicUrl: '', photoDataUrl: '', ...over });
const B = (id, redId, blueId, over = {}) => ({ id, redId, blueId, className: '', rule: '', ...over });
const T = (id, o = {}) => ({ schema: 1, eventId: id, title: o.title ?? '架空大会', venue: '架空体育館', date: '2027年10月3日', updatedAt: Date.now() - 60_000, currentBout: o.current ?? 0, fighters: o.fighters ?? [], bouts: o.bouts ?? [], ...(o.entryConfig ? { entryConfig: o.entryConfig } : {}) });
let PHOTO = '';

/* ───────────────────────── browser helpers ───────────────────────── */
async function newCtx(viewport = { width: 1280, height: 720 }, extra = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...extra });
  ctx.on('request', (r) => { if (/^https?:/.test(r.url())) net.push({ scenario: cur, url: r.url(), method: r.method(), body: r.postData() }); });
  ctx.on('page', (page) => { page.on('pageerror', (e) => pageErrors.push({ scenario: cur, message: e.message })); page.on('dialog', (d) => d.dismiss().catch(() => {})); });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(base + '/')) return route.continue();
    externals.push({ scenario: cur, url, method: route.request().method() });
    return route.abort();
  });
  return ctx;
}
const idbPut = (p, value) => p.evaluate(([db, v]) => new Promise((res, rej) => {
  const r = indexedDB.open(db, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('events');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const d = r.result; const t = d.transaction('events', 'readwrite'); t.objectStore('events').put(v, v.eventId); t.oncomplete = () => { d.close(); res(true); }; t.onerror = () => rej(t.error); };
}), [DB_NAME, value]);
const idbGet = (p, id) => p.evaluate(([db, id]) => new Promise((res, rej) => {
  const r = indexedDB.open(db, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('events');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const d = r.result; const g = d.transaction('events', 'readonly').objectStore('events').get(id); g.onsuccess = () => { d.close(); res(g.result ?? null); }; g.onerror = () => rej(g.error); };
}), [DB_NAME, id]);
async function seed(ctx, value) {
  const boot = await ctx.newPage();
  await boot.goto(base + '/private/setup/?event=seed-boot');
  await idbPut(boot, value);
  await boot.close();
}
async function openLive(ctx, id, { list = false, extra = '' } = {}) {
  const page = await ctx.newPage();
  await page.goto(base + '/private/live/?event=' + id + (list ? '&view=list' : '') + extra);
  await page.locator('main').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !document.body.innerText.includes('このパソコンのデータを読んでいます'), null, { timeout: 15000 });
  return page;
}
const failWrites = (p) => p.evaluate(() => {
  window.__orig = window.__orig || { tx: IDBDatabase.prototype.transaction };
  const o = window.__orig;
  IDBDatabase.prototype.transaction = function (s, m, ...r) { if (m === 'readwrite') throw new Error('SIMULATED_DISK_FULL'); return o.tx.call(this, s, m, ...r); };
});
const nextBtn = (p) => p.getByRole('button', { name: '次の試合 →', exact: true });
const prevBtn = (p) => p.getByRole('button', { name: '← 前の試合', exact: true });
const activeLabel = (p) => p.evaluate(() => { const e = document.activeElement; return e ? (e.getAttribute('aria-label') || (e.innerText || '').trim().slice(0, 30) || e.tagName) : 'none'; });
const headerNo = (p) => p.evaluate(() => (document.querySelector('header b span')?.innerText || '').trim());
const markers = (p) => p.evaluate(() => [...document.querySelectorAll('[data-tos-next="1"]')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()));
/** positions of the things the announcer must see */
const geom = (p) => p.evaluate(() => {
  const r = (e) => (e ? { top: Math.round(e.getBoundingClientRect().top), bottom: Math.round(e.getBoundingClientRect().bottom), left: Math.round(e.getBoundingClientRect().left), right: Math.round(e.getBoundingClientRect().right), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) } : null);
  const footer = document.querySelector('footer');
  const arts = [...document.querySelectorAll('article')];
  const pills = arts.map((a) => a.querySelector('p > span.rounded-full'));
  return {
    vh: window.innerHeight, vw: window.innerWidth, docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth,
    footer: r(footer), footerPos: footer ? getComputedStyle(footer).position : null,
    names: arts.map((a) => r(a.querySelector('h2'))), gyms: arts.map((a) => r(a.querySelector('h2 + p'))), pills: pills.map(r),
    bands: arts.map((a) => r(a.querySelector(':scope > p'))),
  };
});

/* ───────────────────────── scenarios ───────────────────────── */
const scenarios = [];
const scenario = (id, name, fn) => scenarios.push({ id, name, fn });

const twoBouts = (id, { mix = false, rule = RULE_A, photo = true, n = 2 } = {}) => {
  const fighters = [], bouts = [];
  for (let i = 0; i < n; i++) {
    fighters.push(F('R' + i, { name: '架空赤' + (i + 1), fighterClass: 'Aクラス', weight: '45.5', photoDataUrl: photo ? PHOTO : '' }));
    fighters.push(F('B' + i, { name: '架空青' + (i + 1), fighterClass: mix ? 'Bクラス' : 'Aクラス', weight: '44', photoDataUrl: photo ? PHOTO : '' }));
    bouts.push(B('b' + i, 'R' + i, 'B' + i, { rule }));
  }
  return T(id, { fighters, bouts });
};

/* P1 r1-44 / r1-48: the undo notice and the class word never push the names under the sticky footer */
scenario('P1', 'after 「次の試合 →」 the names, the gym and the class stay above the footer (1280x720, 844x390)', async () => {
  for (const [vp, tag] of [[{ width: 1280, height: 720 }, '1280x720'], [{ width: 844, height: 390 }, '844x390']]) {
    for (const mix of [false, true]) {
      const id = 'pl-p1-' + tag + (mix ? 'm' : '');
      const ctx = await newCtx(vp);
      await seed(ctx, twoBouts(id, { mix }));
      const p = await openLive(ctx, id);
      const g0 = await geom(p);
      check(g0.pills.every((x) => x && x.bottom <= (g0.footer ? g0.footer.top : g0.vh)), `${tag}${mix ? ' mix' : ''}: class pills are above the footer before pressing (${JSON.stringify(g0.pills)} footer ${g0.footer?.top})`);
      await nextBtn(p).click();
      await p.waitForFunction(() => document.querySelector('header b span')?.innerText.includes('第2試合'), null, { timeout: 5000 });
      await settle(300);
      await p.evaluate(() => window.scrollTo(0, 0));
      const g = await geom(p);
      const top = g.footer ? g.footer.top : g.vh;
      check(g.pills.every((x) => x && x.bottom <= top && x.top >= 0), `${tag}${mix ? ' mix' : ''}: after the press both class pills are fully visible above the footer (pills ${JSON.stringify(g.pills)}, footer top ${top})`);
      if (tag === '1280x720' && !mix) check(g.names.every((x) => x && x.bottom <= top) && g.gyms.every((x) => x && x.bottom <= top), `${tag}: after the press names AND gym names are above the footer (names ${JSON.stringify(g.names)}, footer ${top})`);
      if (tag === '1280x720' && mix) check(g.names.every((x) => x && x.top < top - 20), `${tag} mix: names start above the footer even with the red cross-class line (${JSON.stringify(g.names)} footer ${top})`);
      if (tag === '844x390') check(g.names.every((x) => x && x.top < top), `${tag}: names start above the footer (${JSON.stringify(g.names)} footer ${top})`);
      check(g.footer && g.footer.h <= (tag === '1280x720' ? 130 : 110), `${tag}: the footer stays small after a press (${g.footer?.h}px; was 308px)`);
      const undo = p.getByRole('button', { name: /^第\d+試合にもどす$/ });
      check((await undo.count()) === 1, `${tag}: the 「第1試合にもどす」 button is shown`);
      check(await undo.evaluate((b) => !b.closest('footer')), `${tag}: the undo button is NOT inside the sticky footer`);
      check(await undo.evaluate((b) => b.getBoundingClientRect().height <= 64 && b.getBoundingClientRect().height >= 44), `${tag}: the undo button is a one-line size (44-64px)`);
      check(g.docW <= g.vw, `${tag}: no sideways scroll (${g.docW}/${g.vw})`);
      await ctx.close();
    }
  }
});

/* P2 r1-45: a ONE-match event is a quiet, complete screen */
scenario('P2', 'one bout: no 前/次 buttons, no yellow 「一覧」, no switcher; gym, class and rule fit at 1280x720', async () => {
  for (const [vp, tag] of [[{ width: 1280, height: 720 }, '1280x720'], [{ width: 1366, height: 768 }, '1366x768'], [{ width: 390, height: 844 }, '390x844']]) {
    const id = 'pl-p2-' + tag;
    const ctx = await newCtx(vp);
    await seed(ctx, twoBouts(id, { n: 1 }));
    const p = await openLive(ctx, id);
    check((await prevBtn(p).count()) === 0 && (await nextBtn(p).count()) === 0, `${tag}: no 前の試合 / 次の試合 buttons`);
    check((await p.locator('footer').count()) === 0, `${tag}: no sticky footer`);
    check((await markers(p)).length === 0, `${tag}: no yellow 「次はここ」 (nothing to do next) (${(await markers(p)).join('|')})`);
    check((await p.getByRole('group', { name: '表示のしかた' }).count()) === 0, `${tag}: the 表示のしかた switcher is hidden`);
    const body = await p.evaluate(() => document.body.innerText);
    check(body.includes('この大会は1試合だけです'), `${tag}: it says 「この大会は1試合だけです」`);
    check(!/一覧.*押して|全部の試合を見る/.test(body), `${tag}: it never sends the chairman to a list of the same bout`);
    check((await p.getByRole('link', { name: /準備画面へ戻る/ }).count()) >= 1, `${tag}: the 準備画面へ戻る link is still there`);
    check(!/選手未設定|全部おわりました/.test(body), `${tag}: no wrong words`);
    if (vp.height === 720 || vp.height === 768) {
      const fit = await p.evaluate(() => {
        const r = (e) => e && Math.round(e.getBoundingClientRect().bottom);
        const arts = [...document.querySelectorAll('article')];
        return { gym: arts.map((a) => r(a.querySelector('h2 + p'))), pill: arts.map((a) => r(a.querySelector('p > span.rounded-full'))), name: arts.map((a) => r(a.querySelector('h2'))), rule: r([...document.querySelectorAll('main p')].find((x) => x.innerText.startsWith('ルール'))), vh: innerHeight };
      });
      check([...fit.gym, ...fit.pill, ...fit.name, fit.rule].every((b) => b && b <= fit.vh), `${tag}: gym, class, names and the rule are all on the first screen (${JSON.stringify(fit)})`);
    }
    await ctx.close();
  }
});

/* P3 r1-46 / r1-123: the keyboard position is never lost */
scenario('P3', 'keyboard: focus stays on 「次の試合 →」 after a press; Enter again goes on; undo returns focus to a real button', async () => {
  const id = 'pl-p3';
  const ctx = await newCtx({ width: 1280, height: 900 });
  await seed(ctx, twoBouts(id, { n: 4 }));
  const p = await openLive(ctx, id);
  await nextBtn(p).focus();
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('header b span')?.innerText.includes('第2試合'), null, { timeout: 5000 });
  await settle(700);
  check((await activeLabel(p)) === '次の試合 →', `after Enter the focus is still on 「次の試合 →」 (was BODY; now ${await activeLabel(p)})`);
  check((await nextBtn(p).getAttribute('disabled')) === null, 'the next button is not disabled="" (it uses aria-disabled)');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('header b span')?.innerText.includes('第3試合'), null, { timeout: 5000 });
  await settle(700);
  check((await headerNo(p)) === '第3試合' && (await activeLabel(p)) === '次の試合 →', 'a second Enter (after the double-press guard) goes on to 第3試合 and keeps the focus');
  await prevBtn(p).focus();
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('header b span')?.innerText.includes('第2試合'), null, { timeout: 5000 });
  await settle(700);
  check((await activeLabel(p)) === '← 前の試合', `after 「← 前の試合」 the focus stays on it (${await activeLabel(p)})`);
  // undo by keyboard: the notice disappears, so the focus must move to a real button (not BODY)
  const undo = p.getByRole('button', { name: /にすすむ$|にもどす$/ });
  await undo.focus();
  await p.keyboard.press('Enter');
  await settle(900);
  const al = await activeLabel(p);
  check(al === '次の試合 →', `after the undo button vanishes the focus moves to 「次の試合 →」 (${al})`);
  // last bout: the locked button keeps the focus and Enter does nothing
  await p.keyboard.press('Enter'); await settle(800); await p.keyboard.press('Enter'); await settle(800); await p.keyboard.press('Enter'); await settle(800);
  const no = await headerNo(p);
  check(no === '第4試合' && (await activeLabel(p)) === '次の試合 →', `at the last bout the (aria-disabled) button keeps the focus (${no}, ${await activeLabel(p)})`);
  await p.keyboard.press('Enter'); await settle(500);
  check((await headerNo(p)) === '第4試合', 'Enter on the locked 次の試合 does nothing');
  check((await nextBtn(p).getAttribute('aria-disabled')) === 'true', 'the locked button says aria-disabled="true"');
  await ctx.close();
});

/* P4 r1-47: the save-failure bar */
scenario('P4', 'save failure on a small screen: one red line, ONE yellow retry button, the rest folded; the footer fully visible', async () => {
  for (const [vp, tag, maxShare, photo, rule] of [[{ width: 320, height: 568 }, '320x568', 0.8, true, RULE_A], [{ width: 844, height: 390 }, '844x390', 0.6, true, RULE_A], [{ width: 844, height: 390 }, '844x390 no photo', 0.6, false, ''], [{ width: 1280, height: 720 }, '1280x720', 0.45, true, RULE_A]]) {
    const id = 'pl-p4-' + tag.replace(/\W/g, '');
    const ctx = await newCtx(vp);
    await seed(ctx, twoBouts(id, { n: 3, photo, rule }));
    const p = await openLive(ctx, id);
    await failWrites(p);
    await nextBtn(p).click();
    await settle(1500);
    const alert = p.locator('main [role=alert]');
    check((await alert.count()) === 1, `${tag}: exactly one role=alert inside the page (${await alert.count()})`);
    const text = await alert.innerText();
    check(/保存できなかった/.test(text) && /進めていません/.test(text), `${tag}: the red line says it could not be saved and the bout did not move (${short(text, 100)})`);
    check((await headerNo(p)) === '第1試合', `${tag}: still 第1試合`);
    const m = await markers(p);
    check(m.length === 1 && /もう一度/.test(m[0]), `${tag}: ONE yellow marker, on the retry button (${m.join('|')})`);
    check(!(await p.getByRole('button', { name: 'わかった（閉じる）' }).isVisible()), `${tag}: the competing 「わかった（閉じる）」 button is folded away (inside 「くわしく見る」)`);
    check((await p.locator('summary', { hasText: 'くわしく見る' }).count()) === 1, `${tag}: a 「くわしく見る」 fold exists`);
    await p.locator('summary', { hasText: 'くわしく見る' }).click();
    check(await p.getByRole('button', { name: 'わかった（閉じる）' }).isVisible(), `${tag}: the fold opens and holds 「わかった（閉じる）」 and the tip`);
    await p.locator('summary', { hasText: 'くわしく見る' }).click();
    const g = await geom(p);
    check(g.footer && g.footer.top >= 0 && g.footer.bottom <= g.vh + 1, `${tag}: the whole failure footer is inside the screen without scrolling (${JSON.stringify(g.footer)} of ${g.vh})`);
    check(g.footer && g.footer.h / g.vh <= maxShare, `${tag}: the footer takes at most ${Math.round(maxShare * 100)}% of the screen (${Math.round((g.footer?.h || 0) / g.vh * 100)}%)`);
    if (vp.width <= 400 || vp.height <= 500) check(!(await p.locator('.live-fail-more').isVisible()), `${tag}: the second explanation line is hidden on a small screen`);
    const filled = await p.evaluate(() => [...document.querySelectorAll('footer button')].filter((b) => { const c = getComputedStyle(b).backgroundColor; return c === 'rgb(67, 56, 202)' || c === 'rgb(55, 48, 163)' || c === 'rgb(67, 56, 202)'; }).length);
    check(filled <= 1, `${tag}: at most one filled primary button in the footer (${filled})`);
    await ctx.close();
  }
});

/* P4b r1-47: the same failure in the LIST view (fixed bottom alert) */
scenario('P4b', 'save failure in the list view at 320x568: the fixed alert is short and has no competing close button on top', async () => {
  const id = 'pl-p4b';
  const ctx = await newCtx({ width: 320, height: 568 });
  await seed(ctx, twoBouts(id, { n: 4 }));
  const l = await openLive(ctx, id, { list: true });
  await failWrites(l);
  await l.getByRole('button', { name: /^この試合を開く 第2試合 / }).click();
  await settle(1500);
  const a = l.locator('main [role=alert]');
  check((await a.count()) === 1, 'one alert in the list view');
  const box = await a.evaluate((e) => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), vh: innerHeight, pos: getComputedStyle(e).position }; });
  check(box.h / box.vh <= 0.42, `the fixed alert takes at most 42% of the screen (${box.h}/${box.vh} = ${Math.round(box.h / box.vh * 100)}%; was 48%)`);
  check(!(await l.getByRole('button', { name: 'わかった（閉じる）' }).isVisible()), 'the 「わかった（閉じる）」 button is folded away');
  check((await markers(l)).length === 1 && /もう一度/.test((await markers(l))[0]), `ONE yellow marker: 「もう一度押す」 on the failed row (${(await markers(l)).join('|')})`);
  await ctx.close();
});

/* P5 r1-48 / r1-154: class in the coloured band; hostile class does not widen the page */
scenario('P5', 'the class word sits in the coloured corner band; a 40-character class does not widen the page', async () => {
  for (const [vp, tag] of [[{ width: 1280, height: 720 }, '1280'], [{ width: 390, height: 844 }, '390']]) {
    const id = 'pl-p5-' + tag;
    const ctx = await newCtx(vp);
    await seed(ctx, twoBouts(id, { mix: true }));
    const p = await openLive(ctx, id);
    const bands = await p.evaluate(() => [...document.querySelectorAll('article > p')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
    check(/▲.*赤コーナー.*Aクラス/.test(bands[0] || '') && /■.*青コーナー.*Bクラス/.test(bands[1] || ''), `${tag}: the bands read 「▲ 赤コーナー Aクラス」 / 「■ 青コーナー Bクラス」 (${bands.join(' / ')})`);
    await ctx.close();
    // hostile 40-character class without spaces
    const id2 = 'pl-p5h-' + tag;
    const ctx2 = await newCtx(vp);
    const hostile = 'あ'.repeat(40), latin = 'Z'.repeat(40);
    await seed(ctx2, T(id2, { fighters: [F('H1', { fighterClass: hostile, name: '架空長赤' }), F('H2', { fighterClass: latin, name: '架空長青' })], bouts: [B('b0', 'H1', 'H2'), B('b1', 'H2', 'H1')] }));
    for (const list of [false, true]) {
      const q = await openLive(ctx2, id2, { list });
      const g = await geom(q);
      check(g.docW <= g.vw, `${tag} ${list ? 'list' : 'single'}: a 40-character class does not make the page scroll sideways (${g.docW}/${g.vw})`);
      await q.close();
    }
    await ctx2.close();
  }
});

/* P6 r1-49 / r1-50 / r1-51: contract, rule, long comment */
scenario('P6', 'contract "45.5kg契約" stays on one line; the rule is big and full-width; a 200-character comment wraps', async () => {
  for (const [vp, tag] of [[{ width: 1280, height: 720 }, '1280'], [{ width: 1920, height: 1080 }, '1920']]) {
    const id = 'pl-p6-' + tag;
    const ctx = await newCtx(vp);
    await seed(ctx, twoBouts(id, { n: 1 }));
    const p = await openLive(ctx, id);
    const c = await p.evaluate(() => {
      const vs = [...document.querySelectorAll('p')].find((x) => x.innerText.trim() === 'VS');
      const el = vs.nextElementSibling;
      const spans = [...el.querySelectorAll('span')].map((s) => Math.round(s.getBoundingClientRect().top));
      const rule = [...document.querySelectorAll('main > p')].find((x) => x.innerText.startsWith('ルール'));
      return { text: el.innerText, tops: spans, fs: parseFloat(getComputedStyle(el).fontSize), ruleFs: rule ? parseFloat(getComputedStyle(rule).fontSize) : 0, ruleW: rule ? Math.round(rule.getBoundingClientRect().width) : 0, mainW: Math.round(document.querySelector('main').getBoundingClientRect().width), wbr: rule ? rule.querySelectorAll('wbr').length : 0, centre: !!rule && !!rule.closest('section') };
    });
    check(c.text.trim() === '45.5kg契約' && new Set(c.tops).size === 1, `${tag}: the contract is one line and never split inside a word (${JSON.stringify(c.tops)})`);
    check(c.fs >= 36, `${tag}: the contract number stays big (${c.fs}px)`);
    check(c.ruleFs >= 28 && c.ruleW >= c.mainW - 40 && !c.centre, `${tag}: the rule is >= 28px and runs the full width, not in the narrow middle column (${c.ruleFs}px, ${c.ruleW}/${c.mainW})`);
    check(c.wbr >= 2, `${tag}: the rule can break after each 「／」 (${c.wbr} break points)`);
    await ctx.close();
  }
  const id = 'pl-p6c';
  const ctx = await newCtx({ width: 390, height: 844 });
  await seed(ctx, T(id, { fighters: [F('A1', { comment: 'x'.repeat(200) }), F('A2', { comment: 'https://example.invalid/' + 'y'.repeat(150) })], bouts: [B('b0', 'A1', 'A2'), B('b1', 'A2', 'A1')] }));
  const p = await openLive(ctx, id);
  const sw = await p.evaluate(() => ({ docW: document.documentElement.scrollWidth, vw: innerWidth, arts: [...document.querySelectorAll('article')].map((a) => [a.scrollWidth, a.clientWidth]) }));
  check(sw.docW <= sw.vw && sw.arts.every(([s, c]) => s <= c + 1), `a 200-character unbroken comment wraps inside the card (no clipping): ${JSON.stringify(sw)}`);
  await ctx.close();
});

/* P7 r1-52: the same words in the single view and the list */
scenario('P7', 'missing / empty / blank names read the same in the single view and the list; an empty name has a red line', async () => {
  const id = 'pl-p7';
  const ctx = await newCtx({ width: 1280, height: 900 });
  await seed(ctx, T(id, { fighters: [F('E1', { name: '' }), F('E2', { name: '   ' }), F('E3', { name: '架空三' })], bouts: [B('b0', 'E1', 'E2'), B('b1', 'E3', 'ghost'), B('b2', 'E3', 'E3')] }));
  const s = await openLive(ctx, id);
  const names = () => s.evaluate(() => [...document.querySelectorAll('article h2')].map((h) => h.innerText.trim()));
  let n = await names();
  check(n[0] === '名前未入力' && n[1] === '名前未入力', `bout 1 single: empty and blank names both read 名前未入力 (${n.join('|')})`);
  check((await s.getByText('名前が入っていません', { exact: false }).count()) === 2, 'bout 1 single: a red line on each empty name');
  check(!(await s.evaluate(() => document.body.innerText)).includes('選手未設定'), 'no 選手未設定 anywhere');
  await nextBtn(s).click(); await settle(500);
  n = await names();
  check(n[0] === '架空三' && n[1] === '選手未選択', `bout 2 single: a missing fighter reads 選手未選択, same as the list (${n.join('|')})`);
  const l = await openLive(ctx, id, { list: true });
  const rows = await l.evaluate(() => [...document.querySelectorAll('li.live-list-row')].map((li) => li.innerText.replace(/\s+/g, ' ')));
  check(/名前未入力.*名前未入力/.test(rows[0]) && /選手未選択/.test(rows[1]), `list: the same words (${short(rows.join(' || '), 160)})`);
  await ctx.close();
});

/* P8 r1-53: the undo sentence names the button */
scenario('P8', 'opening a bout from the list says 「まちがえたら「第N試合にもどす」を押す」 (no 右/下)', async () => {
  const id = 'pl-p8';
  const ctx = await newCtx({ width: 1280, height: 900 });
  await seed(ctx, twoBouts(id, { n: 12 }));
  const l = await openLive(ctx, id, { list: true });
  await l.getByRole('button', { name: /^この試合を開く 第5試合 / }).click();
  await l.waitForFunction(() => document.querySelector('header b span')?.innerText.includes('第5試合'), null, { timeout: 5000 });
  await settle(400);
  const note = await l.locator('[role=status]', { hasText: '変えました' }).innerText();
  check(/まちがえたら「第1試合にもどす」を押す/.test(note) && !/右|下のボタン/.test(note), `the undo sentence names the button (${short(note, 120)})`);
  const bt = l.getByRole('button', { name: '第1試合にもどす', exact: true });
  check((await bt.count()) === 1, 'the button 「第1試合にもどす」 exists once');
  await ctx.close();
});

/* P9 r1-81: no false 'all done' */
scenario('P9', 'the last bout says 「これが最後の試合です」; nothing green says the event is over', async () => {
  const id = 'pl-p9';
  const ctx = await newCtx({ width: 1280, height: 900 });
  await seed(ctx, twoBouts(id, { n: 2 }));
  const p = await openLive(ctx, id);
  await nextBtn(p).click(); await settle(500);
  const foot = await p.locator('footer').innerText();
  check(/これが最後の試合です/.test(foot) && /押せません/.test(foot), `the footer says it is the last bout and 次 cannot be pressed (${short(foot, 120)})`);
  const body = await p.evaluate(() => document.body.innerText);
  check(!/全部おわりました|これで全部終わりです/.test(body), 'no 「全部おわりました」 before the last bout is fought');
  check((await p.evaluate(() => document.querySelectorAll('.tos-ok').length)) === 0, 'no green ✓ line on the last bout (the only ✓ is the save badge, which is not a .tos-ok line)');
  await ctx.close();
});

/* P10 r1-82: same person in red and blue */
scenario('P10', 'a bout whose red and blue are the same person (two IDs) gets a ⚠ line on the bout card, the single view and the list', async () => {
  const id = 'pl-p10';
  const ctx = await newCtx({ width: 1280, height: 900 });
  await seed(ctx, T(id, { fighters: [F('F01', { name: '架空赤一', gym: '架空ジム' }), F('F04', { name: '架空赤一', gym: '架空ジム' }), F('F02', { name: '架空青二' })], bouts: [B('b0', 'F01', 'F02'), B('b1', 'F04', 'F01')], current: 1 }));
  const s = await openLive(ctx, id);
  const st = await s.locator('[role=status]', { hasText: '同じ人かもしれません' }).first().innerText();
  check(/⚠/.test(st) && /同じ名前・同じジム/.test(st), `single view: ⚠ 同じ人かもしれません (${short(st, 100)})`);
  const l = await openLive(ctx, id, { list: true });
  const rows = await l.evaluate(() => [...document.querySelectorAll('li.live-list-row')].map((li) => li.innerText.replace(/\s+/g, ' ')));
  check(!/同じ人かもしれません/.test(rows[0]) && /同じ人かもしれません/.test(rows[1]), `list: only bout 2 carries the line (${short(rows[1], 160)})`);
  const prep = await ctx.newPage();
  await prep.goto(base + '/private/?event=' + id);
  await prep.locator('#bout-1').waitFor({ timeout: 15000 });
  check(/同じ人かもしれません/.test(await prep.locator('#bout-1').innerText()), 'the prep bout card shows it too');
  await ctx.close();
});

/* P11 r1-54 / r1-103 / r1-119: no-JS, titles, headings */
scenario('P11', 'JavaScript off: a plain reason; the tabs have Japanese names; early screens have an h1', async () => {
  const ctx = await newCtx({ width: 1280, height: 720 }, { javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(base + '/private/live/?event=nojs');
  const t = await p.evaluate(() => document.body.innerText);
  check(/JavaScript/.test(t) && /オン|オフ|使います/.test(t), `no JavaScript: a sentence says why the page does not work (${short(t, 120)})`);
  check((await p.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== 'rgb(7, 9, 13)', 'no JavaScript: the page is not a black screen');
  await ctx.close();
  const ctx2 = await newCtx({ width: 1280, height: 720 });
  for (const [path, want] of [['/private/live/?event=pl-p11', '試合当日の画面'], ['/private/entry/?event=pl-p11', '選手エントリーシート'], ['/private/google-setup/?event=pl-p11', 'Google受付をつなぐ'], ['/private/setup/?event=pl-p11', '選手の受付をつくる']]) {
    const q = await ctx2.newPage();
    await q.goto(base + path);
    await settle(1200);
    const title = await q.title();
    check(title === want || title.includes(want), `${path}: the tab name is 「${want}」, not 「Tournament OS」 (${title})`);
    await q.close();
  }
  // first paint: the html element is light on the match-day screen (no black flash before the script runs)
  const lp = await ctx2.newPage();
  await lp.goto(base + '/private/live/?event=pl-p11', { waitUntil: 'commit' });
  const early = await lp.evaluate(() => getComputedStyle(document.documentElement).backgroundColor).catch(() => '');
  await settle(1000);
  const late = await lp.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  check(late !== 'rgb(7, 9, 13)' && early !== 'rgb(7, 9, 13)', `the match-day screen is never the dark #07090d (first ${early}, later ${late})`);
  // "this event is not in this browser" screen and the loading screen carry an h1
  const q = await ctx2.newPage();
  await q.goto(base + '/private/live/?event=pl-never-seeded');
  await q.getByText('この大会は、このブラウザにありません').waitFor({ timeout: 10000 });
  check((await q.locator('h1').count()) >= 1, 'the "not in this browser" screen has an h1');
  await ctx2.close();
});

/* P12 r1-55 / r1-56 / r1-126 / r1-183: list details */
scenario('P12', 'list: pager words do not break inside; scroll-padding set from JS; class warning full width; print hides screen-only words', async () => {
  const id = 'pl-p12';
  const ctx = await newCtx({ width: 320, height: 568 });
  await seed(ctx, twoBouts(id, { n: 25, mix: true }));
  const l = await openLive(ctx, id, { list: true });
  const pager = await l.evaluate(() => [...document.querySelectorAll('nav[aria-label="ページの切りかえ"] button')].map((b) => ({ t: b.innerText.trim(), wb: getComputedStyle(b).wordBreak, over: b.scrollWidth > b.clientWidth + 1, h: Math.round(b.getBoundingClientRect().height) })));
  check(pager.length === 2 && pager.every((b) => b.wb === 'keep-all' && !b.over && b.h <= 80), `320px: the pager buttons never break inside 「ページ」 (${JSON.stringify(pager)})`);
  check(pager.every((b) => !/^.*\n/.test(b.t) || /\s/.test(b.t)), '320px: any line break in a pager button is at the space');
  const sp = await l.evaluate(() => document.documentElement.style.scrollPaddingTop);
  check(/^\d+(\.\d+)?px$/.test(sp), `scroll-padding-top is also set from JavaScript (${sp}), for Safari 15.0-15.3 without :has`);
  await l.getByRole('button', { name: '1試合ずつ' }).click(); await settle(300);
  check((await l.evaluate(() => document.documentElement.style.scrollPaddingTop)) === '', 'it is removed again when the list is left');
  await ctx.close();
  const ctx2 = await newCtx({ width: 1280, height: 900 });
  await seed(ctx2, twoBouts(id + 'b', { n: 4, mix: true }));
  const l2 = await openLive(ctx2, id + 'b', { list: true });
  const row = await l2.evaluate(() => { const li = document.querySelector('li.live-list-row'); const w = [...li.querySelectorAll('p')].find((p) => p.innerText.includes('クラスがちがう')); return { w: Math.round(w.getBoundingClientRect().width), rw: Math.round(li.getBoundingClientRect().width), h: Math.round(w.getBoundingClientRect().height), text: w.innerText }; });
  check(row.w >= row.rw * 0.6 && row.h <= 60, `1280px: the class warning runs across the row, not in the narrow middle column (${row.w}/${row.rw}, ${row.h}px high)`);
  await l2.emulateMedia({ media: 'print' });
  const pr = await l2.evaluate(() => {
    const hid = (el) => !el || el.getClientRects().length === 0;
    const li = document.querySelector('li.live-list-row');
    const warn = [...li.querySelectorAll('p')].find((p) => p.innerText.includes('クラスがちがう'));
    const now = [...li.querySelectorAll('span')].find((s) => s.innerText.includes('いま進行中'));
    const saved = document.querySelector('header span.live-list-noprint');
    const hint = [...document.querySelectorAll('p')].find((p) => p.innerText.includes('Ctrl＋P'));
    const music = [...li.querySelectorAll('p,a')].find((p) => /入場曲なし|曲を開く/.test(p.innerText));
    return { warn: hid(warn), now: hid(now), saved: hid(saved), hint: hid(hint), music: hid(music) };
  });
  check(pr.warn && pr.now && pr.saved && pr.hint && pr.music, `print: the cross-class warning, 「いま進行中」, the save badge, the print hint and the music chips are hidden (${JSON.stringify(pr)})`);
  await l2.emulateMedia({ media: 'screen' });
  check((await l2.evaluate(() => document.body.innerText)).includes('紙に出すとき：キーボードの Ctrl＋P（Macは ⌘＋P）を押します'), 'screen: the one-line print instruction is shown on the list');
  await ctx2.close();
});

/* P13 r1-111: ONE decision about a sticky footer */
scenario('P13', 'the footer is sticky only while it is small; with big text it becomes normal flow and the 👉 badge is not squeezed', async () => {
  const id = 'pl-p13';
  const ctx = await newCtx({ width: 320, height: 568 });
  await seed(ctx, twoBouts(id, { n: 3 }));
  const p = await openLive(ctx, id);
  let g = await geom(p);
  check((g.footerPos === 'sticky') === (g.footer.h <= g.vh * 0.4), `320x568: sticky exactly when the footer is <= 40% of the screen (${g.footerPos}, ${g.footer.h}/${g.vh})`);
  await p.addStyleTag({ content: 'html{font-size:150%}' });
  await settle(500);
  g = await geom(p);
  check(g.footerPos === 'static' && g.footer.h > g.vh * 0.4, `320x568 + text 150%: the footer is normal flow (it would cover ${Math.round(g.footer.h / g.vh * 100)}%): ${g.footerPos}`);
  const badge = await p.evaluate(() => { const b = document.querySelector('footer .tos-next-badge'); if (!b) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), lines: Math.round(r.height / parseFloat(getComputedStyle(b).lineHeight || 28)) }; });
  check(badge && badge.w >= 150, `320x568 + text 150%: the 👉 badge is not squeezed to 1-4 characters per line (${JSON.stringify(badge)})`);
  check(await p.evaluate(() => { const b = document.querySelector('footer button[aria-label="次の試合 →"]'); b.scrollIntoView(); const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'the 「次の試合 →」 button can be scrolled fully into view');
  await ctx.close();
  const css = await (await fetch(base + '/_next/static/chunks/' + (await (await fetch(base + '/private/live/')).text()).match(/static\/chunks\/([^"']+\.css)/)[1])).text();
  check(!/max-height:\s*420px\)\s*\{\s*\.live-single-footer[^}]*position:\s*static/.test(css), 'the built CSS has no second, dead static rule for the footer');
  check(/live-footer-flow/.test(css), 'the built CSS has the one .live-footer-flow rule');
});

/* P14 r1-176 / r1-184: the prep screen words about classes and the new tab */
scenario('P14', 'prep screen: A-vs-B bout card says which rules differ and what to do; a one-line class legend; the new-tab note says "tab"', async () => {
  const id = 'pl-p14';
  const ctx = await newCtx({ width: 1280, height: 900 });
  await seed(ctx, T(id, { fighters: [F('R1', { name: '架空赤一', fighterClass: 'Aクラス' }), F('B1', { name: '架空青一', fighterClass: 'Bクラス' })], bouts: [B('b0', 'R1', 'B1')] }));
  const p = await ctx.newPage();
  await p.goto(base + '/private/?event=' + id);
  await p.locator('#bout-0').waitFor({ timeout: 15000 });
  const card = await p.locator('#bout-0').innerText();
  check(/クラスがちがいます：赤はAクラス、青はBクラスです。ルールがちがう2人です/.test(card), `the card names both classes (${short(card, 160)})`);
  check(/Aクラスのルール：首相撲あり／膝蹴りあり／蹴り足キャッチ/.test(card) && /Bクラスのルール：パンチとキックのみ/.test(card), 'it shows which rules differ (one line per class)');
  check(/おすすめは、同じクラスの2人に選び直すことです/.test(card), 'it says what is recommended');
  check(/下の「ルール・体重の区分」の「ルール」に書きます。試合当日の画面に出ます/.test(card), 'it says where to write the agreed rule so it shows on the match-day screen');
  const btn = p.locator('#bout-0').getByRole('button', { name: '青を選び直す', exact: true });
  check((await btn.count()) === 1, 'a button 「青を選び直す」 is there');
  await btn.click(); await settle(400);
  check(await p.evaluate(() => document.activeElement?.id === 'bout-0-blue'), 'pressing it moves the keyboard to the blue select');
  const legend = (await p.evaluate(() => document.body.innerText));
  check(legend.includes('クラス：Aクラス＝3勝以上　Bクラス＝2勝以下（初出場も）。'), 'a one-line legend explains the two classes above the bout list');
  check(/新しい画面（ブラウザでは「タブ」と言います）が開きます/.test(legend) && /閉じなくて大丈夫/.test(legend), 'the new-tab note says "tab", that the old screen can stay, and how to return');
  const live = await openLive(ctx, id);
  check((await live.evaluate(() => document.body.innerText)).includes('準備画面が、もう1つ開きます'), 'the live screen says the way back opens a second prep screen');
  await ctx.close();
});

/* P15 r1-111: the prep screen's sticky nav + bottom bar give the screen back when they would cover half of it */
scenario('P15', 'prep screen: the step nav and the bottom bar are sticky on a normal phone, but normal flow on 320x256 and with 200% text', async () => {
  const id = 'pl-p15';
  const data = twoBouts(id, { n: 3, photo: false });
  const probe = (p) => p.evaluate(() => {
    const bar = [...document.querySelectorAll('div')].find((d) => /fixed|relative/.test(d.className) && d.className.includes('border-t-2') && d.className.includes('z-40'));
    const nav = document.querySelector('nav[aria-label="4つの手順"]');
    return { bar: bar ? getComputedStyle(bar).position : null, nav: nav ? getComputedStyle(nav).position : null, barH: bar ? Math.round(bar.getBoundingClientRect().height) : 0, navH: nav ? Math.round(nav.getBoundingClientRect().height) : 0, vh: innerHeight, vw: innerWidth };
  });
  for (const [vp, tag, flow] of [[{ width: 390, height: 844 }, '390x844', false], [{ width: 1280, height: 720 }, '1280x720', false], [{ width: 320, height: 256 }, '320x256', true]]) {
    const ctx = await newCtx(vp);
    await seed(ctx, data);
    const p = await ctx.newPage();
    await p.goto(base + '/private/?event=' + id);
    await p.locator('#bout-0').waitFor({ timeout: 15000 });
    await settle(600);
    const r = await probe(p);
    if (flow) check(r.bar === 'relative' && /^(static|relative)$/.test(r.nav), `${tag}: bar and nav are normal flow (${JSON.stringify(r)})`);
    else check(r.bar === 'fixed' && r.nav === 'sticky', `${tag}: bar fixed and nav sticky (${JSON.stringify(r)})`);
    await ctx.close();
  }
  const ctx = await newCtx({ width: 320, height: 568 });
  await seed(ctx, data);
  const p = await ctx.newPage();
  await p.goto(base + '/private/?event=' + id);
  await p.locator('#bout-0').waitFor({ timeout: 15000 });
  await p.addStyleTag({ content: 'html{font-size:200%}' });
  await settle(700);
  const r = await probe(p);
  check(r.bar === 'relative' && /^(static|relative)$/.test(r.nav), `320x568 + text 200%: the bar and nav no longer cover the page (${JSON.stringify(r)})`);
  await ctx.close();
});

/* ───────────────────────── runner ───────────────────────── */
{
  const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base + '/private/setup/?event=photo-boot');
  PHOTO = await p.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 300; cv.height = 400; const x = cv.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 300, 400); x.fillStyle = '#fff'; x.fillRect(75, 100, 150, 200); return cv.toDataURL('image/jpeg'); });
  await c.close();
  assert.ok(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(PHOTO), 'a fake photo was made');
}
for (const s of scenarios) {
  if (ONLY.length && !ONLY.includes(s.id)) continue;
  cur = s.id;
  const t0 = Date.now(), f0 = failures.length;
  console.log('▶ ' + s.id + ' ' + s.name);
  try { await s.fn(); } catch (e) { const at = (String(e.stack).match(/test-polish-live\.mjs:(\d+)/) || [])[1]; failures.push('[' + cur + '] scenario stopped at line ' + at + ': ' + short(e.message, 1200)); console.log('  ABORT [' + cur + '] line ' + at + ': ' + short(e.message, 1200)); }
  console.log('  ' + (failures.length === f0 ? 'ok' : (failures.length - f0) + ' failure(s)') + ' (' + Math.round((Date.now() - t0) / 100) / 10 + 's)');
}
cur = 'NET';
check(externals.length === 0, 'no request ever left 127.0.0.1 (' + externals.length + ': ' + short(externals.slice(0, 3).map((e) => e.method + ' ' + e.url).join(', ')) + ')');
check(net.filter((n) => n.method !== 'GET').length === 0, 'no POST/PUT/DELETE request at all');
cur = 'ERR';
check(pageErrors.length === 0, 'no uncaught page error in any scenario (' + short(pageErrors.slice(0, 3).map((e) => e.scenario + ': ' + e.message).join(' | '), 300) + ')');
await browser.close();
console.log('\nPolish-live checks: ' + (checks - failures.length) + ' passed, ' + failures.length + ' failed, ' + checks + ' total.');
if (failures.length) { console.log('\nFAILED:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
console.log('All polish-live checks passed.');
