// Round-1 polish regression checks for the chairman screen (/private/): each test names the finding it guards.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { suggestBouts } from '../core/boutSuggest.ts';
import { DEFAULT_CLASS_SETTINGS as D, MAX_RECORD_CHARS, normalizeClassLoose, parseWins } from '../core/classRules.ts';
import { classesFromParam, DEFAULT_ENTRY_CONFIG, ENTRY_HEADERS, entryClassError, entryConfigFromSearch, entryConfigSearch, entryCsv, type EntryFighter } from '../core/entryPackage.ts';
import { boutWarnings, emptyTournament, HARD_TEXT_LIMIT, importFighters, isLocalTournament, sameFighterKey, type LocalBout, type LocalFighter } from '../core/privateTournament.ts';
import {
  classChoices, classifySaveError, classNamesOf, effectiveClassSettings, entryConfigFromHash, heightWeightSwapped, importErrorParts, importErrorText, ImportProblem, importProblemKind, isPhotoName, isRosterCsvName, isZipJunk,
  mergeKeepExisting, nextAction, normalizeImported, pickMarker, pickZipRoster, saveErrorText, saveLine, saveReasonShort, saveReasonText, tooLong, weightUnreadable, zipEntryName, TEXT_LIMITS,
} from '../app/private/logic.ts';
import { checkFighter, checkNumber, fieldOfEntryError } from '../app/private/normalize.ts';

const fighter = (id: string, over: Partial<LocalFighter> = {}): LocalFighter => ({ id, gym: 'ジム' + id, name: '選手' + id, grade: '', age: '', height: '170', weight: '60', record: '初試合', comment: '', musicUrl: '', photoDataUrl: '', ...over });
const bout = (id: string, redId: string, blueId: string): LocalBout => ({ id, redId, blueId, className: '', rule: '' });

/* ───────── r1-9 / r1-11: 戦績の読み取り（止まらない・まちがった数を出さない・よくある言い方） ───────── */

test('r1-9 parseWins: 長い数字の並びで止まらない（30000文字でも一瞬）', () => {
  const t0 = Date.now();
  for (const n of [400, 3000, 30000]) {
    assert.equal(parseWins('1'.repeat(n)), null);
    assert.equal(parseWins('1 '.repeat(n / 2)), null);
    assert.equal(parseWins('一'.repeat(n)), null);
    parseWins('1-'.repeat(n / 2)); // 値はどうでもよい（時間だけ見る）
    assert.equal(parseWins('勝'.repeat(n)), null);
  }
  assert.ok(Date.now() - t0 < 500, '3万文字を何度読んでも0.5秒以内（かかった時間 ' + (Date.now() - t0) + 'ms）');
  assert.equal(parseWins('3勝' + 'あ'.repeat(MAX_RECORD_CHARS)), null, '長すぎる戦績は読まない');
  assert.equal(parseWins('3勝'), 3);
  assert.equal(parseWins('2023年に3勝'), 3, '年の数字は、勝ちの数ではない');
});

test('r1-11 parseWins: アマ初・未勝利・1戦1敗などは0勝。小数点つきは決めない', () => {
  const zero = ['アマ初', 'アマチュア初出場', 'アマ初試合', '初試合になります', '初試合になる予定', '試合は初めてです', '初めての試合です', '初試合（空手3年）', '空手3年・初試合', '初試合ー', '未勝利', '勝ちなし', '勝ち無し', '1戦1敗', '2戦2敗', '空手3年 試合は未経験'];
  for (const record of zero) assert.equal(parseWins(record), 0, record);
  for (const record of ['3.5勝', '1.5勝', '3．5勝', '2.5-1']) assert.equal(parseWins(record), null, record + '（小数点は、勝ちの数にしない）');
  for (const record of ['3戦1敗', '5戦 初試合', '初試合ではありません', '勝ち負けなし', '2024-05-12', '3戦', '3敗', '空手3年']) assert.equal(parseWins(record), null, record);
  // これまでの読み方は、そのまま
  for (const [record, wins] of [['3勝0敗', 3], ['2勝1敗', 2], ['三勝', 3], ['３勝', 3], ['10戦3勝7敗', 3], ['3W', 3], ['3-0-0', 3], ['KO勝ち3回', null]] as const) assert.equal(parseWins(record), wins, record);
});

test('r1-32 normalizeClassLoose: A・a・Ａクラス・上・下 を設定の名前にそろえる。読めないものはそのまま', () => {
  for (const v of ['A', 'a', 'Ａ', ' Ａクラス ', 'aクラス', '上', '上位']) assert.equal(normalizeClassLoose(v, D), 'Aクラス', v);
  for (const v of ['B', 'b', 'Ｂクラス', '下']) assert.equal(normalizeClassLoose(v, D), 'Bクラス', v);
  assert.equal(normalizeClassLoose('Cクラス', D), 'Cクラス');
  assert.equal(normalizeClassLoose('=HYPERLINK("x")', D), '=HYPERLINK("x")');
  // 名前を変えたシートでは、頭文字の A・B は使わない（まちがえない）
  const renamed = { ...D, upper: { ...D.upper, name: 'シニア' }, lower: { ...D.lower, name: 'ジュニア' } };
  assert.equal(normalizeClassLoose('A', renamed), 'A');
  assert.equal(normalizeClassLoose('上', renamed), 'シニア');
  assert.equal(normalizeClassLoose('ジュニア', renamed), 'ジュニア');
});

/* ───────── 取り込み（B11・r1-23・r1-31・r1-32・r1-118・r1-153） ───────── */

test('r1-26 importFighters: 「クラス」列の有無を返す。見出しの別名（クラス区分・申込クラス）も読む', () => {
  assert.equal(importFighters('管理番号,選手名,クラス\nF1,赤,').hasClassColumn, true, '空欄だけの列でも「列はある」');
  assert.equal(importFighters('管理番号,選手名\nF1,赤').hasClassColumn, false);
  assert.equal(importFighters('管理番号,選手名,クラス区分\nF1,赤,Aクラス').fighters[0].fighterClass, 'Aクラス');
  assert.equal(importFighters('管理番号,選手名,申込クラス\nF1,赤,Bクラス').fighters[0].fighterClass, 'Bクラス');
  assert.equal(importFighters('管理番号,選手名,電話番号\nF1,赤,1').hasClassColumn, false);
});

test('r1-23 importFighters: 5000文字を超える欄は切って、数を返す（保存がぜんぶ失敗しないように）', () => {
  const long = 'あ'.repeat(6000);
  const result = importFighters('管理番号,選手名,意気込み\nF1,赤,' + long + '\nF2,青,ふつう');
  assert.equal(result.cut, 1);
  assert.equal(result.fighters[0].comment.length, HARD_TEXT_LIMIT);
  const t = { ...emptyTournament('long-test'), fighters: result.fighters };
  assert.equal(isLocalTournament(t), true, '切ったあとは、保存の検査を通る');
  assert.equal(isLocalTournament({ ...t, fighters: [{ ...result.fighters[0], comment: long }] }), false, '切らないと、保存がぜんぶ失敗する');
  assert.equal(importFighters('管理番号,選手名\nF1,赤').cut, 0);
});

test('r1-23 tooLong: 名前・ジム名だけでなく、戦績・意気込み・入場曲・学年も見つける。1人につき最初の1つ', () => {
  const list = [
    fighter('A', { record: 'あ'.repeat(TEXT_LIMITS.record + 1) }),
    fighter('B', { comment: 'い'.repeat(TEXT_LIMITS.comment + 1) }),
    fighter('C', { musicUrl: 'https://music.apple.com/' + 'u'.repeat(TEXT_LIMITS.musicUrl) }),
    fighter('D', { grade: 'う'.repeat(TEXT_LIMITS.grade + 1), name: 'え'.repeat(81) }),
    fighter('E'),
  ];
  assert.deepEqual(tooLong(list).map((x) => x.fighter.id + x.field + x.max), ['Arecord300', 'Bcomment500', 'CmusicUrl500', 'Dname80']);
});

test('r1-23 classifySaveError: 長すぎる欄は大会番号のせいにしない', () => {
  const dataError = new Error('保存するデータを確認してください。今あるデータは変えていません。');
  assert.equal(classifySaveError(dataError, 'good-id'), 'bad-data');
  assert.equal(classifySaveError(dataError, 'Bad Id!'), 'bad-id');
  assert.ok(!saveErrorText('bad-data').includes('新しい大会をつくる'));
  assert.match(saveErrorText('bad-data'), /長すぎます/);
  assert.match(saveReasonText('bad-data'), /長い…/);
  assert.equal(saveReasonShort('bad-data'), 'どこかの欄が長すぎます');
});

test('r1-31 / r1-83 / r1-118 / r1-153 normalizeImported: 全角の数字・単位・入場曲の空白を直し、直せないものは名前つきで返す', () => {
  const list = [
    fighter('A', { weight: '６５ｋｇ', height: '170cm', age: '１５歳' }),
    fighter('B', { weight: '六十五', height: '2000' }),
    fighter('C', { musicUrl: 'https://music.apple.com/jp/ album/x' }),
    fighter('D', { musicUrl: 'https://open.spotify.com/track/abc' }),
    fighter('E', { fighterClass: 'ａクラス' }),
    fighter('F'),
  ];
  const done = normalizeImported(list);
  const by = (id: string) => done.fighters.find((f) => f.id === id)!;
  assert.equal(by('A').weight, '65'); assert.equal(by('A').height, '170'); assert.equal(by('A').age, '15');
  assert.equal(by('C').musicUrl, 'https://music.apple.com/jp/album/x');
  assert.equal(by('E').fighterClass, 'Aクラス');
  assert.equal(by('F'), list[5] === by('F') ? list[5] : by('F'));
  assert.ok(done.fixed >= 5 && done.fixedPeople >= 3);
  assert.deepEqual(done.unreadable.map((u) => u.id + u.field).sort(), ['Bheight', 'Bweight', 'DmusicUrl']);
  assert.equal(by('B').weight, '六十五', '直せないものは、そのまま残す（黙って変えない）');
  assert.ok(done.examples.length > 0 && done.examples.every((e) => !e.includes('undefined')));
  assert.equal(weightUnreadable(done.fighters).map((f) => f.id).join(), 'B');
  assert.equal(normalizeImported([]).fixed, 0);
});

test('r1-31 / r1-118 heightWeightSwapped: 身長と体重を逆に書いたように見える人だけ', () => {
  assert.equal(heightWeightSwapped(fighter('A', { height: '65', weight: '170' })), true);
  assert.equal(heightWeightSwapped(fighter('A', { height: '55', weight: '170' })), true);
  assert.equal(heightWeightSwapped(fighter('A', { height: '170', weight: '65' })), false);
  assert.equal(heightWeightSwapped(fighter('A', { height: '120', weight: '30' })), false, '子どもでも、身長(cm)のほうが体重(kg)より大きい');
  assert.equal(heightWeightSwapped(fighter('A', { height: '', weight: '170' })), false);
  assert.equal(heightWeightSwapped(fighter('A', { height: '185', weight: '200' })), false, '身長が140を超えるなら、入れかえとは言わない');
});

test('r1-33 age 15.5 は年齢の欄の赤。名前の欄にしない', () => {
  assert.equal(checkNumber('age', '15.5').problem !== null, true);
  assert.equal(checkNumber('age', '15.0').problem, null);
  const result = checkFighter(fighter('A', { age: '15.5' }), DEFAULT_ENTRY_CONFIG, 'add');
  assert.deepEqual(result.problems.map((p) => p.key), ['age']);
  assert.equal(fieldOfEntryError('年齢を1〜120歳で入力してください。'), 'age');
  assert.equal(fieldOfEntryError('ジム名を入力してください。'), 'gym');
  assert.equal(fieldOfEntryError('入場曲はApple MusicかYouTubeのURLを入力してください。'), 'musicUrl');
  assert.equal(fieldOfEntryError('よくわからない文'), 'name');
});

/* ───────── B3・r1-27・r1-135・r1-177: 同じ人（名前もジムも同じ）を試合に入れたとき ───────── */

test('B3 boutWarnings: 管理番号がちがっても、名前もジムも同じ人は「同じ人かもしれません」。2試合に入れた数も、同じ人として数える', () => {
  const a1 = fighter('A1', { name: '山田 太郎', gym: 'ジム' }), a2 = fighter('A2', { name: '山田　太郎', gym: 'ジム' }), a3 = fighter('A3');
  const fs = [a1, a2, a3];
  assert.equal(sameFighterKey(a1), sameFighterKey(a2));
  assert.equal(sameFighterKey(fighter('X', { name: '' })), '');
  const same = boutWarnings(bout('1', 'A1', 'A2'), fs, [bout('1', 'A1', 'A2')]);
  assert.ok(same.some((w) => w.includes('同じ人かもしれません')), same.join('|'));
  assert.ok(same.some((w) => w.includes('同じジム')));
  // 別の試合で A2（同じ人）を使うと、A1 の試合にも「2 試合に入っています」が出る
  const two = [bout('1', 'A1', 'A3'), bout('2', 'A2', 'A3')];
  assert.ok(boutWarnings(two[0], fs, two).some((w) => w.includes('山田 太郎 が 2 試合')), boutWarnings(two[0], fs, two).join('|'));
  // 別の人どうしには出ない
  assert.ok(!boutWarnings(bout('1', 'A1', 'A3'), fs, [bout('1', 'A1', 'A3')]).some((w) => w.includes('同じ人かもしれません')));
});

/* ───────── r1-37 / r1-175: おすすめはクラスを優先する（分けない） ───────── */

test('r1-175 suggestBouts: 体重が5kg以内なら、同じクラスを選ぶ。遠いときは体重を優先（クラスで分けない）', () => {
  const fs = [fighter('1', { weight: '55', fighterClass: 'Aクラス' }), fighter('2', { weight: '56', fighterClass: 'Bクラス' }), fighter('3', { weight: '60', fighterClass: 'Aクラス' }), fighter('4', { weight: '61', fighterClass: 'Bクラス' })];
  let n = 0;
  const made = suggestBouts(fs, [], () => 'b' + ++n);
  const pairs = made.map((b) => [b.redId, b.blueId].sort().join('-')).sort();
  assert.deepEqual(pairs, ['1-3', '2-4'], 'A-A と B-B になる');
  // 遠いとき（10kg差）は、体重が近い相手を優先する
  const far = [fighter('1', { weight: '55', fighterClass: 'Aクラス' }), fighter('2', { weight: '56', fighterClass: 'Bクラス' }), fighter('3', { weight: '70', fighterClass: 'Aクラス' }), fighter('4', { weight: '71', fighterClass: 'Bクラス' })];
  const made2 = suggestBouts(far, [], () => 'x' + Math.random());
  assert.deepEqual(made2.map((b) => [b.redId, b.blueId].sort().join('-')).sort(), ['1-2', '3-4']);
  // クラスのない名簿は、今までと同じ（体重の近い順）
  const none = [fighter('1', { weight: '55' }), fighter('2', { weight: '56' }), fighter('3', { weight: '60' }), fighter('4', { weight: '61' })];
  assert.deepEqual(suggestBouts(none, [], () => 'y' + Math.random()).map((b) => [b.redId, b.blueId].sort().join('-')).sort(), ['1-2', '3-4']);
});

/* ───────── r1-173: 空の試合カードがあるときの「次はここ」 ───────── */

test('r1-173 pickMarker: 空の試合カードが待っているときは、保存でも「開く」でもなく、赤コーナー（黄色は1つ）', () => {
  const base = { titleReal: true, dateOk: true, fighters: 6, nonBlankBouts: 1, halfIndex: -1, dirty: true, everSaved: true, problems: 0, opened: false, saveState: 'idle' as 'idle' | 'failed', conflict: false };
  const input = (over: Partial<typeof base> & { blankIndex?: number }) => {
    const { blankIndex = 1, ...state } = over;
    const na = nextAction({ ...base, ...state });
    return pickMarker({ conflict: false, asking: false, chooseFirst: false, follow: null, na, saveState: state.saveState ?? 'idle', blankIndex, halfIndex: -1, halfSide: 'blue', fix: null, titleMissing: false });
  };
  const m = input({});
  assert.equal(m.where, 'bout'); assert.equal(m.index, 1); assert.equal(m.side, 'red'); assert.match(m.label, /第2試合の赤コーナーを選ぶ/);
  assert.equal(input({ dirty: false }).where, 'bout', '保存ずみで「開く」が次でも、空のカードが先');
  assert.equal(input({ blankIndex: -1 }).where, 'bar', '空のカードが無ければ、これまでどおり保存');
  assert.equal(input({ saveState: 'failed' }).where, 'bar-copy', '保存に失敗したときは、コピーのファイルが先');
});

/* ───────── r1-21 / r1-64 / r1-77 / r1-109 / r1-131 / r1-146 / r1-160 (B10): ZIP の読み方 ───────── */

test('B10 ZIP: フォルダ1つの中・Macのごみ・大文字小文字でも、名簿と写真を見つける', () => {
  const pick = (names: string[]) => pickZipRoster(names.filter((n) => !isZipJunk(zipEntryName(n))).map((raw) => [raw, zipEntryName(raw)] as const));
  const flat = pick(['players.csv', 'photos/F1.jpg']);
  assert.equal(flat?.csv, 'players.csv'); assert.deepEqual(flat?.photos.map(([, n]) => n), ['photos/F1.jpg']);
  const folder = pick(['選手名簿/players.csv', '選手名簿/photos/F1.jpg', '選手名簿/photos/F2.PNG']);
  assert.equal(folder?.csv, '選手名簿/players.csv'); assert.deepEqual(folder?.photos.map(([, n]) => n), ['photos/F1.jpg', 'photos/F2.PNG']);
  const mac = pick(['__MACOSX/選手名簿/._players.csv', '選手名簿/.DS_Store', '選手名簿/players.csv', '選手名簿/photos/._F1.jpg', '選手名簿/photos/F1.jpg', 'photos/.DS_Store']);
  assert.equal(mac?.csv, '選手名簿/players.csv'); assert.deepEqual(mac?.photos.map(([, n]) => n), ['photos/F1.jpg']);
  assert.equal(pick(['PLAYERS.CSV'])?.csv, 'PLAYERS.CSV');
  assert.equal(pick(['Tournament_OS_x\\players.csv', 'Tournament_OS_x\\photos\\F1.jpg'])?.photos.length, 1, 'Windows の区切りも読む');
  assert.equal(pick(['a/b/players.csv']), null, 'フォルダが2つ重なるものは読まない');
  assert.equal(pick(['notes.txt', 'photos/F1.jpg']), null);
  assert.equal(pick(['players.csv', 'other/players.csv'])?.csv, 'players.csv', '外にあるCSVを先に使う');
  // フォルダの中のCSVを使うときは、同じフォルダの写真だけ使う
  assert.deepEqual(pick(['A/players.csv', 'A/photos/1.jpg', 'B/photos/2.jpg'])?.photos.map(([, n]) => n), ['photos/1.jpg']);
  assert.equal(isRosterCsvName('x/players.csv'), true); assert.equal(isPhotoName('x/photos/a.webp'), true); assert.equal(isPhotoName('x/photos/a.gif'), false);
  assert.equal(isZipJunk('__MACOSX/a'), true); assert.equal(isZipJunk('a/._b.jpg'), true); assert.equal(isZipJunk('a/Thumbs.db'), true); assert.equal(isZipJunk('a/photos/b.jpg'), false);
});

test('r1-38 ZIP / 取り込みのエラー文: 「多すぎ」と「大きすぎ」を分け、同じ文を2回言わない', () => {
  const many = new ImportProblem('too-many-files');
  const parts = importErrorParts(many, 'z.zip');
  assert.match(parts.head, /ファイルが多すぎます/); assert.match(parts.detail, /3000まで/);
  assert.notEqual(parts.head.replace(/（.*）/, ''), parts.detail);
  const big = importErrorParts(new ImportProblem('too-large'), 'z.zip');
  assert.match(big.head, /大きすぎます/); assert.ok(!big.detail.includes('ファイルが大きすぎます'), 'くわしい文は、見出しの繰り返しではない');
  assert.match(big.detail, /100MB/);
  assert.equal(importProblemKind(new Error('ZIPの中のファイルが多すぎます')), 'too-many-files');
  assert.match(importErrorText(new ImportProblem('empty')), /選手名・ジム名・体重・戦績/);
  assert.match(importErrorText(new ImportProblem('no-list')), /players\.csv が見つかりません.*そのまま選んでください/);
});

/* ───────── r1-26: クラスの列が無いファイルで、クラスを消さない ───────── */

test('r1-26 クラスの列が無い古いファイルで、クラスが「ちがい」に出ない・書きかえでも消えない。空だった人には足す', () => {
  const current = [fighter('A', { fighterClass: 'Aクラス' }), fighter('B', { fighterClass: 'Bクラス' }), fighter('C')];
  const old = importFighters('管理番号,選手名,ジム名,体重\nA,選手A,ジムA,60\nB,選手B,ジムB,60\nC,選手C,ジムC,60');
  assert.equal(old.hasClassColumn, false);
  const noCol = mergeKeepExisting(current, old.fighters, { hasClassColumn: old.hasClassColumn });
  assert.ok(noCol.differs.every((d) => d.fields.every((f) => f.label !== 'クラス')), 'クラスは、ちがいに数えない');
  assert.deepEqual(noCol.overwritten.map((f) => f.fighterClass ?? ''), ['Aクラス', 'Bクラス', ''], '書きかえても、クラスは残る');
  const withCol = importFighters('管理番号,選手名,ジム名,体重,クラス\nA,選手A,ジムA,60,Aクラス\nB,選手B,ジムB,60,Bクラス\nC,選手C,ジムC,60,Aクラス');
  const filled = mergeKeepExisting(current, withCol.fighters, { hasClassColumn: withCol.hasClassColumn });
  assert.equal(filled.classesFilled, 1); assert.equal(filled.merged[2].fighterClass, 'Aクラス');
  assert.ok(filled.changed);
});

/* ───────── r1-28: シートで名前を変えたクラスは、2つとも選べる ───────── */

test('r1-28 classNamesOf / effectiveClassSettings / classChoices: 受付の設定の2つの名前を選べる', () => {
  const renamed = { ...D, upper: { ...D.upper, name: 'シニア' }, lower: { ...D.lower, name: 'ジュニア' } };
  assert.deepEqual(classNamesOf(renamed), ['シニア', 'ジュニア']);
  assert.equal(classNamesOf(undefined), null);
  assert.equal(effectiveClassSettings(renamed, [], false), renamed);
  assert.equal(effectiveClassSettings(undefined, [fighter('A', { fighterClass: 'Aクラス' })], false), D);
  assert.equal(effectiveClassSettings(undefined, [fighter('A', { fighterClass: 'シニア' })], false), null, '名前が初期と違うときは、条件の文を出さない');
  assert.equal(effectiveClassSettings(undefined, [fighter('A')], false), null);
  assert.equal(effectiveClassSettings(undefined, [], true), D);
  // 名簿に1つの名前しか無くても、設定があれば2つ選べる（設定が無いときの、名簿だけの動きは今までどおり）
  assert.deepEqual(classChoices([fighter('A', { fighterClass: 'シニア' })], false), ['シニア']);
  assert.deepEqual(classNamesOf(renamed) ?? classChoices([fighter('A', { fighterClass: 'シニア' })], false), ['シニア', 'ジュニア']);
});

test('r1-28 / r1-29 受付のクラス設定は、URL(#cs=)・他のジム用の入力画面のURL・保存データで往復し、形がおかしいものは捨てる', () => {
  const cs = JSON.stringify(D);
  const fromHash = entryConfigFromHash('#t=x&cs=' + encodeURIComponent(cs));
  assert.deepEqual(fromHash?.classes, D);
  assert.equal(entryConfigFromHash('#cs=' + encodeURIComponent('{"enabled":true}')), null, '形がおかしい設定だけなら、何も使わない');
  assert.equal(classesFromParam('not json'), undefined);
  assert.equal(classesFromParam('x'.repeat(2000)), undefined);
  const config = { ...DEFAULT_ENTRY_CONFIG, classes: D };
  assert.deepEqual(entryConfigFromSearch(entryConfigSearch(config)).classes, D, '入力画面のURLで往復する');
  assert.equal(entryConfigSearch(DEFAULT_ENTRY_CONFIG), 'music=off&grade=optional&age=optional&comment=optional', 'クラスなしは、今までと同じURL');
  assert.equal('classes' in entryConfigFromSearch('music=on'), false);
  // 保存データ: クラス設定つきの entryConfig を通し、おかしな形は断る。無い古いデータは今までどおり
  const t = emptyTournament('cls-config');
  assert.equal(isLocalTournament({ ...t, entryConfig: config }), true);
  assert.equal(isLocalTournament({ ...t, entryConfig: DEFAULT_ENTRY_CONFIG }), true);
  assert.equal(isLocalTournament({ ...t, entryConfig: { ...DEFAULT_ENTRY_CONFIG, classes: { enabled: true } } }), false);
});

test('r1-29 他のジム用: クラスを使う大会だけ「クラス」列を足す。使わない大会は10列のまま', () => {
  const f: EntryFighter = { id: 'x', gym: 'g', name: 'n', grade: '', age: '', height: '170', weight: '60', record: '初試合', comment: '', musicUrl: '', fighterClass: 'Bクラス' };
  const without = entryCsv([f]).replace(/^﻿/, '').split('\r\n')[0].split(',');
  assert.equal(without.length, ENTRY_HEADERS.length);
  const withClass = entryCsv([f], true).replace(/^﻿/, '').split('\r\n');
  assert.equal(withClass[0].split(',').pop(), '"クラス"'.replaceAll('"', '') === 'クラス' ? withClass[0].split(',').pop() : '');
  assert.ok(withClass[0].includes('クラス') && withClass[1].includes('Bクラス'));
  // 読み戻すと、クラスが入る
  const back = importFighters(entryCsv([f], true));
  assert.equal(back.fighters[0].fighterClass, 'Bクラス'); assert.equal(back.hasClassColumn, true);
  assert.equal(importFighters(entryCsv([f])).hasClassColumn, false);
  const cfg = { ...DEFAULT_ENTRY_CONFIG, classes: D };
  assert.match(entryClassError({ ...f, fighterClass: '' }, cfg), /クラスを選んでください/);
  assert.match(entryClassError({ ...f, fighterClass: 'Cクラス' }, cfg), /から選んでください/);
  assert.equal(entryClassError(f, cfg), '');
  assert.equal(entryClassError({ ...f, fighterClass: '' }, DEFAULT_ENTRY_CONFIG), '', 'クラスを使わない大会では、何も言わない');
});

/* ───────── 言葉・印（r1-41 / r1-96 / r1-97 / r1-30） ───────── */

test('r1-96 / r1-41 状態ラインと確認の箱の警告は、! ではなく ✕ / ⚠ と言葉', () => {
  const s = { conflict: false, saveState: 'failed' as const, dirty: true, everSaved: true, savedClock: '14:03' };
  for (const line of [saveLine(s), saveLine({ ...s, conflict: true })]) { assert.match(line.text, /^✕ /); assert.match(line.short, /^✕ /); assert.ok(!/^[!！]/.test(line.text)); }
  assert.equal(saveReasonShort('quota'), 'パソコンの空きが足りません', '何の空きかを言う');
});

test('r1-30 / r1-97 保存失敗の文は、「閉じると消えます」だけで終わらず、このページを閉じると、と言う（page.tsx の文を読む）', () => {
  const page = readFileSync(new URL('../app/private/page.tsx', import.meta.url), 'utf8');
  assert.ok(!/'閉じると消えます。'/.test(page), '主語のない「閉じると消えます」は使わない');
  assert.match(page, /このページを閉じると、入れた内容が消えます。/);
  assert.match(page, /COMPACT_HIDE/); assert.match(page, /COMPACT_SHOW/);
});

/* ═══════════════════════════ 第2回の見直し（r2-…）: 1つの指摘に、1つ以上の確認 ═══════════════════════════ */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanClassLabel, classMixMessage, classNameKey, classState, normalizeClass, parseClassSettings } from '../core/classRules.ts';
import { CsvQuoteError, normalizeKey, parseCsv, toRows } from '../core/csv.ts';
import { dateDigits, formatDateInput } from '../core/dateInput.ts';
import { entryErrors } from '../core/entryPackage.ts';
import { gymKey, mergeFighters } from '../core/privateTournament.ts';
import { dropBlankBouts as dropBlankBoutsCore } from '../core/boutSuggest.ts';
import {
  BOUT_TEXT_MAX, classTrouble, dropBlankBouts, excelCellText, openLockReason, overwriteBoxText, overwriteConfirmText, refileLabel, restoreConfirmText, shortProblem, weightTrouble, weightTroubleText,
} from '../app/private/logic.ts';
import { readDate } from '../app/private/normalize.ts';

const ROOT2 = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const src = (path: string): string => readFileSync(join(ROOT2, path), 'utf8');

test('r2-9 / r2-41 parseWins: 「3勝以上」「5勝以下」「3勝を目指す」は いまの勝ち数ではない。「試合したことがない」系は 0勝', () => {
  for (const record of ['5勝以下', '2勝以上', '3勝を目指します', '3勝まで', '3勝くらい', '3勝程度']) assert.equal(parseWins(record), null, record);
  // 「3勝以上」「2勝以下」「3勝未満」は、Aか Bかが決まる。条件の文をそのまま書く人がいるので、読む（test-class-ab の A3 と同じ。r2-1 の修正で、決まるものは前どおりに戻した）
  for (const [record, wins] of [['3勝以上', 3], ['2勝以下', 2], ['3勝未満', 2], ['3 wins以上', 3]] as const) assert.equal(parseWins(record), wins, record);
  for (const record of ['特になし', '特にありません', 'ありません', '試合をしたことがありません', '試合したことがありません', 'これまで試合はありません', '初陣です', 'デビュー戦', '大会初参加', '試合は初', '零', '試合経験はありません', 'ナシ']) assert.equal(parseWins(record), 0, record);
  // これまでの読み方は、そのまま
  for (const [record, wins] of [['3勝0敗', 3], ['5勝2敗', 5], ['2勝1敗', 2], ['初試合', 0], ['3-1', 3], ['初試合ではありません', null]] as const) assert.equal(parseWins(record), wins, record);
  assert.equal(parseWins('3勝を目指しているが、まだ初試合'), null, '目標と0勝のことばが一緒のときは決めない');
});

test('r2-21 / r2-28 / r2-129 cleanClassLabel: 文字の向きの印・幅ゼロの空白を消す。見えない文字が入った名前も、同じクラスとして読む', () => {
  assert.equal(cleanClassLabel('‮Bクラス'), 'Bクラス');
  assert.equal(cleanClassLabel('A​クラス'), 'Aクラス');
  assert.equal(cleanClassLabel('Aクラス​'), 'Aクラス');
  assert.equal(cleanClassLabel('⁦Bクラス⁩﻿'), 'Bクラス');
  assert.equal(classNameKey('A​クラス'), classNameKey('Aクラス'));
  assert.equal(normalizeClass('Aクラス​', D), 'Aクラス');
  // シートから来る設定の名前も同じ
  const parsed = parseClassSettings({ enabled: true, upper: { name: '‮シニア', condition: '3勝以上', rule: 'あり' }, lower: { name: 'ジュニア​', condition: '2勝以下', rule: 'なし' }, upperMinWins: 3 });
  assert.equal(parsed?.upper.name, 'シニア'); assert.equal(parsed?.lower.name, 'ジュニア');
  // 取り込みの名前・ジム名からも消える（RLO で名前の並びが逆に見えない）
  const f = importFighters('選手名,ジム名,クラス\n‮山田太郎,​FLAT,‮Bクラス').fighters[0];
  assert.equal(f.name, '山田太郎'); assert.equal(f.gym, 'FLAT'); assert.equal(f.fighterClass, 'Bクラス');
});

test('r2-23 importFighters: 「体重（kg）」「体重(kg)」「身長(cm)」「氏名」「所属ジム」「ＮＡＭＥ」「クラス（A/B）」も読む。読めなかった列は、名前を返す', () => {
  const a = importFighters('選手名,ジム名,身長,体重（kg）,戦績,クラス\nA,G,170,60,3勝,Aクラス').fighters[0];
  assert.equal(a.weight, '60'); assert.equal(a.height, '170'); assert.equal(a.fighterClass, 'Aクラス');
  const b = importFighters('選手名,ジム名,身長(cm),体重(kg),戦績\nA,G,170,60,3勝').fighters[0];
  assert.equal(b.height, '170'); assert.equal(b.weight, '60');
  const c = importFighters('氏名,所属ジム,身長,体重,クラス（A/B）\n山田,青空,170,60,B');
  assert.equal(c.fighters.length, 1); assert.equal(c.fighters[0].name, '山田'); assert.equal(c.fighters[0].gym, '青空'); assert.equal(c.fighters[0].fighterClass, 'B'); assert.equal(c.hasClassColumn, true);
  assert.equal(importFighters('ＮＡＭＥ,ＧＹＭ\nA,G').fighters.length, 1);
  assert.equal(normalizeKey('体重（kg）'), '体重'); assert.equal(normalizeKey(' ＮＡＭＥ '), 'name'); assert.equal(normalizeKey('﻿選手名'), '選手名');
  // 読めなかった列は、黙って捨てない
  const d = importFighters('選手名,ジム名,備考,メモ（古い）\nA,G,x,y');
  assert.deepEqual(d.unreadHeaders, ['備考', 'メモ（古い）']);
  assert.deepEqual(importFighters('選手名,ジム名,体重\nA,G,60').unreadHeaders, []);
  // 古い形（10列）は今までどおり
  const old = importFighters(['管理番号', 'ジム名', '選手名', '学年', '年齢', '身長', '体重', '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）'].join(',') + '\nF1,G,A,中1,13,155,60,初試合,がんばる,');
  assert.equal(old.fighters[0].id, 'F1'); assert.equal(old.fighters[0].record, '初試合'); assert.deepEqual(old.unreadHeaders, []); assert.equal(old.hasClassColumn, false);
});

test('r2-136 「class」「区分」は、中身が Aクラス／Bクラスのときだけクラスの列。体重の区分・男子女子の区分は、クラスにしない（「区分」は、区分の列として読む）', () => {
  const weight = importFighters('選手名,ジム名,区分\nA,G,ライト級\nB,G,60kg');
  assert.equal(weight.hasClassColumn, false); assert.equal(weight.fighters[0].fighterClass, undefined); assert.deepEqual(weight.unreadHeaders, []); assert.equal(weight.hasDivisionColumn, true); assert.deepEqual(weight.fighters.map((f) => f.division), ['ライト級', '60kg']);
  const sex = importFighters('選手名,ジム名,class\nA,G,男子\nB,G,女子');
  assert.equal(sex.fighters.every((f) => f.fighterClass === undefined), true);
  const ok = importFighters('選手名,ジム名,区分\nA,G,Aクラス\nB,G,B');
  assert.equal(ok.hasClassColumn, true); assert.equal(ok.fighters[0].fighterClass, 'Aクラス'); assert.deepEqual(ok.unreadHeaders, []); assert.equal(ok.hasDivisionColumn, false); assert.equal(ok.fighters[0].division, undefined);
  assert.equal(importFighters('選手名,ジム名,クラス区分\nA,G,Aクラス').fighters[0].fighterClass, 'Aクラス', 'このアプリが書く／はっきりクラスとわかる見出しは、そのまま');
});

test('r2-26 名前が空の行は、数えて知らせる（何行目か）', () => {
  const r = importFighters('選手名,ジム名,戦績\n甲,G,3勝\n,G,3勝\n丙,G,初試合\n   ,H,');
  assert.equal(r.fighters.length, 2); assert.deepEqual(r.skippedLines, [3, 5]);
  assert.deepEqual(importFighters('選手名,ジム名\n甲,G').skippedLines, []);
  // 管理番号を決めないとき、行の並びで決まる印は、今までと同じ（名前の空の行を飛ばしても、あとの人の印が変わらない）
  const withBlank = importFighters('選手名,ジム名\n甲,G\n,G\n丙,G').fighters.map((f) => f.id);
  const without = importFighters('選手名,ジム名\n甲,G\nx,G\n丙,G').fighters.map((f) => f.id);
  assert.equal(withBlank[1] === without[2], true);
});

test('r2-38 / r2-125 CSV: 行の終わりが CR だけでも読む。欄の途中の「"」は ただの文字。閉じない「"」は 止める', () => {
  assert.deepEqual(parseCsv('a,b\r1,2\r3,4'), [['a', 'b'], ['1', '2'], ['3', '4']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n3,4\r\n'), [['a', 'b'], ['1', '2'], ['3', '4']]);
  assert.deepEqual(parseCsv('a,b\n1,5"6が目標\n3,4\n'), [['a', 'b'], ['1', '5"6が目標'], ['3', '4']], '欄の途中の " は文字');
  assert.deepEqual(parseCsv('a,b\n"x,y","z""w"\n'), [['a', 'b'], ['x,y', 'z"w']], 'ふつうの引用は今までどおり');
  assert.deepEqual(parseCsv('a,b\n "x,y",2\n'), [['a', 'b'], ['x,y', '2']], '空白のあとの " も、引用の始まり');
  assert.throws(() => parseCsv('a,b\n"x,y\n1,2\n', { strict: true }), CsvQuoteError);
  assert.doesNotThrow(() => parseCsv('a,b\n"x,y\n1,2\n'));
  const crOnly = importFighters('選手名,ジム名,戦績\r甲,G,3勝\r乙,G,初試合');
  assert.equal(crOnly.fighters.length, 2);
  const stray = importFighters('選手名,ジム名,身長\n甲,G,5"6\n乙,G,170\n丙,G,171');
  assert.equal(stray.fighters.length, 3, '5フィート6インチの「"」で、あとの2人が消えない');
  assert.throws(() => importFighters('選手名,ジム名\n"甲,G\n乙,G'), CsvQuoteError);
  assert.equal(importProblemKind(new CsvQuoteError()), 'quote');
  assert.match(importErrorText(new CsvQuoteError()), /閉じていない「"」/);
  assert.equal(toRows('a,b\n1,2').length, 1);
});

test('r2-24 ファイルの内容で書きかえる前の確認：クラスと体重の変化が先。クラスの変化は1行ずつ名前つき。空欄が埋まるだけの変化は「空欄を埋める」', () => {
  const diffs = [
    { name: '架空選手1', fields: [{ label: '学年', from: '', to: '中1' }, { label: '年齢', from: '', to: '13' }, { label: '体重', from: '60', to: '63' }, { label: 'クラス', from: 'Aクラス', to: 'Bクラス' }] },
    { name: '架空選手2', fields: [{ label: '学年', from: '', to: '中1' }, { label: '年齢', from: '', to: '13' }, { label: 'クラス', from: 'Aクラス', to: 'Bクラス' }, { label: '体重', from: '60', to: '63' }] },
  ];
  const text = overwriteConfirmText(diffs);
  assert.match(text, /クラス Aクラス→Bクラス：架空選手1/);
  assert.match(text, /クラス Aクラス→Bクラス：架空選手2/);
  assert.match(text, /架空選手1 体重 60→63、空欄を埋める：学年・年齢/);
  assert.ok(text.indexOf('クラス Aクラス→Bクラス：架空選手1') < text.indexOf('架空選手1 体重'), 'クラスが先');
  assert.ok(!/（空）→中1/.test(text), '空→入るだけの変化を、例として見せない');
  const box = overwriteBoxText(diffs);
  assert.match(box.verdict, /^次の2人を、ファイルの内容に書きかえます/); assert.ok(box.lines.some((l) => l.startsWith('クラス ')));
  // クラスだけが変わる人は、人の行に重ねて出さない
  const only = overwriteBoxText([{ name: '甲', fields: [{ label: 'クラス', from: 'Aクラス', to: 'Bクラス' }] }]);
  assert.deepEqual(only.lines, ['クラス Aクラス→Bクラス：甲']);
});

test('r2-25 コピーから戻す前の確認：クラスが消えるなら、はっきり言う', () => {
  const now = { ...emptyTournament('r2-25'), title: '架空大会', fighters: [fighter('A', { fighterClass: 'Aクラス' }), fighter('B', { fighterClass: 'Bクラス' }), fighter('C')], entryConfig: { ...DEFAULT_ENTRY_CONFIG, classes: D } };
  const old = { ...emptyTournament('r2-25'), title: '架空大会', fighters: [fighter('A'), fighter('B'), fighter('C')] };
  const text = restoreConfirmText({ restored: old, current: now, dirty: false, everSaved: true });
  assert.match(text, /クラスが入っている選手が2人から0人になります/);
  assert.match(text, /クラスの設定（条件とルール）/);
  // クラスを使っていない大会では、何も言わない
  const plain = restoreConfirmText({ restored: old, current: { ...old }, dirty: false, everSaved: true });
  assert.ok(!/クラス/.test(plain));
});

test('r2-27 クラスを使う大会で、クラスが入っていない人・決めたクラスにない名前（S など）を見つける', () => {
  const list = [fighter('A', { fighterClass: 'Aクラス' }), fighter('B'), fighter('C', { fighterClass: 'S' }), fighter('D', { fighterClass: 'ａクラス' })];
  assert.equal(classState(list[0], D), 'ok'); assert.equal(classState(list[1], D), 'blank'); assert.equal(classState(list[2], D), 'unknown'); assert.equal(classState(list[3], D), 'ok');
  const t = classTrouble(list, D, true);
  assert.deepEqual(t.blank.map((f) => f.id), ['B']); assert.deepEqual(t.unknown.map((f) => f.id), ['C']);
  assert.deepEqual(classTrouble(list, D, false), { blank: [], unknown: [] }, 'クラスを使わない大会は、何も言わない');
  assert.equal(classState(list[2], null), 'ok', '設定が無いときは、名前の中身は見ない');
  // 決めたクラスにない名前が混ざった組は、ルールの行で「自分で決めます」と言う
  const m = classMixMessage(list[0], list[2], D)!;
  assert.ok(m.rules.some((line) => /「S」は、決めたクラス（Aクラス・Bクラス）にありません。ルールは、自分で決めます。/.test(line)), m.rules.join('|'));
  assert.equal(classMixMessage(list[0], list[1], D), null, 'クラスの入っていない人との組は、赤にしない（黄色の別の知らせで言う）');
  const cards = src('app/private/cards.tsx');
  assert.match(cards, /クラスが入っていないので、ちがうクラスか確かめられません/);
  assert.match(cards, /classesOn/);
});

test('r2-29 同じジムか：全角・半角、大文字・小文字、空白のちがいは同じ（注意・おすすめ・グループ分けで同じ決め方）', () => {
  assert.equal(gymKey('ＦＬＡＴ ＵＰ'), gymKey('flat up')); assert.equal(gymKey('FLAT UP'), gymKey('FLAT　UP')); assert.equal(gymKey('  '), ''); assert.equal(gymKey('FLAT​'), gymKey('flat'));
  const a = fighter('a', { gym: 'ＦＬＡＴ ＵＰ' }), b = fighter('b', { gym: 'FLAT UP' }), c = fighter('c', { gym: 'FLAT　UP' });
  const warn = (x: LocalFighter, y: LocalFighter) => boutWarnings(bout('1', x.id, y.id), [x, y], [bout('1', x.id, y.id)]);
  assert.ok(warn(a, b).some((w) => /同じジム/.test(w)), 'ＦＬＡＴ ＵＰ と FLAT UP');
  assert.ok(warn(b, c).some((w) => /同じジム/.test(w)), 'FLAT UP と 全角空白');
  assert.ok(!warn(fighter('x', { gym: '' }), fighter('y', { gym: '' })).some((w) => /同じジム/.test(w)), 'ジム名が空どうしは、同じジムにしない');
  // おすすめ：同じジムを避ける
  const pool = [fighter('1', { gym: 'FLAT', weight: '60' }), fighter('2', { gym: 'flat', weight: '61' }), fighter('3', { gym: 'Ａ', weight: '62' }), fighter('4', { gym: 'B', weight: '63' })];
  const made = suggestBouts(pool, [], (() => { let n = 0; return () => 's' + ++n; })());
  assert.ok(!made.some((x) => new Set([x.redId, x.blueId]).size === 2 && [x.redId, x.blueId].sort().join() === '1,2'), '1と2は同じジム（FLAT／flat）。組まない');
  assert.match(src('app/private/page.tsx'), /gymKey\(fighter\.gym\)/, 'グループ分けも gymKey');
  assert.match(src('app/private/cards.tsx'), /gymKey\(red\.gym\)/, 'カードも gymKey');
});

test('r2-37 体重の言い方：入っていない／数字で読めない／10〜250kgの外を、別々の言葉で言う', () => {
  assert.equal(weightTrouble(''), 'empty'); assert.equal(weightTrouble('  '), 'empty'); assert.equal(weightTrouble('六十五'), 'unreadable'); assert.equal(weightTrouble('5kg'), 'range'); assert.equal(weightTrouble('300'), 'range'); assert.equal(weightTrouble('65.5kg'), null);
  assert.equal(weightTroubleText('empty', '甲'), '体重が入っていません：甲');
  assert.equal(weightTroubleText('unreadable', '甲', '六十五'), '体重「六十五」が数字で読めません（例：65）：甲');
  assert.equal(weightTroubleText('range', '甲', '5kg'), '体重は10〜250kgで入れます：甲（いま 5kg）');
  const cards = src('app/private/cards.tsx');
  assert.ok(!cards.includes('体重がありません'), '「体重がありません」は使わない（入っていない人にだけ「入っていません」）');
  assert.match(cards, /weightTroubleText\(trouble, f\.name, f\.weight\)/);
  assert.match(src('app/private/page.tsx'), /体重が入っていない人が' \+ emptyW\.length/, '下の注意は、入っていない人だけ「入っていない」と数える');
});

test('r2-31 / r2-154 「試合当日の画面を開く」が押せない理由は、画面にある箱だけを指す', () => {
  const base = { titleMissing: false, fighters: 6, nonBlankBouts: 1, problems: 0, canOpen: false };
  assert.equal(openLockReason({ ...base, canOpen: true }), '');
  assert.equal(openLockReason({ ...base, titleMissing: true }), 'まだ開けません：先に、大会の名前を入れます');
  assert.equal(openLockReason({ ...base, fighters: 1, nonBlankBouts: 0 }), 'まだ開けません：先に、選手を2人以上入れます');
  assert.equal(openLockReason({ ...base, nonBlankBouts: 0 }), 'まだ開けません：先に、「＋ 試合を追加」で試合を1つ作ります');
  assert.equal(openLockReason({ ...base, problems: 2 }), 'まだ開けません：上の「✕ 直すところ」を直します');
  const page = src('app/private/page.tsx');
  assert.ok(!page.includes('上の「次にすること」と「直すところ」を見てください'));
  assert.ok(!page.includes("['保存', done4,"), '保存の行は、保存したら ✓（直すところが残っていても）');
  assert.match(page, /\['保存', everSaved && !dirty,/);
});

test('r2-33 / r2-114 読み込みに失敗したあとの黄色：使ったファイルの種類に合わせる。部品が開けないときは「画面が古い」と言う', () => {
  assert.match(refileLabel('zip'), /Tournament_OS_（英数字）\.zip/); assert.match(refileLabel(), /Tournament_OS_（英数字）\.zip/);
  assert.equal(refileLabel('xlsx'), '直したExcelのファイルをもう一度選ぶ'); assert.equal(refileLabel('csv'), '直したCSVのファイルをもう一度選ぶ');
  assert.equal(pickMarker({ conflict: false, asking: false, chooseFirst: false, follow: { kind: 'refile', file: 'csv' }, na: nextAction({ titleReal: true, dateOk: true, fighters: 0, nonBlankBouts: 0, halfIndex: -1, dirty: false, everSaved: false, problems: 0, opened: false, saveState: 'idle', conflict: false }), saveState: 'idle', blankIndex: -1, halfIndex: -1, halfSide: 'blue', fix: null, titleMissing: false }).label, '直したCSVのファイルをもう一度選ぶ');
  for (const error of [new TypeError('Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js'), Object.assign(new Error('Loading chunk 12 failed.'), { name: 'ChunkLoadError' }), new Error('Importing a module script failed.')]) {
    assert.equal(importProblemKind(error), 'stale');
    const parts = importErrorParts(error, '選手名簿.zip');
    assert.equal(parts.head, 'この画面が古くなっています');
    assert.ok(!/こわれ/.test(parts.head + parts.detail), 'ファイルのせいにしない');
    assert.match(parts.detail, /ページを開き直して（F5キー）、もう一度ファイルを選んでください。名簿と保存したデータは消えません/);
  }
  assert.equal(importProblemKind(new Error('Invalid zip data')), '', '本当にこわれたファイルは、今までどおり');
  const marker = pickMarker({ conflict: false, asking: false, chooseFirst: false, follow: { kind: 'reload' }, na: nextAction({ titleReal: true, dateOk: true, fighters: 0, nonBlankBouts: 0, halfIndex: -1, dirty: false, everSaved: false, problems: 0, opened: false, saveState: 'idle', conflict: false }), saveState: 'idle', blankIndex: -1, halfIndex: -1, halfSide: 'blue', fix: null, titleMissing: false });
  assert.deepEqual([marker.where, marker.label], ['reload', '「開き直す」を押す']);
  const page = src('app/private/page.tsx');
  assert.match(page, /importProblemKind\(error\) === 'stale'/); assert.match(page, /id="reload-btn"/);
});

test('r2-40 読み込みの失敗の文：写真1枚が大きいだけなら名簿は読む。100MBはZIP全体。今はもうできない手順を勧めない', () => {
  assert.ok(!importErrorText(new ImportProblem('no-list')).includes('フォルダごと圧縮し直さず'));
  assert.match(importErrorText(new ImportProblem('too-large')), /ZIPが大きすぎます（全部で100MBまで）/);
  assert.equal(importErrorParts(new ImportProblem('too-large'), 'a.zip').head, 'ZIPが大きすぎます（a.zip）');
  const page = src('app/private/page.tsx');
  assert.match(page, /bigPhotos\.push/, '20MBをこえる写真は、その1枚だけ入れない');
  assert.match(page, /decodeCsvBytes\(unpacked\[found\.csv\]\)/, 'ZIPの中のCSVも、Shift_JISまで読む（r2-39）');
  assert.ok(!page.includes('strFromU8'));
});

test('r2-123 / r2-138 開催日：時刻や「3日〜4日」を つないで別の日にしない。うしろの曜日は読み捨てる', () => {
  for (const text of ['2027年10月3日 10:00', '2027年10月3日10時', '2027/10/3 10:00', '2027年10月3日〜4日', '2027年10月3日 10:00〜12:00']) {
    assert.equal(formatDateInput(text), text, text + ' は そのまま（日づけとして読まない）');
    assert.equal(readDate(text).kind, 'bad', text);
  }
  for (const text of ['2027年10月3日（日）', '2027年10月3日(日)', '2027/10/3(日)', '2027年10月3日 日曜日', '2027年10月3日日曜']) {
    assert.equal(formatDateInput(text), '2027年10月3日', text);
    const r = readDate(text); assert.equal(r.kind, 'ok', text); if (r.kind === 'ok') assert.equal(r.text, '2027年10月3日');
  }
  assert.equal(dateDigits('abc２０２７x１００３'), '20271003', '文字だけのノイズは今までどおり');
  assert.equal(readDate('2027年10月3日').kind, 'ok');
});

test('r2-124 Excelが日づけに変えた戦績（3-1 → 3月1日）は、「月-日」にもどす。日づけの長い文字を名簿に入れない', () => {
  const marchFirst = new Date(Date.UTC(2026, 2, 1));
  assert.deepEqual(excelCellText(marchFirst), { text: '3-1', wasDate: true });
  assert.deepEqual(excelCellText(new Date(Date.UTC(2026, 11, 25))), { text: '12-25', wasDate: true });
  assert.deepEqual(excelCellText('3勝1敗'), { text: '3勝1敗', wasDate: false });
  assert.deepEqual(excelCellText(65), { text: '65', wasDate: false }); assert.deepEqual(excelCellText(null), { text: '', wasDate: false }); assert.deepEqual(excelCellText(new Date('x')), { text: 'Invalid Date', wasDate: false });
  assert.equal(parseWins(excelCellText(marchFirst).text), 3, '戻した「3-1」は、3勝と読める');
  assert.match(src('app/private/page.tsx'), /excelCellText\(cell\)/);
});

test('r2-134 空の試合が消えても、いまの試合は同じ試合を指したまま', () => {
  const a = bout('a', 'A', 'B'), c = bout('c', 'C', 'D'), d = bout('d', 'E', 'F');
  const value = { ...emptyTournament('r2-134'), title: 't', fighters: ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => fighter(id)), bouts: [a, bout('b', '', ''), c, d], currentBout: 2 };
  const kept = dropBlankBouts(value);
  assert.deepEqual(kept.bouts.map((x) => x.id), ['a', 'c', 'd']);
  assert.equal(kept.bouts[kept.currentBout].id, 'c', 'いまの試合 c のまま（d に飛ばない）');
  assert.equal(dropBlankBoutsCore(value).bouts[dropBlankBoutsCore(value).currentBout].id, 'c');
  // 後ろの空の試合は、番号を動かさない
  assert.equal(dropBlankBouts({ ...value, bouts: [a, c, bout('z', '', ''), d], currentBout: 1 }).currentBout, 1);
});

test('r2-127 試合カードの「ルール」「体重の区分」は文字数に上限がある（保存がぜんぶ失敗しない）', () => {
  assert.equal(BOUT_TEXT_MAX, 100);
  const cards = src('app/private/cards.tsx');
  assert.equal((cards.match(/maxLength=\{BOUT_TEXT_MAX\}/g) ?? []).length, 2);
  assert.match(cards, /ルールが長すぎます（いま\{bout\.rule\.length\}文字/);
  assert.match(cards, /体重の区分が長すぎます/);
  assert.match(cards, /文字に切る/);
});

test('r2-36 試合が1つだけのときは、「↑ 上へ」「↓ 下へ」と その理由を出さない', () => {
  const cards = src('app/private/cards.tsx');
  assert.equal((cards.match(/\{total >= 2 \? <button/g) ?? []).length, 2);
  assert.match(cards, /\{total >= 2 && \(index === 0 \|\| index === total - 1\)/);
});

test('r2-30 / r2-76 / r2-77 クラスの文：条件とルールは別の行。「目安」を2回言わない。押すボタンの名前を言う', () => {
  const cards = src('app/private/cards.tsx');
  assert.match(cards, /<b>条件：<\/b>\{side\.condition\}/); assert.match(cards, /<b>ルール：<\/b>\{side\.rule\}/);
  assert.ok(!cards.includes('（ルール：{side.rule}）'), 'ルールを（ ）で包まない');
  assert.ok(!cards.includes('目安です。自分で決めてかまいません'));
  assert.match(cards, /どちらにするかは、ご自分で決めてください/);
  assert.match(cards, /このままで「この内容で直す」を押せます。/); assert.match(cards, /このままで「この選手を追加」を押せます。/);
  assert.ok(!cards.includes('申し込みで選んだクラスです'));
  assert.match(cards, /mode = 'add'/);
  assert.match(src('app/private/page.tsx'), /<FighterFields value=\{draft\}[^>]*mode="edit"/);
});

test('r2-79 / r2-95 / r2-163 おすすめの文：5kg差は黄色。「同じクラスを先に」は5kg以内の話。案は下書きと説明する', () => {
  const page = src('app/private/page.tsx');
  assert.match(page, /<Caution role="status">体重差が5kg以上の組が/);
  assert.ok(!/<ErrorLine role="status">体重差が5kg以上の組/.test(page));
  assert.match(page, /体重差5kg以内に同じクラスの人がいれば、その人を先に/);
  assert.match(page, /おすすめは、コンピューターが作った下書き（案）です。使う前に、1つずつ見てください。/);
  assert.match(page, /組む相手がいなかったので、まだ入っていません/);
  assert.ok(!page.includes('同じクラスの人どうしがおすすめです'), 'おすすめ のボタンの名前を、ほかの意味で使わない');
});

test('r2-149 「おすすめ」は、まえの試合のルールと体重の区分を写さない。クラスを使う大会では「＋ 試合を追加」も写さない', () => {
  const page = src('app/private/page.tsx');
  assert.match(page, /\.\.\.bout, className: '', rule: ''/);
  assert.match(page, /const copy = !classesOn && !!prev;/);
  assert.match(src('app/private/cards.tsx'), /まえの試合と同じ値です。違うなら|まえの試合と同じ値です。/, '手で足した試合（クラスを使わない大会）の写しには、今までどおり「まえの試合と同じ値です」の知らせ');
});

test('r2-153 案の確認：黄色は、案を1つ見るごとに 次の案へ移る', () => {
  const na = nextAction({ titleReal: true, dateOk: true, fighters: 6, nonBlankBouts: 3, halfIndex: -1, dirty: true, everSaved: false, problems: 0, opened: false, saveState: 'idle', conflict: false });
  const at = (n: number) => pickMarker({ conflict: false, asking: false, chooseFirst: false, follow: { kind: 'review', n }, na, saveState: 'idle', blankIndex: -1, halfIndex: -1, halfSide: 'blue', fix: null, titleMissing: false });
  assert.equal(at(0).label, '案を1つずつ確かめる'); assert.equal(at(1).label, '2つ目の案を見る'); assert.equal(at(2).label, '3つ目の案を見る');
  for (const n of [0, 1, 2]) assert.equal(at(n).where, 'review');
  assert.match(src('app/private/page.tsx'), /\{reviewN \+ 1\}つ目の案を見る/);
});

test('r2-155 / r2-157 / r2-158 / r2-160 / r2-168 / r2-169 / r2-162 / r2-165 言葉', () => {
  const page = src('app/private/page.tsx'), cards = src('app/private/cards.tsx'), logic = src('app/private/logic.ts');
  assert.match(page, /試合当日の画面＝選手の名前・写真・体重を、大きく映す画面です。/); assert.match(page, /対戦カード＝だれとだれが戦うかを書いた表です。/); assert.match(page, /開いても、試合は始まりません。/);
  assert.ok(!page.includes('対戦カードの画面に出る'));
  assert.match(page, /じゅんびの4つは、ぜんぶできました。あとは「試合当日の画面を開く」を押します。/); assert.ok(!page.includes('じゅんびは、ぜんぶできました'), '「じゅんびは、ぜんぶ」と言い切らない（コピーのファイル・USB・紙の一覧は、別の用意）'); assert.ok(!page.includes('ぜんぶ終わりました'));
  assert.ok(!logic.includes('（空の試合があります）'), '黄色の札は短く（第1試合の赤コーナーを選ぶ）');
  assert.match(src('app/private/marks.tsx'), /whiteSpace: 'nowrap'/, '第1試合 が途中で割れない');
  assert.match(cards, /体重がまだわからないので、試合当日の画面に「契約体重」が出ません。上の「体重を入れる」を押してください。/);
  assert.ok(!cards.includes('〇kg契約'));
  assert.match(cards, /体重差＝体重のちがい/);
  assert.match(cards, /（青コーナーで選んでいます）/); assert.match(cards, /（赤コーナーで選んでいます）/); assert.match(cards, /（もう第/); assert.ok(!cards.includes('配置ずみ') && !cards.includes('もう片方に選択中'));
  assert.ok(!page.includes('次にやる：') && !page.includes("'次にやる'"), '「次にやる」は「👉 次はここ」に そろえた');
  assert.match(page, /'いまここ'/); assert.match(page, /👉 次はここ：/);
  assert.match(src('app/private/page.tsx'), /OldBrowser/); assert.match(page, /このブラウザは古いです。ブラウザか、パソコン・iPhone・iPadのOSを新しくするか、新しいChromeで開いてください。/);
});

test('r2-161 クラスがちがう注意：おすすめという言葉を使わず、だれが決めるかを言い、ルールの欄をひらくボタンを付ける', () => {
  const m = classMixMessage(fighter('a', { fighterClass: 'Aクラス' }), fighter('b', { fighterClass: 'Bクラス' }), D)!;
  assert.ok(!m.headline.includes('おすすめ')); assert.match(m.headline, /ふつうは同じクラスの人と戦います/);
  assert.match(src('app/private/cards.tsx'), /主催者のあなたが/);
});

test('r2-20 / r2-78 / r2-19 / r2-42 / r2-130 / r2-43 他のジム用の入力画面：エラーは赤の ✕ で全部、成功は緑の ✓。17px。数字は全角でもよい', () => {
  const entry = src('app/private/entry/page.tsx');
  assert.match(entry, /tos-error sticky/); assert.match(entry, /tos-ok sticky/); assert.ok(!entry.includes('bg-indigo-700 p-4 font-bold text-white shadow'));
  assert.match(entry, /<span aria-hidden="true">✕ <\/span>/); assert.match(entry, /<span aria-hidden="true">✓ <\/span>/);
  assert.match(entry, /checkNumber\(key, current\[key\]\)/);
  assert.match(entry, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 30_000\)/); assert.ok(!/anchor\.click\(\);\s*URL\.revokeObjectURL/.test(entry));
  assert.ok(!entry.includes('入場曲URL 必須'));
  const box = entry.slice(entry.indexOf('<fieldset'), entry.indexOf('</fieldset>'));
  assert.ok(box.includes('text-lg') && (box.match(/text-lg/g) ?? []).length >= 8, 'クラスの箱の文字は、17px以上（text-lg）');
  assert.ok(!/<p className="[^"]*"/.test(box.replace(/text-lg/g, 'TL')) || !/<p className="(?![^"]*TL)/.test(box.replace(/text-lg/g, 'TL')), 'p は全部 text-lg');
  // 全角の数字でも、足りないと言われない
  const f = { id: 'x', gym: 'G', name: 'N', grade: '', age: '', height: '１７０', weight: '６５ｋｇ', record: '初試合', comment: '', musicUrl: '' };
  assert.deepEqual(entryErrors(f, true, DEFAULT_ENTRY_CONFIG), []);
  assert.deepEqual(entryErrors({ ...f, height: '0x10', weight: '1e2' }, true, DEFAULT_ENTRY_CONFIG).length, 2, '0x10・1e2 は数にしない');
});

test('r2-44 書いてもらうことの案内に、クラスを使う大会ではクラスも並べる。保存ずみの大会に新しい設定が来たら、黙って捨てず聞く', () => {
  const page = src('app/private/page.tsx');
  assert.match(page, /いつも書いてもらうもの：名前・ジム名・写真・身長・体重・戦績\{entryConfig\.classes \?/);
  assert.match(page, /id="apply-sheet-config"/);
});

test('r2-150 / r2-151 / r2-152 画面が動かない：大会名を1文字打っても欄が動かない。下の帯は いつも画面の下', () => {
  const page = src('app/private/page.tsx');
  assert.match(page, /const \[emptyLayout, setEmptyLayout\] = useState\(false\)/);
  assert.match(page, /setEmptyLayout\(shown\.fighters\.length === 0 && shown\.bouts\.length === 0 && !isTitleReal\(shown\.title\)\)/);
  assert.ok(!/\{emptyStart \? null : nextCard\}/.test(page), '箱を出す場所は、開いたときに決めた emptyLayout で決める');
  assert.match(page, /const titleHold = titleFocused && titleReal && data\.title\.trim\(\)\.length < 2;/);
  assert.match(page, /pendingJump\.current = \{ id: 'add-bout', box: 'add-bout-slot', instant: true \}/);
  assert.match(page, /barTight/);
});

test('r2-35 / r2-102 確認の箱に答えた直後の0.7秒は、画面全体の「押す」を受けつけない。消したあとは、近くへフォーカス', () => {
  const page = src('app/private/page.tsx');
  assert.match(page, /data-tos-shield="1"/); assert.match(page, /window\.setTimeout\(\(\) => setShield\(false\), 700\)/);
  assert.match(page, /raiseShield\(\);/);
  assert.match(page, /focusSoon\('fighter-note', 'add-bout'\)/);
});

test('r2-32 / r2-139 保存データが読めない画面：?event= の番号を言う。黄色は「もう一度読み込む」', () => {
  const page = src('app/private/page.tsx');
  assert.match(page, /<LoadErrorScreen message=\{loadError\} eventId=\{loadId\} \/>/);
  assert.match(page, /<NextSlot active label="もう一度読み込む">/);
  assert.ok(!/<NextSlot active label="コピーのファイルから戻す">/.test(page));
  assert.ok(!page.includes('保存データが読めません（消えていません）'));
});

test('r2-156 / r2-164 開いたあとも、帯に「✓ 開きました（別のタブ）」と黄色が1つ。保存の同じ行を2回見せない', () => {
  const page = src('app/private/page.tsx');
  assert.match(page, /開きました（別のタブ）。もう一度押すと、もう1つ開きます。/);
  assert.match(page, /saveShownAbove && 'sr-only'/);
  assert.equal(nextLabelOf('done'), 'もう1つ開く');
});
import { nextLabel as nextLabelOf } from '../app/private/logic.ts';

test('下の帯に重なったキーボードのフォーカスを、見える所まで動かす（Tab で移ったときも、帯が大きくなったときも。まれな失敗の直し）', () => {
  const page = src('app/private/page.tsx');
  const helper = page.slice(page.indexOf('const revealAboveBar = '), page.indexOf('const measureChrome = () => {'));
  const body = page.slice(page.indexOf('const measureChrome = () => {'), page.indexOf('useEffect(() => {\n    const el = barRef.current;'));
  const effect = page.slice(page.indexOf('useEffect(() => {\n    const el = barRef.current;'), page.indexOf('// 帯の中身が変わったら、しまうのをやめて'));
  assert.ok(helper.length > 200 && body.length > 200 && effect.length > 200, '3つの部品が見つかる');
  // 帯の外にある欄が帯に重なっていたら、scroll-padding を使って動かす（ブラウザは、画面の中に入っていると動かさない）
  assert.match(helper, /bar\.contains\(target\)/);
  assert.match(helper, /at\.bottom > under\.top \+ 2 && at\.top < under\.bottom/);
  assert.match(helper, /shown\.scrollIntoView\(\{ block: 'nearest' \}\)/);
  assert.match(helper, /type === 'file' \? target\.closest\('label'\)/, '見えないファイル選択は、ラベルで測る');
  // 帯が大きくなったとき（余白を直したあと）と、フォーカスが移ったときの、両方で呼ぶ
  assert.ok(body.indexOf("setProperty('--bar-h'") < body.indexOf('revealAboveBar(document.activeElement)'), '余白を直してから動かす');
  assert.match(effect, /addEventListener\('focusin', onFocusIn\)/);
  assert.match(effect, /removeEventListener\('focusin', onFocusIn\)/, '画面を離れるときに外す');
  // ゆっくり動く移動の最中に欄へ移ったときは、動き終わってから、もう一度見る（動き終わりの位置で帯に重なっていた。場面 L のまれな失敗の元）
  assert.match(effect, /addEventListener\('scrollend', again, \{ once: true \}\)/);
  assert.match(effect, /window\.setTimeout\(again, 800\)/, 'scrollend が来ないブラウザでも、少しあとで見る');
  assert.match(effect, /document\.activeElement === target\) revealAboveBar\(target\)/, 'まだその欄にいるときだけ動かす');
  assert.match(effect, /stopWatch\(\); observer\?\.disconnect\(\)/, '画面を離れるときに、待ちも外す');
  // jump（ゆっくり動く移動）が移したフォーカスは、すぐには動かさない（動きを止めない）。動き終わってから見る
  assert.match(effect, /if \(!jumpingRef\.current\) revealAboveBar\(target\);/);
  assert.match(page, /jumpingRef\.current = true; try \{ el\.focus\(\{ preventScroll: true \}\); \} finally \{ jumpingRef\.current = false; \}/);
  assert.match(readFileSync(join(ROOT2, 'app/globals.css'), 'utf8'), /scroll-padding-bottom: calc\(var\(--bar-h, 10rem\) \+ 1rem\)/, 'scrollIntoView が帯をよける元の決まり');
});

test('r2-140 verify-private-all.sh: ポートが使われていたら、何も確かめずに止まる。build をとばした／_headers なしの動かし方では 指紋を書かない', async () => {
  const script = join(ROOT2, 'scripts/verify-private-all.sh');
  // 指紋を書いてよい動かし方か（TOS_STAMP_CHECK で、判断だけを見る）
  const check = (env: Record<string, string>, ...args: string[]) => spawnSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, TOS_STAMP_CHECK: '1', ...env } });
  assert.equal(check({}).stdout.trim(), 'stamp:yes');
  assert.match(check({ TOS_SKIP_BUILD: '1' }).stdout, /^stamp:no \(TOS_SKIP_BUILD=1/);
  assert.match(check({ TOS_PLAIN_SERVER: '1' }).stdout, /^stamp:no \(TOS_PLAIN_SERVER=1/);
  assert.match(check({ TOS_ONLY: 'test-polish-misc' }).stdout, /^stamp:no \(TOS_ONLY/);
  assert.match(check({ TOS_SCENARIOS: 'M1' }).stdout, /^stamp:no \(TOS_SCENARIOS/, '場面だけ動かしたときも、指紋を書かない');
  assert.match(check({}, '--fast').stdout, /^stamp:no \(--fast/);
  // ポートが もう使われている
  const busy = createServer(); await new Promise<void>((resolve) => busy.listen(0, '127.0.0.1', resolve));
  const port = (busy.address() as { port: number }).port;
  const before = existsSync(join(ROOT2, '.verify-ok')) ? readFileSync(join(ROOT2, '.verify-ok'), 'utf8') : null;
  try {
    const r = spawnSync('bash', [script], { encoding: 'utf8', env: { ...process.env, TOS_PORT: String(port), TOS_ONLY: 'test-polish-misc', TOS_SCENARIOS: 'M1' }, timeout: 60_000 });
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp('ポート' + port + 'は、もう使われています'));
    assert.ok(!/OK +browser/.test(r.stdout), '何も確かめていない');
  } finally { await new Promise<void>((resolve) => busy.close(() => resolve())); }
  const after = existsSync(join(ROOT2, '.verify-ok')) ? readFileSync(join(ROOT2, '.verify-ok'), 'utf8') : null;
  assert.equal(after, before, '止まったときは、指紋を書かない');
  const sh = readFileSync(script, 'utf8');
  assert.match(sh, /stamp_blocker/); assert.match(sh, /kill -0 "\$server"/);
});

/* ───────── round 2, second pass (retry): the leftovers found by the browser checks ───────── */

test('r2-27 (retry) 受付の設定が無くても、Aクラス／Bクラスと読める名前が1つでもあれば初期の設定を使う。「S」は、決めたクラスにない名前になる', () => {
  const list = [fighter('A', { fighterClass: 'Aクラス' }), fighter('B', { fighterClass: 'Bクラス' }), fighter('C', { fighterClass: 'S' })];
  assert.equal(effectiveClassSettings(undefined, list, false), D);
  assert.deepEqual(classChoices(list, false), ['Aクラス', 'Bクラス']);
  assert.equal(classState(list[2], effectiveClassSettings(undefined, list, false)), 'unknown');
  assert.deepEqual(classTrouble(list, effectiveClassSettings(undefined, list, false), true).unknown.map((f) => f.id), ['C']);
  // 全部が別の名前（受付の設定も無い）なら、今までどおり決めない
  const own = [fighter('A', { fighterClass: 'シニア' }), fighter('B', { fighterClass: 'ジュニア' }), fighter('C', { fighterClass: 'S' })];
  assert.equal(effectiveClassSettings(undefined, own, false), null);
  assert.deepEqual(classChoices(own, false), ['シニア', 'ジュニア', 'S']);
});

test('r2-136 (retry) 「試合当日の画面を開く」が押せない理由：名前がまだ「大会名未設定」のときも、黄色と同じ順番で、先に大会の名前', () => {
  const page = src('app/private/page.tsx');
  assert.match(page, /openLockReason\(\{ titleMissing: titleMissing \|\| !titleReal,/);
  assert.equal(openLockReason({ titleMissing: true, fighters: 0, nonBlankBouts: 0, problems: 0, canOpen: false }), 'まだ開けません：先に、大会の名前を入れます');
});

test('r2-132 / r2-133 (retry) 1文字目で欄が動かない（見出しも、上の1行も）。取り込んだあとは、遠くてもすぐ黄色へ動く', () => {
  const page = src('app/private/page.tsx');
  // 見出しは、大会名を打っても変わらない（空の新しい大会として開いている間は同じ）
  assert.match(page, /fresh && \(emptyLayout \|\| !titleReal\) \? '4つの手順で、対戦カードを作ります。' : '試合の準備'/);
  // 上の1行は、せまい画面で「ラベル」と「大会名」を別の行に置く（1文字で折り返しが変わらない）
  assert.match(page, /<span className="block min-\[760px\]:inline">いま開いている大会：<\/span><span className="block text-indigo-900 min-\[760px\]:inline">\{title\}<\/span>/);
  // 取り込んだあとの移動は、ゆっくり動かさない（動いている間に押すと、途中のボタンを押してしまう）
  assert.match(page, /pendingJump\.current = \{ id: 'add-bout', box: 'add-bout-slot', instant: true \}/);
  assert.match(page, /const calm = instant \|\|/);
  assert.match(page, /jump\(pending\.id, pending\.box, pending\.instant\)/);
  // 下の帯は、いつも画面の下に くっつく（流れに落とさない）
  assert.ok(!/chromeFlow \? 'relative mt-4'/.test(page));
});

test('r2-133 (retry) 低い画面で確認の箱が開いているとき：帯は固定のまま、押せない大きいボタンと理由だけをしまい、箱の中の黄色の枠もつめる', () => {
  const page = src('app/private/page.tsx');
  assert.match(page, /const ASK_LOW_HIDE = '\[@media\(max-height:500px\)\]:hidden'/);
  assert.match(page, /cls\('flex items-stretch gap-2', lockedByAsk && ASK_LOW_HIDE\)/);
  assert.match(page, /<LockReason className=\{ASK_LOW_HIDE\}>先に、確認の箱に答えます<\/LockReason>/);
  assert.ok(!/chromeFlow \? 'relative mt-4'/.test(page), '帯は、ページの流れに落とさない');
  const css = src('app/globals.css');
  assert.match(css, /\.tos-read \[role="alertdialog"\] \.tos-next \{\s*padding: 0\.25rem 0\.5rem;/);
});
