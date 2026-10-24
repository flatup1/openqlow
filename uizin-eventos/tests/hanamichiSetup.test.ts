// 花道の追加情報：設定の画面（/private/setup/）と、A（Googleの受付）・B（申し込みページ）・C のつなぎ目。
// 実名は使わない（『架空花道一郎』など）。「なし」のときの動きは tests/hanamichiGolden.test.ts・tests/hanamichiLink.test.ts が固定している。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, script } from './helpers/gasV3Harness.ts';
import { HANAMICHI_BAD_MESSAGE, HANAMICHI_ITEMS, HANAMICHI_KEYS, HANAMICHI_MISSING_MESSAGE, HANAMICHI_SHEET_HEADERS } from '../core/hanamichi.ts';
import { isAppsScriptUrl, publicEntryConfig, publicEntryHash, publicEntryLinkCut, publicEntryReady } from '../core/publicEntry.ts';
import { ACCEPTED_RECEPTION_BUILDS, diagnose, entryConfigFromPing, EXPECTED_RECEPTION_BUILD, parsePing, settingLines, supportsHanamichi, supportsWeightClasses, type Ping } from '../core/setupV3.ts';

const read = (path: string): string => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const PAGE = read('app/private/setup/page.tsx');
const APPLY = read('app/apply/page.tsx');
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxFAKE0123456789_-/exec';
const ROW = '花道の追加情報';
const ON = { 階級分け: 'あり', [ROW]: 'あり' };
type H = ReturnType<typeof harness>;
const pingOf = (h: H) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
const live = (over: Record<string, string> = {}) => { const h = harness(); h.ready(over); h.call('openEntries'); return h; };
/** 設定の画面が読む ping（本物の .gs が返したもの）から、選手に渡す申し込みページのリンク（# のあと）を作る */
const hashOf = (h: H): string => publicEntryHash(entryConfigFromPing(parsePing(pingOf(h)), ENDPOINT, 'live'));

/* ───────── 本物の Google の受付 → 設定の画面 → リンク → 申し込みページ（鎖） ───────── */

test('鎖: 「あり」→ ping の hanamichiMode → リンクの hn=on → 申し込みページが読む hanamichi。リンクは切れていない。個人情報・項目名は、どこにも出ない', () => {
  const h = live(ON);
  const body = pingOf(h);
  assert.equal(body.hanamichiMode, true);
  const hash = hashOf(h);
  assert.ok(/(^|&)hn=on(&|$)/.test(hash.replace(/^#/, '')), 'リンクに hn=on がある');
  assert.ok(/&hn=on&protocol=3&mode=live&end=1$/.test(hash), '階級・ロゴのあと、protocol のまえ。うしろは protocol・mode・end（切れたら分かる）');
  assert.equal(publicEntryLinkCut(hash), false);
  assert.equal(publicEntryReady(publicEntryConfig(hash)), true);
  assert.equal(publicEntryConfig(hash).hanamichi, true);
  const pingText = JSON.stringify(body).replace('"hanamichiMode":true', '');
  for (const word of ['hanamichi', '花道プロフィール', '生年月日', 'リングネーム', 'hnBirth', 'hnJob']) assert.ok(!decodeURIComponent(hash).includes(word) && !pingText.includes(word), word + ' はリンクにも ping にも出ない（ping の印の名前は除く）');
});

test('鎖: 「なし」（初期値）→ ping に鍵が無い → リンクに hn が無い → 申し込みページは何も聞かない。今までと同じ', () => {
  const off = live({ 階級分け: 'あり' });
  assert.equal('hanamichiMode' in pingOf(off), false);
  const hash = hashOf(off);
  assert.ok(!/(^|&)hn=/.test(hash.replace(/^#/, '')) && !hash.includes('hanamichi'));
  assert.equal(publicEntryLinkCut(hash), false);
  assert.equal(publicEntryConfig(hash).hanamichi, undefined);
  // 花道の区分がシートにあっても、「なし」なら聞かない
  assert.ok(pingOf(off).weights.divisions.some((d: any) => /花道/.test(d.name)));
});

test('鎖: 古い版（3.20261019.6）のシートは、ping に印が無いので、リンクに hn が付かない。それでも設定の画面は「受付できます」と言う（止めない）', () => {
  const h = live(ON);
  const body = { ...pingOf(h), build: '3.20261019.6' };
  delete body.hanamichiMode;
  const ping = parsePing(body);
  assert.equal(diagnose(ping).ok, true);
  assert.equal(supportsHanamichi(ping), false); assert.equal(supportsWeightClasses(ping), true, '階級分けには対応している（古い版と言われない）');
  const hash = publicEntryHash(entryConfigFromPing(ping, ENDPOINT, 'live'));
  assert.ok(!/(^|&)hn=/.test(hash.replace(/^#/, '')));
  // 偽の印（古い版が hanamichiMode を返すことは無い）があっても、リンクには付かない
  const forged = parsePing({ ...body, hanamichiMode: true });
  assert.ok(!/(^|&)hn=/.test(publicEntryHash(entryConfigFromPing(forged, ENDPOINT, 'live')).replace(/^#/, '')));
});

test('鎖: 設定の直しもの（「あり」なのに花道の区分が無い）→ 設定の画面は赤い「設定の直しもの」。場所は A列が「花道の追加情報」の行のB列（セルの番号は言わない）。リンクは出ない', () => {
  const h = live(ON);
  h.setSetting('階級分け', 'なし');
  const body = pingOf(h);
  assert.equal('hanamichiMode' in body, false, '直しものがあるあいだは、印を出さない');
  assert.ok(body.settingsProblem.includes('花道の追加情報'));
  const d = diagnose(parsePing(body));
  assert.equal(d.stage, 'bad-settings'); assert.equal(d.ok, false);
  const lines = settingLines(d.message);
  assert.equal(lines.length, 1, '1文');
  assert.ok(lines[0].fixes[0].includes('A列が「花道の追加情報」の行のB列'), lines[0].fixes[0]);
  assert.ok(!/B30|セル|\bB\d{1,2}\b/.test(lines[0].fixes[0]), 'セルの番号は言わない（区分の行を増やすと動くため）');
});

/* ───────── 設定の画面（app/private/setup/page.tsx）：ソースの約束 ───────── */

test('設定の画面: 「シートから読み取れた内容」に「花道の追加情報」の1行（id=read-hanamichi）。✓ あり／なし の2つの言い方（古い版に ⚠ は付けない）', () => {
  assert.match(PAGE, /supportsHanamichi/);
  assert.match(PAGE, /id="read-hanamichi"[^>]*>\s*<dt[^>]*>花道の追加情報<\/dt>\s*<dd[^>]*>\{hanamichiRowText\}<\/dd>/);
  assert.match(PAGE, /'✓ あり（花道の区分を選んだ人にだけ、追加の質問が出ます）'/);
  assert.match(PAGE, /'なし（追加の質問は出しません）'/);
  // 古い版（3.20261019.6 など）は「あり」かどうかを ping で言えない。区分に「花道」があるだけで警告を出すと、使わない大会にも出てしまう（設定=なし は、いまと同じ）
  assert.doesNotMatch(PAGE, /⚠ このシートは古い版で、花道の追加情報/);
  // 直しものがあるときは、緑の ✓ を出さない（階級分け・ロゴと同じ作り）
  assert.match(PAGE, /ping\?\.hanamichiMode[^\n]*configProblem \? 'あり（上の「✕」の文のとおりに直すと、申し込みページに出ます）'/);
});

test('設定の画面: 花道のための黄色の注意は無い（古い版のシートは、設定=なし と同じ見た目）。黄色は既存の classCaution ?? weightCaution の1つだけ', () => {
  assert.equal((PAGE.match(/\{classCaution \?\? weightCaution\}/g) ?? []).length, 2, '読み取りの表の下と、手順3の2か所');
  assert.doesNotMatch(PAGE, /hanamichiCaution|hanamichiPossible/, '花道の区分があるだけで出る注意（使わない大会にも出る）は無い');
  assert.doesNotMatch(PAGE, /Googleのプログラムが古いです/);
  assert.doesNotMatch(PAGE, /花道の追加情報に対応していません/);
  // 花道の行は、build が 3.20261022.7 より前なら、hanamichiMode が来ない。その build では、必ず「なし」と読む
  const at = PAGE.indexOf('const hanamichiRowText = ');
  const block = PAGE.slice(at, PAGE.indexOf(';\n', at) + 2);
  assert.match(block, /ping\?\.hanamichiMode && supportsHanamichi\(ping\)/);
  assert.doesNotMatch(block, /!supportsHanamichi/);
});

test('設定の画面: リンクの hn=on は core の entryConfigFromPing が付ける。この画面は hn を書かない。個人情報の項目名・値を持たない', () => {
  assert.doesNotMatch(PAGE, /hn=|['"]hn['"]|hanamichi:\s*true/);
  for (const key of HANAMICHI_KEYS) assert.ok(!PAGE.includes(key), key + ' は設定の画面に要らない');
  assert.doesNotMatch(PAGE, /花道プロフィール/);
  // 準備の画面へ渡す鍵（rosterHash）には、花道の印を足さない（この版は、画面への自動表示を作らない）
  const roster = PAGE.slice(PAGE.indexOf('const rosterHash'), PAGE.indexOf('const toRoster'));
  assert.doesNotMatch(roster, /hanamichi|hn/i);
});

test('設定の画面: 手順3の緑の行（階級分け：あり…）と同じ作りで、花道の追加情報：あり の行がある。直しものがあるときは出さない', () => {
  assert.match(PAGE, /ping\?\.hanamichiMode && supportsHanamichi\(ping\) && !configProblem \? <OkLine>花道の追加情報：あり。花道の区分を選んだ人にだけ、追加の質問が出ます。<\/OkLine> : null/);
});

test('設定の画面: 作業2の説明と絵に、「花道の追加情報」の行がある（いちばん下。セルの番号は言わない）', () => {
  assert.match(PAGE, /\['花道の追加情報', '', 'skip', '花道の質問をするときだけ「あり」（はじめは「なし」）'\]/);
  assert.match(PAGE, /id="hanamichi-howto"/);
  assert.match(PAGE, /A列が「花道の追加情報」の行のB列/);
});

test('設定の画面: 公開前の検査に当たる書き方を、この変更で増やしていない（text-base・Object.hasOwn・.at(・後読み・手書きの @layer）', () => {
  for (const [name, source] of [['設定の画面', PAGE], ['core/setupV3.ts', read('core/setupV3.ts')]] as const) {
    assert.doesNotMatch(source, /\btext-base\b/, name);
    assert.doesNotMatch(source, /Object\.hasOwn/, name);
    assert.doesNotMatch(source, /\.at\(/, name);
    assert.doesNotMatch(source, /\(\?<[=!]/, name);
  }
});

/* ───────── A（Google）・B（申し込みページ）・C のつなぎ目 ───────── */

test('つなぎ目: 申し込みページが送る12の鍵 = core の表 = Googleが読む鍵 = 結果の画面の再送フォームの鍵 = 「花道プロフィール」の列（この順）', () => {
  // 申し込みページ：鍵の一覧は core の HANAMICHI_KEYS から作る（手書きの鍵が無い）
  assert.match(APPLY, /HANAMICHI_KEYS\.map\(\(key\) => \[key, hnNf\[key\]\]\)/);
  assert.match(APPLY, /\.\.\.hanamichiPost \}\)\.map\(\(\[name, value\]\) => <input key=\{name\} type="hidden"/);
  assert.doesNotMatch(APPLY, /name=["']hn[A-Z]/);
  // Google：表の鍵が core と同じ（1字も違わない）。再送フォームは、その表から作る
  const gsKeys = [...script.slice(script.indexOf('const HANAMICHI_ITEMS_'), script.indexOf('const HANAMICHI_HEADERS_')).matchAll(/key: '(hn[A-Za-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(gsKeys, [...HANAMICHI_KEYS]);
  assert.ok(script.includes("hnFields=HANAMICHI_ITEMS_.map(function(item){return item.key;})"));
  // 列：最初の4つ（受付番号・申込日時・所属ジム・選手名）のあとが、鍵の順の見出し
  assert.deepEqual(HANAMICHI_SHEET_HEADERS.slice(4), HANAMICHI_ITEMS.map((i) => i.label));
});

test('つなぎ目: 申し込みページの形のまま（12の鍵が全部入り）Googleに送ると、花道プロフィールの同じ列に、同じ値で入る。申込原本・OS取込用の列は増えない', () => {
  const h = live(ON);
  const answers: Record<string, string> = { hnNameKana: 'カクウ ハナミチイチロウ', hnGymKana: 'カクウジムエー', hnRing: '架空のタイガー', hnRingKana: 'カクウノタイガー', hnBirth: '1975-08-20', hnKickYears: '5', hnPerWeek: '3', hnOther: '空手3年', hnJob: '会社員', hnHobby: '釣り', hnReason: '健康のために始めました。', hnMessage: '最後まで全力でがんばります。' };
  assert.deepEqual(Object.keys(answers), [...HANAMICHI_KEYS], '架空の答えの鍵と並びが、表と同じ');
  const params = h.params('live', { division: '花道・男子（40歳以上）', weightClass: '-70', gym: '架空ジムA', name: '架空花道一郎', ...answers });
  const result = h.call('doPost', { parameter: params });
  assert.match(String(result.html), /受付番号/);
  const hn = h.rows('花道プロフィール');
  assert.equal(hn.length, 2);
  assert.deepEqual(hn[0], [...HANAMICHI_SHEET_HEADERS]);
  HANAMICHI_ITEMS.forEach((item, i) => assert.equal(String(hn[1][4 + i]), answers[item.key], item.key + ' が「' + item.label + '」の列に入る'));
  assert.equal(h.rows('申込原本（個人情報あり）')[0].length, 21, '申込原本は21列のまま');
  assert.equal(h.rows('OS取込用（連絡先なし）')[0].length, 14, 'OS取込用は14列のまま');
  const body = JSON.stringify([h.rows('申込原本（個人情報あり）').slice(1), h.rows('OS取込用（連絡先なし）').slice(1)]);
  for (const value of ['1975-08-20', '会社員', '架空のタイガー']) assert.ok(!body.includes(value), '個人情報（' + value + '）は、花道プロフィール以外のタブに出ない');
});

test('つなぎ目: サーバーの失敗の文 = core の文 = 結果の画面。画面の入力の上限（文字数）は、サーバーの上限と同じ表から出る', () => {
  assert.ok(script.includes(HANAMICHI_MISSING_MESSAGE) && script.includes(HANAMICHI_BAD_MESSAGE));
  assert.equal(HANAMICHI_MISSING_MESSAGE, '花道の追加の質問に、答えていない所があります。申込ページにもどって、入れてから、もう一度送ってください。');
  assert.match(APPLY, /item\.max - hnNf\[key\]\.length/, '残りの文字数は、表の max から数える');
});

test('つなぎ目: 版。.gs の RECEPTION_BUILD = EXPECTED。受け付ける版は古い順に5つで、最後が EXPECTED。階級分けは 3.20261019.6 以降、花道は 3.20261022.7 以降', () => {
  assert.equal(script.match(/RECEPTION_BUILD = '([0-9.]+)'/)![1], EXPECTED_RECEPTION_BUILD);
  assert.equal(ACCEPTED_RECEPTION_BUILDS.at(-1), EXPECTED_RECEPTION_BUILD); assert.equal(ACCEPTED_RECEPTION_BUILDS.length, 5);
  const sorted = [...ACCEPTED_RECEPTION_BUILDS].sort((a, b) => a.localeCompare(b));
  assert.deepEqual([...ACCEPTED_RECEPTION_BUILDS], sorted, '古い順');
  const at = (build: string) => ({ app: 'tournament-os', protocol: 3, build, ready: true }) as Ping;
  assert.deepEqual(ACCEPTED_RECEPTION_BUILDS.map((b) => supportsWeightClasses(at(b))), [false, false, true, true, true]);
  assert.deepEqual(ACCEPTED_RECEPTION_BUILDS.map((b) => supportsHanamichi(at(b))), [false, false, false, true, true]);
  assert.equal(isAppsScriptUrl(ENDPOINT), true);
});

/* ───────── 文書 ───────── */

test('文書: ひな形の入れかえの手順書（クラス区分・階級分け）に、今の build 番号と、もう1回の入れかえが要ることが書いてある', () => {
  for (const file of ['docs/クラス区分_設定の入れ方.md', 'docs/階級分け_設定の入れ方.md']) {
    const doc = read(file);
    assert.ok(doc.includes(EXPECTED_RECEPTION_BUILD), file + ' に今の build 番号がある');
  }
  const doc = read('docs/階級分け_設定の入れ方.md');
  assert.match(doc, /花道の追加情報/);
  assert.match(doc, /もう1回/);
});

test('文書: 追加要件04は「できた形」。表の必須／任意・文字数が、コードの表（core/hanamichi.ts）と1行ずつ同じ。作っていないものと、会長に確認することが書いてある', () => {
  const doc = read('docs/追加要件_04_花道用プロフィールの別枠.md');
  for (const item of HANAMICHI_ITEMS) {
    const line = doc.split('\n').find((l) => l.startsWith('| `' + item.key + '`'));
    assert.ok(line, item.key + ' の行がある');
    assert.ok(line!.includes(item.label), item.key + ' の見出し「' + item.label + '」');
    assert.ok(line!.includes(item.required ? '必須' : '任意') && !line!.includes(item.required ? '任意' : '必須'), item.key + ' の必須／任意');
    assert.ok(line!.includes(String(item.kind === 'number' ? '0〜99' : item.max)), item.key + ' の上限');
  }
  for (const word of ['作っていないもの', '会長に確認', '必須／任意', '生年月日', '花道プロフィール', EXPECTED_RECEPTION_BUILD, '年齢は確かめ']) assert.ok(doc.includes(word), word);
});

test('文書: 追加要件01に、申込ページと準備の画面に、オーナーの文を入れた、と書いてある', () => {
  const doc = read('docs/追加要件_01_小学生のマッチメイクの説明.md');
  assert.match(doc, /申込ページと準備の画面に、オーナーの文を入れた/);
  assert.ok(doc.includes('小学生の試合は、申し込みの体重を目安に、近い学年（1〜2年の差）・近い体重（2〜3kgの差）の選手どうしで組みます。目安なので、ちがうこともあります。'));
});

test('文書: マニュアルの新しい言葉は、画面にある文字と同じ。例は 『』 を使う。新しく書いた所に、実名・電話番号らしい文字列を入れない', () => {
  const manual = read('docs/TOURNAMENT_OS_使い方マニュアル.md');
  assert.match(manual, /「花道の追加情報」/);
  assert.match(manual, /「花道の追加の質問」/);
  assert.ok(PAGE.includes('花道の追加情報') && APPLY.includes('花道の追加の質問'));
  assert.ok(manual.includes('花道プロフィール'));
  // 新しく書いた所：4-3の3 と 手順13の2 と、追加要件04の「できた形」
  const part = (text: string, from: string, to: string): string => { const a = text.indexOf(from), b = text.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, from); return text.slice(a, b); };
  const doc04 = read('docs/追加要件_04_花道用プロフィールの別枠.md');
  const fresh = [part(manual, '### 4-3の3', '### 4-4'), part(manual, '**手順13の2：', '**手順14：'), part(doc04, '## できた形（2026-10-22）', '## 決める前の検討の記録')].join('\n');
  assert.doesNotMatch(fresh, /\d{2,4}-\d{2,4}-\d{3,4}|\b0\d{9,10}\b/, '電話番号らしい文字列');
  assert.doesNotMatch(fresh, /山田|田中|佐藤|鈴木|高橋|伊藤|渡辺/, '実名らしい名前');
  assert.match(part(manual, '### 4-3の3', '### 4-4'), /『カクウ ハナミチイチロウ』/, '例は架空の値で、『』に入れる');
});
