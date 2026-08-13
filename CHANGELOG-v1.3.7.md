# TI2026 Viewing Guide v1.3.7

## 模型 ID 修正

- Qwen3.8-Max 默认模型 ID 从 `qwen3.8-max-preview` 调整为 `qwen3.8-max`。
- Doubao-Seed-2.1-Pro 默认模型 ID 从 `doubao-seed-2.1-pro` 调整为 `doubao-seed-2-1-pro-260628`。
- .env.example 同步更新。
- AI 缓存策略升级：同一平台 + 同一模型 ID + 同一系列赛只调用一次；模型 ID 发生变化时允许新模型配置重新调用一次，从而不会被旧错误缓存阻塞。
- 不提交任何真实 API Key。
