// Brand Growth Phase 4 共通の記録ルール。
//
// 参照: SCHEMA_CATALOG §1「General Rules」。
//
// ここが守ること:
//   - 全 record に schema_version / id / created_at / created_by を持たせる。
//   - timestamp は UTC ISO 8601。表示のときだけ Asia/Tokyo へ直す。
//   - unknown と 0 を区別する（分からない値は null にする。0 で埋めない）。
//   - ID に氏名・LINE user ID・電話番号を入れない。
//
// I/O も時刻取得もしない。時刻は必ず呼び出し側から受け取る（同じ入力なら同じ結果）。

import { scanPii } from "../../shared/pii_guard.js";

/** 記録の作り方が契約に反しているときに投げる。値そのものは載せない。 */
export class RecordRuleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RecordRuleError";
    this.code = code;
  }
}

/**
 * 中身まで凍らせる。作ったあとで書き換えられないようにする。
 *
 * 自分自身を指すような輪になった構造でも止まらないよう、見た物を覚えておく。
 * （輪のある値は保存時に別途はじくが、その前に落ちてはいけない）
 */
export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

// 例: 2026-08-16T04:05:06Z / 2026-08-16T04:05:06.123Z
const UTC_ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;

/** その年その月の日数。うるう年も見る。 */
function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

/**
 * UTC の ISO 8601 か。ローカル時刻や +09:00 表記は受け付けない。
 *
 * 日付の妥当性は自前で数える。時計（Date）に触れないので、
 * いつ・どの時間帯で動かしても同じ答えになる。
 */
export function isUtcIso8601(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const matched = UTC_ISO_8601.exec(value);
  if (matched === null) return false;

  const [, y, mo, d, h, mi, s] = matched;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);

  if (month < 1 || month > 12) return false;
  // 2026-02-31 のような「形は合っているが存在しない日」を弾く。
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return false;
  return true;
}

/** UTC ISO 8601 でなければ止める。 */
export function assertUtcIso8601(field: string, value: unknown): asserts value is string {
  if (!isUtcIso8601(value)) {
    throw new RecordRuleError("invalid_timestamp", `${field} must be a UTC ISO 8601 timestamp ending with Z`);
  }
}

/**
 * ID として使える文字列か。
 * 空でないこと、そして氏名の代わりに電話番号やメールを入れていないことを見る。
 *
 * ID は `req_` や `evt_` のような接頭辞を付ける習慣があるため、
 * 区切り記号を空白へ均してからも調べる。
 * `evt_090-1234-5678` のように、接頭辞に続けて書かれた連絡先を見逃さないため。
 */
export function assertSafeId(field: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RecordRuleError("missing_id", `${field} must be a non-empty string`);
  }
  const separatorsFlattened = value.replace(/[_:.\/|]+/g, " ");
  const found = [...scanPii(value), ...scanPii(separatorsFlattened)];
  if (found.length > 0) {
    // 検出した中身は出さない。種類だけを伝える。
    throw new RecordRuleError("pii_in_id", `${field} must not contain personal data (${found.map(f => f.kind).join(",")})`);
  }
}

/** 空でない文字列であることだけを確かめる（ID ではない項目用）。 */
export function assertNonEmpty(field: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RecordRuleError("missing_field", `${field} must be a non-empty string`);
  }
}

/**
 * 「分からない」を 0 にしないための入口。
 * undefined も null も等しく null（unknown）にする。0 は 0 のまま残す。
 */
export function unknownAsNull(value: number | null | undefined): number | null {
  return value === undefined || value === null ? null : value;
}

/** 0 以上の整数か。件数の検査に使う。 */
export function assertNonNegativeInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RecordRuleError("invalid_count", `${field} must be an integer of 0 or more`);
  }
}
