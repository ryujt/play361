const BASE_URL = '';

const REQUEST_TIMEOUT = 65000;

async function fetchOnce(url, body, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  // 외부 signal이 있으면 연동
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Request failed');
    return data;
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

const MAX_RETRIES = 4;

export async function requestAIMove(moves, colorToPlay, rank, boardSize = 19, { onRetry, signal, komi = 6.5 } = {}) {
  const body = { board_size: boardSize, komi, moves, color_to_play: colorToPlay, rank };
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const data = await fetchOnce(`${BASE_URL}/api/v1/genmove`, body, signal);
      return {
        move: data.move,
        blackWinRate: data.black_win_rate ?? null,
        scoreLead: data.score_lead ?? null,
      };
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError' && signal?.aborted) throw err;
      if (attempt < MAX_RETRIES) {
        onRetry?.(attempt + 1);
      }
    }
  }
  throw lastError;
}

export async function requestHint(moves, boardSize = 19) {
  const body = { board_size: boardSize, komi: 6.5, moves, color_to_play: 'B', rank: '7d' };
  let lastError;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const data = await fetchOnce(`${BASE_URL}/api/v1/genmove`, body);
      return data.move;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function requestScore(moves, boardSize = 19) {
  const body = { board_size: boardSize, komi: 6.5, moves };
  const data = await fetchOnce(`${BASE_URL}/api/v1/score`, body);
  return { blackWinRate: data.black_win_rate, scoreLead: data.score_lead };
}
