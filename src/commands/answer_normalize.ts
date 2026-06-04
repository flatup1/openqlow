// 「なし」相当の入力ゆれを正規化する純粋関数。
// LINE スマホ入力で起きやすい:
//   - フリック入力ミス（なひ / なl / なs）
//   - 漢字（無 / 無し）
//   - カタカナ（ナシ / ナイ）
//   - 記号で済ます（- / — / ー）
//   - 英字（n / no / N/A）
// これらを全部 "なし" に正規化することで、Obsidian にも ToDo にも
// 統一表記で残る → 「なし」フィルタが効きやすい。

const EMPTY_ANSWER_VARIANTS = new Set<string>([
  // 基本
  "なし", "ナシ", "無し", "無", "ない", "ナイ",
  // フリック入力ミス系（"な" の次に押し間違える）
  "なひ", "なl", "なs", "なｓ",
  // 英字
  "n", "N", "no", "No", "NO", "none", "None", "NONE", "N/A", "n/a",
  // 記号 / 略字
  "-", "—", "ー", "－", "ﾅｼ",
  // よくある言い回し
  "特になし", "とくになし", "特に無し",
]);

/**
 * 入力値を「なし相当か実値か」で判定し、なし相当なら "なし" を返す。
 * 空文字はそのまま空文字を返す（呼び出し側で扱いを決める）。
 */
export function normalizeEmptyAnswer(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  // 完全一致でゆれを吸収
  if (EMPTY_ANSWER_VARIANTS.has(trimmed)) return "なし";
  // 小文字化での比較も試す（"No" / "NO" 等）
  if (EMPTY_ANSWER_VARIANTS.has(trimmed.toLowerCase())) return "なし";
  return trimmed;
}

/**
 * テスト用にバリアント一覧を公開。
 * 本体で内部使用するため Set のままだが、テストでは Array で扱えると便利。
 */
export const __answerNormalizeInternals = {
  EMPTY_ANSWER_VARIANTS,
};
