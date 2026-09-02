// 返信下書きルーティンの設定。
//
// 既定は「何もしない」。オーナーが明示的にスイッチを入れるまで、
// 受信の記録も、下書きの作成も、LINE通知も行わない。
//
// 要件は docs/REPLY_DRAFT_ROUTINE_REQUIREMENTS.md。
// Phase 1 では LINE公式のみを対象にする（Gmailは Phase 3）。

export type ReplyDraftSource = "line" | "gmail";

export interface QuietHours {
  /** 通知を止め始める時刻（時） */
  start: number;
  /** 通知を再開する時刻（時） */
  end: number;
}

export interface ReplyDraftConfig {
  /** これが true でないと1件も動かない。 */
  enabled: boolean;
  /** 緊急停止。enabled より強い。 */
  disabled: boolean;
  /** 使う受信元。Phase 1 は line のみ。 */
  sources: ReplyDraftSource[];
  /** 1回の通知に載せる下書きの上限。 */
  maxPerRun: number;
  /** 通知しない時間帯（JST）。 */
  quietHours: QuietHours;
  /** true なら保存も通知もせず、結果を返すだけ。 */
  dryRun: boolean;
}

function parseFlag(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/** "22-7" の形を読む。読めない値は既定（22時〜7時）に戻す。 */
export function parseQuietHours(value: string | undefined, fallback: QuietHours = { start: 22, end: 7 }): QuietHours {
  if (!value) return fallback;
  const match = value.trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!match) return fallback;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > 23 || end > 23) return fallback;
  return { start, end };
}

export function parseSources(value: string | undefined): ReplyDraftSource[] {
  if (!value) return ["line"];
  const out: ReplyDraftSource[] = [];
  for (const part of value.split(",")) {
    const name = part.trim().toLowerCase();
    if ((name === "line" || name === "gmail") && !out.includes(name)) out.push(name);
  }
  return out.length > 0 ? out : ["line"];
}

export function loadReplyDraftConfig(env: NodeJS.ProcessEnv = process.env): ReplyDraftConfig {
  return {
    enabled: parseFlag(env.OPENQLOW_REPLY_DRAFT_ENABLED),
    disabled: parseFlag(env.OPENQLOW_REPLY_DRAFT_DISABLED),
    sources: parseSources(env.OPENQLOW_REPLY_DRAFT_SOURCES),
    maxPerRun: parsePositiveInt(env.OPENQLOW_REPLY_DRAFT_MAX_PER_RUN, 5),
    quietHours: parseQuietHours(env.OPENQLOW_REPLY_DRAFT_QUIET_HOURS),
    // 既存の OPENQLOW_DRY_RUN に合わせる（既定は dry run）。
    dryRun: env.OPENQLOW_DRY_RUN !== "false",
  };
}

/** その時刻が静音時間内か。22-7 のように日をまたぐ指定も扱う。 */
export function isQuietHour(hourJst: number, quiet: QuietHours): boolean {
  if (quiet.start === quiet.end) return false;
  if (quiet.start < quiet.end) return hourJst >= quiet.start && hourJst < quiet.end;
  return hourJst >= quiet.start || hourJst < quiet.end;
}
