// 千葉市中小企業者エネルギー価格等高騰対策支援金（第4弾）の申請準備
//
// これは設備を買う「補助金」ではなく、光熱費・燃料費が一定額を超えた事業者に
// 一律11万円が出る「支援金」。だから必要なのは見積でも省エネ効果計算でもなく、
// **過去の電気・ガス・燃料の請求書** で要件を満たすことを示すこと。
//
// この仕組みの役割は3つ。
//  1) 経費帳から月ごとの光熱費・燃料費を集計し、要件を満たす月を自動で探す
//  2) 満たす月の証拠（どの請求書を出せばよいか）を一覧にする
//  3) 提出書類チェックリストと申請メモの下書きを出す
//
// ⚠️ 所在地要件に注意。この支援金は「千葉市内に本店がある法人」または
//    「千葉市内に住所もしくは主たる事業所を有する個人事業者」が対象。
//    事業所が市外の場合は対象外になりうるので、必ず事務局に確認すること。
//
// ⚠️ 金額・要件・書類は公表情報にもとづく整理。最終確認は必ず公式の「申請の手引き」で行う。
//    参照: https://chushoenergy4.city.chiba.jp/（事務局の電話番号は docs/keihi/README.md）

import { type Expense } from "./expense.js";

export interface EnergyGrantProgram {
  /** 支援金の正式名称 */
  name: string;
  /** 申請受付の開始日（YYYY-MM-DD） */
  openFrom: string;
  /** 申請の締切（YYYY-MM-DD・郵送は消印有効） */
  deadline: string;
  /** 給付額（一律・円） */
  amount: number;
  /** 対象期間の開始月（YYYY-MM） */
  periodFrom: string;
  /** 対象期間の終了月（YYYY-MM） */
  periodTo: string;
  /** 要件A: 任意の1か月の「光熱費＋燃料費」の下限（円） */
  monthlyEnergyThreshold: number;
  /** 要件B: 連続3か月の「原材料費＋光熱費＋燃料費」の月平均の下限（円） */
  threeMonthAverageThreshold: number;
  /** 所在地の要件（そのまま表示して確認に使う） */
  locationRequirement: string;
  reference: string;
  contact: string;
}

/** 第4弾（令和8年度）の内容。公表情報にもとづく整理で、原本は「申請の手引き」。 */
export const CHIBA_ENERGY_GRANT: EnergyGrantProgram = {
  name: "千葉市中小企業者エネルギー価格等高騰対策支援金（第4弾）",
  openFrom: "2026-05-08",
  deadline: "2026-08-31",
  amount: 110_000,
  periodFrom: "2025-04",
  periodTo: "2026-03",
  monthlyEnergyThreshold: 30_000,
  threeMonthAverageThreshold: 500_000,
  locationRequirement:
    "千葉市内に本店がある法人、または千葉市内に住所もしくは主たる事業所を有する個人事業者で、今後も市内で事業を継続する意思があること",
  reference: "https://chushoenergy4.city.chiba.jp/",
  // 電話番号は公式サイトと docs/keihi/README.md に置く（ソースに連絡先を直書きしない）
  contact: "千葉市中小企業者エネルギー価格等高騰対策支援金事務局（平日9:00〜17:00・番号は公式サイト記載）",
};

/** 支援金の判定でいう「光熱費」＝電気・ガス（LPガスを含む）。水道は含まない。 */
const UTILITY_KEYWORDS = [
  "電気", "電力", "東京電力", "でんき", "エナジー", "エネオスでんき",
  "ガス", "都市ガス", "lpガス", "lpg", "プロパン", "京葉ガス", "東京ガス",
];

/** 支援金の判定でいう「燃料費」＝ガソリン・重油・軽油・灯油。 */
const FUEL_KEYWORDS = [
  "ガソリン", "給油", "軽油", "灯油", "重油", "燃料",
  "eneos", "エネオス", "出光", "コスモ石油", "シェル", "apollostation",
];

/** 水道だけの請求は対象外。混在請求は人が切り分ける必要がある。 */
const WATER_KEYWORDS = ["水道", "上下水道"];

export type EnergyKind = "光熱費" | "燃料費" | "対象外";

/**
 * 1件の支出が支援金の判定対象（光熱費・燃料費）かを見分ける。
 * 勘定科目ではなく支払先・摘要の語で判定する。ガソリンは旅費交通費に
 * 入っていることが多く、科目だけでは拾えないため。
 */
export function classifyEnergyKind(expense: Pick<Expense, "vendor" | "note">): EnergyKind {
  const haystack = `${expense.vendor} ${expense.note}`.normalize("NFKC").toLowerCase();
  const hasUtility = UTILITY_KEYWORDS.some(k => haystack.includes(k.toLowerCase()));
  const hasFuel = FUEL_KEYWORDS.some(k => haystack.includes(k.toLowerCase()));
  const hasWater = WATER_KEYWORDS.some(k => haystack.includes(k));

  if (hasUtility) return "光熱費";
  if (hasFuel) return "燃料費";
  // 「水道光熱費」のように水道だけが当たった場合は対象外（電気・ガスの記載がない）
  if (hasWater) return "対象外";
  return "対象外";
}

export interface MonthlyEnergy {
  /** YYYY-MM */
  month: string;
  utility: number;
  fuel: number;
  total: number;
  /** その月の内訳になった支出（証拠書類を探すための手がかり） */
  expenses: Expense[];
  /** 要件A（1か月あたりの下限）を満たすか */
  qualifies: boolean;
}

/**
 * 対象期間の各月について、光熱費・燃料費を集計する。
 * 金額は請求どおりの税込額を使う（事業按分は税務の話で、支援金の判定とは別）。
 */
export function monthlyEnergyCosts(list: Expense[], program: EnergyGrantProgram): MonthlyEnergy[] {
  const months = new Map<string, MonthlyEnergy>();

  for (const expense of list) {
    const month = expense.date.slice(0, 7);
    if (month < program.periodFrom || month > program.periodTo) continue;

    const kind = classifyEnergyKind(expense);
    if (kind === "対象外") continue;

    const entry = months.get(month) ?? {
      month,
      utility: 0,
      fuel: 0,
      total: 0,
      expenses: [],
      qualifies: false,
    };
    if (kind === "光熱費") entry.utility += expense.amount;
    else entry.fuel += expense.amount;
    entry.total += expense.amount;
    entry.expenses.push(expense);
    months.set(month, entry);
  }

  return [...months.values()]
    .map(entry => ({ ...entry, qualifies: entry.total >= program.monthlyEnergyThreshold }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface EligibilityResult {
  /** 要件Aを満たす月（金額の大きい順）。1つでもあれば申請できる */
  qualifyingMonths: MonthlyEnergy[];
  /** 判定に使える月の全体 */
  allMonths: MonthlyEnergy[];
  /** 一番惜しい月と、あといくら足りないか */
  closest?: { month: MonthlyEnergy; shortfall: number };
  /** 要件Aを満たしているか */
  eligibleByMonthly: boolean;
  /** 帳簿に対象期間のデータがそもそも入っているか */
  hasData: boolean;
}

/**
 * 要件A（任意の1か月で光熱費＋燃料費が下限以上）を経費帳から判定する。
 * 要件B（連続3か月・原材料費込みで月平均50万円以上）は原材料費の登録が要るため、
 * ここでは判定せず、手引きの確認事項として残す。
 */
export function checkEligibility(list: Expense[], program: EnergyGrantProgram): EligibilityResult {
  const allMonths = monthlyEnergyCosts(list, program);
  const qualifyingMonths = allMonths
    .filter(m => m.qualifies)
    .sort((a, b) => b.total - a.total);

  const notQualifying = allMonths.filter(m => !m.qualifies).sort((a, b) => b.total - a.total);
  const closest = notQualifying[0]
    ? { month: notQualifying[0], shortfall: program.monthlyEnergyThreshold - notQualifying[0].total }
    : undefined;

  return {
    qualifyingMonths,
    allMonths,
    closest,
    eligibleByMonthly: qualifyingMonths.length > 0,
    hasData: allMonths.length > 0,
  };
}

/** 提出書類。公表情報にもとづく整理で、最終確認は「申請の手引き」で行う。 */
export const REQUIRED_DOCUMENTS: ReadonlyArray<{ name: string; hint: string; forWhom: "共通" | "個人" | "法人" }> = [
  { name: "様式第1号 給付申請書", forWhom: "共通", hint: "公式サイトからWord/Excel/PDFのいずれかをダウンロード。全ページ作成して提出" },
  { name: "様式第2号 誓約書・同意書", forWhom: "共通", hint: "公式サイトの様式に記入・押印" },
  { name: "光熱費・燃料費の証拠書類", forWhom: "共通", hint: "要件を満たす月の電気・ガス・燃料の請求書または領収書。`npm run keihi -- grant` が対象月を教えます" },
  { name: "振込先口座の通帳の写し", forWhom: "共通", hint: "金融機関名・支店名・口座番号・カナ名義が見えるページ" },
  { name: "本人確認書類の写し", forWhom: "個人", hint: "運転免許証など。住所が千葉市内であることの確認に使われます" },
  { name: "直近の確定申告書の控え", forWhom: "個人", hint: "第一表。収受印またはe-Tax受信通知（メール詳細）が必要" },
  { name: "法人確定申告書 別表一の控え", forWhom: "法人", hint: "申請日時点で直近の事業年度のもの。収受印またはe-Tax受信通知が必要" },
  { name: "履歴事項全部証明書", forWhom: "法人", hint: "千葉市内に本店があることの確認。取得から3か月以内などの条件は手引きで確認" },
];

/** 申請前に自分で確かめる項目。ここを外すと申請そのものが通らない。 */
export const PRECHECK_ITEMS: ReadonlyArray<{ label: string; why: string }> = [
  {
    label: "所在地の要件を満たしているか",
    why: "千葉市内に本店（法人）または住所・主たる事業所（個人）があることが前提。市外の事業所だけの場合は対象外になりえます。まず事務局に電話で確認してください",
  },
  { label: "中小企業者の定義に当てはまるか", why: "業種ごとの資本金・従業員数の上限が手引きに書かれています" },
  { label: "今後も市内で事業を続ける意思があるか", why: "誓約書の記載事項です" },
  { label: "対象期間の請求書が手元にあるか", why: "検針票やWeb明細のPDFでも可のことが多いですが、様式は手引きで確認してください" },
  { label: "第3弾までに給付を受けているか", why: "既に10万円を受けている場合、1万円の追加給付は申請不要とされています。二重申請にならないよう確認を" },
];

const YEN = new Intl.NumberFormat("ja-JP");

export interface ApplicationPackInput {
  program: EnergyGrantProgram;
  /** 帳簿の全件（対象期間はこの中から抽出する） */
  expenses: Expense[];
  applicant?: string;
  address?: string;
  today?: string;
}

/**
 * 申請メモの下書き（Markdown）を作る。
 * これは提出物ではなく、手引きを見ながら申請書を書くための手元資料。
 */
export function buildApplicationPack(input: ApplicationPackInput): string {
  const { program, expenses } = input;
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const applicant = input.applicant ?? "（申請者名を記入）";
  const address = input.address ?? "（所在地を記入）";
  const result = checkEligibility(expenses, program);

  const monthRows = result.allMonths.length
    ? result.allMonths.map(
        m =>
          `| ${m.month} | ${YEN.format(m.utility)} | ${YEN.format(m.fuel)} | ${YEN.format(m.total)} | ${m.qualifies ? "✅ 満たす" : "—"} |`,
      )
    : ["| - | - | - | - | 対象期間のデータが未登録 |"];

  const evidence = result.qualifyingMonths[0];
  const evidenceRows = evidence
    ? evidence.expenses.map(
        e => `| ${e.date} | ${e.vendor} | ${e.note || "-"} | ${YEN.format(e.amount)} | ${e.receipt} |`,
      )
    : ["| - | （要件を満たす月がまだありません） | - | - | - |"];

  const verdict = result.eligibleByMonthly
    ? `**要件Aを満たす月があります: ${evidence!.month}（合計 ${YEN.format(evidence!.total)}円）**\nこの月の電気・ガス・燃料の請求書を証拠書類として提出します。`
    : result.hasData
      ? `対象期間で要件A（1か月あたり ${YEN.format(program.monthlyEnergyThreshold)}円以上）を満たす月がまだ見つかりません。` +
        (result.closest
          ? `\n一番近いのは ${result.closest.month.month}（${YEN.format(result.closest.month.total)}円）で、あと ${YEN.format(result.closest.shortfall)}円 足りません。**未登録の請求書が無いか確認してください。**`
          : "")
      : `対象期間（${program.periodFrom}〜${program.periodTo}）の光熱費・燃料費がまだ1件も登録されていません。まず過去の請求書を登録してください。`;

  return `# ${program.name} 申請メモ（下書き）

> ⚠️ これは提出物ではなく手元資料です。金額・要件・書類は必ず公式の「申請の手引き」で確認してください。
> 参照: ${program.reference}
> 問い合わせ: ${program.contact}

- 作成日: ${today}
- 申請者: ${applicant}
- 所在地: ${address}
- 給付額: **${YEN.format(program.amount)}円（一律）**
- 申請受付: ${program.openFrom} 〜 **${program.deadline}**（オンラインは最終日23:59送信完了／郵送は消印有効）

## 0. 先に確かめること

> ${program.locationRequirement}

${PRECHECK_ITEMS.map(item => `- [ ] **${item.label}** — ${item.why}`).join("\n")}

## 1. 要件の判定（経費帳から自動集計）

要件A: ${program.periodFrom}〜${program.periodTo} の**任意の1か月**で、光熱費（電気・ガス／LPガス含む）＋燃料費（ガソリン・重油・軽油・灯油）の合計が **${YEN.format(program.monthlyEnergyThreshold)}円以上**。

${verdict}

| 月 | 光熱費(円) | 燃料費(円) | 合計(円) | 要件A |
| --- | ---: | ---: | ---: | --- |
${monthRows.join("\n")}

※ 要件B（連続3か月で原材料費＋光熱費＋燃料費が月平均 ${YEN.format(program.threeMonthAverageThreshold)}円以上）は原材料費の登録が必要なため、ここでは判定していません。要件Aで足りるなら使いません。

## 2. 提出する証拠書類（要件を満たす月の内訳）

| 日付 | 支払先 | 内容 | 金額(円) | 手元の証憑 |
| --- | --- | --- | ---: | --- |
${evidenceRows.join("\n")}

## 3. 提出書類チェックリスト

### 共通
${REQUIRED_DOCUMENTS.filter(d => d.forWhom === "共通").map(d => `- [ ] **${d.name}** — ${d.hint}`).join("\n")}

### 個人事業者の場合
${REQUIRED_DOCUMENTS.filter(d => d.forWhom === "個人").map(d => `- [ ] **${d.name}** — ${d.hint}`).join("\n")}

### 法人の場合
${REQUIRED_DOCUMENTS.filter(d => d.forWhom === "法人").map(d => `- [ ] **${d.name}** — ${d.hint}`).join("\n")}

## 4. つまずきやすいところ

1. **所在地要件が最初の関門。** 事業所が千葉市外なら、そもそも対象にならない可能性があります。作業を始める前に事務局へ電話で確認してください。
2. **確定申告書の控えは「収受印」か「e-Tax受信通知」が要る。** 控えを印刷しただけの紙は認められないことが多いです。手元に無ければ税務署で保有個人情報の開示請求、またはe-Taxのメッセージボックスから取得します。
3. **締切当日に動かない。** 郵送は消印有効、オンラインは23:59送信完了。書類不備の差し戻しに対応する余白を残してください。
`;
}
