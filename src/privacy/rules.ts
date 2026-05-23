// FLATUP GYM 個人情報保護ルール
// Phase 2 記憶係コマンド群が CRM ログを生成する際に必ず通すフィルタ。
// 違反は例外で停止させる（テスト範囲で振る舞いを固定する）。

const FORBIDDEN_PATTERN_LABELS: Array<{ label: string; regex: RegExp }> = [
  { label: "phone_japanese", regex: /(?:\+?81|0)\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/ },
  { label: "email", regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { label: "line_id", regex: /(?:^|\s)@[A-Za-z0-9_.-]{3,}/ },
  { label: "postal_code", regex: /〒?\d{3}-?\d{4}/ },
  { label: "credit_card", regex: /(?:\d[ -]?){13,16}/ },
];

export class PrivacyViolationError extends Error {
  constructor(public readonly label: string, message: string) {
    super(message);
    this.name = "PrivacyViolationError";
  }
}

export interface PrivacyOptions {
  /** Convert "山田太郎" -> "山田 T."  Default true. */
  initialiseGivenName?: boolean;
  /** Convert numeric ages to age band like "30代". Default true. */
  bandifyAge?: boolean;
}

const DEFAULT_OPTIONS: Required<PrivacyOptions> = {
  initialiseGivenName: true,
  bandifyAge: true,
};

const KATAKANA_RANGE = /[ァ-ヺーー]/u;
const HIRAGANA_RANGE = /[ぁ-ゖ]/u;
const KANJI_RANGE = /[㐀-鿿]/u;
const LATIN_RANGE = /[A-Za-z]/u;

function isJapaneseFamilyOnly(name: string): boolean {
  // Heuristic: 1〜2 文字の日本語姓は分割せず保持
  if (name.length <= 2 && (KANJI_RANGE.test(name) || HIRAGANA_RANGE.test(name) || KATAKANA_RANGE.test(name))) {
    return true;
  }
  return false;
}

function pickInitial(givenSegment: string): string {
  // 漢字 / ひらがな / カタカナ / 英字、いずれの場合も先頭 1 文字をローマ字風に大文字化する。
  // 厳密なローマ字変換は持たず、英字以外は「?」を返す。Jin が手入力時に整形した想定。
  const first = givenSegment[0] ?? "";
  if (LATIN_RANGE.test(first)) return first.toUpperCase();
  // 漢字/かな は伏字 (★) を返し、過剰な特定を避ける
  return "★";
}

export function formatName(rawName: string, options: PrivacyOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const trimmed = rawName.trim();
  if (!trimmed) return "";

  if (!opts.initialiseGivenName) {
    return trimmed;
  }

  // 既に「姓 + イニシャル」形式の入力（例: 山田 T. / Yamada T.）はそのまま受け入れる
  if (/^.{1,4}\s+[A-Za-z]\.?$/u.test(trimmed)) {
    return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
  }

  // 空白で分割：姓+名（例: "山田 太郎"）
  const parts = trimmed.split(/\s+/u);
  if (parts.length >= 2) {
    const family = parts[0];
    const given = parts.slice(1).join("");
    return `${family} ${pickInitial(given)}.`;
  }

  // 空白なし：日本語姓だけ（例: "山田"）→ そのまま
  if (isJapaneseFamilyOnly(trimmed)) {
    return trimmed;
  }

  // 漢字 3 文字以上の連結（例: "山田太郎"）→ 姓 2 文字 + イニシャルに分割
  if (KANJI_RANGE.test(trimmed) && trimmed.length >= 3) {
    const family = trimmed.slice(0, 2);
    const given = trimmed.slice(2);
    return `${family} ${pickInitial(given)}.`;
  }

  // 英字フルネーム連結（例: "Yamada"）→ そのまま
  return trimmed;
}

const AGE_BAND_RULES: Array<{ test: (age: number) => boolean; label: string }> = [
  { test: age => age < 10, label: "幼児" },
  { test: age => age < 20, label: "10代" },
  { test: age => age < 30, label: "20代" },
  { test: age => age < 40, label: "30代" },
  { test: age => age < 50, label: "40代" },
  { test: age => age < 60, label: "50代" },
  { test: age => age < 70, label: "60代" },
  { test: age => age >= 70, label: "70代以上" },
];

export function formatAge(input: string | number, options: PrivacyOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!opts.bandifyAge) return String(input);

  if (typeof input === "number") {
    const band = AGE_BAND_RULES.find(rule => rule.test(input));
    return band ? band.label : String(input);
  }

  const trimmed = input.trim();
  if (!trimmed) return "";

  // "30代" / "30代後半" などは既に band 形式
  if (/^\d{1,2}代/.test(trimmed)) return trimmed;

  // "30 歳" / "30歳" / "30"
  const numeric = trimmed.match(/^(\d{1,3})/);
  if (numeric) {
    const age = Number(numeric[1]);
    return formatAge(age, options);
  }

  // 「不明」「子ども」など定性表現はそのまま
  return trimmed;
}

export function detectForbiddenContent(text: string): { ok: true } | { ok: false; label: string; sample: string } {
  for (const { label, regex } of FORBIDDEN_PATTERN_LABELS) {
    const match = text.match(regex);
    if (match) {
      return { ok: false, label, sample: match[0] };
    }
  }
  return { ok: true };
}

export function assertNoForbiddenContent(text: string, context: string): void {
  const result = detectForbiddenContent(text);
  if (!result.ok) {
    throw new PrivacyViolationError(
      result.label,
      `${context}: forbidden ${result.label} detected (sample: "${result.sample.slice(0, 20)}…")`,
    );
  }
}

export function sanitiseFreeText(text: string): string {
  // フリーテキスト中の連絡先を伏字 (████) に置換。
  let out = text;
  for (const { regex } of FORBIDDEN_PATTERN_LABELS) {
    out = out.replace(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g"), "████");
  }
  return out;
}

export function anonymiseFamilyName(formatted: string): string {
  // 退会者の自動匿名化用：「山田 T.」 → 「███ T.」
  const match = formatted.match(/^(\S+)\s+([A-Za-z★])\.?$/u);
  if (match) return `███ ${match[2]}.`;
  return "███";
}
