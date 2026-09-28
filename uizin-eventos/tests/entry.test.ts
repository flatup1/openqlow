import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntryConfig, normalizeEntryInput, validateEntry, validateEntryConfig } from '../core/entry.ts';
import { readFileSync } from 'node:fs';

const valid = {
  fighterName: '選手A', fighterKana: 'せんしゅえー', gym: 'テストジム', gender: '男性', grade: '小学6年', age: '12',
  category: 'キッズ', height: '150.5', weight: '35.0', experience: '1〜3試合', record: '2戦1勝1敗', canFightTwice: '可能',
  comment: '最後まで頑張ります', musicChoice: 'あり', musicUrl: 'https://music.apple.com/jp/song/123', contactName: '保護者A',
  contactPhone: '090-1234-5678', contactEmail: 'test@example.com', consentPublicity: true, consentRules: true,
  website: '',
};

test('entry validation accepts a complete reusable tournament entry', () => {
  assert.deepEqual(validateEntry(normalizeEntryInput(valid)), []);
});

test('entry validation rejects impossible measurements, missing consent and unsafe music hosts', () => {
  const entry = normalizeEntryInput({ ...valid, age: '2', height: '500', weight: '500', musicUrl: 'https://example.com/song', consentRules: false });
  const errors = validateEntry(entry).join('\n');
  assert.match(errors, /年齢/); assert.match(errors, /身長/); assert.match(errors, /体重/); assert.match(errors, /Apple Music/); assert.match(errors, /同意/);
});

test('walkout music can be disabled per event and an enabled choice requires its URL', () => {
  const withoutUrl = normalizeEntryInput({ ...valid, musicChoice: 'あり', musicUrl: '' });
  assert.match(validateEntry(withoutUrl).join('\n'), /曲のURL/);
  const config = normalizeEntryConfig({ title: '大会A', organizer: '主催A', date: '日', venue: '会場', deadline: '締切', usesWalkoutMusic: false });
  assert.equal(config.usesWalkoutMusic, false);
  assert.equal(normalizeEntryConfig({}).usesWalkoutMusic, true);
});

test('entry text is trimmed and bounded before it reaches storage', () => {
  const entry = normalizeEntryInput({ ...valid, fighterName: '  A  ', comment: 'x'.repeat(700) });
  assert.equal(entry.fighterName, 'A'); assert.equal(entry.comment.length, 500);
});

test('generic entry site config requires only event-specific facts', () => {
  const config = normalizeEntryConfig({ title: '大会A', organizer: '主催A', date: '2027-09-23', venue: '会場A', deadline: '2027-09-01', published: true });
  assert.deepEqual(validateEntryConfig(config), []); assert.equal(config.published, true);
});

test('Google Sheets master template prevents duplicate receipts and formula injection', () => {
  const source = readFileSync(new URL('../docs/templates/entry-sheet-apps-script.gs', import.meta.url), 'utf8');
  assert.match(source, /receipts\.indexOf/);
  assert.match(source, /\^\[=\+\\-@\]/);
  assert.match(source, /LockService\.getScriptLock/);
  assert.match(source, /body\.action === 'list'/);
});

test('matchmaking source is operator-only and never exposes a photo without publicity consent', () => {
  const source = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
  assert.match(source, /entryOperatorPath[^\n]+\/api\/entries\/source/);
  assert.match(source, /photoUrl: entry\.consentPublicity === true/);
});

test('beginner admin screen avoids unexplained technical labels in the normal path', () => {
  const source = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  // 1画面に「いまやること」は1つだけ。大きな「次へ」「もどる」で進む。
  assert.match(source, /いまやること/);
  assert.match(source, /次へ進む →/);
  assert.match(source, /← もどる/);
  assert.match(source, /募集ページのリンクをコピー/);
  assert.doesNotMatch(source, />Worker URL</);
  assert.doesNotMatch(source, />matches CSV/);
  for (const label of ['大会を決める', '選手を募集', '最初だけ接続', '選手を読む', '対戦を作る']) assert.match(source, new RegExp(label));
  assert.match(source, /function CoachIllustration/);
  assert.match(source, />RED<\/text>/);
  assert.match(source, />BLUE<\/text>/);
  assert.match(source, /ここは自分で設定しません/);
  assert.match(source, /AIへお願いする文章をコピー/);
  assert.match(source, /接続できています/);
  assert.match(source, /AI・詳しい人だけが開く接続設定/);
  assert.doesNotMatch(source, />② 操作キー/);
  assert.match(source, /この画面は、AIと一緒に大会を作るための画面です/);
  assert.match(source, /AIに送る文章をコピー/);
  assert.match(source, /スクリーンショットをAIへ送って/);
});

test('entry form makes the fighter photo unmistakable and required', () => {
  const page = readFileSync(new URL('../app/entry/page.tsx', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
  assert.match(page, /選手の顔写真/);
  assert.match(page, /必須・ここで写真を選びます/);
  assert.match(page, /alt="選んだ顔写真の確認"/);
  assert.match(page, /type="file"[^>]+required/);
  assert.match(worker, /if \(!photo\).*顔写真を選んでください/);
});
