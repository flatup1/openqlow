#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd -P)"

PROJECT_NAME=tournament-os \
WORKER_CONFIG=worker/wrangler.tournament.toml \
APP_TITLE="Tournament OS" \
ALLOW_EMPTY_SHEET=true \
bash scripts/go-live.sh "$@"
