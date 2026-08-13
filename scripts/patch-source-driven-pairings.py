from pathlib import Path

p = Path('server.js')
s = p.read_text(encoding='utf-8')

start = s.index('function placeholderRecord(')
end = s.index('function applyOpenDotaScores(')

block = r'''function openDotaTeamNames(raw) {
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

'''

s = s[:start] + block + s[end:]
s = s.replace(
    'const matches = hydrateSwissPlaceholders(scoredMatches, openDotaResults, openDotaLive).map(decorateMatch);',
    'const matches = mergeOpenDotaSourcePairings(scoredMatches, openDotaResults, openDotaLive).map(decorateMatch);'
)
s = s.replace(
    "attribution: '赛程优先来自 Liquipedia LPDB v3；无 Liquipedia API Key 时使用内置赛程与公共 upcoming 源。已结束逐局结果与系列赛比分由 OpenDota proMatches 补充，并按约 2 分钟周期刷新。'",
    "attribution: '赛程与对阵以外部数据源为准：优先 Liquipedia；OpenDota live/proMatches 用于补充实时对阵、比分与 Match ID。系统不根据战绩自行推算对阵，并按约 2 分钟周期刷新。'"
)

if 'hydrateSwissPlaceholders(' in s:
    raise SystemExit('old inferred pairing function still present')
if 'teamRecordBefore(' in s or 'placeholderRecord(' in s:
    raise SystemExit('old record-based inference still present')
if 'team_name_radiant' not in s or 'mergeOpenDotaSourcePairings' not in s:
    raise SystemExit('new source-driven logic missing')

p.write_text(s, encoding='utf-8')
