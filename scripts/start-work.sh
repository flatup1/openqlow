#!/usr/bin/env bash
# 作業開始ヘルパー：COORDINATION.md にロックを追記し、git pullで他AIの最新を取得
#
# 使い方:
#   ./scripts/start-work.sh <AI名> <領域> [予定時刻]
#
# 例:
#   ./scripts/start-work.sh Claude "src/distribution"
#   ./scripts/start-work.sh Codex "src/scheduler" "13:00"

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "使い方: $0 <AI名> <領域> [完了予定時刻]" >&2
  echo "例: $0 Claude src/distribution 12:00" >&2
  exit 1
fi

AI_NAME="$1"
WORK_AREA="$2"
END_TIME="${3:-未定}"
NOW=$(date "+%Y-%m-%d %H:%M")

REPO_ROOT="$(git rev-parse --show-toplevel)"
COORD_FILE="${REPO_ROOT}/COORDINATION.md"

if [[ ! -f "${COORD_FILE}" ]]; then
  echo "❌ COORDINATION.md が見つかりません: ${COORD_FILE}" >&2
  exit 1
fi

# Step 1: 他AIの最新を取得（未ステージング差分は自動stash）
echo "===== Step 1: git pull origin main ====="

STASHED=0
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "ℹ️  未コミット差分を自動 stash します"
  if git stash push -u -m "auto-stash by start-work.sh @ $(date +%Y%m%d_%H%M)" >/dev/null 2>&1; then
    STASHED=1
  else
    echo "❌ stash に失敗しました。手動で対応してください。" >&2
    exit 1
  fi
fi

if ! git pull origin main --rebase 2>&1; then
  echo "❌ git pull に失敗しました。コンフリクト等を確認してください。" >&2
  if [[ "${STASHED}" -eq 1 ]]; then
    echo "ℹ️  stash した差分は 'git stash pop' で戻せます" >&2
  fi
  exit 1
fi

# stash した差分を戻す
if [[ "${STASHED}" -eq 1 ]]; then
  if git stash pop >/dev/null 2>&1; then
    echo "✅ stash を戻しました"
  else
    echo "⚠️  stash pop でコンフリクト発生。'git status' で確認してください" >&2
  fi
fi

# Step 2: COORDINATION.md にロック追記
echo ""
echo "===== Step 2: COORDINATION.md にロック追記 ====="

LOCK_LINE="- [${AI_NAME}] ${NOW} ${WORK_AREA} 作業中。完了予定 ${END_TIME}"

# §2 セクションを見つけてその下に追記
# "## 2. 現在のロック（作業中）" を探して、その下の "なし" を置き換える or 追記する
if grep -q "^なし$" "${COORD_FILE}"; then
  # "なし" を新しいロックで置換
  sed -i.bak "s|^なし$|${LOCK_LINE}|" "${COORD_FILE}"
  rm -f "${COORD_FILE}.bak"
  echo "✅ 「なし」を置換しました"
else
  # 既存ロックの後に追記（§2の最後を探す）
  TMP=$(mktemp)
  awk -v lock="${LOCK_LINE}" '
    /^## 2\. 現在のロック/ { in_section=1; print; next }
    in_section && /^## 3\./ { print lock; print ""; in_section=0; print; next }
    { print }
  ' "${COORD_FILE}" > "${TMP}"
  mv "${TMP}" "${COORD_FILE}"
  echo "✅ §2 に追記しました"
fi

echo ""
echo "===== 追記内容 ====="
grep -A 5 "^## 2\. 現在のロック" "${COORD_FILE}" | head -10

echo ""
echo "===== 次にやること ====="
echo "  1. 作業実施"
echo "  2. 作業完了後: ./scripts/end-work.sh \"${AI_NAME}\" \"${WORK_AREA}\""
echo "  3. git commit -m \"${AI_NAME,,}: feat(...): ...\""
echo ""
echo "✅ 作業準備完了"
