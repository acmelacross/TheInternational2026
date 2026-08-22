const fs=require('fs');
const p='data/seed.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
let n=0;
for (const m of j.matches||[]) {
  const names=(m.teams||[]).map(t=>t.name);
  if (m.startsAt==='2026-08-22T10:10:00+08:00' && names.includes('Team Spirit') && names.includes('Team Liquid')) {
    for (const t of m.teams) {
      if (t.name==='Team Spirit') t.score=2;
      if (t.name==='Team Liquid') t.score=1;
    }
    m.status='finished';
    m.source='blast-confirmed-result';
    n++;
  }
}
if (!n) throw new Error('target match not found');
for (const x of j.timeline||[]) {
  if (x.date==='2026-08-22') {
    const prefix='10:10 Team Spirit 2:1 Team Liquid（败者组第2轮，已结束）；';
    let detail=String(x.detail||'');
    detail=detail.replace(/10:10\s*Team Spirit\s*vs\s*Team Liquid[^；;。]*[；;。]?/g,'');
    detail=detail.replace(/10:10\s*Team Spirit\s*2:1\s*Team Liquid[^；;。]*[；;。]?/g,'');
    x.detail=prefix+detail.trim();
  }
}
fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');
console.log('updated matches',n);
