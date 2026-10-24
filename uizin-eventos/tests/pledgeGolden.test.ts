// 「誓約書」＝なし（初期値・古いシート・古いリンク）のとき、これまでと1つも変わらないことを固定する試験。
// 誓約書の機能を足す前の動きから書き起こした（足す前のコードで、先に通した）。ここが赤くなったら、「なし」の動きを変えてしまっている。
// 足してよいのは、「設定」タブのいちばん下の行（ADDED_SETTING_ROWS）と、その▼だけ。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { harness, script } from './helpers/gasV3Harness.ts';
import { ACCEPTED_RECEPTION_BUILDS, diagnose, entryConfigFromPing, EXPECTED_RECEPTION_BUILD, parsePing } from '../core/setupV3.ts';
import { publicEntryConfig, publicEntryHash, publicEntryLinkCut, publicEntryReady, type PublicEntryConfig } from '../core/publicEntry.ts';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';
import { DEFAULT_WEIGHT_SETTINGS } from '../core/weightClass.ts';

const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', TEST_OS = 'テストOS取込用';
const HN_TAB = '花道プロフィール', HN_TEST_TAB = 'テスト花道プロフィール';
/** 足す前の「設定」タブの行（29行。花道の追加情報まで）。この並びも、B13・B21・B22・B30 の位置も動かさない */
const FROZEN_LABELS = ['大会名', '開催日', '会場', '会場の地図URL', '主催者名', '問い合わせ先', '申込締切', '入場曲', '学年', '年齢', '意気込み', 'クラス分け', '上のクラスの名前', '上のクラスの条件', '上のクラスのルール', '下のクラスの名前', '下のクラスの条件', '下のクラスのルール', '上のクラスにする勝ち数', '階級分け', 'ロゴ',
  '階級：小学生以下', '階級：中学生女子', '階級：中学生男子', '階級：高校生・一般女子', '階級：高校生・一般男子', '階級：花道・女子（40歳以上）', '階級：花道・男子（40歳以上）', '花道の追加情報'];
// 入場曲の初期値を「なし」に変える変更（R4。owner 決定 2026-10-22「入場曲はデフォルトでなしにして」）で直したのは、次の3か所だけ：この表の8番目（入場曲の初期値 '' → 'なし'）・説明のSHA・下の「会長が必ず書く7つの色」から B9 を外して6つにした。
const FROZEN_VALUES = ['', '', '', '', '', '', '', 'なし', '必須', '必須', '必須', 'なし', 'Aクラス', '3勝以上（3勝以下でも、会長・指導者の許可があればAクラスに出られます）', '首相撲5秒／蹴り足キャッチはワンアタック（キャッチ後に1回だけ攻撃できる）／ワンマッチは顔面への膝蹴り禁止', 'Bクラス', 'アマチュア。2勝以下（例：初出場、2勝1敗、1勝3敗）', '首相撲なし／蹴り足キャッチなし／膝蹴りなし／回転技なし', '3', 'なし', 'なし',
  'なし', '-37、-40、-43、-46、-49、-52、-55、-58', '-37、-40、-43、-46、-49、-52、-55、-58', '-40、-43、-46、-50、-53、-56、-59、-62、-65', '-50、-53、-56、-59、-62、-65、-68、-71、-74、-77、-80、-85、無差別', '-40、-45、-50、-55、-60、+60', '-55、-60、-65、-70、-75、-80、-85、無差別', 'なし'];
/** 説明（C列）29行ぶんの SHA-256。文を直したときは、直してよいか確かめてから、この値を新しくする */
// R4 で入場曲の説明だけを新しい文にしたので新しくした（ほかの28行の説明は1字も変えていない。古い文に戻して計算すると、前の値と一致することを確かめた）
const FROZEN_DESCRIPTION_SHA = '80e6791483e30135afb680137dd2b74e3edfd33699e18bb0e1261fe4e9e963d7';
/** 足してよい行。足す前は空 []。誓約書を足したので、下の行だけ（それ以外の差は、赤くなる） */
const ADDED_SETTING_ROWS: string[] = ['誓約書', '保護者の同意', 'ジム責任者の同意', '誓約書の文の確認', '花道のルール'];
// くわしい戦績の表（①で作る。新しい版のシートだけ使う。古い版のシートは、①を押すと同じ2つが増える）
const RECORD_TAB = '戦績詳細', RECORD_TEST_TAB = 'テスト戦績詳細';
const FROZEN_SHEETS = ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS, RECORD_TAB, RECORD_TEST_TAB];
const PRIVATE_HEADERS = ['受付番号', '申込日時', '大会ID', '所属ジム', '選手名', '学年', '年齢', '身長', '体重', '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）', '顔写真URL', '連絡先氏名', '連絡先電話番号', '連絡先メールアドレス', '同意', 'リクエストID', 'クラス', '区分', '階級'];
const OS_HEADERS = ['管理番号', 'ジム名', '選手名', '学年', '年齢', '身長', '体重', '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）', '顔写真URL', 'クラス', '区分', '階級'];
const HN_HEADERS = ['受付番号', '申込日時', '所属ジム', '選手名', '氏名のフリガナ', '所属ジムのフリガナ', 'リングネーム', 'リングネームのフリガナ', '生年月日', 'キック歴（年）', '練習頻度（週に何回）', '他格闘歴', '職業', '趣味・特技', '始めた理由・良かった所', 'メッセージ'];
const FROZEN_PROPS = ['spreadsheetId', 'ownerEmail', 'eventId', 'accepting', 'photoFolderId', 'testFolderId', 'rateMinute', 'rateCount', 'lastTestBuild', 'lastTestRequest'];
const PING_BASE = ['app', 'protocol', 'build', 'ready', 'accepting', 'eventId', 'testComplete', 'settingsProblem', 'storageProblem', 'title', 'date', 'venue', 'venueUrl', 'organizer', 'contact', 'deadline', 'music', 'grade', 'age', 'comment'];
// 花道のルール（R8-1）：クラス分けが「あり」で花道の区分があると、ping に hanamichiRule が1つ増える（誓約書の鍵ではない）
const PING_ALL_ON = [...PING_BASE, 'logo', 'weightMode', 'weights', 'classMode', 'classes', 'hanamichiRule', 'hanamichiMode'];
const RETRY_FIELDS = ['protocol', 'eventId', 'entryKey', 'mode', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'fighterClass', 'division', 'weightClass', 'photoDataUrl'];
const HN_KEYS = ['hnNameKana', 'hnGymKana', 'hnRing', 'hnRingKana', 'hnBirth', 'hnKickYears', 'hnPerWeek', 'hnOther', 'hnJob', 'hnHobby', 'hnReason', 'hnMessage'];
/** 申し込みページが送る鍵（photoDataUrl まで）。'...' は階級分けのときだけ足す division・weightClass */
const PAGE_POST_KEYS = ['protocol', 'entryKey', 'mode', 'website', 'eventId', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'fighterClass', '...', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'photoDataUrl'];
/** 足す前に、ちゃんと受け付けていた失敗のコードと、結果の画面が「送れませんでした」と言い切る一覧 */
const NOT_SAVED_CODES = ['input', 'event', 'spam', 'consent', 'class', 'weight', 'hanamichi', 'closed', 'capacity', 'setup', 'headers', 'missing', 'sharing', 'owner', 'folder'];

const ENDPOINT_FOR_CONFIG = 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec';
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
type H = ReturnType<typeof harness>;
const ping = (h: H) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
const html = (h: H, params: any): string => String(h.call('doPost', { parameter: params }).html);
const without = (h: H, key: string) => { const rows = h.settingsSheet().rows; const i = rows.findIndex((r: any[]) => r[0] === key); if (i >= 0) rows.splice(i, 1); };
/** 「古いシート」＝誓約書の行が無いシート（足した行を取りのぞく）。足す前のコードでは、何もしない */
const oldSheet = (h: H) => { for (const label of ADDED_SETTING_ROWS) without(h, label); };
const HN = { hnNameKana: 'カクウハナミチイチロウ', hnGymKana: 'カクウジムエー', hnRing: '架空の花', hnRingKana: 'カクウノハナ', hnBirth: '1975-04-05', hnKickYears: '3', hnPerWeek: '2', hnOther: '空手', hnJob: '会社員', hnHobby: '釣り', hnReason: '健康のため', hnMessage: 'リングで会いましょう' };

test('golden 設定タブ: 足す前の29行の並び・初期値・説明は1字も変わらない。B13=クラス分け・B21=階級分け・B22=ロゴ・B30=花道の追加情報。足してよいのは下の行だけ', () => {
  const h = harness(); h.call('onOpen');
  const rows = h.rows('設定'), labels = rows.slice(1).map((r) => r[0]);
  assert.equal(FROZEN_LABELS.length, 29, '行の数（見出しをのぞく）');
  assert.deepEqual(json(labels.slice(0, FROZEN_LABELS.length)), FROZEN_LABELS);
  assert.deepEqual(json(labels.slice(FROZEN_LABELS.length)), ADDED_SETTING_ROWS, '足した行は、いちばん下だけ');
  assert.deepEqual(json(rows.slice(1, 1 + FROZEN_VALUES.length).map((r) => r[1])), FROZEN_VALUES);
  assert.equal(sha(json(rows.slice(1, 1 + FROZEN_LABELS.length).map((r) => r[2]))), FROZEN_DESCRIPTION_SHA);
  assert.equal(labels.indexOf('クラス分け') + 2, 13, 'B13'); assert.equal(labels.indexOf('階級分け') + 2, 21, 'B21'); assert.equal(labels.indexOf('ロゴ') + 2, 22, 'B22'); assert.equal(labels.indexOf('花道の追加情報') + 2, 30, 'B30');
  for (const r of rows) assert.equal(r.length, 3, '項目・値・説明');
  assert.deepEqual(json(rows[0]), ['項目', '値（ここに入れる）', '説明']);
});

test('golden 設定タブ: ▼の欄・色・列の幅・固定行・B列の文字の形は、足す前のとおり（足してよいのは下の行の▼だけ）', () => {
  const h = harness(); h.call('onOpen');
  const sheet = h.settingsSheet();
  const entries = [...sheet.validations.entries()].map(([k, v]: [string, any]) => [k, json(v.list), v.allowInvalid]);
  const frozen = [['9:2', ['あり', 'なし'], false], ['10:2', ['必須', '任意', 'なし'], false], ['11:2', ['必須', '任意', 'なし'], false], ['12:2', ['必須', '任意', 'なし'], false], ['13:2', ['なし', 'あり'], false], ['21:2', ['なし', 'あり'], false], ['22:2', ['なし', 'あり'], false], ['30:2', ['なし', 'あり'], false]];
  assert.deepEqual(entries.slice(0, frozen.length), frozen);
  assert.equal(entries.length, frozen.length + ADDED_SETTING_ROWS.filter((label) => label !== '花道のルール').length, '▼の欄は、足した行ぶんだけ増える（花道のルールの行は、長い文を書く行なので▼が無い）');
  assert.deepEqual(json([...sheet.backgrounds.entries()]), [['2:2', '#fff2a8'], ['3:2', '#fff2a8'], ['4:2', '#fff2a8'], ['6:2', '#fff2a8'], ['7:2', '#fff2a8'], ['8:2', '#fff2a8']], '会長が必ず書く6つの色（入場曲 B9 は、はじめから「なし」が入るので、色を付けない）');
  assert.deepEqual(json([...sheet.columnWidths.entries()]), [[1, 160], [2, 380], [3, 520]]); assert.equal(sheet.frozenRows, 1);
  for (let r = 2; r <= 30; r++) assert.equal(String(sheet.formats.get(r + ':2')), '@', 'B' + r + ' は文字の形');
});

test('golden 古いシート（誓約書の行が無い）: 開くと足りない行だけがいちばん下に足される。いまある29行は1マスも変わらない。2回目以降は増えない', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' }); oldSheet(h);
  h.settingsSheet().rows[1][1] = '私の大会';
  const before = JSON.stringify(h.rows('設定').slice(0, 30));
  h.call('onOpen');
  assert.equal(JSON.stringify(h.rows('設定').slice(0, 30)), before, 'いまある行は1マスも変わらない');
  assert.deepEqual(json(h.rows('設定').slice(30).map((r) => r[0])), ADDED_SETTING_ROWS);
  const count = h.rows('設定').length;
  h.call('onOpen'); h.call('setupTournament'); assert.equal(h.rows('設定').length, count);
});

test('golden 「① 最初の設定」: 作るタブは6つだけ（申込原本・OS取込用・テスト申込・テストOS取込用・戦績詳細・テスト戦績詳細）。見出しの保護・プロパティの鍵も同じ。もう一度押しても同じ', () => {
  const h = harness(); h.ready();
  assert.deepEqual([...h.book.sheets.keys()], FROZEN_SHEETS, 'シート1・設定・6つの表。花道・誓約書のタブは作らない');
  assert.deepEqual(json(h.rows(PRIVATE)[0]), PRIVATE_HEADERS); assert.deepEqual(json(h.rows(OS)[0]), OS_HEADERS);
  assert.deepEqual(json(h.rows(TEST)[0]), PRIVATE_HEADERS); assert.deepEqual(json(h.rows(TEST_OS)[0]), OS_HEADERS);
  for (const name of [PRIVATE, OS, TEST, TEST_OS]) assert.equal(h.book.getSheetByName(name).protections.length, 1, name + ' の見出しは保護される');
  assert.equal(h.rows(PRIVATE).length, 1, '本番の表は見出しだけ'); assert.equal(h.rows(TEST).length, 2, 'テストは自動テストの1件');
  assert.deepEqual([...h.props.keys()], FROZEN_PROPS);
  h.call('setupTournament');
  assert.deepEqual([...h.book.sheets.keys()], FROZEN_SHEETS); assert.equal(h.rows(TEST).length, 2);
  h.call('openEntries'); assert.deepEqual([...h.props.keys()], [...FROZEN_PROPS, 'everOpened']);
  // クラス分け・階級分け・ロゴを「あり」にしても、タブは同じ
  const all = harness(); all.ready({ クラス分け: 'あり', 階級分け: 'あり', ロゴ: 'あり' });
  assert.deepEqual([...all.book.sheets.keys()], FROZEN_SHEETS);
});

test('golden 「① 最初の設定」: 花道の追加情報＝あり のときは、花道の2つのタブが加わる（見出しの順・保護）。誓約書の語は、どのタブにも出ない', () => {
  const h = harness(); h.ready({ 階級分け: 'あり', 花道の追加情報: 'あり' });
  // 花道の2つは、くわしい戦績の2つより前に作られる（①の順）
  assert.deepEqual([...h.book.sheets.keys()], ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS, HN_TAB, HN_TEST_TAB, RECORD_TAB, RECORD_TEST_TAB]);
  for (const name of [HN_TAB, HN_TEST_TAB]) { assert.deepEqual(json(h.rows(name)), [HN_HEADERS]); assert.equal(h.book.getSheetByName(name).protections.length, 1); }
  const everything = JSON.stringify([...h.book.sheets.values()].filter((s: any) => s.name !== '設定').map((s: any) => s.rows));
  assert.ok(!/誓約/.test(everything), '誓約の語は、設定タブのほかには出ない');
});

test('golden ping: 鍵の並びは足す前のとおり。誓約書の鍵は1つも無い。ready=false のときも同じ', () => {
  const h = harness(); h.ready();
  assert.deepEqual(Object.keys(ping(h)), PING_BASE);
  h.call('openEntries'); assert.deepEqual(Object.keys(ping(h)), PING_BASE);
  const all = harness(); all.ready({ クラス分け: 'あり', 階級分け: 'あり', ロゴ: 'あり', 花道の追加情報: 'あり' }); all.call('openEntries');
  assert.deepEqual(Object.keys(ping(all)), PING_ALL_ON);
  for (const body of [ping(h), ping(all)]) assert.ok(!/pledge|guardianMode|gymMode|誓約/.test(JSON.stringify(body)), '誓約書の印はどこにも無い');
  const fresh = harness(); fresh.call('onOpen');
  assert.deepEqual(Object.keys(ping(fresh)), ['app', 'protocol', 'build', 'ready', 'accepting']);
});

test('golden 保存: 申込原本（21列）・OS取込用（14列）の値は足す前のとおり。花道の鍵と並んでも変わらない。タブも増えない。同じ受付番号の再送で行は増えない', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' }); h.call('openEntries');
  const p = h.params('live', { division: '中学生男子', weightClass: '37kg以下' });
  const receipt = h.call('saveEntry_', p);
  const row = json(h.rows(PRIVATE).at(-1)), os = json(h.rows(OS).at(-1));
  assert.equal(row.length, 21); assert.equal(os.length, 14);
  assert.equal(row[0], receipt); assert.equal(row[2], h.eventId());
  assert.deepEqual([...row.slice(3, 12), ...row.slice(13)], ['架空ジム', '架空選手', '中3', '20', '170', '65', '初試合', 'がんばります', '', 'テスト太郎', '09000000000', 'test@example.com', 'yes', p.requestId, '', '中学生男子', '37kg以下']);
  assert.match(row[12], /^https:\/\/drive\.google\.com\/file\/d\/res\d+\/view$/);
  assert.deepEqual([os[0], ...os.slice(1, 10), ...os.slice(11)], [receipt, '架空ジム', '架空選手', '中3', '20', '170', '65', '初試合', 'がんばります', '', '', '中学生男子', '37kg以下']);
  assert.deepEqual([...h.book.sheets.keys()], FROZEN_SHEETS);
  assert.equal(h.call('saveEntry_', p), receipt); assert.equal(h.rows(PRIVATE).length, 2); assert.equal(h.rows(OS).length, 2);
  // 学年などを「なし」にしたシートでも、同じ道で保存できる
  const quiet = harness(); quiet.ready({ 学年: 'なし', 年齢: 'なし', 意気込み: 'なし' }); quiet.call('openEntries');
  const q = quiet.call('saveEntry_', quiet.params('live', { grade: '', age: '', comment: '' }));
  assert.deepEqual(json(quiet.rows(PRIVATE).at(-1)).slice(5, 7), ['', '']); assert.equal(json(quiet.rows(PRIVATE).at(-1))[0], q);
});

test('golden 保存: 失敗のコードと、結果の画面（✓ 緑／✕ 赤／⚠ 黄）は足す前のとおり。「送れませんでした」と言い切る一覧は同じ', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' }); h.call('openEntries');
  const cases: [string, (p: any) => void][] = [
    ['consent', (p) => { p.consent = 'no'; }], ['event', (p) => { p.eventId = 'tos-other'; }], ['input', (p) => { p.contactEmail = 'x'; }], ['weight', (p) => { p.division = ''; }], ['spam', (p) => { p.website = 'x'; }],
  ];
  for (const [code, change] of cases) {
    const p = h.params('live', { division: '中学生男子', weightClass: '37kg以下' }); change(p);
    let error: any; try { h.call('saveEntry_', p); } catch (e) { error = e; }
    assert.equal(error?.code, code); assert.match(html(h, p), /✕ 送れませんでした/);
  }
  assert.match(html(h, h.params('live', { division: '中学生男子', weightClass: '37kg以下' })), /✓ 申し込みが完了しました/);
  const notSaved = /\['input','event','spam','consent','class','weight','hanamichi','closed','capacity','setup','headers','missing','sharing','owner','folder'(?:,'[a-z]+')*\]\.indexOf\(error\.code\)/;
  assert.match(script, notSaved, '「送れませんでした」と言い切るコードの一覧（足してよいのは、後ろに足すだけ）');
  assert.equal(NOT_SAVED_CODES.length, 15);
  for (const code of NOT_SAVED_CODES) {
    const page = String(h.call('resultPage_', '', 'x', { code, message: 'x', retryable: false }, h.params('live')).html);
    assert.match(page, /✕ 送れませんでした/, code); assert.match(page, /border:4px solid #b91c1c/, code + '：赤');
  }
  const unsure = String(h.call('resultPage_', '', 'x', { code: 'storage', message: 'x', retryable: false }, h.params('live')).html);
  assert.match(unsure, /⚠ 保存結果の確認が必要です/);
});

test('golden 再送フォーム（結果の画面の隠し項目）: 鍵の一覧は足す前のとおり。花道のときだけ12個が後ろに付く。誓約書の鍵は足さない', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' }); h.call('openEntries');
  const keys = (hh: H, params: any) => [...String(hh.call('resultPage_', '', 'まだ保存を確認できません', { retryable: true }, params).html).matchAll(/<input type="hidden" name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys(h, h.params('live', { division: '花道・男子（40歳以上）', hnRing: '架空リング' })), RETRY_FIELDS);
  const hn = harness(); hn.ready({ 階級分け: 'あり', 花道の追加情報: 'あり' });
  assert.deepEqual(keys(hn, hn.params('live', { division: '花道・男子（40歳以上）', weightClass: '-70', ...HN })), [...RETRY_FIELDS, ...HN_KEYS]);
  assert.deepEqual(keys(hn, hn.params('live', { division: '中学生男子', weightClass: '-37', ...HN })), RETRY_FIELDS);
});

test('golden 古いシート（誓約書の行が無い）: 受付も ping も自動テストも、足す前と同じに動く。「① 最初の設定」を押しても、増えるのは設定の行だけ', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' }); oldSheet(h);
  assert.deepEqual(Object.keys(ping(h)), [...PING_BASE, 'weightMode', 'weights']);
  assert.equal(ping(h).settingsProblem, '');
  h.call('openEntries');
  const p = h.params('live', { division: '花道・男子（40歳以上）', weightClass: '-70' });
  const receipt = h.call('saveEntry_', p);
  assert.equal(json(h.rows(PRIVATE).at(-1))[0], receipt);
  h.call('setupTournament');
  assert.deepEqual([...h.book.sheets.keys()], FROZEN_SHEETS);
  assert.equal(ping(h).settingsProblem, '');
  assert.equal(h.call('statusInfo_').testComplete, true);
});

test('golden 設定の直しもの: 初期のまま（会場などを埋めた）なら問題なし。花道の直しものの文は同じ。クラス・階級の直しものの文と並びも同じ', () => {
  const h = harness(); h.ready();
  assert.equal((h.call('settingsProblems_', h.call('S_')) as string[]).length, 0);
  const bad = harness(); bad.ready({ 階級分け: 'あり' }); bad.setSetting('階級分け', 'たぶん'); bad.setSetting('会場', '');
  assert.deepEqual(json(bad.call('settingsProblems_', bad.call('S_'))), ['「設定」タブの、次の欄を入れてください：会場', '「階級分け」は、あり／なしのどれかにしてください']);
  const hn = harness(); hn.ready({ 階級分け: 'なし' }); hn.setSetting('花道の追加情報', 'あり');
  assert.deepEqual(json(hn.call('settingsProblems_', hn.call('S_'))), ['「花道の追加情報」が「あり」ですが、選べる区分に「花道」の入った名前がありません（「階級分け」を「あり」にして、区分の名前に「花道」を入れるか、A列が「花道の追加情報」の行のB列を「なし」にしてください）']);
});

test('golden 申込リンク: 誓約書なしのリンクは1字も変わらない（pl で始まる鍵は無い）。昔のリンクは切れていない。hn=on の位置も同じ', () => {
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec';
  const cfg: PublicEntryConfig = { endpoint: ENDPOINT, eventId: 'test-cup', title: '架空大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '連絡先', music: true, grade: 'optional', age: 'optional', comment: 'optional', protocol: '3', mode: 'live' };
  const HEAD = '#endpoint=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FAKfycbyTEST_ONLY%2Fexec&eventId=test-cup&title=%E6%9E%B6%E7%A9%BA%E5%A4%A7%E4%BC%9A&organizer=%E6%9E%B6%E7%A9%BA%E4%B8%BB%E5%82%AC&date=2027%E5%B9%B410%E6%9C%883%E6%97%A5&venue=%E6%9E%B6%E7%A9%BA%E4%BD%93%E8%82%B2%E9%A4%A8&venueUrl=&deadline=2099-11-30&contact=%E9%80%A3%E7%B5%A1%E5%85%88&music=on&grade=optional&age=optional&comment=optional';
  const golden = {
    plain: [cfg, HEAD + '&protocol=3&mode=live&end=1'],
    weights: [{ ...cfg, weights: DEFAULT_WEIGHT_SETTINGS, logo: true }, HEAD + '&wc=on&logo=on&protocol=3&mode=live&end=1'],
    classes: [{ ...cfg, classes: DEFAULT_CLASS_SETTINGS }, HEAD + '&cls=on&protocol=3&mode=live&end=1'],
    all: [{ ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true, mode: 'test' }, HEAD + '&cls=on&wc=on&logo=on&hn=on&protocol=3&mode=test&end=1'],
  } as Record<string, [PublicEntryConfig, string]>;
  for (const [name, [config, expected]] of Object.entries(golden)) {
    assert.equal(publicEntryHash(config), expected, name);
    assert.ok(!/[#&]pl[a-z]?=|pledge/.test(expected), name + '：誓約書の鍵は無い');
    assert.equal(publicEntryLinkCut(expected), false, name + '：完全なリンクは切れていない');
    assert.equal(publicEntryReady(publicEntryConfig(expected)), true, name);
    assert.equal('pledge' in publicEntryConfig(expected), false, name + '：読んだ設定に誓約書の項目は無い');
  }
  // 昔のリンク（end も無い）は、切れていない
  assert.equal(publicEntryLinkCut(golden.plain[1].replace(/&end=1$/, '')), false);
  assert.equal(publicEntryLinkCut(golden.all[1].replace(/&end=1$/, '')), true, '鍵があって end が無いのは、切れている');
  assert.equal(publicEntryLinkCut(''), false); assert.equal(publicEntryLinkCut('#'), false);
  assert.equal(publicEntryConfig(golden.plain[1] + '&unknown=1').title, '架空大会', '知らない項目は無視');
});

test('golden 申し込みページが送る鍵（photoDataUrl まで）は、足す前の並びのまま。そのあとに付くのは「...(…)」の足し込みだけ。再送フォームの鍵と同じ顔ぶれ', () => {
  const src = readFileSync(new URL('../app/apply/page.tsx', import.meta.url), 'utf8');
  const open = src.indexOf('Object.entries({ protocol:');
  assert.ok(open >= 0, 'フォームの隠し項目の作り');
  let depth = 0, top = '', quote = '', i = src.indexOf('{', open);
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{' || c === '(' || c === '[') { if (depth === 1) top += c; depth++; continue; }
    if (c === '}' || c === ')' || c === ']') { depth--; if (depth === 0) break; if (depth === 1) top += c; continue; }
    if (depth === 1) top += c;
  }
  const tokens = [...top.matchAll(/(?:^|,)\s*(?:([A-Za-z]\w*)\s*(?=[:,])|(\.\.\.)\s*(?=[(A-Za-z]))/g)].map((m) => m[1] || '...');
  const at = tokens.indexOf('photoDataUrl');
  assert.deepEqual(tokens.slice(0, at + 1), PAGE_POST_KEYS);
  assert.ok(tokens.slice(at + 1).every((t) => t === '...'), 'photoDataUrl のあとは、足し込み（花道・誓約書）だけ: ' + tokens.slice(at + 1).join());
  const keys = tokens.slice(0, at + 1).filter((k) => k !== '...' && k !== 'website').concat(['division', 'weightClass']);
  assert.deepEqual([...keys].sort(), [...RETRY_FIELDS].sort());
  assert.ok(script.includes("const fields=['protocol','eventId','entryKey','mode','requestId','gym','name','grade','age','height','weight','record','comment','musicUrl','contactName','contactPhone','contactEmail','consent','fighterClass','division','weightClass','photoDataUrl'];"), '.gs の再送の鍵の一覧');
});

test('golden core/setupV3: 版の一覧・pingの読み方・申し込みページへ渡す設定の鍵は、足す前のとおり（「なし」の読み取りに、誓約書の鍵は増えない）', () => {
  assert.deepEqual([...ACCEPTED_RECEPTION_BUILDS], ['3.20261004.4', '3.20261010.5', '3.20261019.6', '3.20261022.7', '3.20261024.1']);
  assert.equal(EXPECTED_RECEPTION_BUILD, '3.20261024.1');
  const base = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: true, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: 'テスト大会', date: '2099-12-01', venue: '体育館', venueUrl: '', organizer: '主催ジム', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
  const parsed = parsePing(base);
  assert.deepEqual(Object.keys(parsed), ['app', 'protocol', 'build', 'ready', 'accepting', 'eventId', 'testComplete', 'settingsProblem', 'storageProblem', 'title', 'date', 'venue', 'venueUrl', 'organizer', 'contact', 'deadline', 'music', 'grade', 'age', 'comment', 'error', 'classMode', 'classes', 'classRows', 'weightMode', 'weights', 'weightRows', 'logo', 'errorTab', 'errorCell', 'errorExpected', 'errorInserted', 'errorRowGone', 'closedBy']);
  assert.equal(diagnose(parsed).stage, 'ready');
  const config = entryConfigFromPing(parsed, ENDPOINT_FOR_CONFIG, 'live');
  assert.deepEqual(Object.keys(config), ['endpoint', 'protocol', 'mode', 'eventId', 'title', 'organizer', 'date', 'venue', 'venueUrl', 'deadline', 'contact', 'music', 'grade', 'age', 'comment', 'recordDetail']);
  // 花道の印（hanamichiMode: true）だけは、来たときに鍵が1つ増える（足す前から）。誓約書の印は、「なし」では増えない
  const keys = Object.keys(parsed), withHn = Object.keys(parsePing({ ...base, hanamichiMode: true }));
  assert.deepEqual(withHn, [...keys.slice(0, keys.indexOf('logo') + 1), 'hanamichiMode', ...keys.slice(keys.indexOf('logo') + 1)], 'hanamichiMode は logo のあと');
  // 知らない鍵（誓約書のモードなど）が来ても、「なし」の読み取りには出ない。偽・文字・数は受け取らない
  for (const key of ['pledgeMode', 'hanamichiMode']) for (const value of [false, 'on', 1, null]) assert.equal(key in parsePing({ ...base, [key]: value }), false, key + ' ' + String(value));
});
