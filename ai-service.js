'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');

const ANALYSIS_REVISION = 'team-intel-v1-20260813';
const FORMAT_REVISIONS = { qwen:'qwen-json-v2-20260813', kimi:'kimi-k3-curl-v7-20260813' };
function providerRevision(p){ return FORMAT_REVISIONS[p.id] || ANALYSIS_REVISION; }
const KIMI_RESPONSE_FORMAT = {
  type:'json_schema',
  json_schema:{
    name:'ti2026_analysis',
    strict:true,
    schema:{
      type:'object',
      properties:{
        winnerLean:{type:'string'},
        confidence:{type:'integer',minimum:0,maximum:100},
        scorePrediction:{type:'string'},
        summary:{type:'string'},
        keyReasons:{type:'array',items:{type:'string'}},
        watchPoints:{type:'array',items:{type:'string'}},
        risks:{type:'string'},
        gamePredictions:{
          type:'array',
          items:{
            type:'object',
            properties:{
              game:{type:'integer'},
              winnerLean:{type:'string'},
              confidence:{type:'integer',minimum:0,maximum:100},
              reason:{type:'string'},
              bpKey:{type:'string'},
              playerKey:{type:'string'},
              status:{type:'string',enum:['prediction','observed','likely_not_needed']}
            },
            required:['game','winnerLean','confidence','reason','bpKey','playerKey','status'],
            additionalProperties:false
          }
        },
        playerForm:{type:'array',items:{type:'string'}},
        bpAnalysis:{type:'array',items:{type:'string'}},
        relationshipContext:{type:'array',items:{type:'string'}},
        dataGaps:{type:'array',items:{type:'string'}}
      },
      required:['winnerLean','confidence','scorePrediction','summary','keyReasons','watchPoints','risks','gamePredictions','playerForm','bpAnalysis','relationshipContext','dataGaps'],
      additionalProperties:false
    }
  }
};

function cleanBase(v) { return String(v || '').replace(/\/+$/, ''); }
function kimiBaseUrl() {
  return cleanBase(envFirst('KIMI_BASE_URL') || 'https://api.moonshot.cn/v1');
}
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
    .slice(0, 800);
}
function arr(v, max = 8) { return Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, max) : []; }
function extractText(json) {
  const msg = json?.choices?.[0]?.message;
  const c = msg?.content;
  if (typeof c === 'string' && c.trim()) return c.trim();
  if (Array.isArray(c)) {
    const joined=c.map(x => {
      if(typeof x==='string')return x;
      if(typeof x?.text==='string')return x.text;
      if(typeof x?.content==='string')return x.content;
      if(typeof x?.text?.value==='string')return x.text.value;
      return '';
    }).filter(Boolean).join('\n').trim();
    if(joined)return joined;
  }
  if (typeof msg?.output_text === 'string' && msg.output_text.trim()) return msg.output_text.trim();
  if (typeof json?.choices?.[0]?.text === 'string' && json.choices[0].text.trim()) return json.choices[0].text.trim();
  if (typeof json?.output_text === 'string' && json.output_text.trim()) return json.output_text.trim();
  if (Array.isArray(json?.output)) {
    const joined=json.output.flatMap(item => Array.isArray(item?.content) ? item.content : [])
      .map(x => typeof x==='string'?x:(x?.text?.value || x?.text || x?.content || '')).filter(Boolean).join('\n').trim();
    if(joined)return joined;
  }
  if (typeof json?.result === 'string' && json.result.trim()) return json.result.trim();
  return '';
}
function extractBalancedJsonObject(raw){
  let start=-1,depth=0,inString=false,escape=false;
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(start<0){if(ch==='{'){start=i;depth=1;}continue;}
    if(inString){if(escape){escape=false;continue;}if(ch==='\\'){escape=true;continue;}if(ch==='"')inString=false;continue;}
    if(ch==='"'){inString=true;continue;}
    if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return raw.slice(start,i+1);
  }
  return '';
}
function parseAnalysis(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const stripped=raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const candidates = [raw, stripped];
  const balanced=extractBalancedJsonObject(stripped);
  if(balanced)candidates.push(balanced);
  try{const once=JSON.parse(stripped);if(typeof once==='string')candidates.push(once);}catch(_){}
  for (const c of candidates) {
    try {
      const j = JSON.parse(c);
      const gamePredictions = Array.isArray(j.gamePredictions) ? j.gamePredictions.slice(0, 5).map((g, i) => ({
        game: Number(g?.game) || i + 1,
        winnerLean: String(g?.winnerLean || g?.winner || '').trim(),
        confidence: Math.max(0, Math.min(100, Number(g?.confidence) || 0)),
        reason: String(g?.reason || '').trim(),
        bpKey: String(g?.bpKey || g?.bp || '').trim(),
        playerKey: String(g?.playerKey || g?.player || '').trim(),
        status: String(g?.status || 'prediction').trim()
      })) : [];
      return {
        winnerLean: String(j.winnerLean || j.winner || j.pick || '').trim(),
        confidence: Math.max(0, Math.min(100, Number(j.confidence) || 0)),
        scorePrediction: String(j.scorePrediction || j.score || '').trim(),
        summary: String(j.summary || j.analysis || '').trim(),
        keyReasons: arr(j.keyReasons, 6),
        watchPoints: arr(j.watchPoints, 5),
        risks: String(j.risks || j.risk || '').trim(),
        gamePredictions,
        playerForm: arr(j.playerForm, 10),
        bpAnalysis: arr(j.bpAnalysis, 8),
        relationshipContext: arr(j.relationshipContext, 8),
        dataGaps: arr(j.dataGaps, 8)
      };
    } catch (_) {}
  }
  return { winnerLean: '', confidence: 0, scorePrediction: '', summary: raw.slice(0, 2200), keyReasons: [], watchPoints: [], risks: '', gamePredictions: [], playerForm: [], bpAnalysis: [], relationshipContext: [], dataGaps: ['模型未按结构化 JSON 返回，已保留原始摘要。'] };
}
function providerList() {
  return [
    { id:'qwen', name:'Qwen3.8-Max', vendor:'阿里云百炼', api:'chat', key:envFirst('QWEN_API_KEY','DASHSCOPE_API_KEY'), model:envFirst('QWEN_MODEL')||'qwen3.8-max', baseUrl:cleanBase(envFirst('QWEN_BASE_URL')||'https://dashscope.aliyuncs.com/compatible-mode/v1'), body:{ reasoning_effort:'medium', response_format:{type:'json_object'}, max_tokens:undefined } },
    { id:'deepseek', name:'DeepSeek-V4-Pro', vendor:'DeepSeek', api:'chat', key:envFirst('DEEPSEEK_API_KEY'), model:envFirst('DEEPSEEK_MODEL')||'deepseek-v4-pro', baseUrl:cleanBase(envFirst('DEEPSEEK_BASE_URL')||'https://api.deepseek.com'), body:{ thinking:{type:'disabled'} } },
    { id:'kimi', name:'Kimi K3', vendor:'Moonshot AI', api:'chat', key:envFirst('KIMI_API_KEY','MOONSHOT_API_KEY'), model:envFirst('KIMI_MODEL')||'kimi-k3', baseUrl:kimiBaseUrl(), timeoutMs:280000, body:{ reasoning_effort:'low', max_tokens:undefined } },
    { id:'doubao', name:'Doubao-Seed-2.1-Pro', vendor:'火山方舟', api:'responses', key:envFirst('DOUBAO_API_KEY','ARK_API_KEY'), model:envFirst('DOUBAO_MODEL')||'doubao-seed-2-1-pro-260628', baseUrl:cleanBase(envFirst('DOUBAO_BASE_URL')||'https://ark.cn-beijing.volces.com/api/v3'), body:{ thinking:{type:'disabled'} } },
    { id:'ernie', name:'ERNIE 5.1', vendor:'百度千帆', api:'chat', key:envFirst('ERNIE_API_KEY','QIANFAN_API_KEY'), model:envFirst('ERNIE_MODEL')||'ernie-5.1', baseUrl:cleanBase(envFirst('ERNIE_BASE_URL')||'https://qianfan.baidubce.com/v2'), body:{} },
    { id:'hy3', name:'Hy3', vendor:'腾讯云 TokenHub', api:'chat', key:envFirst('HY3_API_KEY','TENCENTMAAS_API_KEY'), model:envFirst('HY3_MODEL')||'hy3', baseUrl:cleanBase(envFirst('HY3_BASE_URL')||'https://tokenhub.tencentmaas.com/v1'), body:{ thinking:{type:'disabled'} } }
  ];
}

function curlPostJson(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti2026-kimi-'));
    const headerFile = path.join(dir, 'headers.txt');
    const bodyFile = path.join(dir, 'body.json');
    const cleanup = () => { try { fs.rmSync(dir, { recursive:true, force:true }); } catch (_) {} };
    try {
      fs.writeFileSync(headerFile, `Authorization: ${headers.Authorization}\nContent-Type: application/json\nAccept: application/json\n`, { mode:0o600 });
      fs.writeFileSync(bodyFile, JSON.stringify(body), { mode:0o600 });
    } catch (err) {
      cleanup();
      reject(err);
      return;
    }
    const metaMarker='\n__TI2026_CURL_META__:';
    const args=[
      '--silent','--show-error','--location','--http1.1',
      '--connect-timeout','30',
      '--max-time',String(Math.max(1,Math.ceil((timeoutMs||120000)/1000))),
      '--header',`@${headerFile}`,
      '--data-binary',`@${bodyFile}`,
      '--write-out',`${metaMarker}%{http_code}|%{content_type}`,
      url
    ];
    const child=spawn('curl',args,{stdio:['ignore','pipe','pipe']});
    const out=[],err=[];
    let settled=false;
    child.stdout.on('data',d=>out.push(d));
    child.stderr.on('data',d=>err.push(d));
    child.on('error',e=>{
      if(settled)return;
      settled=true;
      cleanup();
      reject(e);
    });
    child.on('close',code=>{
      if(settled)return;
      settled=true;
      const stdout=Buffer.concat(out).toString('utf8');
      const stderr=Buffer.concat(err).toString('utf8').trim();
      cleanup();
      if(code!==0){reject(new Error(`curl exit ${code}: ${stderr||'request failed'}`));return;}
      const pos=stdout.lastIndexOf(metaMarker);
      if(pos<0){reject(new Error('curl response metadata missing'));return;}
      const raw=stdout.slice(0,pos);
      const meta=stdout.slice(pos+metaMarker.length).trim();
      const sep=meta.indexOf('|');
      const status=Number(sep>=0?meta.slice(0,sep):meta)||0;
      const contentType=sep>=0?meta.slice(sep+1):'';
      resolve({status,ok:status>=200&&status<300,contentType,raw});
    });
  });
}

function createAiService({ root, dataDir }) {
  const runtimeDir = dataDir || path.join(root, 'cache');
  const cacheDir = path.join(runtimeDir, 'ai-analysis');
  const statusPath = path.join(runtimeDir, 'ai-model-status.json');
  const relationshipPath = path.join(root, 'data', 'relationship-context.json');
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
      body={model:p.model,input:prompt,max_output_tokens:2200,...p.body};
    }else{
      url=`${p.baseUrl}/chat/completions`;
      body={model:p.model,messages:[{role:'system',content:'你是专业 Dota 2 赛事分析师。只使用用户提供的赛程、逐局数据和“已核验公开背景”进行判断。绝对不要虚构选手近况、私人关系、冲突、友谊、采访或历史事件。没有可靠数据必须明确写“暂无可靠公开资料/数据不足”。输出中文 JSON，不要 Markdown。'},{role:'user',content:prompt}],stream:false,max_tokens:2200,...p.body};
    }
    let status,ok,responseType,raw;
    if(p.id==='kimi'){
      const out=await curlPostJson(url,headers,body,p.timeoutMs||120000);
      status=out.status;ok=out.ok;responseType=out.contentType||'';raw=out.raw;
    }else{
      const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(p.timeoutMs||120000)});
      status=res.status;ok=res.ok;responseType=res.headers.get('content-type')||'';raw=await res.text();
    }
    let json=null; try{json=JSON.parse(raw)}catch(_){}
    if(!ok){const msg=json?.error?.message||json?.message||raw||`HTTP ${status}`;throw new Error(`${p.vendor} HTTP ${status}: ${redact(msg)}`)}
    const text=extractText(json); if(!text){const choice=json?.choices?.[0],msg=choice?.message;const finish=choice?.finish_reason||json?.status||'unknown';const shape={transport:p.id==='kimi'?'curl':'fetch',httpStatus:status,responseType,rawLength:raw.length,topKeys:json&&typeof json==='object'?Object.keys(json).slice(0,12):[],choiceCount:Array.isArray(json?.choices)?json.choices.length:null,choiceKeys:choice&&typeof choice==='object'?Object.keys(choice).slice(0,12):[],messageKeys:msg&&typeof msg==='object'?Object.keys(msg).slice(0,12):[],contentType:Array.isArray(msg?.content)?'array':typeof msg?.content,contentLength:typeof msg?.content==='string'?msg.content.length:null,reasoningLength:typeof msg?.reasoning_content==='string'?msg.reasoning_content.length:null};throw new Error(`${p.vendor} 返回成功但没有最终文本内容（finish_reason=${finish}；响应结构=${redact(JSON.stringify(shape))}）`);}
    return {text,usage:json?.usage||null};
  }
  function compactGame(g,index){
    if(!g?.ok||!g.data)return{game:index+1,ok:false,matchId:g?.matchId||null,error:g?.error||'无逐局数据'};
    const d=g.data, team=x=>({name:x?.name||'',side:x?.side||'',players:(x?.players||[]).map(p=>({id:p.id||null,name:p.name,hero:p.hero,k:p.kills,d:p.deaths,a:p.assists,gpm:p.gpm,xpm:p.xpm,lastHits:p.lastHits,denies:p.denies}))});
    return{game:index+1,ok:true,matchId:d.matchId,length:d.length,winner:d.winner,kills:[d.team1Score,d.team2Score],team1:team(d.team1),team2:team(d.team2),heroVeto:d.heroVeto};
  }
  function verifiedRelationshipContext(match) {
    const db = readJson(relationshipPath, { items: [] });
    const teams = (match?.teams || []).map(x => String(x?.name || '').toLowerCase());
    return (db.items || []).filter(item => {
      const related = (item.teams || []).map(x => String(x).toLowerCase());
      return related.length && related.every(x => teams.includes(x));
    }).slice(0, 20);
  }
  function buildPrompt(context){
    const m=context.match||{};
    const bestOf = Number(m.bestOf || 3);
    const payload={seriesId:String(m.id||''),startsAt:m.startsAt,stage:m.stage,bestOf,status:m.status,teams:m.teams,matchIds:context.matchIds||[],games:(context.games||[]).map(compactGame),teamIntel:context.teamIntel||null,verifiedPublicRelationshipContext:verifiedRelationshipContext(m)};
    return `请一次性完成下面这场 TI2026 系列赛的完整分析。注意：这是“每个模型每场系列赛只调用一次”的缓存任务，所以一次回复必须覆盖系列赛整体和逐局分析。\n\n比赛数据：\n${JSON.stringify(payload)}\n\n严格返回一个 JSON 对象：\n{\n  "winnerLean":"系列赛更看好的战队名；无法判断写势均力敌",\n  "confidence":0到100整数,\n  "scorePrediction":"例如2:1；信息不足写待定",\n  "summary":"100到220字系列赛核心判断",\n  "keyReasons":["理由1","理由2","理由3"],\n  "watchPoints":["看点1","看点2"],\n  "risks":"主要不确定性",\n  "gamePredictions":[${Array.from({length:bestOf},(_,i)=>`{"game":${i+1},"winnerLean":"战队/待定","confidence":0,"reason":"该局胜负倾向理由","bpKey":"该局 BP 关键点","playerKey":"该局关键选手状态/对位","status":"prediction/observed/likely_not_needed"}`).join(',')}],\n  "playerForm":["逐条写选手状态判断；只允许依据提供的 KDA/GPM/XPM/当前系列赛数据。没有近期样本必须写数据不足"],\n  "bpAnalysis":["英雄池、BP、对位、先后手和阵容节奏分析；未提供真实 BP 时只能写赛前策略倾向，不能编造已选英雄"],\n  "relationshipContext":["只允许引用 verifiedPublicRelationshipContext 中已核验的公开队友经历/交手背景/公开摩擦事件；如果为空必须写暂无可靠公开资料，不允许凭模型记忆编造八卦"],\n  "dataGaps":["列出当前缺失的近期状态、阵容、历史数据等"]\n}\n要求：\n1. BO${bestOf} 必须给出 Game 1 到 Game ${bestOf} 的逐局条目，但若预测系列赛提前结束，后续局 status 写 likely_not_needed。\n2. 已经完成的局如果提供了真实数据，status 写 observed，并分析真实表现，不要把已发生结果当预测。\n3. 选手状态优先使用 teamIntel 中的固定阵容、教练、2026 赛季战绩、recentForm、playerStats 和 heroPool；数据仍不足时再明确写数据不足，不要凭空补数据。\n4. 关系、友谊、恩怨、摩擦属于易被误传的信息，只能使用 verifiedPublicRelationshipContext；没有就明确写暂无可靠公开资料。\n5. 不涉及任何投注、赔率或博彩建议。`;
  }
  function aggregate(models,match){
    const teams=(match?.teams||[]).map(t=>String(t?.name||'')).filter(Boolean),norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g,'');
    const counts=new Map(teams.map(t=>[t,{team:t,votes:0,confidenceSum:0}]));
    for(const r of Object.values(models||{})){if(r.status!=='ok'||!r.analysis?.winnerLean)continue;const w=norm(r.analysis.winnerLean),hit=teams.find(t=>w.includes(norm(t))||norm(t).includes(w));if(!hit)continue;const row=counts.get(hit);row.votes++;row.confidenceSum+=Number(r.analysis.confidence)||0}
    const ranking=[...counts.values()].map(x=>({...x,avgConfidence:x.votes?Math.round(x.confidenceSum/x.votes):0})).sort((a,b)=>b.votes-a.votes||b.avgConfidence-a.avgConfidence);
    return{totalSuccessful:Object.values(models||{}).filter(x=>x.status==='ok').length,ranking,leader:ranking[0]?.votes?ranking[0]:null};
  }
  function getCachedAnalysis(seriesId, match) {
    const id=String(seriesId||'').trim();
    if(!id)return{found:false,complete:false,seriesId:null,models:[]};
    const latest=readJson(cachePath(id),null);
    const providers=providerList();
    if(!latest)return{found:false,complete:false,seriesId:id,models:[],aggregate:null};
    const models=providers.map(p=>{
      const c=latest.models?.[p.id];
      if(c&&c.model===p.model&&c.analysisRevision===providerRevision(p))return{...c,cached:true,configured:Boolean(p.key)};
      return{id:p.id,name:p.name,vendor:p.vendor,model:p.model,status:p.key?'untested':'unconfigured',connected:false,cached:false,configured:Boolean(p.key),error:p.key?null:'未配置 API Key'};
    });
    const configured=providers.filter(p=>p.key);
    const complete=configured.every(p=>latest.models?.[p.id]?.model===p.model&&latest.models?.[p.id]?.analysisRevision===providerRevision(p));
    return{found:true,complete,seriesId:id,generatedAt:latest.generatedAt,updatedAt:latest.updatedAt,models,aggregate:aggregate(latest.models||{},match||{}),analysisRevision:ANALYSIS_REVISION,policy:'服务器本地缓存优先；同一场系列赛、同一模型、同一分析版本全站只调用一次。所有访客共享服务器缓存。'};
  }
  async function analyzeOnce(context){
    const seriesId=String(context?.match?.id||'').trim(); if(!seriesId)throw new Error('missing_series_id'); if(inFlight.has(seriesId))return inFlight.get(seriesId);
    const promise=(async()=>{
      const file=cachePath(seriesId),existing=readJson(file,{seriesId,generatedAt:null,models:{}});existing.models||={};const providers=providerList(),prompt=buildPrompt(context);
      const tasks=providers.filter(p=>p.key&&(!existing.models[p.id]||existing.models[p.id].model!==p.model||existing.models[p.id].analysisRevision!==providerRevision(p))).map(p=>async()=>{const startedAt=new Date().toISOString();try{const out=await doFetch(p,prompt),analysis=parseAnalysis(out.text),result={id:p.id,name:p.name,vendor:p.vendor,model:p.model,analysisRevision:providerRevision(p),status:'ok',connected:true,cached:false,startedAt,finishedAt:new Date().toISOString(),analysis,rawText:analysis?.summary?null:out.text.slice(0,2200),usage:out.usage};existing.models[p.id]=result;updateStatus(p,{state:'connected',checkedAt:result.finishedAt,lastSeriesId:seriesId,reason:'调用成功'})}catch(err){const reason=redact(err.message),result={id:p.id,name:p.name,vendor:p.vendor,model:p.model,analysisRevision:providerRevision(p),status:'error',connected:false,cached:false,startedAt,finishedAt:new Date().toISOString(),error:reason};existing.models[p.id]=result;updateStatus(p,{state:'failed',checkedAt:result.finishedAt,lastSeriesId:seriesId,reason})}existing.generatedAt=existing.generatedAt||new Date().toISOString();existing.updatedAt=new Date().toISOString();writeJson(file,existing)});
      let cursor=0;const workers=Array.from({length:Math.min(2,tasks.length)},async()=>{while(cursor<tasks.length){const task=tasks[cursor++];await task()}});await Promise.all(workers);
      const latest=readJson(file,existing);latest.generatedAt||=new Date().toISOString();latest.updatedAt=new Date().toISOString();latest.aggregate=aggregate(latest.models,context.match);writeJson(file,latest);
      const lastStatus=readStatus();const publicModels=providers.map(p=>{const cached=latest.models[p.id];if(cached)return{...cached,cached:true,configured:true};return{id:p.id,name:p.name,vendor:p.vendor,model:p.model,status:p.key?'untested':'unconfigured',connected:false,cached:false,configured:Boolean(p.key),error:p.key?null:'未配置 API Key',lastStatus:publicProvider(p,lastStatus[p.id])}});
      return{seriesId,generatedAt:latest.generatedAt,updatedAt:latest.updatedAt,cacheFile:`${cacheDir}/${path.basename(file)}`,models:publicModels,aggregate:latest.aggregate,analysisRevision:ANALYSIS_REVISION,policy:'服务器全局缓存：同一场系列赛 × 同一模型 × 同一分析版本，全站最多调用一次；所有访客共享 /var/lib/ti2026-guide 的持久缓存，刷新页面、多人访问和重新部署均不会重复消耗 Token。'};
    })().finally(()=>inFlight.delete(seriesId));inFlight.set(seriesId,promise);return promise;
  }
  return{getStatus,getCachedAnalysis,analyzeOnce,configuredCount};
}

module.exports={createAiService};
