/**
 * 試合のカード（準備の画面）の「写真」と「名前・体重・戦績」が、どの画面の幅でも読めること。
 * 写真を大きくしたとき、幅768px・1024px前後で、文字の列が30pxほどにつぶれて、名前が1〜2字ずつ縦に並んでいた
 * （幅320／390／1280pxだけを見る試験では、見つからなかった）。直し：箱に、写真と文字の最低の幅（8rem）が入らないときは、文字を写真の下に回す。
 * 名前・ジム名は、ぜんぶ架空。外には出ない（ここ以外への通信は止める）。
 * 使い方：TOS_TEST_BASE=http://127.0.0.1:<port> node scripts/test-private-card-widths.mjs
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4421';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const EXE = process.env.TOS_CHROME_PATH || '';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

const failures = [];
let checks = 0;
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push(message); console.log('  FAIL ' + message); }
};
const CSV = '管理番号,ジム名,選手名,身長,体重,戦績\nF01,架空赤ジム,架空赤選手一郎,170,60,5戦3勝2敗\nF02,架空青ジム,架空青選手二郎,171,61,12戦7勝5敗';
/** 文字の列の、最低の幅（8rem＝128px）。これより細くしない（箱が細いときは、文字を写真の下に回す） */
const MIN_TEXT = 128;
const WIDTHS = [320, 360, 390, 430, 600, 640, 700, 768, 820, 834, 900, 1023, 1024, 1100, 1280, 1440];

try {
  for (const w of WIDTHS) {
    const mobile = w < 800;
    const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    await ctx.route('**/*', (route) => (route.request().url().startsWith(base + '/') ? route.continue() : route.abort()));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/private/?event=card-widths-' + w);
    await page.locator('#save-state').waitFor();
    await page.getByLabel('大会名', { exact: true }).fill('架空大会');
    await page.locator('#pick-file').setInputFiles({ name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await page.getByRole('status').filter({ hasText: '2人分を読み込みました' }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: '＋ 試合を追加', exact: true }).click();
    await page.locator('#bout-0-red').selectOption('F01');
    await page.locator('#bout-0-blue').selectOption('F02');
    await page.waitForFunction(() => document.querySelectorAll('#bout-0 [data-profile]').length === 2, null, { timeout: 8000 });
    const sides = await page.evaluate(() => [...document.querySelectorAll('#bout-0 [data-profile]')].map((box) => {
      const photo = box.children[0].getBoundingClientRect(), text = box.children[1].getBoundingClientRect(), name = box.querySelector('p.text-lg');
      const lineH = parseFloat(getComputedStyle(name).lineHeight) || 28;
      const room = box.getBoundingClientRect();
      return { photoW: Math.round(photo.width), textW: Math.round(text.width), stacked: text.top >= photo.bottom - 1, nameLines: Math.round(name.getBoundingClientRect().height / lineH), inside: text.right <= room.right + 1 && photo.left >= room.left - 1 };
    }));
    check(sides.length === 2, w + 'px: both corners show their profile');
    for (const [i, side] of sides.entries()) {
      const who = w + 'px ' + (i === 0 ? 'red' : 'blue');
      check(side.textW >= MIN_TEXT, who + ': the text column is at least ' + MIN_TEXT + 'px (' + side.textW + 'px; photo ' + side.photoW + 'px, ' + (side.stacked ? 'text under the photo' : 'side by side') + ')');
      check(side.nameLines <= 2, who + ': the 7-character name takes at most 2 lines (' + side.nameLines + ')');
      check(side.photoW >= 112, who + ': the photo keeps its large size (' + side.photoW + 'px)');
      check(side.inside, who + ': nothing sticks out of its box');
    }
    check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), w + 'px: no sideways scroll');
    check(errors.length === 0, w + 'px: no page errors (' + errors.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }
} finally { await browser.close(); }

console.log('\n' + checks + ' checks, ' + failures.length + ' failed.');
for (const f of failures) console.log(' - ' + f);
process.exit(failures.length ? 1 : 0);
