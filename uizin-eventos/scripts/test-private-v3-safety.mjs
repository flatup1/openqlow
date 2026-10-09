/**
 * Local-only browser checks for the safety rules of /private/ (v3): nothing is silently overwritten,
 * a failed save is never shown as success, double presses do nothing twice.
 * Fake names and fake passwords only. Every request that is not the local preview is aborted.
 * Run after a build, against a local static server, e.g. TOS_TEST_BASE=http://127.0.0.1:4421 node scripts/test-private-v3-safety.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4421';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const browser = await chromium.launch({ headless: true, channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' });
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const PASSWORD = 'fictional-test-password';
const csv = '管理番号,ジム名,選手名,身長,体重,戦績\nF01,架空赤ジム,架空赤選手,170,60,初試合\nF02,架空青ジム,架空青選手,171,61,1戦';

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const network = [];
  await context.route('**/*', (route) => {
    network.push(route.request().url());
    return route.request().url().startsWith(base + '/') ? route.continue() : route.abort();
  });
  const errors = [];
  context.on('page', (p) => p.on('pageerror', (error) => errors.push(error.message)));
  const page = await context.newPage();
  const stateLine = () => page.locator('#save-state');
  const status = (text) => page.getByRole('status').filter({ hasText: text });
  // 最初の保存でコピーの欄は自動で開く。開いているときに押すと閉じてしまうので、閉じているときだけ押す
  const openBackup = async () => { if (!(await page.locator('#backup').evaluate((el) => el.open))) await page.locator('#backup > summary').click(); };
  const pickCsv = () => page.locator('input[accept^=".zip"]').setInputFiles({ name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  await page.goto(base + '/private/?event=safety-a');
  await stateLine().waitFor();
  check((await stateLine().innerText()).includes('未保存（まだ一度も保存していません）'), 'A fresh event says it was never saved');

  /* ───── 名簿の再読み込みは、手で直した所を黙って変えない ───── */
  await pickCsv();
  await status('2人分を読み込みました').waitFor();
  check(await page.locator('article img').count() === 0 && (await page.locator('#fighter-F01').innerText()).includes('60kg'), 'First import fills the roster');
  await page.getByRole('button', { name: '直す 架空赤選手', exact: true }).click();
  await page.locator('#edit-F01-weight').fill('65');
  await page.locator('#fighter-F01').getByRole('button', { name: 'この内容で直す', exact: true }).click();
  check((await page.locator('#fighter-F01').innerText()).includes('65kg'), 'Hand-edited weight is shown');
  await pickCsv();
  await status('内容がちがう人が1人います').waitFor();
  check((await page.locator('#fighter-F01').innerText()).includes('65kg'), 'Re-import keeps the hand-edited weight');
  const overwrite = page.getByRole('button', { name: 'ファイルの内容で1人を書きかえる', exact: true });
  check(await overwrite.isVisible(), 'The overwrite button is offered, not applied');
  // 確認は、画面の中の箱。ブラウザの確認画面は出ない
  const nativeDialogs = [];
  page.on('dialog', (dialog) => { if (dialog.type() !== 'beforeunload') nativeDialogs.push(dialog.message()); dialog.dismiss(); });
  const box = page.getByRole('alertdialog');
  await overwrite.click();
  await box.waitFor();
  check(await page.evaluate(() => { const b = document.querySelector('#confirm-overwrite'), t = document.querySelector('#overwrite-trigger'); if (!b || !t) return false; const rb = b.getBoundingClientRect(), rt = t.getBoundingClientRect(); return b.parentElement === t.closest('[role=status]').parentElement && rb.top >= rt.bottom - 1 && rb.top - rt.bottom < 300; }), 'The overwrite box appears next to the button that was pressed');
  check(await page.evaluate(() => document.activeElement?.textContent === 'やめる（何も変えない）' && !!document.activeElement.closest('[role=alertdialog]')), 'Focus moves into the box, onto the safe button');
  check((await box.innerText()).split('\n')[0].includes('次の1人を、ファイルの内容に書きかえます'), 'The first line is the verdict with the count');
  check((await page.locator('#fighter-F01').innerText()).includes('65kg'), 'Opening the box changes nothing yet');
  await page.keyboard.press('Escape');
  await status('やめました。何も変えていません。').waitFor();
  check(await box.count() === 0 && (await page.locator('#fighter-F01').innerText()).includes('65kg'), 'Escape cancels the overwrite and changes nothing');
  await overwrite.click();
  await box.waitFor();
  await box.getByRole('button', { name: 'やめる（何も変えない）', exact: true }).click();
  await status('やめました。何も変えていません。').waitFor();
  check(await box.count() === 0 && (await page.locator('#fighter-F01').innerText()).includes('65kg'), 'Cancelling the overwrite changes nothing');
  check(await overwrite.isVisible(), 'After cancelling, the overwrite button is still offered');
  await overwrite.click();
  await box.waitFor();
  const overwriteText = await box.innerText();
  check(overwriteText.includes('赤') || overwriteText.includes('架空赤選手'), 'The confirmation names who changes: ' + overwriteText);
  check(overwriteText.includes('体重 65→60'), 'The confirmation shows what changes');
  await box.getByRole('button', { name: /^ファイルの内容で書きかえる/ }).click();
  await page.locator('#fighter-F01').getByText('60kg').waitFor();
  check(await box.count() === 0, 'The box closes after the unsafe button');
  check(nativeDialogs.length === 0, 'No native browser dialog was used: ' + nativeDialogs.join(' / '));

  /* ───── 途中保存 → 保存失敗は状態ラインに残る → もう一度保存 ───── */
  await page.getByLabel('大会名', { exact: true }).fill('安全テスト大会');
  check((await stateLine().innerText()).includes('未保存（入れた内容は、まだ保存していません）'), 'Editing shows unsaved');
  await page.evaluate(() => { window.__tosTx = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function (...args) { if (args[1] === 'readwrite') throw new Error('SIMULATED_DISK_FULL'); return window.__tosTx.apply(this, args); }; });
  await page.getByRole('button', { name: '保存する', exact: true }).click();
  await status('保存できませんでした').waitFor();
  check((await stateLine().innerText()).includes('保存失敗'), 'A failed save is shown on the state line');
  check(!(await page.getByRole('status').allInnerTexts()).some((t) => t.includes('保存しました')), 'A failed save never shows the success sign');
  await page.locator('.fixed').getByRole('button', { name: '✕ とじる' }).click();
  check((await stateLine().innerText()).includes('保存失敗'), 'Closing the message keeps the failure on the state line');
  await page.getByLabel('大会名', { exact: true }).fill('安全テスト大会2');
  check((await stateLine().innerText()).includes('保存失敗'), 'Editing does not turn a failure back into a plain unsaved');
  check(await page.getByLabel('大会名', { exact: true }).inputValue() === '安全テスト大会2', 'The typed input stays after a failure');
  await page.evaluate(() => { IDBDatabase.prototype.transaction = window.__tosTx; });
  await page.locator('.fixed').getByRole('button', { name: 'もう一度 保存する', exact: true }).click();
  await status('保存しました').waitFor();
  check((await stateLine().innerText()).includes('保存済み'), 'A successful save shows saved');
  await page.getByLabel('大会名', { exact: true }).fill('安全テスト大会3');
  await page.waitForFunction(() => ![...document.querySelectorAll('[role=status]')].some((e) => e.textContent.includes('保存しました')));
  check((await stateLine().innerText()).includes('未保存'), 'Editing removes the old success message and shows unsaved');
  await page.getByRole('button', { name: '保存する', exact: true }).click();
  await stateLine().getByText('保存済み').waitFor();

  /* ───── コピーのファイル: 作る / 戻す ───── */
  await openBackup();
  await page.locator('#backup-password').fill(PASSWORD);
  const makeCopy = page.getByRole('button', { name: 'パスワードをつけて、コピーを保存する', exact: true });
  // 2つ目の欄は「なくてもOK」: 空なら、そのまま作れる。入っていて、1つ目とちがうときだけ止まる
  check(await makeCopy.getAttribute('aria-disabled') !== 'true', 'The copy button is usable while the second password is empty');
  await page.locator('#backup-password2').fill(PASSWORD + 'x');
  check(await makeCopy.getAttribute('aria-disabled') === 'true', 'A mistyped second password blocks the copy');
  let downloaded = false;
  page.once('download', () => { downloaded = true; });
  await makeCopy.click({ force: true }); // aria-disabled の印つき。押しても何も起きないことを確かめる
  await page.waitForTimeout(600);
  check(!downloaded, 'A mistyped second password creates no file');
  await page.locator('#backup-password2').fill('');
  const download = page.waitForEvent('download');
  await makeCopy.click();
  const file = await download;
  check(/^safety-a-nodate\.tournament\.enc$/.test(file.suggestedFilename()), 'The file name has the event number and nodate: ' + file.suggestedFilename());
  const encrypted = await readFile(await file.path());
  check(!encrypted.toString().includes('架空赤選手'), 'The copy is ciphertext');
  await status('ファイルを保存しました').waitFor();

  // 別の大会の画面には戻さない
  await page.goto(base + '/private/?event=safety-b');
  await stateLine().waitFor();
  await openBackup();
  await page.locator('input[accept=".enc"]').setInputFiles({ name: 'x.enc', mimeType: 'application/octet-stream', buffer: encrypted });
  await status('先に、パスワードを入れてください。').waitFor();
  check(true, 'Restoring with an empty password asks for the password first');
  await page.locator('#backup-password').fill(PASSWORD);
  await page.locator('input[accept=".enc"]').setInputFiles({ name: 'x.enc', mimeType: 'application/octet-stream', buffer: encrypted });
  await status('いまの画面は別の大会なので、何も変えていません').waitFor();
  check(await page.getByLabel('大会名', { exact: true }).inputValue() === '', 'A copy of another event does not overwrite this event');
  await page.getByRole('button', { name: 'この大会として開く', exact: true }).click();
  await page.waitForURL(/event=safety-a/);
  await stateLine().waitFor();

  // 取り消したら、何も変わらない
  await page.getByLabel('大会名', { exact: true }).fill('取り消しテスト');
  await openBackup();
  await page.locator('#backup-password').fill(PASSWORD);
  await page.locator('input[accept=".enc"]').setInputFiles({ name: 'x.enc', mimeType: 'application/octet-stream', buffer: encrypted });
  await box.waitFor();
  check(await page.getByLabel('大会名', { exact: true }).inputValue() === '取り消しテスト', 'The restore box alone keeps what was typed');
  await box.getByRole('button', { name: 'やめる（何も変えない）', exact: true }).click();
  await status('やめました。何も変えていません。').waitFor();
  check(await box.count() === 0 && await page.getByLabel('大会名', { exact: true }).inputValue() === '取り消しテスト', 'Cancelling a restore keeps what was typed');
  check(await page.evaluate(() => document.activeElement?.id) === 'restore-file', 'After cancelling, focus returns to the restore button');

  /* ───── 二度押しで、画面がいくつも開かない ───── */
  await page.getByRole('button', { name: '＋ 試合を追加', exact: true }).click();
  const card = page.locator('article').filter({ hasText: '第1試合' });
  await card.getByLabel('赤コーナーの選手', { exact: true }).selectOption('F01');
  await card.getByLabel('青コーナーの選手', { exact: true }).selectOption('F02');
  const openLive = page.locator('#sec-4').getByRole('button', { name: '試合当日の画面を開く', exact: true });

  /* ───── 保存の最中にもう一度押しても、2回書かず、失敗にもならない ───── */
  await page.getByLabel('大会名', { exact: true }).fill('二度押しの大会');
  await page.evaluate(() => {
    window.__puts = 0;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { window.__puts++; return put.apply(this, args); };
    const open = indexedDB.open.bind(indexedDB);
    // 保存を少し遅くして、保存の最中に2回目を押せるようにする
    indexedDB.open = function (...args) {
      const fake = {};
      setTimeout(() => {
        const real = open(...args);
        real.onupgradeneeded = (e) => { fake.result = real.result; fake.onupgradeneeded && fake.onupgradeneeded(e); };
        real.onsuccess = (e) => { fake.result = real.result; fake.onsuccess && fake.onsuccess(e); };
        real.onerror = (e) => { fake.error = real.error; fake.onerror && fake.onerror(e); };
      }, 900);
      return fake;
    };
  });
  const pagesBeforeSave = context.pages().length;
  await page.locator('#sec-4').getByRole('button', { name: 'ここまでを保存する', exact: true }).click();
  await page.locator('#save-state').getByText('保存中').waitFor();
  // force: 「保存中」のボタンは aria-disabled。本当に保存の最中に押された場合（二度押し）と同じにするため、押せる状態になるのを待たない
  await page.locator('#sec-4').getByRole('button', { name: 'ここまでを保存する', exact: true }).click({ force: true });
  await openLive.click({ force: true }); // 保存の最中の「開く」も、同じ保存の結果を待つ
  await stateLine().getByText('保存済み').waitFor({ timeout: 6000 });
  await page.waitForTimeout(600);
  check(await page.evaluate(() => window.__puts) === 1, 'Pressing save twice while saving writes once (writes: ' + await page.evaluate(() => window.__puts) + ')');
  check(!(await stateLine().innerText()).includes('保存失敗') && !(await page.getByRole('status').allInnerTexts()).some((t) => t.includes('保存できませんでした') || t.includes('保存しませんでした')), 'The second press during a save raises no failure message');
  check(context.pages().length === pagesBeforeSave + 1, 'Open pressed during a save waits for that save and then opens the match-day screen');
  await page.evaluate(() => { delete indexedDB.open; });
  await page.waitForTimeout(2200);

  const before = context.pages().length;
  await openLive.dblclick();
  await page.waitForTimeout(1500);
  check(context.pages().length === before + 1, 'Double-clicking "open" opens exactly one new window');

  /* ───── 続きから: 保存してある大会が出る ───── */
  await page.goto(base + '/private/');
  await page.getByRole('link', { name: /続きから：/ }).first().waitFor();
  check(true, 'Arriving without an event number lists the saved events');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow at 1280px');

  check(!errors.length, 'No browser runtime exceptions: ' + errors.join(', '));
  check(network.every((url) => url.startsWith(base + '/')), 'No request leaves the local preview');
  await context.close();

  /* ───── 390px: 横スクロールなし ───── */
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.route('**/*', (route) => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
  const small = await phone.newPage();
  await small.goto(base + '/private/?event=safety-phone');
  await small.locator('#save-state').waitFor();
  check(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow at 390px');
  check((await small.getByText('次にやる：').first().innerText()).includes('次にやる：'), 'The next step is spelled out at 390px');
  await phone.close();
  console.log('Private v3 safety checks passed: ' + checks + '. Local only, fake data.');
} finally { await browser.close(); }
