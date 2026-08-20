#!/usr/bin/env python3
import json,re,urllib.request

def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 TI2026-check','Accept':'*/*','Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8'})
    with urllib.request.urlopen(req,timeout=30) as r:
        return r.read().decode('utf-8','replace')

def textify(b):
    t=re.sub(r'<script\b[^>]*>[\s\S]*?</script>',' ',b,flags=re.I)
    t=re.sub(r'<style\b[^>]*>[\s\S]*?</style>',' ',t,flags=re.I)
    t=re.sub(r'<[^>]+>',' ',t)
    return re.sub(r'\s+',' ',t)

d=json.loads(get('https://ti.xgoat.top/api/schedule/wiki?year=2026'))
print('XGOAT_META',json.dumps({k:d.get(k) for k in ['source','fetchedAt','revisionAt','revisionId','stale']},ensure_ascii=False))
for st in d.get('stages',[]):
    if '主赛事' not in str(st.get('label','')): continue
    for rd in st.get('rounds',[]):
        for m in rd.get('matches',[]):
            if m.get('scheduledAt') or any(o.get('name') not in (None,'TBD') for o in m.get('opponents',[])):
                print('MATCH',rd.get('title'),m.get('id'),m.get('scheduledAt'),m.get('status'),m.get('bestOf'),[(o.get('name'),o.get('score')) for o in m.get('opponents',[])])

for label,url in [('SERIES','https://blast.tv/dota/tournaments/the-international-2026/series'),('RESULTS','https://blast.tv/dota/tournaments/the-international-2026/series?view=results')]:
    t=textify(get(url))
    print(label+'_BEGIN')
    for key in ['Iron Wing','PARIVISION','Team Liquid','Nigma Galaxy']:
        hits=[]; pos=0
        while len(hits)<2:
            i=t.find(key,pos)
            if i<0: break
            hits.append(t[max(0,i-140):i+260]); pos=i+len(key)
        for h in hits: print(label,key,h)
    print(label+'_END')
