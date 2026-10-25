// レポート — 比較表、進捗ファネル、BEST BUY の提示。
//
// 出すのは「これが1位です、理由はこれです」まで。発注はしない。
// 未確認が残っている候補は、1位でもそのことを必ず書く（黙って推さない）。

import type { SourcingRequirement } from "./requirement.js";
import type { Screening } from "./candidate.js";
import type { Scored } from "./score.js";
import { assessFeasibility, formatLeadTime, type LeadTime } from "./schedule.js";

const yen = (n: number): string => `${n.toLocaleString("ja-JP")}円`;

/** 調査の進み具合。SEARCH → FILTER → QUOTE → BEST BUY。 */
export type Funnel = {
  readonly searched: number;
  readonly passedFilter: number;
  readonly quoted: number;
  readonly bestBuy: number;
};

export function funnelOf(scored: readonly Scored[], screenings: readonly Screening[]): Funnel {
  const excluded = new Set(screenings.filter(s => s.excluded).map(s => s.candidateId));
  const kept = scored.filter(s => !excluded.has(s.candidate.id));
  return {
    searched: screenings.length,
    passedFilter: kept.length,
    quoted: kept.filter(s => s.cost !== undefined).length,
    bestBuy: kept.length > 0 ? 1 : 0,
  };
}

export function formatFunnel(funnel: Funnel): string {
  return [
    "SEARCH",
    `${funnel.searched}社`,
    "↓",
    "FILTER",
    `${funnel.passedFilter}社`,
    "↓",
    "QUOTE",
    `${funnel.quoted}社`,
    "↓",
    "BEST BUY",
    `${funnel.bestBuy}社`,
  ].join("\n");
}

/** 比較表（Markdown）。 */
export function comparisonTable(scored: readonly Scored[]): string {
  const header = [
    "| Rank | Supplier | Total | Unit Cost | Quality | Delivery | Trust | Score |",
    "|---|---|---:|---:|---:|---|---:|---:|",
  ];
  const rows = scored.map((s, i) => {
    const total = s.cost ? yen(s.cost.totalJpy) : "未取得";
    const unit = s.cost ? yen(s.cost.effectiveUnitPriceJpy) : "未取得";
    const arrival = s.candidate.delivery.guaranteedArrivalDate ?? "未回答";
    const half = s.candidate.delivery.guaranteedHalf === "AM" ? " 午前" : "";
    return `| ${i + 1} | ${s.candidate.supplier} | ${total} | ${unit} | ${s.quality}/25 | ${arrival}${half}（${s.delivery}/35） | ${s.trust}/10 | ${s.total} |`;
  });
  return [...header, ...rows].join("\n");
}

/** BEST BUY と控えの2社。理由は3行以内。 */
export function bestBuyBlock(scored: readonly Scored[], screenings: readonly Screening[]): string {
  if (scored.length === 0) return "候補がありません。まず調査を行ってください。";

  const byId = new Map(screenings.map(s => [s.candidateId, s]));
  const medals = ["🥇 BEST BUY", "🥈 Backup", "🥉 Backup"];

  return scored.slice(0, 3).map((s, i) => {
    const cost = s.cost ? `総額${yen(s.cost.totalJpy)} / 実質単価${yen(s.cost.effectiveUnitPriceJpy)}` : "見積未取得";
    const arrival = s.candidate.delivery.guaranteedArrivalDate
      ? `到着保証 ${s.candidate.delivery.guaranteedArrivalDate}`
      : "到着保証なし";
    const unknowns = byId.get(s.candidate.id)?.unknowns ?? [];
    const lines = [
      `${medals[i]}: ${s.candidate.supplier}（${s.total}点）`,
      `理由: ${arrival}。${cost}。品質${s.quality}/25・信頼度${s.trust}/10。`,
      unknowns.length > 0 ? `未確認: ${unknowns.slice(0, 3).join(" / ")}` : "未確認: なし",
    ];
    return lines.join("\n");
  }).join("\n\n");
}

/** 全体レポート。これ1本をオーナーに見せる。 */
export function buildReport(args: {
  readonly requirement: SourcingRequirement;
  readonly lead: LeadTime;
  readonly today: string;
  readonly scored: readonly Scored[];
  readonly screenings: readonly Screening[];
}): string {
  const { requirement, lead, today, scored, screenings } = args;
  const feasibility = assessFeasibility(requirement, lead, today);
  const excluded = new Set(screenings.filter(s => s.excluded).map(s => s.candidateId));
  const kept = scored.filter(s => !excluded.has(s.candidate.id));
  const dropped = screenings.filter(s => s.excluded);

  const sections = [
    `# 調達レポート: ${requirement.item} ${requirement.quantity}個`,
    "",
    `必着: ${requirement.arrivalDeadline} ${requirement.deadlineHalf === "AM" ? "午前中" : "中"} / 届け先: ${requirement.destination}`,
    `逆算: ${formatLeadTime(lead)}`,
    `判定: ${feasibility.verdict} — ${feasibility.reason}`,
    "",
    "## 進捗",
    "",
    formatFunnel(funnelOf(scored, screenings)),
    "",
    "## 比較表",
    "",
    kept.length > 0 ? comparisonTable(kept) : "条件を満たす候補がありません。",
    "",
    "## 結論",
    "",
    bestBuyBlock(kept, screenings),
  ];

  if (dropped.length > 0) {
    sections.push(
      "",
      "## 除外",
      "",
      ...dropped.map(s => `- ${s.candidateId}: ${s.exclusions.join(" / ")}`),
    );
  }

  sections.push(
    "",
    "---",
    "発注・支払い・問い合わせ送信は、オーナー承認後にのみ行う。このレポートは判断材料であって発注指示ではない。",
  );

  return sections.join("\n");
}
