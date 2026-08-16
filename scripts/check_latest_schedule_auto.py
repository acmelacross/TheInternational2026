#!/usr/bin/env python3
import json,re,urllib.request
from pathlib import Path
UA='Mozilla/5.0 TI2026ScheduleCheck/1.0'
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json,text/html,*/*'})
 with urllib.request.urlopen(req,timeout=30) as r:return r.read().decode('utf-8','replace')
seed=json.load(open('data/seed.json',encoding='utf-8'))
print('SEED_FUTURE')
for m in seed.get('matches',[]):
 if str(m.get('startsAt',''))[:10]>='2026-08-16':
  print(json.dumps({'id':m.get('id'),'startsAt':m.get('startsAt'),'stage':m.get('stage'),'teams':m.get('teams'),'status':m.get('status'),'source':m.get('source')},ensure_ascii=False))
try:
 x=json.loads(get('https://ti.xgoat.top/api/schedule/wiki?year=2026'))
 print('XGOAT_META',json.dumps({k:x.get(k) for k in ['source','fetchedAt','revisionAt','revisionId','stale','coverage']},ensure_ascii=False))
 for st in x.get('stages',[]):
  for rd in st.get('rounds',[]):
   for m in rd.get('matches',[]):
    at=str(m.get('scheduledAt',''))
    if at[:10]>='2026-08-16':
     print('XGOAT_MATCH',json.dumps({'stage':st.get('label'),'round':rd.get('title'),'scheduledAt':at,'id':m.get('id'),'status':m.get('status'),'bestOf':m.get('bestOf'),'opponents':m.get('opponents')},ensure_ascii=False))
except Exception as e: print('XGOAT_ERR',repr(e))
try:
 b=get('https://blast.tv/dota/tournaments/the-international-2026/series')
 print('BLAST_LEN',len(b))
 # print useful snippets around known playoff team names/dates/stages
 txt=re.sub(r'\s+',' ',b)
 for key in ['Iron Wing','Team Spirit','PARIVISION','BetBoom Team','Team Liquid','Team Yandex','Nigma Galaxy','Team Falcons','Upper Bracket','Lower Bracket','Aug 20','Aug 21','Aug 22','Aug 23']:
  i=txt.lower().find(key.lower())
  if i>=0: print('BLAST_SNIP',key,txt[max(0,i-300):i+1200])
except Exception as e: print('BLAST_ERR',repr(e))
