#!/usr/bin/env python3
import json
from pathlib import Path
p=Path('data/seed.json')
d=json.loads(p.read_text(encoding='utf-8'))
updates={
 'seed-d4-elim-2000-1':(('Team Falcons',2),('Vici Gaming',0)),
 'seed-d4-elim-2000-2':(('Aurora Gaming',0),('BoomBoys',2)),
 'seed-d4-elim-2000-3':(('Team Spirit',2),('Team Resilience',1)),
 'seed-d4-elim-2000-4':(('Iron Wing',2),('GamerLegion',0)),
}
seen=set()
for m in d.get('matches',[]):
    if m.get('id') not in updates: continue
    expected=updates[m['id']]
    names=[t.get('name') for t in m.get('teams',[])[:2]]
    if names != [expected[0][0], expected[1][0]]:
        raise SystemExit(f"team mismatch {m['id']}: {names}")
    m['teams'][0]['score']=expected[0][1]
    m['teams'][1]['score']=expected[1][1]
    m['status']='finished'
    m['source']='blast-confirmed-result'
    seen.add(m['id'])
missing=set(updates)-seen
if missing: raise SystemExit(f'missing ids: {sorted(missing)}')
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('updated',sorted(seen))
