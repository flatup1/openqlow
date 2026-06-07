#!/usr/bin/env bash
# Git Hook をリポジトリに設置する
# 実行: ./scripts/hooks/install.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_SOURCE_DIR="${REPO_ROOT}/scripts/hooks"
HOOK_TARGET_DIR="${REPO_ROOT}/.git/hooks"

mkdir -p "${HOOK_TARGET_DIR}"

# 各フックを symlink でインストール（コードはscripts/hooks/に保持）
HOOKS=("pre-commit")

for hook in "${HOOKS[@]}"; do
  SOURCE="${HOOK_SOURCE_DIR}/${hook}"
  TARGET="${HOOK_TARGET_DIR}/${hook}"

  if [[ ! -f "${SOURCE}" ]]; then
    echo "⚠️  ソースなし: ${SOURCE}" >&2
    continue
  fi

  chmod +x "${SOURCE}"

  # 既存の hook がある場合はバックアップ
  if [[ -e "${TARGET}" ]] && [[ ! -L "${TARGET}" ]]; then
    BACKUP="${TARGET}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "ℹ️  既存hookをバックアップ: ${BACKUP}"
    mv "${TARGET}" "${BACKUP}"
  fi

  # symlink を張る（相対パスで）
  ln -sfn "../../scripts/hooks/${hook}" "${TARGET}"
  echo "✅ ${hook} インストール完了: ${TARGET} -> ../../scripts/hooks/${hook}"
done

echo ""
echo "===== インストール後の状態 ====="
ls -la "${HOOK_TARGET_DIR}" | grep -v "\.sample"
echo ""
echo "✅ All hooks installed. Test with: git commit -m 'jin: test'"
