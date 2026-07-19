#!/usr/bin/env bash
set -u

ROOT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
POLICY="$ROOT_DIR/.codex/hooks/pre_tool_use_policy.mjs"

if [[ -z "$ROOT_DIR" || ! -f "$POLICY" || ! -x "$(command -v node 2>/dev/null)" ]]; then
  echo "FLATUP safety hook unavailable; command blocked" >&2
  exit 2
fi

INPUT="$(cat)" || {
  echo "FLATUP safety hook input failed; command blocked" >&2
  exit 2
}

if ! OUTPUT="$(printf '%s' "$INPUT" | FLATUP_HOOK_ENGINE=claude node "$POLICY")"; then
  echo "FLATUP safety policy failed; command blocked" >&2
  exit 2
fi

if [[ -n "$OUTPUT" ]]; then
  printf '%s\n' "$OUTPUT"
fi
