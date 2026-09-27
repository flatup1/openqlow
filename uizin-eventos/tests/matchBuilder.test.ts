import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftEventCsv, draftMatchesCsv, draftMusicCsv, moveDraftMatch, swapDraftCorners, validateDraftMatches, type DraftMatch, type MatchBuilderFighter } from '../core/matchBuilder.ts';
import { parseProgram } from '../core/sheet.ts';

const fighters: MatchBuilderFighter[] = [
  { receiptNo: 'R1', fighterName: '赤選手', gym: '赤ジム', age: '10', height: '140', weight: '30.0', record: '2戦1勝', comment: '勝ちます', musicChoice: 'あり', musicUrl: 'https://music.apple.com/jp/song/1', photoUrl: 'https://example.com/red.jpg' },
  { receiptNo: 'B1', fighterName: '青選手', gym: '青ジム', age: '11', height: '145', weight: '31.0', record: '初試合', comment: 'がんばります', musicChoice: 'なし', musicUrl: '', photoUrl: 'https://example.com/blue.jpg' },
  { receiptNo: 'R2', fighterName: '次選手', gym: '次ジム', weight: '40.0' },
];

const bouts: DraftMatch[] = [
  { id: '1', redReceipt: 'R1', blueReceipt: 'B1', className: 'キッズ31kg契約', rule: 'キック' },
  { id: '2', redReceipt: 'R2', blueReceipt: 'B1', className: '一般', rule: 'キック' },
];

test('試合順を上下に入れ替えられる', () => {
  assert.deepEqual(moveDraftMatch(bouts, 1, -1).map((bout) => bout.id), ['2', '1']);
  assert.equal(moveDraftMatch(bouts, 0, -1), bouts);
});

test('赤コーナーと青コーナーを入れ替えられる', () => {
  const swapped = swapDraftCorners(bouts[0]);
  assert.equal(swapped.redReceipt, 'B1');
  assert.equal(swapped.blueReceipt, 'R1');
});

test('空欄と同一選手の対戦を保存前に止める', () => {
  assert.equal(validateDraftMatches([{ ...bouts[0], blueReceipt: '' }]).length, 1);
  assert.equal(validateDraftMatches([{ ...bouts[0], blueReceipt: 'R1' }]).length, 1);
  assert.deepEqual(validateDraftMatches(bouts), []);
});

test('作った対戦カードをEventOSが正しい順序と赤青で読める', () => {
  const program = parseProgram({
    event: draftEventCsv({ title: 'テスト大会', venue: '会場', date: '2027-01-01', startAt: '10:00' }),
    matches: draftMatchesCsv(bouts, fighters),
    music: draftMusicCsv(bouts, fighters, true),
  }, 0);
  assert.equal(program.matches.length, 2);
  assert.equal(program.matches[0].red.name, '赤選手');
  assert.equal(program.matches[0].blue.name, '青選手');
  assert.equal(program.matches[1].red.name, '次選手');
  assert.equal(program.matches[0].red.weight, '30.0');
  assert.equal(program.cues.filter((cue) => cue.kind === 'walkout_red').length, 1);
  assert.equal(program.cues[0].receiptNo, 'R1');
});

test('入場曲なしの大会では曲データを作らない', () => {
  const csv = draftMusicCsv(bouts, fighters, false);
  assert.equal(csv.split(/\r?\n/).length, 1);
});
