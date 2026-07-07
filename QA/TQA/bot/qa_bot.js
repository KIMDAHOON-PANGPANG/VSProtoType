/* =====================================================================
   QA BOT — build/index_26.html 안에 <script> 로 주입되는 자동 플레이어.
   같은 오리진 iframe + classic script 라 게임의 전역 렉시컬 스코프
   (G / BAL / keys / A / UPGRADES / W2COL / PUNISH_* ...)를 직접 읽는다.

   구동 원리
   1. performance.now 를 가상 시계로 패치 + requestAnimationFrame 가로채기
      → 실프레임 1번에 가상 60fps 스텝을 speed 개 실행 (게임 로직 무손실 가속)
   2. render/updateHUD 는 배치 마지막 스텝에서만 실행 (드로우 코스트 절약)
   3. 매 가상 스텝마다 botThink() 가 keys{} 를 조작 + tryDodge/tryExecute 호출
   4. damageEnemy/hurtPlayer/contactHurt 등을 래핑해 지표 수집
   5. 게임초 1초마다 부모(harness)로 sample, 종료 시 end postMessage

   설정: window.__QA_CONFIG = {profile, params, seed, speed, durationCap,
                                override, sampleEvery}
   ===================================================================== */
(function(){
'use strict';
const CFG = window.__QA_CONFIG || { profile:'kiter', params:{}, seed:1234, speed:30, durationCap:900, sampleEvery:1 };
const STEP = 1/60, STEP_MS = 1000/60;
const post = (qa,data)=>{ try{ parent.postMessage({qa,data},'*'); }catch(e){} };

function fatal(msg){ post('fatal', String(msg&&msg.stack||msg)); }

try{
/* ── 0. 게임 전역 존재 확인 (렉시컬 스코프 접근) ── */
if(typeof G==='undefined'||typeof BAL==='undefined'||typeof keys==='undefined')
  throw new Error('game globals (G/BAL/keys) not found — injected into wrong page?');

/* ── 1. 오디오 스텁 — AudioContext 경고 방지 + setTimeout 내 Math.random 소비 제거(시드 보존) ── */
for(const k of Object.keys(A)) if(typeof A[k]==='function') A[k]=()=>{};

/* ── 2. 시드 RNG (mulberry32) — startGame 이전에 설치해야 런 전체가 결정적 ── */
(function(seed){
  let s = seed>>>0 || 0x9e3779b9;
  Math.random = function(){
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})(CFG.seed);

/* ── 3. 가상 시계 + rAF 가로채기 ── */
const realNow = performance.now.bind(performance);
const realRAF = window.requestAnimationFrame.bind(window);
let vnow = realNow();
performance.now = ()=>vnow;
let pendingCbs = [], rafId = 0;
window.requestAnimationFrame = cb=>{ pendingCbs.push(cb); return ++rafId; };

/* ── 4. 렌더 스로틀 (배치 마지막 스텝만 그림) ── */
let renderGate = true;
const _render = window.render, _hud = window.updateHUD;
window.render   = function(){ if(renderGate) _render(); };
window.updateHUD= function(){ if(renderGate) _hud(); };

/* ── 5. 밸런스 오버라이드 — boot() 의 늦은 fetch 가 덮어쓰지 못하게 applyBalance 래핑.
   스폰 예산 배율(spawnMult/eliteMult)도 여기서 처리 — VS 의 Curse 공식
   (실효 스폰간격 = interval / totalCurse)을 본떠 캡 ×m · 간격 ÷m 로 적용. ── */
function deepMerge(dst,src){
  for(const k in src){
    if(src[k]&&typeof src[k]==='object'&&!Array.isArray(src[k])&&dst[k]&&typeof dst[k]==='object') deepMerge(dst[k],src[k]);
    else dst[k]=src[k];
  }
  return dst;
}
function applyQATweaks(b){
  if(b.__qaTweaked) return b;                       // 같은 객체 이중 적용 방지
  if(CFG.override) deepMerge(b, CFG.override);
  const P0=CFG.params||{}, sm=+P0.spawnMult||1, em=+P0.eliteMult||1;
  if((sm!==1||em!==1) && b.spawner && Array.isArray(b.spawner.bands)){
    for(const band of b.spawner.bands){
      if(!band||typeof band!=='object') continue;
      if(sm!==1){
        if(band.fodderCap!=null) band.fodderCap=Math.round(band.fodderCap*sm);
        if(band.fodderInterval>0) band.fodderInterval=band.fodderInterval/sm;
      }
      if(em!==1){
        if(band.eliteMax!=null) band.eliteMax=Math.round(band.eliteMax*em);
        if(band.eliteIntervalSec>0) band.eliteIntervalSec=band.eliteIntervalSec/em;
      }
    }
  }
  try{ Object.defineProperty(b,'__qaTweaked',{value:true,enumerable:false}); }catch(e){ b.__qaTweaked=true; }
  return b;
}
const _applyBalance = window.applyBalance;
window.applyBalance = function(b){ _applyBalance(applyQATweaks(b)); };
window.applyBalance(BAL);   // 주입 시점에 이미 로드돼 있는 밸런스(폴백/JSON)에도 즉시 반영

/* ── 6. 지표 수집 훅 ── */
const M = {
  dmgTaken:0, dmgTakenContact:0, dmgTakenHit:0, dmgDealt:0,
  byWeapon:{},                    // 무기별 실제 적용 피해 (execution 별도)
  groggyStarted:0, groggyRevived:0, groggyFaded:0, justDodges:0,
  nearDeath:0, hpLowest:1, execStarved:0,   // 그로기 있는데 쿨이라 처형 못 한 누적 초 (QA#15)
  maxEnemies:0, spreaderConverts:0,
  samples:[], events:[],
  mBuckets:[],                              // 분당 밸런스 곡선 버킷 (리서치: DPS vs HP유입 교차점)
  lastSampleT:-1, lastKills:0, lastTakenMark:0, lastDealtMark:0, nearArmed:true,
};
function ev(type,detail){ M.events.push({t:+G.time.toFixed(1), type, detail}); }

// 색→무기 역맵 (damageEnemy 3번째 인자는 색상 문자열, undefined=베기)
const colorToWeapon = {};
if(typeof W2COL!=='undefined') for(const id in W2COL){
  if(colorToWeapon[W2COL[id]]) colorToWeapon[W2COL[id]] += '|'+id;  // 색 충돌 시 병기
  else colorToWeapon[W2COL[id]] = id;
}
const _damageEnemy = window.damageEnemy;
window.damageEnemy = function(e,dmg,color){
  const before = e.hp;
  _damageEnemy(e,dmg,color);
  const applied = Math.max(0, before - e.hp);           // 무적(도약 중 등) 자동 제외
  if(applied>0){
    M.dmgDealt += applied;
    const w = color===undefined ? 'slash' : (colorToWeapon[color]||'unknown');
    M.byWeapon[w] = (M.byWeapon[w]||0) + applied;
  }
};
function wrapTaken(name,bucket){
  const orig = window[name];
  if(typeof orig!=='function') return;
  window[name] = function(dmg){
    const p=G.player; if(!p) return orig(dmg);
    const before = p.hp + p.shield;
    orig(dmg);
    const lost = Math.max(0, before - (p.hp + p.shield));  // 무적/실드 반영한 실피해
    if(lost>0){ M.dmgTaken += lost; M[bucket] += lost; }
  };
}
wrapTaken('hurtPlayer','dmgTakenHit');
wrapTaken('contactHurt','dmgTakenContact');
function wrapCount(name,fn){
  const orig = window[name];
  if(typeof orig!=='function') return;
  window[name] = function(){ fn.apply(null,arguments); return orig.apply(this,arguments); };
}
wrapCount('makeGroggy', e=>{ M.groggyStarted++; });
wrapCount('eliteRevive', e=>{ M.groggyRevived++; ev('그로기만료·기상', e&&e.eliteType); });
wrapCount('eliteFade',  e=>{ M.groggyFaded++; ev('그로기만료·소멸', e&&e.eliteType); });
wrapCount('justDodge',  ()=>{ M.justDodges++; ev('저스트회피'); });
wrapCount('spawnMidboss',()=>{ ev('중간보스 등장'); });
// 전염(spreader) 변이 — spreadInfect 는 주변 잡몹을 엘리트로 즉시 변환하므로 전후 엘리트 수 차이로 계수
(function(){
  const orig = window.spreadInfect;
  if(typeof orig!=='function') return;
  window.spreadInfect = function(e){
    const before = G.enemies.filter(x=>x.kind==='elite').length;
    const r = orig.apply(this,arguments);
    const n = G.enemies.filter(x=>x.kind==='elite').length - before;
    if(n>0){ M.spreaderConverts += n; ev('전염 변이','+'+n); }
    return r;
  };
})();

/* ── 7. 봇 프로파일 ── */
const P = CFG.params||{};
const prm = {
  execute:      P.execute!==false,
  greed:        P.greed!=null?P.greed:0.5,      // 0=생존만, 1=수집만
  cardStrategy: P.cardStrategy||'balanced',     // balanced | slashOnly | noSlash
  jdReaction:   P.jdReaction!=null?P.jdReaction:0.85,  // prePhase 반응 확률
  threatRange:  P.threatRange||420,
};
const KEYSET = ['w','a','s','d'];
function setMove(dx,dy){
  for(const k of KEYSET) keys[k]=false;
  const m = Math.hypot(dx,dy);
  if(m<0.15) return;
  dx/=m; dy/=m;
  if(dy<-0.38) keys['w']=true;
  if(dy> 0.38) keys['s']=true;
  if(dx<-0.38) keys['a']=true;
  if(dx> 0.38) keys['d']=true;
}

/* 위협/수집 벡터 합성 카이팅 */
function thinkMove(){
  const p=G.player; if(!p) return;
  let vx=0, vy=0;
  let dodgeNow=false, contactCnt=0;

  for(const e of G.enemies){
    if(e.state!=='alive'&&e.state!=='groggy') continue;
    const d = Math.max(24, Math.hypot(e.x-p.x, e.y-p.y));
    if(e.state==='groggy') continue;                       // 그로기는 위협 아님
    // 도약 착지점 회피 + 저스트회피
    if(e.move==='windup'||e.move==='air'){
      const lx=e.leapX!=null?e.leapX:e.x, ly=e.leapY!=null?e.leapY:e.y, lr=(e.leapR||120);
      const dl=Math.hypot(lx-p.x, ly-p.y);
      if(dl < lr+70){
        const w = 30/Math.max(30,dl);
        vx += (p.x-lx)/Math.max(1,dl)*w*8; vy += (p.y-ly)/Math.max(1,dl)*w*8;
      }
      if(e.prePhase && !e.__qaJD && dl < lr*1.5){
        e.__qaJD = true;
        if(Math.random() < prm.jdReaction) dodgeNow = true;
      }
      continue;
    }
    if(e.__qaJD) e.__qaJD = false;   // 도약 종료 → 다음 도약 때 저스트회피 재시도
    if(d > prm.threatRange) continue;
    let w = e.midboss?6 : e.kind==='elite'?3 : 1;
    if(e.eliteType==='berserker'&&e.rage) w *= (1+e.rage);
    w /= Math.pow(d,1.4)/40;
    vx += (p.x-e.x)/d*w; vy += (p.y-e.y)/d*w;
    if(d < p.r+e.r+14) contactCnt++;
  }

  // 수집: 보석(가까운 것) + 바닥 보상 — 위협이 약할수록 강하게
  const threatMag = Math.hypot(vx,vy);
  const greedW = prm.greed * Math.max(0.15, 1-Math.min(1,threatMag*0.7));
  let best=null, bd=1e9;
  for(const g of G.gems){ const d=Math.hypot(g.x-p.x,g.y-p.y); if(d<bd&&d<560){bd=d;best=g;} }
  for(const r of G.rewards){ const d=Math.hypot(r.x-p.x,r.y-p.y); if(d<bd*1.4){bd=d;best=r;} }
  if(best){ const d=Math.max(1,bd); vx += (best.x-p.x)/d*greedW*1.1; vy += (best.y-p.y)/d*greedW*1.1; }

  // 가두리(cage) 벽 안쪽 유지
  if(G.cage){ const c=G.cage, dc=Math.hypot(p.x-c.x,p.y-c.y);
    if(dc > c.r-90){ vx += (c.x-p.x)/dc*3; vy += (c.y-p.y)/dc*3; } }

  setMove(vx,vy);

  // 포위 탈출 대시 / 저스트회피 대시
  if(dodgeNow || (contactCnt>=3 && p.dodge.cd<=0)){
    if(typeof tryDodge==='function') tryDodge();
  }
}

/* 처형: 사거리 내 그로기 엘리트 + 쿨 준비 → RMB 대신 tryExecute() 직접 호출 */
function thinkExecute(){
  const p=G.player; if(!p||G.execSeq) return;
  let candidate=false;
  for(const e of G.enemies){
    if(e.kind==='elite'&&e.state==='groggy'&&Math.hypot(e.x-p.x,e.y-p.y)<=p.execRadius+e.r){ candidate=true; break; }
  }
  if(!candidate) return;
  if(G.exec.cd>0.05){ M.execStarved += STEP; return; }    // QA#15: 쿨 때문에 못 함
  if(!prm.execute) return;                                 // no-exec 프로파일은 '기아 시간'만 기록
  const before=G.executions;
  tryExecute();
  if(G.execSeq) ev('처형 시작', 'targets='+G.execSeq.targets.length);
}

/* 레벨업/처형보상 모달 — DOM 카드 클릭 (실플레이와 동일 경로).
   카드 이름 → UPGRADES id 역맵으로 무기 식별 (focus:<무기id> 전략 일반화 —
   리서치의 'viable 빌드 폭' 측정: 무기별 원툴 캐리력 스캔용). */
const upNameToId = {};
if(typeof UPGRADES!=='undefined') for(const u of UPGRADES){ if(u&&u.weapon) upNameToId[u.name]=u.id; }
function domCards(){ return [...document.querySelectorAll('#cardrow .upcard')]; }
function cardName(c){ const n=c.querySelector('.up-name'); return n?n.textContent:'?'; }
function thinkModal(){
  const cards = domCards();
  if(!cards.length) return;
  if(G.punishMode){                                        // 처형 보상 (전용→공용 2단계)
    const i = Math.floor(Math.random()*cards.length);
    ev('처형보상 선택', G.punishMode+': '+cardName(cards[i]));
    cards[i].click();
    return;
  }
  const names = cards.map(cardName);
  const ids = names.map(n=>upNameToId[n]||null);
  const strat = prm.cardStrategy;
  const focusId = strat==='slashOnly' ? 'w_slash'
                : strat==='focus'     ? 'w_'+(prm.focusWeapon||'slash') : null;
  let idx = -1;
  if(focusId){
    idx = ids.findIndex(id=>id===focusId);
    if(idx<0 && G.rerolls>0){ rerollLevelUp(); return; }   // 다음 think 에서 재평가
    if(idx<0 && G.skips>0){ ev('카드 스킵', focusId.replace(/^w_/,'')+' 없음'); skipLevelUp(); return; }
  } else if(strat==='noSlash'){
    const pool = ids.map((id,i)=>id==='w_slash'?-1:i).filter(i=>i>=0);
    if(pool.length) idx = pool[Math.floor(Math.random()*pool.length)];
  }
  if(idx<0) idx = Math.floor(Math.random()*cards.length);
  ev('카드 선택', names[idx]);
  cards[idx].click();
}

const PROFILES = {
  kiter(){ thinkMove(); thinkExecute(); },
  afk(){ for(const k of KEYSET) keys[k]=false; },
};

/* ── 8. 샘플링 (1 게임초) + 분당 버킷 — 리서치 권고: 분별 (DPS, 적 HP 유입량,
   화면 밀도, 킬, 레벨) 곡선과 그 교차점이 밸런스의 핵심 데이터포인트 ── */
function sample(){
  const p=G.player, t=Math.floor(G.time), minute=Math.floor(t/60);
  const B = M.mBuckets[minute] || (M.mBuckets[minute]={dealt:0,taken:0,influx:0,spawns:0,kills:0,densitySum:0,densityN:0,hpLow:1,level:1});
  let elites=0, alive=0;
  for(const e of G.enemies){
    if(!e.__qaSeen){ e.__qaSeen=true; B.influx+=(e.maxHp||e.hp||0); B.spawns++; }   // 적 HP 유입량 (스폰 시점 HP, hpMult 반영)
    if(e.state==='alive'||e.state==='groggy'){ alive++; if(e.kind==='elite')elites++; }
  }
  M.maxEnemies = Math.max(M.maxEnemies, alive);
  const hpPct = p ? p.hp/p.maxHp : 0;
  M.hpLowest = Math.min(M.hpLowest, hpPct);
  if(M.nearArmed && hpPct < 0.25){ M.nearDeath++; M.nearArmed=false; ev('빈사', 'hp '+Math.round(hpPct*100)+'%'); }
  if(!M.nearArmed && hpPct > 0.4) M.nearArmed=true;
  const dealtDelta=M.dmgDealt-M.lastDealtMark, takenDelta=M.dmgTaken-M.lastTakenMark, killDelta=G.kills-M.lastKills;
  B.dealt+=dealtDelta; B.taken+=takenDelta; B.kills+=killDelta;
  B.densitySum+=alive; B.densityN++;
  B.hpLow=Math.min(B.hpLow,hpPct); B.level=G.level;
  const s = {
    t, hp:p?+p.hp.toFixed(1):0, maxHp:p?p.maxHp:0, shield:p?Math.round(p.shield):0,
    level:G.level, kills:G.kills, execs:G.executions,
    enemies:alive, elites, gems:G.gems.length,
    dmgTakenDelta:+takenDelta.toFixed(1),
    dmgDealtDelta:+dealtDelta.toFixed(1),
    dtpm: t>2 ? +(M.dmgTaken/(t/60)).toFixed(1) : 0,
    execCd:+G.exec.cd.toFixed(1), fps: realFps,
  };
  M.lastTakenMark=M.dmgTaken; M.lastDealtMark=M.dmgDealt; M.lastKills=G.kills;
  M.samples.push(s);
  // 숨김 탭 풀스로틀 시 postMessage 홍수 방지 — 10초마다만 라이브 샘플 전송
  if(document.visibilityState==='visible' || s.t%10===0) post('sample', s);
}

/* ── 9. 종료 판정 + 리포트 ── */
let finished=false;
function finish(outcome){
  if(finished) return; finished=true;
  const p=G.player, t=Math.max(1,G.time);
  const wd=Object.entries(M.byWeapon).sort((a,b)=>b[1]-a[1]);
  // 분당 밸런스 곡선: dps=가한딜/초, influx=적 HP 유입, clearRatio=dps÷유입률(<1 이면 적체),
  // ttk = Little's law 근사(평균 동시 적 수 ÷ 초당 킬)
  const minutes = M.mBuckets.map((b,i)=>{
    if(!b||!b.densityN) return null;
    const sec=b.densityN, density=b.densitySum/sec, kps=b.kills/sec;
    return {
      m:i, dps:+(b.dealt/sec).toFixed(1), influx:Math.round(b.influx), spawns:b.spawns,
      clearRatio: b.influx>0 ? +(b.dealt/b.influx).toFixed(2) : null,
      kills:b.kills, density:+density.toFixed(1),
      ttk: kps>0 ? +(density/kps).toFixed(2) : null,
      taken:+b.taken.toFixed(1), hpLowPct:Math.round(b.hpLow*100), level:b.level,
    };
  }).filter(Boolean);
  const summary = {
    minutes,
    // DPS 가 적 HP 유입을 못 따라간 '적체' 분 (유입 300 미만 초반 노이즈 제외)
    stuckMinutes: minutes.filter(x=>x.clearRatio!=null&&x.clearRatio<1&&x.influx>300).map(x=>x.m),
    outcome, time:Math.floor(G.time), level:G.level, kills:G.kills, executions:G.executions,
    maxHp:p?p.maxHp:0,
    dmgTaken:+M.dmgTaken.toFixed(0), dmgTakenPerMin:+(M.dmgTaken/(t/60)).toFixed(1),
    dmgTakenContact:+M.dmgTakenContact.toFixed(0), dmgTakenHit:+M.dmgTakenHit.toFixed(0),
    dmgDealt:+M.dmgDealt.toFixed(0), dpsDealt:+(M.dmgDealt/t).toFixed(1),
    weaponDamage:M.byWeapon, topWeapon: wd.length? wd[0][0]+' '+((wd[0][1]/Math.max(1,M.dmgDealt))*100).toFixed(0)+'%':'-',
    nearDeathCount:M.nearDeath, hpLowestPct:+(M.hpLowest*100).toFixed(0),
    groggyStarted:M.groggyStarted, revives:M.groggyRevived, groggyFaded:M.groggyFaded,
    justDodges:M.justDodges, execStarvedSec:+M.execStarved.toFixed(1),
    spreaderConverts:M.spreaderConverts, maxEnemies:M.maxEnemies,
    build: p? p.weapons.map(w=>w.id+':'+(w.evolved?'EVO':'Lv'+w.level)).join(' ') : '',
    profile:CFG.profile, params:prm, seed:CFG.seed,
  };
  ev(outcome==='died'?'사망':'시간 상한 도달','t='+summary.time+'s');
  post('end', { summary, samples:M.samples, events:M.events });
}

/* ── 10. 드라이버 — MessageChannel 펌프.
   rAF/setTimeout 은 백그라운드 탭에서 스로틀·정지되지만 메시지 이벤트는 아님.
   보이는 탭: 벽시계 기준 speed 배속으로 페이싱 / 숨김 탭: 풀스로틀. ── */
let realFps=0;                              // 실효 배속 (가상초/실초)
let vElapsedMs=0;
const wall0=realNow();
let rateW=wall0, rateV=0;
const FT_CHUNK=120;                         // 풀스로틀 1틱당 가상 스텝 수 (2 가상초)

function runSteps(steps){
  const visible = document.visibilityState==='visible';
  for(let i=0;i<steps && !finished;i++){
    renderGate = visible && (i===steps-1);
    try{
      if(G.state==='play'&&!G.execSeq) (PROFILES[CFG.profile]||PROFILES.kiter)();
      else if(G.state==='levelup') thinkModal();
    }catch(err){ fatal(err); finished=true; return; }
    vnow += STEP_MS; vElapsedMs += STEP_MS;
    const cbs=[...new Set(pendingCbs)]; pendingCbs=[];   // 네이티브 잔여 rAF 가 늦게 합류해도 loop 중복 실행 방지
    for(const cb of cbs){ try{ cb(vnow); }catch(err){ fatal(err); finished=true; return; } }
    if(G.state==='end'){ finish('died'); return; }
    if(G.time>=CFG.durationCap){ finish('capReached'); return; }
    if(G.state==='play' && Math.floor(G.time)>M.lastSampleT){ M.lastSampleT=Math.floor(G.time); sample(); }
  }
}

const pumpCh=new MessageChannel();
pumpCh.port1.onmessage=tick;
function kick(){ pumpCh.port2.postMessage(0); }
function tick(){
  if(finished) return;
  if(pendingCbs.length===0 && typeof window.loop==='function') window.loop();  // 네이티브 rAF 에 파킹된 루프 킥스타트
  const wall=realNow();
  if(wall-rateW>=500){ realFps=+((vElapsedMs-rateV)/(wall-rateW)).toFixed(1); rateW=wall; rateV=vElapsedMs; }
  if(document.visibilityState==='visible'){
    const behind=(wall-wall0)*CFG.speed - vElapsedMs;
    if(behind<STEP_MS){ setTimeout(kick,8); return; }            // 목표 배속보다 앞섬 → 잠깐 쉼
    runSteps(Math.min(CFG.speed*4, Math.floor(behind/STEP_MS)));
  } else {
    runSteps(FT_CHUNK);                                          // 숨김 탭: 최대 속도
  }
  kick();
}

/* ── 11. 부팅: 밸런스 확정 대기 → 시작 ── */
async function go(){
  try{
    // 게임 boot() 와 독립적으로 직접 fetch — 어느 쪽이 먼저든 applyBalance 래퍼가 오버라이드 보존
    try{
      const res=await fetch('gameBalance.json',{cache:'no-store'});
      if(res.ok){ window.applyBalance(await res.json()); }
    }catch(e){ /* file:// 등 — FALLBACK_BALANCE 사용 */ }
    startGame();
    ev('런 시작', CFG.profile+' seed='+CFG.seed+' x'+CFG.speed);
    kick();                                  // 펌프 시작 (rAF 불필요 — 숨김 탭에서도 동작)
  }catch(err){ fatal(err); }
}
go();

}catch(err){ fatal(err); }
})();
