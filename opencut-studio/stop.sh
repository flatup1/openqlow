#!/usr/bin/env bash
# FLATUP: OpenCut のデータベースとRedisを止める。
# 動画データはブラウザ内にあるので、これで消えることはない。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/opencut-classic"

[ -d "$APP" ] || { echo "セットアップされていません。何もしません。"; exit 0; }

if ! command -v docker >/dev/null || ! docker info >/dev/null 2>&1; then
  echo "Docker を使っていないので、止めるものはありません。"
  echo "画面(start.sh)は Ctrl+C で止めてください。"
  exit 0
fi

cd "$APP"
docker compose stop db redis serverless-redis-http
echo "止めました。画面(start.sh)は Ctrl+C で止めてください。"
