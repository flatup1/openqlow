// Round-1 polish regression checks for the "live" area (match-day screen /private/live/).
// Each test names the finding id it guards. Everything here is local and uses fake data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { LocalBout, LocalFighter, LocalTournament } from '../core/privateTournament.ts';
import { MISSING_FIGHTER, NO_NAME, buildRow, displayName, isSamePerson, moveNotice, nowModel } from '../app/private/live/listLogic.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const F = (id: string, over: Partial<LocalFighter> = {}): LocalFighter => ({ id, gym: '架空ジム', name: '架空' + id, grade: '', age: '', height: '', weight: '60', record: '', comment: '', musicUrl: '', photoDataUrl: '', ...over });
const B = (id: string, redId: string, blueId: string): LocalBout => ({ id, redId, blueId, className: '', rule: '' });

/* ───────── r1-52: 1試合ずつの画面と一覧で、名前の言葉が同じ ───────── */
test('r1-52: displayName は、選手なし=選手未選択 / 名前が空・空白だけ=名前未入力', () => {
  assert.equal(displayName(undefined), MISSING_FIGHTER);
  assert.equal(displayName(F('a', { name: '' })), NO_NAME);
  assert.equal(displayName(F('a', { name: '   ' })), NO_NAME);
  assert.equal(displayName(F('a', { name: '　 ' })), NO_NAME);
  assert.equal(displayName(F('a', { name: ' 架空赤 ' })), '架空赤');
  assert.equal(NO_NAME, '名前未入力');
  assert.equal(MISSING_FIGHTER, '選手未選択');
});

test('r1-52: 一覧の行と「いま：」の帯も、同じ displayName を使う', () => {
  const data: Pick<LocalTournament, 'bouts' | 'fighters' | 'currentBout'> = { fighters: [F('r', { name: ' ' })], bouts: [B('b1', 'r', 'ghost')], currentBout: 0 };
  const row = buildRow(data.bouts[0], 0, new Map(data.fighters.map((f) => [f.id, f])), true, 0);
  assert.equal(row.red.name, NO_NAME);
  assert.equal(row.blue.name, MISSING_FIGHTER);
  assert.match(nowModel(data)!.text, new RegExp(NO_NAME + ' 対 ' + MISSING_FIGHTER));
});

test('r1-52: 1試合ずつの画面(page.tsx)に、古い言葉「選手未設定」が残っていない', () => {
  assert.ok(!read('app/private/live/page.tsx').includes('選手未設定'));
});

/* ───────── r1-82: 名前もジムも同じ人が、赤と青に入っている ───────── */
test('r1-82: isSamePerson は、番号がちがい・名前もジムも同じ（全角半角・空白のちがいは同じ）ときだけ true', () => {
  assert.equal(isSamePerson(F('F01', { name: '架空赤一', gym: '架空ジム' }), F('F04', { name: '架空赤一', gym: '架空ジム' })), true);
  assert.equal(isSamePerson(F('F01', { name: '架空 赤一', gym: 'ＡＢジム' }), F('F04', { name: '架空赤一', gym: 'ABジム' })), true);
  assert.equal(isSamePerson(F('F01'), F('F01')), false, '同じ番号は「同じ選手」(まちがい)で、別の赤い言葉がある');
  assert.equal(isSamePerson(F('F01', { name: '架空赤一', gym: 'A' }), F('F04', { name: '架空赤一', gym: 'B' })), false);
  assert.equal(isSamePerson(F('F01', { name: '' }), F('F04', { name: '' })), false);
  assert.equal(isSamePerson(undefined, F('F04')), false);
});

test('r1-82: buildRow の samePerson は、一覧の行に「同じ人かもしれません」を出す材料', () => {
  const fighters = [F('F01', { name: '架空赤一' }), F('F04', { name: '架空赤一' }), F('F02', { name: '架空青二' })];
  const byId = new Map(fighters.map((f) => [f.id, f]));
  assert.equal(buildRow(B('b', 'F04', 'F01'), 1, byId, true, 0).samePerson, true);
  assert.equal(buildRow(B('b', 'F01', 'F02'), 1, byId, true, 0).samePerson, false);
  assert.equal(buildRow(B('b', 'F01', 'F01'), 1, byId, true, 0).samePerson, false);
});

test('r1-82: 1試合ずつの画面と一覧に、⚠ の「同じ人かもしれません」の行がある', () => {
  assert.match(read('app/private/live/page.tsx'), /同じ人かもしれません：赤と青が、同じ名前・同じジムです/);
  assert.match(read('app/private/live/ListView.tsx'), /row\.samePerson/);
});

/* ───────── r1-53: 「右のボタン」ではなく、ボタンの名前で言う ───────── */
test('r1-53: moveNotice(list) は、ボタンの位置ではなく名前を言う（「右」「下」を言わない）', () => {
  const n = moveNotice('list', 39, 40);
  assert.ok(!/右|下|左|上/.test(n.text));
  assert.ok(n.text.includes('「' + n.undoLabel + '」'));
  assert.equal(n.undoLabel, '第40試合にもどす');
});

/* ───────── r1-81: 最後の試合の前に「全部おわりました」と言わない ───────── */
test('r1-81: 最後の試合の前に、緑の「全部おわりました」を出さない。中立の言葉に変える', () => {
  const page = read('app/private/live/page.tsx');
  assert.ok(!page.includes('全部おわりました') && !page.includes('これで全部終わりです'));
  assert.match(page, /🔒 <\/span>これが最後の試合です。押せません/);
  assert.ok(!/<OkLine/.test(page), 'live/page.tsx に緑の OkLine を使う場所がない');
});

/* ───────── r1-46 / r1-123: キーボードの位置が消えない ───────── */
test('r1-46 / r1-123: 前・次・もどす・この試合を開く・ページ切りかえは disabled ではなく aria-disabled', () => {
  const page = read('app/private/live/page.tsx');
  const list = read('app/private/live/ListView.tsx');
  assert.ok(!/<button[^>]*\sdisabled=/.test(page), 'page.tsx のボタンに disabled= がない');
  assert.ok(!/<button[^>]*\sdisabled=/.test(list), 'ListView.tsx のボタンに disabled= がない');
  assert.ok(/aria-label="次の試合 →" aria-disabled=/.test(page));
  assert.ok(/aria-label="← 前の試合" aria-disabled=/.test(page));
  assert.ok(list.includes('aria-disabled={saving || undefined}'));
  assert.ok(list.includes('aria-disabled={state.prevDisabled || undefined}') && list.includes('aria-disabled={state.nextDisabled || undefined}'));
});

/* ───────── r1-44 / r1-111: 「くっつく帯」を決める場所は1つ。もどすの案内は帯に入れない ───────── */
test('r1-111: 帯が position: sticky か static かを決めるのは globals.css の1か所と、測る .live-footer-flow だけ', () => {
  const css = read('app/globals.css');
  const page = read('app/private/live/page.tsx');
  assert.ok(!/@media \(max-height: 420px\)\s*\{\s*\.live-single-footer/.test(css), 'globals.css の古い static ルールがない');
  assert.ok(!/live-single-footer\{position:sticky/.test(page) && !page.includes('<style>'), 'page.tsx に、ぶつかる sticky ルールも <style> もない（規則は globals.css だけ）');
  assert.match(css, /\.live-single-footer\.live-footer-flow\s*\{\s*position:\s*static/);
  assert.match(page, /live-footer-flow/);
  assert.match(page, /innerHeight\*0\.4/);
});

test('r1-44: 「第N試合にもどす」の案内は、くっつく帯(<footer>)の外にある', () => {
  const page = read('app/private/live/page.tsx');
  const footer = page.slice(page.indexOf('<footer '), page.indexOf('</footer>'));
  assert.ok(footer.length > 100);
  assert.ok(!footer.includes('{undoBox}') && !footer.includes('{remoteBox}'));
  assert.ok(page.includes('<>{undoBox}{remoteBox}</>'));
});

/* ───────── r1-45: 1試合だけの大会 ───────── */
test('r1-45: 1試合だけの大会は、前・次のボタンも、黄色の「一覧」も、表示のしかたも出さない', () => {
  const page = read('app/private/live/page.tsx');
  assert.match(page, /const oneBout=data\.bouts\.length===1/);
  assert.match(page, /const yellowList=!list&&!!bout&&!retryDir&&isLast&&!oneBout/);
  assert.match(page, /const hideSwitcher=!list&&oneBout/);
  assert.ok(page.includes('この大会は1試合だけです'));
});

/* ───────── r1-48 / r1-49 / r1-50: 2人の画面の見やすさ ───────── */
test('r1-48: クラスは、色のついた帯の中にある（写真や下の帯の下に隠れない）', () => {
  const page = read('app/private/live/page.tsx');
  const band = page.slice(page.indexOf('{/* クラスは、色のついた帯の中に書く'));
  assert.ok(band.indexOf('{className}') > 0 && band.indexOf('{className}') < band.indexOf('<img'));
});

test('r1-49: 契約の数字と「契約」は、別々に折り返さない。まん中の列は広い', () => {
  const page = read('app/private/live/page.tsx');
  assert.match(page, /whitespace-nowrap">\{contract\.replace\(\/契約\$\/,''\)\}<\/span><wbr\/><span className="whitespace-nowrap">契約<\/span>/);
  assert.match(page, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,20rem\)_minmax\(0,1fr\)\]/);
});

test('r1-50 / r1-51: ルールは2人の上に大きな字で。意気込みは長い英数字でも折り返す', () => {
  const page = read('app/private/live/page.tsx');
  assert.match(page, /md:text-\[1\.75rem\]/);
  assert.match(page, /<b>意気込み<\/b><p className="mt-1 \[overflow-wrap:anywhere\]">/);
  assert.ok(page.indexOf('ルールは、2人の上に') < page.indexOf('<section className="live-sec mt-2 grid'));
});

/* ───────── r1-47: 失敗の知らせ ───────── */
test('r1-47: 保存の失敗は、赤い1行＋黄色の「もう一度押す」。わかった(閉じる)は「くわしく見る」の中', () => {
  const page = read('app/private/live/page.tsx');
  assert.match(page, /<details className="mt-1"><summary[^>]*>くわしく見る<\/summary>/);
  assert.match(page, /live-fail-more/);
  assert.match(read('app/globals.css'), /@media \(max-width: 400px\), \(max-height: 500px\) \{\s*\.live-fail-more \{\s*display: none;/);
});

/* ───────── r1-55 / r1-56 / r1-126 / r1-183 ───────── */
test('r1-55: ページ切りかえのボタンは、言葉の途中で折り返さない', () => {
  assert.match(read('app/private/live/ListView.tsx'), /const OUTLINE = '[^']*break-keep/);
});

test('r1-56: scroll-padding は、:has が使えない Safari のために JS からも入れる', () => {
  const list = read('app/private/live/ListView.tsx');
  assert.match(list, /root\.style\.scrollPaddingTop = /);
  assert.match(list, /removeProperty\('scroll-padding-top'\)/);
});

test('r1-126 / r1-183: 一覧のクラスの注意は、横いっぱい。紙には、画面だけの言葉を出さない', () => {
  const list = read('app/private/live/ListView.tsx');
  const page = read('app/private/live/page.tsx');
  assert.match(list, /live-list-noprint md:col-span-3 lg:col-span-4">クラスがちがう試合です/);
  assert.match(list, /live-list-noprint rounded-full bg-emerald-800/);
  assert.match(list, /live-list-noprint mt-1\.5"><MusicChip/);
  assert.match(page, /const savedBadge=<span className="live-list-noprint/);
  assert.match(list, /紙に出すとき：キーボードの Ctrl＋P（Macは ⌘＋P）を押します/);
});

/* ───────── r1-54 ───────── */
test('r1-54: 読み込み中・読めない・この大会がない画面にも、見出し(h1)がある', () => {
  const page = read('app/private/live/page.tsx');
  assert.match(page, /<h1 className="text-xl font-bold">このパソコンのデータを読んでいます…<\/h1>/);
  assert.match(page, /<h1 className="mb-3 text-xl font-black">試合当日の画面<\/h1>/);
});

/* ───────── r1-176: 対戦カードのクラスの注意（どのルールがちがうか・どうするか）と、クラスの見かた ───────── */
import { DEFAULT_CLASS_SETTINGS, classLegend, classMixMessage, shortRule } from '../core/classRules.ts';

test('r1-176: classMixMessage は、クラスがちがうときだけ。初期の設定なら、ルールを1行ずつ言う', () => {
  const a = F('a', { fighterClass: 'Aクラス' }), b = F('b', { fighterClass: 'Bクラス' });
  assert.equal(classMixMessage(a, a, DEFAULT_CLASS_SETTINGS), null);
  assert.equal(classMixMessage(a, F('c'), DEFAULT_CLASS_SETTINGS), null);
  const m = classMixMessage(a, b, DEFAULT_CLASS_SETTINGS)!;
  assert.equal(m.headline, 'クラスがちがいます：赤はAクラス、青はBクラスです。ルールがちがう2人です。おすすめは、同じクラスの2人に選び直すことです。');
  assert.deepEqual(m.rules, ['Aクラスのルール：首相撲あり／膝蹴りあり／蹴り足キャッチ', 'Bクラスのルール：パンチとキックのみ']);
});

test('r1-176: 設定が無い（名前が初期とちがう）ときは、名前だけ。ルールの行は出さない', () => {
  const m = classMixMessage(F('a', { fighterClass: '上級' }), F('b', { fighterClass: '初級' }), null)!;
  assert.deepEqual(m.rules, []);
  assert.match(m.headline, /^クラスがちがいます：赤は上級、青は初級です/);
});

test('r1-176: classLegend は「Aクラス＝3勝以上　Bクラス＝2勝以下（初出場も）。」。設定が変われば、その数と名前', () => {
  assert.equal(classLegend(DEFAULT_CLASS_SETTINGS), 'クラス：Aクラス＝3勝以上　Bクラス＝2勝以下（初出場も）。');
  assert.equal(classLegend({ ...DEFAULT_CLASS_SETTINGS, upperMinWins: 5, upper: { ...DEFAULT_CLASS_SETTINGS.upper, name: '上' }, lower: { ...DEFAULT_CLASS_SETTINGS.lower, name: '下' } }), 'クラス：上＝5勝以上　下＝4勝以下（初出場も）。');
  assert.equal(classLegend({ ...DEFAULT_CLASS_SETTINGS, upperMinWins: 1 }), 'クラス：Aクラス＝1勝以上　Bクラス＝0勝（初出場も）。');
  assert.equal(classLegend(null), '');
  assert.equal(classLegend({ ...DEFAULT_CLASS_SETTINGS, enabled: false }), '');
});

test('r1-176: shortRule は「（」の前まで。長い説明を、注意の文に入れない', () => {
  assert.equal(shortRule(DEFAULT_CLASS_SETTINGS.upper.rule), '首相撲あり／膝蹴りあり／蹴り足キャッチ');
  assert.equal(shortRule('パンチとキックのみ'), 'パンチとキックのみ');
  assert.equal(shortRule('（だけ）'), '（だけ）');
});

test('r1-176: 対戦カードの注意の文と、青を選び直すボタン・一覧の上の1行の見かた', () => {
  const cards = read('app/private/cards.tsx');
  const prep = read('app/private/page.tsx');
  assert.match(cards, /classMix\.headline/);
  assert.match(cards, /下の「ルール・体重の区分」の「ルール」に書きます。試合当日の画面に出ます/);
  assert.match(cards, /reselect\(blue, '青を選び直す'\)/);
  assert.match(prep, /classSettings=\{classSettings\}/);
  assert.match(prep, /classLegend\(classSettings\)/);
});

/* ───────── r1-184: 新しい画面（タブ）の言い方 ───────── */
test('r1-184: 準備画面の「新しい画面」の説明は、タブと言い、いまの画面は閉じなくてよいと言う。当日の画面は「準備画面が、もう1つ開く」と言う', () => {
  const prep = read('app/private/page.tsx');
  assert.match(prep, /新しい画面（ブラウザでは「タブ」と言います）が開きます。いまの画面は、閉じなくて大丈夫です。/);
  assert.match(prep, /ブラウザの一番上に並んだ名前の中から「試合の準備」を押します/);
  assert.match(read('app/private/live/page.tsx'), /準備画面が、もう1つ開きます。前から開いている準備画面は、閉じてください。/);
  assert.match(read('app/private/live/ListView.tsx'), /準備画面が、もう1つ開きます。前から開いている準備画面は、閉じてください。/);
});

/* ───────── r1-111: 準備画面の上のナビと下の帯も、2つで画面の半分をこえたら、くっつけない ───────── */
test('r1-111: 準備画面は、手順ナビと下の帯の高さを測って、半分をこえたら両方をくっつけない', () => {
  const prep = read('app/private/page.tsx');
  assert.match(prep, /const \[chromeFlow, setChromeFlow\] = useState\(false\)/);
  assert.match(prep, /\(navCounts \? barH \+ navH : barH\) > window\.innerHeight \* 0\.5/);
  assert.match(prep, /cls\(chromeFlow \? 'relative' : 'sticky top-0'/);
  assert.match(prep, /cls\(chromeFlow \? 'relative mt-4' : 'fixed inset-x-0 bottom-0'/);
});

/* ───────── r1-103 / r1-119: タブの名前 ───────── */
test('r1-103 / r1-119: 4つの画面のタブの名前は、日本語で、それぞれちがう', () => {
  const titles = ['app/private/layout.tsx', 'app/private/setup/layout.tsx', 'app/private/live/layout.tsx', 'app/private/entry/layout.tsx', 'app/private/google-setup/layout.tsx'].map((p) => (read(p).match(/title: '([^']+)'/) ?? [])[1]);
  assert.deepEqual(titles, ['試合の準備', '選手の受付をつくる', '試合当日の画面', '選手エントリーシート', 'Google受付をつなぐ']);
  assert.equal(new Set(titles).size, titles.length);
  assert.ok(!titles.includes('Tournament OS'));
});

/* ───────── r1-138: 本物の CSP で画面の確認を動かす ───────── */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { headersFor, parseHeadersFile } from '../scripts/serve-with-headers.mjs';

test('r1-138: serve-with-headers の _headers の読み方（道すじの * と、字下げの見出し）', () => {
  const blocks = parseHeadersFile('/private/\n  Content-Security-Policy: default-src \'self\'\n  X-Frame-Options: DENY\n\n/private/live/*\n  Content-Security-Policy: connect-src \'self\'\n# comment\n/apply/*\n  Referrer-Policy: no-referrer\n');
  assert.equal(blocks.length, 3);
  assert.deepEqual(headersFor(blocks, '/private/'), [['Content-Security-Policy', "default-src 'self'"], ['X-Frame-Options', 'DENY']]);
  assert.deepEqual(headersFor(blocks, '/private/live/'), [['Content-Security-Policy', "connect-src 'self'"]]);
  assert.deepEqual(headersFor(blocks, '/apply/x'), [['Referrer-Policy', 'no-referrer']]);
  assert.deepEqual(headersFor(blocks, '/other/'), []);
});

test('r1-138: serve-with-headers は、本物の _headers を、/private/live/ にも index.html にも付ける。外には出ない（127.0.0.1）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tos-serve-'));
  mkdirSync(join(dir, 'private', 'live'), { recursive: true });
  writeFileSync(join(dir, 'private', 'live', 'index.html'), '<!doctype html><title>x</title>');
  writeFileSync(join(dir, '_headers'), read('public/_headers'));
  const port: number = await new Promise((resolve) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); }); });
  const child = spawn(process.execPath, [join(ROOT, 'scripts/serve-with-headers.mjs'), dir, String(port)], { stdio: 'ignore' });
  try {
    let res: Response | null = null;
    for (let i = 0; i < 40 && !res; i++) { try { res = await fetch('http://127.0.0.1:' + port + '/private/live/'); } catch { await new Promise((r) => setTimeout(r, 100)); } }
    assert.ok(res && res.status === 200);
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(csp, /connect-src 'self'/);
    assert.match(csp, /form-action 'none'/);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
    const viaIndex = await fetch('http://127.0.0.1:' + port + '/private/live/index.html');
    assert.equal(viaIndex.headers.get('content-security-policy'), csp);
    const redirected = await fetch('http://127.0.0.1:' + port + '/private/live', { redirect: 'manual' });
    assert.equal(redirected.status, 301);
    assert.equal((await fetch('http://127.0.0.1:' + port + '/../../etc/passwd')).status === 200, false);
  } finally { child.kill(); }
});

test('r1-138: verify-private-all.sh は、ふだんは _headers つきのサーバーで動かす（python3 は、TOS_PLAIN_SERVER=1 のときだけ）', () => {
  const sh = read('scripts/verify-private-all.sh');
  assert.match(sh, /node scripts\/serve-with-headers\.mjs out-private-pages "\$PORT"/);
  assert.match(sh, /TOS_PLAIN_SERVER:-0\}" = "1"/);
});

test('r1-138: コミットしてはいけない手元のフォルダは、無視する。public/_headers は追跡しているので、無視しない', () => {
  const inner = read('.gitignore');
  const outer = readFileSync(join(ROOT, '..', '.gitignore'), 'utf8');
  assert.match(outer, /^next-stale-cache\*\/$/m);
  assert.match(inner, /^bd-\*\/$/m);
  assert.match(inner, /^audit\/$/m);
  assert.ok(!/^public\/_headers\s*$/m.test(inner), 'public/_headers を無視する行がない');
});
