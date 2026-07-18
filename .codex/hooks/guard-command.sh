#!/usr/bin/env bash
set -u

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "FLATUP safety hook: repository root unavailable" >&2
  exit 2
}
POLICY="$ROOT_DIR/.codex/hooks/pre_tool_use_policy.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "FLATUP safety hook: Node.js unavailable; command blocked" >&2
  exit 2
fi

INPUT="$(cat)" || {
  echo "FLATUP safety hook: input read failed; command blocked" >&2
  exit 2
}

if ! OUTPUT="$(printf '%s' "$INPUT" | node "$POLICY")"; then
  echo "FLATUP safety hook: policy failed; command blocked" >&2
  exit 2
fi

if [[ -n "$OUTPUT" ]]; then
  printf '%s\n' "$OUTPUT"
fi
