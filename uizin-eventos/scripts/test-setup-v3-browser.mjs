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
const browser = await chromium.launch({ headless: true, channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' });
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
try {
  for (const mobile of [false, true]) {
    const eventId = mobile ? 'v3-mobile' : 'v3-desktop';
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
    const network = [], errors = [];
    let pingState = { build: EXPECTED_RECEPTION_BUILD, ready: true, eventId, testComplete: false, accepting: false };
    context.on('page', (page) => page.on('pageerror', (e) => errors.push(e.message)));
    await context.route('**/*', async (route) => {
      const request = route.request();
      network.push({ url: request.url(), method: request.method(), body: request.postData() });
      if (request.url() === base + '/template-link.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ copyUrl }) });
      if (request.url().startsWith(base + '/')) return route.continue();
      if (request.url() === endpoint + '?action=ping' && request.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ app: 'tournament-os', protocol: 3, deadline: '2027-10-03', ...pingState }) });
      }
      return route.abort();
    });
    const page = await context.newPage();
    page.on('console', (entry) => { if (entry.type() === 'error') console.log('Browser console:', entry.text().slice(0, 300)); });
    await page.goto(base + '/private/setup/?' + new URLSearchParams({ event: eventId }));

    // 1. ひな形をコピー
    check(await page.getByText('いまここ 1 / 4').isVisible(), 'shows where the user is');
    check((await page.getByRole('link', { name: /ひな形のコピーを作る/ }).getAttribute('href')) === copyUrl, 'copy link comes from template-link.json');
    check(await page.getByRole('button', { name: 'コピーを作った →' }).isDisabled(), 'cannot move on without title and deadline');
    await page.getByPlaceholder('例：第1回 ○○ジム大会').fill('架空テスト大会');
    const deadline = page.getByPlaceholder('例: 20271003').first();
    await deadline.fill('２０２７１００３'); await deadline.blur();
    check((await deadline.inputValue()) === '2027年10月3日', 'deadline accepts full-width digits only');
    await page.getByRole('button', { name: 'コピーを作った →' }).click();

    // 2. 最初の設定
    check(await page.getByText('いまここ 2 / 4').isVisible(), 'moves to step 2');
    await page.getByRole('button', { name: '設定の文字をコピー' }).click();
    const pasted = await page.evaluate(() => navigator.clipboard.readText());
    check(JSON.stringify(pasted.split('\n')) === JSON.stringify([eventId, '架空テスト大会', '2027-10-03', 'なし', '任意', '任意', '任意']), 'settings paste is 7 lines for B2');
    check(!/@/.test(pasted), 'settings paste has no email');
    await page.getByRole('button', { name: /「準備できました」と出た/ }).click();

    // 3. 公開してURLを貼る
    check(await page.getByText('いまここ 3 / 4').isVisible(), 'moves to step 3');
    const next3 = page.getByRole('button', { name: 'つながった → 次へ' });
    check(await next3.isDisabled(), 'cannot move on before connecting');
    await page.getByPlaceholder('https://script.google.com/macros/s/…/exec').fill('https://example.com/exec');
    await page.getByRole('button', { name: 'もう一度確かめる' }).isDisabled();
    await page.getByPlaceholder('https://script.google.com/macros/s/…/exec').fill(endpoint);
    await page.getByText('✓ つながりました。次は、テスト申込を1件送ってください。', { exact: true }).waitFor();
    check(!(await next3.isDisabled()), 'auto check enables next without pasting any code');
    for (const [state, text] of [[{ build: '3.0.0' }, 'Googleの版が古いです'], [{ ready: false }, 'まだ最初の設定が終わっていません'], [{ eventId: 'another-cup' }, '別の大会のシートにつながっています']]) {
      pingState = { build: EXPECTED_RECEPTION_BUILD, ready: true, eventId, testComplete: false, accepting: false, ...state };
      await page.getByRole('button', { name: 'もう一度確かめる' }).click();
      await page.getByText(text).waitFor();
      check(await next3.isDisabled(), 'blocked: ' + text);
    }
    // 自動確認が使えないとき（貼って確かめる）
    await page.locator('summary', { hasText: '自動で確かめられないとき' }).click();
    check((await page.getByRole('link', { name: '確かめるページを開く' }).getAttribute('href')) === endpoint + '?action=ping', 'fallback opens only the ping page');
    await page.getByPlaceholder('{"app":"tournament-os", …}').fill('これは違う文字');
    await page.getByText('貼った文字を読めません').waitFor();
    check(await next3.isDisabled(), 'garbage paste does not unlock the next step');
    await page.getByPlaceholder('{"app":"tournament-os", …}').fill(JSON.stringify({ app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, eventId, testComplete: false, accepting: false }));
    await page.getByText('次は、テスト申込を1件送ってください。').first().waitFor();
    check(!(await next3.isDisabled()), 'pasted public status unlocks the next step');
    pingState = { build: EXPECTED_RECEPTION_BUILD, ready: true, eventId, testComplete: false, accepting: false };
    await page.getByRole('button', { name: 'もう一度確かめる' }).click();
    await page.getByText('つながりました。').waitFor();
    await next3.click();

    // 4. テスト → 受付開始
    check(await page.getByText('いまここ 4 / 4').isVisible(), 'moves to step 4');
    check(await page.getByRole('button', { name: '完成：選手へ渡すURLをコピー' }).isDisabled(), 'no public URL before test and opening');
    await page.getByPlaceholder('例: 20271003').first().fill('20271004');
    await page.getByLabel('会場', { exact: true }).fill('架空体育館');
    await page.getByLabel('主催者名').fill('架空主催');
    await page.getByLabel(/問い合わせ先/).fill('0200000000');
    const testLink = await page.getByRole('link', { name: /テスト申込を送る/ }).getAttribute('href');
    check(testLink.startsWith('/apply/#') && testLink.includes('protocol=3') && testLink.includes('mode=test') && !/entryKey/.test(testLink), 'test link is protocol 3 without a key');
    check(publicEntryReady(publicEntryConfig(testLink.slice('/apply/'.length))), 'apply page accepts the test link');
    await page.getByRole('button', { name: '確かめる', exact: true }).click();
    await page.getByText('つながりました。次は、テスト申込を1件送ってください。', { exact: true }).waitFor();
    pingState = { ...pingState, testComplete: true };
    await page.getByRole('button', { name: '確かめる', exact: true }).click();
    await page.getByText('テストできました。次は、シートのメニュー「Tournament OS」→「② 受付を開始」を押してください。', { exact: true }).waitFor();
    check(await page.getByRole('button', { name: '完成：選手へ渡すURLをコピー' }).isDisabled(), 'still no public URL before opening');
    pingState = { ...pingState, accepting: true };
    await page.getByRole('button', { name: '確かめる', exact: true }).click();
    await page.getByText('受付できます。選手に渡すURLをコピーできます。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '完成：選手へ渡すURLをコピー' }).click();
    const live = await page.evaluate(() => navigator.clipboard.readText());
    const liveHash = new URL(live).hash;
    const liveConfig = publicEntryConfig(liveHash);
    check(live.startsWith(base + '/apply/#') && liveConfig.mode === 'live' && liveConfig.protocol === '3' && liveConfig.endpoint === endpoint && publicEntryReady(liveConfig), 'public URL is a ready live link');
    check(!/entryKey|setupKey|TOS2|@/.test(live), 'public URL carries no key or email');

    // 設定ファイル・復元
    await page.locator('summary', { hasText: '別のパソコンで続ける' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '設定を書き出す' }).click()]);
    const file = JSON.parse(await readFile(await download.path(), 'utf8'));
    check(file.kind === 'tournament-os-setup' && file.eventId === eventId && file.endpoint === endpoint, 'setup file has the setup');
    check(!/@|TOS2|key/i.test(JSON.stringify(file)), 'setup file has no email, code or key');
    await page.reload();
    await page.getByText('いまここ 4 / 4').waitFor();
    check((await page.getByLabel('会場', { exact: true }).inputValue()) === '架空体育館', 'state is restored after reload');

    // 通信は、自分の画面・ひな形リンク・ping(GET)だけ
    const outside = network.filter((n) => !n.url.startsWith(base + '/'));
    check(outside.every((n) => n.url === endpoint + '?action=ping' && n.method === 'GET' && !n.body), 'only ping GET leaves the page');
    check(errors.length === 0, 'no page errors: ' + errors.join(' | '));
    await context.close();
    console.log((mobile ? 'Mobile-size' : 'Desktop') + ' v3 setup PASS');
  }
  console.log('v3 browser checks passed:', checks);
} finally { await browser.close(); }
