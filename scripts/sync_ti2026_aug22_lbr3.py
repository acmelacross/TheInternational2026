#!/usr/bin/env python3
from pathlib import Path
import json

# Triggered sync for the explicitly published Aug 22 lower-bracket semifinal pairing.
p = Path('data/seed.json')
data = json.loads(p.read_text(encoding='utf-8'))
changed = 0
for m in data.get('matches', []):
    if m.get('id') in {'seed-me-lbr3', 'seed-main-0822-lbr3'}:
        m['teams'] = [
            {'name': 'BoomBoys', 'score': None},
            {'name': 'Team Spirit', 'score': None}
        ]
        m['status'] = 'upcoming'
        m['source'] = 'escore-confirmed-schedule'
        changed += 1

for item in data.get('timeline', []):
    if item.get('date') == '2026-08-22':
        item['detail'] = '主赛事 Day 3：10:10 Team Spirit 2:1 Team Liquid（败者组第2轮，已结束）；13:00 Nigma Galaxy 1:2 BoomBoys（败者组第2轮，已结束）；16:00 TEAM VISION vs Team Yandex（胜者组决赛）；19:00 BoomBoys vs Team Spirit（败者组第3轮，BO3，已由公开比赛页明确发布）。'
        item['note'] = '仅同步公开数据源明确发布的对阵、时间和赛果；胜者组决赛及后续场次未确认的比分/对阵继续等待可靠来源发布，不自行推算。'
        changed += 1

if changed < 3:
    raise SystemExit(f'expected at least 3 updates, got {changed}')
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'updated {changed} records')
