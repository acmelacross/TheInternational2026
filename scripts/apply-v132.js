#!/usr/bin/env node
'use strict';
const fs = require('fs');

function rw(file, fn) {
  const src = fs.readFileSync(file, 'utf8');
  const out = fn(src);
  if (out === src) console.log(`UNCHANGED ${file}`); else console.log(`UPDATED ${file}`);
  fs.writeFileSync(file, out);
}

rw('public/index.html', t => {
  t = t.replace(/<title>TI2026 上海观赛指南 v1\.3(?:\.1)?<\/title>/, '<title>TI2026 上海观赛指南 v1.3.2</title>');
  t = t.replace(/<em>v1\.3(?:\.1)?<\/em>/g, '<em>v1.3.2</em>');
  t = t.replace(/TI2026 Viewing Guide v1\.3(?:\.1)?/g, 'TI2026 Viewing Guide v1.3.2');
  t = t.replace('<h1>先看中国队，<br><span>再看今天所有比赛。</span></h1>', '<h1>每一场比赛，<br><span>都知道还有多久。</span></h1>');
  t = t.replace('The International 2026 上海观赛指南：CN 战队优先、', 'The International 2026 上海观赛指南：中国战队重点标识、');
  t = t.replace('  <link rel="stylesheet" href="/patch-v131.css" />\n', '');
  t = t.replace('  <script src="/patch-v131.js"></script>\n', '');
  t = t.replace('      <a class="nav-cn" href="#chinaSection">🇨🇳 中国战队赛程</a>\n      <a href="#todaySection">今日赛程</a>', '      <a href="#todaySection">今日赛程</a>\n      <a class="nav-cn" href="#chinaSection">🇨🇳 中国战队赛程</a>');
  const chinaRe = /\n    <section class="section china-focus" id="chinaSection">[\s\S]*?\n    <\/section>\n/;
  const todayRe = /\n    <section class="section" id="todaySection">[\s\S]*?\n    <\/section>\n/;
  const cm = t.match(chinaRe), tm = t.match(todayRe);
  if (cm && tm && t.indexOf(cm[0]) < t.indexOf(tm[0])) {
    const start = t.indexOf(cm[0]);
    const end = t.indexOf(tm[0]) + tm[0].length;
    t = t.slice(0, start) + tm[0] + '\n' + cm[0] + t.slice(end);
  }
  return t;
});

rw('public/match.html', t => t
  .replace(/<em>v1\.3(?:\.1)?<\/em>/g, '<em>v1.3.2</em>')
  .replace('  <link rel="stylesheet" href="/patch-v131.css" />\n', '')
  .replace('  <script src="/match-patch-v131.js"></script>\n', '')
);

rw('public/app.js', t => {
  t = t.replace("function cnBadge() { return '<span class=\"cn-badge\">🇨🇳 CN</span>'; }", "function cnBadge() { return '<span class=\"cn-badge\">cn</span>'; }");
  t = t.replace(/CN 战队重点场/g, '中国队重点场');
  t = t.replace(/<div class=\"cn-corner\">🇨🇳 CN FOCUS<\/div>/g, '<div class="cn-corner">中国队</div>');
  t = t.replace(/<span class=\"cn-badge large\">🇨🇳 CN<\/span>/g, '<span class="cn-badge large">cn</span>');
  t = t.replace(/中国战队 · CN FOCUS/g, '中国战队');
  t = t.replace(/function renderChinaProfiles\(\) \{[\s\S]*?\n\}/, `function renderChinaProfiles() {\n  $('#chinaProfiles').innerHTML = '<div class="empty waiting-panel">中国战队资料等待更新</div>';\n}`);
  return t;
});

rw('public/match.js', t => t
  .replace("const cn=n=>isCN(n)?'<span class=\"cn-badge\">🇨🇳 CN</span>':'';", "const cn=n=>isCN(n)?'<span class=\"cn-badge\">cn</span>':'';")
  .replace(/<div class=\"detail-cn-flag\">🇨🇳<b>CN FOCUS<\/b><\/div>/g, '<div class="detail-cn-flag"><b>中国队</b></div>')
);

rw('public/styles.css', t => {
  const marker = '/* v1.3.2 original-color team logo rendering */';
  if (t.includes(marker)) return t;
  return t + `\n\n${marker}\n.cn-badge{gap:0!important;text-transform:lowercase!important}.cn-corner{font-size:10px!important;letter-spacing:.03em!important}.team-logo,.stand-logo,.bracket-logo,.schedule-logo,.team-card-logo,.profile-logo,.detail-team-logo{background:#fff!important;border:1px solid rgba(18,24,32,.12)!important;box-shadow:none!important}.team-logo img,.stand-logo img,.bracket-logo img,.schedule-logo img,.team-card-logo img,.profile-logo img,.detail-team-logo img,.bracket-team-name img{width:100%!important;height:100%!important;object-fit:contain!important;background:#fff!important;padding:4px!important}.waiting-panel{padding:22px 18px;border:1px dashed rgba(255,255,255,.14);background:rgba(255,255,255,.02);border-radius:12px;text-align:center;color:var(--muted)}\n`;
});

const seed = JSON.parse(fs.readFileSync('data/seed.json', 'utf8'));
for (const p of seed.chinaTeamProfiles || []) p.badge = 'cn';
seed.teamAssetMeta ||= {};
seed.teamAssetMeta.localCache = true;
seed.teamAssetMeta.sourceNote = '战队 Logo 优先从 OpenDota 的真实 logo_url 拉取并缓存到本地；页面运行时不依赖外部图片站。';
seed.teamAssetMeta.directory = '/assets/teams-normal/';
fs.writeFileSync('data/seed.json', JSON.stringify(seed, null, 2) + '\n');
fs.writeFileSync('VERSION', '1.3.2\n');
fs.writeFileSync('CHANGELOG-v1.3.2.md', `# TI2026 Viewing Guide v1.3.2\n\n- 恢复首页主标题为 v1.2 的“每一场比赛，都知道还有多久。”\n- 首页顺序调整为：今日赛程 → 中国战队赛程 → 瑞士轮战绩/赛制速读 → 主赛事 → 完整赛程 → 赛事日历 → 中文直播。\n- 中国战队比赛角标统一为“中国队”。\n- 中国战队名称旁徽标统一为“cn”，移除重复的 CN/CN FOCUS 文案。\n- 中国战队资料区域继续显示“等待更新”。\n- 战队 Logo 改为 OpenDota 真实 logo_url 的本地缓存，使用原色正常 Logo，不再使用统一棕金赛事图。\n- Logo 保存在 public/assets/teams-normal/，Linux 部署后仍只读取本地文件。\n`);

for (const f of ['public/patch-v131.css','public/patch-v131.js','public/match-patch-v131.js']) {
  if (fs.existsSync(f)) fs.rmSync(f);
}
console.log('v1.3.2 source patch complete');
