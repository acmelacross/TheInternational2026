const state = { data: null, filter: 'all', countdownTimer: null, nextTimer: null, focus: false };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CHINA = new Set(['xtreme gaming', 'team resilience', 'vici gaming']);
const TEAM_ALIASES = {
  '1w team': 'Iron Wing', '1win team': 'Iron Wing', 'tundra esports': 'Iron Wing',
  'parivision': 'Team VISION', 'team vision': 'Team VISION',
  'betboom team': 'BoomBoys', 'bb team': 'BoomBoys',
  'l1ga team': 'HULIGANI', 'aurora': 'Aurora Gaming'
};
const fmtDate = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', weekday: 'short' });
const fmtFull = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtUpdated = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function shanghaiDateKey(v) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(v));
  const o = Object.fromEntries(p.map(x => [x.type, x.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
function todayShanghaiKey() { return shanghaiDateKey(new Date()); }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function normalizeName(name) { return String(name || '').trim().toLowerCase(); }
function canonicalName(name) { return TEAM_ALIASES[normalizeName(name)] || String(name || ''); }
function isChinaTeam(name) { return CHINA.has(normalizeName(canonicalName(name))); }
function isChinaMatch(m) { return (m.teams || []).some(t => isChinaTeam(t?.name)); }
function cnBadge() { return '<span class="cn-badge">cn</span>'; }
function statusText(s) { return ({ live: '进行中', finished: '已结束', upcoming: '未开始', tbd: '待定' })[s] || s || '未开始'; }
function scoreText(t) { return t?.score == null ? '–' : escapeHtml(t.score); }
function initials(name) { const n = String(name || '').replace(/^Team\s+/i, '').trim(); return n.split(/\s+/).map(x => x[0]).join('').slice(0, 3).toUpperCase() || 'TI'; }
function detailsHref(m) { return `/match.html?id=${encodeURIComponent(String(m.id))}`; }

function teamAsset(name) {
  const assets = state.data?.teamAssets || {};
  const canonical = canonicalName(name);
  if (assets[canonical]) return assets[canonical];
  const wanted = normalizeName(canonical);
  const hit = Object.entries(assets).find(([k]) => normalizeName(k) === wanted);
  return hit?.[1] || '';
}
function teamLogoHtml(name, cls = 'team-logo') {
  const src = teamAsset(name);
  const alt = escapeHtml(canonicalName(name) || name || 'Team');
  if (!src) return `<span class="${cls} logo-fallback">${escapeHtml(initials(name))}</span>`;
  return `<span class="${cls}"><img src="${escapeHtml(src)}" alt="${alt}" loading="lazy" decoding="async" onerror="this.parentElement.classList.add('logo-broken');this.remove()"><i>${escapeHtml(initials(name))}</i></span>`;
}
function teamNameHtml(name) {
  return `${teamLogoHtml(name, 'team-logo small-logo')}<span class="team-name-text">${isChinaTeam(name) ? cnBadge() : ''}${escapeHtml(name || '待定')}</span>`;
}
function ratingFor(m) {
  if (m.recommendation) return m.recommendation;
  let score = 3.5, reason = '瑞士轮常规场';
  const st = String(m.stage || '').toLowerCase();
  if (m.status === 'live') { score = 5; reason = '正在进行'; }
  if (isChinaMatch(m)) { score = 5; reason = '中国队重点场'; }
  if (/生死|淘汰|elimination|lower|upper|main event/.test(st)) { score = Math.max(score, 4.5); if (!isChinaMatch(m)) reason = '晋级/淘汰关键场'; }
  if (/grand|总决赛/.test(st)) { score = 5; reason = '总决赛'; }
  return { score, reason };
}
function starText(score) { const n = Math.round(score); return '★'.repeat(n) + '☆'.repeat(5 - n); }

async function load(force = false) {
  const btn = $('#refreshBtn');
  if (btn) { btn.disabled = true; btn.textContent = force ? '刷新中...' : '加载中...'; }
  try {
    const r = await fetch(force ? '/api/refresh' : '/api/ti2026', { method: force ? 'POST' : 'GET', cache: 'no-store' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || j.error || `HTTP ${r.status}`); }
    state.data = await r.json();
    render();
  } catch (e) {
    console.error(e);
    $('#dataDetail').textContent = `读取失败：${e.message}`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '刷新赛程'; }
  }
}

function render() {
  const d = state.data; if (!d) return;
  const src = String(d.source||'').includes('opendota') ? '赛程 + OpenDota 比分' : d.source === 'liquipedia' ? 'Liquipedia 自动更新' : d.source === 'public+seed' ? '公共赛程 + 内置' : '内置赛程';
  $('#sourceBadge').textContent = src;
  $('#sourceBadge').title = (d.dataStatus?.errors || []).join('\n');
  $('#updatedAt').textContent = fmtUpdated.format(new Date(d.generatedAt));
  $('#dataDetail').textContent = String(d.source||'').includes('opendota') ? `比分：OpenDota · 约 ${d.dataStatus?.liveRefreshSeconds||120} 秒同步` : d.source === 'liquipedia' ? 'Liquipedia LPDB v3 已连接' : d.dataStatus?.liquipediaConfigured ? 'Liquipedia 暂不可用，已自动降级' : '未配置 Liquipedia Key，当前使用已公布赛程';
  renderChina();
  renderToday();
  renderStandings();
  renderBracket();
  renderFullSchedule();
  renderTimeline();
  renderStreams();
  renderTeams();
  setupCountdowns();
  updateNotificationState();
}

function getDisplayTodayKey() {
  const real = todayShanghaiKey();
  const keys = [...new Set((state.data?.matches || []).map(m => shanghaiDateKey(m.startsAt)))].sort();
  if (keys.includes(real)) return real;
  return keys.find(k => k >= real) || keys[keys.length - 1] || real;
}
function renderStreams() {
  const s = state.data.streams || [];
  $('#streamGrid').innerHTML = s.length ? s.map(x => `<a class="stream-card" target="_blank" rel="noopener" href="${escapeHtml(x.url)}"><span class="stream-type">${escapeHtml(x.type || '直播')}</span><strong>${escapeHtml(x.name)}</strong><span class="stream-note">${escapeHtml(x.note || '')}</span><span class="stream-go">打开直播 ↗</span></a>`).join('') : '<div class="empty">直播入口等待更新</div>';
}
function countdownBox(m, compact = false) {
  return `<div class="match-countdown ${compact ? 'compact-countdown' : ''}"><span>${m.status === 'finished' ? '比赛状态' : '距开赛'}</span><b data-match-countdown="${escapeHtml(m.id)}">--:--:--</b></div>`;
}
function matchCard(m) {
  const a = m.teams?.[0] || { name: '待定' }, b = m.teams?.[1] || { name: '待定' };
  const rec = ratingFor(m), cn = isChinaMatch(m);
  const link = m.streamUrl ? `<a class="watch-link" target="_blank" rel="noopener" href="${escapeHtml(m.streamUrl)}">直播 ↗</a>` : '';
  const reminder = m.status === 'upcoming' ? `<button class="mini-btn" data-remind="${escapeHtml(m.id)}">⏰ 提醒</button>` : '';
  return `<article class="match-card ${cn ? 'cn-match' : ''}">
    ${cn ? '<div class="cn-corner">中国队</div>' : ''}
    <div class="match-top"><div><span class="match-time">${fmtTime.format(new Date(m.startsAt))}</span> <span class="stream-pill">${m.stream ? `${escapeHtml(m.stream)}流 · ` : ''}BO${m.bestOf || 3}</span><span class="rating" title="${escapeHtml(rec.reason)}"><b>${rec.score}</b> ${starText(rec.score)}</span></div><span class="status ${escapeHtml(m.status)}">${statusText(m.status)}</span></div>
    ${countdownBox(m)}
    <div class="match-teams">
      <div class="team-line ${a.winner ? 'winner' : ''} ${isChinaTeam(a.name) ? 'cn-team' : ''}"><span class="team-name">${teamNameHtml(a.name)}</span><strong>${scoreText(a)}</strong></div>
      <div class="team-line ${b.winner ? 'winner' : ''} ${isChinaTeam(b.name) ? 'cn-team' : ''}"><span class="team-name">${teamNameHtml(b.name)}</span><strong>${scoreText(b)}</strong></div>
    </div>
    <div class="match-bottom"><span class="match-stage">${escapeHtml(m.stage || 'The International 2026')} · ${escapeHtml(rec.reason)}</span><span class="match-actions">${reminder}${link}<a class="detail-link" href="${detailsHref(m)}">比赛详情 →</a></span></div>
  </article>`;
}
function bindReminderButtons() {
  $$('[data-remind]').forEach(b => b.addEventListener('click', () => {
    const m = (state.data.matches || []).find(x => String(x.id) === b.dataset.remind); if (m) scheduleReminder(m, b);
  }));
}
function renderToday() {
  const key = getDisplayTodayKey(), ms = state.data.matches.filter(m => shanghaiDateKey(m.startsAt) === key);
  $('#todayChip').textContent = ms[0] ? fmtDate.format(new Date(ms[0].startsAt)) : key;
  $('#todayMatches').innerHTML = ms.length ? ms.map(matchCard).join('') : '<div class="empty">当天暂无已公布赛程</div>';
  bindReminderButtons();
}
function renderChina() {
  const now = Date.now();
  let ms = (state.data.matches || []).filter(isChinaMatch).filter(m => m.status === 'live' || m.status === 'upcoming' || Date.parse(m.startsAt) > now - 8 * 3600000).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  if (!ms.length) ms = (state.data.matches || []).filter(isChinaMatch).slice(-6);
  $('#chinaMatches').innerHTML = ms.length ? ms.slice(0, 6).map(matchCard).join('') : '<div class="empty">中国战队下一轮对阵尚未生成</div>';
  bindReminderButtons();
}
function renderStandings() {
  const rows = state.data.standings || [];
  $('#standings').innerHTML = rows.map((r, i) => `<div class="stand-row ${isChinaTeam(r.team) ? 'cn-row' : ''}"><span class="stand-rank">${String(i + 1).padStart(2, '0')}</span>${teamLogoHtml(r.team, 'stand-logo')}<b>${isChinaTeam(r.team) ? cnBadge() : ''}${escapeHtml(r.team)}</b><span class="record ${r.wins >= 4 ? 'good' : r.losses >= 4 ? 'bad' : ''}">${r.wins}-${r.losses}</span><span class="muted">${r.played} 场</span></div>`).join('');
}
function bracketTeam(t) {
  return `<span class="bracket-team-name">${teamLogoHtml(t?.name, 'bracket-logo')}${isChinaTeam(t?.name) ? '<em>🇨🇳</em>' : ''}${escapeHtml(t?.name || '待定')}</span><span>${scoreText(t)}</span>`;
}
function renderBracket() {
  const main = (state.data.matches || []).filter(m => Date.parse(m.startsAt) >= Date.parse('2026-08-20T00:00:00+08:00'));
  const cols = [{ name: '8 月 20 日 · 主赛事 Day 1', date: '2026-08-20' }, { name: '8 月 21 日 · Day 2', date: '2026-08-21' }, { name: '8 月 22 日 · Day 3', date: '2026-08-22' }, { name: '8 月 23 日 · 决赛日', date: '2026-08-23' }];
  $('#bracket').innerHTML = cols.map(c => {
    const ms = main.filter(m => shanghaiDateKey(m.startsAt) === c.date);
    const body = ms.length ? ms.map(m => { const a = m.teams?.[0] || {}, b = m.teams?.[1] || {}; return `<a href="${detailsHref(m)}" class="bracket-match ${isChinaMatch(m) ? 'cn-bracket' : ''}"><b>${bracketTeam(a)}</b><b>${bracketTeam(b)}</b><small>${fmtTime.format(new Date(m.startsAt))} · ${escapeHtml(m.stage || '主赛事')} · BO${m.bestOf || 3}</small>${countdownBox(m, true)}</a>`; }).join('') : '<div class="bracket-empty">对阵等待瑞士轮结果产生。Liquipedia 一旦发布主赛事赛程，这里会自动替换为真实对阵和比分。</div>';
    return `<div class="bracket-col"><div class="bracket-head">${c.name}</div>${body}</div>`;
  }).join('');
}
function renderFullSchedule() {
  let ms = state.data.matches || [];
  if (state.filter !== 'all') ms = ms.filter(m => m.status === state.filter);
  const g = new Map();
  for (const m of ms) { const k = shanghaiDateKey(m.startsAt); if (!g.has(k)) g.set(k, []); g.get(k).push(m); }
  $('#fullSchedule').innerHTML = [...g.entries()].map(([k, list]) => `<div class="day-block"><div class="day-head"><span class="day-title">${fmtDate.format(new Date(list[0].startsAt))}</span><span class="muted">${list.length} 场</span></div><div class="day-list">${list.map(scheduleRow).join('')}</div></div>`).join('') || '<div class="empty">这个筛选条件下暂无比赛</div>';
}
function scheduleTeam(name, align = '') {
  return `<span class="schedule-team ${align}">${teamLogoHtml(name, 'schedule-logo')}${isChinaTeam(name) ? '<em>🇨🇳</em>' : ''}<b>${escapeHtml(name || '待定')}</b></span>`;
}
function scheduleRow(m) {
  const a = m.teams?.[0] || { name: '待定' }, b = m.teams?.[1] || { name: '待定' }, rec = ratingFor(m);
  const score = (a.score != null || b.score != null) ? `${scoreText(a)} : ${scoreText(b)}` : 'VS';
  return `<div class="schedule-row ${isChinaMatch(m) ? 'cn-schedule' : ''}">
    <b class="schedule-time">${fmtTime.format(new Date(m.startsAt))}</b>
    <span class="stream-cell muted">${m.stream ? `${escapeHtml(m.stream)}流` : ''}</span>
    <div class="versus">${scheduleTeam(a.name)}<span class="score-vs">${score}</span>${scheduleTeam(b.name, 'right')}</div>
    <span class="stage-cell muted">BO${m.bestOf || 3}</span><span class="schedule-rating">${rec.score} ★</span>
    <span class="row-countdown" data-match-countdown="${escapeHtml(m.id)}">--:--:--</span>
    <a class="row-detail" href="${detailsHref(m)}">详情</a>
  </div>`;
}
function renderTimeline() { $('#timeline').innerHTML = (state.data.timeline || []).map(x => `<div class="timeline-item"><div class="timeline-date">${escapeHtml(x.date.slice(5).replace('-', ' / '))}</div><div class="timeline-title">${escapeHtml(x.title)}</div><div class="timeline-detail">${escapeHtml(x.detail)}</div></div>`).join(''); }
function renderTeams() {
  const ts = state.data.teams || []; $('#teamCount').textContent = `${ts.length} 支`;
  $('#teams').innerHTML = ts.map(n => `<div class="team-card ${isChinaTeam(n) ? 'cn-team-card' : ''}">${teamLogoHtml(n, 'team-card-logo')}<div class="team-card-copy"><span>${isChinaTeam(n) ? cnBadge() : ''}${escapeHtml(n)}</span><small>${isChinaTeam(n) ? '中国战队' : 'TI2026 参赛战队'}</small></div></div>`).join('');
}

function nextUpcoming() {
  const now = Date.now();
  return (state.data?.matches || []).filter(m => m.status !== 'finished' && m.status !== 'tbd' && Date.parse(m.startsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
}
function formatDiff(diff) {
  diff = Math.max(0, diff);
  const days = Math.floor(diff / 86400000), h = Math.floor(diff % 86400000 / 3600000), m = Math.floor(diff % 3600000 / 60000), s = Math.floor(diff % 60000 / 1000);
  return (days ? `${days}天 ` : '') + `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function matchCountdownText(m, now = Date.now()) {
  if (m.status === 'finished') return '已结束';
  if (m.status === 'live') return 'LIVE';
  const diff = Date.parse(m.startsAt) - now;
  if (!Number.isFinite(diff)) return '时间待定';
  if (diff <= 0) return '已到开赛时间';
  return formatDiff(diff);
}
function tickCountdowns() {
  if (!state.data) return;
  const now = Date.now();
  const map = new Map((state.data.matches || []).map(m => [String(m.id), m]));
  $$('[data-match-countdown]').forEach(el => { const m = map.get(el.dataset.matchCountdown); if (m) { el.textContent = matchCountdownText(m, now); el.classList.toggle('countdown-live', m.status === 'live'); } });
  const live = (state.data.matches || []).find(m => m.status === 'live');
  const up = nextUpcoming();
  if (live) { $('#countdownLabel').textContent = '比赛进行中'; $('#countdown').textContent = 'LIVE'; $('#nextMatch').textContent = `${live.teams?.[0]?.name || '待定'} vs ${live.teams?.[1]?.name || '待定'}`; }
  else if (!up) { $('#countdownLabel').textContent = '赛事状态'; $('#countdown').textContent = '—'; $('#nextMatch').textContent = '当前没有未来赛程'; }
  else { const diff = Date.parse(up.startsAt) - now; $('#countdownLabel').textContent = diff > 86400000 ? '距离下一比赛日' : '距离下一场'; $('#countdown').textContent = formatDiff(diff); $('#nextMatch').textContent = `${fmtFull.format(new Date(up.startsAt))} · ${up.teams?.[0]?.name || '待定'} vs ${up.teams?.[1]?.name || '待定'}`; }
}
function setupCountdowns() { clearInterval(state.countdownTimer); tickCountdowns(); state.countdownTimer = setInterval(tickCountdowns, 1000); }

async function ensureNotification() { if (!('Notification' in window)) return false; if (Notification.permission === 'granted') return true; if (Notification.permission === 'denied') return false; return await Notification.requestPermission() === 'granted'; }
function reminderKey(id) { return `ti2026-reminder:${id}`; }
async function scheduleReminder(m, button) {
  const ok = await ensureNotification(); if (!ok) { alert('浏览器没有授予通知权限。你仍可以使用页面倒计时。'); updateNotificationState(); return; }
  const at = Date.parse(m.startsAt) - 10 * 60 * 1000;
  if (at <= Date.now()) { new Notification('TI2026 即将开赛', { body: `${m.teams?.[0]?.name || '待定'} vs ${m.teams?.[1]?.name || '待定'}` }); return; }
  localStorage.setItem(reminderKey(m.id), JSON.stringify({ id: m.id, at, startsAt: m.startsAt, teams: m.teams })); if (button) button.textContent = '✓ 已提醒'; armLocalReminders(); updateNotificationState();
}
function armLocalReminders() {
  clearTimeout(state.nextTimer); const items = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k?.startsWith('ti2026-reminder:')) continue; try { const x = JSON.parse(localStorage.getItem(k)); if (x.at > Date.now()) items.push({ k, ...x }); else localStorage.removeItem(k); } catch {} }
  items.sort((a, b) => a.at - b.at); const n = items[0]; if (!n) return;
  state.nextTimer = setTimeout(() => { if (Notification.permission === 'granted') new Notification('TI2026 10 分钟后开赛', { body: `${n.teams?.[0]?.name || '待定'} vs ${n.teams?.[1]?.name || '待定'}` }); localStorage.removeItem(n.k); armLocalReminders(); updateNotificationState(); }, Math.min(n.at - Date.now(), 2147483000));
}
function updateNotificationState() {
  const el = $('#notificationState'); if (!el) return; if (!('Notification' in window)) { el.textContent = '浏览器不支持'; return; }
  const count = Object.keys(localStorage).filter(k => k.startsWith('ti2026-reminder:')).length;
  el.textContent = Notification.permission === 'granted' ? `已授权 · ${count} 个提醒` : `${Notification.permission === 'denied' ? '已拒绝' : '未授权'} · 每场倒计时可用`;
}
function toggleFocus() {
  state.focus = !state.focus;
  document.body.classList.toggle('focus-mode', state.focus);
  $('#focusBtn').textContent = state.focus ? '退出观赛模式' : '观赛模式';
  $('#mobileFocusBtn').textContent = state.focus ? '退出模式' : '观赛模式';
}
function setupSectionNav() {
  const navLinks = $$('.section-nav a');
  navLinks.forEach(a => a.addEventListener('click', () => navLinks.forEach(x => x.classList.toggle('clicked', x === a))));
  const targets = navLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const obs = new IntersectionObserver(entries => {
    const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${visible.target.id}`));
  }, { rootMargin: '-130px 0px -60% 0px', threshold: [0.05, 0.2, 0.5] });
  targets.forEach(t => obs.observe(t));
}

$('#refreshBtn').addEventListener('click', () => load(true));
$('#focusBtn').addEventListener('click', toggleFocus);
$('#mobileFocusBtn').addEventListener('click', toggleFocus);
$('#remindNextBtn').addEventListener('click', () => { const m = nextUpcoming(); if (m) scheduleReminder(m, $('#remindNextBtn')); });
$$('.filter').forEach(btn => btn.addEventListener('click', () => { $$('.filter').forEach(b => b.classList.remove('active')); btn.classList.add('active'); state.filter = btn.dataset.filter; renderFullSchedule(); tickCountdowns(); }));
$$('[data-jump]').forEach(b => b.addEventListener('click', () => document.getElementById(b.dataset.jump)?.scrollIntoView({ behavior: 'smooth' })));
$('#backTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
window.addEventListener('scroll', () => $('#backTop').classList.toggle('show', window.scrollY > 700), { passive: true });
setupSectionNav();
armLocalReminders();
load(false);
setInterval(() => load(false), 60 * 1000);
