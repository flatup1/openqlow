import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { readTrialKpiSummary } from "../commands/trial_kpi.js";

interface CapturedMemo {
  timestamp: string;
  status: string;
  body: string;
  file: string;
}

function compact(value: string, max = 90): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function parseMemoBlocks(text: string, file: string): CapturedMemo[] {
  const sectionHeadings = Array.from(text.matchAll(/^## .+$/gm));
  const headings = sectionHeadings.filter(heading => /^## LINE(?:自動メモ|追記) /.test(heading[0]));
  return headings.map((heading) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = sectionHeadings.find(section => (section.index ?? 0) > (heading.index ?? 0))?.index ?? text.length;
    const block = text.slice(start, end).trim();
    const timestamp = heading[0].replace(/^## LINE(?:自動メモ|追記) /, "").trim();
    const status = block.match(/^- status:\s*(.+)$/m)?.[1]?.trim() || "IDEA";
    const body = block
      .split("\n")
      .filter(line => !/^- (?:source|status|capture):/.test(line))
      .filter(line => !/^---$/.test(line.trim()))
      .join("\n")
      .trim();
    return { timestamp, status, body: compact(body), file };
  }).filter(memo => memo.body);
}

async function readRecentMemos(vaultRoot: string): Promise<CapturedMemo[]> {
  const dir = path.join(vaultRoot, "01_DAILY_OPERATIONS", "daily_logs");
  let names: string[];
  try {
    names = (await readdir(dir)).filter(name => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort().slice(-14);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const groups = await Promise.all(names.map(async name => parseMemoBlocks(await readFile(path.join(dir, name), "utf8"), name)));
  return groups.flat().sort((a, b) => `${a.file}:${a.timestamp}`.localeCompare(`${b.file}:${b.timestamp}`));
}

function bullets(values: string[], empty: string, limit = 3): string[] {
  const selected = values.filter(Boolean).slice(-limit).reverse();
  return selected.length ? selected.map(value => `- ${value}`) : [`- ${empty}`];
}

export async function buildManagementBrief(vaultRoot: string, dateJst: string, now: Date = new Date()): Promise<string> {
  const [memos, kpi] = await Promise.all([
    readRecentMemos(vaultRoot),
    readTrialKpiSummary(vaultRoot, now),
  ]);
  const latest = memos.map(memo => compact(memo.body));
  const pending = memos
    .filter(memo => ["CONSIDERING", "IMPLEMENTING"].includes(memo.status))
    .map(memo => `[${memo.status}] ${compact(memo.body)}`);
  const decided = memos
    .filter(memo => memo.status === "DECIDED")
    .map(memo => compact(memo.body));
  const rate = kpi.enrollmentRate === null ? "未集計" : `${(kpi.enrollmentRate * 100).toFixed(1)}%`;
  const todayTask = kpi.pending > 0
    ? `参加確認待ち${kpi.pending}件を確認し、結果をLINEで記録する`
    : `月間体験予約30件へ向け、予約につながる行動を1つ実行する`;

  return [
    `☀ おはようございます (${dateJst})`,
    "",
    "【前回】",
    ...bullets(latest, "記録なし"),
    "",
    "【現在】",
    `- 月間体験予約: ${kpi.bookings}/${kpi.targetBookings}件`,
    ...(kpi.bookings === 0 ? ["- 参考値: 約10件/月（JIN自己申告・未集計。実績としては未登録）"] : []),
    `- 体験参加: ${kpi.attended}件 / 入会: ${kpi.enrolled}件 / 入会率: ${rate}`,
    "",
    "【今日】",
    `- ${todayTask}`,
    "",
    "【正式決定】",
    ...bullets(decided, "新しい正式決定なし"),
    "",
    "【保留・実装中】",
    ...bullets(pending, "なし"),
    "",
    "【今やらなくていいこと】",
    "- 新しいSaaS・RAG・ベクトルDBの追加",
    "",
    "根拠: Obsidian日次ログ / 体験予約・入会管理",
    "今日の最重要タスクはこれで進めてよいですか？",
  ].join("\n");
}
