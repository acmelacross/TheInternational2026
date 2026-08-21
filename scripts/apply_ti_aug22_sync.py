#!/usr/bin/env python3
from pathlib import Path
import json
p=Path('data/seed.json')
data=json.loads(p.read_text())
by_id={m.get('id'):m for m in data.get('matches',[])}

for mid in ['seed-me-lbr2-2','seed-main-0822-lbr2-2']:
    m=by_id[mid]
    assert m['startsAt']=='2026-08-22T10:00:00+08:00'
    m['teams']=[{'name':'Team Spirit','score':None},{'name':'Team Liquid','score':None}]
    m['status']='upcoming'
    m['source']='liquipedia-mediawiki-published'

for mid in ['seed-me-ubf','seed-main-0822-ubf']:
    m=by_id[mid]
    assert m['startsAt']=='2026-08-22T16:00:00+08:00'
    m['teams']=[{'name':'Team VISION','score':None},{'name':'待定','score':None}]
    m['status']='tbd'
    m['source']='liquipedia-mediawiki-published'

for item in data.get('timeline',[]):
    if item.get('date')=='2026-08-22':
        item['detail']='主赛事 Day 3：10:00 Team Spirit vs Team Liquid；13:00 败者组第2轮已明确包含 BoomBoys、另一方 TBD；16:00 胜者组决赛已明确包含 TEAM VISION、另一方 TBD；19:00 败者组第3轮双方仍 TBD。'
        item['note']='以上仅同步可靠数据源已经明确发布的对阵与席位；其余 TBD 等待后续发布，不根据晋级关系自行推算。'
        break
else:
    raise SystemExit('missing Aug 22 timeline')

p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('updated confirmed Aug 22 schedule slots')
