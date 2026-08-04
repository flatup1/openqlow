import { importExpenseCsv, parseCsvLine } from "./import_csv.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// CSV1行の分解
assert(parseCsvLine("a,b,c").join("|") === "a|b|c", "単純な行");
assert(parseCsvLine('"a,1",b').join("|") === "a,1|b", "引用符内のカンマは区切らない");
assert(parseCsvLine('"a""b",c').join("|") === 'a"b|c', "二重引用符はエスケープ");
assert(parseCsvLine(" a , b ").join("|") === "a|b", "前後の空白を落とす");

// 典型的なカード明細
const card = `利用日,利用店名,利用金額,支払区分
2026/08/03,コーナン成田店,12800,1回払い
2026/08/05,"ENEOS 成田,SS",6200,1回払い
2026/08/10,東京電力エナジーパートナー,28400,1回払い
`;
const result = importExpenseCsv(card);
assert(result.columns.date === "利用日", "日付列を特定");
assert(result.columns.vendor === "利用店名", "利用先列を特定");
assert(result.columns.amount === "利用金額", "金額列を特定");
assert(result.rows.length === 3, "3件取り込む");
assert(result.rows[0].date === "2026-08-03", "日付をYYYY-MM-DDに正規化");
assert(result.rows[0].amount === 12800, "金額を数値化");
assert(result.rows[0].account === "消耗品費", "科目を推定");
assert(result.rows[1].vendor === "ENEOS 成田,SS", "引用符内のカンマを含む店名");
assert(result.rows[1].account === "旅費交通費", "ENEOSは旅費交通費");
assert(result.rows[2].account === "水道光熱費", "東京電力は水道光熱費");
assert(result.rows[0].paymentMethod === "クレジット", "支払方法の既定はクレジット");
assert(result.rows[0].receipt === "電子", "明細取込はレシート=電子");
assert(result.skipped.length === 0, "全件取り込めた");

// 銀行明細（列名違い・出金がマイナス表記・入金行あり）
const bank = `取引日,お取引内容,お引出し,お預入れ
2026-08-01,テナント家賃,-55000,
2026-08-02,振込入金,,300000
20260815,ガス料金,8200,
`;
const bankResult = importExpenseCsv(bank, "口座振替");
assert(bankResult.columns.date === "取引日", "別名の日付列も拾う");
assert(bankResult.rows.length === 2, "入金行は取り込まない");
assert(bankResult.rows[0].amount === 55000, "マイナス表記は絶対値");
assert(bankResult.rows[0].account === "地代家賃", "家賃は地代家賃");
assert(bankResult.rows[0].paymentMethod === "口座振替", "支払方法を指定できる");
assert(bankResult.rows[1].date === "2026-08-15", "YYYYMMDD形式も読む");
assert(bankResult.skipped.length === 1, "入金行はスキップ理由が残る");
assert(bankResult.skipped[0].reason.includes("金額が読めません"), "スキップ理由が分かる");
assert(bankResult.skipped[0].line === 3, "スキップした行番号が出る");

// BOM つき・全角の見出しでも読める
const bom = `﻿利用日,利用店名,利用金額
2026/8/3,ダイソー,1200
`;
assert(importExpenseCsv(bom).rows.length === 1, "BOM付きでも読める");

// 列が見つからないときは取り込まず理由を返す
const broken = importExpenseCsv("あ,い,う\n1,2,3\n");
assert(broken.rows.length === 0, "列不明なら取り込まない");
assert(broken.skipped[0].reason.includes("見つかりません"), "理由を返す");

// 空ファイルでも落ちない
assert(importExpenseCsv("").rows.length === 0, "空ファイルは0件");

console.log("keihi import_csv tests passed");
