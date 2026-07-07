/* =====================================================================
   QA 시나리오 정의 — 봇 프로파일 × 목적
   profile: qa_bot.js 의 PROFILES 키
   params : 프로파일별 세부 파라미터 (카드 선택 전략 등)
   QA_01.txt 의 관찰 항목과 매핑:
     #1/#2 베기 과강 → 무기별 딜 지분 로그 (모든 시나리오 공통 수집)
     #3/#6 처형 안 하면 압박 → no-exec vs executor 생존 비교
     #7 이속 과다 → kiter 의 피격/분 (카이팅만으로 안전한가)
     #16 압박 부족 → 받은피해/분 · 근접사망 횟수 · HP 저점
   ===================================================================== */
const QA_SCENARIOS=[
  {
    id:'standard', name:'표준 봇 (처형+카이팅)', default:true,
    profile:'kiter', params:{execute:true, cardStrategy:'balanced', greed:0.5},
    desc:'기본 기대 플레이: 카이팅 + 그로기 처형 + 보석/보상 수집 + 저스트회피 시도. 기준선.',
  },
  {
    id:'noexec', name:'처형 거부 봇', default:true,
    profile:'kiter', params:{execute:false, cardStrategy:'balanced', greed:0.5},
    desc:'처형을 전혀 안 함 → 전염 변이·자살특공 압박이 실제로 벌을 주는지 측정 (QA#3·#6).',
  },
  {
    id:'greedy', name:'욕심쟁이 봇 (수집 우선)', default:true,
    profile:'kiter', params:{execute:true, cardStrategy:'balanced', greed:0.95},
    desc:'안전보다 보석·보상 수집 우선 → 욕심 플레이가 받는 리스크 크기 측정.',
  },
  {
    id:'coward', name:'겁쟁이 봇 (생존 우선)', default:false,
    profile:'kiter', params:{execute:true, cardStrategy:'balanced', greed:0.1},
    desc:'보석 거의 포기, 회피 거리 최대 → 순수 카이팅 난이도 측정 (QA#7 이속 검증).',
  },
  {
    id:'afk', name:'AFK 봇 (무입력)', default:true,
    profile:'afk', params:{},
    desc:'이동/처형 전혀 없음. 자동 무기만으로 버티는 시간 = 최저 난이도 바닥 측정 (QA#16 압박).',
  },
  {
    id:'slashonly', name:'베기 원툴 봇', default:false,
    profile:'kiter', params:{execute:true, cardStrategy:'focus', focusWeapon:'slash', greed:0.5},
    desc:'레벨업 카드에서 베기 강화만 선택(없으면 리롤→스킵) → 베기 단독 캐리력 측정 (QA#1·#2).',
  },
  {
    id:'noslash', name:'베기 배제 봇', default:false,
    profile:'kiter', params:{execute:true, cardStrategy:'noSlash', greed:0.5},
    desc:'베기 강화 카드를 절대 안 집음 → 베기 없이도 성립하는지, 딜 지분 재분배 확인 (QA#1).',
  },
  {
    id:'pressure2x', name:'밀도 스트레스 ×2', default:true,
    profile:'kiter', params:{execute:true, cardStrategy:'balanced', greed:0.5, spawnMult:2},
    desc:'스폰 밴드 캡×2·간격÷2 (VS Curse 방식) → 압박 부족(QA#16)이 버짓 문제인지 검증. 동시 적 수·밀도 캡 필요성 확인.',
  },
  {
    id:'scythefocus', name:'낫 원툴 봇', default:false,
    profile:'kiter', params:{execute:true, cardStrategy:'focus', focusWeapon:'scythe', greed:0.5},
    desc:'딜 지분 1위(40~58%)로 실측된 낫의 원툴 캐리력 스캔 → 1티어/지배 빌드 여부 판정. focusWeapon 파라미터로 임의 무기 스캔 가능.',
  },
];
if(typeof module!=='undefined') module.exports={QA_SCENARIOS};
