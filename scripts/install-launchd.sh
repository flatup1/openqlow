#!/usr/bin/env bash
# launchd で organize-posts を1日3回（07:30 / 13:00 / 21:00）自動実行する。
# 既存ロードがあれば bootout してから bootstrap。
#
# 使い方:
#   bash scripts/install-launchd.sh           # ロード
#   bash scripts/install-launchd.sh uninstall # アンロード
#   bash scripts/install-launchd.sh status    # 状態確認
#   bash scripts/install-launchd.sh trigger   # 手動で1回実行

set -euo pipefail

LABEL="com.flatup.openqlow.organize-posts"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_SRC="${PROJECT_ROOT}/deploy/launchd/${LABEL}.plist"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"
GUI_DOMAIN="gui/$(id -u)"

ensure_node() {
  # plist は /opt/homebrew/bin/node を絶対パス指定（Homebrew 標準）。
  # nvm 系の path は不安定なので避ける。違う場所にあったら警告だけ出す。
  local node_pinned="/opt/homebrew/bin/node"
  if [ ! -x "$node_pinned" ]; then
    echo "[install-launchd] warning: ${node_pinned} not found." >&2
    echo "                  Run: brew install node" >&2
    echo "                  or edit plist ProgramArguments to your node path." >&2
  fi
}

cmd_install() {
  if [ ! -f "$PLIST_SRC" ]; then
    echo "[install-launchd] missing source plist: $PLIST_SRC" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$PLIST_DST")" "$LOG_DIR"
  ensure_node

  # 既存があれば bootout
  if launchctl print "${GUI_DOMAIN}/${LABEL}" >/dev/null 2>&1; then
    echo "[install-launchd] unloading existing agent"
    launchctl bootout "${GUI_DOMAIN}/${LABEL}" || true
  fi

  cp "$PLIST_SRC" "$PLIST_DST"
  echo "[install-launchd] copied plist → $PLIST_DST"

  launchctl bootstrap "${GUI_DOMAIN}" "$PLIST_DST"
  echo "[install-launchd] bootstrap done"

  cmd_status
}

cmd_uninstall() {
  if launchctl print "${GUI_DOMAIN}/${LABEL}" >/dev/null 2>&1; then
    launchctl bootout "${GUI_DOMAIN}/${LABEL}"
    echo "[install-launchd] bootout done"
  else
    echo "[install-launchd] not loaded (nothing to do)"
  fi
  if [ -f "$PLIST_DST" ]; then
    rm "$PLIST_DST"
    echo "[install-launchd] removed $PLIST_DST"
  fi
}

cmd_status() {
  if launchctl print "${GUI_DOMAIN}/${LABEL}" >/dev/null 2>&1; then
    echo "[install-launchd] loaded:"
    launchctl print "${GUI_DOMAIN}/${LABEL}" | grep -E "state|path|last exit code|next run" || true
  else
    echo "[install-launchd] not loaded"
  fi
}

cmd_trigger() {
  if ! launchctl print "${GUI_DOMAIN}/${LABEL}" >/dev/null 2>&1; then
    echo "[install-launchd] not loaded — install first" >&2
    exit 1
  fi
  launchctl kickstart -k "${GUI_DOMAIN}/${LABEL}"
  echo "[install-launchd] kickstarted. check log: ${LOG_DIR}/openqlow-organize.log"
}

case "${1:-install}" in
  install) cmd_install ;;
  uninstall) cmd_uninstall ;;
  status) cmd_status ;;
  trigger) cmd_trigger ;;
  *)
    echo "Usage: $0 {install|uninstall|status|trigger}" >&2
    exit 2
    ;;
esac
