(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const q = new URLSearchParams(location.search);
  const seriesId = q.get('id');

  function statusClass(state){ return state === 'connected' || state === 'ok' ? 'ok' : state === 'failed' || state === 'error' ? 'bad' : state === 'unconfigured' ? 'off' : 'wait'; }
  function statusText(state){ return ({connected:'已连通',ok:'已连通',failed:'失败',error:'失败',unconfigured:'未配置',untested:'待首次调用'})[state] || '待检测'; }
  function renderStatuses(data){
    const box = $('#aiModelStatus'); if(!box) return;
    box.innerHTML = (data.providers || []).map(p => `<div class="ai-status ${statusClass(p.state)}"><span class="ai-dot"></span><div><b>${esc(p.name)}</b><small>${esc(p.model)}</small></div><strong>${statusText(p.state)}</strong>${p.reason ? `<em title="${esc(p.reason)}">${esc(p.reason)}</em>` : ''}</div>`).join('');
  }
  function reasonList(items){ return (items || []).length ? `<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="ai-muted">暂无结构化理由</span>'; }
  function analysisCard(m){
    if(m.status === 'unconfigured') return `<article class="ai-model-card off"><div class="ai-model-head"><div><span>${esc(m.vendor)}</span><h3>${esc(m.name)}</h3><small>${esc(m.model)}</small></div><b>未配置</b></div><p class="ai-error">服务器未配置该平台 API Key。</p></article>`;
    if(m.status === 'error') return `<article class="ai-model-card error"><div class="ai-model-head"><div><span>${esc(m.vendor)}</span><h3>${esc(m.name)}</h3><small>${esc(m.model)}</small></div><b>调用失败</b></div><p class="ai-error">${esc(m.error || '未知错误')}</p><div class="ai-cache-note">失败状态也已缓存，不会自动重复扣费调用。</div></article>`;
    if(m.status !== 'ok') return `<article class="ai-model-card"><div class="ai-model-head"><div><span>${esc(m.vendor)}</span><h3>${esc(m.name)}</h3><small>${esc(m.model)}</small></div><b>等待</b></div></article>`;
    const a=m.analysis||{};
    return `<article class="ai-model-card ok"><div class="ai-model-head"><div><span>${esc(m.vendor)}</span><h3>${esc(m.name)}</h3><small>${esc(m.model)}</small></div><b>${esc(a.confidence || 0)}%</b></div><div class="ai-pick"><span>倾向</span><strong>${esc(a.winnerLean || '势均力敌')}</strong><em>${esc(a.scorePrediction || '待定')}</em></div><p class="ai-summary">${esc(a.summary || m.rawText || '暂无摘要')}</p><div class="ai-mini-grid"><div><h4>主要理由</h4>${reasonList(a.keyReasons)}</div><div><h4>比赛看点</h4>${reasonList(a.watchPoints)}</div></div>${a.risks?`<div class="ai-risk"><b>不确定性</b><span>${esc(a.risks)}</span></div>`:''}<div class="ai-cache-note">${m.cached?'已读取本地缓存':'首次调用已完成并缓存'}</div></article>`;
  }
  function renderConsensus(d){
    const el=$('#aiConsensus'); if(!el) return;
    const a=d.aggregate||{}; const lead=a.leader;
    if(!lead){ el.innerHTML=`<div class="ai-consensus-empty">已有 ${a.totalSuccessful||0} 个模型返回结果，暂未形成明确多数倾向。</div>`; return; }
    const rows=(a.ranking||[]).filter(x=>x.votes>0).map(x=>`<span><b>${esc(x.team)}</b> ${x.votes}票 · 平均信心 ${x.avgConfidence}%</span>`).join('');
    el.innerHTML=`<div class="ai-consensus-main"><span>多模型综合倾向</span><strong>${esc(lead.team)}</strong><em>${lead.votes} / ${a.totalSuccessful||0} 票</em></div><div class="ai-consensus-votes">${rows}</div>`;
  }
  async function loadStatus(){
    if(!seriesId) return;
    try{ const r=await fetch(`/api/ai/status?id=${encodeURIComponent(seriesId)}`,{cache:'no-store'}); const d=await r.json(); if(r.ok) renderStatuses(d); }catch(e){ console.warn(e); }
  }
  async function loadAnalysis(){
    if(!seriesId) return;
    const grid=$('#aiAnalysisGrid'); const note=$('#aiAnalysisState');
    if(note) note.textContent='正在读取缓存；若本场尚未分析，将对已配置的模型各调用一次。';
    if(grid) grid.innerHTML='<div class="ai-loading"><span></span><b>多模型分析中</b><p>首次生成可能需要几十秒，之后刷新只读取本地缓存。</p></div>';
    try{
      const r=await fetch(`/api/ai/analysis?id=${encodeURIComponent(seriesId)}`,{method:'POST',cache:'no-store'}); const d=await r.json();
      if(!r.ok) throw new Error(d.message||d.error||`HTTP ${r.status}`);
      if(grid) grid.innerHTML=(d.models||[]).map(analysisCard).join('');
      renderConsensus(d);
      if(note) note.textContent=d.policy||'分析结果已缓存。';
      await loadStatus();
    }catch(e){ if(grid) grid.innerHTML=`<div class="empty">AI 分析读取失败：${esc(e.message)}</div>`; if(note) note.textContent='AI 分析服务异常'; }
  }
  window.addEventListener('DOMContentLoaded',()=>{ loadStatus(); setTimeout(loadAnalysis,250); });
})();
