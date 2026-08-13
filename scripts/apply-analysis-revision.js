#!/usr/bin/env node
'use strict';
const fs=require('fs');
const f='ai-service.js';
let t=fs.readFileSync(f,'utf8');
if(!t.includes("const ANALYSIS_REVISION = 'team-intel-v1-20260813';")){
  t=t.replace("const crypto = require('crypto');", "const crypto = require('crypto');\n\nconst ANALYSIS_REVISION = 'team-intel-v1-20260813';");
}
t=t.replace("if(c&&c.model===p.model)return{...c,cached:true,configured:Boolean(p.key)};", "if(c&&c.model===p.model&&c.analysisRevision===ANALYSIS_REVISION)return{...c,cached:true,configured:Boolean(p.key)};");
t=t.replace("const complete=configured.every(p=>latest.models?.[p.id]?.model===p.model);", "const complete=configured.every(p=>latest.models?.[p.id]?.model===p.model&&latest.models?.[p.id]?.analysisRevision===ANALYSIS_REVISION);");
t=t.replace("const tasks=providers.filter(p=>p.key&&(!existing.models[p.id]||existing.models[p.id].model!==p.model)).map", "const tasks=providers.filter(p=>p.key&&(!existing.models[p.id]||existing.models[p.id].model!==p.model||existing.models[p.id].analysisRevision!==ANALYSIS_REVISION)).map");
t=t.replace("result={id:p.id,name:p.name,vendor:p.vendor,model:p.model,status:'ok'", "result={id:p.id,name:p.name,vendor:p.vendor,model:p.model,analysisRevision:ANALYSIS_REVISION,status:'ok'");
t=t.replace("result={id:p.id,name:p.name,vendor:p.vendor,model:p.model,status:'error'", "result={id:p.id,name:p.name,vendor:p.vendor,model:p.model,analysisRevision:ANALYSIS_REVISION,status:'error'");
t=t.replace("policy:'本地缓存优先；已缓存模型不会重复调用。'", "analysisRevision:ANALYSIS_REVISION,policy:'本地缓存优先；旧分析版本会在新情报管线启用后仅重算一次，随后永久读取持久缓存。'");
t=t.replace("policy:'缓存优先：每个模型每个系列赛最多调用一次；", "analysisRevision:ANALYSIS_REVISION,policy:'缓存优先：每个模型在当前分析版本下每个系列赛最多调用一次；");
fs.writeFileSync(f,t);
console.log('AI analysis revision patched');
