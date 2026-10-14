import assert from "node:assert/strict";
import { askChatGpt, bridgeConfigFromEnv, explainFailure, type BridgeRunner, type RunnerRequest } from "./codex_bridge.js";
import { buildContextPack, type ContextPack } from "./context_pack.js";

const pack = buildContextPack({ question: "この設計をレビューして" });

function config(overrides: Partial<ReturnType<typeof bridgeConfigFromEnv>> = {}) {
  return { ...bridgeConfigFromEnv({}, "/work"), ...overrides };
}

function fakeRunner(result: Partial<{ available: boolean; status: number | null; stdout: string; stderr: string }>): {
  runner: BridgeRunner;
  calls: RunnerRequest[];
} {
  const calls: RunnerRequest[] = [];
  const runner: BridgeRunner = request => {
    calls.push(request);
    return {
      available: result.available ?? true,
      status: result.status ?? 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  };
  return { runner, calls };
}

// --- 設定の読み取り ---
{
  const c = bridgeConfigFromEnv({}, "/work");
  assert.equal(c.bin, "codex");
  assert.deepEqual([...c.base_args], ["exec", "--sandbox", "read-only"], "既定は読み取り専用で動かす");
  assert.equal(c.timeout_ms, 180_000);
  assert.equal(c.dry_run, false);
}
{
  const c = bridgeConfigFromEnv(
    { FLATUP_CODEX_BIN: "codex-beta", FLATUP_CODEX_ARGS: "exec --json", FLATUP_DELEGATE_TIMEOUT_MS: "5000", FLATUP_DELEGATE_DRY_RUN: "1" },
    "/work",
  );
  assert.equal(c.bin, "codex-beta");
  assert.deepEqual([...c.base_args], ["exec", "--json"]);
  assert.equal(c.timeout_ms, 5000);
  assert.equal(c.dry_run, true);
}
{
  // 壊れた値は既定へ戻す（0 や負の打ち切り時間で即死しないように）。
  const c = bridgeConfigFromEnv({ FLATUP_DELEGATE_TIMEOUT_MS: "0" }, "/work");
  assert.equal(c.timeout_ms, 180_000);
}

// --- 答えが返る ---
{
  const { runner, calls } = fakeRunner({ stdout: "  結論から書きます。\n1. まず型を直す\n" });
  const outcome = askChatGpt(pack, config(), runner);
  assert.equal(outcome.mode, "answered");
  assert.equal(outcome.answer, "結論から書きます。\n1. まず型を直す");
  assert.ok(outcome.received_tokens_estimate > 0, "受信分も概算する");
  assert.equal(outcome.sent_tokens_estimate, pack.token_estimate);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.bin, "codex");
  assert.deepEqual(calls[0]?.args.slice(0, 3), ["exec", "--sandbox", "read-only"]);
  assert.equal(calls[0]?.args.at(-1), pack.text, "本文を最後の引数として渡す");
  assert.equal(calls[0]?.cwd, "/work");
}

// --- 送らない場合 ---
{
  const { runner, calls } = fakeRunner({ stdout: "答え" });
  const outcome = askChatGpt(pack, config({ dry_run: true }), runner);
  assert.equal(outcome.mode, "dry_run");
  assert.equal(outcome.answer, null);
  assert.equal(calls.length, 0, "DRY-RUN では1回も呼ばない");
  assert.equal(outcome.sent_tokens_estimate, pack.token_estimate, "送る予定の量は分かる");
}
{
  // Codex CLI が入っていない端末では、失敗ではなく dry_run として扱う。
  const { runner } = fakeRunner({ available: false });
  const outcome = askChatGpt(pack, config(), runner);
  assert.equal(outcome.mode, "dry_run");
  assert.ok(outcome.message.includes("codex"), "入れ方を案内する");
}
{
  // 秘密情報が消し切れていない本文は送らない。
  const unsafe: ContextPack = { ...pack, safe: false, unsafe_kinds: ["email"] };
  const { runner, calls } = fakeRunner({ stdout: "答え" });
  const outcome = askChatGpt(unsafe, config(), runner);
  assert.equal(outcome.mode, "blocked");
  assert.equal(calls.length, 0, "1回も呼ばない");
  assert.equal(outcome.sent_tokens_estimate, 0);
  assert.ok(outcome.message.includes("email"));
}

// --- 失敗 ---
{
  const { runner } = fakeRunner({ status: 1, stderr: "not logged in" });
  const outcome = askChatGpt(pack, config(), runner);
  assert.equal(outcome.mode, "failed");
  assert.ok(outcome.message.includes("login"), "サインインを案内する");
}
{
  const { runner } = fakeRunner({ status: 0, stdout: "   " });
  const outcome = askChatGpt(pack, config(), runner);
  assert.equal(outcome.mode, "failed", "成功したのに空なら失敗として扱う");
}

// --- 失敗の説明 ---
assert.ok(explainFailure("codex", { available: true, status: null, stdout: "", stderr: "" }).includes("時間内"));
assert.ok(explainFailure("codex", { available: true, status: 1, stdout: "", stderr: "Rate limit reached" }).includes("利用枠"));
assert.ok(
  explainFailure("codex", { available: true, status: 2, stdout: "", stderr: "error: unexpected argument '--sandbox'" }).includes("FLATUP_CODEX_ARGS"),
);
assert.ok(explainFailure("codex", { available: true, status: 9, stdout: "", stderr: "boom" }).includes("9"));

// --- 秘密情報をコマンド表示に含めない ---
{
  const outcome = askChatGpt(pack, config({ dry_run: true }), fakeRunner({}).runner);
  assert.deepEqual([...outcome.command], ["codex", "exec", "--sandbox", "read-only", "<依頼本文>"]);
}

console.log("delegate codex_bridge tests passed");
