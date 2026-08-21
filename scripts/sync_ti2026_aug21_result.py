#!/usr/bin/env python3
from pathlib import Path
import json, urllib.request, sys

ROOT=Path('.')
URL='https://ti.xgoat.top/api/schedule/wiki?year=2026'
req=urllib.request.Request(URL,headers={'User-Agent':'TI2026-Viewing-Guide/automation','Accept':'application/json'})
with urllib.request.urlopen(req,timeout=25) as r:
    data=json.load(r)
print('META', json.dumps({k:data.get(k) for k in ['source','revisionAt','revisionId','stale','fetchedAt']},ensure_ascii=False))

matches=[]
for st in data.get('stages',[]):
    for rd in st.get('rounds',[]):
        for m in rd.get('matches',[]):
            ops=m.get('opponents') or []
            names=[str(x.get('name') or x.get('shortName') or '') for x in ops[:2]]
            if set(names)=={'Iron Wing','BetBoom Team'} or set(names)=={'Iron Wing','BoomBoys'}:
                print('FOUND',json.dumps({'stage':st.get('label'),'round':rd.get('title'),'match':m},ensure_ascii=False))
                matches.append(m)
if not matches:
    print('NO_CONFIRMED_MATCH')
    sys.exit(10)
m=matches[-1]
ops=m.get('opponents') or []
name_map={'BetBoom Team':'BoomBoys','BoomBoys':'BoomBoys','Iron Wing':'Iron Wing'}
score={name_map.get(str(o.get('name') or o.get('shortName') or ''),str(o.get('name') or o.get('shortName') or '')):o.get('score') for o in ops[:2]}
status=str(m.get('status') or '').lower()
print('STATUS',status,'SCORE',score)
if status!='finished' or score.get('Iron Wing') is None or score.get('BoomBoys') is None:
    print('NOT_FINAL')
    sys.exit(11)
if (int(score['Iron Wing']),int(score['BoomBoys'])) != (1,2):
    print('UNEXPECTED_FINAL',score)
    sys.exit(12)

p=ROOT/'data/seed.json'
seed=json.loads(p.read_text())
changed=0
for row in seed.get('matches',[]):
    if not str(row.get('startsAt','')).startswith('2026-08-21'):
        continue
    names=[str(t.get('name','')) for t in row.get('teams',[])[:2]]
    if set(names)=={'Iron Wing','BoomBoys'}:
        for t in row['teams']:
            if t.get('name')=='Iron Wing': t['score']=1
            elif t.get('name')=='BoomBoys': t['score']=2
        row['status']='finished'
        row['source']='liquipedia-mediawiki-confirmed-result'
        changed+=1
if not changed:
    print('NO_SEED_TARGET')
    sys.exit(13)

# Update timeline text only if it contains the matchup without final score.
for item in seed.get('timeline',[]):
    if str(item.get('date',''))=='2026-08-21':
        note=str(item.get('note',''))
        if 'Iron Wing vs BoomBoys' in note and 'Iron Wing 1:2 BoomBoys' not in note:
            item['note']=note.replace('Iron Wing vs BoomBoys','Iron Wing 1:2 BoomBoys')

p.write_text(json.dumps(seed,ensure_ascii=False,indent=2)+'\n')
print('PATCHED',changed)
