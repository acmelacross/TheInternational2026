from pathlib import Path
import json, re

root = Path('.')
server_p = root / 'server.js'
server = server_p.read_text(encoding='utf-8')

old = """const LIVE_REFRESH_SECONDS = Math.max(60, Number(process.env.LIVE_REFRESH_INTERVAL_SECONDS || 120));
const AUTO_REFRESH_INTERVAL_MS = LIVE_REFRESH_SECONDS * 1000;
const CACHE_TTL_MS = AUTO_REFRESH_INTERVAL_MS;"""
new = """const LIVE_REFRESH_SECONDS = Math.max(60, Number(process.env.LIVE_REFRESH_INTERVAL_SECONDS || 120));
const SOURCE_ROTATION_SECONDS = Math.max(60, Number(process.env.SOURCE_ROTATION_INTERVAL_SECONDS || 120));
const FULL_RECONCILE_SECONDS = Math.max(SOURCE_ROTATION_SECONDS * 3, Number(process.env.FULL_RECONCILE_INTERVAL_SECONDS || 1800));
const AUTO_REFRESH_INTERVAL_MS = SOURCE_ROTATION_SECONDS * 1000;
const FULL_RECONCILE_INTERVAL_MS = FULL_RECONCILE_SECONDS * 1000;
const FULL_REFRESH_STAGGER_MS = Math.max(0, Number(process.env.FULL_REFRESH_STAGGER_MS || 350));
const MANUAL_REFRESH_COOLDOWN_MS = Math.max(30000, Number(process.env.MANUAL_REFRESH_COOLDOWN_SECONDS || 60) * 1000);
const CACHE_TTL_MS = AUTO_REFRESH_INTERVAL_MS;"""
assert old in server
server = server.replace(old, new, 1)

old = """const SCHEDULE_SOURCE_TTL_MS = Math.max(60, Number(process.env.SCHEDULE_SOURCE_TTL_SECONDS || 300)) * 1000;
const scheduleSourceCache = new Map();"""
new = """const SCHEDULE_SOURCE_TTL_MS = Math.max(60, Number(process.env.SCHEDULE_SOURCE_TTL_SECONDS || 300)) * 1000;
const scheduleSourceCache = new Map();
const SOURCE_STATE_PATH = path.join(DATA_DIR, 'source-observations.json');"""
assert old in server
server = server.replace(old, new, 1)

old = """let memoryCache = readDiskCache();
let refreshPromise = null;
let lastManualRefreshAt = 0;"""
new = """let memoryCache = readDiskCache();
let sourceState = readSourceState();
let sourceSequence = Number(sourceState.sequence || 0);
let scheduleRotationCursor = 0;
let runtimeRotationCursor = 0;
let refreshPromise = null;
let currentRefreshMode = null;
let lastManualRefreshAt = 0;
let lastFullRefreshAt = sourceState.lastFullRefreshAt || null;"""
assert old in server
server = server.replace(old, new, 1)

marker = """function writeDiskCache(payload) {"""
insert = r'''
function readSourceState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SOURCE_STATE_PATH, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.sources && typeof parsed.sources === 'object') {
      return { version: 1, sequence: Number(parsed.sequence || 0), lastFullRefreshAt: parsed.lastFullRefreshAt || null, sources: parsed.sources };
    }
  } catch (_) {}
  return { version: 1, sequence: 0, lastFullRefreshAt: null, sources: {} };
}

function writeSourceState() {
  try {
    fs.mkdirSync(path.dirname(SOURCE_STATE_PATH), { recursive: true });
    sourceState.sequence = sourceSequence;
    sourceState.lastFullRefreshAt = lastFullRefreshAt;
    fs.writeFileSync(SOURCE_STATE_PATH, JSON.stringify(sourceState, null, 2), 'utf8');
  } catch (err) {
    console.warn('[source-state] write failed:', err.message);
  }
}

function sourceEntry(key) {
  return sourceState.sources?.[key] || null;
}

function sourceData(key) {
  const entry = sourceEntry(key);
  return Array.isArray(entry?.data) ? entry.data : [];
}

'''
assert marker in server
server = server.replace(marker, insert + marker, 1)

old = "async function fetchSchedulePageCached(key, url) {\n  const cached = scheduleSourceCache.get(key);\n  if (cached && Date.now() - cached.at < SCHEDULE_SOURCE_TTL_MS) return cached.value;"
new = "async function fetchSchedulePageCached(key, url, force = false) {\n  const cached = scheduleSourceCache.get(key);\n  if (!force && cached && Date.now() - cached.at < SCHEDULE_SOURCE_TTL_MS) return cached.value;"
assert old in server
server = server.replace(old, new, 1)
server = server.replace("async function fetchBlastSchedule() {\n  const { raw, text } = await fetchSchedulePageCached('blast', BLAST_SCHEDULE_URL);",
                        "async function fetchBlastSchedule(force = false) {\n  const { raw, text } = await fetchSchedulePageCached('blast', BLAST_SCHEDULE_URL, force);", 1)
server = server.replace("async function fetchCybersportSchedule() {\n  const { text } = await fetchSchedulePageCached('cybersport', CYBERSPORT_SCHEDULE_URL);",
                        "async function fetchCybersportSchedule(force = false) {\n  const { text } = await fetchSchedulePageCached('cybersport', CYBERSPORT_SCHEDULE_URL, force);", 1)

helpers = r'''
const ALL_REFRESH_SOURCE_KEYS = ['liquipedia', 'blastSchedule', 'cybersportSchedule', 'publicUpcoming', 'openDotaLeague', 'openDotaProMatches', 'openDotaLive'];
const RUNTIME_ROTATION_PATTERN = ['openDotaLive', 'openDotaLeague', 'openDotaLive', 'openDotaProMatches', 'openDotaLive'];

function scheduleRotationKeys() {
  const keys = [];
  if (LIQUIPEDIA_API_KEY) keys.push('liquipedia');
  keys.push('blastSchedule', 'cybersportSchedule');
  if (PUBLIC_FALLBACK_ENABLED) keys.push('publicUpcoming');
  return keys;
}

function nextAutoRefreshKeys() {
  const scheduleKeys = scheduleRotationKeys();
  const scheduleKey = scheduleKeys[scheduleRotationCursor % scheduleKeys.length];
  scheduleRotationCursor = (scheduleRotationCursor + 1) % Math.max(1, scheduleKeys.length);
  const runtimeKey = RUNTIME_ROTATION_PATTERN[runtimeRotationCursor % RUNTIME_ROTATION_PATTERN.length];
  runtimeRotationCursor = (runtimeRotationCursor + 1) % RUNTIME_ROTATION_PATTERN.length;
  return [...new Set([scheduleKey, runtimeKey].filter(Boolean))];
}

function sourceHealth(key, extra = {}) {
  const e = sourceEntry(key);
  if (!e) {
    if (key === 'liquipedia' && !LIQUIPEDIA_API_KEY) return { status:'disabled', reason:'missing_api_key', count:0, ...extra };
    if (key === 'publicUpcoming' && !PUBLIC_FALLBACK_ENABLED) return { status:'disabled', reason:'disabled_by_config', count:0, ...extra };
    return { status:'pending', count:0, ...extra };
  }
  const count = Array.isArray(e.data) ? e.data.length : 0;
  const ageSeconds = e.lastSuccessAt ? Math.max(0, Math.round((Date.now() - Date.parse(e.lastSuccessAt)) / 1000)) : null;
  return {
    status: e.status || (count ? 'ok' : 'empty'),
    count,
    lastAttemptAt: e.lastAttemptAt || null,
    lastSuccessAt: e.lastSuccessAt || null,
    observedAt: e.observedAt || null,
    sequence: Number(e.sequence || 0),
    ageSeconds,
    usingStaleData: Boolean(count && e.status === 'error'),
    ...(e.error ? { error:e.error } : {}),
    ...(e.reason ? { reason:e.reason } : {}),
    ...(e.meta ? { meta:e.meta } : {}),
    ...extra
  };
}

function scheduleBucketKey(match) {
  const t = Date.parse(match?.startsAt || '');
  return Number.isFinite(t) ? String(Math.floor(t / (30 * 60 * 1000))) : `invalid:${match?.id || ''}`;
}

function matchTeamKeys(match) {
  return (match?.teams || []).slice(0, 2).map(t => nameKey(canonicalTeamName(t?.name || ''))).filter(Boolean);
}

function reconcileScheduleMatches(sourceLists) {
  const named = new Map();
  const tbd = new Map();

  for (const src of sourceLists || []) {
    const sourceKey = String(src?.key || 'unknown');
    const sequence = Number(src?.sequence || 0);
    const observedAt = src?.observedAt || null;
    const evidence = src?.evidence !== false;
    for (const raw of src?.matches || []) {
      if (!raw?.startsAt || !Array.isArray(raw.teams) || raw.teams.length < 2) continue;
      const match = { ...raw, teams: raw.teams.map(t => ({ ...t })) };
      const bucket = scheduleBucketKey(match);
      const names = match.teams.slice(0, 2).map(t => canonicalTeamName(t?.name || ''));
      const hasTbd = names.some(n => !n || isPlaceholderTeamName(n));
      const variant = { sourceKey, sequence, observedAt, evidence, match };

      if (hasTbd) {
        const slot = match.slotKey || `${match.stage || ''}:${match.id || ''}`;
        const key = `${bucket}:tbd:${slot}`;
        if (!tbd.has(key)) tbd.set(key, []);
        tbd.get(key).push(variant);
        continue;
      }

      const pairKey = openDotaPairKey(names[0], names[1]);
      const key = `${bucket}:${pairKey}`;
      if (!named.has(key)) named.set(key, { bucket, pairKey, teams:matchTeamKeys(match), variants:[] });
      named.get(key).variants.push(variant);
    }
  }

  const claims = [...named.values()].map(claim => {
    const variants = claim.variants.slice().sort((a,b) => b.sequence - a.sequence || Date.parse(b.observedAt || 0) - Date.parse(a.observedAt || 0));
    const chosen = variants[0];
    const supportSources = [...new Set(variants.filter(v => v.evidence).map(v => v.sourceKey))];
    return { ...claim, chosen, latestSequence:chosen.sequence, supportSources, conflicts:[] };
  });

  const selected = [];
  const byBucket = new Map();
  for (const claim of claims) {
    if (!byBucket.has(claim.bucket)) byBucket.set(claim.bucket, []);
    byBucket.get(claim.bucket).push(claim);
  }
  for (const group of byBucket.values()) {
    group.sort((a,b) => b.latestSequence - a.latestSequence);
    const local = [];
    for (const claim of group) {
      const overlapping = local.find(x => x.teams.some(t => claim.teams.includes(t)));
      if (overlapping) {
        overlapping.conflicts.push(claim);
        continue;
      }
      local.push(claim);
    }
    selected.push(...local);
  }

  const resolved = selected.map(claim => {
    const supportCount = claim.supportSources.length;
    const conflictAlternatives = claim.conflicts.map(c => ({
      teams: c.chosen.match.teams.slice(0,2).map(t => canonicalTeamName(t?.name || '')),
      source: c.chosen.sourceKey,
      sources: c.supportSources,
      observedAt: c.chosen.observedAt,
      sequence: c.latestSequence
    }));
    let status = 'baseline';
    if (supportCount >= 2) status = 'confirmed';
    else if (conflictAlternatives.length) status = 'conflict-latest';
    else if (supportCount === 1) status = 'provisional';
    const chosenMatch = claim.chosen.match;
    return {
      ...chosenMatch,
      source: claim.chosen.sourceKey === 'seed' ? (chosenMatch.source || 'seed') : (chosenMatch.source || claim.chosen.sourceKey),
      verification: {
        status,
        sourceCount: supportCount,
        sources: claim.supportSources,
        chosenSource: claim.chosen.sourceKey,
        observedAt: claim.chosen.observedAt,
        sequence: claim.latestSequence,
        conflict: conflictAlternatives.length > 0,
        conflictAlternatives
      }
    };
  });

  for (const variants of tbd.values()) {
    variants.sort((a,b) => b.sequence - a.sequence || Date.parse(b.observedAt || 0) - Date.parse(a.observedAt || 0));
    const chosen = variants[0];
    const supportSources = [...new Set(variants.filter(v => v.evidence).map(v => v.sourceKey))];
    resolved.push({
      ...chosen.match,
      verification: {
        status: supportSources.length >= 2 ? 'confirmed' : supportSources.length === 1 ? 'provisional' : 'baseline',
        sourceCount: supportSources.length,
        sources: supportSources,
        chosenSource: chosen.sourceKey,
        observedAt: chosen.observedAt,
        sequence: chosen.sequence,
        conflict:false,
        conflictAlternatives:[]
      }
    });
  }

  return resolved.sort((a,b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

async function refreshOneSource(key, { forceNetwork = false } = {}) {
  const nowIso = new Date().toISOString();
  const prev = sourceEntry(key) || {};
  if (key === 'liquipedia' && !LIQUIPEDIA_API_KEY) {
    sourceState.sources[key] = { ...prev, status:'disabled', reason:'missing_api_key', lastAttemptAt:nowIso, error:null };
    writeSourceState();
    return { key, status:'disabled', count:Array.isArray(prev.data) ? prev.data.length : 0 };
  }
  if (key === 'publicUpcoming' && !PUBLIC_FALLBACK_ENABLED) {
    sourceState.sources[key] = { ...prev, status:'disabled', reason:'disabled_by_config', lastAttemptAt:nowIso, error:null };
    writeSourceState();
    return { key, status:'disabled', count:Array.isArray(prev.data) ? prev.data.length : 0 };
  }

  try {
    let data = [];
    let meta = null;
    if (key === 'liquipedia') {
      const lp = await fetchLiquipediaMatches();
      data = lp.matches;
      meta = lp.meta;
    } else if (key === 'blastSchedule') data = await fetchBlastSchedule(forceNetwork);
    else if (key === 'cybersportSchedule') data = await fetchCybersportSchedule(forceNetwork);
    else if (key === 'publicUpcoming') data = await fetchPublicUpcoming();
    else if (key === 'openDotaLeague') data = await fetchOpenDotaLeagueMatches();
    else if (key === 'openDotaProMatches') data = await fetchOpenDotaProResults();
    else if (key === 'openDotaLive') data = await fetchOpenDotaLive();
    else throw new Error(`unknown_source:${key}`);

    sourceSequence += 1;
    sourceState.sources[key] = {
      status: Array.isArray(data) && data.length ? 'ok' : 'empty',
      data: Array.isArray(data) ? data : [],
      meta,
      observedAt: nowIso,
      lastAttemptAt: nowIso,
      lastSuccessAt: nowIso,
      sequence: sourceSequence,
      error: null,
      reason: null
    };
    writeSourceState();
    return { key, status:sourceState.sources[key].status, count:sourceState.sources[key].data.length, sequence:sourceSequence };
  } catch (err) {
    sourceState.sources[key] = {
      ...prev,
      status:'error',
      lastAttemptAt:nowIso,
      error:err.message,
      reason:null
    };
    writeSourceState();
    return { key, status:'error', count:Array.isArray(prev.data) ? prev.data.length : 0, error:err.message };
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function refreshSources(keys, { forceNetwork = false, staggerMs = 0 } = {}) {
  const unique = [...new Set((keys || []).filter(Boolean))];
  const results = [];
  for (let i = 0; i < unique.length; i++) {
    results.push(await refreshOneSource(unique[i], { forceNetwork }));
    if (staggerMs > 0 && i < unique.length - 1) await sleep(staggerMs);
  }
  return results;
}

function buildPayloadFromSnapshots(refreshMeta = {}) {
  const lpMatches = sourceData('liquipedia');
  const blastSchedule = sourceData('blastSchedule');
  const cybersportSchedule = sourceData('cybersportSchedule');
  const publicUpcoming = sourceData('publicUpcoming');
  const openDotaLeague = sourceData('openDotaLeague');
  const openDotaPro = sourceData('openDotaProMatches');
  const openDotaLive = sourceData('openDotaLive');
  const openDotaResults = mergeOpenDotaGameRows(openDotaLeague, openDotaPro);

  const scheduleMatches = reconcileScheduleMatches([
    { key:'liquipedia', matches:lpMatches, sequence:sourceEntry('liquipedia')?.sequence || 0, observedAt:sourceEntry('liquipedia')?.observedAt || null, evidence:true },
    { key:'blastSchedule', matches:blastSchedule, sequence:sourceEntry('blastSchedule')?.sequence || 0, observedAt:sourceEntry('blastSchedule')?.observedAt || null, evidence:true },
    { key:'cybersportSchedule', matches:cybersportSchedule, sequence:sourceEntry('cybersportSchedule')?.sequence || 0, observedAt:sourceEntry('cybersportSchedule')?.observedAt || null, evidence:true },
    { key:'publicUpcoming', matches:publicUpcoming, sequence:sourceEntry('publicUpcoming')?.sequence || 0, observedAt:sourceEntry('publicUpcoming')?.observedAt || null, evidence:true },
    { key:'seed', matches:seed.matches || [], sequence:0, observedAt:null, evidence:false }
  ]);

  const scoredMatches = applyOpenDotaScores(scheduleMatches, openDotaResults);
  const matches = mergeOpenDotaSourcePairings(scoredMatches, openDotaResults, openDotaLive).map(decorateMatch);
  const teams = deriveTeams(matches);
  const standings = deriveStandings(matches, teams);
  const sources = {
    liquipedia: sourceHealth('liquipedia'),
    blastSchedule: sourceHealth('blastSchedule', { cacheTtlSeconds:Math.round(SCHEDULE_SOURCE_TTL_MS/1000) }),
    cybersportSchedule: sourceHealth('cybersportSchedule', { cacheTtlSeconds:Math.round(SCHEDULE_SOURCE_TTL_MS/1000) }),
    publicUpcoming: sourceHealth('publicUpcoming'),
    openDotaLeague: sourceHealth('openDotaLeague', { leagueId:OPENDOTA_TI_LEAGUE_ID }),
    openDotaProMatches: sourceHealth('openDotaProMatches'),
    openDotaLive: sourceHealth('openDotaLive')
  };
  const errors = Object.entries(sources).filter(([,v]) => v?.status === 'error' && v?.error).map(([k,v]) => `${k}: ${v.error}`);
  const verificationSummary = matches.reduce((acc, m) => {
    const s = m?.verification?.status || 'untracked';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, { confirmed:0, provisional:0, 'conflict-latest':0, baseline:0, untracked:0 });

  const scheduleSourceParts = [];
  if (lpMatches.length) scheduleSourceParts.push('liquipedia');
  if (blastSchedule.length) scheduleSourceParts.push('blast');
  if (cybersportSchedule.length) scheduleSourceParts.push('cybersport');
  if (publicUpcoming.length) scheduleSourceParts.push('public');
  scheduleSourceParts.push('seed');
  const baseSource = [...new Set(scheduleSourceParts)].join('+');
  const source = openDotaResults.length ? `${baseSource}+opendota-league` : baseSource;
  const lpMeta = sourceEntry('liquipedia')?.meta || { enabled:Boolean(LIQUIPEDIA_API_KEY), reason:LIQUIPEDIA_API_KEY ? null : 'missing_api_key' };

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
    refreshMeta,
    dataStatus: {
      liquipediaConfigured: Boolean(LIQUIPEDIA_API_KEY),
      liquipedia: lpMeta,
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
      sourceRotationSeconds: SOURCE_ROTATION_SECONDS,
      fullReconcileSeconds: FULL_RECONCILE_SECONDS,
      lastFullRefreshAt,
      verificationSummary,
      refreshPolicy: {
        automatic:'partial-round-robin',
        partialEverySeconds:SOURCE_ROTATION_SECONDS,
        periodicFullEverySeconds:FULL_RECONCILE_SECONDS,
        manualRefresh:'all-sources',
        manualCooldownSeconds:Math.round(MANUAL_REFRESH_COOLDOWN_MS/1000),
        fullRefreshStaggerMs:FULL_REFRESH_STAGGER_MS,
        scheduleRotation:scheduleRotationKeys(),
        runtimeRotation:RUNTIME_ROTATION_PATTERN
      },
      seedCount: seed.matches.length,
      sources,
      errors
    },
    attribution: `多源赛程采用“新数据先展示、后续多源复核”：任一来源发现新赛程即可进入页面；两个及以上独立来源一致时标记为已确认。若来源冲突，临时采用最近一次成功刷新的来源，同时保留冲突记录，等待后续来源复核。自动刷新每 ${SOURCE_ROTATION_SECONDS} 秒轮询部分来源，每 ${FULL_RECONCILE_SECONDS} 秒执行一次错峰全源复核；手动刷新会错峰刷新全部来源。OpenDota league ${OPENDOTA_TI_LEAGUE_ID} / proMatches / live 负责开赛后的 Match ID、比分与实时状态。系统不根据瑞士轮战绩自行推算对阵。`
  };
}

async function runRefresh(mode = 'partial', options = {}) {
  if (refreshPromise) {
    await refreshPromise;
    if (mode === 'full' && options.requireFreshFull) {
      return runRefresh('full', { ...options, requireFreshFull:false });
    }
    return memoryCache;
  }
  const keys = mode === 'full' ? ALL_REFRESH_SOURCE_KEYS : nextAutoRefreshKeys();
  currentRefreshMode = mode;
  refreshPromise = (async () => {
    const results = await refreshSources(keys, {
      forceNetwork: options.forceNetwork === true,
      staggerMs: mode === 'full' ? (options.staggerMs ?? FULL_REFRESH_STAGGER_MS) : 0
    });
    if (mode === 'full') {
      lastFullRefreshAt = new Date().toISOString();
      writeSourceState();
    }
    const next = buildPayloadFromSnapshots({
      mode,
      trigger:options.trigger || mode,
      refreshedSources:keys,
      sourceResults:results,
      completedAt:new Date().toISOString()
    });
    memoryCache = next;
    writeDiskCache(next);
    return next;
  })().finally(() => {
    refreshPromise = null;
    currentRefreshMode = null;
  });
  return refreshPromise;
}

async function refresh(force = false) {
  if (!force) {
    if (memoryCache) return memoryCache;
    const initial = buildPayloadFromSnapshots({ mode:'cache', trigger:'read', refreshedSources:[] });
    memoryCache = initial;
    writeDiskCache(initial);
    return initial;
  }
  return runRefresh('full', { forceNetwork:true, staggerMs:FULL_REFRESH_STAGGER_MS, trigger:'manual', requireFreshFull:true });
}

'''

pattern = re.compile(r"async function buildPayload\(\) \{[\s\S]*?\nasync function refresh\(force = false\) \{[\s\S]*?\n\}\n\n(?=function sendJson)")
m = pattern.search(server)
assert m, 'buildPayload/refresh block not found'
server = server[:m.start()] + helpers + server[m.end():]

server = server.replace("version: '1.3.9', dataDir: DATA_DIR, autoRefreshSeconds: Math.round(AUTO_REFRESH_INTERVAL_MS/1000)",
                        "version: '1.4.0', dataDir: DATA_DIR, autoRefreshSeconds: SOURCE_ROTATION_SECONDS, fullReconcileSeconds: FULL_RECONCILE_SECONDS", 1)
server = server.replace("return sendJson(res, 200, { generatedAt:data.generatedAt, source:data.source, refreshSeconds:LIVE_REFRESH_SECONDS, sources:data.dataStatus?.sources || {}, errors:data.dataStatus?.errors || [] });",
                        "return sendJson(res, 200, { generatedAt:data.generatedAt, source:data.source, refreshSeconds:SOURCE_ROTATION_SECONDS, fullReconcileSeconds:FULL_RECONCILE_SECONDS, currentRefreshMode, refreshMeta:data.refreshMeta || null, refreshPolicy:data.dataStatus?.refreshPolicy || {}, verificationSummary:data.dataStatus?.verificationSummary || {}, sources:data.dataStatus?.sources || {}, errors:data.dataStatus?.errors || [] });", 1)
server = server.replace("if (now - lastManualRefreshAt < 30000) return sendJson(res, 429, { error: 'refresh_too_frequent', retryAfterSeconds: Math.ceil((30000 - (now - lastManualRefreshAt))/1000) });",
                        "if (now - lastManualRefreshAt < MANUAL_REFRESH_COOLDOWN_MS) return sendJson(res, 429, { error: 'refresh_too_frequent', retryAfterSeconds: Math.ceil((MANUAL_REFRESH_COOLDOWN_MS - (now - lastManualRefreshAt))/1000) });", 1)

old = """server.listen(PORT, '0.0.0.0', () => {
  console.log(`TI2026 观赛指南已启动: http://127.0.0.1:${PORT}`);
  console.log(`Liquipedia API Key: ${LIQUIPEDIA_API_KEY ? '已配置' : '未配置（当前使用降级模式）'}`);
  console.log(`赛程自动同步: 每 ${Math.round(AUTO_REFRESH_INTERVAL_MS/60000)} 分钟`);
  setTimeout(() => refresh(false).catch(err => console.error('[startup-refresh]', err)), 2000).unref();
  setInterval(() => refresh(true).then(d => console.log('[auto-refresh]', d.generatedAt, d.source)).catch(err => console.error('[auto-refresh]', err)), AUTO_REFRESH_INTERVAL_MS).unref();
});"""
new = """server.listen(PORT, '0.0.0.0', () => {
  console.log(`TI2026 观赛指南 v1.4.0 已启动: http://127.0.0.1:${PORT}`);
  console.log(`Liquipedia API Key: ${LIQUIPEDIA_API_KEY ? '已配置' : '未配置（当前使用降级模式）'}`);
  console.log(`多源轮询: 每 ${SOURCE_ROTATION_SECONDS} 秒刷新部分来源；每 ${FULL_RECONCILE_SECONDS} 秒错峰全源复核`);
  setTimeout(() => runRefresh('full', { forceNetwork:true, staggerMs:FULL_REFRESH_STAGGER_MS, trigger:'startup' }).then(d => console.log('[startup-full-refresh]', d.generatedAt, d.source)).catch(err => console.error('[startup-refresh]', err)), 1500).unref();
  setInterval(() => runRefresh('partial', { forceNetwork:true, trigger:'auto-partial' }).then(d => console.log('[auto-partial]', d.refreshMeta?.refreshedSources?.join(','), d.generatedAt)).catch(err => console.error('[auto-partial]', err)), AUTO_REFRESH_INTERVAL_MS).unref();
  setInterval(() => runRefresh('full', { forceNetwork:true, staggerMs:FULL_REFRESH_STAGGER_MS, trigger:'auto-full' }).then(d => console.log('[auto-full]', d.generatedAt, d.source)).catch(err => console.error('[auto-full]', err)), FULL_RECONCILE_INTERVAL_MS).unref();
});"""
assert old in server
server = server.replace(old, new, 1)

server = server.replace("deriveStandings, decorateMatch, isLikelyTi2026Match, extractMatchIds, normalizeDota2DbGame, canonicalTeamName\n};",
                        "deriveStandings, decorateMatch, isLikelyTi2026Match, extractMatchIds, normalizeDota2DbGame, canonicalTeamName, reconcileScheduleMatches, scheduleBucketKey\n};", 1)
server_p.write_text(server, encoding='utf-8')

# Frontend verification badges and refresh policy summary.
app_p = root / 'public' / 'app.js'
app = app_p.read_text(encoding='utf-8')
needle = "function starText(score) { const n = Math.round(score); return '★'.repeat(n) + '☆'.repeat(5 - n); }\n"
add = needle + r'''function verificationBadge(m) {
  const v = m?.verification;
  if (!v) return '';
  if (v.status === 'confirmed') return `<span class="source-verify confirmed" title="${escapeHtml((v.sources || []).join(' + '))}">✓ ${v.sourceCount || 2}源确认</span>`;
  if (v.status === 'conflict-latest') return `<span class="source-verify conflict" title="冲突时临时采用最近成功刷新的来源：${escapeHtml(v.chosenSource || '')}">⚠ 冲突待核</span>`;
  if (v.status === 'provisional') return `<span class="source-verify provisional" title="当前仅 ${escapeHtml(v.chosenSource || '1个来源')} 返回该赛程">单源待复核</span>`;
  return '';
}
'''
assert needle in app
app = app.replace(needle, add, 1)

old = """    `Live ${hs.openDotaLive?.status==='ok'?(hs.openDotaLive.count??0)+'场':'异常'}`
  ].join(' · ');"""
new = """    `Live ${hs.openDotaLive?.status==='ok'?(hs.openDotaLive.count??0)+'场':'异常'}`,
    d.dataStatus?.verificationSummary ? `复核 ${d.dataStatus.verificationSummary.confirmed||0}确认/${d.dataStatus.verificationSummary.provisional||0}单源/${d.dataStatus.verificationSummary['conflict-latest']||0}冲突` : ''
  ].filter(Boolean).join(' · ');"""
assert old in app
app = app.replace(old, new, 1)

old = """    <div class=\"match-top\"><div><span class=\"match-time\">${fmtTime.format(new Date(m.startsAt))}</span> <span class=\"stream-pill\">${m.stream ? `${escapeHtml(m.stream)}流 · ` : ''}BO${m.bestOf || 3}</span><span class=\"rating\" title=\"${escapeHtml(rec.reason)}\"><b>${rec.score}</b> ${starText(rec.score)}</span></div><span class=\"status ${escapeHtml(m.status)}\">${statusText(m.status)}</span></div>"""
new = """    <div class=\"match-top\"><div><span class=\"match-time\">${fmtTime.format(new Date(m.startsAt))}</span> <span class=\"stream-pill\">${m.stream ? `${escapeHtml(m.stream)}流 · ` : ''}BO${m.bestOf || 3}</span><span class=\"rating\" title=\"${escapeHtml(rec.reason)}\"><b>${rec.score}</b> ${starText(rec.score)}</span></div><span class=\"match-source-status\">${verificationBadge(m)}<span class=\"status ${escapeHtml(m.status)}\">${statusText(m.status)}</span></span></div>"""
assert old in app
app = app.replace(old, new, 1)

old = """  if ($('#todayTitle')) $('#todayTitle').textContent = `今日赛程 · ${today.length} 场已确认`;
  if ($('#tomorrowTitle')) $('#tomorrowTitle').textContent = `明日赛程 · ${tomorrow.length} 场已确认`;"""
new = """  const todayConfirmed = today.filter(m => m?.verification?.status === 'confirmed' || ['live','finished'].includes(m.status)).length;
  const tomorrowConfirmed = tomorrow.filter(m => m?.verification?.status === 'confirmed').length;
  if ($('#todayTitle')) $('#todayTitle').textContent = `今日赛程 · ${today.length} 场 · ${todayConfirmed} 场多源确认`;
  if ($('#tomorrowTitle')) $('#tomorrowTitle').textContent = `明日赛程 · ${tomorrow.length} 场 · ${tomorrowConfirmed} 场多源确认`;"""
assert old in app
app = app.replace(old, new, 1)
app_p.write_text(app, encoding='utf-8')

css_p = root / 'public' / 'v135.css'
css = css_p.read_text(encoding='utf-8')
if '.source-verify' not in css:
    css += r'''

/* v1.4.0 multi-source schedule verification */
.match-source-status{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.source-verify{display:inline-flex;align-items:center;min-height:22px;padding:2px 7px;border:1px solid rgba(255,255,255,.12);border-radius:999px;font-size:10px;line-height:1.2;white-space:nowrap;opacity:.9}
.source-verify.confirmed{font-weight:700}
.source-verify.provisional{opacity:.72}
.source-verify.conflict{font-weight:700;border-style:dashed}
@media(max-width:600px){.match-source-status{gap:4px}.source-verify{font-size:9px;padding:2px 5px}}
'''
css_p.write_text(css, encoding='utf-8')

# Version and env defaults.
pkg_p = root / 'package.json'
pkg = json.loads(pkg_p.read_text(encoding='utf-8'))
pkg['version'] = '1.4.0'
pkg['description'] = 'TI2026 Dota 2 观赛指南 v1.4：多源轮询、最新源冲突临时展示、双源复核、OpenDota 实时赛况与 Linux 部署'
pkg_p.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

env_p = root / '.env.example'
env = env_p.read_text(encoding='utf-8')
env = env.replace('CACHE_TTL_SECONDS=3600\nAUTO_REFRESH_INTERVAL_SECONDS=3600\nLIVE_REFRESH_INTERVAL_SECONDS=120\nGAME_DETAIL_TTL_SECONDS=300\n',
'''LIVE_REFRESH_INTERVAL_SECONDS=120
# 自动刷新每次只轮询部分来源；默认每 120 秒一轮
SOURCE_ROTATION_INTERVAL_SECONDS=120
# 每 30 分钟错峰刷新全部来源，用于完整复核
FULL_RECONCILE_INTERVAL_SECONDS=1800
# 全源刷新时各来源之间错开 350ms，降低突发请求
FULL_REFRESH_STAGGER_MS=350
MANUAL_REFRESH_COOLDOWN_SECONDS=60
SCHEDULE_SOURCE_TTL_SECONDS=300
GAME_DETAIL_TTL_SECONDS=300
''')
env_p.write_text(env, encoding='utf-8')

# Add deterministic unit coverage for reconciliation policy.
tests_p = root / 'tests.js'
tests = tests_p.read_text(encoding='utf-8')
needle = "assert.equal(mod.canonicalTeamName('L1GA TEAM'),'HULIGANI');\n"
extra = needle + r'''

const t = '2026-08-15T02:00:00Z';
const mk = (a,b,source) => ({ id:`${source}-${a}-${b}`, startsAt:t, stage:'瑞士轮 · 第4轮 · 1-2', bestOf:3, teams:[{name:a},{name:b}], status:'upcoming', source });
const confirmedSchedule = mod.reconcileScheduleMatches([
  { key:'blastSchedule', sequence:10, observedAt:'2026-08-15T01:00:00Z', evidence:true, matches:[mk('Xtreme Gaming','LGD Gaming','blast')] },
  { key:'cybersportSchedule', sequence:11, observedAt:'2026-08-15T01:01:00Z', evidence:true, matches:[mk('Xtreme Gaming','LGD Gaming','cybersport')] }
]);
assert.equal(confirmedSchedule.length,1);
assert.equal(confirmedSchedule[0].verification.status,'confirmed');
assert.equal(confirmedSchedule[0].verification.sourceCount,2);

const conflictLatest = mod.reconcileScheduleMatches([
  { key:'blastSchedule', sequence:20, observedAt:'2026-08-15T01:02:00Z', evidence:true, matches:[mk('Xtreme Gaming','LGD Gaming','blast')] },
  { key:'cybersportSchedule', sequence:21, observedAt:'2026-08-15T01:03:00Z', evidence:true, matches:[mk('Xtreme Gaming','Team Yandex','cybersport')] }
]);
assert.equal(conflictLatest.length,1);
assert.deepEqual(conflictLatest[0].teams.map(x=>x.name),['Xtreme Gaming','Team Yandex']);
assert.equal(conflictLatest[0].verification.status,'conflict-latest');
assert.equal(conflictLatest[0].verification.chosenSource,'cybersportSchedule');

const confirmedAfterRecheck = mod.reconcileScheduleMatches([
  { key:'blastSchedule', sequence:22, observedAt:'2026-08-15T01:04:00Z', evidence:true, matches:[mk('Xtreme Gaming','LGD Gaming','blast')] },
  { key:'publicUpcoming', sequence:23, observedAt:'2026-08-15T01:05:00Z', evidence:true, matches:[mk('Xtreme Gaming','LGD Gaming','public')] },
  { key:'cybersportSchedule', sequence:21, observedAt:'2026-08-15T01:03:00Z', evidence:true, matches:[mk('Xtreme Gaming','Team Yandex','cybersport')] }
]);
assert.equal(confirmedAfterRecheck.length,1);
assert.deepEqual(confirmedAfterRecheck[0].teams.map(x=>x.name),['Xtreme Gaming','LGD Gaming']);
assert.equal(confirmedAfterRecheck[0].verification.status,'confirmed');
assert.equal(confirmedAfterRecheck[0].verification.sourceCount,2);
'''
assert needle in tests
tests = tests.replace(needle, extra, 1)
tests_p.write_text(tests, encoding='utf-8')

print('patched v1.4.0 source rotation and reconciliation')
