#!/usr/bin/env python3
from pathlib import Path
import json
p=Path('data/seed.json')
data=json.loads(p.read_text(encoding='utf-8'))
changed=0
for m in data.get('matches',[]):
    teams=[str(t.get('name','')) for t in m.get('teams',[])[:2]]
    if set(teams)=={'Team Spirit','Team Liquid'} and str(m.get('startsAt','')).startswith('2026-08-22T10:00:00+08:00'):
        m['startsAt']='2026-08-22T10:10:00+08:00'
        changed+=1
for item in data.get('timeline',[]):
    if str(item.get('date','')).startswith('2026-08-22'):
        for k,v in list(item.items()):
            if isinstance(v,str) and 'Team Spirit' in v and 'Team Liquid' in v and '10:00' in v:
                item[k]=v.replace('10:00','10:10')
                changed+=1
if changed < 1:
    raise SystemExit('No matching Aug 22 Team Spirit vs Team Liquid entry found')
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('changed',changed)
