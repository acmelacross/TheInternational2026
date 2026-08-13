#!/usr/bin/env node
'use strict';
const fs=require('fs');
function rw(f,fn){const s=fs.readFileSync(f,'utf8');const o=fn(s);if(o===s)throw new Error(`No change: ${f}`);fs.writeFileSync(f,o);console.log('UPDATED',f)}

rw('ai-service.js',t=>{
  t=t.replace('function createAiService({ root }) {\n  const cacheDir = path.join(root, \'cache\', \'ai-analysis\');\n  const statusPath = path.join(root, \'cache\', \'ai-model-status.json\');',"function createAiService({ root, dataDir }) {\n  const runtimeDir = dataDir || path.join(root, 'cache');\n  const cacheDir = path.join(runtimeDir, 'ai-analysis');\n  const statusPath = path.join(runtimeDir, 'ai-model-status.json');");
  t=t.replace('const payload={seriesId:String(m.id||\'\'),startsAt:m.startsAt,stage:m.stage,bestOf,status:m.status,teams:m.teams,matchIds:context.matchIds||[],games:(context.games||[]).map(compactGame),verifiedPublicRelationshipContext:verifiedRelationshipContext(m)};',"const payload={seriesId:String(m.id||''),startsAt:m.startsAt,stage:m.stage,bestOf,status:m.status,teams:m.teams,matchIds:context.matchIds||[],games:(context.games||[]).map(compactGame),teamIntel:context.teamIntel||null,verifiedPublicRelationshipContext:verifiedRelationshipContext(m)};");
  t=t.replace('3. 选手状态只能根据输入里的真实统计，不要凭空声称“最近状态火热/低迷”。', '3. 选手状态优先使用 teamIntel 中的固定阵容、教练、2026 赛季战绩、recentForm、playerStats 和 heroPool；数据仍不足时再明确写数据不足，不要凭空补数据。');
  const marker='  async function analyzeOnce(context){';
  const insert=`  function getCachedAnalysis(seriesId, match) {\n    const id=String(seriesId||'').trim();\n    if(!id)return{found:false,complete:false,seriesId:null,models:[]};\n    const latest=readJson(cachePath(id),null);\n    const providers=providerList();\n    if(!latest)return{found:false,complete:false,seriesId:id,models:[],aggregate:null};\n    const models=providers.map(p=>{\n      const c=latest.models?.[p.id];\n      if(c&&c.model===p.model)return{...c,cached:true,configured:Boolean(p.key)};\n      return{id:p.id,name:p.name,vendor:p.vendor,model:p.model,status:p.key?'untested':'unconfigured',connected:false,cached:false,configured:Boolean(p.key),error:p.key?null:'未配置 API Key'};\n    });\n    const configured=providers.filter(p=>p.key);\n    const complete=configured.every(p=>latest.models?.[p.id]?.model===p.model);\n    return{found:true,complete,seriesId:id,generatedAt:latest.generatedAt,updatedAt:latest.updatedAt,models,aggregate:aggregate(latest.models||{},match||{}),policy:'本地缓存优先；已缓存模型不会重复调用。'};\n  }\n`;
  if(!t.includes('function getCachedAnalysis('))t=t.replace(marker,insert+marker);
  t=t.replace("return{getStatus,analyzeOnce,configuredCount};","return{getStatus,getCachedAnalysis,analyzeOnce,configuredCount};");
  t=t.replace("cacheFile:`cache/ai-analysis/${path.basename(file)}`","cacheFile:`${cacheDir}/${path.basename(file)}`");
  t=t.replace('每个模型每个系列赛最多调用一次；单次调用同时生成系列赛、逐局、选手状态、BP 与已核验公开关系背景分析。成功或失败均写入本地缓存，刷新页面不会重复调用。','缓存优先：每个模型每个系列赛最多调用一次；单次调用同时生成系列赛、逐局、选手状态、BP 与已核验公开关系背景分析。成功或失败均写入持久化本地缓存，刷新页面和重新部署不会重复调用。');
  return t;
});

rw('server.js',t=>{
  t=t.replace("const { createAiService } = require('./ai-service');","const { createAiService } = require('./ai-service');\nconst { createTeamIntelService } = require('./team-intel-service');");
  t=t.replace("const PUBLIC_DIR = path.join(ROOT, 'public');\nconst SEED_PATH = path.join(ROOT, 'data', 'seed.json');\nconst CACHE_PATH = path.join(ROOT, 'cache', 'ti2026.json');\n\nloadDotEnv(path.join(ROOT, '.env'));","const PUBLIC_DIR = path.join(ROOT, 'public');\nconst SEED_PATH = path.join(ROOT, 'data', 'seed.json');\n\nloadDotEnv(path.join(ROOT, '.env'));\nconst DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'cache'));\nconst CACHE_PATH = path.join(DATA_DIR, 'ti2026.json');\nfs.mkdirSync(DATA_DIR, { recursive: true });");
  t=t.replace("const aiService = createAiService({ root: ROOT });","const aiService = createAiService({ root: ROOT, dataDir: DATA_DIR });\nconst teamIntelService = createTeamIntelService({ root: ROOT, dataDir: DATA_DIR });");
  t=t.replace("version: '1.3.5', liquipediaConfigured", "version: '1.3.8', dataDir: DATA_DIR, liquipediaConfigured");
  const statusBlock="    if (u.pathname === '/api/ai/status') {\n      const seriesId = u.searchParams.get('id');\n      return sendJson(res, 200, aiService.getStatus(seriesId));\n    }";
  const statusNew=statusBlock+"\n    if (u.pathname === '/api/ai/cache') {\n      const seriesId = u.searchParams.get('id');\n      const data = await refresh(false);\n      const match = (data.matches || []).find(m => String(m.id) === String(seriesId));\n      return sendJson(res, 200, aiService.getCachedAnalysis(seriesId, match || null));\n    }";
  t=t.replace(statusBlock,statusNew);
  t=t.replace("      const result = await aiService.analyzeOnce({ match, matchIds, games });","      const teamIntel = await teamIntelService.getMatchIntel(match).catch(err => ({ error: err.message, teams: [] }));\n      const result = await aiService.analyzeOnce({ match, matchIds, games, teamIntel });");
  const matchDetailsMarker="    if (u.pathname === '/api/match-details') {";
  const intelRoute="    if (u.pathname === '/api/team-intel') {\n      const seriesId = u.searchParams.get('id');\n      const data = await refresh(false);\n      const match = (data.matches || []).find(m => String(m.id) === String(seriesId));\n      if (!match) return sendJson(res, 404, { error: 'match_not_found' });\n      return sendJson(res, 200, await teamIntelService.getMatchIntel(match));\n    }\n";
  if(!t.includes("'/api/team-intel'"))t=t.replace(matchDetailsMarker,intelRoute+matchDetailsMarker);
  return t;
});

rw('public/ai-analysis.js',t=>{
  const old=`  async function loadAnalysis(){\n    if(!seriesId) return;\n    const grid=$('#aiAnalysisGrid'); const note=$('#aiAnalysisState');\n    if(note) note.textContent='正在读取缓存；若本场尚未分析，将对已配置的模型各调用一次。';\n    if(grid) grid.innerHTML='<div class=\"ai-loading\"><span></span><b>多模型分析中</b><p>首次生成可能需要几十秒，之后刷新只读取本地缓存。</p></div>';\n    try{\n      const r=await fetch(\`/api/ai/analysis?id=\${encodeURIComponent(seriesId)}\`,{method:'POST',cache:'no-store'}); const d=await r.json();\n      if(!r.ok) throw new Error(d.message||d.error||\`HTTP \${r.status}\`);\n      if(grid) grid.innerHTML=(d.models||[]).map(analysisCard).join('');\n      renderConsensus(d);\n      if(note) note.textContent=d.policy||'分析结果已缓存。';\n      await loadStatus();\n    }catch(e){ if(grid) grid.innerHTML=\`<div class=\"empty\">AI 分析读取失败：\${esc(e.message)}</div>\`; if(note) note.textContent='AI 分析服务异常'; }\n  }`;
  const neu=`  function renderAnalysis(d){\n    const grid=$('#aiAnalysisGrid'); const note=$('#aiAnalysisState');\n    if(grid) grid.innerHTML=(d.models||[]).map(analysisCard).join('');\n    renderConsensus(d);\n    if(note) note.textContent=d.policy||'分析结果已缓存。';\n  }\n  async function loadAnalysis(){\n    if(!seriesId) return;\n    const grid=$('#aiAnalysisGrid'); const note=$('#aiAnalysisState');\n    try{\n      const cr=await fetch(\`/api/ai/cache?id=\${encodeURIComponent(seriesId)}\`,{cache:'no-store'});\n      const cached=await cr.json();\n      if(cr.ok&&cached.found){\n        renderAnalysis(cached);\n        if(cached.complete){ if(note)note.textContent='已直接读取持久化本地缓存，本次没有调用任何大模型 API。'; await loadStatus(); return; }\n        if(note)note.textContent='已先显示本地缓存；仅补齐尚未缓存或模型 ID 已变化的平台。';\n      }else{\n        if(note)note.textContent='本场暂无本地分析缓存，将对已配置模型各调用一次并永久缓存。';\n        if(grid)grid.innerHTML='<div class=\"ai-loading\"><span></span><b>首次生成多模型分析</b><p>仅首次可能需要几十秒，完成后部署/刷新都直接读取本地缓存。</p></div>';\n      }\n      const r=await fetch(\`/api/ai/analysis?id=\${encodeURIComponent(seriesId)}\`,{method:'POST',cache:'no-store'}); const d=await r.json();\n      if(!r.ok) throw new Error(d.message||d.error||\`HTTP \${r.status}\`);\n      renderAnalysis(d);\n      await loadStatus();\n    }catch(e){ if(grid&&!grid.children.length) grid.innerHTML=\`<div class=\"empty\">AI 分析读取失败：\${esc(e.message)}</div>\`; if(note) note.textContent='AI 分析服务异常'; }\n  }`;
  if(!t.includes(old))throw new Error('ai-analysis block not found');
  return t.replace(old,neu);
});

rw('.env.example',t=>{
  if(t.includes('DATA_DIR='))return t;
  return t.replace('PORT=17826\n','PORT=17826\n\n# 持久化运行数据：部署/更新代码时不删除\nDATA_DIR=/var/lib/ti2026-guide\nTEAM_INTEL_TTL_SECONDS=21600\nOPENDOTA_API_KEY=\nOPENDOTA_BASE_URL=https://api.opendota.com/api\nOPENDOTA_DETAIL_MATCHES=6\n');
});

rw('deploy/systemd/ti2026-guide.service',t=>t.replace('ReadWritePaths=/opt/ti2026-guide/cache','ReadWritePaths=/opt/ti2026-guide/cache /var/lib/ti2026-guide'));

rw('deploy/linux/install.sh',t=>{
  t=t.replace('mkdir -p "$APP_DIR" "$APP_DIR/cache"','DATA_DIR="${DATA_DIR:-/var/lib/ti2026-guide}"\nmkdir -p "$APP_DIR" "$APP_DIR/cache" "$DATA_DIR"');
  t=t.replace('chown -R ti2026:ti2026 "$APP_DIR"','if [[ -d "$APP_DIR/cache" && -z "$(find "$DATA_DIR" -mindepth 1 -print -quit 2>/dev/null)" ]]; then\n  cp -a "$APP_DIR/cache"/. "$DATA_DIR"/ 2>/dev/null || true\nfi\nif ! grep -q \'^DATA_DIR=\' "$APP_DIR/.env" 2>/dev/null; then echo "DATA_DIR=$DATA_DIR" >> "$APP_DIR/.env"; fi\nchown -R ti2026:ti2026 "$APP_DIR" "$DATA_DIR"');
  t=t.replace('chmod 700 "$APP_DIR/cache"','chmod 700 "$APP_DIR/cache" "$DATA_DIR"');
  return t;
});

fs.writeFileSync('VERSION','1.3.8\n');
fs.writeFileSync('CHANGELOG-v1.3.8.md',`# TI2026 Viewing Guide v1.3.8\n\n- AI 详情页改为 cache-first：先读取本地持久缓存，缓存完整时不再显示“多模型分析中”，也不发起模型请求。\n- AI 与战队情报缓存迁移到 DATA_DIR（Linux 默认 /var/lib/ti2026-guide），代码重新部署不会删除。\n- 新增 TI2026 16 队固定参赛阵容/教练数据。\n- 新增 2026 赛季赛事基线，来源于用户上传的赛事库截图。\n- 新增 OpenDota 战队情报层：2026 战绩、最近比赛、当前参赛选手映射、近期详细比赛 KDA/GPM/XPM、英雄池。\n- 每个模型单次调用会同时收到系列赛数据、固定阵容/教练和缓存后的近期战队/选手统计。\n- 新增 /api/ai/cache 与 /api/team-intel 调试接口。\n`);
console.log('v1.3.8 patch done');
