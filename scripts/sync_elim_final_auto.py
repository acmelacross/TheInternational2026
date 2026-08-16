#!/usr/bin/env python3
from pathlib import Path
import json
p=Path('data/seed.json')
data=json.loads(p.read_text(encoding='utf-8'))
found=False
for m in data.get('matches',[]):
    if m.get('id')=='seed-d4-elim-2200-5':
        names=[t.get('name') for t in m.get('teams',[])]
        if names!=['LGD Gaming','Team Yandex']:
            raise SystemExit(f'unexpected teams: {names}')
        m['teams'][0]['score']=1
        m['teams'][1]['score']=2
        m['status']='finished'
        m['source']='liquipedia-mediawiki-confirmed-result'
        found=True
        break
if not found:
    raise SystemExit('target match not found')
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('synced LGD Gaming 1-2 Team Yandex')
