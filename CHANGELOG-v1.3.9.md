# TI2026 Viewing Guide v1.3.9

- 赛程改为服务端后台每 1 小时自动同步一次，不依赖访客打开网页。
- 保留手动“刷新赛程”，继续使用 30 秒防重复保护。
- Qwen3.8-Max 启用官方 JSON Mode，并去除容易截断结构化结果的 2200 max_tokens 限制。
- JSON 解析增加 Markdown fence、字符串化 JSON、平衡括号提取等容错。
- Kimi K3 去除 2200 token 低上限；兼容更多 OpenAI 响应 content 结构，并提供更明确的空最终输出诊断。
- 仅 Qwen/Kimi 的旧格式缓存失效一次；DeepSeek、豆包、ERNIE、Hy3 已成功缓存不重新调用。
- AI 结果继续保存在服务器 DATA_DIR/ai-analysis，默认 /var/lib/ti2026-guide/ai-analysis。
- 同一系列赛 × 同一模型 × 同一分析版本由全站所有访客共享一份缓存，最多调用一次。
