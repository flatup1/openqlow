// 自己改善ループ ③改善提案（Report）。
//
// 直近2回の scorecard を比較し、回帰（点が下がった所）と改善案を出す。
// 改善案は「正本更新 / ゲート調整 / 文面修正」に分類する。人間承認用の下書きとして出力。

import type { Scorecard } from "./score.js";

export interface LoopReport {
  summary: string;
  regressions: string[];
  improvements: string[];
  suggestions: string[];
}

interface AxisInfo {
  key: keyof Scorecard;
  label: string;
  suggestion: string;
}

const AXES: AxisInfo[] = [
  { key: "avgEmpathy", label: "寄り添い", suggestion: "質問を1〜2問に絞り、共感を一言添える（文面修正）" },
  { key: "avgNaturalness", label: "不自然なし", suggestion: "正本(canon)参照を徹底し、取次ぎスタック・再質問を無くす（ゲート調整/正本更新）" },
  { key: "avgNonDuplication", label: "重複なし", suggestion: "同一返信の再送を冪等化する（ゲート調整）" },
  { key: "avgKindness", label: "優しさ", suggestion: "安心ワードを足し、煽り・選民表現を排除する（文面修正）" },
];

/** prev が無ければ初回として現状サマリのみ返す。 */
export function compareScorecards(prev: Scorecard | null, curr: Scorecard): LoopReport {
  const regressions: string[] = [];
  const improvements: string[] = [];

  if (prev) {
    if (curr.avgTotal < prev.avgTotal) {
      regressions.push(`平均合計が ${prev.avgTotal} → ${curr.avgTotal} に低下`);
    } else if (curr.avgTotal > prev.avgTotal) {
      improvements.push(`平均合計が ${prev.avgTotal} → ${curr.avgTotal} に改善`);
    }
    if (curr.failRate > prev.failRate) {
      regressions.push(`要修正率が ${Math.round(prev.failRate * 100)}% → ${Math.round(curr.failRate * 100)}% に悪化`);
    }
    for (const ax of AXES) {
      const before = prev[ax.key] as number;
      const after = curr[ax.key] as number;
      if (after < before) regressions.push(`観点「${ax.label}」が ${before} → ${after} に低下`);
    }
  }

  // 一番弱い観点に対する改善提案（満点25未満のものを弱い順に）。
  const ranked = [...AXES]
    .map(ax => ({ ax, val: curr[ax.key] as number }))
    .filter(x => x.val < 25)
    .sort((a, b) => a.val - b.val);
  const suggestions = ranked.map(x => `「${x.ax.label}」(${x.val}/25): ${x.ax.suggestion}`);

  const summary =
    curr.failRate === 0 && curr.worstTotal >= 80
      ? `良好: 平均 ${curr.avgTotal}/100・要修正率0%。下げないことを優先。`
      : `要改善: 平均 ${curr.avgTotal}/100・最低 ${curr.worstTotal}・要修正率 ${Math.round(curr.failRate * 100)}%。`;

  return { summary, regressions, improvements, suggestions };
}

/** 人間承認用の改善提案 Markdown。 */
export function renderImprovementReport(report: LoopReport): string {
  const lines = [`# 改善提案`, "", `## サマリ`, report.summary, ""];
  if (report.regressions.length) {
    lines.push("## ⚠ 回帰（下がった所・最優先で戻す）", ...report.regressions.map(r => `- ${r}`), "");
  }
  if (report.improvements.length) {
    lines.push("## ✅ 改善した所", ...report.improvements.map(r => `- ${r}`), "");
  }
  if (report.suggestions.length) {
    lines.push("## 提案（人間確認のうえ反映）", ...report.suggestions.map(s => `- ${s}`), "");
  } else {
    lines.push("## 提案", "- 現状は全観点満点。新しいログを足してループを回す。", "");
  }
  lines.push("> 自動マージしない。人間がPRで確認してから反映する。");
  return lines.join("\n");
}
