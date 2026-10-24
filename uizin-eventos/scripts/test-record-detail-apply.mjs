// くわしい戦績（キック・他の格闘技・タイトル/入賞歴）と、体重・戦績の注意文。申し込みのページを本物のChromiumで動かして確かめる。
// 古いリンク（rd なし）は、今までの「戦績」の一行のまま。新しいリンク（rd=on）は、3つの欄と、送る形（recordDetail）。
// 聞くのは「試合数」と「勝ち」だけ（2026-10-24 owner）。負け＝試合数−勝ち、引き分け・勝敗なし＝0 で送る（Googleの受付は変えない）。
// 戦績の一行（シートの「戦績・競技歴」にも入る）は「4戦3勝1敗」の形（2026-10-24 owner の3つ目の依頼。『分』は出さない）。
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
  // 入れた途中で読み直すときの「このページを離れますか？」は、離れる（下書きを戻す場面のため）。ほかの確認は、閉じる
  page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
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

await scenario('N1', 'new link: 試合数 first; 勝ち only after a game is entered (no 負け・引き分け fields); 戦績 becomes 4戦3勝1敗 (負け = 試合数 − 勝ち)', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  check((await page.locator('#rd-kick-games').count()) === 1, 'new link shows 試合数');
  check((await page.locator('#rd-kick-win').count()) === 0, '勝ち is hidden before a game');
  await page.locator('#rd-kick-games').fill('4');
  check((await page.locator('#rd-kick-win').count()) === 1, '勝ち shows once a game is entered');
  check((await page.locator('#rd-kick-loss').count()) === 0 && (await page.locator('#rd-kick-draw').count()) === 0, 'there is no 負け field and no 引き分け field');
  await page.locator('#rd-kick-win').fill('3');
  await settle(100);
  const words = await page.locator('#f-record').innerText();
  check(!/負け|引き分け|勝敗なし/.test(words), 'the 戦績 block never says 負け・引き分け・勝敗なし (' + words.replace(/\s+/g, ' ').slice(0, 60) + ')');
  check((await hidden(page, 'record')) === '4戦3勝1敗', 'record becomes 4戦3勝1敗 from 試合数 4 and 勝ち 3');
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

await scenario('N3', 'new link: 勝ち more than 試合数 shows the 直す line and clears the record; fixing it brings the record back', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await page.locator('#rd-kick-games').fill('4');
  await page.locator('#rd-kick-win').fill('5');
  await settle(100);
  check((await page.getByText('勝ちが、試合数（4）より多くなっています。').count()) === 1, 'live line says 勝ち is more than 試合数');
  check((await hidden(page, 'record')) === '', 'record is empty while 勝ち is more than 試合数 (cannot be sent)');
  await page.locator('#rd-kick-win').fill('4');
  await settle(100);
  check((await page.getByText('勝ちが、試合数（4）より多くなっています。').count()) === 0, 'the line goes away once 勝ち is fixed');
  check((await hidden(page, 'record')) === '4戦4勝0敗', 'record is back (4戦4勝0敗: every game won)');
  await page.locator('#rd-kick-win').fill('');
  await settle(100);
  check((await hidden(page, 'record')) === '', 'an empty 勝ち also cannot be sent');
});

await scenario('N4', 'new link: 他の格闘技 あり adds rows (max 5) with only 競技名・試合数・勝ち, なし clears them', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await page.locator('#rd-kick-games').fill('0');
  await page.getByRole('radio', { name: 'あり' }).first().check();
  await settle(80);
  check((await page.getByLabel('競技名 必須', { exact: true }).count()) === 1, 'あり shows one 競技 row');
  await page.getByLabel('競技名 必須', { exact: true }).fill('柔道');
  await page.locator('#rd-other-games-0').fill('2');
  await page.locator('#rd-other-win-0').fill('1');
  await settle(60);
  check((await page.locator('#rd-other-loss-0').count()) === 0 && (await page.locator('#rd-other-draw-0').count()) === 0 && (await page.locator('#rd-other-nores-0').count()) === 0, 'there is no 負け・引き分け・勝敗なし field in a 他の格闘技 row');
  let d = await postJson(page);
  check(d && d.others.length === 1 && d.others[0].sport === '柔道' && d.others[0].games === 2 && d.others[0].win === 1 && d.others[0].loss === 1 && d.others[0].draw === 0 && d.others[0].noResult === 0, 'others carries 柔道 with 試合数 2・勝ち 1 (負け is 試合数 − 勝ち, 引き分け・勝敗なし are 0)');
  await page.getByRole('button', { name: '競技を追加する' }).click();
  check((await page.getByLabel('競技名 必須', { exact: true }).count()) === 2, '競技を追加する adds a second row');
  // 上限は5つ。5つになったら、追加のボタンが消えて、「5つまで」の一言になる
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '競技を追加する' }).click();
  check((await page.getByLabel('競技名 必須', { exact: true }).count()) === 5, 'up to five rows can be added');
  check((await page.getByRole('button', { name: '競技を追加する' }).count()) === 0, 'at five rows the 競技を追加する button is gone');
  check(await page.getByText('追加できるのは、5つまでです。').isVisible(), 'at five rows it says 追加できるのは、5つまでです。');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'この競技を消す' }).last().click();
  check((await page.getByLabel('競技名 必須', { exact: true }).count()) === 1, 'この競技を消す removes rows (back to the first one)');
  check((await page.getByRole('button', { name: '競技を追加する' }).count()) === 1, 'below five the 競技を追加する button comes back');
  check((await page.getByLabel('競技名 必須', { exact: true }).inputValue()) === '柔道', 'the first row (柔道) is the one that stays');
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

await scenario('V1', 'new link: a 他の格闘技 row whose 勝ち is more than 試合数 stops the send with the line that says what to fix', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await page.locator('#rd-kick-games').fill('0');
  await page.getByRole('radio', { name: 'あり' }).first().check();
  await settle(60);
  await page.getByLabel('競技名 必須', { exact: true }).fill('空手');
  await page.locator('#rd-other-games-0').fill('3');
  await page.locator('#rd-other-win-0').fill('4');
  await settle(60);
  await page.getByRole('button', { name: '入力内容を確認する →' }).click();
  await settle(300);
  check((await page.locator('section[aria-label="送る前の確認"]').count()) === 0, 'the review screen does not open while 勝ち is more than 試合数');
  check((await page.getByText('「空手」の勝ちが、試合数（3）より多くなっています。').count()) >= 1, 'the page says which 競技 to fix');
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
/** 他の格闘技の1つ目の行を入れる。nums = [試合数, 勝ち] */
async function fillOtherRow(page, sport, nums) {
  await page.getByLabel('競技名 必須', { exact: true }).first().fill(sport);
  for (const [part, value] of [['games', nums[0]], ['win', nums[1]]]) await page.locator('#rd-other-' + part + '-0').fill(String(value));
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
  check((await markerOnRecord(page)) === 1, 'the marker stays on 戦績 while the cursor is still inside the block');
  await leaveField(page); await settle(200);
  check((await markerOnRecord(page)) === 0 && (await markerBoxes(page).count()) === 1, 'after leaving, the one marker is no longer on 戦績');
  check(/写真/.test(await markerBoxes(page).first().innerText()), 'the next marker is the photo');
  await page.getByRole('radio', { name: 'あり', exact: true }).first().check(); await settle(150);
  check((await markerOnRecord(page)) === 1, 'an unfinished 他の格闘技 row brings the marker back to 戦績');
  await fillOtherRow(page, '空手', [1, 1]);
  await leaveField(page); await settle(200);
  check((await markerOnRecord(page)) === 0 && /写真/.test(await markerBoxes(page).first().innerText()), 'once the row is complete the marker moves on to the photo');
});

await scenario('M3', 'new link: after a failed send the red lines name the row to fix (勝ち more than 試合数); fixing it clears them and the marker moves on', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await fillFirstFour(page);
  await page.locator('#rd-kick-games').fill('0');
  await page.getByRole('radio', { name: 'あり', exact: true }).first().check();
  await fillOtherRow(page, '空手', [3, 4]);
  await leaveField(page);
  await page.getByRole('button', { name: '入力内容を確認する →' }).click(); await settle(300);
  const line = '「空手」の勝ちが、試合数（3）より多くなっています。';
  check((await page.getByText(line).count()) >= 1, 'the red list names the 競技 to fix');
  check((await markerOnRecord(page)) === 1, 'the marker is on 戦績 after the failed send');
  await page.locator('#rd-other-win-0').fill('3');
  await leaveField(page); await settle(250);
  check((await page.getByText(line).count()) === 0, 'the red line is gone once 勝ち is fixed');
  check((await markerOnRecord(page)) === 0 && (await markerBoxes(page).count()) === 1, 'the marker moved on from 戦績');
});

/* ───────── 最後まで入れて送る（確認の画面と、送る中身。Googleの受付は、これまでと同じ形で受ける） ───────── */
for (const vp of [PHONE, SMALL]) {
  cur = 'E1';
  console.log('== E1 new link (' + vp.width + 'px): fill everything; the review says ○戦○勝○敗 (敗 = 試合数 − 勝ち) and what 敗 means; the sent recordDetail keeps the old shape');
  const mobile = vp.width < 800;
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const posts = [];
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(base + '/')) return route.continue();
    if (url === ENDPOINT && req.method() === 'POST') {
      posts.push(new URLSearchParams(req.postData() || ''));
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><h1>申し込みが完了しました</h1><p>TEST-RECEIPT-0001</p>' });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('pageerror', (e) => pageErrors.push({ scenario: cur, message: e.message }));
  try {
    await open(page, NEW_LINK);
    for (const [label, value] of [['ジム名 必須', '架空ジム'], ['選手名 必須', '架空選手'], ['身長（cm）必須', '170'], ['体重（kg）必須', '65'], ['連絡先のお名前 必須', '架空連絡先'], ['電話番号 必須', '09012345678'], ['メールアドレス 必須', 'test@example.com']]) await page.getByLabel(label, { exact: true }).fill(value);
    await page.locator('#rd-kick-games').fill('4');
    await page.locator('#rd-kick-win').fill('3');
    await page.getByRole('radio', { name: 'あり', exact: true }).first().check();
    await fillOtherRow(page, '柔道', [12, 7]);
    await page.getByRole('radio', { name: 'あり', exact: true }).nth(1).check();
    await page.locator('#rd-title-event-0').fill('架空カップ');
    await page.locator('#rd-title-year-0').fill('2025');
    await page.locator('#rd-title-class-0').fill('-60kg');
    await page.locator('#rd-title-result-0').fill('優勝');
    const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 120, 160); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
    await page.locator('input[type=file]').setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await page.getByAltText('選んだ写真').waitFor();
    await page.getByRole('checkbox').check();
    // 入力のまま（確認の前）：どの欄にも、負け・引き分け・勝敗なしは出ない。ふくめて、横にはみ出さない
    const block = await page.locator('#f-record').innerText();
    check(!/負け|引き分け|勝敗なし/.test(block), 'the 戦績 block (every section open) never says 負け・引き分け・勝敗なし');
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), 'no sideways scroll with every row open');
    // 他の格闘技の2つの欄は、縦に1列（入力欄の高さが、そろう）
    const a = await page.locator('#rd-other-games-0').boundingBox(), b = await page.locator('#rd-other-win-0').boundingBox();
    check(a && b && Math.abs(a.x - b.x) < 2 && b.y > a.y, '試合数 and 勝ち are stacked in one column (' + (a && b ? Math.round(a.x) + '/' + Math.round(b.x) : '?') + ')');
    await page.getByRole('button', { name: '入力内容を確認する →', exact: true }).click();
    await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor({ timeout: 8000 });
    const review = await page.locator('section[aria-label="送る前の確認"]').innerText();
    // 2026-10-24 owner：確認の画面は ○戦○勝○敗 で出す（敗＝試合数−勝ち。引き分けも入る）。シートの戦績の一行も、同じ形（3つ目の依頼）
    check(review.includes('4戦3勝1敗'), 'the review shows the kick as 4戦3勝1敗');
    check(review.includes('12戦7勝5敗'), 'the review shows 柔道 as 12戦7勝5敗');
    check(review.includes('架空カップ'), 'the review shows the title');
    check(!/試合 4・勝ち 3|試合 12・勝ち 7/.test(review), 'the old 試合 4・勝ち 3 wording is gone from the review');
    check(!/勝敗なし/.test(review), 'the review never says 勝敗なし (there is no such input any more)');
    const note = page.locator('#review-record-note');
    check((await note.count()) === 1 && (await note.innerText()) === '「敗」は、試合数から勝ちを引いた数です（引き分けも入ります）。', 'the review says what 敗 means, once');
    const noteFont = await note.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    check(noteFont >= 17, 'the note is 17px or bigger (' + noteFont + 'px)');
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), 'no sideways scroll on the review');
    await page.getByRole('button', { name: 'この内容で送信する', exact: true }).click();
    await page.getByRole('heading', { name: '申し込みが完了しました', exact: true }).waitFor({ timeout: 10000 });
    check(posts.length === 1, 'exactly one POST was sent (' + posts.length + ')');
    const sent = posts[0];
    check(sent && sent.get('record') === '4戦3勝1敗', 'record is 4戦3勝1敗, the same one line the Google receiver (build 3.20261024.2) stores in the sheet (' + (sent ? sent.get('record') : 'no post') + ')');
    const expected = '{"v":1,"kick":{"games":4,"win":3,"loss":1,"draw":0},"others":[{"sport":"柔道","games":12,"win":7,"loss":5,"draw":0,"noResult":0}],"titles":[{"event":"架空カップ","year":2025,"class":"-60kg","result":"優勝"}]}';
    check(sent && sent.get('recordDetail') === expected, 'recordDetail keeps the old shape the Google receiver accepts: ' + (sent ? String(sent.get('recordDetail')).slice(0, 200) : 'no post'));
  } catch (e) { failures.push('[E1] SCENARIO CRASHED: ' + String(e && e.message).slice(0, 300)); console.log('  FAIL [E1] SCENARIO CRASHED: ' + String(e && e.message).slice(0, 300)); }
  await ctx.close();
}

/* ───────── 未経験（試合数0）：確認の画面は「未経験（試合数 0）」。戦に出る行が無いので、「敗」の一言は出ない ───────── */
for (const vp of [PHONE]) {
  cur = 'E2';
  console.log('== E2 new link (' + vp.width + 'px): 試合数 0 -> the review says 未経験 and shows no 敗 note');
  const ctx = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.route('**/*', (route) => (route.request().url().startsWith(base + '/') ? route.continue() : route.abort()));
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('pageerror', (e) => pageErrors.push({ scenario: cur, message: e.message }));
  try {
    await open(page, NEW_LINK);
    for (const [label, value] of [['ジム名 必須', '架空ジム'], ['選手名 必須', '架空選手'], ['身長（cm）必須', '170'], ['体重（kg）必須', '65'], ['連絡先のお名前 必須', '架空連絡先'], ['電話番号 必須', '09012345678'], ['メールアドレス 必須', 'test@example.com']]) await page.getByLabel(label, { exact: true }).fill(value);
    await page.locator('#rd-kick-games').fill('0');
    const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 120, 160); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
    await page.locator('input[type=file]').setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await page.getByAltText('選んだ写真').waitFor();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '入力内容を確認する →', exact: true }).click();
    await page.getByRole('heading', { name: '送る前の確認', exact: true }).waitFor({ timeout: 8000 });
    const review = await page.locator('section[aria-label="送る前の確認"]').innerText();
    check(review.includes('未経験（試合数 0）'), 'the review says 未経験（試合数 0）');
    check(!/[0-9]戦[0-9]+勝/.test(review) && (await page.locator('#review-record-note').count()) === 0, 'no ○戦○勝○敗 line and no 敗 note for a fighter with no matches');
  } catch (e) { failures.push('[E2] SCENARIO CRASHED: ' + String(e && e.message).slice(0, 300)); console.log('  FAIL [E2] SCENARIO CRASHED: ' + String(e && e.message).slice(0, 300)); }
  await ctx.close();
}

/* ───────── 見直し（2026-10-24）で直した所：進み具合・「直す」の言い方・下書きの戻し方・入力の検出・「なし」で行が消えない ───────── */
const progress = async (page) => { const m = (await page.evaluate(() => document.body.innerText)).match(/入力 (\d+)\/(\d+)/); return m ? [Number(m[1]), Number(m[2])] : [-1, -1]; };
const markText = (page) => page.evaluate(() => [...document.querySelectorAll('[data-tos-next] .tos-next-badge')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const DRAFT_KEY = 'tos-apply-draft:v1:record-detail:live';
const putDraft = (page, f) => page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [DRAFT_KEY, JSON.stringify({ v: 1, eventId: 'record-detail', mode: 'live', savedAt: Date.now(), f })]);
const FOUR = [['ジム名 必須', '架空ジム'], ['選手名 必須', '架空選手'], ['身長（cm）必須', '170'], ['体重（kg）必須', '65']];

await scenario('F1', '見直し A1: 足した行が途中のあいだは、「入力 N/M」も「ぜんぶ入りました」も、まだ。黄色の札と同じ答え', [PHONE, SMALL], async (page) => {
  await open(page, NEW_LINK);
  for (const [label, value] of FOUR) await page.getByLabel(label, { exact: true }).fill(value);
  await page.locator('#rd-kick-games').fill('5');
  await page.locator('#rd-kick-win').fill('3');
  await leaveField(page); await settle(150);
  const [f0, t0] = await progress(page);
  await page.getByRole('radio', { name: 'あり', exact: true }).first().check();   // 他の格闘技「あり」＝空の1行ができる
  await settle(150);
  const [f1, t1] = await progress(page);
  check(t1 === t0 && f1 === f0 - 1, 'an empty added row takes 戦績 back to "not done" in the counter (入力 ' + f0 + '/' + t0 + ' → ' + f1 + '/' + t1 + ')');
  check((await markerOnRecord(page)) === 1 && /戦績/.test((await markText(page))[0] || ''), 'and the yellow marker sits on 戦績 (' + (await markText(page)).join('|') + ')');
  await fillOtherRow(page, '柔道', [12, 7]);
  await leaveField(page); await settle(150);
  const [f2, t2] = await progress(page);
  check(f2 === f0 && t2 === t0, 'filling the row brings the counter back (入力 ' + f2 + '/' + t2 + ')');
});

await scenario('F2', '見直し A2: 入れたのにまちがっている戦績は、「戦績を直す」と「直す所：戦績」。まだ入れていないときは、これまでどおり「戦績を入れる」', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  for (const [label, value] of FOUR) await page.getByLabel(label, { exact: true }).fill(value);
  // まず、戦績が空のまま押す：戦績は「足りない所」に入る（数を覚える）
  await page.getByRole('button', { name: '入力内容を確認する →' }).click();
  await page.locator('#apply-msg').filter({ hasText: '足りない所' }).waitFor({ timeout: 5000 }).catch(() => {});
  const emptyBand = (await page.locator('#apply-msg').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const missingEmpty = Number(emptyBand.match(/足りない所が([0-9]+)か所/)?.[1] ?? NaN);
  check(missingEmpty >= 1 && !/直す所：[^。]*戦績/.test(emptyBand), 'with 戦績 still empty it is one of the 足りない所 (' + emptyBand.slice(0, 80) + ')');
  await page.locator('#rd-kick-games').fill('3');
  await leaveField(page); await settle(150);
  check(/戦績を入れる/.test((await markText(page))[0] || ''), 'a half-typed 戦績 (試合数 only) is still "戦績を入れる" (' + (await markText(page)).join('|') + ')');
  await page.locator('#rd-kick-win').fill('5');
  await leaveField(page); await settle(150);
  await page.getByRole('button', { name: '入力内容を確認する →' }).click();
  await page.locator('#apply-msg').filter({ hasText: '直す所' }).waitFor({ timeout: 5000 }).catch(() => {});
  const band = (await page.locator('#apply-msg').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const missingNow = Number(band.match(/足りない所が([0-9]+)か所/)?.[1] ?? 0);
  // 入れたのにまちがっている戦績は「直す所」。「足りない所」は、1つへる（ほかの空の欄の分だけ残る）
  check(/直す所：[^。]*戦績/.test(band) && missingNow === missingEmpty - 1, 'the typed-but-wrong 戦績 moves from 足りない所 (' + missingEmpty + ') to 直す所：戦績 (' + band.slice(0, 80) + ')');
  check(/戦績を直す/.test((await markText(page))[0] || ''), 'the yellow marker says 「戦績を直す」 (' + (await markText(page)).join('|') + ')');
  await page.locator('#rd-kick-win').fill('3');
  await leaveField(page); await settle(200);
  check(!/戦績を直す/.test((await markText(page))[0] || ''), 'after fixing, the marker no longer says 直す');
});

await scenario('F3', '見直し A3・A4: 下書きを戻す。読めない戦績は「入った」にしない。初試合のあとで試合数を変えても、勝ちは空から', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await putDraft(page, { gym: '架空ジム', name: '架空選手', record: 'アマ2勝' });
  await page.reload(); await page.getByLabel('ジム名 必須', { exact: true }).waitFor(); await settle(250);
  await page.getByRole('button', { name: '戻す', exact: true }).click(); await settle(250);
  const [filled] = await progress(page);
  check(filled === 2, 'an unreadable draft 戦績 is not counted as done: only ジム名 and 選手名 (入力 ' + filled + ')');
  check((await page.locator('#rd-kick-games').inputValue()) === '' && (await markerOnRecord(page)) === 0 && (await markText(page)).length === 1, 'the 戦績 block stays empty');
  await page.evaluate(() => sessionStorage.clear());
  await putDraft(page, { gym: '架空ジム', name: '架空選手', record: '初試合' });
  await page.reload(); await page.getByLabel('ジム名 必須', { exact: true }).waitFor(); await settle(250);
  await page.getByRole('button', { name: '戻す', exact: true }).click(); await settle(250);
  check((await page.locator('#rd-kick-games').inputValue()) === '0', '初試合 puts 試合数 back as 0');
  await page.locator('#rd-kick-games').fill('3'); await settle(100);
  check((await page.locator('#rd-kick-win').count()) === 1 && (await page.locator('#rd-kick-win').inputValue()) === '', 'changing 試合数 to 3 shows an EMPTY 勝ち (not a pre-filled 0)');
});

await scenario('F4', '見直し A5: くわしい戦績の欄だけ入れても、別の大会のリンクに変わるとき確かめる（何も入れていなければ、確かめない）', [PHONE], async (page) => {
  const OTHER = publicEntryHash({ ...baseCfg, eventId: 'record-detail-2', recordDetail: true });
  await open(page, NEW_LINK);
  await page.evaluate((h) => { location.hash = h; }, OTHER); await settle(300);
  check(!/別の大会のリンクです/.test(await bodyText(page)), 'nothing typed: switching links does not ask');
  await open(page, NEW_LINK);
  await page.locator('#rd-kick-games').fill('5');
  await page.evaluate((h) => { location.hash = h; }, OTHER); await settle(300);
  check(/別の大会のリンクです/.test(await bodyText(page)), 'only 試合数 typed: switching links asks first');
  await open(page, NEW_LINK);
  await page.getByRole('radio', { name: 'あり', exact: true }).first().check();
  await page.getByLabel('競技名 必須', { exact: true }).first().fill('柔道');
  await page.evaluate((h) => { location.hash = h; }, OTHER); await settle(300);
  check(/別の大会のリンクです/.test(await bodyText(page)), 'only a 他の格闘技 row typed: switching links asks first');
});

await scenario('F5', '見直し A6: 「なし」を押しても、入れた行は消えない（もう一度「あり」にすると、戻る）。「なし」のあいだは、送らない', [PHONE], async (page) => {
  await open(page, NEW_LINK);
  await page.locator('#rd-kick-games').fill('5'); await page.locator('#rd-kick-win').fill('3');
  await page.getByRole('radio', { name: 'あり', exact: true }).first().check();
  await fillOtherRow(page, '柔道', [12, 7]);
  await page.getByRole('radio', { name: 'なし', exact: true }).first().check(); await settle(120);
  check((await page.locator('#rd-other-games-0').count()) === 0, 'while なし, the row is hidden');
  const posted = await postJson(page);
  check(posted && posted.others.length === 0, 'while なし, nothing about 柔道 is posted');
  await page.getByRole('radio', { name: 'あり', exact: true }).first().check(); await settle(120);
  check((await page.locator('#rd-other-games-0').inputValue()) === '12' && (await page.locator('#rd-other-win-0').inputValue()) === '7' && (await page.getByLabel('競技名 必須', { exact: true }).first().inputValue()) === '柔道', 'back to あり: the typed row is back');
});

await browser.close();
await scenario('F6', '採点 3-ux: 確認を押す前でも、入れたのにまちがっている戦績（勝ち＞試合数）は、戦績の箱を出たら「戦績を直す」と「直す所：戦績」。箱の中にいる間・空・入力の途中は、赤にしない', [PHONE, SMALL], async (page) => {
  await open(page, NEW_LINK);
  for (const [label, value] of FOUR) await page.getByLabel(label, { exact: true }).fill(value);
  const fixLine = async () => (await bodyText(page)).includes('直す所：戦績');
  await page.locator('#rd-kick-games').fill('3');
  await leaveField(page); await settle(150);
  check(/戦績を入れる/.test((await markText(page))[0] || '') && !(await fixLine()), 'half-typed (試合数 only), after leaving: still 「戦績を入れる」, no red (' + (await markText(page)).join('|') + ')');
  await page.locator('#rd-kick-win').fill('5');
  await settle(150);
  check(/戦績を入れる/.test((await markText(page))[0] || '') && !(await fixLine()), 'while the cursor is still in the block: not yet 直す (' + (await markText(page)).join('|') + ')');
  await leaveField(page); await settle(200);
  check(/戦績を直す/.test((await markText(page))[0] || ''), 'after leaving the block: the yellow marker says 「戦績を直す」 (' + (await markText(page)).join('|') + ')');
  check(await fixLine(), 'and the red 「直す所：戦績」 line is shown, like the other fields');
  check((await page.getByRole('heading', { name: '送る前の確認', exact: true }).count()) === 0, 'nothing was pressed: no review screen');
  await page.locator('#rd-kick-win').fill('3');
  await leaveField(page); await settle(200);
  check(!/戦績を直す/.test((await markText(page))[0] || '') && !(await fixLine()), 'after fixing: no 直す, no red');
});

const pageErrs = pageErrors.filter((e) => !/Failed to load resource/.test(e.message));
check(pageErrs.length === 0, 'no page errors: ' + JSON.stringify(pageErrs.slice(0, 3)));
const count = failures.length;
console.log(count === 0 ? 'ALL PASS' : count + ' FAILED');
for (const f of failures) console.log(' - ' + f);
process.exit(count === 0 ? 0 : 1);
