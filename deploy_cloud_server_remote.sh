#!/bin/bash

set -euo pipefail

APP_DIR="${1:-/var/www/vocabbook-cloud}"
SERVICE_NAME="${2:-vocabbook-cloud}"
PACKAGE_PATH="${3:-/tmp/vocabbook-cloud-deploy.tar.gz}"
STAGING_DIR="/tmp/vocabbook-cloud-deploy"
BACKUP_ROOT="${APP_DIR}/deploy_backups"
BACKUP_DIR="${BACKUP_ROOT}/$(date +%Y%m%d%H%M%S)"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"
DEPLOY_SUCCEEDED=0

print_diagnostics() {
    echo
    echo "Service status:"
    systemctl --no-pager --full status "${SERVICE_NAME}" || true
    echo
    echo "Recent logs:"
    journalctl -u "${SERVICE_NAME}" -n 80 --no-pager || true
}

cleanup() {
    rm -rf "${STAGING_DIR}" "${PACKAGE_PATH}" /tmp/deploy_cloud_server_remote.sh
}

rollback() {
    if [ "${DEPLOY_SUCCEEDED}" -eq 1 ]; then
        return
    fi
    if [ ! -d "${BACKUP_DIR}" ]; then
        return
    fi

    echo
    echo "Deployment failed; rolling back from ${BACKUP_DIR}"
    for name in cloud_server deploy scripts docs; do
        rm -rf "${APP_DIR}/${name}"
        if [ -d "${BACKUP_DIR}/${name}" ]; then
            mkdir -p "${APP_DIR}/${name}"
            cp -rf "${BACKUP_DIR}/${name}/." "${APP_DIR}/${name}/"
        fi
    done
    systemctl daemon-reload || true
    systemctl restart "${SERVICE_NAME}" || true
    print_diagnostics
}

trap 'rollback; cleanup' EXIT

mkdir -p "${APP_DIR}" "${BACKUP_ROOT}"
rm -rf "${STAGING_DIR}"
mkdir -p "${STAGING_DIR}" "${BACKUP_DIR}"

tar -xzf "${PACKAGE_PATH}" -C "${STAGING_DIR}"

for name in cloud_server deploy scripts docs; do
    if [ -d "${APP_DIR}/${name}" ]; then
        mkdir -p "${BACKUP_DIR}/${name}"
        cp -rf "${APP_DIR}/${name}/." "${BACKUP_DIR}/${name}/"
    fi
done

mkdir -p "${APP_DIR}/cloud_server"
cp -rf "${STAGING_DIR}/cloud_server/." "${APP_DIR}/cloud_server/"

if [ -d "${STAGING_DIR}/deploy" ]; then
    mkdir -p "${APP_DIR}/deploy"
    cp -rf "${STAGING_DIR}/deploy/." "${APP_DIR}/deploy/"
fi

if [ -d "${STAGING_DIR}/scripts" ]; then
    mkdir -p "${APP_DIR}/scripts"
    cp -rf "${STAGING_DIR}/scripts/." "${APP_DIR}/scripts/"
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
echo "Local deployment check:"
CHECK_ARGS="--base-url http://127.0.0.1:8010 --expect-production"
if [ -n "${DEPLOY_ADMIN_TOKEN:-}" ]; then
    CHECK_ARGS="${CHECK_ARGS} --admin-token ${DEPLOY_ADMIN_TOKEN}"
else
    echo "DEPLOY_ADMIN_TOKEN is not set; payment readiness positive check will be skipped."
fi
READY=0
for _ in $(seq 1 20); do
    if "${APP_DIR}/.venv/bin/python" "${APP_DIR}/scripts/cloud_deploy_check.py" ${CHECK_ARGS}; then
        READY=1
        break
    fi
    sleep 1
done

if [ "${READY}" -ne 1 ]; then
    echo "Service did not become ready within 20 seconds."
    exit 1
fi

DEPLOY_SUCCEEDED=1

if [ "${KEEP_BACKUPS}" -gt 0 ]; then
    find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -rf
fi

echo
echo "Deployment succeeded. Backup kept at ${BACKUP_DIR}"
