// ゴミ収集クリーンシステムの入口。毎朝これが1回だけ走る。
//
// 流れ:
//   1. 対象フォルダが安全か確かめる（システム領域・リポジトリ内は拒否）
//   2. 計画を作る（この時点では1件も動かない）
//   3. 実行する（既定はお試し実行。OPENQLOW_CLEANUP_APPLY=true のときだけ実際に動く）
//   4. 外付けドライブへコピーする（つながっていなければスキップ）
//   5. 保管日数を過ぎたゴミ箱待ちを消す（OPENQLOW_CLEANUP_PURGE=true のときだけ）
//   6. LINEでJinに1通だけ知らせる
//
// 安全装置:
//   - OPENQLOW_CLEANUP_DISABLED=true で完全停止
//   - 通知は1日1通（run lock）。timer が二重に発火しても届くのは1通
//   - 消す前に必ずゴミ箱待ちを経由する。いきなり消えるファイルはない

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pushLineMessage } from "../line_bot/notifier.js";
import { acquireRunLock } from "../scheduler/run_lock.js";
import { formatDateInTimeZone } from "../utils/date.js";
import { openqlowPath } from "../utils/paths.js";
import { applyCleanupPlan } from "./apply.js";
import { type CleanupConfig, loadCleanupConfig } from "./config.js";
import { buildCleanupPlan } from "./plan.js";
import { buildCleanupLineMessage, buildCleanupLog, summariseCleanup, type CleanupSummary } from "./report.js";
import { UnsafePathError, assertSafeTargetRoot } from "./safety.js";

const RUN_LOCK_KEY = "cleanup_notified";

export type CleanupMode = "applied" | "dry_run" | "disabled" | "no_target";

export interface CleanupRunResult {
  ok: boolean;
  mode: CleanupMode;
  reason?: string;
  summary?: CleanupSummary;
  /** LINEに送った本文（送らなかった場合も中身は返す） */
  message?: string;
  /** LINE通知の結果 */
  notified?: "sent" | "dry_run" | "skipped" | "duplicate_today";
  logPath?: string;
}

export interface CleanupRunOptions {
  config?: CleanupConfig;
  now?: Date;
  /** テスト用に push を差し替え */
  pushFn?: typeof pushLineMessage;
  /** テスト用に state ディレクトリを差し替え */
  stateDir?: string;
  /** ログの保存先 */
  logDir?: string;
  home?: string;
}

/** 対象フォルダのうち、触ってよいものだけを残す。 */
export function filterSafeTargets(
  targets: readonly string[],
  home?: string,
): { safe: string[]; rejected: { path: string; message: string }[] } {
  const safe: string[] = [];
  const rejected: { path: string; message: string }[] = [];

  for (const target of targets) {
    try {
      assertSafeTargetRoot(target, home);
      safe.push(target);
    } catch (error) {
      if (error instanceof UnsafePathError) {
        rejected.push({ path: target, message: error.reason });
        continue;
      }
      throw error;
    }
  }
  return { safe, rejected };
}

export async function runCleanup(opts: CleanupRunOptions = {}): Promise<CleanupRunResult> {
  const config = opts.config ?? loadCleanupConfig(process.env, opts.home);

  if (config.disabled) {
    return { ok: true, mode: "disabled", reason: "OPENQLOW_CLEANUP_DISABLED=true" };
  }

  const now = opts.now ?? new Date();
  const dateJst = formatDateInTimeZone(now, "Asia/Tokyo");
  const { safe, rejected } = filterSafeTargets(config.targets, opts.home);

  if (safe.length === 0) {
    return {
      ok: false,
      mode: "no_target",
      reason: rejected.length > 0
        ? `対象にできないフォルダのみ: ${rejected.map(item => `${item.path}（${item.message}）`).join(", ")}`
        : "対象フォルダが設定されていません",
    };
  }

  const effective: CleanupConfig = { ...config, targets: safe };
  const plan = await buildCleanupPlan({ config: effective, dateJst, nowMs: now.getTime() });
  for (const item of rejected) {
    plan.errors.push({ path: item.path, message: `対象から除外: ${item.message}` });
  }

  const purgeRoots = [
    ...(effective.purgeEnabled ? [effective.quarantineRoot] : []),
    ...(effective.emptyTrashEnabled ? effective.trashRoots : []),
  ];

  const result = await applyCleanupPlan(plan, {
    dryRun: !effective.apply,
    purgeRoots,
    backup: {
      organizedRoot: effective.organizedRoot,
      backupRoot: effective.backupRoot,
      backupFolderName: effective.backupFolderName,
    },
  });

  const summary = summariseCleanup(plan, result, effective);
  const message = buildCleanupLineMessage(summary);

  const logDir = opts.logDir ?? openqlowPath("logs", "cleanup");
  let logPath: string | undefined;
  try {
    await mkdir(logDir, { recursive: true });
    logPath = path.join(logDir, `${dateJst}.md`);
    await writeFile(logPath, buildCleanupLog(summary, plan, result), "utf8");
  } catch {
    // ログが書けなくても片づけ自体は終わっている。通知は続ける。
    logPath = undefined;
  }

  // 通知は1日1通だけ。ロックを取れなかった日は本文だけ返して送らない。
  const stateDir = opts.stateDir ?? openqlowPath("state");
  const lock = await acquireRunLock(stateDir, RUN_LOCK_KEY, dateJst, now.toISOString());
  let notified: CleanupRunResult["notified"] = "duplicate_today";

  if (lock.acquired) {
    const pushFn = opts.pushFn ?? pushLineMessage;
    const pushResult = await pushFn(message);
    notified = pushResult.mode;
    // 届かなかった日はやり直せるようにロックを外す。
    if (!pushResult.ok || pushResult.mode !== "sent") {
      await lock.release();
    }
  }

  return {
    ok: summary.failures.length === 0,
    mode: effective.apply ? "applied" : "dry_run",
    summary,
    message,
    notified,
    logPath,
    ...(summary.failures.length > 0 ? { reason: `${summary.failures.length}件が失敗` } : {}),
  };
}

export function isCleanupCliEntry(importMetaUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  return /\/cleanup\/run\.(?:ts|js)$/.test(importMetaUrl)
    && /(?:^|\/)run\.(?:ts|js)$/.test(argv1);
}

// CLI 実行（launchd / systemd から呼ばれる）
if (isCleanupCliEntry(import.meta.url, process.argv[1])) {
  // --apply を付けたときだけ本番実行。付けなければお試し実行のまま。
  if (process.argv.includes("--apply")) process.env.OPENQLOW_CLEANUP_APPLY = "true";
  if (process.argv.includes("--dry-run")) process.env.OPENQLOW_CLEANUP_APPLY = "false";

  const result = await runCleanup();
  console.log(
    `[cleanup] mode=${result.mode} ok=${result.ok}` +
      `${result.notified ? ` notified=${result.notified}` : ""}` +
      `${result.reason ? ` reason=${result.reason}` : ""}`,
  );
  if (result.message) console.log(`\n${result.message}\n`);
  if (!result.ok) process.exit(1);
}
