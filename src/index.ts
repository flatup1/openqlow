import { approveRecord, rejectRecord, requestRevision, runDaily } from "./scheduler/daily.js";
import { runDailyCheck } from "./scheduler/daily_check.js";
import { runHealthcheckWithAlert } from "./monitor/healthcheck.js";
import { runPublishAssist, runPublishPanel } from "./publish/browser_assist_cli.js";
import { runBrowserPostRunnerCli } from "./publish/browser_post_runner_cli.js";
import {
  buildExpenseReport,
  parseExpenseCommand,
  parseExpenseReportCommand,
  recordExpense,
} from "./commands/expense_ledger.js";

const [command, id, ...responseParts] = process.argv.slice(2);
const response = responseParts.join(" ");

if (!command || command === "generate") {
  const records = await runDaily();
  console.log(`Generated ${records.length} approval records.`);
  for (const record of records) {
    console.log(`${record.id}: ${record.idea.theme}`);
  }
  process.exit(0);
}

if (command === "approve") {
  if (!id || !response) {
    console.error("Usage: npm run dev -- approve <post-id> \"OK <post-id>\"");
    process.exit(1);
  }
  const saved = await approveRecord(id, response);
  console.log("Saved draft files:");
  for (const file of saved) console.log(file);
  process.exit(0);
}

if (command === "reject") {
  if (!id) {
    console.error("Usage: npm run dev -- reject <post-id> \"reason\"");
    process.exit(1);
  }
  const record = await rejectRecord(id, response || undefined);
  console.log(`Rejected ${record.id}`);
  process.exit(0);
}

if (command === "revise") {
  if (!id || !response) {
    console.error("Usage: npm run dev -- revise <post-id> \"revision note\"");
    process.exit(1);
  }
  const record = await requestRevision(id, response);
  console.log(`Revision requested for ${record.id}`);
  process.exit(0);
}

if (command === "monitor") {
  const report = await runHealthcheckWithAlert();
  process.exit(report.ok ? 0 : 1);
}

if (command === "daily-check") {
  const result = await runDailyCheck();
  console.log(`[daily-check] ${result.mode}: ${result.ok ? "ok" : "failed"}`);
  if (!result.ok) console.error(result.error ?? "unknown error");
  process.exit(result.ok ? 0 : 1);
}

if (command === "publish:assist") {
  if (!id) {
    console.error("Usage: npm run dev -- publish:assist <post-id>");
    process.exit(1);
  }
  const result = await runPublishAssist(id);
  console.log(`Browser assist sheet: ${result.file}`);
  process.exit(0);
}

if (command === "publish:panel") {
  if (!id) {
    console.error("Usage: npm run dev -- publish:panel <post-id>");
    process.exit(1);
  }
  const result = await runPublishPanel(id);
  console.log(`Browser assist panel: ${result.file}`);
  process.exit(0);
}

if (command === "publish:browser-run") {
  if (!id) {
    console.error("Usage: npm run dev -- publish:browser-run <post-id>");
    process.exit(1);
  }
  const result = await runBrowserPostRunnerCli(id);
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
}

if (command === "expense") {
  // 例: npm run dev -- expense 1200 消耗品 ジムの備品
  const parsed = parseExpenseCommand(`/経費 ${[id, ...responseParts].join(" ")}`);
  if (!parsed || !parsed.ok) {
    console.error(parsed && !parsed.ok ? parsed.error : "Usage: npm run dev -- expense <金額> <カテゴリ> [メモ]");
    process.exit(1);
  }
  const result = await recordExpense(parsed.entry);
  console.log(`Recorded expense: ${result.entry.date} ¥${result.entry.amount.toLocaleString("ja-JP")} ${result.entry.category}`);
  console.log(`Ledger: ${result.ledgerFile}`);
  process.exit(0);
}

if (command === "expense:report") {
  // 例: npm run dev -- expense:report 2026-06
  const req = parseExpenseReportCommand(`/経費月報 ${[id, ...responseParts].join(" ")}`.trim());
  if (!req) {
    console.error("Usage: npm run dev -- expense:report [YYYY-MM|先月|今月|M月]");
    process.exit(1);
  }
  const result = await buildExpenseReport(req);
  console.log(result.message);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
console.error("Commands: generate, daily-check, approve <post-id> \"OK <post-id>\", publish:assist <post-id>, publish:panel <post-id>, publish:browser-run <post-id>, reject <post-id> \"reason\", revise <post-id> \"note\", expense <金額> <カテゴリ> [メモ], expense:report [YYYY-MM], monitor");
process.exit(1);
