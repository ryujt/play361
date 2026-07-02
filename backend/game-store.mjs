import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

// Local file-based game state store. Replaces the DynamoDB table of the
// original relay: each session's game state is one JSON file under DATA_DIR.
const DATA_DIR = process.env.GAME_DATA_DIR || path.join(process.cwd(), 'data', 'games');

// sessionIds are client-generated UUIDs; restrict to safe characters so the
// value can never escape DATA_DIR via path traversal.
function fileFor(sessionId) {
  if (!/^[A-Za-z0-9-]+$/.test(sessionId)) {
    throw new Error('invalid sessionId');
  }
  return path.join(DATA_DIR, `${sessionId}.json`);
}

export async function saveGameState(sessionId, gameState) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(fileFor(sessionId), JSON.stringify({ gameState }), 'utf8');
}

export async function loadGameState(sessionId) {
  try {
    const raw = await readFile(fileFor(sessionId), 'utf8');
    return JSON.parse(raw).gameState || null;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function deleteGameState(sessionId) {
  try {
    await unlink(fileFor(sessionId));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}
