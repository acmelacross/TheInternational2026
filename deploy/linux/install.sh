#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ti2026-guide}"
SERVICE_NAME="ti2026-guide"
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
NODE_BIN="$(command -v node || true)"

if [[ $EUID -ne 0 ]]; then
  echo "请使用 root 运行：sudo bash deploy/linux/install.sh"
  exit 1
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "未检测到 Node.js。请先安装 Node.js 18/20+。"
  exit 1
fi

if ! id ti2026 >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin ti2026
fi
mkdir -p "$APP_DIR" "$APP_DIR/cache"

# 保留服务器已有 .env 与 cache，更新其余程序文件。
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude='.env' --exclude='cache/' --exclude='deploy/' "$PROJECT_DIR/" "$APP_DIR/"
else
  find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'cache' -exec rm -rf {} +
  cp -a "$PROJECT_DIR"/. "$APP_DIR"/
  rm -rf "$APP_DIR/deploy"
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$PROJECT_DIR/.env.example" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "已创建 $APP_DIR/.env，请稍后填写 Liquipedia API Key。"
fi

chown -R ti2026:ti2026 "$APP_DIR"
chmod 750 "$APP_DIR"
chmod 700 "$APP_DIR/cache"
chmod 600 "$APP_DIR/.env" || true

sed "s|__NODE_BIN__|$NODE_BIN|g" "$PROJECT_DIR/deploy/systemd/ti2026-guide.service" > "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

sleep 1
echo
systemctl --no-pager --full status "$SERVICE_NAME" || true
echo
echo "安装完成。"
echo "本机访问: http://127.0.0.1:17826"
echo "健康检查: curl http://127.0.0.1:17826/api/health"
echo "Nginx 模板: $PROJECT_DIR/deploy/nginx/ti2026-guide.conf"
