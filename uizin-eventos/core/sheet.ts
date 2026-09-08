/**
 * Google スプレッドシート（v1 唯一のCMS）→ 番組表 Program への変換。
 *
 * ネットワークは触らない。CSV文字列を受け取って組み立てるだけ。
 * こうしておくと、取り込みの正しさをオフラインでテストできる。
 */

import type { CueKind, EventMeta, Match, MusicCue, Program } from './types.ts';
import { fingerprint, parseSeconds, pick, pickNumber, toRows } from './csv.ts';
import { extractUrl, isAppleMusicUrl, isYouTubeUrl } from './music.ts';
import type { Row } from './csv.ts';

export type SheetCsv = {
  /** event シート（key,value） */
  event: string;
  /** matches シート */
  matches: string;
  /** music シート */
  music: string;
};

/** Google スプレッドシートの1シートをCSVで取り出すURL */
export function sheetCsvUrl(sheetId: string, sheetName: string): string {
  return (
    'https://docs.google.com/spreadsheets/d/' +
    encodeURIComponent(sheetId) +
    '/gviz/tq?tqx=out:csv&sheet=' +
    encodeURIComponent(sheetName)
  );
}

const DEFAULT_META: EventMeta = {
  title: 'UIZIN',
  venue: '',
  date: '',
  startAt: '',
  holdMessage: 'しばらくお待ちください',
};

function parseMeta(csv: string, warnings: string[]): EventMeta {
  const rows = toRows(csv);
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = pick(row, 'key', '項目', 'name');
    const value = pick(row, 'value', '値', 'content');
    if (key) map.set(key.toLowerCase(), value);
  }
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const v = map.get(k.toLowerCase());
      if (v) return v;
    }
    return '';
  };
  const meta: EventMeta = {
    title: get('title', '大会名') || DEFAULT_META.title,
    venue: get('venue', '会場'),
    date: get('date', '開催日'),
    startAt: get('start_at', 'start', '開始時刻'),
    holdMessage: get('hold_message', '停止文言') || DEFAULT_META.holdMessage,
  };
  if (rows.length === 0) warnings.push('event シートが空です。大会名は既定値を使います。');
  return meta;
}

function fighterFrom(row: Row, side: 'red' | 'blue'): Match['red'] {
  const jp = side === 'red' ? '赤' : '青';
  return {
    name: pick(row, side + '_name', jp + '_名前', jp + '_選手名', jp + 'コーナー'),
    team: pick(row, side + '_team', jp + '_所属', jp + '_チーム'),
    record: pick(row, side + '_record', jp + '_戦績', jp + '_プロフィール'),
    comment: pick(row, side + '_comment', jp + '_意気込み', jp + '_コメント'),
  };
}

const CUE_KINDS: CueKind[] = ['opening', 'walkout_red', 'walkout_blue', 'interval', 'result', 'ending', 'other'];

function parseCueKind(raw: string): CueKind {
  const v = raw.trim().toLowerCase();
  if ((CUE_KINDS as string[]).includes(v)) return v as CueKind;
  if (v.includes('オープニング') || v.includes('開会')) return 'opening';
  if (v.includes('赤') && v.includes('入場')) return 'walkout_red';
  if (v.includes('青') && v.includes('入場')) return 'walkout_blue';
  if (v.includes('インターバル') || v.includes('幕間') || v.includes('休憩')) return 'interval';
  if (v.includes('結果') || v.includes('判定')) return 'result';
  if (v.includes('エンディング') || v.includes('閉会')) return 'ending';
  return 'other';
}

export function cueKindLabel(kind: CueKind): string {
  if (kind === 'opening') return 'オープニング';
  if (kind === 'walkout_red') return '赤コーナー入場';
  if (kind === 'walkout_blue') return '青コーナー入場';
  if (kind === 'interval') return '幕間';
  if (kind === 'result') return '結果発表';
  if (kind === 'ending') return 'エンディング';
  return 'その他';
}

function parseMatches(csv: string, warnings: string[]): Match[] {
  const rows = toRows(csv);
  const matches: Match[] = [];
  const seen = new Set<number>();

  rows.forEach((row, index) => {
    const no = pickNumber(row, index + 1, 'no', '番号', '試合番号', '試合no');
    const red = fighterFrom(row, 'red');
    const blue = fighterFrom(row, 'blue');
    if (red.name === '' && blue.name === '') {
      warnings.push((index + 2) + '行目: 赤・青とも選手名が空のため取り込みませんでした。');
      return;
    }
    if (seen.has(no)) {
      warnings.push('試合番号 ' + no + ' が重複しています。番組表を直してください。');
    }
    seen.add(no);

    const rounds = Math.max(1, Math.round(pickNumber(row, 2, 'rounds', 'ラウンド数', 'r数')));
    const roundSeconds = Math.max(10, parseSeconds(pick(row, 'round_seconds', 'ラウンド秒', '1r秒', 'ラウンド時間'), 180));
    const breakSeconds = Math.max(0, parseSeconds(pick(row, 'break_seconds', 'インターバル秒', 'インターバル', '休憩秒'), 60));

    if (red.name === '' || blue.name === '') {
      warnings.push('試合番号 ' + no + ': 片方の選手名が空です。');
    }
    if (red.comment === '' || blue.comment === '') {
      warnings.push('試合番号 ' + no + ': 意気込みが未入力の選手がいます。');
    }

    matches.push({
      no,
      className: pick(row, 'class', 'クラス', '階級', 'カテゴリ'),
      rule: pick(row, 'rule', 'ルール'),
      rounds,
      roundSeconds,
      breakSeconds,
      red,
      blue,
      note: pick(row, 'note', '備考', 'メモ'),
    });
  });

  matches.sort((a, b) => a.no - b.no);
  if (matches.length === 0) warnings.push('matches シートに試合が1件もありません。');
  return matches;
}

/**
 * 音源URLの振り分け。
 *
 * 申込フォームは「入場曲URL」という1つの欄しか持たない。
 * Apple用・YouTube用に人間が手で分けさせると、55人ぶんの手作業が発生して大会準備が止まる。
 * そこで、1列で来たURLはここで自動的に振り分ける。
 */
function routeMusicUrls(apple: string, youtube: string, combined: string): {
  appleMusicUrl: string;
  youtubeUrl: string;
  otherUrl: string;
} {
  const appleUrl = extractUrl(apple) || apple.trim();
  const youtubeUrl = extractUrl(youtube) || youtube.trim();
  if (appleUrl !== '' || youtubeUrl !== '') {
    return { appleMusicUrl: appleUrl, youtubeUrl, otherUrl: '' };
  }

  const one = extractUrl(combined);
  if (one === '') {
    // URLらしきものが無い。文字が書いてあるなら、それはそのまま Apple 欄に入れて
    // 「URLになっていません」と赤で言わせる（黙って捨てない）。
    return { appleMusicUrl: combined.trim(), youtubeUrl: '', otherUrl: '' };
  }
  if (isAppleMusicUrl(one)) return { appleMusicUrl: one, youtubeUrl: '', otherUrl: '' };
  if (isYouTubeUrl(one)) return { appleMusicUrl: '', youtubeUrl: one, otherUrl: '' };
  return { appleMusicUrl: '', youtubeUrl: '', otherUrl: one };
}

function parseCues(csv: string, warnings: string[]): MusicCue[] {
  const rows = toRows(csv);
  const cues: MusicCue[] = [];

  rows.forEach((row, index) => {
    const title = pick(row, 'title', '曲名', 'タイトル');
    const apple = pick(row, 'apple_music_url', 'applemusic', 'apple', 'apple_music');
    const youtube = pick(row, 'youtube_url', 'youtube', 'yt');
    // 申込フォームそのままの1列（Apple/YouTubeが混ざって入ってくる）
    const combined = pick(
      row,
      'music_url',
      'url',
      '入場曲',
      '入場曲url',
      '入場曲url（apple_music推奨）',
      '入場曲url(apple_music推奨)',
      '曲url',
      '音源url',
    );
    if (title === '' && apple === '' && youtube === '' && combined === '') return;

    const matchNoRaw = pick(row, 'match_no', '試合番号', '試合no');
    const matchNo = matchNoRaw === '' ? null : pickNumber(row, 0, 'match_no', '試合番号', '試合no') || null;
    const routed = routeMusicUrls(apple, youtube, combined);

    cues.push({
      no: pickNumber(row, index + 1, 'no', '番号', '曲番号', '順番'),
      matchNo,
      kind: parseCueKind(pick(row, 'kind', 'cue', '種別', '用途')),
      title: title || '（曲名未入力）',
      artist: pick(row, 'artist', 'アーティスト', '演奏者'),
      appleMusicUrl: routed.appleMusicUrl,
      youtubeUrl: routed.youtubeUrl,
      otherUrl: routed.otherUrl,
      seconds: Math.max(0, parseSeconds(pick(row, 'seconds', '秒数', '尺', '長さ'), 0)),
      note: pick(row, 'note', '備考', 'メモ'),
    });
  });

  cues.sort((a, b) => a.no - b.no);
  if (cues.length === 0) warnings.push('music シートに曲が1件もありません。Event Mix 画面は空になります。');
  return cues;
}

/** CSV3枚から番組表を組み立てる。壊れた行は捨てて warnings に残す（取り込みで止めない） */
export function parseProgram(csv: SheetCsv, now: number): Program {
  const warnings: string[] = [];
  const meta = parseMeta(csv.event, warnings);
  const matches = parseMatches(csv.matches, warnings);
  const cues = parseCues(csv.music, warnings);

  return {
    revision: fingerprint(csv.event, csv.matches, csv.music),
    fetchedAt: now,
    meta,
    matches,
    cues,
    warnings,
  };
}
