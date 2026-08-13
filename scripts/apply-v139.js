#!/usr/bin/env node
'use strict';
const fs=require('fs');
function rw(f,fn){const s=fs.readFileSync(f,'utf8');const o=fn(s);if(o===s)console.log('UNCHANGED',f);else{fs.writeFileSync(f,o);console.log('UPDATED',f)}}

rw('ai-service.js',t=>{
  // Provider-specific cache revisions: only Qwen/Kimi need one repair call.
  t=t.replace("const ANALYSIS_REVISION = 'team-intel-v1-20260813';", "const ANALYSIS_REVISION = 'team-intel-v1-20260813';\nconst FORMAT_REVISIONS = { qwen:'qwen-json-v2-20260813', kimi:'kimi-k3-output-v2-20260813' };\nfunction providerRevision(p){ return FORMAT_REVISIONS[p.id] || ANALYSIS_REVISION; }");

  // Robust text extraction for OpenAI-compatible variants without exposing reasoning_content as final answer.
  const oldExtract=`function extractText(json) {\n  const c = json?.choices?.[0]?.message?.content;\n  if (typeof c === 'string') return c;\n  if (Array.isArray(c)) return c.map(x => x?.text || x?.content || '').join('\\n').trim();\n  if (typeof json?.output_text === 'string') return json.output_text;\n  if (Array.isArray(json?.output)) {\n    return json.output.flatMap(item => Array.isArray(item?.content) ? item.content : [])\n      .map(x => x?.text || x?.content || '').filter(Boolean).join('\\n').trim();\n  }\n  if (typeof json?.result === 'string') return json.result;\n  return '';\n}`;
  const newExtract=`function extractText(json) {\n  const msg = json?.choices?.[0]?.message;\n  const c = msg?.content;\n  if (typeof c === 'string' && c.trim()) return c.trim();\n  if (Array.isArray(c)) {\n    const joined=c.map(x => {\n      if(typeof x==='string')return x;\n      if(typeof x?.text==='string')return x.text;\n      if(typeof x?.content==='string')return x.content;\n      if(typeof x?.text?.value==='string')return x.text.value;\n      return '';\n    }).filter(Boolean).join('\\n').trim();\n    if(joined)return joined;\n  }\n  if (typeof msg?.output_text === 'string' && msg.output_text.trim()) return msg.output_text.trim();\n  if (typeof json?.choices?.[0]?.text === 'string' && json.choices[0].text.trim()) return json.choices[0].text.trim();\n  if (typeof json?.output_text === 'string' && json.output_text.trim()) return json.output_text.trim();\n  if (Array.isArray(json?.output)) {\n    const joined=json.output.flatMap(item => Array.isArray(item?.content) ? item.content : [])\n      .map(x => typeof x==='string'?x:(x?.text?.value || x?.text || x?.content || '')).filter(Boolean).join('\\n').trim();\n    if(joined)return joined;\n  }\n  if (typeof json?.result === 'string' && json.result.trim()) return json.result.trim();\n  return '';\n}`;
  if(t.includes(oldExtract))t=t.replace(oldExtract,newExtract);

  // Better JSON recovery: strip fences, handle stringified JSON, find balanced first object.
  const oldParseStart=`function parseAnalysis(text) {\n  const raw = String(text || '').trim();\n  if (!raw) return null;\n  const candidates = [raw, raw.replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\`\`\`$/i, '').trim()];\n  const objMatch = raw.match(/\\{[\\s\\S]*\\}/);\n  if (objMatch) candidates.push(objMatch[0]);`;
  const newParseStart=`function extractBalancedJsonObject(raw){\n  let start=-1,depth=0,inString=false,escape=false;\n  for(let i=0;i<raw.length;i++){\n    const ch=raw[i];\n    if(start<0){if(ch==='{'){start=i;depth=1;}continue;}\n    if(inString){if(escape){escape=false;continue;}if(ch==='\\\\'){escape=true;continue;}if(ch==='\"')inString=false;continue;}\n    if(ch==='\"'){inString=true;continue;}\n    if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return raw.slice(start,i+1);\n  }\n  return '';\n}\nfunction parseAnalysis(text) {\n  const raw = String(text || '').trim();\n  if (!raw) return null;\n  const stripped=raw.replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\`\`\`\\s*$/i, '').trim();\n  const candidates = [raw, stripped];\n  const balanced=extractBalancedJsonObject(stripped);\n  if(balanced)candidates.push(balanced);\n  try{const once=JSON.parse(stripped);if(typeof once==='string')candidates.push(once);}catch(_){}`;
  if(t.includes(oldParseStart))t=t.replace(oldParseStart,newParseStart);

  // Structured output for Qwen; remove low max-token cap for Qwen and Kimi.
  t=t.replace("body:{ reasoning_effort:'medium' } },", "body:{ reasoning_effort:'medium', response_format:{type:'json_object'}, max_tokens:undefined } },");
  t=t.replace("body:{ reasoning_effort:'low' } },", "body:{ reasoning_effort:'low', max_tokens:undefined } },");

  // Make empty-content errors diagnostic when thinking consumed output.
  t=t.replace("const text=extractText(json); if(!text) throw new Error(`${p.vendor} 返回成功但没有可显示的文本内容`);", "const text=extractText(json); if(!text){const finish=json?.choices?.[0]?.finish_reason||json?.status||'unknown';const hasReasoning=Boolean(json?.choices?.[0]?.message?.reasoning_content);throw new Error(`${p.vendor} 返回成功但没有最终文本内容（finish_reason=${finish}${hasReasoning?'，存在 reasoning_content':''}）`);}");

  // Use provider-specific revision in cache checks and writes.
  t=t.replace(/c\.analysisRevision===ANALYSIS_REVISION/g, "c.analysisRevision===providerRevision(p)");
  t=t.replace(/latest\.models\?\.\[p\.id\]\?\.analysisRevision===ANALYSIS_REVISION/g, "latest.models?.[p.id]?.analysisRevision===providerRevision(p)");
  t=t.replace(/existing\.models\[p\.id\]\.analysisRevision!==ANALYSIS_REVISION/g, "existing.models[p.id].analysisRevision!==providerRevision(p)");
  t=t.replace("analysisRevision:ANALYSIS_REVISION,status:'ok'", "analysisRevision:providerRevision(p),status:'ok'");
  t=t.replace("analysisRevision:ANALYSIS_REVISION,status:'error'", "analysisRevision:providerRevision(p),status:'error'");
  t=t.replace("analysisRevision:ANALYSIS_REVISION,policy:'本地缓存优先；旧分析版本会在新情报管线启用后仅重算一次，随后永久读取持久缓存。'", "analysisRevision:ANALYSIS_REVISION,policy:'服务器本地缓存优先；同一场系列赛、同一模型、同一分析版本全站只调用一次。所有访客共享服务器缓存。'" );
  t=t.replace("policy:'缓存优先：每个模型在当前分析版本下每个系列赛最多调用一次；单次调用同时生成系列赛、逐局、选手状态、BP 与已核验公开关系背景分析。成功或失败均写入持久化本地缓存，刷新页面和重新部署不会重复调用。'", "policy:'服务器全局缓存：同一场系列赛 × 同一模型 × 同一分析版本，全站最多调用一次；所有访客共享 /var/lib/ti2026-guide 的持久缓存，刷新页面、多人访问和重新部署均不会重复消耗 Token。'" );
  return t;
});

rw('server.js',t=>{
  t=t.replace("const CACHE_TTL_MS = Math.max(60, Number(process.env.CACHE_TTL_SECONDS || 300)) * 1000;", "const AUTO_REFRESH_INTERVAL_MS = Math.max(3600, Number(process.env.AUTO_REFRESH_INTERVAL_SECONDS || 3600)) * 1000;\nconst CACHE_TTL_MS = Math.max(AUTO_REFRESH_INTERVAL_MS, Math.max(60, Number(process.env.CACHE_TTL_SECONDS || 3600)) * 1000);");
  t=t.replace("version: '1.3.8', dataDir: DATA_DIR, liquipediaConfigured", "version: '1.3.9', dataDir: DATA_DIR, autoRefreshSeconds: Math.round(AUTO_REFRESH_INTERVAL_MS/1000), liquipediaConfigured");
  const listenOld=`server.listen(PORT, '0.0.0.0', () => {\n  console.log(\`TI2026 观赛指南已启动: http://127.0.0.1:\${PORT}\`);\n  console.log(\`Liquipedia API Key: \${LIQUIPEDIA_API_KEY ? '已配置' : '未配置（当前使用降级模式）'}\`);\n});`;
  const listenNew=`server.listen(PORT, '0.0.0.0', () => {\n  console.log(\`TI2026 观赛指南已启动: http://127.0.0.1:\${PORT}\`);\n  console.log(\`Liquipedia API Key: \${LIQUIPEDIA_API_KEY ? '已配置' : '未配置（当前使用降级模式）'}\`);\n  console.log(\`赛程自动同步: 每 \${Math.round(AUTO_REFRESH_INTERVAL_MS/60000)} 分钟\`);\n  setTimeout(() => refresh(false).catch(err => console.error('[startup-refresh]', err)), 2000).unref();\n  setInterval(() => refresh(true).then(d => console.log('[auto-refresh]', d.generatedAt, d.source)).catch(err => console.error('[auto-refresh]', err)), AUTO_REFRESH_INTERVAL_MS).unref();\n});`;
  if(t.includes(listenOld))t=t.replace(listenOld,listenNew);
  return t;
});

rw('.env.example',t=>{
  t=t.replace('CACHE_TTL_SECONDS=300','CACHE_TTL_SECONDS=3600');
  if(!t.includes('AUTO_REFRESH_INTERVAL_SECONDS='))t=t.replace('CACHE_TTL_SECONDS=3600','CACHE_TTL_SECONDS=3600\nAUTO_REFRESH_INTERVAL_SECONDS=3600');
  return t;
});

rw('public/index.html',t=>t.replace(/v1\.3\.7/g,'v1.3.9').replace(/v1\.3\.8/g,'v1.3.9'));
rw('public/match.html',t=>t.replace(/v1\.3\.7/g,'v1.3.9').replace(/v1\.3\.8/g,'v1.3.9'));
fs.writeFileSync('VERSION','1.3.9\n');
fs.writeFileSync('CHANGELOG-v1.3.9.md',`# TI2026 Viewing Guide v1.3.9\n\n- 赛程改为服务端后台每 1 小时自动同步一次，不依赖访客打开网页。\n- 保留手动“刷新赛程”，继续使用 30 秒防重复保护。\n- Qwen3.8-Max 启用官方 JSON Mode，并去除容易截断结构化结果的 2200 max_tokens 限制。\n- JSON 解析增加 Markdown fence、字符串化 JSON、平衡括号提取等容错。\n- Kimi K3 去除 2200 token 低上限；兼容更多 OpenAI 响应 content 结构，并提供更明确的空最终输出诊断。\n- 仅 Qwen/Kimi 的旧格式缓存失效一次；DeepSeek、豆包、ERNIE、Hy3 已成功缓存不重新调用。\n- AI 结果继续保存在服务器 DATA_DIR/ai-analysis，默认 /var/lib/ti2026-guide/ai-analysis。\n- 同一系列赛 × 同一模型 × 同一分析版本由全站所有访客共享一份缓存，最多调用一次。\n`);
console.log('v1.3.9 patch complete');
