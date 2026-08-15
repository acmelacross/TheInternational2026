#!/usr/bin/env python3
from pathlib import Path
import json

ROOT=Path('.')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old,new,1)

p=ROOT/'server.js'
s=p.read_text()
s=replace_once(s,
"const CYBERSPORT_SCHEDULE_URL = String(process.env.CYBERSPORT_SCHEDULE_URL || 'https://www.cybersport.ru/tournaments/dota-2/the-international-2026').trim();\n",
"const CYBERSPORT_SCHEDULE_URL = String(process.env.CYBERSPORT_SCHEDULE_URL || 'https://www.cybersport.ru/tournaments/dota-2/the-international-2026').trim();\nconst XGOAT_SCHEDULE_API = String(process.env.XGOAT_SCHEDULE_API || 'https://ti.xgoat.top/api/schedule/wiki?year=2026').trim();\nconst XGOAT_SCHEDULE_PAGE = String(process.env.XGOAT_SCHEDULE_PAGE || 'https://ti.xgoat.top/schedule').trim();\n",
'xgoat constants')

anchor="function regexEscape(value) {\n"
insert=r'''function normalizeXgoatMatch(raw, stageLabel = 'The International 2026', roundTitle = '') {
  const startsAt = normalizeLpDate(raw?.scheduledAt);
  if (!startsAt || !scheduleInEventWindow(startsAt)) return null;
  const ops = Array.isArray(raw?.opponents) ? raw.opponents.slice(0, 2) : [];
  const teamFrom = (op) => {
    const rawName = String(op?.name || op?.shortName || '').trim();
    const name = !rawName || /^(?:TBD|TBA|待定)$/i.test(rawName) ? '待定' : canonicalTeamName(rawName);
    const scoreRaw = op?.score;
    const score = scoreRaw === null || scoreRaw === undefined || scoreRaw === '' ? null : Number(scoreRaw);
    return { name, score:Number.isFinite(score) ? score : null, winner:false };
  };
  const teams = [teamFrom(ops[0]), teamFrom(ops[1])];
  const rawStatus = String(raw?.status || '').toLowerCase();
  let status = rawStatus === 'finished' ? 'finished' : rawStatus === 'live' || rawStatus === 'ongoing' ? 'live' : teams.some(t => isPlaceholderTeamName(t.name)) ? 'tbd' : 'upcoming';
  if (status === 'finished' && teams.every(t => t.score !== null)) {
    const max = Math.max(...teams.map(t => Number(t.score || 0)));
    teams.forEach(t => { t.winner = Number(t.score || 0) === max; });
  }
  return {
    id:`xgoat-${raw?.id || `${Date.parse(startsAt)}-${teams.map(t => nameKey(t.name)).join('-')}`}`,
    startsAt,
    stage:[stageLabel, roundTitle || raw?.group].filter(Boolean).join(' · '),
    stream:null,
    streamUrl:null,
    bestOf:Number(raw?.bestOf || 3),
    teams,
    status,
    source:'xgoat',
    sourceUrl:XGOAT_SCHEDULE_PAGE,
    xgoatMatchId:raw?.id || null,
    matchIds:[]
  };
}

async function fetchXgoatSchedule() {
  const res = await fetch(XGOAT_SCHEDULE_API, {
    headers:{
      'Accept':'application/json',
      'Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent':`${APP_NAME}/1.4.2 (${CONTACT_EMAIL || 'TI2026 viewing guide'})`
    },
    signal:AbortSignal.timeout(18000)
  });
  if (!res.ok) throw new Error(`XGoat HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.ok || !Array.isArray(body?.stages)) throw new Error('XGoat schedule payload invalid');
  const rows=[];
  for (const stage of body.stages) {
    for (const round of stage?.rounds || []) {
      for (const raw of round?.matches || []) {
        const match=normalizeXgoatMatch(raw, stage?.label || stage?.id || 'The International 2026', round?.title || round?.id || raw?.group || '');
        if (match) rows.push(match);
      }
    }
  }
  const dedupe=new Map();
  for (const m of rows) dedupe.set(m.id,m);
  return {
    matches:[...dedupe.values()].sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)),
    meta:{
      upstreamSource:body.source || null,
      page:body.page || null,
      fetchedAt:body.fetchedAt || null,
      revisionAt:body.revisionAt || null,
      revisionId:body.revisionId || null,
      stale:Boolean(body.stale),
      coverage:body.coverage || null,
      eventId:body.eventId || null,
      year:body.year || null
    }
  };
}

'''
s=replace_once(s,anchor,insert+anchor,'insert xgoat fetch')

s=replace_once(s,
"const ALL_REFRESH_SOURCE_KEYS = ['liquipedia', 'blastSchedule', 'cybersportSchedule', 'publicUpcoming', 'openDotaLeague', 'openDotaProMatches', 'openDotaLive'];",
"const ALL_REFRESH_SOURCE_KEYS = ['liquipedia', 'xgoatSchedule', 'blastSchedule', 'cybersportSchedule', 'publicUpcoming', 'openDotaLeague', 'openDotaProMatches', 'openDotaLive'];",
'all refresh')
s=replace_once(s,
"  if (LIQUIPEDIA_API_KEY) keys.push('liquipedia');\n  keys.push('blastSchedule', 'cybersportSchedule');",
"  if (LIQUIPEDIA_API_KEY) keys.push('liquipedia');\n  keys.push('xgoatSchedule', 'blastSchedule', 'cybersportSchedule');",
'rotation')

s=replace_once(s,
"    const sourceKey = String(src?.key || 'unknown');\n    const sequence = Number(src?.sequence || 0);",
"    const sourceKey = String(src?.key || 'unknown');\n    const family = String(src?.family || sourceKey);\n    const sequence = Number(src?.sequence || 0);",
'family source')
s=replace_once(s,
"      const variant = { sourceKey, sequence, observedAt, evidence, match };",
"      const variant = { sourceKey, family, sequence, observedAt, evidence, match };",
'family variant')
s=replace_once(s,
"    const supportSources = [...new Set(variants.filter(v => v.evidence).map(v => v.sourceKey))];\n    return { ...claim, chosen, latestSequence:chosen.sequence, supportSources, conflicts:[] };",
"    const supportSources = [...new Set(variants.filter(v => v.evidence).map(v => v.sourceKey))];\n    const supportFamilies = [...new Set(variants.filter(v => v.evidence).map(v => v.family))];\n    return { ...claim, chosen, latestSequence:chosen.sequence, supportSources, supportFamilies, conflicts:[] };",
'family claims')
s=replace_once(s,
"    const supportCount = claim.supportSources.length;",
"    const supportCount = claim.supportFamilies.length;",
'family count')
s=replace_once(s,
"      sources: c.supportSources,\n      observedAt: c.chosen.observedAt,",
"      sources: c.supportSources,\n      families: c.supportFamilies,\n      observedAt: c.chosen.observedAt,",
'conflict families')
s=replace_once(s,
"        sources: claim.supportSources,\n        chosenSource: claim.chosen.sourceKey,",
"        sources: claim.supportSources,\n        families: claim.supportFamilies,\n        chosenSource: claim.chosen.sourceKey,",
'verification families')
s=replace_once(s,
"    const supportSources = [...new Set(variants.filter(v => v.evidence).map(v => v.sourceKey))];\n    resolved.push({",
"    const supportSources = [...new Set(variants.filter(v => v.evidence).map(v => v.sourceKey))];\n    const supportFamilies = [...new Set(variants.filter(v => v.evidence).map(v => v.family))];\n    resolved.push({",
'tbd family collect')
s=replace_once(s,
"        status: supportSources.length >= 2 ? 'confirmed' : supportSources.length === 1 ? 'provisional' : 'baseline',\n        sourceCount: supportSources.length,\n        sources: supportSources,",
"        status: supportFamilies.length >= 2 ? 'confirmed' : supportFamilies.length === 1 ? 'provisional' : 'baseline',\n        sourceCount: supportFamilies.length,\n        sources: supportSources,\n        families: supportFamilies,",
'tbd family status')

s=replace_once(s,
"    } else if (key === 'blastSchedule') data = await fetchBlastSchedule(forceNetwork);",
"    } else if (key === 'xgoatSchedule') {\n      const xgoat = await fetchXgoatSchedule();\n      data = xgoat.matches;\n      meta = xgoat.meta;\n    } else if (key === 'blastSchedule') data = await fetchBlastSchedule(forceNetwork);",
'refresh xgoat')

s=replace_once(s,
"  const lpMatches = sourceData('liquipedia');\n  const blastSchedule = sourceData('blastSchedule');",
"  const lpMatches = sourceData('liquipedia');\n  const xgoatSchedule = sourceData('xgoatSchedule');\n  const blastSchedule = sourceData('blastSchedule');",
'snapshot xgoat')
s=replace_once(s,
"    { key:'liquipedia', matches:lpMatches, sequence:sourceEntry('liquipedia')?.sequence || 0, observedAt:sourceEntry('liquipedia')?.observedAt || null, evidence:true },\n    { key:'blastSchedule', matches:blastSchedule, sequence:sourceEntry('blastSchedule')?.sequence || 0, observedAt:sourceEntry('blastSchedule')?.observedAt || null, evidence:true },",
"    { key:'liquipedia', family:'liquipedia', matches:lpMatches, sequence:sourceEntry('liquipedia')?.sequence || 0, observedAt:sourceEntry('liquipedia')?.observedAt || null, evidence:true },\n    { key:'xgoatSchedule', family:'liquipedia', matches:xgoatSchedule, sequence:sourceEntry('xgoatSchedule')?.sequence || 0, observedAt:sourceEntry('xgoatSchedule')?.observedAt || null, evidence:true },\n    { key:'blastSchedule', family:'blast', matches:blastSchedule, sequence:sourceEntry('blastSchedule')?.sequence || 0, observedAt:sourceEntry('blastSchedule')?.observedAt || null, evidence:true },",
'reconcile xgoat')
s=s.replace("{ key:'cybersportSchedule', matches:cybersportSchedule,", "{ key:'cybersportSchedule', family:'cybersport', matches:cybersportSchedule,",1)
s=s.replace("{ key:'publicUpcoming', matches:publicUpcoming,", "{ key:'publicUpcoming', family:'public-upcoming', matches:publicUpcoming,",1)
s=s.replace("{ key:'seed', matches:seed.matches || [],", "{ key:'seed', family:'seed', matches:seed.matches || [],",1)

s=replace_once(s,
"    liquipedia: sourceHealth('liquipedia'),\n    blastSchedule: sourceHealth('blastSchedule', { cacheTtlSeconds:Math.round(SCHEDULE_SOURCE_TTL_MS/1000) }),",
"    liquipedia: sourceHealth('liquipedia'),\n    xgoatSchedule: sourceHealth('xgoatSchedule'),\n    blastSchedule: sourceHealth('blastSchedule', { cacheTtlSeconds:Math.round(SCHEDULE_SOURCE_TTL_MS/1000) }),",
'health xgoat')
s=replace_once(s,
"  if (lpMatches.length) scheduleSourceParts.push('liquipedia');\n  if (blastSchedule.length) scheduleSourceParts.push('blast');",
"  if (lpMatches.length) scheduleSourceParts.push('liquipedia');\n  if (xgoatSchedule.length) scheduleSourceParts.push('xgoat');\n  if (blastSchedule.length) scheduleSourceParts.push('blast');",
'source parts')
s=replace_once(s,
"      publicUpcomingCount: publicUpcoming.length,\n      blastScheduleCount: blastSchedule.length,",
"      publicUpcomingCount: publicUpcoming.length,\n      xgoatScheduleCount: xgoatSchedule.length,\n      blastScheduleCount: blastSchedule.length,",
'data count')

s=s.replace("version: '1.4.1'", "version: '1.4.2'")
s=s.replace('TI2026 观赛指南 v1.4.1 已启动', 'TI2026 观赛指南 v1.4.2 已启动')
s=replace_once(s,
"    attribution: `多源赛程采用“新数据先展示、后续多源复核”：任一来源发现新赛程即可进入页面；两个及以上独立来源一致时标记为已确认。",
"    attribution: `多源赛程采用“新数据先展示、后续多源复核”：任一来源发现新赛程即可进入页面；两个及以上独立来源族一致时标记为已确认。XGoat 作为 Liquipedia MediaWiki 的结构化镜像参与发现，但与 Liquipedia LPDB 归为同一来源族，不重复计票。",
'attribution')
s=replace_once(s,
"  normalizeLpDate, normalizeOpponent, normalizeLpMatch, mergeMatches,\n  deriveStandings, decorateMatch, isLikelyTi2026Match, extractMatchIds, normalizeDota2DbGame, canonicalTeamName, reconcileScheduleMatches, scheduleBucketKey",
"  normalizeLpDate, normalizeOpponent, normalizeLpMatch, normalizeXgoatMatch, mergeMatches,\n  deriveStandings, decorateMatch, isLikelyTi2026Match, extractMatchIds, normalizeDota2DbGame, canonicalTeamName, reconcileScheduleMatches, scheduleBucketKey",
'exports')
p.write_text(s)

# app.js
p=ROOT/'public/app.js'; a=p.read_text()
a=replace_once(a,
"  const multiSchedule = (hs.blastSchedule?.count||0) + (hs.cybersportSchedule?.count||0) > 0;",
"  const multiSchedule = (hs.xgoatSchedule?.count||0) + (hs.blastSchedule?.count||0) + (hs.cybersportSchedule?.count||0) > 0;",
'app multisource')
a=replace_once(a,
"  const healthText=[\n    sourceCountText(hs.blastSchedule,'BLAST'),",
"  const healthText=[\n    sourceCountText(hs.xgoatSchedule,'XGoat'),\n    sourceCountText(hs.blastSchedule,'BLAST'),",
'app health')
p.write_text(a)

# package
p=ROOT/'package.json'; data=json.loads(p.read_text()); data['version']='1.4.2'; data['description']='TI2026 Dota 2 观赛指南 v1.4.2：XGoat/Liquipedia/BLAST/Cybersport 多源轮询复核 + AI 异步自动收敛 + OpenDota 实时赛况'; p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

# env example
p=ROOT/'.env.example'; e=p.read_text()
needle='SCHEDULE_SOURCE_TTL_SECONDS=300\n'
if needle not in e: raise SystemExit('missing env anchor')
e=e.replace(needle,needle+'XGOAT_SCHEDULE_API=https://ti.xgoat.top/api/schedule/wiki?year=2026\nXGOAT_SCHEDULE_PAGE=https://ti.xgoat.top/schedule\n',1)
p.write_text(e)

# tests
p=ROOT/'tests.js'; t=p.read_text()
needle="assert.equal(mod.canonicalTeamName('L1GA TEAM'),'HULIGANI');\n"
extra="""assert.equal(mod.canonicalTeamName('L1GA TEAM'),'HULIGANI');

const xgoat = mod.normalizeXgoatMatch({
  id:'parsed-test', scheduledAt:'2026-08-15T02:00:00.000Z', status:'scheduled', bestOf:3,
  opponents:[{name:'LGD Gaming',score:null},{name:'Xtreme Gaming',score:null}]
}, '小组赛', 'Round 4');
assert.equal(xgoat.startsAt,'2026-08-15T02:00:00.000Z');
assert.equal(xgoat.teams[0].name,'LGD Gaming');
assert.equal(xgoat.teams[1].name,'Xtreme Gaming');
assert.equal(xgoat.status,'upcoming');

const sameFamily = mod.reconcileScheduleMatches([
  {key:'liquipedia',family:'liquipedia',sequence:1,observedAt:'2026-08-15T01:00:00Z',evidence:true,matches:[xgoat]},
  {key:'xgoatSchedule',family:'liquipedia',sequence:2,observedAt:'2026-08-15T01:01:00Z',evidence:true,matches:[xgoat]}
]);
assert.equal(sameFamily[0].verification.sourceCount,1);
assert.equal(sameFamily[0].verification.status,'provisional');
const independent = mod.reconcileScheduleMatches([
  {key:'xgoatSchedule',family:'liquipedia',sequence:2,observedAt:'2026-08-15T01:01:00Z',evidence:true,matches:[xgoat]},
  {key:'blastSchedule',family:'blast',sequence:3,observedAt:'2026-08-15T01:02:00Z',evidence:true,matches:[{...xgoat,source:'blast'}]}
]);
assert.equal(independent[0].verification.sourceCount,2);
assert.equal(independent[0].verification.status,'confirmed');
"""
t=replace_once(t,needle,extra,'tests xgoat')
p.write_text(t)
print('patched v1.4.2 xgoat schedule source')
