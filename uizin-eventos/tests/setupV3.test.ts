import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagnose, entryConfigFromPing, EXPECTED_RECEPTION_BUILD, exportSetup, importSetup, isTemplateCopyLink, parsePing, parsePingText, pingUrl, templateCopyLink } from '../core/setupV3.ts';
import { publicEntryConfig, publicEntryHash, publicEntryReady } from '../core/publicEntry.ts';
import { harness } from './helpers/gasV3Harness.ts';

const endpoint = 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec';
const full = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: false, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: 'テスト大会', date: '2099-12-01', venue: '体育館', venueUrl: '', organizer: '主催ジム', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
const ping = (over: Record<string, unknown> = {}) => parsePing({ ...full, ...over });

test('v3: 画面が期待する版は、Googleのスクリプトの版と同じ', () => {
  const gs = readFileSync(new URL('../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8');
  assert.ok(gs.includes("const RECEPTION_BUILD = '" + EXPECTED_RECEPTION_BUILD + "'"));
  const served = readFileSync(new URL('../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8');
  assert.equal(served, gs);
});

test('v3: pingのURLは公式の受付URLだけ。他のURLは作らない', () => {
  assert.equal(pingUrl(endpoint), endpoint + '?action=ping');
  for (const bad of ['', 'https://example.com/exec', endpoint + '?x=1', 'http://script.google.com/macros/s/A/exec', 'https://script.google.com/macros/s/A/dev']) assert.throws(() => pingUrl(bad), /URL/);
});

test('v3: pingの答えは形を確かめ、別のアプリや壊れた答えは拒否し、知らない項目は捨てる', () => {
  assert.equal(ping().title, 'テスト大会');
  for (const bad of [null, {}, { app: 'x' }, { app: 'tournament-os', protocol: 2, build: 'a', ready: true }, { app: 'tournament-os', protocol: 3, build: 1, ready: true }, 'text']) assert.throws(() => parsePing(bad), /Tournament OS/);
  const extra = parsePing({ ...full, ownerEmail: 'secret@example.com', setupKey: 'x' }) as unknown as Record<string, unknown>;
  assert.equal(extra.ownerEmail, undefined); assert.equal(extra.setupKey, undefined);
  assert.equal(ping({ grade: 'strange' }).grade, undefined, '知らない選択肢は捨てる');
  assert.equal(ping({ title: 'a'.repeat(400) }).title, undefined, '長すぎる文字は捨てる');
});

test('v3: 画面は迷う原因を1行で言う（古い版・設定前・設定の間違い・自動テスト前・受付前・OK）', () => {
  assert.equal(diagnose(ping({ build: '3.0.0' })).stage, 'old-build');
  assert.equal(diagnose(ping({ ready: false })).stage, 'not-setup');
  const bad = diagnose(ping({ settingsProblem: '「設定」タブの、次の欄を入れてください：会場' }));
  assert.equal(bad.stage, 'bad-settings'); assert.match(bad.message, /会場/);
  const full2 = diagnose(ping({ storageProblem: 'Googleの保存容量が、ほとんど残っていません（あと約10MB）。' }));
  assert.equal(full2.stage, 'storage-full'); assert.match(full2.message, /保存容量/); assert.equal(full2.ok, false);
  assert.equal(diagnose(ping({ testComplete: false })).stage, 'need-selftest');
  assert.equal(diagnose(ping()).stage, 'need-open');
  const ok = diagnose(ping({ accepting: true }));
  assert.equal(ok.stage, 'ready'); assert.equal(ok.ok, true);
  for (const over of [{ build: 'x' }, { ready: false }, { settingsProblem: 'x' }, { storageProblem: 'x' }, { testComplete: false }, {}]) assert.equal(diagnose(ping(over)).ok, false);
});

test('v3: 申込ページへ渡す情報は、Googleから読んだ設定だけ。足りなければ作らず、鍵は入れない', () => {
  const live = entryConfigFromPing(ping({ accepting: true, music: true, grade: 'required' }), endpoint, 'live');
  assert.equal(live.protocol, '3'); assert.equal(live.mode, 'live'); assert.equal(live.eventId, 'tos-0123456789');
  assert.equal(live.date, '2099年12月1日'); assert.equal(live.deadline, '2099-11-30'); assert.equal(live.music, true); assert.equal(live.grade, 'required');
  assert.equal(live.entryKey, undefined);
  assert.equal(publicEntryReady(live), true);
  assert.deepEqual(publicEntryConfig(publicEntryHash(live)), { ...live, venueUrl: '' });
  for (const missing of ['title', 'date', 'venue', 'organizer', 'contact', 'deadline', 'eventId']) assert.throws(() => entryConfigFromPing(ping({ [missing]: undefined }), endpoint, 'live'), /設定/);
  assert.throws(() => entryConfigFromPing(ping(), 'https://evil.example/exec', 'live'), /設定/);
});

test('v3: 「コピーを作る」リンクはスプレッドシートのURLからだけ作れる', () => {
  const id = 'A'.repeat(30);
  assert.equal(templateCopyLink('https://docs.google.com/spreadsheets/d/' + id + '/edit#gid=0'), 'https://docs.google.com/spreadsheets/d/' + id + '/copy');
  assert.ok(isTemplateCopyLink(templateCopyLink('https://docs.google.com/spreadsheets/d/' + id + '/edit')));
  for (const bad of ['', 'https://example.com/spreadsheets/d/' + id, 'https://docs.google.com/document/d/' + id + '/edit']) assert.throws(() => templateCopyLink(bad), /スプレッドシート/);
  assert.equal(isTemplateCopyLink('javascript:alert(1)'), false);
  const link = JSON.parse(readFileSync(new URL('../public/template-link.json', import.meta.url), 'utf8')).copyUrl;
  assert.equal(link === '' || isTemplateCopyLink(link), true);
});

test('v3: 設定ファイルは名札と受付URLだけ。書き出して読み戻せ、メール・確認コードが入るなら止め、壊れたものは読まない', () => {
  const base = { eventId: 'test-cup', endpoint };
  assert.deepEqual(importSetup(exportSetup(base)), { kind: 'tournament-os-setup', version: 2, ...base });
  assert.deepEqual(importSetup(exportSetup({ eventId: 'a', endpoint: '' })).endpoint, '');
  assert.throws(() => exportSetup({ eventId: 'a@example.com', endpoint }), /止めました/);
  assert.throws(() => exportSetup({ eventId: 'ok', endpoint: 'TOS2.{}' }), /止めました/);
  const ok = { kind: 'tournament-os-setup', version: 2, eventId: 'ok', endpoint: '' };
  for (const bad of ['', 'not json', '{}', 'null', JSON.stringify({ ...ok, version: 1 }), JSON.stringify({ ...ok, eventId: 'Bad ID' }), JSON.stringify({ ...ok, endpoint: 'https://evil.example/exec' }), JSON.stringify({ ...ok, eventId: 5 })]) assert.throws(() => importSetup(bad));
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

test('v3: 画面のコードに、個人情報の保存・外部送信・鍵の扱い・設定の二重入力がない', () => {
  const page = readFileSync(new URL('../app/private/setup/page.tsx', import.meta.url), 'utf8');
  for (const word of ['contactPhone', 'contactEmail', 'setupKey', 'TOS2', 'sendBeacon', "method: 'POST'", 'XMLHttpRequest', '大会名未設定']) assert.ok(!page.includes(word), word);
  assert.equal((page.match(/fetch\(/g) || []).length, 3, 'fetchはひな形リンク・ひな形の取得・ping の3か所だけ');
  assert.ok(!/<input[^>]*value=\{(title|venue|organizer|contact|date|deadline)\}/.test(page), '大会名・会場などを、この画面で入れ直させない');
});

test('v3: 自動確認が使えないときは、貼った文字からも同じ診断ができ、壊れた文字・別のアプリは断る', () => {
  const text = JSON.stringify(full);
  assert.equal(diagnose(parsePingText('  ' + text + '\n')).stage, 'need-open');
  for (const bad of ['', 'こんにちは', '{', '[]', '{"app":"other"}', '<html>x</html>']) assert.throws(() => parsePingText(bad));
});

test('つなぎ目: Googleのスクリプトの返事を画面側が読み、設定前→受付前→受付中と進み、そのリンクで本物の申込が通る', () => {
  const h = harness();
  const read = () => parsePing(JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text));
  assert.equal(diagnose(read()).stage, 'not-setup');
  h.call('onOpen'); h.fill();
  h.setSetting('会場', '');
  assert.throws(() => h.call('setupTournament'), /会場/);
  h.fill(); h.call('setupTournament');
  assert.equal(diagnose(read()).stage, 'need-open');
  assert.equal(diagnose(read()).ok, false);
  h.setSetting('主催者名', ''); assert.equal(diagnose(read()).stage, 'bad-settings'); h.setSetting('主催者名', '主催ジム');
  h.call('openEntries');
  assert.equal(diagnose(read()).stage, 'ready');
  const live = entryConfigFromPing(read(), endpoint, 'live'), test = entryConfigFromPing(read(), endpoint, 'test');
  assert.equal(publicEntryReady(live), true); assert.equal(publicEntryReady(test), true);
  const config = publicEntryConfig(publicEntryHash(live));
  const sent = h.params('live', { eventId: config.eventId, protocol: config.protocol || '' });
  const receipt = h.call('saveEntry_', sent);
  assert.match(String(receipt), /^[A-Z0-9-]+$/);
  assert.equal(h.rows('申込原本（個人情報あり）').length, 2);
  assert.equal(config.title, 'テスト大会'); assert.equal(config.deadline, '2099-11-30');
});
