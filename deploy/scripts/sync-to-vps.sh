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

echo "[sync-to-vps] done."
