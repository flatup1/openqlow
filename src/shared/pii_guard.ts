// セキュリティ: ソースコードへの個人情報(PII)直書き検知。
//
// 顧客の電話・メール・LINE userId 等がソースや設定に紛れてコミットされるのを止める
// （secret_guard が“鍵”を見るのに対し、こちらは“個人情報”を見る）。
// 実データ・テスト用ダミーは別扱い（テストファイルは走査対象から除外する）。

export interface PiiFinding {
  kind: string;
  sample: string;
}

const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  // 区切り付き日本の電話（誤検知を避けるため区切りを必須にする）
  ["phone", /\b0\d{1,4}[-‐－—][0-9]{1,4}[-‐－—][0-9]{3,4}\b/],
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ["line_user_id", /\bU[0-9a-f]{32}\b/],
];

/** テキストから個人情報らしき文字列を検出する。 */
export function scanPii(text: string): PiiFinding[] {
  const out: PiiFinding[] = [];
  for (const [kind, re] of PATTERNS) {
    const m = re.exec(text.normalize("NFKC"));
    if (m) out.push({ kind, sample: `${m[0].slice(0, 6)}…` });
  }
  return out;
}

/** 個人情報があれば true（＝そのままコミットしてはいけない）。 */
export function hasPii(text: string): boolean {
  return scanPii(text).length > 0;
}
