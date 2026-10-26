// くわしい戦績（Googleの受付）。古い入力の動き・キック／他の格闘技／タイトルの行・決まりに合わない入力・同じ受付番号の再送・名簿ZIPの records.csv・core/recordDetail.ts と同じ答え。
// 架空の名前・架空の数字だけを使う。core/recordDetail.ts は正本で、ここでは読むだけ。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { harness } from './helpers/gasV3Harness.ts';
import { kickRecordText, parseRecordDetail, parseRecordDetailCsv, recordDetailProblems, recordDetailRows, RECORD_DETAIL_HEADERS } from '../core/recordDetail.ts';
import { recordDetailsFromCsv } from '../app/private/logic.ts';

/** ① が作る「見るだけ」のタブ（マッチメイク表・戦績（選手名つき）。3.20261026.3 から）。受付が書くタブの数を見る試験では、数えない（専用の試験は gasViews.test.ts） */
const VIEW_TABS = ['マッチメイク表', '戦績（選手名つき）'];
const dataTabs = (h: any): string[] => [...h.book.sheets.keys()].filter((name: string) => !VIEW_TABS.includes(name));


type H = ReturnType<typeof harness>;
const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', TEST_OS = 'テストOS取込用';
const REC = '戦績詳細', REC_TEST = 'テスト戦績詳細';
const HEAD = [...RECORD_DETAIL_HEADERS];
const json = (value: unknown): any => JSON.parse(JSON.stringify(value));
const thrown = (fn: () => unknown): any => { try { fn(); } catch (e) { return e; } assert.fail('投げなかった'); };
const tabs = (h: H) => dataTabs(h);
const rowsOf = (h: H, name: string): any[][] => h.book.getSheetByName(name).rows;
const rowOf = (h: H, name: string, receipt: string): any => rowsOf(h, name).find((r: any[]) => r[0] === receipt);
/** 表に見えている文字（getDisplayValues）。見出しの12列ぶん */
const shown = (h: H, name: string): string[][] => { const s = h.book.getSheetByName(name); return s.getRange(1, 1, s.rows.length, 12).getDisplayValues(); };
/** 架空の戦績：キック4戦3勝1敗・他の格闘技1つ（1勝・勝敗なし1）・タイトル1つ */
const detail = (over: Record<string, unknown> = {}): any => ({ v: 1, kick: { games: 4, win: 3, loss: 1, draw: 0 }, others: [{ sport: 'ムエタイ', games: 2, win: 1, loss: 0, draw: 0, noResult: 1 }], titles: [{ event: '架空カップ', year: 2025, class: '-70kg', result: '優勝' }], ...over });
/** 送る文（文字のままのものは、そのまま。ほかは JSON にする） */
const text = (value: unknown): string => typeof value === 'string' ? value : JSON.stringify(value);
/** 申し込み。recordDetail を入れる。record はわざと別の文にしておく（キックの1行にそろうかを見るため） */
const form = (h: H, mode: 'test' | 'live', value: unknown, over: Record<string, string> = {}): any => h.params(mode, { recordDetail: text(value), record: '適当な文', ...over });
const live = (): H => { const h = harness(); h.ready(); h.call('openEntries'); return h; };
/** 表と鍵の中身を、まとめて写す（何も書かれていないことを見るため） */
const snap = (h: H): string => JSON.stringify({ sheets: [...h.book.sheets.entries()].map(([name, s]: any) => [name, s.rows]), props: [...h.props.entries()], files: h.resources.size });
const unescapeHtml = (s: string): string => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/* ───────── 古い入力・表の用意 ───────── */

test('古い入力（くわしい戦績なし）: 戦績詳細の表を作らず、申込原本・OS取込用に、今までと同じ1行ずつ。テストも同じ', () => {
  const h = harness(); h.ready();
  // 古いシート（この版より前に作った姿）：戦績詳細の2つの表は無い
  h.book.sheets.delete(REC); h.book.sheets.delete(REC_TEST);
  h.call('openEntries');
  const receipt = h.call('saveEntry_', h.params('live'));
  assert.equal(h.book.getSheetByName(REC), null); assert.equal(h.book.getSheetByName(REC_TEST), null, '表を作らない');
  assert.equal(rowsOf(h, PRIVATE).length, 2); assert.equal(rowsOf(h, PRIVATE)[1].length, 21); assert.equal(rowsOf(h, PRIVATE)[1][0], receipt);
  assert.equal(rowsOf(h, PRIVATE)[1][9], '初試合', '戦績は送られたとおり');
  assert.equal(rowsOf(h, OS).length, 2); assert.equal(rowsOf(h, OS)[1].length, 14);
  const testReceipt = h.call('saveEntry_', h.params('test'));
  assert.equal(h.book.getSheetByName(REC_TEST), null, 'テストでも表を作らない');
  assert.equal(rowOf(h, TEST, testReceipt)[9], '初試合');
  assert.equal(rowsOf(h, TEST).length, 3, '自動テストの1件＋今回の1件');
});

test('くわしい戦績が空・空白だけのときは、古い申込と同じ（断らず、戦績詳細には書かない）', () => {
  for (const value of ['', '   ', '\n']) {
    const h = live();
    const receipt = h.call('saveEntry_', h.params('live', { recordDetail: value }));
    assert.equal(rowsOf(h, PRIVATE)[1][0], receipt, JSON.stringify(value));
    assert.deepEqual(json(rowsOf(h, REC)), [HEAD], JSON.stringify(value) + '：見出しだけ');
  }
});

test('① 最初の設定: 「戦績詳細」「テスト戦績詳細」を見出しつきで作る。見出しは core と同じ順・保護つき。必須の表（tables_）には入れない。もう一度押しても変えない', () => {
  const h = harness(); h.ready();
  assert.deepEqual(tabs(h), ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS, REC, REC_TEST]);
  for (const name of [REC, REC_TEST]) {
    const sheet = h.book.getSheetByName(name);
    assert.deepEqual(json(sheet.rows), [HEAD], name + ' は見出しだけ');
    assert.equal(sheet.protections.length, 1, name + ' の見出しは保護'); assert.equal(sheet.protections[0].prot.warningOnly, true);
    assert.equal(sheet.formats.get('2:1'), '@', name + ' の中は文字の形');
  }
  assert.deepEqual(json(h.call('tables_').map((pair: any[]) => pair[0])), [PRIVATE, OS, TEST, TEST_OS], '必須の表の一覧は、これまでと同じ');
  const before = JSON.stringify(rowsOf(h, REC));
  h.call('setupTournament'); h.call('onOpen');
  assert.equal(JSON.stringify(rowsOf(h, REC)), before, '2回目で中身は変わらない');
  assert.equal(h.book.getSheetByName(REC).protections.length, 1, '2回目で保護を重ねない');
});

test('戦績詳細の表がまだ無いときは、くわしい戦績つきの申込が、見出しつきで表を作る（本番もテストも）', () => {
  const h = live();
  h.book.sheets.delete(REC); h.book.sheets.delete(REC_TEST);
  const receipt = h.call('saveEntry_', form(h, 'live', detail()));
  assert.deepEqual(json(rowsOf(h, REC)[0]), HEAD);
  assert.equal(rowsOf(h, REC).length, 4, '見出し＋キック・他の格闘技・タイトル');
  h.call('saveEntry_', form(h, 'test', detail()));
  assert.equal(rowsOf(h, REC_TEST).length, 4);
  assert.ok(rowOf(h, PRIVATE, receipt));
});

/* ───────── 正しい入力の行 ───────── */

test('正しいくわしい戦績（テスト申込）: テスト戦績詳細に、キック1行・他の格闘技1行・タイトル1行（見出しの順）。申込の戦績はキックの1行', () => {
  const h = harness(); h.ready();
  const receipt = h.call('saveEntry_', form(h, 'test', detail()));
  // 申込日時は、表に見えている文字（表示の値）で書く（花道の表と同じ）
  const when = String(rowOf(h, TEST, receipt)[1]);
  // 表に見える文字で比べる（「-70kg」は、既存の表と同じく、先頭に守りの「'」が付いて保存される）
  assert.deepEqual(shown(h, REC_TEST), [
    HEAD,
    [receipt, when, 'キック', 'キックボクシング', '4', '3', '1', '0', '', '', '', ''],
    [receipt, when, '他の格闘技', 'ムエタイ', '2', '1', '0', '0', '1', '', '', ''],
    [receipt, when, 'タイトル・入賞', '架空カップ', '', '', '', '', '', '2025', '-70kg', '優勝'],
  ]);
  assert.equal(rowsOf(h, REC).length, 1, '本番の表は、テストでは書かない');
  assert.equal(rowOf(h, TEST, receipt)[9], '4戦3勝1敗', '送られた「適当な文」ではなく、キックの1行（○戦○勝○敗。2026-10-24 owner）');
  assert.equal(rowOf(h, TEST_OS, receipt)[7], '4戦3勝1敗', 'OS取込用の戦績も同じ（名簿ZIP・準備の画面・A3にも、この形で出る）');
});

test('正しいくわしい戦績（本番）: 戦績詳細に書く。キックは未経験なら「初試合」、前の版の引き分けつきは「4戦2勝1敗1分」。キックの行は必ず1行', () => {
  const h = live();
  const none = h.call('saveEntry_', form(h, 'live', { v: 1, kick: { games: 0, win: 0, loss: 0, draw: 0 }, others: [], titles: [] }));
  const drawn = h.call('saveEntry_', form(h, 'live', detail({ kick: { games: 4, win: 2, loss: 1, draw: 1 }, others: [], titles: [] })));
  assert.equal(rowOf(h, PRIVATE, none)[9], '初試合');
  assert.equal(rowOf(h, PRIVATE, drawn)[9], '4戦2勝1敗1分');
  assert.deepEqual(json(rowsOf(h, REC).slice(1)), [
    [none, String(rowOf(h, PRIVATE, none)[1]), 'キック', 'キックボクシング', '0', '0', '0', '0', '', '', '', ''],
    [drawn, String(rowOf(h, PRIVATE, drawn)[1]), 'キック', 'キックボクシング', '4', '2', '1', '1', '', '', '', ''],
  ]);
  assert.equal(rowsOf(h, REC_TEST).length, 1, 'テストの表は、本番では書かない');
});

test('上限ちょうど（他の格闘技5件・タイトル5件）は通る。行は 1＋5＋5 行', () => {
  const h = live();
  const others = Array.from({ length: 5 }, (_, i) => ({ sport: '架空競技' + (i + 1), games: 1, win: 1, loss: 0, draw: 0, noResult: 0 }));
  const titles = Array.from({ length: 5 }, (_, i) => ({ event: '架空大会' + (i + 1), year: 2000 + i, class: '-60kg', result: '準優勝' }));
  const receipt = h.call('saveEntry_', form(h, 'live', detail({ kick: { games: 1, win: 1, loss: 0, draw: 0 }, others, titles })));
  assert.equal(rowsOf(h, REC).filter((r: any[]) => r[0] === receipt).length, 11);
});

/* ───────── 決まりに合わない入力は、断られ、何も書かれない ───────── */

test('決まりに合わないくわしい戦績は断られ、何も書かれない（キックの合計・件数・年・文字数・JSON）', () => {
  const bad: [string, unknown][] = [
    ['キックの勝ち負けの合計が試合数と違う', detail({ kick: { games: 4, win: 3, loss: 0, draw: 0 } })],
    ['未経験なのに勝ちがある', detail({ kick: { games: 0, win: 1, loss: 0, draw: 0 } })],
    ['キックの試合数が999をこえる', detail({ kick: { games: 1000, win: 1000, loss: 0, draw: 0 } })],
    ['キックの試合数が負の数', detail({ kick: { games: -1, win: 0, loss: 0, draw: 0 } })],
    ['キックの試合数が文字（"3"）', detail({ kick: { games: '3', win: 3, loss: 0, draw: 0 } })],
    ['キックの欄が無い', { v: 1, others: [], titles: [] }],
    ['他の格闘技が6件', detail({ others: Array.from({ length: 6 }, () => ({ sport: '架空競技', games: 1, win: 1, loss: 0, draw: 0, noResult: 0 })) })],
    ['他の競技名が空白だけ', detail({ others: [{ sport: '   ', games: 1, win: 1, loss: 0, draw: 0, noResult: 0 }] })],
    ['他の競技名が21字', detail({ others: [{ sport: 'あ'.repeat(21), games: 1, win: 1, loss: 0, draw: 0, noResult: 0 }] })],
    ['他の格闘技の試合数が0', detail({ others: [{ sport: '架空競技', games: 0, win: 0, loss: 0, draw: 0, noResult: 0 }] })],
    ['他の格闘技の合計が試合数と違う', detail({ others: [{ sport: '架空競技', games: 3, win: 2, loss: 0, draw: 0, noResult: 0 }] })],
    ['獲得年が1899', detail({ titles: [{ event: '架空', year: 1899, class: '-60kg', result: '優勝' }] })],
    ['獲得年が2101', detail({ titles: [{ event: '架空', year: 2101, class: '-60kg', result: '優勝' }] })],
    ['獲得年が文字（"2025"）', detail({ titles: [{ event: '架空', year: '2025', class: '-60kg', result: '優勝' }] })],
    ['タイトルが6件', detail({ titles: Array.from({ length: 6 }, () => ({ event: '架空', year: 2025, class: '-60kg', result: '優勝' })) })],
    ['大会名が61字', detail({ titles: [{ event: 'あ'.repeat(61), year: 2025, class: '-60kg', result: '優勝' }] })],
    ['階級が31字', detail({ titles: [{ event: '架空', year: 2025, class: 'あ'.repeat(31), result: '優勝' }] })],
    ['入賞成績が空', detail({ titles: [{ event: '架空', year: 2025, class: '-60kg', result: '' }] })],
    ['版が2', detail({ v: 2 })],
    ['JSON が壊れている', '{"v":1,"kick":{'],
    ['JSON ではない文', 'キック3勝'],
    ['JSON が配列', '[]'],
    ['JSON が null', 'null'],
    ['長すぎる（20000字をこえる）', '{"v":1,' + ' '.repeat(20000) + '}'],
  ];
  for (const [label, value] of bad) {
    const h = live();
    const before = snap(h);
    const error = thrown(() => h.call('saveEntry_', form(h, 'live', value)));
    assert.equal(error.code, 'input', label);
    assert.equal(error.retryable, false, label);
    assert.match(error.message, /くわしい戦績/, label);
    assert.equal(snap(h), before, label + '：何も書かれない');
    // 画面に返すときも、「送れませんでした」（申込ページにもどって直す）と同じ形
    const page = String(h.call('doPost', { parameter: form(h, 'live', value) }).html);
    assert.match(page, /送れませんでした/, label);
    assert.equal(snap(h), before, label + '：画面の経路でも何も書かれない');
  }
});

test('戦績詳細の見出しがちがうときは、何も書かずに止まる（headers）。ふつうの申込（くわしい戦績なし）は、今までどおり通る', () => {
  const h = live();
  rowsOf(h, REC)[0][3] = '競技名';
  const before = snap(h);
  const error = thrown(() => h.call('saveEntry_', form(h, 'live', detail())));
  assert.equal(error.code, 'headers');
  assert.match(error.message, /「戦績詳細」タブのD1が「競技名」になっています。「競技名・大会名」に直してください/);
  assert.equal(snap(h), before, '何も書かれない');
  assert.ok(h.call('saveEntry_', h.params('live')), 'くわしい戦績なしは通る');
  // ①は止めない。注意を出す（完了の文のあとに、直し方を言う）
  h.call('menuSetup');
  assert.match(h.toasts[h.toasts.length - 1], /「戦績詳細」タブの見出しが、この版と違います/);
});

/* ───────── 同じ受付番号・再送 ───────── */

test('同じ受付番号を2回送っても、戦績詳細・申込原本・OS取込用の行は増えない', () => {
  const h = live();
  const rid = randomUUID();
  const send = () => h.call('doPost', { parameter: h.params('live', { requestId: rid, recordDetail: text(detail()), record: '適当な文' }) });
  assert.match(String(send().html), /申し込みが完了しました/);
  assert.equal(rowsOf(h, REC).length, 4);
  assert.match(String(send().html), /申し込みが完了しました/, '2回目も、同じ受付番号で完了になる');
  assert.equal(rowsOf(h, REC).length, 4, '戦績詳細は増えない（見出し＋3行）');
  assert.equal(rowsOf(h, PRIVATE).length, 2);
  assert.equal(rowsOf(h, OS).length, 2);
});

test('前の送信が戦績詳細の書き込みの前で止まったときは、同じ申込の再送で、足りなかった戦績詳細の行だけを書く（行は増えない）', () => {
  const h = live();
  const rid = randomUUID();
  const send = () => h.call('saveEntry_', h.params('live', { requestId: rid, recordDetail: text(detail()), record: '適当な文' }));
  const receipt = send();
  // 途中で止まった姿：申込原本・OS取込用の行はあり、戦績詳細の行だけが無い
  rowsOf(h, REC).splice(1);
  assert.equal(rowsOf(h, REC).length, 1);
  assert.equal(send(), receipt, '同じ受付番号で完了');
  assert.equal(rowsOf(h, REC).length, 4, '足りなかった3行が書かれる');
  assert.equal(rowsOf(h, PRIVATE).length, 2, '申込原本は増えない');
  assert.equal(send(), receipt);
  assert.equal(rowsOf(h, REC).length, 4, 'もう一度送っても増えない');
});

test('再送の画面: くわしい戦績が送られたときだけ、recordDetail を隠し欄に入れる（長い文も入る）。なしのときは、この欄は出ない', () => {
  const h = live();
  const big = detail({
    others: Array.from({ length: 5 }, (_, i) => ({ sport: 'やや長い競技名その' + (i + 1), games: 1, win: 1, loss: 0, draw: 0, noResult: 0 })),
    titles: Array.from({ length: 5 }, (_, i) => ({ event: 'とても長い大会名です。大会その' + (i + 1) + '。', year: 2020 + i, class: '-60kg', result: '優勝' })),
  });
  const value = text(big);
  assert.ok(value.length > 500, '500字をこえる（送り直しの上限を確かめる）');
  const withDetail = String(h.call('resultPage_', '', '保存を確認できませんでした', { retryable: true }, h.params('live', { recordDetail: value, record: '3勝1敗' })).html);
  const fields = [...withDetail.matchAll(/<input type="hidden" name="recordDetail" value="([^"]*)">/g)];
  assert.equal(fields.length, 1);
  assert.equal(unescapeHtml(fields[0][1]), value, '送り直す文は、そのまま');
  const without = String(h.call('resultPage_', '', '保存を確認できませんでした', { retryable: true }, h.params('live')).html);
  assert.equal(without.includes('name="recordDetail"'), false, 'なしのときは出ない');
  assert.match(without, /同じ申込を確認・再開する/, '再送のボタンは、今までどおり出る');
});

/* ───────── 名簿ZIP（records.csv） ───────── */

test('名簿ZIP: 戦績詳細に行があるときだけ records.csv を付ける（players.csv のあと。BOM・見出し・引用つき。個人情報は入れない）', () => {
  const h = live();
  h.call('saveEntry_', h.params('live'));
  h.call('exportTournament');
  const names = () => json(h.zips.at(-1).map((f: any) => f.name)).filter((n: string) => !n.startsWith('photos/'));
  assert.deepEqual(names(), ['players.csv'], '表はあるが行が無い：付けない');
  h.book.sheets.delete(REC);
  h.call('exportTournament');
  assert.deepEqual(names(), ['players.csv'], '表が無い：付けない');
  h.call('saveEntry_', form(h, 'live', detail({ others: [{ sport: 'ムエ,"タイ"', games: 2, win: 1, loss: 0, draw: 0, noResult: 1 }] })));
  h.call('exportTournament');
  assert.deepEqual(names(), ['players.csv', 'records.csv'], '行がある：付く（players.csv のすぐあと）');
  assert.deepEqual(json(h.zips.at(-1).map((f: any) => f.name)).slice(0, 2), ['players.csv', 'records.csv']);
  const csv = h.zips.at(-1).find((f: any) => f.name === 'records.csv').bytes.toString('utf8');
  assert.equal(csv.charCodeAt(0), 0xfeff, 'BOMつき（players.csv と同じ）');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 4, '見出し＋キック・他の格闘技・タイトル');
  assert.equal(lines[0], HEAD.map((cell) => '"' + cell + '"').join(','), '見出しつき（引用つき）');
  assert.ok(lines[2].includes(',"ムエ,""タイ""",'), '「,」と「"」は引用の決まりで書く');
  assert.ok(!csv.includes('09000000000') && !csv.includes('test@example.com'), '連絡先は入れない');
});

test('つなぎ目: 受付が書き出した records.csv を、準備の画面の読み込みに、そのまま通す。= + - @ で始まる文字（守りの \' つき）も、元の戦績に戻る（階級「-60kg」など）', () => {
  const h = live();
  const original = detail({
    others: [{ sport: '-柔道', games: 2, win: 1, loss: 1, draw: 0, noResult: 0 }, { sport: '+空手', games: 1, win: 0, loss: 1, draw: 0, noResult: 0 }],
    titles: [{ event: '=架空カップ', year: 2025, class: '-60kg', result: '@優勝' }, { event: '架空,"大会"', year: 2024, class: '+80kg', result: '3位' }],
  });
  const receipt = h.call('saveEntry_', form(h, 'live', original));
  h.call('exportTournament');
  const bytes = h.zips.at(-1).find((f: any) => f.name === 'records.csv').bytes;
  const csv = bytes.toString('utf8');
  // 受付のシートの上では、数式にならないよう「'」が付く（見える表でも、書き出しでも）
  assert.ok(csv.includes('"\'-60kg"') && csv.includes('"\'-柔道"') && csv.includes('"\'@優勝"'), '書き出しには、守りの \' が付いている');
  const wanted = { v: 1, kick: original.kick, others: original.others, titles: original.titles };
  const core = parseRecordDetailCsv(csv.replace(/^\uFEFF/, ''));
  assert.ok(core.ok);
  assert.deepEqual(json(core.ok ? core.byReceipt.get(receipt) : null), json(wanted), 'core の読み込み：守りの \' を外して、元に戻る');
  const screen = recordDetailsFromCsv(new Uint8Array(bytes));
  assert.deepEqual(json(screen.get(receipt)), json(wanted), '準備の画面の読み込みも、同じ（1字増えて決まりに落ちて、その人の戦績が黙って消えることもない）');
  // 字数がちょうど上限（階級30字・競技名20字）で、- で始まっても、読める
  const edge = live();
  const edgeReceipt = edge.call('saveEntry_', form(edge, 'live', detail({ others: [{ sport: '-' + 'あ'.repeat(19), games: 1, win: 1, loss: 0, draw: 0, noResult: 0 }], titles: [{ event: '架空', year: 2025, class: '-' + 'ク'.repeat(29), result: '優勝' }] })));
  edge.call('exportTournament');
  const edgeBytes = edge.zips.at(-1).find((f: any) => f.name === 'records.csv').bytes;
  assert.ok(recordDetailsFromCsv(new Uint8Array(edgeBytes)).has(edgeReceipt), '上限ちょうどの文字が - で始まっても、その受付の戦績が付く');
});

test('名簿ZIP: 戦績詳細の見出しがちがうのに行があるときは、ZIPを作らずに止める。テストのZIPには records.csv を付けない', () => {
  const h = live();
  h.call('saveEntry_', form(h, 'live', detail()));
  rowsOf(h, REC)[0][0] = 'ちがう';
  const error = thrown(() => h.call('exportTournament'));
  assert.match(error.message, /「戦績詳細」タブの1行目（見出し）が、この版と違う/);
  assert.equal(h.zips.length, 0, 'ZIPは作っていない');
  const t = harness(); t.ready(); t.call('openEntries');
  const testReceipt = t.call('saveEntry_', form(t, 'test', detail()));
  assert.ok(testReceipt);
  t.call('exportTestTournament');
  assert.deepEqual(json(t.zips.at(-1).map((f: any) => f.name)).filter((n: string) => !n.startsWith('photos/')), ['players.csv']);
});

/* ───────── 見直し（2026-10-24）で直した所：行の数・pingでの見出しの点検 ───────── */

test('行が足りない表（新しい表は1000行）でも、書く前に行を足す：申込原本・OS取込用・戦績詳細。受付番号が出ないまま止まらない（本物のシートは、行の外へ書くと止まる）', () => {
  const h = live();
  const full = (name: string) => { const s = h.book.getSheetByName(name); s.maxRows = s.rows.length; };   // 書ける行が、もう無い
  for (const name of [PRIVATE, OS, REC]) full(name);
  const receipt = h.call('saveEntry_', form(h, 'live', detail()));
  assert.ok(/^[A-Z0-9]+-[0-9A-F]{20}$/.test(receipt), '受付番号が出る');
  assert.equal(rowsOf(h, PRIVATE).length, 2); assert.equal(rowsOf(h, OS).length, 2); assert.equal(rowsOf(h, REC).length, 4, '見出し＋キック・他の格闘技・タイトル');
  for (const name of [PRIVATE, OS, REC]) assert.ok(h.book.getSheetByName(name).maxRows >= h.book.getSheetByName(name).rows.length, name + '：行の数が、書いた行に足りている');
  // 同じ申込の再送は、行を増やさない（足りていれば、足さない）
  const before = [PRIVATE, OS, REC].map((name) => h.book.getSheetByName(name).maxRows);
  assert.equal(h.call('saveEntry_', form(h, 'live', detail(), { requestId: rowOf(h, PRIVATE, receipt)[17] })), receipt);
  assert.deepEqual([PRIVATE, OS, REC].map((name) => h.book.getSheetByName(name).maxRows), before);
  // 1回に11行（他の格闘技5＋タイトル5＋キック1）書くときも、足りるまで足す
  const many = live();
  many.book.getSheetByName(REC).maxRows = 2;
  const big = detail({ others: Array.from({ length: 5 }, (_, i) => ({ sport: '競技' + i, games: 2, win: 1, loss: 1, draw: 0, noResult: 0 })), titles: Array.from({ length: 5 }, (_, i) => ({ event: '架空' + i, year: 2020 + i, class: '-60kg', result: '優勝' })) });
  many.call('saveEntry_', form(many, 'live', big));
  assert.equal(rowsOf(many, REC).length, 12); assert.ok(many.book.getSheetByName(REC).maxRows >= 12);
});

test('ping: 「戦績詳細」「テスト戦績詳細」の見出しが崩れたら、直すタブ・マス・あるべき文字を言う（新しいリンクの申込は、すべて断られるので）。直せば、元どおり。表が無い・空のときは、問題にしない', () => {
  const ping = (h: H) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
  const h = live();
  assert.equal(ping(h).ready, true); assert.equal(ping(h).error, undefined, 'ふつうは、何も言わない');
  rowsOf(h, REC)[0][3] = 'ちがう';
  const body = ping(h);
  assert.equal(body.ready, false); assert.equal(body.error, 'headers'); assert.equal(body.errorTab, REC); assert.equal(body.errorCell, 'D1'); assert.equal(body.errorExpected, RECORD_DETAIL_HEADERS[3]);
  assert.ok(!JSON.stringify(body).includes('架空') && !JSON.stringify(body).includes('@'), '申込の中身・連絡先は入れない');
  rowsOf(h, REC)[0][3] = RECORD_DETAIL_HEADERS[3];
  assert.equal(ping(h).ready, true, '直せば、元どおり');
  rowsOf(h, REC_TEST)[0][0] = 'ちがう';
  assert.equal(ping(h).errorTab, REC_TEST, 'テストの表も同じ'); assert.equal(ping(h).errorCell, 'A1');
  rowsOf(h, REC_TEST)[0][0] = RECORD_DETAIL_HEADERS[0];
  // 表が無い（古いシート・消した）・空のときは、問題にしない（受付が作る）
  h.book.sheets.delete(REC); h.book.sheets.delete(REC_TEST);
  assert.equal(ping(h).ready, true, '表が無い');
  // 見出しが崩れていても、新しいリンクでない申込（くわしい戦績なし）は、これまでどおり受けられる
  const g = live(); rowsOf(g, REC)[0][3] = 'ちがう';
  assert.ok(g.call('saveEntry_', g.params('live')), 'くわしい戦績なしの申込は、通る');
  // ⑤の状態の表示（showStatus）にも、同じ直す所を出す
  g.call('showStatus'); assert.ok(g.alerts.some((text: string) => text.includes('戦績詳細') && text.includes('D1')), '⑤にも出る');
});

/* ───────── .gs と core/recordDetail.ts が同じ答え ───────── */

test('.gs の判定・読み方・言い方・行は、core/recordDetail.ts と同じ答えになる（例で比べる）', () => {
  const h = harness();
  const texts: string[] = [
    text(detail()),
    text({ v: 1, kick: { games: 0, win: 0, loss: 0, draw: 0 }, others: [], titles: [] }),
    text(detail({ kick: { games: 999, win: 999, loss: 0, draw: 0 } })),
    text(detail({ kick: { games: 1000, win: 1000, loss: 0, draw: 0 } })),
    text(detail({ kick: { games: 4, win: 3, loss: 0, draw: 0 } })),
    text(detail({ kick: { games: 0, win: 1, loss: 0, draw: 0 } })),
    text(detail({ kick: { games: '3', win: 3, loss: 0, draw: 0 } })),
    text(detail({ others: [{ sport: 'あ'.repeat(20), games: 1, win: 1, loss: 0, draw: 0, noResult: 0 }] })),
    text(detail({ others: [{ sport: 'あ'.repeat(21), games: 1, win: 1, loss: 0, draw: 0, noResult: 0 }] })),
    text(detail({ others: [{ sport: ' 架空競技 ', games: 2, win: 1, loss: 0, draw: 0, noResult: 1 }] })),
    text(detail({ others: [{ sport: '架空競技', games: 2, win: 1, loss: 0, draw: 0, noResult: 0 }] })),
    text(detail({ others: Array.from({ length: 6 }, () => ({ sport: '架空競技', games: 1, win: 1, loss: 0, draw: 0, noResult: 0 })) })),
    text(detail({ titles: [{ event: 'あ'.repeat(60), year: 1900, class: 'ク', result: '優勝' }] })),
    text(detail({ titles: [{ event: '架空', year: 2100, class: '-60kg', result: '優勝' }] })),
    text(detail({ titles: [{ event: '架空', year: 2101, class: '-60kg', result: '優勝' }] })),
    text(detail({ titles: [{ event: ' 架空 ', year: 2025, class: ' -60kg ', result: ' 優勝 ' }] })),
    text(detail({ titles: [{ event: '架空', year: '2025', class: '-60kg', result: '優勝' }] })),
    text(detail({ v: 2 })),
    '{"v":1,', '', '   ', 'null', '[]', '"文字"', '123',
    '{"v":1,"kick":{"games":4,"win":3,"loss":1,"draw":0},"others":[],"titles":[],"extra":"x"}',
    '{"v":1.0,"kick":{"games":4.0,"win":3.0,"loss":1,"draw":0},"others":[],"titles":[]}',
    '{"v":1,"kick":{"games":4,"win":3,"loss":1,"draw":0},"others":[],"titles":[],"titles":[]}',
    '{"v":1,"kick":{"games":-0,"win":0,"loss":0,"draw":0},"others":[],"titles":[]}',
    '{"v":1,"kick":{"games":1e1,"win":10,"loss":0,"draw":0},"others":[],"titles":[]}',
    '{"v":1,"kick":{"games":4,"win":3,"loss":1,"draw":0},"others":[],"titles":[]} ',
  ];
  for (const t of texts) {
    const core = parseRecordDetail(t);
    const gs = h.call('recordDetailParse_', t);
    assert.equal(gs === null, core === null, '読めるか・読めないかが同じ：' + t.slice(0, 50));
    if (core) assert.equal(JSON.stringify(gs), JSON.stringify(core), '読んだ中身が同じ：' + t.slice(0, 50));
  }
  const objects: any[] = [
    { v: 1, kick: { games: 0, win: 0, loss: 0, draw: 0 }, others: [], titles: [] },
    detail({ kick: { games: 4, win: 3, loss: 0, draw: 0 } }),
    detail({ kick: { games: 0, win: 0, loss: 0, draw: 1 } }),
    detail({ kick: { games: 2, win: 1, loss: 0, draw: 0, extra: 1 } }),
    detail({ others: [{ sport: '', games: 0, win: 0, loss: 0, draw: 0, noResult: 0 }] }),
    detail({ titles: [{ event: '架空', year: 2025.5, class: '-60kg', result: '優勝' }] }),
    detail({ titles: [null] }),
    null, 'text', 5,
  ];
  for (const d of objects) {
    const core = recordDetailProblems(d);
    const gs = h.call('recordDetailProblems_', d);
    assert.deepEqual(json(gs), json(core), '決まりの言い方（問題の文）が同じ：' + JSON.stringify(d)?.slice(0, 60));
  }
  for (const kick of [{ games: 0, win: 0, loss: 0, draw: 0 }, { games: 4, win: 3, loss: 1, draw: 0 }, { games: 4, win: 2, loss: 1, draw: 1 }, { games: 999, win: 999, loss: 0, draw: 0 }]) {
    assert.equal(h.call('recordDetailKickText_', kick), kickRecordText(kick), JSON.stringify(kick));
  }
  assert.deepEqual(json(h.call('recordDetailRows_', 'TEST-RECEIPT', '2026/10/24 12:00', detail())), json(recordDetailRows('TEST-RECEIPT', '2026/10/24 12:00', detail())), '表の行が同じ');
  assert.deepEqual(json(vm.runInContext('RECORD_DETAIL_HEADERS', h.api)), HEAD, '見出しが同じ');
});

test('全角の数字: .gs は、JSON の数字のところの全角を半角にして読む（画面は半角で送るので、ふつうは起きない）。文字の中の全角は、そのまま', () => {
  const h = harness();
  const wide = '{"v":1,"kick":{"games":４,"win":３,"loss":１,"draw":０},"others":[],"titles":[{"event":"第１回架空カップ","year":２０２５,"class":"-60kg","result":"優勝"}]}';
  assert.deepEqual(json(h.call('recordDetailParse_', wide)), { v: 1, kick: { games: 4, win: 3, loss: 1, draw: 0 }, others: [], titles: [{ event: '第１回架空カップ', year: 2025, class: '-60kg', result: '優勝' }] });
  // core は、これを JSON として読めないので null（この差は、画面が半角で送るため、ふつうは起きない）
  assert.equal(parseRecordDetail(wide), null);
});
