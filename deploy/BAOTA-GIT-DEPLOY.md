# 宝塔面板 + Git 部署 TI2026

## 首次部署

```bash
cd /www/wwwroot
git clone https://github.com/acmelacross/TheInternational2026.git
cd TheInternational2026
```

将私有 `.env` 上传到：

```text
/www/wwwroot/TheInternational2026/.env
```

确认 Node.js 18/20+：

```bash
node -v
```

安装 systemd 服务：

```bash
bash deploy/linux/install.sh
```

检查：

```bash
systemctl status ti2026-guide
curl http://127.0.0.1:17826/api/health
```

## 宝塔网站反向代理

在宝塔：网站 -> 新建站点/对应站点 -> 反向代理。

目标 URL：

```text
http://127.0.0.1:17826
```

发送域名保持 `$host`，开启 WebSocket 兼容即可（本项目当前不依赖 WebSocket）。

## 后续 Git 更新

项目源码目录：

```bash
cd /www/wwwroot/TheInternational2026
```

推荐：

```bash
git fetch origin main
git reset --hard origin/main
bash deploy/linux/install.sh
```

也可以直接使用：

```bash
bash deploy/linux/baota-git-deploy.sh
```

脚本会保留运行目录中的 `.env` 和 `cache/`；AI 分析缓存不会因为发布新版本被删除。

## 日志

```bash
journalctl -u ti2026-guide -f
```

## API Key

真实 Key 只能放服务器 `.env`，不要上传 GitHub。仓库 `.gitignore` 已忽略 `.env`。
