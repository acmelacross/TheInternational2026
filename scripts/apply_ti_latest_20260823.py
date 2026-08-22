#!/usr/bin/env python3
from pathlib import Path
import json

p=Path('data/seed.json')
data=json.loads(p.read_text())
updated_lbr3=0
updated_lbf=0
for m in data.get('matches',[]):
    stage=str(m.get('stage',''))
    starts=str(m.get('startsAt',''))
    teams=m.get('teams') or []
    names=[str(t.get('name','')) for t in teams[:2]]
    if starts.startswith('2026-08-22') and '败者组第3轮' in stage and set(names)=={'BoomBoys','Team Spirit'}:
        for t in teams:
            if t.get('name')=='BoomBoys': t['score']=0
            if t.get('name')=='Team Spirit': t['score']=2
        m['status']='finished'
        m['source']='confirmed-public-result'
        updated_lbr3 += 1
    if starts.startswith('2026-08-23') and '败者组决赛' in stage:
        if len(teams)>=2:
            # Preserve Team Yandex if already present, fill only the published opponent slot.
            if teams[0].get('name')=='Team Yandex': teams[1]['name']='Team Spirit'
            elif teams[1].get('name')=='Team Yandex': teams[0]['name']='Team Spirit'
            else:
                teams[0]['name']='Team Yandex'; teams[1]['name']='Team Spirit'
            for t in teams[:2]: t['score']=None
            m['status']='upcoming'
            m['source']='confirmed-public-schedule'
            updated_lbf += 1

for item in data.get('timeline',[]):
    if item.get('date')=='2026-08-22':
        item['detail']='主赛事 Day 3：10:10 Team Spirit 2:1 Team Liquid（败者组第2轮，已结束）；13:00 Nigma Galaxy 1:2 BoomBoys（败者组第2轮，已结束）；16:45 TEAM VISION 2:1 Team Yandex（胜者组决赛，已结束）；21:00 BoomBoys 0:2 Team Spirit（败者组第3轮，已结束）。'
        item['note']='仅同步公开数据源明确发布的对阵、时间和最终赛果；Team Spirit 已晋级 8 月 23 日败者组决赛。'
    elif item.get('date')=='2026-08-23':
        item['detail']='决赛日：10:00 Team Yandex vs Team Spirit（败者组决赛，BO3）；13:00 TEAM VISION vs 待定（总决赛，BO5）。总决赛另一方继续等待可靠数据源在败者组决赛结束后正式发布。'
        item['note']='败者组决赛双方已由公开赛果/赛程明确；总决赛另一方未提前推算。'

if updated_lbr3 < 1 or updated_lbf < 1:
    raise SystemExit(f'expected entries not found: lbr3={updated_lbr3} lbf={updated_lbf}')
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('UPDATED',updated_lbr3,updated_lbf)
