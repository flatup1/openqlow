import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pearson, engagementOf, buildCraftInsight, formatInsight } from "./score_insight.js";
import type { CraftLedgerEntry } from "./score_ledger.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// ── pearson: 基本性質 ──
assert(pearson([1, 2, 3], [2, 4, 6]) === 1, "perfect positive correlation = 1");
assert(Math.abs((pearson([1, 2, 3], [6, 4, 2]) ?? 0) + 1) < 1e-9, "perfect negative correlation = -1");
assert(pearson([1, 2], [1, 2]) === null, "n<3 returns null");
assert(pearson([4, 4, 4], [1, 2, 3]) === null, "zero variance returns null");

// ── engagementOf: 重み付き和 / 全null ──
assert(engagementOf({ likes: 1, comments: 1, saves: 1, shares: 1 }) === 1 + 2 + 2 + 3, "weighted sum");
assert(engagementOf({ likes: null, comments: null, saves: null, shares: null }) === null, "all null -> null");
assert(engagementOf({ likes: 5 }) === 5, "partial metrics counted");

// ── 突合: hook が線形にエンゲージメントと相関する合成データ ──
const dir = await mkdtemp(path.join(tmpdir(), "openqlow-score-insight-"));
const ledgerPath = path.join(dir, "ledger.jsonl");
const perfPath = path.join(dir, "perf.jsonl");

function entry(recordId: string, hook: number): CraftLedgerEntry {
  return {
    ts: "2026-06-09T00:00:00.000Z",
    recordId,
    platform: "x",
    theme: "t",
    total: 10 + hook,
    verdict: "polish",
    // hook だけ動かし、他軸は固定（=分散ゼロ→相関null）
    dims: { hook, specificity: 4, platformFit: 4, invitation: 2, freshness: 3 },
  };
}
const ledger: CraftLedgerEntry[] = [entry("R1", 1), entry("R2", 3), entry("R3", 5)];
await writeFile(ledgerPath, ledger.map(e => JSON.stringify(e)).join("\n") + "\n", "utf8");

// hook 1/3/5 に対しエンゲージメント likes 10/30/50（完全正相関）
const perf = [
  { recordId: "R1", metrics: { likes: 10 } },
  { recordId: "R2", metrics: { likes: 30 } },
  { recordId: "R3", metrics: { likes: 50 } },
];
await writeFile(perfPath, perf.map(p => JSON.stringify(p)).join("\n") + "\n", "utf8");

const insight = await buildCraftInsight({ ledgerPath, perfPath });
assert(insight.scoredRecords === 3, "3 scored records");
assert(insight.recordsWithMetrics === 3, "3 records with metrics");
const hookCorr = insight.correlations.find(c => c.dimension === "hook");
assert(hookCorr && Math.abs((hookCorr.r ?? 0) - 1) < 1e-9, "hook should correlate perfectly");
const specCorr = insight.correlations.find(c => c.dimension === "specificity");
assert(specCorr && specCorr.r === null, "constant dimension has null correlation");
assert(insight.topDriver?.dimension === "hook", "top driver should be hook");

const report = formatInsight(insight);
assert(report.includes("最有力ドライバー"), "report should name a driver when data is sufficient");
assert(report.includes("フック"), "report should mention hook label");

// ── 実測なし: 相関は出さず、進捗だけ返す ──
const perfEmpty = path.join(dir, "perf_empty.jsonl");
await writeFile(perfEmpty, "", "utf8");
const noMetrics = await buildCraftInsight({ ledgerPath, perfPath: perfEmpty });
assert(noMetrics.scoredRecords === 3, "still counts scored records");
assert(noMetrics.recordsWithMetrics === 0, "no metrics paired");
assert(noMetrics.topDriver === null, "no driver without metrics");
assert(noMetrics.note.includes("まだありません"), "note explains lack of data");

console.log("score insight tests passed");
