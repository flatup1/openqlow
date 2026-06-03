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
  --exclude 'state/'
  --exclude 'drafts/'
  --exclude 'logs/'
  --exclude '*.log'
  --exclude '.env'
  --exclude '.env.*'
  --exclude '.phase2-backup/'
)

echo "[sync-to-vps] source: $PROJECT_ROOT"
echo "[sync-to-vps] target: ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}"
echo "[sync-to-vps] excludes: ${RSYNC_EXCLUDES[*]}"

rsync -az --delete "${RSYNC_EXCLUDES[@]}" \
  -e "ssh -i ${SSH_KEY}" \
  "$PROJECT_ROOT" \
  "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}"

# rsync は Mac の UID/GID をそのまま転送するため、VPS 側で
# webhook プロセスのユーザ (openqlow) が state/ drafts/ logs/ に
# 書き込めなくなる。同期後に明示的に chown して、書き込み対象ディレクトリも作っておく。
echo "[sync-to-vps] fixing ownership on ${REMOTE_DIR} → openqlow:openqlow"
ssh -i "${SSH_KEY}" "${SSH_USER}@${SSH_HOST}" \
  "mkdir -p ${REMOTE_DIR}state ${REMOTE_DIR}drafts ${REMOTE_DIR}logs && \
   chown -R openqlow:openqlow ${REMOTE_DIR}"

echo "[sync-to-vps] done."
