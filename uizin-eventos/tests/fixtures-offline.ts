/**
 * オフライン進行台本を作るとき用の、架空データ。
 *
 * ここに実在の選手名・連絡先を書かないこと。
 * 本物の進行表は選手名と意気込みが入っているので、テスト入力に使ってはいけない。
 *
 * わざと「壊れやすい形」を混ぜてある:
 *   - 意気込みが 300 文字（省略せずに全部出せるか）
 *   - 意気込みが空（欄が崩れないか）
 *   - 入場曲が未登録（赤）／別サービス（赤）／YouTubeのみ（黄）／尺つき（緑）
 *   - 所属・戦績が空
 *   - 12試合（1画面に収まらない数）
 */
import type { Program } from '../core/types.ts';
import { parseProgram } from '../core/sheet.ts';

const LONG_COMMENT =
  'この日のために半年間ずっと走り込みをしてきました。' +
  '朝は誰よりも早くジムに入り、夜は最後まで残ってサンドバッグを叩き続けました。' +
  '家族も仲間も、みんなが支えてくれました。応援してくれたすべての人に、勝つ姿で応えたいです。' +
  '相手がどんなに強くても、最後の一秒まで絶対に下がりません。全部出し切ります。見ていてください。' +
  '去年の大会では一回戦で負けて、悔しくて眠れない夜が続きました。' +
  'あのとき流した涙を、今日ここで笑顔に変えます。' +
  '同じジムで一緒に汗を流してきた仲間の分も背負って、リングに上がります。' +
  '技術 も体力も、去年の自分とは比べものにならないくらい積み上げてきました。応援よろしくお願いします。';

const EVENT_CSV = [
  'key,value',
  'title,UIZIN 2026（架空データ）',
  'venue,テスト体育館',
  'date,2026-09-23',
  'start_at,13:00',
  'hold_message,しばらくお待ちください',
].join('\n');

type Row = {
  red: string; redTeam: string; redRec: string; redCom: string;
  blue: string; blueTeam: string; blueRec: string; blueCom: string;
};

const ROWS: Row[] = [
  { red: 'テスト 一郎', redTeam: 'FLAT UP GYM', redRec: '2戦2勝', redCom: LONG_COMMENT,
    blue: 'テスト 二郎', blueTeam: 'サンプルジム', blueRec: '1戦1勝', blueCom: '全力でいきます' },
  { red: 'テスト 三郎', redTeam: 'FLAT UP GYM', redRec: '初戦', redCom: '',
    blue: 'テスト 四郎', blueTeam: '', blueRec: '', blueCom: LONG_COMMENT },
  { red: 'テスト 五郎', redTeam: 'サンプルジム', redRec: '3戦2勝', redCom: '落ち着いていきます',
    blue: 'テスト 六郎', blueTeam: 'FLAT UP GYM', blueRec: '初戦', blueCom: '楽しみます' },
];

function matchRow(no: number): string {
  const r = ROWS[(no - 1) % ROWS.length];
  const cls = no % 2 === 0 ? 'フェザー級' : 'ライト級';
  const rule = no % 3 === 0 ? 'キック' : 'アマチュアMMA';
  const note = no === 12 ? 'メインイベント' : '';
  return [
    no, cls, rule, 2, '2:00', 60,
    `${r.red}${no}`, r.redTeam, r.redRec, `"${r.redCom}"`,
    `${r.blue}${no}`, r.blueTeam, r.blueRec, `"${r.blueCom}"`,
    note,
  ].join(',');
}

const MATCHES_CSV = [
  'no,class,rule,rounds,round_seconds,break_seconds,red_name,red_team,red_record,red_comment,blue_name,blue_team,blue_record,blue_comment,note',
  ...Array.from({ length: 12 }, (_, i) => matchRow(i + 1)),
].join('\n');

/** 1行あたり: 緑(尺つきApple) / 黄(YouTubeのみ) / 赤(未登録) / 赤(別サービス) が混ざる */
function musicRow(no: number, matchNo: number, kind: string): string {
  const pattern = no % 4;
  const url =
    pattern === 0 ? 'https://music.apple.com/jp/album/sample/100?i=1' :
    pattern === 1 ? 'https://www.youtube.com/watch?v=aaaaaaaaaaa' :
    pattern === 2 ? '' :
    'https://music.amazon.co.jp/albums/BSAMPLE';
  const seconds = pattern === 0 ? 90 : '';
  return [no, matchNo, kind, `テスト曲${no}`, 'テストアーティスト', '', '', url, seconds, ''].join(',');
}

const MUSIC_CSV = [
  'no,match_no,kind,title,artist,apple_music_url,youtube_url,入場曲,seconds,note',
  '1,,opening,オープニング,テストアーティスト,,,https://music.apple.com/jp/album/op/1,90,',
  ...Array.from({ length: 24 }, (_, i) => {
    const no = i + 2;
    const matchNo = Math.floor(i / 2) + 1;
    return musicRow(no, matchNo, i % 2 === 0 ? 'walkout_red' : 'walkout_blue');
  }),
].join('\n');

export const OFFLINE_CSV = { event: EVENT_CSV, matches: MATCHES_CSV, music: MUSIC_CSV };

export function buildOfflineProgram(now = 1_700_000_000_000): Program {
  return parseProgram(OFFLINE_CSV, now);
}
