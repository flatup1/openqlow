#!/usr/bin/env bash
# FLATUP: OpenCut のデータベースとRedisを止める。
# 動画データはブラウザ内(IndexedDB)にあるので、これで消えることはない。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/opencut-classic"

[ -d "$APP" ] || { echo "セットアップされていません。何もしません。"; exit 0; }
cd "$APP"
docker compose stop db redis serverless-redis-http
echo "止めました。画面(bun dev:web)は Ctrl+C で止めてください。"
