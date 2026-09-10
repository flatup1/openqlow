// 返信下書きルーティンの設定。
//
// この機能は「AIが考え、JINが決め、JINが送る」を守る。だから設定の既定値は
// すべて「動かない側」に倒す。動かすには、オーナーが明示的にスイッチを入れる。
//
// 優先順位（要件 §46）:
//   ① REPLY_DRAFT_DISABLED  … 非常停止。他の設定に関係なく止まる
//   ② REPLY_DRAFT_ENABLED   … 使う意思表示。これが true でなければ何もしない
//   ③ OPENQLOW_DRY_RUN      … 本番反映の総合スイッチ。既定は dry run
//
// 「true」ちょうどのときだけ有効にする（要件 §43）。"1" / "yes" / "TRUE" / "on" は
// すべて無効。設定ミスが「なんとなく動いてしまう」形で本番に出ないようにする。

import path from "node:path";

/** 実行モード。off / disabled は副作用を1つも起こさない。 */
export type ReplyDraftMode = "disabled" | "off" | "dry_run" | "live";

export interface ReplyDraftConfig {
  mode: ReplyDraftMode;
  /** 保存も通知もしてよいか（live のときだけ true）。 */
  writes: boolean;
  /** 状態・下書きの保存先ルート（既定は OPENQLOW_ROOT）。 */
  root: string;
  /** 重複判定の保持日数（要件 §19）。 */
  seenRetentionDays: number;
  /** 1通知に載せる最大件数（要件 §36）。 */
  notifyMaxItems: number;
  /** 静音時間の開始時（JST, 24時間表記。要件 §37）。 */
  quietStartHour: number;
  /** 静音時間の終了時（JST）。この時刻から通知してよい。 */
  quietEndHour: number;
}

/** 「true」ちょうどのときだけ true。それ以外はすべて false。 */
export function isExplicitlyTrue(value: string | undefined): boolean {
  return value === "true";
}

/**
 * 実行モードを決める。優先順位は DISABLED > ENABLED > DRY_RUN（要件 §46）。
 *
 * OPENQLOW_DRY_RUN は既存の作法（"false" のときだけ本番）に合わせる。
 * 未設定・書き間違いはすべて dry run 側に落ちる。
 */
export function resolveMode(env: NodeJS.ProcessEnv = process.env): ReplyDraftMode {
  if (isExplicitlyTrue(env.REPLY_DRAFT_DISABLED)) return "disabled";
  if (!isExplicitlyTrue(env.REPLY_DRAFT_ENABLED)) return "off";
  if (env.OPENQLOW_DRY_RUN !== "false") return "dry_run";
  return "live";
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadReplyDraftConfig(env: NodeJS.ProcessEnv = process.env): ReplyDraftConfig {
  const mode = resolveMode(env);
  return {
    mode,
    writes: mode === "live",
    root: env.OPENQLOW_ROOT || process.cwd(),
    seenRetentionDays: positiveInt(env.REPLY_DRAFT_SEEN_RETENTION_DAYS, 30),
    notifyMaxItems: positiveInt(env.REPLY_DRAFT_NOTIFY_MAX_ITEMS, 5),
    quietStartHour: 22,
    quietEndHour: 7,
  };
}

/** 下書き・状態ファイルの置き場所。state/reply_drafts/ 配下だけを使う。 */
export function replyDraftStateDir(root: string): string {
  return path.join(root, "state", "reply_drafts");
}
