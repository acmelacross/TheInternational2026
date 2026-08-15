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
print('PAGE_LEN',len(html))
print('SERVER',headers.get('Server'))
print('CONTENT_TYPE',headers.get('Content-Type'))
print('HTML_HEAD',re.sub(r'\s+',' ',html[:1600]))

assets=[]
for m in re.finditer(r'<script[^>]+src=["\']([^"\']+)["\']',html,re.I):
    assets.append(urllib.parse.urljoin(TARGET,m.group(1)))
for m in re.finditer(r'<link[^>]+href=["\']([^"\']+\.js[^"\']*)["\']',html,re.I):
    assets.append(urllib.parse.urljoin(TARGET,m.group(1)))
assets=list(dict.fromkeys(assets))[:60]
print('JS_ASSETS',len(assets))
for u in assets: print('ASSET',u)

haystacks=[('HTML',html)]
for u in assets:
    try:
        s,h,b=get(u)
        print('ASSET_OK',s,len(b),u)
        haystacks.append((u,b))
    except Exception as e:
        print('ASSET_ERR',u,repr(e))

url_hits=set(); api_hits=set(); fetch_hits=set(); keywords=[]
for src,text in haystacks:
    for x in re.findall(r'https?://[^"\'`<>\\\s]+',text):
        if any(k in x.lower() for k in ['api','schedule','match','tournament','liquipedia','opendota','blast','xgoat']): url_hits.add(x[:500])
    for x in re.findall(r'["\'](/(?:api|v1|v2|v3|schedule|matches|match|tournament)[^"\']*)["\']',text,re.I): api_hits.add(x[:300])
    for x in re.findall(r'(?:fetch|axios\.(?:get|post)|useSWR)\s*\(\s*["\']([^"\']+)',text,re.I): fetch_hits.add(x[:300])
    low=text.lower()
    for kw in ['supabase','firebase','strapi','graphql','api/','matches','schedule','opendota','liquipedia']:
        if kw in low: keywords.append((src,kw))
print('URL_HITS')
for x in sorted(url_hits): print(x)
print('API_HITS')
for x in sorted(api_hits): print(x)
print('FETCH_HITS')
for x in sorted(fetch_hits): print(x)
print('KEYWORDS')
for x in keywords[:100]: print(x[1],x[0])

probes=[]
for p in sorted(api_hits|fetch_hits):
    if p.startswith('/'):
        probes.append(urllib.parse.urljoin(BASE,p))
for common in ['/api/schedule','/api/matches','/api/tournament','/api/ti2026','/api/schedule?event=ti2026']:
    probes.append(BASE+common)
for u in list(dict.fromkeys(probes))[:30]:
    try:
        s,h,b=get(u)
        print('PROBE',s,h.get('Content-Type'),len(b),u,re.sub(r'\s+',' ',b[:500]))
        if '/api/schedule/wiki' in u and s == 200:
            data=json.loads(b)
            print('XGOAT_TOP_KEYS',sorted(data.keys()))
            for k,v in data.items():
                if isinstance(v,list): print('XGOAT_LIST',k,'len=',len(v),'sample=',json.dumps(v[:2],ensure_ascii=False)[:2000])
                elif isinstance(v,dict): print('XGOAT_DICT',k,'keys=',sorted(v.keys())[:80],'sample=',json.dumps(v,ensure_ascii=False)[:2000])
                else: print('XGOAT_SCALAR',k,repr(v)[:500])
            def walk(obj,path='root',depth=0):
                if depth>5:return
                if isinstance(obj,dict):
                    keys=set(obj.keys())
                    if keys & {'team1','team2','opponent1','opponent2','teams','startTime','startAt','startsAt','date','bestOf','bestof','score1','score2'}:
                        print('XGOAT_MATCHLIKE',path,json.dumps(obj,ensure_ascii=False)[:2500])
                    for k,v in obj.items(): walk(v,f'{path}.{k}',depth+1)
                elif isinstance(obj,list):
                    for i,v in enumerate(obj[:30]): walk(v,f'{path}[{i}]',depth+1)
            walk(data)
    except Exception as e:
        print('PROBE_ERR',u,repr(e))
