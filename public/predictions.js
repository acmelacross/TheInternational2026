(() => {
  'use strict';

  const TEAMS = [
    { rank:1, team:'Team VISION', alt:'TEAM VISION / PARIVISION', score:96, range:'冠军 / 亚军', stars:5, cn:false, logo:'/assets/teams-normal/team-vision.png', reason:'赛季末状态达到峰值，Satanic 的一号位稳定性极高，Noticed 加入后中后期执行和团战完整度明显提升。', risk:'赛前第一热门，针对压力最大；越被研究，BP 与临场调整越重要。', tag:'冠军第一选择' },
    { rank:2, team:'Team Yandex', alt:'Team Yandex', score:94, range:'冠军 / 前3', stars:5, cn:false, logo:'/assets/teams-normal/team-yandex.png', reason:'全年最稳定的强队之一，瑞士轮最需要的就是低失误和持续输出；Saksa 的大赛经验进一步提高下限。', risk:'面对顶级强队时上限略依赖中期节奏，一旦前中期被拖住，比赛会更难。', tag:'最稳主赛事候选' },
    { rank:3, team:'BoomBoys', alt:'BoomBoys / BB Team', score:92, range:'前3', stars:5, cn:false, logo:'/assets/teams-normal/boomboys.png', reason:'gpk + Save- 的中前期压迫力强，阵容英雄池深，连续 BO3 换对手的环境里 BP 很难被完全猜透。', risk:'如果前期没有打出优势，部分比赛会进入自己不舒服的节奏。', tag:'冠军候选' },
    { rank:4, team:'Team Liquid', alt:'Team Liquid', score:90, range:'前4', stars:4, cn:false, logo:'/assets/teams-normal/team-liquid.png', reason:'Nisha、Ace、Boxi、tOfu 的大赛经验和中后期处理能力很适合 TI，比赛越往后越难对付。', risk:'本赛季状态波动明显，峰值很高，但也存在突然失速的场次。', tag:'决赛级上限' },
    { rank:5, team:'Team Falcons', alt:'Team Falcons', score:89, range:'前6，存在夺冠可能', stars:4, cn:false, logo:'/assets/teams-normal/team-falcons.png', reason:'卫冕冠军核心阵容仍在，skiter / Malr1ne / ATF / Cr1t- / Sneyking 的大赛抗压能力无需证明。', risk:'2026 常规赛事状态低于去年，如果小组阶段继续偏慢，排名可能落到 5–8。', tag:'最大爆冷夺冠候选' },
    { rank:6, team:'Aurora Gaming', alt:'Aurora Gaming', score:87, range:'前6', stars:4, cn:false, logo:'/assets/teams-normal/aurora-gaming.png', reason:'多次打入顶级赛事决赛，Nightfall / Mikoto / Ws / Mira / kaori 的纸面配置已经具备冠军级强度。', risk:'最大疑问仍是决赛转化率，关键局的最后一步需要证明。', tag:'稳定前列' },
    { rank:7, team:'Iron Wing', alt:'Iron Wing / 1w', score:85, range:'前8', stars:4, cn:false, logo:'/assets/teams-normal/iron-wing.png', reason:'Pure / bzm / 33 / Ari / Whitemon 的体系开发能力很强，尤其 33 在长赛程版本理解中的价值非常高。', risk:'近期状态有回落，如果瑞士轮前两轮慢热，容易掉进高压配对。', tag:'体系型强队' },
    { rank:8, team:'Team Spirit', alt:'Team Spirit', score:84, range:'前8，爆种可前3', stars:4, cn:false, logo:'/assets/teams-normal/team-spirit.png', reason:'Yatoro + Larl + Collapse 的 TI 经验是巨大加成；这种长赛程队伍越打越懂版本时，Spirit 往往会变强。', risk:'2026 常规成绩不像冠军队，必须尽快找到版本答案。', tag:'最不敢低估' },
    { rank:9, team:'Vici Gaming', alt:'Vici Gaming', score:83, range:'7–10', stars:3, cn:true, logo:'/assets/teams-normal/vici-gaming.png', reason:'近期国际赛表现明显抬升，shiro / Xm / Bach / XinQ / y` 的阵容既有经验也有爆发力，是目前最值得看好的中国队之一。', risk:'面对欧洲顶级队时稳定性仍需证明，连续强强对话会考验 BP 深度。', tag:'最大黑马' },
    { rank:10, team:'Xtreme Gaming', alt:'Xtreme Gaming', score:82, range:'7–10，爆种可前4', stars:3, cn:true, logo:'/assets/teams-normal/xtreme-gaming.png', reason:'Ame / NothingToSay / Xxs / fy / xNova 的大赛经验极其豪华，哪怕近期状态一般，到了 TI 主舞台也不能低估。', risk:'最近状态偏弱，瑞士轮阶段必须尽快建立信心和节奏。', tag:'最可能严重低估' },
    { rank:11, team:'LGD Gaming', alt:'LGD Gaming', score:79, range:'9–12', stars:3, cn:false, logo:'/assets/teams-normal/lgd-gaming.png', reason:'Topson 临时加入让上限突然拉高，个人能力和大赛经验都足够强，理论天花板远高于当前排名。', risk:'临时换人导致磨合时间极短，中野联动、沟通和 BP 适配是最大不确定因素。', tag:'最大变量' },
    { rank:12, team:'Nigma Galaxy', alt:'Nigma Galaxy', score:76, range:'9–13', stars:3, cn:false, logo:'/assets/teams-normal/nigma-galaxy.png', reason:'SumaiL + GH 仍具备改变比赛的能力，遇到状态不稳的强队时完全有爆冷机会。', risk:'整个赛季 Tier-1 连续赢强队的样本不足，持续性是问题。', tag:'八强边缘' },
    { rank:13, team:'OG', alt:'OG', score:72, range:'9–14', stars:2, cn:false, logo:'/assets/teams-normal/og.png', reason:'Natsumi / Yopaj / Raven / TIMS / skem 有很强的东南亚节奏和爆冷能力，单场 BO3 不容小看。', risk:'面对顶级队连续高质量对局时，整体稳定性和硬实力仍稍弱。', tag:'爆冷型' },
    { rank:14, team:'GamerLegion', alt:'GamerLegion', score:68, range:'12–16', stars:2, cn:false, logo:'/assets/teams-normal/gamerlegion.png', reason:'地区预选表现很强，打顺时执行直接、节奏明确，前两轮有机会靠陌生度制造惊喜。', risk:'进入世界 Tier-1 环境后成绩偏后，强队密度越高越难维持胜率。', tag:'地区黑马' },
    { rank:15, team:'Team Resilience', alt:'Team Resilience', score:66, range:'12–16', stars:2, cn:true, logo:'/assets/teams-normal/team-resilience.png', reason:'中国区预选第一，niu + planet 具备国际赛经验，资料少反而让对手前期不容易准备。', risk:'国际 Tier-1 样本最少之一，真实上限和抗压能力需要在 TI 现场验证。', tag:'神秘黑马' },
    { rank:16, team:'HULIGANI', alt:'HULIGANI', score:61, range:'13–16', stars:1, cn:false, logo:'/assets/teams-normal/huligani.png', reason:'能从欧洲预选杀出说明有硬实力，打法韧性不差。', risk:'全年主要在 Tier-2 环境，面对 TI 这种顶级阵容密度时最容易被连续压制。', tag:'高压挑战者' }
  ];

  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const starText = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  function logo(t, cls='prediction-logo') {
    return `<span class="${cls}"><img src="${esc(t.logo)}" alt="${esc(t.team)}" loading="lazy" decoding="async"><i>${esc(t.team.slice(0,2).toUpperCase())}</i></span>`;
  }

  function renderPodium() {
    const root = document.getElementById('predictionPodium');
    if (!root) return;
    root.innerHTML = TEAMS.slice(0,4).map(t => `
      <article class="prediction-podium-card rank-${t.rank}">
        <div class="prediction-rank-badge">${t.rank <= 3 ? ['','🥇','🥈','🥉'][t.rank] : '#4'}</div>
        ${logo(t, 'prediction-podium-logo')}
        <div class="prediction-podium-copy">
          <div class="prediction-team-line"><h3>${esc(t.alt)}</h3>${t.cn ? '<span class="prediction-cn">cn</span>' : ''}</div>
          <div class="prediction-score"><b>${t.score}</b><span>综合评分</span></div>
          <div class="prediction-stars">${starText(t.stars)}</div>
          <div class="prediction-range">预测区间：${esc(t.range)}</div>
          <p>${esc(t.reason)}</p>
          <span class="prediction-tag">${esc(t.tag)}</span>
        </div>
      </article>`).join('');
  }

  function renderRanking() {
    const root = document.getElementById('predictionRanking');
    if (!root) return;
    root.innerHTML = TEAMS.map(t => `
      <article class="prediction-row ${t.cn ? 'prediction-row-cn' : ''}">
        <div class="prediction-row-rank">${String(t.rank).padStart(2,'0')}</div>
        ${logo(t)}
        <div class="prediction-row-main">
          <div class="prediction-team-line"><h3>${esc(t.alt)}</h3>${t.cn ? '<span class="prediction-cn">cn</span>' : ''}<span class="prediction-tag small">${esc(t.tag)}</span></div>
          <div class="prediction-row-meta"><span>评分 <b>${t.score}</b></span><span>${starText(t.stars)}</span><span>区间 ${esc(t.range)}</span></div>
          <p><b>看好理由：</b>${esc(t.reason)}</p>
          <p class="prediction-risk"><b>主要风险：</b>${esc(t.risk)}</p>
        </div>
      </article>`).join('');
  }

  function init() {
    renderPodium();
    renderRanking();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
