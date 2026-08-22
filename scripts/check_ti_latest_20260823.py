#!/usr/bin/env python3
import json, urllib.request
url='https://ti.xgoat.top/api/schedule/wiki?year=2026'
req=urllib.request.Request(url,headers={'User-Agent':'TI2026Guide-Automation/1.0','Accept':'application/json'})
with urllib.request.urlopen(req,timeout=25) as r:
    data=json.load(r)
print('META',json.dumps({k:data.get(k) for k in ['source','revisionAt','revisionId','stale','fetchedAt']},ensure_ascii=False))
rows=[]
for stage in data.get('stages',[]):
    for rnd in stage.get('rounds',[]):
        for m in rnd.get('matches',[]):
            at=str(m.get('scheduledAt',''))
            if at.startswith('2026-08-22') or at.startswith('2026-08-23'):
                rows.append({'stage':stage.get('label'),'round':rnd.get('title'),'id':m.get('id'),'scheduledAt':at,'status':m.get('status'),'bestOf':m.get('bestOf'),'opponents':m.get('opponents')})
for x in rows:
    print('MATCH',json.dumps(x,ensure_ascii=False))
