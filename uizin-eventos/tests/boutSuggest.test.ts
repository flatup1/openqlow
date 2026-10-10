import assert from 'node:assert/strict';
import test from 'node:test';
import { boutProblems, dropBlankBouts, isBlankBout, nextAction, parseKg, suggestBouts, unplacedFighters, weightGap } from '../core/boutSuggest.ts';
import { WEIGHT_GAP_WARN_KG, boutWarnings, emptyTournament, isLocalTournament, validateTournament } from '../core/privateTournament.ts';
import type { LocalBout, LocalFighter } from '../core/privateTournament.ts';

const fighter = (id: string, gym: string, weight: string): LocalFighter => ({
  id, gym, name: '選手' + id, grade: '', age: '', height: '', weight, record: '', comment: '', musicUrl: '', photoDataUrl: '',
});
const bout = (id: string, redId: string, blueId: string): LocalBout => ({ id, redId, blueId, className: '', rule: '' });
const counter = () => { let n = 0; return () => 'new-' + (++n); };
const pairs = (bouts: LocalBout[]) => bouts.map((b) => b.redId + '-' + b.blueId);

test('空の名簿・1人だけなら案は作らない', () => {
  assert.deepEqual(suggestBouts([], [], counter()), []);
  assert.deepEqual(suggestBouts([fighter('F1', 'A', '40')], [], counter()), []);
});

test('6人3ジム: 体重が近い順に、ちがうジムどうしで3試合', () => {
  const fs = [
    fighter('F1', 'A', '30'), fighter('F2', 'B', '31'), fighter('F3', 'A', '40'),
    fighter('F4', 'B', '41'), fighter('F5', 'C', '50'), fighter('F6', 'A', '52'),
  ];
  const result = suggestBouts(fs, [], counter());
  assert.deepEqual(pairs(result), ['F1-F2', 'F3-F4', 'F5-F6']);
  assert.deepEqual(result.map((b) => b.id), ['new-1', 'new-2', 'new-3']);
  const used = result.flatMap((b) => [b.redId, b.blueId]);
  assert.equal(new Set(used).size, 6);
  for (const b of result) {
    const r = fs.find((f) => f.id === b.redId)!, bl = fs.find((f) => f.id === b.blueId)!;
    assert.notEqual(r.gym, bl.gym);
    assert.equal(b.className, '');
    assert.equal(b.rule, '');
  }
});

test('入力の順番が違っても体重順に組み、赤は名簿で先の人', () => {
  const fs = [fighter('F1', 'A', '52'), fighter('F2', 'B', '30'), fighter('F3', 'C', '31'), fighter('F4', 'D', '51')];
  assert.deepEqual(pairs(suggestBouts(fs, [], counter())), ['F2-F3', 'F1-F4']);
});

test('奇数なら1人あまり、片側が空の試合は作らない', () => {
  const fs = [fighter('F1', 'A', '30'), fighter('F2', 'B', '31'), fighter('F3', 'C', '40'), fighter('F4', 'D', '41'), fighter('F5', 'E', '60')];
  const result = suggestBouts(fs, [], counter());
  assert.deepEqual(pairs(result), ['F1-F2', 'F3-F4']);
  assert.ok(result.every((b) => b.redId && b.blueId));
});

test('同じジムは、次の候補と入れ替えて避ける', () => {
  const fs = [fighter('F1', 'A', '30'), fighter('F2', 'A', '31'), fighter('F3', 'B', '32'), fighter('F4', 'B', '33')];
  const result = suggestBouts(fs, [], counter());
  assert.deepEqual(pairs(result), ['F1-F3', 'F2-F4']);
});

test('全員同じジムなら、近い体重でそのまま組む（注意は boutWarnings が出す）', () => {
  const fs = [fighter('F1', 'A', '30'), fighter('F2', 'A', '31'), fighter('F3', 'A', '40'), fighter('F4', 'A', '41')];
  const result = suggestBouts(fs, [], counter());
  assert.deepEqual(pairs(result), ['F1-F2', 'F3-F4']);
  assert.ok(boutWarnings(result[0], fs, result).some((w) => w.includes('同じジム')));
});

test('ジム名が空の人は、だれとも「ちがうジム」として扱う', () => {
  const fs = [fighter('F1', '', '30'), fighter('F2', '', '31'), fighter('F3', 'A', '32'), fighter('F4', '  ', '33')];
  assert.deepEqual(pairs(suggestBouts(fs, [], counter())), ['F1-F2', 'F3-F4']);
});

test('ジム名の前後の空白は無視して同じジムと見なす', () => {
  const fs = [fighter('F1', 'A ', '30'), fighter('F2', ' A', '31'), fighter('F3', 'B', '32'), fighter('F4', 'B', '33')];
  assert.deepEqual(pairs(suggestBouts(fs, [], counter())), ['F1-F3', 'F2-F4']);
});

test('体重がわからない人は最後に回り、その人たちだけで組む', () => {
  const fs = [
    fighter('F1', 'A', ''), fighter('F2', 'B', '40'), fighter('F3', 'C', 'abc'),
    fighter('F4', 'D', '41'), fighter('F5', 'E', '9'), fighter('F6', 'F', '251'),
  ];
  const result = suggestBouts(fs, [], counter());
  assert.deepEqual(pairs(result), ['F2-F4', 'F1-F3', 'F5-F6']);
});

test('体重がわかる人1人と、わからない人は組まない', () => {
  const fs = [fighter('F1', 'A', '40'), fighter('F2', 'B', '')];
  assert.deepEqual(suggestBouts(fs, [], counter()), []);
});

test('すでに試合に入っている人は使わず、既存の試合はそのまま', () => {
  const fs = [fighter('F1', 'A', '30'), fighter('F2', 'B', '31'), fighter('F3', 'C', '40'), fighter('F4', 'D', '41'), fighter('F5', 'E', '50')];
  const existing = [bout('b1', 'F1', 'F2'), bout('b2', 'F5', '')];
  const beforeFighters = JSON.stringify(fs), beforeBouts = JSON.stringify(existing);
  const result = suggestBouts(fs, existing, counter());
  assert.deepEqual(pairs(result), ['F3-F4']);
  assert.equal(JSON.stringify(fs), beforeFighters);
  assert.equal(JSON.stringify(existing), beforeBouts);
  assert.deepEqual(existing, JSON.parse(beforeBouts));
  const placed = new Set(existing.flatMap((b) => [b.redId, b.blueId]));
  assert.ok(result.every((b) => !placed.has(b.redId) && !placed.has(b.blueId)));
});

test('全員が試合に入っていれば何も返さない', () => {
  const fs = [fighter('F1', 'A', '30'), fighter('F2', 'B', '31')];
  assert.deepEqual(suggestBouts(fs, [bout('b1', 'F1', 'F2')], counter()), []);
});

test('同じ入力なら毎回同じ結果（新しいIDカウンタでも）', () => {
  const fs = [fighter('F1', 'A', '33'), fighter('F2', 'A', '33'), fighter('F3', 'B', '33'), fighter('F4', 'B', '33'), fighter('F5', '', ''), fighter('F6', '', 'x')];
  const a = suggestBouts(fs, [], counter()), b = suggestBouts(fs, [], counter());
  assert.deepEqual(a, b);
});

test('同じ体重なら名簿の順で安定する', () => {
  const fs = [fighter('F1', 'A', '40'), fighter('F2', 'B', '40'), fighter('F3', 'C', '40'), fighter('F4', 'D', '40')];
  assert.deepEqual(pairs(suggestBouts(fs, [], counter())), ['F1-F2', 'F3-F4']);
});

test('suggestBouts は名簿の配列も要素も変えない（凍結しても動く）', () => {
  const fs = Object.freeze([fighter('F1', 'A', '30'), fighter('F2', 'B', '31'), fighter('F3', 'C', '32')].map((f) => Object.freeze(f))) as unknown as LocalFighter[];
  const bs = Object.freeze([bout('b1', 'F3', '')]) as unknown as LocalBout[];
  assert.deepEqual(pairs(suggestBouts(fs, bs, counter())), ['F1-F2']);
});

test('parseKg', () => {
  assert.equal(parseKg('65kg'), 65);
  assert.equal(parseKg(' 61.5 KG '), 61.5);
  assert.equal(parseKg(''), null);
  assert.equal(parseKg(undefined), null);
  assert.equal(parseKg('abc'), null);
  assert.equal(parseKg('9'), null);
  assert.equal(parseKg('10'), 10);
  assert.equal(parseKg('250'), 250);
  assert.equal(parseKg('251'), null);
});

test('weightGap は boutWarnings の体重差警告と同じ基準', () => {
  const cases: [string, string][] = [['40', '44'], ['40', '45'], ['45', '40'], ['40.5', '45.5'], ['40', '44.9'], ['65kg', '70kg'], ['', '40'], ['40', 'x']];
  for (const [a, b] of cases) {
    const red = fighter('R', 'A', a), blue = fighter('B', 'B', b);
    const gap = weightGap(red, blue);
    const warned = boutWarnings(bout('x', 'R', 'B'), [red, blue], []).some((w) => w.includes('体重差'));
    assert.equal(gap !== null && gap >= WEIGHT_GAP_WARN_KG, warned, a + ' / ' + b);
  }
  assert.equal(weightGap(fighter('R', '', '40'), fighter('B', '', '41.25')), 1.3);
  assert.equal(weightGap(undefined, fighter('B', '', '40')), null);
});

test('unplacedFighters は名簿の順で、試合に入っていない人だけ', () => {
  const fs = [fighter('F1', 'A', '1'), fighter('F2', 'A', '1'), fighter('F3', 'A', '1'), fighter('F4', 'A', '1')];
  assert.deepEqual(unplacedFighters(fs, [bout('b', 'F3', ''), bout('c', '', 'F1')]).map((f) => f.id), ['F2', 'F4']);
  assert.deepEqual(unplacedFighters(fs, []).map((f) => f.id), ['F1', 'F2', 'F3', 'F4']);
  assert.deepEqual(unplacedFighters([], [bout('b', 'F3', '')]), []);
});

test('isBlankBout', () => {
  assert.equal(isBlankBout(bout('a', '', '')), true);
  assert.equal(isBlankBout(bout('a', 'F1', '')), false);
  assert.equal(isBlankBout(bout('a', '', 'F1')), false);
});

test('boutProblems は validateTournament の試合ごとの判定と一致する', () => {
  const fs = [fighter('F1', 'A', '40'), fighter('F2', 'B', '41')];
  const table: [string, LocalBout, boolean][] = [
    ['blank', bout('x', '', ''), true],
    ['red only', bout('x', 'F1', ''), true],
    ['blue only', bout('x', '', 'F2'), true],
    ['same', bout('x', 'F1', 'F1'), true],
    ['unknown red', bout('x', 'ZZ', 'F2'), true],
    ['unknown blue', bout('x', 'F1', 'ZZ'), true],
    ['ok', bout('x', 'F1', 'F2'), false],
  ];
  for (const [name, b, hasProblem] of table) {
    const t = { ...emptyTournament('evt'), title: 'テスト大会', fighters: fs, bouts: [b] };
    const validateHasBoutError = validateTournament(t).length > 0;
    const mine = boutProblems(b, 0, fs);
    assert.equal(validateHasBoutError, hasProblem, name);
    assert.equal(mine.length > 0, validateHasBoutError, name);
  }
  assert.deepEqual(boutProblems(bout('x', '', ''), 1, fs).map((p) => p.side), ['both']);
  assert.equal(boutProblems(bout('x', '', 'F2'), 1, fs)[0].text, '第2試合の赤コーナーの選手を選んでください。');
  assert.equal(boutProblems(bout('x', 'F1', ''), 0, fs)[0].text, '第1試合の青コーナーの選手を選んでください。');
  assert.equal(boutProblems(bout('x', 'F1', 'F1'), 0, fs)[0].side, 'same');
  assert.equal(boutProblems(bout('x', 'F1', 'ZZ'), 0, fs)[0].side, 'unknown');
});

test('dropBlankBouts: 空の試合を消し、途中までの試合は残し、currentBout を直す', () => {
  const fs = [fighter('F1', 'A', '40'), fighter('F2', 'B', '41'), fighter('F3', 'C', '42')];
  const t = {
    ...emptyTournament('evt'), title: 'テスト大会', fighters: fs, currentBout: 4,
    bouts: [bout('a', 'F1', 'F2'), bout('b', '', ''), bout('c', 'F3', ''), bout('d', '', '')],
  };
  assert.equal(isLocalTournament(t), false);
  const before = JSON.stringify(t);
  const out = dropBlankBouts(t);
  assert.equal(JSON.stringify(t), before);
  assert.deepEqual(out.bouts.map((b) => b.id), ['a', 'c']);
  assert.equal(out.currentBout, 1);
  assert.equal(isLocalTournament(out), true);
  const none = dropBlankBouts({ ...t, bouts: [bout('x', '', '')], currentBout: 0 });
  assert.deepEqual(none.bouts, []);
  assert.equal(none.currentBout, 0);
  assert.equal(isLocalTournament(none), true);
  assert.equal(dropBlankBouts({ ...t, currentBout: 1 }).currentBout, 1);
});

test('nextAction は決まった順番で次にやることを返す', () => {
  const base = { titleReady: true, dateReady: true, fighterCount: 4, bouts: [bout('a', 'F1', 'F2')], dirty: false, problems: 0 };
  assert.equal(nextAction({ ...base, titleReady: false }), 'title');
  assert.equal(nextAction({ ...base, dateReady: false }), 'date');
  assert.equal(nextAction({ ...base, fighterCount: 0 }), 'fighters');
  assert.equal(nextAction({ ...base, fighterCount: 1 }), 'fighters2');
  assert.equal(nextAction({ ...base, bouts: [] }), 'bouts');
  assert.equal(nextAction({ ...base, bouts: [bout('a', '', '')] }), 'bouts');
  assert.equal(nextAction({ ...base, bouts: [bout('a', 'F1', 'F2'), bout('b', 'F3', '')] }), 'half');
  assert.equal(nextAction({ ...base, dirty: true }), 'save');
  assert.equal(nextAction(base), 'open');
  assert.equal(nextAction({ ...base, opened: true }), 'done');
});
