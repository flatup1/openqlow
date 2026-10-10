#!/usr/bin/env bash
# UIZIN Event OS（tools/uizin-event-os）の自動テスト。依存パッケージは不要（Node.js 22 の標準機能だけ）。
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
node --test --test-timeout=30000 tools/uizin-event-os/test/*.test.mjs
