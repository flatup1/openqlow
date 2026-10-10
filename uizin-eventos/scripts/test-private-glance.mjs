/**
 * Local-only browser checks for "understandable at a glance" fixes on /private/ and /private/setup/.
 * Fake names and fake passwords only. Every request that is not the local preview is aborted
 * (the simulated Google ping on the setup page is answered locally).
 * Run after a build, e.g. TOS_TEST_BASE=http://127.0.0.1:4455 node scripts/test-private-glance.mjs
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4421';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const browser = await chromium.launch({ headless: true, channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' });
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const PASSWORD = 'fictional-test-password';
const head = '管理番号,ジム名,選手名,身長,体重,戦績\n';
// 管理番号が空の名簿（番号は行の順番で決まる）
const rows = (list) => head + list.map(([name, gym]) => `,${gym},${name},170,60,初試合`).join('\n');
const csvA = rows([['架空ア', '架空ジムA'], ['架空イ', '架空ジムB'], ['架空ウ', '架空ジムC']]);
const csvShifted = rows([['架空ゼ', '架空ジムZ'], ['架空ア', '架空ジムA'], ['架空イ', '架空ジムB'], ['架空ウ', '架空ジムC']]);
const csvTwo = '管理番号,ジム名,選手名,身長,体重,戦績\nF01,架空赤ジム,架空赤選手,170,60,初試合\nF02,架空青ジム,架空青選手,171,61,1戦';

try {
  for (const mobile of [false, true]) {
    const tag = mobile ? '390px' : '1280px';
    const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
    const network = [], errors = [];
    await ctx.route('**/*', (route) => { const url = route.request().url(); network.push(url); return url.startsWith(base + '/') ? route.continue() : route.abort(); });
    ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
    const id = 'glance-' + (mobile ? 'sp' : 'pc');
    const page = await ctx.newPage();
    const pick = (name, text) => page.locator('#pick-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
    const status = (text) => page.getByRole('status').filter({ hasText: text });
    const barButton = () => page.locator('div.fixed.bottom-0 .flex.items-stretch > button').first();
    await page.goto(base + '/private/?event=' + id);
    await page.locator('#save-state').waitFor();

    /* 1. 開催日は「なくてもOK」: 必須の札と、空でも開ける、が両方出ない */
    const dateRow = page.locator('#field-date').locator('xpath=ancestor::div[contains(@class,"min-w-0")][1]');
    const dateText = await dateRow.innerText();
    check(!dateText.includes('必須') && dateText.includes('なくてもOK'), tag + ': the event date is marked optional, not 必須');
    await page.getByLabel('大会名', { exact: true }).fill('架空大会');
    await pick('a.csv', csvTwo);
    await status('2人分を読み込みました').waitFor();
    await page.getByRole('button', { name: '＋ 試合を追加', exact: true }).click();
    await page.locator('#bout-0-red').selectOption('F01'); // 青は空のまま（途中）
    const label = await barButton().innerText();
    check(!label.includes('日にち') && !label.includes('つぎは'), tag + ': the big button never sends the user to the date first (' + label + ')');
    await page.getByRole('button', { name: '保存する', exact: true }).first().click();
    await page.locator('#save-state').getByText('保存済み').waitFor();
    const stateA = await page.locator('#save-state').innerText();
    check(stateA.includes('保存済み') && !stateA.includes('保存失敗') && !stateA.includes('未保存') && (await page.locator('#field-date').inputValue()) === '' && await page.locator('#bout-0-red').inputValue() === 'F01', tag + ': saving works with an empty date and a half-finished bout (' + stateA.trim().slice(0, 30) + ')');

    /* 2. 帯のボタンの文字が、途中で折れない（1行） */
    await page.getByLabel('大会名', { exact: true }).fill('架空大会2');
    const oneLine = await barButton().evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; });
    check(oneLine === 1, tag + ': the main button label stays on one line (' + oneLine + ' lines)');

    /* 3. コピーのファイルの入口は、データがあってもいつも見える */
    const jump = page.getByRole('button', { name: '別のパソコンへ移す／こわれたときのコピー' });
    check(await jump.isVisible(), tag + ': the backup / move button is visible even with data');
    check(!(await page.locator('main').innerText()).includes('2つ目の欄は使いません'), tag + ': no "second box is not used" explanation');
    await jump.click();
    check(await page.evaluate(() => document.activeElement?.id) === 'backup-password' && await page.locator('#backup').evaluate((d) => d.open), tag + ': it opens the fold and focuses the password');

    /* 4. 保存失敗: 知らせは1つ、出口と閉じるが見える、帯は画面の約4分の1 */
    await page.evaluate(() => { const o = IDBDatabase.prototype.transaction; window.__o = o; IDBDatabase.prototype.transaction = function (s, m, ...r) { if (m === 'readwrite') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return o.call(this, s, m, ...r); }; });
    await page.getByLabel('大会名', { exact: true }).fill('架空大会3');
    await page.locator('div.fixed.bottom-0').getByRole('button', { name: '保存する', exact: true }).click();
    await page.locator('#save-state').getByText('保存失敗').waitFor();
    await page.waitForTimeout(1700);
    await barButton().click();
    await page.waitForTimeout(600);
    const bar = await page.evaluate(() => { const b = document.querySelector('div.fixed.bottom-0'); return { h: b.offsetHeight, vh: innerHeight, sc: getComputedStyle(b.querySelector('[role=status]')).overflowY }; });
    check(bar.h / bar.vh <= (mobile ? 0.28 : 0.28), tag + ': the failure bar takes about a quarter of the screen (' + Math.round(bar.h / bar.vh * 100) + '%)');
    check(bar.sc !== 'auto' && bar.sc !== 'scroll', tag + ': the failure notice has no inner scroll box');
    for (const name of ['コピーのファイルを作る', '✕ とじる', 'もう一度 保存する']) {
      const box = await page.locator('div.fixed.bottom-0').getByRole('button', { name, exact: true }).boundingBox();
      check(!!box && box.y >= 0 && box.y + box.height <= bar.vh + 1 && box.height >= 47, tag + ': "' + name + '" is fully visible and at least 48px tall');
    }
    check((await page.locator('main').innerText()).split('保存できませんでした').length - 1 + (await page.locator('main').innerText()).split('また失敗しました').length - 1 === 1, tag + ': the failure is said once');
    await page.evaluate(() => { IDBDatabase.prototype.transaction = window.__o; });
    await page.waitForTimeout(1700);
    await barButton().click();
    await page.locator('#save-state').getByText('保存済み').waitFor();

    /* 5. 追加前の入力・直している途中の入力は、未保存として守る */
    await page.locator('summary', { hasText: 'ほかの入れ方' }).click();
    await page.locator('summary', { hasText: '1人ずつ入れる' }).click();
    await page.locator('#manual-name').fill('架空途中');
    check((await page.title()).startsWith('●') && (await page.locator('#save-state').innerText()).includes('未保存'), tag + ': a half-typed fighter shows the dot and 未保存');
    check(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }), tag + ': closing the tab with a half-typed fighter is guarded');
    await page.locator('#manual-name').fill('');
    check(!(await page.title()).startsWith('●'), tag + ': nothing typed, no dot');
    await page.getByRole('button', { name: '直す 架空赤選手', exact: true }).click();
    await page.locator('#edit-F01-weight').fill('99');
    check(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }), tag + ': an open edit draft is guarded');
    await page.getByRole('button', { name: '直す 架空青選手', exact: true }).click({ force: true });
    check(await page.locator('#edit-F01-weight').inputValue() === '99' && await page.getByRole('button', { name: '直す 架空青選手', exact: true }).getAttribute('aria-disabled') === 'true', tag + ': another 直す button does not throw the typed edit away');
    await page.locator('#fighter-F01').getByRole('button', { name: 'やめる', exact: true }).click();
    await page.getByRole('button', { name: '直した内容を消す', exact: true }).click(); // 直した所があるので、確認の箱が出る

    /* 6. 管理番号が空で、行がずれた名簿: 二重にしない */
    const page2 = await ctx.newPage();
    await page2.goto(base + '/private/?event=' + id + '-dup');
    await page2.locator('#save-state').waitFor();
    const pick2 = (text) => page2.locator('#pick-file').setInputFiles({ name: 'b.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
    await pick2(csvA);
    await page2.getByRole('status').filter({ hasText: '3人分を読み込みました' }).waitFor();
    await pick2(csvShifted);
    await page2.getByRole('status').filter({ hasText: '同じ名前の人が3人 重なっています' }).waitFor();
    const note = await page2.locator('#sec-2').innerText();
    check(!note.includes('前からいた人は、そのままです') && note.includes('足していません'), tag + ': the shifted roster is not reported as "unchanged"');
    check((await page2.locator('#sec-2 article[id^="fighter-"]').count()) === 4, tag + ': the roster did not double (4 people)');
    await page2.getByRole('button', { name: '別の人なら、足す', exact: true }).click();
    check((await page2.locator('#sec-2 article[id^="fighter-"]').count()) === 7, tag + ': the button adds them only when pressed');
    await page2.close();

    /* 7. 戻したあとに新しく打ったら、「元にもどす」は消える */
    await page.locator('#backup-password').fill(PASSWORD);
    await page.locator('#paper-done').check(); // 「紙に書きました」: パスワードを変えると外れる
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'パスワードをつけて、コピーを保存する', exact: true }).click();
    const file = await (await download).createReadStream();
    const chunks = []; for await (const c of file) chunks.push(c);
    const encrypted = Buffer.concat(chunks);
    check((await page.getByText('ファイルを保存しました').count()) > 0, tag + ': a copy file can be made with the second password box left empty');
    // 確認は画面の中の箱。まず「やめる」で何も変わらないこと、次に「今の内容を消して、コピーに戻す」で戻ること
    const nativeDialogs = [];
    page.on('dialog', (d) => { if (d.type() !== 'beforeunload') nativeDialogs.push(d.message()); d.dismiss().catch(() => {}); });
    const restoreBox = page.getByRole('alertdialog');
    await page.locator('input[accept=".enc"]').setInputFiles({ name: 'x.enc', mimeType: 'application/octet-stream', buffer: encrypted });
    await restoreBox.waitFor();
    check(await page.evaluate(() => document.activeElement?.textContent === 'やめる（何も変えない）' && !!document.activeElement.closest('[role=alertdialog]')), tag + ': the restore box takes focus on the safe button');
    await restoreBox.getByRole('button', { name: 'やめる（何も変えない）', exact: true }).click();
    check(await restoreBox.count() === 0 && await status('戻しました').count() === 0, tag + ': cancelling the restore changes nothing');
    await page.locator('input[accept=".enc"]').setInputFiles({ name: 'x.enc', mimeType: 'application/octet-stream', buffer: encrypted });
    await restoreBox.waitFor();
    await restoreBox.getByRole('button', { name: '今の内容を消して、コピーに戻す', exact: true }).click();
    await status('戻しました').waitFor();
    check(nativeDialogs.length === 0, tag + ': no native browser dialog was used');
    const undoButton = page.getByRole('button', { name: /元にもどす/ });
    check(await undoButton.count() === 1, tag + ': undo is offered right after a restore');
    await page.getByLabel('大会名', { exact: true }).fill('戻したあとに打った文字');
    check(await undoButton.count() === 0, tag + ': undo disappears as soon as new text is typed');

    /* 8. スマホ: キーボードが出ている間も、小さな「保存」を1回押せば保存される */
    if (mobile) {
      await page.evaluate(() => { const vv = window.visualViewport; Object.defineProperty(vv, 'height', { configurable: true, get: () => 400 }); vv.dispatchEvent(new Event('resize')); });
      await page.locator('#field-venue').focus();
      await page.getByLabel('会場', { exact: true }).fill('架空体育館');
      const small = page.locator('div.fixed.bottom-0').getByRole('button', { name: '保存', exact: true });
      await small.waitFor();
      const box = await small.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); await page.mouse.up();
      await page.locator('#save-state').getByText('保存済み').waitFor({ timeout: 4000 });
      const stateB = await page.locator('#save-state').innerText();
      check(stateB.includes('保存済み') && !stateB.includes('未保存') && !stateB.includes('保存失敗') && (await page.locator('#field-venue').inputValue()) === '架空体育館', tag + ': one press of the small 保存 button saves while the keyboard is up (' + stateB.trim().slice(0, 30) + ')');
      // スクロールの余白は、上にくっつくナビより大きい
      const pad = await page.evaluate(() => ({ nav: document.querySelector('nav[aria-label="4つの手順"]').offsetHeight, pad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) }));
      check(pad.pad >= pad.nav + 8, tag + ': scroll padding (' + pad.pad + 'px) is taller than the sticky nav (' + pad.nav + 'px)');
    }

    /* 9. 申し込みページの「できています」は、確かめたときだけ */
    const fresh = await ctx.newPage();
    const key = 'tournament-setup-v3:' + id + '-g';
    await fresh.goto(base + '/private/?event=' + id + '-g');
    await fresh.locator('#save-state').waitFor();
    await fresh.evaluate((k) => localStorage.setItem(k, JSON.stringify({ step: 1, endpoint: 'https://script.google.com/macros/s/TYPO-NOT-A-REAL-ONE/dev', ticks: [false, false, false, false] })), key);
    await fresh.reload(); await fresh.locator('#save-state').waitFor();
    const typo = await fresh.locator('section[aria-label="この大会の申し込みページ"]').innerText();
    check(!typo.includes('できています') && !typo.includes('確かめてあります'), tag + ': an unverified URL is not shown as done (' + typo.slice(0, 40) + ')');
    await fresh.evaluate((k) => localStorage.setItem(k, JSON.stringify({ step: 3, endpoint: 'https://script.google.com/macros/s/OK/exec', ticks: [true, true, true, true], verified: true })), key);
    await fresh.reload(); await fresh.locator('#save-state').waitFor();
    check((await fresh.locator('section[aria-label="この大会の申し込みページ"]').innerText()).includes('✓ 申し込みページ：つながりを確かめてあります'), tag + ': a verified connection is shown as done');
    await fresh.close();

    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tag + ': no horizontal overflow');
    check(!errors.length, tag + ': no runtime exceptions ' + errors.join(' | '));
    check(network.every((url) => url.startsWith(base + '/')), tag + ': nothing leaves the local preview');

    /* 10. 受付づくりの画面: 進み具合の帯は1つ。失敗の箱は1つ */
    const endpoint = 'https://script.google.com/macros/s/GLANCE_SIM/exec';
    const setup = await ctx.newPage();
    await setup.goto(base + '/private/setup/?event=' + id + '-s');
    await setup.getByText('いまここ 1 / 3').first().waitFor();
    check(await setup.locator('ol[aria-label="全体の流れ"]').count() === 0, tag + ': setup has no second progress list');
    const stripText = await setup.locator('nav[aria-label="3つの手順"]').innerText();
    check(['準備', 'つなぐ', '渡す'].every((w) => stripText.includes(w)) && stripText.includes('いまここ') && stripText.includes('まだ'), tag + ': the one strip names every step with a word (' + stripText.replace(/\s+/g, ' ') + ')');
    check(((await setup.locator('main').innerText()).match(/目印がつくだけです/g) || []).length <= 1, tag + ': the "only a mark" line is said once, not per card');
    const advance = setup.getByRole('button', { name: /✓がなくても進む/ });
    const tick = setup.getByRole('button', { name: 'できた ✓', exact: true }).first();
    const bg = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
    check(await bg(tick) === 'rgb(255, 255, 255)', tag + ': the mark-only できた button is never the filled one');
    await advance.click();
    await setup.getByText('いまここ 2 / 3').first().waitFor();
    check(/操作\s*1/.test(await setup.locator('main').innerText()) && !/(操作|やること)\s*[アイウエ]/.test(await setup.locator('main').innerText()), tag + ': step 2 uses plain numbers for its operations and never the katakana ア イ ウ that look like garbled text');
    await setup.locator('#endpoint').fill(endpoint);
    await setup.getByText('Googleにつながりませんでした').first().waitFor({ timeout: 8000 });
    const alerts = await setup.locator('[role=alert]').filter({ hasText: 'つながりませんでした' }).count();
    check(alerts === 1 && !(await setup.locator('main').innerText()).includes('URLの形はOKです。でも'), tag + ': one failure box only');
    check(await setup.locator('summary', { hasText: 'だめなとき' }).count() === 1 && !(await setup.locator('[role=alert] ol').first().isVisible()), tag + ': the four checks are folded');
    check(await setup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tag + ': setup has no horizontal overflow');
    // つながったと確かめた印は、確かめたときだけ残る
    const saved = await setup.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), 'tournament-setup-v3:' + id + '-s');
    check(saved.verified === false, tag + ': a failed check does not mark the URL as verified');
    await setup.close();
    await ctx.close();
    console.log(tag + ': PASS');
  }
  console.log('Glance checks passed: ' + checks + '. Local only, fake data.');
} finally { await browser.close(); }
