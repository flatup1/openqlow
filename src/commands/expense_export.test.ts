import assert from "node:assert/strict";
import {
  buildExport,
  buildGenericCsv,
  buildYayoiCsv,
  parseFormatToken,
} from "./expense_export.js";
import type { ExpenseEntry } from "./expense_model.js";

const ENTRIES: ExpenseEntry[] = [
  { date: "2026-06-01", amount: 1100, category: "消耗品費", memo: "袋, 箱", taxRate: 10 },
  { date: "2026-06-03", amount: 1080, category: "新聞図書費", memo: "雑誌", taxRate: 8 },
  { date: "2026-06-05", amount: 5000, category: "会議費", memo: "", taxRate: 0 },
];

// --- parseFormatToken ---

{
  assert.equal(parseFormatToken("弥生"), "yayoi");
  assert.equal(parseFormatToken("yayoi"), "yayoi");
  assert.equal(parseFormatToken("YAYOI"), "yayoi");
  assert.equal(parseFormatToken("freee"), "freee");
  assert.equal(parseFormatToken("汎用"), "generic");
  assert.equal(parseFormatToken("2026-06"), undefined);
}

// --- generic ---

{
  const csv = buildGenericCsv(ENTRIES);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines[0], "日付,金額(税込),消費税率,消費税(内税),カテゴリ,メモ");
  assert.equal(lines[1], '2026-06-01,1100,10%,100,消耗品費,"袋, 箱"'); // カンマはクォート
  assert.equal(lines.length, 1 + 3);
}

// --- yayoi（25列・ヘッダ無し・1経費=1仕訳） ---

{
  const csv = buildYayoiCsv(ENTRIES);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines.length, 3, "ヘッダ行は無い");

  // 1行目を列に割る（メモにカンマが含まれるためクォート前提の素朴な検証）
  const first = lines[0];
  // 識別フラグ 2000 / 借方=消耗品費 / 課対仕入10% / 金額1100 税100 / 貸方=事業主借
  assert.ok(first.startsWith("2000,"), "識別フラグ 2000");
  assert.ok(first.includes(",2026/06/01,"), "西暦スラッシュ日付");
  assert.ok(first.includes(",消耗品費,"), "借方勘定科目");
  assert.ok(first.includes(",課対仕入10%,"), "借方税区分(10%)");
  assert.ok(first.includes(",事業主借,"), "貸方=事業主借（個人事業主）");
  assert.ok(first.includes(",1100,"), "借方金額(税込)");
  assert.ok(first.includes(",100,"), "借方税額");
  assert.ok(first.endsWith(",no"), "末尾は調整=no");

  // 軽減税率の行
  assert.ok(lines[1].includes("課対仕入8%（軽）"), "8%軽減");
  // 非課税(0%)の行 → 対象外・税額0
  assert.ok(lines[2].includes(",対象外,"), "0%は対象外");
}

// 相手科目を差し替えられる（法人で 未払金 等にする想定）
{
  const csv = buildYayoiCsv([ENTRIES[0]], { creditAccount: "未払金" });
  assert.ok(csv.includes(",未払金,"));
}

// 日付表記を差し替えられる（和暦など）
{
  const csv = buildYayoiCsv([ENTRIES[0]], { formatDate: () => "R8/6/1" });
  assert.ok(csv.includes(",R8/6/1,"));
}

// 想定外の税率でも 税区分文字列 と 税額 の率が一致する（既定値に丸めない）
{
  const csv = buildYayoiCsv([{ date: "2026-06-01", amount: 1050, category: "雑費", memo: "", taxRate: 5 }]);
  assert.ok(csv.includes(",課対仕入5%,"), "税区分に実レートが出る");
  // 税額は 5% で計算: round(1050 - 1050/1.05) = 50
  assert.ok(csv.includes(",50,"), "税額も 5% 計算で整合");
  assert.ok(!csv.includes("課対仕入10%"), "既定の10%に丸められない");
}

// --- buildExport（登録ディスパッチ + 未対応フォーマット） ---

{
  const generic = buildExport("generic", ENTRIES, {});
  assert.ok(generic.supported);
  assert.equal(generic.fileSuffix, "");
  assert.ok(generic.content.startsWith("﻿"), "generic は Excel 用 BOM 付き");

  const yayoi = buildExport("yayoi", ENTRIES, {});
  assert.ok(yayoi.supported);
  assert.equal(yayoi.fileSuffix, "-yayoi");
  assert.ok(!yayoi.content.startsWith("﻿"), "弥生は BOM を付けない");

  const freee = buildExport("freee", ENTRIES, {});
  assert.equal(freee.supported, false, "freee は枠のみ（未対応）");
  assert.ok(freee.message && freee.message.includes("freee"));
}

console.log("expense_export.test.ts ok");
