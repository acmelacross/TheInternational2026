const assert = require('assert');
process.env.PORT = '0';
const mod = require('./server');

assert.equal(mod.normalizeLpDate('2026-08-13 02:00:00'), '2026-08-13T02:00:00.000Z');
assert.equal(mod.normalizeOpponent({name:'Xtreme Gaming',score:'2'},0,'1').name,'Xtreme Gaming');
assert.equal(mod.normalizeOpponent({name:'Xtreme Gaming',score:'2'},0,'1').winner,true);

const lp = mod.normalizeLpMatch({
  match2id:'TI15_R1_A', date:'2026-08-13 02:00:00', bestof:3, finished:1, winner:'1', section:'Swiss Round 1',
  tournament:'The International 2026', parent:'The International/2026',
  match2opponents:[{name:'Team Falcons',score:2},{name:'LGD Gaming',score:1}],
  match2games:[{matchid:'1234567890'},{matchid:'1234567891'}]
});
assert.equal(lp.status,'finished');
assert.equal(lp.teams[0].winner,true);
assert.equal(lp.startsAt,'2026-08-13T02:00:00.000Z');
assert.deepEqual(lp.matchIds,['1234567890','1234567891']);

assert.deepEqual(mod.extractMatchIds([{matchid:'9876543210'},{gameId:9876543211,startTime:1770000000}]),['9876543210','9876543211']);

const detail = mod.normalizeDota2DbGame('1234567890', {
  startTime:'2026-08-13 10:00:00', length:2400, winner:1, team1Score:25, team2Score:18,
  team1:{name:'Xtreme Gaming',side:'radiant',players:[{name:'Ame',heroName:'Morphling',level:25,kills:10,deaths:2,assists:8,lastHits:420,denies:12,goldPerMinute:760,xpPerMinute:810,items:[{name:'butterfly'}]}]},
  team2:{name:'Team Spirit',side:'dire',players:[]},
  heroVeto:{team1:{picks:[{hero:'Morphling'}],bans:[{hero:'Mars'}]},team2:{picks:[{hero:'Puck'}],bans:[{hero:'Chen'}]}}
});
assert.equal(detail.matchId,'1234567890');
assert.equal(detail.team1.players[0].kills,10);
assert.equal(detail.heroVeto.team1.picks[0],'Morphling');

const merged = mod.mergeMatches(
  [{id:'seed', startsAt:'2026-08-13T10:00:00+08:00',teams:[{name:'A'},{name:'B'}],source:'seed'}],
  [{id:'lp', startsAt:'2026-08-13T02:00:00Z',teams:[{name:'A',score:2},{name:'B',score:0}],source:'liquipedia',status:'finished'}]
);
assert.equal(merged.length,1);
assert.equal(merged[0].id,'lp');

const cn = mod.decorateMatch({id:'xg', startsAt:'2026-08-13T13:00:00+08:00', stage:'瑞士轮 · 第1轮', status:'upcoming', teams:[{name:'Team Spirit'},{name:'Xtreme Gaming'}]});
assert.equal(cn.featuredChina,true);
assert.equal(cn.recommendation.score,5);

const final = mod.decorateMatch({id:'gf', startsAt:'2026-08-23T18:00:00+08:00', stage:'总决赛', status:'upcoming', teams:[{name:'A'},{name:'B'}]});
assert.equal(final.recommendation.score,5);


assert.equal(mod.canonicalTeamName('1w Team'),'Iron Wing');
assert.equal(mod.canonicalTeamName('PARIVISION'),'Team VISION');
assert.equal(mod.canonicalTeamName('BetBoom Team'),'BoomBoys');
assert.equal(mod.canonicalTeamName('L1GA TEAM'),'HULIGANI');

console.log('All tests passed.');
process.exit(0);
