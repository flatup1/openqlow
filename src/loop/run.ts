// 自己改善ループ オーケストレータ（毎日1回）。
//
//   ① 取り込み: 受信箱(OPENQLOW_LOG_INBOX, 既定 knowledge/_inbox)の生ログ → knowledge/sources/（PII除去）
//   ② 採点    : openQLOW の返信生成を代表ケースで採点 → scorecard
//   ③ 改善提案: 前回 scorecard と比較 → 改善案（人間承認用）
//
// 出力は knowledge/sources/loop/ に保存するだけ。**自動送信・自動マージはしない**。
// 実行: npm run loop

import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { ingestToMarkdown, sourceFileName } from "./ingest.js";
import { buildScorecard, renderScorecardMarkdown, type Scorecard } from "./score.js";
import { compareScorecards, renderImprovementReport } from "./report.js";
import { generateInquiryReply } from "../generators/inquiry_reply.js";

const ROOT = process.cwd();
const INBOX = process.env.OPENQLOW_LOG_INBOX ?? path.join(ROOT, "knowledge", "_inbox");
const SOURCES = path.join(ROOT, "knowledge", "sources");
const LOOP_DIR = path.join(SOURCES, "loop");

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ingestInbox(date: string): Promise<number> {
  let files: string[] = [];
  try {
    files = await readdir(INBOX);
  } catch {
    return 0; // 受信箱が無ければスキップ
  }
  let n = 0;
  for (const f of files) {
    if (!f.endsWith(".md") && !f.endsWith(".txt")) continue;
    const raw = await readFile(path.join(INBOX, f), "utf8");
    const title = f.replace(/\.(md|txt)$/, "");
    const md = ingestToMarkdown({ raw, title, date, kind: "ingested" });
    await mkdir(SOURCES, { recursive: true });
    await writeFile(path.join(SOURCES, sourceFileName(date, title)), md, "utf8");
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

async function loadPrevScorecard(): Promise<Scorecard | null> {
  try {
    const raw = await readFile(path.join(LOOP_DIR, "latest-scorecard.json"), "utf8");
    return JSON.parse(raw) as Scorecard;
  } catch {
    return null;
  }
}

export async function runLoop(): Promise<void> {
  const date = today();
  await mkdir(LOOP_DIR, { recursive: true });

  const ingested = await ingestInbox(date);

  const prev = await loadPrevScorecard();
  const sc = buildScorecard(representativeReplies(), date);
  const report = compareScorecards(prev, sc);

  await writeFile(path.join(LOOP_DIR, "latest-scorecard.json"), JSON.stringify(sc, null, 2), "utf8");
  await writeFile(path.join(LOOP_DIR, `scorecard-${date}.md`), renderScorecardMarkdown(sc), "utf8");
  await writeFile(path.join(LOOP_DIR, `improvement-${date}.md`), renderImprovementReport(report), "utf8");

  console.log(`[loop] ${date} ingested=${ingested} avg=${sc.avgTotal}/100 failRate=${Math.round(sc.failRate * 100)}%`);
  console.log(report.summary);
}

const invokedDirectly = process.argv[1]?.endsWith("run.ts");
if (invokedDirectly) {
  runLoop().catch(err => {
    console.error("[loop] failed:", err);
    process.exit(1);
  });
}
