import {
  findDateWeekdayMismatches,
  fixDateWeekdays,
  formatDateWithWeekday,
  jstDate,
  resolveYear,
  weekdayJa,
} from "./date_guard.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 曜日の基本 ---------------------------------------------------------------
assert(weekdayJa(jstDate(2026, 8, 6)) === "木", "2026-08-06 は木曜日");
assert(weekdayJa(jstDate(2026, 8, 8)) === "土", "2026-08-08 は土曜日");
assert(weekdayJa(jstDate(2026, 8, 9)) === "日", "2026-08-09 は日曜日");
assert(formatDateWithWeekday(2026, 8, 8) === "8月8日（土曜日）", "表記の組み立て");

// --- 実際に起きた事故の再現（2026-08-06） -------------------------------------
// お客様「8/8の10:45頃に改めます！」に対し、AIKAが
// 「8月8日（木曜日）10:45頃のご来館ですね」と返した。
// 木曜日は返信した当日（8/6）の曜日で、8月8日は土曜日だった。
const accidentDay = jstDate(2026, 8, 6);
const badReply = "かしこまりました😊8月8日（木曜日）10:45頃のご来館ですね。お待ちしております。";
const found = findDateWeekdayMismatches(badReply, accidentDay);
assert(found.length === 1, `食い違いを1件検出すること（実測 ${found.length}）`);
assert(found[0].statedWeekday === "木", "書かれていた曜日は木");
assert(found[0].actualWeekday === "土", "実際の曜日は土");
assert(found[0].correction === "8月8日（土曜日）", "正しい表記を提示する");

const fixed = fixDateWeekdays(badReply, accidentDay);
assert(fixed.includes("8月8日（土曜日）"), "自動修正で土曜日になる");
assert(!fixed.includes("木曜日"), "誤った曜日が残らない");
assert(fixed.includes("10:45頃のご来館"), "他の部分は壊さない");

// --- 正しい文は素通りさせる ---------------------------------------------------
assert(
  findDateWeekdayMismatches("8月8日（土曜日）10:45頃のご来館ですね。", accidentDay).length === 0,
  "正しい曜日なら指摘しない",
);
assert(
  findDateWeekdayMismatches("明日のご来館をお待ちしております。", accidentDay).length === 0,
  "日付表記が無ければ指摘しない",
);
assert(
  fixDateWeekdays("8月8日（土曜日）でお待ちしています。", accidentDay) ===
    "8月8日（土曜日）でお待ちしています。",
  "問題なければ元の文をそのまま返す",
);

// --- 表記ゆれ -----------------------------------------------------------------
assert(
  findDateWeekdayMismatches("8月8日(木)にお待ちしております。", accidentDay).length === 1,
  "半角括弧・曜日1文字でも検出する",
);
assert(
  findDateWeekdayMismatches("8月8日 （ 木 曜日 ）", accidentDay).length === 1,
  "空白が入っていても検出する",
);

// --- 年の解決 -----------------------------------------------------------------
assert(resolveYear(8, 8, jstDate(2026, 8, 6)) === 2026, "近い未来は同じ年");
assert(resolveYear(1, 5, jstDate(2026, 12, 28)) === 2027, "年末に1月と言われたら翌年");
assert(resolveYear(12, 28, jstDate(2026, 12, 30)) === 2026, "数日前なら同じ年のまま");
// 年をまたぐ判定が効いていることを、曜日の検証としても確認する
assert(
  findDateWeekdayMismatches("1月5日（火曜日）はいかがでしょう。", jstDate(2026, 12, 28)).length === 0,
  "2027-01-05 は火曜日なので指摘しない",
);

// --- 実在しない日付は判定しない -----------------------------------------------
assert(
  findDateWeekdayMismatches("2月30日（月曜日）", accidentDay).length === 0,
  "実在しない日付は曜日を判定しない",
);

// --- タイムゾーンに依存しない -------------------------------------------------
// JST深夜0時はUTCでは前日15時。ローカル時刻に頼ると曜日が1日ずれる。
const jstMidnight = new Date("2026-08-08T00:00:00+09:00");
assert(weekdayJa(jstMidnight) === "土", "JST深夜0時でも土曜日と判定する");
const jstLateNight = new Date("2026-08-08T08:59:00+09:00");
assert(weekdayJa(jstLateNight) === "土", "JST早朝でも土曜日のまま");

console.log("port/aika date_guard tests passed");
