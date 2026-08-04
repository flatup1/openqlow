#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
SOURCE_ROOT="$ROOT_DIR/docs/ai-os/skills-source"
MODE="${1:---check}"

SKILLS=(
  flatup-daily-command
  flatup-inquiry-reply
  flatup-trial-followup
  flatup-social-repurpose
  flatup-content-qc
  flatup-weekly-kpi
  flatup-faq-update
  flatup-file-audit
  flatup-campaign-planner
  flatup-change-review
)

if [[ "$MODE" != "--check" && "$MODE" != "--sync" ]]; then
  echo "Usage: $0 [--check|--sync]" >&2
  exit 2
fi

mkdir -p "$ROOT_DIR/.agents/skills" "$ROOT_DIR/.claude/skills"

for skill in "${SKILLS[@]}"; do
  source_dir="$SOURCE_ROOT/$skill"
  [[ -f "$source_dir/SKILL.md" ]] || {
    echo "Missing skill source: $skill" >&2
    exit 1
  }

  for platform in .agents .claude; do
    target="$ROOT_DIR/$platform/skills/$skill"
    relative="../../docs/ai-os/skills-source/$skill"

    if [[ "$MODE" == "--sync" ]]; then
      if [[ -e "$target" && ! -L "$target" ]]; then
        echo "Refusing to replace non-symlink: $target" >&2
        exit 1
      fi
      ln -sfn "$relative" "$target"
    fi

    if [[ ! -L "$target" || ! -f "$target/SKILL.md" ]]; then
      echo "Skill link missing or broken: $target" >&2
      exit 1
    fi
    cmp -s "$source_dir/SKILL.md" "$target/SKILL.md" || {
      echo "Skill content mismatch: $target" >&2
      exit 1
    }
  done
done

echo "10 skills synchronized for Codex and Claude Code ($MODE)"
