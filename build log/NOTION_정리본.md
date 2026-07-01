# EXECUTE // Survivors Execution Core — 개발 진행 정리

> 단일 HTML 파일 뱀서라이크 바이브코딩 프로토타입. 외부 에셋 0 (HTML5 Canvas + 순수 CSS + Web Audio 신디사이저).
> **현재 버전: v0.10.0 · 최신 빌드: `build/index_11.html`**

---

## 1. 개요 / 코어 필러

- **0번 기둥**: "부착(그로기) → 처형 콤보" — 적 HP를 0으로 만들면 죽지 않고 **그로기** 상태가 되고, LMB로 **처형**해 히트스톱·스크린셰이크·온킬 리셋(오버드라이브)을 터뜨린다.
- **2층 방어 축**(토론 결론): 잡몹 떼는 뱀서 그대로(1층), 엘리트는 예고를 읽고 **저스트(딱 맞춤) 회피**하는 액션 듀얼(2층).
- 흐름: **도약 예고 → PRE 판정 → 회피(저스트) → 엘리트 탈진(약점) → 그로기 → 처형**.

---

## 2. 핵심 시스템 (현재 구현)

| 시스템 | 내용 |
|---|---|
| 처형 코어 | 그로기 적 LMB 처형 · 불릿타임(짧은 정지→슬로우→복귀) · 처치 수만큼 쿨다운 환급 · 개별 사망 연출(팡) |
| 이중 몬스터 | 잡몹(HP10, 즉사→파란 XP) / 엘리트(HP50, 그로기·도약 패턴·부활) |
| 능동 회피 | SPACE 회피(i-frame 대시, 무입력 시 전방 보며 백대시) · 떼거리 통과 |
| 저스트 회피 | 엘리트 도약을 PRE 판정창(착지 0.2초 전)에서 회피 → 패링(탈진·약점 x2·슬로우) |
| 엘리트 도약 | 예고(노란 네온 데칼·호밍) → 체공(무적) → 착지 AoE. 도약 중 무적, 착지부터 피해 |
| 부활 | 정예 한정. 저체력(40%)·짧은 무적 부활. (현재 테스트: 무한 부활 / 1회 제한 토글 가능) |
| 접촉 피해 | 뱀서식 틱 피해(접촉 중 0.5초마다 소량, 적별 독립 → 둘러싸이면 누적) |
| 메타 성장 | XP 젬·레벨업 모달(Common/Rare/Legendary, 회피 빌드 카드 포함) |
| 밸런스 | 모든 PC·몬스터 수치를 외부 `gameBalance.json` 단일 소스로 관리 |

---

## 3. 버전 히스토리

| 버전 | 파일 | 핵심 변경 |
|---|---|---|
| v0.1.0 | index.html | 최초 프로토타입 — 직업 2종(Pyro/Specter) + 그로기·처형 + 보스(Anubis Core) |
| v0.2.0 | index_2.html | 이중 몬스터 시스템(잡몹/엘리트) + 3분 페이즈 페이싱 |
| v0.3.0 | index_3.html | 一閃 루트 처형(점점 빨라지는 대시) + 지연 사망 연출 |
| v0.4.0 | index_4.html | 그로기 부활 시스템 + **gameBalance.json** 도입(외부 밸런스) |
| v0.5.0 | index_5.html | 스태거드 슬로우모션 처형(개별 팡 + 슬로우 해제 후 레벨업) |
| v0.6.0 | index_6.html | 불릿타임 처형(0.1초 불릿타임 → 고속 촥촥촥) |
| v0.7.0 | index_7.html | 저스트 회피 + 엘리트 도약 패턴(2층 방어) |
| v0.8.0 | index_8.html | 부활 리워크(저체력·짧은무적·1회·만료경고) + 회피 방향(백대시) |
| v0.9.0 | index_9.html | 틱 접촉 피해 · 리프 데칼 호밍 · 노란 네온 텔레그래프 · 처형 멈춤 최소화 |
| v0.9.1 | index_10.html | 부활 무한(테스트, maxRevives 0=무한) |
| **v0.10.0** | **index_11.html** | **리프어택 중 무적(착지부터 피해) + PRE 저스트 회피 윈도우(타이밍 쉬움)** ← 현재 최신 |

---

## 4. 폴더 구조 / 실행

```
project-VSLike/
├─ build/                 ← 모든 빌드 + 밸런스
│   ├─ index.html … index_11.html
│   └─ gameBalance.json   ← 밸런스 단일 소스(게임이 fetch로 로드)
├─ build log/             ← 패치 로그(내림차순) + 이 정리본
│   └─ PATCH_LOG.txt
└─ WORKFLOW.md            ← 작업 규칙(버전업/로그/JSON 동기)
```

- **실행**: 로컬 서버로 `build/index_11.html` 열기 (file:// 더블클릭 시 JSON fetch 차단 → 내장 폴백값 사용).
- **밸런스 조절**: `build/gameBalance.json` 수정 후 새로고침 (값별 `_comment`에 설명 포함).
- **작업 규칙**: 변경 시 새 `index_(N+1)`로 버전업 · `PATCH_LOG.txt` 내림차순 갱신 · JSON+FALLBACK 동기.

---

## 5. 주요 튜닝 노브 (gameBalance.json)

- `execution`: bulletTime/bulletScale(처형 멈춤 정도), 쿨다운 환급
- `combat.justDodge`: hitstop/slowScale(저스트 불릿타임), weakpointMult(약점 배수)
- `enemies.elite.leap`: windup/air/radius/damage, homing(데칼 추적), **preWindow(저스트 타이밍 창)**
- `groggy`: reviveHpFraction(부활 체력), reviveInvuln, **maxRevives(0=무한 / N=N회)**, warnTime
- `contact`: interval/fodderDamage/eliteDamage(틱 접촉 피해)
