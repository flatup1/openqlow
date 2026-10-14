// ChatGPT 側（Codex CLI）へ質問を渡し、答えを受け取る橋。
//
// 何を使うか:
//   Codex CLI の非対話モード `codex exec "<依頼>"`。
//   最終回答が標準出力へ、途中経過が標準エラーへ出る仕様を利用する。
//   Codex CLI を ChatGPT アカウントでサインインしておけば、API キー課金ではなく
//   ChatGPT 定額枠で動く。だから「Claude 側のトークンを使わずに考えさせる」ができる。
//   ただし ChatGPT 側の利用枠は消費する。ゼロではない。
//
// 安全:
//   - 本文が安全確認を通っていなければ送らない（blocked）。
//   - Codex CLI が無い端末では失敗にせず dry_run として扱う（検査を空回りさせない）。
//   - 読み取り専用サンドボックスで動かす。ChatGPT 側にファイルを書かせない。
//
// 外部プロセスの起動は runner 経由にしている。テストは runner を差し替えて動かす。

import { spawnSync } from "node:child_process";
import { estimateTokens } from "./redact.js";
import type { ContextPack } from "./context_pack.js";

export interface RunnerResult {
  /** 実行ファイルそのものが見つかったか。 */
  readonly available: boolean;
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunnerRequest {
  readonly bin: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeout_ms: number;
}

export type BridgeRunner = (request: RunnerRequest) => RunnerResult;

export type BridgeMode = "answered" | "dry_run" | "blocked" | "failed";

export interface BridgeOutcome {
  readonly mode: BridgeMode;
  /** answered のときだけ本文が入る。 */
  readonly answer: string | null;
  /** 人間向けの説明。日本語。 */
  readonly message: string;
  /** 送った本文の概算トークン。実測値ではない。 */
  readonly sent_tokens_estimate: number;
  /** 受け取った本文の概算トークン。 */
  readonly received_tokens_estimate: number;
  /** 実際に組み立てたコマンド（秘密情報は含めない）。 */
  readonly command: readonly string[];
}

export interface BridgeConfig {
  readonly bin: string;
  readonly base_args: readonly string[];
  readonly cwd: string;
  readonly timeout_ms: number;
  readonly dry_run: boolean;
}

const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * 環境変数から設定を読む。
 *
 * FLATUP_CODEX_BIN        : 実行ファイル名（既定 codex）
 * FLATUP_CODEX_ARGS       : 空白区切りの引数（既定 "exec --sandbox read-only"）
 * FLATUP_DELEGATE_TIMEOUT_MS : 打ち切り時間（既定 180000）
 * FLATUP_DELEGATE_DRY_RUN=1  : 実際には呼ばず、送る本文だけ確認する
 */
export function bridgeConfigFromEnv(env: NodeJS.ProcessEnv, cwd: string): BridgeConfig {
  const rawArgs = env.FLATUP_CODEX_ARGS?.trim();
  const timeout = Number.parseInt(env.FLATUP_DELEGATE_TIMEOUT_MS ?? "", 10);
  return Object.freeze({
    bin: env.FLATUP_CODEX_BIN?.trim() || "codex",
    base_args: Object.freeze(
      rawArgs !== undefined && rawArgs !== "" ? rawArgs.split(/\s+/) : ["exec", "--sandbox", "read-only"],
    ),
    cwd,
    timeout_ms: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
    dry_run: env.FLATUP_DELEGATE_DRY_RUN === "1",
  });
}

/** 既定の実行役。stdin は開かない（パイプ待ちで止まるのを避ける）。 */
export const spawnRunner: BridgeRunner = request => {
  const result = spawnSync(request.bin, [...request.args], {
    cwd: request.cwd,
    timeout: request.timeout_ms,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });
  const notFound = result.error !== undefined && (result.error as NodeJS.ErrnoException).code === "ENOENT";
  return {
    available: !notFound,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

/**
 * ChatGPT（Codex CLI）へ本文を渡して答えを受け取る。
 *
 * 返り値の mode を必ず見る:
 *   answered … 答えが返った
 *   blocked  … 秘密情報が消し切れず送らなかった
 *   dry_run  … Codex CLI が無い、または dry run 指定
 *   failed   … 呼べたが失敗した（理由は message）
 */
export function askChatGpt(
  pack: ContextPack,
  config: BridgeConfig,
  runner: BridgeRunner = spawnRunner,
): BridgeOutcome {
  const sent = pack.token_estimate;
  const command = Object.freeze([config.bin, ...config.base_args, "<依頼本文>"]);

  if (!pack.safe) {
    return Object.freeze({
      mode: "blocked",
      answer: null,
      message: `秘密情報または個人情報が消し切れないので送りませんでした（${pack.unsafe_kinds.join(", ")}）。該当箇所を外して再実行してください。`,
      sent_tokens_estimate: 0,
      received_tokens_estimate: 0,
      command,
    });
  }

  if (config.dry_run) {
    return Object.freeze({
      mode: "dry_run",
      answer: null,
      message: "DRY-RUN 指定のため送っていません。送る本文の中身と概算トークンだけ確認しました。",
      sent_tokens_estimate: sent,
      received_tokens_estimate: 0,
      command,
    });
  }

  const result = runner({
    bin: config.bin,
    args: [...config.base_args, pack.text],
    cwd: config.cwd,
    timeout_ms: config.timeout_ms,
  });

  if (!result.available) {
    return Object.freeze({
      mode: "dry_run",
      answer: null,
      message: `${config.bin} が見つかりません。先に Codex CLI を入れて ChatGPT アカウントでサインインしてください（手順: docs/ai-os/integrations/CODEX_CHATGPT_BRIDGE.md）。`,
      sent_tokens_estimate: sent,
      received_tokens_estimate: 0,
      command,
    });
  }

  const answer = result.stdout.trim();

  if (result.status !== 0) {
    return Object.freeze({
      mode: "failed",
      answer: null,
      message: explainFailure(config.bin, result),
      sent_tokens_estimate: sent,
      received_tokens_estimate: 0,
      command,
    });
  }

  if (answer === "") {
    return Object.freeze({
      mode: "failed",
      answer: null,
      message: `${config.bin} は成功しましたが、答えが空でした。サインイン状態と引数（FLATUP_CODEX_ARGS）を確認してください。`,
      sent_tokens_estimate: sent,
      received_tokens_estimate: 0,
      command,
    });
  }

  return Object.freeze({
    mode: "answered",
    answer,
    message: "ChatGPT（Codex CLI）から答えが返りました。",
    sent_tokens_estimate: sent,
    received_tokens_estimate: estimateTokens(answer),
    command,
  });
}

/** 失敗の理由を日本語で説明する。よくある原因を先に当てる。 */
export function explainFailure(bin: string, result: RunnerResult): string {
  const text = `${result.stderr}\n${result.stdout}`.toLowerCase();
  if (result.status === null) {
    return `${bin} が時間内に終わりませんでした。依頼を短くするか FLATUP_DELEGATE_TIMEOUT_MS を増やしてください。`;
  }
  if (/not logged in|login|unauthor|auth/.test(text)) {
    return `${bin} がサインインしていません。端末で \`${bin} login\` を実行し、ChatGPT アカウントで入り直してください。`;
  }
  if (/rate limit|quota|usage limit|too many requests/.test(text)) {
    return `ChatGPT 側の利用枠に達しました。時間をおくか、依頼を短くしてください（Claude 側で進める判断もできます）。`;
  }
  if (/unexpected argument|unknown option|invalid value/.test(text)) {
    return `${bin} の引数が合っていません。FLATUP_CODEX_ARGS を \`${bin} exec --help\` の表示に合わせてください。`;
  }
  return `${bin} が失敗しました（終了コード ${result.status}）。標準エラーの先頭: ${result.stderr.trim().slice(0, 200) || "(なし)"}`;
}
