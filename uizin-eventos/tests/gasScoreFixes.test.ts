// 見直し（2026-10-24 の採点）で見つかった、Googleの受付（.gs）の問題を直したことを確かめる。架空の名前・架空の数字だけを使う。
// 1 「戦績詳細」に列が足された・1行目が消えた → 申込原本と同じ見方で言う（足した列を消す／見出しを1マスずつ書き直させない）
// 2 「戦績詳細」は本物の申込のタブ：名前を変えて作り直す道を教えない（テスト戦績詳細は、今までどおり）
// 3 .1 が書いた戦績の1行（「3勝1敗」）のまま、.2 で同じ申込を送り直しても、「変わった」と断らない
// 4 テストの申込：1分の数を本番と別に数える／「テスト申込」タブが200件なら、新しいテストの申込を断る（① の自動テストと再送は止めない）
// 5 名簿ZIP（④）：持ち主の確認は1回・写真はフォルダを1回見て探す・5分をこえそうなら日本語で止める（できるZIPの中身は同じ）
// 6 くわしい戦績の上限・キックの1行の読み方が、core/recordDetail.ts と同じ
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { harness, JPEG } from './helpers/gasV3Harness.ts';
import { kickFromRecordText, parseRecordDetail, RECORD_DETAIL_HEADERS, RECORD_DETAIL_LIMITS } from '../core/recordDetail.ts';
import { diagnose, parsePing } from '../core/setupV3.ts';

type H = ReturnType<typeof harness>;
const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', REC = '戦績詳細', REC_TEST = 'テスト戦績詳細';
const json = (value: unknown): any => JSON.parse(JSON.stringify(value));
const thrown = (fn: () => unknown): any => { try { fn(); } catch (e) { return e; } assert.fail('止まるはずが、止まらなかった'); };
const ping = (h: H) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
const live = (): H => { const h = harness(); h.ready(); h.call('openEntries'); return h; };
type Kick = { games: number; win: number; loss: number; draw: number };
/** 架空のくわしい戦績（送る文）。キックは4戦3勝1敗 */
const detail = (kick: Kick = { games: 4, win: 3, loss: 1, draw: 0 }): string => JSON.stringify({ v: 1, kick, others: [{ sport: 'ムエタイ', games: 2, win: 1, loss: 0, draw: 0, noResult: 1 }], titles: [] });
/** 表の中身・プロパティ・ファイルの数を、まとめて写す（何も書かれていないことを見るため） */
const snap = (h: H): string => JSON.stringify({ sheets: [...h.book.sheets.entries()].map(([name, s]: any) => [name, s.rows]), props: [...h.props.entries()], files: h.resources.size });
/** 列を足す・消す（本物のシートと同じく、全部の行で1マスずつ動く） */
const insertColumn = (h: H, name: string, index: number) => { for (const row of h.rows(name)) row.splice(index, 0, ''); };
const deleteColumn = (h: H, name: string, index: number) => { for (const row of h.rows(name)) row.splice(index, 1); };
const rowOf = (h: H, name: string, receipt: string): any[] => h.rows(name).find((r) => r[0] === receipt)!;
const photoFolder = (h: H): any => h.resources.get(h.props.get('photoFolderId')!);

/* ───────── 1・2 「戦績詳細」の見出しの点検 ───────── */

test('1 「戦績詳細」の途中に列が足されたら、申込原本と同じく「足した列を消して」と言う（ping・設定の画面・⑤・①・受付）。消せば元どおりで、前の人の戦績も名簿ZIPに付く', () => {
  const h = live();
  const first = h.call('saveEntry_', h.params('live', { recordDetail: detail() }));
  insertColumn(h, REC, 2);   // 会長が、C列にメモ用の空の列を入れた
  const body = ping(h);
  assert.deepEqual([body.ready, body.error, body.errorTab, body.errorCell, body.errorExpected, body.errorInserted], [false, 'headers', REC, 'C1', '種類', true]);
  // 設定の画面（core/setupV3.ts）：見出しを書き直させず、足した列を消させる
  assert.match(diagnose(parsePing(body)).message, /「戦績詳細」タブに、列が足されています（C列）。C列を消してください/);
  // ⑤ いまの状態を見る
  h.call('showStatus');
  const status = h.alerts.at(-1)!;
  assert.match(status, /戦績詳細：「戦績詳細」タブの1行目に、列が足されています（C1）。足したC列を消してください（C列の上で右クリック →「列を削除」）。消したら「① 最初の設定」を押します。/);
  assert.ok(!status.includes('「種類」に直してください'), '見出しを1マスずつ書き直させない（書き直すと、前の行が1列ずれたまま残る）');
  // ① のあとの注意
  h.call('menuSetup');
  const note = h.toasts.at(-1)!;
  assert.match(note, /「戦績詳細」タブの見出しが、この版と違います（C列が足されています。C列の上で右クリック →「列を削除」で、足したC列を消してください）。直すまで、くわしい戦績つきの申し込みは受けられません。/);
  assert.ok(!note.includes('C1 を「種類」に直して'));
  // 受付（くわしい戦績つき）：何も書かずに止まり、同じ言い方
  const before = snap(h);
  const error = thrown(() => h.call('saveEntry_', h.params('live', { recordDetail: detail() })));
  assert.equal(error.code, 'headers'); assert.equal(error.detail.inserted, true); assert.match(error.message, /列が足されています（C1）/);
  assert.equal(snap(h), before, '何も書かれない');
  // テストの表でも同じ見方
  insertColumn(h, REC_TEST, 5);
  h.call('showStatus'); assert.match(h.alerts.at(-1)!, /「戦績詳細」タブの1行目に、列が足されています（C1）/);
  // 足した列を消せば、元どおり。前の人の戦績も、名簿ZIPの records.csv に付く
  deleteColumn(h, REC, 2); deleteColumn(h, REC_TEST, 5);
  assert.equal(ping(h).ready, true);
  h.call('exportTournament');
  const csv = h.zips.at(-1).find((f: any) => f.name === 'records.csv').bytes.toString('utf8');
  assert.ok(csv.includes('"' + first + '","'), '前の人の行が records.csv にある');
});

test('1 「戦績詳細」の1行目（見出し）を消したら、「見出しが消えた」と言う。①の注意も、見出しを1行目に打ちこませない（最初の申込の行を上書きするため）。右のはしに足しただけ・空・無いタブは、今までどおり問題にしない', () => {
  const h = live();
  const first = h.call('saveEntry_', h.params('live', { recordDetail: detail() }));
  h.rows(REC).shift();   // 1行目を消した（最初の申込の行が、いちばん上になる）
  const body = ping(h);
  assert.deepEqual([body.error, body.errorTab, body.errorCell, body.errorRowGone], ['headers', REC, 'A1', true]);
  assert.ok(!JSON.stringify(body).includes(first), 'ping に受付番号を出さない');
  h.call('showStatus'); assert.match(h.alerts.at(-1)!, /「戦績詳細」タブの1行目の見出しが消えています（いちばん上の行が、申込のデータになっています）/);
  h.call('menuSetup');
  const note = h.toasts.at(-1)!;
  assert.match(note, /「戦績詳細」タブの見出しが、この版と違います（1行目の見出しが消えています。見出しを書き直さず、「⑤ いまの状態を見る」で、もどし方を見てください）。/);
  assert.ok(!note.includes('A1 を「受付番号」に直して') && !note.includes(first));
  // 今までどおり：右のはし（M列）に足しただけなら、見出しの12列はそのままなので、問題にしない
  const g = live();
  g.rows(REC)[0].push('メモ');
  assert.equal(ping(g).ready, true);
  assert.ok(g.call('saveEntry_', g.params('live', { recordDetail: detail() })));
  // 中身が空のタブ・無いタブも、問題にしない（受付が見出しを書く・作る）
  g.book.getSheetByName(REC).rows.length = 0;
  assert.equal(ping(g).ready, true, '空');
  g.book.sheets.delete(REC);
  assert.equal(ping(g).ready, true, '無い');
});

test('2 「戦績詳細」は本物の申込のタブ：直せないときは「消さず、ジムの担当者に聞いて」と言い、名前を変えて作り直す道は教えない。「テスト戦績詳細」は、今までどおり名前を変える道', () => {
  const h = live();
  h.rows(REC)[0][3] = '競技名';
  const real = thrown(() => h.call('saveEntry_', h.params('live', { recordDetail: detail() }))).message;
  assert.match(real, /「戦績詳細」タブのD1が「競技名」になっています。「競技名・大会名」に直してください。/);
  assert.match(real, /直せないときは、このタブを消さず、ジムの担当者に聞いてください。/);
  assert.ok(!real.includes('_古い'), '名前を変えて①を押すと、空の「戦績詳細」ができ、前の人の戦績が名簿ZIPから消える');
  h.call('showStatus'); assert.ok(!h.alerts.at(-1)!.includes('戦績詳細_古い'), '⑤にも出ない');
  h.rows(REC)[0][3] = RECORD_DETAIL_HEADERS[3];
  h.rows(REC_TEST)[0][3] = '競技名';
  const practice = thrown(() => h.call('saveEntry_', h.params('test', { recordDetail: detail() }))).message;
  assert.match(practice, /このタブの名前を「テスト戦績詳細_古い」に変えて、「① 最初の設定」を押します。新しいタブができます。/);
});

/* ───────── 3 受付を .1 から .2 に貼りかえる前後の再送 ───────── */

test('3 .1 が書いた戦績の1行（「3勝1敗」「2勝1敗1分」）のまま、.2 で同じ申込を送り直しても、同じ受付番号になる（キックの数が同じなら同じ）。数がちがえば、今までどおり「変わった」。新しい申込は「4戦3勝1敗」の形', () => {
  const cases: [Kick, string][] = [[{ games: 4, win: 3, loss: 1, draw: 0 }, '3勝1敗'], [{ games: 4, win: 2, loss: 1, draw: 1 }, '2勝1敗1分'], [{ games: 0, win: 0, loss: 0, draw: 0 }, '初試合']];
  for (const [kick, old] of cases) {
    const h = live();
    const rid = randomUUID();
    const form = (k: Kick) => h.params('live', { requestId: rid, recordDetail: detail(k), record: '適当な文' });
    const receipt = h.call('saveEntry_', form(kick));
    // .1 が書いた姿にする（.1 の1行は「戦」が無い）。申込原本と OS取込用の戦績
    rowOf(h, PRIVATE, receipt)[9] = old; rowOf(h, OS, receipt)[7] = old;
    const sizes = () => JSON.stringify([PRIVATE, OS, REC].map((name) => h.rows(name).length));
    const before = sizes();
    // 保護者が「もう一度送る」を押した（申し込みページから。同じ requestId・同じ中身）
    const page = String(h.call('doPost', { parameter: form(kick) }).html);
    assert.match(page, /申し込みが完了しました/, old);
    assert.ok(page.includes('受付番号：' + receipt), old + '：同じ受付番号');
    assert.equal(sizes(), before, old + '：行は増えない');
    assert.equal(rowOf(h, PRIVATE, receipt)[9], old, old + '：保存してある前の形は、書きかえない');
    // キックの数がちがう再送は、今までどおり断る
    const changed = thrown(() => h.call('saveEntry_', form({ games: 5, win: 3, loss: 2, draw: 0 })));
    assert.equal(changed.code, 'changed', old);
    // 新しい申込は、いまの形で書く
    const fresh = h.call('saveEntry_', h.params('live', { recordDetail: detail(kick) }));
    assert.equal(rowOf(h, PRIVATE, fresh)[9], kick.games ? kick.games + '戦' + kick.win + '勝' + kick.loss + '敗' + (kick.draw ? kick.draw + '分' : '') : '初試合');
  }
});

test('3 キックの1行を数にもどす読み方（.gs の recordDetailKickFromText_）は、core の kickFromRecordText と同じ答え（前の形も、いまの形も）', () => {
  const h = harness();
  const texts = ['初試合', ' 初試合 ', '4戦3勝1敗', '4戦2勝1敗1分', '3勝1敗', '2勝1敗1分', ' 3勝1敗 ', '5戦3勝1敗', '4戦3勝1敗0分', '1勝0敗0分', '0勝0敗', '0戦0勝0敗', '999勝0敗', '999戦999勝0敗', '998勝1敗1分', '1000勝0敗', '500勝500敗', '3勝', '勝1敗', '3勝1敗2', '３勝１敗', '4戦03勝01敗', '初出場', '', '1234戦1勝0敗'];
  for (const t of texts) assert.deepEqual(json(h.call('recordDetailKickFromText_', t)), json(kickFromRecordText(t)), JSON.stringify(t));
});

/* ───────── 4 テストの申込（いたずらで本番を止めない・表をいっぱいにしない） ───────── */

/** 時計を止める（1分の数が、試験のとちゅうで次の分に変わらないように）。.gs の中の Date.now だけを変える */
const freeze = (h: H, at: number) => { vm.runInContext('Date.now = function () { return ' + at + '; };', h.api); };
/** 「テスト申込」タブのデータの行を n 件にする（受付番号だけの、架空の行を足す） */
const fillTest = (h: H, n: number) => { const rows = h.rows(TEST); let i = 0; while (rows.length - 1 < n) rows.push(['TEST-FAKE-' + (++i)]); };

test('4 1分あたりの数は、本番とテストで別々：テストの申込が1分に30件来ても、本番の申込は通る。本番も、本番だけで1分に30件まで', () => {
  const at = Date.parse('2026-10-24T03:00:10Z');
  const h = harness(); freeze(h, at); h.ready(); h.call('openEntries');
  // ① の自動テストで1件。あと29件で、テストの1分の枠（30件）がいっぱい
  for (let i = 0; i < 29; i++) h.call('saveEntry_', h.params('test'));
  const busy = thrown(() => h.call('saveEntry_', h.params('test')));
  assert.equal(busy.code, 'busy', 'テストは、テストの枠で待ってもらう'); assert.equal(busy.retryable, true);
  assert.match(h.call('saveEntry_', h.params('live')), /^[A-Z0-9]+-[0-9A-F]{20}$/, 'テストの枠がいっぱいでも、本番は通る（前は「受付が混み合っています」になった）');
  for (let i = 0; i < 29; i++) h.call('saveEntry_', h.params('live'));
  assert.equal(thrown(() => h.call('saveEntry_', h.params('live'))).code, 'busy', '本番も、1分に30件まで');
  // 次の分になれば、どちらも、また送れる
  freeze(h, at + 60 * 1000);
  assert.ok(h.call('saveEntry_', h.params('live'))); assert.ok(h.call('saveEntry_', h.params('test')));
});

test('4 「テスト申込」タブに200件あると、新しいテストの申込は断る（何も書かず、写真も作らない）。本番・同じ申込の再送・① の自動テストは止めない', () => {
  const h = live();
  const rid = randomUUID();
  const kept = h.call('saveEntry_', h.params('test', { requestId: rid }));   // あとで再送する1件
  fillTest(h, 199);
  assert.ok(h.call('saveEntry_', h.params('test')), '199件のときは、まだ受ける');
  assert.equal(h.rows(TEST).length - 1, 200);
  const before = snap(h);
  const error = thrown(() => h.call('saveEntry_', h.params('test')));
  assert.equal(error.code, 'capacity'); assert.equal(error.retryable, false);
  assert.equal(error.message, 'テスト用の申し込みが200件になったので、これ以上は受け付けません。本番の申し込みには関係ありません。主催者の方は、シートの「テスト申込」タブの、古いテストの行（2行目から下。1行目の見出しは残します）を消してから、「① 最初の設定」を押してください。');
  assert.equal(snap(h), before, '表・プロパティ（1分の数も）・写真は、何も変わらない');
  // 申し込みページから来たとき（doPost）：赤い「送れませんでした」に、主催者がすることが出る。自動テストの印は、外からは付けられない
  const page = String(h.call('doPost', { parameter: { ...h.params('test'), selfTest: 'true' } }).html);
  assert.match(page, /✕ 送れませんでした/); assert.match(page, /テスト用の申し込みが200件になったので/); assert.ok(!page.includes('同じ申込を確認・再開する'));
  assert.equal(snap(h), before);
  // 本番の申込は、関係なく通る
  assert.match(h.call('saveEntry_', h.params('live')), /^[A-Z0-9]+-[0-9A-F]{20}$/);
  // 同じ申込（同じ requestId）の再送は、今までどおり同じ受付番号
  assert.equal(h.call('saveEntry_', h.params('test', { requestId: rid })), kept);
  // ① の自動テスト：新しい版を貼ったあとなど、自動テストをやり直すときも、止めない
  h.props.set('lastTestBuild', '3.20261024.1');
  const rows = h.rows(TEST).length;
  assert.doesNotThrow(() => h.call('setupTournament'));
  assert.equal(h.rows(TEST).length, rows + 1, '自動テストの1件が入った');
  assert.equal(h.call('statusInfo_').testComplete, true);
});

test('4 「テスト申込」の古い行を消せば、また送れる（行ごと消しても、Delete キーで中身だけ消しても）', () => {
  const h = live();
  fillTest(h, 200);
  assert.equal(thrown(() => h.call('saveEntry_', h.params('test'))).code, 'capacity');
  for (const row of h.rows(TEST).slice(2, 12)) row.fill('');   // 中身だけ消した10行（行は残る）
  assert.ok(h.call('saveEntry_', h.params('test')), '中身を消した行は、数えない');
  fillTest(h, 220);
  assert.equal(thrown(() => h.call('saveEntry_', h.params('test'))).code, 'capacity');
  h.rows(TEST).splice(2, 40);   // 行ごと消した
  assert.ok(h.call('saveEntry_', h.params('test')));
});

/* ───────── 5 名簿ZIP（④） ───────── */

/** Googleを呼んだ回数を数える（写真1枚ごとに呼ぶものが、残っていないか） */
function countCalls(h: H) {
  const calls = { getFileById: 0, session: 0, listing: 0 };
  const getFileById = h.api.DriveApp.getFileById; h.api.DriveApp.getFileById = (id: string) => { calls.getFileById++; return getFileById(id); };
  const session = h.api.Session.getEffectiveUser; h.api.Session.getEffectiveUser = () => { calls.session++; return session(); };
  const folder = photoFolder(h), getFiles = folder.getFiles; folder.getFiles = () => { calls.listing++; return getFiles(); };
  return calls;
}
/** ZIP の中身：名前と、バイト（.gs の中で作った配列を、この試験の配列に写す） */
const zipOf = (h: H): [string, number[]][] => [...h.zips.at(-1)].map((f: any) => [String(f.name), [...f.bytes]]);

test('5 名簿ZIP：持ち主の確認は1回だけ、写真はフォルダを1回見て探す（写真1枚ごとに getFileById・Session を呼ばない）。中身は players.csv・records.csv・写真（名簿の順）で、今までと同じ', () => {
  const h = live();
  const receipts = Array.from({ length: 6 }, () => h.call('saveEntry_', h.params('live', { recordDetail: detail() })));
  const calls = countCalls(h);
  h.call('exportTournament');
  assert.equal(calls.listing, 1, '写真フォルダの中を見るのは1回');
  assert.equal(calls.getFileById, 1, 'getFileById は、シートの共有の確認の1回だけ（前は 1＋写真6枚ぶん）');
  assert.equal(calls.session, 2, '持ち主の確認は、受付の確認（checkResources_）と、写真の前の1回だけ（前は 1＋写真6枚ぶん）');
  const zip = zipOf(h);
  assert.deepEqual(zip.map((f: any) => f[0]), ['players.csv', 'records.csv', ...receipts.map((r) => 'photos/' + r + '.jpg')]);
  for (const f of zip.slice(2)) assert.deepEqual(f[1], [...JPEG], '写真のバイトは、保存した写真そのもの');
});

test('5 名簿ZIP：使う写真は、今までどおり名簿の行の写真URLの番号のファイル。写真フォルダの外へ動かした写真・フォルダの中が見られないときは、その番号で1枚ずつ探し、同じZIPになる', () => {
  const h = live();
  const other = Buffer.from([0xff, 0xd8, 0x09, 0x09, 0xff, 0xd9]);
  const a = h.call('saveEntry_', h.params('live')), b = h.call('saveEntry_', h.params('live', { photoDataUrl: 'data:image/jpeg;base64,' + other.toString('base64') })), c = h.call('saveEntry_', h.params('live'));
  h.call('exportTournament');
  const normal = zipOf(h);
  assert.deepEqual(normal.map((f: any) => f[0]), ['players.csv', 'photos/' + a + '.jpg', 'photos/' + b + '.jpg', 'photos/' + c + '.jpg']);
  assert.deepEqual(normal[2][1], [...other]);
  // c の写真を、写真フォルダの外（ほかのフォルダ）へ動かした：フォルダの一覧には無いが、番号で探せる
  const folder = photoFolder(h), cUrl = String(rowOf(h, OS, c)[10]), cFile = h.resources.get(cUrl.match(/\/d\/([\w-]+)/)![1]);
  const elsewhere = h.api.DriveApp.createFolder('ほかのフォルダ');
  folder.children.splice(folder.children.indexOf(cFile), 1); elsewhere.children.push(cFile); cFile.parents = [elsewhere];
  const calls = countCalls(h);
  h.call('exportTournament');
  assert.deepEqual(zipOf(h), normal, '動かした写真も入り、同じZIP');
  assert.equal(calls.getFileById, 2, 'シートの1回＋動かした写真の1回だけ');
  // フォルダの中が見られない（Google側の一時的なエラー）：全部の写真を、番号で1枚ずつ探す
  folder.getFiles = () => { throw new Error('一時的なエラー（模擬）'); };
  h.call('exportTournament');
  assert.deepEqual(zipOf(h), normal, '一覧が作れなくても、同じZIP');
  // 名簿の行の写真URLを、ほかの人（b）の写真に書きかえてあるときも、今までどおり、URLの番号のファイルを使う（名前で探しなおさない）
  delete folder.getFiles;
  rowOf(h, OS, a)[10] = rowOf(h, OS, b)[10];
  h.call('exportTournament');
  assert.deepEqual(zipOf(h)[1], ['photos/' + a + '.jpg', [...other]]);
});

/** にせものの時計：写真1枚を ZIP に入れる（getBlob）たびに、step ミリ秒すすむ。advance で、好きなだけすすめる */
function slowPhotos(h: H, step: number) {
  let now = Date.parse('2026-10-24T03:00:00Z');
  h.api.__fakeNow = () => now;
  vm.runInContext('Date.now = function () { return __fakeNow(); };', h.api);
  for (const file of photoFolder(h).children.filter((r: any) => r.kind === 'file')) { const getBlob = file.getBlob; file.getBlob = () => { now += step; return getBlob(); }; }
  return { advance: (ms: number) => { now += ms; } };
}

test('5 名簿ZIP：作るのに5分をこえそうなら、日本語で「何が起きたか・どうするか」を言って止める（Googleの6分で、英語の文で止まらない）。ZIPは作らない。5分までに終われば、今までと同じZIP', () => {
  const h = live();
  for (let i = 0; i < 8; i++) h.call('saveEntry_', h.params('live'));
  slowPhotos(h, 70 * 1000);   // 写真1枚に70秒かかる
  const zips = h.zips.length, files = h.resources.size;
  assert.equal(h.call('menuExport'), null, 'メニューから押したとき');
  const message = h.alerts.at(-1)!;
  assert.equal(message, '名簿ZIPを作るのに時間がかかりすぎたので、とちゅうで止めました（写真8枚のうち、5枚まで進みました。Googleは、1回に6分までしか動けません）。ZIPは、まだできていません。申し込みと写真は、そのまま残っています。少し時間をおいてから、もう一度「④ OS用の名簿ZIPを作る」を押してください。何度やっても止まるときは、ジムの担当者に連絡してください。');
  assert.ok(!/[A-Za-z]{4,}/.test(message.replace(/ZIP|Google/g, '')), '英語の文を出さない（「ZIP」「Google」は、今までの文と同じ言葉）');
  assert.equal(h.zips.length, zips, 'ZIPは作らない'); assert.equal(h.resources.size, files, 'ドライブにファイルを作らない');
  assert.equal(h.lock.acquired, h.lock.released, 'ロックは手放した');
  // 写真が4枚なら（70秒×4＝4分40秒）、最後まで作る。中身は、今までと同じ
  const g = live();
  const receipts = Array.from({ length: 4 }, () => g.call('saveEntry_', g.params('live')));
  slowPhotos(g, 70 * 1000);
  assert.ok(g.call('exportTournament'));
  assert.deepEqual(zipOf(g).map((f: any) => f[0]), ['players.csv', ...receipts.map((r) => 'photos/' + r + '.jpg')]);
});

test('5 名簿ZIP：時間は「④ を押したとき」から数える（ロックを待った時間も、Googleの6分に入る）', () => {
  const h = live();
  for (let i = 0; i < 2; i++) h.call('saveEntry_', h.params('live'));
  const clock = slowPhotos(h, 70 * 1000);
  const getScriptLock = h.api.LockService.getScriptLock;
  h.api.LockService.getScriptLock = () => { const lock = getScriptLock(); const tryLock = lock.tryLock; lock.tryLock = (ms: number) => { clock.advance(4.5 * 60 * 1000); return tryLock(ms); }; return lock; };
  assert.match(thrown(() => h.call('exportTournament')).message, /写真2枚のうち、1枚まで進みました/);
});

/* ───────── 6 core/recordDetail.ts と同じ ───────── */

test('6 くわしい戦績の上限（.gs の RECORD_LIMITS）は、core/recordDetail.ts の RECORD_DETAIL_LIMITS と全部同じ。境目の例（階級31字・成績61字・6つ目など）も、同じ答え', () => {
  const h = harness();
  assert.deepEqual(json(vm.runInContext('RECORD_LIMITS', h.api)), { ...RECORD_DETAIL_LIMITS });
  const L = RECORD_DETAIL_LIMITS;
  const base = { v: 1, kick: { games: 1, win: 1, loss: 0, draw: 0 }, others: [] as any[], titles: [] as any[] };
  const other = (sport: string) => ({ sport, games: 1, win: 1, loss: 0, draw: 0, noResult: 0 });
  const title = (over: Record<string, unknown> = {}) => ({ event: '架空', year: 2025, class: '-60kg', result: '優勝', ...over });
  const cases: any[] = [];
  for (const n of [L.games, L.games + 1]) cases.push({ ...base, kick: { games: n, win: n, loss: 0, draw: 0 } });
  for (const n of [L.others, L.others + 1]) cases.push({ ...base, others: Array.from({ length: n }, () => other('架空競技')) });
  for (const n of [L.titles, L.titles + 1]) cases.push({ ...base, titles: Array.from({ length: n }, () => title()) });
  for (const n of [L.sport, L.sport + 1]) cases.push({ ...base, others: [other('あ'.repeat(n))] });
  for (const key of ['event', 'class', 'result'] as const) for (const n of [L[key], L[key] + 1]) cases.push({ ...base, titles: [title({ [key]: 'あ'.repeat(n) })] });
  for (const year of [L.yearMin - 1, L.yearMin, L.yearMax, L.yearMax + 1]) cases.push({ ...base, titles: [title({ year })] });
  for (const d of cases) {
    const t = JSON.stringify(d), core = parseRecordDetail(t);
    assert.equal(JSON.stringify(h.call('recordDetailParse_', t)), JSON.stringify(core), t.slice(0, 80));
  }
  assert.ok(cases.some((d) => parseRecordDetail(JSON.stringify(d)) === null) && cases.some((d) => parseRecordDetail(JSON.stringify(d)) !== null), '通る例と、通らない例の両方がある');
});
