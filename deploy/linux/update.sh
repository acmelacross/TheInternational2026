#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/ti2026-guide}"
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ $EUID -ne 0 ]]; then
  echo "请使用 root 运行：sudo bash deploy/linux/update.sh"
  exit 1
fi
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude='.env' --exclude='cache/' --exclude='deploy/' "$PROJECT_DIR/" "$APP_DIR/"
else
  cp -a "$PROJECT_DIR"/. "$APP_DIR"/
fi
chown -R ti2026:ti2026 "$APP_DIR"
systemctl restart ti2026-guide
systemctl --no-pager --full status ti2026-guide || true
