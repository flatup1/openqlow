import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTournament, isLocalTournament, validateTournament, type LocalBout, type LocalFighter, type LocalTournament } from '../core/privateTournament.ts';
import {
  backupIsFresh, boutProblems, dropBlankBouts, eventListName, gapLevel, importErrorParts, importErrorText, ImportProblem, isBlankBout, isHalfBout, isTitleReal, monthDayClockPad, nextAction, nextActionKey, oldCopyText,
  overwriteBoxText, overwriteConfirmText, pickMarker, restoreBoxText, restoreConfirmText, sameExceptProgress, sameFighterExists, saveReasonShort, saveReasonText, shortProblem, tooLong, unplacedFighters, useOtherBoxText,
  weightGap, weightMissing, type MarkerInput, type NextActionState, type NextState,
} from '../app/private/logic.ts';
import { checkFighter, checkMusic, checkNumber, describeChange, foldKana, normalizePassword, readDate, readNumber, shorten } from '../app/private/normalize.ts';
import { DEFAULT_ENTRY_CONFIG } from '../core/entryPackage.ts';

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
  // 開催日は「なくてもOK」: 空でも、順番には入らない。選手より先に出ることもない
  assert.equal(nextActionKey({ ...s, dateOk: false }), 'open');
  assert.equal(nextActionKey({ ...s, dateOk: false, fighters: 0 }), 'fighters');
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

test('確認の箱の文: 1行目は結論と数。「よろしいですか？」は付けない。元の文は変わらない', () => {
  const current = base({ title: 'いま', fighters: [fighter('A'), fighter('B'), fighter('C'), fighter('D')], bouts: [bout('1', 'A', 'B'), bout('2', 'C', 'D')] });
  const restored = base({ title: '戻したい大会', updatedAt: new Date(2027, 9, 3, 14, 3).getTime(), fighters: [fighter('A'), fighter('B')], bouts: [bout('1', 'A', 'B')] });
  const box = restoreBoxText({ restored, current, dirty: true, everSaved: true });
  assert.equal(box.verdict, 'いまの内容は消えて、コピーの内容に入れかわります：選手4人→2人・試合2つ→1つ。');
  assert.deepEqual(box.lines.slice(0, 2), ['！選手が4人から2人に減ります。', '！試合が2つから1つに減ります。']);
  assert.ok(box.lines.some((l) => l.includes('『戻したい大会』のコピー')) && box.lines.some((l) => l.includes('まだ保存していない変更あり')));
  assert.ok(![box.verdict, ...box.lines].some((l) => l.includes('よろしいですか')));
  const empty = restoreBoxText({ restored: { ...restored, fighters: [], bouts: [] }, current: base({ fighters: [], bouts: [] }), dirty: false, everSaved: false });
  assert.match(empty.verdict, /^コピーの内容を戻します（なくなるものはありません）：選手0人→0人/);
  assert.match(restoreConfirmText({ restored, current, dirty: true, everSaved: true }), /^いまの内容は消えて、コピーの内容に入れかわります。\n！選手が4人から2人に減ります。/);

  const diff = { name: '赤坂', fields: [{ label: '体重', from: '65', to: '60' }] };
  const over = overwriteBoxText([diff, diff]);
  assert.equal(over.verdict, '次の2人を、ファイルの内容に書きかえます（手で直した所も戻ります）。');
  assert.deepEqual(over.lines, ['赤坂 体重 65→60', '赤坂 体重 65→60']);
  assert.match(overwriteConfirmText([diff]), /^次の1人を、ファイルの内容に書きかえます（手で直した所も戻ります）：\n赤坂 体重 65→60\n\nよろしいですか？$/);
  assert.match(overwriteBoxText([diff, diff, diff, diff, diff]).lines.at(-1) ?? '', /^ほか2人$/);

  const other = useOtherBoxText({ mine: base({ fighters: [fighter('A')] }), latest: base({ fighters: [fighter('A'), fighter('B')], updatedAt: new Date(2027, 9, 3, 9, 5).getTime() }) });
  assert.equal(other.verdict, 'いまの入力は消えて、別の画面の内容になります：選手1人→2人・試合0つ→0つ。');
  assert.deepEqual(other.lines, ['いまの入力：架空大会・選手1人', '別の画面の内容：09:05に保存・選手2人']);
});

test('「コピー作成ずみ」は、あとで変えたら古い扱い（進み具合だけの変化は古くしない）', () => {
  const copy = base({ bouts: [bout('1', 'A', 'B')], currentBout: 0, updatedAt: 100 });
  // このページで作ったコピー: 同じ中身なら新しい。保存で時刻が変わっても、進み具合が変わっても新しい
  assert.equal(backupIsFresh({ current: copy, snapshot: copy, dirty: false, savedFor: 0 }), true);
  assert.equal(backupIsFresh({ current: { ...copy, updatedAt: 200, currentBout: 1 }, snapshot: copy, dirty: false, savedFor: 0 }), true);
  // あとで変えたら古い
  assert.equal(backupIsFresh({ current: { ...copy, title: '変えた' }, snapshot: copy, dirty: true, savedFor: 0 }), false);
  assert.equal(backupIsFresh({ current: { ...copy, bouts: [bout('1', 'B', 'A')] }, snapshot: copy, dirty: true, savedFor: 0 }), false);
  assert.equal(backupIsFresh({ current: { ...copy, fighters: copy.fighters.slice(1) }, snapshot: copy, dirty: true, savedFor: 0 }), false);
  // 開き直したあと（コピーの中身は手元にない）: コピーを作ったときの保存の時刻と同じ、かつ未保存の変更がないときだけ新しい
  assert.equal(backupIsFresh({ current: copy, snapshot: null, dirty: false, savedFor: 100 }), true);
  assert.equal(backupIsFresh({ current: copy, snapshot: null, dirty: true, savedFor: 100 }), false);
  assert.equal(backupIsFresh({ current: { ...copy, updatedAt: 101 }, snapshot: null, dirty: false, savedFor: 100 }), false);
  assert.equal(backupIsFresh({ current: copy, snapshot: null, dirty: false, savedFor: 0 }), false);
});


/* ───────────── 黄色の「👉 次はここ」を1つだけ決める ───────────── */

const nextBase: NextActionState = { titleReal: true, dateOk: true, fighters: 4, nonBlankBouts: 2, halfIndex: -1, dirty: false, everSaved: true, problems: 0, opened: false, saveState: 'idle', conflict: false };
const markerOf = (over: Partial<NextActionState> = {}, extra: Partial<MarkerInput> = {}) => {
  const state = { ...nextBase, ...over };
  return pickMarker({ conflict: state.conflict, asking: false, chooseFirst: false, follow: null, na: nextAction(state), saveState: state.saveState, blankIndex: -1, halfIndex: state.halfIndex, halfSide: 'blue', fix: null, titleMissing: !state.titleReal, ...extra });
};

test('黄色の場所は、状態ごとに1つ。画面のどこかの欄か、下の帯のボタン', () => {
  assert.equal(markerOf({ titleReal: false, everSaved: false, dirty: true, fighters: 0, nonBlankBouts: 0 }).where, 'title');
  assert.equal(markerOf({ fighters: 0, nonBlankBouts: 0 }).where, 'file');
  assert.match(markerOf({ fighters: 0, nonBlankBouts: 0 }).label, /選手名簿\.zip/);
  assert.equal(markerOf({ nonBlankBouts: 0 }).where, 'add-bout');
  const blank = markerOf({ nonBlankBouts: 0 }, { blankIndex: 1 });
  assert.deepEqual([blank.where, blank.index, blank.side], ['bout', 1, 'red']);
  const half = markerOf({ halfIndex: 1, dirty: true }, { halfSide: 'blue' });
  assert.deepEqual([half.where, half.index, half.side, half.label], ['bout', 1, 'blue', '第2試合の青コーナーを選ぶ']);
  assert.deepEqual([markerOf({ dirty: true }).where, markerOf({ dirty: true }).label], ['bar', '保存']);
  assert.equal(markerOf().where, 'bar');
  assert.equal(markerOf().label, '当日の画面を開く');
  assert.equal(markerOf({ opened: true }).where, 'none', '全部終わったら黄色は0個');
});

test('黄色は、ぶつかり > 確認の箱 > 続きから開く大会 > 直後のつづき > いつもの順番', () => {
  assert.equal(markerOf({ conflict: true, saveState: 'failed', dirty: true }).where, 'conflict');
  assert.equal(markerOf({ dirty: true }, { asking: true }).where, 'none', '確認の箱が開いているあいだは黄色なし');
  assert.equal(markerOf({ titleReal: false }, { chooseFirst: true }).where, 'chooser');
  assert.equal(markerOf({ dirty: true }, { follow: { kind: 'photo', id: 'F01' } }).where, 'photo');
  assert.equal(markerOf({ dirty: true }, { follow: { kind: 'refile' } }).where, 'file');
  assert.equal(markerOf({ dirty: true }, { follow: { kind: 'pw' } }).where, 'pw');
  assert.equal(markerOf({ dirty: true }, { follow: { kind: 'review' } }).where, 'review');
});

test('保存に失敗したら、黄色は「コピーのファイルを作る」。そのボタンが出ていないときは「もう一度保存」', () => {
  const failed = markerOf({ saveState: 'failed', dirty: true });
  assert.deepEqual([failed.where, failed.label], ['bar-copy', 'コピーのファイルを作る']);
  assert.equal(markerOf({ saveState: 'failed', dirty: true }, { copyButton: false }).where, 'bar');
  assert.equal(markerOf({ saveState: 'saving', dirty: true }).where, 'bar');
});

test('直すところがあるときは、その試合の選手欄に黄色。なければ大会名か帯', () => {
  const fix = markerOf({ problems: 1 }, { fix: { index: 2, side: 'red' } });
  assert.deepEqual([fix.where, fix.index, fix.side], ['bout', 2, 'red']);
  assert.equal(markerOf({ problems: 1 }).where, 'bar');
  assert.equal(nextAction({ ...nextBase, conflict: true }).label, '上の「👉 次はここ」の箱を見る');
});

/* ───────────── 自動で直す（まちがいにくくする） ───────────── */

test('数字: 全角・単位・コンマを自動で直す。直せないものは直さずに知らせる', () => {
  const ok = (raw: string, want: string, integer = false) => { const r = readNumber(raw, integer); assert.deepEqual(r.ok && r.value, want, raw); };
  ok('６５', '65'); ok('65キロ', '65'); ok('65kg', '65'); ok('65 Kg', '65'); ok('70,5', '70.5'); ok('70，5', '70.5'); ok('170センチ', '170'); ok('170cm', '170'); ok('15歳', '15'); ok('15才', '15');
  ok(' 65.5 ', '65.5'); ok('065', '65'); ok('15.0', '15', true); ok('', '');
  for (const raw of ['0x10', '1e5', '六十五', 'ー5', '65キロくらい', 'abc', '65.5.5', '123456789012']) assert.equal(readNumber(raw).ok, false, raw);
  assert.equal(checkNumber('weight', '65キロ').problem, null);
  assert.equal(checkNumber('weight', '65キロ').fixed, true);
  assert.equal(checkNumber('weight', '65').fixed, false);
  assert.equal(checkNumber('weight', '六十五').problem, '体重：数字だけ入れる。例：65.5');
  assert.match(checkNumber('height', '30').problem ?? '', /^身長：50〜250の間で入れる/);
  assert.match(checkNumber('age', '200').problem ?? '', /^年齢：1〜120の間で入れる/);
  assert.equal(checkNumber('age', '15.0').value, '15');
});

test('日にち: どの書き方も 2027年10月3日。あり得ない日・令和・年なしは理由つきで知らせる', () => {
  for (const raw of ['2027年10月3日', '2027-10-03', '2027/10/3', '2027.10.03', '20271003', '２０２７１００３', ' 2027 年 10 月 3 日 ', '2027年10月03日']) {
    const r = readDate(raw);
    assert.deepEqual(r.kind === 'ok' && r.text, '2027年10月3日', raw);
  }
  assert.equal((readDate('2027年10月3日') as { fixed: boolean }).fixed, false);
  assert.equal((readDate('20271003') as { fixed: boolean }).fixed, true);
  assert.deepEqual(readDate(''), { kind: 'empty' });
  assert.deepEqual(readDate('2027年10月'), { kind: 'partial' });
  assert.deepEqual(readDate('2027年10月日'), { kind: 'partial' });
  assert.deepEqual(readDate('20271'), { kind: 'partial' });
  const bad = (raw: string, re: RegExp) => { const r = readDate(raw); assert.equal(r.kind, 'bad', raw); assert.match(r.kind === 'bad' ? r.reason : '', re, raw); };
  bad('2027年13月32日', /13月32日はありません/); bad('2027年2月30日', /2月30日はありません/); bad('令和9年1月1日', /令和などは使えません/); bad('10月3日', /年がありません/); bad('おととい', /読めません/); bad('202710031', /多すぎます/);
});

test('探す・パスワード・入場曲: ひらがなとカタカナを同じに、全角と空白を直す', () => {
  assert.equal(foldKana('ヤマダ　Ｔａｒｏ'), foldKana('やまだ taro'));
  assert.ok(foldKana('山田 太郎').includes(foldKana('山田')));
  assert.equal(normalizePassword('　ｐａｓｓ１２３４５６ '), 'pass123456');
  assert.equal(checkMusic(' https://music.apple.com/jp/song/1\n').value, 'https://music.apple.com/jp/song/1');
  assert.equal(checkMusic('https://music.apple.com/jp/song/1').problem, null);
  assert.match(checkMusic('https://open.spotify.com/track/1').problem ?? '', /Spotify は使えません/);
  assert.match(checkMusic('https://example.com/x').problem ?? '', /Apple Music か YouTube/);
  assert.match(checkMusic('https://music.apple.com/' + 'a'.repeat(500)).problem ?? '', /500文字まで/);
  assert.equal(checkMusic('').problem, null);
  assert.equal(shorten('あ'.repeat(30), 10), 'あ'.repeat(10) + '…');
});

const person = (over: Partial<LocalFighter> = {}): LocalFighter => ({ id: 'X1', gym: 'ジム', name: '山田 太郎', grade: '', age: '', height: '170', weight: '65', record: '初試合', comment: '', musicUrl: '', photoDataUrl: '', ...over });

test('選手1人の検査: 追加では必要な欄が空ならまちがい、直すでは名前だけ必要。直した所は言う', () => {
  const add = checkFighter(person({ weight: '65キロ', height: '１７０' }), DEFAULT_ENTRY_CONFIG, 'add');
  assert.deepEqual(add.problems, []);
  assert.equal(add.fighter.weight, '65'); assert.equal(add.fighter.height, '170');
  assert.deepEqual(add.fixes.map((fix) => fix.key).sort(), ['height', 'weight']);
  const empty = checkFighter(person({ gym: '', name: '', weight: '', height: '', record: '' }), DEFAULT_ENTRY_CONFIG, 'add');
  assert.deepEqual(empty.problems.map((p) => p.key).sort(), ['gym', 'height', 'name', 'record', 'weight']);
  const edit = checkFighter(person({ weight: '', height: '', gym: '', record: '' }), DEFAULT_ENTRY_CONFIG, 'edit');
  assert.deepEqual(edit.problems, [], '直すときは、いる人の空の欄を責めない');
  assert.deepEqual(checkFighter(person({ name: ' ' }), DEFAULT_ENTRY_CONFIG, 'edit').problems.map((p) => p.key), ['name']);
  assert.match(checkFighter(person({ name: 'あ'.repeat(81) }), DEFAULT_ENTRY_CONFIG, 'add').problems[0].text, /選手名は80文字までです/);
  assert.match(checkFighter(person({ gym: 'あ'.repeat(121) }), DEFAULT_ENTRY_CONFIG, 'edit').problems[0].text, /ジム名は120文字までです/);
  assert.deepEqual(checkFighter(person({ age: '' }), { ...DEFAULT_ENTRY_CONFIG, age: 'required' }, 'add').problems.map((p) => p.key), ['age']);
  assert.deepEqual(checkFighter(person({ musicUrl: '' }), { ...DEFAULT_ENTRY_CONFIG, music: true }, 'add').problems.map((p) => p.key), ['musicUrl']);
  assert.equal(describeChange(person({ weight: '52' }), person({ weight: '53' })), '体重 52 → 53');
  assert.equal(describeChange(person(), person()), '');
});

/* ───────────── 画面に出す言葉を決める小さな関数 ───────────── */

test('体重差は5kg未満は何も出さず、5kg以上で注意、10kg以上で赤', () => {
  assert.deepEqual([gapLevel(null), gapLevel(4.9), gapLevel(5), gapLevel(9.9), gapLevel(10), gapLevel(10.5)], ['none', 'none', 'caution', 'caution', 'danger', 'danger']);
});

test('体重がない人・名前が長い人・同じ人を見つける', () => {
  const list = [fighter('A'), fighter('B', { weight: '' }), fighter('C', { weight: 'あ' }), fighter('D', { name: 'あ'.repeat(81) }), fighter('E', { gym: 'い'.repeat(121) })];
  assert.deepEqual(weightMissing(list).map((f) => f.id), ['B', 'C']);
  assert.deepEqual(tooLong(list).map((x) => x.fighter.id + x.field + x.max), ['Dname80', 'Egym120']);
  assert.equal(sameFighterExists([fighter('A', { name: '山田 太郎', gym: 'ジム' })], fighter('Z', { name: '山田　太郎', gym: 'ジム' })), true);
  assert.equal(sameFighterExists([fighter('A', { name: '山田 太郎', gym: 'ジム' })], fighter('Z', { name: '山田 太郎', gym: '別ジム' })), false);
  assert.equal(sameFighterExists([], fighter('Z', { name: '' })), false);
});

test('大会の一覧の名前: 名前なしは日時で見分ける。空の新しい大会は「新しい（空）」', () => {
  const at = new Date(2027, 9, 10, 1, 15).getTime();
  assert.equal(monthDayClockPad(at), '10月10日 01:15');
  assert.equal(eventListName({ title: '第3回 青空ジム大会', fighters: 6, bouts: 1, updatedAt: at }), '第3回 青空ジム大会');
  assert.equal(eventListName({ title: '大会名未設定', fighters: 0, bouts: 0, updatedAt: at }), '新しい（空）10月10日 01:15');
  assert.equal(eventListName({ title: '', fighters: 3, bouts: 0, updatedAt: at }), '名前なし（作成 10月10日 01:15）');
});

test('取り込みの失敗は、見出しとくわしい文に分かれる（くわしい文は元の文から「変えていません」だけ除く）', () => {
  const ext = importErrorParts(new ImportProblem('ext'), 'メモ.txt');
  assert.equal(ext.head, 'これは名簿ではありません（メモ.txt）');
  assert.equal(ext.detail, 'ZIPかExcel（.xlsx）か、CSVを選んでください。');
  const blocked = importErrorParts(new ImportProblem('blocked'), 'a.csv', ['電話', '電話番号', 'メール', 'メールアドレス']);
  assert.equal(blocked.head, '個人情報の列があります：電話番号、メールアドレス');
  assert.match(blocked.hint, /Googleシートの④で作ったZIP/);
  assert.match(importErrorParts(new Error('Invalid zip data'), 'こわれ.zip').head, /^ファイルがこわれています。別のファイルを選ぶ/);
  assert.match(importErrorParts(new Error('同じ管理番号が2つあります。'), 'd.csv').detail, /同じ選手が2回/);
  for (const error of [new ImportProblem('no-list'), new ImportProblem('empty'), new Error('x')]) assert.ok(!importErrorParts(error, 'f').detail.includes('今の名簿は変えていません'));
});

test('保存の失敗の理由・試合の問題・古いコピーの言い方', () => {
  assert.equal(saveReasonShort('quota'), '空きが足りません');
  assert.equal(saveReasonShort('other'), '');
  assert.match(saveReasonText('quota'), /空き/);
  assert.equal(shortProblem({ side: 'blue', text: '' }, 1), '第2試合の青が空');
  assert.equal(shortProblem({ side: 'same', text: '' }, 0), '第1試合で同じ人が赤と青');
  const day = 86_400_000;
  assert.equal(oldCopyText(1000, 1000 + 3 * day + 5), 'このコピーは3日前のものです');
  assert.equal(oldCopyText(1000, 1000 + day / 2), '');
});
