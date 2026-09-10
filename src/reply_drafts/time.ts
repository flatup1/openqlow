// 日本時間まわりの小さな道具。
//
// 日付は既存の formatDateInTimeZone を使う（同じ判断を2つ持たない）。
// ここにあるのは「静音時間かどうか」を決めるための時刻取り出しだけ。

import { formatDateInTimeZone } from "../utils/date.js";

export const JST = "Asia/Tokyo";

/** JST での 0〜23 時を返す。 */
export function hourInJst(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JST,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find(part => part.type === "hour")?.value ?? "0";
  // Intl は環境によって深夜を "24" と返すことがある。0 に丸める。
  return Number(hour) % 24;
}

/** JST の日付（YYYY-MM-DD）。 */
export function dateInJst(date: Date): string {
  return formatDateInTimeZone(date, JST);
}

/** JST の「YYYY-MM-DD HH:MM」。通知本文の見出しに使う。 */
export function stampInJst(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const hour = String(Number(values.hour) % 24).padStart(2, "0");
  return `${dateInJst(date)} ${hour}:${values.minute}`;
}

/**
 * 静音時間か（既定 22:00〜翌7:00、要件 §37）。
 * 受信・下書き・保存はこの時間でも行う。止めるのは「JINへの即時通知」だけ。
 */
export function isQuietHours(date: Date, startHour = 22, endHour = 7): boolean {
  const hour = hourInJst(date);
  // 日をまたぐ区間（22時〜翌7時）と、またがない区間の両方を扱う。
  return startHour > endHour ? hour >= startHour || hour < endHour : hour >= startHour && hour < endHour;
}
