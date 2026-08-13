#!/usr/bin/env node
'use strict';
const fs = require('fs');
function rw(file, fn){ const src=fs.readFileSync(file,'utf8'); const out=fn(src); fs.writeFileSync(file,out); console.log(out===src?`UNCHANGED ${file}`:`UPDATED ${file}`); }

rw('public/index.html', t => {
  t=t.replace(/v1\.3\.5/g,'v1.3.6');
  t=t.replace(/\s*<a href="#chinaProfilesSection">中国战队<\/a>\n?/,'\n');
  t=t.replace(/\n\s*<section class="section china-profiles-section" id="chinaProfilesSection">[\s\S]*?<\/section>\n/,'\n');
  t=t.replace(/<footer>[\s\S]*?<\/footer>/, `<footer>\n    <div>TI2026潍坊线下观赛指南 v1.3.6 · 数据与预测仅供娱乐参考 · 不建议、不支持任何形式的菠菜行为 · 理性观赛，祝 CN Dota 取得好成绩。</div>\n    <div class="tech-support">技术支持：<a href="https://buer.top" target="_blank" rel="noopener">布尔信息科技(山东)有限公司</a></div>\n  </footer>`);
  return t;
});

rw('public/app.js', t => {
  t=t.replace(/\n\s*renderChinaProfiles\(\);/,'');
  t=t.replace(/\nfunction renderChinaProfiles\(\) \{[\s\S]*?\n\}/,'');
  return t;
});

rw('.gitignore', t => {
  const lines=t.split(/\r?\n/).filter(Boolean).filter(x=>x!=='.env' && x!=='.env.*' && x!=='!.env.example');
  return ['# Private environment files','.env','.env.*','!.env.example','',...lines,''].join('\n');
});

rw('public/v135.css', t => {
  if(t.includes('v1.3.6 footer support')) return t;
  return t + `\n/* v1.3.6 footer support */\nfooter{display:flex;flex-direction:column;align-items:center;gap:8px}.tech-support{font-size:10px;color:#64707d}.tech-support a{color:#9aa7b5;text-decoration:none;border-bottom:1px dotted rgba(154,167,181,.45)}.tech-support a:hover{color:#d9b45e;border-color:#d9b45e}\n`;
});

fs.writeFileSync('VERSION','1.3.6\n');
fs.writeFileSync('CHANGELOG-v1.3.6.md',`# TI2026 Viewing Guide v1.3.6\n\n- 删除首页“中国战队资料”整个模块及导航入口。\n- 删除前端对应 renderChinaProfiles 调用，避免空节点错误。\n- 页脚新增技术支持：布尔信息科技(山东)有限公司，并链接 https://buer.top。\n- 强化 .gitignore：忽略 .env 与 .env.*，显式保留 .env.example。\n- 保持服务器私有 API Key 文件不进入 Git 仓库。\n`);
console.log('v1.3.6 patch complete');