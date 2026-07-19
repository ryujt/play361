# AS-IS 상세 — 화면 레이아웃 (Screen Layout)

> 대상: 핵심 문서 [§8 Screen Layout](../system-design-as-is.md)
> 근거: [_evidence-brief.md](../../_evidence-brief.md) §1 (`App.jsx`·`App.css`·`Analytics.jsx`·`Privacy.jsx`)

## 1. GameBoard — 모바일(기본, 세로 적층)

```layout
Screen V LogoHeader, BoardSection, Sidebar
LogoHeader > LogoIcon, LogoText, SoundToggle
BoardSection V BoardCanvas
Sidebar V PlayerCards, WinRateGauge, InfoBar, ControlsSection
PlayerCards > BlackPlayerCard, AIPlayerCard
InfoBar > RankSelect, HandicapSelect, MoveCounter
ControlsSection V ConfirmButton, ActionRow
ActionRow > HintButton, UndoButton, PassButton, ResetButton
```

- 화면 전체 스크롤 없음(`overflow:hidden`) — 바둑판이 정사각으로 최대 크기를 차지하고 나머지가 세로로 쌓인다.
- ConfirmButton("착수")은 모바일 판정 시에만 렌더된다(`App.jsx`의 `isMobile` 분기 → `Controls.jsx:23-31`).
- 종료 오버레이·재시도 토스트는 BoardSection 위에 절대 배치로 겹쳐진다.

## 2. GameBoard — 데스크톱 (`min-width:768px` + `min-aspect-ratio:1/1`)

```layout
Screen > BoardSection : 70, Sidebar : 30
BoardSection V BoardCanvas
Sidebar V LogoHeader, PlayerCards, WinRateGauge, InfoBar, ControlsSection
```

- 같은 DOM 을 CSS 미디어쿼리로 재배치한다(`App.css:448-470`) — `.app` 이 가로 flex 로 바뀌고 로고가 사이드바 안으로 들어간 시각 효과.
- 착수는 클릭 즉시 확정이라 ConfirmButton 이 없다.
- 비율 수치는 flex 배분(바둑판 `flex:1`, 사이드바 고정폭)의 근사 표기다.

## 3. Analytics 페이지 (`/analytics`)

```layout
Screen V Title, Subtitle, SummaryCards, VisitorsChart, RequestsChart, TopUrlTable, Timestamp
SummaryCards > DaysCard, VisitorsCard, RequestsCard, AvgCard
```

- Recharts 라인 차트 2개(일별 사용자·일별 요청)와 Top 50 URL 표. 로컬 스텁이라 전부 "수집된 데이터가 없습니다" 상태로 표시된다.
- 로딩·오류 시에는 차트 대신 문구만 표시.

## 4. Privacy 페이지 (`/privacy`)

```layout
Screen V Title, EffectiveDate, PolicySections
```

- 최대폭 640px 중앙 정렬의 정적 문서 7개 절. 인라인 스타일만 사용(App.css 미사용).

## 5. 색·타이포 토큰 (참고)

- 다크 테마 고정: 배경 `#0f141a`, 표면 4단계, 주색 `#59de9b`(초록 — 힌트 마커·승률 게이지와 공유), 보조 `#e1c299`.
- 바둑판은 CSS 가 아닌 Canvas 로 그린다: 판 `#c8a165`, 선·화점 반투명 갈색, 돌은 radial gradient(`Board.jsx:10-120`).
- 폰트: 본문 Manrope, 로고 Noto Serif.
