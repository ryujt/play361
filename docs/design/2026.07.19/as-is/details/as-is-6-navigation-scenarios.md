# AS-IS 상세 — Navigation 시나리오 (Navigation Diagram)

> 대상: 핵심 문서 [§6 Navigation Diagram](../system-design-as-is.md) — 전체 네비게이션 1장에 이어 시나리오별 상세.
> 근거: [_evidence-brief.md](../../_evidence-brief.md) §1 (frontend `main.jsx`·`App.jsx`·`useGame.js`·`api/`)

화면은 3개뿐이며 서로 링크로 이동하지 않는다(`main.jsx` 가 접속 경로로 1회 선택). 따라서 시나리오 대부분은 GameBoard 단일 화면 안의 상태 전환과 API 분기다.

## 시나리오 1 — 첫 접속·이어하기

```navigation
Browser --> GameBoard : / 접속
GameBoard --> (/api/v1/game/load)
(/api/v1/game/load) --> GameBoard : saved, 보드 복원
(/api/v1/game/load) --> (request_ai) : saved_and_white_turn
(request_ai) --> GameBoard : ai_move
(/api/v1/game/load) --> GameBoard : empty_or_error, 새 대국 설정
```

- 트리거: 페이지 마운트 1회(`useGame.js:146-158`). sessionId 는 localStorage 에서 가져오거나 새로 발급.
- 주요 분기: 저장 게임이 백 차례(AI 사고 중 새로고침)였으면 자동으로 AI 요청을 재개한다.
- 예외: 로드 실패는 콘솔 로그 후 새 대국으로 진행 — 사용자에게 알리지 않음.

## 시나리오 2 — 데스크톱 착수 → AI 응수

```navigation
GameBoard --> (validate_move) : 교차점 클릭
(validate_move) --> GameBoard : illegal, 무반응
(validate_move) --> (/api/v1/genmove) : legal, 흑돌 표시 후
(/api/v1/genmove) --> GameBoard : ai_move, 백돌·승률 갱신
(/api/v1/genmove) --> GameBoard : ai_pass
(/api/v1/genmove) --> GameBoard : resign_or_auto_resign, 종료 오버레이
(/api/v1/genmove) --> GameBoard : error, 에러 스트립
```

- 트리거: 흑 차례·AI 비사고·비종료 상태의 캔버스 클릭.
- 관련 API: `/api/v1/genmove` (전체 수순 + rank 동봉).
- 예외: 65초 타임아웃 시 재시도 토스트("서버 응답 시간이 지나서 다시 시도합니다") 후 최대 4회 재시도, 소진 시 에러 스트립.

## 시나리오 3 — 모바일 미리보기 착수

```navigation
GameBoard --> (validate_move) : 교차점 터치
(validate_move) --> GameBoard : legal, 반투명 미리보기 표시
(validate_move) --> GameBoard : illegal, 무반응
GameBoard --> (validate_move) : 같은 자리 재터치
(validate_move) --> GameBoard : 미리보기 해제
GameBoard --> (/api/v1/genmove) : 착수 버튼 확정
(/api/v1/genmove) --> GameBoard : ai_move
```

- 트리거: 모바일 판정(userAgent 또는 터치+폭<1024) 시 터치는 미리보기, 하단 "착수" 버튼이 확정.
- 주요 분기: 다른 교차점 터치는 미리보기 이동, 같은 자리는 토글 해제.

## 시나리오 4 — 접바둑 시작

```navigation
GameBoard --> GameBoard : 치석 선택, 미리 배치 표시
GameBoard --> (start_handicap) : 보드 터치 또는 게임 시작 버튼
(start_handicap) --> (/api/v1/genmove) : 백 선착 요청
(/api/v1/genmove) --> GameBoard : ai_move
```

- 트리거: `handicap > 0` 이고 `gameStarted == false` 인 상태의 첫 입력.
- 관련 데이터: 치석 2~9점 화점 배치, komi 0.5, 백(AI)이 먼저 둔다.
- 예외: 대국 시작 후 급수·치석 셀렉트는 비활성화.

## 시나리오 5 — 힌트

```navigation
GameBoard --> (/api/v1/genmove) : 힌트 버튼, rank_7d
(/api/v1/genmove) --> GameBoard : hint_marker, 효과음
(/api/v1/genmove) --> GameBoard : error, 힌트 오류 표시
```

- 트리거: 흑 차례·1수 이상 진행 시 활성화. 응답 좌표에 초록 링 마커.
- 예외: 재시도 1회. 힌트 표시 중 착수하면 마커 제거.

## 시나리오 6 — 패스·무르기 (화면 이동 없음)

```navigation
GameBoard --> (/api/v1/genmove) : 패스 버튼
(/api/v1/genmove) --> GameBoard : ai_move_or_pass
GameBoard --> GameBoard : 쌍방 패스, 종료 오버레이
GameBoard --> GameBoard : 무르기, 직전 흑 차례 복원
```

- 패스도 수순에 기록되어 AI 에 전달된다. 연속 2패스면 즉시 종료(AI 요청 없음).
- 무르기는 히스토리 스냅샷 복원 — 서버 왕복 없음, 종료 상태에서도 가능(대국 재개).

## 시나리오 7 — 대국 종료 · 새 게임

```navigation
GameBoard --> GameBoard : 종료 오버레이 5초 표시
GameBoard --> (/api/v1/game) : 게임 종료 버튼, DELETE
(/api/v1/game) --> GameBoard : 설정 화면 복귀, 새 세션 ID
```

- 종료 사유별 문구: 기권 "흑 불계승 — AI가 기권하였습니다" / 쌍방 패스 "대국 종료". 계가(집 계산) 화면은 없다 — 승률 게이지가 최종 형세를 대신한다.
- 게임 종료 버튼은 진행 중이면 "게임 종료", 아니면 "게임 시작" 라벨로 동작한다.

## 시나리오 8 — Analytics · Privacy 직접 접속

```navigation
Browser --> Analytics : /analytics 접속
Analytics --> (/api/v1/analytics)
(/api/v1/analytics) --> Analytics : empty_stub, 데이터 없음 표시
(/api/v1/analytics) --> Analytics : error, 오류 문구
Browser --> Privacy : /privacy 접속
```

- Analytics 는 로컬 스텁이라 요약 0·빈 차트·빈 URL 표가 뜬다(화면 골격 검증용).
- Privacy 는 정적 페이지(원본 AWS 기준 문구가 남아 있음 — DynamoDB TTL 언급).
- 두 페이지 모두 GameBoard 로 돌아가는 링크가 없다(주소 직접 이동).
