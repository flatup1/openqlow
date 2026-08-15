// 毎朝 cron で起動される management briefing。
// systemd timer (OnCalendar=*-*-* 06:00:00 Asia/Tokyo) から呼び出される想定。
//
// 動作:
//   1. Obsidianの日次ログと体験・入会集計を読み取る
//   2. 前回・現在・今日・保留・不要を1通にまとめてLINE送信
//   3. 同じ内容をDAILY-BRIEF.mdへ保存する
//
// 安全装置:
//   - JIN_LINE_USER_ID 未設定なら何もしない
//   - LINE_CHANNEL_ACCESS_TOKEN 未設定なら何もしない
//   - OPENQLOW_LINE_DRY_RUN=true なら送信せず stdout に出すだけ
//   - OPENQLOW_MORNING_PUSH_DISABLED=true なら完全スキップ（緊急停止スイッチ）

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { pushLineMessage } from "../line_bot/notifier.js";
import { formatDateInTimeZone } from "../utils/date.js";
import { openqlowPath } from "../utils/paths.js";
import { acquireRunLock } from "./run_lock.js";
import { buildManagementBrief } from "./management_brief.js";

const RUN_LOCK_KEY = "morning_briefing_sent";

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
  /** テスト用に state ディレクトリ差し替え */
  stateDir?: string;
  /** テスト用にブリーフ生成を差し替え */
  briefBuilder?: typeof buildManagementBrief;
}

function renderDailyBrief(dateJst: string, morningMessage: string, mode: MorningBriefingResult["mode"]): string {
  return [
    `# DAILY-BRIEF — ${dateJst}`,
    "",
    "> openQLOW management briefing により生成。根拠のない補完はせず、正式決定はJIN確認後。",
    "",
    "## 本日のブリーフ",
    "",
    morningMessage,
    "",
    "## 実行情報",
    `- LINE push mode: ${mode}`,
    `- OPENQLOW_LINE_DRY_RUN: ${process.env.OPENQLOW_LINE_DRY_RUN ?? "(unset)"}`,
    `- OPENQLOW_MORNING_PUSH_DISABLED: ${process.env.OPENQLOW_MORNING_PUSH_DISABLED ?? "(unset)"}`,
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
  const stateDir = opts.stateDir ?? openqlowPath("state");

  // 送信の前にロックを取る。timer が同じ日に2回発火しても、届くのは1通だけ。
  const lock = await acquireRunLock(stateDir, RUN_LOCK_KEY, dateJst, now.toISOString());
  if (!lock.acquired) {
    return { ok: true, mode: "duplicate_today", reason: `already sent on ${dateJst}`, dateJst };
  }

  // メッセージ組み立て。対話プロンプトは management brief へ置き換え済み。
  const vaultRoot = opts.obsidianVaultRoot ?? loadConfig().obsidianVaultRoot;
  const briefBuilder = opts.briefBuilder ?? buildManagementBrief;
  const message = await briefBuilder(vaultRoot, dateJst, now);

  // LINE Push
  const pushFn = opts.pushFn ?? pushLineMessage;
  const pushResult = await pushFn(message, { userId });

  if (!pushResult.ok) {
    // 送れなかった日はやり直せるようにロックを外す。
    await lock.release();
    return {
      ok: false,
      mode: "sent",
      reason: pushResult.error,
      message,
      dateJst,
    };
  }

  const mode = pushResult.mode === "dry_run" ? "dry_run" : pushResult.mode === "skipped" ? "skipped" : "sent";
  // 実際に届いたときだけロックを残す。
  if (mode !== "sent") {
    await lock.release();
  }
  const shouldWriteDailyBrief = opts.writeDailyBrief ?? process.env.OPENQLOW_WRITE_DAILY_BRIEF === "true";
  let dailyBriefPath: string | undefined;
  if (shouldWriteDailyBrief) {
    dailyBriefPath = await writeDailyBriefToVault(
      vaultRoot,
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
  return /\/morning_briefing\.(?:ts|js)$/.test(importMetaUrl)
    && /(?:^|\/)morning_briefing\.(?:ts|js)$/.test(argv1);
}

// CLI 実行（systemd oneshot 用）
if (isMorningBriefingCliEntry(import.meta.url, process.argv[1])) {
  const result = await runMorningBriefing();
  console.log(`[morning-briefing] mode=${result.mode} ok=${result.ok}${result.reason ? ` reason=${result.reason}` : ""}`);
  if (!result.ok) process.exit(1);
}
