import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, owner, script } from './helpers/gasV3Harness.ts';

/** 仕様どおりの8つの初期値。core/classRules.ts の DEFAULT_CLASS_SETTINGS と同じでなければならない。 */
const SPEC = {
  enabled: true,
  upper: { name: 'Aクラス', condition: '3勝以上（3勝以下でも、会長・指導者の許可があればAクラスに出られます）', rule: '首相撲5秒／蹴り足キャッチはワンアタック（キャッチ後に1回だけ攻撃できる）／ワンマッチは顔面への膝蹴り禁止' },
  lower: { name: 'Bクラス', condition: 'アマチュア。2勝以下（例：初出場、2勝1敗、1勝3敗）', rule: '首相撲なし／蹴り足キャッチなし／膝蹴りなし／回転技なし' },
  upperMinWins: 3,
};
let core: any = null;
try { core = await import('../core/classRules.ts'); } catch { core = null; }

const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', TEST_OS = 'テストOS取込用';
const ON = { クラス分け: 'あり' };
const CLASS_LABELS = ['クラス分け', '上のクラスの名前', '上のクラスの条件', '上のクラスのルール', '下のクラスの名前', '下のクラスの条件', '下のクラスのルール', '上のクラスにする勝ち数'];
const ping = (h: ReturnType<typeof harness>) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
const csvOf = (h: ReturnType<typeof harness>) => h.zips.at(-1).find((f: any) => f.name === 'players.csv').bytes.toString('utf8').replace(/^﻿/, '');
const parseCsv = (csv: string) => csv.split('\r\n').map((line) => line.slice(1, -1).split('","'));
/** 「クラスの欄がまだ無かった頃」の表を作る：見出しの右はし3マス（クラス・区分・階級）と、各行の右はし3マスを消す。 */
function makeOld(h: ReturnType<typeof harness>) {
  for (const [name, width] of [[PRIVATE, 21], [OS, 14], [TEST, 21], [TEST_OS, 14]] as const) for (const row of h.rows(name)) { assert.equal(row.length, width, name); row.length = width - 3; }
}

test('クラス: 初期値の8つは仕様どおり（会長が何も書かなくても、そのまま使える）', () => {
  const h = harness(); h.call('onOpen');
  const rows = h.rows('設定');
  const value = (label: string) => rows.find((r) => r[0] === label)![1];
  assert.deepEqual(CLASS_LABELS.map((l) => value(l)), ['なし', SPEC.upper.name, SPEC.upper.condition, SPEC.upper.rule, SPEC.lower.name, SPEC.lower.condition, SPEC.lower.rule, '3']);
  assert.deepEqual(rows.slice(1).map((r) => r[0]).slice(11, 19), CLASS_LABELS, '前の11行は動かない。クラスの8行は、そのまま');
  assert.deepEqual(rows.slice(1, 12).map((r) => r[0]), ['大会名', '開催日', '会場', '会場の地図URL', '主催者名', '問い合わせ先', '申込締切', '入場曲', '学年', '年齢', '意気込み']);
  for (const r of rows.slice(1)) assert.equal(r.length, 3, '項目・値・説明');
  // 各行の説明に、文字数や例が書いてある（会長が迷わない）
  assert.match(rows.find((r) => r[0] === 'クラス分け')![2], /あり／なし/);
  assert.match(rows.find((r) => r[0] === '上のクラスにする勝ち数')![2], /条件」の文も直してください/);
});

test('クラス: 初期値は core/classRules.ts の DEFAULT_CLASS_SETTINGS と同じ文字', { skip: core ? false : 'core/classRules.ts がまだ無い' }, () => {
  assert.deepEqual(core.DEFAULT_CLASS_SETTINGS, SPEC);
  const h = harness(); h.ready(ON);
  assert.deepEqual(ping(h).classes, core.DEFAULT_CLASS_SETTINGS);
});

test('クラス: 「クラス分け」は ▼ から あり／なし を選ぶ欄。ほかの文字は入れられない', () => {
  const h = harness(); h.call('onOpen');
  const i = h.rows('設定').findIndex((r) => r[0] === 'クラス分け');
  const rule = h.settingsSheet().validations.get((i + 1) + ':2');
  assert.equal(JSON.stringify(rule.list), JSON.stringify(['なし', 'あり']));
  assert.equal(rule.allowInvalid, false);
  assert.equal(h.settingsSheet().validations.get((i + 2) + ':2'), undefined, '名前・条件は自由に書ける');
});

test('クラス: 何もしない（なし）のとき、これまでと同じに動く。ping にクラスの印は出ず、新しい列は空', () => {
  const h = harness(); h.ready();
  assert.equal(h.rows('設定').find((r) => r[0] === 'クラス分け')![1], 'なし');
  const body = ping(h);
  assert.equal('classMode' in body, false); assert.equal('classes' in body, false);
  assert.deepEqual(Object.keys(body).sort(), ['accepting', 'age', 'app', 'build', 'comment', 'contact', 'date', 'deadline', 'eventId', 'grade', 'music', 'organizer', 'protocol', 'ready', 'settingsProblem', 'storageProblem', 'testComplete', 'title', 'venue', 'venueUrl']);
  assert.equal(h.rows(PRIVATE)[0].length, 21); assert.equal(h.rows(PRIVATE)[0][18], 'クラス'); assert.equal(h.rows(PRIVATE)[0][17], 'リクエストID');
  assert.equal(h.rows(OS)[0].length, 14); assert.equal(h.rows(OS)[0][11], 'クラス'); assert.equal(h.rows(OS)[0][10], '顔写真URL');
  assert.equal(h.rows(TEST)[1][18], ''); assert.equal(h.rows(TEST_OS)[1][11], '');
  assert.equal(h.call('statusInfo_').testComplete, true);
  h.call('exportTestTournament');
  const csv = parseCsv(csvOf(h));
  assert.equal(csv[0].length, 11); assert.equal(csv[0].at(-1), 'クラス'); assert.equal(csv[1].at(-1), '', 'クラスなしなら空のマス');
  assert.equal(csv[0][9], '入場曲URL（Apple Music推奨）');
});

test('クラス: 「あり」にすると、自動テストの1件が上のクラスで入り、ping が公開してよいクラスの内容を返す', () => {
  const h = harness(); h.ready(ON);
  assert.equal(h.rows(TEST)[1][18], 'Aクラス'); assert.equal(h.rows(TEST_OS)[1][11], 'Aクラス');
  assert.equal(h.rows(TEST)[0][18], 'クラス'); assert.equal(h.rows(TEST_OS)[0][11], 'クラス');
  assert.equal(h.call('statusInfo_').testComplete, true);
  const body = ping(h);
  assert.equal(body.classMode, true);
  assert.deepEqual(body.classes, SPEC);
  assert.equal(body.settingsProblem, '');
  // 公開してよいのは、選手に見える文だけ
  const out = JSON.stringify(body);
  for (const secret of [owner, 'selftest@example.invalid', 'test@example.com', '09000000000', 'テスト太郎', '自動テスト選手', h.props.get('spreadsheetId')!, h.props.get('photoFolderId')!, h.props.get('testFolderId')!]) assert.ok(!out.includes(secret), secret);
  assert.deepEqual(Object.keys(body.classes).sort(), ['enabled', 'lower', 'upper', 'upperMinWins']);
  assert.deepEqual(Object.keys(body.classes.upper).sort(), ['condition', 'name', 'rule']);
  assert.equal(body.classes.upperMinWins, 3); assert.equal(typeof body.classes.upperMinWins, 'number');
  // ほかのpingの項目は、これまでと同じ
  assert.deepEqual(Object.keys(body).sort(), ['accepting', 'age', 'app', 'build', 'classMode', 'classes', 'comment', 'contact', 'date', 'deadline', 'eventId', 'grade', 'music', 'organizer', 'protocol', 'ready', 'settingsProblem', 'storageProblem', 'testComplete', 'title', 'venue', 'venueUrl']);
});

test('クラス: 会長が名前・条件・ルール・勝ち数を変えると、pingにも新しい申込にもそのまま出る', () => {
  const h = harness(); h.ready(ON);
  h.setSetting('上のクラスの名前', 'Ａ級'); h.setSetting('下のクラスの名前', 'B級'); h.setSetting('上のクラスにする勝ち数', '５');
  h.setSetting('上のクラスの条件', '5勝以上'); h.setSetting('下のクラスの条件', '4勝以下'); h.setSetting('上のクラスのルール', '首相撲あり'); h.setSetting('下のクラスのルール', 'パンチのみ');
  const body = ping(h);
  assert.equal(body.settingsProblem, '');
  assert.deepEqual(body.classes, { enabled: true, upper: { name: 'Ａ級', condition: '5勝以上', rule: '首相撲あり' }, lower: { name: 'B級', condition: '4勝以下', rule: 'パンチのみ' }, upperMinWins: 5 }, '全角の５も数字として読む');
  h.call('saveEntry_', h.params('test', { fighterClass: 'upper' })); h.call('saveEntry_', h.params('test', { fighterClass: 'lower' }));
  assert.deepEqual(h.rows(TEST).slice(-2).map((r) => r[18]), ['Ａ級', 'B級']);
  assert.deepEqual(h.rows(TEST_OS).slice(-2).map((r) => r[11]), ['Ａ級', 'B級']);
});

test('クラス: 「あり」のときの申込。上／下を保存し、名前は設定タブのいまの名前になる', () => {
  const h = harness(); h.ready(ON);
  h.call('saveEntry_', h.params('test', { fighterClass: 'upper', name: '甲' }));
  h.call('saveEntry_', h.params('test', { fighterClass: 'lower', name: '乙' }));
  const priv = h.rows(TEST), os = h.rows(TEST_OS);
  assert.equal(priv.length, 4);
  assert.deepEqual(priv.slice(2).map((r) => [r[4], r[18]]), [['甲', 'Aクラス'], ['乙', 'Bクラス']]);
  assert.deepEqual(os.slice(2).map((r) => [r[2], r[11]]), [['甲', 'Aクラス'], ['乙', 'Bクラス']]);
  // 連絡先はOS側に出ない。クラスは出てよい
  assert.ok(!JSON.stringify(os).includes('テスト太郎'));
  assert.ok(JSON.stringify(os).includes('Bクラス'));
  // 受付番号・写真URLなど、ほかの列は動いていない
  assert.equal(priv[2][0], os[2][0]); assert.match(String(priv[2][12]), /drive\.google\.com\/file\/d\//); assert.equal(os[2][10], priv[2][12]);
  assert.equal(priv[2][17].length >= 32, true, 'リクエストIDは18列目のまま');
});

test('クラス: 本番の申込（②受付を開始のあと）にもクラスが入る', () => {
  const h = harness(); h.ready(ON); h.call('openEntries');
  h.call('saveEntry_', h.params('live', { fighterClass: 'lower' }));
  assert.equal(h.rows(PRIVATE)[1][18], 'Bクラス'); assert.equal(h.rows(OS)[1][11], 'Bクラス');
  assert.throws(() => h.call('saveEntry_', h.params('live', { fighterClass: '' })), /クラスが選ばれていません/);
  assert.equal(h.rows(PRIVATE).length, 2);
});

test('クラス: 選ばれていない・でたらめな値は、保存せずに日本語で止める（数式やラベルも通さない）', () => {
  const h = harness(); h.ready(ON);
  const before = JSON.stringify([h.rows(TEST), h.rows(TEST_OS), [...h.props.entries()].filter(([k]) => !k.startsWith('rate'))]), photos = h.resources.size;
  const bad: unknown[] = [undefined, '', ' ', 'middle', 'Aクラス', 'Bクラス', 'UPPER', 'upper ', '=HYPERLINK("http://x")', '+1', '@x', '<script>', ['upper'], ['lower', 'upper'], 0, null, { toString: () => 'upper' }];
  for (const value of bad) {
    const params: any = h.params('test'); if (value !== undefined) params.fighterClass = value;
    assert.throws(() => h.call('saveEntry_', params), /クラスが選ばれていません。申込ページを開き直して、AクラスかBクラスを選んでから送ってください/, JSON.stringify(value));
  }
  assert.equal(h.resources.size, photos, '写真も作らない');
  assert.equal(JSON.stringify([h.rows(TEST), h.rows(TEST_OS), [...h.props.entries()].filter(([k]) => !k.startsWith('rate'))]), before, '表も設定も1文字も変わらない');
  assert.ok(!JSON.stringify(h.rows(TEST)).includes('HYPERLINK'));
  const err = (() => { try { h.call('saveEntry_', h.params('test', { fighterClass: 'x' })); } catch (e: any) { return e; } })();
  assert.equal(err.code, 'class'); assert.equal(err.retryable, false);
});

test('クラス: エラー文は、いまのクラス名を使う（名前を変えたら文も変わる）', () => {
  const h = harness(); h.ready(ON); h.setSetting('上のクラスの名前', '上級'); h.setSetting('下のクラスの名前', '初級');
  assert.throws(() => h.call('saveEntry_', h.params('test')), /上級か初級を選んで/);
});

test('クラス: 送られたラベル文字は保存しない。印(upper/lower)から、設定タブの名前だけを保存する', () => {
  const h = harness(); h.ready(ON);
  h.call('saveEntry_', h.params('test', { fighterClass: 'upper', comment: 'Zクラス' }));
  const row = h.rows(TEST).at(-1)!;
  assert.equal(row[18], 'Aクラス');
  assert.ok(!script.includes('p.fighterClass,40') && !script.includes("clean_(p.fighterClass"), '送られた値を直接保存するコードがない');
});

test('クラス: 同じ申込番号の再送は1件のまま。同じクラスなら同じ受付番号、ちがうクラスなら止まる', () => {
  const h = harness(); h.ready(ON);
  const p = h.params('test', { fighterClass: 'upper' });
  const a = h.call('saveEntry_', p), b = h.call('saveEntry_', { ...p });
  assert.equal(a, b); assert.equal(h.rows(TEST).length, 3); assert.equal(h.rows(TEST_OS).length, 3);
  assert.throws(() => h.call('saveEntry_', { ...p, fighterClass: 'lower' }), /送信後に入力内容が変わっています/);
  assert.equal(h.rows(TEST).length, 3); assert.equal(h.rows(TEST).at(-1)![18], 'Aクラス', '最初のクラスのまま');
  assert.equal(h.rows(TEST_OS).at(-1)![11], 'Aクラス');
  assert.throws(() => h.call('saveEntry_', { ...p, fighterClass: '' }), /クラスが選ばれていません/);
});

test('クラス: 本番でも、ちがうクラスでの再送は止まる（別の人の枠を上書きしない）', () => {
  const h = harness(); h.ready(ON); h.call('openEntries');
  const p = h.params('live', { fighterClass: 'lower' });
  h.call('saveEntry_', p);
  assert.throws(() => h.call('saveEntry_', { ...p, fighterClass: 'upper' }), /送信後に入力内容が変わっています/);
  assert.equal(h.rows(PRIVATE).length, 2);
  assert.equal(h.call('saveEntry_', { ...p }), h.rows(PRIVATE)[1][0]);
});

test('クラス: 「なし」のときは、送られたクラスの値を無視する（保存せず、エラーにもしない）', () => {
  const h = harness(); h.ready();
  for (const value of ['upper', 'lower', 'middle', '=HYPERLINK("x")', '', ['upper'], 'Aクラス']) h.call('saveEntry_', h.params('test', { fighterClass: value as any }));
  assert.equal(h.rows(TEST).length, 2 + 7);
  for (const row of h.rows(TEST).slice(1)) assert.equal(row[18], '');
  for (const row of h.rows(TEST_OS).slice(1)) assert.equal(row[11], '');
  assert.ok(!JSON.stringify(h.rows(TEST)).includes('HYPERLINK'));
  // 同じ申込番号の再送も、クラスを送り直しても変わらない
  const p = h.params('test', { fighterClass: 'upper' }); const a = h.call('saveEntry_', p);
  assert.equal(h.call('saveEntry_', { ...p, fighterClass: 'lower' }), a);
});

test('クラス: 「あり」を「なし」に戻したあとの再送は、保存ずみの申込として同じ受付番号を返す（「変わっています」と言わない・2行目を作らない）', () => {
  const h = harness(); h.ready(ON);
  const p = h.params('test', { fighterClass: 'upper' }); const a = h.call('saveEntry_', p);
  h.setSetting('クラス分け', 'なし');
  assert.equal(h.call('saveEntry_', p), a);
  assert.equal(h.rows(TEST).length, 3); assert.equal(h.rows(TEST).at(-1)![18], 'Aクラス', '保存したクラスはそのまま');
});

test('クラス: 設定の間違い（クラス分け＝あり）は、直す場所つきで止まる', () => {
  const run = (over: Record<string, string>) => { const h = harness(); h.call('onOpen'); h.fill({ ...ON, ...over }); return h; };
  const cases: [Record<string, string>, RegExp][] = [
    [{ 上のクラスの名前: '' }, /「設定」タブの、次の欄を入れてください：上のクラスの名前/],
    [{ 下のクラスの名前: '  ' }, /次の欄を入れてください：下のクラスの名前/],
    [{ 上のクラスの条件: '' }, /次の欄を入れてください：上のクラスの条件/],
    [{ 下のクラスの条件: '' }, /次の欄を入れてください：下のクラスの条件/],
    [{ 上のクラスのルール: '' }, /次の欄を入れてください：上のクラスのルール/],
    [{ 下のクラスのルール: '' }, /次の欄を入れてください：下のクラスのルール/],
    [{ 下のクラスの名前: 'Aクラス' }, /「上のクラスの名前」と「下のクラスの名前」は、ちがう名前にしてください/],
    [{ 下のクラスの名前: ' ａクラス ' }, /ちがう名前にしてください/],
    [{ 上のクラスにする勝ち数: '0' }, /「上のクラスにする勝ち数」は、1から99の数字で入れてください（例：3）/],
    [{ 上のクラスにする勝ち数: '100' }, /1から99/],
    [{ 上のクラスにする勝ち数: 'abc' }, /1から99/],
    [{ 上のクラスにする勝ち数: '' }, /1から99/],
    [{ 上のクラスにする勝ち数: '3.5' }, /1から99/],
    [{ 上のクラスにする勝ち数: '-3' }, /1から99/],
    [{ 上のクラスにする勝ち数: '三' }, /1から99/],
    [{ 上のクラスの名前: '=x' }, /「上のクラスの名前」は、「=」「\+」「-」「@」で始めないでください/],
    [{ 下のクラスの名前: '+x' }, /「下のクラスの名前」は、「=」「\+」「-」「@」で始めないでください/],
    [{ 下のクラスの名前: '-x' }, /「下のクラスの名前」は、.*始めないで/],
    [{ 上のクラスの名前: '@x' }, /「上のクラスの名前」は、.*始めないで/],
    [{ 上のクラスの名前: 'あ'.repeat(13) }, /「上のクラスの名前」は12文字までにしてください/],
    [{ 下のクラスの名前: 'あ'.repeat(13) }, /「下のクラスの名前」は12文字までにしてください/],
    [{ 上のクラスの条件: 'あ'.repeat(61) }, /「上のクラスの条件」は60文字までにしてください/],
    [{ 下のクラスの条件: 'あ'.repeat(61) }, /「下のクラスの条件」は60文字までにしてください/],
    [{ 上のクラスのルール: 'あ'.repeat(81) }, /「上のクラスのルール」は80文字までにしてください/],
    [{ 下のクラスのルール: 'あ'.repeat(81) }, /「下のクラスのルール」は80文字までにしてください/],
    [{ クラス分け: '多い' }, /「クラス分け」は、あり／なし/],
  ];
  for (const [over, message] of cases) {
    const h = run(over);
    assert.throws(() => h.call('setupTournament'), message, JSON.stringify(over));
    assert.throws(() => h.call('setupTournament'), /^Error: シートの「設定」タブを直してください。/, '直す場所を最初に言う: ' + JSON.stringify(over));
    assert.equal(h.props.get('eventId'), undefined, '直すまで何も作らない');
  }
  // 境界ちょうどは通る
  const edge = harness(); edge.call('onOpen'); edge.fill({ ...ON, 上のクラスの名前: 'あ'.repeat(12), 下のクラスの名前: 'い'.repeat(12), 上のクラスの条件: 'あ'.repeat(60), 下のクラスの条件: 'い'.repeat(60), 上のクラスのルール: 'あ'.repeat(80), 下のクラスのルール: 'い'.repeat(80), 上のクラスにする勝ち数: '99' });
  edge.call('setupTournament'); assert.equal(ping(edge).settingsProblem, '');
  assert.equal(ping(edge).classes.upperMinWins, 99);
});

test('クラス: 欠けている欄は、まとめて全部言う', () => {
  const h = harness(); h.call('onOpen'); h.fill({ ...ON, 上のクラスの名前: '', 下のクラスの名前: '', 上のクラスの条件: '', 下のクラスのルール: '' });
  assert.throws(() => h.call('setupTournament'), /次の欄を入れてください：上のクラスの名前、下のクラスの名前、上のクラスの条件、下のクラスのルール/);
});

test('クラス: 「なし」や空のときは、クラスの欄に何が入っていても止めない', () => {
  for (const mode of ['なし', '']) {
    const h = harness(); h.call('onOpen');
    h.fill({ クラス分け: mode, 上のクラスの名前: '', 下のクラスの名前: '', 上のクラスの条件: 'あ'.repeat(99), 下のクラスの条件: '', 上のクラスのルール: 'あ'.repeat(99), 下のクラスのルール: '', 上のクラスにする勝ち数: 'abc' });
    h.call('setupTournament');
    const body = ping(h);
    assert.equal(body.settingsProblem, '', 'mode=' + mode);
    assert.equal('classes' in body, false);
    assert.equal(h.call('statusInfo_').testComplete, true);
    h.call('saveEntry_', h.params('test', { fighterClass: 'upper' }));
    assert.equal(h.rows(TEST).at(-1)![18], '');
  }
  const h = harness(); h.call('onOpen'); h.fill({ 上のクラスの名前: '=x', 上のクラスにする勝ち数: '0' }); h.call('setupTournament');
  assert.equal(ping(h).settingsProblem, '', '初期値の「なし」のまま');
});

test('クラス: 受付開始のあとでクラスの欄が壊れたら、pingは直す所を知らせ、クラスの中身は返さず、受付も始められない', () => {
  const h = harness(); h.ready(ON);
  h.setSetting('下のクラスの名前', 'Aクラス');
  const body = ping(h);
  assert.match(body.settingsProblem, /ちがう名前/);
  assert.equal('classes' in body, false); assert.equal('classMode' in body, false); assert.equal(body.title, undefined);
  assert.throws(() => h.call('openEntries'), /ちがう名前/);
  h.setSetting('下のクラスの名前', 'Bクラス');
  assert.equal(ping(h).classMode, true);
});

test('クラス: 古い設定タブ（11行だけ）でも動く。クラスの欄は空＝「なし」と読む', () => {
  for (const maxRows of [1000, 12]) {
    const h = harness(); h.ready();
    h.settingsSheet().rows.length = 12; h.settingsSheet().maxRows = maxRows;
    assert.equal(h.rows('設定').length, 12);
    const body = ping(h);
    assert.equal(body.settingsProblem, ''); assert.equal(body.title, 'テスト大会');
    assert.equal('classMode' in body, false); assert.equal('classes' in body, false);
    assert.equal(h.call('statusInfo_').testComplete, true);
    const rows = h.rows(TEST).length;
    h.call('saveEntry_', h.params('test', { fighterClass: 'upper' }));
    assert.equal(h.rows(TEST).length, rows + 1);
    assert.equal(h.rows(TEST).at(-1)![18], '', 'クラスは無視して保存する');
    assert.equal(h.rows(TEST_OS).at(-1)![11], '');
    const before = JSON.stringify(h.rows('設定'));
    h.call('setupTournament');
    assert.equal(JSON.stringify(h.rows('設定').slice(0, 12)), before, '古い設定タブの12行は1マスも書き換えない');
    assert.equal(h.rows('設定').length, 35, 'クラスの8行と、階級分け・ロゴの9行と、花道の追加情報の1行と、誓約書の4行と、花道のルールの1行だけが、いちばん下に足される');
    assert.deepEqual(h.rows('設定').slice(12, 20).map((r) => r[0]), CLASS_LABELS);
    assert.deepEqual(h.rows('設定').slice(20).map((r) => r[0]), ['階級分け', 'ロゴ', '階級：小学生以下', '階級：中学生女子', '階級：中学生男子', '階級：高校生・一般女子', '階級：高校生・一般男子', '階級：花道・女子（40歳以上）', '階級：花道・男子（40歳以上）', '花道の追加情報', '誓約書', '保護者の同意', 'ジム責任者の同意', '誓約書の文の確認', '花道のルール']);
    assert.equal(h.rows('設定').find((r) => r[0] === 'クラス分け')![1], 'なし', '足した行の初期値は「なし」');
  }
});

test('クラス: getMaxRows が無い環境でも設定を読める', () => {
  const h = harness(); h.ready(); delete h.settingsSheet().getMaxRows;
  assert.equal(ping(h).title, 'テスト大会');
});

test('クラス: 設定タブが半分だけ新しい（途中で切れた）シートでも、足りない行は空として読む', () => {
  const h = harness(); h.ready(ON);
  h.settingsSheet().rows.length = 14; // クラス分け〜上のクラスの条件 まで
  const body = ping(h);
  assert.match(body.settingsProblem, /次の欄を入れてください：下のクラスの名前、上のクラスの条件、下のクラスの条件、上のクラスのルール、下のクラスのルール/);
});

test('クラス: 古い見出しの表（クラス列なし）は、最初のpingで自分で直る。既存のマスは1つも変わらない', () => {
  const h = harness(); h.ready();
  h.call('saveEntry_', h.params('test', { name: '昔の選手' }));
  h.call('openEntries'); h.call('saveEntry_', h.params('live', { name: '昔の本番' }));
  makeOld(h);
  const before = JSON.stringify([PRIVATE, OS, TEST, TEST_OS].map((n) => h.rows(n)));
  const protections = [PRIVATE, OS, TEST, TEST_OS].map((n) => h.book.getSheetByName(n).protections.length);
  const info = h.call('statusInfo_');
  assert.equal(info.testComplete, true, '自動テストの確認も通る');
  for (const [name, width] of [[PRIVATE, 21], [OS, 14], [TEST, 21], [TEST_OS, 14]] as const) {
    const rows = h.rows(name);
    assert.equal(rows[0].length, width, name); assert.deepEqual(rows[0].slice(width - 3), ['クラス', '区分', '階級'], name);
    assert.deepEqual(rows[0].slice(0, width - 3), JSON.parse(before)[[PRIVATE, OS, TEST, TEST_OS].indexOf(name)][0], name + ' の古い見出しはそのまま');
    for (const row of rows.slice(1)) assert.ok(row.length <= width - 3 || row.slice(width - 3).every((cell: string) => cell === ''), '古い行にはクラス・区分・階級を足さない: ' + name);
  }
  const after = JSON.parse(JSON.stringify([PRIVATE, OS, TEST, TEST_OS].map((n) => h.rows(n))));
  JSON.parse(before).forEach((table: any[][], t: number) => table.forEach((row, r) => row.forEach((cell, c) => assert.equal(after[t][r][c], cell, t + ':' + r + ':' + c))));
  assert.ok(h.book.getSheetByName(PRIVATE).protections.length >= protections[0], '見出しの保護は消えない');
  assert.deepEqual([PRIVATE, OS, TEST, TEST_OS].map((n) => h.book.getSheetByName(n).protections.length), protections.map((n) => n + 1), '新しい見出しのマス（右はし3つ）にも警告つき保護');
  // 2回目は何も増えない
  h.call('statusInfo_');
  assert.deepEqual([PRIVATE, OS, TEST, TEST_OS].map((n) => h.book.getSheetByName(n).protections.length), protections.map((n) => n + 1));
  // 直ったあとは新しい申込が入る
  h.call('saveEntry_', h.params('live', { name: '新しい選手' }));
  assert.equal(h.rows(PRIVATE).at(-1)![4], '新しい選手');
});

test('クラス: 古い見出しの表で「① 最初の設定」を押しても、見出しだけ直る。データは消えない', () => {
  const h = harness(); h.ready(); h.call('saveEntry_', h.params('test', { name: '昔の選手' }));
  makeOld(h);
  const names = h.rows(TEST).map((r) => r[4]);
  h.call('setupTournament');
  assert.equal(h.rows(TEST)[0][18], 'クラス'); assert.equal(h.rows(TEST_OS)[0][11], 'クラス'); assert.equal(h.rows(PRIVATE)[0][18], 'クラス'); assert.equal(h.rows(OS)[0][11], 'クラス');
  assert.deepEqual(h.rows(TEST).map((r) => r[4]), names);
  assert.equal(h.call('statusInfo_').testComplete, true);
});

test('クラス: 古い見出しの表で、先に「なし」→ そのまま受付できる（最初の申込で自分で直る）', () => {
  const h = harness(); h.ready(); h.call('openEntries'); makeOld(h);
  h.call('saveEntry_', h.params('live', { name: '直後の選手' }));
  assert.equal(h.rows(PRIVATE)[0][18], 'クラス');
  assert.equal(h.rows(PRIVATE).at(-1)![4], '直後の選手'); assert.equal(h.rows(OS).at(-1)![2], '直後の選手');
});

test('クラス: 古い表で retry（同じ申込番号）しても、クラス欄が空なら「なし」の再送として通る', () => {
  const h = harness(); h.ready(); const p = h.params('test'); const a = h.call('saveEntry_', p);
  makeOld(h);
  assert.equal(h.call('saveEntry_', p), a);
  assert.equal(h.rows(TEST).length, 3);
});

test('クラス: 見出しがほかの形で変えられていたら、直さずに止まる', () => {
  const tamper: [string, (h: ReturnType<typeof harness>) => void][] = [
    ['古い形＋別の見出し', (h) => { makeOld(h); h.rows(TEST)[0][3] = '所属'; }],
    ['新しい列に別の文字', (h) => { h.rows(TEST)[0][18] = 'クラスX'; }],
    ['新しい列に文字があるが、前が欠けている', (h) => { makeOld(h); h.rows(PRIVATE)[0][18] = 'メモ'; }],
    ['OS側が違う', (h) => { h.rows(OS)[0][11] = 'ランク'; }],
    ['OS側の古い形＋ずれ', (h) => { makeOld(h); h.rows(OS)[0][0] = '番号'; }],
    ['列が余分', (h) => { makeOld(h); h.rows(TEST_OS)[0][11] = 'メモ'; }],
  ];
  // 新しい文は、タブの名前と、最初に違うマス（列の文字＋1）を言う
  const tamperTab: Record<string, string> = { '古い形＋別の見出し': TEST, '新しい列に別の文字': TEST, '新しい列に文字があるが、前が欠けている': PRIVATE, 'OS側が違う': OS, 'OS側の古い形＋ずれ': OS, '列が余分': TEST_OS };
  const tamperCell: Record<string, string> = { '古い形＋別の見出し': 'D1', '新しい列に別の文字': 'S1', '新しい列に文字があるが、前が欠けている': 'S1', 'OS側が違う': 'L1', 'OS側の古い形＋ずれ': 'A1', '列が余分': 'L1' };
  for (const [label, fn] of tamper) {
    const h = harness(); h.ready(); fn(h);
    const snapshot = JSON.stringify(h.rows(PRIVATE).concat(h.rows(OS), h.rows(TEST), h.rows(TEST_OS)));
    const where = new RegExp('「' + tamperTab[label] + '」タブの(?:' + tamperCell[label] + 'が|1行目に、列が足されています（' + tamperCell[label] + '）)');
    assert.throws(() => h.call('statusInfo_'), where, label);
    assert.throws(() => h.call('saveEntry_', h.params('test')), where, label);
    assert.throws(() => h.call('setupTournament'), where, label);
    assert.throws(() => h.call('setupTournament'), /「① 最初の設定」を押/, label + ': 直したあとにすることを言う');
    assert.equal(JSON.stringify(h.rows(PRIVATE).concat(h.rows(OS), h.rows(TEST), h.rows(TEST_OS))), snapshot, label + ': 何も書き換えない');
  }
});

test('クラス: 新しい空のシートは、これまでどおり全部の見出しと保護ができる', () => {
  const h = harness(); h.ready();
  assert.deepEqual(h.rows(PRIVATE)[0], ['受付番号', '申込日時', '大会ID', '所属ジム', '選手名', '学年', '年齢', '身長', '体重', '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）', '顔写真URL', '連絡先氏名', '連絡先電話番号', '連絡先メールアドレス', '同意', 'リクエストID', 'クラス', '区分', '階級']);
  assert.deepEqual(h.rows(OS)[0], ['管理番号', 'ジム名', '選手名', '学年', '年齢', '身長', '体重', '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）', '顔写真URL', 'クラス', '区分', '階級']);
  for (const n of [PRIVATE, OS, TEST, TEST_OS]) { const p = h.book.getSheetByName(n).protections; assert.equal(p.length, 1); assert.equal(p[0].n, 1); assert.equal(p[0].m, n === PRIVATE || n === TEST ? 21 : 14); }
});

test('クラス: 名簿ZIPの players.csv は、最後の列が「クラス」。写真と連絡先は今までどおり', () => {
  const h = harness(); h.ready(ON); h.call('openEntries');
  h.call('saveEntry_', h.params('live', { name: '甲', fighterClass: 'upper' }));
  h.call('saveEntry_', h.params('live', { name: '乙', fighterClass: 'lower' }));
  h.call('exportTournament');
  const csv = csvOf(h), table = parseCsv(csv);
  assert.deepEqual(table[0], ['管理番号', 'ジム名', '選手名', '学年', '年齢', '身長', '体重', '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）', 'クラス']);
  assert.equal(table.length, 3);
  assert.deepEqual(table.slice(1).map((r) => [r[2], r[10]]), [['甲', 'Aクラス'], ['乙', 'Bクラス']]);
  assert.ok(!csv.includes('drive.google.com'), '写真URLはCSVに入れない');
  for (const secret of ['テスト太郎', 'test@example.com', '09000000000', owner]) assert.ok(!csv.includes(secret), secret);
  const files = h.zips.at(-1).map((f: any) => f.name);
  assert.deepEqual(files.filter((n: string) => n.startsWith('photos/')).length, 2); assert.equal(files[0], 'players.csv');
  assert.ok(files.slice(1).every((n: string) => /^photos\/.+\.jpg$/.test(n)));
});

test('クラス: テストの書き出しにもクラスが入る（上のクラスの自動テスト）', () => {
  const h = harness(); h.ready(ON);
  h.call('exportTestTournament');
  const table = parseCsv(csvOf(h));
  assert.equal(table[0].at(-1), 'クラス'); assert.equal(table[1].at(-1), 'Aクラス'); assert.equal(table[1][2], '自動テスト選手');
  assert.equal(table[0].length, 11);
  const files = h.zips.at(-1).map((f: any) => f.name); assert.equal(files.length, 2);
});

test('クラス: 古いOS表（12列になる前）の書き出しは、これまでと同じ10列', () => {
  const h = harness(); h.ready(); h.call('openEntries'); h.call('saveEntry_', h.params('live'));
  // 見出しの更新をさせず、関数を直接呼んで「12列目が無い表」を再現する
  const rows = h.rows(OS).map((r) => r.slice(0, 11));
  const folder = h.resources.get(h.props.get('photoFolderId')!);
  h.call('exportRows_', rows, folder, 'Tournament_OS_');
  const table = parseCsv(csvOf(h));
  assert.equal(table[0].length, 10); assert.equal(table[0].at(-1), '入場曲URL（Apple Music推奨）');
});

test('クラス: 書き出しでは、クラス名が数式になる文字でも無害化される（=は先頭に付かない設定チェックと二重で守る）', () => {
  const h = harness(); h.ready(ON);
  assert.equal(h.api.clean_('=HYPERLINK("x")', 40), "'=HYPERLINK(\"x\")");
  assert.equal(h.api.clean_('Aクラス', 40), 'Aクラス');
});

test('クラス: 「もう一度送る」の画面にも fighterClass が入っていて、クラスを失わない', () => {
  const h = harness(); h.ready(ON);
  const p = h.params('test', { fighterClass: 'lower' });
  const html = String(h.call('resultPage_', '', '保存を確認できませんでした', { retryable: true }, p).html);
  assert.ok(html.includes('name="fighterClass" value="lower"'), html.slice(0, 400));
  assert.ok(html.includes('同じ申込を確認・再開する'));
  // 成功画面にはフォームが無い
  assert.ok(!String(h.call('resultPage_', 'R-1', '', null, p).html).includes('fighterClass'));
  // 選ばれていない（送り忘れ）エラーは、やり直し不可＝フォームを出さない（古い申込ページから同じ失敗を繰り返さない）
  const noClass = String(h.call('doPost', { parameter: { ...h.params('test'), fighterClass: '' } }).html);
  assert.ok(noClass.includes('クラスが選ばれていません'));
  assert.ok(!noClass.includes('同じ申込を確認・再開する'));
});

test('クラス: 古い申込ページ（クラスを送らない）から「あり」の表へ送ると、何も保存せず日本語で止める', () => {
  const h = harness(); h.ready(ON); const rows = h.rows(TEST).length;
  const old: any = h.params('test'); delete old.fighterClass;
  const html = String(h.call('doPost', { parameter: old }).html);
  assert.match(html, /クラスが選ばれていません/);
  assert.equal(h.rows(TEST).length, rows);
});

test('クラス: 新しい版にすると、古い版で済ませた自動テストはやり直しになる（1回だけ）', () => {
  const h = harness(); h.ready(ON);
  assert.match(script, /const RECEPTION_BUILD = '3\.20261026\.3';/);
  assert.equal(ping(h).build, '3.20261026.3');
  h.props.set('lastTestBuild', '3.20261004.4');
  assert.equal(h.call('statusInfo_').testComplete, false);
  assert.throws(() => h.call('openEntries'), /先にテスト申込1件/);
  const rows = h.rows(TEST).length;
  h.call('setupTournament');
  assert.equal(h.call('statusInfo_').testComplete, true);
  assert.equal(h.rows(TEST).length, rows + 1);
  assert.equal(h.rows(TEST).at(-1)![18], 'Aクラス');
  h.call('setupTournament'); assert.equal(h.rows(TEST).length, rows + 1, 'もう増えない');
});

test('クラス: 古い版で作った表（クラス列なし・古い自動テスト）が、新しいコードで①を押すと全部そろう', () => {
  const h = harness(); h.ready();
  makeOld(h); h.props.set('lastTestBuild', '3.20261004.4'); h.settingsSheet().rows.length = 12;
  h.call('setupTournament');
  const body = ping(h);
  assert.equal(body.testComplete, true); assert.equal(body.build, '3.20261026.3'); assert.equal('classMode' in body, false);
  assert.equal(h.rows(TEST)[0][18], 'クラス'); assert.equal(h.rows(TEST_OS)[0][11], 'クラス');
  assert.equal(h.rows(TEST).at(-1)![18], '');
  h.call('openEntries'); h.call('saveEntry_', h.params('live'));
  assert.equal(h.rows(PRIVATE).length, 2);
});

test('クラス: 受付番号やリクエストIDなど、既存の探し方(18列目/1列目)は動いていない', () => {
  const h = harness(); h.ready(ON);
  const p = h.params('test', { fighterClass: 'upper' }); const receipt = h.call('saveEntry_', p);
  const row = h.rows(TEST).at(-1)!;
  assert.equal(row[17], p.requestId); assert.equal(row[0], receipt); assert.equal(h.rows(TEST_OS).at(-1)![0], receipt);
  assert.equal(h.call('findRow_', h.book.getSheetByName(TEST), 18, p.requestId), 3);
});

test('クラス: ログや画面にクラスの送信値を出さない（console/Logger/alert）', () => {
  assert.ok(!/(Logger\.log|console\.error)\([^)]*fighterClass/.test(script));
  const h = harness(); h.ready(ON);
  try { h.call('saveEntry_', h.params('test', { fighterClass: 'SECRET_CLASS_VALUE' })); } catch (e: any) { assert.ok(!String(e.message).includes('SECRET_CLASS_VALUE')); }
  assert.ok(!h.logs.join('\n').includes('SECRET_CLASS_VALUE'));
  const page = String(h.call('doPost', { parameter: h.params('test', { fighterClass: 'SECRET_CLASS_VALUE' }) }).html);
  assert.ok(!page.includes('SECRET_CLASS_VALUE'), '失敗画面にも送られた値をそのまま映さない');
});

test('クラス: 禁止語（鍵・署名など）が増えていない', () => {
  for (const word of ['setupKey', 'entryKey:', 'testKey', 'TOS2', 'computeHmac', 'verifyConnection', 'expectedOwner', 'policy_', "['大会ID'"]) assert.ok(!script.includes(word), word);
});
