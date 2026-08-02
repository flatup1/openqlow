// レシート1枚を「一行」で入力するためのパーサ
//
// 手間が面倒の正体は、日付欄・金額欄・科目欄を1つずつ埋める作業。
// ここでは思いついた順に打った1行から、日付・金額・支払先・摘要を切り出す。
//
//   "8/3 コメリ 12800 エアコン工事"
//   "今日 ダイソー 1200円 消毒液 現金"
//   "7/15 東京電力 28400 電気代 按分80%"
//   "8/20 ○○電機 132000 業務用エアコン #省エネ T1234567890123 耐用13"
//
// 拾えなかった項目は空のまま返す。埋めるのは normalizeExpenseInput の仕事。

import type { ExpenseInput } from "./expense.js";

export interface ParsedLine {
  input: ExpenseInput;
  /** 解釈できなかった語。CLI で「無視しました」と出して誤入力に気付かせる */
  leftovers: string[];
}

/** JST の YYYY-MM-DD。 */
function jstDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDays(date: Date, delta: number): Date {
  return new Date(date.getTime() + delta * 24 * 60 * 60 * 1000);
}

const RELATIVE_DAYS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(今日|本日|きょう)$/, 0],
  [/^(昨日|きのう)$/, -1],
  [/^(一昨日|おととい)$/, -2],
];

/**
 * 月日だけの指定を「今年」と見なす猶予（日数）。
 * これを超えて未来なら前年のレシートと判断する。1月に「12/28」と打っても
 * 前年に落ちる一方、7月末に「8/3」と打った予定分は今年のまま残る。
 */
const FUTURE_TOLERANCE_DAYS = 45;

/**
 * 1トークンを日付として解釈する。解釈できなければ undefined。
 * 月日だけの指定は、近い未来なら今年・遠い未来なら前年に寄せる。
 */
export function parseDateToken(token: string, now: Date): string | undefined {
  for (const [pattern, delta] of RELATIVE_DAYS) {
    if (pattern.test(token)) return jstDate(shiftDays(now, delta));
  }

  const full = token.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (full) {
    return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`;
  }

  const monthDay = token.match(/^(\d{1,2})[-/.月](\d{1,2})日?$/);
  if (!monthDay) return undefined;

  const month = Number(monthDay[1]);
  const day = Number(monthDay[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  const today = jstDate(now);
  const year = Number(today.slice(0, 4));
  const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const aheadDays = (Date.parse(`${candidate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return aheadDays > FUTURE_TOLERANCE_DAYS ? `${year - 1}${candidate.slice(4)}` : candidate;
}

/** "1,200円" "¥1200" "1200" → 1200。金額として読めなければ undefined。 */
function parseAmountToken(token: string): number | undefined {
  const marked = /[¥￥]|円$/.test(token);
  const digits = token.replace(/[¥￥,，円]/g, "");
  if (!/^\d+$/.test(digits)) return undefined;
  // マーカーの無い1桁は按分率や個数の打ち間違いが多いので金額と見なさない
  if (!marked && digits.length < 2) return undefined;
  return Number(digits);
}

/**
 * 一行入力を ExpenseInput に分解する。
 * @param line 入力行
 * @param now 基準時刻（"今日" の解決とテスト用）
 */
export function parseExpenseLine(line: string, now: Date = new Date()): ParsedLine {
  const normalized = line.normalize("NFKC").replace(/[ \t　]+/g, " ").trim();
  const tokens = normalized ? normalized.split(" ") : [];

  const input: ExpenseInput = {};
  const rest: string[] = [];
  const leftovers: string[] = [];
  const amounts: number[] = [];

  for (const token of tokens) {
    if (!input.date) {
      const date = parseDateToken(token, now);
      if (date) {
        input.date = date;
        continue;
      }
    }

    if (/^#/.test(token) && token.length > 1) {
      input.subsidyTag = token.slice(1);
      continue;
    }

    if (/^T\d{13}$/i.test(token)) {
      input.invoiceNumber = token.toUpperCase();
      continue;
    }

    const ratio = token.match(/^(?:按分)?(\d{1,3})[%％]$/) ?? token.match(/^按分(\d{1,3})$/);
    if (ratio) {
      input.businessRatio = ratio[1];
      continue;
    }

    const life = token.match(/^耐用(?:年数)?(\d{1,2})年?$/);
    if (life) {
      input.assetLife = life[1];
      continue;
    }

    if (/^(現金|クレカ|カード|クレジット|口座振替|引落|paypay|電子マネー)$/i.test(token)) {
      input.paymentMethod = token;
      continue;
    }

    if (/^レシート(なし|無し)$/.test(token) || token === "領収書なし") {
      input.receipt = "なし";
      continue;
    }

    const amount = parseAmountToken(token);
    if (amount !== undefined) {
      amounts.push(amount);
      continue;
    }

    rest.push(token);
  }

  // 金額が複数拾えたら最大値を採用し、残りは「無視した語」として見せる。
  // 「8/3 コメリ 12800 3個」のような入力で個数を金額にしない狙い。
  if (amounts.length > 0) {
    const max = Math.max(...amounts);
    input.amount = max;
    for (const value of amounts) {
      if (value !== max) leftovers.push(String(value));
    }
  }

  if (rest.length > 0) {
    input.vendor = rest[0];
    if (rest.length > 1) input.note = rest.slice(1).join(" ");
  }

  if (!input.date) input.date = jstDate(now);

  return { input, leftovers };
}
