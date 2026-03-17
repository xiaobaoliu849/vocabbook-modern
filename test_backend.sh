#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="$ROOT_DIR/.venv/bin/python"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "[ERROR] Missing project virtual environment: $PYTHON_BIN" >&2
  echo "Create it with: python3 -m venv .venv" >&2
  echo "Then install backend dev dependencies with: $PYTHON_BIN -m pip install -r backend/requirements-dev.txt" >&2
  exit 1
fi

cd "$ROOT_DIR"
exec "$PYTHON_BIN" -m pytest "$@"
