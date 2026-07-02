const COLUMNS = 'ABCDEFGHJKLMNOPQRST';

export function toGTP(x, y, boardSize = 19) {
  const col = COLUMNS[x];
  const row = boardSize - y;
  return `${col}${row}`;
}

export function fromGTP(gtp, boardSize = 19) {
  if (!gtp || gtp === 'pass' || gtp === 'resign') return null;
  const col = gtp[0].toUpperCase();
  const row = parseInt(gtp.slice(1), 10);
  const x = COLUMNS.indexOf(col);
  const y = boardSize - row;
  if (x < 0 || y < 0 || y >= boardSize) return null;
  return { x, y };
}
