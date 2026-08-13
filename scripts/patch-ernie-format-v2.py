from pathlib import Path

p = Path('ai-service.js')
s = p.read_text(encoding='utf-8')

old_rev = "const FORMAT_REVISIONS = { qwen:'qwen-json-v2-20260813', kimi:'kimi-k3-curl-v7-20260813' };"
new_rev = "const FORMAT_REVISIONS = { qwen:'qwen-json-v2-20260813', kimi:'kimi-k3-curl-v7-20260813', ernie:'ernie-format-v2-20260813' };"
if old_rev not in s:
    raise SystemExit('FORMAT_REVISIONS marker not found')
s = s.replace(old_rev, new_rev, 1)

old_provider = "{ id:'ernie', name:'ERNIE 5.1', vendor:'百度千帆', api:'chat', key:envFirst('ERNIE_API_KEY','QIANFAN_API_KEY'), model:envFirst('ERNIE_MODEL')||'ernie-5.1', baseUrl:cleanBase(envFirst('ERNIE_BASE_URL')||'https://qianfan.baidubce.com/v2'), body:{} },"
new_provider = "{ id:'ernie', name:'ERNIE 5.1', vendor:'百度千帆', api:'chat', key:envFirst('ERNIE_API_KEY','QIANFAN_API_KEY'), model:envFirst('ERNIE_MODEL')||'ernie-5.1', baseUrl:cleanBase(envFirst('ERNIE_BASE_URL')||'https://qianfan.baidubce.com/v2'), body:{ max_tokens:8192 } },"
if old_provider not in s:
    raise SystemExit('ERNIE provider marker not found')
s = s.replace(old_provider, new_provider, 1)

old_return = "    return {text,usage:json?.usage||null};\n"
new_return = "    const finishReason=json?.choices?.[0]?.finish_reason||json?.finish_reason||null;\n    if(finishReason==='length'){throw new Error(`${p.vendor} 输出达到长度上限，结构化 JSON 被截断`);}\n    return {text,usage:json?.usage||null,finishReason};\n"
if old_return not in s:
    raise SystemExit('doFetch return marker not found')
s = s.replace(old_return, new_return, 1)

old_fallback = "  return { winnerLean: '', confidence: 0, scorePrediction: '', summary: raw.slice(0, 2200), keyReasons: [], watchPoints: [], risks: '', gamePredictions: [], playerForm: [], bpAnalysis: [], relationshipContext: [], dataGaps: ['模型未按结构化 JSON 返回，已保留原始摘要。'] };\n"
new_fallback = "  if (/^[{[]/.test(stripped)) throw new Error('模型返回的结构化 JSON 不完整，已避免展示原始 JSON');\n  return { winnerLean: '', confidence: 0, scorePrediction: '', summary: raw.slice(0, 2200), keyReasons: [], watchPoints: [], risks: '', gamePredictions: [], playerForm: [], bpAnalysis: [], relationshipContext: [], dataGaps: ['模型未按结构化 JSON 返回，已保留原始摘要。'] };\n"
if old_fallback not in s:
    raise SystemExit('parseAnalysis fallback marker not found')
s = s.replace(old_fallback, new_fallback, 1)

p.write_text(s, encoding='utf-8')
