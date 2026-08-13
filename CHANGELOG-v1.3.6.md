# TI2026 Viewing Guide v1.3.6

- 删除首页“中国战队资料”整个模块及导航入口。
- 删除前端对应 renderChinaProfiles 调用，避免空节点错误。
- 页脚新增技术支持：布尔信息科技(山东)有限公司，并链接 https://buer.top。
- 强化 .gitignore：忽略 .env 与 .env.*，显式保留 .env.example。
- 保持服务器私有 API Key 文件不进入 Git 仓库。
