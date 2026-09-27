// トークン使用量の記録と集計。
//
// なぜ作るか:
//   「減った気がする」ではなく数字で示すため。
//   ChatGPT へ回した分は Claude 側の課金対象から外れるが、ChatGPT 側の枠は消費する。
//   だから「Claude 節約分」と「ChatGPT 消費分」を別々に記録する。片方だけ見せない。
//
// 数字はすべて概算（estimateTokens）。実測値と混ぜないよう、表示側で必ず「概算」と書く。
// 記録先は data/ 配下（.gitignore 済み）。リポジトリに混ぜない。

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Engine } from "./contracts.js";

export interface LedgerEntry {
  /** ISO8601。呼び出し側が渡す（テストを決定的にするため、ここで時刻を取らない）。 */
  readonly at: string;
  readonly engine: Engine;
  readonly task_kind: string;
  /** 送った本文の概算トークン。 */
  readonly sent_tokens_estimate: number;
  /** 受け取った本文の概算トークン。 */
  readonly received_tokens_estimate: number;
  /** answered / dry_run / blocked / failed / claude_local */
  readonly mode: string;
}

export interface LedgerSummary {
  readonly entries: number;
  /** ChatGPT 側で処理した概算トークン（送信＋受信）。 */
  readonly chatgpt_tokens_estimate: number;
  /** Claude 側で処理した概算トークン（送信＋受信）。 */
  readonly claude_tokens_estimate: number;
  /**
   * ChatGPT へ回したことで Claude 側の課金対象から外れた概算トークン。
   * answered のときだけ数える（dry_run や失敗は Claude が結局やるので数えない）。
   */
  readonly claude_avoided_tokens_estimate: number;
  /**
   * 委任に回った文字量の割合（0〜1）。記録が無ければ null（0 と区別する）。
   *
   * これは「削減率」ではない。
   * この記録から分かるのは「どれだけの文字量を ChatGPT 側へ回したか」だけで、
   * Claude 側が実際に何トークン課金されたかは分からない（会話全体の履歴を含むため）。
   * 実際の課金トークンは Claude Code の /cost 等で別に確認する。
   */
  readonly routed_share_to_chatgpt: number | null;
}

export function ledgerPath(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string {
  const base = env.OPENQLOW_DATA_DIR || path.join(cwd, "data");
  return path.join(base, "delegate_ledger.jsonl");
}

/** 1件追記する。1行1件のJSONにして、途中で落ちても既存行を壊さない。 */
export function appendLedger(entry: LedgerEntry, file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
}

/**
 * 読み込む。壊れた行は捨てて、読めた分だけ返す。
 * ファイルが無いのと、空なのは同じ扱い（記録がまだ無い）。
 */
export function readLedger(file: string): readonly LedgerEntry[] {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return Object.freeze([]);
  }
  const out: LedgerEntry[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line) as LedgerEntry;
      if (typeof parsed.engine === "string" && typeof parsed.sent_tokens_estimate === "number") out.push(parsed);
    } catch {
      // 壊れた1行で全体を失わない。
    }
  }
  return Object.freeze(out);
}

export function summarize(entries: readonly LedgerEntry[]): LedgerSummary {
  let chatgpt = 0;
  let claude = 0;
  let avoided = 0;

  for (const entry of entries) {
    const total = entry.sent_tokens_estimate + entry.received_tokens_estimate;
    if (entry.engine === "chatgpt") {
      chatgpt += total;
      if (entry.mode === "answered") avoided += total;
    } else {
      claude += total;
    }
  }

  const routed = claude + avoided;
  return Object.freeze({
    entries: entries.length,
    chatgpt_tokens_estimate: chatgpt,
    claude_tokens_estimate: claude,
    claude_avoided_tokens_estimate: avoided,
    routed_share_to_chatgpt: routed === 0 ? null : avoided / routed,
  });
}

/**
 * 人間向けの報告。
 * 「トークンゼロ」とは書かない。分からないことは「分からない」と書く。
 */
export function formatSummary(summary: LedgerSummary): string {
  if (summary.entries === 0) return "記録なし（まだ1件も委任していません）";
  const share =
    summary.routed_share_to_chatgpt === null
      ? "算出不可"
      : `${Math.round(summary.routed_share_to_chatgpt * 100)}%`;
  return [
    `記録 ${summary.entries} 件（すべて概算）`,
    `ChatGPT 側へ渡した文字量: 約 ${summary.chatgpt_tokens_estimate} トークン（ChatGPT の定額枠を消費）`,
    `うち答えが返った分（Claude の窓に入らずに済んだ分）: 約 ${summary.claude_avoided_tokens_estimate} トークン`,
    `Claude 側で受けた依頼の文字量: 約 ${summary.claude_tokens_estimate} トークン`,
    `委任に回った文字量の割合: ${share}`,
    "注意: これは削減率ではありません。Claude 側の実際の課金トークンはこの記録では測れません（/cost 等で別に確認）。",
  ].join("\n");
}
