#!/usr/bin/env bash
# 自動委任フック（UserPromptSubmit）。
#
# 何をするか:
#   あなたが Claude Code に書いた依頼文を見て、「考える仕事」なら
#   ChatGPT（Codex CLI）へ先に渡し、その答えを Claude への補足として差し込む。
#   だから毎回「これはChatGPTに」と考えなくてよくなる。
#
# 既定では何もしない（安全側）。使うときだけ、端末で次を設定する:
#   export FLATUP_AUTO_DELEGATE=1     # このフックを有効にする
#   export FLATUP_DELEGATE_SEND=1     # 外部送信（ChatGPT へ渡すこと）を許可する
#
# 約束:
#   - 失敗しても依頼を止めない（必ず exit 0）。
#   - 秘密情報・個人情報は送る前に消す。消し切れなければ送らない（ask 側で判定）。
#   - 「手を動かす仕事」は渡さない。Claude Code がそのまま実行する。
set -u

# 有効化されていなければ、何も出さずに終わる。
[[ "${FLATUP_AUTO_DELEGATE:-0}" == "1" ]] || exit 0

ROOT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[[ -n "$ROOT_DIR" && -d "$ROOT_DIR" ]] || exit 0
command -v node >/dev/null 2>&1 || exit 0

INPUT="$(cat)" || exit 0

# フック入力のJSONから依頼文だけを取り出す。
PROMPT="$(printf '%s' "$INPUT" | node -e '
let raw = "";
process.stdin.on("data", d => { raw += d; });
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(raw);
    process.stdout.write(typeof parsed.prompt === "string" ? parsed.prompt : "");
  } catch {
    process.stdout.write("");
  }
});
')" || exit 0

[[ -n "${PROMPT// /}" ]] || exit 0

cd "$ROOT_DIR" || exit 0

# まず判定だけ（外部へは送らない）。
ROUTE="$(printf '%s' "$PROMPT" | npx --no-install tsx src/delegate/route_cli.ts --stdin 2>/dev/null | tail -1)" || exit 0
ENGINE="$(printf '%s' "$ROUTE" | node -e '
let raw = "";
process.stdin.on("data", d => { raw += d; });
process.stdin.on("end", () => {
  try { process.stdout.write(JSON.parse(raw).engine ?? ""); } catch { process.stdout.write(""); }
});
')" || exit 0

# 手を動かす仕事は渡さない。Claude Code がそのまま担当する。
[[ "$ENGINE" == "chatgpt" ]] || exit 0

# 外部送信の許可が無ければ、渡さずに「渡せる依頼だった」ことだけ伝える。
if [[ "${FLATUP_DELEGATE_SEND:-0}" != "1" ]]; then
  echo "［自動委任］この依頼は ChatGPT（考える係）向きと判定しました。実際に渡すには FLATUP_DELEGATE_SEND=1 が必要です。"
  exit 0
fi

ANSWER="$(npx --no-install tsx src/delegate/ask_cli.ts --send --diff "$PROMPT" 2>/dev/null)" || exit 0
[[ -n "${ANSWER// /}" ]] || exit 0

echo "［自動委任］ChatGPT（Codex CLI）に先に相談しました。以下は参考意見です。事実確認と実行は Claude Code 側で行ってください。"
printf '%s\n' "$ANSWER"
exit 0
