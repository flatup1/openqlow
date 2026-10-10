/**
 * 「この選手の入場曲はどれか」を決める（純関数）。
 *
 * 本来は music シートの match_no と kind（walkout_red / walkout_blue）で紐づける。
 * ところが実際の進行表は、申込1件＝1行で作られていて match_no が空のことがある。
 * そこで2段構えにする:
 *
 *   1. match_no と kind が入っていれば、それを使う（正しい紐づけ）
 *   2. 入っていなければ、選手名で探す（曲名や備考に「選手：◯◯」と書いてある）
 *
 * 2 は保険であって、正解ではない。当日までに match_no を埋めるのが本筋。
 * ただし埋まっていないからといって「曲が1曲も出ない」では大会が止まる。
 */

import type { Command, EventState, Match, MusicCue, Program } from './types.ts';
import { currentMatch, nextMatch } from './state.ts';
import { safeMusicUrl, audioSource } from './audio.ts';

/** 比べる前に、ゆらぎを吸収する（全角空白・半角空白・記号を落とす） */
function normalizeName(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\s　・･.,／/\-−–—]/g, '')
    .toLowerCase();
}

/** 選手名で曲を探す。曲名か備考に名前が入っていれば、それとみなす */
function findByName(cues: MusicCue[], name: string, knownNames: string[]): MusicCue | null {
  const key = normalizeName(name);
  if (key === '') return null;
  const matches = cues.filter(cue => {
    if (cue.fighterName) return normalizeName(cue.fighterName) === key;
    const text = normalizeName(cue.title + ' ' + cue.note);
    if (!text.includes(key)) return false;
    // Preserve legacy title/note matching, but never match a shorter name inside another fighter's name.
    return !knownNames.map(normalizeName).some(other => other !== key && other.includes(key) && text.includes(other));
  });
  return matches.length === 1 ? matches[0] : null;
}

/**
 * 指定した試合の、赤または青の入場曲。見つからなければ null。
 *
 * @param side 'red' か 'blue'
 */
export function cueForFighter(program: Program, match: Match | null, side: 'red' | 'blue'): MusicCue | null {
  if (!match) return null;
  const want = side === 'red' ? 'walkout_red' : 'walkout_blue';

  // 1. 正しい紐づけ（match_no ＋ kind）
  const tied = program.cues.find((c) => c.matchNo === match.no && c.kind === want);
  if (tied) return tied;

  // 選手行に明示された入場曲を優先する。既存の music 表は変更しない。
  const fighter = match[side];
  if (fighter.musicUrl?.trim()) return {
    no: -match.no, matchNo: match.no, kind: want, title: fighter.name + ' 入場曲',
    artist: '', appleMusicUrl: '', youtubeUrl: '', otherUrl: fighter.musicUrl.trim(), seconds: 0, note: '',
    receiptNo: '', fighterName: fighter.name, photoUrl: fighter.photo,
  };

  // 2. 保険: 選手名で探す
  return findByName(program.cues.filter(c => c.matchNo === null && (c.kind === 'other' || c.kind === want)), match[side].name, program.matches.flatMap(m => [m.red.name, m.blue.name]));
}

/** YouTube の動画ID。取り出せなければ空文字 */
export function youtubeVideoId(url: string): string {
  const safe = safeMusicUrl(url);
  if (!safe) return '';
  const u = new URL(safe);
  const host = u.hostname.toLowerCase();
  let id = '';
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
    id = u.searchParams.get('v') || u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] || '';
  }
  return /^[\w-]{11}$/.test(id) ? id : '';
}

/**
 * 画面の中で鳴らすための埋め込みURL。
 * 押した瞬間に鳴ってほしいので autoplay を付ける。
 */
export function youtubeEmbedUrl(url: string): string {
  const id = youtubeVideoId(url);
  if (id === '') return '';
  return 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
}

/** 音源ファイルの直リンク（押した瞬間に鳴る。いちばん確実） */
export function isAudioFileUrl(url: string): boolean {
  return audioSource(url).kind === 'audio';
}

/** その曲をどう鳴らすか */
export type PlayPlan =
  | { kind: 'audio'; url: string; label: string }
  | { kind: 'youtube'; embedUrl: string; label: string }
  | { kind: 'open'; url: string; label: string }
  | { kind: 'none'; label: string };

/**
 * 押したときに何が起きるかを決める。
 *
 * ボタンの文言と実際の動きを必ず一致させる。
 * 「同じ見た目なのに、押すと違うことが起きる」が当日いちばん危ない。
 */
export function playPlan(cue: MusicCue | null): PlayPlan {
  if (!cue) return { kind: 'none', label: '曲なし（入場曲が未登録）' };

  const apple = cue.appleMusicUrl.trim();
  const youtube = cue.youtubeUrl.trim();

  // 1. 音源ファイルなら、その場で鳴らせる
  const other = cue.otherUrl?.trim() ?? '';
  for (const url of [apple, youtube, other]) {
    if (isAudioFileUrl(url)) return { kind: 'audio', url, label: '▶ 入場曲を流す' };
  }

  // 2. YouTube は埋め込める＝押した瞬間に鳴る
  const embed = youtubeEmbedUrl(youtube);
  if (embed !== '') return { kind: 'youtube', embedUrl: embed, label: '▶ 入場曲を流す' };

  // 3. Apple Music はブラウザから鳴らせない。アプリが開くだけ、と正直に書く
  for (const raw of [apple, youtube, other]) {
    const source = audioSource(raw);
    if (source.kind === 'external') return { kind: 'open', url: source.url, label: source.label };
  }
  if ([apple, youtube, other].some(Boolean)) return { kind: 'none', label: '曲を再生できません（リンクを確認）' };

  return { kind: 'none', label: '曲なし（入場曲が未登録）' };
}

// ---------------------------------------------------------------------------
// 「次の試合へ」ボタンの中身
// ---------------------------------------------------------------------------

/**
 * `/live/` の下段ボタンが何をするか。
 *
 * `next` は「入場 → 1R → インターバル → …」と1段ずつ進むコマンドなので、
 * 1回押しても次の試合には行かない。ボタンに「次の試合へ」と書いてあるのに
 * 試合が変わらないのは、当日いちばん危ない食い違いになる。
 * だから `/live/` は最初から `jump_match`（試合番号を指定して入場から始める）を使う。
 */
export type LiveNextAction =
  | { kind: 'start'; label: string; command: Command }
  | { kind: 'next'; label: string; command: Command }
  | { kind: 'hold'; label: string }
  | { kind: 'end'; label: string };

export function liveNextAction(program: Program, state: EventState): LiveNextAction {
  // 停止中は reduce 側が全部はじく。押せるように見せない。
  if (state.hold.active) return { kind: 'hold', label: '進行が止まっています' };

  if (program.matches.length === 0) return { kind: 'end', label: '試合が登録されていません' };

  // まだ始まっていないときに「次の試合へ」を出すと、第1試合を飛ばしてしまう。
  if (state.phase === 'before') {
    const first = program.matches[0];
    return {
      kind: 'start',
      label: '第' + first.no + '試合をはじめる',
      command: { type: 'jump_match', matchNo: first.no },
    };
  }

  const following = nextMatch(program, state);
  if (!following) return { kind: 'end', label: 'これが最後の試合です' };
  return {
    kind: 'next',
    label: '次の試合へ　→　第' + following.no + '試合',
    command: { type: 'jump_match', matchNo: following.no },
  };
}

/**
 * 「← 前の試合」ボタンの中身。
 *
 * 進行担当が1つ先に進めすぎたときに、声を出さずに戻せるようにする。
 * `next` と同じく `jump_match` を使う（1段ずつ戻す `undo` ではない）。
 * `undo` は直前の一手しか戻せず、「前の試合へ」という言葉と意味が合わない。
 *
 * 最初の試合にいるときは戻り先が無いので、ボタンを出さずに理由を出す。
 */
export type LivePrevAction =
  | { kind: 'prev'; label: string; command: Command }
  | { kind: 'none'; label: string };

export function livePrevAction(program: Program, state: EventState): LivePrevAction {
  if (state.hold.active) return { kind: 'none', label: '進行が止まっています' };
  if (program.matches.length === 0) return { kind: 'none', label: '試合が登録されていません' };

  // まだ始まっていないときは、戻る先そのものが無い。
  if (state.phase === 'before') return { kind: 'none', label: 'まだ始まっていません' };

  const current = currentMatch(program, state);
  if (!current) return { kind: 'none', label: '前の試合はありません' };

  const index = program.matches.findIndex((m) => m.no === current.no);
  if (index <= 0) return { kind: 'none', label: 'これが最初の試合です' };

  const previous = program.matches[index - 1];
  return {
    kind: 'prev',
    label: '←　第' + previous.no + '試合',
    command: { type: 'jump_match', matchNo: previous.no },
  };
}
