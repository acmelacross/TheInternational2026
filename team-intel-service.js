'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ''); }
function sha(v) { return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 24); }
function avg(nums) { const a = nums.filter(Number.isFinite); return a.length ? Math.round(a.reduce((x,y)=>x+y,0) / a.length) : null; }

function createTeamIntelService({ root, dataDir }) {
  const rosters = readJson(path.join(root, 'data', 'ti2026-rosters.json'), { teams:{} });
  const seasonEvents = readJson(path.join(root, 'data', 'season-events-2026.json'), { events:[] });
  const cacheDir = path.join(dataDir, 'team-intel');
  const globalCacheDir = path.join(dataDir, 'opendota');
  const ttlMs = Math.max(1800, Number(process.env.TEAM_INTEL_TTL_SECONDS || 21600)) * 1000;
  const listTtlMs = 24 * 3600 * 1000;
  const detailCount = Math.max(2, Math.min(10, Number(process.env.OPENDOTA_DETAIL_MATCHES || 6)));
  const apiKey = String(process.env.OPENDOTA_API_KEY || '').trim();
  const base = String(process.env.OPENDOTA_BASE_URL || 'https://api.opendota.com/api').replace(/\/+$/, '');
  fs.mkdirSync(cacheDir, { recursive:true });
  fs.mkdirSync(globalCacheDir, { recursive:true });

  function rosterFor(name) {
    const wanted = norm(name);
    for (const [canonical, value] of Object.entries(rosters.teams || {})) {
      const names = [canonical, ...(value.aliases || [])];
      if (names.some(x => norm(x) === wanted)) return { canonical, ...value };
    }
    return { canonical:name, aliases:[], players:[], coaches:[] };
  }

  async function api(endpoint) {
    const u = new URL(`${base}${endpoint}`);
    if (apiKey) u.searchParams.set('api_key', apiKey);
    const res = await fetch(u, { headers:{Accept:'application/json','User-Agent':'TI2026-Viewing-Guide/1.3.8'}, signal:AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`OpenDota HTTP ${res.status}: ${(await res.text().catch(()=>'' )).slice(0,220)}`);
    return res.json();
  }

  async function cachedGlobal(key, ttl, loader) {
    const file = path.join(globalCacheDir, `${key}.json`);
    const old = readJson(file, null);
    if (old?.fetchedAt && Date.now() - Date.parse(old.fetchedAt) < ttl) return old.data;
    const data = await loader();
    writeJson(file, { fetchedAt:new Date().toISOString(), data });
    return data;
  }

  async function allTeams() { return cachedGlobal('teams', listTtlMs, () => api('/teams')); }
  async function heroConstants() { return cachedGlobal('heroes', 7*24*3600*1000, () => api('/constants/heroes')); }

  async function resolveTeamId(name) {
    const roster = rosterFor(name);
    const names = [roster.canonical, ...(roster.aliases || [])].map(norm);
    const rows = await allTeams();
    const hits = (Array.isArray(rows) ? rows : []).filter(t => names.includes(norm(t.name)) || names.includes(norm(t.tag)));
    hits.sort((a,b) => Number(b.last_match_time || 0) - Number(a.last_match_time || 0) || Number(b.rating || 0)-Number(a.rating || 0));
    return hits[0] || null;
  }

  function summarizeTeamMatches(teamId, rows) {
    const list = (Array.isArray(rows) ? rows : []).filter(m => Number(m.start_time || 0) >= Date.parse('2026-01-01T00:00:00Z')/1000).sort((a,b)=>Number(b.start_time||0)-Number(a.start_time||0));
    const normalized = list.map(m => {
      const wasRadiant = Boolean(m.radiant);
      const won = wasRadiant === Boolean(m.radiant_win);
      return {
        matchId:m.match_id,
        at:m.start_time ? new Date(Number(m.start_time)*1000).toISOString() : null,
        league:m.league_name || '',
        opponent:m.opposing_team_name || '',
        result:won ? 'W' : 'L',
        score:wasRadiant ? `${m.radiant_score ?? '-'}:${m.dire_score ?? '-'}` : `${m.dire_score ?? '-'}:${m.radiant_score ?? '-'}`,
        duration:m.duration || null
      };
    });
    const recent20 = normalized.slice(0,20);
    const wins = recent20.filter(x=>x.result==='W').length;
    const byLeague = new Map();
    for (const m of normalized.slice(0,80)) {
      const key = m.league || 'Unknown';
      if (!byLeague.has(key)) byLeague.set(key,{league:key,games:0,wins:0,losses:0,lastAt:m.at});
      const row=byLeague.get(key); row.games++; if(m.result==='W')row.wins++; else row.losses++;
    }
    return {
      total2026:normalized.length,
      recent20:{games:recent20.length,wins,losses:recent20.length-wins,winRate:recent20.length?Math.round(wins/recent20.length*1000)/10:null},
      recentMatches:normalized.slice(0,12),
      seasonByLeague:[...byLeague.values()].sort((a,b)=>String(b.lastAt).localeCompare(String(a.lastAt))).slice(0,18)
    };
  }

  function matchCurrentPlayers(staticRoster, teamPlayers) {
    const rows = Array.isArray(teamPlayers) ? teamPlayers : [];
    return (staticRoster.players || []).map(p => {
      const wanted=[p.name,p.also].filter(Boolean).map(norm);
      const hit=rows.find(x=>wanted.includes(norm(x.name)) || wanted.includes(norm(x.personaname)));
      return { ...p, accountId:hit?.account_id || null, proGames:hit?.games_played ?? null, proWins:hit?.wins ?? null, currentFlag:hit?.is_current_team ?? null };
    });
  }

  function aggregatePlayerDetail(rosterPlayers, details, heroes) {
    const heroMap = heroes || {};
    const byAccount = new Map(rosterPlayers.filter(p=>p.accountId).map(p=>[String(p.accountId), {name:p.name,accountId:p.accountId,games:0,k:[],d:[],a:[],gpm:[],xpm:[],lh:[],heroes:new Map()}]));
    for (const match of details) {
      for (const p of match?.players || []) {
        const row=byAccount.get(String(p.account_id)); if(!row) continue;
        row.games++; row.k.push(Number(p.kills)); row.d.push(Number(p.deaths)); row.a.push(Number(p.assists)); row.gpm.push(Number(p.gold_per_min)); row.xpm.push(Number(p.xp_per_min)); row.lh.push(Number(p.last_hits));
        const hid=String(p.hero_id || ''); if(hid){const h=heroMap[hid]?.localized_name || heroMap[hid]?.name || hid; row.heroes.set(h,(row.heroes.get(h)||0)+1);}
      }
    }
    return [...byAccount.values()].map(r=>({name:r.name,accountId:r.accountId,sampleGames:r.games,avgKills:avg(r.k),avgDeaths:avg(r.d),avgAssists:avg(r.a),avgGpm:avg(r.gpm),avgXpm:avg(r.xpm),avgLastHits:avg(r.lh),recentHeroes:[...r.heroes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([hero,games])=>({hero,games}))}));
  }

  async function buildTeam(name) {
    const fixed = rosterFor(name);
    const resolved = await resolveTeamId(name);
    if (!resolved?.team_id) return { team:fixed.canonical, roster:fixed.players, coaches:fixed.coaches, source:'fixed-roster-only', error:'OpenDota 未解析到战队 ID' };
    const teamId = resolved.team_id;
    const [matches, teamPlayers, heroesPlayed, heroMap] = await Promise.all([
      api(`/teams/${teamId}/matches`), api(`/teams/${teamId}/players`), api(`/teams/${teamId}/heroes`), heroConstants()
    ]);
    const form = summarizeTeamMatches(teamId, matches);
    const currentPlayers = matchCurrentPlayers(fixed, teamPlayers);
    const ids = form.recentMatches.slice(0, detailCount).map(x=>x.matchId).filter(Boolean);
    const details=[];
    let cursor=0;
    const workers=Array.from({length:Math.min(2,ids.length)},async()=>{while(cursor<ids.length){const id=ids[cursor++];try{details.push(await api(`/matches/${id}`));}catch(_){}}});
    await Promise.all(workers);
    const playerStats = aggregatePlayerDetail(currentPlayers, details, heroMap);
    const heroPool = (Array.isArray(heroesPlayed)?heroesPlayed:[]).sort((a,b)=>Number(b.games_played||0)-Number(a.games_played||0)).slice(0,12).map(h=>({hero:heroMap[String(h.hero_id)]?.localized_name || String(h.hero_id),games:Number(h.games_played||0),wins:Number(h.wins||0),winRate:Number(h.games_played||0)?Math.round(Number(h.wins||0)/Number(h.games_played||0)*1000)/10:null}));
    return {
      team:fixed.canonical, aliases:fixed.aliases || [], coaches:fixed.coaches || [], roster:currentPlayers,
      opendota:{teamId,name:resolved.name,tag:resolved.tag,rating:resolved.rating,lastMatchTime:resolved.last_match_time},
      recentForm:form, playerStats, heroPool,
      seasonEventReference:seasonEvents.events || [],
      source:'fixed-roster+opendota', generatedAt:new Date().toISOString()
    };
  }

  async function getTeam(name, force=false) {
    const fixed=rosterFor(name); const file=path.join(cacheDir, `${sha(fixed.canonical)}.json`); const old=readJson(file,null);
    if (!force && old?.generatedAt && Date.now()-Date.parse(old.generatedAt)<ttlMs) return {...old,cached:true};
    try { const built=await buildTeam(name); writeJson(file,built); return {...built,cached:false}; }
    catch(err){ if(old) return {...old,cached:true,stale:true,refreshError:err.message}; return {team:fixed.canonical,roster:fixed.players,coaches:fixed.coaches,source:'fixed-roster-only',error:err.message,generatedAt:new Date().toISOString()}; }
  }

  async function getMatchIntel(match, force=false) {
    const teams=(match?.teams || []).map(t=>t?.name).filter(Boolean).slice(0,2);
    const result=[];
    for(const name of teams) result.push(await getTeam(name,force));
    return { generatedAt:new Date().toISOString(), teams:result, seasonEventReference:seasonEvents.events || [], policy:'固定 TI2026 阵容/教练 + OpenDota 2026 赛季与近期比赛/选手统计，情报缓存默认 6 小时。' };
  }

  return { getTeam, getMatchIntel, cacheDir };
}

module.exports={createTeamIntelService};
