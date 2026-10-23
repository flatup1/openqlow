// R5：生年月日の「年」に和暦を並べる（選ぶ欄の見た目の文字だけ）。値・保存・リンク・タブは西暦のまま。
// 和暦の変換は app/components/BirthDateSelect.tsx にある（.tsx は Node で直接 import できないので、印のあいだの文字を取り出して、型を外して試す）。
// 画面に出る文字・送る値は、scripts/test-hanamichi-apply.mjs の H（本物の Chromium）で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const SOURCE = readFileSync(new URL('../app/components/BirthDateSelect.tsx', import.meta.url), 'utf8');
const begin = SOURCE.indexOf('/* ERA-BEGIN'), end = SOURCE.indexOf('/* ERA-END */');
assert.ok(begin > 0 && end > begin, 'BirthDateSelect.tsx に、和暦の印（ERA-BEGIN / ERA-END）がある');
const code = stripTypeScriptTypes(SOURCE.slice(SOURCE.indexOf('*/', begin) + 2, end));
const era = await import('data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64')) as { birthEra: (year: number) => string; birthYearLabel: (year: number) => string };
const { birthEra, birthYearLabel } = era;

test('R5 和暦の変換の表：1926=昭和元、1988=昭和63、1989=昭和64・平成元、1990=平成2、2018=平成30、2019=平成31・令和元、2020=令和2', () => {
  const table: [number, string][] = [[1926, '昭和元'], [1927, '昭和2'], [1950, '昭和25'], [1986, '昭和61'], [1988, '昭和63'], [1989, '昭和64・平成元'], [1990, '平成2'], [2000, '平成12'], [2018, '平成30'], [2019, '平成31・令和元'], [2020, '令和2'], [2026, '令和8']];
  for (const [year, expected] of table) assert.equal(birthEra(year), expected, String(year));
});

test('R5 昭和より前（1926年より前）と、年でないものは、和暦なし（西暦だけ）', () => {
  for (const year of [1925, 1900, 1800, 0, -1, 1926.5, NaN, Infinity]) assert.equal(birthEra(year), '', String(year));
  assert.equal(birthYearLabel(1925), '1925');
  assert.equal(birthYearLabel(1900), '1900');
});

test('R5 選ぶ欄の文字：西暦（和暦）の形。境目の年は両方書く', () => {
  assert.equal(birthYearLabel(1986), '1986（昭和61）');
  assert.equal(birthYearLabel(1930), '1930（昭和5）');
  assert.equal(birthYearLabel(1989), '1989（昭和64・平成元）');
  assert.equal(birthYearLabel(1990), '1990（平成2）');
  assert.equal(birthYearLabel(2019), '2019（平成31・令和元）');
  assert.equal(birthYearLabel(2020), '2020（令和2）');
  assert.equal(birthYearLabel(1926), '1926（昭和元）');
});

test('R5 1926〜2100の全部：年が進むと和暦も1つずつ進む。「・」を書くのは、1989と2019だけ。「元」は各元号の1年目だけ', () => {
  const number = (text: string): number => (text.endsWith('元') ? 1 : Number(text.replace(/\D/g, '')));
  let last: { gengo: string; n: number } | null = null;
  for (let year = 1926; year <= 2100; year++) {
    const text = birthEra(year);
    assert.match(text, /^(昭和|平成|令和)(元|\d+)(・(昭和|平成|令和)(元|\d+))?$/, String(year));
    assert.equal(text.includes('・'), year === 1989 || year === 2019, String(year) + ' の「・」');
    const parts = text.split('・'), current = parts[parts.length - 1]; // 境目の年は、あとの元号が、その年の元号
    const gengo = current.slice(0, 2), n = number(current.slice(2));
    if (last && last.gengo === gengo) assert.equal(n, last.n + 1, String(year) + ' は前の年の次');
    else if (last) assert.equal(n, 1, String(year) + ' は新しい元号の1年目');
    assert.equal(current.endsWith('元'), n === 1, String(year));
    last = { gengo, n };
  }
});

test('R5 選択肢：年の範囲・並びは今のまま（1990→1930、そのあと1991→今年）。value は西暦だけ。見た目の文字にだけ和暦', () => {
  assert.match(SOURCE, /export const BIRTH_FIRST_YEAR = 1990;/);
  assert.match(SOURCE, /export const BIRTH_LAST_OLD_YEAR = 1930;/);
  const options = SOURCE.match(/<option key=\{year\} value=\{String\(year\)\}>\{[^}]+\}<\/option>/g) ?? [];
  assert.equal(options.length, 2, '年の選択肢は2か所（1990→1930 と 1991→今年）');
  for (const option of options) assert.match(option, /value=\{String\(year\)\}>\{birthYearLabel\(year\)\}</, 'value は西暦のまま、見える文字だけ 西暦（和暦）');
  // 和暦の関数は、見える文字の1か所でしか使わない（値・送る形・リンクに入れない）
  const uses = SOURCE.replace(/\/\* ERA-BEGIN[\s\S]*?\/\* ERA-END \*\//, '').match(/birthYearLabel|birthEra/g) ?? [];
  assert.equal(uses.length, 2, '見える文字の2行だけ');
  assert.match(SOURCE, /aria-label="生年月日の年（西暦）"/, 'aria-label は今のまま');
  assert.match(SOURCE, /<option value="">年を選ぶ<\/option>/);
});

test('R5 送る値・保存する値は、西暦のまま：申し込みページの 生年月日 は 年-月-日 の数字だけで作る。和暦の関数を使わない', () => {
  const page = readFileSync(new URL('../app/apply/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /birthEra|birthYearLabel/, '申し込みページは和暦の関数を使わない（選ぶ欄の中だけ）');
  const hanamichi = readFileSync(new URL('../core/hanamichi.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(hanamichi, /昭和|平成|令和/, 'core/hanamichi.ts（検査）は西暦のまま');
  const gs = readFileSync(new URL('../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8');
  assert.doesNotMatch(gs, /昭和|平成|令和/, '.gs の検査も西暦のまま（無変更）');
});
