// 自己改善ループ ①取り込み（Ingest）。
//
// 生ログ（LINE履歴・日報・問い合わせ）を第二の脳 knowledge/sources/ 用の Markdown に整える。
// **個人情報(PII)は必ずマスク**してから保存する（電話/メール/LINE userId/ペアリングコード）。
// 純粋関数として実装し、ファイル書き込みは呼び出し側に任せる（テスト可能性のため）。

export interface IngestInput {
  /** 生ログ本文 */
  raw: string;
  /** 原本タイトル */
  title: string;
  /** 取り込み日 YYYY-MM-DD */
  date: string;
  /** 種別: line / daily_log / inquiry / note など */
  kind?: string;
  tags?: string[];
}

// 半角/全角の電話番号
const PHONE_PATTERN =
  /[0０][0-9０-９]{1,4}[-‐－—ー\s]?[0-9０-９]{1,4}[-‐－—ー\s]?[0-9０-９]{3,4}/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LINE_USER_ID_PATTERN = /U[0-9a-f]{32}/g;
const HONORIFIC_NAME_PATTERN = /[一-龥々ぁ-んァ-ヶA-Za-z][一-龥々ぁ-んァ-ヶA-Za-z\s]{0,18}(?:様|さん|くん|ちゃん)/g;
// ペアリングコード（例:「Pairing code: M3VDEDUX」「pairing approve line M3VDEDUX」）
const PAIRING_PATTERN = /([Pp]airing\s*(?:code|approve)[^A-Z0-9]*)[A-Z0-9]{6,12}/g;

/** 個人情報・機密をプレースホルダに置換する。 */
export function redactPii(text: string): string {
  return text
    .replace(LINE_USER_ID_PATTERN, "[LINE_ID]")
    .replace(EMAIL_PATTERN, "[メール]")
    .replace(PAIRING_PATTERN, "$1[PAIRING_CODE]")
    .replace(HONORIFIC_NAME_PATTERN, "[名前]")
    .replace(PHONE_PATTERN, "[電話番号]");
}

/** 文字列をファイル名用スラッグに（英数とハイフンのみ・日本語は除去）。 */
export function slugify(title: string): string {
  const s = title
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return s || "source";
}

/** ファイル名 `<YYYYMMDD>-<slug>.md` を返す。 */
export function sourceFileName(date: string, title: string): string {
  return `${date.replace(/-/g, "")}-${slugify(title)}.md`;
}

/** sources/ 用の Markdown（frontmatter + PII除去済み本文）を組み立てる。 */
export function ingestToMarkdown(input: IngestInput): string {
  const tags = (input.tags ?? []).join(", ");
  const body = redactPii(input.raw).trim();
  const title = redactPii(input.title).replace(/"/g, "'");
  return [
    "---",
    "type: source",
    `title: "${title}"`,
    `captured: ${input.date}`,
    `kind: ${input.kind ?? "note"}`,
    `tags: [${tags}]`,
    "privacy: redacted",
    "---",
    "",
    `# ${title}`,
    "",
    "> 自己改善ループにより取り込み（PIIマスク済み）。",
    "",
    body,
    "",
  ].join("\n");
}
