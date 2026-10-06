import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, owner, script } from './helpers/gasV3Harness.ts';

test('v3: シートを開くと「設定」タブができ、空のまま「最初の設定」を押すと、足りない欄を全部言って止まる', () => {
  const h = harness();
  assert.equal(h.settingsSheet(), null);
  h.call('onOpen');
  assert.ok(h.settingsSheet(), '設定タブが自動でできる');
  assert.deepEqual(h.rows('設定').slice(1).map((r) => r[0]), ['大会名', '開催日', '会場', '会場の地図URL', '主催者名', '問い合わせ先', '申込締切', '入場曲', '学年', '年齢', '意気込み']);
  assert.ok(!h.rows('設定').flat().includes('大会ID'), '大会IDは会長が入れない');
  assert.throws(() => h.call('setupTournament'), /大会名、開催日、会場、主催者名、問い合わせ先、申込締切/);
  assert.equal(h.props.get('eventId'), undefined, '足りないあいだは何も作らない');
  assert.equal(h.resources.size, 1, 'フォルダも作らない（シート自身の1つだけ）');
});

test('v3: 設定を埋めて「最初の設定」を押すと、申込表・写真フォルダ・自動の大会IDができ、架空1件の自動テストまで済む', () => {
  const h = harness(); h.ready();
  for (const n of ['申込原本（個人情報あり）', 'OS取込用（連絡先なし）', 'テスト申込', 'テストOS取込用']) assert.ok(h.book.getSheetByName(n), n);
  assert.match(h.eventId(), /^tos-[0-9a-f]{10}$/);
  assert.equal(h.rows('テスト申込').length, 2, '自動テストの1件');
  assert.equal(h.rows('テスト申込')[1][4], '自動テスト選手');
  assert.equal(h.rows('申込原本（個人情報あり）').length, 1, '本番の表には入らない');
  assert.equal(h.call('statusInfo_').testComplete, true);
  assert.equal(h.call('statusInfo_').accepting, false);
  assert.ok(h.logs.some((l) => l.includes('ウェブアプリ')));
});

test('v3: 何度「最初の設定」を押しても同じ表・フォルダ・大会IDを使い、自動テストを増やさず、既存データを消さない', () => {
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
  assert.ok(!h.rows('設定').flat().some((v) => String(v).includes('@')), '設定タブにメールを書かせない');
  h.setOwner('other@example.com');
  assert.throws(() => h.call('saveEntry_', h.params()), /本人のGoogle/);
  assert.throws(() => h.call('setupTournament'), /本人のGoogle/);
});

test('v3: 設定の間違いは、どこをどう直すかを言って止まる（日付・順番・地図URL・選択肢）', () => {
  const cases: [Record<string, string>, RegExp][] = [
    [{ 開催日: '2099-02-31' }, /「開催日」は/],
    [{ 申込締切: 'あした' }, /「申込締切」は/],
    [{ 申込締切: '2099-12-02' }, /開催日と同じか、それより前/],
    [{ 会場の地図URL: 'https://example.com/map' }, /地図URL/],
    [{ 入場曲: 'はい' }, /「入場曲」は、あり／なし/],
    [{ 学年: '多い' }, /「学年」は、必須／任意／なし/],
  ];
  for (const [over, message] of cases) {
    const h = harness(); h.call('onOpen'); h.fill(over);
    assert.throws(() => h.call('setupTournament'), message, JSON.stringify(over));
    assert.equal(h.props.get('eventId'), undefined);
  }
  const ok = harness(); ok.call('onOpen'); ok.fill({ 開催日: '２０９９年１２月１日', 申込締切: '2099/11/30', 会場の地図URL: 'https://maps.app.goo.gl/abc' }); ok.call('setupTournament');
  assert.equal(ok.call('statusInfo_').date, '2099-12-01');
});

test('v3: メニューは5つ。「設定」タブの書き換えだけで締切・項目が変わる（コードの貼り替え不要）', () => {
  const h = harness(); h.call('onOpen');
  assert.deepEqual(h.menu(), ['Tournament OS', '① 最初の設定', '② 受付を開始', '③ 受付を停止', '④ OS用の名簿ZIPを作る', '⑤ いまの状態を見る']);
  h.ready();
  h.setSetting('学年', '必須');
  assert.throws(() => h.call('saveEntry_', h.params('test', { grade: '' })), /入力内容/);
  h.call('saveEntry_', h.params('test', { grade: '小5' }));
  h.setSetting('学年', 'なし');
  h.call('saveEntry_', h.params('test'));
  assert.equal(h.rows('テスト申込').length, 4);
});

test('v3: 入場曲「あり」でも自動テストは通る', () => {
  const h = harness(); h.ready({ 入場曲: 'あり', 学年: '必須', 年齢: '必須', 意気込み: '必須' });
  assert.equal(h.call('statusInfo_').testComplete, true);
  assert.equal(h.call('statusInfo_').music, true);
});

test('v3: ping は公開してよい項目だけ。大会の設定は返すが、メール・鍵・ID・連絡先は返さない', () => {
  const h = harness();
  const before = JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
  assert.equal(before.ready, false); assert.equal(before.app, 'tournament-os');
  assert.deepEqual(Object.keys(before).sort(), ['accepting', 'app', 'build', 'protocol', 'ready']);
  h.ready();
  const out = h.call('doGet', { parameter: { action: 'ping' } }).text, body = JSON.parse(out);
  assert.deepEqual(Object.keys(body).sort(), ['accepting', 'age', 'app', 'build', 'comment', 'contact', 'date', 'deadline', 'eventId', 'grade', 'music', 'organizer', 'protocol', 'ready', 'settingsProblem', 'storageProblem', 'testComplete', 'title', 'venue', 'venueUrl']);
  assert.equal(body.testComplete, true); assert.equal(body.accepting, false); assert.equal(body.title, 'テスト大会'); assert.equal(body.date, '2099-12-01'); assert.equal(body.deadline, '2099-11-30');
  for (const secret of [owner, 'selftest@example.invalid', 'test@example.com', '09000000000', 'テスト太郎', '自動テスト選手', h.props.get('spreadsheetId')!, h.props.get('photoFolderId')!, h.props.get('testFolderId')!]) assert.ok(!out.includes(secret), '漏れてはいけない: ' + secret);
  assert.match(String(h.call('doGet', {}).html), /保存先です/);
  h.setSetting('会場', '');
  const broken = JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
  assert.match(broken.settingsProblem, /会場/); assert.equal(broken.title, undefined, '直すまで設定は返さない');
});

test('v3: 電話番号の先頭の0が残る。Googleが書式を無視しても書き直して残す', () => {
  for (const ignoreTextFormat of [false, true]) {
    const h = harness({ ignoreTextFormat }); h.ready();
    h.call('saveEntry_', h.params('test', { contactPhone: '09012345678' }));
    const last = h.rows('テスト申込').at(-1)!;
    assert.equal(last[14], '09012345678', 'ignoreTextFormat=' + ignoreTextFormat);
    assert.equal(typeof last[14], 'string');
    assert.equal(h.rows('テスト申込')[1][14], '09000000000', '自動テストの電話も文字のまま');
  }
});

test('v3: 連絡先は取込用シートにもZIPにもpingにも出ない', () => {
  const h = harness(); h.ready(); h.call('saveEntry_', h.params());
  const os = JSON.stringify(h.rows('テストOS取込用'));
  for (const secret of ['テスト太郎', 'test@example.com', '09000000000', 'selftest@example.invalid']) assert.ok(!os.includes(secret), secret);
  assert.ok(JSON.stringify(h.rows('テスト申込')).includes('09000000000'), '原本には残る');
  h.call('exportTestTournament');
  const csv = h.zips[0].find((f: any) => f.name === 'players.csv').bytes.toString('utf8');
  for (const secret of ['テスト太郎', 'test@example.com', '09000000000', 'selftest@example.invalid', owner]) assert.ok(!csv.includes(secret), secret);
  assert.ok(csv.includes('架空選手'));
});

test('v3: 受付は、「② 受付を開始」から締切までだけ。テストを手で送らなくても開始できる', () => {
  const h = harness(); h.ready();
  assert.throws(() => h.call('saveEntry_', h.params('live')), /受け付けていません/);
  h.call('openEntries');
  h.call('saveEntry_', h.params('live'));
  assert.equal(h.rows('申込原本（個人情報あり）').length, 2);
  h.call('closeEntries');
  assert.throws(() => h.call('saveEntry_', h.params('live')), /受け付けていません/);
  h.setSetting('申込締切', '2000-01-01');
  assert.throws(() => h.call('openEntries'), /締切/);
  h.setSetting('申込締切', '2099-11-30'); h.setSetting('主催者名', '');
  assert.throws(() => h.call('openEntries'), /主催者名/);
});

test('v3: 同じ申込番号の再送は1件のまま、大会IDが違えば拒否し、旧プロトコル2も受ける', () => {
  const h = harness(); h.ready();
  const p = h.params('test'); const a = h.call('saveEntry_', p), b = h.call('saveEntry_', p);
  assert.equal(a, b); assert.equal(h.rows('テスト申込').length, 3);
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
  assert.ok(String(h.rows('テスト申込').at(-1)![3]).startsWith("'="));
  const rowsBefore = h.rows('テスト申込').length;
  assert.throws(() => h.call('saveEntry_', h.params('test', { photoDataUrl: 'data:image/jpeg;base64,AAAA' })), /写真/);
  assert.equal(h.rows('テスト申込').length, rowsBefore);
});

test('v3: 新しいスクリプトに鍵・署名・確認コード・メール入力の仕組みが残っていない', () => {
  for (const word of ['setupKey', 'entryKey:', 'testKey', 'TOS2', 'computeHmac', 'verifyConnection', 'expectedOwner', 'policy_', "['大会ID'"]) assert.ok(!script.includes(word), word);
});

test('v3: 公開用の設定（デプロイの初期値）は「自分で実行・全員がアクセス」', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/templates/appsscript.json', import.meta.url), 'utf8'));
  assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');
  assert.equal(manifest.webapp.access, 'ANYONE_ANONYMOUS');
  assert.equal(manifest.timeZone, 'Asia/Tokyo');
  assert.equal(manifest.oauthScopes, undefined, '権限は自動判定に任せ、余計な権限を足さない');
});

test('v3: 入場曲の「あり／なし」は、最初に必ず選ぶ（空のままでは進めない・初期値は入れない）', () => {
  const h = harness(); h.call('onOpen');
  const row = h.rows('設定').find((r) => r[0] === '入場曲')!;
  assert.equal(row[1], '', '初期値は空（「なし」を勝手に入れない）');
  h.fill({ 入場曲: '' });
  assert.throws(() => h.call('setupTournament'), /入場曲/);
  assert.equal(h.props.get('eventId'), undefined, '選ぶまで何も作らない');
  h.setSetting('入場曲', 'なし'); h.call('setupTournament');
  assert.equal(h.call('statusInfo_').music, false);
  const on = harness(); on.ready({ 入場曲: 'あり' });
  assert.equal(on.call('statusInfo_').music, true);
  // 受付が始まったあとで空にされたら、ping は設定の間違いとして知らせ、受付も開始できない
  h.setSetting('入場曲', '');
  assert.match(h.call('statusInfo_').settingsProblem, /入場曲/);
  assert.throws(() => h.call('openEntries'), /入場曲/);
});

test('v3: 入場曲・学年・年齢・意気込みは「▼から選ぶ」欄になり、ほかの文字は入れられない', () => {
  const h = harness(); h.call('onOpen');
  const sheet = h.settingsSheet(); const rule = (name: string) => { const i = h.rows('設定').findIndex((r) => r[0] === name); return sheet.validations.get((i + 1) + ':2'); };
  assert.equal(JSON.stringify(rule('入場曲').list), JSON.stringify(['あり', 'なし']));
  for (const name of ['学年', '年齢', '意気込み']) assert.equal(JSON.stringify(rule(name).list), JSON.stringify(['必須', '任意', 'なし']));
  for (const name of ['入場曲', '学年', '年齢', '意気込み']) assert.equal(rule(name).allowInvalid, false);
  assert.equal(rule('大会名'), undefined);
});

test('v3: メニューから押したときは、成功も失敗も、画面の上に日本語で出る（何も出ないままにしない）', () => {
  const h = harness(); h.call('onOpen');
  h.call('menuSetup');
  assert.equal(h.toasts.length, 0, '失敗したので、成功の表示は出ない');
  assert.match(h.alerts.at(-1)!, /次の欄を入れてください/);
  assert.equal(h.props.get('eventId'), undefined);
  h.fill(); h.call('menuSetup');
  assert.match(h.toasts.at(-1)!, /準備できました/);
  assert.match(h.toasts.at(-1)!, /デプロイ/);
  h.call('menuOpen'); assert.match(h.toasts.at(-1)!, /受付を開始しました/);
  h.call('menuClose'); assert.match(h.toasts.at(-1)!, /受付を停止しました/);
  h.call('menuExport'); assert.match(h.alerts.at(-1) ?? h.toasts.at(-1)!, /./);
  h.setSetting('主催者名', ''); h.call('menuOpen');
  assert.match(h.alerts.at(-1)!, /主催者名/);
});

test('v3: Googleの保存容量が足りないときは、先に分かる言葉で止まり、足りていれば通る', () => {
  const low = harness(); low.call('onOpen'); low.fill();
  low.setStorage(15 * 1024 ** 3, 15 * 1024 ** 3 - 50 * 1024 ** 2);
  assert.throws(() => low.call('setupTournament'), /保存容量が、ほとんど残っていません（あと約50MB）/);
  assert.equal(low.props.get('photoFolderId'), undefined, '写真フォルダは作らない');
  low.call('menuSetup'); assert.match(low.alerts.at(-1)!, /保存容量/);
  low.setStorage(15 * 1024 ** 3, 1024 ** 3); low.call('setupTournament');
  assert.equal(low.call('statusInfo_').storageProblem, '');
  low.setStorage(15 * 1024 ** 3, 15 * 1024 ** 3 - 10 * 1024 ** 2);
  assert.match(low.call('statusInfo_').storageProblem, /あと約10MB/);
  const unlimited = harness(); unlimited.setStorage(0, 5 * 1024 ** 4); unlimited.ready();
  assert.equal(unlimited.call('statusInfo_').storageProblem, '', '容量が調べられない（上限なし）ときは、何も言わない');
});

test('v3: 申込表の見出しは、「警告つき」で守る（うっかり書き換えると、確認が出る）', () => {
  const h = harness(); h.ready();
  for (const name of ['申込原本（個人情報あり）', 'OS取込用（連絡先なし）', 'テスト申込', 'テストOS取込用']) {
    const protections = h.book.getSheetByName(name).protections;
    assert.equal(protections.length, 1, name);
    assert.equal(protections[0].prot.warningOnly, true, name);
    assert.equal(protections[0].r, 1);
  }
  h.call('setupTournament');
  assert.equal(h.book.getSheetByName('テスト申込').protections.length, 1, '何度押しても、増えない');
});
