#!/usr/bin/env bash
# Skills 正本（docs/ai-os/skills-source/）を Codex 用（.agents/skills/）と
# Claude Code 用（.claude/skills/）へ同期する。
#
# シンボリックリンクが使える環境ではリンク、使えない環境ではコピー。
# 既存の他 Skills（例: .claude/skills/run-openqlow-dryrun）は削除しない。
#
# 使い方: bash scripts/sync-agent-skills.sh [--copy]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${REPO_ROOT}/docs/ai-os/skills-source"
TARGETS=("${REPO_ROOT}/.claude/skills" "${REPO_ROOT}/.agents/skills")

FORCE_COPY="false"
[[ "${1:-}" == "--copy" ]] && FORCE_COPY="true"

if [[ ! -d "${SRC}" ]]; then
  echo "❌ 正本ディレクトリが見つかりません: ${SRC}" >&2
  exit 1
fi

sync_one() {
  local skill_dir="$1" target_root="$2"
  local name; name="$(basename "${skill_dir}")"
  local dest="${target_root}/${name}"
  mkdir -p "${target_root}"
  rm -rf "${dest}"
  if [[ "${FORCE_COPY}" == "true" ]]; then
    cp -R "${skill_dir}" "${dest}"
    echo "  copied  ${name} -> ${target_root#${REPO_ROOT}/}"
  else
    # 相対シンボリックリンクを試す。失敗したらコピーにフォールバック。
    local rel; rel="$(python3 -c "import os,sys;print(os.path.relpath(sys.argv[1],sys.argv[2]))" "${skill_dir}" "${target_root}" 2>/dev/null || true)"
    if [[ -n "${rel}" ]] && ln -s "${rel}" "${dest}" 2>/dev/null; then
      echo "  linked  ${name} -> ${target_root#${REPO_ROOT}/}"
    else
      cp -R "${skill_dir}" "${dest}"
      echo "  copied  ${name} -> ${target_root#${REPO_ROOT}/} (symlink不可)"
    fi
  fi
}

for target in "${TARGETS[@]}"; do
  echo "Sync -> ${target#${REPO_ROOT}/}"
  for skill_dir in "${SRC}"/*/; do
    [[ -d "${skill_dir}" ]] || continue
    sync_one "${skill_dir%/}" "${target}"
  done
done

echo "✅ Skills 同期完了"
