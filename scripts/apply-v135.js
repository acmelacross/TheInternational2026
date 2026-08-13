#!/usr/bin/env node
'use strict';
const fs=require('fs');
function rw(file,fn){const s=fs.readFileSync(file,'utf8');const n=fn(s);fs.writeFileSync(file,n);console.log(file,n===s?'unchanged':'updated')}
const oldText='数据与预测仅供娱乐参考，比赛胜负最终取决于选手临场发挥、版本理解与团队状态。本指南不建议、不支持任何形式的菠菜或博彩行为，请理性观赛、快乐看比赛。祝 CN Dota 在 TI2026 取得好成绩！';
const newText='数据与预测仅供娱乐参考，比赛胜负最终取决于选手临场发挥、版本理解与团队状态。本指南不建议、不支持任何形式的菠菜行为，请理性观赛、娱乐观赛。祝 CN Dota 在 TI2026 取得好成绩！';
rw('public/index.html',t=>{t=t.replaceAll('v1.3.4','v1.3.5').replaceAll(oldText,newText);if(!t.includes('/v135.css'))t=t.replace('<link rel="stylesheet" href="/v134.css" />','<link rel="stylesheet" href="/v134.css" />\n  <link rel="stylesheet" href="/v135.css" />');return t});
rw('public/match.html',t=>{t=t.replaceAll('v1.3.4','v1.3.5').replaceAll(oldText,newText);if(!t.includes('/v135.css'))t=t.replace('<link rel="stylesheet" href="/v134.css" />','<link rel="stylesheet" href="/v134.css" />\n  <link rel="stylesheet" href="/v135.css" />');t=t.replace('Qwen3.8-Max · DeepSeek-V4-Pro · Kimi K3 · Doubao-Seed-2.1-Pro · ERNIE 5.1 · Hy3','Qwen3.8-Max · DeepSeek-V4-Pro · Kimi K3 · Doubao-Seed-2.1-Pro · ERNIE 5.1 · Hy3 · 系列赛/逐局/BP/选手分析');return t});
rw('server.js',t=>{t=t.replace("version: '1.3.4'","version: '1.3.5'");t=t.replace("name: p?.name || p?.playerName || `Player ${i + 1}`,","id: p?.id || p?.playerId || p?.accountId || null,\n    name: p?.name || p?.playerName || `Player ${i + 1}`, ");return t});
fs.writeFileSync('VERSION','1.3.5\n');
fs.writeFileSync('CHANGELOG-v1.3.5.md',`# TI2026 Viewing Guide v1.3.5\n\n- 更新观赛提示语，移除“博彩”字样并改为“理性观赛、娱乐观赛”。\n- 多模型分析保持“每个模型 × 每个系列赛只调用一次”，成功或失败结果都写入本地缓存。\n- 单次模型调用现在一次性返回系列赛整体判断、BO3/BO5 逐局胜负倾向、选手状态、BP 分析、比赛看点与风险。\n- 选手状态只允许基于输入的真实 KDA/GPM/XPM/逐局数据判断，数据不足必须明确说明。\n- 新增公开关系背景字段；友谊、曾经队友、恩怨或摩擦只允许使用 data/relationship-context.json 中人工核验的公开资料，禁止模型编造八卦。\n- 新增 public/v135.css 优化逐局 AI 分析展示。\n- 新增宝塔 Git 快速部署脚本 deploy/linux/baota-git-deploy.sh。\n- API Key 仍只从服务器 .env 读取，禁止提交公开 GitHub。\n`);
console.log('v1.3.5 applied');
