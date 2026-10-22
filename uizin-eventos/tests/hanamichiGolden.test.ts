// 「花道の追加情報」＝なし（初期値・古いシート・古いリンク）のとき、これまでと1つも変わらないことを固定する試験。
// 花道の機能を足す前の動きから書き起こした（足す前のコードで、先に通した）。ここが赤くなったら、「なし」の動きを変えてしまっている。
// 足してよいのは、「設定」タブのいちばん下の1行（花道の追加情報）と、その▼だけ（ADDED_SETTING_ROWS）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { harness, script } from './helpers/gasV3Harness.ts';
import { ACCEPTED_RECEPTION_BUILDS, diagnose, entryConfigFromPing, EXPECTED_RECEPTION_BUILD, parsePing, supportsWeightClasses } from '../core/setupV3.ts';

const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', TEST_OS = 'テストOS取込用';
/** 足す前の「設定」タブの行（29行）。この並びも、B21（階級分け）・B22（ロゴ）の位置も動かさない */
const FROZEN_LABELS = ['大会名', '開催日', '会場', '会場の地図URL', '主催者名', '問い合わせ先', '申込締切', '入場曲', '学年', '年齢', '意気込み', 'クラス分け', '上のクラスの名前', '上のクラスの条件', '上のクラスのルール', '下のクラスの名前', '下のクラスの条件', '下のクラスのルール', '上のクラスにする勝ち数', '階級分け', 'ロゴ',
  '階級：小学生以下', '階級：中学生女子', '階級：中学生男子', '階級：高校生・一般女子', '階級：高校生・一般男子', '階級：花道・女子（40歳以上）', '階級：花道・男子（40歳以上）'];
const FROZEN_VALUES = ['', '', '', '', '', '', '', '', '必須', '必須', '必須', 'なし', 'Aクラス', '3勝以上（3勝以下でも、会長・指導者の許可があればAクラスに出られます）', '首相撲5秒／蹴り足キャッチはワンアタック（キャッチ後に1回だけ攻撃できる）／ワンマッチは顔面への膝蹴り禁止', 'Bクラス', 'アマチュア。2勝以下（例：初出場、2勝1敗、1勝3敗）', '首相撲なし／蹴り足キャッチなし／膝蹴りなし／回転技なし', '3', 'なし', 'なし',
  'なし', '-37、-40、-43、-46、-49、-52、-55、-58', '-37、-40、-43、-46、-49、-52、-55、-58', '-40、-43、-46、-50、-53、-56、-59、-62、-65', '-50、-53、-56、-59、-62、-65、-68、-71、-74、-77、-80、-85、無差別', '-40、-45、-50、-55、-60、+60', '-55、-60、-65、-70、-75、-80、-85、無差別'];
/** 説明（C列）29行ぶんの SHA-256。文を直したときは、直してよいか確かめてから、この値を新しくする */
const FROZEN_DESCRIPTION_SHA = '28f1adb7fda44e2d8bae2f4979ffa310627fabc917144f5515d8a373ef530bf7';
/** 足してよい行。足す前は空 []。花道の追加情報を足したので、この1行だけ（それ以外の差は、赤くなる） */
const ADDED_SETTING_ROWS: string[] = ['花道の追加情報'];
const FROZEN_SHEETS = ['シート1', '設定', PRIVATE, OS, TEST, TEST_OS];
const PRIVATE_HEADERS = ['受付番号', '申込日時', '大会ID', '所属ジム', '選手名', '学年', '年齢', '身長', '体重', '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）', '顔写真URL', '連絡先氏名', '連絡先電話番号', '連絡先メールアドレス', '同意', 'リクエストID', 'クラス', '区分', '階級'];
const OS_HEADERS = ['管理番号', 'ジム名', '選手名', '学年', '年齢', '身長', '体重', '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）', '顔写真URL', 'クラス', '区分', '階級'];
const FROZEN_PROPS = ['spreadsheetId', 'ownerEmail', 'eventId', 'accepting', 'photoFolderId', 'testFolderId', 'rateMinute', 'rateCount', 'lastTestBuild', 'lastTestRequest'];
const PING_BASE = ['app', 'protocol', 'build', 'ready', 'accepting', 'eventId', 'testComplete', 'settingsProblem', 'storageProblem', 'title', 'date', 'venue', 'venueUrl', 'organizer', 'contact', 'deadline', 'music', 'grade', 'age', 'comment'];
const PING_ALL_ON = [...PING_BASE, 'logo', 'weightMode', 'weights', 'classMode', 'classes'];
const RETRY_FIELDS = ['protocol', 'eventId', 'entryKey', 'mode', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'fighterClass', 'division', 'weightClass', 'photoDataUrl'];
/** 申し込みページが送る鍵（photoDataUrl まで）。'...' は階級分けのときだけ足す division・weightClass */
const PAGE_POST_KEYS = ['protocol', 'entryKey', 'mode', 'website', 'eventId', 'requestId', 'gym', 'name', 'grade', 'age', 'height', 'weight', 'record', 'fighterClass', '...', 'comment', 'musicUrl', 'contactName', 'contactPhone', 'contactEmail', 'consent', 'photoDataUrl'];

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const ping = (h: ReturnType<typeof harness>) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
const html = (h: ReturnType<typeof harness>, params: any): string => String(h.call('doPost', { parameter: params }).html);
const without = (h: ReturnType<typeof harness>, key: string) => { const rows = h.settingsSheet().rows; const i = rows.findIndex((r: any[]) => r[0] === key); if (i >= 0) rows.splice(i, 1); };
/** 「古いシート」＝花道の行が無いシート。足す前のコードでは、何もしない */
const oldSheet = (h: ReturnType<typeof harness>) => without(h, '花道の追加情報');

test('golden 設定タブ: 足す前の29行の並び・初期値・説明は1字も変わらない。B21=階級分け・B22=ロゴ。足してよいのは下の行だけ', () => {
  const h = harness(); h.call('onOpen');
  const rows = h.rows('設定'), labels = rows.slice(1).map((r) => r[0]);
  assert.equal(FROZEN_LABELS.length, 29 - 1, '行の数（見出しをのぞく）');
  assert.deepEqual(json(labels.slice(0, FROZEN_LABELS.length)), FROZEN_LABELS);
  assert.deepEqual(json(labels.slice(FROZEN_LABELS.length)), ADDED_SETTING_ROWS, '足した行は、いちばん下だけ');
  assert.deepEqual(json(rows.slice(1, 1 + FROZEN_VALUES.length).map((r) => r[1])), FROZEN_VALUES);
  assert.equal(sha(json(rows.slice(1, 1 + FROZEN_LABELS.length).map((r) => r[2]))), FROZEN_DESCRIPTION_SHA);
  assert.equal(labels.indexOf('階級分け') + 2, 21, 'B21'); assert.equal(labels.indexOf('ロゴ') + 2, 22, 'B22');
  assert.equal(labels.indexOf('クラス分け') + 2, 13, 'B13');
  for (const r of rows) assert.equal(r.length, 3, '項目・値・説明');
  assert.deepEqual(json(rows[0]), ['項目', '値（ここに入れる）', '説明']);
});

test('golden 設定タブ: ▼の欄・色・列の幅・固定行は、足す前のとおり（足してよいのは下の行の▼だけ）', () => {
  const h = harness(); h.call('onOpen');
  const sheet = h.settingsSheet();
  const entries = [...sheet.validations.entries()].map(([k, v]: [string, any]) => [k, json(v.list), v.allowInvalid]);
  const frozen = [['9:2', ['あり', 'なし'], false], ['10:2', ['必須', '任意', 'なし'], false], ['11:2', ['必須', '任意', 'なし'], false], ['12:2', ['必須', '任意', 'なし'], false], ['13:2', ['なし', 'あり'], false], ['21:2', ['なし', 'あり'], false], ['22:2', ['なし', 'あり'], false]];
  assert.deepEqual(entries.slice(0, frozen.length), frozen);
  assert.equal(entries.length, frozen.length + ADDED_SETTING_ROWS.length, '▼の欄は、足した行ぶんだけ増える');
  assert.deepEqual(json([...sheet.backgrounds.entries()]), [['2:2', '#fff2a8'], ['3:2', '#fff2a8'], ['4:2', '#fff2a8'], ['6:2', '#fff2a8'], ['7:2', '#fff2a8'], ['8:2', '#fff2a8'], ['9:2', '#fff2a8']], '会長が必ず書く7つの色');
  assert.deepEqual(json([...sheet.columnWidths.entries()]), [[1, 160], [2, 380], [3, 520]]); assert.equal(sheet.frozenRows, 1);
});

test('golden 「① 最初の設定」: 作るタブは4つだけ（申込原本・OS取込用・テスト申込・テストOS取込用）。見出しの保護・ping・プロパティの鍵も同じ', () => {
  const h = harness(); h.ready();
  assert.deepEqual([...h.book.sheets.keys()], FROZEN_SHEETS, 'シート1・設定・4つの表。花道のタブは作らない');
  assert.deepEqual(json(h.rows(PRIVATE)[0]), PRIVATE_HEADERS); assert.deepEqual(json(h.rows(OS)[0]), OS_HEADERS);
  assert.deepEqual(json(h.rows(TEST)[0]), PRIVATE_HEADERS); assert.deepEqual(json(h.rows(TEST_OS)[0]), OS_HEADERS);
  for (const name of [PRIVATE, OS, TEST, TEST_OS]) assert.equal(h.book.getSheetByName(name).protections.length, 1, name + ' の見出しは保護される');
  assert.equal(h.rows(PRIVATE).length, 1, '本番の表は見出しだけ'); assert.equal(h.rows(TEST).length, 2, 'テストは自動テストの1件');
  assert.deepEqual([...h.props.keys()], FROZEN_PROPS);
  // もう一度押しても、同じ（タブも行も増えない）
  h.call('setupTournament');
  assert.deepEqual([...h.book.sheets.keys()], FROZEN_SHEETS); assert.equal(h.rows(TEST).length, 2);
  h.call('openEntries'); assert.deepEqual([...h.props.keys()], [...FROZEN_PROPS, 'everOpened']);
});

test('golden ping: 鍵の並びは足す前のとおり。花道の鍵は1つも無い（個人情報・項目名も無い）', () => {
  const h = harness(); h.ready();
  assert.deepEqual(Object.keys(ping(h)), PING_BASE);
  h.call('openEntries'); assert.deepEqual(Object.keys(ping(h)), PING_BASE);
  const all = harness(); all.ready({ クラス分け: 'あり', 階級分け: 'あり', ロゴ: 'あり' }); all.call('openEntries');
  assert.deepEqual(Object.keys(ping(all)), PING_ALL_ON);
  for (const body of [ping(h), ping(all)]) assert.ok(!/hanamichi|花道プロフィール|hn[A-Z]/.test(JSON.stringify(body)), '花道の印はどこにも無い');
  // ready=false（まだ最初の設定をしていない）のとき
  const fresh = harness(); fresh.call('onOpen');
  assert.deepEqual(Object.keys(ping(fresh)), ['app', 'protocol', 'build', 'ready', 'accepting']);
});

test('golden 保存: 申込原本（21列）・OS取込用（14列）の値は足す前のとおり。花道の鍵を送っても、捨てて、エラーにしない。タブも増えない', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' }); h.call('openEntries');
  const p = h.params('live', { division: '中学生男子', weightClass: '37kg以下', hnRing: '架空リング', hnBirth: '1980-01-01', hnJob: '架空の職業', hnMessage: '架空のメッセージ' });
  const receipt = h.call('saveEntry_', p);
  const row = json(h.rows(PRIVATE).at(-1)), os = json(h.rows(OS).at(-1));
  assert.equal(row.length, 21); assert.equal(os.length, 14);
  assert.equal(row[0], receipt); assert.equal(row[2], h.eventId());
  assert.deepEqual([...row.slice(3, 12), ...row.slice(13)], ['架空ジム', '架空選手', '中3', '20', '170', '65', '初試合', 'がんばります', '', 'テスト太郎', '09000000000', 'test@example.com', 'yes', p.requestId, '', '中学生男子', '37kg以下']);
  assert.match(row[12], /^https:\/\/drive\.google\.com\/file\/d\/res\d+\/view$/);
  assert.deepEqual([os[0], ...os.slice(1, 10), ...os.slice(11)], [receipt, '架空ジム', '架空選手', '中3', '20', '170', '65', '初試合', 'がんばります', '', '', '中学生男子', '37kg以下']);
  assert.deepEqual([...h.book.sheets.keys()], FROZEN_SHEETS, '花道のタブは作らない');
  const text = JSON.stringify([...h.book.sheets.values()].map((s: any) => s.rows));
  for (const secret of ['架空リング', '1980-01-01', '架空の職業', '架空のメッセージ']) assert.ok(!text.includes(secret), '捨てた値は、どの表にも残らない: ' + secret);
  // 同じ受付番号の再送でも、行は増えない
  assert.equal(h.call('saveEntry_', p), receipt); assert.equal(h.rows(PRIVATE).length, 2); assert.equal(h.rows(OS).length, 2);
});

test('golden 保存: 区分に「花道」が入る区分を選んでも、「なし」のときは、花道の鍵を求めない（足りなくても通る）', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' }); h.call('openEntries');
  const p = h.params('live', { division: '花道・男子（40歳以上）', weightClass: '-70' });
  const receipt = h.call('saveEntry_', p);
  assert.equal(json(h.rows(PRIVATE).at(-1))[19], '花道・男子（40歳以上）'); assert.equal(json(h.rows(PRIVATE).at(-1))[0], receipt);
  assert.deepEqual([...h.book.sheets.keys()], FROZEN_SHEETS);
  // 結果の画面も、これまでと同じ（成功は緑の ✓）
  const page = html(h, h.params('live', { division: '花道・男子（40歳以上）', weightClass: '-70' }));
  assert.match(page, /✓ 申し込みが完了しました/);
});

test('golden 再送フォーム（結果の画面の隠し項目）: 鍵の一覧は足す前のとおり。花道の鍵は足さない', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' }); h.call('openEntries');
  const page = String(h.call('resultPage_', '', 'まだ保存を確認できません', { retryable: true }, h.params('live', { division: '花道・男子（40歳以上）', hnRing: '架空リング' })).html);
  assert.deepEqual([...page.matchAll(/<input type="hidden" name="([^"]+)"/g)].map((m) => m[1]), RETRY_FIELDS);
  assert.ok(!page.includes('架空リング'));
});

test('golden 古いシート（花道の行が無い）: 受付も ping も自動テストも、足す前と同じに動く。「① 最初の設定」を押しても花道のタブは作らない', () => {
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
});

test('golden 申し込みページが送る鍵（photoDataUrl まで）は、足す前の並びのまま。再送フォームの鍵と同じ顔ぶれ', () => {
  const src = readFileSync(new URL('../app/apply/page.tsx', import.meta.url), 'utf8');
  const open = src.indexOf('Object.entries({ protocol:');
  assert.ok(open >= 0, 'フォームの隠し項目の作り');
  // 先頭の { から、対応する } までの、いちばん外側（深さ1）だけを取り出す
  let depth = 0, top = '', quote = '', i = src.indexOf('{', open);
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{' || c === '(' || c === '[') { if (depth === 1) top += c; depth++; continue; }
    if (c === '}' || c === ')' || c === ']') { depth--; if (depth === 0) break; if (depth === 1) top += c; continue; }
    if (depth === 1) top += c;
  }
  // 鍵（名前: …）と、名前だけの書き方（requestId,）と、「...(」で始まる足し込み
  const tokens = [...top.matchAll(/(?:^|,)\s*(?:([A-Za-z]\w*)\s*(?=[:,])|(\.\.\.)\s*(?=\())/g)].map((m) => m[1] || '...');
  const upTo = tokens.slice(0, tokens.indexOf('photoDataUrl') + 1);
  assert.deepEqual(upTo, PAGE_POST_KEYS);
  // 再送フォームの鍵は、ページが送る鍵から website を除いたもの（顔ぶれが同じ）
  const keys = upTo.filter((k) => k !== '...' && k !== 'website').concat(['division', 'weightClass']);
  assert.deepEqual([...keys].sort(), [...RETRY_FIELDS].sort());
  assert.ok(script.includes("const fields=['protocol','eventId','entryKey','mode','requestId','gym','name','grade','age','height','weight','record','comment','musicUrl','contactName','contactPhone','contactEmail','consent','fighterClass','division','weightClass','photoDataUrl'];"), '.gs の再送の鍵の一覧');
});

test('golden core/setupV3: 版の一覧・pingの読み方・申し込みページへ渡す設定の鍵は、足す前のとおり（「なし」の読み取りに、花道の鍵は増えない）', () => {
  assert.deepEqual([...ACCEPTED_RECEPTION_BUILDS].slice(0, 3), ['3.20261004.4', '3.20261010.5', '3.20261019.6']);
  assert.ok((ACCEPTED_RECEPTION_BUILDS as readonly string[]).includes(EXPECTED_RECEPTION_BUILD));
  for (const build of ['3.20261019.6', EXPECTED_RECEPTION_BUILD]) assert.equal(supportsWeightClasses({ build }), true, build);
  for (const build of ['3.20261004.4', '3.20261010.5', '', '3.0.0', '9.9.9']) assert.equal(supportsWeightClasses({ build }), false, build);
  assert.equal(supportsWeightClasses(null), false); assert.equal(supportsWeightClasses(undefined), false);
  const base = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: true, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: 'テスト大会', date: '2099-12-01', venue: '体育館', venueUrl: '', organizer: '主催ジム', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
  const parsed = parsePing(base);
  assert.deepEqual(Object.keys(parsed), ['app', 'protocol', 'build', 'ready', 'accepting', 'eventId', 'testComplete', 'settingsProblem', 'storageProblem', 'title', 'date', 'venue', 'venueUrl', 'organizer', 'contact', 'deadline', 'music', 'grade', 'age', 'comment', 'error', 'classMode', 'classes', 'classRows', 'weightMode', 'weights', 'weightRows', 'logo', 'errorTab', 'errorCell', 'errorExpected', 'errorInserted', 'errorRowGone', 'closedBy']);
  assert.equal(diagnose(parsed).stage, 'ready');
  const config = entryConfigFromPing(parsed, 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec', 'live');
  assert.deepEqual(Object.keys(config), ['endpoint', 'protocol', 'mode', 'eventId', 'title', 'organizer', 'date', 'venue', 'venueUrl', 'deadline', 'contact', 'music', 'grade', 'age', 'comment']);
  // 知らない鍵（花道のモードなど）が来ても、「なし」の読み取りには出ない
  assert.equal('hanamichiMode' in parsePing({ ...base, hanamichiMode: false }), false);
  assert.equal('hanamichiMode' in parsePing({ ...base, hanamichiMode: 'on' }), false);
});
