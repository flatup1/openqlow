// 自己改善ループ ②採点（Score）。
//
// 返信群（生成 or ログ由来）を共通ゲート scoreResponseQuality で採点し、集計を出す。
// 出力は scorecard（JSON相当の純粋オブジェクト）と Markdown。

import { scoreResponseQuality } from "../shared/response_quality.js";

export interface ScoredItem {
  reply: string;
  total: number;
  decision: string;
}

export interface Scorecard {
  date: string;
  count: number;
  avgTotal: number;
  avgEmpathy: number;
  avgNaturalness: number;
  avgNonDuplication: number;
  avgKindness: number;
  /** reject または revise の割合 0..1 */
  failRate: number;
  worstTotal: number;
  items: ScoredItem[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 返信群を採点して集計する。 */
export function buildScorecard(replies: string[], date: string): Scorecard {
  const results = replies.map(r => ({ reply: r, q: scoreResponseQuality(r) }));
  const n = results.length || 1;
  const sum = (f: (r: (typeof results)[number]) => number) =>
    results.reduce((a, r) => a + f(r), 0);

  const items: ScoredItem[] = results.map(r => ({
    reply: r.reply,
    total: r.q.total,
    decision: r.q.decision,
  }));

  const failCount = results.filter(
    r => r.q.decision === "reject" || r.q.decision === "revise",
  ).length;

  return {
    date,
    count: results.length,
    avgTotal: round1(sum(r => r.q.total) / n),
    avgEmpathy: round1(sum(r => r.q.empathy.score) / n),
    avgNaturalness: round1(sum(r => r.q.naturalness.score) / n),
    avgNonDuplication: round1(sum(r => r.q.nonDuplication.score) / n),
    avgKindness: round1(sum(r => r.q.kindness.score) / n),
    failRate: round1(failCount / n),
    worstTotal: results.reduce((m, r) => Math.min(m, r.q.total), 100),
    items,
  };
}

/** scorecard を Markdown 表に整形する。 */
export function renderScorecardMarkdown(sc: Scorecard): string {
  return [
    `# 採点 ${sc.date}`,
    "",
    `- 件数: ${sc.count}`,
    `- 平均合計: **${sc.avgTotal}/100**（最低 ${sc.worstTotal}）`,
    `- 観点平均: 寄り添い ${sc.avgEmpathy} / 不自然なし ${sc.avgNaturalness} / 重複なし ${sc.avgNonDuplication} / 優しさ ${sc.avgKindness}`,
    `- 要修正率(revise+reject): ${Math.round(sc.failRate * 100)}%`,
  ].join("\n");
}
