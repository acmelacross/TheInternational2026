'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function cleanBase(v) { return String(v || '').replace(/\/+$/, ''); }
function envFirst(...names) {
  for (const n of names) {
    const v = String(process.env[n] || '').trim();
    if (v) return v;
  }
  return '';
}
function safeFileKey(v) { return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 32); }
function redact(text) {
  return String(text || '')
    .replace(/sk-[A-Za-z0-9._-]{12,}/g, 'sk-***')
    .replace(/bce-v3\/[A-Za-z0-9/_-]{12,}/g, 'bce-v3/***')
    .replace(/[A-Fa-f0-9]{32,}/g, '***')
    .slice(0, 600);
}
function extractText(json) {
  const c = json?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => x?.text || x?.content || '').join('\n').trim();
  if (typeof json?.output_text === 'string') return json.output_text;
  if (Array.isArray(json?.output)) {
    return json.output.flatMap(item => Array.isArray(item?.content) ? item.content : [])
      .map(x => x?.text || x?.content || '').filter(Boolean).join('\n').trim();
  }
  if (typeof json?.result === 'string') return json.result;
  return '';
}
function parseAnalysis(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const candidates = [raw, raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()];
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) candidates.push(objMatch[0]);
  for (const c of candidates) {
    try {
      const j = JSON.parse(c);
      return {
        winnerLean: String(j.winnerLean || j.winner || j.pick || '').trim(),
        confidence: Math.max(0, Math.min(100, Number(j.confidence) || 0)),
        scorePrediction: String(j.scorePrediction || j.score || '').trim(),
        summary: String(j.summary || j.analysis || '').trim(),
        keyReasons: Array.isArray(j.keyReasons) ? j.keyReasons.map(String).slice(0, 5) : [],
        watchPoints: Array.isArray(j.watchPoints) ? j.watchPoints.map(String).slice(0, 4) : [],
        risks: String(j.risks || j.risk || '').trim()
      };
    } catch (_) {}
  }
  return { winnerLean: '', confidence: 0, scorePrediction: '', summary: raw.slice(0, 1800), keyReasons: [], watchPoints: [], risks: '' };
}
function providerList() {
  return [
    { id:'qwen', name:'Qwen3.8-Max', vendor:'阿里云百炼', api:'chat', key:envFirst('QWEN_API_KEY','DASHSCOPE_API_KEY'), model:envFirst('QWEN_MODEL')||'qwen3.8-max-preview', baseUrl:cleanBase(envFirst('QWEN_BASE_URL')||'https://dashscope.aliyuncs.com/compatible-mode/v1'), body:{ reasoning_effort:'medium' } },
    { id:'deepseek', name:'DeepSeek-V4-Pro', vendor:'DeepSeek', api:'chat', key:envFirst('DEEPSEEK_API_KEY'), model:envFirst('DEEPSEEK_MODEL')||'deepseek-v4-pro', baseUrl:cleanBase(envFirst('DEEPSEEK_BASE_URL')||'https://api.deepseek.com'), body:{ thinking:{type:'disabled'} } },
    { id:'kimi', name:'Kimi K3', vendor:'Moonshot AI', api:'chat', key:envFirst('KIMI_API_KEY','MOONSHOT_API_KEY'), model:envFirst('KIMI_MODEL')||'kimi-k3', baseUrl:cleanBase(envFirst('KIMI_BASE_URL')||'https://api.moonshot.cn/v1'), body:{ reasoning_effort:'low' } },
    { id:'doubao', name:'Doubao-Seed-2.1-Pro', vendor:'火山方舟', api:'responses', key:envFirst('DOUBAO_API_KEY','ARK_API_KEY'), model:envFirst('DOUBAO_MODEL')||'doubao-seed-2.1-pro', baseUrl:cleanBase(envFirst('DOUBAO_BASE_URL')||'https://ark.cn-beijing.volces.com/api/v3'), body:{ thinking:{type:'disabled'} } },
    { id:'ernie', name:'ERNIE 5.1', vendor:'百度千帆', api:'chat', key:envFirst('ERNIE_API_KEY','QIANFAN_API_KEY'), model:envFirst('ERNIE_MODEL')||'ernie-5.1', baseUrl:cleanBase(envFirst('ERNIE_BASE_URL')||'https://qianfan.baidubce.com/v2'), body:{} },
    { id:'hy3', name:'Hy3', vendor:'腾讯云 TokenHub', api:'chat', key:envFirst('HY3_API_KEY','TENCENTMAAS_API_KEY'), model:envFirst('HY3_MODEL')||'hy3', baseUrl:cleanBase(envFirst('HY3_BASE_URL')||'https://tokenhub.tencentmaas.com/v1'), body:{ thinking:{type:'disabled'} } }
  ];
}

function createAiService({ root }) {
  const cacheDir = path.join(root, 'cache', 'ai-analysis');
  const statusPath = path.join(root, 'cache', 'ai-model-status.json');
  const inFlight = new Map();
  fs.mkdirSync(cacheDir, { recursive: true });
  const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } };
  const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); };
  const cachePath = seriesId => path.join(cacheDir, `${safeFileKey(seriesId)}.json`);
  const readStatus = () => readJson(statusPath, {});
  function updateStatus(p, data) { const all = readStatus(); all[p.id] = { name:p.name, vendor:p.vendor, model:p.model, ...data }; writeJson(statusPath, all); }
  function publicProvider(p, last) {
    return { id:p.id, name:p.name, vendor:p.vendor, model:p.model, configured:Boolean(p.key), state:!p.key?'unconfigured':(last?.state||'untested'), checkedAt:last?.checkedAt||null, lastSeriesId:last?.lastSeriesId||null, reason:last?.reason||(!p.key?'未配置 API Key':'尚未进行首次比赛分析') };
  }
  function getStatus(seriesId) {
    const providers=providerList(), last=readStatus(), cached=seriesId?readJson(cachePath(seriesId),null):null;
    return { seriesId:seriesId||null, cacheExists:Boolean(cached), cacheGeneratedAt:cached?.generatedAt||null, providers:providers.map(p=>publicProvider(p,last[p.id])) };
  }
  function configuredCount(){ return providerList().filter(p=>p.key).length; }

  async function doFetch(p, prompt) {
    const headers={Authorization:`Bearer ${p.key}`,'Content-Type':'application/json',Accept:'application/json'};
    let url, body;
    if(p.api==='responses'){
      url=`${p.baseUrl}/responses`;
      body={model:p.model,input:prompt,max_output_tokens:900,...p.body};
    }else{
      url=`${p.baseUrl}/chat/completions`;
      body={model:p.model,messages:[{role:'system',content:'你是专业 Dota 2 赛事分析师。只根据用户给出的赛程、BP、KDA和已提供背景做判断，不编造不存在的数据。输出简洁中文 JSON，不要输出 Markdown。'},{role:'user',content:prompt}],stream:false,max_tokens:900,...p.body};
    }
    const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
    const raw=await res.text(); let json=null; try{json=JSON.parse(raw)}catch(_){}
    if(!res.ok){const msg=json?.error?.message||json?.message||raw||`HTTP ${res.status}`;throw new Error(`${p.vendor} HTTP ${res.status}: ${redact(msg)}`)}
    const text=extractText(json); if(!text) throw new Error(`${p.vendor} 返回成功但没有可显示的文本内容`);
    return {text,usage:json?.usage||null};
  }
  function compactGame(g,index){
    if(!g?.ok||!g.data)return{game:index+1,ok:false,matchId:g?.matchId||null,error:g?.error||'无逐局数据'};
    const d=g.data, team=x=>({name:x?.name||'',side:x?.side||'',players:(x?.players||[]).map(p=>({name:p.name,hero:p.hero,k:p.kills,d:p.deaths,a:p.assists,gpm:p.gpm,xpm:p.xpm}))});
    return{game:index+1,ok:true,matchId:d.matchId,length:d.length,winner:d.winner,kills:[d.team1Score,d.team2Score],team1:team(d.team1),team2:team(d.team2),heroVeto:d.heroVeto};
  }
  function buildPrompt(context){
    const m=context.match||{};
    const payload={seriesId:String(m.id||''),startsAt:m.startsAt,stage:m.stage,bestOf:m.bestOf,status:m.status,teams:m.teams,matchIds:context.matchIds||[],games:(context.games||[]).map(compactGame)};
    return `请分析下面这场 TI2026 系列赛。\n\n比赛数据：\n${JSON.stringify(payload)}\n\n请严格返回一个 JSON 对象，字段如下：\n{\n  "winnerLean": "更看好的战队名；无法判断写势均力敌",\n  "confidence": 0到100的整数,\n  "scorePrediction": "例如2:1；没有足够信息写待定",\n  "summary": "80到180字核心判断",\n  "keyReasons": ["理由1","理由2","理由3"],\n  "watchPoints": ["看点1","看点2"],\n  "risks": "最主要的不确定性"\n}\n要求：不要虚构赛果、选手状态、BP或统计；若比赛尚未开始，只做赛前倾向；若已有逐局数据，可结合真实数据复盘。`;
  }
  function aggregate(models,match){
    const teams=(match?.teams||[]).map(t=>String(t?.name||'')).filter(Boolean),norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g,'');
    const counts=new Map(teams.map(t=>[t,{team:t,votes:0,confidenceSum:0}]));
    for(const r of Object.values(models||{})){if(r.status!=='ok'||!r.analysis?.winnerLean)continue;const w=norm(r.analysis.winnerLean),hit=teams.find(t=>w.includes(norm(t))||norm(t).includes(w));if(!hit)continue;const row=counts.get(hit);row.votes++;row.confidenceSum+=Number(r.analysis.confidence)||0}
    const ranking=[...counts.values()].map(x=>({...x,avgConfidence:x.votes?Math.round(x.confidenceSum/x.votes):0})).sort((a,b)=>b.votes-a.votes||b.avgConfidence-a.avgConfidence);
    return{totalSuccessful:Object.values(models||{}).filter(x=>x.status==='ok').length,ranking,leader:ranking[0]?.votes?ranking[0]:null};
  }
  async function analyzeOnce(context){
    const seriesId=String(context?.match?.id||'').trim(); if(!seriesId)throw new Error('missing_series_id'); if(inFlight.has(seriesId))return inFlight.get(seriesId);
    const promise=(async()=>{
      const file=cachePath(seriesId),existing=readJson(file,{seriesId,generatedAt:null,models:{}});existing.models||={};const providers=providerList(),prompt=buildPrompt(context);
      const tasks=providers.filter(p=>p.key&&!existing.models[p.id]).map(p=>async()=>{const startedAt=new Date().toISOString();try{const out=await doFetch(p,prompt),analysis=parseAnalysis(out.text),result={id:p.id,name:p.name,vendor:p.vendor,model:p.model,status:'ok',connected:true,cached:false,startedAt,finishedAt:new Date().toISOString(),analysis,rawText:analysis?.summary?null:out.text.slice(0,1800),usage:out.usage};existing.models[p.id]=result;updateStatus(p,{state:'connected',checkedAt:result.finishedAt,lastSeriesId:seriesId,reason:'调用成功'})}catch(err){const reason=redact(err.message),result={id:p.id,name:p.name,vendor:p.vendor,model:p.model,status:'error',connected:false,cached:false,startedAt,finishedAt:new Date().toISOString(),error:reason};existing.models[p.id]=result;updateStatus(p,{state:'failed',checkedAt:result.finishedAt,lastSeriesId:seriesId,reason})}existing.generatedAt=existing.generatedAt||new Date().toISOString();existing.updatedAt=new Date().toISOString();writeJson(file,existing)});
      let cursor=0;const workers=Array.from({length:Math.min(2,tasks.length)},async()=>{while(cursor<tasks.length){const task=tasks[cursor++];await task()}});await Promise.all(workers);
      const latest=readJson(file,existing);latest.generatedAt||=new Date().toISOString();latest.updatedAt=new Date().toISOString();latest.aggregate=aggregate(latest.models,context.match);writeJson(file,latest);
      const lastStatus=readStatus();const publicModels=providers.map(p=>{const cached=latest.models[p.id];if(cached)return{...cached,cached:true,configured:true};return{id:p.id,name:p.name,vendor:p.vendor,model:p.model,status:p.key?'untested':'unconfigured',connected:false,cached:false,configured:Boolean(p.key),error:p.key?null:'未配置 API Key',lastStatus:publicProvider(p,lastStatus[p.id])}});
      return{seriesId,generatedAt:latest.generatedAt,updatedAt:latest.updatedAt,cacheFile:`cache/ai-analysis/${path.basename(file)}`,models:publicModels,aggregate:latest.aggregate,policy:'每个模型每个系列赛最多调用一次；成功或失败结果均写入本地缓存，刷新页面不会重复调用。'};
    })().finally(()=>inFlight.delete(seriesId));inFlight.set(seriesId,promise);return promise;
  }
  return{getStatus,analyzeOnce,configuredCount};
}

module.exports={createAiService};
