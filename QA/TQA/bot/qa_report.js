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
  /* 분당 밸런스 곡선 (리서치: DPS vs 적 HP 유입 교차점이 핵심 데이터포인트) */
  if(r.summary.minutes&&r.summary.minutes.length){
    let mt='<div style="overflow-x:auto"><table><tr><th>분</th><th>DPS</th><th>HP유입</th><th>클리어율</th><th>킬</th><th>평균밀도</th><th>TTK~s</th><th>받은피해</th><th>HP저점%</th><th>Lv</th></tr>';
    for(const m of r.summary.minutes){
      const warn=m.clearRatio!=null&&m.clearRatio<1&&m.influx>300;
      mt+=`<tr${warn?' style="color:var(--crimson)"':''}><td>${m.m}</td><td>${m.dps}</td><td>${m.influx}</td><td>${m.clearRatio==null?'-':m.clearRatio}</td><td>${m.kills}</td><td>${m.density}</td><td>${m.ttk==null?'-':m.ttk}</td><td>${m.taken}</td><td>${m.hpLowPct}</td><td>${m.level}</td></tr>`;
    }
    mt+='</table></div>';
    const md=document.createElement('div'); md.style.cssText='margin:8px 0;font-size:11px';
    md.innerHTML='<b style="color:var(--gold)">분당 밸런스 곡선</b> <small style="color:var(--dim)">(클리어율 = 가한 딜 ÷ 적 HP 유입 — 1 미만 붉은 행 = 적체 구간)</small>'+mt;
    d.appendChild(md);
  }
  const ev=document.createElement('div'); ev.className='ev';
  ev.innerHTML=(r.events||[]).map(e=>`<span class="t">[${e.t}s]</span> ${e.type} ${e.detail||''}`).join('<br>')||'(이벤트 없음)';
  d.appendChild(ev);
  d.scrollIntoView({behavior:'smooth'});
}

/* ── 밸런스 진단 — 리서치 자동 재조정 트리거 구현
   (a) 지배 빌드: 그룹 중앙 생존 ≥ 전체 중앙값 ×2
   (b) 죽은 무기: 보유 3런+ 평균 딜 지분 <3%
   (c) 사망 클러스터: 사망 40%+ 가 120초 창에 집중
   (+) 밀도 캡: 동시 300+ (VS 300 주기중단/500 절대캡, 브로테이토 100캡 참조)
   (+) 파워커브 적체: 분당 DPS < 적 HP 유입 (2런 이상 재현 구간) ── */
function renderDiagnosis(results){
  const ok=results.filter(r=>!r.error);
  if(!ok.length) return;
  const flags=[];
  const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[(s.length-1)>>1]:0;};
  const allMed=med(ok.map(r=>r.summary.time));

  // (a) 지배 그룹 — 시나리오별 / 딜1위 무기별
  const groups={};
  for(const r of ok){
    (groups['시나리오 '+r.job.scenarioName]??=[]).push(r.summary.time);
    const tw=(r.summary.topWeapon||'').split(' ')[0];
    if(tw&&tw!=='-') (groups['딜1위 '+tw]??=[]).push(r.summary.time);
  }
  for(const [g,arr] of Object.entries(groups)){
    if(arr.length>=2 && allMed>0 && med(arr)>=allMed*2)
      flags.push(`🔺 <b>지배 의심</b> — ${g}: 중앙 생존 ${med(arr)}s ≥ 전체 중앙값 ${allMed}s ×2 <small>[트리거 a]</small>`);
  }
  // (b) 죽은 무기 — 보유 런에서의 딜 지분
  const wstat={};
  for(const r of ok){
    const tot=Math.max(1,r.summary.dmgDealt||1);
    for(const w of (r.summary.build||'').split(' ').map(x=>x.split(':')[0]).filter(Boolean)){
      if(w==='shock'||w==='brand') continue;   // 은퇴 유니크 제외
      (wstat[w]??=[]).push((r.summary.weaponDamage&&r.summary.weaponDamage[w]||0)/tot);
    }
  }
  for(const [w,arr] of Object.entries(wstat)){
    if(arr.length<3) continue;
    const avg=arr.reduce((a,b)=>a+b,0)/arr.length;
    if(avg<0.03) flags.push(`🔻 <b>죽은 무기 의심</b> — ${w}: 보유 ${arr.length}런 평균 딜 지분 ${(avg*100).toFixed(1)}% &lt; 3% <small>[트리거 b]</small>`);
  }
  // (c) 사망 클러스터 (120초 슬라이딩 창)
  const deaths=ok.filter(r=>r.summary.outcome==='died').map(r=>r.summary.time).sort((a,b)=>a-b);
  if(deaths.length>=3){
    let best={n:0,a:0,b:0};
    for(let i=0;i<deaths.length;i++){
      let j=i; while(j<deaths.length&&deaths[j]<=deaths[i]+120)j++;
      if(j-i>best.n) best={n:j-i,a:deaths[i],b:deaths[j-1]};
    }
    if(best.n/deaths.length>=0.4)
      flags.push(`⏱ <b>사망 클러스터</b> — 사망 ${deaths.length}건 중 ${best.n}건(${Math.round(best.n/deaths.length*100)}%)이 ${best.a}~${best.b}s 에 집중 <small>[트리거 c]</small>`);
  }
  // (+) 화면 밀도
  const dmax=Math.max(0,...ok.map(r=>r.summary.maxEnemies||0));
  if(dmax>=300)
    flags.push(`👥 <b>밀도 경고</b> — 최대 동시 적 ${dmax}마리. 본 게임은 캡 없음 (VS: 300에서 주기 스폰 중단·절대캡 500 / 브로테이토: 100캡+루트 페널티) — 캡 도입 검토`);
  // (+) 파워커브 적체 구간 (2런 이상 재현)
  const stuck={};
  for(const r of ok) for(const m of (r.summary.stuckMinutes||[])) stuck[m]=(stuck[m]||0)+1;
  const sm=Object.entries(stuck).filter(([,c])=>c>=2).sort((a,b)=>+a[0]-+b[0]).map(([m,c])=>`${m}분(${c}런)`);
  if(sm.length) flags.push(`⚖ <b>DPS &lt; HP유입 적체</b> — ${sm.join(' · ')} : 파워커브가 유입을 못 따라가는 구간 (역전 판타지 설계 시 교차점 후보)`);

  let html='<h2>BALANCE DIAGNOSIS <small style="color:var(--dim)">(트리거: 지배빌드 ·죽은무기 ·사망클러스터 ·밀도캡 ·파워커브 — Research/ 리서치 기준)</small></h2>';
  html+= flags.length ? '<div class="diagbox">'+flags.join('<br>')+'</div>'
                      : '<div class="diagbox ok">플래그 없음 — 트리거 기준 이상치 미검출</div>';
  const old=document.getElementById('diag'); if(old) old.remove();
  const div=document.createElement('div'); div.id='diag'; div.innerHTML=html;
  document.getElementById('results').prepend(div);
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
