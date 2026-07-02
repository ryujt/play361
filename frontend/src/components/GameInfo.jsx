const RANKS = [
  { label: '15급', value: '15k' },
  { label: '10급', value: '10k' },
  { label: '7급',  value: '7k'  },
  { label: '5급',  value: '5k'  },
  { label: '3급',  value: '3k'  },
  { label: '1급',  value: '1k'  },
  { label: '1단',  value: '1d'  },
  { label: '2단',  value: '2d'  },
  { label: '3단',  value: '3d'  },
  { label: '4단',  value: '4d'  },
  { label: '5단',  value: '5d'  },
  { label: '7단',  value: '7d'  },
];

const HANDICAPS = [
  { label: '호선', value: 0 },
  { label: '2점', value: 2 },
  { label: '3점', value: 3 },
  { label: '4점', value: 4 },
  { label: '5점', value: 5 },
  { label: '6점', value: 6 },
  { label: '7점', value: 7 },
  { label: '8점', value: 8 },
  { label: '9점', value: 9 },
];

function rankLabel(value) {
  const found = RANKS.find((r) => r.value === value);
  return found ? found.label : value;
}

export default function GameInfo({
  currentColor,
  aiThinking,
  gameOver,
  moveCount,
  rank,
  handicap,
  gameStarted,
  onRankChange,
  onHandicapChange,
  error,
  score,
}) {
  const isBlackTurn = !gameOver && currentColor === 1 && !aiThinking;
  const isWhiteTurn = !gameOver && (currentColor === 2 || aiThinking);

  const blackPct = score ? (score.blackWinRate * 100).toFixed(1) : '50.0';
  const whitePct = score ? (100 - score.blackWinRate * 100).toFixed(1) : '50.0';
  const lead = score ? Math.abs(score.scoreLead).toFixed(1) : null;
  const leader = score && score.scoreLead >= 0 ? '흑' : '백';

  return (
    <>
      {/* Player status cards */}
      <div className="player-cards">
        <div className={`player-card ${isBlackTurn ? 'player-card--active' : 'player-card--inactive'}`}>
          <div className="player-card__row">
            <div className="player-card__stone player-card__stone--black" />
            <span className="player-card__name">YOU</span>
            <span className="player-card__rank-badge player-card__rank-badge--black">
              {gameOver ? 'END' : isBlackTurn ? 'TURN' : '—'}
            </span>
          </div>
        </div>

        <div className={`player-card ${isWhiteTurn ? 'player-card--active' : 'player-card--inactive'}`}>
          {aiThinking && (
            <span className="player-card__thinking-badge">
              <span className="player-card__thinking-dot" />
              THINKING
            </span>
          )}
          <div className="player-card__row">
            <div className="player-card__stone player-card__stone--white" />
            <span className="player-card__name">AI</span>
            <span className="player-card__rank-badge player-card__rank-badge--white">
              {rankLabel(rank)}
            </span>
          </div>
        </div>
      </div>

      {/* Win rate gauge — always visible */}
      <div className="winrate-gauge">
        <div className="winrate-gauge__labels">
          <span className="winrate-gauge__pct winrate-gauge__pct--black">{blackPct}%</span>
          <span className="winrate-gauge__center">
            {score ? (
              <span className="winrate-gauge__lead">{leader} {lead}집</span>
            ) : (
              <span className="winrate-gauge__label">WIN RATE</span>
            )}
          </span>
          <span className="winrate-gauge__pct winrate-gauge__pct--white">{whitePct}%</span>
        </div>
        <div className="winrate-gauge__bar">
          <div
            className="winrate-gauge__fill winrate-gauge__fill--black"
            style={{ width: `${blackPct}%` }}
          />
          <div
            className="winrate-gauge__fill winrate-gauge__fill--white"
            style={{ width: `${whitePct}%` }}
          />
        </div>
      </div>

      <div className="info-bar">
        <div className="info-bar__rank">
          <select
            className="info-bar__rank-select"
            value={rank}
            onChange={(e) => onRankChange(e.target.value)}
            disabled={gameStarted}
          >
            {RANKS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="info-bar__handicap">
          <select
            className="info-bar__rank-select"
            value={handicap}
            onChange={(e) => onHandicapChange(e.target.value)}
            disabled={gameStarted}
          >
            {HANDICAPS.map((h) => (
              <option key={h.value} value={h.value}>{h.label}</option>
            ))}
          </select>
        </div>
        <div className="info-bar__move">
          <span className="info-bar__move-display">{moveCount}수</span>
        </div>
      </div>

      {error && <div className="error-strip">{error}</div>}
    </>
  );
}
