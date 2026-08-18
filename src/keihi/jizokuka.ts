// 小規模事業者持続化補助金＜一般型・通常枠＞第20回 の申請準備
//
// FLATUP GYM（サービス業・従業員1人・個人事業主）が現実的に狙える補助金。
// 補助率2/3、上限50万円。つまり **税込75万円使えば50万円** が返る。
//
// 第20回でいちばん効く変更点:
//   広報費（チラシ・看板）とウェブサイト関連費（HP・SNS広告・動画）は
//   **それぞれ補助金30万円が上限**で、しかも **その2つだけでは申請できない**。
//   機械装置等費や展示会等出展費と組み合わせる必要がある。
//   ここを外すと計画ごと差し戻されるので、組み合わせの検査を最優先で行う。
//
// この仕組みの役割:
//   1) 経費帳から補助対象になりうる支出を区分ごとに拾う
//   2) 区分上限・全体上限を当てて交付申請額を計算する
//   3) 「広報費とウェブだけ」になっていないかを検査する
//   4) 上限50万円を取るのにあといくら必要かを逆算する
//   5) 個人事業主向けの提出書類チェックリストと申請メモを出す
//
// ⚠️ 金額・区分・上限は公表情報にもとづく整理。公式の公募要領は調査環境から
//    参照できなかったため、**申請前に必ず公募要領の原本で検算すること**。
//    参照: https://official.jizokukanb.com/

import { type Expense } from "./expense.js";

/** 補助対象経費の区分（一般型・通常枠の8区分）。 */
export type JizokukaCategory =
  | "機械装置等費"
  | "広報費"
  | "ウェブサイト関連費"
  | "展示会等出展費"
  | "旅費"
  | "新商品開発費"
  | "借料"
  | "設備処分費";

export interface CategoryRule {
  category: JizokukaCategory;
  /** この区分から出る補助金額の上限（円）。undefined は区分ごとの上限なし */
  subsidyLimit?: number;
  /** true ならこの区分だけでは申請できない（他の区分との組み合わせが必要） */
  soloNotAllowed: boolean;
  hint: string;
}

/** 第20回の区分ルール。広報費とウェブは上限つき・単独申請不可。 */
export const CATEGORY_RULES: readonly CategoryRule[] = [
  {
    category: "機械装置等費",
    soloNotAllowed: false,
    hint: "補助事業に必要な機械・設備。汎用品（車両・PC・タブレット）は対象外。税込100万円超は2社以上の相見積が必要",
  },
  {
    category: "広報費",
    subsidyLimit: 300_000,
    soloNotAllowed: true,
    hint: "チラシ・カタログ・新聞雑誌広告・看板・DM。名刺や会社案内など単なる会社PRは対象外",
  },
  {
    category: "ウェブサイト関連費",
    subsidyLimit: 300_000,
    soloNotAllowed: true,
    hint: "HP・ECサイト・システム開発・ネット広告・SNS運用外注・動画制作",
  },
  { category: "展示会等出展費", soloNotAllowed: false, hint: "展示会・商談会の出展料など" },
  { category: "旅費", soloNotAllowed: false, hint: "補助事業のための出張旅費。日常の移動は対象外" },
  { category: "新商品開発費", soloNotAllowed: false, hint: "新商品・新サービスの試作にかかる原材料費など" },
  { category: "借料", soloNotAllowed: false, hint: "補助事業のために一時的に借りる機器・設備のレンタル料" },
  { category: "設備処分費", soloNotAllowed: false, hint: "既存設備の処分。補助対象経費の1/2までなどの制限あり" },
];

export interface JizokukaProgram {
  name: string;
  round: string;
  /** 申請受付の開始日（YYYY-MM-DD） */
  openFrom: string;
  /** 申請の締切（YYYY-MM-DD 17:00） */
  deadline: string;
  /** 事業支援計画書（様式4）の発行締切。商工会議所が出すので先に動く必要がある */
  supportPlanDeadline: string;
  /** 補助上限額（円） */
  baseLimit: number;
  /** インボイス特例の加算額（円） */
  invoiceBonus: number;
  /** 賃金引上げ特例の加算額（円） */
  wageBonus: number;
  /** 補助率の分子・分母 */
  rateNumerator: number;
  rateDenominator: number;
  /** 赤字事業者の補助率 */
  deficitRateNumerator: number;
  deficitRateDenominator: number;
  /** 商業・サービス業（宿泊・娯楽業を除く）の従業員数の上限 */
  employeeLimitService: number;
  reference: string;
}

/** 第20回の内容。公表情報にもとづく整理で、原本は公募要領。 */
export const JIZOKUKA_R20: JizokukaProgram = {
  name: "小規模事業者持続化補助金＜一般型・通常枠＞",
  round: "第20回",
  openFrom: "2026-11-05",
  deadline: "2026-12-15",
  supportPlanDeadline: "2026-12-04",
  baseLimit: 500_000,
  invoiceBonus: 500_000,
  wageBonus: 1_500_000,
  rateNumerator: 2,
  rateDenominator: 3,
  deficitRateNumerator: 3,
  deficitRateDenominator: 4,
  employeeLimitService: 5,
  reference: "https://official.jizokukanb.com/",
};

// 区分の推定に使うキーワード。勘定科目だけでは分けきれないため語で見る。
const WEB_KEYWORDS = [
  "ホームページ", "hp", "ウェブ", "web", "サイト", "lp", "ec",
  "instagram", "インスタ", "sns", "ネット広告", "リスティング", "動画", "youtube", "システム開発",
];
const PROMO_KEYWORDS = ["チラシ", "ポスティング", "看板", "のぼり", "カタログ", "dm", "新聞広告", "雑誌広告", "折込"];
const EXHIBIT_KEYWORDS = ["展示会", "商談会", "出展"];
const DISPOSAL_KEYWORDS = ["処分", "撤去", "廃棄", "解体"];
const RENTAL_KEYWORDS = ["レンタル", "リース", "貸出"];

/**
 * 経費1件がどの区分の候補になるかを推定する。
 * あくまで候補。最終的にどの区分で出すかは公募要領を見て人が決める。
 * @returns 補助対象になりそうにない支出は undefined
 */
export function classifyJizokukaCategory(expense: Expense): JizokukaCategory | undefined {
  const haystack = `${expense.vendor} ${expense.note}`.normalize("NFKC").toLowerCase();
  const has = (words: readonly string[]) => words.some(w => haystack.includes(w.toLowerCase()));

  if (has(EXHIBIT_KEYWORDS)) return "展示会等出展費";
  if (has(WEB_KEYWORDS)) return "ウェブサイト関連費";
  if (has(PROMO_KEYWORDS)) return "広報費";
  if (has(DISPOSAL_KEYWORDS)) return "設備処分費";
  if (has(RENTAL_KEYWORDS)) return "借料";

  // 勘定科目からの推定（語で当たらなかった場合の受け皿）
  switch (expense.account) {
    case "広告宣伝費":
      return "広報費";
    case "消耗品費":
      // 機械装置等費は「補助事業に必要な設備」。少額の消耗品は対象になりにくいので
      // 一定額以上だけを候補に挙げる（誤って計画に混ぜないため）。
      return expense.amount >= 50_000 ? "機械装置等費" : undefined;
    case "外注工賃":
      return "新商品開発費";
    default:
      return undefined;
  }
}

export interface CategoryLine {
  category: JizokukaCategory;
  rule: CategoryRule;
  expenses: Expense[];
  /** 補助対象経費の合計（円） */
  cost: number;
  /** 補助率を掛けた額（区分上限の適用前） */
  rawSubsidy: number;
  /** 区分上限を適用したあとの補助金額 */
  subsidy: number;
  /** 区分上限で頭打ちになったか */
  capped: boolean;
}

export interface JizokukaCalculation {
  lines: CategoryLine[];
  /** 補助対象経費の合計 */
  totalCost: number;
  /** 区分上限を当てたあとの補助金額の合計 */
  subtotal: number;
  /** 全体上限を当てた最終的な交付申請額 */
  subsidy: number;
  /** 適用した補助上限額 */
  limit: number;
  /** 適用した補助率 */
  rate: [number, number];
  /** 全体上限で頭打ちになったか */
  cappedByLimit: boolean;
  /** 「広報費・ウェブサイト関連費だけ」になっていないか。true なら申請できない */
  soloViolation: boolean;
  /** 上限まであといくらの対象経費が要るか（0なら到達済み） */
  shortfallCost: number;
}

export interface CalcOptions {
  /** 赤字事業者は補助率3/4 */
  deficit?: boolean;
  /** インボイス特例を使う（登録事業者になる場合） */
  invoice?: boolean;
  /** 賃金引上げ特例を使う */
  wage?: boolean;
}

/** 適用される補助上限額を求める。 */
export function limitOf(program: JizokukaProgram, options: CalcOptions = {}): number {
  let limit = program.baseLimit;
  if (options.invoice) limit += program.invoiceBonus;
  if (options.wage) limit += program.wageBonus;
  return limit;
}

/** 適用される補助率を求める。 */
export function rateOf(program: JizokukaProgram, options: CalcOptions = {}): [number, number] {
  return options.deficit
    ? [program.deficitRateNumerator, program.deficitRateDenominator]
    : [program.rateNumerator, program.rateDenominator];
}

/**
 * 上限額を受け取るのに必要な補助対象経費を逆算する。
 * 「50万円もらうにはいくら使えばいいか」を先に決めるための計算。
 */
export function requiredCostFor(subsidy: number, rate: [number, number]): number {
  return Math.ceil((subsidy * rate[1]) / rate[0]);
}

/**
 * 補助対象経費から交付申請額を計算する。
 * 区分ごとの上限 → 全体上限の順に当てる。端数は切り捨て。
 *
 * 免税事業者（インボイス未登録・課税売上1000万円以下）は税込金額が
 * 補助対象になるため、ここでは経費帳の税込金額をそのまま使う。
 */
export function calcJizokuka(
  expenses: Expense[],
  program: JizokukaProgram,
  options: CalcOptions = {},
): JizokukaCalculation {
  const rate = rateOf(program, options);
  const limit = limitOf(program, options);
  const buckets = new Map<JizokukaCategory, Expense[]>();

  for (const expense of expenses) {
    const category = classifyJizokukaCategory(expense);
    if (!category) continue;
    const list = buckets.get(category) ?? [];
    list.push(expense);
    buckets.set(category, list);
  }

  const lines: CategoryLine[] = [];
  for (const rule of CATEGORY_RULES) {
    const list = buckets.get(rule.category);
    if (!list || list.length === 0) continue;
    const cost = list.reduce((sum, e) => sum + e.amount, 0);
    const rawSubsidy = Math.floor((cost * rate[0]) / rate[1]);
    const subsidy = rule.subsidyLimit === undefined ? rawSubsidy : Math.min(rawSubsidy, rule.subsidyLimit);
    lines.push({ category: rule.category, rule, expenses: list, cost, rawSubsidy, subsidy, capped: subsidy < rawSubsidy });
  }

  const totalCost = lines.reduce((sum, line) => sum + line.cost, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.subsidy, 0);
  const subsidy = Math.min(subtotal, limit);

  // 単独申請できない区分だけで構成されていないか
  const usedCategories = lines.filter(line => line.cost > 0);
  const soloViolation =
    usedCategories.length > 0 && usedCategories.every(line => line.rule.soloNotAllowed);

  const requiredCost = requiredCostFor(limit, rate);
  const shortfallCost = Math.max(0, requiredCost - totalCost);

  return {
    lines,
    totalCost,
    subtotal,
    subsidy,
    limit,
    rate,
    cappedByLimit: subtotal > limit,
    soloViolation,
    shortfallCost,
  };
}

/** 個人事業主が提出する書類。公表情報にもとづく整理。 */
export const DOCUMENTS_SOLE_PROPRIETOR: ReadonlyArray<{ name: string; hint: string }> = [
  { name: "経営計画書・補助事業計画書（様式1〜3）", hint: "公式サイトの様式。ここが審査の本体で、採否はほぼこれで決まる" },
  { name: "事業支援計画書（様式4）", hint: "**成田商工会議所が発行**。自分では作れないので早めに相談予約を取る" },
  { name: "補助金交付申請書（様式5）", hint: "採択後ではなく申請時に必要" },
  { name: "直近の確定申告書の写し", hint: "第一表・第二表と青色申告決算書（または収支内訳書）。収受印またはe-Tax受信通知が必要" },
  { name: "開業届の写し", hint: "確定申告書がまだ無い場合（創業間もない場合）に使う" },
  { name: "見積書", hint: "税込100万円を超える機械装置等費は2社以上の相見積が必要" },
  { name: "電子申請の準備（GビズIDプライム）", hint: "**取得に2〜3週間かかることがある**。持っていなければ今すぐ申請する" },
];

/** 締切から逆算した準備スケジュール（締切日からの日数オフセット）。 */
export const PLAN_STEPS: ReadonlyArray<{ offset: number; title: string; detail: string }> = [
  { offset: -120, title: "成田商工会議所に相談予約を入れる", detail: "様式4は商工会議所しか発行できない。秋は駆け込みで混むので、夏のうちに枠を取る" },
  { offset: -110, title: "GビズIDプライムを取得する", detail: "電子申請に必須。取得に2〜3週間かかることがある。持っていなければ最優先" },
  { offset: -60, title: "何を買うかを決める", detail: "広報費・ウェブだけでは申請できない。機械装置等費や展示会等出展費と組み合わせる" },
  { offset: -45, title: "見積を取る", detail: "税込100万円超の機械装置等費は2社以上の相見積が必要" },
  { offset: -30, title: "経営計画書・補助事業計画書を書く", detail: "審査の本体。商工会議所に添削してもらう" },
  { offset: -20, title: "様式4の発行を依頼する", detail: "商工会議所に計画書を持ち込む。発行まで日数がかかる" },
  { offset: -11, title: "様式4の発行締切", detail: "この日を過ぎると申請できない" },
  { offset: -5, title: "電子申請で提出", detail: "締切当日を狙わない。システム混雑と入力ミスの余白を残す" },
  { offset: 0, title: "申請締切 17:00", detail: "これ以降は受付されない" },
];

const YEN = new Intl.NumberFormat("ja-JP");

export interface ApplicationPackInput {
  program: JizokukaProgram;
  expenses: Expense[];
  options?: CalcOptions;
  applicant?: string;
  address?: string;
  today?: string;
}

/**
 * 申請メモの下書き（Markdown）を作る。
 * 提出物ではなく、公募要領を見ながら計画書を書くための手元資料。
 */
export function buildApplicationPack(input: ApplicationPackInput): string {
  const { program, expenses } = input;
  const options = input.options ?? {};
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const applicant = input.applicant ?? "（申請者名を記入）";
  const address = input.address ?? "（所在地を記入）";
  const result = calcJizokuka(expenses, program, options);

  const lineRows = result.lines.length
    ? result.lines.map(
        line =>
          `| ${line.category} | ${line.expenses.length} | ${YEN.format(line.cost)} | ${YEN.format(line.subsidy)} | ${line.capped ? `上限${YEN.format(line.rule.subsidyLimit!)}円で頭打ち` : "—"} |`,
      )
    : ["| - | - | 0 | 0 | 対象になりそうな支出が未登録 |"];

  const verdict = result.soloViolation
    ? `> 🚫 **このままでは申請できません。** 広報費・ウェブサイト関連費だけの構成になっています。\n> 機械装置等費や展示会等出展費と組み合わせてください（第20回からの変更点）。`
    : result.shortfallCost > 0
      ? `上限 ${YEN.format(result.limit)}円 を受け取るには、補助対象経費が合計 ${YEN.format(requiredCostFor(result.limit, result.rate))}円 必要です。\nあと **${YEN.format(result.shortfallCost)}円** 足りません。`
      : `補助対象経費は上限に到達しています。交付申請額は **${YEN.format(result.subsidy)}円** です。`;

  const evidenceRows = result.lines.flatMap(line =>
    line.expenses.map(e => `| ${line.category} | ${e.date} | ${e.vendor} | ${e.note || "-"} | ${YEN.format(e.amount)} |`),
  );

  return `# ${program.name}（${program.round}）申請メモ（下書き）

> ⚠️ これは提出物ではなく手元資料です。金額・区分・上限は必ず公募要領の原本で検算してください。
> 参照: ${program.reference}

- 作成日: ${today}
- 申請者: ${applicant}（個人事業主）
- 所在地: ${address}
- 補助率: **${result.rate[0]}/${result.rate[1]}**${options.deficit ? "（赤字事業者）" : ""}
- 補助上限: **${YEN.format(result.limit)}円**${options.invoice ? "（インボイス特例あり）" : ""}${options.wage ? "（賃金引上げ特例あり）" : ""}
- 申請受付: ${program.openFrom} 〜 **${program.deadline} 17:00**
- 様式4（事業支援計画書）の発行締切: **${program.supportPlanDeadline}**

## 0. 最初の関門：様式4とGビズID

この補助金は、**成田商工会議所が発行する「事業支援計画書（様式4）」が無いと申請できません。**
自分では作れず、発行にも日数がかかります。秋は駆け込みで混むので、夏のうちに相談予約を取ってください。

電子申請には **GビズIDプライム** が要ります。取得に2〜3週間かかることがあるので、持っていなければ今すぐ申請してください。

## 1. 交付申請額の計算

${verdict}

| 区分 | 件数 | 補助対象経費(円) | 補助金額(円) | 備考 |
| --- | ---: | ---: | ---: | --- |
${lineRows.join("\n")}
| **合計** | **${result.lines.reduce((n, l) => n + l.expenses.length, 0)}** | **${YEN.format(result.totalCost)}** | **${YEN.format(result.subsidy)}** | ${result.cappedByLimit ? `全体上限${YEN.format(result.limit)}円で頭打ち` : "—"} |

## 2. 区分ごとのルール（第20回）

${CATEGORY_RULES.map(r => {
  const limit = r.subsidyLimit ? `補助金上限 ${YEN.format(r.subsidyLimit)}円` : "区分ごとの上限なし";
  const solo = r.soloNotAllowed ? "・**単独申請不可**" : "";
  return `- **${r.category}**（${limit}${solo}）— ${r.hint}`;
}).join("\n")}

## 3. 拾った支出の内訳

| 区分 | 日付 | 支払先 | 内容 | 金額(円) |
| --- | --- | --- | --- | ---: |
${evidenceRows.length ? evidenceRows.join("\n") : "| - | - | （対象になりそうな支出が未登録） | - | - |"}

※ 区分は経費帳からの**推定**です。どの区分で出すかは公募要領を見て確定してください。
※ 補助金は**交付決定後に発注したもの**が対象です。ここに並んだ過去の支出はそのままでは対象になりません。
   何を買うかを決める材料として使ってください。

## 4. 提出書類チェックリスト（個人事業主）

${DOCUMENTS_SOLE_PROPRIETOR.map(d => `- [ ] **${d.name}** — ${d.hint}`).join("\n")}

## 5. つまずきやすいところ

1. **交付決定より前に発注・契約・支払をしない。** これをやると対象外になります。
2. **広報費・ウェブサイト関連費だけでは申請できない。** 第20回からの変更点で、いちばん見落とされます。
3. **審査は計画書で決まる。** 何を買うかより「なぜそれで売上が伸びるか」を書けるかが勝負です。商工会議所に添削してもらってください。
`;
}
