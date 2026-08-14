from pathlib import Path

p=Path('server.js')
s=p.read_text()
old="""const OPENDOTA_API_KEY = String(process.env.OPENDOTA_API_KEY || '').trim();
const GAME_DETAIL_TTL_MS"""
new="""const OPENDOTA_API_KEY = String(process.env.OPENDOTA_API_KEY || '').trim();
const OPENDOTA_TI_LEAGUE_ID = Math.max(1, Number(process.env.OPENDOTA_TI_LEAGUE_ID || 19719));
const GAME_DETAIL_TTL_MS"""
assert old in s
s=s.replace(old,new,1)

marker="async function fetchOpenDotaProResults() {\n"
insert="""async function fetchOpenDotaLeagueMatches() {
  const u = new URL(`${OPENDOTA_BASE_URL}/leagues/${OPENDOTA_TI_LEAGUE_ID}/matches`);
  if (OPENDOTA_API_KEY) u.searchParams.set('api_key', OPENDOTA_API_KEY);
  const res = await fetch(u, {
    headers: { 'Accept':'application/json', 'User-Agent':`${APP_NAME}/1.3 (${CONTACT_EMAIL || 'TI2026 viewing guide'})` },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`OpenDota league HTTP ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

function mergeOpenDotaGameRows(leagueRows, proRows) {
  const proById = new Map();
  const teamNames = new Map();
  for (const r of proRows || []) {
    const id = String(r?.match_id || '');
    if (id) proById.set(id, r);
    const rid = Number(r?.radiant_team_id || 0), did = Number(r?.dire_team_id || 0);
    if (rid && r?.radiant_name) teamNames.set(rid, canonicalTeamName(r.radiant_name));
    if (did && r?.dire_name) teamNames.set(did, canonicalTeamName(r.dire_name));
  }
  const out = new Map();
  for (const raw of leagueRows || []) {
    const id = String(raw?.match_id || '');
    if (!id) continue;
    const rich = proById.get(id) || {};
    const rid = Number(raw?.radiant_team_id ?? rich?.radiant_team_id ?? 0);
    const did = Number(raw?.dire_team_id ?? rich?.dire_team_id ?? 0);
    out.set(id, {
      ...raw,
      ...rich,
      leagueid: Number(rich?.leagueid ?? raw?.leagueid ?? OPENDOTA_TI_LEAGUE_ID),
      league_name: rich?.league_name || raw?.league_name || 'The International 2026',
      radiant_name: rich?.radiant_name || raw?.radiant_name || teamNames.get(rid) || '',
      dire_name: rich?.dire_name || raw?.dire_name || teamNames.get(did) || '',
      _openDotaSources: rich?.match_id ? ['league','proMatches'] : ['league']
    });
  }
  for (const r of proRows || []) {
    const id = String(r?.match_id || '');
    if (!id) continue;
    if (!out.has(id)) out.set(id, { ...r, _openDotaSources:['proMatches'] });
  }
  return [...out.values()].sort((a,b)=>Number(a?.start_time||0)-Number(b?.start_time||0));
}

async function fetchOpenDotaProResults() {
"""
assert marker in s
s=s.replace(marker,insert,1)

start=s.index('async function buildPayload() {')
end=s.index('\nasync function refresh(force = false)', start)
new_build="""async function buildPayload() {
  const errors = [];
  const sources = {
    liquipedia: { status: LIQUIPEDIA_API_KEY ? 'pending' : 'disabled', reason: LIQUIPEDIA_API_KEY ? null : 'missing_api_key', count: 0 },
    publicUpcoming: { status: PUBLIC_FALLBACK_ENABLED ? 'pending' : 'disabled', count: 0 },
    openDotaLeague: { status: 'pending', leagueId: OPENDOTA_TI_LEAGUE_ID, count: 0 },
    openDotaProMatches: { status: 'pending', count: 0 },
    openDotaLive: { status: 'pending', count: 0 }
  };

  let lp = { matches: [], meta: { enabled: false, reason: 'missing_api_key' } };
  if (LIQUIPEDIA_API_KEY) {
    try {
      lp = await fetchLiquipediaMatches();
      sources.liquipedia = { status:'ok', count:lp.matches.length, meta:lp.meta };
    } catch (err) {
      sources.liquipedia = { status:'error', count:0, error:err.message };
      errors.push(`Liquipedia: ${err.message}`);
    }
  }

  let publicUpcoming = [];
  if (!lp.matches.length && PUBLIC_FALLBACK_ENABLED) {
    try {
      publicUpcoming = await fetchPublicUpcoming();
      sources.publicUpcoming = { status:'ok', count:publicUpcoming.length };
    } catch (err) {
      sources.publicUpcoming = { status:'error', count:0, error:err.message };
      errors.push(`Public fallback: ${err.message}`);
    }
  } else if (lp.matches.length) {
    sources.publicUpcoming = { status:'standby', count:0, reason:'liquipedia_available' };
  }

  let openDotaLeague = [];
  try {
    openDotaLeague = await fetchOpenDotaLeagueMatches();
    sources.openDotaLeague = { status:'ok', leagueId:OPENDOTA_TI_LEAGUE_ID, count:openDotaLeague.length };
  } catch (err) {
    sources.openDotaLeague = { status:'error', leagueId:OPENDOTA_TI_LEAGUE_ID, count:0, error:err.message };
    errors.push(`OpenDota league ${OPENDOTA_TI_LEAGUE_ID}: ${err.message}`);
  }

  let openDotaPro = [];
  try {
    openDotaPro = await fetchOpenDotaProResults();
    sources.openDotaProMatches = { status:'ok', count:openDotaPro.length };
  } catch (err) {
    sources.openDotaProMatches = { status:'error', count:0, error:err.message };
    errors.push(`OpenDota proMatches: ${err.message}`);
  }
  const openDotaResults = mergeOpenDotaGameRows(openDotaLeague, openDotaPro);

  let openDotaLive = [];
  try {
    openDotaLive = await fetchOpenDotaLive();
    const tiLeagueIds = new Set([OPENDOTA_TI_LEAGUE_ID]);
    const tiLive = openDotaLive.filter(r => isTiOpenDotaRow(r, tiLeagueIds));
    sources.openDotaLive = { status:'ok', count:tiLive.length, totalReturned:openDotaLive.length };
  } catch (err) {
    sources.openDotaLive = { status:'error', count:0, error:err.message };
    errors.push(`OpenDota live: ${err.message}`);
  }

  const mergedMatches = mergeMatches(seed.matches, publicUpcoming, lp.matches);
  const scoredMatches = applyOpenDotaScores(mergedMatches, openDotaResults);
  const matches = mergeOpenDotaSourcePairings(scoredMatches, openDotaResults, openDotaLive).map(decorateMatch);
  const teams = deriveTeams(matches);
  const standings = deriveStandings(matches, teams);
  const baseSource = lp.matches.length ? 'liquipedia' : publicUpcoming.length ? 'public+seed' : 'seed';
  const source = openDotaResults.length ? `${baseSource}+opendota-league` : baseSource;

  return {
    event: seed.event,
    teams,
    matches,
    standings,
    timeline: seed.timeline,
    chinaTeams: seed.chinaTeams || [],
    chinaTeamProfiles: seed.chinaTeamProfiles || [],
    streams: seed.streams || [],
    teamAssets: seed.teamAssets || {},
    teamAssetMeta: seed.teamAssetMeta || {},
    source,
    generatedAt: new Date().toISOString(),
    cacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
    dataStatus: {
      liquipediaConfigured: Boolean(LIQUIPEDIA_API_KEY),
      liquipedia: lp.meta,
      publicFallbackEnabled: PUBLIC_FALLBACK_ENABLED,
      publicUpcomingCount: publicUpcoming.length,
      openDotaLeagueId: OPENDOTA_TI_LEAGUE_ID,
      openDotaLeagueCount: openDotaLeague.length,
      openDotaProMatchCount: openDotaPro.length,
      openDotaResultCount: openDotaResults.length,
      openDotaLiveCount: sources.openDotaLive.count,
      liveRefreshSeconds: LIVE_REFRESH_SECONDS,
      seedCount: seed.matches.length,
      sources,
      errors
    },
    attribution: `赛程与对阵优先 Liquipedia/已公布赛程；OpenDota league ${OPENDOTA_TI_LEAGUE_ID} + proMatches + live 用于 TI2026 Match ID、已完成小局、实时状态与比分。系统不根据战绩自行推算对阵，并按约 ${LIVE_REFRESH_SECONDS} 秒周期刷新。`
  };
}
"""
s=s[:start]+new_build+s[end:]

old_health="return sendJson(res, 200, { ok: true, service: 'ti2026-viewing-guide', version: '1.3.9', dataDir: DATA_DIR, autoRefreshSeconds: Math.round(AUTO_REFRESH_INTERVAL_MS/1000), liquipediaConfigured: Boolean(LIQUIPEDIA_API_KEY), aiProvidersConfigured: aiService.configuredCount(), now: new Date().toISOString() });"
new_health="return sendJson(res, 200, { ok: true, service: 'ti2026-viewing-guide', version: '1.3.9', dataDir: DATA_DIR, autoRefreshSeconds: Math.round(AUTO_REFRESH_INTERVAL_MS/1000), liquipediaConfigured: Boolean(LIQUIPEDIA_API_KEY), openDotaLeagueId: OPENDOTA_TI_LEAGUE_ID, dataSources: memoryCache?.dataStatus?.sources || null, aiProvidersConfigured: aiService.configuredCount(), now: new Date().toISOString() });"
assert old_health in s
s=s.replace(old_health,new_health,1)

anchor="""    if (u.pathname === '/api/ti2026') {
      const data = await refresh(false);
      return sendJson(res, 200, data);
    }
"""
replacement=anchor+"""    if (u.pathname === '/api/source-health') {
      const data = await refresh(false);
      return sendJson(res, 200, { generatedAt:data.generatedAt, source:data.source, refreshSeconds:LIVE_REFRESH_SECONDS, sources:data.dataStatus?.sources || {}, errors:data.dataStatus?.errors || [] });
    }
"""
assert anchor in s
s=s.replace(anchor,replacement,1)
p.write_text(s)

p=Path('public/app.js')
s=p.read_text()
old="""  const src = String(d.source||'').includes('opendota') ? '已公布赛程 + OpenDota 实况' : d.source === 'liquipedia' ? 'Liquipedia 自动更新' : d.source === 'public+seed' ? '公共赛程 + 内置' : '内置赛程';
  $('#sourceBadge').textContent = src;
  $('#sourceBadge').title = (d.dataStatus?.errors || []).join('\\n');
  $('#updatedAt').textContent = fmtUpdated.format(new Date(d.generatedAt));
  $('#dataDetail').textContent = String(d.source||'').includes('opendota') ? `对阵/比分：外部数据源 · 约 ${d.dataStatus?.liveRefreshSeconds||120} 秒同步` : d.source === 'liquipedia' ? 'Liquipedia LPDB v3 已连接' : d.dataStatus?.liquipediaConfigured ? 'Liquipedia 暂不可用，已自动降级' : '未配置 Liquipedia Key，当前使用已公布赛程';
"""
new="""  const src = String(d.source||'').includes('opendota') ? `已公布赛程 + OpenDota ${d.dataStatus?.openDotaLeagueId||19719}` : d.source === 'liquipedia' ? 'Liquipedia 自动更新' : d.source === 'public+seed' ? '公共赛程 + 内置' : '内置赛程';
  $('#sourceBadge').textContent = src;
  const hs=d.dataStatus?.sources||{};
  const healthText=[
    `LPDB ${hs.liquipedia?.status==='ok'?'正常':hs.liquipedia?.status==='disabled'?'等待Key':'异常'}`,
    `OD赛事 ${hs.openDotaLeague?.status==='ok'?(hs.openDotaLeague.count??0)+'局':'异常'}`,
    `Pro ${hs.openDotaProMatches?.status==='ok'?(hs.openDotaProMatches.count??0)+'局':'异常'}`,
    `Live ${hs.openDotaLive?.status==='ok'?(hs.openDotaLive.count??0)+'场':'异常'}`
  ].join(' · ');
  const sourceErrors=Object.entries(hs).filter(([,v])=>v?.error).map(([k,v])=>`${k}: ${v.error}`);
  $('#sourceBadge').title = [...sourceErrors,...(d.dataStatus?.errors || [])].join('\\n');
  $('#updatedAt').textContent = fmtUpdated.format(new Date(d.generatedAt));
  $('#dataDetail').textContent = healthText || '数据源状态等待刷新';
"""
assert old in s
s=s.replace(old,new,1)
p.write_text(s)

p=Path('.env.example')
s=p.read_text()
if 'OPENDOTA_TI_LEAGUE_ID=' not in s:
    s=s.replace('OPENDOTA_BASE_URL=https://api.opendota.com/api\n','OPENDOTA_BASE_URL=https://api.opendota.com/api\nOPENDOTA_TI_LEAGUE_ID=19719\n')
p.write_text(s)
