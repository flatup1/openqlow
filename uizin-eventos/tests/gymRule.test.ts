// ジムに所属していない人は参加できない／エントリーは本名だけ（あだ名は不可）。owner 決定 2026-10-23。
// 申し込みページ（app/apply/page.tsx）と、Googleの受付（.gs の validateEntry_）の両方で断る。言い方の表は core/pledge.ts と .gs で同じ。
// 名前・ジム名は、ぜんぶ架空。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { harness } from './helpers/gasV3Harness.ts';
import { isUnaffiliated, UNAFFILIATED_TEXT } from '../core/pledge.ts';

const read = (path: string): string => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const PAGE = read('app/apply/page.tsx');
const MANUAL = read('docs/TOURNAMENT_OS_使い方マニュアル.md');
const thrown = (fn: () => unknown): any => { try { fn(); } catch (e) { return e; } assert.fail('投げなかった'); };
const snapshot = (h: ReturnType<typeof harness>) => JSON.stringify([...h.book.sheets.entries()].map(([name, sheet]: [string, any]) => [name, sheet.rows]));

const NO_GYM = ['無所属', 'むしょぞく', 'ムショゾク', '所属なし', 'なし', '無し', 'ない', 'フリー', '個人', ' 無所属 ', '無 所 属', 'ﾑｼｮｿﾞｸ', '無​所属', '無所属です', 'ジムなし', '所属していません', '通っていない'];
const REAL_GYM = ['架空ジムA', 'ＡＢＣジム', 'フラットアップジム', 'ナイスジム', '個人レッスンジム'];

test('受付(.gs): ジム名が「ジムに入っていない」言い方なら、本番もテストも、何も保存せずに断る（コード input。直せば通る）', () => {
  for (const mode of ['live', 'test'] as const) {
    const h = harness(); h.ready(); h.call('openEntries');
    const before = snapshot(h);
    for (const gym of NO_GYM) {
      const error = thrown(() => h.call('saveEntry_', h.params(mode, { gym })));
      assert.equal(error.code, 'input', mode + ' ' + JSON.stringify(gym));
      assert.equal(error.retryable, false);
      assert.ok(error.message.includes(UNAFFILIATED_TEXT), 'ページと同じ言葉で断る：' + error.message);
      assert.ok(error.message.startsWith('申込ページにもどって'), 'どうすればいいかを先に言う');
    }
    assert.equal(snapshot(h), before, mode + ': 断ったあとは、何も書かれていない');
    for (const gym of REAL_GYM) assert.ok(h.call('saveEntry_', h.params(mode, { gym })), mode + ' ふつうのジム名は通る：' + gym);
  }
});

test('受付(.gs): 誓約書が「あり」のときも同じ（ジム責任者の欄の免除は、もう無い。ジム名で断る）', () => {
  const h = harness(); h.ready({ 誓約書: 'あり' });
  assert.equal(thrown(() => h.call('saveEntry_', h.params('test', { gym: '無所属' }))).code, 'input');
  assert.ok(!/PLEDGE_UNAFFILIATED_LABEL_|（無所属）/.test(readFileSync(new URL('../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8')), '記録に「（無所属）」を書く道は、もう無い');
});

test('同じ答え: 画面と受付で断る言葉は1字も違わない。ページは isUnaffiliated で判定し、欄を出た後に赤い✕で断る（送る道もふさぐ）', () => {
  const h = harness();
  assert.equal(vm.runInContext('UNAFFILIATED_TEXT_', h.api), UNAFFILIATED_TEXT);
  assert.match(PAGE, /case 'gym': return tooLong\(nf\.gym, 120\) \?\? \(isUnaffiliated\(nf\.gym\) \? \{ text: UNAFFILIATED_TEXT, early: false \} : null\);/);
  for (const gym of NO_GYM) assert.equal(isUnaffiliated(gym), true, gym);
  for (const gym of REAL_GYM) assert.equal(isUnaffiliated(gym), false, gym);
});

test('文言: ジム名の説明は「ジムに所属していない人は、参加できません」。「無所属と入れてください」は、どこにも無い', () => {
  assert.match(PAGE, /gym: \{ hint: '通っているジム・道場の名前です。ジムに所属していない人は、参加できません。', example: \['フラットアップジム'\] \}/);
  assert.ok(!PAGE.includes('通っていない時は「無所属」と入れてください'));
  assert.ok(!MANUAL.includes('通っていない時は「無所属」と入れてください'));
  assert.ok(MANUAL.includes('ジムに入っていない人は、参加できません。'));
});

test('本名だけ（あだ名は不可）: 選手名・花道のリングネームの説明に「あだ名でもOK」が無い。入力の説明は本名をすすめる', () => {
  assert.match(PAGE, /name: \{ hint: '本名で入れてください。あだ名・リングネームは、入れないでください。', example: \['山田 太郎'\] \}/);
  assert.match(PAGE, /hnRing: \{ hint: 'アナウンスで呼ばれる名前です。本名で入れてください。あだ名は、入れないでください。', example: \['架空 花道一郎'\] \}/);
  for (const text of [PAGE, MANUAL]) {
    assert.ok(!text.includes('あだ名でもOK'), 'あだ名でもOK は、どこにも無い');
    assert.ok(!text.includes('本名でも、あだ名でも'), '本名でも、あだ名でも は、どこにも無い');
  }
  assert.ok(MANUAL.includes('リングネーム（＝選手名）'), 'マニュアル：花道のリングネームは選手名から自動で入る（あだ名の欄は無い）');
});
