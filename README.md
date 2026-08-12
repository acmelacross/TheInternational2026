# TI2026 上海观赛指南 v1.3.0

面向 The International 2026 上海赛事的本地/服务器观赛指南。v1.3 在 v1.2 的 Match ID、BP/Pick Ban、KDA、每场倒计时和中国战队高亮基础上，重做首页信息层级，加入顶部吸顶菜单，并将 16 支战队图片缓存到项目本地。

## v1.3 首页顺序

1. 中国战队赛程
2. 今日赛程
3. 瑞士轮战绩 + 赛制速读
4. 主赛事 / 淘汰赛
5. 完整赛程
6. 赛事日历
7. 中文直播入口
8. 中国战队与成员介绍
9. 16 支参赛战队

顶部增加二级吸顶导航，可直接跳到任意分区。手机端保留底部快速导航。

## v1.3 新增

- 16 支战队本地图片缓存：`public/assets/teams/*.webp`
- 今日赛程、中国队赛程、积分、主赛事、完整赛程和战队列表均显示战队图片
- 中国队继续使用 `🇨🇳 CN` 与 `CN FOCUS` 专属标识
- 每场比赛独立秒级倒计时
- 顶部吸顶菜单 + 当前分区高亮 + 返回顶部按钮
- 首页重新排序，中文直播入口移动到赛事日历之后
- Linux systemd 一键安装脚本
- Linux 更新脚本
- Nginx 反向代理模板
- Docker Compose 默认仅监听 `127.0.0.1:17826`，适合放在 Nginx 后面

## 保留的 v1.2 功能

- Liquipedia LPDB v3 自动赛程/比分数据源
- 无 API Key 时公共数据源 + 内置赛程降级
- 每场独立倒计时和开赛前 10 分钟浏览器提醒
- 比赛详情页
- 系列赛 ID / Game Match ID
- BP / Pick Ban
- KDA、等级、LH/DN、GPM/XPM、装备
- 瑞士轮积分动态计算
- 中国战队资料与成员介绍
- 中文直播入口

## Windows 运行

解压后双击：

```text
start.bat
```

浏览器打开：

```text
http://127.0.0.1:17826
```

项目没有第三方 npm 依赖，不需要执行 `npm install`。

## Linux 服务器部署：systemd + Nginx

推荐 Node.js 20 LTS，也兼容 Node.js 18+。

### 1. 解压并进入项目

```bash
unzip TI2026-Guide-v1.3.0.zip
cd TI2026-Guide-v1.3.0
```

### 2. 一键安装 systemd 服务

```bash
sudo bash deploy/linux/install.sh
```

默认安装到：

```text
/opt/ti2026-guide
```

服务名称：

```text
ti2026-guide
```

查看状态：

```bash
systemctl status ti2026-guide
```

查看日志：

```bash
journalctl -u ti2026-guide -f
```

健康检查：

```bash
curl http://127.0.0.1:17826/api/health
```

### 3. 配置 API Key

编辑：

```bash
sudo nano /opt/ti2026-guide/.env
```

填写：

```env
PORT=17826
LIQUIPEDIA_API_KEY=你的_API_KEY
CONTACT_EMAIL=你的邮箱
CACHE_TTL_SECONDS=300
GAME_DETAIL_TTL_SECONDS=300
PUBLIC_FALLBACK_ENABLED=true
APP_NAME=TI2026-Viewing-Guide
```

然后：

```bash
sudo systemctl restart ti2026-guide
```

### 4. Nginx

模板：

```text
deploy/nginx/ti2026-guide.conf
```

将：

```nginx
server_name ti.example.com;
```

改成你的域名，再复制到 Nginx 配置目录并 reload。

如果使用宝塔/1Panel，也可以直接新建反向代理：

```text
http://127.0.0.1:17826
```

HTTPS 交给宝塔/1Panel/Certbot 管理即可。

### 5. 后续更新源码

上传并解压新版源码后，在新版目录运行：

```bash
sudo bash deploy/linux/update.sh
```

脚本会保留服务器上的 `.env` 和 `cache/`，然后重启服务。

## Docker 部署

先创建 `.env`：

```bash
cp .env.example .env
```

启动：

```bash
docker compose up -d --build
```

默认只映射到：

```text
127.0.0.1:17826
```

建议再由 Nginx 对外提供 HTTPS。

## 本地战队图片

目录：

```text
public/assets/teams/
```

前端不直接请求外部图片地址，因此服务器即使暂时无法访问外部图片 CDN，也不影响已经缓存的战队图片显示。

每个队的图片路径由 `data/seed.json -> teamAssets` 管理。以后要换更高清或官方版本，只需要覆盖相同文件名，不必改页面代码。

Iron Wing 为特殊情况：当前包中的 `iron-wing.webp` 使用该阵容更名前的视觉素材作为本地兜底。以后拿到最终满意的 Iron Wing 官方赛事图，只覆盖这个文件即可。

## API

```text
GET  /api/health
GET  /api/ti2026
POST /api/refresh
GET  /api/match-details?id=<系列赛ID>
GET  /api/game-detail?matchid=<Dota2 Match ID>
```

## 数据缓存

- 主赛事数据缓存：默认 300 秒
- 单局 BP/KDA：默认 300 秒
- 手动刷新：30 秒保护
- 磁盘缓存：`cache/ti2026.json`
- 战队图片：项目静态本地缓存

## 测试

```bash
node -c server.js
node -c public/app.js
node -c public/match.js
node tests.js
```

## 版本

`v1.3.0`
