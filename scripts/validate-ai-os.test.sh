#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
VALIDATOR="$ROOT_DIR/scripts/validate-ai-os.sh"

if [[ ! -x "$VALIDATOR" ]]; then
  echo "FAIL: scripts/validate-ai-os.sh must exist and be executable" >&2
  exit 1
fi

OUTPUT="$("$VALIDATOR")"
printf '%s\n' "$OUTPUT"

grep -Fq "AI OS validation passed" <<<"$OUTPUT"
grep -Fq "10 skills verified" <<<"$OUTPUT"
grep -Fq "Codex rules verified" <<<"$OUTPUT"
grep -Fq "Claude safety hook verified" <<<"$OUTPUT"

echo "validate-ai-os tests passed"
