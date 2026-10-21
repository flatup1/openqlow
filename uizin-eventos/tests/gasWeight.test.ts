import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, owner, script } from './helpers/gasV3Harness.ts';
import { canonWeightClass, DEFAULT_WEIGHT_SETTINGS, parseClassList, parseWeightSettings, weightClassToken } from '../core/weightClass.ts';

const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', TEST_OS = 'テストOS取込用';
const ON = { 階級分け: 'あり' };
const ping = (h: ReturnType<typeof harness>) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
const csvOf = (h: ReturnType<typeof harness>) => h.zips.at(-1).find((f: any) => f.name === 'players.csv').bytes.toString('utf8').replace(/^\uFEFF/, '');
const parseCsv = (csv: string) => csv.split('\r\n').map((line) => line.slice(1, -1).split('","'));
const DIVISION_ROWS = ['階級：小学生以下', '階級：中学生女子', '階級：中学生男子', '階級：高校生・一般女子', '階級：高校生・一般男子', '階級：花道・女子（40歳以上）', '階級：花道・男子（40歳以上）'];
const entry = (h: ReturnType<typeof harness>, mode: 'test' | 'live', division: string, weightClass: string, over: Record<string, string> = {}) => h.params(mode, { division, weightClass, ...over });
const html = (h: ReturnType<typeof harness>, params: any): string => String(h.call('doPost', { parameter: params }).html);
/** Googleのコードの中（別の世界）で作られた配列は、そのままでは deepEqual できない。ふつうの配列にする */
const plain = (value: any[]): any[] => Array.from(value);
const without = (h: ReturnType<typeof harness>, key: string) => { const rows = h.settingsSheet().rows; const i = rows.findIndex((r: any[]) => r[0] === key); assert.ok(i >= 0, key); rows.splice(i, 1); };

test('階級: 設定タブの新しい行（階級分け・7区分・ロゴ）は、最後に足される。初期は「なし」で、表は要項どおり', () => {
  const h = harness(); h.call('onOpen');
  const rows = h.rows('設定'), labels = rows.slice(1).map((r) => r[0]);
  assert.deepEqual(labels.slice(0, 19), ['大会名', '開催日', '会場', '会場の地図URL', '主催者名', '問い合わせ先', '申込締切', '入場曲', '学年', '年齢', '意気込み', 'クラス分け', '上のクラスの名前', '上のクラスの条件', '上のクラスのルール', '下のクラスの名前', '下のクラスの条件', '下のクラスのルール', '上のクラスにする勝ち数'], 'これまでの19行は動かない');
  assert.deepEqual(labels.slice(19), ['階級分け', 'ロゴ', ...DIVISION_ROWS]);
  for (const r of rows.slice(1)) assert.equal(r.length, 3, '項目・値・説明');
  const value = (label: string) => rows.find((r) => r[0] === label)![1];
  assert.equal(value('階級分け'), 'なし'); assert.equal(value('ロゴ'), 'なし');
  assert.equal(value('階級：小学生以下'), 'なし');
  // 初期の表は、core/weightClass.ts の DEFAULT_DIVISIONS と同じ（コードの表と、シートの表がずれない）
  const fromSheet = DIVISION_ROWS.map((label) => ({ name: label.replace('階級：', ''), classes: parseClassList(value(label)).classes }));
  assert.deepEqual(fromSheet, DEFAULT_WEIGHT_SETTINGS.divisions);
  for (const label of DIVISION_ROWS) assert.match(rows.find((r) => r[0] === label)![2], /「なし」と書くと、階級は選ばせない/);
  assert.match(rows.find((r) => r[0] === '階級分け')![2], /あり／なし/); assert.match(rows.find((r) => r[0] === 'ロゴ')![2], /CKA/);
});

test('階級: 「階級分け」「ロゴ」は ▼ から あり／なし を選ぶ欄。区分の行は自由に書ける', () => {
  const h = harness(); h.call('onOpen');
  const at = (key: string) => h.rows('設定').findIndex((r) => r[0] === key) + 1;
  for (const key of ['階級分け', 'ロゴ']) {
    const rule = h.settingsSheet().validations.get(at(key) + ':2');
    assert.equal(JSON.stringify(rule.list), JSON.stringify(['なし', 'あり']), key); assert.equal(rule.allowInvalid, false, key);
  }
  for (const key of DIVISION_ROWS) assert.equal(h.settingsSheet().validations.get(at(key) + ':2'), undefined, key);
});

test('階級: 「なし」のときは、これまでと同じに動く。pingに階級・ロゴの印は出ず、区分・階級の列は空', () => {
  const h = harness(); h.ready();
  const body = ping(h);
  for (const key of ['weightMode', 'weights', 'logo', 'weightRows']) assert.equal(key in body, false, key);
  assert.equal(body.settingsProblem, '');
  assert.deepEqual(plain(h.rows(PRIVATE)[0].slice(18)), ['クラス', '区分', '階級']); assert.deepEqual(plain(h.rows(OS)[0].slice(11)), ['クラス', '区分', '階級']);
  assert.deepEqual(plain(h.rows(TEST).at(-1)!.slice(19)), ['', ''], '自動テストの1件も、区分・階級は空');
  assert.deepEqual(plain(h.rows(TEST_OS).at(-1)!.slice(12)), ['', '']);
  // 区分・階級を送ってきても、保存しない（エラーにもしない）
  h.call('saveEntry_', h.params('test', { division: '中学生男子', weightClass: '37kg以下', name: '甲' }));
  assert.deepEqual(plain(h.rows(TEST).at(-1)!.slice(19)), ['', '']);
  assert.equal(h.call('statusInfo_').testComplete, true);
});

test('階級: 「あり」にすると、ping が表をそのまま返す（初期の表）。自動テストの1件は、最初の区分（小学生以下＝階級なし）', () => {
  const h = harness(); h.ready(ON);
  const body = ping(h);
  assert.equal(body.weightMode, true); assert.equal(body.settingsProblem, '');
  assert.deepEqual(parseWeightSettings(body.weights), DEFAULT_WEIGHT_SETTINGS);
  assert.deepEqual(body.weights, { enabled: true, divisions: DEFAULT_WEIGHT_SETTINGS.divisions.map((d) => ({ name: d.name, classes: d.classes })) });
  assert.deepEqual(Object.keys(body.weights).sort(), ['divisions', 'enabled']); assert.deepEqual(Object.keys(body.weights.divisions[0]).sort(), ['classes', 'name']);
  assert.deepEqual(plain(h.rows(TEST).at(-1)!.slice(19)), ['小学生以下', '']);
  assert.deepEqual(plain(h.rows(TEST_OS).at(-1)!.slice(12)), ['小学生以下', '']);
  // 公開してよいのは、選手に見える表だけ
  const out = JSON.stringify(body);
  for (const secret of [owner, 'selftest@example.invalid', '09000000000', '自動テスト選手', h.props.get('spreadsheetId')!, h.props.get('photoFolderId')!, h.props.get('testFolderId')!]) assert.ok(!out.includes(secret), secret);
});

test('階級: 主催者が書いた表が、そのまま ping に出る（全角・書き方いろいろは、保存する形になる）。ロゴ', () => {
  const h = harness(); h.ready({ ...ON, ロゴ: 'あり' });
  h.setSetting('階級：中学生男子', '－37、＋60 無差別\n-40kg');
  const body = ping(h);
  assert.equal(body.logo, true);
  assert.deepEqual(body.weights.divisions.find((d: any) => d.name === '中学生男子').classes, ['37kg以下', '60kgをこえる', '無差別', '40kg以下']);
  h.setSetting('ロゴ', 'なし'); assert.equal('logo' in ping(h), false);
});

test('階級: 区分の行は、増やしても減らしても、消した行は①でもどらない。順番は表の上から', () => {
  const h = harness(); h.ready(ON);
  const rows = h.settingsSheet().rows;
  rows.splice(rows.findIndex((r: any[]) => r[0] === '階級：花道・女子（40歳以上）'), 2);
  rows.push(['階級：新しい区分', '-50、-60', '']);
  assert.deepEqual(ping(h).weights.divisions.map((d: any) => d.name), ['小学生以下', '中学生女子', '中学生男子', '高校生・一般女子', '高校生・一般男子', '新しい区分']);
  h.call('setupTournament');
  assert.deepEqual(h.rows('設定').slice(1).map((r) => r[0]).filter((l) => /^階級：/.test(l)), ['階級：小学生以下', '階級：中学生女子', '階級：中学生男子', '階級：高校生・一般女子', '階級：高校生・一般男子', '階級：新しい区分'], '消した花道の行は、①でもどらない');
  // 「階級：」のあとの空白・全角コロンも読む
  h.settingsSheet().rows.push(['階級: 半角コロン', 'なし', '']);
  assert.ok(ping(h).weights.divisions.some((d: any) => d.name === '半角コロン'));
});

test('階級: 区分の行の名前も、階級の表も、まちがっていたら、どの行がどうまちがいか言って止まる', () => {
  const cases: [string, (h: ReturnType<typeof harness>) => void, RegExp][] = [
    ['数字だけ', (h) => h.setSetting('階級：中学生男子', '37、-40'), /「階級：中学生男子」：「37」は、以下なら「-37」、こえるなら「\+37」と書いてください/],
    ['読めない', (h) => h.setSetting('階級：中学生男子', '-37、ほげ1'), /「階級：中学生男子」：「ほげ1」は、階級として読めません/],
    ['空', (h) => h.setSetting('階級：中学生男子', ''), /「階級：中学生男子」：空です（階級を書くか、階級を選ばせない区分なら「なし」と書いてください）/],
    ['同じ階級が2回', (h) => h.setSetting('階級：中学生男子', '-37、-37kg'), /「階級：中学生男子」：同じ階級が2回あります（37kg以下）/],
    ['区分が1つも無い', (h) => { const rows = h.settingsSheet().rows; for (let i = rows.length - 1; i >= 0; i--) if (/^階級：/.test(rows[i][0])) rows.splice(i, 1); }, /「階級：…」の行がありません/],
    ['区分の名前が同じ', (h) => h.settingsSheet().rows.push(['階級：中学生男子', '-37', '']), /同じ区分の名前が、2つあります/],
    ['区分の名前が長い', (h) => h.settingsSheet().rows.push(['階級：' + 'あ'.repeat(21), '-37', '']), /区分の名前は20文字までにしてください/],
    ['区分の名前が記号で始まる', (h) => h.settingsSheet().rows.push(['階級：=SUM(1)', '-37', '']), /「=」「\+」「-」「@」で始めないでください/],
    ['区分の名前が空', (h) => h.settingsSheet().rows.push(['階級：', '-37', '']), /「階級：」のあとに、区分の名前を書いてください/],
    ['区分が多すぎる', (h) => { for (let i = 0; i < 6; i++) h.settingsSheet().rows.push(['階級：区分' + i, '-37', '']); }, /12こまでです（いま13こ）/],
    ['階級が多すぎる', (h) => h.setSetting('階級：中学生男子', Array.from({ length: 21 }, (_, i) => '-' + (30 + i)).join('、')), /階級が多すぎます（20こまで）/],
    ['階級分けの値', (h) => h.setSetting('階級分け', 'たぶん'), /「階級分け」は、あり／なしのどれかにしてください/],
    ['ロゴの値', (h) => h.setSetting('ロゴ', 'はい'), /「ロゴ」は、あり／なしのどれかにしてください/],
  ];
  for (const [label, change, message] of cases) {
    const h = harness(); h.ready(ON); h.call('openEntries'); change(h);
    const body = ping(h);
    assert.match(body.settingsProblem, message, label);
    assert.equal('weights' in body, false, label + '：表の中身は返さない');
    assert.throws(() => h.call('setupTournament'), message, label + '：①も、直す所を言って止まる');
    const before = h.rows(PRIVATE).length;
    assert.match(html(h, entry(h, 'live', '中学生男子', '37kg以下')), /受付を調整しています/, label + '：本番の新しい申込は、受けない');
    assert.equal(h.rows(PRIVATE).length, before, label + '：申込原本に1行も足さない');
  }
  // 「なし」のときは、表に何が入っていても止めない
  const h = harness(); h.ready(); h.setSetting('階級：中学生男子', 'ほげほげ1'); h.settingsSheet().rows.push(['階級：', '', '']);
  assert.equal(ping(h).settingsProblem, '');
});

test('階級: 申込。区分と階級を保存し、名前は設定タブのいまの名前（書き方がちがっても、保存する形）', () => {
  const h = harness(); h.ready(ON);
  h.call('saveEntry_', entry(h, 'test', '中学生男子', '37kg以下', { name: '甲' }));
  h.call('saveEntry_', entry(h, 'test', '高校生・一般男子', '無差別', { name: '乙' }));
  h.call('saveEntry_', entry(h, 'test', '小学生以下', '', { name: '丙' }));
  h.call('saveEntry_', entry(h, 'test', ' 中学生　女子 ', '−40ｋｇ', { name: '丁' }));
  h.call('saveEntry_', entry(h, 'test', '花道・女子（40歳以上）', '60kgをこえる', { name: '戊' }));
  const priv = h.rows(TEST), os = h.rows(TEST_OS);
  assert.deepEqual(priv.slice(2).map((r) => [r[4], r[19], r[20]]), [['甲', '中学生男子', '37kg以下'], ['乙', '高校生・一般男子', '無差別'], ['丙', '小学生以下', ''], ['丁', '中学生女子', '40kg以下'], ['戊', '花道・女子（40歳以上）', '60kgをこえる']]);
  assert.deepEqual(os.slice(2).map((r) => [r[2], r[12], r[13]]), priv.slice(2).map((r) => [r[4], r[19], r[20]]));
  assert.ok(!JSON.stringify(os).includes('テスト太郎'), '連絡先はOS側に出ない');
  assert.equal(priv[2][0], os[2][0]); assert.equal(priv[2][17].length >= 32, true, 'リクエストIDは18列目のまま'); assert.equal(priv[2][18], '', 'クラスは使わないので空');
});

test('階級: 本番の申込（②受付を開始のあと）にも入る。A/Bクラスと一緒でも、それぞれ別の列', () => {
  const h = harness(); h.ready({ ...ON, クラス分け: 'あり' }); h.call('openEntries');
  h.call('saveEntry_', entry(h, 'live', '中学生女子', '40kg以下', { fighterClass: 'lower' }));
  assert.deepEqual(plain(h.rows(PRIVATE)[1].slice(18)), ['Bクラス', '中学生女子', '40kg以下']); assert.deepEqual(plain(h.rows(OS)[1].slice(11)), ['Bクラス', '中学生女子', '40kg以下']);
});

test('階級: 選ばれていない・設定にない・その区分にない階級は、保存せずに日本語で止める。数式も通さない', () => {
  const h = harness(); h.ready(ON);
  const n = h.rows(TEST).length;
  const bad: [Record<string, string>, RegExp][] = [
    [{ division: '', weightClass: '' }, /区分が選ばれていません。申込ページを開き直して/],
    [{ division: '宇宙人', weightClass: '37kg以下' }, /区分が選ばれていません/],
    [{ division: '中学生男子', weightClass: '' }, /階級が選ばれていません。申込ページを開き直して、「中学生男子」の階級を選んで/],
    [{ division: '中学生男子', weightClass: '99kg以下' }, /階級が選ばれていません/],
    [{ division: '中学生女子', weightClass: '無差別' }, /階級が選ばれていません/],
    [{ division: '=1+1', weightClass: '-37' }, /区分が選ばれていません/],
    [{ division: '中学生男子', weightClass: '=HYPERLINK("x")' }, /階級が選ばれていません/],
  ];
  for (const [over, message] of bad) { const page = html(h, h.params('test', over)); assert.match(page, message, JSON.stringify(over)); assert.ok(page.includes('送れませんでした'), 'まだ保存していないと言い切る'); assert.ok(!page.includes('同じ申込を確認・再開する'), 'やり直しの形は出さない'); }
  // 古い申込ページ（区分・階級を送らない）
  const old: any = h.params('test'); delete old.division; delete old.weightClass;
  assert.match(html(h, old), /区分が選ばれていません/);
  assert.equal(h.rows(TEST).length, n, '何も保存していない');
  // 送られた文字そのものは保存しない（設定の名前だけ）
  h.call('saveEntry_', entry(h, 'test', '中学生男子', '-37　', { name: 'x' }));
  assert.equal(h.rows(TEST).at(-1)![20], '37kg以下', '送られた「-37」ではなく、設定の形で保存する');
});

test('階級: 同じ申込番号の再送は1件のまま。同じ区分・階級なら同じ受付番号、ちがえば止まる', () => {
  const h = harness(); h.ready(ON); h.call('openEntries');
  const first = entry(h, 'live', '中学生男子', '37kg以下', { name: '甲' });
  const receipt = h.call('saveEntry_', first); const n = h.rows(PRIVATE).length;
  assert.equal(h.call('saveEntry_', { ...first, weightClass: '-37' }), receipt, '書き方がちがっても同じ階級');
  assert.equal(h.rows(PRIVATE).length, n);
  assert.throws(() => h.call('saveEntry_', { ...first, weightClass: '40kg以下' }), /送信後に入力内容が変わっています/);
  assert.throws(() => h.call('saveEntry_', { ...first, division: '中学生女子' }), /送信後に入力内容が変わっています/);
  assert.equal(h.rows(PRIVATE).length, n);
  // 小学生以下（階級なし）の再送
  const kid = entry(h, 'live', '小学生以下', '', { name: '子' }); const r2 = h.call('saveEntry_', kid);
  assert.equal(h.call('saveEntry_', { ...kid, weightClass: '' }), r2);
  // 受付のあとで、保存した区分が設定から消えても、再送は「保存ずみ」として通る（変わったとは言わない）
  const rows = h.settingsSheet().rows; rows.splice(rows.findIndex((r: any[]) => r[0] === '階級：中学生男子'), 1);
  assert.equal(h.call('saveEntry_', first), receipt);
  // 「あり」を「なし」に戻したあとも、同じ
  h.setSetting('階級分け', 'なし'); assert.equal(h.call('saveEntry_', first), receipt); assert.equal(h.call('saveEntry_', kid), r2);
});

test('階級: 「もう一度送る」の画面にも division・weightClass が入っていて、失わない', () => {
  const h = harness(); h.ready(ON);
  const p = entry(h, 'test', '中学生男子', '37kg以下');
  const page = String(h.call('resultPage_', '', '保存を確認できませんでした', { retryable: true }, p).html);
  assert.ok(page.includes('name="division" value="中学生男子"')); assert.ok(page.includes('name="weightClass" value="37kg以下"')); assert.ok(page.includes('同じ申込を確認・再開する'));
});

test('階級: 古い表（クラスまで・区分と階級の列が無い）は、最初の使用で自分で直る。既存のマスは1つも変わらない', () => {
  const h = harness(); h.ready();
  h.call('saveEntry_', h.params('test', { name: '昔の選手' })); h.call('openEntries');
  const oldRequest = h.params('live', { name: '昔の本番' }), oldReceipt = h.call('saveEntry_', oldRequest);
  const names = [PRIVATE, OS, TEST, TEST_OS];
  for (const [name, width] of [[PRIVATE, 21], [OS, 14], [TEST, 21], [TEST_OS, 14]] as const) for (const row of h.rows(name)) { assert.equal(row.length, width); row.length = width - 2; }
  const before = JSON.stringify(names.map((n) => h.rows(n)));
  const protections = names.map((n) => h.book.getSheetByName(n).protections.length);
  assert.equal(h.call('statusInfo_').testComplete, true);
  for (const [name, width] of [[PRIVATE, 21], [OS, 14], [TEST, 21], [TEST_OS, 14]] as const) {
    const rows = h.rows(name);
    assert.deepEqual(plain(rows[0].slice(width - 3)), ['クラス', '区分', '階級'], name);
    const was = JSON.parse(before)[names.indexOf(name)];
    assert.equal(JSON.stringify(rows[0].slice(0, width - 2)), JSON.stringify(was[0]), name + ' の左の見出しはそのまま');
    rows.slice(1).forEach((row, i) => assert.equal(JSON.stringify(row.slice(0, width - 2)), JSON.stringify(was[i + 1]), name + ' の古い行はそのまま'));
  }
  assert.deepEqual(names.map((n) => h.book.getSheetByName(n).protections.length), protections.map((n) => n + 1), '足した見出しにも、警告つき保護');
  h.call('statusInfo_'); assert.deepEqual(names.map((n) => h.book.getSheetByName(n).protections.length), protections.map((n) => n + 1), '2回目は何も増えない');
  // 直ったあとの申込（階級分けなし）
  h.call('saveEntry_', h.params('live', { name: '新しい選手' }));
  assert.equal(h.rows(PRIVATE).at(-1)![4], '新しい選手'); assert.equal(h.rows(PRIVATE).at(-1)!.length, 21);
  // 昔の行（区分・階級の列が空）の再送は、階級分けを「あり」にしたあとでも、同じ受付番号で通る（「変わった」と言わない）
  h.setSetting('階級分け', 'あり');
  assert.equal(h.call('saveEntry_', { ...oldRequest, division: '中学生男子', weightClass: '37kg以下' }), oldReceipt);
});

test('階級: 古い表の再送（階級分けを「あり」にしたあと）。保存した区分が空なら、変わったとは言わない', () => {
  const h = harness(); h.ready(); h.call('openEntries');
  const p = h.params('live', { name: '昔の人' }); const receipt = h.call('saveEntry_', p);
  h.setSetting('階級分け', 'あり');
  assert.equal(h.call('saveEntry_', { ...p, division: '中学生男子', weightClass: '37kg以下' }), receipt);
});

test('階級: 見出しの1マスだけ別の文字なら、直さずに止まる（階級・区分の列でも）', () => {
  for (const [name, col] of [[PRIVATE, 19], [OS, 12], [TEST, 20], [TEST_OS, 13]] as const) {
    const h = harness(); h.ready(); h.rows(name)[0][col] = 'ちがう';
    assert.throws(() => h.call('setupTournament'), new RegExp('「' + name + '」タブ'));
  }
  // 古い形（右の3つが空）に、メモが入っていると、bad
  const h = harness(); h.ready();
  for (const row of h.rows(PRIVATE)) row.length = 18; h.rows(PRIVATE)[0][19] = 'メモ';
  assert.throws(() => h.call('setupTournament'), /「申込原本（個人情報あり）」タブ/);
});

test('階級: 名簿ZIPの players.csv は、クラス・区分・階級の順に右へ。階級分けなしなら、これまでの形のまま', () => {
  const h = harness(); h.ready(ON); h.call('openEntries');
  h.call('saveEntry_', entry(h, 'live', '中学生男子', '37kg以下', { name: '甲' }));
  h.call('saveEntry_', entry(h, 'live', '小学生以下', '', { name: '乙' }));
  h.call('exportTournament');
  const csv = csvOf(h), table = parseCsv(csv);
  assert.deepEqual(table[0], ['管理番号', 'ジム名', '選手名', '学年', '年齢', '身長', '体重', '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）', 'クラス', '区分', '階級']);
  assert.deepEqual(table.slice(1).map((r) => [r[2], r[10], r[11], r[12]]), [['甲', '', '中学生男子', '37kg以下'], ['乙', '', '小学生以下', '']]);
  assert.ok(!csv.includes('drive.google.com') && !csv.includes('テスト太郎') && !csv.includes('09000000000'), '写真URL・連絡先は入れない');
  // 階級分けなし：10列＋クラス（これまでと同じ）
  const g = harness(); g.ready(); g.call('openEntries'); g.call('saveEntry_', g.params('live', { name: '甲' })); g.call('exportTournament');
  const old = parseCsv(csvOf(g)); assert.equal(old[0].length, 11); assert.equal(old[0].at(-1), 'クラス');
  // なしにしたあとでも、区分が入っている行があれば、列を付ける（入れたデータを捨てない）
  h.setSetting('階級分け', 'なし'); h.call('exportTournament'); assert.deepEqual(parseCsv(csvOf(h))[0].slice(-3), ['クラス', '区分', '階級']);
});

test('階級: テストの書き出しにも入る（階級分けありのとき）', () => {
  const h = harness(); h.ready(ON); h.call('exportTestTournament');
  const table = parseCsv(csvOf(h));
  assert.deepEqual(table[0].slice(-3), ['クラス', '区分', '階級']); assert.deepEqual(table[1].slice(-3), ['', '小学生以下', '']); assert.equal(table[1][2], '自動テスト選手');
  const h2 = harness(); h2.ready(); h2.call('exportTestTournament'); assert.equal(parseCsv(csvOf(h2))[0].length, 11);
});

test('階級: 自動テストは、最初の区分に階級があれば、その最初の階級を選ぶ。その区分の階級が空でも動く', () => {
  const h = harness(); h.ready(ON);
  const rows = h.settingsSheet().rows; rows.splice(rows.findIndex((r: any[]) => r[0] === '階級：小学生以下'), 1);
  h.props.set('lastTestBuild', 'old'); h.call('setupTournament');
  assert.deepEqual(plain(h.rows(TEST).at(-1)!.slice(19)), ['中学生女子', '37kg以下']);
  assert.equal(h.call('statusInfo_').testComplete, true);
});

test('階級: 古い設定タブ（クラスまで・階級の行なし）は、階級分けは「なし」と読む。pingが「行がない」と知らせ、①で行が足される', () => {
  const h = harness(); h.ready();
  const rows = h.settingsSheet().rows; for (const key of ['階級分け', 'ロゴ', ...DIVISION_ROWS]) rows.splice(rows.findIndex((r: any[]) => r[0] === key), 1);
  const body = ping(h);
  assert.equal(body.weightRows, false); assert.equal(body.settingsProblem, ''); assert.equal('weightMode' in body, false);
  const before = JSON.stringify(h.rows('設定'));
  h.call('setupTournament');
  assert.equal(JSON.stringify(h.rows('設定').slice(0, 20)), JSON.stringify(JSON.parse(before).slice(0, 20)), '今ある行は1マスも書き換えない');
  assert.deepEqual(h.rows('設定').slice(20).map((r) => r[0]), ['階級分け', 'ロゴ', ...DIVISION_ROWS]);
  assert.equal('weightRows' in ping(h), false);
});

test('階級: 階級の読み方は、core/weightClass.ts と同じ答えになる（書き方いろいろ・まちがい）', () => {
  const h = harness();
  const corpus = ['-37', '−37kg', '-37ｋｇ', '37kg以下', '37キロ以下', '37kgまで', '-37kg級', ' - 37 ', '+60', '＋60kg', '60kgをこえる', '60kg超', '60kgを超える', '60kg以上', '-37.5', '-37.55', '無差別', '無差別級', 'フリー', 'フリー級', 'free', 'OPEN', 'オープン', '体重無制限',
    'ライト級', 'ミドル', '37', '37kg', '=1+1', '-0', '-300', '-299', '+1000', 'abc1', '37kg未満', '＠ライト', 'あ'.repeat(16), 'あ'.repeat(17), '', '  ', '-', '+', 'kg', '１２３', '-３７', '\u200B-37\u200B', 'ー37', '-37kg以下', '無 差 別', '62kg級', '62キロ級', '62級', '+62kg級', 'kg', 'キロ', '以下', 'ー', '—', '-60以下', 'なし', 'なし。'];
  for (const raw of corpus) assert.equal(h.api.weightCanon_(raw), canonWeightClass(raw), JSON.stringify(raw));
  const lists = ['-37、-40、-43 kg', '-37 キロ', '-37kg 以下', '-60 以下', '37 kg以下、40 kg以下', '- 37, - 40', 'なし。', 'なし（階級は選ばない）', 'ー', '、', '/', 'スーパーヘビー級（体重制限なしの重いクラス）', 'kg、以下', '-37、-40, -43\n+60 無差別', '－37，－40／＋60', 'なし', 'なし（階級を選ばない）', '', '37, -37, -37kg, ほげ1', Array.from({ length: 21 }, (_, i) => '-' + (30 + i)).join('、'), 'ライト級、ミドル級', '-37、、、-40', 'あ'.repeat(17)];
  for (const raw of lists) { const mine = h.api.weightList_(raw), core = parseClassList(raw); assert.deepEqual({ classes: [...mine.classes], problems: [...mine.problems], none: mine.none }, core, JSON.stringify(raw)); }
  assert.equal(weightClassToken(h.api.weightCanon_('-37')), '-37');
});

test('階級: ログや画面に区分・階級の送信値を出さない。禁止語が増えていない', () => {
  assert.ok(!/console\.log|Logger\.log\([^)]*(?:division|weightClass)/.test(script), 'ログに送信値を出さない');
  for (const word of ['getAccessToken', 'ScriptApp.getOAuthToken', 'UrlFetchApp', 'eval(', 'new Function']) assert.ok(!script.includes(word), word);
  assert.match(script, /const RECEPTION_BUILD = '3\.20261019\.6';/);
  const h = harness(); h.ready(ON); assert.equal(ping(h).build, '3.20261019.6');
});

test('階級: 新しい版にすると、古い版で済ませた自動テストはやり直しになる（1回だけ）。区分も保存する', () => {
  const h = harness(); h.ready(ON);
  h.props.set('lastTestBuild', '3.20261010.5');
  assert.equal(h.call('statusInfo_').testComplete, false);
  assert.throws(() => h.call('openEntries'), /先にテスト申込1件/);
  const rows = h.rows(TEST).length;
  h.call('setupTournament');
  assert.equal(h.call('statusInfo_').testComplete, true); assert.equal(h.rows(TEST).length, rows + 1);
  h.call('setupTournament'); assert.equal(h.rows(TEST).length, rows + 1, 'もう増えない');
});

test('文書: 階級分けの表は、シートの初期値と1字も違わない。ひな形の build 番号も書いてある', () => {
  const doc = readFileSync(new URL('../docs/階級分け_設定の入れ方.md', import.meta.url), 'utf8');
  const h = harness(); h.call('onOpen');
  for (const label of DIVISION_ROWS) {
    const value = h.rows('設定').find((r) => r[0] === label)![1];
    assert.ok(doc.includes('| ' + label + ' | ' + value + ' |'), label + ' の初期値「' + value + '」が文書の表にそのまま入っている');
  }
  const build = script.match(/RECEPTION_BUILD = '([0-9.]+)'/)![1];
  assert.ok(doc.includes(build), 'docs に今の build 番号がある');
  const rows = h.rows('設定');
  assert.equal(rows.findIndex((r) => r[0] === '階級分け') + 1, 21, '文書の「B21」は、シートの行の番号と同じ');
  assert.equal(rows.findIndex((r) => r[0] === 'ロゴ') + 1, 22, '文書の「B22」は、シートの行の番号と同じ');
  for (const word of ['-37、-40', '+60', '無差別', 'なし', 'CKA', '階級分け', 'ロゴ']) assert.ok(doc.includes(word), word);
});

test('階級: 再送（受付のあとで、主催者が階級の表を直した）。保存した階級が表から消えても、同じ受付番号を返す', () => {
  const h = harness(); h.ready(ON); h.call('openEntries');
  const first = entry(h, 'live', '中学生男子', '37kg以下', { name: '甲' });
  const receipt = h.call('saveEntry_', first); const n = h.rows(PRIVATE).length;
  h.setSetting('階級：中学生男子', '-38、-40、-43');
  assert.equal(h.call('saveEntry_', first), receipt, '保存した37kg以下は、もう表にない：「保存していない」とも「変わった」とも言わない');
  assert.equal(h.rows(PRIVATE).length, n);
  // 階級のなかった区分に、あとから階級ができた：保存した行は階級が空。同じ受付番号を返す
  const kid = entry(h, 'live', '小学生以下', '', { name: '子' }); const kidReceipt = h.call('saveEntry_', kid);
  h.setSetting('階級：小学生以下', '-20、-25');
  assert.equal(h.call('saveEntry_', kid), kidReceipt);
  assert.equal(h.call('saveEntry_', { ...kid, weightClass: '-20' }), kidReceipt, '新しく階級を選び直して送っても、保存ずみの申込');
  // 区分がちがえば、変わったと言う（「保存していない」とは言わない）
  assert.throws(() => h.call('saveEntry_', { ...first, division: '中学生女子', weightClass: '-40' }), (e: any) => e.code === 'changed');
  // 今の表にない階級を送ってきた再送（古いページ）：保存した区分と同じなら、保存した行の確認として通る
  assert.equal(h.call('saveEntry_', { ...first, weightClass: '99kg以下' }), receipt);
});

test('階級: 階級のない区分（小学生以下）に送られてきた階級の文字は、保存しない（数式も）。保存するのは、空', () => {
  const h = harness(); h.ready(ON);
  h.call('saveEntry_', entry(h, 'test', '小学生以下', '=HYPERLINK("http://evil.example/","押す")', { name: '甲' }));
  h.call('saveEntry_', entry(h, 'test', '小学生以下', '37kg以下', { name: '乙' }));
  for (const sheet of [TEST, TEST_OS]) for (const row of h.rows(sheet).slice(-2)) assert.deepEqual(plain(row.slice(sheet === TEST ? 19 : 12)), ['小学生以下', ''], sheet);
  assert.ok(!JSON.stringify(h.rows(TEST).concat(h.rows(TEST_OS))).includes('HYPERLINK'));
});

test('階級: 見出しの右はし1マスだけ（階級）が空でも、自分で直る。ほかのマスは変わらない', () => {
  const h = harness(); h.ready(); h.call('saveEntry_', h.params('test', { name: '昔' }));
  const names = [PRIVATE, OS, TEST, TEST_OS];
  for (const name of names) { const row = h.rows(name)[0]; row[row.length - 1] = ''; }
  const before = JSON.stringify(names.map((n) => h.rows(n)));
  const protections = names.map((n) => h.book.getSheetByName(n).protections.length);
  h.call('statusInfo_');
  assert.deepEqual(names.map((n) => h.rows(n)[0].slice(-3).map(String)), names.map(() => ['クラス', '区分', '階級']));
  const after = JSON.stringify(names.map((n) => h.rows(n)));
  const a = JSON.parse(after), b = JSON.parse(before);
  names.forEach((_, i) => { a[i][0][a[i][0].length - 1] = ''; assert.equal(JSON.stringify(a[i]), JSON.stringify(b[i])); });
  assert.deepEqual(names.map((n) => h.book.getSheetByName(n).protections.length), protections.map((x) => x + 1), '足した1マスだけに、警告つき保護');
});

test('階級: 「設定」タブのB列は、B2〜B60ぜんぶ「文字」の形（行を足して「-37、-40」と書いても、式にならない）。古いタブに行を足したときも同じ', () => {
  const h = harness(); h.call('onOpen');
  const fmt = (row: number) => h.settingsSheet().formats.get(row + ':2');
  for (const row of [2, 21, 29, 30, 45, 60]) assert.equal(fmt(row), '@', 'B' + row);
  const old = harness(); old.call('onOpen'); old.settingsSheet().rows.length = 12; old.settingsSheet().formats.clear();
  old.call('onOpen');
  for (const row of [13, 21, 29, 30, 60]) assert.equal(old.settingsSheet().formats.get(row + ':2'), '@', '古いタブ B' + row);
});

test('階級: TS と .gs の読み方は、ことばの一覧ぜんぶで同じ答え（ことば×つづけ方の組み合わせと、決まった種のでたらめ文）', () => {
  const h = harness();
  const words = ['kg', 'キロ', 'ｋｇ', '級', '以下', '以上', 'まで', '超', '超え', '超える', 'こえる', 'をこえる', 'を超える', '未満', 'なし', '無し', 'ナシ', '階級なし', '階級無し', '階級はなし', '階級はありません', 'ありません', '特になし', 'なしです', 'なしでした',
    '無差別', '無差別級', 'フリー', 'フリー級', 'free', 'open', 'オープン', 'オープン級', '体重無制限', '体重制限なし', 'ライト級', 'ＬＩＧＨＴ', 'ﾗｲﾄ級', 'ミドル', 'あり', '有り', 'アリ', 'はい', 'いいえ', '-37。-40。-43', '-37。', '。-37', '37.5'];
  const wraps = (w: string) => [w, '(' + w + ')', '（' + w + '）', w + '。', w + '.', '「' + w + '」', '37' + w, '37 ' + w, '-37' + w, '-37 ' + w, '+60' + w, '60' + w + 'を' + w, '- ' + w, w + ' ' + w, '-37、' + w, w + '、-37', '-37kg ' + w];
  const corpus: string[] = [];
  for (const w of words) corpus.push(...wraps(w));
  // 決まった種で作る、でたらめな文（ことばのかけら・数字・記号・空白・区切りを、つなげたもの）
  const bits = ['-', '+', '＋', '−', 'ー', '37', '40.5', '１２', 'kg', 'キロ', '以下', '級', 'なし', '無差別', 'ライト', '。', '、', ',', ' ', '　', '(', ')', '（', '）', '/', '\n', '=', '@', 'あ', 'A', '・'];
  let seed = 123456789;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 2500; i++) { let s = ''; for (let n = 1 + Math.floor(rnd() * 6); n > 0; n--) s += bits[Math.floor(rnd() * bits.length)]; corpus.push(s); }
  for (const raw of corpus) {
    assert.equal(h.api.weightCanon_(raw), canonWeightClass(raw), 'canon ' + JSON.stringify(raw));
    const mine = h.api.weightList_(raw), core = parseClassList(raw);
    assert.deepEqual({ classes: [...mine.classes], problems: [...mine.problems], none: mine.none }, core, 'list ' + JSON.stringify(raw));
  }
  // 一覧のことばは、1つずつ、どちらでも同じ扱い（階級にならない・「なし」と読む）
  for (const w of ['kg', 'キロ', '級', '以下', '以上', 'まで', '超', '超え', '超える', 'こえる', 'をこえる', 'を超える', '未満']) assert.equal(canonWeightClass(w), '', w + ' は階級の名前にならない');
  for (const w of ['なし', '無し', 'ナシ', '階級なし', '階級無し', '階級はなし', '階級はありません', 'ありません', '特になし', 'なしです', 'なし。', '(なし)', 'なし（階級は選ばない）']) assert.equal(parseClassList(w).none, true, w + ' は「なし」');
  for (const w of ['オープン級', '体重制限なし', '体重無制限']) assert.equal(canonWeightClass(w), '無差別', w);
  assert.equal(canonWeightClass('ＬＩＧＨＴ'), 'LIGHT', '全角の英字は、半角にそろえて持つ'); assert.equal(canonWeightClass('ﾗｲﾄ級'), 'ライト級');
});

test('階級: 古い設定タブに足された「階級分け」「ロゴ」の行にも、▼の選び欄が付く。今ある行の選び欄は触らない', () => {
  const h = harness(); h.call('onOpen');
  const sheet = h.settingsSheet();
  sheet.rows.length = 12; sheet.validations.clear();
  h.call('onOpen');
  const at = (key: string) => sheet.rows.findIndex((r: any[]) => r[0] === key) + 1;
  for (const key of ['クラス分け', '階級分け', 'ロゴ']) {
    const rule = sheet.validations.get(at(key) + ':2');
    assert.equal(JSON.stringify(rule.list), JSON.stringify(['なし', 'あり']), key); assert.equal(rule.allowInvalid, false, key);
  }
  for (const key of DIVISION_ROWS) assert.equal(sheet.validations.get(at(key) + ':2'), undefined, key + ' は自由に書ける');
  for (const row of [2, 3, 4, 10, 11, 12]) assert.equal(sheet.validations.get(row + ':2'), undefined, '今ある行 B' + row + ' の選び欄は、足さない・触らない（元々なかった）');
});

test('申込の項目：「任意」なら学年・年齢・意気込みが空でも保存できて空のまま。「なし」なら、古いリンクが値を送ってきても保存しない（空にする）', () => {
  const h = harness(); h.ready(); h.call('openEntries');
  h.setSetting('学年', '任意'); h.setSetting('年齢', '任意'); h.setSetting('意気込み', '任意');
  assert.deepEqual([ping(h).grade, ping(h).age, ping(h).comment], ['optional', 'optional', 'optional']);
  assert.ok(h.call('saveEntry_', h.params('live', { name: '任意で空', grade: '', age: '', comment: '' })));
  assert.deepEqual(plain(h.rows(PRIVATE).at(-1)!.slice(5, 7)), ['', ''], '任意で空 → 空のまま保存');
  assert.equal(String(h.rows(PRIVATE).at(-1)![10]), '', '意気込みも空のまま');
  h.setSetting('学年', 'なし'); h.setSetting('年齢', 'なし'); h.setSetting('意気込み', 'なし');
  assert.ok(h.call('saveEntry_', h.params('live', { name: '古いリンク' })), '値つきで来ても受け付ける');
  const row = h.rows(PRIVATE).at(-1)!;
  assert.deepEqual(plain([row[5], row[6], row[10]]), ['', '', ''], '「なし」の大会では、送られてきた学年・年齢・意気込みを保存しない');
});

test('申込の項目：古いシートの「なし」「任意」は、開いても書き換えない。マスが空のときは、はじめの決まりの「必須」として読む', () => {
  const h = harness(); h.call('onOpen');
  h.setSetting('学年', 'なし'); h.setSetting('年齢', '任意'); h.setSetting('意気込み', '');
  h.call('onOpen');
  const cell = (label: string) => h.rows('設定').find((r) => r[0] === label)![1];
  assert.deepEqual([cell('学年'), cell('年齢'), cell('意気込み')], ['なし', '任意', ''], '足りない行を足す処理は、いまあるマスを書き換えない');
  h.fill(); h.call('setupTournament');
  const body = ping(h);
  assert.deepEqual([body.grade, body.age, body.comment], ['off', 'optional', 'required'], 'なし／任意はそのまま。空は必須');
});

test('階級: 区分の名前が、全角・半角・空白だけちがう2つの行は、同じ名前として止める', () => {
  const h = harness(); h.ready(ON);
  h.settingsSheet().rows.push(['階級：中学生\u3000男子', '-37', '']);
  assert.match(ping(h).settingsProblem, /同じ区分の名前が、2つあります/);
  const g = harness(); g.ready(ON); g.settingsSheet().rows.push(['階級：ＡＢＣ', '-37', '']); g.settingsSheet().rows.push(['階級：abc', '-40', '']);
  assert.match(ping(g).settingsProblem, /同じ区分の名前が、2つあります/);
});

test('申込の項目：学年・年齢・意気込みは、はじめから「必須」。入れないと保存せず、直す所の名前を言う。「なし」にすれば聞かない', () => {
  const h = harness(); h.call('onOpen');
  for (const label of ['学年', '年齢', '意気込み']) {
    const row = h.rows('設定').find((r) => r[0] === label)!;
    assert.equal(row[1], '必須', label + ' の初期値'); assert.match(row[2], /はじめは「必須」（選手に必ず書いてもらいます）/);
  }
  h.fill(); h.call('setupTournament');
  const body = ping(h);
  assert.deepEqual([body.grade, body.age, body.comment], ['required', 'required', 'required']);
  h.call('openEntries');
  const before = h.rows(PRIVATE).length;
  for (const [field, name] of [['grade', '学年'], ['age', '年齢'], ['comment', '意気込み']] as const) {
    const page = html(h, h.params('live', { [field]: '' }));
    assert.match(page, new RegExp('直す所：' + name), name + ' が空のときは、「' + name + '」と言って止まる');
    assert.equal(h.rows(PRIVATE).length, before, name + ' が空のときは、1行も保存しない');
  }
  const ok = h.call('saveEntry_', h.params('live', { name: '必須そろい' }));
  assert.ok(ok); assert.deepEqual(plain(h.rows(PRIVATE).at(-1)!.slice(5, 7)), ['中3', '20']);
  h.setSetting('学年', 'なし'); h.setSetting('年齢', 'なし'); h.setSetting('意気込み', 'なし');
  assert.deepEqual([ping(h).grade, ping(h).age, ping(h).comment], ['off', 'off', 'off']);
  assert.ok(h.call('saveEntry_', h.params('live', { name: '聞かない', grade: '', age: '', comment: '' })), '「なし」なら、空でも保存できる');
});
