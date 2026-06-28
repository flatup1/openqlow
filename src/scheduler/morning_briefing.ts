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

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { startMorningDialog } from "../commands/memory_keeper.js";
import { loadConfig } from "../config.js";
import { pushLineMessage } from "../line_bot/notifier.js";
import { acquireDailyLock } from "../shared/run_lock.js";
import { formatDateInTimeZone } from "../utils/date.js";

export interface MorningBriefingResult {
  ok: boolean;
  mode: "sent" | "dry_run" | "skipped" | "disabled" | "no_user" | "duplicate_today";
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
  /** Vault の DAILY-BRIEF.md も更新する。既定は環境変数 OPENQLOW_WRITE_DAILY_BRIEF=true の時だけ。 */
  writeDailyBrief?: boolean;
  /** テスト用に Vault root を差し替え */
  obsidianVaultRoot?: string;
  /** テスト用に state ディレクトリ（ロック置き場）を差し替え */
  stateDir?: string;
}

function renderDailyBrief(dateJst: string, morningMessage: string, mode: MorningBriefingResult["mode"]): string {
  return [
    `# DAILY-BRIEF — ${dateJst}`,
    "",
    "> openQLOW morning briefing により生成。送信・予約確定・料金判断は人間確認後。",
    "",
    "## 今日の最重要タスク",
    "- LINEで昨日の体験・入会・追客状況を1通で返す",
    "",
    "## FOLLOW-UP QUEUE",
    "- 日報返信後、openQLOWのCRM/日報から追客候補を確認する",
    "",
    "## REVIEW REQUEST CANDIDATES",
    "- 日報返信後、口コミ候補がいれば確認する",
    "",
    "## HUMAN CHECK REQUIRED",
    "- 顧客への送信、予約確定、料金・返金・退会判断はJIN確認後",
    `- LINE push mode: ${mode}`,
    `- OPENQLOW_LINE_DRY_RUN: ${process.env.OPENQLOW_LINE_DRY_RUN ?? "(unset)"}`,
    `- OPENQLOW_MORNING_PUSH_DISABLED: ${process.env.OPENQLOW_MORNING_PUSH_DISABLED ?? "(unset)"}`,
    "",
    "## 朝の入力依頼",
    "```text",
    morningMessage,
    "```",
    "",
  ].join("\n");
}

async function writeDailyBriefToVault(vaultRoot: string, dateJst: string, message: string, mode: MorningBriefingResult["mode"]): Promise<string> {
  await mkdir(vaultRoot, { recursive: true });
  const file = path.join(vaultRoot, "DAILY-BRIEF.md");
  await writeFile(file, renderDailyBrief(dateJst, message, mode), "utf8");
  return file;
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

  const now = opts.now ?? new Date();
  const dateJst = formatDateInTimeZone(now, "Asia/Tokyo");
  const acquired = await acquireDailyLock("morning_briefing", dateJst, opts.stateDir);
  if (!acquired) {
    return { ok: true, mode: "duplicate_today", reason: `already ran on ${dateJst}`, dateJst };
  }

  // 1. 対話モードのセッションを事前作成。Jin の次の返信が即 Q1 の答えになる
  const dialog = await startMorningDialog(userId);

  // 2. メッセージ組み立て
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

  const mode = pushResult.mode === "dry_run" ? "dry_run" : pushResult.mode === "skipped" ? "skipped" : "sent";
  const shouldWriteDailyBrief = opts.writeDailyBrief ?? process.env.OPENQLOW_WRITE_DAILY_BRIEF === "true";
  let dailyBriefPath: string | undefined;
  if (shouldWriteDailyBrief) {
    dailyBriefPath = await writeDailyBriefToVault(
      opts.obsidianVaultRoot ?? loadConfig().obsidianVaultRoot,
      dateJst,
      message,
      mode,
    );
  }

  return {
    ok: true,
    mode,
    message,
    dateJst,
    ...(dailyBriefPath ? { reason: `daily brief saved: ${dailyBriefPath}` } : {}),
  };
}

export function isMorningBriefingCliEntry(importMetaUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  return importMetaUrl.endsWith("/morning_briefing.ts") && argv1.endsWith("morning_briefing.ts");
}

// CLI 実行（systemd oneshot 用）
if (isMorningBriefingCliEntry(import.meta.url, process.argv[1])) {
  const result = await runMorningBriefing();
  console.log(`[morning-briefing] mode=${result.mode} ok=${result.ok}${result.reason ? ` reason=${result.reason}` : ""}`);
  if (!result.ok) process.exit(1);
}
