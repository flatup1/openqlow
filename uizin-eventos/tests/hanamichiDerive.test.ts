// 花道の「自動で入る」項目：リングネームが空のときは選手名、年齢＝生年月日から（今日の日本時間）、今日の日付。リングネームの欄（任意）。送る値の決まり（画面と受付で同じ）。
// 架空の日付・名前だけを使う。
import test from 'node:test';
import assert from 'node:assert/strict';
import { gymKanaFromName, HANAMICHI_ASKED_ITEMS, HANAMICHI_DERIVED_KEYS, HANAMICHI_HOBBY_MERGED, HANAMICHI_ITEMS, HANAMICHI_KEYS, HANAMICHI_RING_KANA_KEY, HANAMICHI_RING_KEY, HANAMICHI_SKIPPED_KEYS, hanamichiAgeFrom, hanamichiAskRequired, hanamichiClean, hanamichiFill, hanamichiFormItems, jstDateText, ringFromName, validateHanamichi } from '../core/hanamichi.ts';

test('必ず聞く項目は、必須だけの6項目（ジムのフリガナは自動、リングネームの2つは別に聞く＝下の試験、職業・他格闘歴は聞かない）。送る鍵は12のまま（古い受付の鍵が、そろう）', () => {
  assert.deepEqual([...HANAMICHI_DERIVED_KEYS], ['hnGymKana', 'hnRing', 'hnRingKana', 'hnHobby']);
  assert.ok(HANAMICHI_HOBBY_MERGED.length > 0 && HANAMICHI_HOBBY_MERGED.length <= 60, '趣味・特技の列に入れる1行は、60字まで（古い受付でも通る）');
  assert.deepEqual([...HANAMICHI_SKIPPED_KEYS], ['hnOther', 'hnJob']);
  assert.deepEqual(HANAMICHI_ASKED_ITEMS.map((item) => item.key), ['hnNameKana', 'hnBirth', 'hnKickYears', 'hnPerWeek', 'hnReason', 'hnMessage']);
  assert.ok(HANAMICHI_ASKED_ITEMS.every((item) => item.required), '聞くのは必須だけ');
  assert.equal(gymKanaFromName(' 架空ジム '), '架空ジム');
  assert.equal(gymKanaFromName('あ'.repeat(70)).length, 60, '60字まで');
  assert.equal(gymKanaFromName('あ'.repeat(59) + '😀').length, 59, '半端な文字を作らない');
  assert.equal(HANAMICHI_KEYS.length, 12);
});

test('年齢: 誕生日の前後で、1つ違う。誕生日の日は、その年に1つ年を取る', () => {
  assert.equal(hanamichiAgeFrom('1985-10-23', '2026-10-23'), '41', '誕生日の日は数える');
  assert.equal(hanamichiAgeFrom('1985-10-24', '2026-10-23'), '40', '誕生日の前日は、まだ');
  assert.equal(hanamichiAgeFrom('1985-10-22', '2026-10-23'), '41', '誕生日の次の日');
  assert.equal(hanamichiAgeFrom('1986-01-01', '2026-12-31'), '40');
});

test('年齢: うるう日の生まれ。平年の3月1日に1つ年を取る（数え方は、日本の決まり）', () => {
  assert.equal(hanamichiAgeFrom('2000-02-29', '2026-02-28'), '25');
  assert.equal(hanamichiAgeFrom('2000-02-29', '2026-03-01'), '26');
  assert.equal(hanamichiAgeFrom('2000-02-29', '2028-02-29'), '28');
});

test('年齢: 0歳（今年の誕生日がまだ）・120歳を超える・形がちがう日付は、空（受付が受けない）', () => {
  assert.equal(hanamichiAgeFrom('2026-11-01', '2026-10-23'), '', '0歳は、年齢として受けない');
  assert.equal(hanamichiAgeFrom('1900-01-01', '2026-10-23'), '', '126歳は、受けない');
  assert.equal(hanamichiAgeFrom('1906-10-23', '2026-10-23'), '120', '120歳はちょうど受ける');
  assert.equal(hanamichiAgeFrom('1905-10-23', '2026-10-23'), '', '121歳は受けない');
  for (const bad of ['', '1985-1-1', '1985/10/23', 'abc', '1985-10-23 ']) assert.equal(hanamichiAgeFrom(bad, '2026-10-23'), '', JSON.stringify(bad));
  assert.equal(hanamichiAgeFrom('1985-10-23', ''), '');
});

test('今日の日付（日本時間）: 0時を過ぎた直後は、もう次の日。UTCの前日でも、日本の今日', () => {
  // 2026-10-22 15:30 UTC = 2026-10-23 00:30 JST
  assert.equal(jstDateText(Date.UTC(2026, 9, 22, 15, 30)), '2026-10-23');
  // 2026-10-22 14:59 UTC = 2026-10-22 23:59 JST
  assert.equal(jstDateText(Date.UTC(2026, 9, 22, 14, 59)), '2026-10-22');
  assert.equal(jstDateText(Date.UTC(2026, 0, 1, 0, 0)), '2026-01-01');
});

test('リングネームが空のときの代わり＝選手名（前後の空白・見えない文字を取る）。切らない', () => {
  assert.equal(ringFromName('  架空 太郎​ '), '架空 太郎');
  assert.equal(ringFromName(''), '');
  assert.equal(ringFromName(undefined), '');
  assert.equal(ringFromName('a'.repeat(60)).length, 60);
});

/* ───────── リングネーム（owner 2026-10-24「花道の詳細を追加する部分にリングネームを追加したい」）：任意。入れた人にだけ、そのフリガナ（必須）も聞く ───────── */

const keys = (items: readonly { key: string }[]) => items.map((item) => item.key);

test('画面の項目: 氏名のフリガナの次にリングネーム。そのフリガナは、リングネームを入れたときだけ、その次に出る。ほかの順は変えない', () => {
  assert.equal(HANAMICHI_RING_KEY, 'hnRing');
  assert.equal(HANAMICHI_RING_KANA_KEY, 'hnRingKana');
  assert.deepEqual(keys(hanamichiFormItems(false)), ['hnNameKana', 'hnRing', 'hnBirth', 'hnKickYears', 'hnPerWeek', 'hnReason', 'hnMessage']);
  assert.deepEqual(keys(hanamichiFormItems(true)), ['hnNameKana', 'hnRing', 'hnRingKana', 'hnBirth', 'hnKickYears', 'hnPerWeek', 'hnReason', 'hnMessage']);
  // 必ず聞く項目の一覧は、増やさない（受付の鍵の数・順は、そのまま）
  assert.deepEqual(keys(HANAMICHI_ASKED_ITEMS), ['hnNameKana', 'hnBirth', 'hnKickYears', 'hnPerWeek', 'hnReason', 'hnMessage']);
  assert.equal(HANAMICHI_KEYS.length, 12);
  // 画面の項目は、表（HANAMICHI_ITEMS）の同じ項目そのもの（言葉・文字数・種類を、別に持たない）
  for (const ringTyped of [false, true]) for (const item of hanamichiFormItems(ringTyped)) assert.equal(item, HANAMICHI_ITEMS.find((i) => i.key === item.key), item.key);
});

test('画面での「必須」: リングネームだけ任意。ほかは、表の required のとおり（表そのものは変えていない）', () => {
  const ring = HANAMICHI_ITEMS.find((item) => item.key === 'hnRing');
  assert.ok(ring && ring.required, '表の上では必須のまま（受付は、空のリングネームを断る。だから、空のときは選手名を入れて送る）');
  assert.equal(hanamichiAskRequired(ring), false);
  for (const item of hanamichiFormItems(true)) assert.equal(hanamichiAskRequired(item), item.key === 'hnRing' ? false : item.required, item.key);
  assert.deepEqual(keys(hanamichiFormItems(true).filter((item) => !hanamichiAskRequired(item))), ['hnRing']);
  // フリガナは、リングネームがあるあいだ必須
  const kana = HANAMICHI_ITEMS.find((item) => item.key === 'hnRingKana');
  assert.ok(kana && hanamichiAskRequired(kana) && kana.needs === 'hnRing');
});

const BASE: Record<string, string> = { hnNameKana: 'カクウ ハナミチイチロウ', hnGymKana: '', hnRing: '', hnRingKana: '', hnBirth: '1975-08-20', hnKickYears: '5', hnPerWeek: '3', hnOther: '', hnJob: '', hnHobby: '', hnReason: '健康のために始めました。', hnMessage: '全力でがんばります。' };

test('送る値（hanamichiFill）: リングネームが空 → 選手名とその氏名のフリガナ（これまでと同じ）。入れた → 入れたとおり', () => {
  const empty = hanamichiFill(hanamichiClean(BASE), ' 架空ジム ', ' 架空 花道一郎 ');
  assert.equal(empty.hnRing, '架空 花道一郎', '空なら選手名');
  assert.equal(empty.hnRingKana, 'カクウ ハナミチイチロウ', '空なら氏名のフリガナ');
  assert.equal(empty.hnGymKana, '架空ジム');
  assert.equal(empty.hnHobby, HANAMICHI_HOBBY_MERGED);
  assert.equal(empty.hnOther, ''); assert.equal(empty.hnJob, '');
  assert.deepEqual(Object.keys(empty), [...HANAMICHI_KEYS], '12の鍵が、表の順');
  assert.ok(validateHanamichi(empty).ok, '空のときの形は、受付の決まりに合う: ' + JSON.stringify(validateHanamichi(empty).errors));

  const typed = hanamichiFill(hanamichiClean({ ...BASE, hnRing: ' 架空ライオン ', hnRingKana: ' カクウライオン ' }), '架空ジム', '架空 花道一郎');
  assert.equal(typed.hnRing, '架空ライオン');
  assert.equal(typed.hnRingKana, 'カクウライオン', 'リングネームのフリガナは、入れたとおり（氏名のフリガナではない）');
  assert.equal(typed.hnNameKana, 'カクウ ハナミチイチロウ', '氏名のフリガナは、そのまま');
  assert.ok(validateHanamichi(typed).ok);
});

test('送る値（hanamichiFill）: リングネームを消したら、前に入れたフリガナは送らない（hanamichiClean が空にし、選手名の側に戻る）', () => {
  // 画面の入力には、消す前のフリガナが残っていても、リングネームが空なら送らない
  const cleared = hanamichiFill(hanamichiClean({ ...BASE, hnRing: '   ', hnRingKana: 'ムカシノフリガナ' }), '架空ジム', '架空選手');
  assert.equal(cleared.hnRing, '架空選手');
  assert.equal(cleared.hnRingKana, 'カクウ ハナミチイチロウ');
  assert.ok(!JSON.stringify(cleared).includes('ムカシ'));
});

test('送る値（hanamichiFill）: リングネームだけ入れてフリガナが空 → フリガナの失敗（受付と同じ答え）。60字ちょうどは通り、61字は断る', () => {
  const noKana = hanamichiFill(hanamichiClean({ ...BASE, hnRing: '架空ライオン', hnRingKana: '' }), '架空ジム', '架空選手');
  assert.deepEqual(Object.keys(validateHanamichi(noKana).errors), ['hnRingKana']);
  const ok60 = hanamichiFill(hanamichiClean({ ...BASE, hnRing: 'あ'.repeat(60), hnRingKana: 'ア'.repeat(60) }), '架空ジム', '架空選手');
  assert.ok(validateHanamichi(ok60).ok);
  const over = hanamichiFill(hanamichiClean({ ...BASE, hnRing: 'あ'.repeat(61), hnRingKana: 'ア' }), '架空ジム', '架空選手');
  assert.deepEqual(Object.keys(validateHanamichi(over).errors), ['hnRing']);
});

test('送る値（hanamichiFill）: 画面に出さない欄は、入力に何があっても決めた値になる（ジムのフリガナ・趣味・職業・他格闘歴）', () => {
  const f = hanamichiFill(hanamichiClean({ ...BASE, hnGymKana: 'ニセ', hnHobby: 'ニセ', hnOther: 'ニセ', hnJob: 'ニセ' }), '架空ジム', '架空選手');
  assert.equal(f.hnGymKana, '架空ジム'); assert.equal(f.hnHobby, HANAMICHI_HOBBY_MERGED); assert.equal(f.hnOther, ''); assert.equal(f.hnJob, '');
  // ジム名が60字より長いときは、60字まで
  assert.equal(hanamichiFill(hanamichiClean(BASE), 'ジ'.repeat(70), '架空選手').hnGymKana.length, 60);
});
