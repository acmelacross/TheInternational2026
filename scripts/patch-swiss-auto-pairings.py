from pathlib import Path

p = Path('server.js')
s = p.read_text(encoding='utf-8')

anchor = "function openDotaPairKey(a, b) {\n  return [nameKey(canonicalTeamName(a)), nameKey(canonicalTeamName(b))].sort().join('|');\n}\n"
if anchor not in s:
    raise SystemExit('openDotaPairKey anchor not found')

insert = r'''

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

function placeholderRecord(match) {
  const raw = String(match?.teams?.[0]?.name || '');
  const m = raw.match(/[（(](\d+)\s*-\s*(\d+)[）)]/);
  return m ? `${Number(m[1])}-${Number(m[2])}` : null;
}

function teamRecordBefore(matches, teamName, beforeMs) {
  const key = nameKey(canonicalTeamName(teamName));
  let wins = 0, losses = 0;
  for (const m of matches || []) {
    if (m.status !== 'finished') continue;
    if ((Date.parse(m.startsAt || '') || 0) >= beforeMs) continue;
    const ts = m.teams || [];
    const mine = ts.find(t => nameKey(canonicalTeamName(t?.name)) === key);
    const other = ts.find(t => nameKey(canonicalTeamName(t?.name)) !== key);
    if (!mine || !other) continue;
    const won = mine.winner === true || (mine.score != null && other.score != null && Number(mine.score) > Number(other.score));
    const lost = other.winner === true || (mine.score != null && other.score != null && Number(other.score) > Number(mine.score));
    if (won) wins++;
    else if (lost) losses++;
  }
  return `${wins}-${losses}`;
}

function collectOpenDotaSeriesCandidates(proRows, liveRows) {
  const groups = new Map();
  const upsert = (raw, live = false) => {
    const radiant = canonicalTeamName(raw?.radiant_team?.team_name || raw?.radiant_name || '');
    const dire = canonicalTeamName(raw?.dire_team?.team_name || raw?.dire_name || '');
    if (!radiant || !dire || radiant === '待定' || dire === '待定') return;
    const allowed = new Set((seed.teams || []).map(nameKey));
    if (!allowed.has(nameKey(radiant)) || !allowed.has(nameKey(dire))) return;
    const pairKey = openDotaPairKey(radiant, dire);
    const seriesId = Number(raw?.series_id || raw?.league_series_id || 0);
    const started = Number(raw?.start_time || raw?.activate_time || raw?.lobby_start_time || 0);
    const at = started > 0 ? started * 1000 : Date.now();
    const groupKey = seriesId > 0 ? `series:${seriesId}` : `pair:${pairKey}:${Math.floor(at/(4*3600000))}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { pairKey, teams:[radiant,dire], seriesId:seriesId||null, firstAt:at, games:[], live:false, liveRaw:null });
    const g = groups.get(groupKey);
    g.firstAt = Math.min(g.firstAt || at, at);
    if (raw?.match_id) g.games.push(raw);
    if (live) { g.live = true; g.liveRaw = raw; }
  };
  for (const r of proRows || []) upsert(r, false);
  for (const r of liveRows || []) upsert(r, true);
  return [...groups.values()];
}

function hydrateSwissPlaceholders(matches, proRows, liveRows) {
  const result = (matches || []).map(m => ({...m, teams:(m.teams||[]).map(t=>({...t}))}));
  const knownPairs = new Set(result.filter(m => (m.teams||[]).length >= 2 && !(m.teams||[]).some(t => isPlaceholderTeamName(t?.name)))
    .map(m => openDotaPairKey(m.teams[0].name, m.teams[1].name)));
  const candidates = collectOpenDotaSeriesCandidates(proRows, liveRows).filter(g => !knownPairs.has(g.pairKey));
  const used = new Set();
  const slots = result.filter(m => (m.teams || []).some(t => isPlaceholderTeamName(t?.name)))
    .sort((a,b) => Date.parse(a.startsAt||'') - Date.parse(b.startsAt||'') || String(a.stream||'').localeCompare(String(b.stream||'')));

  for (const slot of slots) {
    const targetRecord = placeholderRecord(slot);
    if (!targetRecord) continue;
    const slotAt = Date.parse(slot.startsAt || '') || 0;
    const choices = candidates.filter(g => {
      if (used.has(g.pairKey)) return false;
      if (Math.abs((g.firstAt || slotAt) - slotAt) > 6 * 3600000) return false;
      const aRec = teamRecordBefore(result, g.teams[0], slotAt);
      const bRec = teamRecordBefore(result, g.teams[1], slotAt);
      return aRec === targetRecord && bRec === targetRecord;
    }).sort((a,b) => Math.abs((a.firstAt||slotAt)-slotAt) - Math.abs((b.firstAt||slotAt)-slotAt) || a.pairKey.localeCompare(b.pairKey));
    const g = choices[0];
    if (!g) continue;
    used.add(g.pairKey);

    const score = new Map([[nameKey(g.teams[0]),0],[nameKey(g.teams[1]),0]]);
    const ids = new Set(slot.matchIds || []);
    for (const game of g.games) {
      if (game?.match_id) ids.add(String(game.match_id));
      const rw = game?.radiant_win === true || game?.radiant_win === 1 || String(game?.radiant_win).toLowerCase() === 'true';
      const rname = canonicalTeamName(game?.radiant_name || game?.radiant_team?.team_name || '');
      const dname = canonicalTeamName(game?.dire_name || game?.dire_team?.team_name || '');
      const winner = rw ? rname : dname;
      const k = nameKey(winner);
      if (score.has(k)) score.set(k, score.get(k) + 1);
    }
    if (g.liveRaw) {
      const lr = g.liveRaw;
      const rname = canonicalTeamName(lr?.radiant_team?.team_name || lr?.radiant_name || '');
      const dname = canonicalTeamName(lr?.dire_team?.team_name || lr?.dire_name || '');
      const rs = Number(lr?.radiant_series_wins);
      const ds = Number(lr?.dire_series_wins);
      if (Number.isFinite(rs) && score.has(nameKey(rname))) score.set(nameKey(rname), Math.max(score.get(nameKey(rname)) || 0, rs));
      if (Number.isFinite(ds) && score.has(nameKey(dname))) score.set(nameKey(dname), Math.max(score.get(nameKey(dname)) || 0, ds));
      if (lr?.match_id) ids.add(String(lr.match_id));
    }
    slot.teams = g.teams.map(name => ({ name, score:score.get(nameKey(name)) || 0, winner:false }));
    const winsNeeded = Math.floor(Number(slot.bestOf || 3)/2)+1;
    const maxScore = Math.max(...slot.teams.map(t=>Number(t.score||0)));
    const finished = maxScore >= winsNeeded;
    if (finished) slot.teams.forEach(t => { t.winner = Number(t.score||0) === maxScore; });
    slot.status = finished ? 'finished' : (g.live || g.games.length ? 'live' : 'upcoming');
    slot.matchIds = [...ids];
    slot.source = g.live ? 'opendota-live' : 'opendota-discovered';
    slot.scoreSource = g.live ? 'OpenDota live' : 'OpenDota proMatches';
    slot.stage = String(slot.stage || '').replace('后续对阵', `第2轮 · ${targetRecord}组`);
  }
  return result;
}
'''

if 'function hydrateSwissPlaceholders(' not in s:
    s = s.replace(anchor, anchor + insert, 1)

old = "  let openDotaResults = [];\n  try { openDotaResults = await fetchOpenDotaProResults(); }\n  catch (err) { errors.push(`OpenDota scores: ${err.message}`); }\n\n  const mergedMatches = mergeMatches(seed.matches, publicUpcoming, lp.matches);\n  const matches = applyOpenDotaScores(mergedMatches, openDotaResults).map(decorateMatch);"
new = "  let openDotaResults = [];\n  try { openDotaResults = await fetchOpenDotaProResults(); }\n  catch (err) { errors.push(`OpenDota scores: ${err.message}`); }\n  let openDotaLive = [];\n  try { openDotaLive = await fetchOpenDotaLive(); }\n  catch (err) { errors.push(`OpenDota live: ${err.message}`); }\n\n  const mergedMatches = mergeMatches(seed.matches, publicUpcoming, lp.matches);\n  const scoredMatches = applyOpenDotaScores(mergedMatches, openDotaResults);\n  const matches = hydrateSwissPlaceholders(scoredMatches, openDotaResults, openDotaLive).map(decorateMatch);"
if old not in s:
    raise SystemExit('buildPayload OpenDota block not found')
s = s.replace(old, new, 1)

old2 = "      openDotaResultCount: openDotaResults.length,\n      liveRefreshSeconds: LIVE_REFRESH_SECONDS,"
new2 = "      openDotaResultCount: openDotaResults.length,\n      openDotaLiveCount: openDotaLive.length,\n      liveRefreshSeconds: LIVE_REFRESH_SECONDS,"
if old2 not in s:
    raise SystemExit('dataStatus block not found')
s = s.replace(old2, new2, 1)

p.write_text(s, encoding='utf-8')

app = Path('public/app.js')
a = app.read_text(encoding='utf-8')
old3 = "function teamLogoHtml(name, cls = 'team-logo') {\n  const src = teamAsset(name);"
new3 = "function teamLogoHtml(name, cls = 'team-logo') {\n  if (/^待定/.test(String(name || '').trim())) return '';\n  const src = teamAsset(name);"
if old3 not in a:
    raise SystemExit('teamLogoHtml marker not found')
a = a.replace(old3, new3, 1)
app.write_text(a, encoding='utf-8')
