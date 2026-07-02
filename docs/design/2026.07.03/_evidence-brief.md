# 근거 브리프 — play361 (로컬) AS-IS

> DATE: **2026.07.03** · 대상: 이 저장소(`/Users/ryu/projects/personal/play361`) 전체 소스코드
> 이후 모든 AS-IS 단계·TO-BE 는 소스코드 대신 이 파일을 1차 근거로 인용한다.

## 1. 근거 인벤토리 표

`docs/코드분석/`·`docs/design/<날짜>/code-analysis/` 산출물이 없어 **소스코드를 직접 분석**한다. 근거로 삼은 트리는 아래와 같다.

| # | 근거(실경로) | 종류 | 한 줄 |
|---|---|---|---|
| E1 | `frontend/src/` | 소스 | React 바둑 UI. 상태 훅·API 계층·바둑 규칙·컴포넌트 |
| E2 | `frontend/vite.config.js` | 설정 | `/api` → `:8788` 개발 프록시 |
| E3 | `backend/server.js` | 소스 | Node `http` API 서버. 라우팅 진입점 |
| E4 | `backend/validator.mjs` | 소스 | genmove·score 요청 검증 |
| E5 | `backend/katago-client.mjs` | 소스 | katago-server 로 HTTP 전달 |
| E6 | `backend/game-store.mjs` | 소스 | 게임 상태 파일 저장소 |
| E7 | `katago-server/main.go` | 소스 | Go HTTP 서버. genmove/score 핸들러 |
| E8 | `katago-server/katago.go` | 소스 | KataGo 프로세스 GTP 관리 |
| E9 | `katago-server/config.go` | 설정 | KataGo 경로·포트 기본값 |
| E10 | `README.md` · `run.sh` · `scripts/dev.sh` | 문서/스크립트 | 실행 방법·원클릭 기동 |

## 2. 이슈 목록 (R-NN · TO-BE 변경점 입력)

AS-IS 는 아래를 **있는 그대로 노출**만 한다(수정은 TO-BE 의 몫).

| ID | 심각도 | 위치 | 이슈 |
|---|---|---|---|
| R-01 | 🟡 운영 | `backend/katago-client.mjs` | 백엔드→katago-server `fetch` 에 자체 타임아웃 없음. 하위(프론트 65초·KataGo 300초) 타임아웃에만 의존 |
| R-02 | 🟢 기술부채 | `backend/game-store.mjs:11`, `server.js:83` | 경로 traversal 방어가 예외를 던져 500 + 스택트레이스로 처리됨. 400 이 더 적절 |
| R-03 | 🟡 운영 | `frontend/vite.config.js`, `README.md` | 프론트↔백엔드 연결이 Vite 개발 프록시 전용. 프로덕션 정적 서빙 경로 없음 |
| R-04 | 🟢 기술부채 | `frontend/src/hooks/useGame.js` | 단일 훅이 착수·AI 요청·저장·상태전이·기권판정을 모두 담당(약 450줄). 책임 과다 |
| R-05 | 🟡 운영 | `katago-server/katago.go` (`mu sync.Mutex`) | 단일 KataGo 프로세스를 뮤텍스로 직렬화. 동시 대국 불가(로컬 1인용엔 무방) |
| R-06 | 🟠 P1 | 저장소 전체 | 자동화 테스트 없음. 검증은 수동(curl·브라우저)뿐 |
| R-07 | 🟢 기술부채 | `backend/server.js`, `frontend/src/api/relay.js` | `/api/v1/score`·`requestScore` 경로는 정의돼 있으나 대국 루프에서 미사용 |
| R-08 | 🟢 기술부채 | `katago-server/config.go` | KataGo 바이너리·모델 경로가 homebrew(macOS) 기본값 하드코딩. 타 환경은 env 필요 |

## 3. 최소 조각 (조각 → 종류 → 한 줄 책임)

시스템을 이해하는 데 필요한 최소 단위 8개.

| 조각 | 종류 | 한 줄 책임 |
|---|---|---|
| `useGame` (E1) | 프론트 상태 오케스트레이터 | 바둑판 상태·착수·AI 요청 흐름을 소유하는 React 훅 |
| `api/relay.js` (E1) | 프론트 게이트웨이 | genmove/hint/score 를 백엔드에 요청(재시도·타임아웃) |
| `logic/rules.js` (E1) | 프론트 워커 | 착수 유효성·따냄·패 규칙 연산(무상태) |
| `server.js` (E3) | 백엔드 오케스트레이터 | HTTP 요청을 검증·저장·KataGo 호출로 라우팅 |
| `validator.mjs` (E4) | 백엔드 워커 | 요청 스키마 검증(무상태) |
| `katago-client.mjs` (E5) | 백엔드 게이트웨이 | katago-server 로 HTTP 전달·응답 언랩 |
| `game-store.mjs` (E6) | 백엔드 게이트웨이 | 세션별 게임 상태를 JSON 파일로 저장·조회 |
| `katago.go` (E8) | 카타고서버 상세 워커 | KataGo 프로세스에 GTP 로 기보 재생·genmove·형세 |

## 4. method-R 깊이 사전판정 표

| 계층 | 대상 | 도달 깊이 | 비고 |
|---|---|---|---|
| L1 매크로(외부 경계) | 브라우저 · 3개 로컬 프로세스 · KataGo 엔진 | 도달 | HTTP 메시지 경계. `scope:` |
| L2 시스템(번들 경계) | frontend · backend · katago-server | 도달 | 각 프로세스가 1 시스템 |
| L3 모듈(서비스 내부) | backend 4모듈 · katago-server 3모듈 · frontend 4모듈 | 도달 | `orchestrator:` 별 job flow |
| L4 상세(복잡 워커) | `katago.go` GTP 관리 · `useGame` 훅 | **부분 도달** | 이 둘만 상세 전개. 그 외 워커는 단순해 L4 없음(날조 금지) |

> **깊이 한계(정직 보고)**: 이 시스템은 이벤트 기반 Orchestrator-Worker 가 아니라 **프로세스 간 HTTP 요청/응답 파이프라인**이다. 6모듈(Main·core·gateways·service·utils·config) 분류는 근사 매핑이며, `service`(싱글톤 공유상태)·`core`(최상위 Worker 묶음) 계층은 코드에 뚜렷이 존재하지 않는다. 없는 계층은 만들지 않는다.
