#!/usr/bin/env python3
from pathlib import Path
import json

p=Path('data/seed.json')
data=json.loads(p.read_text())
changed=0
for m in data.get('matches',[]):
    if m.get('id') in {'seed-me-ubsf1','seed-main-0821-ubsf1'}:
        teams=m.get('teams') or []
        if len(teams)>=2 and teams[0].get('name')=='Team Spirit' and teams[1].get('name')=='Team VISION':
            teams[0]['score']=0
            teams[1]['score']=2
            m['status']='finished'
            m['source']='blast-confirmed-result'
            changed+=1

for item in data.get('timeline',[]):
    if item.get('date')=='2026-08-21':
        text=str(item.get('detail') or '')
        new=text.replace('18:20 Team Spirit vs TEAM VISION','18:20 Team Spirit 0:2 TEAM VISION')
        if new!=text:
            item['detail']=new

if changed == 0:
    raise SystemExit('No matching UBsF1 records found')
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('updated_records',changed)
