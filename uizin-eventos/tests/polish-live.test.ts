// Round-1 and round-2 (r2-NN, at the end of the file) polish regression checks for the "live" area (match-day screen /private/live/).
// Each test names the finding id it guards. Everything here is local and uses fake data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { LocalBout, LocalFighter, LocalTournament } from '../core/privateTournament.ts';
import { LAST_BOUT_LIST_NOTE, MISSING_FIGHTER, NO_NAME, NO_TITLE, OFFLINE_NOTE, PREP_LINK_NOTE, REOPEN_NOTE, buildRow, displayName, filterNote, isHeldKeyRepeat, isSamePerson, liveMusicOn, moveNotice, musicLabel, nowModel, saveFailNotice } from '../app/private/live/listLogic.ts';

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
  assert.match(page, /FOOT_FLOW_SHARE = 0\.4/);
  assert.match(page, /innerHeight\*FOOT_FLOW_SHARE/);
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
  // 最後の試合では押すものがないので、黄色はどこにも付けない（r2-50: 「一覧」と「1試合ずつ」が黄色を押し付け合わない）
  assert.match(page, /retryDir\?\?\(isLast\?null:'next'\)/);
  assert.ok(!page.includes('yellowList'), '「一覧」ボタンに黄色を付ける古い決め方は、もうない');
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
  assert.equal(m.headline, 'クラスがちがいます：赤はAクラス、青はBクラスです。ルールがちがうので、ふつうは同じクラスの人と戦います。');
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
  assert.match(cards, /このまま戦ってもかまいません。そのときは、主催者のあなたが、どちらのルールにするか決めて、「ルール」の欄に書きます。/);
  assert.match(cards, /ルールを書く欄をひらく/, 'r2-161: ルールの欄は閉じているので、ひらくボタンを付ける');
  assert.match(cards, /reselect\(blue, '青を選び直す'\)/);
  assert.match(prep, /classSettings=\{classSettings\}/);
  assert.match(prep, /classLegend\(classSettings\)/);
});

/* ───────── r1-184: 新しい画面（タブ）の言い方 ───────── */
test('r1-184: 準備画面の「新しい画面」の説明は、タブと言い、いまの画面は閉じなくてよいと言う。当日の画面は「この画面が準備画面に変わる」と言う', () => {
  const prep = read('app/private/page.tsx');
  assert.match(prep, /新しい画面（ブラウザでは「タブ」と言います）が開きます。いまの画面は、閉じなくて大丈夫です。/);
  assert.match(prep, /ブラウザの一番上に並んだ名前の中から「試合の準備」を押します/);
  // r2-56: 当日の画面の「準備画面へ戻る」は同じタブで開く（この画面が準備画面に変わる）。言葉もその通りに（以前の「もう1つ開きます」は うそだった）
  const note = read('app/private/live/listLogic.ts');
  assert.match(note, /PREP_LINK_NOTE = 'この画面は、準備画面に変わります。もとの準備画面が開いたままなら、閉じてください。ここにもどるには、準備画面の「試合当日の画面を開く」を押します。'/);
  assert.ok(!/準備画面が、もう1つ開きます/.test(note + read('app/private/live/page.tsx') + read('app/private/live/ListView.tsx')));
  assert.ok(read('app/private/live/page.tsx').includes('{PREP_LINK_NOTE}') && read('app/private/live/ListView.tsx').includes('{PREP_LINK_NOTE}'));
});

/* ───────── r1-111: 準備画面の上のナビと下の帯も、2つで画面の半分をこえたら、くっつけない ───────── */
test('r1-111: 準備画面は、手順ナビと下の帯の高さを測って、半分をこえたら両方をくっつけない', () => {
  const prep = read('app/private/page.tsx');
  assert.match(prep, /const \[chromeFlow, setChromeFlow\] = useState\(false\)/);
  // r2-151: 手順ナビだけ流す。下の帯は、いつも画面の下にくっつける（黄色の「次はここ」と保存ボタンの置き場）
  // r2-133: 割合は、試合当日の画面の下の帯（FOOT_FLOW_SHARE = 0.4）と同じ 4割。流すのは手順ナビだけ
  assert.match(prep, /navCounts && barH \+ navH > window\.innerHeight \* 0\.4/);
  assert.match(prep, /cls\(chromeFlow \? 'relative' : 'sticky top-0'/);
  assert.match(prep, /cls\('fixed inset-x-0 bottom-0 z-40/);
  assert.doesNotMatch(prep, /chromeFlow \? 'relative mt-4'/, '下の帯は、ページの流れに落とさない');
});

/* ───────── r1-103 / r1-119: タブの名前 ───────── */
test('r1-103 / r1-119: 4つの画面のタブの名前は、日本語で、それぞれちがう', () => {
  const titles = ['app/private/layout.tsx', 'app/private/setup/layout.tsx', 'app/private/live/layout.tsx', 'app/private/entry/layout.tsx'].map((p) => (read(p).match(/title: '([^']+)'/) ?? [])[1]);
  assert.deepEqual(titles, ['試合の準備', '選手の受付をつくる', '試合当日の画面', '選手エントリーシート']);
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

/* ═══════════════ ROUND 2 (r2-NN): 試合当日の画面 ═══════════════ */
const livePage = () => read('app/private/live/page.tsx');
const listView = () => read('app/private/live/ListView.tsx');
const css = () => read('app/globals.css');

test('r2-45: 押しっぱなしのキー（Enter / Space）の連打は、ボタンの上で捨てる（何試合も進まない）', () => {
  assert.equal(isHeldKeyRepeat({ repeat: true, key: 'Enter' }), true);
  assert.equal(isHeldKeyRepeat({ repeat: true, key: ' ' }), true);
  assert.equal(isHeldKeyRepeat({ repeat: false, key: 'Enter' }), false, '1回目の押下は通す');
  assert.equal(isHeldKeyRepeat({ repeat: true, key: 'a' }), false, '文字入力は止めない');
  const page = livePage();
  assert.match(page, /const dropHeldKey=\(event:KeyboardEvent<HTMLElement>\)=>\{if\(isHeldKeyRepeat\(event\)&&\(event\.target as HTMLElement\)\.closest\('button'\)\)event\.preventDefault\(\);\}/);
  assert.match(page, /<main onKeyDown=\{dropHeldKey\}/, '前・次・もどすのボタンを含む画面ぜんたいで捨てる');
});

test('r2-46: 下の帯が入場曲のリンクをかくさない（css と JavaScript の両方で scroll-padding-bottom）', () => {
  assert.match(css(), /html:has\(\.live-single-footer\)\s*\{\s*scroll-padding-bottom:\s*calc\(var\(--live-foot-h,\s*9rem\)\s*\+\s*0\.75rem\)/);
  const page = livePage();
  assert.match(page, /root\.style\.setProperty\('--live-foot-h'/);
  assert.match(page, /root\.style\.scrollPaddingBottom=/, ':has が使えない Safari 15.0〜15.3 のために、JavaScript からも入れる');
  assert.match(page, /root\.style\.removeProperty\('scroll-padding-bottom'\)/, '画面を出るときに戻す');
});

test('r2-47 / r2-98: スマホを横にしたとき、上の帯は縮められる・折り返せる（横にはみ出さない）', () => {
  const block = css().slice(css().indexOf('@media (max-height: 500px) and (min-width: 700px)'));
  const rule = block.slice(block.indexOf('.live-top > div'), block.indexOf('}', block.indexOf('.live-top > div'))).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(rule, /flex:\s*0 1 auto/);
  assert.match(rule, /min-width:\s*0/);
  assert.match(rule, /max-width:\s*100%/);
  assert.ok(!/flex:\s*none/.test(rule), 'flex:none は使わない');
  assert.match(livePage(), /lg:w-\[34rem\] lg:max-w-full/, '黄色の枠の幅は、画面より広くならない');
});

test('r2-48: 読み込み中の画面に data-tos-loading がある。動かないときの「そのまま待つ」は、動き出してから出す', () => {
  const page = livePage();
  const loading = page.slice(page.indexOf('if(!loaded)'), page.indexOf('if(!data)'));
  assert.match(loading, /<main data-tos-loading="1"/);
  assert.match(loading, /mounted\s*\?\s*<Caution title="そのまま待つ"/, 'JavaScript が動かないとき（r2-109）は、うその「待つ」を出さない');
  assert.match(read('app/layout.tsx'), /querySelector\('\[data-tos-loading\]'\)/, '10秒の見張りが、この目印を探す');
});

test('r2-49: 一覧で保存に失敗したとき、赤い箱の下に「もう一度押す」が隠れない', () => {
  const page = livePage();
  assert.match(page, /document\.getElementById\('live-list-row-'\+failedRow\)/);
  assert.match(page, /target\?\.scrollIntoView\(\{block:'nearest'\}\)/);
  assert.match(page, /root\.style\.scrollPaddingBottom=h\+'px'/);
  assert.match(page, /style=\{listToast&&toastH\?\{paddingBottom:toastH\}:undefined\}/);
});

test('r2-50: 最後の試合では、「一覧」にも「1試合ずつ」にも黄色を付けない（行ったり来たりしない）', () => {
  const page = livePage(), list = listView();
  assert.match(page, /const yellowSlot:'prev'\|'next'\|null=!bout\?null:retryDir\?\?\(isLast\?null:'next'\)/);
  assert.match(page, /viewBtn\('list','一覧',false,''\)/, '「一覧」ボタンは、いつも黄色なし');
  assert.match(list, /const atLast = data\.currentBout >= total - 1;/);
  assert.match(list, /const wantSingle = !retryHere && !filtered && nowOnPage && !atLast;/);
  assert.match(list, /atLast \? LAST_BOUT_LIST_NOTE/);
  assert.equal(LAST_BOUT_LIST_NOTE, 'いまは最後の試合です。進める試合は、もうありません。');
});

test('r2-51: 名前が空の選手は、一覧でも赤い行（1試合ずつの画面と同じ）', () => {
  const byId = new Map([['a', F('a', { name: '  ' })], ['b', F('b')]]);
  const row = buildRow(B('x', 'a', 'b'), 0, byId, false, 0);
  assert.equal(row.red.noName, true);
  assert.equal(row.red.name, NO_NAME);
  assert.equal(row.blue.noName, false);
  assert.match(listView(), /corner\.noName \? <ErrorLine className="mt-1\.5">名前が入っていません。準備画面で入れてください<\/ErrorLine>/);
});

test('r2-52: 写真がある人もない人も、写真の箱は同じ高さ（2人の名前が同じ高さにならぶ）', () => {
  const page = livePage();
  assert.equal((page.match(/live-photo relative h-\[clamp\(72px,calc\(100vh-760px\),420px\)\]/g) ?? []).length, 1, '箱は1つの部品で、高さの決め方は1つだけ');
  assert.ok(!/h-\[72px\]|h-\[clamp\(64px/.test(page), '写真なしだけ72px・写真ありは64px、という食いちがいがない');
});

test('r2-53: 1600px以上の広い画面（TV）では、字を大きくする', () => {
  const page = livePage(), list = listView();
  for (const needle of ['min-[1600px]:text-[32px]', 'min-[1600px]:text-[28px]', 'min-[1600px]:text-[22px]', 'min-[1600px]:text-[clamp(3.5rem,3.6vw,5rem)]']) assert.ok(page.includes(needle), needle);
  assert.ok(list.includes('min-[1600px]:text-[32px]'), '一覧の赤・青の帯も大きくする');
});

test('r2-54: 一覧のルールは、2人の下の横いっぱいの行。「／」のうしろで折り返す', () => {
  const list = listView();
  assert.match(list, /ルール：<WithBreaks text=\{row\.rule\} \/>/);
  assert.match(list, /text-\[18px\][^"]*md:col-span-3 lg:col-span-4">ルール：/);
  assert.ok(!/<p className="[^"]*">\{row\.rule\}<\/p>/.test(list), 'まん中の細い列には、もうルールを置かない');
});

test('r2-55: 「もどす」の大きい箱が小さい1行に変わっても、その場所の高さを残す（名前が動かない）', () => {
  const page = livePage();
  assert.match(page, /const UNDO_MIN_CAP = 72;/);
  assert.match(page, /style=\{\{minHeight:Math\.min\(undoBigH\.current,UNDO_MIN_CAP\)\|\|undefined\}\}/);
});

test('r2-56: 「準備画面へ戻る」の言葉は、同じタブで開くことと、もどり方を言う。「準備の画面」とは書かない', () => {
  assert.match(PREP_LINK_NOTE, /^この画面は、準備画面に変わります。/);
  assert.match(PREP_LINK_NOTE, /準備画面の「試合当日の画面を開く」を押します。$/);
  assert.ok(!/<a [^>]*target=/.test(livePage().slice(livePage().indexOf('const prepLink'), livePage().indexOf('const viewBtn'))), 'target を付けない＝同じタブ');
  for (const text of [read('app/private/live/listLogic.ts'), livePage(), listView()]) assert.ok(!/準備の画面|もう1つ開きます/.test(text));
});

test('r2-57: 言葉の食いちがい（入場曲なし・半角の空白・大会名が空）', () => {
  assert.equal(musicLabel('none'), '⚠ この選手は入場曲なし（曲を用意）');
  assert.ok(!/⚠ 入場曲なし/.test(read('app/private/live/listLogic.ts')), '選手ごとの言葉に、大会ぜんたいと同じ言い方を使わない');
  assert.equal(NO_TITLE, '大会名未設定');
  assert.match(livePage(), /data\.title\.trim\(\)\|\|NO_TITLE/);
  assert.ok(!/曲が まだ/.test(listView()), '半角の空白がない');
  assert.match(listView(), /曲がまだの人が出る試合だけです。/);
  assert.equal(filterNote(2, 5), '一部の試合だけ表示中です（5試合中 2試合）。');
  // 読めない画面: 黄色の「次はここ」は、①と食いちがう「もう一度ひらく」ではなく「準備画面へ戻る」
  const page = livePage();
  assert.match(page, /<NextSlot active label=\{readFailed\?'①をしてもだめなとき：準備画面へ':'準備画面へ戻る'\} className="mt-4"><a href=\{back\}/);
});

test('r2-89: 1つの知らせの中で、「です・ます」と、言い切りの命令（押す。直す。）を混ぜない', () => {
  const messages: string[] = [
    moveNotice('list', 0, 3).text, moveNotice('next', 0, 1).text, moveNotice('prev', 1, 0).text,
    ...(['next', 'prev', 'list', 'undo'] as const).flatMap((via) => { const n = saveFailNotice(via, 2); return [n.text, n.more, n.tip]; }),
  ];
  for (const message of messages) {
    const sentences = message.split('。').filter(Boolean);
    const polite = sentences.some((x) => /(です|ます|ません)$/.test(x));
    const bare = sentences.filter((x) => /(押す|入れる|選ぶ|直す|確かめる|閉じて、もう一度押す)$/.test(x));
    assert.ok(!(polite && bare.length), '言い切りの命令が混ざっている：' + message);
    assert.ok(!bare.length, 'ていねいな言い方にする：' + message);
  }
  for (const source of [livePage(), listView()]) assert.ok(!/準備画面で(選ぶ|入れる|直す|確かめる)</.test(source), '赤い一行は「〜してください」で終える');
  assert.equal(moveNotice('list', 0, 3).text, '第4試合に変えました。まちがえたら「第1試合にもどす」を押してください。');
});

test('r2-97: 見るだけの「行く」のあと、キーボードの位置は見出し。状態を変えるボタンには置かない', () => {
  const list = listView();
  assert.match(list, /row\.querySelector<HTMLElement>\('h3'\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.ok(!/querySelector<HTMLElement>\('button\.live-list-open'\)\?\.focus|\.live-list-open'\)\?\.focus/.test(list), '「この試合を開く」へ移さない');
  assert.match(list, /id=\{titleId\} tabIndex=\{-1\}/, '見出しは tabIndex=-1 で、フォーカスを受けられる');
});

test('r2-100: 読み上げの箱（role="status"）の中は変わらない文だけ。残りの秒数は箱の外', () => {
  const page = livePage();
  const big = page.slice(page.indexOf('<div ref={undoBigRef}'), page.indexOf('<button type="button" aria-disabled={saving||undefined} onClick={undoPress} style'));
  const status = big.slice(big.indexOf('<p role="status"'), big.indexOf('</p>', big.indexOf('<p role="status"')));
  assert.ok(status.includes('{moved.text}') && !/あと\{left\}秒/.test(status), '箱の中に秒数がない');
  assert.match(big, /<span aria-hidden="true" className="font-black">（あと\{left\}秒）<\/span>/);
  assert.ok(!/<div ref=\{undoBigRef\} role="status"/.test(page), '大きい箱ぜんたいに role を付けない');
});

test('r2-103: 紙に出すとき、赤・青の帯の色を消さない（print-color-adjust: exact）。1試合ずつも一覧も同じ', () => {
  assert.match(css(), /\.live-corner-band\s*\{\s*-webkit-print-color-adjust:\s*exact;\s*print-color-adjust:\s*exact;/);
  assert.ok(livePage().includes('live-band live-corner-band'));
  assert.ok(listView().includes("live-corner-band px-3"));
});

test('r2-105: 見かたのボタンは、言葉の途中で折り返さない', () => {
  const page = livePage();
  assert.match(page, /const pick=\(mode:LiveView\)=>'[^']*whitespace-nowrap[^']*'/);
  assert.match(page, /max-\[359px\]:basis-full/, '359px以下では、2つのボタンを1つずつ横いっぱいに並べる');
});

test('r2-106: スマホを横にしたとき（高さ500px以下）は、赤と青を左右にならべる', () => {
  const c = css();
  const i = c.indexOf('@media (max-height: 500px) and (min-width: 560px) and (max-width: 767px)');
  assert.ok(i > 0);
  const block = c.slice(i, c.indexOf('\n}\n', c.indexOf('.live-sec > :nth-child(2)', i)) + 3);
  assert.match(block, /\.live-sec\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(block, /\.live-sec > :nth-child\(2\)\s*\{\s*order:\s*3;\s*grid-column:\s*1 \/ -1/, 'VS・契約は、2人の下の細い1行');
});

test('r2-109: JavaScript が動かないとき、「そのまま待つ」と言わない。やることは「オンにする」が先', () => {
  assert.match(livePage(), /mounted \? <Caution title="そのまま待つ"/);
  const layout = read('app/layout.tsx');
  const noscript = layout.slice(layout.indexOf('<noscript>'), layout.indexOf('</noscript>'));
  assert.ok(noscript.indexOf('「オン」にして') > 0 && noscript.indexOf('「オン」にして') < noscript.indexOf('Chrome'), '先に「オン」。ブラウザを変えるのは、そのあと');
});

test('r2-110: 準備画面の上のナビと下の帯も、画面の4割をこえたら くっつけない（当日の画面と同じ割合）', () => {
  const prep = read('app/private/page.tsx');
  assert.match(prep, /barH \+ navH > window\.innerHeight \* 0\.4/);
  assert.match(livePage(), /FOOT_FLOW_SHARE = 0\.4/);
});

test('r2-112: 当日の画面は、「閉じても大丈夫」と言わない。ネットが弱い・切れているときの注意を出す', () => {
  const page = livePage();
  assert.ok(!page.includes('閉じても大丈夫'));
  assert.ok(page.includes('押すたびに保存されます。ネットが弱いときは、閉じないでください'));
  assert.match(page, /navigator\.onLine!==false/);
  assert.match(page, /\{online\?null:<Caution title="ネットがつながっていません"/);
  assert.match(OFFLINE_NOTE, /閉じないでください。閉じると、ネットがないと開き直せません。/);
  assert.match(REOPEN_NOTE, /開き直すには、ネットが必要です。/);
  assert.ok(!/serviceWorker/.test(read('app/layout.tsx') + page), 'ネットなしで開き直せる仕組みは、ない。だから正直に書く');
});

test('r2-120: 古い公開コマンド（go-live）は、確認なしで全部を送らないよう、最初に止める', () => {
  for (const file of ['scripts/go-live.sh', 'scripts/go-live-tournament.sh']) {
    const text = read(file);
    const exitAt = text.indexOf('\nexit 1\n');
    assert.ok(exitAt > 0, file + ' が最初に exit 1 する');
    const deployAt = text.indexOf('pages deploy');
    assert.ok(deployAt === -1 || deployAt > exitAt, file + ' の公開の命令は、exit 1 のあと（動かない）');
    assert.match(text.slice(0, exitAt), /npm run deploy:private/, '代わりのコマンドを言う');
  }
});

test('r2-123: 入場曲を使うかの初期値は、準備画面と当日の画面で同じ（受付の設定がなければ「使わない」）', () => {
  assert.equal(liveMusicOn({}), false);
  assert.equal(liveMusicOn({ entryConfig: null }), false);
  assert.equal(liveMusicOn({ entryConfig: { music: true } }), true);
  assert.equal(liveMusicOn({ entryConfig: { music: false } }), false);
  assert.match(read('app/private/page.tsx'), /const entryConfig: EntryFormConfig = data\.entryConfig \?\? DEFAULT_ENTRY_CONFIG;/);
  assert.match(read('core/entryPackage.ts'), /DEFAULT_ENTRY_CONFIG: EntryFormConfig = \{ music: false,/);
  assert.match(livePage(), /liveMusicOn\(data\)/);
  assert.match(listView(), /liveMusicOn\(data\)/);
  assert.ok(!/entryConfig\?\.music \?\? true/.test(livePage() + listView()), '「?? true」は、もう使わない');
});
