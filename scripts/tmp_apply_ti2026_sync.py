#!/usr/bin/env python3
import json
from pathlib import Path

p=Path('data/seed.json')
data=json.loads(p.read_text())
byid={m.get('id'):m for m in data.get('matches',[])}

def set_match(ids, *, startsAt=None, teams=None, status=None, source=None):
    for mid in ids:
        m=byid.get(mid)
        if not m:
            raise SystemExit(f'missing match id: {mid}')
        if startsAt is not None: m['startsAt']=startsAt
        if teams is not None:
            m['teams']=[{'name':name,'score':score} for name,score in teams]
        if status is not None: m['status']=status
        if source is not None: m['source']=source

# BLAST Results: UBQF1 Iron Wing 0-2 Team Spirit, 02:30 UTC = 10:30 CST.
set_match(['seed-me-ubqf1','seed-main-0820-ubqf1'],
          startsAt='2026-08-20T10:30:00+08:00',
          teams=[('Iron Wing',0),('Team Spirit',2)],
          status='finished',source='blast-confirmed-result')
# BLAST Results: UBQF2 PARIVISION/TEAM VISION 2-1 BetBoom/BoomBoys.
set_match(['seed-me-ubqf2','seed-main-0820-ubqf2'],
          startsAt='2026-08-20T13:45:00+08:00',
          teams=[('Team VISION',2),('BoomBoys',1)],
          status='finished',source='blast-confirmed-result')
# Current BLAST + Liquipedia MediaWiki schedule times. Do not freeze in-progress scores.
set_match(['seed-me-ubqf3','seed-main-0820-ubqf3'], startsAt='2026-08-20T18:30:00+08:00')
set_match(['seed-me-ubqf4','seed-main-0820-ubqf4'], startsAt='2026-08-20T21:15:00+08:00')
# Both BLAST and current Liquipedia MediaWiki-derived schedule explicitly publish these next-day pairings.
set_match(['seed-me-lbr1-1','seed-main-0821-lbr1-1'],
          teams=[('Iron Wing',None),('BoomBoys',None)],status='upcoming',source='blast+liquipedia-mediawiki-published')
set_match(['seed-me-ubsf1','seed-main-0821-ubsf1'],
          teams=[('Team Spirit',None),('Team VISION',None)],status='upcoming',source='blast+liquipedia-mediawiki-published')

for item in data.get('timeline',[]):
    if item.get('date')=='2026-08-20':
        item['detail']='主赛事 Day 1：10:30 Iron Wing 0:2 Team Spirit、13:45 TEAM VISION 2:1 BoomBoys 均已结束；18:30 Team Liquid vs Team Yandex；21:15 Nigma Galaxy vs Team Falcons。进行中比分不写死，继续由实时数据源更新。'
        item['note']='BLAST 已确认前两场最终比分；8 月 21 日 10:00 败者组第1轮 Match 1 已明确为 Iron Wing vs BoomBoys，16:00 胜者组半决赛 1 已明确为 Team Spirit vs TEAM VISION。'
    if item.get('date')=='2026-08-21':
        item['note']='主赛事 Day 2：10:00 败者组第1轮 Match 1 为 Iron Wing vs BoomBoys；16:00 胜者组半决赛 1 为 Team Spirit vs TEAM VISION。13:00 败者组第1轮 Match 2 与 19:00 胜者组半决赛 2 继续等待当前四分之一决赛结束后由可靠数据源明确发布。'

p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
