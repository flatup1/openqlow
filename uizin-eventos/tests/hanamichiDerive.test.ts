// 花道の「自動で入る」項目：リングネーム＝選手名、年齢＝生年月日から（今日の日本時間）、今日の日付。送る値の決まり（画面と受付で同じ）。
// 架空の日付・名前だけを使う。
import test from 'node:test';
import assert from 'node:assert/strict';
import { gymKanaFromName, HANAMICHI_ASKED_ITEMS, HANAMICHI_DERIVED_KEYS, HANAMICHI_HOBBY_MERGED, HANAMICHI_KEYS, HANAMICHI_SKIPPED_KEYS, hanamichiAgeFrom, jstDateText, ringFromName } from '../core/hanamichi.ts';

test('画面で聞く項目は、必須だけの6項目（ジムのフリガナ・リングネーム・そのフリガナは自動、職業・他格闘歴は聞かない）。送る鍵は12のまま（古い受付の鍵が、そろう）', () => {
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

test('リングネーム＝選手名（前後の空白・見えない文字を取る）。切らない', () => {
  assert.equal(ringFromName('  架空 太郎​ '), '架空 太郎');
  assert.equal(ringFromName(''), '');
  assert.equal(ringFromName(undefined), '');
  assert.equal(ringFromName('a'.repeat(60)).length, 60);
});
