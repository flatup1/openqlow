// 自己改善ループ オーケストレータ（毎日1回）。
//
//   ① 取り込み: 受信箱(OPENQLOW_LOG_INBOX, 既定 Vault daily_logs)の生ログ → knowledge/sources/（PII除去）
//   ② 採点    : openQLOW の返信生成を代表ケースで採点 → scorecard
//   ③ 改善提案: 前回 scorecard と比較 → 改善案（人間承認用）
//
// 出力は knowledge/sources/loop/ と Vault 6_システム/openqlow_loop/ に保存するだけ。
// **自動送信・自動マージはしない**。
// 実行: npm run loop

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ingestToMarkdown, sourceFileName } from "./ingest.js";
import { buildScorecard, renderScorecardMarkdown, type Scorecard } from "./score.js";
import { compareScorecards, renderImprovementReport } from "./report.js";
import { generateInquiryReply } from "../generators/inquiry_reply.js";
import { loadConfig } from "../config.js";
import { formatDateInTimeZone } from "../utils/date.js";

export interface LoopRunOptions {
  root?: string;
  inbox?: string;
  vaultRoot?: string;
  vaultLoopDir?: string;
  now?: Date;
}

export interface LoopRunResult {
  date: string;
  ingested: number;
  avgTotal: number;
  failRate: number;
  outputDirs: string[];
}

function today(now = new Date()): string {
  return formatDateInTimeZone(now, "Asia/Tokyo");
}

function resolveRoot(opts: LoopRunOptions): string {
  return opts.root ?? process.env.OPENQLOW_ROOT ?? process.cwd();
}

function resolveVaultRoot(opts: LoopRunOptions): string {
  return opts.vaultRoot ?? loadConfig().obsidianVaultRoot;
}

function resolveInbox(root: string, opts: LoopRunOptions): string {
  return (
    opts.inbox ??
    process.env.OPENQLOW_LOG_INBOX ??
    path.join(resolveVaultRoot(opts), "01_DAILY_OPERATIONS", "daily_logs") ??
    path.join(root, "knowledge", "_inbox")
  );
}

function resolveLoopDirs(root: string, opts: LoopRunOptions): string[] {
  const primary = path.join(root, "knowledge", "sources", "loop");
  if (process.env.OPENQLOW_LOOP_VAULT_DISABLED === "true") return [primary];

  const vaultLoop =
    opts.vaultLoopDir ??
    process.env.OPENQLOW_LOOP_OUT_DIR ??
    path.join(resolveVaultRoot(opts), "6_システム", "openqlow_loop");
  return vaultLoop === primary ? [primary] : [primary, vaultLoop];
}

async function ingestInbox(date: string, inbox: string, sources: string): Promise<number> {
  let files: string[];
  try {
    files = await readdir(inbox);
  } catch {
    return 0; // 受信箱が無ければスキップ
  }
  let n = 0;
  for (const f of files) {
    if (!f.endsWith(".md") && !f.endsWith(".txt")) continue;
    const raw = await readFile(path.join(inbox, f), "utf8");
    const title = f.replace(/\.(md|txt)$/, "");
    const md = ingestToMarkdown({ raw, title, date, kind: "ingested" });
    await mkdir(sources, { recursive: true });
    await writeFile(path.join(sources, sourceFileName(date, title)), md, "utf8");
    n++;
  }
  return n;
}

// openQLOW の返信生成を代表ケースで集め、品質を採点する（システム自身の健康診断）。
function representativeReplies(): string[] {
  const inquiries = [
    "小学生の子供に習わせたいのですが初心者でも大丈夫ですか？",
    "ダイエットで通いたい女性です。料金を教えてください",
    "運動不足の男です",
    "仕事の後だと間に合うか不安です。キックは途中参加できますか？",
  ];
  const replies: string[] = [];
  for (const message of inquiries) {
    const r = generateInquiryReply({ message }).replies;
    replies.push(r.polite, r.short, r.bookingFocused, r.followUp24h, r.followUp3d);
    if (r.obstacleConsult) replies.push(r.obstacleConsult);
  }
  return replies;
}

async function loadPrevScorecard(loopDir: string): Promise<Scorecard | null> {
  try {
    const raw = await readFile(path.join(loopDir, "latest-scorecard.json"), "utf8");
    return JSON.parse(raw) as Scorecard;
  } catch {
    return null;
  }
}

export async function runLoop(opts: LoopRunOptions = {}): Promise<LoopRunResult> {
  const root = resolveRoot(opts);
  const sources = path.join(root, "knowledge", "sources");
  const loopDirs = resolveLoopDirs(root, opts);
  const primaryLoopDir = loopDirs[0];
  const date = today(opts.now);
  await mkdir(primaryLoopDir, { recursive: true });

  const ingested = await ingestInbox(date, resolveInbox(root, opts), sources);

  const prev = await loadPrevScorecard(primaryLoopDir);
  const sc = buildScorecard(representativeReplies(), date);
  const report = compareScorecards(prev, sc);

  for (const dir of loopDirs) {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "latest-scorecard.json"), JSON.stringify(sc, null, 2), "utf8");
    await writeFile(path.join(dir, `scorecard-${date}.md`), renderScorecardMarkdown(sc), "utf8");
    await writeFile(path.join(dir, `improvement-${date}.md`), renderImprovementReport(report), "utf8");
  }

  console.log(
    `[loop] ${date} ingested=${ingested} avg=${sc.avgTotal}/100 failRate=${Math.round(sc.failRate * 100)}% outputs=${loopDirs.length}`,
  );
  console.log(report.summary);
  return { date, ingested, avgTotal: sc.avgTotal, failRate: sc.failRate, outputDirs: loopDirs };
}

const invokedDirectly = process.argv[1]?.endsWith("run.ts");
if (invokedDirectly) {
  runLoop().catch(err => {
    console.error("[loop] failed:", err);
    process.exit(1);
  });
}
