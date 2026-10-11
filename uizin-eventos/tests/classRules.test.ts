import assert from 'node:assert/strict';
import test from 'node:test';
import { boutClassWarning, classKey, classMismatch, cleanClassLabel, CLASS_LIMITS, CLASS_NEUTRAL_NOTE, DEFAULT_CLASS_SETTINGS as D, normalizeClass, parseClassSettings, parseWins, suggestClass, suggestText, type ClassSettings } from '../core/classRules.ts';
import type { LocalFighter } from '../core/privateTournament.ts';

const f = (fighterClass?: string): LocalFighter => ({ id: 'x', gym: '', name: 'n', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '', photoDataUrl: '', ...(fighterClass === undefined ? {} : { fighterClass }) });

test('parseWins: 勝った数だけを読む。決められないものは null', () => {
  const table: Array<[string, number | null]> = [
    ['', null], ['   ', null], ['0勝0敗', 0], ['1勝3敗', 1], ['2勝1敗', 2], ['3勝0敗', 3], ['3勝', 3], ['4勝', 4], ['5勝2敗', 5],
    ['２勝１敗', 2], ['３勝１敗', 3], ['三勝', 3], ['三勝一敗', 3], ['二十勝', 20], ['九十九勝', 99], ['百勝', null], ['100勝', null],
    ['3-1', 3], ['3-1-0', 3], ['3ー1', 3], ['３－１', 3], ['2-3勝', null], ['2〜3勝', null], ['2か3勝', null],
    ['3W1L', 3], ['3w-1l', 3], ['3戦2勝', 2], ['5戦3勝2敗', 3], ['3勝1敗1分', 3], ['2勝(1KO)1敗', 2], ['アマ2勝 プロ1勝', null],
    ['初出場', 0], ['初試合', 0], ['初', 0], ['初出場です', 0], ['未経験', 0], ['なし', 0], ['ゼロ', 0], ['格闘技は未経験', 0],
    ['空手3年 試合は未経験', null], ['空手3年', null], ['勝ち負けなし', null], ['3', null], ['3戦', null], ['3敗', null],
    ['2024-05-12', null], ['=HYPERLINK("http://x")', null], ['<script>', null],
    ['十二勝', 12], ['〇勝', 0], ['0', 0], ['0戦', 0], ['一般', null],
  ];
  for (const [record, wins] of table) assert.equal(parseWins(record), wins, JSON.stringify(record));
});

test('suggestClass: 3勝ちょうどは上のクラス。負け・引き分けは数えない', () => {
  for (const [r, name] of [['0勝', 'Bクラス'], ['1勝3敗', 'Bクラス'], ['2勝1敗', 'Bクラス'], ['3勝0敗', 'Aクラス'], ['4勝', 'Aクラス'], ['初出場', 'Bクラス']] as const) {
    assert.equal(suggestClass(r, D)?.name, name, r);
  }
  assert.equal(suggestClass('2勝1敗', D)?.wins, 2);
  const five: ClassSettings = { ...D, upperMinWins: 5 };
  assert.equal(suggestClass('4勝', five)?.name, 'Bクラス');
  assert.equal(suggestClass('5勝', five)?.name, 'Aクラス');
  assert.equal(suggestClass('3勝', { ...D, enabled: false }), null);
  assert.equal(suggestClass('空手3年', D), null);
  assert.equal(suggestText('Bクラス'), '戦績からは、Bクラスです');
  assert.ok(CLASS_NEUTRAL_NOTE.length > 0);
});

test('classMismatch: ちがうときだけ、やさしい一文。止める情報は返さない', () => {
  const a = classMismatch('2勝1敗', 'Aクラス', D);
  assert.ok(a.startsWith('戦績と合っていますか？')); assert.ok(a.includes('2勝')); assert.ok(a.includes('Bクラス'));
  assert.equal(a, '戦績と合っていますか？ 戦績は2勝で、目安はBクラスです。');
  assert.equal(classMismatch('2勝1敗', 'Bクラス', D), '');
  assert.ok(classMismatch('3勝0敗', 'Bクラス', D).startsWith('戦績と合っていますか？'));
  assert.equal(classMismatch('3勝0敗', 'Aクラス', D), '');
  assert.equal(classMismatch('空手3年', 'Aクラス', D), '');
  assert.equal(classMismatch('2勝', '', D), '');
  assert.equal(classMismatch('2勝', 'Cクラス', D), '');
  assert.equal(classMismatch('2勝1敗', 'Aクラス', { ...D, enabled: false }), '');
});

test('normalizeClass / classKey: 設定の2つの名前だけを通す', () => {
  assert.equal(normalizeClass('Aクラス', D), 'Aクラス');
  assert.equal(normalizeClass(' Ａクラス ', D), 'Aクラス');
  assert.equal(normalizeClass('bクラス', D), 'Bクラス');
  assert.equal(normalizeClass('Cクラス', D), '');
  assert.equal(normalizeClass('=HYPERLINK("x")', D), '');
  assert.equal(normalizeClass('', D), '');
  assert.equal(normalizeClass('Aクラス', { ...D, enabled: false }), '');
  assert.equal(classKey('Aクラス', D), 'upper'); assert.equal(classKey('Ｂクラス', D), 'lower'); assert.equal(classKey('x', D), '');
});

test('boutClassWarning: 両方にクラスがあり、ちがうときだけ', () => {
  assert.equal(boutClassWarning(undefined, undefined), '');
  assert.equal(boutClassWarning(f('Aクラス'), undefined), '');
  assert.equal(boutClassWarning(undefined, f('Aクラス')), '');
  assert.equal(boutClassWarning(f('Aクラス'), f()), '');
  assert.equal(boutClassWarning(f('Aクラス'), f('')), '');
  assert.equal(boutClassWarning(f('Aクラス'), f('Aクラス')), '');
  assert.equal(boutClassWarning(f('Ａクラス'), f(' Aクラス ')), '');
  const w = boutClassWarning(f('Aクラス'), f('Bクラス'));
  assert.ok(w.includes('クラスがちがいます')); assert.ok(w.includes('Aクラス')); assert.ok(w.includes('Bクラス'));
  assert.ok(!w.startsWith('⚠'));
  assert.equal(w, 'クラスがちがいます（赤：Aクラス／青：Bクラス）。ルールがちがうので、組み合わせを確かめてください。');
});

test('parseClassSettings: 信用できない入れ物から、正しい設定だけを取り出す', () => {
  assert.deepEqual(parseClassSettings(D), D);
  assert.deepEqual(parseClassSettings(JSON.parse(JSON.stringify(D))), D);
  const bad = (over: Record<string, unknown>) => parseClassSettings({ ...D, ...over });
  const side = (over: Record<string, unknown>, which: 'upper' | 'lower' = 'upper') => bad({ [which]: { ...D[which], ...over } });
  assert.equal(bad({ enabled: false }), undefined);
  assert.equal(bad({ enabled: 'true' }), undefined);
  assert.equal(bad({ lower: { ...D.lower, name: 'ａクラス' }, upper: { ...D.upper, name: 'Aクラス' } }), undefined);
  assert.equal(side({ name: 'Bクラス' }), undefined, '同じ名前');
  assert.equal(bad({ upperMinWins: 0 }), undefined);
  assert.equal(bad({ upperMinWins: 100 }), undefined);
  assert.equal(bad({ upperMinWins: 3.5 }), undefined);
  assert.equal(bad({ upperMinWins: '3' }), undefined);
  assert.equal(side({ name: 'あ'.repeat(13) }), undefined);
  assert.ok(side({ name: 'あ'.repeat(CLASS_LIMITS.name) }));
  assert.equal(side({ condition: 'あ'.repeat(61) }, 'lower'), undefined);
  assert.ok(side({ condition: 'あ'.repeat(60) }, 'lower'));
  assert.equal(side({ rule: 'あ'.repeat(81) }), undefined);
  assert.ok(side({ rule: 'あ'.repeat(80) }));
  assert.equal(side({ name: '  ' }), undefined);
  assert.equal(side({ rule: 5 }), undefined);
  for (const v of [null, undefined, 5, 'x', [], {}, { enabled: true }, { enabled: true, upper: 1, lower: 2, upperMinWins: 3 }]) assert.equal(parseClassSettings(v), undefined);
  assert.equal(parseClassSettings({ ...D, upper: { ...D.upper, name: '  Aクラス ' } })?.upper.name, 'Aクラス');
});

test('cleanClassLabel: 制御文字を消し、40文字まで', () => {
  assert.equal(cleanClassLabel('A\u0000クラ\u001fス\n'), 'Aクラス');
  assert.equal(cleanClassLabel('  A   クラス '), 'A クラス');
  assert.equal(cleanClassLabel('あ'.repeat(60)).length, 40);
  assert.equal(cleanClassLabel(undefined as unknown as string), '');
});
