#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'data', 'seed.json');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'teams-normal');
const API = 'https://api.opendota.com/api/teams';

const TARGETS = [
  { display: 'Team Falcons', slug: 'team-falcons', aliases: ['Team Falcons', 'Falcons'] },
  { display: 'LGD Gaming', slug: 'lgd-gaming', aliases: ['LGD Gaming', 'LGD', 'PSG.LGD'] },
  { display: 'Iron Wing', slug: 'iron-wing', aliases: ['Iron Wing', 'IRON WING', '1win Team', '1WIN Team', '1win', '1W', 'Tundra Esports', 'Tundra'] },
  { display: 'Nigma Galaxy', slug: 'nigma-galaxy', aliases: ['Nigma Galaxy', 'Nigma'] },
  { display: 'BoomBoys', slug: 'boomboys', aliases: ['BoomBoys', 'BOOMBOYS', 'BetBoom Team', 'BetBoom', 'BB Team'] },
  { display: 'OG', slug: 'og', aliases: ['OG'] },
  { display: 'Team VISION', slug: 'team-vision', aliases: ['TEAM VISION', 'Team VISION', 'PARIVISION', 'Parivision'] },
  { display: 'Team Resilience', slug: 'team-resilience', aliases: ['Team Resilience', 'Resilience'] },
  { display: 'Team Spirit', slug: 'team-spirit', aliases: ['Team Spirit', 'Spirit'] },
  { display: 'Xtreme Gaming', slug: 'xtreme-gaming', aliases: ['Xtreme Gaming', 'Xtreme', 'XG'] },
  { display: 'Team Liquid', slug: 'team-liquid', aliases: ['Team Liquid', 'Liquid'] },
  { display: 'Vici Gaming', slug: 'vici-gaming', aliases: ['Vici Gaming', 'Vici', 'VG'] },
  { display: 'Aurora Gaming', slug: 'aurora-gaming', aliases: ['Aurora Gaming', 'Aurora'] },
  { display: 'GamerLegion', slug: 'gamerlegion', aliases: ['GamerLegion', 'Gamer Legion'] },
  { display: 'Team Yandex', slug: 'team-yandex', aliases: ['Team Yandex', 'Yandex'] },
  { display: 'HULIGANI', slug: 'huligani', aliases: ['HULIGANI', 'Huligani', 'L1GA TEAM', 'L1GA Team', 'L1ga Team', 'L1GA'] },
];

function norm(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeLogoUrl(v) {
  if (!v) return '';
  if (v.startsWith('//')) return `https:${v}`;
  if (v.startsWith('/')) return `https://www.opendota.com${v}`;
  return v;
}

function extFrom(contentType, url) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('image/svg')) return '.svg';
  if (ct.includes('image/webp')) return '.webp';
  if (ct.includes('image/jpeg')) return '.jpg';
  if (ct.includes('image/png')) return '.png';
  const m = String(url || '').match(/\.(png|jpe?g|webp|svg)(?:\?|$)/i);
  return m ? `.${m[1].toLowerCase().replace('jpeg', 'jpg')}` : '.png';
}

function chooseTeam(all, target) {
  const wanted = new Set(target.aliases.map(norm));
  const candidates = all.filter(t => wanted.has(norm(t.name)) || wanted.has(norm(t.tag)));
  candidates.sort((a, b) => {
    const exactA = norm(a.name) === norm(target.display) ? 1 : 0;
    const exactB = norm(b.name) === norm(target.display) ? 1 : 0;
    if (exactA !== exactB) return exactB - exactA;
    const lastA = Number(a.last_match_time || 0);
    const lastB = Number(b.last_match_time || 0);
    if (lastA !== lastB) return lastB - lastA;
    return Number(b.rating || 0) - Number(a.rating || 0);
  });
  return candidates.find(t => normalizeLogoUrl(t.logo_url)) || candidates[0] || null;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const res = await fetch(`${API}?t=${Date.now()}`, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'TI2026-Viewing-Guide/1.3.2' },
  });
  if (!res.ok) throw new Error(`OpenDota teams HTTP ${res.status}`);
  const teams = await res.json();
  if (!Array.isArray(teams)) throw new Error('OpenDota teams response is not an array');

  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  seed.teamAssets ||= {};
  seed.teamAssetMeta ||= {};
  const report = { fetchedAt: new Date().toISOString(), source: API, resolved: {}, missing: [] };

  for (const target of TARGETS) {
    const found = chooseTeam(teams, target);
    const logoUrl = normalizeLogoUrl(found?.logo_url);
    if (!found || !logoUrl) {
      report.missing.push({ display: target.display, aliases: target.aliases });
      console.warn(`MISS ${target.display}`);
      continue;
    }

    const imgRes = await fetch(logoUrl, { headers: { 'User-Agent': 'TI2026-Viewing-Guide/1.3.2' } });
    if (!imgRes.ok) {
      report.missing.push({ display: target.display, sourceTeam: found.name, reason: `logo HTTP ${imgRes.status}` });
      console.warn(`MISS ${target.display}: logo HTTP ${imgRes.status}`);
      continue;
    }

    const buf = Buffer.from(await imgRes.arrayBuffer());
    const ext = extFrom(imgRes.headers.get('content-type'), logoUrl);
    for (const old of fs.readdirSync(OUT_DIR).filter(n => n.startsWith(`${target.slug}.`))) {
      fs.rmSync(path.join(OUT_DIR, old), { force: true });
    }
    const fileName = `${target.slug}${ext}`;
    fs.writeFileSync(path.join(OUT_DIR, fileName), buf);
    seed.teamAssets[target.display] = `/assets/teams-normal/${fileName}`;
    report.resolved[target.display] = {
      sourceTeam: found.name,
      tag: found.tag || '',
      teamId: found.team_id ?? null,
      logoUrl,
      local: seed.teamAssets[target.display],
      bytes: buf.length,
    };
    console.log(`OK   ${target.display} <- ${found.name} (${buf.length} bytes)`);
  }

  seed.teamAssetMeta.localCache = true;
  seed.teamAssetMeta.source = 'OpenDota team logo_url';
  seed.teamAssetMeta.sourceNote = '原色战队 Logo 由 scripts/refresh-team-logos.js 拉取并缓存到项目本地；页面运行时不直接请求外部 Logo。';
  seed.teamAssetMeta.directory = '/assets/teams-normal/';
  seed.teamAssetMeta.refreshedAt = report.fetchedAt;

  fs.writeFileSync(SEED_PATH, `${JSON.stringify(seed, null, 2)}\n`);
  fs.writeFileSync(path.join(OUT_DIR, 'SOURCE.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Resolved ${Object.keys(report.resolved).length}/${TARGETS.length}`);
  if (report.missing.length) console.log('Missing:', report.missing.map(x => x.display).join(', '));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
