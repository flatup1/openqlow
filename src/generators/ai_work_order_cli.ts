// CLI: 今日AIに頼む仕事を1件だけ、根拠と依頼文つきで表示する。
//
//   npm run work-order
//   npm run work-order -- --minutes 15          今日AIに使える時間で絞る
//   npm run work-order -- --date 2026-09-13     日付を指定（確認用）
//   npm run work-order -- --json                機械可読で出す
//   npm run work-order -- --out                 Vaultの決まった場所へ書き出す（毎朝の自動実行用）
//   npm run work-order -- --out ./today.md      場所を指定して書き出す
//
// 読むのは既にある記録だけ（返信下書き・体験台帳・日次ログ）。
// 送信・投稿はしない。書き込みは --out を付けたときの1ファイルだけ。実行判断はJIN。

import { mkdir, rename, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { loadConfig } from "../config.js";
import { collectWorkSignals } from "../sources/work_signals.js";
import { formatDateInTimeZone } from "../utils/date.js";
import { buildAiWorkOrder, renderWorkOrder, type WorkOrder } from "./ai_work_order.js";
import { parseFlags } from "./shared.js";

/** --out を値なしで指定したときの書き出し先（Vault からの相対）。 */
export const VAULT_OUT_RELATIVE = path.join("6_システム", "AI作戦基地", "今日のAI依頼.md");

export interface WorkOrderArgs {
  minutesAvailable?: number;
  dateJst?: string;
  staleAfterDays?: number;
  json: boolean;
  /** 書き出し先。空文字は「Vaultの決まった場所」。未指定なら書き出さない。 */
  out?: string;
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
  if ("out" in flags) args.out = flags.out;
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

/** 書き出すノートの中身。毎朝上書きされることが、開いた人に分かるようにする。 */
export function renderNote(order: WorkOrder, generatedAtJst: string): string {
  return [
    `# 今日のAI依頼 — ${order.dateJst}`,
    "",
    `> openQLOW の work-order が ${generatedAtJst} に自動生成。**毎朝上書きされます**。`,
    "> ここに手で書いた内容は残りません。メモは日次ログへ。",
    "> 送信・投稿・予約確定・料金判断はJINが実行します。",
    "",
    "```text",
    renderWorkOrder(order),
    "```",
    "",
  ].join("\n");
}

/** 書き出し先を決める。--out に値が無ければ Vault の決まった場所。 */
export function resolveOutPath(out: string, vaultRoot: string): string {
  return out ? path.resolve(out) : path.join(vaultRoot, VAULT_OUT_RELATIVE);
}

/** 途中で落ちても壊れたファイルが残らないよう、隣へ書いてから置き換える。 */
export async function writeNote(file: string, body: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, body, "utf8");
  await rename(temporary, file);
}

const invokedDirectly = process.argv[1]?.endsWith("ai_work_order_cli.ts");
if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const order = await runWorkOrder(args, now);
  const text = args.json ? JSON.stringify(order, null, 2) : renderWorkOrder(order);
  console.log(text);
  if (args.out !== undefined) {
    const file = resolveOutPath(args.out, args.vaultRoot ?? loadConfig().obsidianVaultRoot);
    await writeNote(file, args.json ? `${text}\n` : renderNote(order, formatDateInTimeZone(now, "Asia/Tokyo")));
    console.log(`\n[work-order] 書き出しました: ${file}`);
  }
  process.exit(0);
}
