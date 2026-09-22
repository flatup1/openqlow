#!/usr/bin/env bash
# FLATUP: OpenCut（classic）をローカルで起動する。Ctrl+C で止まる。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/opencut-classic"

[ -d "$APP" ] || { echo "[中止] まだセットアップしていません。先に ./opencut-studio/setup.sh を実行してください。" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "[中止] Docker Desktop を起動してください。" >&2; exit 1; }

cd "$APP"
echo "== データベースとRedisを起動"
docker compose up -d db redis serverless-redis-http

echo "== 画面を起動（初回の表示は1〜2分かかる）"
echo "   起動したら http://localhost:3000 を開く"
bun dev:web
