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
  assert.match(source, /番号どおりに、上から下へ/);
  assert.match(source, /募集ページのリンクをコピー/);
  assert.doesNotMatch(source, />Worker URL</);
  assert.doesNotMatch(source, />matches CSV/);
  assert.match(source, /絵を見ながら、大会を作ろう/);
  assert.match(source, /全部で5ステップです/);
  for (const label of ['大会を決める', '募集を書く', '最初だけ接続', '選手を読む', '対戦を作る']) assert.match(source, new RegExp(label));
  assert.match(source, /function CoachIllustration/);
});
