#!/usr/bin/env bash
set -euo pipefail

# Run on the openQLOW VPS after the compiled ad-line files and systemd unit
# have been copied to STAGE_DIR. This activates inbound dry-run only:
# signed webhook requests are accepted, but no reply and no event storage occur.

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

OPENQLOW_ROOT="${OPENQLOW_ROOT:-/opt/openqlow}"
ENV_FILE="${ENV_FILE:-/etc/openqlow/openqlow.env}"
STAGE_DIR="${STAGE_DIR:-/tmp/openqlow-ad-line-release}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/openqlow.conf}"
BACKUP_DIR="${BACKUP_DIR:-/root/openqlow-backups}"
AD_DATA_DIR="${AD_DATA_DIR:-/opt/openqlow/ad-line-data}"
AD_ENDPOINT="${AD_ENDPOINT:-https://line.flatupnarita.jp/openqlow/ad-line/webhook}"
STAMP="$(date +%Y%m%d-%H%M%S)"

for required in \
  "${ENV_FILE}" \
  "${NGINX_SITE}" \
  "${STAGE_DIR}/openqlow-ad-line.service" \
  "${STAGE_DIR}/ad_channel_boundary.js" \
  "${STAGE_DIR}/ad_webhook_handler.js" \
  "${STAGE_DIR}/ad_webhook_server.js" \
  "${STAGE_DIR}/ad_webhook.js"; do
  if [[ ! -f "${required}" ]]; then
    echo "Missing required file: ${required}" >&2
    exit 1
  fi
done

read_env() {
  local key="$1"
  awk -F= -v wanted="${key}" '$1 == wanted { print substr($0, index($0, "=") + 1); exit }' "${ENV_FILE}"
}

upsert_env() {
  local key="$1"
  local new_value="$2"
  local temp_file
  temp_file="$(mktemp)"
  AD_ENV_KEY="${key}" AD_ENV_VALUE="${new_value}" awk -F= '
    BEGIN { written = 0 }
    $1 == ENVIRON["AD_ENV_KEY"] {
      if (!written) {
        print ENVIRON["AD_ENV_KEY"] "=" ENVIRON["AD_ENV_VALUE"]
        written = 1
      }
      next
    }
    { print }
    END {
      if (!written) print ENVIRON["AD_ENV_KEY"] "=" ENVIRON["AD_ENV_VALUE"]
    }
  ' "${ENV_FILE}" > "${temp_file}"
  install -o root -g openqlow -m 640 "${temp_file}" "${ENV_FILE}"
  rm -f "${temp_file}"
}

legacy_secret="$(read_env LINE_CHANNEL_SECRET)"
legacy_token="$(read_env LINE_CHANNEL_ACCESS_TOKEN)"
legacy_owner_id="$(read_env JIN_LINE_USER_ID)"

if [[ -z "${legacy_secret}" || -z "${legacy_token}" || -z "${legacy_owner_id}" ]]; then
  echo "Existing openQLOW LINE credentials are incomplete; refusing migration" >&2
  exit 1
fi

install -d -m 700 "${BACKUP_DIR}"
install -d -o openqlow -g openqlow -m 700 "${AD_DATA_DIR}"
install -m 600 "${ENV_FILE}" "${BACKUP_DIR}/openqlow.env.${STAMP}"
install -m 600 "${NGINX_SITE}" "${BACKUP_DIR}/openqlow.nginx.${STAMP}.conf"

upsert_env AD_LINE_PURPOSE advertising
upsert_env AD_LINE_CHANNEL_ID 2008998149
upsert_env AD_LINE_ACCOUNT_BASIC_ID @817nsdhr
upsert_env AD_LINE_CHANNEL_SECRET "${legacy_secret}"
upsert_env AD_LINE_OWNER_USER_ID "${legacy_owner_id}"
upsert_env AD_LINE_WEBHOOK_PATH /openqlow/ad-line/webhook
upsert_env AD_LINE_PORT 8788
upsert_env AD_LINE_DATA_DIR "${AD_DATA_DIR}"
upsert_env AD_LINE_DRY_RUN true
upsert_env AD_LINE_REPORT_DRY_RUN true
upsert_env AD_LINE_REPORT_DISABLED true
upsert_env AD_LINE_REPORT_WRITE_FILE false
upsert_env MEMBER_LINE_ACCOUNT_BASIC_ID @jfl0054o

install -d -o openqlow -g openqlow -m 755 "${OPENQLOW_ROOT}/dist/line_bot"
install -o openqlow -g openqlow -m 644 "${STAGE_DIR}/ad_channel_boundary.js" "${OPENQLOW_ROOT}/dist/line_bot/ad_channel_boundary.js"
install -o openqlow -g openqlow -m 644 "${STAGE_DIR}/ad_webhook_handler.js" "${OPENQLOW_ROOT}/dist/line_bot/ad_webhook_handler.js"
install -o openqlow -g openqlow -m 644 "${STAGE_DIR}/ad_webhook_server.js" "${OPENQLOW_ROOT}/dist/line_bot/ad_webhook_server.js"
install -o openqlow -g openqlow -m 644 "${STAGE_DIR}/ad_webhook.js" "${OPENQLOW_ROOT}/dist/line_bot/ad_webhook.js"
install -o root -g root -m 644 "${STAGE_DIR}/openqlow-ad-line.service" /etc/systemd/system/openqlow-ad-line.service

systemctl daemon-reload
systemctl enable openqlow-ad-line.service >/dev/null
if ! systemctl restart openqlow-ad-line.service; then
  systemctl disable openqlow-ad-line.service >/dev/null || true
  echo "Advertising LINE service failed; it was disabled" >&2
  exit 1
fi

body='{"events":[]}'
signature="$(AD_SECRET="${legacy_secret}" AD_BODY="${body}" node -e '
  const crypto = require("node:crypto");
  process.stdout.write(crypto.createHmac("sha256", process.env.AD_SECRET).update(process.env.AD_BODY).digest("base64"));
')"
local_status="$(curl -sS -o /tmp/openqlow-ad-line-local-check.json -w '%{http_code}' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H "X-Line-Signature: ${signature}" \
  --data "${body}" \
  http://127.0.0.1:8788/openqlow/ad-line/webhook)"
if [[ "${local_status}" != "200" ]] || ! grep -q '"dryRun":true' /tmp/openqlow-ad-line-local-check.json; then
  echo "Local signed webhook test failed" >&2
  exit 1
fi

if ! grep -q 'location = /openqlow/ad-line/webhook' "${NGINX_SITE}"; then
  nginx_temp="$(mktemp)"
  awk '
    /^[[:space:]]*location \/ \{/ {
      print "    # Advertising-only LINE: inbound dry-run, separate from AIKA and legacy openQLOW."
      print "    location = /openqlow/ad-line/webhook {"
      print "        proxy_pass http://127.0.0.1:8788/openqlow/ad-line/webhook;"
      print "        proxy_http_version 1.1;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "        proxy_set_header X-Line-Signature $http_x_line_signature;"
      print "    }"
      print ""
    }
    { print }
  ' "${NGINX_SITE}" > "${nginx_temp}"
  install -o root -g root -m 644 "${nginx_temp}" "${NGINX_SITE}"
  rm -f "${nginx_temp}"
fi

if ! nginx -t; then
  install -o root -g root -m 644 "${BACKUP_DIR}/openqlow.nginx.${STAMP}.conf" "${NGINX_SITE}"
  nginx -t
  echo "Nginx validation failed; previous configuration restored" >&2
  exit 1
fi
systemctl reload nginx

old_endpoint_json="$(curl -fsS -H "Authorization: Bearer ${legacy_token}" https://api.line.me/v2/bot/channel/webhook/endpoint)"
old_endpoint="$(LINE_ENDPOINT_JSON="${old_endpoint_json}" node -e '
  const parsed = JSON.parse(process.env.LINE_ENDPOINT_JSON);
  if (typeof parsed.endpoint !== "string" || !parsed.endpoint) process.exit(1);
  process.stdout.write(parsed.endpoint);
')"
printf '%s\n' "${old_endpoint}" > "${BACKUP_DIR}/line-webhook-endpoint.${STAMP}.txt"
chmod 600 "${BACKUP_DIR}/line-webhook-endpoint.${STAMP}.txt"

endpoint_payload="$(AD_ENDPOINT_VALUE="${AD_ENDPOINT}" node -e '
  process.stdout.write(JSON.stringify({ endpoint: process.env.AD_ENDPOINT_VALUE }));
')"
curl -fsS -X PUT \
  -H "Authorization: Bearer ${legacy_token}" \
  -H 'Content-Type: application/json' \
  --data "${endpoint_payload}" \
  https://api.line.me/v2/bot/channel/webhook/endpoint >/dev/null

test_result="$(curl -fsS -X POST \
  -H "Authorization: Bearer ${legacy_token}" \
  https://api.line.me/v2/bot/channel/webhook/test)"
if ! LINE_TEST_JSON="${test_result}" node -e '
  const parsed = JSON.parse(process.env.LINE_TEST_JSON);
  process.exit(parsed.success === true && parsed.statusCode === 200 ? 0 : 1);
'; then
  rollback_payload="$(AD_ENDPOINT_VALUE="${old_endpoint}" node -e '
    process.stdout.write(JSON.stringify({ endpoint: process.env.AD_ENDPOINT_VALUE }));
  ')"
  curl -fsS -X PUT \
    -H "Authorization: Bearer ${legacy_token}" \
    -H 'Content-Type: application/json' \
    --data "${rollback_payload}" \
    https://api.line.me/v2/bot/channel/webhook/endpoint >/dev/null
  echo "LINE webhook verification failed; previous endpoint restored" >&2
  exit 1
fi

external_unsigned_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST \
  -H 'Content-Type: application/json' \
  --data '{"events":[]}' \
  "${AD_ENDPOINT}")"
if [[ "${external_unsigned_status}" != "401" ]]; then
  echo "Expected unsigned external request to be rejected with 401" >&2
  exit 1
fi

echo "AD_LINE_SERVICE=$(systemctl is-active openqlow-ad-line.service)"
echo "AD_LINE_ENABLED=$(systemctl is-enabled openqlow-ad-line.service)"
echo "AD_LINE_DRY_RUN=$(read_env AD_LINE_DRY_RUN)"
echo "AD_REPORT_DISABLED=$(read_env AD_LINE_REPORT_DISABLED)"
echo "MORNING_TIMER=$(systemctl is-active openqlow-morning.timer || true)"
echo "LINE_WEBHOOK_TEST=passed"
echo "UNSIGNED_REQUEST_REJECTION=passed"
