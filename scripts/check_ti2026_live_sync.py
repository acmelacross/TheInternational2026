#!/usr/bin/env python3
import json, urllib.request
from datetime import datetime

UA='Mozilla/5.0 TI2026SyncCheck/1.0'

def get_json(url):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=25) as r:
        return json.load(r)

data=get_json('https://ti.xgoat.top/api/schedule/wiki?year=2026')
print('META',json.dumps({k:data.get(k) for k in ['source','fetchedAt','revisionAt','revisionId','stale','coverage']},ensure_ascii=False))
for stage in data.get('stages',[]):
    label=str(stage.get('label') or stage.get('id') or '')
    for rnd in stage.get('rounds',[]):
        rtitle=str(rnd.get('title') or rnd.get('id') or '')
        for m in rnd.get('matches',[]):
            at=str(m.get('scheduledAt') or '')
            # Main event only
            if at.startswith('2026-08-20') or at.startswith('2026-08-21') or at.startswith('2026-08-22') or at.startswith('2026-08-23'):
                ops=[]
                for op in (m.get('opponents') or [])[:2]:
                    ops.append({'name':op.get('name') or op.get('shortName'),'score':op.get('score')})
                print('MATCH',json.dumps({'stage':label,'round':rtitle,'id':m.get('id'),'scheduledAt':at,'status':m.get('status'),'bestOf':m.get('bestOf'),'opponents':ops},ensure_ascii=False))
