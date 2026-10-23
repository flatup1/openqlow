// 誓約書（Googleの受付）。設定の行・設定の直しもの・「誓約書」タブ・ping・文の指紋・サーバー側の検査・誓約記録の1行・再送・テストモード。
// 文は『テスト用の文です1』のような架空の文だけ（初期の文は .gs が持つ。ここでは指紋だけで固定する）。実名も使わない。
// 「なし」のときの動きは tests/pledgeGolden.test.ts が固定している。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { harness, script } from './helpers/gasV3Harness.ts';
import { guardianNeeded, GYM_NAME_MAX, gymPhoneNormal, gymPhoneOk, isUnaffiliated, parsePledgeCanon, PLEDGE_ERROR_CODES, PLEDGE_LIMITS, PLEDGE_POST_KEYS, UNAFFILIATED_NAMES, UNAFFILIATED_PHRASES, unpackPledge, packPledge } from '../core/pledge.ts';
import { diagnose, parsePing, settingLines } from '../core/setupV3.ts';

const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', TEST_OS = 'テストOS取込用';
const HN_TAB = '花道プロフィール', HN_TEST_TAB = 'テスト花道プロフィール';
const TAB = '誓約書', REC = '誓約記録', REC_TEST = 'テスト誓約記録';
const R = { pledge: '誓約書', guardian: '保護者の同意', gym: 'ジム責任者の同意', confirm: '誓約書の文の確認' };
const NEW_ROWS = [R.pledge, R.guardian, R.gym, R.confirm];
/** 誓約書の4行のあとに足された、花道のルールの行（誓約書とは関係ない。▼は無い） */
const RULE_ROW = '花道のルール';
const REC_HEADERS = ['受付番号', '申込日時', '選手名', '確認した項目', '保護者の同意', 'ジム責任者の名前', 'ジム責任者の電話', '許可の念押し', '同意した文', '文の指紋'];
const TAB_HEADINGS = ['誓約書の項目（原本のとおりに、1項目ずつ。1マス＝1項目）', '保護者（連帯責任者）の同意の文', '団体・ジム責任者の同意の文'];
/** .gs の初期の文（PLEDGE_INITIAL_*）の SHA-256。owner が貼った文字のまま、1字も直さない。文そのものは、ここに書かない */
const INITIAL_SHA = '2db9b32155376ea0534f86db59de65396a0b667a5fddf990caa31cf50be2c6b2';
/** 架空の文（会長が「誓約書」タブを直した後の姿） */
const ITEMS = ['テスト用の文です1', 'テスト用の文です2', 'テスト用の文です3', 'テスト用の文です4', 'テスト用の文です5'];
const G = 'テスト用の文です保護者', Y = 'テスト用の文ですジム';
const GYM_NAME = '架空責任者', GYM_PHONE = '08011112222';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const canonOf = (items: string[], guardian: string, gym: string) => JSON.stringify({ items, guardian, gym });
const HASH = sha(canonOf(ITEMS, G, Y));
const MESSAGES = {
  items: '誓約書の確認（✔）が、すべてそろっていません。申し込みページにもどって、各項目の□に✔を入れてください。',
  confirm: '主催者が、誓約書の文をまだ確認していません。送れません。',
  old: '誓約書の文が、リンクを作ったあとで変わりました。主催者から、新しい申し込みリンクをもらってください。',
  permission: 'ジム責任者の許可をとっているか、確認のチェックが必要です。',
};

type H = ReturnType<typeof harness>;
const ping = (h: H) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
const html = (h: H, params: any): string => String(h.call('doPost', { parameter: params }).html);
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const thrown = (fn: () => unknown): any => { try { fn(); } catch (e) { return e; } assert.fail('投げなかった'); };
const without = (h: H, key: string) => { const rows = h.settingsSheet().rows; const i = rows.findIndex((r: any[]) => r[0] === key); assert.ok(i >= 0, key); rows.splice(i, 1); };
const tabs = (h: H) => [...h.book.sheets.keys()];
const sizes = (h: H) => Object.fromEntries([PRIVATE, OS, TEST, TEST_OS, HN_TAB, HN_TEST_TAB, TAB, REC, REC_TEST].map((n) => [n, h.book.getSheetByName(n)?.rows.length ?? -1]));
/** 何も書かれていないことを言うための写し：全タブの中身・Driveの物の数・プロパティ（カウンターも） */
const snap = (h: H) => JSON.stringify([[...h.book.sheets.entries()].map(([n, s]: [string, any]) => [n, s.rows]), h.resources.size, [...h.props.entries()]]);
const problemsOf = (h: H): string[] => json(h.call('settingsProblems_', h.call('S_')));
/** 「誓約書」タブの中身を、架空の文に入れかえる（会長が文を直した姿）。A1〜C1 の見出しは、そのまま */
const fillTab = (h: H, items: string[] = ITEMS, guardian = G, gym = Y) => {
  const sheet = h.book.getSheetByName(TAB);
  const rows: string[][] = [[...TAB_HEADINGS]];
  const n = Math.max(items.length, 1);
  for (let i = 0; i < n; i++) rows.push([items[i] ?? '', i === 0 ? guardian : '', i === 0 ? gym : '']);
  sheet.rows = rows;
};
/** 誓約書＝あり の大会。文は架空に入れかえ、確認＝済み、受付中。over で設定を足す */
const live = (over: Record<string, string> = {}, confirm = true) => {
  const h = harness(); h.ready({ [R.pledge]: 'あり', ...over });
  fillTab(h); if (confirm) h.setSetting(R.confirm, '済み');
  h.call('openEntries'); return h;
};
/** 申し込みページが送る誓約書の鍵（ぜんぶ✔・入力ずみ）。over で変える。undefined にした鍵は付けない */
const pledgeKeys = (over: Record<string, string | undefined> = {}): Record<string, string> => {
  const out: Record<string, string | undefined> = { pledge: 'yes', pledgeItems: '1,2,3,4,5', pledgeGuardian: 'yes', gymName: GYM_NAME, gymPhone: GYM_PHONE, gymPermission: 'yes', pledgeGym: 'yes', pledgeHash: HASH, ...over };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Record<string, string>;
};
const entry = (h: H, mode: 'test' | 'live', over: Record<string, string | undefined> = {}, keys: Record<string, string | undefined> = {}) => {
  const p: Record<string, any> = { ...h.params(mode, {}), ...pledgeKeys(keys) };
  for (const [k, v] of Object.entries(over)) { if (v === undefined) delete p[k]; else p[k] = v; }
  return p;
};
/** 記録の「同意した文」（番号つき）。保護者・ジム責任者の文は、✔したときだけ */
const agreed = (guardian: boolean, gym: boolean) => [...ITEMS.map((t, i) => (i + 1) + '. ' + t), ...(guardian ? ['【保護者の同意】' + G] : []), ...(gym ? ['【ジム責任者の同意】' + Y] : [])].join('\n');

/* ───────── 設定の行 ───────── */

test('設定の行: 誓約書の4行は、花道の行(B30)のあとの、いちばん下(B31〜B34)。初期値は なし／18歳未満のみ／あり／まだ。▼は決まった選択肢。既存の行の位置は動かない', () => {
  const h = harness(); h.call('onOpen');
  const rows = h.rows('設定'), labels = rows.slice(1).map((r) => r[0]);
  assert.deepEqual(json(labels.slice(-6)), ['花道の追加情報', ...NEW_ROWS, RULE_ROW]);
  assert.equal(rows.length, 35);
  for (const [label, cell] of [['クラス分け', 13], ['階級分け', 21], ['ロゴ', 22], ['花道の追加情報', 30], [R.pledge, 31], [R.guardian, 32], [R.gym, 33], [R.confirm, 34]] as [string, number][]) assert.equal(labels.indexOf(label) + 2, cell, 'B' + cell);
  assert.deepEqual(json(rows.slice(-5, -1).map((r) => r[1])), ['なし', '18歳未満のみ', 'あり', 'まだ']);
  const lists: [number, string[]][] = [[31, ['なし', 'あり']], [32, ['18歳未満のみ', '全員', 'なし']], [33, ['あり', 'なし']], [34, ['まだ', '済み']]];
  for (const [row, list] of lists) {
    const rule = h.settingsSheet().validations.get(row + ':2');
    assert.deepEqual(json(rule.list), list, 'B' + row); assert.equal(rule.allowInvalid, false);
    assert.equal(h.settingsSheet().backgrounds.get(row + ':2'), undefined, '会長が必ず書く7つではないので、色は付けない');
    assert.equal(String(h.settingsSheet().formats.get(row + ':2')), '@', 'B列は文字の形');
  }
  // 説明（C列）：何の行か、いつ意味があるか、どこに文を書くか
  const desc = (label: string) => rows.find((r) => r[0] === label)![2] as string;
  assert.match(desc(R.pledge), /誓約書」タブ/); assert.match(desc(R.pledge), /先へ進めません/);
  assert.match(desc(R.guardian), /「誓約書」が「あり」のときだけ意味があります/); assert.match(desc(R.guardian), /年齢/);
  assert.match(desc(R.gym), /ジム責任者のお名前・携帯電話・許可の確認/); assert.doesNotMatch(desc(R.gym), /無所属/); assert.match(desc(R.confirm), /原本と見比べて/); assert.match(desc(R.confirm), /テスト用は動きます/);
  for (const row of rows.slice(-5, -1)) assert.equal(row.length, 3);
});

test('設定の行: 行が無い古いシートは「なし」と読む。シートを開く・①で、いちばん下に4行だけ足される（書いてあるマスは書き換えない）。タブも鍵も増えない', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' });
  for (const label of [...NEW_ROWS, RULE_ROW]) without(h, label);
  h.settingsSheet().rows[1][1] = '私の大会';
  const body = ping(h), before = JSON.stringify(h.rows('設定'));
  assert.equal(body.settingsProblem, ''); assert.ok(!/pledge|guardianMode|gymMode/.test(JSON.stringify(body)));
  const s = h.call('S_'); assert.equal(s.pledge, false); assert.equal(s.pledgeTab, null);
  h.call('onOpen');
  assert.equal(h.rows('設定').length, 35); assert.equal(JSON.stringify(h.rows('設定').slice(0, 30)), before, 'いまある29行は1マスも変わらない');
  assert.deepEqual(json(h.rows('設定').slice(30).map((r) => r[0])), [...NEW_ROWS, RULE_ROW]);
  assert.deepEqual(json(h.settingsSheet().validations.get('32:2').list), ['18歳未満のみ', '全員', 'なし'], '足した行にも▼が付く');
  h.call('onOpen'); h.call('setupTournament'); assert.equal(h.rows('設定').length, 35, '2回目以降は増えない');
  assert.deepEqual(tabs(h), ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS], '「なし」では誓約書のタブも誓約記録も作らない');
});

test('設定の行: 書いてある値だけで決まる。誓約書は あり だけが「あり」。保護者の同意の空は18歳未満のみ、ジム責任者の同意の空は あり、確認の空は まだ（安全側）', () => {
  const h = harness(); h.ready({ [R.pledge]: 'あり' });
  const read = () => { const s = h.call('S_'); return [s.pledge, s.guardianMode, s.gymMode, s.pledgeConfirmed]; };
  assert.deepEqual(read(), [true, 'under18', true, false]);
  for (const [v, mode] of [['18歳未満のみ', 'under18'], ['全員', 'all'], ['なし', 'none'], ['', 'under18'], ['たぶん', 'all'], ['18歳未満', 'all']]) { h.setSetting(R.guardian, v); assert.equal(h.call('S_').guardianMode, mode, JSON.stringify(v)); }
  h.setSetting(R.guardian, '18歳未満のみ');
  for (const [v, on] of [['あり', true], ['なし', false], ['', true], ['たぶん', true]] as [string, boolean][]) { h.setSetting(R.gym, v); assert.equal(h.call('S_').gymMode, on, JSON.stringify(v)); }
  h.setSetting(R.gym, 'あり');
  for (const [v, on] of [['済み', true], ['まだ', false], ['', false], ['済', false], ['済みです', false]] as [string, boolean][]) { h.setSetting(R.confirm, v); assert.equal(h.call('S_').pledgeConfirmed, on, JSON.stringify(v)); }
  for (const v of ['なし', '', 'はい', 'あり。', 'ON']) { h.setSetting(R.pledge, v); assert.equal(h.call('S_').pledge, false, JSON.stringify(v) + ' は「あり」ではない'); }
});

/* ───────── ① 最初の設定：タブ ───────── */

test('① 最初の設定: 「あり」なら、「誓約書」タブ（初期の文つき）と、誓約記録・テスト誓約記録を作る。初期の文は owner が貼った文字のまま（指紋で固定）', () => {
  const h = harness(); h.ready({ [R.pledge]: 'あり' });
  assert.deepEqual(tabs(h), ['シート1', '設定', TAB, PRIVATE, OS, TEST, TEST_OS, REC, REC_TEST]);
  const tab = h.book.getSheetByName(TAB), rows = json(tab.rows) as string[][];
  assert.deepEqual(rows[0].slice(0, 3), TAB_HEADINGS, 'A1・B1・C1 の見出し');
  const items = rows.slice(1, 6).map((r) => r[0]); const guardian = rows[1][1], gym = rows[1][2];
  assert.equal(rows.length, 6, '見出し + 項目5つ'); assert.ok(rows.slice(2).every((r) => r[1] === undefined && r[2] === undefined), '保護者・ジム責任者の文は、B2・C2 だけ');
  assert.equal(sha(canonOf(items, guardian, gym)), INITIAL_SHA, '初期の文は、貼られたまま（1字も直していない）');
  assert.ok(items.every((t) => t.length > 0 && t.length <= PLEDGE_LIMITS.item) && items.length <= PLEDGE_LIMITS.items);
  assert.ok(items.join('').length + guardian.length + gym.length <= PLEDGE_LIMITS.total);
  // メモ：owner が原本から貼った文字であること・会長が見比べて直すこと
  assert.equal(rows[0][4], 'メモ'); assert.match(rows[1][4], /owner が原本から貼った文字です（2026-10-22）/); assert.match(rows[1][4], /原本と見比べて/); assert.match(rows[1][4], /「誓約書の文の確認」を「済み」/);
  // 文字の形（先頭が = + - @ の文が、式にならない）
  for (const [r, c] of [[1, 1], [2, 1], [2, 2], [2, 3], [9, 1], [1000, 5]]) assert.equal(tab.formats.get(r + ':' + c), '@', '誓約書 ' + r + ':' + c);
  assert.equal(tab.formats.get('2:6'), undefined, '表の外は触らない');
  // 記録のタブ：見出し・保護・文字の形
  for (const name of [REC, REC_TEST]) {
    const sheet = h.book.getSheetByName(name);
    assert.deepEqual(json(sheet.rows[0]), REC_HEADERS, name); assert.equal(sheet.rows.length, name === REC ? 1 : 2, name === REC ? '見出しだけ' : '自動テストの1件');
    assert.equal(sheet.protections.length, 1, name + ' の見出しは保護される'); assert.equal(sheet.protections[0].prot.warningOnly, true);
    for (const [r, c] of [[1, 1], [2, 5], [50, 9], [1000, 10]]) assert.equal(sheet.formats.get(r + ':' + c), '@', name + ' ' + r + ':' + c);
  }
  assert.equal(problemsOf(h).length, 0, '初期の文のままで、設定の直しものは無い');
  const body = ping(h); assert.equal(body.pledgeMode, true); assert.equal(body.pledgeChecked, false, '文の確認は、はじめは まだ（会長が済みにする）');
});

test('① 最初の設定: メニューの完了メッセージに、「誓約書」タブを作ったことと、文を原本と見比べて「済み」にすることを言う（「なし」では言わない）', () => {
  const h = harness(); h.call('onOpen'); h.fill({ [R.pledge]: 'あり' });
  h.call('menuSetup');
  const text = h.toasts.join('\n');
  assert.match(text, /「誓約書」タブを作りました/); assert.match(text, /「誓約書の文の確認」を「済み」にしてください/);
  const off = harness(); off.call('onOpen'); off.fill(); off.call('menuSetup');
  assert.ok(!/誓約書/.test(off.toasts.join('\n')));
});

test('① 最初の設定: タブができたあとは、1マスも触らない（会長が直した文・消したマス・空のタブも）。「なし」にもどしても、タブは消さない', () => {
  const h = harness(); h.ready({ [R.pledge]: 'あり' });
  fillTab(h, ['私の項目1', '=1+1'], '私の保護者の文', '私のジムの文');
  const sheet = h.book.getSheetByName(TAB); sheet.rows[0][3] = '私のメモ';
  const snapshot = JSON.stringify(sheet.rows), formats = sheet.formats.size;
  h.call('setupTournament'); h.call('onOpen'); h.call('setupTournament');
  assert.equal(JSON.stringify(h.book.getSheetByName(TAB).rows), snapshot); assert.equal(h.book.getSheetByName(TAB).formats.size, formats);
  // 中身を全部消しても、作り直さない（消したのは会長）。設定の直しものが言う
  sheet.rows = [];
  assert.match(thrown(() => h.call('setupTournament')).message, /「誓約書」タブのA列/); assert.equal(h.book.getSheetByName(TAB).rows.length, 0, '空のまま');
  // 先に会長が作ったタブ（①より前）も、触らない
  const pre = harness(); pre.call('onOpen'); pre.fill({ [R.pledge]: 'あり' });
  const mine = pre.book.insertSheet(TAB); mine.rows.push(['私の項目', '', ''], ['', '', '']); const before = JSON.stringify(mine.rows);
  assert.ok(thrown(() => pre.call('setupTournament')).message, '項目の数などの直しもので止まる（初期の文を書き足さない）');
  assert.equal(JSON.stringify(pre.book.getSheetByName(TAB).rows), before); assert.equal(pre.book.getSheetByName(TAB).formats.size, 0);
  // 「なし」にもどしても、タブは消さない・触らない
  const back = harness(); back.ready({ [R.pledge]: 'あり' }); back.setSetting(R.pledge, 'なし'); const before2 = JSON.stringify(back.book.getSheetByName(TAB).rows);
  back.call('setupTournament'); assert.deepEqual(tabs(back), ['シート1', '設定', TAB, PRIVATE, OS, TEST, TEST_OS, REC, REC_TEST]); assert.equal(JSON.stringify(back.book.getSheetByName(TAB).rows), before2);
});

test('① 最初の設定: 「なし」なら作らない。あとで「あり」にして①を押すと作る。文は、その時の初期の文', () => {
  const h = harness(); h.ready();
  assert.deepEqual(tabs(h), ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS]);
  h.setSetting(R.pledge, 'あり'); h.call('setupTournament');
  assert.deepEqual(tabs(h), ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS, TAB, REC, REC_TEST]);
  const rows = json(h.book.getSheetByName(TAB).rows) as string[][];
  assert.equal(sha(canonOf(rows.slice(1, 6).map((r) => r[0]), rows[1][1], rows[1][2])), INITIAL_SHA);
  assert.equal(h.rows(REC).length, 1); assert.equal(h.rows(REC_TEST).length, 1, '自動テストはすでに済んでいるので、増やさない');
});

test('① 最初の設定: 誓約記録の見出しがちがうときは、何も書き換えずに止まる（個人情報のタブ：消さずに聞く）。ping も受付も止まる', () => {
  const h = harness(); h.ready(); h.setSetting(R.pledge, 'あり');
  const bad = h.book.insertSheet(REC); bad.rows.push(['受付番号', 'ちがう見出し']); const before = JSON.stringify(bad.rows);
  const error = thrown(() => h.call('setupTournament'));
  assert.equal(error.code, 'headers'); assert.match(error.message, /「誓約記録」タブのB1が「ちがう見出し」になっています。「申込日時」に直してください/); assert.match(error.message, /このタブを消さず/);
  assert.equal(JSON.stringify(bad.rows), before); assert.equal(h.book.getSheetByName(REC_TEST), null, '止まったときは、ほかの記録のタブも作らない');
  // 右はしが空の古い形も、自動で書き足さない
  const old = harness(); old.ready(); old.setSetting(R.pledge, 'あり'); old.book.insertSheet(REC).rows.push([...REC_HEADERS.slice(0, 9), '']);
  const e2 = thrown(() => old.call('setupTournament')); assert.match(e2.message, /「誓約記録」タブのJ1が（空）になっています。「文の指紋」に直してください/);
  assert.equal(thrown(() => old.call('saveEntry_', old.params('test'))).code, 'headers');
});

test('誓約記録のタブが消えたら: ping は missing とタブの名前を言い、受付は何も書かずに止まる。①で見出しだけの新しいタブができる', () => {
  const h = live(); h.book.sheets.delete(REC);
  const body = ping(h);
  assert.equal(body.ready, false); assert.equal(body.error, 'missing'); assert.equal(body.errorTab, REC);
  assert.equal(diagnose(parsePing(body)).stage, 'missing-tab');
  const before = snap(h);
  const error = thrown(() => h.call('saveEntry_', entry(h, 'live')));
  assert.equal(error.code, 'missing'); assert.match(error.message, /「誓約記録」タブが見つからない/); assert.match(error.message, /先にジムの担当者に聞いてください/); assert.equal(snap(h), before);
  h.call('setupTournament'); assert.deepEqual(json(h.rows(REC)), [REC_HEADERS]);
  assert.ok(h.call('saveEntry_', entry(h, 'live')));
});

/* ───────── 設定の直しもの ───────── */

test('設定の直しもの: 「あり」なのに 項目が0個／9個以上、1項目が121字、合計が701字、保護者の文が空、ジム責任者の文が空、年齢＝なし → 1つの問題＝1文・場所つき。ちょうどの値は通る', () => {
  const ok = (change: (h: H) => void) => { const h = live(); change(h); return problemsOf(h); };
  assert.deepEqual(ok(() => undefined), [], '初期のまま');
  // 0個・空のマスは飛ばす・9個
  assert.deepEqual(ok((h) => fillTab(h, [], G, Y)), ['「誓約書」タブのA列（A2〜A9）に、誓約の項目が1つもありません（原本のとおりに、1マスに1項目ずつ書いてください）']);
  assert.equal(ok((h) => { h.book.getSheetByName(TAB).rows = [[...TAB_HEADINGS], ['', G, Y], ['  ', '', ''], ['\u200B', '', '']]; }).length, 1, '空白だけのマスは項目に数えない');
  assert.deepEqual(ok((h) => fillTab(h, Array.from({ length: 8 }, (_, i) => 'テスト用の文です' + i))), [], '8個ちょうどは通る');
  assert.deepEqual(ok((h) => fillTab(h, Array.from({ length: 9 }, (_, i) => 'テスト用の文です' + i))), ['「誓約書」タブの項目が9個あります（8個までなので、A2〜A9に収めてください）']);
  // 空のマスをはさんでも、数えるのは中身のあるマス
  assert.deepEqual(ok((h) => { h.book.getSheetByName(TAB).rows = [[...TAB_HEADINGS], ['a', G, Y], ['', '', ''], ['b', '', ''], ['', '', ''], ['c', '', '']]; }), []);
  // 1項目の長さ：120字ちょうどは通り、121字は直すマスを言う
  assert.deepEqual(ok((h) => fillTab(h, ['あ'.repeat(120), 'b'], '', '')), ['「保護者の同意」が「なし」ではないのに、「誓約書」タブのB2（保護者の同意の文）が空です（文を書くか、「保護者の同意」を「なし」にしてください）', '「ジム責任者の同意」が「あり」なのに、「誓約書」タブのC2（ジム責任者の同意の文）が空です（文を書くか、「ジム責任者の同意」を「なし」にしてください）']);
  assert.deepEqual(ok((h) => fillTab(h, ['a', 'あ'.repeat(121), 'c', 'あ'.repeat(130)])), ['「誓約書」タブの項目が長すぎます（1項目120文字までなので、A3・A5のマスを短くしてください）']);
  // 合計：項目 + 保護者の文 + ジム責任者の文
  const five = Array.from({ length: 5 }, () => 'あ'.repeat(120));
  assert.deepEqual(ok((h) => fillTab(h, five, 'い'.repeat(50), 'う'.repeat(50))), [], '合計700ちょうど');
  assert.deepEqual(ok((h) => fillTab(h, five, 'い'.repeat(51), 'う'.repeat(50))), ['「誓約書」タブの文字の合計が多すぎます（項目と、保護者・ジム責任者の文を合わせて700文字までなので、いまの701文字を短くしてください）']);
  // 保護者・ジム責任者の文が空：その同意が「なし」なら要らない
  const sentence = (h: H, g: string, y: string) => fillTab(h, ITEMS, g, y);
  assert.equal(ok((h) => { sentence(h, '', Y); h.setSetting(R.guardian, 'なし'); }).length, 0, '保護者の同意＝なし なら、保護者の文が空でよい');
  assert.equal(ok((h) => { sentence(h, '', Y); h.setSetting(R.guardian, '全員'); }).length, 1);
  assert.equal(ok((h) => { sentence(h, G, ''); h.setSetting(R.gym, 'なし'); }).length, 0, 'ジム責任者の同意＝なし なら、ジム責任者の文が空でよい');
  assert.equal(ok((h) => { sentence(h, G, ''); }).length, 1);
  // 18歳未満のみ なのに 年齢＝なし
  const age = (v: string, mode: string) => ok((h) => { h.setSetting('年齢', v); h.setSetting(R.guardian, mode); });
  assert.deepEqual(age('なし', '18歳未満のみ'), ['「保護者の同意」が「18歳未満のみ」ですが、「年齢」が「なし」です（年齢を聞かないと18歳未満かどうか分からないので、「年齢」を「必須」か「任意」にするか、「保護者の同意」を「全員」か「なし」にしてください）']);
  assert.deepEqual(age('なし', '全員'), []); assert.deepEqual(age('なし', 'なし'), []); assert.deepEqual(age('任意', '18歳未満のみ'), []); assert.deepEqual(age('必須', '18歳未満のみ'), []);
  assert.deepEqual(age('なし', ''), ['「保護者の同意」が「18歳未満のみ」ですが、「年齢」が「なし」です（年齢を聞かないと18歳未満かどうか分からないので、「年齢」を「必須」か「任意」にするか、「保護者の同意」を「全員」か「なし」にしてください）'], '空は18歳未満のみ');
});

test('設定の直しもの: タブが無い／値が選択肢にない → 直しもの。ping が言い、画面の仕組みでも1文で出る。どの文も「。」を含まず、設定の問題があるあいだは印を出さない', () => {
  const h = live();
  h.book.sheets.delete(TAB);
  const missing = problemsOf(h); assert.equal(missing.length, 1); assert.match(missing[0], /^「誓約書」が「あり」ですが、「誓約書」タブがありません（「① 最初の設定」を押して作るか、使わないなら/);
  const body = ping(h); assert.equal(body.error, undefined); assert.ok(body.settingsProblem.includes(missing[0])); assert.ok(!('pledgeMode' in body), '問題があるあいだは印を出さない');
  const h2 = live();
  h2.setSetting(R.pledge, 'はい'); assert.deepEqual(problemsOf(h2), ['「誓約書」は、あり／なしのどれかにしてください']);
  h2.setSetting(R.pledge, 'あり');
  h2.setSetting(R.guardian, 'たぶん'); h2.setSetting(R.gym, 'さあ'); h2.setSetting(R.confirm, 'ほぼ');
  assert.deepEqual(problemsOf(h2), ['「保護者の同意」は、18歳未満のみ／全員／なしのどれかにしてください', '「ジム責任者の同意」は、あり／なしのどれかにしてください', '「誓約書の文の確認」は、まだ／済みのどれかにしてください']);
  // 画面の「設定の直しもの」の仕組み：1文ずつ出る。選択肢の行のまちがいには、場所（A列が行の名前の行のB列）を足して言う（花道の追加情報と同じ。tests/pledgeSetup.test.ts も見る）
  const lines = settingLines('シートの「設定」タブを直してください。' + problemsOf(h2).join('。'));
  assert.equal(lines.length, 3); assert.equal(lines[0].fixes[0], '「保護者の同意」は、18歳未満のみ／全員／なしのどれかにしてください（「設定」タブの、A列が「保護者の同意」の行のB列。▼から選び直す）');
  // どの文にも「。」が入らない（「。」で割って1文ずつ出す仕組みを壊さない）
  // 出うる直しものを全部つくって、どれも1文（「。」なし）で、1つの問題＝配列の1つ、であることを確かめる
  const five = Array.from({ length: 5 }, () => 'あ'.repeat(120));
  const makers: [string, (hh: H) => void][] = [
    ['項目0個・保護者の文が空・ジム責任者の文が空・年齢なし', (hh) => { fillTab(hh, [], '', ''); hh.setSetting('年齢', 'なし'); }],
    ['9個', (hh) => fillTab(hh, Array.from({ length: 9 }, (_, i) => 'テスト用の文です' + i))],
    ['長い項目', (hh) => fillTab(hh, ['a', 'あ'.repeat(121), 'c', 'あ'.repeat(130)])],
    ['合計こえ', (hh) => fillTab(hh, five, 'い'.repeat(51), 'う'.repeat(50))],
    ['値がでたらめ', (hh) => { hh.setSetting(R.guardian, 'x'); hh.setSetting(R.gym, 'x'); hh.setSetting(R.confirm, 'x'); }],
  ];
  const counts: Record<string, number> = { '項目0個・保護者の文が空・ジム責任者の文が空・年齢なし': 4, '9個': 1, '長い項目': 1, '合計こえ': 1, '値がでたらめ': 3 };
  for (const [label, make] of makers) {
    const hh = live(); make(hh);
    const found = problemsOf(hh); assert.equal(found.length, counts[label], label + '：' + found.join(' / '));
    for (const p of found) assert.ok(!p.includes('。'), label + '：' + p);
  }
  for (const p of [...missing, ...problemsOf(h2)]) assert.ok(!p.includes('。'), p);
});

test('設定の直しもの: 「なし」・空のときは、何が入っていても止めない（タブが無くても・文が空でも・ほかの3行にでたらめな値があっても）', () => {
  const h = harness(); h.ready();
  for (const [label, v] of [[R.guardian, 'でたらめ'], [R.gym, 'でたらめ'], [R.confirm, 'でたらめ']]) h.setSetting(label, v);
  assert.deepEqual(problemsOf(h), []);
  h.setSetting('年齢', 'なし'); assert.deepEqual(problemsOf(h), [], 'なし なら 年齢＝なし でも止めない');
  h.setSetting(R.pledge, ''); assert.deepEqual(problemsOf(h), []);
  h.setSetting(R.pledge, 'はい'); assert.deepEqual(problemsOf(h), ['「誓約書」は、あり／なしのどれかにしてください'], '誓約書の値そのものは、いつも見る');
  assert.ok(!('pledgeMode' in ping(h)));
});

test('設定の直しもの: ほかの直しものといっしょに出ても、順番を乱さない（既存の直しものが先、花道のあと、誓約書は長さの検査の前）。受付中に壊れたら本番の新しい申込は受けない', () => {
  const h = live({ 階級分け: 'あり', 花道の追加情報: 'あり' }); h.setSetting('会場', ''); h.setSetting('階級分け', 'たぶん');
  fillTab(h, [], G, Y);
  const problems = problemsOf(h);
  assert.equal(problems[0], '「設定」タブの、次の欄を入れてください：会場'); assert.equal(problems[1], '「階級分け」は、あり／なしのどれかにしてください');
  assert.match(problems.at(-2)!, /^「花道の追加情報」が「あり」ですが/); assert.match(problems.at(-1)!, /^「誓約書」タブのA列/);
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live'))).code, 'setup');
});

/* ───────── ping と文の指紋 ───────── */

test('ping: 「あり」で問題なしのときだけ、6つの鍵が増える（pledgeMode・pledgeCanon・pledgeHash・guardianMode・gymMode・pledgeChecked）。「なし」では1つも増えない', () => {
  const off = harness(); off.ready({ 階級分け: 'あり' }); off.call('openEntries');
  const on = live({ 階級分け: 'あり' });
  const offKeys = Object.keys(ping(off)), onKeys = Object.keys(ping(on));
  assert.deepEqual(onKeys, [...offKeys, 'pledgeMode', 'pledgeCanon', 'pledgeHash', 'guardianMode', 'gymMode', 'pledgeChecked']);
  const body = ping(on);
  assert.equal(body.pledgeMode, true); assert.equal(body.guardianMode, 'under18'); assert.equal(body.gymMode, true); assert.equal(body.pledgeChecked, true);
  assert.equal(body.pledgeCanon, canonOf(ITEMS, G, Y), '文のひとまとめ（JSON の文字）');
  assert.equal(body.pledgeHash, HASH, '指紋は、pledgeCanon の SHA-256（16進の小文字64字）'); assert.match(body.pledgeHash, /^[0-9a-f]{64}$/);
  // 花道もあるときは、花道の印のあとに足される
  const both = live({ 階級分け: 'あり', 花道の追加情報: 'あり' });
  assert.deepEqual(Object.keys(ping(both)).slice(-7), ['hanamichiMode', 'pledgeMode', 'pledgeCanon', 'pledgeHash', 'guardianMode', 'gymMode', 'pledgeChecked']);
  // 設定の問題があるあいだは出ない・直ると出る・なし にすると消える
  on.setSetting('会場', ''); assert.ok(!('pledgeMode' in ping(on)) && !('pledgeCanon' in ping(on))); on.setSetting('会場', '体育館'); assert.equal(ping(on).pledgeMode, true);
  on.setSetting(R.pledge, 'なし'); assert.deepEqual(Object.keys(ping(on)), offKeys);
});

test('ping: 3つの設定とタブの文が、そのまま写る。確認は まだ→false／済み→true。文を直すと指紋が変わる。個人情報（申込の中身・ジム責任者の名前や電話）は含まれない', () => {
  const h = live();
  for (const [guardian, mode] of [['18歳未満のみ', 'under18'], ['全員', 'all'], ['なし', 'none']]) { h.setSetting(R.guardian, guardian); assert.equal(ping(h).guardianMode, mode); }
  for (const [gym, on] of [['あり', true], ['なし', false]] as [string, boolean][]) { h.setSetting(R.gym, gym); assert.equal(ping(h).gymMode, on); }
  h.setSetting(R.confirm, 'まだ'); assert.equal(ping(h).pledgeChecked, false); h.setSetting(R.confirm, '済み'); assert.equal(ping(h).pledgeChecked, true);
  const before = ping(h).pledgeHash;
  fillTab(h, [...ITEMS.slice(0, 4), 'テスト用の文です5（直した）']);
  assert.notEqual(ping(h).pledgeHash, before); assert.equal(ping(h).pledgeHash, sha(canonOf([...ITEMS.slice(0, 4), 'テスト用の文です5（直した）'], G, Y)));
  const text = JSON.stringify(ping(h));
  for (const word of ['架空責任者', '09000000000', '誓約記録', 'テスト誓約記録', 'gymName', 'gymPhone']) assert.ok(!text.includes(word), word);
});

test('ping → core: parsePing が読める。文は形と長さを調べて、壊れていれば捨てる（pledgeMode だけ残る）。リンクの plt に詰めて、もどせる', () => {
  const h = live({ 年齢: '任意' }); h.setSetting(R.guardian, '全員');
  const body = ping(h), parsed = parsePing(body);
  assert.equal(parsed.pledgeMode, true); assert.equal(parsed.pledgeCanon, body.pledgeCanon); assert.equal(parsed.pledgeHash, HASH);
  assert.equal(parsed.guardianMode, 'all'); assert.equal(parsed.gymMode, true); assert.equal(parsed.pledgeChecked, true);
  const canon = parsePledgeCanon(parsed.pledgeCanon)!;
  assert.deepEqual(json(canon), { items: ITEMS, guardian: G, gym: Y });
  assert.deepEqual(json(unpackPledge(packPledge(canon.items, canon.guardian, canon.gym))), json(canon), 'リンクに詰めて、もどる');
  assert.equal(diagnose(parsed).stage, 'ready');
  // 壊れた文・指紋・モード
  const broken = parsePing({ ...body, pledgeCanon: '{"items":[]}', pledgeHash: 'ABC', guardianMode: 'x', gymMode: 'yes', pledgeChecked: 'yes' });
  assert.equal(broken.pledgeMode, true); assert.equal(broken.pledgeCanon, undefined); assert.equal(broken.pledgeHash, undefined); assert.equal(broken.guardianMode, undefined); assert.equal(broken.gymMode, undefined); assert.equal(broken.pledgeChecked, false, '済みと読めなければ まだ');
  assert.equal(parsePing({ ...body, pledgeCanon: 5 }).pledgeCanon, undefined); assert.equal(parsePing({ ...body, pledgeHash: HASH.toUpperCase() }).pledgeHash, undefined);
  for (const v of [false, 'on', 1, null]) assert.ok(!('pledgeMode' in parsePing({ ...body, pledgeMode: v })), String(v));
  assert.ok(!('pledgeCanon' in parsePing({ ...body, pledgeMode: false })), 'なし のときは、ほかの鍵があっても読まない');
});

test('文の読み方: 空のマスは飛ばす。前後の空白・見えない文字を取る。セルの中の改行はそのまま。\\r\\n は \\n にそろえる。順番はそのまま', () => {
  const h = live();
  h.book.getSheetByName(TAB).rows = [[...TAB_HEADINGS], ['  テスト用の文です1  ', '保護者\u200Bの文\r\n2行目', 'ジムの文'], ['', '', ''], ['テスト用の文です\n2行目\r\nの3', '', ''], ['\u200B', '', ''], ['テスト用の文です4', '', '']];
  const s = h.call('S_');
  assert.deepEqual(json(s.pledgeTab.items), ['テスト用の文です1', 'テスト用の文です\n2行目\nの3', 'テスト用の文です4']);
  assert.deepEqual(json(s.pledgeTab.rows), [2, 4, 6], '項目があった行の番号');
  assert.equal(s.pledgeTab.guardian, '保護者の文\n2行目'); assert.equal(s.pledgeTab.gym, 'ジムの文');
  assert.equal(ping(h).pledgeCanon, canonOf(['テスト用の文です1', 'テスト用の文です\n2行目\nの3', 'テスト用の文です4'], '保護者の文\n2行目', 'ジムの文'));
  // B3・C3 など、B2・C2 以外のマスは読まない
  h.book.getSheetByName(TAB).rows = [[...TAB_HEADINGS], ['a', 'g', 'y'], ['b', 'ほかの保護者の文', 'ほかのジムの文']];
  assert.equal(h.call('S_').pledgeTab.guardian, 'g'); assert.equal(h.call('S_').pledgeTab.gym, 'y');
  // 60行目より下は読まない
  const long = [[...TAB_HEADINGS], ...Array.from({ length: 70 }, (_, i) => ['項目' + i, '', ''])]; h.book.getSheetByName(TAB).rows = long;
  assert.equal(h.call('S_').pledgeTab.items.length, 59);
});

/* ───────── 保存：検査 ───────── */

test('保存（本番）: ぜんぶ✔ならば保存できる。申込原本は21列・OS取込用は14列のまま。誓約記録に1行。誓約記録のほかの場所には何も出ない', () => {
  const h = live();
  const p = entry(h, 'live');
  const receipt = h.call('saveEntry_', p);
  assert.equal(h.rows(PRIVATE).length, 2); assert.equal(h.rows(OS).length, 2); assert.equal(h.rows(REC).length, 2); assert.equal(h.rows(REC_TEST).length, 2, 'テストの記録は、自動テストの1件のまま');
  const main = json(h.rows(PRIVATE).at(-1)), os = json(h.rows(OS).at(-1));
  assert.equal(main.length, 21); assert.equal(os.length, 14); assert.equal(main[0], receipt);
  // 記録の行：年齢20は18歳未満ではないので保護者の同意は不要
  const row = json(h.rows(REC).at(-1));
  assert.equal(row.length, 10);
  assert.deepEqual([row[0], row[1], row[2]], [receipt, String(h.rows(PRIVATE).at(-1)![1]), '架空選手']);
  assert.deepEqual(row.slice(3), ['1,2,3,4,5', '不要', GYM_NAME, GYM_PHONE, 'はい', agreed(false, true), HASH]);
  assert.ok(row.every((v: unknown) => typeof v === 'string'), '電話の先頭の0も、文字のまま');
  // ジム責任者の名前・電話は、誓約記録のほかのどこにも、ping・ログ・プロパティにも出ない
  for (const [name, sheet] of h.book.sheets as Map<string, any>) if (name !== REC) for (const s of [GYM_NAME, GYM_PHONE]) assert.ok(!JSON.stringify(sheet.rows).includes(s), name + ' に ' + s + ' が入っていない');
  for (const s of [GYM_NAME, GYM_PHONE]) { assert.ok(!JSON.stringify(ping(h)).includes(s)); assert.ok(!h.logs.join('\n').includes(s)); assert.ok(![...h.props.values()].join('\n').includes(s)); }
  // OS取込用・名簿ZIPにも出ない
  h.call('exportTournament');
  const csv = h.zips.at(-1).find((f: any) => f.name === 'players.csv').bytes.toString('utf8');
  for (const s of [GYM_NAME, GYM_PHONE, 'テスト用の文です', HASH]) assert.ok(!csv.includes(s), 'CSVに ' + s + ' が入っていない');
  assert.deepEqual(json(h.zips.at(-1).map((f: any) => f.name).filter((n: string) => !n.startsWith('photos/'))), ['players.csv']);
});

test('保存（本番）: 保護者の同意は、18歳未満のみ→年齢17・空・読めないで要る／18以上で要らない。全員→いつも要る。なし→要らない。要るのに無ければ、保存しない', () => {
  const need = (mode: string, age: string) => { const h = live(); h.setSetting(R.guardian, mode); return { h, p: entry(h, 'live', { age, grade: '中3' }, { pledgeGuardian: undefined }) }; };
  for (const [mode, age, needed] of [['18歳未満のみ', '17', true], ['18歳未満のみ', '1', true], ['18歳未満のみ', '18', false], ['18歳未満のみ', '20', false], ['18歳未満のみ', '120', false], ['全員', '40', true], ['全員', '18', true], ['なし', '5', false], ['なし', '17', false]] as [string, string, boolean][]) {
    const { h, p } = need(mode, age);
    if (needed) {
      const before = snap(h), error = thrown(() => h.call('saveEntry_', p));
      assert.equal(error.code, 'pledge', mode + age); assert.equal(error.retryable, false); assert.match(error.message, /保護者（連帯責任者）の同意の確認（✔）が入っていません/); assert.equal(snap(h), before, '何も書かれない');
      p.pledgeGuardian = 'yes'; assert.ok(h.call('saveEntry_', p), mode + age + ' ✔あり');
      assert.equal(json(h.rows(REC).at(-1))[4], 'はい');
      assert.ok(json(h.rows(REC).at(-1))[8].includes('【保護者の同意】' + G));
    } else {
      assert.ok(h.call('saveEntry_', p), mode + age + ' は要らない');
      assert.equal(json(h.rows(REC).at(-1))[4], '不要'); assert.ok(!json(h.rows(REC).at(-1))[8].includes('【保護者の同意】'));
      // ✔が付いてきても、要らないのだから記録は「不要」
      const q = entry(h, 'live', { age, grade: '中3' }, { pledgeGuardian: 'yes' }); h.call('saveEntry_', q); assert.equal(json(h.rows(REC).at(-1))[4], '不要');
    }
  }
  // 年齢を聞かない大会（年齢＝なし）で 全員 → 年齢が空でも要る
  const h = live({ 年齢: 'なし', [R.guardian]: '全員' });
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', { age: '' }, { pledgeGuardian: undefined }))).code, 'pledge');
  assert.ok(h.call('saveEntry_', entry(h, 'live', { age: '' })));
});

test('保存: ✔の漏れ → コード pledge（決まった文）。pledge が yes でない・項目の番号がそろわない（足りない・多い・順番ちがい・空白）。何も書かず、写真も作らず、カウンターも進めない', () => {
  const h = live(); const before = snap(h), resources = h.resources.size;
  const bad: [string, Record<string, string | undefined>][] = [
    ['pledge が無い', { pledge: undefined }], ['pledge が no', { pledge: 'no' }], ['pledge が空', { pledge: '' }], ['項目が無い', { pledgeItems: undefined }], ['項目が空', { pledgeItems: '' }],
    ['4つだけ', { pledgeItems: '1,2,3,4' }], ['抜けている', { pledgeItems: '1,2,4,5' }], ['6つ', { pledgeItems: '1,2,3,4,5,6' }], ['順番ちがい', { pledgeItems: '5,4,3,2,1' }], ['空白入り', { pledgeItems: '1, 2, 3, 4, 5' }], ['同じ番号', { pledgeItems: '1,1,2,3,4' }], ['0から', { pledgeItems: '0,1,2,3,4' }], ['全角', { pledgeItems: '１,２,３,４,５' }], ['最後に,', { pledgeItems: '1,2,3,4,5,' }], ['yes', { pledgeItems: 'yes' }],
  ];
  for (const [label, keys] of bad) {
    const error = thrown(() => h.call('saveEntry_', entry(h, 'live', {}, keys)));
    assert.equal(error.code, 'pledge', label); assert.equal(error.message, MESSAGES.items, label); assert.equal(error.retryable, false);
  }
  assert.equal(snap(h), before); assert.equal(h.resources.size, resources, '写真も作らない');
  // 項目の数は、いまの「誓約書」タブの数に合わせる（3つに減らしたら 1,2,3）
  fillTab(h, ITEMS.slice(0, 3)); const hash3 = sha(canonOf(ITEMS.slice(0, 3), G, Y));
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', {}, { pledgeHash: hash3 }))).code, 'pledge', '1,2,3,4,5 は多すぎる');
  assert.ok(h.call('saveEntry_', entry(h, 'live', {}, { pledgeHash: hash3, pledgeItems: '1,2,3' })));
  assert.equal(json(h.rows(REC).at(-1))[3], '1,2,3');
});

test('保存: ジム責任者の同意＝あり → 同意の✔・名前(1〜40字)・携帯電話・許可の念押しが要る。1つずつ具体的な文で断る。ハイフン・全角の電話は数字だけにして記録する', () => {
  const h = live(); const before = snap(h);
  const cases: [string, Record<string, string | undefined>, string, RegExp][] = [
    ['同意の✔が無い', { pledgeGym: undefined }, 'gym', /ジム責任者の同意の確認（✔）が入っていません/], ['同意の✔が no', { pledgeGym: 'no' }, 'gym', /ジム責任者の同意の確認/],
    ['名前が無い', { gymName: undefined }, 'gym', /ジム責任者のお名前を、40文字までで入れてください/], ['名前が空白だけ', { gymName: ' \u3000' }, 'gym', /お名前/], ['名前が41字', { gymName: 'あ'.repeat(41) }, 'gym', /お名前/],
    ['電話が無い', { gymPhone: undefined }, 'gym', /携帯電話を、ハイフンなしの11けたで入れてください/], ['050', { gymPhone: '05012345678' }, 'gym', /携帯電話/], ['固定電話', { gymPhone: '0312345678' }, 'gym', /携帯電話/], ['けた足りない', { gymPhone: '0901234567' }, 'gym', /携帯電話/], ['文字まじり', { gymPhone: '090-abcd-5678' }, 'gym', /携帯電話/],
    ['念押しが無い', { gymPermission: undefined }, 'permission', /^ジム責任者の許可をとっているか、確認のチェックが必要です。$/], ['念押しが no', { gymPermission: 'no' }, 'permission', /許可をとっているか/],
  ];
  for (const [label, keys, code, message] of cases) {
    const error = thrown(() => h.call('saveEntry_', entry(h, 'live', {}, keys)));
    assert.equal(error.code, code, label); assert.match(error.message, message, label); assert.equal(error.retryable, false);
  }
  assert.equal(snap(h), before);
  assert.equal(MESSAGES.permission, 'ジム責任者の許可をとっているか、確認のチェックが必要です。');
  assert.ok(h.call('saveEntry_', entry(h, 'live', {}, { gymName: 'あ'.repeat(GYM_NAME_MAX) })), '40字ちょうどは通る');
  for (const [typed, saved] of [['090-0000-0000', '09000000000'], ['０９０－１２３４－５６７８', '09012345678'], [' 080 1234 5678 ', '08012345678'], ['070ー1234ー5678', '07012345678']]) {
    h.call('saveEntry_', entry(h, 'live', {}, { gymPhone: typed })); assert.equal(json(h.rows(REC).at(-1))[6], saved, typed);
  }
  // 順番：同意 → 名前 → 電話 → 念押し（先に出会ったものを言う）
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', {}, { pledgeGym: undefined, gymName: '', gymPhone: 'x', gymPermission: undefined }))).message.includes('同意の確認'), true);
});

test('保存: ジム責任者の同意＝なし → ジム責任者の欄は求めない。✔・名前・電話が付いてきても、記録しない（名前・電話は空、念押しは「不要」）', () => {
  const h = live(); h.setSetting(R.gym, 'なし');
  assert.ok(h.call('saveEntry_', entry(h, 'live', {}, { pledgeGym: undefined, gymName: undefined, gymPhone: undefined, gymPermission: undefined })));
  assert.deepEqual(json(h.rows(REC).at(-1)).slice(3), ['1,2,3,4,5', '不要', '', '', '不要', agreed(false, false), HASH]);
  h.call('saveEntry_', entry(h, 'live')); assert.deepEqual(json(h.rows(REC).at(-1)).slice(5, 8), ['', '', '不要']);
  assert.ok(!JSON.stringify(h.rows(REC)).includes(GYM_NAME));
});

test('保存: ジム名が「無所属」などの人は、ジム責任者の欄の免除ではなく、受付が断る（ジムに入っていない人は参加できない）。ふつうのジム名（「個人レッスンジム」も）は、ジム責任者の欄を求める', () => {
  const h = live();
  for (const gym of ['無所属', 'むしょぞく', 'ムショゾク', '所属なし', 'なし', '無し', ' 無 所 属 ', 'ﾑｼｮｿﾞｸ', '無\u200B所属', '無所属ジム', 'ジム無所属']) {
    const rows = h.rows(REC).length;
    const error = thrown(() => h.call('saveEntry_', entry(h, 'live', { gym })));
    assert.equal(error.code, 'input', gym); assert.match(error.message, /ジムに所属していない人は、参加できません/);
    assert.equal(h.rows(REC).length, rows, gym + ': 何も書かれていない');
  }
  // ふつうのジム名は求める（ジム責任者の鍵が無ければ gym）
  for (const gym of ['架空ジムA', '個人レッスンジム']) assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', { gym }, { pledgeGym: undefined }))).code, 'gym', gym);
  // ジム責任者の同意＝なし のときは、ジム責任者の欄は空（ジム名が無所属なら、そもそも断る）
  const off = live(); off.setSetting(R.gym, 'なし');
  assert.equal(thrown(() => off.call('saveEntry_', entry(off, 'live', { gym: '無所属' }))).code, 'input');
  off.call('saveEntry_', entry(off, 'live')); assert.deepEqual(json(off.rows(REC).at(-1)).slice(5, 8), ['', '', '不要']);
});

test('保存: 本番で「誓約書の文の確認」が まだ → コード pledgeconfirm。何も書かない。テスト用(mode=test)は動く。済み にすると動く', () => {
  const h = live({}, false); const before = snap(h);
  const error = thrown(() => h.call('saveEntry_', entry(h, 'live')));
  assert.equal(error.code, 'pledgeconfirm'); assert.equal(error.message, MESSAGES.confirm); assert.equal(error.retryable, false); assert.equal(snap(h), before);
  assert.ok(h.call('saveEntry_', entry(h, 'test')), 'テストは動く');
  assert.equal(h.rows(REC_TEST).length, 3, 'テスト誓約記録に書く（自動テスト + 1）'); assert.equal(h.rows(REC).length, 1, '本番の記録には書かない'); assert.equal(h.rows(PRIVATE).length, 1);
  assert.match(json(h.rows(REC_TEST).at(-1))[0], /^TEST-/);
  h.setSetting(R.confirm, '済み'); assert.ok(h.call('saveEntry_', entry(h, 'live'))); assert.equal(h.rows(REC).length, 2);
  // 空・でたらめは まだ（安全側）
  for (const v of ['', 'ほぼ済み']) { h.setSetting(R.confirm, v); assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live'))).code, v ? 'setup' : 'pledgeconfirm', JSON.stringify(v)); }
});

test('保存: 文の指紋がちがう／無い → コード pledgeold（決まった文）。会長が「誓約書」タブを直したら、古いリンクでは申し込めない。何も書かない', () => {
  const h = live(); const oldHash = HASH;
  assert.ok(h.call('saveEntry_', entry(h, 'live')));
  fillTab(h, [...ITEMS.slice(0, 4), 'テスト用の文です5（直した）']);
  const before = snap(h);
  for (const hash of [oldHash, undefined, '', 'x', HASH.toUpperCase(), HASH + ' ']) {
    const error = thrown(() => h.call('saveEntry_', entry(h, 'live', {}, { pledgeHash: hash })));
    assert.equal(error.code, 'pledgeold', String(hash)); assert.equal(error.message, MESSAGES.old); assert.equal(error.retryable, false);
  }
  assert.equal(snap(h), before);
  // 新しい指紋なら通る。保護者の文・ジム責任者の文を直しても指紋が変わる
  const fresh = sha(canonOf([...ITEMS.slice(0, 4), 'テスト用の文です5（直した）'], G, Y));
  assert.ok(h.call('saveEntry_', entry(h, 'live', {}, { pledgeHash: fresh })));
  assert.ok(json(h.rows(REC).at(-1))[8].includes('テスト用の文です5（直した）')); assert.equal(json(h.rows(REC).at(-1))[9], fresh);
  fillTab(h, ITEMS, G + '（直した）', Y); assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', {}, { pledgeHash: fresh }))).code, 'pledgeold');
  fillTab(h, ITEMS, G, Y + '（直した）'); assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', {}, { pledgeHash: fresh }))).code, 'pledgeold');
  // 確認（まだ）が先：まだ のときは、指紋が合っていても pledgeconfirm
  h.setSetting(R.confirm, 'まだ'); assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', {}, { pledgeHash: sha(canonOf(ITEMS, G, Y + '（直した）')) }))).code, 'pledgeconfirm');
});

test('保存（古いリンク）: リンクを作ったあとで「保護者の同意」「ジム責任者の同意」が厳しくなったら、「✔を入れてください」ではなく「新しいリンクをもらってください」（pledgeold）と答える。何も書かない', () => {
  // 古いページ：保護者の欄もジム責任者の欄も無い（リンクは plg=none・plm=off）。✔の鍵は付いてこない。リンクの設定は、ページがそのまま返す
  const stale = (over: Record<string, string | undefined> = {}) => ({ pledgeGuardian: undefined, gymName: undefined, gymPhone: undefined, gymPermission: undefined, pledgeGym: undefined, pledgeGuardianMode: 'none', pledgeGymMode: 'off', ...over });
  // ふつうの順番：先に「なし」「なし」でリンクを作り、そのあとで会長が設定を厳しくする
  const h = live({ 保護者の同意: 'なし', ジム責任者の同意: 'なし', 年齢: '任意' });
  assert.ok(h.call('saveEntry_', entry(h, 'live', { age: '15' }, stale())), 'リンクと設定が同じなら、通る（欄は要らない）');
  h.setSetting(R.guardian, '全員');
  for (const age of ['30', '15', '']) { const e = thrown(() => h.call('saveEntry_', entry(h, 'live', { age }, stale()))); assert.equal(e.code, 'pledgeold', '保護者の同意＝全員 ' + age); assert.equal(e.message, '誓約書の設定が、リンクを作ったあとで変わりました。主催者から、新しい申し込みリンクをもらってください。'); assert.equal(e.retryable, false); }
  h.setSetting(R.guardian, '18歳未満のみ');
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', { age: '15' }, stale()))).code, 'pledgeold', '18歳未満のみ：17歳以下は、古いページに欄が無い');
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', { age: '' }, stale()))).code, 'pledgeold', '年齢が空でも（安全側）');
  assert.ok(h.call('saveEntry_', entry(h, 'live', { age: '30' }, stale())), '30歳は要らないので、古いリンクでも通る（行き止まりではない）');
  h.setSetting(R.guardian, 'なし'); h.setSetting(R.gym, 'あり');
  const g = thrown(() => h.call('saveEntry_', entry(h, 'live', { age: '30' }, stale()))); assert.equal(g.code, 'pledgeold'); assert.match(g.message, /新しい申し込みリンクをもらってください/);
  // 断ったあとは、何も書かれていない
  const rows = h.rows(PRIVATE).length; thrown(() => h.call('saveEntry_', entry(h, 'live', { age: '30' }, stale()))); assert.equal(h.rows(PRIVATE).length, rows); assert.equal(h.rows(REC).length, rows);
  // 画面：保存していない、と言い切る赤の ✕。再送ボタンは出さない
  const page = html(h, entry(h, 'live', { age: '30' }, stale()));
  assert.match(page, /✕ 送れませんでした/); assert.match(page, /新しい申し込みリンクをもらってください/); assert.doesNotMatch(page, /同じ申込を確認・再開する/);
});

test('保存（古いリンク）: ゆるくなった分や同じ設定は、止めない。鍵が付いてこない／読めない値は、調べず、今までの断り（pledge）になる。ページに余分な欄があるだけなら通る', () => {
  // 先に「全員」「あり」でリンクを作り（ページに両方の欄がある）、そのあとで会長がゆるくした
  const h = live({ 保護者の同意: '全員', ジム責任者の同意: 'あり' });
  const full = { pledgeGuardianMode: 'all', pledgeGymMode: 'on' };
  assert.ok(h.call('saveEntry_', entry(h, 'live', { age: '30' }, full)), '同じ設定');
  h.setSetting(R.guardian, 'なし'); h.setSetting(R.gym, 'なし');
  assert.ok(h.call('saveEntry_', entry(h, 'live', { age: '30' }, full)), '設定がゆるくなった：✔が付いていても通る（記録は「不要」）');
  assert.equal(json(h.rows(REC).at(-1))[4], '不要');
  // 鍵が無い・読めない値：リンクの設定を調べず、今までの検査（✔の漏れ → pledge）に進む
  h.setSetting(R.guardian, '全員'); h.setSetting(R.gym, 'あり');
  for (const mode of [undefined, '', 'x', 'ALL', 'constructor', '__proto__']) for (const gym of [undefined, '', 'maybe', 'On']) {
    const keys = { pledgeGuardian: undefined, pledgeGuardianMode: mode, pledgeGymMode: gym };
    assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live', { age: '30' }, keys))).code, 'pledge', String(mode) + '/' + String(gym));
  }
  // 「なし」の設定では、2つの鍵が付いてきても、これまでどおり pledge で断る（古いリンクの安全網）
  const off = harness(); off.ready(); off.call('openEntries');
  assert.equal(thrown(() => off.call('saveEntry_', { ...off.params('live'), ...pledgeKeys({}), pledgeGuardianMode: 'none', pledgeGymMode: 'off' })).code, 'pledge');
  assert.equal(thrown(() => off.call('saveEntry_', { ...off.params('live'), pledgeGuardianMode: 'all' })).code, 'pledge', '2つの鍵だけでも、誓約書の鍵として数える');
});

test('保存: 記録に残る文は、その時の「誓約書」タブの文（指紋が合っているので、リンクの文と同じ）。番号つき。✔した保護者・ジム責任者の文だけ。指紋も残る', () => {
  const h = live(); h.setSetting(R.guardian, '全員');
  h.call('saveEntry_', entry(h, 'live'));
  const row = json(h.rows(REC).at(-1));
  assert.equal(row[8], agreed(true, true)); assert.equal(row[9], HASH);
  assert.equal(HASH, ping(h).pledgeHash, 'リンクの指紋と同じ');
  // 式にならない：項目が = + - @ で始まるとき、保存は ' を足す（表示は元のまま）
  const odd = live(); fillTab(odd, ['=1+1', '+81 すごい', '-マイナス', '@会社', '＝全角']);
  const hash = sha(canonOf(['=1+1', '+81 すごい', '-マイナス', '@会社', '＝全角'], G, Y));
  odd.call('saveEntry_', entry(odd, 'live', {}, { pledgeHash: hash }));
  const text = odd.rows(REC).at(-1)![8]; assert.ok(String(text).startsWith('1. =1+1'), '番号が先頭なので式にならない');
  assert.equal(json(odd.rows(REC).at(-1))[8].split('\n')[1], '2. +81 すごい');
});

test('保存: 「なし」のとき、誓約書の鍵が1つでも付いてきたら、コード pledge で断る（古いリンク：誓約したつもりで記録が無い事故を防ぐ）。空の鍵は無視。付いてこなければ今までどおり', () => {
  const keys = ['pledge', 'pledgeItems', 'pledgeGuardian', 'gymName', 'gymPhone', 'gymPermission', 'pledgeGym', 'pledgeHash'];
  for (const setup of [(h: H) => { h.setSetting(R.pledge, 'なし'); }, (h: H) => { h.setSetting(R.pledge, ''); }, (h: H) => { for (const label of NEW_ROWS) without(h, label); }]) {
    const h = harness(); h.ready({ 階級分け: 'あり' }); setup(h); h.call('openEntries');
    const before = snap(h);
    for (const key of keys) {
      const error = thrown(() => h.call('saveEntry_', h.params('live', { division: '中学生男子', weightClass: '-37', [key]: key === 'pledge' ? 'yes' : 'x' })));
      assert.equal(error.code, 'pledge', key); assert.match(error.message, /誓約書の設定が、リンクを作ったあとで変わりました。主催者から、新しい申し込みリンクをもらってください。/);
    }
    assert.equal(snap(h), before, '何も書かれない');
    assert.ok(h.call('saveEntry_', h.params('live', { division: '中学生男子', weightClass: '-37' })), '鍵が無ければ通る');
    assert.ok(h.call('saveEntry_', h.params('live', { division: '中学生男子', weightClass: '-37', pledge: '', pledgeItems: '  ', gymName: '' })), '空の鍵は無視');
    assert.deepEqual(tabs(h), ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS]);
  }
});

test('保存: 誓約書の設定が壊れているとき、テストは赤い失敗(setup)で何も書かない。本番は設定の直しもので止まる', () => {
  const h = live(); fillTab(h, [], G, Y);
  const before = snap(h);
  const test = thrown(() => h.call('saveEntry_', entry(h, 'test')));
  assert.equal(test.code, 'setup'); assert.equal(test.publicMessage, 'ただいま受付に問題があります。主催者へご連絡ください。', '選手には直し方を言わない'); assert.equal(snap(h), before);
  assert.equal(thrown(() => h.call('saveEntry_', entry(h, 'live'))).code, 'setup'); assert.equal(snap(h), before);
  const tooMany = live(); fillTab(tooMany, Array.from({ length: 9 }, (_, i) => 'テスト用の文です' + i));
  assert.equal(thrown(() => tooMany.call('saveEntry_', entry(tooMany, 'test', {}, { pledgeItems: '1,2,3,4,5,6,7,8,9' }))).code, 'setup');
});

/* ───────── 保存：書き込みの順番・再送 ───────── */

test('保存: 既存の行を書いたあと（申込原本 → OS取込用 → 花道プロフィール → 誓約記録）、同じロックの中で書く', () => {
  const h = live({ 階級分け: 'あり', 花道の追加情報: 'あり' });
  const events: string[] = []; let held = 0;
  h.api.LockService = { getScriptLock: () => ({ tryLock: () => { held++; events.push('lock'); return true; }, releaseLock: () => { held--; events.push('unlock'); } }) };
  for (const [name, tag] of [[PRIVATE, 'private'], [OS, 'os'], [HN_TAB, 'profile'], [REC, 'pledge']]) {
    const sheet = h.book.getSheetByName(name), getRange = sheet.getRange, appendRow = sheet.appendRow;
    sheet.getRange = (...a: any[]) => { const range = getRange(...a), setValues = range.setValues; range.setValues = (v: any) => { events.push(tag + (held ? '' : '!ロックの外')); return setValues(v); }; return range; };
    sheet.appendRow = (v: any) => { events.push(tag + (held ? '' : '!ロックの外')); return appendRow(v); };
  }
  const HN = { hnNameKana: 'カクウ', hnGymKana: 'カクウ', hnRing: '架空の花', hnRingKana: 'カクウ', hnBirth: '1975-04-05', hnKickYears: '3', hnPerWeek: '2', hnOther: '', hnJob: '', hnHobby: '釣り', hnReason: '健康', hnMessage: 'よろしく' };
  h.call('saveEntry_', entry(h, 'live', { division: '花道・男子（40歳以上）', weightClass: '-70', ...HN }));
  assert.deepEqual(events, ['lock', 'private', 'os', 'profile', 'pledge', 'unlock']);
  assert.equal(h.rows(HN_TAB).length, 2); assert.equal(h.rows(REC).length, 2);
  // 誓約書だけのときは、花道のタブを増やさない
  const only = live(); const e2: string[] = []; only.api.LockService = { getScriptLock: () => ({ tryLock: () => { e2.push('lock'); return true; }, releaseLock: () => { e2.push('unlock'); } }) };
  const rec = only.book.getSheetByName(REC), g = rec.getRange; rec.getRange = (...a: any[]) => { const range = g(...a), sv = range.setValues; range.setValues = (v: any) => { e2.push('pledge'); return sv(v); }; return range; };
  only.call('saveEntry_', entry(only, 'live')); assert.deepEqual(e2, ['lock', 'pledge', 'unlock']);
});

test('保存（再送）: 同じ requestId の再送では、どの表の行も増えない。同じ受付番号を返す。結果の画面も 緑の ✓。文や設定が変わったあとでも、同じ結果を返す', () => {
  const h = live(); const p = entry(h, 'live');
  const first = h.call('saveEntry_', p); const before = JSON.stringify(sizes(h)), rec = JSON.stringify(h.rows(REC));
  for (let i = 0; i < 3; i++) assert.equal(h.call('saveEntry_', p), first);
  assert.equal(JSON.stringify(sizes(h)), before); assert.equal(JSON.stringify(h.rows(REC)), rec, '記録の行は、書き換えない');
  assert.match(html(h, p), /✓ 申し込みが完了しました/);
  // 会長が文を直した／確認をまだに戻した／誓約書をなしにした、あとで再送が来ても、すでに保存ずみなので、同じ受付番号を返す
  fillTab(h, [...ITEMS.slice(0, 4), '直した']); assert.equal(h.call('saveEntry_', p), first, '文を直したあと');
  h.setSetting(R.confirm, 'まだ'); assert.equal(h.call('saveEntry_', p), first, '確認をまだにしたあと');
  h.setSetting(R.pledge, 'なし'); assert.equal(h.call('saveEntry_', p), first, '誓約書をなしにしたあと'); assert.match(html(h, p), /✓ 申し込みが完了しました/);
  assert.equal(JSON.stringify(sizes(h)), before); assert.equal(JSON.stringify(h.rows(REC)), rec);
  // テストモードの再送も同じ
  const h2 = live(); const t = entry(h2, 'test'); h2.call('saveEntry_', t); const after = JSON.stringify(sizes(h2));
  h2.call('saveEntry_', t); assert.equal(JSON.stringify(sizes(h2)), after);
});

test('保存（再送）: 前の送信が、申込原本・OS取込用のあと、誓約記録の前で止まっていたら、再送で記録を足す（1行だけ）。鍵が付いてこない再送は、記録を作らない', () => {
  const h = live(); const p = entry(h, 'live');
  const receipt = h.call('saveEntry_', p);
  h.book.getSheetByName(REC).rows.length = 1; // 記録の行だけ無い状態
  assert.equal(h.call('saveEntry_', p), receipt);
  assert.equal(h.rows(REC).length, 2); assert.equal(h.rows(PRIVATE).length, 2); assert.equal(h.rows(OS).length, 2);
  assert.equal(json(h.rows(REC))[1][0], receipt); assert.equal(h.call('saveEntry_', p), receipt); assert.equal(h.rows(REC).length, 2);
  // 鍵が付いてこない再送（誓約書を「あり」にする前の申込）は、記録を作らず、同じ結果を返す
  const q = entry(h, 'live'); h.call('saveEntry_', q); h.book.getSheetByName(REC).rows.length = 2;
  const stripped = { ...q }; for (const k of PLEDGE_POST_KEYS) delete stripped[k];
  assert.equal(h.call('saveEntry_', stripped), h.rows(PRIVATE).at(-1)![0]); assert.equal(h.rows(REC).length, 2);
  // 記録を足すときも検査する：ちがう指紋では、足さない（偽の記録を作らない）
  h.book.getSheetByName(REC).rows.length = 2;
  const wrong = { ...q, pledgeHash: 'f'.repeat(64) };
  assert.equal(thrown(() => h.call('saveEntry_', wrong)).code, 'pledgeold'); assert.equal(h.rows(REC).length, 2);
});

test('保存（再送・R6c-1）: 学年・年齢・意気込み・入場曲を「なし」に変えたあとでも、記録が足りない再送は、記録を足して同じ受付番号を返す（「変わった」と断らない）', () => {
  // 保護者の同意は「全員」（「18歳未満のみ」だと、年齢を「なし」にできない決まり）
  const h = live({ 学年: '必須', 年齢: '必須', 意気込み: '必須', 入場曲: 'あり', 保護者の同意: '全員' });
  const p = entry(h, 'live', { musicUrl: 'https://music.apple.com/jp/album/test' });
  const receipt = h.call('saveEntry_', p);
  h.book.getSheetByName(REC).rows.length = 1; // 記録の行だけ無い状態（記録の前で止まった）
  for (const setting of ['学年', '年齢', '意気込み', '入場曲']) h.setSetting(setting, 'なし');
  assert.equal(h.call('saveEntry_', p), receipt);
  assert.equal(h.rows(REC).length, 2, '記録が足りた'); assert.equal(json(h.rows(REC))[1][0], receipt);
  assert.equal(h.rows(PRIVATE).length, 2, '申込原本は増えない'); assert.equal(h.rows(OS).length, 2);
});

test('保存: 同じ受付番号の記録の行がすでにあるときは、足さない（二重の行を作らない）。記録の行が1つ増えるのは、新しい申込1件につき1回だけ', () => {
  const h = live(); const p = entry(h, 'live');
  const receipt = h.call('receipt_', p.requestId, false) as string;
  h.book.getSheetByName(REC).rows.push([receipt, '手で足した行']);
  assert.equal(h.call('saveEntry_', p), receipt);
  assert.equal(h.rows(REC).length, 2, '同じ受付番号の行があるので、足さない'); assert.equal(json(h.rows(REC))[1][1], '手で足した行', '書き換えない');
  assert.equal(h.rows(PRIVATE).length, 2);
  for (let i = 0; i < 3; i++) h.call('saveEntry_', entry(h, 'live'));
  assert.equal(h.rows(REC).length, 5); assert.equal(new Set(h.rows(REC).slice(1).map((r) => r[0])).size, 4);
});

test('保存: 年齢を任意にして空のまま送られた人にも、18歳未満のみ なら保護者の同意を求める（聞きそこなって、同意なしで通さない）', () => {
  const h = live({ 年齢: '任意' });
  const p = entry(h, 'live', { age: '' }, { pledgeGuardian: undefined });
  assert.equal(thrown(() => h.call('saveEntry_', p)).code, 'pledge');
  p.pledgeGuardian = 'yes'; assert.ok(h.call('saveEntry_', p)); assert.equal(json(h.rows(REC).at(-1))[4], 'はい');
  assert.ok(h.call('saveEntry_', entry(h, 'live', { age: '30' }, { pledgeGuardian: undefined })), '30歳は要らない');
});

test('保存（再送）: 保存した申込を、ほかの内容で再送したら「変わった」で断る(changed)。誓約書の鍵が違っても、保存ずみの申込の結果は変えない', () => {
  const h = live(); const p = entry(h, 'live'); const receipt = h.call('saveEntry_', p);
  assert.equal(thrown(() => h.call('saveEntry_', { ...p, name: '架空別人' })).code, 'changed');
  assert.equal(h.call('saveEntry_', { ...p, pledgeItems: '1' }), receipt, '誓約書の鍵は、すでに記録ずみなので見ない');
  assert.equal(h.rows(REC).length, 2);
});

test('結果の画面: pledge・pledgeconfirm・pledgeold・gym・permission は「保存していない」と言い切る失敗。赤の ✕ と決まった文。再送ボタンは出さない。値は画面に出さない', () => {
  const h = live({}, false);
  const check = (params: any, message: string) => {
    const page = html(h, params);
    assert.match(page, /✕ 送れませんでした/, message); assert.ok(page.includes(message), message); assert.match(page, /受付番号は出ていません/); assert.ok(!page.includes('保存結果の確認が必要です')); assert.ok(!page.includes('<form'), '直さないと同じ失敗をくり返すので、再送ボタンは出さない');
    assert.match(page, /border:4px solid #b91c1c/, '赤'); assert.ok(!page.includes(GYM_NAME) && !page.includes(GYM_PHONE), '値は画面に出さない');
  };
  check(entry(h, 'live'), MESSAGES.confirm);
  h.setSetting(R.confirm, '済み');
  check(entry(h, 'live', {}, { pledgeItems: '1' }), MESSAGES.items);
  check(entry(h, 'live', {}, { pledgeHash: 'x' }), MESSAGES.old);
  check(entry(h, 'live', {}, { gymPermission: undefined }), MESSAGES.permission);
  check(entry(h, 'live', {}, { gymName: undefined }), 'ジム責任者のお名前を、40文字までで入れてください。');
  check(entry(h, 'live', {}, { pledgeGym: undefined }), 'ジム責任者の同意の確認（✔）が入っていません。申し込みページにもどって、✔を入れてください。');
  check(entry(h, 'live', { age: '17' }, { pledgeGuardian: undefined }), '保護者（連帯責任者）の同意の確認（✔）が入っていません。申し込みページにもどって、✔を入れてください。');
  for (const code of PLEDGE_ERROR_CODES) { const page = String(h.call('resultPage_', '', 'x', { code, message: 'x', retryable: false }, entry(h, 'live')).html); assert.match(page, /✕ 送れませんでした/, code); }
  assert.match(html(h, entry(h, 'live')), /✓ 申し込みが完了しました/);
});

test('結果の画面の再送フォーム: 誓約書が「あり」のときだけ、誓約書の10この隠し項目を足す（値は エスケープ）。「なし」では足さない', () => {
  const h = live();
  const fields = (hh: H, params: any) => [...String(hh.call('resultPage_', '', '保存を確認できません', { retryable: true }, params).html).matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)];
  const found = fields(h, entry(h, 'live', {}, { gymName: '<b>"&' }));
  assert.deepEqual(found.map((m) => m[1]), ['protocol', 'eventId', 'entryKey', 'mode', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'fighterClass', 'division', 'weightClass', 'photoDataUrl', ...PLEDGE_POST_KEYS]);
  assert.equal(found.find((m) => m[1] === 'gymName')![2], '&lt;b&gt;&quot;&amp;'); assert.equal(found.find((m) => m[1] === 'pledgeHash')![2], HASH); assert.equal(found.find((m) => m[1] === 'pledgeItems')![2], '1,2,3,4,5');
  const off = harness(); off.ready();
  assert.equal(fields(off, off.params('live')).length, 22); assert.ok(!fields(off, off.params('live')).some((m) => PLEDGE_POST_KEYS.includes(m[1] as any)));
  // 花道もあるときは、花道の12個のあとに誓約書の10個
  const both = live({ 階級分け: 'あり', 花道の追加情報: 'あり' });
  const names = fields(both, entry(both, 'live', { division: '花道・男子（40歳以上）', weightClass: '-70', hnRing: 'x' })).map((m) => m[1]);
  assert.deepEqual(names.slice(-10), [...PLEDGE_POST_KEYS]); assert.equal(names.length, 22 + 12 + 10);
});

/* ───────── 自動テスト ───────── */

test('自動テスト: 「あり」でも通る（架空の✔・名前・電話）。テスト誓約記録に1行。文の確認が まだ でも、保護者の同意が全員でも、ジム責任者の同意が なし でも通る', () => {
  for (const [guardian, gym] of [['18歳未満のみ', 'あり'], ['全員', 'あり'], ['なし', 'なし'], ['全員', 'なし']]) {
    const h = harness(); h.call('onOpen'); h.fill({ [R.pledge]: 'あり', [R.guardian]: guardian, [R.gym]: gym }); h.call('setupTournament');
    assert.equal(h.call('statusInfo_').testComplete, true, guardian + gym);
    assert.equal(h.rows(TEST).length, 2); assert.equal(h.rows(REC_TEST).length, 2); assert.equal(h.rows(REC).length, 1);
    const row = json(h.rows(REC_TEST)[1]);
    assert.equal(row[0], h.rows(TEST)[1][0]); assert.equal(row[2], '自動テスト選手'); assert.equal(row[3], '1,2,3,4,5');
    assert.equal(row[4], guardian === '全員' ? 'はい' : '不要'); assert.deepEqual(row.slice(5, 8), gym === 'あり' ? ['自動テスト', '09000000000', 'はい'] : ['', '', '不要']);
    assert.equal(row[9], h.call('pledgeHash_', h.call('S_')));
    h.call('setupTournament'); assert.equal(h.rows(REC_TEST).length, 2, 'もう増えない');
  }
  const plain = harness(); plain.ready(); assert.ok(!plain.book.getSheetByName(REC_TEST));
});

/* ───────── .gs と core/pledge.ts は、同じ答え ───────── */

test('同じ答え: 上限・鍵の一覧・エラーコード・ジムに入っていない言い方の表・名前の上限は、core/pledge.ts と .gs で1字も違わない', () => {
  const h = harness();
  assert.deepEqual(json(vm.runInContext('PLEDGE_LIMITS_', h.api)), { ...PLEDGE_LIMITS });
  assert.deepEqual(json(vm.runInContext('PLEDGE_POST_KEYS_', h.api)), [...PLEDGE_POST_KEYS]);
  assert.deepEqual(json(vm.runInContext('PLEDGE_UNAFFILIATED_', h.api)), [...UNAFFILIATED_NAMES]);
  assert.deepEqual(json(vm.runInContext('PLEDGE_UNAFFILIATED_PHRASES_', h.api)), [...UNAFFILIATED_PHRASES]);
  assert.equal(vm.runInContext('PLEDGE_GYM_NAME_MAX_', h.api), GYM_NAME_MAX);
  assert.deepEqual(json(vm.runInContext('PLEDGE_TABLES_.map(function (t) { return t[0]; })', h.api)), [REC, REC_TEST]);
  assert.deepEqual(json(vm.runInContext('PLEDGE_HEADERS_', h.api)), REC_HEADERS);
  assert.equal(vm.runInContext('PLEDGE_TAB', h.api), TAB);
  for (const code of PLEDGE_ERROR_CODES) assert.ok(script.includes("'" + code + "'"), code);
  const sent = (script.match(/resultPage_[\s\S]*?const notSaved=!success&&!retry&&Boolean\(error\)&&\[([^\]]*)\]/) || [])[1] || '';
  for (const code of PLEDGE_ERROR_CODES) assert.ok(sent.includes("'" + code + "'"), code + ' は「送れませんでした」と言い切る一覧に入っている');
});

test('同じ答え: guardianNeeded・gymPhoneOk・isUnaffiliated は、書き方いろいろで core/pledge.ts と同じ', () => {
  const h = harness();
  const ages = ['', ' ', 'abc', '17', '18', '19', '0', '1', '120', '121', '999', '1000', '０', '１７', '１８', '２０', '17.5', '-5', '十八', '18歳', ' 20 ', '20\u200B', '\u200B20', '\u300020\u3000', '٢٠', '017', '0120', '+20', '1e2', undefined, null];
  for (const mode of ['none', 'all', 'under18']) for (const age of ages) assert.equal(h.api.guardianNeeded_(mode, age), guardianNeeded(mode as any, age as any), mode + JSON.stringify(age));
  const phones = ['09000000000', '09012345678', '080-1234-5678', '０９０１２３４５６７８', '０９０－１２３４－５６７８', '090ー1234ー5678', '  090 1234 5678 ', '05012345678', '0312345678', '090123456789', '0901234567', '', 'abc', '+819012345678', '090‐1234‐5678', '090−1234−5678', '\u200B09012345678', '06012345678', '0901234567８', undefined, null];
  for (const s of phones) { assert.equal(h.api.gymPhoneOk_(s), gymPhoneOk(s as any), JSON.stringify(s)); assert.equal(h.api.gymPhoneNormal_(s), gymPhoneNormal(s as any), JSON.stringify(s)); }
  const gyms = ['無所属', 'むしょぞく', 'ムショゾク', '所属なし', 'なし', '無し', 'ない', '無', 'フリー', '個人', ' 無所属 ', '\u3000無所属\u3000', '無 所 属', '無\u200B所属', 'ﾑｼｮｿﾞｸ', '', ' ', '無所属ジム', 'ジム無所属', '架空ジムA', 'ＡＢＣ', '無所属です', '所属', 'しょぞくなし', 'ショゾクナシ', '所属してない', '所属していません', 'ジムなし', '通っていない', '個人レッスンジム', 'なしジム', 'ナイスジム', undefined, null];
  for (const s of gyms) assert.equal(h.api.isUnaffiliated_(s), isUnaffiliated(s as any), JSON.stringify(s));
});

test('同じ答え: 文の入れ物の検査（項目の数・長さ・合計）は、core/pledge.ts の checkPledgeTexts と同じ答え。.gs の指紋は SHA-256', () => {
  const h = live();
  const cases: [string[], string, string][] = [
    [ITEMS, G, Y], [[], G, Y], [['a'], '', ''], [Array.from({ length: 8 }, () => 'a'), '', ''], [Array.from({ length: 9 }, () => 'a'), '', ''], [['あ'.repeat(120)], '', ''], [['あ'.repeat(121)], '', ''],
    [Array.from({ length: 5 }, () => 'あ'.repeat(120)), 'い'.repeat(50), 'う'.repeat(50)], [Array.from({ length: 5 }, () => 'あ'.repeat(120)), 'い'.repeat(51), 'う'.repeat(50)], [['😀'.repeat(60)], '', ''], [['😀'.repeat(61)], '', ''],
  ];
  for (const [items, guardian, gym] of cases) {
    fillTab(h, items, guardian, gym);
    const gsOk = problemsOf(h).filter((p) => /^「誓約書」タブ/.test(p)).length === 0;
    assert.equal(gsOk, checkTexts(items, guardian, gym), JSON.stringify([items.length, items[0]?.length, guardian.length, gym.length]));
    if (problemsOf(h).length === 0) assert.equal(ping(h).pledgeHash, sha(canonOf(items, guardian, gym)));
  }
});
function checkTexts(items: string[], guardian: string, gym: string): boolean { return parsePledgeCanon(canonOf(items, guardian, gym)) !== undefined; }

test('禁止語: 外へ出る道・評価の道を使わない。新しい権限は要らない。ログにジム責任者の値・誓約の文を出さない', () => {
  for (const word of ['UrlFetchApp', 'getAccessToken', 'ScriptApp.getOAuthToken', 'eval(', 'new Function', 'MailApp', 'GmailApp', 'DocumentApp']) assert.ok(!script.includes(word), word);
  assert.ok(!/Logger\.log\([^)]*(?:gymName|gymPhone|pledge|guardian)/.test(script), 'ログに誓約書の値を出さない');
  assert.ok(!/console\.(?:log|error)\([^)]*(?:gymName|gymPhone|pledge)/.test(script));
  const h = live();
  thrown(() => h.call('saveEntry_', entry(h, 'live', {}, { gymPermission: undefined }))); html(h, entry(h, 'live', {}, { gymName: '' }));
  assert.ok(!h.logs.join('\n').includes(GYM_NAME));
  // 版は 3.20261022.7 のまま（まだ公開していない）
  assert.match(script, /const RECEPTION_BUILD = '3\.20261022\.7';/); assert.equal(ping(h).build, '3.20261022.7');
});
