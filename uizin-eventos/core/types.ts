/**
 * UIZIN EventOS v1.0 — 型の正本
 *
 * ここに書いてある形が「イベントステート＝唯一の真実」です。
 * 画面同士は直接やり取りしません。全画面はこの EventState を見ているだけです。
 *
 * 依存ゼロ（Node の型消去でそのまま実行できる書き方だけを使う）。
 */

// ---------------------------------------------------------------------------
// 番組表（Google スプレッドシート = v1唯一のCMS から取り込む中身）
// ---------------------------------------------------------------------------

export type Fighter = {
  /** 選手名 */
  name: string;
  /** 所属 */
  team: string;
  /** 戦績など短い紹介 */
  record: string;
  /** 意気込み（MC・表示画面で読む本文） */
  comment: string;
};

export type Match = {
  /** 試合番号（1始まり） */
  no: number;
  /** クラス・階級 */
  className: string;
  /** ルール */
  rule: string;
  /** ラウンド数 */
  rounds: number;
  /** 1ラウンドの秒数 */
  roundSeconds: number;
  /** インターバルの秒数 */
  breakSeconds: number;
  red: Fighter;
  blue: Fighter;
  /** 備考（オペレーター用メモ。表示画面には出さない） */
  note: string;
};

/** 曲の用途 */
export type CueKind =
  | 'opening'
  | 'walkout_red'
  | 'walkout_blue'
  | 'interval'
  | 'result'
  | 'ending'
  | 'other';

export type MusicCue = {
  /** 曲の並び順（1始まり） */
  no: number;
  /** ひもづく試合番号。なければ null */
  matchNo: number | null;
  kind: CueKind;
  title: string;
  artist: string;
  /** 第一優先 */
  appleMusicUrl: string;
  /** 第二優先 */
  youtubeUrl: string;
  /** 尺（秒）。0 は未設定 */
  seconds: number;
  note: string;
};

export type EventMeta = {
  title: string;
  venue: string;
  date: string;
  /** 開始予定時刻 "13:00" */
  startAt: string;
  /** 停止中にMC画面へ出す文言 */
  holdMessage: string;
};

export type Program = {
  /** 取り込んだ内容のハッシュ。全画面が同じ番組表を見ているかの照合に使う */
  revision: string;
  /** 取り込んだ時刻（サーバー時刻 epoch ms） */
  fetchedAt: number;
  meta: EventMeta;
  matches: Match[];
  cues: MusicCue[];
  /** 取り込み時に見つかった注意点（赤にはしないが人間に見せる） */
  warnings: string[];
};

// ---------------------------------------------------------------------------
// タイマー
// ---------------------------------------------------------------------------

export type TimerMode = 'idle' | 'running' | 'paused';

/**
 * タイマーは「今の残り秒」を持ちません。
 * 開始時刻（サーバー時刻）と積算だけを持ち、表示は各画面が計算します。
 * こうすると、再読み込みしても・遅れて繋いだ端末でも、必ず同じ値になります。
 */
export type Timer = {
  mode: TimerMode;
  /** running のとき、この回の開始サーバー時刻(ms)。それ以外は null */
  startedAt: number | null;
  /** 停止までに積み上がった時間(ms) */
  elapsedMs: number;
  /** 目標時間(ms)。null はカウントアップ（Event Timer） */
  durationMs: number | null;
};

// ---------------------------------------------------------------------------
// イベントステート（唯一の真実）
// ---------------------------------------------------------------------------

export type Phase =
  /** 開始前 */
  | 'before'
  /** 入場 */
  | 'walkout'
  /** 試合中 */
  | 'fight'
  /** ラウンド間インターバル */
  | 'interval'
  /** 判定・結果発表 */
  | 'result'
  /** 全試合終了 */
  | 'finished';

export type HoldState = {
  active: boolean;
  message: string;
  /** 停止した時刻(ms) */
  since: number | null;
  /** 停止時に動いていたタイマー（再開で元に戻すため） */
  paused: { event: boolean; round: boolean; cue: boolean };
};

export type EventState = {
  /** 書き換えるたびに +1。全画面が同じ version なら同期済み */
  version: number;
  /** 最終更新のサーバー時刻(ms) */
  updatedAt: number;
  /** このステートが前提にしている番組表の revision */
  programRevision: string;
  /** 現在の試合（0始まりの添字）。試合が無いときは -1 */
  matchIndex: number;
  phase: Phase;
  /** 現在のラウンド（1始まり）。試合中以外は最後の値を保持 */
  round: number;
  hold: HoldState;
  /** 大会全体の経過（カウントアップ） */
  eventTimer: Timer;
  /** ラウンド／インターバルの残り（カウントダウン） */
  roundTimer: Timer;
  /** 現在の曲（0始まりの添字）。曲が無いときは -1 */
  cueIndex: number;
  /** 今の曲の残り（カウントダウン） */
  cueTimer: Timer;
  /** 直前の一手（操作ログの先頭と同じ） */
  lastCommand: LogEntry | null;
};

// ---------------------------------------------------------------------------
// 操作（コマンド）
// ---------------------------------------------------------------------------

export type Command =
  | { type: 'start_event' }
  | { type: 'next' }
  | { type: 'hold'; message?: string }
  | { type: 'resume' }
  | { type: 'round_start' }
  | { type: 'round_pause' }
  | { type: 'round_reset' }
  | { type: 'cue_start' }
  | { type: 'cue_next' }
  | { type: 'cue_prev' }
  | { type: 'jump_match'; matchNo: number }
  | { type: 'jump_cue'; cueNo: number }
  | { type: 'finish_event' }
  | { type: 'reset_event' };

export type CommandType = Command['type'];

export type LogEntry = {
  type: CommandType | 'undo' | 'program_reload';
  /** サーバー時刻(ms) */
  at: number;
  /** 人間が読む一行の説明 */
  label: string;
  /** 適用後の version */
  version: number;
};

/** reduce の結果。拒否されたときは reason が入る */
export type ReduceResult = {
  state: EventState;
  changed: boolean;
  reason: string | null;
  label: string;
};

// ---------------------------------------------------------------------------
// 音源チェック
// ---------------------------------------------------------------------------

export type MusicColor = 'green' | 'yellow' | 'red' | 'gray';

export type MusicStatus =
  /** Apple Music が使える（第一優先） */
  | 'apple'
  /** YouTube のみ（第二優先） */
  | 'youtube'
  /** URL が未登録 */
  | 'missing'
  /** URL の形が正しくない */
  | 'invalid'
  /** リンク切れを検出した */
  | 'dead'
  /** 尺（秒数）が未設定 */
  | 'no_seconds';

export type MusicVerdict = {
  cueNo: number;
  status: MusicStatus;
  color: MusicColor;
  /** 実際に人間が押すべきURL。無ければ null */
  playUrl: string | null;
  source: 'apple' | 'youtube' | null;
  /** 日本語の理由（画面にそのまま出す） */
  reason: string;
};

export type MusicSummary = {
  total: number;
  green: number;
  yellow: number;
  red: number;
  gray: number;
  /** 赤がゼロなら true。大会開始の条件 */
  ready: boolean;
  verdicts: MusicVerdict[];
};

/** リンク到達確認の結果（Worker が実際に叩いた記録） */
export type LinkCheck = {
  url: string;
  /** true=生きている, false=リンク切れ, null=確認できなかった */
  alive: boolean | null;
  httpStatus: number | null;
  checkedAt: number;
  note: string;
};

export type MusicReport = {
  checkedAt: number;
  programRevision: string;
  summary: MusicSummary;
  links: LinkCheck[];
};

// ---------------------------------------------------------------------------
// 配信メッセージ（Worker → 全画面）
// ---------------------------------------------------------------------------

export type Snapshot = {
  serverNow: number;
  state: EventState;
  program: Program;
  musicReport: MusicReport | null;
};

export type ServerMessage =
  | ({ t: 'sync' } & Snapshot)
  | { t: 'state'; serverNow: number; state: EventState }
  | { t: 'program'; serverNow: number; program: Program; state: EventState }
  | { t: 'music'; serverNow: number; musicReport: MusicReport }
  | { t: 'pong'; serverNow: number };
