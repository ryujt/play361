# AS-IS 상세 — 상태·라이프사이클 (State Diagram)

> 대상: 핵심 문서 [§7 State Diagram](../system-design-as-is.md)
> 근거: [_evidence-brief.md](../../_evidence-brief.md) §1 (`useGame.js`·`katago.go`·`game-store.mjs`)

## 1. 대국 상태 전체 (useGame 상태 필드 조합)

핵심 문서 1장에 AI 사고·오류 세부를 더한 전체판.

```state
<s> --> (Loading)
(Loading) --> (Setup) : 저장 게임 없음
(Loading) --> (BlackTurn) : 흑 차례로 복원
(Loading) --> (AIThinking) : 백 차례로 복원, 자동 재요청
(Setup) --> (Setup) : 급수·치석 변경
(Setup) --> (AIThinking) : 첫 착수 또는 접바둑 시작
(BlackTurn) --> (Preview) : 모바일 터치
(Preview) --> (BlackTurn) : 재터치 해제
(Preview) --> (AIThinking) : 착수 확정
(BlackTurn) --> (AIThinking) : 데스크톱 착수, 패스
(BlackTurn) --> (GameOver) : 쌍방 패스
(AIThinking) --> (BlackTurn) : AI 착수·패스 반영
(AIThinking) --> (GameOver) : 기권, 자동기권, 쌍방 패스
(AIThinking) --> Retry Toast : 65초 경과
Retry Toast --> (AIThinking) : 재시도, 최대 4회
(AIThinking) --> (BlackTurn) : 재시도 소진, 에러 표시
(BlackTurn) --> (BlackTurn) : 무르기, 힌트
(GameOver) --> (BlackTurn) : 무르기
(GameOver) --> (Setup) : 게임 종료 버튼
```

- Loading 은 마운트 후 `/game/load` 응답까지의 구간(`loaded` 플래그). 이 동안 착수해도 저장이 시작되지 않는다.
- AIThinking 진입은 항상 `setTimeout 50ms` 뒤에 실행되고, `aiThinkingRef` 로 중복 요청을 막는다.
- 오류로 BlackTurn 에 돌아와도 게임은 계속된다 — 같은 수순으로 재착수 시 다시 AI 요청.

### 상태 필드 대응표

| 논리 상태 | 판별 필드 조합 |
|---|---|
| Loading | `loaded == false` |
| Setup | `loaded && !gameStarted` |
| BlackTurn | `gameStarted && currentColor == 1 && !aiThinking && !gameOver` |
| Preview | BlackTurn + `preview != null` (모바일) |
| AIThinking | `aiThinking == true` (UI 는 THINKING 배지·입력 차단) |
| GameOver | `gameOver == true` + `endReason` |

## 2. KataGo 프로세스 상태 (katago-server)

```state
<s> --> (Starting)
(Starting) --> (Ready) : protocol_version 응답
(Starting) --> <e> : 기동 실패, 서버 종료
(Ready) --> (Busy) : genmove·score 요청, mutex 획득
(Busy) --> (Ready) : GTP 응답 완료
(Busy) --> (Tainted) : 300초 타임아웃, 읽기 고루틴 잔류
(Tainted) --> Restart Process : 다음 요청 진입
Restart Process --> (Ready) : 재기동 성공
Restart Process --> <e> : 재기동 실패
(Ready) --> <e> : 서버 종료, GTP quit
```

- Busy 는 mutex 로 직렬화되어 있어 동시 요청은 Ready 앞에서 줄을 선다(⚠️ R-04). 큐 대기 중에도 프런트 65초 타이머는 흐른다(⚠️ R-03).
- Tainted 는 즉시 재기동하지 않는다 — 타임아웃을 낸 요청은 오류로 돌려주고, **다음** 요청이 재기동 비용을 진다.
- 프로세스가 죽어도 요청이 없으면 감지되지 않는다(헬스체크는 HTTP 서버 생존만 확인).

## 3. 세션 게임 파일 라이프사이클 (backend/data/games)

```state
<s> --> (NoFile)
(NoFile) --> (Saved) : 첫 디바운스 저장
(Saved) --> (Saved) : 1초 디바운스 덮어쓰기
(Saved) --> (NoFile) : 게임 종료 버튼, DELETE
(Saved) --> (Orphan) : 삭제 후 지연 저장 발화
(Orphan) --> <e> : 수동 삭제 외 회수 경로 없음
```

- 파일에는 TTL 이 없다 — 원본 서비스의 DynamoDB 7일 TTL 과 달리 무한 보관(Privacy 페이지 문구와도 어긋남).
- Orphan: reset 이 `saveTimer` 를 취소하지 않아, 종료 직전 1초 안의 착수 저장이 삭제 뒤 발화하면 옛 세션 ID 파일이 되살아난다(⚠️ R-08). 새 세션 ID 로는 다시 조회되지 않는다.

## 4. 프런트 휘발 상태(저장 제외) 정리

| 필드 | 역할 | 초기화 시점 |
|---|---|---|
| `aiThinking` / `aiThinkingRef` | AI 요청 중 입력 차단·중복 방지 | 응답·오류 처리 후 |
| `preview` | 모바일 미리보기 좌표 | 확정·해제·착수 시 |
| `hint` / `hintLoading` | 힌트 마커·로딩 | 착수·리셋 시 |
| `retryNotice` | 재시도 토스트 카운터 | 요청 종료 시 0 |
| `error` | 에러 스트립 문구 | 다음 정상 동작 시 |
| `loaded` | 서버 로드 완료 게이트 | 마운트 후 1회 true |
