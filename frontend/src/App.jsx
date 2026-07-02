import { useState, useEffect } from 'react';
import Board from './components/Board.jsx';
import GameInfo from './components/GameInfo.jsx';
import Controls from './components/Controls.jsx';
import { useGame } from './hooks/useGame.js';
import { isSoundMuted, toggleSound, initStoneSound, playGameEndSound } from './audio/stoneSound.js';
import './App.css';

function Logo() {
  const [muted, setMuted] = useState(isSoundMuted);

  const handleToggle = () => {
    initStoneSound();
    setMuted(toggleSound());
  };

  return (
    <header className="logo-header">
      <svg className="logo-icon" viewBox="0 0 40 40" width="32" height="32">
        <rect x="2" y="2" width="36" height="36" rx="4" fill="#c8a165" />
        <line x1="13" y1="4" x2="13" y2="36" stroke="#8b6914" strokeWidth="0.8" />
        <line x1="27" y1="4" x2="27" y2="36" stroke="#8b6914" strokeWidth="0.8" />
        <line x1="4" y1="13" x2="36" y2="13" stroke="#8b6914" strokeWidth="0.8" />
        <line x1="4" y1="27" x2="36" y2="27" stroke="#8b6914" strokeWidth="0.8" />
        <circle cx="13" cy="13" r="5" fill="#222" />
        <circle cx="11.5" cy="11.5" r="1.5" fill="#555" opacity="0.6" />
        <circle cx="27" cy="27" r="5" fill="#eee" stroke="#bbb" strokeWidth="0.5" />
        <circle cx="25.5" cy="25.5" r="1.5" fill="#fff" opacity="0.8" />
        <circle cx="27" cy="13" r="5" fill="#222" />
        <circle cx="25.5" cy="11.5" r="1.5" fill="#555" opacity="0.6" />
      </svg>
      <span className="logo-text">play361</span>
      <button className="sound-toggle" onClick={handleToggle} aria-label={muted ? '소리 켜기' : '소리 끄기'}>
        {muted ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 010 14.14" />
            <path d="M15.54 8.46a5 5 0 010 7.07" />
          </svg>
        )}
      </button>
    </header>
  );
}

function GameEndOverlay({ endReason }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!endReason) { setVisible(false); return; }
    setVisible(true);
    playGameEndSound();
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [endReason]);

  if (!visible || !endReason) return null;

  const messages = {
    resign:      { icon: '🏳️', title: '흑 불계승', subtitle: 'AI가 기권하였습니다' },
    double_pass: { icon: '🏁', title: '대국 종료', subtitle: '쌍방 패스로 종료되었습니다' },
  };

  const msg = messages[endReason] || messages.double_pass;

  return (
    <div className="game-end-overlay">
      <div className="game-end-card">
        <span className="game-end-icon">{msg.icon}</span>
        <h2 className="game-end-title">{msg.title}</h2>
        <p className="game-end-subtitle">{msg.subtitle}</p>
      </div>
    </div>
  );
}

function RetryToast({ retryCount }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (retryCount > 0) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 5000);
      return () => clearTimeout(timer);
    }
    setShow(false);
  }, [retryCount]);

  if (!show) return null;

  return (
    <div className="retry-toast">
      서버 응답 시간이 지나서 다시 시도합니다.
    </div>
  );
}

export default function App() {
  const game = useGame();

  return (
    <div className="app">
      <Logo />

      <div className="board-section">
        <div className="board-wrapper">
          <Board
            board={game.board}
            lastMove={game.lastMove}
            preview={game.isMobile ? game.preview : null}
            hint={game.hint}
            onIntersection={game.handleIntersection}
          />
          {game.gameOver && <GameEndOverlay endReason={game.endReason} />}
          <RetryToast retryCount={game.retryNotice} />
        </div>
      </div>

      <div className="sidebar">
        <GameInfo
          currentColor={game.currentColor}
          aiThinking={game.aiThinking}
          gameOver={game.gameOver}
          moveCount={game.moveCount}
          rank={game.rank}
          handicap={game.handicap}
          gameStarted={game.gameStarted}
          onRankChange={game.setRank}
          onHandicapChange={game.setHandicap}
          error={game.error}
          score={game.score}
        />
        <Controls
          preview={game.preview}
          aiThinking={game.aiThinking}
          gameOver={game.gameOver}
          gameStarted={game.gameStarted}
          currentColor={game.currentColor}
          isMobile={game.isMobile}
          hintLoading={game.hintLoading}
          moveCount={game.moveCount}
          canUndo={game.canUndo}
          onConfirm={game.confirmMove}
          onPass={game.pass}
          onUndo={game.undo}
          onHint={game.getHint}
          onReset={game.reset}
        />
      </div>
    </div>
  );
}
