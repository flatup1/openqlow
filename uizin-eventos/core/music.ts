/**
 * 音源ステータスの判定（純関数）。
 *
 * ルール（v1で固定）:
 *   緑  = Apple Music の URL が使える（第一優先）
 *   黄  = Apple Music が無く YouTube だけ／尺(秒数)が未設定
 *   赤  = URL が1つも無い／形が壊れている／リンク切れを検出した
 *   灰  = 判定対象外
 *
 * 「赤がゼロになるまで大会を開始しない」の赤は、ここで決まる。
 */

import type { LinkCheck, MusicCue, MusicSummary, MusicVerdict } from './types.ts';

export function isAppleMusicUrl(url: string): boolean {
  const u = url.trim();
  if (u === '') return false;
  return /^https:\/\/(music\.apple\.com|embed\.music\.apple\.com)\/[^\s]+$/i.test(u);
}

export function isYouTubeUrl(url: string): boolean {
  const u = url.trim();
  if (u === '') return false;
  return /^https:\/\/(www\.|m\.|music\.)?(youtube\.com\/(watch\?|playlist\?|live\/|shorts\/)[^\s]+|youtu\.be\/[^\s]+)$/i.test(u);
}

function looksLikeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/** URL の到達確認結果を引く（未確認は undefined） */
function lookup(links: LinkCheck[], url: string): LinkCheck | undefined {
  return links.find((l) => l.url === url);
}

export function judgeCue(cue: MusicCue, links: LinkCheck[]): MusicVerdict {
  const apple = cue.appleMusicUrl.trim();
  const youtube = cue.youtubeUrl.trim();

  const appleOk = isAppleMusicUrl(apple);
  const youtubeOk = isYouTubeUrl(youtube);

  // 形が壊れている（何か書いてあるのに URL として読めない）
  if (apple !== '' && !appleOk && !looksLikeUrl(apple)) {
    return {
      cueNo: cue.no,
      status: 'invalid',
      color: 'red',
      playUrl: null,
      source: null,
      reason: 'Apple Music の欄がURLになっていません。',
    };
  }
  if (apple !== '' && !appleOk) {
    return {
      cueNo: cue.no,
      status: 'invalid',
      color: 'red',
      playUrl: null,
      source: null,
      reason: 'Apple Music のURLではありません（music.apple.com で始まるURLを貼ってください）。',
    };
  }
  if (apple === '' && youtube !== '' && !youtubeOk) {
    return {
      cueNo: cue.no,
      status: 'invalid',
      color: 'red',
      playUrl: null,
      source: null,
      reason: 'YouTube のURLではありません。',
    };
  }

  if (!appleOk && !youtubeOk) {
    return {
      cueNo: cue.no,
      status: 'missing',
      color: 'red',
      playUrl: null,
      source: null,
      reason: '音源URLが未登録です。',
    };
  }

  const source: 'apple' | 'youtube' = appleOk ? 'apple' : 'youtube';
  const playUrl = appleOk ? apple : youtube;

  const check = lookup(links, playUrl);
  if (check && check.alive === false) {
    return {
      cueNo: cue.no,
      status: 'dead',
      color: 'red',
      playUrl,
      source,
      reason: 'リンク切れを検出しました' + (check.httpStatus ? '（HTTP ' + check.httpStatus + '）' : '') + '。',
    };
  }

  if (cue.seconds <= 0) {
    return {
      cueNo: cue.no,
      status: 'no_seconds',
      color: 'yellow',
      playUrl,
      source,
      reason: '再生できますが、尺（秒数）が未設定です。Event Mix の「あと何秒」が出ません。',
    };
  }

  if (source === 'youtube') {
    return {
      cueNo: cue.no,
      status: 'youtube',
      color: 'yellow',
      playUrl,
      source,
      reason: 'YouTube で再生します（Apple Music が未登録）。',
    };
  }

  return {
    cueNo: cue.no,
    status: 'apple',
    color: 'green',
    playUrl,
    source,
    reason: 'Apple Music で再生できます。',
  };
}

export function summarizeMusic(cues: MusicCue[], links: LinkCheck[]): MusicSummary {
  const verdicts = cues.map((cue) => judgeCue(cue, links));
  let green = 0;
  let yellow = 0;
  let red = 0;
  let gray = 0;
  for (const v of verdicts) {
    if (v.color === 'green') green++;
    else if (v.color === 'yellow') yellow++;
    else if (v.color === 'red') red++;
    else gray++;
  }
  return { total: verdicts.length, green, yellow, red, gray, ready: red === 0, verdicts };
}

/** 到達確認をかけるべきURLの一覧（重複を除く） */
export function urlsToVerify(cues: MusicCue[]): string[] {
  const set = new Set<string>();
  for (const cue of cues) {
    const apple = cue.appleMusicUrl.trim();
    const youtube = cue.youtubeUrl.trim();
    if (isAppleMusicUrl(apple)) set.add(apple);
    else if (isYouTubeUrl(youtube)) set.add(youtube);
  }
  return Array.from(set);
}

export function colorClass(color: string): string {
  if (color === 'green') return 'bg-emerald-500';
  if (color === 'yellow') return 'bg-amber-400';
  if (color === 'red') return 'bg-rose-600';
  return 'bg-slate-500';
}

export function colorLabel(color: string): string {
  if (color === 'green') return '緑';
  if (color === 'yellow') return '黄';
  if (color === 'red') return '赤';
  return '灰';
}
