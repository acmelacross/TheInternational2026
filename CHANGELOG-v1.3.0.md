# v1.3.0 变更记录

- 首页信息顺序调整为：中国战队赛程 → 今日赛程 → 瑞士轮战绩/赛制 → 主赛事 → 完整赛程 → 赛事日历 → 中文直播。
- 新增顶部吸顶分区导航，支持当前分区高亮与平滑跳转。
- 新增返回顶部按钮；手机端继续提供快速导航。
- 16 支战队图片缓存至 `public/assets/teams/`，页面运行不再依赖战队图片外链。
- 战队图应用到比赛卡片、瑞士轮战绩、主赛事、完整赛程、中国战队资料、16 队列表。
- 保留中国战队 `🇨🇳 CN` / `CN FOCUS` 高亮。
- 保留每场独立秒级倒计时、比赛提醒、Match ID、BP/Pick Ban、KDA 比赛详情页。
- 新增 TI2026 特殊队名别名归一：1w/Tundra → Iron Wing、PARIVISION → Team VISION、BetBoom → BoomBoys、L1GA → HULIGANI。
- 新增 Linux systemd 一键安装与更新脚本。
- 新增 Nginx 反向代理模板。
- Docker Compose 默认仅绑定 `127.0.0.1:17826`，便于放到 Nginx/HTTPS 后面。
