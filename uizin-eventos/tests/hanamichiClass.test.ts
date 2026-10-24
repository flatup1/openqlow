// R8-1：花道の選手には A/B クラスを選ばせない。花道の決まりの1行は、設定タブの「花道のルール」から来る。
// 1つ目の塊（golden）は、この機能を足す前のコードで書いて、そのまま通した。花道ではない区分・クラス分け＝なし・昔のリンクの動きは、1字も変わらない。
// この試験の文は、ぜんぶ『テスト用の文です』のような架空の文。本物の花道のルールの文は、.gs の初期値と docs にだけある。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { harness } from './helpers/gasV3Harness.ts';
import { boutClassWarning, classMixMessage, classState, DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';
import { diagnose, entryConfigFromPing, EXPECTED_RECEPTION_BUILD, parsePing, settingLines } from '../core/setupV3.ts';
import { HANAMICHI_RULE_MAX, hanamichiRuleOk } from '../core/hanamichi.ts';
import { packPledge, packText, unpackPledge, unpackText, type PledgeConfig } from '../core/pledge.ts';
import { publicEntryConfig, publicEntryHash, publicEntryLinkCut, publicEntryReady, type PublicEntryConfig } from '../core/publicEntry.ts';
import { DEFAULT_WEIGHT_SETTINGS } from '../core/weightClass.ts';
import { importFighters, type LocalBout, type LocalFighter } from '../core/privateTournament.ts';
import { DEFAULT_SHOW, sheetBouts } from '../core/boutSheet.ts';
import { buildRow } from '../app/private/live/listLogic.ts';
import { classTrouble } from '../app/private/logic.ts';

const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', TEST_OS = 'テストOS取込用';
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec';
const cfg: PublicEntryConfig = { endpoint: ENDPOINT, eventId: 'test-cup', title: '架空大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '連絡先', music: true, grade: 'optional', age: 'optional', comment: 'optional', protocol: '3', mode: 'live' };
const HEAD = '#endpoint=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FAKfycbyTEST_ONLY%2Fexec&eventId=test-cup&title=%E6%9E%B6%E7%A9%BA%E5%A4%A7%E4%BC%9A&organizer=%E6%9E%B6%E7%A9%BA%E4%B8%BB%E5%82%AC&date=2027%E5%B9%B410%E6%9C%883%E6%97%A5&venue=%E6%9E%B6%E7%A9%BA%E4%BD%93%E8%82%B2%E9%A4%A8&venueUrl=&deadline=2099-11-30&contact=%E9%80%A3%E7%B5%A1%E5%85%88&music=on&grade=optional&age=optional&comment=optional';
const HASH = '0123456789abcdef'.repeat(4);
const FAKE_PLEDGE: PledgeConfig = { items: ['テスト用の文です1', 'テスト用の文です2'], guardian: 'テスト用の保護者の文です', gym: 'テスト用のジム責任者の文です', mode: 'under18', gymMode: true, confirmed: true };

type H = ReturnType<typeof harness>;
const ping = (h: H) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
const html = (h: H, params: any): string => String(h.call('doPost', { parameter: params }).html);
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const thrown = (fn: () => unknown): any => { try { fn(); } catch (e) { return e; } assert.fail('投げなかった'); };
const dropHanamichiRows = (h: H) => { const rows = h.settingsSheet().rows; for (let i = rows.length - 1; i >= 0; i--) if (/^階級：花道/.test(rows[i][0])) rows.splice(i, 1); };
const live = (over: Record<string, string> = {}) => { const h = harness(); h.ready(over); h.call('openEntries'); return h; };
const fighter = (over: Partial<LocalFighter> = {}): LocalFighter => ({ id: 'f1', gym: '架空ジム', name: '架空選手', grade: '', age: '', height: '', weight: '60', record: '', comment: '', musicUrl: '', ...over }) as LocalFighter;

const CLASS_MESSAGE = 'クラスが選ばれていません。申込ページを開き直して、AクラスかBクラスを選んでから送ってください。リンクが途中で切れているかもしれません。そのときは、リンクをくれた人に、もう一度リンクをもらってください。';
const NON_HANAMICHI = ['小学生以下', '中学生女子', '中学生男子', '高校生・一般女子', '高校生・一般男子'];
const WEIGHT_OF: Record<string, string> = { 小学生以下: '', 中学生女子: '-37', 中学生男子: '-37', 高校生・一般女子: '-40', 高校生・一般男子: '-50' };
const PING_BASE = ['app', 'protocol', 'build', 'ready', 'accepting', 'eventId', 'testComplete', 'settingsProblem', 'storageProblem', 'title', 'date', 'venue', 'venueUrl', 'organizer', 'contact', 'deadline', 'music', 'grade', 'age', 'comment'];

/* ───────── golden：花道ではない区分・クラス分け＝なし・昔のリンクは、今までと同じ ───────── */

test('golden リンク: 花道のルールを持たない設定のリンクは、1字も変わらない（hr の鍵は作らない）', () => {
  assert.equal(publicEntryHash(cfg), HEAD + '&protocol=3&mode=live&end=1');
  assert.equal(publicEntryHash({ ...cfg, classes: DEFAULT_CLASS_SETTINGS }), HEAD + '&cls=on&protocol=3&mode=live&end=1');
  assert.equal(publicEntryHash({ ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS }), HEAD + '&cls=on&wc=on&protocol=3&mode=live&end=1');
  assert.equal(publicEntryHash({ ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true, mode: 'test' }), HEAD + '&cls=on&wc=on&logo=on&hn=on&protocol=3&mode=test&end=1');
  const plt = packPledge(FAKE_PLEDGE.items, FAKE_PLEDGE.guardian, FAKE_PLEDGE.gym);
  assert.equal(publicEntryHash({ ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true, pledge: FAKE_PLEDGE, pledgeHash: HASH, mode: 'test' }),
    HEAD + '&cls=on&wc=on&logo=on&hn=on&pl=on&plg=under18&plm=on&plc=on&plf=' + HASH + '&plt=' + plt + '&protocol=3&mode=test&end=1');
});

test('golden リンクの読み取りと切れ検出: hr の無いリンクは、今までのとおり読め、切れていない。読んだ設定に hanamichiRule の項目は無い', () => {
  const links = [HEAD + '&protocol=3&mode=live&end=1', HEAD + '&cls=on&protocol=3&mode=live&end=1', HEAD + '&cls=on&wc=on&logo=on&hn=on&protocol=3&mode=test&end=1', HEAD + '&cls=on&wc=on'];
  for (const link of links) {
    assert.equal(publicEntryLinkCut(link), link.endsWith('&wc=on') ? true : false, link.slice(-40));
    assert.equal('hanamichiRule' in publicEntryConfig(link), false);
  }
  // 昔のリンク（end も クラスも無い）は、そのまま使える
  const old = HEAD + '&protocol=3&mode=live';
  assert.equal(publicEntryLinkCut(old), false); assert.equal(publicEntryReady(publicEntryConfig(old)), true);
  assert.equal(publicEntryConfig(HEAD + '&cls=on&protocol=3&mode=live&end=1').classes?.upper.name, 'Aクラス');
  assert.equal(publicEntryConfig(HEAD + '&cls=on&protocol=3&mode=live&end=1&unknown=1').title, '架空大会', '知らない鍵は無視');
});

test('golden core/setupV3: 花道のルールの無い ping は、読んでも、申し込みページに渡す設定にも、hanamichiRule は出ない。クラスの読み取りは今までのとおり', () => {
  const base = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: true, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: 'テスト大会', date: '2099-12-01', venue: '体育館', venueUrl: '', organizer: '主催ジム', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
  const plain = parsePing(base);
  assert.equal('hanamichiRule' in plain, false);
  const withClass = parsePing({ ...base, classMode: true, classes: DEFAULT_CLASS_SETTINGS, weightMode: true, weights: DEFAULT_WEIGHT_SETTINGS });
  assert.equal('hanamichiRule' in withClass, false);
  assert.equal(diagnose(withClass).stage, 'ready');
  const config = entryConfigFromPing(withClass, ENDPOINT, 'live');
  assert.deepEqual(Object.keys(config), ['endpoint', 'protocol', 'mode', 'eventId', 'title', 'organizer', 'date', 'venue', 'venueUrl', 'deadline', 'contact', 'music', 'grade', 'age', 'comment', 'recordDetail', 'classes', 'weights']);
  assert.equal(publicEntryHash(config).includes('hr='), false);
});

test('golden ping: 花道の区分が1つも無い設定の ping は、クラス分けが あり でも、今までと同じ鍵だけ（花道のルールの鍵は増えない）', () => {
  const classOnly = live({ クラス分け: 'あり' });
  assert.deepEqual(Object.keys(ping(classOnly)), [...PING_BASE, 'classMode', 'classes']);
  const noHanamichi = live({ クラス分け: 'あり', 階級分け: 'あり' }); // 花道の区分の行を消す前の状態を作ってから、消す
  dropHanamichiRows(noHanamichi);
  assert.deepEqual(Object.keys(ping(noHanamichi)), [...PING_BASE, 'weightMode', 'weights', 'classMode', 'classes']);
  const off = live({ 階級分け: 'あり' });
  assert.deepEqual(Object.keys(ping(off)), [...PING_BASE, 'weightMode', 'weights'], 'クラス分け＝なし：花道の区分があっても、鍵は増えない');
  for (const h of [classOnly, noHanamichi, off]) assert.ok(!/hanamichiRule|花道（シニア）/.test(JSON.stringify(ping(h))));
});

test('golden 保存: 花道ではない区分では、クラスは今までどおり必須。上のクラス・下のクラスの名前で保存する（申込原本 19列目・OS取込用 12列目）', () => {
  for (const division of NON_HANAMICHI) {
    const h = live({ クラス分け: 'あり', 階級分け: 'あり' });
    const base = { division, weightClass: WEIGHT_OF[division] };
    for (const missing of [undefined, '', 'x', 'UPPER']) {
      const p = h.params('live', { ...base, ...(missing === undefined ? {} : { fighterClass: missing }) });
      const error = thrown(() => h.call('saveEntry_', p));
      assert.equal(error.code, 'class', division + ' / ' + String(missing)); assert.equal(error.message, CLASS_MESSAGE); assert.equal(error.retryable, false);
    }
    assert.equal(h.rows(PRIVATE).length, 1, '保存されない');
    const up = h.call('saveEntry_', h.params('live', { ...base, fighterClass: 'upper' })), low = h.call('saveEntry_', h.params('live', { ...base, fighterClass: 'lower', name: '架空選手二' }));
    assert.equal(h.rows(PRIVATE).at(-2)![0], up); assert.equal(h.rows(PRIVATE).at(-2)![18], 'Aクラス'); assert.equal(h.rows(PRIVATE).at(-1)![0], low); assert.equal(h.rows(PRIVATE).at(-1)![18], 'Bクラス');
    assert.equal(h.rows(OS).at(-2)![11], 'Aクラス'); assert.equal(h.rows(OS).at(-1)![11], 'Bクラス');
    assert.equal(h.rows(PRIVATE).at(-1)![19], division);
  }
});

test('golden 保存: 階級分け＝なし（区分が無い）でも、クラス分け＝あり なら、クラスは必須。クラス分け＝なし のときは、送られたクラスを捨てる', () => {
  const classOnly = live({ クラス分け: 'あり' });
  assert.equal(thrown(() => classOnly.call('saveEntry_', classOnly.params('live', {}))).code, 'class');
  classOnly.call('saveEntry_', classOnly.params('live', { fighterClass: 'upper' })); assert.equal(classOnly.rows(PRIVATE).at(-1)![18], 'Aクラス');
  const none = live({ 階級分け: 'あり' });
  none.call('saveEntry_', none.params('live', { division: '中学生男子', weightClass: '-37', fighterClass: 'upper' }));
  assert.equal(none.rows(PRIVATE).at(-1)![18], '', 'クラス分け＝なし：送られても保存しない');
});

test('golden 保存: 花道ではない区分の再送（同じ requestId）は、クラスが同じなら同じ受付番号、ちがえば「変わった」と断る。行は増えない', () => {
  const h = live({ クラス分け: 'あり', 階級分け: 'あり' });
  const p = h.params('live', { division: '中学生男子', weightClass: '-37', fighterClass: 'lower' });
  const receipt = h.call('saveEntry_', p);
  assert.equal(h.call('saveEntry_', { ...p }), receipt); assert.equal(h.rows(PRIVATE).length, 2);
  const changed = thrown(() => h.call('saveEntry_', { ...p, fighterClass: 'upper' }));
  assert.equal(changed.code, 'changed'); assert.equal(h.rows(PRIVATE).length, 2); assert.equal(h.rows(PRIVATE).at(-1)![18], 'Bクラス');
  // 画面（結果のページ）も同じ：成功は緑の ✓
  assert.match(html(h, { ...p }), /✓ 申し込みが完了しました/);
});

test('golden 自動テストの1件: 最初の区分が花道ではないとき、クラスは「上」で書く（Aクラス）', () => {
  const h = harness(); h.ready({ クラス分け: 'あり', 階級分け: 'あり' });
  assert.equal(h.rows(TEST).at(-1)![18], 'Aクラス'); assert.equal(h.rows(TEST_OS).at(-1)![11], 'Aクラス');
  assert.equal(h.rows(TEST).at(-1)![19], '小学生以下');
});

test('golden core/classRules: 花道ではない人の classState・boutClassWarning・classMixMessage は今までのとおり。空は「入っていない」', () => {
  const s = DEFAULT_CLASS_SETTINGS;
  const cases: [Partial<LocalFighter>, string][] = [[{}, 'blank'], [{ fighterClass: '' }, 'blank'], [{ fighterClass: '  ' }, 'blank'], [{ fighterClass: 'Aクラス' }, 'ok'], [{ fighterClass: 'ｂクラス' }, 'ok'], [{ fighterClass: 'S' }, 'unknown'],
    [{ division: '中学生男子' }, 'blank'], [{ division: '中学生男子', fighterClass: 'Bクラス' }, 'ok'], [{ division: '高校生・一般男子', fighterClass: 'S' }, 'unknown']];
  for (const [over, state] of cases) assert.equal(classState(fighter(over), s), state, JSON.stringify(over));
  assert.equal(classState(undefined, s), 'blank'); assert.equal(classState(fighter({ fighterClass: 'S' })), 'ok', '設定が無いときは、空かどうかだけ見る');
  // 花道の人でも、クラスが入っているときは今までのとおり
  assert.equal(classState(fighter({ division: '花道・男子（40歳以上）', fighterClass: 'Aクラス' }), s), 'ok'); assert.equal(classState(fighter({ division: '花道・男子（40歳以上）', fighterClass: 'S' }), s), 'unknown');
  const a = fighter({ id: 'a', fighterClass: 'Aクラス' }), b = fighter({ id: 'b', fighterClass: 'Bクラス' }), blank = fighter({ id: 'c' });
  assert.equal(boutClassWarning(a, b), 'クラスがちがいます（赤：Aクラス／青：Bクラス）。ルールがちがうので、組み合わせを確かめてください。');
  assert.equal(boutClassWarning(a, a), ''); assert.equal(boutClassWarning(a, blank), ''); assert.equal(boutClassWarning(blank, b), ''); assert.equal(boutClassWarning(blank, blank), '');
  assert.ok(classMixMessage(a, b, s)); assert.equal(classMixMessage(a, blank, s), null);
});

test('golden core/pledge: packPledge の出力は、1字も変わらない（packText に一般化したあとも同じ。リンクの plt が変わらない）', () => {
  assert.equal(packPledge(['テスト用の文です1', 'テスト用の文です2'], 'テスト用の保護者の文です', 'テスト用のジム責任者の文です'),
    'uAHsAIgBpAHQAZQBtAHMAIgA6AFsAIjDGMLkwyHUoMG5lhzBnMFkAMQAiACwAIjDGMLkwyHUoMG5lhzBnMFkAMgAiAF0ALAAiAGcAdQBhAHIAZABpAGEAbgAiADoAIjDGMLkwyHUoMG5P3Yt3gAUwbmWHMGcwWQAiACwAIgBnAHkAbQAiADoAIjDGMLkwyHUoMG4wuDDgjKxO-4AFMG5lhzBnMFkAIgB9');
  assert.equal(packPledge(['A😀\n'], '', ''), 'uAHsAIgBpAHQAZQBtAHMAIgA6AFsAIgBB2D3eAABcAG4AIgBdACwAIgBnAHUAYQByAGQAaQBhAG4AIgA6ACIAIgAsACIAZwB5AG0AIgA6ACIAIgB9');
});

/* ───────── R8-1 新しい動き：花道の選手にはクラス（A/B）を選ばせない。かわりに「花道のルール」の1行を見せる ───────── */

const RULE = 'テスト用の文です（花道の1行）';
const RULE_ROW = '花道のルール';
/** .gs の初期の文（HANAMICHI_RULE_INITIAL）の SHA-256。owner が「OK」と答えた文のまま、1字も直さない。文そのものは、ここに書かない */
const INITIAL_RULE_SHA = 'da755df9071c30431a5d836f775d3b6a8606acd4fd0b61b1b63b8e36f5d03f9e';
const HN_DIV = '花道・男子（40歳以上）', HN_WC = '-70', HN_WC_SAVED = '70kg以下';
const HN_ANSWERS = { hnNameKana: 'カクウ', hnGymKana: 'カクウジム', hnRing: '架空リング', hnRingKana: 'カクウリング', hnBirth: '1975-08-20', hnKickYears: '5', hnPerWeek: '3', hnOther: '', hnJob: '', hnHobby: '釣り', hnReason: '健康のため', hnMessage: 'がんばります' };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const ruleCfg = (over: Partial<PublicEntryConfig> = {}): PublicEntryConfig => ({ ...cfg, classes: DEFAULT_CLASS_SETTINGS, hanamichiRule: RULE, ...over });
const problemOf = (h: H): string => (h.call('settingsProblems_', h.call('S_')) as string[]).join('。');
const setRule = (h: H, text: string) => h.setSetting(RULE_ROW, text);
const ON_BOTH = { クラス分け: 'あり', 階級分け: 'あり' };
const saved = (h: H, mode: 'live' | 'test') => ({ priv: h.rows(mode === 'live' ? PRIVATE : TEST), os: h.rows(mode === 'live' ? OS : TEST_OS) });

test('R8-1 core/pledge: packText/unpackText は文1つの往復ができる（ひらがな・漢字・全角・絵文字・ASCII・改行・空）。packPledge も同じ詰め方', () => {
  const samples = ['', 'ひらがなだけのぶん', '漢字と全角ＡＢＣ１２３', '😀絵文字😀', 'ASCII only 123 !?', '1行目\n2行目\r\n3行目', 'あ'.repeat(120), 'a', '\u{1F468}‍\u{1F469}'];
  for (const text of samples) {
    const packed = packText(text);
    assert.match(packed, /^u[A-Za-z0-9_-]*$/, '先頭 u ＋ base64url（= なし）');
    assert.equal(unpackText(packed), text, JSON.stringify(text));
    assert.equal(packText(unpackText(packed)!), packed, '作った形のまま戻る');
  }
  assert.equal(packText(''), 'u');
  assert.equal(packText('あ'), 'u' + Buffer.from([0x30, 0x42]).toString('base64url'), 'UTF-16BE（1文字＝上位・下位の2バイト）');
  // packPledge は packText(JSON) と同じ
  const items = ['テスト用の文です1'], guardian = 'テスト用の保護者の文です', gym = 'テスト用のジム責任者の文です';
  assert.equal(packPledge(items, guardian, gym), packText(JSON.stringify({ items, guardian, gym })));
  assert.deepEqual(unpackPledge(packText(JSON.stringify({ items, guardian, gym }))), { items, guardian, gym });
  assert.equal(unpackPledge(packText('{}')), undefined); assert.equal(unpackPledge(packText('文')), undefined);
});

test('R8-1 core/pledge: unpackText は、きちんとした形だけを読む。壊れた入力は undefined（投げない）', () => {
  const good = packText(RULE);
  const bad: unknown[] = ['', 'x', 'U' + good.slice(1), good.slice(1), good + '=', good + 'A', good.slice(0, -1), 'u+/', 'u あ', packText('\ud800'), packText('a\udc00b'), packText('\ud83d'), null, undefined, 5, {}, ['u']];
  for (const input of bad) assert.equal(unpackText(input as string), undefined, String(input));
  // バイトが奇数（1文字ぶんに足りない）
  assert.equal(unpackText('uAA'), undefined);
  // 余りのビットが0でない
  assert.equal(unpackText('uAB'), undefined);
  assert.doesNotThrow(() => unpackText('u%%%'));
});

test('R8-1 core/hanamichi: hanamichiRuleOk は 1〜120字（空白だけは不可）。対になっていないサロゲートは不可', () => {
  assert.equal(HANAMICHI_RULE_MAX, 120);
  for (const ok of ['a', RULE, 'あ'.repeat(120), '😀'.repeat(60), ' a ']) assert.equal(hanamichiRuleOk(ok), true, ok.slice(0, 10));
  for (const no of ['', ' ', '\n\t　', 'あ'.repeat(121), '😀'.repeat(61), '\ud800', 'a\udc00', 'abc\ud83d', 5, null, undefined, [], {}]) assert.equal(hanamichiRuleOk(no), false, String(no).slice(0, 10));
});

test('R8-1 リンク: hr はクラスの鍵のあと・階級の鍵の前。クラスが無ければ付けない。値の名前（hanamichiRule）は出ない', () => {
  const link = publicEntryHash(ruleCfg({ weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true, mode: 'test' }));
  assert.equal(link, HEAD + '&cls=on&hr=' + packText(RULE) + '&wc=on&logo=on&hn=on&protocol=3&mode=test&end=1');
  assert.deepEqual([...new URLSearchParams(link.slice(1)).keys()].slice(13), ['cls', 'hr', 'wc', 'logo', 'hn', 'protocol', 'mode', 'end']);
  assert.ok(!link.includes('hanamichiRule'));
  // クラスが変わったときの鍵（cuN など）のあとにも付く
  const custom = publicEntryHash(ruleCfg({ classes: { ...DEFAULT_CLASS_SETTINGS, upperMinWins: 4 } }));
  assert.ok(custom.indexOf('&cw=4&hr=') > 0, 'cw のあと');
  // クラス分けが無いリンクには、hanamichiRule が渡されても付かない（見せる所が無い）
  assert.equal(publicEntryHash({ ...cfg, hanamichiRule: RULE }), HEAD + '&protocol=3&mode=live&end=1');
  assert.equal(publicEntryHash({ ...cfg, classes: { ...DEFAULT_CLASS_SETTINGS, enabled: false }, hanamichiRule: RULE }), HEAD + '&protocol=3&mode=live&end=1');
  // 誓約書の鍵とも並べられる（hr は pl より前）
  const both = publicEntryHash(ruleCfg({ pledge: FAKE_PLEDGE, pledgeHash: HASH }));
  assert.ok(both.indexOf('&hr=') < both.indexOf('&pl=on'));
});

test('R8-1 リンク: hr の往復（ひらがな・漢字・全角・絵文字・ASCII・改行・1字・120字）。切れていない', () => {
  for (const rule of ['テスト用の文です', 'ひらがなだけのぶん', '漢字と全角ＡＢＣ１２３', '😀絵文字😀', 'ASCII only 123 !?', '1行目\n2行目', 'a', 'あ'.repeat(120)]) {
    const link = publicEntryHash(ruleCfg({ hanamichiRule: rule, weights: DEFAULT_WEIGHT_SETTINGS }));
    assert.equal(publicEntryLinkCut(link), false, rule.slice(0, 8));
    const read = publicEntryConfig(link);
    assert.equal(read.hanamichiRule, rule); assert.ok(read.classes); assert.equal(publicEntryReady(read), true);
    assert.equal(publicEntryHash(read), link, '読んで作り直しても、同じリンク');
  }
});

test('R8-1 リンク: hr は protocol=3 で、クラス分け（cls=on）があるときだけ読む。hr が無い昔のリンクは、切れではなく、今までどおり', () => {
  const link = publicEntryHash(ruleCfg());
  assert.equal(publicEntryConfig(link).hanamichiRule, RULE);
  // protocol が 2 の受付には、読ませない
  const two = link.replace('&protocol=3', '&protocol=2&entryKey=' + 'k'.repeat(40));
  assert.equal('hanamichiRule' in publicEntryConfig(two), false);
  // cls=on が無い／off の hr は、おかしなリンク（切れている）。読まない
  const noCls = link.replace('&cls=on', ''), off = link.replace('&cls=on', '&cls=off');
  for (const odd of [noCls, off]) { assert.equal(publicEntryLinkCut(odd), true, odd.slice(-60)); assert.equal('hanamichiRule' in publicEntryConfig(odd), false); }
  // hr の無いクラスつきのリンクは、切れていない。花道の区分でも、今までどおりクラスを選ぶ
  const plain = publicEntryHash({ ...cfg, classes: DEFAULT_CLASS_SETTINGS });
  assert.equal(publicEntryLinkCut(plain), false); assert.equal('hanamichiRule' in publicEntryConfig(plain), false);
});

test('R8-1 リンク: hr が読めない・長すぎる・空のときは、切れている', () => {
  const at = (hr: string) => HEAD + '&cls=on&hr=' + hr + '&protocol=3&mode=live&end=1';
  assert.equal(publicEntryLinkCut(at(packText(RULE))), false);
  const bad = ['', 'u', 'x', 'U' + packText(RULE).slice(1), packText(RULE) + 'A', packText(RULE) + '=', packText('あ'.repeat(121)), packText('   '), packText('\ud800'), packText('a\udc00'), '%E3%81%82', packText(RULE).slice(0, -1)];
  for (const hr of bad) { assert.equal(publicEntryLinkCut(at(hr)), true, hr.slice(0, 20)); assert.equal('hanamichiRule' in publicEntryConfig(at(hr)), false, hr.slice(0, 20)); }
  // 空の hr（hr=）も、hr だけがあるリンクも、切れている
  assert.equal(publicEntryLinkCut(HEAD + '&hr=' + packText(RULE) + '&protocol=3&mode=live&end=1'), true);
  assert.equal(publicEntryLinkCut(HEAD + '&cls=on&hr&protocol=3&mode=live&end=1'), true);
});

test('R8-1 リンク: hr のあるリンクは、どこで切れても、切れていると分かる（クラスの鍵のあとの全部の長さ）', () => {
  const link = publicEntryHash(ruleCfg({ weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true, pledge: FAKE_PLEDGE, pledgeHash: HASH }));
  const from = link.indexOf('&cls=on') + 4;
  let accepted = 0, scanned = 0;
  for (let i = from; i < link.length; i++) { scanned++; if (!publicEntryLinkCut(link.slice(0, i))) accepted++; }
  assert.ok(scanned > 300, '調べた長さ：' + scanned);
  assert.equal(accepted, 0, '切れているのに、切れていないと読んだ数');
  assert.equal(publicEntryLinkCut(link), false);
});

test('R8-1 リンク: 120字の花道のルールを入れても、リンクは4500字に収まる（クラス・階級・ロゴ・花道・誓約書がぜんぶあるとき）', () => {
  const long = 'あ'.repeat(HANAMICHI_RULE_MAX);
  const big = publicEntryHash(ruleCfg({ hanamichiRule: long, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true, pledge: FAKE_PLEDGE, pledgeHash: HASH }));
  const without = publicEntryHash(ruleCfg({ hanamichiRule: undefined, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true, pledge: FAKE_PLEDGE, pledgeHash: HASH }));
  assert.ok(big.length < 4500, 'リンクの長さ：' + big.length);
  assert.equal(big.length - without.length, '&hr='.length + packText(long).length, 'hr が足すのは、鍵と詰めた文だけ');
  assert.ok(packText(long).length <= 1 + Math.ceil((HANAMICHI_RULE_MAX * 2 * 4) / 3));
});

const PING = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: true, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: 'テスト大会', date: '2099-12-01', venue: '体育館', venueUrl: '', organizer: '主催ジム', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };

test('R8-1 core/setupV3: ping の hanamichiRule を読む（前後の空白を取る）。1〜120字だけ。読めなければ捨てて、今までどおりクラスを選ばせる', () => {
  const withClass = { ...PING, classMode: true, classes: DEFAULT_CLASS_SETTINGS };
  assert.equal(parsePing({ ...withClass, hanamichiRule: '  ' + RULE + ' \n' }).hanamichiRule, RULE);
  assert.equal(parsePing({ ...withClass, hanamichiRule: 'あ'.repeat(120) }).hanamichiRule, 'あ'.repeat(120));
  for (const bad of ['', '   ', 'あ'.repeat(121), '\ud800', 5, null, true, ['x'], { a: 1 }]) assert.equal('hanamichiRule' in parsePing({ ...withClass, hanamichiRule: bad }), false, JSON.stringify(bad)?.slice(0, 20));
  // 受け取るのは公開してよい項目だけ：ほかの項目は今までどおり
  const read = parsePing({ ...withClass, hanamichiRule: RULE, secret: 'x' });
  assert.equal('secret' in read, false); assert.equal(read.classMode, true); assert.ok(read.classes);
  assert.equal(diagnose(read).stage, 'ready');
});

test('R8-1 core/setupV3: クラス分けがあるときだけ、選手に渡すリンクに hr が付く。クラスが無い ping・hanamichiRule が無い ping は、今までと同じ', () => {
  const withClass = parsePing({ ...PING, classMode: true, classes: DEFAULT_CLASS_SETTINGS, hanamichiRule: RULE });
  const config = entryConfigFromPing(withClass, ENDPOINT, 'live');
  assert.equal(config.hanamichiRule, RULE);
  assert.deepEqual(Object.keys(config).slice(-2), ['classes', 'hanamichiRule']);
  assert.equal(publicEntryHash(config), HEAD.replace('test-cup', 'tos-0123456789').replace(/title=[^&]*/, 'title=' + encodeURIComponent('テスト大会')).replace(/organizer=[^&]*/, 'organizer=' + encodeURIComponent('主催ジム')).replace(/date=[^&]*/, 'date=' + encodeURIComponent(config.date)).replace(/venue=[^&]*/, 'venue=' + encodeURIComponent('体育館')).replace(/deadline=[^&]*/, 'deadline=' + encodeURIComponent(config.deadline)).replace(/contact=[^&]*/, 'contact=' + encodeURIComponent('0200000000')).replace('music=on', 'music=off') + '&cls=on&hr=' + packText(RULE) + '&rd=on&protocol=3&mode=live&end=1');
  const noClass = parsePing({ ...PING, hanamichiRule: RULE });
  const plain = entryConfigFromPing(noClass, ENDPOINT, 'live');
  assert.equal('hanamichiRule' in plain, false); assert.equal(publicEntryHash(plain).includes('hr='), false);
  const noRule = entryConfigFromPing(parsePing({ ...PING, classMode: true, classes: DEFAULT_CLASS_SETTINGS }), ENDPOINT, 'live');
  assert.equal('hanamichiRule' in noRule, false); assert.equal(publicEntryHash(noRule).includes('hr='), false);
});

test('R8-1 .gs 設定の行: 「花道のルール」は、いちばん下（B35）。初期値は HANAMICHI_RULE_INITIAL。▼・色は無い。説明は「仮の文・会長が確認」', () => {
  const h = harness(); h.call('onOpen');
  const rows = h.rows('設定'), labels = rows.slice(1).map((r) => r[0]);
  assert.equal(rows.length, 35); assert.equal(labels.at(-1), RULE_ROW); assert.equal(labels.indexOf(RULE_ROW) + 2, 35, 'B35');
  assert.equal(labels.indexOf('階級分け') + 2, 21); assert.equal(labels.indexOf('ロゴ') + 2, 22); assert.equal(labels.indexOf('花道の追加情報') + 2, 30); assert.equal(labels.indexOf('誓約書') + 2, 31);
  const initial = vm.runInContext('HANAMICHI_RULE_INITIAL', h.api) as string;
  assert.equal(rows.at(-1)![1], initial); assert.equal(sha(initial), INITIAL_RULE_SHA);
  assert.ok(initial.length >= 1 && initial.length <= HANAMICHI_RULE_MAX); assert.equal(vm.runInContext('HANAMICHI_RULE_MAX_', h.api), HANAMICHI_RULE_MAX);
  assert.equal(h.settingsSheet().validations.get('35:2'), undefined, '長い文を書く行なので、▼は無い');
  assert.equal(h.settingsSheet().backgrounds.get('35:2'), undefined, '会長が必ず書く6つではないので、色は付けない');
  assert.equal(String(h.settingsSheet().formats.get('35:2')), '@', 'B列は文字の形');
  const desc = String(rows.at(-1)![2]);
  assert.match(desc, /原本から写した仮の文です。会長が確認してください/); assert.match(desc, /クラス/); assert.match(desc, /花道/); assert.match(desc, /120文字/);
  assert.equal(rows.at(-1)!.length, 3);
  // 選べる値の一覧（DROPDOWNS）にも、設定の問題の「どれかにしてください」の一覧にも入れない
  assert.ok(!(vm.runInContext('DROPDOWNS', h.api) as unknown[][]).some((pair) => pair[0] === RULE_ROW));
});

test('R8-1 .gs 設定の行: 古いシートに行が無くても、動かなくならない。開く・①で、いちばん下に初期の文で足される。書いてあるマスは書き換えない', () => {
  const h = harness(); h.ready(ON_BOTH); h.call('openEntries');
  const initial = vm.runInContext('HANAMICHI_RULE_INITIAL', h.api) as string;
  const rows = h.settingsSheet().rows; rows.splice(rows.findIndex((r: any[]) => r[0] === RULE_ROW), 1);
  h.settingsSheet().rows[1][1] = '私の大会';
  // 行が無い間：「まだルールを決めていない」と読む。設定の直しものにしない（行があって空のときだけ、直しもの）。pingにも花道のルールの鍵は出さない
  assert.equal(h.call('S_').hanamichiRule, ''); assert.equal(h.call('S_').hanamichiRuleRow, false);
  assert.equal(problemOf(h), ''); assert.equal(ping(h).settingsProblem, ''); assert.equal('hanamichiRule' in ping(h), false); assert.equal(ping(h).accepting, true);
  h.call('closeEntries'); assert.doesNotThrow(() => h.call('openEntries'), '行が無くても、受付を開始できる');
  // 花道の選手も、今までどおりクラスを選ぶ（サーバーも求める。送られたクラスは、そのまま保存する）
  assert.equal(thrown(() => h.call('saveEntry_', h.params('live', { division: HN_DIV, weightClass: HN_WC }))).code, 'class');
  h.call('saveEntry_', h.params('live', { division: HN_DIV, weightClass: HN_WC, fighterClass: 'lower' }));
  assert.notEqual(saved(h, 'live').priv.at(-1)![18], '', '行が無い昔のシートでは、花道でも選んだクラスを保存する');
  const before = JSON.stringify(h.rows('設定'));
  h.call('onOpen');
  assert.equal(h.rows('設定').length, 35); assert.equal(JSON.stringify(h.rows('設定').slice(0, 34)), before, 'いまある行は1マスも変わらない');
  assert.deepEqual(json(h.rows('設定').at(-1)!.slice(0, 2)), [RULE_ROW, initial]); assert.equal(problemOf(h), '');
  // 会長が直した文は、開く・①を何度押しても、書き換えない
  setRule(h, 'テスト用の文です（会長が直した）');
  h.call('onOpen'); h.call('setupTournament'); h.call('onOpen');
  assert.equal(h.rows('設定').length, 35); assert.equal(h.rows('設定').at(-1)![1], 'テスト用の文です（会長が直した）');
  assert.equal(ping(h).hanamichiRule, 'テスト用の文です（会長が直した）');
  // クラス分け＝なし のシートは、行が無くても何も起きない
  const off = harness(); off.ready(); const r2 = off.settingsSheet().rows; r2.splice(r2.findIndex((r: any[]) => r[0] === RULE_ROW), 1);
  assert.equal(problemOf(off), ''); assert.equal(ping(off).settingsProblem, '');
});

test('R8-1 .gs 設定の直しもの: 「花道のルール」が空・121字以上。クラス分け＝あり かつ 花道の区分があるときだけ。1つの問題＝1つの文で、直すマスを言う', () => {
  const h = harness(); h.ready(ON_BOTH);
  assert.equal(problemOf(h), '', '初期の文は、そのまま通る');
  const EMPTY = '「花道のルール」が空です（A列が「花道のルール」の行のB列に、花道の選手に見せる1行を書いてください）';
  for (const blank of ['', '   ', '　', '\n']) { setRule(h, blank); assert.equal(problemOf(h), EMPTY, JSON.stringify(blank)); }
  setRule(h, 'あ'.repeat(120)); assert.equal(problemOf(h), '');
  setRule(h, 'あ'.repeat(121));
  assert.equal(problemOf(h), '「花道のルール」は120文字までにしてください（A列が「花道のルール」の行のB列を、いまの121文字から短くしてください）');
  setRule(h, '😀'.repeat(61)); assert.match(problemOf(h), /いまの122文字から/);
  for (const text of [EMPTY, problemOf(h)]) assert.ok(!text.includes('。'), '文の中に「。」を入れない（1つの問題＝1つの文）');
  // 設定の直しものは、画面にそのまま出る（余計なセル番号を足さない）
  setRule(h, '');
  const lines = settingLines('シートの「設定」タブを直してください。' + problemOf(h) + '。');
  assert.equal(lines.length, 1); assert.equal(lines[0].fixes[0], EMPTY); assert.ok(!/セル/.test(lines[0].fixes[0]));
  // 空は、本番の新しい申し込みを止める（ほかの設定の問題と同じ）。テスト用は動く
  const live2 = harness(); live2.ready(ON_BOTH); live2.call('openEntries'); setRule(live2, '');
  assert.equal(thrown(() => live2.call('saveEntry_', live2.params('live', { division: HN_DIV, weightClass: HN_WC }))).code, 'setup');
  assert.doesNotThrow(() => live2.call('saveEntry_', live2.params('test', { division: HN_DIV, weightClass: HN_WC })));
});

test('R8-1 .gs 設定の直しもの: クラス分け＝なし・階級分け＝なし・花道の区分が1つも無いときは、花道のルールが空でも長くても、何も言わない', () => {
  const long = 'あ'.repeat(500);
  for (const [over, drop] of [[{ 階級分け: 'あり' }, false], [{ クラス分け: 'あり' }, false], [ON_BOTH, true], [{}, false]] as [Record<string, string>, boolean][]) {
    for (const text of ['', long]) {
      const h = harness(); h.ready(over); if (drop) dropHanamichiRows(h);
      setRule(h, text);
      assert.equal(problemOf(h), '', JSON.stringify(over) + ' ' + drop + ' ' + text.length);
      assert.equal(ping(h).settingsProblem, '');
      assert.equal('hanamichiRule' in ping(h), false);
    }
  }
});

test('R8-1 .gs ping: 花道のルールは、クラス分け＝あり かつ 花道の区分があるときだけ来る（前後の空白は取る）。鍵の並びは classes のあと', () => {
  const h = live(ON_BOTH);
  const initial = vm.runInContext('HANAMICHI_RULE_INITIAL', h.api) as string;
  assert.deepEqual(Object.keys(ping(h)), [...PING_BASE, 'weightMode', 'weights', 'classMode', 'classes', 'hanamichiRule']);
  assert.equal(ping(h).hanamichiRule, initial);
  setRule(h, '  ' + RULE + '  '); assert.equal(ping(h).hanamichiRule, RULE);
  const hn = live({ ...ON_BOTH, 花道の追加情報: 'あり', ロゴ: 'あり' });
  assert.deepEqual(Object.keys(ping(hn)), [...PING_BASE, 'logo', 'weightMode', 'weights', 'classMode', 'classes', 'hanamichiRule', 'hanamichiMode']);
  // 問題があるときは、設定の問題だけ（文も、クラスも来ない）
  setRule(h, ''); const bad = ping(h);
  assert.match(bad.settingsProblem, /「花道のルール」が空です/); assert.equal('hanamichiRule' in bad, false); assert.equal('classes' in bad, false);
  // 花道の区分の名前に「花道」が入る別の名前（全角・半角のちがい）でも来る
  const custom = harness(); custom.call('onOpen'); dropHanamichiRows(custom);
  custom.settingsSheet().rows.push(['階級：シニア花道Ａ', '-60、-70', '']); custom.fill(ON_BOTH); custom.call('setupTournament'); custom.call('openEntries');
  assert.equal(ping(custom).hanamichiRule, initial);
});

test('R8-1 .gs 保存: 花道の区分では、クラスを求めない・検査しない。送られても捨てて、クラスの列は空（申込原本19列目・OS取込用12列目）。本番もテストも', () => {
  for (const mode of ['live', 'test'] as const) {
    const h = live(ON_BOTH);
    const variants = [HN_DIV, '花道･男子(40歳以上)', ' 花道・男子（40歳以上） '];
    let n = 0;
    for (const division of variants) {
      for (const sent of [undefined, '', 'upper', 'lower', 'x', 'UPPER']) {
        const receipt = h.call('saveEntry_', h.params(mode, { division, weightClass: HN_WC, name: '架空花道' + (++n), ...(sent === undefined ? {} : { fighterClass: sent }) }));
        const { priv, os } = saved(h, mode);
        assert.equal(priv.at(-1)![0], receipt); assert.equal(priv.at(-1)![18], '', 'クラスは空：' + String(sent)); assert.equal(priv.at(-1)![19], HN_DIV, '区分は設定タブの名前'); assert.equal(priv.at(-1)![20], HN_WC_SAVED);
        assert.equal(os.at(-1)![11], '', 'OS取込用のクラスも空'); assert.equal(os.at(-1)![12], HN_DIV); assert.equal(os.at(-1)![13], HN_WC_SAVED);
      }
    }
    const mine = saved(h, mode).priv.slice(1).filter((r) => r[19] === HN_DIV);
    assert.equal(mine.length, n);
    // 「A」「B」と読まれる値は、どこにも無い
    assert.ok(mine.every((r) => r[18] === ''));
  }
});

test('R8-1 .gs 保存: 「花道」の入った別の区分の名前でも、クラスは空。花道ではない区分は、今までどおり必須（上は Aクラス・下は Bクラス）', () => {
  const h = harness(); h.call('onOpen'); h.settingsSheet().rows.push(['階級：シニア花道Ａ', '-60、-70', '']); h.fill(ON_BOTH); h.call('setupTournament'); h.call('openEntries');
  h.call('saveEntry_', h.params('live', { division: 'シニア花道Ａ', weightClass: '-70', fighterClass: 'upper' }));
  assert.equal(h.rows(PRIVATE).at(-1)![18], ''); assert.equal(h.rows(PRIVATE).at(-1)![19], 'シニア花道Ａ');
  // 花道ではない区分：クラスが無ければ断る（今までと同じ文）
  const error = thrown(() => h.call('saveEntry_', h.params('live', { division: '中学生男子', weightClass: '-37' })));
  assert.equal(error.code, 'class'); assert.equal(error.message, CLASS_MESSAGE); assert.equal(h.rows(PRIVATE).length, 2);
  h.call('saveEntry_', h.params('live', { division: '中学生男子', weightClass: '-37', fighterClass: 'lower' }));
  assert.equal(h.rows(PRIVATE).at(-1)![18], 'Bクラス');
  // 階級分け＝なし のときは、区分が無いので、花道の名前が送られても、クラスは必須のまま
  const noWeight = live({ クラス分け: 'あり' });
  assert.equal(thrown(() => noWeight.call('saveEntry_', noWeight.params('live', { division: HN_DIV, weightClass: HN_WC }))).code, 'class');
});

test('R8-1 .gs 保存: 花道の追加情報＝あり とならべても、花道プロフィールは1行、クラスは空。自動テストの最初の区分が花道でも、最後まで通る', () => {
  const h = live({ ...ON_BOTH, 花道の追加情報: 'あり' });
  h.call('saveEntry_', h.params('live', { division: HN_DIV, weightClass: HN_WC, fighterClass: 'upper', ...HN_ANSWERS }));
  assert.equal(h.rows('花道プロフィール').length, 2); assert.equal(h.rows(PRIVATE).at(-1)![18], '');
  // 自動テスト（① の架空の1件）：最初の区分が花道。クラスは「上」で送るが、捨てられて空
  const t = harness(); t.call('onOpen');
  const rows = t.settingsSheet().rows; for (const key of ['階級：小学生以下', '階級：中学生女子', '階級：中学生男子', '階級：高校生・一般女子', '階級：高校生・一般男子']) rows.splice(rows.findIndex((r: any[]) => r[0] === key), 1);
  t.fill(ON_BOTH); t.call('setupTournament');
  assert.equal(t.call('statusInfo_').testComplete, true);
  assert.equal(t.rows(TEST).at(-1)![19], '花道・女子（40歳以上）'); assert.equal(t.rows(TEST).at(-1)![18], ''); assert.equal(t.rows(TEST_OS).at(-1)![11], '');
});

test('R8-1 .gs 再送: 花道の同じ申込（同じ requestId）は同じ受付番号で、行は増えない。クラスが付いていてもいなくても「変わった」と言わない。昔の保存（クラスが入っていた行）も同じ', () => {
  const h = live(ON_BOTH);
  const p = h.params('live', { division: HN_DIV, weightClass: HN_WC, fighterClass: 'upper' });
  const receipt = h.call('saveEntry_', p), count = h.rows(PRIVATE).length;
  assert.equal(h.call('saveEntry_', { ...p }), receipt);
  assert.equal(h.call('saveEntry_', { ...p, fighterClass: 'lower' }), receipt, '捨てるので、ちがっても同じ');
  const noClass: Record<string, unknown> = { ...p }; delete noClass.fighterClass;
  assert.equal(h.call('saveEntry_', noClass), receipt);
  assert.equal(h.rows(PRIVATE).length, count); assert.equal(h.rows(OS).length, count);
  assert.match(html(h, { ...p }), /✓ 申し込みが完了しました/);
  // この変更の前のコードが、花道の人のクラスを保存していた行（Aクラス）への再送
  h.rows(PRIVATE).at(-1)![18] = 'Aクラス'; h.rows(OS).at(-1)![11] = 'Aクラス';
  assert.equal(h.call('saveEntry_', { ...p }), receipt, '保存ずみのクラスと比べない');
  assert.equal(h.rows(PRIVATE).length, count);
  // 区分がちがえば、今までどおり「変わった」
  assert.equal(thrown(() => h.call('saveEntry_', { ...p, division: '中学生男子', weightClass: '-37' })).code, 'changed');
});

test('R8-1 core/classRules: 出場区分が花道で、クラスが空の人は、「入っていない」と言わない。クラスが入っている花道の人・花道ではない人は、今までどおり', () => {
  const s = DEFAULT_CLASS_SETTINGS;
  assert.equal(classState(fighter({ division: '花道・男子（40歳以上）' }), s), 'ok');
  assert.equal(classState(fighter({ division: '花道・女子（40歳以上）', fighterClass: '' }), s), 'ok');
  assert.equal(classState(fighter({ division: '花道･男子', fighterClass: '  ' }), s), 'ok', '全角・半角・空白のちがいは見ない');
  assert.equal(classState(fighter({ division: 'シニア花道Ａ' }), null), 'ok', '設定が無いときも同じ');
  assert.equal(classState(fighter({ division: '花道・男子（40歳以上）', fighterClass: 'S' }), s), 'unknown');
  assert.equal(classState(fighter({ division: '花道・男子（40歳以上）', fighterClass: 'Bクラス' }), s), 'ok');
  for (const division of [undefined, '', '中学生男子', '高校生・一般男子', '小学生以下']) assert.equal(classState(fighter({ division }), s), 'blank', String(division));
  assert.equal(classState(undefined, s), 'blank');
});

test('R8-1 準備画面: 花道の人の空のクラスは「ちがうクラス」の赤い注意にも、「クラスが入っていない」の黄色にも入らない。ほかの人の空は、今までどおり黄色', () => {
  const hn1 = fighter({ id: 'h1', name: '架空花道一', division: HN_DIV, weightClass: HN_WC_SAVED }), hn2 = fighter({ id: 'h2', name: '架空花道二', division: HN_DIV, weightClass: HN_WC_SAVED });
  const a = fighter({ id: 'a', name: '架空甲', fighterClass: 'Aクラス', division: '高校生・一般男子', weightClass: '65kg以下' });
  const b = fighter({ id: 'b', name: '架空乙', fighterClass: 'Bクラス', division: '高校生・一般男子', weightClass: '65kg以下' });
  const blank = fighter({ id: 'c', name: '架空丙', division: '高校生・一般男子', weightClass: '65kg以下' });
  const trouble = classTrouble([hn1, hn2, a, b, blank], DEFAULT_CLASS_SETTINGS, true);
  assert.deepEqual(trouble.blank.map((f) => f.id), ['c'], '花道の人は、入っていない人に数えない');
  assert.deepEqual(trouble.unknown, []);
  assert.deepEqual(classTrouble([hn1, hn2], DEFAULT_CLASS_SETTINGS, true), { blank: [], unknown: [] });
  assert.deepEqual(classTrouble([hn1, blank], DEFAULT_CLASS_SETTINGS, false), { blank: [], unknown: [] }, 'クラスを使わない大会は、今までどおり空');
  // 赤と青のクラスがちがう注意：花道どうし・花道と他のクラスで出ない
  for (const [x, y] of [[hn1, hn2], [hn1, a], [b, hn2]]) { assert.equal(boutClassWarning(x, y), ''); assert.equal(classMixMessage(x, y, DEFAULT_CLASS_SETTINGS), null); }
  assert.notEqual(boutClassWarning(a, b), '', 'AとBは、今までどおり注意');
  // 当日の画面の一覧：クラスの札は出さず（空）、区分の札だけ。ちがうクラスの印も出ない
  const byId = new Map([hn1, hn2, a].map((f) => [f.id, f] as const));
  const bout = (id: string, redId: string, blueId: string): LocalBout => ({ id, redId, blueId, className: '', rule: '' });
  const rows = [buildRow(bout('x1', 'h1', 'h2'), 0, byId, false, 0), buildRow(bout('x2', 'h1', 'a'), 1, byId, false, 0)];
  for (const row of rows) { assert.equal(row.red.fighterClass, ''); assert.equal(row.classMix, false); assert.equal(row.red.weightTag, HN_DIV + '・' + HN_WC_SAVED); }
  assert.equal(rows[1].blue.fighterClass, 'Aクラス');
  // A3 の一覧表：選手のそばの札は、出場区分・階級だけ（クラスの文字が無い）
  const sheet = sheetBouts({ fighters: [hn1, hn2, a], bouts: [bout('x1', 'h1', 'h2'), bout('x2', 'h1', 'a')] }, DEFAULT_SHOW);
  assert.equal(sheet[0].red.tag, HN_DIV + '・' + HN_WC_SAVED); assert.ok(!/クラス/.test(sheet[0].red.tag + sheet[0].blue.tag));
  assert.equal(sheet[1].blue.tag, 'Aクラス　高校生・一般男子・65kg以下');
});

test('R8-1 取り込み: OS取込用の花道の行は、クラスが空でよい。クラスの列があっても、花道の行だけ空でも、読める', () => {
  const header = '管理番号,ジム名,選手名,学年,年齢,身長,体重,戦績・競技歴,試合への意気込み,入場曲URL（Apple Music推奨）,顔写真URL,クラス,区分,階級';
  const csv = [header, 'T-1,架空ジム,架空花道一,,45,170,65,初試合,,,,,花道・男子（40歳以上）,70kg以下', 'T-2,架空ジム,架空甲,,20,170,65,初試合,,,,Aクラス,高校生・一般男子,65kg以下', 'T-3,架空ジム,架空丙,,20,170,65,初試合,,,,,高校生・一般男子,65kg以下'].join('\r\n');
  const result = importFighters(csv);
  assert.equal(result.fighters.length, 3); assert.equal(result.hasClassColumn, true);
  assert.equal('fighterClass' in result.fighters[0], false, '花道の行：クラスは空のまま（A でも B でもない）'); assert.equal(result.fighters[0].division, HN_DIV);
  assert.equal(result.fighters[1].fighterClass, 'Aクラス');
  const trouble = classTrouble(result.fighters, DEFAULT_CLASS_SETTINGS, true);
  assert.deepEqual(trouble.blank.map((f) => f.id), ['T-3'], '数えるのは、花道ではない空の人だけ');
});

test('R8-1 文を持たない: app/・core/・scripts/・tests/ に、花道のルールの本物の文は無い（文は .gs の初期値と docs にだけある）', () => {
  const needles = ['90秒' + '×' + '2ラウンド', 'インターバル' + '1分）', '花道（シニア）' + 'のルール：'];
  const hits: string[] = [];
  const walk = (dir: URL): void => {
    for (const name of readdirSync(dir)) {
      if (['node_modules', '.next', 'out', 'out-private-pages'].includes(name)) continue;
      const url = new URL(name + (statSync(new URL(name, dir)).isDirectory() ? '/' : ''), dir);
      if (url.pathname.endsWith('/')) { walk(url); continue; }
      if (!/\.(ts|tsx|mjs|js|css)$/.test(name)) continue;
      const text = readFileSync(url, 'utf8');
      if (needles.some((needle) => text.includes(needle))) hits.push(url.pathname.split('/uizin-eventos/').pop()!);
    }
  };
  for (const dir of ['../app/', '../core/', '../scripts/', '../tests/']) walk(new URL(dir, import.meta.url));
  assert.deepEqual(hits, []);
  const gs = readFileSync(new URL('../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8');
  assert.equal(gs.split("const HANAMICHI_RULE_INITIAL = '").length - 1, 1, '.gs の初期の文は、定数1つ');
  assert.ok(needles.every((needle) => gs.includes(needle)));
});
