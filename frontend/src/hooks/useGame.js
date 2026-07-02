import { useState, useCallback, useRef, useEffect } from 'react';
import { createEmptyBoard, tryPlace } from '../logic/rules.js';
import { toGTP, fromGTP } from '../logic/coordinates.js';
import { requestAIMove, requestHint } from '../api/relay.js';
import { saveGameToServer, loadGameFromServer, deleteGameFromServer, resetSessionId } from '../api/gameState.js';
import { initStoneSound, playStoneSound, playHintSound } from '../audio/stoneSound.js';

const BOARD_SIZE = 19;
const BLACK = 1;
const WHITE = 2;
const RANK_KEY = 'play361_rank';
const HANDICAP_KEY = 'play361_handicap';

const STAR = [3, 9, 15];

const HANDICAP_POSITIONS = {
  2: [[STAR[2], STAR[0]], [STAR[0], STAR[2]]],
  3: [[STAR[2], STAR[0]], [STAR[0], STAR[2]], [STAR[2], STAR[2]]],
  4: [[STAR[2], STAR[0]], [STAR[0], STAR[2]], [STAR[2], STAR[2]], [STAR[0], STAR[0]]],
  5: [[STAR[2], STAR[0]], [STAR[0], STAR[2]], [STAR[2], STAR[2]], [STAR[0], STAR[0]], [STAR[1], STAR[1]]],
  6: [[STAR[2], STAR[0]], [STAR[0], STAR[2]], [STAR[2], STAR[2]], [STAR[0], STAR[0]], [STAR[0], STAR[1]], [STAR[2], STAR[1]]],
  7: [[STAR[2], STAR[0]], [STAR[0], STAR[2]], [STAR[2], STAR[2]], [STAR[0], STAR[0]], [STAR[0], STAR[1]], [STAR[2], STAR[1]], [STAR[1], STAR[1]]],
  8: [[STAR[2], STAR[0]], [STAR[0], STAR[2]], [STAR[2], STAR[2]], [STAR[0], STAR[0]], [STAR[0], STAR[1]], [STAR[2], STAR[1]], [STAR[1], STAR[0]], [STAR[1], STAR[2]]],
  9: [[STAR[2], STAR[0]], [STAR[0], STAR[2]], [STAR[2], STAR[2]], [STAR[0], STAR[0]], [STAR[0], STAR[1]], [STAR[2], STAR[1]], [STAR[1], STAR[0]], [STAR[1], STAR[2]], [STAR[1], STAR[1]]],
};

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
}

function getSavedRank() {
  try { return localStorage.getItem(RANK_KEY) || '5k'; } catch (_) { return '5k'; }
}

function getSavedHandicap() {
  try { return parseInt(localStorage.getItem(HANDICAP_KEY) || '0', 10); } catch (_) { return 0; }
}

function buildPreviewBoard(handicap) {
  const board = createEmptyBoard(BOARD_SIZE);
  if (handicap > 0 && HANDICAP_POSITIONS[handicap]) {
    HANDICAP_POSITIONS[handicap].forEach(([x, y]) => { board[y][x] = BLACK; });
  }
  return board;
}

const savedHandicap = getSavedHandicap();

const INITIAL_STATE = {
  board: buildPreviewBoard(savedHandicap),
  currentColor: BLACK,
  moves: [],
  ko: null,
  lastMove: null,
  consecutivePasses: 0,
  gameOver: false,
  endReason: null,
  aiThinking: false,
  preview: null,
  rank: getSavedRank(),
  handicap: savedHandicap,
  gameStarted: false,
  error: null,
  score: null,
  hint: null,
  hintLoading: false,
  retryNotice: 0,
  history: [],
  loaded: false,
};

function serializeGameState(state) {
  return {
    board: state.board,
    currentColor: state.currentColor,
    moves: state.moves,
    ko: state.ko,
    lastMove: state.lastMove,
    consecutivePasses: state.consecutivePasses,
    gameOver: state.gameOver,
    endReason: state.endReason,
    rank: state.rank,
    handicap: state.handicap,
    gameStarted: state.gameStarted,
    history: state.history,
    score: state.score,
  };
}

function deserializeGameState(data) {
  if (!data || !data.board || !Array.isArray(data.moves)) return null;
  return {
    ...INITIAL_STATE,
    board: data.board,
    currentColor: data.currentColor,
    moves: data.moves,
    ko: data.ko,
    lastMove: data.lastMove,
    consecutivePasses: data.consecutivePasses,
    gameOver: data.gameOver,
    endReason: data.endReason || null,
    rank: data.rank,
    handicap: data.handicap || 0,
    gameStarted: data.gameStarted,
    history: data.history || [],
    score: data.score || null,
    loaded: true,
  };
}

let saveTimer = null;

function debouncedSave(state) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveGameToServer(serializeGameState(state));
  }, 1000);
}

function buildHandicapState(handicap, rank) {
  const positions = HANDICAP_POSITIONS[handicap];
  const board = createEmptyBoard(BOARD_SIZE);
  const moves = [];
  positions.forEach(([x, y]) => {
    board[y][x] = BLACK;
    moves.push({ color: BLACK, x, y });
  });
  return {
    ...INITIAL_STATE,
    board,
    moves,
    currentColor: WHITE,
    gameStarted: true,
    rank,
    handicap,
    loaded: true,
  };
}

export function useGame() {
  const [state, setState] = useState({ ...INITIAL_STATE });
  const aiThinkingRef = useRef(false);
  const lastStoneCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadGameFromServer().then((data) => {
      if (cancelled) return;
      const loaded = deserializeGameState(data);
      if (loaded) {
        setState(loaded);
      } else {
        setState((s) => ({ ...s, loaded: true }));
      }
    });
    return () => { cancelled = true; };
  }, []);

  const handicapCount = state.handicap > 0 ? state.handicap : 0;
  const stoneCount = Math.max(0, state.moves.filter((m) => !m.pass).length - handicapCount);
  const komi = state.handicap > 0 ? 0.5 : 6.5;

  useEffect(() => {
    if (stoneCount > lastStoneCountRef.current) {
      playStoneSound();
    }
    lastStoneCountRef.current = stoneCount;
  }, [stoneCount]);

  useEffect(() => {
    if (state.gameStarted && state.loaded) {
      debouncedSave(state);
    }
  }, [state.board, state.moves, state.gameOver, state.rank, state.score, state.loaded, state.gameStarted]);

  const requestAI = useCallback(async (newState) => {
    if (aiThinkingRef.current) return;
    const moveCount = newState.moves.length;
    const aiKomi = newState.handicap > 0 ? 0.5 : 6.5;
    aiThinkingRef.current = true;
    setState((s) => ({ ...s, aiThinking: true, error: null }));

    try {
      const apiMoves = newState.moves.map((m) => ({
        color: m.color === BLACK ? 'B' : 'W',
        position: m.pass ? 'pass' : toGTP(m.x, m.y, BOARD_SIZE),
      }));

      const aiResult = await requestAIMove(apiMoves, 'W', newState.rank, BOARD_SIZE, {
        onRetry: () => setState((s) => ({ ...s, retryNotice: s.retryNotice + 1 })),
        komi: aiKomi,
      });
      const scoreFromAI = aiResult.blackWinRate != null
        ? { blackWinRate: aiResult.blackWinRate, scoreLead: aiResult.scoreLead }
        : null;

      // AI 자동 기권: 200수 이상 + AI 승률 0.5% 미만
      if (moveCount >= 200 && scoreFromAI && scoreFromAI.blackWinRate > 0.995) {
        setState((prev) => {
          if (prev.moves.length !== moveCount) return { ...prev, aiThinking: false, retryNotice: 0 };
          return {
            ...prev,
            aiThinking: false,
            retryNotice: 0,
            gameOver: true,
            endReason: 'resign',
            score: scoreFromAI,
          };
        });
        return;
      }

      const lower = aiResult.move.toLowerCase();

      if (lower === 'pass' || lower === 'resign') {
        setState((prev) => {
          if (prev.moves.length !== moveCount) return { ...prev, aiThinking: false };
          const newPasses = prev.consecutivePasses + 1;
          const isResign = lower === 'resign';
          const isDoublePass = !isResign && newPasses >= 2;
          return {
            ...prev,
            moves: [...prev.moves, { color: WHITE, pass: true }],
            currentColor: BLACK,
            consecutivePasses: newPasses,
            gameOver: isResign || isDoublePass,
            endReason: isResign ? 'resign' : isDoublePass ? 'double_pass' : null,
            aiThinking: false,
            score: scoreFromAI || prev.score,
          };
        });
      } else {
        const pos = fromGTP(aiResult.move, BOARD_SIZE);
        if (!pos) {
          setState((s) => {
            if (s.moves.length !== moveCount) return { ...s, aiThinking: false };
            return { ...s, aiThinking: false, error: 'AI returned invalid move' };
          });
          return;
        }

        setState((prev) => {
          if (prev.moves.length !== moveCount) return { ...prev, aiThinking: false };
          const result = tryPlace(prev.board, pos.x, pos.y, WHITE, BOARD_SIZE, prev.ko);
          if (!result) {
            return { ...prev, aiThinking: false, error: 'AI returned illegal move' };
          }
          return {
            ...prev,
            board: result.board,
            ko: result.ko,
            lastMove: { x: pos.x, y: pos.y, color: WHITE },
            moves: [...prev.moves, { color: WHITE, x: pos.x, y: pos.y }],
            currentColor: BLACK,
            consecutivePasses: 0,
            aiThinking: false,
            score: scoreFromAI || prev.score,
          };
        });
      }
    } catch (err) {
      setState((s) => {
        if (s.moves.length !== moveCount) return { ...s, aiThinking: false };
        return { ...s, aiThinking: false, error: `AI 요청 실패: ${err.message || '알 수 없는 오류'}` };
      });
    } finally {
      aiThinkingRef.current = false;
      setState((s) => (s.retryNotice > 0 ? { ...s, retryNotice: 0 } : s));
    }
  }, []);

  useEffect(() => {
    if (state.loaded && state.gameStarted && state.currentColor === WHITE && !state.gameOver && !aiThinkingRef.current) {
      requestAI(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loaded]);

  const startHandicapGame = useCallback(() => {
    setState((s) => {
      if (s.gameStarted || s.handicap <= 0) return s;
      const newState = buildHandicapState(s.handicap, s.rank);
      setTimeout(() => requestAI(newState), 50);
      return newState;
    });
  }, [requestAI]);

  const placeDirectly = useCallback(
    (x, y) => {
      setState((s) => {
        if (s.aiThinking || s.gameOver || s.currentColor !== BLACK) return s;
        const result = tryPlace(s.board, x, y, BLACK, BOARD_SIZE, s.ko);
        if (!result) return s;

        const snapshot = { board: s.board, ko: s.ko, lastMove: s.lastMove, moves: s.moves, consecutivePasses: s.consecutivePasses, score: s.score };
        const newState = {
          ...s,
          board: result.board,
          ko: result.ko,
          lastMove: { x, y, color: BLACK },
          moves: [...s.moves, { color: BLACK, x, y }],
          currentColor: WHITE,
          consecutivePasses: 0,
          preview: null,
          gameStarted: true,
          error: null,
          hint: null,
          history: [...s.history, snapshot],
        };

        setTimeout(() => requestAI(newState), 50);
        return newState;
      });
    },
    [requestAI]
  );

  const setPreview = useCallback(
    (x, y) => {
      if (state.aiThinking || state.gameOver || state.currentColor !== BLACK)
        return;

      setState((s) => {
        if (s.preview && s.preview.x === x && s.preview.y === y) {
          return { ...s, preview: null };
        }
        const result = tryPlace(s.board, x, y, s.currentColor, BOARD_SIZE, s.ko);
        if (!result) return s;
        return { ...s, preview: { x, y }, error: null };
      });
    },
    [state.aiThinking, state.gameOver, state.currentColor]
  );

  const handleIntersection = useCallback(
    (x, y) => {
      initStoneSound();
      if (state.handicap > 0 && !state.gameStarted) {
        startHandicapGame();
        return;
      }
      if (isMobile()) {
        setPreview(x, y);
      } else {
        placeDirectly(x, y);
      }
    },
    [setPreview, placeDirectly, startHandicapGame, state.handicap, state.gameStarted]
  );

  const confirmMove = useCallback(() => {
    setState((s) => {
      if (!s.preview || s.aiThinking || s.gameOver || s.currentColor !== BLACK) return s;

      const { x, y } = s.preview;
      const result = tryPlace(s.board, x, y, BLACK, BOARD_SIZE, s.ko);
      if (!result) return { ...s, preview: null };

      const snapshot = { board: s.board, ko: s.ko, lastMove: s.lastMove, moves: s.moves, consecutivePasses: s.consecutivePasses, score: s.score };
      const newState = {
        ...s,
        board: result.board,
        ko: result.ko,
        lastMove: { x, y, color: BLACK },
        moves: [...s.moves, { color: BLACK, x, y }],
        currentColor: WHITE,
        consecutivePasses: 0,
        preview: null,
        gameStarted: true,
        hint: null,
        history: [...s.history, snapshot],
      };

      setTimeout(() => requestAI(newState), 50);
      return newState;
    });
  }, [requestAI]);

  const pass = useCallback(() => {
    setState((s) => {
      if (s.aiThinking || s.gameOver || s.currentColor !== BLACK) return s;

      const newPasses = s.consecutivePasses + 1;
      const newState = {
        ...s,
        moves: [...s.moves, { color: BLACK, pass: true }],
        currentColor: WHITE,
        consecutivePasses: newPasses,
        gameOver: newPasses >= 2,
        endReason: newPasses >= 2 ? 'double_pass' : null,
        preview: null,
        gameStarted: true,
        ko: null,
      };

      if (!newState.gameOver) {
        setTimeout(() => requestAI(newState), 50);
      }
      return newState;
    });
  }, [requestAI]);

  const getHint = useCallback(async () => {
    if (state.aiThinking || state.hintLoading || state.gameOver || state.currentColor !== BLACK) return;
    const hintMoveCount = state.moves.length;
    setState((s) => ({ ...s, hintLoading: true, error: null }));

    try {
      const apiMoves = state.moves.map((m) => ({
        color: m.color === BLACK ? 'B' : 'W',
        position: m.pass ? 'pass' : toGTP(m.x, m.y, BOARD_SIZE),
      }));

      const moveStr = await requestHint(apiMoves, BOARD_SIZE);
      const pos = fromGTP(moveStr, BOARD_SIZE);
      playHintSound();
      setState((s) => {
        if (s.moves.length !== hintMoveCount) return { ...s, hintLoading: false };
        return { ...s, hint: pos, hintLoading: false };
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        hintLoading: false,
        error: `힌트 오류: ${err.message}`,
      }));
    }
  }, [state.aiThinking, state.hintLoading, state.gameOver, state.currentColor, state.moves]);

  const undo = useCallback(() => {
    setState((s) => {
      if (s.aiThinking || s.history.length === 0) return s;
      const prev = s.history[s.history.length - 1];
      return {
        ...s,
        board: prev.board,
        ko: prev.ko,
        lastMove: prev.lastMove,
        moves: prev.moves,
        consecutivePasses: prev.consecutivePasses,
        currentColor: BLACK,
        preview: null,
        gameOver: false,
        error: null,
        score: prev.score || null,
        hint: null,
        history: s.history.slice(0, -1),
      };
    });
  }, []);

  const reset = useCallback(() => {
    initStoneSound();
    aiThinkingRef.current = false;
    deleteGameFromServer();
    resetSessionId();

    setState((s) => {
      const { rank, handicap } = s;
      if (handicap > 0 && !s.gameStarted) {
        const newState = buildHandicapState(handicap, rank);
        setTimeout(() => requestAI(newState), 50);
        return newState;
      }
      return { ...INITIAL_STATE, board: buildPreviewBoard(handicap), rank, handicap, loaded: true };
    });
  }, [requestAI]);

  const setRank = useCallback((rank) => {
    setState((s) => {
      if (s.gameStarted) return s;
      try { localStorage.setItem(RANK_KEY, rank); } catch (_) { /* 무시 */ }
      return { ...s, rank };
    });
  }, []);

  const setHandicap = useCallback((handicap) => {
    setState((s) => {
      if (s.gameStarted) return s;
      const val = parseInt(handicap, 10) || 0;
      try { localStorage.setItem(HANDICAP_KEY, String(val)); } catch (_) { /* 무시 */ }
      const board = createEmptyBoard(BOARD_SIZE);
      if (val > 0 && HANDICAP_POSITIONS[val]) {
        HANDICAP_POSITIONS[val].forEach(([x, y]) => { board[y][x] = BLACK; });
      }
      return { ...s, handicap: val, board };
    });
  }, []);

  return {
    ...state,
    moveCount: stoneCount,
    komi,
    isMobile: isMobile(),
    canUndo: state.history.length > 0 && !state.aiThinking,
    handleIntersection,
    confirmMove,
    pass,
    undo,
    reset,
    startHandicapGame,
    setRank,
    setHandicap,
    getHint,
    retryNotice: state.retryNotice,
  };
}
