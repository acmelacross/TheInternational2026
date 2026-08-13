from pathlib import Path

p = Path('ai-service.js')
s = p.read_text(encoding='utf-8')

if "const os = require('os');" not in s:
    s = s.replace(
        "const crypto = require('crypto');\n",
        "const crypto = require('crypto');\nconst os = require('os');\nconst { spawn } = require('child_process');\n",
        1,
    )

old_rev = "kimi:'kimi-k3-plain-v6-20260813'"
new_rev = "kimi:'kimi-k3-curl-v7-20260813'"
if old_rev not in s:
    raise SystemExit('Kimi v6 revision marker not found')
s = s.replace(old_rev, new_rev, 1)

marker = "function createAiService({ root, dataDir }) {\n"
helper = r'''function curlPostJson(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti2026-kimi-'));
    const headerFile = path.join(dir, 'headers.txt');
    const bodyFile = path.join(dir, 'body.json');
    const cleanup = () => { try { fs.rmSync(dir, { recursive:true, force:true }); } catch (_) {} };
    try {
      fs.writeFileSync(headerFile, `Authorization: ${headers.Authorization}\nContent-Type: application/json\nAccept: application/json\n`, { mode:0o600 });
      fs.writeFileSync(bodyFile, JSON.stringify(body), { mode:0o600 });
    } catch (err) {
      cleanup();
      reject(err);
      return;
    }
    const metaMarker='\n__TI2026_CURL_META__:';
    const args=[
      '--silent','--show-error','--location','--http1.1',
      '--connect-timeout','30',
      '--max-time',String(Math.max(1,Math.ceil((timeoutMs||120000)/1000))),
      '--header',`@${headerFile}`,
      '--data-binary',`@${bodyFile}`,
      '--write-out',`${metaMarker}%{http_code}|%{content_type}`,
      url
    ];
    const child=spawn('curl',args,{stdio:['ignore','pipe','pipe']});
    const out=[],err=[];
    let settled=false;
    child.stdout.on('data',d=>out.push(d));
    child.stderr.on('data',d=>err.push(d));
    child.on('error',e=>{
      if(settled)return;
      settled=true;
      cleanup();
      reject(e);
    });
    child.on('close',code=>{
      if(settled)return;
      settled=true;
      const stdout=Buffer.concat(out).toString('utf8');
      const stderr=Buffer.concat(err).toString('utf8').trim();
      cleanup();
      if(code!==0){reject(new Error(`curl exit ${code}: ${stderr||'request failed'}`));return;}
      const pos=stdout.lastIndexOf(metaMarker);
      if(pos<0){reject(new Error('curl response metadata missing'));return;}
      const raw=stdout.slice(0,pos);
      const meta=stdout.slice(pos+metaMarker.length).trim();
      const sep=meta.indexOf('|');
      const status=Number(sep>=0?meta.slice(0,sep):meta)||0;
      const contentType=sep>=0?meta.slice(sep+1):'';
      resolve({status,ok:status>=200&&status<300,contentType,raw});
    });
  });
}

function createAiService({ root, dataDir }) {
'''
if 'function curlPostJson(' not in s:
    if marker not in s:
        raise SystemExit('createAiService marker not found')
    s = s.replace(marker, helper, 1)

old = r'''    const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(p.timeoutMs||120000)});
    const raw=await res.text(); const responseType=res.headers.get('content-type')||''; let json=null; try{json=JSON.parse(raw)}catch(_){}
    if(!res.ok){const msg=json?.error?.message||json?.message||raw||`HTTP ${res.status}`;throw new Error(`${p.vendor} HTTP ${res.status}: ${redact(msg)}`)}
    const text=extractText(json); if(!text){const choice=json?.choices?.[0],msg=choice?.message;const finish=choice?.finish_reason||json?.status||'unknown';const shape={httpStatus:res.status,responseType,rawLength:raw.length,topKeys:json&&typeof json==='object'?Object.keys(json).slice(0,12):[],choiceCount:Array.isArray(json?.choices)?json.choices.length:null,choiceKeys:choice&&typeof choice==='object'?Object.keys(choice).slice(0,12):[],messageKeys:msg&&typeof msg==='object'?Object.keys(msg).slice(0,12):[],contentType:Array.isArray(msg?.content)?'array':typeof msg?.content,contentLength:typeof msg?.content==='string'?msg.content.length:null,reasoningLength:typeof msg?.reasoning_content==='string'?msg.reasoning_content.length:null};throw new Error(`${p.vendor} 返回成功但没有最终文本内容（finish_reason=${finish}；响应结构=${redact(JSON.stringify(shape))}）`);}
'''
new = r'''    let status,ok,responseType,raw;
    if(p.id==='kimi'){
      const out=await curlPostJson(url,headers,body,p.timeoutMs||120000);
      status=out.status;ok=out.ok;responseType=out.contentType||'';raw=out.raw;
    }else{
      const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(p.timeoutMs||120000)});
      status=res.status;ok=res.ok;responseType=res.headers.get('content-type')||'';raw=await res.text();
    }
    let json=null; try{json=JSON.parse(raw)}catch(_){}
    if(!ok){const msg=json?.error?.message||json?.message||raw||`HTTP ${status}`;throw new Error(`${p.vendor} HTTP ${status}: ${redact(msg)}`)}
    const text=extractText(json); if(!text){const choice=json?.choices?.[0],msg=choice?.message;const finish=choice?.finish_reason||json?.status||'unknown';const shape={transport:p.id==='kimi'?'curl':'fetch',httpStatus:status,responseType,rawLength:raw.length,topKeys:json&&typeof json==='object'?Object.keys(json).slice(0,12):[],choiceCount:Array.isArray(json?.choices)?json.choices.length:null,choiceKeys:choice&&typeof choice==='object'?Object.keys(choice).slice(0,12):[],messageKeys:msg&&typeof msg==='object'?Object.keys(msg).slice(0,12):[],contentType:Array.isArray(msg?.content)?'array':typeof msg?.content,contentLength:typeof msg?.content==='string'?msg.content.length:null,reasoningLength:typeof msg?.reasoning_content==='string'?msg.reasoning_content.length:null};throw new Error(`${p.vendor} 返回成功但没有最终文本内容（finish_reason=${finish}；响应结构=${redact(JSON.stringify(shape))}）`);}
'''
if old not in s:
    raise SystemExit('doFetch marker not found')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
