// 委任の入口: 1行の依頼を受けて、ChatGPT と Claude のどちらに考えさせるかを決め、実行する。
//
// 使い方:
//   npm run ask -- "この設計をレビューして"          … 判定だけ（既定は送らない）
//   npm run ask -- --send "この設計をレビューして"   … 実際に ChatGPT（Codex CLI）へ渡す
//   npm run ask -- --diff --send "差分をレビューして" … git 差分を添えて渡す
//   npm run ask -- --file src/x.ts --send "ここを説明して"
//   npm run ask -- --summary                        … トークン記録の集計を見る
//
// 既定で送らないのは、外部送信を人間承認の後ろに置く決まりがあるため
// （docs/ai-os/canon/approval_matrix.md）。--send または FLATUP_DELEGATE_SEND=1 で許可する。

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { askChatGpt, bridgeConfigFromEnv } from "./codex_bridge.js";
import { buildContextPack, type FileExcerpt } from "./context_pack.js";
import { classifyDelegation, stripDelegatePrefix } from "./classify.js";
import { parseAskArgs } from "./ask_args.js";
import { appendLedger, formatSummary, ledgerPath, readLedger, summarize } from "./ledger.js";
import { estimateTokens } from "./redact.js";

/** 差分を取る。全文ではなく行数を抑える。取れなければ空文字（失敗にしない）。 */
function collectDiff(cwd: string, maxLines: number): string {
  const result = spawnSync("git", ["diff", "--no-color", "--unified=2"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0 || typeof result.stdout !== "string") return "";
  const lines = result.stdout.split("\n");
  if (lines.length <= maxLines) return result.stdout;
  return [...lines.slice(0, maxLines), `…（以下 ${lines.length - maxLines} 行は省略）`].join("\n");
}

function readExcerpt(file: string): FileExcerpt | null {
  try {
    return { path: file, excerpt: readFileSync(file, "utf8") };
  } catch {
    return null;
  }
}

function main(): void {
  const parsed = parseAskArgs(process.argv.slice(2));
  // 環境変数での許可もここで合わせる（解析側は環境変数を読まない）。
  const options = { ...parsed, send: parsed.send || process.env.FLATUP_DELEGATE_SEND === "1" };
  const cwd = process.cwd();
  const file = ledgerPath(process.env, cwd);

  if (options.summaryOnly) {
    console.log(formatSummary(summarize(readLedger(file))));
    return;
  }

  if (options.question === "") {
    console.log('使い方: npm run ask -- "依頼文"   （--send で実際に ChatGPT へ渡す）');
    process.exitCode = 1;
    return;
  }

  const decision = classifyDelegation(options.question);
  const now = new Date().toISOString();

  console.log(`判定: ${decision.engine === "chatgpt" ? "ChatGPT（考える係）" : "Claude Code（手を動かす係）"}`);
  console.log(`種類: ${decision.task_kind} / 確度: ${decision.confidence.toFixed(2)} / 根拠: ${decision.source}`);
  if (decision.matched.length > 0) console.log(`当たった語: ${decision.matched.join(", ")}`);
  if (decision.requires_human_approval) {
    console.log(`⚠ 人間承認が必要な操作を含みます: ${decision.approval_reasons.join(", ")}`);
    console.log("  下書きや分析は進められますが、実行は承認後です。");
  }

  if (decision.engine === "claude") {
    console.log("\n→ この依頼は Claude Code 側で進めます（ChatGPT へは渡しません）。");
    appendLedger(
      {
        at: now,
        engine: "claude",
        task_kind: decision.task_kind,
        sent_tokens_estimate: estimateTokens(options.question),
        received_tokens_estimate: 0,
        mode: "claude_local",
      },
      file,
    );
    return;
  }

  const pack = buildContextPack(
    {
      question: stripDelegatePrefix(options.question),
      diff: options.withDiff ? collectDiff(cwd, 400) : undefined,
      errors: options.errorsFile === null ? undefined : (readExcerpt(options.errorsFile)?.excerpt ?? undefined),
      files: options.files.map(readExcerpt).filter((x): x is FileExcerpt => x !== null),
    },
    options.budget === undefined ? {} : { budget_tokens: options.budget },
  );

  console.log(`\n渡す範囲: ${pack.included.join(" / ")}`);
  if (pack.truncated.length > 0) console.log(`切り詰めた範囲: ${pack.truncated.join(" / ")}`);
  if (pack.dropped.length > 0) console.log(`予算超過で外した範囲: ${pack.dropped.join(" / ")}`);
  if (pack.redactions.length > 0) {
    console.log(`伏せた情報: ${pack.redactions.map(r => `${r.kind}×${r.count}`).join(", ")}`);
  }
  console.log(`概算トークン（送信分）: 約 ${pack.token_estimate}`);

  const base = bridgeConfigFromEnv(process.env, cwd);
  const config = { ...base, dry_run: base.dry_run || !options.send };
  const outcome = askChatGpt(pack, config);

  console.log(`\n結果: ${outcome.mode}`);
  console.log(outcome.message);
  if (outcome.mode === "dry_run" && !options.send) {
    console.log("実際に渡すには --send を付けてください（外部送信のため既定では止めています）。");
  }
  if (outcome.answer !== null) {
    console.log("\n--- ChatGPT の回答 ---");
    console.log(outcome.answer);
  }

  appendLedger(
    {
      at: now,
      engine: "chatgpt",
      task_kind: decision.task_kind,
      sent_tokens_estimate: outcome.sent_tokens_estimate,
      received_tokens_estimate: outcome.received_tokens_estimate,
      mode: outcome.mode,
    },
    file,
  );
}

main();
