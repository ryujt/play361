# AS-IS 상세 — Job Flow 전체 (Job Flow Diagram)

> 대상: 핵심 문서 [§5 Job Flow Diagram](../system-design-as-is.md)
> 근거: [_evidence-brief.md](../../_evidence-brief.md) §4 method-R 깊이 사전판정 (매크로·시스템·모듈·상세 각 계층의 코드 도달 범위)
> 표기 주의: 코드상 한 함수 안의 인라인 분기를 흐름으로 드러내야 할 때는 `HandleAIResult` 처럼 메서드 경계로 승격해 표기했다(해당 표기마다 명시). 그 외 이름은 실제 코드 함수명을 따른다. 화살표 없는 단독 분기 줄(예: `RuleEngine.TryPlace.false`)은 후속 흐름이 없는 무시 분기다(job-flow-diagram-guide §무시 분기 표기).

## 1. 매크로 계층 — 시스템 경계

```jobflow
scope: play361로컬시스템
Object: 사용자, play361로컬시스템, KataGo엔진, 게임파일저장소

사용자.On착수 --> play361로컬시스템.응수생성
play361로컬시스템.응수생성 --> KataGo엔진.message.수계산요청
KataGo엔진.On수계산완료 --> play361로컬시스템.응수반영
play361로컬시스템.응수반영.result --> 사용자.message.보드갱신
play361로컬시스템.On상태변경 --> 게임파일저장소.message.상태저장
사용자.On재접속 --> play361로컬시스템.게임로드
play361로컬시스템.게임로드.result --> 사용자.message.이어하기보드
```

- 시스템 밖 행위자는 사용자·KataGo 엔진(별도 프로세스)·게임 파일뿐이다. 네트워크 외부 의존이 전혀 없다.
- KataGo 와의 경계 메시지는 GTP stdin/stdout 텍스트, 저장소와는 파일 IO 다.

## 2. 시스템 계층 — 전체 확장(재시도·저장 포함)

핵심 문서 §5 대표 jobflow 의 확장판. `HandleAIResult`·`HandleTimeout` 은 `requestAI`/`fetchOnce` 의 인라인 구간 표기.

```jobflow
orchestrator: GameHook
Object: User, GameUI, GameHook, RuleEngine, CoordConverter, RelayGateway, BackendAPI, KataGoEngine, GameFileStore

User.On착수 --> GameHook.HandleIntersection
GameHook.HandleIntersection --> RuleEngine.TryPlace
RuleEngine.TryPlace.false
RuleEngine.TryPlace.true --> GameHook.RequestAI
GameHook.RequestAI --> CoordConverter.ToGTP
CoordConverter.ToGTP.result --> RelayGateway.RequestAIMove
RelayGateway.RequestAIMove --> BackendAPI.HandleGenmove
BackendAPI.HandleGenmove --> KataGoEngine.GenMove
KataGoEngine.GenMove.result --> BackendAPI.HandleGenmove.result
BackendAPI.HandleGenmove.result --> RelayGateway.RequestAIMove.result
RelayGateway.HandleTimeout --> GameUI.message.재시도토스트
RelayGateway.RequestAIMove.result --> GameHook.HandleAIResult
GameHook.HandleAIResult.자동기권 --> GameUI.message.기권종료오버레이
GameHook.HandleAIResult.패스기권 --> GameHook.ApplyAIPass
GameHook.ApplyAIPass --> GameUI.message.종료또는턴전환
GameHook.HandleAIResult.좌표 --> CoordConverter.FromGTP
CoordConverter.FromGTP.result --> RuleEngine.TryPlace
RuleEngine.TryPlace.false --> GameUI.message.오류표시
RuleEngine.TryPlace.true --> GameUI.message.보드갱신
GameHook.OnStateChanged --> GameHook.DebouncedSave
GameHook.DebouncedSave --> RelayGateway.SaveGame
RelayGateway.SaveGame --> BackendAPI.HandleGameSave
BackendAPI.HandleGameSave --> GameFileStore.SaveGameState
```

- 65초 안에 응답이 없으면 RelayGateway 가 요청을 끊고 최대 4회 재시도하며, 매 재시도마다 토스트를 띄운다(`relay.js:31-54`).
- AI 응답은 4갈래로 갈린다: 자동기권(200수↑·AI 승률<0.5%) / 패스·기권 / 정상 좌표 / 불법·범위 밖 좌표(오류 표시).
- 상태 변경 1초 뒤 저장 체인이 실행된다 — `gameStarted && loaded` 조건에서만(`useGame.js:171-175`).
- 요청 중 `moves.length` 가 달라져 있으면(무르기·리셋) 응답을 폐기한다 — 낙관적 동시성 가드(`useGame.js:201,218,237,244`).

## 3. 모듈 계층 — 착수 입력 분기 (frontend)

```jobflow
orchestrator: GameHook
Object: GameUI, GameHook, SoundService, RuleEngine

GameUI.OnIntersection --> GameHook.HandleIntersection
GameHook.HandleIntersection --> SoundService.InitStoneSound
GameHook.HandleIntersection.접바둑대기 --> GameHook.StartHandicapGame
GameHook.HandleIntersection.모바일 --> GameHook.SetPreview
GameHook.SetPreview --> RuleEngine.TryPlace
RuleEngine.TryPlace.true --> GameUI.message.반투명미리보기
GameHook.HandleIntersection.데스크톱 --> GameHook.PlaceDirectly
GameUI.OnConfirm --> GameHook.ConfirmMove
GameUI.OnPass --> GameHook.Pass
GameUI.OnUndo --> GameHook.Undo
GameUI.OnHint --> GameHook.GetHint
GameUI.OnReset --> GameHook.Reset
```

- 모바일 판정은 userAgent 또는 터치+좁은 화면(`useGame.js:27-30`) — 모바일은 미리보기 후 "착수" 버튼으로 확정한다.
- 접바둑 설정 상태에서 첫 터치는 착수가 아니라 대국 시작 트리거다(치석은 이미 미리 배치됨).
- 흑 차례가 아니거나 AI 사고 중·종료 후에는 모든 착수 입력이 무시된다.

## 4. 모듈 계층 — 저장·로드·리셋 (frontend ↔ backend)

```jobflow
orchestrator: GameHook
Object: GameUI, GameHook, RelayGateway, BackendAPI, GameFileStore

GameHook.OnMount --> RelayGateway.LoadGame
RelayGateway.LoadGame --> BackendAPI.HandleGameLoad
BackendAPI.HandleGameLoad --> GameFileStore.LoadGameState
GameFileStore.LoadGameState.result --> BackendAPI.HandleGameLoad.result
BackendAPI.HandleGameLoad.result --> RelayGateway.LoadGame.result
RelayGateway.LoadGame.result --> GameHook.RestoreState
GameHook.RestoreState.백차례재개 --> GameHook.RequestAI

GameUI.OnReset --> GameHook.Reset
GameHook.Reset --> RelayGateway.DeleteGame
RelayGateway.DeleteGame --> BackendAPI.HandleGameDelete
BackendAPI.HandleGameDelete --> GameFileStore.DeleteGameState
GameHook.Reset --> RelayGateway.ResetSessionId
GameHook.Reset.접바둑설정 --> GameHook.StartHandicapGame
GameHook.Reset.호선 --> GameUI.message.설정화면복귀
```

- 로드 결과가 백 차례에서 저장된 게임이면 즉시 AI 요청을 재개한다(`useGame.js:273-278`) — 사고 중 새로고침해도 이어진다.
- 리셋은 서버 파일 삭제 + 세션 ID 재발급 + 초기 상태 복귀. ⚠️ pending 저장 타이머는 취소하지 않는다(R-08).
- 로드/저장/삭제 실패는 콘솔 로그만 남기고 화면에는 알리지 않는다(`gameState.js:27-29,39-42,52-54`).

## 5. 모듈 계층 — 힌트 (frontend ↔ backend)

```jobflow
orchestrator: GameHook
Object: GameUI, GameHook, RelayGateway, BackendAPI, CoordConverter, SoundService

GameUI.OnHint --> GameHook.GetHint
GameHook.GetHint --> RelayGateway.RequestHint
RelayGateway.RequestHint --> BackendAPI.HandleGenmove
BackendAPI.HandleGenmove.result --> RelayGateway.RequestHint.result
RelayGateway.RequestHint.result --> GameHook.ApplyHint
GameHook.ApplyHint --> CoordConverter.FromGTP
GameHook.ApplyHint --> SoundService.PlayHintSound
CoordConverter.FromGTP.result --> GameUI.message.힌트마커표시
```

- 힌트는 같은 `/api/v1/genmove` 를 흑 차례·rank '7d'·komi 6.5 하드코딩으로 호출한다(⚠️ R-07). 재시도는 1회.
- `ApplyHint` 는 `getHint` 함수 후반부의 표기용 경계. 응답 사이 수순이 바뀌면 폐기한다.

## 6. 모듈 계층 — backend genmove 처리

```jobflow
orchestrator: BackendAPI
Object: RelayGateway, BackendAPI, RequestValidator, KataGoClientGateway, GenmoveHandler

RelayGateway.RequestAIMove --> BackendAPI.HandleGenmove
BackendAPI.HandleGenmove --> RequestValidator.ValidateGenmoveRequest
RequestValidator.ValidateGenmoveRequest.오류메시지 --> RelayGateway.message.400응답
RequestValidator.ValidateGenmoveRequest.null --> KataGoClientGateway.SendToKataGo
KataGoClientGateway.SendToKataGo --> GenmoveHandler.HandleGenmove
GenmoveHandler.HandleGenmove.result --> KataGoClientGateway.SendToKataGo.result
KataGoClientGateway.SendToKataGo.success --> RelayGateway.message.200응답
KataGoClientGateway.SendToKataGo.failure --> RelayGateway.message.500응답
```

- backend 는 `request_id`(UUID)를 새로 발급해 payload 를 재조립한다 — 클라이언트 필드를 그대로 흘리지 않는다.
- katago-server 가 `success:false` 를 주면 게이트웨이가 예외로 승격하고, backend 는 500 + `err.message` 로 응답한다(⚠️ R-09).
- 이 fetch 에는 타임아웃이 없어 GTP 300초 동안 매달린다(⚠️ R-03).

## 7. 상세 계층 — KataGoEngine.GenMove 내부 (Sub-Orchestrator)

`katago.go` 의 KataGo 구조체가 서브프로세스를 부리는 상세 흐름. GTP 명령 실행(send + readResponseCtx 쌍)을 KataGoProcess 의 메서드로 표기했다.

```jobflow
orchestrator: KataGoEngine
Object: GenmoveHandler, KataGoEngine, KataGoProcess

GenmoveHandler.HandleGenmove --> KataGoEngine.GenMove
KataGoEngine.GenMove.tainted --> KataGoEngine.Restart
KataGoEngine.Restart --> KataGoProcess.Kill
KataGoEngine.Restart --> KataGoProcess.Start
KataGoEngine.GenMove --> KataGoProcess.ClearBoard
KataGoProcess.ClearBoard.result --> KataGoProcess.SetBoardsize
KataGoProcess.SetBoardsize.result --> KataGoProcess.SetKomi
KataGoProcess.SetKomi.result --> KataGoProcess.ReplayMoves
KataGoProcess.ReplayMoves.result --> KataGoEngine.ApplyRankSettings
KataGoEngine.ApplyRankSettings --> KataGoProcess.SetRankParams
KataGoProcess.SetRankParams.result --> KataGoProcess.Genmove
KataGoProcess.Genmove.result --> KataGoEngine.EstimateScoreRaw
KataGoEngine.EstimateScoreRaw --> KataGoProcess.KataRawNN
KataGoProcess.KataRawNN.result --> KataGoEngine.GenMove.result
KataGoProcess.OnReadTimeout --> KataGoEngine.MarkTainted
```

- 실제 GTP 명령: `clear_board` → `boardsize 19` → `komi` → `play`×수순 → `kata-set-param`×(3~7개) → `genmove` → `kata-raw-nn 0`. 전 과정 300초 컨텍스트 타임아웃.
- 급수 파라미터: `maxVisits`·`chosenMoveTemperature(+Early)` 공통, Human SL 모델이 있으면 `humanSLProfile`·`humanSLChosenMoveProp`·`humanSLChosenMoveIgnorePass`·`humanSLChosenMovePiklLambda` 추가(`katago.go:538-575`). 미지원 rank 는 무읽음 통과(⚠️ R-05).
- 타임아웃이 나면 읽기 고루틴이 stdout 에 매달린 채 남아 GTP 입출력이 어긋나므로 `tainted` 만 마킹하고, **다음 요청 진입 시** 프로세스를 죽이고 재기동한다(`katago.go:119-125,391-411`).
- `kata-raw-nn` 실패는 경고만 남기고 수만 반환한다(승률 없이) — 형세 추정은 best-effort.
- `EstimateScore`(type=score)는 같은 replay 후 `kata-raw-nn 0` 만 수행하는 동일 골격이다(`katago.go:246-293`).

## 8. 기동 흐름 (dev.sh · run.sh)

```jobflow
orchestrator: KataGoServerMain
Object: DevScript, KataGoServerMain, Config, KataGoEngine, KataGoProcess, HTTPServer, BackendMain, FrontendDev

DevScript.OnStart --> KataGoServerMain.Run
DevScript.OnStart --> BackendMain.Listen
DevScript.OnStart --> FrontendDev.Serve
KataGoServerMain.Run --> Config.LoadConfig
Config.LoadConfig.result --> KataGoEngine.NewKataGo
KataGoEngine.NewKataGo --> KataGoProcess.Start
KataGoProcess.Start.result --> KataGoEngine.WaitReady
KataGoEngine.WaitReady.result --> HTTPServer.ListenAndServe
DevScript.OnInterrupt --> DevScript.KillAll
```

- `scripts/dev.sh` 가 세 컴포넌트를 백그라운드로 동시 기동하고 trap 으로 일괄 종료한다. 기동 순서 보장은 없다(먼저 뜬 쪽이 연결 실패 시 오류 응답 → 프런트 재시도로 흡수).
- `waitReady` 는 `protocol_version` 프로브 응답으로 KataGo 준비를 확인한다. 정상 종료 시 GTP `quit` 핸드셰이크(`katago.go:296-314`).

## 9. 예외·오류 분기 총괄

| 지점 | 조건 | 현재 동작 | 근거 |
|---|---|---|---|
| RuleEngine.tryPlace | 점유·패 금지점·자살수 | null 반환 → 착수 무시(무표시) | `rules.js:47-85` |
| RelayGateway | 65초 무응답·HTTP 오류·success:false | 최대 4회 재시도 + 토스트, 소진 시 에러 스트립 | `relay.js:31-54` |
| GameHook | AI 가 불법·범위 밖 좌표 | `error` 표시, 턴은 흑에 남음 | `useGame.js:234-248` |
| GameHook | 응답 도착 시 수순 변경됨 | 응답 폐기(aiThinking 만 해제) | `useGame.js:201,218,237` |
| BackendAPI | JSON 파싱 실패·검증 실패 | 400 + 사유 | `server.js:56,110-113` |
| BackendAPI | katago-server 실패 | 500 + `err.message`(⚠️ R-09) | `server.js:127-130` |
| KataGoEngine | GTP `?` 오류 응답 | 오류 승격 → success:false | `katago.go:377-380` |
| KataGoEngine | 300초 타임아웃 | tainted 마킹 → 다음 요청에서 재기동 | `katago.go:391-411` |
| GameFileStore | 파일 없음(ENOENT) | load: null / delete: 무시 | `game-store.mjs:22-38` |
