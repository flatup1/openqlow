import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/gasV3Harness.ts';

/**
 * v3 の受付プログラム（public/templates/Tournament_OS_Google受付_v3.gs）の「失敗を入れた」試験（R6c）。
 * tests/gasReception.test.ts は、リリースから外した古い受付用なので、v3 のものは ここにある。
 * 見るもの：ロックが取れない／保存の途中で失敗する／再送（同じ申込番号）で回復する。仕様（保存の順番・再送）は、ここでは変えない。
 * 失敗のまねは、ハーネス（tests/helpers/gasV3Harness.ts）の lock と、シート・フォルダの関数を一時的に差しかえて作る（かならず元にもどす）。
 */

type H = ReturnType<typeof harness>;
const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', TEST_OS = 'テストOS取込用';
const html = (h: H, params: any): string => String(h.call('doPost', { parameter: params }).html);
/** 保存の「いまの形」：表の行・名簿の行・写真の数・スクリプトのプロパティ。失敗したときに「何も書いていない」ことを、まとめて比べる */
const shot = (h: H) => JSON.stringify({ priv: h.rows(PRIVATE), test: h.rows(TEST), os: h.rows(OS), testOs: h.rows(TEST_OS), photos: photos(h, 'testFolderId') + '/' + photos(h, 'photoFolderId'), props: [...h.props.entries()] });
const photos = (h: H, key: string): number => h.resources.get(h.props.get(key)!)!.children.filter((c: any) => c.kind === 'file').length;
const thrown = (fn: () => unknown): any => { try { fn(); } catch (error) { return error; } assert.fail('投げるはずが、投げなかった'); };
/** シートの appendRow を、一度だけ失敗させる。戻り値の restore で元にもどす */
function breakAppend(sheet: any, message = 'Google側の一時的なエラー（模擬）') {
  const original = sheet.appendRow; sheet.appendRow = () => { throw new Error(message); };
  return () => { sheet.appendRow = original; };
}
const countRows = (h: H, sheet: string, column: number, value: string) => h.rows(sheet).filter((r, i) => i > 0 && r[column] === value).length;

/* ───────── ロックが取れない ───────── */

test('v3 失敗: ロックが取れないとき、25秒待ってあきらめ、何も書かない。選手には「確認が必要」（黄）と再送ボタンを出す。取れるようになれば、同じ申込番号でそのまま保存できる', () => {
  const h = harness(); h.ready();
  const p = h.params('test');
  const before = shot(h), acquired = h.lock.acquired, released = h.lock.released;
  h.lock.free = false;
  const error = thrown(() => h.call('saveEntry_', p));
  assert.equal(error.code, 'busy'); assert.equal(error.retryable, true); assert.match(error.message, /受付が混み合っています/);
  assert.equal(h.lock.lastWaitMs, 25000, 'ロックは25秒まで待つ');
  assert.equal(h.lock.acquired, acquired, 'ロックは取れていない');
  assert.equal(h.lock.released, released, '取れていないロックを、手放さない');
  assert.equal(shot(h), before, '何も書いていない（表・名簿・写真・カウンタ）');
  // 選手の画面：送れなかったと言い切らず（保存されていないとは限らない言い方）、同じ内容で送り直すボタンを出す。受付番号は出さない
  const page = html(h, p);
  assert.match(page, /保存結果の確認が必要です/); assert.match(page, /受付が混み合っています/); assert.match(page, /同じ申込を確認・再開する/);
  assert.doesNotMatch(page, /申し込みが完了しました/); assert.doesNotMatch(page, /受付番号：|TEST-/);
  assert.equal(shot(h), before, '画面を作っただけでは、何も書かない');
  // 取れるようになった：同じ申込番号（requestId）のまま保存できる。1件だけ。もう一度送っても、増えない
  h.lock.free = true;
  const receipt = h.call('saveEntry_', p);
  assert.match(receipt, /^TEST-/); assert.equal(h.rows(TEST).length, 3, '自動テスト1件＋この1件');
  assert.equal(h.call('saveEntry_', p), receipt); assert.equal(h.rows(TEST).length, 3);
  assert.equal(h.lock.acquired, h.lock.released, '取ったロックは、全部手放した');
});

test('v3 失敗: ロックが取れないのは、本番（live）の受付中でも同じ。表も名簿も写真も増えず、受付番号は出ない', () => {
  const h = harness(); h.ready(); h.call('openEntries');
  const p = h.params('live'); const before = shot(h);
  h.lock.free = false;
  assert.equal(thrown(() => h.call('saveEntry_', p)).code, 'busy');
  assert.equal(shot(h), before);
  assert.doesNotMatch(html(h, p), /受付番号：/);
  h.lock.free = true;
  h.call('saveEntry_', p);
  assert.equal(h.rows(PRIVATE).length, 2); assert.equal(h.rows(OS).length, 2);
});

test('v3 失敗: 入力がまちがっている申込は、ロックを取りにも行かない（待たされる人を増やさない）', () => {
  const h = harness(); h.ready();
  const tries = h.lock.tries;
  const wrong: Array<Record<string, string>> = [{ height: 'abc' }, { contactPhone: '123' }, { contactEmail: 'dummy' }, { consent: 'no' }, { website: 'spam' }, { eventId: 'other-cup' }];
  for (const over of wrong) assert.throws(() => h.call('saveEntry_', h.params('test', over)), JSON.stringify(over));
  assert.equal(h.lock.tries, tries, 'ロックを一度も取ろうとしていない');
});

/* ───────── 保存の途中で失敗する ───────── */

test('v3 失敗: 保存の途中で失敗しても、ロックは必ず手放す（次の人が25秒待たされない）。すぐ次の申込が通る', () => {
  const h = harness(); h.ready();
  const restore = breakAppend(h.book.getSheetByName(TEST_OS), 'quota');
  const acquired = h.lock.acquired, released = h.lock.released;
  assert.throws(() => h.call('saveEntry_', h.params('test')), /quota/);
  assert.equal(h.lock.acquired, acquired + 1); assert.equal(h.lock.released, released + 1, '失敗しても手放した');
  restore();
  h.call('saveEntry_', h.params('test'));
  assert.equal(h.lock.acquired, h.lock.released);
});

test('v3 失敗: 申込原本に書いたあと、名簿（OS取込用）に書く所で失敗 → 画面は「確認が必要」＋再送ボタン。同じ申込番号で送り直すと、名簿の1行だけが足され、行・写真は増えない', () => {
  const h = harness(); h.ready();
  const p = h.params('test'); const rows = h.rows(TEST).length, osRows = h.rows(TEST_OS).length, files = photos(h, 'testFolderId');
  const restore = breakAppend(h.book.getSheetByName(TEST_OS));
  const page = html(h, p);
  assert.match(page, /保存結果の確認が必要です/); assert.match(page, /Googleへの保存を最後まで確認できませんでした/); assert.match(page, /同じ申込を確認・再開する/);
  assert.doesNotMatch(page, /申し込みが完了しました/); assert.doesNotMatch(page, /テスト受付番号：/, '受付番号は出さない（保存を確認できていない）');
  // 書けた所と、書けていない所（このとき、表にだけ行がある）
  assert.equal(h.rows(TEST).length, rows + 1, '申込原本の行は、もうある'); assert.equal(h.rows(TEST_OS).length, osRows, '名簿の行は、まだ無い'); assert.equal(photos(h, 'testFolderId'), files + 1, '写真は、もう保存ずみ');
  const receipt = String(h.rows(TEST).at(-1)![0]);
  restore();
  // 再送：同じ申込番号（requestId）。同じ受付番号が返り、足りなかった名簿の行だけが足される
  assert.equal(h.call('saveEntry_', p), receipt);
  assert.equal(h.rows(TEST).length, rows + 1, '申込原本は、二重にならない'); assert.equal(h.rows(TEST_OS).length, osRows + 1, '名簿の行が足りた');
  assert.equal(photos(h, 'testFolderId'), files + 1, '写真も、二重にならない');
  assert.equal(countRows(h, TEST_OS, 0, receipt), 1);
  assert.equal(h.call('saveEntry_', p), receipt); assert.equal(h.rows(TEST_OS).length, osRows + 1, 'もう一度送っても、増えない');
  assert.match(html(h, p), /申し込みが完了しました/);
});

test('v3 失敗: 名簿に書いた行を読み戻せない（storage・再送できる）→ 受付番号は出さない。同じ申込番号で送り直すと、行は増えず、確認が通る', () => {
  const h = harness(); h.ready();
  const p = h.params('test'); const os = h.book.getSheetByName(TEST_OS), osRows = h.rows(TEST_OS).length;
  const realGetRange = os.getRange; let corrupt = true;
  // 読み戻し（1行・14列の表示値）だけを、わざとちがう値にする。書き込みや行さがしは、そのまま
  os.getRange = (r: number, c: number, n?: number, m?: number) => {
    const range = realGetRange(r, c, n, m);
    return corrupt && r > 1 && c === 1 && n === 1 && m === 14 ? { ...range, getDisplayValues: () => [Array(14).fill('読み戻し失敗（模擬）')] } : range;
  };
  const error = thrown(() => h.call('saveEntry_', p));
  assert.equal(error.code, 'storage'); assert.equal(error.retryable, true); assert.match(error.message, /大会用の名簿の保存を確認できませんでした/);
  assert.doesNotMatch(html(h, p), /申し込みが完了しました/); // この呼び出しも、再送として同じ失敗になる（行は増えない）
  assert.equal(h.rows(TEST_OS).length, osRows + 1, '行は1つだけ書かれている（二重にしない）');
  corrupt = false; os.getRange = realGetRange;
  const receipt = h.call('saveEntry_', p);
  assert.match(receipt, /^TEST-/); assert.equal(h.rows(TEST_OS).length, osRows + 1); assert.equal(countRows(h, TEST_OS, 0, receipt), 1);
  assert.equal(h.lock.acquired, h.lock.released);
});

test('v3 失敗: 写真の保存で失敗（Driveの一時的なエラー）→ 表には何も書かれていない。同じ申込番号で送り直すと、1件だけ保存される', () => {
  const h = harness(); h.ready();
  const p = h.params('test'); const rows = h.rows(TEST).length, osRows = h.rows(TEST_OS).length, files = photos(h, 'testFolderId');
  const folder = h.resources.get(h.props.get('testFolderId')!)!; const createFile = folder.createFile;
  folder.createFile = () => { throw new Error('Driveの一時的なエラー（模擬）'); };
  assert.match(html(h, p), /保存結果の確認が必要です/);
  assert.equal(h.rows(TEST).length, rows, '写真が先なので、表の行は書かれていない'); assert.equal(h.rows(TEST_OS).length, osRows); assert.equal(photos(h, 'testFolderId'), files);
  folder.createFile = createFile;
  const receipt = h.call('saveEntry_', p);
  assert.equal(h.rows(TEST).length, rows + 1); assert.equal(h.rows(TEST_OS).length, osRows + 1); assert.equal(photos(h, 'testFolderId'), files + 1);
  assert.equal(h.call('saveEntry_', p), receipt); assert.equal(h.rows(TEST).length, rows + 1, '送り直しを重ねても、増えない');
  assert.equal(h.lock.acquired, h.lock.released);
});

test('v3 失敗: 途中で失敗したあとに、会長が受付を止めても、同じ申込番号の再送は「保存ずみの続き」として完了できる。新しい申込は、断る', () => {
  const h = harness(); h.ready(); h.call('openEntries');
  const p = h.params('live'); const restore = breakAppend(h.book.getSheetByName(OS));
  assert.throws(() => h.call('saveEntry_', p), /Google側の一時的なエラー/);
  assert.equal(h.rows(PRIVATE).length, 2, '申込原本には、もう書かれている'); assert.equal(h.rows(OS).length, 1, '名簿は、まだ');
  restore();
  h.call('closeEntries');
  assert.equal(thrown(() => h.call('saveEntry_', h.params('live'))).code, 'closed', '新しい申込は、受け付けない');
  assert.equal(h.rows(PRIVATE).length, 2, '断った申込は、書かれていない');
  const receipt = h.call('saveEntry_', p);
  assert.equal(h.rows(PRIVATE).length, 2); assert.equal(h.rows(OS).length, 2, '足りなかった名簿の行が足りた'); assert.equal(countRows(h, OS, 0, receipt), 1);
});

/* ───────── 再送のくらべ（固定する今の動き） ───────── */

test('v3 再送: 同じ申込番号でも、中身がちがえば「変わっています」（changed）で断る。何も書き換えない。設定が同じなら、同じ内容は何度でも通る', () => {
  const h = harness(); h.ready({ 学年: '必須' });
  const p = h.params('test'); const receipt = h.call('saveEntry_', p);
  const before = shot(h);
  assert.equal(h.call('saveEntry_', p), receipt, '同じ内容は、同じ受付番号');
  for (const [field, value] of [['name', '別の選手'], ['grade', '中2'], ['contactPhone', '09011112222'], ['height', '171']] as const) {
    const error = thrown(() => h.call('saveEntry_', { ...p, [field]: value }));
    assert.equal(error.code, 'changed', field); assert.match(error.message, /送信後に入力内容が変わっています/, field);
  }
  assert.equal(shot(h), before, '断った再送は、何も書き換えない');
});

// R6c-1（採点で、ハーネスで再現ずみ）：会長が 学年＝必須 → なし に変えたあとに、同じ内容を送り直すと「変わっています」と断られる。
// 直し方：saveEntry_ の「前と同じ内容か」の比べ方から、いまの設定が「なし」の項目（学年・年齢・意気込み・入場曲）を外した（直したので、todo ではなく、ふつうの試験）。
for (const [setting, off] of [['学年', 'なし'], ['年齢', 'なし'], ['意気込み', 'なし'], ['入場曲', 'なし']] as const) {
  test('v3 再送（R6c-1）: 保存したあとに「' + setting + '」を「' + off + '」に変えても、同じ内容の再送は、同じ受付番号を返す（「変わっています」と断らない）', () => {
    const h = harness(); h.ready({ 学年: '必須', 年齢: '必須', 意気込み: '必須', 入場曲: 'あり' });
    const p = h.params('test', { musicUrl: 'https://music.apple.com/jp/album/test' }); const receipt = h.call('saveEntry_', p);
    h.setSetting(setting, off);
    assert.equal(h.call('saveEntry_', p), receipt);
    assert.equal(h.rows(TEST).length, 3, '行は増えない');
  });
}

test('v3 再送（R6c-1）: 「なし」に変えた項目は比べない。でも、ほかの項目がちがえば、今までどおり「変わった」で断る。4つ全部を「なし」にしても同じ。設定を変えないときの動きも同じ', () => {
  const h = harness(); h.ready({ 学年: '必須', 年齢: '必須', 意気込み: '必須', 入場曲: 'あり' });
  const p = h.params('test', { musicUrl: 'https://music.apple.com/jp/album/test' }); const receipt = h.call('saveEntry_', p);
  // 設定を変えないあいだは、今までどおり：中身がちがえば断る
  for (const [field, value] of [['grade', '中2'], ['age', '21'], ['comment', 'ちがう'], ['musicUrl', 'https://music.apple.com/jp/album/other']] as const) assert.equal(thrown(() => h.call('saveEntry_', { ...p, [field]: value })).code, 'changed', field);
  for (const setting of ['学年', '年齢', '意気込み', '入場曲']) h.setSetting(setting, 'なし');
  const before = shot(h);
  assert.equal(h.call('saveEntry_', p), receipt); assert.equal(h.call('saveEntry_', p), receipt, '何度でも');
  // 「なし」の項目は見ない：空で送り直しても、同じ受付番号（保存した行は書き換えない）
  assert.equal(h.call('saveEntry_', { ...p, grade: '', age: '', comment: '', musicUrl: '' }), receipt);
  // ほかの項目は、今までどおり比べる
  for (const [field, value] of [['name', '別の選手'], ['gym', '別ジム'], ['height', '171'], ['weight', '66'], ['record', 'ちがう戦績'], ['contactPhone', '09011112222'], ['contactName', '別の人'], ['contactEmail', 'other@example.com']] as const) assert.equal(thrown(() => h.call('saveEntry_', { ...p, [field]: value })).code, 'changed', field);
  assert.equal(shot(h), before, '通した再送も、断った再送も、何も書き換えない'); assert.equal(h.rows(TEST).length, 3);
  assert.match(html(h, p), /✓ 申し込みが完了しました/);
});
