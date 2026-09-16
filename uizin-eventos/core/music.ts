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

/**
 * セルの中から最初のURLを取り出す。
 *
 * 申込フォームの「入場曲URL」には、実際には次のような書き方が来る:
 *   「ターミネーター２ https://music.apple.com/...」（曲名＋URL）
 *   「捻くれ者https://music.apple.com/...」（区切りなし）
 *   「PROVANT(https://music.apple.com/...)」（括弧で囲む）
 * URLだけを厳密に要求すると、これらが全部「未登録」になって赤が量産される。
 */
export function extractUrl(text: string): string {
  const match = text.match(/https?:\/\/[^\s"'<>（）「」『』【】]+/);
  if (!match) return '';
  // 末尾に付いてきた句読点や閉じ括弧を落とす
  return match[0].replace(/[.,;:)\]}>。、）］｝]+$/, '');
}

/** 音楽サービスの見分け（赤の理由を具体的に書くために使う） */
export function serviceName(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('music.amazon.')) return 'Amazon Music';
  if (u.includes('open.spotify.com') || u.includes('spotify.link')) return 'Spotify';
  if (u.includes('lin.ee') || u.includes('line.me')) return 'LINE';
  if (u.includes('google.com/aclk') || u.includes('google.com/url')) return 'Google の広告リンク';
  if (u.includes('google.com/search')) return 'Google の検索結果';
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('instagram.com')) return 'Instagram';
  if (u.includes('drive.google.com')) return 'Google ドライブ';
  if (u.includes('.jpg') || u.includes('.png') || u.includes('/photos/')) return '画像';
  return '別サイト';
}

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

/**
 * 「入場曲なし」とはっきり書いてある場合の言い方。
 *
 * 空欄（＝まだ本人に確認できていない）と、
 * 「なし」と書いてある（＝確認済みで曲を使わない）は、意味がまったく違う。
 * 前者は赤（当日までに確認する）、後者は灰（対象外）にする。
 * ここを一緒くたにすると、赤がゼロにならず、赤ゼロ運用そのものが信用されなくなる。
 */
const NO_MUSIC = /^(なし|無し|無|指定なし|特になし|不要|入場曲なし|会場bgm|bgm|none|-|ー|—|–)$/i;

export function isDeclaredNoMusic(text: string): boolean {
  return NO_MUSIC.test(text.trim());
}

/** URL の到達確認結果を引く（未確認は undefined） */
function lookup(links: LinkCheck[], url: string): LinkCheck | undefined {
  return links.find((l) => l.url === url);
}

export function judgeCue(cue: MusicCue, links: LinkCheck[]): MusicVerdict {
  const apple = extractUrl(cue.appleMusicUrl) || cue.appleMusicUrl.trim();
  const youtube = extractUrl(cue.youtubeUrl) || cue.youtubeUrl.trim();
  const other = (cue.otherUrl ?? '').trim();

  const appleOk = isAppleMusicUrl(apple);
  const youtubeOk = isYouTubeUrl(youtube);

  // 「入場曲なし」と確認済み → 対象外（灰）。赤にはしない
  if (!appleOk && !youtubeOk && other === '' && isDeclaredNoMusic(apple)) {
    return {
      cueNo: cue.no,
      status: 'none',
      color: 'gray',
      playUrl: null,
      source: null,
      reason: '入場曲なし（確認済み）。会場BGMのまま進めます。',
    };
  }

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
      reason:
        serviceName(apple) +
        ' のリンクが入っています。Apple Music（music.apple.com）のURLに貼り替えてください。',
    };
  }
  if (apple === '' && youtube !== '' && !youtubeOk) {
    return {
      cueNo: cue.no,
      status: 'invalid',
      color: 'red',
      playUrl: null,
      source: null,
      reason:
        serviceName(youtube) + ' のリンクが入っています。YouTube のURLに貼り替えてください。',
    };
  }

  // Apple でも YouTube でもないサービスのURLが1本だけ入っている場合
  if (!appleOk && !youtubeOk && other !== '') {
    return {
      cueNo: cue.no,
      status: 'invalid',
      color: 'red',
      playUrl: null,
      source: null,
      reason:
        serviceName(other) +
        ' のリンクです。v1で再生できるのは Apple Music と YouTube だけです。貼り替えてください。',
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
    const apple = extractUrl(cue.appleMusicUrl) || cue.appleMusicUrl.trim();
    const youtube = extractUrl(cue.youtubeUrl) || cue.youtubeUrl.trim();
    if (isAppleMusicUrl(apple)) set.add(apple);
    else if (isYouTubeUrl(youtube)) set.add(youtube);
  }
  return Array.from(set);
}

/**
 * 前日チェックで人間が見る順に並べ替える。
 *
 * 実データ（55曲）では黄が38件出た。No順のままだと、
 * 本当に直すべき赤17件が黄に埋もれて見つからない。
 * 直すべきものから順に上へ出す: 赤 → 黄 → 灰 → 緑。
 */
const REVIEW_ORDER: Record<string, number> = { red: 0, yellow: 1, gray: 2, green: 3 };

export function sortVerdictsForReview(verdicts: MusicVerdict[]): MusicVerdict[] {
  return [...verdicts].sort((a, b) => {
    const byColor = (REVIEW_ORDER[a.color] ?? 9) - (REVIEW_ORDER[b.color] ?? 9);
    return byColor !== 0 ? byColor : a.cueNo - b.cueNo;
  });
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
