import { pathToFileURL } from "node:url";
import { pushLineMessage } from "../line_bot/notifier.js";
import { formatDateInTimeZone } from "../utils/date.js";
import { openqlowPath } from "../utils/paths.js";
import { acquireRunLock } from "./run_lock.js";

const RUN_LOCK_KEY = "daily_check_sent";

export type DailyCheckMode = "dry_run" | "sent" | "skipped" | "duplicate_today";

export interface DailyCheckResult {
  ok: boolean;
  mode: DailyCheckMode;
  error?: string;
  reason?: string;
}

export interface DailyCheckOptions {
  /** 現在時刻（テスト用） */
  now?: Date;
  /** テスト用に state ディレクトリ差し替え */
  stateDir?: string;
  /** テスト用 push 関数 */
  pushFn?: typeof pushLineMessage;
}

export function formatDailyCheckPrompt(): string {
  return [
    "【OPENQLOW Daily Check】",
    "おはようございます。",
    "昨日のFLATUPを1通で送ってください。",
    "",
    "例：",
    "体験 ひかりちゃん1名",
    "入会予定あり",
    "気になる会員 森田さん",
    "口コミ レディースと全会員",
    "今日やること 広告を打つ",
    "",
    "「なし」だけでもOKです。",
  ].join("\n");
}

export async function runDailyCheck(opts: DailyCheckOptions = {}): Promise<DailyCheckResult> {
  const now = opts.now ?? new Date();
  const dateJst = formatDateInTimeZone(now, "Asia/Tokyo");
  const stateDir = opts.stateDir ?? openqlowPath("state");

  // 送信の前にロックを取る。timer が同じ日に2回発火しても、届くのは1通だけ。
  const lock = await acquireRunLock(stateDir, RUN_LOCK_KEY, dateJst, now.toISOString());
  if (!lock.acquired) {
    return { ok: true, mode: "duplicate_today", reason: `already sent on ${dateJst}` };
  }

  const pushFn = opts.pushFn ?? pushLineMessage;
  const result = await pushFn(formatDailyCheckPrompt());

  // 実際に届いたときだけロックを残す。送れなかった日はやり直せるようにする。
  if (!result.ok || result.mode !== "sent") {
    await lock.release();
  }

  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runDailyCheck();
  console.log(`[daily-check] ${result.mode}: ${result.ok ? "ok" : "failed"}`);
  if (!result.ok) {
    console.error(result.error ?? "unknown error");
    process.exit(1);
  }
}
