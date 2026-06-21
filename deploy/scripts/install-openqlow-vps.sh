#!/usr/bin/env bash
set -euo pipefail

# Run on the VPS from the OPENQLOW project root after copying the project to /opt/openqlow.
# This script installs systemd units only. It does not modify the existing FLATUP LINE Bot.

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/scripts/install-openqlow-vps.sh" >&2
  exit 1
fi

OPENQLOW_ROOT="${OPENQLOW_ROOT:-/opt/openqlow}"
OBSIDIAN_VAULT_ROOT="${OBSIDIAN_VAULT_ROOT:-/opt/obsidian-vault}"
ENV_DIR="/etc/openqlow"
ENV_FILE="${ENV_DIR}/openqlow.env"

useradd --system --home "${OPENQLOW_ROOT}" --shell /usr/sbin/nologin openqlow 2>/dev/null || true
mkdir -p "${ENV_DIR}" "${OPENQLOW_ROOT}/logs" "${OPENQLOW_ROOT}/drafts" "${OPENQLOW_ROOT}/state" "${OBSIDIAN_VAULT_ROOT}"
chown -R openqlow:openqlow "${OPENQLOW_ROOT}"
chown -R openqlow:openqlow "${OBSIDIAN_VAULT_ROOT}"
chmod 750 "${ENV_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${OPENQLOW_ROOT}/deploy/openqlow.vps.env.example" "${ENV_FILE}"
  chmod 640 "${ENV_FILE}"
  chown root:openqlow "${ENV_FILE}"
  echo "Created ${ENV_FILE}. Fill LINE tokens before enabling production push."
fi

# 依存導入とビルド。systemd ユニットは tsx ではなくコンパイル済み dist/ を
# `node dist/...` で直接実行するため、起動前に dist を生成しておく必要がある。
echo "Installing dependencies and building dist/ ..."
( cd "${OPENQLOW_ROOT}" && npm ci && npm run build )
chown -R openqlow:openqlow "${OPENQLOW_ROOT}/dist"

cp "${OPENQLOW_ROOT}/deploy/systemd/"openqlow-*.service /etc/systemd/system/
cp "${OPENQLOW_ROOT}/deploy/systemd/"openqlow-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable \
  openqlow-webhook.service \
  openqlow-daily.timer \
  openqlow-daily-check.timer \
  openqlow-monitor.timer \
  openqlow-morning.timer \
  openqlow-reminder.timer \
  openqlow-crm-daily-report.timer

echo "Installed OPENQLOW systemd units (tsx-free, running compiled dist/)."
echo "Next:"
echo "  1. Edit ${ENV_FILE}"
echo "  2. (任意) Run tests: cd ${OPENQLOW_ROOT} && npm run test"
echo "  3. Start: systemctl start openqlow-webhook.service openqlow-daily.timer openqlow-daily-check.timer openqlow-monitor.timer openqlow-morning.timer openqlow-reminder.timer openqlow-crm-daily-report.timer"
echo "  4. Add nginx route from deploy/nginx/openqlow-same-vps.conf"
echo "  Note: コード更新時は再デプロイ後に 'cd ${OPENQLOW_ROOT} && npm ci && npm run build' を再実行してから対象サービスを restart すること。"
echo "  Note: openqlow-morning.timer fires at 07:00 JST daily — set OPENQLOW_MORNING_PUSH_DISABLED=true to disable."
