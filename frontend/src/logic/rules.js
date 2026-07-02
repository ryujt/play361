const DIRS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

function inBounds(x, y, size) {
  return x >= 0 && x < size && y >= 0 && y < size;
}

function getGroup(board, x, y, size) {
  const color = board[y][x];
  if (color === 0) return { stones: [], liberties: 0 };
  const visited = new Set();
  const stones = [];
  let liberties = 0;
  const libertySet = new Set();
  const stack = [[x, y]];

  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    const key = cy * size + cx;
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push([cx, cy]);

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny, size)) continue;
      const nKey = ny * size + nx;
      if (board[ny][nx] === 0) {
        if (!libertySet.has(nKey)) {
          libertySet.add(nKey);
          liberties++;
        }
      } else if (board[ny][nx] === color && !visited.has(nKey)) {
        stack.push([nx, ny]);
      }
    }
  }

  return { stones, liberties };
}

export function tryPlace(board, x, y, color, size, koPoint) {
  if (board[y][x] !== 0) return null;

  if (koPoint && koPoint.x === x && koPoint.y === y) return null;

  const newBoard = board.map((row) => [...row]);
  newBoard[y][x] = color;

  let captured = [];
  const opponent = color === 1 ? 2 : 1;

  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny, size)) continue;
    if (newBoard[ny][nx] === opponent) {
      const group = getGroup(newBoard, nx, ny, size);
      if (group.liberties === 0) {
        for (const [gx, gy] of group.stones) {
          newBoard[gy][gx] = 0;
          captured.push([gx, gy]);
        }
      }
    }
  }

  const selfGroup = getGroup(newBoard, x, y, size);
  if (selfGroup.liberties === 0) return null;

  let newKo = null;
  if (captured.length === 1) {
    const selfGroupAfter = getGroup(newBoard, x, y, size);
    if (selfGroupAfter.stones.length === 1) {
      newKo = { x: captured[0][0], y: captured[0][1] };
    }
  }

  return { board: newBoard, captured, ko: newKo };
}

export function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}
