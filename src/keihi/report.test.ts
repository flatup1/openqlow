import type { Expense } from "./expense.js";
import {
  auditExpenses,
  creditAccountOf,
  depreciationSchedule,
  filterByMonth,
  filterByYear,
  formatDepreciation,
  formatSummary,
  summarize,
  toExpenseCsv,
  toJournalCsv,
} from "./report.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function expense(patch: Partial<Expense>): Expense {
  return {
    id: 1,
    date: "2026-08-03",
    vendor: "コーナン",
    amount: 11000,
    account: "消耗品費",
    taxCategory: "10%",
    note: "掃除用具",
    businessRatio: 100,
    paymentMethod: "現金",
    receipt: "あり",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    ...patch,
  };
}

const list: Expense[] = [
  expense({ id: 1, date: "2026-08-03", amount: 11000, account: "消耗品費" }),
  expense({ id: 2, date: "2026-08-10", amount: 28400, account: "水道光熱費", businessRatio: 80, vendor: "東京電力", note: "電気代", paymentMethod: "口座振替" }),
  expense({ id: 3, date: "2026-07-01", amount: 55000, account: "地代家賃", vendor: "大家", note: "7月家賃" }),
  expense({ id: 4, date: "2025-12-20", amount: 3300, account: "消耗品費", vendor: "ダイソー", note: "文具" }),
];

// 期間の絞り込み
assert(filterByMonth(list, "2026-08").length === 2, "2026-08は2件");
assert(filterByYear(list, 2026).length === 3, "2026年は3件");
assert(filterByYear(list, 2025).length === 1, "2025年は1件");

// 集計
const summary = summarize(filterByMonth(list, "2026-08"), "2026-08");
assert(summary.count === 2, "件数");
assert(summary.amount === 39400, "支払総額 11000+28400");
// 28400 の 80% = 22720、11000 は全額 → 33720
assert(summary.deductible === 33720, "按分後の必要経費");
// 11000の内税1000 + 28400の内税2581(28400*10/110=2581.8→2581)
assert(summary.tax === 1000 + 2581, "消費税の割り戻し合計");

// 科目の並びは決算書順（水道光熱費 → 消耗品費）
assert(summary.byAccount[0].account === "水道光熱費", "決算書順で水道光熱費が先");
assert(summary.byAccount[1].account === "消耗品費", "消耗品費が後");
assert(summary.byAccount[0].deductible === 22720, "科目別も按分後");

// 税区分別
assert(summary.byTaxCategory.length === 1 && summary.byTaxCategory[0].taxCategory === "10%", "税区分は10%のみ");

// 表示
const text = formatSummary(summary);
assert(text.includes("2026-08 の経費まとめ"), "見出しが出る");
assert(text.includes("39,400"), "支払総額が3桁区切りで出る");
assert(text.includes("33,720"), "按分後の額が出る");
assert(formatSummary(summarize([], "2026-09")).includes("0件"), "0件のときの文言");

// 貸方科目
assert(creditAccountOf("現金") === "現金", "現金→現金");
assert(creditAccountOf("クレジット") === "未払金", "クレジット→未払金");
assert(creditAccountOf("口座振替") === "普通預金", "口座振替→普通預金");
assert(creditAccountOf("その他") === "事業主借", "その他→事業主借");

// 仕訳CSV: 按分がある行は事業分と事業主貸の2行に割れる
const journal = toJournalCsv([list[1]]);
const journalLines = journal.trim().split("\n");
assert(journalLines.length === 3, "ヘッダー + 事業分 + 家事分 の3行");
assert(journalLines[1].includes("水道光熱費,22720"), "事業分は経費科目");
assert(journalLines[1].includes("普通預金"), "貸方は普通預金");
assert(journalLines[2].includes("事業主貸,5680"), "家事分は事業主貸");
assert(journalLines[2].includes("家事分 20%"), "家事分の割合を摘要に書く");

// 按分100%なら1行だけ
assert(toJournalCsv([list[0]]).trim().split("\n").length === 2, "按分なしは1行");

// 日付順に並ぶ
const sorted = toJournalCsv(list).trim().split("\n");
assert(sorted[1].startsWith("2025-12-20"), "古い日付が先頭");

// CSVエスケープ: カンマを含む摘要が壊れない
const csv = toExpenseCsv([expense({ note: "マット, テープ" })]);
assert(csv.includes('"マット, テープ"'), "カンマを含む値は引用符で囲む");
assert(csv.trim().split("\n").length === 2, "ヘッダー + 1行");

// 不備チェック
const issues = auditExpenses([
  expense({ id: 1, note: "" }),
  expense({ id: 2, receipt: "なし" }),
  expense({ id: 3, amount: 400_000 }),
]);
assert(issues.some(i => i.id === 1 && i.problem.includes("摘要")), "摘要の空を検出");
assert(issues.some(i => i.id === 2 && i.problem.includes("レシート")), "レシート無しを検出");
assert(issues.some(i => i.id === 3 && i.problem.includes("減価償却")), "要償却を検出");
assert(auditExpenses([expense({})]).length === 0, "揃っていれば不備なし");

// 少額減価償却資産の年間300万円上限
const manyAssets = Array.from({ length: 13 }, (_, i) =>
  expense({ id: i + 1, amount: 250_000, date: "2026-05-01", note: "備品" }),
);
const capIssue = auditExpenses(manyAssets).find(i => i.problem.includes("年間上限300万円"));
assert(capIssue !== undefined, "13件×25万=325万で上限超過を検出");
assert(capIssue?.label === "2026年", "年単位で指摘する");

// 300万円ちょうどは超過にならない
const exact = Array.from({ length: 12 }, (_, i) => expense({ id: i + 1, amount: 250_000, date: "2026-05-01" }));
assert(!auditExpenses(exact).some(i => i.problem.includes("年間上限")), "300万円ちょうどは指摘なし");

// 減価償却資産は経費の集計から外れ、assets に分かれる
const withAsset = [
  expense({ id: 1, date: "2026-08-03", amount: 11_000 }),
  expense({ id: 2, date: "2026-08-20", amount: 396_000, assetLife: 13, note: "業務用エアコン" }),
];
const assetSummary = summarize(withAsset, "2026-08");
assert(assetSummary.count === 2, "件数は資産も数える");
assert(assetSummary.assets.length === 1, "償却資産は別枠");
assert(assetSummary.amount === 11_000, "支払総額に資産は含めない");
assert(assetSummary.deductible === 11_000, "必要経費に資産の取得価額は含めない");
assert(!assetSummary.byAccount.some(r => r.amount === 396_000), "科目別にも資産は出ない");
assert(formatSummary(assetSummary).includes("減価償却資産（この集計には含めていません）"), "表示で資産を分けて示す");

// 償却スケジュール: 過年度の資産も対象年に計上される
const schedule2026 = depreciationSchedule(withAsset, 2026);
assert(schedule2026.length === 1, "2026年に償却する資産は1件");
assert(schedule2026[0].depreciation.amount === 12_705, "取得年は月割");
const schedule2027 = depreciationSchedule(withAsset, 2027);
assert(schedule2027.length === 1, "翌年も同じ資産が償却対象");
assert(schedule2027[0].depreciation.amount === 30_492, "翌年は満額");
assert(depreciationSchedule(withAsset, 2025).length === 0, "取得前の年は対象なし");
assert(depreciationSchedule([withAsset[0]], 2026).length === 0, "資産が無ければ空");

const depreciationText = formatDepreciation(schedule2026, 2026);
assert(depreciationText.includes("耐用13年"), "耐用年数を表示");
assert(depreciationText.includes("償却率 0.077"), "償却率を表示");
assert(depreciationText.includes("12,705"), "本年の償却費を表示");
assert(formatDepreciation([], 2026).includes("対象の資産はありません"), "0件のときの文言");

// 仕訳CSV: 資産は経費科目ではなく工具器具備品に立てる
const assetJournal = toJournalCsv([withAsset[1]]).trim().split("\n");
assert(assetJournal.length === 2, "資産は1行");
assert(assetJournal[1].includes("工具器具備品,396000"), "借方は工具器具備品");
assert(assetJournal[1].includes("償却は決算時"), "摘要に償却の注記");
assert(!assetJournal[1].includes("消耗品費"), "経費科目には立てない");

console.log("keihi report tests passed");
