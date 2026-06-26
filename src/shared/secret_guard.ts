// セキュリティ: 秘密情報（APIキー・トークン・秘密鍵）の混入ガード。
//
// 公開リポジトリやコミットに「本物の鍵」が紛れ込むのを自動検知する（SDL: 秘密の流出防止）。
// 純粋関数 scanText を CI/テストから repo 全体に当て、ヒット0を保証する。
// 個人情報(電話/メール)は別途 src/safety/check.ts・src/loop/ingest.ts が扱う（ここは“鍵”に集中）。

export interface SecretFinding {
  kind: string;
  /** 先頭だけの安全なサンプル（全体は出さない） */
  sample: string;
}

const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ["openai_or_openrouter_key", /\bsk-(?:or-)?[A-Za-z0-9_-]{20,}\b/],
  ["google_api_key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/],
  ["github_token", /\bgh[pousr]_[0-9A-Za-z]{30,}\b/],
  ["slack_token", /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/],
  ["bearer_jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
];

/** 1つのテキストから“本物の鍵らしき”文字列を検出する。 */
export function scanText(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const [kind, re] of PATTERNS) {
    const m = re.exec(text);
    if (m) findings.push({ kind, sample: `${m[0].slice(0, 10)}…` });
  }
  return findings;
}

/** 検出があれば true（＝コミットしてはいけない）。 */
export function hasSecret(text: string): boolean {
  return scanText(text).length > 0;
}
