#!/bin/bash

set -euo pipefail

APP_DIR="${1:-/var/www/vocabbook-cloud}"
SERVICE_NAME="${2:-vocabbook-cloud}"
PACKAGE_PATH="${3:-/tmp/vocabbook-cloud-deploy.tar.gz}"
STAGING_DIR="/tmp/vocabbook-cloud-deploy"

mkdir -p "${APP_DIR}"
rm -rf "${STAGING_DIR}"
mkdir -p "${STAGING_DIR}"

tar -xzf "${PACKAGE_PATH}" -C "${STAGING_DIR}"

mkdir -p "${APP_DIR}/cloud_server"
cp -rf "${STAGING_DIR}/cloud_server/." "${APP_DIR}/cloud_server/"

if [ -d "${STAGING_DIR}/deploy" ]; then
    mkdir -p "${APP_DIR}/deploy"
    cp -rf "${STAGING_DIR}/deploy/." "${APP_DIR}/deploy/"
fi

if [ -f "${STAGING_DIR}/docs/deploy/ALIYUN_CLOUDFLARE_DEPLOY.md" ]; then
    mkdir -p "${APP_DIR}/docs/deploy"
    cp -f "${STAGING_DIR}/docs/deploy/ALIYUN_CLOUDFLARE_DEPLOY.md" "${APP_DIR}/docs/deploy/"
fi

if [ ! -d "${APP_DIR}/.venv" ]; then
    python3 -m venv "${APP_DIR}/.venv"
fi

"${APP_DIR}/.venv/bin/pip" install --upgrade pip
"${APP_DIR}/.venv/bin/pip" install -r "${APP_DIR}/cloud_server/requirements.txt"

systemctl daemon-reload
systemctl restart "${SERVICE_NAME}"

echo
echo "Service status:"
systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,12p'

echo
echo "Local health check:"
HEALTH_URL="http://127.0.0.1:8010/"
READY=0
for _ in $(seq 1 20); do
    if curl -fsS "${HEALTH_URL}" >/tmp/vocabbook-cloud-health.json 2>/dev/null; then
        READY=1
        break
    fi
    sleep 1
done

if [ "${READY}" -ne 1 ]; then
    echo "Service did not become ready within 20 seconds."
    echo
    echo "Service status:"
    systemctl --no-pager --full status "${SERVICE_NAME}" || true
    echo
    echo "Recent logs:"
    journalctl -u "${SERVICE_NAME}" -n 40 --no-pager || true
    exit 1
fi

cat /tmp/vocabbook-cloud-health.json
rm -f /tmp/vocabbook-cloud-health.json
echo

echo
if curl -fsS http://127.0.0.1:8010/openapi.json | grep -q '/admin/summary'; then
    echo "Admin routes: present"
else
    echo "Admin routes: missing"
fi

rm -rf "${STAGING_DIR}" "${PACKAGE_PATH}" /tmp/deploy_cloud_server_remote.sh
