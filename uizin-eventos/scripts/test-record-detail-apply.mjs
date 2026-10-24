// くわしい戦績（キック・他の格闘技・タイトル/入賞歴）と、体重・戦績の注意文。申し込みのページを本物のChromiumで動かして確かめる。
// 古いリンク（rd なし）は、今までの「戦績」の一行のまま。新しいリンク（rd=on）は、3つの欄と、送る形（recordDetail）。
// 名前・大会名・ジム名・番号は、ぜんぶ架空。
// 使い方：TOS_TEST_BASE=http://127.0.0.1:<port> node --experimental-strip-types scripts/test-record-detail-apply.mjs
import assert from 'node:assert/strict';
import { publicEntryHash } from '../core/publicEntry.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:5621';
const EXE = process.env.TOS_CHROME_PATH || '';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

const ENDPOINT = 'https://script.google.com/macros/s/TOS_RECORD_DETAIL_SIM/exec';
const baseCfg = { endpoint: ENDPOINT, eventId: 'record-detail', title: '架空テスト大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '架空連絡先 02-0000-0000', music: false, grade: 'off', age: 'off', comment: 'off', protocol: '3', mode: 'live' };
const OLD_LINK = publicEntryHash(baseCfg);
const NEW_LINK = publicEntryHash({ ...baseCfg, recordDetail: true });
const OLD_TEXT_KEYS = ['protocol', 'entryKey', 'mode', 'website', 'eventId', 'requestId', 'gym', 'name', 'height', 'weight', 'record', 'fighterClass', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'photoDataUrl'];
const RED_NOTE = '公平で安全なマッチメイクのため、スパーリング大会を含む戦績を正確にご申告ください。戦績の過少申告や虚偽の申告はお控えください。';
const WEIGHT_NOTE = '小学生は健康のため減量せず、普段の体重のままでご入力ください。';

const failures = [];
let cur = '';
const check = (value, message) => {
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 800, hasTouch: viewport.width < 800, deviceScaleFactor: 1 });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(base + '/')) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('pageerror', (e) => pageErrors.push({ scenario: cur, message: e.message }));
  return { ctx, page };
}
async function open(page, hash) {
  await page.goto(base + '/apply/' + hash);
  await page.getByLabel('ジム名 必須', { exact: true }).waitFor({ timeout: 15000 });
  await settle(200);
}
const hidden = (page, name) => page.locator('form input[name="' + name + '"]').inputValue();
const postJson = async (page) => JSON.parse(await hidden(page, 'recordDetail') || 'null');

async function scenario(id, title, viewports, fn) {
  cur = id;
  console.log('== ' + id + ' ' + title);
  for (const vp of viewports) {
    const { ctx, page } = await newPage(vp);
    try { await fn(page, vp); } catch (e) { failures.push('[' + id + '] SCENARIO CRASHED: ' + String(e && e.message).slice(0, 300)); console.log('  FAIL [' + id + '] SCENARIO CRASHED: ' + String(e && e.message).slice(0, 300)); }
    await ctx.close();
  }
}
const DESKTOP = { width: 1280, height: 900 }, PHONE = { width: 390, height: 844 }, SMALL = { width: 320, height: 568 };

await scenario('O1', 'old link: the 戦績 is still the one text line, with the red note under it and the weight note under 体重', [PHONE], async (page) => {
  await open(page, OLD_LINK);
  check((await page.getByLabel('戦績 必須', { exact: true }).count()) === 1, 'old link keeps the one 戦績 text field');
  check((await page.locator('#rd-kick-games').count()) === 0, 'old link has no new 戦績 block');
  check((await page.getByText(RED_NOTE).count()) >= 1, 'red note is shown under 戦績');
  check((await page.getByText(WEIGHT_NOTE).count()) === 1, 'weight note is shown under 体重');
  const names = await page.locator('form input[type=hidden]').evaluateAll((els) => els.map((e) => e.getAttribute('name')));
  check(!names.includes('recordDetail'), 'old link does not post recordDetail');
  for (const key of OLD_TEXT_KEYS) check(names.includes(key), 'old link posts ' + key);
});

await scenario('N1', 'new link: 試合数 first; 勝ち・負け・引き分け only after a game is entered; 戦績 becomes 3勝1敗', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  check((await page.locator('#rd-kick-games').count()) === 1, 'new link shows 試合数');
  check((await page.locator('#rd-kick-win').count()) === 0, '勝ち is hidden before a game');
  await page.locator('#rd-kick-games').fill('4');
  await page.locator('#rd-kick-win').fill('3');
  await page.locator('#rd-kick-loss').fill('1');
  await page.locator('#rd-kick-draw').fill('0');
  await settle(100);
  check((await hidden(page, 'record')) === '3勝1敗', 'record becomes 3勝1敗 from the kick numbers');
  const d = await postJson(page);
  check(d && d.v === 1 && d.kick.games === 4 && d.kick.win === 3 && d.kick.loss === 1 && d.kick.draw === 0, 'recordDetail carries the kick numbers');
  check(d && Array.isArray(d.others) && d.others.length === 0 && Array.isArray(d.titles) && d.titles.length === 0, 'no other sports and no titles when なし');
  check((await page.getByText(RED_NOTE).count()) === 1, 'red note is shown on the new link too');
  check((await page.getByText(WEIGHT_NOTE).count()) === 1, 'weight note is shown on the new link too');
});

await scenario('N2', 'new link: 未経験 = 試合数 0 completes the kick part (record 初試合, no 勝ち fields)', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await page.locator('#rd-kick-games').fill('0');
  await settle(100);
  check((await page.locator('#rd-kick-win').count()) === 0, '勝ち is hidden for 0 games');
  check((await hidden(page, 'record')) === '初試合', 'record is 初試合 for 0 games');
  const d = await postJson(page);
  check(d && d.kick.games === 0 && d.kick.win === 0 && d.kick.loss === 0 && d.kick.draw === 0, 'kick is all zero for 0 games');
});

await scenario('N3', 'new link: kick numbers that do not add up show the 直す line and clear the record', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await page.locator('#rd-kick-games').fill('4');
  await page.locator('#rd-kick-win').fill('2');
  await page.locator('#rd-kick-loss').fill('1');
  await page.locator('#rd-kick-draw').fill('0');
  await settle(100);
  check((await page.getByText('勝ち・負け・引き分けの合計が、試合数（4）と合っていません。').count()) === 1, 'live line says the sum is wrong');
  check((await hidden(page, 'record')) === '', 'record is empty while the numbers do not add up (cannot be sent)');
});

await scenario('N4', 'new link: 他の格闘技 あり adds rows (max 5), 勝敗なし is separate, なし clears them', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await page.locator('#rd-kick-games').fill('0');
  await page.getByRole('radio', { name: 'あり' }).first().check();
  await settle(80);
  check((await page.getByLabel('競技名 必須', { exact: true }).count()) === 1, 'あり shows one 競技 row');
  await page.getByLabel('競技名 必須', { exact: true }).fill('柔道');
  await page.locator('#rd-other-games-0').fill('2');
  await page.locator('#rd-other-win-0').fill('1');
  await page.locator('#rd-other-loss-0').fill('0');
  await page.locator('#rd-other-draw-0').fill('0');
  await page.locator('#rd-other-nores-0').fill('1');
  await settle(60);
  let d = await postJson(page);
  check(d && d.others.length === 1 && d.others[0].sport === '柔道' && d.others[0].noResult === 1, 'others carries 柔道 with 勝敗なし 1');
  await page.getByRole('button', { name: '競技を追加する' }).click();
  check((await page.getByLabel('競技名 必須', { exact: true }).count()) === 2, '競技を追加する adds a second row');
  await page.getByRole('button', { name: 'この競技を消す' }).first().click();
  check((await page.getByLabel('競技名 必須', { exact: true }).count()) === 1, 'この競技を消す removes a row');
  await page.getByRole('radio', { name: 'なし', exact: true }).first().check();
  await settle(60);
  d = await postJson(page);
  check(d && d.others.length === 0, 'なし clears the other sports');
});

await scenario('N5', 'new link: タイトル・入賞歴 あり takes 大会名・年・階級・成績; the year must be 4 digits', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await page.locator('#rd-kick-games').fill('0');
  await page.getByRole('radio', { name: 'あり' }).nth(1).check();
  await settle(80);
  await page.locator('#rd-title-event-0').fill('架空カップ');
  await page.locator('#rd-title-year-0').fill('2025');
  await page.locator('#rd-title-class-0').fill('-60kg');
  await page.locator('#rd-title-result-0').fill('優勝');
  await settle(60);
  const d = await postJson(page);
  check(d && d.titles.length === 1 && d.titles[0].event === '架空カップ' && d.titles[0].year === 2025 && d.titles[0].result === '優勝', 'titles carries the award');
  await page.locator('#rd-title-year-0').fill('25');
  await settle(60);
  const bad = await postJson(page);
  check(bad === null, 'a 2-digit year is not sent (the page holds the link until it is fixed)');
});

await scenario('V1', 'new link: a 他の格闘技 row that does not add up stops the send with the line that says what to fix', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await page.locator('#rd-kick-games').fill('0');
  await page.getByRole('radio', { name: 'あり' }).first().check();
  await settle(60);
  await page.getByLabel('競技名 必須', { exact: true }).fill('空手');
  await page.locator('#rd-other-games-0').fill('3');
  await page.locator('#rd-other-win-0').fill('1');
  await page.locator('#rd-other-loss-0').fill('0');
  await page.locator('#rd-other-draw-0').fill('0');
  await page.locator('#rd-other-nores-0').fill('0');
  await settle(60);
  await page.getByRole('button', { name: '入力内容を確認する →' }).click();
  await settle(300);
  check((await page.locator('section[aria-label="送る前の確認"]').count()) === 0, 'the review screen does not open while a sum is wrong');
  check((await page.getByText('「空手」の勝ち・負け・引き分け・勝敗なしの合計が、試合数と合っていません').count()) >= 1, 'the page says which 競技 to fix');
});

await scenario('L1', 'layout: the new block has no sideways scroll at 320 and 390 with every section open', [SMALL, PHONE], async (page) => {
  await open(page, NEW_LINK);
  await page.locator('#rd-kick-games').fill('5');
  await page.getByRole('radio', { name: 'あり' }).first().check();
  await page.getByRole('radio', { name: 'あり' }).nth(1).check();
  await settle(120);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(!wide, 'no sideways scroll on the page');
  const red = await page.getByText(RED_NOTE).evaluate((el) => getComputedStyle(el).color);
  // Chromium は色を lab() か rgb() で返す。lab の a（正の値ほど赤み）か、rgb の赤の値で、赤みを見る
  const lab = red.match(/^lab\(([\d.]+)\s+([-\d.]+)/), rgb = red.match(/^rgb\((\d+)/);
  check((lab && Number(lab[2]) > 30) || (rgb && Number(rgb[1]) > 120), 'red note is a red text colour (' + red + ')');
});

/* ───────── 黄色い「次はここ」の札（戦績が次にやることのとき、ちょうど1つ、戦績の欄に付く） ───────── */
const markerBoxes = (page) => page.locator('[data-tos-next="1"]');
const markerOnRecord = (page) => page.locator('[data-tos-next="1"] #f-record').count();
const leaveField = (page) => page.evaluate(() => { const el = document.activeElement; if (el && el.blur) el.blur(); });
async function fillFirstFour(page) {
  for (const [key, value] of [['gym', '架空ジム'], ['name', '架空選手'], ['height', '170'], ['weight', '55']]) { const el = page.locator('#f-' + key); await el.fill(value); await el.blur(); }
  await settle(150);
}
/** 他の格闘技の1つ目の行を入れる。nums = [試合数, 勝ち, 負け, 引き分け, 勝敗なし] */
async function fillOtherRow(page, sport, nums) {
  await page.getByLabel('競技名 必須', { exact: true }).first().fill(sport);
  for (const [part, value] of [['games', nums[0]], ['win', nums[1]], ['loss', nums[2]], ['draw', nums[3]], ['nores', nums[4]]]) await page.locator('#rd-other-' + part + '-0').fill(String(value));
}

await scenario('M1', 'new link: when 戦績 is the next thing to do, the one yellow 次はここ marker sits on the 戦績 block', [PHONE, SMALL], async (page) => {
  await open(page, NEW_LINK);
  await fillFirstFour(page);
  const boxes = markerBoxes(page);
  check((await boxes.count()) === 1, 'exactly one yellow marker (' + await boxes.count() + ')');
  check((await boxes.first().innerText()).includes('戦績を入れる'), 'the marker says 戦績を入れる');
  check((await markerOnRecord(page)) === 1, 'the marker box is the 戦績 block');
});

await scenario('M2', 'new link: the marker stays on 戦績 while the cursor is inside; it moves on only when the whole block is complete; an unfinished 他の格闘技 row brings it back', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await fillFirstFour(page);
  await page.locator('#rd-kick-games').fill('4');
  await page.locator('#rd-kick-win').fill('3');
  await page.locator('#rd-kick-loss').fill('1');
  await page.locator('#rd-kick-draw').fill('0');
  check((await markerOnRecord(page)) === 1, 'the marker stays on 戦績 while the cursor is still inside the block');
  await leaveField(page); await settle(200);
  check((await markerOnRecord(page)) === 0 && (await markerBoxes(page).count()) === 1, 'after leaving, the one marker is no longer on 戦績');
  check(/写真/.test(await markerBoxes(page).first().innerText()), 'the next marker is the photo');
  await page.getByRole('radio', { name: 'あり', exact: true }).first().check(); await settle(150);
  check((await markerOnRecord(page)) === 1, 'an unfinished 他の格闘技 row brings the marker back to 戦績');
  await fillOtherRow(page, '空手', [1, 1, 0, 0, 0]);
  await leaveField(page); await settle(200);
  check((await markerOnRecord(page)) === 0 && /写真/.test(await markerBoxes(page).first().innerText()), 'once the row is complete the marker moves on to the photo');
});

await scenario('M3', 'new link: after a failed send the red lines name the row to fix; fixing it clears them and the marker moves on', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await fillFirstFour(page);
  await page.locator('#rd-kick-games').fill('0');
  await page.getByRole('radio', { name: 'あり', exact: true }).first().check();
  await fillOtherRow(page, '空手', [3, 1, 0, 0, 0]);
  await leaveField(page);
  await page.getByRole('button', { name: '入力内容を確認する →' }).click(); await settle(300);
  const line = '「空手」の勝ち・負け・引き分け・勝敗なしの合計が、試合数と合っていません';
  check((await page.getByText(line).count()) >= 1, 'the red list names the 競技 to fix');
  check((await markerOnRecord(page)) === 1, 'the marker is on 戦績 after the failed send');
  await page.locator('#rd-other-win-0').fill('3');
  await leaveField(page); await settle(250);
  check((await page.getByText(line).count()) === 0, 'the red line is gone once the row adds up');
  check((await markerOnRecord(page)) === 0 && (await markerBoxes(page).count()) === 1, 'the marker moved on from 戦績');
});

await browser.close();
const pageErrs = pageErrors.filter((e) => !/Failed to load resource/.test(e.message));
check(pageErrs.length === 0, 'no page errors: ' + JSON.stringify(pageErrs.slice(0, 3)));
const count = failures.length;
console.log(count === 0 ? 'ALL PASS' : count + ' FAILED');
for (const f of failures) console.log(' - ' + f);
process.exit(count === 0 ? 0 : 1);
