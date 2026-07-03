# EXECUTE // 개발 워크플로우 & 컨벤션

> 이 문서는 프로젝트의 **작업 규칙(단일 소스)** 이다.
> 새 기능을 구현하거나 수정할 때마다 아래 규칙을 따른다.
> (Claude / 협업자 모두 이 문서를 기준으로 작업한다.)

---

## 0. 현재 상태

| 항목 | 값 |
|---|---|
| 최신 버전 | **v0.16.0** |
| 최신 플레이 파일 | **`build/index_21.html`** |
| 밸런스 단일 소스 | **`build/gameBalance.json`** |
| 패치 내역 | **`build log/PATCH_LOG.txt`** (내림차순) |
| GitHub 리포 | **`KIMDAHOON-PANGPANG/VSProtoType`** (`origin/main`) |

### 폴더 구조 (중요)
```
project-VSLike/           ← git 저장소 (origin: KIMDAHOON-PANGPANG/VSProtoType)
├─ build/                 ← 모든 게임 빌드 + 밸런스 (여기서 작업한다)
│   ├─ index.html … index_11.html
│   └─ gameBalance.json   ← 게임이 fetch 로 읽으므로 인덱스와 같은 폴더에 둔다
├─ build log/             ← 패치 로그 누적
│   └─ PATCH_LOG.txt
├─ ppt/토론/               ← 설계 토론 덱
├─ WORKFLOW.md            ← 이 문서 (작업 규칙, 루트 유지)
├─ .gitignore             ← .claude/settings.local.json 등 개인/로컬 파일 제외
└─ .claude/launch.json    ← 로컬 미리보기 서버 설정
```
- **앞으로 모든 인덱스 작업은 `build/` 안에서 한다.** (새 `index_N.html`도 `build/`에 생성)
- **로그는 항상 `build log/PATCH_LOG.txt`** 에 내림차순으로 누적한다.
- `gameBalance.json` 은 인덱스와 **같은 `build/`** 안에 둔다(상대경로 `fetch('gameBalance.json')` 유지).
- **구현이 완료되면 GitHub 리포(`origin/main`)에 커밋·푸시한다.** (자세히는 §6)

---

## 1. 핵심 규칙 (요약)

1. **작업이 끝나면 인덱스는 갱신(덮어쓰기)하지 않고 새 버전 파일로 만든다.**
   `build/index_5.html` → `build/index_6.html` → … (이전 버전은 그대로 보존, 전부 `build/` 안)
2. **작업이 끝나면 `build log/PATCH_LOG.txt`를 내림차순(최신이 맨 위)으로 갱신한다.**
3. **구현/기능이 추가될 때마다 관련 밸런스 수치는 `build/gameBalance.json`에 추가·갱신한다.**
   (동시에 HTML 내장 `FALLBACK_BALANCE`도 같은 값으로 동기화한다.)
4. **구현이 완료되면 GitHub 리포(`origin/main`)에 커밋·푸시한다.** (버전업 1개 = 커밋 1개 권장, 자세히는 §6)

---

## 2. 버전(인덱스) 규칙

- 변경 요청을 받으면 **`build/` 안의 최신 `index_N.html`을 복사해 `build/index_(N+1).html`을 만들고** 거기서 작업한다.
- **이전 버전 파일은 절대 수정/삭제하지 않는다.** (롤백·비교용 보존)
- 새 파일 안의 버전 표기도 함께 올린다:
  - `<title>EXECUTE vX.Y // …</title>`
  - 시작 화면 `.subtitle` 의 `vX.Y · …`
- 다음 작업 시작 시 "최신 파일"은 가장 번호가 큰 `index_N.html`.

### 버전 넘버링
- `MAJOR.MINOR.PATCH` (현재 `0.MINOR.0` 흐름)
- 기능 추가/시스템 변경 → MINOR 증가 (예: 0.3.0 → 0.4.0)
- 작은 수정/버그픽스 → PATCH 증가
- 새 `index_N.html` 1개 = 보통 MINOR 1 증가

---

## 3. 패치 로그 규칙 (`build log/PATCH_LOG.txt`)

- **내림차순**: 새 항목을 **파일 맨 위(헤더 바로 아래)** 에 추가한다.
- 항목 포맷:

```
================================================================================
[vX.Y.Z]  YYYY-MM-DD  —  index_N.html (+ 추가 파일)   "한 줄 타이틀"
================================================================================
기반: 어떤 버전에서 파생했는지.
초점: 이번 작업의 핵심 한두 줄.

[ADDED]   새로 추가된 것
[CHANGED] 변경된 것
[FIXED]   고친 것
[KEPT]    유지된 핵심 사양
```

- 태그: `[ADDED] / [CHANGED] / [FIXED] / [REMOVED] / [KEPT]`
- 날짜는 작업일 기준 절대표기(YYYY-MM-DD).

---

## 4. 밸런스 JSON 규칙 (`build/gameBalance.json`) ⭐

> **새 기능에 "조절 가능한 수치"가 생기면 반드시 여기에 등록한다.**
> 하드코딩 금지 — PC·몬스터·스폰·진행 관련 숫자는 전부 JSON에서 읽는다.

### 4.1 무엇을 넣는가
- **밸런스 수치** = 게임 플레이/난이도/감각을 결정하는 숫자.
  - 예: 체력, 데미지, 속도, 쿨다운, 스폰 간격/수, 페이즈 경계, 그로기 시간,
    부활 설정, XP 성장, 처형 타이밍/셰이크 강도 등.
- **연출 전용 수치(파티클 개수, 링 반경, 색상 등)** 는 굳이 넣지 않아도 됨(취향).

### 4.2 현재 섹션 구조
```
player / execution / groggy / enemies(fodder·elite) /
spawner(phase1·2·3) / xp / contactDamageScale
```
새 시스템이 생기면 알맞은 섹션에 키를 추가하거나, 필요 시 새 섹션을 만든다.

### 4.3 추가 절차 (중요 — 3곳을 함께 맞춘다)
새 밸런스 값을 도입할 때:
1. **`gameBalance.json`** 에 키를 추가한다. (단일 소스 / 권위 있는 값)
2. **`index_N.html` 내장 `FALLBACK_BALANCE`** 에 동일 키를 추가한다.
   (file:// 더블클릭 폴백용 — 두 곳이 항상 같아야 한다.)
3. **코드에서 하드코딩 대신 `BAL.<경로>` 로 읽는다.**
   - 런타임에 값이 필요한 함수(스폰/공격 등)는 호출 시점에 `BAL`을 읽으므로 OK.
   - 로드 시점 상수(`GROGGY_TIME`, `G.exec`, `G.xpNeed` 등)는 `applyBalance()`에서
     재동기화하도록 추가한다.

### 4.4 로드 동작 (참고)
- 부팅 시 `fetch('gameBalance.json')` → 성공하면 그 값이 **실시간 소스 오브 트루스**.
  콘솔에 `[balance] gameBalance.json loaded ✓` 출력.
- 실패(파일 없음/`file://` 차단) → 내장 `FALLBACK_BALANCE` 사용, 콘솔에 경고.
- `gameBalance.json` 의 `_version` 도 인덱스 버전에 맞춰 올린다.

### 4.5 밸런스 편집/실행
- **밸런스를 실시간 수정하려면 로컬 서버로 실행한다** (`file://` 더블클릭은 fetch 차단됨).
  - Launch 패널의 `vslike` 서버로 **`/build/index_N.html`** 열기 → `build/gameBalance.json` 수정 → 새로고침.
- 더블클릭으로만 테스트할 거면, JSON 값과 `FALLBACK_BALANCE` 값을 똑같이 맞춰둔다.

---

## 5. 검증 규칙

- 변경 후 **로컬 서버(`vslike`)로 해당 `build/index_N.html`을 열어** 동작을 확인한다.
- **콘솔 에러 0건** 확인.
- 핵심 시스템은 가능하면 수치로 검증(상태 전이, 드랍 수, 쿨다운 등).
- 밸런스 변경은 `gameBalance.json` 값이 실제 동작에 반영되는지 확인.

---

## 6. Git 커밋/푸시 규칙 ⭐

> **구현이 완료되면(버전업 + 로그 + JSON 동기 + 검증까지 끝나면) GitHub 리포에 커밋·푸시한다.**

### 6.0 "푸쉬해줘" 트리거 규칙 ⭐ (기본 동작)
사용자가 **"푸쉬해줘"**(또는 "푸시", "push")라고 하면 — 특정 폴더/파일만 올리라고 **명시하지 않는 한** —
**`C:\DEV\VSProtoType\` 저장소 전체를 검토해서 통째로 커밋·푸시한다.** (한 폴더만 골라 올리지 않는다.)

- **절차**:
  1. `git status --short` 로 **저장소 전체의 미커밋 변경(수정·추가·삭제)** 을 훑는다.
  2. 각 변경을 **간단히 검토**한다(의도치 않은 파일·비밀정보·임시파일이 섞이지 않았는지). `.gitignore` 제외 대상은 그대로 둔다.
  3. `git add -A` 로 **전체를 스테이징**하고, 한 줄 요약 + 상세로 커밋한다(끝줄 `Co-Authored-By`).
  4. `git push origin main`.
- **범위를 좁히고 싶을 때만 예외**: 사용자가 "이 폴더만/이 파일만 푸시"처럼 대상을 특정하면 그때는 그 대상만 올린다.
- 검토 중 애매한 변경(대량 삭제, 낯선 파일 등)이 보이면 **바로 올리지 말고 먼저 사용자에게 확인**한다.

- **원격**: `https://github.com/KIMDAHOON-PANGPANG/VSProtoType` (`origin/main`).
- **단위**: 보통 **버전업 1개 = 커밋 1개**. 관련 변경(새 `index_N.html` · `gameBalance.json` · `PATCH_LOG.txt` · `WORKFLOW.md`)을 한 커밋에 함께 담는다.
- **절차**:
  ```
  git add -A
  git commit -m "vX.Y.Z — <한 줄 요약>" -m "<상세>" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  git push origin main
  ```
- **커밋 메시지**: 무엇을 왜 바꿨는지 한 줄 요약 + 상세, **마지막 줄은 항상**
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **제외**: `.claude/settings.local.json`(개인/로컬 설정) 등은 `.gitignore`로 제외. 이전 버전 인덱스는 **삭제하지 않으므로** 그대로 커밋에 포함(히스토리 보존).
- **주의**: 인증은 로그인된 `gh`(KIMDAHOON-PANGPANG) 자격을 사용. 강제 푸시(`-f`)·히스토리 재작성은 지양(요청 시에만).

---

## 7. 작업 완료 체크리스트 ✅

작업을 끝낼 때마다 아래를 모두 만족하는지 확인한다.

- [ ] 이전 `index_N.html`은 그대로 두고 **새 `index_(N+1).html`** 로 작업했다.
- [ ] 새 파일의 **title / subtitle 버전 표기**를 올렸다.
- [ ] 새 기능의 **밸런스 수치를 `gameBalance.json`에 추가**했다.
- [ ] **`FALLBACK_BALANCE`(HTML 내장)** 를 JSON과 동일하게 동기화했다.
- [ ] 코드가 해당 수치를 **`BAL.*` 로 읽는다** (하드코딩 없음).
- [ ] `gameBalance.json` 의 `_version` 을 갱신했다.
- [ ] **`build log/PATCH_LOG.txt`** 맨 위에 이번 변경 항목을 **내림차순**으로 추가했다.
- [ ] 로컬 서버로 `build/index_N.html`을 실행해 **콘솔 에러 0건** 및 동작을 확인했다.
- [ ] **GitHub 리포에 커밋·푸시**했다 (`git add -A` → commit(끝줄 Co-Authored-By) → `git push origin main`).

---

## 8. 파일 맵

| 경로 | 역할 |
|---|---|
| `build/index.html` | v0.1.0 — 초기 프로토타입 (직업 2종 + 보스) |
| `build/index_2.html` | v0.2.0 — 이중 몬스터 시스템 + 3분 페이싱 |
| `build/index_3.html` | v0.3.0 — 일섬 루트 처형 + 지연 사망 |
| `build/index_4.html` | v0.4.0 — 그로기 부활 + 밸런스 JSON 연동 |
| `build/index_5.html` | v0.5.0 — 스태거드 슬로우모션 처형 피니셔 |
| `build/index_6.html` | v0.6.0 — 불릿타임 인트로 + 고속 체인 처형 |
| `build/index_7.html` | v0.7.0 — 저스트 회피 + 엘리트 도약 패턴 |
| `build/index_8.html` | v0.8.0 — 부활 리워크(저체력·짧은무적·1회·경고) |
| `build/index_9.html` | v0.9.0 — 틱 접촉 피해·리프 호밍·네온 텔레그래프·처형 멈춤↓ (부활 1회 제한) |
| `build/index_10.html` | v0.9.1 — 부활 무한(테스트). maxRevives 0=무한 |
| `build/index_11.html` | v0.10.0 — 리프어택 중 무적 + PRE 저스트 회피 윈도우 |
| `build/index_12.html` | v0.10.1 — 부활 1회 제한 복귀(maxRevives 1) |
| `build/index_13.html` | v0.10.2 — 처형 1회당 1명(execution.maxTargets 1) |
| `build/index_14.html` | v0.10.3 — 자동 베기 조준 버그 수정 + 흡혈각인(처형 시 HP 회복) 제거 |
| `build/index_15.html` | v0.11.0 — 무기 슬롯(VS식 자동 무기고): 기반 5종 + 유니크 2종(처형 파문·낙인) + 무기 레벨업 카드 |
| `build/index_16.html` | v0.12.0 — RMB 처형(LMB 해제) + 비겹침 몸 충돌(뚫고 지나가면 접촉 피해 · 처형 중/직후 1초 통과) + 유니크 2종 카드 미노출 |
| `build/index_17.html` | v0.13.0 — 무기 1군 14종(덱 017/018 · 매서 몸통×롤 한 스푼) + 연출 3종 세트(차지 링·범위 표시·틱 컬러) + 상태이상(빙결·중독·도발) + 슬롯 예산 6 · 기존 5종 카드 은퇴 |
| `build/index_18.html` | v0.13.1 — 전설 천장(legendPity): 슬롯 만석+낮은 전설 가중치가 겹쳐 전설 3종을 영구히 못 보던 버그 수정 |
| `build/index_19.html` | v0.14.0 — 등급제(rar) 완전 폐지 → VS식 레벨+진화: 무기 1군 14종 균등 확률 카드 + maxLevel(8) 도달 시 evolveWeapon(무기별 고유 훅 14종 + 공통 발사간격 35%↓) |
| `build/index_20.html` | v0.15.0 — 레벨업 카드 테두리 공용 teal 통일(진화 임박만 골드) · 무덤 거미 스폰을 고정 배치→PC 앞 성장 연출+랜덤 방향 크롤로 개편 · 부채꼴 베기가 정식 무기(slash Lv1~8+진화)로 편입 · 마우스 에임 폐지 → WASD 이동 방향 360도 회전 |
| `build/index_21.html` | v0.16.0 — 무덤 거미 직선 이동 재설계(travelDist/travelTime 데이터 드리븐 · 방향 화살표 예고 · '멈춤' 버그 해소) · 팩션 가시성(생존 적=붉은 외곽 링/글로우, 플레이어=teal 링 → 스킬 색과 겹쳐도 적·아군 즉시 구분) (**현재 최신**) |
| `build/gameBalance.json` | 모든 PC·몬스터·**무기(weapons)** 밸런스 수치 (단일 소스) |
| `build log/PATCH_LOG.txt` | 패치 내역 (내림차순) |
| `WORKFLOW.md` | 이 문서 — 작업 규칙 (루트) |
| `.claude/launch.json` | 로컬 미리보기 서버(`vslike`) 설정 |
