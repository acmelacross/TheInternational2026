from pathlib import Path
import json

SERVER = Path('server.js')
APP = Path('public/app.js')
SEED = Path('data/seed.json')

s = SERVER.read_text(encoding='utf-8')

old = """const PUBLIC_MATCHES_API = 'https://dota.haglund.dev/v1/matches';
const DOTA2DB_API = 'https://liquipedia.net/dota2/api.php';
"""
new = """const PUBLIC_MATCHES_API = 'https://dota.haglund.dev/v1/matches';
const BLAST_SCHEDULE_URL = String(process.env.BLAST_SCHEDULE_URL || 'https://blast.tv/dota/tournaments/the-international-2026/series').trim();
const CYBERSPORT_SCHEDULE_URL = String(process.env.CYBERSPORT_SCHEDULE_URL || 'https://www.cybersport.ru/tournaments/dota-2/the-international-2026').trim();
const SCHEDULE_SOURCE_TTL_MS = Math.max(60, Number(process.env.SCHEDULE_SOURCE_TTL_SECONDS || 300)) * 1000;
const scheduleSourceCache = new Map();
const DOTA2DB_API = 'https://liquipedia.net/dota2/api.php';
"""
assert old in s, 'constants anchor missing'
s = s.replace(old, new, 1)

old = """const TEAM_NAME_ALIASES = new Map([
  ['1wteam', 'Iron Wing'], ['1winteam', 'Iron Wing'], ['tundraesports', 'Iron Wing'],
  ['parivision', 'Team VISION'], ['teamvision', 'Team VISION'],
  ['betboomteam', 'BoomBoys'], ['bbteam', 'BoomBoys'],
  ['l1gateam', 'HULIGANI'], ['aurora', 'Aurora Gaming']
]);
"""
new = """const TEAM_NAME_ALIASES = new Map([
  ['1w', 'Iron Wing'], ['1wteam', 'Iron Wing'], ['1win', 'Iron Wing'], ['1winteam', 'Iron Wing'], ['tundraesports', 'Iron Wing'],
  ['parivision', 'Team VISION'], ['teamvision', 'Team VISION'],
  ['betboom', 'BoomBoys'], ['betboomteam', 'BoomBoys'], ['bbteam', 'BoomBoys'],
  ['l1ga', 'HULIGANI'], ['l1gateam', 'HULIGANI'],
  ['aurora', 'Aurora Gaming'], ['vg', 'Vici Gaming'], ['nigma', 'Nigma Galaxy'],
  ['resilience', 'Team Resilience'], ['yandex', 'Team Yandex'], ['xtreme', 'Xtreme Gaming'],
  ['falcons', 'Team Falcons'], ['liquid', 'Team Liquid'], ['spirit', 'Team Spirit']
]);
"""
assert old in s, 'alias anchor missing'
s = s.replace(old, new, 1)

anchor = "async function fetchPublicUpcoming() {\n"
assert anchor in s, 'public upcoming anchor missing'
insert = r'''function regexEscape(value) {
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

'''
s = s.replace(anchor, insert + anchor, 1)

old = "const priority = { seed: 1, 'public-upcoming': 2, liquipedia: 3 };"
new = "const priority = { seed: 1, 'published-schedule': 2, 'opendota-confirmed-series': 2, 'public-upcoming': 3, cybersport: 4, blast: 5, liquipedia: 6 };"
assert old in s, 'priority anchor missing'
s = s.replace(old, new, 1)

old = """  const lane = hasTbd ? `:${m.stream || m.id || ''}` : '';
"""
new = """  const lane = hasTbd ? `:${m.slotKey || m.stream || m.id || ''}` : '';
"""
assert old in s, 'tbd lane anchor missing'
s = s.replace(old, new, 1)

old = """  const sources = {
    liquipedia: { status: LIQUIPEDIA_API_KEY ? 'pending' : 'disabled', reason: LIQUIPEDIA_API_KEY ? null : 'missing_api_key', count: 0 },
    publicUpcoming: { status: PUBLIC_FALLBACK_ENABLED ? 'pending' : 'disabled', count: 0 },
    openDotaLeague: { status: 'pending', leagueId: OPENDOTA_TI_LEAGUE_ID, count: 0 },
    openDotaProMatches: { status: 'pending', count: 0 },
    openDotaLive: { status: 'pending', count: 0 }
  };
"""
new = """  const sources = {
    liquipedia: { status: LIQUIPEDIA_API_KEY ? 'pending' : 'disabled', reason: LIQUIPEDIA_API_KEY ? null : 'missing_api_key', count: 0 },
    blastSchedule: { status: 'pending', count: 0 },
    cybersportSchedule: { status: 'pending', count: 0 },
    publicUpcoming: { status: PUBLIC_FALLBACK_ENABLED ? 'pending' : 'disabled', count: 0 },
    openDotaLeague: { status: 'pending', leagueId: OPENDOTA_TI_LEAGUE_ID, count: 0 },
    openDotaProMatches: { status: 'pending', count: 0 },
    openDotaLive: { status: 'pending', count: 0 }
  };
"""
assert old in s, 'sources anchor missing'
s = s.replace(old, new, 1)

anchor = """  let publicUpcoming = [];
"""
assert anchor in s, 'build public anchor missing'
insert2 = """  let blastSchedule = [];
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

"""
s = s.replace(anchor, insert2 + anchor, 1)

old = """  const mergedMatches = mergeMatches(seed.matches, publicUpcoming, lp.matches);
  const scoredMatches = applyOpenDotaScores(mergedMatches, openDotaResults);
  const matches = mergeOpenDotaSourcePairings(scoredMatches, openDotaResults, openDotaLive).map(decorateMatch);
  const teams = deriveTeams(matches);
  const standings = deriveStandings(matches, teams);
  const baseSource = lp.matches.length ? 'liquipedia' : publicUpcoming.length ? 'public+seed' : 'seed';
  const source = openDotaResults.length ? `${baseSource}+opendota-league` : baseSource;
"""
new = """  const mergedMatches = mergeMatches(seed.matches, publicUpcoming, cybersportSchedule, blastSchedule, lp.matches);
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
"""
assert old in s, 'merge build anchor missing'
s = s.replace(old, new, 1)

old = """      publicUpcomingCount: publicUpcoming.length,
      openDotaLeagueId: OPENDOTA_TI_LEAGUE_ID,
"""
new = """      publicUpcomingCount: publicUpcoming.length,
      blastScheduleCount: blastSchedule.length,
      cybersportScheduleCount: cybersportSchedule.length,
      scheduleSourceTtlSeconds: Math.round(SCHEDULE_SOURCE_TTL_MS / 1000),
      openDotaLeagueId: OPENDOTA_TI_LEAGUE_ID,
"""
assert old in s, 'data status counts anchor missing'
s = s.replace(old, new, 1)

old = """    attribution: `赛程与对阵优先 Liquipedia/已公布赛程；OpenDota league ${OPENDOTA_TI_LEAGUE_ID} + proMatches + live 用于 TI2026 Match ID、已完成小局、实时状态与比分。系统不根据战绩自行推算对阵，并按约 ${LIVE_REFRESH_SECONDS} 秒周期刷新。`
"""
new = """    attribution: `未来赛程按数据源优先级合并：Liquipedia LPDB > BLAST > Cybersport > 公共赛程 > 已公布本地基线；OpenDota league ${OPENDOTA_TI_LEAGUE_ID} + proMatches + live 用于开赛后的 Match ID、比分与实时状态。系统不根据瑞士轮战绩自行推算对阵。实时数据约 ${LIVE_REFRESH_SECONDS} 秒刷新，网页赛程源约 ${Math.round(SCHEDULE_SOURCE_TTL_MS/1000)} 秒缓存。`
"""
assert old in s, 'attribution anchor missing'
s = s.replace(old, new, 1)

SERVER.write_text(s, encoding='utf-8')

# Frontend source-health summary and aliases.
a = APP.read_text(encoding='utf-8')
old = """const TEAM_ALIASES = {
  '1w team': 'Iron Wing', '1win team': 'Iron Wing', 'tundra esports': 'Iron Wing',
  'parivision': 'Team VISION', 'team vision': 'Team VISION',
  'betboom team': 'BoomBoys', 'bb team': 'BoomBoys',
  'l1ga team': 'HULIGANI', 'aurora': 'Aurora Gaming'
};
"""
new = """const TEAM_ALIASES = {
  '1w': 'Iron Wing', '1w team': 'Iron Wing', '1win': 'Iron Wing', '1win team': 'Iron Wing', 'tundra esports': 'Iron Wing',
  'parivision': 'Team VISION', 'team vision': 'Team VISION',
  'betboom': 'BoomBoys', 'betboom team': 'BoomBoys', 'bb team': 'BoomBoys',
  'l1ga': 'HULIGANI', 'l1ga team': 'HULIGANI', 'aurora': 'Aurora Gaming',
  'vg': 'Vici Gaming', 'nigma': 'Nigma Galaxy', 'resilience': 'Team Resilience', 'yandex': 'Team Yandex',
  'xtreme': 'Xtreme Gaming', 'falcons': 'Team Falcons', 'liquid': 'Team Liquid', 'spirit': 'Team Spirit'
};
"""
assert old in a, 'frontend aliases anchor missing'
a = a.replace(old, new, 1)

old = """  const src = String(d.source||'').includes('opendota') ? `已公布赛程 + OpenDota ${d.dataStatus?.openDotaLeagueId||19719}` : d.source === 'liquipedia' ? 'Liquipedia 自动更新' : d.source === 'public+seed' ? '公共赛程 + 内置' : '内置赛程';
  $('#sourceBadge').textContent = src;
  const hs=d.dataStatus?.sources||{};
  const healthText=[
    `LPDB ${hs.liquipedia?.status==='ok'?'正常':hs.liquipedia?.status==='disabled'?'等待Key':'异常'}`,
    `OD赛事 ${hs.openDotaLeague?.status==='ok'?(hs.openDotaLeague.count??0)+'局':'异常'}`,
    `Pro ${hs.openDotaProMatches?.status==='ok'?(hs.openDotaProMatches.count??0)+'局':'异常'}`,
    `Live ${hs.openDotaLive?.status==='ok'?(hs.openDotaLive.count??0)+'场':'异常'}`
  ].join(' · ');
"""
new = """  const hs=d.dataStatus?.sources||{};
  const multiSchedule = (hs.blastSchedule?.count||0) + (hs.cybersportSchedule?.count||0) > 0;
  const src = multiSchedule ? `多源赛程 + OpenDota ${d.dataStatus?.openDotaLeagueId||19719}` : String(d.source||'').includes('opendota') ? `已公布赛程 + OpenDota ${d.dataStatus?.openDotaLeagueId||19719}` : d.source === 'liquipedia' ? 'Liquipedia 自动更新' : '内置赛程';
  $('#sourceBadge').textContent = src;
  const sourceCountText=(v,label)=>v?.status==='ok'?`${label} ${v.count??0}场`:v?.status==='empty'?`${label} 无新赛程`:v?.status==='disabled'?`${label} 未启用`:`${label} 异常`;
  const healthText=[
    sourceCountText(hs.blastSchedule,'BLAST'),
    sourceCountText(hs.cybersportSchedule,'Cybersport'),
    `LPDB ${hs.liquipedia?.status==='ok'?'正常':hs.liquipedia?.status==='disabled'?'等待Key':'异常'}`,
    `OD赛事 ${hs.openDotaLeague?.status==='ok'?(hs.openDotaLeague.count??0)+'局':'异常'}`,
    `Live ${hs.openDotaLive?.status==='ok'?(hs.openDotaLive.count??0)+'场':'异常'}`
  ].join(' · ');
"""
assert old in a, 'frontend health anchor missing'
a = a.replace(old, new, 1)
APP.write_text(a, encoding='utf-8')

# Correct Aug 15 static baseline. Dynamic sources will override the same confirmed pair/time.
d = json.loads(SEED.read_text(encoding='utf-8'))
matches = d.get('matches', [])
remove_prefixes = ('seed-d3-r5-1600-', 'seed-d3-r5-1900-')
matches = [m for m in matches if not str(m.get('id','')).startswith(remove_prefixes)]

updates = {
  'seed-d3-r4-1000-a': ('瑞士轮 · 第4轮 · 1-2', 'blast'),
  'seed-d3-r4-1000-b': ('瑞士轮 · 第4轮 · 1-2', 'blast'),
  'seed-d3-r4-1000-c': ('瑞士轮 · 第4轮 · 1-2', 'blast'),
  'seed-d3-r4-1000-d': ('瑞士轮 · 第4轮 · 0-3', 'cybersport'),
  'seed-d3-r4-1300-a': ('瑞士轮 · 第4轮 · 3-0', 'cybersport'),
  'seed-d3-r4-1300-b': ('瑞士轮 · 第4轮 · 2-1', 'blast'),
  'seed-d3-r4-1300-c': ('瑞士轮 · 第4轮 · 2-1', 'blast'),
  'seed-d3-r4-1300-d': ('瑞士轮 · 第4轮 · 2-1', 'blast'),
}
for m in matches:
  if m.get('id') in updates:
    m['stage'], m['source'] = updates[m['id']]
    m['status'] = 'upcoming'
    if m['id'] == 'seed-d3-r4-1300-a' and m.get('teams'):
      m['teams'][0]['name'] = 'Team VISION'

for n in (1,2,3):
  slot = f'2026-08-15-2-2-{n}'
  matches.append({
    'id': f'seed-d3-r5-2000-{n}',
    'slotKey': slot,
    'startsAt': '2026-08-15T20:00:00+08:00',
    'stage': '瑞士轮 · 第5轮 · 2-2',
    'stream': None,
    'bestOf': 3,
    'teams': [{'name':'待定','score':None},{'name':'待定','score':None}],
    'status': 'tbd',
    'source': 'blast'
  })

matches.sort(key=lambda m: m.get('startsAt',''))
d['matches'] = matches
for item in d.get('timeline', []):
  if item.get('date') == '2026-08-15':
    item['detail'] = 'Day 3 第4轮已确认 8 场：10:00 四场（含 OG vs HULIGANI），13:00 四场（含 Team VISION vs Spirit）；BLAST 已发布 20:00 三个 2-2 第5轮赛程位，双方仍为 TBD。后续继续按多数据源自动同步，不自行推算配对。'
SEED.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('patched server.js, public/app.js, data/seed.json')
