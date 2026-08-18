#!/usr/bin/env python3
from pathlib import Path
import json
p=Path('data/seed.json')
data=json.loads(p.read_text())
updates={
 'seed-d3-r4-1000-a': [('LGD Gaming',2),('Xtreme Gaming',1)],
 'seed-d3-r4-1000-b': [('Team Falcons',2),('GamerLegion',1)],
 'seed-d3-r4-1000-c': [('Team Resilience',1),('Team Yandex',2)],
 'seed-d3-r4-1000-d': [('OG',2),('HULIGANI',1)],
 'seed-d3-r4-1300-a': [('Team VISION',2),('Team Spirit',0)],
 'seed-d3-r4-1300-b': [('Iron Wing',1),('Team Liquid',2)],
 'seed-d3-r4-1300-c': [('BoomBoys',0),('Aurora Gaming',2)],
 'seed-d3-r4-1300-d': [('Nigma Galaxy',2),('Vici Gaming',0)],
 'seed-d3-r5-lgd-vg': [('LGD Gaming',2),('Vici Gaming',0)],
 'seed-d3-r5-bb-falcons': [('BoomBoys',1),('Team Falcons',2)],
 'seed-d3-r5-iw-yandex': [('Iron Wing',2),('Team Yandex',1)],
 'seed-d3-r5-liquid-aurora': [('Team Liquid',2),('Aurora Gaming',1)],
 'seed-d3-r5-nigma-spirit': [('Nigma Galaxy',2),('Team Spirit',0)],
}
seen=set()
for m in data.get('matches',[]):
    mid=m.get('id')
    if mid not in updates: continue
    expected=updates[mid]
    names=[t.get('name') for t in m.get('teams',[])[:2]]
    assert names==[x[0] for x in expected], (mid,names,expected)
    for team,(_,score) in zip(m['teams'],expected): team['score']=score
    m['status']='finished'
    m['source']='blast-confirmed-result'
    seen.add(mid)
missing=set(updates)-seen
assert not missing, missing
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('updated',len(seen),'matches')
