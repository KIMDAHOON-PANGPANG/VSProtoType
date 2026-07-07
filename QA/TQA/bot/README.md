# Balance QA Bot — EXECUTE // Survivors 자동 밸런스 시뮬레이터

`build/index_N.html` 을 iframe 으로 띄우고 봇 스크립트를 주입해 **자동 플레이 + 가속 시뮬레이션 + 지표 로그**를 뽑는 도구.
게임 빌드 파일은 **일절 수정하지 않는다** (주입식이라 어느 인덱스 버전에도 동작).

## 실행 방법

1. 로컬 서버 실행 (리포 루트에서):
   ```
   python -m http.server 5607
   ```
   (Claude Launch 패널의 `vslike` 서버와 동일)
2. 브라우저에서 열기: `http://localhost:5607/QA/TQA/bot/qa_harness.html`
3. 좌측에서 시나리오 체크 → **RUN BATCH**
4. 결과 표의 행을 클릭하면 HP/적수/피해 타임라인 + 무기 딜 지분 + 이벤트 로그 상세.
5. **⬇ JSON / ⬇ CSV** 로 로그 다운로드. 로그 보관은 `QA/TQA/bot/logs/` 권장.

## 자동(헤드리스) 모드

URL 파라미터로 배치를 자동 시작하고, 끝나면 `window.__QA.done===true`,
전체 로그는 `window.__QA.results` 에 남는다 (CI/Claude 자동화용).

```
/QA/TQA/bot/qa_harness.html?auto=1&scenarios=standard,noexec,afk&speed=30&dur=900&runs=1&seed=1234
  &build=index_26.html
  &override={"weapons":{"slash":{"damage":10}}}   ← URL 인코딩 필요
```

## 시나리오 (qa_scenarios.js)

| id | 내용 | 검증 대상 (QA_01) |
|---|---|---|
| standard | 카이팅+처형+수집+저스트회피 기준선 | 전반 |
| noexec | 처형 절대 안 함 | #3 #6 전염/압박이 실제로 벌 주는가 |
| greedy / coward | 수집 우선 / 생존 우선 | #7 이속, 리스크-리워드 |
| afk | 무입력 (자동 무기만) | #16 압박 바닥 측정 |
| slashonly / noslash | 베기만 강화 / 베기 배제 | #1 #2 베기 원툴 여부 |
| pressure2x | 스폰 밴드 캡×2·간격÷2 (`spawnMult:2`) | #11 #16 밀도 스트레스 (VS Curse 방식) |
| scythefocus | 낫 원툴 (`cardStrategy:'focus', focusWeapon:'<id>'` — 임의 무기 스캔 가능) | 1티어 의심 무기 캐리력 |

봇 파라미터: `spawnMult`/`eliteMult`(스폰 밴드 배율), `focusWeapon`(원툴 대상), `greed`, `jdReaction`, `execute`.
시나리오에 `override:{...}` 를 넣으면 그 시나리오에만 밸런스 오버라이드가 적용된다(배치 공통 오버라이드와 딥머지, 시나리오 우선).

## 주요 지표

- **받은피해/분** (`dmgTakenPerMin`, contact/discrete 분리) — 압박 수치화 (QA#16)
- **빈사 횟수 / HP 저점%** — 위기 빈도
- **무기 딜 지분** (`weaponDamage`) — 베기 쏠림 확인 (QA#1)
- **처형 기아 시간** (`execStarvedSec`) — 그로기 있는데 쿨 때문에 못 한 누적 초 (QA#15)
- **그로기 결말** (`executions` : `revives` : `groggyFaded`) — 처형:기상:소멸 비율 (QA#8)
- **spreaderConverts** — 전염 변이 발동 수 (QA#3)
- 1초 단위 타임라인 샘플: hp/적수/딜/피해 (웨이브 스파이크 확인, QA#11)
- **분당 밸런스 곡선** (`summary.minutes`) — 분별 DPS · 적 HP 유입량 · **클리어율(DPS÷유입, <1=적체)** ·
  킬 · 평균 밀도 · TTK 근사(Little's law: 밀도÷초당킬) · HP저점 · 레벨.
  플레이어 파워커브가 적 HP 유입 커브를 추월하는 **교차점**이 핵심 데이터포인트 (VS 는 10/20분 진화가 교차점).

## 자동 밸런스 진단 (배치 완료 시 상단 패널)

`Research/2026-07-07_뱀서라이크_4대게임_밸런스_리서치.md` 의 변경 트리거를 구현:

| 플래그 | 기준 | 근거 |
|---|---|---|
| 🔺 지배 의심 | 시나리오/딜1위무기 그룹 중앙 생존 ≥ 전체 중앙값 ×2 | 트리거(a) — 메가봉크 Dicehead 99% 사례 |
| 🔻 죽은 무기 의심 | 보유 3런+ 평균 딜 지분 < 3% | 트리거(b) — DPS 기여 하위 무기 |
| ⏱ 사망 클러스터 | 사망 40%+ 가 120초 창에 집중 | 트리거(c) — 시간대 사망률 급증 |
| 👥 밀도 경고 | 동시 적 300+ 관측 (본 게임 캡 없음) | VS 300 주기중단/500 절대캡 · 브로테이토 100캡 |
| ⚖ 적체 구간 | 분당 DPS < HP유입 이 2런+ 재현 | 파워커브 교차 실패 지점 |

## 밸런스 스윕

좌측 "밸런스 오버라이드" 에 JSON 을 넣으면 모든 런의 `BAL` 에 딥머지된다.
`groggy.duration`·`execution.*` 같은 미러 값도 봇이 `applyBalance` 를 다시 태워 반영함.
예: 베기 너프 실험 → `{"weapons":{"slash":{"damage":10,"interval":0.5}}}`

## 파일 구성

| 파일 | 역할 |
|---|---|
| `qa_harness.html` | 컨트롤 패널 + 배치 러너 + 결과 뷰 |
| `qa_bot.js` | 게임 iframe 에 주입되는 봇 (가상시계 가속·AI·지표 훅) |
| `qa_scenarios.js` | 시나리오/프로파일 정의 (여기에 추가) |
| `qa_report.js` | 결과 표·차트·CSV/JSON 내보내기 |
| `logs/` | 뽑은 로그 보관 |

## 동작 원리 / 주의

- `performance.now` 를 가상 시계로 패치하고 rAF 를 가로채 실프레임당 N 가상스텝 실행 → ×30~×60 가속에도 게임 로직은 고정 60fps 스텝(결정적).
- Math.random 을 시드 RNG 로 교체 → 같은 (시드, 배속) 이면 같은 런 재현.
- 오디오는 스텁 처리(시드 보존 + AudioContext 경고 방지).
- iframe 은 실제 1280×720 으로 돌림 — 잡몹 스폰 거리가 `max(W,H)*0.6` 이라 뷰포트 크기가 곧 밸런스 조건.
- v0.20 기준 **승리 조건(endGame(true))이 미구현**이라 15분(900s) 상한 도달 = 생존 처리.
- 봇은 실플레이 경로를 그대로 씀: `keys{}` 조작, `tryDodge()`/`tryExecute()` 호출, 레벨업·처형보상 카드는 DOM 클릭.
