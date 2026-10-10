import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTournament, type LocalBout, type LocalFighter, type LocalTournament } from '../core/privateTournament.ts';
import { decryptBackup, encryptBackup } from '../app/lib/privateStore.ts';
import { isValidEventId, newEventId, normalizeEventId } from '../app/private/eventId.ts';
import {
  backupFileName, blockedWords, classifyRestoreError, classifySaveError, decodeCsvBytes, decryptWithRetry, entryConfigFromHash, fromEventIdFromHash, importErrorText, importKind, ImportProblem,
  isBlankFighterForm, looksLikeBackup, mergeKeepExisting, nextAction, overwriteConfirmText, restoreConfirmText, restoreLastRemoved, saveErrorText, saveLine, type NextActionState,
} from '../app/private/logic.ts';

const fighter = (id: string, over: Partial<LocalFighter> = {}): LocalFighter => ({ id, gym: 'テストジム', name: '架空' + id, grade: '', age: '', height: '170', weight: '60', record: '初試合', comment: '', musicUrl: '', photoDataUrl: '', ...over });
const bout = (id: string, redId = '', blueId = ''): LocalBout => ({ id, redId, blueId, className: '', rule: '' });
const hex = (text: string) => Uint8Array.from(text.match(/../g)!.map((pair) => parseInt(pair, 16)));

/* ───── 名簿の読み込み: 前からいる人は黙って変えない ───── */
test('mergeKeepExisting: 前からいる人は今のまま、新しい人だけ足す', () => {
  const mine = [fighter('A', { weight: '65' }), fighter('B')];
  const file = [fighter('A', { weight: '70' }), fighter('B'), fighter('C')];
  const result = mergeKeepExisting(mine, file);
  assert.equal(result.added, 1);
  assert.equal(result.same, 1);
  assert.equal(result.changed, true);
  assert.deepEqual(result.merged.map((f) => f.id), ['A', 'B', 'C']);
  assert.equal(result.merged[0].weight, '65', '手で直した体重は残る');
  assert.equal(result.differs.length, 1);
  assert.deepEqual(result.differs[0].fields, [{ label: '体重', from: '65', to: '70' }]);
  assert.equal(result.overwritten[0].weight, '70', '書きかえを選んだときだけファイルの内容');
  assert.equal(mine[0].weight, '65', '元の配列は変えない');
});

test('mergeKeepExisting: 同じ内容の読み込みは何も変えない（未保存にならない）', () => {
  const mine = [fighter('A'), fighter('B')];
  const result = mergeKeepExisting(mine, [fighter('B'), fighter('A')]);
  assert.equal(result.changed, false);
  assert.equal(result.added, 0);
  assert.equal(result.same, 2);
  assert.deepEqual(result.differs, []);
  assert.deepEqual(result.merged, mine);
});

test('mergeKeepExisting: 写真がない人にだけ写真を足す。ちがう写真は「ちがい」に出す', () => {
  const photo = 'data:image/jpeg;base64,AAAA', other = 'data:image/jpeg;base64,BBBB';
  const fill = mergeKeepExisting([fighter('A')], [fighter('A', { photoDataUrl: photo })]);
  assert.equal(fill.photosFilled, 1);
  assert.equal(fill.changed, true);
  assert.equal(fill.merged[0].photoDataUrl, photo);
  assert.equal(fill.differs.length, 0);
  const differ = mergeKeepExisting([fighter('A', { photoDataUrl: photo })], [fighter('A', { photoDataUrl: other })]);
  assert.equal(differ.merged[0].photoDataUrl, photo);
  assert.equal(differ.differs[0].fields[0].label, '写真');
  assert.equal(differ.changed, false);
});

test('mergeKeepExisting: 重複と3000人超えは名簿を変えずに止める', () => {
  assert.throws(() => mergeKeepExisting([], [fighter('A'), fighter('A')]), /同じ管理番号/);
  const many = Array.from({ length: 3000 }, (_, i) => fighter('M' + i));
  assert.throws(() => mergeKeepExisting(many, [fighter('X')]), /3000人/);
  assert.match(importErrorText(new Error('名簿が3000人を超えます。')), /3000人まで/);
});

test('overwriteConfirmText: 何が何人変わるかを書く', () => {
  const diff = (name: string) => ({ name, fields: [{ label: '体重', from: '65', to: '70' }, { label: '身長', from: '170', to: '171' }, { label: '戦績', from: '', to: '1戦' }] });
  const text = overwriteConfirmText([diff('赤坂 太郎')]);
  assert.match(text, /^次の1人を、ファイルの内容に書きかえます/);
  assert.match(text, /赤坂 太郎 体重 65→70、身長 170→171 ほか/);
  assert.match(text, /よろしいですか？$/);
  assert.match(overwriteConfirmText([diff('a'), diff('b'), diff('c'), diff('d'), diff('e')]), /ほか2人/);
});

/* ───── 大会番号 ───── */
test('normalizeEventId: 使える形に直す。直しても空なら既定', () => {
  assert.equal(normalizeEventId('browser-desktop'), 'browser-desktop');
  assert.equal(normalizeEventId('My Event'), 'my-event');
  assert.equal(normalizeEventId('ＡＢＣ　２０２７'), 'abc-2027');
  assert.equal(normalizeEventId('--a__b--'), 'a-b');
  assert.equal(normalizeEventId('日本語'), 'my-tournament');
  assert.equal(normalizeEventId(''), 'my-tournament');
  assert.equal(normalizeEventId(null), 'my-tournament');
  assert.equal(normalizeEventId('a'.repeat(100)).length, 64);
  for (const raw of ['My Event', '日本語', '  x  ', 'A/B?c', 'a'.repeat(100)]) assert.ok(isValidEventId(normalizeEventId(raw)), raw);
});

test('newEventId: 英小文字と数字だけの新しい番号', () => {
  const id = newEventId(Date.UTC(2027, 9, 3));
  assert.match(id, /^taikai-[a-z0-9]+$/);
  assert.ok(isValidEventId(id));
  assert.notEqual(newEventId(1), newEventId(2));
});

/* ───── 次にすること（塗りボタンは1つ） ───── */
const base: NextActionState = { titleReal: true, dateOk: true, fighters: 4, nonBlankBouts: 2, halfIndex: -1, dirty: false, everSaved: true, problems: 0, opened: false, saveState: 'idle', conflict: false };

test('nextAction: 食いちがい > 保存中 > 保存失敗 > 次の入力 > 保存 > 開く', () => {
  assert.deepEqual(nextAction({ ...base, conflict: true, saveState: 'failed', titleReal: false }), { kind: 'conflict', key: 'save', label: '上の「👉 次はここ」の箱を見る' });
  assert.equal(nextAction({ ...base, saveState: 'saving', dirty: true }).label, '保存中…');
  const failed = nextAction({ ...base, saveState: 'failed', dirty: true, titleReal: false });
  assert.equal(failed.kind, 'save'); assert.equal(failed.label, 'もう一度 保存する');
  assert.equal(nextAction({ ...base, dirty: true, titleReal: false }).kind, 'title');
  // 開催日は「なくてもOK」: 空でも、次にやることの順番には入らない（保存も、開くこともできる）
  assert.equal(nextAction({ ...base, dirty: true, dateOk: false }).kind, 'save');
  assert.equal(nextAction({ ...base, dateOk: false }).kind, 'open');
  assert.equal(nextAction({ ...base, dateOk: false, fighters: 0, nonBlankBouts: 0 }).kind, 'roster', '日にちより先に、選手を入れる');
  assert.equal(nextAction({ ...base, dirty: true, fighters: 0 }).kind, 'roster');
  assert.equal(nextAction({ ...base, dirty: true, nonBlankBouts: 0 }).kind, 'bout');
  const half = nextAction({ ...base, dirty: true, halfIndex: 1, halfSide: 'blue' });
  assert.equal(half.kind, 'bout'); assert.equal(half.label, '第2試合の青を選ぶ');
  const save = nextAction({ ...base, dirty: true });
  assert.equal(save.kind, 'save'); assert.equal(save.label, '保存する');
  assert.equal(nextAction({ ...base, problems: 1 }).kind, 'fix');
  assert.deepEqual([nextAction(base).kind, nextAction(base).label], ['open', '試合当日の画面を開く']);
  assert.equal(nextAction({ ...base, opened: true }).key, 'done');
});

test('nextAction: ふつうの順番では、塗りの候補はいつも1つだけ', () => {
  for (const state of [base, { ...base, dirty: true }, { ...base, titleReal: false }]) assert.equal(typeof nextAction(state).label, 'string');
});

/* ───── 保存の4つの状態 ───── */
test('saveLine: 4つの状態が1か所の言葉で決まる', () => {
  const s = { conflict: false, saveState: 'idle' as const, dirty: false, everSaved: true, savedClock: '14:03' };
  assert.equal(saveLine(s).text, '✓ 保存済み 14:03');
  assert.equal(saveLine({ ...s, dirty: true }).text, '● 未保存（入れた内容は、まだ保存していません）');
  assert.equal(saveLine({ ...s, everSaved: false }).text, '● 未保存（まだ一度も保存していません）');
  assert.equal(saveLine({ ...s, saveState: 'saving', dirty: true }).text, '⏳ 保存中…（そのままお待ちください）');
  assert.equal(saveLine({ ...s, saveState: 'failed', dirty: true }).text, '! 保存失敗（入れた内容は画面に残っています）');
  assert.equal(saveLine({ ...s, saveState: 'failed', dirty: false }).tone, 'bad', '失敗は編集しても消えない');
  assert.equal(saveLine({ ...s, conflict: true, saveState: 'failed' }).text, '! 保存できません：別の画面で内容が変わりました');
});

test('classifySaveError: 失敗の理由を分けて、次に押すものを言う', () => {
  const quota = new Error('x'); quota.name = 'QuotaExceededError';
  assert.equal(classifySaveError(quota, 'ok-id'), 'quota');
  assert.equal(classifySaveError(new Error('保存するデータを確認してください。'), 'ok-id'), 'bad-id');
  assert.equal(classifySaveError(new Error('x'), 'Bad Id!'), 'bad-id');
  assert.equal(classifySaveError(new Error('ブラウザ内の保存場所を開けませんでした。'), 'ok-id'), 'unavailable');
  assert.equal(classifySaveError(new Error('別の画面が保存場所の更新を止めています。'), 'ok-id'), 'unavailable');
  assert.equal(classifySaveError(new Error('???'), 'ok-id'), 'other');
  for (const kind of ['bad-id', 'quota', 'unavailable', 'other'] as const) assert.ok(saveErrorText(kind).length > 20);
  assert.match(saveErrorText('other'), /^保存できませんでした。入れた内容は残っています。$/);
  assert.match(saveErrorText('quota'), /空きが足りません/);
  assert.match(saveErrorText('bad-id'), /「新しい大会をつくる」/);
});

/* ───── 取り込みエラー ───── */
test('取り込みエラーは、どれも「今の名簿は変えていません。」で終わる', () => {
  for (const error of [new ImportProblem('no-list'), new ImportProblem('no-sheet'), new ImportProblem('blocked'), new ImportProblem('empty'), new ImportProblem('ext'), new ImportProblem('encoding'), new ImportProblem('too-large'), new Error('Invalid zip data'), new Error('同じ管理番号が2つあります。')]) {
    assert.match(importErrorText(error), /今の名簿は変えていません。$/);
  }
  assert.match(importErrorText(new ImportProblem('ext')), /^ZIPかExcel（.xlsx）か、CSVを選んでください。/);
  assert.match(importErrorText(new ImportProblem('encoding')), /「CSV UTF-8」で保存し直してください/);
});

test('読めない列の一覧は、他の語に含まれる語を除いて1回ずつ', () => {
  assert.deepEqual(blockedWords(['電話', '電話番号', 'メール', 'メールアドレス', '住所']), ['電話番号', 'メールアドレス', '住所']);
  assert.deepEqual(blockedWords(['住所', '住所']), ['住所']);
  assert.match(importErrorText(new ImportProblem('blocked'), ['電話', '電話番号']), /（電話番号）/);
});

test('importKind: ZIP・xlsx・csv 以外は中を読まずに止める', () => {
  assert.equal(importKind('A.ZIP'), 'zip'); assert.equal(importKind('b.xlsx'), 'xlsx'); assert.equal(importKind('c.CSV'), 'csv');
  assert.equal(importKind('d.txt'), ''); assert.equal(importKind('e.png'), ''); assert.equal(importKind('zip'), '');
});

test('decodeCsvBytes: UTF-8 を先に、文字化けしたときだけ Shift_JIS で読み直す', () => {
  const utf8 = new TextEncoder().encode('選手名,ジム名\n山田,テスト');
  assert.equal(decodeCsvBytes(utf8), '選手名,ジム名\n山田,テスト');
  assert.equal(decodeCsvBytes(hex('91498ee896bc2c8357838096bc0a8e5293632c836583588367'.replace('0a8e5293632c836583588367', '0a8e5293632c836583588367'))).startsWith('選手名,ジム名'), true);
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
  assert.ok(decodeCsvBytes(withBom).startsWith('選手名'));
  // 電話番号の列は、文字コードを直しても読めるので、あとで「読み込めない情報」として止まる
  assert.match(decodeCsvBytes(hex('9364986294d48d862c91498ee896bc0a3039302c8e529363')), /^電話番号,選手名/);
  assert.throws(() => decodeCsvBytes(Uint8Array.from([0x81, 0x00, 0xff, 0xfe, 0x80, 0xa0, 0xfd])), (error: unknown) => error instanceof ImportProblem && error.kind === 'encoding');
});

/* ───── 手入力 / 消した試合 ───── */
test('isBlankFighterForm: 何も入れていないフォームを見分ける', () => {
  assert.equal(isBlankFighterForm(fighter('X', { gym: '', name: '', height: '', weight: '', record: '' })), true);
  assert.equal(isBlankFighterForm(fighter('X', { gym: '', name: '', height: '', weight: '', record: '', age: '9' })), false);
});

test('restoreLastRemoved: 消した試合を新しいほうから順に戻す。同じ番号があれば重ねない', () => {
  const kept = [bout('1', 'A', 'B'), bout('4', 'C', 'D')];
  const stack = [{ bout: bout('2', 'A', 'C'), index: 1 }, { bout: bout('3', 'B', 'D'), index: 1 }];
  const first = restoreLastRemoved(kept, stack);
  assert.deepEqual(first.bouts.map((b) => b.id), ['1', '3', '4']);
  assert.equal(first.stack.length, 1);
  const second = restoreLastRemoved(first.bouts, first.stack);
  assert.deepEqual(second.bouts.map((b) => b.id), ['1', '2', '3', '4']);
  assert.equal(restoreLastRemoved(second.bouts, second.stack).restored, null);
  const dup = restoreLastRemoved([bout('2', 'A', 'C')], [{ bout: bout('2', 'A', 'C'), index: 0 }]);
  assert.equal(dup.restored, null); assert.equal(dup.bouts.length, 1);
});

/* ───── コピーのファイル ───── */
test('restoreConfirmText: 数字つき。「入れかわります」を必ず含み、減るときは先頭で警告する', () => {
  const restored: LocalTournament = { ...emptyTournament('t1'), title: '第2回テスト大会', updatedAt: new Date(2027, 9, 3, 14, 3).getTime(), fighters: [fighter('A'), fighter('B')], bouts: [bout('1', 'A', 'B')] };
  const current: LocalTournament = { ...emptyTournament('t1'), title: '今', fighters: [fighter('A'), fighter('B'), fighter('C'), fighter('D')], bouts: [bout('1', 'A', 'B'), bout('2', 'C', 'D')] };
  const text = restoreConfirmText({ restored, current, dirty: true, everSaved: true });
  assert.match(text, /^いまの内容は消えて、コピーの内容に入れかわります。\n！選手が4人から2人に減ります。\n！試合が2つから1つに減ります。\nこう変わります：選手4人→2人・試合2つ→1つ\n/);
  assert.match(text, /『第2回テスト大会』のコピー（選手2人・写真0枚・試合1つ・10月3日 14:03）を戻します。/);
  assert.match(text, /いまの内容（選手4人・試合2つ、まだ保存していない変更あり）は、保存ずみのものも消えます。/);
  assert.match(text, /よろしいですか？$/);
  const empty = restoreConfirmText({ restored: { ...restored, fighters: [], bouts: [] }, current, dirty: false, everSaved: true });
  assert.ok(empty.startsWith('いまの内容は消えて、コピーの内容に入れかわります。\n！このコピーは空です。'));
  const fresh = restoreConfirmText({ restored, current: emptyTournament('t1'), dirty: false, everSaved: false });
  assert.match(fresh, /（いまの内容は空です）/); assert.ok(fresh.includes('入れかわ')); assert.ok(!fresh.includes('減ります'));
});

test('backupFileName: 大会番号と日付8桁。日付が不正なら nodate', () => {
  assert.equal(backupFileName('probe', '2027年10月3日'), 'probe-20271003.tournament.enc');
  assert.equal(backupFileName('probe', '20271003'), 'probe-20271003.tournament.enc');
  assert.equal(backupFileName('probe', ''), 'probe-nodate.tournament.enc');
  assert.equal(backupFileName('probe', '2027年10月日'), 'probe-nodate.tournament.enc');
});

test('復元: パスワードの全角・空白は1回だけやり直す。暗号の形式は変わらない', async () => {
  const value = { ...emptyTournament('restore-test'), title: '架空大会', fighters: [fighter('A')] };
  const encoded = await encryptBackup(value, 'Fictional-pass-2027');
  assert.equal(JSON.parse(encoded).format, 'tournament-os-private-1');
  assert.ok(looksLikeBackup(encoded));
  assert.deepEqual(await decryptWithRetry((pw) => decryptBackup(encoded, pw), 'Fictional-pass-2027'), value);
  assert.deepEqual(await decryptWithRetry((pw) => decryptBackup(encoded, pw), ' Ｆictional-pass-2027 '), value, '全角と空白は直して開く');
  let tries = 0;
  await assert.rejects(decryptWithRetry((pw) => { tries++; return decryptBackup(encoded, pw); }, 'wrong-password-1'), (error: unknown) => classifyRestoreError(error) === 'password');
  assert.equal(tries, 1, '直す所がないときは、鍵づくりを2回走らせない');
  let tries2 = 0;
  await assert.rejects(decryptWithRetry((pw) => { tries2++; return decryptBackup(encoded, pw); }, ' wrong-password-1'));
  assert.equal(tries2, 2);
});

test('復元: ファイルの形・中身のちがいを見分ける', async () => {
  assert.equal(looksLikeBackup('hello'), false);
  assert.equal(looksLikeBackup('{"format":"x"}'), false);
  assert.equal(looksLikeBackup('{"format":"tournament-os-private-1","salt":"a","iv":"b"}'), false);
  assert.equal(classifyRestoreError(new Error('Tournament OSのバックアップではありません。')), 'format');
  assert.equal(classifyRestoreError(new Error('バックアップの中身を読み取れません。')), 'content');
  const e = new Error('x'); e.name = 'OperationError';
  assert.equal(classifyRestoreError(e), 'password');
});

/* ───── 受付をつくる画面から来る値 ───── */
test('entryConfigFromHash: 決まった言葉だけ受け取る', () => {
  assert.equal(entryConfigFromHash('#t=x&d=y'), null);
  assert.deepEqual(entryConfigFromHash('#m=on&g=required&a=off&c=optional'), { music: true, grade: 'required', age: 'off', comment: 'optional' });
  assert.deepEqual(entryConfigFromHash('#m=yes&g=bad&a=required'), { music: false, grade: 'optional', age: 'required', comment: 'optional' });
  assert.equal(entryConfigFromHash('#m=maybe&g=bad'), null);
  assert.equal(fromEventIdFromHash('#from=taikai-abc'), 'taikai-abc');
  assert.equal(fromEventIdFromHash('#from=Bad%20Id'), '');
  assert.equal(fromEventIdFromHash(''), '');
});

/* ───── 管理番号が空の名簿を、行がずれて読み直したとき ───── */
test('mergeKeepExisting: 名前とジムが同じで、管理番号がちがう人は、足さずに数える', () => {
  const mine = [fighter('A1', { name: '山田 太郎', gym: 'Aジム' }), fighter('B1', { name: '鈴木 次郎', gym: 'Bジム' })];
  // 1行ずれて、同じ人の番号が変わった。新しい人（Z）だけが本当に新しい
  const file = [fighter('Z9', { name: '新人 三郎', gym: 'Cジム' }), fighter('A2', { name: '山田　太郎', gym: 'Aジム' }), fighter('B2', { name: '鈴木 次郎', gym: 'Bジム' })];
  const result = mergeKeepExisting(mine, file);
  assert.equal(result.added, 1, '本当に新しい人だけ');
  assert.deepEqual(result.lookalike.map((f) => f.id), ['A2', 'B2'], '全角の空白がちがっても、同じ人と見る');
  assert.deepEqual(result.merged.map((f) => f.id), ['A1', 'B1', 'Z9'], '重なった人は、名簿に入れない');
  assert.equal(result.changed, true);
  assert.equal(mine.length, 2, '元の配列は変えない');
  // 名前だけ同じでジムがちがう人は、別の人
  assert.equal(mergeKeepExisting(mine, [fighter('A3', { name: '山田 太郎', gym: 'Zジム' })]).lookalike.length, 0);
  // 同じ番号の人は、重なりではなく「前からいる人」
  assert.equal(mergeKeepExisting(mine, [fighter('A1', { name: '山田 太郎', gym: 'Aジム' })]).lookalike.length, 0);
});

test('saveLine: 追加前の入力があるときは、保存済みと言わない', () => {
  const s = { conflict: false, saveState: 'idle' as const, dirty: false, everSaved: true, savedClock: '14:03' };
  assert.equal(saveLine({ ...s, pending: true }).text, '● 未保存（選手の入力が、まだ追加されていません）');
  assert.equal(saveLine({ ...s, pending: false }).text, '✓ 保存済み 14:03');
  assert.equal(saveLine({ ...s, pending: true, saveState: 'failed' }).short, '! 保存失敗', '失敗のほうが先');
});
