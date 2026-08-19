const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const path0 = require('path');
const ROOT = path0.join(__dirname, '..', 'app');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'text/plain' });
    res.end(data);
  });
});

async function clickByText(page, text) {
  await page.locator('button, a').filter({ hasText: text }).first().click();
  await page.waitForTimeout(120);
}

(async () => {
  await new Promise(r => server.listen(8931, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone size
  await context.route('**lin.ee**', r => r.abort()); // 外部LINEへは実際に飛ばさない
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  // ---- 成人ルート ----
  await page.goto('http://localhost:8931/');
  if (!(await page.textContent('body')).includes('強い人だけの場所ではありません')) throw new Error('welcome missing');
  await clickByText(page, '冒険を始める');
  if (!(await page.textContent('h1')).includes('誰のために')) throw new Error('Q1 missing');
  await clickByText(page, '自分が通ってみたい');
  if (!(await page.textContent('h1')).includes('あなたについて')) throw new Error('gender Q missing');
  // 戻るテスト
  await clickByText(page, '← 戻る');
  if (!(await page.textContent('h1')).includes('誰のために')) throw new Error('back failed');
  await clickByText(page, '自分が通ってみたい');
  // スキップテスト（性別）
  await clickByText(page, '答えずに進む');
  if (!(await page.textContent('h1')).includes('目的')) throw new Error('skip failed');
  await clickByText(page, 'ダイエットしたい');
  await clickByText(page, '完全に初めて');
  await clickByText(page, '平日の夜');
  const result = await page.textContent('body');
  if (!result.includes('こんな始め方が合いそうです')) throw new Error('result missing');
  if (!result.includes('キックボクシングは全身運動')) throw new Error('diet snippet missing');
  if (!result.includes('完全に初めてからのスタート')) throw new Error('first snippet missing');
  if (!result.includes('まずは気軽に相談・体験してみる')) throw new Error('unified CTA missing');
  const ctaCount = await page.locator('a.cta').count();
  if (ctaCount !== 1) throw new Error('CTA must be exactly 1, got ' + ctaCount);
  const href = await page.getAttribute('a.cta.primary', 'href');
  if (href !== 'https://lin.ee/cTSDajPz') throw new Error('CTA link wrong: ' + href);
  // CTAクリック → 新規タブ(popup)が開き、計測イベントが発火すること
  const popupPromise = page.waitForEvent('popup', { timeout: 5000 });
  await page.locator('a.cta.primary').click();
  await popupPromise;
  const clicked = await page.evaluate(() => window.dataLayer.some(e => e.event === 'booking_clicked'));
  if (!clicked) throw new Error('booking_clicked event missing');
  // イベント計測確認
  const events = await page.evaluate(() => window.dataLayer.map(e => e.event));
  const need = ['webos_started', 'audience_selected', 'question_skipped', 'goal_selected', 'experience_selected', 'availability_selected', 'personalized_view'];
  for (const n of need) if (!events.includes(n)) throw new Error('event missing: ' + n);

  // ---- キッズルート ----
  await clickByText(page, '最初からやり直す');
  await clickByText(page, '冒険を始める');
  await clickByText(page, '子どもを通わせたい');
  if (!(await page.textContent('h1')).includes('お子さまの年代')) throw new Error('kids Q missing');
  await clickByText(page, '小学校低学年');
  await clickByText(page, '自信をつけてほしい');
  const kidsResult = await page.textContent('body');
  if (!kidsResult.includes('お子さまには')) throw new Error('kids headline missing');
  if (!kidsResult.includes('自信につながります')) throw new Error('kids snippet missing');

  // ---- 相談ルート ----
  await clickByText(page, '最初からやり直す');
  await clickByText(page, '冒険を始める');
  await clickByText(page, 'まだ決めていない');
  const consult = await page.textContent('body');
  if (!consult.includes('まだ決めなくて、大丈夫です')) throw new Error('consult headline missing');
  if (!consult.includes('まずは気軽に、話を聞いてみる')) throw new Error('consult CTA missing');
  const consultCtaCount = await page.locator('a.cta').count();
  if (consultCtaCount !== 1) throw new Error('consult CTA must be exactly 1, got ' + consultCtaCount);

  await page.screenshot({ path: path0.join(__dirname, 'result_mobile.png'), fullPage: true });

  if (errors.length) throw new Error('console errors: ' + errors.join(' | '));
  console.log('SMOKE TEST PASSED — 成人/キッズ/相談ルート・戻る・スキップ・CTA・計測イベント すべてOK');
  await browser.close();
  server.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
