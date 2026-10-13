/**
 * 仕上げ（setup 担当）の回帰テスト。会長が「設定」タブを書き、メニュー①〜⑤を押し、/private/setup/ で確かめる道すじの、
 * 迷いやすい所を1つずつ固定する。Googleは本物ではなく、模擬（tests/helpers/gasV3Harness.ts）。
 * 本物のGoogleでしか確かめられないこと（権限の確認が1回で済むか・メニューの箱の見え方）は、ここでは確かめられない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { diagnose, entryConfigFromPing, EXPECTED_RECEPTION_BUILD, isOldBrowser, parsePing } from '../core/setupV3.ts';
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
  assert.match(inserted.message, /「OS取込用（連絡先なし）」タブの1行目に、列が足されています（C1）。足したC列を消してください。/);
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
  const cells = Object.fromEntries([...PAGE.matchAll(/(?:const CELL: Record<string, string> = |const CLASS_CELL: Record<string, string> = )\{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/([^\s:,{]+): '(B\d+)'/g)].map((x) => [x[1], x[2]])));
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
  assert.match(h.alerts.at(-1)!, /設定: 済み/);
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
  assert.match(bad, /<h1>送れませんでした<\/h1>/); assert.match(bad, /個人情報の取扱いへの同意が必要です/);
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
