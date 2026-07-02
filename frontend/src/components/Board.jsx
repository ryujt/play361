import { useRef, useEffect, useCallback } from 'react';

const BOARD_SIZE = 19;
const STAR_POINTS = [
  [3, 3], [3, 9], [3, 15],
  [9, 3], [9, 9], [9, 15],
  [15, 3], [15, 9], [15, 15],
];

const BOARD_COLOR = '#c8a165';
const LINE_COLOR = 'rgba(60, 40, 20, 0.35)';
const STAR_COLOR = 'rgba(60, 40, 20, 0.5)';

function drawBoard(ctx, size, board, lastMove, preview, hint) {
  const padding = size * 0.04;
  const gridSize = (size - padding * 2) / (BOARD_SIZE - 1);
  const stoneRadius = gridSize * 0.47;

  ctx.fillStyle = BOARD_COLOR;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const pos = padding + i * gridSize;
    ctx.beginPath();
    ctx.moveTo(padding, pos);
    ctx.lineTo(size - padding, pos);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos, padding);
    ctx.lineTo(pos, size - padding);
    ctx.stroke();
  }

  for (const [sx, sy] of STAR_POINTS) {
    const cx = padding + sx * gridSize;
    const cy = padding + sy * gridSize;
    ctx.fillStyle = STAR_COLOR;
    ctx.beginPath();
    ctx.arc(cx, cy, gridSize * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const color = board[y][x];
      if (color === 0) continue;
      const cx = padding + x * gridSize;
      const cy = padding + y * gridSize;
      drawStone(ctx, cx, cy, stoneRadius, color);
    }
  }

  if (lastMove) {
    const cx = padding + lastMove.x * gridSize;
    const cy = padding + lastMove.y * gridSize;
    const markerColor = lastMove.color === 1 ? '#FFFFFF' : '#000000';
    ctx.strokeStyle = markerColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, stoneRadius * 0.35, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (hint && (!preview || hint.x !== preview.x || hint.y !== preview.y)) {
    const cx = padding + hint.x * gridSize;
    const cy = padding + hint.y * gridSize;
    ctx.strokeStyle = '#59de9b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, stoneRadius * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(89, 222, 155, 0.2)';
    ctx.beginPath();
    ctx.arc(cx, cy, stoneRadius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (preview) {
    const cx = padding + preview.x * gridSize;
    const cy = padding + preview.y * gridSize;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#666666';
    ctx.beginPath();
    ctx.arc(cx, cy, stoneRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

function drawStone(ctx, cx, cy, r, color) {
  const grad = ctx.createRadialGradient(
    cx - r * 0.3,
    cy - r * 0.3,
    r * 0.1,
    cx,
    cy,
    r
  );

  if (color === 1) {
    grad.addColorStop(0, '#4A4A4A');
    grad.addColorStop(1, '#1A1A1A');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(1, '#E0E0E0');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

export default function Board({ board, lastMove, preview, hint, onIntersection }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const getCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    return canvas.width / (window.devicePixelRatio || 1);
  }, []);

  const handleInteraction = useCallback(
    (e) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      let clientX, clientY;
      if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      } else if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const rect = canvas.getBoundingClientRect();
      const cssSize = rect.width;
      const px = clientX - rect.left;
      const py = clientY - rect.top;

      const padding = cssSize * 0.04;
      const gridSize = (cssSize - padding * 2) / (BOARD_SIZE - 1);

      const x = Math.round((px - padding) / gridSize);
      const y = Math.round((py - padding) / gridSize);

      if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
        onIntersection(x, y);
      }
    },
    [onIntersection]
  );

  const sizeRef = useRef(0);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const cssSize = Math.min(containerWidth, containerHeight);
    if (cssSize <= 0) return;

    sizeRef.current = cssSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    drawBoard(ctx, cssSize, board, lastMove, preview, hint);
  }, [board, lastMove, preview, hint]);

  useEffect(() => {
    paint();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(paint);
    observer.observe(container);
    return () => observer.disconnect();
  }, [paint]);

  return (
    <div ref={containerRef} className="board-container">
      <div className="board-outer">
        <canvas
          ref={canvasRef}
          className="board-canvas"
          onClick={handleInteraction}
          onTouchEnd={handleInteraction}
        />
      </div>
    </div>
  );
}
