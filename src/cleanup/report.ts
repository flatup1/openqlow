// 結果を人が読む形にする。LINE通知と、あとから追えるログの2つ。
//
// LINEは「結論だけ」。何件片づいて、何が消える予定で、どこを見れば戻せるか。
// 詳しい1件ずつの記録はログに残す。

import path from "node:path";
import { CATEGORY_FOLDER, type CleanupCategory } from "./classify.js";
import type { CleanupConfig } from "./config.js";
import type { ApplyResult } from "./apply.js";
import type { CleanupPlan } from "./plan.js";
import { sanitiseFreeText } from "../privacy/rules.js";

/** LINE の上限は5000字。余裕を持って切る。 */
const LINE_SAFE_CHARS = 4500;

export interface CleanupSummary {
  dateJst: string;
  dryRun: boolean;
  organizedCount: number;
  trashedCount: number;
  purgedCount: number;
  purgedBytes: number;
  keptCount: number;
  categoryCounts: Record<string, number>;
  backup: ApplyResult["backup"];
  failures: { path: string; message: string }[];
  organizedRoot: string;
  quarantineRoot: string;
  retentionDays: number;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)}${units[unit]}`;
}

export function summariseCleanup(
  plan: CleanupPlan,
  result: ApplyResult,
  config: CleanupConfig,
): CleanupSummary {
  const categoryCounts: Record<string, number> = {};
  const succeeded = new Set(result.organized.filter(item => item.ok).map(item => item.from));
  for (const move of plan.moves) {
    if (move.kind !== "organize" || !succeeded.has(move.from)) continue;
    const label = CATEGORY_FOLDER[move.category as CleanupCategory];
    categoryCounts[label] = (categoryCounts[label] ?? 0) + 1;
  }

  const purgedPaths = new Set(result.purged.filter(item => item.ok).map(item => item.from));
  const purgedBytes = plan.purges
    .filter(purge => purgedPaths.has(purge.path))
    .reduce((total, purge) => total + purge.size, 0);

  const failures = [
    ...result.errors,
    ...[...result.organized, ...result.trashed, ...result.purged]
      .filter(item => !item.ok)
      .map(item => ({ path: item.from, message: item.error ?? "不明なエラー" })),
    ...result.backup.errors,
  ];

  return {
    dateJst: plan.dateJst,
    dryRun: result.dryRun,
    organizedCount: result.organized.filter(item => item.ok).length,
    trashedCount: result.trashed.filter(item => item.ok).length,
    purgedCount: result.purged.filter(item => item.ok).length,
    purgedBytes,
    keptCount: plan.keptCount,
    categoryCounts,
    backup: result.backup,
    failures,
    organizedRoot: config.organizedRoot,
    quarantineRoot: config.quarantineRoot,
    retentionDays: config.retentionDays,
  };
}

function categoryLine(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "";
  return entries.map(([label, count]) => `${label}${count}`).join(" / ");
}

/** 朝いちばんに届く1通。 */
export function buildCleanupLineMessage(summary: CleanupSummary): string {
  const lines: string[] = [
    `【ゴミ収集クリーン】${summary.dateJst}`,
  ];

  if (summary.dryRun) {
    lines.push("お試し実行です。ファイルはまだ動かしていません。");
  }

  lines.push(
    "",
    `整頓 ${summary.organizedCount}件 / ゴミ箱待ちへ ${summary.trashedCount}件`,
  );

  const categories = categoryLine(summary.categoryCounts);
  if (categories) lines.push(`内訳: ${categories}`);

  if (summary.backup.available && summary.backup.copied > 0) {
    lines.push(`外付け保存 ${summary.backup.copied}件（${formatBytes(summary.backup.bytes)}）`);
  } else if (summary.backup.available) {
    // つながってはいるがコピーが0件。理由が分かっているならそれを出す。
    lines.push(`外付け保存 追加なし（${summary.backup.reason ?? "すでに同じ内容"}）`);
  } else {
    lines.push(`外付け保存 スキップ（${summary.backup.reason ?? "理由不明"}）`);
  }

  if (summary.purgedCount > 0) {
    lines.push(`完全削除 ${summary.purgedCount}件（${formatBytes(summary.purgedBytes)}）`);
  } else {
    lines.push("完全削除 なし");
  }

  lines.push(
    "",
    `整頓先: ${summary.organizedRoot}`,
    `戻したいとき: ${summary.quarantineRoot}（${summary.retentionDays}日は消えません）`,
  );

  if (summary.failures.length > 0) {
    lines.push("", `うまくいかなかったもの: ${summary.failures.length}件（ログを確認してください）`);
  }

  const message = sanitiseFreeText(lines.join("\n"));
  return message.length > LINE_SAFE_CHARS ? `${message.slice(0, LINE_SAFE_CHARS)}…` : message;
}

/** 1件ずつの記録。あとから「どこへ行ったか」を追えるようにする。 */
export function buildCleanupLog(
  summary: CleanupSummary,
  plan: CleanupPlan,
  result: ApplyResult,
): string {
  const lines: string[] = [
    `# ゴミ収集クリーン ${summary.dateJst}`,
    "",
    `- 実行モード: ${summary.dryRun ? "お試し実行（何も動かしていない）" : "本番実行"}`,
    `- 整頓: ${summary.organizedCount}件 / ゴミ箱待ち: ${summary.trashedCount}件 / 完全削除: ${summary.purgedCount}件`,
    `- 触らなかったもの: ${summary.keptCount}件`,
    `- 外付け保存: ${summary.backup.available ? `${summary.backup.copied}件コピー / ${summary.backup.skipped}件は変更なし` : `スキップ（${summary.backup.reason ?? "理由不明"}）`}`,
    "",
    "## 整頓したもの",
    "",
  ];

  const organizedMoves = plan.moves.filter(move => move.kind === "organize");
  const resultByPath = new Map(
    [...result.organized, ...result.trashed].map(item => [item.from, item]),
  );

  if (organizedMoves.length === 0) {
    lines.push("- なし");
  } else {
    for (const move of organizedMoves) {
      const outcome = resultByPath.get(move.from);
      const status = outcome?.ok ? "OK" : `NG(${outcome?.error ?? "未実行"})`;
      lines.push(`- ${status} ${path.basename(move.from)} → ${outcome?.to ?? move.to}（${move.reason}）`);
    }
  }

  lines.push("", "## ゴミ箱待ちへ移したもの", "");
  const trashMoves = plan.moves.filter(move => move.kind === "trash");
  if (trashMoves.length === 0) {
    lines.push("- なし");
  } else {
    for (const move of trashMoves) {
      const outcome = resultByPath.get(move.from);
      const status = outcome?.ok ? "OK" : `NG(${outcome?.error ?? "未実行"})`;
      lines.push(`- ${status} ${path.basename(move.from)}（${move.reason}）`);
    }
  }

  lines.push("", `## 完全削除（${summary.retentionDays}日を過ぎたもの）`, "");
  if (plan.purges.length === 0) {
    lines.push("- なし");
  } else {
    const purgeByPath = new Map(result.purged.map(item => [item.from, item]));
    for (const purge of plan.purges) {
      const outcome = purgeByPath.get(purge.path);
      const status = outcome?.ok ? "OK" : `NG(${outcome?.error ?? "未実行"})`;
      const where = purge.source === "trash" ? "Macのゴミ箱" : "ゴミ箱待ち";
      lines.push(`- ${status} ${path.basename(purge.path)}（${where} / ${purge.ageDays}日経過 / ${formatBytes(purge.size)}）`);
    }
  }

  if (summary.failures.length > 0) {
    lines.push("", "## うまくいかなかったもの", "");
    for (const failure of summary.failures) {
      lines.push(`- ${failure.path}: ${failure.message}`);
    }
  }

  lines.push("");
  return sanitiseFreeText(lines.join("\n"));
}
