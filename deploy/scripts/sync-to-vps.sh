#!/usr/bin/env bash
# OPENQLOW Mac → VPS 単方向同期スクリプト
# state/ drafts/ logs/ など本番側で増殖するものは必ず除外する。
# 使い方: bash deploy/scripts/sync-to-vps.sh

set -euo pipefail

SSH_KEY="${OPENQLOW_VPS_KEY:-$HOME/.ssh/openqlow_vps}"
SSH_USER="${OPENQLOW_VPS_USER:-root}"
SSH_HOST="${OPENQLOW_VPS_HOST:-162.43.41.182}"
REMOTE_DIR="${OPENQLOW_VPS_REMOTE:-/opt/openqlow/}"

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)/"

RSYNC_EXCLUDES=(
  --exclude node_modules
  --exclude .git
  --exclude 'dist/'
  --exclude 'state/'
  --exclude 'drafts/'
  --exclude 'logs/'
  --exclude '*.log'
  --exclude '.env'
  --exclude '.env.*'
  --exclude '.phase2-backup/'
  # npm のキャッシュ・ログは本番に不要。中の *.log が除外されるため
  # --delete がディレクトリを消せず rsync が終了コード23で落ちる原因にもなる。
  --exclude '.npm/'
  --exclude '.DS_Store'
)

echo "[sync-to-vps] source: $PROJECT_ROOT"
echo "[sync-to-vps] target: ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}"
echo "[sync-to-vps] excludes: ${RSYNC_EXCLUDES[*]}"

# rsync の終了コード 23/24 は「除外ファイルが残っていてディレクトリを消せない」
# 「転送中にファイルが消えた」といった軽微な警告。転送自体は完了しているので、
# ここで止めずに警告として流す。それ以外の失敗はそのまま異常終了させる。
rsync_status=0
rsync -az --delete "${RSYNC_EXCLUDES[@]}" \
  -e "ssh -i ${SSH_KEY}" \
  "$PROJECT_ROOT" \
  "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}" || rsync_status=$?

case "$rsync_status" in
  0) ;;
  23|24)
    echo "[sync-to-vps] 警告: 一部のファイルを削除/転送できませんでした (rsync ${rsync_status})。転送は完了しています。"
    ;;
  *)
    echo "[sync-to-vps] エラー: rsync が失敗しました (終了コード ${rsync_status})" >&2
    exit "$rsync_status"
    ;;
esac

# rsync は Mac の UID/GID をそのまま転送するため、VPS 側で
# webhook プロセスのユーザ (openqlow) が state/ drafts/ logs/ に
# 書き込めなくなる。同期後に明示的に chown して、書き込み対象ディレクトリも作っておく。
echo "[sync-to-vps] fixing ownership on ${REMOTE_DIR} → openqlow:openqlow"
ssh -i "${SSH_KEY}" "${SSH_USER}@${SSH_HOST}" \
  "mkdir -p ${REMOTE_DIR}state ${REMOTE_DIR}drafts ${REMOTE_DIR}logs && \
   chown -R openqlow:openqlow ${REMOTE_DIR}"

echo "[sync-to-vps] done."
