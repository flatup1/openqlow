// 会計記録（経費帳簿）
//
// 目的:
//  - LINE / CLI から経費を1件ずつ記録する。
//  - Obsidian Vault に機械可読(.jsonl) と 人が読む月別台帳(.md) の二本立てで追記する。
//  - その月の経費をカテゴリ別に合計して LINE 1メッセージで返す。
//  - 保存先は Obsidian なので、既存の /push コマンドでそのまま GitHub へ送れる。
//
// 記録コマンド:
//   /経費 1200 消耗品 ジムの備品
//   /経費 2026-06-01 1,200 会議費 打ち合わせ        ← 先頭に日付を置くと過去日付で記録
//   /経費 ¥3000 交通費                              ← メモ省略可
//
// 月報コマンド:
//   /経費月報            → 今月（JST）
//   /経費月報 先月        → 先月
//   /経費月報 2026-05     → 指定月
//   /経費月報 5 / 5月     → 今年の指定月

import fs from "node:fs/promises";
import path from "node:path";
import { obsidianPath } from "../utils/paths.js";
import { formatDateInTimeZone } from "../utils/date.js";

const EXPENSE_DIRECTORY_RELATIVE = "6_システム/openqlow_expenses";
const LEDGER_JSONL = "expenses.jsonl";
const LINE_SAFE_CHARS = 4800; // LINE 5000 字制限に余裕を持たせる

// 記録コマンドの先頭語（スラッシュ有無どちらでも可）
const EXPENSE_ALIASES = new Set([
  "経費", "/経費", "けいひ", "/けいひ", "出費", "/出費", "expense", "/expense",
]);
// 月報コマンドの先頭語
const EXPENSE_REPORT_ALIASES = new Set([
  "経費月報", "/経費月報", "経費集計", "/経費集計", "経費レポート", "/経費レポート",
  "けいひげっぽう", "/けいひげっぽう",
]);

export interface ExpenseEntry {
  date: string; // YYYY-MM-DD (JST)
  amount: number; // 円（整数）
  category: string;
  memo: string;
}

export type ParsedExpenseCommand =
  | { ok: true; entry: ExpenseEntry }
  | { ok: false; error: string };

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/^[\s　]*[／\/\\]/, "/")
    .replace(/^\/\s+/, "/")
    .replace(/[ \t　]+/g, " ")
    .trim();
}

function head(text: string): string {
  const [first = ""] = normalize(text).split(/\s|\n/, 1);
  return first.toLowerCase();
}

/** "/経費 ..." 形式かどうか（中身の正否は問わない）。 */
export function isExpenseCommand(text: string): boolean {
  return EXPENSE_ALIASES.has(head(text));
}

/** "/経費月報 ..." 形式かどうか。 */
export function isExpenseReportCommand(text: string): boolean {
  return EXPENSE_REPORT_ALIASES.has(head(text));
}

/** "1,200" / "¥1200" / "1200円" / "1200" を整数の円に変換。失敗時 undefined。 */
function parseAmount(token: string): number | undefined {
  const cleaned = token.replace(/[¥￥,，]/g, "").replace(/円$/, "");
  if (!/^\d+$/.test(cleaned)) return undefined;
  const value = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "/経費 [日付] 金額 カテゴリ [メモ...]" を ExpenseEntry に変換する。
 * /経費 系の先頭語でなければ undefined（別コマンドとして無視させる）。
 */
export function parseExpenseCommand(
  text: string,
  now: Date = new Date(),
): ParsedExpenseCommand | undefined {
  if (!isExpenseCommand(text)) return undefined;

  const normalized = normalize(text);
  const afterCommand = normalized.replace(/^\/?(?:経費|けいひ|出費|expense)\s*/i, "");
  const tokens = afterCommand.split(" ").filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return {
      ok: false,
      error: usage(),
    };
  }

  let date = formatDateInTimeZone(now);
  let index = 0;

  // 先頭が YYYY-MM-DD なら記録日として使う
  if (ISO_DATE.test(tokens[0])) {
    date = tokens[0];
    index = 1;
  }

  const amountToken = tokens[index];
  if (amountToken === undefined) {
    return { ok: false, error: usage() };
  }
  const amount = parseAmount(amountToken);
  if (amount === undefined) {
    return {
      ok: false,
      error: `金額「${amountToken}」を数字として読めませんでした。\n${usage()}`,
    };
  }
  index += 1;

  const category = tokens[index];
  if (!category) {
    return {
      ok: false,
      error: `カテゴリ（勘定科目）が足りません。\n${usage()}`,
    };
  }
  index += 1;

  const memo = tokens.slice(index).join(" ");

  return {
    ok: true,
    entry: { date, amount, category, memo },
  };
}

function usage(): string {
  return [
    "使い方: /経費 金額 カテゴリ メモ",
    "例: /経費 1200 消耗品 ジムの備品",
    "例: /経費 2026-06-01 3000 交通費 セミナー往復",
  ].join("\n");
}

export interface RecordExpenseOptions {
  /** テスト用に保存先ディレクトリを差し替え */
  dirOverride?: string;
  now?: Date;
}

export interface RecordExpenseResult {
  entry: ExpenseEntry;
  jsonlFile: string;
  ledgerFile: string;
}

function expenseDir(opts: RecordExpenseOptions): string {
  return opts.dirOverride ?? obsidianPath(EXPENSE_DIRECTORY_RELATIVE);
}

/** 経費1件を jsonl と 月別 md 台帳に追記する。 */
export async function recordExpense(
  entry: ExpenseEntry,
  opts: RecordExpenseOptions = {},
): Promise<RecordExpenseResult> {
  const dir = expenseDir(opts);
  await fs.mkdir(dir, { recursive: true });

  const ts = (opts.now ?? new Date()).toISOString();
  const payload = {
    ts,
    date: entry.date,
    amount: entry.amount,
    category: entry.category,
    memo: entry.memo,
  };

  const jsonlFile = path.join(dir, LEDGER_JSONL);
  await fs.appendFile(jsonlFile, `${JSON.stringify(payload)}\n`, "utf8");

  const yearMonth = entry.date.slice(0, 7);
  const ledgerFile = path.join(dir, `expenses-${yearMonth}.md`);
  const line = `| ${entry.date} | ${formatYen(entry.amount)} | ${entry.category} | ${entry.memo || "-"} |`;
  await ensureLedgerHeader(ledgerFile, yearMonth);
  await fs.appendFile(ledgerFile, `${line}\n`, "utf8");

  return { entry, jsonlFile, ledgerFile };
}

async function ensureLedgerHeader(file: string, yearMonth: string): Promise<void> {
  try {
    await fs.access(file);
    return; // 既存ファイルにはヘッダを足さない
  } catch {
    const header = [
      `# 経費台帳 ${yearMonth}`,
      "",
      "| 日付 | 金額 | カテゴリ | メモ |",
      "| --- | ---: | --- | --- |",
      "",
    ].join("\n");
    await fs.writeFile(file, header, "utf8");
  }
}

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

// --- 月報（集計） ---

export interface ExpenseReportRequest {
  yearMonth: string; // YYYY-MM
}

/** "/経費月報 [arg]" から YYYY-MM を抽出する。別コマンドなら undefined。 */
export function parseExpenseReportCommand(
  text: string,
  now: Date = new Date(),
  timeZone = "Asia/Tokyo",
): ExpenseReportRequest | undefined {
  if (!isExpenseReportCommand(text)) return undefined;

  const normalized = normalize(text);
  const afterCommand = normalized.replace(
    /^\/?(?:経費月報|経費集計|経費レポート|けいひげっぽう)\s*/,
    "",
  );
  const arg = afterCommand.trim();

  if (!arg || arg === "今月" || arg === "this") {
    return { yearMonth: formatYearMonth(now, timeZone) };
  }
  if (arg === "先月" || arg === "last") {
    return { yearMonth: formatYearMonth(shiftMonths(now, -1, timeZone), timeZone) };
  }

  const ym = arg.match(/^(\d{4})[-\/](\d{1,2})$/);
  if (ym) {
    return { yearMonth: `${ym[1]}-${ym[2].padStart(2, "0")}` };
  }

  const monthOnly = arg.match(/^(\d{1,2})月?$/);
  if (monthOnly) {
    const year = formatYearMonth(now, timeZone).slice(0, 4);
    return { yearMonth: `${year}-${monthOnly[1].padStart(2, "0")}` };
  }

  return undefined;
}

function formatYearMonth(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}`;
}

function shiftMonths(date: Date, delta: number, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const y = Number.parseInt(values.year ?? "0", 10);
  const m = Number.parseInt(values.month ?? "1", 10) - 1;
  const targetMonth = m + delta;
  const targetYear = y + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  return new Date(Date.UTC(targetYear, normalizedMonth, 1, 12, 0, 0));
}

export interface ExpenseReportResult {
  ok: boolean;
  yearMonth: string;
  message: string;
  total: number;
  count: number;
  byCategory: Array<{ category: string; amount: number; count: number }>;
}

export interface BuildExpenseReportOptions {
  dirOverride?: string;
  readFile?: (p: string) => Promise<string>;
}

/** 指定月の経費を jsonl から集計し、LINE 用1メッセージに整形して返す。 */
export async function buildExpenseReport(
  req: ExpenseReportRequest,
  opts: BuildExpenseReportOptions = {},
): Promise<ExpenseReportResult> {
  const dir = opts.dirOverride ?? obsidianPath(EXPENSE_DIRECTORY_RELATIVE);
  const readFile = opts.readFile ?? ((p) => fs.readFile(p, "utf-8"));
  const jsonlPath = path.join(dir, LEDGER_JSONL);

  let raw: string;
  try {
    raw = await readFile(jsonlPath);
  } catch {
    return emptyReport(req.yearMonth, "経費台帳がまだありません。\n「/経費 金額 カテゴリ メモ」で1件目を記録できます。");
  }

  const entries = parseLedger(raw).filter((e) => e.date.startsWith(`${req.yearMonth}-`));

  if (entries.length === 0) {
    return emptyReport(req.yearMonth, "この月の経費はまだありません。");
  }

  const byCategoryMap = new Map<string, { amount: number; count: number }>();
  let total = 0;
  for (const entry of entries) {
    total += entry.amount;
    const current = byCategoryMap.get(entry.category) ?? { amount: 0, count: 0 };
    current.amount += entry.amount;
    current.count += 1;
    byCategoryMap.set(entry.category, current);
  }

  const byCategory = [...byCategoryMap.entries()]
    .map(([category, v]) => ({ category, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  const lines = [
    `[OPENQLOW 経費月報] ${req.yearMonth}`,
    "",
    `合計: ${formatYen(total)}（${entries.length}件）`,
    "",
    "カテゴリ別:",
    ...byCategory.map(
      (c) => `- ${c.category}: ${formatYen(c.amount)}（${c.count}件）`,
    ),
  ];

  const { text, truncated } = truncateForLine(lines.join("\n"), LINE_SAFE_CHARS);
  if (truncated) {
    // 末尾は注記済み
  }

  return {
    ok: true,
    yearMonth: req.yearMonth,
    message: text,
    total,
    count: entries.length,
    byCategory,
  };
}

function emptyReport(yearMonth: string, body: string): ExpenseReportResult {
  return {
    ok: true,
    yearMonth,
    message: [`[OPENQLOW 経費月報] ${yearMonth}`, "", body].join("\n"),
    total: 0,
    count: 0,
    byCategory: [],
  };
}

/** jsonl 本文を ExpenseEntry の配列に。壊れた行は飛ばす。 */
export function parseLedger(raw: string): ExpenseEntry[] {
  const entries: ExpenseEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as Partial<ExpenseEntry>;
      if (
        typeof obj.date === "string" &&
        typeof obj.amount === "number" &&
        typeof obj.category === "string"
      ) {
        entries.push({
          date: obj.date,
          amount: obj.amount,
          category: obj.category,
          memo: typeof obj.memo === "string" ? obj.memo : "",
        });
      }
    } catch {
      // 壊れた行は無視
    }
  }
  return entries;
}

function truncateForLine(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const cutHint = "\n…（長いので途中まで。続きはObsidianで6_システム/openqlow_expenses/）";
  const room = max - cutHint.length;
  let breakAt = text.lastIndexOf("\n", room);
  if (breakAt < room / 2) breakAt = room;
  return { text: text.slice(0, breakAt) + cutHint, truncated: true };
}
