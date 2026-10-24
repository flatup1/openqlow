// 花道の追加情報（Googleの受付）。設定の行・設定の直しもの・ping・タブ・サーバー側の検査・1行の書き込み・再送・テストモード。
// 実名は使わない（『架空花道一郎』など）。「なし」のときの動きは tests/hanamichiGolden.test.ts が固定している。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { harness, script } from './helpers/gasV3Harness.ts';
import { HANAMICHI_BAD_MESSAGE, HANAMICHI_ITEMS, HANAMICHI_KEYS, HANAMICHI_MISSING_MESSAGE, HANAMICHI_SHEET_HEADERS, hanamichiClean, isHanamichiDivision, isRealPastDate, validateHanamichi } from '../core/hanamichi.ts';
import { diagnose, parsePing, settingLines } from '../core/setupV3.ts';

const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', TEST_OS = 'テストOS取込用';
// くわしい戦績の表（①で作る。新しい版のシートだけ。花道の2つのあとに作られる）
const DETAIL = '戦績詳細', DETAIL_TEST = 'テスト戦績詳細';
const HN_TAB = '花道プロフィール', HN_TEST_TAB = 'テスト花道プロフィール';
const ROW = '花道の追加情報';
const ON = { 階級分け: 'あり', [ROW]: 'あり' };
const HN_DIVISION = '花道・男子（40歳以上）';
/** 架空の答え（実名ではない） */
const HN = { hnNameKana: 'カクウハナミチイチロウ', hnGymKana: 'カクウジムエー', hnRing: '架空の花', hnRingKana: 'カクウノハナ', hnBirth: '1975-04-05', hnKickYears: '3', hnPerWeek: '2', hnOther: '空手', hnJob: '会社員', hnHobby: '釣り', hnReason: '健康のため', hnMessage: 'リングで会いましょう' };
type H = ReturnType<typeof harness>;
const ping = (h: H) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
const html = (h: H, params: any): string => String(h.call('doPost', { parameter: params }).html);
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const entry = (h: H, mode: 'test' | 'live', over: Record<string, string> = {}, hn: Record<string, string> = HN) => h.params(mode, { division: HN_DIVISION, weightClass: '-70', gym: '架空ジムA', name: '架空花道一郎', ...hn, ...over });
const live = (over: Record<string, string> = {}) => { const h = harness(); h.ready({ ...ON, ...over }); h.call('openEntries'); return h; };
const tabs = (h: H) => [...h.book.sheets.keys()];
const sizes = (h: H) => Object.fromEntries([PRIVATE, OS, TEST, TEST_OS, HN_TAB, HN_TEST_TAB].map((n) => [n, h.book.getSheetByName(n)?.rows.length ?? -1]));
const thrown = (fn: () => unknown): any => { try { fn(); } catch (e) { return e; } assert.fail('投げなかった'); };
const without = (h: H, key: string) => { const rows = h.settingsSheet().rows; const i = rows.findIndex((r: any[]) => r[0] === key); assert.ok(i >= 0, key); rows.splice(i, 1); };
/** 設定の直しもの（ping の settingsProblem と同じ文）。タブの有無とは別に、設定だけを見る */
const settingsProblem = (h: H): string => (h.call('settingsProblems_', h.call('S_')) as string[]).join('。');
const SENTENCE = '花道の追加の質問に、答えていない所があります。申込ページにもどって、入れてから、もう一度送ってください。';

/* ───────── 設定の行 ───────── */

test('設定の行: 「花道の追加情報」は、誓約書の4行の前（B30）。花道のルールの行は、そのいちばん下（B35）。初期値は「なし」。▼は なし／あり。既存の行の位置（B21・B22）は動かない', () => {
  const h = harness(); h.call('onOpen');
  const rows = h.rows('設定'), labels = rows.slice(1).map((r) => r[0]);
  assert.equal(labels.at(-6), ROW); assert.equal(labels.indexOf(ROW) + 2, 30, 'B30'); assert.equal(rows.length, 35, '花道の行のあとに、誓約書の4行と、花道のルールの1行'); assert.equal(labels.at(-1), '花道のルール');
  assert.equal(labels.indexOf('階級分け') + 2, 21); assert.equal(labels.indexOf('ロゴ') + 2, 22);
  const row = rows[29]!;
  assert.deepEqual(json(row), [ROW, 'なし', '「あり」にすると、区分の名前に「花道」が入っている区分を選んだ人にだけ、追加の質問が出ます。']);
  const rule = h.settingsSheet().validations.get('30:2');
  assert.deepEqual(json(rule.list), ['なし', 'あり']); assert.equal(rule.allowInvalid, false);
  assert.equal(h.settingsSheet().backgrounds.get('30:2'), undefined, '会長が必ず書く7つではないので、色は付けない');
  assert.equal(String(h.settingsSheet().formats.get('30:2')), '@', 'B列は文字の形');
});

test('設定の行: 行が無い古いシートは、「なし」と読む。シートを開く・①で、いちばん下に花道の1行と誓約書の4行だけ足される（書いてあるマスは書き換えない）', () => {
  const h = harness(); h.ready(); without(h, ROW); for (const label of ['誓約書', '保護者の同意', 'ジム責任者の同意', '誓約書の文の確認', '花道のルール']) without(h, label);
  h.settingsSheet().rows[1][1] = '私の大会';
  const body = ping(h);
  assert.equal(body.settingsProblem, ''); assert.equal('hanamichiMode' in body, false);
  assert.equal(h.call('S_').hanamichi, false);
  const before = JSON.stringify(h.rows('設定'));
  h.call('onOpen');
  assert.equal(h.rows('設定').length, 35);
  assert.equal(JSON.stringify(h.rows('設定').slice(0, 29)), before, 'いまある29行は1マスも変わらない');
  assert.deepEqual(json(h.rows('設定')[29]), [ROW, 'なし', '「あり」にすると、区分の名前に「花道」が入っている区分を選んだ人にだけ、追加の質問が出ます。']);
  assert.deepEqual(json(h.settingsSheet().validations.get('30:2').list), ['なし', 'あり'], '足した行にも▼が付く');
  h.call('onOpen'); h.call('setupTournament'); assert.equal(h.rows('設定').length, 35, '2回目以降は増えない');
  assert.deepEqual(tabs(h), ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS, DETAIL, DETAIL_TEST], '「なし」では花道のタブは作らない');
});

test('設定の行: 書いてある値だけで決まる。あり／なし以外は、直しもの。空は なし', () => {
  const h = harness(); h.ready(ON);
  assert.equal(h.call('S_').hanamichi, true);
  for (const v of ['なし', '']) { h.setSetting(ROW, v); assert.equal(h.call('S_').hanamichi, false, JSON.stringify(v)); assert.equal(settingsProblem(h), ''); assert.equal('hanamichiMode' in ping(h), false); }
  for (const v of ['はい', 'あり。', 'ON', 'ありです']) {
    h.setSetting(ROW, v);
    assert.equal(h.call('S_').hanamichi, false, v + ' は「あり」ではない');
    assert.equal(settingsProblem(h), '「花道の追加情報」は、あり／なしのどれかにしてください', v);
    assert.equal('hanamichiMode' in ping(h), false);
  }
});

/* ───────── 設定の直しもの ───────── */

test('設定の直しもの: 「あり」なのに、区分に「花道」の入った名前が1つも無い／階級分けが なし → 1文・直し方つき・場所は「A列が「花道の追加情報」の行のB列」', () => {
  const MESSAGE = '「花道の追加情報」が「あり」ですが、選べる区分に「花道」の入った名前がありません（「階級分け」を「あり」にして、区分の名前に「花道」を入れるか、A列が「花道の追加情報」の行のB列を「なし」にしてください）';
  const cases: [string, (h: H) => void][] = [
    ['階級分けが なし', (h) => { h.setSetting('階級分け', 'なし'); }],
    ['階級分けが あり でも、花道の区分が無い', (h) => { for (const label of ['階級：花道・女子（40歳以上）', '階級：花道・男子（40歳以上）']) without(h, label); }],
    ['区分の名前を、花道が入らない名前に直した', (h) => { for (const r of h.settingsSheet().rows) if (/^階級：花道/.test(r[0])) r[0] = r[0].replace('花道', '華道'); }],
    ['区分の行が1つも無い', (h) => { const rows = h.settingsSheet().rows; for (let i = rows.length - 1; i >= 0; i--) if (/^階級：/.test(rows[i][0])) rows.splice(i, 1); }],
  ];
  for (const [label, change] of cases) {
    const h = harness(); h.ready(ON); h.call('openEntries'); change(h);
    const problems = h.call('settingsProblems_', h.call('S_')) as string[];
    const mine = problems.filter((p) => p.includes(ROW));
    assert.deepEqual(json(mine), [MESSAGE], label + '：花道の直しものは1文だけ');
    assert.ok(!MESSAGE.includes('。'), '1文（文の中に「。」を入れない）');
    const body = ping(h);
    assert.ok(body.settingsProblem.includes(MESSAGE), label + '：ping が直す所を言う'); assert.equal('hanamichiMode' in body, false, label + '：問題があるときは印を出さない');
    assert.equal(diagnose(parsePing({ ...body })).stage, 'bad-settings');
    // 画面の「設定の直しもの」の仕組み：セルの番号は言わず、A列の名前で探してもらう
    const lines = settingLines('シートの「設定」タブを直してください。' + body.settingsProblem).filter((l) => l.google.includes(ROW));
    assert.equal(lines.length, 1, label); assert.equal(lines[0].fixes.length, 1); assert.equal(lines[0].fixes[0], MESSAGE);
    assert.ok(!/セル B\d+/.test(lines[0].fixes[0]), '区分の行は消せるので、行の番号は言わない');
  }
});

test('設定の直しもの: 「なし」・空のときは、区分が何であっても、止めない。花道の区分があれば 問題なし', () => {
  const h = harness(); h.ready({ 階級分け: 'なし' });
  assert.equal(settingsProblem(h), '');
  h.setSetting(ROW, 'あり'); assert.match(settingsProblem(h), /「花道の追加情報」が「あり」ですが/);
  h.setSetting('階級分け', 'あり'); assert.equal(settingsProblem(h), '');
  h.setSetting(ROW, 'なし'); for (const r of h.settingsSheet().rows) if (/^階級：花道/.test(r[0])) r[0] = r[0].replace('花道', '華道');
  assert.equal(settingsProblem(h), '', 'なし なら、花道の区分が無くてもよい');
  // 区分の名前の中の花道は、全角・半角・空白のちがいを見ない
  const k = harness(); k.ready(ON);
  let n = 0; for (const r of k.settingsSheet().rows) if (/^階級：花道/.test(r[0])) r[0] = '階級：ＣＫＡ 花\u200B道 部門' + ++n;
  assert.equal(settingsProblem(k), '');
});

test('設定の直しもの: ほかの直しものといっしょに出ても、順番を乱さない（既存の直しものが先、花道は階級のあと）', () => {
  const h = harness(); h.ready(ON); h.call('openEntries');
  h.setSetting('階級分け', 'たぶん'); h.setSetting('会場', '');
  const problems = h.call('settingsProblems_', h.call('S_')) as string[];
  assert.equal(problems[0], '「設定」タブの、次の欄を入れてください：会場');
  assert.equal(problems[1], '「階級分け」は、あり／なしのどれかにしてください');
  assert.ok(problems.at(-1)!.startsWith('「花道の追加情報」が「あり」ですが'));
  // 受付中に壊れたら、本番の新しい申込は受けない（これまでと同じ）
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live'))).code, 'setup');
});

test('settingLines: 値のまちがいにも、場所（A列が「花道の追加情報」の行のB列）を言う。ほかの行の言い方は変わらない', () => {
  const h = harness(); h.ready(ON); h.call('openEntries'); h.setSetting(ROW, 'たぶん');
  const lines = settingLines('シートの「設定」タブを直してください。' + settingsProblem(h));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].fixes[0], '「花道の追加情報」は、あり／なしのどれかにしてください（「設定」タブの、A列が「花道の追加情報」の行のB列。▼から選び直す）');
  assert.equal(settingLines('シートの「設定」タブを直してください。「ロゴ」は、あり／なしのどれかにしてください')[0].fixes[0], '「ロゴ」は、あり／なしのどれかにしてください（セル B22）', 'ロゴの言い方は、そのまま');
});

/* ───────── ping ───────── */

test('ping: 「あり」で問題なしのときだけ hanamichiMode: true が1つ増える。個人情報・項目名・タブの名前は出ない。「なし」では鍵が1つも増えない', () => {
  const off = harness(); off.ready({ 階級分け: 'あり' }); off.call('openEntries');
  const on = harness(); on.ready(ON); on.call('openEntries');
  const offKeys = Object.keys(ping(off)), onKeys = Object.keys(ping(on));
  assert.deepEqual(onKeys, [...offKeys, 'hanamichiMode'], '鍵は hanamichiMode だけが増え、いちばん後ろに来る');
  assert.equal(ping(on).hanamichiMode, true);
  assert.ok(!offKeys.includes('hanamichiMode'));
  const body = JSON.stringify(ping(on));
  for (const word of ['hn', '花道プロフィール', 'テスト花道プロフィール', '生年月日', 'リングネーム', 'カクウ']) assert.ok(!body.includes(word), word);
  assert.equal(body.replace(/"hanamichiMode":true/, '').includes('hanamichi'), false, '印の名前のほかに、花道の語を出さない');
  assert.equal(Object.keys(ping(on).weights).sort().join(), 'divisions,enabled', '区分の表は これまでと同じ形');
  // 画面側の読み取り：true だけを受け取る
  assert.equal(parsePing(ping(on)).hanamichiMode, true); assert.equal('hanamichiMode' in parsePing(ping(off)), false);
});

test('ping: 設定の問題・見出しの問題があるあいだは、印を出さない。直ると出る', () => {
  const h = harness(); h.ready(ON); h.call('openEntries');
  assert.equal(ping(h).hanamichiMode, true);
  h.setSetting('会場', ''); assert.equal('hanamichiMode' in ping(h), false);
  h.setSetting('会場', '体育館'); assert.equal(ping(h).hanamichiMode, true);
  h.setSetting(ROW, 'なし'); assert.equal('hanamichiMode' in ping(h), false);
});

/* ───────── ① 最初の設定：タブ ───────── */

test('① 最初の設定: 「あり」なら、花道プロフィールとテスト花道プロフィールの2つを作る。見出しは決まった順。全マスが文字の形。見出しは保護', () => {
  const h = harness(); h.ready(ON);
  assert.deepEqual(tabs(h), ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS, HN_TAB, HN_TEST_TAB, DETAIL, DETAIL_TEST]);
  const headers = ['受付番号', '申込日時', '所属ジム', '選手名', '氏名のフリガナ', '所属ジムのフリガナ', 'リングネーム', 'リングネームのフリガナ', '生年月日', 'キック歴（年）', '練習頻度（週に何回）', '他格闘歴', '職業', '趣味・特技', '始めた理由・良かった所', 'メッセージ'];
  for (const name of [HN_TAB, HN_TEST_TAB]) {
    const sheet = h.book.getSheetByName(name);
    assert.deepEqual(json(sheet.rows), [headers], name + ' は見出しだけ');
    assert.equal(sheet.protections.length, 1, name + ' の見出しは保護される'); assert.equal(sheet.protections[0].prot.warningOnly, true);
    for (const [r, c] of [[1, 1], [2, 1], [2, 9], [2, 16], [50, 10], [1000, 16]]) assert.equal(sheet.formats.get(r + ':' + c), '@', name + ' ' + r + ':' + c + ' は文字の形');
    assert.equal(sheet.formats.get('2:17'), undefined, '見出しの列の外は触らない');
  }
  assert.deepEqual(headers, [...HANAMICHI_SHEET_HEADERS], 'core の見出しと同じ');
  assert.equal(h.rows(TEST).length, 2, '自動テストの1件は、これまでどおり'); assert.equal(h.rows(HN_TEST_TAB).length, 1, '自動テストの区分は花道ではないので、花道の行は書かない');
  assert.equal(h.call('statusInfo_').testComplete, true);
});

test('① 最初の設定: 「なし」なら作らない。あとで「あり」にして①を押すと作る。もう一度押しても、あるタブの中身は1マスも変えない', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' });
  assert.deepEqual(tabs(h), ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS, DETAIL, DETAIL_TEST]);
  h.setSetting(ROW, 'あり'); h.call('setupTournament');
  // タブの並びは、作った順。戦績詳細は最初の①で作られ、花道プロフィールはあとから足したので、そのあとに並ぶ
  assert.deepEqual(tabs(h), ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS, DETAIL, DETAIL_TEST, HN_TAB, HN_TEST_TAB]);
  // 会長が書き足した行・書き換えたマスは、①で変わらない
  const sheet = h.book.getSheetByName(HN_TAB); sheet.rows.push(['メモ', 'そのまま']);
  const snapshot = JSON.stringify(h.book.getSheetByName(HN_TAB).rows), formats = h.book.getSheetByName(HN_TAB).formats.size, prot = h.book.getSheetByName(HN_TAB).protections.length;
  h.call('setupTournament'); h.call('onOpen');
  assert.equal(JSON.stringify(h.book.getSheetByName(HN_TAB).rows), snapshot); assert.equal(h.book.getSheetByName(HN_TAB).formats.size, formats); assert.equal(h.book.getSheetByName(HN_TAB).protections.length, prot);
  // 「なし」にもどしても、タブは消さない
  h.setSetting(ROW, 'なし'); h.call('setupTournament');
  assert.deepEqual(tabs(h), ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS, DETAIL, DETAIL_TEST, HN_TAB, HN_TEST_TAB]);
});

test('① 最初の設定: 先にタブがあって見出しがちがうときは、何も書き換えずに止まる（ほかのタブと同じ）。空のタブには見出しだけ書く', () => {
  const h = harness(); h.ready(); h.setSetting('階級分け', 'あり'); h.setSetting(ROW, 'あり');
  const bad = h.book.insertSheet(HN_TAB); bad.rows.push(['受付番号', 'ちがう見出し']);
  const before = JSON.stringify(bad.rows);
  const error = thrown(() => h.call('setupTournament'));
  assert.equal(error.code, 'headers'); assert.match(error.message, /「花道プロフィール」タブのB1が「ちがう見出し」になっています。「申込日時」に直してください/);
  assert.match(error.message, /このタブを消さず/, '個人情報のタブなので、消さずにジムの担当者に聞く');
  assert.equal(JSON.stringify(bad.rows), before); assert.equal(h.book.getSheetByName(HN_TEST_TAB), null, '止まったときは、ほかのタブも作らない');
  const empty = harness(); empty.ready(); empty.setSetting('階級分け', 'あり'); empty.setSetting(ROW, 'あり'); empty.book.insertSheet(HN_TAB);
  empty.call('setupTournament'); assert.deepEqual(json(empty.rows(HN_TAB)), [[...HANAMICHI_SHEET_HEADERS]]);
});

test('① 最初の設定: 個人情報のタブは、右はしの見出しが空でも、自動で書き足さない（あるときは1マスも変えない）。直すマスを言って止まる', () => {
  const h = harness(); h.ready(); h.setSetting('階級分け', 'あり'); h.setSetting(ROW, 'あり');
  const old = h.book.insertSheet(HN_TAB); old.rows.push([...HANAMICHI_SHEET_HEADERS.slice(0, 15), '']);
  const before = JSON.stringify(old.rows);
  const error = thrown(() => h.call('setupTournament'));
  assert.equal(error.code, 'headers'); assert.match(error.message, /「花道プロフィール」タブのP1が（空）になっています。「メッセージ」に直してください/);
  assert.equal(JSON.stringify(old.rows), before); assert.equal(old.protections.length, 0, '保護も足さない'); assert.equal(h.book.getSheetByName(HN_TEST_TAB), null);
  const body = ping(h);
  assert.equal(body.error, 'headers'); assert.equal(body.errorTab, HN_TAB); assert.equal(body.errorCell, 'P1'); assert.equal(body.errorExpected, 'メッセージ');
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live'))).code, 'headers');
});

test('① 最初の設定: 設定に直しものがあるあいだ（花道の区分が無い）は、タブを作らずに止まる', () => {
  const h = harness(); h.call('onOpen'); h.fill({ 階級分け: 'なし', [ROW]: 'あり' });
  const error = thrown(() => h.call('setupTournament'));
  assert.match(error.message, /「花道の追加情報」が「あり」ですが、選べる区分に「花道」の入った名前がありません/);
  assert.deepEqual(tabs(h), ['シート1', '設定']);
  assert.equal(h.props.get('eventId'), undefined);
});

test('花道のタブが消えたら: ping は missing とタブの名前を言い、受付は何も書かずに止まる。①で見出しだけの新しいタブができる', () => {
  const h = live(); const book = h.book;
  book.sheets.delete(HN_TAB);
  const body = ping(h);
  assert.equal(body.ready, false); assert.equal(body.error, 'missing'); assert.equal(body.errorTab, HN_TAB);
  assert.equal(diagnose(parsePing(body)).stage, 'missing-tab');
  const before = sizes(h);
  const error = thrown(() => h.call('saveEntry_', entry(h, 'live')));
  assert.equal(error.code, 'missing'); assert.match(error.message, /「花道プロフィール」タブが見つからない/); assert.match(error.message, /先にジムの担当者に聞いてください/);
  assert.equal(error.publicMessage, 'ただいま受付に問題があります。主催者へご連絡ください。', '選手には直し方を言わない');
  assert.deepEqual(sizes(h), before);
  h.call('setupTournament'); assert.deepEqual(json(h.rows(HN_TAB)), [[...HANAMICHI_SHEET_HEADERS]]);
  assert.equal(h.call('saveEntry_', entry(h, 'live')).length > 5, true);
});

test('花道のタブの見出しが壊れたら: ping は headers とマスを言い、受付は止まる', () => {
  const h = live(); h.book.getSheetByName(HN_TAB).rows[0][8] = '誕生日';
  const body = ping(h);
  assert.equal(body.error, 'headers'); assert.equal(body.errorTab, HN_TAB); assert.equal(body.errorCell, 'I1'); assert.equal(body.errorExpected, '生年月日');
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live'))).code, 'headers');
});

/* ───────── 保存 ───────── */

test('保存（本番・花道の区分）: 申込原本とOS取込用は、これまでと同じ列・同じ値。花道プロフィールに、1行だけ増える', () => {
  const h = live();
  const p = entry(h, 'live');
  const receipt = h.call('saveEntry_', p);
  assert.equal(h.rows(PRIVATE).length, 2); assert.equal(h.rows(OS).length, 2); assert.equal(h.rows(HN_TAB).length, 2); assert.equal(h.rows(HN_TEST_TAB).length, 1, 'テスト用には書かない');
  const main = json(h.rows(PRIVATE).at(-1)), os = json(h.rows(OS).at(-1));
  assert.equal(main.length, 21); assert.equal(os.length, 14);
  assert.equal(main[19], HN_DIVISION); assert.equal(main[20], '70kg以下');
  const row = json(h.rows(HN_TAB).at(-1));
  assert.equal(row.length, 16);
  assert.equal(row[0], receipt, '受付番号'); assert.equal(row[0], main[0]); assert.equal(row[1], String(h.rows(PRIVATE).at(-1)![1]), '申込日時は、申込原本と同じ');
  assert.deepEqual(row.slice(2), ['架空ジムA', '架空花道一郎', HN.hnNameKana, HN.hnGymKana, HN.hnRing, HN.hnRingKana, '1975-04-05', '3', '2', HN.hnOther, HN.hnJob, HN.hnHobby, HN.hnReason, HN.hnMessage]);
  assert.ok(row.every((v: unknown) => typeof v === 'string'), '数字も日付も、文字のまま');
  // 個人情報は、花道プロフィールにだけ。ほかのどこにも出ない
  const secrets = [HN.hnNameKana, HN.hnRing, '1975-04-05', HN.hnJob, HN.hnMessage, HN.hnReason, HN.hnHobby];
  for (const [name, sheet] of h.book.sheets as Map<string, any>) if (name !== HN_TAB) for (const s of secrets) assert.ok(!JSON.stringify(sheet.rows).includes(s), name + ' に ' + s + ' が入っていない');
  for (const s of secrets) { assert.ok(!JSON.stringify(ping(h)).includes(s)); assert.ok(!h.logs.join('\n').includes(s)); assert.ok(![...h.props.values()].join('\n').includes(s)); }
  // 名簿ZIPにも出ない
  h.call('exportTournament');
  const csv = h.zips.at(-1).find((f: any) => f.name === 'players.csv').bytes.toString('utf8');
  const off = harness(); off.ready({ 階級分け: 'あり' }); off.call('openEntries'); off.call('saveEntry_', entry(off, 'live')); off.call('exportTournament');
  const offCsv = off.zips.at(-1).find((f: any) => f.name === 'players.csv').bytes.toString('utf8');
  assert.equal(csv.split('\r\n')[0], offCsv.split('\r\n')[0], 'CSVの列は、「なし」のときと同じ'); assert.equal(csv.split('\r\n')[0].split(',').length, 13);
  for (const s of secrets) assert.ok(!csv.includes(s), 'CSVに ' + s + ' が入っていない');
  assert.deepEqual(json(h.zips.at(-1).map((f: any) => f.name).filter((n: string) => !n.startsWith('photos/'))), ['players.csv']);
});

test('保存: 既存の行を書いたあと（申込原本 → OS取込用 → 花道プロフィール）、同じロックの中で書く', () => {
  const h = live();
  const events: string[] = []; let held = 0;
  h.api.LockService = { getScriptLock: () => ({ tryLock: () => { held++; events.push('lock'); return true; }, releaseLock: () => { held--; events.push('unlock'); } }) };
  for (const [name, tag] of [[PRIVATE, 'private'], [OS, 'os'], [HN_TAB, 'profile']]) {
    const sheet = h.book.getSheetByName(name), getRange = sheet.getRange, appendRow = sheet.appendRow;
    sheet.getRange = (...a: any[]) => { const range = getRange(...a), setValues = range.setValues; range.setValues = (v: any) => { events.push(tag + (held ? '' : '!ロックの外')); return setValues(v); }; return range; };
    sheet.appendRow = (v: any) => { events.push(tag + (held ? '' : '!ロックの外')); return appendRow(v); };
  }
  h.call('saveEntry_', entry(h, 'live'));
  assert.deepEqual(events, ['lock', 'private', 'os', 'profile', 'unlock']);
});

test('保存（テストモード）: 花道の区分でも、テスト花道プロフィールに書く。本番の花道プロフィールには書かない。受付番号は TEST-', () => {
  const h = live();
  const receipt = h.call('saveEntry_', entry(h, 'test'));
  assert.match(receipt, /^TEST-/);
  assert.equal(h.rows(HN_TAB).length, 1); assert.equal(h.rows(HN_TEST_TAB).length, 2);
  assert.equal(json(h.rows(HN_TEST_TAB).at(-1))[0], receipt); assert.equal(json(h.rows(HN_TEST_TAB).at(-1))[6], HN.hnRing);
  assert.equal(h.rows(PRIVATE).length, 1, '本番の申込原本にも入らない');
  assert.equal(h.rows(TEST).at(-1)![0], receipt);
});

test('保存（再送）: 同じ requestId の再送では、どの表の行も増えない。同じ受付番号を返す。結果の画面も 緑の ✓', () => {
  const h = live(); const p = entry(h, 'live');
  const first = h.call('saveEntry_', p); const before = JSON.stringify(sizes(h));
  const hn = JSON.stringify(h.rows(HN_TAB));
  for (let i = 0; i < 3; i++) assert.equal(h.call('saveEntry_', p), first);
  assert.equal(JSON.stringify(sizes(h)), before); assert.equal(JSON.stringify(h.rows(HN_TAB)), hn, '花道プロフィールの行は、書き換えない');
  assert.match(html(h, p), /✓ 申し込みが完了しました/); assert.equal(JSON.stringify(sizes(h)), before);
  // テストモードの再送も同じ
  const t = entry(h, 'test'); h.call('saveEntry_', t); const after = JSON.stringify(sizes(h));
  h.call('saveEntry_', t); assert.equal(JSON.stringify(sizes(h)), after);
});

test('保存（再送）: 前の送信が、申込原本・OS取込用のあと、花道プロフィールの前で止まっていたら、再送で花道の行を足す（1行だけ）', () => {
  const h = live(); const p = entry(h, 'live');
  const receipt = h.call('saveEntry_', p);
  h.book.getSheetByName(HN_TAB).rows.length = 1; // 花道の行だけ無い状態
  assert.equal(h.call('saveEntry_', p), receipt);
  assert.equal(h.rows(HN_TAB).length, 2); assert.equal(h.rows(PRIVATE).length, 2); assert.equal(h.rows(OS).length, 2);
  assert.equal(json(h.rows(HN_TAB))[1][0], receipt);
  assert.equal(h.call('saveEntry_', p), receipt); assert.equal(h.rows(HN_TAB).length, 2);
});

test('保存: 花道でない区分では、花道の値が送られても、見ずに捨てる（まちがった値でも、エラーにしない）。花道の行は書かない', () => {
  const h = live();
  const bad = { hnBirth: '2999-99-99', hnKickYears: 'たくさん', hnRing: 'あ'.repeat(500), hnMessage: '=1+1' };
  for (const division of ['中学生男子', '小学生以下', '高校生・一般男子']) {
    const weightClass = division === '小学生以下' ? '' : '-50';
    const p = entry(h, 'live', { division, weightClass: division === '中学生男子' ? '-37' : weightClass }, { ...HN, ...bad });
    const receipt = h.call('saveEntry_', p);
    assert.equal(h.rows(PRIVATE).at(-1)![0], receipt); assert.equal(h.rows(PRIVATE).at(-1)![19], division);
  }
  assert.equal(h.rows(HN_TAB).length, 1, '花道の行は書かない');
  for (const [name, sheet] of h.book.sheets as Map<string, any>) assert.ok(!JSON.stringify(sheet.rows).includes('2999-99-99') && !JSON.stringify(sheet.rows).includes(HN.hnJob), name);
  // 花道の鍵が 1つも無くても、花道でない区分は通る
  const plain = h.params('live', { division: '中学生男子', weightClass: '-40' });
  assert.ok(h.call('saveEntry_', plain));
});

test('保存: 「なし」のときは、花道の区分でも、花道の値を見ずに捨てる（古いシート・設定なし）', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' }); h.call('openEntries');
  assert.ok(h.call('saveEntry_', entry(h, 'live', {}, { ...HN, hnBirth: '9999-99-99' })));
  assert.ok(h.call('saveEntry_', entry(h, 'live', {}, {})));
  assert.deepEqual(tabs(h), ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS, DETAIL, DETAIL_TEST]);
  assert.equal(h.rows(PRIVATE).length, 3);
  for (const [name, sheet] of h.book.sheets as Map<string, any>) assert.ok(!JSON.stringify(sheet.rows).includes(HN.hnRing), name);
});

test('保存: 階級分けが「あり」の区分名は、全角・半角・空白のちがいがあっても同じ区分。花道の語を含む別名の区分も花道として扱う', () => {
  const h = live();
  const p = entry(h, 'live', { division: '花道・男子(40歳以上)' });
  h.call('saveEntry_', p); assert.equal(h.rows(HN_TAB).length, 2);
  const q = entry(h, 'live', { division: ' 花道・男子 （40歳以上） ' }); h.call('saveEntry_', q); assert.equal(h.rows(HN_TAB).length, 3);
  // 女子の花道も
  const w = entry(h, 'live', { division: '花道・女子（40歳以上）', weightClass: '-55' }); h.call('saveEntry_', w); assert.equal(h.rows(HN_TAB).length, 4);
});

/* ───────── サーバー側の検査 ───────── */

test('検査: 必須の項目が1つでも空なら、赤い失敗（コード hanamichi）。何も書かず、写真も保存しない', () => {
  const h = live(); const before = JSON.stringify(sizes(h)), resources = h.resources.size, props = JSON.stringify([...h.props.entries()]);
  const required = HANAMICHI_ITEMS.filter((item) => item.required).map((item) => item.key);
  assert.deepEqual(required, ['hnNameKana', 'hnGymKana', 'hnRing', 'hnRingKana', 'hnBirth', 'hnKickYears', 'hnPerWeek', 'hnHobby', 'hnReason', 'hnMessage']);
  for (const key of required) for (const empty of ['', '   ', '\u200B\u3000']) {
    const error = thrown(() => h.call('saveEntry_', entry(h, 'live', { [key]: empty })));
    assert.equal(error.code, 'hanamichi', key); assert.equal(error.message, SENTENCE, key); assert.equal(error.retryable, false);
    const missing = thrown(() => h.call('saveEntry_', entry(h, 'live', {}, Object.fromEntries(Object.entries(HN).filter(([k]) => k !== key)))));
    assert.equal(missing.code, 'hanamichi', key + '（鍵そのものが無い）');
  }
  assert.equal(JSON.stringify(sizes(h)), before); assert.equal(h.resources.size, resources, '写真も作らない'); assert.equal(JSON.stringify([...h.props.entries()]), props, 'カウンターも進めない');
  // 任意の2つ（職業・他格闘歴）は、空でよい
  assert.ok(h.call('saveEntry_', entry(h, 'live', { hnJob: '', hnOther: '' })));
  assert.deepEqual(json(h.rows(HN_TAB).at(-1)).slice(11, 13), ['', '']);
});

test('検査: 赤い画面は ✕ 送れませんでした と決まった文。値や項目の名前は画面に出さない。再送ボタンは出さない', () => {
  const h = live();
  const p = entry(h, 'live', { hnReason: '' });
  const page = html(h, p);
  assert.match(page, /✕ 送れませんでした/); assert.ok(page.includes(SENTENCE));
  assert.ok(!page.includes('<form'), '直さないと同じ失敗をくり返すので、再送ボタンは出さない');
  assert.ok(!page.includes(HN.hnRing) && !page.includes('架空花道一郎'), '値は画面に出さない');
  assert.match(page, /border:4px solid #b91c1c/, '赤');
  assert.equal(HANAMICHI_MISSING_MESSAGE, SENTENCE, 'core の文と同じ');
});

test('検査: 生年月日が、実在しない日・未来の日・形がちがう・1900年より前 → 同じコード。年齢は確かめない', () => {
  const h = live();
  const pad = (n: number) => String(n).padStart(2, '0');
  const jst = new Date(Date.now() + 9 * 3600 * 1000), today = jst.getUTCFullYear() + '-' + pad(jst.getUTCMonth() + 1) + '-' + pad(jst.getUTCDate());
  const tomorrow = new Date(jst.getTime() + 24 * 3600 * 1000), next = tomorrow.getUTCFullYear() + '-' + pad(tomorrow.getUTCMonth() + 1) + '-' + pad(tomorrow.getUTCDate());
  const bad = ['1975-02-30', '1975-02-29', '1900-02-29', '1975-04-31', '1975-13-01', '1975-00-10', '1975-04-00', next, '2999-01-01', '1899-12-31', '1975-4-5', '1975/04/05', '19750405', '昭和50年4月5日', 'abc', '1975-04-05x', '０-0-0'];
  for (const value of bad) {
    const error = thrown(() => h.call('saveEntry_', entry(h, 'live', { hnBirth: value })));
    assert.equal(error.code, 'hanamichi', value); assert.equal(error.message, HANAMICHI_BAD_MESSAGE, value); assert.equal(error.retryable, false);
  }
  assert.equal(HANAMICHI_BAD_MESSAGE, '花道の追加の質問に、まちがいがある所があります。申込ページにもどって、直してから、もう一度送ってください。');
  // 通る日：うるう日・今日・全角の数字。年齢（39歳でも、100歳でも、0歳でも）は見ない
  for (const value of ['2000-02-29', '1904-02-29', today, '1900-01-01', '2012-06-01', '1926-01-01', '１９７５－０４－０５']) {
    const before = h.rows(HN_TAB).length;
    assert.ok(h.call('saveEntry_', entry(h, 'live', { hnBirth: value })), value);
    assert.equal(h.rows(HN_TAB).length, before + 1, value);
    assert.match(json(h.rows(HN_TAB).at(-1))[8], /^\d{4}-\d{2}-\d{2}$/, value + ' → yyyy-mm-dd で保存');
  }
});

test('検査: 今日の境目は日本時間（0時で日が替わる）。Googleの時計を動かして確かめる', () => {
  const h = harness();
  const at = (iso: string, y: number, m: number, d: number): boolean => {
    vm.runInContext('globalThis.__now = Date.now; Date.now = function () { return ' + Date.parse(iso) + '; };', h.api);
    try { return h.api.realPastDate_(y, m, d); } finally { vm.runInContext('Date.now = globalThis.__now;', h.api); }
  };
  assert.equal(at('2026-10-22T14:59:59Z', 2026, 10, 22), true, '日本時間 10/22 23:59:59 は 10/22');
  assert.equal(at('2026-10-22T14:59:59Z', 2026, 10, 23), false, '明日は未来');
  assert.equal(at('2026-10-22T15:00:00Z', 2026, 10, 23), true, '日本時間 10/23 0:00 から 10/23 は今日');
  assert.equal(at('2026-10-22T15:00:00Z', 2026, 10, 24), false);
  for (const [iso, y, m, d] of [['2026-10-22T14:59:59Z', 2026, 10, 22], ['2026-10-22T14:59:59Z', 2026, 10, 23], ['2026-10-22T15:00:00Z', 2026, 10, 23], ['2026-10-22T15:00:00Z', 2026, 10, 24]] as [string, number, number, number][]) assert.equal(at(iso, y, m, d), isRealPastDate(y, m, d, Date.parse(iso)), 'core と同じ答え: ' + iso + ' ' + y + '-' + m + '-' + d);
});

test('検査: 文字数の上限（リングネーム・フリガナ・職業・他格闘歴・趣味は60字、理由・メッセージは300字）。ちょうどは通り、1字多いと失敗', () => {
  const limits: [string, number][] = [['hnNameKana', 60], ['hnGymKana', 60], ['hnRing', 60], ['hnRingKana', 60], ['hnOther', 60], ['hnJob', 60], ['hnHobby', 60], ['hnReason', 300], ['hnMessage', 300]];
  const h = live();
  for (const [key, max] of limits) {
    assert.ok(h.call('saveEntry_', entry(h, 'live', { [key]: 'あ'.repeat(max) })), key + ' ' + max + '字は通る');
    const error = thrown(() => h.call('saveEntry_', entry(h, 'live', { [key]: 'あ'.repeat(max + 1) })));
    assert.equal(error.code, 'hanamichi', key + ' ' + (max + 1) + '字'); assert.equal(error.message, HANAMICHI_BAD_MESSAGE);
  }
  // 前後の空白・見えない文字・フォームの改行（CRLF）は、数えない／1字に数える
  assert.ok(h.call('saveEntry_', entry(h, 'live', { hnMessage: '  ' + 'あ'.repeat(299) + '\u200B ' })));
  assert.ok(h.call('saveEntry_', entry(h, 'live', { hnMessage: 'あ\r\n'.repeat(149) + 'あ' })), 'CRLF は 1字に数える: 299字（2字に数えると448字で失敗する）');
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', { hnMessage: 'あ\r\n'.repeat(150) + 'あ' }))).code, 'hanamichi', '301字');
  assert.equal(String(json(h.rows(HN_TAB).at(-1))[15]).includes('\r'), false, '保存は LF');
});

test('検査: キック歴・練習頻度は 0〜99 の整数（全角の数字は半角にする）。小数・文字・負の数・3けたは失敗', () => {
  const h = live();
  for (const key of ['hnKickYears', 'hnPerWeek']) {
    for (const value of ['abc', '1.5', '-1', '100', '３けた', '１,２', '半年', '+3']) assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', { [key]: value }))).code, 'hanamichi', key + ' ' + value);
    for (const [value, saved] of [['0', '0'], ['7', '7'], ['99', '99'], ['０', '0'], ['１２', '12'], [' 5 ', '5']]) {
      assert.ok(h.call('saveEntry_', entry(h, 'live', { [key]: value })), key + ' ' + value);
      assert.equal(json(h.rows(HN_TAB).at(-1))[key === 'hnKickYears' ? 9 : 10], saved);
    }
  }
});

test('検査: リングネームのフリガナは、リングネームが空のときだけ、要らない（表の1行で必須／任意を変えられる）。要らないときは、保存しない', () => {
  const h = live();
  // 表を1行だけ変える：リングネームを任意にする（会長がやる変更）
  vm.runInContext("HANAMICHI_ITEMS_[2].required = false;", h.api);
  assert.ok(h.call('saveEntry_', entry(h, 'live', { hnRing: '', hnRingKana: '' })), 'リングネームが空なら、そのフリガナも要らない');
  assert.deepEqual(json(h.rows(HN_TAB).at(-1)).slice(6, 8), ['', '']);
  assert.ok(h.call('saveEntry_', entry(h, 'live', { hnRing: '', hnRingKana: 'ゴミ' })));
  assert.deepEqual(json(h.rows(HN_TAB).at(-1)).slice(6, 8), ['', ''], 'リングネームが空なら、フリガナは捨てる');
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', { hnRing: '架空の花', hnRingKana: '' }))).code, 'hanamichi', 'リングネームがあるなら、フリガナは要る');
  // 必須を変えたいときは、その行の required だけ。ほかの項目は変わらない
  vm.runInContext("HANAMICHI_ITEMS_[8].required = true; HANAMICHI_ITEMS_[7].required = true;", h.api);
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', { hnJob: '' }))).code, 'hanamichi', '職業を必須に変えたら、空は失敗');
});

test('検査: 式にならない。= + - @ で始まる文字の前に「\'」を足す（既存の clean_ と同じ）。再送しても行は増えない', () => {
  const h = live();
  const p = entry(h, 'live', { hnReason: '=1+1', hnMessage: '+81 すごい', hnHobby: '-趣味', hnJob: '@会社', hnOther: '＝全角' });
  const receipt = h.call('saveEntry_', p);
  const raw = h.rows(HN_TAB).at(-1)!;
  assert.deepEqual([raw[13], raw[14], raw[15], raw[12], raw[11]].map(String), ['\'-趣味', '\'=1+1', '\'+81 すごい', '\'@会社', '＝全角']);
  assert.equal(h.call('saveEntry_', p), receipt); assert.equal(h.rows(HN_TAB).length, 2);
});

test('検査: 検査にもログにも、値を出さない（Logger・console）', () => {
  assert.ok(!/Logger\.log\([^)]*(?:hn[A-Z]|clean\b)/.test(script), 'ログに花道の値を出さない');
  assert.ok(!/console\.(?:log|error)\([^)]*hn[A-Z]/.test(script));
  const h = live();
  thrown(() => h.call('saveEntry_', entry(h, 'live', { hnBirth: '2999-01-01' })));
  html(h, entry(h, 'live', { hnReason: '' }));
  assert.ok(!h.logs.join('\n').includes(HN.hnRing));
});

/* ───────── 自動テスト・再送フォーム ───────── */

test('自動テスト: 最初の区分が花道のときは、架空の答えで通る（テスト花道プロフィールに1行）。花道でないなら、花道の行は書かない', () => {
  const h = harness(); h.call('onOpen'); h.fill({ ...ON });
  h.settingsSheet().rows.find((r: any[]) => r[0] === '階級：小学生以下')![0] = '階級：花道・小学生以下';
  h.call('setupTournament');
  assert.equal(h.call('statusInfo_').testComplete, true);
  assert.equal(h.rows(TEST).length, 2); assert.equal(h.rows(HN_TEST_TAB).length, 2); assert.equal(h.rows(HN_TAB).length, 1);
  const row = json(h.rows(HN_TEST_TAB)[1]);
  assert.equal(row[0], h.rows(TEST)[1][0]); assert.equal(row[2], '自動テスト'); assert.equal(row[3], '自動テスト選手');
  assert.equal(validateHanamichi(Object.fromEntries(HANAMICHI_KEYS.map((key, i) => [key, row[4 + i]]))).ok, true, '自動テストの答えは、core の検査も通る');
  assert.equal(ping(h).testComplete, true);
  const plain = harness(); plain.ready(ON); assert.equal(plain.rows(HN_TEST_TAB).length, 1);
});

test('結果の画面の再送フォーム: 花道のときだけ、12の隠し項目を足す（値は エスケープ）。花道でない区分・なし では足さない', () => {
  const h = live();
  const fields = (params: any) => [...String(h.call('resultPage_', '', '保存を確認できません', { retryable: true }, params).html).matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)];
  const p = entry(h, 'live', { hnMessage: '<b>"&' });
  const found = fields(p);
  assert.deepEqual(found.map((m) => m[1]), ['protocol', 'eventId', 'entryKey', 'mode', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'fighterClass', 'division', 'weightClass', 'photoDataUrl', ...HANAMICHI_KEYS]);
  assert.equal(found.find((m) => m[1] === 'hnMessage')![2], '&lt;b&gt;&quot;&amp;'); assert.equal(found.find((m) => m[1] === 'hnBirth')![2], '1975-04-05');
  const other = fields(entry(h, 'live', { division: '中学生男子' }));
  assert.equal(other.length, 22); assert.ok(!other.some((m) => m[1].startsWith('hn')));
  const off = harness(); off.ready({ 階級分け: 'あり' });
  assert.equal([...String(off.call('resultPage_', '', 'x', { retryable: true }, entry(off, 'live')).html).matchAll(/<input type="hidden" name="hn/g)].length, 0);
});

test('結果の画面: 花道の失敗(hanamichi)は「保存していない」と言い切れる失敗。赤の ✕。成功は緑の ✓', () => {
  const h = live();
  const bad = String(h.call('resultPage_', '', SENTENCE, { code: 'hanamichi', message: SENTENCE, retryable: false }, entry(h, 'live')).html);
  assert.match(bad, /✕ 送れませんでした/); assert.match(bad, /受付番号は出ていません/); assert.ok(!bad.includes('保存結果の確認が必要です'));
  assert.match(html(h, entry(h, 'live')), /✓ 申し込みが完了しました/);
});

/* ───────── 版・Googleの言葉 ───────── */

test('版: build は 3.20261024.2。自動テストは版が変わるとやり直し（1回だけ）', () => {
  assert.match(script, /const RECEPTION_BUILD = '3\.20261024\.2';/);
  const h = harness(); h.ready(ON); assert.equal(ping(h).build, '3.20261024.2');
  h.props.set('lastTestBuild', '3.20261019.6'); assert.equal(h.call('statusInfo_').testComplete, false);
  const rows = h.rows(TEST).length; h.call('setupTournament'); assert.equal(h.call('statusInfo_').testComplete, true); assert.equal(h.rows(TEST).length, rows + 1);
  h.call('setupTournament'); assert.equal(h.rows(TEST).length, rows + 1, 'もう増えない');
});

test('禁止語: 外へ出る道・評価の道を使わない。新しい権限は要らない', () => {
  for (const word of ['UrlFetchApp', 'getAccessToken', 'ScriptApp.getOAuthToken', 'eval(', 'new Function', 'MailApp', 'GmailApp', 'DocumentApp']) assert.ok(!script.includes(word), word);
});

/* ───────── .gs と core/hanamichi.ts は、同じ答え ───────── */

test('同じ答え: 項目の表・見出し・文は、core/hanamichi.ts と .gs で1字も違わない', () => {
  const h = harness();
  const gs = vm.runInContext('HANAMICHI_ITEMS_', h.api) as any[];
  assert.deepEqual(json(gs), json(HANAMICHI_ITEMS.map((item) => ({ key: item.key, label: item.label, required: item.required, max: item.max, kind: item.kind, ...(item.needs ? { needs: item.needs } : {}) }))));
  assert.deepEqual(json(vm.runInContext('HANAMICHI_HEADERS_', h.api)), [...HANAMICHI_SHEET_HEADERS]);
  assert.equal(vm.runInContext('HANAMICHI_MISSING_', h.api), HANAMICHI_MISSING_MESSAGE); assert.equal(vm.runInContext('HANAMICHI_BAD_', h.api), HANAMICHI_BAD_MESSAGE);
  assert.deepEqual(json(vm.runInContext('HANAMICHI_TABLES_.map(function (t) { return t[0]; })', h.api)), [HN_TAB, HN_TEST_TAB]);
});

test('同じ答え: 値のそろえ方・検査・区分の判定・日付は、core/hanamichi.ts と同じ（書き方いろいろ）', () => {
  const h = harness();
  const now = Date.now();
  const bases: Record<string, string>[] = [HN, {}, { ...HN, hnRing: '' }, { ...HN, hnRing: '', hnRingKana: 'x' }, { ...HN, hnBirth: '１９７５－０４－０５' }, { ...HN, hnBirth: '1975-02-30' }, { ...HN, hnKickYears: '１２', hnPerWeek: '100' }, { ...HN, hnMessage: 'あ'.repeat(301) }, { ...HN, hnJob: '', hnOther: '' }, { ...HN, hnHobby: '\u200B ' }, { ...HN, hnReason: 'a\r\nb\rc', hnBirth: '2999-01-01' }, { ...HN, hnKickYears: '-1' }, { ...HN, hnBirth: '1899-12-31' }, { ...HN, hnNameKana: ' \u202Eカナ\u200B ' }];
  for (const base of bases) {
    const gsClean = json(h.api.hanamichiClean_(base)), coreClean = json(hanamichiClean(base));
    assert.deepEqual(gsClean, coreClean, JSON.stringify(base));
    const found = h.api.hanamichiErrors_(h.api.hanamichiClean_(base)), core = validateHanamichi(base, now);
    assert.deepEqual(json([...found.missing, ...found.bad].sort()), Object.keys(core.errors).sort(), JSON.stringify(base) + '：まちがいのある項目');
    assert.equal(found.missing.length + found.bad.length === 0, core.ok);
  }
  for (const name of ['花道', '花道・男子（40歳以上）', '花 道', '花\u200B道', '華道', '', '中学生男子', '[花道]', '花', 'ＣＫＡ花道部門', '階級：花道']) assert.equal(h.api.isHanamichiName_(name), isHanamichiDivision(name), JSON.stringify(name));
  for (const [y, m, d] of [[1975, 4, 5], [1975, 2, 30], [2000, 2, 29], [1900, 2, 29], [1899, 12, 31], [2999, 1, 1], [1975, 13, 1], [1975, 0, 1], [1975, 1, 0], [1.5, 1, 1], [NaN, 1, 1]]) assert.equal(h.api.realPastDate_(y, m, d), isRealPastDate(y, m, d), [y, m, d].join('-'));
  // 自動テストの架空の答えは、core の検査も通る
  assert.equal(validateHanamichi(json(vm.runInContext('SELFTEST_HANAMICHI_', h.api))).ok, true);
});
