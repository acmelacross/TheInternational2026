#!/usr/bin/env python3
import json, urllib.request
URL='https://ti.xgoat.top/api/schedule/wiki?year=2026'
req=urllib.request.Request(URL,headers={'User-Agent':'TI2026 schedule sync/1.0','Accept':'application/json'})
with urllib.request.urlopen(req,timeout=25) as r:
    data=json.load(r)
print('META',json.dumps({k:data.get(k) for k in ['source','fetchedAt','revisionAt','revisionId','stale','coverage']},ensure_ascii=False))
rows=[]
for stage in data.get('stages',[]):
    for rnd in stage.get('rounds',[]):
        for m in rnd.get('matches',[]):
            at=m.get('scheduledAt') or ''
            if at.startswith(('2026-08-21','2026-08-22','2026-08-23')):
                rows.append({
                    'stage':stage.get('label') or stage.get('id'),
                    'round':rnd.get('title') or rnd.get('id'),
                    'id':m.get('id'),
                    'scheduledAt':at,
                    'status':m.get('status'),
                    'bestOf':m.get('bestOf'),
                    'opponents':[{k:o.get(k) for k in ['name','shortName','score','canonicalKey']} for o in m.get('opponents',[])],
                })
for row in rows:
    print('MATCH',json.dumps(row,ensure_ascii=False))
