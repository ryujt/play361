# 근거 브리프 (Evidence Brief) — play361 (local)

> DATE: **2026.07.19** · AS-IS 분석 Step 0 산출물.
> 이후 AS-IS 본문·상세 파일과 TO-BE 설계는 원본 코드 대신 이 브리프를 1차 인용한다.

## 1. 근거 인벤토리

후보 트리 확인 결과(2026.07.19 `ls` 기준):

| 후보 | 존재 여부 | 채택 |
|---|---|---|
| `docs/코드분석/` · `docs/코드리뷰/` | 없음 | — |
| `docs/design/2026.07.19/code-analysis/` | 없음 | — |
| **소스코드 직접 분석** | 있음 | ✅ **채택** |
| (참고) `docs/design/2026.07.03/` 기존 AS-IS 산출물 | 있음 | 근거로 쓰지 않음 — 코드를 새로 역추출 |

분석 대상 실경로(전수):

| 영역 | 파일 | 비고 |
|---|---|---|
| frontend 진입 | `frontend/src/main.jsx` · `frontend/src/App.jsx` | 경로 분기 라우팅 · 화면 조립 |
| frontend 오케스트레이터 | `frontend/src/hooks/useGame.js` (508줄) | 게임 상태·흐름 전체 |
| frontend 로직 | `frontend/src/logic/rules.js` · `logic/coordinates.js` | 착수 규칙 · GTP 좌표 변환 |
| frontend 게이트웨이 | `frontend/src/api/relay.js` · `api/gameState.js` | AI 요청(재시도) · 저장/로드/삭제 |
| frontend UI | `frontend/src/components/Board.jsx` · `GameInfo.jsx` · `Controls.jsx` | Canvas 바둑판 · 정보 · 버튼 |
| frontend 기타 | `frontend/src/audio/stoneSound.js` · `pages/Analytics.jsx` · `pages/Privacy.jsx` · `App.css` · `vite.config.js` | 효과음 · 통계 · 정책 · 레이아웃 · 프록시 |
| backend | `backend/server.js` (170줄) · `validator.mjs` · `katago-client.mjs` · `game-store.mjs` | 라우팅 · 검증 · 중계 · 파일 저장 |
| katago-server | `katago-server/main.go` · `katago.go` (591줄) · `config.go` · `models.go` · `logging.go` | HTTP 핸들러 · GTP 엔진 관리 · 설정 · DTO · 일별 로그 |
| 실행 | `run.sh` · `scripts/dev.sh` · `README.md` | 3컴포넌트 동시 기동(:5173 / :8788 / :8789) |

## 2. 이슈 목록 (R-NN) — TO-BE 변경점(C-0X)의 입력

| ID | 심각도 | 위치 | 내용 |
|---|---|---|---|
| R-01 | 🟠 P1 | `frontend/src/hooks/useGame.js` | 오케스트레이터 훅(508줄)이 흐름 조율 외에 직렬화(`serializeGameState`)·저장 스케줄(`debouncedSave`)·접바둑 배치(`buildHandicapState`)·자동기권 판정(`requestAI` 내 200수↑·승률<0.5%)·사운드 트리거까지 직접 수행 — **O-W 6원칙 세트, §3 Orchestrator 제약**("직접 비즈니스 로직 연산 지양") 위반 |
| R-02 | 🟢 기술부채 | `useGame.js:48,112` · `stoneSound.js:1-16` | 모듈 전역 mutable 상태(`saveTimer`)와 모듈 로드 시점 사이드이펙트(localStorage 읽기, `AudioContext` 생성 + mp3 fetch) — **O-W 6원칙 세트, 상태 공유 원칙**(Service 분리·주입) 밖의 전역 공유 |
| R-03 | 🟠 P1 | `relay.js:3,31` · `katago-client.mjs` · `katago.go:113` | 타임아웃 계층 불일치: frontend 65초 + 최대 4회 재시도 / backend→katago-server fetch 무제한 / GTP 300초. 프런트 재시도가 KataGo mutex 큐 뒤에 중복 적재되어 지연이 누적·증폭될 수 있음 |
| R-04 | 🟡 운영 | `katago.go:23` (`mu sync.Mutex`) | 단일 KataGo 프로세스 + mutex 직렬화 — 동시 요청은 순차 처리. 매 요청마다 `clear_board` 후 전체 수순 replay(수가 늘수록 GTP 왕복 증가) |
| R-05 | 🟡 운영 | `validator.mjs:73` · `katago.go:495-526` | rank 검증 정규식 `\d+[kd]` 는 임의 급수를 허용하나 지원 테이블은 15k~7d 12종뿐 — 미지원 급수(예: 20k)는 `getRankSettings` ok=false 로 **조용히 무시**되어 기본 강도로 동작. README 는 "20k~7d" 로 표기(문서-코드 불일치) |
| R-06 | 🟢 기술부채 | `relay.js:70-74` · `server.js:134-156` | `/api/v1/score` 경로와 `requestScore` 함수가 존재하나 UI 어디서도 호출하지 않음(dead code) — 승률 표시는 genmove 응답 동봉 값 사용 |
| R-07 | 🟢 기술부채 | `relay.js:57` | 힌트 요청이 komi 6.5 · rank '7d' 하드코딩 — 접바둑(komi 0.5) 대국에서도 6.5 기준으로 분석 |
| R-08 | 🟢 기술부채 | `useGame.js:112-119,453-468` | `reset` 이 pending `saveTimer` 를 취소하지 않음 — 종료 직전 1초 내 착수의 지연 저장이 삭제 후 발화하면 이전 세션 ID 로 고아 파일 재생성 가능 |
| R-09 | 🟢 기술부채 | `server.js:129,154` | 500 응답에 내부 `err.message` 를 그대로 노출(로컬 전용이라 영향 낮음) |

## 3. 최소 조각 (8개)

| 조각 | 종류 | 한 줄 책임 |
|---|---|---|
| **User** | Actor | 착수·설정 입력과 결과 확인 (브라우저) |
| **GameUI** | Boundary/UI | 바둑판 렌더(Canvas)·입력 수집·정보 표시 — `App.jsx`, `components/` |
| **GameHook** | Orchestrator | 게임 상태 보유와 대국 흐름 조율 — `hooks/useGame.js` |
| **RuleEngine** | Worker(무상태) | 착수 합법성·따냄·패(ko) 판정 — `logic/rules.js` |
| **RelayGateway** | Gateway | AI 요청(재시도·타임아웃)과 게임 저장 API 캡슐화 — `api/relay.js`, `api/gameState.js` |
| **BackendAPI** | Boundary/Orchestrator | 요청 검증·katago-server 중계·게임 파일 CRUD — `backend/server.js` |
| **KataGoEngine** | Gateway+Worker | KataGo 서브프로세스 GTP 구동·급수 설정·형세 추정 — `katago-server/main.go`, `katago.go` |
| **GameFileStore** | State | 세션별 게임 상태 JSON 파일 — `backend/game-store.mjs`, `backend/data/games/` |

## 4. method-R 깊이 사전판정

| 계층 | 분할 단위 | 통신 모드 | 도달 판정(멈춤 휴리스틱) |
|---|---|---|---|
| 매크로 (L1) | 사용자 ↔ play361 로컬 시스템 ↔ KataGo 엔진·게임 파일 | 경계 메시지(HTTP·GTP stdio·파일 IO) | 코드 도달 — 한 장으로 표현 |
| 시스템 (L2) | frontend / backend / katago-server 3서비스 | **Orchestration**(동기 HTTP 체인, 브로커 없음) | 코드 도달 — GameHook 이 사실상 전체 흐름의 조율자 |
| 모듈 (L3) | frontend 7모듈 · backend 4모듈 · katago-server 4모듈 | 내부 이벤트/직접 호출 | 코드 도달 — frontend 가 가장 깊음 |
| 상세 (L4) | `KataGoEngine.GenMove` 내부(GTP replay·rank·taint 복구), `GameHook.requestAI` 분기 | 내부 호출 | **이 두 곳만** 코드 도달. `rules.js` 등 단일 함수 워커는 모듈 계층에서 멈춤(더 쪼개면 코드 사본) |
