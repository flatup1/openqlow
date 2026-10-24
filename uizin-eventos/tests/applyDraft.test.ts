// core/applyDraft.ts：申し込みページの「入力の途中保存（下書き）」と「別の人を申し込む（ジム名と連絡先を残す）」の入れ物。
// 個人情報にかかわるので、「入れてよい鍵だけ」「入れてはいけない物は入らない」「期限・大会・モードが合わない物は読まない」「storage が投げても止まらない」を、
// 1つずつ確かめる。名前・電話・メールは、ぜんぶ『架空』の値。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  agoText, DRAFT_FIELDS, DRAFT_KEY_PREFIX, DRAFT_MAX, DRAFT_TTL_MS, draftIsEmpty, draftKey, fitDraftToLink, linkMode, looksPrivate, NEVER_STORED, NEXT_KEY_PREFIX, NEXT_NEVER_STORED, NEXT_TEXT_KEYS,
  NEXT_TTL_MS, nextIsEmpty, nextKey, packDraft, packNext, parseDraft, parseNext, pickDraft, pickNext, safeGet, safeRemove, safeSet, type DraftFields, type DraftLink, type DraftLinkShape, type StorageLike,
} from '../core/applyDraft.ts';
import { HANAMICHI_KEYS } from '../core/hanamichi.ts';
import { DEFAULT_WEIGHT_SETTINGS } from '../core/weightClass.ts';

const LINK: DraftLink = { eventId: 'draft-test', mode: 'live' };
const NOW = Date.UTC(2027, 0, 5, 3, 0, 0);
const MIN = 60 * 1000;
const FIELDS: Record<string, string> = {
  gym: '架空ジムA', name: '架空 選手', height: '170', weight: '65', division: '一般男子', weightClass: '60kgをこえる', fighterClass: 'upper',
  record: '3勝1敗', grade: '中2', age: '14', comment: '全力でがんばります', musicUrl: 'https://music.apple.com/jp/album/x/1234567890?i=1234567891',
};
const KIT = { gym: '架空ジムA', contactName: '架空 連絡', contactPhone: '09000000000', contactEmail: 'kakuu@example.com', consent: true, gymName: '架空 責任者', gymPhone: '09011112222' };

test('定数: 鍵の頭・期限・入れてよい12個', () => {
  assert.equal(DRAFT_KEY_PREFIX, 'tos-apply-draft:v1:');
  assert.equal(NEXT_KEY_PREFIX, 'tos-apply-next:v1:');
  assert.equal(DRAFT_TTL_MS, 12 * 3600 * 1000);
  assert.equal(NEXT_TTL_MS, 60 * 60 * 1000);
  assert.deepEqual([...DRAFT_FIELDS], ['gym', 'name', 'height', 'weight', 'division', 'weightClass', 'fighterClass', 'record', 'grade', 'age', 'comment', 'musicUrl']);
  assert.deepEqual([...NEXT_TEXT_KEYS], ['gym', 'contactName', 'contactPhone', 'contactEmail', 'gymName', 'gymPhone']);
  assert.equal(draftKey(LINK), 'tos-apply-draft:v1:draft-test:live');
  assert.equal(nextKey({ eventId: 'draft-test', mode: 'test' }), 'tos-apply-next:v1:draft-test:test');
  assert.equal(linkMode('test'), 'test');
  assert.equal(linkMode('live'), 'live');
  assert.equal(linkMode(undefined), 'live', '古いリンク（mode が無い）は live');
  assert.equal(linkMode('x'), 'live');
});

test('NEVER_STORED: 連絡先・同意・写真・生年月日・花道の12項目・誓約書の✔・保護者・ジム責任者の欄を、ぜんぶ数えている。下書きの12個とは重ならない', () => {
  for (const key of ['contactName', 'contactPhone', 'contactEmail', 'consent', 'photo', 'photoDataUrl', 'birth', 'hnBirth', 'pledge', 'pledgeItems', 'pledge1', 'pledge8', 'pledgeGuardian', 'pledgeGym', 'gymName', 'gymPhone', 'gymPermission', 'gymConsent']) {
    assert.ok(NEVER_STORED.includes(key), key + ' は入れない');
  }
  for (const key of HANAMICHI_KEYS) assert.ok(NEVER_STORED.includes(key) && NEXT_NEVER_STORED.includes(key), key + ' は、どちらにも入れない');
  for (const key of DRAFT_FIELDS) assert.ok(!NEVER_STORED.includes(key), key + ' は下書きの鍵');
  // 次の人の入れ物：連絡先・ジム責任者の名前と電話・同意は入れてよい。写真・選手の欄・花道・誓約書の✔・保護者・許可の念押しは入れない
  for (const key of ['contactName', 'contactPhone', 'contactEmail', 'consent', 'gymName', 'gymPhone', 'gym']) assert.ok(!NEXT_NEVER_STORED.includes(key), key + ' は次の人の鍵');
  for (const key of ['photo', 'photoDataUrl', 'birth', 'pledge1', 'pledgeGuardian', 'pledgeGym', 'gymPermission', 'gymConsent', 'name', 'height', 'weight', 'division', 'weightClass', 'fighterClass', 'record', 'grade', 'age', 'comment', 'musicUrl']) {
    assert.ok(NEXT_NEVER_STORED.includes(key), key + ' は次の人の入れ物に入れない');
  }
  assert.equal(new Set(NEVER_STORED).size, NEVER_STORED.length, '重なりがない');
  assert.equal(new Set(NEXT_NEVER_STORED).size, NEXT_NEVER_STORED.length, '重なりがない');
});

test('pickDraft: 入れてよい12個だけ。ほかの鍵・文字でない値は捨てる', () => {
  const dirty: Record<string, unknown> = {
    ...FIELDS, contactName: '架空', contactPhone: '09012345678', contactEmail: 'a@example.com', consent: true, photo: 'data:image/jpeg;base64,AAAA', photoDataUrl: 'data:image/jpeg;base64,AAAA',
    hnBirth: '1975-08-20', hnJob: '会社員', pledge1: true, pledgeGuardian: 'yes', gymName: '架空 責任者', gymPhone: '09011112222', gymPermission: true, extra: 'x',
  };
  const picked = pickDraft(dirty);
  assert.deepEqual(Object.keys(picked), [...DRAFT_FIELDS], '鍵は12個だけ・この順');
  assert.deepEqual({ ...picked }, FIELDS);
  assert.equal(JSON.stringify(picked).includes('09012345678'), false);
  for (const key of NEVER_STORED) assert.equal(key in picked, false, key);
  // 文字でない値は空に
  const bad = pickDraft({ gym: 5, name: null, height: { a: 1 }, weight: ['1'], division: true, record: undefined, comment: 'ok' });
  assert.equal(bad.comment, 'ok');
  for (const key of DRAFT_FIELDS) if (key !== 'comment') assert.equal(bad[key], '', key);
  assert.equal(draftIsEmpty(pickDraft({})), true);
  assert.equal(draftIsEmpty(pickDraft(null as unknown as Record<string, unknown>)), true, 'null でも投げない');
  assert.equal(draftIsEmpty(picked), false);
});

test('pickDraft: 長さを切る。欄の上限を少し超えた分は残る（「長すぎます」の赤が戻る）。見えない文字は取る。クラスは upper／lower だけ', () => {
  const long = pickDraft({ gym: 'あ'.repeat(5000), name: 'い'.repeat(5000), comment: 'う'.repeat(5000), record: 'え'.repeat(5000), musicUrl: 'https://x.example/' + 'a'.repeat(5000), height: '1'.repeat(50) });
  for (const key of DRAFT_FIELDS) assert.ok(long[key].length <= DRAFT_MAX[key], key + ' は上限まで');
  assert.equal(long.gym.length, DRAFT_MAX.gym);
  assert.ok(pickDraft({ gym: 'あ'.repeat(130) }).gym.length === 130, '120字の上限を少し超えた分は残る');
  assert.equal(pickDraft({ name: '架​空‮選﻿手' }).name, '架空選手');
  assert.equal(pickDraft({ fighterClass: 'upper' }).fighterClass, 'upper');
  assert.equal(pickDraft({ fighterClass: 'lower' }).fighterClass, 'lower');
  assert.equal(pickDraft({ fighterClass: 'A' }).fighterClass, '');
  assert.equal(pickDraft({ fighterClass: 'upperX' }).fighterClass, '');
  for (const key of DRAFT_FIELDS) assert.ok(DRAFT_MAX[key] >= (({ gym: 120, name: 80, record: 300, comment: 500, grade: 30, musicUrl: 500, height: 10, weight: 10, age: 3, division: 20, weightClass: 16, fighterClass: 5 }) as Record<string, number>)[key], key + ' の上限は欄の上限以上');
});

test('looksPrivate / pickDraft: 電話・メール・写真らしい中身の欄は入れない（どの鍵でも）。曲のリンクの長い数字は電話ではない', () => {
  for (const value of ['090-1234-5678', '09012345678', '０９０１２３４５６７８', '+81 90 1234 5678', '(03) 1234-5678 まで', '連絡は 090 1234 5678 へ', '0312345678']) assert.ok(looksPrivate(value), value);
  for (const value of ['kakuu@example.com', 'ここに連絡 a@b.c', '＠全角', '@tiger']) assert.ok(looksPrivate(value), value);
  for (const value of ['data:image/jpeg;base64,AAAA', 'DATA:image/png;base64,AAAA', 'see data: here']) assert.ok(looksPrivate(value), value);
  for (const value of ['170', '65.5', '3勝1敗', '第10道場 2024 2025', '2023年10月5日', '全力でがんばります', '初試合', '中2', '60kgをこえる']) assert.equal(looksPrivate(value), false, value);
  assert.equal(looksPrivate('https://music.apple.com/jp/album/x/1234567890?i=1234567891', 'musicUrl'), false);
  assert.equal(looksPrivate('1234567890', 'musicUrl'), false);
  assert.equal(looksPrivate('https://x.example/?mail=a@b.c', 'musicUrl'), true, '曲のリンクでも、メール・写真は入れない');
  const picked = pickDraft({ ...FIELDS, comment: '連絡は 090-1234-5678 へ', record: 'a@example.com', gym: 'data:image/png;base64,AAAA' });
  assert.equal(picked.comment, '');
  assert.equal(picked.record, '');
  assert.equal(picked.gym, '');
  assert.equal(picked.name, FIELDS.name, 'ほかの欄は残る');
  assert.equal(picked.musicUrl, FIELDS.musicUrl);
});

test('packDraft / parseDraft: 往復。入れ物は version・eventId・mode・savedAt・f だけ。中身のどこにも、電話・メール・data:image・生年月日らしい値は無い', () => {
  const dirty = { ...FIELDS, contactPhone: '09012345678', contactEmail: 'a@example.com', consent: true, photo: 'data:image/jpeg;base64,AAAA', hnBirth: '1975-08-20', pledge1: true, gymPhone: '09011112222' };
  const packed = packDraft(dirty, NOW, LINK);
  assert.ok(packed);
  const outer = JSON.parse(packed as string) as Record<string, unknown>;
  assert.deepEqual(Object.keys(outer), ['v', 'eventId', 'mode', 'savedAt', 'f']);
  assert.equal(outer.v, 1);
  assert.equal(outer.eventId, 'draft-test');
  assert.equal(outer.mode, 'live');
  assert.equal(outer.savedAt, NOW);
  assert.deepEqual(Object.keys(outer.f as object), [...DRAFT_FIELDS]);
  const text = packed as string;
  assert.equal(/09012345678|09011112222|a@example\.com|data:image|1975-08-20|"consent"|"photo"|"hnBirth"|"pledge/i.test(text), false);
  // 生年月日らしい形・電話らしい形・メールらしい形が、1つも無い
  assert.equal(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(text), false);
  assert.equal(/0\d{1,4}-\d{1,4}-\d{3,4}|\b0\d{9,10}\b/.test(text), false);
  assert.equal(/[\w.+-]+@[\w-]+\.[\w.]+/.test(text), false);
  for (const key of NEVER_STORED) assert.equal(text.includes('"' + key + '"'), false, key);
  const back = parseDraft(packed, NOW + 5 * MIN, LINK);
  assert.ok(back);
  assert.deepEqual({ ...back.fields }, FIELDS);
  assert.equal(back.savedAt, NOW);
});

test('packDraft: 入れるものが何もなければ null（保存しない）。電話・メールだけの下書きも null', () => {
  assert.equal(packDraft({}, NOW, LINK), null);
  assert.equal(packDraft({ gym: '', name: '  ' }, NOW, LINK), packDraft({ name: '  ' }, NOW, LINK));
  assert.equal(packDraft({ contactPhone: '09012345678', consent: true, photo: 'data:image/jpeg;base64,AAAA' }, NOW, LINK), null);
  assert.equal(packDraft({ comment: '連絡は 090-1234-5678 へ' }, NOW, LINK), null);
});

test('parseDraft: 期限（12時間）。11時間59分は読む、12時間ちょうどは読まない', () => {
  const packed = packDraft(FIELDS, NOW, LINK) as string;
  assert.ok(parseDraft(packed, NOW, LINK), '書いた直後');
  assert.ok(parseDraft(packed, NOW + DRAFT_TTL_MS - 1, LINK));
  assert.equal(parseDraft(packed, NOW + DRAFT_TTL_MS, LINK), undefined);
  assert.equal(parseDraft(packed, NOW + DRAFT_TTL_MS + 1, LINK), undefined);
  assert.equal(parseDraft(packed, NOW + 60 * MIN, LINK) !== undefined, true, '60分たっても、下書きは12時間生きる');
});

test('parseDraft: 時刻が未来・0・負・文字・NaN は読まない', () => {
  for (const savedAt of [NOW + 1, NOW + 10 * MIN, 0, -5, '123', null, NaN, Infinity, true]) {
    const text = JSON.stringify({ v: 1, eventId: LINK.eventId, mode: 'live', savedAt, f: FIELDS });
    assert.equal(parseDraft(text, NOW, LINK), undefined, String(savedAt));
  }
  assert.ok(parseDraft(JSON.stringify({ v: 1, eventId: LINK.eventId, mode: 'live', savedAt: NOW, f: FIELDS }), NOW, LINK), 'ふつうの形は読める');
});

test('parseDraft: 別の大会・別のモード・別の版は読まない（鍵が合っていても、中身の eventId・mode・v を見る）', () => {
  const packed = packDraft(FIELDS, NOW, LINK) as string;
  assert.equal(parseDraft(packed, NOW, { eventId: 'other-event', mode: 'live' }), undefined);
  assert.equal(parseDraft(packed, NOW, { eventId: 'draft-test', mode: 'test' }), undefined);
  const raw = JSON.parse(packed) as Record<string, unknown>;
  assert.equal(parseDraft(JSON.stringify({ ...raw, v: 2 }), NOW, LINK), undefined);
  assert.equal(parseDraft(JSON.stringify({ ...raw, v: '1' }), NOW, LINK), undefined);
  assert.equal(parseDraft(JSON.stringify({ ...raw, eventId: 5 }), NOW, LINK), undefined);
  assert.equal(parseDraft(JSON.stringify({ ...raw, mode: 'x' }), NOW, LINK), undefined);
  const test = packDraft(FIELDS, NOW, { eventId: 'draft-test', mode: 'test' }) as string;
  assert.equal(parseDraft(test, NOW, LINK), undefined, 'テストの下書きは本番で読まない');
});

test('parseDraft: 形がちがう物は読まない（JSON でない・配列・文字・null・f が無い・f が配列・巨大）', () => {
  const ok = { v: 1, eventId: LINK.eventId, mode: 'live', savedAt: NOW };
  for (const text of [null, undefined, '', 'x', '{', '[]', '[1]', '"s"', '5', 'null', 'true', JSON.stringify(ok), JSON.stringify({ ...ok, f: [] }), JSON.stringify({ ...ok, f: 'x' }), JSON.stringify({ ...ok, f: null }), JSON.stringify({ ...ok, f: {} }), JSON.stringify({ ...ok, k: FIELDS }), 'x'.repeat(30000)]) {
    assert.equal(parseDraft(text as string, NOW, LINK), undefined, String(text).slice(0, 30));
  }
});

test('parseDraft: ほかの鍵・文字でない型は捨てる（連絡先・電話・写真が混ざっていても、出てこない）', () => {
  const text = JSON.stringify({
    v: 1, eventId: LINK.eventId, mode: 'live', savedAt: NOW, contactPhone: '09012345678', photo: 'data:image/jpeg;base64,AAAA',
    f: { ...FIELDS, contactName: '架空', contactPhone: '09012345678', contactEmail: 'a@example.com', consent: true, photo: 'data:image/jpeg;base64,AAAA', hnBirth: '1975-08-20', pledge1: true, gym: 123, name: ['x'], comment: { a: 1 } },
  });
  const back = parseDraft(text, NOW, LINK);
  assert.ok(back);
  assert.deepEqual(Object.keys(back.fields), [...DRAFT_FIELDS]);
  assert.equal(back.fields.gym, '', '文字でない値は空');
  assert.equal(back.fields.name, '');
  assert.equal(back.fields.comment, '');
  assert.equal(back.fields.height, '170');
  assert.equal(JSON.stringify(back).includes('09012345678'), false);
  assert.equal(JSON.stringify(back).includes('data:image'), false);
  assert.equal(JSON.stringify(back).includes('1975'), false);
  // 読むときにも、電話らしい欄・長さを直す（ほかの版が書いた物でも通さない）
  const rewritten = parseDraft(JSON.stringify({ v: 1, eventId: LINK.eventId, mode: 'live', savedAt: NOW, f: { gym: '架空ジム', comment: '090-1234-5678', record: 'あ'.repeat(5000) } }), NOW, LINK);
  assert.ok(rewritten);
  assert.equal(rewritten.fields.comment, '');
  assert.equal(rewritten.fields.record.length, DRAFT_MAX.record);
  // 捨てたあと何も残らないなら、読まない
  assert.equal(parseDraft(JSON.stringify({ v: 1, eventId: LINK.eventId, mode: 'live', savedAt: NOW, f: { contactPhone: '09012345678', photo: 'x' } }), NOW, LINK), undefined);
});

/* ---------- 戻すとき ---------- */

const SHAPE: DraftLinkShape = { weights: DEFAULT_WEIGHT_SETTINGS, classes: true, hanamichiRule: false, grade: true, age: true, comment: true, music: true };
const draft = (over: Record<string, string> = {}): DraftFields => pickDraft({ ...FIELDS, ...over });
/** 階級のある区分（初期の表の、階級のある最初の区分） */
const WITH_CLASSES = DEFAULT_WEIGHT_SETTINGS.divisions.find((d) => d.classes.length > 0)!;

test('fitDraftToLink: 区分はリンクの選択肢にあるときだけ。階級はその区分で有効なときだけ', () => {
  const first = WITH_CLASSES;
  const klass = first.classes[0];
  const noClassDivision = DEFAULT_WEIGHT_SETTINGS.divisions.find((d) => d.classes.length === 0);
  assert.ok(noClassDivision, '階級のない区分（小学生以下）がある');
  const noClass = fitDraftToLink(draft({ division: noClassDivision.name, weightClass: klass }), SHAPE);
  assert.equal(noClass.division, noClassDivision.name, '階級のない区分は、区分だけ戻す');
  assert.equal(noClass.weightClass, '', '階級のない区分に、階級は戻さない');
  const fine = fitDraftToLink(draft({ division: first.name, weightClass: klass }), SHAPE);
  assert.equal(fine.division, first.name);
  assert.equal(fine.weightClass, klass);
  const gone = fitDraftToLink(draft({ division: 'この区分は無い', weightClass: klass }), SHAPE);
  assert.equal(gone.division, '');
  assert.equal(gone.weightClass, '');
  const wrongClass = fitDraftToLink(draft({ division: first.name, weightClass: '999kg以下' }), SHAPE);
  assert.equal(wrongClass.division, first.name);
  assert.equal(wrongClass.weightClass, '', 'その区分に無い階級は戻さない');
  const noWeights = fitDraftToLink(draft({ division: first.name, weightClass: klass }), { ...SHAPE, weights: undefined });
  assert.equal(noWeights.division, '');
  assert.equal(noWeights.weightClass, '');
  assert.equal(fine.gym, FIELDS.gym, 'ほかの欄はそのまま');
});

test('fitDraftToLink: クラスは クラス分け＝あり のときだけ。花道のルールがあって花道の区分なら戻さない。リンクに出ない欄は戻さない', () => {
  const first = WITH_CLASSES;
  assert.equal(fitDraftToLink(draft({ division: first.name, weightClass: first.classes[0] }), SHAPE).fighterClass, 'upper');
  assert.equal(fitDraftToLink(draft({ division: first.name }), { ...SHAPE, classes: false }).fighterClass, '');
  const hanamichi = { enabled: true as const, divisions: [{ name: '花道男子（40歳以上）', classes: ['無差別'] }, { name: '一般男子', classes: ['60kg以下'] }] };
  const withRule: DraftLinkShape = { ...SHAPE, weights: hanamichi, hanamichiRule: true };
  assert.equal(fitDraftToLink(draft({ division: '花道男子（40歳以上）', weightClass: '無差別' }), withRule).fighterClass, '', '花道の区分は、クラスを選ばせない');
  assert.equal(fitDraftToLink(draft({ division: '一般男子', weightClass: '60kg以下' }), withRule).fighterClass, 'upper', '花道でない区分は、いつも通り');
  assert.equal(fitDraftToLink(draft({ division: '花道男子（40歳以上）', weightClass: '無差別' }), { ...withRule, hanamichiRule: false }).fighterClass, 'upper', '花道のルールが無い昔のリンクは、クラスを選ぶ');
  const hidden = fitDraftToLink(draft(), { ...SHAPE, grade: false, age: false, comment: false, music: false });
  assert.deepEqual([hidden.grade, hidden.age, hidden.comment, hidden.musicUrl], ['', '', '', '']);
  assert.equal(hidden.name, FIELDS.name);
});

/* ---------- 次の人 ---------- */

test('pickNext: 入れてよい7個だけ（ジム名・連絡先3つ・同意・ジム責任者の名前と電話）。選手の欄・写真・花道・誓約書の✔・念押しは捨てる', () => {
  const dirty: Record<string, unknown> = {
    ...KIT, ...FIELDS, photo: 'data:image/jpeg;base64,AAAA', photoDataUrl: 'data:image/jpeg;base64,AAAA', hnBirth: '1975-08-20', hnJob: '会社員', pledge1: true, pledgeItems: '1,2', pledgeGuardian: 'yes', gymPermission: true, pledgeGym: true, gymConsent: true,
  };
  const picked = pickNext(dirty);
  assert.deepEqual(Object.keys(picked).sort(), ['consent', 'contactEmail', 'contactName', 'contactPhone', 'gym', 'gymName', 'gymPhone']);
  assert.deepEqual({ ...picked }, KIT);
  for (const key of NEXT_NEVER_STORED) assert.equal(key in picked, false, key);
  assert.equal(pickNext({ ...KIT, consent: 'yes' }).consent, false, 'consent は true のときだけ true');
  assert.equal(pickNext({ ...KIT, consent: 1 }).consent, false);
  assert.equal(pickNext({ ...KIT, consent: undefined }).consent, false);
  assert.equal(pickNext({ gym: 5, contactName: null, contactPhone: [], contactEmail: {} }).gym, '');
  assert.equal(nextIsEmpty(pickNext({})), true);
  assert.equal(nextIsEmpty(pickNext(null as unknown as Record<string, unknown>)), true, 'null でも投げない');
  assert.equal(nextIsEmpty(picked), false);
  assert.equal(pickNext({ ...KIT, contactName: 'data:image/png;base64,AAAA' }).contactName, '', '写真らしい欄は入れない');
});

test('packNext / parseNext: 往復。入れ物は version・eventId・mode・savedAt・k だけ。選手の欄・写真・花道・✔は、中身のどこにも無い', () => {
  const packed = packNext({ ...KIT, ...FIELDS, photo: 'data:image/jpeg;base64,AAAA', hnBirth: '1975-08-20', pledge1: true, gymPermission: true }, NOW, LINK);
  assert.ok(packed);
  const outer = JSON.parse(packed as string) as Record<string, unknown>;
  assert.deepEqual(Object.keys(outer), ['v', 'eventId', 'mode', 'savedAt', 'k']);
  assert.deepEqual(Object.keys(outer.k as object).sort(), ['consent', 'contactEmail', 'contactName', 'contactPhone', 'gym', 'gymName', 'gymPhone']);
  const text = packed as string;
  assert.equal(/data:image|1975|架空 選手|3勝1敗|全力で|music\.apple/.test(text), false, '選手の欄・写真・生年月日は無い');
  for (const key of NEXT_NEVER_STORED) assert.equal(text.includes('"' + key + '"'), false, key);
  const back = parseNext(packed, NOW + 59 * MIN, LINK);
  assert.ok(back);
  assert.deepEqual({ ...back.kit }, KIT);
  assert.equal(back.savedAt, NOW);
});

test('packNext: ジム名も連絡先も空なら null。同意だけ・ジム責任者だけでは保存しない', () => {
  assert.equal(packNext({}, NOW, LINK), null);
  assert.equal(packNext({ consent: true, gymName: '架空', gymPhone: '09011112222' }, NOW, LINK), null);
  assert.ok(packNext({ gym: '架空ジムA' }, NOW, LINK));
});

test('parseNext: 期限は60分。59分59秒は読む、60分ちょうどは読まない。未来の時刻は読まない', () => {
  const packed = packNext(KIT, NOW, LINK) as string;
  assert.ok(parseNext(packed, NOW, LINK));
  assert.ok(parseNext(packed, NOW + NEXT_TTL_MS - 1, LINK));
  assert.equal(parseNext(packed, NOW + NEXT_TTL_MS, LINK), undefined);
  assert.equal(parseNext(packed, NOW + 61 * MIN, LINK), undefined);
  assert.equal(parseNext(packed, NOW + 3 * 3600 * 1000, LINK), undefined);
  assert.equal(parseNext(packed, NOW - 1, LINK), undefined, '書いた時刻より前（未来の時刻）');
  assert.equal(NEXT_TTL_MS < DRAFT_TTL_MS, true);
});

test('parseNext: 別の大会・別のモード・版・形がちがう物・下書きの入れ物は読まない', () => {
  const packed = packNext(KIT, NOW, LINK) as string;
  assert.equal(parseNext(packed, NOW, { eventId: 'other-event', mode: 'live' }), undefined);
  assert.equal(parseNext(packed, NOW, { eventId: 'draft-test', mode: 'test' }), undefined);
  const raw = JSON.parse(packed) as Record<string, unknown>;
  assert.equal(parseNext(JSON.stringify({ ...raw, v: 2 }), NOW, LINK), undefined);
  for (const text of [null, undefined, '', 'x', '{', '[]', 'null', JSON.stringify({ ...raw, k: [] }), JSON.stringify({ ...raw, k: 'x' }), JSON.stringify({ ...raw, k: {} }), JSON.stringify({ ...raw, k: undefined }), packDraft(FIELDS, NOW, LINK), 'x'.repeat(30000)]) {
    assert.equal(parseNext(text as string, NOW, LINK), undefined, String(text).slice(0, 30));
  }
  // 次の人の入れ物が、下書きとして読まれることも無い
  assert.equal(parseDraft(packed, NOW, LINK), undefined);
});

test('parseNext: ほかの鍵・文字でない型は捨てる（選手の欄・写真・✔が混ざっていても、出てこない）', () => {
  const text = JSON.stringify({ v: 1, eventId: LINK.eventId, mode: 'live', savedAt: NOW, k: { ...KIT, ...FIELDS, photo: 'data:image/jpeg;base64,AAAA', pledge1: true, gymPermission: true, gym: 5, contactName: '架空 連絡' } });
  const back = parseNext(text, NOW, LINK);
  assert.ok(back);
  assert.equal(back.kit.gym, '', '文字でない値は空');
  assert.equal(back.kit.contactName, '架空 連絡');
  for (const key of NEXT_NEVER_STORED) assert.equal(key in back.kit, false, key);
  assert.equal(JSON.stringify(back).includes('data:image'), false);
  assert.equal(parseNext(JSON.stringify({ v: 1, eventId: LINK.eventId, mode: 'live', savedAt: NOW, k: { consent: true, photo: 'x' } }), NOW, LINK), undefined, '捨てたあと何も残らない');
});

test('agoText: 1分以内／◯分前／◯時間前', () => {
  assert.equal(agoText(NOW, NOW), '1分以内');
  assert.equal(agoText(NOW, NOW + 59 * 1000), '1分以内');
  assert.equal(agoText(NOW, NOW + 60 * 1000), '1分前');
  assert.equal(agoText(NOW, NOW + 12 * MIN), '12分前');
  assert.equal(agoText(NOW, NOW + 59 * MIN), '59分前');
  assert.equal(agoText(NOW, NOW + 60 * MIN), '1時間前');
  assert.equal(agoText(NOW, NOW + 150 * MIN), '2時間前');
  assert.equal(agoText(NOW + 5000, NOW), '1分以内', '時計が戻っても負にならない');
});

/* ---------- storage が使えないとき ---------- */

const memory = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); }, removeItem: (key) => { map.delete(key); } };
};
const thrower: StorageLike = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
  removeItem: () => { throw new Error('SecurityError'); },
};

test('safeGet / safeSet / safeRemove: ふつうに動く。投げる storage・null・undefined でも、投げずに黙って何もしない', () => {
  const m = memory();
  assert.equal(safeSet(m, 'k', 'v'), true);
  assert.equal(safeGet(m, 'k'), 'v');
  safeRemove(m, 'k');
  assert.equal(safeGet(m, 'k'), null);
  assert.equal(safeSet(thrower, 'k', 'v'), false);
  assert.equal(safeGet(thrower, 'k'), null);
  assert.doesNotThrow(() => safeRemove(thrower, 'k'));
  for (const none of [null, undefined]) {
    assert.equal(safeSet(none, 'k', 'v'), false);
    assert.equal(safeGet(none, 'k'), null);
    assert.doesNotThrow(() => safeRemove(none, 'k'));
  }
});

test('まとめ: 下書きと次の人は鍵が別。同じ storage に入れても混ざらず、片方を消してももう片方は残る', () => {
  const m = memory();
  safeSet(m, draftKey(LINK), packDraft(FIELDS, NOW, LINK) as string);
  safeSet(m, nextKey(LINK), packNext(KIT, NOW, LINK) as string);
  assert.notEqual(draftKey(LINK), nextKey(LINK));
  assert.ok(parseDraft(safeGet(m, draftKey(LINK)), NOW, LINK));
  assert.ok(parseNext(safeGet(m, nextKey(LINK)), NOW, LINK));
  safeRemove(m, draftKey(LINK));
  assert.equal(parseDraft(safeGet(m, draftKey(LINK)), NOW, LINK), undefined);
  assert.ok(parseNext(safeGet(m, nextKey(LINK)), NOW, LINK), '次の人の入れ物は残る');
  // 保存した値を全部見る：電話・メール・写真・生年月日・✔ が下書きの鍵に無い
  const stored = [...m.map.entries()];
  for (const [key, value] of stored) if (key.startsWith(DRAFT_KEY_PREFIX)) assert.equal(/09000000000|09011112222|@|data:|生年月日|1975/.test(value), false, key);
});

test('core/applyDraft.ts: DOM・window・document・storage の名前・fetch・lookbehind・文（誓約・同意）を持たない', () => {
  const source = readFileSync(new URL('../core/applyDraft.ts', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/\b(window|document|navigator|localStorage|sessionStorage|fetch|XMLHttpRequest|indexedDB|cookie)\b/.test(code), false, 'ブラウザの物を直接使わない（storage は渡される）');
  assert.equal(/\(\?<[=!]/.test(code), false, 'lookbehind は Safari 15 で動かない');
  assert.equal(/誓約|同意致|賠償|一任/.test(code), false, '誓約・同意の文を持たない');
});

/* ---------- 申し込みページ（app/apply/page.tsx）の約束：ソースの上で見張る。動きは scripts/test-apply-draft.mjs が本物の Chromium で確かめる ---------- */

const PAGE = readFileSync(new URL('../app/apply/page.tsx', import.meta.url), 'utf8');
const PAGE_CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('page: sessionStorage に触るのは tabStorage() の1か所だけ。localStorage は送信ずみの目印（SENT_KEY）だけ。通信の道具・Cookie を使わない', () => {
  assert.equal((PAGE_CODE.match(/sessionStorage/g) || []).length, 1, 'sessionStorage は tabStorage の1か所');
  assert.match(PAGE_CODE, /function tabStorage\(\): StorageLike \| null \{\s*try \{ return window\.sessionStorage; \} catch \{ return null; \}\s*\}/, 'さわるだけで投げる storage でも、null にして黙って進む');
  const local = PAGE_CODE.match(/localStorage\.\w+\([^)]*\)/g) || [];
  assert.ok(local.length >= 1 && local.every((use) => /\((SENT_KEY)[,)]/.test(use)), 'localStorage は SENT_KEY だけ: ' + local.join(' | '));
  assert.doesNotMatch(PAGE_CODE, /\bfetch\(|XMLHttpRequest|sendBeacon|document\.cookie|indexedDB|BroadcastChannel/, 'ネットにも、Cookie にも、ほかの入れ物にも出さない');
  assert.doesNotMatch(PAGE_CODE, /\(\?<[=!]/, 'lookbehind は Safari 15 で動かない');
});

test('page: 送信の直前（form を送る前）に saveNextRef が呼ばれる。保存は safeSet／safeRemove 経由（投げても止めない）', () => {
  const call = PAGE_CODE.indexOf('saveNextRef.current()');
  const submit = PAGE_CODE.indexOf('form.requestSubmit()');
  assert.ok(call > 0 && submit > call, '送る前に呼ぶ');
  assert.match(PAGE_CODE, /try \{ saveNextRef\.current\(\); \} catch/, '何があっても送るのは止めない');
  assert.doesNotMatch(PAGE_CODE, /\.setItem\(\s*(draftKey|nextKey)/, 'storage への書き込みは safeSet だけ');
  assert.ok((PAGE_CODE.match(/safeSet\(/g) || []).length >= 2 && (PAGE_CODE.match(/safeRemove\(/g) || []).length >= 4);
});

test('page: 案内の枠は静か：データを持つ id が2つ。黄色の「次はここ」の部品（NextBox・data-tos-next・👉）を使わない。灰色の副ボタン。ボタンの文字は 戻す／消す／変える', () => {
  const from = PAGE.indexOf('id="draft-banner"') - 40;
  const to = PAGE.indexOf('<fieldset disabled=');
  assert.ok(from > 0 && to > from);
  const block = PAGE.slice(from, to);
  assert.doesNotMatch(block, /NextBox|data-tos-next|tos-next|👉|次はここ|role="alert"/);
  assert.match(block, /id="next-banner"/);
  assert.match(block, /onClick=\{restoreDraft\} className=\{greyBtn\}>戻す</);
  assert.match(block, /onClick=\{discardDraft\} className=\{greyBtn\}>消す</);
  assert.match(block, /onClick=\{changeNext\} className=\{greyBtn\}>変える</);
  assert.match(block, /さっきの入力が残っています（\{agoText\(draftOffer\.savedAt, Date\.now\(\)\)\}）。/);
  assert.match(block, /残しているのは、選手の欄だけです。\{keptNot\}は、残していません。/, '下書きの案内は、残す物（選手の欄だけ）を正直に言う。残さない物の名前は、このリンクにある物だけ（keptNot）');
  assert.match(block, /個人情報の同意のチェックも入っています。/);
  assert.match(block, /ジム責任者の名前・電話も入っています。/);
  assert.match(block, /さっきと同じジム名・連絡先を入れました。/);
  assert.match(block, /共用の端末（ジムのタブレットなど）では、「変える」を押すか、タブを閉じてください。/);
});

test('page: 文は事実に合わせた。「残りません」「更新すると、入力は消えます」はもう言わない。ボタンの名前は「選手の入力だけ消す」', () => {
  for (const old of ['入力した内容は、この申し込みサイトには残りません', '途中でページを閉じたり、更新すると、入力は消えます', '別の人を申し込む（入力を消して、最初から）', 'ブラウザの中にだけ入ります']) assert.ok(!PAGE.includes(old), old);
  for (const now of [
    '送った内容は、主催者のGoogleのシートとドライブにだけ保存されます。',
    'この画面は、入力の途中では、選手の欄（ジム名・選手名・身長・体重など）だけを、このスマホのこのページの中にだけ、一時的に覚えておけます。{keptNot}は、途中では覚えません。送信するか、「消す」を押すか、ページ（タブ）を閉じると、消えます。',
    '送ったあと、もう1人申し込む人のために、ジム名と連絡先を、このスマホのこのタブの中に60分だけ覚えます。タブを閉じると消えます。',
    '途中でページ（タブ）を閉じると、入力は消えます。更新したときは、選手の欄（ジム名・選手名・身長・体重など）の入力だけ、残っていることがあります（上に「戻す」が出ます）。{keptNot}は、入れ直しになります。',
    '※ 別のブラウザで開き直すと、入力は消えます。',
    '別の人を申し込む（選手の入力だけ消す）',
    '次のボタンを押すと、選手の入力と写真が消えます。ジム名と連絡先は、そのまま残ります（送った申し込みは、消えません）。',
    'このメモは、ネットには送りません。',
  ]) assert.ok(PAGE.includes(now), now);
  // 使い道の中にも、同じ2つの文（共用の端末の1行つき）
  assert.equal((PAGE.match(/共用の端末（ジムのタブレットなど）では、「変える」を押すか、タブを閉じてください。/g) || []).length, 3, '連絡先のそば・使い道・案内の枠');
});

test('page: 「別の人を申し込む」は選手の入力だけ消す（ジム名・連絡先・同意・ジム責任者の名前と電話は残す）。誓約書の✔・保護者の✔・念押しの✔は消す', () => {
  const body = PAGE_CODE.slice(PAGE_CODE.indexOf('const resetAthlete = () => {'), PAGE_CODE.indexOf('const restoreDraft = () => {'));
  assert.ok(body.length > 200);
  assert.match(body, /setFighter\(\(old\) => \(\{ \.\.\.blank\(\), gym: old\.gym \}\)\)/, 'ジム名だけ残す');
  assert.match(body, /setPhoto\(''\)/);
  assert.match(body, /setHn\(blankHn\(\)\); setBirth\(blankBirth\(\)\)/);
  assert.match(body, /setPledgeAns\(blankPledgeAnswers\(\)\)/);
  assert.match(body, /setChosenClass\(''\); setDivision\(''\); setWeightClass\(''\)/);
  assert.doesNotMatch(body, /setContactName|setContactPhone|setContactEmail|setConsent|setGymNameRaw|setGymPhoneRaw/, '連絡先・同意・ジム責任者の名前と電話は、さわらない');
  assert.match(body, /sentPayloadRef\.current = ''/);
  assert.match(body, /setRequestId\(''\)/, '次の人は、新しい控え番号で送る');
});

test('page: 下書きに入れる値は draftSrc の12個だけ（連絡先・同意・写真・花道・誓約書は入らない）', () => {
  const start = PAGE_CODE.indexOf('const draftSrc: Record<string, string> = {');
  const body = PAGE_CODE.slice(start, PAGE_CODE.indexOf('const draftSrcKey'));
  assert.ok(start > 0 && body.length > 100);
  const keys = [...body.matchAll(/(\w+): /g)].map((m) => m[1]).filter((k) => k !== 'draftSrc' && k !== 'string' && k !== 'Record');
  assert.deepEqual(keys.sort(), [...DRAFT_FIELDS].sort(), '下書きの元は、DRAFT_FIELDS の12個と同じ');
  assert.doesNotMatch(body, /contact|consent|photo|hn\b|birth|pledge|guardian|gymName|gymPhone/i);
});
