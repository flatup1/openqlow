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
grep -Fq "Claude safety hook verified" <<<"$OUTPUT"

# Codex execpolicy の実行検査は Codex CLI がある環境でのみ成立する。
# CLI が無い環境（CI・未導入端末）では、明示的に SKIP されていることを確認する。
if command -v codex >/dev/null 2>&1; then
  grep -Fq "Codex rules verified" <<<"$OUTPUT"
else
  grep -Fq "SKIP: Codex CLI unavailable" <<<"$OUTPUT"
fi

# 正本ドリフト検出が実際に働いていること（合格出力に必ず現れる）。
grep -Fq "canon view amounts and times all trace back to canon.ts" <<<"$OUTPUT"

echo "validate-ai-os tests passed"
