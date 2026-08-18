#!/usr/bin/env python3
from pathlib import Path
p=Path('data/seed.json')
s=p.read_text(encoding='utf-8')
old='"detail": "BLAST 已发布主赛事首日 6 个 BO3 赛程位：北京时间 20:00 为 4 场胜者组四分之一决赛与 2 场败者组第1轮；具体对阵仍为 TBD，网站不根据淘汰轮结果自行推算。"'
new='"detail": "BLAST 已明确发布主赛事首日 4 场胜者组四分之一决赛：北京时间 10:00 Iron Wing vs Team Spirit，13:00 TEAM VISION vs BoomBoys，16:00 Team Liquid vs Team Yandex，19:00 Nigma Galaxy vs Team Falcons；均为 BO3。败者组第1轮安排在 8 月 21 日，后续对阵继续等待数据源正式发布。"'
if old not in s:
    raise SystemExit('target text not found')
p.write_text(s.replace(old,new,1),encoding='utf-8')
print('patched Aug 20 timeline detail')
