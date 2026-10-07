import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTournament, isLocalTournament, validateTournament, type LocalBout, type LocalFighter, type LocalTournament } from '../core/privateTournament.ts';
import { boutProblems, dropBlankBouts, importErrorText, ImportProblem, isBlankBout, isHalfBout, isTitleReal, nextActionKey, sameExceptProgress, unplacedFighters, weightGap, type NextState } from '../app/private/logic.ts';

const fighter = (id: string, over: Partial<LocalFighter> = {}): LocalFighter => ({ id, gym: 'テストジム', name: '架空' + id, grade: '', age: '', height: '', weight: '60', record: '', comment: '', musicUrl: '', photoDataUrl: '', ...over });
const bout = (id: string, redId = '', blueId = ''): LocalBout => ({ id, redId, blueId, className: '', rule: '' });
const base = (over: Partial<LocalTournament> = {}): LocalTournament => ({ ...emptyTournament('logic-test'), title: '架空大会', fighters: [fighter('A'), fighter('B'), fighter('C')], ...over });

test('空の試合は保存で取り除かれ、いまの試合の番号がはみ出さない', () => {
  const value = base({ bouts: [bout('1', 'A', 'B'), bout('2'), bout('3', 'C')], currentBout: 2 });
  const result = dropBlankBouts(value);
  assert.deepEqual(result.bouts.map((b) => b.id), ['1', '3']);
  assert.equal(result.currentBout, 1);
  assert.equal(isLocalTournament(result), true);
  assert.equal(isLocalTournament(value), true);
  assert.equal(dropBlankBouts(base()).bouts.length, 0);
  assert.equal(isLocalTournament(dropBlankBouts(base({ bouts: [bout('x')], currentBout: 0 }))), true);
});

test('1人だけ入った試合は残り、問題として場所つきで出る', () => {
  assert.equal(isHalfBout(bout('1', 'A')), true);
  assert.equal(isBlankBout(bout('1')), true);
  assert.deepEqual(boutProblems(bout('1'), 0, []), []);
  const half = boutProblems(bout('1', 'A'), 1, base().fighters);
  assert.equal(half.length, 1); assert.equal(half[0].side, 'blue'); assert.match(half[0].text, /第2試合の青コーナー/);
  assert.equal(dropBlankBouts(base({ bouts: [bout('1', 'A')] })).bouts.length, 1);
});

test('試合ごとの問題は validateTournament と同じ条件で出る', () => {
  const fighters = base().fighters;
  const cases: Array<[LocalBout, boolean]> = [[bout('a', 'A', 'B'), true], [bout('b', 'A', ''), false], [bout('c', '', 'B'), false], [bout('d', 'A', 'A'), false], [bout('e', 'A', 'ZZ'), false]];
  for (const [b, ok] of cases) {
    const core = validateTournament({ ...base(), bouts: [b] }).filter((e) => e.includes('第1試合'));
    assert.equal(boutProblems(b, 0, fighters).length === 0, ok, b.id);
    assert.equal(core.length === 0, ok, b.id);
  }
});

test('次にやることは決まった順番で1つだけ出る', () => {
  const s: NextState = { titleReal: true, dateOk: true, fighters: 4, nonBlankBouts: 2, halfIndex: -1, dirty: false, everSaved: true, problems: 0, opened: false };
  assert.equal(nextActionKey({ ...s, titleReal: false }), 'title');
  assert.equal(nextActionKey({ ...s, dateOk: false }), 'date');
  assert.equal(nextActionKey({ ...s, fighters: 0 }), 'fighters');
  assert.equal(nextActionKey({ ...s, fighters: 1 }), 'fighters2');
  assert.equal(nextActionKey({ ...s, nonBlankBouts: 0 }), 'bouts');
  assert.equal(nextActionKey({ ...s, halfIndex: 1 }), 'half');
  assert.equal(nextActionKey({ ...s, dirty: true }), 'save');
  assert.equal(nextActionKey({ ...s, problems: 1 }), 'fix');
  assert.equal(nextActionKey(s), 'open');
  assert.equal(nextActionKey({ ...s, opened: true }), 'done');
});

test('大会名未設定は、まだ名前がない扱い', () => {
  assert.equal(isTitleReal('大会名未設定'), false);
  assert.equal(isTitleReal('  '), false);
  assert.equal(isTitleReal('架空大会'), true);
});

test('体重差・未配置・進み具合だけの違いを見分ける', () => {
  assert.equal(weightGap(fighter('A', { weight: '60' }), fighter('B', { weight: '61.5kg' })), 1.5);
  assert.equal(weightGap(fighter('A', { weight: '' }), fighter('B')), null);
  assert.deepEqual(unplacedFighters(base().fighters, [bout('1', 'A', 'B')]).map((f) => f.id), ['C']);
  const a = base({ bouts: [bout('1', 'A', 'B')], currentBout: 0 });
  assert.equal(sameExceptProgress(a, { ...a, currentBout: 0, updatedAt: a.updatedAt + 5 }), true);
  assert.equal(sameExceptProgress(a, { ...a, title: '別' }), false);
  assert.equal(sameExceptProgress(a, { ...a, bouts: [bout('1', 'B', 'A')] }), false);
});

test('取り込みエラーは固定の日本語で、ライブラリの文や記号を出さない', () => {
  assert.match(importErrorText(new ImportProblem('no-list')), /「④ OS用の名簿ZIPを作る」/);
  assert.match(importErrorText(new ImportProblem('no-sheet')), /「選手入力」というシート/);
  assert.match(importErrorText(new ImportProblem('blocked'), ['電話番号']), /電話番号/);
  assert.match(importErrorText(new Error('同じ管理番号が2つあります。')), /同じ選手が2回/);
  const unknown = importErrorText(new Error('Invalid zip data at 0x1'));
  assert.doesNotMatch(unknown, /Invalid|0x/);
  assert.match(unknown, /読み込めませんでした/);
});
