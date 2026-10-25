/**
 * 準備の画面（/private/）の「くわしい戦績」を、本物のブラウザで確かめる。
 * 名簿ZIP（players.csv + records.csv）を入れて、幅320px・390px・1280pxで、
 *   - 戦績のある人にだけ「くわしい戦績」が出る（古い申し込み＝records.csv に行が無い人には出ない）。はじめはたたんである
 *   - 開くと、キック・他の格闘技・タイトル/入賞歴が出る。出すのは「試合数」「勝ち」と、あるときだけ「引き分け」（負け・勝敗なしは出さない）。長い文字も切れない
 *   - 横にはみ出さない・文字が16px未満にならない・押す所は48px以上
 * 取り込みの知らせ（読み込みの結果の文）が、ほんとうのことを言うこと：
 *   - 名簿にない管理番号の戦績／見出しが違う records.csv／決まりに合わない受付、は「付けていません」と知らせ、名簿は読む
 *   - すでにいる人に、くわしい戦績を足したときは、足した人数を言う
 *   - ZIPの中のファイルの数に、records.csv も数える（ZIP爆弾の守りを通りぬけさせない）。別の試験（test-polish-private）が、3100個で止まることを確かめる
 * 名前・大会名・ジム名・番号は、ぜんぶ架空。外には出ない（ここ以外への通信は止めて、数える）。
 * 使い方：TOS_TEST_BASE=http://127.0.0.1:<port> node --experimental-strip-types scripts/test-private-record-fold.mjs
 */
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { RECORD_DETAIL_HEADERS, recordDetailRows } from '../core/recordDetail.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4990';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const EXE = process.env.TOS_CHROME_PATH || '';
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

const failures = [];
const externals = [];
const pageErrors = [];
let checks = 0;
let cur = '';
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};

/* ───────── 架空のデータ ───────── */
const q = (v) => '"' + String(v).replaceAll('"', '""') + '"';
const HEAD = '管理番号,ジム名,選手名,学年,年齢,身長,体重,戦績・競技歴,試合への意気込み,入場曲URL（Apple Music推奨）';
const fighterRow = (id, n, record) => [id, '架空' + n + 'ジム', '架空' + n + '選手', '中1', '13', '155', '60', record, 'がんばる', ''].map(q).join(',');
const playersCsv = [HEAD, fighterRow('F01', '一', '3勝1敗'), fighterRow('F02', '二', '初試合'), fighterRow('F03', '三', '2勝0敗')].join('\n');

const LONG_SPORT = 'ムエタイ・キックボクシング混合'.slice(0, 20); // 上限20字
const LONG_EVENT = '架空県少年少女格闘技選手権大会ジュニア全国ブロック予選会兼強化合宿記念トーナメント第三回'.slice(0, 60); // 上限60字
const LONG_RESULT = '準優勝（決勝は延長ラウンドの末に判定で惜しくも敗れる）／敢闘賞／技能賞も同時に受賞'.slice(0, 60); // 上限60字
const detailRich = {
  v: 1,
  kick: { games: 4, win: 3, loss: 1, draw: 0 },
  // 負け・勝敗なしは、表には本当の数が入っている。準備の画面は出さない。引き分けは、あるときだけ出す（2026-10-25 owner）
  others: [
    { sport: LONG_SPORT, games: 12, win: 7, loss: 3, draw: 1, noResult: 1 },
    { sport: '空手', games: 3, win: 2, loss: 1, draw: 0, noResult: 0 },
  ],
  titles: [
    { event: LONG_EVENT, year: 2025, class: '中学1年・男子 -55kg', result: LONG_RESULT },
    { event: '架空杯', year: 2024, class: '小学6年', result: '優勝' },
  ],
};
const detailKickOnly = { v: 1, kick: { games: 0, win: 0, loss: 0, draw: 0 }, others: [], titles: [] };
const detailGhost = { v: 1, kick: { games: 2, win: 1, loss: 1, draw: 0 }, others: [], titles: [] };
const csvCell = (v) => (/[",\n\r]/.test(v) ? q(v) : v);
const recordsOf = (...parts) => [RECORD_DETAIL_HEADERS.join(','), ...parts.flatMap(([id, at, detail]) => recordDetailRows(id, at, detail).map((r) => r.map(csvCell).join(',')))].join('\n');
const zipOf = (files) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))));
const recordsOk = recordsOf(['F01', '2026-10-24 10:00:00', detailRich], ['F02', '2026-10-24 10:05:00', detailKickOnly]);

/* ───────── 部品 ───────── */
async function open(width, height, tag) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 500, hasTouch: width < 500 });
  ctx.on('page', (page) => { page.on('dialog', (d) => d.dismiss().catch(() => {})); page.on('pageerror', (e) => pageErrors.push(e.message)); });
  await ctx.route('**/*', (route) => {
    if (route.request().url().startsWith(base + '/')) return route.continue();
    externals.push(route.request().url());
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=record-fold-' + tag + '-' + width + '-' + Date.now());
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  return { ctx, page };
}
/** ZIPを入れて、読み込みの結果の文（#import-note または 失敗の文）が出るまで待つ。文を返す */
async function importZip(page, zip, name = 'select.zip') {
  const before = await page.locator('main').innerText();
  await page.locator('#pick-file').setInputFiles({ name, mimeType: 'application/zip', buffer: zip });
  await page.waitForFunction((was) => { const t = document.body.innerText; return t !== was && /人分を読み込みました|まちがい：/.test(t); }, before, { timeout: 15000 }).catch(() => {});
  const status = page.getByRole('status').filter({ hasText: '人分を読み込みました' });
  await status.first().waitFor({ timeout: 8000 }).catch(() => {});
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ');
}
const foldOf = (page, who) => page.locator('article[id^="fighter-"]', { hasText: who }).locator('details > summary', { hasText: 'くわしい戦績' });

/* ───────── 幅ごとの確認 ───────── */
async function widthRun(width, height) {
  cur = width + 'px';
  const { ctx, page } = await open(width, height, 'fold');
  // 名簿にない管理番号 F99 の戦績が1つ混ざっている（誰にも付かない）
  const text = await importZip(page, zipOf({ 'players.csv': playersCsv, 'records.csv': recordsOf(['F01', '2026-10-24 10:00:00', detailRich], ['F02', '2026-10-24 10:05:00', detailKickOnly], ['F99', '2026-10-24 10:09:00', detailGhost]) }));
  check(/3人分を読み込みました/.test(text), '3人分が読み込まれた');
  check(/くわしい戦績が2人分あります。/.test(text), '「くわしい戦績が2人分あります。」と知らせる');
  check(/名簿にない管理番号の戦績が1人分あったので、付けていません。/.test(text), '名簿にない管理番号の戦績が1人分あったことを知らせる（付いた人数と合わない理由）');

  const cards = page.locator('article[id^="fighter-"]');
  check((await cards.count()) === 3, '選手のカードが3枚');
  check((await page.locator('details > summary', { hasText: 'くわしい戦績' }).count()) === 2, '「くわしい戦績」は2人だけ（古い申し込みの1人と、名簿にいない F99 には出ない）');
  check((await foldOf(page, '架空三選手').count()) === 0, '古い申し込み（F03）には出ない');
  check((await foldOf(page, '架空一選手').count()) === 1 && (await foldOf(page, '架空二選手').count()) === 1, 'F01・F02 に1つずつ出る');
  const openAtStart = await page.evaluate(() => [...document.querySelectorAll('details')].filter((d) => d.querySelector(':scope > summary')?.textContent?.includes('くわしい戦績')).map((d) => d.open));
  check(openAtStart.length === 2 && openAtStart.every((o) => o === false), 'はじめはたたんである');

  const f01 = page.locator('article[id^="fighter-"]', { hasText: '架空一選手' });
  const f02 = page.locator('article[id^="fighter-"]', { hasText: '架空二選手' });
  const box = await foldOf(page, '架空一選手').boundingBox();
  check(!!box && box.height >= 47.5 && box.width >= 100, '見出しは押せる大きさ（高さ ' + (box ? Math.round(box.height) : '？') + 'px・幅 ' + (box ? Math.round(box.width) : '？') + 'px）');
  await foldOf(page, '架空一選手').click();
  await foldOf(page, '架空二選手').click();
  await page.waitForFunction(() => [...document.querySelectorAll('details')].filter((d) => d.querySelector(':scope > summary')?.textContent?.includes('くわしい戦績')).every((d) => d.open));
  const t1 = (await f01.locator('details', { hasText: 'くわしい戦績' }).innerText()).replace(/\s+/g, ' ');
  const t2 = (await f02.locator('details', { hasText: 'くわしい戦績' }).innerText()).replace(/\s+/g, ' ');
  check(t1.includes('キックボクシング：試合数 4・勝ち 3'), 'F01：キックは「試合数 4・勝ち 3」');
  check(t1.includes(LONG_SPORT + '（他の格闘技）：試合数 12・勝ち 7・引き分け 1'), 'F01：1つ目の他の格闘技（長い名前）は「試合数 12・勝ち 7・引き分け 1」');
  check(t1.includes('空手（他の格闘技）：試合数 3・勝ち 2'), 'F01：2つ目の他の格闘技（空手）');
  check(!/負け|勝敗なし/.test(t1 + t2), '負け・勝敗なしは出さない（表の中に本当の数があっても）');
  check((t1 + t2).split('引き分け').length === 2, '引き分けは、引き分けがある1行（' + LONG_SPORT + '）だけに出る');
  check(t1.includes('タイトル・入賞：' + LONG_EVENT + '（2025年・中学1年・男子 -55kg）・' + LONG_RESULT), 'F01：長いタイトル・入賞歴が、ぜんぶ出る');
  check(t1.includes('タイトル・入賞：架空杯（2024年・小学6年）・優勝'), 'F01：2つ目のタイトル・入賞歴');
  check((await f01.locator('details', { hasText: 'くわしい戦績' }).locator('li').count()) === 5, 'F01：5行（キック1 + 他2 + タイトル2）');
  check(t2.includes('キックボクシング：未経験（試合数 0）'), 'F02：キックは「未経験（試合数 0）」');
  check((await f02.locator('details', { hasText: 'くわしい戦績' }).locator('li').count()) === 1, 'F02：キックの1行だけ（ほかが空でも壊れない）');

  const geo = await page.evaluate(() => {
    const vw = window.innerWidth;
    const out = { vw, docScroll: document.documentElement.scrollWidth, bodyScroll: document.body.scrollWidth, over: [], clipped: [], tiny: [], overlap: [] };
    const folds = [...document.querySelectorAll('details')].filter((d) => d.querySelector(':scope > summary')?.textContent?.includes('くわしい戦績'));
    for (const d of folds) {
      const dr = d.getBoundingClientRect();
      if (dr.left < -0.5 || dr.right > vw + 0.5) out.over.push('details ' + Math.round(dr.left) + '..' + Math.round(dr.right));
      for (const el of d.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.left < -0.5 || r.right > vw + 0.5) out.over.push(el.tagName + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') out.clipped.push(el.tagName + ' ' + el.scrollWidth + '>' + el.clientWidth);
        if (el.children.length === 0 && el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) < 16) out.tiny.push(el.tagName + ' ' + getComputedStyle(el).fontSize);
      }
      const lis = [...d.querySelectorAll('li')].map((li) => li.getBoundingClientRect());
      for (let i = 1; i < lis.length; i++) if (lis[i].top < lis[i - 1].bottom - 0.5) out.overlap.push('li' + i);
      const ul = d.querySelector('ul');
      if (ul && ul.scrollWidth > ul.clientWidth + 1) out.clipped.push('ul ' + ul.scrollWidth + '>' + ul.clientWidth);
    }
    return out;
  });
  check(geo.docScroll <= geo.vw + 1 && geo.bodyScroll <= geo.vw + 1, '画面全体が横にはみ出さない（幅 ' + geo.vw + '、文書 ' + geo.docScroll + '、body ' + geo.bodyScroll + '）');
  check(geo.over.length === 0, '画面の外にはみ出す部品がない ' + JSON.stringify(geo.over.slice(0, 4)));
  check(geo.clipped.length === 0, '切れた文字がない ' + JSON.stringify(geo.clipped.slice(0, 4)));
  check(geo.tiny.length === 0, '16px未満の小さな文字がない ' + JSON.stringify(geo.tiny.slice(0, 4)));
  check(geo.overlap.length === 0, '行どうしが重ならない ' + JSON.stringify(geo.overlap));

  await foldOf(page, '架空一選手').click();
  const f01Fold = f01.locator('details', { hasText: 'くわしい戦績' });
  await f01Fold.evaluate((d) => new Promise((resolve) => { if (!d.open) return resolve(); d.addEventListener('toggle', () => resolve(), { once: true }); setTimeout(resolve, 3000); }));
  check(await f01Fold.evaluate((d) => d.open) === false, 'もう一度押すとたたまれる');
  check(await f02.locator('details', { hasText: 'くわしい戦績' }).evaluate((d) => d.open) === true, 'ほかの人（F02）の開いた戦績は、そのまま');
  await ctx.close();
}

/* ───────── 取り込みの知らせ ───────── */
async function noticeRuns() {
  cur = 'notice';
  // (a) 見出しが違う records.csv：名簿は読む。くわしい戦績は付けず、そう知らせる
  {
    const { ctx, page } = await open(390, 800, 'badhead');
    const bad = recordsOk.replace('勝ち', '勝');
    const text = await importZip(page, zipOf({ 'players.csv': playersCsv, 'records.csv': bad }));
    check(/3人分を読み込みました/.test(text), '見出しが違う records.csv でも、名簿の3人は読む');
    check(/records\.csv が読めなかった（見出しが違う）ので、くわしい戦績は付けていません。/.test(text), '見出しが違うときは、そう知らせる');
    check(!/くわしい戦績が\d+人分あります。/.test(text), '付けていないのに「あります」とは言わない');
    check((await page.locator('details > summary', { hasText: 'くわしい戦績' }).count()) === 0, 'くわしい戦績は、誰にも付かない');
    await ctx.close();
  }
  // (b) 決まりに合わない受付（キックの勝ちが試合数より多い）：その受付だけ付けない
  {
    const { ctx, page } = await open(390, 800, 'badrule');
    const broken = recordsOf(['F01', '2026-10-24 10:00:00', detailRich], ['F02', '2026-10-24 10:05:00', { v: 1, kick: { games: 2, win: 5, loss: 0, draw: 0 }, others: [], titles: [] }]);
    const text = await importZip(page, zipOf({ 'players.csv': playersCsv, 'records.csv': broken }));
    check(/くわしい戦績が1人分あります。/.test(text), '読めた1人分だけ付く');
    check(/records\.csv のうち1人分は、決まりに合わないので、付けていません。/.test(text), '決まりに合わない1人分を知らせる');
    check((await foldOf(page, '架空一選手').count()) === 1 && (await foldOf(page, '架空二選手').count()) === 0, 'F01 には付き、F02 には付かない');
    await ctx.close();
  }
  // (d) 大きすぎる records.csv（5MBより大きい）：名簿と同じ場所のものなら、そう知らせる。ほかのフォルダのものは、もともと使わないので、言わない
  {
    const huge = recordsOk + '\n' + 'x'.repeat(5 * 1024 * 1024 + 10);
    const { ctx, page } = await open(390, 800, 'big');
    const own = await importZip(page, zipOf({ 'players.csv': playersCsv, 'records.csv': huge }));
    check(/3人分を読み込みました/.test(own) && /records\.csv が大きすぎる（5MBまで）ので、くわしい戦績は付けていません。/.test(own), '名簿と同じ場所の records.csv が大きすぎる：名簿は読み、そう知らせる');
    await ctx.close();
    const second = await open(390, 800, 'big-elsewhere');
    const other = await importZip(second.page, zipOf({ 'players.csv': playersCsv, 'records.csv': recordsOk, 'old/records.csv': huge }));
    check(/くわしい戦績が2人分あります。/.test(other) && !/大きすぎる/.test(other), 'ほかのフォルダの大きな records.csv には触れない（名簿の場所の分は付く）');
    await second.ctx.close();
  }
  // (c) すでにいる人に、あとからくわしい戦績を足す：足した人数を言う（「全員そのまま」とだけ言わない）
  {
    const { ctx, page } = await open(390, 800, 'fill');
    const first = await importZip(page, zipOf({ 'players.csv': playersCsv }));
    check(/3人分を読み込みました/.test(first) && !/くわしい戦績が\d+人分/.test(first), 'まず、くわしい戦績の無いZIPを入れる');
    check((await page.locator('details > summary', { hasText: 'くわしい戦績' }).count()) === 0, 'はじめは、くわしい戦績が無い');
    const text = await importZip(page, zipOf({ 'players.csv': playersCsv, 'records.csv': recordsOk }));
    check(/くわしい戦績が無かった2人に、くわしい戦績を足しました。/.test(text), '足した人数（2人）を知らせる');
    check((await page.locator('details > summary', { hasText: 'くわしい戦績' }).count()) === 2, '2人に、くわしい戦績が付く');
    // もう一度同じZIPを入れても、足すものは無い（知らせない）
    const again = await importZip(page, zipOf({ 'players.csv': playersCsv, 'records.csv': recordsOk }));
    check(!/くわしい戦績を足しました。/.test(again), '同じZIPをもう一度入れても、「足しました」とは言わない');
    await ctx.close();
  }
}

try {
  for (const [w, h] of [[320, 700], [390, 800], [1280, 900]]) await widthRun(w, h);
  await noticeRuns();
  cur = 'all';
  check(externals.length === 0, 'このパソコンの外への通信は、1つも無い (' + externals.slice(0, 2).join(' | ') + ')');
  check(pageErrors.length === 0, 'ページのエラーが無い (' + pageErrors.slice(0, 2).join(' | ') + ')');
} finally { await browser.close(); }

console.log('\n' + checks + ' checks, ' + failures.length + ' failed.');
for (const f of failures) console.log(' - ' + f);
process.exit(failures.length ? 1 : 0);
