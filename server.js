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
const LIVE_REFRESH_SECONDS = Math.max(60, Number(process.env.LIVE_REFRESH_INTERVAL_SECONDS || 120));
const AUTO_REFRESH_INTERVAL_MS = LIVE_REFRESH_SECONDS * 1000;
const CACHE_TTL_MS = AUTO_REFRESH_INTERVAL_MS;
const LIQUIPEDIA_API_KEY = (process.env.LIQUIPEDIA_API_KEY || '').trim();
const PUBLIC_FALLBACK_ENABLED = String(process.env.PUBLIC_FALLBACK_ENABLED || 'true').toLowerCase() !== 'false';
const APP_NAME = process.env.APP_NAME || 'TI2026-Viewing-Guide';
const CONTACT_EMAIL = (process.env.CONTACT_EMAIL || '').trim();
const LP_BASE = 'https://api.liquipedia.net/api/v3/';
const PUBLIC_MATCHES_API = 'https://dota.haglund.dev/v1/matches';
const BLAST_SCHEDULE_URL = String(process.env.BLAST_SCHEDULE_URL || 'https://blast.tv/dota/tournaments/the-international-2026/series').trim();
const CYBERSPORT_SCHEDULE_URL = String(process.env.CYBERSPORT_SCHEDULE_URL || 'https://www.cybersport.ru/tournaments/dota-2/the-international-2026').trim();
const SCHEDULE_SOURCE_TTL_MS = Math.max(60, Number(process.env.SCHEDULE_SOURCE_TTL_SECONDS || 300)) * 1000;
const scheduleSourceCache = new Map();
const DOTA2DB_API = 'https://liquipedia.net/dota2/api.php';
const OPENDOTA_BASE_URL = String(process.env.OPENDOTA_BASE_URL || 'https://api.opendota.com/api').replace(/\/+$/, '');
const OPENDOTA_API_KEY = String(process.env.OPENDOTA_API_KEY || '').trim();
const OPENDOTA_TI_LEAGUE_ID = Math.max(1, Number(process.env.OPENDOTA_TI_LEAGUE_ID || 19719));
const GAME_DETAIL_TTL_MS = Math.max(60, Number(process.env.GAME_DETAIL_TTL_SECONDS || 300)) * 1000;
const gameDetailCache = new Map();

const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
const aiService = createAiService({ root: ROOT, dataDir: DATA_DIR });
const teamIntelService = createTeamIntelService({ root: ROOT, dataDir: DATA_DIR });

const TEAM_NAME_ALIASES = new Map([
  ['1w', 'Iron Wing'], ['1wteam', 'Iron Wing'], ['1win', 'Iron Wing'], ['1winteam', 'Iron Wing'], ['tundraesports', 'Iron Wing'],
  ['parivision', 'Team VISION'], ['teamvision', 'Team VISION'],
  ['betboom', 'BoomBoys'], ['betboomteam', 'BoomBoys'], ['bbteam', 'BoomBoys'],
  ['l1ga', 'HULIGANI'], ['l1gateam', 'HULIGANI'],
  ['aurora', 'Aurora Gaming'], ['vg', 'Vici Gaming'], ['nigma', 'Nigma Galaxy'],
  ['resilience', 'Team Resilience'], ['yandex', 'Team Yandex'], ['xtreme', 'Xtreme Gaming'],
  ['falcons', 'Team Falcons'], ['liquid', 'Team Liquid'], ['spirit', 'Team Spirit']
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

function regexEscape(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SCHEDULE_SOURCE_TEAM_TOKENS = [
  'Team Resilience', 'Team Yandex', 'Team Falcons', 'GamerLegion', 'LGD Gaming', 'Xtreme Gaming',
  'Iron Wing', 'Team Liquid', 'BetBoom Team', 'BoomBoys', 'Aurora Gaming', 'Aurora',
  'Nigma Galaxy', 'Vici Gaming', 'PARIVISION', 'Team VISION', 'Team Spirit', 'HULIGANI', 'OG',
  'BETBOOM', 'Resilience', 'Yandex', 'Falcons', 'LGD', 'Xtreme', 'Nigma', 'VG', '1w Team', '1w',
  'Liquid', 'Spirit', 'L1ga'
].sort((a, b) => b.length - a.length);
const SCHEDULE_SOURCE_TEAM_PATTERN = SCHEDULE_SOURCE_TEAM_TOKENS.map(regexEscape).join('|');

function visibleHtmlText(raw) {
  return String(raw || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchSchedulePageCached(key, url) {
  const cached = scheduleSourceCache.get(key);
  if (cached && Date.now() - cached.at < SCHEDULE_SOURCE_TTL_MS) return cached.value;
  const res = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/151 Safari/537.36 TI2026Guide/1.3'
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();
  const value = { raw, text: visibleHtmlText(raw), fetchedAt: new Date().toISOString() };
  scheduleSourceCache.set(key, { at: Date.now(), value });
  return value;
}

function swissRoundForRecord(record) {
  return ['3-1', '2-2', '1-3'].includes(String(record)) ? 5 : 4;
}

function blastGroupIso(raw, record) {
  const markers = record === '2-2' ? ['2:2', '2-2 Match 1'] : [`${record} Match 1`];
  for (const marker of markers) {
    let from = 0;
    while (from < raw.length) {
      const idx = raw.indexOf(marker, from);
      if (idx < 0) break;
      const chunk = raw.slice(Math.max(0, idx - 120), Math.min(raw.length, idx + 1200));
      const iso = chunk.match(/2026-08-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/);
      if (iso) return iso[0];
      from = idx + marker.length;
    }
  }
  return null;
}

function scheduleInEventWindow(iso) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) && t >= Date.parse('2026-08-13T00:00:00Z') && t <= Date.parse('2026-08-23T23:59:59Z');
}

async function fetchBlastSchedule() {
  const { raw, text } = await fetchSchedulePageCached('blast', BLAST_SCHEDULE_URL);
  const rows = [];
  const seen = new Set();
  const re = new RegExp(`(\\d-\\d Match \\d+)\\s+Group Stage\\s+(${SCHEDULE_SOURCE_TEAM_PATTERN})\\s+(\\d{2}:\\d{2})\\s+(${SCHEDULE_SOURCE_TEAM_PATTERN})\\s+BO3`, 'gi');
  let m;
  while ((m = re.exec(text))) {
    const label = m[1];
    const record = label.match(/^(\d-\d)/)?.[1] || '';
    const number = Number(label.match(/Match\s+(\d+)/i)?.[1] || 0);
    const startsAt = blastGroupIso(raw, record);
    if (!startsAt || !scheduleInEventWindow(startsAt)) continue;
    const a = canonicalTeamName(m[2]);
    const b = canonicalTeamName(m[4]);
    const pair = openDotaPairKey(a, b);
    const dedupe = `${startsAt}:${pair}`;
    if (!a || !b || seen.has(dedupe)) continue;
    seen.add(dedupe);
    rows.push({
      id: `blast-${startsAt.slice(0,10)}-${record.replace('-', '')}-${number || rows.length + 1}`,
      startsAt: new Date(startsAt).toISOString(),
      stage: `瑞士轮 · 第${swissRoundForRecord(record)}轮 · ${record}`,
      stream: null,
      streamUrl: null,
      bestOf: 3,
      teams: [{ name:a, score:null }, { name:b, score:null }],
      status: 'upcoming',
      source: 'blast',
      sourceUrl: BLAST_SCHEDULE_URL,
      matchIds: []
    });
  }

  const record = '2-2';
  const startsAt = blastGroupIso(raw, record);
  if (startsAt && scheduleInEventWindow(startsAt)) {
    const nums = [...text.matchAll(/2-2 Match\s+(\d+)/gi)].map(x => Number(x[1])).filter(Boolean);
    for (const number of [...new Set(nums)].slice(0, 6)) {
      const slotKey = `${startsAt.slice(0,10)}-2-2-${number}`;
      if (rows.some(x => x.slotKey === slotKey)) continue;
      rows.push({
        id: `blast-${slotKey}`,
        slotKey,
        startsAt: new Date(startsAt).toISOString(),
        stage: '瑞士轮 · 第5轮 · 2-2',
        stream: null,
        streamUrl: null,
        bestOf: 3,
        teams: [{ name:'待定', score:null }, { name:'待定', score:null }],
        status: 'tbd',
        source: 'blast',
        sourceUrl: BLAST_SCHEDULE_URL,
        matchIds: []
      });
    }
  }
  return rows.sort((a,b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

function dateKeyInTimeZone(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function addDateKey(key, days) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

async function fetchCybersportSchedule() {
  const { text } = await fetchSchedulePageCached('cybersport', CYBERSPORT_SCHEDULE_URL);
  const markers = [...text.matchAll(/(High|Low)\s+(\d-\d)/gi)].map(m => ({ index:m.index, record:m[2] }));
  const re = new RegExp(`(Сегодня|Завтра)\\s+в\\s+(\\d{2}:\\d{2})\\s+(${SCHEDULE_SOURCE_TEAM_PATTERN})\\s+(${SCHEDULE_SOURCE_TEAM_PATTERN})\\s+vs`, 'gi');
  const today = dateKeyInTimeZone('Europe/Moscow');
  const rows = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(text))) {
    const marker = markers.filter(x => x.index < m.index).at(-1);
    const record = marker?.record || '';
    if (!record) continue;
    const dateKey = m[1].toLowerCase() === 'завтра' ? addDateKey(today, 1) : today;
    const startsAt = new Date(`${dateKey}T${m[2]}:00+03:00`).toISOString();
    if (!scheduleInEventWindow(startsAt)) continue;
    const a = canonicalTeamName(m[3]);
    const b = canonicalTeamName(m[4]);
    const pair = openDotaPairKey(a, b);
    const dedupe = `${startsAt}:${pair}`;
    if (!a || !b || seen.has(dedupe)) continue;
    seen.add(dedupe);
    rows.push({
      id: `cybersport-${dateKey}-${record.replace('-', '')}-${rows.length + 1}`,
      startsAt,
      stage: `瑞士轮 · 第${swissRoundForRecord(record)}轮 · ${record}`,
      stream: null,
      streamUrl: null,
      bestOf: 3,
      teams: [{ name:a, score:null }, { name:b, score:null }],
      status: 'upcoming',
      source: 'cybersport',
      sourceUrl: CYBERSPORT_SCHEDULE_URL,
      matchIds: []
    });
  }
  return rows.sort((a,b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
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

async function fetchOpenDotaLeagueMatches() {
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


async function fetchOpenDotaLive() {
  const u = new URL(`${OPENDOTA_BASE_URL}/live`);
  if (OPENDOTA_API_KEY) u.searchParams.set('api_key', OPENDOTA_API_KEY);
  const res = await fetch(u, {
    headers: { 'Accept':'application/json', 'User-Agent':`${APP_NAME}/1.3 (${CONTACT_EMAIL || 'TI2026 viewing guide'})` },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`OpenDota live HTTP ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

function isPlaceholderTeamName(name) {
  return /^待定/.test(String(name || '').trim());
}

function openDotaTeamNames(raw) {
  const radiant = canonicalTeamName(
    raw?.team_name_radiant || raw?.radiant_team_name || raw?.radiant_name ||
    raw?.radiant_team?.team_name || raw?.radiant_team?.name || ''
  );
  const dire = canonicalTeamName(
    raw?.team_name_dire || raw?.dire_team_name || raw?.dire_name ||
    raw?.dire_team?.team_name || raw?.dire_team?.name || ''
  );
  return [radiant, dire];
}

function openDotaLeagueId(raw) {
  const n = Number(raw?.leagueid ?? raw?.league_id ?? raw?.league?.league_id ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function openDotaStartMs(raw) {
  const n = Number(raw?.start_time ?? raw?.activate_time ?? raw?.lobby_start_time ?? 0);
  return Number.isFinite(n) && n > 0 ? n * 1000 : 0;
}

function isTiOpenDotaRow(raw, tiLeagueIds) {
  const league = String(raw?.league_name || raw?.league?.name || '').toLowerCase();
  if (league.includes('international')) return true;
  const id = openDotaLeagueId(raw);
  return Boolean(id && tiLeagueIds.has(id));
}

function collectOpenDotaSourceSeries(proRows, liveRows) {
  const allowed = new Set((seed.teams || []).map(nameKey));
  const tiLeagueIds = new Set((proRows || []).map(openDotaLeagueId).filter(Boolean));
  const groups = new Map();

  const upsert = (raw, kind) => {
    if (!isTiOpenDotaRow(raw, tiLeagueIds)) return;
    const [radiant, dire] = openDotaTeamNames(raw);
    if (!radiant || !dire) return;
    if (!allowed.has(nameKey(radiant)) || !allowed.has(nameKey(dire))) return;

    const pairKey = openDotaPairKey(radiant, dire);
    const seriesId = String(raw?.series_id ?? raw?.league_series_id ?? '').trim();
    const at = openDotaStartMs(raw) || Date.now();
    const groupKey = seriesId && seriesId !== '0'
      ? `series:${seriesId}`
      : `pair:${pairKey}:${Math.floor(at / (4 * 3600000))}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        pairKey,
        seriesId: seriesId && seriesId !== '0' ? seriesId : null,
        teams: [radiant, dire],
        firstAt: at,
        proGames: [],
        liveRows: []
      });
    }
    const g = groups.get(groupKey);
    g.firstAt = Math.min(g.firstAt || at, at);
    g.teams = [radiant, dire];
    if (kind === 'live') g.liveRows.push(raw);
    else g.proGames.push(raw);
  };

  for (const r of proRows || []) upsert(r, 'pro');
  for (const r of liveRows || []) upsert(r, 'live');
  return [...groups.values()];
}

function openDotaSourceSeriesMatch(g) {
  const score = new Map(g.teams.map(name => [nameKey(name), 0]));
  const ids = new Set();

  for (const game of g.proGames || []) {
    if (game?.match_id) ids.add(String(game.match_id));
    const [radiant, dire] = openDotaTeamNames(game);
    const radiantWon = game?.radiant_win === true || game?.radiant_win === 1 || String(game?.radiant_win).toLowerCase() === 'true';
    const winner = radiantWon ? radiant : dire;
    const k = nameKey(winner);
    if (score.has(k)) score.set(k, score.get(k) + 1);
  }

  for (const live of g.liveRows || []) {
    if (live?.match_id) ids.add(String(live.match_id));
    const [radiant, dire] = openDotaTeamNames(live);
    const rs = Number(live?.radiant_series_wins);
    const ds = Number(live?.dire_series_wins);
    if (Number.isFinite(rs) && score.has(nameKey(radiant))) {
      score.set(nameKey(radiant), Math.max(score.get(nameKey(radiant)) || 0, rs));
    }
    if (Number.isFinite(ds) && score.has(nameKey(dire))) {
      score.set(nameKey(dire), Math.max(score.get(nameKey(dire)) || 0, ds));
    }
  }

  const live = (g.liveRows || []).length > 0;
  const teams = g.teams.map(name => ({ name, score: score.get(nameKey(name)) || 0, winner: false }));
  const maxScore = Math.max(...teams.map(t => Number(t.score || 0)));
  const finished = maxScore >= 2;
  if (finished) teams.forEach(t => { t.winner = Number(t.score || 0) === maxScore; });

  return {
    id: g.seriesId ? `opendota-series-${g.seriesId}` : `opendota-${g.pairKey}-${Math.floor(g.firstAt / 1000)}`,
    startsAt: new Date(g.firstAt).toISOString(),
    stage: '瑞士轮 · 数据源对阵',
    stream: null,
    streamUrl: null,
    bestOf: 3,
    teams,
    status: finished ? 'finished' : live ? 'live' : 'upcoming',
    source: live ? 'opendota-live' : 'opendota-series',
    scoreSource: live ? 'OpenDota live' : 'OpenDota proMatches',
    matchIds: [...ids],
    sourceSeriesId: g.seriesId,
    sourcePairKey: g.pairKey
  };
}

function mergeOpenDotaSourcePairings(matches, proRows, liveRows) {
  const result = (matches || []).map(m => ({ ...m, teams: (m.teams || []).map(t => ({ ...t })) }));
  const knownPairs = new Set(
    result
      .filter(m => (m.teams || []).length >= 2 && !(m.teams || []).some(t => isPlaceholderTeamName(t?.name)))
      .map(m => openDotaPairKey(m.teams[0].name, m.teams[1].name))
  );

  const discovered = collectOpenDotaSourceSeries(proRows, liveRows)
    .map(openDotaSourceSeriesMatch)
    .filter(m => !knownPairs.has(openDotaPairKey(m.teams[0].name, m.teams[1].name)))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  for (const sourceMatch of discovered) {
    const sourceAt = Date.parse(sourceMatch.startsAt) || Date.now();
    const candidates = result
      .map((m, i) => ({ m, i }))
      .filter(x => (x.m.teams || []).some(t => isPlaceholderTeamName(t?.name)))
      .filter(x => Math.abs((Date.parse(x.m.startsAt || '') || 0) - sourceAt) <= 6 * 3600000)
      .sort((a, b) => Math.abs((Date.parse(a.m.startsAt || '') || 0) - sourceAt) - Math.abs((Date.parse(b.m.startsAt || '') || 0) - sourceAt));

    if (candidates.length) {
      result.splice(candidates[0].i, 1, sourceMatch);
    } else {
      result.push(sourceMatch);
    }
  }

  return result.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
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

function matchKey(m) {
  const t = Date.parse(m.startsAt || '') || 0;
  const bucket = Math.floor(t / (30 * 60 * 1000));
  const teamNames = (m.teams || []).map(t => String(t?.name || ''));
  const names = teamNames.map(nameKey).sort().join('|');
  const hasTbd = teamNames.some(n => n.startsWith('待定') || !n);
  // 同一时间可能存在多个“待定 vs 待定”的并行直播流，不能把它们误合并。
  const lane = hasTbd ? `:${m.slotKey || m.stream || m.id || ''}` : '';
  return `${bucket}:${names}${lane}`;
}

function mergeMatches(...lists) {
  const map = new Map();
  const priority = { seed: 1, 'published-schedule': 2, 'opendota-confirmed-series': 2, 'public-upcoming': 3, cybersport: 4, blast: 5, liquipedia: 6 };
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
  const sources = {
    liquipedia: { status: LIQUIPEDIA_API_KEY ? 'pending' : 'disabled', reason: LIQUIPEDIA_API_KEY ? null : 'missing_api_key', count: 0 },
    blastSchedule: { status: 'pending', count: 0 },
    cybersportSchedule: { status: 'pending', count: 0 },
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

  let blastSchedule = [];
  try {
    blastSchedule = await fetchBlastSchedule();
    sources.blastSchedule = { status:blastSchedule.length ? 'ok' : 'empty', count:blastSchedule.length, cacheTtlSeconds:Math.round(SCHEDULE_SOURCE_TTL_MS/1000) };
  } catch (err) {
    sources.blastSchedule = { status:'error', count:0, error:err.message };
    errors.push(`BLAST schedule: ${err.message}`);
  }

  let cybersportSchedule = [];
  try {
    cybersportSchedule = await fetchCybersportSchedule();
    sources.cybersportSchedule = { status:cybersportSchedule.length ? 'ok' : 'empty', count:cybersportSchedule.length, cacheTtlSeconds:Math.round(SCHEDULE_SOURCE_TTL_MS/1000) };
  } catch (err) {
    sources.cybersportSchedule = { status:'error', count:0, error:err.message };
    errors.push(`Cybersport schedule: ${err.message}`);
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

  const mergedMatches = mergeMatches(seed.matches, publicUpcoming, cybersportSchedule, blastSchedule, lp.matches);
  const scoredMatches = applyOpenDotaScores(mergedMatches, openDotaResults);
  const matches = mergeOpenDotaSourcePairings(scoredMatches, openDotaResults, openDotaLive).map(decorateMatch);
  const teams = deriveTeams(matches);
  const standings = deriveStandings(matches, teams);
  const scheduleSourceParts = [];
  if (lp.matches.length) scheduleSourceParts.push('liquipedia');
  if (blastSchedule.length) scheduleSourceParts.push('blast');
  if (cybersportSchedule.length) scheduleSourceParts.push('cybersport');
  if (publicUpcoming.length) scheduleSourceParts.push('public');
  scheduleSourceParts.push('seed');
  const baseSource = [...new Set(scheduleSourceParts)].join('+');
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
      blastScheduleCount: blastSchedule.length,
      cybersportScheduleCount: cybersportSchedule.length,
      scheduleSourceTtlSeconds: Math.round(SCHEDULE_SOURCE_TTL_MS / 1000),
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
    attribution: `未来赛程按数据源优先级合并：Liquipedia LPDB > BLAST > Cybersport > 公共赛程 > 已公布本地基线；OpenDota league ${OPENDOTA_TI_LEAGUE_ID} + proMatches + live 用于开赛后的 Match ID、比分与实时状态。系统不根据瑞士轮战绩自行推算对阵。实时数据约 ${LIVE_REFRESH_SECONDS} 秒刷新，网页赛程源约 ${Math.round(SCHEDULE_SOURCE_TTL_MS/1000)} 秒缓存。`
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
      return sendJson(res, 200, { ok: true, service: 'ti2026-viewing-guide', version: '1.3.9', dataDir: DATA_DIR, autoRefreshSeconds: Math.round(AUTO_REFRESH_INTERVAL_MS/1000), liquipediaConfigured: Boolean(LIQUIPEDIA_API_KEY), openDotaLeagueId: OPENDOTA_TI_LEAGUE_ID, dataSources: memoryCache?.dataStatus?.sources || null, aiProvidersConfigured: aiService.configuredCount(), now: new Date().toISOString() });
    }
    if (u.pathname === '/api/ti2026') {
      const data = await refresh(false);
      return sendJson(res, 200, data);
    }
    if (u.pathname === '/api/source-health') {
      const data = await refresh(false);
      return sendJson(res, 200, { generatedAt:data.generatedAt, source:data.source, refreshSeconds:LIVE_REFRESH_SECONDS, sources:data.dataStatus?.sources || {}, errors:data.dataStatus?.errors || [] });
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
    if (u.pathname === '/api/ai/retry' && req.method === 'POST') {
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
  console.log(`赛程自动同步: 每 ${Math.round(AUTO_REFRESH_INTERVAL_MS/60000)} 分钟`);
  setTimeout(() => refresh(false).catch(err => console.error('[startup-refresh]', err)), 2000).unref();
  setInterval(() => refresh(true).then(d => console.log('[auto-refresh]', d.generatedAt, d.source)).catch(err => console.error('[auto-refresh]', err)), AUTO_REFRESH_INTERVAL_MS).unref();
});

module.exports = {
  normalizeLpDate, normalizeOpponent, normalizeLpMatch, mergeMatches,
  deriveStandings, decorateMatch, isLikelyTi2026Match, extractMatchIds, normalizeDota2DbGame, canonicalTeamName
};
