(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const q = new URLSearchParams(location.search);
  const seriesId = q.get('id');
  const ANALYSIS_POLL_INTERVAL_MS = 2000;
  const ANALYSIS_MAX_WAIT_MS = 8 * 60 * 1000;
  let analysisLoadPromise = null;
  let lastRenderedCacheToken = '';

  function statusClass(state){ return state === 'connected' || state === 'ok' ? 'ok' : state === 'failed' || state === 'error' ? 'bad' : state === 'unconfigured' ? 'off' : 'wait'; }
  function statusText(state){ return ({connected:'已连通',ok:'已连通',failed:'失败',error:'失败',unconfigured:'未配置',untested:'待首次调用'})[state] || '待检测'; }
  function renderStatuses(data){
    const box = $('#aiModelStatus'); if(!box) return;
    box.innerHTML = (data.providers || []).map(p => `<div class="ai-status ${statusClass(p.state)}"><span class="ai-dot"></span><div><b>${esc(p.name)}</b><small>${esc(p.model)}</small></div><strong>${statusText(p.state)}</strong>${p.reason ? `<em title="${esc(p.reason)}">${esc(p.reason)}</em>` : ''}</div>`).join('');
  }
  function reasonList(items, empty='暂无结构化内容'){ return (items || []).length ? `<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>` : `<span class="ai-muted">${esc(empty)}</span>`; }
  function gameRows(items){
    if(!(items||[]).length) return '<div class="ai-muted">暂无逐局分析</div>';
    return `<div class="ai-game-grid">${items.map(g=>`<div class="ai-game-row ${esc(g.status||'prediction')}"><div class="ai-game-no">G${esc(g.game)}</div><div class="ai-game-main"><b>${esc(g.winnerLean||'待定')}</b><span>${esc(g.confidence||0)}%</span><p>${esc(g.reason||'暂无理由')}</p>${g.bpKey?`<small><strong>BP</strong> ${esc(g.bpKey)}</small>`:''}${g.playerKey?`<small><strong>选手</strong> ${esc(g.playerKey)}</small>`:''}</div><em>${g.status==='observed'?'已结束':g.status==='likely_not_needed'?'可能无需进行':'预测'}</em></div>`).join('')}</div>`;
  }
  function detailBlock(title, items, empty){ return `<div class="ai-detail-block"><h4>${esc(title)}</h4>${reasonList(items,empty)}</div>`; }
  function analysisCard(m){
    if(m.status === 'unconfigured') return `<article class="ai-model-card off"><div class="ai-model-head"><div><span>${esc(m.vendor)}</span><h3>${esc(m.name)}</h3><small>${esc(m.model)}</small></div><b>未配置</b></div><p class="ai-error">服务器未配置该平台 API Key。</p></article>`;
    if(m.status === 'error') {
      const retries=Math.max(0,Number(m.manualRetryCount)||0);
      const exhausted=retries>=3;
      return `<article class="ai-model-card error"><div class="ai-model-head"><div><span>${esc(m.vendor)}</span><h3>${esc(m.name)}</h3><small>${esc(m.model)}</small></div><b>调用失败</b></div><p class="ai-error">${esc(m.error || '未知错误')}</p><div class="ai-error-actions"><button type="button" class="ai-retry-btn" data-ai-retry="${esc(m.id)}" ${exhausted?'disabled':''}>${exhausted?'已达重试上限':'↻ 重新分析'}</button><span>${retries?`已手动重试 ${retries}/3 次`:'失败已缓存，不会自动重复调用'}</span></div></article>`;
    }
    if(m.status !== 'ok') return `<article class="ai-model-card"><div class="ai-model-head"><div><span>${esc(m.vendor)}</span><h3>${esc(m.name)}</h3><small>${esc(m.model)}</small></div><b>等待</b></div></article>`;
    const a=m.analysis||{};
    return `<article class="ai-model-card ok"><div class="ai-model-head"><div><span>${esc(m.vendor)}</span><h3>${esc(m.name)}</h3><small>${esc(m.model)}</small></div><b>${esc(a.confidence || 0)}%</b></div><div class="ai-pick"><span>系列赛倾向</span><strong>${esc(a.winnerLean || '势均力敌')}</strong><em>${esc(a.scorePrediction || '待定')}</em></div><p class="ai-summary">${esc(a.summary || m.rawText || '暂无摘要')}</p><div class="ai-section-label">逐局胜负分析</div>${gameRows(a.gamePredictions)}<div class="ai-detail-grid">${detailBlock('选手状态',a.playerForm,'当前没有足够真实统计判断近期状态')}${detailBlock('BP 分析',a.bpAnalysis,'暂无足够 BP 数据')}${detailBlock('公开关系背景',a.relationshipContext,'暂无可靠公开资料')}${detailBlock('数据缺口',a.dataGaps,'未发现额外数据缺口')}</div><div class="ai-mini-grid"><div><h4>主要理由</h4>${reasonList(a.keyReasons)}</div><div><h4>比赛看点</h4>${reasonList(a.watchPoints)}</div></div>${a.risks?`<div class="ai-risk"><b>不确定性</b><span>${esc(a.risks)}</span></div>`:''}<div class="ai-cache-note">${m.cached?'已读取持久化本地缓存':'首次调用已完成并缓存'}</div></article>`;
  }
  function renderConsensus(d){
    const el=$('#aiConsensus'); if(!el) return;
    const a=d.aggregate||{}; const lead=a.leader;
    if(!lead){ el.innerHTML=`<div class="ai-consensus-empty">已有 ${a.totalSuccessful||0} 个模型返回结果，暂未形成明确多数倾向。</div>`; return; }
    const rows=(a.ranking||[]).filter(x=>x.votes>0).map(x=>`<span><b>${esc(x.team)}</b> ${x.votes}票 · 平均信心 ${x.avgConfidence}%</span>`).join('');
    el.innerHTML=`<div class="ai-consensus-main"><span>多模型综合倾向</span><strong>${esc(lead.team)}</strong><em>${lead.votes} / ${a.totalSuccessful||0} 票</em></div><div class="ai-consensus-votes">${rows}</div>`;
  }
  function renderAnalysis(d){
    const grid=$('#aiAnalysisGrid'); const note=$('#aiAnalysisState');
    if(grid) grid.innerHTML=(d.models||[]).map(analysisCard).join('');
    renderConsensus(d);
    if(note) note.textContent=d.policy||'分析结果已缓存。';
  }

  async function readApiJson(response, label){
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; }
    catch (_) {
      const type = response.headers.get('content-type') || '';
      const isHtml = /text\/html/i.test(type) || /^\s*<!doctype|^\s*<html/i.test(text);
      const snippet = String(text || '').replace(/\s+/g,' ').slice(0,180);
      throw new Error(`${label} HTTP ${response.status}${isHtml?'：反向代理返回了 HTML 错误页':'：返回内容不是 JSON'}${snippet?`（${snippet}）`:''}`);
    }
    if(!response.ok) throw new Error(data?.message || data?.error || `${label} HTTP ${response.status}`);
    return data;
  }

  async function fetchCache(){
    const r=await fetch(`/api/ai/cache?id=${encodeURIComponent(seriesId)}`,{cache:'no-store'});
    if(r.status===404){
      const text=await r.text();
      let d=null; try{ d=text?JSON.parse(text):null; }catch(_){}
      if(d?.error==='not_found' || d?.error==='match_not_found'){
        return {found:false,complete:false,seriesId,models:[],aggregate:null};
      }
      throw new Error(d?.message||d?.error||'AI 缓存接口 HTTP 404');
    }
    return readApiJson(r,'AI 缓存接口');
  }

  async function loadStatus(){
    if(!seriesId) return;
    try{
      const r=await fetch(`/api/ai/status?id=${encodeURIComponent(seriesId)}`,{cache:'no-store'});
      const d=await readApiJson(r,'AI 状态接口');
      renderStatuses(d);
      return d;
    }catch(e){ console.warn(e); return null; }
  }

  function wait(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
  function cacheRenderToken(d){
    return JSON.stringify({
      generatedAt:d?.generatedAt||d?.cacheGeneratedAt||'',
      complete:Boolean(d?.complete),
      models:(d?.models||[]).map(m=>[m?.id,m?.status,m?.cached,Number(m?.manualRetryCount)||0])
    });
  }
  function modelProgress(d){
    const models=(d?.models||[]).filter(m=>m?.status!=='unconfigured');
    const done=models.filter(m=>m?.status==='ok'||m?.status==='error').length;
    return {done,total:models.length};
  }
  function renderLatestCache(d, message){
    if(!d?.found) return false;
    const token=cacheRenderToken(d);
    if(token!==lastRenderedCacheToken){
      lastRenderedCacheToken=token;
      renderAnalysis(d);
    }
    const note=$('#aiAnalysisState');
    if(note && message) note.textContent=message;
    return true;
  }

  async function pollAnalysisCache(deadline){
    let lastFound=null;
    let consecutiveErrors=0;
    while(Date.now()<deadline){
      try{
        const latest=await fetchCache();
        consecutiveErrors=0;
        if(latest.found){
          lastFound=latest;
          const p=modelProgress(latest);
          if(latest.complete){
            renderLatestCache(latest,'多模型分析已完成，页面已自动读取服务器本地缓存。');
            await loadStatus();
            return {complete:true,data:latest};
          }
          renderLatestCache(latest,`后台仍在生成：已完成 ${p.done}/${p.total || '?'} 个模型，页面会自动更新，无需手动刷新。`);
        }
      }catch(e){
        consecutiveErrors++;
        if(consecutiveErrors===1) console.warn('[ai-cache-poll]',e);
      }
      await wait(ANALYSIS_POLL_INTERVAL_MS);
    }
    return {complete:false,data:lastFound,timeout:true};
  }

  async function syncLatestCacheOnResume(){
    if(!seriesId) return;
    try{
      const latest=await fetchCache();
      if(!latest.found) return;
      if(latest.complete) renderLatestCache(latest,'多模型分析已完成，已自动同步服务器本地缓存。');
      else {
        const p=modelProgress(latest);
        renderLatestCache(latest,`分析仍在后台进行：已完成 ${p.done}/${p.total || '?'} 个模型。`);
      }
      await loadStatus();
    }catch(e){ console.warn('[ai-resume-sync]',e); }
  }

  async function loadAnalysisCore(){
    if(!seriesId) return;
    const grid=$('#aiAnalysisGrid'); const note=$('#aiAnalysisState');
    let hadCached=false;
    try{
      const cached=await fetchCache();
      if(cached.found){
        hadCached=true;
        renderLatestCache(cached);
        if(cached.complete){
          if(note) note.textContent='已直接读取持久化本地缓存，本次没有调用任何大模型 API。';
          await loadStatus();
          return;
        }
        if(note) note.textContent='已先显示服务器本地缓存；后台会补齐缺少的平台，页面每 2 秒自动同步。';
      }else{
        if(note) note.textContent='本场暂无服务器本地分析缓存，将对已配置模型各调用一次；页面会持续自动同步结果。';
        if(grid) grid.innerHTML='<div class="ai-loading"><span></span><b>首次生成多模型分析</b><p>仅首次可能需要几十秒；完成后页面会自动显示，无需手动刷新。</p></div>';
      }

      const deadline=Date.now()+ANALYSIS_MAX_WAIT_MS;
      const pollPromise=pollAnalysisCache(deadline);
      const requestPromise=(async()=>{
        try{
          const r=await fetch(`/api/ai/analysis?id=${encodeURIComponent(seriesId)}`,{method:'POST',cache:'no-store'});
          const d=await readApiJson(r,'AI 分析接口');
          return {kind:'request',ok:true,data:d};
        }catch(error){
          return {kind:'request',ok:false,error};
        }
      })();

      let first=await Promise.race([
        requestPromise,
        pollPromise.then(x=>({kind:'poll',...x}))
      ]);

      if(first.kind==='request' && first.ok){
        renderLatestCache(first.data,'多模型分析已完成并写入服务器本地缓存。');
        await loadStatus();
        return;
      }
      if(first.kind==='poll' && first.complete){
        return;
      }

      if(first.kind==='request' && !first.ok){
        if(note) note.textContent=`AI 请求连接已结束（${first.error.message}），后台任务可能仍在继续；正在持续读取服务器缓存，无需刷新页面。`;
        const converged=await pollPromise;
        if(converged.complete) return;
        if(converged.data){
          renderLatestCache(converged.data,'后台分析尚未全部完成；已显示当前缓存结果，可稍后自动继续同步。');
          return;
        }
        throw first.error;
      }

      // 轮询达到总等待上限时，不让页面永久保持 loading；再给原请求一个短暂收尾窗口。
      const tail=await Promise.race([requestPromise,wait(10000).then(()=>({kind:'tail-timeout'}))]);
      if(tail?.kind==='request' && tail.ok){
        renderLatestCache(tail.data,'多模型分析已完成并写入服务器本地缓存。');
        await loadStatus();
        return;
      }
      const latest=await fetchCache().catch(()=>null);
      if(latest?.found){
        renderLatestCache(latest,latest.complete?'多模型分析已完成，已自动同步服务器缓存。':'分析耗时较长，已显示当前缓存结果；切回本页时会继续自动同步。');
        return;
      }
      throw tail?.error || new Error('多模型分析等待超时，后台任务可能仍在继续');
    }catch(e){
      try{
        const latest=await fetchCache();
        if(latest.found){
          renderLatestCache(latest,latest.complete?'请求异常后已自动读取完整服务器缓存。':`请求异常，但已显示服务器当前缓存：${e.message}`);
          await loadStatus();
          return;
        }
      }catch(_){}
      if(grid && (!hadCached || !grid.children.length)) grid.innerHTML=`<div class="empty">AI 分析读取失败：${esc(e.message)}</div>`;
      if(note) note.textContent=`AI 分析服务异常：${e.message}`;
    }
  }

  async function loadAnalysis(){
    if(!seriesId) return;
    if(analysisLoadPromise) return analysisLoadPromise;
    analysisLoadPromise=loadAnalysisCore().finally(()=>{ analysisLoadPromise=null; });
    return analysisLoadPromise;
  }
  async function retryModel(providerId, button){
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
  window.addEventListener('DOMContentLoaded',()=>{
    bindRetryButtons();
    loadStatus();
    setTimeout(loadAnalysis,120);
  });
  window.addEventListener('focus',()=>{ syncLatestCacheOnResume(); });
  window.addEventListener('pageshow',()=>{ syncLatestCacheOnResume(); });
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) syncLatestCacheOnResume(); });
})();
