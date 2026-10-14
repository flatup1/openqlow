// 委任の本文づくり: 必要最小限だけを詰める。
//
// なぜ作るか:
//   トークンが増える最大の原因は「毎回リポジトリ全体を渡すこと」。
//   だから渡すのは「質問・エラー・差分・該当ファイルの一部」だけにする。
//   固定の指示文は毎回同じ文面にする（同じ前置きはキャッシュが効きやすい）。
//
// 優先度は上から順に: 質問 → エラー → 差分 → ファイル抜粋 → 補足。
// 予算を超えたら、その位置から下を丸ごと削る（優先度の低い小さな断片が割り込まない）。
// 質問は絶対に削らない。
// このファイルは文字列処理だけを行う。I/O、ネットワーク、時刻、乱数を使わない。

import { estimateTokens, redactSensitive, verifySafeToSend, type Redaction } from "./redact.js";

/** 委任先（ChatGPT）に渡す固定の前置き。毎回同じ文にする。 */
export const DELEGATE_SYSTEM_BRIEF = [
  "あなたは計画・レビュー・説明の担当です。コードの実行やファイル変更はしません。",
  "実行はこちら（Claude Code）が行います。だから「何をどう変えるか」を短く具体的に書いてください。",
  "出力は日本語。結論ファースト。中学生にも分かる言葉。箇条書き中心。",
  "渡された範囲だけで答えてください。足りない情報は「不足: ○○」と書いてください。推測で事実を作らないでください。",
  "料金・時間・クラス等の事実値は勝手に決めないでください（正本は別にあります）。",
].join("\n");

export interface FileExcerpt {
  readonly path: string;
  readonly excerpt: string;
}

export interface ContextPackInput {
  readonly question: string;
  /** 失敗したコマンドの出力など。 */
  readonly errors?: string;
  /** git diff の出力。全文ではなく必要な範囲を渡す。 */
  readonly diff?: string;
  readonly files?: readonly FileExcerpt[];
  readonly notes?: readonly string[];
}

export interface ContextPackOptions {
  /** 概算トークンの上限。既定 2000。 */
  readonly budget_tokens?: number;
  /** ファイル抜粋1件あたりの最大行数。既定 80 行。 */
  readonly max_file_lines?: number;
}

export interface ContextPack {
  readonly text: string;
  /** 概算。実測値ではない。 */
  readonly token_estimate: number;
  readonly included: readonly string[];
  readonly dropped: readonly string[];
  readonly truncated: readonly string[];
  readonly redactions: readonly Redaction[];
  /** false のときは送ってはいけない。 */
  readonly safe: boolean;
  readonly unsafe_kinds: readonly string[];
}

const DEFAULT_BUDGET_TOKENS = 2000;
const DEFAULT_MAX_FILE_LINES = 80;
/** これ以下しか入らないなら、切って入れるより丸ごと落とす方が読みやすい。 */
const MIN_USEFUL_TOKENS = 80;

/** 予算に収まるまで行単位で切る。切ったことが分かる印を残す。 */
export function truncateToTokens(body: string, limit: number): { text: string; truncated: boolean } {
  if (estimateTokens(body) <= limit) return { text: body, truncated: false };
  const lines = body.split("\n");
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = estimateTokens(`${line}\n`);
    if (used + cost > limit) break;
    kept.push(line);
    used += cost;
  }
  const omitted = lines.length - kept.length;
  kept.push(`…（以下 ${omitted} 行は省略。必要なら範囲を指定して再依頼）`);
  return { text: kept.join("\n"), truncated: true };
}

function limitLines(body: string, maxLines: number): string {
  const lines = body.split("\n");
  if (lines.length <= maxLines) return body;
  return [...lines.slice(0, maxLines), `…（以下 ${lines.length - maxLines} 行は省略）`].join("\n");
}

/**
 * 委任本文を組み立てる。
 *
 * 返り値の safe が false のときは送信しない。呼び出し側で必ず確認する。
 */
export function buildContextPack(input: ContextPackInput, options: ContextPackOptions = {}): ContextPack {
  const budget = options.budget_tokens ?? DEFAULT_BUDGET_TOKENS;
  const maxFileLines = options.max_file_lines ?? DEFAULT_MAX_FILE_LINES;

  const optional: { label: string; body: string }[] = [];
  if (input.errors !== undefined && input.errors.trim() !== "") {
    optional.push({ label: "エラー", body: input.errors.trim() });
  }
  if (input.diff !== undefined && input.diff.trim() !== "") {
    optional.push({ label: "差分", body: input.diff.trim() });
  }
  for (const file of input.files ?? []) {
    if (file.excerpt.trim() === "") continue;
    optional.push({ label: `ファイル ${file.path}`, body: limitLines(file.excerpt.trim(), maxFileLines) });
  }
  const notes = (input.notes ?? []).filter(note => note.trim() !== "");
  if (notes.length > 0) {
    optional.push({ label: "補足", body: notes.map(note => `- ${note.trim()}`).join("\n") });
  }

  const head = `${DELEGATE_SYSTEM_BRIEF}\n\n## 依頼\n${input.question.trim()}`;
  const parts: string[] = [head];
  const included: string[] = ["依頼"];
  const dropped: string[] = [];
  const truncated: string[] = [];
  let used = estimateTokens(head);

  for (let i = 0; i < optional.length; i += 1) {
    const section = optional[i];
    if (section === undefined) continue;
    const rendered = `\n\n## ${section.label}\n${section.body}`;
    const cost = estimateTokens(rendered);
    const remaining = budget - used;
    if (cost <= remaining) {
      parts.push(rendered);
      included.push(section.label);
      used += cost;
      continue;
    }
    const headerCost = estimateTokens(`\n\n## ${section.label}\n`);
    if (remaining - headerCost >= MIN_USEFUL_TOKENS) {
      const cut = truncateToTokens(section.body, remaining - headerCost);
      const piece = `\n\n## ${section.label}\n${cut.text}`;
      parts.push(piece);
      included.push(section.label);
      if (cut.truncated) truncated.push(section.label);
      used += estimateTokens(piece);
      continue;
    }
    // ここで入らなかったら、後ろ（優先度の低い方）も入れない。
    // 小さい補足だけが先に入って、大事な差分が落ちる、という分かりにくい結果を防ぐ。
    for (const rest of optional.slice(i)) dropped.push(rest.label);
    break;
  }

  const raw = parts.join("");
  const redacted = redactSensitive(raw);
  const verdict = verifySafeToSend(redacted.text);

  return Object.freeze({
    text: redacted.text,
    token_estimate: estimateTokens(redacted.text),
    included: Object.freeze(included),
    dropped: Object.freeze(dropped),
    truncated: Object.freeze(truncated),
    redactions: redacted.redactions,
    safe: verdict.safe,
    unsafe_kinds: verdict.remaining,
  });
}
