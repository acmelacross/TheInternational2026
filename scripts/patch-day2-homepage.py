from pathlib import Path
import re, json

# ---------- index.html ----------
p=Path('public/index.html')
s=p.read_text(encoding='utf-8')
s=s.replace('中国战队重点赛程、今日赛程、瑞士轮战绩、赛前实力预测、淘汰赛、完整赛程、赛事日历、Match ID/BP/KDA 与中文直播入口。','中国战队重点赛程、今日/明日赛程、瑞士轮战绩、首日更新实力预测、赛事日历与主赛事、完整赛程、Match ID/BP/KDA 与中文直播入口。')
s=s.replace('<a href="#todaySection">今日赛程</a>','<a href="#todaySection">今日 / 明日</a>')
s=s.replace('<a href="#bracketSection">主赛事</a>','<a href="#bracketSection">赛事日历 / 主赛事</a>')
s=s.replace('      <a href="#calendarSection">赛事日历</a>\n','')

today='''    <section class="section" id="todaySection">
      <div class="section-heading">
        <div><span class="kicker">TODAY & TOMORROW</span><h2>今日 / 明日赛程</h2><p class="section-desc">只展示数据源已经确认的对阵；上游一旦发布新赛程，这里会自动出现，不根据战绩自行推算。</p></div>
        <span class="source-live-note">数据源实时同步</span>
      </div>
      <div class="day-schedule-stack">
        <div class="day-schedule-block day-schedule-today">
          <div class="day-schedule-head"><div><span>今天</span><b id="todayTitle">今日赛程</b></div><div class="date-chip" id="todayChip"></div></div>
          <div id="todayMatches" class="match-grid"></div>
        </div>
        <div class="day-schedule-block">
          <div class="day-schedule-head"><div><span>明天</span><b id="tomorrowTitle">明日赛程</b></div><div class="date-chip" id="tomorrowChip"></div></div>
          <div id="tomorrowMatches" class="match-grid"></div>
        </div>
      </div>
    </section>'''
s=re.sub(r'    <section class="section" id="todaySection">.*?</section>',today,s,count=1,flags=re.S)

s=s.replace('截至 2026 年 8 月 13 日瑞士轮开打前的最后预测 · 主要展示实力排序、预测区间与判断理由','已纳入 8 月 13 日首日实战结果 · 赛前实力基线 + 瑞士轮真实战绩动态修正')
s=s.replace('<span class="prediction-stamp">开赛前最后版</span>','<span class="prediction-stamp">首日赛果更新</span>')
s=s.replace('不是照搬赔率，综合参考近期大赛状态、阵容个人能力、TI/大赛经验，以及阵容稳定度与英雄池。瑞士轮尤其考验稳定性，因此“偶尔爆发”不等于一定能走得更远。','以赛前综合实力评分为基线，再根据 TI2026 已完成的瑞士轮系列赛结果做有限修正。每个系列赛净胜约修正 ±2.5 分，单队最多修正 ±6 分，避免一天的波动完全推翻赛季长期判断；后续赛果会继续自动修正。')
s=s.replace('<span><b>40%</b>近期状态</span><span><b>25%</b>个人能力</span><span><b>20%</b>大赛经验</span><span><b>15%</b>稳定/英雄池</span>','<span><b>基线</b>赛前实力</span><span><b>±2.5</b>每场净胜</span><span><b>±6</b>最大修正</span><span><b>实时</b>随赛果更新</span>')
s=re.sub(r'        <div class="prediction-callouts">.*?</div>\n      </div>', '        <div id="predictionCallouts" class="prediction-callouts"></div>\n      </div>', s, count=1, flags=re.S)
s=s.replace('<span class="kicker">POWER RANKING</span><h2>16 队完整预测排名</h2>','<span class="kicker">POWER RANKING</span><h2>16 队动态实力排名</h2>')
s=s.replace('排名是综合实力排序，不等于最终一定名次','首日赛果已纳入；后续真实赛果继续修正')

format_old='''          <div class="format-item"><b>4 胜</b><span>直接晋级主赛事</span></div><div class="format-arrow">→</div>
          <div class="format-item"><b>4 负</b><span>直接淘汰</span></div><div class="format-arrow">→</div>
          <div class="format-item"><b>8 强</b><span>进入双败主赛事</span></div><div class="format-arrow">→</div>
          <div class="format-item"><b>BO5</b><span>总决赛</span></div>'''
format_new='''          <div class="format-item"><b>5 轮</b><span>前三天瑞士轮</span></div><div class="format-arrow">→</div>
          <div class="format-item"><b>5 场</b><span>8 月 16 日淘汰赛</span></div><div class="format-arrow">→</div>
          <div class="format-item"><b>8 队</b><span>晋级双败主赛事</span></div><div class="format-arrow">→</div>
          <div class="format-item"><b>BO5</b><span>总决赛</span></div>'''
s=s.replace(format_old,format_new)

bracket='''    <section class="section event-roadmap-section" id="bracketSection">
      <div class="section-heading">
        <div><span class="kicker">CALENDAR · MAIN EVENT</span><h2>赛事日历 / 主赛事</h2><p class="section-desc">瑞士轮 8 月 13–16 日 · 主赛事 8 月 20–23 日；实际对阵仍以数据源发布为准。</p></div>
        <span class="muted small">8 支队伍进入主赛事双败</span>
      </div>
      <div id="timeline" class="timeline combined-timeline"></div>
      <div class="section-heading compact roadmap-bracket-heading"><div><span class="kicker">MAIN EVENT</span><h2>主赛事 / 淘汰赛</h2></div><span class="muted small">对阵产生后自动填入</span></div>
      <div id="bracket" class="bracket"></div>
    </section>

    <section class="section" id="scheduleSection">'''
s=re.sub(r'    <section class="section" id="bracketSection">.*?</section>\n\n    <section class="section" id="scheduleSection">',bracket,s,count=1,flags=re.S)
s=re.sub(r'\n    <section class="section" id="calendarSection">.*?</section>\n', '\n', s, count=1, flags=re.S)
p.write_text(s,encoding='utf-8')

# ---------- app.js ----------
p=Path('public/app.js')
s=p.read_text(encoding='utf-8')
s=s.replace('  renderStandings();\n  renderBracket();','  renderStandings();\n  if (typeof window.updateTIPredictions === \'function\') window.updateTIPredictions(state.data.standings || []);\n  renderBracket();')
s=re.sub(r'function getDisplayTodayKey\(\) \{.*?\n\}\nfunction renderStreams', '''function tomorrowShanghaiKey() { return shanghaiDateKey(new Date(Date.now() + 24 * 3600000)); }
function renderStreams''', s, count=1, flags=re.S)
old=re.search(r'function renderToday\(\) \{.*?\n\}',s,flags=re.S)
if not old: raise SystemExit('renderToday not found')
new='''function scheduleEmptyHtml(label, key) {
  const d = new Date(`${key}T12:00:00+08:00`);
  const date = fmtDate.format(d);
  return `<div class="empty schedule-source-empty"><b>${escapeHtml(label)}暂无已确认对阵</b><span>${escapeHtml(date)} 的具体双方尚未从当前外部数据源返回。不会显示昨天赛程，也不会根据战绩自行推算；数据源发布后会自动同步。</span></div>`;
}
function renderToday() {
  const todayKey = todayShanghaiKey();
  const tomorrowKey = tomorrowShanghaiKey();
  const all = state.data.matches || [];
  const today = all.filter(m => shanghaiDateKey(m.startsAt) === todayKey).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
  const tomorrow = all.filter(m => shanghaiDateKey(m.startsAt) === tomorrowKey).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
  const todayDate = new Date(`${todayKey}T12:00:00+08:00`);
  const tomorrowDate = new Date(`${tomorrowKey}T12:00:00+08:00`);
  if ($('#todayChip')) $('#todayChip').textContent = fmtDate.format(todayDate);
  if ($('#tomorrowChip')) $('#tomorrowChip').textContent = fmtDate.format(tomorrowDate);
  if ($('#todayTitle')) $('#todayTitle').textContent = `今日赛程 · ${today.length} 场已确认`;
  if ($('#tomorrowTitle')) $('#tomorrowTitle').textContent = `明日赛程 · ${tomorrow.length} 场已确认`;
  $('#todayMatches').innerHTML = today.length ? today.map(matchCard).join('') : scheduleEmptyHtml('今日', todayKey);
  if ($('#tomorrowMatches')) $('#tomorrowMatches').innerHTML = tomorrow.length ? tomorrow.map(matchCard).join('') : scheduleEmptyHtml('明日', tomorrowKey);
  bindReminderButtons();
}'''
s=s[:old.start()]+new+s[old.end():]
s=s.replace("const src = String(d.source||'').includes('opendota') ? '赛程 + OpenDota 比分'", "const src = String(d.source||'').includes('opendota') ? '已公布赛程 + OpenDota 实况'")
s=s.replace("? `比分：OpenDota · 约 ${d.dataStatus?.liveRefreshSeconds||120} 秒同步`", "? `对阵/比分：外部数据源 · 约 ${d.dataStatus?.liveRefreshSeconds||120} 秒同步`")
p.write_text(s,encoding='utf-8')

# ---------- predictions.js ----------
p=Path('public/predictions.js')
s=p.read_text(encoding='utf-8')
s=s.replace('  const TEAMS = [','  const BASE_TEAMS = [',1)
s=s.replace("reason:'Topson 临时加入让上限突然拉高，个人能力和大赛经验都足够强，理论天花板远高于当前排名。', risk:'临时换人导致磨合时间极短，中野联动、沟通和 BP 适配是最大不确定因素。', tag:'最大变量'", "reason:'从地区预选突围后具备一定韧性，首日先负 Falcons、再击败 Team Resilience，强度处在中游但仍有继续上探空间。', risk:'面对第一梯队时对线与中期执行仍要继续验证，后续同战绩强强对话会放大稳定性问题。', tag:'中游变量'",1)
insert='''

  const DAY1_SNAPSHOT = {
    'BoomBoys':{wins:2,losses:0,played:2}, 'Team VISION':{wins:2,losses:0,played:2},
    'Aurora Gaming':{wins:1,losses:0,played:1}, 'Team Liquid':{wins:1,losses:0,played:1},
    'Team Spirit':{wins:1,losses:0,played:1}, 'Team Yandex':{wins:1,losses:0,played:1},
    'Iron Wing':{wins:1,losses:1,played:2}, 'LGD Gaming':{wins:1,losses:1,played:2},
    'Nigma Galaxy':{wins:1,losses:1,played:2}, 'Team Falcons':{wins:1,losses:1,played:2},
    'GamerLegion':{wins:0,losses:1,played:1}, 'HULIGANI':{wins:0,losses:1,played:1},
    'Vici Gaming':{wins:0,losses:1,played:1}, 'Xtreme Gaming':{wins:0,losses:1,played:1},
    'OG':{wins:0,losses:2,played:2}, 'Team Resilience':{wins:0,losses:2,played:2}
  };
  let activeRecords = {...DAY1_SNAPSHOT};
  function formNote(r) {
    if (!r || !r.played) return 'TI2026 正赛样本尚不足，暂按赛前基线。';
    const rec=`${r.wins}-${r.losses}`;
    if (r.wins-r.losses >= 2) return `瑞士轮 ${rec}，实战表现明显加分。`;
    if (r.wins-r.losses === 1) return `瑞士轮 ${rec}，开局正向，但样本仍少。`;
    if (r.wins === r.losses) return `瑞士轮 ${rec}，整体仍在中位预期。`;
    if (r.losses-r.wins >= 2) return `瑞士轮 ${rec}，已经进入高压区，短期评级下调。`;
    return `瑞士轮 ${rec}，首轮结果偏负面，但仍有回调空间。`;
  }
  function currentTeams() {
    return BASE_TEAMS.map(t => {
      const r=activeRecords[t.team] || {wins:0,losses:0,played:0};
      const delta=Math.max(-6,Math.min(6,(Number(r.wins||0)-Number(r.losses||0))*2.5));
      const liveScore=Math.max(50,Math.min(100,Math.round((t.score+delta)*10)/10));
      return {...t,baseRank:t.rank,baseScore:t.score,score:liveScore,record:r,formDelta:delta,formNote:formNote(r)};
    }).sort((a,b)=>b.score-a.score||a.baseRank-b.baseRank).map((t,i)=>({...t,rank:i+1}));
  }
'''
pos=s.find('\n  const esc =')
if pos<0: raise SystemExit('predictions insert anchor not found')
s=s[:pos]+insert+s[pos:]
s=s.replace('BASE_TEAMS.slice(0,4)','currentTeams().slice(0,4)') if 'BASE_TEAMS.slice(0,4)' in s else s.replace('TEAMS.slice(0,4)','currentTeams().slice(0,4)')
s=s.replace('BASE_TEAMS.map(t => `','currentTeams().map(t => `') if 'BASE_TEAMS.map(t => `' in s else s.replace('TEAMS.map(t => `','currentTeams().map(t => `')
s=s.replace('<p>${esc(t.reason)}</p>','<p>${esc(t.reason)} <strong>${esc(t.formNote||\'\')}</strong></p>')
s=s.replace('<p><b>看好理由：</b>${esc(t.reason)}</p>','<p><b>看好理由：</b>${esc(t.reason)}</p><p class="prediction-live-form"><b>TI 实战修正：</b>${esc(t.formNote||\'\')} <span>${t.formDelta>0?\'+\':\'\'}${esc(t.formDelta)} 分</span></p>')
add='''

  function renderCallouts() {
    const root=document.getElementById('predictionCallouts');
    if(!root) return;
    const teams=currentTeams();
    const cn=teams.filter(t=>t.cn)[0];
    const hot=[...teams].sort((a,b)=>((b.record.wins-b.record.losses)-(a.record.wins-a.record.losses))||b.score-a.score)[0];
    const pressure=[...teams].sort((a,b)=>((b.record.losses-b.record.wins)-(a.record.losses-a.record.wins))||a.score-b.score)[0];
    root.innerHTML=`
      <div class="prediction-callout"><span>当前冠军首选</span><b>${esc(teams[0]?.team||'—')}</b></div>
      <div class="prediction-callout"><span>首日实战最佳</span><b>${esc(hot?.team||'—')} · ${hot?.record?.wins||0}-${hot?.record?.losses||0}</b></div>
      <div class="prediction-callout"><span>中国队当前最高</span><b>${esc(cn?.team||'—')} · #${cn?.rank||'—'}</b></div>
      <div class="prediction-callout"><span>高压警报</span><b>${esc(pressure?.team||'—')} · ${pressure?.record?.wins||0}-${pressure?.record?.losses||0}</b></div>`;
  }
'''
pos=s.find('\n  function init()')
if pos<0: raise SystemExit('init anchor not found')
s=s[:pos]+add+s[pos:]
s=s.replace('    renderPodium();\n    renderRanking();','    renderPodium();\n    renderRanking();\n    renderCallouts();')
end_anchor="  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);"
pos=s.find(end_anchor)
if pos<0: raise SystemExit('ready anchor not found')
update='''  window.updateTIPredictions = standings => {
    if (Array.isArray(standings) && standings.length) {
      activeRecords={...DAY1_SNAPSHOT};
      for (const r of standings) activeRecords[String(r.team||'')]={wins:Number(r.wins)||0,losses:Number(r.losses)||0,played:Number(r.played)||0};
    }
    renderPodium(); renderRanking(); renderCallouts();
  };

'''
s=s[:pos]+update+s[pos:]
p.write_text(s,encoding='utf-8')

# ---------- v135.css ----------
p=Path('public/v135.css')
s=p.read_text(encoding='utf-8')
s+='''

/* Day 2 homepage refresh */
.day-schedule-stack{display:grid;gap:18px}.day-schedule-block{padding:14px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.018)}.day-schedule-today{border-color:rgba(217,180,94,.18)}.day-schedule-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.day-schedule-head>div:first-child{display:flex;align-items:baseline;gap:9px}.day-schedule-head span{font-size:9px;letter-spacing:.12em;color:#7d8b99;font-weight:900}.day-schedule-head b{font-size:15px}.source-live-note{font-size:9px;color:#84a6c8;border:1px solid rgba(117,174,232,.18);padding:5px 8px;border-radius:999px}.schedule-source-empty{display:flex!important;flex-direction:column;align-items:flex-start!important;gap:5px;padding:18px!important}.schedule-source-empty b{font-size:12px;color:#c8d1da}.schedule-source-empty span{font-size:10px;line-height:1.6;color:#7d8996}.combined-timeline{margin-bottom:22px}.roadmap-bracket-heading{margin-top:12px!important}.event-roadmap-section .bracket{margin-top:8px}.prediction-live-form{color:#a9b5c1!important}.prediction-live-form span{display:inline-block;margin-left:5px;color:#d8bd77;font-weight:900}.prediction-podium-copy p strong{color:#d8bd77}
@media(max-width:600px){.day-schedule-block{padding:10px}.day-schedule-head{align-items:flex-start}.day-schedule-head>div:first-child{flex-direction:column;gap:2px}.source-live-note{display:none}}
'''
p.write_text(s,encoding='utf-8')

# ---------- seed timeline / event format ----------
p=Path('data/seed.json')
d=json.loads(p.read_text(encoding='utf-8'))
d['event']['format']='16 队先进行五轮瑞士轮；8 月 16 日进行 5 场淘汰赛；最终 8 队进入主赛事双败；总决赛 BO5'
for x in d.get('timeline',[]):
    if x['date']=='2026-08-13': x['detail']='首日已结束；赛果与后续对阵均以外部数据源实际发布为准'
    elif x['date']=='2026-08-14': x['detail']='瑞士轮 Day 2；具体对阵与时间由数据源发布后自动同步，不自行推算'
    elif x['date']=='2026-08-15': x['detail']='瑞士轮 Day 3；完成五轮瑞士轮，具体对阵以外部数据源为准'
    elif x['date']=='2026-08-16': x['detail']='5 场淘汰赛，决出最终 8 支主赛事队伍'
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('patched')
