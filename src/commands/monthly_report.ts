// /月報 月次閲覧コマンド
// Obsidian Vault の openqlow_crm_logs/YYYY-MM-DD.md を月単位で集め、
// 日付順に上から下へ並べた要約を LINE に返す。
//
// 仕様:
//  - 引数なし          → 今月（JST）
//  - "今月"            → 今月
//  - "先月"            → 先月
//  - "YYYY-MM"         → 指定月
//  - "M" / "M月"       → 今年の指定月

import fs from "node:fs/promises";
import path from "node:path";
import { obsidianPath } from "../utils/paths.js";
import { canonicalLineCommand, normalizeLineText } from "../line_bot/normalize_command.js";

const CRM_LOG_DIRECTORY_RELATIVE = "6_システム/openqlow_crm_logs";
const LINE_SAFE_CHARS = 4800; // LINE 5000 字制限に余裕を持たせる
const AI_META_KEYS = new Set(["記録時刻", "ジャンル数", "エントリ数"]);
const SKIP_VALUES = new Set(["なし", "無し", "ない", ""]);

export interface MonthlyReportRequest {
  yearMonth: string; // "YYYY-MM"
}

/**
 * "/月報 [arg]" 形式から YYYY-MM を抽出する。
 * /月報 のキャノニカル判定済みでない素のテキストでも受ける。
 */
export function parseMonthlyReportCommand(
  text: string,
  now: Date = new Date(),
  timeZone = "Asia/Tokyo",
): MonthlyReportRequest | undefined {
  if (canonicalLineCommand(text) !== "/月報") return undefined;

  const normalized = normalizeLineText(text);
  const afterCommand = normalized.replace(/^\/?(?:月報|げっぽう|今月の日報|月次|monthly)\s*/, "");
  const arg = afterCommand.trim();

  if (!arg) {
    return { yearMonth: formatYearMonth(now, timeZone) };
  }

  if (arg === "今月" || arg === "this") {
    return { yearMonth: formatYearMonth(now, timeZone) };
  }
  if (arg === "先月" || arg === "last") {
    return { yearMonth: formatYearMonth(shiftMonths(now, -1, timeZone), timeZone) };
  }

  const ym = arg.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ym) {
    const month = ym[2].padStart(2, "0");
    return { yearMonth: `${ym[1]}-${month}` };
  }

  const monthOnly = arg.match(/^(\d{1,2})月?$/);
  if (monthOnly) {
    const currentYm = formatYearMonth(now, timeZone);
    const year = currentYm.slice(0, 4);
    const month = monthOnly[1].padStart(2, "0");
    return { yearMonth: `${year}-${month}` };
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
  // 月境界跨ぎを安全に扱うため、対象 TZ でのフィールドを取って再構成する
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const y = Number.parseInt(values.year ?? "0", 10);
  const m = Number.parseInt(values.month ?? "1", 10) - 1; // 0-indexed
  const targetMonth = m + delta;
  const targetYear = y + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  return new Date(Date.UTC(targetYear, normalizedMonth, 1, 12, 0, 0));
}

export interface MonthlyReportResult {
  ok: boolean;
  yearMonth: string;
  message: string;
  fileCount: number;
  truncated: boolean;
}

export interface BuildMonthlyReportOptions {
  /** テスト用に保存先ディレクトリを差し替え */
  dirOverride?: string;
  /** テスト用 fs reader */
  readdir?: (p: string) => Promise<string[]>;
  readFile?: (p: string) => Promise<string>;
}

/**
 * 指定月の日報をかき集め、LINE 用1メッセージ（上限4800字）に整形して返す。
 */
export async function buildMonthlyReport(
  req: MonthlyReportRequest,
  opts: BuildMonthlyReportOptions = {},
): Promise<MonthlyReportResult> {
  const dir = opts.dirOverride ?? obsidianPath(CRM_LOG_DIRECTORY_RELATIVE);
  const readdir = opts.readdir ?? ((p) => fs.readdir(p));
  const readFile = opts.readFile ?? ((p) => fs.readFile(p, "utf-8"));

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return {
      ok: true,
      yearMonth: req.yearMonth,
      message: [
        `[OPENQLOW 月報] ${req.yearMonth}`,
        "",
        "保存先フォルダがまだありません。",
        "「/日報」か「/おはよう」で1日分を保存すると、ここに溜まっていきます。",
      ].join("\n"),
      fileCount: 0,
      truncated: false,
    };
  }

  const targetFiles = files
    .filter((f) => f.endsWith(".md") && f.startsWith(req.yearMonth + "-"))
    .sort();

  if (targetFiles.length === 0) {
    return {
      ok: true,
      yearMonth: req.yearMonth,
      message: [
        `[OPENQLOW 月報] ${req.yearMonth}`,
        "",
        "この月の日報はまだありません。",
        "「/日報」で1日分を記録できます。",
      ].join("\n"),
      fileCount: 0,
      truncated: false,
    };
  }

  const header = `[OPENQLOW 月報] ${req.yearMonth}（${targetFiles.length}日分）`;
  const blocks: string[] = [header, ""];

  for (const file of targetFiles) {
    const date = file.replace(/\.md$/, "");
    let content: string;
    try {
      content = await readFile(path.join(dir, file));
    } catch {
      blocks.push(`## ${date}`, "- （読み込みエラー）", "");
      continue;
    }
    blocks.push(summarizeDay(date, content));
    blocks.push("");
  }

  const combined = blocks.join("\n").trimEnd();
  const { text, truncated } = truncateForLine(combined, LINE_SAFE_CHARS);

  return {
    ok: true,
    yearMonth: req.yearMonth,
    message: text,
    fileCount: targetFiles.length,
    truncated,
  };
}

/**
 * 1日分の Markdown ファイル本文から、見出し付きの要約ブロックを作る。
 * - frontmatter は除外
 * - "- key: value" 形式のデータ行のみ抽出
 * - AI メタ（記録時刻 等）と「なし」値はスキップ
 * - 複数追記がある日は重複行を排除して並べる
 */
export function summarizeDay(date: string, content: string): string {
  const body = content.replace(/^---[\s\S]*?---\n/, "");
  const bulletRegex = /^-\s+([^:]+):\s*(.+)$/gm;
  const seen = new Set<string>();
  const bullets: string[] = [];

  for (const match of body.matchAll(bulletRegex)) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (AI_META_KEYS.has(key)) continue;
    if (SKIP_VALUES.has(value)) continue;
    const line = `- ${key}: ${value}`;
    if (seen.has(line)) continue;
    seen.add(line);
    bullets.push(line);
  }

  if (bullets.length === 0) {
    return `## ${date}\n- （記録なし）`;
  }
  return [`## ${date}`, ...bullets].join("\n");
}

function truncateForLine(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const cutHint = "\n…（長いので途中まで。続きはObsidianで6_システム/openqlow_crm_logs/）";
  const room = max - cutHint.length;
  // 改行で綺麗に切る
  let breakAt = text.lastIndexOf("\n", room);
  if (breakAt < room / 2) breakAt = room;
  return { text: text.slice(0, breakAt) + cutHint, truncated: true };
}
