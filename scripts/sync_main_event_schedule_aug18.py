#!/usr/bin/env python3
import json
from pathlib import Path

p = Path('data/seed.json')
data = json.loads(p.read_text(encoding='utf-8'))

# BLAST current published schedule, checked 2026-08-18. Do not infer TBD pairings.
slots = [
    ('seed-main-0820-ubqf1','2026-08-20T10:00:00+08:00','主赛事 · 胜者组四分之一决赛 1',3,'Iron Wing','Team Spirit'),
    ('seed-main-0820-ubqf2','2026-08-20T13:00:00+08:00','主赛事 · 胜者组四分之一决赛 2',3,'Team VISION','BoomBoys'),
    ('seed-main-0820-ubqf3','2026-08-20T16:00:00+08:00','主赛事 · 胜者组四分之一决赛 3',3,'Team Liquid','Team Yandex'),
    ('seed-main-0820-ubqf4','2026-08-20T19:00:00+08:00','主赛事 · 胜者组四分之一决赛 4',3,'Nigma Galaxy','Team Falcons'),
    ('seed-main-0821-lbr1-1','2026-08-21T10:00:00+08:00','主赛事 · 败者组第1轮 1',3,'待定','待定'),
    ('seed-main-0821-lbr1-2','2026-08-21T13:00:00+08:00','主赛事 · 败者组第1轮 2',3,'待定','待定'),
    ('seed-main-0821-ubsf1','2026-08-21T16:00:00+08:00','主赛事 · 胜者组半决赛 1',3,'待定','待定'),
    ('seed-main-0821-ubsf2','2026-08-21T19:00:00+08:00','主赛事 · 胜者组半决赛 2',3,'待定','待定'),
    ('seed-main-0822-lbr2-2','2026-08-22T10:00:00+08:00','主赛事 · 败者组第2轮 2',3,'待定','待定'),
    ('seed-main-0822-lbr2-1','2026-08-22T13:00:00+08:00','主赛事 · 败者组第2轮 1',3,'待定','待定'),
    ('seed-main-0822-ubf','2026-08-22T16:00:00+08:00','主赛事 · 胜者组决赛',3,'待定','待定'),
    ('seed-main-0822-lbr3','2026-08-22T19:00:00+08:00','主赛事 · 败者组第3轮',3,'待定','待定'),
    ('seed-main-0823-lbf','2026-08-23T10:00:00+08:00','主赛事 · 败者组决赛',3,'待定','待定'),
    ('seed-main-0823-gf','2026-08-23T13:00:00+08:00','主赛事 · 总决赛',5,'待定','待定'),
]

matches = [m for m in data.get('matches', []) if not str(m.get('id','')).startswith('seed-main-')]
for mid, starts, stage, bo, a, b in slots:
    matches.append({
        'id': mid,
        'startsAt': starts,
        'stage': stage,
        'stream': None,
        'bestOf': bo,
        'teams': [{'name': a, 'score': None}, {'name': b, 'score': None}],
        'status': 'upcoming' if a != '待定' and b != '待定' else 'tbd',
        'source': 'blast'
    })
data['matches'] = matches

notes = {
 '2026-08-20':'主赛事 Day 1：10:00 Iron Wing vs Team Spirit；13:00 TEAM VISION vs BoomBoys；16:00 Team Liquid vs Team Yandex；19:00 Nigma Galaxy vs Team Falcons。对阵与时间均按 BLAST 已发布赛程。',
 '2026-08-21':'主赛事 Day 2：10:00、13:00 两场败者组第1轮；16:00、19:00 两场胜者组半决赛。具体 TBD 对阵等待可靠数据源发布，不自行推算。',
 '2026-08-22':'主赛事 Day 3：10:00、13:00 败者组第2轮；16:00 胜者组决赛；19:00 败者组第3轮。具体 TBD 对阵等待可靠数据源发布。',
 '2026-08-23':'主赛事 Day 4：10:00 败者组决赛；13:00 BO5 总决赛。具体对阵等待可靠数据源发布。'
}
timeline = data.get('timeline', [])
for date, note in notes.items():
    found = False
    for item in timeline:
        if item.get('date') == date:
            item['note'] = note
            found = True
            break
    if not found:
        timeline.append({'date': date, 'title': 'TI2026 主赛事', 'note': note})
data['timeline'] = timeline

p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('synced', len(slots), 'main-event slots')
