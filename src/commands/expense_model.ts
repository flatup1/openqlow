// 経費の正規データモデル（共有コア）
//
// 台帳(expense_ledger) と 各会計ソフト向けエクスポータ(expense_export) の
// 両方から参照する最小の型・定数・計算をここに置き、循環参照を避ける。

export const DEFAULT_TAX_RATE = 10; // 税込み前提。既定の消費税率(%)

export interface ExpenseEntry {
  date: string; // YYYY-MM-DD (JST)
  amount: number; // 円（税込・整数）
  category: string;
  memo: string;
  taxRate?: number; // 消費税率(%)。未指定は DEFAULT_TAX_RATE 扱い。
}

/** 税込金額から内税（消費税）を四捨五入で求める。 */
export function taxAmount(amountIncludingTax: number, taxRate = DEFAULT_TAX_RATE): number {
  if (taxRate <= 0) return 0;
  return Math.round(amountIncludingTax - amountIncludingTax / (1 + taxRate / 100));
}
