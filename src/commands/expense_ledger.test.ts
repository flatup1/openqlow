import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildExpenseReport,
  parseExpenseCommand,
  parseExpenseReportCommand,
  parseLedger,
  recordExpense,
} from "./expense_ledger.js";

const FIXED_NOW = new Date("2026-06-04T05:00:00Z"); // JST 14:00 → 2026-06-04

// --- parseExpenseCommand ---

// 1) 基本: /経費 金額 カテゴリ メモ
{
  const parsed = parseExpenseCommand("/経費 1200 消耗品 ジムの備品", FIXED_NOW);
  assert.ok(parsed && parsed.ok, "should parse");
  assert.equal(parsed.entry.amount, 1200);
  assert.equal(parsed.entry.category, "消耗品");
  assert.equal(parsed.entry.memo, "ジムの備品");
  assert.equal(parsed.entry.date, "2026-06-04");
}

// 2) スラッシュ無し / 全角スラッシュ
{
  assert.ok(parseExpenseCommand("経費 500 交通費", FIXED_NOW)?.ok);
  assert.ok(parseExpenseCommand("／経費 500 交通費", FIXED_NOW)?.ok);
}

// 3) カンマ・¥・円 つき金額
{
  const a = parseExpenseCommand("/経費 1,200 消耗品", FIXED_NOW);
  assert.ok(a && a.ok && a.entry.amount === 1200);
  const b = parseExpenseCommand("/経費 ¥3000 交通費", FIXED_NOW);
  assert.ok(b && b.ok && b.entry.amount === 3000);
  const c = parseExpenseCommand("/経費 800円 雑費", FIXED_NOW);
  assert.ok(c && c.ok && c.entry.amount === 800);
}

// 4) メモ省略可
{
  const parsed = parseExpenseCommand("/経費 3000 交通費", FIXED_NOW);
  assert.ok(parsed && parsed.ok);
  assert.equal(parsed.entry.memo, "");
}

// 5) 先頭に日付を置くと過去日付で記録
{
  const parsed = parseExpenseCommand("/経費 2026-05-01 1000 会議費 打ち合わせ", FIXED_NOW);
  assert.ok(parsed && parsed.ok);
  assert.equal(parsed.entry.date, "2026-05-01");
  assert.equal(parsed.entry.amount, 1000);
  assert.equal(parsed.entry.category, "会議費");
}

// 6) 金額が無い / 不正 → ok:false
{
  const empty = parseExpenseCommand("/経費", FIXED_NOW);
  assert.ok(empty && !empty.ok);
  const bad = parseExpenseCommand("/経費 たくさん 消耗品", FIXED_NOW);
  assert.ok(bad && !bad.ok);
}

// 7) カテゴリが無い → ok:false
{
  const noCategory = parseExpenseCommand("/経費 1200", FIXED_NOW);
  assert.ok(noCategory && !noCategory.ok);
}

// 8) 別コマンドは undefined（無視）
{
  assert.equal(parseExpenseCommand("/月報", FIXED_NOW), undefined);
  assert.equal(parseExpenseCommand("/経費月報", FIXED_NOW), undefined);
}

// --- parseExpenseReportCommand ---

{
  assert.equal(parseExpenseReportCommand("/経費月報", FIXED_NOW)?.yearMonth, "2026-06");
  assert.equal(parseExpenseReportCommand("経費月報", FIXED_NOW)?.yearMonth, "2026-06");
  assert.equal(parseExpenseReportCommand("/経費月報 先月", FIXED_NOW)?.yearMonth, "2026-05");
  assert.equal(parseExpenseReportCommand("/経費月報 2026-04", FIXED_NOW)?.yearMonth, "2026-04");
  assert.equal(parseExpenseReportCommand("/経費月報 5月", FIXED_NOW)?.yearMonth, "2026-05");
  assert.equal(parseExpenseReportCommand("/経費月報 3", FIXED_NOW)?.yearMonth, "2026-03");
  assert.equal(parseExpenseReportCommand("/経費", FIXED_NOW), undefined);
}

// --- parseLedger ---

{
  const raw = [
    JSON.stringify({ ts: "x", date: "2026-06-01", amount: 100, category: "A", memo: "m" }),
    "",
    "壊れた行 {{{",
    JSON.stringify({ date: "2026-06-02", amount: 200, category: "B" }),
  ].join("\n");
  const entries = parseLedger(raw);
  assert.equal(entries.length, 2);
  assert.equal(entries[1].memo, "");
}

// --- recordExpense + buildExpenseReport (round trip) ---

{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-expense-"));
  try {
    await recordExpense({ date: "2026-06-01", amount: 1200, category: "消耗品", memo: "備品" }, { dirOverride: dir, now: FIXED_NOW });
    await recordExpense({ date: "2026-06-03", amount: 800, category: "消耗品", memo: "" }, { dirOverride: dir, now: FIXED_NOW });
    await recordExpense({ date: "2026-06-05", amount: 3000, category: "交通費", memo: "セミナー" }, { dirOverride: dir, now: FIXED_NOW });
    await recordExpense({ date: "2026-05-20", amount: 500, category: "雑費", memo: "前月" }, { dirOverride: dir, now: FIXED_NOW });

    // 月別 md 台帳が出来ている
    const juneLedger = await fs.readFile(path.join(dir, "expenses-2026-06.md"), "utf-8");
    assert.ok(juneLedger.includes("# 経費台帳 2026-06"));
    assert.ok(juneLedger.includes("消耗品"));

    const report = await buildExpenseReport({ yearMonth: "2026-06" }, { dirOverride: dir });
    assert.equal(report.count, 3);
    assert.equal(report.total, 5000); // 1200 + 800 + 3000
    // カテゴリ別は金額降順
    assert.equal(report.byCategory[0].category, "交通費");
    assert.equal(report.byCategory[0].amount, 3000);
    const shohin = report.byCategory.find((c) => c.category === "消耗品");
    assert.equal(shohin?.amount, 2000);
    assert.equal(shohin?.count, 2);
    assert.ok(report.message.includes("合計: ¥5,000"));

    // 前月分は混ざらない
    const may = await buildExpenseReport({ yearMonth: "2026-05" }, { dirOverride: dir });
    assert.equal(may.total, 500);

    // データが無い月
    const empty = await buildExpenseReport({ yearMonth: "2026-01" }, { dirOverride: dir });
    assert.equal(empty.count, 0);
    assert.ok(empty.message.includes("まだありません"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// 台帳ファイルがそもそも無い場合
{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-expense-empty-"));
  try {
    const report = await buildExpenseReport({ yearMonth: "2026-06" }, { dirOverride: dir });
    assert.equal(report.count, 0);
    assert.ok(report.message.includes("経費台帳がまだありません"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

console.log("expense_ledger.test.ts ok");
