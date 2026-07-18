#!/usr/bin/env bash
# Claude Code PreToolUse ガード（FLATUP AI OS）
# Bash コマンドを検査し、危険操作を拒否 / 承認要求する。
# 標準入力に Claude Code の PreToolUse JSON を受け取る。
#
# 出力契約:
#   - 拒否: JSON {"hookSpecificOutput":{"permissionDecision":"deny",...}} を stdout、exit 0
#   - 承認要求: permissionDecision "ask"
#   - 許可: 何も出さず exit 0
# jq が無い環境でも壊れないよう、jq が無ければ素通り（fail-open ではなく安全側=何もしない）
# ただし危険操作の検出は grep ベースでも行い、検出したら exit 2 でブロックする。
set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"

# コマンド文字列を取り出す（jq があれば正確に、無ければ雑に）
if command -v jq >/dev/null 2>&1; then
  CMD="$(printf '%s' "${INPUT}" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
else
  CMD="${INPUT}"
fi

[[ -z "${CMD}" ]] && exit 0

emit() { # $1=decision $2=reason
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg d "$1" --arg r "$2" \
      '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
    exit 0
  else
    echo "$2" >&2
    [[ "$1" == "deny" ]] && exit 2 || exit 0
  fi
}

# --- 実行禁止（deny）---
DENY_PATTERNS=(
  'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f'   # rm -rf / -fr
  'rm[[:space:]]+-[a-zA-Z]*f[a-zA-Z]*r'
  'git[[:space:]]+reset[[:space:]]+--hard'
  'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f'
  'git[[:space:]]+push[[:space:]]+.*(--force|-f)([[:space:]]|$)'
  'DROP[[:space:]]+DATABASE'
  'TRUNCATE[[:space:]]+TABLE'
)
for p in "${DENY_PATTERNS[@]}"; do
  if printf '%s' "${CMD}" | grep -Eiq "${p}"; then
    emit deny "FLATUP AI OS: 危険操作を拒否しました（${p}）。approval_matrix.md §3 参照。"
  fi
done

# --- 実行前に人間承認（ask）---
ASK_PATTERNS=(
  'git[[:space:]]+push'
  'git[[:space:]]+commit'
  '(^|[[:space:]])(npm|pnpm|yarn)[[:space:]]+run[[:space:]]+deploy'
  'curl[[:space:]].*-X[[:space:]]*(POST|PUT|DELETE|PATCH)'
)
for p in "${ASK_PATTERNS[@]}"; do
  if printf '%s' "${CMD}" | grep -Eiq "${p}"; then
    emit ask "FLATUP AI OS: この操作は人間承認が必要です（push/commit/deploy/外部送信）。approval_matrix.md §2 参照。"
  fi
done

exit 0
