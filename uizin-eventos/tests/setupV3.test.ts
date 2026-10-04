import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagnose, EXPECTED_RECEPTION_BUILD, exportSetup, importSetup, isTemplateCopyLink, parsePing, parsePingText, pingUrl, settingsPaste, templateCopyLink } from '../core/setupV3.ts';
import { publicEntryConfig, publicEntryHash, publicEntryReady } from '../core/publicEntry.ts';
import { DEFAULT_ENTRY_CONFIG } from '../core/entryPackage.ts';

const endpoint = 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec';
const ping = (over: Record<string, unknown> = {}) => parsePing({ app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, eventId: 'test-cup', testComplete: false, accepting: false, deadline: '2099-11-30', ...over });

test('v3: 画面が期待する版は、Googleのスクリプトの版と同じ', () => {
  const gs = readFileSync(new URL('../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8');
  assert.ok(gs.includes("const RECEPTION_BUILD = '" + EXPECTED_RECEPTION_BUILD + "'"));
  const copy = readFileSync(new URL('../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8');
  assert.equal(copy, gs);
});

test('v3: pingのURLは公式の受付URLだけ。他のURLは作らない', () => {
  assert.equal(pingUrl(endpoint), endpoint + '?action=ping');
  for (const bad of ['', 'https://example.com/exec', endpoint + '?x=1', 'http://script.google.com/macros/s/A/exec', 'https://script.google.com/macros/s/A/dev']) assert.throws(() => pingUrl(bad), /URL/);
});

test('v3: pingの答えは形を確かめ、別のアプリや壊れた答えは拒否する', () => {
  assert.equal(ping().eventId, 'test-cup');
  for (const bad of [null, {}, { app: 'x' }, { app: 'tournament-os', protocol: 2, build: 'a', ready: true }, { app: 'tournament-os', protocol: 3, build: 1, ready: true }, 'text']) assert.throws(() => parsePing(bad), /Tournament OS/);
  const withExtra = parsePing({ app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, eventId: 'a', ownerEmail: 'secret@example.com' }) as unknown as Record<string, unknown>;
  assert.equal(withExtra.ownerEmail, undefined, '知らない項目は捨てる');
});

test('v3: 画面は迷う原因を1行で言う（古い版・設定前・別の大会・テスト前・受付前・OK）', () => {
  assert.equal(diagnose(ping({ build: '3.0.0' }), 'test-cup').stage, 'old-build');
  assert.equal(diagnose(ping({ ready: false }), 'test-cup').stage, 'not-setup');
  assert.equal(diagnose(ping({ eventId: 'other-cup' }), 'test-cup').stage, 'wrong-event');
  assert.equal(diagnose(ping(), 'test-cup').stage, 'need-test');
  assert.equal(diagnose(ping({ testComplete: true }), 'test-cup').stage, 'need-open');
  const ok = diagnose(ping({ testComplete: true, accepting: true }), 'test-cup');
  assert.equal(ok.stage, 'ready'); assert.equal(ok.ok, true);
  for (const stage of ['old-build', 'not-setup', 'wrong-event', 'need-test', 'need-open']) assert.equal(diagnose(ping(stage === 'old-build' ? { build: 'x' } : stage === 'not-setup' ? { ready: false } : stage === 'wrong-event' ? { eventId: 'z' } : stage === 'need-test' ? {} : { testComplete: true }), 'test-cup').ok, false);
});

test('v3: 「設定」タブに貼る7行は、大会ID・大会名・締切・項目の順で、メールや鍵を含まない', () => {
  const text = settingsPaste({ eventId: 'test-cup', title: '第1回\tテスト\n大会', deadlineIso: '2099-11-30', config: { music: true, grade: 'required', age: 'off', comment: 'optional' } });
  assert.deepEqual(text.split('\n'), ['test-cup', '第1回 テスト 大会', '2099-11-30', 'あり', '必須', 'なし', '任意']);
  assert.ok(!/@/.test(text));
  assert.equal(settingsPaste({ eventId: 'a', title: 'b', deadlineIso: '2099-01-01', config: DEFAULT_ENTRY_CONFIG }).split('\n').length, 7);
});

test('v3: 「コピーを作る」リンクはスプレッドシートのURLからだけ作れる', () => {
  const id = 'A'.repeat(30);
  assert.equal(templateCopyLink('https://docs.google.com/spreadsheets/d/' + id + '/edit#gid=0'), 'https://docs.google.com/spreadsheets/d/' + id + '/copy');
  assert.ok(isTemplateCopyLink(templateCopyLink('https://docs.google.com/spreadsheets/d/' + id + '/edit')));
  for (const bad of ['', 'https://example.com/spreadsheets/d/' + id, 'https://docs.google.com/document/d/' + id + '/edit']) assert.throws(() => templateCopyLink(bad), /スプレッドシート/);
  assert.equal(isTemplateCopyLink('javascript:alert(1)'), false);
  assert.equal(JSON.parse(readFileSync(new URL('../public/template-link.json', import.meta.url), 'utf8')).copyUrl === '' || isTemplateCopyLink(JSON.parse(readFileSync(new URL('../public/template-link.json', import.meta.url), 'utf8')).copyUrl), true);
});

test('v3: 設定ファイルは書き出して読み戻せ、メール・確認コードが入るなら止め、壊れたものは読まない', () => {
  const base = { eventId: 'test-cup', title: 'テスト大会', date: '2099年12月1日', venue: '体育館', venueUrl: '', organizer: '主催', contact: '090-0000-0000', deadline: '2099年11月30日', endpoint, config: { music: true, grade: 'required' as const, age: 'off' as const, comment: 'optional' as const } };
  const back = importSetup(exportSetup(base));
  assert.deepEqual({ ...back, kind: undefined, version: undefined }, { ...base, kind: undefined, version: undefined });
  assert.throws(() => exportSetup({ ...base, title: 'a@example.com' }), /止めました/);
  assert.throws(() => exportSetup({ ...base, venue: 'TOS2.{}' }), /止めました/);
  for (const bad of ['', 'not json', '{}', JSON.stringify({ kind: 'tournament-os-setup', version: 2 }), JSON.stringify({ kind: 'tournament-os-setup', version: 1, eventId: 'Bad ID', title: '', date: '', venue: '', venueUrl: '', organizer: '', contact: '', deadline: '', endpoint: '', config: {} }), JSON.stringify({ kind: 'tournament-os-setup', version: 1, eventId: 'ok', title: '', date: '', venue: '', venueUrl: '', organizer: '', contact: '', deadline: '', endpoint: 'https://evil.example/exec', config: {} })]) assert.throws(() => importSetup(bad));
});

test('v3: 受付リンクは鍵なしの protocol=3 で通り、旧protocol=2は鍵が要る。鍵のない2や知らない版は通らない', () => {
  const cfg = { endpoint, eventId: 'test-cup', title: 't', organizer: 'o', date: 'd', venue: 'v', venueUrl: '', deadline: '2099-11-30', contact: 'c', music: false, grade: 'optional' as const, age: 'optional' as const, comment: 'optional' as const };
  assert.equal(publicEntryReady({ ...cfg, protocol: '3', mode: 'test' }), true);
  assert.equal(publicEntryReady(publicEntryConfig(publicEntryHash({ ...cfg, protocol: '3', mode: 'live' }))), true);
  assert.equal(publicEntryReady({ ...cfg, protocol: '2', mode: 'test' }), false);
  assert.equal(publicEntryReady({ ...cfg, protocol: '2', mode: 'test', entryKey: 'k'.repeat(40) }), true);
  assert.equal(publicEntryReady({ ...cfg, protocol: '4', mode: 'test' }), false);
  assert.equal(publicEntryReady({ ...cfg, protocol: '3', mode: 'test', endpoint: 'https://evil.example/exec' }), false);
  assert.equal(publicEntryReady({ ...cfg, protocol: '3' }), false);
});

test('v3: 設定画面だけGoogleへの接続を許し、申込ページと準備画面は今までどおり閉じたまま', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const all = '\n' + headers; const rule = (path: string) => { const i = all.indexOf('\n' + path + '\n'); assert.ok(i >= 0, path); return all.slice(i + 1).split('\n\n')[0]; };
  const setup = rule('/private/setup/*');
  assert.match(setup, /connect-src 'self' https:\/\/script\.google\.com https:\/\/script\.googleusercontent\.com;/);
  assert.match(setup, /form-action 'none'/);
  assert.doesNotMatch(setup, /connect-src[^;]*https:\/\/(?!script\.google)/);
  assert.match(rule('/apply/*'), /connect-src 'none'/);
  for (const p of ['/private/', '/private/entry/*', '/private/live/*']) assert.match(rule(p), /connect-src 'self';/);
});

test('v3: 画面のコードに、個人情報の保存・外部送信・鍵の扱いがない', () => {
  const page = readFileSync(new URL('../app/private/setup/page.tsx', import.meta.url), 'utf8');
  for (const word of ['contactPhone', 'contactEmail', 'setupKey', 'TOS2', 'sendBeacon', "method: 'POST'", 'XMLHttpRequest']) assert.ok(!page.includes(word), word);
  assert.equal((page.match(/fetch\(/g) || []).length, 3, 'fetchはひな形リンク・ひな形の取得・ping の3か所だけ');
});

test('v3: 自動確認が使えないときは、貼った文字からも同じ診断ができ、壊れた文字・別のアプリは断る', () => {
  const text = JSON.stringify({ app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, eventId: 'test-cup', testComplete: true, accepting: false, deadline: '2099-11-30' });
  assert.equal(diagnose(parsePingText('  ' + text + '\n'), 'test-cup').stage, 'need-open');
  for (const bad of ['', 'こんにちは', '{', '[]', '{"app":"other"}', '<html>x</html>']) assert.throws(() => parsePingText(bad));
});
