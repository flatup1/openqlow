// npm run ask の引数解析。CLI 本体から切り離してテストしやすくする。
//
// このファイルは文字列処理だけを行う。I/O、ネットワーク、時刻、乱数を使わない。
// 環境変数も読まない（読むのは CLI 側）。

export interface AskOptions {
  readonly question: string;
  /** 実際に外部へ送るか。既定 false（外部送信は人間承認の後ろに置く）。 */
  readonly send: boolean;
  readonly withDiff: boolean;
  readonly files: readonly string[];
  readonly errorsFile: string | null;
  /** 未指定なら undefined（既定値は context_pack 側が持つ）。 */
  readonly budget: number | undefined;
  readonly summaryOnly: boolean;
}

export function parseAskArgs(argv: readonly string[]): AskOptions {
  const files: string[] = [];
  const words: string[] = [];
  let send = false;
  let withDiff = false;
  let errorsFile: string | null = null;
  let budget: number | undefined;
  let summaryOnly = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--send") { send = true; continue; }
    if (arg === "--diff") { withDiff = true; continue; }
    if (arg === "--summary") { summaryOnly = true; continue; }
    if (arg === "--file") {
      const next = argv[i + 1];
      if (next !== undefined) { files.push(next); i += 1; }
      continue;
    }
    if (arg === "--errors-file") {
      const next = argv[i + 1];
      if (next !== undefined) { errorsFile = next; i += 1; }
      continue;
    }
    if (arg === "--budget") {
      // 値が壊れていても、その1語は依頼文に混ぜない（「--budget ゼロ」を質問にしない）。
      const raw = argv[i + 1];
      if (raw !== undefined) i += 1;
      const next = Number.parseInt(raw ?? "", 10);
      if (Number.isFinite(next) && next > 0) budget = next;
      continue;
    }
    words.push(arg);
  }

  return Object.freeze({
    question: words.join(" ").trim(),
    send,
    withDiff,
    files: Object.freeze(files),
    errorsFile,
    budget,
    summaryOnly,
  });
}
