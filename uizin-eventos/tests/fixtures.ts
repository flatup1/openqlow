import type { Program } from '../core/types.ts';
import { parseProgram } from '../core/sheet.ts';

export const EVENT_CSV = [
  'key,value',
  'title,UIZIN 第1回',
  'venue,成田市中台体育館',
  'date,2026-11-03',
  'start_at,13:00',
  'hold_message,しばらくお待ちください',
].join('\n');

export const MATCHES_CSV = [
  'no,class,rule,rounds,round_seconds,break_seconds,red_name,red_team,red_record,red_comment,blue_name,blue_team,blue_record,blue_comment,note',
  '1,ライト級,アマチュアMMA,2,3:00,60,山田 太郎,FLAT UP GYM,2戦2勝,"必ず勝ちます",鈴木 次郎,テストジム,1戦1勝,"全力でいきます",',
  '2,フェザー級,キック,3,2:00,30,佐藤 三郎,FLAT UP GYM,初戦,"楽しみます",高橋 四郎,別ジム,3戦2勝,"落ち着いていきます",メインイベント',
].join('\n');

export const MUSIC_CSV = [
  'no,match_no,kind,title,artist,apple_music_url,youtube_url,seconds,note',
  '1,,opening,オープニング,テストアーティスト,https://music.apple.com/jp/album/x/1,,90,',
  '2,1,walkout_red,赤入場曲,テスト,,https://www.youtube.com/watch?v=aaaaaaaaaaa,60,',
  '3,1,walkout_blue,青入場曲,テスト,,,60,',
  '4,2,walkout_red,メイン入場,テスト,https://music.apple.com/jp/album/y/2,,0,',
].join('\n');

export function buildProgram(now = 1_700_000_000_000): Program {
  return parseProgram({ event: EVENT_CSV, matches: MATCHES_CSV, music: MUSIC_CSV }, now);
}
