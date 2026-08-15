#!/usr/bin/env python3
from pathlib import Path
import json

p = Path('data/seed.json')
data = json.loads(p.read_text(encoding='utf-8'))

new_matches = [
    {
        'id': 'seed-main-d1-ubqf-1',
        'startsAt': '2026-08-20T20:00:00+08:00',
        'stage': '主赛事 · 胜者组四分之一决赛 1',
        'stream': None,
        'bestOf': 3,
        'teams': [{'name': '待定', 'score': None}, {'name': '待定', 'score': None}],
        'status': 'tbd',
        'source': 'blast'
    },
    {
        'id': 'seed-main-d1-ubqf-2',
        'startsAt': '2026-08-20T20:00:00+08:00',
        'stage': '主赛事 · 胜者组四分之一决赛 2',
        'stream': None,
        'bestOf': 3,
        'teams': [{'name': '待定', 'score': None}, {'name': '待定', 'score': None}],
        'status': 'tbd',
        'source': 'blast'
    },
    {
        'id': 'seed-main-d1-ubqf-3',
        'startsAt': '2026-08-20T20:00:00+08:00',
        'stage': '主赛事 · 胜者组四分之一决赛 3',
        'stream': None,
        'bestOf': 3,
        'teams': [{'name': '待定', 'score': None}, {'name': '待定', 'score': None}],
        'status': 'tbd',
        'source': 'blast'
    },
    {
        'id': 'seed-main-d1-ubqf-4',
        'startsAt': '2026-08-20T20:00:00+08:00',
        'stage': '主赛事 · 胜者组四分之一决赛 4',
        'stream': None,
        'bestOf': 3,
        'teams': [{'name': '待定', 'score': None}, {'name': '待定', 'score': None}],
        'status': 'tbd',
        'source': 'blast'
    },
    {
        'id': 'seed-main-d1-lbr1-1',
        'startsAt': '2026-08-20T20:00:00+08:00',
        'stage': '主赛事 · 败者组第1轮 1',
        'stream': None,
        'bestOf': 3,
        'teams': [{'name': '待定', 'score': None}, {'name': '待定', 'score': None}],
        'status': 'tbd',
        'source': 'blast'
    },
    {
        'id': 'seed-main-d1-lbr1-2',
        'startsAt': '2026-08-20T20:00:00+08:00',
        'stage': '主赛事 · 败者组第1轮 2',
        'stream': None,
        'bestOf': 3,
        'teams': [{'name': '待定', 'score': None}, {'name': '待定', 'score': None}],
        'status': 'tbd',
        'source': 'blast'
    }
]

ids = {m.get('id') for m in data.get('matches', [])}
added = 0
for m in new_matches:
    if m['id'] not in ids:
        data.setdefault('matches', []).append(m)
        ids.add(m['id'])
        added += 1

data['matches'].sort(key=lambda m: (m.get('startsAt',''), m.get('id','')))
for item in data.get('timeline', []):
    if item.get('date') == '2026-08-20':
        item['detail'] = 'BLAST 已发布主赛事首日 6 个 BO3 赛程位：北京时间 20:00 为 4 场胜者组四分之一决赛与 2 场败者组第1轮；具体对阵仍为 TBD，网站不根据淘汰轮结果自行推算。'
        break
else:
    data.setdefault('timeline', []).append({
        'date':'2026-08-20',
        'title':'主赛事 Day 1',
        'detail':'BLAST 已发布主赛事首日 6 个 BO3 赛程位：北京时间 20:00 为 4 场胜者组四分之一决赛与 2 场败者组第1轮；具体对阵仍为 TBD，网站不根据淘汰轮结果自行推算。'
    })

p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('added', added)
