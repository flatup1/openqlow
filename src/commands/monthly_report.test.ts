import assert from "node:assert/strict";
import { parseMonthlyReportCommand, buildMonthlyReport, summarizeDay } from "./monthly_report.js";

const FIXED_NOW = new Date("2026-06-04T05:00:00Z"); // JST 14:00 → 2026-06

// --- parseMonthlyReportCommand ---

// 1) "/月報" 単独 → 今月
{
  const req = parseMonthlyReportCommand("/月報", FIXED_NOW);
  assert.ok(req, "should match");
  assert.equal(req!.yearMonth, "2026-06");
}

// 2) "月報" (スラなし) も拾う
{
  const req = parseMonthlyReportCommand("月報", FIXED_NOW);
  assert.equal(req!.yearMonth, "2026-06");
}

// 3) 全角スラッシュ
{
  const req = parseMonthlyReportCommand("／月報", FIXED_NOW);
  assert.equal(req!.yearMonth, "2026-06");
}

// 4) "/月報 先月"
{
  const req = parseMonthlyReportCommand("/月報 先月", FIXED_NOW);
  assert.equal(req!.yearMonth, "2026-05");
}

// 5) "/月報 今月"
{
  const req = parseMonthlyReportCommand("/月報 今月", FIXED_NOW);
  assert.equal(req!.yearMonth, "2026-06");
}

// 6) "/月報 2026-05"
{
  const req = parseMonthlyReportCommand("/月報 2026-05", FIXED_NOW);
  assert.equal(req!.yearMonth, "2026-05");
}

// 7) "/月報 5月"（今年の5月扱い）
{
  const req = parseMonthlyReportCommand("/月報 5月", FIXED_NOW);
  assert.equal(req!.yearMonth, "2026-05");
}

// 8) "/月報 5"
{
  const req = parseMonthlyReportCommand("/月報 5", FIXED_NOW);
  assert.equal(req!.yearMonth, "2026-05");
}

// 9) 別コマンドは無視
{
  const req = parseMonthlyReportCommand("/日報", FIXED_NOW);
  assert.equal(req, undefined);
}

// 10) "monthly" 英字も拾う
{
  const req = parseMonthlyReportCommand("/monthly", FIXED_NOW);
  assert.equal(req!.yearMonth, "2026-06");
}

// 11) 年跨ぎ: 1月の先月 → 前年12月
{
  const jan = new Date("2026-01-15T05:00:00Z");
  const req = parseMonthlyReportCommand("/月報 先月", jan);
  assert.equal(req!.yearMonth, "2025-12");
}

// --- summarizeDay ---

// 12) frontmatter除外、AIメタ除外、なし除外、重複除外
{
  const sample = `---
date: 2026-05-25
type: daily_crm_log
---
# FLATUP GYM 日次 CRM ログ

## 朝の整理（8 問）

- today_top_task: LP更新
- followup_needed: なし
- concerning_member: せとさん

## AI メモ
- 記録時刻: 2026-05-25T05:00:00.000Z
- ジャンル数: 1
- エントリ数: 1
`;
  const summary = summarizeDay("2026-05-25", sample);
  assert.ok(summary.includes("## 2026-05-25"));
  assert.ok(summary.includes("today_top_task: LP更新"));
  assert.ok(summary.includes("concerning_member: せとさん"));
  assert.ok(!summary.includes("followup_needed"), "なし行は除外");
  assert.ok(!summary.includes("記録時刻"), "AIメタは除外");
  assert.ok(!summary.includes("ジャンル数"), "AIメタは除外");
}

// 13) 中身が全部「なし」なら「（記録なし）」
{
  const sample = `## 朝の整理
- a: なし
- b: 無し
`;
  const summary = summarizeDay("2026-05-26", sample);
  assert.ok(summary.includes("（記録なし）"));
}

// --- buildMonthlyReport (fs スタブ) ---

// 14) 該当月のファイルが0件
{
  const result = await buildMonthlyReport(
    { yearMonth: "2026-07" },
    {
      dirOverride: "/fake",
      readdir: async () => ["2026-05-23.md", "2026-06-04.md"],
      readFile: async () => "",
    },
  );
  assert.equal(result.fileCount, 0);
  assert.ok(result.message.includes("まだありません"));
}

// 15) 該当月のファイル複数、日付順に並ぶ
{
  const fixtures: Record<string, string> = {
    "2026-06-03.md": "- today_top_task: 看板撮影\n- ジャンル数: 1\n",
    "2026-06-01.md": "- today_top_task: メルティ準備\n",
    "2026-06-02.md": "- followup_needed: 山田さん\n",
  };
  const result = await buildMonthlyReport(
    { yearMonth: "2026-06" },
    {
      dirOverride: "/fake",
      readdir: async () => Object.keys(fixtures).concat(["2026-05-23.md"]),
      readFile: async (p) => {
        const name = p.split("/").pop()!;
        return fixtures[name] ?? "";
      },
    },
  );
  assert.equal(result.fileCount, 3);
  // 日付順
  const i1 = result.message.indexOf("2026-06-01");
  const i2 = result.message.indexOf("2026-06-02");
  const i3 = result.message.indexOf("2026-06-03");
  assert.ok(i1 < i2 && i2 < i3, "chronological order");
  // ヘッダ
  assert.ok(result.message.includes("[OPENQLOW 月報] 2026-06（3日分）"));
  // 5月分は混ざらない
  assert.ok(!result.message.includes("2026-05-23"));
}

// 16) ディレクトリが無い場合は親切メッセージ
{
  const result = await buildMonthlyReport(
    { yearMonth: "2026-06" },
    {
      dirOverride: "/nonexistent",
      readdir: async () => {
        throw new Error("ENOENT");
      },
      readFile: async () => "",
    },
  );
  assert.equal(result.fileCount, 0);
  assert.ok(result.message.includes("保存先フォルダがまだありません"));
}

// 17) LINE 5000字制限近くで切られる
{
  const longContent = "- topic: " + "あ".repeat(2000) + "\n";
  const fixtures: Record<string, string> = {};
  for (let d = 1; d <= 5; d += 1) {
    fixtures[`2026-06-0${d}.md`] = longContent;
  }
  const result = await buildMonthlyReport(
    { yearMonth: "2026-06" },
    {
      dirOverride: "/fake",
      readdir: async () => Object.keys(fixtures),
      readFile: async (p) => fixtures[p.split("/").pop()!],
    },
  );
  assert.ok(result.message.length <= 4800, `expected <=4800 chars, got ${result.message.length}`);
  assert.equal(result.truncated, true);
  assert.ok(result.message.includes("続きはObsidian"));
}

console.log("monthly report tests passed");
