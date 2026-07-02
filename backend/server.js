import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { validateGenmoveRequest, validateScoreRequest } from './validator.mjs';
import { sendToKataGo } from './katago-client.mjs';
import { saveGameState, loadGameState, deleteGameState } from './game-store.mjs';

const PORT = Number(process.env.PORT || 4100);

function sendJSON(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  console.log(`${method} ${path}`);

  // --- Health ---
  if (method === 'GET' && path === '/api/v1/health') {
    return sendJSON(res, 200, { status: 'ok' });
  }

  // --- Analytics (local stub: CloudFront log aggregation is AWS-only) ---
  if (method === 'GET' && path === '/api/v1/analytics') {
    return sendJSON(res, 200, {
      data: [],
      summary: { totalDays: 0, totalVisitors: 0, totalRequests: 0, averageVisitorsPerDay: 0 },
      topUrls: [],
      timestamp: new Date().toISOString(),
    });
  }

  // --- Game State: Save ---
  if (method === 'POST' && path === '/api/v1/game/save') {
    const body = await readBody(req);
    if (!body) return sendJSON(res, 400, { error: 'Invalid JSON body' });

    const { sessionId, gameState } = body;
    if (!sessionId || typeof sessionId !== 'string') {
      return sendJSON(res, 400, { error: 'sessionId is required' });
    }
    if (!gameState || typeof gameState !== 'object') {
      return sendJSON(res, 400, { error: 'gameState is required' });
    }

    try {
      await saveGameState(sessionId, gameState);
      return sendJSON(res, 200, { success: true });
    } catch (err) {
      console.error('Error saving game state:', err);
      return sendJSON(res, 500, { error: 'Failed to save game state' });
    }
  }

  // --- Game State: Load ---
  if (method === 'GET' && path === '/api/v1/game/load') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      return sendJSON(res, 400, { error: 'sessionId query parameter is required' });
    }

    try {
      const gameState = await loadGameState(sessionId);
      return sendJSON(res, 200, { gameState });
    } catch (err) {
      console.error('Error loading game state:', err);
      return sendJSON(res, 500, { error: 'Failed to load game state' });
    }
  }

  // --- Game State: Delete ---
  if (method === 'DELETE' && path === '/api/v1/game') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      return sendJSON(res, 400, { error: 'sessionId query parameter is required' });
    }

    try {
      await deleteGameState(sessionId);
      return sendJSON(res, 200, { success: true });
    } catch (err) {
      console.error('Error deleting game state:', err);
      return sendJSON(res, 500, { error: 'Failed to delete game state' });
    }
  }

  // --- AI Move ---
  if (method === 'POST' && path === '/api/v1/genmove') {
    const body = await readBody(req);
    if (!body) return sendJSON(res, 400, { error: 'Invalid JSON body' });

    const validationError = validateGenmoveRequest(body);
    if (validationError) return sendJSON(res, 400, { error: validationError });

    const payload = {
      request_id: randomUUID(),
      board_size: body.board_size,
      komi: body.komi,
      moves: body.moves,
      color_to_play: body.color_to_play,
      rank: body.rank || null,
    };

    try {
      const response = await sendToKataGo(payload);
      return sendJSON(res, 200, response);
    } catch (err) {
      console.error('Error processing genmove:', err);
      return sendJSON(res, 500, { error: err.message });
    }
  }

  // --- Score ---
  if (method === 'POST' && path === '/api/v1/score') {
    const body = await readBody(req);
    if (!body) return sendJSON(res, 400, { error: 'Invalid JSON body' });

    const validationError = validateScoreRequest(body);
    if (validationError) return sendJSON(res, 400, { error: validationError });

    const payload = {
      request_id: randomUUID(),
      type: 'score',
      board_size: body.board_size,
      komi: body.komi,
      moves: body.moves,
    };

    try {
      const response = await sendToKataGo(payload);
      return sendJSON(res, 200, response);
    } catch (err) {
      console.error('Error processing score:', err);
      return sendJSON(res, 500, { error: err.message });
    }
  }

  return sendJSON(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('Unhandled error:', err);
    sendJSON(res, 500, { error: 'Internal server error' });
  });
});

server.listen(PORT, () => {
  console.log(`backend listening on http://localhost:${PORT}`);
});
