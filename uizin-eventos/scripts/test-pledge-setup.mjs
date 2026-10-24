/**
 * Browser checks for the 誓約書 (pledge) lines on the chairman's setup screen (/private/setup/):
 * the one-line diagnosis (✓ 済み / ✕ まだ), the link keys (pl・plg・plm・plc・plf・plt before protocol), 「なし」 = nothing about 誓約書 anywhere,
 * the how-to in step 1, a pledge text that cannot be read, a link that is too long, and the 設定の直しもの for a bad pledge row.
 * The ping is what the REAL Apps Script code (run in the test harness) answers; the page gets it unchanged. Every request that leaves 127.0.0.1
 * is aborted and counted, except the ping and the template link, which are answered locally. All sentences are fake (『テスト用の文です1』…).
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 5531 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_TEST_BASE=http://127.0.0.1:5531 TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-pledge-setup.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 */
import assert from 'node:assert/strict';
const { harness } = await import('../tests/helpers/gasV3Harness.ts');
const { publicEntryLinkCut, publicEntryConfig } = await import('../core/publicEntry.ts');
const { PLEDGE_UNCONFIRMED_ADVICE } = await import('../core/setupV3.ts');

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:5531';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('local only');
const EXE = process.env.TOS_CHROME_PATH || '';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });
const SETUP_EP = 'https://script.google.com/macros/s/TOS_PLEDGE_SETUP_SIM/exec';

let checks = 0; const failures = [], externals = [];
let cur = '-';
const check = (value, message) => { checks++; try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); } };
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 120) => String(s).replace(/\s+/g, ' ').slice(0, n);

/* ── 本物の .gs が返す ping ── */
const TAB_HEADINGS = ['誓約書の項目（原本のとおりに、1項目ずつ。1マス＝1項目）', '保護者（連帯責任者）の同意の文', '団体・ジム責任者の同意の文'];
const ITEMS = ['テスト用の文です1', 'テスト用の文です2', 'テスト用の文です3', 'テスト用の文です4', 'テスト用の文です5'];
const realPing = (over = {}, { confirm = true, off = false, mutate } = {}) => {
  const h = harness();
  h.ready(off ? { ...over } : { 誓約書: 'あり', ...over });
  if (!off) { h.book.getSheetByName('誓約書').rows = [[...TAB_HEADINGS], ...ITEMS.map((t, i) => [t, i === 0 ? 'テスト用の文です保護者' : '', i === 0 ? 'テスト用の文ですジム' : ''])]; if (confirm) h.setSetting('誓約書の文の確認', '済み'); }
  if (mutate) mutate(h);
  try { h.call('openEntries'); } catch { /* 設定の直しもののときは、受付を開始できない（そのまま ping を見る） */ }
  return JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
};

let curW = 1280;
const noOverflow = (p) => p.evaluate((W) => document.documentElement.scrollWidth <= W + 1 && document.body.scrollWidth <= W + 1, curW);
const bodyText = (p) => p.evaluate(() => document.body.innerText);
async function open(ping, id, step, mobile) {
  const ctx = await browser.newContext({ viewport: { width: curW, height: 800 }, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url === base + '/template-link.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ copyUrl: 'https://docs.google.com/spreadsheets/d/' + 'P'.repeat(30) + '/copy' }) });
    if (url.startsWith(base + '/')) return route.continue();
    if (/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\?action=ping$/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ping) });
    externals.push({ scenario: cur, url });
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* test setup only */ } }, ['tournament-setup-v3:' + id, JSON.stringify({ step, endpoint: SETUP_EP, ticks: [true, true, true, true], verified: false })]);
  await page.goto(base + '/private/setup/?event=' + id);
  await page.getByText(/いまここ \d \/ 3/).first().waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !document.body.innerText.includes('読み込んでいます…'), null, { timeout: 5000 }).catch(() => undefined);
  await settle(900);
  return { ctx, page, errors };
}
const sizesOk = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].every((e) => parseFloat(getComputedStyle(e).fontSize) >= 17), sel);

for (const [W, mobile] of [[1280, false], [390, true], [320, true]]) {
  curW = W;
  const tag = '-' + W;

  /* S1 step 2：誓約書＝あり・済み */
  cur = 'S1' + tag;
  {
    const ping = realPing();
    const { ctx, page, errors } = await open(ping, 'pl-s1' + tag, 2, mobile);
    const row = await page.locator('#read-pledge').innerText().catch(() => '');
    check(/誓約書/.test(row) && /✓ あり（5項目・保護者の同意：18歳未満のみ・ジム責任者：あり）・会長の確認：済み/.test(row), 'S1 read row says ✓ … 済み (' + short(row) + ')');
    check(await page.locator('#read-pledge dd.text-red-700').count() === 0, 'S1 済み is not red');
    check((await page.locator('[data-tos-next]').count()) === 1, 'S1 exactly ONE yellow marker (' + (await page.locator('[data-tos-next]').count()) + ')');
    check(await sizesOk(page, '#read-pledge dt, #read-pledge dd'), 'S1 row text 17px+');
    check(await noOverflow(page), 'S1 no overflow');
    check(errors.length === 0, 'S1 no page errors ' + errors.join('|'));
    await ctx.close();
  }

  /* S2 step 2：誓約書＝あり・まだ → 赤い✕の行 */
  cur = 'S2' + tag;
  {
    const ping = realPing({}, { confirm: false });
    const { ctx, page } = await open(ping, 'pl-s2' + tag, 2, mobile);
    const row = await page.locator('#read-pledge').innerText().catch(() => '');
    check(/✕ あり（5項目・保護者の同意：18歳未満のみ・ジム責任者：あり）・会長の確認：まだ/.test(row), 'S2 read row says ✕ … まだ (' + short(row) + ')');
    check(await page.locator('#read-pledge dd.text-red-700').count() === 1, 'S2 まだ is red');
    check((await page.locator('[data-tos-next]').count()) === 1, 'S2 exactly ONE yellow marker');
    check(await noOverflow(page), 'S2 no overflow');
    await ctx.close();
  }

  /* S3 step 3：済み → 緑の✓の行。リンクに pl・plg・plm・plc・plf・plt。切れていない */
  cur = 'S3' + tag;
  {
    const ping = realPing({ 階級分け: 'あり' });
    const { ctx, page } = await open(ping, 'pl-s3' + tag, 3, mobile);
    const body = await bodyText(page);
    check(body.includes('誓約書：あり（5項目・保護者の同意：18歳未満のみ・ジム責任者：あり）・会長の確認：済み。'), 'S3 green line (' + short((body.match(/誓約書：あり[^\n]*/) || [''])[0]) + ')');
    check(await page.locator('#pledge-unconfirmed-note').count() === 0, 'S3 no red note');
    const val = await page.locator('input[aria-label="選手に渡すURL"]').inputValue().catch(() => '');
    const hash = val.slice(val.indexOf('#'));
    check(/\/apply\/#/.test(val) && /[#&]pl=on&plg=under18&plm=on&plc=on&plf=[0-9a-f]{64}&plt=u[A-Za-z0-9_-]+&protocol=3&mode=live&end=1$/.test(val), 'S3 link has the six pledge keys before protocol (' + short(val.slice(-90), 100) + ')');
    check(val.includes('plf=' + ping.pledgeHash), 'S3 plf = the ping fingerprint');
    check(!publicEntryLinkCut(hash) && publicEntryConfig(hash).pledge?.items.length === 5 && publicEntryConfig(hash).pledge?.confirmed === true, 'S3 link is not cut and reads back');
    check((await page.locator('[data-tos-next]').count()) === 1, 'S3 exactly ONE yellow marker (' + (await page.locator('[data-tos-next]').count()) + ')');
    check(await noOverflow(page), 'S3 no overflow');
    await ctx.close();
  }

  /* S4 step 3：まだ → 赤い✕＋ADVICE。URLは出る。コピーのボタンは押せる。plc=off */
  cur = 'S4' + tag;
  {
    const ping = realPing({}, { confirm: false });
    const { ctx, page } = await open(ping, 'pl-s4' + tag, 3, mobile);
    const note = await page.locator('#pledge-unconfirmed-note').innerText().catch(() => '');
    check(note.includes('誓約書：あり（5項目・保護者の同意：18歳未満のみ・ジム責任者：あり）・会長の確認：まだ。') && note.includes(PLEDGE_UNCONFIRMED_ADVICE), 'S4 red note with advice (' + short(note, 140) + ')');
    check(note.startsWith('✕') || /✕/.test(note), 'S4 the red line has a ✕ (not colour only)');
    const color = await page.locator('#pledge-unconfirmed-note').evaluate((e) => getComputedStyle(e).color);
    check(/rgb\(/.test(color), 'S4 colour computed ' + color);
    check(await sizesOk(page, '#pledge-unconfirmed-note'), 'S4 note text 17px+');
    const val = await page.locator('input[aria-label="選手に渡すURL"]').inputValue().catch(() => '');
    check(/[#&]plc=off&/.test(val) && /mode=live&end=1$/.test(val), 'S4 link exists with plc=off (URL is shown; the page and Google stop it)');
    const copyBtn = page.getByRole('button', { name: /完成：選手へ渡すURLをコピー/ });
    check((await copyBtn.getAttribute('aria-disabled')) !== 'true', 'S4 copy button is not disabled (the stop is in the apply page and the server)');
    check((await page.locator('[data-tos-next]').count()) === 1, 'S4 exactly ONE yellow marker (' + (await page.locator('[data-tos-next]').count()) + ')');
    check(await noOverflow(page), 'S4 no overflow');
    await ctx.close();
  }

  /* S5 なし：誓約書の行も文も、どこにも出ない（step 2・3）。リンクに pl の鍵が無い */
  cur = 'S5' + tag;
  for (const step of [2, 3]) {
    const ping = realPing({ 階級分け: 'あり' }, { off: true });
    const { ctx, page } = await open(ping, 'pl-s5' + step + tag, step, mobile);
    const body = await bodyText(page);
    check(!/誓約書/.test(body), 'S5 step ' + step + ': nothing about 誓約書 (' + short((body.match(/.{0,15}誓約書.{0,15}/) || [''])[0]) + ')');
    check(await page.locator('#read-pledge, #pledge-unconfirmed-note').count() === 0, 'S5 step ' + step + ': no pledge elements');
    if (step === 3) {
      const val = await page.locator('input[aria-label="選手に渡すURL"]').inputValue().catch(() => '');
      check(/\/apply\/#/.test(val) && !/[#&]pl[a-z]?=/.test(val), 'S5 link has no pl keys');
    }
    await ctx.close();
  }

  /* S6 step 1：作業2の説明と絵の4行＋花道のルール。横にはみ出さない。書く行は6つのまま */
  cur = 'S6' + tag;
  {
    const { ctx, page } = await open(realPing({}, { off: true }), 'pl-s6' + tag, 1, mobile);
    await page.getByRole('button', { name: /やり方を先に読む|やり方をもう一度読む/ }).first().waitFor({ timeout: 3000 }).catch(() => undefined);
    // 作業2のカードを開く
    const opened = await page.evaluate(() => { const d = [...document.querySelectorAll('details')]; d.forEach((x) => { x.open = true; }); return d.length; });
    await settle(300);
    const body = await bodyText(page);
    check(await page.locator('#pledge-howto').count() === 1, 'S6 pledge-howto exists (details ' + opened + ')');
    const how = await page.locator('#pledge-howto').innerText().catch(() => '');
    check(/A列が「誓約書」の行のB列/.test(how) && /原本から写した文字/.test(how) && /「誓約書の文の確認」を「済み」/.test(how), 'S6 howto text (' + short(how, 100) + ')');
    for (const row of ['誓約書', '保護者の同意', 'ジム責任者の同意', '誓約書の文の確認', '花道のルール']) check(body.includes(row), 'S6 picture row ' + row);
    check(await sizesOk(page, '#pledge-howto'), 'S6 howto 17px+');
    check(await noOverflow(page), 'S6 no overflow');
    await ctx.close();
  }

  /* S7 文が読めない（pledgeMode だけ来て、指紋が壊れている）→ 赤い直しもの1文。URLなし */
  cur = 'S7' + tag;
  {
    const ping = { ...realPing(), pledgeHash: 'abc' };
    const { ctx, page } = await open(ping, 'pl-s7' + tag, 2, mobile);
    const body = await bodyText(page);
    check(/誓約書が「あり」ですが、「誓約書」タブの文を読めませんでした/.test(body), 'S7 red fix sentence (' + short((body.match(/誓約書が「あり」[^\n]*/) || [''])[0], 120) + ')');
    check(await page.locator('#read-pledge').count() === 0, 'S7 no ✓ row while there is a fix');
    check(await noOverflow(page), 'S7 no overflow');
    check((await page.locator('[data-tos-next]').count()) === 1, 'S7 exactly ONE yellow marker (' + (await page.locator('[data-tos-next]').count()) + ')');
    await ctx.close();
  }

  /* S8 長すぎ：文＝上限いっぱい＋ほかの欄も長い → 赤い1文「誓約書の文が長すぎ…」。URLは出ない */
  cur = 'S8' + tag;
  {
    const items = Array.from({ length: 8 }, (_, i) => String(i) + 'あ'.repeat(77));
    const base0 = realPing();
    const ping = { ...base0, title: 'あ'.repeat(150), venue: 'い'.repeat(150), organizer: 'う'.repeat(150), contact: 'え'.repeat(150), pledgeCanon: JSON.stringify({ items, guardian: 'い'.repeat(38), gym: 'う'.repeat(38) }) };
    const { ctx, page } = await open(ping, 'pl-s8' + tag, 3, mobile);
    const body = await bodyText(page);
    check(body.includes('誓約書の文が長すぎて、選手に渡すURLに入りません。'), 'S8 red sentence (' + short((body.match(/.{0,10}長すぎて[^\n]*/) || [''])[0], 120) + ')');
    check(await page.locator('input[aria-label="選手に渡すURL"]').count() === 0, 'S8 no URL box');
    check(await page.locator('#read-pledge, #pledge-unconfirmed-note').count() === 0, 'S8 no pledge ok/ng line while the link is too long');
    check(await noOverflow(page), 'S8 no overflow');
    await ctx.close();
  }

  /* S9 本物の .gs の「設定の直しもの」：誓約書＝たぶん → 場所つきの1文 */
  cur = 'S9' + tag;
  {
    const ping = realPing({}, { mutate: (h) => h.setSetting('誓約書の文の確認', 'ほぼ') });
    const { ctx, page } = await open(ping, 'pl-s9' + tag, 2, mobile);
    const body = await bodyText(page);
    check(/「誓約書の文の確認」は、まだ／済みのどれかにしてください/.test(body) && /A列が「誓約書の文の確認」の行のB列。▼から選び直す/.test(body), 'S9 fix sentence with the place (' + short((body.match(/「誓約書の文の確認」は[^\n]*/) || [''])[0], 140) + ')');
    check(!/B3\d\b/.test(body.replace(/B3\b/g, '')), 'S9 no cell number said for a pledge row');
    check(await noOverflow(page), 'S9 no overflow');
    await ctx.close();
  }
}

await browser.close();
console.log('checks:', checks, 'failures:', failures.length, 'externals:', externals.length);
if (failures.length) { console.log(failures.join('\n')); }
if (externals.length) console.log(JSON.stringify(externals.slice(0, 5)));
process.exit(failures.length || externals.length ? 1 : 0);
