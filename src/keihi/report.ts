// 経費の集計・帳票・不備チェック
//
// 出す形は3つ。
//  1) 科目別集計   … 青色申告決算書の経費欄にそのまま転記できる並び
//  2) 仕訳CSV     … 会計ソフト取込用（日付/借方/貸方/摘要の汎用形式）
//  3) 不備リスト   … 申告前に潰すべき穴（レシート無し・按分未設定・要償却）
//
// 事業按分がある支出は「事業分だけ」を経費に立て、残りは事業主貸で逃がす。
// 帳簿としての整合を崩さないため、按分後の金額は必ず四捨五入して整数に戻す。

import {
  ACCOUNT_ORDER,
  ASSET_ACCOUNT,
  SMALL_ASSET_ANNUAL_LIMIT,
  SMALL_ASSET_LIMIT,
  deductibleAmount,
  depreciationFor,
  isDepreciable,
  taxAmountOf,
  validateExpense,
  type AccountTitle,
  type Depreciation,
  type Expense,
  type PaymentMethod,
  type TaxCategory,
} from "./expense.js";

export interface AccountSummary {
  account: AccountTitle;
  count: number;
  /** 税込の支払総額 */
  amount: number;
  /** 事業按分後の必要経費額 */
  deductible: number;
  /** 割り戻した消費税額（按分前） */
  tax: number;
}

export interface ExpenseSummary {
  period: string;
  count: number;
  amount: number;
  deductible: number;
  tax: number;
  byAccount: AccountSummary[];
  byTaxCategory: Array<{ taxCategory: TaxCategory; amount: number; tax: number }>;
  /**
   * 減価償却資産（耐用年数が入っている支出）。
   * 買った年に全額を経費にはできないので、上の集計からは外して別枠で持つ。
   */
  assets: Expense[];
}

/** "2026-08" 形式の月で絞り込む。 */
export function filterByMonth(list: Expense[], yearMonth: string): Expense[] {
  return list.filter(e => e.date.startsWith(yearMonth));
}

/** 暦年（1/1〜12/31）で絞り込む。個人事業主の課税期間はこれ。 */
export function filterByYear(list: Expense[], year: number): Expense[] {
  return list.filter(e => e.date.startsWith(`${year}-`));
}

/**
 * 科目別・税区分別に集計する。並びは決算書の経費欄と同じ。
 * 減価償却資産は経費に全額を落とせないため集計から外し、`assets` に分けて返す。
 * その年の償却費は `depreciationSchedule` で別に計算する。
 */
export function summarize(list: Expense[], period: string): ExpenseSummary {
  const accounts = new Map<AccountTitle, AccountSummary>();
  const taxes = new Map<TaxCategory, { amount: number; tax: number }>();
  const assets: Expense[] = [];

  let amount = 0;
  let deductible = 0;
  let tax = 0;

  for (const expense of list) {
    if (isDepreciable(expense)) {
      assets.push(expense);
      continue;
    }

    const rowDeductible = deductibleAmount(expense);
    const rowTax = taxAmountOf(expense);

    amount += expense.amount;
    deductible += rowDeductible;
    tax += rowTax;

    const account = accounts.get(expense.account) ?? {
      account: expense.account,
      count: 0,
      amount: 0,
      deductible: 0,
      tax: 0,
    };
    account.count += 1;
    account.amount += expense.amount;
    account.deductible += rowDeductible;
    account.tax += rowTax;
    accounts.set(expense.account, account);

    const bucket = taxes.get(expense.taxCategory) ?? { amount: 0, tax: 0 };
    bucket.amount += expense.amount;
    bucket.tax += rowTax;
    taxes.set(expense.taxCategory, bucket);
  }

  const byAccount = ACCOUNT_ORDER.filter(a => accounts.has(a)).map(a => accounts.get(a)!);
  const byTaxCategory = (["10%", "8%軽減", "非課税", "対象外"] as TaxCategory[])
    .filter(t => taxes.has(t))
    .map(t => ({ taxCategory: t, ...taxes.get(t)! }));

  return { period, count: list.length, amount, deductible, tax, byAccount, byTaxCategory, assets };
}

export interface DepreciationLine {
  expense: Expense;
  depreciation: Depreciation;
}

/**
 * 指定年に計上できる減価償却費の一覧。
 * 過年度に買った資産も対象になるので、**帳簿全件** を渡すこと。
 */
export function depreciationSchedule(all: Expense[], year: number): DepreciationLine[] {
  const lines: DepreciationLine[] = [];
  for (const expense of all) {
    const depreciation = depreciationFor(expense, year);
    if (depreciation && depreciation.amount > 0) lines.push({ expense, depreciation });
  }
  return lines.sort((a, b) => a.expense.date.localeCompare(b.expense.date));
}

/** 減価償却の一覧を CLI 表示用のテキストにする。 */
export function formatDepreciation(lines: DepreciationLine[], year: number): string {
  if (lines.length === 0) return `■ ${year}年の減価償却費\n  対象の資産はありません。`;

  const rows = lines.map(({ expense, depreciation }) => {
    const ratio = expense.businessRatio === 100 ? "" : `（按分後 ${YEN.format(depreciation.deductible)}円）`;
    return [
      `  #${expense.id} ${expense.date} ${expense.vendor} ${expense.note}`,
      `      取得 ${YEN.format(expense.amount)}円 / 耐用${expense.assetLife}年 / 償却率 ${depreciation.rate} / ${depreciation.months}か月`,
      `      本年の償却費 ${YEN.format(depreciation.amount)}円${ratio} / 期末残高 ${YEN.format(depreciation.bookValue)}円`,
    ].join("\n");
  });

  const total = lines.reduce((sum, line) => sum + line.depreciation.deductible, 0);
  return [`■ ${year}年の減価償却費`, ...rows, `  合計（按分後）: ${YEN.format(total)}円`].join("\n");
}

const YEN = new Intl.NumberFormat("ja-JP");

/** 集計結果を CLI・LINE 用のテキストにする。 */
export function formatSummary(summary: ExpenseSummary): string {
  if (summary.count === 0) {
    return `${summary.period} の経費はまだ0件です。`;
  }

  const rows = summary.byAccount.map(row => {
    const ratio = row.amount === row.deductible ? "" : `（按分後 ${YEN.format(row.deductible)}円）`;
    return `  ${row.account.padEnd(6, "　")} ${YEN.format(row.amount).padStart(9)}円 / ${row.count}件${ratio}`;
  });

  const taxRows = summary.byTaxCategory.map(
    row => `  ${row.taxCategory.padEnd(5, "　")} 支払 ${YEN.format(row.amount)}円 / うち消費税 ${YEN.format(row.tax)}円`,
  );

  const assetRows = summary.assets.length
    ? [
        "",
        "■ 減価償却資産（この集計には含めていません）",
        ...summary.assets.map(
          a => `  #${a.id} ${a.date} ${a.vendor} ${YEN.format(a.amount)}円 / 耐用${a.assetLife}年 → 年単位で償却`,
        ),
      ]
    : [];

  return [
    `■ ${summary.period} の経費まとめ`,
    `  件数: ${summary.count}件（うち償却資産 ${summary.assets.length}件）`,
    `  支払総額: ${YEN.format(summary.amount)}円`,
    `  必要経費（事業按分後）: ${YEN.format(summary.deductible)}円`,
    "",
    "■ 勘定科目別（決算書の並び）",
    ...rows,
    "",
    "■ 消費税区分別",
    ...taxRows,
    ...assetRows,
  ].join("\n");
}

/** 支払方法に対応する貸方科目。複式簿記の相手勘定になる。 */
export function creditAccountOf(method: PaymentMethod): string {
  switch (method) {
    case "現金":
      return "現金";
    case "クレジット":
    case "電子マネー":
      return "未払金";
    case "口座振替":
      return "普通預金";
    default:
      return "事業主借";
  }
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * 会計ソフト取込用の仕訳CSVを作る（汎用形式）。
 * 事業按分がある行は「事業分＝経費科目」「家事分＝事業主貸」の2行に割る。
 */
export function toJournalCsv(list: Expense[]): string {
  const header = ["日付", "借方勘定科目", "借方金額", "税区分", "貸方勘定科目", "貸方金額", "摘要", "インボイス番号"];
  const rows: string[][] = [header];

  for (const expense of [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    const business = deductibleAmount(expense);
    const personal = expense.amount - business;
    const credit = creditAccountOf(expense.paymentMethod);
    const summaryText = [expense.vendor, expense.note].filter(Boolean).join(" / ");

    // 減価償却資産は経費ではなく資産に計上する（償却費は決算時に別途）
    if (isDepreciable(expense)) {
      rows.push([
        expense.date,
        ASSET_ACCOUNT,
        String(expense.amount),
        expense.taxCategory,
        credit,
        String(expense.amount),
        `${summaryText}（耐用${expense.assetLife}年・償却は決算時）`,
        expense.invoiceNumber ?? "",
      ]);
      continue;
    }

    if (business > 0) {
      rows.push([
        expense.date,
        expense.account,
        String(business),
        expense.taxCategory,
        credit,
        String(business),
        summaryText,
        expense.invoiceNumber ?? "",
      ]);
    }
    if (personal > 0) {
      rows.push([
        expense.date,
        "事業主貸",
        String(personal),
        "対象外",
        credit,
        String(personal),
        `${summaryText}（家事分 ${100 - expense.businessRatio}%）`,
        "",
      ]);
    }
  }

  return rows.map(row => row.map(csvCell).join(",")).join("\n") + "\n";
}

/** 経費の一覧をそのままCSVにする（バックアップ・目視確認用）。 */
export function toExpenseCsv(list: Expense[]): string {
  const header = [
    "ID", "日付", "支払先", "金額", "勘定科目", "税区分", "消費税額",
    "按分率", "必要経費", "支払方法", "レシート", "インボイス番号", "補助金タグ", "摘要",
  ];
  const rows = [...list]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map(e => [
      e.id, e.date, e.vendor, e.amount, e.account, e.taxCategory, taxAmountOf(e),
      `${e.businessRatio}%`, deductibleAmount(e), e.paymentMethod, e.receipt,
      e.invoiceNumber ?? "", e.subsidyTag ?? "", e.note,
    ]);

  return [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n") + "\n";
}

export interface AuditIssue {
  /** 対象の経費ID。帳簿全体の問題なら 0 */
  id: number;
  label: string;
  problem: string;
}

/**
 * 申告前に潰すべき不備を洗い出す。
 * 1件ごとの検証に加えて、少額減価償却資産の年間300万円上限も見る。
 */
export function auditExpenses(list: Expense[]): AuditIssue[] {
  const issues: AuditIssue[] = [];

  for (const expense of list) {
    const label = `#${expense.id} ${expense.date} ${expense.vendor || "(支払先なし)"}`;
    for (const problem of validateExpense(expense)) {
      issues.push({ id: expense.id, label, problem });
    }
  }

  // 少額減価償却資産の特例は年間合計300万円まで。超えた年は通常の減価償却に回す必要がある。
  const byYear = new Map<string, number>();
  for (const expense of list) {
    if (expense.amount < 100_000 || expense.amount >= SMALL_ASSET_LIMIT) continue;
    const year = expense.date.slice(0, 4);
    byYear.set(year, (byYear.get(year) ?? 0) + expense.amount);
  }
  for (const [year, total] of byYear) {
    if (total > SMALL_ASSET_ANNUAL_LIMIT) {
      issues.push({
        id: 0,
        label: `${year}年`,
        problem: `少額減価償却資産の合計が ${YEN.format(total)}円 で年間上限300万円を超えています。超過分は通常の減価償却が必要です。`,
      });
    }
  }

  return issues;
}
