// 会計記録（経費帳簿）
//
// 目的:
//  - LINE / CLI から経費を1件ずつ記録する。
//  - Obsidian Vault に機械可読(.jsonl) と 人が読む月別台帳(.md) の二本立てで追記する。
//  - その月の経費をカテゴリ別に合計し、消費税の目安も添えて LINE 1メッセージで返す。
//  - 確定申告/表計算向けに月単位の CSV を書き出す。
//  - 保存先は Obsidian なので、既存の /push コマンドでそのまま GitHub へ送れる。
//
// 記録コマンド:
//   /経費 1200 消耗品 ジムの備品
//   /経費 1200 消耗品 8% ジムの備品                ← 税率を指定（既定 10%）
//   /経費 2026-06-01 1,200 会議費 打ち合わせ        ← 先頭に日付を置くと過去日付で記録
//   /経費 ¥3000 交通費                              ← メモ省略可
//
// 集計コマンド:
//   /経費月報 [今月|先月|YYYY-MM|M月]
//   /経費CSV  [今月|先月|YYYY-MM|M月]   → 月の CSV を書き出す
//   /経費カテゴリ                        → 使えるカテゴリ（勘定科目）一覧

import fs from "node:fs/promises";
import path from "node:path";
import { obsidianPath } from "../utils/paths.js";
import { formatDateInTimeZone } from "../utils/date.js";
import { type ExpenseEntry, DEFAULT_TAX_RATE, taxAmount } from "./expense_model.js";
import {
  type ExportFormat,
  buildExport,
  buildGenericCsv,
  parseFormatToken,
} from "./expense_export.js";

// 後方互換: これらは expense_model / expense_export からの再エクスポート。
export { taxAmount } from "./expense_model.js";
export type { ExpenseEntry } from "./expense_model.js";
export { buildGenericCsv as buildExpenseCsv } from "./expense_export.js";
export type { ExportFormat } from "./expense_export.js";

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
// CSV 出力コマンドの先頭語（head() で小文字化されるので csv は小文字で持つ）
const EXPENSE_CSV_ALIASES = new Set([
  "経費csv", "/経費csv", "経費エクスポート", "/経費エクスポート",
]);
// カテゴリ一覧コマンドの先頭語
const EXPENSE_CATEGORY_ALIASES = new Set([
  "経費カテゴリ", "/経費カテゴリ", "経費科目", "/経費科目", "勘定科目", "/勘定科目",
]);

// 勘定科目（よく使うもの）。入力エイリアス → 正規名。
const CATEGORY_ALIASES: Record<string, string> = {
  "消耗品": "消耗品費", "消耗品費": "消耗品費", "備品": "消耗品費",
  "交通費": "旅費交通費", "旅費": "旅費交通費", "旅費交通費": "旅費交通費", "交通": "旅費交通費", "ガソリン": "旅費交通費",
  "会議費": "会議費", "打ち合わせ": "会議費", "ミーティング": "会議費",
  "接待": "接待交際費", "交際費": "接待交際費", "接待交際費": "接待交際費",
  "通信費": "通信費", "通信": "通信費", "携帯": "通信費", "ネット": "通信費",
  "水道光熱費": "水道光熱費", "光熱費": "水道光熱費", "電気": "水道光熱費", "水道": "水道光熱費", "ガス": "水道光熱費",
  "家賃": "地代家賃", "地代家賃": "地代家賃", "賃料": "地代家賃",
  "広告": "広告宣伝費", "広告宣伝費": "広告宣伝費", "宣伝": "広告宣伝費",
  "図書": "新聞図書費", "書籍": "新聞図書費", "新聞図書費": "新聞図書費", "本": "新聞図書費",
  "外注": "外注費", "外注費": "外注費",
  "研修": "研修費", "研修費": "研修費", "セミナー": "研修費",
  "消耗品以外": "雑費", "雑費": "雑費",
};
const CANONICAL_CATEGORIES = [...new Set(Object.values(CATEGORY_ALIASES))];

export type ParsedExpenseCommand =
  | { ok: true; entry: ExpenseEntry; knownCategory: boolean }
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

/** コマンド本体（先頭トークン）を除いた引数部分。 */
function argPart(text: string): string {
  return normalize(text).split(/\s+/).slice(1).join(" ").trim();
}

/** "/経費 ..." 形式かどうか（中身の正否は問わない）。 */
export function isExpenseCommand(text: string): boolean {
  return EXPENSE_ALIASES.has(head(text));
}

/** "/経費月報 ..." 形式かどうか。 */
export function isExpenseReportCommand(text: string): boolean {
  return EXPENSE_REPORT_ALIASES.has(head(text));
}

/** "/経費CSV ..." 形式かどうか。 */
export function isExpenseCsvCommand(text: string): boolean {
  return EXPENSE_CSV_ALIASES.has(head(text));
}

/** "/経費カテゴリ" 形式かどうか。 */
export function isExpenseCategoryCommand(text: string): boolean {
  return EXPENSE_CATEGORY_ALIASES.has(head(text));
}

/** 入力カテゴリを正規の勘定科目に寄せる。未知ならそのまま、known=false。 */
export function normalizeCategory(input: string): { category: string; known: boolean } {
  const key = input.trim();
  const canonical = CATEGORY_ALIASES[key];
  if (canonical) return { category: canonical, known: true };
  return { category: key, known: false };
}

/** 使える勘定科目の一覧。 */
export function listCategories(): string[] {
  return CANONICAL_CATEGORIES;
}

/** "1,200" / "¥1200" / "1200円" / "1200" を整数の円に変換。失敗時 undefined。 */
function parseAmount(token: string): number | undefined {
  const cleaned = token.replace(/[¥￥,，]/g, "").replace(/円$/, "");
  if (!/^\d+$/.test(cleaned)) return undefined;
  const value = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

/** "8%" / "税10%" / "非課税" 等を税率(%)に。税トークンでなければ undefined。 */
function parseTaxToken(token: string): number | undefined {
  const t = token.normalize("NFKC");
  if (/^(非課税|不課税)$/.test(t)) return 0;
  const m = t.match(/^(?:税)?(\d{1,2})[%％]$/);
  if (m) {
    const rate = Number.parseInt(m[1], 10);
    if (rate === 0 || rate === 8 || rate === 10) return rate;
  }
  return undefined;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "/経費 [日付] 金額 [税率] カテゴリ [メモ...]" を ExpenseEntry に変換する。
 * /経費 系の先頭語でなければ undefined（別コマンドとして無視させる）。
 */
export function parseExpenseCommand(
  text: string,
  now: Date = new Date(),
): ParsedExpenseCommand | undefined {
  if (!isExpenseCommand(text)) return undefined;

  const afterCommand = argPart(text);
  const tokens = afterCommand.split(" ").filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return { ok: false, error: usage() };
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

  // 税率トークン（8% 等）は「金額の直後」または「カテゴリの直後」だけで拾う。
  // メモ中に出てくる "10%" や "非課税" を巻き込まないよう、位置を限定する。
  const rest = tokens.slice(index);
  let taxRate = DEFAULT_TAX_RATE;
  let taxSeen = false;

  if (rest.length > 0 && parseTaxToken(rest[0]) !== undefined) {
    taxRate = parseTaxToken(rest[0])!;
    rest.shift();
    taxSeen = true;
  }

  const categoryRaw = rest.shift();
  if (!categoryRaw) {
    return { ok: false, error: `カテゴリ（勘定科目）が足りません。\n${usage()}` };
  }
  const { category, known } = normalizeCategory(categoryRaw);

  if (!taxSeen && rest.length > 0 && parseTaxToken(rest[0]) !== undefined) {
    taxRate = parseTaxToken(rest[0])!;
    rest.shift();
  }

  const memo = rest.join(" ");

  return {
    ok: true,
    knownCategory: known,
    entry: { date, amount, category, memo, taxRate },
  };
}

function usage(): string {
  return [
    "使い方: /経費 金額 カテゴリ メモ",
    "例: /経費 1200 消耗品 ジムの備品",
    "例: /経費 2026-06-01 3000 交通費 セミナー往復",
    "税率を変える時: /経費 800 新聞図書費 8%（軽減税率）",
  ].join("\n");
}

export interface RecordExpenseOptions {
  /** テスト用に保存先ディレクトリを差し替え */
  dirOverride?: string;
  now?: Date;
}

export interface RecordExpenseResult {
  entry: Required<ExpenseEntry>;
  jsonlFile: string;
  ledgerFile: string;
}

function expenseDir(opts: { dirOverride?: string }): string {
  return opts.dirOverride ?? obsidianPath(EXPENSE_DIRECTORY_RELATIVE);
}

/** 経費1件を jsonl と 月別 md 台帳に追記する。 */
export async function recordExpense(
  entry: ExpenseEntry,
  opts: RecordExpenseOptions = {},
): Promise<RecordExpenseResult> {
  const dir = expenseDir(opts);
  await fs.mkdir(dir, { recursive: true });

  const taxRate = entry.taxRate ?? DEFAULT_TAX_RATE;
  const resolved: Required<ExpenseEntry> = {
    date: entry.date,
    amount: entry.amount,
    category: entry.category,
    memo: entry.memo,
    taxRate,
  };

  const ts = (opts.now ?? new Date()).toISOString();
  const payload = { ts, ...resolved };

  const jsonlFile = path.join(dir, LEDGER_JSONL);
  await fs.appendFile(jsonlFile, `${JSON.stringify(payload)}\n`, "utf8");

  const yearMonth = entry.date.slice(0, 7);
  const ledgerFile = path.join(dir, `expenses-${yearMonth}.md`);
  const line = `| ${resolved.date} | ${formatYen(resolved.amount)} | ${resolved.taxRate}% | ${resolved.category} | ${resolved.memo || "-"} |`;
  await ensureLedgerHeader(ledgerFile, yearMonth);
  await fs.appendFile(ledgerFile, `${line}\n`, "utf8");

  return { entry: resolved, jsonlFile, ledgerFile };
}

async function ensureLedgerHeader(file: string, yearMonth: string): Promise<void> {
  try {
    await fs.access(file);
    return; // 既存ファイルにはヘッダを足さない
  } catch {
    const header = [
      `# 経費台帳 ${yearMonth}`,
      "",
      "| 日付 | 金額(税込) | 税率 | カテゴリ | メモ |",
      "| --- | ---: | ---: | --- | --- |",
      "",
    ].join("\n");
    await fs.writeFile(file, header, "utf8");
  }
}

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

// --- 月の読み込み・解決（report / csv 共通） ---

export interface ExpenseMonthRequest {
  yearMonth: string; // YYYY-MM
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

/** "今月/先月/YYYY-MM/M月/M" を YYYY-MM に解決。未対応なら undefined。 */
function monthFromArg(arg: string, now: Date, timeZone: string): string | undefined {
  if (!arg || arg === "今月" || arg === "this") return formatYearMonth(now, timeZone);
  if (arg === "先月" || arg === "last") return formatYearMonth(shiftMonths(now, -1, timeZone), timeZone);

  const ym = arg.match(/^(\d{4})[-\/](\d{1,2})$/);
  if (ym && inMonthRange(ym[2])) return `${ym[1]}-${ym[2].padStart(2, "0")}`;

  const monthOnly = arg.match(/^(\d{1,2})月?$/);
  if (monthOnly && inMonthRange(monthOnly[1])) {
    const year = formatYearMonth(now, timeZone).slice(0, 4);
    return `${year}-${monthOnly[1].padStart(2, "0")}`;
  }
  return undefined;
}

function inMonthRange(month: string): boolean {
  const m = Number.parseInt(month, 10);
  return m >= 1 && m <= 12;
}

/** "/経費月報 [arg]" から YYYY-MM を抽出する。別コマンドなら undefined。 */
export function parseExpenseReportCommand(
  text: string,
  now: Date = new Date(),
  timeZone = "Asia/Tokyo",
): ExpenseMonthRequest | undefined {
  if (!isExpenseReportCommand(text)) return undefined;
  const yearMonth = monthFromArg(argPart(text), now, timeZone);
  return yearMonth ? { yearMonth } : undefined;
}

export interface ExpenseCsvRequest extends ExpenseMonthRequest {
  format: ExportFormat;
}

/**
 * "/経費CSV [形式] [arg]" から 形式 と YYYY-MM を抽出する。
 * 形式トークン（弥生/yayoi/freee/汎用）は位置自由。既定は generic。
 * /経費CSV 系でなければ undefined。
 */
export function parseExpenseCsvCommand(
  text: string,
  now: Date = new Date(),
  timeZone = "Asia/Tokyo",
): ExpenseCsvRequest | undefined {
  if (!isExpenseCsvCommand(text)) return undefined;

  const tokens = argPart(text).split(" ").filter((t) => t.length > 0);
  let format: ExportFormat = "generic";
  const rest: string[] = [];
  for (const token of tokens) {
    const f = parseFormatToken(token);
    if (f) format = f;
    else rest.push(token);
  }

  const yearMonth = monthFromArg(rest.join(" "), now, timeZone);
  return yearMonth ? { yearMonth, format } : undefined;
}

// --- 月報（集計） ---

export interface ExpenseReportResult {
  ok: boolean;
  yearMonth: string;
  message: string;
  total: number; // 税込合計
  taxTotal: number; // 内税（消費税）の目安合計
  count: number;
  byCategory: Array<{ category: string; amount: number; count: number }>;
}

export interface ReadLedgerOptions {
  dirOverride?: string;
  readFile?: (p: string) => Promise<string>;
}

/** 指定月の経費を jsonl から読み込む（日付昇順）。台帳が無ければ空配列。 */
async function readMonthEntries(
  yearMonth: string,
  opts: ReadLedgerOptions,
): Promise<Required<ExpenseEntry>[] | undefined> {
  const dir = opts.dirOverride ?? obsidianPath(EXPENSE_DIRECTORY_RELATIVE);
  const readFile = opts.readFile ?? ((p) => fs.readFile(p, "utf-8"));
  let raw: string;
  try {
    raw = await readFile(path.join(dir, LEDGER_JSONL));
  } catch {
    return undefined; // 台帳ファイル自体が無い
  }
  return parseLedger(raw)
    .filter((e) => e.date.startsWith(`${yearMonth}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 指定月の経費を集計し、LINE 用1メッセージに整形して返す。 */
export async function buildExpenseReport(
  req: ExpenseMonthRequest,
  opts: ReadLedgerOptions = {},
): Promise<ExpenseReportResult> {
  const entries = await readMonthEntries(req.yearMonth, opts);

  if (entries === undefined) {
    return emptyReport(req.yearMonth, "経費台帳がまだありません。\n「/経費 金額 カテゴリ メモ」で1件目を記録できます。");
  }
  if (entries.length === 0) {
    return emptyReport(req.yearMonth, "この月の経費はまだありません。");
  }

  const byCategoryMap = new Map<string, { amount: number; count: number }>();
  let total = 0;
  let taxTotal = 0;
  for (const entry of entries) {
    total += entry.amount;
    taxTotal += taxAmount(entry.amount, entry.taxRate);
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
    `合計(税込): ${formatYen(total)}（${entries.length}件）`,
    `うち消費税(目安): ${formatYen(taxTotal)}`,
    "",
    "カテゴリ別:",
    ...byCategory.map((c) => `- ${c.category}: ${formatYen(c.amount)}（${c.count}件）`),
  ];

  const { text } = truncateForLine(lines.join("\n"), LINE_SAFE_CHARS);

  return {
    ok: true,
    yearMonth: req.yearMonth,
    message: text,
    total,
    taxTotal,
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
    taxTotal: 0,
    count: 0,
    byCategory: [],
  };
}

/** jsonl 本文を ExpenseEntry の配列に。壊れた行は飛ばす。税率欠落は既定値。 */
export function parseLedger(raw: string): Required<ExpenseEntry>[] {
  const entries: Required<ExpenseEntry>[] = [];
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
          taxRate: typeof obj.taxRate === "number" ? obj.taxRate : DEFAULT_TAX_RATE,
        });
      }
    } catch {
      // 壊れた行は無視
    }
  }
  return entries;
}

// --- CSV 出力（会計ソフト向けアダプタは expense_export に委譲） ---

export interface ExportCsvResult {
  ok: boolean;
  yearMonth: string;
  format: ExportFormat;
  file?: string;
  count: number;
  message: string;
}

export interface ExportCsvOptions extends ReadLedgerOptions {
  /** 出力フォーマット。既定 generic。req.format があればそちらを優先。 */
  format?: ExportFormat;
  /** 経費の相手（貸方）勘定科目。個人事業主の既定は事業主借。 */
  creditAccount?: string;
  /** YYYY-MM-DD → 各ソフトの日付表記へ変換（弥生で和暦にしたい時など）。 */
  formatDate?: (isoDate: string) => string;
}

const FORMAT_LABEL: Record<ExportFormat, string> = {
  generic: "汎用",
  yayoi: "弥生会計",
  freee: "freee",
};

/**
 * 指定月の経費を、指定フォーマットの CSV としてエクスポートする。
 *  - generic … expenses-YYYY-MM.csv（表計算/Excel 向け）
 *  - yayoi   … expenses-YYYY-MM-yayoi.csv（弥生 仕訳インポート形式）
 * 形式は req.format（コマンド由来）または opts.format で指定。
 */
export async function exportExpenseCsv(
  req: ExpenseMonthRequest | ExpenseCsvRequest,
  opts: ExportCsvOptions = {},
): Promise<ExportCsvResult> {
  const format: ExportFormat = ("format" in req ? req.format : undefined) ?? opts.format ?? "generic";

  const entries = await readMonthEntries(req.yearMonth, opts);
  if (!entries || entries.length === 0) {
    return {
      ok: false,
      yearMonth: req.yearMonth,
      format,
      count: 0,
      message: `${req.yearMonth} の経費がまだありません。CSV は作りませんでした。`,
    };
  }

  const artifact = buildExport(format, entries, {
    creditAccount: opts.creditAccount,
    formatDate: opts.formatDate,
  });
  if (!artifact.supported) {
    return {
      ok: false,
      yearMonth: req.yearMonth,
      format,
      count: entries.length,
      message: artifact.message ?? `${format} 形式は未対応です。`,
    };
  }

  const dir = opts.dirOverride ?? obsidianPath(EXPENSE_DIRECTORY_RELATIVE);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `expenses-${req.yearMonth}${artifact.fileSuffix}.csv`);
  await fs.writeFile(file, artifact.content, "utf8");

  return {
    ok: true,
    yearMonth: req.yearMonth,
    format,
    file,
    count: entries.length,
    message: [
      `[OPENQLOW 経費CSV/${FORMAT_LABEL[format]}] ${req.yearMonth}（${entries.length}件）を書き出しました。`,
      file,
      "",
      "GitHubへ反映するには「/push」を送ってください。",
    ].join("\n"),
  };
}

/** /経費カテゴリ への返信メッセージ。 */
export function buildCategoryListMessage(): string {
  return [
    "[OPENQLOW 経費カテゴリ] よく使う勘定科目:",
    ...CANONICAL_CATEGORIES.map((c) => `- ${c}`),
    "",
    "※ 一覧に無い言葉でもそのまま記録できます（後で直せます）。",
    "※ 「消耗品」「交通費」などの略称は自動で正式名に寄せます。",
  ].join("\n");
}

function truncateForLine(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const cutHint = "\n…（長いので途中まで。続きはObsidianで6_システム/openqlow_expenses/）";
  const room = max - cutHint.length;
  let breakAt = text.lastIndexOf("\n", room);
  if (breakAt < room / 2) breakAt = room;
  return { text: text.slice(0, breakAt) + cutHint, truncated: true };
}
