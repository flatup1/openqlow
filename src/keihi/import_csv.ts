// クレジットカード・銀行明細のCSV取り込み
//
// カード明細を1行ずつ手打ちするのが一番の無駄。ヘッダー名から
// 「日付・利用先・金額」の列を推測して、まとめて経費帳に取り込む。
// カード会社ごとに列名が違うので、候補を並べて総当たりで当てる。
//
// 家事按分・勘定科目は取り込み時に推定される（あとで keihi fix で直せる）。

import { classifyAccount, type ExpenseInput } from "./expense.js";

const DATE_HEADERS = ["利用日", "ご利用日", "日付", "取引日", "date", "ご利用年月日", "計上日"];
const VENDOR_HEADERS = ["利用店名", "ご利用先", "利用先", "店名", "摘要", "内容", "お取引内容", "vendor", "description"];
const AMOUNT_HEADERS = ["利用金額", "ご利用金額", "金額", "支払金額", "出金金額", "お支払金額", "amount", "お引出し"];

export interface CsvImportResult {
  rows: ExpenseInput[];
  /** 取り込めなかった行の理由。件数だけでなく中身を見せて修正できるようにする */
  skipped: Array<{ line: number; reason: string }>;
  /** どの列を使ったか（誤検出に気付けるように返す） */
  columns: { date: string; vendor: string; amount: string };
}

/** 引用符つきCSVの1行をセル配列に分解する。 */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map(cell => cell.trim());
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map(h => h.normalize("NFKC").replace(/\s/g, "").toLowerCase());
  for (const candidate of candidates) {
    const key = candidate.normalize("NFKC").toLowerCase();
    const exact = normalized.indexOf(key);
    if (exact >= 0) return exact;
  }
  // 完全一致で見つからなければ部分一致で再挑戦
  for (const candidate of candidates) {
    const key = candidate.normalize("NFKC").toLowerCase();
    const partial = normalized.findIndex(h => h.includes(key));
    if (partial >= 0) return partial;
  }
  return -1;
}

/** "2026/8/3" "2026-08-03" "20260803" → "2026-08-03"。読めなければ undefined。 */
function normalizeCsvDate(value: string): string | undefined {
  const text = value.normalize("NFKC").trim();
  const slashed = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (slashed) {
    return `${slashed[1]}-${slashed[2].padStart(2, "0")}-${slashed[3].padStart(2, "0")}`;
  }
  const packed = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (packed) return `${packed[1]}-${packed[2]}-${packed[3]}`;
  return undefined;
}

/** "1,200" "¥1,200" "-1200" → 1200。0や読めない値は undefined（入金行を弾く）。 */
function normalizeCsvAmount(value: string): number | undefined {
  const digits = value.normalize("NFKC").replace(/[,，¥￥円\s]/g, "");
  if (!/^-?\d+$/.test(digits)) return undefined;
  // 出金がマイナス表記の明細もあるため絶対値を取る
  const amount = Math.abs(Number(digits));
  return amount > 0 ? amount : undefined;
}

/**
 * CSVテキストを ExpenseInput の配列に変換する。
 * @param text CSV全文（1行目がヘッダー）
 * @param paymentMethod この明細の支払方法（クレジット/口座振替など）
 */
export function importExpenseCsv(text: string, paymentMethod = "クレジット"): CsvImportResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines.length === 0) {
    return { rows: [], skipped: [], columns: { date: "", vendor: "", amount: "" } };
  }

  const headers = parseCsvLine(lines[0]);
  const dateIndex = findColumn(headers, DATE_HEADERS);
  const vendorIndex = findColumn(headers, VENDOR_HEADERS);
  const amountIndex = findColumn(headers, AMOUNT_HEADERS);

  const columns = {
    date: headers[dateIndex] ?? "(見つからず)",
    vendor: headers[vendorIndex] ?? "(見つからず)",
    amount: headers[amountIndex] ?? "(見つからず)",
  };

  if (dateIndex < 0 || amountIndex < 0) {
    return {
      rows: [],
      skipped: [{ line: 1, reason: `日付列または金額列が見つかりません（ヘッダー: ${headers.join(" / ")}）` }],
      columns,
    };
  }

  const rows: ExpenseInput[] = [];
  const skipped: CsvImportResult["skipped"] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const date = normalizeCsvDate(cells[dateIndex] ?? "");
    const amount = normalizeCsvAmount(cells[amountIndex] ?? "");
    const vendor = (vendorIndex >= 0 ? cells[vendorIndex] : "") ?? "";

    if (!date) {
      skipped.push({ line: i + 1, reason: `日付が読めません: "${cells[dateIndex] ?? ""}"` });
      continue;
    }
    if (amount === undefined) {
      skipped.push({ line: i + 1, reason: `金額が読めません（入金行の可能性）: "${cells[amountIndex] ?? ""}"` });
      continue;
    }

    rows.push({
      date,
      vendor: vendor || "(明細に店名なし)",
      amount,
      account: classifyAccount(vendor),
      note: vendor,
      paymentMethod,
      receipt: "電子",
    });
  }

  return { rows, skipped, columns };
}
