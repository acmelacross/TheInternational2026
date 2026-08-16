#!/usr/bin/env python3
import json
from pathlib import Path
p=Path('data/seed.json')
d=json.loads(p.read_text())
# Replace only main-event schedule slots (Aug 20-23); leave all earlier results untouched.
d['matches']=[m for m in d.get('matches',[]) if not str(m.get('startsAt','')).startswith(('2026-08-20','2026-08-21','2026-08-22','2026-08-23'))]

def M(id, dt, stage, a='待定', b='待定', bo=3):
    return {'id':id,'startsAt':dt,'stage':stage,'stream':None,'bestOf':bo,'teams':[{'name':a,'score':None},{'name':b,'score':None}],'status':'upcoming' if a!='待定' and b!='待定' else 'tbd','source':'blast'}
new=[
M('seed-me-ubqf1','2026-08-20T10:00:00+08:00','主赛事 · 胜者组四分之一决赛 1','Iron Wing','Team Spirit'),
M('seed-me-ubqf2','2026-08-20T13:00:00+08:00','主赛事 · 胜者组四分之一决赛 2','Team VISION','BoomBoys'),
M('seed-me-ubqf3','2026-08-20T16:00:00+08:00','主赛事 · 胜者组四分之一决赛 3','Team Liquid','Team Yandex'),
M('seed-me-ubqf4','2026-08-20T19:00:00+08:00','主赛事 · 胜者组四分之一决赛 4','Nigma Galaxy','Team Falcons'),
M('seed-me-lbr1-1','2026-08-21T10:00:00+08:00','主赛事 · 败者组第1轮 1'),
M('seed-me-lbr1-2','2026-08-21T13:00:00+08:00','主赛事 · 败者组第1轮 2'),
M('seed-me-ubsf1','2026-08-21T16:00:00+08:00','主赛事 · 胜者组半决赛 1'),
M('seed-me-ubsf2','2026-08-21T19:00:00+08:00','主赛事 · 胜者组半决赛 2'),
M('seed-me-lbr2-2','2026-08-22T10:00:00+08:00','主赛事 · 败者组第2轮 2'),
M('seed-me-lbr2-1','2026-08-22T13:00:00+08:00','主赛事 · 败者组第2轮 1'),
M('seed-me-ubf','2026-08-22T16:00:00+08:00','主赛事 · 胜者组决赛'),
M('seed-me-lbr3','2026-08-22T19:00:00+08:00','主赛事 · 败者组第3轮'),
M('seed-me-lbf','2026-08-23T10:00:00+08:00','主赛事 · 败者组决赛'),
M('seed-me-gf','2026-08-23T13:00:00+08:00','主赛事 · 总决赛','待定','待定',5),
]
d['matches'].extend(new)
d['matches'].sort(key=lambda m:m.get('startsAt',''))
# Update main-event timeline notes without inventing future participants.
notes={
'2026-08-20':'主赛事 Day 1：10:00 Iron Wing vs Team Spirit；13:00 TEAM VISION vs BoomBoys；16:00 Team Liquid vs Team Yandex；19:00 Nigma Galaxy vs Team Falcons（均 BO3）。',
'2026-08-21':'主赛事 Day 2：10:00/13:00 败者组第1轮；16:00/19:00 胜者组半决赛。具体后续对阵等待数据源正式发布。',
'2026-08-22':'主赛事 Day 3：10:00/13:00 败者组第2轮；16:00 胜者组决赛；19:00 败者组第3轮。',
'2026-08-23':'主赛事最终日：10:00 败者组决赛（BO3）；13:00 总决赛（BO5）。'
}
for x in d.get('timeline',[]):
    if x.get('date') in notes: x['note']=notes[x['date']]
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
print('patched',len(new),'main-event slots')
