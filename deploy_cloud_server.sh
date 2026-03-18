#!/bin/bash

set -euo pipefail

SERVER_HOST="${SERVER_HOST:-8.137.163.86}"
SERVER_USER="${SERVER_USER:-root}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/vocabbook-cloud}"
SERVICE_NAME="${SERVICE_NAME:-vocabbook-cloud}"
PACKAGE_NAME="vocabbook-cloud-deploy.tar.gz"
PACKAGE_PATH="/tmp/${PACKAGE_NAME}"
REMOTE_HELPER="deploy_cloud_server_remote.sh"

echo "========================================"
echo "  VocabBook Cloud - Quick Deploy"
echo "  Server: ${SERVER_HOST} (api.historyai.fun)"
echo "========================================"
echo

if [ ! -f "cloud_server/main.py" ]; then
    echo "Error: run this script from the project root"
    exit 1
fi

echo "[1/4] Building deployment package..."
tar \
    --exclude='cloud_server/cloud_app.db' \
    --exclude='cloud_server/__pycache__' \
    --exclude='cloud_server/*.pyc' \
    --exclude='cloud_server/*.pyo' \
    --exclude='cloud_server/.pytest_cache' \
    -czf "${PACKAGE_PATH}" \
    cloud_server \
    deploy/nginx \
    deploy/systemd \
    docs/deploy/ALIYUN_CLOUDFLARE_DEPLOY.md

echo "[2/4] Uploading package to server..."
scp "${PACKAGE_PATH}" "${REMOTE_HELPER}" "${SERVER_USER}@${SERVER_HOST}:/tmp/"

echo "[3/4] Deploying remotely and restarting service..."
ssh "${SERVER_USER}@${SERVER_HOST}" "chmod +x /tmp/${REMOTE_HELPER} && /tmp/${REMOTE_HELPER} '${REMOTE_ROOT}' '${SERVICE_NAME}' '/tmp/${PACKAGE_NAME}'"

rm -f "${PACKAGE_PATH}"

echo
echo "[4/4] Deployment finished."
echo "Public URL: https://api.historyai.fun/"
