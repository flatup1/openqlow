import type { Expense } from "./expense.js";
import {
  CATEGORY_RULES,
  DOCUMENTS_SOLE_PROPRIETOR,
  JIZOKUKA_R20,
  buildApplicationPack,
  calcJizokuka,
  classifyJizokukaCategory,
  limitOf,
  rateOf,
  requiredCostFor,
} from "./jizokuka.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const program = JIZOKUKA_R20;

// 制度の基本値（第20回）
assert(program.baseLimit === 500_000, "補助上限は50万円");
assert(program.rateNumerator === 2 && program.rateDenominator === 3, "補助率は2/3");
assert(program.deficitRateNumerator === 3 && program.deficitRateDenominator === 4, "赤字は3/4");
assert(program.employeeLimitService === 5, "サービス業は従業員5人以下");
assert(program.deadline === "2026-12-15", "締切");
assert(program.supportPlanDeadline === "2026-12-04", "様式4の発行締切は締切より前");
assert(program.supportPlanDeadline < program.deadline, "様式4は申請締切より前に取る必要がある");

// 補助率・上限の切り替え
assert(limitOf(program) === 500_000, "既定は50万円");
assert(limitOf(program, { invoice: true }) === 1_000_000, "インボイス特例で100万円");
assert(limitOf(program, { wage: true }) === 2_000_000, "賃金引上げ特例で200万円");
assert(limitOf(program, { invoice: true, wage: true }) === 2_500_000, "両方で250万円");
assert(rateOf(program)[0] === 2, "既定は2/3");
assert(rateOf(program, { deficit: true })[0] === 3, "赤字は3/4");

// 逆算: 50万円もらうには75万円必要
assert(requiredCostFor(500_000, [2, 3]) === 750_000, "2/3なら75万円");
assert(requiredCostFor(500_000, [3, 4]) === 666_667, "3/4なら約66.7万円");

// 広報費とウェブは単独申請不可・上限30万円
const promo = CATEGORY_RULES.find(r => r.category === "広報費")!;
const web = CATEGORY_RULES.find(r => r.category === "ウェブサイト関連費")!;
assert(promo.soloNotAllowed && web.soloNotAllowed, "広報費とウェブは単独申請不可");
assert(promo.subsidyLimit === 300_000 && web.subsidyLimit === 300_000, "どちらも補助金上限30万円");
assert(
  CATEGORY_RULES.find(r => r.category === "機械装置等費")!.soloNotAllowed === false,
  "機械装置等費は単独でも申請できる",
);

function expense(patch: Partial<Expense>): Expense {
  return {
    id: 1,
    date: "2026-11-10",
    vendor: "業者",
    amount: 100_000,
    account: "広告宣伝費",
    taxCategory: "10%",
    note: "",
    businessRatio: 100,
    paymentMethod: "現金",
    receipt: "あり",
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
    ...patch,
  };
}

// 区分の推定
assert(classifyJizokukaCategory(expense({ note: "チラシ 5000部" })) === "広報費", "チラシは広報費");
assert(classifyJizokukaCategory(expense({ note: "店舗看板の製作" })) === "広報費", "看板は広報費");
assert(classifyJizokukaCategory(expense({ note: "ホームページ制作" })) === "ウェブサイト関連費", "HPはウェブ");
assert(classifyJizokukaCategory(expense({ note: "Instagram広告" })) === "ウェブサイト関連費", "SNS広告はウェブ");
assert(classifyJizokukaCategory(expense({ note: "紹介動画の制作" })) === "ウェブサイト関連費", "動画はウェブ");
assert(classifyJizokukaCategory(expense({ note: "展示会 出展料" })) === "展示会等出展費", "出展は展示会等出展費");
assert(
  classifyJizokukaCategory(expense({ note: "旧マットの撤去", account: "修繕費" })) === "設備処分費",
  "撤去は設備処分費",
);
// ウェブは広報より先に判定される（「チラシとHP」のような混在で誤らせない）
assert(
  classifyJizokukaCategory(expense({ note: "ホームページ用のチラシ画像" })) === "ウェブサイト関連費",
  "ウェブが優先",
);

// 勘定科目からの受け皿
assert(
  classifyJizokukaCategory(expense({ note: "サンドバッグ", account: "消耗品費", amount: 80_000 })) === "機械装置等費",
  "5万円以上の消耗品は機械装置等費の候補",
);
assert(
  classifyJizokukaCategory(expense({ note: "テープ", account: "消耗品費", amount: 3_000 })) === undefined,
  "少額の消耗品は候補にしない",
);
assert(
  classifyJizokukaCategory(expense({ note: "電気代", account: "水道光熱費" })) === undefined,
  "光熱費は対象外",
);

// 計算: 機械装置 60万 + 広報 15万 → 補助率2/3
const mixed = [
  expense({ id: 1, note: "トレーニング機器一式", account: "消耗品費", amount: 600_000 }),
  expense({ id: 2, note: "チラシ 5000部", amount: 150_000 }),
];
const calc = calcJizokuka(mixed, program);
assert(calc.totalCost === 750_000, "対象経費の合計は75万円");
// 機械装置 600,000 × 2/3 = 400,000 / 広報 150,000 × 2/3 = 100,000（上限30万未満）
assert(calc.lines[0].category === "機械装置等費" && calc.lines[0].subsidy === 400_000, "機械装置の補助額");
assert(calc.lines[1].category === "広報費" && calc.lines[1].subsidy === 100_000, "広報費の補助額");
assert(calc.subtotal === 500_000, "小計は50万円");
assert(calc.subsidy === 500_000, "交付申請額は上限ちょうどの50万円");
assert(calc.soloViolation === false, "機械装置が入っているので構成はOK");
assert(calc.shortfallCost === 0, "上限に到達している");

// 区分上限: 広報費に60万円かけても補助金は30万円で頭打ち
const promoHeavy = calcJizokuka(
  [
    expense({ id: 1, note: "チラシ", amount: 600_000 }),
    expense({ id: 2, note: "サンドバッグ", account: "消耗品費", amount: 100_000 }),
  ],
  program,
);
const promoLine = promoHeavy.lines.find(l => l.category === "広報費")!;
assert(promoLine.rawSubsidy === 400_000, "補助率だけなら40万円");
assert(promoLine.subsidy === 300_000, "区分上限30万円で頭打ち");
assert(promoLine.capped === true, "頭打ちフラグ");

// 単独申請不可の検出: 広報費とウェブだけの構成
const soloBad = calcJizokuka(
  [expense({ id: 1, note: "チラシ", amount: 300_000 }), expense({ id: 2, note: "ホームページ制作", amount: 300_000 })],
  program,
);
assert(soloBad.soloViolation === true, "広報＋ウェブだけは申請できない");
// 機械装置を1件足せば解消する
const soloFixed = calcJizokuka(
  [
    expense({ id: 1, note: "チラシ", amount: 300_000 }),
    expense({ id: 2, note: "ホームページ制作", amount: 300_000 }),
    expense({ id: 3, note: "サンドバッグ", account: "消耗品費", amount: 200_000 }),
  ],
  program,
);
assert(soloFixed.soloViolation === false, "機械装置を足せば構成OK");
// 広報 200,000 + ウェブ 200,000 + 機械装置 133,333 = 533,333 → 全体上限で 500,000 に収まる
assert(soloFixed.subtotal === 533_333, "区分上限を当てた小計");
assert(soloFixed.subsidy === 500_000, "全体上限50万円で頭打ち");
assert(soloFixed.cappedByLimit === true, "全体上限で頭打ち");

// 対象経費が空でも落ちない
const empty = calcJizokuka([], program);
assert(empty.totalCost === 0 && empty.subsidy === 0, "0件なら0円");
assert(empty.soloViolation === false, "0件は構成違反にしない");
assert(empty.shortfallCost === 750_000, "上限を取るには75万円必要");

// 赤字事業者は3/4なので少ない支出で上限に届く
const deficit = calcJizokuka([expense({ note: "サンドバッグ", account: "消耗品費", amount: 666_667 })], program, {
  deficit: true,
});
assert(deficit.subsidy === 500_000, "3/4なら約66.7万円で上限");

// 申請メモ
const pack = buildApplicationPack({
  program,
  expenses: mixed,
  applicant: "FLATUP GYM",
  address: "成田市土屋516-4 2F",
  today: "2026-08-02",
});
assert(pack.includes("第20回"), "回次が入る");
assert(pack.includes("2026-12-15"), "締切が入る");
assert(pack.includes("2026-12-04"), "様式4の締切が入る");
assert(pack.includes("成田商工会議所が発行"), "様式4の発行元が明示される");
assert(pack.includes("GビズIDプライム"), "GビズIDの注意が入る");
assert(pack.includes("交付決定より前に発注・契約・支払をしない"), "事故防止の注意");
assert(pack.includes("上限に到達しています"), "到達時の文言");
for (const doc of DOCUMENTS_SOLE_PROPRIETOR) {
  assert(pack.includes(doc.name), `提出書類 ${doc.name} が入る`);
}

// 構成違反があるときは資料の先頭で止める
const badPack = buildApplicationPack({ program, expenses: soloBad.lines.flatMap(l => l.expenses), today: "2026-08-02" });
assert(badPack.includes("このままでは申請できません"), "構成違反を明示");
assert(badPack.includes("機械装置等費や展示会等出展費と組み合わせて"), "直し方を示す");

// 不足額を示す
const shortPack = buildApplicationPack({
  program,
  expenses: [expense({ note: "サンドバッグ", account: "消耗品費", amount: 300_000 })],
  today: "2026-08-02",
});
assert(shortPack.includes("あと **450,000円** 足りません"), "不足額 75万 − 30万 = 45万");

console.log("keihi jizokuka tests passed");
