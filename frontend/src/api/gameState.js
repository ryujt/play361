const BASE_URL = '';

const SESSION_KEY = 'play361_session_id';

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function resetSessionId() {
  localStorage.removeItem(SESSION_KEY);
}

export async function saveGameToServer(gameState) {
  const sessionId = getSessionId();
  try {
    const res = await fetch(`${BASE_URL}/api/v1/game/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, gameState }),
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  } catch (err) {
    console.error('게임 저장 실패:', err);
  }
}

export async function loadGameFromServer() {
  const sessionId = getSessionId();
  try {
    const res = await fetch(`${BASE_URL}/api/v1/game/load?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok) throw new Error(`Load failed: ${res.status}`);
    const data = await res.json();
    return data.gameState || null;
  } catch (err) {
    console.error('게임 로드 실패:', err);
    return null;
  }
}

export async function deleteGameFromServer() {
  const sessionId = getSessionId();
  try {
    const res = await fetch(`${BASE_URL}/api/v1/game?sessionId=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  } catch (err) {
    console.error('게임 삭제 실패:', err);
  }
}
