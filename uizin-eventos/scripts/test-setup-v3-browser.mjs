/** Local-only browser checks for /private/setup/. Google is simulated; no real account/data is used. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publicEntryConfig, publicEntryReady } from '../core/publicEntry.ts';
import { EXPECTED_RECEPTION_BUILD } from '../core/setupV3.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4421';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const endpoint = 'https://script.google.com/macros/s/TOS_V3_SIMULATION/exec';
const copyUrl = 'https://docs.google.com/spreadsheets/d/' + 'T'.repeat(30) + '/copy';
const READY = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: false, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: '架空テスト大会', date: '2099-12-01', venue: '架空体育館', venueUrl: '', organizer: '架空主催', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
const browser = await chromium.launch({ headless: true, channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' });
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
try {
  for (const mobile of [false, true]) {
    const eventId = mobile ? 'v3-mobile' : 'v3-desktop';
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
    const network = [], errors = [];
    let pingState = { ...READY };
    context.on('page', (page) => page.on('pageerror', (e) => errors.push(e.message)));
    await context.route('**/*', async (route) => {
      const request = route.request();
      network.push({ url: request.url(), method: request.method(), body: request.postData() });
      if (request.url() === base + '/template-link.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ copyUrl }) });
      if (request.url().startsWith(base + '/')) return route.continue();
      if (request.url() === endpoint + '?action=ping' && request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(pingState) });
      return route.abort();
    });
    const page = await context.newPage();
    page.on('console', (entry) => { if (entry.type() === 'error') console.log('Browser console:', entry.text().slice(0, 300)); });
    await page.goto(base + '/private/setup/?' + new URLSearchParams({ event: eventId }));

    // 1. ひな形をコピーして設定（この画面では、大会の情報を入力させない）
    check(await page.getByText('いまここ 1 / 3').isVisible(), 'shows where the user is');
    check((await page.getByRole('link', { name: /ひな形のコピーを作る/ }).getAttribute('href')) === copyUrl, 'copy link comes from template-link.json');
    check((await page.getByPlaceholder('例: 20271003').count()) === 0 && (await page.getByLabel('会場', { exact: true }).count()) === 0, 'no tournament fields are typed on this screen');
    check(await page.getByText('「設定」タブ').first().isVisible(), 'tells where to type');
    check(await page.getByText('ためしの申し込みが1件、自動で送られます').isVisible(), 'self test is automatic');
    await page.getByRole('button', { name: /「準備できました」と出た/ }).click();

    // 2. 公開してURLを貼る
    check(await page.getByText('いまここ 2 / 3').isVisible(), 'moves to step 2');
    const next2 = page.getByRole('button', { name: '次へ進む' });
    check(await next2.isDisabled(), 'cannot move on before connecting');
    const input = page.getByPlaceholder('https://script.google.com/macros/s/…/exec');
    await input.fill('https://example.com/exec');
    check(await page.getByRole('button', { name: 'もう一度確かめる' }).isDisabled(), 'a non-Google URL is never checked');
    await input.fill(endpoint);
    await page.getByText('次は、シートのメニュー「Tournament OS」→「② 受付を開始」を押してください。').first().waitFor();
    check(!(await next2.isDisabled()), 'auto check enables next without pasting any code');
    check(await page.getByText('架空テスト大会', { exact: true }).isVisible() && await page.getByText('2099年12月1日', { exact: true }).isVisible() && await page.getByText('架空主催', { exact: true }).isVisible(), 'shows the settings read from the sheet');
    for (const [state, text] of [[{ build: '3.0.0' }, 'Googleの版が古いです'], [{ ready: false }, 'まだ最初の設定が終わっていません'], [{ settingsProblem: '「設定」タブの、次の欄を入れてください：会場' }, '次の欄を入れてください：会場'], [{ testComplete: false }, '自動テストがまだです']]) {
      pingState = { ...READY, ...state };
      await page.getByRole('button', { name: 'もう一度確かめる' }).click();
      await page.getByText(text).first().waitFor();
      const blocksNext = ['Googleの版が古いです', 'まだ最初の設定が終わっていません', '次の欄を入れてください：会場'].includes(text);
      check((await next2.isDisabled()) === blocksNext, 'next button state for: ' + text);
    }
    pingState = { ...READY };
    await page.getByRole('button', { name: 'もう一度確かめる' }).click();
    await page.getByText('次は、シートのメニュー「Tournament OS」→「② 受付を開始」を押してください。').first().waitFor();

    // 自動確認が使えないとき（貼って確かめる）
    await page.locator('summary', { hasText: '自動で確かめられないとき' }).click();
    check((await page.getByRole('link', { name: '確かめるページを開く' }).getAttribute('href')) === endpoint + '?action=ping', 'fallback opens only the ping page');
    await page.getByPlaceholder('{"app":"tournament-os", …}').fill('これは違う文字');
    await page.getByText('貼った文字を読めません').waitFor();
    check(await next2.isDisabled(), 'garbage paste does not unlock the next step');
    await page.getByPlaceholder('{"app":"tournament-os", …}').fill(JSON.stringify(READY));
    await page.getByText('次は、シートのメニュー「Tournament OS」→「② 受付を開始」を押してください。').first().waitFor();
    check(!(await next2.isDisabled()), 'pasted public status unlocks the next step');
    await next2.click();

    // 3. 受付を始める
    check(await page.getByText('いまここ 3 / 3').isVisible(), 'moves to step 3');
    const copyLive = page.getByRole('button', { name: '完成：選手へ渡すURLをコピー' });
    check(await copyLive.isDisabled(), 'no public URL before opening');
    pingState = { ...READY, accepting: true };
    await page.getByRole('button', { name: 'もう一度確かめる', exact: true }).click();
    await page.getByText('✓ 受付できます。選手に渡すURLをコピーできます。', { exact: true }).first().waitFor();
    await copyLive.click();
    const live = await page.evaluate(() => navigator.clipboard.readText());
    const liveConfig = publicEntryConfig(new URL(live).hash);
    check(live.startsWith(base + '/apply/#') && liveConfig.mode === 'live' && liveConfig.protocol === '3' && liveConfig.endpoint === endpoint && publicEntryReady(liveConfig), 'public URL is a ready live link');
    check(liveConfig.title === '架空テスト大会' && liveConfig.venue === '架空体育館' && liveConfig.organizer === '架空主催' && liveConfig.contact === '0200000000' && liveConfig.deadline === '2099-11-30' && liveConfig.eventId === 'tos-0123456789', 'public URL carries only what the sheet said');
    check(!/entryKey|setupKey|TOS2|@/.test(live), 'public URL carries no key or email');
    await page.locator('summary', { hasText: '任意：本物の申込画面でも' }).click();
    const testLink = await page.getByRole('link', { name: /テスト申込を開く/ }).getAttribute('href');
    check(testLink.startsWith('/apply/#') && testLink.includes('protocol=3') && testLink.includes('mode=test') && !/entryKey/.test(testLink) && publicEntryReady(publicEntryConfig(testLink.slice('/apply/'.length))), 'optional test link is protocol 3 without a key');

    // 設定ファイル・復元
    await page.locator('summary', { hasText: '別のパソコンで続ける' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '設定を書き出す' }).click()]);
    const file = JSON.parse(await readFile(await download.path(), 'utf8'));
    check(file.kind === 'tournament-os-setup' && file.version === 2 && file.eventId === eventId && file.endpoint === endpoint, 'setup file has the local name and URL');
    check(Object.keys(file).sort().join() === 'endpoint,eventId,kind,version' && !/@|TOS2|key/i.test(JSON.stringify(file)), 'setup file has nothing else: no email, code, key or tournament data');
    await page.reload();
    await page.getByText('いまここ 3 / 3').waitFor();
    check(true, 'state is restored after reload');

    // 通信は、自分の画面・ひな形リンク・ping(GET)だけ
    const outside = network.filter((n) => !n.url.startsWith(base + '/'));
    check(outside.length > 0 && outside.every((n) => n.url === endpoint + '?action=ping' && n.method === 'GET' && !n.body), 'only ping GET leaves the page');
    check(errors.length === 0, 'no page errors: ' + errors.join(' | '));
    await context.close();
    console.log((mobile ? 'Mobile-size' : 'Desktop') + ' v3 setup PASS');
  }
  console.log('v3 browser checks passed:', checks);
} finally { await browser.close(); }
