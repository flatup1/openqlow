#!/usr/bin/env bash
set -euo pipefail

# ここから先は、動かしません（公開の約束を、まもるため）。
# このコマンドは、古い公開先（uizin-eventos）へ、out/ の全部（古い /admin/ /op/ /mc/ も）を、
# 確認（check-private-build.mjs）も通さず、コミットしていない状態のまま送ってしまいます。
# 公開は「npm run deploy:private」だけを使います（確認を通った out-private-pages だけを、tournament-os-v3 へ送る）。
echo "このコマンドは使いません。公開は「npm run deploy:private」だけを使います。" >&2
echo "（古い公開先へ、確認なしで全部を送ってしまうため、止めてあります）" >&2
exit 1

cd "$(cd "$(dirname "$0")/.." && pwd -P)"

PROJECT_NAME=tournament-os \
WORKER_CONFIG=worker/wrangler.tournament.toml \
APP_TITLE="Tournament OS" \
ALLOW_EMPTY_SHEET=true \
bash scripts/go-live.sh "$@"
