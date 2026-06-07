#!/usr/bin/env bash
# 作業終了ヘルパー：COORDINATION.md からロックを解除
#
# 使い方:
#   ./scripts/end-work.sh <AI名> <領域>
#
# 例:
#   ./scripts/end-work.sh Claude "src/distribution"

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "使い方: $0 <AI名> <領域>" >&2
  exit 1
fi

AI_NAME="$1"
WORK_AREA="$2"

REPO_ROOT="$(git rev-parse --show-toplevel)"
COORD_FILE="${REPO_ROOT}/COORDINATION.md"

if [[ ! -f "${COORD_FILE}" ]]; then
  echo "❌ COORDINATION.md が見つかりません" >&2
  exit 1
fi

# §2 セクション内の自分のロック行を削除
# "- [${AI_NAME}]" で始まり、領域に "${WORK_AREA}" を含む行を削除
TMP=$(mktemp)
PATTERN="- \[${AI_NAME}\].*${WORK_AREA}"

awk -v pattern="${PATTERN}" '
  /^## 2\. 現在のロック/ { in_section=1; print; next }
  /^## 3\./ { in_section=0 }
  in_section && $0 ~ pattern { next }
  { print }
' "${COORD_FILE}" > "${TMP}"

# §2 がすべて空になったら "なし" を入れる
if ! awk '/^## 2\. 現在のロック/,/^## 3\./' "${TMP}" | grep -qE "^- \["; then
  awk '
    /^## 2\. 現在のロック/ { in_section=1; print; getline; print ""; print "なし"; print ""; next }
    /^## 3\./ { in_section=0 }
    in_section { next }
    { print }
  ' "${TMP}" > "${TMP}.2"
  mv "${TMP}.2" "${TMP}"
fi

mv "${TMP}" "${COORD_FILE}"

echo "✅ ロック解除: [${AI_NAME}] ${WORK_AREA}"
echo ""
echo "===== 現在のロック ====="
grep -A 5 "^## 2\. 現在のロック" "${COORD_FILE}" | head -10
echo ""
echo "===== 次にやること ====="
echo "  1. git add ..."
echo "  2. git commit -m \"${AI_NAME,,}: ...\""
echo "  3. JIN に push 許可を依頼"
