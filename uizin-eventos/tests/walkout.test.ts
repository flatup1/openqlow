/**
 * かんたん進行画面（/live/）の中身。
 *
 * ここで守っているのは「作業指示書 §4 100点の判定基準」そのもの。
 * 画面の見た目は変わっても、この判定だけは変えない。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cueForFighter,
  isAudioFileUrl,
  liveNextAction,
  livePrevAction,
  playPlan,
  youtubeEmbedUrl,
  youtubeVideoId,
} from '../core/walkout.ts';
import { initialState, reduce, currentMatch } from '../core/state.ts';
import { parseProgram } from '../core/sheet.ts';
import { buildProgram, EVENT_CSV, MATCHES_CSV } from './fixtures.ts';
import type { EventState, Program } from '../core/types.ts';

const NOW = 1_700_000_000_000;

function withMusic(musicCsv: string): Program {
  return parseProgram({ event: EVENT_CSV, matches: MATCHES_CSV, music: musicCsv }, NOW);
}

/** 「次へ」をn回押した状態 */
function advance(program: Program, times: number): EventState {
  let state = initialState(NOW, program);
  for (let i = 0; i < times; i += 1) {
    state = reduce(state, program, { type: 'next' }, NOW).state;
  }
  return state;
}

// --- 曲のひもづけ -----------------------------------------------------------

test('match_no と kind が入っていれば、それで入場曲を引く', () => {
  const program = buildProgram(NOW);
  const match = program.matches[0];
  assert.equal(cueForFighter(program, match, 'red')?.title, '赤入場曲');
  assert.equal(cueForFighter(program, match, 'blue')?.title, '青入場曲');
});

test('match_no が空でも、選手名で入場曲を引ける（申込そのままの進行表への保険）', () => {
  const program = withMusic(
    [
      'no,match_no,kind,title,artist,music_url,seconds,note',
      '1,,,テーマA,X,https://www.youtube.com/watch?v=bbbbbbbbbbb,0,選手：山田 太郎',
      '2,,,テーマB,Y,https://music.apple.com/jp/album/z/3,0,選手：鈴木次郎',
    ].join('\n'),
  );
  const match = program.matches[0];
  // 備考に名前がある
  assert.equal(cueForFighter(program, match, 'red')?.title, 'テーマA');
  // 空白のゆらぎ（「鈴木 次郎」と「鈴木次郎」）を吸収する
  assert.equal(cueForFighter(program, match, 'blue')?.title, 'テーマB');
});

test('曲が1件も無ければ null。ここで落ちない', () => {
  const program = withMusic('no,title\n');
  assert.equal(cueForFighter(program, program.matches[0], 'red'), null);
  assert.equal(cueForFighter(program, null, 'red'), null);
});

// --- 再生の3段構え ----------------------------------------------------------

test('YouTubeの動画IDは、どの書き方でも取り出せる', () => {
  assert.equal(youtubeVideoId('https://youtu.be/abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=abcdefghijk&t=10'), 'abcdefghijk');
  assert.equal(youtubeVideoId('https://www.youtube.com/embed/abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeVideoId('https://music.apple.com/jp/album/x/1'), '');
});

test('埋め込みURLには autoplay が付く（押した瞬間に鳴ってほしい）', () => {
  const url = youtubeEmbedUrl('https://youtu.be/abcdefghijk');
  assert.ok(url.includes('autoplay=1'), url);
  assert.ok(url.includes('abcdefghijk'), url);
});

test('音源ファイルの直リンクが最優先（いちばん確実に鳴る）', () => {
  assert.ok(isAudioFileUrl('https://example.com/a.mp3'));
  assert.ok(isAudioFileUrl('https://example.com/a.m4a?v=2'));
  assert.ok(!isAudioFileUrl('https://youtu.be/abcdefghijk'));

  const program = withMusic(
    [
      'no,match_no,kind,title,artist,apple_music_url,youtube_url,seconds,note',
      '1,1,walkout_red,直リンク,X,https://example.com/a.mp3,https://youtu.be/abcdefghijk,0,',
    ].join('\n'),
  );
  const plan = playPlan(cueForFighter(program, program.matches[0], 'red'));
  assert.equal(plan.kind, 'audio');
});

test('YouTube しか無ければ、画面の中で鳴らす', () => {
  const program = withMusic(
    [
      'no,match_no,kind,title,artist,apple_music_url,youtube_url,seconds,note',
      '1,1,walkout_red,YT,X,,https://youtu.be/abcdefghijk,0,',
    ].join('\n'),
  );
  const plan = playPlan(cueForFighter(program, program.matches[0], 'red'));
  assert.equal(plan.kind, 'youtube');
  assert.ok(plan.label.startsWith('▶'));
});

test('Apple Music だけのときは「開く」と正直に書く（ブラウザからは鳴らせない）', () => {
  const program = buildProgram(NOW);
  const plan = playPlan(cueForFighter(program, program.matches[1], 'red'));
  assert.equal(plan.kind, 'open');
  assert.ok(plan.label.includes('Apple Music'), plan.label);
  assert.ok(!plan.label.includes('▶'), '押せば鳴ると誤解させない');
});

test('曲が無いときはボタンを出さないための none を返す', () => {
  assert.equal(playPlan(null).kind, 'none');
});

// --- 「次の試合へ」 ---------------------------------------------------------

test('まだ始まっていないときは、第1試合を飛ばさない', () => {
  const program = buildProgram(NOW);
  const action = liveNextAction(program, initialState(NOW, program));
  assert.equal(action.kind, 'start');
  assert.ok(action.label.includes('第1試合'), action.label);
  assert.deepEqual(action.kind === 'start' ? action.command : null, { type: 'jump_match', matchNo: 1 });
});

test('1回押したら次の「試合」に行く（ラウンドに行くのではない）', () => {
  const program = buildProgram(NOW);
  // 第1試合の試合中まで進める
  const state = advance(program, 3);
  assert.equal(currentMatch(program, state)?.no, 1);

  const action = liveNextAction(program, state);
  assert.equal(action.kind, 'next');
  assert.ok(action.label.includes('第2試合'), action.label);

  const after = reduce(state, program, action.kind === 'next' ? action.command : { type: 'next' }, NOW).state;
  assert.equal(currentMatch(program, after)?.no, 2, '1回押せば必ず次の試合になる');
  assert.equal(after.phase, 'walkout', '次の試合は入場から始まる');
});

test('最後の試合では、押せるボタンを出さない', () => {
  const program = buildProgram(NOW);
  let state = initialState(NOW, program);
  state = reduce(state, program, { type: 'jump_match', matchNo: 2 }, NOW).state;
  const action = liveNextAction(program, state);
  assert.equal(action.kind, 'end');
});

test('停止中は進められないことが、ボタンの文字で分かる', () => {
  const program = buildProgram(NOW);
  let state = advance(program, 1);
  state = reduce(state, program, { type: 'hold' }, NOW).state;
  const action = liveNextAction(program, state);
  assert.equal(action.kind, 'hold');
});

test('曲が1件も無くても、試合は次へ進める（音が鳴らなくても大会は止めない）', () => {
  const program = withMusic('no,title\n');
  const action = liveNextAction(program, advance(program, 1));
  assert.equal(action.kind, 'next');
});

test('試合が0件なら、押せるボタンを出さずに理由を出す', () => {
  const program = parseProgram({ event: EVENT_CSV, matches: 'no,red_name,blue_name\n', music: 'no,title\n' }, NOW);
  const action = liveNextAction(program, initialState(NOW, program));
  assert.equal(action.kind, 'end');
  assert.ok(action.label.includes('試合'), action.label);
});

// --- 画面そのものの約束（指示書 §4 B/C） ------------------------------------

test('/live/ は、初めての人が押し間違えない作りになっている', () => {
  const src = readFileSync(new URL('../app/live/page.tsx', import.meta.url), 'utf8');

  // C1: 指1本で押せる大きさ
  assert.ok(src.includes('min-h-[88px]'), 'ボタンは最低88px四方');

  // B1: 進行中に置くボタンは ▶赤 / ▶青 / 次の試合 / ←前の試合 の4つだけ。
  //     「戻る」は発注者の指示（2026-09-20）で足した。進めすぎを直せないと、かえって大会が止まる。
  //     元に戻す・ラウンド操作・取り込み直し・停止は /op/ の担当（ここに増やさない）
  for (const forbidden of ['sendUndo', 'reloadProgram', 'checkMusic', "type: 'hold'", "type: 'round_"]) {
    assert.ok(!src.includes(forbidden), forbidden + ' を /live/ に置かない');
  }

  // 設定は、ふだんロックしてある（合言葉が消えると進行そのものが止まる）
  assert.ok(src.includes('settingsLock.ts'), '設定ロックを通していること');
  assert.ok(src.includes("canRun('change_key'"), '合言葉の変更はロックの判定を通す');

  // 明るい配色は、この画面だけに閉じる（/screen/ と /mix/ は暗いまま）
  assert.ok(src.includes("data-theme"), '配色の切り替えはこの画面の中だけで行う');

  // A1: 写真が読めなくても対戦カードは出す
  assert.ok(src.includes('onError'), '写真が読めなかったときの逃げ道');
});

// --- 「← 前の試合」ボタン（発注者の指示 2026-09-20） -------------------------

test('まだ始まっていないときは、戻るボタンを出さない', () => {
  const program = buildProgram(NOW);
  const back = livePrevAction(program, initialState(NOW, program));
  assert.equal(back.kind, 'none');
  assert.ok(back.label.includes('まだ'), back.label);
});

test('第1試合にいるときは、戻り先が無いことを文字で出す', () => {
  const program = buildProgram(NOW);
  const state = reduce(initialState(NOW, program), program, { type: 'jump_match', matchNo: 1 }, NOW).state;
  const back = livePrevAction(program, state);
  assert.equal(back.kind, 'none');
  assert.ok(back.label.includes('最初'), back.label);
});

test('第2試合にいるときは、1回で第1試合へ戻れる', () => {
  const program = buildProgram(NOW);
  const state = reduce(initialState(NOW, program), program, { type: 'jump_match', matchNo: 2 }, NOW).state;
  assert.equal(currentMatch(program, state)?.no, 2);

  const back = livePrevAction(program, state);
  assert.equal(back.kind, 'prev');
  if (back.kind !== 'prev') return;
  assert.deepEqual(back.command, { type: 'jump_match', matchNo: 1 });
  assert.ok(back.label.includes('第1試合'), back.label);

  // ボタンの文字どおり、押したら第1試合に戻る（文字と動きを一致させる）
  const moved = reduce(state, program, back.command, NOW).state;
  assert.equal(currentMatch(program, moved)?.no, 1);
});

test('停止中は、戻るボタンを押せるように見せない', () => {
  const program = buildProgram(NOW);
  const jumped = reduce(initialState(NOW, program), program, { type: 'jump_match', matchNo: 2 }, NOW).state;
  const held = reduce(jumped, program, { type: 'hold', message: '中断' }, NOW).state;
  const back = livePrevAction(program, held);
  assert.equal(back.kind, 'none');
  assert.ok(back.label.includes('止ま'), back.label);
});

test('試合が0件なら、戻るボタンを出さずに理由を出す', () => {
  const program = parseProgram({ event: EVENT_CSV, matches: 'no,red_name,blue_name\n', music: 'no,title\n' }, NOW);
  const back = livePrevAction(program, initialState(NOW, program));
  assert.equal(back.kind, 'none');
  assert.ok(back.label.includes('試合'), back.label);
});

test('前へ戻ってから次へ進めば、同じ試合に戻ってくる（往復して迷子にならない）', () => {
  const program = buildProgram(NOW);
  const atTwo = reduce(initialState(NOW, program), program, { type: 'jump_match', matchNo: 2 }, NOW).state;

  const back = livePrevAction(program, atTwo);
  assert.equal(back.kind, 'prev');
  if (back.kind !== 'prev') return;
  const atOne = reduce(atTwo, program, back.command, NOW).state;

  const forward = liveNextAction(program, atOne);
  assert.equal(forward.kind, 'next');
  if (forward.kind !== 'next') return;
  const again = reduce(atOne, program, forward.command, NOW).state;
  assert.equal(currentMatch(program, again)?.no, 2);
});
