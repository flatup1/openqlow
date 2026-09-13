// CLI: 今日AIに頼む仕事を1件だけ、根拠と依頼文つきで表示する。
//
//   npm run work-order
//   npm run work-order -- --minutes 15          今日AIに使える時間で絞る
//   npm run work-order -- --date 2026-09-13     日付を指定（確認用）
//   npm run work-order -- --json                機械可読で出す
//
// 読むのは既にある記録だけ（返信下書き・体験台帳・日次ログ）。
// 書き込み、送信、投稿は一切しない。実行判断はJIN。

import { loadConfig } from "../config.js";
import { collectWorkSignals } from "../sources/work_signals.js";
import { formatDateInTimeZone } from "../utils/date.js";
import { buildAiWorkOrder, renderWorkOrder, type WorkOrder } from "./ai_work_order.js";
import { parseFlags } from "./shared.js";

export interface WorkOrderArgs {
  minutesAvailable?: number;
  dateJst?: string;
  staleAfterDays?: number;
  json: boolean;
  vaultRoot?: string;
  openqlowRoot?: string;
  aiOsRoot?: string;
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseArgs(argv: string[]): WorkOrderArgs {
  const { flags } = parseFlags(argv);
  const args: WorkOrderArgs = { json: "json" in flags };
  const minutes = positiveInt(flags.minutes);
  if (minutes !== undefined) args.minutesAvailable = minutes;
  const stale = positiveInt(flags.stale);
  if (stale !== undefined) args.staleAfterDays = stale;
  if (/^\d{4}-\d{2}-\d{2}$/.test(flags.date ?? "")) args.dateJst = flags.date;
  if (flags.vault) args.vaultRoot = flags.vault;
  if (flags.root) args.openqlowRoot = flags.root;
  if (flags["ai-os"]) args.aiOsRoot = flags["ai-os"];
  return args;
}

/** 記録を読み、今日の1件を決める。表示はしない（テストから呼べるように分けている）。 */
export async function runWorkOrder(args: WorkOrderArgs, now: Date = new Date()): Promise<WorkOrder> {
  const config = loadConfig();
  const dateJst = args.dateJst ?? formatDateInTimeZone(now, "Asia/Tokyo");
  const collected = await collectWorkSignals({
    vaultRoot: args.vaultRoot ?? config.obsidianVaultRoot,
    openqlowRoot: args.openqlowRoot ?? config.root,
    aiOsRoot: args.aiOsRoot ?? config.flatupAiOsRoot,
    now,
  });
  return buildAiWorkOrder({
    dateJst,
    signals: collected.signals,
    askHuman: collected.askHuman,
    notes: collected.notes,
    ...(args.minutesAvailable !== undefined ? { minutesAvailable: args.minutesAvailable } : {}),
    ...(args.staleAfterDays !== undefined ? { staleAfterDays: args.staleAfterDays } : {}),
  });
}

const invokedDirectly = process.argv[1]?.endsWith("ai_work_order_cli.ts");
if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  const order = await runWorkOrder(args);
  console.log(args.json ? JSON.stringify(order, null, 2) : renderWorkOrder(order));
  process.exit(0);
}
