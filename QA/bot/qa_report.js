/* =====================================================================
   결과 테이블 · 상세 타임라인 차트 · 집계 · 내보내기 (qa_harness.html 전용)
   ===================================================================== */
const RES_COLS=[
  ['scenario','시나리오'],['run','런'],['res','결과'],['time','생존(s)'],
  ['level','Lv'],['kills','킬'],['execs','처형'],['dtpm','받은피해/분'],
  ['nearDeath','빈사'],['revives','부활'],['hpLow','HP저점%'],
  ['dps','가한DPS'],['topWeapon','딜1위 무기'],['seed','시드'],
];

function clearResults(){
  const t=document.getElementById('resTable');
  t.querySelector('thead').innerHTML='<tr>'+RES_COLS.map(c=>`<th>${c[1]}</th>`).join('')+'</tr>';
  t.querySelector('tbody').innerHTML='';
  const d=document.getElementById('detail'); d.style.display='none'; d.innerHTML='';
  const old=document.getElementById('agg'); if(old) old.remove();
}

function fmtRow(r){
  if(r.error) return {scenario:r.job.scenarioName||r.job.scenario, run:r.job.runIdx+1,
    res:'ERROR', time:'-',level:'-',kills:'-',execs:'-',dtpm:'-',nearDeath:'-',
    revives:'-',hpLow:'-',dps:'-',topWeapon:String(r.error).slice(0,30), seed:r.job.seed, _err:true};
  const s=r.summary;
  return {
    scenario:r.job.scenarioName, run:r.job.runIdx+1,
    res:s.outcome==='died'?'사망':(s.outcome==='survived'?'생존★':'상한도달'),
    time:s.time, level:s.level, kills:s.kills, execs:s.executions,
    dtpm:s.dmgTakenPerMin, nearDeath:s.nearDeathCount, revives:s.revives,
    hpLow:s.hpLowestPct, dps:s.dpsDealt, topWeapon:s.topWeapon||'-', seed:r.job.seed,
    _dead:s.outcome==='died',
  };
}

function addResultRow(result,idx){
  const tb=document.querySelector('#resTable tbody');
  if(!tb.parentElement.querySelector('thead tr')) clearResults();
  const v=fmtRow(result);
  const tr=document.createElement('tr');
  tr.className=v._err?'dead':(v._dead?'dead':'alive');
  tr.innerHTML=RES_COLS.map(c=>`<td class="${c[0]}">${v[c[0]]}</td>`).join('');
  tr.onclick=()=>showDetail(result);
  tb.appendChild(tr);
}

/* ── 상세: HP/적수/DPS 타임라인 스파크라인 + 이벤트 로그 ── */
function spark(cv,samples,key,color,maxOverride){
  const ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
  ctx.clearRect(0,0,W,H);
  if(!samples.length) return;
  const max=maxOverride||Math.max(1,...samples.map(s=>s[key]));
  ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();
  samples.forEach((s,i)=>{
    const x=i/(samples.length-1||1)*(W-8)+4, y=H-4-(s[key]/max)*(H-8);
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);
  });
  ctx.stroke();
  ctx.fillStyle='#5f7a76';ctx.font='9px Consolas';
  ctx.fillText(key+' (max '+Math.round(max)+')',6,10);
}

function showDetail(r){
  const d=document.getElementById('detail');
  if(r.error){ d.style.display='block'; d.innerHTML='<h3>ERROR</h3><div class="ev">'+r.error+'</div>'; return; }
  d.style.display='block';
  d.innerHTML=`<h3>[${r.job.scenarioName}] run ${r.job.runIdx+1} · seed ${r.job.seed} — ${r.summary.outcome} @ ${r.summary.time}s</h3>`;
  const row=document.createElement('div'); row.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
  for(const [key,color,mx] of [['hp','#1cf0d4',r.summary.maxHp],['enemies','#ff2b4e'],['dmgTakenDelta','#ffc63a'],['dmgDealtDelta','#3aa0ff']]){
    const cv=document.createElement('canvas'); cv.width=300; cv.height=64;
    spark(cv,r.samples||[],key,color,mx); row.appendChild(cv);
  }
  d.appendChild(row);
  /* 무기 딜 지분 */
  if(r.summary.weaponDamage){
    const wd=Object.entries(r.summary.weaponDamage).sort((a,b)=>b[1]-a[1]);
    const tot=wd.reduce((a,[,v])=>a+v,0)||1;
    const div=document.createElement('div'); div.style.cssText='margin:8px 0;font-size:11px';
    div.innerHTML='<b style="color:var(--gold)">무기 딜 지분</b><br>'+wd.map(([k,v])=>
      `${k} <span class="bar" style="width:${(v/tot*140)|0}px"></span> ${(v/tot*100).toFixed(1)}% (${Math.round(v)})`).join('<br>');
    d.appendChild(div);
  }
  const ev=document.createElement('div'); ev.className='ev';
  ev.innerHTML=(r.events||[]).map(e=>`<span class="t">[${e.t}s]</span> ${e.type} ${e.detail||''}`).join('<br>')||'(이벤트 없음)';
  d.appendChild(ev);
  d.scrollIntoView({behavior:'smooth'});
}

/* ── 시나리오별 집계 ── */
function renderAggregate(results){
  const ok=results.filter(r=>!r.error);
  if(!ok.length) return;
  const by={};
  for(const r of ok){ (by[r.job.scenarioName]=by[r.job.scenarioName]||[]).push(r.summary); }
  let html='<h2>SCENARIO AGGREGATE</h2><table><tr><th>시나리오</th><th>런</th><th>사망률</th><th>평균 생존(s)</th><th>평균 Lv</th><th>평균 킬</th><th>평균 처형</th><th>받은피해/분</th><th>평균 빈사</th></tr>';
  for(const [name,arr] of Object.entries(by)){
    const avg=k=>(arr.reduce((a,s)=>a+(+s[k]||0),0)/arr.length);
    const deaths=arr.filter(s=>s.outcome==='died').length;
    html+=`<tr><td>${name}</td><td>${arr.length}</td><td>${(deaths/arr.length*100).toFixed(0)}%</td><td>${avg('time').toFixed(0)}</td><td>${avg('level').toFixed(1)}</td><td>${avg('kills').toFixed(0)}</td><td>${avg('executions').toFixed(1)}</td><td>${avg('dmgTakenPerMin').toFixed(1)}</td><td>${avg('nearDeathCount').toFixed(1)}</td></tr>`;
  }
  html+='</table>';
  const old=document.getElementById('agg'); if(old) old.remove();
  const div=document.createElement('div'); div.id='agg'; div.innerHTML=html;
  document.getElementById('results').prepend(div);
}

/* ── 내보내기 ── */
function dl(name,text,mime){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:mime}));
  a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
function stamp(){ return new Date().toISOString().slice(0,19).replace(/[:T]/g,'-'); }
function downloadJSON(results){ dl('qa_run_'+stamp()+'.json', JSON.stringify(results,null,1),'application/json'); }
function downloadCSV(results){
  const rows=[RES_COLS.map(c=>c[1]).join(',')];
  for(const r of results){ const v=fmtRow(r); rows.push(RES_COLS.map(c=>String(v[c[0]]).replace(/,/g,';')).join(',')); }
  dl('qa_run_'+stamp()+'.csv','﻿'+rows.join('\n'),'text/csv');
}
