const KATAGO_SERVER_URL = process.env.KATAGO_SERVER_URL || 'http://localhost:8789';

// sendToKataGo forwards a request to the local katago-server and returns its
// MoveResponse. This replaces the SQS enqueue + DynamoDB poll of the original
// AWS relay: the katago-server responds synchronously over HTTP.
export async function sendToKataGo(payload) {
  const res = await fetch(`${KATAGO_SERVER_URL}/genmove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`katago-server error: ${res.status}`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'KataGo processing failed');
  }
  return data;
}
