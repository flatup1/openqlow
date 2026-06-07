// 毎朝 cron で起動される morning briefing。
// systemd timer (OnCalendar=*-*-* 07:00:00 Asia/Tokyo) から呼び出される想定。
//
// 動作:
//   1. JIN_LINE_USER_ID 向けに「かんたん日報」セッションを事前作成
//   2. 1通で返信できる短い入力例を LINE Push API で送信
//   3. Jin が次に LINE で返信すると、その1通を日報として保存する
//
// 安全装置:
//   - JIN_LINE_USER_ID 未設定なら何もしない
//   - LINE_CHANNEL_ACCESS_TOKEN 未設定なら何もしない
//   - OPENQLOW_LINE_DRY_RUN=true なら送信せず stdout に出すだけ
//   - OPENQLOW_MORNING_PUSH_DISABLED=true なら完全スキップ（緊急停止スイッチ）

import { startMorningDialog } from "../commands/memory_keeper.js";
import { pushLineMessage } from "../line_bot/notifier.js";
import { formatDateInTimeZone } from "../utils/date.js";

export interface MorningBriefingResult {
  ok: boolean;
  mode: "sent" | "dry_run" | "skipped" | "disabled" | "no_user";
  reason?: string;
  message?: string;
  dateJst?: string;
}

export interface MorningBriefingOptions {
  /** テスト用に Jin の userId を差し替え */
  userId?: string;
  /** テスト用に push を差し替え */
  pushFn?: typeof pushLineMessage;
  /** 現在時刻（テスト用） */
  now?: Date;
}

/**
 * 毎朝の briefing を実行する。systemd oneshot 用エントリポイント。
 */
export async function runMorningBriefing(opts: MorningBriefingOptions = {}): Promise<MorningBriefingResult> {
  if (process.env.OPENQLOW_MORNING_PUSH_DISABLED === "true") {
    return { ok: true, mode: "disabled", reason: "OPENQLOW_MORNING_PUSH_DISABLED=true" };
  }

  const userId = opts.userId ?? process.env.JIN_LINE_USER_ID ?? "";
  if (!userId) {
    return { ok: true, mode: "no_user", reason: "JIN_LINE_USER_ID not configured" };
  }

  // 1. 対話モードのセッションを事前作成。Jin の次の返信が即 Q1 の答えになる
  const dialog = await startMorningDialog(userId);

  // 2. メッセージ組み立て
  const now = opts.now ?? new Date();
  const dateJst = formatDateInTimeZone(now, "Asia/Tokyo");
  const message = [
    `☀ おはようございます (${dateJst})`,
    "",
    dialog.reply,
  ].join("\n");

  // 3. LINE Push
  const pushFn = opts.pushFn ?? pushLineMessage;
  const pushResult = await pushFn(message, { userId });

  if (!pushResult.ok) {
    return {
      ok: false,
      mode: "sent",
      reason: pushResult.error,
      message,
      dateJst,
    };
  }

  return {
    ok: true,
    mode: pushResult.mode === "dry_run" ? "dry_run" : pushResult.mode === "skipped" ? "skipped" : "sent",
    message,
    dateJst,
  };
}

// CLI 実行（systemd oneshot 用）
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const result = await runMorningBriefing();
  console.log(`[morning-briefing] mode=${result.mode} ok=${result.ok}${result.reason ? ` reason=${result.reason}` : ""}`);
  if (!result.ok) process.exit(1);
}
