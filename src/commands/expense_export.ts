// 経費エクスポータ（会計ソフト向けCSVアダプタ層）
//
// 正規台帳の ExpenseEntry を、出力先フォーマットごとの CSV に変換する。
// フォーマットを増やすときは ADAPTERS に1つ足すだけで済むよう、形式別の
// 「本文の作り方・ファイル名サフィックス・BOM/文字コードの扱い」をここに閉じ込める。
//
// 対応状況:
//  - generic … 表計算/汎用（UTF-8 BOM 付き、ヘッダあり）。人が見る・Excelで開く用。
//  - yayoi   … 弥生会計 仕訳インポート形式（25列・ヘッダ無し）。個人事業主の経費を
//              「借方=勘定科目 / 貸方=事業主借」の単一仕訳として出力する。
//  - freee   … 枠のみ用意（未実装）。取引インポート形式をここに足す。

import { type ExpenseEntry, DEFAULT_TAX_RATE, taxAmount } from "./expense_model.js";

export type ExportFormat = "generic" | "yayoi" | "freee";

export interface ExportAdapterOptions {
  /** 経費の相手（貸方）勘定科目。個人事業主の既定は「事業主借」。 */
  creditAccount?: string;
  /** YYYY-MM-DD → 各ソフトの日付表記へ変換（既定は西暦スラッシュ）。 */
  formatDate?: (isoDate: string) => string;
}

export interface ExportArtifact {
  /** ファイルに書き込む本文（必要なら BOM 込み）。 */
  content: string;
  /** 出力ファイル名のサフィックス: expenses-YYYY-MM<suffix>.csv */
  fileSuffix: string;
  /** false の場合は未対応フォーマット。message を案内に使う。 */
  supported: boolean;
  message?: string;
}

const UTF8_BOM = "﻿"; // Excel で文字化けしないように（generic 用）

// --- CSV プリミティブ ---

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function isoToSlash(isoDate: string): string {
  return isoDate.replace(/-/g, "/"); // 2026-06-01 → 2026/06/01
}

// --- generic（汎用 / 表計算向け） ---

const GENERIC_HEADER = ["日付", "金額(税込)", "消費税率", "消費税(内税)", "カテゴリ", "メモ"];

/** ExpenseEntry の配列を汎用 CSV 文字列にする（ヘッダ付き）。 */
export function buildGenericCsv(entries: ExpenseEntry[]): string {
  const rows = entries.map((e) => {
    const rate = e.taxRate ?? DEFAULT_TAX_RATE;
    return [
      e.date,
      String(e.amount),
      `${rate}%`,
      String(taxAmount(e.amount, rate)),
      e.category,
      e.memo,
    ];
  });
  return toCsv([GENERIC_HEADER, ...rows]);
}

// --- yayoi（弥生会計 仕訳インポート形式） ---

// 弥生の「仕訳データ」インポートは 25 列・ヘッダ無しの固定フォーマット。
// 借方=経費科目 / 貸方=相手科目（個人事業主は事業主借）の1行仕訳にする。
//
// ⚠️ 税区分の文字列は弥生のバージョン/設定で表記揺れがあるため、
//    初回インポート時に弥生側の税区分名と一致するか必ず確認すること。
//    合わない場合はこの対応表だけ直せば良い。
const YAYOI_TAX_CLASS_PURCHASE: Record<number, string> = {
  0: "対象外",
  8: "課対仕入8%（軽）",
  10: "課対仕入10%",
};

function yayoiPurchaseTaxClass(taxRate: number): string {
  const known = YAYOI_TAX_CLASS_PURCHASE[taxRate];
  if (known) return known;
  // 想定外の税率（手編集 jsonl 等）でも税区分と税額がズレないよう、
  // 既定値に丸めず実レートを明示する（弥生側で要確認になる）。
  return taxRate > 0 ? `課対仕入${taxRate}%` : "対象外";
}

/**
 * 弥生会計 仕訳インポート形式（25列・ヘッダ無し）。
 * 1経費 = 1仕訳（借方:経費科目 / 貸方:事業主借）。
 */
export function buildYayoiCsv(entries: ExpenseEntry[], options: ExportAdapterOptions = {}): string {
  const credit = options.creditAccount ?? "事業主借";
  const formatDate = options.formatDate ?? isoToSlash;

  const rows = entries.map((e) => {
    const rate = e.taxRate ?? DEFAULT_TAX_RATE;
    const tax = taxAmount(e.amount, rate);
    const summary = e.memo ? `${e.category} ${e.memo}` : e.category;

    const cols = new Array(25).fill("");
    cols[0] = "2000";                       // 識別フラグ（2000=通常仕訳）
    cols[1] = "";                           // 伝票No（空欄=弥生が自動採番）
    cols[2] = "";                           // 決算（空欄=通常）
    cols[3] = formatDate(e.date);           // 取引日付
    cols[4] = e.category;                   // 借方勘定科目
    cols[5] = "";                           // 借方補助科目
    cols[6] = "";                           // 借方部門
    cols[7] = yayoiPurchaseTaxClass(rate);  // 借方税区分
    cols[8] = String(e.amount);             // 借方金額（税込）
    cols[9] = String(tax);                  // 借方税金額（内税）
    cols[10] = credit;                      // 貸方勘定科目（事業主借）
    cols[11] = "";                          // 貸方補助科目
    cols[12] = "";                          // 貸方部門
    cols[13] = "対象外";                    // 貸方税区分
    cols[14] = String(e.amount);            // 貸方金額
    cols[15] = "0";                         // 貸方税金額
    cols[16] = summary;                     // 摘要
    cols[17] = "";                          // 番号
    cols[18] = "";                          // 期日
    cols[19] = "0";                         // タイプ
    cols[20] = "";                          // 生成元
    cols[21] = "";                          // 仕訳メモ
    cols[22] = "0";                         // 付箋1
    cols[23] = "0";                         // 付箋2
    cols[24] = "no";                        // 調整
    return cols;
  });

  return toCsv(rows); // ヘッダ行は付けない（弥生仕様）
}

// --- アダプタ登録 ---

type Adapter = (entries: ExpenseEntry[], options: ExportAdapterOptions) => ExportArtifact;

const ADAPTERS: Partial<Record<ExportFormat, Adapter>> = {
  generic: (entries) => ({
    content: UTF8_BOM + buildGenericCsv(entries),
    fileSuffix: "",
    supported: true,
  }),
  yayoi: (entries, options) => ({
    // 弥生は Shift_JIS 前提のバージョンがある。文字化けする場合は取込時に
    // 文字コードを指定するか、別途エンコード変換を挟む（docs 参照）。BOM は付けない。
    content: buildYayoiCsv(entries, options),
    fileSuffix: "-yayoi",
    supported: true,
  }),
  // freee: ここに取引インポート形式のアダプタを足す（未実装）。
};

/** フォーマット指定トークン（"弥生" "yayoi" 等）を ExportFormat に。 */
export function parseFormatToken(token: string): ExportFormat | undefined {
  const t = token.normalize("NFKC").toLowerCase();
  if (["yayoi", "弥生", "弥生会計", "やよい"].includes(t)) return "yayoi";
  if (["freee", "フリー"].includes(t)) return "freee";
  if (["generic", "汎用", "標準", "csv"].includes(t)) return "generic";
  return undefined;
}

/** 指定フォーマットの出力成果物を作る。未対応なら supported=false を返す。 */
export function buildExport(
  format: ExportFormat,
  entries: ExpenseEntry[],
  options: ExportAdapterOptions = {},
): ExportArtifact {
  const adapter = ADAPTERS[format];
  if (!adapter) {
    return {
      content: "",
      fileSuffix: `-${format}`,
      supported: false,
      message: `${format} 形式はまだ未対応です（アダプタ枠は用意済み）。`,
    };
  }
  return adapter(entries, options);
}
