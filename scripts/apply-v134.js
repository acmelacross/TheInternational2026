#!/usr/bin/env node
'use strict';
const fs=require('fs');
function rw(file,fn){const src=fs.readFileSync(file,'utf8');const out=fn(src);if(out===src)console.log('UNCHANGED',file);else console.log('UPDATED',file);fs.writeFileSync(file,out)}

rw('public/index.html',t=>{
  t=t.replace(/v1\.3\.3/g,'v1.3.4');
  if(!t.includes('/v134.css')) t=t.replace('<link rel="stylesheet" href="/v133.css" />','<link rel="stylesheet" href="/v133.css" />\n  <link rel="stylesheet" href="/v134.css" />');
  t=t.replace(/\n\s*<p class="hero-desc">北京时间统一展示。每场比赛都有独立秒级倒计时；战队图片使用项目本地缓存；比赛开始后可继续进入详情页查看 Match ID、BP\/Pick Ban、KDA、GPM\/XPM 等逐局数据。<\/p>/,'');
  t=t.replace('<span>💾 战队图本地缓存</span>','');
  return t;
});

rw('public/match.html',t=>{
  t=t.replace(/v1\.3\.3/g,'v1.3.4');
  if(!t.includes('/v134.css')) t=t.replace('<link rel="stylesheet" href="/v133.css" />','<link rel="stylesheet" href="/v133.css" />\n  <link rel="stylesheet" href="/v134.css" />');
  if(!t.includes('id="aiAnalysisSection"')){
    const ai=`\n    <section class="section ai-analysis-section" id="aiAnalysisSection">\n      <div class="section-heading">\n        <div><span class="kicker">AI MODEL ANALYSIS</span><h2>多模型比赛分析</h2><p class="section-desc">Qwen3.8-Max · DeepSeek-V4-Pro · Kimi K3 · Doubao-Seed-2.1-Pro · ERNIE 5.1 · Hy3</p></div>\n        <div class="ai-section-tools"><span class="ai-once-badge">每个模型每场只调用一次 · 本地缓存</span></div>\n      </div>\n      <div id="aiModelStatus" class="ai-model-status"><div class="empty">正在读取模型状态...</div></div>\n      <div id="aiConsensus" class="ai-consensus"><div class="ai-consensus-empty">等待多模型分析结果</div></div>\n      <p id="aiAnalysisState" class="ai-analysis-state">正在准备 AI 分析...</p>\n      <div id="aiAnalysisGrid" class="ai-analysis-grid"><div class="empty">等待分析</div></div>\n    </section>\n`;
    t=t.replace('    <section class="section detail-section">',ai+'\n    <section class="section detail-section">');
  }
  t=t.replace('<b>数据说明</b>\n      <p>系列赛赛程/逐局 Match ID 优先由 Liquipedia LPDB v3 提供；每个 Game 的 Pick/Ban、KDA、GPM/XPM、补刀和装备通过 Liquipedia Dota2DB 接口读取。Match ID 尚未发布时本页会保留并自动等待数据。</p>','<b>观赛提示</b>\n      <p>数据与预测仅供娱乐参考，比赛胜负最终取决于选手临场发挥、版本理解与团队状态。本指南不建议、不支持任何形式的菠菜或博彩行为，请理性观赛、快乐看比赛。祝 CN Dota 在 TI2026 取得好成绩！</p>');
  if(!t.includes('/ai-analysis.js')) t=t.replace('<script src="/match.js"></script>','<script src="/match.js"></script>\n  <script src="/ai-analysis.js"></script>');
  return t;
});

rw('server.js',t=>{
  if(!t.includes("require('./ai-service')")) t=t.replace("const { URL, URLSearchParams } = require('url');","const { URL, URLSearchParams } = require('url');\nconst { createAiService } = require('./ai-service');");
  if(!t.includes('const aiService = createAiService')) t=t.replace("const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));","const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));\nconst aiService = createAiService({ root: ROOT });");
  t=t.replace("version: '1.3.0', liquipediaConfigured: Boolean(LIQUIPEDIA_API_KEY)","version: '1.3.4', liquipediaConfigured: Boolean(LIQUIPEDIA_API_KEY), aiProvidersConfigured: aiService.configuredCount()");
  if(!t.includes("u.pathname === '/api/ai/status'")){
    const routes=`    if (u.pathname === '/api/ai/status') {\n      const seriesId = u.searchParams.get('id');\n      return sendJson(res, 200, aiService.getStatus(seriesId));\n    }\n    if (u.pathname === '/api/ai/analysis' && (req.method === 'POST' || req.method === 'GET')) {\n      const seriesId = u.searchParams.get('id');\n      const data = await refresh(false);\n      const match = (data.matches || []).find(m => String(m.id) === String(seriesId));\n      if (!match) return sendJson(res, 404, { error: 'match_not_found' });\n      const matchIds = Array.from(new Set([...(match.matchIds || []), ...extractMatchIds(match.games || [])]));\n      const games = [];\n      for (const matchId of matchIds.slice(0, 5)) {\n        try { games.push({ ok: true, data: await fetchDota2Game(matchId) }); }\n        catch (err) { games.push({ ok: false, matchId, error: err.message }); }\n      }\n      const result = await aiService.analyzeOnce({ match, matchIds, games });\n      return sendJson(res, 200, result);\n    }\n`;
    t=t.replace("    if (u.pathname === '/api/match-details') {",routes+"    if (u.pathname === '/api/match-details') {");
  }
  return t;
});

const env=`# 服务端口\nPORT=17826\n\n# Liquipedia LPDB v3\nLIQUIPEDIA_API_KEY=\nCONTACT_EMAIL=\nCACHE_TTL_SECONDS=300\nGAME_DETAIL_TTL_SECONDS=300\nPUBLIC_FALLBACK_ENABLED=true\nAPP_NAME=TI2026-Viewing-Guide\n\n# ===============================\n# 比赛详情页：多模型分析\n# 真实 Key 只填服务器 .env，禁止提交 GitHub\n# ===============================\n\n# 阿里云百炼 / Qwen3.8-Max\nQWEN_API_KEY=\nQWEN_MODEL=qwen3.8-max-preview\nQWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1\n\n# DeepSeek 官方 API\nDEEPSEEK_API_KEY=\nDEEPSEEK_MODEL=deepseek-v4-pro\nDEEPSEEK_BASE_URL=https://api.deepseek.com\n\n# Moonshot / Kimi K3\nKIMI_API_KEY=\nKIMI_MODEL=kimi-k3\nKIMI_BASE_URL=https://api.moonshot.cn/v1\n\n# 火山方舟 / Doubao-Seed-2.1-Pro\n# 如控制台要求具体模型版本或 ep- 接入点，请覆盖 DOUBAO_MODEL\nDOUBAO_API_KEY=\nDOUBAO_MODEL=doubao-seed-2.1-pro\nDOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3\n\n# 百度千帆 / ERNIE 5.1\nERNIE_API_KEY=\nERNIE_MODEL=ernie-5.1\nERNIE_BASE_URL=https://qianfan.baidubce.com/v2\n\n# 腾讯云 TokenHub / Hy3\nHY3_API_KEY=\nHY3_MODEL=hy3\nHY3_BASE_URL=https://tokenhub.tencentmaas.com/v1\n`;
fs.writeFileSync('.env.example',env);
let gi=fs.readFileSync('.gitignore','utf8');if(!gi.includes('cache/ai-analysis/'))gi+='cache/ai-analysis/\n';fs.writeFileSync('.gitignore',gi);
fs.writeFileSync('VERSION','1.3.4\n');
fs.writeFileSync('CHANGELOG-v1.3.4.md',`# TI2026 Viewing Guide v1.3.4\n\n- 去掉战队 Logo 外框，只保留柔和半透明背景。\n- 首页移除“北京时间统一展示/战队图本地缓存/详情数据说明”长文案及“战队图本地缓存”标签。\n- 比赛详情页新增 6 模型分析：Qwen3.8-Max、DeepSeek-V4-Pro、Kimi K3、Doubao-Seed-2.1-Pro、ERNIE 5.1、Hy3。\n- 每个模型每个系列赛最多调用一次，成功或失败结果均写入 cache/ai-analysis/ 本地缓存，刷新页面不重复调用。\n- 新增模型连通状态显示；失败时展示经过脱敏的 HTTP/接口错误原因。\n- 多模型结果增加本地多数票综合倾向，不额外调用模型。\n- API Key 全部从 .env / Linux 环境变量读取，不写入公开 GitHub 仓库。\n- 比赛详情页底部说明替换为娱乐观赛及反博彩提示。\n- 保留用户 2026-08-13 手工上传的战队图片，不运行自动 Logo 刷新。\n`);
console.log('v1.3.4 patch complete');
