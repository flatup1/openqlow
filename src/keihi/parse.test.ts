import { parseDateToken, parseExpenseLine } from "./parse.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 基準時刻は JST の 2026-08-05 12:00
const now = new Date("2026-08-05T03:00:00.000Z");

// 日付トークン
assert(parseDateToken("今日", now) === "2026-08-05", "今日");
assert(parseDateToken("昨日", now) === "2026-08-04", "昨日");
assert(parseDateToken("一昨日", now) === "2026-08-03", "一昨日");
assert(parseDateToken("8/3", now) === "2026-08-03", "M/D");
assert(parseDateToken("8月3日", now) === "2026-08-03", "M月D日");
assert(parseDateToken("2025-12-31", now) === "2025-12-31", "YYYY-MM-DD");
assert(parseDateToken("2025/12/31", now) === "2025-12-31", "YYYY/MM/DD");
// 少し先の月日は今年のまま（月末に翌月の予定分を打つケース）
const julyEnd = new Date("2026-07-31T03:00:00.000Z");
assert(parseDateToken("8/3", julyEnd) === "2026-08-03", "3日先は今年のまま");
assert(parseDateToken("9/10", julyEnd) === "2026-09-10", "41日先は今年のまま");
// 遠い未来になる月日は前年のレシートとみなす（年明けの入力対策）
assert(parseDateToken("12/28", now) === "2025-12-28", "145日先は前年");
assert(parseDateToken("1/5", new Date("2026-12-20T03:00:00.000Z")) === "2026-01-05", "年末に打つ1/5は今年の1月");
assert(parseDateToken("13/40", now) === undefined, "ありえない月日は日付でない");
assert(parseDateToken("12800", now) === undefined, "数字だけは日付でない");

// 基本形: 日付 支払先 金額 摘要
const basic = parseExpenseLine("8/3 コメリ 12800 エアコン工事", now);
assert(basic.input.date === "2026-08-03", "日付を抽出");
assert(basic.input.vendor === "コメリ", "支払先を抽出");
assert(basic.input.amount === 12800, "金額を抽出");
assert(basic.input.note === "エアコン工事", "摘要を抽出");

// 円マーク・カンマ・支払方法
const yen = parseExpenseLine("今日 ダイソー 1,200円 消毒液 現金", now);
assert(yen.input.amount === 1200, "カンマ・円つきを数値化");
assert(yen.input.paymentMethod === "現金", "支払方法を抽出");
assert(yen.input.note === "消毒液", "支払方法は摘要に混ざらない");

// 按分・タグ・インボイス・耐用年数
const full = parseExpenseLine("8/20 ○○電機 132000 業務用エアコン #省エネ T1234567890123 耐用13 按分80%", now);
assert(full.input.subsidyTag === "省エネ", "補助金タグを抽出");
assert(full.input.invoiceNumber === "T1234567890123", "インボイス番号を抽出");
assert(full.input.assetLife === "13", "耐用年数を抽出");
assert(full.input.businessRatio === "80", "按分率を抽出");
assert(full.input.amount === 132000, "金額を抽出");
assert(full.input.vendor === "○○電機", "支払先を抽出");
assert(full.input.note === "業務用エアコン", "タグ類は摘要に混ざらない");

// 按分の別表記
assert(parseExpenseLine("東京電力 28400 電気代 按分80", now).input.businessRatio === "80", "按分80（%なし）");
assert(parseExpenseLine("東京電力 28400 電気代 80%", now).input.businessRatio === "80", "80%（按分なし）");

// レシート無し
assert(parseExpenseLine("8/1 自販機 150円 来客用お茶 レシートなし", now).input.receipt === "なし", "レシートなし");

// 金額が複数あれば最大を採用し、残りは読み飛ばしとして返す
const multi = parseExpenseLine("8/3 コーナン 12800 マット 3個", now);
assert(multi.input.amount === 12800, "最大値を金額に採用");
assert(multi.leftovers.length === 0, "1桁の3個は金額と見なさないので読み飛ばしにも出ない");
const twoAmounts = parseExpenseLine("8/3 コーナン 12800 マット 500", now);
assert(twoAmounts.input.amount === 12800, "2つ拾えたら大きい方");
assert(twoAmounts.leftovers.includes("500"), "採用しなかった金額を読み飛ばしに出す");

// 日付を省いたら今日になる
const noDate = parseExpenseLine("セブン 480円 会議用コーヒー", now);
assert(noDate.input.date === "2026-08-05", "日付省略は今日");
assert(noDate.input.vendor === "セブン", "支払先を抽出");

// 全角数字・全角スペースでも読める
const zenkaku = parseExpenseLine("８/３　コメリ　１２８００　エアコン工事", now);
assert(zenkaku.input.date === "2026-08-03", "全角の日付");
assert(zenkaku.input.amount === 12800, "全角の金額");
assert(zenkaku.input.vendor === "コメリ", "全角スペース区切り");

// 空入力でも落ちない
const empty = parseExpenseLine("", now);
assert(empty.input.amount === undefined, "空入力は金額なし");
assert(empty.input.date === "2026-08-05", "空入力でも日付は入る");

console.log("keihi parse tests passed");
