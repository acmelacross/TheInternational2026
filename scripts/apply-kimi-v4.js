'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'ai-service.js');
let s = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!s.includes(oldText)) throw new Error(`${label} marker not found`);
  s = s.replace(oldText, newText);
}

replaceOnce(
  "kimi:'kimi-k3-json-v3-20260813'",
  "kimi:'kimi-k3-schema-v4-20260813'",
  'Kimi cache revision'
);

const revisionMarker = "function providerRevision(p){ return FORMAT_REVISIONS[p.id] || ANALYSIS_REVISION; }\n";
const schemaBlock = `function providerRevision(p){ return FORMAT_REVISIONS[p.id] || ANALYSIS_REVISION; }
const KIMI_RESPONSE_FORMAT = {
  type:'json_schema',
  json_schema:{
    name:'ti2026_analysis',
    strict:true,
    schema:{
      type:'object',
      properties:{
        winnerLean:{type:'string'},
        confidence:{type:'integer',minimum:0,maximum:100},
        scorePrediction:{type:'string'},
        summary:{type:'string'},
        keyReasons:{type:'array',items:{type:'string'}},
        watchPoints:{type:'array',items:{type:'string'}},
        risks:{type:'string'},
        gamePredictions:{
          type:'array',
          items:{
            type:'object',
            properties:{
              game:{type:'integer'},
              winnerLean:{type:'string'},
              confidence:{type:'integer',minimum:0,maximum:100},
              reason:{type:'string'},
              bpKey:{type:'string'},
              playerKey:{type:'string'},
              status:{type:'string',enum:['prediction','observed','likely_not_needed']}
            },
            required:['game','winnerLean','confidence','reason','bpKey','playerKey','status'],
            additionalProperties:false
          }
        },
        playerForm:{type:'array',items:{type:'string'}},
        bpAnalysis:{type:'array',items:{type:'string'}},
        relationshipContext:{type:'array',items:{type:'string'}},
        dataGaps:{type:'array',items:{type:'string'}}
      },
      required:['winnerLean','confidence','scorePrediction','summary','keyReasons','watchPoints','risks','gamePredictions','playerForm','bpAnalysis','relationshipContext','dataGaps'],
      additionalProperties:false
    }
  }
};
`;

if (!s.includes('const KIMI_RESPONSE_FORMAT')) {
  replaceOnce(revisionMarker, schemaBlock, 'providerRevision');
}

replaceOnce(
  "{ id:'kimi', name:'Kimi K3', vendor:'Moonshot AI', api:'chat', key:envFirst('KIMI_API_KEY','MOONSHOT_API_KEY'), model:envFirst('KIMI_MODEL')||'kimi-k3', baseUrl:cleanBase(envFirst('KIMI_BASE_URL')||'https://api.moonshot.cn/v1'), timeoutMs:280000, body:{ reasoning_effort:'low', response_format:{type:'json_object'}, max_tokens:undefined, max_completion_tokens:16384 } },",
  "{ id:'kimi', name:'Kimi K3', vendor:'Moonshot AI', api:'chat', key:envFirst('KIMI_API_KEY','MOONSHOT_API_KEY'), model:envFirst('KIMI_MODEL')||'kimi-k3', baseUrl:cleanBase(envFirst('KIMI_BASE_URL')||'https://api.moonshot.cn/v1'), timeoutMs:280000, body:{ reasoning_effort:'low', response_format:KIMI_RESPONSE_FORMAT, max_tokens:undefined } },",
  'Kimi provider'
);

replaceOnce(
  "const text=extractText(json); if(!text){const finish=json?.choices?.[0]?.finish_reason||json?.status||'unknown';const hasReasoning=Boolean(json?.choices?.[0]?.message?.reasoning_content);throw new Error(`${p.vendor} 返回成功但没有最终文本内容（finish_reason=${finish}${hasReasoning?'，存在 reasoning_content':''}）`);}",
  "const text=extractText(json); if(!text){const choice=json?.choices?.[0],msg=choice?.message;const finish=choice?.finish_reason||json?.status||'unknown';const shape={topKeys:json&&typeof json==='object'?Object.keys(json).slice(0,12):[],choiceCount:Array.isArray(json?.choices)?json.choices.length:null,choiceKeys:choice&&typeof choice==='object'?Object.keys(choice).slice(0,12):[],messageKeys:msg&&typeof msg==='object'?Object.keys(msg).slice(0,12):[],contentType:Array.isArray(msg?.content)?'array':typeof msg?.content,contentLength:typeof msg?.content==='string'?msg.content.length:null,reasoningLength:typeof msg?.reasoning_content==='string'?msg.reasoning_content.length:null};throw new Error(`${p.vendor} 返回成功但没有最终文本内容（finish_reason=${finish}；响应结构=${redact(JSON.stringify(shape))}）`);}",
  'empty output diagnostic'
);

fs.writeFileSync(file, s, 'utf8');
console.log('Kimi K3 v4 patch applied');
