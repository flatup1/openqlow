import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAppleMusicUrl, isYouTubeUrl, judgeCue, summarizeMusic, urlsToVerify } from '../core/music.ts';
import type { LinkCheck, MusicCue } from '../core/types.ts';
import { buildProgram } from './fixtures.ts';

function cue(over: Partial<MusicCue>): MusicCue {
  return {
    no: 1,
    matchNo: null,
    kind: 'other',
    title: 'テスト曲',
    artist: '',
    appleMusicUrl: '',
    youtubeUrl: '',
    otherUrl: '',
    seconds: 60,
    note: '',
    ...over,
  };
}

test('Apple Music があれば緑（第一優先）', () => {
  const v = judgeCue(cue({ appleMusicUrl: 'https://music.apple.com/jp/album/x/1' }), []);
  assert.equal(v.color, 'green');
  assert.equal(v.source, 'apple');
});

test('Apple Music が無く YouTube だけなら黄（第二優先）', () => {
  const v = judgeCue(cue({ youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk' }), []);
  assert.equal(v.color, 'yellow');
  assert.equal(v.source, 'youtube');
});

test('両方あるときは Apple Music を使う', () => {
  const v = judgeCue(
    cue({
      appleMusicUrl: 'https://music.apple.com/jp/album/x/1',
      youtubeUrl: 'https://youtu.be/abcdefghijk',
    }),
    [],
  );
  assert.equal(v.source, 'apple');
  assert.equal(v.playUrl, 'https://music.apple.com/jp/album/x/1');
});

test('URLが1つも無ければ赤', () => {
  const v = judgeCue(cue({}), []);
  assert.equal(v.color, 'red');
  assert.equal(v.status, 'missing');
});

test('URLの形が壊れていたら赤', () => {
  assert.equal(judgeCue(cue({ appleMusicUrl: 'あとで貼る' }), []).color, 'red');
  assert.equal(judgeCue(cue({ appleMusicUrl: 'https://example.com/song' }), []).color, 'red');
  assert.equal(judgeCue(cue({ youtubeUrl: 'https://example.com/v' }), []).color, 'red');
});

test('リンク切れを検出したら赤（形が正しくても赤）', () => {
  const url = 'https://music.apple.com/jp/album/x/1';
  const links: LinkCheck[] = [{ url, alive: false, httpStatus: 404, checkedAt: 0, note: '' }];
  const v = judgeCue(cue({ appleMusicUrl: url }), links);
  assert.equal(v.color, 'red');
  assert.equal(v.status, 'dead');
  assert.match(v.reason, /リンク切れ/);
});

test('確認できなかったリンクは赤にしない（当日の通信不良で赤を増やさない）', () => {
  const url = 'https://music.apple.com/jp/album/x/1';
  const links: LinkCheck[] = [{ url, alive: null, httpStatus: null, checkedAt: 0, note: 'タイムアウト' }];
  assert.equal(judgeCue(cue({ appleMusicUrl: url }), links).color, 'green');
});

test('尺（秒数）未設定は黄（再生はできるので赤にはしない）', () => {
  const v = judgeCue(cue({ appleMusicUrl: 'https://music.apple.com/jp/album/x/1', seconds: 0 }), []);
  assert.equal(v.color, 'yellow');
  assert.equal(v.status, 'no_seconds');
});

test('URLの形の判定', () => {
  assert.equal(isAppleMusicUrl('https://music.apple.com/jp/album/abc/123?i=456'), true);
  assert.equal(isAppleMusicUrl('http://music.apple.com/jp/album/abc/123'), false);
  assert.equal(isAppleMusicUrl('https://open.spotify.com/track/x'), false);
  assert.equal(isYouTubeUrl('https://www.youtube.com/watch?v=abcdefghijk'), true);
  assert.equal(isYouTubeUrl('https://youtu.be/abcdefghijk'), true);
  assert.equal(isYouTubeUrl('https://music.youtube.com/watch?v=abcdefghijk'), true);
  assert.equal(isYouTubeUrl('https://youtube.com/'), false);
});

test('番組表全体を集計して、赤がゼロかどうかを出す', () => {
  const program = buildProgram();
  const summary = summarizeMusic(program.cues, []);
  assert.equal(summary.total, 4);
  assert.equal(summary.green, 1, 'Apple のみ = 緑');
  assert.equal(summary.yellow, 2, 'YouTube のみ + 尺なし = 黄');
  assert.equal(summary.red, 1, '未登録 = 赤');
  assert.equal(summary.ready, false, '赤が残っている間は開始できない');
});

test('赤をゼロにすると開始できる状態になる', () => {
  const program = buildProgram();
  const fixed = program.cues.map((c) =>
    c.no === 3 ? { ...c, appleMusicUrl: 'https://music.apple.com/jp/album/z/3' } : c,
  );
  assert.equal(summarizeMusic(fixed, []).ready, true);
});

test('到達確認をかけるURLは、実際に押すURLだけ（重複なし）', () => {
  const program = buildProgram();
  const urls = urlsToVerify(program.cues);
  assert.deepEqual(urls, [
    'https://music.apple.com/jp/album/x/1',
    'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    'https://music.apple.com/jp/album/y/2',
  ]);
});
