const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL, URLSearchParams } = require('url');
const { createAiService } = require('./ai-service');
const { createTeamIntelService } = require('./team-intel-service');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const SEED_PATH = path.join(ROOT, 'data', 'seed.json');

loadDotEnv(path.join(ROOT, '.env'));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'cache'));
const CACHE_PATH = path.join(DATA_DIR, 'ti2026.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const PORT = Number(process.env.PORT || 17826);
const CACHE_TTL_MS = Math.max(60, Number(process.env.CACHE_TTL_SECONDS || 300)) * 1000;
const LIQUIPEDIA_API_KEY = (process.env.LIQUIPEDIA_API_KEY || '').trim();
const PUBLIC_FALLBACK_ENABLED = String(process.env.PUBLIC_FALLBACK_ENABLED || 'true').toLowerCase() !== 'false';
const APP_NAME = process.env.APP_NAME || 'TI2026-Viewing-Guide';
const CONTACT_EMAIL = (process.env.CONTACT_EMAIL || '').trim();
const LP_BASE = 'https://api.liquipedia.net/api/v3/';
const PUBLIC_MATCHES_API = 'https://dota.haglund.dev/v1/matches';
const DOTA2DB_API = 'https://liquipedia.net/dota2/api.php';
const GAME_DETAIL_TTL_MS = Math.max(60, Number(process.env.GAME_DETAIL_TTL_SECONDS || 300)) * 1000;
const gameDetailCache = new Map();

const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
const aiService = createAiService({ root: ROOT, dataDir: DATA_DIR });
const teamIntelService = createTeamIntelService({ root: ROOT, dataDir: DATA_DIR });

const TEAM_NAME_ALIASES = new Map([
  ['1wteam', 'Iron Wing'], ['1winteam', 'Iron Wing'], ['tundraesports', 'Iron Wing'],
  ['parivision', 'Team VISION'], ['teamvision', 'Team VISION'],
  ['betboomteam', 'BoomBoys'], ['bbteam', 'BoomBoys'],
  ['l1gateam', 'HULIGANI'], ['aurora', 'Aurora Gaming']
]);
function canonicalTeamName(name) {
  const raw = String(name || '').trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '');
  return TEAM_NAME_ALIASES.get(key) || raw;
}
let memoryCache = readDiskCache();
let refreshPromise = null;
let lastManualRefreshAt = 0;

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function readDiskCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (parsed && parsed.generatedAt && Array.isArray(parsed.matches)) return parsed;
  } catch (_) {}
  return null;
}

function writeDiskCache(payload) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('[cache] write failed:', err.message);
  }
}

function cacheFresh(cache) {
  if (!cache?.generatedAt) return false;
  const t = Date.parse(cache.generatedAt);
  return Number.isFinite(t) && Date.now() - t < CACHE_TTL_MS;
}

function lpHeaders() {
  const headers = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip',
    'User-Agent': `${APP_NAME}/1.3 (${CONTACT_EMAIL || 'TI2026 viewing guide'})`
  };
  if (LIQUIPEDIA_API_KEY) headers.Authorization = `Apikey ${LIQUIPEDIA_API_KEY}`;
  return headers;
}

async function lpGet(endpoint, params) {
  const u = new URL(endpoint, LP_BASE);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  const res = await fetch(u, { headers: lpHeaders(), signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Liquipedia HTTP ${res.status}: ${text.slice(0, 260)}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  if (body?.error?.length) throw new Error(`Liquipedia API: ${JSON.stringify(body.error)}`);
  return Array.isArray(body?.result) ? body.result : [];
}

async function findTiTournament() {
  const candidates = [
    '[[name::The International 2026]]',
    '[[pagename::The International/2026]]',
    '[[shortname::TI 2026]]'
  ];
  for (const conditions of candidates) {
    const rows = await lpGet('tournament', {
      wiki: 'dota2', conditions, limit: 20,
      query: 'pagename,name,shortname,tickername,startdate,enddate,status'
    });
    if (rows.length) return rows[0];
  }
  return null;
}

async function fetchLiquipediaMatches() {
  if (!LIQUIPEDIA_API_KEY) return { matches: [], meta: { enabled: false, reason: 'missing_api_key' } };

  const tournament = await findTiTournament();
  const filters = [];
  if (tournament?.pagename) {
    filters.push(`[[parent::${tournament.pagename}]]`);
    filters.push(`[[tournament::${tournament.pagename}]]`);
  }
  if (tournament?.name) filters.push(`[[tournament::${tournament.name}]]`);
  filters.push('[[date::>2026-08-12 00:00:00]][[date::<2026-08-24 23:59:59]]');

  let rows = [];
  let usedFilter = null;
  for (const conditions of filters) {
    const candidate = await lpGet('match', {
      wiki: 'dota2',
      conditions,
      limit: 250,
      order: 'date ASC',
      rawstreams: 'true',
      streamurls: 'true'
    });
    const tiRows = candidate.filter(isLikelyTi2026Match);
    if (tiRows.length) {
      rows = tiRows;
      usedFilter = conditions;
      break;
    }
  }

  return {
    matches: rows.map(normalizeLpMatch).filter(Boolean),
    meta: {
      enabled: true,
      tournament: tournament || null,
      rows: rows.length,
      usedFilter
    }
  };
}

function isLikelyTi2026Match(m) {
  const hay = [m?.pagename, m?.tournament, m?.parent, m?.tickername, m?.shortname, m?.series]
    .filter(Boolean).join(' ').toLowerCase();
  const date = normalizeLpDate(m?.date);
  const inWindow = date ? (Date.parse(date) >= Date.parse('2026-08-12T00:00:00Z') && Date.parse(date) <= Date.parse('2026-08-24T23:59:59Z')) : false;
  return inWindow && (hay.includes('international') || hay.includes('ti15') || hay.includes('the international/2026'));
}

function normalizeLpDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const raw = String(value).trim();
  if (!raw) return null;
  if (/([zZ]|[+-]\d\d:?\d\d)$/.test(raw)) {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  const isoLike = raw.replace(' ', 'T') + 'Z';
  const t = Date.parse(isoLike);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function normalizeOpponent(op, idx, winner) {
  if (op == null) return { name: '待定', score: null, winner: false };
  if (typeof op === 'string') return { name: canonicalTeamName(op) || '待定', score: null, winner: String(winner) === String(idx + 1) };
  const name = op.name || op.opponentname || op.template || op.team || op.pagename || op.id || '待定';
  let score = op.score;
  if (score === undefined || score === null || score === '') score = op.gamescore ?? op.matchscore ?? null;
  const won = Boolean(op.winner === true || op.winner === 1 || String(winner) === String(idx + 1));
  return { name: canonicalTeamName(name), score: score === null ? null : Number.isNaN(Number(score)) ? String(score) : Number(score), winner: won };
}

function extractStream(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const v = extractStream(item);
      if (v) return v;
    }
    return null;
  }
  if (typeof raw === 'object') {
    return raw.url || raw.link || raw.streamurl || raw.raw || null;
  }
  return null;
}

function normalizeStatus(row, teams) {
  if (Number(row.finished) === 1 || String(row.status || '').toLowerCase().includes('finished')) return 'finished';
  const rawStatus = String(row.status || '').toLowerCase();
  if (rawStatus.includes('live') || rawStatus.includes('ongoing') || rawStatus.includes('running')) return 'live';
  if (teams.some(t => !t.name || t.name === '待定')) return 'tbd';
  return 'upcoming';
}


function extractMatchIds(value) {
  const found = new Set();
  const visit = (v, key = '') => {
    if (v == null) return;
    if (Array.isArray(v)) { v.forEach(x => visit(x, key)); return; }
    if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) visit(x, k);
      return;
    }
    const keyLooksLikeId = /match.?id|game.?id|^id$/i.test(String(key));
    const text = String(v);
    const directGameListValue = /match2games|games/i.test(String(key)) && /^\d{8,}$/.test(text);
    if (keyLooksLikeId || directGameListValue) {
      for (const m of text.match(/\d{8,}/g) || []) found.add(m);
    }
  };
  visit(value);
  return [...found];
}

function normalizeDota2DbGame(matchId, result) {
  if (!result || typeof result !== 'object') return null;
  const normalizePlayers = (team) => (Array.isArray(team?.players) ? team.players : []).map((p, i) => ({
    slot: i + 1,
    id: p?.id || p?.playerId || p?.accountId || null,
    name: p?.name || p?.playerName || `Player ${i + 1}`, 
    hero: p?.heroName || p?.hero || '',
    level: p?.level ?? null,
    kills: p?.kills ?? null,
    deaths: p?.deaths ?? null,
    assists: p?.assists ?? null,
    lastHits: p?.lastHits ?? null,
    denies: p?.denies ?? null,
    gpm: p?.goldPerMinute ?? p?.gpm ?? null,
    xpm: p?.xpPerMinute ?? p?.xpm ?? null,
    items: Array.isArray(p?.items) ? p.items.map(x => typeof x === 'string' ? x : (x?.name || x?.item || '')).filter(Boolean) : []
  }));
  const normalizeTeam = (team, index) => ({
    name: team?.name || `Team ${index}`,
    side: team?.side || null,
    players: normalizePlayers(team)
  });
  const normalizeVetoSide = (side) => ({
    picks: Array.isArray(side?.picks) ? side.picks.map(x => x?.hero || x?.name || x).filter(Boolean) : [],
    bans: Array.isArray(side?.bans) ? side.bans.map(x => x?.hero || x?.name || x).filter(Boolean) : []
  });
  return {
    matchId: String(matchId),
    startTime: result.startTime || null,
    length: result.length ?? null,
    winner: result.winner ?? null,
    team1Score: result.team1Score ?? null,
    team2Score: result.team2Score ?? null,
    team1: normalizeTeam(result.team1, 1),
    team2: normalizeTeam(result.team2, 2),
    heroVeto: {
      team1: normalizeVetoSide(result.heroVeto?.team1),
      team2: normalizeVetoSide(result.heroVeto?.team2)
    }
  };
}

async function fetchDota2Game(matchId, force = false) {
  const id = String(matchId || '').trim();
  if (!/^\d{8,}$/.test(id)) throw new Error('invalid_match_id');
  const cached = gameDetailCache.get(id);
  if (!force && cached && Date.now() - cached.at < GAME_DETAIL_TTL_MS) return cached.value;
  const body = new URLSearchParams({ action: 'dota2dbapi', matchid: id, pagename: 'The_International/2026', format: 'json' });
  const res = await fetch(DOTA2DB_API, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': `${APP_NAME}/1.3 (${CONTACT_EMAIL || 'TI2026 viewing guide'})`
    },
    body,
    signal: AbortSignal.timeout(15000)
  });
  const json = await res.json().catch(async () => ({ error: { info: (await res.text().catch(() => '')).slice(0, 240) } }));
  if (!res.ok) throw new Error(`Dota2DB HTTP ${res.status}`);
  if (json?.error) throw new Error(json.error.info || json.error.code || 'Dota2DB error');
  if (json?.dota2dbapi?.error) throw new Error(typeof json.dota2dbapi.error === 'string' ? json.dota2dbapi.error : JSON.stringify(json.dota2dbapi.error));
  const normalized = normalizeDota2DbGame(id, json?.dota2dbapi);
  if (!normalized) throw new Error('Dota2DB returned no game data');
  gameDetailCache.set(id, { at: Date.now(), value: normalized });
  return normalized;
}

function normalizeLpMatch(row) {
  const ops = Array.isArray(row.match2opponents) ? row.match2opponents : [];
  let teams = [normalizeOpponent(ops[0], 0, row.winner), normalizeOpponent(ops[1], 1, row.winner)];
  if (teams.every(t => t.name === '待定') && row.extradata && typeof row.extradata === 'object') {
    const ex = row.extradata;
    teams = [
      normalizeOpponent(ex.opponent1 || ex.team1, 0, row.winner),
      normalizeOpponent(ex.opponent2 || ex.team2, 1, row.winner)
    ];
  }
  const startsAt = normalizeLpDate(row.date);
  if (!startsAt) return null;
  const id = row.match2id || row.objectname || row.pagename || `lp-${startsAt}-${teams.map(t => t.name).join('-')}`;
  return {
    id: String(id),
    startsAt,
    stage: row.section || row.match2bracketid || row.series || 'The International 2026',
    stream: null,
    streamUrl: extractStream(row.stream),
    bestOf: Number(row.bestof || 3),
    teams,
    status: normalizeStatus(row, teams),
    winner: row.winner ?? null,
    source: 'liquipedia',
    rawTournament: row.tournament || null,
    rawParent: row.parent || null,
    games: Array.isArray(row.match2games) ? row.match2games : [],
    matchIds: extractMatchIds(row.match2games)
  };
}

async function fetchPublicUpcoming() {
  if (!PUBLIC_FALLBACK_ENABLED) return [];
  try {
    const res = await fetch(PUBLIC_MATCHES_API, {
      headers: { 'User-Agent': `${APP_NAME}/1.3 (${CONTACT_EMAIL || 'TI2026 viewing guide'})` },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.filter(r => {
      const league = String(r.leagueName || '').toLowerCase();
      const ts = Date.parse(r.startsAt || '');
      return league.includes('international') && league.includes('2026') && Number.isFinite(ts) &&
        ts >= Date.parse('2026-08-12T00:00:00Z') && ts <= Date.parse('2026-08-24T23:59:59Z');
    }).map((r, i) => ({
      id: r.id || r.hash || `public-${i}-${r.startsAt}`,
      startsAt: new Date(r.startsAt).toISOString(),
      stage: r.leagueName || 'The International 2026',
      stream: null,
      streamUrl: r.streamUrl || null,
      bestOf: parseBestOf(r.matchType),
      teams: [
        { name: canonicalTeamName(r.teams?.[0]?.name || '待定'), score: null },
        { name: canonicalTeamName(r.teams?.[1]?.name || '待定'), score: null }
      ],
      status: 'upcoming',
      source: 'public-upcoming',
      matchIds: []
    }));
  } catch (err) {
    console.warn('[public-fallback]', err.message);
    return [];
  }
}

function parseBestOf(value) {
  const m = String(value || '').match(/(\d+)/);
  return m ? Number(m[1]) : 3;
}

function nameKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function matchKey(m) {
  const t = Date.parse(m.startsAt || '') || 0;
  const bucket = Math.floor(t / (30 * 60 * 1000));
  const teamNames = (m.teams || []).map(t => String(t?.name || ''));
  const names = teamNames.map(nameKey).sort().join('|');
  const hasTbd = teamNames.some(n => n.startsWith('待定') || !n);
  // 同一时间可能存在多个“待定 vs 待定”的并行直播流，不能把它们误合并。
  const lane = hasTbd ? `:${m.stream || m.id || ''}` : '';
  return `${bucket}:${names}${lane}`;
}

function mergeMatches(...lists) {
  const map = new Map();
  const priority = { seed: 1, 'public-upcoming': 2, liquipedia: 3 };
  for (const list of lists) {
    for (const m of list || []) {
      if (!m?.startsAt || !Array.isArray(m.teams)) continue;
      const key = matchKey(m);
      const existing = map.get(key);
      if (!existing || (priority[m.source] || 0) >= (priority[existing.source] || 0)) {
        map.set(key, { ...existing, ...m });
      }
    }
  }
  return [...map.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

function deriveTeams(matches) {
  const map = new Map(seed.teams.map(name => [nameKey(name), name]));
  for (const m of matches) {
    for (const team of m.teams || []) {
      const name = canonicalTeamName(team?.name);
      if (!name || name.startsWith('待定')) continue;
      map.set(nameKey(name), name);
    }
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function deriveStandings(matches, teams) {
  const rec = new Map(teams.map(name => [nameKey(name), { team: name, wins: 0, losses: 0, played: 0 }]));
  for (const m of matches) {
    if (m.status !== 'finished' || !Array.isArray(m.teams) || m.teams.length < 2) continue;
    const a = m.teams[0], b = m.teams[1];
    if (!a?.name || !b?.name) continue;
    const ra = rec.get(nameKey(a.name));
    const rb = rec.get(nameKey(b.name));
    if (!ra || !rb) continue;
    const wa = a.winner || (a.score != null && b.score != null && Number(a.score) > Number(b.score));
    const wb = b.winner || (a.score != null && b.score != null && Number(b.score) > Number(a.score));
    if (!wa && !wb) continue;
    ra.played++; rb.played++;
    if (wa) { ra.wins++; rb.losses++; }
    if (wb) { rb.wins++; ra.losses++; }
  }
  return [...rec.values()].sort((a,b) => b.wins - a.wins || a.losses - b.losses || a.team.localeCompare(b.team));
}

function decorateMatch(match) {
  const china = new Set((seed.chinaTeams || []).map(nameKey));
  const hasChina = (match.teams || []).some(t => china.has(nameKey(t?.name)));
  const stage = String(match.stage || '').toLowerCase();
  let score = 3.5;
  let reason = '瑞士轮常规场';
  if (match.status === 'live') { score = 5; reason = '正在进行'; }
  if (hasChina) { score = 5; reason = 'CN 战队重点场'; }
  if (/生死|淘汰|elimination|lower|upper|main event/.test(stage) && score < 4.5) {
    score = 4.5; reason = '晋级/淘汰关键场';
  }
  if (/grand|总决赛/.test(stage)) { score = 5; reason = '总决赛'; }
  return { ...match, featuredChina: hasChina, recommendation: { score, reason } };
}

async function buildPayload() {
  const errors = [];
  let lp = { matches: [], meta: { enabled: false, reason: 'missing_api_key' } };
  if (LIQUIPEDIA_API_KEY) {
    try { lp = await fetchLiquipediaMatches(); }
    catch (err) { errors.push(`Liquipedia: ${err.message}`); }
  }

  let publicUpcoming = [];
  if (!lp.matches.length) {
    try { publicUpcoming = await fetchPublicUpcoming(); }
    catch (err) { errors.push(`Public fallback: ${err.message}`); }
  }

  const matches = mergeMatches(seed.matches, publicUpcoming, lp.matches).map(decorateMatch);
  const teams = deriveTeams(matches);
  const standings = deriveStandings(matches, teams);
  const source = lp.matches.length ? 'liquipedia' : publicUpcoming.length ? 'public+seed' : 'seed';

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
      seedCount: seed.matches.length,
      errors
    },
    attribution: '赛程数据优先来自 Liquipedia LPDB v3；Liquipedia 数据遵循 CC BY-SA 3.0。无 API Key 时使用内置已公布赛程与公共赛程降级源。'
  };
}

async function refresh(force = false) {
  if (!force && cacheFresh(memoryCache)) return memoryCache;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const next = await buildPayload();
      memoryCache = next;
      writeDiskCache(next);
      return next;
    } catch (err) {
      console.error('[refresh]', err);
      if (memoryCache) return { ...memoryCache, stale: true, refreshError: err.message };
      const fallback = await buildPayload().catch(() => ({
        event: seed.event, teams: seed.teams, matches: seed.matches.map(decorateMatch), standings: deriveStandings(seed.matches, seed.teams), timeline: seed.timeline, chinaTeams: seed.chinaTeams || [], chinaTeamProfiles: seed.chinaTeamProfiles || [], streams: seed.streams || [], teamAssets: seed.teamAssets || {}, teamAssetMeta: seed.teamAssetMeta || {},
        source: 'seed', generatedAt: new Date().toISOString(), stale: true, refreshError: err.message
      }));
      memoryCache = fallback;
      return fallback;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function serveStatic(req, res) {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(u.pathname);
  if (pathname === '/') pathname = '/index.html';
  const safePath = path.normalize(pathname).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'forbidden' });
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendJson(res, 404, { error: 'not_found' });
    const ext = path.extname(filePath).toLowerCase();
    const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.ico':'image/x-icon' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (u.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, service: 'ti2026-viewing-guide', version: '1.3.8', dataDir: DATA_DIR, liquipediaConfigured: Boolean(LIQUIPEDIA_API_KEY), aiProvidersConfigured: aiService.configuredCount(), now: new Date().toISOString() });
    }
    if (u.pathname === '/api/ti2026') {
      const data = await refresh(false);
      return sendJson(res, 200, data);
    }
    if (u.pathname === '/api/ai/status') {
      const seriesId = u.searchParams.get('id');
      return sendJson(res, 200, aiService.getStatus(seriesId));
    }
    if (u.pathname === '/api/ai/cache') {
      const seriesId = u.searchParams.get('id');
      const data = await refresh(false);
      const match = (data.matches || []).find(m => String(m.id) === String(seriesId));
      return sendJson(res, 200, aiService.getCachedAnalysis(seriesId, match || null));
    }
    if (u.pathname === '/api/ai/analysis' && (req.method === 'POST' || req.method === 'GET')) {
      const seriesId = u.searchParams.get('id');
      const data = await refresh(false);
      const match = (data.matches || []).find(m => String(m.id) === String(seriesId));
      if (!match) return sendJson(res, 404, { error: 'match_not_found' });
      const matchIds = Array.from(new Set([...(match.matchIds || []), ...extractMatchIds(match.games || [])]));
      const games = [];
      for (const matchId of matchIds.slice(0, 5)) {
        try { games.push({ ok: true, data: await fetchDota2Game(matchId) }); }
        catch (err) { games.push({ ok: false, matchId, error: err.message }); }
      }
      const teamIntel = await teamIntelService.getMatchIntel(match).catch(err => ({ error: err.message, teams: [] }));
      const result = await aiService.analyzeOnce({ match, matchIds, games, teamIntel });
      return sendJson(res, 200, result);
    }
    if (u.pathname === '/api/team-intel') {
      const seriesId = u.searchParams.get('id');
      const data = await refresh(false);
      const match = (data.matches || []).find(m => String(m.id) === String(seriesId));
      if (!match) return sendJson(res, 404, { error: 'match_not_found' });
      return sendJson(res, 200, await teamIntelService.getMatchIntel(match));
    }
    if (u.pathname === '/api/match-details') {
      const seriesId = u.searchParams.get('id');
      const data = await refresh(false);
      const match = (data.matches || []).find(m => String(m.id) === String(seriesId));
      if (!match) return sendJson(res, 404, { error: 'match_not_found' });
      const matchIds = Array.from(new Set([...(match.matchIds || []), ...extractMatchIds(match.games || [])]));
      if (!matchIds.length) {
        return sendJson(res, 200, { match, matchIds: [], games: [], pending: true, message: '该系列赛的逐局 Match ID 尚未同步，比赛开始/结束后 Liquipedia 发布 Game ID 即会自动显示。' });
      }
      const games = [];
      for (const matchId of matchIds.slice(0, 5)) {
        try { games.push({ ok: true, data: await fetchDota2Game(matchId) }); }
        catch (err) { games.push({ ok: false, matchId, error: err.message }); }
      }
      return sendJson(res, 200, { match, matchIds, games, pending: false, generatedAt: new Date().toISOString() });
    }
    if (u.pathname === '/api/game-detail') {
      const matchId = u.searchParams.get('matchid');
      try { return sendJson(res, 200, await fetchDota2Game(matchId)); }
      catch (err) { return sendJson(res, 502, { error: 'game_detail_unavailable', matchId, message: err.message }); }
    }
    if (u.pathname === '/api/refresh' && (req.method === 'POST' || req.method === 'GET')) {
      const now = Date.now();
      if (now - lastManualRefreshAt < 30000) return sendJson(res, 429, { error: 'refresh_too_frequent', retryAfterSeconds: Math.ceil((30000 - (now - lastManualRefreshAt))/1000) });
      lastManualRefreshAt = now;
      const data = await refresh(true);
      return sendJson(res, 200, data);
    }
    return serveStatic(req, res);
  } catch (err) {
    console.error('[request]', err);
    return sendJson(res, 500, { error: 'internal_error', message: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TI2026 观赛指南已启动: http://127.0.0.1:${PORT}`);
  console.log(`Liquipedia API Key: ${LIQUIPEDIA_API_KEY ? '已配置' : '未配置（当前使用降级模式）'}`);
});

module.exports = {
  normalizeLpDate, normalizeOpponent, normalizeLpMatch, mergeMatches,
  deriveStandings, decorateMatch, isLikelyTi2026Match, extractMatchIds, normalizeDota2DbGame, canonicalTeamName
};
