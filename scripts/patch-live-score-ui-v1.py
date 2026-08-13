from pathlib import Path

# 1) Compact AI status UI
css = Path('public/v135.css')
s = css.read_text(encoding='utf-8')
marker = '/* compact AI status v1 */'
if marker not in s:
    s += r'''

/* compact AI status v1 */
.ai-analysis-section{padding-top:24px!important;padding-bottom:28px!important}
.ai-analysis-section .section-heading{margin-bottom:8px!important;align-items:center}
.ai-analysis-section .section-heading h2{font-size:20px!important;margin-top:3px}
.ai-analysis-section .section-desc{font-size:10px!important;line-height:1.4;margin-top:4px}
.ai-once-badge{padding:4px 8px!important;font-size:9px!important}
.ai-model-status{grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:5px!important;margin-bottom:8px!important}
.ai-status{grid-template-columns:6px minmax(0,1fr) auto!important;gap:5px!important;padding:6px 7px!important;min-height:34px!important}
.ai-status .ai-dot{width:6px!important;height:6px!important;box-shadow:none!important}
.ai-status b{font-size:9px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ai-status small,.ai-status em{display:none!important}
.ai-status strong{font-size:8px!important;white-space:nowrap}
.ai-consensus{margin:7px 0 9px!important;padding:9px 11px!important}
.ai-consensus-main{gap:8px!important}.ai-consensus-main span{font-size:9px!important}.ai-consensus-main strong{font-size:17px!important}.ai-consensus-main em{font-size:9px!important}
.ai-consensus-votes{margin-top:5px!important;gap:5px!important}.ai-consensus-votes span{padding:4px 6px!important;font-size:9px!important}
.ai-analysis-state{margin:0 0 8px!important;font-size:9px!important}
@media(max-width:1200px){.ai-model-status{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media(max-width:600px){.ai-model-status{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ai-analysis-section{padding-top:18px!important}.ai-analysis-section .section-desc{font-size:9px!important}}
'''
css.write_text(s, encoding='utf-8')

# 2) AI cache 404/not_found compatibility
p = Path('public/ai-analysis.js')
s = p.read_text(encoding='utf-8')
old = '''  async function fetchCache(){
    const r=await fetch(`/api/ai/cache?id=${encodeURIComponent(seriesId)}`,{cache:'no-store'});
    return readApiJson(r,'AI 缓存接口');
  }
'''
new = '''  async function fetchCache(){
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
'''
if old not in s:
    raise SystemExit('ai fetchCache marker not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# 3) Frontend poll every minute
p = Path('public/app.js')
s = p.read_text(encoding='utf-8')
old = 'setInterval(() => load(false), 5 * 60 * 1000);'
new = 'setInterval(() => load(false), 60 * 1000);'
if old not in s:
    raise SystemExit('app polling marker not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# 4) Server: 2-minute live refresh + OpenDota completed-game score overlay
p = Path('server.js')
s = p.read_text(encoding='utf-8')
old = "const AUTO_REFRESH_INTERVAL_MS = Math.max(3600, Number(process.env.AUTO_REFRESH_INTERVAL_SECONDS || 3600)) * 1000;\nconst CACHE_TTL_MS = Math.max(AUTO_REFRESH_INTERVAL_MS, Math.max(60, Number(process.env.CACHE_TTL_SECONDS || 3600)) * 1000);"
new = "const LIVE_REFRESH_SECONDS = Math.max(60, Number(process.env.LIVE_REFRESH_INTERVAL_SECONDS || 120));\nconst AUTO_REFRESH_INTERVAL_MS = LIVE_REFRESH_SECONDS * 1000;\nconst CACHE_TTL_MS = AUTO_REFRESH_INTERVAL_MS;"
if old not in s:
    raise SystemExit('server refresh marker not found')
s = s.replace(old, new, 1)

old = "const DOTA2DB_API = 'https://liquipedia.net/dota2/api.php';\nconst GAME_DETAIL_TTL_MS"
new = "const DOTA2DB_API = 'https://liquipedia.net/dota2/api.php';\nconst OPENDOTA_BASE_URL = String(process.env.OPENDOTA_BASE_URL || 'https://api.opendota.com/api').replace(/\\/+$/, '');\nconst OPENDOTA_API_KEY = String(process.env.OPENDOTA_API_KEY || '').trim();\nconst GAME_DETAIL_TTL_MS"
if old not in s:
    raise SystemExit('server OpenDota constant marker not found')
s = s.replace(old, new, 1)

insert_marker = 'function matchKey(m) {'
helper = r'''async function fetchOpenDotaProResults() {
  const u = new URL(`${OPENDOTA_BASE_URL}/proMatches`);
  if (OPENDOTA_API_KEY) u.searchParams.set('api_key', OPENDOTA_API_KEY);
  const res = await fetch(u, {
    headers: { 'Accept':'application/json', 'User-Agent':`${APP_NAME}/1.3 (${CONTACT_EMAIL || 'TI2026 viewing guide'})` },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`OpenDota HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  const from = Date.parse('2026-08-12T00:00:00Z') / 1000;
  const to = Date.parse('2026-08-24T23:59:59Z') / 1000;
  return rows.filter(r => {
    const league = String(r?.league_name || '').toLowerCase();
    const at = Number(r?.start_time || 0);
    return at >= from && at <= to && league.includes('international');
  });
}

function openDotaPairKey(a, b) {
  return [nameKey(canonicalTeamName(a)), nameKey(canonicalTeamName(b))].sort().join('|');
}

function applyOpenDotaScores(matches, rows) {
  if (!Array.isArray(rows) || !rows.length) return matches;
  const groups = new Map();
  for (const r of rows) {
    const radiant = canonicalTeamName(r?.radiant_name || '');
    const dire = canonicalTeamName(r?.dire_name || '');
    if (!radiant || !dire) continue;
    const pairKey = openDotaPairKey(radiant, dire);
    const at = Number(r?.start_time || 0) * 1000;
    const seriesId = Number(r?.series_id || 0);
    const groupKey = seriesId > 0 ? `series:${seriesId}` : `pair:${pairKey}:${Math.floor(at/(4*3600000))}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { pairKey, firstAt:at, games:[] });
    const g = groups.get(groupKey);
    g.firstAt = Math.min(g.firstAt || at, at);
    g.games.push({ ...r, radiant, dire, at });
  }
  const all = [...groups.values()];
  return (matches || []).map(m => {
    const a = m?.teams?.[0]?.name || '';
    const b = m?.teams?.[1]?.name || '';
    if (!a || !b || a === '待定' || b === '待定') return m;
    const pairKey = openDotaPairKey(a, b);
    const scheduledAt = Date.parse(m.startsAt || '') || 0;
    const candidates = all.filter(g => g.pairKey === pairKey && Math.abs(g.firstAt - scheduledAt) <= 8*3600000)
      .sort((x,y) => Math.abs(x.firstAt-scheduledAt)-Math.abs(y.firstAt-scheduledAt));
    const g = candidates[0];
    if (!g) return m;
    const scores = new Map([[nameKey(canonicalTeamName(a)),0],[nameKey(canonicalTeamName(b)),0]]);
    const matchIds = new Set(m.matchIds || []);
    for (const game of g.games) {
      if (game.match_id) matchIds.add(String(game.match_id));
      const radiantWon = game.radiant_win === true || game.radiant_win === 1 || String(game.radiant_win).toLowerCase() === 'true';
      const winner = radiantWon ? game.radiant : game.dire;
      const key = nameKey(canonicalTeamName(winner));
      if (scores.has(key)) scores.set(key, scores.get(key) + 1);
    }
    const bestOf = Number(m.bestOf || 3);
    const winsNeeded = Math.floor(bestOf/2) + 1;
    const teams = (m.teams || []).map(t => ({ ...t, score:scores.get(nameKey(canonicalTeamName(t.name))) ?? t.score ?? 0 }));
    const maxScore = Math.max(...teams.map(t => Number(t.score || 0)));
    const finished = maxScore >= winsNeeded;
    if (finished) teams.forEach(t => { t.winner = Number(t.score || 0) === maxScore; });
    const now = Date.now();
    const activeWindow = now >= scheduledAt - 15*60000 && now <= scheduledAt + 8*3600000;
    const status = finished ? 'finished' : (g.games.length && activeWindow ? 'live' : m.status);
    return {
      ...m,
      teams,
      status,
      matchIds:[...matchIds],
      scoreSource:'OpenDota proMatches',
      scoreUpdatedAt:new Date().toISOString()
    };
  });
}

'''
if insert_marker not in s:
    raise SystemExit('server matchKey insertion marker not found')
s = s.replace(insert_marker, helper + insert_marker, 1)

old = '''  let publicUpcoming = [];
  if (!lp.matches.length) {
    try { publicUpcoming = await fetchPublicUpcoming(); }
    catch (err) { errors.push(`Public fallback: ${err.message}`); }
  }

  const matches = mergeMatches(seed.matches, publicUpcoming, lp.matches).map(decorateMatch);
  const teams = deriveTeams(matches);
  const standings = deriveStandings(matches, teams);
  const source = lp.matches.length ? 'liquipedia' : publicUpcoming.length ? 'public+seed' : 'seed';
'''
new = '''  let publicUpcoming = [];
  if (!lp.matches.length) {
    try { publicUpcoming = await fetchPublicUpcoming(); }
    catch (err) { errors.push(`Public fallback: ${err.message}`); }
  }

  let openDotaResults = [];
  try { openDotaResults = await fetchOpenDotaProResults(); }
  catch (err) { errors.push(`OpenDota scores: ${err.message}`); }

  const mergedMatches = mergeMatches(seed.matches, publicUpcoming, lp.matches);
  const matches = applyOpenDotaScores(mergedMatches, openDotaResults).map(decorateMatch);
  const teams = deriveTeams(matches);
  const standings = deriveStandings(matches, teams);
  const baseSource = lp.matches.length ? 'liquipedia' : publicUpcoming.length ? 'public+seed' : 'seed';
  const source = openDotaResults.length ? `${baseSource}+opendota` : baseSource;
'''
if old not in s:
    raise SystemExit('server buildPayload marker not found')
s = s.replace(old, new, 1)

old = '''      publicFallbackEnabled: PUBLIC_FALLBACK_ENABLED,
      publicUpcomingCount: publicUpcoming.length,
      seedCount: seed.matches.length,
      errors
    },
    attribution: '赛程数据优先来自 Liquipedia LPDB v3；Liquipedia 数据遵循 CC BY-SA 3.0。无 API Key 时使用内置已公布赛程与公共赛程降级源。'
'''
new = '''      publicFallbackEnabled: PUBLIC_FALLBACK_ENABLED,
      publicUpcomingCount: publicUpcoming.length,
      openDotaResultCount: openDotaResults.length,
      liveRefreshSeconds: LIVE_REFRESH_SECONDS,
      seedCount: seed.matches.length,
      errors
    },
    attribution: '赛程优先来自 Liquipedia LPDB v3；无 Liquipedia API Key 时使用内置赛程与公共 upcoming 源。已结束逐局结果与系列赛比分由 OpenDota proMatches 补充，并按约 2 分钟周期刷新。'
'''
if old not in s:
    raise SystemExit('server attribution marker not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# 5) Source label understands OpenDota overlay
p = Path('public/app.js')
s = p.read_text(encoding='utf-8')
old = "  const src = d.source === 'liquipedia' ? 'Liquipedia 自动更新' : d.source === 'public+seed' ? '公共赛程 + 内置' : '内置赛程';"
new = "  const src = String(d.source||'').includes('opendota') ? '赛程 + OpenDota 比分' : d.source === 'liquipedia' ? 'Liquipedia 自动更新' : d.source === 'public+seed' ? '公共赛程 + 内置' : '内置赛程';"
if old not in s:
    raise SystemExit('app source label marker not found')
s = s.replace(old, new, 1)
old = "  $('#dataDetail').textContent = d.source === 'liquipedia' ? 'Liquipedia LPDB v3 已连接' : d.dataStatus?.liquipediaConfigured ? 'Liquipedia 暂不可用，已自动降级' : '未配置 Liquipedia Key，当前使用已公布赛程';"
new = "  $('#dataDetail').textContent = String(d.source||'').includes('opendota') ? `比分：OpenDota · 约 ${d.dataStatus?.liveRefreshSeconds||120} 秒同步` : d.source === 'liquipedia' ? 'Liquipedia LPDB v3 已连接' : d.dataStatus?.liquipediaConfigured ? 'Liquipedia 暂不可用，已自动降级' : '未配置 Liquipedia Key，当前使用已公布赛程';"
if old not in s:
    raise SystemExit('app data detail marker not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# 6) env example documents the new live refresh cadence
p = Path('.env.example')
s = p.read_text(encoding='utf-8')
if 'LIVE_REFRESH_INTERVAL_SECONDS=' not in s:
    s = s.replace('CACHE_TTL_SECONDS=3600\nAUTO_REFRESH_INTERVAL_SECONDS=3600\n', 'CACHE_TTL_SECONDS=3600\nAUTO_REFRESH_INTERVAL_SECONDS=3600\nLIVE_REFRESH_INTERVAL_SECONDS=120\n', 1)
p.write_text(s, encoding='utf-8')
