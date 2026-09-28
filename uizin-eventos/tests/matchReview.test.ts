import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boutCounts, draftEventCsv, filterFighters, reviewDraftMatches, type DraftMatch, type MatchBuilderFighter } from '../core/matchBuilder.ts';
import { parseProgram, parseWeightDisplay } from '../core/sheet.ts';
import { normalizeEntryConfig } from '../core/entry.ts';

// すべて架空の選手
const F: MatchBuilderFighter[] = [
  { receiptNo: 'A', fighterName: '山田 太郎', fighterKana: 'ヤマダタロウ', gym: 'テストジム', weight: '30', photoUrl: 'x', comment: 'がんばる' },
  { receiptNo: 'B', fighterName: '佐藤 次郎', gym: '架空道場', weight: '30.5', photoUrl: 'x', comment: '勝つ' },
  { receiptNo: 'C', fighterName: '鈴木 三郎', gym: '架空道場', weight: '36', photoUrl: 'x', comment: '全力', canFightTwice: '不可' },
  { receiptNo: 'D', fighterName: '田中 四郎', gym: 'テストジム', weight: '', canFightTwice: '可' },
];
const m = (id: string, r: string, b: string): DraftMatch => ({ id, redReceipt: r, blueReceipt: b, className: '', rule: '' });

test('体重が近い試合には注意を出さない', () => {
  const [notes] = reviewDraftMatches([m('1', 'A', 'B')], F);
  assert.deepEqual(notes, []);
});

test('体重差が大きい試合は「確認してください」を出すが、止めない', () => {
  const [notes] = reviewDraftMatches([m('1', 'A', 'C')], F);
  assert.ok(notes.some((n) => n.level === 'warn' && /体重差が 6\.0kg/.test(n.text)));
});

test('体重・写真・意気込みが未登録なら分かるように出す', () => {
  const [notes] = reviewDraftMatches([m('1', 'A', 'D')], F);
  assert.ok(notes.some((n) => /体重が未登録/.test(n.text)));
  assert.ok(notes.some((n) => /写真・意気込みが未登録/.test(n.text)));
});

test('2試合目の選手を明示し、「2試合できない」申込なら注意にする', () => {
  const bouts = [m('1', 'A', 'C'), m('2', 'C', 'B')];
  assert.equal(boutCounts(bouts).get('C'), 2);
  const notes = reviewDraftMatches(bouts, F).flat();
  assert.ok(notes.some((n) => n.level === 'warn' && /鈴木 三郎さんは 2試合目.*2試合できない/.test(n.text)));
});

test('選手を名前・ふりがな・所属で絞り込める', () => {
  assert.deepEqual(filterFighters(F, 'やまだ').map((f) => f.receiptNo), []);
  assert.deepEqual(filterFighters(F, 'ヤマダ').map((f) => f.receiptNo), ['A']);
  assert.deepEqual(filterFighters(F, '架空').map((f) => f.receiptNo), ['B', 'C']);
  assert.equal(filterFighters(F, '').length, 4);
});

test('体重の出し方は大会ごとに選べて、既定は契約体重だけ', () => {
  assert.equal(parseWeightDisplay(''), 'contract');
  assert.equal(parseWeightDisplay('both'), 'both');
  assert.equal(parseWeightDisplay('none'), 'none');
  const p = parseProgram({ event: draftEventCsv({ title: 'T', venue: '', date: '', startAt: '', weightDisplay: 'none' }), matches: 'no,red_name,blue_name\n1,a,b', music: '' }, 0);
  assert.equal(p.meta.weightDisplay, 'none');
  const old = parseProgram({ event: 'key,value\ntitle,T', matches: 'no,red_name,blue_name\n1,a,b', music: '' }, 0);
  assert.equal(old.meta.weightDisplay, 'contract', '前からある大会は今までどおり');
});

test('写真を集めるかは大会ごとに選べて、既定は集める', () => {
  assert.equal(normalizeEntryConfig({}).usesPhoto, true);
  assert.equal(normalizeEntryConfig({ usesPhoto: false }).usesPhoto, false);
  assert.equal(normalizeEntryConfig({ weightDisplay: 'evil' }).weightDisplay, 'contract');
});

test('写真を集めない大会では、サーバーも写真を必須にしない', async () => {
  const { readFileSync } = await import('node:fs');
  const worker = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
  assert.match(worker, /usesPhoto === false\) photo = null/);
});
