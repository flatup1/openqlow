/**
 * 実際の「UIZIN 2026 大会エントリー」スプレッドシートで見つかった書き方を、
 * そのままテストに固定したもの。
 *
 * ここに並んでいるURLの形はすべて、2026-09-08 時点の実データに実在した。
 * 個人情報（メール・電話・保護者氏名）は一切入れない。選手名も入れない。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractUrl, isAppleMusicUrl, isDeclaredNoMusic, isYouTubeUrl, judgeCue, serviceName, summarizeMusic } from '../core/music.ts';
import { parseProgram } from '../core/sheet.ts';

/** 申込フォームの「入場曲URL（Apple Music推奨）」に実在した書き方 */
const REAL_APPLE = [
  'https://music.apple.com/jp/album/sicko-mode/1421241217?i=1421242781',
  'https://music.apple.com/jp/album/%E3%81%86%E3%81%A1%E3%82%89%E3%81%8C%E3%81%84%E3%81%84-single/1888175138',
  'https://music.apple.com/jp/song/monkey-wrench/334812033',
  'https://music.apple.com/jp/album/%D0%BA%D1%8B%D1%80%D0%B3%D1%8B%D0%B7%D0%BC%D1%8B%D0%BD-%D0%BC%D0%B5%D0%BD/1750040867?i=1750041031',
  'https://music.apple.com/jp/album/greatest-hits/725863059',
];

const REAL_YOUTUBE = [
  'https://youtu.be/865Pv7mHfbQ?si=GXCrnWm6-BTzj9yK',
  'https://youtu.be/749DIRUHhNY',
  'https://m.youtube.com/watch?v=_aKmEbpjW0E&pp=ygUq44OT44Kz44O8&ra=m',
];

/** Apple でも YouTube でもないサービスが貼られていた実例 */
const REAL_OTHER: Array<[string, string]> = [
  ['https://music.amazon.co.jp/albums/B0H5MQR972?trackAsin=B0H5MMPSFV&do=play', 'Amazon Music'],
  ['https://lin.ee/PMjV94E', 'LINE'],
  ['https://www.google.com/aclk?sa=L&ai=DChsSEwin&co=1&gclid=CjwKCAjw', 'Google の広告リンク'],
];

test('実データの Apple Music URL は、どの形でも緑になる', () => {
  for (const url of REAL_APPLE) {
    assert.equal(isAppleMusicUrl(url), true, url);
  }
});

test('実データの YouTube URL は、どの形でも黄になる（m. / youtu.be / クエリ付き）', () => {
  for (const url of REAL_YOUTUBE) {
    assert.equal(isYouTubeUrl(url), true, url);
  }
});

test('別サービスのリンクは赤にし、どのサービスかを名指しする', () => {
  for (const [url, name] of REAL_OTHER) {
    assert.equal(serviceName(url), name, url);
    assert.equal(isAppleMusicUrl(url), false);
    assert.equal(isYouTubeUrl(url), false);
  }
});

test('申込フォームの「入場曲」1列だけでも取り込める（Apple/YouTube を自動で振り分ける）', () => {
  // 実シートの列名は「入場曲」1つだけ。人間に手で2列へ分けさせない。
  const csv = [
    'no,kind,title,入場曲',
    '1,walkout_red,A選手 入場曲,' + REAL_APPLE[0],
    '2,walkout_red,B選手 入場曲,' + REAL_YOUTUBE[0],
    '3,walkout_red,C選手 入場曲,',
    '4,walkout_red,D選手 入場曲,' + REAL_OTHER[1][0],
  ].join('\n');
  const program = parseProgram({ event: '', matches: '', music: csv }, 0);
  assert.equal(program.cues.length, 4);
  assert.equal(program.cues[0].appleMusicUrl, REAL_APPLE[0]);
  assert.equal(program.cues[0].youtubeUrl, '');
  assert.equal(program.cues[1].youtubeUrl, REAL_YOUTUBE[0]);
  assert.equal(program.cues[1].appleMusicUrl, '');
  assert.equal(program.cues[3].otherUrl, REAL_OTHER[1][0]);

  const summary = summarizeMusic(program.cues, []);
  assert.equal(summary.red, 2, '未登録1件 + 別サービス1件');
});

test('「入場曲URL（Apple Music推奨）」という長い列名でも取り込める', () => {
  const csv = [
    'no,title,入場曲URL（Apple Music推奨）',
    '1,A選手 入場曲,' + REAL_APPLE[0],
  ].join('\n');
  const program = parseProgram({ event: '', matches: '', music: csv }, 0);
  assert.equal(program.cues[0].appleMusicUrl, REAL_APPLE[0]);
});

test('曲名とURLが同じセルに混ざっていてもURLを拾う', () => {
  // 実データにあった書き方: 「ターミネーター２ https://...」「捻くれ者https://...」「PROVANT(https://...)」
  assert.equal(
    extractUrl('ターミネーター２ https://music.apple.com/jp/album/x/1440895535?i=1440895540'),
    'https://music.apple.com/jp/album/x/1440895535?i=1440895540',
  );
  assert.equal(
    extractUrl('捻くれ者https://music.apple.com/jp/album/y/1831691123'),
    'https://music.apple.com/jp/album/y/1831691123',
  );
  assert.equal(
    extractUrl('PROVANT(https://music.apple.com/jp/album/z/1858500506?i=1858500507)'),
    'https://music.apple.com/jp/album/z/1858500506?i=1858500507',
  );
  assert.equal(extractUrl('曲名だけでURLなし'), '');
});

test('混在セルでも色が正しく出る（URLを拾えず全部赤、を起こさない）', () => {
  const csv = [
    'no,title,入場曲',
    '1,A選手 入場曲,ターミネーター２ ' + REAL_APPLE[0],
  ].join('\n');
  const program = parseProgram({ event: '', matches: '', music: csv }, 0);
  const verdict = judgeCue(program.cues[0], []);
  assert.equal(verdict.source, 'apple');
  assert.notEqual(verdict.color, 'red');
});

test('空欄（未確認）は赤、「なし」と明記されていれば灰', () => {
  assert.equal(isDeclaredNoMusic('なし'), true);
  assert.equal(isDeclaredNoMusic('無し'), true);
  assert.equal(isDeclaredNoMusic('会場BGM'), true);
  assert.equal(isDeclaredNoMusic('-'), true);
  assert.equal(isDeclaredNoMusic(''), false, '空欄は「確認できていない」なので、なし扱いにしない');
  assert.equal(isDeclaredNoMusic('未定'), false);

  const csv = ['no,title,入場曲', '1,A選手,', '2,B選手,なし'].join('\n');
  const program = parseProgram({ event: '', matches: '', music: csv }, 0);
  const summary = summarizeMusic(program.cues, []);
  assert.equal(summary.red, 1, '空欄だけが赤');
  assert.equal(summary.gray, 1, '「なし」は対象外');
  assert.equal(summary.ready, false, '空欄が残っている間は開始できない');
});

test('実データ55件を取り込むと、赤が「本当に直すべきもの」だけになる', () => {
  // 実データの内訳: Apple 31 / YouTube 7 / 別サービス 3 / 空欄 14
  const rows = ['no,kind,title,入場曲'];
  let n = 0;
  for (const url of REAL_APPLE) rows.push(++n + ',walkout_red,曲' + n + ',' + url);
  for (const url of REAL_YOUTUBE) rows.push(++n + ',walkout_red,曲' + n + ',' + url);
  for (const [url] of REAL_OTHER) rows.push(++n + ',walkout_red,曲' + n + ',' + url);
  for (let i = 0; i < 4; i++) rows.push(++n + ',walkout_red,曲' + n + ',');

  const program = parseProgram({ event: '', matches: '', music: rows.join('\n') }, 0);
  const summary = summarizeMusic(program.cues, []);
  assert.equal(summary.total, n);
  assert.equal(summary.red, REAL_OTHER.length + 4, '別サービス + 空欄 だけが赤');
  assert.equal(summary.yellow, REAL_APPLE.length + REAL_YOUTUBE.length, '尺が未設定なので黄（進めてよい）');
  assert.equal(summary.ready, false);
});

test('尺を入れると Apple は緑になる', () => {
  const csv = ['no,title,入場曲,seconds', '1,A選手,' + REAL_APPLE[0] + ',60'].join('\n');
  const program = parseProgram({ event: '', matches: '', music: csv }, 0);
  const summary = summarizeMusic(program.cues, []);
  assert.equal(summary.green, 1);
  assert.equal(summary.ready, true);
});

test('前日チェックは「直すべき順」に並ぶ（赤が黄に埋もれない）', async () => {
  const { sortVerdictsForReview } = await import('../core/music.ts');
  const rows = ['no,title,入場曲,seconds'];
  // 黄を先に、赤を後ろに置いた番組表（実データはこの並びになりやすい）
  for (let i = 1; i <= 5; i++) rows.push(i + ',黄' + i + ',' + REAL_APPLE[0] + ',');
  rows.push('6,緑,' + REAL_APPLE[1] + ',60');
  rows.push('7,灰,なし,');
  rows.push('8,赤,,');
  const program = parseProgram({ event: '', matches: '', music: rows.join('\n') }, 0);
  const sorted = sortVerdictsForReview(summarizeMusic(program.cues, []).verdicts);
  assert.deepEqual(
    sorted.map((v) => v.color),
    ['red', 'yellow', 'yellow', 'yellow', 'yellow', 'yellow', 'gray', 'green'],
  );
  assert.equal(sorted[0].cueNo, 8, '赤がいちばん上に来る');
});
