import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildCategoryListMessage,
  buildExpenseCsv,
  buildExpenseReport,
  exportExpenseCsv,
  listCategories,
  normalizeCategory,
  parseExpenseCommand,
  parseExpenseCsvCommand,
  parseExpenseReportCommand,
  parseLedger,
  recordExpense,
  taxAmount,
} from "./expense_ledger.js";

const FIXED_NOW = new Date("2026-06-04T05:00:00Z"); // JST 14:00 → 2026-06-04

// --- parseExpenseCommand ---

// 1) 基本: /経費 金額 カテゴリ メモ（カテゴリは正規名へ寄る）
{
  const parsed = parseExpenseCommand("/経費 1200 消耗品 ジムの備品", FIXED_NOW);
  assert.ok(parsed && parsed.ok, "should parse");
  assert.equal(parsed.entry.amount, 1200);
  assert.equal(parsed.entry.category, "消耗品費"); // 消耗品 → 消耗品費
  assert.equal(parsed.knownCategory, true);
  assert.equal(parsed.entry.memo, "ジムの備品");
  assert.equal(parsed.entry.date, "2026-06-04");
  assert.equal(parsed.entry.taxRate, 10); // 既定は 10%
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

// 5.1) 税率トークン（位置自由）を拾い、軽減税率を反映
{
  const a = parseExpenseCommand("/経費 1080 消耗品 8% レジ袋", FIXED_NOW);
  assert.ok(a && a.ok);
  assert.equal(a.entry.taxRate, 8);
  assert.equal(a.entry.category, "消耗品費");
  assert.equal(a.entry.memo, "レジ袋");

  const b = parseExpenseCommand("/経費 800 8% 新聞図書費", FIXED_NOW); // カテゴリ前でもOK
  assert.ok(b && b.ok);
  assert.equal(b.entry.taxRate, 8);
  assert.equal(b.entry.category, "新聞図書費");

  const c = parseExpenseCommand("/経費 5000 会議費 非課税", FIXED_NOW);
  assert.ok(c && c.ok);
  assert.equal(c.entry.taxRate, 0);
}

// 5.1b) 税トークンは金額直後/カテゴリ直後だけ拾い、メモ中の "10%" 等は巻き込まない
{
  // 末尾メモの "10%" は税率にされず、メモとして残る（既定税率のまま）
  const a = parseExpenseCommand("/経費 5000 接待交際費 二次会 10%", FIXED_NOW);
  assert.ok(a && a.ok);
  assert.equal(a.entry.taxRate, 10); // 既定（メモの10%は無視）
  assert.equal(a.entry.memo, "二次会 10%");

  // 金額直後の税トークンも有効
  const b = parseExpenseCommand("/経費 1200 8% 消耗品 メモ", FIXED_NOW);
  assert.ok(b && b.ok);
  assert.equal(b.entry.taxRate, 8);
  assert.equal(b.entry.category, "消耗品費");
  assert.equal(b.entry.memo, "メモ");
}

// 5.2) 未知カテゴリはそのまま通し、knownCategory=false
{
  const parsed = parseExpenseCommand("/経費 1200 謎科目 メモ", FIXED_NOW);
  assert.ok(parsed && parsed.ok);
  assert.equal(parsed.entry.category, "謎科目");
  assert.equal(parsed.knownCategory, false);
}

// 5.3) normalizeCategory / listCategories
{
  assert.deepEqual(normalizeCategory("交通費"), { category: "旅費交通費", known: true });
  assert.deepEqual(normalizeCategory("謎"), { category: "謎", known: false });
  assert.ok(listCategories().includes("消耗品費"));
  assert.ok(buildCategoryListMessage().includes("旅費交通費"));
}

// 5.4) taxAmount（税込から内税）
{
  assert.equal(taxAmount(1100, 10), 100);
  assert.equal(taxAmount(1080, 8), 80);
  assert.equal(taxAmount(1000, 0), 0);
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
  // 月の範囲外・解釈不能は undefined（→ ハンドラ側でヘルプ表示）
  assert.equal(parseExpenseReportCommand("/経費月報 2026-13", FIXED_NOW), undefined);
  assert.equal(parseExpenseReportCommand("/経費月報 13月", FIXED_NOW), undefined);
  assert.equal(parseExpenseReportCommand("/経費月報 来月", FIXED_NOW), undefined);
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
  assert.equal(entries[1].taxRate, 10); // 税率欠落は既定 10%
}

// --- parseExpenseCsvCommand ---

{
  assert.equal(parseExpenseCsvCommand("/経費CSV", FIXED_NOW)?.yearMonth, "2026-06");
  assert.equal(parseExpenseCsvCommand("/経費CSV", FIXED_NOW)?.format, "generic"); // 既定
  assert.equal(parseExpenseCsvCommand("経費CSV 先月", FIXED_NOW)?.yearMonth, "2026-05");
  assert.equal(parseExpenseCsvCommand("/経費csv 2026-03", FIXED_NOW)?.yearMonth, "2026-03");
  // 形式トークンは位置自由
  assert.equal(parseExpenseCsvCommand("/経費CSV 弥生 先月", FIXED_NOW)?.format, "yayoi");
  assert.equal(parseExpenseCsvCommand("/経費CSV 弥生 先月", FIXED_NOW)?.yearMonth, "2026-05");
  assert.equal(parseExpenseCsvCommand("/経費CSV 2026-03 yayoi", FIXED_NOW)?.format, "yayoi");
  assert.equal(parseExpenseCsvCommand("/経費月報", FIXED_NOW), undefined);
}

// --- buildExpenseCsv（ヘッダ・税列・エスケープ） ---

{
  const csv = buildExpenseCsv([
    { date: "2026-06-01", amount: 1100, category: "消耗品費", memo: "袋, 箱", taxRate: 10 },
  ]);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines[0], "日付,金額(税込),消費税率,消費税(内税),カテゴリ,メモ");
  // メモにカンマを含むので引用される
  assert.equal(lines[1], '2026-06-01,1100,10%,100,消耗品費,"袋, 箱"');
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
    assert.ok(report.message.includes("合計(税込): ¥5,000"));
    assert.ok(report.message.includes("うち消費税(目安)"));
    // 税込 5000 すべて 10% → 内税合計 = round(5000 - 5000/1.1) = 455
    assert.equal(report.taxTotal, taxAmount(1200, 10) + taxAmount(800, 10) + taxAmount(3000, 10));

    // 前月分は混ざらない
    const may = await buildExpenseReport({ yearMonth: "2026-05" }, { dirOverride: dir });
    assert.equal(may.total, 500);

    // データが無い月
    const empty = await buildExpenseReport({ yearMonth: "2026-01" }, { dirOverride: dir });
    assert.equal(empty.count, 0);
    assert.ok(empty.message.includes("まだありません"));

    // CSV 書き出し（その月のみ、BOM 付き、件数一致）
    const csvResult = await exportExpenseCsv({ yearMonth: "2026-06" }, { dirOverride: dir });
    assert.ok(csvResult.ok);
    assert.equal(csvResult.count, 3);
    const csvText = await fs.readFile(path.join(dir, "expenses-2026-06.csv"), "utf-8");
    assert.ok(csvText.startsWith("﻿"), "Excel 用 BOM 付き");
    assert.ok(csvText.includes("日付,金額(税込),消費税率,消費税(内税),カテゴリ,メモ"));
    assert.equal(csvText.trimEnd().split("\r\n").length, 1 + 3); // header + 3 rows

    // 弥生形式は別ファイル(-yayoi)・ヘッダ無し・仕訳行で出力
    const yayoi = await exportExpenseCsv({ yearMonth: "2026-06", format: "yayoi" }, { dirOverride: dir });
    assert.ok(yayoi.ok);
    assert.equal(yayoi.format, "yayoi");
    const yayoiText = await fs.readFile(path.join(dir, "expenses-2026-06-yayoi.csv"), "utf-8");
    assert.ok(!yayoiText.startsWith("﻿"), "弥生は BOM 無し");
    assert.ok(yayoiText.includes("事業主借"), "個人事業主の相手科目");
    assert.equal(yayoiText.trimEnd().split("\r\n").length, 3); // 3経費=3仕訳, ヘッダ無し

    // データが無い月の CSV は作らない
    const emptyCsv = await exportExpenseCsv({ yearMonth: "2026-01" }, { dirOverride: dir });
    assert.equal(emptyCsv.ok, false);
    assert.equal(emptyCsv.count, 0);
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
