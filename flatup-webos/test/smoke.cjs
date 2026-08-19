const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const path0 = require('path');
const ROOT = path0.join(__dirname, '..', 'app');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/journey')) { // WebOS→VPS引き継ぎのローカル模擬
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => {
      const answers = (JSON.parse(b || '{}').answers) || {};
      const ok = typeof answers.audience === 'string';
      res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' });
      res.end(JSON.stringify(ok ? { ok: true, journey_id: 'J-abcdefabcdef' } : { ok: false }));
    });
    return;
  }
  const p = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'text/plain' });
    res.end(data);
  });
});

async function clickByText(page, text) {
  await page.locator('button, a').filter({ hasText: text }).first().click();
  await page.waitForTimeout(380);
}

(async () => {
  await new Promise(r => server.listen(8931, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone size
  await context.route('**lin.ee**', r => r.abort()); // 外部LINEへは実際に飛ばさない
  await context.route('**line.me**', r => r.abort());
  await context.addInitScript(() => { window.FLATUP_JOURNEY_ENDPOINT = 'http://localhost:8931/journey'; });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  // ---- 成人ルート ----
  await page.goto('http://localhost:8931/');
  if (!(await page.textContent('body')).includes('強い人だけの場所ではありません')) throw new Error('welcome missing');
  await clickByText(page, '自分に合う始め方を見つける');
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
  if (!result.includes('こんな一歩から')) throw new Error('result missing');
  if (!result.includes('キックボクシングは全身運動')) throw new Error('diet snippet missing');
  if (!result.includes('完全に初めてからのスタート')) throw new Error('first snippet missing');
  if (!result.includes('まずは気軽に相談・体験してみる')) throw new Error('unified CTA missing');
  if (!result.includes('大丈夫。最初はみんな初心者です')) throw new Error('final nudge missing');
  const ctaCount = await page.locator('a.cta').count();
  if (ctaCount !== 1) throw new Error('CTA must be exactly 1, got ' + ctaCount);
  await page.waitForTimeout(600); // journey送信の完了を待つ
  const href = await page.getAttribute('a.cta.primary', 'href');
  if (!href.includes('line.me/R/oaMessage') || !href.includes('J-abcdefabcdef')) throw new Error('handoff CTA link wrong: ' + href);
  if (/female|diet|first|weekday/.test(href)) throw new Error('answers leaked into URL');
  const noteText = await page.textContent('body');
  if (!noteText.includes('引き継ぎコード')) throw new Error('handoff note missing');
  const hasJourneyEvent = await page.evaluate(() => window.dataLayer.some(e => e.event === 'journey_created'));
  if (!hasJourneyEvent) throw new Error('journey_created event missing');
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
  await clickByText(page, '自分に合う始め方を見つける');
  await clickByText(page, '子どもを通わせたい');
  if (!(await page.textContent('h1')).includes('お子さまの年代')) throw new Error('kids Q missing');
  await clickByText(page, '小学校低学年');
  await clickByText(page, '自信をつけてほしい');
  const kidsResult = await page.textContent('body');
  if (!kidsResult.includes('お子さまなら')) throw new Error('kids headline missing');
  if (!kidsResult.includes('自信につながります')) throw new Error('kids snippet missing');

  // ---- 相談ルート ----
  await clickByText(page, '最初からやり直す');
  await clickByText(page, '自分に合う始め方を見つける');
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
