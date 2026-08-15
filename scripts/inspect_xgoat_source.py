#!/usr/bin/env python3
import re, sys, json, urllib.request, urllib.parse
BASE='https://ti.xgoat.top'
TARGET=BASE+'/schedule'
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/151 Safari/537.36 TI2026Guide/1.4.1'

def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'*/*','Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8'})
    with urllib.request.urlopen(req,timeout=25) as r:
        body=r.read().decode('utf-8','replace')
        return r.status, dict(r.headers), body

status, headers, html=get(TARGET)
print('PAGE_STATUS',status)
assets=[]
for m in re.finditer(r'<script[^>]+src=["\']([^"\']+)["\']',html,re.I): assets.append(urllib.parse.urljoin(TARGET,m.group(1)))
haystacks=[('HTML',html)]
for u in list(dict.fromkeys(assets))[:60]:
    try: haystacks.append((u,get(u)[2]))
    except Exception as e: print('ASSET_ERR',u,repr(e))
api_hits=set(); fetch_hits=set()
for src,text in haystacks:
    for x in re.findall(r'["\'](/(?:api|v1|v2|v3|schedule|matches|match|tournament)[^"\']*)["\']',text,re.I): api_hits.add(x[:300])
    for x in re.findall(r'(?:fetch|axios\.(?:get|post)|useSWR)\s*\(\s*["\']([^"\']+)',text,re.I): fetch_hits.add(x[:300])
print('API_HITS',sorted(api_hits))
for p in sorted(api_hits|fetch_hits):
    if '/api/schedule/wiki' not in p: continue
    u=urllib.parse.urljoin(BASE,p)
    s,h,b=get(u)
    data=json.loads(b)
    print('XGOAT_META',json.dumps({k:data.get(k) for k in ['source','fetchedAt','revisionAt','revisionId','stale','coverage']},ensure_ascii=False))
    rows=[]
    for stage in data.get('stages') or []:
        for rnd in stage.get('rounds') or []:
            for m in rnd.get('matches') or []:
                rows.append({
                    'stage':stage.get('label') or stage.get('id'),
                    'round':rnd.get('title') or rnd.get('id'),
                    'id':m.get('id'),'scheduledAt':m.get('scheduledAt'),'status':m.get('status'),'bestOf':m.get('bestOf'),
                    'opponents':[(o.get('name'),o.get('score'),o.get('canonicalKey')) for o in (m.get('opponents') or [])]
                })
    print('XGOAT_FLAT_COUNT',len(rows))
    for r in rows:
        if str(r.get('scheduledAt') or '').startswith('2026-08-15'):
            print('XGOAT_AUG15',json.dumps(r,ensure_ascii=False))
    for r in rows:
        if str(r.get('scheduledAt') or '').startswith('2026-08-16'):
            print('XGOAT_AUG16',json.dumps(r,ensure_ascii=False))
