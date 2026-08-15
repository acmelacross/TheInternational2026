#!/usr/bin/env python3
from pathlib import Path
import json

p=Path('data/seed.json')
data=json.loads(p.read_text(encoding='utf-8'))

matches=data.get('matches',[])
ids={m.get('id') for m in matches}
new_matches=[
  {
    'id':'seed-d4-elim-2000-1','startsAt':'2026-08-16T20:00:00+08:00','stage':'淘汰轮 · Match 1','stream':None,'bestOf':3,
    'teams':[{'name':'待定（3-2）','score':None},{'name':'待定（2-3）','score':None}], 'status':'tbd','source':'blast'
  },
  {
    'id':'seed-d4-elim-2000-2','startsAt':'2026-08-16T20:00:00+08:00','stage':'淘汰轮 · Match 2','stream':None,'bestOf':3,
    'teams':[{'name':'待定（3-2）','score':None},{'name':'待定（2-3）','score':None}], 'status':'tbd','source':'blast'
  },
  {
    'id':'seed-d4-elim-2000-3','startsAt':'2026-08-16T20:00:00+08:00','stage':'淘汰轮 · Match 3','stream':None,'bestOf':3,
    'teams':[{'name':'待定（3-2）','score':None},{'name':'待定（2-3）','score':None}], 'status':'tbd','source':'blast'
  },
  {
    'id':'seed-d4-elim-2000-4','startsAt':'2026-08-16T20:00:00+08:00','stage':'淘汰轮 · Match 4','stream':None,'bestOf':3,
    'teams':[{'name':'待定（3-2）','score':None},{'name':'待定（2-3）','score':None}], 'status':'tbd','source':'blast'
  },
  {
    'id':'seed-d4-elim-2200-5','startsAt':'2026-08-16T22:00:00+08:00','stage':'淘汰轮 · Match 5','stream':None,'bestOf':3,
    'teams':[{'name':'待定（3-2）','score':None},{'name':'待定（2-3）','score':None}], 'status':'tbd','source':'blast'
  }
]
for m in new_matches:
    if m['id'] not in ids:
        matches.append(m)

matches.sort(key=lambda m:(m.get('startsAt',''),m.get('id','')))
data['matches']=matches
for item in data.get('timeline',[]):
    if item.get('date')=='2026-08-16':
        item['detail']='淘汰轮共 5 场 BO3；BLAST 已发布北京时间 20:00 四场、22:00 一场的赛程位。具体对阵仍为 TBD，等待数据源正式发布后再同步，不根据瑞士轮战绩自行推算。'
        break

p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('synced',sum(1 for m in data['matches'] if str(m.get('id','')).startswith('seed-d4-elim-')),'elimination slots')
