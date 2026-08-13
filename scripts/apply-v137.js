#!/usr/bin/env node
'use strict';
const fs = require('fs');

function rw(file, fn) {
  const src = fs.readFileSync(file, 'utf8');
  const out = fn(src);
  if (out === src) console.log(`UNCHANGED ${file}`); else console.log(`UPDATED ${file}`);
  fs.writeFileSync(file, out);
}

rw('ai-service.js', t => {
  t = t.replace(/model:envFirst\('QWEN_MODEL'\)\|\|'qwen3\.8-max-preview'/g, "model:envFirst('QWEN_MODEL')||'qwen3.8-max'");
  t = t.replace(/model:envFirst\('DOUBAO_MODEL'\)\|\|'doubao-seed-2\.1-pro'/g, "model:envFirst('DOUBAO_MODEL')||'doubao-seed-2-1-pro-260628'");
  t = t.replace(
    "const tasks=providers.filter(p=>p.key&&!existing.models[p.id]).map(p=>async()=>{",
    "const tasks=providers.filter(p=>p.key&&(!existing.models[p.id]||existing.models[p.id].model!==p.model)).map(p=>async()=>{"
  );
  t = t.replace(
    "policy:'每个模型每个系列赛最多调用一次；成功或失败结果均写入本地缓存，刷新页面不会重复调用。'",
    "policy:'每个平台的每个模型 ID、每个系列赛最多调用一次；成功或失败结果均写入本地缓存。若模型 ID 变更，则允许新模型配置重新调用一次并覆盖旧缓存。'"
  );
  return t;
});

rw('.env.example', t => t
  .replace('QWEN_MODEL=qwen3.8-max-preview', 'QWEN_MODEL=qwen3.8-max')
  .replace('DOUBAO_MODEL=doubao-seed-2.1-pro', 'DOUBAO_MODEL=doubao-seed-2-1-pro-260628')
  .replace('# 如控制台要求具体模型版本或 ep- 接入点，请覆盖 DOUBAO_MODEL\n', '# 当前按平台实际可用模型 ID 配置；如后续模型版本变化，请覆盖 DOUBAO_MODEL\n')
);

for (const file of ['public/index.html','public/match.html','server.js']) {
  rw(file, t => t.replace(/1\.3\.6/g, '1.3.7'));
}

fs.writeFileSync('VERSION', '1.3.7\n');
fs.writeFileSync('CHANGELOG-v1.3.7.md', `# TI2026 Viewing Guide v1.3.7\n\n## 模型 ID 修正\n\n- Qwen3.8-Max 默认模型 ID 从 \`qwen3.8-max-preview\` 调整为 \`qwen3.8-max\`。\n- Doubao-Seed-2.1-Pro 默认模型 ID 从 \`doubao-seed-2.1-pro\` 调整为 \`doubao-seed-2-1-pro-260628\`。\n- .env.example 同步更新。\n- AI 缓存策略升级：同一平台 + 同一模型 ID + 同一系列赛只调用一次；模型 ID 发生变化时允许新模型配置重新调用一次，从而不会被旧错误缓存阻塞。\n- 不提交任何真实 API Key。\n`);

console.log('v1.3.7 model ID patch complete');
