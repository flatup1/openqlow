#!/usr/bin/env bash
# openQLOW ワンコマンド本番反映
#
# Mac で `npm run deploy` と打つだけで、次を順番にやる:
#   1. GitHub の main を取り込む（ローカル編集は自動退避）
#   2. VPS へ同期（sync-to-vps.sh）
#   3. VPS で依存インストール → ビルド → webhook 再起動
#   4. 起動できたか確認して結果を出す
#
# 追加オプション:
#   --richmenu   反映後に LINE リッチメニューを登録し直す
#   --skip-pull  git pull を飛ばす（今の手元のコードをそのまま出す）
#
# 途中で失敗したらそこで止まる（set -e）。本番を壊したまま進まないため。

set -euo pipefail

SSH_KEY="${OPENQLOW_VPS_KEY:-$HOME/.ssh/openqlow_vps}"
SSH_USER="${OPENQLOW_VPS_USER:-root}"
SSH_HOST="${OPENQLOW_VPS_HOST:-162.43.41.182}"
REMOTE_DIR="${OPENQLOW_VPS_REMOTE:-/opt/openqlow/}"
SERVICE="${OPENQLOW_SERVICE:-openqlow-webhook}"

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

WITH_RICHMENU=0
SKIP_PULL=0
for arg in "$@"; do
  case "$arg" in
    --richmenu) WITH_RICHMENU=1 ;;
    --skip-pull) SKIP_PULL=1 ;;
    *) echo "不明なオプション: $arg" >&2; exit 2 ;;
  esac
done

step() { echo ""; echo "=== $1 ==="; }

cd "$PROJECT_ROOT"

if [[ "$SKIP_PULL" -eq 1 ]]; then
  step "1/4 GitHub取り込み: スキップ"
else
  step "1/4 GitHub の main を取り込む"
  # --autostash: 手元の未保存の編集があっても退避してから取り込み、あとで戻す
  git pull --rebase --autostash origin main
fi

step "2/4 VPS へ同期"
bash "${SCRIPT_DIR}/sync-to-vps.sh"

step "3/4 VPS でビルドと再起動"
ssh -i "${SSH_KEY}" "${SSH_USER}@${SSH_HOST}" bash -se <<REMOTE
set -euo pipefail
cd "${REMOTE_DIR}"
npm ci
npm run build
systemctl restart ${SERVICE}
REMOTE

step "4/4 起動の確認"
# is-active は起動していれば active を返す。失敗時は直近ログを出して落とす。
if ssh -i "${SSH_KEY}" "${SSH_USER}@${SSH_HOST}" "systemctl is-active --quiet ${SERVICE}"; then
  echo "OK: ${SERVICE} は動いています"
else
  echo "NG: ${SERVICE} が起動していません。直近のログ:" >&2
  ssh -i "${SSH_KEY}" "${SSH_USER}@${SSH_HOST}" "journalctl -u ${SERVICE} -n 30 --no-pager" >&2
  exit 1
fi

if [[ "$WITH_RICHMENU" -eq 1 ]]; then
  step "追加: リッチメニューを登録し直す"
  ssh -i "${SSH_KEY}" "${SSH_USER}@${SSH_HOST}" bash -se <<REMOTE
set -euo pipefail
cd "${REMOTE_DIR}"
export LINE_CHANNEL_ACCESS_TOKEN="\$(grep -m1 '^LINE_CHANNEL_ACCESS_TOKEN=' /etc/openqlow/openqlow.env | cut -d= -f2-)"
npm run richmenu
REMOTE
fi

echo ""
echo "反映が終わりました。LINEで動作を確かめてください。"
