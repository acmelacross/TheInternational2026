#!/usr/bin/env python3
import json,re,urllib.request

def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 TI2026-check','Accept':'*/*','Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8'})
    with urllib.request.urlopen(req,timeout=30) as r:
        return r.status,r.headers.get('content-type',''),r.read().decode('utf-8','replace')

# XGoat structured Liquipedia mirror
u='https://ti.xgoat.top/api/schedule/wiki?year=2026'
s,ct,b=get(u)
print('XGOAT_STATUS',s,ct,len(b))
d=json.loads(b)
print('XGOAT_META',json.dumps({k:d.get(k) for k in ['source','fetchedAt','revisionAt','revisionId','stale','coverage']},ensure_ascii=False))
for st in d.get('stages',[]):
    if st.get('id') not in ('main','playoffs') and '主赛事' not in str(st.get('label','')): continue
    for rd in st.get('rounds',[]):
        for m in rd.get('matches',[]):
            print('XGOAT_MATCH',json.dumps({'stage':st.get('label'),'round':rd.get('title'),'id':m.get('id'),'scheduledAt':m.get('scheduledAt'),'status':m.get('status'),'bestOf':m.get('bestOf'),'opponents':[[o.get('name'),o.get('score')] for o in m.get('opponents',[])]},ensure_ascii=False))

# BLAST current series page
u='https://blast.tv/dota/tournaments/the-international-2026/series'
s,ct,b=get(u)
print('BLAST_STATUS',s,ct,len(b))
t=re.sub(r'<script\b[^>]*>[\s\S]*?</script>',' ',b,flags=re.I)
t=re.sub(r'<style\b[^>]*>[\s\S]*?</style>',' ',t,flags=re.I)
t=re.sub(r'<[^>]+>',' ',t)
t=re.sub(r'\s+',' ',t)
for key in ['UB Quarter Final 1','UB Quarter Final 2','UB Quarter Final 3','UB Quarter Final 4','LB Round 1 Match 1','LB Round 1 Match 2','UB Semi Final 1','UB Semi Final 2']:
    pos=0
    while True:
        i=t.find(key,pos)
        if i<0: break
        print('BLAST_HIT',key,t[max(0,i-180):i+360])
        pos=i+len(key)
