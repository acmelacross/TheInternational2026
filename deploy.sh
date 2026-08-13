#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="${SERVICE_NAME:-ti2026-guide}"
BRANCH="${BRANCH:-main}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:17826/api/health}"

log(){ printf '\n\033[1;36m[TI2026]\033[0m %s\n' "$*"; }
fail(){ printf '\n\033[1;31m[TI2026 ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "请使用 root 执行：sudo bash deploy.sh"
cd "$ROOT_DIR"
[[ -d .git ]] || fail "当前目录不是 Git 仓库：$ROOT_DIR"

install_packages(){
  local pkgs=("$@")
  if command -v dnf >/dev/null 2>&1; then dnf install -y "${pkgs[@]}"
  elif command -v yum >/dev/null 2>&1; then yum install -y "${pkgs[@]}"
  elif command -v apt-get >/dev/null 2>&1; then apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y "${pkgs[@]}"
  else fail "无法识别系统包管理器，请手动安装：${pkgs[*]}"; fi
}

command -v git >/dev/null 2>&1 || { log "未检测到 git，正在安装"; install_packages git; }
command -v rsync >/dev/null 2>&1 || { log "未检测到 rsync，正在安装"; install_packages rsync; }
command -v curl >/dev/null 2>&1 || { log "未检测到 curl，正在安装"; install_packages curl; }
command -v node >/dev/null 2>&1 || { log "未检测到 Node.js，正在尝试安装系统 Node.js"; install_packages nodejs; }

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if (( NODE_MAJOR < 18 )); then
  fail "当前 Node.js 版本 $(node -v 2>/dev/null || echo unknown) 过低，需要 Node.js 18/20+。请先在宝塔 Node 项目管理器或系统中升级。"
fi

log "项目目录：$ROOT_DIR"
log "Node：$(node -v) · Git：$(git --version | awk '{print $3}')"

# .env 被 .gitignore 忽略，不参与 pull；持久缓存位于 /var/lib/ti2026-guide。
if [[ ! -f .env ]]; then
  printf '\n\033[1;33m警告：项目根目录没有 .env。\033[0m\n'
  printf '如果 /opt/ti2026-guide/.env 已存在，install.sh 会继续保留运行配置；首次部署请先上传 .env。\n'
fi

# 不覆盖服务器上的 tracked 本地改动；避免误删手工文件。
DIRTY="$(git status --porcelain --untracked-files=no)"
if [[ -n "$DIRTY" ]]; then
  printf '%s\n' "$DIRTY"
  fail "检测到已跟踪文件存在本地修改。请先提交/还原这些修改，再执行 deploy.sh。"
fi

log "拉取 GitHub main 最新代码"
git fetch origin "$BRANCH"
git checkout "$BRANCH" >/dev/null 2>&1 || true
git pull --ff-only origin "$BRANCH"

log "当前源码版本：$(cat VERSION 2>/dev/null || echo unknown)"

log "部署到 /opt/ti2026-guide，并保留 .env 与 /var/lib/ti2026-guide 持久缓存"
bash deploy/linux/install.sh

log "重启服务：$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

log "等待健康检查"
OK=0
for i in $(seq 1 20); do
  if BODY="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)"; then
    echo "$BODY"
    OK=1
    break
  fi
  sleep 1
done

if [[ $OK -ne 1 ]]; then
  echo
  systemctl --no-pager --full status "$SERVICE_NAME" || true
  echo
  journalctl -u "$SERVICE_NAME" -n 80 --no-pager || true
  fail "部署已执行，但健康检查未通过：$HEALTH_URL"
fi

log "部署完成"
printf '源码目录：%s\n' "$ROOT_DIR"
printf '运行目录：/opt/ti2026-guide\n'
printf '持久缓存：/var/lib/ti2026-guide\n'
printf '版本：%s\n' "$(cat VERSION 2>/dev/null || echo unknown)"
printf '服务：%s\n' "$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"
printf '\n以后更新只需要：\n  cd %s\n  bash deploy.sh\n' "$ROOT_DIR"
