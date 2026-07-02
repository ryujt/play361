export default function Controls({
  preview,
  aiThinking,
  gameOver,
  gameStarted,
  currentColor,
  isMobile,
  hintLoading,
  moveCount,
  canUndo,
  onConfirm,
  onPass,
  onUndo,
  onHint,
  onReset,
}) {
  const isHumanTurn = currentColor === 1 && !aiThinking && !gameOver;

  const gameInProgress = gameStarted && !gameOver;

  return (
    <div className="controls-section">
      {isMobile && (
        <button
          className="btn-confirm"
          disabled={!preview || !isHumanTurn}
          onClick={onConfirm}
        >
          착수
        </button>
      )}

      <div className="action-row">
        <button
          className="btn-action"
          disabled={hintLoading || !isHumanTurn || moveCount === 0}
          onClick={onHint}
        >
          {hintLoading ? '분석중...' : '힌트'}
        </button>
        <button
          className="btn-action"
          disabled={!canUndo}
          onClick={onUndo}
        >
          무르기
        </button>
        <button
          className="btn-action"
          disabled={!isHumanTurn}
          onClick={onPass}
        >
          패스
        </button>
        <button
          className="btn-action btn-action--danger"
          onClick={onReset}
        >
          {gameInProgress ? '게임 종료' : '게임 시작'}
        </button>
      </div>
    </div>
  );
}
