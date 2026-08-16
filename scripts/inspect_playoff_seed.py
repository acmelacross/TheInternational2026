#!/usr/bin/env python3
import json
from pathlib import Path
p=Path('data/seed.json')
d=json.loads(p.read_text())
for i,m in enumerate(d.get('matches', [])):
    s=str(m.get('startsAt',''))
    st=str(m.get('stage',''))
    if s.startswith(('2026-08-20','2026-08-21','2026-08-22','2026-08-23')) or any(k in st for k in ['胜者组','败者组','主赛事','Playoff','淘汰']):
        print(i, json.dumps(m, ensure_ascii=False))
print('TIMELINE')
for i,x in enumerate(d.get('timeline', [])):
    if str(x.get('date','')) >= '2026-08-20': print(i, json.dumps(x,ensure_ascii=False))
