/**
 * "Do only what the yellow 👉 次はここ says" robot for the bout-card (対戦カード) flow of Tournament OS v3.
 * It plays the 63-year-old chairman: from the EMPTY /private/ screen it presses ONLY the button (or fills ONLY the field)
 * that the single yellow slot names, until 3 bouts are saved and the match-day screen (/private/live/) shows them.
 * It runs at 1280px (PC) and 390px (phone). Local only: every request that leaves 127.0.0.1 is aborted and counted. Fake data only.
 *
 * It FAILS (exit 1) when, in any state:
 *   - there is not exactly ONE visible yellow slot (data-tos-next) -- zero is allowed only on the finished state
 *   - following the yellow does not move progress (title / roster / bouts / filled corners / saved / opened)
 *   - the whole walk needs more than MAX_STEPS steps
 *   - the yellow slot contains a red / irreversible button (消す, 戻す, 書きかえ, tos-danger-btn ...)
 *   - the yellow points at "保存" or "当日の画面を開く" while an empty card is on screen, or while fewer than 3 bouts exist
 *     and fighters are still waiting (the robot then presses 「＋ 試合を追加」 itself so the rest of the walk can still be checked)
 *   - plain-words checks: the first use of a hard word has no short explanation nearby (see WORDS)
 *   - the match-day screen does not show the 3 bouts, red/blue corner words, class words, or has more/less than one yellow slot
 *   - (round 2) a grey lock reason points at a box that is not on screen; the yellow badge breaks 「第1試合」 over two lines;
 *     typing ONE letter of the title moves the title box (Safari has no scroll anchoring) or the yellow off it;
 *     one press of 「1つ目の案を見る」 already turns the yellow into 保存 while 2 suggestions are unseen;
 *     a saved half bout still shows 「保存 ○ まだ」; the bar says nothing after the hand-over; 試合当日の画面 is never explained
 *   (round 2) the yellow is on screen right after the import and after the 2nd corner (also at 910x512 = a 1366x768 laptop at 150% zoom);
 *             「おすすめ」 does not copy bout 1's rule / weight class onto the suggested bouts
 *   Env TOS_ONLY accepts: 1280, 390, suggest, typing, review, half, onscreen, rulecopy (comma separated)
 *
 * Run (server started and stopped inside ONE shell command):
 *   (python3 -m http.server 4630 -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/p.pid; sleep 1;
 *    TOS_PLAYWRIGHT_MODULE=playwright TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/test-bout-flow.mjs; rc=$?; kill $(cat /tmp/p.pid); exit $rc)
 * Env: TOS_TEST_BASE (default http://127.0.0.1:4630), TOS_CHROME_PATH, TOS_PLAYWRIGHT_MODULE, TOS_ONLY=1280 or 390.
 */
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4630';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('This test must run against a local preview.');
const EXE = process.env.TOS_CHROME_PATH || '';
const ONLY = (process.env.TOS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : { channel: process.env.TOS_BROWSER_CHANNEL || 'chrome' }) });

const MAX_STEPS = 20;
let checks = 0, cur = '-';
const failures = [], externals = [], pageErrors = [], notes = [];
const check = (value, message) => {
  checks++;
  try { assert.ok(value, message); } catch { failures.push('[' + cur + '] ' + message); console.log('  FAIL [' + cur + '] ' + message); }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 140) => String(s).replace(/\s+/g, ' ').slice(0, n);

/* ───────── fake roster: 6 fighters, both classes (A has 4, B has 2, so three SAME-class bouts exist) ───────── */
const HEAD = '管理番号,ジム名,選手名,学年,年齢,身長,体重,戦績・競技歴,試合への意気込み,入場曲URL（Apple Music推奨）,クラス';
const ROWS = [
  ['F01', '架空赤ジム', '架空赤選手', '中1', '13', '155', '60', '5勝', 'がんばる', '', 'Aクラス'],
  ['F02', '架空青ジム', '架空青選手', '中1', '13', '155', '58', '初試合', '全力', '', 'Bクラス'],
  ['F03', '架空緑ジム', '架空緑選手', '中2', '14', '160', '55', '2勝1敗', '気合', '', 'Bクラス'],
  ['F04', '架空黄ジム', '架空黄選手', '中3', '15', '162', '56', '3勝0敗', '全力', '', 'Aクラス'],
  ['F05', '架空白ジム', '架空白選手', '高1', '16', '170', '70', '4勝', 'やる', '', 'Aクラス'],
  ['F06', '架空黒ジム', '架空黒選手', '高2', '17', '172', '71', '6勝', '勝つ', '', 'Aクラス'],
];
const CSV = [HEAD, ...ROWS.map((r) => r.join(','))].join('\n');
const ZIP = Buffer.from(zipSync({ 'players.csv': strToU8(CSV) }));
/** the bouts the chairman wants (same class, small weight gap): [red id, blue id] */
const PLAN = [['F01', 'F04'], ['F05', 'F06'], ['F02', 'F03']];
const NAME = Object.fromEntries(ROWS.map((r) => [r[0], r[2]]));

/* ───────── browser helpers ───────── */
async function newCtx(mobile) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  ctx.on('page', (p) => { p.on('pageerror', (e) => pageErrors.push({ scenario: cur, message: e.message })); p.on('dialog', (d) => d.dismiss().catch(() => {})); });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(base + '/')) return route.continue();
    externals.push({ scenario: cur, url });
    return route.abort();
  });
  return ctx;
}
const slotInfo = (p) => p.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  return [...document.querySelectorAll('[data-tos-next="1"]')].filter(vis).map((e) => ({
    text: e.innerText.replace(/\s+/g, ' ').trim(),
    hasSelect: !!e.querySelector('select'), selectId: e.querySelector('select')?.id ?? '',
    hasInput: !!e.querySelector('input:not([type=file])'), hasFile: !!e.querySelector('input[type=file]'),
    buttons: [...e.querySelectorAll('button')].map((b) => ({ text: b.innerText.replace(/\s+/g, ' ').trim(), danger: /tos-danger-btn/.test(b.className) })),
    insideBar: !!e.closest('div.fixed'),
  }));
});
const stateSig = (p) => p.evaluate(() => {
  const t = document.getElementById('field-title')?.value ?? '';
  const fighters = (document.body.innerText.match(/(\d+)人 入っています/) || [])[1] ?? '0';
  const arts = [...document.querySelectorAll('article[id^="bout-"]')];
  const filled = arts.map((a) => (a.querySelector('select[aria-label="赤コーナーの選手"]')?.value ? 'R' : '-') + (a.querySelector('select[aria-label="青コーナーの選手"]')?.value ? 'B' : '-')).join(',');
  const save = document.getElementById('save-state')?.innerText.slice(0, 12) ?? '';
  return [t ? 'T' : 't', fighters, arts.length, filled, save].join('|');
});
/** returns e.g. 「第1試合」 when the visible yellow slot breaks that word across two lines, else '' */
const badgeSplit = (p) => p.evaluate(() => {
  const slot = [...document.querySelectorAll('[data-tos-next="1"]')].find((e) => e.getBoundingClientRect().width > 0);
  if (!slot) return '';
  const walker = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent || ''; const re = /第\d+試合/g; let m;
    while ((m = re.exec(t))) {
      const r = document.createRange(); let prev = null;
      for (let i = m.index; i < m.index + m[0].length; i++) {
        r.setStart(n, i); r.setEnd(n, i + 1);
        const rects = r.getClientRects(); if (!rects.length) continue;
        const top = Math.round(rects[0].top);
        if (prev !== null && Math.abs(top - prev) > 4) return m[0];
        prev = top;
      }
    }
  }
  return '';
});
const sec3Text = (p) => p.locator('#sec-3').innerText();
const pageText = (p) => p.evaluate(() => document.body.innerText);

/** hard words and the plain gloss each must get near its first use (a proposal; the regex is loose on purpose) */
const WORDS = [
  ['対戦カード', /対戦カード[（(＝=は]?[^。\n]{0,12}(とは|＝|=|は)[^。\n]{0,30}(組み合わせ|2人|二人|だれ|誰)/, 'say what 対戦カード is (e.g. 「対戦カード＝だれとだれが戦うか、1試合ずつ書いた紙です」)'],
  ['赤コーナー・青コーナー', /(赤|青)コーナー[^。\n]{0,20}(＝|=|とは|は)[^。\n]{0,40}(側|がわ|入場|リング|どちら|選手)/, 'say what 赤コーナー/青コーナー mean (e.g. 「赤コーナー・青コーナー＝リングの赤い側・青い側。2人のうち、どちらがどちらでもかまいません」)'],
  ['体重差', /体重差[^。\n]{0,20}(＝|=|とは|は)[^。\n]{0,30}(おもさ|重さ|ちがい|差)/, 'say what 体重差 is (e.g. 「体重差＝2人の体重のちがい」)'],
  ['試合当日の画面', /試合当日の画面(＝|=|とは|は)[^。\n]{0,60}(大きく|映|表示|出ます)/, 'say what 試合当日の画面 is and that opening it does not start anything (e.g. 「試合当日の画面＝選手の名前・写真・体重を、大きく映す画面です。開いても、試合は始まりません」)'],
];

/** what the yellow slot asks, in the chairman's words -> { kind } */
function readSlot(slot) {
  const t = slot.text;
  if (/大会の名前/.test(t) && slot.hasInput) return { kind: 'title' };
  if (/ZIP|選手のファイル|ファイルを選/.test(t) && slot.hasFile) return { kind: 'file' };
  if (/第(\d+)試合の(赤|青)コーナーを選/.test(t)) { const m = t.match(/第(\d+)試合の(赤|青)コーナーを選/); return { kind: 'corner', n: Number(m[1]) - 1, side: m[2] === '赤' ? 'red' : 'blue' }; }
  if (/試合を1つ作る/.test(t)) return { kind: 'add' };
  if (/案を1つずつ確かめる/.test(t)) return { kind: 'review' };
  if (/当日の画面を開く/.test(t)) return { kind: 'open' };
  if (/保存/.test(t)) return { kind: 'save' };
  return { kind: 'unknown' };
}

async function runWalk(mobile) {
  const label = mobile ? '390' : '1280';
  cur = label;
  console.log('--- walk at ' + label + ' ---');
  const ctx = await newCtx(mobile);
  const page = await ctx.newPage();
  const id = 'bout-flow-' + label + '-' + Date.now();
  await page.goto(base + '/private/?event=' + id);
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  const trail = [];
  let boutsSaved = 0, steps = 0, opened = null, lastSave = 0, overrides = 0;
  const stalls = new Set();
  const popupP = ctx.waitForEvent('page', { timeout: 120000 }).catch(() => null);

  for (; steps < MAX_STEPS + 6; steps++) {
    await settle(250);
    const slots = await slotInfo(page);
    const sig0 = await stateSig(page);
    const text = await pageText(page);
    const arts = await page.locator('article[id^="bout-"]').count();
    const blank = await page.evaluate(() => [...document.querySelectorAll('article[id^="bout-"]')].some((a) => !a.querySelector('select[aria-label="赤コーナーの選手"]')?.value && !a.querySelector('select[aria-label="青コーナーの選手"]')?.value));
    const finished = /ぜんぶ終わりました/.test(text) || opened;
    trail.push(sig0 + ' :: ' + slots.map((s) => short(s.text, 50)).join(' / '));
    // a grey lock reason must never send the chairman to a box that is not on screen (the 「✕ 直すところ」 box only exists once a bout has a problem; the 「次にすること」 box is hidden on the empty start)
    if (/上の「✕ 直すところ」/.test(text) && !/(^|\n)✕\s*直すところ/.test(text) && !stalls.has('lock-fix')) {
      stalls.add('lock-fix');
      check(false, 'step ' + steps + ' (' + sig0 + '): the grey lock says 「上の「✕ 直すところ」を直します」 but no 「✕ 直すところ」 box is on screen (say the real reason: 先に大会の名前 / 選手 / 試合1つ / 保存)');
    }
    if (/上の「次にすること」/.test(text) && !/次にすること：/.test(text) && !stalls.has('lock-next')) {
      stalls.add('lock-next');
      check(false, 'step ' + steps + ' (' + sig0 + '): the text says 「上の「次にすること」を見てください」 but no 「次にすること」 box is on screen');
    }
    // the yellow badge must not break the word 「第1試合」 across two lines (「第」 / 「1試合」) in the narrow corner column
    const split = await badgeSplit(page);
    if (split && !stalls.has('split:' + label)) { stalls.add('split:' + label); check(false, 'step ' + steps + ' (' + sig0 + ') at ' + label + ': the yellow badge breaks ' + split + ' (use a word joiner / keep-all / a shorter label such as 「第1試合の赤コーナーを選ぶ」)'); }
    if (opened) break;
    check(slots.length === 1 || (slots.length === 0 && finished), 'step ' + steps + ': exactly ONE yellow slot (saw ' + slots.length + (slots.length ? ': ' + slots.map((s) => short(s.text, 40)).join(' | ') : '') + ')');
    const slot = slots[0];
    if (!slot) break;
    check(!slot.buttons.some((b) => b.danger || /消す|戻す|もどす|書きかえ|上書き|取り消|✕/.test(b.text)), 'step ' + steps + ': the yellow slot never holds a red / irreversible button (' + slot.buttons.map((b) => b.text).join(' | ') + ')');
    let act = readSlot(slot);
    check(act.kind !== 'unknown', 'step ' + steps + ': the yellow slot names a known job (' + short(slot.text, 60) + ')');

    // the chairman wants 3 bouts. A yellow "保存"/"開く" while a blank card is on screen, or while fighters still wait and fewer than 3 bouts exist, is a stall.
    const unplaced = await page.evaluate(() => { const m = document.body.innerText.match(/まだ試合に入っていない選手 (\d+)人/); return m ? Number(m[1]) : 0; });
    const once = (key, ok, message) => { if (!stalls.has(key)) { stalls.add(key); check(ok, message); } };
    if ((act.kind === 'save' || act.kind === 'open') && blank) {
      once('blank', false, 'the yellow says 「' + short(slot.text, 40) + '」 while an EMPTY bout card is waiting on screen (it must point at that card\'s red corner: 「第N試合の赤コーナーを選ぶ」)');
      const idx = await page.evaluate(() => [...document.querySelectorAll('article[id^="bout-"]')].findIndex((a) => !a.querySelector('select[aria-label="赤コーナーの選手"]')?.value && !a.querySelector('select[aria-label="青コーナーの選手"]')?.value));
      act = { kind: 'fill-blank', n: idx }; overrides++;
    } else if (act.kind === 'open' && boutsSaved < 3 && unplaced >= 2) {
      // 黄色は1つのまま、ふつうの文で教える：全員が出なくてよい／もう1試合は「＋ 試合を追加」／これでよければ「試合当日の画面を開く」
      once('more', /まだ試合に入っていない選手が\d+人います/.test(text) && /全員が試合に出なくてもかまいません/.test(text) && /「＋ 試合を追加」を押します/.test(text) && /「試合当日の画面を開く」を押します/.test(text), 'after ' + arts + ' bout(s) the yellow says 「当日の画面を開く」 while ' + unplaced + ' fighters have no bout, and no line near it tells the chairman that 「＋ 試合を追加」 makes the next bout (the plain line must say: not everybody has to fight / 「＋ 試合を追加」 makes the next bout / 「試合当日の画面を開く」 if this is enough)');
      act = { kind: 'add-override' }; overrides++;
    }

    switch (act.kind) {
      case 'title': await page.locator('#field-title').fill('第3回 架空テスト大会'); await page.locator('#field-title').blur(); break;
      case 'file': await page.locator('#pick-file').setInputFiles({ name: '選手名簿.zip', mimeType: 'application/zip', buffer: ZIP }); await settle(700); break;
      case 'add': case 'add-override': await page.getByRole('button', { name: '＋ 試合を追加', exact: true }).click(); break;
      case 'corner': {
        const pair = PLAN[act.n];
        if (!pair) { check(false, 'step ' + steps + ': yellow asks for bout ' + (act.n + 1) + ' which is not in the plan'); break; }
        await page.locator('#bout-' + act.n + '-' + act.side).selectOption(act.side === 'red' ? pair[0] : pair[1]);
        break;
      }
      case 'fill-blank': { const pair = PLAN[act.n]; if (pair) await page.locator('#bout-' + act.n + '-red').selectOption(pair[0]); break; }
      case 'review': await page.getByRole('button', { name: '1つ目の案を見る' }).click(); break;
      case 'save': {
        const wait = lastSave + 1700 - Date.now(); if (wait > 0) await settle(wait);
        await page.locator('div.fixed').getByRole('button', { name: /^保存する$/ }).first().click();
        lastSave = Date.now();
        await page.waitForFunction(() => /保存済み/.test(document.getElementById('save-state')?.innerText ?? ''), null, { timeout: 8000 }).catch(() => {});
        boutsSaved = await page.locator('article[id^="bout-"]').count();
        break;
      }
      case 'open': {
        const wait = lastSave + 1700 - Date.now(); if (wait > 0) await settle(wait);
        await page.locator('div.fixed').getByRole('button', { name: '試合当日の画面を開く' }).first().click();
        opened = await popupP;
        if (opened) await opened.waitForLoadState('domcontentloaded').catch(() => {});
        break;
      }
      default: break;
    }
    await settle(300);
    if (!opened && act.kind !== 'open') {
      const sig1 = await stateSig(page);
      check(sig1 !== sig0, 'step ' + steps + ': following the yellow (' + act.kind + ') moved progress (still ' + sig1 + ')');
    }
    if (act.kind === 'save') boutsSaved = (await page.locator('article[id^="bout-"]').count());
    // after the 3rd bout is complete and saved, the yellow must lead to the open step
    if (act.kind === 'save' && boutsSaved >= 3 && !(await slotInfo(page)).some((s) => /当日の画面を開く/.test(s.text))) check(false, 'after saving 3 bouts the yellow does not offer 「当日の画面を開く」');
  }
  console.log('  trail:\n    ' + trail.join('\n    '));
  check(steps <= MAX_STEPS, 'the whole walk took ' + steps + ' steps (limit ' + MAX_STEPS + ', yellow-only overrides: ' + overrides + ')');
  check(!!opened, 'the yellow path ends in the match-day screen opening');

  /* plain-words checks on the prep screen (as the chairman sees it after the roster and the first bout) */
  const s3 = await sec3Text(page).catch(() => '');
  const all = await pageText(page);
  for (const [word, re, how] of WORDS) check(re.test(all), 'plain words: ' + word + ' has no short gloss next to its first use -> ' + how);
  void s3;

  /* the match-day screen */
  if (opened) {
    cur = label + ' live';
    await opened.waitForFunction(() => document.querySelector('h1'), null, { timeout: 15000 }).catch(() => {});
    await settle(500);
    const t = await opened.evaluate(() => document.body.innerText);
    check(/第1試合/.test(t) && /全3試合/.test(t), 'live: header says 第1試合 / 全3試合 (' + short(t, 80) + ')');
    check(/赤コーナー/.test(t) && /青コーナー/.test(t), 'live: both corner WORDS are printed');
    check(t.includes(NAME.F01) && t.includes(NAME.F04), 'live: first bout names ' + NAME.F01 + ' and ' + NAME.F04);
    check(/Aクラス/.test(t), 'live: the class word is shown on the corner card');
    const ls = await slotInfo(opened);
    check(ls.length === 1, 'live (1試合ずつ): exactly one yellow slot (saw ' + ls.length + ')');
    check(!/試合が終わったら押す/.test(ls[0]?.text ?? '') || /次の試合/.test(await opened.locator('footer').innerText()), 'live: the yellow is on 「次の試合 →」');
    await opened.getByRole('button', { name: '一覧', exact: true }).click();
    await settle(500);
    const rows = await opened.locator('li[id^="live-list-row-"]').count();
    check(rows === 3, 'live (一覧): shows the 3 saved bouts (saw ' + rows + ')');
    const lt = await opened.evaluate(() => document.body.innerText);
    check(lt.includes(NAME.F05) && lt.includes(NAME.F02), 'live (一覧): later bouts name their fighters');
    const ls2 = await slotInfo(opened);
    check(ls2.length === 1, 'live (一覧): exactly one yellow slot (saw ' + ls2.length + ')');
    await opened.close();
  }
  /* the prep screen after the hand-over */
  cur = label;
  const after = await pageText(page);
  check(/開きました/.test(after), 'prep: a green 「開きました」 line confirms the hand-over');
  // the chairman looks at the bottom bar, not at section 4: the bar must also say the screen is open (and that pressing again opens ANOTHER one)
  const barAfter = await page.evaluate(() => (document.querySelector('div.fixed')?.innerText ?? '').replace(/\s+/g, ' '));
  check(/(開きました|もう1つ|もう一度)/.test(barAfter), 'prep: after the hand-over the bottom bar still shows only 「保存しました」 and the same filled 「試合当日の画面を開く」 (' + short(barAfter, 100) + '); pressing it again after 2 seconds opens a SECOND match-day tab. Say 「✓ 開きました（別のタブ）。もう一度押すと、もう1つ開きます」');
  await ctx.close();
}

/** Extra audit: the helper that builds bouts for the chairman must not quietly pair the two classes */
async function suggestionScenario() {
  cur = 'suggest';
  console.log('--- 「おすすめ」 pairs fighters of different classes? ---');
  const ctx = await newCtx(false);
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=bout-flow-suggest-' + Date.now());
  await page.locator('#field-title').waitFor();
  await page.locator('#field-title').fill('第3回 架空テスト大会');
  await page.locator('#pick-file').setInputFiles({ name: '選手名簿.zip', mimeType: 'application/zip', buffer: ZIP });
  await settle(700);
  await page.getByRole('button', { name: '＋ 試合を追加', exact: true }).click();
  await page.locator('#bout-0-red').selectOption('F01');
  await page.locator('#bout-0-blue').selectOption('F04');
  await page.getByRole('button', { name: 'おすすめの組み合わせを自動で作る' }).click();
  await settle(400);
  const mix = await page.evaluate(() => [...document.querySelectorAll('article[id^="bout-"]')].map((a) => /クラスがちがいます/.test(a.innerText)));
  check(mix.length === 3, 'suggestion added 2 bouts to the 1 the chairman made (total ' + mix.length + ')');
  const cross = mix.slice(1).filter(Boolean).length;
  // F02(B,58kg) F03(B,55kg) are the only two B fighters; F05/F06 are A. Weight order 55B,58B,70A,71A pairs B-B and A-A, so this case is fine. Add the mixed case below.
  check(cross === 0, 'suggestion: same-class neighbours stay together when they exist (cross-class pairs: ' + cross + ')');
  await ctx.close();

  const ctx2 = await newCtx(false);
  const p2 = await ctx2.newPage();
  const MIXED = [HEAD, ['F01', '架空赤ジム', '架空赤選手', '中1', '13', '155', '55', '5勝', 'x', '', 'Aクラス'], ['F02', '架空青ジム', '架空青選手', '中1', '13', '155', '56', '初試合', 'x', '', 'Bクラス'], ['F03', '架空緑ジム', '架空緑選手', '中2', '14', '160', '60', '3勝0敗', 'x', '', 'Aクラス'], ['F04', '架空黄ジム', '架空黄選手', '中3', '15', '162', '61', '1勝', 'x', '', 'Bクラス']].map((r) => (Array.isArray(r) ? r.join(',') : r)).join('\n');
  await p2.goto(base + '/private/?event=bout-flow-suggest2-' + Date.now());
  await p2.locator('#field-title').waitFor();
  await p2.locator('#field-title').fill('第3回 架空テスト大会');
  await p2.locator('#pick-file').setInputFiles({ name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from(MIXED, 'utf8') });
  await settle(700);
  await p2.getByRole('button', { name: 'おすすめの組み合わせを自動で作る' }).click();
  await settle(300);
  // 2 A and 2 B fighters with alternating weights: a class-aware helper pairs A-A and B-B; a weight-only helper pairs 55A-56B and 60A-61B
  const made = await p2.evaluate(() => [...document.querySelectorAll('article[id^="bout-"]')].map((a) => /クラスがちがいます/.test(a.innerText)));
  check(made.length > 0 && made.every((m) => !m), 'suggestion with 2 A + 2 B fighters pairs A-A and B-B (cross-class bouts: ' + made.filter(Boolean).length + ' of ' + made.length + ')');
  const note = await p2.locator('#sec-3').innerText();
  check(made.every((m) => !m) || /クラス/.test(note.split('試合の一覧')[0]), 'if a suggested pair crosses classes, the suggestion note says so BEFORE the list (note: ' + short(note.split('試合の一覧')[0], 160) + ')');
  await ctx2.close();
}

/** The first typed letter of the title must not move the page under the chairman's hands, and the yellow must stay on the box he is typing in */
async function typingScenario(mobile) {
  const label = mobile ? '390' : '1280';
  cur = 'typing ' + label;
  console.log('--- typing the title at ' + label + ' ---');
  const ctx = await newCtx(mobile);
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=bout-flow-typing-' + label + '-' + Date.now());
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  // Safari has no scroll anchoring: switch it off so Chrome shows what Safari shows
  await page.addStyleTag({ content: '*{overflow-anchor:none !important}' });
  // 場所は「ページの中」ではかる（画面の上からの距離 + スクロール量）。入力欄が下の帯の下に隠れているとき、クリックが画面を動かすのは、ページが欄を動かしたのではない
  const top = () => page.evaluate(() => Math.round(document.getElementById('field-title').getBoundingClientRect().top + window.scrollY));
  const before = await top();
  await page.locator('#field-title').click();
  await page.keyboard.type('第', { delay: 60 });
  await settle(300);
  const after = await top();
  check(Math.abs(after - before) <= 40, 'typing ONE letter moved the title box from y=' + before + ' to y=' + after + ' (the 「次にすること」, 「コピーのファイル」 and 「申し込みページ」 boxes jump from below section 4 to above section 1 as soon as the title is non-empty; keep them in one place)');
  const slots = await slotInfo(page);
  check(slots.length === 1 && /大会の名前|大会名/.test(slots[0].text), 'typing ONE letter moved the yellow off the title box while the chairman is still typing (now: ' + short(slots.map((s) => s.text).join(' | '), 70) + ')');
  await ctx.close();
}

/** 「おすすめ」 gives 3 suggested bouts: the yellow must not say 保存 / 開く after the chairman has looked at only the first one */
async function reviewScenario() {
  cur = 'review';
  console.log('--- suggested bouts: one yellow press must not end the review of three ---');
  const H = HEAD;
  const rows = [['S1', '架空一ジム', '架空一', '中1', '13', '155', '55', '2勝', 'x', '', 'Bクラス'], ['S2', '架空二ジム', '架空二', '中1', '13', '155', '56', '1勝', 'x', '', 'Bクラス'], ['S3', '架空三ジム', '架空三', '中2', '14', '160', '58', '初試合', 'x', '', 'Bクラス'], ['S4', '架空四ジム', '架空四', '中2', '14', '160', '60', '0勝', 'x', '', 'Bクラス'], ['S5', '架空五ジム', '架空五', '高1', '16', '170', '70', '1勝', 'x', '', 'Bクラス'], ['S6', '架空六ジム', '架空六', '高1', '16', '170', '71', '2勝', 'x', '', 'Bクラス']];
  const csv = [H, ...rows.map((r) => r.join(','))].join('\n');
  const ctx = await newCtx(false);
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=bout-flow-review-' + Date.now());
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  await page.locator('#field-title').fill('第3回 架空テスト大会');
  await page.locator('#pick-file').setInputFiles({ name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await settle(700);
  await page.getByRole('button', { name: 'おすすめの組み合わせを自動で作る' }).click();
  await settle(400);
  const drafts = await page.evaluate(() => [...document.querySelectorAll('article[id^="bout-"]')].filter((a) => [...a.querySelectorAll('span,div')].some((e) => e.children.length === 0 && e.textContent.trim() === '案')).length);
  check(drafts === 3, 'review: 3 suggested bouts exist (saw ' + drafts + ')');
  const first = await slotInfo(page);
  check(first.length === 1 && /案/.test(first[0].text), 'review: after 「おすすめ」 the yellow asks to check the suggestions (' + short(first.map((s) => s.text).join(' | '), 60) + ')');
  await page.getByRole('button', { name: '1つ目の案を見る' }).click();
  await settle(500);
  const next = await slotInfo(page);
  const t = next[0]?.text ?? '';
  check(next.length === 1 && !/保存|当日の画面を開く/.test(t), 'review: after looking at ONE of 3 suggestions the yellow already says 「' + short(t, 40) + '」, so two suggestions can be saved unseen (the caution says 「使う前に、必ず1つずつ見る」). Keep the yellow on 「第2試合の案を見る」, then 「第3試合の案を見る」, then 保存');
  check(/2つ目の案を見る/.test(t), 'r2-135: after the first look the ONE yellow is 「2つ目の案を見る」 (' + short(t, 40) + ')');
  await page.getByRole('button', { name: '2つ目の案を見る', exact: true }).click();
  await settle(500);
  const third = (await slotInfo(page))[0]?.text ?? '';
  check(/3つ目の案を見る/.test(third) && !/保存|当日の画面を開く/.test(third), 'r2-135: after the second look the ONE yellow is 「3つ目の案を見る」 (' + short(third, 40) + ')');
  await page.getByRole('button', { name: '3つ目の案を見る', exact: true }).click();
  await settle(500);
  const last = await slotInfo(page);
  check(last.length === 1 && /保存/.test(last[0].text), 'r2-135: only after the third look does the yellow move on to 保存 (' + short(last.map((s) => s.text).join(' | '), 50) + ')');
  await ctx.close();
}

/** After saving a half-filled bout the bar says ✓ 保存済み: the 「保存」 row of section 4 must not still say 「○ まだ」 */
async function halfSaveScenario() {
  cur = 'half-save';
  console.log('--- saved a half bout: the 保存 row must agree with the bar ---');
  const ctx = await newCtx(false);
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=bout-flow-half-' + Date.now());
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  await page.locator('#field-title').fill('第3回 架空テスト大会');
  await page.locator('#pick-file').setInputFiles({ name: '選手名簿.zip', mimeType: 'application/zip', buffer: ZIP });
  await settle(700);
  await page.getByRole('button', { name: '＋ 試合を追加', exact: true }).click();
  await page.locator('#bout-0-red').selectOption('F01');
  await settle(300);
  await page.locator('div.fixed').getByRole('button', { name: /^保存する$/ }).first().click();
  await page.waitForFunction(() => /保存済み/.test(document.getElementById('save-state')?.innerText ?? ''), null, { timeout: 8000 }).catch(() => {});
  const row = await page.evaluate(() => [...document.querySelectorAll('#sec-4 li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()).find((x) => /^保存( |$)/.test(x)) ?? '');
  check(row !== '' && !/まだ/.test(row), 'half-save: the bar says 「保存済み」 but the section-4 row says 「' + row + '」 (a saved half bout is saved: show ✓ and keep the red 「直すところ」 for the empty blue corner)');
  await ctx.close();
}

/** (round 2) the yellow slot must be ON SCREEN right after a step is done: after the roster import, and after the second corner is chosen at a 150%-zoom laptop (910x512) */
async function onScreenScenario(label, w, h, mobile, steps) {
  cur = 'onscreen ' + label;
  console.log('--- the yellow stays on screen: ' + label + ' ---');
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await ctx.route('**/*', (route) => route.request().url().startsWith(base + '/') ? route.continue() : (externals.push({ scenario: cur, url: route.request().url() }), route.abort()));
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(base + '/private/?event=bout-flow-onscreen-' + label + '-' + Date.now());
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  await page.locator('#field-title').fill('第3回 架空テスト大会');
  await page.locator('#pick-file').setInputFiles({ name: '選手名簿.zip', mimeType: 'application/zip', buffer: ZIP });
  await settle(900);
  const seen = () => page.evaluate(() => {
    const s = [...document.querySelectorAll('[data-tos-next="1"]')].find((e) => e.getBoundingClientRect().width > 0);
    if (!s) return { found: false };
    const r = s.getBoundingClientRect(); const bar = s.closest('div.fixed');
    return { found: true, onScreen: bar ? true : (r.bottom > 0 && r.top < innerHeight), top: Math.round(r.top), text: s.innerText.replace(/\s+/g, ' ').slice(0, 40) };
  });
  if (steps.includes('import')) { const v = await seen(); check(v.found && v.onScreen, 'after the roster import the yellow 「' + (v.text ?? '') + '」 is at y=' + v.top + ' (screen height ' + h + '): scroll to it after the import, as is done after 「＋ 試合を追加」'); }
  if (steps.includes('bout')) {
    await page.getByRole('button', { name: '＋ 試合を追加', exact: true }).click(); await settle(300);
    await page.locator('#bout-0-red').selectOption('F01'); await page.locator('#bout-0-blue').selectOption('F04'); await settle(500);
    const v = await seen(); check(v.found && v.onScreen, 'after the 2nd corner the yellow 「' + (v.text ?? '') + '」 is at y=' + v.top + ' on a ' + w + 'x' + h + ' screen (the bottom bar fell into the page flow; it must stay fixed, only the step nav may flow)');
  }
  await ctx.close();
}

/** (round 2) 「おすすめ」 must not copy the rule / weight class of bout 1 onto the suggested bouts (a B-class pair would show the A rule on the match-day screen) */
async function ruleCopyScenario() {
  cur = 'rule-copy';
  console.log('--- おすすめ must not copy bout 1\'s rule to the suggested bouts ---');
  const ctx = await newCtx(false);
  const page = await ctx.newPage();
  await page.goto(base + '/private/?event=bout-flow-rule-' + Date.now());
  await page.locator('#field-title').waitFor({ timeout: 15000 });
  await page.locator('#field-title').fill('第3回 架空テスト大会');
  await page.locator('#pick-file').setInputFiles({ name: '選手名簿.zip', mimeType: 'application/zip', buffer: ZIP });
  await settle(700);
  await page.getByRole('button', { name: '＋ 試合を追加', exact: true }).click();
  await page.locator('#bout-0-red').selectOption('F01'); await page.locator('#bout-0-blue').selectOption('F04');
  await page.locator('#bout-0').getByText('ルール・体重の区分（なくてもOK）').click();
  await page.locator('#bout-0-rule').fill('首相撲あり・膝蹴りあり'); await page.locator('#bout-0-class').fill('55kg');
  await page.getByRole('button', { name: 'おすすめの組み合わせを自動で作る' }).click(); await settle(500);
  const copied = await page.evaluate(() => [...document.querySelectorAll('article[id^="bout-"]')].slice(1).map((a, i) => ({ n: i + 2, rule: a.querySelector('input[id$="-rule"]')?.value ?? '', cls: a.querySelector('input[id$="-class"]')?.value ?? '', warned: /まえの試合と同じ値/.test(a.innerText) })));
  const bad = copied.filter((c) => (c.rule || c.cls) && !c.warned);
  check(copied.length === 2 && bad.length === 0, 'おすすめ copied bout 1\'s rule/weight class into suggested bout(s) ' + bad.map((b) => b.n + ' (「' + b.rule + '」/「' + b.cls + '」)').join(', ') + ' with NO 「まえの試合と同じ値です」 note: a Bクラス pair then shows the Aクラス rule on the match-day screen. Leave rule and weight class empty for suggested bouts');
  await ctx.close();
}

try {
  if (!ONLY.length || ONLY.includes('onscreen')) {
    await onScreenScenario('pc-1280', 1280, 900, false, ['import', 'bout']);
    await onScreenScenario('zoom150-910x512', 910, 512, false, ['bout']);
    await onScreenScenario('phone-360x640', 360, 640, true, ['bout']);
  }
  if (!ONLY.length || ONLY.includes('rulecopy')) await ruleCopyScenario();
  if (!ONLY.length || ONLY.includes('typing')) { await typingScenario(false); await typingScenario(true); }
  if (!ONLY.length || ONLY.includes('review')) await reviewScenario();
  if (!ONLY.length || ONLY.includes('half')) await halfSaveScenario();
  if (!ONLY.length || ONLY.includes('1280')) await runWalk(false);
  if (!ONLY.length || ONLY.includes('390')) await runWalk(true);
  if (!ONLY.length || ONLY.includes('suggest')) await suggestionScenario();
} finally {
  await browser.close();
}

check(externals.length === 0, 'no request left 127.0.0.1 (' + short(externals.map((e) => e.url).join(', '), 160) + ')');
check(pageErrors.length === 0, 'no page error (' + short(pageErrors.map((e) => e.message).join(' | '), 160) + ')');
for (const n of notes) console.log('NOTE ' + n);
console.log('\n' + checks + ' checks, ' + failures.length + ' failed');
if (failures.length) { console.log('FAILURES:\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('PASS: the yellow path alone builds 3 bouts and opens the match-day screen.');
