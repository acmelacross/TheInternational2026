#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/acmelacross/TheInternational2026.git}"
WORK_DIR="${WORK_DIR:-/www/wwwroot/TheInternational2026}"
BRANCH="${BRANCH:-main}"

if [[ $EUID -ne 0 ]]; then
  echo "请使用 root 运行：sudo bash deploy/linux/baota-git-deploy.sh"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "未检测到 git，请先安装：yum install -y git 或 apt install -y git"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js 18/20+，请先在宝塔软件商店/Node 项目管理器安装。"
  exit 1
fi

mkdir -p "$(dirname "$WORK_DIR")"
if [[ ! -d "$WORK_DIR/.git" ]]; then
  git clone -b "$BRANCH" "$REPO_URL" "$WORK_DIR"
else
  cd "$WORK_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

cd "$WORK_DIR"
mkdir -p cache/ai-analysis
chmod 700 cache || true

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo "已创建 $WORK_DIR/.env，请先填写 API Key，再执行：bash deploy/linux/install.sh"
  exit 0
fi

bash deploy/linux/install.sh

echo
echo "部署/更新完成"
echo "项目源码：$WORK_DIR"
echo "运行目录：/opt/ti2026-guide"
echo "健康检查：curl http://127.0.0.1:17826/api/health"
