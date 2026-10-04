import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';

const owner = 'organizer@example.com';
const script = readFileSync(new URL('../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8');
const JPEG = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);

type Opts = { ignoreTextFormat?: boolean };

function harness(opts: Opts = {}) {
  const props = new Map<string, string>(), resources = new Map<string, any>(), logs: string[] = [], zips: any[] = [];
  let currentOwner = owner, serial = 0, menu: string[] = [];
  const iterator = (array: any[]) => { let i = 0; return { hasNext: () => i < array.length, next: () => array[i++] }; };
  const blob = (bytes: any, type: string, name: string) => ({ bytes: typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes), type, name, getBytes() { return [...this.bytes]; }, setName(v: string) { this.name = v; return this; } });
  function resource(kind: string, name: string, data?: any): any {
    const id = 'res' + (++serial);
    const r: any = { kind, name, id, children: [] as any[], data, sharing: 'PRIVATE', editors: [] as any[], viewers: [] as any[], trashed: false,
      getId: () => id, getOwner: () => ({ getEmail: () => owner }), getSharingAccess: () => r.sharing, getEditors: () => r.editors, getViewers: () => r.viewers, isTrashed: () => r.trashed,
      getUrl: () => (kind === 'folder' ? 'https://drive.google.com/drive/folders/' : 'https://drive.google.com/file/d/') + id + '/view',
      getSize: () => r.data?.bytes?.length || 0, getBlob: () => blob(r.data.bytes, r.data.type, r.name),
      parents: [] as any[], getParents: () => iterator(r.parents),
      createFolder: (n: string) => { const c = resource('folder', n); c.parents.push(r); r.children.push(c); return c; },
      createFile: (v: any) => { const c = resource('file', v.name, v); c.parents.push(r); r.children.push(c); return c; },
      getFilesByName: (n: string) => iterator(r.children.filter((c: any) => c.kind === 'file' && c.name === n && !c.trashed)) };
    resources.set(id, r); return r;
  }
  function sheet(book: any, name: string): any {
    const formats = new Map<string, string>();
    const stored = (v: any, r: number, c: number, viaSetValue = false) => typeof v === 'string' && /^\d+(?:\.\d+)?$/.test(v) && (formats.get(r + ':' + c) !== '@' || (opts.ignoreTextFormat && !viaSetValue)) ? Number(v) : v;
    const s: any = { name, rows: [] as any[][],
      getLastRow: () => s.rows.length,
      appendRow: (values: any[]) => { const r = s.rows.length + 1; s.rows.push(values.map((v, c) => stored(v, r, c + 1))); },
      getDataRange: () => s.getRange(1, 1, s.rows.length, s.rows[0]?.length || 1),
      getRange: (r: number, c: number, n = 1, m = 1) => {
        const range: any = {
          getDisplayValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => String(s.rows[r - 1 + i]?.[c - 1 + j] ?? '').replace(/^'(?=[=+\-@])/u, ''))),
          getDisplayValue: () => range.getDisplayValues()[0][0],
          setValues: (values: any[][]) => { values.forEach((row, i) => { s.rows[r - 1 + i] ??= []; row.forEach((v, j) => { s.rows[r - 1 + i][c - 1 + j] = stored(v, r + i, c + j); }); }); return range; },
          setValue: (v: any) => { s.rows[r - 1] ??= []; s.rows[r - 1][c - 1] = stored(v, r, c, true); return range; },
          setNumberFormat: (f: string) => { for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) formats.set((r + i) + ':' + (c + j), f); return range; },
          setFontWeight: () => range };
        return range;
      } };
    book.sheets.set(name, s); return s;
  }
  const bookFile = resource('file', 'copy-of-template');
  const book: any = { sheets: new Map<string, any>(), getId: () => bookFile.id, getSheetByName: (n: string) => book.sheets.get(n) || null, insertSheet: (n: string) => sheet(book, n) };
  sheet(book, 'シート1');
  const propsApi = { getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => { props.set(k, String(v)); }, setProperties: (o: Record<string, string>) => { for (const [k, v] of Object.entries(o)) props.set(k, String(v)); } };
  const api: any = {
    Session: { getEffectiveUser: () => ({ getEmail: () => currentOwner }) },
    PropertiesService: { getScriptProperties: () => propsApi },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: (id: string) => { assert.equal(id, bookFile.id); return book; }, flush: () => undefined,
      getUi: () => ({ ButtonSet: { OK: 'OK' }, alert: () => undefined, createMenu: (t: string) => { const m: any = { addItem: (label: string) => { menu.push(label); return m; }, addToUi: () => undefined }; menu = [t]; return m; } }) },
    DriveApp: { Access: { PRIVATE: 'PRIVATE' }, createFolder: (n: string) => resource('folder', n), getFolderById: (id: string) => { const v = resources.get(id); if (!v) throw new Error('folder missing'); return v; }, getFileById: (id: string) => { const v = resources.get(id); if (!v) throw new Error('file missing'); return v; } },
    Utilities: { base64Decode: (v: string) => [...Buffer.from(v, 'base64')], newBlob: blob, Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_: any, v: string | number[]) => [...createHash('sha256').update(typeof v === 'string' ? v : Buffer.from(v)).digest()].map((b) => (b > 127 ? b - 256 : b)),
      zip: (files: any[], name: string) => { zips.push(files); return { bytes: Buffer.from('zip'), type: 'application/zip', name }; } },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST_ONLY/exec' }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
    HtmlService: { createHtmlOutput: (html: string) => ({ html, setTitle() { return this; }, addMetaTag() { return this; } }) },
    Logger: { log: (v: string) => logs.push(v) }, console: { error: () => undefined },
  };
  vm.createContext(api); vm.runInContext(script, api);
  const call = (name: string, ...args: any[]) => { vm.runInContext('SETTINGS_CACHE_ = null;', api); return api[name](...args); };
  const settingsSheet = () => book.getSheetByName('設定');
  const setSetting = (key: string, value: string) => { const row = settingsSheet().rows.findIndex((r: any[]) => r[0] === key); settingsSheet().rows[row][1] = value; };
  const fill = (over: Record<string, string> = {}) => { const v: Record<string, string> = { 大会ID: 'test-cup', 大会名: 'テスト大会', 申込締切: '2099-11-30', ...over }; for (const [k, val] of Object.entries(v)) setSetting(k, val); };
  const params = (mode = 'test', over: Record<string, string> = {}) => ({ protocol: '3', eventId: 'test-cup', mode, requestId: randomUUID(), gym: '架空ジム', name: '架空選手', grade: '', age: '20', height: '170', weight: '65', record: '初試合', comment: '', musicUrl: '', contactName: 'テスト太郎', contactPhone: '09000000000', contactEmail: 'test@example.com', consent: 'yes', website: '', photoDataUrl: 'data:image/jpeg;base64,' + JPEG.toString('base64'), ...over });
  // 会長の操作: 最初の設定 → 「設定」タブを埋める → もう一度「最初の設定」
  const ready = () => { assert.throws(() => call('setupTournament'), /設定|大会/); fill(); call('setupTournament'); };
  return { api, props, resources, book, logs, zips, call, params, fill, ready, setSetting, settingsSheet, menu: () => menu, setOwner: (v: string) => { currentOwner = v; }, rows: (n: string) => book.getSheetByName(n).rows as any[][] };
}

test('v3: 初回の設定は「設定」タブを作って止まり、埋めてから再実行すると申込表と写真フォルダができる', () => {
  const h = harness();
  assert.throws(() => h.call('setupTournament'), /大会ID/);
  assert.ok(h.settingsSheet(), '設定タブが作られる');
  h.fill();
  h.call('setupTournament');
  for (const n of ['申込原本（個人情報あり）', 'OS取込用（連絡先なし）', 'テスト申込', 'テストOS取込用']) assert.ok(h.book.getSheetByName(n), n);
  assert.ok(h.props.get('photoFolderId') && h.props.get('testFolderId'));
  assert.ok(h.logs.some((l) => l.includes('ウェブアプリ')));
});

test('v3: 何度「最初の設定」を押しても同じ表・フォルダを使い、既存データを消さない', () => {
  const h = harness(); h.ready(); h.call('saveEntry_', h.params());
  const keep = JSON.stringify([...h.props.entries()]), count = h.resources.size, row = JSON.stringify(h.rows('テスト申込'));
  h.call('setupTournament'); h.call('setupTournament');
  assert.equal(JSON.stringify([...h.props.entries()]), keep);
  assert.equal(h.resources.size, count);
  assert.equal(JSON.stringify(h.rows('テスト申込')), row);
});

test('v3: 実行者本人が自動で所有者になり、メールを入力させない。別のGoogleは止まる', () => {
  const h = harness(); h.ready();
  assert.equal(h.props.get('ownerEmail'), owner);
  assert.ok(!h.settingsSheet().rows.flat().some((v: any) => String(v).includes('@')), '設定タブにメールを書かせない');
  h.setOwner('other@example.com');
  assert.throws(() => h.call('saveEntry_', h.params()), /本人のGoogle/);
  assert.throws(() => h.call('setupTournament'), /本人のGoogle/);
});

test('v3: 設定が足りないときは、何を直すかを言って止まる', () => {
  const h = harness(); h.call('onOpen');
  assert.throws(() => h.call('setupTournament'), /大会ID/);
  h.setSetting('大会ID', 'ok-cup'); assert.throws(() => h.call('setupTournament'), /大会名/);
  h.setSetting('大会名', 'ある大会'); assert.throws(() => h.call('setupTournament'), /申込締切/);
  h.setSetting('申込締切', '2099-02-31'); assert.throws(() => h.call('setupTournament'), /申込締切/);
  h.setSetting('申込締切', '２０９９年１１月３０日'); h.call('setupTournament');
  assert.equal(h.call('statusInfo_').deadline, '2099-11-30');
});

test('v3: メニューは5つで、「設定」タブの書き換えだけで締切・項目が変わる（コードの貼り替え不要）', () => {
  const h = harness(); h.call('onOpen');
  assert.deepEqual(h.menu(), ['Tournament OS', '① 最初の設定', '② 受付を開始', '③ 受付を停止', '④ OS用の名簿ZIPを作る', '⑤ いまの状態を見る']);
  h.ready();
  h.setSetting('学年', '必須');
  assert.throws(() => h.call('saveEntry_', h.params('test', { grade: '' })), /入力内容/);
  h.call('saveEntry_', h.params('test', { grade: '小5' }));
  h.setSetting('学年', 'なし');
  h.call('saveEntry_', h.params('test'));
  assert.equal(h.rows('テスト申込').length, 3);
});

test('v3: ping は公開してよい項目だけを返し、メール・鍵・連絡先を返さない', () => {
  const h = harness();
  const before = JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
  assert.equal(before.ready, false); assert.equal(before.app, 'tournament-os');
  h.ready(); h.call('saveEntry_', h.params());
  const out = h.call('doGet', { parameter: { action: 'ping' } }).text, body = JSON.parse(out);
  assert.deepEqual(Object.keys(body).sort(), ['accepting', 'app', 'build', 'deadline', 'eventId', 'protocol', 'ready', 'testComplete']);
  assert.equal(body.testComplete, true); assert.equal(body.accepting, false);
  for (const secret of [owner, 'test@example.com', '09000000000', 'テスト太郎', h.props.get('spreadsheetId')!, h.props.get('photoFolderId')!]) assert.ok(!out.includes(secret), '漏れてはいけない: ' + secret);
  assert.match(String(h.call('doGet', {}).html), /保存先です/);
});

test('v3: 電話番号の先頭の0が残る。Googleが書式を無視しても書き直して残す', () => {
  for (const ignoreTextFormat of [false, true]) {
    const h = harness({ ignoreTextFormat }); h.ready();
    h.call('saveEntry_', h.params('test', { contactPhone: '09012345678' }));
    assert.equal(h.rows('テスト申込')[1][14], '09012345678', 'ignoreTextFormat=' + ignoreTextFormat);
    assert.equal(typeof h.rows('テスト申込')[1][14], 'string');
  }
});

test('v3: 連絡先は取込用シートにもZIPにも出ない', () => {
  const h = harness(); h.ready(); h.call('saveEntry_', h.params());
  const os = JSON.stringify(h.rows('テストOS取込用'));
  for (const secret of ['テスト太郎', 'test@example.com', '09000000000']) assert.ok(!os.includes(secret), secret);
  assert.ok(JSON.stringify(h.rows('テスト申込')).includes('09000000000'), '原本には残る');
  h.call('exportTestTournament');
  const csv = h.zips[0].find((f: any) => f.name === 'players.csv').bytes.toString('utf8');
  for (const secret of ['テスト太郎', 'test@example.com', '09000000000', owner]) assert.ok(!csv.includes(secret), secret);
  assert.ok(csv.includes('架空選手'));
});

test('v3: 本番の受付は、テスト1件が済み・受付開始・締切前のときだけ。テストは締切後でも通る', () => {
  const h = harness(); h.ready();
  assert.throws(() => h.call('openEntries'), /テスト申込/);
  h.call('saveEntry_', h.params('test'));
  assert.throws(() => h.call('saveEntry_', h.params('live')), /受け付けていません/);
  h.call('openEntries');
  h.call('saveEntry_', h.params('live'));
  assert.equal(h.rows('申込原本（個人情報あり）').length, 2);
  h.call('closeEntries');
  assert.throws(() => h.call('saveEntry_', h.params('live')), /受け付けていません/);
  h.setSetting('申込締切', '2000-01-01');
  h.call('closeEntries');
  assert.throws(() => h.call('openEntries'), /締切/);
});

test('v3: 同じ申込番号の再送は1件のまま、大会IDが違えば拒否し、旧プロトコル2も受ける', () => {
  const h = harness(); h.ready();
  const p = h.params('test'); const a = h.call('saveEntry_', p), b = h.call('saveEntry_', p);
  assert.equal(a, b); assert.equal(h.rows('テスト申込').length, 2);
  assert.throws(() => h.call('saveEntry_', h.params('test', { eventId: 'other-cup' })), /受付URL/);
  h.call('saveEntry_', h.params('test', { protocol: '2' }));
  assert.throws(() => h.call('saveEntry_', h.params('test', { protocol: '9' })), /受付URL/);
});

test('v3: 申込表・写真フォルダが公開共有・直接共有・削除済みなら受付を止める', () => {
  const h = harness(); h.ready();
  const folder = h.resources.get(h.props.get('photoFolderId')!)!;
  folder.sharing = 'ANYONE'; assert.throws(() => h.call('saveEntry_', h.params()), /共有/);
  folder.sharing = 'PRIVATE'; folder.viewers = [{ getEmail: () => 'x@example.com' }]; assert.throws(() => h.call('saveEntry_', h.params()), /共有/);
  folder.viewers = []; folder.trashed = true; assert.throws(() => h.call('saveEntry_', h.params()), /共有/);
});

test('v3: 数式になる文字は無害化し、写真が壊れていれば保存しない', () => {
  const h = harness(); h.ready();
  h.call('saveEntry_', h.params('test', { gym: '=HYPERLINK("x")' }));
  assert.ok(String(h.rows('テスト申込')[1][3]).startsWith("'="));
  const rowsBefore = h.rows('テスト申込').length;
  assert.throws(() => h.call('saveEntry_', h.params('test', { photoDataUrl: 'data:image/jpeg;base64,AAAA' })), /写真/);
  assert.equal(h.rows('テスト申込').length, rowsBefore);
});

test('v3: 新しいスクリプトに鍵・署名・確認コードの仕組みが残っていない', () => {
  for (const word of ['setupKey', 'entryKey:', 'testKey', 'TOS2', 'computeHmac', 'verifyConnection', 'expectedOwner', 'policy_']) assert.ok(!script.includes(word), word);
});
