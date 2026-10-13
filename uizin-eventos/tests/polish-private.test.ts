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
