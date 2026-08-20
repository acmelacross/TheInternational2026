#!/usr/bin/env python3
import json, re, urllib.request

def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 TI2026-Schedule-Check/1.0','Accept':'application/json,text/html,*/*'})
    with urllib.request.urlopen(req,timeout=25) as r:
        return r.status, r.headers.get('content-type',''), r.read().decode('utf-8','replace')

urls=[
 ('xgoat','https://ti.xgoat.top/api/schedule/wiki?year=2026'),
 ('blast','https://blast.tv/dota/tournaments/the-international-2026/series'),
]
for name,url in urls:
    try:
        s,ct,b=get(url)
        print('SOURCE',name,'STATUS',s,'TYPE',ct,'LEN',len(b))
        if name=='xgoat':
            d=json.loads(b)
            print('XGOAT_META',json.dumps({k:d.get(k) for k in ['source','fetchedAt','revisionAt','revisionId','stale','coverage']},ensure_ascii=False))
            flat=[]
            for st in d.get('stages',[]):
                for rd in st.get('rounds',[]):
                    for m in rd.get('matches',[]):
                        flat.append((st.get('label'),rd.get('title'),m))
            for st,rd,m in flat:
                at=str(m.get('scheduledAt',''))
                if at.startswith('2026-08-20') or at.startswith('2026-08-21') or at.startswith('2026-08-22') or at.startswith('2026-08-23'):
                    ops=[(o.get('name'),o.get('score')) for o in m.get('opponents',[])[:2]]
                    print('XGOAT_MATCH',json.dumps({'stage':st,'round':rd,'id':m.get('id'),'scheduledAt':m.get('scheduledAt'),'status':m.get('status'),'bestOf':m.get('bestOf'),'opponents':ops},ensure_ascii=False))
        else:
            text=re.sub(r'\s+',' ',re.sub('<[^>]+>',' ',b))
            for needle in ['Iron Wing','Team Spirit','PARIVISION','BetBoom Team','Team Liquid','Team Yandex','Nigma Galaxy','Team Falcons']:
                i=text.find(needle)
                if i>=0: print('BLAST_HIT',needle,text[max(0,i-220):i+420])
    except Exception as e:
        print('ERR',name,repr(e))
