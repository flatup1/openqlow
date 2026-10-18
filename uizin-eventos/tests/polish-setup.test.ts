/**
 * 仕上げ（setup 担当）の回帰テスト。会長が「設定」タブを書き、メニュー①〜⑤を押し、/private/setup/ で確かめる道すじの、
 * 迷いやすい所を1つずつ固定する。Googleは本物ではなく、模擬（tests/helpers/gasV3Harness.ts）。
 * 本物のGoogleでしか確かめられないこと（権限の確認が1回で済むか・メニューの箱の見え方）は、ここでは確かめられない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CELL, CLASS_CELL, diagnose, entryConfigFromPing, EXPECTED_RECEPTION_BUILD, isOldBrowser, parsePing, settingLines } from '../core/setupV3.ts';
import { importFighters } from '../core/privateTournament.ts';
import { harness } from './helpers/gasV3Harness.ts';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const PAGE = read('app/private/setup/page.tsx');
/** コメントを除いた、画面に出る文だけ（コメントには、色の名前を書いてよい） */
const PAGE_TEXT = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const GS = read('public/templates/Tournament_OS_Google受付_v3.gs');
const PRIVATE = '申込原本（個人情報あり）', OS = 'OS取込用（連絡先なし）', TEST = 'テスト申込', TEST_OS = 'テストOS取込用';
const pingOf = (h: ReturnType<typeof harness>) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
const code = (fn: () => unknown): { code?: string; message: string; retryable?: boolean } => { try { fn(); } catch (e) { return e as never; } assert.fail('止まるはずが、止まらなかった'); };

/* ───────── r1-42 / 57 / 78 / 110 / 134 / 148：見出しの文（B9） ───────── */

test('見出し: 違うマスを直す文は、タブ・マス・あるべき見出し・直したあとにすることを言い、1つの言い方で ping・受付・①に出る', () => {
  const h = harness(); h.ready();
  h.rows(PRIVATE)[0][4] = '選手';
  const viaStatus = code(() => h.call('statusInfo_')), viaSave = code(() => h.call('saveEntry_', h.params('test'))), viaSetup = code(() => h.call('setupTournament'));
  for (const e of [viaStatus, viaSetup]) {
    assert.equal(e.code, 'headers');
    assert.match(e.message, /「申込原本（個人情報あり）」タブのE1が「選手」になっています。「選手名」に直してください。/);
    assert.match(e.message, /「① 最初の設定」を押します/);
    assert.match(e.message, /消さず、ジムの担当者に聞いてください/, '本物の申込が入るタブは、消す方法を教えない');
  }
  assert.equal(viaSave.message, viaStatus.message, '同じ言い方');
  assert.equal(viaSetup.message, viaStatus.message, '同じ言い方（①でも）');
  const body = pingOf(h);
  assert.deepEqual([body.ready, body.error, body.errorTab, body.errorCell, body.errorExpected], [false, 'headers', PRIVATE, 'E1', '選手名']);
  assert.ok(!JSON.stringify(body).includes('organizer@example.com'), 'メールは ping に出さない');
});

test('見出し: 練習用のタブは「名前を変えて①」の道を教える。列が足されたときは、足した列を消すと言う', () => {
  const h = harness(); h.ready();
  h.rows(TEST)[0][3] = '所属';
  assert.match(code(() => h.call('statusInfo_')).message, /「テスト申込」タブのD1が「所属」になっています。「所属ジム」に直してください。/);
  assert.match(code(() => h.call('setupTournament')).message, /名前を「テスト申込_古い」に変えて、「① 最初の設定」を押します。新しいタブができます/);
  const g = harness(); g.ready();
  g.rows(OS)[0].splice(2, 0, 'メモ');
  const inserted = code(() => g.call('statusInfo_'));
  assert.match(inserted.message, /「OS取込用（連絡先なし）」タブの1行目に、列が足されています（C1）。足したC列を消してください（C列の上で右クリック →「列を削除」）。/);
  assert.equal(pingOf(g).errorCell, 'C1');
});

test('見出し: タブが消えているだけのときは「見出しが変わった」とは言わず、①で作り直せる。選手には見出しの話をしない', () => {
  const h = harness(); h.ready();
  h.book.sheets.delete(TEST_OS);
  const e = code(() => h.call('statusInfo_'));
  assert.equal(e.code, 'missing');
  assert.match(e.message, /「テストOS取込用」タブが見つからない/);
  assert.ok(!e.message.includes('見出しが変わっています'));
  assert.deepEqual([pingOf(h).error, pingOf(h).errorTab], ['missing', TEST_OS]);
  h.call('setupTournament');
  assert.ok(h.book.getSheetByName(TEST_OS), '①でタブが戻る');
  assert.equal(pingOf(h).ready, true);
  // 選手（保護者）へ出す文は、直し方ではなく「主催者へ」だけ
  const g = harness(); g.ready(); g.call('openEntries'); g.rows(PRIVATE)[0][4] = '選手';
  const page = g.call('doPost', { parameter: g.params('live') }).html as string;
  assert.match(page, /ただいま受付に問題があります。主催者へご連絡ください。/);
  assert.ok(!/見出し|E1|選手名/.test(page.replace(/<style>.*<\/style>/, '')), '選手の画面に、見出しの話を出さない');
});

test('見出し: 古い形（最後の「クラス」の1マスだけ無い）は、見出しの変更とは言わず、1マスだけ足す', () => {
  const h = harness(); h.ready();
  for (const [name, width] of [[PRIVATE, 19], [OS, 12], [TEST, 19], [TEST_OS, 12]] as const) for (const row of h.rows(name)) row.length = width - 1;
  const before = JSON.stringify(h.rows(PRIVATE).slice(1));
  assert.doesNotThrow(() => h.call('statusInfo_'));
  assert.equal(h.rows(PRIVATE)[0][18], 'クラス');
  assert.equal(JSON.stringify(h.rows(PRIVATE).slice(1)), before, 'ほかのマスは書き換えない');
});

test('見出し: マニフェストに、使うサービスぶんの権限が書いてある（本物のGoogleでの確認は未了）', () => {
  const manifest = JSON.parse(read('public/templates/appsscript.json')) as { oauthScopes?: string[]; webapp: { executeAs: string; access: string } };
  const scopes = manifest.oauthScopes ?? [];
  const needs: [RegExp, string][] = [
    [/SpreadsheetApp\.(?:openById|getActiveSpreadsheet)/, 'https://www.googleapis.com/auth/spreadsheets'],
    [/DriveApp\./, 'https://www.googleapis.com/auth/drive'],
    [/SpreadsheetApp\.getUi/, 'https://www.googleapis.com/auth/script.container.ui'],
    [/Session\.getEffectiveUser/, 'https://www.googleapis.com/auth/userinfo.email'],
    [/ScriptApp\./, 'https://www.googleapis.com/auth/script.scriptapp'],
  ];
  for (const [uses, scope] of needs) { assert.ok(uses.test(GS), scope + ' を使う理由'); assert.ok(scopes.includes(scope), scope); }
  // 使っていないサービスの権限は、頼まない（外へ出す・メールを送る権限が入っていない）
  assert.ok(!/UrlFetchApp|MailApp|GmailApp/.test(GS));
  assert.deepEqual(scopes.filter((s) => /external_request|send_mail|gmail|calendar/.test(s)), []);
  assert.deepEqual([manifest.webapp.executeAs, manifest.webapp.access], ['USER_DEPLOYING', 'ANYONE_ANONYMOUS']);
});

/* ───────── r1-58：ping の error ごとの案内 ───────── */

test('画面の診断: owner / sharing / headers / missing は、①を押す案内にしない。それぞれ別の案内を言う', () => {
  const base = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: false };
  const owner = diagnose(parsePing({ ...base, error: 'owner' }));
  assert.equal(owner.stage, 'wrong-owner'); assert.match(owner.message, /①を押したのと同じGoogleアカウント/);
  const sharing = diagnose(parsePing({ ...base, error: 'sharing' }));
  assert.equal(sharing.stage, 'sharing'); assert.match(sharing.message, /制限付き/);
  const headers = diagnose(parsePing({ ...base, error: 'headers', errorTab: TEST, errorCell: 'D1', errorExpected: '所属ジム' }));
  assert.equal(headers.stage, 'headers'); assert.match(headers.message, /「テスト申込」タブのD1を、「所属ジム」に直してください/);
  const headersNoDetail = diagnose(parsePing({ ...base, error: 'headers' }));
  assert.equal(headersNoDetail.stage, 'headers'); assert.match(headersNoDetail.message, /ジムの担当者/);
  const missing = diagnose(parsePing({ ...base, error: 'missing', errorTab: OS }));
  assert.equal(missing.stage, 'missing-tab'); assert.match(missing.message, /「OS取込用（連絡先なし）」タブが見つかりません/); assert.match(missing.message, /① 最初の設定/);
  for (const error of ['setup', 'error', undefined]) assert.equal(diagnose(parsePing({ ...base, error })).stage, 'not-setup');
});

/* ───────── r1-59：読み取り内容・長すぎる欄 ───────── */

test('設定の長さ: 大会名・会場・主催者名・問い合わせ先は300字、地図URLは500字まで。超えたら欄の名前を言って止まる', () => {
  const h = harness(); h.call('onOpen'); h.fill();
  for (const [label, max] of [['大会名', 300], ['会場', 300], ['主催者名', 300], ['問い合わせ先', 300]] as const) {
    h.fill(); h.setSetting(label, 'あ'.repeat(max));
    assert.doesNotThrow(() => h.call('setupTournament'), label + ' 上限ちょうど');
    h.setSetting(label, 'あ'.repeat(max + 1));
    assert.match(code(() => h.call('setupTournament')).message, new RegExp('「' + label + '」は' + max + '文字までにしてください'), label);
  }
  h.fill(); h.setSetting('会場の地図URL', 'https://maps.app.goo.gl/' + 'a'.repeat(500));
  assert.match(code(() => h.call('setupTournament')).message, /「会場の地図URL」は500文字までにしてください/);
});

test('設定の読み取り: 設定に直しものがある間も、ping は直す欄だけを言い、公開の項目を出さない（画面は「未入力」と責めない）', () => {
  const h = harness(); h.ready(); h.setSetting('会場', '');
  const body = pingOf(h);
  assert.match(body.settingsProblem, /会場/); assert.equal(body.title, undefined);
  assert.match(PAGE, /ping && !readable \? <section aria-labelledby="readback"[\s\S]{0,400}まだ読み取れません/, '直しものがある間は、灰色の「まだ読み取れません」だけを出す');
});

/* ───────── r1-60 / 88：黄色の言葉を使わず、印で言う。シートにも印をつける ───────── */

test('設定タブ: 書く7つのB列に色（#fff2a8）と「✎ ここに書く」の印、列の幅・折り返し・1行目の固定。画面の文は色の名前で言わない', () => {
  const h = harness(); h.call('onOpen');
  const sheet = h.settingsSheet();
  const labels = sheet.rows.slice(1).map((r: string[]) => r[0]);
  const write = ['大会名', '開催日', '会場', '主催者名', '問い合わせ先', '申込締切', '入場曲'];
  for (const label of labels) {
    const row = labels.indexOf(label) + 2;
    const painted = sheet.backgrounds.get(row + ':2');
    assert.equal(painted, write.includes(label) ? '#fff2a8' : undefined, label);
    assert.equal(String(sheet.rows[row - 1][2]).startsWith('✎ ここに書く'), write.includes(label), label + ' のC列の印');
  }
  assert.deepEqual([...sheet.columnWidths.entries()], [[1, 160], [2, 380], [3, 520]]);
  assert.equal(sheet.frozenRows, 1);
  assert.ok(!PAGE_TEXT.includes('黄色'), '画面の文に「黄色」という色の名前を使わない（印の名前で言う）');
  assert.match(PAGE, /C列に\{WRITE_MARK\}と書いてある7つの行/);
  // 画面のセル番号（B2〜B20）は、シートの行の順番と同じ
  const cells: Record<string, string> = { ...CELL, ...CLASS_CELL };
  labels.forEach((label: string, i: number) => assert.equal(cells[label], 'B' + (i + 2), label));
});

/* ───────── r1-61：古い設定タブの自己修復と、画面の黄色の注意 ───────── */

test('古い設定タブ: クラスの8行だけ、いちばん下に足す。いまのマスは書き換えない。足りないときだけ ping が知らせる', () => {
  const h = harness(); h.call('onOpen');
  const sheet = h.settingsSheet();
  sheet.rows.length = 12; sheet.rows[1][1] = '私の大会';
  h.call('onOpen'); h.call('onOpen');
  assert.equal(sheet.rows.length, 20, '8行足されて、2回目以降は増えない');
  assert.equal(sheet.rows[1][1], '私の大会');
  assert.equal(sheet.rows[12][0], 'クラス分け'); assert.equal(sheet.rows[19][0], '上のクラスにする勝ち数');
  h.fill();
  const old = harness(); old.call('onOpen'); old.fill(); old.call('setupTournament');
  old.settingsSheet().rows.length = 12;
  assert.equal(pingOf(old).classRows, false, '足す前の古い表は、画面の黄色の注意のもとになる');
  old.call('onOpen');
  assert.equal(pingOf(old).classRows, undefined);
});

/* ───────── r1-65 / 87：ZIPのリンクは箱で見せ、ZIPは1つだけ残す ───────── */

test('名簿ZIP: 20秒で消える通知ではなく、押せるリンクの箱で見せる。同じ名前のZIPは1つだけ残る（前のはゴミ箱）', () => {
  const h = harness(); h.ready(); h.call('openEntries');
  h.call('saveEntry_', h.params('live'));
  h.call('menuExport');
  assert.equal(h.dialogs.length, 1);
  const dialog = h.dialogs[0];
  assert.match(dialog.html, /ここを押してダウンロード/);
  assert.match(dialog.html, /target="_blank"/);
  assert.match(dialog.html, new RegExp('Tournament_OS_' + h.eventId() + '\\.zip'), '押せないときのために、Driveでの名前も言う');
  assert.match(dialog.html, /Tournament OS 顔写真 - テスト大会/);
  assert.ok(!h.toasts.some((t) => /名簿ZIPができました/.test(t)), '箱が出たときは、消える通知にURLを出さない');
  h.call('menuExport');
  const folder = [...h.resources.values()].find((r: any) => r.kind === 'folder' && r.name.startsWith('Tournament OS 顔写真'));
  const zips = folder.children.filter((c: any) => c.name === 'Tournament_OS_' + h.eventId() + '.zip');
  assert.equal(zips.length, 2);
  assert.equal(zips.filter((z: any) => !z.trashed).length, 1, '前のZIPはゴミ箱に入り、使えるZIPは1つ');
  // 画面の手順は、箱の言葉と、実際のファイル名で書く
  assert.match(PAGE, /箱の中の「ここを押してダウンロード」/);
  assert.match(PAGE, /Tournament_OS_（英数字）\.zip/);
  assert.ok(!PAGE.includes('URLが20秒だけ'));
});

/* ───────── r1-66 / 151：設定が壊れたあと・設定を変えたあとの申込 ───────── */

test('受付中に設定タブが壊れたら、新しい申込は受けない（クラスの選びを失わない）。選手には「少し待って」', () => {
  const h = harness(); h.ready({ クラス分け: 'あり' }); h.call('openEntries');
  h.setSetting('上のクラスの名前', ''); h.setSetting('下のクラスの名前', '');
  const e = code(() => h.call('saveEntry_', h.params('live', { fighterClass: 'upper' })));
  assert.equal(e.code, 'setup'); assert.equal(e.retryable, true);
  assert.match(e.message, /少し待ってからもう一度/);
  assert.equal(h.rows(PRIVATE).length, 1, '空のクラス欄の申込を保存しない');
  assert.equal(pingOf(h).accepting, true);
});

test('クラス名を変えたあとの再送は、保存ずみの申込として同じ受付番号を返す（「変わっています」と言わない）', () => {
  const h = harness(); h.ready({ クラス分け: 'あり' }); h.call('openEntries');
  const params = h.params('live', { fighterClass: 'upper' });
  const receipt = h.call('saveEntry_', params);
  h.setSetting('上のクラスの名前', 'エースクラス');
  assert.equal(h.call('saveEntry_', params), receipt);
  assert.equal(h.rows(PRIVATE).length, 2);
  // クラス分けを「なし」から「あり」に変えたあとでも、前に保存した申込の再送は通る（もう一度申し込ませない）
  const g = harness(); g.ready(); g.call('openEntries');
  const old = g.params('live'); const r2 = g.call('saveEntry_', old);
  g.setSetting('クラス分け', 'あり');
  assert.equal(g.call('saveEntry_', old), r2);
  assert.equal(g.rows(PRIVATE).length, 2);
});

/* ───────── r1-67：メニュー⑤ ───────── */

test('⑤いまの状態を見る: 共有が違うときも、日本語の箱で言う（生のエラーにしない）', () => {
  const h = harness(); h.ready();
  const file = [...h.resources.values()].find((r: any) => r.name === 'copy-of-template');
  file.editors.push({ getEmail: () => 'other@example.com' });
  assert.doesNotThrow(() => h.call('menuStatus'));
  assert.match(h.alerts.at(-1)!, /制限付き/);
  file.editors.length = 0;
  h.call('menuStatus');
  assert.match(h.alerts.at(-1)!, /設定：済み/);
});

/* ───────── r1-68：電話番号 ───────── */

test('電話番号: 0000000000・0120・数字がそろった番号・先頭が0でない番号・携帯の桁ちがいは、直接送られても保存しない', () => {
  const h = harness(); h.ready();
  for (const bad of ['0000000000', '00000000000', '0120-123-456', '0120123456', '1234567890', '0501234567', '09012345', '0901234567', '0800123456']) {
    const e = code(() => h.call('saveEntry_', h.params('test', { contactPhone: bad })));
    assert.equal(e.code, 'input', bad);
  }
  for (const good of ['09012345678', '090-1234-5678', '０９０１２３４５６７８', '0312345678', '03-1234-5678', '08012345678', '0661234567']) {
    assert.doesNotThrow(() => h.call('saveEntry_', h.params('test', { contactPhone: good })), good);
  }
});

/* ───────── r1-69 / 102 / 115：古いブラウザ ───────── */

test('古いブラウザ: :has が使えない・古いSafari・IE は「Chromeで開いてください」の対象。新しい Chrome / Safari / Edge は対象にしない', () => {
  const has = { supports: (q: string) => q.includes(':has') } , noHas = { supports: () => false };
  const chrome = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const safari16 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15';
  const safari15_0 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';
  assert.equal(isOldBrowser(chrome, has), false);
  assert.equal(isOldBrowser(safari16, has), false);
  assert.equal(isOldBrowser(safari15_0, has), true, '古いSafari 15.0');
  assert.equal(isOldBrowser(chrome, noHas), true, ':has が使えない');
  assert.equal(isOldBrowser(chrome, undefined), true);
  assert.equal(isOldBrowser('Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko', has), true);
  assert.match(PAGE, /oldBrowser \? <Caution className="mt-3" lead="Chromeで開いてください。"/);
  assert.match(PAGE, /はじめて「① 最初の設定」を押すと、許可の画面が出ます。そのあと、何も起きなかったり、エラーが出たりすることがあります/);
  assert.match(PAGE, /許可が終わったら、もう一度「① 最初の設定」を押します。（2回押すのが、ふつうです）/);
});

/* ───────── r1-70：画面の言葉と、シート・メッセージの言葉をそろえる ───────── */

test('言葉: 「もう一度確かめる」「2027年10月3日」「個人のGoogleアカウント」を、画面とシートで同じに言う', () => {
  const h = harness(); h.ready();
  h.call('menuOpen');
  assert.match(h.toasts.at(-1)!, /自動で確かめます。出ないときは「もう一度確かめる」を押します/);
  assert.ok(!/アプリの画面で「確かめる」を押/.test(GS) && !GS.includes('「接続を確かめる」'));
  const rows = h.settingsSheet().rows;
  assert.match(String(rows.find((r: string[]) => r[0] === '開催日')![2]), /例：2027年10月3日/);
  assert.ok(!GS.includes('半角の数字'));
  assert.match(PAGE, /個人のGoogleアカウント（@gmail\.com など）で作業します。会社や学校のアカウントは使えません/);
  assert.ok(!PAGE.includes('ジムで使っているGoogleのアカウントで大丈夫'));
});

/* ───────── r1-62：エディタのURL ───────── */

test('URLの貼りまちがい: Apps Scriptの編集画面のURLは「最後まで入っていません」ではなく、別の名前で言う', () => {
  assert.match(PAGE, /case 'editor': return \{ head: 'これは「Apps Scriptの編集画面のURL」です'/);
  assert.match(PAGE, /script\\\.google\\\.com\\\/\(\?:u\\\/\\d\+\\\/\)\?\(\?:home\(\?:\\\/projects\)\?\|projects\|d\\\/\[A-Za-z0-9_-\]\+\\\/edit\)/);
});

/* ───────── r1-72 / 150：保護のアポストロフィ ───────── */

test('保護の「\'」: ZIPの players.csv に付いた守りの「\'」は、取り込みで外れて元の文字に戻る（本物の「\'」は残る）', () => {
  const h = harness(); h.ready(); h.call('openEntries');
  h.call('saveEntry_', h.params('live', { name: '-架空太郎', gym: '+架空ジム', record: '-', comment: '' }));
  h.call('saveEntry_', h.params('live', { name: "'ゆうた", gym: '架空ジム', record: '初試合' }));
  h.call('exportTournament');
  const csv = h.zips.at(-1).find((f: any) => f.name === 'players.csv').bytes.toString('utf8');
  assert.ok(csv.includes('"\'-架空太郎"'), '書き出しでは守りが付く');
  const imported = importFighters(csv).fighters;
  const first = imported.find((f) => f.name.includes('架空太郎'))!;
  assert.deepEqual([first.name, first.gym, first.record], ['-架空太郎', '+架空ジム', '-']);
  assert.ok(imported.some((f) => f.name === "'ゆうた"), '本物の「\'」は外さない');
});

/* ───────── r1-92 / 98 / 101：言葉 ───────── */

test('受付の画面とメッセージ: 「規約」と言わず、保存されていない失敗は「送れませんでした」、保存したかもしれない失敗は「確認が必要」', () => {
  assert.ok(!GS.includes('規約'));
  const h = harness(); h.ready(); h.call('openEntries');
  const bad = h.call('doPost', { parameter: h.params('live', { consent: '' }) }).html as string;
  assert.match(bad, /<h1>✕ 送れませんでした<\/h1>/); assert.match(bad, /個人情報の取扱いへの同意が必要です/);
  const ok = h.call('doPost', { parameter: h.params('live') }).html as string;
  assert.match(ok, /申し込みが完了しました/);
  assert.match(read('app/apply/page.tsx'), /「送れませんでした」と出たときだけ、ブラウザの「戻る」で戻って、直してからもう一度送ります/);
});

test('文のつぎはぎ: 余分な空白を作らない（「Googleの保存場所 の」「いっぱい」の前の空白）', () => {
  assert.ok(!/Googleの保存場所 の|Googleの保存できる場所が いっぱい/.test(PAGE));
  assert.match(PAGE, /replace\(\/Driveや \?Gmail \?の\//);
  assert.match(PAGE, /Googleの保存場所がいっぱい/);
});

test('設定タブの説明と画面の見本は、同じ例を使う（大会名・開催日・入場曲・ワンアタックの説明）', () => {
  const h = harness(); h.call('onOpen');
  const rows = h.settingsSheet().rows as string[][];
  const hint = (label: string) => String(rows.find((r) => r[0] === label)![2]);
  assert.match(hint('大会名'), /例：第3回 青空ジム大会/);
  assert.match(PAGE, /\['大会名', 'B2', 'write', '第3回 青空ジム大会'\]/, '画面の見本の絵も、同じ大会名の例');
  assert.ok(!hint('入場曲').includes('聞く'), '入場曲：「聞く」と書かない');
  assert.match(hint('入場曲'), /リンクを書いてもらうか/);
  assert.match(hint('上のクラスのルール'), /ワンアタック＝蹴り足をキャッチしたあと、1回だけ攻撃してよい/, '例をコピーしても、ワンアタックの説明が消えない');
});

/* ───────── r1-143：Workspace ───────── */

test('Workspace（会社・学校）のURL: 画面は「使えません」と言い、個人のGoogleでやり直す道を言う', () => {
  assert.match(PAGE, /case 'workspace': return \{ head: '会社や学校のGoogleアカウントでは、使えません/);
  assert.match(PAGE, /個人のGoogleアカウント（@gmail\.com など）で、ひな形のコピーからやり直します/);
});

/* ───────── r1-147：古い版の注意 ───────── */

test('古い版（クラスなし）: つなぐ画面は「ready」のままだが、クラスを使えない黄色の注意を出す。クラス分けを「なし」と言い切らない', () => {
  const old = parsePing({ app: 'tournament-os', protocol: 3, build: '3.20261004.4', ready: true, accepting: true, testComplete: true, eventId: 'tos-0123456789', title: 'テスト大会', date: '2099-12-01', venue: '体育館', organizer: '主催ジム', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' });
  assert.equal(diagnose(old).stage, 'ready');
  assert.equal(old.build !== EXPECTED_RECEPTION_BUILD, true);
  assert.match(PAGE, /ping\.build !== EXPECTED_RECEPTION_BUILD && stage !== 'old-build' \? <Caution className="mt-3" lead="このGoogleの版は、クラス分けに対応していません。"/);
  assert.match(PAGE, /ping\.classRows === false \? <Caution className="mt-3" lead="このシートには、クラス分けの行がありません。"/);
  assert.equal(entryConfigFromPing(old, 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec', 'live').classes, undefined);
});

/* ───────── r1-75：ブラウザのタブの名前 ───────── */

test('タブの名前: 設定の画面は「選手の受付をつくる」、当日の画面は日本語の名前（layout の metadata で固定）', () => {
  assert.match(read('app/private/setup/layout.tsx'), /title: '選手の受付をつくる'/);
  assert.match(read('app/private/live/layout.tsx'), /title: '試合当日の画面'/);
  assert.match(PAGE, /const PAGE_NAME = '選手の受付をつくる'/);
});

/* ───────── r1-76 / 169 / 170 / 162：ファイル名・文書 ───────── */

test('ZIPの名前: 画面と文書は、本物の名前（Tournament_OS_〜.zip）で言う。「選手名簿.zip」と教えない', () => {
  for (const path of ['app/private/page.tsx', 'app/private/logic.ts', 'app/private/setup/page.tsx']) assert.ok(!read(path).includes('選手名簿.zip'), path);
  assert.match(GS, /exportRows_\(rows,resources\.folder,'Tournament_OS_'\)/);
  assert.match(PAGE, new RegExp('const MENU_ZIP = \'④ OS用の名簿ZIPを作る\''));
  assert.ok(GS.includes(".addItem('④ OS用の名簿ZIPを作る', 'menuExport')"), '画面のメニューの名前は、シートのメニューと同じ');
});

test('文書: クラスの表は、シートの初期値と1字も違わない。READMEと手引きは /private/setup/ の道すじを言う', () => {
  const h = harness(); h.call('onOpen');
  const rows = h.settingsSheet().rows as string[][];
  const doc = read('docs/クラス区分_設定の入れ方.md');
  for (const label of ['上のクラスの名前', '上のクラスの条件', '上のクラスのルール', '下のクラスの名前', '下のクラスの条件', '下のクラスのルール']) {
    const value = rows.find((r) => r[0] === label)![1];
    assert.ok(doc.includes(value), label + ' の初期値「' + value + '」が文書の表にそのまま入っている');
  }
  for (const path of ['README.md', 'START_HERE.md', 'docs/EASY_SETUP_GUIDE.md']) assert.ok(read(path).includes('/private/setup/'), path + ' が /private/setup/ を言う');
  assert.match(PAGE, /\['（この下）', '', 'more', 'クラスの行が7つ続きます（B14〜B20）。はじめから入っています'\]/);
  assert.match(PAGE, /「クラス分け」から下に、クラスの行が8つ、はじめから入っています/);
});

/* ───────── r1-104 / 125 / 139：古い画面（Google受付をつなぐ） ───────── */

test('古い画面（Google受付をつなぐ）: 色の名前で案内しない。クラスが使えないと言う。押せないボタンには理由を出す。覚えた設定は消せる', () => {
  const legacy = read('app/private/google-setup/page.tsx');
  assert.ok(!legacy.includes('黄色になっている'));
  assert.match(legacy, /この方法では、クラス分け（Aクラス・Bクラス）は使えません/);
  assert.match(legacy, /tos-locked-reason/);
  assert.match(legacy, /このパソコンに残るもの/);
  assert.match(legacy, /localStorage\.removeItem\('tournament-google-setup:'\+eventId\)/);
  assert.ok(!read('app/private/entry/page.tsx').includes('黄色い欄'));
});

/* ───────── B13：道具と文書 ───────── */

test('道具: すべての画面の確認（scripts/test-*.mjs）が、1つのコマンド（verify-private-all.sh）で動き、文書の一覧にも全部のっている', () => {
  const suites = (readdirSync(new URL('../scripts/', import.meta.url)) as string[]).filter((f) => /^test-.*\.mjs$/.test(f));
  assert.ok(suites.includes('test-polish-setup.mjs'));
  const all = read('scripts/verify-private-all.sh');
  assert.match(all, /ls scripts\/test-\*\.mjs/, '名前が合うものを自動で全部動かす');
  for (const step of ['tsc --noEmit', 'npm test', 'build:private', 'http.server', 'validate-ai-os']) assert.ok(all.includes(step), step);
  assert.match(all, /OK 公開用フォルダは、正常です/);
  const doc = read('docs/TOURNAMENT_OS_公開とCodex連携の決まり.md');
  for (const f of suites) assert.ok(doc.includes('scripts/' + f), f + ' が文書の一覧にある');
  assert.match(read('uizin-eventos/.gitignore'.replace('uizin-eventos/', '')), /^bd-\*\/$/m, '手元のビルド用フォルダは、コミットしない');
});

/* ═════════════════════════ 第2回（round 2）：setup の直し ═════════════════════════ */

const html = (page: unknown): string => String((page as { html: string }).html);
const bare = (h: string): string => h.replace(/<style>[\s\S]*?<\/style>/, '');

/* ───────── D-1：古い「別の方法で受付をつくる」画面は、公開しない ───────── */

test('D-1: 古い画面（google-setup）は、公開用フォルダに入れない。ソースは残し、道（リンク）は消し、入っていたら自動チェックが止める', () => {
  const build = read('scripts/build-private-pages.sh');
  assert.match(build, /LEGACY_ROUTES=\(google-setup\)/);
  assert.match(build, /rm -rf "\$STAGE\/private\/\$legacy"/, '組み立てた場所から、古い画面を外す');
  assert.match(build, /--exclude-dir="\$legacy"/, 'その画面だけの部品も、一覧に入れない');
  assert.match(build, /LEGACY_FILES=\(templates\/Tournament_OS_Google受付\.gs\)/, 'その画面だけが使う古いプログラムも外す');
  assert.match(build, /rm -f "\$STAGE\/\$legacy"/);
  assert.ok(readdirSync(new URL('../app/private/', import.meta.url)).includes('google-setup'), 'ソースは消さない');
  assert.ok(!/google-setup/.test(read('public/_headers')), '公開しない画面に、Googleへ送る許可を残さない');
  // どの画面にも、古い画面へのリンクと「別の方法で受付をつくる」が無い（ソースの古い画面そのものは除く）
  for (const path of ['app/private/page.tsx', 'app/private/setup/page.tsx', 'app/private/entry/page.tsx', 'app/private/live/page.tsx', 'app/private/cards.tsx']) {
    const text = read(path).replace(/tournament-google-setup:/g, '');   // 古い画面が残した覚え書きを消すための名前だけは、ある
    assert.ok(!/google-setup/.test(text), path + ' に古い画面へのリンクが無い');
    assert.ok(!text.includes('別の方法で受付をつくる'), path + ' に「別の方法で受付をつくる」が無い');
  }
  // 入っていたら、自動チェックが止まる（作り物の公開用フォルダに、古い画面を置いて確かめる）
  const dir = mkdtempSync(join(tmpdir(), 'tos-legacy-'));
  try {
    mkdirSync(join(dir, 'private/google-setup'), { recursive: true });
    writeFileSync(join(dir, 'private/google-setup/index.html'), '<!doctype html><html lang="ja"><body>Google受付をつなぐ</body></html>');
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-private-build.mjs', import.meta.url)), dir], { encoding: 'utf8' });
    mkdirSync(join(dir, 'templates'), { recursive: true });
    writeFileSync(join(dir, 'templates/Tournament_OS_Google受付.gs'), '// legacy');
    const run2 = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-private-build.mjs', import.meta.url)), dir], { encoding: 'utf8' });
    assert.match(run2.stderr, /古い版のGoogleのプログラム（templates\/Tournament_OS_Google受付\.gs）が公開用フォルダに入っています/);
    assert.equal(run.status, 1, '古い画面が入っていたら、止まる');
    assert.match(run.stderr, /古い受付画面（private\/google-setup）が公開用フォルダに入っています/);
    assert.match(run.stderr, /古い受付画面（google-setup）の名前や保存の書き込みが、公開用フォルダに残っています/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const gate = read('docs/TOURNAMENT_OS_公開とCodex連携の決まり.md');
  assert.match(gate, /古い「別の方法で受付をつくる」画面（`private\/google-setup`）は、公開用フォルダに入っていない/);
  // 古い画面が残した主催者のメール・合言葉は、この画面を開くと消える
  assert.match(PAGE, /key\.startsWith\('tournament-google-setup:'\)/);
});

/* ───────── r2-58：締切を過ぎたら、受付中と言わない ───────── */

test('r2-58: 締切を過ぎたら ping は accepting:false・closedBy:deadline、⑤は「しめきりました」。止めたあとは stopped。開始前には closedBy が無い', () => {
  const h = harness(); h.ready();
  assert.equal(pingOf(h).closedBy, undefined, '開始前');
  h.call('openEntries');
  assert.deepEqual([pingOf(h).accepting, pingOf(h).closedBy], [true, undefined], '受付中');
  h.setSetting('開催日', '2020-02-01'); h.setSetting('申込締切', '2020-01-20');
  const late = pingOf(h);
  assert.deepEqual([late.accepting, late.closedBy], [false, 'deadline']);
  h.call('menuStatus');
  assert.match(h.alerts.at(-1)!, /受付：しめきりました（締切を過ぎています）/);
  assert.ok(!h.alerts.at(-1)!.includes('受付：受付中'));
  assert.equal(code(() => h.call('saveEntry_', h.params('live'))).code, 'closed', 'Googleも新しい申込を断る');
  h.fill();
  h.call('closeEntries');
  const stopped = pingOf(h);
  assert.deepEqual([stopped.accepting, stopped.closedBy], [false, 'stopped']);
  // 画面の診断：終わっている受付に、渡すURLを出さない。古いGoogle（closedBy を知らない）は今までどおり
  const ping = (extra: Record<string, unknown>) => parsePing({ ...pingOf(h), ...extra });
  assert.equal(diagnose(ping({ closedBy: 'deadline' })).stage, 'closed'); assert.equal(diagnose(ping({ closedBy: 'deadline' })).ok, false);
  assert.match(diagnose(ping({ closedBy: 'stopped' })).message, /受付を止めています/);
  assert.equal(diagnose(ping({ closedBy: undefined, accepting: false })).stage, 'need-open');
  assert.equal(diagnose(ping({ closedBy: undefined, accepting: true })).stage, 'ready');
  assert.equal(diagnose(parsePing({ ...pingOf(h), closedBy: 'whatever' })).stage, 'need-open', '知らない値は捨てる');
  // 画面（手順3）：終わっているときは、緑の受付中でも「あと1つで完成」でもない。黄色は「試合の準備の画面へ」
  assert.match(PAGE, /case 'closed':[\s\S]{0,900}申込は終わっています。このURLは、選手に送りません/);
  assert.match(PAGE, /closedLate = step === 3 && !!settingsDiagnosis[\s\S]{0,200}\(deadlinePast \|\| datePast\)/, '古いGoogleでも、日にちで終わりが分かる');
  assert.match(PAGE, /if \(diagnosis\.stage === 'closed'\) return pasteSrc \?[\s\S]{0,200}id: 'roster'/);
});

/* ───────── r2-59：貼った文字を読んでいるとき、「自動で確かめます」と言わない ───────── */

test('r2-59: 貼って確かめる道では、手順3は「自動では変わりません」と言い、貼り直す場所に黄色（paste-new）が付いて、折りたたみが開く', () => {
  assert.match(PAGE, /pasteSrc\s*\n?\s*\/\/[^\n]*\n\s*\? <p className="mt-2 text-\[17px\]">この画面は、貼った文字を読んでいます。自動では変わりません。② を押したら/);
  assert.match(PAGE, /: <p className="mt-2 text-\[17px\]">もどると、自動で確かめます（5秒ごと）。<\/p>\}/, '本当に自動で確かめるときだけ、この文');
  assert.match(PAGE, /diagnosis\.stage === 'need-open' && pasteSrc\) return \{ id: 'paste-new'/);
  assert.match(PAGE, /openSignal=\{pingError === 'net' \|\| \(step === 3 && pasteSrc && \(stage === 'need-open' \|\| stage === 'closed'\)\)\}/);
  assert.match(PAGE, /\{mark\('paste-new', pasteFold\)\}/);
});

/* ───────── r2-60 / r2-75：「設定」タブの直し先は、欄の名前そのままで探す ───────── */

test('r2-60 / r2-75: Googleが言う「設定」の直しものは、すべて、正しいセルと正しい直し方になる（会場の地図URL→B5、文字数→短くする、▼は選ぶ欄だけ）', () => {
  const cases: [Record<string, string>, string, RegExp][] = [
    [{ 会場の地図URL: 'https://example.com/map' }, '会場の地図URL（B5）', /Googleマップの「共有」で出るURLにするか、空にする/],
    [{ 会場の地図URL: 'https://maps.app.goo.gl/' + 'a'.repeat(500) }, '会場の地図URL（B5）', /500文字までに、短くする/],
    [{ 大会名: 'あ'.repeat(301) }, '大会名（B2）', /300文字までに、短くする/],
    [{ 会場: 'あ'.repeat(301) }, '会場（B4）', /300文字までに、短くする/],
    [{ 主催者名: 'あ'.repeat(301) }, '主催者名（B6）', /300文字までに、短くする/],
    [{ 問い合わせ先: 'あ'.repeat(301) }, '問い合わせ先（B7）', /300文字までに、短くする/],
    [{ 開催日: '2099-02-31' }, '開催日（B3）', /2027年10月3日 のように入れる/],
    [{ 申込締切: 'あした' }, '申込締切（B8）', /2027年9月20日 のように入れる/],
    [{ 申込締切: '2099-12-02' }, '申込締切（B8）', /開催日と同じか、それより前の日にする/],
    [{ 入場曲: 'はい' }, '入場曲（B9）', /▼から選び直す/],
    [{ 学年: '多い' }, '学年（B10）', /▼から選び直す/],
    [{ 年齢: '多い' }, '年齢（B11）', /▼から選び直す/],
    [{ 意気込み: '多い' }, '意気込み（B12）', /▼から選び直す/],
  ];
  for (const [over, head, how] of cases) {
    const h = harness(); h.call('onOpen'); h.fill(over);
    const message = code(() => h.call('setupTournament')).message;
    const lines = settingLines(message);
    const hit = lines.find((l) => l.fixes.some((f) => f.startsWith(head + '：')));
    assert.ok(hit, JSON.stringify(over).slice(0, 60) + ' → ' + head + ' / ' + JSON.stringify(lines).slice(0, 300));
    assert.match(hit!.fixes.join(''), how, JSON.stringify(over).slice(0, 60));
    // 自由に書く欄に「▼から選び直す」と言わない
    if (!['入場曲', '学年', '年齢', '意気込み'].some((k) => head.startsWith(k))) assert.ok(!hit!.fixes.join('').includes('▼'), head + ' に▼は無い');
  }
  // 地図URLの2つの直しものが一緒に来ても、取りちがえない（前の版は「会場（B4）」と言っていた）
  const both = settingLines('シートの「設定」タブを直してください。「会場の地図URL」は、Googleマップの共有URLにするか、空にしてください。「会場」は300文字までにしてください');
  assert.deepEqual(both.map((l) => l.fixes[0].split('：')[0]), ['会場の地図URL（B5）', '会場（B4）']);
  // クラスの行
  const cls = harness(); cls.call('onOpen'); cls.fill({ クラス分け: 'あり', 上のクラスの名前: 'あ'.repeat(13) });
  assert.match(settingLines(code(() => cls.call('setupTournament')).message).map((l) => l.fixes.join('')).join(''), /上のクラスの名前」は12文字までにしてください（セル B14）/);
  // 足りない欄
  const empty = harness(); empty.call('onOpen');
  const miss = settingLines(code(() => empty.call('setupTournament')).message)[0].fixes;
  assert.ok(miss.includes('会場（B4）：書いてありません。例：○○体育館 のように入れる'));
  assert.ok(miss.some((f) => f.startsWith('入場曲（B9）：書いてありません。')), '入場曲（あり／なしを選ぶ）の長い名前でも、B9');
  // 画面は、前の「startsWith」の探し方をやめている
  assert.ok(!PAGE.includes('Object.keys(CELL).find((k) => n.startsWith(k))'));
});

test('r2-60 / r2-75: .gs が言える「設定」の直しものは、どれも、画面で「セル番号つき」の直し方になる（セル番号が出ない文は無い）', () => {
  const on = { クラス分け: 'あり' };
  const scenarios: Record<string, string>[] = [
    { 大会名: '' }, { 開催日: '' }, { 会場: '' }, { 主催者名: '' }, { 問い合わせ先: '' }, { 申込締切: '' }, { 入場曲: '' },
    { 開催日: 'x' }, { 申込締切: 'x' }, { 申込締切: '2099-12-02' }, { 会場の地図URL: 'https://example.com' }, { 会場の地図URL: 'https://maps.app.goo.gl/' + 'a'.repeat(500) },
    { 入場曲: 'はい' }, { 学年: 'x' }, { 年齢: 'x' }, { 意気込み: 'x' }, { クラス分け: 'x' },
    { 大会名: 'あ'.repeat(301) }, { 会場: 'あ'.repeat(301) }, { 主催者名: 'あ'.repeat(301) }, { 問い合わせ先: 'あ'.repeat(301) },
    { ...on, 上のクラスの名前: '' }, { ...on, 下のクラスの条件: '' }, { ...on, 上のクラスのルール: '' }, { ...on, 上のクラスの名前: 'Bクラス' }, { ...on, 上のクラスの名前: 'あ'.repeat(13) },
    { ...on, 下のクラスの条件: 'い'.repeat(61) }, { ...on, 上のクラスのルール: 'う'.repeat(81) }, { ...on, 下のクラスの名前: '=Bクラス' },
    { ...on, 上のクラスにする勝ち数: 'x' }, { ...on, 上のクラスにする勝ち数: '0' }, { ...on, 上のクラスにする勝ち数: '5' },
  ];
  let seen = 0;
  for (const over of scenarios) {
    const h = harness(); h.call('onOpen'); h.fill({ 会場の地図URL: '', ...over });
    // 画面が読むのは ping の settingsProblem（Google の「①」の警告にある、うしろの「直したら、もう一度…」は含まない）
    const message = code(() => h.call('setupTournament')).message.replace(/。直したら、もう一度[\s\S]*$/, '');
    for (const line of settingLines(message)) {
      seen++;
      assert.ok(line.fixes.length > 0 && line.fixes.every((f) => /B\d+/.test(f)), JSON.stringify(over).slice(0, 80) + ' → ' + JSON.stringify(line).slice(0, 240));
      // 自由に書く欄に、「▼から選び直す」と言わない。選ぶ欄だけが「▼」
      for (const f of line.fixes) if (f.includes('▼')) assert.match(f, /^(入場曲|学年|年齢|意気込み)（B\d+）：/, f);
    }
  }
  assert.ok(seen >= 30, '調べた直しものの数: ' + seen);
});

/* ───────── r2-61 / r2-65：見出し ───────── */

test('r2-61: 列が足されたときは、画面も「足した列を消す」と言い、見出しを打ち直せとは言わない。ping に errorInserted が付く', () => {
  const h = harness(); h.ready();
  h.rows(PRIVATE)[0].splice(2, 0, 'メモ');
  const body = pingOf(h);
  assert.deepEqual([body.error, body.errorCell, body.errorInserted], ['headers', 'C1', true]);
  const diag = diagnose(parsePing(body));
  assert.equal(diag.stage, 'headers');
  assert.match(diag.message, /「申込原本（個人情報あり）」タブに、列が足されています（C列）。C列を消してください（C列の上で右クリック →「列を削除」）/);
  assert.ok(!diag.message.includes('「大会ID」に直して'), 'C1を「大会ID」に直せ、とは言わない');
  const plain = harness(); plain.ready(); plain.rows(PRIVATE)[0][4] = '選手';
  assert.equal(pingOf(plain).errorInserted, undefined);
  assert.match(diagnose(parsePing(pingOf(plain))).message, /E1を、「選手名」に直してください/, '文字がちがうだけのときは、直す');
});

test('r2-65: 1行目を消したときは、見出しを上書きさせず、元に戻す・上に1行入れると言う。申込の文字を出さない', () => {
  const h = harness(); h.ready(); h.call('openEntries');
  const receipt = h.call('saveEntry_', h.params('live'));
  h.rows(PRIVATE).shift();
  const message = code(() => h.call('setupTournament')).message;
  assert.match(message, /1行目の見出しが消えています/);
  assert.match(message, /上に1行挿入/);
  assert.ok(!message.includes(receipt) && !message.includes('架空選手'), '申込の文字を出さない');
  assert.ok(!message.includes('「受付番号」に直してください'), '先頭の申込の受付番号を上書きさせない');
  const body = pingOf(h);
  assert.deepEqual([body.error, body.errorRowGone], ['headers', true]);
  assert.ok(!JSON.stringify(body).includes(receipt));
  const diag = diagnose(parsePing(body));
  assert.match(diag.message, /1行目の見出しが、消えています/); assert.match(diag.message, /申込は消えません/);
  assert.ok(!diag.message.includes('「受付番号」に直して'));
});

/* ───────── r2-62：写真フォルダがゴミ箱・削除 ───────── */

test('r2-62: 写真フォルダがゴミ箱にあるときは「共有」ではなく、ゴミ箱から戻す道を言う。完全に消えたときは、①が新しく作る', () => {
  const h = harness(); h.ready();
  const folder = h.resources.get(h.props.get('photoFolderId')!)!;
  folder.trashed = true;
  const body = pingOf(h);
  assert.equal(body.error, 'folder');
  assert.equal(diagnose(parsePing(body)).stage, 'folder');
  assert.match(diagnose(parsePing(body)).message, /ゴミ箱を開き|「ゴミ箱」を開き/); assert.match(diagnose(parsePing(body)).message, /元に戻す/);
  const setup = code(() => h.call('setupTournament'));
  assert.equal(setup.code, 'folder'); assert.ok(!setup.message.includes('共有'));
  assert.equal(h.props.get('photoFolderId'), folder.id, 'ゴミ箱のあいだは、作り直さない（中の写真を失わない）');
  assert.equal(code(() => h.call('saveEntry_', h.params())).code, 'folder');
  folder.trashed = false;
  assert.equal(pingOf(h).ready, true, '戻せば、また使える');
  // テスト写真のフォルダだけ消えたとき
  const test = h.resources.get(h.props.get('testFolderId')!)!;
  test.trashed = true; assert.equal(pingOf(h).error, 'folder'); test.trashed = false;
  // 完全に消えた
  const lost = harness(); lost.ready();
  const photoId = lost.props.get('photoFolderId')!;
  lost.resources.delete(photoId); lost.resources.delete(lost.props.get('testFolderId')!);
  assert.equal(pingOf(lost).error, 'folder', '生の英語のエラーを、画面に出さない');
  lost.toasts.length = 0;
  lost.call('menuSetup');
  assert.notEqual(lost.props.get('photoFolderId'), photoId, '新しいフォルダを作った');
  assert.match(lost.toasts.at(-1)!, /新しく作りました。前の写真は、新しいフォルダに入っていません/);
  assert.equal(pingOf(lost).ready, true); assert.equal(pingOf(lost).error, undefined);
  assert.ok(lost.call('saveEntry_', lost.params()), '作り直したあとは、申込を保存できる');
});

/* ───────── r2-64：空になった「設定」タブ ───────── */

test('r2-64: 「設定」タブが空になっても、シートを開く・①で表を作り直す（失うものが無いとき）。中身があるときは、書き換えない', () => {
  const h = harness(); h.call('onOpen');
  h.settingsSheet().rows.length = 0;
  h.call('onOpen');
  assert.equal(h.settingsSheet().rows.length, 20, '見出し1行＋項目19行');
  assert.deepEqual(h.rows('設定')[1].slice(0, 1), ['大会名']);
  assert.match(code(() => h.call('setupTournament')).message, /次の欄を入れてください/);
  const again = harness(); again.call('onOpen'); again.settingsSheet().rows.length = 0;
  assert.match(code(() => again.call('setupTournament')).message, /（「設定」タブが空だったので、作り直しました）/);
  // 中身があるものは、そのまま
  const keep = harness(); keep.call('onOpen'); keep.fill({ 大会名: '消さない大会' }); keep.call('onOpen');
  assert.equal(keep.rows('設定')[1][1], '消さない大会');
});

/* ───────── r2-67：lost-reply の再送 ───────── */

test('r2-67: 保存のときの守りの「\'」・改行のちがいがあっても、同じ申込の再送は「変わった」と言われない', () => {
  const h = harness(); h.ready(); h.call('openEntries');
  const p = h.params('live', { record: '-', comment: '' , gym: '=ジム' });
  const receipt = h.call('saveEntry_', p);
  assert.equal(h.call('saveEntry_', p), receipt, '同じ内容の再送は、同じ受付番号');
  // 改行：フォームはCRLFで送る。シートはLFで持つ
  const lines = harness(); lines.ready({ 意気込み: '任意' }); lines.call('openEntries');
  const q = lines.params('live', { comment: '一行目\r\n二行目' });
  const r = lines.call('saveEntry_', q);
  const row = lines.rows(PRIVATE).find((x) => x[0] === r)!;
  row[10] = '一行目\n二行目';
  assert.equal(lines.call('saveEntry_', q), r, 'CRLFとLFのちがいで「変わった」にしない');
  // 本当に変わったときは、今までどおり断る
  assert.equal(code(() => lines.call('saveEntry_', { ...q, comment: '別の文' })).code, 'changed');
  assert.equal(h.call('retryNorm_', "'-x"), '-x'); assert.equal(h.call('retryNorm_', 'a\r\nb'), 'a\nb'); assert.equal(h.call('retryNorm_', "'ふつう"), "'ふつう");
});

/* ───────── r2-18 / r2-70 / r2-86：保護者が見る結果の画面 ───────── */

test('r2-18 / r2-70 / r2-86: 結果の画面は、成功＝緑と✓、失敗＝赤と✕、確認が必要＝黄色と⚠。問い合わせ先を出し、「写真をとって」と言う', () => {
  const h = harness(); h.ready(); h.call('openEntries');
  const ok = html(h.call('doPost', { parameter: h.params('live') }));
  assert.match(ok, /<h1>✓ 申し込みが完了しました<\/h1>/); assert.match(ok, /border:4px solid #bbf7d0/);
  assert.match(bare(ok), /この画面の写真をとってください/); assert.ok(!ok.includes('スクリーンショット'));
  assert.match(bare(ok), /問い合わせ：0200000000/);
  const bad = html(h.call('doPost', { parameter: h.params('live', { consent: '' }) }));
  assert.match(bad, /<h1>✕ 送れませんでした<\/h1>/); assert.match(bad, /border:4px solid #b91c1c/); assert.match(bad, /background:#fef2f2/);
  assert.match(bare(bad), /問い合わせ：0200000000/); assert.ok(!bad.includes('#bbf7d0'), '失敗に緑を使わない');
  const maybe = html(h.call('resultPage_', '', '保存を確認できませんでした', { code: 'storage', retryable: true }, h.params('live')));
  assert.match(maybe, /<h1>⚠ 保存結果の確認が必要です<\/h1>/); assert.match(maybe, /border:4px solid #ca8a04/); assert.match(maybe, /background:#fefce8/);
  assert.match(bare(maybe), /同じ内容で、保存を確認・再開します/); assert.ok(!bare(maybe).includes('申込番号'), '保護者が見た覚えのない「申込番号」と言わない');
  assert.match(maybe, /<button>同じ申込を確認・再開する<\/button>/, 'ボタンの名前は変えない');
  // 締切後・満席・変更の失敗にも、問い合わせ先
  h.setSetting('申込締切', '2020-01-01'); h.setSetting('開催日', '2020-01-02');
  const closed = html(h.call('doPost', { parameter: h.params('live') }));
  assert.match(closed, /現在、申し込みを受け付けていません/); assert.match(bare(closed), /問い合わせ：0200000000/);
  // 設定が読めないとき（①の前）は、問い合わせ先を出さずに、落ちない
  const before = harness();
  assert.doesNotThrow(() => before.call('resultPage_', '', 'x', { code: 'input', retryable: false }, {}));
  // 言葉をそろえる（リンク・DriveやGmail・全角のコロン）
  const event = html(h.call('doPost', { parameter: { ...h.params('live'), eventId: 'other' } }));
  assert.match(event, /主催者から新しいリンクをもらってください/); assert.ok(!event.includes('新しいURL'));
  const text = GS;
  assert.ok(!text.includes('Driveや Gmail'));
  assert.ok(!text.includes('アプリの画面にもどる'));
  assert.match(text, /'設定：'/); assert.match(text, /'自動テスト：'/); assert.match(text, /'受付：'/); assert.match(text, /'締切：'/);
  // 保護者が見る「直す所」の名前にも「申込番号」を使わない（保護者が見るのは受付番号だけ）
  const noId = html(h.call('doPost', { parameter: { ...h.params('live'), requestId: '' } }));
  assert.ok(!bare(noId).includes('申込番号'), '「直す所」に、見た覚えのない「申込番号」と書かない');
});

/* ───────── r2-71 / r2-135：ZIPが止まるとき、どの写真か ───────── */

test('r2-71 / r2-135: 名簿ZIPが写真で止まるときは、受付番号と理由（ゴミ箱・見つからない・共有）を言う', () => {
  const make = () => { const h = harness(); h.ready(); h.call('openEntries'); const ids = [1, 2, 3].map(() => h.call('saveEntry_', h.params('live'))); return { h, ids }; };
  const photoOf = (h: ReturnType<typeof harness>, id: string) => {
    const row = h.rows(OS).find((r) => r[0] === id)!;
    return h.resources.get(String(row[10]).match(/\/d\/([\w-]+)/)![1])!;
  };
  const trashed = make(); photoOf(trashed.h, trashed.ids[1]).trashed = true;
  const t = code(() => trashed.h.call('exportTournament')).message;
  assert.ok(t.includes(trashed.ids[1])); assert.match(t, /ゴミ箱に入っています/); assert.match(t, /元に戻す/);
  const gone = make(); gone.h.resources.delete(photoOf(gone.h, gone.ids[2]).id);
  const g = code(() => gone.h.call('exportTournament')).message;
  assert.ok(g.includes(gone.ids[2])); assert.match(g, /見つかりません/); assert.ok(!/missing|No item/i.test(g), '英語の生のエラーを出さない');
  const open = make(); photoOf(open.h, open.ids[0]).sharing = 'ANYONE';
  const o = code(() => open.h.call('exportTournament')).message;
  assert.ok(o.includes(open.ids[0])); assert.match(o, /共有が、「制限付き」になっていません/);
  const fine = make();
  assert.ok(fine.h.call('exportTournament'), '問題がなければ、今までどおり作れる');
});

/* ───────── r2-81：言い方をそろえる ───────── */

test('r2-81: 日付の直し方は「2027年10月3日」。選ぶ欄の文に余分な空白が無い', () => {
  const h = harness(); h.call('onOpen'); h.fill({ 開催日: 'あした', 申込締切: 'あさって', 入場曲: 'はい' });
  const message = code(() => h.call('setupTournament')).message;
  assert.match(message, /「開催日」は、2027年10月3日 のように入れてください/);
  assert.match(message, /「申込締切」は、2027年9月20日 のように入れてください/);
  assert.match(message, /「入場曲」は、あり／なしのどれかにしてください/);
  assert.ok(!message.includes('2027-10-03') && !message.includes('2027-09-20') && !/ のどれか/.test(message));
});

/* ───────── r2-137：勝ち数と、画面に出る条件の文 ───────── */

test('r2-137: 「上のクラスにする勝ち数」と、条件の文の「N勝以上／N勝以下」がちがうときは、どの欄を直すか言って止まる', () => {
  const on = { クラス分け: 'あり' };
  const ok = harness(); ok.call('onOpen'); ok.fill(on); assert.doesNotThrow(() => ok.call('setupTournament'), '初期値は合っている');
  const five = harness(); five.call('onOpen'); five.fill({ ...on, 上のクラスにする勝ち数: '5' });
  const m = code(() => five.call('setupTournament')).message;
  assert.match(m, /「上のクラスの条件」の「3勝以上」と、「上のクラスにする勝ち数」の5が、ちがいます/);
  assert.match(m, /「下のクラスの条件」の「2勝以下」と、「上のクラスにする勝ち数」の5が、ちがいます（上のクラスは5勝以上なので、4勝以下に直してください）/);
  const lines = settingLines(m).map((l) => l.fixes.join(''));
  assert.ok(lines.some((l) => l.includes('セル B15・B20')), '上の条件はB15、勝ち数はB20');
  assert.ok(lines.some((l) => l.includes('セル B18・B20')), '下の条件はB18');
  // 合わせれば通る。「勝以上」が無い自由な文は、調べない
  const fixed = harness(); fixed.call('onOpen'); fixed.fill({ ...on, 上のクラスにする勝ち数: '5', 上のクラスの条件: '5勝以上（例：5勝0敗）', 下のクラスの条件: 'アマチュア。4勝以下' });
  assert.doesNotThrow(() => fixed.call('setupTournament'));
  const free = harness(); free.call('onOpen'); free.fill({ ...on, 上のクラスにする勝ち数: '5', 上のクラスの条件: '経験者', 下のクラスの条件: '初心者' });
  assert.doesNotThrow(() => free.call('setupTournament'));
  // クラス分けが「なし」のあいだは、何が書いてあっても止めない
  const off = harness(); off.call('onOpen'); off.fill({ 上のクラスにする勝ち数: '9' });
  assert.doesNotThrow(() => off.call('setupTournament'));
});

/* ───────── r2-131：長い settingsProblem ───────── */

test('r2-131: 長すぎる settingsProblem を捨てない（捨てると「直すところなし」と読める）。切りつめて、直すところがあることは残す', () => {
  const h = harness(); h.ready({ クラス分け: 'あり' });
  for (const [k, v] of Object.entries({ 大会名: 'あ'.repeat(301), 会場: 'あ'.repeat(301), 主催者名: 'あ'.repeat(301), 問い合わせ先: 'あ'.repeat(301), 上のクラスの名前: 'あ'.repeat(13), 下のクラスの名前: 'い'.repeat(13), 上のクラスの条件: 'あ'.repeat(61), 下のクラスの条件: 'い'.repeat(61), 上のクラスのルール: 'あ'.repeat(81), 下のクラスのルール: 'い'.repeat(81), 開催日: 'x', 申込締切: 'y', 入場曲: 'z' })) h.setSetting(k, v);
  const body = pingOf(h);
  assert.ok(body.settingsProblem.length > 0 && body.settingsProblem.length <= 600, 'Google側も600字で切る（' + body.settingsProblem.length + '）');
  const ping = parsePing(body);
  assert.ok(ping.settingsProblem && ping.settingsProblem.length > 0, '画面は捨てない');
  assert.equal(diagnose(ping).stage, 'bad-settings');
  const long = parsePing({ ...body, settingsProblem: '「会場」は300文字までにしてください。'.repeat(60) });
  assert.equal(long.settingsProblem!.length, 600, '長すぎても、切りつめて残す');
  assert.equal(diagnose(long).stage, 'bad-settings', '「ready」と読まない');
});

/* ───────── r2-68 / 69 / 72 / 73 / 82 / 84 / 87 / 92 ：画面の言葉と動き ───────── */

test('r2-68 / r2-73 / r2-92: 手順3の指しかた（上でなく下）・✓は1つ・読み取り欄の言い方・保存の時刻', () => {
  assert.ok(!PAGE_TEXT.includes('先に、上の「✕」の文のとおりに直します'));
  assert.match(PAGE, /先に、下の「✕」の文のとおりに直します/);
  assert.ok(!PAGE_TEXT.includes('const message = <p>{d.ok ?'), '✓は見出しの1つだけ');
  assert.match(PAGE, /const message = <p>\{m\}<\/p>;/);
  assert.ok(!PAGE_TEXT.includes('上の直しものを直して'), '「直しもの」という言い方をやめた');
  assert.match(PAGE, /stage === 'not-setup' \? 'まだ読み取れません。まず、シートのメニュー「Tournament OS」→「① 最初の設定」を押します/);
  assert.match(PAGE, /title="「設定」タブに書く"/);
  assert.ok(!PAGE_TEXT.includes('title="「設定」タブを書く"'));
  assert.match(PAGE, /✓ 進みぐあいを覚えました（\{savedAt\} に保存）/);
  assert.ok(!/✓ 進みぐあいを覚えました \{savedAt\}/.test(PAGE), '時計だけの表示（カウントダウンに見える）をやめた');
  // 画面の文に、色の名前を使わない（印で言う）
  assert.ok(!/赤い|赤の|黄色|青い/.test(PAGE_TEXT.replace(/Googleの青いボタン/, '')), '赤・黄色・青の名前を使わない');
});

test('r2-63: 古いURLのうしろに新しいURLを貼っても、新しいほうを使い、黄色の注意で知らせる（緑の「自動で直しました」にしない）', () => {
  assert.match(PAGE, /function cleanUrl\(raw: string, previous = ''\)/);
  assert.match(PAGE, /distinct\.filter\(\(u\) => u !== previous\.trim\(\)\)/);
  assert.match(PAGE, /urlFix && urlFix\.multi\s*\n?\s*\? <Caution[^>]*lead="2つのURLが入っていました。新しく貼ったほうのURLを使います。"/);
  assert.match(PAGE, /const r = cleanUrl\(raw, endpoint\);/);
});

test('r2-69: URLが無いときは「設定を書き出す」を押せない（🔒と理由）。書き出したあとの片づけは30秒あと', () => {
  assert.match(PAGE, /aria-disabled=\{!urlOk \|\| undefined\} aria-describedby="export-why" onClick=\{download\}/);
  assert.match(PAGE, /URLがまだ入っていません。手順2でURLを貼ると押せます/);
  assert.match(PAGE, /if \(!isAppsScriptUrl\(endpoint\)\) \{ setFileNote\(\{ kind: 'warn'/);
  assert.match(PAGE, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 30000\)/);
  assert.ok(!/a\.click\(\); URL\.revokeObjectURL\(url\)/.test(PAGE));
});

test('r2-72: 「つながりを確かめてあります」（緑）は、受付が使える形のときだけ保存する。使えないときは、試合の準備の画面で「つながったが、まだ使えない」', () => {
  assert.match(PAGE, /\['need-open', 'ready', 'closed'\]\.includes\(diagnose\(next\)\.stage\)/);
  assert.match(PAGE, /setVerifiedUrl\(usable \? checked : ''\); setConnectedUrl\(checked\)/);
  const prep = read('app/private/page.tsx');
  assert.match(prep, /saved\.verified === true \? 'yes' : saved\.connected === true \? 'blocked' : 'entered'/);
  assert.match(prep, /申し込みページは、つながりました。でも、受付はまだ使えません/);
  assert.match(prep, /に確かめました/);
});

test('r2-82: 「よくある4つ」の表は、Googleの本当の文と同じ形。共有はシートと写真フォルダの両方', () => {
  assert.match(PAGE, /'「（タブの名前）」タブのC1が「（いまの文字）」になっています。「（あるべき文字）」に直してください。'/);
  assert.match(PAGE, /Googleドライブの「Tournament OS 顔写真」フォルダも、同じように「制限付き」にする/);
  assert.ok(!PAGE_TEXT.includes('タブの1行目の…が'));
});

test('r2-84: 同じものは同じ名前。画面＝「選手の受付をつくる」、選手が見る入力画面＝「申し込みページ」', () => {
  const prep = read('app/private/page.tsx');
  assert.ok(!prep.includes('申し込みページをつくる画面'));
  assert.ok(!prep.includes('この大会の申し込みページを作る'));
  assert.match(prep, /選手の受付をつくる画面へ →/);
  assert.ok(!PAGE_TEXT.includes('申込画面') && !PAGE_TEXT.replace(/テスト申込|申込原本/g, '').includes('申込ページ'));
  assert.match(PAGE, /テスト用の申し込みページを開く（新しいタブ）/);
  assert.match(PAGE, /任意：本物の申し込みページでも、テストしてみる/);
  // 説明の文書も、同じ名前
  assert.match(read('docs/EASY_SETUP_GUIDE.md'), /「選手の受付をつくる」からも開けます/);
});

test('r2-87: 画面の文の「例」と「：」は全角でそろえる', () => {
  assert.ok(!PAGE_TEXT.includes('英語のときは: '));
  const prep = read('app/private/page.tsx');
  assert.ok(!/placeholder="例: /.test(prep), '入力例は「例：」');
  assert.ok(!prep.includes('選んだファイル: '));
});

/* ───────── r2-99 / 101 / 107 / 108：キーボードと読み上げ ───────── */

test('r2-99: 手順の帯が低い画面で固定されない（tos-nav）。r2-101: 「できた ✓」のあと、目印が次のボタンに移る。r2-107/108: 同じ名前のボタンに、どの作業かを足す', () => {
  assert.match(PAGE, /<nav aria-label="3つの手順" className="tos-nav sticky top-0/);
  assert.match(read('app/globals.css'), /@media \(max-height: 500px\) \{\s*\.tos-nav \{\s*position: static;/);
  assert.match(PAGE, /document\.getElementById\(ticks\[i\] \? 'card-done-' \+ \(i \+ 1\) : i < 3 \? 'card-done-' \+ \(i \+ 2\) : 'go2-btn'\)\?\.focus\(\)/);
  assert.match(PAGE, /id=\{'card-done-' \+ n\}[^>]*aria-describedby=\{'card-title-' \+ n \+ ' card-why-' \+ n\}[^>]*onKeyDown=\{\(e\) => \{ if \(e\.repeat\) e\.preventDefault\(\); \}\}/, 'Enterを押しっぱなしで、次の作業まで✓にしない');
  assert.match(PAGE, /<summary aria-describedby=\{'card-title-' \+ n\}/);
  assert.match(PAGE, /'まだ押せません。先に、前の手順を終えます'/, '押せない手順の理由を、読み上げにも出す（手順の数字は入れない：「手順2」を探すボタンの名前とまじらない）');
  const cards = read('app/private/cards.tsx');
  assert.ok((cards.match(/aria-describedby=\{title\}/g) ?? []).length >= 9, '対戦カードの同じ名前のボタン・欄に、第N試合の名前がつながる');
  assert.match(cards, /summaryDescribedBy=\{title\}/);
  const prep = read('app/private/page.tsx');
  assert.match(prep, /aria-describedby=\{copyLockedWhy \|\| backupBusy \|\| justMade \? 'copy-lock-why' : undefined\}/);
  assert.match(prep, /<LockReason id="restore-lock-why">/);
  assert.ok(!/<label aria-disabled=\{restoreLocked/.test(prep), 'label に aria-disabled を付けない');
});

test('r2-111: 他のジム用の入力画面は、専門用語（Cloudflare）を使わず、写真のボタンは48px以上', () => {
  const entry = read('app/private/entry/page.tsx');
  assert.ok(!entry.includes('Cloudflare'));
  assert.match(entry, /インターネットへ送信されません/);
  assert.match(entry, /file:min-h-12/);
  assert.ok(!/className="mt-3 block w-full text-sm"/.test(entry));
});

test('r2-121: 終わった大会は、このパソコンから消せる（コピーのファイルを作ったあとだけ）。Googleのほうの片づけ方も画面と文書に書いてある', () => {
  const store = read('app/lib/privateStore.ts');
  assert.match(store, /export async function deletePrivateEvent\(eventId: string\)/);
  assert.match(store, /objectStore\(STORE\)\.delete\(eventId\)/);
  const prep = read('app/private/page.tsx');
  assert.match(prep, /const deleteReady = everSaved && !dirty && backupAt > 0 && !backupStale;/);
  assert.match(prep, /id="delete-event-btn"[^>]*aria-disabled=\{!deleteReady \|\| undefined\}/);
  assert.match(prep, /label="確認：この大会をこのパソコンから消すか"/);
  assert.match(prep, /選手 ' \+ nFighters \+ '人・写真 '/);
  assert.match(prep, /dangerLabel="この大会を、このパソコンから消す"/);
  assert.match(PAGE, /title="大会が終わったら（あとかたづけ）"/);
  assert.match(PAGE, /Tournament OS 顔写真」フォルダも、「ゴミ箱に移動」/);
  assert.match(read('docs/EASY_SETUP_GUIDE.md'), /## 大会が終わったら/);
});

test('r2-126: 保存ずみの大会にも、シートの設定（クラス・書いてもらうこと）が入っていなければ、だまって捨てず、黄色の注意で聞く', () => {
  const prep = read('app/private/page.tsx');
  assert.match(prep, /if \(saved\) \{\s*const fromSheet = entryConfigFromHash\(hash\)/);
  assert.match(prep, /id="apply-sheet-config"[\s\S]{0,400}シートの設定を入れる/);
  assert.match(prep, /id="skip-sheet-config"/);
  assert.match(prep, /setTopNotes\(notes\); setSheetCfg\(sheetNew\);/);
});

test('r2-94 / r2-166: 赤と青のクラスがちがう注意に、ルールの（ ）の説明を足す。名簿ZIPの手順は、シートの探し方とZIPの意味を言う', () => {
  assert.match(read('app/private/cards.tsx'), /ことばの説明：\{note\}/);
  assert.match(PAGE, /DEFAULT_CLASS_SETTINGS\.upper\.rule/);
  const prep = read('app/private/page.tsx');
  assert.match(prep, /Googleのシートを開く（ブラウザの一番上に並んだ名前の中から、Googleのシートを押す）/);
  assert.match(prep, /「④ OS用の名簿ZIPを作る」を押す（選手のリストのZIPです）/);
});
