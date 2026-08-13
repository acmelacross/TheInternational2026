from pathlib import Path

# ai-service.js
p = Path('ai-service.js')
s = p.read_text(encoding='utf-8')

s = s.replace(
    "const FORMAT_REVISIONS = { qwen:'qwen-json-v2-20260813', kimi:'kimi-k3-curl-v7-20260813', ernie:'ernie-format-v2-20260813' };",
    "const FORMAT_REVISIONS = { qwen:'qwen-json-v3-20260813', kimi:'kimi-k3-curl-v7-20260813', ernie:'ernie-format-v2-20260813' };"
)

old_qwen = "    { id:'qwen', name:'Qwen3.8-Max', vendor:'阿里云百炼', api:'chat', key:envFirst('QWEN_API_KEY','DASHSCOPE_API_KEY'), model:envFirst('QWEN_MODEL')||'qwen3.8-max', baseUrl:cleanBase(envFirst('QWEN_BASE_URL')||'https://dashscope.aliyuncs.com/compatible-mode/v1'), body:{ reasoning_effort:'medium', response_format:{type:'json_object'}, max_tokens:undefined } },"
new_qwen = "    { id:'qwen', name:'Qwen3.8-Max', vendor:'阿里云百炼', api:'chat', key:envFirst('QWEN_API_KEY','DASHSCOPE_API_KEY'), model:envFirst('QWEN_MODEL')||'qwen3.8-max', baseUrl:cleanBase(envFirst('QWEN_BASE_URL')||'https://dashscope.aliyuncs.com/compatible-mode/v1'), timeoutMs:270000, body:{ reasoning_effort:'low', response_format:{type:'json_object'}, max_tokens:undefined, max_completion_tokens:8192 } },"
if old_qwen not in s:
    raise SystemExit('qwen provider marker not found')
s = s.replace(old_qwen, new_qwen, 1)

old_fetch = """    }else{\n      const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(p.timeoutMs||120000)});\n      status=res.status;ok=res.ok;responseType=res.headers.get('content-type')||'';raw=await res.text();\n    }\n"""
new_fetch = """    }else{\n      const timeoutMs=p.timeoutMs||120000;\n      let res;\n      try{\n        res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});\n      }catch(err){\n        const msg=String(err?.message||'');\n        if(err?.name==='TimeoutError'||err?.name==='AbortError'||/timeout|aborted/i.test(msg)){\n          throw new Error(`${p.vendor} 请求超过 ${Math.round(timeoutMs/1000)} 秒仍未完成，已由服务器主动终止`);\n        }\n        throw err;\n      }\n      status=res.status;ok=res.ok;responseType=res.headers.get('content-type')||'';raw=await res.text();\n    }\n"""
if old_fetch not in s:
    raise SystemExit('doFetch marker not found')
s = s.replace(old_fetch, new_fetch, 1)

return_marker = "  return{getStatus,getCachedAnalysis,analyzeOnce,configuredCount};\n"
retry_block = r'''  async function retryProvider(context, providerId){
    const seriesId=String(context?.match?.id||'').trim();
    const id=String(providerId||'').trim();
    if(!seriesId){const e=new Error('missing_series_id');e.code='missing_series_id';throw e;}
    const p=providerList().find(x=>x.id===id);
    if(!p){const e=new Error('unknown_provider');e.code='unknown_provider';throw e;}
    if(!p.key){const e=new Error('provider_not_configured');e.code='provider_not_configured';throw e;}

    const file=cachePath(seriesId);
    const existing=readJson(file,{seriesId,generatedAt:null,models:{}});
    existing.models||={};
    const prior=existing.models[p.id];
    if(!prior || prior.model!==p.model || prior.analysisRevision!==providerRevision(p) || prior.status!=='error'){
      return getCachedAnalysis(seriesId,context.match);
    }

    const attempts=Math.max(0,Number(prior.manualRetryCount)||0);
    if(attempts>=3){
      const e=new Error('该模型本场已手动重试 3 次，请先排查平台或配置后再更新分析版本');
      e.code='retry_limit_reached';
      throw e;
    }
    const lastAt=Date.parse(prior.lastManualRetryAt||'')||0;
    const waitMs=60000-(Date.now()-lastAt);
    if(lastAt && waitMs>0){
      const e=new Error(`请等待 ${Math.ceil(waitMs/1000)} 秒后再重试`);
      e.code='retry_too_frequent';
      e.retryAfterSeconds=Math.ceil(waitMs/1000);
      throw e;
    }

    const retryKey=`retry:${seriesId}:${p.id}`;
    if(inFlight.has(retryKey)) return inFlight.get(retryKey);
    const promise=(async()=>{
      const prompt=buildPrompt(context);
      const startedAt=new Date().toISOString();
      const manualRetryCount=attempts+1;
      const lastManualRetryAt=startedAt;
      try{
        const out=await doFetch(p,prompt);
        const analysis=parseAnalysis(out.text);
        const result={id:p.id,name:p.name,vendor:p.vendor,model:p.model,analysisRevision:providerRevision(p),status:'ok',connected:true,cached:false,startedAt,finishedAt:new Date().toISOString(),analysis,rawText:analysis?.summary?null:out.text.slice(0,2200),usage:out.usage,manualRetryCount,lastManualRetryAt};
        existing.models[p.id]=result;
        updateStatus(p,{state:'connected',checkedAt:result.finishedAt,lastSeriesId:seriesId,reason:`手动重试成功（第 ${manualRetryCount} 次）`});
      }catch(err){
        const reason=redact(err.message);
        const result={id:p.id,name:p.name,vendor:p.vendor,model:p.model,analysisRevision:providerRevision(p),status:'error',connected:false,cached:false,startedAt,finishedAt:new Date().toISOString(),error:reason,manualRetryCount,lastManualRetryAt};
        existing.models[p.id]=result;
        updateStatus(p,{state:'failed',checkedAt:result.finishedAt,lastSeriesId:seriesId,reason});
      }
      existing.generatedAt=existing.generatedAt||new Date().toISOString();
      existing.updatedAt=new Date().toISOString();
      existing.aggregate=aggregate(existing.models,context.match);
      writeJson(file,existing);
      return getCachedAnalysis(seriesId,context.match);
    })().finally(()=>inFlight.delete(retryKey));
    inFlight.set(retryKey,promise);
    return promise;
  }
'''
if return_marker not in s:
    raise SystemExit('return marker not found')
s = s.replace(return_marker, retry_block + "  return{getStatus,getCachedAnalysis,analyzeOnce,retryProvider,configuredCount};\n", 1)
p.write_text(s, encoding='utf-8')

# server.js
p = Path('server.js')
s = p.read_text(encoding='utf-8')
route_marker = """    if (u.pathname === '/api/team-intel') {\n"""
retry_route = r'''    if (u.pathname === '/api/ai/retry' && req.method === 'POST') {
      const seriesId = u.searchParams.get('id');
      const providerId = u.searchParams.get('provider');
      const data = await refresh(false);
      const match = (data.matches || []).find(m => String(m.id) === String(seriesId));
      if (!match) return sendJson(res, 404, { error: 'match_not_found' });
      if (!providerId) return sendJson(res, 400, { error: 'missing_provider' });
      const matchIds = Array.from(new Set([...(match.matchIds || []), ...extractMatchIds(match.games || [])]));
      const games = [];
      for (const matchId of matchIds.slice(0, 5)) {
        try { games.push({ ok: true, data: await fetchDota2Game(matchId) }); }
        catch (err) { games.push({ ok: false, matchId, error: err.message }); }
      }
      const teamIntel = await teamIntelService.getMatchIntel(match).catch(err => ({ error: err.message, teams: [] }));
      try {
        const result = await aiService.retryProvider({ match, matchIds, games, teamIntel }, providerId);
        return sendJson(res, 200, result);
      } catch (err) {
        const status = err.code === 'retry_too_frequent' ? 429 : err.code === 'retry_limit_reached' ? 429 : 400;
        return sendJson(res, status, { error: err.code || 'retry_failed', message: err.message, retryAfterSeconds: err.retryAfterSeconds || null });
      }
    }
'''
if route_marker not in s:
    raise SystemExit('server route marker not found')
s = s.replace(route_marker, retry_route + route_marker, 1)
p.write_text(s, encoding='utf-8')

# public/ai-analysis.js
p = Path('public/ai-analysis.js')
s = p.read_text(encoding='utf-8')
old_error = "    if(m.status === 'error') return `<article class=\"ai-model-card error\"><div class=\"ai-model-head\"><div><span>${esc(m.vendor)}</span><h3>${esc(m.name)}</h3><small>${esc(m.model)}</small></div><b>调用失败</b></div><p class=\"ai-error\">${esc(m.error || '未知错误')}</p><div class=\"ai-cache-note\">失败状态也已缓存，不会自动重复调用。</div></article>`;"
new_error = """    if(m.status === 'error') {\n      const retries=Math.max(0,Number(m.manualRetryCount)||0);\n      const exhausted=retries>=3;\n      return `<article class=\"ai-model-card error\"><div class=\"ai-model-head\"><div><span>${esc(m.vendor)}</span><h3>${esc(m.name)}</h3><small>${esc(m.model)}</small></div><b>调用失败</b></div><p class=\"ai-error\">${esc(m.error || '未知错误')}</p><div class=\"ai-error-actions\"><button type=\"button\" class=\"ai-retry-btn\" data-ai-retry=\"${esc(m.id)}\" ${exhausted?'disabled':''}>${exhausted?'已达重试上限':'↻ 重新分析'}</button><span>${retries?`已手动重试 ${retries}/3 次`:'失败已缓存，不会自动重复调用'}</span></div></article>`;\n    }"""
if old_error not in s:
    raise SystemExit('frontend error card marker not found')
s = s.replace(old_error, new_error, 1)

end_marker = "  window.addEventListener('DOMContentLoaded',()=>{ loadStatus(); setTimeout(loadAnalysis,120); });\n"
retry_frontend = r'''  async function retryModel(providerId, button){
    if(!seriesId || !providerId || !button) return;
    const note=$('#aiAnalysisState');
    button.disabled=true;
    const oldText=button.textContent;
    button.textContent='重新分析中...';
    if(note) note.textContent=`正在单独重新调用 ${providerId}，其他模型继续使用已有缓存。`;
    try{
      const r=await fetch(`/api/ai/retry?id=${encodeURIComponent(seriesId)}&provider=${encodeURIComponent(providerId)}`,{method:'POST',cache:'no-store'});
      const d=await readApiJson(r,'AI 单模型重试接口');
      renderAnalysis(d);
      await loadStatus();
      if(note) note.textContent='单模型重新分析已完成；其他模型没有重复调用。';
    }catch(e){
      button.disabled=false;
      button.textContent=oldText;
      if(note) note.textContent=`重新分析失败：${e.message}`;
    }
  }

  function bindRetryButtons(){
    document.addEventListener('click',e=>{
      const button=e.target.closest('[data-ai-retry]');
      if(!button) return;
      e.preventDefault();
      retryModel(button.dataset.aiRetry,button);
    });
  }
'''
if end_marker not in s:
    raise SystemExit('frontend end marker not found')
s = s.replace(end_marker, retry_frontend + "  window.addEventListener('DOMContentLoaded',()=>{ bindRetryButtons(); loadStatus(); setTimeout(loadAnalysis,120); });\n", 1)
p.write_text(s, encoding='utf-8')

# public/v135.css
p = Path('public/v135.css')
s = p.read_text(encoding='utf-8')
css = r'''

/* manual retry for failed AI providers */
.ai-error-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:10px}
.ai-error-actions span{font-size:9px;color:#7f8b99}
.ai-retry-btn{appearance:none;border:1px solid rgba(255,105,105,.34);background:rgba(255,75,75,.08);color:#ff9a9a;border-radius:7px;padding:6px 10px;font-size:9px;font-weight:800;cursor:pointer;transition:.15s}
.ai-retry-btn:hover:not(:disabled){border-color:rgba(255,125,125,.65);background:rgba(255,75,75,.14);color:#ffd0d0}
.ai-retry-btn:disabled{opacity:.45;cursor:not-allowed}
'''
if '/* manual retry for failed AI providers */' not in s:
    s += css
p.write_text(s, encoding='utf-8')
