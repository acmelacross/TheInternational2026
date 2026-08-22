from pathlib import Path
import json

p=Path('data/seed.json')
data=json.loads(p.read_text())
changed=0
for m in data.get('matches',[]):
    if m.get('id')=='seed-me-ubsf1':
        if m.get('teams',[{},{}])[0].get('name')=='Team Spirit' and m.get('teams',[{},{}])[1].get('name')=='Team VISION':
            if m['teams'][0].get('score')!=1 or m['teams'][1].get('score')!=2:
                m['teams'][0]['score']=1
                m['teams'][1]['score']=2
                m['status']='finished'
                m['source']='liquipedia-confirmed-result'
                changed+=1
    if m.get('id')=='seed-me-ubsf2':
        if m.get('startsAt')!='2026-08-21T22:10:00+08:00':
            m['startsAt']='2026-08-21T22:10:00+08:00'
            changed+=1

for item in data.get('timeline',[]):
    if item.get('date')=='2026-08-21':
        text=item.get('note') or item.get('description') or ''
        new=text.replace('21:30 Team Yandex vs Nigma Galaxy','22:10 Team Yandex vs Nigma Galaxy')
        new=new.replace('Team Spirit 0:2 TEAM VISION','Team Spirit 1:2 TEAM VISION')
        if new!=text:
            if 'note' in item: item['note']=new
            elif 'description' in item: item['description']=new
            changed+=1

if not changed:
    raise SystemExit('no changes applied')
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('changed',changed)
