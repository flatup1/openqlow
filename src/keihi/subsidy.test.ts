import type { Expense } from "./expense.js";
import {
  CHIBA_ENERGY_GRANT,
  PRECHECK_ITEMS,
  REQUIRED_DOCUMENTS,
  buildApplicationPack,
  checkEligibility,
  classifyEnergyKind,
  monthlyEnergyCosts,
} from "./subsidy.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const program = CHIBA_ENERGY_GRANT;

// 制度の基本値（第4弾）
assert(program.amount === 110_000, "給付額は一律11万円");
assert(program.deadline === "2026-08-31", "締切は8/31");
assert(program.openFrom === "2026-05-08", "受付開始は5/8");
assert(program.periodFrom === "2025-04" && program.periodTo === "2026-03", "対象期間は令和7年4月〜令和8年3月");
assert(program.monthlyEnergyThreshold === 30_000, "要件Aは1か月3万円以上");
assert(program.threeMonthAverageThreshold === 500_000, "要件Bは月平均50万円以上");

// 光熱費・燃料費の判定は科目でなく語で行う
assert(classifyEnergyKind({ vendor: "東京電力エナジーパートナー", note: "電気代" }) === "光熱費", "電気は光熱費");
assert(classifyEnergyKind({ vendor: "京葉ガス", note: "8月分" }) === "光熱費", "ガスは光熱費");
assert(classifyEnergyKind({ vendor: "○○プロパン", note: "LPガス" }) === "光熱費", "LPガスも光熱費");
assert(classifyEnergyKind({ vendor: "ENEOS", note: "給油" }) === "燃料費", "ガソリンは燃料費");
assert(classifyEnergyKind({ vendor: "○○燃料店", note: "灯油" }) === "燃料費", "灯油は燃料費");
// 水道は対象外（制度が電気・ガスに限っている）
assert(classifyEnergyKind({ vendor: "千葉県水道局", note: "水道料金" }) === "対象外", "水道は対象外");
assert(classifyEnergyKind({ vendor: "コーナン", note: "掃除用具" }) === "対象外", "無関係な支出は対象外");

function expense(patch: Partial<Expense>): Expense {
  return {
    id: 1,
    date: "2025-08-10",
    vendor: "東京電力",
    amount: 30_000,
    account: "水道光熱費",
    taxCategory: "10%",
    note: "電気代",
    businessRatio: 100,
    paymentMethod: "口座振替",
    receipt: "あり",
    createdAt: "2025-08-10T00:00:00.000Z",
    updatedAt: "2025-08-10T00:00:00.000Z",
    ...patch,
  };
}

// 月次集計: 光熱費と燃料費を分けて合算する
const list: Expense[] = [
  expense({ id: 1, date: "2025-08-10", amount: 28_000, vendor: "東京電力", note: "電気代" }),
  expense({ id: 2, date: "2025-08-15", amount: 6_200, vendor: "ENEOS", note: "給油", account: "旅費交通費" }),
  expense({ id: 3, date: "2025-09-10", amount: 21_000, vendor: "東京電力", note: "電気代" }),
  expense({ id: 4, date: "2025-09-20", amount: 4_000, vendor: "千葉県水道局", note: "水道料金" }),
  expense({ id: 5, date: "2026-01-10", amount: 35_000, vendor: "東京電力", note: "電気代" }),
  // 対象期間の外（2026-04）は集計に入れない
  expense({ id: 6, date: "2026-04-10", amount: 40_000, vendor: "東京電力", note: "電気代" }),
  expense({ id: 7, date: "2025-08-05", amount: 12_800, vendor: "コーナン", note: "マット", account: "消耗品費" }),
];

const months = monthlyEnergyCosts(list, program);
assert(months.length === 3, "対象期間内で光熱費・燃料費がある月は3つ");
assert(months[0].month === "2025-08", "月は昇順");
assert(months[0].utility === 28_000, "8月の光熱費");
assert(months[0].fuel === 6_200, "8月の燃料費");
assert(months[0].total === 34_200, "8月の合計（消耗品は入らない）");
assert(months[0].qualifies === true, "8月は3万円以上で要件を満たす");
assert(months[1].month === "2025-09" && months[1].total === 21_000, "9月は水道を除いて21,000円");
assert(months[1].qualifies === false, "9月は要件を満たさない");
assert(months[2].month === "2026-01" && months[2].qualifies === true, "1月も要件を満たす");
assert(!months.some(m => m.month === "2026-04"), "対象期間外の月は含まない");

// 要件Aの判定
const result = checkEligibility(list, program);
assert(result.hasData === true, "対象期間のデータがある");
assert(result.eligibleByMonthly === true, "要件Aを満たす");
assert(result.qualifyingMonths.length === 2, "満たす月は2つ");
assert(result.qualifyingMonths[0].month === "2026-01", "金額の大きい月が先頭（35,000 > 34,200）");
assert(result.qualifyingMonths[0].expenses.length === 1, "証拠になる支出の内訳を持つ");

// 満たさないとき: 一番惜しい月と不足額を出す
const short = checkEligibility(
  [expense({ id: 1, date: "2025-09-10", amount: 21_000 }), expense({ id: 2, date: "2025-10-10", amount: 18_000 })],
  program,
);
assert(short.eligibleByMonthly === false, "どの月も届かない");
assert(short.closest?.month.month === "2025-09", "一番近い月は9月");
assert(short.closest?.shortfall === 9_000, "あと9,000円");

// データが1件も無い場合
const noData = checkEligibility([], program);
assert(noData.hasData === false, "データなし");
assert(noData.eligibleByMonthly === false, "データなしでは満たさない");
assert(noData.closest === undefined, "惜しい月も無い");

// ちょうど閾値なら満たす（以上、なので3万円ちょうどはOK）
const exact = checkEligibility([expense({ amount: 30_000 })], program);
assert(exact.eligibleByMonthly === true, "3万円ちょうどは要件を満たす");
assert(checkEligibility([expense({ amount: 29_999 })], program).eligibleByMonthly === false, "29,999円は満たさない");

// 申請メモ
const pack = buildApplicationPack({
  program,
  expenses: list,
  applicant: "FLATUP GYM",
  address: "成田市土屋516-4 2F",
  today: "2026-08-02",
});
assert(pack.includes(program.name), "見出しに正式名称");
assert(pack.includes("110,000円（一律）"), "給付額が入る");
assert(pack.includes("2026-08-31"), "締切が入る");
assert(pack.includes(program.contact), "問い合わせ先が入る");
// 連絡先の電話番号はソースに直書きしない（PIIガードの方針に合わせ、番号はドキュメント側）
assert(!/\b0\d{1,4}-\d{1,4}-\d{3,4}\b/.test(program.contact), "問い合わせ先に電話番号を直書きしない");
assert(pack.includes("千葉市内に本店がある法人"), "所在地要件が明示される");
assert(pack.includes("要件Aを満たす月があります: 2026-01"), "満たす月を示す");
assert(pack.includes("| 2025-08 |"), "月別の表が出る");
assert(pack.includes("提出物ではなく手元資料"), "提出物ではない旨の注意");
for (const doc of REQUIRED_DOCUMENTS) {
  assert(pack.includes(doc.name), `提出書類 ${doc.name} が入る`);
}
for (const item of PRECHECK_ITEMS) {
  assert(pack.includes(item.label), `事前確認 ${item.label} が入る`);
}

// 要件を満たさないときは不足額を書く
const shortPack = buildApplicationPack({
  program,
  expenses: [expense({ id: 1, date: "2025-09-10", amount: 21_000 })],
  today: "2026-08-02",
});
assert(shortPack.includes("あと 9,000円 足りません"), "不足額を出す");
assert(shortPack.includes("未登録の請求書が無いか確認"), "次の一手を示す");

// データが無いときは「まず登録」を促す
const emptyPack = buildApplicationPack({ program, expenses: [], today: "2026-08-02" });
assert(emptyPack.includes("まだ1件も登録されていません"), "未登録であることを示す");
assert(emptyPack.includes("（要件を満たす月がまだありません）"), "証拠書類の表も空で出る");

console.log("keihi subsidy tests passed");
