import {
  assetJudgement,
  classifyAccount,
  classifyTaxCategory,
  deductibleAmount,
  depreciationFor,
  isDepreciable,
  isValidInvoiceNumber,
  normalizeExpenseInput,
  straightLineRate,
  taxAmountOf,
  validateExpense,
  type Expense,
} from "./expense.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 勘定科目の推定: ジム特有の語も家賃・光熱費も拾える
assert(classifyAccount("コーナン グローブ") === "消耗品費", "グローブは消耗品費");
assert(classifyAccount("東京電力 電気代") === "水道光熱費", "電気代は水道光熱費");
assert(classifyAccount("テナント家賃 8月分") === "地代家賃", "家賃は地代家賃");
assert(classifyAccount("ENEOS 給油") === "旅費交通費", "ガソリンは旅費交通費");
assert(classifyAccount("チラシ印刷 ポスティング") === "広告宣伝費", "チラシは広告宣伝費");
assert(classifyAccount("インストラクター報酬 8月") === "外注工賃", "外注は外注工賃");
assert(classifyAccount("収入印紙") === "租税公課", "印紙は租税公課");
assert(classifyAccount("") === "雑費", "空文字は雑費");
// 辞書に無い語は消耗品費に寄せる（ジムの支出で最頻）
assert(classifyAccount("よくわからない店 なにか") === "消耗品費", "未知の語は消耗品費");

// 税区分の推定
assert(classifyTaxCategory("コーナン 掃除用具") === "10%", "既定は10%");
assert(classifyTaxCategory("業務スーパー お茶") === "8%軽減", "飲食料品は8%軽減");
assert(classifyTaxCategory("損害保険料") === "非課税", "保険は非課税");

// 消費税の割り戻し（1円未満切り捨て）
assert(taxAmountOf({ amount: 11000, taxCategory: "10%" }) === 1000, "11000円の10%内税は1000円");
assert(taxAmountOf({ amount: 1080, taxCategory: "8%軽減" }) === 80, "1080円の8%内税は80円");
assert(taxAmountOf({ amount: 10000, taxCategory: "非課税" }) === 0, "非課税は消費税0");
assert(taxAmountOf({ amount: 999, taxCategory: "10%" }) === 90, "端数は切り捨て(90.8→90)");

// 事業按分（四捨五入して整数）
assert(deductibleAmount({ amount: 10000, businessRatio: 80 }) === 8000, "80%按分");
assert(deductibleAmount({ amount: 999, businessRatio: 50 }) === 500, "端数は四捨五入(499.5→500)");
assert(deductibleAmount({ amount: 10000, businessRatio: 100 }) === 10000, "100%はそのまま");

// インボイス番号の形式
assert(isValidInvoiceNumber("T1234567890123"), "T+13桁は有効");
assert(!isValidInvoiceNumber("T123"), "桁不足は無効");
assert(!isValidInvoiceNumber("1234567890123"), "Tなしは無効");

// 資産判定の3段階
assert(assetJudgement(99_999).kind === "経費", "10万円未満は経費");
assert(assetJudgement(100_000).kind === "少額減価償却資産", "10万円ちょうどは少額減価償却資産");
assert(assetJudgement(299_999).kind === "少額減価償却資産", "30万円未満は特例の範囲");
assert(assetJudgement(300_000).kind === "減価償却", "30万円ちょうどは減価償却");

// 入力の正規化: 未指定は推定で埋まる
const normalized = normalizeExpenseInput({
  date: "2026-08-03",
  vendor: "コーナン",
  amount: "12,800円",
  note: "サンドバッグ用マット",
});
assert(normalized.amount === 12800, "カンマ・円つき金額を整数化");
assert(normalized.account === "消耗品費", "科目が推定される");
assert(normalized.taxCategory === "10%", "税区分が推定される");
assert(normalized.businessRatio === 100, "按分の既定は100%");
assert(normalized.paymentMethod === "現金", "支払方法の既定は現金");
assert(normalized.receipt === "あり", "レシートの既定はあり");

// 明示指定は推定より優先される
const explicit = normalizeExpenseInput({
  vendor: "コーナン",
  amount: 10000,
  account: "修繕費",
  taxCategory: "非課税",
  businessRatio: "80%",
  paymentMethod: "クレカ",
  receipt: "なし",
  invoiceNumber: "t1234567890123",
  subsidyTag: "#省エネ",
  assetLife: "13",
});
assert(explicit.account === "修繕費", "科目の明示指定が勝つ");
assert(explicit.taxCategory === "非課税", "税区分の明示指定が勝つ");
assert(explicit.businessRatio === 80, "%付き按分を数値化");
assert(explicit.paymentMethod === "クレジット", "クレカ→クレジットに正規化");
assert(explicit.receipt === "なし", "レシート無しを保持");
assert(explicit.invoiceNumber === "T1234567890123", "インボイス番号を大文字化");
assert(explicit.subsidyTag === "省エネ", "タグの#を落とす");
assert(explicit.assetLife === 13, "耐用年数を数値化");

// 按分は0〜100に丸める
assert(normalizeExpenseInput({ businessRatio: "150" }).businessRatio === 100, "100超は100に丸める");
assert(normalizeExpenseInput({ businessRatio: "-10" }).businessRatio === 0, "負値は0に丸める");

// 不備の検出
const base: Expense = {
  id: 1,
  date: "2026-08-03",
  vendor: "コーナン",
  amount: 1200,
  account: "消耗品費",
  taxCategory: "10%",
  note: "掃除用具",
  businessRatio: 100,
  paymentMethod: "現金",
  receipt: "あり",
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};
assert(validateExpense(base).length === 0, "揃っていれば不備なし");
assert(validateExpense({ ...base, note: "" }).some(p => p.includes("摘要")), "摘要の空を検出");
assert(validateExpense({ ...base, receipt: "なし" }).some(p => p.includes("レシート")), "レシート無しを検出");
assert(validateExpense({ ...base, date: "2026/8/3" }).some(p => p.includes("日付")), "日付形式を検出");
assert(validateExpense({ ...base, amount: 0 }).some(p => p.includes("0円")), "0円を検出");
assert(
  validateExpense({ ...base, invoiceNumber: "T123" }).some(p => p.includes("インボイス")),
  "インボイス形式の誤りを検出",
);
assert(
  validateExpense({ ...base, amount: 350_000 }).some(p => p.includes("減価償却")),
  "30万円以上で耐用年数未設定を検出",
);
assert(
  validateExpense({ ...base, amount: 350_000, assetLife: 13 }).every(p => !p.includes("減価償却")),
  "耐用年数があれば減価償却の指摘は出ない",
);

// 定額法の償却率（国税庁の償却率表と同じ、小数第3位に丸めた 1/耐用年数）
assert(straightLineRate(13) === 0.077, "13年 → 0.077");
assert(straightLineRate(5) === 0.2, "5年 → 0.2");
assert(straightLineRate(2) === 0.5, "2年 → 0.5");

// 償却資産の判定
assert(isDepreciable({ assetLife: 13 }), "耐用年数があれば償却資産");
assert(!isDepreciable({ assetLife: undefined }), "耐用年数が無ければ償却資産でない");
assert(!isDepreciable({ assetLife: 0 }), "0年は償却資産でない");

// 減価償却: 396,000円・耐用13年・2026年8月取得
const asset: Expense = { ...base, id: 10, date: "2026-08-20", amount: 396_000, assetLife: 13, note: "業務用エアコン" };
const first = depreciationFor(asset, 2026)!;
assert(first.rate === 0.077, "償却率");
assert(first.months === 5, "取得年は8月〜12月の5か月（月割）");
// 396,000 × 0.077 × 5/12 = 12,705
assert(first.amount === 12_705, "取得年の償却費");
assert(first.bookValue === 396_000 - 12_705, "期末残高");
assert(first.deductible === 12_705, "按分100%なら償却費がそのまま必要経費");

const second = depreciationFor(asset, 2027)!;
assert(second.months === 12, "翌年からは12か月");
assert(second.amount === 30_492, "396,000 × 0.077 = 30,492");
assert(second.accumulated === 12_705 + 30_492, "償却累計が積み上がる");

// 取得年より前は対象外
assert(depreciationFor(asset, 2025) === undefined, "取得前の年は undefined");
// 償却資産でなければ計算しない
assert(depreciationFor(base, 2026) === undefined, "耐用年数が無ければ undefined");

// 事業按分は償却費にもかかる
const shared = depreciationFor({ ...asset, businessRatio: 80 }, 2026)!;
assert(shared.amount === 12_705, "按分前の償却費は同じ");
assert(shared.deductible === Math.round(12_705 * 0.8), "按分後が必要経費");

// 最終年は備忘価額1円を残して打ち切る
const short: Expense = { ...base, id: 11, date: "2026-01-15", amount: 100_000, assetLife: 2 };
assert(depreciationFor(short, 2026)!.amount === 50_000, "1年目は50,000円");
const last = depreciationFor(short, 2027)!;
assert(last.amount === 49_999, "2年目は備忘価額1円を残す");
assert(last.bookValue === 1, "期末残高は1円");
const after = depreciationFor(short, 2028)!;
assert(after.amount === 0, "償却しきった翌年は0円");
assert(after.bookValue === 1, "1円は残り続ける");

console.log("keihi expense tests passed");
