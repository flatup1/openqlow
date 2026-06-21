#!/usr/bin/env bash
# OPENQLOW スケジューラ監査スクリプト
#
# 「claude / openqlow が、いつ・どこから・どの認証で定期実行されているか」を
# 1コマンドで棚卸しする。Mac・VPS・リポジトリのどこで実行してもよい。
# 鍵の値は表示しない（参照しているファイル名のみ）。
#
#   bash scripts/audit-scheduler.sh
#
# 環境変数 REPO でリポジトリパスを上書き可能（既定は git ルートを自動検出）。

set -uo pipefail

# --- リポジトリルート自動検出 -------------------------------------------------
if [[ -n "${REPO:-}" ]]; then
  :
elif REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  REPO="$(cd "$(dirname "$0")/.." && pwd)"
fi

NO_NM='--glob=!node_modules' # ripgrep があれば使う
have() { command -v "$1" >/dev/null 2>&1; }
SELF="$(basename "$0")"
search() { # search <regex> [path...]
  local pat="$1"; shift
  if have rg; then rg -n --no-heading "$NO_NM" "--glob=!$SELF" "$pat" "$@" 2>/dev/null
  else grep -rnE "$pat" "$@" 2>/dev/null | grep -v node_modules | grep -v "$SELF"; fi
}
hr() { printf '\n===== %s =====\n' "$*"; }

echo "OPENQLOW scheduler audit"
echo "repo: $REPO"
echo "host: $(uname -s) $(hostname 2>/dev/null)"

# --- 1. OS スケジューラ -------------------------------------------------------
hr "1. OS スケジューラ"
echo "--- crontab ---"; crontab -l 2>/dev/null || echo "(なし)"
echo "--- /etc/cron.d ---"; ls -1 /etc/cron.d 2>/dev/null || echo "(なし)"
if have systemctl; then
  echo "--- systemd timers (openqlow) ---"
  systemctl list-timers --all '*openqlow*' 2>/dev/null | sed '/^$/d' || echo "(なし)"
fi
if have launchctl; then
  echo "--- launchd loaded (openqlow/flatup/aika) ---"
  launchctl list 2>/dev/null | grep -iE "openqlow|flatup|aika" || echo "(該当なし)"
fi

# --- 2. claude -p / Agent SDK のスケジュール起動 ------------------------------
hr "2. claude -p / Agent SDK 呼び出し"
search "claude +-p|claude +--print|claude-agent-sdk|claude_agent_sdk|claude-code-action" "$REPO" \
  || echo "(該当なし — claude CLI/SDK はスケジュール起動していない)"

# --- 3. アプリ内スケジューラ --------------------------------------------------
hr "3. アプリ内スケジューラ (node-cron 等)"
search "node-cron|APScheduler|BullMQ|celery|beat_schedule|setInterval\(" "$REPO/src" \
  || echo "(該当なし)"

# --- 4. リポジトリ内のスケジュール定義 ----------------------------------------
hr "4. systemd timer / launchd plist (リポジトリ同梱)"
ls -1 "$REPO"/deploy/systemd/*.timer "$REPO"/deploy/launchd/*.plist "$REPO"/launchd/*.plist 2>/dev/null || echo "(なし)"
echo "--- 各 timer の発火時刻と実行ユニット ---"
search "OnCalendar=|OnUnitActiveSec=|ExecStart=" "$REPO/deploy/systemd" || echo "(なし)"

# --- 5. GitHub Actions --------------------------------------------------------
hr "5. GitHub Actions (schedule: / claude)"
if [[ -d "$REPO/.github/workflows" ]]; then
  search "schedule:|claude" "$REPO/.github/workflows" || echo "(該当なし)"
else
  echo "(.github/workflows なし)"
fi

# --- 6. Claude Code hooks/skills ---------------------------------------------
hr "6. Claude Code 設定 (.claude/)"
if [[ -e "$REPO/.claude/settings.json" ]]; then
  search "hook|command|claude" "$REPO/.claude/settings.json" || echo "(該当キーなし)"
else
  echo "(.claude/settings.json なし)"
fi

# --- 7. AI 認証経路（ファイル名のみ・鍵の値は出さない） ----------------------
hr "7. AI 認証経路 (参照ファイル名のみ)"
if have rg; then
  rg -l "$NO_NM" "ANTHROPIC_API_KEY|OPENROUTER|OPENAI_API_KEY|OLLAMA|ANYTHINGLLM" "$REPO" 2>/dev/null || echo "(該当なし)"
else
  grep -rlE "ANTHROPIC_API_KEY|OPENROUTER|OPENAI_API_KEY|OLLAMA|ANYTHINGLLM" "$REPO" 2>/dev/null | grep -v node_modules || echo "(該当なし)"
fi

hr "完了"
