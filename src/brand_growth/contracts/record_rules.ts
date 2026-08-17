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
import { hasSecret } from "../../shared/secret_guard.js";

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
 * 個人情報をていねいに探す。
 *
 * 素の文字列と、区切り記号を空白へ均した文字列の両方を見る。
 * `ast_090-1234-5678` のように接頭辞へ続けて書かれた連絡先は、
 * 正本の正規表現だけでは単語境界が立たず見逃されるため。
 *
 * ID にも、保存する記録の中身にも、同じ厳しさで当てる。
 * どちらか片方だけ厳しくすると、緩い側から漏れる。
 */
export function scanPiiThorough(text: string): readonly string[] {
  const flattened = text.replace(/[_:.\/|]+/g, " ");
  const kinds = new Set<string>();
  for (const finding of [...scanPii(text), ...scanPii(flattened)]) kinds.add(finding.kind);
  return [...kinds];
}

/**
 * ID として使える文字列か。
 * 空でないこと、そして氏名の代わりに電話番号やメールを入れていないことを見る。
 */
export function assertSafeId(field: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RecordRuleError("missing_id", `${field} must be a non-empty string`);
  }
  const found = scanPiiThorough(value);
  if (found.length > 0) {
    // 検出した中身は出さない。種類だけを伝える。
    throw new RecordRuleError("pii_in_id", `${field} must not contain personal data (${found.join(",")})`);
  }
}

/** 空でない文字列であることだけを確かめる（ID ではない項目用）。 */
export function assertNonEmpty(field: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RecordRuleError("missing_field", `${field} must be a non-empty string`);
  }
}

/**
 * 記録へ入れる自由文の検査。秘密情報と個人情報を拒む。
 * 値そのものは例外メッセージに載せない（種類だけ）。
 */
export function assertCleanText(field: string, text: string): void {
  if (hasSecret(text)) {
    throw new RecordRuleError("secret_in_record", `${field} must not contain credentials`);
  }
  const pii = scanPiiThorough(text);
  if (pii.length > 0) {
    throw new RecordRuleError("pii_in_record", `${field} must not contain personal data (${pii.join(",")})`);
  }
}

/** 文字列の配列をまとめて検査する（ID の並び・タグの並びなど）。 */
export function assertCleanTexts(field: string, values: readonly string[]): void {
  values.forEach((value, index) => assertCleanText(`${field}[${index}]`, value));
}

/** 0 以上の有限な秒数か。負の尺や NaN を弾く。 */
export function assertNonNegativeSeconds(field: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RecordRuleError("invalid_duration", `${field} must be a finite number of 0 or more`);
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
