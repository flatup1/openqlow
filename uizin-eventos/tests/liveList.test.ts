import test from 'node:test';
import assert from 'node:assert/strict';
import type { LocalBout, LocalFighter } from '../core/privateTournament.ts';
import {
  EMPTY_LIST_MESSAGE, MISSING_FIGHTER, NO_CONTRACT, buildPageRows, buildRow, clampPage, musicLabel, musicState, nowModel, pageButtonText, pageCount, pageJumpList, pageLabel, pageOfBout, pageRange, pageRangeText, pagerState,
  parseBoutNumber, parseViewParam, summarizeMusic, totalLabel, withViewParam,
  boutNumberProblem, filterNote, isRepeatPress, jumpDoneText, moveNotice, nextHint, openWarning, saveFailNotice, undoSecondsLeft,
} from '../app/private/live/listLogic.ts';

const fighter = (id: string, over: Partial<LocalFighter> = {}): LocalFighter => ({ id, gym: 'テストジム', name: '架空' + id, grade: '', age: '', height: '170', weight: '60', record: '', comment: '', musicUrl: '', photoDataUrl: '', ...over });
const bout = (n: number, over: Partial<LocalBout> = {}): LocalBout => ({ id: 'b' + n, redId: 'r' + n, blueId: 'u' + n, className: '', rule: '', ...over });
const many = (n: number) => ({
  fighters: Array.from({ length: n }, (_, i) => [fighter('r' + i), fighter('u' + i)]).flat(),
  bouts: Array.from({ length: n }, (_, i) => bout(i)),
  currentBout: 0,
});

test('parseViewParam: ?view=list のときだけ一覧、それ以外は1試合ずつ', () => {
  assert.equal(parseViewParam('?event=a&view=list'), 'list');
  assert.equal(parseViewParam('?view=list'), 'list');
  assert.equal(parseViewParam(''), 'single');
  assert.equal(parseViewParam('?event=a'), 'single');
  assert.equal(parseViewParam('?view=LIST'), 'single');
  assert.equal(parseViewParam('?view=other'), 'single');
});

test('withViewParam: event は残し、1試合ずつでは view を付けない', () => {
  assert.equal(withViewParam('?event=my-cup', 'list'), '?event=my-cup&view=list');
  assert.equal(withViewParam('?event=my-cup&view=list', 'single'), '?event=my-cup');
  assert.equal(withViewParam('', 'list'), '?view=list');
  assert.equal(withViewParam('?view=list', 'single'), '');
  assert.equal(withViewParam('?event=a&view=list', 'list'), '?event=a&view=list');
});

test('pageCount: 0・1・10・11・35・100 試合', () => {
  assert.deepEqual([0, 1, 10, 11, 35, 100].map((n) => pageCount(n)), [1, 1, 1, 2, 4, 10]);
});

test('pageOfBout: 今の試合があるページ。範囲外は端に寄せる', () => {
  assert.equal(pageOfBout(0, 35), 0);
  assert.equal(pageOfBout(9, 35), 0);
  assert.equal(pageOfBout(10, 35), 1);
  assert.equal(pageOfBout(34, 35), 3);
  assert.equal(pageOfBout(99, 35), 3);
  assert.equal(pageOfBout(-5, 35), 0);
  assert.equal(pageOfBout(NaN, 35), 0);
  assert.equal(pageOfBout(0, 0), 0);
});

test('clampPage / pageRange: 試合が減っても空のページにならない', () => {
  assert.equal(clampPage(7, 11), 1);
  assert.equal(clampPage(-1, 11), 0);
  assert.deepEqual(pageRange(0, 11), { start: 0, end: 10 });
  assert.deepEqual(pageRange(1, 11), { start: 10, end: 11 });
  assert.deepEqual(pageRange(3, 35), { start: 30, end: 35 });
  assert.deepEqual(pageRange(5, 35), { start: 30, end: 35 });
  assert.deepEqual(pageRange(0, 0), { start: 0, end: 0 });
});

test('pageLabel: 「N / M ページ（11〜20試合目）」。1試合だけのページは「35試合目」', () => {
  assert.equal(pageLabel(0, 35), '1 / 4 ページ（1〜10試合目）');
  assert.equal(pageLabel(1, 35), '2 / 4 ページ（11〜20試合目）');
  assert.equal(pageLabel(3, 35), '4 / 4 ページ（31〜35試合目）');
  assert.equal(pageLabel(0, 1), '1 / 1 ページ（1試合目）');
  assert.equal(pageLabel(10, 101), '11 / 11 ページ（101試合目）');
  assert.equal(pageLabel(0, 100), '1 / 10 ページ（1〜10試合目）');
  assert.equal(pageLabel(0, 12, 10, '件目'), '1 / 2 ページ（1〜10件目）');
  assert.equal(pageLabel(0, 0), '1 / 1 ページ（試合なし）');
  assert.equal(pageRangeText(2, 35), '21〜30試合目');
  assert.equal(totalLabel(35), '全35試合・4ページ');
  assert.equal(totalLabel(1), '全1試合・1ページ');
  assert.equal(totalLabel(0), '全0試合・1ページ');
});

test('pageButtonText: ページ番号ボタンには「11〜20」と、中身の範囲を書く', () => {
  assert.equal(pageButtonText(0, 35), '1〜10');
  assert.equal(pageButtonText(1, 35), '11〜20');
  assert.equal(pageButtonText(3, 35), '31〜35');
  assert.equal(pageButtonText(1, 11), '11');
});

test('pagerState: 押せないときは理由を返す', () => {
  const first = pagerState(0, 35), middle = pagerState(1, 35), last = pagerState(3, 35), only = pagerState(0, 10);
  assert.equal(first.prevDisabled, true);
  assert.match(first.prevReason, /最初/);
  assert.equal(first.nextDisabled, false);
  assert.equal(first.nextReason, '');
  assert.equal(middle.prevDisabled || middle.nextDisabled, false);
  assert.equal(last.nextDisabled, true);
  assert.match(last.nextReason, /最後/);
  assert.equal(only.prevDisabled && only.nextDisabled, true);
  assert.ok(only.prevReason && only.nextReason);
});

test('pageJumpList: 3ページ以下は出さない。多いときは前後だけ', () => {
  assert.deepEqual(pageJumpList(1, 0), []);
  assert.deepEqual(pageJumpList(3, 0), []);
  assert.deepEqual(pageJumpList(4, 0), [0, 1, 2, 3]);
  assert.deepEqual(pageJumpList(10, 0), [0, 1, 2, 'gap', 9]);
  assert.deepEqual(pageJumpList(10, 5), [0, 'gap', 3, 4, 5, 6, 7, 'gap', 9]);
  assert.deepEqual(pageJumpList(10, 9), [0, 'gap', 7, 8, 9]);
  assert.deepEqual(pageJumpList(9, 4), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const huge = pageJumpList(300, 150);
  assert.ok(huge.length <= 9 && huge[0] === 0 && huge.at(-1) === 299);
});

test('pageJumpList: 今の試合があるページは、どれだけ離れても必ず選べる', () => {
  assert.deepEqual(pageJumpList(10, 7, 1), [0, 1, 'gap', 5, 6, 7, 8, 9]);
  assert.deepEqual(pageJumpList(10, 0, 5), [0, 1, 2, 'gap', 5, 'gap', 9]);
  for (let current = 0; current < 10; current++) for (let mine = 0; mine < 10; mine++) {
    const list = pageJumpList(10, current, mine);
    assert.ok(list.includes(mine), 'current ' + current + ' keeps ' + mine);
    assert.ok(list.filter((n) => n !== 'gap').length <= 9);
  }
  assert.deepEqual(pageJumpList(3, 0, 2), []);
});

test('musicState / musicLabel: 4つの状態と、大会で入場曲なし', () => {
  assert.equal(musicState(fighter('a', { musicUrl: 'https://music.apple.com/jp/album/x' }), true), 'link');
  assert.equal(musicState(fighter('a', { musicUrl: 'https://youtu.be/abc' }), true), 'link');
  assert.equal(musicState(fighter('a', { musicUrl: '' }), true), 'none');
  assert.equal(musicState(fighter('a', { musicUrl: '   ' }), true), 'none');
  assert.equal(musicState(fighter('a', { musicUrl: 'http://music.apple.com/x' }), true), 'broken');
  assert.equal(musicState(fighter('a', { musicUrl: 'javascript:alert(1)' }), true), 'broken');
  assert.equal(musicState(fighter('a', { musicUrl: 'https://example.com/x' }), true), 'broken');
  assert.equal(musicState(undefined, true), 'empty');
  assert.equal(musicState(fighter('a', { musicUrl: 'https://youtu.be/abc' }), false), 'off');
  assert.equal(musicLabel('link'), '♪ 曲を開く');
  assert.equal(musicLabel('none'), '⚠ 入場曲なし（曲を用意）');
  assert.equal(musicLabel('broken'), '⚠ 曲のリンクを確認');
  assert.notEqual(musicLabel('none'), musicLabel('broken'));
  assert.equal(musicLabel('off'), '');
  assert.equal(musicLabel('empty'), '');
});

test('buildRow: 契約は1試合ずつの画面と同じ決め方（体重の重い方 → クラス名 → 契約未入力）', () => {
  const byId = new Map([fighter('r', { weight: '60' }), fighter('u', { weight: '61.5kg' })].map((f) => [f.id, f]));
  const withWeights = buildRow(bout(0, { redId: 'r', blueId: 'u', className: 'フェザー', rule: 'ヘッドギア有' }), 0, byId, true, 0);
  assert.equal(withWeights.contract, '61.5kg契約');
  assert.equal(withWeights.rule, 'ヘッドギア有');
  assert.equal(withWeights.title, '第1試合');
  assert.equal(withWeights.isCurrent, true);

  const noWeights = new Map([fighter('r', { weight: '' }), fighter('u', { weight: '' })].map((f) => [f.id, f]));
  assert.equal(buildRow(bout(1, { redId: 'r', blueId: 'u', className: 'フェザー' }), 1, noWeights, true, 0).contract, 'フェザー');
  assert.equal(buildRow(bout(1, { redId: 'r', blueId: 'u' }), 1, noWeights, true, 0).contract, NO_CONTRACT);
  assert.equal(buildRow(bout(1, { redId: 'r', blueId: 'u' }), 1, noWeights, true, 0).isCurrent, false);
});

test('buildRow: 選手がいないとき「選手未選択」。名前が空なら別の言葉', () => {
  const byId = new Map([fighter('r', { name: '  ' })].map((f) => [f.id, f]));
  const row = buildRow(bout(2, { redId: 'r', blueId: 'ghost' }), 2, byId, true, 0);
  assert.equal(row.red.present, true);
  assert.equal(row.red.name, '名前未入力');
  assert.equal(row.blue.present, false);
  assert.equal(row.blue.name, MISSING_FIGHTER);
  assert.equal(row.blue.music, 'empty');
  assert.equal(row.blue.photoDataUrl, '');
  const blank = buildRow(bout(3, { redId: '', blueId: '' }), 3, byId, true, 0);
  assert.equal(blank.red.name, MISSING_FIGHTER);
  assert.equal(blank.contract, NO_CONTRACT);
});

test('buildRow: 赤・青のことばと、曲のリンクは安全なものだけ', () => {
  const byId = new Map([
    fighter('r', { musicUrl: 'https://music.apple.com/jp/album/x', photoDataUrl: 'data:image/png;base64,AAAA', gym: 'ジムA' }),
    fighter('u', { musicUrl: 'javascript:alert(1)' }),
  ].map((f) => [f.id, f]));
  const row = buildRow(bout(0, { redId: 'r', blueId: 'u' }), 0, byId, true, 5);
  assert.equal(row.red.label, '赤コーナー');
  assert.equal(row.blue.label, '青コーナー');
  assert.equal(row.red.musicUrl, 'https://music.apple.com/jp/album/x');
  assert.equal(row.red.photoDataUrl, 'data:image/png;base64,AAAA');
  assert.equal(row.red.gym, 'ジムA');
  assert.equal(row.blue.music, 'broken');
  assert.equal(row.blue.musicUrl, '');
  assert.match(row.openLabel, /^この試合を開く 第1試合 赤コーナー 架空r 対 青コーナー 架空u$/);
  const off = buildRow(bout(0, { redId: 'r', blueId: 'u' }), 0, byId, false, 5);
  assert.equal(off.red.music, 'off');
  assert.equal(off.red.musicUrl, '');
});

test('buildPageRows: 1・10・11・35・100 試合、1ページに10行まで・順番どおり・今の試合の印は1つだけ', () => {
  for (const [total, pages] of [[1, 1], [10, 1], [11, 2], [35, 4], [100, 10]] as const) {
    const data = many(total);
    assert.equal(pageCount(total), pages);
    const seen: number[] = [];
    for (let p = 0; p < pages; p++) {
      const rows = buildPageRows(data, p, true);
      assert.ok(rows.length >= 1 && rows.length <= 10, total + '試合 ' + p + 'ページ目: ' + rows.length + '行');
      seen.push(...rows.map((r) => r.index));
    }
    assert.deepEqual(seen, Array.from({ length: total }, (_, i) => i), total + '試合: 取りこぼし・重なりなし');
  }
  const data = { ...many(35), currentBout: 23 };
  const page = pageOfBout(data.currentBout, 35);
  assert.equal(page, 2);
  const rows = buildPageRows(data, page, true);
  assert.equal(rows.filter((r) => r.isCurrent).length, 1);
  assert.equal(rows.find((r) => r.isCurrent)?.title, '第24試合');
  assert.equal(buildPageRows(data, 0, true).filter((r) => r.isCurrent).length, 0);
});

test('buildPageRows: 0試合は空。入力のデータは書きかえない', () => {
  assert.deepEqual(buildPageRows(many(0), 0, true), []);
  assert.ok(EMPTY_LIST_MESSAGE.includes('まだ対戦カードがありません'));
  const data = many(12);
  const before = JSON.stringify(data);
  buildPageRows(data, 1, true);
  buildPageRows({ ...data, currentBout: 11 }, 1, false);
  assert.equal(JSON.stringify(data), before);
  assert.equal(data.currentBout, 0);
});

test('summarizeMusic: 「入場曲がまだの選手」は、試合に出る選手だけを1人ずつ数える', () => {
  const data = {
    fighters: [
      fighter('a', { musicUrl: 'https://youtu.be/abc' }), fighter('b', { musicUrl: '' }), fighter('c', { musicUrl: 'javascript:alert(1)' }),
      fighter('d', { musicUrl: '' }), fighter('e', { musicUrl: 'https://music.apple.com/jp/album/x' }), fighter('out', { musicUrl: '' }),
    ],
    bouts: [bout(0, { redId: 'a', blueId: 'b' }), bout(1, { redId: 'b', blueId: 'c' }), bout(2, { redId: 'e', blueId: 'a' }), bout(3, { redId: 'd', blueId: 'ghost' })],
  };
  const s = summarizeMusic(data, true);
  assert.deepEqual(s, { fighters: 3, none: 2, broken: 1, bouts: [0, 1, 3] });
  assert.deepEqual(summarizeMusic(data, false), { fighters: 0, none: 0, broken: 0, bouts: [] });
  assert.deepEqual(summarizeMusic({ fighters: [], bouts: [] }, true), { fighters: 0, none: 0, broken: 0, bouts: [] });
});

test('buildPageRows: 絞りこみ（indices）では、その試合だけを10行ずつ・順番どおりに並べる', () => {
  const data = many(35);
  const picked = [1, 4, 7, 12, 13, 20, 21, 22, 23, 24, 25, 30];
  const first = buildPageRows(data, 0, true, 10, picked);
  assert.deepEqual(first.map((r) => r.index), picked.slice(0, 10));
  assert.deepEqual(buildPageRows(data, 1, true, 10, picked).map((r) => r.index), [25, 30]);
  assert.deepEqual(buildPageRows(data, 0, true, 10, []).map((r) => r.index), []);
  assert.deepEqual(buildPageRows(data, 0, true, 10, [999, 3]).map((r) => r.index), [3]);
});

test('nowModel: 「いま：第8試合　赤 対 青」の材料と、今の試合があるページ', () => {
  const data = { ...many(35), currentBout: 7 };
  const now = nowModel(data)!;
  assert.equal(now.title, '第8試合');
  assert.equal(now.text, '第8試合　架空r7 対 架空u7');
  assert.equal(now.page, 0);
  assert.equal(nowModel({ ...data, currentBout: 23 })!.page, 2);
  assert.equal(nowModel(many(0)), null);
  const ghost = nowModel({ fighters: [], bouts: [bout(0)], currentBout: 0 })!;
  assert.equal(ghost.text, '第1試合　' + MISSING_FIGHTER + ' 対 ' + MISSING_FIGHTER);
});

test('parseBoutNumber: 「第 __ 試合へ」。半角・全角の数字だけ、1から全部の数まで', () => {
  assert.equal(parseBoutNumber('1', 35), 0);
  assert.equal(parseBoutNumber('35', 35), 34);
  assert.equal(parseBoutNumber('２３', 35), 22);
  assert.equal(parseBoutNumber(' 8 ', 35), 7);
  assert.equal(parseBoutNumber('第8試合', 35), 7);
  assert.equal(parseBoutNumber('0', 35), null);
  assert.equal(parseBoutNumber('36', 35), null);
  assert.equal(parseBoutNumber('', 35), null);
  assert.equal(parseBoutNumber('abc', 35), null);
  assert.equal(parseBoutNumber('-3', 35), null);
  assert.equal(parseBoutNumber('3.5', 35), null);
  assert.equal(parseBoutNumber('1', 0), null);
});

test('parseBoutNumber: 「12番」「12号」「12試合目」「12。」「１２，」も通す。小数・マイナス・大きすぎは通さない', () => {
  for (const text of ['12番', '12号', '12試合目', '第12番目', '12。', '12.', '１２，', ' １２ ', '12、']) assert.equal(parseBoutNumber(text, 35), 11, text);
  for (const text of ['3.5', '３．５', '-3', '1e1', '12人', '123456', '十二']) assert.equal(parseBoutNumber(text, 35), null, text);
});

test('boutNumberProblem: 原因別の短い言葉。どれも「1から35までの数字」を含む。入れられる入力は null', () => {
  assert.equal(boutNumberProblem('12', 35), null);
  assert.equal(boutNumberProblem('12番', 35), null);
  assert.equal(boutNumberProblem('', 35)?.kind, 'empty');
  assert.equal(boutNumberProblem('abc', 35)?.kind, 'text');
  assert.equal(boutNumberProblem('0', 35)?.kind, 'zero');
  assert.equal(boutNumberProblem('99', 35)?.kind, 'big');
  assert.equal(boutNumberProblem('9999999', 35)?.kind, 'big');
  for (const text of ['', 'abc', '0', '99']) assert.ok(boutNumberProblem(text, 35)!.message.includes('1から35までの数字'), text);
  assert.match(boutNumberProblem('99', 35)!.message, /35試合までです（入れた数字は99）/);
});

test('jumpDoneText: 見るだけで、いまの試合は変わらないと書く', () => {
  const text = jumpDoneText(22, 2, 7);
  assert.ok(text.includes('第23試合のところへ来ました（3ページ目）'));
  assert.ok(text.includes('見るだけ') && text.includes('第8試合 のまま'));
});

test('moveNotice: 動かした直後の言葉と、もどす／すすむボタンの名前', () => {
  assert.deepEqual(moveNotice('next', 6, 7), { text: '第7試合 → 第8試合に進みました', undoLabel: '第7試合にもどす' });
  assert.deepEqual(moveNotice('prev', 6, 5), { text: '第6試合にもどりました', undoLabel: '第7試合にすすむ' });
  assert.equal(moveNotice('list', 3, 5).undoLabel, '第4試合にもどす');
  assert.match(moveNotice('list', 3, 5).text, /^第6試合に変えました。まちがえたら右のボタン/);
  for (const via of ['next', 'list'] as const) assert.match(moveNotice(via, 1, 2).undoLabel, /^第\d+試合にもどす$/);
});

test('undoSecondsLeft: 10秒は大きい箱、そのあとは0（小さい1行）', () => {
  assert.equal(undoSecondsLeft(1000, 1000), 10);
  assert.equal(undoSecondsLeft(1000, 4500), 7);
  assert.equal(undoSecondsLeft(1000, 11000), 0);
  assert.equal(undoSecondsLeft(5000, 1000), 10);
});

test('isRepeatPress: 同じ向きのボタンが0.45秒以内に続いたときだけ（ダブルタップ）', () => {
  assert.equal(isRepeatPress(null, 'next', 1000), false);
  assert.equal(isRepeatPress({ dir: 'next', at: 1000 }, 'next', 1200), true);
  assert.equal(isRepeatPress({ dir: 'next', at: 1000 }, 'next', 1450), false);
  assert.equal(isRepeatPress({ dir: 'next', at: 1000 }, 'prev', 1100), false);
});

test('saveFailNotice: 保存できなかった／試合は進めていません、と、次に押すもの。どれも写真のことを2行目以降に書く', () => {
  const n = saveFailNotice('next', 2);
  assert.ok(n.text.startsWith('失敗：') && n.text.includes('保存できなかった') && n.text.includes('試合は進めていません'));
  assert.ok(n.more.includes('まだ第3試合のままです') && n.more.includes('次の試合 →'));
  assert.ok(n.tip.includes('写真'));
  assert.ok(saveFailNotice('prev', 2).more.includes('← 前の試合'));
  assert.ok(saveFailNotice('list', 2).text.includes('この行は開けませんでした'));
  assert.ok(saveFailNotice('undo', 2).text.includes('保存できなかった'));
});

test('filterNote / openWarning / nextHint', () => {
  assert.equal(filterNote(12, 120), '一部の試合だけ表示中です（120試合中 12試合）。');
  assert.equal(openWarning(5), '押すと、いまの試合が 第6試合 に変わります');
  assert.equal(nextHint(7, 35), '次は 第9試合');
  assert.equal(nextHint(34, 35), '');
});

test('buildRow: 赤と青が同じ選手・契約未入力の印', () => {
  const byId = new Map([fighter('r', { weight: '' })].map((f) => [f.id, f]));
  const same = buildRow(bout(0, { redId: 'r', blueId: 'r' }), 0, byId, true, 0);
  assert.equal(same.sameFighter, true);
  assert.equal(same.noContract, true);
  assert.equal(buildRow(bout(0, { redId: '', blueId: '' }), 0, byId, true, 0).sameFighter, false);
  assert.equal(buildRow(bout(0, { redId: 'r', blueId: 'x', className: 'ライト' }), 0, byId, true, 0).noContract, false);
});
