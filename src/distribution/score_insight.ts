// ─────────────────────────────────────────────────────────────────────────
// EXPERIMENTAL SPIKE (2026-06) — クラフト×実測 の突合インサイト（方向性C）
//
// craft-score-ledger.jsonl（自前）と performance-log.jsonl（Codex/読み取り専用）を
// recordId で突合し、各クラフト軸と実エンゲージメントの相関(Pearson)を出す。
// 「フックを上げると効く／新鮮さは効かない」等を実データで言えるようにする入口。
//
// 実測が貯まるまでは相関は出せないので、その間も「何件採点・何件に実測があるか」を
// 返して進捗を可視化する。依存ゼロ。adapters/registers は読み取りのみ。
// ─────────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import { obsidianPath } from "../utils/paths.js";
import { readCraftLedger, type CraftDims } from "./score_ledger.js";

export interface PerfMetrics {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
}

export interface PerfEntry {
  recordId: string;
  metricsStatus?: string;
  postedAt?: string | null;
  metrics: PerfMetrics;
}

export function defaultPerfPath(): string {
  return obsidianPath("6_システム", "openqlow_logs", "performance-log.jsonl");
}

/** performance-log.jsonl を読み、recordId ごとに最新エントリを返す（後勝ち）。 */
export async function readPerformance(options: { path?: string } = {}): Promise<Map<string, PerfEntry>> {
  const file = options.path ?? defaultPerfPath();
  const text = await readFile(file, "utf8").catch(() => "");
  const map = new Map<string, PerfEntry>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as PerfEntry;
      if (entry && typeof entry.recordId === "string" && entry.metrics) {
        map.set(entry.recordId, entry);
      }
    } catch {
      // スキップ
    }
  }
  return map;
}

/** いいね/コメント/保存/シェアの重み付き和。すべて未取得なら null。 */
export function engagementOf(metrics: PerfMetrics): number | null {
  const vals = [metrics.likes, metrics.comments, metrics.saves, metrics.shares];
  if (vals.every(v => v === null || v === undefined)) return null;
  const n = (x?: number | null): number => x ?? 0;
  return n(metrics.likes) * 1 + n(metrics.comments) * 2 + n(metrics.saves) * 2 + n(metrics.shares) * 3;
}

export type CraftDimensionKey = keyof CraftDims | "total";
const DIMENSION_KEYS: CraftDimensionKey[] = [
  "hook",
  "specificity",
  "platformFit",
  "invitation",
  "freshness",
  "total",
];

const DIMENSION_LABELS: Record<CraftDimensionKey, string> = {
  hook: "フック",
  specificity: "具体性",
  platformFit: "媒体適合",
  invitation: "誘い",
  freshness: "新鮮さ",
  total: "総合",
};

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null; // 分散ゼロは相関定義不能
  return num / Math.sqrt(dx * dy);
}

export interface DimCorrelation {
  dimension: CraftDimensionKey;
  label: string;
  r: number | null;
  n: number;
}

export interface CraftInsight {
  scoredRecords: number;
  recordsWithMetrics: number;
  correlations: DimCorrelation[];
  /** |r| が最大の軸（total除く）。実測不足なら null。 */
  topDriver: { dimension: CraftDimensionKey; label: string; r: number } | null;
  note: string;
}

interface RecordAggregate {
  dims: CraftDims;
  total: number;
  count: number;
}

/** 台帳を recordId ごとに集約（媒体平均）する。 */
function aggregateLedger(entries: Awaited<ReturnType<typeof readCraftLedger>>): Map<string, RecordAggregate> {
  const sums = new Map<string, RecordAggregate>();
  for (const e of entries) {
    const cur =
      sums.get(e.recordId) ??
      { dims: { hook: 0, specificity: 0, platformFit: 0, invitation: 0, freshness: 0 }, total: 0, count: 0 };
    cur.dims.hook += e.dims.hook;
    cur.dims.specificity += e.dims.specificity;
    cur.dims.platformFit += e.dims.platformFit;
    cur.dims.invitation += e.dims.invitation;
    cur.dims.freshness += e.dims.freshness;
    cur.total += e.total;
    cur.count += 1;
    sums.set(e.recordId, cur);
  }
  // 平均化
  for (const agg of sums.values()) {
    agg.dims.hook /= agg.count;
    agg.dims.specificity /= agg.count;
    agg.dims.platformFit /= agg.count;
    agg.dims.invitation /= agg.count;
    agg.dims.freshness /= agg.count;
    agg.total /= agg.count;
  }
  return sums;
}

function valueOf(agg: RecordAggregate, key: CraftDimensionKey): number {
  return key === "total" ? agg.total : agg.dims[key];
}

export async function buildCraftInsight(
  options: { ledgerPath?: string; perfPath?: string } = {},
): Promise<CraftInsight> {
  const ledger = await readCraftLedger({ path: options.ledgerPath });
  const perf = await readPerformance({ path: options.perfPath });
  const aggregates = aggregateLedger(ledger);

  // クラフトと実エンゲージメントが両方あるレコードのペアを作る
  const paired: Array<{ agg: RecordAggregate; eng: number }> = [];
  for (const [recordId, agg] of aggregates) {
    const p = perf.get(recordId);
    const eng = p ? engagementOf(p.metrics) : null;
    if (eng !== null) paired.push({ agg, eng });
  }

  const engs = paired.map(p => p.eng);
  const correlations: DimCorrelation[] = DIMENSION_KEYS.map(key => ({
    dimension: key,
    label: DIMENSION_LABELS[key],
    r: pearson(paired.map(p => valueOf(p.agg, key)), engs),
    n: paired.length,
  }));

  let topDriver: CraftInsight["topDriver"] = null;
  for (const c of correlations) {
    if (c.dimension === "total" || c.r === null) continue;
    if (!topDriver || Math.abs(c.r) > Math.abs(topDriver.r)) {
      topDriver = { dimension: c.dimension, label: c.label, r: c.r };
    }
  }

  const note =
    paired.length === 0
      ? "実測データがまだありません（performance-log に metrics が入ると相関を計算します）。"
      : paired.length < 3
        ? `実測ありは ${paired.length} 件。相関は3件以上で表示します。`
        : `実測あり ${paired.length} 件で相関を計算しました。`;

  return {
    scoredRecords: aggregates.size,
    recordsWithMetrics: paired.length,
    correlations,
    topDriver,
    note,
  };
}

export function formatInsight(insight: CraftInsight): string {
  const lines: string[] = [
    `クラフト×実測 インサイト`,
    `  採点済みレコード: ${insight.scoredRecords} / うち実測あり: ${insight.recordsWithMetrics}`,
    `  ${insight.note}`,
  ];
  if (insight.recordsWithMetrics >= 3) {
    lines.push("  軸ごとの相関 (Pearson, エンゲージメントとの):");
    for (const c of insight.correlations) {
      const r = c.r === null ? "—（分散不足）" : c.r.toFixed(2);
      lines.push(`    ${c.label.padEnd(4, "　")} r=${r}`);
    }
    if (insight.topDriver) {
      const dir = insight.topDriver.r >= 0 ? "上げると効く" : "上げると逆効果の兆候";
      lines.push(`  ⭐ 最有力ドライバー: ${insight.topDriver.label} (r=${insight.topDriver.r.toFixed(2)} / ${dir})`);
    }
  }
  return lines.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────
//   tsx src/distribution/score_insight.ts
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  buildCraftInsight().then(insight => console.log(formatInsight(insight)));
}
